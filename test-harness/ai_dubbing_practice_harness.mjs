// Real context handoff and friend-page wiring, without a microphone or remote API.
// Run: node test-harness/ai_dubbing_practice_harness.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('cloudflare-deploy/public/js/ai-dubbing-practice.js', root), 'utf8');
const friend = readFileSync(new URL('cloudflare-deploy/public/ai-friend.html', root), 'utf8');
const KEY = 'mangoi_dub_practice_v1';
const student = uid => JSON.stringify({ uid });
const snapshot = {
  episodeId: 'dub-001', title: { ko: '모험', en: 'Adventure' }, sceneTitle: { ko: '학교', en: 'School' },
  studentName: 'DO NOT TRANSFER', score: 87, audio: 'private-audio',
  lines: [
    { en: 'Can you help me?', ko: '도와줄래?', speaker: 'jun', spoken: 'private-recording-transcript' },
    { en: 'Thank you, my friend!', ko: '고마워, 친구야!', speaker: 'mina' },
    { en: "Let's go together.", ko: '같이 가자.', speaker: 'jun' },
    { en: 'A fourth sentence.', ko: '네 번째 문장' }
  ]
};
function store(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k) };
}
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.events = new Map(); this.style = {}; this.attributes = {}; this.value = ''; this.hidden = false; this._text = ''; }
  appendChild(el) { this.children.push(el); el.parentNode = this; return el; }
  setAttribute(k,v) { this.attributes[k] = v; }
  addEventListener(k,fn) { this.events.set(k,fn); }
  removeEventListener(k,fn) { if (this.events.get(k) === fn) this.events.delete(k); }
  fire(k) { this.events.get(k)?.(); }
  focus() { this.focused = true; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(e => e !== this); this.parentNode = null; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map(e => e.textContent).join(''); }
  set innerHTML(_) { throw new Error('Transferred text must never be interpolated as HTML'); }
  get scrollHeight() { return this.children.length * 100; }
}
function world(initial = {}) {
  const host = new Element('div'), input = new Element('input'), events = new Map(), docEvents = new Map();
  const all = () => { const a=[]; const walk=e=>{a.push(e);e.children.forEach(walk);}; walk(host); return a; };
  const ctx = {
    console, URLSearchParams, localStorage: store(initial), sessionStorage: store(),
    location: { search: '?practice=dubbing', href: '' }, lang: 'ko',
    getLang() { return ctx.lang; },
    addEventListener(k,fn) { events.set(k,fn); },
    removeEventListener(k,fn) { if (events.get(k) === fn) events.delete(k); },
    document: {
      readyState: 'complete', createElement: tag => new Element(tag),
      getElementById: id => id === 'chat' ? host : id === 'msgInput' ? input : all().find(e=>e.id===id),
      addEventListener(k,fn) { docEvents.set(k,fn); }
    },
    fetch() { throw new Error('Handoff must not send a request'); }
  };
  ctx.window=ctx; vm.createContext(ctx); vm.runInContext(source,ctx);
  return { ctx, api:ctx.MangoiDubPractice, host,input,events,docEvents,all };
}

