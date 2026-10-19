// 🎬 A.i영화더빙 회귀 감시 (2026-10-20)
//
//   왜 필요한가 —
//     1~5명이 캐릭터를 하나씩 골라 «고른 캐릭터만» 원어민 목소리를 끄고 더빙한다.
//     그 판정(누가 어느 대사를 말하나 · 어느 목소리를 끄나 · 대사 시각을 믿어도 되나)은
//     js/ai-dubbing-core.js 한 곳에 있다. 화면(js/ai-dubbing.js)은 그것을 «부르기만» 한다.
//     영상·대본·원어민 음성은 ChatGPT 가 만든다 — 자료가 바뀌어도 화면이 «거짓말» 하지 않게
//     (시각이 안 맞는데 맞는 척 · 학생이 고르지 않은 캐릭터를 끄는 것) 정본을 실제로 돌려 본다.
//
//   이 하니스가 못 박는 것 —
//     ① 정본을 «실제로 돌린다» — 배정·음소거·시각 판정·녹음 시간·요약
//     ② 🔴 고르지 않은 캐릭터는 원어민 그대로, 고른 캐릭터만 학생 — «짝으로» 본다
//        (앞만 보면 «전부 학생», 뒤만 보면 «전부 원어민» 이 통과한다)
//     ③ 시각이 «synced» 라고 밝혀도 겹치거나 영상보다 길면 차례 모드로 «떨어진다»
//     ④ 학생 캐릭터 음성 파일이 하나라도 빠지면 TTS 로 간다(빈 소리로 재생하지 않는다)
//     ⑤ 원본 영상 소리는 «clean» 이라고 밝힌 장면만 켠다(AI 생성기가 넣은 엉뚱한 목소리 차단)
//     ⑥ 지금 실린 dub-001.json 이 실제로 돈다(6장면 · 차례 모드 · 영상 주소 실재 형식)
//     ⑦ 화면이 정본을 싣고 «판정을 복제하지 않는다» · 전사에 prompt 를 안 보낸다
//     ⑧ 변이시험 — 정본을 일부러 망가뜨린 사본으로 같은 검사를 돌려 «실제로 FAIL» 이 나는지
//        (검사가 헛돌지 않는다는 유일한 증거. 원본은 0건이어야 한다 — 전제 검사)
//
//   실행: node test-harness/ai_dubbing_harness.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const rd = (p) => readFileSync(p, 'utf8');

let PASS = 0, FAIL = 0;
const check = (name, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

const CORE_PATH = join(PUB, 'js', 'ai-dubbing-core.js');
const PLAYER_PATH = join(PUB, 'js', 'ai-dubbing.js');
const HTML_PATH = join(PUB, 'ai-dubbing.html');
const EP_PATH = join(PUB, 'data', 'dubbing', 'dub-001.json');
const CORE_SRC = rd(CORE_PATH);

/* 정본을 «소스 문자열에서» 불러온다 — 변이시험이 같은 길로 망가진 사본을 돌릴 수 있게 */
function loadCore(src) {
  const sandbox = { module: { exports: {} } };
  sandbox.window = undefined;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'ai-dubbing-core.js' });
  return sandbox.module.exports;
}

/* ── 시험용 매니페스트 ───────────────────────────────────────────────── */
const CHARS = {
  dino: { name: { ko: '디노', en: 'Dino' }, emoji: '🦖', ttsSpeaker: 'aries' },
  mina: { name: { ko: '미나', en: 'Mina' }, emoji: '👧', ttsSpeaker: 'thalia' },
  leo: { name: { ko: '레오', en: 'Leo' }, emoji: '👦', ttsSpeaker: 'apollo' },
};
function sceneSynced(extra) {
  return Object.assign({
    no: 1, label: { ko: '숲', en: 'Forest' }, video: 'v/s1.mp4', durationSec: 15,
    voices: { dino: 'a/dino-1.wav', mina: 'a/mina-1.wav' },
    lines: [
      { id: 'a', speaker: 'dino', en: 'Hello, I am Dino.', ko: '안녕', start: 0.5, end: 2.0 },
      { id: 'b', speaker: 'mina', en: 'Hi Dino!', ko: '안녕 디노', start: 2.5, end: 3.5 },
      { id: 'c', speaker: 'dino', en: 'Let us go.', ko: '가자', start: 4.0, end: 5.0 },
    ],
  }, extra || {});
}
function manifest(over, sceneOver) {
  return Object.assign({
    id: 'test-ep', title: { ko: '시험', en: 'Test' }, status: 'final', timing: 'synced',
    baseUrl: 'https://cdn.example/ep/', characters: CHARS, playable: ['dino', 'mina'],
    scenes: [sceneSynced(sceneOver)],
  }, over || {});
}

