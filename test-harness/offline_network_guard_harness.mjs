// Proves integration's preload denies real transport before it can reach a host.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const guard=fileURLToPath(new URL('./helpers/offline-network-guard.cjs',import.meta.url));
const checks=[
 "await fetch('https://offline.invalid/')",
 "new WebSocket('wss://offline.invalid/')",
 "require('node:http').get('http://offline.invalid/')",
 "require('node:https').request('https://offline.invalid/')",
 "require('node:net').connect(443,'offline.invalid')",
 "require('node:tls').connect(443,'offline.invalid')",
 "require('node:dgram').createSocket('udp4')",
 "require('node:dns').lookup('offline.invalid')",
 "await require('node:dns').promises.resolve('offline.invalid')"
];
for(const expression of checks){
 const code=`(async()=>{try{${expression};process.exitCode=2;}catch(e){if(!String(e).includes('OFFLINE_NETWORK_BLOCKED'))throw e;console.log('blocked');}})();`;
 const r=spawnSync(process.execPath,['--require',guard,'-e',code],{encoding:'utf8',timeout:5000,env:{...process.env,MANGOI_OFFLINE_NETWORK_LOG:''}});
 assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'blocked',expression);
}
const mock=spawnSync(process.execPath,['--require',guard,'-e',"globalThis.fetch=async()=>({ok:true,fixture:true});fetch('fixture').then(r=>{if(!r.fixture)throw Error('missing fixture');console.log('mock preserved');});"],{encoding:'utf8',timeout:5000});
assert.equal(mock.status,0,mock.stderr);assert.equal(mock.stdout.trim(),'mock preserved');
console.log(JSON.stringify({suite:'offline transport guard',passed:checks.length+1,failed:0,realNetworkCalls:0}));
