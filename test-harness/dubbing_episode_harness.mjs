#!/usr/bin/env node
/* ============================================================
   dubbing_episode_harness.mjs — 🎬 A.i영화더빙 에피소드 자료와 화면 연결 (2026-10-20)

   지키는 것:
     ① 검수 전에는 화면이 «한 글자도» 안 바뀐다 — 장면 칸은 sceneProblems() 가 빈 목록일 때만 열린다.
        승인 표시·대사 시각 확정·우리 «/…» 경로의 영상·배경음·캐릭터별 목소리가 «전부» 있어야 한다.
     ② 바깥 주소(http·https·//)는 화면·빌드 어느 쪽에서도 받지 않는다(생성 서비스 주소는 영구 보관이 아님).
     ③ 공개 자료(public/data/dubbing/dub-001.json)는 정본(content/dubbing/dub-001/)에서
        scripts/build-dub-manifest.mjs 로 만든 것과 «바이트까지» 같다(손으로 고친 공개 자료 금지).
     ④ 자료를 못 읽거나 모양이 다르면 «준비 중» 화면 그대로(아무것도 안 바꾼다).

   ⚠️ 문자열로 «그 글자가 있는가» 만 묻지 않는다. js/ai-dubbing.js 를 그대로 실행해
      판정 함수의 «답» 을 보고, 화면 부분은 가짜 DOM·가짜 fetch 로 실제로 돌려 «무엇이 바뀌었는가» 를 센다.
   ⚠️ 끝에 변이시험이 있다 — 판정 줄을 하나씩 지운 사본을 돌려 «이 검사가 실제로 FAIL 하는가» 를 확인한다.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'cloudflare-deploy/public');
const JS_PATH = path.join(PUB, 'js/ai-dubbing.js');
const HTML_PATH = path.join(PUB, 'ai-dubbing.html');
const BUILD_PATH = path.join(ROOT, 'scripts/build-dub-manifest.mjs');
const EP = 'dub-001';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};
const section = t => console.log(`\n${t}`);

const JS_SRC = fs.readFileSync(JS_PATH, 'utf8');
const HTML = fs.readFileSync(HTML_PATH, 'utf8');

/** document 없이 실행 → 판정 함수만 꺼낸다. */
function loadApi(src) {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'ai-dubbing.js' });
  return ctx.window.MangoiDub;
}

/** 모든 조건을 갖춘 장면 하나(검사용). */
function readyFixture() {
  const ep = {
    schema: 'mangoi.dub.v1', id: EP, qaApproved: true,
    characters: { dino: { name: { ko: '디노', en: 'Dino' } }, mina: { name: { ko: '미나', en: 'Mina' } } },
    scenes: [],
  };
  const sc = {
    no: 1, label: { ko: '첫 장면', en: 'First' }, qaApproved: true, linesSynced: true, durationSec: 40,
    video: '/media/dubbing/dub-001/s1.mp4', thumb: '/media/dubbing/dub-001/s1.jpg', bgm: '/media/dubbing/dub-001/s1-bgm.m4a',
    voices: { dino: '/media/dubbing/dub-001/s1-dino.m4a', mina: '/media/dubbing/dub-001/s1-mina.m4a' },
    lines: [
      { id: 's1-1', speaker: 'dino', en: 'Hello!', ko: '안녕!', start: 1, end: 3 },
      { id: 's1-2', speaker: 'mina', en: 'Hi, Dino.', ko: '안녕, 디노.', start: 3, end: 5.5 },
    ],
  };
  ep.scenes.push(sc);
  return { ep, sc };
}
const clone = o => JSON.parse(JSON.stringify(o));

