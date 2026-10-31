// 📘 대리점 결제 안내 매뉴얼 (2026-10-28) — manager.html 의 진짜 스크립트를 작은 가짜 DOM 에서 돌린다.
//   지키는 것: ① 화상영어 수업료 카드를 처음 펼치면 먼저 뜬다(AI 카드는 #1853 그림 안내서 — 겹치지 않게) ② [끄기] = 이번만 ③ [다시 보지 않기] = 이 기기에서 자동 표시 끔
//             ④ 그래도 버튼으로는 언제든 연다 ⑤ 토스에서 돌아온 화면은 결과 문구를 가리지 않는다 ⑥ 대리점에게만 보인다.
//   «막힌다» 와 «뜬다» 를 짝으로 둔다 — 한쪽만 보면 «늘 안 뜬다» 같은 엉터리 수리도 통과한다.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('cloudflare-deploy/public/manager.html', 'utf8');
let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '—', e.message); }
}

// ── 정본 스크립트 오려 내기 — HIDE_KEY 가 든 <script> 블록 하나 ─────────────────
const keyAt = html.indexOf("'mangoi_payguide_hide_v1'");
const sStart = html.lastIndexOf('<script>', keyAt);
const sEnd = html.indexOf('</script>', keyAt);
const src = html.slice(sStart + '<script>'.length, sEnd);
check('전제: 매뉴얼 스크립트를 오려 냈다', () => { assert.ok(keyAt > 0 && sStart > 0 && sEnd > keyAt); assert.match(src, /window\.payGuideAuto\s*=/); });

function boot({ search = '', storage = new Map(), blocked = false, modal = true } = {}) {
  const listeners = {};
  const dlg = {
    open: false, attrs: {},
    showModal: modal ? function () { this.open = true; } : undefined,
    close: modal ? function () { this.open = false; } : undefined,
    setAttribute(k) { this.attrs[k] = 1; if (k === 'open') this.open = true; },
    removeAttribute(k) { delete this.attrs[k]; if (k === 'open') this.open = false; },
    querySelector() { return { scrollTop: 50 }; },
    addEventListener(n, fn) { listeners[n] = fn; },
  };
  const title = { focus() {} };
  const document = { getElementById(id) { return id === 'payGuide' ? dlg : id === 'pgTitle' ? title : null; } };
  const window = {};
  const localStorage = {
    getItem(k) { if (blocked) throw Error('blocked'); return storage.has(k) ? storage.get(k) : null; },
    setItem(k, v) { if (blocked) throw Error('blocked'); storage.set(k, String(v)); },
  };
  vm.runInContext(src, vm.createContext({ window, document, localStorage, location: { search } }));
  return { w: window, dlg, storage, listeners };
}

// ① 처음 펼치면 먼저 뜬다 (짝: 아래 «안 뜬다» 들)
check('수업료 카드를 처음 펼치면 매뉴얼이 뜬다', () => { const b = boot(); b.w.payGuideAuto(); assert.equal(b.dlg.open, true); });
check('showModal 이 없는 옛 브라우저도 open 속성으로 뜬다', () => { const b = boot({ modal: false }); b.w.payGuideAuto(); assert.equal(b.dlg.open, true); });

// ② [끄기] = 이번만
check('끄기 → 닫히고 아무것도 저장하지 않는다', () => {
  const b = boot(); b.w.payGuideAuto(); b.w.closePayGuide();
  assert.equal(b.dlg.open, false); assert.equal(b.storage.size, 0);
});
check('끄기 뒤 같은 화면에서 카드를 다시 펼쳐도 또 뜨지 않는다(한 화면에 한 번)', () => {
  const b = boot(); b.w.payGuideAuto(); b.w.closePayGuide(); b.w.payGuideAuto(); assert.equal(b.dlg.open, false);
});
check('끄기 뒤 화면을 새로 열면 다시 뜬다', () => {
  const s = new Map(); const a = boot({ storage: s }); a.w.payGuideAuto(); a.w.closePayGuide();
  const b = boot({ storage: s }); b.w.payGuideAuto(); assert.equal(b.dlg.open, true);
});

