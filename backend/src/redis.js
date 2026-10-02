const { createClient } = require('redis');

// Dùng cho benchmark: bật để bỏ qua hoàn toàn tầng cache (đo DB thuần)
function cacheDisabled() {
  return String(process.env.CACHE_DISABLED).toLowerCase() === 'true';
}

// Client Redis dùng chung. Redis là OPTIONAL với server:
//  - không kết nối được -> cache miss (đọc thẳng DB), rate limit fail-open
//  - node-redis tự retry nền, Redis bật lại là dùng được ngay
//  - server KHÔNG được chờ Redis mới listen (xem lý do ở connectRedis)
const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: { reconnectStrategy: (retries) => Math.min(retries * 250, 5000) },
});

client.on('error', (err) => {
  if (process.env.REDIS_DEBUG === 'true') console.error('[redis]', err?.message || err);
});

let connecting = false;

// Gọi KHÔNG await. Lưu ý: khi Redis chết, redis v6 retry vô hạn nên promise
// connect() không bao giờ settle — vì vậy tuyệt đối không await nó.
function connectRedis() {
  if (client.isOpen) return client.isReady;
  if (connecting) return client.isReady;
  connecting = true;
  client.once('ready', () => {
    connecting = false;
    console.log(`[redis] connected: ${process.env.REDIS_URL || 'redis://localhost:6379'}`);
  });
  client.connect().catch((err) => {
    connecting = false;
    console.error('[redis] connect failed:', err?.message || err);
  });
  return client.isReady;
}

function isRedisReady() {
  return client.isReady;
}

async function cacheGet(key) {
  try {
    if (cacheDisabled() || !client.isReady) return null;
    return await client.get(key);
  } catch {
    return null;
  }
}

async function cacheSet(key, value, ttlSeconds) {
  try {
    if (cacheDisabled() || !client.isReady) return false;
    await client.set(key, value);
    if (ttlSeconds) await client.expire(key, ttlSeconds);
    return true;
  } catch {
    return false;
  }
}

async function cacheDel(...keys) {
  try {
    if (!client.isReady || keys.length === 0) return false;
    await client.del(...keys);
    return true;
  } catch {
    return false;
  }
}

// INCR + đặt TTL ở lần đếm đầu tiên. Trả null nếu Redis không sẵn sàng.
async function incrWithTtl(key, ttlSeconds) {
  try {
    if (!client.isReady) return null;
    const count = await client.incr(key);
    if (count === 1 && ttlSeconds) await client.expire(key, ttlSeconds);
    return count;
  } catch {
    return null;
  }
}

async function getTtl(key) {
  try {
    if (!client.isReady) return -1;
    return await client.ttl(key);
  } catch {
    return -1;
  }
}

module.exports = { client, connectRedis, isRedisReady, cacheGet, cacheSet, cacheDel, incrWithTtl, getTtl };
