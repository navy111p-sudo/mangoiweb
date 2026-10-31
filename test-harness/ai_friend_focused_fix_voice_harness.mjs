// Focused correction voice regression, including the replacement/reset bug from PR #1916.
// The latest user contract is correction FIRST, exactly three times, not after the next question.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(process.env.AIF_HTML || join(ROOT, 'cloudflare-deploy/public/ai-friend.html'), 'utf8');
const HONEST = readFileSync(join(ROOT, 'cloudflare-deploy/src/warmup-honest.ts'), 'utf8');
const ts = createRequire(join(ROOT, 'cloudflare-deploy/package.json'))('typescript');
const inline = [...HTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('async function sendMsg('));
const ast = ts.createSourceFile('friend.js', inline || '', ts.ScriptTarget.Latest, true);
function findFunction(source, name) {
  let found = '';
  const tree = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true);
  (function visit(n) { if (ts.isFunctionDeclaration(n) && n.name?.text === name) found = n.getText(tree); ts.forEachChild(n, visit); })(tree);
  return found;
}
let block = '';
(function visit(n) {
  if (ts.isIfStatement(n) && /!_stmSpoke/.test(n.expression.getText(ast)) && /d\.replaced/.test(n.expression.getText(ast)) && /stmSpeak\(/.test(n.thenStatement.getText(ast))) block = n.getText(ast);
  ts.forEachChild(n, visit);
})(ast);
const reset = findFunction(inline, 'stmReset');
const queue = findFunction(inline, 'stmSpeak');
const stop = findFunction(inline, 'stopSpeakingNow');
const formatSource = findFunction(HONEST, 'ensureFocusedFixSpoken').replace(/^export\s+/, '');
const times = Number(HONEST.match(/export const FOCUSED_FIX_REPEATS\s*=\s*(\d+)/)?.[1]);
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + ' ' + JSON.stringify(extra)); } };
ok('actual queue, reset, stop, formatter and playback block are available', !!reset && !!queue && !!stop && !!block && !!formatSource && times === 3);
if (fail) process.exit(1);
const formatter = new Function('FOCUSED_FIX_REPEATS', ts.transpileModule(formatSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nreturn ensureFocusedFixSpoken;')(times);
const run = new Function('format', `
  return async function(o) {
    const turnCorr=o.mode || 'focused'; let sound=o.sound !== false;
    let spoken=[], stopped=0;
    var _stmGen=5, _stmSpoke=!!o.streamed, _stmRow=null, _stmChain=Promise.resolve();
    var currentVoice='emma', _ttsLangSet=false;
    const window={MangoiTTS:{stop(){stopped++;}}};
    const MangoiTTS=window.MangoiTTS;
    const document={querySelectorAll(){return [];}};
    const setTimeout=(fn,ms)=>ms>1000?0:globalThis.setTimeout(fn,ms);
    function isSoundOn(){return sound;}
    function speakText(text,btn,row,done){spoken.push(String(text));if(o.interrupt)stopSpeakingNow();globalThis.setTimeout(done,0);}
    ${reset}
    ${queue}
    ${stop}
    if(o.streamed){const gen=_stmGen;_stmChain=Promise.resolve().then(()=>{if(gen===_stmGen && sound)spoken.push('[stream]');});}
    const d={...o.d,reply:format(o.d.reply,turnCorr,null,o.d.fix)};
    ${block}
    if(o.cancelBeforePlay)stmReset();
    await _stmChain;
    await new Promise(r=>globalThis.setTimeout(r,5));
    return {spoken,stopped,gen:_stmGen};
  };
`)(formatter);
const FIX = { was: 'Hamburgers is yummy.', now: 'Hamburgers are yummy.' };
const REPLY = 'Do you eat hamburgers at home or outside?';
const count = s => s.join(' ').split(FIX.now).length - 1;
const canonical = formatter(REPLY, 'focused', null, FIX);
{
  const r = await run({ d: { reply: REPLY, fix: FIX } });
  ok('correction is first', r.spoken[0]?.startsWith('You can say... "' + FIX.now + '"'), r);
  ok('exactly three copies, no extra leading copy', count(r.spoken) === 3, r);
  ok('no next topic question in the correction turn', !r.spoken.join(' ').includes(REPLY), r);
  ok('only the verified correction is used', r.spoken.length === 1 && r.spoken[0] === canonical, r);
}
for (const mode of ['balanced','free_talk']) {
  const r = await run({ mode, d: { reply: REPLY, fix: FIX } });
  ok(mode + ' keeps the original reply', r.spoken.length === 1 && r.spoken[0] === REPLY && count(r.spoken) === 0, r);
}
for (const fix of [null, { was: 'x', now: '   ' }]) {
  const r = await run({ d: { reply: REPLY, fix } });
  ok('missing or empty correction does not invent speech', r.spoken.length === 1 && r.spoken[0] === REPLY, r);
}
for (const streamed of [false,true]) {
  const r = await run({ sound: false, streamed, d: { reply: REPLY, fix: FIX } });
  ok('muted turn remains silent, streamed=' + streamed, r.spoken.length === 0, r);
}
{
  const r = await run({ streamed: true, d: { reply: REPLY, fix: FIX } });
  ok('focused final reply cancels a stale preview queue', !r.spoken.includes('[stream]'), r);
  ok('focused final correction is not skipped by stale streamed state', count(r.spoken) === 3 && r.spoken[0] === canonical, r);
}
{
  const r = await run({ streamed: true, d: { reply: REPLY, fix: FIX, replaced: 1 } });
  ok('PR #1916: replacement resets and stops old audio', r.stopped === 1 && r.gen > 5, r);
  ok('PR #1916: capture generation AFTER reset, so three corrections survive', count(r.spoken) === 3 && r.spoken[0] === canonical, r);
  ok('replacement does not replay the model question', !r.spoken.join(' ').includes(REPLY), r);
}
{
  const r = await run({ cancelBeforePlay: true, d: { reply: REPLY, fix: FIX } });
  ok('new turn before playback cancels queued correction', r.spoken.length === 0, r);
  const cut = await run({ interrupt: true, d: { reply: REPLY, fix: FIX } });
  ok('interrupting speech invokes the actual stop path', cut.stopped === 1 && cut.gen > 5, cut);
}
{
  const r = await run({ mode: 'balanced', streamed: true, d: { reply: REPLY, fix: FIX } });
  ok('ordinary completed preview is not played twice', r.spoken.length === 1 && r.spoken[0] === '[stream]', r);
  const twice = await run({ d: { reply: canonical, fix: FIX } });
  ok('an already formatted reply still has exactly three copies', count(twice.spoken) === 3, twice);
}
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
