/**
 * pii-mask.ts — 개인정보(PII) 마스킹 & 권한별 노출 제어 (2026-06-09)
 *
 *  [목적] 학생/학부모 전화번호·카카오톡 ID 등 민감정보가 하위 권한
 *         (지사·대리점·읽기전용) 계정에 그대로 노출되던 보안 결함을 차단한다.
 *
 *  [데이터 최소노출 원칙]
 *    - hq(본사·최고관리자) / none(내부직원·교사) → 원본 열람 (학부모 연락 등 업무 필요)
 *    - branch(지사) / agency(대리점) 하위 계정      → 백엔드에서 미리 마스킹하여 전송
 *
 *  scope 모델은 ./scope.ts 의 Scope('hq'|'branch'|'agency'|'none') 를 따른다.
 *  (요구사항의 hq_exec/hq_mgr = 본사 hq 권한에 해당)
 */
import type { Scope } from './scope';

/**
 * 전화번호 마스킹 — 뒤 4자리를 ****로 가린다.
 *   "010-1234-5678" | "01012345678" | "010 1234 5678" → "010-1234-****"
 *   "02-123-4567"   | "021234567"                     → "02-123-****"  (지역번호)
 * @param phone 임의 형태의 전화번호 문자열
 * @returns 마스킹된 "###-####-****" 형태 (빈/무효 입력은 빈 문자열)
 */
export function maskPhoneNumber(phone: string | null | undefined): string {
  if (phone == null) return '';
  const raw = String(phone).trim();
  if (!raw) return '';
  if (raw.indexOf('*') > -1) return raw;  // 이미 마스킹됨 → 멱등 반환
  // 숫자만 추출 (하이픈·공백·괄호·+82 등 모든 구분자 제거)
  const digits = raw.replace(/\D/g, '');
  // 너무 짧으면(7자리 미만) 전부 가린다 — 부분 정보도 노출 금지
  if (digits.length < 7) return '*'.repeat(Math.max(digits.length, 3));

  const TAIL = '****';
  // 11자리 휴대폰: 010-1234-****
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${TAIL}`;
  }
  // 10자리(서울 02 + 4 + 4, 또는 010 구형): 02-1234-**** / 010-123-****
  if (digits.length === 10) {
    const head = digits.startsWith('02') ? digits.slice(0, 2) : digits.slice(0, 3);
    const mid = digits.slice(head.length, digits.length - 4);
    return `${head}-${mid}-${TAIL}`;
  }
  // 9자리(02-123-4567 등): 02-123-****
  if (digits.length === 9 && digits.startsWith('02')) {
    return `02-${digits.slice(2, 5)}-${TAIL}`;
  }
  // 일반 폴백: 앞부분 유지 + 뒤 4자리 마스킹
  return `${digits.slice(0, digits.length - 4)}-${TAIL}`;
}

/**
 * 카카오톡 ID / 이메일 마스킹 — 앞 3글자만 남기고 나머지는 ***.
 *   "kakao_id"            → "kak***"
 *   "navy111p@gmail.com"  → "nav***@gmail.com"  (이메일은 도메인 보존)
 *   "ab"                  → "a***"
 * 보안상 원본 길이를 노출하지 않도록 고정 길이(***)로 마스킹한다.
 * @param id 카카오 ID 또는 이메일 문자열
 */
export function maskKakaoId(id: string | null | undefined): string {
  if (id == null) return '';
  const raw = String(id).trim();
  if (!raw) return '';
  if (raw.indexOf('*') > -1) return raw;  // 이미 마스킹됨 → 멱등 반환
  const at = raw.indexOf('@');
  if (at > 0) {
    // 이메일: 로컬파트 앞 3글자만 남기고 도메인은 보존 (연락 가능성 유지)
    const local = raw.slice(0, at);
    const domain = raw.slice(at); // "@gmail.com"
    const head = local.length <= 3 ? local.charAt(0) : local.slice(0, 3);
    return `${head}***${domain}`;
  }
  if (raw.length <= 3) return `${raw.charAt(0)}***`;
  return `${raw.slice(0, 3)}***`;
}

/**
 * 현재 로그인 계정이 PII 원본을 열람할 수 있는가?
 *   hq(본사·최고관리자), none(내부직원·교사) → true
 *   branch(지사), agency(대리점) 하위 계정    → false
 */
export function canViewPII(scope: Scope | null | undefined): boolean {
  if (!scope) return false;
  return scope.type === 'hq' || scope.type === 'none';
}

// 마스킹 대상 컬럼
const PHONE_KEYS = ['phone', 'student_phone', 'parent_phone', 'teacher_phone'];
const ID_KEYS = ['kakao_id', 'kakaoId', 'parent_kakao_id', 'student_kakao_id', 'email'];

/**
 * 단일 레코드의 PII 컬럼을 마스킹한 얕은 복제본을 반환한다. (원본 불변)
 */
export function maskRecordPII<T extends Record<string, any>>(row: T): T {
  if (!row || typeof row !== 'object') return row;
  const out: Record<string, any> = { ...row };
  for (const k of PHONE_KEYS) {
    if (out[k] != null && out[k] !== '') out[k] = maskPhoneNumber(out[k]);
  }
  for (const k of ID_KEYS) {
    if (out[k] != null && out[k] !== '') out[k] = maskKakaoId(out[k]);
  }
  return out as T;
}

/**
 * 권한(scope)에 따라 레코드 배열의 PII 를 마스킹한다.
 *   - 열람 권한 있음(hq/none) → 원본 그대로 반환 (불필요한 복제 없음)
 *   - 열람 권한 없음          → 모든 레코드 마스킹 복제본 반환
 * API 응답 JSON 생성 직전 호출하여 "백엔드에서 미리 마스킹" 한다.
 */
export function applyPIIScope<T extends Record<string, any>>(rows: T[], scope: Scope | null | undefined): T[] {
  if (!Array.isArray(rows)) return rows;
  if (canViewPII(scope)) return rows;
  return rows.map(maskRecordPII);
}
