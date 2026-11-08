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
for (const [from, to] of [[path.join(SRC, 'warmup-empathy.ts'), 'warmup-empathy.mjs'], [path.join(SRC, 'warmup-shop-mode.ts'), 'warmup-shop-mode.mjs'], [HONEST_SRC, 'warmup-honest.mjs']]) {
  let js = stripTypeScriptTypes(fs.readFileSync(from, 'utf8'));
  js = js.replace(/from '\.\/warmup-empathy'/g, "from './warmup-empathy.mjs'").replace(/from '\.\/warmup-shop-mode'/g, "from './warmup-shop-mode.mjs'");   // 🎚️ 2026-10-31 원장님 학원 설정
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

console.log('④-2 고친 문장을 말로 앞에 붙이나(warmupSpeaksFixLead) — 2026-11-04 «자유대화는 카드만»');
ok('④-2 정본이 있다(전제)', typeof H.warmupSpeaksFixLead === 'function');
if (typeof H.warmupSpeaksFixLead === 'function') {
  ok('④-2 자유대화 → 안 붙인다(카드만)', H.warmupSpeaksFixLead('free_talk') === false);
  ok('④-2 집중교정 → 안 붙인다(이미 3번 말함)', H.warmupSpeaksFixLead('focused') === false);
  /* 짝 — 위 둘만 보면 «언제나 안 붙인다» 같은 엉터리 수리도 통과한다 */
  ok('④-2 균형 → 붙인다(질문보다 먼저 한 번)', H.warmupSpeaksFixLead('balanced') === true);
  ok('④-2 모드 없음(중국어 등 null/undefined) → 붙인다(예전 동작)', H.warmupSpeaksFixLead(null) === true && H.warmupSpeaksFixLead(undefined) === true);
  ok('④-2 모르는 값 → 붙인다(조용히 끄지 않음)', H.warmupSpeaksFixLead('strict') === true && H.warmupSpeaksFixLead('') === true);
}

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

console.log('⑤ 기본 모드 — 모든 학생·학원 = 집중교정 (2026-10-31)');
{
  const e = mkEnv({ kim01: '강남캐피타운학원', lee01: '어느학원' });
  ok('시범 학원 학생 → { mode: focused }', (await H.resolveWarmupHonest(e.env, 's1', 'kim01'))?.mode === 'focused');
  ok('다른 학원 학생 → 기본 모드 focused(2026-10-31 전원 집중교정)', (await H.resolveWarmupHonest(e.env, 's1', 'lee01'))?.mode === 'focused');
  ok('명부에 없는 학생 → 기본 모드 focused', (await H.resolveWarmupHonest(e.env, 's1', 'nobody'))?.mode === 'focused');
  ok('학생 조회는 user_id 로 좁힌다', e.sqls.filter((s) => /FROM students_erp/.test(s)).length > 0 && e.sqls.filter((s) => /FROM students_erp/.test(s)).every((s) => /WHERE user_id = \?/.test(s)));   // 2026-10-31: 원장님 설정 표(warmup_shop_mode)는 학원 이름으로 읽는다
  const before = e.calls();
  ok('같은 세션 두 번째는 KV 캐시(DB 안 부름)', (await H.resolveWarmupHonest(e.env, 's1', 'kim01'))?.mode === 'focused' && e.calls() === before);
  ok('중국어 대화 → null', (await H.resolveWarmupHonest(e.env, 's2', 'kim01', { lang: 'zh' })) === null);
  ok('엘리더잼 통로도 기본 모드 focused(2026-10-31: 엘리더잼도 교정을 켠다)', (await H.resolveWarmupHonest(e.env, 's3', 'kim01', { eleader: true }))?.mode === 'focused');
  ok('아이디 없음 → 기본 모드 focused', (await H.resolveWarmupHonest(e.env, 's4', ''))?.mode === 'focused');
  ok('대소문자만 다른 아이디도 찾음(정확일치 먼저)', (await H.resolveWarmupHonest(e.env, 's5', 'KIM01'))?.mode === 'focused');
  const t = mkEnv({}, { throwDb: true });
  ok('D1 이 던지면 기본 모드 focused(fail-open 도 기본 모드)', (await H.resolveWarmupHonest(t.env, 's6', 'kim01'))?.mode === 'focused');
  // 🎚️ 학생이 첫 화면에서 고른 모드 — 시범 판정보다 이기고, 모르는 값은 무시한다(짝)
  const c = mkEnv({ kim01: '강남캐피타운학원', lee01: '어느학원' });
  ok('고른 모드(free_talk)가 기본(focused)을 이긴다', (await H.resolveWarmupHonest(c.env, 'c1', 'kim01', { chosen: 'free_talk' }))?.mode === 'free_talk');
  ok('다른 학원 학생도 고르면 그 모드', (await H.resolveWarmupHonest(c.env, 'c2', 'lee01', { chosen: 'balanced' }))?.mode === 'balanced');
  ok('로그인 안 해도 고르면 그 모드(D1 안 읽음)', (await H.resolveWarmupHonest(c.env, 'c3', '', { chosen: 'focused' }))?.mode === 'focused');
  ok('모르는 값은 무시 → 다른 학원 학생은 기본 모드 focused', (await H.resolveWarmupHonest(c.env, 'c4', 'lee01', { chosen: 'strict' }))?.mode === 'focused');
  ok('모르는 값은 무시 → 시범 학생은 시범 모드', (await H.resolveWarmupHonest(c.env, 'c5', 'kim01', { chosen: 'x' }))?.mode === 'focused');
  ok('문자열이 아니면 무시 → 기본 모드 focused', (await H.resolveWarmupHonest(c.env, 'c6', 'lee01', { chosen: ['focused'] }))?.mode === 'focused');
  ok('골라도 중국어 대화 → null', (await H.resolveWarmupHonest(c.env, 'c7', 'kim01', { lang: 'zh', chosen: 'focused' })) === null);
  ok('골라도 엘리더잼 → 고른 모드(focused)', (await H.resolveWarmupHonest(c.env, 'c8', 'kim01', { eleader: true, chosen: 'focused' }))?.mode === 'focused');
}

console.log('⑥ 프롬프트(warmupHonestRule)');
const rule = H.warmupHonestRule('focused');
ok('grade 키를 요구', /"grade"/.test(rule) && /perfect/.test(rule) && /partial/.test(rule) && /incomplete/.test(rule));
ok('완벽이 아니면 최상급 칭찬 금지', /perfect 가 아니면 Great, Excellent, Perfect/.test(rule));
ok('기존 [칭찬] 규칙보다 우선한다고 밝힘', /\[칭찬 — 위 \[칭찬\] 규칙보다 «우선» 한다\]/.test(rule));
/* 🏅 (2026-11-04) 첫마디 턴과 «한 자리» — 이 규칙이 [칭찬] 보다 «우선» 이라 «구체적으로 칭찬해» 가 첫마디 뒤에 칭찬을 또 붙이게 했다(함정 대조).
   세 모드 모두 같은 줄을 쓴다(정직한 칭찬 줄은 모드와 무관). */
ok('칭찬은 맨 앞 한 번 — «THIS TURN\'S OPENER» 줄이 있으면 첫마디 뒤에 칭찬을 또 붙이지 말라(세 모드 모두)',
  ['free_talk', 'balanced', 'focused'].every((m) => /THIS TURN'S OPENER/.test(H.warmupHonestRule(m)) && /첫마디 뒤에 칭찬을 또 붙이지 마/.test(H.warmupHonestRule(m))));
ok('집중교정: 따라 말하자고 함', /집중교정/.test(rule) && /say it with me/i.test(rule));
ok('자유대화: 따라 말하라고 시키지 말라', /따라 말하라고 시키지 마/.test(H.warmupHonestRule('free_talk')));
/* 💬 2026-11-04 — 기본 [교정] 규칙이 «모든 모드» 에 「고친 문장을 따옴표로 먼저 말해」를 시키므로, 자유대화만 그것을 덮는다. */
ok('자유대화: 「고친 문장을 따옴표로 먼저 말하기」를 하지 말라고 «우선» 해서 덮는다',
  /우선/.test(H.warmupHonestRule('free_talk').split('\n').pop()) && /따옴표로 먼저 말하기」는 이 모드에서 하지 마/.test(H.warmupHonestRule('free_talk')));
ok('자유대화: 교정은 fix 칸에만(카드로) — 답장에서 고친 문장을 따로 말하지 않음',
  /"fix" 칸에만/.test(H.warmupHonestRule('free_talk')) && /고친 문장을 따로 말하지 말고/.test(H.warmupHonestRule('free_talk')));
/* 짝 — 그 덮기가 균형·집중교정에 새면 «균형도 말을 안 한다» 가 된다.
   ⛔ «교정 카드만» 한 낱말만 찾지 않는다 — 덮기를 공통 줄로 옮기거나 그 낱말 없이 균형 줄에 넣어도 통과했다(함정 대조 실측). */
const OVERRIDE_RE = /따옴표로 먼저 말하기|카드만|"fix" 칸에만|고친 문장을 따로 말하지/;
ok('균형·집중교정 규칙 «어디에도» 덮기 문장이 없다',
  !OVERRIDE_RE.test(H.warmupHonestRule('balanced')) && !OVERRIDE_RE.test(H.warmupHonestRule('focused')));
ok('자유대화에서도 덮기는 «모드 줄» 에만 — 모든 모드가 받는 공통 줄에는 없다', (() => {
  const ls = H.warmupHonestRule('free_talk').split('\n');
  return ls.length > 1 && ls.slice(0, -1).every((l) => !OVERRIDE_RE.test(l)) && OVERRIDE_RE.test(ls[ls.length - 1]);
})());
ok('모르는 모드 → 균형', /교정 모드: 균형/.test(H.warmupHonestRule('weird')));

console.log('⑥-2 집중교정 음성 순서 — 교정 문장이 답장보다 먼저(ensureFocusedFixSpoken)');
{
  const FIX = { now: 'I went to the park yesterday', was: 'I go park yesterday' };
  const REPLY = 'Where did you play after that?';
  const out = H.ensureFocusedFixSpoken(REPLY, 'focused', 'partial', FIX);
  const corrected = '"I went to the park yesterday"';
  ok('교정 안내가 첫 발화다', out.startsWith('You can say... ' + corrected));
  ok('다음 질문은 교정 턴에 나오지 않는다', !out.includes(REPLY));
  const repeats = out.split(corrected).length - 1;
  ok('고친 문장은 추가 선행 발화 없이 총 3번', repeats === 3 && H.FOCUSED_FIX_REPEATS === 3, repeats);
  ok('You can say 안내는 처음에 한 번만', (out.match(/You can say/g) || []).length === 1);
  ok('세 번 뒤 따라 말하기로 끝난다', out.endsWith('Can you say it with me?'));
  ok('모델이 이미 교정을 말해도 총 3번', H.ensureFocusedFixSpoken('Good. I went to the park yesterday. Where?', 'focused', 'partial', FIX) === out);
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
ok('규칙은 honest 모드에서만 붙이고 명시한 교정 시점을 반영한다', /if \(honest\) sys \+= '\\n' \+ warmupHonestRule\(timing === 'after-lesson' \? 'free_talk' : timing === 'key-mistakes' \? 'balanced' : honest\.mode\);/.test(body));
ok('모델 등급을 커밋할 때 함께 확정(교정과 같은 답장)', /commitFix = \(\) => \{[^}]*rawGrade = stagedGrade/.test(body));
ok('등급 확인·칭찬 떼기가 히스토리 저장보다 «앞»', at('applyHonestPraise(aiText') > 0 && at('applyHonestPraise(aiText') < at('SESSION_STATE.put(hkey'));
ok('모델이 실패한 턴은 등급을 null 로(→ partial)', /finalizeWarmupGrade\(modelOk \? rawGrade : null/.test(body));
ok('교정 모드 게이트가 따라 말하기 판정 «뒤»', at('gateFixForMode(honest.mode') > at('offerRepeat = warmupShouldOfferRepeat('));
ok('응답에 grade 는 시범일 때만 싣는다', /\.\.\.\(honest \? \{ grade: honestGrade \|\| 'partial'/.test(body));
ok('스트림 미리읽기에 honest 를 넘긴다', /createWarmupLive\(sseSend, \{[^}]*honest: !!honest/.test(body));
ok('honest 는 스트림보다 먼저 정해진다', at('const honest = await') < at('createWarmupLive('));
const strm = fs.readFileSync(path.join(SRC, 'warmup-stream.ts'), 'utf8');
ok('스트림: 첫 문장이 칭찬 말머리면 미리 읽지 않음', /if \(o\.honest && !n\)/.test(strm) && /halt = 'praise'/.test(strm));

/* 💬 (2026-11-04) «자유대화는 카드만» 배선 — 그 한 줄을 오려 내 모드마다 «실제로» 돌린다.
   ⛔ «warmupSpeaksFixLead 라는 글자가 있는가» 로 묻지 않는다 — 옛 조건(honest?.mode !== 'focused')으로
      되돌려도 import 줄에 그 글자가 남아 통과한다. */
{
  const codeOnly = body.split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l));
  const leadLines = codeOnly.filter((l) => /correctionLeadIn\(/.test(l));
  ok('⑦-2 핸들러 안 correctionLeadIn 호출은 «한 곳» 뿐(옆길로 붙이는 곳 없음)', leadLines.length === 1, leadLines.map((l) => l.trim()));
  /* 🪤 함정 대조(2026-11-04)가 뚫은 두 옆길 — ① 핸들러 안에 같은 이름의 판정을 따로 만들기(아래 실행은 정본을 주입하므로
        그것만으로는 못 본다) ② correctionLeadIn 을 안 부르고 lead-in 문구·고친 문장을 글자로 직접 붙이기. */
  const code = codeOnly.join('\n');
  const importOk = /import\s*\{[^}]*\bwarmupSpeaksFixLead\b[^}]*\}\s*from\s*'\.\/warmup-honest'/.test(idx);
  const localDef = /\bfunction\s+warmupSpeaksFixLead\b|\b(?:const|let|var)\s+warmupSpeaksFixLead\b|\bwarmupSpeaksFixLead\s*=(?!=)/.test(idx);
  ok('⑦-2 그 줄의 판정은 정본에서 import 한 것(index.ts 안에 같은 이름을 따로 만들지 않음)', importOk && !localDef, { importOk, localDef });
  const bypass = /say it like this|我们可以这样说/i.test(code) || /\b(?:showFix|rawFix|verified)\s*(?:\.\s*now|\[\s*['"]now['"]\s*\])/.test(code);
  ok('⑦-2 고친 문장을 글자로 직접 붙이는 옆길이 없다(lead-in 문구·showFix/rawFix/verified 의 now 를 핸들러가 직접 쓰지 않음)', !bypass);
  /* 그 문장을 «여러 줄로 나눠 써도» 오려 낼 수 있게 — 줄 하나가 아니라 if 부터 문장 끝까지(중괄호 짝) */
  let stmt = '';
  {
    const callAt = code.indexOf('correctionLeadIn(');
    const ifAt = callAt >= 0 ? code.lastIndexOf('if (', callAt) : -1;
    const semi = callAt >= 0 ? code.indexOf(';', callAt) : -1;
    if (ifAt >= 0 && semi > callAt && !code.slice(ifAt, callAt).includes(';')) {
      stmt = code.slice(ifAt, semi + 1);
      const bal = (s) => (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
      let end = semi + 1;
      while (bal(stmt) > 0) { const nx = code.indexOf('}', end); if (nx < 0) break; stmt = code.slice(ifAt, nx + 1); end = nx + 1; }
    } else stmt = (leadLines[0] || '').trim();
  }
  let runLead = null;
  try {
    runLead = new Function('showFix', 'honest', 'aiText', 'ctxLang', 'warmupSpeaksFixLead', 'correctionLeadIn', 'timing',
      stmt + '\nreturn aiText;');
  } catch (e) { ok('⑦-2 그 줄을 실행할 수 있다(전제)', false, String(e)); }
  if (runLead && typeof H.warmupSpeaksFixLead === 'function') {
    const F = { was: 'I go park yesterday', now: 'I went to the park yesterday' };
    const R = 'What did you do there?';
    const lead = (t, f) => 'LEAD:' + f.now + ' ' + t;
    const go = (mode, fix = F, lang = 'en', timing = null) => {
      try { return runLead(fix, mode === null ? null : { mode }, R, lang, H.warmupSpeaksFixLead, lead, timing); }
      catch (e) { return 'THROW:' + String(e && e.message || e); }   // 다른 이름을 부르면 여기로 — 하니스가 죽지 않고 FAIL 로 남긴다
    };
    ok('⑦-2 자유대화 + 교정 카드 → 답장 그대로(고친 문장을 말로 안 붙임)', go('free_talk') === R, go('free_talk'));
    ok('⑦-2 균형 + 교정 카드 → 고친 문장을 앞에 붙임(짝)', go('balanced') === lead(R, F), go('balanced'));
    ok('⑦-2 집중교정 → 네 번째를 붙이지 않음', go('focused') === R, go('focused'));
    ok('⑦-2 모드 없음(중국어 등) → 예전처럼 붙임', go(null, F, 'zh') === lead(R, F), go(null, F, 'zh'));
    ok('⑦-2 교정 카드가 없으면 어느 모드도 안 붙임', ['free_talk', 'balanced', 'focused'].every((m) => go(m, null) === R));
    ok('명시한 종료 후·주요 실수 시점에는 교정 말머리를 붙이지 않는다', ['after-lesson','key-mistakes'].every(t=>go('balanced',F,'en',t)===R));
  }
}

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
  /* 💬 (2026-11-04) 자유대화 = 카드만 — 설명이 «바른 문장을 들려준다» 고 약속하면 화면이 거짓말을 한다(세 곳 같은 말). */
  {
    const ftCat = (cat.match(/\{ id:'free_talk'[^\n]*/) || [''])[0];
    const howto = fs.readFileSync(path.join(ROOT, 'cloudflare-deploy/public/js/warmup-howto.js'), 'utf8');
    const mgr = fs.readFileSync(path.join(ROOT, 'cloudflare-deploy/public/manager.html'), 'utf8');
    const ftMgr = (mgr.match(/\{ k: 'free_talk'[^\n]*/) || [''])[0];
    const ftHowKo = (howto.match(/<b>💬 자유대화<\/b>:[^']*/) || [''])[0];
    const ftHowEn = (howto.match(/<b>💬 Free talk<\/b>:[^']*/) || [''])[0];
    const oldPromise = /들려줘요|다시 말해 주고|models the right sentence|repeats the right sentence/;
    ok('⑨ 교재 연습 화면: 자유대화 설명이 «교정 카드로만»(KO/EN)', /교정 카드로만/.test(ftCat) && /only as a correction card/.test(ftCat) && !oldPromise.test(ftCat), ftCat);
    ok('⑨ 사용법 안내: 자유대화 설명이 «교정 카드로만»(KO/EN)', /교정 카드로만/.test(ftHowKo) && /only as a correction card/.test(ftHowEn) && !oldPromise.test(ftHowKo + ftHowEn), [ftHowKo, ftHowEn]);
    ok('⑨ 원장님 설정 화면: 자유대화 설명이 «교정 카드로만»(KO/EN)', /교정 카드로만/.test(ftMgr) && /only as a correction card/.test(ftMgr) && !oldPromise.test(ftMgr), ftMgr);
  }
  /* ⚖️ (2026-11-04) 균형 = 큰 실수는 매번·작은 실수는 연달아 안 고침 + 따라 말하기는 3턴에 한 번까지 → «위주로 · 가끔».
     입구(ai-speaking.html)의 균형 한 줄과 «같은 말» 이어야 한다 — 두 화면이 다른 약속을 하면 한쪽은 거짓이다.
     ⛔ 옛 «핵심 표현·되풀이되는 실수만» 은 서버가 쓰지 않는 기준이라 되살아나면 FAIL. */
  {
    const blCat = (cat.match(/\{ id:'balanced'[^\n]*/) || [''])[0];
    const blKo = (blCat.match(/[\s,{]d:'([^']*)'/) || ['', ''])[1];
    const blEn = (blCat.match(/[\s,{]de:'([^']*)'/) || ['', ''])[1];
    const howto = fs.readFileSync(path.join(ROOT, 'cloudflare-deploy/public/js/warmup-howto.js'), 'utf8');
    const blHowKo = (howto.match(/<b>⚖️ 균형<\/b>:([^<']*)/) || ['', ''])[1];
    const blHowEn = (howto.match(/<b>⚖️ Balanced<\/b>:([^<']*)/) || ['', ''])[1];
    const ap = fs.readFileSync(path.join(ROOT, 'cloudflare-deploy/public/ai-speaking.html'), 'utf8');
    const apBtn = (ap.match(/<button[^>]*data-corr="balanced"[^>]*>/) || [''])[0];
    const apKo = (apBtn.match(/data-hint-ko="([^"]*)"/) || ['', ''])[1];
    const apEn = (apBtn.match(/data-hint-en="([^"]*)"/) || ['', ''])[1];
    /* 원장님 설정 화면(manager.html) — 학원 단위로 고르는 자리라 같은 말이어야 한다(2026-11-04) */
    const mgrHtml = fs.readFileSync(path.join(ROOT, 'cloudflare-deploy/public/manager.html'), 'utf8');
    const blMgr = (mgrHtml.match(/\{ k: 'balanced'[^\n]*/) || [''])[0];
    const mgKo = (blMgr.match(/dko: '([^']*)'/) || ['', ''])[1];
    const mgEn = (blMgr.match(/den: '([^']*)'/) || ['', ''])[1];
    ok('⑨ 균형 전제: 카드·사용법·입구·원장님 화면 문구를 오려 냈다(KO/EN)', !!(blKo && blEn && blHowKo && blHowEn && apKo && apEn && mgKo && mgEn), [blKo, blEn, blHowKo, blHowEn, apKo, apEn, mgKo, mgEn]);
    /* 서버 값은 정본 소스에서 읽는다(⛔ 하니스에 베끼지 않는다) — 1이 되면 «가끔» 이 거짓이 된다 */
    const CORR = fs.readFileSync(path.join(SRC, 'warmup-correction.ts'), 'utf8');
    const fixGap = Number((CORR.match(/export const WARMUP_FIX_GAP_TURNS = (\d+);/) || [])[1]);
    const repGap = Number((CORR.match(/export const WARMUP_REPEAT_GAP_TURNS = (\d+);/) || [])[1]);
    ok('⑨ 균형 전제: 서버가 작은 실수·따라 말하기를 «매 턴» 하지 않는다(간격 ≥ 2)', fixGap >= 2 && repGap >= 2, [fixGap, repGap]);
    ok('⑨ 균형: 교재 연습 카드(KO)가 입구 문구와 같은 말로 시작', !!apKo && blKo.startsWith(apKo), [blKo, apKo]);
    ok('⑨ 균형: 사용법 안내(KO)도 입구 문구와 같은 말', !!apKo && blHowKo.trim().startsWith(apKo), [blHowKo, apKo]);
    ok('⑨ 균형: 원장님 설정 화면(KO)도 입구 문구와 같은 말', !!apKo && mgKo.startsWith(apKo), [mgKo, apKo]);
    ok('⑨ 균형: 원장님 설정 화면(EN)은 웜업 카드(EN)와 같은 말', !!mgEn && blEn.startsWith(mgEn.replace(/\.$/, '')), [mgEn, blEn]);
    const enAll = [blEn, blHowEn, apEn, mgEn];
    ok('⑨ 균형(EN 네 곳): «mostly» + «sometimes»', enAll.every((s) => /\bmostly\b/i.test(s) && /\bsometimes\b/i.test(s)), enAll);
    const koAll = [blKo, blHowKo, apKo, mgKo];
    ok('⑨ 균형(KO 네 곳): «위주» + «가끔»', koAll.every((s) => /위주/.test(s) && /가끔/.test(s)), koAll);
    const oldOnly = /되풀이되는 실수만|핵심 표현이나|key phrases|repeated mistakes|repeat only|only for/i;
    const tooOften = /매번|항상|마다|1\s*번|한\s*번|\bonce\b|\bevery\b|\beach\b|always/i;
    ok('⑨ 균형: 옛 «핵심 표현·되풀이 실수만» 이 없다', ![...koAll, ...enAll].some((s) => oldOnly.test(s)), [...koAll, ...enAll]);
    ok('⑨ 균형: «매번·한 번·every» 처럼 서버보다 센 약속이 없다', ![...koAll, ...enAll].some((s) => tooOften.test(s)), [...koAll, ...enAll]);
  }
  ok('⑨ 클릭 위임이 data-cmode 를 받는다', /\[data-cmode\]'\)/.test(html) && /if\(t\.getAttribute\('data-cmode'\)\) \{ setCorrMode\(/.test(html));
  ok('⑨ PC 3단계 카드(1번)로 옮기고 되돌린다', /\['wusPcB1',\['wusGLang','wusTalkSec','wusGMode'\]\]/.test(html) && /'wusGLevel','wusGMode'\]\.forEach/.test(html));
  ok('⑨ 중국어에서는 감춘다', /gmode\.hidden = isZh\(\)/.test(html) && /#wusGMode\[hidden\]\{display:none!important\}/.test(html));
  ok('⑨ 서버가 body.correction_mode 를 정본에 넘긴다', /resolveWarmupHonest\([^;]*chosen: body && body\.correction_mode \}\)/.test(idx));
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log('┌────────────────────────────────────────────────');
console.log('│ 🎯 warmup_honest_mode_harness — PASS ' + pass + ' / FAIL ' + fail);
console.log('└────────────────────────────────────────────────');
// 배선 (2026-10-31): 3번 반복(vfix)과 교정 카드가 «같은» 교정을 본다 — 과거형 규칙을 빼면 카드만 뜨고 반복이 안 된다
{
  const IDX = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8');
  const m = IDX.match(/const vfix = verifyWarmupFix\(([^;]+),\s*studentInput/);
  ok('3번 반복 교정(vfix)이 과거형 규칙까지 본다 — 카드와 같은 교정', !!m && /backfillPastTenseFix\(studentInput\)/.test(m[1]), m && m[1]);
}
process.exit(fail ? 1 : 0);
