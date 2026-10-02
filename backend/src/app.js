const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const compression = require('compression');

const authRoutes = require('./routes/auth');
const reportRoutes = require('./routes/reports');
const leaderboardRoutes = require('./routes/leaderboard');
const userRoutes = require('./routes/users');
const { apiRateLimit } = require('./middleware/rateLimit');

const app = express();

// Tin đúng 1 lớp proxy (nginx trong bản Docker) -> req.ip là IP thật của client
app.set('trust proxy', 1);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(compression()); // gzip response — giảm payload JSON list/facets ~70-80%
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan('dev'));

app.get('/health', (req, res) => res.json({ ok: true }));

// Rate limit tổng quát theo IP cho mọi endpoint /api (đặt trước các route)
app.use('/api', apiRateLimit);

app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/users', userRoutes);

// 404 cho API không tồn tại
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// error handler — luôn để cuối cùng
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

module.exports = app;
