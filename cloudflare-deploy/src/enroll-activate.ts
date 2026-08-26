/**
 * enroll-activate.ts — 📚 관리자 «수강신청 확정» 파이프라인 (2026-08-08)
 *
 *  왜 만들었나
 *    관리자 「수강신청 관리」의 액션 버튼은 `UPDATE enrollments SET status` **한 줄**이 전부였다.
 *    확정을 눌러도 학생 계정이 연결되지 않고, 시간표가 안 생기고, 강사도 안 붙고,
 *    학부모도 모른 채였다 — 그래서 눌러도 «아무 일도 안 일어나» 보였다.
 *
 *    그런데 그 일을 할 엔진은 이미 있었다. `enroll-ops.ts` 가 결제(학생 셀프 신청) 경로에서
 *    강사 빈자리 계산·충돌 회피·공휴일 밀어내기·회차 보존까지 다 하고 있다.
 *    관리자 카드만 그 엔진에 연결돼 있지 않았다. 이 파일이 그 다리다.
 *
 *  설계 원칙
 *    · **멱등** — 시간표는 `class_schedules.source = 'adm-enroll:<id>'` 로 한 번만 생성된다.
 *      두 번 눌러도 두 벌 생기지 않는다(DB 유니크 인덱스 `uq_sched_teacher_slot` 이 2중 방어).
 *    · **미리보기 먼저** — GET .../plan 은 아무것도 바꾸지 않고 «무엇이 일어날지»만 계산한다.
 *      며칟날 몇 회, 어느 강사가 비었는지, 무엇이 막고 있는지를 먼저 보여준다.
 *    · **단계는 호출자가 켠다** — 특히 학부모 문자와 결제 예약은 **기본 꺼짐**.
 *      바깥으로 나가는 일과 돈에 관한 일은 사람이 매번 명시적으로 켜야 한다.
 *    · **부분 실패 격리** — 한 단계가 실패해도 나머지는 진행하고, 단계별 결과를 그대로 돌려준다.
 *      «됐습니다» 한 마디로 뭉뚱그리지 않는다.
 *    · 돈을 **청구하지 않는다** — 결제 단계는 `subscriptions` 에 다음 청구 예정일만 적는다.
 *      실제 청구는 기존 정기결제 자동화가 그 레코드를 보고 한다.
 */
import { json, parseJsonBody } from './api-util';
import { DEFAULT_CLASS_MINUTES, ALLOWED_CLASS_MINUTES, classLengthMultiplier } from './class-policy';
import {
  enrollTimeToMin, enrollDates, enrollConflicts, teachersFreeAt,
  holidaySet, ensureEnrollTables, kstToday
} from './enroll-ops';
import { sendPlainSms } from './solapi-client';

const SRC_PREFIX = 'adm-enroll:';

/* ═══════════════ 순수 파서 (하니스가 이 함수들을 추출해 검증한다) ═══════════════ */

const DOW_KO: Record<string, number> = { '일':0, '월':1, '화':2, '수':3, '목':4, '금':5, '토':6 };
const DOW_EN: Record<string, number> = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };
const DOW_LABEL = ['일','월','화','수','목','금','토'];

/** '월수금' · '월,수,금' · '월 화' · 'mon wed' → [1,3,5] (오름차순·중복 제거) */
export function parseDowList(s: string): number[] {
  const t = String(s || '');
  const out = new Set<number>();
  for (const ch of t) if (DOW_KO[ch] !== undefined) out.add(DOW_KO[ch]);
  if (out.size === 0) {
    const low = t.toLowerCase();
    for (const k of Object.keys(DOW_EN)) if (low.includes(k)) out.add(DOW_EN[k]);
  }
  return [...out].sort((a, b) => a - b);
}

export function dowLabel(days: number[]): string {
  return days.map(d => DOW_LABEL[d] || '?').join('');
}

