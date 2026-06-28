/**
 * churn-graph.ts — 이탈 위험 "행동 사슬(Path) 그래프" 엔진 (2026-06-29 추가)
 *
 * 목적 / 기존 시스템과의 관계
 * ─────────────────────────────────────────────────────────────────────────
 *   learning-insights.ts 의 위험도 세그먼트는 출석·집중도·평가·음성 신호를
 *   "평면 합산"한다(신호 A + 신호 B + …). 좋은 1차 필터지만 **행동 사이의 인과
 *   사슬**은 보지 못한다. 예) "특정 강사 배정 → 연속 결석 → 알림톡 미열람 →
 *   또 결석" 처럼 부정 징후가 시간순으로 꼬리를 무는 패턴.
 *
 *   본 모듈은 학생의 타임라인 이벤트를 **속성 그래프**로 엮고, 부정 징후가
 *   연쇄적으로 연결된 **최장 경로(Path)** 를 찾아 Risk Score 로 수치화한다.
 *   Neo4j/Memgraph 가 없으므로(런타임=Cloudflare Workers + D1) 동일한 그래프를
 *   D1 원자료에서 인메모리로 구성해 경로 DP 로 탐색한다.
 *   같은 모델의 Cypher 정본은 churn-graph.cypher 참고.
 *
 * 그래프 모델
 *   노드:  (Student) (Teacher) (Class) (Alimtalk) (Parent)
 *   엣지:  (Student)-[:ASSIGNED_TO]->(Teacher)
 *          (Student)-[:MISSED|ATTENDED]->(Class)
 *          (Teacher)-[:TEACHES]->(Class)
 *          (Class)-[:TRIGGERED]->(Alimtalk)
 *          (Parent)-[:IGNORED|READ]->(Alimtalk)
 *          (Event)-[:THEN {gap_days}]->(Event)   // 시간순 사슬
 *
 * 데이터 소스(모두 기존 테이블 + 신규 alimtalk_log)
 *   class_schedules · attendance · students_erp · alimtalk_log
 *   → 어떤 테이블/행이 비어 있어도 안전하게 0 기여로 degrade.
 *
 * 외부 공개(서비스 레이어)
 *   computeChainRiskMap(env, days)  : uid→ChainRisk (learning-insights 가 병합)
 *   analyzeStudentPath(env, uid, days) : 단일 학생 그래프/사슬 상세(설명·시각화용)
 *   churnRouter(request, env)       : 독립 라우터(선택) — /api/admin/churn/*
 */

export interface ChurnEnv {
  DB: D1Database;
}

// ── 튜닝 가능한 가중치/임계값 (한곳에 모아 클린하게) ───────────────────────
export const CHURN_CONFIG = {
  /** 연속 사슬로 인정하는 이벤트 간 최대 간격(일). 이보다 벌어지면 사슬이 끊김 */
  linkWindowDays: 21,
  /** 점수 시간감쇠 반감기(일). 오래된 징후는 덜 위험 */
  halfLifeDays: 30,
  /** 사슬 내 위치가 뒤로 갈수록 가중(에스컬레이션). i번째 링크 = ×(1 + i·step) */
  escalationStep: 0.15,
  /** 알림톡 미열람 판정 유예(일): 발송 후 이 기간 지나도 read_at 없으면 IGNORED */
  ignoreGraceDays: 3,
  /** 결석으로 보는 출석 품질 임계 */
  lowGaze: 50,            // 집중도 % 미만이면 LOW_GAZE 이벤트
  earlyLeaveRatio: 0.5,   // 세션의 이 비율 미만만 머물면 LEFT_EARLY
  disconnectMin: 3,       // 재접속 횟수 이상이면 UNSTABLE
  /** "휴면" 합성 이벤트: 마지막 출석 후 경과일이 이 값 이상이면 사슬 꼬리에 추가 */
  dormantDays: 21,
  /** 한 강사에게 결석이 이 비율 이상 몰리면 강사-학생 미스매치 가중 */
  teacherConcentration: 0.8,
  teacherConcentrationMinMiss: 3,
  /** 이벤트 종류별 기본 가중치 */
  weights: {
    MISSED: 3.0,        // 예정 수업 결석
    IGNORED: 2.5,       // 학부모가 알림톡 미열람(가정 무관심 → 이탈 가속)
    LOW_GAZE: 1.0,      // 출석했지만 집중도 매우 낮음
    LEFT_EARLY: 1.5,    // 조기 이탈
    UNSTABLE: 0.8,      // 잦은 끊김
    DORMANT: 4.0,       // 장기 미출석(휴면)
  } as Record<EventType, number>,
  /** 인과 캐스케이드 보너스: 결석 직후 알림톡 무시(가정 차원 방치) 등 */
  cascadeBonus: 1.5,
  /** 최종 위험 밴드 컷(사슬 점수 단독 기준; learning 병합 시엔 가산만) */
  band: { high: 6, medium: 3 },
};

