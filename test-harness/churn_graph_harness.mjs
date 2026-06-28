// -*- coding: utf-8 -*-
// 🧪 이탈위험 "행동 사슬(Path) 그래프" 엔진 테스트 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/churn_graph_harness.mjs
//   대상:  cloudflare-deploy/src/churn-graph.ts (순수 로직) + learning-insights.ts / index.ts / solapi-client.ts 배선
//
//   검증 전략:
//     ① 엔진 순수 로직을 그대로 미러링해 픽스처로 행동 검증
//        (예정수업 전개 · 결석/휴면/미열람 이벤트 · 경로 점수 · 강사집중 · 캐스케이드)
//     ② 소스 드리프트 가드: churn-graph.ts / learning-insights.ts / index.ts /
//        solapi-client.ts / migration-churn-graph.sql 에 핵심 규칙·배선이 실제로
//        존재하는지 문자열로 확인(규칙 바뀌면 같이 깨지게).
//   주의: 규칙을 바꾸면 미러도 같이 바꿔 회귀를 잡습니다. (churn-graph.ts 와 동일 사양)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const CF = resolve(__dir, '../cloudflare-deploy');
const read = p => existsSync(p) ? readFileSync(p, 'utf8') : '';

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) { if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`); }
const eq = (name, a, b) => check(`${name} (=${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b));
const near = (name, a, b, tol = 0.15) => check(`${name} (~${b}, got ${Math.round(a * 100) / 100})`, Math.abs(a - b) <= tol);
const has = (name, hay, needle) => check(name, hay.includes(needle));

// ═══════════════════ 미러링된 순수 로직 (churn-graph.ts 와 동일 사양) ═══════════════════
const KST_OFFSET_MS = 9 * 3600 * 1000;
const DAY_MS = 86400000;
const WEEKDAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const CFG = {
  linkWindowDays: 21, halfLifeDays: 30, escalationStep: 0.15, ignoreGraceDays: 3,
  lowGaze: 50, earlyLeaveRatio: 0.5, disconnectMin: 3, dormantDays: 21,
  teacherConcentration: 0.8, teacherConcentrationMinMiss: 3,
  weights: { MISSED: 3.0, IGNORED: 2.5, LOW_GAZE: 1.0, LEFT_EARLY: 1.5, UNSTABLE: 0.8, DORMANT: 4.0 },
  cascadeBonus: 1.5,
};
const kstDateStr = ms => new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
function dateToMs(d) { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd) - KST_OFFSET_MS; }
function dayOfWeek(d) { const [y, m, dd] = d.split('-').map(Number); return WEEKDAY[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]; }
const daysBetween = (a, b) => Math.round((a - b) / DAY_MS);
const alignToDay = ms => dateToMs(kstDateStr(ms));

function expandExpectedSessions(schedules, sinceMs, today) {
  const out = []; const todayMs = dateToMs(today);
  for (const s of schedules) {
    const createdMs = s.created_at || 0;
    if (s.scheduled_date) {
      const ms = dateToMs(s.scheduled_date);
      if (ms >= sinceMs && ms <= todayMs) out.push({ date: s.scheduled_date, teacherId: s.teacher_id });
      continue;
    }
    const dows = (s.day_of_week || '').toLowerCase(); if (!dows) continue;
    const days = WEEKDAY.filter(w => dows.includes(w)); if (!days.length) continue;
    for (let ms = Math.max(sinceMs, alignToDay(sinceMs)); ms <= todayMs; ms += DAY_MS) {
      const d = kstDateStr(ms);
      if (createdMs && ms < alignToDay(createdMs)) continue;
      if (days.includes(dayOfWeek(d))) out.push({ date: d, teacherId: s.teacher_id });
    }
  }
  return out;
}

function isExpectedOn(s, date) {
  if ((s.status || 'active') !== 'active') return false;
  if (s.scheduled_date) return s.scheduled_date === date;
  const dows = (s.day_of_week || '').toLowerCase();
  if (!dows || !dows.includes(dayOfWeek(date))) return false;
  if (s.created_at && dateToMs(date) < alignToDay(s.created_at)) return false;
  return true;
}

