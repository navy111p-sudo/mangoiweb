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
