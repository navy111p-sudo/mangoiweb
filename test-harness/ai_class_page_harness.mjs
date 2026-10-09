// 🤖 A.i 선생님 수업(/ai-class.html) — 자동 회귀 하니스 (2026-10-07)
// 문자열 «있는가» 가 아니라, 페이지의 함수를 오려 내 «실제로 돌려» 답을 봅니다.
//   ① 레슨 목록(카탈로그)이 문장 원본(tb-say)과 같은가 — 스크립트를 다시 돌린 결과와 대조
//   ② 페이지가 고른 레슨의 쪽을 만드는 규칙(unitFrom)이 443레슨 전부에서 목록과 같은 쪽 수를 내는가
//   ③ 그림 주소는 교재 API(/api/textbook-files/<id>/raw)만 받는가 — 다른 주소는 버리는가(짝)
//   ④ 원본 슬라이드 이미지·외부 글꼴을 저장소·페이지에 싣지 않았는가
//   ⑤ 엔진을 실제로 돌려 몇 레슨을 끝까지 수업해 보는가
//   ⑥ 학생 이름 — 로그인 이름이 아이디와 같으면 부르지 않는가(짝: 진짜 이름은 부른다)
//   ⑦ 메뉴 연결 — 홈 드로어·공용 사이드바·전체메뉴가 같은 주소·같은 이름으로 잇는가
// 실패하면 종료코드 1.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const PUB = path.join(ROOT, 'cloudflare-deploy', 'public');
const PAGE = process.env.AI_CLASS_PAGE || path.join(PUB, 'ai-class.html');
const require = createRequire(import.meta.url);

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }
const html = fs.readFileSync(PAGE, 'utf8');
const strip = t => t.replace(/<!--[\s\S]*?-->/g, '');

// 함수 몸통을 «중괄호 짝» 으로 오려 낸다 (길이로 자르지 않는다)
function fnSrc(name) {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let j = html.indexOf('{', i), d = 0;
  for (let k = j; k < html.length; k++) { const c = html[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) return html.slice(i, k + 1); } }
  return '';
}

// ① 카탈로그
const { buildCatalog, OUT } = await import(url.pathToFileURL(path.join(ROOT, 'scripts', 'build-ai-class-catalog.mjs')).href);
const cat = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const fresh = buildCatalog();
ok(cat.length > 400, `catalog has ${cat.length} lessons (expected 400+)`);
ok(JSON.stringify(cat) === JSON.stringify(fresh), 'catalog differs from tb-say — run: node scripts/build-ai-class-catalog.mjs');

// ② unitFrom — 페이지에서 오려 내 실제로 돌린다
const reLine = html.match(/var KEY_RE = (\/.+\/i);/);
ok(!!reLine, 'page KEY_RE not found');
const unitFromSrc = fnSrc('unitFrom');
ok(!!unitFromSrc, 'page unitFrom() not found');
let unitFrom = null;
try { unitFrom = new Function('KEY_RE', unitFromSrc + '; return unitFrom;')(eval(reLine[1])); } catch (e) { ok(false, 'unitFrom eval failed: ' + e.message); }
const files = {};
let badUnits = 0, sortedBad = 0, checked = 0;
if (unitFrom) for (const c of cat) {
  const d = files[c.file] || (files[c.file] = JSON.parse(fs.readFileSync(path.join(PUB, 'data', 'tb-say', c.file + '.json'), 'utf8')));
  const u = unitFrom(c, d); checked++;
  if (u.pages.length !== c.n || u.id !== c.id) badUnits++;
  for (let i = 1; i < u.pages.length; i++) if (u.pages[i].slide <= u.pages[i - 1].slide) { sortedBad++; break; }
}
ok(checked === cat.length, `unitFrom checked ${checked}/${cat.length}`);
ok(badUnits === 0, `unitFrom page count differs in ${badUnits} lessons`);
ok(sortedBad === 0, `unitFrom pages out of order in ${sortedBad} lessons`);
// 원본 키 순서가 뒤섞여 와도 쪽 번호 순서로 (Slide10 이 Slide2 앞에 오지 않게)
if (unitFrom) {
  const c0 = cat[0], d0 = files[c0.file], keys = Object.keys(d0).reverse(), shuffled = {};
  keys.forEach(k => { shuffled[k] = d0[k]; });
  const u0 = unitFrom(c0, shuffled);
  ok(u0.pages.length > 2 && u0.pages.every((p, i) => !i || p.slide > u0.pages[i - 1].slide), 'unitFrom does not sort pages by slide number');
}
// 짝: 다른 판(Easy/Hard)의 쪽을 섞지 않는다
const siu = cat.find(c => /SIU BASIC 001/.test(c.book) && c.part === 'Easy');
if (siu && unitFrom) {
  const d = files[siu.file];
  const u = unitFrom(siu, d);
  ok(u.pages.every(p => / Easy \/ /.test(p.name)), 'unitFrom mixed Easy/Hard pages');
  ok(u.pages.length > 0, 'unitFrom found no SIU pages');
} else ok(false, 'no SIU BASIC 001 Easy lesson in catalog');