/**
 * 시간 문자열 → 요일별 'HH:MM' 맵.
 *   '19:20'                → 모든 요일 같은 시각
 *   '월 07:30, 수 08:00'   → 요일별 다른 시각 (enroll-ops 의 ej.times 와 같은 모양)
 *   '7:30'                 → '07:30' 으로 보정 (사람이 앞의 0 을 안 적는다)
 * 요일별 표기가 하나라도 있으면 그쪽을 쓰고, 빠진 요일은 첫 시각으로 메운다.
 */
export function parseTimesByDow(timeRaw: string, days: number[]): Record<string, string> {
  const t = String(timeRaw || '').trim();
  const pad = (h: string, m: string) => String(Number(h)).padStart(2, '0') + ':' + m;
  const out: Record<string, string> = {};
  if (!t || days.length === 0) return out;

  // 요일별 표기 — '월 7:30' / '월07:30' / '월:7:30'
  const perDay = [...t.matchAll(/([일월화수목금토])\s*:?\s*(\d{1,2}):(\d{2})/g)];
  if (perDay.length) {
    for (const m of perDay) {
      const d = DOW_KO[m[1]];
      if (d !== undefined && days.includes(d)) out[String(d)] = pad(m[2], m[3]);
    }
  }
  // 남은 요일은 «처음 나온 시각»으로 메운다
  const firstAny = /(\d{1,2}):(\d{2})/.exec(t);
  const fallback = perDay.length ? (out[String(days.find(d => out[String(d)] !== undefined) ?? days[0])] || '')
                                 : (firstAny ? pad(firstAny[1], firstAny[2]) : '');
  if (!fallback) return out;
  for (const d of days) if (!out[String(d)]) out[String(d)] = fallback;
  return out;
}

/**
 * 회차 수 추정.
 *   '1:1 4회권' → 4 · '그룹 12회권' → 12 · '주2회 3개월' → 2×4×3 = 24
 *   아무 단서도 없으면 «주 N회 × 4주 = 한 달치». 0 은 돌려주지 않는다(최소 1).
 */
export function parseSessions(pkg: string, weekly: number): number {
  const t = String(pkg || '');
  const byCount = /(\d+)\s*회권/.exec(t) || /총\s*(\d+)\s*회/.exec(t);
  if (byCount) return Math.max(1, Math.min(400, Number(byCount[1])));
  const perWeek = /주\s*(\d+)\s*회/.exec(t);
  const months = /(\d+)\s*개월/.exec(t);
  if (perWeek && months) return Math.max(1, Math.min(400, Number(perWeek[1]) * 4 * Number(months[1])));
  if (months) return Math.max(1, Math.min(400, Math.max(1, weekly) * 4 * Number(months[1])));
  return Math.max(1, Math.min(400, Math.max(1, weekly) * 4));
}

/** '1:1' → 1, '1:3' → 3, '그룹' → 0(모름). 수업 길이 판단에만 쓴다 */
export function parseClassSize(s: string): number {
  const m = /1\s*[:：대]\s*(\d+)/.exec(String(s || ''));
  return m ? Number(m[1]) : 0;
}

/** 010-1234-5678 → 010-****-5678 (화면·로그에 그대로 뿌리지 않기 위해) */
export function maskPhone(p: string): string {
  const d = String(p || '').replace(/[^0-9]/g, '');
  if (d.length < 9) return d ? '***' : '';
  return d.slice(0, 3) + '-****-' + d.slice(-4);
}

