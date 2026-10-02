// Seed môi trường demo/test "đẹp" cho VulnCell.
//   npm run seed        -> tạo nếu DB trống (bỏ qua nếu đã có report)
//   npm run seed:reset  -> reset sạch (report/ledger/event + tài khoản lạ ngoài demo) rồi tạo lại từ đầu
//
// Kết quả: admin + reporter1..reporter10 (mật khẩu chung: password123)
//   ~99 report trải ~600 ngày, đủ mọi state/severity, có bounty, timeline đầy đủ,
//   SPAM/không hợp lệ xen kẽ để test cả privacy lẫn rate limit.
//   Reputation ghi vào ledger + cột User.reputation (đồng bộ); Signal tính theo cửa sổ 365 ngày.
// Dữ liệu sinh từ PRNG cố định -> chạy lại luôn ra cùng bộ dữ liệu (tái lập được).
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { isDisclosed, pointsForState } = require('../src/services/stateMachine');

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - Math.round(n) * DAY);

// PRNG cố định (mulberry32) — môi trường tái lập được
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261001);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));

// ---------------------------------------------------------------------------
// Danh mục lỗ hổng — mỗi loại có target hợp lý + mô tả kỹ thuật riêng
// ---------------------------------------------------------------------------
const CATALOG = [
  {
    weakness: 'Reflected XSS',
    severity: 'HIGH',
    target: 'shop.vulncell.dev/checkout',
    short: 'Reflected XSS via the coupon parameter on checkout',
    detail: 'The `coupon` parameter is reflected into the HTML without encoding.',
    step1: 'Open `https://shop.vulncell.dev/checkout?coupon=<script>alert(document.cookie)</script>`',
    step2: 'Watch the payload execute in the victim browser.',
    impact: 'Steal the session of any logged-in user.',
  },
  {
    weakness: 'SQL Injection',
    severity: 'CRITICAL',
    target: 'vulncell.dev/login',
    short: 'Blind SQLi in the post-login redirect parameter',
    detail: 'The `redirect` parameter is concatenated into an internal query.',
    step1: 'Log in and open `/login?redirect=1%27%20AND%20SLEEP(5)--`',
    step2: 'The response is delayed by exactly 5 seconds — blind SQLi confirmed.',
    impact: 'Read the users table with blind techniques.',
  },
  {
    weakness: 'IDOR',
    severity: 'CRITICAL',
    target: 'api.vulncell.dev/v2/export',
    short: 'IDOR lets you download another tenant data via the export endpoint',
    detail: 'The export endpoint does not check ownership of `tenant_id`.',
    step1: 'Log in as tenant A and call `GET /v2/export?tenant_id=B`',
    step2: 'The server returns tenant B CSV file.',
    impact: 'Full customer data leak across tenants.',
  },
  {
    weakness: 'SSRF',
    severity: 'CRITICAL',
    target: 'cdn.vulncell.dev',
    short: 'SSRF through the import-image-from-URL feature',
    detail: 'The "Import from URL" feature does not block internal IP ranges.',
    step1: 'Import `http://169.254.169.254/latest/meta-data/`',
    step2: 'The server returns cloud instance metadata.',
    impact: 'Read cloud credentials and escalate across the infrastructure.',
  },
  {
    weakness: 'Stored XSS',
    severity: 'MEDIUM',
    target: 'blog.vulncell.dev',
    short: 'Stored XSS in the blog comment section',
    detail: 'Comments are stored without sanitization.',
    step1: 'Post a comment containing a script tag.',
    step2: 'The payload runs for everyone opening the post.',
    impact: 'Hijack the session of any reader.',
  },
  {
    weakness: 'CSRF',
    severity: 'HIGH',
    target: 'store.vulncell.dev/cart',
    short: 'CSRF on the add shipping address action',
    detail: 'The address form has no CSRF token.',
    step1: 'The victim opens an HTML page that auto-POSTs to `/address`',
    step2: 'A new address is added without confirmation.',
    impact: 'An attacker can redirect the victim deliveries.',
  },
  {
    weakness: 'Open Redirect',
    severity: 'MEDIUM',
    target: 'auth.vulncell.dev/oauth',
    short: 'Open redirect in the OAuth callback flow',
    detail: 'The `next` parameter is not whitelisted.',
    step1: 'Open `/oauth/callback?next=https://evil.example`',
    step2: 'The browser is redirected straight off-site.',
    impact: 'Enables phishing from a trusted domain.',
  },
  {
    weakness: 'Race Condition',
    severity: 'MEDIUM',
    target: 'shop.vulncell.dev/checkout',
    short: 'Race condition allows applying the same coupon twice',
    detail: 'The coupon check and decrement are not in one transaction.',
    step1: 'Fire 20 apply-coupon requests at once.',
    step2: '7 requests succeed with a single-use coupon.',
    impact: 'Direct revenue loss.',
  },
  {
    weakness: 'Subdomain Takeover',
    severity: 'HIGH',
    target: 'dev.vulncell.dev',
    short: 'dev subdomain points to a released cloud server',
    detail: 'The DNS record still points to a deleted instance IP.',
    step1: '`dig dev.vulncell.dev` → CNAME to a non-existent IP.',
    step2: 'Create a new instance on that IP → subdomain taken over.',
    impact: 'Serve fake content on a company domain.',
  },
  {
    weakness: 'HTTP Request Smuggling',
    severity: 'HIGH',
    target: 'lb.vulncell.dev',
    short: 'Request smuggling via Content-Length / Transfer-Encoding mismatch',
    detail: 'Frontend and backend disagree when both CL and TE are present.',
    step1: 'Send a request with both `Content-Length` and `Transfer-Encoding: chunked`.',
    step2: 'Smuggle a hidden request into another user stream.',
    impact: 'Cache poisoning and request hijacking.',
  },
  {
    weakness: 'Path Traversal',
    severity: 'HIGH',
    target: 'files.vulncell.dev/download',
    short: 'Path traversal reads files outside the allowed directory',
    detail: 'The `file` parameter is not normalized.',
    step1: 'Call `/download?file=../../etc/passwd`',
    step2: 'The server returns a system file.',
    impact: 'Read configuration files with sensitive data.',
  },
  {
    weakness: 'Broken Authentication',
    severity: 'MEDIUM',
    target: 'mobile-api.vulncell.dev',
    short: 'Token does not expire after a password change',
    detail: 'Old refresh tokens keep working indefinitely.',
    step1: 'Log in on two devices.',
    step2: 'Change the password on device A — device B keeps working with the old token.',
    impact: 'A compromised session cannot be revoked.',
  },
  {
    weakness: 'Missing Rate Limiting',
    severity: 'MEDIUM',
    target: 'files.vulncell.dev/download',
    short: 'No rate limiting on the file-token endpoint',
    detail: 'File tokens are short and brute-forceable when unbounded.',
    step1: 'Send 10,000 requests with a wrong token in one minute.',
    step2: 'Not a single request was blocked.',
    impact: 'Token brute force becomes feasible.',
  },
  {
    weakness: 'Weak TLS Configuration',
    severity: 'LOW',
    target: 'legacy.vulncell.dev',
    short: 'Legacy server still supports TLS 1.0/1.1',
    detail: 'Weak cipher suites (RC4, 3DES) are still enabled.',
    step1: 'Run `nmap --script ssl-enum-ciphers -p 443 legacy.vulncell.dev`',
    step2: 'TLS 1.0/1.1 are still offered.',
    impact: 'Downgrade attacks against the infrastructure.',
  },
  {
    weakness: 'Information Disclosure',
    severity: 'LOW',
    target: 'status.vulncell.dev',
    short: 'Internal paths leaked through the 500 error page',
    detail: 'The stack trace exposes absolute server paths.',
    step1: 'Trigger a 500 error on `/status`.',
    step2: 'The error page returns a stack trace.',
    impact: 'Directory structure exposure aids deeper attacks.',
  },
];