/** 판정 검사 묶음 — 실패 개수를 돌려준다(변이시험에서도 그대로 쓴다). */
function gateChecks(api, report) {
  let f = 0;
  const t = (name, cond) => { if (report) ok(name, cond); if (!cond) f++; };
  const { ep, sc } = readyFixture();
  const probs = api.sceneProblems(ep, sc);
  t('모든 조건을 갖춘 장면은 열린다(문제 0건)', Array.isArray(probs) && probs.length === 0);
  const mut = (label, fn, code) => {
    const e = clone(ep), s = clone(sc);
    fn(e, s);
    const p = api.sceneProblems(e, s);
    t(`${label} → «${code}» 로 막힌다`, Array.isArray(p) && p.includes(code));
  };
  mut('에피소드 미승인', e => { e.qaApproved = false; }, 'episode_not_approved');
  mut('장면 미승인', (e, s) => { s.qaApproved = false; }, 'scene_not_approved');
  mut('승인 값이 문자열 "true"', (e, s) => { s.qaApproved = 'true'; }, 'scene_not_approved');
  mut('대사 시각 미확정', (e, s) => { s.linesSynced = false; }, 'lines_not_synced');
  mut('영상 없음', (e, s) => { s.video = null; }, 'video_missing');
  mut('영상이 https 주소', (e, s) => { s.video = 'https://d8j0ntlcm91z4.cloudfront.net/x.mp4'; }, 'video_not_local');
  mut('영상이 //주소', (e, s) => { s.video = '//cdn.example.com/x.mp4'; }, 'video_not_local');
  mut('영상 경로에 ..', (e, s) => { s.video = '/media/../secret.mp4'; }, 'video_not_local');
  mut('배경음 없음', (e, s) => { s.bgm = ''; }, 'bgm_missing');
  mut('배경음이 http', (e, s) => { s.bgm = 'http://x/y.m4a'; }, 'bgm_not_local');
  mut('썸네일이 https', (e, s) => { s.thumb = 'https://x/y.jpg'; }, 'thumb_not_local');
  mut('길이 없음', (e, s) => { s.durationSec = null; }, 'duration_missing');
  mut('대사 0줄', (e, s) => { s.lines = []; }, 'no_lines');
  mut('영어 대사 빈칸', (e, s) => { s.lines[0].en = '  '; }, 'line_text_missing');
  mut('한국어 뜻 빈칸', (e, s) => { s.lines[1].ko = ''; }, 'line_ko_missing');
  mut('끝이 시작보다 빠름', (e, s) => { s.lines[0].end = 0.5; }, 'line_bad_time');
  mut('대사가 영상 길이를 넘음', (e, s) => { s.lines[1].end = 41; }, 'line_bad_time');
  mut('대사 시각이 겹침', (e, s) => { s.lines[1].start = 2; }, 'line_overlap');
  mut('모르는 캐릭터', (e, s) => { s.lines[0].speaker = 'zed'; }, 'unknown_speaker');
  mut('캐릭터 목소리 없음', (e, s) => { delete s.voices.mina; }, 'voice_missing');
  mut('캐릭터 목소리가 https', (e, s) => { s.voices.dino = 'https://x/d.m4a'; }, 'voice_missing');
  t('에피소드 자체가 없으면 막힌다', api.sceneProblems(null, sc).includes('episode_missing'));
  t('장면 자체가 없으면 막힌다', api.sceneProblems(ep, undefined).includes('scene_missing'));
  t('같은 사유는 한 번만 적는다', api.sceneProblems(ep, Object.assign(clone(sc), { lines: [
    { speaker: 'zed', en: 'a', ko: 'b', start: 0, end: 1 }, { speaker: 'zed', en: 'c', ko: 'd', start: 1, end: 2 },
  ] })).filter(c => c === 'unknown_speaker').length === 1);
  return f;
}

/* ── ① 판정 함수 ───────────────────────────────────────── */
section('① 판정 함수(js/ai-dubbing.js 를 그대로 실행)');
const api = loadApi(JS_SRC);
ok('document 없이도 판정 함수를 내보낸다', !!(api && typeof api.sceneProblems === 'function' && typeof api.lineAt === 'function'));
gateChecks(api, true);
ok('우리 경로는 받는다', api.isLocalPath('/media/dubbing/dub-001/s1.mp4'));
for (const bad of ['https://x/a.mp4', 'http://x/a.mp4', '//x/a.mp4', 'media/a.mp4', '/a/../b.mp4', '/a b.mp4', '', null, 3]) {
  ok(`바깥·이상한 경로는 거절: ${JSON.stringify(bad)}`, api.isLocalPath(bad) === false);
}
const L = [{ start: 1, end: 3, en: 'A' }, { start: 3, end: 5, en: 'B' }];
ok('대사 찾기: 시작 시각 포함', api.lineAt(L, 1).en === 'A');
ok('대사 찾기: 끝 시각은 다음 줄', api.lineAt(L, 3).en === 'B');
ok('대사 찾기: 사이가 없으면 null', api.lineAt(L, 5) === null && api.lineAt(L, 0.5) === null);
ok('대사 찾기: 이상한 입력은 null', api.lineAt(null, 1) === null && api.lineAt(L, NaN) === null);

