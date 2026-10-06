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
   쌍둥이 쪽을 뺀다.
   [사고] 10/6 21:10 에 `delaware`(LEN, 수강신청 확정 4397)와 `mangoai_delaware`(HANNAH, 카페24 미러 4379 —
        강사를 바꾸기 전 카페24 예약이 남은 것)가 둘 다 잡혔다. 위 쌍둥이 찾기(10/2)로 학생 목록에 둘 다 들어왔고,
        시작 시각이 같아 번호가 작은 4379 로 자동 입장 → LEN 선생님은 4397, 학생은 4379 에서 서로 못 만났다.
        10/1 에는 쌍둥이 찾기가 없어 정상으로 만났다(녹화 class-4396 43분).
   [규칙] 시간이 «겹칠 때만» 뺀다 — 안 겹치는 쌍둥이 예약은 그대로 둔다(10/2 lby01 의 «그 수업만 사라짐» 구제 유지).
        «내 계정» 은 로그인 uid 와 대소문자만 다른 것까지 포함(위 sessions/today 의 NOCASE 조회와 같은 폭).
   ⛔ 쌍둥이 예약이 «혼자» 있으면 절대 빼지 않는다. ⛔ 쓰기 금지 — 학생 화면에 «보여 주는 목록» 만 거른다. */
export function dropShadowedTwinSessions<T extends { student_uid?: any; start_ts: number; end_ts: number }>(sessions: T[], uid: string): T[] {
  const me = String(uid || '').trim().toLowerCase();
  if (!me || !Array.isArray(sessions) || sessions.length < 2) return sessions;
  const twin = String(twinCandidate(me) || '').toLowerCase();
  if (!twin) return sessions;
  const who = (s: T) => String(s && s.student_uid != null ? s.student_uid : '').trim().toLowerCase();
  const mine = sessions.filter(s => who(s) === me);
  if (!mine.length) return sessions;
  return sessions.filter(s => {
    if (who(s) !== twin) return true;
    return !mine.some(m => s.start_ts < m.end_ts && m.start_ts < s.end_ts);
  });
}
