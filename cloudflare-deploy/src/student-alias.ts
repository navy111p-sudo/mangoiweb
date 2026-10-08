/* 👥 카페24 «쌍둥이 계정» — 같은 학생의 `X` 와 `mangoai_X` (2026-10-02)
   ═══════════════════════════════════════════════════════════════════════════
   [왜] 카페24에 같은 사람이 두 계정으로 있고(`delaware`↔`mangoai_delaware`, `jjw`↔`mangoai_jjw`,
        2026-09-29 실측), 카페24 미러는 예약을 `mangoai_*` 쪽으로 만든다. 학생은 `X` 로 로그인하므로
        학생 화면(/api/class/sessions/today · /api/class/schedule/mine)이 «계정으로 먼저» 찾을 때
        그 수업이 빠진다. 게다가 계정으로 다른 수업이 하나라도 잡히면 이름 폴백이 아예 안 돌아
        **그 수업만 조용히 사라진다**(2026-10-02 lby01: 14:00 Krystel 수업 없음 · 16:30 만 보임).
        강사는 예약방에, 학생은 다른 방(또는 공용방)에 앉게 된다.

   [규칙] 쌍둥이 후보는 «접두사 하나» 로만 만든다: `X` ↔ `mangoai_X`.
     ✅ 그리고 **두 계정의 이름이 같을 때만** 같은 사람으로 본다 — 이름에서 «MANGOAI» 표식과
        공백을 지운 뒤 정확일치(실측: 「김연숙 MANGOAI」 ↔ 「김연숙」).
     ⛔ 이름이 비었거나 다르거나 조회가 실패하면 **잇지 않는다**(= 예전 동작). 남의 수업이 섞이는 것이
        수업 하나가 안 보이는 것보다 나쁘다.
     ⛔ 부분일치·대소문자 무시 금지 — 동명이인(김민서 71명)과 `Kim`/`kim` 실계정이 있다.
     ⛔ 이 함수로 «쓰기» 하지 말 것 — 읽기(내 수업 찾기) 전용이다.

   감시: test-harness/student_alias_harness.mjs */

const PREFIX = 'mangoai_';

/** 쌍둥이 후보 계정 id (없으면 null). 순수 함수. */
export function twinCandidate(uid: string): string | null {
  const u = String(uid || '').trim();
  if (!u) return null;
  if (u.startsWith(PREFIX)) { const rest = u.slice(PREFIX.length); return rest ? rest : null; }
  return PREFIX + u;
}

/** 비교용 이름 — «MANGOAI» 표식과 공백을 지운다. 순수 함수. */
export function normTwinName(name: any): string {
  return String(name ?? '').replace(/mangoai/gi, '').replace(/\s+/g, '');
}

/** 두 계정이 같은 사람인가 — 이름이 둘 다 있고 정확히 같을 때만. 순수 함수. */
export function sameTwinName(a: any, b: any): boolean {
  const x = normTwinName(a), y = normTwinName(b);
  return x !== '' && x === y;
}

/** 로그인한 학생 uid 의 확인된 쌍둥이 계정 목록(0개 또는 1개). 던지지 않는다 — 실패하면 [](예전 동작). */
export async function resolveStudentTwins(db: any, uid: string): Promise<string[]> {
  const twin = twinCandidate(uid);
  if (!twin) return [];
  try {
    const rs = await db.prepare(
      `SELECT user_id, korean_name, username FROM students_erp WHERE user_id IN (?, ?)`
    ).bind(String(uid).trim(), twin).all();
    const rows: any[] = (rs && rs.results) || [];
    const me = rows.find((r: any) => String(r.user_id) === String(uid).trim());
    const tw = rows.find((r: any) => String(r.user_id) === twin);
    if (!me || !tw) return [];
    const meName = me.korean_name || me.username;
    const twName = tw.korean_name || tw.username;
    return sameTwinName(meName, twName) ? [twin] : [];
  } catch (e: any) {
    console.warn('[student-twin] lookup failed', e?.message || e);
    return [];
  }
}

