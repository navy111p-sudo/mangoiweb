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
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
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
         + ' selfWatch: vcNetSelfWatch, peerMark: vcNetPeerMark, notify: vcNetNotify,'
         + ' lowqSelf: vcqLowQSelf, lowqRemote: vcLowQRemote,'
         + ' startStep: vcqStartStep, wrapCreate: vcqWrapCreatePeer, saveRtt: vcqSaveRttBase, dupTab: vcqDupTabWatch, whyLine: vcqWhyLine, wrapAAO: vcqWrapAAONotify };');
  const api = fn(...Object.values(sandbox));
  return { api, sent, win, doc, store };
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

console.log('\n════════ ④-2 높은 기준 RTT 회선 — 내려간 화질이 «돌아오는가» (2026-09-02 class-849 실측) ════════');
{
  /* [잰 것] 강선생님(중국) ↔ jeong: D1 vc_quality 19분 내내 RTT 360~435ms, 손실 1% 미만.
     [옛 코드] 회복 조건이 «rtt < 250» 절대값이라 이 회선에서는 한 번 내려가면 수업 끝까지 바닥.
     [지금]   기준 RTT(그 연결의 최소값) 대비로 재므로 조용해지면 올라온다.
     ⚠️ ④ 와 달리 시계를 «가짜로 흘려» 준다 — 홀드(30초)가 실제 시간이라 동기 루프에서는 회복이 영영 안 온다. */
  const main = readFileSync(join(PUB, 'js', 'idx-main.js'), 'utf8');
  const i = main.indexOf('let step = pc.__qStep || 0;');
  const j = main.indexOf('if (step !== (pc.__qStep || 0))', i);
  const block = main.slice(i, j);
  ok(/__qRttBase/.test(block) && /rttUp/.test(block) && /rttDown/.test(block),
     '판정 블록이 기준 RTT(__qRttBase)·상대 문턱(rttUp/rttDown)을 쓴다');

  function run(src, series) {
    let t = 0;
    const FakeDate = { now: () => t };
    const decide = new Function('pc', 'lossPct', 'rtt', 'STEPS', 'Date', src + '\n;return step;');
    const pc = { __qStep: 0, __qGood: 0, __qBadAt: 0 };
    let worst = 0, recoveredAt = -1;
    series.forEach(([loss, rtt], k) => {
      t += 4000;
      const next = decide(pc, loss, rtt, [1, .6, .35, .2, .08], FakeDate);
      if (pc.__qStep > 0 && next === 0 && recoveredAt < 0) recoveredAt = k;
      pc.__qStep = next; worst = Math.max(worst, next);
    });
    return { worst, end: pc.__qStep, recoveredAt, base: pc.__qRttBase };
  }
  /* 19분: 기준 365ms, 1분에 한 번 470ms 스파이크(옛 450 문턱을 넘음), 4분째에 «진짜 막힘» 620ms 한 번 */
  const series = [];
  for (let m = 0; m < 19; m++) for (let k = 0; k < 15; k++) {
    const spike = k === 7;
    series.push([spike ? 1.2 : 0.3, m === 3 && spike ? 620 : (spike ? 470 : 360 + (k % 3) * 5)]);
  }
  const now = run(block, series);
  ok(now.worst >= 1, `«진짜 막힘»(620ms) 에는 여전히 내려간다 (최저 단계 ${now.worst})`);
  ok(now.end === 0 && now.recoveredAt > 0,
     `조용해지면 «올라온다» — 끝 단계 ${now.end}, ${now.recoveredAt >= 0 ? Math.round(now.recoveredAt * 4 / 60) + '분째 회복' : '회복 없음'}`);
  ok(now.base >= 355 && now.base <= 375, `기준 RTT 가 그 회선의 최소값 근처로 잡혔다 (${Math.round(now.base)}ms)`);
  /* 470ms 스파이크(기준+110)는 «막힘» 이 아니라 그 회선의 흔들림 — 그것만으로 내려가면 안 된다 */
  const calm = series.filter((_, k) => Math.floor(k / 15) !== 3);
  const noBig = run(block, calm);
  ok(noBig.worst === 0, `기준+110ms 흔들림만으로는 내려가지 않는다 (최저 단계 ${noBig.worst})`);

  /* 되돌림 — 옛 절대값으로 바꾸면 «영영 바닥» 이 실제로 재현돼야 한다(안 그러면 이 검사는 헛돈다) */
  const oldSrc = block.replace(/const rttDown = [^;]+;/, 'const rttDown = 450, rttUp = 250;');
  ok(oldSrc !== block, '되돌림 시험용 옛 블록을 만들었다');
  const old = run(oldSrc, series);
  ok(old.worst >= 1 && old.end >= 1 && old.recoveredAt < 0,
     `옛 절대 문턱으로 되돌리면 실제로 바닥에 굳는다 (끝 단계 ${old.end}, 회복 없음) — 검사가 헛돌지 않는다`);

  /* 낮은 회선(기준 90ms)에서는 옛 동작과 같아야 한다 — 문턱이 450/250 으로 떨어진다 */
  const low = []; for (let k = 0; k < 40; k++) low.push([0.3, k === 10 ? 480 : 90]);
  const lowNow = run(block, low), lowOld = run(oldSrc, low);
  ok(lowNow.worst === lowOld.worst && lowNow.end === lowOld.end,
     `기준 RTT 가 낮은 회선에서는 옛 판정과 같은 답 (최저 ${lowNow.worst} / 끝 ${lowNow.end})`);

  /* ── (2026-09-02 함정 대조 검사 지적) 아래 셋은 처음 ④-2 가 못 잡던 것 — 상한 제거·드리프트 10배·28초 주기 흔들림 ── */

  /* ㉠ 기준 상한 500 — 손실 없이 RTT 만 800ms 로 «지속 혼잡» 인 회선은 회복시키지 않는다(상한을 풀면 기준이 800 까지 따라 올라가 도로 올라온다) */
  const jam = [];
  for (let k = 0; k < 20; k++) jam.push([0.3, 360]);
  jam.push([0.3, 620]);
  for (let k = 0; k < 120; k++) jam.push([0.3, 800]);
  const jamNow = run(block, jam);
  ok(jamNow.worst >= 1 && jamNow.end >= 1, `RTT 800ms 지속 혼잡에서는 올라오지 않는다 (끝 단계 ${jamNow.end}, 기준 ${Math.round(jamNow.base)} ≤ 500 상한)`);
  const noCap = block.replace(/Math\.min\(pc\.__qRttBase \|\| 0, 500\)/, '(pc.__qRttBase || 0)');
  ok(noCap !== block, '되돌림 시험용(상한 제거) 블록을 만들었다');
  const jamNoCap = run(noCap, jam);
  ok(jamNoCap.end === 0, `상한을 풀면 800ms 인 채로 도로 올라온다 (끝 단계 ${jamNoCap.end}) — 상한 검사가 헛돌지 않는다`);

  /* ㉡ 기준은 위로는 «천천히» 만 따라간다 — 첫 표본이 비정상 저값이어도 15틱(1분) 안에 기준이 실제값으로 뛰어오르지 않는다 */
  const drift = [[0.3, 100]]; for (let k = 0; k < 15; k++) drift.push([0.3, 360]);
  const dNow = run(block, drift);
  ok(dNow.base > 100 && dNow.base <= 250, `기준이 1분 동안 100 → ${Math.round(dNow.base)} 로만 올라왔다(틱당 2%)`);
  const fastDrift = block.replace('(rtt - b) * 0.02', '(rtt - b) * 0.2');
  ok(fastDrift !== block, '되돌림 시험용(드리프트 10배) 블록을 만들었다');
  ok(run(fastDrift, drift).base > 250, '드리프트를 10배로 키우면 1분 안에 실제값에 붙는다 — 드리프트 검사가 헛돌지 않는다');

  /* ㉢ 28초마다 흔들리는 회선(기준+110 스파이크가 7틱 주기) — «8틱 연속 양호» 를 매번 끊지 않아야 올라온다.
        손실 없이 RTT 만 애매한 틱은 진행을 «지우지» 말고 «멈추기» 만 한다(손실이 있으면 옛대로 지운다). */
  const jitter = [];
  for (let k = 0; k < 300; k++) jitter.push([0.3, k === 50 ? 620 : (k % 7 === 3 ? 470 : 360)]);
  const jNow = run(block, jitter);
  ok(jNow.worst >= 1 && jNow.end === 0 && jNow.recoveredAt > 50,
     `28초 주기 흔들림에서도 올라온다 (끝 단계 ${jNow.end}, ${jNow.recoveredAt > 0 ? Math.round((jNow.recoveredAt - 50) * 4 / 60) + '분 만에 회복' : '회복 없음'})`);
  const resetAll = block.replace('} else if (lossPct >= 1.5) {', '} else {');
  ok(resetAll !== block, '되돌림 시험용(애매 틱마다 리셋) 블록을 만들었다');
  const jOld = run(resetAll, jitter);
  ok(jOld.end >= 1 && jOld.recoveredAt < 0, `애매 틱마다 지우면 영영 못 올라온다 (끝 단계 ${jOld.end}) — 검사가 헛돌지 않는다`);
  /* 손실이 있는 틱은 여전히 지운다 — 손실 2% 가 7틱마다 오면 옛대로 안 올라온다 */
  const lossy = [];
  for (let k = 0; k < 300; k++) lossy.push([k % 7 === 3 ? 2.0 : 0.3, k === 50 ? 620 : 360]);
  const lNow = run(block, lossy);
  ok(lNow.worst >= 1 && lNow.recoveredAt < 0, `손실 2% 가 28초마다 오면 «조용함» 을 매번 다시 센다 (끝 단계 ${lNow.end}, 회복 없음)`);
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

  /* 🔴 2026-09-02 class-849 — 사장님이 19분 내내 토스트를 못 보셨다. 조건 미달이 아니라
     «제일 나쁜 틱» 이 판정에서 통째로 빠져 있었다. loss === -1 은 «손실을 모른다» 일 뿐
     «RTT 를 모른다» 가 아닌데, 옛 코드는 첫 줄에서 return 했다.
     실측: RTT 가 제일 높았던 두 창이 novideo 13/15 · 11/15 였다 = 그 틱들이 전부 -1.
     ⚠️ 이 검사는 «-1 은 세지 않는다»(바로 위) 와 짝이다 — 한쪽만 두면 반대로 무너진다. */
  {
    const t3 = runQlog({ student: { uid: 'y', name: 'y', role: 'student' } });
    for (let i = 0; i < 3; i++) t3.api.selfWatch(0.5, 130);      // 기준 RTT 를 130 으로 만든다
    ok(!t3.doc.getElementById('vc-netlow-toast'), '기준 RTT 를 잡는 동안에는 안 뜬다');
    for (let i = 0; i < 4; i++) t3.api.selfWatch(-1, 500);       // 영상은 죽었고 RTT 만 살아 있다
    ok(!!t3.doc.getElementById('vc-netlow-toast'),
       '🔴 영상 표본이 없어도(-1) RTT 가 계속 높으면 뜬다 — 옛 코드는 여기서 통째로 건너뛰었다');
  }

  /* 🌏 문턱은 «이 회선의 기준값» 대비다(#771 이 화질 회복 문턱에 쓴 것과 같은 방식).
     중국 강사 회선은 평소가 360~440ms 라(같은 수업 실측) 절대값 400 이면 정상 통화 중에
     «공유기 가까이 가세요» 가 뜬다 — 지리적 거리는 사람이 못 고치므로 틀린 안내다. */
  {
    const t4 = runQlog({ admin: { uid: 'hq_t_kang', name: '교사 강선생님', role: 'teacher' } });
    for (let i = 0; i < 20; i++) t4.api.selfWatch(0.2, 360);     // 중국 회선의 «평소»
    ok(!t4.doc.getElementById('vc-netlow-toast'),
       '⛔ 기준이 높은 회선(중국 360ms)은 평소 값으로 안 뜬다 — 옛 절대값 400 은 여기서 오경보였다');
    for (let i = 0; i < 6; i++) t4.api.selfWatch(0.2, 430);      // 실측에서 나온 스파이크 폭
    ok(!t4.doc.getElementById('vc-netlow-toast'),
       '⛔ 기준 대비 +70ms 스파이크로도 안 뜬다(실측 430ms)');
    for (let i = 0; i < 4; i++) t4.api.selfWatch(0.2, 620);      // 기준 대비 +260 = 진짜 막힘
    ok(!!t4.doc.getElementById('vc-netlow-toast'),
       '기준보다 200ms 넘게 막히면 그때는 뜬다');
  }

  /* ⛔ 기준이 낮은 국내 회선은 예전 숫자(400) 그대로다 — 이번 변경으로 더 둔해지면 안 된다 */
  {
    const t5 = runQlog({ student: { uid: 'z', name: 'z', role: 'student' } });
    for (let i = 0; i < 5; i++) t5.api.selfWatch(0.3, 130);
    for (let i = 0; i < 4; i++) t5.api.selfWatch(0.3, 410);
    ok(!!t5.doc.getElementById('vc-netlow-toast'),
       '국내 회선(기준 130ms)은 410ms 가 이어지면 예전처럼 뜬다');
  }

  /* 🔴 계속 나쁜 회선이 «자기 나쁜 값» 을 평소로 학습해 스스로 정상이 되면 안 된다.
     기준을 매 틱 올리면 16틱(약 64초) 만에 문턱이 410 위로 올라가, 3분 쿨다운이 끝날 무렵엔
     이미 «정상» 이라 두 번째 토스트가 영영 안 뜬다 — 옛 절대값(400) 때는 3분마다 반복했으니
     그건 «되던 것» 을 깨는 것이다. ⇒ 기준은 «나쁘지 않은 틱» 에서만 위로 따라간다. */
  {
    const t6 = runQlog({ student: { uid: 'heys', name: '이수현', role: 'student' } });
    for (let i = 0; i < 5; i++) t6.api.selfWatch(0.3, 130);        // 평소 130ms
    for (let i = 0; i < 4; i++) t6.api.selfWatch(0.3, 410);        // 나빠짐 → 1회차
    ok(!!t6.doc.getElementById('vc-netlow-toast'), '지속 불량 — 첫 토스트가 뜬다');
    t6.doc.getElementById('vc-netlow-toast').innerHTML = '(1회차)';
    /* 3분(쿨다운)이 지나도록 계속 나쁜 상태를 유지한다 — 45틱 = 180초 */
    for (let i = 0; i < 45; i++) t6.api.selfWatch(0.3, 410);
    t6.win.__vcNetSelf.notifiedAt = 0;                              // 쿨다운만 지난 것으로 둔다
    for (let i = 0; i < 4; i++) t6.api.selfWatch(0.3, 410);
    ok(t6.doc.getElementById('vc-netlow-toast').innerHTML !== '(1회차)',
       '🔴 3분 뒤에도 여전히 나쁘면 다시 뜬다 — 기준이 나쁜 값을 «평소» 로 학습하면 안 된다');
  }

  /* ⛔ 앞 수업의 기준 RTT·연속카운트가 다음 수업으로 넘어가면 안 된다.
     ⚠️ 정리는 4초 인터벌 콜백 «안» 에서 일어나 가짜 DOM 으로는 못 돌린다 —
     그래서 바로 아래 `__vcLowQ` 검사와 같은 방식으로 «그 자리에 있는가» 로 본다(같은 한계). */
  {
    const startFn = qlog.slice(qlog.indexOf('function vcqRxStart'));
    ok(/__vcNetSelf = null/.test(startFn),
       '수업이 끝나면 회선 경고 상태(__vcNetSelf)도 함께 비운다 — 안 비우면 앞 수업 기준값이 넘어간다');
  }

  /* ⚠️ 그룹수업 — __vcNetSelf 는 전역 하나인데 vcQualityAcc 는 상대마다 불린다(소스 주석 참고).
     가까운 상대와 먼 상대가 번갈아 들어와도 4틱 연속 조건이 완충한다. */
  {
    const t8 = runQlog({ student: { uid: 'g', name: 'g', role: 'student' } });
    for (let i = 0; i < 30; i++) { t8.api.selfWatch(0.3, 80); t8.api.selfWatch(0.3, 400); }
    ok(!t8.doc.getElementById('vc-netlow-toast'),
       '⛔ 상대가 둘이고 한쪽만 멀면(80ms·400ms 번갈아) 안 뜬다 — 번갈아 오는 값으로 오경보하지 않는다');
  }

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

console.log('\n════════ ⑩ 유령 연결 — «패킷이 오는가» 로 죽은 상대를 가린다 ════════');
{
  /* 🔴 2026-09-01 실사고 재현 — class-1070-20260901 은 출석이 학생1·강사1(2명)뿐인데
     학생 브라우저의 연결 수가 26분간 1→9 로 늘었다(8개가 유령). 원인은 화면 청소기가
     `track.readyState === 'live'` 로 판정한 것 — 원격 트랙은 상대가 사라져도 'live' 다.
     그래서 여기서는 «패킷이 실제로 오는가» 를 **실제로 돌려서** 확인한다. */
  const flush = () => new Promise((r) => setTimeout(r, 0));

  function rxRig() {
    const t = runQlog({ student: { uid: 's', name: 's', role: 'student' } });
    const pk = { video: 0, audio: 0 };
    const mkRecv = (kind) => ({
      track: { kind },
      getStats: () => Promise.resolve([{ type: 'inbound-rtp', packetsLost: 0, packetsReceived: pk[kind],
                                         freezeCount: 0, concealedSamples: 0, totalSamplesReceived: 0 }]),
    });
    t.win.vcPeerConnections = { ghost1: { getReceivers: () => [mkRecv('video'), mkRecv('audio')] } };
    t.win.__vcQ = { s: [], r: [], n: 0, rxv: [], rxa: [], rxc: [], rxf: 0, p: [], sentAt: Date.now() };
    return { t, pk };
  }

  const { t, pk } = rxRig();
  const nm = () => t.win.vcPeerNoMedia('ghost1');
  ok(nm() === 0, '모르는 상대는 «침묵 0초» 다(«죽었다» 고 하지 않는다)');

  pk.video = 100; pk.audio = 100;
  await t.api.rx(); await flush();
  ok(nm() === 0, '첫 틱은 기준값이 없어 세지 않는다 — 막 붙은 상대가 죽은 것이 되면 안 된다');

  /* 패킷이 멎었다 — 15틱(60초) */
  for (let i = 0; i < 15; i++) { await t.api.rx(); await flush(); }
  ok(nm() >= 60, `패킷이 멎으면 침묵 시간이 쌓인다 (${nm()}초)`);

  /* 다시 오기 시작하면 0 으로 되돌아간다 */
  pk.video += 50; pk.audio += 50;
  await t.api.rx(); await flush();
  ok(nm() === 0, '패킷이 다시 오면 곧바로 0 으로 돌아간다');

  /* 🎥 카메라만 끈 사람 — 영상은 멎어도 오디오가 흐르면 죽은 것이 아니다 */
  const { t: t2, pk: pk2 } = rxRig();
  pk2.video = 10; pk2.audio = 10;
  await t2.api.rx(); await flush();
  for (let i = 0; i < 20; i++) { pk2.audio += 50; await t2.api.rx(); await flush(); }
  ok(t2.win.vcPeerNoMedia('ghost1') === 0,
     '⛔ 카메라만 끈 사람을 «죽었다» 고 하지 않는다(오디오가 흐르면 살아 있다)');

  /* 🎤 반대 경우 — 마이크만 끈 사람. 위 시험만 두면 «둘 중 작은 값» 이 아니라
     «마지막에 본 값» 을 쓰는 실수를 못 잡는다(변이시험에서 실제로 안 잡혔다). */
  const { t: t3, pk: pk3 } = rxRig();
  pk3.video = 10; pk3.audio = 10;
  await t3.api.rx(); await flush();
  for (let i = 0; i < 20; i++) { pk3.video += 50; await t3.api.rx(); await flush(); }
  ok(t3.win.vcPeerNoMedia('ghost1') === 0,
     '⛔ 마이크만 끈 사람도 «죽었다» 고 하지 않는다(영상이 흐르면 살아 있다)');

  /* 청소기 쪽 배선 */
  const dg = readFileSync(join(PUB, 'js', 'idx-vc-dupghost.js'), 'utf8');
  ok(/window\.vcPeerNoMedia/.test(dg) && /SILENT_MS/.test(dg),
     '청소기가 «패킷이 오는가» 를 함께 본다');
  ok(/deadPc\(userId\) \|\| noMediaMs\(userId\) >= SILENT_MS/.test(dg),
     '연결 상태(failed/closed) 「또는」 60초 침묵이면 죽은 것으로 본다');
  ok(/typeof window\.vcPeerNoMedia !== 'function'\) return 0/.test(dg),
     '⛔ 그 함수가 아직 없으면 0 을 돌려 «옛 동작 그대로» 안전하다(defer 로드 순서)');
  ok(/if \(mine && it\.name === mine\)/.test(dg) && /if \(liveByName\[it\.name\]\)/.test(dg),
     '⛔ 비대칭 확인(내 이름 / 같은 이름이 정상 수신 중)은 그대로 — 혼자 있는 상대는 절대 안 지운다');

  const m = dg.match(/var SILENT_MS = (\d+);/);
  ok(!!m && Number(m[1]) >= 30000,
     `침묵 임계값이 30초 이상이다 (${m ? m[1] : '?'}ms) — 짧게 잡으면 잠깐 끊긴 사람을 지운다`);
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

console.log('\n════════ ⑪ 저화질 배지 — «왜 흐린지» 를 타일에 적는다(크기는 안 건드린다) ════════');
{
  const t = runQlog({ student: { uid: 'jeong', name: 'jeong', role: 'student' } });
  const local = t.doc.createElement('div'); local.id = 'vc-local-box';
  const badge = (box) => box.querySelector('.vc-lowq-hint');

  /* 보내는 쪽 — 상대 하나라도 3단계 이상이면 내 타일에 */
  t.win.vcPeerConnections = { a: { __qStep: 2 }, b: { __qStep: 0 } };
  t.api.lowqSelf(); t.api.lowqSelf();
  ok(!badge(local), '2단계(해상도 1/2)까지는 안 붙는다');
  t.win.vcPeerConnections = { a: { __qStep: 4 }, b: { __qStep: 0 } };
  t.api.lowqSelf();
  ok(!badge(local), '한 틱(4초)만으로는 안 붙는다 — 흔들림 한 번에 깜빡이지 않게');
  t.api.lowqSelf();
  ok(!!badge(local), '2틱(8초) 이어지면 내 타일에 «저화질로 보내는 중» 이 붙는다');
  ok(/저화질/.test(badge(local).textContent) && /low quality/i.test(badge(local).textContent), '한국어·영어를 함께 적는다');
  t.api.lowqSelf();
  ok(local.children.filter(c => c.className === 'vc-lowq-hint').length === 1, '계속 저화질이어도 하나만 붙는다(깜빡임 방지)');
  ok(!local.style.width && !local.style.height && !local.style.transform && local.style.position === 'relative'
     && /^position:absolute/.test(badge(local).style.cssText) && !/transform:\s*scale/.test(badge(local).style.cssText),
     '⛔ 배지는 타일 크기를 건드리지 않는다(자동 축소 없음) — 타일에는 position:relative 만, 배지는 absolute 로 얹는다');
  t.win.vcPeerConnections = { a: { __qStep: 0 } };
  t.api.lowqSelf();
  ok(!badge(local), '회복되면 곧바로 뗀다');

  /* 받는 쪽 — 오는 영상의 가로폭으로. 모든 화면에(문구가 상대를 탓하지 않는다) */
  const box = t.doc.__addBox('p1');
  t.api.lowqRemote('p1', 1280, true);                        // PC 카메라의 «정상» 폭을 먼저 본다
  t.api.lowqRemote('p1', 320, true);
  ok(!badge(box), '받는 쪽도 한 틱만으로는 안 붙는다');
  t.api.lowqRemote('p1', 320, true);
  ok(!!badge(box), '1280 을 보던 상대가 320px(1/4) 로 2틱 이어지면 그 타일에 «저화질로 받는 중» 이 붙는다');
  ok(!/학생|상대|불안정/.test(badge(box).textContent), '⛔ 학생 화면에도 뜨므로 «상대 탓» 하는 말을 쓰지 않는다');
  t.api.lowqRemote('p1', 640, true);
  ok(!badge(box), '가로폭이 돌아오면 곧바로 뗀다');
  t.api.lowqRemote('p1', 320, false); t.api.lowqRemote('p1', 320, false); t.api.lowqRemote('p1', 320, false);
  ok(!badge(box), '⛔ 영상 패킷이 안 오면(카메라 끔·음성전용) «저화질» 로 세지 않는다 — 모름은 뗀다');
  t.api.lowqRemote('p1', 0, true); t.api.lowqRemote('p1', 0, true);
  ok(!badge(box), '가로폭 0(통계 없음)도 «모름» — 안 붙는다');
  t.api.lowqRemote('없는피어', 320, true);
  ok(true, '타일이 없는 상대에게 불러도 죽지 않는다');
  /* 폰 송신자(640) — 함정 대조 검사 지적: 절대값 430 이면 폰은 1단계(427)부터 걸린다 */
  const ph = t.doc.__addBox('phone');
  t.api.lowqRemote('phone', 640, true);
  t.api.lowqRemote('phone', 427, true); t.api.lowqRemote('phone', 427, true); t.api.lowqRemote('phone', 427, true);
  ok(!badge(ph), '⛔ 폰(640) 이 1단계(427px) 로 보내는 것은 «저화질» 이 아니다');
  t.api.lowqRemote('phone', 320, true); t.api.lowqRemote('phone', 320, true);
  ok(!badge(ph), '폰 2단계(320px, 1/2)도 아직 아니다 — PC 2단계(640)와 같은 기준');
  t.api.lowqRemote('phone', 213, true); t.api.lowqRemote('phone', 213, true);
  ok(!!badge(ph), '폰 3단계(213px, 1/3) 부터 붙는다 — PC 와 같은 «단계» 기준');
  /* PC 2단계(640)는 안 붙는다 */
  const pc2 = t.doc.__addBox('pc2');
  t.api.lowqRemote('pc2', 1280, true); t.api.lowqRemote('pc2', 640, true); t.api.lowqRemote('pc2', 640, true); t.api.lowqRemote('pc2', 640, true);
  ok(!badge(pc2), 'PC 2단계(640px, 1/2)는 안 붙는다');
  /* 최대 폭을 못 본 상대(처음부터 바닥) — 절대 하한으로 잡는다 */
  const cold = t.doc.__addBox('cold');
  t.api.lowqRemote('cold', 213, true); t.api.lowqRemote('cold', 213, true);
  ok(!!badge(cold), '정상 폭을 본 적 없어도 213px 이면 붙는다(절대 하한)');
  const cold2 = t.doc.__addBox('cold2');
  t.api.lowqRemote('cold2', 320, true); t.api.lowqRemote('cold2', 320, true);
  ok(!badge(cold2), '정상 폭을 본 적 없는 320px 는 «모름» — 폰 정상(480 세로)과 못 가르므로 안 붙는다');
  /* 음성전용 중에는 «보내는 중» 을 안 붙인다 */
  const aaoT = runQlog({ student: { uid: 'a', name: 'a', role: 'student' } });
  const aaoLocal = aaoT.doc.createElement('div'); aaoLocal.id = 'vc-local-box';
  aaoT.win.vcPeerConnections = { x: { __qStep: 4 } };
  aaoT.win.__vcAAO = { active: true };
  aaoT.api.lowqSelf(); aaoT.api.lowqSelf(); aaoT.api.lowqSelf();
  ok(!badge(aaoLocal), '⛔ 음성전용(AAO) 중에는 «저화질로 보내는 중» 을 안 붙인다 — 영상을 안 보내는 것이지 저화질이 아니다');
  aaoT.win.__vcAAO = { active: false };
  aaoT.api.lowqSelf(); aaoT.api.lowqSelf();
  ok(!!badge(aaoLocal), 'AAO 가 풀리고 단계가 그대로 바닥이면 그때 붙는다');

  /* 문턱이 idx-main.js 의 실제 단계표와 맞는가 — 3단계는 해상도 1/3·비트레이트 20% 라 «흐림» 이 보이는 첫 단계 */
  const main = readFileSync(join(PUB, 'js', 'idx-main.js'), 'utf8');
  const steps = main.match(/const STEPS = \[([^\]]+)\]/);
  const scale = main.match(/const SCALE = \[([^\]]+)\]/);
  const stepIdx = Number((qlog.match(/var VC_LOWQ_STEP = (\d+)/) || [])[1]);
  const ratio = Number((qlog.match(/var VC_LOWQ_RATIO = ([\d.]+)/) || [])[1]);
  const absW = Number((qlog.match(/var VC_LOWQ_ABS = (\d+)/) || [])[1]);
  ok(steps && scale && stepIdx >= 1, `배지 단계 문턱(${stepIdx})과 STEPS·SCALE 표를 찾았다`);
  const mult = steps ? Number(steps[1].split(',')[stepIdx]) : 1;
  const div = scale ? Number(scale[1].split(',')[stepIdx]) : 1;
  ok(mult <= 0.25 && div >= 3, `그 단계는 비트레이트 ${mult * 100}%·해상도 1/${div} — 흐림이 보이는 단계다`);
  const prevDiv = scale ? Number(scale[1].split(',')[stepIdx - 1]) : 1;
  ok(ratio > prevDiv && ratio <= div,
     `받는 쪽 비율 문턱 1/${ratio} 는 그 단계(1/${div})부터 잡고 앞 단계(1/${prevDiv})는 안 잡는다 — PC·폰 공통`);
  ok(absW < 640 / prevDiv && absW >= 640 / div - 1,
     `절대 하한 ${absW}px 는 폰(640) 앞 단계(${Math.round(640 / prevDiv)}px)는 안 잡고 그 단계(${Math.round(640 / div)}px)는 잡는다`);
  /* 배선 — 틱에서 실제로 부르는가. ⚠️ 주석을 벗긴 사본으로 본다(주석 처리해도 통과하던 구멍 — 함정 대조 검사 지적) */
  const bare = qlog.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\/\/[^\n]*$/gm, '');
  const tick = bare.slice(bare.indexOf('function vcqRxTick'), bare.indexOf('function vcqRxStart'));
  ok(/vcqLowQSelf\(\)/.test(tick) && /vcLowQRemote\(id, s\.frameWidth \|\| 0, dr > 0\)/.test(tick),
     '4초 틱이 보내는 쪽·받는 쪽 배지를 둘 다 부르고, 받는 쪽에 «패킷이 오는가»(dr > 0)를 넘긴다');
  ok(/__vcLowQ = \{\}/.test(qlog.slice(qlog.indexOf('function vcqRxStart'))), '수업이 끝나면 배지 상태를 비운다');
}

