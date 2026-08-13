// ═══════════════════════════════════════════════════════════════════════
// 💬 teacher-kakao.ts — 강사 카카오ID 명부 + 강사에게 메시지 전달
//   (2026-08-13) 필리핀 강사 카카오ID 26건을 강사 명부에 넣고,
//   관리자 화면에서 «각 강사에게 바로» 메시지를 보낼 수 있게 한다.
//
// ⚠️ 먼저 알아야 할 사실 — 「카카오ID 로 자동 발송」은 불가능합니다.
//   카카오톡은 «카카오ID로 메시지를 보내는» 공개 API 를 제공하지 않습니다(오픈채팅·친구
//   목록 모두 마찬가지). 카카오 비즈메시지(알림톡/친구톡)는 «전화번호» 로 보내고,
//   그나마도 **한국 통신사 번호로 가입된 카카오계정**에만 도달합니다.
//   여기 강사들은 필리핀 번호(09xx)라 알림톡은 도달하지 않습니다.
//   그래서 이 모듈은 «실제로 되는 두 경로» 만 씁니다.
//
//   ① 문자 자동발송 (auto)  — 번호가 있으면 SOLAPI 로 즉시 발송.
//        · 한국 번호(010…)  → 국내 SMS/LMS
//        · 필리핀 번호(09…) → 해외문자(country=63). SOLAPI 계정에 «해외 발송» 이
//          열려 있어야 하며, 안 열려 있으면 그 강사 행에 오류코드가 그대로 표시됩니다.
//   ② 카카오톡 원클릭 전달 (manual) — 본문을 클립보드에 넣고 카카오톡을 열어 줍니다.
//        관리자는 해당 카카오ID 채팅방에 붙여넣기만 하면 됩니다. 보낸 뒤 «보냄» 을
//        누르면 이력에 남습니다. 카카오ID밖에 없는 강사는 이 경로만 가능합니다.
//
//   두 경로 모두 teacher_kakao_log 에 남습니다 — «누가·언제·누구에게·무엇을».
// ═══════════════════════════════════════════════════════════════════════
import { json, parseJsonBody } from './api-util';
import { getAdminActor } from './auth-admin';
import { sendPlainSms, getSolapiMode } from './solapi-client';

export interface TeacherKakaoEnv {
  DB: D1Database;
  [k: string]: any;
}

// ─────────────────────────────────────────────────────────────
//  📇 카카오ID 정본 — 2026-08-13 운영진 제공 목록(26건)
//    target = teacher_profiles 의 이름(korean_name 또는 english_name)과 «정확히» 맞는 값.
//    ⚠️ target 이 null 인 건 «어느 강사인지 모르는» ID 입니다. 추측으로 붙이면 엉뚱한
//       강사에게 급여·수업 안내가 나가므로 자동으로 붙이지 않고, 미배정함에 넣어
//       관리자가 화면에서 직접 고르게 합니다.
// ─────────────────────────────────────────────────────────────
export const PH_TEACHER_KAKAO_SEED: Array<{ kakao_id: string; target: string | null; note?: string }> = [
  { kakao_id: '@teacher_belle',         target: null, note: '카카오 채널(@) 형식 — Teacher Belle 의 채널인지 확인 필요' },
  { kakao_id: 'Elle2586',               target: 'Teacher Far' },
  { kakao_id: 'ussiejag',               target: 'Teacher Janice' },
  { kakao_id: 'TeacherCindy',           target: 'Teacher Cindy' },
  { kakao_id: 'kes2729',                target: 'Teacher Kes' },
  { kakao_id: '95_98cmd',               target: 'Teacher Jane' },
  { kakao_id: 'jpsimbajon86@gmail.com', target: 'Teacher JP' },
  { kakao_id: 'TeacherAna18',           target: 'Teacher Ana' },
  { kakao_id: 'Xianne1',                target: 'Teacher Kaye' },
  { kakao_id: 'Shasil',                 target: 'Teacher Shas' },
  { kakao_id: 'Teacher Len',            target: 'Teacher Len' },
  { kakao_id: 'nessy_me',               target: 'Teacher Ness' },
  { kakao_id: 'TeacherJenny',           target: 'Teacher Jenny' },
  { kakao_id: 'jinseol19',              target: 'Teacher Jinette' },
  { kakao_id: 'teacherhannah_0424',     target: 'Teacher Hannah' },
  { kakao_id: 'iamchaineteacher',       target: 'Teacher Chaine' },
  { kakao_id: 'Mariane23',              target: 'Teacher Mariane' },
  { kakao_id: 'TeacherKrystel',         target: 'Teacher Krystel' },
  { kakao_id: 'Teacher.Belle',          target: 'Teacher Belle' },
  { kakao_id: 'Teacher.Sid_29',         target: 'Teacher Sid' },
  { kakao_id: 'Teacher_Zee',            target: 'Teacher Zee' },
  { kakao_id: 'TEACHERWIN',             target: 'Teacher Win' },
  { kakao_id: 'eslteacher_juanie',      target: 'Teacher Wan' },
  { kakao_id: 'welm',                   target: null, note: '이름 단서 없음 — 어느 강사인지 확인 필요' },
  { kakao_id: 'Melca08',                target: 'Melca' },
  { kakao_id: 'karlito',                target: 'Karl' },
];

