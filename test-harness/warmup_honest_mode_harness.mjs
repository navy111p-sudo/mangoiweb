#!/usr/bin/env node
/**
 * 🎯 warmup_honest_mode_harness — A.i 말하기 연습 «칭찬은 정직하게, 교정은 선택해서» (2026-10-29)
 *
 * 정본 src/warmup-honest.ts 를 타입만 벗겨 «실제로» 돌리고, 화면(warmup.html)의 wuApplyGrade 를
 * 오려 내 가짜 화면에서 실행한다. 제안서(강남캐피 원장님 현장 피드백)의 수용 기준:
 *   ① 「I go park yesterday.」 → perfect 아님 · 칭찬 말머리(Great·It's great) 없음 · 팡파레 없음
 *   ② 「park... yesterday」(낱말 몇 개) → perfect 아님 · 팡파레 없음
 *   ③ 「I went to the park yesterday.」 → perfect · 팡파레
 *   ④ 집중교정 + 오류 → 매번 교정 카드 + 따라 말하기 · 자유대화 → 따라 말하기 «절대» 없음
 *   ⑤ 교정 카드가 있으면 perfect 일 수 없다(카드와 음성이 같은 판정)
 *   ⑥ 등급을 못 읽으면 perfect 로 떨어지지 않는다
 *   ⑦ 시범 학원 밖 학생은 예전 그대로(등급이 안 오면 화면도 예전 그대로)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'cloudflare-deploy/src');
const HTML = path.join(ROOT, 'cloudflare-deploy/public/warmup.html');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};

/* ── 정본 불러오기 (타입만 벗긴다) ── */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wuhonest-'));
const HONEST_SRC = process.env.HONEST_SRC || path.join(SRC, 'warmup-honest.ts');
for (const [from, to] of [[path.join(SRC, 'warmup-empathy.ts'), 'warmup-empathy.mjs'], [HONEST_SRC, 'warmup-honest.mjs']]) {
  let js = stripTypeScriptTypes(fs.readFileSync(from, 'utf8'));
  js = js.replace(/from '\.\/warmup-empathy'/g, "from './warmup-empathy.mjs'");
  fs.writeFileSync(path.join(tmp, to), js);
}
const H = await import(pathToFileURL(path.join(tmp, 'warmup-honest.mjs')).href);

console.log('① 등급 확인(finalizeWarmupGrade) — 모델 등급을 믿지 않는다');
const FIX = { was: 'go', now: 'went', why_ko: '어제라서 과거형', tag: 'past_tense', severity: 'major' };
ok('「I go park yesterday.」 모델이 perfect 라 해도 교정이 있으면 partial', H.finalizeWarmupGrade('perfect', FIX, 'I go park yesterday.') === 'partial');
ok('「park... yesterday」 모델이 perfect 라 해도 낱말 2개면 partial', H.finalizeWarmupGrade('perfect', null, 'park... yesterday') === 'partial');
ok('한글이 섞이면 perfect 아님', H.finalizeWarmupGrade('perfect', null, 'I like 떡볶이 very much') === 'partial');
ok('「I went to the park yesterday.」 → perfect', H.finalizeWarmupGrade('perfect', null, 'I went to the park yesterday.') === 'perfect');
ok('incomplete 는 그대로', H.finalizeWarmupGrade('incomplete', null, 'park yesterday') === 'incomplete');
ok('등급을 못 읽으면(null) partial — perfect 로 떨어지지 않음', H.finalizeWarmupGrade(null, null, 'I went to the park yesterday.') === 'partial');
ok('모르는 값이면 partial', H.finalizeWarmupGrade('excellent', null, 'I went to the park yesterday.') === 'partial');
ok('이상한 입력에도 던지지 않음', (() => { try { return H.finalizeWarmupGrade('perfect', null, { toString() { throw new Error('x'); } }) === 'partial'; } catch { return false; } })());

console.log('② 등급 읽기(parseWarmupGrade)');
ok('객체에서', H.parseWarmupGrade({ reply: 'hi', grade: 'perfect' }) === 'perfect');
ok('JSON 문자열에서', H.parseWarmupGrade('{"reply":"hi","grade":"partial","fix":null}') === 'partial');
ok('대문자도', H.parseWarmupGrade('{"grade":"INCOMPLETE"}') === 'incomplete');
ok('없으면 null', H.parseWarmupGrade('{"reply":"hi"}') === null);
ok('모르는 값이면 null', H.parseWarmupGrade('{"grade":"excellent"}') === null);
ok('null 입력 → null', H.parseWarmupGrade(null) === null);