console.log('\n════════ ⑫ 음성전용(AAO) — «켜졌다 꺼졌다» 깜빡임 (2026-09-03 class-1016 Farrah↔ysyt01 실측) ════════');
{
  /* [근거] 운영 D1 vc_quality, room=class-1016-20260903 — 21분 동안 aao 칸이 0/1 을 6번 오갔다
       (강사·학생 각각). RTT 600~1,200ms · 끊긴 소리 30~44%. 사장님 「화면이 나왔다 안 나왔다 on/off」.
     [뿌리 — 추론] 복구가 good>=2(8초)라 회선이 계속 흔들리면 «끔 → 8초 뒤 켬 → 다시 끔» 이 된다.
       aao 칸은 60초 점 표본이라 «8초 주기» 자체를 D1 로 본 것은 아니다. 코드상 성립하는 기전이고, 아래가 그것을 실제로 돌려 보인다.
     [검사] 판정 3줄과 vcAAOApply 를 소스에서 오려 내 실제로 돌린다. 문자열로 «>= 8» 을 찾지 않는다. */
  const main = readFileSync(join(PUB, 'js', 'idx-main.js'), 'utf8');
  const ji = main.indexOf('if (alp > 8 || art > 600)');
  const jEndS = 'else { A.good = 0; }';
  const jj = main.indexOf(jEndS, ji);
  ok(ji > 0 && jj > ji, 'AAO 판정 3줄(손실↑ / 회복 / 애매)을 소스에서 찾았다');
  const judge = main.slice(ji, jj + jEndS.length);
  const blockAt = (src, start) => {
    const o = src.indexOf('{', start); let d = 0;
    for (let k = o; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(start, k + 1); } }
    return '';
  };
  const fi = main.indexOf('function vcAAOApply()');
  const applySrc = blockAt(main, fi);
  ok(fi > 0 && applySrc.length > 300, 'vcAAOApply 를 중괄호 짝으로 오려 냈다');

  /** 판정 + 적용을 4초 틱으로 돌린다. series = [[오디오 손실%, RTT], …]. floor = 화질이 이미 바닥(진입 조건) */
  function simulate(series, src = applySrc) {
    const A = { active: false, sev: 0, good: 0, floor: true };
    const track = { enabled: true };
    const win = { __vcAAO: A, vcLocalStream: { getVideoTracks: () => [track] }, vcBg: null };
    const env = { window: win, vcCamOn: true, vcAAONotify() {}, vcBroadcastCamState() {},
                  console: { warn() {} }, vcLocalStream: win.vcLocalStream, vcBg: null };
    const apply = new Function(...Object.keys(env), src + '\n;return vcAAOApply;')(...Object.values(env));
    const judgeFn = new Function('alp', 'art', 'A', judge);
    let flips = 0, prev = false; const trace = [];
    for (const [alp, art] of series) {
      judgeFn(alp, art, A); apply();
      if (A.active !== prev) { flips++; prev = A.active; }
      trace.push(A.active ? 1 : 0);
    }
    return { flips, active: A.active, trace, track };
  }
  const rep = (n, v) => Array.from({ length: n }, () => v);
  const BAD = [15, 700], GOOD = [1, 500];

  /* class-1016 모양 — «나쁨 4틱(16초) → 조용 6틱(24초)» 이 6번. 옛 코드는 매번 켜졌다 꺼졌다. */
  const shaky = [];
  for (let c = 0; c < 6; c++) shaky.push(...rep(4, BAD), ...rep(6, GOOD));
  const now = simulate(shaky);
  ok(now.flips === 1 && now.active === true,
     `흔들리는 4분 동안 음성전용에 한 번 들어가 «그대로 머문다» (전환 ${now.flips}회, 옛 8초 복구면 매 주기 켜짐)`);
  ok(now.track.enabled === false, '머무는 동안 내 영상 트랙은 꺼져 있다(대역폭을 실제로 아낀다)');

  /* 진짜 조용해지면 돌아온다 — 8틱(32초) 연속 손실 3% 미만 */
  const calm = simulate([...rep(4, BAD), ...rep(8, GOOD)]);
  ok(calm.active === false && calm.track.enabled === true, '32초(8틱) 연속 조용하면 영상이 돌아온다');
  const almost = simulate([...rep(4, BAD), ...rep(7, GOOD)]);
  ok(almost.active === true, '28초(7틱)로는 아직 안 돌아온다 — 회복은 «32초 연속 조용함»');
  const relapse = simulate([...rep(4, BAD), ...rep(7, GOOD), [5, 500], ...rep(7, GOOD)]);
  ok(relapse.active === true, '중간에 3~8% 애매한 틱이 한 번 끼면 처음부터 다시 센다(옛 화질 회복과 같은 규칙)');

  /* ⛔ 진입은 그대로 — 3틱(12초) 연속이어야 끄고, 조용한 회선은 영영 안 끈다 */
  const two = simulate(rep(2, BAD));
  ok(two.active === false, '나쁜 틱 2번(8초)으로는 안 끈다');
  const three = simulate(rep(3, BAD));
  ok(three.active === true && three.trace.indexOf(1) === 2, '나쁜 틱 3번째(12초)에 끈다 — 진입 시점은 안 바뀌었다');
  const quiet = simulate(rep(40, GOOD));
  ok(quiet.flips === 0, '조용한 회선(40틱)에서는 한 번도 안 끈다');
  ok(/A\.active = true; A\.good = 0;/.test(applySrc), '진입할 때 «조용함» 카운트를 0 부터 다시 센다');

  /* 되돌림 시험 — 복구를 옛 good>=2 로 바꾸면 같은 패턴에서 실제로 깜빡여야 한다. 안 늘면 이 검사는 헛도는 것이다. */
  const oldSrc = applySrc.replace('A.active && A.good >= 8', 'A.active && A.good >= 2');
  ok(oldSrc !== applySrc, '되돌림 사본을 만들었다(복구 문턱 문자열을 찾았다)');
  const old = simulate(shaky, oldSrc);
  ok(old.flips >= 8 && old.flips > now.flips,
     `옛 복구(8초)로 되돌리면 같은 4분에 ${old.flips}회 켜졌다 꺼졌다 — 검사가 헛돌지 않는다`);
}