/** ms 타임스탬프 → KST 'YYYY-MM-DD' */
export function kstDay(ms: number): string {
  return new Date(Number(ms) + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/* ═══════════════ 계획 수립 (아무것도 바꾸지 않는다) ═══════════════ */

export interface EnrollPlan {
  enrollment: any;
  days: number[];
  times: Record<string, string>;
  minutes: number;
  sessions: number;
  start_date: string;
  dates: string[];
  skipped_holidays: string[];
  student: { linked: boolean; user_id: string | null; candidates: any[]; parent_phone_masked: string };
  assign_priority: 'schedule' | 'teacher';
  teacher: {
    id: string | null; name: string | null;
    free: Array<{ id: string; name: string }>; total_active: number;
    /** 사람이 이름을 대지 않고 ③ 우선순위로 자동 배정된 경우에만 값이 있다 */
    auto: 'continuity' | 'free' | null;
  };
  already_created: number;
  blockers: string[];
  warnings: string[];
}

export async function buildEnrollPlan(env: any, id: number, teacherOverride?: string | null): Promise<EnrollPlan | null> {
  await ensureEnrollTables(env);
  const e: any = await env.DB.prepare(`SELECT * FROM enrollments WHERE id = ? LIMIT 1`).bind(id).first();
  if (!e) return null;

  const blockers: string[] = [];
  const warnings: string[] = [];

  // ── 요일·시간
  const days = parseDowList(e.days_of_week || '');
  const times = parseTimesByDow(e.time || '', days);
  if (!days.length) blockers.push('요일이 없습니다 — 신청 건에 요일을 채워 주세요');
  if (days.length && Object.keys(times).length !== days.length) {
    blockers.push('시간이 없습니다 — 신청 건에 시간(예: 19:20)을 채워 주세요');
  }

  const size = parseClassSize(e.class_size || '');
  // ⏱ (2026-08-26 사장님 지시) 등록 화면에서 고른 수업 시간(20/30/40분)을 쓴다.
  //   ⚠️ 안 고른 값·이상한 값이면 기본값(class-policy.ts DEFAULT_CLASS_MINUTES=20)으로 — 여기서
  //     조용히 30분(운영 DB 옛 스키마 DEFAULT)이 새어 들어가면 이 파일 머리말이 경고하는 바로 그 사고다.
  const minutes = (Number(e.duration_min) > 0 && ALLOWED_CLASS_MINUTES.includes(Number(e.duration_min)))
    ? Number(e.duration_min) : DEFAULT_CLASS_MINUTES;
  if (size > 3) warnings.push('인원 ' + size + '명 — 그룹 수업은 같은 시간에 여러 학생이 들어갑니다');

  const sessions = parseSessions(e.package || '', Math.max(1, days.length));
  const startMs = e.started_at ? Number(e.started_at) : Date.now();
  const today = kstToday();
  let start_date = kstDay(startMs);
  if (start_date < today) { start_date = today; warnings.push('시작일이 지났습니다 — 오늘(' + today + ')부터 잡습니다'); }

  // ── 학생 계정 연결
  let linkedUid: string | null = e.student_user_id ? String(e.student_user_id) : null;
  let candidates: any[] = [];
  let parentPhone = '';
  if (linkedUid) {
    const st: any = await env.DB.prepare(
      `SELECT user_id, korean_name, parent_phone, student_phone, phone FROM students_erp WHERE user_id = ? LIMIT 1`
    ).bind(linkedUid).first().catch(() => null);
    if (!st) warnings.push('연결된 학생 아이디(' + linkedUid + ')를 학생 명부에서 못 찾았습니다');
    else parentPhone = String(st.parent_phone || st.student_phone || st.phone || '');
  } else {
    const rs: any = await env.DB.prepare(
      `SELECT user_id, korean_name, parent_phone, student_phone, phone FROM students_erp WHERE korean_name = ? LIMIT 5`
    ).bind(String(e.student_name || '')).all().catch(() => null);
    candidates = (rs?.results as any[]) || [];
    if (candidates.length === 1) parentPhone = String(candidates[0].parent_phone || candidates[0].student_phone || candidates[0].phone || '');
    else if (candidates.length === 0) blockers.push('학생 명부에 «' + e.student_name + '» 이(가) 없습니다 — 학생관리에서 먼저 등록해 주세요');
    else warnings.push('같은 이름이 ' + candidates.length + '명입니다 — 어느 학생인지 골라 주세요');
  }

  // ── 강사 — 그 요일·시간에 실제로 비어 있는 사람만
  const timesMinByDow: Record<number, number> = {};
  for (const d of days) {
    const m = enrollTimeToMin(times[String(d)] || '');
    if (m >= 0) timesMinByDow[d] = m;
  }
  let free: Array<{ id: string; name: string }> = [];
  let totalActive = 0;
  if (days.length && Object.keys(timesMinByDow).length === days.length) {
    const freeIds = await teachersFreeAt(env, days, timesMinByDow, minutes);
    const rs: any = await env.DB.prepare(`SELECT id, name FROM teachers WHERE active = 1`).all().catch(() => null);
    const all = (rs?.results as any[]) || [];
    totalActive = all.length;
    free = all.filter(t => freeIds.has(String(t.id))).map(t => ({ id: String(t.id), name: String(t.name || '') }));
  }

  // 배정 대상 — 호출자가 고른 사람 > 이미 적혀 있는 이름 > ③ 우선순위 자동 배정 > 없음
  //   🧑‍🏫 (2026-08-12) 등록 화면에서 «강사 이름 지정» 칸을 없앴다. 그래서 아무도 이름을 대지
  //   않아도 여기서 정해져야 한다. 기준은 등록 때 고른 ③ 배정 우선순위 하나뿐이다.
  //     · schedule(요일·시간 우선) — 그 시간에 «실제로 비어 있는» 사람 중에서만 고른다
  //     · teacher(강사 우선)       — 이 학생을 이미 가르치던 사람을 유지한다(시간은 겹치면 건너뜀)
  //   두 경우 모두 «이 학생을 이미 가르치던 사람» 을 먼저 본다. 새 얼굴로 바꾸지 않는 것이
  //   학생·학부모 입장에서 기본값이기 때문이다.
  const assignPriority = String(e.assign_priority || 'schedule') === 'teacher' ? 'teacher' : 'schedule';
  let teacherId: string | null = teacherOverride ? String(teacherOverride) : null;
  let teacherName: string | null = null;
  let autoAssigned: 'continuity' | 'free' | null = null;
  if (teacherId) {
    const t: any = await env.DB.prepare(`SELECT id, name FROM teachers WHERE id = ? LIMIT 1`).bind(teacherId).first().catch(() => null);
    teacherName = t ? String(t.name || '') : null;
    if (!t) blockers.push('강사 id=' + teacherId + ' 를 찾을 수 없습니다');
    else if (!free.some(f => f.id === teacherId)) {
      warnings.push('«' + teacherName + '» 은(는) 그 시간에 다른 수업이 있습니다 — 겹치는 날짜는 건너뜁니다');
    }
  } else if (e.teacher_name) {
    const t: any = await env.DB.prepare(`SELECT id, name FROM teachers WHERE name = ? AND active = 1 LIMIT 1`)
      .bind(String(e.teacher_name)).first().catch(() => null);
    if (t) { teacherId = String(t.id); teacherName = String(t.name || ''); }
    else warnings.push('적혀 있는 강사 «' + e.teacher_name + '» 을(를) 강사 명부에서 못 찾았습니다');
  }

  if (!teacherId) {
    // 이 학생을 지금까지 가장 많이 가르친 활성 강사 (없으면 null)
    let keep: { id: string; name: string } | null = null;
    if (linkedUid) {
      const k: any = await env.DB.prepare(
        `SELECT t.id AS id, t.name AS name, COUNT(*) AS n
           FROM class_schedules cs JOIN teachers t ON t.id = cs.teacher_id
          WHERE cs.user_id = ? AND cs.teacher_id IS NOT NULL AND t.active = 1
          GROUP BY t.id ORDER BY n DESC LIMIT 1`
      ).bind(linkedUid).first().catch(() => null);
      if (k && k.id) keep = { id: String(k.id), name: String(k.name || '') };
    }
    if (assignPriority === 'teacher' && keep) {
      teacherId = keep.id; teacherName = keep.name; autoAssigned = 'continuity';
      if (!free.some(f => f.id === keep!.id)) {
        warnings.push('강사 우선 — «' + keep.name + '» 을(를) 유지합니다. 그 시간에 다른 수업이 있는 날짜는 건너뜁니다');
      }
    } else if (keep && free.some(f => f.id === keep!.id)) {
      teacherId = keep.id; teacherName = keep.name; autoAssigned = 'continuity';
    } else if (free.length) {
      teacherId = free[0].id; teacherName = free[0].name; autoAssigned = 'free';
      if (assignPriority === 'teacher' && !keep) {
        warnings.push('강사 우선으로 신청됐지만 이 학생을 가르치던 강사가 없습니다 — 그 시간에 비어 있는 강사로 배정했습니다');
      }
    }
  }
  if (!teacherId) {
    blockers.push('배정할 강사가 없습니다 — 그 시간에 비어 있는 강사가 없고, 이 학생을 가르치던 강사도 없습니다');
  }

  // ── 실제로 잡힐 날짜 (충돌·공휴일 회피)
  let dates: string[] = [];
  let skipped: string[] = [];
  if (days.length && teacherId && Object.keys(timesMinByDow).length === days.length) {
    const probe = enrollDates(start_date, days, sessions * 2);
    const blocked = await enrollConflicts(env, teacherId, probe, timesMinByDow, minutes, days);
    const hol = await holidaySet(env, start_date);
    skipped = probe.filter(d => hol.has(d) || blocked.has(d));
    hol.forEach(d => blocked.add(d));
    dates = enrollDates(start_date, days, sessions, blocked);
    if (dates.length < sessions) {
      warnings.push('요청 ' + sessions + '회 중 ' + dates.length + '회만 잡힙니다 — 충돌·공휴일이 많습니다');
    }
  }

  // ── 이미 만들어진 게 있나 (멱등 확인)
  const dup: any = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM class_schedules WHERE source = ?`
  ).bind(SRC_PREFIX + id).first().catch(() => null);
  const already = Number(dup?.n || 0);
  if (already > 0) warnings.push('이 신청 건으로 이미 수업 ' + already + '회가 만들어져 있습니다 — 다시 눌러도 새로 생기지 않습니다');

  return {
    enrollment: e, days, times, minutes, sessions, start_date, dates,
    skipped_holidays: skipped,
    student: {
      linked: !!linkedUid, user_id: linkedUid, candidates,
      parent_phone_masked: maskPhone(parentPhone)
    },
    assign_priority: assignPriority,
    teacher: { id: teacherId, name: teacherName, free, total_active: totalActive, auto: autoAssigned },
    already_created: already,
    blockers, warnings
  };
}

/* ═══════════════ 실행 ═══════════════ */

type StepResult = { step: string; ok: boolean; skipped?: boolean; detail: string };

async function runActivate(env: any, id: number, body: any, actor: string) {
  const wantStatus = ['pending', 'confirmed', 'active'].includes(String(body?.status || ''))
    ? String(body.status) : 'confirmed';
  const steps = body?.steps || {};
  const dry = !!body?.dry;

  const plan = await buildEnrollPlan(env, id, body?.teacher_id ?? null);
  if (!plan) return json({ ok: false, error: 'enrollment_not_found' }, 404);

  const results: StepResult[] = [];
  const e = plan.enrollment;
  const now = Date.now();
  let uid = plan.student.user_id;

  // ── 1. 학생 계정 연결 (없던 것을 «만들지는» 않는다 — 사람이 학생관리에서 등록해야 한다)
  if (steps.link_student) {
    if (uid) results.push({ step: 'link_student', ok: true, skipped: true, detail: '이미 연결됨 (' + uid + ')' });
    else if (plan.student.candidates.length === 1) {
      uid = String(plan.student.candidates[0].user_id);
      if (!dry) await env.DB.prepare(`UPDATE enrollments SET student_user_id = ?, updated_at = ? WHERE id = ?`).bind(uid, now, id).run();
      results.push({ step: 'link_student', ok: true, detail: '«' + e.student_name + '» → ' + uid });
    } else {
      results.push({ step: 'link_student', ok: false,
        detail: plan.student.candidates.length ? '동명이인 ' + plan.student.candidates.length + '명 — 사람이 골라야 합니다' : '학생 명부에 없습니다' });
    }
  }

  // ── 2. 강사 배정 (enrollments.teacher_name 에 이름으로 기록)
  if (steps.assign_teacher) {
    if (!plan.teacher.id) results.push({ step: 'assign_teacher', ok: false, detail: '강사가 정해지지 않았습니다' });
    else {
      if (!dry) await env.DB.prepare(`UPDATE enrollments SET teacher_name = ?, updated_at = ? WHERE id = ?`)
        .bind(plan.teacher.name || '', now, id).run();
      results.push({ step: 'assign_teacher', ok: true, detail: (plan.teacher.name || plan.teacher.id) + ' 배정' });
    }
  }

  // ── 3. 시간표 생성 — 멱등. source 로 한 번만.
  if (steps.create_schedules) {
    if (plan.already_created > 0) {
      results.push({ step: 'create_schedules', ok: true, skipped: true, detail: '이미 ' + plan.already_created + '회 생성돼 있어 건너뜀' });
    } else if (!uid || !plan.teacher.id || !plan.dates.length) {
      results.push({ step: 'create_schedules', ok: false,
        detail: !uid ? '학생 아이디가 없습니다' : !plan.teacher.id ? '강사가 없습니다' : '잡을 수 있는 날짜가 없습니다' });
    } else if (dry) {
      results.push({ step: 'create_schedules', ok: true, detail: '[미리보기] ' + plan.dates.length + '회 (' + plan.dates[0] + ' ~ ' + plan.dates[plan.dates.length - 1] + ')' });
    } else {
      const src = SRC_PREFIX + id;
      const note = '수강신청 확정 자동생성 · ' + (plan.teacher.name || '') + ' · ' + dowLabel(plan.days) + ' · ' + (e.package || '');
      const stmt = env.DB.prepare(
        `INSERT OR IGNORE INTO class_schedules (user_id, student_name, schedule_kind, class_type, scheduled_date, start_time, duration_min, teacher_id, status, source, created_by, created_at, notes)
         VALUES (?, ?, 'dated', 'regular', ?, ?, ?, ?, 'active', ?, ?, ?, ?)`
      );
      const batch = plan.dates.map(d => {
        const dow = new Date(d + 'T00:00:00Z').getUTCDay();
        return stmt.bind(uid, String(e.student_name || ''), d, plan.times[String(dow)], plan.minutes,
                         plan.teacher.id, src, actor || 'admin', now, note);
      });
      let made = 0;
      try {
        for (let i = 0; i < batch.length; i += 80) {
          const r = await env.DB.batch(batch.slice(i, i + 80));
          for (const x of (r as any[])) made += Number(x?.meta?.changes || 0);
        }
        results.push({ step: 'create_schedules', ok: true,
          detail: made + '회 생성 (' + plan.dates[0] + ' ~ ' + plan.dates[plan.dates.length - 1] + ')' +
                  (made < plan.dates.length ? ' · ' + (plan.dates.length - made) + '회는 이미 찬 자리라 건너뜀' : '') });
      } catch (err: any) {
        results.push({ step: 'create_schedules', ok: false, detail: '실패: ' + String(err?.message || err) });
      }
    }
  }

  // ── 4. 결제 예약 — **청구하지 않는다.** 다음 청구 예정일만 적는다.
  if (steps.create_subscription) {
    const amount = Number(e.monthly_fee_krw || 0);
    if (!uid) results.push({ step: 'create_subscription', ok: false, detail: '학생 아이디가 없습니다' });
    else if (amount <= 0) results.push({ step: 'create_subscription', ok: false, detail: '월 수강료가 0원입니다' });
    else if (dry) results.push({ step: 'create_subscription', ok: true, detail: '[미리보기] 월 ' + amount.toLocaleString() + '원 · 다음 청구 ' + nextBillingDay(plan.start_date) });
    else {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, student_name TEXT, plan TEXT, amount INTEGER, status TEXT DEFAULT 'active', next_billing_at INTEGER, last_billed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
        const nextAt = Date.parse(nextBillingDay(plan.start_date) + 'T00:00:00+09:00');
        const ex: any = await env.DB.prepare(`SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active' LIMIT 1`).bind(uid).first();
        if (ex) {
          await env.DB.prepare(`UPDATE subscriptions SET plan = ?, amount = ?, next_billing_at = ?, updated_at = ? WHERE id = ?`)
            .bind(String(e.package || ''), amount, nextAt, now, ex.id).run();
          results.push({ step: 'create_subscription', ok: true, detail: '기존 구독 갱신 · 다음 청구 ' + nextBillingDay(plan.start_date) });
        } else {
          await env.DB.prepare(`INSERT INTO subscriptions (user_id, student_name, plan, amount, status, next_billing_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`)
            .bind(uid, String(e.student_name || ''), String(e.package || ''), amount, nextAt, now, now).run();
          results.push({ step: 'create_subscription', ok: true, detail: '구독 등록 · 다음 청구 ' + nextBillingDay(plan.start_date) + ' (청구는 정기결제 자동화가 합니다)' });
        }
      } catch (err: any) {
        results.push({ step: 'create_subscription', ok: false, detail: '실패: ' + String(err?.message || err) });
      }
    }
  }

  // ── 5. 학부모 안내 문자 — 바깥으로 나가는 유일한 단계. 기본 꺼짐.
  if (steps.notify_parent) {
    let phone = '';
    if (uid) {
      const st: any = await env.DB.prepare(`SELECT parent_phone, student_phone, phone FROM students_erp WHERE user_id = ? LIMIT 1`)
        .bind(uid).first().catch(() => null);
      phone = String(st?.parent_phone || st?.student_phone || st?.phone || '').trim();
    }
    const first = plan.dates[0] || plan.start_date;
    const text = '[망고아이] ' + (e.student_name || '') + ' 학생 수강 등록이 확정되었습니다.\n'
      + '· 수업: ' + dowLabel(plan.days) + ' ' + (plan.times[String(plan.days[0])] || '') + '\n'
      + '· 첫 수업: ' + first + '\n'
      + (plan.teacher.name ? '· 담당 강사: ' + plan.teacher.name + '\n' : '')
      + '문의는 카카오톡 채널 «망고아이» 로 주세요.';
    if (!phone) results.push({ step: 'notify_parent', ok: false, detail: '연락처가 없습니다' });
    else if (dry) results.push({ step: 'notify_parent', ok: true, detail: '[미리보기] ' + maskPhone(phone) + ' 로 발송 예정\n' + text });
    else {
      const r = await sendPlainSms(env, phone, text);
      results.push({ step: 'notify_parent', ok: !!r.ok,
        detail: (r.ok ? '발송 ' : '실패 ') + maskPhone(phone) + ' [' + r.mode + ']' + (r.message ? ' ' + r.message : '') + (r.error ? ' ' + r.error : '') });
    }
  }

  // ── 6. 상태 — 마지막에. 앞 단계가 다 실패했는데 «확정»으로 보이면 안 된다.
  const hardFail = results.some(x => !x.ok && !x.skipped);
  /* ✅ (2026-08-12) 실패한 단계가 있으면 상태를 올리지 않는다.
     그동안은 강사 배정이 실패해도 status 를 confirmed 로 박아서, 목록에는 «확정» 으로 보이는데
     실제로는 강사도 시간표도 없는 건이 남았다. 등록과 확정을 한 번에 묶은 뒤로는(등록 즉시
     자동 확정) 사람이 결과를 안 볼 수도 있어서, 이 «조용한 반쪽 성공» 이 그대로 사고가 된다.
     → 하나라도 실패하면 pending 으로 남기고 화면이 「▸ 확정 안 됨」 으로 부른다. */
  const finalStatus = hardFail ? 'pending' : wantStatus;
  if (!dry) {
    await env.DB.prepare(`UPDATE enrollments SET status = ?, updated_at = ? WHERE id = ?`).bind(finalStatus, now, id).run();
  }
  results.push({
    step: 'set_status', ok: !hardFail,
    detail: hardFail
      ? '실패한 단계가 있어 «대기» 로 남겨 둡니다 — 고친 뒤 다시 실행하세요'
      : '상태 → ' + finalStatus + (dry ? ' (미리보기라 저장 안 함)' : '')
  });

  return json({ ok: true, id, dry, status: finalStatus, all_ok: !hardFail, steps: results, plan_warnings: plan.warnings });
}

