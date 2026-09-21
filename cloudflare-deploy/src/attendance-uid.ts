/* ═══════════════════════════════════════════════════════════════════════════
   📌 attendance 를 «학생 계정» 으로 찾는 조건 — 정본 한 곳
   ───────────────────────────────────────────────────────────────────────────
   🔴 2026-09-21 실사고 (사장님: 「jeong 은 출결 현황이 없고 각종 자료가 모두 비어있지?」)

   attendance 의 두 칸은 뜻이 다릅니다:
     · user_id     — 화상방이 «접속마다 새로 발급하는» 기기 임시번호 (u_oqipkl162d)
     · account_uid — 로그인 계정 (jeong)

   그런데 «학생 한 명» 을 찾는 자리들이 전부 `WHERE user_id = ?` 에 «계정» 을
   바인딩하고 있었습니다 ⟹ 실측 0건. 에러가 안 나고 «0건» 이 정상값처럼 보여
   화면은 「출석 0일 · 출석률 0%」라고 말했습니다(실제로는 최근 30일 23일·108세션).

   왜 오래 몰랐나 — 카페24가 «예약» 을 attendance 에 미리 만들어 두는데(씨앗),
   그 행은 user_id 가 «계정» 입니다. 실측(2026-09-21, 전체 180,885행):
     · 계정형 user_id + c24- 방 = 177,461행 (실접속 0건)   ← 지금까지 화면이 보던 것
     · 기기번호 user_id + class- 방 = 439행 (실접속 432건) ← 진짜 화상수업, 안 보였음
   ⟹ 카페24 학생은 씨앗 덕에 «채워져» 보여서 화면이 고장난 것으로 안 보였고,
      카페24에 없는 학생(jeong)만 통째로 비어 보였습니다.

   ✅ 그래서 조건을 «바꾸지» 말고 «넓힙니다» — 둘 다 봅니다.
   ⛔ account_uid 만 보도록 바꾸지 마세요. 그 순간 카페24 학생 화면이 통째로
      비어 지금보다 나빠집니다(그 행에는 account_uid 가 없습니다).
   ⛔ 이 조건을 «쓰기»(UPDATE/INSERT/DELETE)에 쓰지 마세요. 넓힌 조건으로 쓰면
      남의 행을 건드립니다. 읽기 전용입니다.
   ⚠️ account_uid 는 2026-08-12 부터 기록되기 시작했습니다 — 그 전 출석은
      계정을 알 방법이 없어 이 조건으로도 안 잡힙니다(원리상 복구 불가).
   ⚠️ 넓히면 카페24 학생은 «씨앗 + 실접속» 이 함께 잡혀 세션 수가 늘어 보입니다.
      둘 다 그 학생의 것이므로 더 정확해지는 방향이지만, 「늘었다」는 제보를
      받으면 이 줄을 떠올리세요.

   감시: test-harness/attendance_account_uid_harness.mjs
     — 진짜 SQLite 에 이 SQL 을 실제로 돌려 «계정으로 찾는다»·«기기번호도 그대로
       찾는다» 를 짝으로 보고, 소스 전수에서 «정본을 안 쓰는 새 자리» 를 잡습니다.
   ═══════════════════════════════════════════════════════════════════════════ */

/** 학생 한 명을 계정으로 찾는 조건. 바인드는 반드시 attUidBinds() 로. */
export function attendanceByUid(alias = ''): string {
  const p = alias ? alias + '.' : '';
  return `(${p}account_uid = ? OR ${p}user_id = ?)`;
}

/** 조건이 물음표 두 개를 쓰므로 바인드도 두 번. 호출부가 개수를 세지 않게 한다. */
export function attUidBinds(uid: string): [string, string] {
  const u = String(uid ?? '');
  return [u, u];
}

/** 별칭 없는 기본형 — 대부분의 자리가 이것을 씁니다. */
export const ATTENDANCE_BY_UID = attendanceByUid();

/* 대소문자를 무시하는 판 — 학생 «본인» 화면처럼 원래 COLLATE NOCASE 로 찾던 자리 전용.
   ⛔ 새 자리에 함부로 쓰지 마세요. 이 서비스에는 `Kim`/`kim` 처럼 «대소문자만 다른 실제
      계정» 이 있어(CLAUDE.md 2장) 넓히면 남의 기록이 섞일 수 있습니다. 여기 있는 이유는
      그 자리들이 **고치기 전부터 NOCASE 였기** 때문이고, 바꾸면 «되던 것» 이 깨집니다. */
export const ATTENDANCE_BY_UID_NOCASE =
  `(account_uid = ? COLLATE NOCASE OR user_id = ? COLLATE NOCASE)`;

/* ── account_uid 칸 보장 (멱등) ────────────────────────────────────────────
   그 칸은 «지연 ALTER» 로 생깁니다(api-mango.ts 의 attendance INSERT 자리).
   운영 DB 에는 이미 있지만, 없는 환경에서 위 조건을 쓰면 prepare 가
   `no such column: account_uid` 로 죽습니다. 읽기 경로가 통째로 사라지는 것을
   막으려고 한 번만 만들어 둡니다.
   ⚠️ 실패해도 던지지 않습니다 — 그때는 호출부의 기존 try/catch 가 받아
      «고치기 전»(0건)으로 떨어집니다. 막는 쪽이 아니라 «예전과 같은» 쪽. */
let _attAccountUidReady = false;
export async function ensureAttendanceAccountUid(env: any): Promise<void> {
  if (_attAccountUidReady) return;
  _attAccountUidReady = true;          // 실패해도 매 요청 재시도하지 않는다
  try {
    await env.DB.exec(`ALTER TABLE attendance ADD COLUMN account_uid TEXT`);
  } catch (e: any) {
    const m = String(e?.message || e);
    if (!/duplicate column/i.test(m)) console.warn('[attendance-uid] account_uid 보장 실패:', m);
  }
  /* 🔴 인덱스가 «반드시» 있어야 합니다 — 없으면 이 조건이 풀스캔입니다.
     [잰 것 — 2026-09-21 운영 D1] account_uid 에 인덱스가 없어
     `(account_uid = ? OR user_id = ?)` 가 EXPLAIN 에서 SCAN 으로 떨어졌고,
     단순 조회 한 번이 rows_read 180,885 였습니다. 날짜 범위가 붙은 쿼리는
     joined_at 인덱스가 잘라 줘서 rows_read 4,417 · 5.3ms 로 괜찮지만,
     «전체 기간» 을 세는 자리(총 세션 수·배지)는 범위가 없어 그대로 풀스캔입니다.
     ⛔ 이 인덱스를 지우지 마세요. */
  try {
    await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_account_date ON attendance(account_uid, date)`);
  } catch (e: any) {
    console.warn('[attendance-uid] account_uid 인덱스 생성 실패:', String(e?.message || e));
  }
}
