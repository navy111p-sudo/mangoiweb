// 매일보고 «AI 정리·점검»(/api/approval/handover/review) — 서버 코드를 샌드박스에서 «통째로» 실행 (2026-10-09)
//
// 운영 D1·운영 AI 는 한 번도 안 부른다. 격리된 SQLite(:memory:) + 가짜 AI 로
//   진짜 daily-handover.ts · approval-policy.ts · handover-routing.ts · once-per-isolate.ts · d1-chunk.ts 를 그대로 돌린다.
// 보는 것: 응답에 approval_hints 가 실리는가 / AI 가 이상한 답(지어낸 줄·모르는 종류·깨진 JSON·느림·던짐)을 줘도
//   규칙 안내는 남고 요청이 안 죽는가 / 계정별(강사·필리핀 매니저) 분류 / 수백 번 연속 요청.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'cloudflare-deploy', 'src');
let pass = 0, fail = 0; const fails = [];
const ok = (name, cond) => { if (cond) pass++; else { fail++; if (fails.length < 40) fails.push(name); } };

// ── 모듈 준비: TS 를 벗겨 임시 폴더에 .mjs 로 쓰고 import 경로를 맞춘다 ──
const dir = mkdtempSync(join(tmpdir(), 'hsandbox-'));
const write = (name, js) => writeFileSync(join(dir, name + '.mjs'), js.replace(/from '\.\/([\w-]+)'/g, "from './$1.mjs'"));
const real = n => write(n, stripTypeScriptTypes(readFileSync(join(ROOT, n + '.ts'), 'utf8')));
const SRC_DH = process.env.DH_SRC || join(ROOT, 'daily-handover.ts');
write('daily-handover', stripTypeScriptTypes(readFileSync(SRC_DH, 'utf8')));
for (const n of ['approval-policy', 'handover-routing', 'once-per-isolate', 'd1-chunk']) real(n);
// auth-admin 은 무겁다 — PH_MANAGERS 만 «정본 소스에서 읽어» 내보낸다(⛔ 손으로 베끼지 않음)
const phSrc = readFileSync(join(ROOT, 'auth-admin.ts'), 'utf8').match(/export const PH_MANAGERS\s*=\s*(\[[^\]]*\])/);
if (!phSrc) { console.log('❌ FAIL auth-admin 의 PH_MANAGERS 를 못 읽음'); process.exit(1); }
const PH = JSON.parse(phSrc[1].replace(/'/g, '"'));
write('auth-admin', `export const PH_MANAGERS = ${JSON.stringify(PH)};`);
write('web-push', 'export async function broadcastWebPush(eps){return {sent:eps.length};}');
const { handleDailyHandover: handle } = await import(pathToFileURL(join(dir, 'daily-handover.mjs')).href);

// ── 격리 SQLite ──
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE admin_account(username TEXT PRIMARY KEY,name TEXT); CREATE TABLE admin_scope(username TEXT,scope_type TEXT);
CREATE TABLE push_subscriptions(endpoint TEXT,user_id TEXT,enabled INTEGER);
CREATE TABLE push_queue(endpoint TEXT,title TEXT,body TEXT,url TEXT,icon TEXT,badge TEXT,tag TEXT,queued_at INTEGER);
INSERT INTO admin_account VALUES('mgr_jjw','장지웅'),('${PH[0]}','PH'),('admin','Admin');
INSERT INTO admin_scope SELECT username,'hq' FROM admin_account;`);
let dbCalls = 0;
function stmt(sql) { let args = []; return { bind(...a) { args = a; return this; }, async first() { dbCalls++; return db.prepare(sql).get(...args) || null; }, async all() { dbCalls++; return { results: db.prepare(sql).all(...args) }; }, async run() { dbCalls++; const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; } }; }
const DB = { prepare: stmt, async batch(items) { return Promise.all(items.map(s => s.run())); } };

// ── 가짜 AI — 시나리오마다 답을 바꾼다 ──
let aiMode = 'none', aiCalls = 0, lastPrompt = '';
const AI = { async run(model, opts) {
  aiCalls++; lastPrompt = opts.messages[0].content;
  const input = JSON.parse(opts.messages[1].content);
  const lines = String(input.work || '').split(/\n/).filter(Boolean);
  const base = { work: input.work, issue: input.issue, open: input.open, tips: [] };
  switch (aiMode) {
    case 'echo-approval': return { response: JSON.stringify({ ...base, approval: lines.slice(0, 2).map(l => ({ line: l, type: 'purchase' })) }) };
    case 'fabricate': return { response: JSON.stringify({ ...base, approval: [{ line: '사장님께 새 노트북 사 달라고 함', type: 'purchase' }, { line: lines[0] || 'x', type: 'hr' }] }) };
    case 'fenced': return { response: '```json\n' + JSON.stringify({ ...base, approval: [] }) + '\n```' };
    case 'garbage': return { response: '죄송합니다, 정리할 수 없습니다.' };
    case 'approval-object': return { response: JSON.stringify({ ...base, approval: { line: lines[0], type: 'purchase' } }) };
    case 'approval-junk': return { response: JSON.stringify({ ...base, approval: [null, 1, 'x', { line: null }, { type: 'leave' }, { line: lines[0], type: 'LEAVE' }] }) };
    case 'throw': throw new Error('AI down');
    case 'empty': return {};
    case 'hang': return new Promise(() => {}); // 영영 안 끝나는 AI — 서버 12초 시한이 일해야 한다
    default: return { response: JSON.stringify(base) };
  }
} };
const env = { DB, AI };

const DAY = (() => { const k = new Date(Date.now() + 9 * 3600e3); return k.toISOString().slice(0, 10); })();
const actor = (u, extra = {}) => ({ ok: true, username: u, name: u, role: 'hq', ...extra });
async function review(payload, { use_ai = false, who = actor('mgr_jjw') } = {}) {
  const url = new URL('https://mangoi.ai/api/approval/handover/review');
  const req = new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report_date: DAY, payload, use_ai }) });
  const res = await handle(req, url, env, who);
  const j = await res.json();
  // 칸이 빠지면 «크래시» 가 아니라 «깔끔한 FAIL» 이 되게 — hasHints 로 따로 본다
  return { status: res.status, ...j, hasHints: Array.isArray(j.approval_hints), approval_hints: Array.isArray(j.approval_hints) ? j.approval_hints : [] };
}
const P = (work, more = {}) => ({ work, issue: '', open: '', no_issue: true, no_open: true, ...more });

// ① 기본 — AI 없이도 규칙 안내가 실린다
let r = await review(P('카카오 문의 3건 답변\n프린터 잉크 ₱1,200 사야 함\n다음 주 금요일 연차 쓰고 싶습니다'));
ok('200', r.status === 200 && r.ok === true);
ok('응답에 approval_hints 칸', r.hasHints);
ok('AI 없이 규칙 안내 2건', r.approval_hints.length === 2);
ok('구입 금액 1200 PHP', r.approval_hints.some(h => h.type === 'purchase' && h.amount === 1200 && h.currency === 'PHP'));
ok('휴가', r.approval_hints.some(h => h.type === 'leave'));
ok('AI 안 부름(use_ai=false)', aiCalls === 0);
ok('평범한 보고만 → 안내 0', (await review(P('카카오 문의 3건 답변\n내일 수업 일정 확인'))).approval_hints.length === 0);

// ② AI 가 붙은 경우 — 프롬프트에 규칙이 들어가고, 원문 줄은 받고, 지어낸 줄·모르는 종류는 버린다
aiMode = 'echo-approval';
r = await review(P('교재 복사\n카카오 답변'), { use_ai: true });
ok('AI 호출됨', aiCalls === 1 && r.ai_state === 'ready');
ok('프롬프트에 approval 규칙', /"approval"/.test(lastPrompt) && /purchase\|expense\|leave/.test(lastPrompt));
ok('AI 가 고른 원문 줄 수용(source=ai)', r.approval_hints.length === 2 && r.approval_hints.every(h => h.source === 'ai'));
aiMode = 'fabricate';
r = await review(P('프린터 잉크 ₱500 사야 함\n카카오 답변'), { use_ai: true });
ok('지어낸 줄 버림', !r.approval_hints.some(h => h.line.includes('노트북')));
ok('hr 버림', !r.approval_hints.some(h => h.type === 'hr'));
ok('규칙 안내는 남음', r.approval_hints.length === 1 && r.approval_hints[0].source === 'rule');

// ③ AI 가 망가져도 요청은 살고 규칙 안내는 남는다
for (const m of ['fenced', 'garbage', 'approval-object', 'approval-junk', 'throw', 'empty']) {
  aiMode = m;
  r = await review(P('헤드셋 PHP 850 구입 필요'), { use_ai: true });
  ok(`AI ${m}: 200`, r.status === 200 && r.ok === true);
  ok(`AI ${m}: 규칙 안내 유지`, r.approval_hints.length >= 1 && r.approval_hints[0].type === 'purchase');
  ok(`AI ${m}: 종류는 셋 중 하나`, r.approval_hints.every(h => ['purchase', 'expense', 'leave'].includes(h.type)));
}
// ③-2 AI 가 «영영 안 끝나면» — 서버의 시한(Promise.race)이 요청을 살리고 규칙 안내를 남긴다
//  12초를 실제로 기다리지 않게, 이 구간만 «10초 넘는 타이머» 를 50ms 로 줄인다(원래 setTimeout 은 되돌림).
//  시한이 없어지는 변이에서 하니스가 «멈추지» 않게, 바깥에 진짜 2초 안전망을 둔다 — 그때는 깔끔한 FAIL.
{
  const realST = globalThis.setTimeout;
  aiMode = 'hang';
  globalThis.setTimeout = (fn, ms, ...a) => realST(fn, ms >= 10000 ? 50 : ms, ...a);
  let hr = null, hung = false;
  try {
    hr = await Promise.race([
      review(P('헤드셋 PHP 850 구입 필요'), { use_ai: true }),
      new Promise(res => realST(() => { hung = true; res(null); }, 2000)),
    ]);
  } catch (e) { hr = null; }
  finally { globalThis.setTimeout = realST; }
  ok('AI hang: 요청이 멈추지 않고 끝남', !hung && !!hr);
  ok('AI hang: 200', !!hr && hr.status === 200 && hr.ok === true);
  ok('AI hang: ai_state=failed', !!hr && hr.ai_state === 'failed');
  ok('AI hang: 규칙 안내 유지', !!hr && hr.approval_hints.length >= 1 && hr.approval_hints[0].type === 'purchase');
}
aiMode = 'approval-junk';
r = await review(P('다음 주 금요일 연차 쓰고 싶습니다'), { use_ai: true });
ok('대문자 LEAVE 는 소문자로 읽되 규칙과 중복 안 됨', r.approval_hints.length === 1);

// ④ 계정별 — 필리핀 매니저·강사·본사
r = await review(P('프린터 잉크 ₱500 사야 함\n다음 주 금요일 연차'), { who: actor(PH[0]) });
ok('필리핀 매니저: 구입·휴가는 올릴 수 있으니 보임', r.approval_hints.length === 2);
r = await review(P('프린터 잉크 ₱500 사야 함\n다음 주 금요일 연차'), { who: actor('t1', { isTeacher: true }) });
ok('강사는 매일보고 API 자체가 403', r.status === 403);
r = await review(P('x'), { who: { ok: false } });
ok('미인증 403', r.status === 403);

// ⑤ 다른 오리진 POST 는 막힘(CSRF) · 미래 날짜 400
{
  const url = new URL('https://mangoi.ai/api/approval/handover/review');
  const res = await handle(new Request(url, { method: 'POST', headers: { Origin: 'https://evil.test' }, body: JSON.stringify({ report_date: DAY, payload: P('잉크 ₱500 사야 함') }) }), url, env, actor('mgr_jjw'));
  ok('다른 오리진 403', res.status === 403);
  const res2 = await handle(new Request(url, { method: 'POST', body: JSON.stringify({ report_date: '2099-01-01', payload: P('잉크 ₱500 사야 함') }) }), url, env, actor('mgr_jjw'));
  ok('미래 날짜 400', res2.status === 400);
}

// ⑥ /review 는 저장하지 않는다(제안만) — daily_handovers 에 행이 안 생긴다
const rows = db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='daily_handovers'").get().n
  ? db.prepare('SELECT COUNT(*) n FROM daily_handovers').get().n : 0;
ok('점검은 저장 안 함', rows === 0);
ok('결재 표에도 안 씀', !db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'approval%'").all().length);

// ⑦ 수백 번 연속 요청 — 시드 난수 보고서 300건
let seed = 1009; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; const pick = a => a[Math.floor(rnd() * a.length)];
const POS = [['잉크 ₱1,200 사야 함', 'purchase'], ['마우스 12,000원에 구입 예정', 'purchase'], ['Need to buy headset PHP 850', 'purchase'],
  ['택시비 사비로 ₱300 냄, 영수증 있음', 'expense'], ['Paid for ink out of pocket 450 pesos, please reimburse', 'expense'],
  ['다음 주 금요일 연차 쓰고 싶습니다', 'leave'], ['I need a day off on Oct 15', 'leave']];
const NEG = ['카카오 문의 3건 답변', '학생 결제 5만원 받음', '휴가 결재 올림', '학생 조퇴함', 'Teacher A 휴가 중이라 대신 수업함', '수업료 문의 5만원', '급여 명세서 발송 완료'];
let bulk = 0;
for (let k = 0; k < 300; k++) {
  const picked = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => rnd() < 0.5 ? { l: pick(POS)[0], t: true } : { l: pick(NEG), t: false });
  aiMode = pick(['none', 'echo-approval', 'fabricate', 'garbage', 'throw', 'approval-junk']);
  const use_ai = rnd() < 0.6;
  const res = await review(P(picked.map(x => x.l).join('\n')), { use_ai });
  bulk++;
  ok(`연속 #${k} 200`, res.status === 200 && res.hasHints);
  // AI 가 원문 줄을 골라 주면(echo) 규칙이 못 잡은 줄도 실린다 — «AI 결과를 버리는» 배선 끊김을 잡는 짝
  if (use_ai && aiMode === 'echo-approval') {
    const firstTwo = picked.slice(0, 2).map(x => x.l).filter(l => l !== '휴가 결재 올림'); // «이미 결재 올림» 은 AI 가 골라도 버리는 게 맞다
    ok(`연속 #${k} AI 가 고른 원문 줄이 실림`, firstTwo.every(l => res.approval_hints.some(h => h.line === l)) || res.approval_hints.length === 5);
  }
  ok(`연속 #${k} 지어낸 줄 없음`, !res.approval_hints.some(h => h.line.includes('노트북')));
  ok(`연속 #${k} 모든 안내 줄이 원문에 있음`, res.approval_hints.every(h => picked.some(x => x.l === h.line)));
  const want = new Set(picked.filter(x => x.t).map(x => x.l));
  const ruleGot = new Set(res.approval_hints.filter(h => h.source === 'rule').map(h => h.line));
  ok(`연속 #${k} 잡을 줄을 놓치지 않음`, [...want].every(l => ruleGot.has(l)));
  ok(`연속 #${k} 규칙이 안 잡을 줄은 AI 만 고를 수 있음`, res.approval_hints.filter(h => !want.has(h.line)).every(h => h.source === 'ai' && use_ai));
}

console.log(`샌드박스: 서버 요청 ${bulk + 30}여 회 · 가짜 AI 호출 ${aiCalls} · 격리 DB 호출 ${dbCalls} (운영 D1·운영 AI 0회)`);
if (fails.length) console.log('❌ FAIL 예:\n  ' + fails.join('\n  '));
console.log(`handover_review_sandbox_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
