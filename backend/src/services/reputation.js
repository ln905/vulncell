const prisma = require('../prisma');

const SIGNAL_WINDOW_DAYS = Number(process.env.SIGNAL_WINDOW_DAYS || 365);
const SIGNAL_GOOD = Number(process.env.SIGNAL_GOOD_THRESHOLD || 5);
const DAY_MS = 24 * 60 * 60 * 1000;

function signalWindowStart(now = new Date()) {
  return new Date(now.getTime() - SIGNAL_WINDOW_DAYS * DAY_MS);
}

// Reputation = SUM(points) cả đời. Signal = SUM(points) trong 365 ngày gần nhất.
async function getReputation(userId) {
  const agg = await prisma.reputationLedger.aggregate({
    where: { userId },
    _sum: { points: true },
  });
  return agg._sum.points || 0;
}

async function getSignal(userId) {
  const agg = await prisma.reputationLedger.aggregate({
    where: { userId, createdAt: { gte: signalWindowStart() } },
    _sum: { points: true },
  });
  return agg._sum.points || 0;
}

// Bản dạng batch cho leaderboard — tránh N+1
async function getReputationsForUsers(userIds) {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.reputationLedger.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds } },
    _sum: { points: true },
  });
  return new Map(rows.map((r) => [r.userId, r._sum.points || 0]));
}

async function getSignalsForUsers(userIds) {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.reputationLedger.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds }, createdAt: { gte: signalWindowStart() } },
    _sum: { points: true },
  });
  return new Map(rows.map((r) => [r.userId, r._sum.points || 0]));
}

async function getTotalBountiesForUsers(userIds) {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.report.groupBy({
    by: ['reporterId'],
    where: { reporterId: { in: userIds }, bounty: { not: null } },
    _sum: { bounty: true },
  });
  return new Map(rows.map((r) => [r.reporterId, r._sum.bounty || 0]));
}

// Giới hạn nộp report mỗi ngày theo Signal: <0 -> 0 lượt; 0..4 -> 1 lượt; >=5 -> không giới hạn
function dailyLimitForSignal(signal) {
  if (signal >= SIGNAL_GOOD) return Infinity;
  if (signal >= 0) return 1;
  return 0;
}

module.exports = {
  SIGNAL_WINDOW_DAYS,
  SIGNAL_GOOD,
  signalWindowStart,
  getReputation,
  getSignal,
  getReputationsForUsers,
  getSignalsForUsers,
  getTotalBountiesForUsers,
  dailyLimitForSignal,
};