console.log('\n════════ ⑬ 경로(중계/직접) — «어떤 길로 갔는가» 가 실린다 (2026-09-03 Farrah 1초→60ms) ════════');
{
  /* [왜] class-1016·meet-123 에서 RTT 1,100~1,700ms 가 2분 뒤 60~85ms 로 떨어졌는데
     «경로가 바뀐 것인지 회선이 풀린 것인지» 가릴 칸이 없었다. 이 절은 getStats 의 candidate-pair 를
     가짜로 넣어 payload 에 path·turn·relay_ticks·path_ticks 가 실리는지 **실제로 돌려** 본다.
     ⛔ «모름» 이 «직접» 으로 적히면 이 칸을 만든 이유가 사라진다 — 그 검사가 핵심이다. */
  const flush = () => new Promise((r) => setTimeout(r, 0));
  function statsOf(localType, remoteType, url, proto) {
    const rows = [
      { id: 'T1', type: 'transport', selectedCandidatePairId: 'CP1' },
      { id: 'CP1', type: 'candidate-pair', localCandidateId: 'L1', remoteCandidateId: 'R1', nominated: true, state: 'succeeded' },
      { id: 'L1', type: 'local-candidate', candidateType: localType, url: url, relayProtocol: proto },
      { id: 'R1', type: 'remote-candidate', candidateType: remoteType },
    ];
    return { forEach: (f) => rows.forEach((r) => f(r, r.id)) };   // RTCStatsReport 는 Map 이라 forEach(value, key)
  }
  function rig(pcs) {
    const t = runQlog({ admin: { uid: 'mangoi_018', name: 'Teacher - Farrah', role: 'teacher' } });
    t.win.vcPeerConnections = pcs;
    t.win.__vcQ = { s: [], r: [], n: 0, rxv: [], rxa: [], rxc: [], rxf: 0, p: [], pt: 0, pr: 0, turn: '', proto: '', sentAt: Date.now() - 61000 };
    return t;
  }
  async function ticks(t, n) { for (let i = 0; i < n; i++) { await t.api.rx(); await flush(); } }
  function payload(t) { t.api.acc(1.0, 300); return t.sent[0]; }

  /* ⓐ 내 쪽이 Cloudflare TURN 중계 */
  const relayT = rig({ s1: { getReceivers: () => [], getStats: () => Promise.resolve(statsOf('relay', 'srflx', 'turn:turn.cloudflare.com:3478?transport=udp', 'udp')) } });
  await ticks(relayT, 5);
  const pr = payload(relayT);
  ok(!!pr && pr.path === 'relay', `내 쪽이 relay 후보면 path='relay' (${pr && pr.path})`);
  ok(!!pr && pr.relay_ticks === 5 && pr.path_ticks === 5, `5틱 전부 중계로 센다 (relay ${pr && pr.relay_ticks} / ${pr && pr.path_ticks})`);
  ok(!!pr && /^turn\.cloudflare\.com:3478 udp$/.test(pr.turn), `TURN 서버가 host:port proto 로 실린다 (${pr && pr.turn})`);
  ok(!!pr && !/turn:|\?/.test(pr.turn), '주소에서 scheme·쿼리는 뗀다');

  /* ⓑ 직접(P2P) — host/srflx 만 */
  const dirT = rig({ s1: { getReceivers: () => [], getStats: () => Promise.resolve(statsOf('srflx', 'host', 'stun:stun.l.google.com:19302', '')) } });
  await ticks(dirT, 3);
  const pd = payload(dirT);
  ok(!!pd && pd.path === 'direct' && pd.relay_ticks === 0 && pd.path_ticks === 3, `둘 다 host/srflx 면 path='direct' (${pd && pd.path}, ${pd && pd.path_ticks}틱)`);
  ok(!!pd && pd.turn === '', '직접이면 TURN 서버 칸은 빈 값이다(STUN 주소를 TURN 으로 적지 않는다)');

  /* ⓒ 상대 쪽만 relay — 경로는 «중계» 지만 서버 주소는 «모름»(지어내지 않는다) */
  const remT = rig({ s1: { getReceivers: () => [], getStats: () => Promise.resolve(statsOf('srflx', 'relay', 'stun:stun.l.google.com:19302', '')) } });
  await ticks(remT, 2);
  const pm = payload(remT);
  ok(!!pm && pm.path === 'relay' && pm.turn === '', `상대만 relay: path='relay' 이고 turn 은 빈 값 (${pm && pm.path} / '${pm && pm.turn}')`);

  /* ⓓ 🔴 핵심 — 경로를 «못 잰» 사람(getStats 없음 · 아직 연결 전)은 «모름» 이지 «직접» 이 아니다 */
  const noStats = rig({ s1: { getReceivers: () => [] } });
  await ticks(noStats, 4);
  const pn = payload(noStats);
  ok(!!pn && pn.path === '' && pn.path_ticks === 0, `getStats 가 없으면 path='' · path_ticks 0 (모름) — ⛔ 'direct' 가 아니다 ('${pn && pn.path}')`);
  const notYet = rig({ s1: { getReceivers: () => [], getStats: () => Promise.resolve({ forEach: (f) => [{ id: 'CP1', type: 'candidate-pair', state: 'in-progress', nominated: false }].forEach((r) => f(r)) }) } });
  await ticks(notYet, 4);
  const py = payload(notYet);
  ok(!!py && py.path === '' && py.path_ticks === 0, '선택된 pair 가 아직 없으면(연결 전) 세지 않는다 — 모름');

  /* ⓔ 섞임 — 처음 직접이었다가 중계로 바뀌면 'mixed', 틱 수가 그대로 남는다 */
  let phase = 'srflx';
  const mixT = rig({ s1: { getReceivers: () => [], getStats: () => Promise.resolve(statsOf(phase, 'host', phase === 'relay' ? 'turn:openrelay.metered.ca:443?transport=tcp' : '', phase === 'relay' ? 'tcp' : '')) } });
  await ticks(mixT, 3); phase = 'relay'; await ticks(mixT, 2);
  const px = payload(mixT);
  ok(!!px && px.path === 'mixed' && px.relay_ticks === 2 && px.path_ticks === 5, `경로가 바뀌면 'mixed' + 틱 수 (relay ${px && px.relay_ticks}/${px && px.path_ticks})`);
  ok(!!px && /openrelay\.metered\.ca:443 tcp/.test(px.turn), `무료 폴백(openrelay)으로 갔으면 그 이름이 남는다 (${px && px.turn})`);

  /* ⓕ getStats 가 던져도 요약은 그대로 나간다(통화 경로와 무관 — 이 파일의 1원칙) */
  const throwT = rig({ s1: { getReceivers: () => [], getStats: () => Promise.reject(new Error('boom')) } });
  await ticks(throwT, 3);
  const pt = payload(throwT);
  ok(!!pt && pt.path === '' && typeof pt.avg_loss === 'number', 'getStats 가 던져도 요약은 나가고 경로만 «모름» 이다');

  /* ⓖ 수업이 끝나면 경로 캐시를 비운다 — 앞 수업의 경로가 다음 수업에 남지 않게 */
  ok(/window\.__vcPath = \{\};/.test(qlog) && /vc-in-call[\s\S]{0,400}__vcPath = \{\}/.test(qlog), '수업 종료 정리에 __vcPath 초기화가 있다');

  /* ⓗ 서버 — INSERT 가 네 칸을 받고 ALTER 로 붙이며, 모르는 path 값은 버린다(무인증 경로) */
  const APIM = readFileSync(join(SRC, 'api-mango.ts'), 'utf8');
  ok(/INSERT INTO vc_quality \([^)]*\bpath\b[^)]*\bturn\b[^)]*\brelay_ticks\b[^)]*\bpath_ticks\b/.test(APIM), '서버 INSERT 에 path·turn·relay_ticks·path_ticks 가 있다');
  ok(/ALTER TABLE vc_quality ADD COLUMN \$\{c\}/.test(APIM) && /"path TEXT DEFAULT ''"/.test(APIM) && /'path_ticks INTEGER DEFAULT 0'/.test(APIM), '네 칸은 ALTER 로만 붙인다(CREATE 두 벌 함정)');
  ok(/PATHS = \['relay', 'direct', 'mixed'\]/.test(APIM) && /indexOf\(String\(b\.path \|\| ''\)\) >= 0/.test(APIM), '모르는 path 문자열은 빈 값으로 떨어진다(본문을 그대로 믿지 않는다)');
  ok(/turnV = String\(b\.turn \|\| ''\)\.replace\(\/\[\^A-Za-z0-9\.:\\-_ \]\/g, ''\)\.slice\(0, 96\)/.test(APIM), 'turn 은 글자를 좁히고 96자에서 자른다');
  const APIA = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
  ok(/SUM\(COALESCE\(relay_ticks, 0\)\) AS relay_ticks, SUM\(COALESCE\(path_ticks, 0\)\) AS path_ticks/.test(APIA), '관리자 집계가 relay_ticks·path_ticks 를 함께 낸다');
  const ADM = readFileSync(join(PUB, 'admin.html'), 'utf8');
  const cellM = ADM.match(/function vcqPathCell\(x\)\{[\s\S]*?\n    \}/);
  ok(!!cellM, '관리자 화면에 경로 칸 렌더러가 있다');
  if (cellM) {
    const cell = new Function('esc', cellM[0] + '\n;return vcqPathCell;')((s) => String(s));
    ok(/—/.test(cell({ path_ticks: 0, relay_ticks: 0 })), '⛔ path_ticks 0 은 «—»(모름) — 0/0 을 «직접» 으로 그리지 않는다');
    ok(/직접/.test(cell({ path_ticks: 10, relay_ticks: 0 })) && /중계/.test(cell({ path_ticks: 10, relay_ticks: 10 })) && /혼합 40%/.test(cell({ path_ticks: 10, relay_ticks: 4 })), '직접·중계·혼합 N% 로 그린다');
    ok(/turn\.cloudflare\.com/.test(cell({ path_ticks: 1, relay_ticks: 1, turn: 'turn.cloudflare.com:3478 udp' })), 'TURN 서버 이름을 작은 글자로 함께 그린다');
  }
}

