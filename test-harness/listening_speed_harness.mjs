/* listening_speed_harness.mjs — 듣기 속도 «다섯 칸» 감시 (2026-08-31)
 *
 * 왜 필요한가
 *   사장님 제보 「지금은 속도 구별이 잘 안돼」.
 *   칸은 다섯인데 서버 TTS 쪽 값이 0.72·0.85·1.0·1.15·1.35 라 칸 사이가 15~18% 뿐이었다.
 *   사람 귀는 재생속도를 «비율» 로 듣기 때문에 그 폭은 한 칸 옮겨도 티가 잘 안 난다.
 *   ⚠️ 이건 문자열 검사로는 안 보인다 — 표도 있고 슬라이더도 돌고 값도 «있다».
 *      틀린 것은 «칸 사이가 얼마나 벌어져 있는가» 하나뿐이다. 그래서 숫자를 실제로 잰다.
 *
 * 이 검사가 지키는 것 (표를 소스에서 오려 내 «실제로 평가해» 판정한다)
 *   ① 다섯 칸이고, 3단계(보통)가 원음(1.0)보다 빠르지 않다
 *      📜 2026-09-10 사장님 「아직도 말 속도가 너무 빨라. 보통을 기준으로 모두 느리게」로
 *         보통이 1.0 → 0.8 이 됐다. 그전 검사는 «정확히 1.0» 이었는데, 그 근거였던
 *         «보통은 무가공 원음이어야 한다» 를 사장님이 설명을 받고 바꾸신 것이다.
 *         ⛔ 「정확히 1.0」으로 되돌리지 말 것 — 그 지시가 통째로 되돌아간다.
 *         대신 «원음보다 빠르지 않다» + «너무 늘이지 않는다(0.75 이상)» 로 지킨다:
 *         0.75 미만으로 늘이면 시간축 늘이기 잡음이 귀에 들리기 시작한다.
 *   ② 옆 칸과 최소 20% 벌어져 있다 — 눌러 보면 다르다
 *   ③ 0.5~2.0 밖으로 나가지 않는다(그 밖은 브라우저가 무음으로 만들거나 잘라 낸다)
 *   ④ 이름이 사장님이 정한 다섯 가지다
 *   ⑤ 웜업과 AI 영어친구가 «같은 다섯 값» 이다
 *      — 화면마다 「느리게」가 다른 속도면 「어떤 화면은 더 느리다」가 되고 에러는 안 난다
 *   ⑥ 웜업이 표를 두 벌로 갖고 있지 않다(브라우저 음성용·서버 오디오용이 갈리면
 *      어느 쪽으로 소리가 났느냐에 따라 같은 칸이 다른 속도로 들린다)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : ''))); };

console.log('■ 듣기 속도 — 다섯 칸이 귀로 구별되는가');

const WU = readFileSync(join(PUB, 'warmup.html'), 'utf8');
const AF = readFileSync(join(PUB, 'ai-friend.html'), 'utf8');

/* ── 표를 문자열로 훑지 않고 실제로 평가한다 ───────────────────────────── */
const evalObj = (src, name) => {
  const m = src.match(new RegExp('var ' + name + ' = \\{[^}]*\\};'));
  if (!m) return null;
  try { return new Function('return ' + m[0].replace('var ' + name + ' = ', '').replace(/;$/, '') + ';')(); }
  catch { return null; }
};
const STEPS = evalObj(WU, 'RATE_STEPS');
const NAMES = evalObj(WU, 'RATE_NAMES');
ok(!!STEPS && !!NAMES, '웜업의 속도 표(RATE_STEPS)와 이름 표(RATE_NAMES)를 읽었다');

const vals = STEPS ? [1, 2, 3, 4, 5].map((k) => STEPS[k]) : [];

/* ── ① 다섯 칸 · 가운데는 원음 ─────────────────────────────────────── */
ok(vals.length === 5 && vals.every((v) => typeof v === 'number'),
  `다섯 칸이 모두 숫자다 (${vals.join(' / ')})`);