// nowMs 를 주입받아 결정적으로(테스트용) — 소스는 Date.now() 사용
function buildNegEvents(schedules, att, alim, sinceMs, today, nowMs) {
  const W = CFG; const events = [];
  const attended = new Map(); for (const a of att) if (a.date) attended.set(a.date, a);
  const expected = expandExpectedSessions(schedules, sinceMs, today);
  const seen = new Set();
  for (const e of expected) {
    if (attended.has(e.date)) continue;
    if (seen.has(e.date)) continue; seen.add(e.date);
    events.push({ type: 'MISSED', ts: dateToMs(e.date), date: e.date, teacherId: e.teacherId });
  }
  for (const a of att) {
    if (!a.date) continue; const ts = dateToMs(a.date);
    if (a.gaze_samples && a.gaze_score != null && a.gaze_score < W.lowGaze) events.push({ type: 'LOW_GAZE', ts, date: a.date, teacherId: null });
    if ((a.total_session_ms || 0) > 0 && (a.total_active_ms || 0) / (a.total_session_ms || 1) < W.earlyLeaveRatio) events.push({ type: 'LEFT_EARLY', ts, date: a.date, teacherId: null });
    if ((a.disconnect_count || 0) >= W.disconnectMin) events.push({ type: 'UNSTABLE', ts, date: a.date, teacherId: null });
  }
  const graceMs = W.ignoreGraceDays * DAY_MS;
  for (const m of alim) {
    if (m.read_at != null) continue;
    if (nowMs - m.sent_at < graceMs) continue;
    events.push({ type: 'IGNORED', ts: m.sent_at, date: kstDateStr(m.sent_at), teacherId: null });
  }
  let lastAttMs = 0; for (const a of att) if (a.date) lastAttMs = Math.max(lastAttMs, dateToMs(a.date));
  if (lastAttMs > 0) {
    const idle = daysBetween(dateToMs(today), lastAttMs);
    if (idle >= W.dormantDays) events.push({ type: 'DORMANT', ts: dateToMs(today), date: today, teacherId: null });
  }
  events.sort((a, b) => a.ts - b.ts || a.type.localeCompare(b.type));
  return events;
}

function scoreChain(chain, today) {
  const W = CFG; const todayMs = dateToMs(today); let score = 0;
  for (let i = 0; i < chain.length; i++) {
    const ev = chain[i]; const base = W.weights[ev.type] || 1;
    const ageDays = Math.max(0, daysBetween(todayMs, ev.ts));
    const decay = Math.pow(0.5, ageDays / W.halfLifeDays);
    const escalation = 1 + i * W.escalationStep;
    let pts = base * decay * escalation;
    const prev = chain[i - 1];
    if (prev && ((prev.type === 'MISSED' && ev.type === 'IGNORED') || (prev.type === 'IGNORED' && ev.type === 'MISSED'))) pts += W.cascadeBonus * decay;
    score += pts;
  }
  return score;
}

function traverse(events, today) {
  const W = CFG;
  if (!events.length) return { best: [], score: 0, chainCount: 0, longest: 0 };
  const linkMs = W.linkWindowDays * DAY_MS; const chains = []; let cur = [events[0]];
  for (let i = 1; i < events.length; i++) {
    if (events[i].ts - events[i - 1].ts <= linkMs) cur.push(events[i]); else { chains.push(cur); cur = [events[i]]; }
  }
  chains.push(cur);
  let best = [], score = 0, longest = 0;
  for (const c of chains) { longest = Math.max(longest, c.length); const sc = scoreChain(c, today); if (sc > score) { score = sc; best = c; } }
  return { best, score, chainCount: chains.length, longest };
}

