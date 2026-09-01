/* ═══════════════════════════════════════════════════════════════════════════
   📶 vc_quality_blindspot_harness.mjs — 화상수업 «회선품질 사각지대» 회귀 감시
      (2026-09-01, class-1015 「화면이 흐리고 소리가 끊긴다」 수리와 짝)

   [왜 문자열 검사가 아닌가]
     이 사고는 함수도 값도 전부 «있는» 상태에서 났다. 틀린 것은
       · uid 를 «어느 키에서» 가져오는가 (강사는 그 키가 없다 → 서버가 로그를 버림)
       · «보내는 쪽» 만 재는가
       · 회복 문턱이 스파이크 주기보다 짧은가
     셋뿐이라, 수리 전에도 회귀 하니스 246건이 전부 초록이었다.
     그래서 이 하니스는 **소스를 오려 내 실제로 돌린다.**

   [근거 데이터] 2026-09-01 운영 D1 vc_quality, room=class-1015-20260901, uid=ysyt01,
     14:01:40~14:21:31 의 60초 요약 20건(avg_loss / max_loss / avg_rtt)을 그대로 넣는다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '..', 'cloudflare-deploy', 'public');
const SRC = join(__dir, '..', 'cloudflare-deploy', 'src');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };

/* 실측 20분 — [평균손실, 최대손실, RTT] */
const REAL = [
  [2.0, 18.5, 167], [2.5, 23.8, 91], [1.8, 17.3, 204], [0.4, 10.8, 143], [2.3, 26.7, 166],
  [2.0, 26.9, 200], [1.2, 16.5, 52], [1.3, 21.4, 125], [1.4, 16.3, 64], [1.3, 16.4, 98],
  [1.3, 21.5, 117], [2.3, 25.9, 129], [1.2, 20.7, 72], [3.8, 23.0, 98], [6.6, 60.6, 186],
  [0.0, 0.0, 82], [2.0, 22.1, 157], [0.0, 0.0, 165], [2.3, 23.3, 139], [2.2, 20.6, 210],
];

console.log('════════ ① 회선품질 로그 — 강사 아이디가 실린다 ════════');

const qlog = readFileSync(join(PUB, 'js', 'idx-vc-qlog.js'), 'utf8');

/** 가짜 브라우저에서 idx-vc-qlog.js 를 통째로 돌린다 */
function runQlog({ student = null, admin = null, label = '', inCall = true }) {
  const sent = [];
  const store = {};
  if (admin) store['mangoi_admin_session'] = JSON.stringify(admin);
  /* 가짜 DOM — 안내 토스트·타일 표시까지 검사하려면 만들기/붙이기가 필요하다.
     ⚠️ 최소한만 만든다. 진짜 브라우저 검사는 manual/ 쪽 몫이다. */
  const made = [];
  const mkEl = (tag) => {
    const el = {
      tagName: tag, id: '', className: '', textContent: '', innerHTML: '',
      style: { cssText: '', setProperty() {}, removeProperty() {} },
      children: [],
      appendChild(c) { this.children.push(c); c.__parent = this; return c; },
      remove() { const p = this.__parent; if (p) p.children = p.children.filter(x => x !== this); },
      querySelector(sel) { return this.children.find(c => '.' + c.className === sel) || null; },
    };
    made.push(el); return el;
  };
  const boxes = {};
  const doc = {
    body: Object.assign(mkEl('body'), { classList: { contains: (c) => inCall && c === 'vc-in-call' } }),
    createElement: mkEl,
    getElementById: (id) => {
      if (id === 'vc-local-label' && label) return { textContent: label };
      if (boxes[id]) return boxes[id];
      return made.find(e => e.id === id) || null;
    },
  };
  doc.__addBox = (userId) => { const b = mkEl('div'); b.id = 'vc-video-' + userId; boxes[b.id] = b; return b; };
  const win = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null) },
    document: doc,
    vcPeerConnections: {},
    navigator: {
      sendBeacon: (_u, blob) => { sent.push(JSON.parse(blob.body)); return true; },
    },
    Blob: function (parts) { this.body = parts[0]; },
    setInterval: () => 1, clearInterval: () => {},
    fetch: () => Promise.resolve(),
  };
  win.window = win;
  const sandbox = {
    window: win, document: doc, localStorage: win.localStorage,
    navigator: win.navigator, Blob: win.Blob,
    setInterval: win.setInterval, clearInterval: win.clearInterval, fetch: win.fetch,
    getCurrentUser: student ? () => student : undefined,
    vcIsTeacherRole: () => !!admin && !student,
    vcRoomId: 'class-1015-20260901',
  };
  const fn = new Function(...Object.keys(sandbox),
    qlog + '\n;return { acc: vcQualityAcc, who: vcqWho, rx: vcqRxTick, start: vcqRxStart,'
         + ' selfWatch: vcNetSelfWatch, peerMark: vcNetPeerMark, notify: vcNetNotify };');
  const api = fn(...Object.values(sandbox));
  return { api, sent, win, doc };
}

