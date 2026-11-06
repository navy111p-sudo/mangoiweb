// Local copies only: never modify the working source or call production.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cf = path.join(root, 'cloudflare-deploy');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aif-speed-'));
const api = fs.readFileSync(path.join(cf, 'src/api-ai.ts'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(cf, 'public/ai-friend.html'), 'utf8');
function replaceOnce(s, from, to) {
  assert.equal(s.split(from).length, 2, 'mutation anchor must be unique: ' + from);
  return s.replace(from, to);
}
const final = `      if (sseSend) {
        sseSend({ final: 1, ok: true, reply, ...replyOut() });
        latFinalMs = Date.now() - latT0;
      }`;
const cases = [
  ['save-after-final', s => replaceOnce(replaceOnce(s, final, ''), '      // ⚠️ 이 저장은 반드시 기다린다', final + '\n      // ⚠️ 이 저장은 반드시 기다린다'), null, '②-8'],
  ['focused-double-count', s => replaceOnce(s, 'Promise.resolve().then(() => recoverFocusedFix(msg, async (msgs: any[]) => await runFriend(models[0], msgs, 480, 0.2, true)))', 'Promise.resolve().then(() => recoverFocusedFix(msg, async (msgs: any[]) => await runFriend(models[0], msgs, 480, 0.2, false)))'), null, '①-10/11'],
  ['recheck-overrides-model', s => replaceOnce(s, 'focusedFix = focusedCandidate(rawFix, msg)', 'focusedFix = focusedCandidate(await waitFocusedRecover(), msg) || focusedCandidate(rawFix, msg)'), null, '①-12'],
  ['unlock-at-final', s => s, s => replaceOnce(s, 'if (fin) return; const k = showReply(f);', "if (fin) return; document.getElementById('sendBtn').disabled = false; const k = showReply(f);"), '③-10'],
  ['latency-at-done', s => replaceOnce(s, 'ms: latFinalMs || (Date.now() - latT0)', 'ms: Date.now() - latT0'), null, '②-6'],
];
try {
  fs.cpSync(path.join(cf, 'src'), path.join(temp, 'src'), { recursive: true });
  fs.copyFileSync(path.join(cf, 'package.json'), path.join(temp, 'package.json'));
  fs.symlinkSync(path.join(cf, 'node_modules'), path.join(temp, 'node_modules'), 'junction');
  fs.symlinkSync(path.join(cf, 'public'), path.join(temp, 'public'), 'junction');
  for (const [name, server, ui, expected] of [['baseline', s => s, null, null], ...cases]) {
    fs.writeFileSync(path.join(temp, 'src/api-ai.ts'), server(api));
    const uiFile = path.join(temp, 'ui.html');
    fs.writeFileSync(uiFile, ui ? ui(html) : html);
    const r = spawnSync(process.execPath, [path.join(root, 'test-harness/ai_friend_speed_harness.mjs')], {
      cwd: root, encoding: 'utf8', timeout: 120000,
      env: { ...process.env, AIF_CF: temp, AIF_HTML: uiFile },
    });
    const out = r.stdout + r.stderr;
    if (!expected) assert.equal(r.status, 0, out);
    else {
      assert.equal(r.status, 1, name + ': must fail an assertion, not crash\n' + out);
      assert.ok(out.split('\n').some(l => l.includes('❌ ' + expected)), name + ': target assertion not reached\n' + out);
      assert.match(out, /결과: PASS \d+ \/ FAIL [1-9]/);
    }
    console.log(name + ': ' + (expected ? 'caught by ' + expected : out.match(/결과: PASS \d+ \/ FAIL \d+/)?.[0]));
  }
} finally {
  // Unlink junctions first so cleanup cannot traverse their targets.
  for (const n of ['node_modules', 'public']) if (fs.existsSync(path.join(temp, n))) fs.unlinkSync(path.join(temp, n));
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep));
  fs.rmSync(temp, { recursive: true, force: true });
}