export type EventType = 'MISSED' | 'IGNORED' | 'LOW_GAZE' | 'LEFT_EARLY' | 'UNSTABLE' | 'DORMANT';

/** 타임라인 부정 징후 이벤트(그래프 노드) */
export interface NegEvent {
  type: EventType;
  ts: number;            // 발생 시각(ms, KST 기준 일자 → 자정 ms)
  date: string;          // 'YYYY-MM-DD'
  teacherId: string | null;
  label: string;         // 사람이 읽는 설명
}

/** 사슬(경로) 탐색 결과 */
export interface ChainRisk {
  uid: string;
  chainScore: number;            // 그래프 경로 위험 점수(가산용)
  longestChainLen: number;       // 최장 연속 부정 사슬 길이
  chainCount: number;            // 끊김 단위 사슬 개수
  missedCount: number;
  ignoredCount: number;
  dominantTeacher: string | null;
  teacherConcentration: number;  // 0~1
  reasons: string[];             // learning 세그먼트에 병합될 사유
  path: NegEvent[];              // 점수 최고 사슬의 이벤트 경로(설명·시각화용)
}

// ── 시간/유틸 (learning-insights 와 동일 규약, 모듈 독립 유지) ─────────────
const KST_OFFSET_MS = 9 * 3600 * 1000;
const DAY_MS = 86400000;
const WEEKDAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function kstDateStr(ms: number): string { return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10); }
function todayKST(): string { return kstDateStr(Date.now()); }
/** 'YYYY-MM-DD' → 그날 KST 자정의 ms(UTC epoch) */
function dateToMs(d: string): number {
  const [y, m, dd] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, dd) - KST_OFFSET_MS;
}
function dayOfWeek(d: string): string {
  const [y, m, dd] = d.split('-').map(Number);
  return WEEKDAY[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()];
}
function daysBetween(aMs: number, bMs: number): number { return Math.round((aMs - bMs) / DAY_MS); }

const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try { return await fn(); } catch { return fallback; }
};

// ════════════════════════════════════════════════════════════════════════
//  1) 데이터 로딩 (그래프 원자료) — 어떤 테이블이 없어도 빈 결과로 degrade
// ════════════════════════════════════════════════════════════════════════

interface ScheduleRow {
  user_id: string; schedule_kind: string | null; day_of_week: string | null;
  scheduled_date: string | null; teacher_id: string | null; created_at: number | null; status: string | null;
}
interface AttRow {
  user_id: string; date: string | null; gaze_score: number | null; gaze_samples: number | null;
  disconnect_count: number | null; total_session_ms: number | null; total_active_ms: number | null;
}
interface AlimtalkRow {
  user_id: string; sent_at: number; read_at: number | null; reason: string | null; ref_date: string | null;
}

async function loadSchedules(env: ChurnEnv): Promise<Map<string, ScheduleRow[]>> {
  const rows = await safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT user_id, schedule_kind, day_of_week, scheduled_date, teacher_id, created_at, status
         FROM class_schedules
        WHERE COALESCE(status,'active') = 'active'`
    ).all<ScheduleRow>();
    return rs.results || [];
  }, [] as ScheduleRow[]);
  return groupBy(rows, r => r.user_id);
}

async function loadAttendance(env: ChurnEnv, sinceMs: number): Promise<Map<string, AttRow[]>> {
  const rows = await safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT user_id, date,
              AVG(CASE WHEN gaze_samples>0 THEN gaze_score END) AS gaze_score,
              MAX(gaze_samples) AS gaze_samples,
              SUM(COALESCE(disconnect_count,0)) AS disconnect_count,
              SUM(COALESCE(total_session_ms,0)) AS total_session_ms,
              SUM(COALESCE(total_active_ms,0))  AS total_active_ms
         FROM attendance
        WHERE joined_at >= ? AND date IS NOT NULL
        GROUP BY user_id, date`
    ).bind(sinceMs).all<AttRow>();
    return rs.results || [];
  }, [] as AttRow[]);
  return groupBy(rows, r => r.user_id);
}

