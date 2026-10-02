const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

// Tên cookie phiên — cấu hình được để dev (:5173) và demo (:8080) không ghi đè
// cookie của nhau trên cùng host `localhost` (cookie KHÔNG phân biệt port, mà 2 stack
// dùng JWT_SECRET khác nhau nên token của stack này sẽ bị stack kia coi là không hợp lệ).
const COOKIE_NAME = process.env.COOKIE_NAME || 'token';

async function loadUserFromToken(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  return user ? { id: user.id, username: user.username, role: user.role, avatar: user.avatar } : null;
}

// Đọc token từ cookie httpOnly, xác thực, gắn req.user. Không có -> 401.
async function authenticate(req, res, next) {
  try {
    const user = await loadUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Như authenticate nhưng KHÔNG chặn nếu chưa đăng nhập (dùng cho GET công khai
// cần biết người xem là ai — ví dụ trang Profile).
async function optionalAuthenticate(req, res, next) {
  try {
    req.user = (await loadUserFromToken(req)) || null;
  } catch {
    req.user = null;
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { authenticate, optionalAuthenticate, requireRole, COOKIE_NAME };
