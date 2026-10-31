// ✍ 강사 「오늘의 수업」 — «일지 미작성 N» 칩 · «상세 숨기기» (2026-10-26)
// ─────────────────────────────────────────────────────────────────────────────
// 표 보기는 #1811(teacher_class_table_harness)이 맡는다. 여기서는 그 위에 붙인 두 가지만 본다.
//  ① 칩 수 = 줄에 [일지 쓰기](.btn-eval) 가 그려지는 조건 — clsChipsHtml 을 오려 내 실제로 돌린다
//  ② 상세 숨기기는 참고 정보 3종만 숨기고, renderClasses 는 그 설정을 모른다(분리)
// 실제 브라우저 무작위 검사: test-harness/manual/teacher-log-chip-lite-browser.mjs
// 변이시험: TEACHER_HTML=<사본>
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(process.env.TEACHER_HTML || resolve(ROOT, 'cloudflare-deploy/public/teacher.html'), 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌ FAIL', name, extra !== undefined ? '— ' + String(extra).slice(0, 200) : ''); }
};
function fnBlock(t, name) {
  const s = t.indexOf('function ' + name + '(');
  if (s < 0) return '';
  let i = t.indexOf('{', s), d = 0, q = null;
  for (; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return t.slice(s, i + 1); }
  }
  return '';
}
const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');

