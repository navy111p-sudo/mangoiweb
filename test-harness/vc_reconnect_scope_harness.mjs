// Execute production offer/recovery functions with deferred signaling and a fake clock.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync(process.env.MAIN_SOURCE || new URL('../cloudflare-deploy/public/js/idx-main.js', import.meta.url), 'utf8');
const offer = source.slice(source.indexOf('async function vcCreatePeerAndOffer('), source.indexOf('function vcApplyLowPower('));
const recovery = source.slice(source.indexOf('function vcReconnectPeer('), source.indexOf('(function vcStuckPeerWatch('));
const scopeStart = source.indexOf('function vcAccountSnapshot(');
const scope = scopeStart < 0 ? '' : source.slice(scopeStart, source.indexOf('function vcReconnectPeer('));
const flush = async () => { for (let i=0;i<15;i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise=new Promise(r=>resolve=r); return {promise,resolve}; };
function setup() {
  const ice=deferred(), sent=[], created=[], timers=[]; let inCall=true, reconnects=0;
  const c={console:{log(){},warn(){},error(){}},Date:{now:()=>100000},
    document:{body:{classList:{contains:()=>inCall}},querySelector:()=>null},
    vcConn:{ws:{readyState:1},send:m=>sent.push(m),reconnectNow:()=>reconnects++},
    vcRoomId:'room-a',vcUserId:'a',vcPeerConnections:{},__vcReconnectAt:{},__vcPeerEpoch:{},
    vcEnsureIceServers:()=>ice.promise,vcTuneAudioSdp:s=>s,vcShowReconnecting(){},
    setTimeout:(f,ms)=>{timers.push({f,ms});return timers.length;},
    vcCreatePeer(id){const pc={localDescription:null,signalingState:'stable',
      createOffer:async()=>({type:'offer',sdp:'synthetic'}),
      async setLocalDescription(s){this.localDescription=s;},close(){this.closed=true;}};
      c.vcPeerConnections[id]=pc;created.push(pc);return pc;}
  };c.window=c;vm.createContext(c);vm.runInContext(scope+'\n'+offer+'\n'+recovery,c);
  return {c,ice,sent,created,timers,leave:()=>{inCall=false;c.vcPeerConnections={};},reconnects:()=>reconnects};
}
let passed=0,failed=0;
async function test(name,run){try{await run();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.message);}}
await test('duplicate/late join during slow TURN lookup creates one offer',async()=>{
  const h=setup();const a=h.c.vcCreatePeerAndOffer('z','teacher'),b=h.c.vcCreatePeerAndOffer('z','teacher');
  h.ice.resolve();await Promise.all([a,b]);assert.equal(h.created.length,1);assert.equal(h.sent.length,1);
});
for(const boundary of ['room','account','logged-account','connection','socket','leave']) await test('pending offer cancelled at '+boundary+' boundary',async()=>{
  const h=setup();const pending=h.c.vcCreatePeerAndOffer('z','teacher');
  if(boundary==='room')h.c.vcRoomId='room-b';
  if(boundary==='account')h.c.vcUserId='other-account';
  if(boundary==='logged-account')h.c.localStorage={getItem:()=>'{"uid":"other-login"}'};
  if(boundary==='connection')h.c.vcConn={ws:{readyState:1},send:m=>h.sent.push(m)};
  if(boundary==='socket')h.c.vcConn.ws={readyState:1};
  if(boundary==='leave')h.leave();
  h.ice.resolve();await pending;assert.equal(h.created.length,0);assert.equal(h.sent.length,0);
});
await test('incoming peer wins while TURN lookup is pending',async()=>{
  const h=setup(),pending=h.c.vcCreatePeerAndOffer('z','teacher');const winner={};h.c.vcPeerConnections.z=winner;
  h.ice.resolve();await pending;assert.equal(h.c.vcPeerConnections.z,winner);assert.equal(h.sent.length,0);
});
await test('departed peer is not resurrected by a pending offer',async()=>{
  const h=setup(),pending=h.c.vcCreatePeerAndOffer('z','teacher');
  h.c.document.getElementById=()=>null;h.c.vcUpdateGridCount=()=>{};
  const start=source.indexOf('function vcRemovePeer(');
  vm.runInContext(source.slice(start,source.indexOf('/**',start)),h.c);
  h.c.vcRemovePeer('z','left');h.ice.resolve();await pending;assert.equal(h.created.length,0);
});
await test('late createOffer result cannot signal a replaced peer',async()=>{
  const h=setup(),d=deferred();h.ice.resolve();const original=h.c.vcCreatePeer;
  h.c.vcCreatePeer=id=>{const pc=original(id);pc.createOffer=()=>d.promise;return pc;};
  const pending=h.c.vcCreatePeerAndOffer('z','teacher');await flush();h.c.vcPeerConnections.z={};
  d.resolve({type:'offer',sdp:'late'});await pending;assert.equal(h.sent.length,0);
});
await test('signaling outage preserves existing audio peer and defers media rebuild',async()=>{
  const h=setup(),pc={close(){this.closed=true;}};h.c.vcPeerConnections.z=pc;h.c.vcConn.ws.readyState=3;
  h.c.vcReconnectPeer('z');h.ice.resolve();await flush();assert.ok(!pc.closed);assert.equal(h.created.length,0);assert.equal(h.reconnects(),1);
});
await test('recovery backup cannot follow user into a new room',async()=>{
  const h=setup();h.c.vcUserId='z';h.c.vcReconnectPeer('a');h.c.vcRoomId='room-b';h.ice.resolve();
  for(const t of h.timers)t.f();await flush();assert.equal(h.created.length,0);assert.equal(h.sent.length,0);
});
await test('normal recovery is bounded by the existing cooldown',async()=>{
  const h=setup();h.c.vcReconnectPeer('z');h.c.vcReconnectPeer('z');h.ice.resolve();await flush();
  assert.equal(h.created.length,1);assert.equal(h.sent.length,1);
});
await test('explicit class end suppresses delayed recovery',async()=>{
  const h=setup();h.c.vcReconnectPeer('z');h.leave();h.ice.resolve();await flush();assert.equal(h.created.length,0);
});
const socketSource=source.slice(source.indexOf('function createWebSocket('),source.indexOf('/* ================================================================',source.indexOf('function createWebSocket(')));
function sockets(){
  const timers=[],all=[];let cleanups=0;
  class Socket { static OPEN=1;static CONNECTING=0;static CLOSING=2;static CLOSED=3;
    constructor(){this.readyState=0;all.push(this);} send(){}close(){this.readyState=3;}
    open(){this.readyState=1;this.onopen();}drop(){this.readyState=3;this.onclose({code:1006,reason:''});}}
  const c={WebSocket:Socket,location:{protocol:'https:',host:'local.invalid'},
    document:{body:{classList:{contains:()=>true}}},console:{log(){},warn(){},error(){}},
    setInterval:()=>1,clearInterval(){},setTimeout:(f,ms)=>{timers.push({f,ms});return timers.length;},clearTimeout(){},
    vcCleanupAllPeers(){cleanups++;},vcEvalReconnecting(){},vcShowReconnecting(){}};
  c.window=c;vm.createContext(c);vm.runInContext(socketSource,c);
  return {c,all,timers,connection:c.createWebSocket('/synthetic',()=>{},()=>{},()=>{}),cleanups:()=>cleanups};
}
await test('immediate signaling reconnect retains reconnect identity marker',async()=>{
  const h=sockets();h.all[0].open();h.all[0].drop();h.connection.reconnectNow();h.all[1].open();
  assert.equal(h.c.__vcWasReconnect,true);
});
await test('old socket join fallback cannot clean up a newer socket session',async()=>{
  const h=sockets();h.all[0].open();h.all[0].drop();
  h.timers.find(t=>t.ms===1000).f();h.all[1].open();const old=h.timers.find(t=>t.ms===4000);
  h.all[1].drop();h.timers.filter(t=>t.ms===1000).at(-1).f();h.all[2].open();
  old.f();assert.equal(h.cleanups(),0);assert.equal(h.c.__vcWasReconnect,true);
});
await test('socket send reports rejected and accepted writes without queuing chat',async()=>{
  const h=sockets();assert.equal(h.connection.send({type:'chat-message',data:{message:'local fixture'}}),false);
  h.all[0].open();assert.equal(h.connection.send({type:'chat-message',data:{message:'local fixture'}}),true);
  h.all[0].send=()=>{throw Error('local send failure');};
  assert.equal(h.connection.send({type:'chat-message',data:{message:'local fixture'}}),false);
});
const chat=source.slice(source.indexOf('function vcSendChat('),source.indexOf('function vcReceiveChat('));
function chatFixture(){
 const input={value:'local synthetic message'},writes=[],notices=[],fetches=[];
 const c={document:{getElementById:()=>input},vcRoomId:'room-a',vcUserId:'a',vcUsername:'synthetic',
  vcConn:{ws:{readyState:1},send:m=>{writes.push(m);return true;}},vcAddChatSystem:m=>notices.push(m),
 fetch:(...v)=>{fetches.push(v);return Promise.resolve({});},localStorage:{getItem:()=>''},console:{warn(){}}};
 c.window=c;vm.createContext(c);vm.runInContext(scope+'\n'+chat,c);return{c,input,writes,notices,fetches};
}
for(const failure of ['offline','send-rejected'])await test('chat '+failure+': retains draft, no persistence/notification or delayed send',async()=>{
 const h=chatFixture();if(failure==='offline')h.c.vcConn.ws.readyState=3;else h.c.vcConn.send=()=>false;
 h.c.vcSendChat();assert.equal(h.input.value,'local synthetic message');assert.equal(h.fetches.length,0);assert.equal(h.writes.length,0);assert.equal(h.notices.length,1);
 h.c.vcConn.ws.readyState=1;await flush();assert.equal(h.writes.length,0);
});
for(const boundary of ['room','account','logged-account'])await test('unsent chat draft cannot silently cross '+boundary+' boundary',async()=>{
 const h=chatFixture();h.c.vcConn.ws.readyState=3;h.c.vcSendChat();h.c.vcConn.ws.readyState=1;
 if(boundary==='room')h.c.vcRoomId='room-b';else if(boundary==='account')h.c.vcUserId='b';else h.c.localStorage.getItem=()=>'{"uid":"other-login"}';h.c.vcSendChat();assert.equal(h.writes.length,0);
});
await test('explicit chat retry sends once; direct-message target stays private',async()=>{
 const h=chatFixture();h.c.vcChatTarget={userId:'z'};h.c.vcConn.ws.readyState=3;h.c.vcSendChat();h.c.vcConn.ws.readyState=1;
 h.c.vcSendChat();h.c.vcSendChat();assert.equal(h.writes.length,1);assert.equal(h.writes[0].data.toUserId,'z');assert.equal(h.fetches.length,0);assert.equal(h.input.value,'');
});
await test('departed DM target cannot turn an unsent private draft into a broadcast',async()=>{
 const h=chatFixture();h.c.vcChatTarget={userId:'z'};h.c.vcConn.ws.readyState=3;h.c.vcSendChat();
 h.c.vcConn.ws.readyState=1;h.c.vcChatTarget=null;h.c.vcSendChat();assert.equal(h.writes.length,0);assert.equal(h.fetches.length,0);assert.equal(h.input.value,'local synthetic message');
});
for(const role of ['teacher','student'])await test(role+': stale ICE/DTLS events do not rebuild current peer',async()=>{
  const h=setup(),pc={iceConnectionState:'failed',connectionState:'failed',restartIce(){throw Error('stale restart');}};
  h.c.pc=pc;h.c.userId='z';h.c.vcMyRole=role;h.c.vcPeerConnections.z={};
  h.c.document.getElementById=()=>null;let attempts=0;h.c.vcReconnectPeer=()=>attempts++;
  const start=source.indexOf('    pc.oniceconnectionstatechange = () => {');
  vm.runInContext(source.slice(start,source.indexOf('    pc.ontrack = ',start)),h.c);
  pc.oniceconnectionstatechange();pc.onconnectionstatechange();assert.equal(attempts,0);
});
console.log(`vc_reconnect_scope_harness: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
