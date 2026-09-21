/**
 * owner-sms-mute.ts — 📵 «운영자에게 가는 문자» 전체 음소거 스위치 (2026-09-08 사장님 지시)
 *
 *  [왜] 사장님 폰으로 여러 종류의 알림 문자가 계속 왔습니다. 2026-09-06 에 그중
 *       「🚨 결석 위험」 하나만 껐는데(absent-sweep.ts), 9/8 에 「관리자 로그인 알림」이
 *       또 와서 「일단 모두 꺼줘」 지시를 받았습니다.
 *
 *  [무엇을 끄나] `OWNER_ALERT_PHONE` 으로 가는 문자입니다. 실측(2026-09-08 전수 grep)
 *       그 번호로 보내는 곳은 6파일 17군데이고 **전부 `sendPlainSms` 하나를 지납니다** —
 *       결제·환불(api-pay.ts 7 · api-pay-refund.ts 1) · 이상 로그인(auth-admin.ts 2) ·
 *       사이트 장애(api-uptime.ts 3) · 방 갈림 감시견(room-split-guard.ts 2) ·
 *       새 상담 리드(api-admin.ts 1) · 결석 위험(absent-sweep.ts 1, 이미 별도로 꺼짐).
 *       ⚠️ 그 **17 은 아래 예외 둘을 포함한 숫자**입니다 — 「17군데가 다 막혀 있다」가 아닙니다.
 *
 *  ⚠️ **이것이 «모든» 문자를 막는다는 뜻은 아닙니다** — 워커를 안 거치는 경로가 하나 있습니다:
 *       `ops/mangoi-watchdog.sh` 의 `send_sms()` 가 SOLAPI 를 **직접** 부릅니다(2층 감시견).
 *       그 스크립트에 SOLAPI 키가 실제로 들어 있는지는 **코드 밖 상태라 확인하지 못했습니다.**
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
 *     ✅ 다시 켜기: KV(SESSION_STATE) `owner_alert_mute` = `off` (배포 불필요, 즉시 적용)
 *
 *  📌 **(2026-09-09) 「사이트 장애랑 감시견만 다시 켜줘」** — 사장님 지시로 예외 둘을 뒀습니다.
 *     그 둘은 **«사람이 안 보면 며칠씩 모르는»** 종류라 다른 알림과 성격이 다릅니다:
 *       · `uptime`     — 사이트가 죽었다 / 복구됐다 (`api-uptime.ts` 의 `sendPlainSms` 3곳)
 *       · `room-split` — 도메인이 갈려 같은 방 번호인데 서로 못 만난다
 *                        (⚠️ 알림 «자리» 는 둘인데 둘 다 `smsSafe()` 하나를 지나므로 호출은 **1곳**입니다 —
 *                         「하나 빠뜨렸나」로 읽지 마세요)
 *     ⚠️ 그래서 지금 대가는 **결제·환불·이상 로그인·상담 리드·결석 위험이 안 온다** 입니다
 *        (돈이 잘못 나가도·계정을 도둑맞아도 문자가 안 옵니다). 사장님이 설명을 받고 고르신 것입니다.
 *
 *  ⛔ **예외를 «호출부에서» 만들지 마세요** — 이 파일의 `OWNER_ALWAYS_KINDS` 목록 하나가 정본이고,
 *     `sendPlainSms(env, phone, text, { kind })` 로 «무슨 알림인가» 를 밝힌 것만 예외가 됩니다.
 *     ✅ **밝히지 않으면 막힙니다**(기본 = 음소거). 그래서 나중에 새 알림이 생겨도 조용히 새지 않습니다.
 *     ⛔ 그 목록에 «결제·로그인» 을 넣어 넓히지 마세요 — 그 순간 9/8 지시가 통째로 되돌아갑니다.
 *
 *  ⛔ 조용히 사라지지는 않습니다 — 막을 때마다 `console.warn` 으로 Workers 로그에 남깁니다.
 *     ⚠️ 그래도 «사람이 보러 가야 보이는» 기록입니다. 문자와 달리 먼저 알려주지 않습니다.
 *
 *  ℹ️ 학부모·강사·학생에게 가는 문자는 번호가 달라 **영향받지 않습니다**(수신번호로만 판정).
 */

/** KV(SESSION_STATE) 스위치 이름. */
export const OWNER_MUTE_KV_KEY = 'owner_alert_mute';

/**
 * 🔔 음소거 중에도 «그대로 나가는» 알림 종류 (2026-09-09 사장님 지시).
 * ⛔ 목록을 넓히지 마세요 — 여기 이름을 더하는 것이 곧 「그 알림을 다시 켠다」입니다.
 */
export const OWNER_ALWAYS_KINDS = ['uptime', 'room-split'] as const;
/** ⛔ 타입을 따로 적지 마세요 — 목록에서 «파생» 시켜야 값과 타입이 어긋나지 않습니다. */
export type OwnerSmsKind = typeof OWNER_ALWAYS_KINDS[number];

/**
 * KV 값 + 알림 종류 → «막는가».
 *
 *   `off`  → 전부 보냄 (음소거 해제)
 *   `all`  → 전부 막음 — **예외도 없음**(다시 완전 침묵시키고 싶을 때)
 *   그 밖  → 기본. `OWNER_ALWAYS_KINDS` 에 든 종류만 보내고 나머지는 막음
 *
 * ⚠️ 값이 없거나(null·undefined) 모르는 값이면 **기본**으로 떨어집니다 —
 *    즉 KV 를 못 읽어도 장애·감시견은 나가고 나머지는 막힙니다. 지금 정책이 그것이라
 *    «모르면 지금 정책대로» 가 이 자리에서 맞는 실패 방향입니다.
 */
export function ownerSmsBlocked(v: string | null | undefined, kind?: string | null): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'off') return false;
  if (s === 'all') return true;
  return !(OWNER_ALWAYS_KINDS as readonly string[]).includes(String(kind ?? '').trim().toLowerCase());
}

/**
 * (옛 이름) KV 값 → «음소거인가». 종류를 모를 때의 판정이라 `ownerSmsBlocked(v)` 와 같습니다.
 * ⚠️ 남겨 둔 이유는 «종류를 안 밝힌 호출은 여전히 막힌다» 를 이름으로 드러내기 위해서입니다.
 */
export function ownerMuteFromKv(v: string | null | undefined): boolean {
  return ownerSmsBlocked(v);
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
