const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const { authenticate, COOKIE_NAME } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { registerSchema, loginSchema } = require('../schemas');
const { getSignal } = require('../services/reputation');
const {
  assertLoginAllowed,
  recordLoginFailure,
  clearLoginFailures,
} = require('../middleware/rateLimit');

const router = express.Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.COOKIE_SECURE === 'true', // bật khi deploy có HTTPS
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// Đăng ký — KHÔNG BAO GIỜ nhận role từ client, luôn tạo HACKER.
// (zod tự bỏ qua field lạ như "role" nên gửi lên cũng vô tác dụng)
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, email, passwordHash, role: 'HACKER' },
    });
    res.status(201).json({ id: user.id, username: user.username, role: user.role });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    next(err);
  }
});

// Đăng nhập bằng email hoặc username. Sai 5 lần/phút -> khóa 15 phút (429).
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const identifier = req.body.email || req.body.username || req.body.identifier;
    await assertLoginAllowed(req, identifier);

    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
    });
    const ok = user && (await bcrypt.compare(req.body.password, user.passwordHash));

    if (!ok) {
      await recordLoginFailure(req, identifier);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await clearLoginFailures(req, identifier);
    const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.json({ id: user.id, username: user.username, role: user.role });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

// /auth/me kèm signal — frontend dùng để làm mờ nút Submit khi Signal âm (bị khóa nộp).
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const signal = await getSignal(req.user.id);
    res.json({ ...req.user, signal });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
