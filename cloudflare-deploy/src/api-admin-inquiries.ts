/** inquiries: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { json } from './api-util';
import { MANGOI_KNOWLEDGE, matchMangoiFaq } from './mangoi-facts';
import { sendPlainSms } from './solapi-client';

export async function handleAdminInquiriesApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;


    // ═══════════════════════════════════════════════════════════════
    // 💌 Phase I1~I2 — 신규상담 → 등록 전환률
    // ═══════════════════════════════════════════════════════════════

    const ensureInquiryColumns = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS inquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, message TEXT, created_at INTEGER);`);
      // 점진적 ALTER (이미 있으면 무시)
      const cols = ['status TEXT DEFAULT "new"','level TEXT','region TEXT','source TEXT','assigned_to TEXT','notes TEXT','contacted_at INTEGER','registered_at INTEGER','registered_uid TEXT','rejected_reason TEXT','updated_at INTEGER'];
      for (const colDef of cols) {
        try { await env.DB.exec(`ALTER TABLE inquiries ADD COLUMN ${colDef}`); } catch {}
      }
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_inq_status ON inquiries(status, created_at DESC)`); } catch {}
      try { await env.DB.exec(`ALTER TABLE inquiries ADD COLUMN email TEXT`); } catch {}
      try { await env.DB.exec(`ALTER TABLE inquiries ADD COLUMN program TEXT`); } catch {}
    };


    // ── POST /api/consult-bot — 🤖 AI 상담봇 (전화·사람 없이 24시간 자동 응대) ──
    //   body: { message, history?: [{role,content}] } → { ok, reply }
    //   faq.html 의 실제 사실만 근거로 답하고, 모르는 것(특히 요금)은 지어내지 않고 무료 레벨테스트/카카오로 유도.
    if (method === 'POST' && path === '/api/consult-bot') {
      const b: any = await request.json().catch(() => ({}));
      // 한글 유니코드 정규화(NFC) — 자모 분리(NFD) 입력에서도 키워드 매칭이 되도록
      const userMsg = String(b?.message || '').normalize('NFC').trim().slice(0, 800);
      if (!userMsg) return json({ ok: false, error: 'message_required' }, 400);
      const history = Array.isArray(b?.history)
        ? b.history.slice(-6).filter((m: any) => m && m.role && m.content)
            .map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 800) }))
        : [];
      // 📚 사실·FAQ 정본은 src/mangoi-facts.ts 하나뿐입니다.
      //    학부모 상담봇(/api/parent/chat, api-students.ts)이 같은 파일을 씁니다 — 여기에 복사해 두지 마세요.
      const KNOWLEDGE = MANGOI_KNOWLEDGE;
      // 🎯 결정론적 FAQ 응답 — 주제가 매칭되면 사람이 쓴 정확한 답을 그대로 반환(환각 0, 즉시).
      //    우선순위 순서대로 검사하고, 매칭된 답변(최대 2개)을 이어붙여 반환.
      const hits = matchMangoiFaq(userMsg);
      if (hits.length) {
        return json({ ok: true, reply: hits.join('\n\n'), dbg: 'faq' });
      }
      // 매칭 안 되는 자유 질문 → 전체 지식으로 LLM 시도(best-effort), 실패/불확실 시 카톡 유도
      const SYSTEM = [
        "당신은 '망고아이(Mangoi)' 화상영어의 친절한 AI 상담 도우미입니다.",
        '아래 [정보]에 있는 사실만 근거로 한국어 1~3문장으로 정확히 답하세요. [정보]에 없으면(특히 요금) 지어내지 말고 "정확한 안내는 무료 레벨테스트나 카카오 채널로 도와드릴게요"라고 하세요. 전화 상담은 없습니다.',
        '[정보]',
        KNOWLEDGE,
      ].join('\n');
      const fallback = '무엇이 궁금하신지 조금만 더 자세히 알려주시겠어요? 😊 (예: 수업 시간, 레벨테스트, 요금, 장비, 환불 등) 바로 안내해 드릴게요. 정확한 상담은 화면 우하단 카카오 채널도 이용하실 수 있어요.';
      try {
        if (!(env as any).AI) return json({ ok: true, reply: fallback });
        const messages = [{ role: 'system', content: SYSTEM }, ...history, { role: 'user', content: userMsg }];
        const res: any = await (env as any).AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages, max_tokens: 400, temperature: 0.3 });
        const reply = String((res && (res.response || res.result)) || '').trim();
        return json({ ok: true, reply: reply || fallback });
      } catch (e: any) {
        console.warn('[consult-bot] AI err:', e?.message || e);
        return json({ ok: true, reply: fallback });
      }
    }


    // ── POST /api/student/inquiry — 홈 화면 "신규상담" 모달의 공개 제출 엔드포인트 ──
    //   body: { name, contact, email?, program?, message } → inquiries 테이블(관리자 /api/admin/inquiry/* 가 이미 조회)
    if (method === 'POST' && path === '/api/student/inquiry') {
      await ensureInquiryColumns();
      const body: any = await request.json().catch(() => ({}));
      const name = String(body?.name || '').trim().slice(0, 60);
      const contact = String(body?.contact || '').trim().slice(0, 40);
      const email = String(body?.email || '').trim().slice(0, 120);
      const program = String(body?.program || '').trim().slice(0, 60);
      const message = String(body?.message || '').trim().slice(0, 2000);
      if (!name || !contact || !message) {
        return json({ ok: false, error: 'name, contact, message 는 필수입니다.' }, 400);
      }
      const now = Date.now();
      const ins = await env.DB.prepare(
        `INSERT INTO inquiries (name, phone, email, program, message, status, source, created_at) VALUES (?, ?, ?, ?, ?, 'new', 'index.html', ?)`
      ).bind(name, contact, email || null, program || null, message, now).run();
      const inquiryId = ins.meta?.last_row_id;
      // 🔔 새 상담 → 관리자(사장님) 폰으로 내부 문자 알림 (리드 놓침 방지, best-effort)
      //    ※ 고객에게 전화하는 게 아니라 '새 리드 왔다'는 내부 알림 — 답변은 카톡으로.
      try {
        const alertTo = (env as any).OWNER_ALERT_PHONE;
        if (alertTo) {
          const txt = `[망고아이] 🆕 새 상담 신청\n이름: ${name}\n답변받을곳: ${contact}${program ? `\n과정: ${program}` : ''}\n내용: ${message.slice(0, 60)}${message.length > 60 ? '…' : ''}\n관리자 페이지에서 카톡으로 답변해 주세요.`;
          await sendPlainSms(env, alertTo, txt);
        }
      } catch (e: any) { console.warn('[inquiry] owner alert skipped:', e?.message || e); }
      return json({ ok: true, inquiry_id: inquiryId });
    }


    // ── GET /api/admin/inquiry/list?status=&limit= — 상담 목록 ──
    if (method === 'GET' && path === '/api/admin/inquiry/list') {
      await ensureInquiryColumns();
      const status = (url.searchParams.get('status') || '').trim();
      const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10)));
      let sql = `SELECT * FROM inquiries`;
      const binds: any[] = [];
      if (status) { sql += ` WHERE status = ?`; binds.push(status); }
      sql += ` ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ?`;
      binds.push(limit);
      const rs = await env.DB.prepare(sql).bind(...binds).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }


    // ── GET /api/admin/inquiry/stats — 전환률 통계 ──
    if (method === 'GET' && path === '/api/admin/inquiry/stats') {
      await ensureInquiryColumns();
      const d = new Date();
      const thisMonthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const lastMonthStart = new Date(d.getFullYear(), d.getMonth()-1, 1).getTime();
      const last30Start = Date.now() - 30*86400*1000;
      const fetch1 = async (sql: string, ...binds: any[]): Promise<any> => {
        try { return await env.DB.prepare(sql).bind(...binds).first(); }
        catch { return {}; }
      };
      const totalThisMonth: any = await fetch1(`SELECT COUNT(*) AS n FROM inquiries WHERE created_at >= ?`, thisMonthStart);
      const totalLastMonth: any = await fetch1(`SELECT COUNT(*) AS n FROM inquiries WHERE created_at >= ? AND created_at < ?`, lastMonthStart, thisMonthStart);
      const registeredThisMonth: any = await fetch1(`SELECT COUNT(*) AS n FROM inquiries WHERE status='registered' AND COALESCE(registered_at, updated_at, created_at) >= ?`, thisMonthStart);
      const byStatus: any = await env.DB.prepare(`SELECT status, COUNT(*) AS n FROM inquiries GROUP BY status`).all().catch(()=>({results:[]}));
      const statusMap: any = {};
      (byStatus?.results || []).forEach((r:any) => { statusMap[r.status || 'new'] = r.n; });
      // 평균 등록까지 소요 시간
      const avgDays: any = await fetch1(`SELECT AVG((COALESCE(registered_at, updated_at, created_at) - created_at) / 86400000.0) AS avg_days FROM inquiries WHERE status='registered'`);
      // 전환률 = registered / (registered + rejected) (대기중 제외)
      const closed: any = await fetch1(`SELECT COUNT(*) AS n FROM inquiries WHERE status IN ('registered','rejected')`);
      const registered: any = await fetch1(`SELECT COUNT(*) AS n FROM inquiries WHERE status='registered'`);
      const closedN = closed?.n || 0;
      const registeredN = registered?.n || 0;
      const conversionRate = closedN > 0 ? Math.round((registeredN / closedN) * 1000) / 10 : 0;
      const trend = (cur: number, prev: number) => prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur-prev)/prev)*1000)/10;
      return json({
        ok: true,
        total_this_month: totalThisMonth?.n || 0,
        total_last_month: totalLastMonth?.n || 0,
        total_trend: trend(totalThisMonth?.n || 0, totalLastMonth?.n || 0),
        registered_this_month: registeredThisMonth?.n || 0,
        by_status: statusMap,
        conversion_rate: conversionRate,
        avg_days_to_register: Math.round((avgDays?.avg_days || 0) * 10) / 10,
      });
    }


    // ── PATCH /api/admin/inquiry/:id — 상담 상태/메모 변경 ──
    //   body: { status?, notes?, assigned_to?, registered_uid?, rejected_reason?, level?, region? }
    if (method === 'PATCH' && /^\/api\/admin\/inquiry\/\d+$/.test(path)) {
      await ensureInquiryColumns();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const body: any = await request.json().catch(() => ({}));
      const now = Date.now();
      const sets: string[] = ['updated_at = ?'];
      const binds: any[] = [now];
      const fields = ['status','notes','assigned_to','registered_uid','rejected_reason','level','region','source','phone','name','message'];
      for (const f of fields) {
        if (body[f] !== undefined) { sets.push(`${f} = ?`); binds.push(body[f]); }
      }
      // 자동 타임스탬프
      if (body.status === 'contacted') { sets.push('contacted_at = ?'); binds.push(now); }
      if (body.status === 'registered') { sets.push('registered_at = ?'); binds.push(now); }
      binds.push(id);
      await env.DB.prepare(`UPDATE inquiries SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
      const updated: any = await env.DB.prepare(`SELECT * FROM inquiries WHERE id = ?`).bind(id).first();
      return json({ ok: true, id, row: updated });
    }


    // ── DELETE /api/admin/inquiry/:id ──
    if (method === 'DELETE' && /^\/api\/admin\/inquiry\/\d+$/.test(path)) {
      await ensureInquiryColumns();
      const id = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.prepare(`DELETE FROM inquiries WHERE id = ?`).bind(id).run();
      return json({ ok: true, id, deleted: true });
    }
  return null;
}
