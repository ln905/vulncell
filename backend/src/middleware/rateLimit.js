const { cacheGet, cacheSet, cacheDel, incrWithTtl, getTtl } = require('../redis');
const { getSignal, dailyLimitForSignal, SIGNAL_GOOD } = require('../services/reputation');
const prisma = require('../prisma');
const HttpError = require('../lib/httpError');

const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_SECONDS = 60;
const LOGIN_BLOCK_SECONDS = 15 * 60;

function rateLimitDisabled() {
  return String(process.env.RATE_LIMIT_DISABLED).toLowerCase() === 'true';
}

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function loginKeys(req, username) {
  const id = `${clientIp(req)}:${username.toLowerCase()}`;
  return { fail: `login:fail:${id}`, block: `login:block:${id}` };
}

// Gọi trước khi kiểm tra mật khẩu. Ném 429 nếu IP+username đang bị khóa.
async function assertLoginAllowed(req, username) {
  if (rateLimitDisabled()) return;
  const { block } = loginKeys(req, username);
  const remaining = await getTtl(block);
  if (remaining > 0) {
    throw new HttpError(
      429,
      `Too many failed login attempts. Try again in ${Math.ceil(remaining / 60)} minute(s)`
    );
  }
}

// Gọi khi sai mật khẩu: 5 lần trong 1 phút -> khóa 15 phút.
async function recordLoginFailure(req, username) {
  if (rateLimitDisabled()) return;
  const { fail, block } = loginKeys(req, username);
  const count = await incrWithTtl(fail, LOGIN_WINDOW_SECONDS);
  if (count !== null && count >= LOGIN_MAX_FAILURES) {
    await cacheSet(block, '1', LOGIN_BLOCK_SECONDS);
    await cacheDel(fail);
  }
}

async function clearLoginFailures(req, username) {
  if (rateLimitDisabled()) return;
  const { fail } = loginKeys(req, username);
  await cacheDel(fail);
}

// ---------- Giới hạn nộp report theo Signal ----------

function utcDayStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function secondsUntilUtcMidnight(now = new Date()) {
  const nextMidnight = utcDayStart(new Date(now.getTime() + 24 * 3600 * 1000));
  return Math.max(1, Math.floor((nextMidnight.getTime() - now.getTime()) / 1000));
}

function submitCountKey(userId, now = new Date()) {
  return `submit:count:${userId}:${utcDayStart(now).toISOString().slice(0, 10)}`;
}

// Đếm nhanh bằng Redis; miss thì đếm từ DB rồi cache lại tới hết ngày UTC.
async function getUsedToday(userId) {
  const key = submitCountKey(userId);
  const cached = await cacheGet(key);
  if (cached !== null) return Number(cached) || 0;

  const fromDb = await prisma.report.count({
    where: { reporterId: userId, createdAt: { gte: utcDayStart() } },
  });
  await cacheSet(key, String(fromDb), secondsUntilUtcMidnight());
  return fromDb;
}

// Ném HttpError 429 nếu đã dùng hết quota trong ngày.
async function assertCanSubmit(userId) {
  if (rateLimitDisabled()) return { signal: null, limit: Infinity, used: 0 };

  const signal = await getSignal(userId);
  const limit = dailyLimitForSignal(signal);
  const used = await getUsedToday(userId);

  if (used >= limit) {
    const detail =
      limit === 0
        ? `Your signal is negative (${signal}) — submissions are temporarily blocked.`
        : `Daily submission limit reached (${used}/${limit} today, Signal ${signal} < ${SIGNAL_GOOD}).`;
    throw new HttpError(429, `${detail} Try again after 00:00 UTC.`);
  }
  return { signal, limit, used };
}

async function recordSubmit(userId) {
  if (rateLimitDisabled()) return;
  await incrWithTtl(submitCountKey(userId), secondsUntilUtcMidnight());
}

// ---------- Rate limit tổng quát theo IP cho toàn bộ /api (chống spam/DoS) ----------
// Hai lớp con phía trên (login theo IP+username, submit theo Signal) vẫn giữ nguyên;
// lớp này chặn ở tầng HTTP: mỗi IP chỉ được tối đa N request / cửa sổ thời gian.
const API_LIMIT_MAX = Number(process.env.RATE_LIMIT_API_MAX || 300);
const API_LIMIT_WINDOW_SECONDS = Number(process.env.RATE_LIMIT_API_WINDOW || 60);

// Fixed-window đơn giản: key = IP + số thứ tự khung thời gian
async function apiRateLimit(req, res, next) {
  if (rateLimitDisabled()) return next();
  try {
    const windowId = Math.floor(Date.now() / (API_LIMIT_WINDOW_SECONDS * 1000));
    const key = `api:${clientIp(req)}:${windowId}`;
    const count = await incrWithTtl(key, API_LIMIT_WINDOW_SECONDS + 5);
    if (count === null) return next(); // Redis chết -> fail-open
    if (count > API_LIMIT_MAX) {
      const retry = API_LIMIT_WINDOW_SECONDS - Math.floor((Date.now() / 1000) % API_LIMIT_WINDOW_SECONDS);
      res.set('Retry-After', String(retry));
      return res.status(429).json({ error: `Too many requests — try again in about ${retry}s.` });
    }
  } catch {
    /* fail-open */
  }
  next();
}

module.exports = {
  assertLoginAllowed,
  recordLoginFailure,
  clearLoginFailures,
  assertCanSubmit,
  recordSubmit,
  apiRateLimit,
};
