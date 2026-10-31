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
import { getAdminActor, isOrgScopedRole } from './auth-admin';
import { forbiddenTeacherBody } from './forbidden-teacher';   // 🪪 「강사 권한으로는 …」 문구 정본(계정 이름 포함) — 복제 금지
import { sendPlainSms, getSolapiMode } from './solapi-client';

export interface TeacherKakaoEnv {
  DB: D1Database;
  [k: string]: any;
}

// ─────────────────────────────────────────────────────────────
//  📇 카카오ID 정본 — 운영진 «MANGOi Teacher Information Sheet» 25행 (2026-08-13)
//    target = teacher_profiles 의 이름(korean_name 또는 english_name)과 «정확히» 맞는 값.
//    ⚠️ target 이 null 이면 «어느 강사인지 모르는» ID 라 자동으로 붙이지 않고
//       미배정함에 넣습니다. 추측으로 붙이면 엉뚱한 강사에게 급여·수업 안내가 나갑니다.
//       (지금은 null 이 하나도 없습니다 — 아래 두 건이 시트로 확인됐습니다)
//
//  🚫 «@teacher_belle» 은 여기 없습니다 — 넣지 마세요.
//     시트 맨 윗줄(EX 행)의 **채워진 예시**입니다. 시트 안내문이 직접 말합니다:
//     "Row 4 is a filled EXAMPLE — do not edit it, start from row 5".
//     그 행의 값은 전부 견본이라 실제와 다릅니다(전화 0917-123-4567, 메일
//     belle@mangoi.co.kr). 진짜 Teacher Belle 은 18행이고 카카오ID 는 «Teacher.Belle»,
//     번호는 0935-844-4527 입니다. 견본을 실제 강사에게 붙이면 그 강사에게 가는
//     안내가 통째로 존재하지 않는 곳으로 나갑니다.
//
//  ℹ️ 시트의 이름과 명부(teacher_profiles)의 이름이 다른 세 건 — target 은 «명부 쪽» 을 씁니다.
//       시트 «Manager Maimai» → 명부 «Teacher Maimai»
//       시트 «Manager Melca»  → 명부 «Melca»
//       시트 «IT Karl»        → 명부 «Karl»
//     셋 다 양쪽 목록에 동명이인이 없어 1:1 로 확정됩니다(직함만 다름).
// ─────────────────────────────────────────────────────────────
//
//  ☎️ phone 이 붙은 세 건 — 이 셋만 명부에 «전화번호가 아예 없어서» 함께 채웁니다.
//     번호가 없으면 문자 자동발송이 불가능해 카카오톡 붙여넣기 경로밖에 안 남습니다.
//     나머지 22명은 명부에 이미 번호가 있고 시트와 일치해서 건드리지 않습니다.
//     ⚠️ 이 세 번호는 시트 이미지를 보고 옮겨 적은 값입니다. 한 자리만 틀려도 «모르는
//        사람» 에게 문자가 갑니다. 화면의 받는사람 목록에 번호를 그대로 띄워 두었으니
//        처음 보낼 때 한 번 확인하세요. (빈 칸일 때만 채우므로 덮어쓰기 사고는 없습니다)
export const PH_TEACHER_KAKAO_SEED: Array<{ kakao_id: string; target: string | null; note?: string; phone?: string }> = [
  { kakao_id: 'Elle2586',               target: 'Teacher Far' },   // 시트 «Teacher Farrah» — 명부는 «Teacher Far»
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
  { kakao_id: 'welm',                   target: 'Teacher Maimai', phone: '0975-046-6337' },  // 시트 23행 «Manager Maimai» (mangoi_033)
  { kakao_id: 'Melca08',                target: 'Melca',          phone: '0953-678-3803' },  // 시트 24행 «Manager Melca» (mangoi_144)
  { kakao_id: 'karlito',                target: 'Karl',           phone: '0975-822-2089' },  // 시트 25행 «IT Karl» (mangoi_045)
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
  if (actor?.isTeacher) return json(forbiddenTeacherBody(actor), 403);
  /* ⛔ (2026-09-23) 지사·대리점도 이 네임스페이스 전체를 막는다 — 강사 전화번호 조회부터
     실제 카카오톡/문자 발송까지 있는 «강사 메시지 발송 도구» 다. isAgencyAllowedApi 는
     `/api/admin/teachers` 를 경로 접두사로 열어 두므로(강사 명부 카드를 위해), 그 접두사가
     `/api/admin/teachers/kakao/*` 까지 함께 열지 않도록 여기서 한 번 더 막는다.
     canEditOrg() 로는 안 된다 — 'none'(교사)에도 true 라 위의 isTeacher 체크와 뜻이 겹쳐 헷갈린다.
     여기서 필요한 것은 «본사만» 이므로 isOrgScopedRole 로 조직 계정만 정확히 가린다. */
  if (isOrgScopedRole(actor?.role)) {
    return json({ ok: false, error: 'forbidden_scope', message: '본사 계정만 사용할 수 있습니다.' }, 403);
  }

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
      `SELECT id, korean_name, english_name, kakao_id, phone FROM teacher_profiles`
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
    const phonesFilled: any[] = [];   // ☎️ 번호가 «아예 없던» 강사에게만 채운 것
    const now = Date.now();

    /* ☎️ 전화번호는 카카오ID 와 «따로» 처리한다.
       카카오ID 가 이미 있어 건너뛴 강사라도 번호는 비어 있을 수 있고, 번호가 없으면
       문자 자동발송이 통째로 불가능하기 때문이다. 여기서도 규칙은 같다 —
       **빈 칸일 때만** 채우고, 값이 있으면 절대 덮어쓰지 않는다. */
    async function fillPhoneIfEmpty(p: any, seed: { kakao_id: string; phone?: string }) {
      if (!seed.phone) return;
      if (String(p.phone || '').trim()) return;          // 이미 있으면 손대지 않는다
      phonesFilled.push({ profile_id: p.id, name: p.korean_name, phone: seed.phone });
      if (!dryRun) {
        await env.DB.prepare(`UPDATE teacher_profiles SET phone = ?, updated_at = ? WHERE id = ?`)
          .bind(seed.phone, now, p.id).run();
      }
    }

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
      await fillPhoneIfEmpty(p, seed);   // 카카오ID 판정과 무관하게 번호는 항상 확인한다

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
      summary: {
        updated: updated.length, already: already.length,
        conflicts: conflicts.length, parked: parked.length,
        phones_filled: phonesFilled.length,
      },
      updated, already, conflicts, parked, phones_filled: phonesFilled,
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
