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
  // 학생 로그인 토큰 — 'Bearer tok-<uid>' 만 «진짜» 로 본다(그 밖은 서명 실패 = null)
  authUidFromRequest: async (req) => {
    const m = (req.headers.get('Authorization') || '').match(/^Bearer tok-([\w.-]+)$/);
    return m ? m[1] : null;
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
  // 🔒 그림 서명은 «진짜» 정본으로 돌린다(가짜로 두면 서명 검사가 원리상 헛돈다)
  const RJ = await import(toData(stripTypeScriptTypes(rd(resolve(SRC, 'room-jwt-secret.ts')))));
  globalThis.__WT.requireRoomJwtSecret = RJ.requireRoomJwtSecret;
  const AT = await import(toData(importsTo(stripTypeScriptTypes(rd(process.env.AT_SRC || resolve(SRC, 'auth-token.ts'))), '__WT')));
  globalThis.__WT.signWtImgSig = AT.signWtImgSig; globalThis.__WT.verifyWtImgSig = AT.verifyWtImgSig;
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
let AI_MODE = 'ok', aiCalls = [], aiPrompts = [];
const RICH = { title_en: 'My Dog', title_ko: '우리 집 강아지', icon: '🐶', open: 'I have a dog.',
  questions: ['when', 'where', 'who', 'what', 'why', 'how'].map(k => ({ k, ko: k + ' 질문?', en: k + ' question?', starter: 'I ',
    example: 'a very long example answer here', choices: ['my dog', '내 강아지', 'MY DOG', 'a big brown dog', 'the park', 'home'] })),
  words: ['dog'], image_prompt: 'a happy dog in a garden' };
const AI = { run: async (model, input) => {
  aiCalls.push(model);
  if (input && input.messages) aiPrompts.push(String(input.messages[0].content));
  if (AI_MODE === 'rich' && !/flux/.test(model)) return { response: JSON.parse(JSON.stringify(RICH)) };
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
const ENV = { DB: D1, AI, RECORDINGS, ROOM_JWT_SECRET: 'LOCAL-ONLY-write-topics-harness-not-a-secret' };
const call = async (method, path, who, body) => {
  const headers = { 'content-type': 'application/json' };
  if (who && who.startsWith('Bearer ')) headers.Authorization = who;
  else if (who) headers.Cookie = 'mangoi_admin_session=' + who;
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

console.log('\n③ 학생 — 로그인하면 «나만 보는 주제» (2026-10-26 사장님 «학생도 각자 원하는 주제로 연습»)');
r = await call('GET', '/api/class/write-topics');
ok(r.j.can_create === false && r.j.reason === 'login', '로그인 안 한 학생 → 만들기 안 됨 · «로그인하면» 안내(reason=login)');
r = await call('GET', '/api/class/write-topics', 'Bearer forged');
ok(r.j.can_create === false && r.j.reason === 'denied', '(짝) 가짜 토큰 → 만들기 안 됨');
r = await call('GET', '/api/class/write-topics', 'Bearer tok-guest_ab12');
ok(r.j.can_create === false, '(짝) 게스트 id 토큰은 계정이 아니다 → 안 됨');
r = await call('GET', '/api/class/write-topics', 'Bearer tok-kimsu');
ok(r.j.can_create === true && r.j.role === 'student' && r.j.ai_cap === M.WT_STUDENT_DAILY_CAP && r.j.manage.length === 0, '로그인 학생 → 만들기 됨 · role=student · 학생 상한');
r = await call('POST', '/api/class/write-topics', 'Bearer tok-kimsu', { action: 'draft', title: '내가 좋아하는 공룡' });
ok(r.st === 200 && r.j.item.created_by === 'stu:kimsu' && r.j.item.status === 'draft', '학생 초안 → created_by=stu:<uid> · 초안');
const S1 = r.j.item;
r = await call('POST', '/api/class/write-topics', 'Bearer tok-kimsu', { action: 'publish', id: S1.id });
ok(r.st === 403 && r.j.error === 'student_no_publish' && /\/ /.test(r.j.message), '학생은 학원 전체에 못 올린다(403 · 한/영)');
r = await call('POST', '/api/class/write-topics', 'Bearer tok-kimsu', { action: 'save', id: S1.id, title_ko: '공룡 이야기' });
ok(r.st === 200 && r.j.item.title_ko === '공룡 이야기', '(짝) 자기 주제는 고친다');
r = await call('POST', '/api/class/write-topics', 'Bearer tok-leeyu', { action: 'save', id: S1.id, title_ko: '남의 것' });
ok(r.st === 403 && r.j.error === 'not_owner', '다른 학생은 못 고친다');
r = await call('GET', '/api/class/write-topics', 'Bearer tok-kimsu');
ok(r.j.manage.length === 1 && r.j.manage[0].id === S1.id, '내 목록에는 내 주제가 보인다');
r = await call('GET', '/api/class/write-topics', 'Bearer tok-leeyu');
ok(r.j.manage.length === 0 && !r.j.items.some(x => x.id === S1.id), '(짝) 다른 학생 목록·공개 목록에는 안 보인다');
r = await call('GET', '/api/class/write-topics', 'admin');
ok(r.j.role === 'staff' && !r.j.manage.some(x => x.id === S1.id), '본사 관리 목록에도 학생 주제는 섞이지 않는다');
for (let i = 1; i < M.WT_STUDENT_DAILY_CAP; i++) insLog.run('stu:kimsu', 'draft', Date.now());
r = await call('POST', '/api/class/write-topics', 'Bearer tok-kimsu', { action: 'draft', title: '하나 더' });
ok(r.st === 429 && r.j.error === 'daily_cap', `학생은 하루 ${M.WT_STUDENT_DAILY_CAP}번까지(직원 상한 ${CAP} 이 아님)`);
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
  cut(/    let _wtDone = new Set\(\)[\s\S]*?(?=\n    \/\/ 📌 선생님 글감 찾기)/, 'awHw* (숙제)'),
  fn('function awFindCustom(id)', 'awFindCustom'),
  fn('function awThemeFromCustom(it)', 'awThemeFromCustom'),
  fn('function awPickerEntries(key)', 'awPickerEntries'),
  fn('function awBuildPicker()', 'awBuildPicker'),
  fn('function awPickerValueNow()', 'awPickerValueNow'),
  fn('function awSyncPicker()', 'awSyncPicker'),
  fn('window.awPickTopic = function(v)', 'awPickTopic'),
  fn('window.awTopicWords = function()', 'awTopicWords'),
].join('\n');
const WT_IS_STUDENT = (HTML.match(/const wtIsStudent = [^\n]+\n/) || [''])[0];
const BODY = `
  let _picIdx = S.picIdx, _goTheme = S.theme || null, _goAnswers = S.answers || {}, _wtItems = S.items || [], _wtManage = S.manage || [], _wtCan = !!S.can;
  let _wtRole = S.role === 'student' ? 'student' : '';
  ${WT_IS_STUDENT}
  const calls = [];
  const goApplyTheme = (t, toggle, quiet) => { calls.push({ fn: 'apply', id: t && t.id, set: t && t.set, quiet }); _goTheme = t; };
  const choosePic = n => { calls.push({ fn: 'choosePic', n }); _picIdx = n; };
  const wtOpen = (id, keep) => calls.push({ fn: 'wtOpen', id, keep });
  const goLangKo = () => S.lang !== 'en';
  const mkEl = tag => ({ tag, children: [], attrs: {}, textContent: '', label: '', value: '',
    appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = v; } });
  const hwNote = { hidden: true, textContent: '', className: '' }, toasts = [];
  const document = { createElement: mkEl, getElementById: id => (id === 'awHwNote' ? hwNote : null) };
  const awTr = (ko, en) => (S.lang === 'en' ? en : ko);
  const showToast = m => toasts.push(m);
  const picChoice = { children: [], value: '', appendChild(c) { this.children.push(c); return c; },
    set innerHTML(v) { this.children = []; }, get options() { return this.children.flatMap(g => g.children); } };
  ${PARTS}
  return { window, calls, picChoice, get theme() { return _goTheme; }, awBuildPicker, awPickerEntries, awThemeFromCustom, goQuestions, goOutline,
           setTheme(t) { _goTheme = t; }, setAnswers(a) { _goAnswers = a; }, hwNote, toasts, awHwLabel, awHwItems, awHwState, awRenderHwNote, awTopicIdNow, awMarkHwDone, setDone(ids, known) { _wtDone = new Set(ids); _wtDoneKnown = known; }, GO_THEMES, PIC_SCENES, TOPICS };`;
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
// 2026-10-26 사장님 캡처 «장면·글감 선택 바로 아래» — 주제 만들기가 그림 «위» 로 올라갔다
ok(pos('wtPanel') < pos('picCard') && pos('picCard') < pos('goCard') && pos('goCard') < pos('missionCard') && pos('missionCard') < pos('awHelp') && pos('awHelp') < pos('text'),
  '순서: 주제 만들기 → 그림 → 브레인스토밍 → 미션 → 도움 → 글쓰기 칸');
const helpSlice = HTML.slice(pos('awHelp'), HTML.indexOf('</details>', HTML.indexOf('id="sentenceCoach"')) + 10);
ok(!helpSlice.includes('id="goCard"') && helpSlice.includes('id="sentenceCoach"'), '«도움» 안에는 문장 연습만(브레인스토밍은 밖)');
ok(/id="wtPanel" hidden/.test(HTML), '선생님 칸은 처음에 감춰져 있다(학생 화면)');
const style = (HTML.match(/<style[^>]*>([\s\S]*?)<\/style>/) || [])[1] || '';
ok(/#wtPanel\[hidden\][^{]*\{ display: none !important/.test(style) && /#picTopic\[hidden\] \{ display: none !important/.test(style), '[hidden] 이 실제로 먹는다(display 를 정한 칸이라)');
ok(/\.wrap > \.aw-plan \{ grid-column: 1; grid-row: 4 \/ 13/.test(style) && !/\.wrap > \.pic-card \{/.test(style), 'PC 2단: 묶음 전체가 왼쪽 칸');
ok(!/[「」]/.test(style), '<style> 안에 홑낫표 없음(한자 폰트 검사)');
ok((HTML.match(/\{ id:'/g) || []).length === 8, '«{ id:» 모양 리터럴은 GO_THEMES 8개뿐(목록 코드가 그 모양을 안 쓴다)');
ok(/credentials: 'include'/.test(blockFrom(HTML, 'async function wtLoad()')) && /credentials: 'include'/.test(blockFrom(HTML, 'async function wtCall(body)')), '선생님 판정에 필요한 세션 쿠키를 함께 보낸다');
console.log('\n[E] 학생이 쓰기 쉽게(제안 0·1·4 — 2026-10-26)');
ok(!!WT_IS_STUDENT, '전제: 학생 판정 정본(wtIsStudent)을 소스에서 오려 냈다');
const MYDRAFT = Object.assign({}, ITEM, { id: 31, status: 'draft', title_ko: '우리 집 강아지', title_en: 'My Dog' });
const stuT = mk({ picIdx: 0, role: 'student', manage: [MYDRAFT] }).awThemeFromCustom(MYDRAFT);
ok(/내 주제/.test(stuT.srcKo) && !/선생님/.test(stuT.srcKo) && /My topic/.test(stuT.srcEn), '0) 학생이 만든 주제는 «내 주제» 로 부른다(선생님 글감 아님)', stuT.srcKo);
const stfT = mk({ picIdx: 0, manage: [MYDRAFT] }).awThemeFromCustom(MYDRAFT);
ok(/선생님 글감 · 아직 안 올림/.test(stfT.srcKo), '(짝) 선생님 화면의 초안은 예전 그대로 «선생님 글감 · 아직 안 올림»', stfT.srcKo);
const pubT = mk({ picIdx: 0, role: 'student' }).awThemeFromCustom(ITEM);
ok(pubT.srcKo === '선생님 글감', '(짝) 학원에 올라온 글감은 학생 화면에서도 «선생님 글감»', pubT.srcKo);
const wS = mk({ picIdx: 0, role: 'student', items: [ITEM], manage: [MYDRAFT] }); wS.awBuildPicker();
const gS = wS.picChoice.children.map(g => g.label);
ok(/내 주제/.test(gS[0]) && /선생님/.test(gS[1]), '0) 학생 목록 맨 위 묶음은 «📝 내 주제», 그다음 선생님 글감', gS.join(' | '));
const mineG = wS.picChoice.children[0], teachG = wS.picChoice.children[1];
ok(mineG.children.length === 1 && mineG.children[0].value === 'custom:31' && !teachG.children.some(o => o.value === 'custom:31'),
  '0) 내 주제는 «내 주제» 묶음에만 있고 선생님 묶음과 섞이지 않는다');
const wT = mk({ picIdx: 0, items: [ITEM], manage: [MYDRAFT] }); wT.awBuildPicker();
ok(!wT.picChoice.children.some(g => /내 주제/.test(g.label)) && wT.picChoice.options.some(o => o.value === 'custom:31'), '(짝) 선생님 화면에는 «내 주제» 묶음이 없고 초안은 선생님 묶음에 있다');
const stripTags = h => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
const vis = stripTags(HTML);
ok(!/내가 만든 글감/.test(vis) && !/글감 제목 —/.test(vis), '0) 화면 글자에 «내가 만든 글감»·«글감 제목» 이 없다');
ok(/주제를 2글자 이상/.test(HTML) && !/글감 제목을 2글자/.test(HTML), '0) 짧은 제목 경고도 «주제»');
const ideas = (HTML.match(/const WT_IDEAS = \[([\s\S]*?)\n    \];/) || [])[1] || '';
const ideaN = (ideas.match(/\['/g) || []).length;
ok(ideaN === 8, '1) 예시 주제 8개', String(ideaN));
ok(/id="wtIdeas" hidden/.test(HTML) && /#wtIdeas|\.wt-ideas\[hidden\] \{ display: none !important/.test(style), '1) 예시 줄은 처음엔 감춰져 있고 [hidden] 이 먹는다');
const rIdeas = blockFrom(HTML, 'function wtRenderIdeas()');
ok(/box\.hidden = !\(_wtCan && wtIsStudent\(\)\)/.test(rIdeas), '1) 예시 주제는 로그인한 학생에게만');
const pick = blockFrom(HTML, 'window.wtPickIdea = function(i)');
ok(/inp\.value = /.test(pick) && !/wtCall|wtDraft\(/.test(pick), '1) 누르면 칸에 넣기만 — AI 를 몰래 부르지 않는다');
const ideaChars = [...ideas].filter(c => c.codePointAt(0) > 0x1F000);
ok(ideaChars.every(c => !['🫶','🥲','🫠'].includes(c)), '1) 예시 이모지는 Unicode 13 이전');
ok(/id="wtLeft"/.test(HTML) && HTML.indexOf('id="wtLeft"') < HTML.indexOf('id="wtRow"'), '4) 남은 횟수 배지가 제목 줄(입력칸 위)에 있다');
const rl = blockFrom(HTML, 'function wtRenderLeft()');
ok(/typeof _wtAiLeft !== 'number'/.test(rl) && /내일 다시/.test(rl) && /번 남음/.test(rl), '4) 숫자를 모르면 안 그리고, 0이면 «내일 다시»');
ok((HTML.match(/_wtAiLeft - 1\); wtRenderLeft\(\);/g) || []).length === 2, '4) AI 를 쓰면(질문·그림) 배지를 바로 다시 그린다');
ok(/code === 'daily_cap'\) \{ _wtAiLeft = 0; wtRenderLeft\(\)/.test(HTML), '4) 서버가 «다 썼다» 하면 배지도 0');
ok(/if \(_wtAiLeft === 0\) \{ wtMsg/.test(blockFrom(HTML, 'window.wtDraft = async function()')), '4) 0번 남으면 요청을 보내지 않고 안내한다');
const rp = blockFrom(HTML, 'function wtRenderPanel()');
ok(/wtRenderLeft\(\)/.test(rp) && /wtRenderIdeas\(\)/.test(rp), '0·1·4) 패널을 그릴 때 배지·예시도 함께 그린다');

console.log('\n[F] 내 단계에 맞는 질문(제안 2) · 말로 주제 넣기(제안 3) — 2026-10-26');
ok(M.normalizeLevel('a1') === 'A1' && M.normalizeLevel('B2') === 'B2' && M.normalizeLevel('C1') === '' && M.normalizeLevel(null) === '', '단계 값은 A1~B2 만 · 모르면 «단계 맞춤 없음»');
const RAW = () => JSON.parse(JSON.stringify(RICH));
const nw = s => String(s).split(/\s+/).filter(Boolean).length;
const L1 = M.normalizeDraft(RAW(), '우리 집 강아지', 'A1');
ok(L1.questions.length <= M.WT_LEVEL_SPEC.A1.maxQ && L1.questions.some(q => q.k === 'what'), '1단계: 질문 4개 이하 · «무엇» 은 남긴다', L1.questions.map(q => q.k).join(','));
ok(L1.questions.every(q => nw(q.ph.replace(/^예\)\s*/, '')) <= 3), '1단계: 예시 답 3낱말 이하', L1.questions.map(q => q.ph).join(' | '));
ok(L1.questions.every(q => Array.isArray(q.choices) && q.choices.length >= 2 && q.choices.length <= 3 && q.choices.every(c => nw(c) <= 3 && !/[가-힣]/.test(c))),
  '1단계: 질문마다 고르는 답 2~3개 · 영어만 · 3낱말 이하', JSON.stringify(L1.questions[0].choices));
ok(L1.questions[0].choices.filter(c => c.toLowerCase() === 'my dog').length === 1, '고르는 답은 대소문자만 다른 중복을 뺀다');
const L2 = M.normalizeDraft(RAW(), '우리 집 강아지', 'A2');
ok(L2.questions.length <= 5 && L2.questions.every(q => q.choices && q.choices.every(c => nw(c) <= 4)), '2단계: 질문 5개 이하 · 고르는 답 4낱말 이하');
const L3 = M.normalizeDraft(RAW(), '우리 집 강아지', 'B1');
ok(L3.questions.length === 6 && L3.questions.every(q => !q.choices), '3단계: 질문 6개 그대로 · 고르는 답 없음(직접 쓴다)');
const noWhy = RAW(); noWhy.questions = noWhy.questions.filter(q => q.k !== 'why');
const L4 = M.normalizeDraft(noWhy, '우리 집 강아지', 'B2');
ok(L4.questions.some(q => q.k === 'why') && L4.questions.every(q => !q.choices), '4단계: AI 가 «왜» 를 빼도 넣는다(이유 쓰기)', L4.questions.map(q => q.k).join(','));
const L0 = M.normalizeDraft(RAW(), '우리 집 강아지');
ok(L0.questions.length === 6 && L0.questions.every(q => !q.choices) && L0.questions[0].ph === '예) a very long example answer here', '(짝) 단계가 없으면 예전 그대로(선생님 글감)');
// 서버: 학생은 단계 맞춤, 선생님은 단계를 보내도 무시
AI_MODE = 'rich'; aiPrompts = [];
r = await call('POST', '/api/class/write-topics', 'Bearer tok-leeyu', { action: 'draft', title: '우리 집 강아지', level: 'A1' });
const SL = r.j && r.j.item;
ok(r.st === 200 && SL && SL.questions.length <= 4 && SL.questions.every(q => q.choices && q.choices.length >= 2), '학생이 1단계로 만들면 → 짧은 질문 + 고르는 답', r.st + ' ' + (SL ? SL.questions.length : ''));
ok(/LEVEL: Step 1/.test(aiPrompts[aiPrompts.length - 1] || ''), '학생 단계가 AI 지시에 실린다');
aiPrompts = [];
r = await call('POST', '/api/class/write-topics', 'admin', { action: 'draft', title: '우리 집 강아지', level: 'A1' });
ok(r.st === 200 && r.j.item.questions.length === 6 && r.j.item.questions.every(q => !q.choices) && !/LEVEL:/.test(aiPrompts[aiPrompts.length - 1] || ''),
  '(짝) 선생님이 보내도 단계는 무시 — 선생님 글감은 모든 단계 학생에게 나간다');
r = await call('POST', '/api/class/write-topics', 'Bearer tok-leeyu', { action: 'draft', title: '우리 집 강아지 2', level: 'zz' });
ok(r.st === 200 && r.j.item.questions.every(q => !q.choices) && !/LEVEL:/.test(aiPrompts[aiPrompts.length - 1] || ''), '(짝) 모르는 단계 값 → 단계 맞춤 없이 예전대로');
AI_MODE = 'ok';
r = await call('POST', '/api/class/write-topics', 'Bearer tok-leeyu', { action: 'save', id: SL.id, title_ko: '강아지 이야기',
  questions: SL.questions.map(q => ({ k: q.k, ko: q.ko, en: q.en, starter: q.starter, example: 'my dog' })) });
ok(r.st === 200 && r.j.item.questions.every(q => q.choices && q.choices.length >= 2), '저장해도 고르는 답이 사라지지 않는다(편집 칸에 없는 값)');
// 화면
ok(/wtCall\(\{ action: 'draft', title: title, level: currentLevel \}\)/.test(HTML), '화면이 지금 고른 단계를 함께 보낸다');
const rgq = blockFrom(HTML, 'function renderGoQuestions()');
ok(/q\.choices/.test(rgq) && /goPickChoice\(this\)/.test(rgq), '브레인스토밍 칸에 고르는 답 버튼을 그린다');
const gpc = blockFrom(HTML, 'window.goPickChoice = function(btn)');
ok(/goInput\(k, c\)/.test(gpc) && /q\.choices\[i\]/.test(gpc), '고르는 답을 누르면 그 칸에 들어간다(화면 글자가 아니라 질문 값에서)');
ok(/id="wtMicBtn"[^>]*hidden/.test(HTML) && /\.wt-mic\[hidden\] \{ display: none !important/.test(style), '🎤 버튼은 처음에 숨김 · [hidden] 이 먹는다');
const rmic = blockFrom(HTML, 'function wtRenderMic()');
ok(/b\.hidden = !\(_wtCan && wtSR\(\)\)/.test(rmic), '🎤 는 만들 수 있고 음성인식이 되는 브라우저에서만');
const wmic = blockFrom(HTML, 'window.wtMic = function()');
ok(/ko-KR/.test(wmic) && !/wtCall|wtDraft\(/.test(wmic) && /inp\.value = heard/.test(wmic), '🎤 한국어로 들어 칸에 넣기만 — AI 를 몰래 부르지 않는다');
ok(/stopDictation\(\)/.test(wmic) && /window\.wtMicStop && window\.wtMicStop\(\)/.test(blockFrom(HTML, 'window.toggleDictation = function(){')), '🎤 글쓰기 받아쓰기와 동시에 듣지 않는다(양쪽)');
ok(/wtRenderMic\(\)/.test(blockFrom(HTML, 'function wtRenderPanel()')), '패널을 그릴 때 🎤 도 함께 그린다');

console.log('\n⑨ 🔒 비공개 그림 — 소유자 확인 · 단기 서명 · 공개 캐시 해제 (2026-10-26)');
{
  const W = globalThis.__WT;
  ok(typeof W.signWtImgSig === 'function' && typeof W.verifyWtImgSig === 'function', '전제: 진짜 서명 정본을 불러왔다');
  const raw = (u) => u.replace(/\?.*$/, '');
  const get = async (u, who) => call('GET', u, who);
  const noStore = (g) => /no-store/.test(g.res.headers.get('Cache-Control') || '') && !/public|immutable/.test(g.res.headers.get('Cache-Control') || '');
  // 판정 함수 — 짝으로
  ok(M.canViewTopicImage({ username: 'stu:a', isTeacher: false, ownOnly: true }, { created_by: 'stu:a' }) === true, '학생 본인은 자기 주제 그림을 본다');
  ok(M.canViewTopicImage({ username: 'stu:b', isTeacher: false, ownOnly: true }, { created_by: 'stu:a' }) === false, '(짝) 다른 학생은 못 본다');
  ok(M.canViewTopicImage(ACTORS.admin, { created_by: 'stu:a' }) === false, '본사도 학생 «나만 보는 주제» 그림은 못 본다(목록과 같은 기준)');
  ok(M.canViewTopicImage(ACTORS.admin, { created_by: 'hq_t_kim' }) === true, '(짝) 본사는 직원 초안 그림을 본다');
  ok(M.canViewTopicImage(ACTORS.hq_t_lee, { created_by: 'hq_t_kim' }) === false, '선생님은 남의 초안 그림을 못 본다');
  ok(M.canViewTopicImage(ACTORS.hq_t_kim, { created_by: 'HQ_T_KIM' }) === false, '(짝) 대소문자만 다른 아이디는 남이다');
  ok(M.canViewTopicImage(null, { created_by: 'x' }) === false && M.canViewTopicImage(ACTORS.admin, null) === false, '모르면 못 본다');

  // 학생 «나만 보는 주제» 그림
  let r = await call('POST', '/api/class/write-topics', 'Bearer tok-parkjh', { action: 'draft', title: '우리 가족 여행' });
  const P = r.j.item;
  r = await call('POST', '/api/class/write-topics', 'Bearer tok-parkjh', { action: 'image', id: P.id });
  const pu = r.j.item.image_url;
  ok(r.st === 200 && /\/img\/\d+\/1\?sig=\d+\./.test(pu), '학생 주제 그림 주소에는 단기 서명이 붙는다', pu);
  let g = await get(pu);
  ok(g.st === 200 && g.res.headers.get('Content-Type') === 'image/png' && noStore(g), '서명 있으면 열린다 · private, no-store(공개 캐시 아님)', g.res.headers.get('Cache-Control'));
  g = await get(raw(pu));
  ok(g.st === 404 && noStore(g), '🔴 로그인·서명 없이 번호만으로는 안 열린다(404 · 캐시 안 됨)');
  g = await get(raw(pu), 'Bearer tok-leeyu');
  ok(g.st === 404, '다른 학생 토큰으로도 안 열린다');
  g = await get(raw(pu), 'Bearer tok-parkjh');
  ok(g.st === 200 && noStore(g), '(짝) 본인 토큰이면 서명 없이도 열린다');
  g = await get(raw(pu), 'admin');
  ok(g.st === 404, '본사 쿠키로도 학생 주제 그림은 안 열린다');
  { const sg = decodeURIComponent(pu.split('sig=')[1]); const at = sg.indexOf('.') + 10; const bad = sg.slice(0, at) + (sg[at] === 'A' ? 'B' : 'A') + sg.slice(at + 1);
    g = await get(raw(pu) + '?sig=' + encodeURIComponent(bad)); }
  ok(g.st === 404, '서명을 한 글자 바꾸면 안 열린다');
  const other = await W.signWtImgSig(P.id + 1, 1, ENV);
  g = await get(raw(pu) + '?sig=' + encodeURIComponent(other));
  ok(g.st === 404, '다른 글감 번호의 서명으로는 안 열린다');
  const expired = await W.signWtImgSig(P.id, 1, ENV, -1000);
  g = await get(raw(pu) + '?sig=' + encodeURIComponent(expired));
  ok(g.st === 404, '만료된 서명은 안 열린다');
  r = await call('POST', '/api/class/write-topics', 'Bearer tok-parkjh', { action: 'image', id: P.id });
  g = await get(pu);
  ok(/\/2\?sig=/.test(r.j.item.image_url) && g.st === 404, '그림을 다시 만들면 옛 판 서명 주소는 안 열린다');
  g = await get(r.j.item.image_url);
  ok(g.st === 200, '(짝) 새 판 서명 주소는 열린다');
  r = await call('GET', '/api/class/write-topics', 'Bearer tok-parkjh');
  const mine = r.j.manage.find(x => x.id === P.id) || {};
  ok(/\?sig=/.test(mine.image_url || '') && (await get(mine.image_url)).st === 200, '내 목록(manage)의 그림 주소에도 서명이 붙고 열린다');
  ok(!r.j.items.some(x => x.id === P.id), '(짝) 공개 목록에는 여전히 안 나온다');
  g = await get('/api/class/write-topics/img/' + P.id + '/2?sig=' + encodeURIComponent(await W.signWtImgSig(P.id, 2, { ROOM_JWT_SECRET: 'some-other-secret' })));
  ok(g.st === 404, '다른 비밀키로 만든 서명은 안 열린다');

  // 직원 초안 → 공개 → 내리기
  r = await call('POST', '/api/class/write-topics', 'admin', { action: 'draft', title: '나의 보물' });
  const D = r.j.item;
  r = await call('POST', '/api/class/write-topics', 'admin', { action: 'image', id: D.id });
  const du = r.j.item.image_url;
  ok(/\?sig=/.test(du), '직원 초안 그림에도 서명');
  ok((await get(raw(du))).st === 404, '초안 그림은 로그인 없이 안 열린다');
  ok((await get(raw(du), 'admin')).st === 200, '(짝) 본사 쿠키(img 태그가 쿠키를 싣는다)면 열린다');
  ok((await get(raw(du), 'hq_t_lee')).st === 404, '다른 선생님 쿠키로는 안 열린다');
  r = await call('POST', '/api/class/write-topics', 'admin', { action: 'publish', id: D.id });
  ok(!/\?sig=/.test(r.j.item.image_url), '공개된 글감 그림 주소에는 서명을 안 붙인다');
  r = await call('GET', '/api/class/write-topics');
  const pubD = r.j.items.find(x => x.id === D.id) || {};
  g = await get(pubD.image_url || 'x');
  ok(g.st === 200 && /public/.test(g.res.headers.get('Cache-Control') || '') && /immutable/.test(g.res.headers.get('Cache-Control') || ''), '(짝) 공개 그림은 누구나 · 공개 캐시 그대로');
  r = await call('POST', '/api/class/write-topics', 'admin', { action: 'hide', id: D.id });
  g = await get(raw(du));
  ok(g.st === 404 && noStore(g), '내린 글감 그림은 다시 로그인 없이 안 열린다');
  ok((await get(raw(du), 'admin')).st === 200, '(짝) 내린 것도 본사는 본다');
  // 삭제 상태 — 서명이 있어도 안 연다
  const sigD = await W.signWtImgSig(D.id, 1, ENV);
  db.prepare("UPDATE write_topics SET status = 'deleted' WHERE id = ?").run(D.id);
  ok((await get(raw(du) + '?sig=' + encodeURIComponent(sigD))).st === 404 && (await get(raw(du), 'admin')).st === 404, '삭제된 글감 그림은 서명·본사여도 안 연다');
  // 비밀키가 없으면 — 서명은 못 만들되 막는 쪽(공개 캐시로 새지 않음)
  const ENV2 = { ...ENV }; delete ENV2.ROOM_JWT_SECRET;
  const req2 = new Request('https://mangoi.ai' + raw(pu));
  const g2 = await M.handleWriteTopicsApi(req2, new URL(req2.url), ENV2);
  ok(g2.status === 404, '비밀키가 없어도 비공개 그림은 안 연다(fail-closed)');
}
console.log('\n[G] 이어 쓰기(제안 5) · 내 작품 카드(제안 9) — 2026-10-26');
const GBLK = (() => { const a = HTML.indexOf('const AW_TOPIC_KEY'), b = HTML.indexOf('/* ═══ 📄 STEP 4'); return a > 0 && b > a ? HTML.slice(a, b) : ''; })();
ok(!!GBLK, '전제: 이어 쓰기·작품 카드 블록을 오려 냈다');
const gLine = re => (HTML.match(re) || [''])[0];
const G_DEPS = [gLine(/const AW_WORD_GOAL = [^\n]+\n/), gLine(/const AW_DAY_MS = [^\n]+\n/), gLine(/const awNorm = [^\n]+\n/),
  fn('function awWords(s)', 'awWords'), fn('function awWordCount(s)', 'awWordCount'), fn('function awGoal(lv)', 'awGoal'),
  fn('function escapeHtml(s)', 'escapeHtml'), cut(/const PIC_SCENES = \[[\s\S]*?\n    \];/, 'PIC_SCENES(G)')].join('\n');
const { runInNewContext } = await import('node:vm');
function gWorld(o = {}) {
  const store = Object.assign({}, o.store || {});
  const els = {}; const el = id => els[id] || (els[id] = { id, value: '', innerHTML: '', style: {}, scrollTop: 0, scrollIntoView() {}, focus() {} });
  if (o.text != null) el('text').value = o.text;
  const log = { toasts: [], confirms: 0, applied: [], cls: new Set(), alerts: 0 };
  const ctx = {
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { if (o.full) throw new Error('quota'); store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { getElementById: el, body: { classList: { add: c => log.cls.add(c), remove: c => log.cls.delete(c) } } },
    window: {}, Date, Math, JSON, Object, Array, String, Number, Set,
    getUid: () => o.uid || 'kim', awTr: (k, e) => (o.en ? e : k), awLangEn: () => !!o.en,
    showToast: m => log.toasts.push(m), alert: () => { log.alerts++; }, confirm: () => { log.confirms++; return !!o.yes; },
    closeSheet: () => log.cls.delete('sheet-open'), setTimeout: f => f(),
    awFindCustom: id => (o.items || []).find(x => Number(x.id) === Number(id)) || null,
    awThemeFromCustom: it => it ? { id: 'custom:' + it.id, icon: it.icon || '📌', ko: it.title_ko, en: it.title_en || it.title_ko, set: 'custom', img: it.image_url || '' } : null,
    goApplyTheme: t => { log.applied.push(t.id); ctx._goTheme = t; }, renderGoQuestions() {}, renderGoMemo() {}, goSave() {},
    updateCharCount() { log.updated = (log.updated || 0) + 1; },
    _goTheme: o.theme || null, _goAnswers: o.answers || {}, _lastResult: o.result || null, _lastDraft: o.draft || '', currentLevel: o.level || 'A1',
  };
  runInNewContext('var window = this.window;' + G_DEPS.replace(/^\s*const /gm, 'var ') + '\n' + GBLK.replace(/^\s*const /gm, 'var ') + '\nthis.__g = { awTopicWorkSave, awTopicWorkGet, awTopicMap, awMineSorted, awMineWorkLine, awPraise, awWorkFromResult, awWorkSave, awWorksRead, awWorkCardHtml };', ctx);
  return { ctx, g: ctx.__g, store, el, log, w: ctx.window };
}
const CUSTOM = { id: 'custom:31', set: 'custom', icon: '🐶', ko: '우리 집 강아지', en: 'My Dog', img: '' };
// ⑤ 저장 — 사람이 쓴 글·메모가 그 주제 몫으로 남는다
let GW = gWorld({ theme: CUSTOM, text: 'I have a dog. He is brown.', answers: { what: 'my dog', who: ' ' } });
GW.g.awTopicWorkSave();
const kimKey = 'mangoi_aiwrite_topicwork_v1:kim';
let tw = JSON.parse(GW.store[kimKey] || '{}')['custom:31'];
ok(tw && tw.t === 'I have a dog. He is brown.' && tw.a.what === 'my dog' && !('who' in tw.a), '5) 내 주제에 쓰던 글·메모를 그 주제 몫으로 남긴다(빈 메모는 뺀다)', JSON.stringify(tw));
ok(!GW.store['mangoi_aiwrite_topicwork_v1:lee'], '5) 계정마다 다른 키 — 다른 계정 칸은 건드리지 않는다');
GW = gWorld({ theme: { id: 'pic:park', set: 'scene', icon: '🖼', ko: '공원', en: 'Park' }, text: 'A park.' });
GW.g.awTopicWorkSave();
ok(!Object.keys(GW.store).length, '(짝) 그림·오늘의 글감 주제는 «주제별 글» 을 남기지 않는다(내 주제·선생님 글감만)');
// 칸을 비워도 마지막 글은 남는다
GW = gWorld({ theme: CUSTOM, text: '', answers: {}, store: { [kimKey]: JSON.stringify({ 'custom:31': { t: 'old text here', a: { what: 'x' }, ts: Date.now() - 1000 } }) } });
GW.g.awTopicWorkSave();
tw = JSON.parse(GW.store[kimKey])['custom:31'];
ok(tw && tw.t === 'old text here', '5) 칸을 비워도(«새로») 마지막에 쓴 글은 남는다', JSON.stringify(tw));
// 오래된 것은 안 보인다 · 30개 넘으면 오래된 것부터 지운다
const many = {}; for (let i = 0; i < 35; i++) many['custom:' + (100 + i)] = { t: 'w' + i, a: {}, ts: Date.now() - (i + 1) * 60000 };
many['custom:999'] = { t: 'ancient', a: {}, ts: Date.now() - 40 * 86400000 };
GW = gWorld({ theme: CUSTOM, text: 'new one', store: { [kimKey]: JSON.stringify(many) } });
GW.g.awTopicWorkSave();
const kept = JSON.parse(GW.store[kimKey]);
ok(Object.keys(kept).length === 30 && kept['custom:31'] && !kept['custom:999'] && !kept['custom:134'], '5) 30개까지 · 30일 지난 것은 지운다(최근 것이 남는다)', String(Object.keys(kept).length));
ok(GW.g.awTopicWorkGet('custom:999') === null, '5) 30일 지난 기록은 «이어 쓰기» 로 안 나온다');
// 순서 — 이 기기에서 최근에 쓴 것이 위
GW = gWorld({ store: { [kimKey]: JSON.stringify({ 'custom:2': { t: 'a b c', a: {}, ts: Date.now() } }) } });
const sorted = GW.g.awMineSorted([{ id: 1, updated_at: Date.now() - 5000 }, { id: 2, updated_at: 1 }, { id: 3, updated_at: Date.now() - 1000 }]);
ok(sorted.map(x => x.id).join(',') === '2,3,1', '5) «내가 만든 주제» 는 최근에 쓴 순(이 기기 기록 · 서버 수정 중 늦은 쪽)', sorted.map(x => x.id).join(','));
ok(/3단어/.test(GW.g.awMineWorkLine(2)) && GW.g.awMineWorkLine(1) === '', '5) 쓰던 글이 있으면 «N단어 · 날짜», 없으면 아무것도 안 붙인다');
// 이어 쓰기 — 빈 칸이면 바로 넣고, 다른 글이 있으면 묻는다
const ITEMS = [{ id: 31, title_ko: '우리 집 강아지', title_en: 'My Dog', icon: '🐶' }];
const saved31 = JSON.stringify({ 'custom:31': { t: 'I have a dog.', a: { what: 'my dog' }, ts: Date.now() } });
GW = gWorld({ items: ITEMS, text: '', store: { [kimKey]: saved31 } });
GW.w.wtResume(31);
ok(GW.log.applied[0] === 'custom:31' && GW.el('text').value === 'I have a dog.' && GW.ctx._goAnswers.what === 'my dog' && GW.log.confirms === 0,
  '5) «이어 쓰기» → 그 주제를 고르고 메모·글을 되살린다(빈 칸이면 묻지 않음)');
GW = gWorld({ items: ITEMS, text: 'something else', store: { [kimKey]: saved31 }, yes: false });
GW.w.wtResume(31);
ok(GW.log.confirms === 1 && GW.el('text').value === 'something else', '5) 칸에 다른 글이 있으면 묻고, «아니요» 면 지금 글을 지킨다');
GW = gWorld({ items: ITEMS, text: 'something else', store: { [kimKey]: saved31 }, yes: true });
GW.w.wtResume(31);
ok(GW.el('text').value === 'I have a dog.' && GW.log.updated >= 1, '(짝) «예» 면 쓰던 글로 바꾸고 단어 수 줄도 다시 그린다');
GW = gWorld({ items: ITEMS, text: 'I have a dog.', store: { [kimKey]: saved31 } });
GW.w.wtResume(31);
ok(GW.log.confirms === 0, '5) 칸의 글이 이미 같으면 묻지 않는다');
GW = gWorld({ items: ITEMS, text: '', store: {} });
GW.w.wtResume(31);
ok(GW.log.applied[0] === 'custom:31' && GW.el('text').value === '' && GW.log.toasts.some(t => /쓰기 시작/.test(t)), '(짝) 기록이 없으면 주제만 고르고 «쓰기 시작»');
// 화면 배선
const rpG = blockFrom(HTML, 'function wtRenderPanel()');
ok(/awMineSorted\(/.test(rpG) && /wtResume\(\$\{Number\(x\.id\)\}\)/.test(rpG) && /wtOpen\(\$\{Number\(x\.id\)\}\)/.test(rpG), '5) 목록이 최근 순 · «이어 쓰기» 와 «불러오기» 를 함께 그린다');
ok(/awTopicWorkSave\(\)/.test(blockFrom(HTML, 'function awDraftSave()')) && /awTopicWorkSave\(\)/.test(blockFrom(HTML, 'window.goInput = function(k, v)')), '5) 저장은 사람이 글·메모를 쓸 때만(awDraftSave · goInput)');
ok(!/awTopicWorkSave/.test(blockFrom(HTML, 'function goApplyTheme(t, toggle, quiet)')), '(짝) 주제를 바꾸는 순간에는 저장하지 않는다 — 앞 주제 글을 새 주제 몫으로 적지 않는다');

// ⑨ 작품 카드
const RES = { score: 88, level: 'A1', corrected: 'I have a brown dog.', issues: [], mission_used: ['dog', 'brown'], reply: 'What a cute dog!' };
GW = gWorld({});
const pr = GW.g.awPraise(RES, 'I have a brown dog. He is very cute and he likes to run in the park every day with me', 'A1');
ok(pr.length >= 2 && pr.length <= 3 && /20단어|21단어|2\d단어/.test(pr[0].ko) && /목표/.test(pr[0].ko) && pr.some(p => /미션 단어 2개/.test(p.ko)), '9) 잘한 점은 잰 사실(단어 수·목표·미션 단어) — 최대 3줄', JSON.stringify(pr.map(p => p.ko)));
ok(pr.every(p => p.en && !/[가-힣]/.test(p.en)), '9) 잘한 점은 영어 짝이 있다');
const pr0 = GW.g.awPraise({ score: 30, issues: [{}] }, '', 'A1');
ok(pr0.length === 1 && /끝까지/.test(pr0[0].ko), '(짝) 잴 것이 없으면 «끝까지 써 보았어요» 한 줄 — 지어내지 않는다');
const prLow = GW.g.awPraise({ score: 50, issues: [{}] }, 'one two three', 'B1');
ok(!prLow.some(p => /목표/.test(p.ko) || /점수/.test(p.ko)), '(짝) 목표 못 미침·낮은 점수는 «잘한 점» 으로 쓰지 않는다', JSON.stringify(prLow.map(p => p.ko)));
const wk = GW.g.awWorkFromResult(RES, 'I have a brown dog.', CUSTOM, 'A1');
ok(wk.text === 'I have a brown dog.' && wk.en === 'My Dog' && wk.icon === '🐶' && wk.score === 88, '9) 카드 = 주제 아이콘·영어 제목·완성 글·점수');
const sceneT = { id: 'pic:' + (GW.ctx.PIC_SCENES[0] || {}).img, set: 'scene', icon: '🖼', ko: 'a', en: 'b' };
ok(/write-scenes|\.webp|posters?\//.test(GW.g.awWorkFromResult(RES, 'x', sceneT, 'A1').img), '9) 그림 주제는 그 그림을 카드에 싣는다');
// 저장 — 같은 글은 한 장 · 최대 20장 · 계정별
let items = GW.g.awWorkSave(wk); items = GW.g.awWorkSave(Object.assign({}, wk, { id: 2, text: 'i have a  brown dog.' }));
ok(items.length === 1, '9) 같은 글을 다시 저장하면 쌓지 않고 한 장으로');
for (let i = 0; i < 25; i++) GW.g.awWorkSave(Object.assign({}, wk, { id: 10 + i, text: 'work number ' + i }));
ok(GW.g.awWorksRead().length === 20 && GW.g.awWorksRead()[0].text === 'work number 24', '9) 최대 20장 · 최근 것이 맨 앞');
ok(!!GW.store['mangoi_aiwrite_works_v1:kim'] && !GW.store['mangoi_aiwrite_works_v1:lee'], '9) 작품도 계정마다 따로');
// 카드 그리기 — 글자는 이스케이프 · 잘한 점·답장이 들어간다
const evil = Object.assign({}, wk, { text: '<img src=x onerror=alert(1)>', reply: '<b>hi</b>' });
const card = GW.g.awWorkCardHtml(evil, [evil], 0);
ok(!/<img src=x/.test(card) && /&lt;img src=x/.test(card) && /잘한 점/.test(card) && /망고 선생님/.test(card) && /window\.print\(\)/.test(card), '9) 카드는 글을 이스케이프해 그리고 «잘한 점» · 답장 · 인쇄 버튼이 있다');
const cardEn = gWorld({ en: true }).g.awWorkCardHtml(wk, [wk, wk], 1);
ok(/What I did well/.test(cardEn) && /Print/.test(cardEn) && /awShowWork\(0\)/.test(cardEn) && /wk-chip on/.test(cardEn), '9) 영어 화면은 영어로 · 여러 장이면 고르는 줄');
// 열기
GW = gWorld({ result: RES, draft: 'I have a brown dog.', theme: CUSTOM });
GW.w.openWorkCard();
ok(GW.log.cls.has('sheet-open') && /My Dog/.test(GW.el('sheetModal').innerHTML) && GW.g.awWorksRead().length === 1 && GW.log.toasts.some(t => /저장했어요/.test(t)), '9) «작품 카드로 저장» → 저장하고 카드를 연다');
GW = gWorld({ result: null });
GW.w.openWorkCard();
ok(GW.log.alerts === 1 && !GW.log.cls.has('sheet-open'), '(짝) 첨삭 전이면 열지 않고 안내만');
GW = gWorld({ result: RES, draft: 'x', theme: CUSTOM, full: true });
try { GW.w.openWorkCard(); } catch (e) { GW.log.threw = String(e); }
ok(GW.log.toasts.some(t => /저장하지 못했어요/.test(t)) && GW.log.cls.has('sheet-open') && !GW.log.threw, '9) 저장이 막힌 기기면 «못 했다» 고 말하고 카드는 그래도 연다(인쇄할 수 있게)');
ok(/onclick="openWorkCard\(\)"/.test(HTML) && /onclick="openWorks\(\)"/.test(HTML), '9) 첨삭 결과에 «작품 카드로 저장», 일기 머리에 «내 작품» 버튼');
ok(/\.wk-list \{ display: none; \}/.test(style), '9) 인쇄할 때는 카드 고르는 줄을 감춘다');

console.log('\n⑩ 🔒 내 작품 카드 — 낡은 서명 그림 주소를 새로 고치고, 못 열면 아이콘으로 (2026-10-26)');
{
  const fsrc = blockFrom(HTML, 'function awFreshImg(u)');
  ok(!!fsrc, '전제: awFreshImg 를 오려 냈다');
  let fresh = null;
  try { fresh = new Function('awFindCustom', fsrc + '; return awFreshImg;')(id => (String(id) === '5' ? { image_url: '/api/class/write-topics/img/5/2?sig=NEW' } : null)); } catch (e) { fresh = null; }
  ok(fresh && fresh('/api/class/write-topics/img/5/1?sig=OLD') === '/api/class/write-topics/img/5/2?sig=NEW', '목록에 같은 글감이 있으면 지금 받은(새 서명) 주소로 그린다');
  ok(fresh && fresh('/api/class/write-topics/img/9/1?sig=OLD') === '/api/class/write-topics/img/9/1?sig=OLD', '(짝) 목록에 없으면 저장된 주소 그대로');
  ok(fresh && fresh('/img/write-scenes/park.webp') === '/img/write-scenes/park.webp' && fresh('') === '', '(짝) 글감 그림이 아닌 주소·빈 값은 건드리지 않는다');
  const card = blockFrom(HTML, 'function awWorkCardHtml(w, items, idx)');
  ok(/src="\$\{escapeHtml\(awFreshImg\(w\.img\)\)\}"/.test(card), '작품 카드는 awFreshImg 를 거쳐 그린다');
  ok(/onerror="this\.nextElementSibling\.hidden=false;this\.remove\(\)"><div class="wk-icon" hidden>/.test(card), '그림이 안 열리면(만료·삭제) 옆 아이콘을 보인다 — 빈 그림 대신');
  ok(!/onerror="[^"]*\$\{/.test(card), '(짝) onerror 안에 값을 끼워 넣지 않는다(따옴표 깨짐 방지)');
  ok(!/\.wk-icon \{[^}]*display/.test(style), '.wk-icon 에 display 를 정하지 않는다([hidden] 이 먹게)');
}


console.log('\n[H] 숙제·마감일(제안 6) · 칭찬 먼저(제안 7) · 안심 표시·부드러운 거르기(제안 8) — 2026-10-26');
{
  // ── 순수 판정
  ok(M.normalizeDueDate('2026-11-03') === '2026-11-03' && M.normalizeDueDate('') === '' && M.normalizeDueDate(null) === '', '마감일: 진짜 날짜는 그대로 · 비우면 «숙제 아님»');
  for (const bad of ['2026-02-30', '2026-13-01', '1999-01-01', '2026/11/03', '11-03', 'x', '2026-11-3'])
    ok(M.normalizeDueDate(bad) === null, `(짝) 엉터리 마감일 «${bad}» → null(저장 거절)`);
  const ROWK = { created_by: 'hq_t_kim' };
  ok(M.canSeeSubmits(ACTORS.admin, ROWK) === true && M.canSeeSubmits(ACTORS.hq_t_kim, ROWK) === true, '제출 확인: 본사·그 글감을 만든 선생님은 본다');
  ok(M.canSeeSubmits(ACTORS.hq_t_lee, ROWK) === false, '(짝) 다른 선생님은 못 본다(남의 반 학생 이름)');
  ok(M.canSeeSubmits({ username: 'gn', isTeacher: false, ownOnly: true }, { created_by: 'gn' }) === false, '(짝) 지사·대리점은 이름 목록을 못 본다(학생 이름이 지사 밖으로 안 나가게 — 숫자만)');
  ok(M.canSeeSubmits({ username: 'stu:kimsu', isTeacher: false, student: true }, { created_by: 'stu:kimsu' }) === false && M.canSeeSubmits(ACTORS.admin, { created_by: 'stu:kimsu' }) === false, '(짝) 학생·학생 주제에는 제출 목록이 없다');
  ok(M.canSeeSubmits(null, ROWK) === false && M.canSeeSubmits(ACTORS.admin, null) === false, '(짝) 모르면 안 보인다');
  for (const t of ['씨발', '씨 발 진짜', 's.h.i.t', 'fuck you'])          ok(M.topicUnsafeKind(t) === 'swear', `거르기: «${t}» → 욕설`);
  for (const t of ['자살하고 싶어', '죽고 싶어', '죽 고 싶 어'])         ok(M.topicUnsafeKind(t) === 'hurt', `거르기: «${t}» → 마음이 힘든 말`);
  for (const t of ['우리집 010-1234-5678', 'me@mail.com', '101동 1203호', '900101-1234567']) ok(M.topicUnsafeKind(t) === 'private', `거르기: «${t}» → 개인정보`);
  for (const t of ['야한 이야기', 'sex', '19금 영화'])                  ok(M.topicUnsafeKind(t) === 'adult', `거르기: «${t}» → 어른 내용`);
  for (const t of ['우리 집 강아지', '물병 신발', '출시 발표', '시발점에서 출발', '개 색깔', 'Moby Dick', 'murder mystery book', 'Sussex trip', '2026 10 26 소풍', '불이 꺼져요', 'Fukuoka 여행', '나의 첫 캠핑'])
    ok(M.topicUnsafeKind(t) === '', `(짝) 멀쩡한 주제 «${t}» 는 안 거른다`);
  ok(M.topicUnsafeKind('강아지', '', null, ['a', '씨발']) === 'swear', '여러 칸 중 하나만 걸려도 거른다(질문·단어까지)');
  ok(Object.values(M.WT_UNSAFE_MSG).every(m => / \/ /.test(m) && /[가-힣]/.test(m)) && /선생님|부모님/.test(M.WT_UNSAFE_MSG.hurt), '거르기 문구는 한/영 · 힘든 말에는 «선생님·부모님께 이야기» 를 권한다');

  // ── 진짜 SQLite 로 라우트
  db.exec(`CREATE TABLE IF NOT EXISTS ai_writing_corrections (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, score INTEGER, created_at INTEGER, topic_id INTEGER)`);
  db.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT)`);
  db.prepare(`INSERT OR IGNORE INTO students_erp VALUES ('kimsu','김수아'),('leeyu','이유나')`).run();
  const logsBefore = db.prepare('SELECT COUNT(*) n FROM write_topic_gen_log WHERE username = ?').get('stu:leeyu').n;
  r = await call('POST', '/api/class/write-topics', 'Bearer tok-leeyu', { action: 'draft', title: '씨발 진짜' });
  ok(r.st === 400 && r.j.error === 'unsafe_topic' && r.j.kind === 'swear' && / \/ /.test(r.j.message), '8) 학생이 욕설 주제 → 400 unsafe_topic(부드러운 한/영 문구)');
  ok(db.prepare('SELECT COUNT(*) n FROM write_topic_gen_log WHERE username = ?').get('stu:leeyu').n === logsBefore, '8) 거른 주제는 AI 를 안 부르고 하루 횟수도 안 쓴다');
  r = await call('POST', '/api/class/write-topics', 'Bearer tok-leeyu', { action: 'draft', title: '우리 집 강아지' });
  ok(r.st === 200 && r.j.ok, '(짝) 멀쩡한 학생 주제는 그대로 만든다');
  const SL = r.j.item;
  r = await call('POST', '/api/class/write-topics', 'Bearer tok-leeyu', { action: 'save', id: SL.id, open: 'My phone is 010-1234-5678.' });
  ok(r.st === 400 && r.j.kind === 'private', '8) 학생 저장도 거른다(첫 문장에 전화번호)');
  r = await call('POST', '/api/class/write-topics', 'Bearer tok-leeyu', { action: 'save', id: SL.id, due_date: '2026-11-03', title_ko: '우리 집 강아지 (수정)' });
  ok(r.st === 200 && !r.j.item.due_date, '(짝) 학생이 보낸 마감일은 무시한다(자기 주제는 숙제가 아니다)');
  r = await call('POST', '/api/class/write-topics', 'hq_t_kim', { action: 'draft', title: '씨발 진짜' });
  ok(r.st === 200, '(짝) 거르기는 학생에게만 — 선생님 주제는 막지 않는다(학생 앞에 나가기 전 선생님이 본다)');
  r = await call('POST', '/api/class/write-topics', 'hq_t_kim', { action: 'draft', title: '이번 주 숙제 — 나의 주말' });
  const HW = r.j.item;
  r = await call('POST', '/api/class/write-topics', 'hq_t_kim', { action: 'save', id: HW.id, due_date: '2026-02-30' });
  ok(r.st === 400 && r.j.error === 'bad_due_date', '6) 엉터리 마감일 저장 → 400 bad_due_date');
  r = await call('POST', '/api/class/write-topics', 'hq_t_kim', { action: 'save', id: HW.id, due_date: '2026-11-03' });
  ok(r.st === 200 && r.j.item.due_date === '2026-11-03', '6) 선생님이 마감일을 저장한다');
  await call('POST', '/api/class/write-topics', 'hq_t_kim', { action: 'publish', id: HW.id });
  r = await call('GET', '/api/class/write-topics');
  ok((r.j.items.find(x => x.id === HW.id) || {}).due_date === '2026-11-03', '6) 학생 목록에 마감일이 실린다');
  // 제출 = 그 주제로 첨삭받은 글(topic_id)
  const insC = db.prepare('INSERT INTO ai_writing_corrections (student_uid, score, created_at, topic_id) VALUES (?, ?, ?, ?)');
  insC.run('kimsu', 70, Date.now() - 3600e3, HW.id); insC.run('kimsu', 88, Date.now(), HW.id); insC.run('leeyu', 60, Date.now(), HW.id); insC.run('kimsu', 90, Date.now(), null);
  r = await call('GET', '/api/class/write-topics', 'Bearer tok-kimsu');
  ok(Array.isArray(r.j.done_ids) && r.j.done_ids.includes(HW.id), '6) 학생 GET → 낸 숙제 번호(done_ids)');
  r = await call('GET', '/api/class/write-topics', 'Bearer tok-nobody');
  ok(Array.isArray(r.j.done_ids) && r.j.done_ids.length === 0, '(짝) 안 낸 학생 → 빈 목록(남의 제출이 안 섞인다)');
  r = await call('GET', '/api/class/write-topics', 'hq_t_kim');
  ok((r.j.manage.find(x => x.id === HW.id) || {}).submit_count === 2, '6) 선생님 «내 글감» 에 제출 학생 수(사람 수 — 횟수 아님)', JSON.stringify((r.j.manage.find(x => x.id === HW.id) || {}).submit_count));
  r = await call('GET', '/api/class/write-topics?submits=' + HW.id, 'hq_t_kim');
  const subs = (r.j && r.j.items) || [];
  const kim = subs.find(x => x.uid === 'kimsu') || {};
  ok(r.st === 200 && subs.length === 2 && kim.n === 2 && kim.best === 88 && kim.name === '김수아', '6) 제출 확인 → 학생마다 한 줄(횟수·최고 점수·이름)', JSON.stringify(subs));
  ok(/no-store/.test(r.res.headers.get('Cache-Control') || ''), '6) 제출 목록은 캐시하지 않는다(학생 이름)');
  r = await call('GET', '/api/class/write-topics?submits=' + HW.id, 'hq_t_lee');
  ok(r.st === 403 && r.j.error === 'not_allowed' && / \/ /.test(r.j.message), '(짝) 다른 선생님 → 403(한/영)');
  r = await call('GET', '/api/class/write-topics?submits=' + HW.id, 'Bearer tok-kimsu');
  ok(r.st === 403 || r.st === 401, '(짝) 학생은 제출 목록을 못 연다');
  r = await call('GET', '/api/class/write-topics?submits=' + HW.id);
  ok(r.st === 401 || r.st === 403, '(짝) 로그인 없이 → 못 연다');
  r = await call('GET', '/api/class/write-topics?submits=' + HW.id, 'admin');
  ok(r.st === 200 && (r.j.items || []).length === 2, '본사도 본다');
  // 첨삭 기록 쪽 배선(api-ai.ts) — topic_id 를 적고, 칸이 없으면 옛 모양으로 다시 적는다
  const AIS = rd(resolve(SRC, 'api-ai.ts'));
  ok(/ADD COLUMN topic_id INTEGER/.test(AIS) && /Number\(b\.topic_id\)/.test(AIS), '6) 첨삭 기록에 topic_id 칸 · 화면이 보낸 번호를 숫자로만 받는다');
  const insAt = AIS.indexOf('INSERT INTO ai_writing_corrections');
  const insBlk = AIS.slice(insAt, AIS.indexOf('INSERT INTO ai_writing_corrections', insAt + 10) + 400);
  ok(/topic_id/.test(insBlk) && AIS.split('INSERT INTO ai_writing_corrections').length - 1 >= 2, '(짝) topic_id 로 못 적으면 그 칸 없이 한 번 더 적는다(기록이 통째로 사라지지 않게)');

  // ── 화면 — 숙제 묶음·꼬리표·안내 줄
  const HWI = { id: 21, title_ko: '나의 주말', title_en: 'My weekend', icon: '🏖', due_date: '2099-12-31', questions: [], words: [], status: 'published' };
  const LATE = { id: 22, title_ko: '나의 꿈', title_en: 'My dream', icon: '🌠', due_date: '2020-01-02', questions: [], words: [] };
  const PLAIN = { id: 23, title_ko: '그냥 글감', title_en: 'Just a topic', icon: '📝', questions: [], words: [] };
  let hw = mk({ picIdx: 0, items: [HWI, LATE, PLAIN], role: 'student' });
  hw.setDone([], true);
  ok(hw.awHwItems().map(x => x.id).join(',') === '21,22', '6) 숙제 = 마감일 있는 글감만 · 할 것 먼저, 마감 지난 것 다음', hw.awHwItems().map(x => x.id).join(','));
  ok(hw.awHwLabel(HWI).ko === '12/31까지' && hw.awHwLabel(LATE).ko === '마감 지남(1/2)', '6) 꼬리표: «M/D까지» · «마감 지남(M/D)»');
  hw.awBuildPicker();
  const grp = hw.picChoice.children.map(g => g.label).join('|');
  ok(/^📅 숙제/.test(grp), '6) 숙제는 같은 목록 맨 위 묶음(새 고르는 곳을 안 만든다)', grp);
  const hwOpts = (hw.picChoice.children[0] || { children: [] }).children.map(o => o.value);
  ok(hwOpts.includes('custom:21') && !hw.picChoice.children.slice(1).some(g => g.children.some(o => o.value === 'custom:21')), '(짝) 숙제 글감은 «선생님 글감» 묶음에 두 번 안 나온다');
  ok(hw.picChoice.children.some(g => g.children.some(o => o.value === 'custom:23')), '(짝) 마감일 없는 글감은 원래 묶음에 그대로');
  hw.awRenderHwNote();
  ok(hw.hwNote.hidden === false && /숙제 2개/.test(hw.hwNote.textContent) && /나의 주말/.test(hw.hwNote.textContent) && /제출/.test(hw.hwNote.textContent), '6) 학생 안내 줄: 숙제 개수 · 가장 급한 것 · 어떻게 내는지', hw.hwNote.textContent);
  hw.setDone([21, 22], true); hw.awRenderHwNote();
  ok(/모두 냈어요/.test(hw.hwNote.textContent) && /done/.test(hw.hwNote.className) && hw.awHwLabel(HWI).ko === '✓ 제출함', '6) 다 내면 «모두 냈어요» · 꼬리표 ✓ 제출함');
  hw = mk({ picIdx: 0, items: [LATE], role: 'student' });
  hw.setDone([], false);
  ok(hw.awHwState(LATE) === 'open' && !/지남/.test(hw.awHwLabel(LATE).ko), '(짝) 낸 것을 못 받았으면(모름) «마감 지남» 이라 말하지 않는다');
  hw = mk({ picIdx: 0, items: [HWI], role: '' });
  hw.awRenderHwNote();
  ok(hw.hwNote.hidden === true, '(짝) 선생님 화면에는 학생 안내 줄이 없다');
  ok(/제출 3명/.test(hw.awHwLabel(Object.assign({}, HWI, { submit_count: 3 })).ko) && !/제출 \d/.test(hw.awHwLabel(HWI).ko), '6) 선생님 꼬리표에 제출 N명 · 숫자를 모르면 안 붙인다(0으로 지어내지 않음)');
  hw = mk({ picIdx: 0, items: [], role: 'student' });
  hw.awRenderHwNote();
  ok(hw.hwNote.hidden === true, '(짝) 숙제가 없으면 안내 줄을 안 그린다');
  // 첨삭 → «냈어요»
  hw = mk({ picIdx: 0, items: [HWI, PLAIN], role: 'student' }); hw.setDone([], true);
  hw.setTheme({ id: 'custom:21', set: 'custom' });
  ok(hw.awTopicIdNow() === 21, '6) 지금 주제 번호를 첨삭 요청에 싣는다');
  hw.setTheme({ id: 'pic:park.webp', set: 'scene' });
  ok(hw.awTopicIdNow() === null, '(짝) 그림·오늘의 글감은 번호가 없다(null)');
  hw.awMarkHwDone(21);
  ok(hw.awHwState(HWI) === 'done' && hw.toasts.some(t => /냈어요/.test(t)), '6) 첨삭이 끝나면 그 숙제를 ✓ 로 · 토스트');
  hw.awMarkHwDone(23);
  ok(hw.toasts.length === 1, '(짝) 숙제가 아닌 글감은 아무 말도 안 한다');
  const sub = blockFrom(HTML, 'async function submitWrite()') || HTML;
  ok(/topic_id: awTopicIdNow\(\)/.test(HTML) && /awMarkHwDone\(awTopicIdNow\(\)\)/.test(HTML), '6) 첨삭 요청에 topic_id · 성공하면 «냈어요» 표시');
  ok(/id="wtDue"/.test(HTML) && /wtDueBox\.hidden = wtIsStudent\(\)|wtDueBox'\)\.hidden = wtIsStudent\(\)/.test(HTML), '6) 마감일 칸은 선생님에게만');
  ok(/\.wt-f\[hidden\] \{ display: none !important; \}/.test(HTML), '6) 학생 화면에서 마감일 칸이 실제로 감춰진다(.wt-f 의 display 가 [hidden] 을 이기는 함정)');
  ok(/wtSubmits\(/.test(HTML) && /\?submits=/.test(HTML), '6) «📋 제출 확인» 이 제출 목록을 연다');

  // ── 칭찬 먼저(7)
  const rr = blockFrom(HTML, 'function renderResult(d)');
  const pAt = rr.indexOf('${praiseHtml}'), hAt = rr.indexOf('result-head');
  ok(pAt > 0 && hAt > 0 && pAt < hAt, '7) «잘한 점» 이 점수·고칠 곳보다 위', `${pAt} / ${hAt}`);
  ok(/awPraise\(d,/.test(rr) && /escapeHtml\(awTr\(p\.ko, p\.en\)\)/.test(rr) && /data-en="\$\{escapeHtml\(p\.en\)\}"/.test(rr), '7) 칭찬은 awPraise(잰 사실) · 이스케이프 · 한/영 속성');
  ok(!/⚠️ 발견된 점/.test(rr) && /💡 이렇게 고치면 더 좋아요/.test(rr), '7) «⚠️ 발견된 점» 을 «💡 이렇게 고치면 더 좋아요» 로');

  // ── 안심 표시(8)
  ok(/🔒 나만 보여요/.test((HTML.match(/const AW_GROUPS = \[[\s\S]*?\n    \];/) || [''])[0]), '8) 목록 «내 주제» 묶음 이름에 «🔒 나만 보여요»');
  ok(/code === 'unsafe_topic'[\s\S]{0,60}'warn'/.test(blockFrom(HTML, 'function wtFail(e, actKo, actEn)')), '8) 걸러진 주제는 빨간 오류가 아니라 부드러운 안내(warn)');
}

done();
