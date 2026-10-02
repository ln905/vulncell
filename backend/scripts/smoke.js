/* Smoke test end-to-end cho VulnCell API.
 *
 * Cách dùng:
 *   1. Server đang chạy:            npm run dev
 *   2. Đã seed dữ liệu demo:        npm run seed
 *   3. Chạy test:                   npm run smoke
 *
 * Yêu cầu .env có RATE_LIMIT_DISABLED=false (để test được rate limit).
 * Script tự tạo tài khoản mới mỗi lần chạy nên chạy lại không bị trùng.
 */
const BASE = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;

let passed = 0;
let failed = 0;

function check(name, condition, extra = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

// "Cookie jar" tối giản: giữ cookie token giữa các request như trình duyệt
function createJar() {
  const cookies = new Map();
  return {
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    absorb(res) {
      const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
      for (const raw of setCookies) {
        const [pair] = raw.split(';');
        const idx = pair.indexOf('=');
        const k = pair.slice(0, idx).trim();
        const v = pair.slice(idx + 1).trim();
        if (v === '') cookies.delete(k);
        else cookies.set(k, v);
      }
    },
  };
}

async function api(method, path, { body, cookieJar } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookieJar && cookieJar.header()) headers.Cookie = cookieJar.header();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (cookieJar) cookieJar.absorb(res);
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* body rỗng */
  }
  return { status: res.status, data };
}

