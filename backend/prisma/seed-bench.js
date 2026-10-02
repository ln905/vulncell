// Seed dữ liệu LỚN cho benchmark/stress test.
//   npm run seed:bench                 -> mặc định 2.000 user + 500.000 report
//   npm run seed:bench -- --users=500 --reports=100000
//   npm run seed:bench:clean           -> xoá sạch dữ liệu bench
//
// Kỹ thuật: INSERT ... SELECT FROM generate_series (không vòng lặp JS),
// chia batch 50k, SET LOCAL synchronous_commit = off, ANALYZE sau khi seed.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : def;
};

const USERS = arg('users', 2000);
const REPORTS = arg('reports', 500000);
const BATCH = 50000;

const BENCH_USER_PREFIX = 'bench_user_';
const BENCH_MARKER = 'Báo cáo kiểm thử hiệu năng #';

const TARGETS = [
  'shop.vulncell.dev/checkout',
  'api.vulncell.dev/v2/export',
  'cdn.vulncell.dev',
  'blog.vulncell.dev',
  'auth.vulncell.dev/oauth',
  'files.vulncell.dev/download',
  'render.vulncell.dev/template',
  'legacy.vulncell.dev',
  'lb.vulncell.dev',
  'store.vulncell.dev/cart',
  'docs.vulncell.dev',
  'mail.vulncell.dev',
];

const WEAKNESSES = [
  'SQL Injection',
  'Reflected XSS',
  'Stored XSS',
  'SSRF',
  'CSRF',
  'IDOR',
  'Open Redirect',
  'Path Traversal',
  'CRLF Injection',
  'Race Condition',
  'Server-Side Template Injection',
  'HTTP Request Smuggling',
  'Subdomain Takeover',
  'Weak TLS Configuration',
  'Information Disclosure',
  'Broken Authentication',
  'Missing Rate Limiting',
];

const DISCLOSED_SQL = `('RESOLVED','DUPLICATE','INFORMATIVE','NOT_APPLICABLE','SPAM')`;