// ③ 그림 주소 — loadSlides 를 가짜 응답으로 실제로 돌린다
const lsSrc = fnSrc('loadSlides');
ok(!!lsSrc, 'page loadSlides() not found');
if (lsSrc) {
  const fake = { items: [
    { name: 'A', url: '/api/textbook-files/12/raw' },
    { name: 'A', url: '/api/textbook-files/99/raw' },          // 같은 이름이면 «먼저 온 것»(최신)만
    { name: 'B', url: 'https://evil.example/x.jpg' },          // 다른 주소는 버린다
    { name: 'C', url: '/api/textbook-files/7/raw?x=1' },
    { name: 'D', url: '/api/textbook-files/34/raw' }] };
  const getJson = () => Promise.resolve(fake);
  const run = new Function('getJson', lsSrc + '; return loadSlides;')(getJson);
  const m = await run('BTS 1 001 (Welcome to school)');
  ok(m.A === '/api/textbook-files/12/raw', 'loadSlides: first item for a name not kept ' + JSON.stringify(m));
  ok(!('B' in m) && !('C' in m), 'loadSlides accepted a non-API url ' + JSON.stringify(m));
  ok(m.D === '/api/textbook-files/34/raw', 'loadSlides dropped a valid url (pair)');
  // 실패하면 빈 표(문장만 보이게) — 수업은 그대로
  let m2 = null;
  try { m2 = await new Function('getJson', lsSrc + '; return loadSlides;')(() => Promise.reject(new Error('net')))('x'); } catch (e) { m2 = 'threw: ' + e.message; }
  ok(m2 && typeof m2 === 'object' && !Object.keys(m2).length, 'loadSlides failure did not fall back to {} (' + m2 + ')');
}
ok(/encodeURIComponent\(book\)/.test(lsSrc), 'loadSlides must encode the book name');

