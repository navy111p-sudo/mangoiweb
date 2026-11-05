import { fileURLToPath } from 'node:url';
// 🪙 «오늘의 A.i 학습» 받은 포인트 — 활동별 나눔(정본 today-points.ts 실제 실행) + 화면 칩·카드 (2026-11-02)
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const root = fileURLToPath(new URL('..', import.meta.url));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('❌ FAIL', n); } };
const ts = fs.readFileSync(root + 'cloudflare-deploy/src/today-points.ts', 'utf8');
const m = new Function(stripTypeScriptTypes(ts).replace(/export /g, '') + '; return { pointsByTool, toolForRule };')();
const rows = [
  { rule_code: 'vocab_review', amount: 30, meta: '{"kind":"session","awardId":"vocab:session:stu1:mq:12"}' },
  { rule_code: 'vocab_review', amount: 20, meta: '{"kind":"session","awardId":"vocab:session:stu1:1730"}' },
  { rule_code: 'review_quiz_done', amount: 15 },
  { rule_code: 'ai_friend_chat', amount: 2 }, { rule_code: 'ai_friend_word', amount: 5 },
  { rule_code: 'speech_master', amount: 20 }, { rule_code: 'judgment_correct', amount: 2 },
  { rule_code: 'ai_writing', amount: 10 }, { rule_code: 'ai_writing_mission', amount: 15 },
  { rule_code: 'rescue_sentence', amount: 5 }, { rule_code: 'teacher_praise_point', amount: 5 },
  { rule_code: 'attendance', amount: 0 }, { rule_code: null, amount: 3 }, { rule_code: 'review_quiz_done', amount: -10 },
];
const r = m.pointsByTool(rows);
ok('① 합계 = 양수 줄 합', r.total === 30 + 20 + 15 + 7 + 20 + 2 + 25 + 5 + 5 + 3);
ok('② 단어 퀴즈(:mq:)와 단어장 갈림', r.by_tool.micro === 30 && r.by_tool.vocab === 20);
ok('② 복습·친구·발음·판단력·글쓰기·게임', r.by_tool.review === 15 && r.by_tool.friend === 7 && r.by_tool.speech === 20 && r.by_tool.judgment === 2 && r.by_tool.write === 25 && r.by_tool.games === 5);
ok('③ 모르는 규칙은 other(카드에 안 붙음)', r.by_tool.other === 8 && !('teacher_praise_point' in r.by_tool));
ok('④ 빈 목록 → 0', m.pointsByTool([]).total === 0 && Object.keys(m.pointsByTool(null).by_tool).length === 0);
// 활동 키가 today-plan TOOLS 에 실재
const plan = fs.readFileSync(root + 'cloudflare-deploy/src/today-plan.ts', 'utf8');
for (const k of ['micro', 'vocab', 'review', 'friend', 'speech', 'judgment', 'write', 'games']) ok('⑤ TOOLS 에 ' + k + ' 가 있음', new RegExp('\\n  ' + k + ':\\s+\\{ key: \'' + k + '\'').test(plan));
// 서버 배선
const st = fs.readFileSync(root + 'cloudflare-deploy/src/api-students.ts', 'utf8');
ok('⑥ 오늘 적립 줄을 읽음(rule_code, amount, meta)', /SELECT rule_code, amount, meta FROM point_transactions WHERE user_id = \? AND type = 'earn' AND created_at >= \?/.test(st));
ok('⑥ 실패 → null(0 으로 안 지어냄)', /if \(!ptRow\) return \{ points_today: null, points_by_tool: null \}/.test(st));
ok('⑥ 정본으로 나눔', /pointsByTool\(\(\(ptRow as any\)\.results \|\| \[\]\) as any\[\]\)/.test(st));
// 화면
const js = fs.readFileSync(root + 'cloudflare-deploy/public/js/today-page.js', 'utf8');
const a = js.indexOf('  function todayPtsChip('), b = js.indexOf('  function goUrl(', a);
let H = null; try { H = new Function(js.slice(a, b) + '; return { todayPtsChip, stepPtsHtml };')(); } catch (e) { console.log(e.message); }
ok('⑦ 칩: 숫자', /오늘 \+12P/.test(H.todayPtsChip(12, false)) && /\+12P today/.test(H.todayPtsChip(12, true)));
ok('⑦ 칩: 0 은 +0P(사실)', /오늘 \+0P/.test(H.todayPtsChip(0, false)));
ok('⑦ 칩: null → «—»', /—/.test(H.todayPtsChip(null, false)) && !/\+/.test(H.todayPtsChip(null, false)));
ok('⑧ 카드: 받은 활동만', /오늘 \+30P/.test(H.stepPtsHtml({ micro: 30 }, 'micro', false)) && H.stepPtsHtml({ micro: 30 }, 'vocab', false) === '');
ok('⑧ 카드: 서버 칸 없음 → 안 그림', H.stepPtsHtml(null, 'micro', false) === '' && H.stepPtsHtml(undefined, 'micro', false) === '');
const live = js.replace(/\/\*[\s\S]*?\*\//g, '');
ok('⑨ 칩 배선', /todayPtsChip\(d\.points_today, en\)/.test(live) && !/'오늘 \+' \+ d\.points_today/.test(live));
ok('⑨ 카드 배선', /stepPtsHtml\(d\.points_by_tool, s\.key, en\)/.test(live));
const html = fs.readFileSync(root + 'cloudflare-deploy/public/today.html', 'utf8');
ok('⑩ ?v= 올림(15 이상)', Number((html.match(/today-page\.js\?v=(\d+)/) || [])[1]) >= 15);
console.log(`today_points_by_tool_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
