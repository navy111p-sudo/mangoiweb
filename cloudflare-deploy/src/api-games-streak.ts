// 출석 체크인·보석·출결 기반 상태·리더보드 API.
import { json } from './api-util';
import type { MangoEnv } from './api-mango';
import { resolveOwnerScope, checkAdminSession } from './auth-admin';
import { ATTENDANCE_BY_UID, attUidBinds } from './attendance-uid';
import { computeAttendanceStreak, reconcileAllStreaks } from './api-games-attendance-streak';

export async function handleStreakApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
    // ═══════════════════════════════════════════════════════════════
    // 🔥 Phase ST — 데일리 스트릭 + 보석 시스템 (Duolingo)
    // ═══════════════════════════════════════════════════════════════
    const ensureStreakSchema = async () => {
      // D1 의 exec() 는 멀티라인 SQL 미지원 — 반드시 한 줄로
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_streaks (student_uid TEXT PRIMARY KEY, current_streak INTEGER DEFAULT 0, longest_streak INTEGER DEFAULT 0, last_check_date TEXT, gems INTEGER DEFAULT 0, total_gems_earned INTEGER DEFAULT 0, updated_at INTEGER);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS gem_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT NOT NULL, balance_after INTEGER, created_at INTEGER NOT NULL);`);
      // 출결 기반 streak DFS 가 인덱스 시크로 끝나도록 보장 (멱등)
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date)`); } catch {}
    };

    // 오늘 날짜 (KST, YYYY-MM-DD)
    const todayKST = (): string => {
      const now = new Date(Date.now() + 9 * 3600 * 1000);
      return now.toISOString().slice(0, 10);
    };
    const dayDiff = (a: string, b: string): number => {
      const da = new Date(a + 'T00:00:00Z').getTime();
      const db = new Date(b + 'T00:00:00Z').getTime();
      return Math.round((db - da) / 86400000);
    };

    if (method === 'POST' && path === '/api/streak/check-in') {
      await ensureStreakSchema();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.uid || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 [무결성] 본인만 출석 체크 — 임의 uid 로 남의 스트릭·보석 조작 차단 (2026-07-19).
      //   게스트(guest*)는 통과(랜덤 uid, 실계정 무관), 실계정은 토큰 소유자 OR 관리자 (earn-by-rule 과 동일 패턴).
      // 🔐 본인만 출석 체크(스트릭·보석 조작 차단). 게스트는 통과. [공용 헬퍼]
      if ((await resolveOwnerScope(request, url, env as any, uid, b)) === 'deny') {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 본인만 출석할 수 있습니다.' }, 401);
      }

      const today = todayKST();
      const now = Date.now();
      let row: any = await env.DB.prepare(
        `SELECT current_streak, longest_streak, last_check_date, gems, total_gems_earned FROM student_streaks WHERE student_uid = ?`
      ).bind(uid).first();

      let already_today = false;
      let earned = 0;
      let bonus_msg = '';
      let new_streak = 1;
      let new_longest = 1;
      let new_gems = 0;
      let new_total_earned = 0;

      if (!row) {
        // 신규 — 첫 출석
        earned = 10;
        new_streak = 1;
        new_longest = 1;
        new_gems = earned;
        new_total_earned = earned;
        await env.DB.prepare(
          `INSERT INTO student_streaks (student_uid, current_streak, longest_streak, last_check_date, gems, total_gems_earned, updated_at) VALUES (?,?,?,?,?,?,?)`
        ).bind(uid, new_streak, new_longest, today, new_gems, new_total_earned, now).run();
        bonus_msg = '🎉 첫 출석! 보석 +10';
      } else {
        const last = row.last_check_date as string;
        if (last === today) {
          already_today = true;
          new_streak = row.current_streak;
          new_longest = row.longest_streak;
          new_gems = row.gems;
          new_total_earned = row.total_gems_earned;
          bonus_msg = '오늘 이미 출석했습니다';
        } else {
          const diff = dayDiff(last, today);
          new_streak = diff === 1 ? row.current_streak + 1 : 1;
          new_longest = Math.max(row.longest_streak, new_streak);

          // 기본 보상 10 + streak 보너스
          earned = 10;
          if (new_streak >= 30) { earned += 50; bonus_msg = '🏆 30일 연속! 보너스 +50'; }
          else if (new_streak >= 14) { earned += 30; bonus_msg = '🔥 2주 연속! 보너스 +30'; }
          else if (new_streak >= 7) { earned += 20; bonus_msg = '✨ 7일 연속! 보너스 +20'; }
          else if (new_streak >= 3) { earned += 5; bonus_msg = '💪 3일 연속! 보너스 +5'; }
          else { bonus_msg = `💎 출석 보석 +${earned}`; }

          new_gems = row.gems + earned;
          new_total_earned = row.total_gems_earned + earned;
          await env.DB.prepare(
            `UPDATE student_streaks SET current_streak = ?, longest_streak = ?, last_check_date = ?, gems = ?, total_gems_earned = ?, updated_at = ? WHERE student_uid = ?`
          ).bind(new_streak, new_longest, today, new_gems, new_total_earned, now, uid).run();
        }
      }

      if (earned > 0) {
        await env.DB.prepare(
          `INSERT INTO gem_transactions (student_uid, amount, reason, balance_after, created_at) VALUES (?,?,?,?,?)`
        ).bind(uid, earned, `daily_checkin_${new_streak}d`, new_gems, now).run();
      }

      return json({
        ok: true, already_today,
        current_streak: new_streak, longest_streak: new_longest,
        gems: new_gems, total_gems_earned: new_total_earned,
        earned, bonus_msg, today,
      });
    }

    if (method === 'GET' && path === '/api/streak/status') {
      await ensureStreakSchema();
      const uid = String(url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 [IDOR] 본인(토큰) 또는 관리자만 — 남의 스트릭·보석 조회 차단. [공용 헬퍼, strict=게스트 미허용]
      if (!['admin', 'self'].includes(await resolveOwnerScope(request, url, env as any, uid))) {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 본인 스트릭만 조회할 수 있습니다.' }, 401);
      }
      const today = todayKST();
      const now = Date.now();

      // 🔗 단일 권위: 실제 출결(attendance)을 역방향 DFS 로 계산 → 게이미피케이션
      //    student_streaks 와 "두 수치"가 어긋나지 않도록 여기서 일원화한다.
      const attStreak = await computeAttendanceStreak(env, uid);
      const at: any = await env.DB.prepare(
        `SELECT 1 FROM attendance WHERE ${ATTENDANCE_BY_UID} AND date = ? LIMIT 1`
      ).bind(...attUidBinds(uid), today).first();
      const attended_today = !!at;

      const row: any = await env.DB.prepare(
        `SELECT current_streak, longest_streak, last_check_date, gems, total_gems_earned FROM student_streaks WHERE student_uid = ?`
      ).bind(uid).first();

      // gems 는 체크인 보상 레이어이므로 보존. streak 수치만 출결 기준으로 동기화.
      const longest = Math.max(Number(row?.longest_streak || 0), attStreak);
      if (!row) {
        // 출결은 있는데 게임 row 가 없던 학생 → 리더보드 일관성 위해 streak row 생성 (gems=0)
        if (attStreak > 0) {
          await env.DB.prepare(
            `INSERT INTO student_streaks (student_uid, current_streak, longest_streak, last_check_date, gems, total_gems_earned, updated_at) VALUES (?,?,?,?,?,?,?)`
          ).bind(uid, attStreak, longest, attended_today ? today : null, 0, 0, now).run();
        }
      } else if (row.current_streak !== attStreak || row.longest_streak !== longest) {
        // 저장된 수치가 출결과 다르면 출결 기준으로 정합화 (gems/체크인일은 건드리지 않음)
        await env.DB.prepare(
          `UPDATE student_streaks SET current_streak = ?, longest_streak = ?, updated_at = ? WHERE student_uid = ?`
        ).bind(attStreak, longest, now, uid).run();
      }

      return json({
        ok: true,
        current_streak: attStreak,           // 출결 기반 "진짜 연속" (단일 권위)
        longest_streak: longest,
        gems: Number(row?.gems || 0),
        total_gems_earned: Number(row?.total_gems_earned || 0),
        last_check_date: row?.last_check_date || null,
        attended_today,                       // 오늘 실제 출석 여부 (출결 기준)
        checked_today: attended_today,        // 하위호환: 기존 필드명 유지
        source: 'attendance',
        today,
      });
    }

    // 🏷 리더보드 SQL — 아이디(student_uid)에 «학생 이름» 을 붙여서 돌려준다.
    //   student_streaks 에는 아이디만 있다(출결 attendance.user_id 를 그대로 씀).
    //   관리자 화면이 예전엔 erp-list 를 받아 클라에서 이름을 맞췄는데,
    //   실데이터는 students_erp 에 없는 아이디가 많아 이름 칸에 아이디가 그대로 찍혔다.
    //   → 이름의 출처를 서버 한 곳으로 모은다:
    //      ① students_erp (PK user_id 로 join — 인덱스 있음)
    //      ② 없으면 attendance.username (출결에 남은 이름. idx_attendance_user_date 사용)
    //      ③ 둘 다 없으면 null → 화면이 아이디로 대체 표기
    //   상위 20명만 CTE 로 먼저 자르고 join 하므로 비용은 종전 스캔 + α (실측 0.8ms).
    const STREAK_LEADERBOARD_SQL = `
      WITH top AS (
        SELECT student_uid, current_streak, longest_streak, gems
        FROM student_streaks
        ORDER BY current_streak DESC, gems DESC
        LIMIT 20
      )
      SELECT t.student_uid, t.current_streak, t.longest_streak, t.gems,
             COALESCE(
               NULLIF(TRIM(COALESCE(e.korean_name, e.student_name, e.username, '')), ''),
               (SELECT a.username FROM attendance a
                 WHERE a.user_id = t.student_uid
                   AND a.username IS NOT NULL AND TRIM(a.username) <> ''
                 ORDER BY a.id DESC LIMIT 1)
             ) AS student_name
      FROM top t
      LEFT JOIN students_erp e ON e.user_id = t.student_uid
      ORDER BY t.current_streak DESC, t.gems DESC`;

    if (method === 'GET' && path === '/api/streak/leaderboard') {
      await ensureStreakSchema();
      const rs = await env.DB.prepare(STREAK_LEADERBOARD_SQL).all();
      const items = (rs.results || []) as any[];
      // 관리자 화면(adm-core.js «연속 출석 랭킹»)은 같은 주소를 쿠키로 부른다 — 관리자 세션이면 종전 그대로.
      if ((await checkAdminSession(request, env as any)).ok) return json({ ok: true, items });
      /* 🔴 (2026-11-09) 공개 응답에 student_uid 를 더는 담지 않는다 — /api/points/leaderboard 와 같은 이유
         (학생 비밀번호가 없어 «아이디 = 로그인»). 이름이 아이디와 같으면 이름도 뺀다. 본인 표시는 서버가 me 로만. */
      const meUid = (url.searchParams.get('uid') || '').trim();
      // 게스트는 공개 순위에서 뺀다(포인트 랭킹과 같은 규칙 · resolveOwnerScope 도 /^guest/i)
      return json({ ok: true, items: items.filter((r) => !/^guest/i.test(String(r.student_uid || ''))).map((r) => {
        const uidStr = String(r.student_uid || '');
        const nm = String(r.student_name || '').trim();
        return {
          student_name: (nm && nm !== uidStr) ? nm : null,
          current_streak: Number(r.current_streak) || 0,
          longest_streak: Number(r.longest_streak) || 0,
          me: !!meUid && uidStr === meUid,
        };
      }) });
    }

    // 🔁 관리자 수동 트리거 — 전 학생 streak 일괄 정합화 (출결 기준)
    //   야간 cron(KST 03:00)과 동일한 reconcileAllStreaks 를 즉시 1회 실행.
    //   인증: 상단 /api/admin/* 관리자 세션 미들웨어가 이미 401 게이트.
    //   POST = 실행, 실행 후 갱신된 리더보드 상위 20명을 함께 반환해 효과 확인.
    if (method === 'POST' && path === '/api/admin/streak/reconcile') {
      const rc = await reconcileAllStreaks(env);
      const rs = await env.DB.prepare(STREAK_LEADERBOARD_SQL).all();
      return json({ ok: true, reconciled: rc, leaderboard: rs.results || [] });
    }
    // ═══════════════════════════════════════════════════════════════
    // 🔥 Phase ST 끝
    // ═══════════════════════════════════════════════════════════════


  return null;
}
