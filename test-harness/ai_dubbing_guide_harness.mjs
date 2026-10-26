// ═══════════════════════════════════════════════════════════════════════
// ❓ A.i영화더빙 «사용방법» 안내창 회귀 하니스 (2026-10-26)
//   ① 저절로 열기 판정(decide) — 주소(?ep·?resume·?library…) × 오늘 숨김 값 × 이 탭에서 봄 × 날짜
//      전 조합을 «하니스 안의 독립 정답» 과 대조한다
//   ② ‘오늘’ 은 «이 기기의» 날짜(dayKey) — 시간대 6곳 × 자정 앞뒤·서머타임·연말·윤일 시각을
//      자식 프로세스(TZ=…)에서 돌려 Intl 로 잰 그 지역 날짜와 대조한다
//   ③ 배선 — 버튼·스크립트·CSS(?v=)·그림 파일(크기까지)·화면에 «실제로 있는» 버튼 이름만 말하는가
//   ④ 하지 말 것 — 마이크·영상·소리 API 0 · innerHTML 0 · data-ko/en 0 · 바깥 클릭 닫기 0 · 홑낫표 0
//   ⑤ 변이시험 — 판정·날짜·안전장치를 하나씩 망가뜨린 사본에서 실제로 FAIL 이 나야 한다
//   «보이는가·눌리는가·포커스·스크롤·Esc» 는 브라우저 검사가 잰다:
//       node test-harness/manual/ai-dubbing-guide-browser.mjs   (로컬 정적 서버 8941 필요)
//   변이 사본으로 돌리기: DG_SRC=<고친 사본> node test-harness/ai_dubbing_guide_harness.mjs
// ═══════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(HERE, '..', 'cloudflare-deploy', 'public');
const SRC_PATH = process.env.DG_SRC || path.join(PUB, 'js', 'ai-dubbing-guide.js');
const ME = fileURLToPath(import.meta.url);

/* ── 자식: TZ 가 걸린 프로세스에서 dayKey 만 돌려 준다 ───────────────── */
if (process.argv.includes('--tz-child')) {
  const api = load(fs.readFileSync(SRC_PATH, 'utf8'));
  const instants = JSON.parse(process.env.DG_INSTANTS || '[]');
  process.stdout.write(JSON.stringify(instants.map(ms => api.dayKey(new Date(ms)))));
  process.exit(0);
}

function load(src) {
  const ctx = {};          // window·document 없음 → 판정 함수만 내놓고 끝나야 한다
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'ai-dubbing-guide.js' });
  if (!ctx.MangoiDubGuide) throw new Error('MangoiDubGuide 가 없다');
  return ctx.MangoiDubGuide;
}
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/* ── 독립 정답 ───────────────────────────────────────────────────────── */
const SEARCHES = [
  ['', true], ['?ep=dub-003', true], ['?ep=dub-008&x=1', true], ['?ep=BAD!!', true], ['?genre=kt', true],
  ['?resume=abc123', false], ['?ep=dub-002&resume=d1', false], ['?library=movies', false], ['?library=drafts', false],
  ['?ep=dub-001&library=movies', false], ['?notlibrary=1', true], ['?ep=dub-001&preresume=1', true], ['?library', true], ['?resume=', false]
];
const TODAYS = ['2026-10-26', '2026-12-31', '2027-01-01', '2026-02-28', '2028-02-29'];
function shift(day, n) { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function hiddenValues(today) {
  return [['', true], [today, false], [shift(today, -1), true], [shift(today, 1), true], [shift(today, -365), true], ['garbage', true], [today + ' ', true], [today.replace(/-/g, '/'), true]];
}
const ZONES = ['Asia/Seoul', 'Asia/Manila', 'America/Los_Angeles', 'Europe/London', 'UTC', 'Pacific/Kiritimati'];
function localDay(ms, tz) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const g = (t) => p.find(x => x.type === t).value;
  return g('year') + '-' + g('month') + '-' + g('day');
}
/* 그 지역 «벽시계» 시각 → UTC ms (자정 앞뒤를 정확히 찌르려고) */
function wall(tz, y, mo, d, h, mi, s) {
  let guess = Date.UTC(y, mo - 1, d, h, mi, s);
  for (let i = 0; i < 3; i++) {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(guess));
    const g = (t) => Number(p.find(x => x.type === t).value);
    const seen = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
    guess += Date.UTC(y, mo - 1, d, h, mi, s) - seen;
  }
  return guess;
}
const WALLS = [[2026, 10, 26, 23, 59, 59], [2026, 10, 27, 0, 0, 0], [2026, 10, 27, 0, 0, 1], [2026, 10, 26, 12, 0, 0], [2026, 12, 31, 23, 59, 59], [2027, 1, 1, 0, 0, 0],
  [2028, 2, 28, 23, 59, 59], [2028, 2, 29, 0, 0, 0], [2028, 2, 29, 23, 59, 59], [2026, 3, 8, 3, 30, 0], [2026, 11, 1, 1, 30, 0], [2026, 3, 29, 1, 30, 0], [2026, 10, 25, 1, 30, 0], [2026, 1, 1, 0, 0, 0]];

