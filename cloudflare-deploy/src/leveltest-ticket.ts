// ═══════════════════════════════════════════════════════════════════════
// 🎟️ 레벨테스트 «티켓» — 확인과 입장을 «링크 하나» 로 합친다
// ───────────────────────────────────────────────────────────────────────
// [왜 만들었나]
//   신청자가 자기 신청을 확인할 방법도, 당일 방에 들어갈 방법도 사실상 없었다.
//     · 접수 문자엔 입장 링크가 아예 없었다.
//     · 확정 문자는 "예약 10분 전 화상 링크를 보내드립니다" 라고 «약속» 하는데,
//       그 링크를 보내는 코드는 전화번호를 students_erp 에서만 찾는다. 신청서에 적은
//       번호는 안 본다 → 계정이 없는 신청자에겐 구조적으로 못 간다(실측 확인).
//     · 설령 갔어도 링크가 방이 아니라 홈(1.9MB·로그인 필요)이었다.
//   반대로 재료는 이미 다 있었다: 방 주소가 결정론적(class-{예약}-{YYYYMMDD})이고,
//   7.9KB 짜리 경량 입장 페이지도 있다. 없던 건 «그것들을 잇는 링크» 하나뿐이다.
//
// [설계]
//   링크 하나가 시간에 따라 모습을 바꾼다 — 수업 전엔 일정 확인, 10분 전부터 입장 버튼,
//   끝난 뒤엔 결과. 로그인·앱설치·이름입력이 전부 없다. 서명 토큰이 곧 신원이라
//   «계정이 없는 신청자» 도 그대로 쓸 수 있다 — 이게 핵심이다(실제로 신청 12건 중
//   절반이 계정과 연결돼 있지 않다).
//
// [보안]
//   토큰은 HMAC 서명. 신청번호를 바꿔치기하면 서명이 깨져 남의 티켓을 볼 수 없다.
//   시크릿은 uid 토큰과 같은 ROOM_JWT_SECRET 을 쓴다(auth-token.ts 와 동일 폴백).
// ═══════════════════════════════════════════════════════════════════════

import { sendPlainSms } from './solapi-client';

/** ⚠️ auth-token.ts 의 폴백과 반드시 같아야 한다(같은 시크릿을 쓰는 것이 의도). */
const UID_SECRET_FALLBACK = 'mgi-fb-d0895a3a232c5ef0f0950c6128a04a5311ec69ba142cb4a86a8d334e33c56f30';
function ticketSecret(env: any): string {
  return (env && env.ROOM_JWT_SECRET) || UID_SECRET_FALLBACK;
}

/** 운영 주소. ⚠️ mango-i.com 은 등록조차 안 된 도메인이다 — 여기에 쓰면 링크가 죽는다. */
export function publicBase(env: any): string {
  return String((env && env.PUBLIC_BASE_URL) || 'https://test.mangoi.co.kr').replace(/\/+$/, '');
}

/* ⏰ 입장 시간창 — /api/class/sessions/today(api-mango.ts) 와 «반드시 같은 값».
   여기만 늘리면 티켓엔 입장 버튼이 떴는데 서버는 아직 안 열어주는 상태가 된다. */
export const OPEN_BEFORE_MS = 10 * 60 * 1000;   // 시작 10분 전부터 입장
export const LATE_AFTER_MS = 15 * 60 * 1000;    // 종료 15분 후까지 지각 입장

const KST = 9 * 3600 * 1000;
const pad2 = (n: number) => String(n).padStart(2, '0');

