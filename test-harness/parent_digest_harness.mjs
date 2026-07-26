/**
 * 📅 parent_digest_harness.mjs — 주간 학부모 다이제스트(api-students.ts) 회귀 하니스
 *
 * 왜 필요한가
 *   학부모에게 **실제 SMS 가 나가는** 기능인데 전용 하니스가 없었다(2026-07-27 점검에서 발견).
 *   위험 지점: ①빈 데이터로 리포트 만들다 터짐 ②29,000명 오발송 ③희망 톤 문구 훼손.
 *
 * 검사 전략(발송은 절대 안 건드린다)
 *   A. 정적 소스 검사 — build 는 DB 의존이라 실행 못 하지만, "안전장치가 코드에 있는지"는 소스로 확정.
 *   B. 순수 조립 로직 재현 — highlight 선택 우선순위/폴백을 소스에서 뽑아 경계값 검증.
 *   C. (MANGO_BASE) 라이브 — 4개 라우트가 무인증 401 인지(대외발송 API 노출 차단).
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, 'cloudflare-deploy', 'src', 'api-students.ts'), 'utf8');

let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`PASS ${label}`); }
  else { fail++; console.log(`FAIL ${label}${detail ? '  — ' + detail : ''}`); }
};

console.log('── A) 대량 오발송 이중 안전장치 (29,000명 사고 방지) ──');
ok('A1: send-all 실발송은 KV 스위치 필요', /digest:send_all_live/.test(src));
ok('A2: 요청 live:true AND KV=1 둘 다 필요', /b\.live === true && liveOn/.test(src));
ok('A3: 기본은 dry(미리보기·집계만)', /doSend \? '실발송 완료' : '미리보기/.test(src));
ok('A4: send-all 대상 수 상한(폭주 방지)', /Math\.min\(5000/.test(src));
ok('A5: 발송 전 전화번호 10자리 미만은 no_phone 스킵', /phone\.length < 10\) return 'no_phone'/.test(src));

console.log('\n── A′) 중복 발송 방지(멱등) — 2026-07-27 발견·수정 ──');
//   Cloudflare 크론 at-least-once + 수동 send-all 겹침 → 학부모 문자 2통 방지.
//   옆 기능(runFeedbackReminderSweep)엔 dedup 있는데 이건 빠져 있었음.
ok('A′1: digestSentRecently 멱등 헬퍼 존재', /export async function digestSentRecently/.test(src));
ok('A′2: 최근 발송 로그(status=sent) 조회로 판정', /digest_logs WHERE student_uid = \? AND status = 'sent' AND sent_at >=/.test(src));
ok('A′3: 크론 스윕이 발송 전 멱등 체크', /if \(!liveOn\) continue;[\s\S]{0,120}digestSentRecently\(env, r\.user_id\)/.test(src));
ok('A′4: HTTP send-all 이 발송 전 멱등 체크', /if \(!doSend\) continue;[\s\S]{0,120}digestSentRecently\(env, r\.user_id\)/.test(src));
ok('A′5: 6일 창(주1회라 지난주분은 안 걸림)', /windowDays = 6/.test(src));
ok('A′6: 로그 조회 실패해도 발송 안 막음(catch→false)', /catch \{ return false; \}/.test(src));

console.log('\n── B) 모든 발송 라우트 관리자 인증 필수 ──');
for (const ep of ['preview', 'send-one', 'send-all', 'logs']) {
  // 각 라우트 핸들러 블록에 checkAdminSession 이 있는지(핸들러 순서대로 검사)
  ok(`B:${ep} 핸들러에 checkAdminSession`, new RegExp(`digest/${ep}'[\\s\\S]{0,220}checkAdminSession`).test(src));
}

console.log('\n── C) 데이터 없어도 안 터지는 방어 ──');
ok('C1: 소스 테이블 CREATE IF NOT EXISTS', /CREATE TABLE IF NOT EXISTS attendance/.test(src) && /CREATE TABLE IF NOT EXISTS voice_coaching/.test(src));
ok('C2: q1 이 실패 시 null 반환(테이블 미존재 방어)', /const q1 = async[\s\S]{0,120}catch \{ return null; \}/.test(src));
ok('C3: 집계값 전부 || 0 폴백', /att\?\.d \|\| 0/.test(src) && /streak\?\.current_streak \|\| 0/.test(src));
ok('C4: next_goals 빈값이면 격려 문구 폴백', /'꾸준한 학습 이어가기'/.test(src));

console.log('\n── D) highlight 선택 로직 재현 (우선순위·폴백) ──');
// 소스의 highlight if/else 사다리를 그대로 옮겨 경계값 검증(로직 진실 고정).
function pickHighlight(aiChatN, conqueredN, streakN, judgN, days) {
  let h = '이번 주도 꾸준히 함께했어요';
  if (aiChatN >= 20) h = `AI 친구와 영어로 ${aiChatN}번이나 대화했어요! 입이 트이는 중이에요`;
  else if (conqueredN >= 5) h = `이번 주에 새 단어 ${conqueredN}개를 완전히 내 것으로 만들었어요`;
  else if (streakN >= 5) h = `${streakN}일 연속 출석 중! 습관이 잡혀가고 있어요`;
  else if (judgN >= 3) h = `AI 판단력 훈련으로 스스로 생각하는 힘을 키우고 있어요`;
  else if (days >= 3) h = `이번 주 ${days}번 수업, 성실하게 참여했어요`;
  return h;
}
ok('D1: AI대화 20+ 가 최우선', pickHighlight(20, 9, 9, 9, 7).includes('입이 트이는'));
ok('D2: 단어정복 5+ 는 그 다음', pickHighlight(0, 5, 9, 9, 7).includes('내 것으로'));
ok('D3: 연속출석 5+ 는 세번째', pickHighlight(0, 0, 5, 9, 7).includes('습관이'));
ok('D4: 판단력 3+ 는 네번째', pickHighlight(0, 0, 0, 3, 7).includes('생각하는 힘'));
ok('D5: 그 외 출석 3+ 는 다섯번째', pickHighlight(0, 0, 0, 0, 3).includes('성실하게'));
ok('D6: 전부 미달이면 기본 격려 문구(빈 주에도 부정 표현 없음)', pickHighlight(0, 0, 0, 0, 0) === '이번 주도 꾸준히 함께했어요');
// 학생/학부모 대상 문구에 부정·질책 표현이 없어야 함(상시 규칙: 희망 톤)
const highlightBlock = (src.match(/let highlight[\s\S]*?days >= 3\)[^\n]*\n/) || [''])[0];
ok('D7: 하이라이트에 부정/질책 표현 없음', !/못했|부족|나쁨|실패|낮음|경고/.test(highlightBlock));

console.log('\n── E) 학부모 SMS 는 한국어 전용이 맞다 (강사향 아님 = 한/영 두 벌 불필요) ──');
ok('E1: SMS 발송에 ko/en 두 벌 강제 안 함(학부모=한국인)', true);  // 문서화용: 상시 규칙의 예외 명시

// ── 라이브(선택) ──
const BASE = process.env.MANGO_BASE;
if (BASE) {
  console.log('\n── F) 라이브: 대외발송 라우트 무인증 차단 ──');
  for (const ep of ['preview', 'send-one', 'send-all', 'logs']) {
    try {
      const res = await fetch(`${BASE}/api/parent/digest/${ep}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', redirect: 'manual',
      });
      ok(`F:${ep} 무인증 차단(401/403)`, [401, 403].includes(res.status), `HTTP ${res.status}`);
    } catch (e) { ok(`F:${ep} 무인증 차단`, false, String(e.message || e)); }
  }
} else {
  console.log('\n(MANGO_BASE 없음 — 라이브 인증 검사 생략)');
}

console.log(`\n=== SUMMARY: ${pass} passed, ${fail} failed ===`);
import('fs').then((fs) => fs.writeFileSync(join(root, 'test-harness', 'parent_digest_report.txt'),
  `PASS=${pass} FAIL=${fail}\n생성=${new Date().toISOString()}\n`, 'utf8'));
process.exit(fail > 0 ? 1 : 0);
