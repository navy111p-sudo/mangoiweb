// 단어장 정본: 뜻 검증, 간격 반복(SRS), 쓰기 권한 판정.
import { json } from './api-util';
import { isKoreanGloss } from './korean-vocab';
import { resolveOwnerScope } from './auth-admin';
/**
 * 🔤 한국어 퀴즈 뜻 검사 — 깨진 글자와 한자·가나 혼입을 걸러냅니다.
 *   U+FFFD(replacement character)는 "여기 바이트를 못 읽었다"는 표시라, 한 글자라도 있으면
 *   그 문자열은 이미 원본을 잃은 것입니다(되살릴 수 없음). 화면에 내보내지 않습니다.
 *
 *   왜 필요한가 — 셸에서 한글을 인라인으로 POST 하면 EUC-KR 바이트가 그대로 저장됩니다
 *   (CLAUDE.md §2 함정). 그렇게 들어온 QA 데이터가 실제 학생 퀴즈의 보기로 새어 나온 사고가
 *   2026-08-03 에 있었습니다. 넣는 쪽을 다 막기는 어려우니 보여주는 쪽에서 한 번 더 거릅니다.
 *
 *   ⚠️ 리터럴 대신 String.fromCharCode(0xFFFD) 로 만듭니다 — 소스에 깨진 문자를 직접 박아 두면
 *      이 파일이 다른 인코딩으로 저장되는 순간 검사 자체가 조용히 망가집니다.
 */
export function isCleanText(s: any): boolean {
  if (s == null) return false;
  const t = String(s).trim();
  if (!t) return false;
  return t.indexOf(String.fromCharCode(0xFFFD)) === -1 && isKoreanGloss(t);
}

/** 📅 단어 간격 반복(SRS) 정본 — 플래시카드 복습(/api/vocab/review)과 단어 퀴즈(/api/vocab/quiz-submit)가 같이 쓴다.
 *  정답이면 level+1(최대 7), 오답이면 0. 다음 복습까지 일수: 0=1, 1=2, 2=4, 3=7, 4=14, 5=30, 6=60, 7=120.
 *  ⛔ 간격표를 다른 경로에 다시 적지 말 것 — 한쪽만 바뀌면 같은 단어가 경로마다 다른 날짜에 돌아온다. */
export const VOCAB_SRS_INTERVALS = [1, 2, 4, 7, 14, 30, 60, 120];
export function vocabSrsNext(level: any, correct: boolean, now: number): { level: number; days: number; next: number } {
  const cur = Number.isFinite(Number(level)) ? Math.max(0, Math.min(7, Math.floor(Number(level)))) : 0;
  const lv = correct ? Math.min(cur + 1, 7) : 0;
  const days = VOCAB_SRS_INTERVALS[lv] || 1;
  return { level: lv, days, next: now + days * 86400000 };
}

/** 🔐 (2026-10-19) 단어장 «쓰기» 본인 확인 — 남이 다른 학생의 단어장에 낱말·오답을 심지 못하게.
 *  그 오답(«단어장 약점»)은 웜업 대화·A.i 친구 프롬프트와 게임 복습 큐에 그대로 실린다(src/vocab-weak.ts).
 *  판정은 /api/vocab/review·reward·DELETE 와 같은 resolveOwnerScope 하나 — 게스트(guest*)는 통과,
 *  관리자·교사 세션은 통과, 그 밖에는 서명 토큰 uid 가 «그 단어장 주인» 과 같아야 한다.
 *  막히면 401 응답, 통과면 null. ⛔ 판정을 라우트마다 다시 적지 말 것(한쪽만 느슨해진다). */
export async function vocabWriteDenied(request: Request, url: URL, env: any, ownerUid: string, body?: any): Promise<Response | null> {
  if ((await resolveOwnerScope(request, url, env, String(ownerUid || ''), body)) !== 'deny') return null;
  return json({
    ok: false, error: 'auth_required',
    message: '🔑 로그인 정보가 만료됐어요. 다시 로그인한 뒤 해 주세요.',
    message_en: '🔑 Your login has expired. Please log in again.',
  }, 401);
}