console.log('\n════════ ⑭ 2층 2·3·4 — 낮게 시작 · 둘째 탭 경고 · 안내에 «왜» (2026-09-03) ════════');
{
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const MAIN = readFileSync(join(PUB, 'js', 'idx-main.js'), 'utf8');
  /* 밖에서 감싸는 방식이라 «그 이름이 아직 있는가» 가 곧 동작 조건이다 */
  ok(/^function vcCreatePeer\(/m.test(MAIN), 'idx-main.js 에 전역 vcCreatePeer 가 있다(② 가 감싸는 대상)');
  ok(/^function vcAAONotify\(/m.test(MAIN), 'idx-main.js 에 전역 vcAAONotify 가 있다(④ 가 감싸는 대상)');
  ok(/if \(!pc\.__qInit\) \{ pc\.__qInit = 1; applyStep\(pc, pc\.__qStep \|\| 0\); \}/.test(MAIN),
     '적응 루프 첫 틱이 pc.__qStep 을 그대로 적용한다(② 가 기대는 기전)');

  /* ② 낮게 시작 */
  const a = runQlog({ student: { uid: 's', name: 's', role: 'student' } });
  ok(a.api.startStep() === 0, '기준 RTT 를 모르면 0 — 지금과 같다(국내 회선은 아무것도 안 바뀐다)');
  a.win.__vcNetSelf = { rttBase: 350 };
  ok(a.api.startStep() === 1, '이 세션 기준 350ms → 1단계');
  a.win.__vcNetSelf = { rttBase: 520 };
  ok(a.api.startStep() === 2, '기준 520ms → 2단계');
  a.win.vcGetQuality = () => 'low';
  ok(a.api.startStep() === 1, "화질 모드 '저'(기본)면 2단계까지 안 내린다 — 1/4 해상도는 얼굴이 안 보인다");
  a.win.vcGetQuality = () => 'auto';
  a.win.__vcNetSelf = null;
  a.store['mangoi_vc_rttbase'] = JSON.stringify({ rtt: 480, at: Date.now() - 86400000 });
  ok(a.api.startStep() === 2, '세션 값이 없으면 지난 수업이 남긴 값(1일 전 480ms) → 2단계');
  a.store['mangoi_vc_rttbase'] = JSON.stringify({ rtt: 480, at: Date.now() - 8 * 86400000 });
  ok(a.api.startStep() === 0, '8일 지난 저장값은 버린다(회선이 바뀌었을 수 있다)');
  a.store['mangoi_vc_rttbase'] = 'garbage';
  ok(a.api.startStep() === 0, '깨진 저장값은 0');
  /* 저장 — 수업 종료 정리가 부른다 */
  a.win.__vcNetSelf = { rttBase: 433.7 };
  a.api.saveRtt();
  const saved = JSON.parse(a.store['mangoi_vc_rttbase']);
  ok(saved && saved.rtt === 434 && typeof saved.at === 'number', `종료 정리가 기준 RTT 를 저장한다 (${a.store['mangoi_vc_rttbase']})`);
  ok(/vcqSaveRttBase\(\);[\s\S]{0,120}window\.__vcNetSelf = null;/.test(qlog), '저장은 __vcNetSelf 를 비우기 «전» 에 한다(뒤면 늘 빈손)');
  /* 감싸기 — 새 연결에 단계가 심긴다 */
  const calls = [];
  a.win.vcCreatePeer = function (id, name) { calls.push([id, name]); return { id }; };
  a.api.wrapCreate();
  ok(a.win.vcCreatePeer.__vcqWrapped === true, 'vcCreatePeer 를 감쌌다');
  a.win.__vcNetSelf = { rttBase: 520 };
  const pc1 = a.win.vcCreatePeer('u1', '학생');
  ok(calls.length === 1 && calls[0][0] === 'u1' && pc1.id === 'u1', '원래 함수가 그대로 불리고 그 결과를 돌려준다');
  ok(pc1.__qStep === 2, `새 연결에 시작 단계가 심긴다 (__qStep=${pc1.__qStep})`);
  a.api.wrapCreate();
  ok(a.win.vcCreatePeer.__vcqWrapped === true && a.win.vcCreatePeer('u2', 'x').__qStep === 2, '두 번 감싸도 한 겹이다(rx 틱마다 다시 불려도 안전)');
  a.win.__vcNetSelf = null; a.store['mangoi_vc_rttbase'] = 'garbage';
  ok(a.win.vcCreatePeer('u3', 'x').__qStep === undefined, '⛔ 모르면 단계를 심지 않는다 — 지금과 같다');
  /* 관찰자는 보내는 영상이 없다 */
  const o = runQlog({ admin: { uid: 'admin', name: 'a', role: 'hq' } });
  o.win.vcCreatePeer = () => ({}); o.api.wrapCreate();
  o.win.__vcNetSelf = { rttBase: 600 };
  ok(o.win.vcCreatePeer('t', 'x').__qStep === 2, '(대조) 참관자가 아니면 심긴다');

  /* ③ 같은 계정 둘째 탭 */
  const d = runQlog({ label: '유세영 (나)' });
  const toastOf = (t) => t.doc.getElementById('vc-netlow-toast');
  d.win.vcPeerConnections = { a: { __username: '유세영', connectionState: 'connected', getReceivers: () => [] } };
  d.api.dupTab();
  ok(!!toastOf(d) && /같은 계정/.test(toastOf(d).innerHTML), '내 이름과 같은 «살아 있는» 상대가 있으면 나에게 알린다');
  ok(/하나만/.test(toastOf(d).innerHTML) && /가족/.test(toastOf(d).innerHTML), '「탭은 하나만」 + 가족 공용 계정 예외를 함께 말한다(끊지 않는다)');
  const at1 = d.win.__vcDupTab.at;
  d.api.dupTab();
  ok(d.win.__vcDupTab.at === at1, '5분 안에는 다시 안 띄운다');
  const e = runQlog({ label: '유세영 (나)' });
  e.win.vcPeerConnections = { a: { __username: '유세영', connectionState: 'closed', getReceivers: () => [] } };
  e.api.dupTab();
  ok(!toastOf(e), '닫힌 연결(유령)은 세지 않는다 — 그건 dupghost 몫');
  const f = runQlog({ label: '유세영 (나)' });
  f.win.vcPeerConnections = { a: { __username: '교사 Teacher - Farrah', connectionState: 'connected', getReceivers: () => [] } };
  f.api.dupTab();
  ok(!toastOf(f), '다른 이름이면 아무 말도 안 한다');
  ok(!/\.close\(\)|vcRemovePeer/.test(qlog.slice(qlog.indexOf('function vcqDupTabWatch'), qlog.indexOf('function vcqWhyLine'))),
     '⛔ 둘째 탭을 «끊지» 않는다 — 가족 공용 계정에서 서로를 쫓아낸다');

  /* ④ 안내에 «왜» */
  const w = runQlog({ student: { uid: 's', name: 's', role: 'student' } });
  ok(w.api.whyLine() === '', '아무것도 모르면 빈 문자열(거짓 숫자를 지어내지 않는다)');
  w.win.__vcNetSelf = { lastRtt: 900, lastLoss: 1.2, rttBase: 130 };
  const line1 = w.api.whyLine();
  ok(/900ms/.test(line1) && /130ms/.test(line1) && /업로드/.test(line1), `지연만 높으면 «업로드가 꽉 찬 모양» (${line1.replace(/<[^>]+>/g, '')})`);
  w.win.__vcNetSelf = { lastRtt: 200, lastLoss: 9.5, rttBase: 130 };
  ok(/패킷/.test(w.api.whyLine()), '손실이 높으면 «패킷이 빠진다»');
  /* selfWatch 가 마지막 값을 적어 두고 토스트에 싣는다 */
  const g = runQlog({ student: { uid: 's', name: 's', role: 'student' } });
  for (let i = 0; i < 3; i++) g.api.selfWatch(0.5, 130);   // 평소 130ms 를 먼저 배운다
  for (let i = 0; i < 5; i++) g.api.selfWatch(1, 950);     // 그 뒤 950ms 가 이어진다
  const gt = g.doc.getElementById('vc-netlow-toast');
  ok(!!gt && /950ms/.test(gt.innerHTML) && /업로드/.test(gt.innerHTML), '회선 경고 토스트에 지연 숫자와 «왜» 가 실린다');
  /* AAO 안내 감싸기 */
  const h = runQlog({ student: { uid: 's', name: 's', role: 'student' } });
  const got = [];
  h.win.vcAAONotify = (html) => { got.push(html); };
  h.api.wrapAAO();
  h.win.__vcNetSelf = { lastRtt: 1100, lastLoss: 0.5, rttBase: 300 };
  h.win.vcAAONotify('📶 <b>Your internet is weak — sending audio only for a moment.</b>');
  h.win.vcAAONotify('📶 <b>Connection recovered — video is back on.</b>');
  ok(got.length === 2 && /1100ms/.test(got[0]) && /업로드/.test(got[0]), '음성전용 안내에 지연·이유가 덧붙는다');
  ok(!/1100ms/.test(got[1]), '회복 안내는 그대로(숫자를 안 붙인다)');
  h.api.wrapAAO();
  ok(h.win.vcAAONotify.__vcqWrapped === true, '두 번 감싸도 한 겹');

  /* ⛔ 상주 타이머·관찰자를 새로 만들지 않았다(홈 정지 전력) */
  const bare = qlog.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  ok((bare.match(/setInterval\(/g) || []).length === 1, 'setInterval 은 여전히 수업 중 타이머 하나뿐');
  ok(!/MutationObserver/.test(bare), 'MutationObserver 없음');
}

console.log('\n' + '═'.repeat(60));
console.log(`  ✅ PASS ${pass}   ❌ FAIL ${fail}   (총 ${pass + fail})`);
if (fail) process.exit(1);
