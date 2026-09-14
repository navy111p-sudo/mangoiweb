// leveltest_level_display_harness.mjs — «AI 진단 완료 · C2» 의 C2 를 사람이 읽게 (2026-09-14, 사장님 B안)
//
// ── 왜 ───────────────────────────────────────────────────────────────────────
// 홈 「내 레벨테스트」 카드가 CEFR 약어만 내보내 사장님이 「C2 가 도대체 뭐야」 하셨다.
// 이름(«최상급»)·칸 수(6단계 중 6단계)·눈금 글자(A1…C2)는 **서버 정본** `cefrDisplay`
// (src/student-placement.ts)가 만들어 /api/leveltest/my 의 `level_display` 로 내려주고,
// 화면(js/idx-leveltest-card.js)은 그리기만 한다.
//
// ── 이 하니스가 못 박는 것 ──────────────────────────────────────────────────
//   ① cefrDisplay 를 **번들해 실제로 돌린다** — A1…C2 가 1…6 칸이고 이름은 BAND_SPECS 의 것이다
//      (새 이름을 짓지 않았다 = bandName(bandFromCefr(x)) 와 «같은 답»)
//   ② 모르는 값·사다리 밖 표기('A2+')·빈 값은 null — 화면이 그때 원문으로 떨어진다
//   ③ 채점(api-admin CEFR_ORDER)과 게이지(CEFR_LADDER)가 «같은 배열» 을 쓴다 — 리터럴을 다시 적지 않았다
//   ④ /api/leveltest/my 응답에 level_display 가 실린다
//   ⑤ 화면 파일에 CEFR 이름표·글자 배열이 «없다» (주석을 벗겨 낸 사본으로 — 설명 주석이 이름을 담고 있다)
//
// ⚠️ 카드가 «어떻게 그리는가» 는 hero_leveltest_card_harness.mjs ④절이 본다(가짜 DOM 으로 실행).
//    여기서는 «서버가 무엇을 주는가» 만 본다 — 둘은 짝이다.
//
// 실행: node test-harness/leveltest_level_display_harness.mjs

import { readFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const CF = join(__dir, '../cloudflare-deploy');
const PLACE = readFileSync(join(CF, 'src/student-placement.ts'), 'utf8');
const ADMIN = readFileSync(join(CF, 'src/api-admin.ts'), 'utf8');
const CARD  = readFileSync(join(CF, 'public/js/idx-leveltest-card.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? '  — ' + detail : ''}`); }
};

/* 줄 단위로 «지금 블록주석 안인가» 를 추적하는 제거기 — 정규식 한 줄로 지우면 문자열 속 «별표+슬래시» 에
   뒷부분이 통째로 날아간다(CLAUDE.md 2장). 부정 검사(⑤)에만 쓴다. */
function strip(src) {
  const out = []; let inBlock = false;
  for (const line of src.split('\n')) {
    let s = line, r = '';
    while (s.length) {
      if (inBlock) { const e = s.indexOf('*/'); if (e < 0) { s = ''; break; } s = s.slice(e + 2); inBlock = false; continue; }
      const b = s.indexOf('/*'), l = s.indexOf('//');
      if (b >= 0 && (l < 0 || b < l)) { r += s.slice(0, b); s = s.slice(b + 2); inBlock = true; continue; }
      if (l >= 0) { r += s.slice(0, l); s = ''; break; }
      r += s; s = '';
    }
    out.push(r);
  }
  return out.join('\n');
}

console.log('\n🪜 레벨테스트 결과 표시 — cefrDisplay 정본\n');

/* ═══ ① 정본을 번들해 실제로 돌린다 ═══════════════════════════════════════ */
console.log('① cefrDisplay 실행 — 이름은 BAND_SPECS 의 것, 칸은 사다리 순서');
let esbuildApi = null;
try { esbuildApi = createRequire(join(CF, 'package.json'))('esbuild'); } catch { /* 미설치 */ }
let M = null;
if (!esbuildApi) {
  console.log('  ⏭ esbuild 없음 — 실행 검증 건너뜀 (정적 검사만 유효)');
} else {
  const out = join(mkdtempSync(join(tmpdir(), 'cefr-')), 'p.mjs');
  let built = true;
  try {
    esbuildApi.buildSync({ entryPoints: [join(CF, 'src/student-placement.ts')], bundle: true, format: 'esm',
      platform: 'neutral', outfile: out, logLevel: 'silent' });
  } catch (e) { built = false; console.log('     ' + String(e && e.message || e).slice(0, 200)); }
  ok('student-placement.ts 를 번들해 실제로 돌릴 수 있다', built);
  if (built) M = await import('file://' + out.replace(/\\/g, '/'));
}
if (M) {
  const { cefrDisplay, CEFR_LADDER, bandFromCefr } = M;
  ok('CEFR_LADDER 가 6칸이고 C2 로 끝난다', Array.isArray(CEFR_LADDER) && CEFR_LADDER.length === 6 && CEFR_LADDER[5] === 'C2', JSON.stringify(CEFR_LADDER));
  // BAND_SPECS 이름표는 번들이 내보내지 않으니 judgment-level 을 따로 번들해 «같은 답» 인지 본다
  const out2 = join(mkdtempSync(join(tmpdir(), 'cefr-')), 'j.mjs');
  esbuildApi.buildSync({ entryPoints: [join(CF, 'src/judgment-level.ts')], bundle: true, format: 'esm', platform: 'neutral', outfile: out2, logLevel: 'silent' });
  const J = await import('file://' + out2.replace(/\\/g, '/'));
  CEFR_LADDER.forEach((L, i) => {
    const d = cefrDisplay(L);
    const band = bandFromCefr(L);
    ok(`${L} → ${i + 1}/6 · 이름 «${d && d.ko}» = BAND_SPECS 밴드 ${band} 이름`,
      !!d && d.step === i + 1 && d.of === 6 && d.cefr === L && band != null
        && d.ko === J.bandName(band, 'ko') && d.en === J.bandName(band, 'en')
        && Array.isArray(d.ladder) && d.ladder.join(',') === CEFR_LADDER.join(','),
      JSON.stringify(d));
  });
  const c2 = cefrDisplay('C2');
  ok('C2 는 사다리 맨 위(6/6)이고 이름은 가장 높은 밴드의 것', !!c2 && c2.step === 6 && c2.ko === J.bandName(J.BAND_COUNT, 'ko'), JSON.stringify(c2));
  ok('소문자 «c2» 도 같은 답 (대소문자 무시)', JSON.stringify(cefrDisplay('c2')) === JSON.stringify(c2));
  ok('앞뒤 공백도 같은 답', JSON.stringify(cefrDisplay('  C2 ')) === JSON.stringify(c2));
  const st = cefrDisplay('Starter');
  ok('Starter(A1 미만) 는 0칸 · cefr 표기는 «Starter» 그대로 · 이름은 첫 밴드', !!st && st.step === 0 && st.cefr === 'Starter' && st.ko === J.bandName(1, 'ko'), JSON.stringify(st));

  console.log('\n② 모르는 값은 null — 화면이 «지어내지» 않고 원문으로 떨어진다');
  ok('빈 값 → null', cefrDisplay('') === null && cefrDisplay(null) === null && cefrDisplay(undefined) === null);
  ok('엉뚱한 값 → null', cefrDisplay('zzz') === null && cefrDisplay('Lv 3') === null && cefrDisplay(7) === null);
  ok('사다리 밖 표기(A2+) → null (AI 친구 눈금이지 레벨테스트 값이 아니다)', cefrDisplay('A2+') === null);
  ok('짝: 사다리 «안» 은 전부 null 이 아니다', CEFR_LADDER.every(L => cefrDisplay(L) !== null));
}

/* ═══ ③ 채점과 게이지가 같은 배열을 쓴다 ═══════════════════════════════════ */
console.log('\n③ 채점(CEFR_ORDER)과 게이지(CEFR_LADDER)가 «한 배열»');
const admS = strip(ADMIN);
ok('api-admin 의 CEFR_ORDER 가 CEFR_LADDER 에서 온다', /const CEFR_ORDER[^=\n]*=\s*\[\s*\.\.\.CEFR_LADDER\s*\]/.test(admS));
ok('api-admin 에 A1…C2 배열 리터럴을 다시 적지 않았다', !/\[\s*'A1'\s*,\s*'A2'\s*,\s*'B1'\s*,\s*'B2'\s*,\s*'C1'\s*,\s*'C2'\s*\]/.test(admS));
ok('CEFR_LADDER 정의는 student-placement.ts 한 곳뿐', (strip(PLACE).match(/export const CEFR_LADDER\b/g) || []).length === 1 && !/const CEFR_LADDER\b/.test(admS));
ok('api-admin 이 cefrDisplay·CEFR_LADDER 를 정본에서 import 한다', /import \{[^}]*\bcefrDisplay\b[^}]*\} from '\.\/student-placement'/.test(admS) && /import \{[^}]*\bCEFR_LADDER\b[^}]*\} from '\.\/student-placement'/.test(admS));

