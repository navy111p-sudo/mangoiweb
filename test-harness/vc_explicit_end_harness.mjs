import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const server = read('cloudflare-deploy/src/video-call-room.ts');
const js = stripTypeScriptTypes(server.replace(/^import .*;\s*$/gm, '').replace('export class VideoCallRoom', 'class VideoCallRoom'));
const sc = vm.createContext({console:{log(){},warn(){},error(e){throw e;}},Date,Map,TextDecoder});
vm.runInContext(js+'\nglobalThis.Room = VideoCallRoom;', sc);
function room(){
  const r=Object.create(sc.Room.prototype);r.lastSeen=new Map();r.roomId='test';
  let att={userId:'teacher',username:'Sid',role:'teacher',joined:true,seenAt:Date.now()};
  const ws={deserializeAttachment:()=>att,serializeAttachment:a=>{att=a;},close(){}};
  const reasons=[];r.handleLeaveRoom=(_u,_w,_n,reason)=>reasons.push(reason);
  return {r,ws,reasons};
}
function student(){
 const timers=[];const c=vm.createContext({console,WebSocket:{OPEN:1},navigator:{onLine:true},STATE:{triggered:false},vcPeerConnections:{},isStudentInClass:()=>true,endOfClassFlow:()=>c.ends++,ends:0,setTimeout:fn=>timers.push(fn),document:{readyState:'complete',getElementById:()=>null}});
 c.window=c;c.vcConn={ws:{readyState:1}};c.vcRemovePeer=()=>{};
 const html=read('cloudflare-deploy/public/index.html');
 vm.runInContext(html.slice(html.indexOf('  function remoteCount(){'),html.indexOf('  // ── 🔔 (2026-07-13)')),c);
 return {c,flush:()=>{while(timers.length)timers.shift()();}};
}
let checks=0;
for(const code of [1000,1001,1005,1006,4001,4002,4003]){
 const {r,ws,reasons}=room();await r.webSocketClose(ws,code,'test');assert.deepEqual(reasons,['dropped']);
 const s=student();s.c.vcRemovePeer('teacher',reasons[0]);s.flush();assert.equal(s.c.ends,0);checks++;
}
{
 const {r,ws,reasons}=room();await r.webSocketError(ws);assert.deepEqual(reasons,['dropped']);checks++;
}
{
 const {r,ws,reasons}=room();await r.webSocketMessage(ws,JSON.stringify({type:'leave-room',data:{}}));
 assert.deepEqual(reasons,['left']);await r.webSocketClose(ws,1000,'client-close');assert.deepEqual(reasons,['left']);
 const s=student();s.c.vcRemovePeer('teacher','left');s.flush();assert.equal(s.c.ends,1);checks++;
}
{
 const s=student();s.c.vcRemovePeer('teacher','left');s.c.vcPeerConnections={teacher:{}};s.flush();assert.equal(s.c.ends,0);checks++;
}
{
 const s=student();s.c.vcRemovePeer('teacher','left');s.c.vcConn.ws.readyState=3;s.flush();assert.equal(s.c.ends,0);checks++;
}
// Execute the actual lifecycle plugin: a pagehide must never send explicit leave.
{
 const listeners={};const sent=[];
 const c=vm.createContext({window:{addEventListener:(n,f)=>{listeners[n]=f;},vcConn:{send:m=>sent.push(m)}},document:{body:{classList:{contains:()=>true}}},setInterval(){},console});
 vm.runInContext(read('cloudflare-deploy/public/js/idx-vc-dupghost.js'),c);
 for(const persisted of [true,false])listeners.pagehide?.({persisted});
 assert.equal(sent.length,0);checks++;
}
// Execute the real reconnect manager with a simulated socket and clock.
{
 const source=read('cloudflare-deploy/public/js/idx-main.js');const start=source.indexOf('function createWebSocket(');assert.ok(start>=0);
 const end=source.indexOf('/* ================================================================',start);
 const timers=[];const sockets=[];let opened=0;
 class Socket{static OPEN=1;static CLOSED=3;static CLOSING=2;static CONNECTING=0;constructor(){this.readyState=0;sockets.push(this);}send(){}close(){this.readyState=3;} }
 const c=vm.createContext({WebSocket:Socket,location:{protocol:'https:',host:'local.test'},document:{body:{classList:{contains:()=>true}}},window:{},console:{log(){},warn(){},error(){}},Date,setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout(){},setInterval:()=>1,clearInterval(){}});
 vm.runInContext(source.slice(start,end),c);c.createWebSocket('/ws',()=>{},()=>opened++);
 sockets[0].readyState=1;sockets[0].onopen();assert.equal(opened,1);
 sockets[0].readyState=3;sockets[0].onclose({code:1006,reason:'network drop'});
 assert.equal(timers.length,1);timers.shift()();assert.equal(sockets.length,2);
 sockets[1].readyState=1;sockets[1].onopen();assert.equal(opened,2);checks++;
}
console.log(`PASS ${checks} behavioral checks: transport loss, lifecycle, explicit exit, rejoin, reconnect.`);
