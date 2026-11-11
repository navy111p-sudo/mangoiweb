import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = readFileSync('cloudflare-deploy/public/js/idx-vc-qlog.js', 'utf8');
let now = 10000, active = true;
const ctx = vm.createContext({ window: {}, Date: {now: () => now}, document: {
  body: {classList: {contains: () => active}}, getElementById: () => null,
  readyState: 'loading', addEventListener() {}
}});
vm.runInContext(source.slice(source.indexOf('/* Operation Status:')), ctx);
const pc = {}, receiver = {track: {id: 'track', kind: 'video'}};
const sample = (stat) => ctx.vcqOperationSample('peer', pc, receiver, {id:'report',timestamp:now, ...stat});
sample({packetsReceived:100,packetsLost:2,bytesReceived:1000});
assert.equal(ctx.vcqOperationSamples['peer:video'].loss, null, 'first sample unknown');
assert.equal(ctx.vcqOperationSamples['peer:video'].bitrate, null);
now += 4000;
sample({packetsReceived:190,packetsLost:12,bytesReceived:5000,jitter:.02,framesPerSecond:24});
let s = ctx.vcqOperationSamples['peer:video'];
assert.equal(s.loss,10); assert.equal(s.bitrate,8); assert.equal(s.jitter,20); assert.equal(s.fps,24);
now += 4000;
sample({packetsReceived:190,packetsLost:12,bytesReceived:5000});
assert.equal(ctx.vcqOperationSamples['peer:video'].loss,null,'silent interval is unknown, not zero loss');
now += 4000; receiver.track.id = 'replacement';
sample({packetsReceived:200,packetsLost:15,bytesReceived:6000});
assert.equal(ctx.vcqOperationSamples['peer:video'].loss,null,'new track needs baseline');
now += 4000;
sample({packetsReceived:1,packetsLost:0,bytesReceived:20});
assert.equal(ctx.vcqOperationSamples['peer:video'].loss,null,'counter reset needs baseline');
assert.equal(ctx.vcqOperationSamples['peer:video'].bitrate,null);
assert.equal(ctx.vcqOperationValue(NaN,' ms'),'—');
assert.equal(ctx.vcqOperationValue(-1,'%'),'—');
active = false; now += 4000;
sample({packetsReceived:20,packetsLost:1,bytesReceived:30});
assert.notEqual(ctx.vcqOperationSamples['peer:video'].at,now,'late report after leaving ignored');
ctx.vcqOperationReset(); assert.equal(Object.keys(ctx.vcqOperationSamples).length,0);
console.log('PASS operation diagnostics: deltas, units, unknown, silent, reset, replaced track, teardown');
