import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../cloudflare-deploy/public/student-game-avatar.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('var hatchAudio ='), html.indexOf('\nfunction canvasCutscene'));
let started = 0, stopped = 0, reveal, videoExists = true;
const node = () => ({
  connect(){}, disconnect(){}, start(){ started++; }, stop(){ stopped++; },
  frequency: {}, gain: { setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }
});
class AudioContext {
  state = 'suspended'; currentTime = 0; sampleRate = 44100; destination = {};
  resume(){ this.state = 'running'; return Promise.resolve(); }
  createBuffer(_, length){ return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource(){ return node(); }
  createGain(){ return node(); }
  createOscillator(){ return node(); }
}
const video = {style:{}, pause(){}, play(){return Promise.resolve();}, currentTime:0};
const context = vm.createContext({
  window: { AudioContext }, document: { addEventListener(){} }, Math,
  cutVid:video, cutCv:{style:{}}, cutEl:{classList:{add(){}}},
  cutText:{querySelector:()=>({})}, ST:{species:'fox'},
  SPECIES:{fox:{tiers:[{}, {ko:'여우',en:'Fox'}, {ko:'파일럿',en:'Pilot'}]}},
  LS:{}, lsSet(){}, setTimeout(){}, endCutscene(){ context.stopHatchSound(); },
  canvasCutscene(_tier,_finish,onReveal){ reveal = onReveal; },
  fetch:async()=>({ok:videoExists})
});
vm.runInContext(source, context);
context.unlockHatchAudio();
assert.equal(context.hatchAudio.state, 'running', '클릭으로 오디오를 준비한다');
context.playCutscene(1);
await new Promise(resolve=>setImmediate(resolve));
video.currentTime = 1.4; video.ontimeupdate();
assert.equal(started,0,'부화 전에는 재생하지 않는다');
video.currentTime = 1.5; video.ontimeupdate(); video.ontimeupdate();
assert.equal(started,4,'부화 때 파열음과 세 음을 한 번 재생한다');
context.cutEnd();
assert.equal(context.hatchSoundNodes.length,0,'건너뛰면 오디오 소스를 정리한다');
assert.equal(stopped,7,'음표 예약 종료와 건너뛰기 종료가 연결되어 있다');
videoExists = false;
context.playCutscene(1);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(started,4,'대체 애니메이션도 부화 순간을 기다린다');
reveal(); reveal();
assert.equal(started,8,'대체 애니메이션에서도 한 번 재생한다');
context.cutEnd();
context.playCutscene(2);
await new Promise(resolve=>setImmediate(resolve));
reveal();
assert.equal(started,8,'이후 진화에는 부화음을 반복하지 않는다');
context.hatchAudio = null;
assert.doesNotThrow(()=>context.playHatchSound(),'오디오 미지원이어도 게임이 계속된다');
console.log('PASS: 부화 전/후·중복 방지·건너뛰기·영상 폴백·이후 진화·오디오 미지원');