console.log('③ 정직한 칭찬(applyHonestPraise)');
ok('partial: 「It\'s great! What did you do?」 → 칭찬 말머리 뗌',
  H.applyHonestPraise("It's great! What did you do there?", 'partial') === 'What did you do there?', H.applyHonestPraise("It's great! What did you do there?", 'partial'));
ok('partial: 「Great! Oh, you went to the park yesterday?」 → 뗌',
  !/^great/i.test(H.applyHonestPraise('Great! Oh, you went to the park yesterday?', 'partial')));
ok('incomplete: 「Wow, amazing! Can you say it in a full sentence?」 → 뗌',
  /^Can you say it/.test(H.applyHonestPraise('Wow, amazing! Can you say it in a full sentence?', 'incomplete')),
  H.applyHonestPraise('Wow, amazing! Can you say it in a full sentence?', 'incomplete'));
ok('perfect: 칭찬 그대로', H.applyHonestPraise('Nice! You used the past tense correctly.', 'perfect') === 'Nice! You used the past tense correctly.');
ok('partial: recast 문장은 손대지 않음', H.applyHonestPraise('Oh, you went to the park yesterday? What did you do?', 'partial') === 'Oh, you went to the park yesterday? What did you do?');

console.log('④ 교정 모드(gateFixForMode)');
const g1 = H.gateFixForMode('focused', FIX, null, false);
ok('집중교정: 기존 게이트가 막아도(show null) 검증된 교정은 매번 보임 + 따라 말하기', g1.show === FIX && g1.repeat === true, g1);
const g2 = H.gateFixForMode('focused', null, null, false);
ok('집중교정: 교정이 없으면 아무것도 없음', g2.show === null && g2.repeat === false);
const g3 = H.gateFixForMode('free_talk', FIX, FIX, true);
ok('자유대화: 따라 말하기 «절대» 없음(카드는 기존 게이트 그대로)', g3.repeat === false && g3.show === FIX, g3);
const g4 = H.gateFixForMode('balanced', FIX, null, false);
ok('균형: 기존 동작 그대로(막혔으면 막힘)', g4.show === null && g4.repeat === false);
const g5 = H.gateFixForMode('balanced', FIX, FIX, true);
ok('균형: 기존 동작 그대로(보이면 보임)', g5.show === FIX && g5.repeat === true);
for (let t = 0; t < 50; t++) {
  const r = H.gateFixForMode('free_talk', FIX, Math.random() < 0.5 ? FIX : null, Math.random() < 0.5);
  if (r.repeat) { ok('자유대화 무작위 50회 중 따라 말하기 0회', false, t); break; }
  if (t === 49) ok('자유대화 무작위 50회 중 따라 말하기 0회', true);
}

console.log('⑤ 시범 학원(기능 플래그)');
ok('강남캐피타운학원 → focused', H.pilotModeFor('강남캐피타운학원') === 'focused');
ok('다른 학원 → null(예전 동작)', H.pilotModeFor('어느학원') === null);
ok('빈 값 → null', H.pilotModeFor('') === null && H.pilotModeFor(null) === null);
ok('부분일치로 켜지지 않음', H.pilotModeFor('강남캐피') === null && H.pilotModeFor('강남캐피타운학원 2') === null);
ok('Object 원형 키로 켜지지 않음', H.pilotModeFor('toString') === null && H.pilotModeFor('constructor') === null);

