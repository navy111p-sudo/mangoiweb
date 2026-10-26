// ✏️📌 선생님 글감 + «글감 고르는 곳 하나» 감시 하니스 (2026-10-19 사장님 지시)
//
//   지시 셋 —
//     ① 「글감이 두세 군데 있는 것보다 한 군데에서 "오늘의 글감" 을 고르게」
//        → 그림 장면 · 선생님 글감 · 내 경험 이야기 · 오늘의 글감을 «🎬 장면·글감 선택» 목록 하나로.
//     ② 「움직이는 그림 밑에 브레인스토밍의 6하원칙」 → 브레인스토밍(#goCard)은 «도움» 접기 밖, 그림 바로 아래.
//     ③ 「관리자(원장)가 글감 제목을 쓰면 바로 아래 브레인스토밍이 나와서 그거로 글감으로」
//        → 원장·선생님 둘 다 · 학원 전체 · AI 그림. 서버 정본 src/write-topics.ts.
//
//   이 하니스가 «실제로 돌리는» 것 —
//     [S] 서버 정본을 타입 제거로 불러 «진짜 SQLite» 위에서 라우트를 끝까지 돌린다
//         (권한 fail-closed · 지사·대리점 거절 · 선생님은 자기 것만 · 하루 상한 · 공개 목록에 직원 칸이 안 샌다 ·
//          그림 판 번호 · LLM 이 엉터리여도 기본 6하원칙으로 떨어진다).
//     [C] 화면의 목록·글감 코드를 HTML 에서 오려 내 가짜 DOM 으로 돌린다
//         (값 «종류:번호» 해석 · 이상한 값은 아무 일도 안 함 · 선생님 글감 질문이 뼈대가 됨 · 언어별 묶음 이름).
//   ⚠️ 「막힌다」 옆에 「된다」를 반드시 짝으로 둔다 — 짝이 없으면 «전부 막기» 도 통과한다.
//   ⚠️ 「눌러서 진짜 그렇게 보이는가」는 브라우저로: PW_DIR=/tmp/pw node test-harness/manual/ai-write-topic-picker-browser.mjs
//
//   변이시험용: WT_SRC=<고친 write-topics.ts 사본> · AW_HTML=<고친 ai-write.html 사본>
//   실행: node test-harness/write_topics_harness.mjs
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
const rd = p => readFileSync(p, 'utf8');
let PASS = 0, FAIL = 0;
const ok = (c, m, x = '') => { if (c) { PASS++; console.log('  ✅ ' + m); } else { FAIL++; console.log('  ❌ ' + m + (x ? '  → ' + x : '')); } };
const done = () => { console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`); process.exit(FAIL ? 1 : 0); };
// 중괄호 짝으로 «선언부터 몸통 끝까지» 자른다(문자열·주석 안 중괄호는 이 파일들에 없다 — 아래 전제 검사가 컴파일로 확인)
const blockFrom = (src, head) => {
  const at = src.indexOf(head); if (at < 0) return '';
  const i = src.indexOf('{', at + head.length - 1); let d = 0;
  for (let k = i; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(at, k + 1); }
  return '';
};
const toData = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

/* ═══════════════ [S] 서버 정본 ═══════════════ */
console.log('[S] 서버 정본(src/write-topics.ts)을 진짜 SQLite 위에서 돌린다');
const ACTORS = {
  admin:      { ok: true, username: 'admin', name: '대표', role: 'hq', isTeacher: false },
  hq_t_kim:   { ok: true, username: 'hq_t_kim', name: '김선생', role: 'teacher', isTeacher: true },
  hq_t_lee:   { ok: true, username: 'hq_t_lee', name: '이선생', role: 'teacher', isTeacher: true },
  branch_bs:  { ok: true, username: 'branch_bs', name: '부산지사', role: 'branch', isTeacher: false },
  noscope:    { ok: true, username: 'noscope', name: '미등록', role: 'staff', isTeacher: false },
};
globalThis.__WT = {
  json: (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }),
  getAdminActor: async (req) => {
    const m = (req.headers.get('Cookie') || '').match(/mangoi_admin_session=([\w-]+)/);
    return (m && ACTORS[m[1]]) || { ok: false, username: '', name: '', role: 'none', isTeacher: false };
  },
};
const importsTo = (code, ns) => code.replace(/^import\s*\{([^}]*)\}\s*from\s*'[^']+';?/gm, (m, names) =>
  names.split(',').map(n => n.trim()).filter(n => n && !/^type\s/.test(n)).map(n => `const ${n} = globalThis.${ns}.${n};`).join('\n'));
let M = null;
try {
  const EN = await import(toData(stripTypeScriptTypes(rd(resolve(SRC, 'english-only.ts')))));
  globalThis.__WT.isEnglishText = EN.isEnglishText;
  const aa = rd(resolve(SRC, 'auth-admin.ts'));
  const isOrg = await import(toData('export ' + stripTypeScriptTypes(blockFrom(aa, 'function isOrgScopedRole('))));
  globalThis.__WT.isOrgScopedRole = isOrg.isOrgScopedRole;
  const OG = await import(toData(importsTo(stripTypeScriptTypes(rd(resolve(SRC, 'org-scope-guard.ts'))), '__WT')));
  globalThis.__WT.orgScopeVerdict = OG.orgScopeVerdict; globalThis.__WT.readScopeType = OG.readScopeType;
  const wtPath = process.env.WT_SRC || resolve(SRC, 'write-topics.ts');
  M = await import(toData(importsTo(stripTypeScriptTypes(rd(wtPath)), '__WT')));
} catch (e) { console.log('  (정본 로드 실패) ' + e.message); }
ok(!!(M && M.handleWriteTopicsApi && M.writeTopicCostGate), '전제: 정본을 불러왔다');
if (!M) done();

console.log('\n① 순수 판정');
ok(M.writeTopicEditVerdict(true, 'hq') === 'ok', '본사·선생님(스코프 hq/none) → 만들 수 있다');
ok(M.writeTopicEditVerdict(true, 'org') === 'own', '지사·대리점·가맹 원장도 만들 수 있다 — 고치기는 자기 것만(2026-10-26)');
ok(M.writeTopicEditVerdict(true, 'unknown') === 'unknown', '(짝) 권한을 못 읽으면 막는다(fail-closed)');
ok(M.writeTopicEditVerdict(false, 'hq') === 'auth', '(짝) 로그인이 없으면 막는다');
const CAP = M.WT_USER_DAILY_CAP;
ok(M.writeTopicCostGate(CAP - 1, 0).ok === true && M.writeTopicCostGate(CAP - 1, 0).left === 1, `하루 ${CAP - 1}번 쓴 사람은 한 번 더 된다(남은 1)`);
ok(M.writeTopicCostGate(CAP, 0).ok === false && M.writeTopicCostGate(CAP, 0).reason === 'user_cap', `(짝) ${CAP}번이면 막힌다`);
ok(M.writeTopicCostGate(0, M.WT_TOTAL_DAILY_CAP).reason === 'total_cap', '전체 상한도 막는다');
ok(M.writeTopicCostGate(null, null).ok === true && M.writeTopicCostGate(NaN, -1).ok === true, '못 세면(null·NaN·음수) 막지 않는다 — 부르는 사람은 이미 로그인 직원');
ok(M.canEditTopic(ACTORS.hq_t_kim, { created_by: 'hq_t_kim' }) === true, '선생님은 자기 글감을 고친다');
ok(M.canEditTopic(ACTORS.hq_t_kim, { created_by: 'hq_t_lee' }) === false, '(짝) 남의 글감은 못 고친다');
ok(M.canEditTopic(ACTORS.hq_t_kim, { created_by: 'HQ_T_KIM' }) === false, '(짝) 대소문자만 다른 아이디는 남이다(완전일치)');
ok(M.canEditTopic(ACTORS.admin, { created_by: 'hq_t_lee' }) === true, '본사는 전부 고친다');
ok(M.canEditTopic({ username: 'gn_capi', isTeacher: false, ownOnly: true }, { created_by: 'gn_capi' }) === true, '대리점 원장은 자기 글감을 고친다');
ok(M.canEditTopic({ username: 'gn_capi', isTeacher: false, ownOnly: true }, { created_by: 'hq_t_lee' }) === false, '(짝) 대리점 원장은 남의 글감을 못 고친다');
ok(M.canEditTopic(ACTORS.admin, null) === false, '없는 글감은 아무도 못 고친다');
ok(JSON.stringify(M.normalizeWords(['tent', '텐트', 'tent', 'Fire', 'big red star', 'stars', 'moon'])) === '["tent","Fire","stars"]',
  '미션 단어: 한글·중복·3낱말 이상은 버리고 3개까지', JSON.stringify(M.normalizeWords(['tent', '텐트', 'tent', 'Fire', 'big red star', 'stars', 'moon'])));
ok(M.normalizeStarter('I want a', 'X ') === 'X ' && M.normalizeStarter('나는', 'X ') === 'X ', '시작 문장: 관사로 끝나거나 한글이면 기본값');
ok(M.normalizeStarter('I was at', 'X ') === 'I was at ', '(짝) 멀쩡한 시작 문장은 공백을 붙여 그대로');
ok(M.normalizeOpen('Last summer, I went camping.') === 'Last summer, I went camping.' && M.normalizeOpen('지난 여름') === '' && M.normalizeOpen('no capital.') === '', '첫 문장: 영어 완결문만');
ok(M.normalizeIcon('⛺') === '⛺', '아이콘: 이모지 하나는 그대로');
ok(M.normalizeIcon('👨‍👩‍👧') === '📝' && M.normalizeIcon('\u{1FAF6}') === '📝' && M.normalizeIcon('A') === '📝', '(짝) ZWJ 조합·Unicode 13+·글자는 기본 아이콘(Win10 두부 방지)');
const d0 = M.normalizeDraft(null, '나의 첫 캠핑');
ok(d0.questions.length === 6 && d0.questions.map(q => q.k).join(',') === 'when,where,who,what,why,how' && d0.title_ko === '나의 첫 캠핑',
  'LLM 이 실패해도(null) 기본 6하원칙 6칸 + 선생님 제목');
const d1 = M.normalizeDraft({ title_ko: '엉뚱한 제목', questions: [{ k: 'how', ko: '기분은?', en: 'How did you feel?', starter: 'I felt', example: 'happy' },
  { k: 'where', ko: '어디?', en: 'Where?', starter: 'I was at the', example: '공원' }, { k: 'when', ko: '언제?', en: 'When?' }, { k: 'zzz', ko: 'x', en: 'x' }] }, '우리 반 소풍');
ok(d1.title_ko === '우리 반 소풍', '제목은 선생님이 적은 것이 이긴다');
ok(d1.questions.map(q => q.k).join(',') === 'when,where,what,how', '칸은 6하원칙 순서 · what 은 반드시 · 모르는 칸은 버림', d1.questions.map(q => q.k).join(','));
const qWhere = d1.questions.find(q => q.k === 'where');
ok(qWhere.starter === 'I was at ' && /^예\) the park$/.test(qWhere.ph), '관사로 끝난 시작 문장·한글 예시는 기본값으로', JSON.stringify(qWhere));
ok(d1.questions.every(q => q.ko.startsWith(q.ko.slice(0, 2)) && /—/.test(q.ko) && /—/.test(q.en)), '질문은 «아이콘 Key — 질문» 모양으로 맞춘다');
ok(M.parseModelJson({ response: { title_en: 'A', questions: [] } }).title_en === 'A', 'JSON 모드 «이미 객체» 응답을 읽는다([object Object] 함정)');
ok(M.parseModelJson('```json\n{"title_en":"B","questions":[]}\n```').title_en === 'B' && M.parseModelJson('[object Object]') === null, '(짝) 문자열·코드펜스도 읽고 [object Object] 는 «모름»');
ok(M.detectImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])) === 'image/png' && M.detectImageMime(new Uint8Array(12)) === '', '그림 종류는 바이트로 판정 · 모르면 저장 안 함');
// 화면 GO_BASE 와 «같은 말» 인가 — 한쪽만 고치면 선생님 글감 질문과 기본 질문이 갈린다
const HTMLP = process.env.AW_HTML || resolve(ROOT, 'cloudflare-deploy/public/ai-write.html');
const HTML = rd(HTMLP);
let GO_BASE = null;
try { GO_BASE = new Function('return ' + HTML.match(/const GO_BASE = (\[[\s\S]*?\n    \]);/)[1])(); } catch (e) { GO_BASE = null; }
ok(Array.isArray(GO_BASE) && GO_BASE.length === 6, '전제: 화면 GO_BASE 를 오려 내 평가했다');
ok(GO_BASE && M.WT_SLOTS.every((s, i) => GO_BASE[i] && GO_BASE[i].k === s.k && GO_BASE[i].p === s.p && GO_BASE[i].ko === s.ko && GO_BASE[i].en === s.en && GO_BASE[i].starter === s.starter),
  '서버 기본 6칸(WT_SLOTS)이 화면 GO_BASE 와 같은 말이다(순서·문단·질문·시작 문장)');

console.log('\n② 진짜 SQLite 로 라우트');
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE admin_scope (username TEXT, scope_type TEXT)`);
db.prepare(`INSERT INTO admin_scope VALUES ('admin','hq'),('hq_t_kim','none'),('hq_t_lee','none'),('branch_bs','branch')`).run();
const D1 = {
  exec: async q => { db.exec(q); return {}; },
  prepare(q) {
    const mk = args => {
      const st = db.prepare(q);
      return {
        bind: (...a) => mk(a),
        first: async () => st.get(...args) ?? null,
        all: async () => ({ results: st.all(...args) }),
        run: async () => { const r = st.run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; },
      };
    };
    return mk([]);
  },
};
const R2 = new Map();
const RECORDINGS = { put: async (k, v, o) => { R2.set(k, { body: v, o }); }, get: async k => R2.get(k) || null, delete: async k => { R2.delete(k); } };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]).toString('base64');
let AI_MODE = 'ok', aiCalls = [];
const AI = { run: async (model, input) => {
  aiCalls.push(model);
  if (/flux/.test(model)) {
    if (AI_MODE === 'img-fail') throw new Error('boom');
    if (AI_MODE === 'img-fallback' && /klein/.test(model)) throw new Error('klein down');
    return { image: PNG };
  }
  if (AI_MODE === 'text-fail') throw new Error('llm down');
  return { response: { title_en: 'Our school trip', title_ko: '소풍', icon: '🚌', open: 'Last week, we went on a school trip.',
    questions: [{ k: 'when', ko: '언제 갔나요?', en: 'When did you go?', starter: 'It happened', example: 'last week' },
      { k: 'what', ko: '무엇을 했나요?', en: 'What did you do?', starter: 'First,', example: 'we saw dinosaurs' },
      { k: 'how', ko: '기분은?', en: 'How did you feel?', starter: 'I felt', example: 'excited' }],
    words: ['bus', 'museum', '점심'], image_prompt: 'children on a school bus going to a museum' } };
} };
const ENV = { DB: D1, AI, RECORDINGS };
const call = async (method, path, who, body) => {
  const headers = { 'content-type': 'application/json' };
  if (who) headers.Cookie = 'mangoi_admin_session=' + who;
  const req = new Request('https://mangoi.ai' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const res = await M.handleWriteTopicsApi(req, new URL(req.url), ENV);
  let j = null; const ct = res.headers.get('content-type') || '';
  if (/json/.test(ct)) { try { j = await res.json(); } catch { j = null; } }
  return { st: res.status, j, res };
};
ok(await M.handleWriteTopicsApi(new Request('https://mangoi.ai/api/class/other'), new URL('https://mangoi.ai/api/class/other'), ENV) === null, '다른 경로는 건드리지 않는다(null — api-mango 의 다음 라우트로)');
let r = await call('GET', '/api/class/write-topics');
ok(r.st === 200 && r.j.ok === true && Array.isArray(r.j.items) && r.j.can_create === false, '학생(쿠키 없음) GET → 목록 · 만들기 안 됨');
ok(/no-store/.test(r.res.headers.get('Cache-Control') || ''), '목록은 캐시하지 않는다(방금 올린 글감이 바로 보여야)');
r = await call('POST', '/api/class/write-topics', null, { action: 'draft', title: '소풍' });
ok(r.st === 401 && r.j.error === 'auth_required' && /\/ /.test(r.j.message), '로그인 없이 만들기 → 401 (한/영 문구)');
r = await call('POST', '/api/class/write-topics', 'noscope', { action: 'draft', title: '소풍' });
ok(r.st === 403 && r.j.error === 'scope_unknown', '권한 행이 없는 계정 → 403(모르면 막는다)');
r = await call('POST', '/api/class/write-topics', 'hq_t_kim', { action: 'zzz' });
ok(r.st === 400 && r.j.error === 'unknown_action', '모르는 action → 400(비용이 나가는 자리라 조용히 흘리지 않는다)');
r = await call('POST', '/api/class/write-topics', 'hq_t_kim', { action: 'draft', title: '소' });
ok(r.st === 400 && r.j.error === 'title_required', '제목 1글자 → 400');
const before = db.prepare('SELECT COUNT(*) n FROM write_topic_gen_log').get().n;
r = await call('POST', '/api/class/write-topics', 'hq_t_kim', { action: 'draft', title: '우리 반 소풍' });
ok(r.st === 200 && r.j.ok && r.j.ai_used === true && r.j.item.status === 'draft' && r.j.item.created_by === 'hq_t_kim', '선생님 → 초안(draft) · 만든 사람 = 그 선생님');
const T1 = r.j.item;
ok(T1.title_ko === '우리 반 소풍' && T1.title_en === 'Our school trip' && T1.questions.map(q => q.k).join(',') === 'when,what,how', '제목은 선생님 것 · 질문은 LLM 이 고른 칸(6하원칙 순서)', T1.questions.map(q => q.k).join(','));
ok(JSON.stringify(T1.words) === '["bus","museum"]', '한글 미션 단어는 버렸다');
ok(db.prepare('SELECT COUNT(*) n FROM write_topic_gen_log').get().n === before + 1, 'AI 호출은 사용 기록에 한 줄 남는다');
r = await call('GET', '/api/class/write-topics');
ok(r.j.items.length === 0, '초안은 학생 목록에 안 나온다');
r = await call('GET', '/api/class/write-topics', 'hq_t_kim');
ok(r.j.can_create === true && r.j.manage.length === 1 && r.j.manage[0].id === T1.id && r.j.ai_left === CAP - 1, '선생님 GET → 만들기 됨 · 내 글감 · 남은 횟수');
r = await call('GET', '/api/class/write-topics', 'hq_t_lee');
ok(r.j.can_create === true && r.j.manage.length === 0, '(짝) 다른 선생님에게는 남의 초안이 «내 글감» 에 안 나온다');
r = await call('GET', '/api/class/write-topics', 'branch_bs');
ok(r.j.can_create === true && r.j.manage.length === 0, '지사 쿠키로 GET → 만들기 됨(2026-10-26) · 남의 초안은 «내 글감» 에 안 나온다');
r = await call('POST', '/api/class/write-topics', 'branch_bs', { action: 'hide', id: T1.id });
ok(r.st === 403 && r.j.error === 'not_owner', '(짝) 지사가 남의 글감 내리기 → 403 not_owner');
r = await call('POST', '/api/class/write-topics', 'hq_t_lee', { action: 'save', id: T1.id, title_ko: '남의 것' });
ok(r.st === 403 && r.j.error === 'not_owner', '다른 선생님이 고치기 → 403 not_owner');
r = await call('POST', '/api/class/write-topics', 'hq_t_kim', { action: 'save', id: T1.id, title_ko: '우리 반 소풍 (수정)', words: ['bus', '버스', 'lunch box'],
  questions: [{ k: 'what', ko: '무엇을 했나요?', en: 'What did you do?', starter: 'I want a', example: '공룡' }, { k: 'who', ko: '누구와?', en: 'Who?', starter: 'I was with', example: 'my class' }] });
ok(r.st === 200 && r.j.item.title_ko === '우리 반 소풍 (수정)' && JSON.stringify(r.j.item.words) === '["bus","lunch box"]', '자기 것 저장 → 고친 값 · 미션 단어는 같은 규칙으로 다시 거른다');
ok(r.j.item.questions.map(q => q.k).join(',') === 'who,what' && r.j.item.questions[1].starter === 'First, ', '저장도 6하원칙 순서 · 관사로 끝난 시작 문장은 기본값(화면이 보낸 값을 믿지 않는다)', JSON.stringify(r.j.item.questions));
r = await call('POST', '/api/class/write-topics', 'admin', { action: 'save', id: T1.id, open: 'We went on a trip.' });
ok(r.st === 200 && r.j.item.open === 'We went on a trip.', '(짝) 본사는 남의 글감도 고친다');
r = await call('POST', '/api/class/write-topics', 'hq_t_kim', { action: 'publish', id: T1.id });
ok(r.st === 200 && r.j.item.status === 'published', '올리기 → published');
r = await call('GET', '/api/class/write-topics');
const pub = r.j.items[0] || {};
ok(r.j.items.length === 1 && pub.id === T1.id && pub.questions.length === 2, '올린 글감이 학생 목록에 나온다');
ok(!('status' in pub) && !('created_by' in pub) && !('image_prompt' in pub), '학생 목록에는 직원 칸(status·created_by·image_prompt)이 안 샌다');
// 그림
AI_MODE = 'img-fallback'; aiCalls = [];
r = await call('POST', '/api/class/write-topics', 'hq_t_kim', { action: 'image', id: T1.id });
ok(r.st === 200 && /\/api\/class\/write-topics\/img\/\d+\/1$/.test(r.j.item.image_url) && aiCalls.join(',').includes('schnell'), '그림: 첫 모델이 죽어도 두 번째 모델로 만든다 · 판 1');
const key1 = [...R2.keys()][0];
ok(/^write-topics\/\d+\/1\.png$/.test(key1 || ''), 'R2 키 = write-topics/<id>/<판>.png', key1);
let g = await call('GET', `/api/class/write-topics/img/${T1.id}/1`);
ok(g.st === 200 && g.res.headers.get('Content-Type') === 'image/png' && /immutable/.test(g.res.headers.get('Cache-Control') || ''), '그림 주소는 판이 맞으면 1년 캐시로 준다');
AI_MODE = 'ok';
r = await call('POST', '/api/class/write-topics', 'hq_t_kim', { action: 'image', id: T1.id });
ok(/\/2$/.test(r.j.item.image_url) && !R2.has(key1) && R2.size === 1, '다시 만들면 판 2 · 옛 판 파일은 지운다');
g = await call('GET', `/api/class/write-topics/img/${T1.id}/1`);
ok(g.st === 404, '(짝) 옛 판 주소는 404(옛 주소가 새 그림을 보이지 않게)');
AI_MODE = 'img-fail';
r = await call('POST', '/api/class/write-topics', 'hq_t_kim', { action: 'image', id: T1.id });
ok(r.st === 502 && r.j.error === 'image_failed' && /\/ /.test(r.j.message), '그림이 둘 다 실패하면 502 + 한/영 문구');
AI_MODE = 'ok';
// 하루 상한
const insLog = db.prepare('INSERT INTO write_topic_gen_log (username, kind, ok, ts) VALUES (?, ?, 1, ?)');
const usedNow = db.prepare('SELECT COUNT(*) n FROM write_topic_gen_log WHERE username = ?').get('hq_t_lee').n;
for (let i = usedNow; i < CAP - 1; i++) insLog.run('hq_t_lee', 'draft', Date.now());
r = await call('POST', '/api/class/write-topics', 'hq_t_lee', { action: 'draft', title: '나의 꿈' });
ok(r.st === 200 && r.j.ok, `하루 ${CAP - 1}번 쓴 선생님 → 한 번 더 된다`);
const T2 = r.j.item;
r = await call('POST', '/api/class/write-topics', 'hq_t_lee', { action: 'draft', title: '나의 꿈 2' });
ok(r.st === 429 && r.j.error === 'daily_cap' && /\/ /.test(r.j.message), `(짝) ${CAP}번 → 429 daily_cap (한/영)`);
r = await call('POST', '/api/class/write-topics', 'hq_t_lee', { action: 'image', id: T2.id });
ok(r.st === 429, '그림도 같은 상한을 쓴다');
insLog.run('old_user', 'draft', Date.now() - 2 * 86400000);
ok(M.writeTopicCostGate(db.prepare('SELECT COUNT(*) n FROM write_topic_gen_log WHERE username=? AND ts > ?').get('old_user', Date.now() - 86400000).n, 0).ok, '24시간이 지난 기록은 세지 않는다');
// LLM 이 죽어도 초안은 만든다(기본 6칸)
AI_MODE = 'text-fail';
r = await call('POST', '/api/class/write-topics', 'admin', { action: 'draft', title: '내가 좋아하는 계절' });
ok(r.st === 200 && r.j.ai_used === false && r.j.item.questions.length === 6, 'LLM 이 죽으면 ai_used:false 로 기본 6하원칙 초안(화면이 «기본 질문으로 만들었어요» 라고 말한다)');
AI_MODE = 'ok';
// 내리기
r = await call('POST', '/api/class/write-topics', 'hq_t_kim', { action: 'hide', id: T1.id });
ok(r.st === 200 && r.j.item.status === 'hidden', '내리기 → hidden');
r = await call('GET', '/api/class/write-topics');
ok(!r.j.items.some(x => x.id === T1.id), '(짝) 내린 글감은 학생 목록에서 사라진다');
r = await call('POST', '/api/class/write-topics', 'hq_t_kim', { action: 'save', id: 99999 });
ok(r.st === 404, '없는 글감 → 404');
r = await call('POST', '/api/class/write-topics', 'hq_t_kim', { action: 'save', id: 'x' });
ok(r.st === 400 && r.j.error === 'id_required', '번호가 아니면 → 400');
// 배선 — api-mango 가 이 정본에 맡긴다
const MANGO = rd(resolve(SRC, 'api-mango.ts'));
ok(/import \{ handleWriteTopicsApi \} from '\.\/write-topics'/.test(MANGO) && /path === '\/api\/class\/write-topics'[\s\S]{0,160}handleWriteTopicsApi\(request, url, env/.test(MANGO), 'api-mango.ts 가 /api/class/write-topics 를 이 정본에 맡긴다');

/* ═══════════════ [C] 화면 — 목록 하나 · 선생님 글감 ═══════════════ */
console.log('\n[C] 화면 코드를 오려 내 가짜 DOM 으로 돌린다');
const cut = (re, label) => { const m = HTML.match(re); ok(!!m, '오려 냄: ' + label); return m ? m[0] : ''; };
const fn = (head, label) => { const s = blockFrom(HTML, head); ok(!!s, '오려 냄: ' + label); return s; };
const PARTS = [
  'const window = {};\n' + rd(resolve(ROOT, 'cloudflare-deploy/public/js/write-scene-media.js')),
  cut(/const PIC_SCENES = \[[\s\S]*?\n    \];/, 'PIC_SCENES'),
  cut(/const TOPICS = \[[\s\S]*?\n    \];/, 'TOPICS'),
  cut(/const GO_BASE = \[[\s\S]*?\n    \];/, 'GO_BASE'),
  cut(/const GO_SCENE_Q = \[[\s\S]*?\n    \];/, 'GO_SCENE_Q'),
  cut(/const GO_TOPIC_Q = \[[\s\S]*?\n    \];/, 'GO_TOPIC_Q'),
  cut(/const GO_THEMES = \[[\s\S]*?\n    \];/, 'GO_THEMES'),
  cut(/const GO_PARTS = \[[\s\S]*?\n    \];/, 'GO_PARTS'),
  cut(/const GO_PREP = [^\n]+\n/, 'GO_PREP'),
  cut(/const goHasKo = [^\n]+\n/, 'goHasKo'),
  cut(/const goIsEn  = [^\n]+\n/, 'goIsEn'),
  fn('function goThemeFromScene(idx)', 'goThemeFromScene'),
  fn('function goThemeFromTopic(idx)', 'goThemeFromTopic'),
  fn('function goQuestions()', 'goQuestions'),
  fn('function goLineFor(q)', 'goLineFor'),
  fn('function goOutline()', 'goOutline'),
  cut(/const AW_GROUPS = \[[\s\S]*?\n    \];/, 'AW_GROUPS'),
  fn('function awFindCustom(id)', 'awFindCustom'),
  fn('function awThemeFromCustom(it)', 'awThemeFromCustom'),
  fn('function awPickerEntries(key)', 'awPickerEntries'),
  fn('function awBuildPicker()', 'awBuildPicker'),
  fn('function awPickerValueNow()', 'awPickerValueNow'),
  fn('function awSyncPicker()', 'awSyncPicker'),
  fn('window.awPickTopic = function(v)', 'awPickTopic'),
  fn('window.awTopicWords = function()', 'awTopicWords'),
].join('\n');
const BODY = `
  let _picIdx = S.picIdx, _goTheme = S.theme || null, _goAnswers = S.answers || {}, _wtItems = S.items || [], _wtManage = S.manage || [], _wtCan = !!S.can;
  const calls = [];
  const goApplyTheme = (t, toggle, quiet) => { calls.push({ fn: 'apply', id: t && t.id, set: t && t.set, quiet }); _goTheme = t; };
  const choosePic = n => { calls.push({ fn: 'choosePic', n }); _picIdx = n; };
  const wtOpen = (id, keep) => calls.push({ fn: 'wtOpen', id, keep });
  const goLangKo = () => S.lang !== 'en';
  const mkEl = tag => ({ tag, children: [], attrs: {}, textContent: '', label: '', value: '',
    appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = v; } });
  const document = { createElement: mkEl };
  const picChoice = { children: [], value: '', appendChild(c) { this.children.push(c); return c; },
    set innerHTML(v) { this.children = []; }, get options() { return this.children.flatMap(g => g.children); } };
  ${PARTS}
  return { window, calls, picChoice, get theme() { return _goTheme; }, awBuildPicker, awPickerEntries, awThemeFromCustom, goQuestions, goOutline,
           setTheme(t) { _goTheme = t; }, setAnswers(a) { _goAnswers = a; }, GO_THEMES, PIC_SCENES, TOPICS };`;
let mk = null;
try { mk = new Function('S', BODY); mk({ picIdx: 0 }); } catch (e) { console.log('  (실행 준비 실패) ' + e.message); mk = null; }
ok(!!mk, '전제: 목록·글감 코드가 함께 실행된다');
if (!mk) done();
const ITEM = { id: 7, title_ko: '나의 첫 캠핑', title_en: 'My first camping trip', icon: '⛺', open: 'Last summer, I went camping.', image_url: '',
  words: ['tent', '텐트', 'fire', 'stars'],
  questions: [{ k: 'when', p: 0, ko: '🕒 When — 언제 갔나요?', en: '🕒 When — When did you go?', starter: 'It happened ', ph: '예) last summer' },
              { k: 'what', p: 1, ko: '💡 What — 무엇을 했나요?', en: '💡 What — What did you do?', starter: 'First, ', ph: '예) we set up a tent' },
              { k: 'bad', p: 1, ko: '', en: 'no ko' }] };
const DRAFT = { id: 9, status: 'draft', title_ko: '우리 반 소풍', title_en: 'Our school trip', icon: '🚌', questions: [], words: [] };
const DELETED = { id: 11, status: 'deleted', title_ko: '지운 것', questions: [] };
const run = (S, v) => { const w = mk(S); w.window.awPickTopic(v); return w; };
let w = run({ picIdx: 0 }, 'pic:3');
ok(w.calls[0] && w.calls[0].fn === 'apply' && w.calls[0].set === 'scene' && w.calls[0].id === 'pic:' + w.PIC_SCENES[3].img && w.calls[0].quiet === true, 'pic:3 → 그 그림이 지금 주제(조용히 — 스크롤 안 옮김)');
ok(w.calls.some(c => c.fn === 'choosePic' && c.n === 3), 'pic:3 → 그림도 3번으로 바꾼다');
for (const bad of ['pic:999', 'pic:1.5', 'pic:-1', 'pic:', 'story:nope', 'topic:x', 'topic:9999', 'custom:999', 'zzz', '', 'custom:'])
  ok(run({ picIdx: 0 }, bad).calls.length === 0, `(짝) 이상한 값 «${bad}» → 아무 일도 안 한다`);
w = run({ picIdx: 0 }, 'story:lost');
ok(w.calls.length === 1 && w.calls[0].id === 'lost' && w.calls[0].set === undefined, 'story:lost → 내 경험 이야기 «잃어버린 날»');
w = run({ picIdx: 0 }, 'topic:0');
ok(w.calls.length === 1 && w.calls[0].id === 'topic:0' && w.calls[0].set === 'topic', 'topic:0 → 오늘의 글감');
w = run({ picIdx: 0, items: [ITEM] }, 'custom:7');
ok(w.calls[0] && w.calls[0].id === 'custom:7' && w.calls[0].set === 'custom', 'custom:7 → 선생님 글감');
ok(!w.calls.some(c => c.fn === 'wtOpen'), '(짝) 학생 화면에서는 편집 칸을 안 연다');
w = run({ picIdx: 0, items: [ITEM], can: true }, 'custom:7');
ok(w.calls.some(c => c.fn === 'wtOpen' && c.id === 7 && c.keep === true), '선생님 화면에서는 그 글감을 편집 칸으로 불러온다(주제는 그대로)');
w = run({ picIdx: 0, items: [], manage: [DRAFT], can: true }, 'custom:9');
ok(w.calls[0] && w.calls[0].id === 'custom:9', '선생님은 아직 안 올린 자기 초안도 고를 수 있다');
// 선생님 글감 → 질문 · 뼈대
w = mk({ picIdx: 0 });
const T = w.awThemeFromCustom(ITEM);
ok(T.qs.length === 2 && T.qs.every(q => q.ko && q.en), '선생님 글감: 한/영이 빠진 질문 칸은 버린다');
ok(T.srcKo === '선생님 글감' && w.awThemeFromCustom(DRAFT).srcKo === '선생님 글감 · 아직 안 올림', '«어디서 온 주제인지» 를 말한다(안 올린 초안은 그렇다고)');
w.setTheme(T);
ok(w.goQuestions().map(q => q.k).join(',') === 'when,what', '브레인스토밍 질문 = 선생님 글감 질문');
w.setAnswers({ when: 'last summer', what: '텐트를 쳤어요' });
const out = w.goOutline();
ok(/^Last summer, I went camping\./.test(out.text) && /It happened last summer\./.test(out.text), '뼈대 맨 앞 = 선생님 첫 문장 · 답이 시작 문장에 이어진다', JSON.stringify(out.text));
ok(!/[가-힣]/.test(out.text) && out.parts.some(p => p.lines.some(l => l.memo === '텐트를 쳤어요')), '(짝) 한글 답은 글쓰기 칸에 안 들어가고 메모로 남는다');
w.setTheme(w.awThemeFromCustom(Object.assign({}, ITEM, { questions: [] })));
ok(w.goQuestions().length === 6, '질문이 비어 있는 선생님 글감은 기본 6하원칙으로');
w.setTheme(T);
ok(JSON.stringify(w.window.awTopicWords()) === '["tent","fire","stars"]', '미션 단어 = 선생님 단어(한글은 버림)');
w.setTheme(w.GO_THEMES[0]);
ok(Array.isArray(w.window.awTopicWords()) && w.window.awTopicWords().length === 0, '(짝) 내 경험 이야기 → 그림 낱말이 아니라 빈 목록(단어장·레벨로)');
w.setTheme(null);
ok(w.window.awTopicWords() === null, '(짝) 그림 주제 → null(그림 속 낱말 그대로)');
// 목록 — 묶음·언어·초안 표시
w = mk({ picIdx: 0, items: [ITEM], manage: [Object.assign({ status: 'published' }, ITEM), DRAFT, DELETED], can: true });
const cust = w.awPickerEntries('custom');
ok(cust.length === 2 && cust[0].v === 'custom:7' && cust[1].v === 'custom:9' && /아직 안 올림/.test(cust[1].ko) && !/아직 안 올림/.test(cust[0].ko), '선생님 묶음: 올린 것 + 내 초안(«아직 안 올림») · 같은 글감은 한 번만 · 지운 것은 빠짐');
w.awBuildPicker();
const labelsKo = w.picChoice.children.map(g => g.label);
ok(labelsKo.length === 4 && /선생님/.test(labelsKo[0]) && /그림/.test(labelsKo[1]) && /경험/.test(labelsKo[2]) && /글감/.test(labelsKo[3]), '목록 하나에 네 묶음(선생님·그림·경험·글감)', labelsKo.join(' | '));
ok(w.picChoice.options.length === 2 + w.PIC_SCENES.length + w.GO_THEMES.length + w.TOPICS.length, '모든 글감이 한 목록에 다 들어 있다(빠진 것 없음)');
ok(w.picChoice.options.every(o => o.attrs['data-ko'] && o.attrs['data-en']), '항목마다 한/영 글자를 함께 단다');
const wEn = mk({ picIdx: 0, items: [ITEM], lang: 'en' }); wEn.awBuildPicker();
const labelsEn = wEn.picChoice.children.map(g => g.label);
ok(/Teacher/.test(labelsEn[0]) && /Picture/.test(labelsEn[1]) && wEn.picChoice.options.some(o => o.textContent === '⛺ My first camping trip'), 'EN: 묶음 이름·항목이 영어(optgroup label 은 i18n 이 못 바꿔서 다시 그린다)');
const wNone = mk({ picIdx: 0 }); wNone.awBuildPicker();
ok(wNone.picChoice.children.length === 3 && !/선생님/.test(wNone.picChoice.children[0].label), '(짝) 선생님 글감이 하나도 없으면 그 묶음은 안 보인다');
ok(wNone.picChoice.value === 'pic:0', '기본 선택 = 지금 그림');

console.log('\n[D] 화면 구조 — 고르는 곳 하나 · 그림 바로 밑 브레인스토밍 (2026-10-19)');
const pos = id => HTML.indexOf('id="' + id + '"');
ok(/<select id="picChoice" onchange="awPickTopic\(this\.value\)">/.test(HTML), '«장면·글감 선택» 이 목록 하나로 모든 글감을 고른다');
ok(pos('pickNote') < 0 && pos('topicRow') < 0 && !/function shuffleTopics/.test(HTML), '(짝) 옛 «셋 중 하나만» 안내·🎲 칩 줄은 없다 — 고르는 곳을 다시 늘리지 않는다');
const plan = blockFrom(HTML, '<div class="aw-plan" id="awPlan">') ? HTML.slice(pos('awPlan'), pos('missionCard')) : '';
ok(plan.includes('id="picCard"') && plan.includes('id="wtPanel"') && plan.includes('id="goCard"'), '그림 · 선생님 글감 · 브레인스토밍이 한 묶음(#awPlan)');
ok(pos('picCard') < pos('wtPanel') && pos('wtPanel') < pos('goCard') && pos('goCard') < pos('missionCard') && pos('missionCard') < pos('awHelp') && pos('awHelp') < pos('text'),
  '순서: 그림 → 선생님 글감 → 브레인스토밍 → 미션 → 도움 → 글쓰기 칸');
const helpSlice = HTML.slice(pos('awHelp'), HTML.indexOf('</details>', HTML.indexOf('id="sentenceCoach"')) + 10);
ok(!helpSlice.includes('id="goCard"') && helpSlice.includes('id="sentenceCoach"'), '«도움» 안에는 문장 연습만(브레인스토밍은 밖)');
ok(/id="wtPanel" hidden/.test(HTML), '선생님 칸은 처음에 감춰져 있다(학생 화면)');
const style = (HTML.match(/<style[^>]*>([\s\S]*?)<\/style>/) || [])[1] || '';
ok(/#wtPanel\[hidden\][^{]*\{ display: none !important/.test(style) && /#picTopic\[hidden\] \{ display: none !important/.test(style), '[hidden] 이 실제로 먹는다(display 를 정한 칸이라)');
ok(/\.wrap > \.aw-plan \{ grid-column: 1; grid-row: 4 \/ 13/.test(style) && !/\.wrap > \.pic-card \{/.test(style), 'PC 2단: 묶음 전체가 왼쪽 칸');
ok(!/[「」]/.test(style), '<style> 안에 홑낫표 없음(한자 폰트 검사)');
ok((HTML.match(/\{ id:'/g) || []).length === 8, '«{ id:» 모양 리터럴은 GO_THEMES 8개뿐(목록 코드가 그 모양을 안 쓴다)');
ok(/credentials: 'include'/.test(blockFrom(HTML, 'async function wtLoad()')) && /credentials: 'include'/.test(blockFrom(HTML, 'async function wtCall(body)')), '선생님 판정에 필요한 세션 쿠키를 함께 보낸다');
done();