/* ── ② 정본 → 공개 자료 ─────────────────────────────────── */
section('② 정본(content/dubbing) → 공개 자료(public/data/dubbing)');
const build = await import(pathToFileURL(BUILD_PATH).href);
let built = null, builtText = '';
try { built = build.buildManifest(EP); builtText = build.manifestText(EP); } catch (e) { ok('정본으로 자료를 만들 수 있다', false, e.message); }
const outFile = build.outPath(EP);
const pubText = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
ok('공개 자료 파일이 있다', !!pubText);
ok('공개 자료 = 정본으로 다시 만든 것(손으로 고치지 않음 — 고쳤으면 node scripts/build-dub-manifest.mjs dub-001)',
  !!builtText && pubText === builtText);
const BUILD_SRC = fs.readFileSync(BUILD_PATH, 'utf8');
const reOf = s => (/(?:var|const) LOCAL_PATH = (\/.+\/);/.exec(s) || [])[1];
ok('빌드와 화면의 «우리 경로» 규칙이 같다', !!reOf(BUILD_SRC) && reOf(BUILD_SRC) === reOf(JS_SRC));
for (const bad of ['https://d8j0ntlcm91z4.cloudfront.net/a.mp4', '//cdn/a.mp4', 'a.mp4', '/a/../b']) {
  let threw = false; try { build.mediaPath(bad, 't'); } catch { threw = true; }
  ok(`빌드는 바깥 경로를 거절: ${bad}`, threw);
}
ok('빌드는 우리 경로·빈 값은 받는다', build.mediaPath('/media/a.mp4', 't') === '/media/a.mp4' && build.mediaPath(null, 't') === null);