function b64u(bytes: Uint8Array): string {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sigOf(payload: string, env: any): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(ticketSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const raw = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  // 22자로 자른다 = 132비트. 위조 불가능한데 문자메시지 길이는 아낀다(SMS 로 나가는 링크다).
  return b64u(new Uint8Array(raw)).slice(0, 22);
}

/** 티켓 토큰 발급. 형식 `<신청번호>.<만료초>.<서명22>` — 짧게 유지(문자 링크). */
export async function signLtTicket(appId: number, env: any, ttlMs = 120 * 86400 * 1000): Promise<string> {
  const expSec = Math.floor((Date.now() + ttlMs) / 1000);
  const payload = `${appId}.${expSec}`;
  return `${payload}.${await sigOf(payload, env)}`;
}

/** 토큰 검증 → 신청번호. 위조·만료·형식오류는 전부 null. */
export async function verifyLtTicket(token: string, env: any): Promise<number | null> {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const [idStr, expStr, sig] = parts;
    const appId = Number(idStr), expSec = Number(expStr);
    if (!Number.isInteger(appId) || appId <= 0 || !Number.isFinite(expSec)) return null;
    if (expSec * 1000 < Date.now()) return null;
    const want = await sigOf(`${idStr}.${expStr}`, env);
    // 길이가 같은 문자열끼리의 비교 — 타이밍 차가 의미를 갖지 않도록 전체를 훑는다.
    if (want.length !== sig.length) return null;
    let diff = 0;
    for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
    return diff === 0 ? appId : null;
  } catch { return null; }
}

/** 티켓 링크(문자·알림톡·이메일에 그대로 넣는 주소). */
export async function ltTicketUrl(appId: number, env: any): Promise<string> {
  return `${publicBase(env)}/t.html?k=${await signLtTicket(appId, env)}`;
}

/**
 * 여러 건의 티켓 링크를 한 번에. 관리자 목록(최대 500행)에서 쓴다.
 * ⚠️ ltTicketUrl 을 행마다 부르면 HMAC 키를 행마다 새로 import 한다.
 *    여기서는 키를 한 번만 만들고 서명만 반복한다 — 결과는 완전히 동일하다.
 */
export async function ltTicketUrlMap(appIds: number[], env: any, ttlMs = 120 * 86400 * 1000): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  const ids = Array.from(new Set(appIds.filter(n => Number.isInteger(n) && n > 0)));
  if (!ids.length) return out;
  const base = publicBase(env);
  const expSec = Math.floor((Date.now() + ttlMs) / 1000);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(ticketSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  await Promise.all(ids.map(async id => {
    const payload = `${id}.${expSec}`;
    const raw = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
    out[id] = `${base}/t.html?k=${payload}.${b64u(new Uint8Array(raw)).slice(0, 22)}`;
  }));
  return out;
}

export type LtTicket = {
  app_id: number;
  student_name: string;
  status: string;
  desired_date: string | null;
  desired_time: string | null;
  teacher: string | null;
  schedule_id: number | null;
  room_id: string | null;
  now: number;
  start_ts: number | null;
  end_ts: number | null;
  open_at_ts: number | null;
  close_at_ts: number | null;
  join_open: boolean;
  join_url: string | null;
  precheck_url: string;
  ics_url: string | null;
  /* 🔒 결과(점수·레벨·교재)는 «전화번호 뒷 4자리» 를 맞춰야 열린다.
     [왜] 링크는 문자로 가지만 문자는 남이 볼 수 있다. 일정·입장은 새어도 큰일이 아니지만
          성적은 다르다. 비밀번호를 새로 만들게 하는 대신(신청 단계의 마찰=이탈),
          이미 본인이 적어 낸 번호의 끝 4자리로 한 번만 확인한다.
     ⚠️ 틀려도 일정·입장은 그대로 열려 있어야 한다 — 수업에 못 들어가는 일이 생기면 안 된다. */
  has_result: boolean;          // 보여줄 결과가 있는지 (잠긴 상태에서도 «있다» 는 알려준다)
  result_locked: boolean;       // true = 4자리 확인 필요
  phone_hint: string | null;    // '010-****-2224' — 어느 번호인지 힌트만
  result: {
    ai_score: number | null; pron_score: number | null; teacher_score: number | null;
    final_level: string | null; recommended_textbook: string | null; next_class_guide: string | null;
  } | null;
};

/** 전화번호 끝 4자리. 저장 형식이 제각각이라(하이픈·공백) 숫자만 남겨서 본다. */
function last4(phone: any): string {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length >= 4 ? d.slice(-4) : '';
}

/** '010-****-2224' — 어느 번호로 보냈는지만 알려준다(전체는 절대 노출하지 않는다). */
function phoneHint(phone: any): string | null {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 4) return null;
  const head = d.length >= 11 ? d.slice(0, 3) : d.slice(0, Math.max(0, d.length - 8)) || '0';
  return `${head}-****-${d.slice(-4)}`;
}

