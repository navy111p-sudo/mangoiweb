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
//     ⑥ 지금 실린 dub-001.json 이 실제로 돈다(6장면 · 차례 모드 · 영상은 우리 서버 파일이 실재)
//        + 대사 규격(2026-10-20 GPT 2편 기준): 36줄 · 장면마다 캐릭터당 2줄 이상 · 3~8단어 · 1/2/3역 선택
//        + 캐릭터 목소리가 서로 다르다(서버가 Aura-1 로 떨어져도) · 이야기 목록(index.json)
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
const CORE_SRC = rd(CORE_PATH);
const PLAYER_SRC_RAW = process.env.PLAYER_SRC ? rd(process.env.PLAYER_SRC) : rd(PLAYER_PATH);

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

  // 이야기 목록(1·2·3편)
  const idx = C.normalizeIndex({ episodes: [
    { id: 'dub-003', no: 3, title: { ko: '셋' }, status: 'coming' },
    { id: 'dub-001', no: 1, title: { ko: '하나', en: 'One' }, status: 'ready' },
    { id: 'dub-002', no: 2, status: 'maybe' },
    { id: 'dub-001', no: 9, status: 'ready' },
    { id: '../x', no: 4, status: 'ready' },
  ] });
  ck('idx-1 번호 순서로 정렬 · 같은 id 는 한 번 · 이상한 id 는 버린다', idx.map((e) => e.id).join() === 'dub-001,dub-002,dub-003', idx.map((e) => e.id));
  ck('idx-2 모르는 status 는 «준비 중»(못 여는 쪽)', idx[1] && idx[1].status === 'coming');
  ck('idx-3 «짝» — ready 는 연다', idx[0] && idx[0].status === 'ready');
  ck('idx-4 목록이 아니면 빈 배열', Array.isArray(C.normalizeIndex(null)) && C.normalizeIndex(null).length === 0);
  return fails;
}

console.log('🎬 ai_dubbing_harness');
const CORE = loadCore(CORE_SRC);
const baseFails = runChecks(CORE, true);

/* ⑥ 지금 실린 에피소드 — index.json 에서 ready 인 편을 «전부» 같은 규격으로 본다(1편·3편 …).
   ⛔ 편 이름을 여기 손으로 늘어놓지 않는다 — 새 편을 ready 로 바꾸는 순간 저절로 같은 검사를 받는다.
   시각이 provisional 인 편에만 «차례 모드·preview» 를 묻는다(나중에 완성본(synced)이 와도 거짓 FAIL 이 안 나게). */
