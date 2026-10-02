const express = require('express');
const prisma = require('../prisma');
const { cacheGet, cacheSet } = require('../redis');
const {
  signalWindowStart,
  getSignalsForUsers,
  getTotalBountiesForUsers,
} = require('../services/reputation');

const router = express.Router();

const TOP_N = 50;
const CACHE_TTL_SECONDS = 60;

// GET /api/leaderboard?sortBy=reputation|signal
// - reputation: đọc thẳng cột denormalized User.reputation (1 query, không aggregate ledger)
// - signal: vẫn SUM từ ledger theo cửa sổ 365 ngày (cửa sổ trượt — không denormalize được)
// Cache Redis 60s, xoá ngay khi có action đổi state (routes/reports.js).
router.get('/', async (req, res, next) => {
  try {
    const sortBy = req.query.sortBy === 'signal' ? 'signal' : 'reputation';
    const cacheKey = `lb:${sortBy}`;

    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    let rows;

    if (sortBy === 'reputation') {
      rows = (
        await prisma.user.findMany({
          where: { reputation: { not: 0 } },
          orderBy: [{ reputation: 'desc' }, { username: 'asc' }],
          take: TOP_N,
          select: { id: true, username: true, reputation: true },
        })
      ).map((u) => ({ userId: u.id, username: u.username, reputation: u.reputation }));
    } else {
      const grouped = await prisma.reputationLedger.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: signalWindowStart() } },
        _sum: { points: true },
        orderBy: [{ _sum: { points: 'desc' } }, { userId: 'asc' }],
        take: TOP_N,
      });
      const ids = grouped.map((g) => g.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, username: true, reputation: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));
      rows = grouped.map((g) => ({
        userId: g.userId,
        username: userMap.get(g.userId)?.username || 'unknown',
        reputation: userMap.get(g.userId)?.reputation ?? 0,
      }));
    }

    const ids = rows.map((r) => r.userId);
    const [signals, bounties] = await Promise.all([getSignalsForUsers(ids), getTotalBountiesForUsers(ids)]);

    const result = rows.map((r, index) => ({
      rank: index + 1,
      userId: r.userId,
      username: r.username,
      reputation: r.reputation,
      signal: signals.get(r.userId) ?? 0,
      totalBounty: bounties.get(r.userId) ?? 0,
    }));

    await cacheSet(cacheKey, JSON.stringify(result), CACHE_TTL_SECONDS);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