// ---------------------------------------------------------------------------
// "Hồ sơ" từng reporter — số bài theo state để tạo bảng xếp hạng có phân tầng
// ---------------------------------------------------------------------------
const PROFILES = [
  { username: 'reporter1', bio: 'Full-time bug hunter. Web & API security.', resolved: 10, duplicate: 1, informative: 1, na: 0, spam: 0, triaged: 2, pending: 1, bounty: [500, 1500] },
  { username: 'reporter2', bio: 'Security researcher. Focus: injection flaws.', resolved: 8, duplicate: 1, informative: 1, na: 1, spam: 0, triaged: 1, pending: 1, bounty: [300, 1200] },
  { username: 'reporter3', bio: 'CTF player • SSRF & cloud security.', resolved: 7, duplicate: 0, informative: 1, na: 0, spam: 0, triaged: 2, pending: 2, bounty: [300, 1000] },
  { username: 'reporter4', bio: 'Pentester by day, bounty hunter by night.', resolved: 5, duplicate: 1, informative: 0, na: 1, spam: 0, triaged: 2, pending: 2, bounty: [200, 800] },
  { username: 'reporter5', bio: 'Mobile app security — iOS & Android.', resolved: 4, duplicate: 1, informative: 1, na: 1, spam: 0, triaged: 1, pending: 2, bounty: [200, 600] },
  { username: 'reporter6', bio: 'Learning in public — first year hunting.', resolved: 3, duplicate: 1, informative: 0, na: 1, spam: 1, triaged: 1, pending: 3, bounty: [100, 500] },
  { username: 'reporter7', bio: 'IoT & automotive security.', resolved: 2, duplicate: 1, informative: 1, na: 2, spam: 0, triaged: 1, pending: 2, bounty: [100, 400] },
  { username: 'reporter8', bio: 'Crypto nerd, occasional web hunter.', resolved: 1, duplicate: 1, informative: 0, na: 1, spam: 0, triaged: 2, pending: 3, bounty: [100, 300] },
  { username: 'reporter9', bio: 'Breaking things to fix them. New here.', resolved: 0, duplicate: 0, informative: 0, na: 0, spam: 0, triaged: 1, pending: 5, bounty: [100, 200] },
  { username: 'reporter10', bio: 'Six reports in. Triage says otherwise.', resolved: 0, duplicate: 0, informative: 1, na: 0, spam: 4, triaged: 0, pending: 1, bounty: [100, 200] },
];

