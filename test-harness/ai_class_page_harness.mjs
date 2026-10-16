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

// ⑧ ⏸ 잠깐 멈추기 (2026-10-14) — waitRun·speakRaw·pauseSet 을 오려 내 가짜 부품으로 «실제로 돌린다»
//   짝: 멈추면 말·진행·음악·마이크가 멈춘다 ↔ 풀면 끊긴 문장부터 다시 읽고 이어진다 ↔ 안 멈추면 예전처럼 한 번만 읽는다
{
  const srcs = ['waitRun', 'speakRaw', 'pauseSet'].map(n => (/async function speakRaw\(/.test(html) && n === 'speakRaw' ? 'async ' : '') + fnSrc(n));
  ok(srcs.every(Boolean), '⑧ 전제: waitRun·speakRaw·pauseSet 을 오려 냈다');
  ok(!/function speakRaw\(/.test(fnSrc('speakOnce')) && !!fnSrc('speakOnce'), '⑧ 전제: speakOnce 가 따로 있다');
  const mk = new Function('env', `
    var paused=false,pauseAt=0,pauseTok=0,pauseWait=[],seq=0,st=env.st,busy=false,sound=true,timerAt=1000,listenTO=0,FAST=false,bgmLast=env.bgmLast||'talk';
    var log=env.log, MU={stopAll:function(){log.push('mu.stop')},cut:function(){log.push('mu.cut')},bgm:function(l){log.push('bgm:'+l)}};
    var els={startOv:{hidden:env.started!==false}}; function $(id){ return els[id]||(els[id]={hidden:false,disabled:false,classList:{toggle:function(){}},setAttribute:function(){},textContent:'',
      querySelector:function(){ return {textContent:'',nextSibling:{textContent:''}}; },focus:function(){}}); }
    var document={body:{classList:{toggle:function(){}}}};
    function stopSpeech(){ log.push('stopSpeech'); env.onStop&&env.onStop(); } function stopRec(){ log.push('stopRec'); }
    function clearTimeout(){ log.push('clearTO'); } function askOpen(o){ log.push('askOpen:'+o); } function setButtons(){} function armAuto(){ log.push('armAuto'); } function armTalk(){ log.push('armTalk'); }
    function speakOnce(t){ log.push('say:'+t); return new Promise(function(r){ env.cur=r; }); }
    var Date={now:function(){ return env.now; }};
    ${srcs.join('\n')}
    return { speakRaw:speakRaw, pauseSet:pauseSet, get paused(){return paused;}, get timerAt(){return timerAt;}, setBusy:function(b){busy=b;}, bumpSeq:function(){seq++;} };`);
  const tick = () => new Promise(r => setTimeout(r, 0));
  // A: 문장 도중 멈춤 → 끊김 → 계속 → 같은 문장을 처음부터 → 끝나면 한 번만
  {
    const env = { log: [], st: { turn: 3, phase: 'teacher' }, now: 5000 }; env.onStop = () => { const c = env.cur; env.cur = null; c && c(); };
    const P = mk(env); let doneA = false;
    P.setBusy(true); P.speakRaw('Hello').then(() => { doneA = true; }); await tick();
    ok(env.log.filter(x => x === 'say:Hello').length === 1, '⑧A 처음 한 번 읽는다');
    P.pauseSet(true); await tick(); await tick();
    ok(P.paused, '⑧A 멈춤 상태'); ok(env.log.includes('stopSpeech') && env.log.includes('stopRec') && env.log.includes('mu.stop') && env.log.includes('clearTO') && env.log.includes('askOpen:false'), '⑧A 멈추면 말·마이크·음악·자동데모 예약·질문 창을 함께 끊는다 ' + JSON.stringify(env.log));
    ok(!doneA && env.log.filter(x => x === 'say:Hello').length === 1, '⑧A 멈춘 동안 다시 읽지도, 다음으로 넘어가지도 않는다');
    env.now = 9000; P.pauseSet(false); await tick(); await tick();
    ok(env.log.filter(x => x === 'say:Hello').length === 2, '⑧A 계속하면 끊긴 문장을 처음부터 다시 읽는다');
    ok(P.timerAt === 5000, '⑧A 멈춘 시간(4초)은 수업 시간에서 뺀다 (timerAt ' + P.timerAt + ')');
    ok(env.log.includes('bgm:talk'), '⑧A 말하던 중에 계속하면 배경음악을 다시 켠다');
    env.cur && env.cur(); await tick(); await tick();
    ok(doneA && env.log.filter(x => x === 'say:Hello').length === 2, '⑧A 다 읽으면 끝난다(세 번 읽지 않는다)');
  }
  // A2: 계속할 때 배경음악은 «멈추기 직전의 음량» 으로 — 교재 문장 시범(model)·노래(off) 중이었으면 그대로
  for (const lv of ['model', 'off']) {
    const env = { log: [], st: { turn: 3, phase: 'teacher' }, now: 5000, bgmLast: lv }; env.onStop = () => { const c = env.cur; env.cur = null; c && c(); };
    const P = mk(env); P.setBusy(true); P.speakRaw('Hi'); await tick(); P.pauseSet(true); await tick(); env.log.length = 0; P.pauseSet(false); await tick();
    ok(env.log.includes('bgm:' + lv) && !env.log.includes('bgm:talk'), '⑧A2 계속하면 멈추기 직전 음량(' + lv + ')으로 되돌린다 ' + JSON.stringify(env.log));
  }
  // B: 안 멈추면 예전처럼 한 번만
  {
    const env = { log: [], st: { turn: 3, phase: 'teacher' }, now: 0 }; const P = mk(env); let d = false;
    P.speakRaw('Hi').then(() => { d = true; }); await tick(); env.cur && env.cur(); await tick(); await tick();
    ok(d && env.log.filter(x => x === 'say:Hi').length === 1 && !env.log.includes('stopSpeech'), '⑧B 안 멈추면 한 번 읽고 끝난다');
  }
  // C: 멈춘 채 레슨이 바뀌면(seq) 옛 문장을 다시 읽지 않는다
  {
    const env = { log: [], st: { turn: 3, phase: 'teacher' }, now: 0 }; env.onStop = () => { const c = env.cur; env.cur = null; c && c(); };
    const P = mk(env); P.speakRaw('Old'); await tick(); P.pauseSet(true); await tick(); P.bumpSeq(); P.pauseSet(false, true); await tick(); await tick();
    ok(env.log.filter(x => x === 'say:Old').length === 1, '⑧C 레슨이 바뀌면 끊긴 옛 문장을 다시 읽지 않는다');
    ok(!env.log.includes('armAuto'), '⑧C 조용히 풀 때(silent)는 자동 데모를 다시 걸지 않는다');
  }
  // D: 학생 차례에 멈췄다 풀면 자동 데모·자동 말하기를 다시 건다 / 시작 전·끝난 뒤엔 멈추지 않는다
  {
    const env = { log: [], st: { turn: 3, phase: 'await' }, now: 0 }; const P = mk(env);
    P.pauseSet(true); P.pauseSet(false); ok(env.log.includes('armAuto') && env.log.includes('armTalk'), '⑧D 학생 차례면 계속할 때 자동 데모·자동 말하기를 다시 건다');
    const P2 = mk({ log: [], st: { turn: 0, phase: 'teacher' }, now: 0, started: false }); P2.pauseSet(true); ok(!P2.paused, '⑧D 시작 전(시작 창이 떠 있음)에는 멈추지 않는다');
    const P2b = mk({ log: [], st: { turn: 0, phase: 'teacher' }, now: 0 }); P2b.pauseSet(true); ok(P2b.paused, '⑧D (짝) 시작 징글 중(turn 0, 시작 창 닫힘)에도 멈출 수 있다');
    const P3 = mk({ log: [], st: { turn: 9, phase: 'done' }, now: 0 }); P3.pauseSet(true); ok(!P3.paused, '⑧D 끝난 뒤에는 멈추지 않는다');
  }
  // E: 배선 — 진행·자동 데모·자동 말하기·말하기가 멈춤을 본다 / 레슨 바꾸기·다시하기·끝내기가 멈춤을 푼다 / 노래도 멈춤을 견딘다
  const noC = t => t.replace(/\/\/[^\n]*/g, '');
  ok(/if \(paused \|\| !talk/.test(noC(fnSrc('armTalk'))), '⑧E 자동 말하기는 멈춘 동안 마이크를 켜지 않는다');
  ok(/if \(paused\) return;/.test(noC(fnSrc('armAuto'))) && /!auto \|\| paused\) return;/.test(noC(fnSrc('armAuto'))), '⑧E 자동 데모는 멈춘 동안 대답하지 않는다(두 겹)');
  ok(/askBusy \|\| paused\) return;/.test(noC(fnSrc('say'))), '⑧E 멈춘 동안 대답을 보내지 않는다');
  ok(/await waitRun\(\)/.test(noC(fnSrc('playSong'))) && /tok === pauseTok/.test(noC(fnSrc('playSong'))), '⑧E 노래 도중 멈추면 계속할 때 다시 부른다');
  ok(/pauseSet\(false, true\)/.test(noC(fnSrc('reset'))) && /pauseSet\(false, true\)/.test(noC(fnSrc('openLesson'))), '⑧E 레슨 바꾸기·다시하기는 멈춤을 푼다');
  ok(/if \(paused\) return; var s =/.test(html), '⑧E 타이머는 멈춘 동안 흐르지 않는다');
  ok(/id="pauseBtn"/.test(html) && /id="pauseBand"/.test(html) && /id="resumeBtn"/.test(html), '⑧E ⏸ 버튼·멈춤 띠·▶ 계속 버튼이 있다');
  ok(/\.pauseband\[hidden\]\{display:none!important\}/.test(html), '⑧E 멈춤 띠의 [hidden] 이 display:flex 에 지지 않는다');
}

// ⓪ 페이지 인라인 스크립트가 «문법상» 살아 있는가 — 한 줄 주석이 뒤 코드(return; })를 삼켜 페이지가 통째로 죽은 일이 있었다(2026-10-14)
{
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  ok(blocks.length > 0, '⓪ 전제: 인라인 스크립트를 찾았다');
  blocks.forEach((b, i) => { try { new Function(b); ok(true, ''); } catch (e) { ok(false, `⓪ 인라인 스크립트 #${i} 문법 오류: ${e.message}`); } });
}

// ⑧F ⏸ 멈춘 동안 «말 밖» 에서 진행하는 길도 막혔는가 (2026-10-14 함정 대조가 찾은 것)
//   run() 의 말하기 루프는 자막·배경음악을 speakRaw «앞» 에서 정한다 → 루프 첫머리에서 기다려야 한다
{
  const noC = t => t.replace(/\/\/[^\n]*/g, '');
  const runSrc = noC(fnSrc('run'));
  const loopAt = runSrc.indexOf('for (var i = 0; i < speeches.length; i++) {');
  const body = loopAt < 0 ? '' : runSrc.slice(loopAt, runSrc.indexOf('busy = false;', loopAt));
  const w = body.search(/\n\s*await waitRun\(\); if \(my !== seq\) return;/), sub = body.indexOf('showSub('), bg = body.indexOf('bgmFor(');
  ok(loopAt >= 0 && sub > 0 && bg > 0, '⑧F 전제: run() 말하기 루프를 오려 냈다');
  ok(w > 0 && w < sub && w < bg, '⑧F 멈춘 동안 다음 자막·배경음악으로 넘어가지 않는다(루프 첫머리에서 기다림)');
  ok(/MU\.jingle\(\)\.then\(waitRun\)\.then\(/.test(html), '⑧F 징글 도중 멈추면 첫 차례(배경음악·단계 신호)로 넘어가지 않는다');
  const simH = noC(html.slice(html.indexOf("$('sim').addEventListener('click'"), html.indexOf("$('simForm')")));
  ok(/^\$\('sim'\)\.addEventListener\('click', function\(e\)\{\s*if \(paused\) return;/.test(simH), '⑧F 멈춘 동안 «말 안 함»·보기 칩이 진행시키지 않는다');
  ok(/simForm'\)\.addEventListener\('submit', function\(e\)\{ e\.preventDefault\(\); if \(paused \|\|/.test(html), '⑧F 멈춘 동안 직접 입력도 보내지 않는다');
  ok(/MU\.bgmOn\(\) && busy && sound && !paused\) MU\.bgm/.test(html), '⑧F 멈춘 동안 🎵 배경음악 버튼을 눌러도 음악이 안 울린다');
  ok(/MU\.stopAll\(\); if \(MU\.cut\) MU\.cut\(\);/.test(noC(fnSrc('pauseSet'))), '⑧F 멈추면 이미 예약된 음(노래 가락·징글)까지 끊는다');

  // 노래 — 실제로 돌린다: 1절 도중 멈추면 끊긴 줄을 «반주 없이 혼자» 다시 읽지 않고, 계속하면 노래를 처음부터
  const ps = fnSrc('playSong');
  ok(!!ps, '⑧F 전제: playSong 을 오려 냈다');
  const mkS = new Function('env', `
    var paused=false,pauseTok=0,pauseWait=[],seq=0,FAST=false,bgmLast='talk',log=env.log;
    function waitRun(){ return paused ? new Promise(function(r){ pauseWait.push(r); }) : Promise.resolve(); }
    function speakOnce(t){ log.push('say:'+t); return new Promise(function(r){ env.cur=r; }); }
    ${/async function speakRaw\(/.test(html) ? 'async ' : ''}${fnSrc('speakRaw')}
    function songHL(){}
    var songSeq=0, MU={ song: async function(lines, sing){ var my=++songSeq; log.push('song'); for (var i=0;i<lines.length;i++){ if (my!==songSeq) return false; await sing(lines[i]); } return true; } };
    async ${ps}
    return { play: function(){ return playSong({lines:['L1','L2','L3']}, 0); },
      pause: function(){ paused=true; pauseTok++; songSeq++; var c=env.cur; env.cur=null; c&&c(); },
      resume: function(){ paused=false; var w=pauseWait; pauseWait=[]; w.forEach(function(r){r();}); },
      get bgmLast(){ return bgmLast; } };`);
  const tick = () => new Promise(r => setTimeout(r, 0));
  const env = { log: [] }; let S = null;
  try { S = mkS(env); } catch (e) { ok(false, '⑧F playSong 샌드박스: ' + e.message); }
  if (S) {
    let done = false; S.play().then(() => { done = true; }); await tick();
    ok(S.bgmLast === 'off', '⑧F 노래 중에는 계속할 때 배경음악을 깔지 않는다');
    S.pause(); for (let k = 0; k < 6; k++) await tick();
    const afterPause = env.log.slice();
    ok(afterPause.filter(x => x === 'say:L1').length === 1 && !afterPause.includes('say:L2'), '⑧F 멈춘 동안 노래가 다음 줄로 가지 않는다 ' + JSON.stringify(afterPause));
    S.resume(); for (let k = 0; k < 6; k++) await tick();
    const i2 = env.log.lastIndexOf('song');
    ok(env.log.filter(x => x === 'song').length === 2 && env.log[i2 + 1] === 'say:L1', '⑧F 계속하면 노래를 처음부터(반주와 함께) 다시 부른다 ' + JSON.stringify(env.log));
    ok(env.log.slice(afterPause.length, i2).every(x => x !== 'say:L1'), '⑧F 끊긴 줄을 반주 없이 혼자 먼저 다시 읽지 않는다 ' + JSON.stringify(env.log));
    for (let k = 0; k < 3; k++) { const c = env.cur; env.cur = null; c && c(); for (let m = 0; m < 4; m++) await tick(); }
    ok(done && env.log.filter(x => x === 'say:L3').length === 1, '⑧F 짝: 노래가 끝까지 불리고 끝난다 ' + JSON.stringify(env.log));
  }
}

// ⑧G 소리 모듈의 cut() — 실제로 돌린다: 예약된 음이 매인 master 를 떼고, 새 master 로 다음 소리가 나간다
{
  const msrc = fs.readFileSync(process.env.AI_CLASS_MUSIC || path.join(PUB, 'js', 'ai-class-music.js'), 'utf8');
  const nodes = [];
  const mkNode = kind => { const n = { kind, conns: [], gone: false, gain: { value: 0, setValueAtTime(){}, exponentialRampToValueAtTime(){}, linearRampToValueAtTime(){}, cancelScheduledValues(){} }, frequency: { value: 0 }, connect(d){ this.conns.push(d); }, disconnect(){ this.gone = true; this.conns = []; }, start(){}, stop(){} }; nodes.push(n); return n; };
  function AC(){ this.state = 'running'; this.currentTime = 0; this.destination = { kind: 'dest' }; }
  AC.prototype.createGain = function(){ return mkNode('gain'); }; AC.prototype.createOscillator = function(){ return mkNode('osc'); }; AC.prototype.resume = function(){};
  const win = { AudioContext: AC };
  try {
    new Function('window', 'localStorage', 'setTimeout', 'clearTimeout', msrc)(win, { getItem(){ return null; }, setItem(){} }, () => 0, () => {});
    const M = win.AiClassMusic;
    ok(typeof M.cut === 'function', '⑧G cut() 을 내보낸다');
    M.sting(); const oldOsc = nodes.filter(n => n.kind === 'osc'); const oldMaster = oldOsc[0].conns[0].conns[0];
    M.stopAll(); M.cut();
    ok(oldMaster.gone, '⑧G 예약된 음이 매인 옛 master 를 뗀다');
    const before = nodes.length; M.sting(); const newOsc = nodes.slice(before).filter(n => n.kind === 'osc');
    const newMaster = newOsc[0].conns[0].conns[0];
    ok(newMaster !== oldMaster && !newMaster.gone && newMaster.conns[0] && newMaster.conns[0].kind === 'dest', '⑧G 짝: 끊은 뒤 새 소리는 새 master 로 정상 출력된다');
    // 노래 박자 대기 도중 stopAll → 곧바로 끝난다(예전엔 남은 박자 ~4초를 다 기다린 뒤에야 끝나, 멈췄다 풀면 그만큼 조용했다)
    //   이 샌드박스의 setTimeout 은 «영영 안 울리므로» 깨우지 않으면 이 노래는 끝나지 않는다
    let ended = null; M.song(['Hello, teacher!', 'How are you?'], () => Promise.resolve(), null).then(v => { ended = v; });
    await new Promise(r => setImmediate(r)); M.stopAll(); for (let k = 0; k < 5; k++) await new Promise(r => setImmediate(r));
    // 줄을 «부르는 중» 에 멈춘 경우 — 부르기가 끝난 «뒤» 에 박자 대기를 시작하면 깨울 사람이 없다
    let ended2 = null, rel = null; M.song(['Hello, teacher!', 'How are you?'], () => new Promise(r => { rel = r; }), null).then(v => { ended2 = v; });
    await new Promise(r => setImmediate(r)); M.stopAll(); rel && rel(); for (let k = 0; k < 5; k++) await new Promise(r => setImmediate(r));
    ok(ended2 === false, '⑧G 줄을 부르는 중에 멈춰도 곧바로 끝난다(남은 박자를 기다리지 않는다) ' + ended2);
    ok(ended === false, '⑧G 노래 박자를 기다리던 중에 멈추면 곧바로 끝난다(남은 박자를 기다리지 않는다) ' + ended);
  } catch (e) { ok(false, '⑧G 소리 모듈 실행: ' + e.message); }
}

console.log(`결과: PASS ${pass} / FAIL ${fail}`);
fails.forEach(f => console.log('  ❌ ' + f));
process.exit(fail ? 1 : 0);