/**
 * 🔐 4자리 확인 시도 제한. 4자리는 경우의 수가 1만뿐이라 제한이 없으면 전부 시도된다.
 *   신청건당 1시간에 5회. 넘으면 맞는 번호를 넣어도 그 시간 동안 안 열린다.
 *   ⚠️ 잠기는 것은 «결과 열람» 뿐이다. 수업 입장은 영향을 받지 않는다.
 */
async function pinTooManyTries(env: any, appId: number): Promise<boolean> {
  try {
    const v = await env.SESSION_STATE?.get(`lt_pin_fail:${appId}`);
    return Number(v || 0) >= 5;
  } catch { return false; }
}
async function pinNoteFail(env: any, appId: number): Promise<void> {
  try {
    const k = `lt_pin_fail:${appId}`;
    const v = Number((await env.SESSION_STATE?.get(k)) || 0) + 1;
    await env.SESSION_STATE?.put(k, String(v), { expirationTtl: 3600 });
  } catch {}
}

/**
 * 신청번호 하나로 «지금 이 사람에게 보여줄 것» 을 통째로 만든다.
 * ⚠️ 교사 이름은 교사가 «수락» 한 뒤에만 넣는다 — proposed(소프트 배정) 단계에서 새면
 *    교사가 거절했을 때 「담당이 바뀌었다」는 혼선이 생긴다(2단계 승인 설계와 동일).
 */
export async function buildLtTicket(env: any, appId: number, token?: string, pin?: string): Promise<LtTicket | null> {
  const app: any = await env.DB.prepare(
    `SELECT * FROM leveltest_applications WHERE id = ? LIMIT 1`
  ).bind(appId).first();
  if (!app) return null;

  const now = Date.now();
  const base = publicBase(env);
  const confirmed = app.status === 'confirmed' || app.status === 'done';

  let sched: any = null;
  if (app.schedule_id) {
    try {
      sched = await env.DB.prepare(
        `SELECT id, scheduled_date, start_time, duration_min, day_of_week, status FROM class_schedules WHERE id = ? LIMIT 1`
      ).bind(Number(app.schedule_id)).first();
    } catch {}
  }
  if (sched && sched.status === 'cancelled') sched = null;

  let room_id: string | null = null, start_ts: number | null = null, end_ts: number | null = null;
  let open_at_ts: number | null = null, close_at_ts: number | null = null;
  if (sched) {
    /* 방 주소는 /api/class/sessions/today 가 만드는 것과 «글자 하나까지» 같아야 한다.
       거기서는 class-{예약id}-{오늘 KST YYYYMMDD} 로 만든다. 일회성 수업은 그 날짜가 곧
       scheduled_date 이므로 여기서도 scheduled_date 로 만들면 당일에 서로 정확히 만난다.
       (반복 수업은 scheduled_date 가 비어 있어 «오늘» 로 계산 — 레벨테스트는 항상 일회성) */
    const dateStr: string = sched.scheduled_date || (() => {
      const k = new Date(now + KST);
      return `${k.getUTCFullYear()}-${pad2(k.getUTCMonth() + 1)}-${pad2(k.getUTCDate())}`;
    })();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (m) {
      room_id = `class-${sched.id}-${m[1]}${m[2]}${m[3]}`;
      const [hh, mi] = String(sched.start_time || '00:00').split(':').map((x: string) => Number(x));
      if (Number.isFinite(hh)) {
        start_ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mi || 0, 0) - KST;
        end_ts = start_ts + (Number(sched.duration_min) || 20) * 60000;
        open_at_ts = start_ts - OPEN_BEFORE_MS;
        close_at_ts = end_ts + LATE_AFTER_MS;
      }
    }
  }

  /* 🔒 결과 잠금 판정.
     · 보여줄 결과가 하나도 없으면 잠글 것도 없다(잠긴 빈 상자를 보여주지 않는다).
     · 신청서에 전화번호가 없으면 대조할 값이 없다 → 그냥 연다. 안 그러면 본인도 영영 못 본다.
     · 4자리가 맞으면 연다. 틀리면 실패를 세고 잠근 채로 «일정·입장은 그대로» 돌려준다. */
  const rawResult = {
    ai_score: app.ai_score ?? null,
    pron_score: app.pron_score ?? null,
    teacher_score: app.teacher_score ?? null,
    final_level: app.final_level || null,
    recommended_textbook: app.recommended_textbook || null,
    next_class_guide: app.next_class_guide || null,
  };
  const hasResult = Object.values(rawResult).some(v => v !== null && v !== '');
  const want4 = last4(app.phone);
  let unlocked = !hasResult || !want4;               // 결과 없음 or 대조할 번호 없음 → 잠그지 않는다
  if (hasResult && want4 && pin) {
    if (await pinTooManyTries(env, appId)) {
      unlocked = false;                              // 시도 초과 — 맞아도 이번 시간엔 안 연다
    } else if (String(pin).replace(/\D/g, '').slice(-4) === want4) {
      unlocked = true;
    } else {
      await pinNoteFail(env, appId);
    }
  }
  const resultBlock = {
    has_result: hasResult,
    result_locked: hasResult && !unlocked,
    phone_hint: (hasResult && !unlocked) ? phoneHint(app.phone) : null,
    result: unlocked ? rawResult : null,
  };

  const join_open = !!(open_at_ts && close_at_ts && now >= open_at_ts && now <= close_at_ts);
  // 경량 입장 페이지(7.9KB). ⚠️ '/video-call/' 까지만 쓰면 1.9MB 홈으로 되돌아간다 — index.html 필수.
  const join_url = (join_open && room_id)
    ? `${base}/video-call/index.html?room=${encodeURIComponent(room_id)}&name=${encodeURIComponent(app.student_name || '학생')}&autojoin=1`
    : null;

  return {
    app_id: Number(app.id),
    student_name: String(app.student_name || ''),
    status: String(app.status || 'pending'),
    desired_date: app.desired_date || null,
    desired_time: app.desired_time || null,
    teacher: confirmed ? (app.assigned_teacher || null) : null,
    schedule_id: sched ? Number(sched.id) : null,
    room_id, now, start_ts, end_ts, open_at_ts, close_at_ts, join_open, join_url,
    precheck_url: `${base}/precheck.html`,
    ics_url: (start_ts && token) ? `${base}/api/leveltest/ticket.ics?k=${encodeURIComponent(token)}` : null,
    ...resultBlock,
  };
}

