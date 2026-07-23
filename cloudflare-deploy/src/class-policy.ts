/**
 * class-policy.ts — 수업 공통 정책 상수 (2026-07-23)
 *   기본 수업 길이는 영어·중국어 모두 20분입니다(사장님 확정 2026-07-23).
 *   ⚠️ 이 값을 파일마다 복사해 두면 반드시 어긋납니다. 반드시 여기서 import 하세요.
 *   ⚠️ 운영 DB 의 class_schedules 는 예전 스키마(DEFAULT 30)로 이미 만들어져 있습니다.
 *      따라서 INSERT 에서 duration_min 을 생략하면 30 이 들어갑니다 — 반드시 명시하세요.
 */
export const DEFAULT_CLASS_MINUTES = 20;
/** 선택 가능한 수업 길이 */
export const ALLOWED_CLASS_MINUTES = [20, 30, 40];