/** 시작일 + 1개월 (말일 보정 — 1/31 + 1개월 = 2/28) */
export function nextBillingDay(startDay: string): string {
  const [y, m, d] = String(startDay).split('-').map(Number);
  if (!y || !m || !d) return startDay;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return ny + '-' + String(nm).padStart(2, '0') + '-' + String(Math.min(d, last)).padStart(2, '0');
}

/* ═══════════════ 라우터 ═══════════════ */

export async function handleEnrollActivateApi(request: Request, url: URL, env: any, actor = 'admin'): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  const mPlan = /^\/api\/admin\/enrollments\/(\d+)\/plan$/.exec(path);
  if (mPlan && method === 'GET') {
    const plan = await buildEnrollPlan(env, Number(mPlan[1]), url.searchParams.get('teacher_id'));
    if (!plan) return json({ ok: false, error: 'enrollment_not_found' }, 404);
    return json({
      ok: true,
      id: Number(mPlan[1]),
      student_name: plan.enrollment.student_name,
      package: plan.enrollment.package,
      monthly_fee_krw: plan.enrollment.monthly_fee_krw,
      /* 💰 (2026-08-26 사장님 지시) 「이 금액이 왜 이 금액인가」를 확정 화면이 사람에게 보여 준다.
         ⛔ 여기서 «다시 곱하지» 않는다 — `monthly_fee_krw` 는 저장할 때 이미 곱해진 최종값이다
            (곱하는 곳은 api-admin.ts 의 INSERT 한 자리뿐. src/enroll-fee.ts 머리말 참고).
            아래 둘은 «근거를 적어 두는 값» 일 뿐 계산에 쓰이지 않는다. */
      base_fee_krw: (plan.enrollment as any).base_fee_krw ?? null,
      length_multiplier: classLengthMultiplier(plan.minutes),
      /* 「이 기준가가 사람이 적은 값인가, 대리점 단가로 자동으로 세운 값인가」.
         ⛔ 추측하지 않는다 — 저장할 때 적어 둔 값을 그대로 내려준다(`fee_source`).
            후자는 **아무도 치지 않은 금액**이라 화면이 그렇게 말해 줘야 한다. */
      fee_source: (plan.enrollment as any).fee_source ?? null,
      days: plan.days, days_label: dowLabel(plan.days), times: plan.times,
      minutes: plan.minutes, sessions: plan.sessions, start_date: plan.start_date,
      dates: plan.dates, dates_count: plan.dates.length,
      skipped: plan.skipped_holidays.slice(0, 20),
      student: plan.student, teacher: plan.teacher,
      assign_priority: plan.assign_priority,
      already_created: plan.already_created,
      next_billing: nextBillingDay(plan.start_date),
      blockers: plan.blockers, warnings: plan.warnings
    });
  }

  const mAct = /^\/api\/admin\/enrollments\/(\d+)\/activate$/.exec(path);
  if (mAct && method === 'POST') {
    const body = await parseJsonBody(request);
    return await runActivate(env, Number(mAct[1]), body || {}, actor);
  }

  return null;
}