/* ── 검사 묶음 — 정본(core)을 받아 실패 목록을 돌려준다(변이시험이 같은 것을 재사용) ── */
function runChecks(C, report) {
  const fails = [];
  const ck = (name, ok, extra) => { if (report) check(name, ok, extra); if (!ok) fails.push(name); };

  // ① 정상 synced 매니페스트
  const n1 = C.normalizeEpisode(manifest());
  ck('①-1 정상 매니페스트는 ok · 문제 0', n1.ok && n1.problems.length === 0, n1.problems);
  const s1 = n1.episode && n1.episode.scenes[0];
  ck('①-2 시각이 맞고 음성 파일이 다 있으면 synced + stems', !!s1 && s1.timing === 'synced' && s1.voiceMode === 'stems', s1 && [s1.timing, s1.voiceMode]);
  ck('①-3 상대경로는 baseUrl 로 이어 붙인다', !!s1 && s1.video === 'https://cdn.example/ep/v/s1.mp4' && s1.voices.dino === 'https://cdn.example/ep/a/dino-1.wav', s1 && s1.video);
  ck('①-4 절대 URL·루트 경로는 그대로', C.resolveUrl('https://x.y/a.mp4', 'https://b/') === 'https://x.y/a.mp4' && C.resolveUrl('/data/a.mp4', 'https://b/') === '/data/a.mp4');
  // 장면 미리보기 그림(thumb) — 선택 칸. 있으면 영상과 같은 규칙으로 이어 붙이고, 없으면 '' (화면은 이모지로)
  const withThumb = C.normalizeEpisode(manifest(null, { thumb: 't/s1.webp' }));
  ck('①-8 thumb 상대경로도 baseUrl 로 이어 붙인다', withThumb.episode.scenes[0].thumb === 'https://cdn.example/ep/t/s1.webp', withThumb.episode.scenes[0].thumb);
  ck('①-9 «짝» — thumb 가 없으면 빈 값(지어내지 않는다) · 문제로 세지 않는다', !!s1 && s1.thumb === '' && n1.problems.length === 0, s1 && s1.thumb);

  // ③ 시각을 믿어도 되는가
  const overlap = C.normalizeEpisode(manifest(null, { lines: [
    { speaker: 'dino', en: 'One', start: 0.5, end: 3.0 },
    { speaker: 'mina', en: 'Two', start: 2.0, end: 4.0 },
  ] }));
  ck('③-1 대사 시각이 겹치면 synced 라도 차례(turn) 모드로 떨어진다',
    overlap.episode.scenes[0].timing === 'turn' && overlap.problems.some((p) => /timing_invalid_fallback_turn/.test(p)), overlap.problems);
  const tooLong = C.normalizeEpisode(manifest(null, { durationSec: 15, lines: [
    { speaker: 'dino', en: 'Late line', start: 30, end: 33 },
  ] }));
  ck('③-2 영상(15초)보다 늦은 대사 시각(40초 장면 기준)은 믿지 않는다', tooLong.episode.scenes[0].timing === 'turn');
  const noTime = C.normalizeEpisode(manifest(null, { lines: [{ speaker: 'dino', en: 'No time' }] }));
  ck('③-3 시각이 없는 대사는 차례 모드', noTime.episode.scenes[0].timing === 'turn');
  const prov = C.normalizeEpisode(manifest({ timing: 'provisional' }));
  ck('③-4 timing 을 synced 로 밝히지 않으면 시각이 맞아도 차례 모드(지어내 맞추지 않는다)', prov.episode.scenes[0].timing === 'turn');
  ck('③-5 «짝» — synced 로 밝히고 시각이 맞으면 synced 가 «된다»(전부 turn 이면 이 검사가 잡는다)', s1 && s1.timing === 'synced');

  // ④ 음성 파일이 빠지면 TTS
  const missingVoice = C.normalizeEpisode(manifest(null, { voices: { dino: 'a/dino.wav' } }));
  ck('④-1 말하는 캐릭터 음성 파일이 하나라도 없으면 tts', missingVoice.episode.scenes[0].voiceMode === 'tts');
  ck('④-2 turn 모드는 음성 파일이 있어도 tts(시각이 안 맞는 음성은 못 쓴다)', overlap.episode.scenes[0].voiceMode === 'tts');

  // ⑤ 영상 원본 소리
  ck('⑤-1 videoAudio 를 밝히지 않으면 원본 소리는 끈다', s1 && s1.videoAudio === 'mute');
  const clean = C.normalizeEpisode(manifest(null, { videoAudio: 'clean' }));
  ck('⑤-2 «짝» — clean 이라고 밝히면 켠다', clean.episode.scenes[0].videoAudio === 'clean');
  const weird = C.normalizeEpisode(manifest(null, { videoAudio: 'yes' }));
  ck('⑤-3 모르는 값은 끈다', weird.episode.scenes[0].videoAudio === 'mute');

  // 매니페스트 문제 보고
  const bad = C.normalizeEpisode(manifest(null, { lines: [
    { speaker: 'ghost', en: 'Boo' }, { speaker: 'dino', en: '' }, { speaker: 'dino', en: 'Real' },
  ] }));
  ck('①-5 모르는 캐릭터·빈 대사는 버리고 문제로 알린다(남은 대사는 돈다)',
    bad.ok && bad.episode.scenes[0].lines.length === 1
    && bad.problems.some((p) => /unknown_speaker:ghost/.test(p)) && bad.problems.some((p) => /no_text/.test(p)), bad.problems);
  const none = C.normalizeEpisode({ characters: CHARS, scenes: [] });
  ck('①-6 장면이 없으면 ok=false', none.ok === false && none.problems.indexOf('no_scenes') >= 0);
  ck('①-7 객체가 아니면 ok=false', C.normalizeEpisode(null).ok === false && C.normalizeEpisode('x').ok === false);

  // 학생 명단
  const ep = n1.episode;
  ck('cast-1 학생 0명은 막는다', C.castProblems([], ep).indexOf('no_students') >= 0);
  const six = [0, 1, 2, 3, 4, 5].map((i) => ({ name: 'S' + i, character: 'dino' }));
  ck('cast-2 학생 6명은 막는다(최대 5명)', C.castProblems(six, ep).indexOf('too_many_students') >= 0);
  const five = six.slice(0, 5);
  ck('cast-3 «짝» — 5명은 된다', C.castProblems(five, ep).length === 0, C.castProblems(five, ep));
  ck('cast-4 캐릭터를 안 고른 학생은 막는다', C.castProblems([{ name: 'A', character: '' }], ep).length === 1);
  ck('cast-5 고를 수 없는 캐릭터(leo — playable 밖)는 막는다', C.castProblems([{ name: 'A', character: 'leo' }], ep).length === 1);
  ck('cast-6 MAX_STUDENTS 는 5', C.MAX_STUDENTS === 5);

  // ② 배정 · 음소거
  const sc = ep.scenes[0];
  const oneDino = C.assignLines(sc, [{ name: 'A', character: 'dino' }], {});
  ck('②-1 디노를 고르면 디노 대사는 학생', oneDino[0].performer.type === 'student' && oneDino[2].performer.type === 'student');
  ck('②-2 «짝» — 고르지 않은 미나 대사는 원어민 그대로', oneDino[1].performer.type === 'native');
  const muted = C.mutedCharacters([{ name: 'A', character: 'dino' }]);
  ck('②-3 끄는 목소리는 고른 캐릭터뿐', muted.dino === true && !muted.mina);
  const group = C.assignLines(sc, [{ name: 'A', character: 'dino' }, { name: 'B', character: 'mina' }], {});
  ck('②-4 두 명이 서로 다른 캐릭터를 고르면 각자 자기 대사', group[0].performer.idx === 0 && group[1].performer.idx === 1 && group[2].performer.idx === 0);
  const sameChar = C.assignLines(sc, [{ name: 'A', character: 'dino' }, { name: 'B', character: 'dino' }], {});
  ck('②-5 한 캐릭터를 두 명이 고르면 번갈아 맡는다', sameChar[0].performer.idx === 0 && sameChar[2].performer.idx === 1, sameChar.map((x) => x.performer));
  const ctr = {};
  C.assignLines(sc, [{ name: 'A', character: 'dino' }, { name: 'B', character: 'dino' }], ctr);
  const next = C.assignLines(sc, [{ name: 'A', character: 'dino' }, { name: 'B', character: 'dino' }], ctr);
  ck('②-6 장면을 넘어가도 차례가 이어진다(같은 학생만 말하지 않게)', next[0].performer.idx === 0 && ctr.dino === 4, ctr);
  const nobody = C.assignLines(sc, [], {});
  ck('②-7 아무도 안 고르면 전부 원어민', nobody.every((x) => x.performer.type === 'native'));

  // 녹음 시간
  const shortL = { en: 'Hi' }, longL = { en: Array(40).fill('word').join(' ') };
  ck('rec-1 차례 모드 녹음 시간은 4초 이상', C.recordWindowSec(shortL, 'turn') >= 4);
  ck('rec-2 차례 모드 녹음 시간은 12초 이하(Azure 15초 한도 안)', C.recordWindowSec(longL, 'turn') <= 12);
  ck('rec-3 동기 모드는 대사 길이 + 여유(1.5~14초)', C.recordWindowSec({ en: 'x', start: 1, end: 3 }, 'synced') === 3.2
    && C.recordWindowSec({ en: 'x', start: 0, end: 0.1 }, 'synced') === 1.5);

  // 화면에 띄울 대사
  ck('line-1 대사 구간 안이면 그 번호', C.lineIndexAt(sc.lines, 1.0) === 0 && C.lineIndexAt(sc.lines, 3.0) === 1);
  ck('line-2 아무 대사도 없는 구간은 -1', C.lineIndexAt(sc.lines, 10) === -1);

  // 요약
  const sum = C.summarize([
    { studentIdx: 0, score: { overall: 80 }, status: 'done' },
    { studentIdx: 0, score: { overall: 60 }, status: 'done' },
    { studentIdx: 0, score: null, status: 'skipped' },
    { studentIdx: 1, score: null, status: 'no_speech' },
  ], [{ name: 'A', character: 'dino' }, { name: 'B', character: 'mina' }]);
  ck('sum-1 학생별 평균은 채점된 줄만으로', sum[0].avg === 70 && sum[0].scored === 2 && sum[0].lines === 3, sum[0]);
  ck('sum-2 넘어감·소리 없음은 «건너뜀» 으로 따로 센다(0점으로 섞지 않는다)', sum[0].skipped === 1 && sum[1].avg === null && sum[1].skipped === 1, sum[1]);

  ck('tts-1 매니페스트 화자를 쓴다 · 없으면 기본값', C.ttsSpeakerFor(ep, 'dino') === 'aries' && C.ttsSpeakerFor(ep, 'nobody') === 'asteria');
  return fails;
}

