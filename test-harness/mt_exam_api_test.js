// 📝 Mini TOEIC 백엔드(api-exam.ts) 로컬 검증 하니스 — node:sqlite 로 D1 흉내
//   실행: npx esbuild cloudflare-deploy/src/api-exam.ts --bundle --format=cjs --platform=node --outfile=test-harness/.mt-exam-bundle.cjs
//        node test-harness/mt_exam_api_test.js
const { DatabaseSync } = require('node:sqlite');
const { handleExamApi } = require('./.mt-exam-bundle.cjs');

const db = new DatabaseSync(':memory:');

// ── D1 shim ──
const D1 = {
  exec(sql) { db.exec(sql); return Promise.resolve(); },
  prepare(sql) {
    const mk = (binds) => ({
      bind(...args) { return mk(args); },
      first() { try { const st = db.prepare(sql); return Promise.resolve(st.get(...binds) ?? null); } catch (e) { return Promise.reject(e); } },
      all() { try { const st = db.prepare(sql); return Promise.resolve({ results: st.all(...binds) }); } catch (e) { return Promise.reject(e); } },
      run() { try { const st = db.prepare(sql); const r = st.run(...binds); return Promise.resolve({ meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }); } catch (e) { return Promise.reject(e); } },
    });
    return mk([]);
  },
};

// ── Workers AI shim: 항상 JSON 배열 반환 (정답 위치 섞음) ──
const fakeAI = {
  async run(model, opts) {
    const user = opts.messages.find(m => m.role === 'user').content;
    const isListening = /LISTENING/.test(user);
    const m = user.match(/exactly (\d+) four-choice/);
    const n = m ? Number(m[1]) : 5;
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({
        ...(isListening ? { audio_script: `The bus leaves at ${i + 1} o'clock.` } : {}),
        question_text: isListening ? `When does the bus leave? (#${i + 1})` : `She ___ to school every day. (#${i + 1})`,
        choice_a: 'goes', choice_b: 'go', choice_c: 'going', choice_d: 'gone',
        correct_answer: ['A', 'B', 'C', 'D'][i % 4],
      });
    }
    return { response: JSON.stringify(arr) };
  },
};

const env = { DB: D1, AI: fakeAI, RECORDINGS: undefined };

async function call(method, path, body, qs) {
  const url = new URL('https://x.test' + path + (qs ? '?' + qs : ''));
  const req = new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const res = await handleExamApi(req, url, env);
  if (!res) return { __null: true };
  return await res.json();
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); }
}

