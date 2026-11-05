// Local-only repeated shipped entry UI and real Chromium RTP/ICE restart checks.
// Mock signaling/identity for entry; real peers + synthetic tones for transport.
// No credentials, production APIs, external ICE servers or deployment mutations.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium } from './_pw.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PUB = join(ROOT, 'cloudflare-deploy/public');
const PORT = 8931;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = resolve(process.env.STRESS_OUTPUT || 'work/classroom-stress');
await mkdir(OUT, { recursive: true });
const pw = loadPlaywright();
const exe = process.env.CHROME_EXECUTABLE || findChromium();
assert(pw && exe, 'Playwright and Chrome required; no passing skips');
const browser = await pw.chromium.launch({ executablePath: exe, chromiumSandbox: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-background-networking'] });
let pass = 0, fail = 0;
const results = [];
const ok = (name, condition, detail) => {
  if (!condition) { fail++; throw Error(name + ': ' + (detail || 'failed')); }
  pass++;
};
const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2' };
async function isolate(context) {
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== BASE) return route.abort('blockedbyclient');
    if (url.pathname === '/__rtc_fixture') return route.fulfill({ contentType:'text/html', body:'<!doctype html><title>Local RTP fixture</title>' });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ contentType:'application/json', body:'{}' });
    const file = resolve(PUB, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(PUB + sep)) return route.abort('blockedbyclient');
    try { return await route.fulfill({ contentType:mime[extname(file)] || 'application/octet-stream', body:await readFile(file) }); }
    catch { return route.fulfill({ status:404, body:'' }); }
  });
}
async function entry(index) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await isolate(context);
  try {
  await page.setViewportSize({ width: 1280, height: 900 });
  /* ⚠️ alert/confirm 을 받아 주지 않으면 페이지가 «거기서 멈춘다» — 아무 일도 안 일어난
     것처럼 보여 엉뚱한 곳을 뒤지게 된다. 무엇이 떴는지 남기고 닫는다. */
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message().slice(0, 120)); try { await d.dismiss(); } catch (_) {} });
  const perrs = [];
  page.on('pageerror', e => perrs.push(String(e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  /* ⚠️ playwright 의 waitForSelector 는 기본이 «보일 때까지» 다. 로비 입력칸은 아직 숨은
     뷰 안에 있어서 그대로 두면 30초 뒤 타임아웃이 난다 — «붙어 있으면» 으로 기다린다. */
  await page.waitForSelector('#vc-name-input', { state: 'attached', timeout: 30000 });
  await new Promise(r => setTimeout(r, 800));   // 초기화 스크립트 안정화

  // ── 계측기 설치: 장치 열림·TURN 왕복·소켓을 «관찰만» 한다 ──
  await page.evaluate(() => {
    window.__gum = [];       // getUserMedia 호출마다 제약을 기록
    window.__turn = 0;       // /api/turn-config 왕복 횟수
    window.__ws = [];
    window.__stopped = 0;    // 트랙 stop() 횟수

    const realGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      window.__gum.push(JSON.parse(JSON.stringify(c || {})));
      const s = await realGum(c);
      s.getTracks().forEach(t => {
        const rs = t.stop.bind(t);
        t.stop = function () { window.__stopped++; return rs(); };
      });
      return s;
    };

    const RealWS = window.WebSocket;
    window.WebSocket = function (url) {
      window.__ws.push(String(url));
      return { url: String(url), readyState: 0, send() {}, close() {},
               addEventListener() {}, removeEventListener() {} };
    };
    window.WebSocket.OPEN = RealWS.OPEN;

    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const u = String((input && input.url) || input || '');
      if (u.includes('/api/turn-config')) {
        window.__turn++;
        return new Response(JSON.stringify({ iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'turn:fake.turn:3478', username: 'u', credential: 'c' }
        ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (u.includes('/api/class/sessions/today')) {
        return new Response(JSON.stringify(window.__sessions), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      /* 🔴 함정 — mango-consent.js 가 vcJoinRoom 을 «감싸고» 있다. 동의 기록이 없으면
         입장 전에 모달을 띄우고 사람이 누를 때까지 기다린다. 그 상태로 계측하면
         getUserMedia 0회·TURN 0회가 나와 «입장이 통째로 깨졌다» 로 오독하게 된다
         (실제로 여기서 한참 헤맸다 — 화면도 조용하고 에러도 안 난다).
         → 이미 동의한 계정으로 응답해 그 모달을 건너뛴다. */
      if (u.includes('/api/consents/')) {
        return new Response(JSON.stringify({
          user_id: 'stu_test', consent_version: 'v1.0-2026-08',
          recording_consent: 1, recording: 1, attendance: 1
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (u.includes('/api/')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return realFetch(input, init);
    };
  });

  // ── 오늘 입장 가능한 예약 하나를 만들어 둔다(정상 입장 경로) ──
  const roomId = await page.evaluate(role => {
    const now = Date.now();
    const k = new Date(now + 9 * 3600 * 1000), p = n => (n < 10 ? '0' : '') + n;
    const ymd = '' + k.getUTCFullYear() + p(k.getUTCMonth() + 1) + p(k.getUTCDate());
    const rid = 'class-9001-' + ymd;
    window.__sessions = { sessions: [{
      schedule_id: 9001, room_id: rid, student_uid: 'stu_test', student_name: '테스트학생',
      teacher_id: '1', teacher_name: '테스트강사',
      start_ts: now, end_ts: now + 1800000, open_at_ts: now - 600000, close_at_ts: now + 2700000,
      duration_min: 30, status: 'live', join_open: true, starts_in_ms: 0,
    }], student_gate: 'off' };
    window.getCurrentUser = () => ({ uid: 'stu_test', name: '테스트학생', role, teacher_id: '1' });
    window.vcMyRole = role;
    document.getElementById('vc-name-input').value = '테스트학생';
    document.getElementById('vc-roomcode-input').value = '';
    const g = document.getElementById('vc-class-gate'); if (g) g.remove();
    // 계측은 «입장 버튼을 누른 뒤» 부터 — 페이지 로드 때의 호출은 세지 않는다
    window.__gum = []; window.__turn = 0; window.__ws = []; window.__stopped = 0;
    return rid;
  }, process.env.ENTRY_ROLE || 'student');

  // ★ 진짜 입장 버튼을 누른다
  const clicked = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button'))
      .find(x => (x.getAttribute('onclick') || '').includes('vcJoinRoom'));
    if (!b) return false; b.click(); return true;
  });
  await page.waitForFunction(() => document.body.classList.contains('vc-in-call') && window.__ws.length > 0, null, { timeout: 15000 });

  const r = await page.evaluate(() => ({
    gum: window.__gum, turn: window.__turn, ws: window.__ws, stopped: window.__stopped,
    inCall: document.body.classList.contains('vc-in-call'),
    role: window.vcMyRole,
    roomId: String((typeof vcRoomId !== 'undefined' ? vcRoomId : '') || ''),
    liveTracks: (function () {
      try { return (vcLocalStream ? vcLocalStream.getTracks() : []).filter(t => t.readyState === 'live').length; }
      catch (e) { return -1; }
    })(),
    permLeak: !!window.__vcPermStream,
  }));

  console.log('\n📋 실측: getUserMedia ' + r.gum.length + '회, TURN 왕복 ' + r.turn +
              '회, stop() ' + r.stopped + '회, 살아있는 트랙 ' + r.liveTracks);
  console.log('   제약: ' + JSON.stringify(r.gum));

  console.log('\n── 입장이 정상인가(회귀 확인) ──');
  ok('입장 버튼이 눌린다', clicked);
  ok('입장 역할 유지', r.role === (process.env.ENTRY_ROLE || 'student'));
  ok('예약방으로 들어간다', r.roomId === roomId, 'roomId=' + r.roomId);
  ok('수업 화면으로 전환된다', r.inCall);
  ok('그 방으로 접속을 시도한다', r.ws.some(u => u.includes(encodeURIComponent(roomId))), JSON.stringify(r.ws));
  ok('로컬 스트림에 살아있는 트랙이 있다', r.liveTracks > 0, '트랙 ' + r.liveTracks + '개');

  console.log('\n── 낭비가 사라졌는가(이번 수정의 핵심) ──');
  // 카메라를 요구한 gUM 만 센다(오디오 전용 폴백은 장치 열림 비용이 다르다)
  const camOpens = r.gum.filter(c => c && c.video && c.video !== false).length;
  ok('카메라를 «한 번만» 연다 (예전 2회)', camOpens === 1, '카메라 요구 gUM ' + camOpens + '회');
  ok('입장 중 TURN 왕복이 1회 이하 (예전 2회)', r.turn <= 1, 'TURN ' + r.turn + '회');
  ok('열자마자 버리는 트랙이 없다', r.stopped === 0, 'stop() ' + r.stopped + '회');
  ok('첫 카메라부터 해상도 상한이 걸려 있다(bare video:true 금지)',
     camOpens === 1 && r.gum.some(c => c && c.video && c.video.width),
     JSON.stringify(r.gum.map(c => c && c.video)));
  ok('권한용 스트림이 새지 않는다(소비 완료)', !r.permLeak);

  ok('입장 중 스크립트 오류 없음', perrs.length === 0, perrs.join(' | '));
  if (dialogs.length) console.log('   (뜬 안내창: ' + JSON.stringify(dialogs) + ')');



  } finally { await context.close(); }
}
const source = await readFile(join(PUB, 'js/idx-main.js'), 'utf8');
const tuneStart = source.indexOf('function vcTuneAudioSdp(');
const tune = source.slice(tuneStart, source.indexOf('\n/*', tuneStart));
async function transport(index) {
  const context = await browser.newContext({ serviceWorkers:'block' });
  await isolate(context);
  const page = await context.newPage();
  try {
    await page.goto(BASE + '/__rtc_fixture');
    await page.addScriptTag({ content: tune });
    const result = await page.evaluate(async index => {
      const delay = ms => new Promise(r => setTimeout(r, ms));
      const ac = new AudioContext(); await ac.resume();
      const peers = [new RTCPeerConnection({ iceServers:[] }), new RTCPeerConnection({ iceServers:[] })];
      const oscillators = [], gains = [], streams = [], pending = [[], []], errors = [];
      const media = [], analysers = [];
      const silentSink=ac.createGain();silentSink.gain.value=0;silentSink.connect(ac.destination);
      for (let i=0;i<2;i++) {
        const oscillator=ac.createOscillator(), gain=ac.createGain(), dest=ac.createMediaStreamDestination();
        oscillator.frequency.value=330 + i*110; gain.gain.value=0.12;
        oscillator.connect(gain).connect(dest); oscillator.start();
        oscillators.push(oscillator); gains.push(gain); streams.push(dest.stream);
        dest.stream.getTracks().forEach(t=>peers[i].addTrack(t,dest.stream));
        peers[i].ontrack=e=>{ const analyser=ac.createAnalyser();ac.createMediaStreamSource(e.streams[0]).connect(analyser);analyser.connect(silentSink);analysers[i]=analyser; const a=document.createElement('audio');a.srcObject=e.streams[0];a.muted=true;document.body.append(a);media.push(a);a.play().catch(error=>errors.push(String(error))); };
        peers[i].onicecandidate=e=>{
          if (!e.candidate) return;
          const j=1-i;
          if (!peers[j].remoteDescription) pending[j].push(e.candidate);
          else peers[j].addIceCandidate(e.candidate).catch(error=>errors.push(String(error)));
        };
      }
      async function negotiate(restart) {
        const offer = await peers[0].createOffer({ iceRestart:restart });
        offer.sdp = vcTuneAudioSdp(offer.sdp);
        await peers[0].setLocalDescription(offer);
        await delay(index % 5 * 30);
        await peers[1].setRemoteDescription(offer);
        for(const candidate of pending[1].splice(0)) await peers[1].addIceCandidate(candidate);
        const answer=await peers[1].createAnswer(); answer.sdp=vcTuneAudioSdp(answer.sdp);
        await peers[1].setLocalDescription(answer); await peers[0].setRemoteDescription(answer);
        for(const candidate of pending[0].splice(0)) await peers[0].addIceCandidate(candidate);
      }
      async function inbound() {
        return Promise.all(peers.map(async (pc, i) => {
          const stats=await pc.getStats(); let packets=0,energy=0;
          stats.forEach(s=>{if(s.type==='inbound-rtp' && s.kind==='audio'){packets+=s.packetsReceived||0;energy+=s.totalAudioEnergy||0;}});
          const samples=new Float32Array(2048);analysers[i]?.getFloatTimeDomainData(samples);
          const rms=Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length);
          return {packets,energy,rms};
        }));
      }
      async function waitAudio(before) {
        const until=Date.now()+12000;
        while(Date.now()<until) {
          const current=await inbound();
          if (current.every((s,i)=>s.packets>before[i].packets+3 && s.rms>0.01) && peers.every(p=>p.connectionState==='connected')) return current;
          await delay(80);
        }
        throw Error('No bidirectional decoded audio: '+JSON.stringify({stats:await inbound(),states:peers.map(p=>p.connectionState),audioState:ac.state,errors}));
      }
      try {
        await negotiate(false);
        const first=await waitAudio([{packets:0,energy:0},{packets:0,energy:0}]);
        const ufrag=peers[0].localDescription.sdp.match(/a=ice-ufrag:(.*)/)[1];
        await negotiate(true);
        if(peers[0].localDescription.sdp.match(/a=ice-ufrag:(.*)/)[1]===ufrag) throw Error('ICE restart did not rotate credentials');
        let after=await waitAudio(first);
        // Negative control: prove the analyser hears the remote sender, not a
        // local oscillator or cached statistic. Both sides are exercised.
        if(index%5===0) for(let sender=0;sender<2;sender++) {
          gains[sender].gain.value=0;
          const until=Date.now()+4000;let silent=false;
          while(Date.now()<until){const stats=await inbound();if(stats[1-sender].rms<0.001){silent=true;break;}await delay(80);}
          if(!silent) throw Error('Mute control did not silence remote decoded waveform');
          gains[sender].gain.value=0.12;
          after=await waitAudio(after);
        }
        if(errors.length) throw Error(errors.join(';'));
        return {first,after,playbackElements:media.length, audioContextState:ac.state};
      } finally {
        peers.forEach(p=>p.close());oscillators.forEach(o=>o.stop());streams.forEach(s=>s.getTracks().forEach(t=>t.stop()));
        media.forEach(a=>{a.srcObject=null;a.remove();});await ac.close();
      }
    }, index);
    assert(result.after.every((s,i)=>s.packets>result.first[i].packets && s.rms>0.01));
    return result;
  } finally { await context.close(); }
}
async function batch(kind, count, run) {
  let next=0;
  async function worker() {
    for (;;) {
      const index=next++; if(index>=count) return;
      const started=Date.now();
      try { const evidence=await run(index); results.push({kind,index,passed:true,ms:Date.now()-started,evidence}); }
      catch(error){ results.push({kind,index,passed:false,ms:Date.now()-started,error:String(error.stack)});console.error('FAILED',kind,index,String(error)); }
      if(results.length%10===0) console.log('PROGRESS',results.length, 'failures',results.filter(x=>!x.passed).length);
    }
  }
  await Promise.all([worker(),worker()]);
}
try {
  await batch('shipped-entry-' + (process.env.ENTRY_ROLE || 'student'),Number(process.env.ENTRY_ROUNDS||100),entry);
  await batch('real-rtp-restart',Number(process.env.RTC_ROUNDS||100),transport);
} finally {
  await browser.close();
  const summary={browser:browser.version(),entryAssertions:pass,failedAssertions:fail,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,results};
  await writeFile(join(OUT,'browser-stress.json'),JSON.stringify(summary,null,2));
  console.log('RESULT',JSON.stringify({...summary,results:undefined}));
  process.exitCode=summary.failed?1:0;
}
