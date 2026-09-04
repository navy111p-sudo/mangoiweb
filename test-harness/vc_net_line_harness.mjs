/* ═══════════════════════════════════════════════════════════════════════════
   🌐 vc_net_line_harness.mjs — 「어느 인터넷 회선인가」 회귀 감시 (2026-09-03)

   [왜 문자열 검사가 아닌가] 이 기능이 틀리는 방식은 «함수가 없다» 가 아니라
     «무슨 값이 나오는가» 다 — /24 를 잘못 자르면 사무실 회선이 두 줄로 갈리고,
     본문(b)에서 net 을 받으면 위조되며, avg_loss<0 을 평균에 넣으면 영상이 죽은
     회선이 «제일 좋은 회선» 으로 뒤집힌다. 그래서 **함수를 오려 내 실제로 돌리고**
     **집계 SQL 은 진짜 SQLite 에 돌린다.**
   ⚠️ 이 컨테이너에는 cloudflare-deploy/node_modules 가 없다(esbuild 못 씀).
      그래서 TS 타입만 벗겨 new Function 으로 돌린다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', 'cloudflare-deploy', 'src');
const PUB = join(__dir, '..', 'cloudflare-deploy', 'public');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
const eq = (got, want, m) => ok(got === want, `${m} → ${JSON.stringify(got)}${got === want ? '' : ' (기대 ' + JSON.stringify(want) + ')'}`);

/* TS 타입만 벗긴다 — 로직은 한 글자도 건드리지 않는다 */
function stripTypes(s) {
  return s
    .replace(/^export /gm, '')
    .replace(/:\s*string\[\]\s*\|\s*null(?=\s*\{)/g, '')
    .replace(/\):\s*[A-Za-z_$][\w$<>,\s[\]|]*?\s*\{/g, ') {')
    .replace(/:\s*[A-Za-z_$][\w$]*(\[\])?(?=\s*[,)=])/g, '')
    .replace(/const out:\s*string\[\]/g, 'const out');
}

console.log('════════ ① ipToNet — 회선을 «묶는» 값이 실제로 나오는가 ════════');
const netSrc = readFileSync(join(SRC, 'net-prefix.ts'), 'utf8');
let ipToNet, asLabel;
{
  const body = stripTypes(netSrc);
  const fn = new Function(body + '\n;return { ipToNet, asLabel };');
  const api = fn();
  ipToNet = api.ipToNet; asLabel = api.asLabel;
  ok(typeof ipToNet === 'function' && typeof asLabel === 'function', 'net-prefix.ts 를 오려 내 실제로 돌렸다');

  /* 🔴 실측값 — 필리핀 사무실 공인 IP(admin_login_history, 2026-09-03) */
  eq(ipToNet('216.247.55.144'), '216.247.55.0/24', '필리핀 사무실 IP 를 /24 로 자른다');
  eq(ipToNet('216.247.55.9'),   '216.247.55.0/24', '같은 사무실의 다른 끝자리도 «같은 회선» 으로 묶인다');
  ok(ipToNet('216.247.55.144') !== ipToNet('216.247.53.158'),
     '8/28 에 바뀐 옛 대역(216.247.53.x)은 다른 회선으로 갈린다 — 그래서 통신사(ASN)도 함께 본다');
  eq(ipToNet('1.2.3.4'), '1.2.3.0/24', '평범한 IPv4');
  eq(ipToNet('  8.8.8.8  '), '8.8.8.0/24', '앞뒤 공백을 견딘다');
  eq(ipToNet('::ffff:216.247.55.144'), '216.247.55.0/24', 'IPv4-mapped IPv6 도 같은 회선으로 묶인다');

  /* IPv6 — 실측 로그인 기록에 실제로 있었다(2406:5900:...) */
  eq(ipToNet('2406:5900:1003:55cf:39a2:dc56:2fcc:8b9c'), '2406:5900:1003::/48', 'IPv6 를 /48 로 자른다(실측 기록)');
  eq(ipToNet('2406:5900:1003:0000:0000:0000:0000:0001'), '2406:5900:1003::/48', '같은 /48 은 한 회선');
  eq(ipToNet('2406:5900:1004:55cf:39a2:dc56:2fcc:8b9c'), '2406:5900:1004::/48', '다른 /48 은 다른 회선');
  eq(ipToNet('2406:5900:1003::1'), '2406:5900:1003::/48', '«::» 로 줄여 쓴 것도 같은 값이 된다');
  /* 앞의 0 은 «같은 값» 으로 정규화된다 — 안 하면 같은 회선이 두 줄로 갈린다 */
  eq(ipToNet('2406:5900:0003:55cf::1'), '2406:5900:3::/48', '앞의 0 을 붙여 써도 같은 값으로 정규화된다');
  eq(ipToNet('2406:5900:3::1'), '2406:5900:3::/48', '정규화된 쪽과 실제로 같은 문자열이 된다');
  /* ⛔ 한 묶음은 4자리까지다 — 5자리는 IPv6 가 아니다 */
  eq(ipToNet('2406:05900:1003:55cf::1'), '', '한 묶음이 5자리면 IPv6 가 아니다 — 빈 문자열');
  eq(ipToNet('::1'), '0:0:0::/48', '루프백도 형식이 맞으면 값이 나온다');

  /* ⛔ 못 읽는 값은 «빈 문자열» — 추측해서 아무 값이나 만들지 않는다 */
  for (const bad of ['', '   ', 'hello', '999.1.1.1', '1.2.3', '1.2.3.4.5', '1.2.3.4444',
                     '2406:5900:1003:55cf:39a2:dc56:2fcc:8b9c:extra', '2406::5900::1', 'zzzz::1']) {
    eq(ipToNet(bad), '', `못 읽는 값은 빈 문자열: ${JSON.stringify(bad)}`);
  }
  eq(ipToNet(null), '', 'null 도 빈 문자열(예외를 던지지 않는다)');
  eq(ipToNet(undefined), '', 'undefined 도 빈 문자열');
}