const mkEnv = (rows, { throwDb = false, kvInit = {} } = {}) => {
  const kv = new Map(Object.entries(kvInit)); let dbCalls = 0; const sqls = [];
  return {
    calls: () => dbCalls, sqls,
    env: {
      SESSION_STATE: { async get(k) { return kv.has(k) ? kv.get(k) : null; }, async put(k, v) { kv.set(k, v); } },
      DB: { prepare(sql) { sqls.push(sql); return { bind(uid) { return { async first() {
        dbCalls++; if (throwDb) throw new Error('D1 down');
        const nocase = /NOCASE/.test(sql);
        const hit = Object.keys(rows).filter((k) => nocase ? k.toLowerCase() === String(uid).toLowerCase() : k === uid).sort()[0];
        return hit !== undefined ? { shop_name: rows[hit] } : null;
      } }; } }; } },
    },
  };
};
{
  const e = mkEnv({ kim01: '강남캐피타운학원', lee01: '어느학원' });
  ok('시범 학원 학생 → { mode: focused }', (await H.resolveWarmupHonest(e.env, 's1', 'kim01'))?.mode === 'focused');
  ok('다른 학원 학생 → null', (await H.resolveWarmupHonest(e.env, 's1', 'lee01')) === null);
  ok('명부에 없는 학생 → null', (await H.resolveWarmupHonest(e.env, 's1', 'nobody')) === null);
  ok('조회는 user_id 로 좁힌다', e.sqls.every((s) => /WHERE user_id = \?/.test(s)));
  const before = e.calls();
  ok('같은 세션 두 번째는 KV 캐시(DB 안 부름)', (await H.resolveWarmupHonest(e.env, 's1', 'kim01'))?.mode === 'focused' && e.calls() === before);
  ok('중국어 대화 → null', (await H.resolveWarmupHonest(e.env, 's2', 'kim01', { lang: 'zh' })) === null);
  ok('엘리더잼 통로 → null', (await H.resolveWarmupHonest(e.env, 's3', 'kim01', { eleader: true })) === null);
  ok('아이디 없음 → null', (await H.resolveWarmupHonest(e.env, 's4', '')) === null);
  ok('대소문자만 다른 아이디도 찾음(정확일치 먼저)', (await H.resolveWarmupHonest(e.env, 's5', 'KIM01'))?.mode === 'focused');
  const t = mkEnv({}, { throwDb: true });
  ok('D1 이 던지면 null(예전 동작 — fail-open)', (await H.resolveWarmupHonest(t.env, 's6', 'kim01')) === null);
  // 🎚️ 학생이 첫 화면에서 고른 모드 — 시범 판정보다 이기고, 모르는 값은 무시한다(짝)
  const c = mkEnv({ kim01: '강남캐피타운학원', lee01: '어느학원' });
  ok('고른 모드(free_talk)가 시범 모드(focused)를 이긴다', (await H.resolveWarmupHonest(c.env, 'c1', 'kim01', { chosen: 'free_talk' }))?.mode === 'free_talk');
  ok('다른 학원 학생도 고르면 그 모드', (await H.resolveWarmupHonest(c.env, 'c2', 'lee01', { chosen: 'balanced' }))?.mode === 'balanced');
  ok('로그인 안 해도 고르면 그 모드(D1 안 읽음)', (await H.resolveWarmupHonest(c.env, 'c3', '', { chosen: 'focused' }))?.mode === 'focused');
  ok('모르는 값은 무시 → 다른 학원 학생은 예전대로 null', (await H.resolveWarmupHonest(c.env, 'c4', 'lee01', { chosen: 'strict' })) === null);
  ok('모르는 값은 무시 → 시범 학생은 시범 모드', (await H.resolveWarmupHonest(c.env, 'c5', 'kim01', { chosen: 'x' }))?.mode === 'focused');
  ok('문자열이 아니면 무시', (await H.resolveWarmupHonest(c.env, 'c6', 'lee01', { chosen: ['focused'] })) === null);
  ok('골라도 중국어 대화 → null', (await H.resolveWarmupHonest(c.env, 'c7', 'kim01', { lang: 'zh', chosen: 'focused' })) === null);
  ok('골라도 엘리더잼 → null', (await H.resolveWarmupHonest(c.env, 'c8', 'kim01', { eleader: true, chosen: 'focused' })) === null);
}

console.log('⑥ 프롬프트(warmupHonestRule)');
const rule = H.warmupHonestRule('focused');
ok('grade 키를 요구', /"grade"/.test(rule) && /perfect/.test(rule) && /partial/.test(rule) && /incomplete/.test(rule));
ok('완벽이 아니면 최상급 칭찬 금지', /perfect 가 아니면 Great, Excellent, Perfect/.test(rule));
ok('기존 [칭찬] 규칙보다 우선한다고 밝힘', /\[칭찬 — 위 \[칭찬\] 규칙보다 «우선» 한다\]/.test(rule));
ok('집중교정: 따라 말하자고 함', /집중교정/.test(rule) && /say it with me/i.test(rule));
ok('자유대화: 따라 말하라고 시키지 말라', /따라 말하라고 시키지 마/.test(H.warmupHonestRule('free_talk')));
ok('모르는 모드 → 균형', /교정 모드: 균형/.test(H.warmupHonestRule('weird')));