// ④ 원본 이미지·외부 글꼴·샘플 흔적
ok(!fs.existsSync(path.join(PUB, 'ai-class')), 'public/ai-class/ folder exists (slide images must not be committed)');
const imgFiles = fs.readdirSync(PUB).filter(f => /^s\d+\.webp$/.test(f));
ok(imgFiles.length === 0, 'slide images committed in public/');
const code = strip(html);
ok(!/fonts\.googleapis|IBM Plex/.test(code), 'page loads external Google fonts');
ok(!/units\.json|slides-map|'slides\/'/.test(code), 'page still references sample data files');
ok(/<script src="\/js\/ai-class-engine\.js\?v=\d+"><\/script>/.test(code), 'engine script not versioned');
// 목록 주소의 ?v= 는 «내용 해시» — 목록을 다시 만들고 주소를 안 바꾸면 학생 브라우저에 옛 목록이 1년 남는다
const catV = (code.match(/\/data\/ai-class-catalog\.json\?v=([0-9a-f]+)/) || [])[1];
const catHash = (await import('node:crypto')).createHash('sha256').update(fs.readFileSync(OUT)).digest('hex').slice(0, 8);
ok(catV === catHash, `catalog ?v=${catV} must equal its content hash ${catHash}`);
for (const f of ['lily-closed', 'lily-mid', 'lily-wide']) {
  ok(code.includes(`src="/img/${f}.webp"`), `page does not use /img/${f}.webp`);
  ok(fs.existsSync(path.join(PUB, 'img', f + '.webp')), `/img/${f}.webp missing`);
}
ok(/\[hidden\]\{display:none!important\}/.test(code), '[hidden] rule missing');
ok(/<meta name="robots" content="noindex">/.test(html), 'hidden page should be noindex');
// 카메라는 내 화면에서만 — 어디로도 보내지 않는다
ok(!/RTCPeerConnection|MediaRecorder|captureStream/.test(code), 'camera stream may be sent/recorded');
ok(/audio:\s*false/.test(code), 'camera must not open the microphone');
// 상주 타이머 금지 — setInterval 은 수업 타이머 하나(start 안)
const si = (code.match(/setInterval\(/g) || []).length;
ok(si === 1 && fnSrc('start').includes('setInterval('), `setInterval must only be the class timer inside start() (found ${si})`);
ok(!/MutationObserver/.test(code), 'page must not use MutationObserver');

// ⑤ 엔진을 실제로 돌린다 — 쉬운 학생(늘 정확히 따라 말함)으로 몇 레슨 끝까지
const E = require(path.join(PUB, 'js', 'ai-class-engine.js'));
let finished = 0, ran = 0;
for (const idx of [0, 1, 40, cat.length - 1, Math.floor(cat.length / 2)]) {
  const c = cat[idx]; const u = unitFrom ? unitFrom(c, files[c.file] || JSON.parse(fs.readFileSync(path.join(PUB, 'data', 'tb-say', c.file + '.json'), 'utf8'))) : null;
  if (!u) continue; ran++;
  let st = E.create(u, { name: 'Minseo', nameKo: '민서' }), r = E.step(st, { type: 'start' }); st = r.state;
  for (let k = 0; k < 3000 && st.phase !== 'done'; k++) {
    let ev;
    if (st.phase === 'await') {
      const t = st.plan[st.i];
      ev = t.t === 'find' ? { type: 'tap', page: t.page, line: t.line } : { type: 'say', text: t.free || t.say || 'I am fine.' };
    } else ev = { type: 'spoken' };
    st = E.step(st, ev).state;
  }
  if (st.phase === 'done') finished++;
}
ok(ran === 5 && finished === 5, `engine finished ${finished}/${ran} lessons`);

// ⑥ 이름 — loginName/nameOf 를 오려 내 가짜 localStorage 로 돌린다
const nameSrc = ['romanize', 'nameOf', 'loginName'].map(fnSrc).join('\n');
const RI = html.match(/var RI = (\[[^\]]+\]);/), RM = html.match(/var RM = (\[[^\]]+\]);/), RF = html.match(/var RF = (\[[^\]]+\]);/);
ok(RI && RM && RF && nameSrc.includes('function loginName('), 'name functions not found');
function names(store, search = '') {
  const lsGet = k => (k in store ? store[k] : null);
  const location = { search };
  return new Function('lsGet', 'location', 'RI', 'RM', 'RF', nameSrc + '; return { loginName, nameOf };')(lsGet, location, eval(RI[1]), eval(RM[1]), eval(RF[1]));
}
try {
  const a = names({ mangoi_logged_user: JSON.stringify({ uid: 'kimsky', name: '김하늘' }) });
  ok(a.loginName() === '김하늘', 'login name not used');
  ok(a.nameOf('김하늘').ko === '하늘' && a.nameOf('김하늘').en === 'Haneul', 'Korean name not shortened/romanized ' + JSON.stringify(a.nameOf('김하늘')));
  const b = names({ mangoi_logged_user: JSON.stringify({ uid: 'kimsky', name: 'kimsky' }) });
  ok(b.loginName() === '', 'account id used as the student name (must not expose ids)');
  const c = names({ mangoi_logged_user: JSON.stringify({ uid: 'x1', user_id: 'x1', name: 'x1' }), aiClassName: '민서' });
  ok(c.loginName() === '민서', 'saved typed name not used when login name equals id');
  ok(names({}).nameOf('小明').en === 'friend', 'non-latin/hangul name must be «friend»');
  // {id,name} 모양 — 이름 칸에 아이디가 든 계정도 이름으로 부르지 않는다(CLAUDE.md 2장 uid||user_id||id)
  ok(names({ mangoi_logged_user: JSON.stringify({ id: 'kimsky', name: 'kimsky' }) }).loginName() === '', '{id,name} shape: account id used as the name');
  // 짝 — 이름이 진짜면 그대로 부른다(«전부 빈 값» 도 통과하지 않게)
  ok(names({ mangoi_logged_user: JSON.stringify({ id: 'kimsky', name: '김하늘' }) }).loginName() === '김하늘', '{id,name} shape: real name dropped');
} catch (e) { ok(false, 'name functions crashed: ' + e.message); }

