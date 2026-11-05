// 🌐 매일보고 → 한국어 번역 (2026-11-05 사장님 「한글번역 버튼을 적당한 곳에 설치해서 작동하게 해줘」 — 팀 보고판)
//   정본: cloudflare-deploy/public/js/handover-ko.js (번역 — 읽기 화면·팀 보고판 공용)
//   버튼: daily-handover-board.js(펼친 보고 맨 위) · daily-handover.js(읽기 화면, 2026-10-08부터)
//
// «글자가 있는가» 가 아니라 «실제로 돌려» 본다 — 가짜 fetch 로 서버 답을 흉내 내고 결과를 잰다.
//   A. 번역 정본: 줄마다 보낸다(chat 모드는 첫 줄만 쓴다) · 머리표 보존 · 한국어 줄은 안 보낸다 · 긴 줄은 문장으로 ·
//      실패한 줄은 원문 그대로 + 센다 · 실패는 기억하지 않는다(다시 누르면 다시 묻는다) · 서버 오류는 던진다
//   B. 보고판 버튼: 켜기 → 번역본으로 그린다 · 끄기 → 다시 묻지 않는다 · 실패 → «다시 누르기» · 판(version)이 바뀌면 다시 번역
//   C. 배선: 공용 파일이 두 화면보다 먼저 실린다 · 두 화면에 번역 fetch 가 «다시» 생기지 않았다 · 공용 파일이 없으면 버튼을 안 보인다
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy/public');
const koSrc = readFileSync(join(PUB, 'js/handover-ko.js'), 'utf8');
const boardSrc = readFileSync(join(PUB, 'js/daily-handover-board.js'), 'utf8');
const mainSrc = readFileSync(join(PUB, 'js/daily-handover.js'), 'utf8');
const html = readFileSync(join(PUB, 'daily-handover.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('❌ FAIL', name, extra); } };

// 가짜 서버: 영어 문장 → '번역(' + 문장 + ')' (한글이 들어가야 «번역됨»). fail 에 든 문장은 원문 그대로(= chat 모드의 실패 모양).
function load({ fail: bad = [], status = 200 } = {}) {
  const sent = [];
  const fetch = async (url, opt) => {
    const body = JSON.parse(opt.body);
    sent.push({ url, body });
    const map = {};
    body.texts.forEach(t => { map[t] = bad.includes(t) ? t : '번역(' + t + ')'; });
    return { ok: status === 200, status, json: async () => (status === 200 ? { ok: true, map } : { ok: false }) };
  };
  const win = {};
  vm.runInNewContext(koSrc, { window: win, fetch });
  return { KO: win.MangoiHandoverKo, sent };
}

// ── A. 번역 정본 ────────────────────────────────────────────────────────────
{
  const { KO, sent } = load();
  ok('A0 공용 객체가 window 에 걸린다', !!KO && typeof KO.translate === 'function' && typeof KO.needs === 'function');
  const d = { work: '1. Problem:\n\n• Monitored teachers\' ongoing classes.\n지사 정산 확인', no_issue: false,
    issue: 'Teacher Krystel is marked resigned.', no_open: true, open: '', owner: 'mgr_jjw', student: '', class_info: '' };
  const out = await KO.translate(d);
  const texts = sent.flatMap(s => s.body.texts);
  ok('A1 서버에 chat 모드·target ko 로 보낸다', sent.length === 1 && sent[0].url === '/api/translate'
    && sent[0].body.mode === 'chat' && sent[0].body.target === 'ko', JSON.stringify(sent[0] && sent[0].body));
  ok('A2 줄마다 따로 보낸다(chat 모드는 답의 첫 줄만 쓴다)', texts.every(t => !/\n/.test(t)) && texts.includes('1. Problem:'), texts.join(' | '));
  ok('A3 머리표(•)는 떼고 보내고 결과에는 다시 붙인다', texts.includes("Monitored teachers' ongoing classes.")
    && out.work.split('\n')[2] === "• 번역(Monitored teachers' ongoing classes.)", out.work);
  ok('A4 한국어 줄·빈 줄은 안 보내고 그대로 둔다', !texts.some(t => /[가-힣]/.test(t)) && out.work.split('\n')[1] === ''
    && out.work.split('\n')[3] === '지사 정산 확인');
  ok('A5 문제 칸도 번역 · 이름·체크 등 다른 칸은 그대로', out.issue === '번역(Teacher Krystel is marked resigned.)'
    && out.owner === 'mgr_jjw' && out.no_issue === false && out.__failed === 0);
  ok('A6 원본은 바꾸지 않는다(사본을 돌려준다)', d.work.startsWith('1. Problem:') && out !== d && !('__failed' in d));
  const before = sent.length;
  await KO.translate(d);
  ok('A7 한 번 번역한 문장은 다시 묻지 않는다(두 화면 공용 기억)', sent.length === before);
}
{
  // 긴 줄 — chat 모드는 max_tokens 300·5초 상한이라 통째로 보내면 잘리거나 직역으로 떨어진다.
  const { KO, sent } = load();
  const s1 = 'At managers page, I postponed a class and I want to restore the class or undo the postponement but there is no option for that.';
  const s2 = 'Can we still have the undo postponement option even when the time has passed already?';
  const s3 = 'Yesterday at 7 p.m. it happened twice, e.g. with Teacher Krystel.';
  const longLine = s1 + ' ' + s2 + ' ' + s3;
  const out = await KO.translate({ work: longLine });
  const texts = sent.flatMap(s => s.body.texts);
  ok('A8 긴 줄은 문장으로 나눠 보낸다', longLine.length > 220 && texts.length === 3 && texts[0] === s1 && texts[1] === s2, texts.join(' | '));
  ok('A9 소문자로 이어지는 약어(e.g. / p.m.)에서는 안 끊는다', texts[2] === s3, texts[2]);
  ok('A10 나눈 문장은 한 줄로 다시 잇는다(줄 수 그대로)', out.work === texts.map(t => '번역(' + t + ')').join(' ') && !out.work.includes('\n'));
  const short = load();
  await short.KO.translate({ work: s1 });
  ok('A11 짝: 짧은 줄은 나누지 않는다', short.sent[0].body.texts.length === 1 && short.sent[0].body.texts[0] === s1);
}
{
  const { KO, sent } = load({ fail: ['Line two fails.'] });
  const out = await KO.translate({ work: 'Line one works.\nLine two fails.' });
  ok('A12 번역 못 한 줄은 원문 그대로 두고 센다(지어내지 않는다)', out.work === '번역(Line one works.)\nLine two fails.' && out.__failed === 1, JSON.stringify(out));
  const n = sent.length;
  await KO.translate({ work: 'Line one works.\nLine two fails.' });
  ok('A13 실패는 기억하지 않는다 — 다시 누르면 실패한 줄만 다시 묻는다', sent.length === n + 1
    && sent[n].body.texts.join() === 'Line two fails.', JSON.stringify(sent[n] && sent[n].body.texts));
}
{
  const { KO } = load({ status: 503 });
  let threw = false;
  try { await KO.translate({ work: 'Hello there.' }); } catch { threw = true; }
  ok('A14 서버가 실패하면 던진다(버튼이 «다시 누르기» 를 보인다)', threw);
  ok('A15 needs: 영어 줄이 있으면 참', KO.needs({ work: 'Checked the schedule.' }) && KO.needs({ work: '정산', issue: 'Audio issue' }));
  ok('A16 needs 짝: 한국어뿐이거나 «영어 이름이 섞인 한국어» 면 거짓(서버도 그 줄을 이미 한국어로 본다)',
    !KO.needs({ work: '지사 정산 자료 정리' }) && !KO.needs({ work: 'Krystel 선생님 퇴사 처리' }) && !KO.needs({ work: '', issue: '' }) && !KO.needs({}));
}

// ── B. 보고판 버튼(toggleKo) — 함수를 오려 내 «실제로 실행» ───────────────────────
const cut = (src, anchor) => { const s = src.indexOf(anchor); if (s < 0) return ''; let d = 0;
  for (let i = src.indexOf('{', s); i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) return src.slice(s, i + 1); } return ''; };
const pieces = ['function koKey(', 'function shown(', 'function headlineOf(', 'function koBar(', 'async function toggleKo(', 'function focusKo(']
  .map(a => cut(boardSrc, a));
ok('B0 보고판 번역 함수 6개를 오려 냈다', pieces.every(Boolean), pieces.map(p => !!p).join());
function board(translateImpl) {
  const ko = { on: {}, done: {}, busy: {}, err: {} }, painted = [], said = [], calls = [];
  const KO = { needs: () => true, translate: async p => { calls.push(p); return translateImpl(p); } };
  const el = (tag, text) => ({ tag, textContent: text == null ? '' : text, children: [], attrs: {}, append(...c) { this.children.push(...c); },
    setAttribute(k, v) { this.attrs[k] = v; } });
  const f = new Function('ko', 'KO', 'S', 'el', 'paint', 'say', 'box', pieces.join('\n') + '\nreturn { koKey, shown, headlineOf, koBar, toggleKo };')(
    ko, KO, { open: 'mgr_melca' }, el, () => painted.push(1), (m, bad) => said.push([m, !!bad]), { querySelector: () => null });
  return { ...f, ko, painted, said, calls };
}
{
  const row = { username: 'mgr_melca', headline: 'Updated teacher schedules', report: { id: 9, version: 2, payload: { work: 'Updated teacher schedules\nCalled parents' } } };
  const b = board(async p => ({ ...p, work: '강사 일정 수정\n학부모 통화', __failed: 0 }));
  ok('B1 처음엔 «한국어로 번역» 버튼 · 원문으로 그린다', /한국어로 번역/.test(b.koBar(row).children[0].textContent) && b.shown(row.report).work.startsWith('Updated'));
  await b.toggleKo(row);
  ok('B2 누르면 번역본으로 그린다(본문·한 줄 요약)', b.shown(row.report).work === '강사 일정 수정\n학부모 통화' && b.headlineOf(row) === '강사 일정 수정'
    && b.calls.length === 1 && b.painted.length >= 2);
  const bar = b.koBar(row);
  ok('B3 켜진 버튼은 «원문 보기» · AI 번역 안내가 붙는다', /원문 보기/.test(bar.children[0].textContent) && bar.children[0].attrs['aria-pressed'] === 'true'
    && /AI 번역/.test(bar.children[1].textContent));
  await b.toggleKo(row);
  ok('B4 다시 누르면 원문 — 번역을 다시 묻지 않는다', b.shown(row.report).work.startsWith('Updated') && b.headlineOf(row) === 'Updated teacher schedules' && b.calls.length === 1);
  await b.toggleKo(row);
  ok('B5 또 누르면 기억한 번역본을 바로 보인다(다시 안 묻는다)', b.shown(row.report).work.startsWith('강사') && b.calls.length === 1);
  const edited = { ...row, report: { ...row.report, version: 3 } };
  ok('B6 보고가 고쳐지면(version 바뀜) 옛 번역을 보이지 않는다', b.shown(edited.report).work.startsWith('Updated'));
  const partial = board(async p => ({ ...p, work: '강사 일정 수정\nCalled parents', __failed: 1 }));
  await partial.toggleKo(row);
  ok('B7 일부 실패면 «N줄은 원문 그대로» 를 말한다', /1줄은 원문 그대로/.test(partial.koBar(row).children[1].textContent));
}
{
  const row = { username: 'mgr_melca', headline: 'Hi', report: { id: 1, version: 1, payload: { work: 'Hi there' } } };
  const b = board(async () => { throw new Error('translate 503'); });
  await b.toggleKo(row);
  ok('B8 실패 → 원문 그대로 · «다시 누르기» 버튼 · 보고판에 알림', b.shown(row.report).work === 'Hi there' && /다시 누르기/.test(b.koBar(row).children[0].textContent)
    && b.said.some(([m, bad]) => bad && /번역하지 못했습니다/.test(m)) && b.ko.busy['1:1'] === false);
  const slow = board(() => new Promise(() => {}));
  slow.toggleKo(row);
  const busyBtn = slow.koBar(row).children[0];
  ok('B9 번역 중에는 버튼이 꺼지고 «번역 중…» — 두 번 눌러도 한 번만 묻는다', busyBtn.disabled === true && /번역 중/.test(busyBtn.textContent)
    && (slow.toggleKo(row), slow.calls.length === 1));
}

// ── C. 배선 ────────────────────────────────────────────────────────────────
{
  const at = s => html.indexOf('<script src="/js/' + s);
  ok('C1 공용 번역 파일이 두 화면 스크립트보다 먼저 실린다(defer 순서)', at('handover-ko.js') > 0 && at('handover-ko.js') < at('daily-handover.js')
    && at('handover-ko.js') < at('daily-handover-board.js') && /<script src="\/js\/handover-ko\.js\?v=\d+" defer><\/script>/.test(html));
  const strip = s => s.split('\n').map(l => l.replace(/\s\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  ok('C2 ⛔ 두 화면에 번역 fetch 가 다시 생기지 않았다(정본은 handover-ko.js 하나)', !/\/api\/translate/.test(strip(boardSrc)) && !/\/api\/translate/.test(strip(mainSrc))
    && /\/api\/translate/.test(koSrc));
  ok('C3 보고판은 번역할 줄이 있을 때만 버튼을 단다', /if \(KO && KO\.needs\(r\.payload \|\| \{\}\)\) b\.append\(koBar\(row\)\);/.test(boardSrc));
  // 공용 파일이 안 실렸을 때 — 읽기 화면은 버튼을 안 보인다(누를 수 없는 버튼을 두지 않는다).
  const needsSrc = cut(mainSrc, 'function needsKo(');
  const needsNo = new Function('KO', needsSrc + '\nreturn needsKo;')(null), needsYes = new Function('KO', needsSrc + '\nreturn needsKo;')({ needs: () => true });
  ok('C4 읽기 화면: 공용 파일이 없으면 번역 버튼을 숨긴다 · 짝: 있으면 보인다', needsNo({ work: 'Hello' }) === false && needsYes({ work: 'Hello' }) === true);
  ok('C5 보고판도 사람이 쓴 글은 textContent 로만(innerHTML 0)', !/innerHTML|insertAdjacentHTML|outerHTML/.test(boardSrc + koSrc));
  // ⚠️ 주석을 벗긴 사본으로 본다 — handover-ko.js 의 «쓰지 말 것» 경고 주석이 그 글자를 담고 있다(실제로 걸렸다).
  ok('C6 ⛔ 뒤돌아보기 정규식(?<=) 없음 — 옛 Safari 에서 파일 전체가 문법 오류로 죽는다', !/\(\?<[=!]/.test(strip(koSrc) + strip(boardSrc)));
}

console.log(`handover_ko_harness — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
