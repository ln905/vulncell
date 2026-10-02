const express = require('express');
const fs = require('fs');
const path = require('path');
const prisma = require('../prisma');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { updateProfileSchema } = require('../schemas');
const { DISCLOSED_STATES, PUBLIC_STATES, isDisclosed } = require('../services/stateMachine');
const { getSignal } = require('../services/reputation');
const { cacheGet, cacheSet } = require('../redis');

const router = express.Router();

const STATS_TTL_SECONDS = 60;

// Ảnh anonymous mặc định (đọc 1 lần lúc khởi động) — trả về khi user chưa upload avatar,
// để trình duyệt nhận 200 thay vì 404 (console sạch).
const DEFAULT_AVATAR = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'anonymous.png'));

// PATCH /api/users/me — profile editor: cập nhật avatar + bio của chính mình.
// Gửi null/chuỗi rỗng để xoá; body bị zod chặn nếu avatar không phải data URL hoặc bio quá 160 ký tự.
router.patch('/me', authenticate, validate(updateProfileSchema), async (req, res, next) => {
  try {
    const data = {};
    if ('avatar' in req.body) data.avatar = req.body.avatar || null;
    if ('bio' in req.body) data.bio = req.body.bio || null;
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: { id: true, username: true, role: true, avatar: true, bio: true },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:username/avatar — trả ảnh đại diện dạng nhị phân (nhẹ, cache được).
// Chưa upload avatar -> trả luôn ảnh anonymous mặc định với 200 (tránh 404 đỏ trong console).
router.get('/:username/avatar', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username.toLowerCase() },
      select: { avatar: true },
    });
    const match = user?.avatar ? /^data:([^;]+);base64,(.+)$/.exec(user.avatar) : null;
    if (!match) {
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=60');
      return res.send(DEFAULT_AVATAR);
    }
    res.set('Content-Type', match[1]);
    res.set('Cache-Control', 'public, max-age=300');
    res.send(Buffer.from(match[2], 'base64'));
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:username — Profile.
// Stats: reputation đọc từ cột denormalized (không aggregate ledger);
// signal + tổng bounty cache Redis 60s — xoá cache khi admin action (routes/reports.js).
// Privacy: khách/hacker khác chỉ thấy report disclosed; chủ nick/admin thấy hết.
router.get('/:username', optionalAuthenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username.toLowerCase() },
      select: { id: true, username: true, role: true, createdAt: true, reputation: true, avatar: true, bio: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isOwner = req.user?.id === user.id;
    const isAdmin = req.user?.role === 'ADMIN';
    const canSeeAll = isOwner || isAdmin;

    // Thống kê: đọc cache trước, miss thì tính + ghi lại
    const statsKey = `user:stats:${user.id}`;
    let stats = null;
    const cachedStats = await cacheGet(statsKey);
    if (cachedStats) {
      try {
        stats = JSON.parse(cachedStats);
      } catch {
        stats = null;
      }
    }
    if (!stats) {
      const [signal, bountyAgg] = await Promise.all([
        getSignal(user.id),
        prisma.report.aggregate({
          where: { reporterId: user.id, bounty: { not: null } },
          _sum: { bounty: true },
        }),
      ]);
      stats = { reputation: user.reputation, signal, totalBounty: bountyAgg._sum.bounty || 0 };
      await cacheSet(statsKey, JSON.stringify(stats), STATS_TTL_SECONDS);
    }

    const reports = await prisma.report.findMany({
      where: {
        reporterId: user.id,
        // Riêng tư: người ngoài chỉ thấy state công khai (đã disclosed, KHÔNG gồm SPAM)
        ...(canSeeAll ? {} : { state: { in: PUBLIC_STATES } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { reporter: { select: { username: true } } },
    });

    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      avatar: user.avatar,
      bio: user.bio,
      ...stats,
      isOwner,
      reports: reports.map((r) => ({ ...r, isPrivate: !isDisclosed(r.state) || r.state === 'SPAM' })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