// Ngày tham gia cố định cho từng reporter — sớm hơn report cũ nhất (~600 ngày) để
// "Joined" trên profile không còn lộn xộn theo thời điểm chạy seed. Admin tham gia sớm nhất.
const JOIN_DAYS_START = 620;
const JOIN_DAYS_STEP = 9;

const CLOSE_COMMENTS = {
  RESOLVED: 'Confirmed and patched in the latest release. Thanks for the quality report!',
  DUPLICATE: 'Duplicate of an earlier report — noted for next time.',
  INFORMATIVE: 'Useful information, but not a security issue that needs a fix.',
  NOT_APPLICABLE: 'The system is not affected by this issue.',
  SPAM: 'Clear spam, no technical content.',
};
const TRIAGE_COMMENTS = [
  'Confirmed, forwarded to the patch team.',
  'Reproduced on staging. Working on it.',
  'Thanks for the report, severity assessed correctly.',
];
const HACKER_COMMENTS = [
  'Additional info: full PoC is in the details section.',
  'Retested today, still reproducible.',
  'Added a demo video to make reproduction faster.',
];

// Đoạn code mẫu cho từng weakness — nằm trong block "Proof of concept" của report.
// Có sẵn code block để demo tính năng wrap / copy / collapse ở frontend.
const POC = {
  'Reflected XSS': [
    'GET /checkout?coupon=<script>alert(document.cookie)</script> HTTP/2',
    'Host: shop.vulncell.dev',
    'Cookie: [victim session]',
  ].join('\n'),
  'SQL Injection': [
    'POST /login HTTP/2',
    'Host: vulncell.dev',
    'Content-Type: application/x-www-form-urlencoded',
    '',
    "redirect=1' AND SLEEP(5)-- -",
  ].join('\n'),
  IDOR: [
    'GET /v2/export?tenant_id=<victim_tenant_id> HTTP/2',
    'Host: api.vulncell.dev',
    'Authorization: Bearer [attacker token]',
  ].join('\n'),
  SSRF: [
    'POST /import HTTP/2',
    'Host: cdn.vulncell.dev',
    'Content-Type: application/json',
    '',
    '{"url":"http://169.254.169.254/latest/meta-data/iam/security-credentials/"}',
  ].join('\n'),
  'Stored XSS': [
    'POST /api/comments HTTP/2',
    'Host: blog.vulncell.dev',
    'Content-Type: application/json',
    '',
    '{"postId":42,"body":"<img src=x onerror=alert(document.cookie)>"}',
  ].join('\n'),
  CSRF: [
    '<form action="https://store.vulncell.dev/address" method="POST">',
    '  <input name="line1" value="Attacker Street 1">',
    '  <input name="city" value="Evil City">',
    '</form>',
    '<script>document.forms[0].submit()</script>',
  ].join('\n'),
  'Open Redirect': [
    'GET /oauth/callback?next=https://evil.example HTTP/2',
    'Host: auth.vulncell.dev',
  ].join('\n'),
  'Race Condition': [
    '# Fire 20 parallel requests with the same single-use coupon',
    'seq 20 | xargs -P20 -I{} curl -s -X POST https://shop.vulncell.dev/coupon/apply \\',
    '  -H "Cookie: [session]" -d "code=SAVE50"',
  ].join('\n'),
  'Subdomain Takeover': [
    '$ dig +short dev.vulncell.dev',
    'dev.vulncell.dev. 300 IN CNAME old-instance.example.net.',
    '',
    '# old-instance.example.net was deleted but the CNAME still points to it',
  ].join('\n'),
  'HTTP Request Smuggling': [
    'POST / HTTP/1.1',
    'Host: lb.vulncell.dev',
    'Content-Length: 13',
    'Transfer-Encoding: chunked',
    '',
    '0',
    '',
    'SMUGGLED',
  ].join('\n'),
  'Path Traversal': [
    'GET /download?file=../../etc/passwd HTTP/2',
    'Host: files.vulncell.dev',
  ].join('\n'),
  'Broken Authentication': [
    'POST /auth/change-password HTTP/2',
    'Host: mobile-api.vulncell.dev',
    'Authorization: Bearer [old session]',
    '',
    '{"newPassword":"NewPassw0rd!"}',
    '',
    '# The old token keeps working after the password change',
  ].join('\n'),
  'Missing Rate Limiting': [
    'seq 10000 | xargs -P50 -I{} curl -s \\',
    '  "https://files.vulncell.dev/download?token=wrong{}" -o /dev/null',
  ].join('\n'),
  'Weak TLS Configuration': [
    '$ nmap --script ssl-enum-ciphers -p 443 legacy.vulncell.dev',
    '443/tcp open  https',
    '| ssl-enum-ciphers:',
    '|   TLSv1.0:',
    '|     ciphers:',
    '|       TLS_RSA_WITH_3DES_EDE_CBC_SHA (rsa 2048) - C',
  ].join('\n'),
  'Information Disclosure': [
    'GET /status/error HTTP/2',
    'Host: status.vulncell.dev',
    'Accept: application/json',
    '',
    '# 500 response leaks absolute paths like /srv/app/... in the stack trace',
  ].join('\n'),
};