{
  // 강사 — 학생 키가 없고 관리자 세션만 있다(실제 강사 화면의 상태)
  const t = runQlog({ admin: { uid: 'mangoi_167', name: '교사 Teacher - Farrah', role: 'teacher' } });
  const who = t.api.who();
  ok(who.uid === 'mangoi_167', `강사: 관리자 세션에서 아이디를 가져온다 (uid=${who.uid || '(빈값)'})`);
  ok(who.name === '교사 Teacher - Farrah', '강사: 이름도 함께 가져온다');

  // 학생 — 학생 키가 이긴다(기존 동작이 안 깨졌는지)
  const s = runQlog({ student: { uid: 'ysyt01', name: '유세영', role: 'student' },
                      admin: { uid: 'mangoi_167', name: '남의 세션', role: 'teacher' } });
  ok(s.api.who().uid === 'ysyt01', '학생: 학생 키가 관리자 세션보다 우선이다');

  // 둘 다 없음 — 화면 이름표로 떨어진다
  const g = runQlog({ label: '유세영 (나)' });
  ok(g.api.who().uid === '유세영', '둘 다 없으면 화면 이름표로 떨어진다(「(나)」는 뗀다)');

  // 아무 단서도 없으면 빈 값 — 서버가 버리는 옛 동작 그대로(거짓 아이디를 지어내지 않는다)
  const n = runQlog({});
  ok(n.api.who().uid === '', '단서가 없으면 아이디를 지어내지 않는다(빈 값)');
}

console.log('\n════════ ② payload — 「받는 쪽」 과 p95 가 실린다 ════════');
{
  const t = runQlog({ student: { uid: 'ysyt01', name: '유세영', role: 'student' } });
  // 60초가 지난 것으로 만들고 실측 손실을 밀어 넣는다
  t.win.__vcQ = { s: [], r: [], n: 0, rxv: [], rxa: [], rxc: [], rxf: 0, p: [], sentAt: Date.now() - 61000 };
  REAL.forEach(([a, m, r]) => { t.win.__vcQ.s.push(a, m); t.win.__vcQ.r.push(r); });
  t.api.acc(2.0, 133);
  const p = t.sent[0];
  ok(!!p, '60초가 지나면 요약을 보낸다');
  ok(p && 'rx_loss' in p && 'rx_aloss' in p && 'rx_conceal' in p && 'rx_freeze' in p,
     '받는 쪽 4종(rx_loss·rx_aloss·rx_conceal·rx_freeze)이 실린다');
  ok(p && 'p95_loss' in p && 'peers' in p, 'p95_loss·peers 가 실린다');
  ok(p && p.rx_loss === -1 && p.rx_aloss === -1 && p.rx_conceal === -1,
     '⛔ 표본이 없으면 «모름»(-1) 이다 — 0(=완벽)으로 적지 않는다');
  ok(p && p.p95_loss >= 20, `p95 가 스파이크를 드러낸다 (평균 ${p.avg_loss}% 인데 p95 ${p.p95_loss}%)`);
  ok(p && p.room === 'class-1015-20260901', '방 번호는 bare vcRoomId 로 읽는다(window.vcRoomId 아님)');
}