async function clean() {
  console.log('Đang xoá dữ liệu bench (có thể mất 10–60 giây)...');
  const t0 = Date.now();
  await prisma.$transaction(
    async (tx) => {
      const ev = await tx.$executeRawUnsafe(
        `DELETE FROM "ReportEvent" WHERE "reportId" IN (
           SELECT r.id FROM "Report" r JOIN "User" u ON u.id = r."reporterId" WHERE u.username LIKE $1 || '%')`,
        BENCH_USER_PREFIX
      );
      const lg = await tx.$executeRawUnsafe(
        `DELETE FROM "ReputationLedger" WHERE "userId" IN (SELECT id FROM "User" WHERE username LIKE $1 || '%')`,
        BENCH_USER_PREFIX
      );
      const rp = await tx.$executeRawUnsafe(
        `DELETE FROM "Report" WHERE "reporterId" IN (SELECT id FROM "User" WHERE username LIKE $1 || '%')`,
        BENCH_USER_PREFIX
      );
      const us = await tx.$executeRawUnsafe(`DELETE FROM "User" WHERE username LIKE $1 || '%'`, BENCH_USER_PREFIX);
      console.log(`Đã xoá: ${ev} event, ${lg} ledger, ${rp} report, ${us} user.`);
    },
    { timeout: 10 * 60 * 1000, maxWait: 60 * 1000 }
  );
  console.log(`Xong sau ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

async function seed() {
  console.log(`Seed bench: ${USERS} user + ${REPORTS} report...`);
  const t0 = Date.now();

  const existing = await prisma.report.count({ where: { shortDescription: { startsWith: BENCH_MARKER } } });
  if (existing > 0) {
    console.error(`Đã có ${existing} report bench trong DB. Chạy "npm run seed:bench:clean" trước, hoặc thêm --force.`);
    if (!process.argv.includes('--force')) process.exit(1);
    await clean();
  }

  const passwordHash = await bcrypt.hash('password123', 10);

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL synchronous_commit = off');

      // 1) Users
      console.log('  [1/5] Users...');
      await tx.$executeRawUnsafe(
        `INSERT INTO "User" (id, username, email, "passwordHash", role, "createdAt")
         SELECT gen_random_uuid(),
                $1 || lpad(g::text, 5, '0'),
                $1 || lpad(g::text, 5, '0') || '@bench.local',
                $2,
                'HACKER',
                now() - (random() * interval '900 days')
         FROM generate_series(1, $3::int) g
         ON CONFLICT DO NOTHING`,
        BENCH_USER_PREFIX,
        passwordHash,
        USERS
      );

      // bảng tạm ánh xạ rn -> user id (join hash, không tra từng dòng)
      await tx.$executeRawUnsafe(
        `CREATE TEMP TABLE bench_map AS
         SELECT row_number() OVER (ORDER BY username) AS rn, id
         FROM "User" WHERE username LIKE $1 || '%'`,
        BENCH_USER_PREFIX
      );

      // 2) Reports theo batch
      console.log(`  [2/5] Reports (${Math.ceil(REPORTS / BATCH)} batch)...`);
      for (let done = 0; done < REPORTS; done += BATCH) {
        const from = done + 1;
        const to = Math.min(done + BATCH, REPORTS);
        await tx.$executeRawUnsafe(
          `INSERT INTO "Report"
             (id, "reporterId", target, weakness, "cveId", "shortDescription", details, severity, state, bounty, "createdAt", "disclosedAt")
           WITH base AS (
             SELECT g,
                    random() AS r1, random() AS r2, random() AS r3, random() AS r4,
                    random() AS r5, random() AS r6, random() AS r7, random() AS r8
             FROM generate_series($1::int, $2::int) g
           ), rows AS (
             SELECT g, r4, r5, r6, r7, r8,
                    (ARRAY[${TARGETS.map((t) => `'${t}'`).join(',')}])[1 + floor(r1 * ${TARGETS.length})::int] AS target,
                    (ARRAY[${WEAKNESSES.map((w) => `'${w.replace(/'/g, "''")}'`).join(',')}])[1 + floor(r2 * ${WEAKNESSES.length})::int] AS weakness,
                    (CASE WHEN r3 < 0.15 THEN 'CVE-2026-' || (10000 + floor(r3 * 80000)::int)::text END) AS cve,
                    (CASE
                       WHEN r4 < 0.25 THEN 'PENDING'
                       WHEN r4 < 0.40 THEN 'TRIAGED'
                       WHEN r4 < 0.75 THEN 'RESOLVED'
                       WHEN r4 < 0.80 THEN 'DUPLICATE'
                       WHEN r4 < 0.88 THEN 'INFORMATIVE'
                       WHEN r4 < 0.95 THEN 'NOT_APPLICABLE'
                       ELSE 'SPAM'
                     END) AS state
             FROM base
           )
           SELECT gen_random_uuid(),
                  m.id,
                  rows.target,
                  rows.weakness,
                  rows.cve,
                  $4 || rows.g || ': lỗ hổng ' || rows.weakness || ' trên ' || rows.target,
                  '## Mô tả' || chr(10) || chr(10) || 'Bench report #' || rows.g || ' — ' || rows.weakness || '.' || chr(10) || chr(10) || '## Steps to reproduce' || chr(10) || '1. ...',
                  (CASE WHEN rows.state = 'PENDING'
                        THEN 'NONE'
                        ELSE (ARRAY['LOW','MEDIUM','HIGH','CRITICAL'])[1 + floor(rows.r5 * 4)::int]
                   END)::"Severity",
                  rows.state::"ReportState",
                  (CASE WHEN rows.state = 'RESOLVED' THEN (50 + floor(rows.r6 * 1450))::int END),
                  now() - (rows.r7 * interval '1095 days'),
                  (CASE WHEN rows.state IN ${DISCLOSED_SQL}
                        THEN LEAST(now(), now() - (rows.r7 * interval '1095 days') + (rows.r8 * interval '60 days'))
                   END)
           FROM rows
           JOIN bench_map m ON m.rn = 1 + (rows.g % $3::int)`,
          from,
          to,
          USERS,
          BENCH_MARKER
        );
        console.log(`     ...${to}/${REPORTS}`);
      }

      // 3) Ledger cho các report đã disclosed (Reputation/Signal)
      console.log('  [3/5] ReputationLedger...');
      const ledgerCount = await tx.$executeRawUnsafe(
        `INSERT INTO "ReputationLedger" (id, "userId", points, reason, "createdAt")
         SELECT gen_random_uuid(), r."reporterId",
                CASE r.state
                  WHEN 'RESOLVED' THEN 7 WHEN 'DUPLICATE' THEN 2 WHEN 'INFORMATIVE' THEN 0
                  WHEN 'NOT_APPLICABLE' THEN -5 ELSE -10
                END,
                r.state::text,
                COALESCE(r."disclosedAt", r."createdAt")
         FROM "Report" r
         WHERE r."shortDescription" LIKE $1 || '%'
           AND r.state NOT IN ('PENDING','TRIAGED')`,
        BENCH_MARKER
      );
      console.log(`     ...${ledgerCount} dòng ledger`);

      // 4) Timeline cho 1.000 report mới nhất (đủ để mở case xem)
      console.log('  [4/5] ReportEvent (1.000 report mới nhất)...');
      const eventCount = await tx.$executeRawUnsafe(
        `INSERT INTO "ReportEvent" (id, "reportId", "actorId", type, content, "createdAt")
         SELECT gen_random_uuid(), r.id, r."reporterId", 'SUBMITTED', r.details, r."createdAt"
         FROM "Report" r
         WHERE r."shortDescription" LIKE $1 || '%'
         ORDER BY r."createdAt" DESC
         LIMIT 1000`,
        BENCH_MARKER
      );
      console.log(`     ...${eventCount} event`);

      // 5) Thống kê cho query planner
      console.log('  [5/5] ANALYZE...');
      await tx.$executeRawUnsafe('ANALYZE "User"');
      await tx.$executeRawUnsafe('ANALYZE "Report"');
      await tx.$executeRawUnsafe('ANALYZE "ReputationLedger"');
    },
    { timeout: 30 * 60 * 1000, maxWait: 60 * 1000 }
  );

  console.log(`\nXong sau ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('Kiểm tra nhanh:');
  const counts = await prisma.$queryRawUnsafe(`
    SELECT
      (SELECT count(*) FROM "User" WHERE username LIKE '${BENCH_USER_PREFIX}%') AS users,
      (SELECT count(*) FROM "Report" WHERE "shortDescription" LIKE '${BENCH_MARKER}%') AS reports,
      (SELECT count(*) FROM "ReputationLedger" WHERE "userId" IN (SELECT id FROM "User" WHERE username LIKE '${BENCH_USER_PREFIX}%')) AS ledger
  `);
  console.log(counts);
  console.log('\nXoá khi cần: npm run seed:bench:clean');
}

const main = process.argv.includes('--clean') ? clean : seed;
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
