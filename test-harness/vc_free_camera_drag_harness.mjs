// vc_free_camera_drag_harness.mjs — 떠 있는(자유 크기) 얼굴 창을 «얼굴 영역» 을 끌어 옮긴다 (2026-11-10)
//
// 배경: 강사 제보 「카메라 창이 필기도구를 가리는데 옮길 수가 없다」. 우상단 그립을 끌면 창이 자유 모드로
//   뜨는데, 옮기는 손잡이(제목줄)는 그림 4칸 개편 뒤 버튼으로 꽉 차 잡을 자리가 없었다.
// 방식: js/idx-vc-sizebar.js 를 가짜 DOM 에서 «실제로 돌려» 포인터 이벤트를 넣고 vcApplyFreeBox 에
//   넘어간 좌표를 본다(글자 검사 아님). 실제 화면은 manual/vc-free-camera-drag-browser.mjs.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dir, '../cloudflare-deploy/public/js/idx-vc-sizebar.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? '  — ' + detail : ''}`); }
};

/* 가짜 화면 한 벌 — 호출 기록을 돌려준다 */
function world() {
  const mkEl = () => {
    const L = {}; const cls = new Set();
    return {
      L, hidden: true, style: {}, textContent: '',
      classList: { contains: c => cls.has(c), add: c => cls.add(c), remove: c => cls.delete(c), toggle: () => {} },
      addEventListener: (t, f) => { (L[t] = L[t] || []).push(f); },
      removeEventListener: (t, f) => { L[t] = (L[t] || []).filter(x => x !== f); },
      setAttribute() {}, getAttribute: () => null, querySelectorAll: () => [], appendChild() {},
      getBoundingClientRect: () => ({ left: 900, top: 300, width: 320, height: 240 }),
    };
  };
  const els = { 'vc-size-bar': mkEl(), 'vc-video-pane': mkEl(), 'vc-main-row': mkEl() };
  const doc = mkEl();
  const css = [];
  Object.assign(doc, { readyState: 'complete', head: { appendChild: e => css.push(e.textContent) },
    getElementById: id => els[id] || null, createElement: () => mkEl() });
  const calls = { apply: [], save: 0 };
  const win = { vcApplyFreeBox: b => calls.apply.push(b), vcSaveFreeBox: () => { calls.save++; },
    vcSetVideoSize() {}, vcToggleFreeResize() {} };
  vm.runInNewContext(src, { window: win, document: doc, setTimeout: f => f(), console });
  const fire = (el, type, ev) => { let pd = false; (el.L[type] || []).slice().forEach(f => f(Object.assign({ preventDefault() { pd = true; }, stopPropagation() {} }, ev))); return pd; };
  const on = sel => ({ closest: s => (s.split(',').includes(sel) ? {} : null) });   // 그 선택자 «위» 에서 누른 것처럼
  return { els, doc, css, calls, fire, on, row: els['vc-main-row'], pane: els['vc-video-pane'] };
}
const VIDEO = '.video-box';   // 얼굴 타일 위(버튼 아님)

/* ① 자유 모드 — 얼굴을 끌면 그만큼 옮기고, 놓으면 저장한다 */
{
  const w = world(); w.row.classList.add('video-free');
  w.fire(w.pane, 'pointerdown', { clientX: 1000, clientY: 400, button: 0, target: w.on(VIDEO) });
  w.fire(w.doc, 'pointermove', { clientX: 700, clientY: 340 });
  const b = w.calls.apply.at(-1);
  ok('① 얼굴을 끌면 창이 그만큼 옮겨진다', !!b && b.left === 600 && b.top === 240, JSON.stringify(b));
  ok('① 크기는 안 바뀐다', !!b && b.width === 320 && b.height === 240);
  w.fire(w.doc, 'pointerup', {});
  ok('① 놓으면 위치를 저장한다', w.calls.save === 1, String(w.calls.save));
  const n = w.calls.apply.length;
  w.fire(w.doc, 'pointermove', { clientX: 10, clientY: 10 });
  ok('① 놓은 뒤에는 더 안 따라온다', w.calls.apply.length === n);
}
/* ② 짝 — 자유 모드가 아니면 아무 일도 없다(기본 배치의 얼굴 칸이 끌려 나오면 안 된다) */
{
  const w = world();
  w.fire(w.pane, 'pointerdown', { clientX: 1000, clientY: 400, button: 0, target: w.on(VIDEO) });
  w.fire(w.doc, 'pointermove', { clientX: 700, clientY: 340 });
  ok('② 자유 모드가 아니면 안 움직인다', w.calls.apply.length === 0);
}
/* ③ 짝 — 버튼·그립·제목줄 위에서 누른 것은 가로채지 않는다 */
for (const sel of ['button', '#vc-vp-grip', '.video-size-bar', 'input']) {
  const w = world(); w.row.classList.add('video-free');
  w.fire(w.pane, 'pointerdown', { clientX: 1000, clientY: 400, button: 0, target: w.on(sel) });
  w.fire(w.doc, 'pointermove', { clientX: 700, clientY: 340 });
  ok(`③ «${sel}» 위에서는 끌기를 시작하지 않는다`, w.calls.apply.length === 0);
}
/* ④ 짝 — 살짝 흔들린 탭(6px 미만)은 끌기가 아니다: 안 옮기고, 저장도 click 삼키기도 없다 */
{
  const w = world(); w.row.classList.add('video-free');
  w.fire(w.pane, 'pointerdown', { clientX: 1000, clientY: 400, button: 0, target: w.on(VIDEO) });
  w.fire(w.doc, 'pointermove', { clientX: 1002, clientY: 402 });
  w.fire(w.doc, 'pointerup', {});
  ok('④ 탭은 창을 옮기지 않는다', w.calls.apply.length === 0 && w.calls.save === 0);
  ok('④ 탭 뒤 click 을 삼키는 리스너가 남지 않는다', !(w.doc.L.click || []).length);
}
/* ⑤ 오른쪽 버튼으로는 안 끈다 */
{
  const w = world(); w.row.classList.add('video-free');
  w.fire(w.pane, 'pointerdown', { clientX: 1000, clientY: 400, button: 2, target: w.on(VIDEO) });
  w.fire(w.doc, 'pointermove', { clientX: 700, clientY: 340 });
  ok('⑤ 오른쪽 버튼은 끌기가 아니다', w.calls.apply.length === 0);
}
/* ⑥ 넣는 CSS — 손가락 끌기(touch-action)와 «작은 창에서도 떠 있기»(position:fixed, id 두 개) */
{
  const w = world(); const css = w.css.join('\n');
  ok('⑥ 자유 모드의 얼굴 영역에만 touch-action:none', /#vc-main-row\.video-free[^{]*#vc-video-grid\{[^}]*touch-action:none/.test(css));
  ok('⑥ 자유 모드 창을 position:fixed!important 로 띄운다(id 두 개 선택자)', /#vc-main-row\.video-free > #vc-video-pane\{[^}]*position:fixed!important/.test(css));
  ok('⑥ 자유 모드가 아닌 선택자에는 아무것도 안 건다', css.split('}').filter(r => r.trim()).every(r => r.includes('.video-free')));
}

console.log(`\n  ${fail ? '❌' : '🎉'} ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