/* ── 실행 한 벌 — 원본·변이 사본이 같은 검사를 받는다 ──────────────────── */
function runAll(src, label) {
  const fails = [];
  const sections = {};
  const check = (sec, name, cond, extra) => {
    sections[sec] = sections[sec] || { pass: 0, fail: 0 };
    if (cond) sections[sec].pass++; else { sections[sec].fail++; fails.push(sec + ' · ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 160) : '')); }
  };
  let api;
  try { api = load(src); } catch (e) { fails.push('전제 · 판정 모듈을 싣지 못함: ' + e.message); return { fails, sections }; }

  // ① 판정 전 조합
  for (const today of TODAYS) for (const [search, openBySearch] of SEARCHES) for (const [hidden, openByHidden] of hiddenValues(today)) for (const seen of [false, true]) {
    const want = openBySearch && openByHidden && !seen;
    let got; try { got = api.decide({ search, today, hidden, seen }); } catch (e) { got = 'throw:' + e.message; }
    check('① 판정', `today=${today} search=${search || '(없음)'} hidden=${hidden || '(없음)'} seen=${seen}`, got === want, { got, want });
  }
  check('① 판정', '빈 입력에도 던지지 않고 연다(저장소가 막힌 기기)', (() => { try { return api.decide({}) === true; } catch (e) { return false; } })());

  // ② 이 기기의 날짜 — 시간대마다 자식 프로세스
  const tmp = path.join(os.tmpdir(), 'dg-src-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.js');
  fs.writeFileSync(tmp, src);
  try {
    for (const tz of ZONES) {
      const instants = WALLS.map(w => wall(tz, ...w));
      const r = spawnSync(process.execPath, [ME, '--tz-child'], { encoding: 'utf8', env: { ...process.env, TZ: tz, DG_SRC: tmp, DG_INSTANTS: JSON.stringify(instants) }, timeout: 20000 });
      let got = []; try { got = JSON.parse(r.stdout || '[]'); } catch (e) {}
      instants.forEach((ms, i) => check('② 날짜', `${tz} ${WALLS[i].join('/')}`, got[i] === localDay(ms, tz), { got: got[i], want: localDay(ms, tz) }));
    }
  } finally { try { fs.unlinkSync(tmp); } catch (e) {} }

  // ③ 배선
  const html = fs.readFileSync(path.join(PUB, 'ai-dubbing.html'), 'utf8');
  const player = fs.readFileSync(path.join(PUB, 'js', 'ai-dubbing.js'), 'utf8');
  const css = fs.readFileSync(path.join(PUB, 'css', 'ai-dubbing-guide.css'), 'utf8');
  const code = strip(src);
  check('③ 배선', '화면이 안내창 스크립트를 버전 달아 defer 로 싣는다', /<script defer src="\/js\/ai-dubbing-guide\.js\?v=\d+"><\/script>/.test(html));
  check('③ 배선', '화면이 안내창 CSS 를 버전 달아 싣는다', /<link rel="stylesheet" href="\/css\/ai-dubbing-guide\.css\?v=\d+">/.test(html));
  const btn = (html.match(/<button[^>]*id="dub-guide-open"[^>]*>[\s\S]*?<\/button>/) || [''])[0];
  check('③ 배선', '위쪽 ‘❓ 사용방법’ 버튼이 있다(id=dub-guide-open)', !!btn);
  check('③ 배선', '버튼이 대화상자를 연다고 알린다(aria-haspopup·aria-controls)', /aria-haspopup="dialog"/.test(btn) && /aria-controls="dub-guide"/.test(btn));
  check('③ 배선', '버튼 글이 한/영으로 바뀐다(data-ko=사용방법 · data-en=How to use)', /data-ko="사용방법" data-en="How to use"/.test(btn) && /❓/.test(btn));
  check('③ 배선', '버튼은 소개 카드 첫 줄(메뉴 버튼 옆)에 있다 — 상단바 오른쪽 칩 자리 아님', (() => { const i = html.indexOf('dub-intro-top'), j = html.indexOf('id="dub-guide-open"'), k = html.indexOf('id="dub-menu"'); return i > 0 && j > i && k > j; })());
  check('③ 배선', '안내창이 만드는 id(dub-guide)와 버튼의 aria-controls 가 같다', /ov\.id = 'dub-guide'/.test(code));
  check('③ 배선', '메뉴 버튼(dub-menu)의 속성은 그대로다', /<button type="button" class="dub-mobile-menu" id="dub-menu" aria-controls="mg-drawer"/.test(html));
  check('③ 배선', '단계는 셋 — ① 영상 골라요 ② 듣고 따라 해요 ③ 내 목소리로 말해요', api.steps === 3 && /tab: \['영상 골라요'/.test(src) && /tab: \['듣고 따라 해요'/.test(src) && /tab: \['내 목소리로 말해요'/.test(src));
  for (const [k, v] of [['start', '시작하기'], ['hide', '오늘은 다시 보지 않기'], ['close', '닫기'], ['prev', '이전'], ['next', '다음']]) {
    check('③ 배선', `버튼 «${v}» 가 있다`, new RegExp(k + ": \\['[^']*" + v).test(src));
  }
  // 글에서 ‘…’ 로 부른 이름이 화면에 «실제로 있는» 버튼·글인가
  const ALLOW = new Set(['허용', 'Allow']);   // 브라우저가 띄우는 마이크 허락 창의 버튼
  const SPECIAL = { '❓ 사용방법': /data-ko="사용방법"/, '❓ How to use': /data-en="How to use"/ };
  const quoted = [...new Set([...code.matchAll(/‘([^’]+)’/g)].map(m => m[1]))].filter(q => !/^(?:🎤)$/.test(q));
  check('③ 배선', '글이 화면의 버튼 이름을 ‘…’ 로 부른다(10개 이상)', quoted.length >= 10, quoted.length);
  for (const q of quoted) {
    if (ALLOW.has(q)) { check('③ 배선', `‘${q}’ 는 브라우저 허락 창의 말이다`, true); continue; }
    const real = SPECIAL[q] ? SPECIAL[q].test(html) : (html.includes('>' + q + '<') || html.includes('"' + q + '"') || player.includes("'" + q + "'"));
    check('③ 배선', `‘${q}’ 가 화면에 실제로 있다`, real);
  }
  check('③ 배선', '‘🎤’ 는 차례 표시에 실제로 쓰인다', /setTurn\('🎤 '/.test(player));
  // 그림 — 단계 × 언어, 크기 표가 실제 그림과 같아야 레이아웃이 안 흔들린다
  const sizeRe = /\{ img: '([\w-]+)', size: \{ ko: \[(\d+), (\d+)\], en: \[(\d+), (\d+)\] \}/g;
  const imgs = [...src.matchAll(sizeRe)];
  check('③ 배선', '그림 표가 단계마다 있다', imgs.length === 3, imgs.length);
  for (const m of imgs) for (const [lang, w, h] of [['ko', +m[2], +m[3]], ['en', +m[4], +m[5]]]) {
    const f = path.join(PUB, 'img', 'dubbing-guide', `${m[1]}-${lang}.jpg`);
    const ex = fs.existsSync(f);
    check('③ 배선', `그림 ${m[1]}-${lang}.jpg 가 있다`, ex);
    if (!ex) continue;
    const dim = jpegSize(fs.readFileSync(f));
    check('③ 배선', `그림 ${m[1]}-${lang}.jpg 크기가 표와 같다(${w}×${h})`, dim && dim[0] === w && dim[1] === h, dim);
    check('③ 배선', `그림 ${m[1]}-${lang}.jpg 는 120KB 이하(폰 회선)`, fs.statSync(f).size <= 120 * 1024, fs.statSync(f).size);
  }
  check('③ 배선', '그림 주소에 버전이 붙는다(IMG_V)', /IMG_V = '\d+'/.test(src) && /\?v=' \+ IMG_V/.test(src));
  check('③ 배선', '언어가 바뀌면 다시 그린다(mangoi:lang-changed)', /addEventListener\('mangoi:lang-changed', relang\)/.test(code));
  check('③ 배선', '창 안 🌐 는 공용 전환(toggleLang)을 부른다 — 따로 언어를 저장하지 않는다', /root\.toggleLang\(\)/.test(code) && !/setItem\('mangoi_lang'/.test(code));

  // ④ 하지 말 것 · 안전장치
  check('④ 안전', '마이크·녹음 API 를 쓰지 않는다', !/getUserMedia|mediaDevices|MediaRecorder/.test(code));
  check('④ 안전', '영상·소리를 틀지 않는다(play()·AudioContext·speechSynthesis 0)', !/\.play\(|AudioContext|speechSynthesis|new Audio\(/.test(code));
  check('④ 안전', '‘시작하기’는 버튼을 누르지 않는다(click() 0) — 포커스만', !/\.click\(\)/.test(code) && /target\.focus\(\)/.test(code));
  check('④ 안전', 'innerHTML 을 쓰지 않는다(글은 textContent)', !/innerHTML/.test(code));
  check('④ 안전', '그리는 요소에 data-ko/data-en 을 달지 않는다(i18n 갈아끼움 함정)', !/data-ko|data-en/.test(code));
  check('④ 안전', '바깥(어두운 곳)을 눌러도 닫히지 않는다 — ✕ 로만', !/ov\.addEventListener\('click'/.test(code) && !/box\.addEventListener\('click'/.test(code));
  check('④ 안전', 'Esc 는 «먼저 받는 단계(capture)» 에서 받아 화면의 다른 Esc 로 안 흘린다', /root\.addEventListener\('keydown', onKey, true\)/.test(code) && /stopPropagation\(\)/.test(cut(code, 'function onKey')));
  check('④ 안전', '닫으면 Esc·포커스 감시를 뗀다(열고 닫기를 반복해도 쌓이지 않음)', /root\.removeEventListener\('keydown', onKey, true\)/.test(code) && /document\.removeEventListener\('focusin', onFocusIn\)/.test(code));
  check('④ 안전', '이미 열려 있으면 다시 열어도 스크롤·포커스 기록을 덮지 않는다', /if \(was\) return;/.test(cut(code, 'function open')) && cut(code, 'function open').indexOf('if (was) return;') < cut(code, 'function open').indexOf('lockScroll()'));
  check('④ 안전', 'Tab 은 창 안에서만 돈다', /function trapTab/.test(code) && /box\.addEventListener\('keydown', trapTab\)/.test(code));
  check('④ 안전', '닫을 때 스크롤 잠금을 풀고 자리를 되돌린다', /unlockScroll\(\)/.test(cut(code, 'function close')) && /scrollTo\(saved\.x, saved\.y\)/.test(code));
  check('④ 안전', '오늘 숨김은 «기기 날짜» 로 저장한다(dayKey(new Date()))', /write\('localStorage', HIDE_KEY, today\)/.test(code) && /var today = dayKey\(new Date\(\)\)/.test(code));
  check('④ 안전', '저장이 막혀도 이 화면에서는 기억한다(mem)', /mem\.hidden = today/.test(code) && /\|\| mem\.hidden/.test(code) && /\|\| mem\.seen/.test(code));
  check('④ 안전', '저장소 읽기·쓰기는 전부 try 로 감싼다', /function read\(store, key\) \{ try \{/.test(code) && /function write\(store, key, value\) \{ try \{/.test(code));
  check('④ 안전', '위쪽 버튼은 판정(decide)을 거치지 않고 언제나 연다', /btn\.addEventListener\('click', function \(\) \{ open\(0, btn\); \}\)/.test(code));
  check('④ 안전', '저절로 열기는 decide 한 곳에서만 정한다', (code.match(/decide\(\{/g) || []).length === 1);
  check('④ 안전', 'CSS: 공용 홈/EN 칩·드로어보다 위(z-index 100002)', /\.dg-ov\{[^}]*z-index:100002/.test(css));
  for (const [sel, re] of [['✕', /\.dg-x\{[^}]*width:48px;height:48px/], ['이전·다음', /\.dg-nav button\{min-height:54px/], ['오늘은 다시 보지 않기', /\.dg-hide\{min-height:44px/], ['단계 칩', /\.dg-tab\{[^}]*min-height:48px/], ['❓ 사용방법', /\.dub-guide-open\{[^}]*min-height:44px/], ['🌐', /\.dg-lang\{[^}]*min-height:44px/]]) {
    check('④ 안전', `CSS: «${sel}» 는 손가락으로 누르기 쉬운 크기(44px 이상)`, re.test(css));
  }
  check('④ 안전', 'CSS: 설명 글은 큰 글씨(16px 이상)', /\.dg-points li\{[^}]*font-size:17px/.test(css) && !/\.dg-points li\{font-size:1[0-5]/.test(css));
  // 글 — 한/영 짝, 짧은 존댓말, 홑낫표 없음
  const pairs = [...src.matchAll(/\['([^'\\]*(?:\\.[^'\\]*)*)', '([^'\\]*(?:\\.[^'\\]*)*)'\]/g)].map(m => [m[1], m[2]]).filter(([k]) => /[가-힣]/.test(k));
  check('④ 안전', '한/영 글 짝이 20개 이상', pairs.length >= 20, pairs.length);
  for (const [ko, en] of pairs) {
    check('④ 안전', `영어 짝에 한글이 없다: ${en.slice(0, 30)}`, en && !/[가-힣]/.test(en));
    check('④ 안전', `홑낫표 없음: ${ko.slice(0, 20)}`, !/[「」]/.test(ko + en));
  }
  const sentences = [...src.matchAll(/(?:points: \[[\s\S]*?\]\]|tip: \[[^\]]*\])/g)].join('\n');
  const koSent = [...sentences.matchAll(/\['([^']*)', '/g)].map(m => m[1]).flatMap(t => t.split(/(?<=[.?!])\s+/)).filter(Boolean);
  check('④ 안전', '설명 문장이 10개 이상', koSent.length >= 10, koSent.length);
  for (const s of koSent) {
    check('④ 안전', `존댓말로 끝난다: ${s.slice(0, 24)}`, /요[.?!]$/.test(s));
    check('④ 안전', `짧다(45자 이하): ${s.slice(0, 24)}`, s.length <= 45, s.length);
  }
  return { fails, sections };
}
function cut(code, head) { const i = code.indexOf(head); if (i < 0) return ''; const j = code.indexOf('\n  function ', i + head.length); return code.slice(i, j < 0 ? undefined : j); }
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xFF) return null;
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xC3) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}

/* ── 원본 ────────────────────────────────────────────────────────────── */
console.log('═'.repeat(66));
console.log('  ❓ ai_dubbing_guide — A.i영화더빙 사용방법 안내창');
console.log('═'.repeat(66));
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const base = runAll(SRC, '원본');
let total = 0;
for (const [sec, v] of Object.entries(base.sections)) { total += v.pass + v.fail; console.log(`  ${v.fail ? '❌' : '✅'} ${sec}: 통과 ${v.pass} / ${v.pass + v.fail}`); }
base.fails.slice(0, 30).forEach(f => console.log('    ✗ ' + f));

/* ── ⑤ 변이시험 — 원본이 깨끗할 때만 의미가 있다 ───────────────────────── */
console.log('\n── ⑤ 변이시험 (각 사본에서 실패가 «나야» 통과)');
const MUTANTS = [
  ['이어 하기·보관함 주소도 연다', "if (/[?&](?:resume|library)=/.test(String(o.search || ''))) return false;", ''],
  ['이 탭에서 봐도 또 연다', 'if (o.seen) return false;', ''],
  ['숨김 날짜를 안 보고 숨김', 'if (o.hidden && o.hidden === o.today) return false;', 'if (o.hidden) return false;'],
  ['오늘 숨김 무시', 'if (o.hidden && o.hidden === o.today) return false;', ''],
  ['날짜를 UTC 로', "return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());", "return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());"],
  ['달이 하나 밀림', 'pad(d.getMonth() + 1)', 'pad(d.getMonth())'],
  ['한 자리 수에 0 안 붙임', "function pad(n) { return (n < 10 ? '0' : '') + n; }", 'function pad(n) { return String(n); }'],
  ['Esc 를 늦게 받음(시트도 같이 닫힘)', "root.addEventListener('keydown', onKey, true);", "root.addEventListener('keydown', onKey);"],
  ['Esc 를 화면으로 흘림', 'e.preventDefault(); e.stopPropagation(); close(\'esc\');', "e.preventDefault(); close('esc');"],
  ['바깥 클릭으로 닫힘', "box.addEventListener('keydown', trapTab);", "box.addEventListener('keydown', trapTab); ov.addEventListener('click', function (e) { if (e.target === ov) close('x'); });"],
  ['시작하기가 녹음 버튼을 누름', 'if (target) { try { target.focus(); }', 'if (target) { try { target.click(); }'],
  ['안내창이 마이크를 켬', 'function lockScroll() {', "function lockScroll() { try { navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) {}"],
  ['다시 열면 스크롤 기록 덮음', '    if (was) return;   // 이미', '    // 이미'],
  ['위쪽 버튼도 오늘 숨김을 따름', 'if (btn) btn.addEventListener(\'click\', function () { open(0, btn); });', "if (btn) btn.addEventListener('click', function () { if (hiddenDay() !== dayKey(new Date())) open(0, btn); });"],
  ['저장이 막히면 숨김을 잊음', '    mem.hidden = today;\n', ''],
  ['innerHTML 로 그림', "ov.querySelector('.dg-tip').textContent = T(s.tip);", "ov.querySelector('.dg-tip').innerHTML = T(s.tip);"],
  ['없는 버튼 이름을 말함', "'연습하고 싶은 장면의 ‘더빙’을 눌러요.'", "'연습하고 싶은 장면의 ‘더빙하기’를 눌러요.'"],
  ['반말이 섞임', "'내가 맡을 캐릭터를 골라요.'", "'내가 맡을 캐릭터를 골라.'"],
  ['그림 크기 표가 낡음', "{ img: '1-pick', size: { ko: [732, 692]", "{ img: '1-pick', size: { ko: [780, 640]"],
  ['영어 짝에 한글', "'Choose the character you will play.'", "'Choose the 캐릭터 you will play.'"],
];
let mutOk = 0, mutBad = 0;
if (base.fails.length) {
  console.log('  ⏭  원본이 실패 중이라 변이시험을 건너뛴다(전제 불충족)');
} else {
  for (const [name, from, to] of MUTANTS) {
    if (!SRC.includes(from)) { mutBad++; console.log(`  ❌ 변이 «${name}» — 바꿀 자리를 소스에서 못 찾음`); continue; }
    const r = runAll(SRC.replace(from, to), name);
    if (r.fails.length) { mutOk++; console.log(`  ✅ 변이 «${name}» → 잡힘(${r.fails.length}건)`); }
    else { mutBad++; console.log(`  ❌ 변이 «${name}» → 못 잡음`); }
  }
}
const failN = base.fails.length + mutBad;
console.log('\n' + '─'.repeat(66));
console.log(`  조합 검사 ${total}건 · 통과 ${total - base.fails.length} · 변이 ${mutOk}/${MUTANTS.length} 잡음`);
console.log(failN ? `  결과: ${failN} FAIL` : '  결과: 전부 통과');
process.exit(failN ? 1 : 0);