function computeChainRisk(uid, schedules, att, alim, sinceMs, today, nowMs) {
  const W = CFG;
  const events = buildNegEvents(schedules, att, alim, sinceMs, today, nowMs);
  const { best, score, chainCount, longest } = traverse(events, today);
  const missed = events.filter(e => e.type === 'MISSED');
  const ignored = events.filter(e => e.type === 'IGNORED');
  const byTeacher = new Map();
  for (const m of missed) if (m.teacherId) byTeacher.set(m.teacherId, (byTeacher.get(m.teacherId) || 0) + 1);
  let dominantTeacher = null, domCount = 0;
  for (const [t, c] of byTeacher) if (c > domCount) { domCount = c; dominantTeacher = t; }
  const concentration = missed.length ? domCount / missed.length : 0;
  let finalScore = score; const reasons = [];
  if (best.length >= 2) reasons.push(`부정 행동 사슬 ${best.length}연속(${best.map(e => e.type).join('→')})`);
  if (ignored.length) reasons.push(`알림톡 미열람 ${ignored.length}건`);
  if (missed.length >= W.teacherConcentrationMinMiss && concentration >= W.teacherConcentration && dominantTeacher) {
    finalScore *= 1.15; reasons.push(`결석 ${Math.round(concentration * 100)}%가 ${dominantTeacher} 강사에 집중(미스매치 의심)`);
  }
  if (events.some(e => e.type === 'DORMANT')) reasons.push('장기 휴면 진입');
  return {
    uid, chainScore: Math.round(finalScore * 10) / 10, longestChainLen: longest, chainCount,
    missedCount: missed.length, ignoredCount: ignored.length, dominantTeacher,
    teacherConcentration: Math.round(concentration * 100) / 100, reasons, path: best,
  };
}

const T = '2026-06-29';                 // 고정 today (월요일)
const NOW = dateToMs(T);                 // 고정 now
const SINCE = NOW - 90 * DAY_MS;

// ═══════════════════ [1] 예정수업 전개 ═══════════════════
console.log('\n[1] 예정수업 전개 (class_schedules → 기대 세션)');
{
  // 반복(월/수/금) 스케줄, 충분히 과거에 생성
  const sched = [{ day_of_week: 'mon,wed,fri', teacher_id: 'kim', created_at: dateToMs('2026-01-01') }];
  const exp = expandExpectedSessions(sched, dateToMs('2026-06-22'), T);
  const dows = new Set(exp.map(e => dayOfWeek(e.date)));
  check('월/수/금만 전개됨', [...dows].sort().join() === 'fri,mon,wed');
  check('오늘(월,0629)은 미포함 — 아직 결석 아님', !exp.some(e => e.date === T));
  eq('해당 주(0622~0628) 세션 수 = 3', exp.filter(e => e.date >= '2026-06-22' && e.date <= '2026-06-28').length, 3);

  // 일회성
  const one = expandExpectedSessions([{ scheduled_date: '2026-06-25', teacher_id: 't1' }], SINCE, T);
  eq('일회성 1건', one.length, 1);
  eq('일회성 날짜', one[0].date, '2026-06-25');

  // 등록 이전 날짜 제외
  const late = expandExpectedSessions([{ day_of_week: 'mon', created_at: dateToMs('2026-06-20') }], dateToMs('2026-06-01'), T);
  check('스케줄 등록(0620) 이전 월요일은 제외', !late.some(e => e.date < '2026-06-20'));
}

// ═══════════════════ [2] isExpectedOn (어제 결석 판정) ═══════════════════
console.log('\n[2] isExpectedOn — 케어리스트 어제 결석 판정');
{
  check('정기 요일 일치', isExpectedOn({ day_of_week: 'mon,wed', status: 'active', created_at: dateToMs('2026-01-01') }, '2026-06-29'));
  check('정기 요일 불일치(일요일)', !isExpectedOn({ day_of_week: 'mon,wed', created_at: 0 }, '2026-06-28'));
  check('일회성 정확 일자', isExpectedOn({ scheduled_date: '2026-06-29' }, '2026-06-29'));
  check('비활성 스케줄 제외', !isExpectedOn({ day_of_week: 'mon', status: 'paused' }, '2026-06-29'));
  check('등록 이후 날짜만', !isExpectedOn({ day_of_week: 'mon', created_at: dateToMs('2026-06-30') }, '2026-06-29'));
}

