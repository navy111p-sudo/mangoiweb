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
//     ⑥ 지금 실린 편(index.json 의 ready 전부)이 실제로 돈다(6장면 · 차례/동기 모드 · 영상은 우리 서버 파일이 실재)
//        + 대사 규격(2026-10-20 GPT 2편 기준): 36줄 · 장면마다 캐릭터당 2줄 이상 · 3~8단어 · 1/2/3역 선택
//        + 캐릭터 목소리가 서로 다르다(서버가 Aura-1 로 떨어져도) · 이야기 목록(index.json)
//     ⑦ 화면이 정본을 싣고 «판정을 복제하지 않는다» · 전사에 prompt 를 안 보낸다
//     ⑧ 변이시험 — 정본을 일부러 망가뜨린 사본으로 같은 검사를 돌려 «실제로 FAIL» 이 나는지
//        (검사가 헛돌지 않는다는 유일한 증거. 원본은 0건이어야 한다 — 전제 검사)
//     ⑪ 배경음악·효과음 엔진(ai-dubbing-sound.js)을 가짜 AudioContext 로 «전부 실제로» 울리고,
//        «먼저 보기» 진행기(ai-dubbing-watch.js)를 가짜 화면으로 끝까지·다음·그만·멈춤·이전·동기 장면까지 돌린다
//        + 화면 배선(싣는 순서 · 감상 소리는 완성 영상에 안 담김 · «봤어요» 는 진행기만 적음) + 변이시험
//     ⑫ 동기 장면에서 캐릭터 목소리가 영상을 «따라가는» 박자(정본 clockFollower, 2026-10-21 4편 제보)
//        — 영상이 받는 중(버퍼링)이면 목소리도 같이 서고, 다시 움직이면 그 시각에서 같이 출발한다.
//          정본을 가짜 요소로 실제로 돌리고(변이 11종) 두 화면이 «조건 없이» 부르는지 박자 안에서 본다(변이 6종).
//          진행기 가짜 세계에서도 영상을 실제로 세워 본다(⑪-W23~W27 · 변이 3종).
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

/* ⑥-14 «어느 역을 골라도 할 일이 있다» — 장면마다 학생이 고를 수 있는 캐릭터의 몫.
   · 손님(characters 에는 있지만 playable 이 아닌 캐릭터)이 말하지 않는 장면은 예전 그대로 «각자 2줄 이상»(0-1 사장님 기준).
   · 손님이 말하는 장면(6편 위스커스 선장)은 남은 줄을 공평하게 — 각자 max(1, min(2, floor((장면 줄 − 손님 줄) / 고를 수 있는 수))) 줄 이상.
   · 손님은 장면 대사의 절반을 넘지 않는다(넘으면 학생은 구경만 한다).
   돌려주는 값 = 어긋난 곳 목록(빈 배열이면 통과). 함수로 둔 것은 아래 ⑥-14m 이 망가뜨린 사본을 같은 판정에 넣어 보기 위해서다. */
function shareProblems(ep) {
  const out = [];
  ep.scenes.forEach((s) => {
    const n = s.lines.length;
    const guest = s.lines.filter((l) => ep.playable.indexOf(l.speaker) < 0).length;
    const need = guest === 0 ? 2 : Math.max(1, Math.min(2, Math.floor((n - guest) / ep.playable.length)));
    ep.playable.forEach((cid) => {
      const have = s.lines.filter((l) => l.speaker === cid).length;
      if (have < need) out.push('scene' + s.no + ':' + cid + ':' + have + '<' + need);
    });
    if (guest * 2 > n) out.push('scene' + s.no + ':guest_over_half:' + guest + '/' + n);
  });
  return out;
}

/* ⑥ 지금 실린 에피소드 — index.json 에서 ready 인 편을 «전부» 같은 규격으로 본다(1편·3편 …).
   ⛔ 편 이름을 여기 손으로 늘어놓지 않는다 — 새 편을 ready 로 바꾸는 순간 저절로 같은 검사를 받는다.
   시각이 provisional 인 편에만 «차례 모드·preview» 를 묻는다(나중에 완성본(synced)이 와도 거짓 FAIL 이 안 나게). */