console.log('\n════════ ③ 수신 계측 타이머는 수업 중에만 산다 ════════');
{
  ok(!/setInterval\s*\(\s*vcqRxTick/.test(qlog) && /vcqRxStart\(\)/.test(qlog),
     '상주 타이머가 아니라 vcQualityAcc() 안에서 켠다');
  ok(/vc-in-call[\s\S]{0,200}clearInterval/.test(qlog),
     '수업이 끝나면(body.vc-in-call 없음) 스스로 끈다');
  /* ⚠️ 부정 검사는 «주석을 벗겨 낸 사본» 으로 판정한다 — 이 파일 머리말이 「MutationObserver 를
     쓰지 않는다」고 적어 두었기 때문에, 원본에서 찾으면 자기 주석을 잡아 FAIL 한다
     (CLAUDE.md 2장 「부정 검사가 자기 주석을 잡는다」 — 실제로 여기서 한 번 밟았다). */
  const bare = qlog.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  ok(!/MutationObserver/.test(bare),
     '⛔ body class MutationObserver 를 쓰지 않는다(홈 전체를 멎게 한 전력)');
}

console.log('\n════════ ④ 화질 자동조절 — 진동이 사라졌나 (실측 20분으로 실제 실행) ════════');
{
  const main = readFileSync(join(PUB, 'js', 'idx-main.js'), 'utf8');
  const i = main.indexOf('let step = pc.__qStep || 0;');
  const j = main.indexOf('if (step !== (pc.__qStep || 0))', i);
  ok(i > 0 && j > i, '적응 루프의 판정 블록을 소스에서 찾았다');
  const block = main.slice(i, j);

  /** 잘라 낸 판정 블록을 그대로 돌린다 */
  function simulate(series) {
    const decide = new Function('pc', 'lossPct', 'rtt', 'STEPS',
      block + '\n;return step;');
    const STEPS = [1.0, 0.6, 0.35, 0.2, 0.08];
    const pc = { __qStep: 0, __qGood: 0, __qBadAt: 0 };
    let flips = 0, worst = 0;
    for (const [loss, rtt] of series) {
      const next = decide(pc, loss, rtt, STEPS);
      if (next !== pc.__qStep) flips++;
      pc.__qStep = next;
      worst = Math.max(worst, next);
    }
    return { flips, end: pc.__qStep, worst };
  }

  /* 실측 패턴을 4초 틱으로 편다 — 1분마다 스파이크 1번, 나머지 14틱은 평균 근처(조용함) */
  const ticks = [];
  for (const [avg, max, rtt] of REAL) {
    for (let k = 0; k < 15; k++) ticks.push(k === 7 ? [max, rtt] : [avg, rtt]);
  }
  const now = simulate(ticks);
  ok(now.flips <= 12, `진동(단계 변경) 횟수가 20분에 ${now.flips}회로 억제됐다 (스파이크 20회 대비)`);
  ok(now.worst >= 1, '나빠질 때는 여전히 내려간다(내려가는 쪽은 안 건드렸다)');

  /* 되돌림 시험 — 옛 문턱(3틱, 홀드 없음)으로 바꾸면 실제로 진동이 늘어야 한다.
     늘지 않으면 이 검사는 헛도는 것이다. */
  const oldBlock = block
    .replace('pc.__qGood >= 8 && Date.now() - (pc.__qBadAt || 0) > 30000 && step > 0', 'pc.__qGood >= 3 && step > 0');
  const decideOld = new Function('pc', 'lossPct', 'rtt', 'STEPS', oldBlock + '\n;return step;');
  const pcOld = { __qStep: 0, __qGood: 0, __qBadAt: 0 };
  let oldFlips = 0;
  for (const [loss, rtt] of ticks) { const n = decideOld(pcOld, loss, rtt, [1, .6, .35, .2, .08]); if (n !== pcOld.__qStep) oldFlips++; pcOld.__qStep = n; }
  ok(oldFlips > now.flips, `옛 문턱으로 되돌리면 진동이 실제로 늘어난다 (옛 ${oldFlips}회 > 지금 ${now.flips}회) — 검사가 헛돌지 않는다`);
}

console.log('\n════════ ⑤ 소리 — 수신 지연 재설정과 음성전용 문턱 ════════');
{
  const main = readFileSync(join(PUB, 'js', 'idx-main.js'), 'utf8');
  const lat = main.match(/tuneReceiveLatency\(pc,([^;]+)\);/);
  ok(!!lat, 'tuneReceiveLatency 호출을 찾았다');
  ok(lat && /__qGood \|\| 0\) >= 8/.test(lat[1]) && /__qBadAt/.test(lat[1]),
     '수신 지연은 «32초 연속 양호 + 스파이크 후 30초» 일 때만 낮춘다(소리 튐 방지)');
  ok(lat && /rtt < 150/.test(lat[1]), 'RTT 기준도 250 → 150ms 로 조였다');
  ok(/if \(alp > 8 \|\| art > 600\)/.test(main),
     '음성전용(AAO) 문턱이 오디오 손실 8% 다 (실측에서 12% 는 20분 내내 한 번도 안 걸렸다)');
  ok(/A\.sev >= 3 && \(A\.floor \|\| A\.sev >= 5\)/.test(main),
     '⛔ 진입 조건(3틱 연속)은 그대로 — 스파이크 한 번으로 영상이 꺼지지 않는다');
}