// Only public script metadata crosses the boundary; authentication remains the chat API's job.
{
  const w=world({mangoi_logged_user:student('alice')});
  assert.equal(w.api.stage(snapshot).ok,true);
  const raw=w.ctx.sessionStorage.getItem(KEY);
  assert.doesNotMatch(raw,/DO NOT TRANSFER|private-audio|private-recording-transcript|"score"/);
  const entry=w.api.take();
  assert.equal(entry.owner,'student:alice');
  assert.equal(entry.data.lines.length,3);
  for(const line of entry.data.lines) assert.ok(snapshot.lines.some(s=>s.en===line.en));
  assert.ok(entry.data.starter.length<=500);
  assert.match(entry.data.starter,/new everyday role-play/);
  assert.equal(w.api.take(),null,'A second read cannot reuse a previous practice');
  assert.equal(w.api.open(snapshot).ok,true);
  assert.equal(w.ctx.location.href,'/ai-friend.html?practice=dubbing');
}
// Long scripts use fewer intact lines, without cutting a quotation to meet the API limit.
{
  const w=world({mangoi_logged_user:student('alice')});
  const line='This is a longer complete practice line. '.repeat(4).trim();
  assert.equal(w.api.stage({...snapshot,lines:[{en:line},{en:line},{en:'One more complete line.'}]}).ok,true);
  const data=w.api.take().data;
  assert.equal(data.lines[0].en,line);
  assert.equal(data.lines.filter(l=>l.en===line).length,1);
  assert.ok(data.starter.length<=500);
  assert.equal(w.api.stage({...snapshot,lines:[]}).reason,'no_lines');
}
// Shared classroom computers: student, staff and guests must not inherit one another's handoff.
{
  const w=world({mangoi_logged_user:student('alice')});
  w.api.stage(snapshot);w.ctx.localStorage.setItem('mangoi_logged_user',student('bob'));
  assert.equal(w.api.take(),null);
  w.ctx.localStorage.removeItem('mangoi_logged_user');
  w.ctx.localStorage.setItem('mangoi_admin_session',student('alice'));
  assert.equal(w.api.stage(snapshot).ok,true);
  assert.equal(w.api.take().owner,'staff:alice');
  assert.equal(w.ctx.localStorage.getItem('mangoi_logged_user'),null,'No fake student identity for a staff account');
  w.api.stage(snapshot);w.ctx.localStorage.setItem('mangoi_logged_user',student('alice'));
  assert.equal(w.api.take(),null,'Same uid but a different login kind is different');
  const guest=world();guest.api.stage(snapshot);
  const otherTab=world();otherTab.ctx.sessionStorage.setItem(KEY,guest.ctx.sessionStorage.getItem(KEY));
  assert.equal(otherTab.api.take(),null,'Guest practice belongs to its session');
  guest.ctx.localStorage.setItem('mangoi_logged_user',student('alice'));
  assert.equal(guest.api.take(),null,'Signing in does not inherit an earlier guest context');
}
// Expiration, malformed input and unavailable storage fail closed and never navigate.
{
  const w=world({mangoi_logged_user:student('alice')});
  for(const at of [Date.now()-21*60*1000,Date.now()+60*1000,'yesterday']) {
    w.api.stage(snapshot);const entry=JSON.parse(w.ctx.sessionStorage.getItem(KEY));entry.at=at;
    w.ctx.sessionStorage.setItem(KEY,JSON.stringify(entry));assert.equal(w.api.take(),null);
  }
  w.ctx.sessionStorage.setItem(KEY,'not JSON');assert.equal(w.api.take(),null);
  assert.equal(w.ctx.sessionStorage.getItem(KEY),null);
  w.ctx.sessionStorage.setItem=()=>{throw new Error('quota');};
  assert.equal(w.api.open(snapshot).reason,'storage_unavailable');
  assert.equal(w.ctx.location.href,'');
}
// Exercise the actual ai-friend bootstrap: waits for defer/i18n, preserves drafts, and requires Send.
{
  const w=world({mangoi_logged_user:student('alice')});w.ctx.lang='en';
  w.api.stage({...snapshot,title:{ko:'<img src=x>',en:'<script>Adventure</script>'}});
  let stopped=0;const topics=[];
  w.ctx.stopSpeakingNow=()=>{stopped++;};w.ctx.setTopic=t=>topics.push(t);
  w.ctx.loadHistory=()=>Promise.resolve();w.ctx.document.readyState='loading';
  const start=friend.indexOf('    loadHistory().then(function () {');
  assert.ok(start>=0);
  const end=friend.indexOf('\n  </script>',start);
  vm.runInContext(friend.slice(start,end),w.ctx);
  await Promise.resolve();await Promise.resolve();
  assert.equal(w.host.children.length,0,'Deferred module and language engine finish before mounting');
  w.ctx.document.readyState='interactive';w.docEvents.get('DOMContentLoaded')();
  const card=w.host.children[0];assert.ok(card);
  assert.match(card.textContent,/Use your dubbing lines/);
  assert.match(card.textContent,/<script>Adventure<\/script>/,'Titles remain literal text');
  assert.equal(w.input.value,'');assert.equal(stopped,0);
  const startButton=w.all().find(e=>e.tagName==='button');
  w.input.value='My unfinished message';startButton.fire('click');
  assert.equal(w.input.value,'My unfinished message');assert.equal(stopped,0);
  assert.match(card.textContent,/draft has been kept/);
  w.input.value='';startButton.fire('click');
  assert.match(w.input.value,/Can you help me\?/);
  assert.ok(w.input.value.length<=500);assert.equal(stopped,1);assert.deepEqual(topics,[null]);
  assert.equal(w.input.focused,true);
  w.ctx.lang='ko';w.events.get('mangoi:lang-changed')();assert.match(card.textContent,/더빙 표현/);
  w.ctx.localStorage.setItem('mangoi_logged_user',student('bob'));w.events.get('storage')();
  assert.equal(w.input.value,'');assert.equal(w.host.children.length,0,'An account change clears the staged starter');
}
// Sending through the regular form or choosing a normal visit removes/ignores the prompt.
{
  const w=world({mangoi_logged_user:student('alice')});w.api.stage(snapshot);
  w.ctx.location.search='';
  assert.equal(w.api.mountFriend({host:w.host,input:w.input,prepare(){}}),false);
  w.ctx.location.search='?practice=dubbing';
  assert.equal(w.api.mountFriend({host:w.host,input:w.input,prepare(){}}),true);
  w.input.fire('mangoi:turn-sent');assert.equal(w.host.children.length,0);
  assert.equal(w.events.has('storage'),false);
}
console.log('✅ Dubbing → AI friend: exact lines, 500-character cap, owner isolation, one-use expiry, safe rendering and explicit sending passed');