let readyIds = [];
try { readyIds = CORE.normalizeIndex(JSON.parse(rd(join(PUB, 'data', 'dubbing', 'index.json')))).filter((e) => e.status === 'ready').map((e) => e.id); } catch (e) { readyIds = []; }
check('⑥-0 전제 — 목록에서 ready 인 편을 읽었고 1편·3편이 들어 있다', readyIds.indexOf('dub-001') >= 0 && readyIds.indexOf('dub-003') >= 0, readyIds);
let checkedEps = 0;
for (const epId of readyIds) {
  if (!/^[a-z0-9-]+$/.test(epId)) continue;
  const P = epId + ' ';
  console.log('\n── ⑥ ' + epId + '.json');
  let epRaw = null;
  try { epRaw = JSON.parse(rd(join(PUB, 'data', 'dubbing', epId + '.json'))); } catch (e) { epRaw = null; }
  check('⑥-1 ' + P + 'JSON 으로 읽힌다', !!epRaw);
  if (!epRaw) continue;
  checkedEps++;
  const n = CORE.normalizeEpisode(epRaw, { baseUrl: '/data/dubbing/' });
  check('⑥-2 ' + P + '재생 가능(ok) · 문제 0', n.ok && n.problems.length === 0, n.problems);
  const sc = n.episode.scenes;
  check('⑥-3 ' + P + '6장면', sc.length === 6, sc.length);
  if (epRaw.timing !== 'synced') {
    check('⑥-4 ' + P + '시각이 «provisional» 이라 전부 차례 모드 + TTS (없는 시각을 지어내 맞추지 않는다)',
      sc.every((s) => s.timing === 'turn' && s.voiceMode === 'tts'));
    check('⑥-9 ' + P + '상태는 «preview» — 완성본이라고 말하지 않는다', n.episode.status === 'preview');
  }
  check('⑥-5 ' + P + 'AI 목소리(tts)로 내는 장면은 원본 영상 소리를 끈다(생성기 목소리가 섞임)', sc.every((s) => s.voiceMode !== 'tts' || s.videoAudio === 'mute'));
  /* 영상·대표 그림은 우리 서버 파일 — 남의 CDN 주소는 만료되면 사라지고(중국 회선도 막힘) 완성 영상 캔버스를 «오염» 시킨다 */
  /* ?v=N 은 «같은 이름으로 갈아 끼운 영상» 의 캐시 우회(미디어 7일 캐시) — 파일을 찾을 때는 뗀다 */
  const local = (u) => join(PUB, String(u || '').replace(/[?#].*$/, '').replace(/^\/+/, ''));
  const mediaRe = new RegExp('^/media/dubbing/' + epId + '/[a-z0-9-]+\\.mp4(\\?v=\\d+)?$');
  check('⑥-6 ' + P + '영상은 우리 서버 경로(/media/dubbing/' + epId + '/)이고 장면마다 다르다',
    sc.every((s) => mediaRe.test(s.video)) && new Set(sc.map((s) => s.video)).size === 6, sc.map((s) => s.video));
  check('⑥-6b ' + P + '영상 파일이 저장소에 실재하고 25MiB 미만(Workers 정적자산 한도)',
    sc.every((s) => existsSync(local(s.video)) && statSync(local(s.video)).size < 25 * 1024 * 1024));
  check('⑥-6c ' + P + '장면 대표 그림이 실재한다', sc.every((s) => s.poster && existsSync(local(s.poster))), sc.map((s) => s.poster));
  check('⑥-6d ' + P + '매니페스트에 남의 CDN 주소가 없다', !/cloudfront\.net|higgsfield/i.test(JSON.stringify(epRaw)));
  check('⑥-7 ' + P + '장면마다 학생이 고를 수 있는 캐릭터의 대사가 있다(고를 게 없으면 학생은 할 일이 없다)',
    sc.every((s) => s.lines.some((l) => n.episode.playable.indexOf(l.speaker) >= 0)));
  check('⑥-8 ' + P + '영어 대사에 한글·한자가 없다', sc.every((s) => s.lines.every((l) => !/[가-힣ㄱ-ㅎ一-鿿]/.test(l.en))));
  check('⑥-10 ' + P + '캐릭터마다 TTS 화자가 정해져 있다', Object.keys(n.episode.characters).every((k) => !!n.episode.characters[k].ttsSpeaker));

  /* 대사 규격 — 짧은 영어(3~8단어) · 장면마다 캐릭터당 2줄 이상 · 1/2/3역 선택 */
  const allLines = sc.reduce((a, s) => a.concat(s.lines), []);
  const words = (t) => (t.match(/[A-Za-z']+/g) || []).length;
  check('⑥-11 ' + P + '대사는 36줄', allLines.length === 36, allLines.length);
  check('⑥-12 ' + P + '모든 대사가 3~8단어', allLines.every((l) => words(l.en) >= 3 && words(l.en) <= 8), allLines.filter((l) => words(l.en) < 3 || words(l.en) > 8).map((l) => l.id));
  check('⑥-13 ' + P + '고를 수 있는 캐릭터는 3명 — 1·2·3명이 역을 나눌 수 있다', n.episode.playable.length === 3);
  check('⑥-14 ' + P + '장면마다 고를 수 있는 캐릭터가 «각각» 2줄 이상 말한다(어느 역을 골라도 할 일이 있다)',
    sc.every((s) => n.episode.playable.every((cid) => s.lines.filter((l) => l.speaker === cid).length >= 2)));
  check('⑥-15 ' + P + '대사마다 한국어 뜻이 있다', allLines.every((l) => !!l.ko));
  check('⑥-15b ' + P + '대사 id 가 겹치지 않는다', new Set(allLines.map((l) => l.id)).size === allLines.length);

  /* 캐릭터 목소리는 서로 달라야 한다 — 서버가 Aura-2 → Aura-1 로 떨어져도(그 표를 소스에서 읽는다) */
  const games = rd(join(ROOT, 'cloudflare-deploy', 'src', 'api-games.ts'));
  const a1m = /const AURA1 = new Set\(\[([^\]]+)\]\)/.exec(games);
  const a2m = /const AURA2 = new Set\(\[([^\]]+)\]\)/.exec(games);
  const subm = /const AURA1_SUB[^{]*\{([\s\S]*?)\};/.exec(games);
  const maleM = /const AURA2_MALE = new Set\(\[([^\]]+)\]\)/.exec(games);
  check('⑥-16 ' + P + '전제 — 서버의 목소리 표를 읽었다', !!(a1m && a2m && subm && maleM));
  if (a1m && a2m && subm && maleM) {
    const A1 = new Set(a1m[1].match(/[a-z]+/g));
    const A2 = new Set(a2m[1].match(/[a-z]+/g));
    const MALE = new Set(maleM[1].match(/[a-z]+/g));
    const SUB = {};
    subm[1].replace(/\/\/[^\n]*/g, '').replace(/([a-z]+)\s*:\s*'([a-z]+)'/g, (_, k, v) => { SUB[k] = v; return ''; });
    const fb = (spk) => (A1.has(spk) ? spk : (SUB[spk] || (MALE.has(spk) ? 'orion' : 'luna')));
    const spk = Object.keys(n.episode.characters).map((k) => n.episode.characters[k].ttsSpeaker);
    /* 서버는 목록 밖 이름을 «asteria»(여자 기본값)로 바꾼다 — 그러면 남자아이도 여자 목소리가 된다 */
    check('⑥-16b ' + P + '화자 이름이 서버의 Aura-2 목록에 있다(밖이면 asteria 로 바뀜)', spk.every((x) => A2.has(x)), spk.filter((x) => !A2.has(x)));
    check('⑥-17 ' + P + '캐릭터 목소리가 서로 다르다', new Set(spk).size === spk.length, spk);
    check('⑥-18 ' + P + 'Aura-1 로 떨어져도 서로 다르다', new Set(spk.map(fb)).size === spk.length, spk.map(fb));
  }
}
check('⑥-z 전제 — 실제로 2편 이상을 검사했다(목록이 비어 검사가 통째로 사라지지 않게)', checkedEps >= 2, checkedEps);

/* 이야기 목록 — 준비된 편은 매니페스트가 실재해야 한다(눌렀는데 빈 화면 금지) */
console.log('\n── ⑥-b 이야기 목록(index.json)');
let idxRaw = null;
try { idxRaw = JSON.parse(rd(join(PUB, 'data', 'dubbing', 'index.json'))); } catch (e) { idxRaw = null; }
check('⑥-b1 index.json 이 JSON 으로 읽힌다', !!idxRaw);
if (idxRaw) {
  const eps = CORE.normalizeIndex(idxRaw);
  check('⑥-b2 1·2·3편이 있고 번호가 1부터 이어진다', eps.length >= 3 && eps.every((e, i) => e.no === i + 1), eps.map((e) => e.no));
  check('⑥-b3 준비된(ready) 편은 매니페스트가 실재하고 «재생 가능»', eps.filter((e) => e.status === 'ready').every((e) => {
    try { return CORE.normalizeEpisode(JSON.parse(rd(join(PUB, 'data', 'dubbing', e.id + '.json')))).ok; } catch (er) { return false; }
  }));
  check('⑥-b4 1편(dub-001)은 ready', eps.some((e) => e.id === 'dub-001' && e.status === 'ready'));
  check('⑥-b5 대표 그림이 있으면 실재한다', eps.every((e) => !e.poster || existsSync(join(PUB, e.poster.replace(/^\/+/, '')))));
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
for (const f of ['js/ai-dubbing-core.js', 'js/ai-dubbing.js', 'data/dubbing/dub-001.json', 'data/dubbing/dub-003.json', 'data/dubbing/index.json']) check('⑦-15 파일 실재: ' + f, existsSync(join(PUB, f)));
/* 👂 먼저 들어 보기 — 그 소리는 완성 영상에 넣지 않는다(학생 목소리만 남아야 한다) */
const lfBody = (() => { const i = playerCode.indexOf('function listenFirst('); if (i < 0) return ''; const j = playerCode.indexOf('function studentTurn(', i); return j > i ? playerCode.slice(i, j) : ''; })();
check('⑦-16 «먼저 들어 보기» 함수가 있고 옵션으로 켜고 끈다', !!lfBody && /if \(!run\.listenFirst\) return/.test(lfBody) && /listenFirst: !!\(\$\('dub-listen-first'\)/.test(playerCode));
check('⑦-17 «먼저 들어 보기» 소리는 녹화 갈래에 안 잇는다(noRec) + 그동안 녹화를 멈춘다(실제 동작은 ⑨에서 돌려 본다)', /speakNative\(run, it\.line, true\b/.test(lfBody) && /pauseMovie\(run\.movie, true\)/.test(lfBody) && /pauseMovie\(run\.movie, false\)/.test(lfBody) && /if \(MIX\.rec && !noRec\) g\.connect\(MIX\.rec\)/.test(playerCode));
check('⑦-18 «짝» — 원어민 차례(학생이 안 고른 캐릭터)는 완성 영상에 담긴다(noRec 없이 부른다)', /p = speakNative\(run, it\.line\)\.then/.test(playerCode));
check('⑦-19 학생 차례는 «먼저 들어 보기» 를 지난 뒤 녹음한다', (() => { const i = playerCode.indexOf('return listenFirst(run, it)'), j = playerCode.indexOf('var cap = startCapture(run);'); return i > 0 && j > i; })());
check('⑦-20 화면에 «먼저 들어 보기» 칸과 «이야기 고르기» 칸이 있다', /id="dub-listen-first"/.test(html) && /id="dub-eps"/.test(html) && /id="dub-eps-panel"/.test(html));
check('⑦-21 이야기 목록은 정본(normalizeIndex)으로 읽는다 · 준비 중인 편은 링크가 아니다', /C\.normalizeIndex\(/.test(playerCode) && /if \(ready && !on\) h \+= '<a class="ep"/.test(playerCode));
check('⑦-22 미리보기 안내는 매니페스트가 밝힌 글(note)을 쓴다 — «영상과 대사가 안 맞아요» 를 고정으로 말하지 않는다', !/영상과 대사가 아직 안 맞아요/.test(playerCode) && /S\.ep\.note\.ko/.test(playerCode));

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
  ['목록: 모르는 status 도 ready', "status: trim(e.status).toLowerCase() === 'ready' ? 'ready' : 'coming',", "status: trim(e.status).toLowerCase() === 'coming' ? 'coming' : 'ready',"],
  ['목록: 중복 허용', "if (!/^[a-z0-9-]{1,40}$/.test(id) || seen[id]) return;", "if (!/^[a-z0-9-]{1,40}$/.test(id)) return;"],
];
for (const [name, from, to] of MUTANTS) {
  if (CORE_SRC.indexOf(from) < 0) { check('⑧ 변이 «' + name + '» — 치환 앵커가 소스에 있다', false, from.slice(0, 60)); continue; }
  let fails;
  try { fails = runChecks(loadCore(CORE_SRC.replace(from, to)), false); }
  catch (e) { fails = ['crash:' + String(e && e.message).slice(0, 60)]; }
  check('⑧ 변이 «' + name + '» 를 넣으면 실제로 FAIL 이 난다', fails.length > 0, fails.length ? fails.slice(0, 2) : '안 잡힘');
}


/* ⑨ 플레이어 «먼저 들어 보기» 를 실제로 돌려 본다 — 글자가 있는가가 아니라 무슨 일이 일어나는가.
 *    (⑦ 은 글자만 본다. `if (false && …)` 한 글자나 짝 하나 지우기에 뚫리므로 여기서 함수를 오려 내 돌린다) */
console.log('\n── ⑨ 플레이어 «먼저 들어 보기» 실제 실행');
/* 함수 하나를 «중괄호 짝» 으로 오려 낸다 — 문자열·주석 안의 중괄호는 건너뛴다 */
function cutFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const open = src.indexOf('{', src.indexOf(')', i));
  let d = 0, k = open, q = null;
  for (; k < src.length; k++) {
    const c = src[k], n = src[k + 1];
    if (q) { if (c === '\\') { k++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && n === '*') { k = src.indexOf('*/', k + 2) + 1; continue; }
    if (c === '/' && n === '/') { k = src.indexOf('\n', k); continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}
async function runPlayerChecks(src, verbose) {
  const fails = [];
  const t = (name, ok, extra) => { if (!ok) fails.push(name); if (verbose) check(name, ok, extra); };
  const make = (names, body, ret) => { try { return new Function(...names, body + '\n;return ' + ret + ';'); } catch (e) { return null; } };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  /* 변이가 «끝나지 않는 약속» 을 만들면 하니스가 멈춘다 — 300ms 로 자른다(그것도 FAIL 로 센다) */
  const within = (p, ms) => Promise.race([Promise.resolve(p).then(() => 'ok'), new Promise((r) => setTimeout(() => r('timeout'), ms || 300))]);
  /* A. listenFirst */
  const lfSrc = cutFn(src, 'listenFirst');
  t('⑨-0 listenFirst 를 오려 냈다(전제)', !!lfSrc);
  const mkLF = make(['speakNative', 'pauseMovie', 'setButtons', 'setTurn', 'T', 'sleep'], lfSrc, 'listenFirst');
  if (mkLF) {
    try {
      const log = []; let resolveSpeak = null, gotCancelled = null, gotNoRec = null;
      const speak = (run, line, noRec, cancelled) => { log.push('speak'); gotNoRec = noRec; gotCancelled = cancelled; return new Promise((r) => { resolveSpeak = r; }); };
      const pause = (mv, on) => log.push('pause:' + on);
      const LF = mkLF(speak, pause, () => {}, () => {}, (a) => a, () => Promise.resolve());
      const off = { listenFirst: false, wakers: [], movie: {} };
      const w0 = await within(LF(off, { line: { en: 'Hi there friend', speaker: 'rex' } }));
      t('⑨-1 «먼저 들어 보기» 를 끄면 원어민 소리를 안 낸다(짝)', w0 === 'ok' && log.length === 0, [w0, log]);
      log.length = 0;
      const run = { listenFirst: true, wakers: [], movie: {} };
      const p = LF(run, { line: { en: 'Hi there friend', speaker: 'rex' } });
      await tick();
      t('⑨-2 켜면 원어민 소리를 낸다', log.includes('speak'), log);
      t('⑨-3 소리 «앞에서» 녹화를 멈춘다', log.indexOf('pause:true') >= 0 && log.indexOf('pause:true') < log.indexOf('speak'), log);
      t('⑨-4 그 소리는 녹화 갈래에 안 잇는다(noRec=true)', gotNoRec === true, gotNoRec);
      t('⑨-5 받는 사이 «넘어가기» 전에는 취소가 아니다', typeof gotCancelled === 'function' && gotCancelled() === false);
      if (run.skipNow) run.skipNow();
      t('⑨-6 받는 사이 «넘어가기» 를 누르면 취소로 본다(받은 뒤 재생 안 함)', typeof gotCancelled === 'function' && gotCancelled() === true);
      if (resolveSpeak) resolveSpeak();
      await within(p);
      t('⑨-7 듣기가 끝나면 녹화를 «다시» 켠다(짝 — 안 켜면 완성 영상이 그 뒤로 빈다)', log.indexOf('pause:false') > log.indexOf('speak'), log);
    } catch (e) { t('⑨-1~7 listenFirst 실행', false, String(e && e.message)); }
  } else t('⑨-1~7 listenFirst 를 함수로 만들 수 있다', false);
  /* B. speakNative — 받는 사이 취소면 재생 안 함 · noRec 을 기기 목소리에도 넘김 */
  const snSrc = cutFn(src, 'speakNative');
  const mkSN = make(['getTts', 'playUrl', 'speakDevice', 'C', 'S'], snSrc, 'speakNative');
  if (mkSN) {
    try {
      const calls = [];
      const SN = (url) => mkSN(() => Promise.resolve(url), (r, u, ms, noRec) => { calls.push(['play', noRec]); return Promise.resolve(); },
        (r, txt, ms, noRec) => { calls.push(['device', noRec]); return Promise.resolve(); }, { ttsSpeakerFor: () => 'arcas' }, { ep: {} });
      const line = { en: 'Yes my name is Rex', speaker: 'rex' };
      await within(SN('blob:x')({ wakers: [] }, line, true, () => true));
      t('⑨-8 받는 사이 취소됐으면 받은 소리를 재생하지 않는다', calls.length === 0, calls);
      calls.length = 0; await within(SN('blob:x')({ wakers: [] }, line, true, () => false));
      t('⑨-9 취소가 아니면 재생하고 noRec 을 넘긴다', calls.length === 1 && calls[0][0] === 'play' && calls[0][1] === true, calls);
      calls.length = 0; await within(SN(null)({ wakers: [] }, line, true));
      t('⑨-10 TTS 실패로 기기 목소리를 써도 noRec 을 넘긴다', calls.length === 1 && calls[0][0] === 'device' && calls[0][1] === true, calls);
    } catch (e) { t('⑨-8~10 speakNative 실행', false, String(e && e.message)); }
  } else t('⑨-8~10 speakNative 를 함수로 만들 수 있다', false);
  /* C. speakDevice — 듣기용이면 «담기지 않았어요» 표시를 안 남긴다(짝: 원어민 차례는 남긴다) */
  const sdSrc = cutFn(src, 'speakDevice');
  const fakeSS = { speak: (u) => setTimeout(() => u.onend && u.onend(), 0), cancel: () => {} };
  function FakeUtt(x) { this.text = x; }
  const mkSD = make(['window', 'speechSynthesis', 'SpeechSynthesisUtterance'], sdSrc, 'speakDevice');
  if (mkSD) {
    try {
      const SD = mkSD({ speechSynthesis: fakeSS, SpeechSynthesisUtterance: FakeUtt }, fakeSS, FakeUtt);
      const r1 = { wakers: [] }; await within(SD(r1, 'Hi', 3000, true));
      t('⑨-11 듣기용 기기 목소리는 «완성 영상에 안 담겼어요» 표시를 남기지 않는다', !r1.deviceVoiceUsed);
      const r2 = { wakers: [] }; await within(SD(r2, 'Hi', 3000));
      t('⑨-12 «짝» — 원어민 차례의 기기 목소리는 그 표시를 남긴다', r2.deviceVoiceUsed === true);
    } catch (e) { t('⑨-11~12 speakDevice 실행', false, String(e && e.message)); }
  } else t('⑨-11~12 speakDevice 를 함수로 만들 수 있다', false);
  /* D. pauseMovie — 시작 전이면 «멈춰 둬야 함» 만 적는다 · 녹화 중이면 멈추고 다시 켠다 */
  const pmSrc = cutFn(src, 'pauseMovie');
  const mkPM = make([], pmSrc, 'pauseMovie');
  if (mkPM) {
    try {
      const PM = mkPM();
      const rec = { state: 'recording', pause() { this.state = 'paused'; }, resume() { this.state = 'recording'; } };
      const mv = { rec };
      PM(mv, true);
      t('⑨-13 녹화 중이면 멈춘다', rec.state === 'paused' && mv.held === true, [rec.state, mv.held]);
      PM(mv, false);
      t('⑨-14 듣기가 끝나면 다시 녹화한다', rec.state === 'recording' && mv.held === false, [rec.state, mv.held]);
      const mv2 = { rec: { state: 'inactive', pause() { this.state = 'paused'; }, resume() {} } };
      PM(mv2, true);
      t('⑨-15 녹화가 아직 시작 전이면 «멈춰 둬야 함» 을 적어 둔다(늦게 시작해도 바로 멈추게)', mv2.held === true && mv2.rec.state === 'inactive');
    } catch (e) { t('⑨-13~15 pauseMovie 실행', false, String(e && e.message)); }
  } else t('⑨-13~15 pauseMovie 를 함수로 만들 수 있다', false);
  t('⑨-16 녹화가 늦게 시작되면 «멈춰 둬야 함» 을 보고 곧바로 멈춘다', /mv\.rec\.start\(1000\); if \(mv\.held\) mv\.rec\.pause\(\);/.test(stripJs(src)));
  /* E. prefetchScene — 듣기가 켜져 있으면 학생 대사도 미리 받는다(받는 사이 멈춤·넘어가기 무반응을 줄인다) */
  const pfSrc = cutFn(src, 'prefetchScene');
  const mkPF = make(['C', 'S', 'getTts'], pfSrc, 'prefetchScene');
  if (mkPF) {
    try {
      const got = [];
      const PF = mkPF({ mutedCharacters: () => ({ rex: true }), ttsSpeakerFor: () => 'x' }, { cast: [], ep: {} }, (txt) => got.push(txt));
      const sc = { lines: [{ en: 'Native line', speaker: 'jun' }, { en: 'Student line', speaker: 'rex' }] };
      PF(sc, false);
      t('⑨-17 «짝» — 듣기를 끄면 학생 대사는 미리 받지 않는다', got.join('|') === 'Native line', got);
      got.length = 0; PF(sc, true);
      t('⑨-18 듣기가 켜져 있으면 학생 대사도 미리 받는다', got.includes('Student line') && got.includes('Native line'), got);
    } catch (e) { t('⑨-17~18 prefetchScene 실행', false, String(e && e.message)); }
  } else t('⑨-17~18 prefetchScene 을 함수로 만들 수 있다', false);
  t('⑨-19 장면을 시작할 때 «먼저 들어 보기» 설정으로 미리 받는다', /prefetchScene\(sc, run\.listenFirst\)/.test(stripJs(src)));
  /* F. renderEpisodes — 준비 중인 편을 주소로 직접 열어도 «지금 이 이야기» 라고 하지 않는다 */
  const reSrc = cutFn(src, 'renderEpisodes');
  const mkRE = make(['$', 'episodeId', 'L', 'esc'], reSrc, 'renderEpisodes');
  if (mkRE) {
    try {
      const box = { innerHTML: '' }, panel = { hidden: true };
      const list = [{ id: 'dub-001', no: 1, status: 'ready', title: { ko: '하나', en: 'One' } }, { id: 'dub-002', no: 2, status: 'coming', title: { ko: '둘', en: 'Two' } }];
      const RE = (cur) => mkRE((id) => (id === 'dub-eps' ? box : id === 'dub-eps-panel' ? panel : null), () => cur, (ko) => ko, (x) => String(x));
      RE('dub-002')(list);
      const cards = (h) => h.split(/<(?:a|div) class="ep/);
      const two = cards(box.innerHTML).find((x) => x.includes('둘')) || '';
      t('⑨-20 준비 중인 편을 직접 열어도 그 칸은 «준비 중»(지금 이 이야기 아님)', !/지금 이 이야기/.test(two) && /준비 중/.test(two), two.slice(0, 120));
      RE('dub-001')(list);
      const one = cards(box.innerHTML).find((x) => x.includes('하나')) || '';
      t('⑨-21 «짝» — 준비된 지금 편은 «지금 이 이야기» 로 표시한다', /지금 이 이야기/.test(one), one.slice(0, 120));
    } catch (e) { t('⑨-20~21 renderEpisodes 실행', false, String(e && e.message)); }
  } else t('⑨-20~21 renderEpisodes 를 함수로 만들 수 있다', false);
  return fails;
}
const playerFails0 = await runPlayerChecks(PLAYER_SRC_RAW, true);
check('⑨-v0 원본 플레이어는 ⑨ 를 전부 통과한다(전제)', playerFails0.length === 0, playerFails0);
const PLAYER_MUTANTS = [
  ['듣기: 조건 뒤집기', 'if (!run.listenFirst) return Promise.resolve();', 'if (run.listenFirst) return Promise.resolve();'],
  ['듣기: 녹화 다시 켜기 빠짐', '      run.skipNow = null;\n      pauseMovie(run.movie, false);', '      run.skipNow = null;'],
  ['듣기: noRec 빼기', 'speakNative(run, it.line, true, function', 'speakNative(run, it.line, false, function'],
  ['듣기: 넘어가기 표시 안 함', 'run.skipNow = function () { skipped = true;', 'run.skipNow = function () {'],
  ['넘어가기: 받는 중 취소 무시', 'if (run.aborted || (cancelled && cancelled())) return;', 'if (run.aborted) return;'],
  ['기기 목소리: 듣기에도 «안 담겼어요»', 'if (!noRec) run.deviceVoiceUsed = true;', 'run.deviceVoiceUsed = true;'],
  ['기기 목소리: noRec 안 넘김', 'speakDevice(run, line.en, maxMs, noRec)', 'speakDevice(run, line.en, maxMs)'],
  ['녹화: held 안 적음', 'mv.held = !!on;', ''],
  ['미리 받기: 학생 줄 안 받음', 'withStudents || !muted[l.speaker]', '!muted[l.speaker]'],
  ['목록: 준비 중도 지금 이야기', 'on = ready && e.id === cur', 'on = e.id === cur'],
];
for (const [name, from, to] of PLAYER_MUTANTS) {
  if (PLAYER_SRC_RAW.indexOf(from) < 0) { check('⑨ 변이 «' + name + '» — 치환 앵커가 소스에 있다', false, from.slice(0, 60)); continue; }
  let fails;
  try { fails = await runPlayerChecks(PLAYER_SRC_RAW.replace(from, to), false); }
  catch (e) { fails = ['crash:' + String(e && e.message).slice(0, 60)]; }
  check('⑨ 변이 «' + name + '» 를 넣으면 실제로 FAIL 이 난다', fails.length > 0, fails.length ? fails.slice(0, 2) : '안 잡힘');
}

console.log(`\n🎬 ai_dubbing_harness — PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
