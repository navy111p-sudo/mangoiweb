/**
 * 🧑‍🏫 녹화 한 건에 «교사 이름» 과 «교사 로그인 아이디» 를 붙이는 정본
 * ════════════════════════════════════════════════════════════════════════
 *
 * [왜 필요한가 — 2026-09-04 사장님]
 *   관리자 「🎬 녹화 목록」의 「교사」 칸에 **아이디가 그대로** 떴다
 *   (화면 실측: `jye46712`·`jeong`·`heyst`·`교사 Mangoi_168`).
 *   사장님 지시 — 「교사 이름과 아이디가 나오게 해줘. 이름 목록·아이디 목록을 따로
 *   만들어서 거기서 이름과 아이디가 각각 나오게」. 그래서 칸을 둘로 나누고,
 *   그 두 값을 **여기 한 곳에서** 푼다.
 *
 * [왜 `recordings` 의 칸을 그대로 못 쓰나 — 둘 다 «교사» 가 아니다]
 *   ⛔ `recordings.teacher_id` 는 **로그인 계정이 아니다.** 화상방(DO)이 접속마다 새로
 *      발급하는 임시 번호(`u_iyeuu18a2v`)다 — 2026-09-04 운영 실측 2,122행 중
 *      **2,105행(99.2%)이 `u_` 로 시작**한다. 이걸 「아이디」 칸에 그리면 그 순간
 *      화면이 거짓말을 한다. **여기서는 한 번도 읽지 않는다.**
 *   ⚠️ `recordings.teacher_name` 은 «교사» 가 아니라 **«방을 먼저 켠 사람의 표시이름»**
 *      이다(`/api/recordings/start` 가 요청 본문을 그대로 적는다). 실측 2,122행 중
 *      **670행이 학생 계정**(`heyst`·`jye46712`…), 371행만 `교사 ` 접두사가 붙어 있다.
 *      게다가 2026-09-02 부터 **강사는 자동 녹화를 하지 않으므로**(`mango-rec.js`
 *      `isStaffSkipRecording`) 앞으로 이 칸은 «거의 항상 학생» 이 된다.
 *
 * [무엇을 근거로 «교사» 라고 말하는가 — 셋뿐, 전부 완전일치]
 *   ① **예약**(제일 확실) — 방 번호가 `class-<예약id>-<날짜>` 면
 *      `class_schedules.teacher_id` → 이름 `teachers.name`,
 *      아이디 `teacher_account_links.username`.
 *      방 번호는 결정론적이고 `class_schedules.teacher_id` 는 실측 1,400행 **전부 숫자**라
 *      원부(`teachers.id`)와 곧바로 이어진다. (실측 커버리지: `class-*` 녹화 255건 중 **253건**)
 *   ② **표시이름의 계정** — `teacher_name` 이 `교사 <값>` 이면 그 `<값>` 이
 *      `teacher_account_links.username` 과 **완전일치**할 때만 그 강사로 인정한다.
 *   ③ **표시이름의 이름** — `<값>` 이 `teachers.name` 과 완전일치하고 **후보가 유일할 때만**.
 *
 *   ⛔ 부분일치·접두사 매칭 금지, 후보가 둘 이상이면 **붙이지 않는다**
 *      (CLAUDE.md 2장 「강사 이름을 붙였는데 남의 이름이 뜸」 — 강사 번호가 세 벌이라
 *       숫자로 이으면 조용히 남의 이름이 붙고 **에러가 안 난다**).
 *   ⛔ 카페24 강사번호(`attendance.teacher_uid`)로 사람을 찾지 않는다. 그 번호는
 *      원부 번호와 **다른 체계**이고 겹치는 구간에서 서로 다른 사람이다.
 *   ⚠️ 대소문자는 **정확일치 먼저**, 없을 때만 «대소문자만 다른 후보» 를 보되
 *      **유일할 때만** 쓴다(CLAUDE.md 2장 로그인 규칙과 같은 순서).
 *      실측으로 `Mangoi_168`(원부 링크)과 `mangoi_168`(표시이름)이 **둘 다 실재**한다.
 *
 * [「모르면 모른다」 — 지어내지 않는다]
 *   근거가 없으면 이름·아이디를 **빈 값**으로 두고 `source:'none'` 으로 말한다.
 *   ⛔ 학생 계정을 「교사」 칸에 그대로 옮겨 적지 않는다 — 그것이 이번에 고치는 사고다.
 *   학생 계정인지는 `students_erp.user_id` **완전일치**로만 가른다(「있으면 학생」).
 *
 * [실패하면 조용히 빈 값]
 *   이 조회가 죽어도 녹화 목록 자체는 그대로 떠야 한다 — 교사·아이디 칸만 «—» 가 된다.
 *   ⛔ 여기서 예외를 던지지 말 것.
 *
 * 감시: test-harness/recording_teacher_column_harness.mjs
 */