(async () => {
  console.log('── 관리자: 시험 생성 + AI 출제 ──');
  const cr = await call('POST', '/api/admin/exam/create', { title: '7월 여행 미니토익', level: 'A2', listening_count: 3, reading_count: 3, duration_min: 20 });
  check('create ok + exam_id', cr.ok === true && cr.exam_id === 1, cr);

  const noTitle = await call('POST', '/api/admin/exam/create', {});
  check('create without title → 400', noTitle.ok === false && noTitle.error === 'title_required', noTitle);

  const g1 = await call('POST', '/api/admin/exam/question/ai-generate', { exam_id: 1, section: 'listening', count: 3, topic: 'travel' });
  check('ai-generate listening 3', g1.ok === true && g1.generated_count === 3, g1);
  const g2 = await call('POST', '/api/admin/exam/question/ai-generate', { exam_id: 1, section: 'reading', count: 3, topic: 'travel' });
  check('ai-generate reading 3', g2.ok === true && g2.generated_count === 3, g2);
  const gBad = await call('POST', '/api/admin/exam/question/ai-generate', { exam_id: 999, section: 'reading', count: 3 });
  check('ai-generate wrong exam → 404', gBad.ok === false && gBad.error === 'exam_not_found', gBad);

  const add = await call('POST', '/api/admin/exam/question/add', { exam_id: 1, section: 'reading', question_text: 'Manual Q', choice_a: 'a', choice_b: 'b', choice_c: 'c', choice_d: 'd', correct_answer: 'B' });
  check('manual add ok', add.ok === true, add);

  const list = await call('GET', '/api/admin/exams');
  check('admin list: 1 exam, 7 questions (3L+4R)', list.ok && list.list.length === 1 && list.list[0].question_count === 7 && list.list[0].lq_count === 3 && list.list[0].rq_count === 4, list.list && list.list[0]);

  const det = await call('GET', '/api/admin/exam/1');
  check('detail: questions with correct_answer + listening first', det.ok && det.questions.length === 7 && det.questions[0].section === 'listening' && !!det.questions[0].correct_answer, det.questions && det.questions[0]);
  check('detail: listening audio_url → /api/exam/tts', String(det.questions[0].audio_url || '').startsWith('/api/exam/tts?'), det.questions[0]);

  console.log('── 학생: 목록 → 응시 → 채점 ──');
  const pub = await call('GET', '/api/exam/list');
  check('student list shows exam', pub.ok && pub.list.length === 1 && pub.list[0].question_count === 7, pub);

  const st = await call('POST', '/api/exam/attempt/start', { exam_id: 1, user_id: 'stu_test1' });
  check('attempt start: attempt_id + 7 Qs', st.ok && st.attempt_id === 1 && st.questions.length === 7, st);
  check('attempt Qs: 정답 미포함', st.questions.every(q => q.correct_answer === undefined), st.questions[0]);
  check('attempt Qs: listening first', st.questions[0].section === 'listening' && st.questions[6].section === 'reading');

  // 문제별 정답 맵 (관리자 상세에서)
  const key = {}; det.questions.forEach(q => key[q.id] = q.correct_answer);
  // 듣기 3문제: 전부 정답 / 읽기 4문제: 2개만 정답
  const qs = st.questions;
  let readingRight = 0;
  for (const q of qs) {
    let sel;
    if (q.section === 'listening') sel = key[q.id];
    else { sel = (readingRight < 2) ? key[q.id] : (key[q.id] === 'A' ? 'B' : 'A'); readingRight++; }
    const sa = await call('POST', '/api/exam/attempt/submit-answer', { attempt_id: st.attempt_id, question_id: q.id, selected_answer: sel });
    if (!sa.ok) check('submit-answer q' + q.id, false, sa);
  }
  // 같은 문항 답 바꾸기(마지막 선택 유효) — 읽기 마지막 문제를 오답→정답으로 교체
  const lastQ = qs[qs.length - 1];
  await call('POST', '/api/exam/attempt/submit-answer', { attempt_id: st.attempt_id, question_id: lastQ.id, selected_answer: key[lastQ.id] });

  const fin = await call('POST', '/api/exam/attempt/finish', { attempt_id: st.attempt_id });
  // 듣기 3/3=100, 읽기 3/4=75 (2정답+마지막 교체정답), 전체 6/7=86
  check('finish: total 6/7 → 86점', fin.ok && fin.correct_count === 6 && fin.total_questions === 7 && fin.score === 86, fin);
  check('finish: listening 100 / reading 75', fin.listening_score === 100 && fin.reading_score === 75, fin);

  const fin2 = await call('POST', '/api/exam/attempt/finish', { attempt_id: st.attempt_id });
  check('finish 재호출 → 같은 결과(멱등)', fin2.ok && fin2.score === 86, fin2);

  const late = await call('POST', '/api/exam/attempt/submit-answer', { attempt_id: st.attempt_id, question_id: qs[0].id, selected_answer: 'A' });
  check('종료 후 답 제출 차단', late.ok === false && late.error === 'attempt_already_finished', late);

  const res = await call('GET', '/api/exam/results', null, 'user_id=stu_test1');
  check('results: 1건 + 제목 join', res.ok && res.list.length === 1 && res.list[0].title === '7월 여행 미니토익' && res.list[0].score === 86, res);

  console.log('── 관리자: 토글/삭제 ──');
  const tg = await call('POST', '/api/admin/exam/toggle', { exam_id: 1 });
  check('toggle → hidden', tg.ok && tg.active === 0, tg);
  const pub2 = await call('GET', '/api/exam/list');
  check('숨김 시험은 학생 목록에서 제외', pub2.ok && pub2.list.length === 0, pub2);
  const tg2 = await call('POST', '/api/admin/exam/toggle', { exam_id: 1 });
  check('toggle 재호출 → public', tg2.ok && tg2.active === 1, tg2);

  const dq = await call('POST', '/api/admin/exam/question/delete', { question_id: qs[0].id });
  check('question delete', dq.ok && dq.deleted === 1, dq);
  const det2 = await call('GET', '/api/admin/exam/1');
  check('detail after delete: 6 Qs + leaderboard 1', det2.ok && det2.questions.length === 6 && det2.leaderboard.length === 1, det2.leaderboard);

  const de = await call('POST', '/api/admin/exam/delete', { exam_id: 1 });
  check('exam delete', de.ok && de.deleted === 1, de);
  const list2 = await call('GET', '/api/admin/exams');
  check('admin list empty after delete', list2.ok && list2.list.length === 0, list2);
  const orphan = db.prepare('SELECT (SELECT COUNT(*) FROM mt_questions) qn, (SELECT COUNT(*) FROM mt_attempts) an, (SELECT COUNT(*) FROM mt_answers) ansn').get();
  check('cascade: questions/attempts/answers 전부 0', orphan.qn === 0 && orphan.an === 0 && orphan.ansn === 0, orphan);

  const unmatched = await call('GET', '/api/exam/nothing-here');
  check('미매칭 경로 → null (다음 라우터로)', unmatched.__null === true);

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
