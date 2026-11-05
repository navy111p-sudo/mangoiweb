/** bug-reports: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { json } from './api-util';
import { getAdminActor, isOrgScopedRole } from './auth-admin';

export async function handleAdminBugReportsApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;


    // ═══════════════════════════════════════════════════════════════
    // 💌 Phase I1 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 🐞 Phase BUG — 교사 버그/피드백 신고 (교사 제출 → 관리자 접수함)
    //   POST  /api/bug-report          (공개 — 로그인 없이도 받는다. 신원은 아래 규칙)
    //   GET   /api/admin/bug-reports   (관리자 인증 — 목록 + 상태별 카운트)
    //   PATCH /api/admin/bug-reports/:id  (상태/메모 변경) · DELETE /:id
    //
    // 🪪 신고자 신원 (2026-09-13 수리) — «서버 세션이 먼저, 본문 값은 폴백»
    //   ⚠️ 이 자리에 오래 「교사에겐 admin 세션이 없어 신원은 clientside 전달」이라고 적혀
    //      있었는데 **사실이 아니다** — 교사·본사·지사는 `mangoi_admin_session` 쿠키로 로그인한다
    //      (CLAUDE.md 2장 「로그인 세션이 두 갈래」). 그 거짓 전제 위에서 홈 화면 FAB(index.html)
    //      가 `getCurrentUser()`(= 학생 전용 키 `mangoi_logged_user`)로 이름을 읽어 보냈고,
    //      교사는 그 키가 없으니 uid·name 이 **늘 빈 값**으로 저장됐다(2026-09-13 D1 실측:
    //      접수 4건 전부 reporter_uid·reporter_name NULL → 접수함 「신고자」 칸이 「-」).
    //   ✅ 그래서 서버가 세션 쿠키(`getAdminActor`)로 «누가 보냈나» 를 직접 채운다.
    //      세션이 있으면 그 값이 본문보다 «먼저» 다(본문에 남의 이름을 적어도 무시).
    //      세션이 없거나(학생·비로그인) 조회가 던지면 본문 값 그대로 — 신고가 막히는 쪽이 더 나쁘다.
    //   ⛔ index.html(공동 금지구역·첫 화면 여유 9B)은 손대지 않는다 — 서버 한 곳으로 두 화면
    //      (홈 FAB · teacher.html)이 함께 고쳐진다. 감시: test-harness/bug_report_identity_harness.mjs
    //   ⚠️ 남은 구멍(막힌 것이 아니다): 세션이 «없는» 요청의 uid·name 은 여전히 본문 그대로 저장된다 —
    //      이 경로는 무인증이라 누구나 아무 이름으로 신고할 수 있고, 그것은 고치기 «전» 과 같다.
    //      막지 않는 이유: 학생·비로그인 신고를 받아야 하고, 접수함은 관리자만 보는 화면이라 값이
    //      «권한» 을 만들지 않는다. 그 값을 판정·발송에 쓰게 되는 날에는 다시 봐야 한다.
    //   ⚠️ 같은 거짓 전제가 src/index.ts 의 허용목록 주석(「교사에겐 admin 세션 없음」)에 한 줄 더
    //      있다 — 공동 금지구역이라 여기서 못 고쳤다(담당 A). 판정에는 안 쓰이는 주석뿐이다.
    // ═══════════════════════════════════════════════════════════════
    const ensureBugTable = async () => {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS bug_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_role TEXT, reporter_uid TEXT, reporter_name TEXT, category TEXT, message TEXT NOT NULL, page_url TEXT, user_agent TEXT, status TEXT DEFAULT 'new', admin_note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER);`);
      } catch {}
    };

    /* 🪪 «신고자로 무엇을 보여 줄까» — 그리는 화면이 둘(admin.html 접수함 · manager.html)이라
         서버가 한 번 정해 내려준다(화면마다 답이 다른 사고 방지).
         ① name ② 없으면 uid ③ 둘 다 없으면 page_url 의 `vc_name`(2026-09-13 «이전» 행 — 화상수업
            입장 때 주소에 실린 «표기» 이지 계정이 아니다 → via:'url', 화면이 «주소에서» 라고 적는다)
         ⛔ 지어내지 않는다 — 셋 다 없으면 '' (화면이 「-」). ⛔ D1 은 안 건드린다(읽을 때만 보탠다). */
    const bugReporterView = (r: any) => {
      const name = String(r?.reporter_name || '').trim();
      const uid = String(r?.reporter_uid || '').trim();
      if (name) return { shown: name, via: 'name' };
      if (uid) return { shown: uid, via: 'uid' };
      let fromUrl = '';
      try { fromUrl = String(new URL(String(r?.page_url || '')).searchParams.get('vc_name') || '').trim(); } catch {}
      return fromUrl ? { shown: fromUrl, via: 'url' } : { shown: '', via: '' };
    };


    if (method === 'POST' && path === '/api/bug-report') {
      await ensureBugTable();
      const body: any = await request.json().catch(() => ({}));
      const message = String(body?.message || '').trim().slice(0, 2000);
      if (!message) return json({ ok: false, error: 'message 는 필수입니다.' }, 400);
      let reporterRole = (String(body?.reporter_role || '').trim().slice(0, 20)) || 'unknown';
      let reporterUid = (String(body?.reporter_uid || '').trim().slice(0, 80)) || null;
      let reporterName = (String(body?.reporter_name || '').trim().slice(0, 80)) || null;
      // 🪪 세션이 있으면 서버가 아는 신원이 이긴다(머리말 참고). 실패는 삼킨다 — 신고는 받아야 한다.
      try {
        const actor = await getAdminActor(request, env as any);
        if (actor.ok && actor.username) {
          reporterUid = actor.username.slice(0, 80);
          reporterName = (actor.name || reporterName || actor.username).slice(0, 80);
          // 라벨용(권한 판정 아님): 강사 → teacher · 지사/대리점/지사본사 → 그 역할 그대로 · 나머지(본사·내부직원) → admin
          reporterRole = actor.isTeacher ? 'teacher' : (isOrgScopedRole(actor.role) ? actor.role : 'admin');
        }
      } catch (e) { console.warn('[bug-report] actor lookup:', (e as any)?.message); }
      const category = (String(body?.category || '').trim().slice(0, 40)) || 'bug';
      const pageUrl = (String(body?.page_url || '').trim().slice(0, 500)) || null;
      const ua = (String(request.headers.get('user-agent') || '').slice(0, 300)) || null;
      const now = Date.now();
      const ins = await env.DB.prepare(
        `INSERT INTO bug_reports (reporter_role, reporter_uid, reporter_name, category, message, page_url, user_agent, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)`
      ).bind(reporterRole, reporterUid, reporterName, category, message, pageUrl, ua, now).run();
      return json({ ok: true, bug_id: ins.meta?.last_row_id });
    }


    if (method === 'GET' && path === '/api/admin/bug-reports') {
      await ensureBugTable();
      const status = (url.searchParams.get('status') || '').trim();
      const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10)));
      let sql = `SELECT * FROM bug_reports`;
      const binds: any[] = [];
      if (status) { sql += ` WHERE status = ?`; binds.push(status); }
      sql += ` ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ?`;
      binds.push(limit);
      const rs = await env.DB.prepare(sql).bind(...binds).all();
      // 상태별 카운트(관리자 대시보드 미접수 배지용)
      const counts: any = {};
      try {
        const cs: any = await env.DB.prepare(`SELECT status, COUNT(*) AS n FROM bug_reports GROUP BY status`).all();
        (cs?.results || []).forEach((r: any) => { counts[r.status || 'new'] = r.n; });
      } catch {}
      const rows = (rs.results || []).map((r: any) => { const v = bugReporterView(r); return { ...r, reporter_shown: v.shown, reporter_via: v.via }; });
      return json({ ok: true, count: rows.length, rows, counts });
    }


    if (method === 'PATCH' && /^\/api\/admin\/bug-reports\/\d+$/.test(path)) {
      await ensureBugTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const body: any = await request.json().catch(() => ({}));
      const now = Date.now();
      const sets: string[] = ['updated_at = ?'];
      const binds: any[] = [now];
      const fields = ['status', 'admin_note', 'category'];
      for (const f of fields) {
        if (body[f] !== undefined) { sets.push(`${f} = ?`); binds.push(body[f]); }
      }
      binds.push(id);
      await env.DB.prepare(`UPDATE bug_reports SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
      const updated: any = await env.DB.prepare(`SELECT * FROM bug_reports WHERE id = ?`).bind(id).first();
      return json({ ok: true, id, row: updated });
    }


    if (method === 'DELETE' && /^\/api\/admin\/bug-reports\/\d+$/.test(path)) {
      await ensureBugTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.prepare(`DELETE FROM bug_reports WHERE id = ?`).bind(id).run();
      return json({ ok: true, id, deleted: true });
    }
  return null;
}
