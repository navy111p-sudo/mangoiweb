/** counseling: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { json, parseJsonBody, invalidBody, today } from './api-util';

export async function handleAdminCounselingApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;


    /* ── 📅 학생·학부모측 1:1 상담 예약 ────────────────────────────────────────
     * 관리자 쪽(슬롯 열기·목록·취소)은 이미 라이브인데 **학부모가 예약할 창구가 없었다.**
     * 그래서 상담 슬롯을 열어도 아무도 잡을 수 없었다. 그 반쪽을 잇는다. */
    if (path.startsWith('/api/counseling/')) {
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS counseling_slots (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_uid TEXT NOT NULL, date TEXT NOT NULL, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 30, status TEXT DEFAULT 'open', created_at INTEGER);`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS counseling_bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, slot_id INTEGER, staff_uid TEXT, date TEXT, start_time TEXT, parent_name TEXT, parent_phone TEXT, student_uid TEXT, topic TEXT, status TEXT DEFAULT '예약', created_at INTEGER);`); } catch {}
      /* 🪤 `CREATE TABLE IF NOT EXISTS` 는 **표가 이미 있으면 아무것도 안 한다** — 컬럼이 모자라도 그대로 둔다.
       *    실제로 운영 DB 의 counseling_slots 에는 `status` 컬럼이 없어서 조회가 통째로 500 이었다
       *    (라이브 확인: "D1_ERROR: no such column: status"). 그래서 빠진 칸을 멱등하게 보강한다.
       *    ⚠️ 새 컬럼을 쓰는 코드를 올릴 때는 DDL 뿐 아니라 **ALTER 도 같이** 넣을 것. */
      for (const ddl of [
        `ALTER TABLE counseling_slots ADD COLUMN status TEXT DEFAULT 'open'`,
        `ALTER TABLE counseling_slots ADD COLUMN duration_min INTEGER DEFAULT 30`,
        `ALTER TABLE counseling_slots ADD COLUMN staff_uid TEXT`,
        `ALTER TABLE counseling_bookings ADD COLUMN status TEXT DEFAULT '예약'`,
        `ALTER TABLE counseling_bookings ADD COLUMN slot_id INTEGER`,
        `ALTER TABLE counseling_bookings ADD COLUMN parent_phone TEXT`,
        `ALTER TABLE counseling_bookings ADD COLUMN student_uid TEXT`,
        `ALTER TABLE counseling_bookings ADD COLUMN topic TEXT`,
      ]) { try { await env.DB.exec(ddl); } catch {} }   // 이미 있으면 에러 → 무시가 정상
    }

    if (method === 'GET' && path === '/api/counseling/available-slots') {
      const from = String(url.searchParams.get('from') || today()).trim();
      const to = String(url.searchParams.get('to') || '').trim();
      try {
        const rs = to
          ? await env.DB.prepare(
              `SELECT id, date, start_time, duration_min FROM counseling_slots
                WHERE status = 'open' AND date >= ? AND date <= ? ORDER BY date, start_time LIMIT 200`).bind(from, to).all()
          : await env.DB.prepare(
              `SELECT id, date, start_time, duration_min FROM counseling_slots
                WHERE status = 'open' AND date >= ? ORDER BY date, start_time LIMIT 200`).bind(from).all();
        return json({ ok: true, slots: rs.results || [] });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'query_failed' }, 500); }
    }

    if (method === 'POST' && path === '/api/counseling/book') {
      const b = await parseJsonBody(request);
      const slotId = Number(b?.slot_id) || 0;
      const name = String(b?.parent_name || '').trim();
      const phone = String(b?.parent_phone || '').trim();
      if (!slotId || !name || !phone) return invalidBody(['slot_id', 'parent_name', 'parent_phone']);
      try {
        const slot: any = await env.DB.prepare(`SELECT id, staff_uid, date, start_time, status FROM counseling_slots WHERE id = ?`).bind(slotId).first();
        if (!slot) return json({ ok: false, error: 'slot_not_found' }, 404);
        // ⚠️ 이미 잡힌 자리면 거절한다 — 둘이 같은 시간에 잡히면 한 명은 헛걸음한다.
        if (String(slot.status) !== 'open') return json({ ok: false, error: 'slot_taken' }, 409);
        const upd: any = await env.DB.prepare(`UPDATE counseling_slots SET status = 'booked' WHERE id = ? AND status = 'open'`).bind(slotId).run();
        if (!Number(upd?.meta?.changes)) return json({ ok: false, error: 'slot_taken' }, 409);  // 동시 예약 경합
        await env.DB.prepare(
          `INSERT INTO counseling_bookings (slot_id, staff_uid, date, start_time, parent_name, parent_phone, student_uid, topic, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, '예약', ?)`
        ).bind(slotId, slot.staff_uid, slot.date, slot.start_time, name, phone,
               String(b?.student_uid || '').trim() || null, String(b?.topic || '').trim() || null, Date.now()).run();
        return json({ ok: true, booked: { date: slot.date, start_time: slot.start_time },
                      message_ko: '상담이 예약되었습니다.', message_en: 'Your counseling session is booked.' });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'save_failed' }, 500); }
    }


    // ── 📅 1:1 상담 자동 예약 (card-counseling-booking) ──
    //   같은 카드의 버튼 3개(bookings 조회·slot/open·cancel)를 함께 구현해 카드 완동작.
    //   status 값은 프런트 색상 분기('취소'=red, '완료'=green)와 맞춰 한글 사용.
    if (path.startsWith('/api/admin/counseling/')) {
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS counseling_slots (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_uid TEXT NOT NULL, date TEXT NOT NULL, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 30, status TEXT DEFAULT 'open', created_at INTEGER);`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS counseling_bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, slot_id INTEGER, staff_uid TEXT, date TEXT, start_time TEXT, parent_name TEXT, parent_phone TEXT, student_uid TEXT, topic TEXT, status TEXT DEFAULT '예약', created_at INTEGER);`); } catch {}
      /* 🪤 위 `/api/counseling/` 블록과 같은 함정 — CREATE TABLE IF NOT EXISTS 는 표가 이미 있으면
       *    컬럼이 모자라도 그대로 둔다. 이 블록만 ALTER 가 빠져 있어서 슬롯 생성이 항상
       *    "no such column: staff_uid" 로 500 이었다(2026-08-19 실측). */
      for (const ddl of [
        `ALTER TABLE counseling_slots ADD COLUMN status TEXT DEFAULT 'open'`,
        `ALTER TABLE counseling_slots ADD COLUMN duration_min INTEGER DEFAULT 30`,
        `ALTER TABLE counseling_slots ADD COLUMN staff_uid TEXT`,
        `ALTER TABLE counseling_bookings ADD COLUMN status TEXT DEFAULT '예약'`,
        `ALTER TABLE counseling_bookings ADD COLUMN slot_id INTEGER`,
        `ALTER TABLE counseling_bookings ADD COLUMN parent_phone TEXT`,
        `ALTER TABLE counseling_bookings ADD COLUMN student_uid TEXT`,
        `ALTER TABLE counseling_bookings ADD COLUMN topic TEXT`,
      ]) { try { await env.DB.exec(ddl); } catch {} }   // 이미 있으면 에러 → 무시가 정상
    }

    if (method === 'POST' && path === '/api/admin/counseling/slot/open') {
      const b = await parseJsonBody(request);
      const staff = String(b?.staff_uid || '').trim();
      const date = String(b?.date || '').trim();
      const start = String(b?.start_time || '').trim();
      if (!staff || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(start)) return invalidBody(['staff_uid', 'date', 'start_time']);
      const dur = Math.min(Math.max(Number(b?.duration_min) || 30, 5), 240);
      const count = Math.min(Math.max(Number(b?.count) || 1, 1), 20);
      const [hh, mm] = start.split(':').map((n: string) => parseInt(n, 10));
      const now = Date.now();
      try {
        for (let i = 0; i < count; i++) {
          const t = (hh * 60 + mm) + i * dur;
          const st = `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
          await env.DB.prepare(`INSERT INTO counseling_slots (staff_uid, date, start_time, duration_min, status, created_at) VALUES (?,?,?,?,'open',?)`).bind(staff, date, st, dur, now).run();
        }
        return json({ ok: true, count });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'insert_failed' }, 500); }
    }

    if (method === 'GET' && path === '/api/admin/counseling/bookings') {
      try {
        const rs = await env.DB.prepare(`SELECT id, slot_id, staff_uid, date, start_time, parent_name, parent_phone, student_uid, topic, status, created_at FROM counseling_bookings ORDER BY date DESC, start_time DESC, id DESC LIMIT 300`).all();
        return json({ ok: true, list: rs.results || [] });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'query_failed' }, 500); }
    }

    if (method === 'POST' && path === '/api/admin/counseling/cancel') {
      const b = await parseJsonBody(request);
      const id = Number(b?.booking_id);
      if (!Number.isFinite(id) || id <= 0) return invalidBody(['booking_id']);
      try {
        const row = await env.DB.prepare(`SELECT id, slot_id FROM counseling_bookings WHERE id = ?`).bind(id).first<any>();
        if (!row) return json({ ok: false, error: 'not_found' }, 404);
        await env.DB.prepare(`UPDATE counseling_bookings SET status = '취소' WHERE id = ?`).bind(id).run();
        if (row.slot_id) { try { await env.DB.prepare(`UPDATE counseling_slots SET status = 'open' WHERE id = ?`).bind(row.slot_id).run(); } catch {} }
        return json({ ok: true, id });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'update_failed' }, 500); }
    }
  return null;
}