/** 캘린더 파일(.ics) — 「내 캘린더에 추가」. 10분 전 알람 포함. */
export function buildLtIcs(t: LtTicket, ticketUrl: string): string {
  const z = (ms: number) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}00Z`;
  };
  // ics 는 쉼표·세미콜론·역슬래시를 반드시 이스케이프해야 한다(안 하면 줄이 깨져 통째로 무시된다).
  const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const start = t.start_ts as number;
  const end = t.end_ts || (start + 20 * 60000);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mangoi//LevelTest//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:leveltest-${t.app_id}@mangoi`,
    `DTSTAMP:${z(Date.now())}`,
    `DTSTART:${z(start)}`,
    `DTEND:${z(end)}`,
    `SUMMARY:${esc('망고아이 레벨테스트 / Mangoi Level Test')}`,
    `DESCRIPTION:${esc(`${t.teacher ? `담당 선생님: ${t.teacher}\n` : ''}입장·확인은 이 링크에서 / Join & check here:\n${ticketUrl}`)}`,
    `URL:${esc(ticketUrl)}`,
    /* ⏰ 알람 두 개 — «미리 대비하게 하고, 직전에 울린다» (2026-08-07, 사장님 지시)
       [왜] 하루 전 알람이 문자보다 낫다: 잠금화면에 뜨고, 무음이어도 폰이 알려주고, 비용이 0원이다.
            문자는 무음모드·스팸함이면 그냥 놓친다. 「캘린더에 추가」 한 번이면 그 뒤론 폰이 알아서 한다.
       ⚠️ 순서를 바꾸지 말 것 — 일부 캘린더 앱은 여러 VALARM 중 첫 번째만 쓴다. 멀리 있는 것부터. */
    'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY',
    `DESCRIPTION:${esc('내일 레벨테스트가 있어요 — 카메라·마이크를 미리 점검해 두세요 / Level test tomorrow — please check your camera and mic')}`,
    'END:VALARM',
    'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY',
    `DESCRIPTION:${esc('10분 뒤 레벨테스트 시작 / Level test starts in 10 minutes')}`,
    'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