// ═══════════════════ [3] 결석 사슬 + 캐스케이드 점수 ═══════════════════
console.log('\n[3] 결석→알림톡무시→결석 인과 사슬 점수');
{
  const sched = [
    { scheduled_date: '2026-06-20', teacher_id: 'kim' },
    { scheduled_date: '2026-06-24', teacher_id: 'kim' },
  ];
  const alim = [{ sent_at: dateToMs('2026-06-22'), read_at: null, reason: 'absence' }];
  const r = computeChainRisk('A', sched, [], alim, SINCE, T, NOW);
  eq('결석 2건', r.missedCount, 2);
  eq('미열람 1건', r.ignoredCount, 1);
  eq('최장 사슬 3', r.longestChainLen, 3);
  eq('best 경로 = MISSED→IGNORED→MISSED', r.path.map(e => e.type), ['MISSED', 'IGNORED', 'MISSED']);
  near('사슬 점수(캐스케이드 포함) ≈ 11', r.chainScore, 11.0, 0.6);
  check('사유: 사슬 3연속 표기 (best.length 일관성)', r.reasons.some(x => x.includes('3연속')));
  check('사유: 알림톡 미열람 1건', r.reasons.some(x => x.includes('미열람 1건')));
  check('미열람 2명<3 → 강사집중 가중 미적용', !r.reasons.some(x => x.includes('미스매치')));
}

// ═══════════════════ [4] 캐스케이드가 점수를 실제로 올리는가 ═══════════════════
console.log('\n[4] 캐스케이드 보너스 효과');
{
  const base = computeChainRisk('B', [{ scheduled_date: '2026-06-20', teacher_id: 't' }, { scheduled_date: '2026-06-24', teacher_id: 't' }], [], [], SINCE, T, NOW);
  const casc = computeChainRisk('B', [{ scheduled_date: '2026-06-20', teacher_id: 't' }, { scheduled_date: '2026-06-24', teacher_id: 't' }], [], [{ sent_at: dateToMs('2026-06-22'), read_at: null }], SINCE, T, NOW);
  check('알림톡무시가 낀 사슬 점수 > 결석만', casc.chainScore > base.chainScore);
}

// ═══════════════════ [5] 강사 집중도 미스매치 ═══════════════════
console.log('\n[5] 결석이 한 강사에 집중 → 미스매치 가중');
{
  const sched = ['2026-06-10', '2026-06-15', '2026-06-22'].map(d => ({ scheduled_date: d, teacher_id: 'lee' }));
  const r = computeChainRisk('C', sched, [], [], SINCE, T, NOW);
  eq('결석 3건', r.missedCount, 3);
  eq('강사 집중도 1.0', r.teacherConcentration, 1);
  eq('지배 강사 lee', r.dominantTeacher, 'lee');
  check('사유: lee 강사 집중 미스매치', r.reasons.some(x => x.includes('lee') && x.includes('미스매치')));
}

// ═══════════════════ [6] 휴면(DORMANT) ═══════════════════
console.log('\n[6] 장기 미출석 → 휴면 합성 이벤트');
{
  const att = [{ date: '2026-05-20', gaze_samples: 0 }]; // 마지막 출석 40일 전
  const r = computeChainRisk('D', [], att, [], SINCE, T, NOW);
  check('DORMANT 사유 존재', r.reasons.includes('장기 휴면 진입'));
  check('휴면 점수 > 0', r.chainScore > 0);
  const fresh = computeChainRisk('D2', [], [{ date: '2026-06-28', gaze_samples: 0 }], [], SINCE, T, NOW);
  check('최근 출석(어제)자는 휴면 아님', !fresh.reasons.includes('장기 휴면 진입'));
}