console.log('🎬 ai_dubbing_harness');
const CORE = loadCore(CORE_SRC);
const baseFails = runChecks(CORE, true);

/* ⑥ 지금 실린 에피소드 */
console.log('\n── ⑥ dub-001.json');
let epRaw = null;
try { epRaw = JSON.parse(rd(EP_PATH)); } catch (e) { epRaw = null; }
check('⑥-1 dub-001.json 이 JSON 으로 읽힌다', !!epRaw);
if (epRaw) {
  const n = CORE.normalizeEpisode(epRaw, { baseUrl: '/data/dubbing/' });
  check('⑥-2 재생 가능(ok) · 문제 0', n.ok && n.problems.length === 0, n.problems);
  const sc = n.episode.scenes;
  check('⑥-3 6장면', sc.length === 6, sc.length);
  check('⑥-4 시각이 «provisional» 이라 전부 차례 모드 + TTS (40초 기준 시각을 15초 영상에 지어내 맞추지 않는다)',
    epRaw.timing !== 'synced' && sc.every((s) => s.timing === 'turn' && s.voiceMode === 'tts'));
  check('⑥-5 원본 영상 소리는 전부 끈다(생성기 목소리가 섞여 있음 — 실측)', sc.every((s) => s.videoAudio === 'mute'));
  check('⑥-6 영상 주소는 https 이고 장면마다 다르다', sc.every((s) => /^https:\/\//.test(s.video)) && new Set(sc.map((s) => s.video)).size === 6);
  check('⑥-7 장면마다 학생이 고를 수 있는 캐릭터의 대사가 있다(고를 게 없으면 학생은 할 일이 없다)',
    sc.every((s) => s.lines.some((l) => n.episode.playable.indexOf(l.speaker) >= 0)));
  check('⑥-8 영어 대사에 한글·한자가 없다', sc.every((s) => s.lines.every((l) => !/[가-힣ㄱ-ㅎ一-鿿]/.test(l.en))));
  check('⑥-9 상태는 «preview» — 완성본이라고 말하지 않는다', n.episode.status === 'preview');
  check('⑥-10 캐릭터마다 TTS 화자가 정해져 있다', Object.keys(n.episode.characters).every((k) => !!n.episode.characters[k].ttsSpeaker));
  // 미리보기 그림 — 표에 적어 놓고 파일을 커밋에 안 담으면 화면은 «조용히» 이모지로 떨어진다(CLAUDE.md 아바타 얼굴 건과 같은 뿌리)
  const thumbs = sc.map((s) => s.thumb);
  check('⑥-11 장면마다 미리보기 그림 주소가 있고 서로 다르다', thumbs.every((t) => /^\/img\/dubbing\/[a-z0-9-]+\.webp(\?v=\d+)?$/.test(t)) && new Set(thumbs).size === sc.length, thumbs);
  const thumbFiles = thumbs.map((t) => join(PUB, t.replace(/^\//, '').replace(/\?.*$/, '')));
  check('⑥-12 미리보기 그림 파일이 저장소에 실제로 있다', thumbFiles.every((f) => existsSync(f)), thumbFiles.filter((f) => !existsSync(f)));
  check('⑥-13 미리보기 그림은 장당 100KB 이하(카드 6장이 첫 화면에 함께 뜬다)', thumbFiles.every((f) => !existsSync(f) || statSync(f).size <= 100 * 1024),
    thumbFiles.map((f) => existsSync(f) ? statSync(f).size : -1));
}

/* ⑦ 화면 배선 */
console.log('\n── ⑦ 화면 배선');
const html = rd(HTML_PATH), player = rd(PLAYER_PATH);
const stripJs = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const playerCode = stripJs(player);
const iCore = html.indexOf('/js/ai-dubbing-core.js?v='), iPlayer = html.indexOf('/js/ai-dubbing.js?v=');
check('⑦-1 화면이 정본과 플레이어를 «버전을 달고» 싣는다', iCore > 0 && iPlayer > 0);
check('⑦-2 정본이 플레이어보다 먼저 실린다(defer 는 순서대로 돈다)', iCore > 0 && iPlayer > iCore);
check('⑦-3 플레이어는 정본(MangoiDubCore)을 부른다', /MangoiDubCore/.test(playerCode));
check('⑦-4 플레이어가 배정 판정을 복제하지 않는다(byChar·counters 조립 금지)', !/byChar/.test(playerCode) && /C\.assignLines\(/.test(playerCode));
check('⑦-5 전사(/api/voice/transcribe)에 prompt 를 보내지 않는다', /\/api\/voice\/transcribe/.test(playerCode) && !/append\(\s*['"]prompt['"]/.test(playerCode));
check('⑦-6 넘어간 줄은 채점하지 않는다(skipped 갈래가 enqueueScore 보다 앞)', (() => {
  const i = playerCode.indexOf("res.status = 'skipped'"), j = playerCode.indexOf('enqueueScore(res, r.blob)');
  return i > 0 && j > i;
})());
check('⑦-7 원어민 대체 음성(다른 화자)은 캐시하지 않는다', /sameVoice/.test(playerCode) && /X-TTS-Speaker/.test(playerCode));
check('⑦-8 마이크는 스피커로 보내지 않는다(되울림) — 녹화용으로만', /mic\.gain\.connect\(MIX\.rec\)/.test(playerCode) && !/mic\.gain\.connect\(MIX\.out\)/.test(playerCode) && !/mic\.src\.connect\(MIX\.out\)/.test(playerCode));
check('⑦-9 영상 원본 소리는 정본 판정(videoAudio)으로만 켠다', /setVideoAudio\(v, sc\.videoAudio === 'clean'\)/.test(playerCode));
check('⑦-10 에피소드 이름은 정해진 글자만 받는다(경로 조작 차단)', /EP_ID_RE/.test(playerCode) && /\^\[a-z0-9-\]\{1,40\}\$/.test(player));
check('⑦-11 한자 글꼴 CSS 를 싣는다', /\/css\/mangoi-han\.css/.test(html));
const styleBlocks = (html.match(/<style[\s\S]*?<\/style>/g) || []).join('\n');
check('⑦-12 <style> 안에 CJK 홑낫표가 없다', !/[「」]/.test(styleBlocks));
check('⑦-13 화면에 보이는 글자에 CJK 홑낫표가 없다', !/[「」]/.test(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '')));
check('⑦-14 사이트 구성표에 화면이 있다', /ai-dubbing\.html/.test(rd(join(PUB, 'admin', 'site-structure-map.html'))));
for (const f of ['js/ai-dubbing-core.js', 'js/ai-dubbing.js', 'data/dubbing/dub-001.json']) check('⑦-15 파일 실재: ' + f, existsSync(join(PUB, f)));
/* 장면 카드 미리보기 그림 — renderScenes 몸통을 중괄호 짝으로 잘라 그 안에서 묻는다(파일 전체로 물으면 딴 함수에 걸린다) */
const rsBody = (() => {
  const i = playerCode.indexOf('function renderScenes(');
  if (i < 0) return '';
  const o = playerCode.indexOf('{', i);
  let d = 0;
  for (let k = o; k < playerCode.length; k++) {
    if (playerCode[k] === '{') d++;
    else if (playerCode[k] === '}') { d--; if (d === 0) return playerCode.slice(o, k + 1); }
  }
  return '';
})();
check('⑦-16 전제: renderScenes 몸통을 잘라 냈다', rsBody.length > 200, rsBody.length);
check('⑦-17 미리보기 그림은 thumb 가 «있을 때만» 그린다(없으면 예전 이모지 카드)', /sc\.thumb\s*\?\s*'<img /.test(rsBody) && /sc\.thumb\s*\?\s*' img'\s*:\s*''/.test(rsBody));
check('⑦-18 그림 주소는 이스케이프해서 넣는다', /src="'\s*\+\s*esc\(sc\.thumb\)/.test(rsBody));
check('⑦-19 그림을 못 받으면(error) 그림을 걷고 이모지 카드로 되돌린다', /addEventListener\('error'/.test(rsBody) && /classList\.remove\('img'\)/.test(rsBody));
check('⑦-20 CSS — 그림 카드 규칙이 있다(꽉 채움 · 칩)', /\.thumb\.img img\{[^}]*object-fit:cover/.test(html) && /\.thumb\.img \.who\{/.test(html));

/* ⑧ 변이시험 */
console.log('\n── ⑧ 변이시험 (원본 0건이어야 한다 — 전제)');
check('⑧-0 원본 정본은 검사를 전부 통과한다(전제)', baseFails.length === 0, baseFails);
const MUTANTS = [
  ['배정: 언제나 학생', "if (!who || !who.length) return { line: l, performer: { type: 'native' } };", "if (!who || !who.length) return { line: l, performer: { type: 'student', idx: 0 } };"],
  ['배정: 번갈아 맡기 제거', 'idx: who[k % who.length]', 'idx: who[0]'],
  ['시각: 겹침 검사 제거', 'if (l.start < prevEnd - 0.05) return false;', ''],
  ['시각: 길이 검사 제거', 'if (sc.durationSec != null && l.end > sc.durationSec + 0.05) return false;', ''],
  ['시각: 밝히지 않아도 synced', "trim(raw.timing).toLowerCase() === 'synced' ? 'synced' : 'provisional'", "'synced'"],
  ['음성: 하나만 있어도 stems', 'return Object.keys(need).every(function (k) { return !!sc.voices[k]; });', 'return Object.keys(need).some(function (k) { return !!sc.voices[k]; });'],
  ['영상 소리: 언제나 켬', "trim(s.videoAudio).toLowerCase() === 'clean' ? 'clean' : 'mute'", "'clean'"],
  ['명단: 상한 제거', 'else if (cast.length > MAX_STUDENTS) out.push(\'too_many_students\');', ''],
  ['요약: 건너뜀을 안 셈', "else if (r.status === 'no_speech' || r.status === 'skipped') s.skipped += 1;", ''],
  ['녹음: 상한 제거', 'return Math.min(12, Math.max(4,', 'return Math.min(99, Math.max(4,'],
  ['미리보기: thumb 버림', 'thumb: resolveUrl(s.thumb, baseUrl),', "thumb: '',"],
  ['미리보기: baseUrl 무시', 'thumb: resolveUrl(s.thumb, baseUrl),', 'thumb: String(s.thumb || \'\'),'],
];
for (const [name, from, to] of MUTANTS) {
  if (CORE_SRC.indexOf(from) < 0) { check('⑧ 변이 «' + name + '» — 치환 앵커가 소스에 있다', false, from.slice(0, 60)); continue; }
  let fails;
  try { fails = runChecks(loadCore(CORE_SRC.replace(from, to)), false); }
  catch (e) { fails = ['crash:' + String(e && e.message).slice(0, 60)]; }
  check('⑧ 변이 «' + name + '» 를 넣으면 실제로 FAIL 이 난다', fails.length > 0, fails.length ? fails.slice(0, 2) : '안 잡힘');
}

console.log(`\n🎬 ai_dubbing_harness — PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
