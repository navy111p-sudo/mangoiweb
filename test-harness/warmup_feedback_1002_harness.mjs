// warmup_feedback_1002_harness.mjs — A.i 말하기 연습 2026-10-02 피드백 다섯 가지 중 1~4번
//   (5번 «수동 버튼인데 말이 안 끝났는데 올라감» 은 warmup_reply_speed_harness 가 본다)
//
//   1) 번역이 틀렸을 때 «뜻이 이상해요» 로 알려 주기 — 화면 버튼 + 서버 /api/translate mode:'learn_report'
//   2) Jake·Noah(남자 목소리)를 0.9배보다 늘이지 않고 문장 사이를 쉰다 — 여자·중국어·빠른 속도는 그대로(짝)
//   3) 대화 화면 위쪽에 🔄 새 대화 — 수업방에서는 감추고, 학생이 한 번이라도 말했으면 확인을 묻는다
//   4) 성인이면 교재 목록을 SIU 쪽부터, 성인 프롬프트에 «아이 말 금지» — 아이 줄에는 그 규칙이 없다(짝)
//
// ⚠️ 글자로 못 박지 않고, 소스에서 함수를 오려 내 «실제로 돌려» 답을 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(process.env.WARMUP_SRC || path.join(ROOT, 'cloudflare-deploy/public/warmup.html'), 'utf8');
const AUD = fs.readFileSync(path.join(ROOT, 'cloudflare-deploy/src/warmup-audience.ts'), 'utf8');
const API = fs.readFileSync(process.env.API_SRC || path.join(ROOT, 'cloudflare-deploy/src/api-mango.ts'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌ FAIL', name, extra !== undefined ? '— ' + JSON.stringify(extra) : ''); }
}
function bodyAt(src, head) {
  const i = src.indexOf(head); if (i < 0) return '';
  let d = 0; const st = src.indexOf('{', i + head.length - 1);
  for (let k = st; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return '';
}
const stripC = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

// ───────────────────────── 2) 남자 목소리
console.log('\n[2] 남자 목소리 — 0.9배보다 안 늘이고 그만큼 쉰다');
const rateFn = bodyAt(HTML, 'function _enMaleRate(rate){');
const gapFn = bodyAt(HTML, 'function _enMaleGapMs(){');
const minM = HTML.match(/var EN_MALE_MIN_RATE = ([\d.]+);/);
ok('2-0 (전제) 함수·상수를 오려 냈다', !!(rateFn && gapFn && minM));
function voice(gender, zh, want) {
  try {
    return new Function('g', 'z', 'w', `var EN_MALE_MIN_RATE=${minM[1]};
      function isZh(){ return z; } function _voiceGender(){ return g; }
      var AUDIO_RATE={3:w}, _rateLevel=3;
      ${rateFn} ${gapFn}
      return { rate:_enMaleRate(w), gap:_enMaleGapMs() };`)(gender, zh, want);
  } catch (e) { return { err: String(e) }; }
}
const m08 = voice('male', false, 0.8), f08 = voice('female', false, 0.8), z08 = voice('male', true, 0.8), m125 = voice('male', false, 1.25);
ok('2-1 남자·영어·0.8배 → 0.9배로 올린다', m08.rate === 0.9, m08);
ok('2-2 그만큼 문장 사이를 쉰다(0보다 큼)', m08.gap > 0 && m08.gap <= 1500, m08);
ok('2-3 (짝) 여자 목소리는 그대로 0.8배 · 쉼 0', f08.rate === 0.8 && f08.gap === 0, f08);
ok('2-4 (짝) 중국어(남자 선생님)는 건드리지 않는다', z08.rate === 0.8 && z08.gap === 0, z08);
ok('2-5 (짝) 빠르게(1.25배) 고른 학생은 그대로', m125.rate === 1.25 && m125.gap === 0, m125);
const play0 = HTML.match(/_ttsAudio\.playbackRate=\(([^;]+)\);?/);
ok('2-6 실제 재생 배속이 그 함수를 지난다(굵게 만든 중국어는 제외)', !!play0 && /deep \? \(AUDIO_RATE\[_rateLevel\]\|\|1\) : _enMaleRate\(/.test(play0[0]));
const chunks = bodyAt(HTML, 'function _speakChunks(');
ok('2-7 문장 사이 쉼이 _speakChunks 에 배선됐다(쉼이 있으면 setTimeout)', /var gap=_enMaleGapMs\(\)/.test(chunks) && /setTimeout\(function\(\)\{ if\(seq===_speakSeq\) step\(i\+1\); \}, gap\)/.test(chunks));

// ───────────────────────── 3) 🔄 새 대화
console.log('\n[3] 대화 화면 위쪽 🔄 새 대화');
const top = HTML.match(/<button id="newChatTop"[\s\S]*?<\/button>/);
ok('3-1 위쪽 바에 🔄 버튼이 있고 newWarmupChat 을 부른다', !!top && /onclick="newWarmupChat\(\)"/.test(top[0]));
ok('3-2 설명은 title·aria 로(글자를 갈아끼우는 data-ko/data-en 이 아님)', !!top && /data-ko-title=/.test(top[0]) && !/data-ko="/.test(top[0]));
ok('3-3 ⋮ 안의 원래 버튼도 그대로 남아 있다', /id="newChatGroup"/.test(HTML));
ok('3-4 [hidden] 이 display 규칙에 지지 않는다', /#newChatTop\[hidden\][^{]*\{display:none!important\}/.test(HTML.replace(/,\s*/g, ',')));
const hideIIFE = bodyAt(HTML, '(function hideNewChatInRoom(){');
function hideRun(room) {
  const els = { newChatGroup: { hidden: false }, newChatTop: { hidden: false } };
  try {
    new Function('room', 'els', `var Q={get:function(k){ return k==='room'?room:''; }};
      var document={getElementById:function(id){ return els[id]; }};
      ${hideIIFE})();`)(room, els);
  } catch (e) { return { err: String(e) }; }
  return els;
}
const inRoom = hideRun('class-1-20261002'), alone = hideRun('');
ok('3-5 수업방에서는 위쪽 🔄 도 감춘다', inRoom.newChatTop && inRoom.newChatTop.hidden === true, inRoom);
ok('3-6 (짝) 혼자 연습할 때는 보인다', alone.newChatTop && alone.newChatTop.hidden === false, alone);
const nwc = bodyAt(HTML, 'function newWarmupChat(){');
function confirmAsked(said) {
  let asked = 0;
  try {
    new Function('said', 'mark', `var Q={get:function(){return '';}}; function getLang(){return 'ko';}
      var log={querySelectorAll:function(){ return {length:said}; }, innerHTML:''};
      function confirm(){ mark(); return false; }
      function closeMenu(){ throw new Error('stop'); }
      try{ (${nwc.replace('function newWarmupChat(){', 'function(){')})(); }catch(e){}`)(said, () => { asked++; });
  } catch (e) { return -1; }
  return asked;
}
ok('3-7 한 번이라도 말했으면 한 번 묻는다(잘못 누름 막기)', confirmAsked(1) === 1 && confirmAsked(3) === 1, [confirmAsked(1), confirmAsked(3)]);
ok('3-8 (짝) 아직 한 마디도 안 했으면 묻지 않고 바로 시작', confirmAsked(0) === 0, confirmAsked(0));

// ───────────────────────── 4) 성인 수준
console.log('\n[4] 성인 — 교재 순서와 «아이 말» 금지');
const sbase = bodyAt(HTML, 'function _bookSortBase(){');
const bandM = HTML.match(/var SIU_BAND_MIN\s*=\s*(\d+)/);
ok('4-0 (전제) _bookSortBase·SIU_BAND_MIN 을 찾았다', !!(sbase && bandM), bandM && bandM[1]);
const sortBase = (age, lv) => { try { return new Function('a', 'l', `var _warmAge=a, _warmLevel=l, SIU_BAND_MIN=${bandM[1]}; ${sbase} return _bookSortBase();`)(age, lv); } catch (e) { return NaN; } };
ok('4-1 성인·2단계여도 교재 목록은 SIU 쪽부터', sortBase('adult', 2) >= Number(bandM[1]), sortBase('adult', 2));
ok('4-2 (짝) 어린이·2단계는 예전 그대로 2', sortBase('child', 2) === 2 && sortBase('kid', 3) === 3);
ok('4-3 (짝) 성인·7단계는 그대로 7', sortBase('adult', 7) === 7);
ok('4-4 두 스냅숏 자리 모두 _bookSortBase 를 쓴다', (HTML.match(/_btsSortLv = _bookSortBase\(\)/g) || []).length >= 2,
  (HTML.match(/_btsSortLv = _bookSortBase\(\)/g) || []).length);
const hint = bodyAt(HTML, 'function _adultLowLevelHint(){');
function hintRun(age, lv, zh) {
  let n = 0;
  try {
    new Function('a', 'l', 'z', 'mark', `var _adultLowHinted=false, _warmAge=a, _warmLevel=l;
      function isZh(){ return z; } function addMsg(){ mark(); } function getLang(){ return 'ko'; }
      ${hint} _adultLowLevelHint(); _adultLowLevelHint();`)(age, lv, zh, () => { n++; });
  } catch (e) { return -1; }
  return n;
}
ok('4-5 성인·낮은 단계면 안내를 «한 번만» 보여 준다', hintRun('adult', 2, false) === 1, hintRun('adult', 2, false));
ok('4-6 (짝) 어린이·높은 단계 성인·중국어에는 안 보인다', hintRun('child', 1, false) === 0 && hintRun('adult', 5, false) === 0 && hintRun('adult', 1, true) === 0);
ok('4-7 시작할 때 그 안내를 부른다', /try\{ _adultLowLevelHint\(\); \}catch\(e\)\{\}/.test(bodyAt(HTML, 'function startWarmup(')));
// 첫 줄(라벨표 adult: '성인')이 아니라 «말투 줄» 표에서 읽는다
const linesTbl = bodyAt(AUD, 'const WARMUP_AGE_LINES');
const adultLine = (linesTbl.match(/adult:\s*'([^']+)'/) || [])[1] || '';
const kidLine = (linesTbl.match(/kid:\s*'([^']+)'/) || [])[1] || '';
ok('4-7b (전제) 말투 줄 표를 찾았다', !!adultLine && !!kidLine);
ok('4-8 성인 줄에 «아이 말 금지(yummy 등) + 어른 낱말» 이 있다', /yummy/.test(adultLine) && /delicious/.test(adultLine));
ok('4-9 (짝) 유아 줄에는 그 금지가 없다', !!kidLine && !/yummy/.test(kidLine));

// ───────────────────────── 1) 뜻이 이상해요
console.log('\n[1] 뜻이 이상해요 — 알려 주기');
const rep = bodyAt(HTML, 'function _addMeaningReport(chip, text, ko){');
ok('1-0 (전제) 화면 함수를 오려 냈다', !!rep);
ok('1-1 뜻을 «가져왔을 때만» 버튼을 붙인다', /if\(ko\)\{ chip\.textContent = ko; _addMeaningReport\(chip, text, ko\); \}/.test(bodyAt(HTML, 'function toggleMeaning(')));
async function repRun(resp) {
  const chip = { kids: [], appendChild(c) { this.kids.push(c); } };
  const doc = { createElement() { return { disabled: false, textContent: '' }; } };
  let sent = null;
  const f = async (u, o) => { sent = { u, body: JSON.parse(o.body) }; if (resp === 'throw') throw new Error('net'); return { json: async () => resp }; };
  try { new Function('document', 'fetch', 'chip', `${rep} _addMeaningReport(chip, 'Good job!', '훌륭한 직업!');`)(doc, f, chip); }
  catch (e) { return { err: String(e) }; }
  const b = chip.kids[0];
  if (!b || !b.onclick) return { err: 'no button' };
  b.onclick({ stopPropagation() {} });
  await new Promise(r => setTimeout(r, 5));
  return { b, sent };
}
const r1 = await repRun({ ok: true, stored: true });
ok('1-2 누르면 learn_report 로 «문장·뜻» 을 보낸다', !!r1.sent && r1.sent.u === '/api/translate' && r1.sent.body.mode === 'learn_report'
  && r1.sent.body.text === 'Good job!' && r1.sent.body.meaning === '훌륭한 직업!', r1.sent);
ok('1-3 저장됐다고 하면 고맙다고 하고 다시 못 누른다', r1.b && /고마워요/.test(r1.b.textContent) && r1.b.disabled === true, r1.b && r1.b.textContent);
const r2 = await repRun({ ok: true, stored: false });
ok('1-4 (짝) 서버가 «안 적었다» 고 하면 고맙다고 하지 않는다', r2.b && !/고마워요/.test(r2.b.textContent) && r2.b.disabled === false, r2.b && r2.b.textContent);
const r3 = await repRun('throw');
ok('1-5 (짝) 통신이 실패해도 고맙다고 하지 않고 다시 누를 수 있다', r3.b && !/고마워요/.test(r3.b.textContent) && r3.b.disabled === false);
ok('1-6 버튼 설명이 한·영 둘 다', !!rep && /뜻이 이상해요/.test(rep) && /Wrong meaning/.test(rep));

// 서버 갈래 — 진짜 SQLite 가 있으면 SQL 을 실제로 돌린다
const srvI = API.indexOf("if (b.mode === 'learn_report') {");
const srv = srvI >= 0 ? bodyAt(API.slice(srvI), "if (b.mode === 'learn_report') {") : '';
ok('1-7 (전제) 서버 갈래를 찾았다', !!srv);
const cacheI = API.indexOf('const cacheKey = (t: string) =>');
ok('1-8 그 갈래는 번역(캐시·모델 호출) «앞» 에서 돌아간다', srvI > 0 && cacheI > srvI);
ok('1-9 캐시를 지우거나 번역을 바꾸지 않는다(적기만)', !!srv && !/TRANSLATE_CACHE|\.delete\(|KV|put\(/i.test(stripC(srv)));
ok('1-10 길이를 300자로 자른다', (srv.match(/\.slice\(0, 300\)/g) || []).length >= 2);
let Sqlite = null;
try { Sqlite = (await import('node:sqlite')).DatabaseSync; } catch (e) {}
if (Sqlite) {
  const db = new Sqlite(':memory:');
  const env = { DB: { prepare(sql) {
    const st = db.prepare(sql); let args = [];
    const o = { bind(...a) { args = a; return o; }, async run() { st.run(...args); return {}; }, async first() { return st.get(...args) || null; } };
    return o;
  } } };
  const json = (x, s) => ({ x, s: s || 200 });
  const runSrv = async (body) => {
    try {
      const code = srv.replace(/: any/g, '').replace(/ as any/g, '');
      return await new Function('b', 'env', 'json', 'console', `return (async () => { ${code} return null; })();`)(body, env, json, { warn() {} });
    } catch (e) { return { err: String(e) }; }
  };
  const a1 = await runSrv({ mode: 'learn_report', text: 'Good job!', meaning: '훌륭한 직업!', page: 'warmup' });
  const a2 = await runSrv({ mode: 'learn_report', text: 'Good job!', meaning: '훌륭한 직업!', page: 'warmup' });
  const row = db.prepare('SELECT text, meaning, count FROM learn_meaning_reports').all();
  ok('1-11 (SQLite) 적고 stored:true 를 준다', a1 && a1.x && a1.x.ok === true && a1.x.stored === true, a1);
  ok('1-12 (SQLite) 같은 (문장, 뜻) 은 한 줄로 모으고 횟수만 센다', row.length === 1 && row[0].count === 2, row);
  const a3 = await runSrv({ mode: 'learn_report', text: '', meaning: 'x' });
  ok('1-13 (짝) 문장이 비면 400 이고 안 적는다', a3 && a3.s === 400 && db.prepare('SELECT COUNT(*) n FROM learn_meaning_reports').get().n === 1, a3);
  db.exec(`INSERT INTO learn_meaning_reports (text, meaning, page, count, created_at, last_at)
    WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<520) SELECT 't'||i, 'm', 'x', 1, ${Date.now()}, ${Date.now()} FROM n`);
  const a4 = await runSrv({ mode: 'learn_report', text: 'flood', meaning: 'f' });
  ok('1-14 하루 500줄을 넘으면 «안 적었다» 고 말한다(stored:false)', a4 && a4.x && a4.x.ok === true && a4.x.stored === false, a4);
} else {
  console.log('  ⏭  node:sqlite 없음 — 1-11~1-14 건너뜀');
}

// ── [2-b] 2026-10-02 사장님 「Jake 는 apollo → odysseus · Jake·Noah 는 보통을 0.9배로」 ──
console.log('\n[2-b] Jake 목소리 odysseus · 남자 «보통» 0.9배 — 세 화면');
const AF = fs.readFileSync(process.env.AF_SRC || path.join(ROOT, 'cloudflare-deploy/public/ai-friend.html'), 'utf8');
const SC = fs.readFileSync(process.env.SC_SRC || path.join(ROOT, 'cloudflare-deploy/public/speech-coach.html'), 'utf8');
const GAMES = fs.readFileSync(process.env.GAMES_SRC || path.join(ROOT, 'cloudflare-deploy/src/api-games.ts'), 'utf8');
const jakeSpk = (src) => ((src.match(/jake:\s*\{[^}]*?speaker:\s*'([a-z]+)'/) || [])[1] || '');
ok('2-b1 웜업 Jake = odysseus', jakeSpk(HTML) === 'odysseus', jakeSpk(HTML));
ok('2-b2 A.i 친구 Jake = odysseus', jakeSpk(AF) === 'odysseus', jakeSpk(AF));
ok('2-b3 발음 연습 Jake = odysseus', jakeSpk(SC) === 'odysseus', jakeSpk(SC));
const sub = (GAMES.match(/odysseus:\s*'([a-z]+)'/) || [])[1] || '';
ok('2-b4 Aura-1 대체가 Noah(orion)와 겹치지 않는다', sub && sub !== 'orion', sub);
// A.i 친구 — rateFor 를 오려 내 실제로 돌린다
const afMin = AF.match(/const MALE_MIN_RATE_AF = ([\d.]+);/);
const afRateSrc = bodyAt(AF, 'function rateFor(person, r) {');
const afPeople = bodyAt(AF, 'const PEOPLE = {');
function afRate(person, r) { try { return new Function('p', 'r', `const PEOPLE = ${afPeople.replace(/^const PEOPLE = /, '')}; const MALE_MIN_RATE_AF = ${afMin && afMin[1]}; ${afRateSrc} return rateFor(p, r);`)(person, r); } catch (e) { return 'ERR:' + e.message; } }
ok('2-b5 A.i 친구 Jake «보통»(0.8) → 0.9', afRate('jake', 0.8) === 0.9, afRate('jake', 0.8));
ok('2-b6 A.i 친구 Noah «보통»(0.8) → 0.9', afRate('noah', 0.8) === 0.9, afRate('noah', 0.8));
ok('2-b7 (짝) A.i 친구 Lily «보통» 은 0.8 그대로', afRate('lily', 0.8) === 0.8, afRate('lily', 0.8));
ok('2-b8 (짝) A.i 친구 Jake 빠름(1.25) 은 그대로', afRate('jake', 1.25) === 1.25, afRate('jake', 1.25));
ok('2-b9 A.i 친구 재생이 rateFor 를 지난다', /MangoiTTS\.speak\(\s*clean\s*,\s*rateFor\(/.test(stripC(AF)));
// 발음 연습 — scRateFor 를 오려 내 실제로 돌린다
const scRateSrc = bodyAt(SC, 'function scRateFor(lang) {');
const scMin = SC.match(/var SC_MALE_MIN_RATE = ([\d.]+);/), scNorm = SC.match(/var SC_RATE_NORMAL = ([\d.]+);/);
function scRate(g, lang) { try { return new Function('g', 'l', `var SC_RATE_NORMAL=${scNorm && scNorm[1]}, SC_MALE_MIN_RATE=${scMin && scMin[1]}; function scGender(){ return g; } ${scRateSrc} return scRateFor(l);`)(g, lang); } catch (e) { return 'ERR:' + e.message; } }
ok('2-b10 발음 연습 남자 영어 → 0.9', scRate('male', 'en') === 0.9, scRate('male', 'en'));
ok('2-b11 (짝) 발음 연습 여자 영어 → 0.8', scRate('female', 'en') === 0.8, scRate('female', 'en'));
ok('2-b12 (짝) 발음 연습 남자라도 중국어는 0.8', scRate('male', 'zh') === 0.8, scRate('male', 'zh'));
ok('2-b13 발음 연습 두 재생 자리가 lang 을 넘긴다', (stripC(SC).match(/scApplyNormalRate\(ttsAudio,\s*lang\)/g) || []).length === 2);
ok('2-b14 세 화면 남자 최소 배속이 같다', minM && afMin && scMin && minM[1] === afMin[1] && afMin[1] === scMin[1], [minM && minM[1], afMin && afMin[1], scMin && scMin[1]]);

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