let _tkSchemaReady = false;
async function ensureTeacherKakaoSchema(env: TeacherKakaoEnv): Promise<void> {
  if (_tkSchemaReady) return;
  await env.DB.exec([
    `CREATE TABLE IF NOT EXISTS teacher_kakao_log (`,
    `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    `  profile_id INTEGER,`,
    `  teacher_name TEXT,`,
    `  kakao_id TEXT,`,
    `  phone TEXT,`,
    `  channel TEXT NOT NULL,`,          // 'sms' | 'manual_kakao'
    `  message TEXT NOT NULL,`,
    `  status TEXT NOT NULL,`,           // 'sent' | 'pending' | 'failed'
    `  error TEXT,`,
    `  sent_by TEXT,`,
    `  created_at INTEGER NOT NULL,`,
    `  completed_at INTEGER`,
    `);`
  ].join(' '));
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_tkl_created ON teacher_kakao_log(created_at DESC);`);
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_tkl_profile ON teacher_kakao_log(profile_id);`);
  // 미배정 카카오ID 보관함 — «명단엔 있는데 어느 강사인지 모르는» ID 를 잃어버리지 않도록.
  await env.DB.exec([
    `CREATE TABLE IF NOT EXISTS teacher_kakao_unassigned (`,
    `  kakao_id TEXT PRIMARY KEY,`,
    `  note TEXT,`,
    `  created_at INTEGER NOT NULL`,
    `);`
  ].join(' '));
  _tkSchemaReady = true;
}

// 이름 비교 — 대소문자·공백·마침표 차이를 흡수(‘Teacher.Belle’ 같은 ID 와 달리 이름만 다룸)
function normName(s: any): string {
  return String(s || '').toLowerCase().replace(/[\s._-]+/g, ' ').trim();
}

/* ☎️ 번호 → 발송 경로.
   한국 휴대폰은 01[016789], 필리핀 휴대폰은 09 로 시작하는 11자리(또는 앞 0 이 빠진 10자리 9…).
   둘은 시작 자리가 겹치지 않아서 오판이 없다(국내번호는 09 로 시작하지 않는다). */
export function resolvePhoneRoute(phone: any): { country: '82' | '63'; label: 'KR' | 'PH'; digits: string } | null {
  const d = String(phone || '').replace(/[^0-9]/g, '');
  if (!d) return null;
  if (/^82(1[016789])\d{7,8}$/.test(d))  return { country: '82', label: 'KR', digits: '0' + d.slice(2) };
  if (/^639\d{9}$/.test(d))              return { country: '63', label: 'PH', digits: '0' + d.slice(2) };
  if (/^01[016789]\d{7,8}$/.test(d))     return { country: '82', label: 'KR', digits: d };
  if (/^09\d{9}$/.test(d))               return { country: '63', label: 'PH', digits: d };
  if (/^9\d{9}$/.test(d))                return { country: '63', label: 'PH', digits: '0' + d };
  return null;
}

// 목록/전달에 쓰는 강사 1행의 «전달 가능 경로» 요약
function routeSummary(row: any) {
  const r = resolvePhoneRoute(row.phone);
  return {
    has_kakao: !!(row.kakao_id && String(row.kakao_id).trim()),
    sms_country: r ? r.country : null,
    sms_label: r ? r.label : null,
  };
}

export async function handleTeacherKakaoApi(
  request: Request, url: URL, env: TeacherKakaoEnv
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method.toUpperCase();
  if (!path.startsWith('/api/admin/teachers/kakao')) return null;

  await ensureTeacherKakaoSchema(env);
  const actor = await getAdminActor(request, env as any);
  // 강사 본인은 다른 강사에게 단체 메시지를 보낼 수 없다(본사·매니저 기능).
  if (actor?.isTeacher) return json({ ok: false, error: 'forbidden_teacher' }, 403);

  // ── ① 현황: 강사별 카카오ID + 전달 가능 경로 + 미배정 ID ──────────────
  if (method === 'GET' && path === '/api/admin/teachers/kakao') {
    const rs = await env.DB.prepare(
      `SELECT id, korean_name, english_name, kakao_id, phone, status, group_name, image_url
         FROM teacher_profiles
        WHERE status = '활동중' OR status IS NULL
        ORDER BY korean_name`
    ).all<any>();
    const rows = (rs.results || []).map(r => ({ ...r, ...routeSummary(r) }));
    const un = await env.DB.prepare(
      `SELECT kakao_id, note FROM teacher_kakao_unassigned ORDER BY kakao_id`
    ).all<any>().catch(() => ({ results: [] as any[] }));
    return json({
      ok: true,
      items: rows,
      unassigned: un.results || [],
      seed_total: PH_TEACHER_KAKAO_SEED.length,
      with_kakao: rows.filter(r => r.has_kakao).length,
      sms_mode: getSolapiMode(env as any),   // 'real' | 'mock' | 'disabled'
    });
  }

  // ── ② 카카오ID 일괄 반영 (멱등) ─────────────────────────────────────
  //    빈 칸만 채운다. 이미 다른 값이 들어 있으면 «건드리지 않고» 알려준다.
  //    dry_run: true 면 무엇이 바뀔지만 계산하고 DB 는 손대지 않는다(기본값 true).
  if (method === 'POST' && path === '/api/admin/teachers/kakao/backfill') {
    const b = await parseJsonBody(request) as any;
    const dryRun = b?.dry_run !== false;              // 명시적으로 false 여야 실제 반영
    const overwrite = b?.overwrite === true;          // 기존 값 덮어쓰기(기본 안 함)
    const profiles = await env.DB.prepare(
      `SELECT id, korean_name, english_name, kakao_id FROM teacher_profiles`
    ).all<any>();
    const byName = new Map<string, any>();
    for (const p of (profiles.results || [])) {
      if (p.korean_name)  byName.set(normName(p.korean_name), p);
      if (p.english_name) byName.set(normName(p.english_name), p);
    }

    const updated: any[] = [];
    const already: any[] = [];
    const conflicts: any[] = [];
    const parked: any[] = [];
    const now = Date.now();

    for (const seed of PH_TEACHER_KAKAO_SEED) {
      const p = seed.target ? byName.get(normName(seed.target)) : null;
      if (!p) {
        parked.push({ kakao_id: seed.kakao_id, reason: seed.target ? 'profile_not_found' : 'unknown_owner', note: seed.note || null, target: seed.target });
        if (!dryRun) {
          await env.DB.prepare(
            `INSERT INTO teacher_kakao_unassigned (kakao_id, note, created_at) VALUES (?,?,?)
             ON CONFLICT(kakao_id) DO UPDATE SET note = excluded.note`
          ).bind(seed.kakao_id, seed.note || (seed.target ? `명부에 «${seed.target}» 이름이 없습니다` : null), now).run();
        }
        continue;
      }
      const cur = String(p.kakao_id || '').trim();
      if (cur === seed.kakao_id) { already.push({ profile_id: p.id, name: p.korean_name, kakao_id: seed.kakao_id }); continue; }
      if (cur && !overwrite) {
        conflicts.push({ profile_id: p.id, name: p.korean_name, current: cur, incoming: seed.kakao_id });
        continue;
      }
      updated.push({ profile_id: p.id, name: p.korean_name, from: cur || null, to: seed.kakao_id });
      if (!dryRun) {
        await env.DB.prepare(`UPDATE teacher_profiles SET kakao_id = ?, updated_at = ? WHERE id = ?`)
          .bind(seed.kakao_id, now, p.id).run();
      }
    }

    return json({
      ok: true, dry_run: dryRun, overwrite,
      summary: { updated: updated.length, already: already.length, conflicts: conflicts.length, parked: parked.length },
      updated, already, conflicts, parked,
    });
  }

  // ── ③ 미배정 카카오ID 를 강사에게 배정 ──────────────────────────────
  if (method === 'POST' && path === '/api/admin/teachers/kakao/assign') {
    const b = await parseJsonBody(request) as any;
    const kakaoId = String(b?.kakao_id || '').trim();
    const profileId = parseInt(String(b?.profile_id ?? ''), 10);
    if (!kakaoId || !profileId) return json({ ok: false, error: 'kakao_id_and_profile_id_required' }, 400);
    const p = await env.DB.prepare(`SELECT id, korean_name, kakao_id FROM teacher_profiles WHERE id = ?`)
      .bind(profileId).first<any>();
    if (!p) return json({ ok: false, error: 'profile_not_found' }, 404);
    if (String(p.kakao_id || '').trim() && b?.overwrite !== true) {
      return json({ ok: false, error: 'already_has_kakao_id', current: p.kakao_id }, 409);
    }
    await env.DB.prepare(`UPDATE teacher_profiles SET kakao_id = ?, updated_at = ? WHERE id = ?`)
      .bind(kakaoId, Date.now(), profileId).run();
    await env.DB.prepare(`DELETE FROM teacher_kakao_unassigned WHERE kakao_id = ?`).bind(kakaoId).run();
    return json({ ok: true, profile_id: profileId, name: p.korean_name, kakao_id: kakaoId });
  }

  // ── ④ 전달 ──────────────────────────────────────────────────────────
  //   body: { profile_ids: number[], message: string, mode?: 'auto'|'both'|'sms'|'kakao' }
  //
  //   mode 가 왜 필요한가 — 대부분의 강사는 전화번호와 카카오ID 를 «둘 다» 갖고 있다.
  //   아무 생각 없이 두 경로로 다 보내면 같은 사람이 문자와 카톡을 두 번 받는다.
  //     · auto (기본) — 번호가 있으면 문자만, 번호가 없으면 카톡. 한 사람당 한 번.
  //     · both        — 문자 + 카톡 둘 다 (중요 공지처럼 꼭 닿아야 할 때)
  //     · sms         — 문자만
  //     · kakao       — 카톡만
  //
  //   결과: auto[]   = 문자로 «실제 발송한» 건 (성공/실패 각각 이유 포함)
  //         manual[] = 카톡으로 사람이 붙여넣어야 하는 건 (log_id 로 나중에 «보냄» 표시)
  if (method === 'POST' && path === '/api/admin/teachers/kakao/send') {
    const b = await parseJsonBody(request) as any;
    const ids: number[] = Array.isArray(b?.profile_ids)
      ? b.profile_ids.map((x: any) => parseInt(String(x), 10)).filter((n: number) => !!n)
      : [];
    const message = String(b?.message || '').trim();
    const VALID_MODES = ['auto', 'both', 'sms', 'kakao'];
    const mode = VALID_MODES.includes(String(b?.mode || '')) ? String(b.mode) : 'auto';
    if (!ids.length) return json({ ok: false, error: 'profile_ids_required' }, 400);
    if (!message) return json({ ok: false, error: 'message_required' }, 400);
    if (message.length > 1000) return json({ ok: false, error: 'message_too_long', max: 1000 }, 400);
    // ⚠️ D1 바인드 파라미터 100개 한도 — 한 번에 90명까지만 받는다(CLAUDE.md 함정표)
    if (ids.length > 90) return json({ ok: false, error: 'too_many_recipients', max: 90 }, 400);

    const ph = ids.map(() => '?').join(',');
    const rs = await env.DB.prepare(
      `SELECT id, korean_name, english_name, kakao_id, phone FROM teacher_profiles WHERE id IN (${ph})`
    ).bind(...ids).all<any>();
    const rows = rs.results || [];
    const byId = new Map<number, any>(rows.map(r => [Number(r.id), r]));

    const sentBy = String(actor?.username || actor?.role || 'admin');
    const now = Date.now();
    const auto: any[] = [];
    const manual: any[] = [];
    const skipped: any[] = [];

    for (const id of ids) {
      const t = byId.get(id);
      if (!t) { skipped.push({ profile_id: id, reason: 'profile_not_found' }); continue; }
      const name = t.korean_name || t.english_name || ('#' + id);
      const route = resolvePhoneRoute(t.phone);
      const kakaoId = String(t.kakao_id || '').trim();

      // 이 강사에게 어느 경로를 쓸지 — 여기서 한 번만 정한다(아래 두 블록은 이 판단만 따른다)
      const useSms   = !!route   && (mode === 'sms' || mode === 'both' || mode === 'auto');
      const useKakao = !!kakaoId && (mode === 'kakao' || mode === 'both' || (mode === 'auto' && !route));
      if (!useSms && !useKakao) {
        skipped.push({
          profile_id: id, name,
          reason: (!route && !kakaoId) ? 'no_phone_no_kakao'
                : (mode === 'sms' ? 'no_phone' : 'no_kakao_id'),
        });
        continue;
      }

      // ① 문자 — 번호를 알아볼 수 있으면 즉시 발송
      if (useSms && route) {
        const r = await sendPlainSms(env as any, route.digits, message, { country: route.country });
        const ins = await env.DB.prepare(
          `INSERT INTO teacher_kakao_log (profile_id, teacher_name, kakao_id, phone, channel, message, status, error, sent_by, created_at, completed_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          id, name, kakaoId || null, t.phone || null, 'sms', message,
          r.ok ? 'sent' : 'failed',
          r.ok ? null : String(r.error || r.message || 'unknown'),
          sentBy, now, r.ok ? now : null
        ).run();
        auto.push({
          log_id: ins.meta.last_row_id, profile_id: id, name,
          country: route.label, phone: t.phone, ok: r.ok, mode: r.mode,
          error: r.ok ? null : (r.error || null),
          message: r.message || null,
        });
      }

      // ② 카카오톡 — «붙여넣기 전달» 대기열에 올린다
      if (useKakao) {
        const ins = await env.DB.prepare(
          `INSERT INTO teacher_kakao_log (profile_id, teacher_name, kakao_id, phone, channel, message, status, sent_by, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`
        ).bind(id, name, kakaoId, t.phone || null, 'manual_kakao', message, 'pending', sentBy, now).run();
        manual.push({ log_id: ins.meta.last_row_id, profile_id: id, name, kakao_id: kakaoId, message });
      }
    }

    return json({
      ok: true,
      mode,
      sms_mode: getSolapiMode(env as any),
      summary: {
        auto_sent: auto.filter(a => a.ok).length,
        auto_failed: auto.filter(a => !a.ok).length,
        manual_pending: manual.length,
        skipped: skipped.length,
      },
      auto, manual, skipped,
    });
  }

  // ── ⑤ 수동(카톡 붙여넣기) 전달 완료 표시 ────────────────────────────
  if (method === 'POST' && path === '/api/admin/teachers/kakao/mark-sent') {
    const b = await parseJsonBody(request) as any;
    const logIds: number[] = Array.isArray(b?.log_ids)
      ? b.log_ids.map((x: any) => parseInt(String(x), 10)).filter((n: number) => !!n)
      : [];
    if (!logIds.length) return json({ ok: false, error: 'log_ids_required' }, 400);
    if (logIds.length > 90) return json({ ok: false, error: 'too_many', max: 90 }, 400);
    const ph = logIds.map(() => '?').join(',');
    const now = Date.now();
    await env.DB.prepare(
      `UPDATE teacher_kakao_log SET status = 'sent', completed_at = ?
        WHERE id IN (${ph}) AND status = 'pending'`
    ).bind(now, ...logIds).run();
    return json({ ok: true, marked: logIds.length });
  }

  // ── ⑥ 전달 이력 ─────────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/admin/teachers/kakao/log') {
    const limit = Math.min(300, Math.max(1, parseInt(url.searchParams.get('limit') || '80', 10)));
    const pid = parseInt(url.searchParams.get('profile_id') || '0', 10);
    const rs = pid
      ? await env.DB.prepare(
          `SELECT * FROM teacher_kakao_log WHERE profile_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`
        ).bind(pid, limit).all<any>()
      : await env.DB.prepare(
          `SELECT * FROM teacher_kakao_log ORDER BY created_at DESC, id DESC LIMIT ?`
        ).bind(limit).all<any>();
    return json({ ok: true, items: rs.results || [] });
  }

  return null;
}