console.log('⑥-2 집중교정 음성 순서 — 교정 문장이 답장보다 먼저(ensureFocusedFixSpoken)');
{
  const FIX = { now: 'I went to the park yesterday', was: 'I go park yesterday' };
  const REPLY = 'Where did you play after that?';
  const out = H.ensureFocusedFixSpoken(REPLY, 'focused', 'partial', FIX);
  const fixAt = out.indexOf('"I went to the park yesterday"');
  const replyAt = out.indexOf(REPLY);
  ok('교정 문장이 맨 앞', fixAt === 0);
  ok('교정 문장이 답장보다 앞', fixAt >= 0 && replyAt > fixAt);
  ok('"Let\'s say it this way" 가 교정 문장 뒤·답장 앞', out.indexOf("Let's say it this way") > fixAt && out.indexOf("Let's say it this way") < replyAt);
  const repeats = out.split('"I went to the park yesterday"').length - 1;
  ok('교정 문장은 모두 4번 (앞 1 + 반복 3)', repeats === 1 + H.FOCUSED_FIX_REPEATS && H.FOCUSED_FIX_REPEATS === 3, repeats);
  ok('답장에 이미 교정이 있어도 순서는 같다', H.ensureFocusedFixSpoken('Good. I went to the park yesterday. Where?', 'focused', 'partial', FIX).startsWith('"I went to the park yesterday"'));
  ok('완벽이면 건드리지 않는다', H.ensureFocusedFixSpoken(REPLY, 'focused', 'perfect', FIX) === REPLY);
  ok('자유대화·균형이면 건드리지 않는다', H.ensureFocusedFixSpoken(REPLY, 'free_talk', 'partial', FIX) === REPLY && H.ensureFocusedFixSpoken(REPLY, 'balanced', 'partial', FIX) === REPLY);
  ok('교정이 없으면 건드리지 않는다', H.ensureFocusedFixSpoken(REPLY, 'focused', 'partial', null) === REPLY);
  ok('빈 교정 문장이면 건드리지 않는다', H.ensureFocusedFixSpoken(REPLY, 'focused', 'partial', { now: '  ' }) === REPLY);
}