console.log('\n════════ ⑥ 유령 연결 — 붙었다가 죽은 상대를 치운다 ════════');
{
  const dg = readFileSync(join(PUB, 'js', 'idx-vc-dupghost.js'), 'utf8');
  const m = dg.match(/function deadPc\(userId\)\s*\{[\s\S]*?\n  \}/);
  ok(!!m, 'deadPc() 판정 함수를 찾았다');
  const deadPc = new Function('window', m[0] + '\n;return deadPc;')({ vcPeerConnections: {
    dead1: { connectionState: 'failed', iceConnectionState: 'failed' },
    dead2: { connectionState: 'closed', iceConnectionState: 'closed' },
    blip:  { connectionState: 'disconnected', iceConnectionState: 'disconnected' },
    live:  { connectionState: 'connected', iceConnectionState: 'connected' },
  } });
  ok(deadPc('dead1') === true && deadPc('dead2') === true, 'failed·closed 는 죽은 연결로 본다');
  ok(deadPc('blip') === false, '⛔ disconnected 는 «잠깐» 이라 안 지운다(필리핀·중국 회선)');
  ok(deadPc('live') === false, '멀쩡한 연결은 건드리지 않는다');
  ok(deadPc('없는아이디') === false, '모르는 상대는 «죽었다» 고 하지 않는다');
  ok(/__vcDeadSince/.test(dg) && /dead \? box\.__vcDeadSince : box\.__vcFirstSeen/.test(dg),
     '죽은 뒤로 20초를 센다(처음 본 시각으로 세면 죽자마자 지워진다)');
  ok(/if \(mine && it\.name === mine\)/.test(dg) && /if \(liveByName\[it\.name\]\)/.test(dg),
     '⛔ 지우는 조건(내 이름 / 같은 이름이 정상 수신 중)은 그대로 — 비대칭 확인 없이는 안 지운다');
}

