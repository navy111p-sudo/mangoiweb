#!/usr/bin/env node
/**
 * 🤖 결재 자동화 9단계 (2026-09-25) — 자동 반려 «켤지 말지» 판단 패널 + 알림은 문자로만
 *
 * 무엇을 지키나
 *   ① autoRejectReadiness — 사람이 승인한 🔴 가 하나라도 있으면 not_yet · 표본 부족이면 too_few · 그 밖엔 ready.
 *   ② autoRejectModeInput — 스위치 «쓰기» 는 on/off/shadow 만(모르는 값은 null=거절, 조용히 바꾸지 않음).
 *   ③ nudgeSmsKind — 8시간·12시간(사이렌)에 한 번씩 문자, 건너뛰면 가장 높은 단계 하나. ARS 는 없다.
 *   ④ 서버 — 경영진만(짝: 경영진은 된다) · 모르는 값 400 · KV 를 못 쓰면 «바꿨다» 고 안 한다.
 *        주간 요약과 패널이 같은 연습 성적 함수를 쓴다.
 *   ⑤ 화면 — 경영진에게만 버튼 · 숫자·건 목록을 그린다 · 켜기는 확인을 받는다 · 실패는 실패라고.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', 'cloudflare-deploy', 'src');
const PUB = join(__dir, '..', 'cloudflare-deploy', 'public');
const P = await import(pathToFileURL(process.env.POLICY_SRC || join(SRC, 'approval-policy.ts')).href);
const API = readFileSync(process.env.API_SRC || join(SRC, 'api-approval.ts'), 'utf8');
const WORK = readFileSync(process.env.WORK_SRC || join(PUB, 'work.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, why) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (why ? ' — ' + why : '')); }
}
function bodyAt(src, i) {
  const s = src.indexOf('{', i); if (s < 0 || i < 0) return '';
  let d = 0;
  for (let k = s; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(s, k + 1); }
  }
  return '';
}
const stripTs = t => t.replace(/\s+as any\b/g, '').replace(/:\s*(any|string)\b/g, '');

console.log('\n① autoRejectReadiness');
try {
  const R = P.autoRejectReadiness;
  ok('승인한 🔴 가 1건이라도 있으면 not_yet (표본이 많아도)', R({ red: 30, agreed: 29, disagreed: 1 }, 14) === 'not_yet');
  ok('🔴 5건 · 14일 · 전부 반려 → ready', R({ red: 5, agreed: 5, disagreed: 0 }, 14) === 'ready');
  ok('(짝) 🔴 4건이면 too_few', R({ red: 4, agreed: 4, disagreed: 0 }, 14) === 'too_few');
  ok('(짝) 13일이면 too_few', R({ red: 9, agreed: 9, disagreed: 0 }, 13) === 'too_few');
  ok('0건이면 too_few (0 을 «문제없음» 으로 읽지 않는다)', R({ red: 0, agreed: 0, disagreed: 0 }, 14) === 'too_few');
  ok('일수를 모르면(NaN) too_few', R({ red: 9, agreed: 9, disagreed: 0 }, NaN) === 'too_few');
} catch (e) { ok('autoRejectReadiness 를 돌렸다', false, e.message); }

console.log('\n② autoRejectModeInput');
try {
  const M = P.autoRejectModeInput;
  ok('on / off / shadow 는 그대로(대소문자·공백 무시)', M(' ON ') === 'on' && M('off') === 'off' && M('Shadow') === 'shadow');
  ok('모르는 값은 null (조용히 shadow 로 안 바꾼다)', M('yes') === null && M('') === null && M(null) === null && M(1) === null);
  ok('(짝) 읽기용 autoRejectMode 는 여전히 모르면 shadow', P.autoRejectMode('yes') === 'shadow');
} catch (e) { ok('autoRejectModeInput 을 돌렸다', false, e.message); }

console.log('\n③ nudgeSmsKind — 문자로만 (ARS 없음)');
try {
  const K = P.nudgeSmsKind;
  ok('1→2 (8시간) late', K(2, 1) === 'late');
  ok('2→3 (12시간 사이렌) siren', K(3, 2) === 'siren');
  ok('0→3 한꺼번에 → 문자 하나(siren)', K(3, 0) === 'siren');
  ok('(짝) 0→1 푸시 단계엔 문자 없음', K(1, 0) === null);
  ok('(짝) 같은 단계 반복엔 문자 없음', K(2, 2) === null && K(3, 3) === null);
  const sw = API.slice(API.indexOf('export async function runApprovalSlaSweep'));
  // ⚠️ 반환 타입 Promise<{…}> 의 중괄호를 건너뛰고 «몸통» 을 자른다
  const sweep = bodyAt(sw, sw.indexOf('}> {') + 2);
  ok('전제: 알림 회차 몸통을 잘라 냈다', /let warned = 0/.test(sweep));
  ok('알림 회차가 nudgeSmsKind 로 문자를 정한다', /const smsKind = nudgeSmsKind\(target, cur\)/.test(sweep) && /if \(smsKind\)/.test(sweep));
  ok('옛 «8시간만» 조건이 남지 않았다', !/target >= 2 && cur < 2/.test(sweep));
  ok('ARS·음성 발송 코드가 없다', !/sendVoice|voice_call|VOICE_MESSAGE|\bARS\b/.test(API.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
} catch (e) { ok('nudgeSmsKind 를 돌렸다', false, e.message); }

console.log('\n④ 서버 라우트');
const i1 = API.indexOf("path === '/api/approval/autoreject/mode'");
const modeBody = i1 < 0 ? '' : bodyAt(API, i1);
const i2 = API.indexOf("path === '/api/approval/autoreject/report'");
const repBody = i2 < 0 ? '' : bodyAt(API, i2);
ok('전제: 두 라우트를 잘라 냈다', modeBody.length > 200 && repBody.length > 200);
async function runMode(opts) {
  const kvStore = {};
  const kv = opts.noKv ? null : {
    put: async (k, v) => { if (opts.putFails && k === 'approval_autoreject') throw new Error('x'); kvStore[k] = v; },
    get: async k => kvStore[k] ?? null,
  };
  const env = { SESSION_STATE: kv };
  const json = (d, st = 200) => ({ d, st });
  const safe = async (fn, fb) => { try { return await fn(); } catch { return fb; } };
  const readAutoRejectMode = async () => P.autoRejectMode(kvStore.approval_autoreject);
  const request = { json: async () => opts.body };
  const fn = new Function('iAmExec', 'request', 'env', 'json', 'safe', 'autoRejectModeInput', 'readAutoRejectMode', 'actor',
    'return (async () => ' + stripTs(modeBody) + ')();');
  const r = await fn(opts.exec, request, env, json, safe, P.autoRejectModeInput, readAutoRejectMode, { username: 'admin' });
  return { r, kvStore };
}
try {
  let t = await runMode({ exec: false, body: { mode: 'on' } });
  ok('경영진이 아니면 403, 스위치 안 바뀜', t.r.st === 403 && t.kvStore.approval_autoreject === undefined);
  t = await runMode({ exec: true, body: { mode: 'on' } });
  ok('(짝) 경영진은 켤 수 있고 누가 바꿨는지 남는다', t.r.st === 200 && t.r.d.ok === true && t.kvStore.approval_autoreject === 'on'
     && JSON.parse(t.kvStore.approval_autoreject_by).by === 'admin');
  t = await runMode({ exec: true, body: { mode: 'yes' } });
  ok('모르는 값은 400, 스위치 안 바뀜', t.r.st === 400 && t.kvStore.approval_autoreject === undefined);
  t = await runMode({ exec: true, body: { mode: 'on' }, putFails: true });
  ok('KV 를 못 쓰면 ok:true 라고 안 한다', t.r.d.ok === false && t.r.st === 503);
  t = await runMode({ exec: true, body: { mode: 'off' }, noKv: true });
  ok('KV 가 없으면 503', t.r.st === 503 && t.r.d.ok === false);
} catch (e) { ok('mode 라우트를 돌렸다', false, e.message); }
try {
  const json = (d, st = 200) => ({ d, st });
  const safe = async (fn, fb) => { try { return await fn(); } catch { return fb; } };
  const rows = [
    { row: { id: 1, title: 'A', requester_name: 'Mai', amount: 500, currency: 'PHP' }, status: 'approved', signal: 'red', reasons: [{ ko: 'k', en: 'e' }] },
    { row: { id: 2, title: 'B' }, status: 'rejected', signal: 'red', reasons: [] },
    { row: { id: 3, title: 'C' }, status: 'approved', signal: 'green', reasons: [] },
  ];
  const env = { SESSION_STATE: { get: async () => null }, DB: { prepare: () => ({ first: async () => ({ t: Date.now() - 30 * 86400_000 }) }) } };
  const fn = new Function('iAmExec', 'env', 'json', 'safe', 'readAutoRejectMode', 'loadShadowRows', 'shadowTally', 'autoRejectReadiness', 'actor',
    'return (async () => ' + stripTs(repBody) + ')();');
  const go = ex => fn(ex, env, json, safe, async () => 'shadow', async () => rows, P.shadowTally, P.autoRejectReadiness, { username: 'admin' });
  let r = await go(false);
  ok('보고서도 경영진만(403)', r.st === 403);
  r = await go(true);
  ok('(짝) 경영진은 숫자를 받는다', r.d.ok === true && r.d.tally.red === 2 && r.d.tally.disagreed === 1 && r.d.days === 14);
  ok('사람이 승인한 🔴 건이 이유와 함께 실린다', r.d.disagreed.length === 1 && r.d.disagreed[0].id === 1 && r.d.disagreed[0].reasons[0].ko === 'k');
  ok('판정은 서버가 not_yet', r.d.readiness === 'not_yet');
} catch (e) { ok('report 라우트를 돌렸다', false, e.message); }
{
  const ws = API.indexOf('AI 자동 반려(연습) 14일');
  const around = API.slice(Math.max(0, ws - 900), ws);
  ok('주간 요약도 같은 연습 성적 함수(loadShadowRows)를 쓴다', /shadowTally\(await loadShadowRows\(env, now\)\)/.test(around));
}

console.log('\n⑤ 화면');
{
  const a = WORK.indexOf('var AR = null;');
  const b = WORK.indexOf('/* ── 반려 사유');
  const block = (a >= 0 && b > a) ? WORK.slice(a, b) : '';
  ok('전제: 화면 블록을 잘라 냈다', block.length > 500);
  const mk = (me, fetchRes, confirmRet) => {
    const els = { arBtn: { hidden: true }, arBox: { innerHTML: '' } };
    const calls = []; const toasts = [];
    const win = { confirm: () => confirmRet };
    const fetch = (u, o) => { calls.push({ u, o }); return Promise.resolve({ json: () => Promise.resolve(fetchRes(u)) }); };
    const doc = { getElementById: id => els[id] || null };
    const esc = s => String(s);
    const T = (en, ko) => ko;
    const f = new Function('D', 'document', 'window', 'fetch', 'toast', 'T', 'esc',
      block + '\nreturn { paintArBtn, paintAr, get AR(){ return AR; }, set AR(v){ AR = v; } };');
    const api = f({ me }, doc, win, fetch, m => toasts.push(m), T, esc);
    return { api, els, calls, toasts, win };
  };
  const rep = { ok: true, mode: 'shadow', days: 14, readiness: 'not_yet', tally: { red: 2, agreed: 1, disagreed: 1 },
    disagreed: [{ id: 7, title: 'Printer ink', who: 'Mai', amount: 900, currency: 'PHP', reasons: [{ ko: '영수증 없음', en: 'no receipt' }] }],
    agreed: [], changed: { by: 'mgr_jjw', at: 1 } };
  try {
    let t = mk({ is_exec: false });
    t.api.paintArBtn();
    ok('경영진이 아니면 버튼 숨김', t.els.arBtn.hidden === true);
    t = mk({ is_exec: true });
    t.api.paintArBtn();
    ok('(짝) 경영진이면 버튼 보임', t.els.arBtn.hidden === false);
    t.api.AR = rep; t.api.paintAr();
    const h = t.els.arBox.innerHTML;
    ok('숫자·판정·승인한 건·이유·바꾼 사람을 그린다', /AI 🔴 2건/.test(h) && /승인하신 건 1건/.test(h) && /아직 이릅니다/.test(h)
       && /Printer ink/.test(h) && /영수증 없음/.test(h) && /mgr_jjw/.test(h));
    ok('지금 모드 버튼은 안 그리고 나머지 둘을 그린다', !/setArMode\('shadow'\)/.test(h) && /setArMode\('on'\)/.test(h) && /setArMode\('off'\)/.test(h));
  } catch (e) { ok('패널을 그렸다', false, e.message); }
  try {
    let t = mk({ is_exec: true }, () => ({ ok: true, mode: 'on', requested: 'on' }), false);
    t.win.setArMode('on');
    ok('켜기는 확인에서 «아니오» 면 요청을 안 보낸다', t.calls.length === 0);
    t = mk({ is_exec: true }, u => /mode/.test(u) ? { ok: true, mode: 'on', requested: 'on' } : rep, true);
    t.win.setArMode('on');
    await new Promise(r => setTimeout(r, 20));
    ok('(짝) «예» 면 보내고 보고서를 다시 읽는다', t.calls.length === 2 && JSON.parse(t.calls[0].o.body).mode === 'on' && /report/.test(t.calls[1].u));
    t = mk({ is_exec: true }, () => ({ ok: false, error: 'kv_write_failed' }), true);
    t.win.setArMode('off');
    await new Promise(r => setTimeout(r, 20));
    ok('실패하면 «바꾸지 못했습니다» 라고 말하고 다시 읽지 않는다', t.calls.length === 1 && /바꾸지 못했습니다/.test(t.toasts.join()));
    t = mk({ is_exec: true }, () => ({ ok: false }), true);
    t.win.openAr();
    await new Promise(r => setTimeout(r, 20));
    ok('보고서를 못 받으면 패널을 안 그리고 말한다', t.api.AR === null && /불러오지 못했습니다/.test(t.toasts.join()));
  } catch (e) { ok('버튼을 눌러 봤다', false, e.message); }
  ok('repaint 가 버튼을 챙긴다', /paintArBtn\(\);/.test(bodyAt(WORK, WORK.indexOf('function repaint(){'))));
  ok('화면이 쓰는 자리(arBtn·arBox)가 있다', /id="arBtn"/.test(WORK) && /id="arBox"/.test(WORK));
}

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
