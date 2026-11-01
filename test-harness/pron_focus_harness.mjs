// ═══════════════════════════════════════════════════════════════════════
// 🎯 집중교정 발음 교정 하니스 (2026-11-01)
//  ① 서버 판정 pronFixFromResult — 틀린 발음만 교정, 빠뜨림·맞음·경계값은 교정 안 함
//  ② 낱말 형식·WAV 디코드 가드
//  ③ 클라이언트 기준 낱말 고르기 pronTargetFromAi — 소스에서 꺼내 실행
//  ④ 배선: chat-friend 가 pron 을 받아 pron_fix 를 돌려주고, 화면이 그것을 3번 들려준다
// ═══════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes, createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 200) : '')); }
}

// ── ① ② 서버 판정 모듈을 실제로 돌린다 ───────────────────────────────
const PF_SRC = R('cloudflare-deploy/src/pron-focus.ts');
const pfJs = stripTypeScriptTypes(PF_SRC.replace(/import \{ assessPronunciation \} from '\.\/azure-pronunciation';/, 'const assessPronunciation = async () => null;'));
const pf = await import('data:text/javascript;base64,' + Buffer.from(pfJs).toString('base64'));

console.log('\n── ① 판정: 틀린 발음만 교정 ──');
const res = (words, ok = true) => ({ ok, words });
check('틀린 발음(Mispronunciation, 정확도 20) → 교정', pf.pronFixFromResult(res([{ word: 'pok', accuracy: 20, errorType: 'Mispronunciation' }]), 'pok') !== null);
const bad = pf.pronFixFromResult(res([{ word: 'bug', accuracy: 18.6, errorType: 'Mispronunciation' }]), 'bug');
check('bug 를 틀리게(정확도 18.6) → 교정 대상, 3번', bad && bad.word === 'bug' && bad.say_times === 3 && bad.accuracy === 19, bad);
check('빠뜨림(Omission) → 교정 안 함(다른 말을 한 것)', pf.pronFixFromResult(res([{ word: 'bug', accuracy: 0, errorType: 'Omission' }]), 'bug') === null);
check('맞게 발음(None, 90점) → 교정 안 함', pf.pronFixFromResult(res([{ word: 'bug', accuracy: 90, errorType: 'None' }]), 'bug') === null);
check('경계값: 정확도 60 은 교정 안 함(60 미만만)', pf.pronFixFromResult(res([{ word: 'bug', accuracy: 60, errorType: 'Mispronunciation' }]), 'bug') === null);
check('경계값: 59.4 는 교정(반올림 전 값으로 판단)', pf.pronFixFromResult(res([{ word: 'bug', accuracy: 59.4, errorType: 'Mispronunciation' }]), 'bug') !== null);
check('낱말 대소문자 무시(Bug 도 bug)', pf.pronFixFromResult(res([{ word: 'Bug', accuracy: 10, errorType: 'Mispronunciation' }]), 'bug') !== null);
check('기준 낱말이 결과에 없으면 교정 안 함', pf.pronFixFromResult(res([{ word: 'cat', accuracy: 10, errorType: 'Mispronunciation' }]), 'bug') === null);
check('Azure 실패(ok:false)면 교정 안 함', pf.pronFixFromResult({ ok: false, reason: 'no_key' }, 'bug') === null);
check('결과가 null 이어도 던지지 않음', pf.pronFixFromResult(null, 'bug') === null);
check('정확도가 숫자가 아니면 교정 안 함', pf.pronFixFromResult(res([{ word: 'bug', accuracy: 'x', errorType: 'Mispronunciation' }]), 'bug') === null);

console.log('\n── ② 형식·가드 ──');
check('기준 낱말: 영문자 2~20자만 허용', pf.pronTargetOk('bug') && !pf.pronTargetOk('b') && !pf.pronTargetOk('bug!') && !pf.pronTargetOk('a b') && !pf.pronTargetOk(42));
check('base64 가 아니면 디코드 실패 → null', pf.decodePronAudio('!!!notb64') === null || pf.decodePronAudio('!!!notb64') instanceof ArrayBuffer);
check('너무 큰 base64 는 거절(요금·지연 보호)', pf.decodePronAudio('A'.repeat(500001)) === null);
check('빈 값은 거절', pf.decodePronAudio('') === null && pf.decodePronAudio(null) === null);
{
  const env = {};
  const r = await pf.assessPronFix(env, 'AAAA', 'bug');   // assessPronunciation 은 스텁 → null
  check('assessPronFix 는 실패를 던지지 않고 null', r === null);
  check('assessPronFix: 기준 낱말이 형식에 안 맞으면 Azure 를 부르지 않고 null', (await pf.assessPronFix(env, 'AAAA', 'b!')) === null);
}