/* ── ③ 공개 자료의 모양 ─────────────────────────────────── */
section('③ 공개 자료의 모양');
const M = pubText ? JSON.parse(pubText) : {};
ok('schema = mangoi.dub.v1 · id = dub-001', M.schema === 'mangoi.dub.v1' && M.id === EP);
ok('제목 ko/en', !!(M.title && M.title.ko && M.title.en));
const chars = M.characters || {};
ok('캐릭터마다 ko/en 이름', Object.keys(chars).length > 0 && Object.values(chars).every(c => c && c.name && c.name.ko && c.name.en));
ok('캐릭터 메모(생김새·목소리)는 공개 자료에 싣지 않는다', Object.values(chars).every(c => Object.keys(c).join() === 'name'));
const playable = Array.isArray(M.playable) ? M.playable : [];
ok('학생이 고를 수 있는 캐릭터는 캐릭터 목록 안에 있다', playable.length > 0 && playable.every(p => chars[p]));
const scenes = Array.isArray(M.scenes) ? M.scenes : [];
const allLines = scenes.flatMap(s => s.lines || []);
for (const p of playable) ok(`«${p}» 는 말할 대사가 있다`, allLines.some(l => l.speaker === p));
ok('장면 번호가 1..N 차례', scenes.length > 0 && scenes.every((s, i) => s.no === i + 1));
ok('장면마다 ko/en 이름', scenes.every(s => s.label && s.label.ko && s.label.en));
ok('대사마다 영어·한국어·말하는 캐릭터', allLines.length > 0 && allLines.every(l => l.en && l.ko && chars[l.speaker]));
ok('대사 시각은 숫자이고 끝 > 시작', allLines.every(l => typeof l.start === 'number' && typeof l.end === 'number' && l.end > l.start && l.start >= 0));
ok('대사 id 가 겹치지 않는다', new Set(allLines.map(l => l.id)).size === allLines.length);
const strings = [];
(function walk(v) { if (typeof v === 'string') strings.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); })(M);
ok('공개 자료 어디에도 바깥 주소(http·//)가 없다', !strings.some(s => /^(https?:)?\/\//i.test(s) || /https?:\/\//i.test(s)));

/* ── ④ 검수 상태 ───────────────────────────────────────── */
section('④ 검수 상태');
const openable = scenes.filter(s => api.sceneProblems(M, s).length === 0);
console.log(`  ℹ️ 지금 열리는 장면 ${openable.length}/${scenes.length}` + (M.qaApproved ? '' : ' (에피소드 미승인 — 화면은 «준비 중» 그대로)'));
for (const s of scenes) {
  if (s.qaApproved !== true) continue;
  ok(`승인된 장면 ${s.no} 은 화면이 실제로 열 수 있다(승인했는데 «준비 중» 이면 표가 틀린 것)`,
    api.sceneProblems(M, s).filter(c => c !== 'episode_not_approved').length === 0, api.sceneProblems(M, s).join(','));
  const media = [s.video, s.thumb, s.bgm, ...Object.values(s.voices || {})].filter(Boolean);
  for (const m of media) ok(`승인된 장면 ${s.no} 의 파일이 실제로 있다: ${m}`, fs.existsSync(path.join(PUB, m)));
}
if (M.qaApproved === true) ok('에피소드를 승인했다면 장면도 하나 이상 승인돼 있다', scenes.some(s => s.qaApproved === true));

/* ── ⑤ 화면 배선 ───────────────────────────────────────── */
section('⑤ 화면 배선(ai-dubbing.html)');
const stripComments = s => s.replace(/<!--[\s\S]*?-->/g, '');
const H = stripComments(HTML);
const tagRe = /<script defer src="\/js\/ai-dubbing\.js\?v=(\d+)"><\/script>/;
ok('ai-dubbing.js 를 ?v= 와 함께 defer 로 싣는다', tagRe.test(H));
ok('공용 사이드바 뒤에 싣는다', H.indexOf('/js/mg-sidebar.js') >= 0 && H.indexOf('/js/ai-dubbing.js') > H.indexOf('/js/mg-sidebar.js'));
ok('i18n 엔진이 먼저 실린다(defer 순서)', H.indexOf('/js/mango-i18n.js') >= 0 && H.indexOf('/js/mango-i18n.js') < H.indexOf('/js/ai-dubbing.js'));
const cardCount = (H.match(/<div class="scene" aria-disabled="true">/g) || []).length;
ok(`«준비 중» 장면 칸 수 = 자료의 장면 수(${scenes.length})`, cardCount === scenes.length);
for (let i = 1; i <= scenes.length; i++) ok(`장면 칸 ${i} 의 색 표(.tag s${i})가 있다`, H.includes(`class="tag s${i}"`));
const zm = /\.dub-player\{[^}]*z-index:(\d+)/.exec(H);
ok('미리 보기 창이 사이드바(100000)·공용 바(99999)보다 위', !!zm && Number(zm[1]) >= 100002);
ok('[hidden] 이 작성자 CSS 에 지지 않는다', /\[hidden\]\{display:none!important\}/.test(H));
ok('«완성 영상 보기» 는 잠긴 채(합성 검증 전)', /<div class="final" aria-disabled="true">/.test(H));

/* ── ⑥ 화면 부분을 가짜 DOM 으로 실제로 돌린다 ───────────────── */
section('⑥ 가짜 DOM 으로 실제 실행');
function makeEl(tag) {
  const n = {
    tagName: String(tag).toUpperCase(), className: '', attrs: {}, children: [], textContent: '', hidden: false,
    style: {}, listeners: {}, parentNode: null,
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
    removeAttribute(k) { delete this.attrs[k]; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; },
    replaceChild(nw, old) { const i = this.children.indexOf(old); if (i >= 0) this.children[i] = nw; nw.parentNode = this; old.parentNode = null; this.replaced.push([nw, old]); },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    querySelector(sel) { if (sel === '.tag') return this.children.find(c => /(^| )tag( |$)/.test(c.className)) || null; return null; },
    focus() {}, pause() {}, load() {}, play() { return Promise.resolve(); },
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    replaced: [],
  };
  return n;
}
function makeDom(nCards) {
  const created = [];
  const mk = tag => { const n = makeEl(tag); created.push(n); return n; };
  const grid = makeEl('div'); grid.className = 'scenes';
  const cards = [];
  for (let i = 1; i <= nCards; i++) {
    const c = makeEl('div'); c.className = 'scene';
    const th = makeEl('div'); th.className = 'thumb'; th.textContent = '영상 준비 중';
    const tg = makeEl('span'); tg.className = `tag s${i}`;
    c.appendChild(th); c.appendChild(tg); grid.appendChild(c); cards.push(c);
  }
  const notice = makeEl('div'); notice.className = 'notice';
  const body = makeEl('body');
  const document = {
    body, activeElement: null, listeners: {}, created,
    createElement: mk,
    querySelectorAll(sel) { return sel === '.scenes > .scene' ? cards.slice() : []; },
    querySelector(sel) { return sel === '.notice' ? notice : null; },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    removeEventListener() {},
  };
  return { grid, cards, notice, document };
}
async function runScreen(src, { manifest, fetchFails, notOk, search = '' }) {
  const dom = makeDom(6);
  const fetched = [];
  const fetch = (url, opt) => {
    fetched.push([url, opt]);
    if (fetchFails) return Promise.reject(new Error('offline'));
    return Promise.resolve({ ok: !notOk, json: () => Promise.resolve(clone(manifest)) });
  };
  const win = { addEventListener() {}, getLang: () => 'ko' };
  const ctx = { window: win, document: dom.document, location: { search }, fetch, console: { info() {}, log() {}, warn() {} } };
  win.fetch = fetch;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'ai-dubbing.js' });
  for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r));
  return { dom, fetched };
}
const replacedOf = dom => dom.grid.replaced.length;
const realManifest = clone(M);

