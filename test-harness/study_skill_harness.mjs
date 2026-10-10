// study_skill_harness.mjs — «한 것» 과 «해낸 것» 따로 (2026-10-10, 경쟁사 분석 적용 ④)
//   정본 src/study-vs-skill.ts 를 «실제로» 돌린다(타입 제거 + 진짜 student-alias·fix-cards·english-only, 진짜 SQLite 를 D1 모양으로).
//   화면(parent.html pdSkillHtml)은 오려 내 실행한다. 「센다」 옆에 「안 센다」를 짝으로 둔다.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
const PUB = resolve(ROOT, 'cloudflare-deploy/public');
const rd = p => readFileSync(p, 'utf8');
const S_FILE = process.env.SVS_SRC || resolve(SRC, 'study-vs-skill.ts');
const API_S = process.env.SVS_API_S || resolve(SRC, 'api-students.ts');
const UI_P = process.env.SVS_UI_P || resolve(PUB, 'parent.html');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function bodyFrom(s, from) {
  const i = s.indexOf('{', from); if (i < 0) return '';
  let d = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return s.slice(i, k + 1); }
  }
  return '';
}
const asData = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
function inject(code, ns) {
  return code.replace(/^import\s*\{([^}]*)\}\s*from\s*'[^']+';?/gm, (m, names) =>
    names.split(',').map(n => n.trim().replace(/^type\s+/, '')).filter(Boolean)
      .map(n => `const ${n} = globalThis.${ns}.${n};`).join('\n'));
}
const DAY = 86400000;

/* ── 정본 로드 ── */
let M = null;
try {
  const EO = await import(asData(stripTypeScriptTypes(rd(resolve(SRC, 'english-only.ts')))));
  globalThis.__FC = { ...EO };
  const FC = await import(asData(inject(stripTypeScriptTypes(rd(resolve(SRC, 'fix-cards.ts'))), '__FC')));
  const SA = await import(asData(stripTypeScriptTypes(rd(resolve(SRC, 'student-alias.ts')))));
  globalThis.__SV = { ...FC, ...SA };
  M = await import(asData(inject(stripTypeScriptTypes(rd(S_FILE)), '__SV')));
} catch (e) { console.log('  (정본 로드 실패: ' + e.message + ')'); }

console.log('① 순수 함수');
ok('전제: 정본을 불러왔다', !!(M && M.loadStudyVsSkill && M.countSaidRight));
if (M) {
  const c = M.countSaidRight([{ best_accuracy: 80 }, { best_accuracy: 79.9 }, { best_accuracy: null }, { best_accuracy: 95 }]);
  ok('정확도 80 이상만 «바르게 말함»(경계 80 포함 · 79.9·null 제외)', c.right === 2 && c.total === 4, JSON.stringify(c));
  ok('짝: 0 점은 «말함» 이 아니다', M.countSaidRight([{ best_accuracy: 0 }]).right === 0);
  ok('카드가 없으면 0/0', JSON.stringify(M.countSaidRight([])) === '{"right":0,"total":0}' && M.countSaidRight(null).total === 0);
}

