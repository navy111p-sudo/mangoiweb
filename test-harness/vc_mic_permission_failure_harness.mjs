// Media failures exercise shipping mic controls and the full Office Mode wrapper.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const main = read('../cloudflare-deploy/public/js/idx-main.js');
const office = read('../cloudflare-deploy/public/js/idx-vc-officemode.js');
const recovery = read('./vc_office_recovery_harness.mjs');
const drain = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
const cut = (a, b) => { const start = main.indexOf(a), end = main.indexOf(b, start); assert(start >= 0 && end > start); return main.slice(start, end); };
const mic = cut('async function vcSwitchMic(deviceId)', 'window.vcPopulateMicSelect = vcPopulateMicSelect;')
  + cut('window.vcSetMicDevice = function(deviceId)', '/** 📷');
let fixture = recovery.slice(recovery.indexOf('function fixture('), recovery.indexOf('async function check('));
fixture = fixture.replace(/const main = readFileSync\(new URL\([^\n]+\);/, 'const main = mainSource;')
  .replace('vm.runInNewContext(source, world,', `
    world.vcMicOn = !muted; world.VC_MIC_PREF_KEY = 'mangoi_vc_mic_id';
    world.vcPopulateMicSelect = async function() {};
    world.alerts = []; world.alert = message => world.alerts.push(message);
    vm.runInNewContext(micSource, world);
    vm.runInNewContext(source, world,`);
const create = new Function('vm', 'assert', 'source', 'mainSource', 'drain', 'micSource', fixture + '\nreturn fixture;')(vm, assert, office, main, drain, mic);
let passed = 0;
for (const name of ['NotAllowedError', 'NotFoundError', 'NotReadableError'])
  for (const muted of [false, true]) for (const borrowed of [false, true]) for (const on of [false, true]) {
    const f = create({ muted, borrowed });
    if (on) await f.enable();
    const gum = f.world.navigator.mediaDevices.getUserMedia;
    f.world.navigator.mediaDevices.getUserMedia = async constraints => {
      if (constraints.audio?.deviceId?.exact === 'unavailable-Krisp') throw Object.assign(new Error('fixture ' + name), { name });
      return gum(constraints);
    };
    assert.equal(await f.world.vcSetMicDevice('unavailable-Krisp'), false);
    await drain();
    assert.equal(f.storage.get('mangoi_vc_mic_id'), 'saved-other-mic', 'failed device must not become the saved selection');
    assert.equal(f.world.vcOfficeModeOn(), on, 'failed switch preserves office mode');
    assert.equal(f.local.getAudioTracks()[0].enabled, !muted, 'failed switch preserves mute');
    assert(f.senders.every(sender => sender.track.readyState === 'live'), 'peers retain a live input');
    assert.equal(f.world.alerts.length, 1, 'failure is explained once');
    passed++;
  }
console.log(`PASS ${passed} permission/missing/busy microphone scenarios, ${passed * 6} assertions`);