let readyIds = [];
try { readyIds = CORE.normalizeIndex(JSON.parse(rd(join(PUB, 'data', 'dubbing', 'index.json')))).filter((e) => e.status === 'ready').map((e) => e.id); } catch (e) { readyIds = []; }
check('⑥-0 전제 — 목록에서 ready 인 편을 읽었고 1편·3편·5편이 들어 있다', readyIds.indexOf('dub-001') >= 0 && readyIds.indexOf('dub-003') >= 0 && readyIds.indexOf('dub-005') >= 0, readyIds);
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
  /* ⛔ if 로 감싸지 않는다 — 감싸면 시각을 «synced» 로 바꾸는 한 줄에 아래 두 검사가 «소리 없이» 빠진다(함정 대조 2026-10-20).
     «A 면 B» 를 늘 도는 검사(!A || B)로 두고, 1·3편이 아직 provisional 이라는 사실은 ⑥-9b 가 따로 못 박는다. */
  check('⑥-4 ' + P + '시각이 «provisional» 이면 전부 차례 모드 + TTS (없는 시각을 지어내 맞추지 않는다)',
    epRaw.timing === 'synced' || sc.every((s) => s.timing === 'turn' && s.voiceMode === 'tts'));
  check('⑥-4b ' + P + '시각이 «synced» 라고 적었으면 장면이 실제로 전부 맞춤 모드로 읽힌다(시각이 틀려 차례 모드로 떨어지지 않았다)',
    epRaw.timing !== 'synced' || sc.every((s) => s.timing === 'synced'));
  check('⑥-9 ' + P + '시각이 «provisional» 이면 상태는 «preview» — 완성본이라고 말하지 않는다', epRaw.timing === 'synced' || n.episode.status === 'preview');
  check('⑥-5 ' + P + 'AI 목소리(tts)로 내는 장면은 원본 영상 소리를 끈다(생성기 목소리가 섞임)', sc.every((s) => s.voiceMode !== 'tts' || s.videoAudio === 'mute'));
  /* 영상·대표 그림은 우리 서버 파일 — 남의 CDN 주소는 만료되면 사라지고(중국 회선도 막힘) 완성 영상 캔버스를 «오염» 시킨다 */
  /* ?v=N 은 «같은 이름으로 갈아 끼운 영상» 의 캐시 우회(미디어 7일 캐시) — 파일을 찾을 때는 뗀다 */
  const local = (u) => join(PUB, String(u || '').replace(/[?#].*$/, '').replace(/^\/+/, ''));
  const mediaRe = new RegExp('^/media/dubbing/' + epId + '/[a-z0-9-]+\\.mp4(\\?v=\\d+)?$');
  check('⑥-6 ' + P + '영상은 우리 서버 경로(/media/dubbing/' + epId + '/)이고 장면마다 다르다',
    sc.every((s) => mediaRe.test(s.video)) && new Set(sc.map((s) => local(s.video))).size === 6, sc.map((s) => s.video));
  /* ↑ «다르다» 는 ?v= 를 뗀 «파일» 로 센다 — 안 떼면 같은 영상에 ?v=2 만 붙인 둘을 «다르다» 로 센다(함정 대조 2026-10-20) */
  check('⑥-6b ' + P + '영상 파일이 저장소에 실재하고 25MiB 미만(Workers 정적자산 한도)',
    sc.every((s) => existsSync(local(s.video)) && statSync(local(s.video)).size < 25 * 1024 * 1024));
  check('⑥-6c ' + P + '장면 대표 그림이 실재한다', sc.every((s) => s.poster && existsSync(local(s.poster))), sc.map((s) => s.poster));
  check('⑥-6d ' + P + '매니페스트에 남의 CDN 주소가 없다', !/cloudfront\.net|higgsfield/i.test(JSON.stringify(epRaw)));
  /* 캐릭터별 음성 파일·배경음악도 영상과 같은 규칙 — 우리 서버의 그 편 폴더에 실재 (없는 1·3편은 빈 목록이라 저절로 통과) */
  const audioRe = new RegExp('^/media/dubbing/' + epId + '/[a-z0-9-]+\\.(mp3|wav)(\\?v=\\d+)?$');
  const audioUrls = sc.reduce((a, s) => a.concat(Object.keys(s.voices).map((k) => s.voices[k]), s.bgm ? [s.bgm] : []), []);
  check('⑥-19 ' + P + '캐릭터별 음성 파일·배경음악은 우리 서버 경로이고 저장소에 실재(25MiB 미만)',
    audioUrls.every((u) => audioRe.test(u) && existsSync(local(u)) && statSync(local(u)).size < 25 * 1024 * 1024), audioUrls.filter((u) => !audioRe.test(u) || !existsSync(local(u))));
  check('⑥-19b ' + P + '시각이 synced 인데 음성 파일을 적은 장면은 말하는 캐릭터 «전원» 것이 있다(하나만 빠져도 그 장면이 임시 AI 목소리로 떨어진다)',
    epRaw.timing !== 'synced' || sc.every((s) => Object.keys(s.voices).length === 0 || s.voiceMode === 'stems'), sc.filter((s) => Object.keys(s.voices).length && s.voiceMode !== 'stems').map((s) => s.no));
  check('⑥-7 ' + P + '장면마다 학생이 고를 수 있는 캐릭터의 대사가 있다(고를 게 없으면 학생은 할 일이 없다)',
    sc.every((s) => s.lines.some((l) => n.episode.playable.indexOf(l.speaker) >= 0)));
  check('⑥-8 ' + P + '영어 대사에 한글·한자가 없다', sc.every((s) => s.lines.every((l) => !/[가-힣ㄱ-ㅎ一-鿿]/.test(l.en))));
  check('⑥-10 ' + P + '캐릭터마다 TTS 화자가 정해져 있다', Object.keys(n.episode.characters).every((k) => !!n.episode.characters[k].ttsSpeaker));

  /* 대사 규격 — 짧은 영어(3~8단어) · 장면마다 캐릭터당 2줄 이상 · 1/2/3역 선택 */
  const allLines = sc.reduce((a, s) => a.concat(s.lines), []);
  const words = (t) => (t.match(/[A-Za-z']+/g) || []).length;
  /* 줄 수 = 고를 수 있는 캐릭터 수 × 2줄 × 장면 수 (1·3·5·6편 3명 = 36줄, 4편 5명 = 60줄) — 2026-10-21 4편 5명 편성으로 «36 고정» 을 일반화 */
  check('⑥-11 ' + P + '대사는 «고를 수 있는 캐릭터 × 2 × 장면 수» 줄', allLines.length === n.episode.playable.length * 2 * sc.length, allLines.length);
  check('⑥-12 ' + P + '모든 대사가 3~8단어', allLines.every((l) => words(l.en) >= 3 && words(l.en) <= 8), allLines.filter((l) => words(l.en) < 3 || words(l.en) > 8).map((l) => l.id));
  check('⑥-13 ' + P + '고를 수 있는 캐릭터는 3~' + CORE.MAX_STUDENTS + '명(MAX_STUDENTS) — 1명부터 그 수까지 역을 나눌 수 있다', n.episode.playable.length >= 3 && n.episode.playable.length <= CORE.MAX_STUDENTS, n.episode.playable.length);
  check('⑥-14 ' + P + '장면마다 고를 수 있는 캐릭터가 «각각» 2줄 이상 말한다(손님이 말하는 장면은 남은 줄을 공평하게 · 손님은 절반 이하) — 어느 역을 골라도 할 일이 있다',
    shareProblems(n.episode).length === 0, shareProblems(n.episode));
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
/* ⑥-9b 지금 사실을 못 박는다 — 3편은 아직 «영상에 맞춘 대사 시각» 이 없다(설명서 6-1b).
   ⚠️ 진짜 완성본(대사 시각 + 원어민 음성)으로 올리는 날 이 줄을 «함께» 고친다 — 그 전에 누가 timing 만 'synced' 로 바꾸면 여기서 걸린다.
   (5편은 2026-10-21 에 원래 대본·시각 + 캐릭터별 음성 파일로 완성본이 되어 이 목록에서 빠지고 ⑥-d 가 본다.
    1편도 같은 날 «영상에서 잰 입 구간 + 캐릭터별 음성 파일» 로 완성본이 되어 빠지고 ⑥-e 가 본다.) */
for (const epId of ['dub-003']) {
  let raw = null;
  try { raw = JSON.parse(rd(join(PUB, 'data', 'dubbing', epId + '.json'))); } catch (e) { raw = null; }
  check('⑥-9b ' + epId + ' 는 아직 시각 provisional · 상태 preview (완성본이 아니다)', !!raw && raw.timing === 'provisional' && raw.status === 'preview', raw && [raw.timing, raw.status]);
}
/* ⑥-9c 3편 영상은 2026-10-20 에 «그림 미리보기» → «움직이는 AI 애니메이션» 으로 «같은 이름» 을 갈아 끼웠다.
   미디어는 7일 캐시라 ?v=2 이상이 없으면 본 사람에게 옛 그림 영상이 남고, 안내(note)가 아직 «그림이 움직이는 미리보기» 라고 하면 거짓이다.
   ⚠️ 또 갈아 끼우면 번호를 «올린다»(?v= 주소는 1년 immutable) — 이 검사는 «2 이상» 만 본다. */
{
  let r3 = null;
  try { r3 = JSON.parse(rd(join(PUB, 'data', 'dubbing', 'dub-003.json'))); } catch (e) { r3 = null; }
  const vids = r3 && Array.isArray(r3.scenes) ? r3.scenes.map((s) => String(s.video || '')) : [];
  check('⑥-9c dub-003 장면 영상 6개 전부 ?v=2 이상(같은 이름 교체 — 캐시 우회)', vids.length === 6 && vids.every((v) => { const m = /\?v=(\d+)$/.exec(v); return !!m && Number(m[1]) >= 2; }), vids);
  const noteTxt = r3 && r3.note ? String(r3.note.ko || '') + ' ' + String(r3.note.en || '') : '';
  check('⑥-9d dub-003 안내가 영상을 «그림이 움직이는 미리보기» 라고 하지 않는다(이제 움직이는 영상)', !!r3 && !/장면 그림|moving scene pictures/i.test(noteTxt), noteTxt);
}

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

/* ⑥-c 6편(dub-006) — 처음으로 «동기 + 음성 파일» 로 도는 편. 그 사실을 못 박고, ⑥-14 의 «손님» 규칙이 실제로 헛돌지 않는지 망가뜨려 본다. */
console.log('\n── ⑥-c 6편(dub-006) · ⑥-14 손님 규칙 변이');
{
  let raw6 = null, raw1 = null;
  try { raw6 = JSON.parse(rd(join(PUB, 'data', 'dubbing', 'dub-006.json'))); } catch (e) { raw6 = null; }
  try { raw1 = JSON.parse(rd(join(PUB, 'data', 'dubbing', 'dub-001.json'))); } catch (e) { raw1 = null; }
  check('⑥-c0 전제 — 6편이 목록에서 ready 이고 매니페스트를 읽었다', readyIds.indexOf('dub-006') >= 0 && !!raw6 && !!raw1);
  if (raw6 && raw1) {
    const n6 = CORE.normalizeEpisode(raw6, { baseUrl: '/data/dubbing/' });
    check('⑥-c1 6편은 시각 synced · 상태 final · 여섯 장면 전부 «동기 + 음성 파일» (음성 파일 하나만 빠져도 여기서 걸린다)',
      raw6.timing === 'synced' && n6.episode.status === 'final' && n6.episode.scenes.length === 6 && n6.episode.scenes.every((s) => s.timing === 'synced' && s.voiceMode === 'stems'),
      n6.episode.scenes.map((s) => s.no + ':' + s.timing + '/' + s.voiceMode));
    const guests6 = Object.keys(n6.episode.characters).filter((k) => n6.episode.playable.indexOf(k) < 0);
    check('⑥-c2 6편의 손님은 위스커스 선장 하나이고 학생은 고를 수 없다', guests6.length === 1 && guests6[0] === 'whiskers', guests6);
    check('⑥-c3 짝 — 지금 6편은 손님 규칙을 통과한다', shareProblems(n6.episode).length === 0, shareProblems(n6.episode));
    const mut = (raw, edit) => { const c = JSON.parse(JSON.stringify(raw)); edit(c); return shareProblems(CORE.normalizeEpisode(c, { baseUrl: '/data/dubbing/' }).episode); };
    const sceneOf = (c, no) => c.scenes.find((s) => s.no === no);
    const lineOf = (s, cid) => s.lines.find((l) => l.speaker === cid);
    // 손님 장면에서 아이 한 명의 하나뿐인 줄을 손님에게 넘기면 → 그 아이는 그 장면에서 할 일이 없다
    check('⑥-14m1 변이 «손님 장면에서 아이 몫을 0 으로» → 실제로 걸린다',
      mut(raw6, (c) => { lineOf(sceneOf(c, 4), 'zibi').speaker = 'whiskers'; }).some((p) => /^scene4:zibi:0</.test(p)));
    // 손님 줄이 장면의 절반을 넘으면 → 걸린다
    check('⑥-14m2 변이 «손님이 장면의 절반 넘게» → 실제로 걸린다',
      mut(raw6, (c) => { lineOf(sceneOf(c, 5), 'mateo').speaker = 'whiskers'; lineOf(sceneOf(c, 5), 'zibi').speaker = 'whiskers'; }).some((p) => /^scene5:guest_over_half/.test(p)));
    // 손님이 없는 장면은 예전 그대로 «각자 2줄» — 1편에서 한 줄을 다른 아이에게 넘기면 걸린다(규칙을 넓히다 옛 기준이 풀리지 않았는지)
    const s1 = raw1.scenes[0], first = s1.lines[0].speaker, other = raw1.playable.find((x) => x !== first);
    check('⑥-14m3 변이 «손님 없는 장면에서 2줄 → 1줄» → 실제로 걸린다(옛 기준 그대로)',
      mut(raw1, (c) => { c.scenes[0].lines[0].speaker = other; }).some((p) => p.indexOf('scene' + s1.no + ':' + first + ':1<2') === 0));
    // 손님을 «고를 수 있는 역» 으로 바꾸면 → 1~3장면에서 그 역은 할 일이 없다(그래서 손님으로 둔다)
    check('⑥-14m4 변이 «손님을 고를 수 있는 역으로» → 실제로 걸린다',
      mut(raw6, (c) => { c.playable = c.playable.concat(['whiskers']); }).some((p) => /^scene1:whiskers:0</.test(p)));
  }
}

/* ⑥-d 5편(dub-005) — 2026-10-21 «원래 대본·시각 + 캐릭터별 음성 파일» 로 되돌린 편.
   사고: 영상(아티팩트)은 아마라·지호·프리야·볼트·맥스가 말하는 대본으로 입모양이 만들어졌는데, 사이트 판이 아마라·맥스의 대사를
   지호·프리야에게 넘기고 시각을 버려(차례 모드) 영상 속 아마라가 입을 움직일 때 지호(남자 TTS) 목소리가 났다(사장님 제보).
   ⟹ 영상이 바뀌지 않는 한 «누가 몇 번째 줄을 말하는가» 는 영상이 정한 사실이라 여기 못 박는다(대본을 바꾸려면 영상부터 다시). */
console.log('\n── ⑥-d 5편(dub-005) · 원래 대본 + 음성 파일');
{
  let raw5 = null;
  try { raw5 = JSON.parse(rd(join(PUB, 'data', 'dubbing', 'dub-005.json'))); } catch (e) { raw5 = null; }
  check('⑥-d0 전제 — 5편이 목록에서 ready 이고 매니페스트를 읽었다', readyIds.indexOf('dub-005') >= 0 && !!raw5);
  if (raw5) {
    const n5 = CORE.normalizeEpisode(raw5, { baseUrl: '/data/dubbing/' });
    const sc5 = n5.episode.scenes;
    check('⑥-d1 5편은 시각 synced · 상태 final · 여섯 장면 전부 «동기 + 음성 파일» (음성 파일 하나만 빠져도 여기서 걸린다)',
      raw5.timing === 'synced' && n5.episode.status === 'final' && sc5.length === 6 && sc5.every((s) => s.timing === 'synced' && s.voiceMode === 'stems'),
      sc5.map((s) => s.no + ':' + s.timing + '/' + s.voiceMode));
    const guests5 = Object.keys(n5.episode.characters).filter((k) => n5.episode.playable.indexOf(k) < 0).sort();
    check('⑥-d2 5편의 고를 수 있는 역은 아마라·지호·프리야, 손님은 볼트·맥스(늘 원래 목소리)',
      n5.episode.playable.slice().sort().join(',') === 'amara,jiho,priya' && guests5.join(',') === 'bolt,max', [n5.episode.playable, guests5]);
    /* 영상이 정한 «말하는 차례» — 아티팩트 5편 episode.json 그대로. 이 순서가 바뀌었으면 입과 목소리가 다시 어긋난다. */
    const VIDEO_SPEAKERS = [
      'amara,jiho,bolt,priya,amara,bolt',
      'priya,bolt,jiho,bolt,amara,bolt',
      'jiho,priya,bolt,amara,bolt,jiho',
      'amara,max,jiho,max,bolt,priya',
      'max,jiho,amara,bolt,jiho,priya',
      'bolt,amara,bolt,jiho,bolt,priya',
    ];
    check('⑥-d3 장면마다 «누가 몇 번째 줄을 말하는가» 가 영상(입모양)이 만들어진 대본과 같다',
      sc5.length === 6 && sc5.every((s, i) => s.lines.map((l) => l.speaker).join(',') === VIDEO_SPEAKERS[i]),
      sc5.map((s) => s.lines.map((l) => l.speaker).join(',')));
    check('⑥-d4 장면마다 음성 파일은 «그 장면에서 말하는 캐릭터» 것만 있다(남는 파일·빠진 파일 없음)',
      sc5.every((s) => Object.keys(s.voices).sort().join(',') === Array.from(new Set(s.lines.map((l) => l.speaker))).sort().join(',')
        && Object.keys(s.voices).every((k) => s.voices[k].indexOf('/scene-' + s.no + '-' + k + '.mp3') > 0)),
      sc5.map((s) => s.no + ':' + Object.keys(s.voices).join('/')));
    const note5 = String((raw5.note && raw5.note.ko) || '') + ' ' + String((raw5.note && raw5.note.en) || '');
    check('⑥-d5 5편 안내가 «임시 AI 음성 · 차례차례» 라고 하지 않는다(이제 입모양에 맞춘 음성 파일)', !/임시|차례차례|temporary|one by one/i.test(note5), note5);
  }
}

/* ⑥-e 1편(dub-001) — 2026-10-21 «영상에서 잰 입 구간 + 캐릭터별 음성 파일» 로 완성본이 된 편.
   사고: 차례 모드(시각 없음)라 대사가 영상 속 입과 상관없이 나왔고, 3~6장면 클립 순서가 이야기와 어긋나(«긴목 공룡과 친구» 가 «아기 공룡 발견» 보다 먼저,
   6장면 첫머리에 포털 도착이 한 번 더) «장면·말·입이 안 맞고 들쭉날쭉» 했다(사장님 제보). 그래서 클립을 이야기 순서로 다시 잇고(3·10·11 / 12·13·14 / 4·5·15 / 6·16),
   대사를 입이 움직이는 구간에 놓았다 ⟹ «누가 몇 번째 줄을 말하는가» 는 이제 영상(입 구간)이 정한 사실이라 여기 못 박는다. */
console.log('\n── ⑥-e 1편(dub-001) · 입 구간 시각 + 음성 파일');
{
  let rawE = null;
  try { rawE = JSON.parse(rd(join(PUB, 'data', 'dubbing', 'dub-001.json'))); } catch (e) { rawE = null; }
  check('⑥-e0 전제 — 1편이 목록에서 ready 이고 매니페스트를 읽었다', readyIds.indexOf('dub-001') >= 0 && !!rawE);
  if (rawE) {
    const nE = CORE.normalizeEpisode(rawE, { baseUrl: '/data/dubbing/' });
    const scE = nE.episode.scenes;
    check('⑥-e1 1편은 시각 synced · 상태 final · 여섯 장면 전부 «동기 + 음성 파일» (음성 파일 하나만 빠지거나 시각 하나만 틀려도 여기서 걸린다)',
      rawE.timing === 'synced' && nE.episode.status === 'final' && scE.length === 6 && scE.every((s) => s.timing === 'synced' && s.voiceMode === 'stems'),
      scE.map((s) => s.no + ':' + s.timing + '/' + s.voiceMode));
    const guestsE = Object.keys(nE.episode.characters).filter((k) => nE.episode.playable.indexOf(k) < 0).sort();
    check('⑥-e2 1편의 고를 수 있는 역은 준·미나·렉스, 손님은 교장 선생님 하나(6장면 마지막 줄 — 영상 속 남자 선생님)',
      nE.episode.playable.slice().sort().join(',') === 'jun,mina,rex' && guestsE.join(',') === 'principal', [nE.episode.playable, guestsE]);
    /* 영상(입이 움직이는 구간)에 맞춘 «말하는 차례». 이 순서가 바뀌면 그 줄의 목소리가 다른 아이 입에서 나온다. */
    const VIDEO_SPEAKERS_1 = [
      'jun,mina,rex,rex,jun,mina',
      'jun,mina,rex,mina,jun,rex',
      'mina,jun,rex,jun,mina,rex',
      'rex,jun,mina,jun,mina,rex',
      'jun,rex,rex,jun,mina,mina',
      'rex,jun,rex,mina,jun,principal',
    ];
    const orderOk = (scenes) => scenes.length === 6 && scenes.every((s, i) => s.lines.map((l) => l.speaker).join(',') === VIDEO_SPEAKERS_1[i]);
    check('⑥-e3 장면마다 «누가 몇 번째 줄을 말하는가» 가 영상에서 잰 입 구간과 같다', orderOk(scE), scE.map((s) => s.lines.map((l) => l.speaker).join(',')));
    check('⑥-e4 장면마다 음성 파일은 «그 장면에서 말하는 캐릭터» 것만 있다(남는 파일·빠진 파일 없음)',
      scE.every((s) => Object.keys(s.voices).sort().join(',') === Array.from(new Set(s.lines.map((l) => l.speaker))).sort().join(',')
        && Object.keys(s.voices).every((k) => s.voices[k].indexOf('/scene-' + s.no + '-' + k + '.mp3') > 0)),
      scE.map((s) => s.no + ':' + Object.keys(s.voices).join('/')));
    const noteE = String((rawE.note && rawE.note.ko) || '') + ' ' + String((rawE.note && rawE.note.en) || '');
    check('⑥-e5 1편 안내가 «임시 AI 음성 · 차례차례» 라고 하지 않는다(이제 입 구간에 맞춘 음성 파일)', !/임시|차례차례|temporary|one by one/i.test(noteE), noteE);
    /* 3~6장면 영상·대표 그림은 «같은 이름» 으로 갈아 끼웠다(클립 순서를 바꿈) — 미디어 7일 캐시라 ?v=2 이상이 없으면 본 사람에게 옛 영상이 남고
       새 대사 시각이 옛 영상 위에 놓여 입이 다시 어긋난다. ⚠️ 또 갈아 끼우면 번호를 «올린다»(?v= 주소는 1년 immutable). */
    const vOf = (u) => { const m = /\?v=(\d+)$/.exec(String(u || '')); return m ? Number(m[1]) : 0; };
    check('⑥-e6 1편 3~6장면 영상·대표 그림은 ?v=2 이상(같은 이름 교체 — 캐시 우회)',
      [3, 4, 5, 6].every((no) => { const r = rawE.scenes.find((x) => x.no === no); return !!r && vOf(r.video) >= 2 && vOf(r.poster) >= 2; }),
      rawE.scenes.map((x) => x.no + ':' + x.video + ' ' + x.poster));
    /* 음성 파일 길이 ≥ 장면 길이 — 짧으면 그 뒤 대사가 소리 없이 지나간다. MP3 첫 프레임의 비트레이트로 길이를 어림한다(CBR). */
    const mp3Sec = (file) => {
      const b = readFileSync(file); let i = 0;
      if (b.slice(0, 3).toString() === 'ID3') i = 10 + ((b[6] & 0x7f) << 21 | (b[7] & 0x7f) << 14 | (b[8] & 0x7f) << 7 | (b[9] & 0x7f));
      while (i < b.length - 4 && !(b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0)) i++;
      const KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
      const kbps = (b[i + 1] & 0x18) === 0x18 && (b[i + 1] & 0x06) === 0x02 ? KBPS[b[i + 2] >> 4] : 0; // MPEG1 Layer III 만
      return kbps ? (b.length - i) * 8 / (kbps * 1000) : NaN;
    };
    const short = [];
    scE.forEach((s) => Object.keys(s.voices).forEach((k) => {
      const f = join(PUB, s.voices[k].replace(/[?#].*$/, '').replace(/^\/+/, ''));
      let sec = NaN; try { sec = mp3Sec(f); } catch (e) { sec = NaN; }
      if (!(sec >= s.durationSec - 0.5)) short.push(s.no + ':' + k + ':' + (Number.isFinite(sec) ? sec.toFixed(2) : 'NaN') + '<' + s.durationSec);
    }));
    check('⑥-e7 장면마다 음성 파일이 장면 길이만큼 있다(짧으면 뒤 대사가 소리 없이 지나간다)', short.length === 0, short);
    /* 짝 — 위 검사가 헛돌지 않는지 망가뜨려 본다 */
    const mutE = (edit) => { const c = JSON.parse(JSON.stringify(rawE)); edit(c); return CORE.normalizeEpisode(c, { baseUrl: '/data/dubbing/' }).episode.scenes; };
    check('⑥-e3m 변이 «3장면 두 줄의 화자 맞바꿈» → ⑥-e3 식이 실제로 걸린다',
      !orderOk(mutE((c) => { const l = c.scenes[2].lines; const t = l[0].speaker; l[0].speaker = l[1].speaker; l[1].speaker = t; })));
    check('⑥-e1m 변이 «6장면 교장 선생님 음성 파일 빼기» → «동기 + 음성 파일» 이 실제로 풀린다(⑥-e1 이 걸린다)',
      mutE((c) => { delete c.scenes[5].voices.principal; })[5].voiceMode !== 'stems');
  }
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
for (const f of ['js/ai-dubbing-core.js', 'js/ai-dubbing-sound.js', 'js/ai-dubbing-watch.js', 'js/ai-dubbing.js', 'data/dubbing/dub-001.json', 'data/dubbing/dub-002.json', 'data/dubbing/dub-003.json', 'data/dubbing/dub-004.json', 'data/dubbing/dub-005.json', 'data/dubbing/dub-006.json', 'data/dubbing/index.json']) check('⑦-15 파일 실재: ' + f, existsSync(join(PUB, f)));
/* 👂 먼저 들어 보기 — 그 소리는 완성 영상에 넣지 않는다(학생 목소리만 남아야 한다) */
const lfBody = (() => { const i = playerCode.indexOf('function listenFirst('); if (i < 0) return ''; const j = playerCode.indexOf('function studentTurn(', i); return j > i ? playerCode.slice(i, j) : ''; })();
check('⑦-16 «먼저 들어 보기» 함수가 있고 연습에서만 옵션으로 켜고 끈다', !!lfBody && /if \(!run\.listenFirst\) return/.test(lfBody) && /listenFirst: mode === 'practice' && !!\(\$\('dub-listen-first'\)/.test(playerCode));
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


/* ───────────────────────────────────────────────────────────────────────
 * ⑩ 키키와 토토 «고르기 목록»(ai-dubbing.js KT_EPISODES) ↔ 정본(ai-dubbing-studio.html EPISODES·CAST)
 *    2026-10-20 B안 — A.i영화더빙 화면이 키키와 토토 10편을 «고르기만» 하고 스튜디오(?ep=<id>)로 보낸다.
 *    목록은 스튜디오 데이터의 «사본» 이라, 한쪽만 고치면 화면이 없는 편·틀린 제목을 보여 준다(에러 없음).
 *    ⛔ 기대값을 여기 손으로 적지 않는다 — 두 소스에서 «읽어» 서로 대조한다.
 * ─────────────────────────────────────────────────────────────────────── */
const STUDIO_PATH = join(PUB, 'ai-dubbing-studio.html');
const STUDIO_SRC = process.env.STUDIO_SRC ? rd(process.env.STUDIO_SRC) : rd(STUDIO_PATH);
/** 따옴표 안을 건너뛰며 여는 괄호의 짝을 찾아 그 리터럴을 돌려준다. */
function literalAt(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return null;
  const open = src.indexOf(decl.trim().endsWith('[') ? '[' : '{', i + decl.length - 1);
  const pair = { '[': ']', '{': '}' };
  const stack = [];
  let q = null;
  for (let k = open; k < src.length; k++) {
    const c = src[k];
    if (q) { if (c === '\\') { k++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && src[k + 1] === '/') { k = src.indexOf('\n', k); if (k < 0) return null; continue; }
    if (c === '/' && src[k + 1] === '*') { k = src.indexOf('*/', k + 2) + 1; if (k <= 0) return null; continue; }
    if (c === '[' || c === '{') stack.push(pair[c]);
    else if (c === ']' || c === '}') { if (stack.pop() !== c) return null; if (!stack.length) return src.slice(open, k + 1); }
  }
  return null;
}
const evalLit = (lit) => vm.runInNewContext('(' + lit + ')', {});
/** 목록 ↔ 정본 대조. 실패한 항목 이름을 돌려준다(변이시험에 다시 쓴다). */
function ktMirrorFails(playerSrc, studioSrc, report) {
  const fails = [];
  const t = (name, ok, extra) => { if (!ok) fails.push(name); if (report) check(name, ok, extra); };
  let EP = null, CAST = null, KT = null, KC = null;
  try { EP = evalLit(literalAt(studioSrc, 'const EPISODES = [')); } catch (e) { EP = null; }
  try { CAST = evalLit(literalAt(studioSrc, 'const CAST = {')); } catch (e) { CAST = null; }
  try { KT = evalLit(literalAt(playerSrc, 'var KT_EPISODES = [')); } catch (e) { KT = null; }
  try { KC = evalLit(literalAt(playerSrc, 'var KT_CAST = {')); } catch (e) { KC = null; }
  t('⑩-0 정본 EPISODES·CAST 와 목록 KT_EPISODES·KT_CAST 를 소스에서 읽었다(전제)',
    Array.isArray(EP) && EP.length > 0 && CAST && Array.isArray(KT) && KC, [Array.isArray(EP), !!CAST, Array.isArray(KT), !!KC]);
  if (!(Array.isArray(EP) && CAST && Array.isArray(KT) && KC)) return fails;
  const castOf = (ep) => Object.keys(CAST).filter((id) => (ep.lines || []).some((l) => l.who === id));
  t('⑩-1 편 수가 같다', KT.length === EP.length, [KT.length, EP.length]);
  t('⑩-2 편 id·순서가 같다', JSON.stringify(KT.map((e) => e.id)) === JSON.stringify(EP.map((e) => e.id)), KT.map((e) => e.id).join(','));
  const bad = [];
  EP.forEach((e, i) => {
    const k = KT[i] || {};
    if (k.level !== e.level) bad.push(e.id + ':level');
    if (!k.title || k.title.ko !== e.title.ko || k.title.en !== e.title.en) bad.push(e.id + ':title');
    if (!k.desc || k.desc.ko !== e.desc.ko || k.desc.en !== e.desc.en) bad.push(e.id + ':desc');
    if (JSON.stringify(k.cast) !== JSON.stringify(castOf(e))) bad.push(e.id + ':cast');
  });
  t('⑩-3 편마다 레벨·제목(ko/en)·설명(ko/en)·출연이 정본과 같다', bad.length === 0, bad.slice(0, 6));
  const cb = Object.keys(CAST).filter((id) => !KC[id] || KC[id].ko !== CAST[id].name.ko || KC[id].en !== CAST[id].name.en);
  t('⑩-4 출연 이름표(KT_CAST)가 정본 CAST 이름과 같다', cb.length === 0 && Object.keys(KC).length === Object.keys(CAST).length, cb);
  return fails;
}
const ktFails0 = ktMirrorFails(PLAYER_SRC_RAW, STUDIO_SRC, true);
check('⑩-v0 원본은 ⑩ 을 전부 통과한다(전제)', ktFails0.length === 0, ktFails0);
const KT_MUTANTS = [
  ['목록 제목 한 글자 다름', "title: { ko: '소풍 가는 날', en: 'Picnic Day' }", "title: { ko: '소풍 가는 날', en: 'Picnic Days' }"],
  ['목록 레벨 다름', "{ id: 'bday', level: 2,", "{ id: 'bday', level: 3,"],
  ['목록 출연 빠짐', "{ id: 'picnic', level: 1,", "{ id: 'picnic', level: 1, castX: 0,"],
];
for (const [name, from, to] of KT_MUTANTS) {
  if (PLAYER_SRC_RAW.indexOf(from) < 0) { check('⑩ 변이 «' + name + '» — 치환 앵커가 소스에 있다', false, from.slice(0, 60)); continue; }
  let src = PLAYER_SRC_RAW.replace(from, to);
  if (name === '목록 출연 빠짐') src = src.replace(/(\{ id: 'picnic'[^\n]*?cast: )\[[^\]]*\]/, "$1['kiki', 'toto']");
  const f = ktMirrorFails(src, STUDIO_SRC, false);
  check('⑩ 변이 «' + name + '» 를 넣으면 실제로 FAIL 이 난다', f.length > 0, f.length ? f : '안 잡힘');
}
{ // 정본 쪽만 고치면(편을 하나 더 넣으면) 목록이 낡았다고 잡는가
  const from = "const EPISODES = [";
  const f = ktMirrorFails(PLAYER_SRC_RAW, STUDIO_SRC.replace(from, from + "\n  { id: 'newep', level: 1, title: { en: 'X', ko: 'X' }, desc: { en: 'X', ko: 'X' }, lines: [{ who: 'kiki', en: 'Hi', ko: '안녕' }] },"), false);
  check('⑩ 변이 «정본에만 편 추가» 를 넣으면 실제로 FAIL 이 난다', f.length > 0, f.length ? f : '안 잡힘');
}

/* ⑩-5 장르 고르기(pickGenre)·스튜디오 딥링크(epFromQuery) — 경계값을 실제로 돌린다 */
function fnAt(src, head) {
  const i = src.indexOf(head);
  if (i < 0) return null;
  const body = literalAt(src.slice(i), head.slice(0, head.indexOf('{') + 1));
  return body ? src.slice(i, i + head.indexOf('{')) + body : null;
}
{
  const pg = fnAt(PLAYER_SRC_RAW, 'function pickGenre(search, saved) {');
  let pick = null;
  try { pick = vm.runInNewContext('(' + pg + ')', {}); } catch (e) { pick = null; }
  check('⑩-5 pickGenre 를 소스에서 오려 냈다(전제)', typeof pick === 'function');
  if (typeof pick === 'function') {
    const cases = [
      ['?g=kt', '', 'kt'], ['?g=adv', 'kt', 'adv'], ['?x=1&g=kt#a', '', 'kt'],
      ['?ep=dub-003', 'kt', 'adv'],      // 모험 애니 딥링크가 저장된 «키키와 토토» 보다 이긴다
      ['', 'kt', 'kt'], ['', '', 'adv'], ['', 'zz', 'adv'], ['?g=zz', 'kt', 'kt'], [null, undefined, 'adv'],
    ];
    const bad = cases.filter(([q, s, want]) => pick(q, s) !== want).map(([q, s, want]) => JSON.stringify([q, s]) + '→' + pick(q, s) + '≠' + want);
    check('⑩-6 pickGenre: ?g= > ?ep=(모험) > 저장값 > 모험 기본', bad.length === 0, bad);
  }
  const eq = fnAt(STUDIO_SRC, 'function epFromQuery(search) {');
  let EP = null; try { EP = evalLit(literalAt(STUDIO_SRC, 'const EPISODES = [')); } catch (e) { EP = null; }
  let ef = null;
  try { ef = vm.runInNewContext('(' + eq + ')', { EPISODES: EP }); } catch (e) { ef = null; }
  check('⑩-7 epFromQuery 를 스튜디오 소스에서 오려 냈다(전제)', typeof ef === 'function' && Array.isArray(EP));
  if (typeof ef === 'function' && Array.isArray(EP)) {
    const idx = (id) => EP.findIndex((e) => e.id === id);
    const cases = [
      ['?ep=chu', idx('chu')], ['?ep=CHU', idx('chu')], ['?x=1&ep=show', idx('show')], ['?ep=chu#top', idx('chu')],
      ['?ep=nope', -1], ['?step=chu', -1], ['', -1], [null, -1], ['?ep=<script>', -1], ['?ep=' + 'a'.repeat(30), -1],
    ];
    const bad = cases.filter(([q, want]) => ef(q) !== want).map(([q, want]) => JSON.stringify(q) + '→' + ef(q) + '≠' + want);
    check('⑩-8 epFromQuery: 아는 id 만 그 편으로, 모르는 값은 -1(저장된 편 그대로)', bad.length === 0 && idx('chu') > 0, bad);
    // 배선 — loadPrefs 가 그 결과로 시작 편을 정하는가(0 은 첫 편이라 정당한 값)
    // ⚠️ 줄 끝 주석이 끼어 있어도 되게 — 주석을 벗긴 사본으로 본다
    const noCmt = STUDIO_SRC.replace(/\/\/[^\n]*/g, '');
    check('⑩-9 스튜디오가 시작할 때 ?ep= 를 읽어 그 편으로 연다', /const qi = epFromQuery\(location\.search\);\s*if \(qi >= 0\) state\.ep = qi;/.test(noCmt));
  }
}

/* ───────────────────────────────────────────────────────────────────────
 * ⑪ 🎵 배경음악·효과음 엔진(js/ai-dubbing-sound.js) + 👀 «먼저 보기» 진행기(js/ai-dubbing-watch.js)
 *    · 엔진의 이름 목록이 정본(core SOUND_*)과 «같은 말» 을 하는가
 *    · 가짜 AudioContext(값이 NaN·0 으로 지수 램프 등 «실제 브라우저가 던지는 것» 은 기록하고 던진다)에서
 *      효과음 34가지·분위기 9가지·악기 색 6가지를 «전부 실제로» 울려 본다 — 엔진이 try/catch 로 삼켜도 기록이 남는다
 *    · 매니페스트 6편의 신호가 «실제로 울릴 수 있는 자리» 에만 있는가(차례 장면에 «시각» 신호 없음 · 동기 장면은 전부 시각이 정해짐)
 *    · 진행기를 가짜 화면(kit)으로 돌린다 — 끝까지 / 다음 / 그만 / 멈춤(카드·대사 중) / 이전 / 동기 장면 / 기기 목소리 / 새 판
 *    · 화면 배선 — 싣는 순서 · 감상 소리는 완성 영상 갈래에 안 잇는다(noRec) · «봤어요» 는 진행기만 적는다 · 더빙과 동시에 안 돈다
 *    · 변이시험 — 엔진·진행기·화면을 일부러 망가뜨린 사본으로 «실제로 FAIL» 이 나는지
 * ─────────────────────────────────────────────────────────────────────── */
console.log('\n── ⑪ 배경음악·효과음 엔진 · 먼저 보기 진행기');
const SOUND_PATH = join(PUB, 'js', 'ai-dubbing-sound.js');
const WATCH_PATH = join(PUB, 'js', 'ai-dubbing-watch.js');
const SOUND_SRC = rd(SOUND_PATH);
const WATCH_SRC = rd(WATCH_PATH);

/* 가짜 타이머(엔진 전용) — 음악 박자를 «시간을 흘려서» 돌린다 */
function fakeTimers() {
  let seq = 0; const q = new Map();
  return {
    setTimeout(fn, ms) { const id = ++seq; q.set(id, fn); return id; },
    clearTimeout(id) { q.delete(id); },
    pending() { return q.size; },
    runAll() { const list = [...q.entries()]; q.clear(); list.forEach(([, fn]) => { fn(); }); return list.length; },
    clear() { q.clear(); },
  };
}
/* 가짜 AudioContext — 실제 브라우저가 RangeError 를 던지는 값(비유한값·지수 램프 0·음수 시각·모르는 파형)은 errors 에 남기고 던진다 */
function fakeCtx() {
  const ctx = { currentTime: 0, sampleRate: 8000, made: 0, started: 0, errors: [], gains: [] };
  const err = (m) => { ctx.errors.push(m); throw new RangeError(m); };
  const fin = (v, what) => { if (typeof v !== 'number' || !isFinite(v)) err(what + ':' + v); };
  function param(v) {
    const p = {
      _v: v,
      get value() { return this._v; }, set value(x) { fin(x, 'value='); this._v = x; },
      setValueAtTime(x, t) { fin(x, 'setValueAtTime'); fin(t, 'setValueAtTime.t'); if (t < 0) err('setValueAtTime.t<0'); return p; },
      linearRampToValueAtTime(x, t) { fin(x, 'linearRamp'); fin(t, 'linearRamp.t'); p._lin = x; return p; },
      exponentialRampToValueAtTime(x, t) { fin(x, 'expRamp'); fin(t, 'expRamp.t'); if (x === 0) err('expRamp→0'); return p; },
      cancelScheduledValues(t) { fin(t, 'cancel.t'); return p; },
    };
    return p;
  }
  const node = (extra) => { ctx.made++; return Object.assign({ connect(d) { if (!d) err('connect(없음)'); return d; }, disconnect() {} }, extra); };
  const WAVES = ['sine', 'square', 'sawtooth', 'triangle'];
  const FILTERS = ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass'];
  ctx.destination = node({});
  ctx.createGain = () => { const g = node({ gain: param(1) }); ctx.gains.push(g); return g; };
  ctx.createOscillator = () => {
    let type = 'sine';
    return node({ frequency: param(440),
      get type() { return type; }, set type(x) { if (WAVES.indexOf(x) < 0) err('osc.type:' + x); type = x; },
      start(t) { fin(t == null ? 0 : t, 'osc.start'); ctx.started++; }, stop(t) { fin(t == null ? 0 : t, 'osc.stop'); } });
  };
  ctx.createBiquadFilter = () => {
    let type = 'lowpass';
    return node({ frequency: param(350), Q: param(1),
      get type() { return type; }, set type(x) { if (FILTERS.indexOf(x) < 0) err('filter.type:' + x); type = x; } });
  };
  ctx.createDynamicsCompressor = () => node({ threshold: param(-24), ratio: param(12) });
  ctx.createDelay = (max) => node({ delayTime: param(0) });
  ctx.createBuffer = (ch, n, sr) => { fin(n, 'buffer.n'); return { getChannelData() { return new Float32Array(n); } }; };
  ctx.createBufferSource = () => node({ buffer: null, loop: false,
    start(t, off) { fin(t == null ? 0 : t, 'src.start'); fin(off == null ? 0 : off, 'src.offset'); ctx.started++; }, stop(t) { fin(t == null ? 0 : t, 'src.stop'); } });
  return ctx;
}
function loadSound(src, T) {
  const sb = { module: { exports: {} }, setTimeout: T.setTimeout, clearTimeout: T.clearTimeout, console };
  sb.window = undefined;
  vm.createContext(sb);
  vm.runInContext(src, sb, { filename: 'ai-dubbing-sound.js' });
  return sb.module.exports;
}

function soundChecks(src, verbose) {
  const fails = [];
  const t = (name, ok, extra) => { if (!ok) fails.push(name); if (verbose) check(name, ok, extra); };
  const T = fakeTimers();
  let S = null;
  try { S = loadSound(src, T); } catch (e) { S = null; }
  t('⑪-0 소리 엔진을 불러왔다(전제)', !!(S && typeof S.create === 'function'));
  if (!S || typeof S.create !== 'function') return fails;
  const same = (a, b) => Array.isArray(a) && Array.isArray(b) && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  t('⑪-1 분위기 목록이 정본(core SOUND_MOODS)과 같다', same(S.MOODS, CORE.SOUND_MOODS), S.MOODS);
  t('⑪-2 악기 색 목록이 정본(core SOUND_PALETTES)과 같다', same(S.PALETTES, CORE.SOUND_PALETTES), S.PALETTES);
  t('⑪-3 효과음 목록이 정본(core SOUND_SFX)과 같다', same(S.SFX, CORE.SOUND_SFX), S.SFX && S.SFX.length);
  t('⑪-3b 정본 목록이 비어 있지 않다(전제 — 비면 아래가 전부 헛돈다)', CORE.SOUND_SFX.length >= 30 && CORE.SOUND_MOODS.length >= 9 && CORE.SOUND_PALETTES.length >= 6);
  /* A. 효과음 전부 */
  const ctx = fakeCtx();
  let eng = null;
  try { eng = S.create(ctx, [ctx.destination, null]); } catch (e) { eng = null; }
  t('⑪-4 엔진을 만들었다(완성영상 갈래 없이도)', !!eng);
  if (!eng) return fails;
  const badSfx = [], silent = [];
  CORE.SOUND_SFX.forEach((n) => {
    const s0 = ctx.started;
    let ok = false;
    try { ok = eng.sfx(n, 0.8); } catch (e) { ok = false; }
    if (!ok) badSfx.push(n); else if (ctx.started === s0) silent.push(n);
  });
  t('⑪-5 효과음 ' + CORE.SOUND_SFX.length + '가지가 전부 «실제로» 울린다(true · 소리 조각이 시작됨 · 브라우저가 던질 값 0건)',
    badSfx.length === 0 && silent.length === 0 && ctx.errors.length === 0, { badSfx, silent, errors: ctx.errors.slice(0, 3) });
  t('⑪-6 모르는 효과음은 조용히 false(던지지 않는다)', eng.sfx('nope') === false && eng.sfx('') === false);
  /* B. 분위기 × 악기 색 전부 — 시간을 흘려 박자 타이머를 실제로 돌린다 */
  const moodBad = [];
  CORE.SOUND_PALETTES.forEach((pal) => {
    CORE.SOUND_MOODS.forEach((m) => {
      T.clear();
      const c = fakeCtx();
      let e = null, ok = false;
      try { e = S.create(c, [c.destination]); ok = e.setPalette(pal) && e.music(m); } catch (x) { ok = false; }
      if (!e || !ok) { moodBad.push(pal + '/' + m + ':start'); return; }
      const s0 = c.started;
      for (let k = 0; k < 40; k++) { c.currentTime += 0.06; try { T.runAll(); } catch (x) {} }
      const st = e.state();
      if (!(st.on && st.timer && st.mood === m)) moodBad.push(pal + '/' + m + ':state');
      else if (c.started <= s0) moodBad.push(pal + '/' + m + ':silent');
      else if (c.errors.length) moodBad.push(pal + '/' + m + ':' + c.errors[0]);
    });
  });
  t('⑪-7 분위기 ' + CORE.SOUND_MOODS.length + ' × 악기 색 ' + CORE.SOUND_PALETTES.length + ' 전부 음악이 «흘러간다»(박자 타이머가 살아 있고 음이 계속 시작됨 · 오류 0)', moodBad.length === 0, moodBad.slice(0, 4));
  /* C. 멈춤·이어 가기·끄기 */
  T.clear();
  const c2 = fakeCtx();
  const e2 = S.create(c2, [c2.destination]);
  e2.music('bright');
  for (let k = 0; k < 5; k++) { c2.currentTime += 0.06; T.runAll(); }
  const gi0 = c2.gains.length; const sfxW = e2.sfx('waves'); const gWave = c2.gains[gi0];   // 몇 초짜리 효과음 — 울리는 «도중» 에 멈춘다
  e2.pause();
  const stP = e2.state();
  t('⑪-8b 멈추면 «이미 울리는» 효과음(파도처럼 긴 것)도 끊는다 — 그 소리의 이득을 0 으로', sfxW === true && !!gWave && gWave.gain._lin === 0, gWave && gWave.gain._lin);
  t('⑪-8 pause() — 멈춤 표시 + 박자 타이머가 «그 자리에서» 꺼진다', stP.paused === true && stP.timer === false, stP);
  const sP = c2.started;
  for (let k = 0; k < 10; k++) { c2.currentTime += 0.06; T.runAll(); }
  t('⑪-9 멈춘 동안 음이 하나도 시작되지 않는다', c2.started === sP, c2.started - sP);
  t('⑪-10 멈춘 동안 효과음도 안 울린다(false)', e2.sfx('pop') === false);
  e2.resume();
  const stR = e2.state();
  for (let k = 0; k < 10; k++) { c2.currentTime += 0.06; T.runAll(); }
  t('⑪-11 resume() — 타이머가 다시 살고 음이 다시 시작된다', stR.paused === false && stR.timer === true && c2.started > sP, stR);
  const gi1 = c2.gains.length; const sfxP = e2.sfx('pop'); const gPop = c2.gains[gi1];
  t('⑪-11b 이어 간 뒤 새 효과음은 그대로 울린다(끊지 않음) · 멈출 때 끊은 소리는 되살아나지 않는다', sfxP === true && !!gPop && gPop.gain._lin === undefined && gWave && gWave.gain._lin === 0, { pop: gPop && gPop.gain._lin, wave: gWave && gWave.gain._lin });
  e2.stopMusic(0.1);
  t('⑪-12 stopMusic() — on·타이머 둘 다 꺼진다', e2.state().on === false && e2.state().timer === false);
  T.runAll(); T.runAll();
  t('⑪-13 음악을 끈 뒤 남는 타이머가 없다(상주 타이머 금지)', T.pending() === 0, T.pending());
  /* D. 켜고 끄기 설정 */
  e2.setEnabled(true, false);
  t('⑪-14 효과음 끄기 — sfx 가 false(음악 설정은 그대로)', e2.sfx('pop') === false && e2.state().musicOn === true && e2.state().sfxOn === false);
  e2.setEnabled(false, true);
  t('⑪-15 음악 끄기 — 효과음은 다시 울리고(true) 음악은 안 흐른다', e2.sfx('pop') === true && e2.state().musicOn === false && e2.state().on === false);
  const okRemember = e2.music('tense');
  t('⑪-16 음악이 꺼져 있으면 분위기는 «기억만» 한다(켜지지 않음)', okRemember === true && e2.state().on === false && e2.state().mood === 'tense' && e2.state().timer === false);
  e2.setEnabled(true, true);
  t('⑪-17 다시 켜면 기억한 분위기로 흐른다', e2.state().on === true && e2.state().mood === 'tense' && e2.state().timer === true, e2.state());
  /* E. 장면 들어가기 — 배경음악 «파일» 이 있으면 합성 음악을 끈다 */
  const okEnter = e2.enterScene('space', 'mystery', false);
  t('⑪-18 enterScene(악기 색, 분위기) — 그 분위기로 바꾼다', okEnter === true && e2.state().mood === 'mystery');
  for (let k = 0; k < 10; k++) { c2.currentTime += 0.06; T.runAll(); }
  const okFile = e2.enterScene('jungle', 'wonder', true);
  t('⑪-19 enterScene(…, 배경음악 파일 있음) — 합성 음악을 끈다(on·타이머 꺼짐 · 분위기 비움)', okFile === false && e2.state().on === false && e2.state().timer === false && e2.state().mood === null, e2.state());
  /* F. 신호·대사 줄이기·모르는 이름 */
  t('⑪-20 cue({name}) 는 효과음, cue({mood}) 는 분위기 바꾸기', e2.cue({ name: 'pop' }) === true && e2.cue({ mood: 'calm' }) === true && e2.state().mood === 'calm');
  t('⑪-21 빈 신호 · 모르는 분위기 · 모르는 악기 색은 false', e2.cue({}) === false && e2.cue(null) === false && e2.music('nope') === false && e2.setPalette('nope') === false);
  e2.duck(0.35); const dk = e2.state().duck; e2.duck();
  t('⑪-22 duck(0.35) → 대사 동안 줄이고 duck() → 1 로 되돌린다', dk === 0.35 && e2.state().duck === 1);
  e2.dispose();
  t('⑪-23 dispose() 뒤에는 아무것도 안 울린다', e2.sfx('pop') === false && e2.music('bright') === false && e2.cue({ name: 'pop' }) === false);
  t('⑪-24 위 모든 조작에서 브라우저가 던질 값이 0건', c2.errors.length === 0, c2.errors.slice(0, 3));
  return fails;
}
const soundFails0 = soundChecks(SOUND_SRC, true);
check('⑪-v0 원본 엔진은 ⑪ 엔진 검사를 전부 통과한다(전제)', soundFails0.length === 0, soundFails0);

/* ── 매니페스트 6편의 소리 신호 ── */
{
  const badEp = [];
  let total = 0;
  const pals = new Set();
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const f = join(PUB, 'data', 'dubbing', 'dub-00' + n + '.json');
    if (!existsSync(f)) { badEp.push('dub-00' + n + ':파일없음'); continue; }
    let raw = null;
    try { raw = JSON.parse(rd(f)); } catch (e) { badEp.push('dub-00' + n + ':JSON'); continue; }
    const r = CORE.normalizeEpisode(raw);
    const ep = r.episode;
    const soundProbs = r.problems.filter((p) => /unknown_(sfx|mood|palette)|:sfx\d+:/.test(p));
    if (soundProbs.length) badEp.push(ep.id + ':' + soundProbs[0]);
    if (!raw.palette || CORE.SOUND_PALETTES.indexOf(String(raw.palette)) < 0) badEp.push(ep.id + ':palette');
    pals.add(ep.palette);
    ep.scenes.forEach((sc) => {
      total += sc.sfx.length;
      if (sc.sfx.length < 3) badEp.push(ep.id + '#' + sc.no + ':신호<3');
      if (CORE.SOUND_MOODS.indexOf(sc.mood) < 0) badEp.push(ep.id + '#' + sc.no + ':mood');
      sc.sfx.forEach((c) => {
        if (c.name && CORE.SOUND_SFX.indexOf(c.name) < 0) badEp.push(ep.id + '#' + sc.no + ':sfx:' + c.name);
        if (c.mood && CORE.SOUND_MOODS.indexOf(c.mood) < 0) badEp.push(ep.id + '#' + sc.no + ':cuemood:' + c.mood);
      });
      if (sc.timing === 'turn' && sc.sfx.some((c) => c.slot === 'time')) badEp.push(ep.id + '#' + sc.no + ':차례장면에_시각신호');
      if (sc.timing === 'synced' && CORE.timedCues(sc).length !== sc.sfx.length) badEp.push(ep.id + '#' + sc.no + ':동기장면_시각미정');
    });
  }
  check('⑪-M1 매니페스트 6편 — 소리 문제 0 · 작품 악기 색을 밝힘 · 장면마다 신호 3개 이상 · 모든 이름이 정본 목록 안', badEp.length === 0, badEp.slice(0, 5));
  check('⑪-M2 신호가 «실제로 울릴 자리» 에만 있다(차례 장면엔 시각 신호 없음 · 동기 장면은 전부 영상 시각이 정해짐)', !badEp.some((b) => /차례장면|동기장면/.test(b)));
  check('⑪-M3 6편이 합쳐 신호 150개 이상 · 악기 색 6가지를 고루 쓴다', total >= 150 && pals.size === 6, { total, pals: [...pals] });
}

/* ── 진행기(watch)를 가짜 화면으로 돌린다 ── */
function loadWatch(src) {
  const sb = { module: { exports: {} }, setTimeout, clearTimeout, setInterval, clearInterval, console };
  sb.window = undefined;
  vm.createContext(sb);
  vm.runInContext(src, sb, { filename: 'ai-dubbing-watch.js' });
  return sb.module.exports;
}
const W_SPEED = 200;   // 가짜 영상은 실제 시간의 200배로 흐른다(20초 장면 = 0.1초)
class WMedia {
  constructor(dur) { this.paused = true; this._base = 0; this._at = 0; this.duration = dur; this.readyState = 4; }
  get ended() { return this.currentTime >= this.duration - 0.001; }
  get currentTime() { return this.paused ? this._base : Math.min(this.duration, this._base + (Date.now() - this._at) / 1000 * W_SPEED); }
  set currentTime(v) { this._base = v; this._at = Date.now(); }
  play() { if (this.paused) { this._at = Date.now(); this.paused = false; } return Promise.resolve(); }
  pause() { if (!this.paused) { this._base = this.currentTime; this.paused = true; } }
  addEventListener() {}
}
function watchWorld(W, o) {
  o = o || {};
  const w = { log: [], eng: [], audios: [], routes: [], utters: [], released: [] };
  const eng = {
    cue(c) { w.eng.push(['cue', c]); return true; }, sfx(n) { w.eng.push(['sfx', n]); return true; }, duck(v) { w.eng.push(['duck', v]); },
    enterScene(p, m, b) { w.eng.push(['enter', p, m, b]); return true; }, pause() { w.eng.push(['pause']); }, resume() { w.eng.push(['resume']); },
    stopMusic() { w.eng.push(['stop']); },
  };
  const clipMs = o.clipMs || 15;
  class FAudio {
    constructor() { this.paused = true; this.readyState = 4; this.currentTime = 0; this.duration = 0.5; this.pauses = 0; w.audios.push(this); }
    play() { this.paused = false; clearTimeout(this._t); this._t = setTimeout(() => { this.paused = true; if (this.onended) this.onended(); }, clipMs); return Promise.resolve(); }
    pause() { this.paused = true; this.pauses++; clearTimeout(this._t); }
    addEventListener() {}
  }
  function U(text) { this.text = text; }
  const synth = { speak(u) { w.utters.push(u.text); setTimeout(() => { if (u.onend) u.onend(); }, 10); }, cancel() {}, pause() {}, resume() {} };
  const video = new WMedia(1);
  w.video = video;
  w.kit = {
    C: CORE, opt: { cardMs: o.cardMs || 10, gapMs: 5, endMs: 5, tickMs: 5, stallMs: 400, videoMs: 100 },
    sound: () => eng, Audio: FAudio, release: (el) => w.released.push({ el, paused: el.paused }),
    route: (a, kind) => { w.routes.push(kind); return { cut() {} }; },
    synth, Utter: U,
    tts: (text, spk) => Promise.resolve(o.ttsFail ? null : 'blob:' + spk + ':' + text.length),
    video: () => video,
    prepVideo: (v, sc) => { v.pause(); v.duration = sc.durationSec || 1; v.currentTime = 0; },
    waitVideo: () => Promise.resolve(true),
    showLine: (ep, l) => w.log.push(['line', l.en]), clearLine: () => w.log.push(['clear']),
    card: (it) => w.log.push(['card', it ? (it.end ? 'END' : it.ep.id + '#' + it.scIdx) : null]),
    note: () => {}, onPause: (b) => w.log.push(['pause', b]), onItem: (i, n) => w.log.push(['item', i, n]),
    onSeen: (id, no) => w.log.push(['seen', id, no]), onEnd: (f) => w.log.push(['end', f]),
  };
  w.runner = W.create(w.kit);
  w.lines = () => w.log.filter((x) => x[0] === 'line').length;
  w.seen = () => w.log.filter((x) => x[0] === 'seen').map((x) => x[2]);
  w.items = () => w.log.filter((x) => x[0] === 'item').map((x) => x[1]);
  w.ends = () => w.log.filter((x) => x[0] === 'end').map((x) => x[1]);
  /* 빌린 소리 요소(kit.Audio)가 «전부 · 한 번씩 · 멈춘 채» 돌아왔나 — 화면 쪽 풀(아이폰용)이 새지 않고 남의 소리를 끊지 않게 */
  w.returnedAll = () => w.audios.every((a) => w.released.filter((x) => x.el === a).length === 1) && w.released.filter((x) => w.audios.indexOf(x.el) >= 0).every((x) => x.paused);
  return w;
}
const wsleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wwithin = (p, ms) => Promise.race([Promise.resolve(p).then((v) => ({ v })), wsleep(ms).then(() => ({ timeout: true }))]);
const epOf = (n) => CORE.normalizeEpisode(JSON.parse(rd(join(PUB, 'data', 'dubbing', 'dub-00' + n + '.json')))).episode;
/* WEPT = «차례 모드 + 임시 TTS» 표본. 원래 1편이었는데 1편이 2026-10-21 에 «동기 + 음성 파일» 완성본이 되어 3편(아직 provisional — ⑥-9b 가 못 박음)으로 옮겼다.
   ⛔ 동기 편을 여기 넣지 마세요 — 서버 목소리 실패 → 기기 목소리(⑪-W18) 같은 «차례 모드» 검사가 헛돌거나 거짓 FAIL 이 납니다(⑪-Wt 가 전제로 막습니다). */
const WEPT = epOf(3), WEP4 = epOf(4), WEP6 = epOf(6);

async function watchChecks(src, verbose) {
  const fails = [];
  const t = (name, ok, extra) => { if (!ok) fails.push(name); if (verbose) check(name, ok, extra); };
  let W = null;
  try { W = loadWatch(src); } catch (e) { W = null; }
  t('⑪-W0 진행기를 불러왔다(전제)', !!(W && typeof W.create === 'function'));
  if (!W || typeof W.create !== 'function') return fails;
  t('⑪-Wt 차례 모드 표본(WEPT)은 실제로 전부 «차례 모드 + TTS» 다(전제 — 동기 편이 들어오면 아래 차례 모드 검사가 뜻을 잃는다)', WEPT.scenes.length >= 2 && WEPT.scenes.every((s) => s.timing === 'turn' && s.voiceMode === 'tts'), WEPT.scenes.map((s) => s.timing + '/' + s.voiceMode));
  const two = () => [{ ep: WEPT, scIdx: 0, first: true }, { ep: WEPT, scIdx: 1, first: false }];
  const nLines = WEPT.scenes[0].lines.length + WEPT.scenes[1].lines.length;
  const nCues = WEPT.scenes[0].sfx.length + WEPT.scenes[1].sfx.length;
  /* W1 끝까지 */
  {
    const w = watchWorld(W);
    const r = await wwithin(w.runner.start(two()), 4000);
    const cues = w.eng.filter((x) => x[0] === 'cue').length;
    const ducks = w.eng.filter((x) => x[0] === 'duck').map((x) => x[1]);
    t('⑪-W1 끝까지 보면 finished=true · 두 장면 모두 «봤어요» · 마지막에 onEnd(true)', !r.timeout && r.v === true && JSON.stringify(w.seen()) === '[1,2]' && JSON.stringify(w.ends()) === '[true]', { r, seen: w.seen(), ends: w.ends() });
    t('⑪-W2 대사가 전부 자막에 나온다 · 끝 카드(END) · 끝 팡파르', w.lines() === nLines && w.log.some((x) => x[0] === 'card' && x[1] === 'END') && w.eng.some((x) => x[0] === 'sfx' && x[1] === 'fanfare'), { lines: w.lines(), want: nLines });
    t('⑪-W3 매니페스트의 효과음 신호가 «전부» 울린다(장면 처음·대사 앞뒤·끝)', cues === nCues, { cues, want: nCues });
    t('⑪-W4 장면마다 작품 악기 색 + 장면 분위기로 들어간다 · 대사 동안 음악을 줄였다가 되돌린다', w.eng.some((x) => x[0] === 'enter' && x[1] === WEPT.palette && x[2] === WEPT.scenes[0].mood && x[3] === false) && ducks.indexOf(0.35) >= 0 && ducks[ducks.length - 1] === 1);
    t('⑪-W5 끝나면 진행 상태가 비고 음악을 끈다', w.runner.state().running === false && w.eng.some((x) => x[0] === 'stop'));
    t('⑪-W22a 끝까지 보면 빌린 목소리 요소를 «전부 · 한 번씩 · 멈춘 채» 돌려준다(kit.release)', w.audios.length > 0 && w.returnedAll(), { audios: w.audios.length, released: w.released.length });
  }
  /* W2 다음 — 넘긴 장면은 «봤어요» 가 아니다 */
  {
    const w = watchWorld(W);
    const p = w.runner.start(two());
    await wsleep(30); w.runner.next();
    const r = await wwithin(p, 4000);
    t('⑪-W6 «다음» 으로 넘긴 장면은 «봤어요» 를 안 적는다(끝까지 본 다음 장면만 적음)', !r.timeout && JSON.stringify(w.items()) === '[0,1]' && JSON.stringify(w.seen()) === '[2]', { items: w.items(), seen: w.seen() });
  }
  /* W3 그만 */
  {
    const w = watchWorld(W);
    const p = w.runner.start(two());
    await wsleep(30); w.runner.stop();
    const r = await wwithin(p, 4000);
    t('⑪-W7 «그만» — finished=false · «봤어요» 0 · onEnd(false) · 진행 상태 비움', !r.timeout && r.v === false && w.seen().length === 0 && JSON.stringify(w.ends()) === '[false]' && w.runner.state().running === false, { r, seen: w.seen(), ends: w.ends() });
    t('⑪-W22b «그만» 이어도 빌린 요소를 전부 돌려준다', w.returnedAll(), { audios: w.audios.length, released: w.released.length });
  }
  /* W4 멈춤 — 제목 카드에서 */
  {
    const w = watchWorld(W, { cardMs: 60 });
    const p = w.runner.start([{ ep: WEPT, scIdx: 0, first: true }]);
    w.runner.pause();
    const stP = w.runner.state();
    await wsleep(220);
    const cardsGone = w.log.filter((x) => x[0] === 'card' && x[1] === null).length;
    t('⑪-W8 카드에서 멈추면 카드 시간이 «멈춘다»(220ms 지나도 장면으로 안 넘어감 · 대사 0)', stP.paused === true && cardsGone === 0 && w.lines() === 0, { cardsGone, lines: w.lines() });
    t('⑪-W9 멈춤을 화면·소리 엔진에 알린다(onPause(true) · engine.pause)', w.log.some((x) => x[0] === 'pause' && x[1] === true) && w.eng.some((x) => x[0] === 'pause'));
    w.runner.resume();
    const r = await wwithin(p, 4000);
    t('⑪-W10 이어 가면 끝까지 간다 · onPause(false) · engine.resume', !r.timeout && r.v === true && JSON.stringify(w.seen()) === '[1]' && w.log.some((x) => x[0] === 'pause' && x[1] === false) && w.eng.some((x) => x[0] === 'resume'), { r, seen: w.seen() });
  }
  /* W5 멈춤 — 대사 중 */
  {
    const w = watchWorld(W, { clipMs: 60 });
    const p = w.runner.start([{ ep: WEPT, scIdx: 0, first: true }]);
    for (let k = 0; k < 100 && w.lines() === 0; k++) await wsleep(3);
    await wsleep(10);
    w.runner.pause();
    const n1 = w.lines();
    const playingAtPause = w.audios.filter((a) => !a.paused).length + (w.video.paused ? 0 : 1);
    await wsleep(150);
    const n2 = w.lines();
    const playingLater = w.audios.filter((a) => !a.paused).length + (w.video.paused ? 0 : 1);
    t('⑪-W11 대사 중 멈추면 목소리·영상이 «그 자리에서» 멈추고(재생 중 0) 다음 대사로 안 넘어간다', n1 >= 1 && n1 === n2 && playingAtPause === 0 && playingLater === 0, { n1, n2, playingAtPause, playingLater });
    w.runner.resume();
    const r = await wwithin(p, 5000);
    t('⑪-W12 이어 가면 남은 대사까지 끝난다', !r.timeout && r.v === true && w.lines() === WEPT.scenes[0].lines.length, { r, lines: w.lines() });
  }
  /* W6 이전 */
  {
    const w = watchWorld(W);
    const p = w.runner.start(two());
    let did = false;
    const iv = setInterval(() => { if (!did && w.runner.state().idx === 1) { did = true; setTimeout(() => w.runner.prev(), 15); } }, 3);
    const r = await wwithin(p, 6000);
    clearInterval(iv);
    t('⑪-W13 «이전» 은 한 장면 앞으로 돌아간다(0 → 1 → 0 → 1)', !r.timeout && r.v === true && JSON.stringify(w.items()) === '[0,1,0,1]', { items: w.items() });
  }
  /* W7 동기 장면 — 배경음악 파일 + 캐릭터 음성 (dub-006) */
  {
    const w = watchWorld(W);
    const sc = WEP6.scenes[0];
    const r = await wwithin(w.runner.start([{ ep: WEP6, scIdx: 0, first: true }]), 5000);
    const nVoice = Object.keys(sc.voices).length;
    const kinds = { bgm: w.routes.filter((k) => k === 'bgm').length, voice: w.routes.filter((k) => k === 'voice').length };
    const cues = w.eng.filter((x) => x[0] === 'cue').length;
    t('⑪-W14 동기 장면(dub-006) — 배경음악 파일은 «bgm» 갈래, 캐릭터 음성은 «전부» voice 갈래(아무도 음소거 안 함)', !!sc.bgm && kinds.bgm === 1 && kinds.voice === nVoice && nVoice >= 3, kinds);
    t('⑪-W15 동기 장면 — 합성 음악은 끄고 들어간다(배경음악 파일 있음=true) · 영상 시각 신호가 전부 울린다', w.eng.some((x) => x[0] === 'enter' && x[3] === true) && cues === CORE.timedCues(sc).length, { cues, want: CORE.timedCues(sc).length });
    t('⑪-W16 동기 장면을 끝까지 보면 «봤어요» · 자막이 나온다', !r.timeout && r.v === true && JSON.stringify(w.seen()) === '[' + sc.no + ']' && w.lines() >= 1, { r, seen: w.seen(), lines: w.lines() });
    t('⑪-W22c 동기 장면(배경음악+목소리 ' + (nVoice + 1) + '개)도 빌린 요소를 전부 돌려준다', w.audios.length === nVoice + 1 && w.returnedAll(), { audios: w.audios.length, released: w.released.length });
  }
  /* W8 동기 장면 — 배경음악 파일 없이 캐릭터 음성만 (dub-004) */
  {
    const w = watchWorld(W);
    const sc = WEP4.scenes[0];
    const r = await wwithin(w.runner.start([{ ep: WEP4, scIdx: 0, first: true }]), 6000);
    t('⑪-W17 동기 장면(dub-004, 배경음악 파일 없음) — bgm 갈래 0 · voice 갈래 = 캐릭터 수 · 합성 음악을 «켜고» 들어간다', !r.timeout && r.v === true && w.routes.filter((k) => k === 'bgm').length === 0 && w.routes.filter((k) => k === 'voice').length === Object.keys(sc.voices).length && w.eng.some((x) => x[0] === 'enter' && x[3] === false), { routes: w.routes });
  }
  /* W9 서버 목소리 실패 → 기기 목소리 */
  {
    const w = watchWorld(W, { ttsFail: true });
    const r = await wwithin(w.runner.start([{ ep: WEPT, scIdx: 0, first: true }]), 4000);
    t('⑪-W18 서버 목소리를 못 받으면 기기 목소리로 «그 대사를» 읽는다(대사 수 = 읽은 수)', !r.timeout && r.v === true && w.utters.length === WEPT.scenes[0].lines.length && w.utters[0] === WEPT.scenes[0].lines[0].en, { utters: w.utters.length });
  }
  /* W10 도중에 새 판 */
  {
    const w = watchWorld(W);
    const p1 = w.runner.start(two());
    await wsleep(20);
    const p2 = w.runner.start([{ ep: WEPT, scIdx: 1, first: true }]);
    const [r1, r2] = await Promise.all([wwithin(p1, 4000), wwithin(p2, 4000)]);
    t('⑪-W19 도중에 새 판을 시작하면 옛 판은 조용히 끝나고(onEnd 1번 = 새 판) 새 판이 끝까지 간다', !r1.timeout && !r2.timeout && r2.v === true && JSON.stringify(w.ends()) === '[true]', { ends: w.ends() });
  }
  /* W11 빈 목록 */
  {
    const w = watchWorld(W);
    const r = await wwithin(w.runner.start([{ ep: WEPT, scIdx: 99 }, null]), 1000);
    t('⑪-W20 재생할 장면이 없으면 곧바로 끝난다(onEnd(false) · 끝 카드 없음)', !r.timeout && r.v === false && JSON.stringify(w.ends()) === '[false]' && !w.log.some((x) => x[0] === 'card' && x[1] === 'END'), { r, ends: w.ends() });
  }
  /* W12 동기 장면 — 영상이 «받는 중»(버퍼링)으로 서면 목소리도 같이 서고, 다시 움직이면 같은 시각에서 같이 출발한다
     (2026-10-21 4편 제보 «다른 목소리가 들린다·입과 안 맞는다» — 옛 코드는 0.3초 넘게 벌어질 때 되감기만 하고 목소리를 안 세웠다).
     «짝» — 영상이 안 서면 목소리는 장면 끝 정리 때 한 번만 멈춘다(«언제나 세우기» 도 통과하지 못하게). */
  {
    const runStall = async (stall) => {
      const w = watchWorld(W, { clipMs: 60000 });
      const p = w.runner.start([{ ep: WEP4, scIdx: 0, first: true }]);
      const out = { w, reached: false, heldAll: null, resumedAll: null, nearT: null, stallT: null };
      for (let i = 0; i < 600 && !out.reached; i++) { if (!w.video.paused && w.video.currentTime > 5) out.reached = true; else await wsleep(2); }
      const voices = () => w.audios.slice();
      if (out.reached && stall) {
        w.video.pause(); out.stallT = w.video.currentTime;
        await wsleep(60);
        out.heldAll = voices().length > 0 && voices().every((a) => a.paused);
        w.video.play();
        await wsleep(25);
        out.resumedAll = voices().every((a) => !a.paused);
        out.nearT = voices().every((a) => a.currentTime >= out.stallT - 0.01 && a.currentTime <= out.stallT + 3);
      }
      out.r = await wwithin(p, 6000);
      out.pauses = voices().map((a) => a.pauses);
      return out;
    };
    const [s1, s0] = await Promise.all([runStall(true), runStall(false)]);
    t('⑪-W23 동기 장면(dub-004) — 영상이 서면(버퍼링) 캐릭터 목소리도 «전부» 같이 선다', s1.reached && s1.heldAll === true, { reached: s1.reached, heldAll: s1.heldAll, n: s1.w.audios.length });
    t('⑪-W24 영상이 다시 움직이면 목소리도 «전부» 다시 나오고, 영상이 섰던 시각에서 이어진다', s1.resumedAll === true && s1.nearT === true, { resumed: s1.resumedAll, near: s1.nearT, stallT: s1.stallT, at: s1.w.audios.map((a) => a.currentTime) });
    t('⑪-W25 버퍼링이 지나간 뒤에도 장면은 끝까지 간다(«봤어요»)', !s1.r.timeout && s1.r.v === true, s1.r);
    t('⑪-W26 «짝» — 영상이 안 서면 목소리는 장면 끝 정리 때 한 번만 멈춘다(도중에 세우지 않는다)', s0.reached && !s0.r.timeout && s0.r.v === true && s0.pauses.length > 0 && s0.pauses.every((n) => n === 1), { pauses: s0.pauses, r: s0.r });
    t('⑪-W27 버퍼링 한 번이면 목소리는 «두 번» 멈춘다(버퍼링 1 + 정리 1) — 되감기·멈춤이 되풀이되지 않는다', s1.pauses.length > 0 && s1.pauses.every((n) => n === 2), { pauses: s1.pauses });
  }
  t('⑪-W21 진행기는 마이크·녹음을 쓰지 않는다(getUserMedia·MediaRecorder 0)', !/getUserMedia|MediaRecorder/.test(stripJs(src)));
  return fails;
}
const watchFails0 = await watchChecks(WATCH_SRC, true);
check('⑪-Wv0 원본 진행기는 ⑪ 진행기 검사를 전부 통과한다(전제)', watchFails0.length === 0, watchFails0);

/* ── 화면 배선(ai-dubbing.js · ai-dubbing.html) ── */
function playerWatchChecks(psrc, hsrc, verbose) {
  const fails = [];
  const t = (name, ok, extra) => { if (!ok) fails.push(name); if (verbose) check(name, ok, extra); };
  const pc = stripJs(psrc);
  const iC = hsrc.indexOf('/js/ai-dubbing-core.js?v='), iS = hsrc.indexOf('/js/ai-dubbing-sound.js?v='), iW = hsrc.indexOf('/js/ai-dubbing-watch.js?v='), iP = hsrc.indexOf('/js/ai-dubbing.js?v=');
  t('⑪-P1 싣는 순서: 정본(core) → 소리 엔진 → 진행기 → 화면', iC > 0 && iS > iC && iW > iS && iP > iW, { iC, iS, iW, iP });
  const wBody = cutFn(psrc, 'watcher');
  t('⑪-P2 진행기를 오려 냈다(전제)', !!wBody && /MangoiDubWatch\.create\(/.test(wBody));
  t('⑪-P3 감상 소리는 완성 영상 갈래에 안 잇는다 — 배경음악은 routeBgm(el, true), 목소리는 routeEl(el, 1, true)', /kind === 'bgm' \? routeBgm\(el, true\) : routeEl\(el, 1, true\)/.test(wBody));
  const seenCalls = (pc.match(/markSeen\(/g) || []).length - (pc.match(/function markSeen\(/g) || []).length;
  t('⑪-P4 «봤어요» 는 진행기의 onSeen 한 곳에서만 적는다', seenCalls === 1 && /onSeen: function \(epId, no\) \{ markSeen\(epId, no\);/.test(wBody), seenCalls);
  const sw = cutFn(psrc, 'startWatch'), sr = cutFn(psrc, 'startRun');
  t('⑪-P5 더빙과 감상은 동시에 안 돈다(startWatch·startRun 둘 다 S.run·S.watching 을 본다)', /if \(S\.run \|\| S\.watching/.test(sw) && /if \(S\.run \|\| S\.watching/.test(sr));
  const sceneH = (() => { const i = pc.indexOf("$('dub-scenes').addEventListener('click'"); return i < 0 ? '' : pc.slice(i, pc.indexOf('});', i)); })();
  const iWatch = sceneH.indexOf("closest('button[data-watch]')"), iScene = sceneH.indexOf("closest('button[data-scene]')");
  t('⑪-P6 장면 목록에서 «👀 보기»(data-watch) 를 장면 고르기(data-scene) 보다 «먼저» 판정한다', iWatch > 0 && iScene > iWatch && /watchScene\(wi\); return;/.test(sceneH), { iWatch, iScene });
  t('⑪-P7 소리 엔진은 섞개 위에 «스피커·완성영상» 두 갈래로 만든다 · 설정(음악·효과음)을 엔진에 건다', /MangoiDubSound\.create\(ctx, \[out, rec\]\)/.test(pc) && /e\.setEnabled\(p\.music, p\.sfx\)/.test(pc));
  /* P8 «배경음악 끄기» 가 배경음악 «파일» 에도 걸린다 — setBgmLevel 을 실제로 돌린다 */
  const sbl = cutFn(psrc, 'setBgmLevel');
  let lvl = null;
  try { lvl = new Function('sndPrefs', sbl + '\n;return setBgmLevel;'); } catch (e) { lvl = null; }
  let okLvl = false;
  if (lvl) {
    const run = (music, withGain) => { const h = { r: withGain ? { gain: { gain: { value: 0.5 } } } : {}, el: { muted: false } }; lvl(() => ({ music }))(h); return withGain ? h.r.gain.gain.value : (h.el.muted ? 'muted' : 'on'); };
    okLvl = run(false, true) === 0 && run(true, true) === 1 && run(false, false) === 'muted' && run(true, false) === 'on';
  }
  t('⑪-P8 «🎵 배경음악» 끄기가 배경음악 파일에도 걸린다(꺼짐=0/음소거 · 켜짐=1/소리)', okLvl);
  /* P9 같은 요소를 섞개에 다시 이을 때 소스 노드를 «재사용» 한다 — 브라우저는 두 번째 createMediaElementSource 에 던진다 */
  let okSrc = false, srcInfo = null;
  try {
    const re = new Function('MIX', cutFn(psrc, 'routeEl') + '\n;return routeEl;');
    let made = 0;
    const MIX = { out: {}, rec: {}, ctx: {
      createMediaElementSource(el) { if (el.__made) throw new Error('InvalidStateError'); el.__made = true; made++; return { connect() {}, disconnect() {} }; },
      createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; } } };
    const route = re(MIX);
    const a = {}, b = {};
    const r1 = route(a, 1, true); r1.cut();
    const r2 = route(a, 1, true);
    const r3 = route(b, 1, true);
    srcInfo = { made, r2: !!r2.gain, r3: !!r3.gain };
    okSrc = made === 2 && !!r1.gain && !!r2.gain && !!r3.gain;
  } catch (e) { srcInfo = String(e && e.message); }
  t('⑪-P9 돌려 쓰는 요소를 다시 이어도 소리 길이 살아 있다(소스 노드 재사용 · 다른 요소는 새로 만든다)', okSrc, srcInfo);
  /* P10~P14 아이폰용 «클릭 때 깨워 둔 소리 요소» 풀 — 그 구역을 오려 내 가짜 Audio 로 실제로 돌린다 */
  const i0 = psrc.indexOf('var W_SILENT'), i1 = psrc.indexOf('function watcher()');
  let P = null, made = [], vid = { loads: 0, load() { this.loads++; } }, spoke = [];
  if (i0 > 0 && i1 > i0) {
    try {
      function FA() { this.paused = true; this.loads = 0; this.plays = 0; this.onended = null; this.onerror = null; this.crossOrigin = null; made.push(this); }
      FA.prototype.load = function () { this.loads++; };
      FA.prototype.play = function () { const self = this; this.plays++; this.paused = false; return { then(ok) { self._wake = ok; } }; };
      FA.prototype.pause = function () { this.paused = true; };
      function SU(t) { this.text = t; this.volume = 1; }
      const win = { speechSynthesis: { speak(u) { spoke.push(u); } }, SpeechSynthesisUtterance: SU };
      P = new Function('Audio', '$', 'window', 'SpeechSynthesisUtterance', psrc.slice(i0, i1) + '\n;return { prime: primeWatchAudio, borrow: borrowAudio, ret: returnAudio, pool: function () { return W_POOL; } };')(FA, (id) => (id === 'dub-video' ? vid : null), win, SU);
    } catch (e) { P = null; }
  }
  t('⑪-P10 풀 구역을 오려 냈다(전제)', !!P);
  if (P) {
    P.prime();
    const n0 = made.length, woke = made.every((a) => a.loads >= 1 && a.plays >= 1 && a.__dubPool === true);
    P.prime();
    t('⑪-P11 클릭 때 요소를 미리 깨운다(만들고 load·play) · 두 번 눌러도 더 만들지 않는다 · 영상도 깨운다 · 기기 목소리 첫 마디(소리 0)', n0 >= 6 && woke && made.length === n0 && P.pool().length === n0 && vid.loads === 1 && spoke.length === 1 && spoke[0].volume === 0, { n0, woke, vid: vid.loads, spoke: spoke.length });
    const a = P.pool()[P.pool().length - 1];
    a.onended = () => {}; a.onerror = () => {}; a.crossOrigin = 'anonymous'; a.muted = true;   // 배경음악 끔(setBgmLevel)이 남긴 음소거
    const got = P.borrow();
    t('⑪-P12 빌려줄 때 깨워 둔 요소를 내주고 옛 손잡이(onended·onerror·crossOrigin)와 음소거를 지운다', got === a && got.onended === null && got.onerror === null && got.crossOrigin === null && got.muted === false && P.pool().length === n0 - 1, { muted: got.muted });
    got.play(); const playing = got.paused === false;
    if (typeof a._wake === 'function') a._wake();          // 클릭 때 틀어 둔 «무음» 이 이제야 끝났다 — 빌려 간 소리를 멈추면 안 된다
    t('⑪-P13 빌려 간 뒤 늦게 끝난 무음 재생이 «진짜 소리» 를 멈추지 않는다', playing && got.paused === false);
    got.pause(); P.ret(got); P.ret(got); P.ret(vid); P.ret({}); P.ret(null);
    t('⑪-P14 돌려받기 — 한 번만 넣는다 · 영상·풀 밖 요소는 손대지 않는다', P.pool().length === n0 && P.pool().filter((x) => x === got).length === 1);
    const before = made.length; const all = []; for (let k = 0; k < n0 + 1; k++) all.push(P.borrow());
    t('⑪-P15 풀이 비면 새 요소로 넘어간다(감상이 막히지 않는다)', made.length === before + 1 && all[n0].__dubPool !== true && new Set(all).size === n0 + 1);
  }
  t('⑪-P16 진행기에 풀을 건넨다(Audio: borrowAudio · release: returnAudio)', /Audio: borrowAudio,/.test(wBody) && /release: returnAudio,/.test(wBody));
  /* P17 클릭 «안» 에서 깨우는가 — 글자가 아니라 startWatch·watchAll 을 오려 내 «실제로» 눌러 본다.
   *     (글자로 물으면 `if (false) primeWatchAudio();` 한 글자에 뚫린다 — 2026-10-21 함정 대조 실측)
   *     짝: 막혀 돌아가는 경우(더빙 중·감상 중·받는 중)에는 «안» 깨운다 — 짝이 없으면 «언제나 깨우기» 도 통과한다 */
  const wa = cutFn(psrc, 'watchAll');
  const clickRun = (fnSrc, fnName, opts) => {
    const log = [];
    const S = Object.assign({ run: null, watching: false, ep: { id: 'e1' } }, opts.S || {});
    const names = ['S', 'watcher', 'ensureMix', 'primeWatchAudio', 'applySndPrefs', 'closeSheet', 'setPlayerMode', 'lockUi', 'document', 'setTurn', 'setNote', 'wOnPause',
      'renderWatchPanel', 'renderNudge', 'renderMbar', '$', 'readyFilms', 'watchFilm', 'loadEpFor', 'sceneItems', 'playableIdxs', 'startWatch', 'alert', 'T'];
    const noop = () => {};
    const args = [S, () => ({ start() { log.push('start'); } }), () => log.push('mix'), () => log.push('prime'), noop, noop, noop, noop,
      { body: { classList: { toggle: noop } } }, noop, noop, noop, noop, noop, noop, () => ({ scrollIntoView: noop }),
      () => opts.films || [], () => log.push('watchFilm'), (id) => { log.push('load:' + id); return new Promise(() => {}); },
      () => [], () => [], (it) => log.push('startWatch'), noop, (k) => k];
    let fn = null;
    try { fn = new Function(...names, 'var W_DONE = null, W_LOADING = ' + (opts.loading ? 'true' : 'false') + ';\n' + fnSrc + '\n;return ' + fnName + ';')(...args); } catch (e) { return { err: String(e && e.message) }; }
    try { fn(opts.items); } catch (e) { return { err: String(e && e.message), log }; }
    return { log };
  };
  const one = [{ ep: { id: 'e1' }, scIdx: 0 }], two = [{ id: 'a' }, { id: 'b' }];
  const swOk = clickRun(sw, 'startWatch', { items: one }), swRun = clickRun(sw, 'startWatch', { items: one, S: { run: {} } }), swWatch = clickRun(sw, 'startWatch', { items: one, S: { watching: true } });
  const waOk = clickRun(wa, 'watchAll', { films: two }), waBusy = clickRun(wa, 'watchAll', { films: two, loading: true }), waOne = clickRun(wa, 'watchAll', { films: [{ id: 'a' }] });
  const cnt = (r, k) => (r.log || []).filter((x) => x === k).length;
  const iPrime = (waOk.log || []).indexOf('prime'), iLoad = (waOk.log || []).findIndex((x) => /^load:/.test(x));
  t('⑪-P17 클릭 «안» 에서 깨운다 — startWatch 는 시작하는 그 자리에서 한 번 · watchAll 은 받기 «전» 에 한 번',
    !swOk.err && cnt(swOk, 'prime') === 1 && cnt(swOk, 'start') === 1 && !waOk.err && cnt(waOk, 'prime') === 1 && iPrime >= 0 && iLoad > iPrime,
    { sw: swOk.log || swOk.err, wa: waOk.log || waOk.err });
  t('⑪-P17b 막혀 돌아가면 안 깨운다(더빙 중·감상 중·받는 중) · 한 편뿐이면 watchAll 은 watchFilm 에 넘긴다(그쪽 startWatch 가 깨운다)',
    !swRun.err && !swWatch.err && !waBusy.err && !waOne.err && cnt(swRun, 'prime') === 0 && cnt(swWatch, 'prime') === 0 && cnt(waBusy, 'prime') === 0 && cnt(waOne, 'prime') === 0 && cnt(waOne, 'watchFilm') === 1,
    { swRun: swRun.log || swRun.err, swWatch: swWatch.log || swWatch.err, waBusy: waBusy.log || waBusy.err, waOne: waOne.log || waOne.err });
  return fails;
}
const pwFails0 = playerWatchChecks(PLAYER_SRC_RAW, html, true);
check('⑪-Pv0 원본 화면은 ⑪ 배선 검사를 전부 통과한다(전제)', pwFails0.length === 0, pwFails0);

/* ── ⑪ 변이시험 ── */
const SOUND_MUTANTS = [
  ['효과음 끄기 무시', 'if (st.disposed || !st.sfxOn || st.paused) return false;', 'if (st.disposed) return false;'],
  ['멈춰도 박자 타이머 안 끔', 'st.paused = true;\n      if (st.timer) { clearTimeout(st.timer); st.timer = null; }', 'st.paused = true;'],
  ['배경음악 파일이 있어도 합성 음악 유지', 'if (hasBgmFile) { st.mood = null; if (st.on) stopMusic(0.6); return false; }', 'if (hasBgmFile) { return false; }'],
  ['효과음 레시피 하나 빠짐(pop)', "pop: function (t, S) { tone(S, 'sine', 600, 180, t, 0.09, 0.4); },", ''],
  ['지수 램프를 0 으로(브라우저가 던짐)', 'g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(a + 0.01, dur));', 'g.gain.exponentialRampToValueAtTime(0, t0 + Math.max(a + 0.01, dur));'],
  ['이름 목록 어긋남(pop 빠짐)', "'thunder', 'pop'];\n\n  function mtof", "'thunder'];\n\n  function mtof"],
  ['박자 타이머 다시 안 검(음악이 한 번만 울림)', '      st.timer = setTimeout(tick, 60);', ''],
  ['멈춰도 울리는 효과음은 그대로', '      st.live.splice(0).forEach(function (g) { ramp(g.gain, 0, 0.12); });', ''],
  ['울리는 효과음을 안 들고 있음', '        st.live.push(g);', ''],
  ['멈출 때 효과음을 0 이 아니라 그대로(1)로', '      st.live.splice(0).forEach(function (g) { ramp(g.gain, 0, 0.12); });', '      st.live.splice(0).forEach(function (g) { ramp(g.gain, 1, 0.12); });'],
  ['[조건 뒤집기] 멈춤에서 효과음 끊기를 if (false) 로', '      st.live.splice(0).forEach(function (g) { ramp(g.gain, 0, 0.12); });', '      if (false) st.live.splice(0).forEach(function (g) { ramp(g.gain, 0, 0.12); });'],
];
for (const [name, from, to] of SOUND_MUTANTS) {
  if (SOUND_SRC.indexOf(from) < 0) { check('⑪ 엔진 변이 «' + name + '» — 치환 앵커가 소스에 있다', false, from.slice(0, 60)); continue; }
  let f;
  try { f = soundChecks(SOUND_SRC.replace(from, to), false); } catch (e) { f = ['crash:' + String(e && e.message).slice(0, 60)]; }
  check('⑪ 엔진 변이 «' + name + '» 를 넣으면 실제로 FAIL 이 난다', f.length > 0, f.length ? f.slice(0, 2) : '안 잡힘');
}
const WATCH_MUTANTS = [
  ['넘긴 장면도 «봤어요»', 'if (completed && kit.onSeen)', 'if (kit.onSeen)'],
  ['동기: 캐릭터 음성 빠뜨림', "Object.keys(sc.voices || {}).forEach(function (cid) { addTrack(sc.voices[cid], 'voice'); });", ''],
  ['동기: 목소리 따라가기 삭제', 'follow.step(t, els, clock);', ''],
  ['동기: 옛 0.3초 되감기로 되돌림', 'follow.step(t, els, clock);', "tracks.forEach(function (tr) { if (tr.el !== clock && !tr.el.paused && Math.abs(tr.el.currentTime - t) > 0.3) { try { tr.el.currentTime = t; } catch (e) {} } });"],
  ['[조건 뒤집기] 목소리 따라가기를 if (false) 로', 'follow.step(t, els, clock);', 'if (false) follow.step(t, els, clock);'],
  ['동기: 배경음악을 목소리 갈래로', "if (sc.bgm) addTrack(sc.bgm, 'bgm');", "if (sc.bgm) addTrack(sc.bgm, 'voice');"],
  ['멈춤: 타이머 안 붙잡음', 'run.timers.forEach(function (t) { if (t.id) { clearTimeout(t.id); t.id = null; t.left = Math.max(0, t.left - (now() - t.at)); } });', ''],
  ['멈춤: 소리·영상 안 멈춤', 'run.held.forEach(function (m) { try { m.pause(); } catch (e) {} });', ''],
  ['멈춤: 소리 엔진 안 멈춤', 'if (run.synthOn && kit.synth) { try { kit.synth.pause(); } catch (e) {} }\n      var s = snd(); if (s) s.pause();', 'if (run.synthOn && kit.synth) { try { kit.synth.pause(); } catch (e) {} }'],
  ['끝: 화면에 안 알림', 'if (kit.onEnd) kit.onEnd(!!finished);', ''],
  ['효과음: 대사 뒤 신호 빠짐', "fire(sc, 'line', k, 'after');", ''],
  ['이전: 무시', "run.idx = j === 'prev' ? Math.max(0, run.idx - 1) : run.idx + 1;", 'run.idx = run.idx + 1;'],
  ['기기 목소리 폴백 없음', 'return url ? playClip(run, url, maxMsFor(line)) : speakDevice(run, line.en, maxMsFor(line));', 'return url ? playClip(run, url, maxMsFor(line)) : undefined;'],
  ['새 판이 옛 판 화면을 건드림', 'if (cur !== run) return finished;', ''],
  ['빌린 소리 요소를 안 돌려줌', ' if (kit.release) { try { kit.release(el); } catch (e) {} }', ''],
  ['[조건 뒤집기] 돌려주기를 if (false) 로', ' if (kit.release) { try { kit.release(el); } catch (e) {} }', ' if (false && kit.release) { try { kit.release(el); } catch (e) {} }'],
];
/* 진행기 변이는 실제 시간이 걸린다(한 판 약 3초) — 서로 독립인 가짜 세계라 «동시에» 돌린다 */
const watchMutRes = await Promise.all(WATCH_MUTANTS.map(async ([name, from, to]) => {
  if (WATCH_SRC.indexOf(from) < 0) return [name, null];
  try { return [name, await watchChecks(WATCH_SRC.replace(from, to), false)]; } catch (e) { return [name, ['crash:' + String(e && e.message).slice(0, 60)]]; }
}));
for (const [name, f] of watchMutRes) {
  if (f === null) { check('⑪ 진행기 변이 «' + name + '» — 치환 앵커가 소스에 있다', false); continue; }
  check('⑪ 진행기 변이 «' + name + '» 를 넣으면 실제로 FAIL 이 난다', f.length > 0, f.length ? f.slice(0, 2) : '안 잡힘');
}
const PW_MUTANTS = [
  ['감상 소리를 완성 영상에도 잇기(noRec 빠짐)', 'kind === \'bgm\' ? routeBgm(el, true) : routeEl(el, 1, true)', 'kind === \'bgm\' ? routeBgm(el) : routeEl(el, 1)'],
  ['«봤어요» 배선 끊김', 'onSeen: function (epId, no) { markSeen(epId, no);', 'onSeen: function (epId, no) {'],
  ['더빙 중에도 감상 시작', 'if (S.run || S.watching || !items || !items.length) return;', 'if (S.watching || !items || !items.length) return;'],
  ['«👀 보기» 판정 삭제', "if (w && !w.disabled) { var wi = Number(w.getAttribute('data-watch')); pickScene(wi); watchScene(wi); return; }", ''],
  ['배경음악 끄기가 파일엔 안 걸림', 'var on = sndPrefs().music; if (h.r.gain) h.r.gain.gain.value = on ? 1 : 0; else h.el.muted = !on;', 'if (h.r.gain) h.r.gain.gain.value = 1;'],
  ['소스 노드를 매번 새로 만듦(돌려 쓴 요소가 무음)', 'el.__dubSrc || (el.__dubSrc = MIX.ctx.createMediaElementSource(el))', 'MIX.ctx.createMediaElementSource(el)'],
  ['진행기가 풀을 안 씀', 'Audio: borrowAudio,', 'Audio: window.Audio,'],
  ['모두 이어 보기에서 클릭 때 안 깨움', '    primeWatchAudio();                               // 📱 startWatch 는 받은 «뒤» 라 클릭 밖이다 — 여기서 미리\n', ''],
  ['늦은 무음 끝이 빌려 간 소리를 멈춤', 'if (el.__dubIdle) { try { el.pause(); } catch (e) {} }', 'try { el.pause(); } catch (e) {}'],
  ['같은 요소를 두 번 돌려받음', 'if (!el || !el.__dubPool || el.__dubIdle) return;', 'if (!el || !el.__dubPool) return;'],
  ['빌려줄 때 옛 손잡이를 안 지움', 'a.__dubIdle = false; a.onended = null; a.onerror = null; a.crossOrigin = null;', 'a.__dubIdle = false;'],
  /* 조건 뒤집기 — «삭제» 만 넣으면 글자 검사가 그대로 통과하는 구멍을 못 잰다(2026-10-21 함정 대조) */
  ['[조건 뒤집기] startWatch 에서 if (false) 로 안 깨움', '    primeWatchAudio();                               // 📱 같은 이유 — 목소리 요소도 클릭 안에서 깨워 둔다', '    if (false) primeWatchAudio();                               // 📱 같은 이유 — 목소리 요소도 클릭 안에서 깨워 둔다'],
  ['[조건 뒤집기] watchAll 에서 if (false) 로 안 깨움', '    primeWatchAudio();                               // 📱 startWatch 는 받은 «뒤» 라 클릭 밖이다 — 여기서 미리', '    if (false) primeWatchAudio();                               // 📱 startWatch 는 받은 «뒤» 라 클릭 밖이다 — 여기서 미리'],
  ['watchAll 이 받은 «뒤» 에 깨움', '    primeWatchAudio();                               // 📱 startWatch 는 받은 «뒤» 라 클릭 밖이다 — 여기서 미리\n    W_LOADING = true; renderWatchPanel();\n    Promise.all(films.map(function (f) { return loadEpFor(f.id); })).then(function (eps) {', '    W_LOADING = true; renderWatchPanel();\n    Promise.all(films.map(function (f) { return loadEpFor(f.id); })).then(function (eps) {\n      primeWatchAudio();'],
  ['[조건 뒤집기] 늦은 무음 끝 가드를 언제나 참으로', 'if (el.__dubIdle) { try { el.pause(); } catch (e) {} }', 'if (true) { try { el.pause(); } catch (e) {} }'],
  ['[조건 뒤집기] 돌려받기 가드를 언제나 통과로', 'if (!el || !el.__dubPool || el.__dubIdle) return;', 'if (false) return;'],
  ['빌려줄 때 음소거를 안 지움', '    a.muted = false;                                 // 섞개가 없을 때 배경음악 끔(setBgmLevel)이 남긴 음소거가 다음 목소리로 넘어가지 않게\n', ''],
  ['[조건 뒤집기] 소스 재사용 대신 언제나 새로 만듦', 'el.__dubSrc || (el.__dubSrc = MIX.ctx.createMediaElementSource(el))', '(false && el.__dubSrc) || (el.__dubSrc = MIX.ctx.createMediaElementSource(el))'],
];
for (const [name, from, to] of PW_MUTANTS) {
  if (PLAYER_SRC_RAW.indexOf(from) < 0) { check('⑪ 화면 변이 «' + name + '» — 치환 앵커가 소스에 있다', false, from.slice(0, 60)); continue; }
  let f;
  try { f = playerWatchChecks(PLAYER_SRC_RAW.replace(from, to), html, false); } catch (e) { f = ['crash:' + String(e && e.message).slice(0, 60)]; }
  check('⑪ 화면 변이 «' + name + '» 를 넣으면 실제로 FAIL 이 난다', f.length > 0, f.length ? f.slice(0, 2) : '안 잡힘');
}
{
  const hBad = html.replace('/js/ai-dubbing-watch.js?v=', '/js/__moved__.js?v=') + '\n<script defer src="/js/ai-dubbing-watch.js?v=1"></script>';
  const f = playerWatchChecks(PLAYER_SRC_RAW, hBad, false);
  check('⑪ 화면 변이 «진행기를 화면 뒤에 싣기» 를 넣으면 실제로 FAIL 이 난다', f.length > 0, f.length ? f.slice(0, 2) : '안 잡힘');
}


/* ── ⑫ 목소리가 영상을 따라가는 박자(정본 clockFollower) — 2026-10-21 4편 «다른 목소리가 들린다·입과 안 맞는다» ──
   옛 코드는 0.3초 넘게 벌어질 때 되감기만 했다 — 영상이 받는 중(버퍼링)이면 목소리만 앞서 가고,
   되감기가 되풀이되어 같은 소리가 겹쳐 들렸다. 정본을 가짜 소리 요소·가짜 시계로 «실제로» 돌린다. */
class FEl {
  constructor(t, paused) { this._t = t || 0; this.paused = !!paused; this.seeks = 0; this.plays = 0; this.pauses = 0; }
  get currentTime() { return this._t; }
  set currentTime(v) { this._t = v; this.seeks++; }
  play() { this.paused = false; this.plays++; return Promise.resolve(); }
  pause() { this.paused = true; this.pauses++; }
}
function followerChecks(core, verbose) {
  const fails = [];
  const t = (name, ok, extra) => { if (!ok) fails.push(name); if (verbose) check(name, ok, extra); };
  const mk = core && core.clockFollower;
  t('⑫-0 정본이 clockFollower 를 내보낸다(전제)', typeof mk === 'function');
  if (typeof mk !== 'function') return fails;
  try {
    /* A — 평소: 0.2초 넘게 벌어질 때만 되감고, 되감은 뒤 1초는 다시 안 감는다 */
    let ms = 0;
    const f = mk({ now: () => ms });
    const c = new FEl(0, false), a = new FEl(0, false), b = new FEl(0, true);
    f.step(0, [c, a, b], c);
    ms = 100; a._t = 0.25; f.step(0.1, [c, a, b], c);
    t('⑫-1 0.2초 이내로 벌어지면 되감지 않는다(되감기 반복 = 끊김)', a.seeks === 0, { seeks: a.seeks });
    ms = 200; a._t = 0.8; f.step(0.2, [c, a, b], c);
    t('⑫-2 0.2초보다 벌어지면 영상 시각으로 되감는다', a.seeks === 1 && a.currentTime === 0.2, { seeks: a.seeks, at: a.currentTime });
    ms = 600; a._t = 1.6; f.step(0.6, [c, a, b], c);
    t('⑫-3 되감은 뒤 1초 안에는 다시 되감지 않는다', a.seeks === 1, { seeks: a.seeks });
    ms = 1300; a._t = 2.6; f.step(1.3, [c, a, b], c);
    t('⑫-4 1초가 지나면 다시 되감는다', a.seeks === 2 && a.currentTime === 1.3, { seeks: a.seeks, at: a.currentTime });
    t('⑫-5 시계 요소(영상이 없을 때의 첫 소리)는 건드리지 않는다', c.seeks === 0 && c.pauses === 0 && c.plays === 0, { c });
    t('⑫-6 처음부터 멈춰 있던 요소(자동재생 막힘 등)는 되감지도 깨우지도 않는다', b.seeks === 0 && b.plays === 0 && b.paused === true, { b });

    /* B — 영상이 받는 중(버퍼링): 2박자 동안 안 움직이면 목소리도 같이 세우고, 다시 움직이면 그 시각에서 같이 출발 */
    ms = 0;
    const g = mk({ now: () => ms });
    const c2 = new FEl(1, false), v1 = new FEl(1, false), v2 = new FEl(1, false), q = new FEl(1, true);
    const els = [c2, v1, v2, q];
    const r0 = g.step(1.0, els, c2);
    const r1 = g.step(1.0, els, c2);
    t('⑫-7 한 박자 멈춤은 봐준다(목소리를 바로 세우지 않는다)', r0 === 'ok' && r1 === 'ok' && !v1.paused && !v2.paused, { r0, r1 });
    const r2 = g.step(1.0, els, c2);
    t('⑫-8 두 박자 동안 영상이 안 움직이면 목소리를 «전부» 같이 세운다', r2 === 'hold' && v1.paused && v2.paused && v1.pauses === 1 && v2.pauses === 1 && g.holding() === true, { r2, v1: v1.pauses, v2: v2.pauses });
    t('⑫-9 세울 때도 시계 요소·처음부터 멈춰 있던 요소는 건드리지 않는다', c2.pauses === 0 && q.pauses === 0 && q.plays === 0, { c2: c2.pauses, q: q.pauses });
    const r3 = g.step(1.0, els, c2);
    t('⑫-10 세운 채 기다리는 동안은 다시 세우지 않는다(멈춤을 되풀이하지 않는다)', r3 === 'held' && v1.pauses === 1, { r3, pauses: v1.pauses });
    v1.play();
    const r4 = g.step(1.0, els, c2);
    t('⑫-11 기다리는 동안 누가 다시 틀어도 영상이 안 움직이면 다시 세운다', r4 === 'held' && v1.paused === true, { r4, paused: v1.paused });
    const p0 = v1.plays, p20 = v2.plays;
    const r5 = g.step(1.5, els, c2);
    t('⑫-12 영상이 다시 움직이면 목소리를 «그 시각» 으로 맞춰 «같이» 다시 출발시킨다', r5 === 'resume' && !v1.paused && !v2.paused && v1.currentTime === 1.5 && v2.currentTime === 1.5 && v1.plays === p0 + 1 && v2.plays === p20 + 1 && g.holding() === false, { r5, v1: [v1.paused, v1.currentTime], v2: [v2.paused, v2.currentTime] });
    t('⑫-13 다시 출발할 때도 처음부터 멈춰 있던 요소는 깨우지 않는다', q.paused === true && q.plays === 0, { q });

    /* C — «짝»: 영상이 계속 움직이면 한 번도 안 세운다 */
    const h = mk({ now: () => 0 });
    const c3 = new FEl(0, false), w1 = new FEl(0, false);
    for (let i = 0; i < 40; i++) { w1._t = i * 0.1; h.step(i * 0.1, [c3, w1], c3); }
    t('⑫-14 «짝» — 영상이 계속 움직이면 목소리를 한 번도 세우지 않는다', w1.pauses === 0 && w1.paused === false && h.holding() === false, { pauses: w1.pauses });

    /* D — 빈 값에도 안 죽는다 */
    let crashed = false;
    try { const k = mk(); k.step(undefined, null, null); k.step(1, [null, undefined], null); k.step(1, [null], null); k.step(1, [null], null); } catch (e) { crashed = true; }
    t('⑫-15 시각·요소가 비어도 던지지 않는다(박자가 죽으면 자막·효과음도 함께 멈춘다)', !crashed);
  } catch (e) {
    t('⑫-x 정본을 돌리다 예외가 났다', false, String(e && e.message).slice(0, 80));
  }
  return fails;
}
const followFails0 = followerChecks(CORE, true);
check('⑫-v0 원본 정본은 ⑫ 검사를 전부 통과한다(전제)', followFails0.length === 0, followFails0);
const FOLLOW_MUTANTS = [
  ['버퍼링 때 안 세움', "          try { el.pause(); } catch (e) {}\n          held.push(el);", ''],
  ['다시 출발할 때 시각을 안 맞춤', 'held.splice(0).forEach(function (el) { seek(el, t); play(el); });', 'held.splice(0).forEach(function (el) { play(el); });'],
  ['다시 출발할 때 안 틂', 'held.splice(0).forEach(function (el) { seek(el, t); play(el); });', 'held.splice(0).forEach(function (el) { seek(el, t); });'],
  ['[조건 뒤집기] 움직임 판정을 거꾸로', 'var moved = last === null || t > last + 0.01;', 'var moved = !(last === null || t > last + 0.01);'],
  ['되감기 쉬는 시간 없음', ' || coolingDown(el)) return;', ') return;'],
  ['조금만 벌어져도 되감음', 'if (Math.abs((el.currentTime || 0) - t) > DRIFT) seek(el, t);', 'if (Math.abs((el.currentTime || 0) - t) > 0) seek(el, t);'],
  ['버퍼링 때 시계 요소까지 세움', "          if (!el || el === clockEl || el.paused) return;\n          try { el.pause(); } catch (e) {}", "          if (!el || el.paused) return;\n          try { el.pause(); } catch (e) {}"],
  ['처음부터 멈춰 있던 요소까지 붙잡음', "          if (!el || el === clockEl || el.paused) return;\n          try { el.pause(); } catch (e) {}", "          if (!el || el === clockEl) return;\n          try { el.pause(); } catch (e) {}"],
  ['기다리는 동안 다시 세우지 않음', "if (held.length) { held.forEach(function (el) { if (!el.paused) { try { el.pause(); } catch (e) {} } }); return 'held'; }", "if (held.length) return 'held';"],
  ['한 박자 멈춤도 못 봐줌', 'var STILL = isNum(opt.stillTicks) ? opt.stillTicks : 2;', 'var STILL = isNum(opt.stillTicks) ? opt.stillTicks : 0;'],
  ['[조건 뒤집기] 쉬는 시간 판정을 언제나 거짓으로', 'return nowFn() - seeks[i].at < COOL;', 'return false && nowFn() - seeks[i].at < COOL;'],
];
for (const [name, from, to] of FOLLOW_MUTANTS) {
  if (CORE_SRC.indexOf(from) < 0) { check('⑫ 변이 «' + name + '» — 치환 앵커가 소스에 있다', false, from.slice(0, 60)); continue; }
  let f;
  try { f = followerChecks(loadCore(CORE_SRC.replace(from, to)), false); } catch (e) { f = ['crash:' + String(e && e.message).slice(0, 60)]; }
  check('⑫ 변이 «' + name + '» 를 넣으면 실제로 FAIL 이 난다', f.length > 0, f.length ? f.slice(0, 2) : '안 잡힘');
}

/* ⑫-w 두 화면(먼저 보기 진행기 · 더빙 화면)이 «정본을 부르고» 판정을 복제하지 않는다.
   화면의 동기 박자(setInterval)를 중괄호 짝으로 오려 내 그 «안» 에서 묻는다 — 파일 어딘가에 있는 것으로는 부족하다.
   ⚠️ «if (false) follow.step(…)» 처럼 조건으로 죽이면 글자는 남는다 → 그 호출이 «문장의 시작» 인지(앞 글자가 ; { } 인지)까지 본다. */
function followWireChecks(watchSrc, playerSrc, verbose) {
  const fails = [];
  const t = (name, ok, extra) => { if (!ok) fails.push(name); if (verbose) check(name, ok, extra); };
  const stmtStart = (body, call) => {
    const code = stripJs(body);
    const i = code.indexOf(call);
    if (i < 0) return false;
    const before = code.slice(0, i).replace(/\s+$/, '');
    return /[;{}]$/.test(before);
  };
  const cases = [
    ['먼저 보기(ai-dubbing-watch.js)', watchSrc, 'var timer = setInterval(function () {', 'follow.step(t, els, clock);'],
    ['더빙 화면(ai-dubbing.js)', playerSrc, 'var tick = setInterval(function () {', 'follow.step(t, els, v);'],
  ];
  for (const [label, src, head, call] of cases) {
    const code = stripJs(src);
    const body = literalAt(src, head);
    t('⑫-w1 ' + label + ' — 동기 박자(setInterval)를 오려 냈다(전제)', !!body);
    t('⑫-w2 ' + label + ' — 정본 C.clockFollower 로 따라가기를 만든다', /var follow = C\.clockFollower\(/.test(code));
    t('⑫-w3 ' + label + ' — 따라갈 요소 = 캐릭터 음성 요소 전부', /els = tracks\.map\(function \(tr\) \{ return tr\.el; \}\)/.test(code));
    t('⑫-w4 ' + label + ' — 박자 «안» 에서 «조건 없이» 따라가기를 부른다', !!body && stmtStart(body, call), body ? stripJs(body).slice(0, 160) : null);
    t('⑫-w5 ' + label + ' — 옛 0.3초 되감기(판정 복제)가 남아 있지 않다', !/currentTime\s*-\s*t\)\s*>/.test(code));
  }
  return fails;
}
const wireFails0 = followWireChecks(WATCH_SRC, PLAYER_SRC_RAW, true);
check('⑫-wv0 원본 화면은 ⑫-w 검사를 전부 통과한다(전제)', wireFails0.length === 0, wireFails0);
const OLD_RESYNC_PLAYER = 'tracks.forEach(function (tr) { if (!tr.el.paused && Math.abs(tr.el.currentTime - t) > 0.3) { try { tr.el.currentTime = t; } catch (e) {} } });';
const WIRE_MUTANTS = [
  ['player', '더빙 화면: 따라가기 삭제', 'follow.step(t, els, v);', ''],
  ['player', '더빙 화면: 옛 0.3초 되감기로 되돌림', 'follow.step(t, els, v);', OLD_RESYNC_PLAYER],
  ['player', '[조건 뒤집기] 더빙 화면: if (false) 로', 'follow.step(t, els, v);', 'if (false) follow.step(t, els, v);'],
  ['player', '[조건 뒤집기] 더빙 화면: false && 로', 'follow.step(t, els, v);', 'false && follow.step(t, els, v);'],
  ['player', '더빙 화면: 정본 대신 빈 객체', 'var follow = C.clockFollower(), els', 'var follow = { step: function () {} }, els'],
  ['watch', '먼저 보기: 정본 대신 빈 객체', 'var follow = C.clockFollower({ now: now }), els', 'var follow = { step: function () {} }, els'],
];
for (const [which, name, from, to] of WIRE_MUTANTS) {
  const src = which === 'player' ? PLAYER_SRC_RAW : WATCH_SRC;
  if (src.indexOf(from) < 0) { check('⑫-w 변이 «' + name + '» — 치환 앵커가 소스에 있다', false, from.slice(0, 60)); continue; }
  const m = src.replace(from, to);
  const f = which === 'player' ? followWireChecks(WATCH_SRC, m, false) : followWireChecks(m, PLAYER_SRC_RAW, false);
  check('⑫-w 변이 «' + name + '» 를 넣으면 실제로 FAIL 이 난다', f.length > 0, f.length ? f.slice(0, 2) : '안 잡힘');
}

console.log(`\n🎬 ai_dubbing_harness — PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