// ③ [다시 보지 않기]
check('다시 보지 않기 → 닫히고 이 기기에 기록', () => {
  const b = boot(); b.w.payGuideAuto(); b.w.payGuideNever();
  assert.equal(b.dlg.open, false); assert.equal(b.storage.get('mangoi_payguide_hide_v1'), '1');
});
check('다시 보지 않기 뒤 새 화면에서는 자동으로 안 뜬다', () => {
  const s = new Map([['mangoi_payguide_hide_v1', '1']]); const b = boot({ storage: s }); b.w.payGuideAuto(); assert.equal(b.dlg.open, false);
});
// ④ 그래도 버튼으로는 연다
check('다시 보지 않기 뒤에도 버튼(openPayGuide)으로는 열린다', () => {
  const s = new Map([['mangoi_payguide_hide_v1', '1']]); const b = boot({ storage: s }); b.w.openPayGuide(); assert.equal(b.dlg.open, true);
});
check('버튼으로 먼저 열어 봤으면 카드를 펼칠 때 또 뜨지 않는다', () => {
  const b = boot(); b.w.openPayGuide(); b.w.closePayGuide(); b.w.payGuideAuto(); assert.equal(b.dlg.open, false);
});
check('저장소가 막힌 기기: 다시 보지 않기가 던지지 않고 이 화면에서는 다시 안 뜬다', () => {
  const b = boot({ blocked: true }); b.w.payGuideAuto(); assert.equal(b.dlg.open, true);
  b.w.payGuideNever(); assert.equal(b.dlg.open, false); b.w.payGuideAuto(); assert.equal(b.dlg.open, false);
});
check('저장소가 막힌 기기: 다음 화면에서는 다시 뜬다(저장을 못 했으니 «안 뜬다» 고 약속하지 않는다)', () => {
  const b = boot({ blocked: true }); b.w.payGuideAuto(); assert.equal(b.dlg.open, true);
});
check('바깥(어두운 부분)을 누르면 닫히고, 안쪽을 누르면 안 닫힌다', () => {
  const b = boot(); b.w.openPayGuide();
  b.listeners.click({ target: {} }); assert.equal(b.dlg.open, true);
  b.listeners.click({ target: b.dlg }); assert.equal(b.dlg.open, false);
});

// ⑤ 토스에서 돌아온 화면
for (const q of ['?tui_paid=1', '?tui_fail=1', '?aib_paid=1', '?aib_fail=1&code=X']) {
  check('결제 복귀(' + q + ')에는 자동으로 안 뜬다', () => { const b = boot({ search: q }); b.w.payGuideAuto(); assert.equal(b.dlg.open, false); });
}
check('결제 복귀 화면에서도 버튼으로는 열린다', () => { const b = boot({ search: '?tui_paid=1' }); b.w.openPayGuide(); assert.equal(b.dlg.open, true); });
check('무관한 주소값(?tui_paid=0)은 자동 표시를 막지 않는다', () => { const b = boot({ search: '?tui_paid=0' }); b.w.payGuideAuto(); assert.equal(b.dlg.open, true); });
check('결제 복귀 주소는 메인 스크립트가 지우기 «전» 에 읽는다(블록 순서)', () => {
  const cleanAt = html.indexOf("qs.get('tui_paid')");
  assert.ok(cleanAt > 0, 'tui 복귀 처리 블록을 찾지 못함'); assert.ok(sEnd < cleanAt, '매뉴얼 스크립트가 복귀 처리보다 뒤에 있다');
});

