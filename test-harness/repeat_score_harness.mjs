// 2026-10-18 — «따라 말해 보기» 채점 (개선안 1순위 ④)
//   js/repeat-score.js 를 가짜 DOM 위에서 실제로 돌리고, 웜업·AI 친구하기의 배선 블록을 오려 내 실행합니다.
//   짝: «채점한다» 옆에 «겹치는 낱말이 없으면 안 그린다» · «시간이 지났으면 안 잰다» · «따라 말하기가 아니면 안 잰다».
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MOD = fs.readFileSync(process.env.RS_SRC || path.join(ROOT, 'cloudflare-deploy/public/js/repeat-score.js'), 'utf8');
const WU = fs.readFileSync(process.env.WU_SRC || path.join(ROOT, 'cloudflare-deploy/public/warmup.html'), 'utf8');
const AF = fs.readFileSync(process.env.AF_SRC || path.join(ROOT, 'cloudflare-deploy/public/ai-friend.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n + (x !== undefined ? ' ' + JSON.stringify(x) : '')); } };

// ── 가짜 DOM ──
function makeDoc() {
  const all = [];
  const el = (tag) => {
    const e = { tagName: tag, children: [], attrs: {}, className: '', textContent: '', id: '', parentNode: null,
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
      appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
      remove() { if (this.parentNode) { const a = this.parentNode.children; const i = a.indexOf(this); if (i >= 0) a.splice(i, 1); this.parentNode = null; } } };
    all.push(e); return e;
  };
  const head = el('head');
  const doc = {
    head, documentElement: head, createElement: el,
    getElementById: (id) => all.find((e) => e.id === id && (e.parentNode || e === head)) || null,
    querySelectorAll: (sel) => { const cls = sel.replace(/^\./, ''); return all.filter((e) => e.parentNode && String(e.className).split(/\s+/).includes(cls)); },
  };
  return doc;
}
const text = (e) => (e.textContent || '') + e.children.map(text).join('');
const find = (e, cls) => { if (String(e.className).split(/\s+/).includes(cls)) return e; for (const c of e.children) { const r = find(c, cls); if (r) return r; } return null; };
const findAll = (e, cls, out = []) => { if (String(e.className).split(/\s+/).includes(cls)) out.push(e); e.children.forEach((c) => findAll(c, cls, out)); return out; };

function loadModule(lang) {
  const doc = makeDoc();
  const win = { getLang: () => lang };
  const ctx = vm.createContext({ window: win, document: doc, Array, Math, String, Object });
  try { vm.runInContext(MOD, ctx); } catch (e) { return { err: e.message }; }
  return { M: win.MangoRepeatScore, doc };
}

const { M, doc, err } = loadModule('ko');
check('모듈을 실제로 실행했다(전제)', !!M, err);
if (M) {
  // tokens
  check('영어: 소문자·기호 제거·아포스트로피 붙임', JSON.stringify(M.tokens("I'm fine, Thanks!")) === '["im","fine","thanks"]', M.tokens("I'm fine, Thanks!"));
  check('숫자는 낱말로(인식기가 2 로 받아 적어도 two 와 같다)', JSON.stringify(M.tokens('I have 2 dogs')) === JSON.stringify(M.tokens('I have two dogs')));
  check('중국어는 글자 하나씩', JSON.stringify(M.tokens('我喜欢猫。')) === '["我","喜","欢","猫"]', M.tokens('我喜欢猫。'));
  // score
  const s1 = M.score('I went to the park yesterday.', 'i went to the park yesterday');
  check('똑같이 말하면 6/6', s1 && s1.hits === 6 && s1.total === 6 && s1.ratio === 1, s1);
  const s2 = M.score('I went to the park yesterday.', 'I go to the park yesterday');
  check('한 낱말 틀리면 5/6 이고 그 낱말이 miss', s2 && s2.hits === 5 && s2.marks[1].w === 'went' && s2.marks[1].ok === false, s2 && s2.marks);
  check('화면 낱말은 원래 글자(대문자·마침표)를 쓴다', s2 && s2.marks[0].w === 'I' && s2.marks[5].w === 'yesterday.', s2 && s2.marks);
  const s3 = M.score('I like dogs', 'um I I like like big dogs');
  check('더듬어 끼어든 말은 점수를 깎지 않는다(LCS)', s3 && s3.hits === 3 && s3.extra === 4, s3);
  check('순서가 뒤바뀌면 전부 맞힌 것이 아니다', M.score('I like dogs', 'dogs like I').hits < 3);
  check('들은 말이 비면 null', M.score('I like dogs', '') === null && M.score('I like dogs', '  ...  ') === null);
  check('목표가 비면 null', M.score('', 'hello') === null);
  // grade
  check('등급 경계 0.9 / 0.6', M.grade(0.9) === 'great' && M.grade(0.89) === 'close' && M.grade(0.6) === 'close' && M.grade(0.59) === 'again');
  // render
  const c1 = M.render('I went to the park yesterday.', 'I go to the park yesterday', () => {});
  check('카드를 그린다 — 5/6 낱말 + 거의 다 됐어요', c1 && /5\/6 낱말/.test(text(c1)) && /거의 다/.test(text(c1)), c1 && text(c1));
  check('카드에 낱말 칩이 목표 낱말 수만큼', c1 && findAll(c1, 'rep-w').length === 6);
  check('못 들은 낱말이 있으면 안내 줄을 붙인다', c1 && !!find(c1, 'rep-note'));
  check('완벽이 아니면 다시 하기 버튼', c1 && !!find(c1, 'rep-btn'));
  check('라벨은 data-ko/data-en 을 «글자 span» 에만', c1 && find(c1, 'rep-title').attrs['data-en'] && !find(c1, 'rep-btn').attrs['data-ko']);
  let retried = null;
  const c2 = M.render('I like dogs', 'I like cats', (b) => { retried = b; });
  find(c2, 'rep-btn').onclick();
  check('다시 하기를 누르면 콜백에 그 버튼을 넘긴다', retried === find(c2, 'rep-btn'));
  const c3 = M.render('I like dogs.', 'i like dogs', () => {});
  check('완벽하면 버튼·안내 없이 축하만', c3 && /완벽/.test(text(c3)) && !find(c3, 'rep-btn') && !find(c3, 'rep-note'));
  check('짝: 겹치는 낱말이 하나도 없으면 안 그린다(다른 말을 보낸 것)', M.render('I like dogs', 'what is your name', () => {}) === null);
  check('짝: 들은 말이 없으면 안 그린다', M.render('I like dogs', '', () => {}) === null);
  // 이전 카드 정리
  const host = doc.createElement('div'); host.appendChild(c1); host.appendChild(c2);
  const c4 = M.render('I like dogs', 'I like', () => {}); host.appendChild(c4);
  check('새 카드를 만들면 옛 카드는 걷는다', findAll(host, 'rep-card').length === 1);
  check('스타일은 한 번만 넣는다', doc.head.children.filter((e) => e.id === 'rep-score-style').length === 1);
  const en = loadModule('en');
  const ce = en.M.render('I went to the park yesterday.', 'I go to the park yesterday', () => {});
  check('영어 화면: words 로 말하고 한글이 없다', ce && /5\/6 words/.test(text(ce)) && !/[가-힣]/.test(text(ce)), ce && text(ce));
  check('«발음 점수» 라고 말하지 않는다(받아 적은 글자로 재는 것)', !/발음 점수|pronunciation score/i.test(MOD.replace(/\/\*[\s\S]*?\*\//g, '')));
}

// ── 배선: 오려 내서 실제로 돌린다 ──
function cutBlock(src, startNeedle) {
  const i = src.indexOf(startNeedle); if (i < 0) return null;
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
  return null;
}
function runWire(page, block, vars) {
  const appended = [];
  const fake = {
    MangoRepeatScore: { render: (t, s, cb) => { vars.calls.push([t, s]); vars.cb = cb; return M && M.render(t, s, cb); } },
  };
  const logEl = { appendChild: (c) => appended.push(c), scrollTop: 0, scrollHeight: 0 };
  const fn = new Function('window', 'MangoRepeatScore', 'log', 'document', 'fixSpeakThenMic', 'Date', 'text', 'msg', 'epoch', 'ST',
    `var _repeatTarget = ST.v; ${block}; ST.v = _repeatTarget;`);
  const doc = { getElementById: () => logEl };
  try { fn(fake, fake.MangoRepeatScore, logEl, doc, (b, t) => vars.retry.push(t), { now: () => vars.now }, vars.said, vars.said, vars.epoch, vars.st); }
  catch (e) { return { err: e.message, appended }; }
  return { appended };
}
for (const [page, SRC, start] of [['웜업', WU, '  var _rt=_repeatTarget; _repeatTarget=null;'], ['AI 친구하기', AF, '{ const _rt = _repeatTarget; _repeatTarget = null;']]) {
  let block;
  if (page === '웜업') { const i = SRC.indexOf(start); const b = cutBlock(SRC, '  if(_rt && _rt.epoch===epoch'); block = i >= 0 && b ? start + '\n' + b : null; }
  else block = cutBlock(SRC, start);
  check(page + ': 채점 배선을 오려 냈다(전제)', !!block);
  if (!block || !M) continue;
  const base = (over) => Object.assign({ calls: [], retry: [], now: 100000, epoch: 3, said: 'I go to the park yesterday', st: { v: { text: 'I went to the park yesterday.', epoch: 3, at: 50000 } } }, over || {});
  let v = base(); let r = runWire(page, block, v);
  check(page + ': 따라 말한 뒤 보내면 채점 카드를 붙인다', !r.err && r.appended.length === 1 && v.calls.length === 1, r.err || r.appended.length);
  check(page + ': 목표는 한 번만 쓴다(다음 말은 안 잰다)', v.st.v === null);
  v.cb && v.cb({}); check(page + ': 다시 하기는 같은 목표 문장으로 다시 연다', v.retry[0] === 'I went to the park yesterday.', v.retry);
  v = base({ st: { v: null } }); r = runWire(page, block, v);
  check(page + ': 짝 — 따라 말하기가 아니면 안 잰다', !r.err && r.appended.length === 0 && v.calls.length === 0);
  v = base({ now: 50000 + 90001 }); r = runWire(page, block, v);
  check(page + ': 짝 — 90초가 지났으면 안 잰다', !r.err && v.calls.length === 0 && v.st.v === null);
  v = base({ said: 'what is your name' }); r = runWire(page, block, v);
  check(page + ': 짝 — 겹치는 낱말이 없으면 카드를 안 붙인다', !r.err && v.calls.length === 1 && r.appended.length === 0);
  if (page === '웜업') { v = base({ epoch: 4 }); r = runWire(page, block, v); check('웜업: 짝 — 화면이 바뀌었으면(epoch) 안 잰다', !r.err && v.calls.length === 0); }
  // 목표를 «마이크를 여는 순간» 에 적는가
  const open = cutBlock(SRC, page === '웜업' ? '  var openMic = function(){' : '      const openMic = function(){');
  check(page + ': 마이크를 열 때 목표 문장을 적는다', !!open && /_repeatTarget = \{ text: text/.test(open) && open.indexOf('_repeatTarget') < open.indexOf('toggleMic'), open);
  check(page + ': 모듈을 싣는다', /<script src="\/js\/repeat-score\.js\?v=\d+" defer><\/script>/.test(SRC));
}
check('웜업: 멈추면(pauseWarmup) 목표를 버린다', /function pauseWarmup\(\)\{[\s\S]{0,800}_repeatTarget=null;/.test(WU));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