export type LtReminderResult = {
  ok: boolean; enabled: boolean; checked: number; reminded: number; sms_sent: number; details: any[];
};

/* 📣 T-10 리마인더 — 기존 lesson-reminder 가 «닿지 못하는» 사람만 담당한다.
   왜 별도인가: lesson-reminder 는 전화번호를 students_erp 에서만 찾는다. 레벨테스트
   신청자는 아직 학생 계정이 아닌 경우가 절반이라(실측) 거기선 no_phone 으로 걸러진다.
   여기서는 «신청서에 직접 적은 번호» 를 쓴다 — 그게 우리가 가진 유일한 확실한 연락처다.
   ⚠️ cron 은 15분 간격이라 실제 발송은 시작 5~25분 전 사이에 한 번 일어난다. */
const REMIND_MIN_MS = 5 * 60 * 1000;
const REMIND_MAX_MS = 25 * 60 * 1000;
const MAX_SMS_PER_SWEEP = 40;

/* 📅 전날 저녁 리마인더 (2026-08-07, 사장님 지시)
   ───────────────────────────────────────────────────────────────────────
   [왜] 알림이 사실상 «양 끝» 두 번뿐이었다 — 접수 문자(신청 순간)와 T-10.
        그 사이가 통째로 비어 있어서, 접수 문자를 잊은 사람은 시작 10분 전
        문자 한 통에 모든 것이 걸린다. 저녁 6시면 퇴근길·저녁 준비 시간이라
        그 한 통을 놓칠 확률이 낮지 않다. 놓치면 그대로 노쇼다.
   [무엇] 수업 «전날 저녁» 에 한 번 더. 장비를 미리 점검할 시간을 준다는 것이
        핵심이다 — 레벨테스트를 받는 사람은 망고아이를 처음 써 보는 사람이라
        카메라·마이크 권한을 그 자리에서 처음 만난다.
   ⚠️ T-10 과 «같은 표, 다른 kind('t1d')» 로 중복을 막는다. 문자는 돈이 나가고,
      같은 사람에게 두 번 가면 신뢰가 깎인다.
   ⚠️ 킬스위치는 T-10 과 공유한다(leveltest_reminder_send='off') — 문자를 멈춰야
      하는 상황이라면 둘 다 멈추는 것이 맞다.
   ⚠️ 크론은 15분마다 돈다. 저녁 «한 시간» 을 창으로 두고 dedup 으로 한 번만 보낸다. */