// ── 배선: 화면이 정본을 실제로 부르는가 ──────────────────────────────────────
function tagOf(id) { const i = html.indexOf('id="' + id + '"'); assert.ok(i > 0, id + ' 없음'); return html.slice(html.lastIndexOf('<', i), html.indexOf('>', i) + 1); }
check('화상영어 수업료 카드를 펼치면 원래 불러오기 + 매뉴얼 자동 표시를 함께 부른다', () => {
  assert.match(tagOf('c-tuition'), /ontoggle="if\(this\.open\)\{loadTuition\(\);payGuideAuto\(\);\}"/);
});
check('화상영어 수업료 카드 안에 «📖 결제 방법 보기» 버튼이 있고 매뉴얼을 연다', () => {
  const i = html.indexOf('id="c-tuition"'); const body = html.slice(i, html.indexOf('</details>', i));
  assert.match(body, /class="aib-guide-link"><button type="button" class="btn btn-gray" onclick="openPayGuide\(\)">/);
});
// AI 컨텐츠 카드는 #1853 그림 안내서(aibGuideAuto)가 맡는다 — 이 매뉴얼까지 뜨면 창 두 개가 겹친다(짝으로 본다)
check('AI 컨텐츠 카드는 그림 안내서만 자동으로 띄운다(이 매뉴얼은 안 띄움 — 창 겹침 방지)', () => {
  const t = tagOf('c-aibill');
  assert.match(t, /aibGuideAuto\(\)/, '그림 안내서 배선이 사라졌다');
  assert.doesNotMatch(t, /payGuideAuto/, '한 카드에 안내 창 두 개');
});
check('매뉴얼의 AI 칸은 그림 안내서를 연다(내용을 두 벌 두지 않는다)', () => {
  const dlgHtml = html.slice(html.indexOf('<dialog id="payGuide"'), html.indexOf('</dialog>'));
  assert.match(dlgHtml, /onclick="closePayGuide\(\);aibGuideOpen\(\)"/);
  assert.match(html, /window\.aibGuideOpen\s*=\s*function/, '그림 안내서 함수가 없다');
});
check('[끄기]·[다시 보지 않기] 가 순서대로 아래 줄에 있고 정본을 부른다', () => {
  const foot = html.slice(html.indexOf('<div class="pg-foot">'), html.indexOf('</dialog>'));
  const a = foot.indexOf('onclick="closePayGuide()"'), b = foot.indexOf('onclick="payGuideNever()"');
  assert.ok(a > 0 && b > a, '끄기 → 다시 보지 않기 순서');
  assert.match(foot, /data-en="Close" data-ko="끄기"/); assert.match(foot, /data-en="Don't show again" data-ko="다시 보지 않기"/);
});
// ⑥ 대리점에게만
for (const id of ['qPayGuide', 'sidePayGuide']) {
  check(id + ' 는 처음엔 숨겨져 있다', () => assert.match(tagOf(id), /\shidden[\s>]/));
}
check('paintMonth 가 두 버튼을 «대리점일 때만» 보이게 한다', () => {
  const p = html.slice(html.indexOf('function paintMonth(){'), html.indexOf('IS_HQ = (sc.type'));
  assert.match(p, /\['qPayGuide', 'sidePayGuide'\]\.forEach\(function\(id\)\{ var w = document\.getElementById\(id\); if \(w\) w\.hidden = \(sc\.type !== 'agency'\); \}\)/);
});
check('결제 카드도 여전히 대리점에게만 열린다(짝)', () => {
  const p = html.slice(html.indexOf('function paintMonth(){'), html.indexOf('IS_HQ = (sc.type'));
  assert.match(p, /_tui\.hidden = \(sc\.type !== 'agency'\)/); assert.match(p, /_aib\.hidden = \(sc\.type !== 'agency'\)/);
});
// 그림 안내서 링크 — 표에 적힌 파일이 실제로 있어야 한다(없으면 «열었는데 404» 가 조용히 남는다)
check('매뉴얼의 PDF 링크(한/영)가 가리키는 파일이 실재한다', () => {
  const dlgHtml = html.slice(html.indexOf('<dialog id="payGuide"'), html.indexOf('</dialog>'));
  const hrefs = [...dlgHtml.matchAll(/href="(\/library\/[^"]+\.pdf)"/g)].map(m => m[1]);
  assert.deepEqual(hrefs.sort(), ['/library/agency/ai-pay-guide-en.pdf', '/library/agency/ai-pay-guide-kr.pdf']);
  for (const h of hrefs) assert.ok(existsSync('cloudflare-deploy/public' + h), h + ' 없음');
});
// 창 모양 규칙이 «밝은 화면» 에도 걸리는가 — 앞에 html.dark 가 붙으면 밝은 화면에선 브라우저 기본 상자(검은 테두리)가 된다(2026-10-28 실제로 밟음)
check('매뉴얼 창 기본 규칙은 접두사 없이 선언돼 있다(밝은·어두운 화면 둘 다 적용)', () => {
  assert.match(html, /\n#payGuide\{position:fixed;/);
  assert.doesNotMatch(html, /html\.dark #payGuide\{position:fixed/);
});
// 설계 계약 — 외부 리소스 0 · 애니메이션 0
check('매뉴얼은 외부 파일·서버 호출·애니메이션을 쓰지 않는다', () => {
  const dlgHtml = html.slice(html.indexOf('<dialog id="payGuide"'), sEnd);
  assert.doesNotMatch(dlgHtml, /<script\s+src|<link\s|fetch\(/);
  const css = html.slice(html.indexOf('.qbar button.qpg'), html.indexOf('</style>', html.indexOf('.qbar button.qpg')));
  assert.doesNotMatch(css, /transition|animation|@keyframes/);
});

console.log(`결과: PASS ${pass} · FAIL ${fail}`);
if (fail) process.exit(1);
console.log('PASS: 첫 펼침 표시 · 끄기(이번만) · 다시 보지 않기(기기) · 버튼은 언제나 · 결제 복귀 보호 · 대리점 전용');