{
  const { dom, fetched } = await runScreen(JS_SRC, { manifest: realManifest });
  ok('지금 자료로는 장면 칸을 하나도 안 바꾼다(검수 전)', replacedOf(dom) === 0);
  ok('지금 자료로는 «준비 중» 안내를 그대로 둔다', dom.notice.hidden === false);
  ok('자료 주소: /data/dubbing/dub-001.json · 캐시 재검증', fetched.length === 1 && fetched[0][0] === '/data/dubbing/dub-001.json' && fetched[0][1] && fetched[0][1].cache === 'no-cache');
}
{
  const { fetched } = await runScreen(JS_SRC, { manifest: realManifest, search: '?ep=dub-002' });
  ok('?ep=dub-002 는 그 에피소드 자료를 읽는다', fetched[0] && fetched[0][0] === '/data/dubbing/dub-002.json');
  const r2 = await runScreen(JS_SRC, { manifest: realManifest, search: '?ep=../x' });
  ok('이상한 ?ep= 는 무시하고 dub-001', r2.fetched[0] && r2.fetched[0][0] === '/data/dubbing/dub-001.json');
}
function openedManifest(nos) {
  const m = clone(realManifest);
  m.qaApproved = true;
  for (const s of m.scenes) {
    if (!nos.includes(s.no)) continue;
    s.qaApproved = true; s.linesSynced = true; s.durationSec = 40;
    s.video = `/media/dubbing/${EP}/s${s.no}.mp4`; s.bgm = `/media/dubbing/${EP}/s${s.no}-bgm.m4a`; s.thumb = null;
    s.voices = {};
    for (const l of s.lines) s.voices[l.speaker] = `/media/dubbing/${EP}/s${s.no}-${l.speaker}.m4a`;
    let t = 0;
    for (const l of s.lines) { l.start = t; l.end = t + 2; t += 2.5; }
  }
  return m;
}
{
  const m1 = openedManifest([1]);
  ok('(전제) 시험용 자료에서 장면 1 은 열 수 있다', api.sceneProblems(m1, m1.scenes[0]).length === 0, api.sceneProblems(m1, m1.scenes[0]).join(','));
  const { dom } = await runScreen(JS_SRC, { manifest: m1 });
  ok('승인된 장면 1 하나만 버튼으로 바뀐다', replacedOf(dom) === 1);
  const btn = dom.grid.children[0];
  ok('바뀐 칸은 button · data-scene="1" · 색 표 유지', btn && btn.tagName === 'BUTTON' && btn.attrs['data-scene'] === '1' && btn.children.some(c => /tag s1/.test(c.className)));
  ok('나머지 장면은 «준비 중» 칸 그대로', dom.grid.children.slice(1).every(c => c.tagName === 'DIV' && c.className === 'scene'));
  ok('일부만 열렸으면 «준비 중» 안내를 그대로 둔다', dom.notice.hidden === false);
  ok('바뀐 칸을 누르면 미리 보기 창이 열린다', (() => {
    (btn.listeners.click || []).forEach(fn => fn({}));
    return dom.document.body.children.some(c => c.className === 'dub-player') && dom.document.body.classList.contains('dub-open');
  })());
  const player = dom.document.body.children.find(c => c.className === 'dub-player');
  const allEls = []; (function walk(n) { allEls.push(n); (n.children || []).forEach(walk); })(player || {});
  const rec = allEls.find(n => n.className === 'dub-rec');
  ok('미리 보기 안의 «내 목소리로 더빙» 은 잠겨 있다(녹음·평가 검증 전)', !!rec && rec.disabled === true);
  const vid = allEls.find(n => n.tagName === 'VIDEO');
  ok('미리 보기 영상은 소리를 끄고(대사는 따로 겹침) 우리 경로', !!vid && vid.muted === true && vid.src === '/media/dubbing/dub-001/s1.mp4');
  const auds = dom.document.created.filter(n => n.tagName === 'AUDIO');
  ok('배경음 + 캐릭터 목소리만 겹친다(우리 경로)', auds.length >= 2 && auds.every(a => api.isLocalPath(a.src)));
}
{
  const m6 = openedManifest([1, 2, 3, 4, 5, 6]);
  const { dom } = await runScreen(JS_SRC, { manifest: m6 });
  ok('여섯 장면이 다 열리면 여섯 칸이 바뀐다', replacedOf(dom) === 6);
  ok('다 열리면 «준비 중» 안내를 감춘다', dom.notice.hidden === true);
}
{
  const m1 = openedManifest([1]);
  m1.scenes[0].video = 'https://d8j0ntlcm91z4.cloudfront.net/user_x/hf_x.mp4';
  const { dom } = await runScreen(JS_SRC, { manifest: m1 });
  ok('승인돼도 영상이 바깥 주소면 안 연다', replacedOf(dom) === 0);
}
{
  const r1 = await runScreen(JS_SRC, { manifest: openedManifest([1, 2, 3, 4, 5, 6]), fetchFails: true });
  ok('자료를 못 읽으면 아무것도 안 바꾼다(끊김)', replacedOf(r1.dom) === 0 && r1.dom.notice.hidden === false);
  const r2 = await runScreen(JS_SRC, { manifest: openedManifest([1, 2, 3, 4, 5, 6]), notOk: true });
  ok('자료가 404 면 아무것도 안 바꾼다', replacedOf(r2.dom) === 0);
  const bad = openedManifest([1, 2, 3, 4, 5, 6]); bad.schema = 'other';
  const r3 = await runScreen(JS_SRC, { manifest: bad });
  ok('자료 모양(schema)이 다르면 아무것도 안 바꾼다', replacedOf(r3.dom) === 0);
}