console.log('▶ 마크업 · CSS');
ok('상세 숨기기 체크박스(#cls-lite)와 감싸는 줄(#cls-lite-wrap)', /id="cls-lite-wrap"/.test(html) && /<input type="checkbox" id="cls-lite">/.test(html));
ok('라벨 EN/KO', /data-en="Hide details \(goal · handover · last class\)" data-ko="상세 숨기기 \(목표 · 인수인계 · 지난 수업\)"/.test(html));
ok('숨김 대상은 목표·인수인계·지난 수업 3종', /\.cls-lite \.cls-goal,\.cls-lite \.cls-hand,\.cls-lite \.cls-prev\{display:none\}/.test(css));
ok('(짝) 다른 방 경고·학부모 요청·추가 정보·버튼은 숨기지 않는다', !/cls-lite [^{]*\.(cls-away|cls-preq|cls-extra|btn|cls-act)/.test(css));
ok('[hidden] 이 display 를 이긴다(감싸는 줄은 inline display:flex)', /\[hidden\]\{display:none !important\}/.test(css));
ok('칩 색(밝게·어둡게)', /\.cls-chip\.c-nolog\{border-color:#1355a8;color:#1355a8\}/.test(css) && /html\[data-t="dark"\] \.cls-chip\.c-nolog\{/.test(css));

console.log('▶ 분리 — 줄 그리기는 상세 숨기기를 모른다');
ok('renderClasses 는 cls-lite 를 참조하지 않는다', !/cls-lite/.test(fnBlock(html, 'renderClasses')));
ok('classTableHtml 도 cls-lite 를 참조하지 않는다', !/cls-lite/.test(fnBlock(html, 'classTableHtml')));
const sync = fnBlock(html, 'syncClsLite');
ok('syncClsLite 가 있다', sync.length > 50);
ok('syncClsLite 는 오늘 목록·다른 날 보기 둘 다에 클래스를 단다', /\['classes', 'cls-day-view'\]/.test(sync) && /classList\.toggle\('cls-lite', on\)/.test(sync));
ok('표 보기에서는 체크박스 줄을 숨긴다(표는 이미 «📝 메모» 로 접혀 있다)', /w\.hidden = classViewIsTable\(\)/.test(sync));
ok('syncClsLite 는 다시 그리지 않는다(renderClasses 미호출)', !/renderClasses\s*\(/.test(sync));
ok('보기를 바꾸면 syncClsLite 를 부른다', /renderClsDay\(\);\n    syncClsLite\(\);\n  \}\);/.test(html));
ok('시작할 때 한 번 부른다', /\n  syncClsLite\(\);\n/.test(html));
ok('localStorage 읽기·쓰기는 try 로 감싼다',
  /try \{ clsLiteBox\.checked = localStorage\.getItem\('mangoi_teacher_cls_lite'\) === '1'; \} catch \(e\) \{\}/.test(html)
  && /try \{ localStorage\.setItem\('mangoi_teacher_cls_lite', this\.checked \? '1' : '0'\); \} catch \(e\) \{\}/.test(html));

console.log('▶ 일지 미작성 칩 — [일지 쓰기] 버튼 조건과 같은가 (실제 함수 실행)');
const ctx = { LANG: 'ko' };
ctx.T = (en, ko) => (ctx.LANG !== 'ko' ? en : ko);
ctx.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
vm.createContext(ctx);
let compiled = true;
try { vm.runInContext(fnBlock(html, 'clsStateOf') + '\n' + fnBlock(html, 'clsChipsHtml'), ctx); } catch (e) { compiled = false; }
ok('전제: clsStateOf·clsChipsHtml 를 오려 내 실행했다', compiled && typeof ctx.clsChipsHtml === 'function');
const T0 = 1_800_000_000_000;
const row = (o) => Object.assign({ kind: 'class', class_state: 'scheduled', close_at_ts: T0 - 1000 }, o);
const run = (list) => { try { return String(ctx.clsChipsHtml(list, T0)); } catch (e) { return 'THROW ' + e.message; } };
const nolog = (list) => { const m = run(list).match(/data-chip="nolog">[^<]*?(\d+)</); return m ? +m[1] : 0; };
ok('끝났고 일지 없음 → 1', nolog([row({ class_state: 'done' })]) === 1);
ok('(짝) 일지를 썼으면 → 0', nolog([row({ class_state: 'done', eval_written: true })]) === 0);
ok('(짝) 아직 안 끝났으면 → 0', nolog([row({ close_at_ts: T0 + 60_000 })]) === 0);
ok('(짝) 막 끝난 그 순간(t == close)은 아직 0 — 버튼도 t > close 부터', nolog([row({ close_at_ts: T0 })]) === 0);
ok('노쇼라도 끝났고 일지 없으면 → 1 (줄에 [일지 쓰기] 가 있다)', nolog([row({ class_state: 'no_show' })]) === 1);
ok('(짝) 취소 → 0', nolog([row({ class_state: 'cancelled' })]) === 0);
ok('(짝) 연기 → 0', nolog([row({ class_state: 'postponed' })]) === 0);
ok('(짝) 보류 → 0', nolog([row({ absence_hold: true })]) === 0);
ok('(짝) LMS·샘플 줄은 세지 않는다', nolog([row({ kind: 'lms' }), row({ kind: 'demo' })]) === 0);
ok('여러 줄 합산', nolog([row({}), row({}), row({ eval_written: true }), row({ close_at_ts: T0 + 1 })]) === 2);
ok('0 이면 칩을 그리지 않는다', !/data-chip="nolog"/.test(run([row({ eval_written: true })])));
ok('다른 칩은 그대로(완료 1)', /data-chip="done">✔ 완료 1</.test(run([row({ class_state: 'done' })])));
ok('한국어 라벨', /✍ 일지 미작성 1/.test(run([row({})])));
ctx.LANG = 'en';
ok('영어 라벨', /✍ Log not written 1/.test(run([row({})])));

console.log('▶ 칩 누르면 [일지 쓰기] 줄로 (카드·표 공통)');
const bind = fnBlock(html, 'bindClassRows');
ok("nolog → '.btn-eval'", /k === 'nolog' \? '\.btn-eval'/.test(bind));
ok('찾은 버튼에서 줄(.cls / .cls-tr)로 올라간다', /el\.closest\('\.cls, \.cls-tr'\)/.test(bind));
ok('줄의 [일지 쓰기] 버튼 클래스가 btn-eval 그대로다(칩 이동 대상)', /class="btn btn-eval" type="button" data-eval=/.test(fnBlock(html, 'classActHtml')));

console.log('▶ 다크 모드 선택 상자 (2026-10-27) — 시간 정렬·보기');
ok('두 선택 상자가 cls-sel 클래스를 쓴다', /<select id="class-time-sort" class="cls-sel">/.test(html) && /<select id="class-view" class="cls-sel">/.test(html));
ok('정의되지 않은 --card 로 배경을 칠하지 않는다(다크에서 흰 바탕)', !/var\(--card/.test(html));
ok('밝게: 흰 바탕 + 진한 글자', /\.cls-sel\{[^}]*background:#fff;color:#101828\}/.test(css));
ok('(짝) 어둡게: 어두운 바탕 + 밝은 글자', /html\[data-t="dark"\] \.cls-sel\{background:#1b2330;color:#c9d4e0;border-color:#2c3949\}/.test(css));

console.log('▶ 문법');
let syntax = true;
for (const m of html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) { try { new vm.Script(m[1]); } catch (e) { syntax = false; } }
ok('인라인 스크립트 전부 문법 통과', syntax);

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