/* 📜 2026-09-10 이전에는 «정확히 1.0» 이었다. 위 머리말 ① 참고 — 사장님 지시로 0.8 이 됐다.
   ⛔ 등호로 못 박지 말 것. 대신 «원음보다 빠르지 않다»(빠른 쪽으로는 못 감)와
      «0.75 미만으로 늘이지 않는다»(잡음이 들리기 시작하는 선) 둘로 지킨다. */
/* 🔴 «1.0 이하» 로만 물으면 옛 계단(…1.0…)으로 통째로 되돌리는 변이가 그대로 통과한다
      — 함정 대조가 실제로 재현했다. 지시 자체가 「보통을 기준으로 더 느리게」였으므로
      «원음보다 느리다» 로 물어야 그 되돌림이 잡힌다(CLAUDE.md 「지금 꺼져 있어야 할 것이
      켜져 있지 않은가로 물을 것」). ⛔ 「1.0 이하」로 되돌리지 말 것. */
const NORMAL_MIN = 0.75, NORMAL_MAX = 1.0;
ok(STEPS && STEPS[3] >= NORMAL_MIN - 1e-9 && STEPS[3] < NORMAL_MAX - 1e-9,
  `3단계(보통)가 ${STEPS ? STEPS[3] : '?'} — 원음(1.0)보다 «느리고» ${NORMAL_MIN} 이상이다`,
  '1.0 이상이면 2026-09-10 「보통을 기준으로 더 느리게」 지시가 되돌아간 것이다. '
  + `${NORMAL_MIN} 밑으로 내려가면 시간축 늘이기 잡음이 들린다`);
ok(vals.every((v, i) => i === 0 || v > vals[i - 1]), '칸이 갈수록 빨라진다(단조 증가)');

/* ── ② 옆 칸과 «귀로 구별될 만큼» 벌어져 있는가 ────────────────────────
   사고의 핵심이 이 한 줄이다. 예전 값(0.72·0.85·1.0·1.15·1.35)은
   여기서 1.15~1.18 로 나와 이 검사에 걸린다. */
const MIN_GAP = 1.20;
for (let i = 1; i < vals.length; i++) {
  const ratio = vals[i] / vals[i - 1];
  ok(ratio >= MIN_GAP - 1e-9,
    `${i}단계 → ${i + 1}단계 차이가 ${Math.round((ratio - 1) * 100)}% (최소 ${Math.round((MIN_GAP - 1) * 100)}%)`,
    '15~18% 는 한 칸 옮겨도 귀로 티가 안 난다 — 2026-08-31 사장님 「속도 구별이 잘 안돼」');
}

/* ── ③ 브라우저가 실제로 재생해 주는 범위 안인가 ───────────────────── */
ok(vals.every((v) => v >= 0.5 && v <= 2.0),
  '모든 칸이 0.5~2.0 안이다',
  '그 밖은 브라우저가 무음으로 만들거나 잘라 낸다(특히 iOS) — 「소리가 안 나요」가 된다');

/* ── ④ 이름 ─────────────────────────────────────────────────────── */
const WANT = ['아주 느리게', '느리게', '보통', '빠르게', '아주 빠르게'];
ok(!!NAMES && WANT.every((w, i) => NAMES[i + 1] === w),
  `이름이 «${WANT.join(' · ')}» 다`,
  NAMES ? [1, 2, 3, 4, 5].map((k) => NAMES[k]).join(' / ') : '표 없음');

/* ⑤ 화면이 «몇 배» 인지도 말해 주는가 — 이름만으로는 얼마나 달라졌는지 확인할 길이 없다 */
ok(/RATE_NAMES\[lv\][\s\S]{0,120}배/.test(WU),
  '속도 표시에 «몇 배» 가 함께 나온다',
  '이름만 보면 «정확히 얼마나» 바뀌었는지 사람이 확인할 수 없다');

