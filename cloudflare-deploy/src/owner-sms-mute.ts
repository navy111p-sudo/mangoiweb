/**
 * owner-sms-mute.ts — 📵 «운영자에게 가는 문자» 전체 음소거 스위치 (2026-09-08 사장님 지시)
 *
 *  [왜] 사장님 폰으로 여러 종류의 알림 문자가 계속 왔습니다. 2026-09-06 에 그중
 *       「🚨 결석 위험」 하나만 껐는데(absent-sweep.ts), 9/8 에 「관리자 로그인 알림」이
 *       또 와서 「일단 모두 꺼줘」 지시를 받았습니다.
 *
 *  [무엇을 끄나] `OWNER_ALERT_PHONE` 으로 가는 **문자 전부**입니다. 실측(2026-09-08 전수 grep)
 *       그 번호로 보내는 곳은 6파일 17군데이고 **전부 `sendPlainSms` 하나를 지납니다** —
 *       결제·환불(api-pay.ts 7 · api-pay-refund.ts 1) · 이상 로그인(auth-admin.ts 2) ·
 *       사이트 장애(api-uptime.ts 3) · 방 갈림 감시견(room-split-guard.ts 2) ·
 *       새 상담 리드(api-admin.ts 1) · 결석 위험(absent-sweep.ts 1, 이미 별도로 꺼짐).
 *
 *  ⛔ **호출부를 하나씩 고치지 않았습니다.** 17군데를 각각 막으면 나중에 새 알림이 생길 때
 *     조용히 새어 나갑니다. 그래서 «문자를 실제로 보내는 정본»(`sendPlainSms`) 한 곳에서
 *     수신번호가 운영자 번호일 때만 막습니다 — 새 알림도 자동으로 걸립니다.
 *
 *  ⛔ **`OWNER_ALERT_PHONE` 시크릿을 지우는 방식은 쓰지 않았습니다.** 지우면 되돌리기 어렵고,
 *     나중에 «결제 알림만 다시» 처럼 골라 켤 수도 없습니다. 스위치는 배포 없이 되돌립니다.
 *
 *  ⚠️ **기본이 «음소거» 입니다** — 사장님 지시가 「일단 모두 꺼줘」라서, 배포만으로 꺼지도록
 *     기본값을 그렇게 뒀습니다. 즉 KV 를 못 읽어도 «안 보냄» 쪽으로 떨어집니다.
 *     ⚠️ 그래서 **돈이 잘못 나가도·계정을 도둑맞아도·사이트가 죽어도 문자가 안 옵니다.**
 *        그것이 이 파일이 존재하는 대가이고, 사장님이 그 설명을 받고 고르신 것입니다.
 *     ✅ 다시 켜기: KV(SESSION_STATE) `owner_alert_mute` = `off` (배포 불필요, 즉시 적용)
 *
 *  ⛔ 조용히 사라지지는 않습니다 — 막을 때마다 `console.warn` 으로 Workers 로그에 남깁니다.
 *     ⚠️ 그래도 «사람이 보러 가야 보이는» 기록입니다. 문자와 달리 먼저 알려주지 않습니다.
 *
 *  ℹ️ 학부모·강사·학생에게 가는 문자는 번호가 달라 **영향받지 않습니다**(수신번호로만 판정).
 */

/** KV(SESSION_STATE) 스위치 이름 — 값이 'off' 일 때만 운영자에게 문자가 갑니다. */
export const OWNER_MUTE_KV_KEY = 'owner_alert_mute';

/**
 * KV 값 → «음소거인가».
 * ⚠️ 기본이 «음소거» 다: 값이 없거나(null·undefined) 모르는 값이면 **막습니다**.
 *    끄라는 지시를 받아 만든 스위치라 «모르면 안 보냄» 이 이 자리에서 맞는 실패 방향입니다.
 * ✅ 되켜는 값은 'off' 하나뿐(대소문자·앞뒤 공백 무시).
 */
export function ownerMuteFromKv(v: string | null | undefined): boolean {
  return String(v ?? '').trim().toLowerCase() !== 'off';
}

/** 숫자만 남기고 국가번호(+82)를 국내 표기(0…)로 맞춘다 — '010-1234-5678' 과 '+82 10 1234 5678' 이 같아야 한다. */
function digits(p: string | null | undefined): string {
  const d = String(p ?? '').replace(/[^0-9]/g, '');
  return d.startsWith('82') ? '0' + d.slice(2) : d;
}

/**
 * 이 수신번호가 «운영자 번호» 인가.
 * ⚠️ 둘 중 하나라도 비어 있으면 **false**(막지 않음) — 번호를 모를 때 남의 문자까지 막으면
 *    학부모·강사 문자가 통째로 사라집니다. 그쪽이 훨씬 나쁜 실패입니다.
 */
export function isOwnerPhone(to: string | null | undefined, owner: string | null | undefined): boolean {
  const a = digits(to), b = digits(owner);
  return !!a && !!b && a === b;
}