/* ═══ ④ /api/leveltest/my 가 level_display 를 싣는다 ═══════════════════════ */
console.log('\n④ /api/leveltest/my 응답');
const myStart = admS.indexOf("path === '/api/leveltest/my'");
const myEnd = admS.indexOf("return json({ ok: true, items });", myStart);
const myBody = myStart >= 0 && myEnd > myStart ? admS.slice(myStart, myEnd) : '';
ok('/api/leveltest/my 라우트를 잘라 냈다(전제)', myBody.length > 200);
ok('items 마다 level_display: cefrDisplay(a.final_level) 를 붙인다', /level_display:\s*cefrDisplay\(a\.final_level\)/.test(myBody));

/* ═══ ⑤ 화면은 이름표를 «갖지 않는다» ═══════════════════════════════════════ */
console.log('\n⑤ 화면(idx-leveltest-card.js)에 CEFR 이름표·글자 배열이 없다 — 주석 벗긴 사본으로');
const cardS = strip(CARD);
ok('한국어 밴드 이름(첫걸음·기초·초급·초중급·중급·중고급·고급·최상급)이 코드에 없다', !/(첫걸음|기초|초급|초중급|중급|중고급|고급|최상급)/.test(cardS));
ok("사다리 글자 배열('A1'…'C2')이 코드에 없다", !/'A1'|"A1"|'C2'|"C2"/.test(cardS));
ok('화면은 서버가 준 level_display 를 읽는다', /\.level_display\b/.test(cardS) && /disp\.ladder/.test(cardS));
ok('원문 폴백이 남아 있다 — level_display 가 없으면 «AI 진단 완료 · <원문>»', /'AI 진단 완료 · ' \+ lv/.test(cardS));
ok('index.html 이 ?v=4 이상으로 부른다', (() => { const m = readFileSync(join(CF, 'public/index.html'), 'utf8').match(/idx-leveltest-card\.js\?v=(\d+)/); return !!m && Number(m[1]) >= 4; })());

console.log('\n─────────────────────────────────────────────');
console.log(`  PASS ${pass} / FAIL ${fail}`);
console.log('─────────────────────────────────────────────');
process.exit(fail ? 1 : 0);