/* ── ⑥ 표가 두 벌로 갈라져 있지 않은가 ─────────────────────────────── */
ok(/var AUDIO_RATE = RATE_STEPS;/.test(WU),
  '브라우저 음성용·서버 오디오용이 «한 표» 다',
  '두 벌이면 어느 쪽으로 소리가 났느냐에 따라 같은 칸이 다른 속도로 들린다');

/* ── ⑦ AI 영어친구가 «같은 다섯 값» 인가 ──────────────────────────── */
const afList = (() => {
  const m = AF.match(/const RATE_STEPS_AF = \[[^\]]*\];/);
  if (!m) return null;
  try { return new Function('return ' + m[0].replace('const RATE_STEPS_AF = ', '').replace(/;$/, '') + ';')(); }
  catch { return null; }
})();
ok(!!afList, 'AI 영어친구의 단계 목록(RATE_STEPS_AF)을 읽었다');
ok(!!afList && !!STEPS && afList.length === 5 && afList.every((v, i) => v === vals[i]),
  `AI 영어친구가 웜업과 같은 다섯 값이다 (${afList ? afList.join(' / ') : '없음'})`,
  '한쪽만 고치면 「어떤 화면은 더 느리다」가 되고 에러는 안 난다');

const btnRates = [...AF.matchAll(/data-rate="([\d.]+)"/g)].map((m) => Number(m[1]));
ok(btnRates.length === 5 && !!STEPS && btnRates.every((v, i) => v === vals[i]),
  `화면 버튼 다섯 개의 값도 같다 (${btnRates.join(' / ')})`,
  '버튼과 목록이 어긋나면 눌러도 «켜진 버튼이 없는» 상태가 된다');

/* 저장된 옛 값(1.5)을 가장 가까운 칸으로 맞춰 주는가 —
   안 맞추면 어느 버튼도 안 켜지고, 화면은 «보통» 처럼 보이는데 1.5배로 읽는다.
   ⛔ 이 검사를 «그 다섯 숫자가 적혀 있는가» 로 쓰지 말 것 — 2026-09-10 에 칸을 내리자
      보장은 오히려 세졌는데(정본 배열 하나를 쓰게 됨) 검사만 빨간불이 났다.
      물어야 할 것은 «정본 배열로 맞추는가» 와 «옆에 값을 다시 적지 않았는가» 다. */