/* ── ⑦ 변이시험 — 판정 줄을 지우면 위 검사가 실제로 FAIL 하는가 ── */
section('⑦ 변이시험(이 검사가 헛돌지 않는가)');
const MUTANTS = [
  ['장면 승인 확인을 지움', "if (sc.qaApproved !== true) out.push('scene_not_approved');", ''],
  ['에피소드 승인 확인을 지움', "if (ep.qaApproved !== true) out.push('episode_not_approved');", ''],
  ['대사 시각 확인을 지움', "if (sc.linesSynced !== true) out.push('lines_not_synced');", ''],
  ['바깥 주소도 우리 경로로 봄', "var LOCAL_PATH = /^\\/(?!\\/)[A-Za-z0-9._\\-\\/]+$/;", 'var LOCAL_PATH = /.*/;'],
  ['겹침 확인을 지움', "if (ln.start < prevEnd) push('line_overlap');", ''],
  ['목소리 확인을 지움', "else if (!isLocalPath(voices[ln.speaker])) push('voice_missing');", ''],
];
for (const [name, from, to] of MUTANTS) {
  if (!JS_SRC.includes(from)) { ok(`변이 «${name}»: 바꿀 자리를 찾았다`, false, '소스가 바뀌었으면 이 표도 고칠 것'); continue; }
  const mapi = loadApi(JS_SRC.replace(from, to));
  ok(`변이 «${name}» → 판정 검사가 실제로 FAIL 한다`, gateChecks(mapi, false) > 0);
}
{
  const from = 'if (!probs.length && card) { upgradeCard(card, sc); opened++; }';
  if (!JS_SRC.includes(from)) ok('변이 «검수와 무관하게 연다»: 바꿀 자리를 찾았다', false);
  else {
    const { dom } = await runScreen(JS_SRC.replace(from, 'if (card) { upgradeCard(card, sc); opened++; }'), { manifest: realManifest });
    ok('변이 «검수와 무관하게 연다» → «하나도 안 바꾼다» 검사가 실제로 FAIL 한다', replacedOf(dom) !== 0);
  }
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