import { selectInChunks } from './d1-chunk';

export interface RecTeacherEnv { DB: D1Database; [k: string]: any }

/** 녹화 목록에서 이 칸들만 본다(테스트에서 가짜 행을 만들기 쉽게 최소로 잡는다). */
export interface RecTeacherRowLike {
  room_id?: string | null;
  /** ⚠️ 「교사」 칸이지만 실제로는 «방을 먼저 켠 사람의 표시이름» 이다. */
  teacher_name?: string | null;
  /* ⛔ `teacher_id` 는 일부러 받지 않는다 — DO 임시번호라 쓸 데가 없다.
       받아 두면 언젠가 누군가 「아이디 칸이 비었네」 하고 그것을 넣는다. */
}

/** 화면이 그리는 교사 한 사람. 못 찾은 값은 **빈 문자열**이다(지어내지 않는다). */
export interface RecTeacher {
  /** 로그인 아이디(`admin_account.username`). 못 찾으면 ''. */
  uid: string;
  /** 교사 이름(원부 `teachers.name`). 못 찾으면 ''. */
  name: string;
  /**
   * 무엇을 근거로 말하는가 — 화면이 「왜 이렇게 나왔나」를 사람에게 설명할 수 있게.
   *   'schedule' … 이 방의 예약에 배정된 강사 (가장 확실)
   *   'account'  … 녹화를 켠 사람의 표시이름이 강사 계정과 완전일치
   *   'roster'   … 표시이름이 원부 이름과 완전일치하고 후보가 유일
   *   'display'  … 표시이름만 있고 계정·원부 어디에도 못 이음 (이름만 참고용)
   *   'none'     … 근거 없음 (대개 학생이 켠 공용방)
   */
  source: 'schedule' | 'account' | 'roster' | 'display' | 'none';
}

const EMPTY: RecTeacher = { uid: '', name: '', source: 'none' };

/** `class-1086-20260901` → 1086. 공용방(`mangoi-class`·`meet-*`)이면 null. */
export function teacherScheduleIdFromRoom(roomId: any): number | null {
  const m = /^class-(\d+)-/.exec(String(roomId || ''));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return isNaN(n) ? null : n;
}

/**
 * 표시이름에서 «사람 부분» 만 떼어낸다.
 *   `교사 Teacher Kaye` → `Teacher Kaye` / `교사 mangoi_114` → `mangoi_114`
 * 접두사가 없으면 **빈 문자열** — 그 값은 「내가 스태프다」라고 말한 적이 없으므로
 * 교사 후보로 삼지 않는다(학생 계정이 그대로 들어오는 자리다).
 *
 * ⚠️ `교사 ` 접두사는 화면이 붙인다(`adm-core.js` 의 `'교사 ' + tname`).
 *    이 낱말이 바뀌면 여기도 함께 바뀌어야 한다 — 하니스가 두 곳을 대조한다.
 */
export function staffDisplaySuffix(displayName: any): string {
  const s = String(displayName == null ? '' : displayName).trim();
  if (!s.startsWith('교사 ')) return '';
  return s.slice('교사 '.length).trim();
}

/**
 * 대소문자만 다른 후보가 **유일할 때만** 그 키를 돌려준다. 아니면 null.
 * ⛔ 둘 이상이면 «아무거나» 고르지 않는다 — 남의 계정을 붙이는 것이 모르는 것보다 나쁘다.
 */
export function uniqueCaseInsensitive(keys: Iterable<string>, want: string): string | null {
  const lower = String(want || '').toLowerCase();
  if (!lower) return null;
  let hit: string | null = null;
  for (const k of keys) {
    if (String(k).toLowerCase() !== lower) continue;
    if (hit !== null) return null;   // 둘 이상 — 모르는 것으로 둔다
    hit = String(k);
  }
  return hit;
}

/**
 * 녹화 행 배열을 받아 **행마다** 교사(이름·아이디)를 돌려준다
 * (입력과 같은 순서·같은 길이). 실패해도 던지지 않는다 — 전부 빈 값이 된다.
 */