console.log('\n════════ ② asLabel — 통신사 이름 ════════');
{
  eq(asLabel(9299, 'PLDT'), 'AS9299 PLDT', 'ASN + 조직명');
  eq(asLabel(9299, ''), 'AS9299', '조직명이 없으면 ASN 만');
  eq(asLabel(null, 'PLDT'), 'PLDT', 'ASN 이 없으면 조직명만');
  eq(asLabel(undefined, undefined), '', '둘 다 없으면 빈 문자열 — 로컬 개발에서 request.cf 가 없는 경우');
  eq(asLabel(0, ''), '', 'ASN 0 은 값이 아니다');
  ok(asLabel(1, 'x'.repeat(200)).length <= 70, '조직명이 아무리 길어도 잘라서 넣는다');
}

console.log('\n════════ ③ 서버 — 회선 값은 «서버가 본 것» 만 쓴다 (위조 차단) ════════');
{
  const mango = readFileSync(join(SRC, 'api-mango.ts'), 'utf8');
  const i = mango.indexOf("path === '/api/vc/quality-log'");
  const j = mango.indexOf("path === '/api/_bootstrap'", i);
  ok(i > 0 && j > i, '회선품질 로깅 핸들러를 찾았다');
  const blk = mango.slice(i, j);
  ok(/ipToNet\(request\.headers\.get\('CF-Connecting-IP'\)/.test(blk),
     'IP 는 요청 헤더(CF-Connecting-IP)에서 읽는다');
  ok(/asLabel\(\s*_cf\.asn\s*,\s*_cf\.asOrganization\s*\)/.test(blk),
     '통신사는 request.cf 에서 읽는다');
  /* ⛔ 본문에서 받으면 아무나 위조할 수 있다 — 이 API 는 무인증이다(fire-and-forget) */
  /* ⚠️ 부정 검사는 반드시 주석을 벗겨 낸 사본으로 — 다음 사람이 주석에 「⛔ b.net 을 받지 말 것」
     이라고 예시를 적는 순간 거짓 FAIL 이 난다(CLAUDE.md 2장, 이 저장소가 두 번 밟은 함정). */
  const bare = blk.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  ok(!/b\.net|b\.isp|b\.country|b\.ip\b/.test(bare),
     '⛔ 본문(b)에서 net·isp·country·ip 를 받지 않는다 — 무인증 API 라 받으면 위조된다');
  /* 🪤 그 검사가 헛돌지 않는지 — 가짜로 넣어 보면 실제로 걸려야 한다 */
  ok(/b\.net/.test(bare.replace('_net,', 'b.net,')), '   (그 부정 검사는 실제로 b.net 을 잡는다 — 헛돌지 않는다)');
  /* 🔴 실패를 조용히 삼키지 않는가 — 삼키면 «로깅이 통째로 멈춘 것» 을 아무도 모르고,
     화면은 그 상태를 「아직 수집 전」으로 그린다(고장이 정상 대기로 보인다). */
  ok(/console\.(error|warn)\([^)]*vc-quality-log/.test(blk),
     '기록이 실패하면 로그를 남긴다 — 조용히 삼키지 않는다');
  ok(/\(request as any\)\.cf \|\| \{\}/.test(blk),
     'request.cf 가 없어도(로컬·테스트) 죽지 않는다');
  /* CREATE 가 두 벌이라 ALTER 로만 붙여야 한다(CLAUDE.md — novideo·rx_* 와 같은 사정) */
  const createLine = /CREATE TABLE IF NOT EXISTS vc_quality \(([^`]*)\)/.exec(blk);
  ok(!!createLine, 'vc_quality CREATE 문을 찾았다');
  ok(createLine && !/\bnet TEXT|\bisp TEXT|\bcountry TEXT/.test(createLine[1]),
     '⛔ CREATE 문에는 새 칸을 넣지 않았다 — CREATE 가 두 벌이라 먼저 실행된 쪽이 이긴다');
  ok(/ALTER TABLE vc_quality ADD COLUMN \$\{c\}/.test(blk) && /'net TEXT', 'isp TEXT', 'country TEXT'/.test(blk),
     '✅ ALTER 로만 붙인다');
  /* INSERT 의 칸 수와 값 수가 맞는가 — 어긋나면 로깅이 통째로 죽는다 */
  const ins = /INSERT INTO vc_quality \(([^)]*)\) VALUES \(([^)]*)\)/.exec(blk);
  ok(!!ins, 'INSERT 문을 찾았다');
  if (ins) {
    const cols = ins[1].split(',').length, marks = ins[2].split(',').length;
    ok(cols === marks, `INSERT 칸 수(${cols})와 물음표 수(${marks})가 같다`);
    ok(/\bnet\b/.test(ins[1]) && /\bisp\b/.test(ins[1]) && /\bcountry\b/.test(ins[1]), 'net·isp·country 를 실제로 넣는다');
  }
}

console.log('\n════════ ④ 집계 SQL — 진짜 SQLite 에 돌린다 ════════');
{
  const admin = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
  const i = admin.indexOf("if (url.searchParams.get('by') === 'net')");
  ok(i > 0, '회선별 집계 블록을 찾았다');
  const blk = admin.slice(i, admin.indexOf('const BASE = `uid', i));

  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE vc_quality (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, room TEXT, uid TEXT, name TEXT, role TEXT,
    avg_loss REAL, max_loss REAL, avg_rtt REAL, aao INTEGER, samples INTEGER, novideo INTEGER DEFAULT 0,
    rx_loss REAL DEFAULT -1, rx_aloss REAL DEFAULT -1, rx_conceal REAL DEFAULT -1, rx_freeze INTEGER DEFAULT 0,
    p95_loss REAL DEFAULT 0, peers INTEGER DEFAULT 0, net TEXT, isp TEXT, country TEXT)`);
  /* 2026-09-03 14시(KST) 사무실 회선 — 나쁨. 같은 회선의 21시는 멀쩡. 그리고 한국 학생 회선 하나. */
  const KST = (h) => Date.parse(`2026-09-03T${String(h).padStart(2, '0')}:30:00+09:00`);
  const ins = db.prepare(`INSERT INTO vc_quality (ts, room, uid, name, role, avg_loss, max_loss, avg_rtt, aao, samples, rx_conceal, rx_freeze, p95_loss, net, isp, country) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const OFF = '216.247.55.0/24', KR = '1.2.3.0/24';
  ins.run(KST(14), 'r1', 'farrah', 'Farrah', 'teacher', 1.2, 20, 900, 3, 16, 34, 12, 11, OFF, 'AS9299 PLDT', 'PH');
  ins.run(KST(14), 'r1', 'hannah', 'Hannah', 'teacher', 2.0, 18, 700, 1, 16, 20, 8, 9, OFF, 'AS9299 PLDT', 'PH');
  ins.run(KST(21), 'r2', 'hannah', 'Hannah', 'teacher', 0.4, 3, 180, 0, 16, 1.2, 1, 1, OFF, 'AS9299 PLDT', 'PH');
  ins.run(KST(14), 'r1', 'ysyt01', '유세영', 'student', 0.5, 4, 120, 0, 16, 0.8, 1, 1, KR, 'AS4766 KT', 'KR');
  /* ⛔ 영상이 없던 틱(-1)이 손실 평균에 섞이면 «제일 좋은 회선» 으로 뒤집힌다 */
  ins.run(KST(14), 'r1', 'farrah', 'Farrah', 'teacher', -1, 0, 950, 0, 0, -1, 0, 0, OFF, 'AS9299 PLDT', 'PH');
  /* net 이 빈 행(이 기능 배포 전 기록) — 목록에 끼면 «모름» 이 한 회선이 된다 */
  ins.run(KST(14), 'r1', 'old', 'Old', 'teacher', 5, 30, 500, 0, 16, 9, 3, 7, '', '', '');
  ins.run(KST(14), 'r1', 'old2', 'Old2', 'teacher', 5, 30, 500, 0, 16, 9, 3, 7, null, null, null);

  /* 소스에서 오려 낸 SELECT 를 그대로 돌린다 — 베끼지 않는다 */
  const grab = (name) => {
    const m = new RegExp('const ' + name + ' = `([\\s\\S]*?)`;').exec(blk);
    if (!m) throw new Error(name + ' 를 못 찾음');
    return m[1];
  };
  const LINES = grab('LINES'), HOURLY = grab('HOURLY');
  const since = KST(0);

  const lines = db.prepare(`SELECT ${LINES} FROM vc_quality WHERE ts >= ? AND net IS NOT NULL AND net <> '' GROUP BY net ORDER BY avg_rtt DESC LIMIT 100`).all(since);
  eq(lines.length, 2, '회선이 두 줄로 묶인다 (사무실 · 한국 학생)');
  const off = lines.find(r => r.net === OFF);
  ok(!!off, '사무실 회선이 목록에 있다');
  eq(off.people, 2, '그 회선을 쓴 사람 수를 센다 (farrah · hannah)');
  eq(off.isp, 'AS9299 PLDT', '통신사 이름이 함께 나온다');
  eq(off.country, 'PH', '나라도 함께 나온다');
  ok(off.avg_loss > 0, `⛔ 영상 없던 틱(-1)을 손실 평균에서 뺐다 → ${off.avg_loss}% (넣었으면 음수로 뒤집혔다)`);
  ok(lines[0].net === OFF, '지연이 나쁜 회선이 맨 위로 온다');
  ok(!lines.some(r => !r.net), '⛔ net 이 빈 옛 기록은 목록에 안 낀다 — «모름» 이 한 회선이 되면 안 된다');

  /* 🔴 「나쁜날」 — 지연 절대값으로 세면 이 화면이 겨냥한 회선이 매일 빨갛게 켜진다.
     필리핀·중국 회선은 평소가 360~440ms 다(2026-09-02·09-03 실측). 늘 켜진 경고는 진짜 경고를 덮는다. */
  eq(off.bad_days, 1, '사무실 회선은 «실제로 상한 날»(소리 끊김 34% · 손실)이 하루로 잡힌다');
  const kr = lines.find(r => r.net === KR);
  eq(kr.bad_days, 0, '⛔ 지연이 낮고 소리도 멀쩡한 한국 회선은 «나쁜날» 이 0 이다');
  /* 🪤 되돌림 — 옛 판정(RTT 400ms 절대값)이면 «평소가 그 정도인» 회선이 실제로 빨개지는가 */
  const oldBad = LINES.replace(/CASE WHEN rx_conceal >= 5 OR avg_loss >= 3 THEN/, 'CASE WHEN avg_rtt >= 400 THEN');
  ok(oldBad !== LINES, '되돌림 사본을 만들었다(나쁜날 판정 문자열을 찾았다)');
  const oldRows = db.prepare(`SELECT ${oldBad} FROM vc_quality WHERE ts >= ? AND net IS NOT NULL AND net <> '' GROUP BY net ORDER BY avg_rtt DESC LIMIT 100`).all(since);
  const oldOff = oldRows.find(r => r.net === OFF);
  ok(oldOff.bad_days >= off.bad_days,
     `옛 절대값(RTT 400ms)으로 되돌리면 «나쁜날» 이 실제로 늘거나 같다 (${oldOff.bad_days} ≥ ${off.bad_days}) — 검사가 헛돌지 않는다`);

  const hours = db.prepare(`SELECT ${HOURLY} FROM vc_quality WHERE ts >= ? AND net = ? GROUP BY hour ORDER BY hour`).all(since, OFF);
  eq(hours.length, 2, '시간대가 두 칸으로 나뉜다 (14시 · 21시)');
  const h14 = hours.find(r => r.hour === '14'), h21 = hours.find(r => r.hour === '21');
  ok(!!h14 && !!h21, 'KST 기준 시각으로 묶인다 (UTC 로 묶었다면 05시·12시가 나왔을 것)');
  ok(h14.avg_rtt > h21.avg_rtt, `«매일 몇 시에 막히는가» 가 보인다 — 14시 ${h14.avg_rtt}ms > 21시 ${h21.avg_rtt}ms`);
  ok(h14.avg_loss > 0, '시간대별 손실 평균에서도 «영상 없던 틱» 을 뺐다');
  eq(h21.aao_events, 0, '멀쩡한 시간대는 음성전용 전환 0');

  /* 🪤 되돌림 시험 — CASE WHEN 을 빼면 실제로 뒤집히는가. 안 뒤집히면 이 검사는 헛도는 것이다. */
  const naive = LINES.replace(/ROUND\(AVG\(CASE WHEN avg_loss >= 0 THEN avg_loss END\), 1\)/, 'ROUND(AVG(avg_loss), 1)');
  ok(naive !== LINES, '되돌림 사본을 만들었다');
  const bad = db.prepare(`SELECT ${naive} FROM vc_quality WHERE ts >= ? AND net IS NOT NULL AND net <> '' GROUP BY net ORDER BY avg_rtt DESC LIMIT 100`).all(since);
  const badOff = bad.find(r => r.net === OFF);
  ok(badOff.avg_loss < off.avg_loss,
     `되돌리면 손실이 실제로 낮게 뒤집힌다 (${badOff.avg_loss}% < ${off.avg_loss}%) — 검사가 헛돌지 않는다`);

  db.close();
}

console.log('\n════════ ⑤ 관리자 화면 배선 ════════');
{
  const html = readFileSync(join(PUB, 'admin.html'), 'utf8');
  const i = html.indexOf('id="card-vc-quality"');
  const j = html.indexOf('id="card-class-ratings"', i);
  ok(i > 0 && j > i, '회선품질 카드를 찾았다');
  const card = html.slice(i, j);
  ok(/id="vcq-by"/.test(card), '«보기» 선택(사람별·회선별)이 있다');
  ok(/vcqLoadNet\b/.test(card) && /vcqLoadNetOne\b/.test(card), '회선 목록·시간대 함수가 있다');
  /* ⛔ onclick 이 가리키는 함수가 실제로 정의돼 있어야 한다 (page_contract 와 같은 사정) */
  for (const fn of ['vcqLoad', 'vcqLoadNet', 'vcqLoadNetOne', 'vcqEsc', 'vcqDash', 'vcqRttColor']) {
    ok(new RegExp('function ' + fn + '\\s*\\(').test(card), `${fn}() 이 정의돼 있다`);
  }
  ok(/by==='net'/.test(card), 'vcqLoad 가 «회선별» 을 실제로 분기한다');
  ok(/net_ready===false/.test(card), '아직 수집 전이면 «수집 전» 이라고 말한다 (조회 실패가 아니다)');
  /* ⛔ «표본 없음» 을 0 으로 그리면 영상이 죽은 회선이 «제일 좋은 회선» 이 된다 */
  ok(/return \(v==null\)\?'—'/.test(card), '⛔ 표본 없음을 0 이 아니라 «—» 로 그린다');
  /* 화면에 그리는 값은 전부 이스케이프한다 — isp 는 통신사가 준 문자열이다 */
  ok(/vcqEsc\(x\.isp/.test(card) && /vcqEsc\(x\.net\)/.test(card), '회선·통신사 문자열을 이스케이프한다');
  ok(/id="vcq-net-detail"/.test(card), '시간대 표를 그릴 자리가 있다');
  /* ⛔ 값을 onclick 문자열에 «조립해 넣는» 자리가 없어야 한다 — JSON.stringify 는 & 를 안 막아서
     «출력이 안전한 값이라» 는 전제 하나에만 안전이 걸린다(CLAUDE.md 2장 「한 자리만 검사하고 안전하다고 결론」). */
  ok(!/onclick="vcqLoadNetOne\('\+/.test(card),
     '⛔ 회선 값을 onclick 에 조립해 넣지 않는다');
  ok(/data-vcq-net="'\+vcqEsc\(x\.net\)\+'"/.test(card) && /this\.dataset\.vcqNet/.test(card),
     '✅ data 속성에 이스케이프해 넣고 dataset 에서 읽는다 — 코드로 해석되는 자리가 없다');
}

console.log('\n════════ ⑥ 화면 함수를 «실제로 돌린다» — 무슨 HTML 이 나오는가 ════════');
{
  /* ⚠️ ⑤는 «그 글자가 있는가» 다. 이 기능이 틀리는 방식은 «무슨 값이 그려지는가» 이므로
     함수를 오려 내 가짜 DOM·가짜 fetch 로 돌린다(CLAUDE.md — 문자열 검사는 헛돈다). */
  const html = readFileSync(join(PUB, 'admin.html'), 'utf8');
  const i = html.indexOf('id="card-vc-quality"');
  const card = html.slice(i, html.indexOf('id="card-class-ratings"', i));
  const cut = (name, endMark) => {
    let a = card.indexOf('function ' + name);
    /* ⚠️ async 를 빠뜨리면 오려 낸 코드가 «await 는 async 안에서만» 으로 죽는다 */
    if (a >= 6 && card.slice(a - 6, a) === 'async ') a -= 6;
    const b = card.indexOf(endMark, a);
    if (a < 0 || b < a) throw new Error('못 오려냄: ' + name);
    return card.slice(a, b);
  };
  const src = [
    cut('vcqEsc', '\n  /* ⛔'),
    cut('vcqDash', '\n  function vcqRttColor'),
    cut('vcqRttColor', '\n\n  /* 🌐'),
    cut('vcqLoadNet', '\n  async function vcqLoadNetOne'),
    cut('vcqLoadNetOne', '\n\n  async function vcqLoad'),
  ].join('\n');

  /* 가짜 DOM — innerHTML 만 받아 두면 «무엇이 그려졌나» 를 볼 수 있다 */
  const els = { 'vcq-body': { innerHTML: '' }, 'vcq-days': { value: '7' }, 'vcq-net-detail': { innerHTML: '' } };
  let lastUrl = '';
  const mk = (payload) => new Function('document', 'fetch', 'encodeURIComponent', 'JSON', 'Math',
    src + '\n;return { vcqLoadNet, vcqLoadNetOne };')(
      { getElementById: (id) => els[id] || null },
      async (u) => { lastUrl = u; return { ok: true, json: async () => payload }; },
      encodeURIComponent, JSON, Math);

  /* 1) 아직 수집 전 — «조회 실패» 가 아니라 «수집 전» 이라고 말해야 한다 */
  /* ⚠️ ESM 은 최상위 return 이 안 된다 — top-level await 으로 기다린다 */
  await (async () => {
    let api = mk({ ok: true, net_ready: false, lines: [] });
    await api.vcqLoadNet('7');
    ok(/수집 전/.test(els['vcq-body'].innerHTML) && !/조회 실패/.test(els['vcq-body'].innerHTML),
       '칸이 아직 없으면 «수집 전» 이라고 그린다 (조회 실패가 아니다)');

    /* 2) 회선 목록 — «표본 없음»(null)을 0 으로 그리지 않는가, 이스케이프하는가 */
    api = mk({ ok: true, days: 7, net_ready: true, lines: [
      { net: '216.247.55.0/24', isp: 'AS9299 PLDT', country: 'PH', people: 2, bad_days: 3,
        avg_rtt: 850, worst_rtt: 1200, avg_loss: 1.2, rx_conceal: 34, aao_events: 4, windows: 40 },
      { net: '1.2.3.0/24', isp: '<img src=x onerror=alert(1)>', country: 'KR', people: 1, bad_days: 0,
        avg_rtt: 120, worst_rtt: 200, avg_loss: null, rx_conceal: null, aao_events: 0, windows: 16 },
    ] });
    await api.vcqLoadNet('7');
    const body = els['vcq-body'].innerHTML;
    ok(/216\.247\.55\.0\/24/.test(body), '회선 값을 그린다');
    ok(/AS9299 PLDT/.test(body), '통신사 이름을 그린다');
    ok(!/<img src=x/.test(body) && /&lt;img src=x/.test(body),
       '⛔ 통신사 문자열(외부에서 온 값)을 이스케이프한다 — 날것으로 그리지 않는다');
    ok(/—/.test(body), '⛔ 표본 없음(null)을 0% 가 아니라 «—» 로 그린다');
    ok(!/null/.test(body), '⛔ «null» 이라는 글자가 화면에 나오지 않는다');
    ok(/3일/.test(body), '나쁜날 수를 그린다');
    ok(body.indexOf('216.247.55.0/24') < body.indexOf('1.2.3.0/24'),
       '서버가 준 순서(나쁜 회선이 위)를 그대로 그린다');
    ok(/id="vcq-net-detail"/.test(body), '시간대 표를 그릴 자리를 함께 만든다');

    /* 3) 시간대 표 — KST 시각·막대·사람 목록 */
    api = mk({ ok: true, days: 7, net: '216.247.55.0/24', hours: [
      { hour: '14', windows: 30, people: 2, avg_rtt: 850, worst_rtt: 1200, avg_loss: 1.2, rx_conceal: 34 },
      { hour: '21', windows: 16, people: 1, avg_rtt: 180, worst_rtt: 260, avg_loss: 0.4, rx_conceal: null },
    ], people: [{ uid: 'farrah', name: 'Farrah', role: 'teacher', windows: 30, avg_rtt: 900 }] });
    await api.vcqLoadNetOne('216.247.55.0/24');
    const det = els['vcq-net-detail'].innerHTML;
    ok(/14시/.test(det) && /21시/.test(det), '시간대를 «14시·21시» 로 그린다');
    ok(/Farrah/.test(det), '그 회선을 쓴 사람을 함께 보여 준다');
    ok(/width:100%/.test(det), '제일 나쁜 시간대의 막대가 100% 다 (상대 길이로 그린다)');
    ok(det.indexOf('width:21%') > 0 || /width:2[01]%/.test(det), '좋은 시간대 막대는 짧다');
    ok(/net=216\.247\.55\.0%2F24/.test(lastUrl) || /net=216\.247\.55\.0\/24/.test(decodeURIComponent(lastUrl)),
       '회선 값을 URL 에 안전하게 실어 보낸다');

    console.log('\n' + '═'.repeat(60));
    console.log(`  ✅ PASS ${pass}   ❌ FAIL ${fail}   (총 ${pass + fail})`);
    if (fail) process.exit(1);
  })();
}