console.log('\n════════ ⑧ 화면 안내 — 회선이 나쁜 사람에게 «그 자리에서» 알린다 ════════');
{
  /* 🔔 자동 문자·알림톡이 불가능하므로(학생 전원 번호 0건) 이 안내가 유일하게 바로 닿는 길이다.
     그래서 «뜨는가» 만이 아니라 «함부로 안 뜨는가» 도 함께 못 박는다. */
  const t = runQlog({ student: { uid: 'juju5731', name: '박주형', role: 'student' } });
  const shown = () => t.doc.getElementById('vc-netlow-toast');

  t.api.selfWatch(2, 100); t.api.selfWatch(2, 100);
  ok(!shown(), '회선이 멀쩡하면 안 뜬다');

  for (let i = 0; i < 3; i++) t.api.selfWatch(20, 300);
  ok(!shown(), '스파이크 3틱(12초)까지는 안 뜬다 — 잠깐 흔들린 것으로 본다');
  t.api.selfWatch(20, 300);
  ok(!!shown(), '4틱(약 16초) 이어지면 뜬다');
  ok(/인터넷/.test(shown().innerHTML) && /internet/i.test(shown().innerHTML),
     '한국어와 영어를 함께 적는다(필리핀 강사도 본다)');

  const before = shown().innerHTML;
  shown().innerHTML = '(지워짐)';
  for (let i = 0; i < 6; i++) t.api.selfWatch(20, 300);
  ok(shown().innerHTML === '(지워짐)', '3분 안에는 다시 안 띄운다 — 자주 뜨면 아무도 안 읽는다');
  ok(before.length > 0, '안내 문구가 비어 있지 않다');

  /* «표본 없음»(-1) 은 판정에 쓰지 않는다 — 카메라를 끈 사람이 «회선 나쁨» 이 되면 안 된다 */
  const t2 = runQlog({ student: { uid: 'x', name: 'x', role: 'student' } });
  for (let i = 0; i < 8; i++) t2.api.selfWatch(-1, 0);
  ok(!t2.doc.getElementById('vc-netlow-toast'), '⛔ 영상 표본이 없는 틱(-1)은 «회선 나쁨» 으로 세지 않는다');

  /* 상대 타일 표시 — 강사에게만 */
  const stu = runQlog({ student: { uid: 's1', name: '학생', role: 'student' } });
  stu.doc.__addBox('peerA');
  stu.api.peerMark('peerA', true);
  ok(!stu.doc.getElementById('vc-video-peerA').querySelector('.vc-netlow-hint'),
     '⛔ 학생 화면에는 «상대 회선 나쁨» 을 안 띄운다(서로 탓하게 된다)');

  const tea = runQlog({ admin: { uid: 'mangoi_167', name: 'Teacher - Hannah', role: 'teacher' } });
  const box = tea.doc.__addBox('peerB');
  tea.api.peerMark('peerB', true);
  ok(!!box.querySelector('.vc-netlow-hint'), '강사 화면에는 그 학생 타일에 표시한다');
  tea.api.peerMark('peerB', true);
  ok(box.children.filter(c => c.className === 'vc-netlow-hint').length === 1,
     '두 번 불러도 하나만 붙는다(깜빡임 방지)');
  tea.api.peerMark('peerB', false);
  ok(!box.querySelector('.vc-netlow-hint'), '회복되면 곧바로 뗀다');
  tea.api.peerMark('없는피어', true);
  ok(true, '타일이 없는 상대에게 불러도 죽지 않는다');

  const bare2 = qlog.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  ok(/top:8px/.test(bare2) && !/vc-netlow-hint[\s\S]{0,400}bottom:8px/.test(bare2),
     '「상대 소리가 안 와요」(bottom:8px) 와 자리가 겹치지 않는다');
  ok(!/vc-aao-toast/.test(bare2),
     '⛔ 음성전용 안내와 같은 상자를 쓰지 않는다(둘은 다른 사실을 말한다)');
}