/* ── ② 진짜 SQLite ── */
function d1(db, failOn) {
  return {
    prepare(sql) {
      if (failOn && failOn.test(sql)) throw new Error('no such table (simulated)');
      const st = db.prepare(sql); let args = [];
      const o = { bind(...a) { args = a; return o; },
        async all() { return { results: st.all(...args) }; },
        async first() { return st.get(...args) ?? null; },
        async run() { const r = st.run(...args); return { meta: { changes: Number(r.changes) } }; } };
      return o;
    },
  };
}
console.log('② 세기 — 진짜 SQLite');
if (M) {
  const now = 900 * DAY;
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, username TEXT);
    CREATE TABLE attendance (id INTEGER PRIMARY KEY, user_id TEXT, account_uid TEXT, room_id TEXT, joined_at INTEGER, last_seen_at INTEGER);
    CREATE TABLE ai_friend_chats (id INTEGER PRIMARY KEY, student_uid TEXT, role TEXT, created_at INTEGER);
    CREATE TABLE warmup_session_log (id INTEGER PRIMARY KEY, user_id TEXT, started_at INTEGER);
    CREATE TABLE vocabulary (id INTEGER PRIMARY KEY, user_id TEXT, word TEXT, created_at INTEGER);
    CREATE TABLE vocab_review_log (id INTEGER PRIMARY KEY, user_id TEXT, vocab_id INTEGER, correct INTEGER, reviewed_at INTEGER);
    CREATE TABLE ai_lesson_reports (id INTEGER PRIMARY KEY, student_uid TEXT, grammar_errors TEXT, lesson_title TEXT, created_at INTEGER);
    CREATE TABLE warmup_fix_log (id INTEGER PRIMARY KEY, user_id TEXT, was TEXT, fixed TEXT, why_ko TEXT, lang TEXT, created_at INTEGER);
    CREATE TABLE voice_coaching (id INTEGER PRIMARY KEY, student_uid TEXT, target_text TEXT, accuracy_score REAL, created_at INTEGER);`);
  const se = db.prepare('INSERT INTO students_erp VALUES (?,?,?)');
  se.run('kim', '김민', 'kim'); se.run('mangoai_kim', '김민', 'x'); se.run('lee', '이수', 'lee');
  const at = db.prepare('INSERT INTO attendance (user_id, account_uid, room_id, joined_at, last_seen_at) VALUES (?,?,?,?,?)');
  at.run('u_dev1', 'kim', 'class-1-x', now - 2 * DAY, now - 2 * DAY + 600000);       // 실접속(기기번호 + 계정)
  at.run('u_dev2', 'kim', 'class-1-y', now - 2 * DAY + 3600000, now - 2 * DAY + 4000000);  // 같은 날 두 번 → 1일
  at.run('kim', null, 'c24-99', now - 3 * DAY, 0);                                    // 카페24 예약 씨앗 → 안 셈
  at.run('mangoai_kim', 'mangoai_kim', 'class-2-z', now - 5 * DAY, now - 5 * DAY + 1); // 쌍둥이 계정 → 셈
  at.run('u_dev3', 'kim', 'class-3', now - 40 * DAY, now - 40 * DAY + 1);             // 30일 밖
  at.run('u_x', 'lee', 'class-4', now - 1 * DAY, now - 1 * DAY + 1);                  // 남
  const fc = db.prepare('INSERT INTO ai_friend_chats (student_uid, role, created_at) VALUES (?,?,?)');
  fc.run('kim', 'user', now - DAY); fc.run('kim', 'assistant', now - DAY); fc.run('kim', 'user', now - 31 * DAY); fc.run('Kim', 'user', now - DAY);
  db.prepare('INSERT INTO warmup_session_log (user_id, started_at) VALUES (?,?)').run('kim', now - DAY);
  const vo = db.prepare('INSERT INTO vocabulary (id, user_id, word, created_at) VALUES (?,?,?,?)');
  vo.run(1, 'kim', 'apple', now - 20 * DAY); vo.run(2, 'kim', 'banana', now - 3 * DAY); vo.run(3, 'kim', 'cherry', now - 20 * DAY);
  vo.run(4, 'lee', 'durian', now - 20 * DAY); vo.run(5, 'kim', 'elder', now - 20 * DAY);
  const rv = db.prepare('INSERT INTO vocab_review_log (user_id, vocab_id, correct, reviewed_at) VALUES (?,?,?,?)');
  rv.run('kim', 1, 1, now - 2 * DAY);   // 넣고 18일 뒤 맞힘 → 기억
  rv.run('kim', 1, 1, now - DAY);       // 같은 단어 또 → 한 번만
  rv.run('kim', 2, 1, now - DAY);       // 넣고 2일 뒤 → 기억 아님
  rv.run('kim', 3, 0, now - DAY);       // 틀림 → 아님
  rv.run('kim', 4, 1, now - DAY);       // 남의 단어 id → 아님
  rv.run('kim', 5, 1, now - 12 * DAY);  // 넣고 8일 뒤 맞힘 → 기억
  db.prepare('INSERT INTO warmup_fix_log (user_id, was, fixed, why_ko, lang, created_at) VALUES (?,?,?,?,?,?)')
    .run('kim', 'I go school yesterday', 'I went to school yesterday.', '과거', 'en', now - 5 * DAY);
  db.prepare('INSERT INTO voice_coaching (student_uid, target_text, accuracy_score, created_at) VALUES (?,?,?,?)')
    .run('kim', 'I went to school yesterday.', 88, now - 4 * DAY);

  const r = await M.loadStudyVsSkill(d1(db), 'kim', now);
  ok('결과가 온다', !!(r && r.study && r.skill), JSON.stringify(r));
  if (r) {
    ok('수업 들어온 날: 실접속만 · 같은 날은 하루 · 쌍둥이 포함 · 30일 밖·씨앗·남 제외 = 2', r.study.class_days === 2, String(r.study.class_days));
    ok('A.i 친구: 학생 발화만 · 30일 안 · 대소문자 다른 계정 제외 = 1', r.study.friend_talks === 1, String(r.study.friend_talks));
    ok('웜업 = 1', r.study.warmups === 1);
    ok('단어 복습 = 30일 안 전체 6', r.study.vocab_reviews === 6, String(r.study.vocab_reviews));
    ok('7일 넘게 지나서 맞힌 단어 = apple·elder 2개(중복·2일 뒤·틀림·남의 단어 제외)', r.skill.remembered_words === 2, String(r.skill.remembered_words));
    ok('예시 단어는 그 단어들', JSON.stringify([...r.skill.remembered_examples].sort()) === '["apple","elder"]', JSON.stringify(r.skill.remembered_examples));
    ok('고친 문장 다시 바르게 = 1/1', r.skill.fixed_said_right === 1 && r.skill.fixed_total === 1, JSON.stringify(r.skill));
  }
  const rl = await M.loadStudyVsSkill(d1(db), 'lee', now);
  ok('짝: 다른 학생은 자기 것만(수업 1일 · 기억 0 · 문장 0/0)', rl && rl.study.class_days === 1 && rl.skill.remembered_words === 0 && rl.skill.fixed_total === 0, JSON.stringify(rl));
  const rf = await M.loadStudyVsSkill(d1(db, /vocab_review_log/), 'kim', now);
  ok('단어 기록을 못 읽으면 그 칸만 null(0 으로 위장하지 않음)', rf && rf.study.vocab_reviews === null && rf.skill.remembered_words === null && rf.study.class_days === 2, JSON.stringify(rf));
  const ra = await M.loadStudyVsSkill(d1(db, /FROM attendance/), 'kim', now);
  ok('짝: 출석을 못 읽어도 나머지는 그대로', ra && ra.study.class_days === null && ra.study.friend_talks === 1);
  const rx = await M.loadStudyVsSkill(d1(db, /warmup_fix_log|ai_lesson_reports/), 'kim', now);
  ok('교정 기록을 못 읽으면 문장 칸은 null', rx && rx.skill.fixed_said_right === null && rx.skill.fixed_total === null, JSON.stringify(rx && rx.skill));
  ok('uid 가 비면 null', (await M.loadStudyVsSkill(d1(db), '', now)) === null);
}

/* ── ③ 배선 ── */
console.log('③ 학부모 대시보드 배선 (api-students.ts)');
{
  const s = rd(API_S);
  const pd = s.indexOf("path === '/api/parent/dashboard'");
  const pw = s.indexOf("error: 'password_not_set'", pd);
  const ld = s.indexOf('loadStudyVsSkill(env.DB, childUid', pd);
  ok('비밀번호 게이트 «뒤» 에서 childUid 로 읽는다', pd > 0 && pw > pd && ld > pw);
  const rj = s.indexOf('return json({', ld);
  const rb = rj > 0 ? bodyFrom(s, rj) : '';
  ok('응답에 study_skill 칸', /study_skill: studySkill,/.test(rb));
  ok('던져도 대시보드는 뜬다(try 로 감쌈)', /try \{ studySkill = await loadStudyVsSkill\(/.test(s));
}

/* ── ④ 화면 ── */
console.log('④ 화면 (parent.html pdSkillHtml)');
{
  const s = rd(UI_P);
  const i = s.indexOf('function pdSkillHtml(s, en)');
  const fnSrc = i > 0 ? 'function pdSkillHtml(s, en)' + bodyFrom(s, i) : '';
  ok('전제: pdSkillHtml 을 오려 냈다', fnSrc.length > 200);
  let F = null;
  try { F = new Function(`var esc=function(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return '&#'+c.charCodeAt(0)+';'})}; ${fnSrc}; return pdSkillHtml;`)(); } catch (e) { F = null; }
  const call = (...a) => { try { return F ? F(...a) : '__nofn'; } catch (e) { return '__err:' + e.message; } };
  const full = { days: 30, study: { class_days: 4, friend_talks: 12, warmups: 3, vocab_reviews: 9 }, skill: { remembered_words: 2, remembered_examples: ['apple', '<b>x'], fixed_said_right: 1, fixed_total: 3 } };
  const h = call(full, false);
  ok('두 칸(한 것 / 해낸 것)을 그린다', typeof h === 'string' && h.includes('한 것 (공부량)') && h.includes('해낸 것 (실력)'), String(h).slice(0, 80));
  ok('숫자를 그대로 쓴다(지어내지 않음)', h.includes('>4<') && h.includes('>12<') && h.includes('>2<') && h.includes('1 / 3'));
  ok('예시 단어는 이스케이프', h.includes('&#60;b&#62;x') && !h.includes('<b>x'));
  ok('«공부량은 실력이 아니다» 문구', h.includes('게임 점수는 «실력» 으로 세지 않습니다'));
  const hn = call({ study: { class_days: 3, friend_talks: null, warmups: null, vocab_reviews: null }, skill: { remembered_words: null, remembered_examples: [], fixed_said_right: null, fixed_total: null } }, false);
  ok('null 칸은 안 그린다(«0» 으로 쓰지 않음)', hn.includes('화상수업 들어온 날') && !hn.includes('단어 복습') && !hn.includes('7일 넘게'), hn.slice(0, 120));
  ok('짝: 해낸 것이 모두 모름이면 «아직 셀 기록 없음»', hn.includes('아직 셀 수 있는 기록이 없어요'));
  const all0 = call({ study: { class_days: null, friend_talks: null, warmups: null, vocab_reviews: null }, skill: { remembered_words: null, remembered_examples: [], fixed_said_right: null, fixed_total: null } }, false);
  ok('셀 수 있는 것이 하나도 없으면 null(카드 감춤)', all0 === null);
  ok('서버가 칸을 안 보냈으면 null', call(undefined, false) === null && call(null, false) === null);
  const z = call({ study: { class_days: 0, friend_talks: 0, warmups: 0, vocab_reviews: 0 }, skill: { remembered_words: 0, remembered_examples: [], fixed_said_right: 0, fixed_total: 0 } }, false);
  ok('0 은 0 으로 그린다 + 다음 할 일 안내', typeof z === 'string' && z.includes('>0<') && z.includes('7일 뒤에 다시 맞히면'));
  ok('고친 문장 카드가 0장이면 그 줄은 안 그린다', !z.includes('고친 문장을 다시'));
  const he = call(full, true);
  ok('영어 화면', typeof he === 'string' && he.includes('Done (amount)') && he.includes('Achieved (skill)'));
  ok('로드 자리에서 카드 감추기·그리기 배선', /pdSkillHtml\(d\.study_skill,/.test(s) && /id="pd-skill-card"/.test(s));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