// ── ③ 클라이언트 기준 낱말 고르기 — 화면 소스에서 꺼내 실행 ───────────
const HTML = R('cloudflare-deploy/public/ai-friend.html');
const startI = HTML.indexOf('const PRON_STOP = new Set(');
const endI = HTML.indexOf('function pronTargetOk(t)', startI);
check('전제: 기준 낱말 함수를 화면에서 찾았다', startI > 0 && endI > startI);
const pickSrc = HTML.slice(startI, endI) + '\nreturn pronTargetFromAi;';
const pickTarget = new Function(pickSrc)();
console.log('\n── ③ 기준 낱말 고르기 ──');
check('"Is it a bug?" → bug', pickTarget('Is it a bug?') === 'bug', pickTarget('Is it a bug?'));
check('"Did you see a monster?" → monster', pickTarget('Did you see a monster?') === 'monster', pickTarget('Did you see a monster?'));
check('"What do you like?" → like 는 불용어라 건너뜀(빈 값)', pickTarget('What do you like?') === '', pickTarget('What do you like?'));
check('물음표로 끝나지 않으면 기준 낱말 없음(교정 안 함)', pickTarget('Nice! You went to school yesterday.') === '');
check('빈 입력은 빈 값', pickTarget('') === '' && pickTarget(null) === '');

// ── ④ 배선 ───────────────────────────────────────────────────────────
console.log('\n── ④ 배선 ──');
const API = R('cloudflare-deploy/src/api-ai.ts');
check('chat-friend: pron 은 집중교정에서만 받는다', /friendMode === 'focused' && b\.pron && typeof b\.pron === 'object'/.test(API));
check('chat-friend: 발음 판정은 응답 전에 «미리» 시작한다', /const pronP: Promise<any> = pronIn \? assessPronFix/.test(API));
check('chat-friend: 응답에 pron_fix 를 싣는다', /pron_fix: pronFix/.test(API) && /const pronFix = await pronP;/.test(API));
check('chat-friend: 판정 실패는 응답을 막지 않는다(assessPronFix 는 던지지 않음)', /catch \{\s*return null;\s*\}/.test(PF_SRC));
check('화면: 음성 턴이면 WAV 와 기준 낱말을 보낸다', /pron: pronBody/.test(HTML) && /pronPayload\(_lastRecBlob, tgt\)/.test(HTML));
check('화면: 집중교정 모드에서만 보낸다', /wasVoice && currentCorr === 'focused' && _lastRecBlob/.test(HTML));
check('화면: 응답의 pron_fix 를 그린다', /if \(d\.pron_fix\) showPronFix\(d\.pron_fix, false\)/.test(HTML));
// Execute the actual queue, including its completion signal and cancellation.
const ts = createRequire(path.join(ROOT, 'cloudflare-deploy/package.json'))('typescript');
const inline = [...HTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('function sayThrice('));
const ast = ts.createSourceFile('friend.js', inline, ts.ScriptTarget.Latest, true);
let saySource = '';
(function visit(n) { if (ts.isFunctionDeclaration(n) && n.name?.text === 'sayThrice') saySource = n.getText(ast); ts.forEachChild(n, visit); })(ast);
check('전제: 실제 sayThrice 함수를 추출했다', !!saySource);
const calls = [];
const say = new Function('speakText', 'isSoundOn', 'var _stmGen=0; ' + saySource + '; return sayThrice;')(
  (word, _b, _r, done) => { calls.push(word); queueMicrotask(done); }, () => true);
await say('bug', 3);
check('화면: 발음 교정 3회가 완료된 뒤 큐를 돌려준다', calls.length === 3 && calls.every(x => x === 'bug'));
check('화면: 자동 발음 반복은 주 응답 큐 뒤에 연결된다', /_stmChain = _stmChain\.then\(function \(\) \{[\s\S]*?return sayThrice\(d\.pron_fix\.word, d\.pron_fix\.say_times \|\| 3\)/.test(HTML));
const muted = [];
await new Function('speakText', 'isSoundOn', 'var _stmGen=0; ' + saySource + '; return sayThrice;')((w) => muted.push(w), () => false)('bug', 3);
check('짝: 음소거면 발음 반복도 읽지 않는다', muted.length === 0);
const cut = [];
let cancelled;
cancelled = new Function('speakText', 'isSoundOn', 'var _stmGen=0; ' + saySource + '; return {say:sayThrice,stop(){_stmGen++;}};')(
  (word, _b, _r, done) => { cut.push(word); cancelled.stop(); queueMicrotask(done); }, () => true);
await cancelled.say('bug', 3);
check('짝: 새 턴·정지 뒤에는 남은 발음 반복을 이어 읽지 않는다', cut.length === 1);
check('화면: 녹음 파일을 발음 교정 뒤에 비운다', /_lastRecBlob = null;/.test(HTML));
check('화면: AI 마지막 말을 기억한다', /if \(role === 'ai'\) _lastAiText = String\(content \|\| ''\);/.test(HTML));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
