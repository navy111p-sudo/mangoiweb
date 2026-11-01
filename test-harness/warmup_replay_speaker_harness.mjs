// 웜업 «다시 듣기» 는 그 말풍선을 말한 사람의 목소리로 읽는다 (2026-10-17 사장님 제보
// 「Lily 와 Noah 목소리가 처음과 다르게 변해」).
//  - 다시 듣기(btn.__who)는 그 사람 speaker 로 읽고, 「번갈아」 차례(_mixIdx)를 넘기지 않는다
//  - 대화 차례(btn 없음)는 예전 그대로 nextSpeaker() 를 탄다 (짝)
//  - 서버가 다른 화자로 대체해 오면 첫 번째는 재생하지 않고 한 번 더 묻는다
// speak()·_stopSpeak()·_ttsSpeak() 를 소스에서 중괄호 짝으로 오려 내 가짜 부품으로 «실제로» 돌린다.
import fs from 'node:fs';
const SRC = process.env.WARMUP_SRC || 'cloudflare-deploy/public/warmup.html';
const s = fs.readFileSync(SRC, 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); } };

function bodyOf(sig) {
  const i = s.indexOf(sig); if (i < 0) return '';
  const j = s.indexOf('{', i); let d = 0;
  for (let k = j; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return s.slice(i, k + 1); } }
  return '';
}
const fSpeak = bodyOf('function speak(text, btn){');
const fStop = bodyOf('function _stopSpeak(){');
const fTts = bodyOf('function _ttsSpeak(text, spk, key, btn, seq, done, play, tryNo){');
const fFits = bodyOf('function _replayFits(p){');
ok('전제: speak·_stopSpeak·_ttsSpeak·_replayFits 를 오려 냈다', !!(fSpeak && fStop && fTts && fFits));

// ── ① 다시 듣기 / 대화 차례 ─────────────────────────────────
function runSpeak(btn) {
  const log = { speakers: [], faces: [], nextCalls: 0 };
  const env = `
    var VOICE_MODES = { emma:{speaker:'asteria',char:'emma',g:'female'}, jake:{speaker:'odysseus',char:'jake',g:'male'},
                        lily:{speaker:'thalia',char:'lily',g:'female'}, noah:{speaker:'aries',char:'noah',g:'male'}, mix:{} };
    var _replayWho=null, _speakSeq=0, _warmEpoch=0, _warmPaused=false, _speechOn=true, _latCur=null, _lastAiSpeak='', _ttsAudio=null, _stmCur=null, _mixIdx=2;
    var warmupRatePreference={loaded:true}, _speakLiveNext=null, _ttsCache={}, _ttsEng={};
    var window={ MangoAvatar:{ plainStop:function(){}, setCharacter:function(c){ LOG.faces.push(c); } }, speechSynthesis:null };
    var MangoAvatar = window.MangoAvatar;
    function isZh(){ return false; } function _voiceGender(){ return 'female'; } function _zhMaleVoiceReady(){ return false; }
    function _zhMaleWanted(){ return false; } function _speechText(t){ return t; } function _autoHook(){}
    function applyVoiceFace(){ LOG.faces.push('restore'); }
    function nextSpeaker(){ LOG.nextCalls++; _mixIdx++; return 'thalia'; }
    function _speechChunks(t){ return [t]; } function _zhDeepen(){} function _zhDeepFailedOnce(){} function _synthSpeak(){}
    function _ttsSpeak(text, spk){ LOG.speakers.push(spk); }
    ${fFits}
    ${fStop}
    ${fSpeak}
    speak('Hello there.', BTN);
    return { mix:_mixIdx, who:_replayWho };`;
  try { const r = new Function('LOG', 'BTN', env)(log, btn); return { ...log, ...r }; }
  catch (e) { return { ...log, err: e.message }; }
}
const btn = { __who: 'noah', classList: { add() {}, remove() {} } };
const a = runSpeak(btn);
ok('다시 듣기는 말한 사람(noah=aries) 목소리로 읽는다', a.speakers[0] === 'aries', JSON.stringify(a));
ok('다시 듣기는 nextSpeaker 를 부르지 않는다(차례를 안 넘김)', a.nextCalls === 0 && a.mix === 2, JSON.stringify(a));
ok('다시 듣기 동안 얼굴도 그 사람으로', a.faces.includes('noah'), JSON.stringify(a));
const b = runSpeak(null);
ok('대화 차례(btn 없음)는 예전처럼 nextSpeaker 를 탄다 (짝)', b.nextCalls === 1 && b.speakers[0] === 'thalia', JSON.stringify(b));
const c = runSpeak({ classList: { add() {}, remove() {} } });
ok('__who 가 없는 버튼은 예전 경로 (짝)', c.nextCalls === 1, JSON.stringify(c));

// ── ② 서버 대체 화자는 첫 번째에 재생하지 않는다 ───────────────
async function runTts(gotFirst, gotSecond) {
  const played = []; let calls = 0;
  const env = `
    var _speakSeq=1, _ttsCache={}, _ttsEng={}, _warmLang='en', _ttsFellBack=false;
    function _zhMaleWanted(){ return false; } function addMsg(){} function _synthSpeak(){ PLAYED.push('device'); }
    var URL={ createObjectURL:function(b){ return 'blob:'+b; } };
    function setTimeout(f){ f(); }
    function fetch(){ CALLS.n++; var got = CALLS.n===1 ? GOT1 : GOT2;
      return Promise.resolve({ ok:true, status:200, headers:{ get:function(h){ return h==='content-type'?'audio/mpeg':(h==='X-TTS-Speaker'?got:'aura-2'); } },
        blob:function(){ return Promise.resolve(got); } }); }
    ${fTts}
    _ttsSpeak('Hi.', 'thalia', 'thalia|Hi.', null, 1, function(){}, function(u){ PLAYED.push(u); }, 0);`;
  const box = { n: 0 };
  new Function('PLAYED', 'CALLS', 'GOT1', 'GOT2', env)(played, box, gotFirst, gotSecond);
  await new Promise(r => setTimeout(r, 30));
  return { played, calls: box.n };
}
const t1 = await runTts('hera', 'thalia');
ok('대체 화자(hera)가 오면 재생하지 않고 다시 묻는다 → 고른 목소리로 재생', t1.calls === 2 && t1.played.length === 1 && t1.played[0] === 'blob:thalia', JSON.stringify(t1));
const t2 = await runTts('hera', 'hera');
ok('두 번째도 대체면 그대로 재생한다(무음보다 낫다) (짝)', t2.calls === 2 && t2.played[0] === 'blob:hera', JSON.stringify(t2));
const t3 = await runTts('thalia', 'thalia');
ok('정상 응답은 한 번에 재생 (짝)', t3.calls === 1 && t3.played[0] === 'blob:thalia', JSON.stringify(t3));

// ── ③ 미리받기 경로도 대체 화자를 재생하지 않는다 ──────────────
const pf = (s.match(/if\(!o \|\| \(o\.got && o\.got!==spk\)\)\{ viaTts\(\); return; \}/g) || []).length;
ok('미리받기 두 곳(조각·스트림)이 대체 화자를 다시 묻는다', pf === 2, 'found=' + pf);

console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