export async function resolveRecordingTeachers(
  env: RecTeacherEnv,
  rows: RecTeacherRowLike[],
): Promise<RecTeacher[]> {
  const out: RecTeacher[] = rows.map(() => ({ ...EMPTY }));
  if (!rows.length) return out;

  try {
    // ── ① 후보 모으기 ───────────────────────────────────────────────
    const schedIds = new Set<number>();
    const suffixes = new Set<string>();
    const suffixByRow: string[] = rows.map(r => {
      const sid = teacherScheduleIdFromRoom(r.room_id);
      if (sid != null) schedIds.add(sid);
      const suf = staffDisplaySuffix(r.teacher_name);
      if (suf) suffixes.add(suf);
      return suf;
    });

    // ── ② 예약 → 그 수업의 강사 번호(원부 id) ────────────────────────
    /* `class_schedules.teacher_id` 는 실측 1,400행 전부 숫자(=teachers.id)다.
       ⚠️ 그래도 «로그인 계정명이 그대로 들어간 행» 이 있을 수 있다고 CLAUDE.md 가
          경고한다(오늘은 0건). 숫자가 아니면 아래에서 «계정» 으로 취급한다. */
    const schedTeacherRaw = new Map<number, string>();
    if (schedIds.size) {
      const srows = await selectInChunks<any>(
        env.DB, Array.from(schedIds),
        ph => `SELECT id, teacher_id FROM class_schedules WHERE id IN (${ph})`,
      );
      for (const s of srows) {
        const raw = String(s.teacher_id == null ? '' : s.teacher_id).trim();
        if (raw) schedTeacherRaw.set(Number(s.id), raw);
      }
    }

    // ── ③ 원부 번호 → 이름 ─────────────────────────────────────────
    const rosterIds = new Set<string>();
    for (const raw of schedTeacherRaw.values()) if (/^\d+$/.test(raw)) rosterIds.add(raw);

    const nameByRosterId = new Map<string, string>();
    if (rosterIds.size) {
      const trows = await selectInChunks<any>(
        env.DB, Array.from(rosterIds),
        ph => `SELECT id, name FROM teachers WHERE CAST(id AS TEXT) IN (${ph})`,
      );
      for (const t of trows) nameByRosterId.set(String(t.id), String(t.name || '').trim());
    }

    // ── ④ 원부 번호 → 로그인 아이디 ────────────────────────────────
    /* ⚠️ 연결이 둘 이상인 강사가 실재한다(`mangoi_168`·`Mangoi_168`).
         명부 화면의 정본(api-admin.ts `PICK_LOGIN_USERNAME`)과 **같은 규칙**으로
         「가장 최근에 연결한 것 하나」를 고른다 — 두 화면이 다른 계정을 보여 주면 안 된다. */
    const loginByRosterId = new Map<string, string>();
    if (rosterIds.size) {
      const lrows = await selectInChunks<any>(
        env.DB, Array.from(rosterIds),
        ph => `SELECT teacher_id, username, COALESCE(linked_at, 0) AS linked_at
                 FROM teacher_account_links
                WHERE CAST(teacher_id AS TEXT) IN (${ph})
                ORDER BY linked_at DESC, username ASC`,
      );
      for (const l of lrows) {
        const k = String(l.teacher_id);
        if (!loginByRosterId.has(k)) loginByRosterId.set(k, String(l.username || '').trim());
      }
    }

    // ── ⑤ 표시이름 후보 → 계정/원부 이름 ───────────────────────────
    /* 「강사 계정 전부」를 한 번에 읽는다. 링크 표는 강사 수만큼(실측 22행)이라 작다.
       ⛔ 후보를 `IN` 으로 넘겨 «찾기» 를 서버에 맡기면 대소문자 후보를 셀 수 없다
          (정확일치가 없을 때 «유일한가» 를 판정하려면 목록이 필요하다). */
    const linkByUsername = new Map<string, { rosterId: string; name: string }>();
    const rosterIdByName = new Map<string, string[]>();
    /* ⚠️ 표시이름 후보가 없어도 «예약에 계정명이 그대로 들어간 행» 이 있으면 읽어야 한다.
         안 그러면 그 행의 이름이 조용히 빈 값이 된다(하니스가 실제로 잡은 결함). */
    let needLookupTables = suffixes.size > 0;
    if (!needLookupTables) {
      for (const raw of schedTeacherRaw.values()) if (!/^\d+$/.test(raw)) { needLookupTables = true; break; }
    }
    if (needLookupTables) {
      const allLinks = await env.DB.prepare(
        `SELECT username, teacher_id, teacher_name FROM teacher_account_links`,
      ).all();
      for (const l of ((allLinks?.results || []) as any[])) {
        const u = String(l.username || '').trim();
        if (!u) continue;
        linkByUsername.set(u, {
          rosterId: String(l.teacher_id == null ? '' : l.teacher_id).trim(),
          name: String(l.teacher_name || '').trim(),
        });
      }
      const allTeachers = await env.DB.prepare(
        `SELECT id, name FROM teachers`,
      ).all();
      for (const t of ((allTeachers?.results || []) as any[])) {
        const nm = String(t.name || '').trim();
        if (!nm) continue;
        const arr = rosterIdByName.get(nm) || [];
        arr.push(String(t.id));
        rosterIdByName.set(nm, arr);
        if (!nameByRosterId.has(String(t.id))) nameByRosterId.set(String(t.id), nm);
      }
      // 링크 표에만 이름이 있는 경우(원부에서 지워진 강사)도 이름 조회에 쓴다.
      for (const [, v] of linkByUsername) {
        if (v.rosterId && v.name && !nameByRosterId.has(v.rosterId)) {
          nameByRosterId.set(v.rosterId, v.name);
        }
      }
    }

    // ── ⑥ 「이 후보가 학생인가」 ────────────────────────────────────
    /* 학생 계정이면 교사가 아니다 — 지금 「교사」 칸에 학생 아이디가 뜨는 사고의 원인이다.
       ⚠️ 대소문자는 «적힌 그대로» 찾는다(NOCASE 아님). `students_erp.user_id` 는
          BINARY PK 라 `Kim`/`kim` 처럼 대소문자만 다른 행이 실재한다. */
    const studentUids = new Set<string>();
    if (suffixes.size) {
      const erows = await selectInChunks<any>(
        env.DB, Array.from(suffixes),
        ph => `SELECT user_id FROM students_erp WHERE user_id IN (${ph})`,
      );
      for (const e of erows) studentUids.add(String(e.user_id));
    }

    // ── ⑦ 행마다 조립 ──────────────────────────────────────────────
    const fromRosterId = (rid: string, source: RecTeacher['source']): RecTeacher => ({
      uid: loginByRosterId.get(rid) || (linkByUsernameOfRoster(rid) || ''),
      name: nameByRosterId.get(rid) || '',
      source,
    });
    function linkByUsernameOfRoster(rid: string): string {
      for (const [u, v] of linkByUsername) if (v.rosterId === rid) return u;
      return '';
    }

    rows.forEach((r, i) => {
      // ① 예약이 있으면 그것이 정본이다.
      const sid = teacherScheduleIdFromRoom(r.room_id);
      const raw = sid == null ? '' : (schedTeacherRaw.get(sid) || '');
      if (raw) {
        if (/^\d+$/.test(raw)) {
          const t = fromRosterId(raw, 'schedule');
          if (t.uid || t.name) { out[i] = t; return; }
        } else {
          // 숫자가 아니면 «로그인 계정명이 그대로 들어간 행» (CLAUDE.md 경고, 오늘은 0건)
          const link = linkByUsername.get(raw);
          out[i] = {
            uid: raw,
            name: link ? (nameByRosterId.get(link.rosterId) || link.name || '') : '',
            source: 'schedule',
          };
          return;
        }
      }

      // ② 표시이름 — `교사 ` 접두사가 붙은 것만 후보로 본다.
      const suf = suffixByRow[i];
      if (!suf) return;                       // 근거 없음 → 'none'
      if (studentUids.has(suf)) return;       // 학생 계정 → 교사 아님 → 'none'

      const exact = linkByUsername.get(suf);
      if (exact) {
        out[i] = {
          uid: suf,
          name: nameByRosterId.get(exact.rosterId) || exact.name || '',
          source: 'account',
        };
        return;
      }
      const ci = uniqueCaseInsensitive(linkByUsername.keys(), suf);
      if (ci) {
        const v = linkByUsername.get(ci)!;
        out[i] = {
          uid: ci,
          name: nameByRosterId.get(v.rosterId) || v.name || '',
          source: 'account',
        };
        return;
      }

      // ③ 원부 이름과 완전일치 + 후보가 유일할 때만.
      const byName = rosterIdByName.get(suf);
      if (byName && byName.length === 1) {
        const t = fromRosterId(byName[0], 'roster');
        if (t.uid || t.name) { out[i] = t; return; }
      }

      // ④ 어디에도 못 이었다 — 이름만 참고로 남긴다(아이디는 «모름»).
      out[i] = { uid: '', name: suf, source: 'display' };
    });
  } catch (e: any) {
    console.error('[recordings] 교사 칸 조회 실패(목록은 그대로 표시):', e?.message || e);
    return rows.map(() => ({ ...EMPTY }));
  }

  return out;
}
