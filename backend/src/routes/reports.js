const express = require('express');
const prisma = require('../prisma');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createReportSchema, actionSchema, SEVERITIES } = require('../schemas');
const { sanitizeMarkdown, sanitizePlainText } = require('../services/sanitize');
const {
  DISCLOSED_STATES,
  ALL_STATES,
  isDisclosed,
  assertActionAllowed,
  pointsForState,
} = require('../services/stateMachine');
const { assertCanSubmit, recordSubmit } = require('../middleware/rateLimit');
const { cacheGet, cacheSet, cacheDel, incrWithTtl } = require('../redis');
const HttpError = require('../lib/httpError');

const router = express.Router();

// Danh sách report + facets được cache trong Redis theo "phiên bản dữ liệu".
// Mỗi khi có ghi (tạo report / action) thì tăng version -> key cũ tự bị bỏ qua.
async function bumpReportsVersion() {
  await incrWithTtl('reports:version', 0);
}

const LIST_CACHE_TTL_SECONDS = 30;
const FACETS_CACHE_TTL_SECONDS = 30;
const WEAKNESS_CACHE_TTL_SECONDS = 30;

// ---------------------------------------------------------------------------
// Bộ lọc dùng chung cho GET /reports và GET /reports/facets
// ---------------------------------------------------------------------------

// Chuẩn hoá + validate query string. Trả { filters } hoặc { error } (lỗi 400).
function parseReportFilters(query) {
  const filters = {};

  if (query.q !== undefined && String(query.q).trim() !== '') {
    filters.q = String(query.q).trim().slice(0, 200);
  }

  if (query.severity !== undefined && query.severity !== '') {
    if (!SEVERITIES.includes(query.severity)) {
      return { error: `severity must be one of: ${SEVERITIES.join(', ')}` };
    }
    filters.severity = query.severity;
  }

  if (query.state !== undefined && query.state !== '') {
    if (!ALL_STATES.includes(query.state)) {
      return { error: `state must be one of: ${ALL_STATES.join(', ')}` };
    }
    filters.state = query.state;
  }

  if (query.weakness !== undefined && String(query.weakness).trim() !== '') {
    filters.weakness = String(query.weakness).trim().slice(0, 100);
  }

  if (query.disclosed === 'true' || query.disclosed === 'false') {
    filters.disclosed = query.disclosed === 'true';
  }

  for (const key of ['bountyMin', 'bountyMax']) {
    if (query[key] !== undefined && query[key] !== '') {
      const n = Number(query[key]);
      if (!Number.isInteger(n) || n < 0) return { error: `${key} must be an integer >= 0` };
      filters[key] = n;
    }
  }

  return { filters };
}

// `exclude` dùng cho facets: bỏ chiều đang được đếm để số liệu không tự triệt tiêu
function buildReportWhere(filters, exclude = []) {
  const where = {};

  if (!exclude.includes('state')) {
    if (filters.state) {
      where.state = filters.state;
    } else if (filters.disclosed !== undefined) {
      where.state = filters.disclosed ? { in: DISCLOSED_STATES } : { notIn: DISCLOSED_STATES };
    }
  }

  if (!exclude.includes('severity') && filters.severity) where.severity = filters.severity;

  if (!exclude.includes('weakness') && filters.weakness) {
    where.weakness = { equals: filters.weakness, mode: 'insensitive' };
  }

  if (!exclude.includes('bounty') && (filters.bountyMin !== undefined || filters.bountyMax !== undefined)) {
    where.bounty = {};
    if (filters.bountyMin !== undefined) where.bounty.gte = filters.bountyMin;
    if (filters.bountyMax !== undefined) where.bounty.lte = filters.bountyMax;
  }

  if (filters.q) {
    where.OR = [
      { weakness: { contains: filters.q, mode: 'insensitive' } },
      { shortDescription: { contains: filters.q, mode: 'insensitive' } },
      { target: { contains: filters.q, mode: 'insensitive' } },
    ];
  }

  return where;
}