async function loadAlimtalk(env: ChurnEnv, sinceMs: number): Promise<Map<string, AlimtalkRow[]>> {
  const rows = await safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT user_id, sent_at, read_at, reason, ref_date
         FROM alimtalk_log
        WHERE sent_at >= ? AND COALESCE(send_status,'sent') = 'sent'`
    ).bind(sinceMs).all<AlimtalkRow>();
    return rs.results || [];
  }, [] as AlimtalkRow[]);
  return groupBy(rows, r => r.user_id);
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = m.get(k); if (arr) arr.push(r); else m.set(k, [r]);
  }
  return m;
}

// ════════════════════════════════════════════════════════════════════════
//  2) 예정 수업 전개 — class_schedules → 기대 세션 날짜 집합
// ════════════════════════════════════════════════════════════════════════
interface ExpectedSession { date: string; teacherId: string | null; }

function expandExpectedSessions(schedules: ScheduleRow[], sinceMs: number, today: string): ExpectedSession[] {
  const out: ExpectedSession[] = [];
  const todayMs = dateToMs(today);
  for (const s of schedules) {
    const createdMs = s.created_at || 0;
    // 일회성/특정일자
    if (s.scheduled_date) {
      const ms = dateToMs(s.scheduled_date);
      if (ms >= sinceMs && ms <= todayMs) out.push({ date: s.scheduled_date, teacherId: s.teacher_id });
      continue;
    }
    // 반복: day_of_week 토큰(mon/tue/…)을 윈도 내 해당 요일마다 전개
    const dows = (s.day_of_week || '').toLowerCase();
    if (!dows) continue;
    const days = WEEKDAY.filter(w => dows.includes(w));
    if (!days.length) continue;
    for (let ms = Math.max(sinceMs, alignToDay(sinceMs)); ms <= todayMs; ms += DAY_MS) {
      const d = kstDateStr(ms);
      // 스케줄 등록 이전 날짜는 결석으로 보지 않음(데이터 왜곡 방지)
      if (createdMs && ms < alignToDay(createdMs)) continue;
      if (days.includes(dayOfWeek(d))) out.push({ date: d, teacherId: s.teacher_id });
    }
  }
  return out;
}
function alignToDay(ms: number): number { return dateToMs(kstDateStr(ms)); }

// ════════════════════════════════════════════════════════════════════════
//  3) 학생 1명의 부정 징후 이벤트 스트림 생성(그래프 노드들)
// ════════════════════════════════════════════════════════════════════════
function buildNegEvents(
  schedules: ScheduleRow[], att: AttRow[], alim: AlimtalkRow[], sinceMs: number, today: string
): NegEvent[] {
  const W = CHURN_CONFIG;
  const events: NegEvent[] = [];

  // 출석한 날짜 집합 + 품질 맵
  const attended = new Map<string, AttRow>();
  for (const a of att) if (a.date) attended.set(a.date, a);

  // (a) MISSED — 예정 세션 중 출석 기록 없는 날
  const expected = expandExpectedSessions(schedules, sinceMs, today);
  const seenMiss = new Set<string>();
  for (const e of expected) {
    if (attended.has(e.date)) continue;
    const key = e.date;                       // 같은 날 중복 스케줄은 1회만
    if (seenMiss.has(key)) continue; seenMiss.add(key);
    events.push({ type: 'MISSED', ts: dateToMs(e.date), date: e.date, teacherId: e.teacherId, label: `결석(${e.date})` });
  }

  // (b) 출석 품질 저하 — 출석은 했으나 부정 신호
  for (const a of att) {
    if (!a.date) continue;
    const ts = dateToMs(a.date);
    if (a.gaze_samples && a.gaze_score != null && a.gaze_score < W.lowGaze)
      events.push({ type: 'LOW_GAZE', ts, date: a.date, teacherId: null, label: `집중도 낮음(${Math.round(a.gaze_score)}%)` });
    if ((a.total_session_ms || 0) > 0 && (a.total_active_ms || 0) / (a.total_session_ms || 1) < W.earlyLeaveRatio)
      events.push({ type: 'LEFT_EARLY', ts, date: a.date, teacherId: null, label: `조기 이탈(${a.date})` });
    if ((a.disconnect_count || 0) >= W.disconnectMin)
      events.push({ type: 'UNSTABLE', ts, date: a.date, teacherId: null, label: `잦은 끊김(${a.disconnect_count}회)` });
  }

  // (c) IGNORED — 알림톡 발송 후 유예기간 지나도 미열람
  const graceMs = W.ignoreGraceDays * DAY_MS;
  const now = Date.now();
  for (const m of alim) {
    if (m.read_at != null) continue;
    if (now - m.sent_at < graceMs) continue;  // 아직 유예 중
    const date = kstDateStr(m.sent_at);
    events.push({ type: 'IGNORED', ts: m.sent_at, date, teacherId: null, label: `알림톡 미열람(${m.reason || '안내'}·${date})` });
  }

  // (d) DORMANT — 마지막 출석 후 장기 미출석(휴면) 합성 꼬리 이벤트
  let lastAttMs = 0;
  for (const a of att) if (a.date) lastAttMs = Math.max(lastAttMs, dateToMs(a.date));
  if (lastAttMs > 0) {
    const idleDays = daysBetween(dateToMs(today), lastAttMs);
    if (idleDays >= W.dormantDays)
      events.push({ type: 'DORMANT', ts: dateToMs(today), date: today, teacherId: null, label: `휴면 ${idleDays}일째(마지막 출석 후 무활동)` });
  }

  events.sort((a, b) => a.ts - b.ts || a.type.localeCompare(b.type));
  return events;
}

// ════════════════════════════════════════════════════════════════════════
//  4) 경로 탐색 + Risk Score
//     시간순 이벤트를 link window 로 사슬 분할 → 사슬별 점수 → 최고점 사슬 선택
// ════════════════════════════════════════════════════════════════════════
function scoreChain(chain: NegEvent[], today: string): number {
  const W = CHURN_CONFIG;
  const todayMs = dateToMs(today);
  let score = 0;
  for (let i = 0; i < chain.length; i++) {
    const ev = chain[i];
    const base = W.weights[ev.type] || 1;
    const ageDays = Math.max(0, daysBetween(todayMs, ev.ts));
    const decay = Math.pow(0.5, ageDays / W.halfLifeDays);     // 시간 감쇠
    const escalation = 1 + i * W.escalationStep;               // 사슬 후반 가중
    let pts = base * decay * escalation;
    // 인과 캐스케이드: 결석 → 알림톡 무시(가정 방치)로 이어지면 가속
    const prev = chain[i - 1];
    if (prev && ((prev.type === 'MISSED' && ev.type === 'IGNORED') ||
                 (prev.type === 'IGNORED' && ev.type === 'MISSED')))
      pts += W.cascadeBonus * decay;
    score += pts;
  }
  return score;
}

/** 시간순 이벤트 → 최장/최고점 사슬, 점수, 통계 */
function traverse(events: NegEvent[], today: string): {
  best: NegEvent[]; score: number; chainCount: number; longest: number;
} {
  const W = CHURN_CONFIG;
  if (!events.length) return { best: [], score: 0, chainCount: 0, longest: 0 };
  const linkMs = W.linkWindowDays * DAY_MS;
  const chains: NegEvent[][] = [];
  let cur: NegEvent[] = [events[0]];
  for (let i = 1; i < events.length; i++) {
    if (events[i].ts - events[i - 1].ts <= linkMs) cur.push(events[i]);
    else { chains.push(cur); cur = [events[i]]; }
  }
  chains.push(cur);

  let best: NegEvent[] = [], score = 0, longest = 0;
  for (const c of chains) {
    longest = Math.max(longest, c.length);
    const sc = scoreChain(c, today);
    if (sc > score) { score = sc; best = c; }
  }
  return { best, score, chainCount: chains.length, longest };
}

// ════════════════════════════════════════════════════════════════════════
//  5) 학생별 ChainRisk 집계
// ════════════════════════════════════════════════════════════════════════
function computeChainRisk(
  uid: string, schedules: ScheduleRow[], att: AttRow[], alim: AlimtalkRow[], sinceMs: number, today: string
): ChainRisk {
  const W = CHURN_CONFIG;
  const events = buildNegEvents(schedules, att, alim, sinceMs, today);
  const { best, score, chainCount, longest } = traverse(events, today);

  const missed = events.filter(e => e.type === 'MISSED');
  const ignored = events.filter(e => e.type === 'IGNORED');

  // 강사 집중도: 결석이 한 강사에게 몰리는가(강사-학생 미스매치 신호)
  const byTeacher = new Map<string, number>();
  for (const m of missed) if (m.teacherId) byTeacher.set(m.teacherId, (byTeacher.get(m.teacherId) || 0) + 1);
  let dominantTeacher: string | null = null, domCount = 0;
  for (const [t, c] of byTeacher) if (c > domCount) { domCount = c; dominantTeacher = t; }
  const concentration = missed.length ? domCount / missed.length : 0;

  let finalScore = score;
  const reasons: string[] = [];
  if (longest >= 2) reasons.push(`부정 행동 사슬 ${longest}연속(${best.map(e => e.type).join('→')})`);
  if (ignored.length) reasons.push(`알림톡 미열람 ${ignored.length}건`);
  if (missed.length >= W.teacherConcentrationMinMiss && concentration >= W.teacherConcentration && dominantTeacher) {
    finalScore *= 1.15;
    reasons.push(`결석 ${Math.round(concentration * 100)}%가 ${dominantTeacher} 강사에 집중(미스매치 의심)`);
  }
  if (events.some(e => e.type === 'DORMANT')) reasons.push('장기 휴면 진입');

  return {
    uid,
    chainScore: Math.round(finalScore * 10) / 10,
    longestChainLen: longest,
    chainCount,
    missedCount: missed.length,
    ignoredCount: ignored.length,
    dominantTeacher,
    teacherConcentration: Math.round(concentration * 100) / 100,
    reasons,
    path: best,
  };
}

// ════════════════════════════════════════════════════════════════════════
//  6) 공개 API — 서비스 레이어 진입점
// ════════════════════════════════════════════════════════════════════════

/**
 * 전체 활성 학생의 사슬 위험 맵. learning-insights 의 buildSegments 가
 * 이 결과를 받아 기존 평면 점수에 chainScore 를 가산한다.
 */
export async function computeChainRiskMap(env: ChurnEnv, days: number): Promise<Map<string, ChainRisk>> {
  const today = todayKST();
  const sinceMs = Date.now() - days * DAY_MS;
  const [schedMap, attMap, alimMap] = await Promise.all([
    loadSchedules(env), loadAttendance(env, sinceMs), loadAlimtalk(env, sinceMs),
  ]);
  // 대상 = 스케줄 또는 출석 기록이 있는 학생 합집합
  const uids = new Set<string>([...schedMap.keys(), ...attMap.keys()]);
  const out = new Map<string, ChainRisk>();
  for (const uid of uids) {
    out.set(uid, computeChainRisk(
      uid, schedMap.get(uid) || [], attMap.get(uid) || [], alimMap.get(uid) || [], sinceMs, today
    ));
  }
  return out;
}

/** 단일 학생: 그래프 노드/엣지 + 사슬 경로 상세(설명·시각화·디버깅용) */
export async function analyzeStudentPath(env: ChurnEnv, uid: string, days: number): Promise<{
  uid: string; days: number; risk: ChainRisk; events: NegEvent[]; graph: { nodes: any[]; edges: any[] };
}> {
  const today = todayKST();
  const sinceMs = Date.now() - days * DAY_MS;
  const [schedMap, attMap, alimMap] = await Promise.all([
    loadSchedules(env), loadAttendance(env, sinceMs), loadAlimtalk(env, sinceMs),
  ]);
  const sched = schedMap.get(uid) || [], att = attMap.get(uid) || [], alim = alimMap.get(uid) || [];
  const events = buildNegEvents(sched, att, alim, sinceMs, today);
  const risk = computeChainRisk(uid, sched, att, alim, sinceMs, today);

  // 설명용 그래프(노드/엣지) 직렬화: Student·Teacher·Event + THEN 사슬
  const nodes: any[] = [{ id: `S:${uid}`, kind: 'Student', label: uid }];
  const teacherIds = new Set(sched.map(s => s.teacher_id).filter(Boolean) as string[]);
  for (const t of teacherIds) nodes.push({ id: `T:${t}`, kind: 'Teacher', label: t });
  const edges: any[] = [...teacherIds].map(t => ({ from: `S:${uid}`, to: `T:${t}`, rel: 'ASSIGNED_TO' }));
  events.forEach((e, i) => {
    const id = `E:${i}`;
    nodes.push({ id, kind: e.type, label: e.label, ts: e.ts, date: e.date });
    edges.push({ from: `S:${uid}`, to: id, rel: e.type === 'IGNORED' ? 'IGNORED' : e.type });
    if (i > 0) {
      const gap = Math.round((e.ts - events[i - 1].ts) / DAY_MS);
      edges.push({ from: `E:${i - 1}`, to: id, rel: 'THEN', gap_days: gap });
    }
  });
  return { uid, days, risk, events, graph: { nodes, edges } };
}

// ════════════════════════════════════════════════════════════════════════
//  6b) 결석 감지 + "오늘의 케어 대상" (감지 전용 + 발송 플래그 게이트)
//      cron(매일 KST 03:00)이 호출. 발송은 AUTO_ALIMTALK='on' + 템플릿 있을 때만.
// ════════════════════════════════════════════════════════════════════════
export interface CareItem {
  uid: string; name: string; parent_phone: string | null;
  absent_yesterday: boolean;     // 어제 예정 수업 결석(오늘 케어 1순위)
  consecutive_misses: number;    // 최장 연속 부정 사슬 길이
  dormant: boolean;              // 장기 휴면 진입
  chain_score: number;
  reasons: string[];
}

interface StudentMeta { name: string; parent_phone: string | null; }

async function loadStudentMeta(env: ChurnEnv): Promise<Map<string, StudentMeta>> {
  return safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT user_id,
              COALESCE(korean_name, english_name, student_name, username, user_id) AS name,
              parent_phone
         FROM students_erp`
    ).all<{ user_id: string; name: string; parent_phone: string | null }>();
    const m = new Map<string, StudentMeta>();
    for (const r of (rs.results || [])) m.set(r.user_id, { name: r.name || r.user_id, parent_phone: r.parent_phone || null });
    return m;
  }, new Map<string, StudentMeta>());
}

