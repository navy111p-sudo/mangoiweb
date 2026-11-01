/* 📣 웜업 집중교정 «중립 리액션» (2026-11-01) — 학생이 말을 마치면 교정 여부를 기다리는 동안
 * 「Mm-hm.」 을 기기 목소리로 먼저 한 번 낸다. 이 검사는 실제로 돌려서 확인한다.
 *
 *  · 서버: warmup-stream.ts 를 typescript 로 타입만 벗겨 import 해서 primer() 를 돌린다.
 *  · 화면: warmup.html 의 _primerSay 를 소스에서 오려 가짜 speechSynthesis 로 실행한다.
 *  · 짝(음성): 집중교정이 아니거나, 공감 턴이거나, 중국어면 아무것도 안 낸다.
 *  · 말풍선·정본(replacedBy)·지연 측정(_latMark)에는 영향이 없어야 한다.
 */
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC_DIR = join(ROOT, 'cloudflare-deploy/src');
const HTML = readFileSync(join(ROOT, 'cloudflare-deploy/public/warmup.html'), 'utf8');
const INDEX = readFileSync(join(SRC_DIR, 'index.ts'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

let ts = null;
for (const p of [join(ROOT, 'cloudflare-deploy/node_modules/typescript'), '/opt/node22/lib/node_modules/typescript']) {
  try { if (existsSync(p)) { ts = createRequire(import.meta.url)(p); break; } } catch {}
}
ok('전제: typescript 를 찾았다', !!ts);

console.log('\n[S] 서버 primer() — 실제 모듈');
let M = null;
if (ts) {
  const dir = mkdtempSync(join(tmpdir(), 'wprimer-'));
  const tr = (file, out) => {
    const js = ts.transpileModule(readFileSync(file, 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
      .replace(/from\s+'\.\/([\w-]+)'/g, "from './$1.mjs'");
    writeFileSync(join(dir, out), js);
  };
  for (const n of ['stream-json-text', 'reply-sanity', 'reply-questions', 'ai-friends', 'warmup-empathy']) tr(join(SRC_DIR, n + '.ts'), n + '.mjs');
  tr(join(SRC_DIR, 'warmup-stream.ts'), 'warmup-stream.mjs');
  try { M = await import(pathToFileURL(join(dir, 'warmup-stream.mjs')).href); }
  catch (e) { ok('서버 모듈을 import 했다', false, String(e && e.message)); }
}

if (M) {
  const base = { lang: 'en', cap: 30, friend: 'Emma', studentInput: 'I like coffee.', fragQ: false, honest: true };
  const make = (over) => { const sent = []; const live = M.createWarmupLive((o) => sent.push(o), { ...base, ...over }); return { live, sent }; };

  const a = make({ focused: true });
  ok('S-1 집중교정이면 primer 가 {f:1} 을 한 번 보낸다', a.live.primer() === true && a.sent.length === 1 && a.sent[0].f === 1, JSON.stringify(a.sent));
  ok('S-2 두 번째 호출은 아무것도 안 보낸다(한 턴 한 번)', a.live.primer() === false && a.sent.length === 1, JSON.stringify(a.sent));
  ok('S-3 신호 뒤에도 문장 검사(push)는 그대로 돈다', typeof a.live.push('Do you like coffee?') === 'boolean');
  ok('S-4 신호는 글자(t)를 싣지 않는다 — 대화 말풍선·정본 비교 무관', a.sent.every(o => o.t === undefined));

  const b = make({ focused: false });
  ok('S-5 (짝) 집중교정이 아니면 신호를 안 낸다', b.live.primer() === false && b.sent.length === 0, JSON.stringify(b.sent));

  // 같은 집중교정 턴에서 중립 발화(a) 와 「싫다·힘들다」 발화(c) 를 짝으로 비교한다 — 차이는 공감 판정뿐이다
  const neutral = make({ focused: true, studentInput: 'I like coffee.' });
  const c = make({ focused: true, studentInput: 'I hate this, it is so hard.' });
  ok('S-6 (대조) 중립 발화는 신호가 나가고', neutral.live.primer() === true && neutral.sent.length === 1);
  ok('S-7 (짝) 공감 턴(「싫다·힘들다」)이면 집중교정이어도 신호를 안 낸다', c.live.primer() === false && c.sent.length === 0, JSON.stringify(c.sent));

  const d = make({ focused: true });
  d.live.push('Ok. ' );                         // 미리보기가 한 번 멈춘 뒤에는 신호를 낼 이유가 없다
  const dh = d.live.halted();
  if (dh) ok('S-8 (멈춘 뒤) 이미 멈췄으면 신호를 안 낸다', d.live.primer() === false, dh);
  else ok('S-8 (건너뜀) 이 입력은 멈추지 않아 S-8 을 적용하지 않음', true);
}

console.log('\n[C] 화면 _primerSay — 소스에서 오려 가짜 음성으로 실행');
const fnSrc = (name) => {
  const m = HTML.match(new RegExp('function ' + name + '\\(([^)]*)\\)\\{'));
  if (!m) return null;
  let i = m.index + m[0].length - 1, depth = 0;
  for (; i < HTML.length; i++) { if (HTML[i] === '{') depth++; else if (HTML[i] === '}') { depth--; if (depth === 0) break; } }
  return HTML.slice(m.index, i + 1);
};
const pSrc = fnSrc('_primerSay');
ok('C-0 (전제) _primerSay 를 소스에서 찾았다', !!pSrc);
// 주석을 벗기고 «코드» 만 본다(주석에 적어 둔 금지 문구 때문에 실패하지 않게)
const pCode = pSrc ? pSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '') : '';
ok('C-1 _primerSay 코드는 지연 측정(_latMark)·onstart 를 건드리지 않는다', !!pSrc && !/_latMark|onstart/.test(pCode));
const streamRead = HTML.match(/async function _stmRead[\s\S]*?\n\}\n/);
ok('C-2 _stmRead 는 {f:1} 신호를 글자 조각보다 먼저 가려낸다', !!streamRead && /o\.f\)\{[^}]*_primerSay\(L\)/.test(streamRead[0]) && streamRead[0].indexOf('o.f)') < streamRead[0].indexOf('o.t==='));

if (pSrc) {
  const spoken = [];
  // 시험 한 번마다 새 함수로 실행하고, 읽은 문장을 배열로 돌려받는다
  const trial = (over, L) => {
    const sp = [];
    const st = Object.assign({ zh: false }, over.st || {});
    const fn = new Function('spoken', 'L', 'st', 'PRIMER_TEXT', `
      var _warmPaused=${over.paused ? 'true' : 'false'}, _warmEpoch=7, _speechOn=${over.soundOff ? 'false' : 'true'}, _enVoice=null, _rateLevel=2;
      var RATE_STEPS=[0.8,0.9,0.95,1];
      function isZh(){ return !!st.zh; }
      function pickVoice(){ _enVoice={lang:'en-US'}; }
      function SpeechSynthesisUtterance(t){ this.text=t; }
      var window={ speechSynthesis:{ speak:function(u){ spoken.push(u.text); }, cancel:function(){} } };
      ${pSrc}
      _primerSay(L);`);
    fn(sp, L, st, 'Mm-hm.');
    return sp;
  };
  const L1 = { epoch: 7 };
  const once = trial({}, L1);
  ok('C-3 집중교정 턴이면 「Mm-hm.」 을 한 번 읽는다', once.length === 1 && once[0] === 'Mm-hm.', JSON.stringify(once));
  const L2 = { epoch: 7 };
  const twice = []; const f2 = trial({}, L2); twice.push(...f2); twice.push(...trial({}, L2));
  ok('C-4 같은 턴에 신호가 두 번 와도 한 번만 읽는다', twice.length === 1, JSON.stringify(twice));
  ok('C-5 (짝) 소리 끔이면 아무것도 읽지 않는다', trial({ soundOff: true }, { epoch: 7 }).length === 0);
  ok('C-6 (짝) 중국어 화면은 읽지 않는다(영어 목소리로 한자를 읽지 않게)', trial({ st: { zh: true } }, { epoch: 7 }).length === 0);
  ok('C-7 (짝) 턴이 바뀌었으면(epoch 불일치) 읽지 않는다', trial({}, { epoch: 3 }).length === 0);
  ok('C-8 (짝) 일시정지 중이면 읽지 않는다', trial({ paused: true }, { epoch: 7 }).length === 0);
}

console.log('\n[I] 서버 배선 index.ts');
ok('I-1 live 를 만든 뒤 모델 호출 전에 primer() 를 부른다', /const live = sseSend[\s\S]*?\n\s*live\?\.primer\(\);[\s\S]*?const result: any = await runWarmup\(messages, 0\.7, live\)/.test(INDEX));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
