/** teacher-contacts: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { json, parseJsonBody, invalidBody } from './api-util';
import { writeClassAudit } from './class-audit';
import { teacherIdsWithPush } from './teacher-push';
import { getAdminActor } from './auth-admin';

export async function handleAdminTeacherContactsApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;


    // ═════════════════════════════════════════════════════════════════════
    // 2026-07-14: 태초 404 API 4종 구현 — admin.html 이 호출하지만 백엔드가
    // 처음부터 없던 카드들(기준선 대조로 확인, 리팩토링 회귀 아님).
    // index.ts 게이트에는 전부 기등록 → api-mango.ts 위임 가드에만 경로 추가.
    // ═════════════════════════════════════════════════════════════════════

    /* ── 🔗 강사 계정 ↔ 강사 원부 연결 (card-teacher-link) ──────────────────────
     *
     * [왜] 로그인 계정(admin_account)과 수업 배정(class_schedules.teacher_id → teachers.id)은
     *      **이름 문자열**로만 이어져 있었다. 계정 20개 중 18개가 name 을 한 번도 안 바꿔
     *      name === username('mangoi_033') 이라 원부에서 못 찾고, 강사 화면은 «수업이 없다»고
     *      말한다. 실제로는 수업이 있는데 «누구인지 모르는» 것이다.
     *      반대로 'Anna' 가 'H·ANNA·H' 안에 들어가 **남의 수업**이 붙은 사고도 났다.
     *
     * [해법] 이름 추측을 그만두고 **사람이 한 번 정해 주는 정답표**를 둔다.
     *        여기 연결이 있으면 이름 매칭은 아예 건너뛴다(api-teacher.ts 1순위).
     *
     * ⛔ 계정·원부 행 자체는 절대 고치지 않는다. 연결표에만 쓴다 — 되돌리기가 쉬워야 한다.
     */
    if (path.startsWith('/api/admin/teacher-links')) {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_account_links (username TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, teacher_name TEXT, linked_by TEXT, linked_at INTEGER);`);
      } catch {}
    }


    /* ═══════════════════════════════════════════════════════════════════════
       📇 강사 «연락처» 연결  GET/POST /api/admin/teacher-contacts
       ───────────────────────────────────────────────────────────────────────
       [왜] 8/7 결석 알림을 만들다 «강사에게 닿을 방법이 없다» 는 걸 알았다.
            · `teachers`(수업 배정의 기준)에는 연락처 컬럼이 **아예 없다**
            · `teacher_profiles`(연락처가 있는 곳)의 `linked_teacher_id` 는 **전 행 NULL**
            → 수업 → 담당 강사 → 연락처로 가는 다리가 끊겨 있었다. 그래서 8/7 18:00
              레벨테스트에서 강사가 빈 방을 30분 지켰는데 아무 알림도 못 갔다.
       [무엇] 사람이 한 번 «이 원부 강사 = 이 프로필» 을 정한다. `linked_teacher_id` 에만 쓴다.
              (계정↔원부는 teacher_account_links 가 담당 — 이건 원부↔연락처로 서로 다른 다리다)

       🌏 [연락 수단의 현실] 실측: 프로필 30건 중 전화 22(그중 **21건이 필리핀 09xx**, 한국 0),
           이메일 22, 카톡ID 20.  SOLAPI 클라이언트에는 국제 발송 처리가 없고, 카카오 알림톡은
           «한국 번호» 기반이라 kakao_id 로는 못 보낸다.
           → **지금 자동으로 닿는 국제 수단은 이메일뿐**이다. 화면이 그 사실을 숨기지 않고
             행마다 «자동 알림 가능/불가»를 그대로 보여 준다. 안 그러면 연결해 놓고도
             왜 안 가는지 아무도 모른다(=오늘 겪은 그 상황).
       ═══════════════════════════════════════════════════════════════════════ */
    if (path === '/api/admin/teacher-contacts') {
      const normName = (s: any) => String(s || '').toUpperCase().trim();
      const wordsOf = (s: any) => normName(s).split(/[\s·・,/()[\]-]+/).filter(Boolean);
      const isPhPhone = (p: any) => /^(\+?63|0)9\d/.test(String(p || '').replace(/[\s-]/g, ''));
      const isKrPhone = (p: any) => /^(\+?82|0)10/.test(String(p || '').replace(/[\s-]/g, ''));

      if (method === 'GET') {
        const [rosterRs, profRs] = await Promise.all([
          env.DB.prepare(`SELECT id, name FROM teachers WHERE COALESCE(active,1) = 1 ORDER BY name`).all(),
          env.DB.prepare(
            `SELECT id, korean_name, english_name, phone, email, kakao_id, status, linked_teacher_id
               FROM teacher_profiles ORDER BY COALESCE(english_name, korean_name)`
          ).all(),
        ]);
        const roster = (rosterRs.results || []) as any[];
        const profiles = (profRs.results || []) as any[];
        // 🔔 (2026-09-14) 강사 화면에서 「알림 받기」를 켠 원부 강사 — 계정 다리(teacher_account_links)를 거친다.
        const pushIds = await teacherIdsWithPush(env);

        const items = roster.map((t: any) => {
          const target = normName(t.name);
          const linked = profiles.find((p: any) => String(p.linked_teacher_id || '') === String(t.id)) || null;
          /* 후보는 «낱말 경계» 로만 — 'Anna' 가 'HANNAH' 안에 우연히 들어간 것은 후보가 아니다.
             (같은 규칙이 api-teacher.ts·absent-sweep.ts 에도 있다. 세 곳이 어긋나면 사고다) */
          const cands = linked ? [] : profiles.filter((p: any) => {
            if (p.linked_teacher_id) return false;               // 이미 남에게 연결된 프로필은 후보 아님
            for (const nm of [p.english_name, p.korean_name]) {
              const a = normName(nm);
              if (!a) continue;
              if (a === target) return true;
              if (wordsOf(a).indexOf(target) >= 0 || wordsOf(target).indexOf(a) >= 0) return true;
            }
            return false;
          });
          const src = linked;
          const email = src?.email || null;
          const phone = src?.phone || null;
          const kakao = src?.kakao_id || null;
          return {
            teacher_id: String(t.id), teacher_name: t.name,
            linked_profile_id: linked ? String(linked.id) : null,
            linked_profile_name: linked ? (linked.english_name || linked.korean_name) : null,
            email, phone, kakao_id: kakao,
            phone_region: phone ? (isPhPhone(phone) ? 'PH' : isKrPhone(phone) ? 'KR' : 'other') : null,
            /* 🔔 «자동 알림이 실제로 가는가» — 화면에 그대로 보여 준다.
               email 이면 국제 가능, 한국 번호면 문자도 가능, 필리핀 번호·카톡ID 뿐이면 자동은 불가. */
            /* 🔔 (2026-09-14) 웹푸시가 셋째 수단이다 — 카카오는 필리핀 번호에 «구조적으로» 안 닿아(teacher-push.ts)
               사장님이 웹푸시를 고르셨다. 푸시는 «켠 사람에게만» 가므로 이메일·문자와 «함께» 세고, 둘 다 없을 때는
               푸시 하나로도 «닿는다» 로 본다(그 강사에게 실제로 결석 알림이 갑니다 — absent-sweep.ts). */
            push_on: pushIds.has(String(t.id)),
            reachable: !!email || (phone ? isKrPhone(phone) : false) || pushIds.has(String(t.id)),
            reach_by: email ? 'email' : (phone && isKrPhone(phone) ? 'sms' : (pushIds.has(String(t.id)) ? 'push' : null)),
            candidates: cands.map((p: any) => ({
              id: String(p.id), name: p.english_name || p.korean_name,
              email: p.email || null, phone: p.phone || null, kakao_id: p.kakao_id || null,
            })),
          };
        });
        const reachable = items.filter(i => i.reachable).length;
        return json({ ok: true, items, summary: { total: items.length, linked: items.filter(i => i.linked_profile_id).length, reachable } });
      }

      if (method === 'POST') {
        const b = await parseJsonBody(request);
        if (!b || !b.teacher_id) return invalidBody(['teacher_id']);
        const tid = String(b.teacher_id).trim();
        const pid = String(b.profile_id ?? '').trim();
        let actor = 'admin';
        try { const a = await getAdminActor(request, env as any); if (a?.name) actor = a.name; } catch {}

        if (!pid) {   // 해제 — 이 원부에 붙은 프로필의 연결만 푼다
          await env.DB.prepare(`UPDATE teacher_profiles SET linked_teacher_id = NULL, updated_at = ? WHERE CAST(linked_teacher_id AS TEXT) = ?`)
            .bind(Date.now(), tid).run();
          return json({ ok: true, unlinked: true, teacher_id: tid });
        }
        const prof: any = await env.DB.prepare(
          `SELECT id, korean_name, english_name, phone, email, kakao_id FROM teacher_profiles WHERE CAST(id AS TEXT) = ? LIMIT 1`
        ).bind(pid).first();
        if (!prof) return json({ ok: false, error: 'profile_not_found', message: '프로필을 찾을 수 없습니다.', message_en: 'Profile not found.' }, 404);
        // 한 원부에 두 프로필이 붙지 않게 — 먼저 기존 연결을 푼다
        await env.DB.prepare(`UPDATE teacher_profiles SET linked_teacher_id = NULL, updated_at = ? WHERE CAST(linked_teacher_id AS TEXT) = ?`)
          .bind(Date.now(), tid).run();
        await env.DB.prepare(`UPDATE teacher_profiles SET linked_teacher_id = ?, updated_at = ? WHERE CAST(id AS TEXT) = ?`)
          .bind(Number(tid), Date.now(), pid).run();
        try {
          await writeClassAudit(env, {
            action: 'teacher_contact_link', actor, actor_role: 'admin', source: 'admin_ui',
            teacher_name: String(prof.english_name || prof.korean_name || ''),
            detail: JSON.stringify({ teacher_id: tid, profile_id: pid, has_email: !!prof.email, has_phone: !!prof.phone }),
          });
        } catch {}
        return json({
          ok: true, teacher_id: tid, profile_id: pid,
          name: prof.english_name || prof.korean_name,
          email: prof.email || null, phone: prof.phone || null, kakao_id: prof.kakao_id || null,
          reachable: !!prof.email || isKrPhone(prof.phone),
        });
      }
    }


    // 목록 — 강사 계정 + 지금 연결 상태 + 원부 후보. 화면 한 장에 필요한 것만 한 번에.
    if (method === 'GET' && path === '/api/admin/teacher-links') {
      try {
        const [accRs, rosterRs, linkRs] = await Promise.all([
          env.DB.prepare(
            `SELECT username, name, role FROM admin_account
              WHERE role LIKE '%teacher%' OR username LIKE 'mangoi_%' OR username LIKE 'hq_t_%'
              ORDER BY username`
          ).all<any>().catch(() => ({ results: [] as any[] })),
          /* 🚪 active 를 «뽑아서» 내려준다 — 거르지는 않는다.
             왜 뽑나 — 이 목록이 그대로 <option> 이 되는데, 그 연결은 출근·급여가 갈리는 자리다.
               원부에 같은 사람이 두 줄이면(«FAR» id 22 재직 · «HT FARRAH» id 3 퇴사) 여기서
               잘못 고르기 쉽다 — 2026-08-26 에 실제로 그렇게 스케줄 16건이 죽은 행에 붙었다.
               그때까지 이 질의에는 active 가 SELECT 에도 WHERE 에도 없어 화면이 «거를 수조차»
               없었다.
             ⛔ 여기서 WHERE active=1 로 걸러 버리지 말 것 — 화면의 「퇴사 강사도 보기」가
               되돌릴 길인데, 서버가 미리 지우면 그 체크박스가 조용히 무동작이 된다
               (CLAUDE.md 2장 「붙이는 쪽과 읽는 쪽이 짝」). 거르는 것은 화면 몫이다. */
          env.DB.prepare(`SELECT CAST(id AS TEXT) AS id, name, COALESCE(active, 1) AS active FROM teachers ORDER BY name`)
            .all<any>().catch(() => ({ results: [] as any[] })),
          env.DB.prepare(`SELECT username, teacher_id, teacher_name, linked_by, linked_at FROM teacher_account_links`)
            .all<any>().catch(() => ({ results: [] as any[] })),
        ]);
        const roster = (rosterRs.results || []) as any[];
        const linkBy: Record<string, any> = {};
        for (const l of (linkRs.results || []) as any[]) linkBy[String(l.username)] = l;

        // 이름으로 «지금은» 어디에 붙는지 — 연결하기 전에 무엇이 틀렸는지 눈으로 보라고 같이 준다.
        const nrm = (s: any) => String(s || '').toUpperCase().trim();
        const words = (s: any) => nrm(s).split(/[\s·・,/()[\]-]+/).filter(Boolean);
        const accounts = ((accRs.results || []) as any[]).map((a) => {
          const uname = String(a.username || '');
          const tname = String(a.name || '').trim();
          const exact = roster.filter((r) => nrm(r.name) === nrm(tname));
          const word = roster.filter((r) => {
            const x = nrm(r.name), y = nrm(tname);
            return !!x && !!y && x !== y && (words(x).indexOf(y) >= 0 || words(y).indexOf(x) >= 0);
          });
          const auto = exact.length ? exact : (word.length === 1 ? word : []);
          const link = linkBy[uname] || null;
          return {
            username: uname,
            name: tname,
            role: a.role || '',
            // 이름이 계정 아이디 그대로면 «아직 아무도 이름을 안 넣은» 계정이다.
            name_is_username: nrm(tname) === nrm(uname),
            linked_teacher_id: link ? String(link.teacher_id) : null,
            linked_teacher_name: link ? String(link.teacher_name || '') : null,
            linked_at: link ? Number(link.linked_at) || null : null,
            auto_match: auto.length === 1 ? { id: String(auto[0].id), name: String(auto[0].name) } : null,
            auto_candidates: auto.length > 1 ? auto.map((r) => ({ id: String(r.id), name: String(r.name) })) : [],
            status: link ? 'linked' : (auto.length === 1 ? 'auto' : (auto.length > 1 ? 'ambiguous' : 'unlinked')),
          };
        });
        return json({ ok: true, accounts, roster });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'query_failed' }, 500);
      }
    }


    // 연결 / 해제 — teacher_id 를 비우면 해제.
    if (method === 'POST' && path === '/api/admin/teacher-links') {
      const b = await parseJsonBody(request);
      const uname = String(b?.username || '').trim();
      const tid = String(b?.teacher_id ?? '').trim();
      if (!uname) return invalidBody(['username']);
      try {
        if (!tid) {
          await env.DB.prepare(`DELETE FROM teacher_account_links WHERE username = ?`).bind(uname).run();
          return json({ ok: true, unlinked: true, username: uname });
        }
        // 원부에 실제로 있는 id 인지 확인한다 — 오타로 존재하지 않는 사람에게 묶이면 또 «수업 없음»이다.
        const row = await env.DB.prepare(`SELECT CAST(id AS TEXT) AS id, name FROM teachers WHERE CAST(id AS TEXT) = ?`)
          .bind(tid).first<any>();
        if (!row) return json({ ok: false, error: 'teacher_not_found' }, 404);
        let actorName = 'admin';
        try { const a = await getAdminActor(request, env as any); if (a?.name || a?.username) actorName = String(a.name || a.username); } catch {}
        await env.DB.prepare(
          `INSERT INTO teacher_account_links (username, teacher_id, teacher_name, linked_by, linked_at)
             VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(username) DO UPDATE SET
             teacher_id = excluded.teacher_id, teacher_name = excluded.teacher_name,
             linked_by = excluded.linked_by, linked_at = excluded.linked_at`
        ).bind(uname, String(row.id), String(row.name || ''), actorName, Date.now()).run();
        return json({ ok: true, username: uname, teacher_id: String(row.id), teacher_name: String(row.name || '') });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'save_failed' }, 500);
      }
    }
  return null;
}