ok(/RATE_STEPS_AF\s*\.reduce\(/.test(AF),
  '저장된 옛 속도를 «정본 계단(RATE_STEPS_AF)» 으로 맞춰서 시작한다',
  '칸 값이 바뀌면 옛 저장값은 어느 버튼과도 안 맞는다 — 조용히 어긋난 채로 읽는다');
/* ⚠️ 부정 검사는 «주석을 벗겨 낸» 사본으로 판정한다 — 이 파일들은 📜 이력 주석을 남기는
      관행이라 「예전에는 [0.6, 0.8, 1, 1.25, 1.5].reduce( … ) 였다」 한 줄이면 자기 주석을
      잡는다(함정 대조가 실제로 재현해서 거짓 FAIL 을 냈다. CLAUDE.md 2장). */
const AF_BARE = AF.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
ok(!/\[\s*[\d.]+\s*(?:,\s*[\d.]+\s*){4}\]\s*\.reduce\(/.test(AF_BARE),
  '스냅이 숫자를 «다시 적어» 두지 않았다(정본 배열 하나만 본다)',
  '두 벌이면 한쪽만 고쳐져 «버튼은 보통인데 실제로는 다른 배속» 이 되고 에러는 안 난다');

/* 기본값이 계단 «안» 이고, 그것이 곧 «보통» 인가 —
   밖이면 처음 들어온 학생 화면에 켜진 버튼이 하나도 없고, 보통이 아니면
   아무도 안 골랐는데 «빠르게» 로 시작한다(2026-09-10 지시가 조용히 뒤집힌다). */
const afDefault = (() => {
  const m = AF.match(/const RATE_DEFAULT_AF\s*=\s*([\d.]+)\s*;/);
  return m ? Number(m[1]) : null;
})();
ok(afDefault !== null && !!afList && afList.indexOf(afDefault) >= 0,
  `기본 속도(${afDefault})가 다섯 칸 안에 있다`,
  '계단 밖이면 처음 열었을 때 켜진 버튼이 하나도 없다');
ok(afDefault !== null && !!STEPS && Math.abs(afDefault - STEPS[3]) < 1e-9,
  `기본 속도가 «보통»(${STEPS ? STEPS[3] : '?'}) 이다`,
  '기본이 보통이 아니면 아무도 안 골랐는데 다른 속도로 시작한다');

/* ── ⑧ 이미 속도를 골라 둔 학생에게도 지시가 닿는가 ────────────────────────
   🔴 함정 대조가 브라우저로 재서 잡은 것 — «가장 가까운 값» 으로만 맞추면 저장값이 있는
      학생 다섯 중 넷은 배속이 한 글자도 안 느려지고(0.8→0.8·1→1), 하필 «아주 느리게» 를
      골라 둔 학생만 0.6 → 0.65 로 «빨라진다». 그래서 «칸 번호» 로 한 번 옮긴다. */
const mig = (() => {
  const m = AF.match(/const RATE_STEPS_V1_AF\s*=\s*\[[^\]]*\];/);
  if (!m) return null;
  try { return new Function('return ' + m[0].replace(/^const [^=]+=\s*/, '').replace(/;$/, '') + ';')(); }
  catch { return null; }
})();
ok(!!mig && mig.length === 5, '옛 계단 표(RATE_STEPS_V1_AF)를 읽었다',
  '없으면 옛 값을 쓰던 기기가 영영 옛 배속으로 남는다');
ok(!!mig && !!afList && mig.every((v, i) => afList[i] < v - 1e-9),
  `옛 칸이 «같은 번호의 새 칸» 으로 전부 느려진다 (${mig ? mig.join('/') : '?'} → ${afList ? afList.join('/') : '?'})`,
  '한 칸이라도 빨라지면 「너무 빠르다」고 말한 학생이 더 빨라진다');
ok(/RATE_STEPS_V1_AF\.findIndex/.test(AF_BARE) || /findIndex[\s\S]{0,80}RATE_STEPS_V1_AF/.test(AF_BARE),
  '옮길 때 «값» 이 아니라 «칸 번호» 로 찾는다',
  '값으로 맞추면 옛 값이 그대로 남아 배속이 안 바뀐다');
/* 짝 — «한 번만» 인가. 표식이 없으면 매번 옮겨 수업 때마다 계속 느려진다. */
ok(/RATE_VER_KEY_AF/.test(AF_BARE) && /localStorage\.setItem\(\s*RATE_VER_KEY_AF/.test(AF_BARE),
  '그 옮기기를 «한 번만» 하도록 표식을 남긴다',
  '표식이 없으면 새 0.8 을 옛 2단계로 보고 0.65 로, 또 0.65 를… 계속 느려진다');
ok(/rateMarkAF\(\);/.test(AF_BARE.slice(AF_BARE.indexOf('function applyRate'))),
  '사람이 속도를 고르면 그 표식도 함께 남긴다',
  '안 남기면 사람이 고른 새 값을 다음 로드가 옛 값으로 오해해 또 옮긴다');

/* 옛 계단에 «없는» 값도 빨라지지 않는가 — 지시가 「모두 느리게」다.
   🔴 함정 대조 뒤 브라우저로 재다가 찾았다: «가장 가까운 칸» 이면 1.2 → 1.25 로 빨라진다.
   ⛔ 「그 줄이 있는가」로 묻지 말 것 — 식을 오려 내 «답» 으로 묻는다. */
const migExpr = (() => {
  const m = AF.match(/const next = i >= 0 \? RATE_STEPS_AF\[i\]\s*([\s\S]*?);/);
  return m ? m[1] : null;
})();
ok(!!migExpr, '옛 계단에 없는 값을 어떻게 옮기는지 식을 잘라냈다',
  '못 잘라내면 아래 검사가 헛돈다');
if (migExpr && afList) {
  const fall = (r) => {
    try { return new Function('RATE_STEPS_AF', 'r', 'return ' + migExpr.replace(/^\s*:/, '') + ';')(afList, r); }
    catch { return NaN; }
  };
  /* ⚠️ 가장 느린 칸(0.5)보다 «더 느린» 저장값은 어느 계단에도 없던 값이다 — 그때는
     가장 느린 칸으로 올리는 것이 맞다(0.5 아래는 소리가 뭉개진다). 그 하나만 예외로 둔다. */
  const cases = [1.2, 1.4, 0.9, 0.55, 0.31];
  const bad = cases.filter((r) => (r >= afList[0] ? !(fall(r) <= r + 1e-9) : fall(r) !== afList[0]));
  ok(bad.length === 0,
    `옛 계단에 없는 값도 «그보다 느린 칸» 으로 간다 (${cases.map((r) => r + '→' + fall(r)).join(' · ')})`,
    '가장 가까운 칸으로 맞추면 1.2 가 1.25 로 «빨라진다» — 지시와 정반대다');
  ok(cases.every((r) => afList.indexOf(fall(r)) >= 0),
    '그 결과가 항상 다섯 칸 안이다',
    '칸 밖이면 켜진 버튼이 하나도 없다');
  /* 짝 — «너무 많이» 내리지도 않는가. 이 줄이 없으면 «항상 최저칸(0.5)» 도 통과한다
     (변이시험에서 실제로 통과했다): 빠르게를 고른 학생이 아주 느리게로 떨어진다. */
  const want = (r) => { const c = afList.filter((v) => v <= r + 1e-9); return c.length ? c[c.length - 1] : afList[0]; };
  ok(cases.every((r) => Math.abs(fall(r) - want(r)) < 1e-9),
    `내리되 «바로 아래 칸» 까지만 내린다 (${cases.map((r) => r + '→' + fall(r)).join(' · ')})`,
    '항상 최저칸으로 떨어뜨리면 빠르게를 고른 학생이 아주 느리게가 된다');
}

/* ── ⑨ 웜업이 «1배» 로 시작하는가 (2026-09-25 사장님 «1배로 해줘») ─────────────
   📜 옛 경계: 2026-09-24 «보통(0.8)» 으로 시작 → 이날 «원음 그대로 1.0배» 로 바꿨다.
   ⛔ 칸 번호(4)를 못 박지 않는다 — «시작 칸의 배속이 1.0 인가» 로 묻는다(계단이 또 바뀌어도 뜻이 남는다).
   짝 — 슬라이더 초기값도 같은 칸이어야 첫 화면 표시와 실제 배속이 어긋나지 않는다. */
const wuStart = (() => { const m = WU.match(/var WARMUP_START_RATE\s*=\s*(\d+)\s*;/); return m ? Number(m[1]) : null; })();
ok(wuStart !== null && !!STEPS && Math.abs(STEPS[wuStart] - 1.0) < 1e-9,
  `웜업 시작 칸(${wuStart})의 배속이 1.0 이다 (${STEPS && wuStart ? STEPS[wuStart] : '?'}배)`,
  '1.0 이 아니면 2026-09-25 «1배로 해줘» 가 되돌아간 것이다');
const slv = (() => { const m = WU.match(/id="rateSlider"[^>]*\svalue="(\d+)"/); return m ? Number(m[1]) : null; })();
ok(slv !== null && slv === wuStart,
  `슬라이더 초기값(${slv})이 시작 칸(${wuStart})과 같다`,
  '다르면 스크립트가 돌기 전 잠깐, 또는 스크립트가 죽었을 때 표시가 실제 배속과 어긋난다');

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
