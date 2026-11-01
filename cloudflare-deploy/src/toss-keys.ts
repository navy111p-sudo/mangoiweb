/**
 * toss-keys.ts — 토스 키 판정의 정본 (2026-10-21 api-pay.ts 에서 옮김)
 *
 * 왜 따로 뺐나: 수강신청 결제(enroll-ops.ts)가 이 판정을 안 거치고
 *   `env.TOSS_CLIENT_KEY || 테스트키` 로 키를 직접 꺼내 쓰고 있었다 — 그러면 금고에
 *   «키가 아닌 값»이 들어갔을 때 그 화면만 깨진 키로 결제창을 연다.
 *   enroll-ops.ts 는 다른 도메인을 import 하지 않고(api-pay.ts 가 enroll-ops 를 import 해서
 *   거꾸로 부르면 순환), 판정을 복제하면 두 벌이 어긋난다 → 의존성 없는 이 파일 하나를 둘 다 부른다.
 * ⛔ 여기에 다른 모듈 import 를 더하지 말 것(순환이 생긴다).
 */

/* 토스 클라이언트 키(공개)의 최후 폴백 = 토스 공식 테스트키(실제 청구 없음).
   ✅ (2026-08-07) 프론트가 이제 GET /api/pay/config 로 이 값을 받아간다 —
      idx-payment-modal.js 에 같은 값을 한 벌 더 두던 구조를 없앴다.
      실결제 전환은 아래 두 시크릿 교체로 **끝난다**(코드 수정·재배포 없이 즉시 반영):
        wrangler secret put TOSS_CLIENT_KEY   ← live_ck_...
        wrangler secret put TOSS_SECRET_KEY   ← live_sk_...
      한쪽만 바꾸면 /api/pay/config 가 key_mismatch:true 를 돌려주고 결제창에 경고가 뜬다. */
export const TOSS_CLIENT_KEY_DEFAULT = 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq';

/* 🛡️ (2026-08-07) 시크릿에 «키가 아닌 것»이 들어와도 결제창이 죽지 않게.
   실제로 겪었다 — 키를 넣는 과정에서 엉뚱한 문자열이 TOSS_CLIENT_KEY 로 올라갔고,
   그 값으로 window.TossPayments(...) 를 호출하면 결제창이 그대로 실패한다.
   시크릿은 사람이 손으로 붙여넣는 값이라 «빈 값·명령어·따옴표 섞임»이 언제든 다시 생긴다.
   → 모양이 토스 키가 아니면 무시하고 테스트키로 폴백한다. 잘못된 키로 여는 것보다
     테스트 모드가 낫다(적어도 화면이 정직하게 「테스트 결제 모드」라고 말한다).
   ⚠️ 검증은 «모양»만 본다. 키가 유효한지는 토스만 안다 — 그건 confirm 단계에서 걸러진다. */
/* ⚠️ (2026-08-07 재수정) 처음엔 `^(test|live)_(ck|sk)_[A-Za-z0-9]{10,}$` 로 좁게 막았는데,
   그러면 토스가 실제로 발급하는 다른 형태(결제위젯 키 `live_gck_...`, 중간 세그먼트가 더 있는
   `test_gck_docs_xxxx` 등)까지 «가짜»로 판정해 버린다. 그건 훨씬 나쁜 사고다 —
   tossMode()='disabled' 는 /api/pay/confirm 과 웹훅을 503 으로 막아 **진짜 결제를 죽인다**.
   그래서 판정을 뒤집는다: «토스 키의 목록»을 맞히려 하지 말고, **명백한 쓰레기만** 걸러낸다.
     · 공백이 있으면 키가 아니다 (붙여넣기 사고의 전형 — 명령어·문장이 통째로 들어온 경우)
     · test_ / live_ 로 시작하지 않으면 키가 아니다
     · 너무 짧으면 키가 아니다
   역할(ck/sk) 구분은 두 번째 세그먼트에 'ck'/'sk' 가 들어있는지로 본다(gck·gsk 도 걸린다). */
export function tossKeyRole(v: unknown): 'ck' | 'sk' | null {
  const s = String(v ?? '').trim();
  /* ⚠️ (2026-08-07 3차) 길이 하한(20자)을 뺐다. 임의로 정한 숫자였는데, 접두사가 멀쩡한
     실제 키 두 개를 «모양이 아니다»로 판정했다. 내가 모르는 길이의 키가 언제든 또 나온다.
     남기는 건 «명백한 쓰레기»를 거르는 조건뿐: 공백 / test_·live_ 로 시작 안 함 / 접두사 비정상.
     짧은 키는 토스가 거부한다 — 그 판정은 토스에게 맡긴다. */
  if (!s || /\s/.test(s)) return null;
  if (!/^(?:test|live)_/.test(s)) return null;
  /* 🔴 (2026-08-07 4차) 실제로 «live_ck_...» 라는 **안내문의 자리표시자 글자**가 그대로 등록됐다.
     접두사가 맞아서 전부 통과했고, mode 는 live·key_mismatch 는 false 로 «정상»이라 보고했다.
     = 화면은 실결제라고 말하는데 토스에서만 조용히 전부 실패하는, 가장 나쁜 상태.
     토스 키의 접두사 뒤는 영숫자(위젯키는 `_` 포함)뿐이다 — 점(...)이 들어갈 자리가 없다.
     길이로 막지 않는 대신 «쓸 수 없는 문자»로 자리표시자를 잡는다. */
  if (!/^(?:test|live)_[A-Za-z0-9_-]+$/.test(s)) return null;
  const seg = s.split('_')[1] || '';
  if (!/^[A-Za-z0-9]+$/.test(seg)) return null;
  if (seg.includes('sk')) return 'sk';
  if (seg.includes('ck')) return 'ck';
  return null;
}
export function isTossKeyShaped(v: unknown, kind: 'ck' | 'sk'): boolean {
  return tossKeyRole(v) === kind;
}

/** 실제로 쓸 클라이언트 키 — 모양이 어긋나면 테스트키로 폴백 */
export function tossClientKey(env: any): { key: string; invalid: boolean } {
  const raw = String(env.TOSS_CLIENT_KEY ?? '').trim();
  if (!raw) return { key: TOSS_CLIENT_KEY_DEFAULT, invalid: false };      // 미설정 = 정상 폴백
  if (!isTossKeyShaped(raw, 'ck')) {
    console.warn('[pay] TOSS_CLIENT_KEY 모양이 토스 키가 아님 — 테스트키로 폴백');
    return { key: TOSS_CLIENT_KEY_DEFAULT, invalid: true };               // 잘못 들어옴 = 폴백 + 신고
  }
  return { key: raw, invalid: false };
}