/* 🚪 (2026-10-06 delaware 김연숙 · LEN) 같은 시간에 «내 계정 예약» 과 «쌍둥이 계정 예약» 이 겹치면
   한쪽만 남긴다.
   [사고] 10/6 21:10 에 `delaware`(LEN, 수강신청 확정 4397)와 `mangoai_delaware`(HANNAH, 카페24 미러 4379 —
        강사를 바꾸기 전 카페24 예약이 남은 것)가 둘 다 잡혔다. 위 쌍둥이 찾기(10/2)로 학생 목록에 둘 다 들어왔고,
        시작 시각이 같아 번호가 작은 4379 로 자동 입장 → LEN 선생님은 4397, 학생은 4379 에서 서로 못 만났다.
   [2026-10-07 개정 — «로그인 계정 우선» 의 구멍] 처음 규칙(#1389)은 «로그인한 계정 쪽» 을 남겼다. 그러면
        학생이 `mangoai_delaware` 로 로그인하는 날 HANNAH 잔재(4379)가 남아 **같은 사고가 그대로 재현된다**
        (twinCandidate 가 양방향이라). 그래서 «누가 로그인했나» 가 아니라 **«어느 예약이 정본인가»** 로 고른다:
        ① 카페24 미러가 «자동으로» 만든 행(source === 'c24-mirror')은 강사 변경 뒤 잔재일 수 있다 → 진다.
        ② 그 밖(수강신청 확정 adm-enroll:* · 결제 enroll:* · 사람이 손댄 c24-mirror:manual · 관리자 등록)이 이긴다.
        ③ 둘이 같은 급이면 정본을 판정할 수 없다 → 예전 규칙(로그인 계정 쪽)으로 떨어지고 `ambiguous` 로 알린다.
           ⛔ 번호·시각으로 «아무거나» 고르지 않는다.
   [규칙] 시간이 «겹칠 때만» 뺀다 — 안 겹치는 쌍둥이 예약은 그대로 둔다(10/2 lby01 의 «그 수업만 사라짐» 구제 유지).
        «내 계정» 은 로그인 uid 와 대소문자만 다른 것까지 포함(위 sessions/today 의 NOCASE 조회와 같은 폭).
   ⛔ 쌍둥이 예약이 «혼자» 있으면 절대 빼지 않는다. ⛔ 같은 계정끼리 겹친 예약은 건드리지 않는다(예전 동작).
   ⛔ 쓰기 금지 — 학생 화면에 «보여 주는 목록» 만 거른다.
   감시: test-harness/student_alias_harness.mjs ④·④-2 */

/** 예약 행의 «정본 급». 높을수록 이긴다. 카페24 미러 자동 행만 0. 순수 함수. */
export function sessionSourceRank(source: any): number {
  return String(source ?? '').trim() === 'c24-mirror' ? 0 : 1;
}

export interface TwinPick<T> { sessions: T[]; dropped: T[]; ambiguous: boolean }

export function pickTwinSessions<T extends { student_uid?: any; start_ts: number; end_ts: number; source?: any }>(sessions: T[], uid: string): TwinPick<T> {
  const same: TwinPick<T> = { sessions, dropped: [], ambiguous: false };
  const me = String(uid || '').trim().toLowerCase();
  if (!me || !Array.isArray(sessions) || sessions.length < 2) return same;
  const twin = String(twinCandidate(me) || '').toLowerCase();
  if (!twin) return same;
  const who = (s: T) => String(s && s.student_uid != null ? s.student_uid : '').trim().toLowerCase();
  const mine = sessions.filter(s => who(s) === me);
  const twins = sessions.filter(s => who(s) === twin);
  if (!mine.length || !twins.length) return same;
  const over = (a: T, b: T) => a.start_ts < b.end_ts && b.start_ts < a.end_ts;
  const drop = new Set<T>();
  let ambiguous = false;
  for (const t of twins) for (const m of mine) {
    if (!over(t, m)) continue;
    const rt = sessionSourceRank(t.source), rm = sessionSourceRank(m.source);
    if (rt < rm) drop.add(t);
    else if (rm < rt) drop.add(m);
    else { drop.add(t); ambiguous = true; }   // 판정 불가 → 예전 규칙(로그인 계정 쪽) + 알림
  }
  if (!drop.size) return same;
  return { sessions: sessions.filter(s => !drop.has(s)), dropped: sessions.filter(s => drop.has(s)), ambiguous };
}

/** 예전 이름 — 걸러진 목록만 돌려준다(배선·하니스 호환). */
export function dropShadowedTwinSessions<T extends { student_uid?: any; start_ts: number; end_ts: number; source?: any }>(sessions: T[], uid: string): T[] {
  return pickTwinSessions(sessions, uid).sessions;
}