console.log('⑦ 배선 — src/index.ts (공동 금지구역 · «부르는 줄» 만)');
const idx = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8');
const body = idx.slice(idx.indexOf('async function handleWarmupChat('), idx.indexOf('function warmupNormSent('));
const at = (s) => body.indexOf(s);
ok('핸들러를 잘라 냈다(전제)', body.length > 1000 && at('handleWarmupChat') >= 0);
ok('시범 여부를 정본으로 묻는다', at('const honest = await resolveWarmupHonest(') > 0);
ok('규칙은 시범일 때만 붙인다', /if \(honest\) sys \+= '\\n' \+ warmupHonestRule\(honest\.mode\);/.test(body));
ok('모델 등급을 커밋할 때 함께 확정(교정과 같은 답장)', /commitFix = \(\) => \{[^}]*rawGrade = stagedGrade/.test(body));
ok('등급 확인·칭찬 떼기가 히스토리 저장보다 «앞»', at('applyHonestPraise(aiText') > 0 && at('applyHonestPraise(aiText') < at('SESSION_STATE.put(hkey'));
ok('모델이 실패한 턴은 등급을 null 로(→ partial)', /finalizeWarmupGrade\(modelOk \? rawGrade : null/.test(body));
ok('교정 모드 게이트가 따라 말하기 판정 «뒤»', at('gateFixForMode(honest.mode') > at('offerRepeat = warmupShouldOfferRepeat('));
ok('응답에 grade 는 시범일 때만 싣는다', /\.\.\.\(honest \? \{ grade: honestGrade \|\| 'partial'/.test(body));
ok('스트림 미리읽기에 honest 를 넘긴다', /createWarmupLive\(sseSend, \{[^}]*honest: !!honest/.test(body));
ok('honest 는 스트림보다 먼저 정해진다', at('const honest = await') < at('createWarmupLive('));
const strm = fs.readFileSync(path.join(SRC, 'warmup-stream.ts'), 'utf8');
ok('스트림: 첫 문장이 칭찬 말머리면 미리 읽지 않음', /if \(o\.honest && !n\)/.test(strm) && /halt = 'praise'/.test(strm));

console.log('⑧ 화면 — warmup.html wuApplyGrade 를 실제로 돌린다');
const html = fs.readFileSync(HTML, 'utf8');
const fnAt = html.indexOf('function wuApplyGrade(d){');
let fnSrc = '';
if (fnAt >= 0) {
  let i = html.indexOf('{', fnAt), d = 0;
  for (; i < html.length; i++) { if (html[i] === '{') d++; else if (html[i] === '}') { d--; if (d === 0) break; } }
  fnSrc = html.slice(fnAt, i + 1);
}
ok('wuApplyGrade 를 오려 냈다(전제)', fnSrc.length > 100);
const milesSrc = (html.match(/var COMBO_MILESTONES = \{[\s\S]*?\};/) || [''])[0];
ok('COMBO_MILESTONES 를 오려 냈다(전제)', milesSrc.length > 20);
const run = (graded, sendBumped, combo, d) => {
  const ctx = { _wuGraded: graded, _wuSendBumped: sendBumped, _combo: combo, fan: 0, bumps: 0,
    document: { getElementById: () => ({ textContent: '', style: {} }) } };
  vm.createContext(ctx);
  vm.runInContext(milesSrc + '\n' + 'function fanfare(){ fan++; }\nfunction bumpCombo(){ _combo++; bumps++; if(COMBO_MILESTONES[_combo]) fanfare(); }\n' + fnSrc
    + '\nwuApplyGrade(' + JSON.stringify(d) + ');', ctx, { timeout: 500 });
  return ctx;
};
try {
  let c = run(false, true, 5, { ai_response: 'x' });
  ok('등급이 없는 응답(시범 밖) → 콤보·팡파레 그대로', c._combo === 5 && c.fan === 0 && c._wuGraded === false);
  c = run(false, true, 1, { grade: 'partial' });
  ok('첫 등급 응답 partial → 보낼 때 올린 1을 되돌림 · 팡파레 없음', c._combo === 0 && c.fan === 0 && c._wuGraded === true, c);
  c = run(true, false, 4, { grade: 'partial' });
  ok('partial → 콤보 그대로 · 팡파레 없음', c._combo === 4 && c.fan === 0);
  c = run(true, false, 4, { grade: 'incomplete' });
  ok('incomplete → 팡파레 없음', c._combo === 4 && c.fan === 0);
  c = run(true, false, 0, { grade: 'perfect' });
  ok('perfect → 콤보 +1 · 팡파레 1번', c._combo === 1 && c.fan === 1, c);
  c = run(true, false, 2, { grade: 'perfect' });
  ok('perfect 가 고비(3콤보)면 팡파레는 한 번만', c._combo === 3 && c.fan === 1, c);
} catch (e) { ok('wuApplyGrade 실행', false, String(e)); }
ok('보낼 때 콤보는 등급을 안 받는 학생만', /_wuSendBumped=false; if\(!_wuGraded\)\{ bumpCombo\(\); _wuSendBumped=true; \}/.test(html));
ok('한 번에 받기·스트림 두 경로 모두 wuApplyGrade 를 부른다', (html.match(/\n\s*wuApplyGrade\(d\);/g) || []).length === 2);
ok('따라 말하기 «완벽» 이면 보상(등급을 받는 학생만)', /_wuGraded && _rc\.getAttribute\('data-grade'\)==='great'\)\{ bumpCombo\(\); confettiBurst\(\); fanfare\(\); \}/.test(html));

// ⑨ 첫 화면 교정 방식 고르기 — 고른 값만 보내고(짝: 안 고르면 안 보냄), 저장하고, 표시한다
{
  const grab = (re) => { const m = html.match(re); return m ? m[0] : ''; };
  const cat = grab(/var CMODE_CATALOG = \[[\s\S]*?\n\];/);
  const setFn = grab(/function setCorrMode\(id\)\{[\s\S]*?\n\}/);
  const htmlFn = grab(/function cmodesHtml\(\)\{[\s\S]*?\n\}/);
  const ctxLine = grab(/  if\(_wuCorrMode\) body\.correction_mode = _wuCorrMode;/);
  ok('⑨ 전제: 카탈로그·setCorrMode·cmodesHtml·withCtx 줄을 오려 냈다', !!(cat && setFn && htmlFn && ctxLine));
  const mk = (saved) => {
    const store = new Map(saved ? [['mangoi_warmup_correction', saved]] : []);
    const ctx = { localStorage: { getItem: (k) => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) },
      wuT: (k) => k, store };
    vm.createContext(ctx);
    const init = grab(/var WU_CMODE_KEY = [\s\S]*?\n\}catch\(e\)\{\}/);
    vm.runInContext(cat + '\n' + init + '\n' + setFn + '\n' + htmlFn + '\nfunction send(){ var body={}; ' + ctxLine + ' return body; }', ctx, { timeout: 500 });
    return ctx;
  };
  try {
    let c = mk(null);
    ok('⑨ 안 골랐으면 correction_mode 를 안 보낸다(예전 동작)', !('correction_mode' in vm.runInContext('send()', c)));
    ok('⑨ 안 골랐으면 «지금» 표시 없음 · 균형에 «기본» 표시', !/wus-now/.test(vm.runInContext('cmodesHtml()', c)) && /data-cmode="balanced"[^]*?기본/.test(vm.runInContext('cmodesHtml()', c)));
    ok('⑨ 세 모드 버튼(자유대화·균형·집중교정)', ['free_talk', 'balanced', 'focused'].every((id) => vm.runInContext('cmodesHtml()', c).includes('data-cmode="' + id + '"')) && ['자유대화', '균형', '집중교정'].every((k) => vm.runInContext('cmodesHtml()', c).includes(k)));
    ok('⑨ 고르면 저장하고 그 값을 보낸다', vm.runInContext("setCorrMode('focused')", c) === true && c.store.get('mangoi_warmup_correction') === 'focused' && vm.runInContext('send()', c).correction_mode === 'focused');
    ok('⑨ 고른 칸에 «지금» 표시', /data-cmode="focused" aria-pressed="true"/.test(vm.runInContext('cmodesHtml()', c)));
    ok('⑨ 모르는 값은 고르지 않는다', vm.runInContext("setCorrMode('strict')", c) === false && vm.runInContext('send()', c).correction_mode === 'focused');
    c = mk('free_talk');
    ok('⑨ 저장된 값으로 시작한다', vm.runInContext('send()', c).correction_mode === 'free_talk');
    c = mk('garbage');
    ok('⑨ 저장값이 엉뚱하면 안 고른 것으로', !('correction_mode' in vm.runInContext('send()', c)));
  } catch (e) { ok('⑨ 실행', false, String(e)); }
  // 서버 id 와 화면 id 가 같은 말을 하는가(짝)
  const ids = [...cat.matchAll(/id:'([a-z_]+)'/g)].map((m) => m[1]).sort().join(',');
  ok('⑨ 화면 모드 id == 서버 WARMUP_MODES', ids === [...H.WARMUP_MODES].sort().join(','), ids);
  ok('⑨ 클릭 위임이 data-cmode 를 받는다', /\[data-cmode\]'\)/.test(html) && /if\(t\.getAttribute\('data-cmode'\)\) \{ setCorrMode\(/.test(html));
  ok('⑨ PC 3단계 카드(1번)로 옮기고 되돌린다', /\['wusPcB1',\['wusGLang','wusTalkSec','wusGMode'\]\]/.test(html) && /'wusGLevel','wusGMode'\]\.forEach/.test(html));
  ok('⑨ 중국어에서는 감춘다', /gmode\.hidden = isZh\(\)/.test(html) && /#wusGMode\[hidden\]\{display:none!important\}/.test(html));
  ok('⑨ 서버가 body.correction_mode 를 정본에 넘긴다', /resolveWarmupHonest\([^;]*chosen: body && body\.correction_mode \}\)/.test(idx));
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log('┌────────────────────────────────────────────────');
console.log('│ 🎯 warmup_honest_mode_harness — PASS ' + pass + ' / FAIL ' + fail);
console.log('└────────────────────────────────────────────────');
process.exit(fail ? 1 : 0);
