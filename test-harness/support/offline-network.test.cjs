'use strict';
const assert = require('node:assert/strict');
const net = require('node:net');
// All connections below end in this stub. No socket connect, DNS lookup, or external request occurs.
let connects = 0, fetches = 0, pass = 0;
net.Socket.prototype.connect = function () { connects++; return this; };
globalThis.fetch = async () => { fetches++; return 'stub'; };
let httpCalls = 0;
for (const protocol of ['node:http','node:https']) {
  const client=require(protocol);
  for (const method of ['request','get']) client[method]=function(){httpCalls++;return {end(){return this;},destroy(){}};};
}
require('./offline-network.cjs');
function blocked(name, invoke) {
  const before = connects; assert.throws(invoke, /OFFLINE_TEST:/, name); assert.equal(connects, before, name); pass++;
}
function allowed(name, invoke) {
  const before = connects; const s=invoke(); assert.equal(connects,before+1,name); s?.destroy(); pass++;
}
const socket=()=>new net.Socket();
for(const [name, args] of [
  ['object', [{host:'203.0.113.1',port:443}]],
  ['port-host', [443,'203.0.113.1']],
  ['string-port-host', ['443','203.0.113.1']],
  ['normalized-array', [[{host:'203.0.113.1',port:443},()=>{}]]],
  ['normalized-array-no-callback', [[{host:'203.0.113.1',port:443}]]],
  ['IPv6', [{host:'2001:db8::1',port:443}]],
  ['custom-lookup', [{host:'localhost',port:443,lookup(){throw Error('must not call DNS');}}]],
  ['ambiguous-hostname', [{hostname:'203.0.113.1',port:443}]],
  ['invalid-host-object', [{host:{toString(){throw Error('must not coerce');}},port:443}]],
  ['unsupported', [[]]],
]) blocked('direct '+name,()=>socket().connect(...args));
blocked('net.createConnection object normalized internally',()=>net.createConnection({host:'203.0.113.1',port:443}));
blocked('net.createConnection port host normalized internally',()=>net.createConnection(443,'203.0.113.1'));
blocked('net.connect alias normalized internally',()=>net.connect(443,'203.0.113.1'));
for(const host of ['127.0.0.1','::1','localhost']) {
  allowed('direct '+host,()=>socket().connect({host,port:1}));
  allowed('normalized '+host,()=>net.createConnection({host,port:1}));
}
allowed('default host',()=>net.createConnection(1));
allowed('pipe path',()=>socket().connect('/tmp/mock-socket'));
allowed('object pipe path',()=>net.createConnection({path:'/tmp/mock-socket'}));
for (const protocol of ['node:http','node:https']) for (const method of ['request','get']) {
  const call=require(protocol)[method];
  const scheme=protocol==='node:http'?'http:':'https:';
  for (const args of [
    [scheme+'//example.invalid/path'], [new URL(scheme+'//example.invalid/path')],
    [{hostname:'example.invalid',port:443}], [{host:'example.invalid'}],
    [scheme+'//127.0.0.1/',{hostname:'example.invalid'}],
    [{hostname:'127.0.0.1',path:'https://example.invalid/path'}],
    [{hostname:'127.0.0.1',method:'CONNECT',path:'example.invalid:443'}],
  ]) { const before=httpCalls;assert.throws(()=>call(...args),/OFFLINE_TEST/);assert.equal(httpCalls,before);pass++; }
  for (const args of [[scheme+'//127.0.0.1/'],[new URL(scheme+'//localhost/')],[{hostname:'127.0.0.1',path:'/mock'}]]) {
    const before=httpCalls;call(...args);assert.equal(httpCalls,before+1);pass++;
  }
}
(async()=>{
  for(const input of ['https://203.0.113.1/test',new URL('https://example.invalid/test'),new Request('https://example.invalid/test')]) {
    const before=fetches;await assert.rejects(fetch(input),/OFFLINE_TEST/);assert.equal(fetches,before);pass++;
  }
  for(const input of ['http://127.0.0.1:1/',new URL('http://localhost:1/'),new Request('http://[::1]:1/')]) {
    const before=fetches;assert.equal(await fetch(input),'stub');assert.equal(fetches,before+1);pass++;
  }
  console.log('PASS '+pass+' guarded overloads; original connect, fetch, HTTP(S) request/get were stubs, no networking');
})().catch(e=>{console.error(e);process.exitCode=1;});
