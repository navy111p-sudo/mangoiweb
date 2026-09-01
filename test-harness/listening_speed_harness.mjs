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
 *   ① 다섯 칸이고, 3단계는 정확히 1.0(무가공 원음)이다
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
ok(STEPS && STEPS[3] === 1.0, '3단계(보통)는 정확히 1.0 — 무가공 원음이다',
  '가운데가 1이 아니면 «보통» 이 이미 늘어나거나 줄어든 소리가 된다');
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

/* 저장된 옛 값(1.2)을 가장 가까운 칸으로 맞춰 주는가 —
   안 맞추면 어느 버튼도 안 켜지고, 화면은 「보통」처럼 보이는데 1.2배로 읽는다 */
const snap = AF.match(/\[0\.6, 0\.8, 1, 1\.25, 1\.5\]\.reduce\(/);
ok(!!snap, '저장된 옛 속도를 «가장 가까운 칸» 으로 맞춰서 시작한다',
  '칸 값이 바뀌면 옛 저장값은 어느 버튼과도 안 맞는다 — 조용히 어긋난 채로 읽는다');

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