async function main() {
  console.log(`\nVulnCell smoke test → ${BASE}\n`);

  // ---------- 0. Health ----------
  console.log('▸ Hệ thống');
  const health = await api('GET', '/health');
  check('GET /health → 200 {ok:true}', health.status === 200 && health.data?.ok === true);

  const stamp = Date.now();
  const hacker = {
    username: `smoke_${stamp}`,
    email: `smoke_${stamp}@vulncell.dev`,
    password: 'Passw0rd123',
  };

  // ---------- 1. Register ----------
  console.log('\n▸ Đăng ký / đăng nhập');
  const reg = await api('POST', '/api/auth/register', { body: { ...hacker, role: 'ADMIN' } });
  check('POST /auth/register → 201', reg.status === 201, JSON.stringify(reg.data));
  check('gửi kèm role=ADMIN nhưng vẫn chỉ là HACKER', reg.data?.role === 'HACKER', `role=${reg.data?.role}`);

  const weakPass = await api('POST', '/api/auth/register', {
    body: { username: `weak_${stamp}`, email: `weak_${stamp}@vulncell.dev`, password: 'abc' },
  });
  check('mật khẩu yếu → 400', weakPass.status === 400, JSON.stringify(weakPass.data));

  const badName = await api('POST', '/api/auth/register', {
    body: { username: 'Bad Name!', email: `bad_${stamp}@vulncell.dev`, password: 'Passw0rd123' },
  });
  check('username sai định dạng → 400', badName.status === 400);

  const dup = await api('POST', '/api/auth/register', { body: hacker });
  check('username trùng → 409', dup.status === 409);

  // Brute-force: 5 lần sai trong 1 phút → lần thứ 6 bị 429
  const bfName = `bruteforce_${stamp}`;
  let lastBf = null;
  for (let i = 1; i <= 6; i++) {
    lastBf = await api('POST', '/api/auth/login', { body: { username: bfName, password: 'sai-mat-khau' } });
  }
  check('login sai 5 lần → lần 6 bị chặn 429', lastBf.status === 429, `nhận ${lastBf.status}`);

  // Login thật (admin qua email, reporter1 qua username)
  const adminJar = createJar();
  const r1Jar = createJar();
  const adminLogin = await api('POST', '/api/auth/login', {
    body: { email: 'admin@vulncell.dev', password: 'password123' },
    cookieJar: adminJar,
  });
  check('login admin (email) → 200', adminLogin.status === 200, JSON.stringify(adminLogin.data));
  const r1Login = await api('POST', '/api/auth/login', {
    body: { username: 'reporter1', password: 'password123' },
    cookieJar: r1Jar,
  });
  check('login reporter1 (username) → 200', r1Login.status === 200);

  const me = await api('GET', '/api/auth/me', { cookieJar: adminJar });
  check('GET /auth/me → ADMIN', me.status === 200 && me.data?.role === 'ADMIN');
  const meAnon = await api('GET', '/api/auth/me');
  check('GET /auth/me không cookie → 401', meAnon.status === 401);

  // Tài khoản smoke vừa tạo: signal = 0 -> chỉ được 1 report/ngày
  const hackerJar = createJar();
  const hackerLogin = await api('POST', '/api/auth/login', {
    body: { username: hacker.username, password: hacker.password },
    cookieJar: hackerJar,
  });
  check('login tài khoản vừa đăng ký → 200', hackerLogin.status === 200);

  // ---------- 2. Tạo report ----------
  console.log('\n▸ Report & sanitize');
  const created = await api('POST', '/api/reports', {
    cookieJar: hackerJar,
    body: {
      target: `smoke-${stamp}.example.com`,
      weakness: `SMOKE-${stamp}`,
      cveId: null,
      shortDescription: `Automated smoke test report ${stamp}`,
      details: '## Steps\n\n1. Open the page\n2. <script>alert(1)</script>\n',
    },
  });
  check('POST /reports → 201, state PENDING', created.status === 201 && created.data?.state === 'PENDING', JSON.stringify(created.data));
  check('report mới tạo: severity mặc định là NONE (chưa triage)', created.data?.severity === 'NONE', `severity=${created.data?.severity}`);
  const reportId = created.data?.id;
  check('thẻ <script> bị loại khỏi details (sanitize)', typeof created.data?.details === 'string' && !created.data.details.includes('<script>'));

  const anonCreate = await api('POST', '/api/reports', {
    body: { target: 'x.com', weakness: 'X', shortDescription: 'nope nope nope nope', details: 'nope nope nope nope' },
  });
  check('POST /reports không đăng nhập → 401', anonCreate.status === 401);

  // Tài khoản smoke có Signal = 0 → chỉ được 1 report/ngày
  const secondCreate = await api('POST', '/api/reports', {
    cookieJar: hackerJar,
    body: {
      target: 'x.example.com',
      weakness: 'Test limit',
      shortDescription: 'Second report on the same day to test rate limit',
      details: 'Content long enough to pass schema validation.',
    },
  });
  check('report thứ 2 trong ngày → 429 (rate limit theo Signal)', secondCreate.status === 429, JSON.stringify(secondCreate.data));

  // ---------- 3. Timeline & state machine ----------
  console.log('\n▸ Timeline & state machine');
  const ev1 = await api('GET', `/api/reports/${reportId}/events`);
  check('timeline mới có 1 block SUBMITTED', ev1.status === 200 && ev1.data?.length === 1 && ev1.data[0].type === 'SUBMITTED');

  const hackerAction = await api('POST', `/api/reports/${reportId}/actions`, {
    cookieJar: hackerJar,
    body: { newState: 'TRIAGED' },
  });
  check('hacker tự đổi state → 403', hackerAction.status === 403);

  const hackerComment = await api('POST', `/api/reports/${reportId}/actions`, {
    cookieJar: hackerJar,
    body: { comment: 'Bổ sung: PoC có thể lấy cookie của admin.' },
  });
  check('hacker gửi comment thường → 200', hackerComment.status === 200);

  const jump = await api('POST', `/api/reports/${reportId}/actions`, {
    cookieJar: adminJar,
    body: { newState: 'RESOLVED' },
  });
  check('PENDING → RESOLVED (nhảy cóc) → 400', jump.status === 400, JSON.stringify(jump.data));

  const triaged = await api('POST', `/api/reports/${reportId}/actions`, {
    cookieJar: adminJar,
    body: { newState: 'TRIAGED', severity: 'HIGH', comment: 'Confirmed by triage.' },
  });
  check('PENDING → TRIAGED + severity HIGH → 200', triaged.status === 200 && triaged.data?.state === 'TRIAGED' && triaged.data?.severity === 'HIGH');

  const bountyEarly = await api('POST', `/api/reports/${reportId}/actions`, {
    cookieJar: adminJar,
    body: { bountyAmount: 100 },
  });
  check('cấp bounty khi chưa RESOLVED → 400', bountyEarly.status === 400);

  const severityEarly = await api('POST', `/api/reports/${reportId}/actions`, {
    cookieJar: adminJar,
    body: { severity: 'LOW' },
  });
  check('...nhưng set severity khi đã TRIAGED → 200', severityEarly.status === 200 && severityEarly.data?.severity === 'LOW');

  const resolved = await api('POST', `/api/reports/${reportId}/actions`, {
    cookieJar: adminJar,
    body: { newState: 'RESOLVED', severity: 'CRITICAL', bountyAmount: 500, comment: 'Fixed, thanks!' },
  });
  check('TRIAGED → RESOLVED + bounty 500 → 200', resolved.status === 200 && resolved.data?.state === 'RESOLVED' && resolved.data?.bounty === 500);
  check('disclosedAt được set khi vào nhóm disclosed', Boolean(resolved.data?.disclosedAt));

  const ev2 = await api('GET', `/api/reports/${reportId}/events`);
  const events = ev2.data || [];
  const types = new Set(events.map((e) => e.type));
  check(
    'timeline đủ 4 loại block: SUBMITTED, COMMENT, STATE_CHANGE, BOUNTY',
    ['SUBMITTED', 'COMMENT', 'STATE_CHANGE', 'BOUNTY'].every((t) => types.has(t)),
    [...types].join(', ')
  );

  const commentEvents = events.filter((e) => e.type === 'COMMENT');
  const stateEvents = events.filter((e) => e.type === 'STATE_CHANGE');
  check(
    'STATE_CHANGE kèm comment KHÔNG sinh block COMMENT trùng nội dung',
    commentEvents.every((c) => !stateEvents.some((s) => s.content && s.content === c.content))
  );

  const closedAction = await api('POST', `/api/reports/${reportId}/actions`, {
    cookieJar: adminJar,
    body: { comment: 'adding another comment' },
  });
  check('report đã đóng → mọi action bị chặn 400', closedAction.status === 400, JSON.stringify(closedAction.data));

  // ---------- 4. List & search ----------
  console.log('\n▸ Danh sách & tìm kiếm');
  const found = await api('GET', `/api/reports?q=SMOKE-${stamp}&disclosed=true`);
  check('tìm q + disclosed=true thấy report vừa xong', found.status === 200 && Array.isArray(found.data) && found.data.some((r) => r.id === reportId));

  const notDisclosed = await api('GET', `/api/reports?q=SMOKE-${stamp}&disclosed=false`);
  check(
    'disclosed=false không thấy report đã resolved',
    notDisclosed.status === 200 && Array.isArray(notDisclosed.data) && !notDisclosed.data.some((r) => r.id === reportId)
  );

  const badSeverity = await api('GET', '/api/reports?severity=SUPER');
  check('severity không hợp lệ → 400', badSeverity.status === 400);

  // ---------- 4b. Bộ lọc nâng cao & facets ----------
  console.log('\n▸ Bộ lọc nâng cao & facets');
  const byWeakness = await api('GET', `/api/reports?weakness=${encodeURIComponent(`SMOKE-${stamp}`)}`);
  check('lọc weakness chính xác', byWeakness.status === 200 && byWeakness.data.length >= 1);

  const byState = await api('GET', '/api/reports?state=RESOLVED&pageSize=100');
  check('lọc state=RESOLVED chỉ trả RESOLVED', byState.status === 200 && byState.data.every((r) => r.state === 'RESOLVED'));

  const byBounty = await api('GET', '/api/reports?bountyMin=400&bountyMax=600&disclosed=true');
  check(
    'lọc khoảng bounty 400–600',
    byBounty.status === 200 && byBounty.data.length >= 1 && byBounty.data.every((r) => r.bounty >= 400 && r.bounty <= 600)
  );

  const badState = await api('GET', '/api/reports?state=KHONG_CO');
  check('state không hợp lệ → 400', badState.status === 400);

  const facets = await api('GET', '/api/reports/facets?disclosed=true');
  check(
    'facets trả total + severities + states',
    facets.status === 200 && facets.data.total >= 1 && facets.data.severities.length > 0 && facets.data.states.length > 0
  );
  check('facets chỉ chứa giá trị đang có dữ liệu (count > 0)', facets.data.severities.every((s) => s.count > 0));

  const weakOpts = await api('GET', `/api/reports/weaknesses?search=${encodeURIComponent(`SMOKE-${stamp}`)}`);
  check(
    'weakness suggestions tìm theo tên (chỉ giá trị đang tồn tại)',
    weakOpts.status === 200 && weakOpts.data.some((w) => w.value.includes(`SMOKE-${stamp}`))
  );

  // ---------- 4c. Riêng tư của report SPAM ----------
  console.log('\n▸ Riêng tư của report SPAM (chỉ chủ nick + admin thấy)');
  const spamReport = await api('POST', '/api/reports', {
    cookieJar: r1Jar,
    body: {
      target: `spam-${stamp}.example.com`,
      weakness: `SMOKE-SPAM-${stamp}`,
      cveId: null,
      shortDescription: `Spam privacy test report ${stamp}`,
      details: '## Steps\n\n1. Content used to test the privacy rule for reports marked SPAM.',
    },
  });
  check('reporter1 tạo report để test spam → 201', spamReport.status === 201);
  const spamId = spamReport.data?.id;

  const spamAction = await api('POST', `/api/reports/${spamId}/actions`, {
    cookieJar: adminJar,
    body: { newState: 'SPAM', comment: 'Clear spam.' },
  });
  check('admin chuyển PENDING → SPAM → 200', spamAction.status === 200 && spamAction.data?.state === 'SPAM');

  const guestSpamList = await api('GET', `/api/reports?q=SMOKE-SPAM-${stamp}&disclosed=true`);
  check('khách KHÔNG thấy report SPAM trên danh sách', guestSpamList.status === 200 && !guestSpamList.data.some((r) => r.id === spamId));

  const ownerSpamList = await api('GET', `/api/reports?q=SMOKE-SPAM-${stamp}&disclosed=true`, { cookieJar: r1Jar });
  check('chủ nick vẫn thấy report SPAM của mình', ownerSpamList.status === 200 && ownerSpamList.data.some((r) => r.id === spamId));

  const adminSpamList = await api('GET', `/api/reports?q=SMOKE-SPAM-${stamp}&disclosed=true`, { cookieJar: adminJar });
  check('admin thấy report SPAM', adminSpamList.status === 200 && adminSpamList.data.some((r) => r.id === spamId));

  const guestSpamCase = await api('GET', `/api/reports/${spamId}`);
  check('khách mở trực tiếp case SPAM → 404', guestSpamCase.status === 404);
  const ownerSpamCase = await api('GET', `/api/reports/${spamId}`, { cookieJar: r1Jar });
  check('chủ nick mở case SPAM → 200', ownerSpamCase.status === 200);
  const guestSpamEvents = await api('GET', `/api/reports/${spamId}/events`);
  check('khách xem timeline SPAM → 404', guestSpamEvents.status === 404);

  const guestProfile2 = await api('GET', '/api/users/reporter1');
  check(
    'profile công khai không chứa report SPAM',
    guestProfile2.status === 200 && !guestProfile2.data.reports.some((r) => r.id === spamId)
  );
  const ownerProfile2 = await api('GET', '/api/users/reporter1', { cookieJar: r1Jar });
  const spamInOwnerProfile = ownerProfile2.data?.reports?.find((r) => r.id === spamId);
  check('profile chủ nick có report SPAM + gắn cờ isPrivate', Boolean(spamInOwnerProfile) && spamInOwnerProfile.isPrivate === true);

  // ---------- 5. Leaderboard & Profile ----------
  console.log('\n▸ Leaderboard & Profile');
  const lb = await api('GET', '/api/leaderboard?sortBy=reputation');
  check(
    'leaderboard reputation: mảng có username + reputation số',
    lb.status === 200 &&
      Array.isArray(lb.data) &&
      lb.data.length > 0 &&
      typeof lb.data[0].username === 'string' &&
      typeof lb.data[0].reputation === 'number',
    Array.isArray(lb.data) ? JSON.stringify(lb.data.slice(0, 2)) : JSON.stringify(lb.data)
  );
  check('signal là số (cột hiển thị kèm)', Boolean(lb.data?.[0]) && typeof lb.data[0].signal === 'number');
  const lbSignal = await api('GET', '/api/leaderboard?sortBy=signal');
  check('leaderboard sortBy=signal → 200', lbSignal.status === 200 && Array.isArray(lbSignal.data));

  const profilePublic = await api('GET', '/api/users/reporter1');
  check('profile công khai chỉ trả report disclosed', profilePublic.status === 200 && profilePublic.data.reports.every((r) => r.isPrivate === false));
  const profileOwner = await api('GET', '/api/users/reporter1', { cookieJar: r1Jar });
  check('chủ nick thấy cả report đang xử lý (isPrivate)', profileOwner.status === 200 && profileOwner.data.reports.some((r) => r.isPrivate === true));
  const profile404 = await api('GET', '/api/users/khong_ton_tai_xyz');
  check('profile không tồn tại → 404', profile404.status === 404);

  // ---------- 5b. Profile editor (avatar + bio) ----------
  console.log('\n▸ Profile editor (avatar + bio)');
  const anonPatch = await api('PATCH', '/api/users/me', { body: { bio: 'hello' } });
  check('PATCH /users/me không đăng nhập → 401', anonPatch.status === 401);

  const tinyAvatar =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  // Trước khi upload: endpoint trả ảnh anonymous mặc định 200 (không còn 404)
  const avatarDefault = await fetch(`${BASE}/api/users/${hacker.username}/avatar`);
  const avatarDefaultBuf = Buffer.from(await avatarDefault.arrayBuffer());
  check(
    'GET /users/:username/avatar khi chưa upload → 200 image/png (anonymous)',
    avatarDefault.status === 200 &&
      (avatarDefault.headers.get('content-type') || '').includes('image/png') &&
      avatarDefaultBuf.length > 1000
  );

  const patchProfile = await api('PATCH', '/api/users/me', {
    cookieJar: hackerJar,
    body: { bio: `Smoke bio ${stamp}`, avatar: tinyAvatar },
  });
  check(
    'cập nhật bio + avatar → 200 và trả dữ liệu mới',
    patchProfile.status === 200 && patchProfile.data?.bio === `Smoke bio ${stamp}` && patchProfile.data?.avatar === tinyAvatar,
    JSON.stringify(patchProfile.data)
  );

  // Sau khi upload: endpoint trả đúng ảnh thật vừa gửi (1×1 px, rất nhỏ so với ảnh mặc định)
  const avatarAfter = await fetch(`${BASE}/api/users/${hacker.username}/avatar`);
  const avatarAfterBuf = Buffer.from(await avatarAfter.arrayBuffer());
  check(
    'GET /users/:username/avatar sau khi upload → 200 đúng ảnh thật',
    avatarAfter.status === 200 &&
      (avatarAfter.headers.get('content-type') || '').includes('image/png') &&
      avatarAfterBuf.length > 0 &&
      avatarAfterBuf.length < 300
  );

  const patchBadBio = await api('PATCH', '/api/users/me', {
    cookieJar: hackerJar,
    body: { bio: 'x'.repeat(200) },
  });
  check('bio quá 160 ký tự → 400', patchBadBio.status === 400);

  const patchBadAvatar = await api('PATCH', '/api/users/me', {
    cookieJar: hackerJar,
    body: { avatar: 'not-a-data-url' },
  });
  check('avatar sai định dạng → 400', patchBadAvatar.status === 400);

  // ---------- 6. Logout ----------
  console.log('\n▸ Logout');
  const logout = await api('POST', '/api/auth/logout', { cookieJar: adminJar });
  check('POST /auth/logout → {ok:true}', logout.status === 200 && logout.data?.ok === true);
  const meAfter = await api('GET', '/api/auth/me', { cookieJar: adminJar });
  check('sau logout, /auth/me → 401', meAfter.status === 401);

  console.log(`\n========== KẾT QUẢ: ${passed} PASS / ${failed} FAIL ==========\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('\nKhông chạy được smoke test:', err.message);
  console.error('Kiểm tra server đã chạy chưa (npm run dev) và đã seed chưa (npm run seed).');
  process.exit(1);
});