// ⑥-2 로그인 안 한 학생을 지어낸 이름(예: «민서»)으로 부르지 않는다 — 기본값은 빈칸
{ const m = html.match(/<input id="nameIn"[^>]*>/); ok(!!m, 'nameIn input not found');
  if (m) ok(!/\bvalue="[^"]+"/.test(m[0]), 'nameIn has a made-up default name: ' + m[0]); }

// ⑦ 메뉴 연결 (2026-10-08 사장님 「메뉴에도 연결해줘」 — 옛 «숨은 주소» 검사를 뒤집음)
//    홈 드로어·공용 사이드바·전체메뉴 세 곳이 «같은 주소» 로 잇는가. 한 곳만 걸면 화면마다 길이 달라진다.
for (const f of ['index.html', 'js/mg-sidebar.js', 'js/idx-allmenu.js']) {
  const t = fs.readFileSync(path.join(PUB, f), 'utf8');
  ok(t.includes("'/ai-class.html'"), `${f} does not link /ai-class.html`);
}
{ const home = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8'), side = fs.readFileSync(path.join(PUB, 'js/mg-sidebar.js'), 'utf8');
  const hm = home.match(/location\.href='\/ai-class\.html';" data-ko="([^"]+)" data-en="([^"]+)"/);
  ok(!!hm, 'home drawer button for /ai-class.html not found');
  if (hm) ok(side.includes(`ko:'${hm[1]}'`) && side.includes(`en:'${hm[2]}'`), `sidebar label differs from home drawer: ${hm[1]} / ${hm[2]}`);
  const g = side.match(/ko:'학습 도구'[^\n]*go:\[([^\]]*)\]/);
  ok(!!g && /'ai-class'/.test(g[1]), 'ai-class not in sidebar «학습 도구» group'); }

// ⑧ 교재 레벨(8단계 중 몇 단계) — 2026-10-09
//   페이지의 LV_BANDS 가 서버 정본 BAND_SPECS(judgment-level.ts)와 같은 구간인가, SIU 권장 단계가 웜업 상수와 같은가,
//   그리고 bookLevel 을 오려 내 실제로 돌려 «BTS 경계값» 과 «모르는 교재는 안 그린다» 를 짝으로 본다.
{ const lvm = html.match(/var LV_BANDS = (\[[\s\S]*?\]\]);/);
  ok(!!lvm, 'LV_BANDS not found');
  const LV = lvm ? eval(lvm[1]) : [];
  const bs = fs.readFileSync(path.join(ROOT, 'cloudflare-deploy', 'src', 'judgment-level.ts'), 'utf8');
  const spec = [...bs.matchAll(/band:\s*(\d+),\s*lvFrom:\s*(\d+),\s*lvTo:\s*(\d+)/g)].map(m => [+m[1], +m[2], +m[3]]);
  ok(spec.length === 8, `BAND_SPECS read ${spec.length} (expected 8)`);
  ok(LV.length === 8 && LV.every((r, i) => spec[i] && r[0] === spec[i][0] && r[1] === spec[i][1] && r[2] === spec[i][2]), `LV_BANDS differs from BAND_SPECS ${JSON.stringify(LV.map(r => r.slice(0, 3)))} vs ${JSON.stringify(spec)}`);
  const names = [...bs.matchAll(/nameKo:\s*'([^']+)'/g)].map(m => m[1]);
  ok(LV.every((r, i) => r[3] === names[i]), `LV_BANDS names differ from BAND_SPECS ${JSON.stringify(LV.map(r => r[3]))} vs ${JSON.stringify(names)}`);
  const wu = fs.readFileSync(path.join(PUB, 'warmup.html'), 'utf8');
  const sb = +(wu.match(/var SIU_BAND_MIN = (\d+)/) || [])[1], sa = +(wu.match(/var SIU_ADV_BAND_MIN = (\d+)/) || [])[1];
  let bookLevel = null;
  try { bookLevel = new Function('LV_BANDS', fnSrc('bookLevel') + '; return bookLevel;')(LV); } catch (e) { ok(false, 'bookLevel did not compile: ' + e.message); }
  if (bookLevel) {
    const t = b => { try { return bookLevel(b); } catch (e) { return 'THROW ' + e.message; } };
    const cases = [['BTS 1 001 (Welcome to school)', 1], ['BTS 4 009 (x)', 1], ['BTS 5 001 (x)', 2], ['BTS 12 TEST', 3], ['BTS 13 Review', 4], ['BTS 17 001', 4], ['BTS 18 001', 5], ['BTS 25 001', 6], ['BTS 26 001', 7], ['BTS 30 Test', 7], ['BTS 31 001', 8], ['BTS 34 Review', 8]];
    cases.forEach(([b, n]) => { const r = t(b); ok(r && r.band === n && !r.rec, `bookLevel(${b}) = ${JSON.stringify(r)} (expected band ${n})`); });
    ok((t('NEW SIU BASIC 001 - A talk with you') || {}).band === sb && t('NEW SIU BASIC 001').rec === true, `SIU BASIC band should be warmup SIU_BAND_MIN ${sb} (권장)`);
    ok((t('NEW SIU ADVANCE 003 - Make your point') || {}).band === sa && t('NEW SIU ADVANCE 003').rec === true, `SIU ADVANCE band should be warmup SIU_ADV_BAND_MIN ${sa} (권장)`);
    ['', 'BTS 35 001', 'BTS 0 001', 'Phonics A', 'MES 3', null].forEach(b => ok(t(b) === null, `unknown book ${JSON.stringify(b)} should give null, got ${JSON.stringify(t(b))}`));
    ok(cat.every(u => t(u.book) && t(u.book).band >= 1), 'some catalog lesson has no level');
  }
  ok(/paintBookLv\(unit\.book\)/.test(fnSrc('reset')), 'paintBookLv not called when a lesson opens');
}
// ⑨ 선생님 칸 속도 버튼 — 위쪽 알약과 같은 정본(spd)을 쓰는가
{ const ps = fnSrc('paintSpd'), ss = fnSrc('setSpd');
  ok(/#?tSpd/.test(ps) && /\.on/.test(ps) || /'on'/.test(ps), 'paintSpd does not paint teacher-tile buttons');
  ok(/lsSet\('aiClassSpd'/.test(ss) && /paintSpd\(\)/.test(ss), 'setSpd does not save+paint');
  ok((html.match(/data-spd="[0-3]"/g) || []).length === 4, 'teacher-tile speed buttons != 4');
}

// ⑩ 레슨 고르는 목록도 단계를 말하는가 — fillPicker 를 오려 내 «가짜 DOM» 으로 443레슨 전부에 실제로 돌린다
{ const lvm = html.match(/var LV_BANDS = (\[[\s\S]*?\]\]);/);
  const LV = lvm ? eval(lvm[1]) : [];
  const mk = tag => ({ tag, kids: [], label: '', value: '', textContent: '', append(...k) { this.kids.push(...k); }, replaceChildren() { this.kids = []; } });
  const sel = mk('select');
  let res = null;
  try {
    const f = new Function('LV_BANDS', 'CAT', '$', 'document', fnSrc('bookLevel') + fnSrc('fillPicker') + '; var li=0; fillPicker(); return li;');
    res = f(LV, cat, () => sel, { createElement: mk });
  } catch (e) { ok(false, 'fillPicker did not run: ' + e.message); }
  if (res !== null) {
    const groups = sel.kids, opts = groups.flatMap(g => g.kids);
    ok(opts.length === cat.length, `picker lost lessons ${opts.length}/${cat.length}`);
    ok(new Set(opts.map(o => o.value)).size === cat.length, 'picker duplicate lesson');
    const bts = groups.filter(g => /new BTS/.test(g.label));
    ok(bts.length === 8 && bts.every((g, i) => g.label.startsWith((i + 1) + '단계 · ' + LV[i][3])), `BTS groups not 1..8단계 in order ${JSON.stringify(bts.map(g => g.label))}`);
    ok(groups.some(g => /^5단계 · 중급 \(권장\) — new SIU BASIC/.test(g.label)) && groups.some(g => /^7단계 · 고급 \(권장\) — new SIU ADVANCE/.test(g.label)), `SIU group labels ${JSON.stringify(groups.map(g => g.label))}`);
    ok(!groups.some(g => /단계 모름/.test(g.label)), 'some lesson has unknown level');
    // 각 레슨이 «자기 단계» 묶음에 있고, 글자에도 같은 단계가 적혔는가(짝: 두 값이 갈리면 FAIL)
    let bad = 0; groups.forEach(g => { const gn = +(g.label.match(/^(\d)단계/) || [])[1]; g.kids.forEach(o => { const on = +(o.textContent.match(/ · (\d)단계 · /) || [])[1]; const u = cat[+o.value]; const m = /^BTS\s+(\d+)\b/.exec(u.book); const want = m ? LV.find(r => +m[1] >= r[1] && +m[1] <= r[2])[0] : /BASIC/.test(u.book) ? 5 : 7; if (gn !== want || on !== want) bad++; }); });
    ok(bad === 0, `${bad} lessons in wrong level group/text`);
    ok(opts.every(o => !/^NEW /.test(o.textContent)) && opts.some(o => /^BTS/.test(o.textContent)), 'option text should start with book name (browser harness relies on /^BTS/)');
    ok(cat[res] && /^BTS 1 001/.test(cat[res].id), 'default lesson is not BTS 1 001');
  }
}

console.log(`결과: PASS ${pass} / FAIL ${fail}`);
fails.forEach(f => console.log('  ❌ ' + f));
process.exit(fail ? 1 : 0);