function detailsFor(c) {
  const poc = POC[c.weakness] || `GET / HTTP/2\nHost: ${c.target.split('/')[0]}`;
  return [
    '## Description',
    '',
    c.detail,
    '',
    '## Steps to reproduce',
    '',
    `1. ${c.step1}`,
    `2. ${c.step2}`,
    '',
    '## Proof of concept',
    '',
    '```',
    poc,
    '```',
    '',
    '## Impact',
    '',
    c.impact,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Tạo 1 report kèm timeline + ledger + cột reputation (đồng bộ)
// ---------------------------------------------------------------------------
async function createReport({ reporter, admin, finalState, catalog, daysBack, bountyRange }) {
  const submittedAt = daysAgo(daysBack);
  const triagedAt = finalState === 'PENDING' || finalState === 'SPAM'
    ? null
    : new Date(submittedAt.getTime() + randInt(1, 5) * DAY);
  const closedAt = isDisclosed(finalState)
    ? new Date(Math.min(Date.now() - DAY, submittedAt.getTime() + randInt(6, 45) * DAY))
    : null;

  // Severity chỉ có nghĩa sau triage — PENDING và SPAM (đi thẳng từ PENDING) để NONE.
  const severity = finalState === 'PENDING' || finalState === 'SPAM' ? 'NONE' : catalog.severity;
  const bounty = finalState === 'RESOLVED'
    ? Math.round(randInt(bountyRange[0], bountyRange[1]) / 50) * 50
    : null;
  const cveId = ['HIGH', 'CRITICAL'].includes(severity) && rand() < 0.2
    ? `CVE-2026-${randInt(10000, 89999)}`
    : null;

  const details = detailsFor(catalog);

  const report = await prisma.report.create({
    data: {
      reporterId: reporter.id,
      target: catalog.target,
      weakness: catalog.weakness,
      cveId,
      shortDescription: catalog.short,
      details,
      severity,
      state: finalState,
      bounty,
      createdAt: submittedAt,
      disclosedAt: closedAt,
    },
  });

  const events = [
    { type: 'SUBMITTED', actorId: reporter.id, content: details, createdAt: submittedAt },
  ];
  let tick = 500;

  if (rand() < 0.35) {
    events.push({
      type: 'COMMENT',
      actorId: reporter.id,
      content: pick(HACKER_COMMENTS),
      createdAt: new Date(submittedAt.getTime() + tick++),
    });
  }

  if (triagedAt) {
    events.push({
      type: 'STATE_CHANGE',
      actorId: admin.id,
      fromState: 'PENDING',
      toState: 'TRIAGED',
      content: pick(TRIAGE_COMMENTS),
      createdAt: triagedAt,
    });
  }

  if (closedAt) {
    events.push({
      type: 'STATE_CHANGE',
      actorId: admin.id,
      fromState: triagedAt ? 'TRIAGED' : 'PENDING',
      toState: finalState,
      content: CLOSE_COMMENTS[finalState],
      createdAt: closedAt,
    });
    if (bounty) {
      events.push({
        type: 'BOUNTY',
        actorId: admin.id,
        content: null,
        bountyAmount: bounty,
        createdAt: new Date(closedAt.getTime() + 60 * 1000),
      });
    }
  }

  await prisma.reportEvent.createMany({
    data: events.map((e) => ({ reportId: report.id, ...e })),
  });

  const points = pointsForState(finalState);
  if (points !== null && closedAt) {
    await prisma.reputationLedger.create({
      data: { userId: reporter.id, points, reason: finalState, createdAt: closedAt },
    });
    await prisma.user.update({
      where: { id: reporter.id },
      data: { reputation: { increment: points } },
    });
  }

  return report;
}

// ---------------------------------------------------------------------------
async function main() {
  const force = process.argv.includes('--force');
  const passwordHash = await bcrypt.hash('password123', 10);

  // 1) Tài khoản: admin + reporter1..reporter10
  // Ngày tham gia được ghim cố định (admin sớm nhất, cách nhau 9 ngày) — xem chú thích JOIN_DAYS_*.
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: force ? { createdAt: daysAgo(720) } : {},
    create: { username: 'admin', email: 'admin@vulncell.dev', passwordHash, role: 'ADMIN', createdAt: daysAgo(720) },
  });

  const reporters = {};
  for (const [i, p] of PROFILES.entries()) {
    const joinedAt = daysAgo(JOIN_DAYS_START + i * JOIN_DAYS_STEP);
    reporters[p.username] = await prisma.user.upsert({
      where: { username: p.username },
      update: force ? { createdAt: joinedAt, bio: p.bio } : {},
      create: {
        username: p.username,
        email: `${p.username}@vulncell.dev`,
        passwordHash,
        role: 'HACKER',
        bio: p.bio,
        createdAt: joinedAt,
      },
    });
  }

  const demoIds = [admin.id, ...Object.values(reporters).map((u) => u.id)];

  if (force) {
    // Reset sạch: xoá luôn dữ liệu rác từ smoke/bench (tài khoản lạ) để môi trường
    // demo luôn đúng 11 tài khoản / 100 report đẹp.
    await prisma.reportEvent.deleteMany({});
    await prisma.reputationLedger.deleteMany({});
    await prisma.report.deleteMany({});
    const stray = await prisma.user.deleteMany({ where: { id: { notIn: demoIds } } });
    await prisma.user.updateMany({ where: { id: { in: demoIds } }, data: { reputation: 0 } });
    console.log(`Đã reset sạch: xoá toàn bộ report cũ + ${stray.count} tài khoản lạ (ngoài 11 tài khoản demo).`);
  }

  const existing = await prisma.report.count();
  if (existing > 0 && !force) {
    console.log(`Đã có ${existing} report trong DB — bỏ qua phần seed. Muốn tạo lại: npm run seed:reset`);
    return printSummary(reporters);
  }

  // 2) Sinh report theo hồ sơ từng reporter
  let created = 0;
  for (const p of PROFILES) {
    const reporter = reporters[p.username];
    const plan = [
      ...Array(p.resolved).fill('RESOLVED'),
      ...Array(p.duplicate).fill('DUPLICATE'),
      ...Array(p.informative).fill('INFORMATIVE'),
      ...Array(p.na).fill('NOT_APPLICABLE'),
      ...Array(p.spam).fill('SPAM'),
      ...Array(p.triaged).fill('TRIAGED'),
      ...Array(p.pending).fill('PENDING'),
    ];

    for (const finalState of plan) {
      const catalog = pick(CATALOG);
      // Trải thời gian ~600 ngày; ~30% bài cũ hơn 1 năm để Signal lệch khỏi Reputation
      const daysBack = randInt(5, 600);
      await createReport({ reporter, admin, finalState, catalog, daysBack, bountyRange: p.bounty });
      created++;
    }
    console.log(`  ${p.username}: ${plan.length} report (${plan.filter((s) => s === 'RESOLVED').length} resolved)`);
  }

  console.log(`\nĐã tạo ${created} report cho 10 reporter.`);
  await printSummary(reporters);
}