const DAYBEFORE_HOUR_KST = 20;          // 20시대(20:00~20:59)에 한 번
export async function runLeveltestDayBeforeSweep(env: any, opts: { dry?: boolean; force?: boolean } = {}): Promise<LtReminderResult> {
  const dry = !!opts.dry;
  const out: LtReminderResult = { ok: true, enabled: true, checked: 0, reminded: 0, sms_sent: 0, details: [] };

  try {
    if ((await env.SESSION_STATE?.get('leveltest_reminder_send')) === 'off') { out.enabled = false; return out; }
  } catch {}

  const now = Date.now();
  const k = new Date(now + KST);
  // 저녁 시간대가 아니면 아무것도 하지 않는다(크론은 하루 96번 돈다)
  if (!opts.force && k.getUTCHours() !== DAYBEFORE_HOUR_KST) return out;

  const tm = new Date(now + KST + 86400000);   // 내일(KST)
  const tomorrowStr = `${tm.getUTCFullYear()}-${pad2(tm.getUTCMonth() + 1)}-${pad2(tm.getUTCDate())}`;

  let rows: any[] = [];
  try {
    const rs = await env.DB.prepare(
      `SELECT a.id, a.student_name, a.phone, a.status, a.assigned_teacher, a.student_uid,
              cs.id AS sched_id, cs.scheduled_date, cs.start_time, cs.duration_min
         FROM leveltest_applications a
         JOIN class_schedules cs ON cs.id = a.schedule_id
        WHERE a.status NOT IN ('cancelled') AND cs.status != 'cancelled' AND cs.scheduled_date = ?`
    ).bind(tomorrowStr).all();
    rows = rs.results || [];
  } catch (e: any) {
    return { ...out, ok: false, details: [{ error: 'query_failed:' + String(e?.message || e).slice(0, 80) }] };
  }
  out.checked = rows.length;
  if (!rows.length) return out;

  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS leveltest_reminder_log (id INTEGER PRIMARY KEY AUTOINCREMENT, app_id INTEGER NOT NULL, kind TEXT NOT NULL, sent INTEGER DEFAULT 0, created_at INTEGER NOT NULL)`);
  } catch {}

  let budget = MAX_SMS_PER_SWEEP;
  for (const r of rows) {
    const detail: any = { app_id: r.id, student: r.student_name, when: `${r.scheduled_date} ${r.start_time}` };
    if (budget <= 0) { detail.status = 'budget_exhausted'; out.details.push(detail); break; }
    try {
      const dup = await env.DB.prepare(`SELECT 1 FROM leveltest_reminder_log WHERE app_id = ? AND kind = 't1d' LIMIT 1`).bind(r.id).first();
      if (dup) { detail.status = 'already_sent'; out.details.push(detail); continue; }
    } catch {}

    // 번호는 T-10 과 같은 규칙 — 신청서가 1순위, 없을 때만 계정에서
    let phone = String(r.phone || '').trim();
    if (!phone && r.student_uid) {
      try {
        const stu: any = await env.DB.prepare(`SELECT * FROM students_erp WHERE user_id = ? OR login_id = ? LIMIT 1`).bind(r.student_uid, r.student_uid).first();
        if (stu) phone = String(stu.parent_phone || stu.student_phone || stu.phone || '').trim();
      } catch {}
    }
    if (!phone) {
      detail.status = 'no_phone';
      out.details.push(detail);
      if (!dry) { try { await env.DB.prepare(`INSERT INTO leveltest_reminder_log (app_id, kind, sent, created_at) VALUES (?, 't1d', 0, ?)`).bind(r.id, now).run(); } catch {} }
      continue;
    }

    const url = await ltTicketUrl(Number(r.id), env);
    const hhmm = String(r.start_time || '').slice(0, 5);
    /* 교사명은 «수락한 뒤» 에만 말한다 — 배정 제안 단계에서 이름을 흘리면 교사가 거절했을 때
       «담당이 바뀌었다» 는 혼선이 된다(티켓 화면과 같은 규칙). */
    const tLabel = (r.status === 'confirmed' || r.status === 'done') && r.assigned_teacher ? `\n👩‍🏫 ${r.assigned_teacher}` : '';
    const msg = `[망고아이] ${r.student_name}님, 내일 ${hhmm} 레벨테스트가 있습니다. 🎯${tLabel}\n▶ 확인·장비점검: ${url}\n※ 카메라·마이크를 미리 점검해 두시면 당일 바로 시작할 수 있어요.`;

    if (!dry) {
      try {
        const res = await sendPlainSms(env, phone, msg);
        detail.sms = res && res.ok ? 'sent' : (res && (res.error || res.message)) || 'failed';
        if (res && res.ok) { out.sms_sent++; budget--; }
      } catch (e: any) { detail.sms = 'error:' + String(e?.message || e).slice(0, 80); }
      try { await env.DB.prepare(`INSERT INTO leveltest_reminder_log (app_id, kind, sent, created_at) VALUES (?, 't1d', 1, ?)`).bind(r.id, now).run(); } catch {}
    } else {
      detail.would_send = phone.slice(0, 6) + '***';
    }
    detail.status = 'reminded';
    out.reminded++;
    out.details.push(detail);
  }
  return out;
}

export async function runLeveltestReminderSweep(env: any, opts: { dry?: boolean } = {}): Promise<LtReminderResult> {
  const dry = !!opts.dry;
  const out: LtReminderResult = { ok: true, enabled: true, checked: 0, reminded: 0, sms_sent: 0, details: [] };

  try {
    if ((await env.SESSION_STATE?.get('leveltest_reminder_send')) === 'off') { out.enabled = false; return out; }
  } catch {}

  const now = Date.now();
  const k = new Date(now + KST);
  const todayStr = `${k.getUTCFullYear()}-${pad2(k.getUTCMonth() + 1)}-${pad2(k.getUTCDate())}`;

  let rows: any[] = [];
  try {
    const rs = await env.DB.prepare(
      `SELECT a.id, a.student_name, a.phone, a.status, a.assigned_teacher, a.student_uid,
              cs.id AS sched_id, cs.scheduled_date, cs.start_time, cs.duration_min
         FROM leveltest_applications a
         JOIN class_schedules cs ON cs.id = a.schedule_id
        WHERE a.status NOT IN ('cancelled') AND cs.status != 'cancelled' AND cs.scheduled_date = ?`
    ).bind(todayStr).all();
    rows = rs.results || [];
  } catch (e: any) {
    return { ...out, ok: false, details: [{ error: 'query_failed:' + String(e?.message || e).slice(0, 80) }] };
  }

  const due = rows.filter(r => {
    const [hh, mi] = String(r.start_time || '').split(':').map((x: string) => Number(x));
    if (!Number.isFinite(hh)) return false;
    const p = String(r.scheduled_date).split('-').map(Number);
    const start = Date.UTC(p[0], p[1] - 1, p[2], hh, mi || 0, 0) - KST;
    const until = start - now;
    (r as any)._start = start;
    (r as any)._mins = Math.round(until / 60000);
    return until >= REMIND_MIN_MS && until <= REMIND_MAX_MS;
  });
  out.checked = due.length;
  if (!due.length) return out;

  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS leveltest_reminder_log (id INTEGER PRIMARY KEY AUTOINCREMENT, app_id INTEGER NOT NULL, kind TEXT NOT NULL, sent INTEGER DEFAULT 0, created_at INTEGER NOT NULL)`);
  } catch {}

  let budget = MAX_SMS_PER_SWEEP;
  for (const r of due) {
    const detail: any = { app_id: r.id, student: r.student_name, mins_left: (r as any)._mins };
    if (budget <= 0) { detail.status = 'budget_exhausted'; out.details.push(detail); break; }
    try {
      const dup = await env.DB.prepare(`SELECT 1 FROM leveltest_reminder_log WHERE app_id = ? AND kind = 't10' LIMIT 1`).bind(r.id).first();
      if (dup) { detail.status = 'already_sent'; out.details.push(detail); continue; }
    } catch {}

    // 번호는 신청서 것이 1순위. 없을 때만 계정에서 찾는다(그 반대로 하면 지금 버그가 그대로 남는다).
    let phone = String(r.phone || '').trim();
    if (!phone && r.student_uid) {
      try {
        const stu: any = await env.DB.prepare(`SELECT * FROM students_erp WHERE user_id = ? OR login_id = ? LIMIT 1`).bind(r.student_uid, r.student_uid).first();
        if (stu) phone = String(stu.parent_phone || stu.student_phone || stu.phone || '').trim();
      } catch {}
    }
    if (!phone) {
      detail.status = 'no_phone';
      out.details.push(detail);
      // 번호가 없어도 기록은 남긴다 — 매 15분마다 같은 건을 다시 훑지 않도록.
      if (!dry) { try { await env.DB.prepare(`INSERT INTO leveltest_reminder_log (app_id, kind, sent, created_at) VALUES (?, 't10', 0, ?)`).bind(r.id, now).run(); } catch {} }
      continue;
    }

    const url = await ltTicketUrl(Number(r.id), env);
    const tLabel = (r.status === 'confirmed' || r.status === 'done') && r.assigned_teacher ? `\n👩‍🏫 ${r.assigned_teacher}` : '';
    const msg = `[망고아이] ${r.student_name}님, 레벨테스트가 약 ${(r as any)._mins}분 뒤 시작됩니다. 🎯${tLabel}\n▶ 입장하기(클릭): ${url}\n로그인 없이 바로 들어갑니다.`;

    if (!dry) {
      try {
        const res = await sendPlainSms(env, phone, msg);
        detail.sms = res && res.ok ? 'sent' : (res && (res.error || res.message)) || 'failed';
        if (res && res.ok) { out.sms_sent++; budget--; }
      } catch (e: any) { detail.sms = 'error:' + String(e?.message || e).slice(0, 80); }
      try { await env.DB.prepare(`INSERT INTO leveltest_reminder_log (app_id, kind, sent, created_at) VALUES (?, 't10', 1, ?)`).bind(r.id, now).run(); } catch {}
    } else {
      detail.would_send = phone.slice(0, 6) + '***';
    }
    detail.status = 'reminded';
    out.reminded++;
    out.details.push(detail);
  }
  return out;
}