console.log('\n════════ ⑨ 관리자 목록 — 누구인지 알 수 있나 ════════');
{
  const adm = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
  ok(/e\.korean_name FROM students_erp e WHERE e\.user_id = q\.uid/.test(adm),
     '실명을 붙인다 — 예전엔 «juju5731» 만 나와 누구인지 알 수 없었다');
  ok(/e\.shop_name/.test(adm), '소속 매장도 함께 낸다(대리점 경유 연락용)');
  ok(/bad_days/.test(adm), '«손실 3% 넘은 날 수» 를 센다 — 하루치로 단정하지 않기 위해');
  ok(!/LOWER\(e\.user_id\)|LOWER\(q\.uid\)/.test(adm),
     '⛔ LOWER() 로 맞추지 않는다 — 인덱스를 못 타 전수 스캔이 된다(4.3초 사고 전례)');
  /* ⚠️ 부정 검사를 파일 전체에 걸면 **무관한 다른 코드**를 잡는다 — 이 파일 딴 곳에 멀쩡한
     `LEFT JOIN students_erp` 가 있어서 실제로 거짓 FAIL 이 났다(CLAUDE.md 2장 「부정 검사를
     «그 이름이 파일에 없다» 로 썼는데 멀쩡한 코드가 FAIL」). 그 상수 하나만 잘라서 본다. */
  const who = (adm.match(/const WHO = `[\s\S]*?`;/) || [''])[0];
  ok(who.length > 50, 'WHO 조각을 찾았다');
  ok(!/LEFT JOIN/.test(who),
     '⛔ LEFT JOIN 이 아니라 서브쿼리다 — 짝이 둘이면 행이 늘어난다');
  ok(!/students_erp[^)]*\be\.id\b/.test(adm),
     '⛔ students_erp 에는 id 칸이 없다 — user_id 를 쓴다');

  const html = readFileSync(join(PUB, 'admin.html'), 'utf8');
  ok(/x\.student_name\|\|x\.name/.test(html), '화면이 실명을 먼저 그린다');
  ok(/x\.bad_days/.test(html), '화면에 «나쁜날» 이 나온다');
  ok(/자동 문자·알림톡은 보낼 수 없습니다/.test(html),
     '화면이 «문자를 못 보낸다» 는 사실을 말한다 — 안 적으면 매니저가 문자를 찾는다');
}

console.log('\n════════ ⑦ 서버 — «모름»(-1) 을 0 으로 뒤집지 않는다 ════════');
{
  const api = readFileSync(join(SRC, 'api-mango.ts'), 'utf8');
  /* ⚠️ [^;]+ 로 자르면 화살표 본문의 첫 «;» 에서 끊긴다 — 중괄호 짝까지 가져온다 */
  const m = api.match(/const num = \(v: any, dflt: number\) => \{[\s\S]*?\};/);
  ok(!!m, '서버의 숫자 변환 함수를 찾았다');
  const num = new Function('return ' + m[0].replace('const num = ', '').replace(/: any|: number/g, '').replace(/;$/, ''))();
  ok(num(-1, -1) === -1, '-1(모름)이 그대로 -1 로 저장된다');
  ok(num(0, -1) === 0, '진짜 0% 는 0 으로 저장된다');
  ok(num(undefined, -1) === -1 && num('x', -1) === -1, '값이 없거나 이상하면 기본값(-1)이다');
  ok(!/Number\(b\.rx_loss\) \|\| 0/.test(api),
     '⛔ `Number(x) || 0` 로 쓰지 않는다 — 모름이 «완벽» 으로 뒤집힌다');
  ok(/ALTER TABLE vc_quality ADD COLUMN \$\{c\}/.test(api) && !/CREATE TABLE IF NOT EXISTS vc_quality[^`]*rx_loss/.test(api),
     '새 칸은 ALTER 로만 붙인다 (CREATE 가 두 벌이라 모양이 갈리면 안 된다)');

  const adm = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
  ok(/CASE WHEN rx_loss\s+>= 0 THEN rx_loss/.test(adm),
     '집계에서 «모름»(-1) 행을 평균에 섞지 않는다');
  ok(/rx_ready = false/.test(adm),
     '칸이 아직 없는 DB 에서는 옛 질의로 떨어진다(화면 전체가 «조회 실패» 가 되지 않는다)');
}

console.log('\n' + '═'.repeat(60));
console.log(`  ✅ PASS ${pass}   ❌ FAIL ${fail}   (총 ${pass + fail})`);
if (fail) process.exit(1);