async function loadAttendedOnDate(env: ChurnEnv, date: string): Promise<Set<string>> {
  return safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT DISTINCT user_id FROM attendance WHERE date = ?`
    ).bind(date).all<{ user_id: string }>();
    return new Set((rs.results || []).map(r => r.user_id));
  }, new Set<string>());
}

/** 스케줄이 특정 날짜에 수업이 잡혀 있는가 */
function isExpectedOn(s: ScheduleRow, date: string): boolean {
  if ((s.status || 'active') !== 'active') return false;
  if (s.scheduled_date) return s.scheduled_date === date;
  const dows = (s.day_of_week || '').toLowerCase();
  if (!dows || !dows.includes(dayOfWeek(date))) return false;
  if (s.created_at && dateToMs(date) < alignToDay(s.created_at)) return false; // 등록 이전 제외
  return true;
}

/** "오늘의 케어 대상" 리스트 — 절대 발송하지 않음(감지 전용, 대시보드용) */
export async function buildCareList(env: ChurnEnv, days = 60): Promise<CareItem[]> {
  const yesterday = kstDateStr(Date.now() - DAY_MS);
  const [chainMap, meta, schedMap, attendedY] = await Promise.all([
    computeChainRiskMap(env, days), loadStudentMeta(env), loadSchedules(env), loadAttendedOnDate(env, yesterday),
  ]);

  const items: CareItem[] = [];
  for (const [uid, risk] of chainMap) {
    const expectedY = (schedMap.get(uid) || []).some(s => isExpectedOn(s, yesterday));
    const absentY = expectedY && !attendedY.has(uid);
    if (risk.chainScore <= 0 && !absentY) continue;       // 위험·결석 둘 다 없으면 제외
    const m = meta.get(uid);
    items.push({
      uid, name: m?.name || uid, parent_phone: m?.parent_phone || null,
      absent_yesterday: absentY,
      consecutive_misses: risk.longestChainLen,
      dormant: risk.path.some(e => e.type === 'DORMANT') || risk.reasons.some(r => r.includes('휴면')),
      chain_score: risk.chainScore,
      reasons: risk.reasons,
    });
  }
  // 어제 결석자 우선 → 사슬 점수 높은 순
  items.sort((a, b) => (Number(b.absent_yesterday) - Number(a.absent_yesterday)) || (b.chain_score - a.chain_score));
  return items;
}

/**
 * 일일 결석 스윕(cron). 감지는 항상, 발송은 게이트(AUTO_ALIMTALK='on' + SOLAPI_TEMPLATE_ABSENCE)일 때만.
 * 발송 시 logContext{reason:'absence'} 로 alimtalk_log 적재 → IGNORED 사슬 루프 완성.
 * 같은 학생·같은 날짜 중복 발송은 alimtalk_log 로 dedupe.
 */
export async function runAbsenceSweep(env: ChurnEnv & Record<string, any>, opts: { send: boolean }): Promise<{
  date: string; detected: number; care_total: number; sent: number; skipped: number; sending: boolean; items: CareItem[];
}> {
  const yesterday = kstDateStr(Date.now() - DAY_MS);
  const care = await buildCareList(env, 60);
  const absentees = care.filter(c => c.absent_yesterday);

  const flagOn = String(env.AUTO_ALIMTALK || '').toLowerCase() === 'on';
  const tmpl = env.SOLAPI_TEMPLATE_ABSENCE || '';
  const sending = !!(opts.send && flagOn && tmpl);

  let sent = 0, skipped = 0;
  if (sending) {
    const { sendKakaoAlimtalk } = await import('./solapi-client');
    const base = env.PUBLIC_BASE_URL || '';
    for (const c of absentees) {
      if (!c.parent_phone) { skipped++; continue; }
      const dup = await safe(async () => {
        const r = await env.DB.prepare(
          `SELECT 1 FROM alimtalk_log WHERE user_id=? AND reason='absence' AND ref_date=? LIMIT 1`
        ).bind(c.uid, yesterday).first();
        return !!r;
      }, false);
      if (dup) { skipped++; continue; }
      const res = await safe(() => sendKakaoAlimtalk(env, {
        templateCode: tmpl, recipientPhone: c.parent_phone!,
        variables: { '#{학생명}': c.name, '#{날짜}': yesterday, '#{URL}': base + '/' },
        fallbackSmsText: `[망고아이] ${c.name} 학생이 ${yesterday} 수업에 결석했어요. 확인 부탁드립니다.`,
        logContext: { userId: c.uid, reason: 'absence', refDate: yesterday },
      }), { ok: false } as any);
      if (res && res.ok) sent++; else skipped++;
    }
  }
  return { date: yesterday, detected: absentees.length, care_total: care.length, sent, skipped, sending, items: care.slice(0, 50) };
}

// ════════════════════════════════════════════════════════════════════════
//  7) (선택) 독립 라우터 — learning 라우터에 합치지 않고 단독 쓸 때
//     /api/admin/churn/scan?days= · /api/admin/churn/path?uid=&days=
// ════════════════════════════════════════════════════════════════════════
const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

function clampInt(v: string | null, def: number, min: number, max: number): number {
  const n = parseInt(v || '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}

export async function churnRouter(request: Request, env: ChurnEnv): Promise<Response> {
  const url = new URL(request.url);
  const p = url.pathname.replace(/^\/api\/admin\/churn\/?/, '');
  try {
    if (p === 'scan') {
      const days = clampInt(url.searchParams.get('days'), 60, 7, 180);
      const map = await computeChainRiskMap(env, days);
      const rows = [...map.values()]
        .filter(r => r.chainScore > 0)
        .sort((a, b) => b.chainScore - a.chainScore);
      return json({ ok: true, range_days: days, count: rows.length, students: rows });
    }
    if (p === 'path') {
      const uid = url.searchParams.get('uid');
      if (!uid) return json({ ok: false, error: 'uid required' }, 400);
      const days = clampInt(url.searchParams.get('days'), 60, 7, 180);
      return json({ ok: true, ...(await analyzeStudentPath(env, uid, days)) });
    }
    return json({ ok: false, error: 'not found: ' + p }, 404);
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'churn internal error' }, 500);
  }
}
