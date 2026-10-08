// AI 영작 — 그림 속 미션 단어 · 도움 접기 · 사용 방법(사진+화살표) 감시 (2026-10-08 선생님 피드백)
//  ① 미션 단어가 «그 그림에 실제로 보이는» 낱말이다 — 모든 그림에 3개씩, 그림을 바꾸면 따라 바뀐다
//  ② 첫 화면은 «그림 보고 쓰기» 만: 브레인스토밍·문장연습·다른 글감은 «도움이 필요해요» 안에 접혀 있다(지우지 않음)
//  ③ 📖 사용 방법 버튼·설명서 사진 5장이 실재하고, 버튼이 공용 칩에 가리는 머리줄에 있지 않다
//  ④ 서버가 복수형(candles)도 «미션 단어를 썼다» 로 센다
import fs from 'node:fs';
const ROOT = new URL('../cloudflare-deploy/', import.meta.url).pathname;
const html = fs.readFileSync(ROOT + 'public/ai-write.html', 'utf8');
const api = fs.readFileSync(ROOT + 'src/api-ai.ts', 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
const bodyAt = (src, at) => { const i = src.indexOf('{', at); let d = 0; for (let k = i; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); } return ''; };

console.log('① 그림 속 미션 단어');
const imgs = [...html.matchAll(/\{ img:'([a-z-]+)'/g)].map(m => m[1]);
ok(imgs.length >= 30, '전제: 그림 목록을 읽었다 (' + imgs.length + '장)');
const swAt = html.indexOf('const SCENE_WORDS = ');
let SW = null;
try { SW = new Function('return ' + bodyAt(html, swAt))(); } catch (e) { SW = null; }
ok(SW && typeof SW === 'object', '전제: SCENE_WORDS 를 오려 내 실제로 평가했다');
const missing = SW ? imgs.filter(i => !(Array.isArray(SW[i]) && SW[i].length === 3)) : imgs;
ok(missing.length === 0, '모든 그림에 낱말 3개가 있다' + (missing.length ? ' — 빠짐: ' + missing.join(',') : ''));
const bad = SW ? Object.entries(SW).filter(([k, v]) => !imgs.includes(k) || v.some(w => !/^[a-zA-Z' -]{1,30}$/.test(w))) : [];
ok(bad.length === 0, '표에 없는 그림·서버가 버리는 글자가 없다' + (bad.length ? ' — ' + bad.map(b => b[0]).join(',') : ''));
ok(SW && SW['birthday-action'] && !SW['birthday-action'].includes('apple'), '생일 그림 미션에 apple 이 없다 (제보 재발 방지)');
// loadMission 을 오려 내 «그림 낱말이 있으면 단어장·레벨 목록보다 먼저» 인지 실제로 돌려 본다
const lmAt = html.indexOf('async function loadMission()');
const lmSrc = 'async function loadMission()' + bodyAt(html, lmAt);
async function runLM(scene) {
  const log = { fetch: 0, words: null };
  const f = new Function('sceneMissionWords', 'renderMission', 'getUid', 'fetch', 'pickDaily', 'FALLBACK_MISSION', 'currentLevel', 'state',
    'let _missionWords=null;' + lmSrc + '; return loadMission().then(function(){ state.words=_missionWords; });');
  await f(() => scene, () => {}, () => 'kid1', async () => { log.fetch++; return { json: async () => ({ ok: true, words: [{ en: 'apple' }, { en: 'school' }, { en: 'happy' }] }) }; },
    (a, n) => a.slice(0, n), { B1: ['x', 'y', 'z'] }, 'B1', log);
  return log;
}
try {
  const a = await runLM(['cake', 'candle', 'gift']);
  ok(JSON.stringify(a.words) === '["cake","candle","gift"]' && a.fetch === 0, '그림 낱말이 있으면 그것이 미션이고 단어장을 부르지 않는다');
  const b = await runLM([]);
  ok(JSON.stringify(b.words) === '["apple","school","happy"]', '(짝) 그림 낱말이 없으면 예전처럼 단어장으로 떨어진다');
} catch (e) { ok(false, 'loadMission 실행 실패: ' + e.message); }
const rpAt = html.indexOf('function renderPic(idx)');
ok(/sceneMissionWords\(\)/.test(bodyAt(html, rpAt)), '그림을 바꾸면(renderPic) 미션 단어도 다시 그린다');
ok(/img\.src = plain/.test(bodyAt(html, rpAt)), '움직이는 그림 첫 장면이 깨지면 원래 그림으로 한 번 더 받는다');

console.log('② 도움 접기');
const help = html.slice(html.indexOf('<details class="aw-help" id="awHelp">'), html.indexOf('</details>', html.indexOf('id="goCard"')));
ok(help.includes('id="goCard"') && help.includes('id="sentenceCoach"') && help.includes('id="topicRow"') && help.includes('id="pickNote"'), '브레인스토밍·문장연습·글감·안내가 «도움» 안에 있다(지우지 않았다)');
ok(!/<details class="aw-help"[^>]*\bopen\b/.test(html), '«도움» 은 처음에 접혀 있다');
const pos = id => html.indexOf('id="' + id + '"');
ok(pos('picCard') < pos('missionCard') && pos('missionCard') < pos('awHelp') && pos('awHelp') < pos('text'), '순서: 그림 → 미션 단어 → 도움 → 글쓰기 칸');
ok(/id="flowSteps" hidden/.test(html) && /\.flow-steps\[hidden\][^{]*\{ display: none !important/.test(html), '4단계 줄은 감춰지고 [hidden] 이 실제로 먹는다');
const gaAt = html.indexOf('function goApplyTheme(');
ok(/awHelp[\s\S]{0,80}open = true/.test(bodyAt(html, gaAt)), '브레인스토밍으로 갈 때 접힌 «도움» 을 먼저 편다');

console.log('③ 사용 방법');
const topBar = html.slice(html.indexOf('<div class="top">'), html.indexOf('<div class="wrap">'));
ok(html.includes('id="awHowBtn"') && !topBar.includes('awHowBtn'), '사용 방법 버튼이 있고, 공용 칩에 가리는 머리줄에는 없다');
ok(html.indexOf('id="awHowBtn"') < html.indexOf('id="awGuide"'), '버튼이 본문 맨 위(안내 줄 위)에 있다');
for (let i = 1; i <= 5; i++) {
  const f = ROOT + 'public/img/aiwrite-guide/step' + i + '.webp';
  const sz = fs.existsSync(f) ? fs.statSync(f).size : 0;
  ok(sz > 5000 && sz < 150000, '설명서 사진 step' + i + '.webp 가 있다 (' + sz + 'B)');
}
ok((html.match(/\{ img: \d, ko: \[/g) || []).length === 5, '설명서 단계가 5개이고 한/영 문장이 짝으로 있다');

console.log('④ 서버 — 복수형도 센다');
const m = api.match(/new RegExp\(`(\\\\b\$\{w\.replace[\s\S]*?)`, 'i'\)/);
ok(!!m, '전제: 미션 판정 정규식을 찾았다');
if (m) {
  const used = (w, text) => new Function('w', 'text', 'return new RegExp(`' + m[1] + '`, "i").test(text);')(w, text);
  ok(used('candle', 'He blows out the candles.'), 'candle ← candles');
  ok(used('box', 'two boxes'), 'box ← boxes');
  ok(used('cake', 'a big cake'), '(짝) 단수는 그대로');
  ok(!used('cake', 'cakewalk'), '(짝) 다른 낱말 속 글자는 안 센다');
}
console.log('──────────────────────────────\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