async function printSummary(reporters) {
  const windowStart = new Date(Date.now() - 365 * DAY);

  console.log('\nTài khoản demo — mật khẩu chung: password123');
  console.log('  admin       ADMIN   (admin@vulncell.dev)');
  console.log('  reporter1..10  HACKER');
  console.log('\nBảng điểm mẫu (Reputation | Signal | #report):');

  const rows = [];
  for (const username of Object.keys(reporters)) {
    const u = reporters[username];
    const [repAgg, sigAgg, count] = await Promise.all([
      prisma.reputationLedger.aggregate({ where: { userId: u.id }, _sum: { points: true } }),
      prisma.reputationLedger.aggregate({
        where: { userId: u.id, createdAt: { gte: windowStart } },
        _sum: { points: true },
      }),
      prisma.report.count({ where: { reporterId: u.id } }),
    ]);
    rows.push({
      username,
      reputation: repAgg._sum.points || 0,
      signal: sigAgg._sum.points || 0,
      reports: count,
    });
  }
  rows.sort((a, b) => b.reputation - a.reputation);
  for (const r of rows) {
    console.log(`  ${r.username.padEnd(12)} ${String(r.reputation).padStart(4)} | ${String(r.signal).padStart(3)} | ${r.reports}`);
  }
  console.log('\nXem trực quan: npx prisma studio');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