// ---------------------------------------------------------------------------
// GET /api/reports — danh sách + tìm kiếm
// ---------------------------------------------------------------------------
// SPAM là riêng tư: khách & hacker khác không thấy; chủ nick và admin thấy.
function canViewReport(report, viewer) {
  if (report.state !== 'SPAM') return true;
  if (!viewer) return false;
  return viewer.role === 'ADMIN' || viewer.id === report.reporterId;
}

// Điều kiện lọc SPAM cho danh sách/facets: admin thấy hết; chủ nick thấy spam của mình; còn lại ẩn.
function spamVisibility(viewer) {
  if (viewer?.role === 'ADMIN') return null;
  if (viewer) return { OR: [{ state: { not: 'SPAM' } }, { state: 'SPAM', reporterId: viewer.id }] };
  return { state: { not: 'SPAM' } };
}

function viewerTagOf(viewer) {
  return viewer?.role === 'ADMIN' ? 'admin' : viewer ? `u_${viewer.id}` : 'guest';
}

router.get('/', optionalAuthenticate, async (req, res, next) => {
  try {
    const { filters, error } = parseReportFilters(req.query);
    if (error) return res.status(400).json({ error });

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const sort = req.query.sort === 'oldest' ? 'asc' : 'desc';

    const viewer = req.user;
    const isAdmin = viewer?.role === 'ADMIN';

    // Điều kiện riêng tư của SPAM (admin không bị giới hạn)
    const visibility = spamVisibility(viewer);

    const andParts = [];

    // Keyset pagination (chỉ khi sort mới nhất): cursor = "<createdAt ISO>_<id>"
    let skip = (page - 1) * pageSize;
    let cursorParam = null;
    if (sort === 'desc' && req.query.cursor) {
      const cursor = String(req.query.cursor);
      const sep = cursor.lastIndexOf('_');
      const ts = new Date(cursor.slice(0, sep));
      const id = cursor.slice(sep + 1);
      if (Number.isNaN(ts.getTime()) || !id) {
        return res.status(400).json({ error: 'invalid cursor' });
      }
      andParts.push({ OR: [{ createdAt: { lt: ts } }, { createdAt: ts, id: { lt: id } }] });
      skip = 0;
      cursorParam = cursor;
    }
    if (visibility) andParts.push(visibility);

    const baseWhere = buildReportWhere(filters);
    const where = andParts.length > 0 ? { AND: [baseWhere, ...andParts] } : baseWhere;

    // Đọc cache trước; miss thì query Postgres rồi ghi lại (TTL ngắn + version key)
    // Cache tách theo người xem: khách / từng user / admin có thể thấy kết quả khác nhau.
    const viewerTag = viewerTagOf(viewer);
    const version = (await cacheGet('reports:version')) ?? '0';
    const cacheKey = `reports:v2:${version}:${viewerTag}:${JSON.stringify({ ...filters, sort, page, pageSize, cursor: cursorParam })}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const reports = await prisma.report.findMany({
      where,
      orderBy: [{ createdAt: sort }, { id: sort }],
      skip,
      take: pageSize,
      include: { reporter: { select: { username: true } } },
    });

    await cacheSet(cacheKey, JSON.stringify(reports), LIST_CACHE_TTL_SECONDS);
    res.json(reports);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/reports/facets — số lượng theo từng filter (chỉ trả giá trị đang có)
// Phải khai báo TRƯỚC /:id để không bị route động nuốt.
// ---------------------------------------------------------------------------
const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];

router.get('/facets', optionalAuthenticate, async (req, res, next) => {
  try {
    const { filters, error } = parseReportFilters(req.query);
    if (error) return res.status(400).json({ error });

    // Facets cũng theo quy tắc riêng tư: người không có quyền không thấy số đếm SPAM
    const viewer = req.user;
    const visibility = spamVisibility(viewer);
    const withVis = (where) => (visibility ? { AND: [where, visibility] } : where);

    const cacheKey = `facets:v2:${viewerTagOf(viewer)}:${JSON.stringify(filters)}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const [severitiesRaw, statesRaw, bountyAgg, total] = await Promise.all([
      prisma.report.groupBy({
        by: ['severity'],
        where: withVis(buildReportWhere(filters, ['severity'])),
        _count: { _all: true },
      }),
      prisma.report.groupBy({
        by: ['state'],
        where: withVis(buildReportWhere(filters, ['state'])),
        _count: { _all: true },
      }),
      prisma.report.aggregate({
        where: withVis(buildReportWhere(filters, ['bounty'])),
        _min: { bounty: true },
        _max: { bounty: true },
      }),
      prisma.report.count({ where: withVis(buildReportWhere(filters)) }),
    ]);

    const payload = {
      total,
      severities: severitiesRaw
        .map((r) => ({ value: r.severity, count: r._count._all }))
        .sort((a, b) => SEVERITY_ORDER.indexOf(a.value) - SEVERITY_ORDER.indexOf(b.value)),
      states: statesRaw
        .map((r) => ({ value: r.state, count: r._count._all }))
        .sort((a, b) => ALL_STATES.indexOf(a.value) - ALL_STATES.indexOf(b.value)),
      bounty: { min: bountyAgg._min.bounty, max: bountyAgg._max.bounty },
    };

    await cacheSet(cacheKey, JSON.stringify(payload), FACETS_CACHE_TTL_SECONDS);
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/reports/weaknesses — gợi ý weakness đang tồn tại trong dữ liệu
// Query: search (tên weakness), + các filter khác để thu hẹp phạm vi
// ---------------------------------------------------------------------------
router.get('/weaknesses', optionalAuthenticate, async (req, res, next) => {
  try {
    const { filters, error } = parseReportFilters(req.query);
    if (error) return res.status(400).json({ error });

    const search = String(req.query.search || '').trim().slice(0, 100);

    const viewer = req.user;
    const visibility = spamVisibility(viewer);

    const cacheKey = `weakopt:v2:${viewerTagOf(viewer)}:${JSON.stringify({ filters, search })}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const where = buildReportWhere(filters, ['weakness']);
    if (search) where.weakness = { contains: search, mode: 'insensitive' };

    const rows = await prisma.report.groupBy({
      by: ['weakness'],
      where: visibility ? { AND: [where, visibility] } : where,
      _count: { _all: true },
    });

    const payload = rows
      .map((r) => ({ value: r.weakness, count: r._count._all }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .slice(0, 20);

    await cacheSet(cacheKey, JSON.stringify(payload), WEAKNESS_CACHE_TTL_SECONDS);
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/reports — tạo case mới (giới hạn theo Signal)
// ---------------------------------------------------------------------------
router.post('/', authenticate, validate(createReportSchema), async (req, res, next) => {
  try {
    const { target, weakness, cveId, shortDescription, details } = req.body;
    await assertCanSubmit(req.user.id);

    const cleanDetails = sanitizeMarkdown(details);

    const report = await prisma.$transaction(async (tx) => {
      const r = await tx.report.create({
        data: {
          reporterId: req.user.id,
          target: sanitizePlainText(target),
          weakness: sanitizePlainText(weakness),
          cveId: cveId ? sanitizePlainText(cveId) : null,
          shortDescription: sanitizePlainText(shortDescription),
          details: cleanDetails,
          state: 'PENDING',
        },
      });
      await tx.reportEvent.create({
        data: {
          reportId: r.id,
          actorId: req.user.id,
          type: 'SUBMITTED',
          content: cleanDetails,
        },
      });
      return r;
    });

    await recordSubmit(req.user.id);
    await bumpReportsVersion();
    res.status(201).json(report);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', optionalAuthenticate, async (req, res, next) => {
  try {
    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
      include: { reporter: { select: { username: true, role: true } } },
    });
    if (!report || !canViewReport(report, req.user)) return res.status(404).json({ error: 'Not found' });
    res.json(report);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/events', optionalAuthenticate, async (req, res, next) => {
  try {
    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
      select: { state: true, reporterId: true },
    });
    if (!report || !canViewReport(report, req.user)) return res.status(404).json({ error: 'Not found' });

    const events = await prisma.reportEvent.findMany({
      where: { reportId: req.params.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { actor: { select: { username: true, role: true } } },
    });
    res.json(events);
  } catch (err) {
    next(err);
  }
});

// POST /api/reports/:id/actions — Action Box (1 transaction cho mọi thay đổi)
router.post('/:id/actions', authenticate, validate(actionSchema), async (req, res, next) => {
  try {
    const { comment, newState, severity, bountyAmount } = req.body;
    const isAdmin = req.user.role === 'ADMIN';

    if ((newState || severity || bountyAmount) && !isAdmin) {
      return res.status(403).json({ error: 'Only admin can change state, severity or bounty' });
    }

    const cleanComment = comment ? sanitizeMarkdown(comment) : null;

    const result = await prisma.$transaction(async (tx) => {
      const report = await tx.report.findUnique({ where: { id: req.params.id } });
      if (!report) throw new HttpError(404, 'Report not found');

      assertActionAllowed(report, { newState, severity, bountyAmount });

      const enteringDisclosed = Boolean(newState) && isDisclosed(newState) && !isDisclosed(report.state);

      const updates = {};
      if (newState) updates.state = newState;
      if (severity) updates.severity = severity;
      if (bountyAmount) updates.bounty = bountyAmount;
      if (enteringDisclosed) updates.disclosedAt = new Date();
      if (Object.keys(updates).length > 0) {
        await tx.report.update({ where: { id: report.id }, data: updates });
      }

      // Ghi timeline theo đúng thứ tự trong cùng một action (mốc +1ms để sort ổn định)
      const base = Date.now();
      let tick = 0;

      if (cleanComment && !newState) {
        // Chỉ tạo block COMMENT khi hành động KHÔNG kèm đổi state.
        // Nếu có đổi state, nội dung comment nằm luôn trong block STATE_CHANGE
        // để timeline không bị trùng 2 tin cùng nội dung.
        await tx.reportEvent.create({
          data: {
            reportId: report.id,
            actorId: req.user.id,
            type: 'COMMENT',
            content: cleanComment,
            createdAt: new Date(base + tick++),
          },
        });
      }

      if (newState) {
        await tx.reportEvent.create({
          data: {
            reportId: report.id,
            actorId: req.user.id,
            type: 'STATE_CHANGE',
            fromState: report.state,
            toState: newState,
            content: cleanComment,
            createdAt: new Date(base + tick++),
          },
        });
      }

      if (enteringDisclosed) {
        const points = pointsForState(newState);
        await tx.reputationLedger.create({
          data: {
            userId: report.reporterId,
            points,
            reason: newState,
            createdAt: new Date(base + tick++),
          },
        });
        // Denormalized: cập nhật cùng transaction -> User.reputation luôn khớp ledger
        await tx.user.update({
          where: { id: report.reporterId },
          data: { reputation: { increment: points } },
        });
      }

      if (bountyAmount) {
        await tx.reportEvent.create({
          data: {
            reportId: report.id,
            actorId: req.user.id,
            type: 'BOUNTY',
            bountyAmount,
            createdAt: new Date(base + tick++),
          },
        });
      }

      return tx.report.findUnique({
        where: { id: report.id },
        include: { reporter: { select: { username: true, role: true } } },
      });
    });

    // Điểm/thống kê thay đổi -> xoá cache leaderboard + stats của reporter
    await cacheDel('lb:reputation', 'lb:signal', `user:stats:${result.reporterId}`);
    await bumpReportsVersion();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