// ═══════════════════ [7] 안정 학생 / 유예중 알림톡 ═══════════════════
console.log('\n[7] 엣지케이스 — 안정 학생 · 유예중 알림톡');
{
  // 예정수업 모두 출석
  const sched = [{ scheduled_date: '2026-06-24', teacher_id: 'k' }];
  const att = [{ date: '2026-06-24', gaze_samples: 10, gaze_score: 80, total_session_ms: 1800000, total_active_ms: 1700000, disconnect_count: 0 }];
  const r = computeChainRisk('E', sched, att, [], SINCE, T, NOW);
  eq('결석 0', r.missedCount, 0);
  eq('점수 0 (사슬 없음)', r.chainScore, 0);

  // 발송 후 유예기간(3일) 내 알림톡 → IGNORED 아님
  const recent = computeChainRisk('F', [], [{ date: '2026-06-28', gaze_samples: 0 }],
    [{ sent_at: dateToMs('2026-06-28'), read_at: null }], SINCE, T, NOW);
  eq('유예중 알림톡은 미열람 집계 제외', recent.ignoredCount, 0);

  // 읽은 알림톡 → IGNORED 아님
  const readOk = computeChainRisk('G', [], [{ date: '2026-06-10', gaze_samples: 0 }],
    [{ sent_at: dateToMs('2026-06-10'), read_at: dateToMs('2026-06-11') }], SINCE, T, NOW);
  eq('열람한 알림톡은 미열람 집계 제외', readOk.ignoredCount, 0);
}

// ═══════════════════ [8] 소스 드리프트 가드 (배선 실재 확인) ═══════════════════
console.log('\n[8] 소스 드리프트 가드 — 핵심 규칙/배선 실재');
{
  const churn = read(resolve(CF, 'src/churn-graph.ts'));
  const learn = read(resolve(CF, 'src/learning-insights.ts'));
  const index = read(resolve(CF, 'src/index.ts'));
  const solapi = read(resolve(CF, 'src/solapi-client.ts'));
  const mig = read(resolve(CF, 'migration-churn-graph.sql'));

  // churn-graph.ts
  has('churn: computeChainRiskMap export', churn, 'export async function computeChainRiskMap');
  has('churn: buildCareList export', churn, 'export async function buildCareList');
  has('churn: runAbsenceSweep export', churn, 'export async function runAbsenceSweep');
  has('churn: best.length 사유 일관성 수정 반영', churn, 'best.length >= 2');
  has('churn: 결석 자동발송 게이트(AUTO_ALIMTALK)', churn, "AUTO_ALIMTALK");
  has('churn: 같은날 중복발송 dedupe', churn, "reason='absence' AND ref_date");

  // learning-insights.ts — 기존 평면점수에 사슬 병합 + 신규 라우트
  has('learn: churn-graph import', learn, "from './churn-graph'");
  has('learn: chainScore 가산 병합', learn, 'chain_score');
  has('learn: /churn 라우트', learn, "p === 'churn'");
  has('learn: /care-today 라우트', learn, "p === 'care-today'");
  has('learn: care-today 는 parent_phone 미노출', learn, 'has_parent_contact');

  // index.ts — 공개 클릭추적 + 오픈리다이렉트 가드 + cron
  has('index: alimtalk read 라우트', index, "path === '/api/alimtalk/r'");
  has('index: 오픈리다이렉트 가드(workers.dev)', index, ".workers.dev");
  has('index: 결석 스윕 cron 연결', index, 'runAbsenceSweep');

  // solapi-client.ts — 로깅 항상 + URL추적 플래그 게이트
  has('solapi: alimtalk_log 기록 함수', solapi, 'logAlimtalkSend');
  has('solapi: ensure/마킹 함수', solapi, 'markAlimtalkRead');
  has('solapi: URL추적은 ALIMTALK_TRACK 게이트', solapi, "ALIMTALK_TRACK");

  // migration
  has('mig: alimtalk_log 테이블', mig, 'CREATE TABLE IF NOT EXISTS alimtalk_log');
  has('mig: track_token 컬럼', mig, 'track_token');
  has('mig: read_at 컬럼(미열람 판정)', mig, 'read_at');
}

// ═══════════════════ 결과 ═══════════════════
console.log('\n====================================================');
console.log(`🎯 총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('❌ 실패 항목:'); for (const f of FAILS) console.log('   - ' + f); }
else console.log('🎉 이탈위험 그래프 엔진 — 경로점수·강사집중·캐스케이드·휴면·배선 모두 정상');
console.log('====================================================');
process.exit(FAIL ? 1 : 0);
