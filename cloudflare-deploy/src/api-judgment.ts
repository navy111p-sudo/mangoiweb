// ═══════════════════════════════════════════════════════════════════════
// 🧠 api-judgment.ts — 판단력 엔진 2단계(Mode A: 엣지/KV)
//   '지식 암기 → AI 판단력 훈련' 전환의 데이터 수집·분석 코어.
//   설계서: docs/판단력엔진_1단계_시스템설계_DB연동_명세서.md
//
//   담당:
//     1) ensureJudgmentTables(env)      — D1 신규 5테이블 self-healing DDL (isolate 1회)
//     2) getMisconceptionTaxonomy(env)  — 오답 유형 사전을 KV 캐시로 효율 조회 (엣지 최적화)
//     3) runJudgmentAnalysis(env, in)   — 수업 종료 신호(전사)에서 판단 이벤트 추출·채점 →
//                                          judgment_events + judgment_analysis 적재 + 성능 로깅
//
//   호출: api-points.ts 의 POST /api/ai-feedback/generate 핸들러가
//         ctx.waitUntil(runJudgmentAnalysis(...)) 로 비동기 실행(교사 피드백 응답 무블로킹).
//   LLM: Cloudflare Workers AI @cf/meta/llama-3.3-70b-instruct-fp8-fast (기존 하우스 모델).
//   KV : env.SESSION_STATE (오답사전 캐시 + 동일 판단 반복 캐시).
// ═══════════════════════════════════════════════════════════════════════
import type { MangoEnv } from './api-mango';
import { getWeakDecisionSkills } from './decision-graph';  // 3단계: 취약 스킬(Neo4j) — 시나리오 입력
// 🧮 지수·채점 계산은 순수 모듈로 분리(테스트 하니스가 직접 불러 검증) — judgment-scoring.ts
import {
  axesFromRows, normalizeOptionScores, normalizeDifficulty, scoreChoice, type GrowthAxes,
} from './judgment-scoring';
export type { GrowthAxes };
export { normalizeOptionScores, normalizeDifficulty } from './judgment-scoring';

const JUDGE_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
// 🔀 정본 페이로드 버전 — Mode A(엣지) / Mode B(Celery/Redis) 가 동일하게 읽고 쓰는 계약.
//    엔벨로프 구조가 바뀌면 이 값을 올려 소비자가 버전 분기 가능.
const JUDGMENT_SCHEMA_VER = 'judg-1';
const TAXONOMY_KV_KEY = 'judg:taxonomy:v1';
const TAXONOMY_KV_TTL = 3600;            // 1h — 사전은 거의 안 변하므로 길게
const REPEAT_CACHE_TTL = 30 * 24 * 3600; // 30d — 동일 상황·선택·이유 반복 학습 캐시
const MAX_EVENTS_PER_CLASS = 5;          // 한 수업에서 추출할 판단 이벤트 상한

// ── isolate 당 1회만 DDL (D1 락 폭주 방지 — 기존 관례) ──
let __judgmentTablesReady = false;

/** 판단력 엔진 D1 5테이블 (self-healing). 소유 파일 = 본 모듈 단일. */
export async function ensureJudgmentTables(env: MangoEnv): Promise<void> {
  if (__judgmentTablesReady) return;
  // 1) 판단 이벤트 원본 로그
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS judgment_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_uid TEXT UNIQUE, student_uid TEXT NOT NULL, student_name TEXT, room_id TEXT, schedule_id INTEGER, lesson_date TEXT, source TEXT NOT NULL, situation_id TEXT, situation_text TEXT, skill_tag TEXT, options_json TEXT, chosen_option TEXT, chosen_index INTEGER, reasoning_text TEXT, lang TEXT DEFAULT 'en', analyzed INTEGER DEFAULT 0, created_at INTEGER NOT NULL);`);
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_je_student ON judgment_events(student_uid, created_at);`);
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_je_pending ON judgment_events(analyzed);`);
  // 2) AI 채점 결과 (1:1)
  //   raw_json  = 이벤트+분석을 합친 '정본 엔벨로프' 통째 저장 → Mode B 이관 시 조인 없이 그대로 추출/재생.
  //   schema_ver= 엔벨로프 버전(소비자 버전 분기용).
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS judgment_analysis (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER UNIQUE, student_uid TEXT NOT NULL, choice_score INTEGER, best_option TEXT, is_optimal INTEGER, reasoning_score INTEGER, reasoning_features_json TEXT, misconception_tag TEXT, feedback_ko TEXT, feedback_en TEXT, model TEXT, cache_hit INTEGER DEFAULT 0, latency_ms INTEGER, raw_json TEXT, schema_ver TEXT, migrated_at INTEGER, created_at INTEGER NOT NULL);`);
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_ja_student ON judgment_analysis(student_uid, created_at);`);
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_ja_misc ON judgment_analysis(misconception_tag);`);
  // 🔀 마이그레이션 추출용 인덱스 — 아직 Mode B 로 넘기지 않은(raw_json 있고 migrated_at NULL) 행을 증분 추출.
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_ja_export ON judgment_analysis(migrated_at, id);`);
  // 방어적 ALTER — 이미 배포된 구(舊) 스키마가 있으면 컬럼 보강(멱등, 실패 무시).
  for (const col of ['raw_json TEXT', 'schema_ver TEXT', 'migrated_at INTEGER']) {
    try { await env.DB.exec(`ALTER TABLE judgment_analysis ADD COLUMN ${col};`); } catch { /* 이미 있음 */ }
  }
  // 3) 오답 유형 사전 (시드 대상)
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS misconception_taxonomy (code TEXT PRIMARY KEY, label_ko TEXT, label_en TEXT, dimension TEXT, description TEXT, sort_order INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1, updated_at INTEGER);`);
  // 4) 판단력 성장 추이 집계
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS decision_growth_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, period TEXT NOT NULL, student_uid TEXT NOT NULL, student_name TEXT, events_count INTEGER, axis_choice REAL, axis_reasoning REAL, axis_selfcorrection REAL, axis_register REAL, axis_consistency REAL, judgment_index REAL, delta_index REAL, top_misconceptions TEXT, generated_at INTEGER, UNIQUE(period, student_uid));`);
  // 5) 작업별 성능 모니터링
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS analysis_perf_log (id INTEGER PRIMARY KEY AUTOINCREMENT, task TEXT NOT NULL, ref_id TEXT, duration_ms INTEGER, cache_hit INTEGER DEFAULT 0, status TEXT, detail TEXT, created_at INTEGER NOT NULL);`);
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_perf_task ON analysis_perf_log(task, created_at);`);
  __judgmentTablesReady = true;
}

// ── 오답 유형 사전 초기 시드 (멱등) ──
const TAXONOMY_SEED: Array<{ code: string; ko: string; en: string; dim: string; desc: string }> = [
  { code: 'REGISTER_MISMATCH',  ko: '격식 불일치',   en: 'Register mismatch',        dim: 'register',  desc: '상황(격식/친근)에 맞지 않는 어투를 선택' },
  { code: 'DIRECT_TRANSLATION', ko: '직역투',        en: 'Direct translation',       dim: 'choice',    desc: '한국어를 그대로 옮겨 부자연스러운 영어' },
  { code: 'TENSE_CONFUSION',    ko: '시제 혼동',      en: 'Tense confusion',          dim: 'reasoning', desc: '시제/시간 관계를 잘못 판단' },
  { code: 'WORD_CHOICE',        ko: '어휘 부적절',    en: 'Inappropriate word choice',dim: 'choice',    desc: '의미는 통하나 더 적절한 어휘가 있음' },
  { code: 'OVER_LITERAL_REASON',ko: '표면적 이유',    en: 'Surface-level reasoning',  dim: 'reasoning', desc: '왜 그 표현인지 이유가 얕거나 근거 부족' },
  { code: 'NO_CONTEXT',         ko: '맥락 미고려',    en: 'Context ignored',          dim: 'register',  desc: '대화 맥락/상대를 고려하지 않은 선택' },
  { code: 'GRAMMAR_FORM',       ko: '형태 오류',      en: 'Grammatical form error',   dim: 'choice',    desc: '문법 형태(어순/일치 등) 오류' },
];

async function ensureTaxonomySeed(env: MangoEnv): Promise<void> {
  const cnt: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM misconception_taxonomy`).first();
  if ((cnt?.c || 0) > 0) return;
  const now = Date.now();
  for (let i = 0; i < TAXONOMY_SEED.length; i++) {
    const t = TAXONOMY_SEED[i];
    await env.DB.prepare(`INSERT INTO misconception_taxonomy (code, label_ko, label_en, dimension, description, sort_order, enabled, updated_at) VALUES (?,?,?,?,?,?,1,?) ON CONFLICT(code) DO NOTHING`)
      .bind(t.code, t.ko, t.en, t.dim, t.desc, i, now).run();
  }
}

export interface TaxonomyEntry { code: string; label_ko: string; label_en: string; dimension: string; }

/**
 * 오답 유형 사전을 엣지에서 효율적으로 조회.
 *   1순위 KV(env.SESSION_STATE) 캐시 → 미스 시 D1 조회(+최초 시드) → KV 저장.
 *   매 수업 종료마다 D1 를 때리지 않도록 캐시(그것이 엣지 최적화의 핵심).
 */
export async function getMisconceptionTaxonomy(env: MangoEnv): Promise<TaxonomyEntry[]> {
  const kv = (env as any).SESSION_STATE as KVNamespace | undefined;
  // 1) KV 캐시 히트
  if (kv) {
    try {
      const cached = await kv.get(TAXONOMY_KV_KEY);
      if (cached) {
        const arr = JSON.parse(cached);
        if (Array.isArray(arr) && arr.length) return arr;
      }
    } catch { /* 캐시 손상 무시하고 D1 로 폴백 */ }
  }
  // 2) D1 조회 (+ 최초 1회 시드)
  await ensureTaxonomySeed(env);
  const rs = await env.DB.prepare(`SELECT code, label_ko, label_en, dimension FROM misconception_taxonomy WHERE enabled=1 ORDER BY sort_order`).all();
  const entries: TaxonomyEntry[] = (rs.results || []).map((r: any) => ({
    code: String(r.code), label_ko: String(r.label_ko || ''), label_en: String(r.label_en || ''), dimension: String(r.dimension || ''),
  }));
  // 3) KV 저장 (다음 요청부터 D1 미접근)
  if (kv && entries.length) {
    try { await kv.put(TAXONOMY_KV_KEY, JSON.stringify(entries), { expirationTtl: TAXONOMY_KV_TTL }); } catch { /* 캐시 저장 실패 무시 */ }
  }
  return entries;
}

// ── 유틸: 정규화 + sha256 (반복 캐시 키) ──
function normalizeText(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9가-힣 ]/g, '').replace(/\s+/g, ' ').trim();
}
export async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface JudgmentInput {
  roomId: string;
  studentUid?: string;
  studentName?: string;
  scheduleId?: number | null;
  lessonDate?: string;
  transcript?: string;
  lang?: string;
  /** 향후 인-클래스 판단 UI 가 직접 넘기는 구조화 이벤트(있으면 전사 추출을 건너뜀). */
  judgments?: Array<any>;
  /** 이벤트 멱등키 접두사(기본=roomId). 수업 중 청크 분석(/api/judgment/inclass)은
   *  청크마다 고유 접두사를 넘겨야 함 — 없으면 `${roomId}:0..` 이 청크끼리 덮어씀. */
  eventUidPrefix?: string;
}

/**
 * 🔀 정본 판단 엔벨로프 — Mode A/B 공통 계약(single source of truth).
 *   지금은 D1 judgment_analysis.raw_json 에 저장하고, Mode B 전환 시 이 객체를
 *   그대로 Redis enqueue / FastAPI POST /api/v1/judgment/ingest 페이로드로 재사용한다.
 *   구조 변경 시 JUDGMENT_SCHEMA_VER 를 올릴 것.
 */
export function buildJudgmentEnvelope(e: {
  event_uid: string; student_uid: string; student_name?: string | null; room_id: string;
  schedule_id?: number | null; lesson_date: string; source: string;
  situation_text?: string | null; skill_tag?: string | null; options?: string[];
  chosen_option?: string | null; reasoning_text?: string | null; lang: string;
  choice_score: number | null; best_option?: string | null; is_optimal: number;
  reasoning_score: number | null; reasoning_features: any; misconception_tag: string | null;
  feedback_ko?: string | null; feedback_en?: string | null; model: string; created_at: number;
}): any {
  return {
    schema_ver: JUDGMENT_SCHEMA_VER,
    event_uid: e.event_uid,
    student_uid: e.student_uid,
    student_name: e.student_name || null,
    room_id: e.room_id,
    schedule_id: e.schedule_id ?? null,
    lesson_date: e.lesson_date,
    source: e.source,
    situation_text: e.situation_text || null,
    skill_tag: e.skill_tag || null,
    options: e.options || [],
    chosen_option: e.chosen_option || null,
    reasoning_text: e.reasoning_text || null,
    lang: e.lang,
    analysis: {
      choice_score: e.choice_score,
      best_option: e.best_option || null,
      is_optimal: !!e.is_optimal,
      reasoning_score: e.reasoning_score,
      reasoning_features: e.reasoning_features || {},
      misconception_tag: e.misconception_tag || null,
      feedback_ko: e.feedback_ko || null,
      feedback_en: e.feedback_en || null,
    },
    model: e.model,
    created_at: e.created_at,
  };
}

/** LLM 원응답에서 첫 JSON 오브젝트 파싱 */
function parseFirstJson(text: any): any | null {
  const s = typeof text === 'string' ? text : (typeof text?.response === 'string' ? text.response : JSON.stringify(text?.response || ''));
  const m = String(s || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/**
 * 수업 종료 신호에서 판단 이벤트를 추출·채점해 D1 에 적재한다.
 *   전 구간을 analysis_perf_log 로 계측(엣지 처리시간 로깅).
 *   교사 피드백 응답을 막지 않도록 호출측에서 ctx.waitUntil 로 감싼다.
 *   반환: { ok, inserted, cache_hit, duration_ms } (내부 진단용).
 */
export async function runJudgmentAnalysis(env: MangoEnv, input: JudgmentInput): Promise<any> {
  const t0 = Date.now();                 // ⏱️ 성능 로깅 시작
  let cacheHit = 0;
  let inserted = 0;
  let status = 'ok';
  let llmMs = 0;
  const roomId = String(input.roomId || '').trim();
  const studentUid = String(input.studentUid || '').trim();

  try {
    await ensureJudgmentTables(env);

    // 학생 식별 불가 / 재료(전사·구조화 이벤트) 없음 → 조용히 스킵(계측만 남김)
    const transcript = String(input.transcript || '').slice(0, 6000).trim();
    const hasStructured = Array.isArray(input.judgments) && input.judgments.length > 0;
    if (!studentUid || (!transcript && !hasStructured)) {
      status = 'skip_no_material';
      await logPerf(env, 'judgment_analyze', roomId, Date.now() - t0, cacheHit, status, { studentUid: !!studentUid, transcript: transcript.length });
      return { ok: true, skipped: status, inserted: 0 };
    }

    const kv = (env as any).SESSION_STATE as KVNamespace | undefined;
    const ai = (env as any).AI;
    const lang = input.lang || 'en';
    const lessonDate = input.lessonDate || new Date().toISOString().slice(0, 10);
    const taxonomy = await getMisconceptionTaxonomy(env);   // ← KV 캐시 경유
    const validCodes = new Set(taxonomy.map((t) => t.code));

    // ── 판단 이벤트 확보: 구조화 입력 우선, 없으면 전사에서 LLM 추출 ──
    let events: any[] = [];
    if (hasStructured) {
      events = input.judgments!.slice(0, MAX_EVENTS_PER_CLASS);
    } else {
      // ── 동일 전사 반복 캐시(엣지): 같은 수업 재생성 시 LLM 재호출 회피 ──
      const cacheKey = `judg:v1:${await sha256hex(roomId + '|' + normalizeText(transcript))}`;
      if (kv) {
        try {
          const hit = await kv.get(cacheKey);
          if (hit) { events = JSON.parse(hit); cacheHit = 1; }
        } catch { /* 캐시 손상 무시 */ }
      }
      if (!events.length && ai) {
        const taxonomyList = taxonomy.map((t) => `${t.code} (${t.label_en})`).join(', ');
        const prompt = `You are analyzing a 1:1 English lesson transcript with a Korean child, to train DECISION-MAKING (choosing the best expression and explaining why) rather than rote memory.

From the transcript, pick up to ${MAX_EVENTS_PER_CLASS} moments where the STUDENT produced an English expression that involved a real choice (there was a clearly better or more natural alternative). For each, judge the choice and, if the child explained their reasoning, judge that reasoning.

TRANSCRIPT:
${transcript}

Return STRICT JSON only:
{
  "judgments": [
    {
      "situation": "<short context, English>",
      "skill_tag": "<short kebab tag, e.g. request-politely, past-tense, greeting>",
      "student_said": "<what the student actually said>",
      "better_option": "<a more natural/appropriate expression>",
      "is_optimal": <true if the student's choice was already best>,
      "choice_score": <0-100 appropriateness of the student's choice>,
      "student_reasoning": "<the child's stated 'why', or empty string if none>",
      "reasoning_score": <0-100 logic/depth of that reasoning; 0 if none stated>,
      "register_awareness": <0-100 sensitivity to formality/context>,
      "misconception": "<ONE of: ${taxonomyList}, or null if the choice was optimal>",
      "feedback_ko": "<1 short encouraging sentence in Korean>",
      "feedback_en": "<1 short encouraging sentence in English>"
    }
  ]
}
Only include real moments grounded in the transcript. Do NOT invent quotes. If there are no clear decision moments, return {"judgments": []}.`;
        const lt0 = Date.now();
        try {
          const resp: any = await ai.run(JUDGE_MODEL, {
            messages: [
              { role: 'system', content: 'You score English decision-making. Reply in strict JSON only, no prose outside JSON.' },
              { role: 'user', content: prompt },
            ],
            max_tokens: 1400,
          });
          llmMs = Date.now() - lt0;
          const j = parseFirstJson(resp);
          if (j && Array.isArray(j.judgments)) events = j.judgments.slice(0, MAX_EVENTS_PER_CLASS);
        } catch (e: any) {
          llmMs = Date.now() - lt0;
          console.warn('[judgment] LLM extract fail:', e?.message);
          status = 'llm_error';
        }
        // 반복 캐시 저장(추출 성공 시에만)
        if (kv && events.length) {
          try { await kv.put(cacheKey, JSON.stringify(events), { expirationTtl: REPEAT_CACHE_TTL }); } catch { /* 무시 */ }
        }
      }
    }

    // ── D1 적재: judgment_events(멱등) + judgment_analysis(upsert) ──
    const now = Date.now();
    for (let i = 0; i < events.length; i++) {
      const ev = events[i] || {};
      const eventUid = `${String(input.eventUidPrefix || roomId)}:${i}`;   // 접두사·순번 멱등키(재생성 시 중복 방지, 인클래스 청크는 청크별 접두사)
      const chosen = String(ev.student_said ?? ev.chosen_option ?? '').slice(0, 500);
      const better = String(ev.better_option ?? ev.best_option ?? '').slice(0, 500);
      const reasoning = String(ev.student_reasoning ?? ev.reasoning_text ?? '').slice(0, 1000);
      const skillTag = String(ev.skill_tag ?? '').slice(0, 60) || null;
      const situation = String(ev.situation ?? ev.situation_text ?? '').slice(0, 500) || null;
      const options = [chosen, better].filter(Boolean);
      const clamp = (v: any) => { const n = Math.round(+v); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null; };
      const choiceScore = clamp(ev.choice_score);
      const reasoningScore = clamp(ev.reasoning_score);
      const registerAwareness = clamp(ev.register_awareness);
      const isOptimal = (ev.is_optimal === true || ev.is_optimal === 1) ? 1 : 0;
      let misc = (ev.misconception && ev.misconception !== 'null') ? String(ev.misconception).toUpperCase().trim() : null;
      if (misc && !validCodes.has(misc)) misc = null;   // 사전에 없는 코드는 버림(무결성)
      const featuresJson = JSON.stringify({ register_awareness: registerAwareness, has_reasoning: reasoning.length > 0, source_llm: !hasStructured });

      try {
        // 1) 이벤트 원본 — event_uid UNIQUE 멱등
        await env.DB.prepare(`INSERT INTO judgment_events (event_uid, student_uid, student_name, room_id, schedule_id, lesson_date, source, situation_id, situation_text, skill_tag, options_json, chosen_option, chosen_index, reasoning_text, lang, analyzed, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?) ON CONFLICT(event_uid) DO UPDATE SET situation_text=excluded.situation_text, skill_tag=excluded.skill_tag, options_json=excluded.options_json, chosen_option=excluded.chosen_option, reasoning_text=excluded.reasoning_text, analyzed=1`)
          .bind(eventUid, studentUid, input.studentName || null, roomId, input.scheduleId ?? null, lessonDate, 'in_class', null, situation, skillTag, options.length ? JSON.stringify(options) : null, chosen || null, 0, reasoning || null, lang, now).run();
        const row: any = await env.DB.prepare(`SELECT id FROM judgment_events WHERE event_uid=?`).bind(eventUid).first();
        const eventId = row?.id;
        if (!eventId) continue;
        const modelUsed = hasStructured ? 'structured' : JUDGE_MODEL;
        const fbKo = String(ev.feedback_ko || '').slice(0, 400) || null;
        const fbEn = String(ev.feedback_en || '').slice(0, 400) || null;
        const features = { register_awareness: registerAwareness, has_reasoning: reasoning.length > 0, source_llm: !hasStructured };
        // 🔀 정본 엔벨로프 — 이관 시 조인 없이 그대로 추출/재생 가능한 통짜 레코드
        const envelope = buildJudgmentEnvelope({
          event_uid: eventUid, student_uid: studentUid, student_name: input.studentName, room_id: roomId,
          schedule_id: input.scheduleId ?? null, lesson_date: lessonDate, source: 'in_class',
          situation_text: situation, skill_tag: skillTag, options, chosen_option: chosen, reasoning_text: reasoning, lang,
          choice_score: choiceScore, best_option: better, is_optimal: isOptimal, reasoning_score: reasoningScore,
          reasoning_features: features, misconception_tag: misc, feedback_ko: fbKo, feedback_en: fbEn, model: modelUsed, created_at: now,
        });
        // 2) 채점 결과 — event_id UNIQUE upsert (raw_json 정본 + schema_ver 포함)
        await env.DB.prepare(`INSERT INTO judgment_analysis (event_id, student_uid, choice_score, best_option, is_optimal, reasoning_score, reasoning_features_json, misconception_tag, feedback_ko, feedback_en, model, cache_hit, latency_ms, raw_json, schema_ver, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET choice_score=excluded.choice_score, best_option=excluded.best_option, is_optimal=excluded.is_optimal, reasoning_score=excluded.reasoning_score, reasoning_features_json=excluded.reasoning_features_json, misconception_tag=excluded.misconception_tag, feedback_ko=excluded.feedback_ko, feedback_en=excluded.feedback_en, model=excluded.model, cache_hit=excluded.cache_hit, latency_ms=excluded.latency_ms, raw_json=excluded.raw_json, schema_ver=excluded.schema_ver, migrated_at=NULL`)
          .bind(eventId, studentUid, choiceScore, better || null, isOptimal, reasoningScore, featuresJson, misc, fbKo, fbEn, modelUsed, cacheHit, llmMs, JSON.stringify(envelope), JUDGMENT_SCHEMA_VER, now).run();
        inserted++;
      } catch (e: any) {
        console.warn('[judgment] persist fail:', e?.message);
      }
    }

    // ⏱️ 성능 로깅 종료 — 엣지 처리시간 + LLM 소요 + 캐시히트 + 건수
    await logPerf(env, 'judgment_analyze', roomId, Date.now() - t0, cacheHit, status, { events: events.length, inserted, llm_ms: llmMs, source: hasStructured ? 'structured' : 'transcript' });
    return { ok: true, inserted, cache_hit: cacheHit, duration_ms: Date.now() - t0 };
  } catch (e: any) {
    console.warn('[judgment] runJudgmentAnalysis fatal:', e?.message);
    await logPerf(env, 'judgment_analyze', roomId, Date.now() - t0, cacheHit, 'error', { error: String(e?.message || e) });
    return { ok: false, error: String(e?.message || e) };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🔀 Mode B(Celery/Redis) 이관 지원 — 증분 추출 / 이관 표시
//   흐름: exportJudgmentEnvelopes(증분 추출) → NCP FastAPI /api/v1/judgment/ingest 로 POST
//        → 성공 id 들을 markJudgmentMigrated 로 표시 → 다음 배치는 미이관분만.
//   raw_json 이 이미 정본 엔벨로프라 조인/재구성 불필요(그대로 Redis/큐 페이로드).
// ═══════════════════════════════════════════════════════════════════════

/** 아직 이관하지 않은(migrated_at IS NULL) 판단 레코드를 정본 엔벨로프로 증분 추출. */
export async function exportJudgmentEnvelopes(env: MangoEnv, opts?: { sinceId?: number; limit?: number; includeMigrated?: boolean }): Promise<{ rows: Array<{ id: number; envelope: any }>; max_id: number }> {
  await ensureJudgmentTables(env);
  const sinceId = Math.max(0, Number(opts?.sinceId) || 0);
  const limit = Math.min(1000, Math.max(1, Number(opts?.limit) || 200));
  const where = opts?.includeMigrated ? `WHERE id > ?` : `WHERE id > ? AND migrated_at IS NULL`;
  const rs = await env.DB.prepare(`SELECT id, raw_json FROM judgment_analysis ${where} ORDER BY id ASC LIMIT ?`).bind(sinceId, limit).all();
  const rows: Array<{ id: number; envelope: any }> = [];
  let maxId = sinceId;
  for (const r of (rs.results || []) as any[]) {
    maxId = Math.max(maxId, Number(r.id));
    let env0: any = null;
    try { env0 = r.raw_json ? JSON.parse(r.raw_json) : null; } catch { env0 = null; }
    // raw_json 이 없는 구(舊) 행은 정규 컬럼으로 최소 엔벨로프 재구성(하위호환)
    if (!env0) {
      const j: any = await env.DB.prepare(`SELECT a.*, e.event_uid, e.room_id, e.lesson_date, e.source, e.situation_text, e.skill_tag, e.chosen_option, e.reasoning_text, e.options_json, e.lang FROM judgment_analysis a JOIN judgment_events e ON e.id=a.event_id WHERE a.id=?`).bind(r.id).first();
      if (j) env0 = buildJudgmentEnvelope({
        event_uid: j.event_uid, student_uid: j.student_uid, room_id: j.room_id, lesson_date: j.lesson_date || '', source: j.source || 'in_class',
        situation_text: j.situation_text, skill_tag: j.skill_tag, options: (() => { try { return JSON.parse(j.options_json || '[]'); } catch { return []; } })(),
        chosen_option: j.chosen_option, reasoning_text: j.reasoning_text, lang: j.lang || 'en',
        choice_score: j.choice_score, best_option: j.best_option, is_optimal: j.is_optimal, reasoning_score: j.reasoning_score,
        reasoning_features: (() => { try { return JSON.parse(j.reasoning_features_json || '{}'); } catch { return {}; } })(),
        misconception_tag: j.misconception_tag, feedback_ko: j.feedback_ko, feedback_en: j.feedback_en, model: j.model || '', created_at: j.created_at,
      });
    }
    if (env0) rows.push({ id: Number(r.id), envelope: env0 });
  }
  return { rows, max_id: maxId };
}

/** 이관 완료 표시(멱등) — 재추출 시 제외되어 정확히 1회만 이관. */
export async function markJudgmentMigrated(env: MangoEnv, ids: number[]): Promise<number> {
  if (!Array.isArray(ids) || !ids.length) return 0;
  const now = Date.now();
  let n = 0;
  // D1 바인드 100개 한도 → 90개 청크 (관례)
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90).map((x) => Number(x)).filter(Number.isFinite);
    if (!chunk.length) continue;
    const ph = chunk.map(() => '?').join(',');
    const r = await env.DB.prepare(`UPDATE judgment_analysis SET migrated_at=? WHERE id IN (${ph})`).bind(now, ...chunk).run();
    n += Number(r?.meta?.changes || 0);
  }
  return n;
}

// ═══════════════════════════════════════════════════════════════════════
// 📈 3단계-A: 판단력 성장 추이(decision_growth_snapshots) 집계
//   판단력 지수 5축(설계서 §2.2): 선택/이유/자기교정/어투/일관성 → 가중합 index.
//   순수 D1 집계(무 LLM 비용). 기간=KST 월(YYYY-MM).
// ═══════════════════════════════════════════════════════════════════════
// 지수 5축 계산은 judgment-scoring.ts(순수·무의존 모듈)로 분리 — 하니스가 직접 불러 검증합니다.
function kstPeriod(ts = Date.now()): string {
  const d = new Date(ts + 9 * 3600 * 1000);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
function kstPeriodBounds(period: string): [number, number] {
  const [y, m] = period.split('-').map(Number);
  const start = Date.UTC(y, m - 1, 1) - 9 * 3600 * 1000;                       // KST 월초
  const end = Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) - 9 * 3600 * 1000; // 다음 KST 월초
  return [start, end];
}
function prevPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
/** 한 학생·한 기간의 판단력 5축 + 지수 계산 (순수 D1). */
export async function computeGrowthForStudent(env: MangoEnv, studentUid: string, period: string): Promise<GrowthAxes> {
  const [start, end] = kstPeriodBounds(period);
  const rs = await env.DB.prepare(`SELECT choice_score, reasoning_score, reasoning_features_json, misconception_tag, is_optimal, created_at FROM judgment_analysis WHERE student_uid=? AND created_at>=? AND created_at<? ORDER BY created_at ASC`)
    .bind(studentUid, start, end).all<any>();
  const rows = rs.results || [];

  const a = axesFromRows(rows);
  // 이번 판단으로 지수가 얼마나 움직였는지 — 직전 판단까지만으로 한 번 더 계산
  a.prev_index = rows.length >= 2 ? axesFromRows(rows.slice(0, -1)).judgment_index : null;
  const lastRow: any = rows.length ? rows[rows.length - 1] : null;
  a.last = lastRow ? {
    choice_score: lastRow.choice_score != null ? Number(lastRow.choice_score) : null,
    reasoning_score: lastRow.reasoning_score != null ? Number(lastRow.reasoning_score) : null,
    is_optimal: lastRow.is_optimal ? 1 : 0,
    created_at: Number(lastRow.created_at) || 0,
  } : null;
  return a;
}

/**
 * 성장 스냅샷 배치 — 기간 내 이벤트가 있는 학생(또는 지정 1명)의 지수를 계산·저장(delta 포함).
 * 야간 03:00 cron + 관리자 수동 트리거에서 호출.
 */
export async function runGrowthSnapshot(env: MangoEnv, opts?: { period?: string; studentUid?: string }): Promise<{ period: string; students: number }> {
  const t0 = Date.now();
  await ensureJudgmentTables(env);
  const period = opts?.period || kstPeriod();
  const [start, end] = kstPeriodBounds(period);
  const pPrev = prevPeriod(period);

  let uids: string[] = [];
  if (opts?.studentUid) uids = [opts.studentUid];
  else {
    const rs = await env.DB.prepare(`SELECT DISTINCT student_uid FROM judgment_analysis WHERE created_at>=? AND created_at<?`).bind(start, end).all<any>();
    uids = (rs.results || []).map((r: any) => String(r.student_uid)).filter(Boolean);
  }

  let n = 0; const now = Date.now();
  for (const uid of uids) {
    const g = await computeGrowthForStudent(env, uid, period);
    if (!g.events_count) continue;
    const prev: any = await env.DB.prepare(`SELECT judgment_index FROM decision_growth_snapshots WHERE period=? AND student_uid=?`).bind(pPrev, uid).first();
    const delta = (g.judgment_index != null && prev?.judgment_index != null) ? Math.round(g.judgment_index - Number(prev.judgment_index)) : null;
    const nm: any = await env.DB.prepare(`SELECT student_name FROM judgment_events WHERE student_uid=? AND student_name IS NOT NULL ORDER BY created_at DESC LIMIT 1`).bind(uid).first();
    await env.DB.prepare(`INSERT INTO decision_growth_snapshots (period, student_uid, student_name, events_count, axis_choice, axis_reasoning, axis_selfcorrection, axis_register, axis_consistency, judgment_index, delta_index, top_misconceptions, generated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(period, student_uid) DO UPDATE SET student_name=excluded.student_name, events_count=excluded.events_count, axis_choice=excluded.axis_choice, axis_reasoning=excluded.axis_reasoning, axis_selfcorrection=excluded.axis_selfcorrection, axis_register=excluded.axis_register, axis_consistency=excluded.axis_consistency, judgment_index=excluded.judgment_index, delta_index=excluded.delta_index, top_misconceptions=excluded.top_misconceptions, generated_at=excluded.generated_at`)
      .bind(period, uid, nm?.student_name || null, g.events_count, g.axis_choice, g.axis_reasoning, g.axis_selfcorrection, g.axis_register, g.axis_consistency, g.judgment_index, delta, JSON.stringify(g.top_misconceptions), now).run();
    n++;
  }
  await logPerf(env, 'growth_snapshot', period, Date.now() - t0, 0, 'ok', { students: n });
  return { period, students: n };
}

/**
 * 학생 성장 리포트 — 현재 기간(실시간 계산) + 과거 스냅샷 추세(최대 12개월).
 *   레이더(5축) + 추세선(index) 시각화 소스.
 */
export async function getGrowthReport(env: MangoEnv, studentUid: string): Promise<any> {
  await ensureJudgmentTables(env);
  const period = kstPeriod();
  const current = await computeGrowthForStudent(env, studentUid, period);
  const hist = await env.DB.prepare(`SELECT period, judgment_index, delta_index, events_count FROM decision_growth_snapshots WHERE student_uid=? ORDER BY period DESC LIMIT 12`).bind(studentUid).all<any>();
  const trend = (hist.results || []).map((r: any) => ({ period: r.period, judgment_index: r.judgment_index, delta_index: r.delta_index, events_count: r.events_count })).reverse();
  // 현재 기간을 추세 끝에 실시간 반영(스냅샷 아직 없을 수 있음)
  const last = trend[trend.length - 1];
  if (!last || last.period !== period) trend.push({ period, judgment_index: current.judgment_index, delta_index: null, events_count: current.events_count });
  else { last.judgment_index = current.judgment_index; last.events_count = current.events_count; }
  return {
    student_uid: studentUid,
    period,
    radar: {
      선택적절성: current.axis_choice, 이유논리: current.axis_reasoning, 자기교정력: current.axis_selfcorrection,
      어투민감도: current.axis_register, 일관성: current.axis_consistency,
    },
    judgment_index: current.judgment_index,
    prev_index: current.prev_index ?? null,
    delta_index: (current.judgment_index != null && current.prev_index != null) ? (current.judgment_index - current.prev_index) : null,
    last: current.last ?? null,
    events_count: current.events_count,
    top_misconceptions: current.top_misconceptions,
    trend,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 🎯 3단계-B: 취약 패턴 기반 맞춤 시나리오 훈련
//   취약 스킬/오답유형(Neo4j 우선, 미설정 시 D1 폴백) → LLM 이 판단 시나리오 생성.
// ═══════════════════════════════════════════════════════════════════════

/** D1 폴백 — Neo4j 미설정/실패 시 판단 데이터에서 직접 취약 스킬·오답유형 집계. */
async function weakFromD1(env: MangoEnv, studentUid: string, limit = 3): Promise<Array<{ skill: string; weakCount: number; misconceptions: string[] }>> {
  const rs = await env.DB.prepare(`SELECT e.skill_tag AS skill, COUNT(*) AS c, GROUP_CONCAT(a.misconception_tag) AS miscs FROM judgment_events e JOIN judgment_analysis a ON a.event_id=e.id WHERE e.student_uid=? AND e.skill_tag IS NOT NULL AND (a.is_optimal=0 OR a.misconception_tag IS NOT NULL) GROUP BY e.skill_tag ORDER BY c DESC LIMIT ?`)
    .bind(studentUid, Math.min(10, Math.max(1, limit))).all<any>();
  return (rs.results || []).map((r: any) => ({
    skill: String(r.skill), weakCount: Number(r.c) || 0,
    misconceptions: [...new Set(String(r.miscs || '').split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 3),
  }));
}

/**
 * D4: 학생 교재 컨텍스트 — 지금 배우는 교재명 + 대표 문장 몇 개(시나리오 관련성↑).
 *   students_erp.textbook → review_quizzes(같은 교재) 문장 추출. 없으면 {textbook:null, samples:[]}.
 */
export async function getStudentTextbookContext(env: MangoEnv, studentUid: string, hint?: string): Promise<{ textbook: string | null; level: string | null; samples: string[] }> {
  let textbook: string | null = null;
  let level: string | null = null;
  try {
    const row: any = await env.DB.prepare(`SELECT textbook, level FROM students_erp WHERE user_id=? LIMIT 1`).bind(studentUid).first();
    if (row?.textbook) textbook = String(row.textbook).trim() || null;
    if (row?.level) level = String(row.level).trim() || null;
  } catch { /* textbook/level 컬럼 없거나 학생 미존재 → 무시 */ }
  // prod 는 students_erp.textbook 이 대체로 빈값 → 클라이언트가 넘긴 교재(localStorage 기본교재) 폴백
  if (!textbook && hint) { const h = String(hint).trim(); if (h && h.length <= 120) textbook = h; }
  const samples: string[] = [];
  if (textbook) {
    try {
      const rs = await env.DB.prepare(`SELECT questions FROM review_quizzes WHERE textbook=? AND active=1 ORDER BY created_at DESC LIMIT 3`).bind(textbook).all<any>();
      for (const q of (rs.results || [])) {
        let arr: any[] = []; try { arr = JSON.parse(String(q.questions || '[]')) || []; } catch { arr = []; }
        for (const it of arr) {
          for (const c of [it?.answer_text, it?.audio_text, it?.target]) {
            const s = String(c || '').trim();
            if (s && /[a-zA-Z]/.test(s) && s.length <= 60 && !samples.includes(s)) samples.push(s);
            if (samples.length >= 8) break;
          }
          if (samples.length >= 8) break;
        }
        if (samples.length >= 8) break;
      }
    } catch { /* review_quizzes 없거나 스키마 상이 → 교재명만 사용 */ }
  }
  return { textbook, level, samples };
}

// 🎲 시나리오 다양화 풀 — LLM 이 매번 같은 최빈 시나리오로 수렴하는 것을 막기 위해
//    요청(및 재시도)마다 주제·판단각도를 랜덤 주입한다. (워밍업 질문 반복금지와 동일 사상)
const SCENARIO_THEMES = [
  'at school talking with your teacher', 'lunch time at the school cafeteria', "a friend's birthday party",
  'shopping at a store with your mom', 'ordering food at a restaurant', 'you lost something important',
  'a new student joins your class', 'playing at the playground', 'visiting your grandparents',
  "at the doctor's office", 'a school field trip', 'borrowing something from a friend',
  'the school talent show', 'helping with chores at home', 'taking care of a pet',
  'being quiet in the library', 'sports day at school', 'a video call with a friend from another country',
  'the weather changed your plans', 'waiting in line for your turn', 'a small misunderstanding with a friend',
  'your friend looks sad today', 'inviting someone to play with you', 'you made a mistake and broke something',
];
const SCENARIO_ANGLES = [
  'making a polite request', 'making a suggestion', 'apologizing sincerely', 'asking for permission',
  'inviting someone kindly', 'refusing politely', 'expressing your feelings', 'asking for help',
  'giving a compliment', 'solving a small conflict with words', 'comforting someone', 'offering to help',
];
const SCENARIO_RECENT_TTL = 48 * 3600;   // 최근 출제 이력 보존 48h — 다음날 재방문에도 반복 방지
const SCENARIO_RECENT_MAX = 15;          // 학생당 반복금지 목록 최대 문항 수
/** 상황문 정규화(중복 판정용) — 소문자 + 영숫자 외 제거 */
function normSituation(s: any): string { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

/** 출제한 문항의 '정답지'를 서버에 보관하는 KV 키 — 채점 때 클라이언트 값 대신 이걸 씁니다. */
const scenKey = (uid: string, sid: string) => `judgsc:${uid}:${sid}`;
const SCENARIO_KEY_TTL = 3600;   // 1시간이면 한 문항을 푸는 데 충분

/**
 * 취약 패턴 기반 맞춤 판단 시나리오 1건 생성.
 *   반환: { situation, options[], correct_index, why, skill_tag, target_misconception, textbook, based_on }
 */
export async function generatePersonalizedScenario(env: MangoEnv, studentUid: string, lang = 'en', textbookHint?: string): Promise<any> {
  const t0 = Date.now();
  await ensureJudgmentTables(env);
  // 1) 취약 패턴 — Neo4j 우선, 실패 시 D1 폴백
  let weak: Array<{ skill: string; weakCount: number; misconceptions: string[] }> = [];
  let source = 'neo4j';
  try {
    weak = await getWeakDecisionSkills(env as any, studentUid, 3);
    if (!weak.length) { weak = await weakFromD1(env, studentUid, 3); source = 'd1_fallback'; }
  } catch {
    try { weak = await weakFromD1(env, studentUid, 3); source = 'd1_fallback'; } catch { weak = []; source = 'none'; }
  }
  const taxonomy = await getMisconceptionTaxonomy(env);
  const target = weak[0] || null;
  const targetMisc = target?.misconceptions?.[0] || null;
  const miscLabel = targetMisc ? (taxonomy.find((t) => t.code === targetMisc)?.label_en || targetMisc) : null;
  const tb = await getStudentTextbookContext(env, studentUid, textbookHint);   // D4: 교재 컨텍스트(클라 힌트 폴백)

  // 🎲 다양화 컨텍스트 — 같은 문항 반복 방지의 핵심.
  //   ① KV 최근 출제 이력(judgrecent:<uid>, 48h): 프롬프트 '반복 금지' 목록 + 생성 후 중복 검사
  //   ② 주제(theme)·판단 각도(angle)를 시도마다 랜덤 회전 — LLM 이 최빈 시나리오(비오는 날 등)로 수렴하는 것을 차단
  //   ③ 학생 레벨(students_erp.level) 을 문장 난이도 지시로 주입
  const kv = (env as any).SESSION_STATE;
  const rkey = 'judgrecent:' + studentUid;
  let recent: { sits: string[]; themes: string[] } = { sits: [], themes: [] };
  if (kv) {
    try { const raw = await kv.get(rkey); if (raw) { const j = JSON.parse(raw); recent = { sits: Array.isArray(j?.sits) ? j.sits : [], themes: Array.isArray(j?.themes) ? j.themes : [] }; } } catch {}
  }
  const seenSits = new Set(recent.sits.map(normSituation));
  let usedTheme: string | null = null;

  const ai = (env as any).AI;
  let scenario: any = null;
  if (ai) {
    const focus = target
      ? `The student is WEAK at the skill "${target.skill}"${miscLabel ? ` and tends to make this mistake: "${miscLabel}" (${targetMisc})` : ''}. Design the scenario to target exactly this weakness.`
      : `This is a new student with no weakness data yet. Design a friendly beginner decision scenario.`;
    const tbLine = tb.textbook
      ? `The child is currently studying the textbook "${tb.textbook}". ${tb.samples.length ? `Sentences they are learning: ${tb.samples.slice(0, 6).map((s) => `"${s}"`).join(', ')}. ` : ''}Match the situation's VOCABULARY LEVEL to this textbook so it connects to their class.`
      : `Keep vocabulary simple and age-appropriate for a young learner.`;
    const levelLine = tb.level
      ? `The student's English level is "${tb.level}". Match sentence length, grammar complexity, and vocabulary difficulty to exactly this level — not easier, not harder.`
      : '';
    // LLM 이 가끔 깨진 JSON/중복 시나리오를 반환 → 최대 4회 재시도, 시도마다 주제·각도를 새로 뽑아 변주
    for (let attempt = 0; attempt < 4 && !scenario; attempt++) {
      const themePool = SCENARIO_THEMES.filter((t) => !recent.themes.includes(t));
      const theme = (themePool.length ? themePool : SCENARIO_THEMES)[Math.floor(Math.random() * (themePool.length || SCENARIO_THEMES.length))];
      const angle = SCENARIO_ANGLES[Math.floor(Math.random() * SCENARIO_ANGLES.length)];
      const prompt = `You design DECISION-MAKING English practice for a Korean child. Create ONE short real-life situation and 3-4 candidate English expressions the child could say. Exactly one is clearly the best/most natural for the situation.

${focus}
${tbLine}
${levelLine}
Set the situation in this specific context: "${theme}". The decision the child faces should involve: ${angle}.
${recent.sits.length ? `NEVER repeat or paraphrase any of these situations already used with this student: ${recent.sits.slice(-10).map((s) => `"${s.slice(0, 120)}"`).join(' / ')}. Your situation must be clearly different from all of them.` : ''}

Return STRICT JSON only:
{
  "situation": "<1-2 sentence real-life context, English, child-friendly>",
  "skill_tag": "<short kebab tag>",
  "options": ["<expression A>", "<expression B>", "<expression C>"],
  "correct_index": <0-based index of the best option>,
  "option_scores": [<one 0-100 score per option, SAME ORDER as options. The best option: 95-100. An option that is understandable and polite enough but slightly less natural: 60-80. An option that a child could reasonably think is fine but is clearly off in tone or meaning: 35-55. A clearly rude or wrong option: 5-25. Spread the scores out — do NOT give every wrong option the same number>],
  "difficulty": <1-5 how hard this judgment is for this child: 1=obvious, 3=needs thought, 5=subtle tone difference only a careful learner catches>,
  "why": "<1-2 sentences: WHY the best option is best and why the others are less appropriate — this trains judgment>",
  "why_ko": "<same explanation in NATURAL, CORRECT KOREAN ONLY — use only Hangul, numbers, and basic punctuation; never insert Chinese, Hindi, or other scripts>"
}`;
      try {
        const resp: any = await ai.run(JUDGE_MODEL, {
          messages: [
            { role: 'system', content: 'You design English decision-making practice. Reply in strict JSON only.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 700, temperature: 0.9,
        });
        const j = parseFirstJson(resp);
        if (j && Array.isArray(j.options) && j.options.length >= 2) {
          const situation = String(j.situation || '').slice(0, 500);
          if (seenSits.has(normSituation(situation))) {
            console.warn('[judgment] scenario duplicate of recent, retrying (attempt ' + (attempt + 1) + ')');
            continue;
          }
          const opts4 = j.options.map((o: any) => String(o).slice(0, 300)).slice(0, 4);
          // ⚠️ 정답 인덱스는 '자르고 난 뒤'의 길이로 제한해야 합니다.
          //    전에는 자르기 전 길이로 제한해서, LLM 이 5지선다에 correct_index=4 를 주면
          //    정답 선택지가 잘려나가고 인덱스만 남아 학생이 절대 정답을 맞힐 수 없었습니다.
          const ci = Number.isInteger(+j.correct_index) ? Math.max(0, Math.min(opts4.length - 1, +j.correct_index)) : 0;
          const scores = normalizeOptionScores(j.option_scores, opts4.length, ci);
          // 선택지별 점수가 없으면 채점이 옛 100·45 이분법으로 떨어집니다 → 앞 시도에서는 다시 뽑습니다.
          if (!scores && attempt < 2) {
            console.warn('[judgment] scenario missing option_scores, retrying (attempt ' + (attempt + 1) + ')');
            continue;
          }
          scenario = {
            situation,
            skill_tag: String(j.skill_tag || target?.skill || '').slice(0, 60) || null,
            options: opts4,
            correct_index: ci,
            option_scores: scores,
            difficulty: normalizeDifficulty(j.difficulty),
            why: String(j.why || '').slice(0, 600),
            why_ko: cleanKo(String(j.why_ko || '')).slice(0, 600),
          };
          usedTheme = theme;
        }
      } catch (e: any) { console.warn('[judgment] scenario LLM fail (attempt ' + (attempt + 1) + '):', e?.message); }
    }
  }
  // 출제 이력 갱신 — 다음 요청의 '반복 금지' 목록이 된다 (최근 15문항 / 주제 8개, 48h)
  if (scenario && kv) {
    try {
      await kv.put(rkey, JSON.stringify({
        sits: recent.sits.concat([scenario.situation]).slice(-SCENARIO_RECENT_MAX),
        themes: usedTheme ? recent.themes.concat([usedTheme]).slice(-8) : recent.themes,
      }), { expirationTtl: SCENARIO_RECENT_TTL });
    } catch {}
  }
  await logPerf(env, 'scenario_generate', studentUid, Date.now() - t0, 0, scenario ? 'ok' : 'llm_error', { source, target_skill: target?.skill || null, textbook: tb.textbook });
  if (!scenario) return { ok: false, error: 'scenario_unavailable', based_on: { source, weak, textbook: tb.textbook } };

  // 🔒 정답지를 서버에 보관 — 채점 때 클라이언트가 되돌려 보낸 점수 대신 이 값을 씁니다.
  //    학생 화면을 고쳐 option_scores 를 100 으로 보내도 기록되는 점수는 흔들리지 않습니다.
  //    (KV 미설정·만료 시에는 클라이언트 값으로 안전 폴백 — 문제 풀이 자체는 절대 막지 않음)
  let sid: string | null = null;
  if (kv) {
    try {
      sid = crypto.randomUUID();
      await kv.put(scenKey(studentUid, sid), JSON.stringify({
        option_scores: scenario.option_scores, difficulty: scenario.difficulty,
        correct_index: scenario.correct_index, n: scenario.options.length,
      }), { expirationTtl: SCENARIO_KEY_TTL });
    } catch { sid = null; }
  }
  return { ok: true, ...scenario, sid, target_misconception: targetMisc, textbook: tb.textbook, based_on: { source, weak_skills: weak.map((w) => w.skill), textbook: tb.textbook } };
}

// ═══════════════════════════════════════════════════════════════════════
// 🧩 3단계-C(D3): 수업 외 판단 이벤트 캡처 — LLM 없이 기존 채점 결과를 판단 이벤트로 기록
//   영작 교정(issues: 원문→교정)·복습퀴즈(오답: 선택≠정답) 등에서 이미 나온 결과를
//   judgment_events + judgment_analysis 에 그대로 적재(재-LLM 없음, 저비용).
//   호출측(api-ai/api-games)에서 best-effort 로 감싸 본 응답을 막지 않는다.
// ═══════════════════════════════════════════════════════════════════════
export interface RecordJudgmentInput {
  studentUid: string; studentName?: string | null; source: string; refId: string | number;
  lessonDate?: string; lang?: string;
  judgments: Array<{
    situation?: string; skill_tag?: string; chosen?: string; better?: string;
    is_optimal?: boolean | number; choice_score?: number | null; reasoning?: string;
    reasoning_score?: number | null; register_awareness?: number | null;
    misconception?: string | null; feedback_ko?: string; feedback_en?: string;
    /** 문항 난이도 1~5 — 성장 지수에서 어려운 문항에 더 큰 가중치를 주기 위해 함께 보관. */
    difficulty?: number | null;
  }>;
}

/** 이미 채점된 판단 결과를 D1 에 기록(멱등). LLM 미사용. */
export async function recordJudgmentEvents(env: MangoEnv, input: RecordJudgmentInput): Promise<{ ok: boolean; inserted: number }> {
  const t0 = Date.now();
  const studentUid = String(input.studentUid || '').trim();
  const source = String(input.source || 'external');
  const refId = String(input.refId ?? '');
  const list = Array.isArray(input.judgments) ? input.judgments.slice(0, MAX_EVENTS_PER_CLASS) : [];
  if (!studentUid || !list.length) return { ok: true, inserted: 0 };
  let inserted = 0;
  try {
    await ensureJudgmentTables(env);
    const taxonomy = await getMisconceptionTaxonomy(env);
    const validCodes = new Set(taxonomy.map((t) => t.code));
    const lang = input.lang || 'en';
    const lessonDate = input.lessonDate || new Date().toISOString().slice(0, 10);
    const now = Date.now();
    const clamp = (v: any) => { const n = Math.round(+v); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null; };

    for (let i = 0; i < list.length; i++) {
      const ev = list[i] || {};
      const eventUid = `${source}:${refId}:${i}`;              // 소스·참조·순번 멱등키
      const chosen = String(ev.chosen ?? '').slice(0, 500);
      const better = String(ev.better ?? '').slice(0, 500);
      const reasoning = String(ev.reasoning ?? '').slice(0, 1000);
      const skillTag = String(ev.skill_tag ?? source).slice(0, 60) || null;
      const situation = String(ev.situation ?? '').slice(0, 500) || null;
      const options = [chosen, better].filter(Boolean);
      const choiceScore = clamp(ev.choice_score);
      const reasoningScore = clamp(ev.reasoning_score);
      const registerAwareness = clamp(ev.register_awareness);
      const isOptimal = (ev.is_optimal === true || ev.is_optimal === 1) ? 1 : 0;
      let misc = (ev.misconception && ev.misconception !== 'null') ? String(ev.misconception).toUpperCase().trim() : null;
      if (misc && !validCodes.has(misc)) misc = null;
      const features: any = { register_awareness: registerAwareness, has_reasoning: reasoning.length > 0, source_llm: false };
      if (ev.difficulty != null) features.difficulty = normalizeDifficulty(ev.difficulty);
      const featuresJson = JSON.stringify(features);
      try {
        await env.DB.prepare(`INSERT INTO judgment_events (event_uid, student_uid, student_name, room_id, schedule_id, lesson_date, source, situation_id, situation_text, skill_tag, options_json, chosen_option, chosen_index, reasoning_text, lang, analyzed, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?) ON CONFLICT(event_uid) DO UPDATE SET situation_text=excluded.situation_text, skill_tag=excluded.skill_tag, options_json=excluded.options_json, chosen_option=excluded.chosen_option, reasoning_text=excluded.reasoning_text, analyzed=1`)
          .bind(eventUid, studentUid, input.studentName || null, null, null, lessonDate, source, null, situation, skillTag, options.length ? JSON.stringify(options) : null, chosen || null, 0, reasoning || null, lang, now).run();
        const row: any = await env.DB.prepare(`SELECT id FROM judgment_events WHERE event_uid=?`).bind(eventUid).first();
        const eventId = row?.id;
        if (!eventId) continue;
        const envelope = buildJudgmentEnvelope({
          event_uid: eventUid, student_uid: studentUid, student_name: input.studentName, room_id: '',
          schedule_id: null, lesson_date: lessonDate, source,
          situation_text: situation, skill_tag: skillTag, options, chosen_option: chosen, reasoning_text: reasoning, lang,
          choice_score: choiceScore, best_option: better, is_optimal: isOptimal, reasoning_score: reasoningScore,
          reasoning_features: features, misconception_tag: misc,
          feedback_ko: ev.feedback_ko || null, feedback_en: ev.feedback_en || null, model: 'record', created_at: now,
        });
        await env.DB.prepare(`INSERT INTO judgment_analysis (event_id, student_uid, choice_score, best_option, is_optimal, reasoning_score, reasoning_features_json, misconception_tag, feedback_ko, feedback_en, model, cache_hit, latency_ms, raw_json, schema_ver, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,0,?,?,?) ON CONFLICT(event_id) DO UPDATE SET choice_score=excluded.choice_score, best_option=excluded.best_option, is_optimal=excluded.is_optimal, reasoning_score=excluded.reasoning_score, reasoning_features_json=excluded.reasoning_features_json, misconception_tag=excluded.misconception_tag, feedback_ko=excluded.feedback_ko, feedback_en=excluded.feedback_en, model=excluded.model, raw_json=excluded.raw_json, schema_ver=excluded.schema_ver, migrated_at=NULL`)
          .bind(eventId, studentUid, choiceScore, better || null, isOptimal, reasoningScore, featuresJson, misc, ev.feedback_ko || null, ev.feedback_en || null, 'record', JSON.stringify(envelope), JUDGMENT_SCHEMA_VER, now).run();
        inserted++;
      } catch (e: any) { console.warn('[judgment] record persist fail:', e?.message); }
    }
    await logPerf(env, 'judgment_record', `${source}:${refId}`, Date.now() - t0, 0, 'ok', { source, inserted });
  } catch (e: any) {
    console.warn('[judgment] recordJudgmentEvents fatal:', e?.message);
    return { ok: false, inserted };
  }
  return { ok: true, inserted };
}

/**
 * 🎯 3단계-D: 판단력 훈련 답안 채점 — 학생이 '선택 + 이유'를 낸 것을 AI가 두 축으로 채점.
 *   이유논리·어투민감도 축을 실제로 채우는 최고 품질 캡처(source='practice').
 *   반환: { ok, correct, choice_score, reasoning_score, register_awareness, misconception, best_option, feedback_ko, feedback_en }
 */
export async function evaluateJudgmentAnswer(env: MangoEnv, input: {
  studentUid: string; studentName?: string | null; situation: string; skillTag?: string;
  options: string[]; chosenIndex: number; correctIndex?: number | null; reasoning: string; lang?: string;
  optionScores?: any; difficulty?: any;
}): Promise<any> {
  const t0 = Date.now();
  await ensureJudgmentTables(env);
  const opts = (input.options || []).map((o) => String(o)).slice(0, 6);
  const ci = Number(input.chosenIndex);
  const chosen = (ci >= 0 && ci < opts.length) ? opts[ci] : '';
  const correctIdx = (input.correctIndex == null) ? null : Number(input.correctIndex);
  const correct = (correctIdx != null && correctIdx >= 0 && correctIdx < opts.length) ? opts[correctIdx] : '';
  const isOptimal = (correctIdx != null && ci === correctIdx) ? 1 : 0;
  const difficulty = normalizeDifficulty(input.difficulty);
  // 선택 적절성 — 문제 생성 때 함께 받아둔 선택지별 점수를 사용(추가 LLM 호출 0).
  //   "아깝게 틀림"과 "완전히 엉뚱함"이 갈리므로 공정성·변별력이 함께 올라갑니다.
  //   점수가 없는 옛 문항/구버전 클라이언트는 기존 100·45 방식으로 폴백합니다.
  const optScores = normalizeOptionScores(input.optionScores, opts.length, correctIdx ?? -1);
  const graded = (optScores && ci >= 0 && ci < optScores.length) ? optScores[ci] : null;
  const choiceScore = isOptimal
    ? (graded != null ? Math.max(95, graded) : 100)
    : (graded != null ? graded : (correctIdx != null ? 45 : 70));
  const reasoning = String(input.reasoning || '').slice(0, 800).trim();
  const lang = input.lang || 'en';
  const taxonomy = await getMisconceptionTaxonomy(env);
  const taxonomyList = taxonomy.map((t) => `${t.code} (${t.label_en})`).join(', ');

  const wantZh = lang === 'zh';
  let reasoningScore: number | null = null, registerAwareness: number | null = null;
  let misconception: string | null = null, feedbackKo = '', feedbackEn = '', feedbackZh = '';
  const ai = (env as any).AI;
  if (ai) {
    const prompt = `A child practiced DECISION-MAKING English. Situation: "${input.situation}". Options: ${opts.map((o, i) => `[${i}] ${o}`).join(' ')}. The child CHOSE [${ci}] "${chosen}"${correct ? `; the best option was [${correctIdx}] "${correct}"` : ''}. The child's REASON (may be Korean, Chinese, or English): "${reasoning || '(none)'}".

Judge the child's REASONING (not just the choice). Return STRICT JSON only:
{
  "reasoning_score": <0-100 logic/depth of the child's reason; if no reason given, 0-20. A short reason written in Korean is FINE — judge the thinking, not the English>,
  "register_awareness": <0-100 how well the child matched formality/tone to the listener and situation. Judge the CHOICE FIRST — a child who picked the right register deserves a high score even if their written reason is short. Use the reason only to adjust up or down>,
  "misconception": "<if the choice was wrong, ONE of: ${taxonomyList}; else null>",
  "feedback_ko": "<1-2 warm, simple sentences in NATURAL KOREAN ONLY (Hangul + basic punctuation; no Chinese/other scripts): praise + one tip>",
  "feedback_en": "<same in simple English>"${wantZh ? `,
  "feedback_zh": "<same in simple Simplified Chinese>"` : ''}
}`;
    try {
      const resp: any = await ai.run(JUDGE_MODEL, {
        messages: [
          { role: 'system', content: 'You coach English decision-making for children. Reply in strict JSON only.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 500,
      });
      const j = parseFirstJson(resp);
      if (j) {
        const clamp = (v: any) => { const n = Math.round(+v); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null; };
        reasoningScore = clamp(j.reasoning_score);
        registerAwareness = clamp(j.register_awareness);
        const mc = (j.misconception && j.misconception !== 'null') ? String(j.misconception).toUpperCase().trim() : null;
        misconception = (mc && taxonomy.some((t) => t.code === mc)) ? mc : null;
        feedbackKo = cleanKo(String(j.feedback_ko || '')).slice(0, 300);
        feedbackEn = String(j.feedback_en || '').slice(0, 300);
        if (wantZh) feedbackZh = String(j.feedback_zh || '').slice(0, 300);
      }
    } catch (e: any) { console.warn('[judgment] answer LLM fail:', e?.message); }
  }
  // 폴백 피드백
  if (!feedbackKo) feedbackKo = isOptimal ? '잘 골랐어요! 이유도 함께 생각하니 판단력이 자라요.' : '아쉽지만 더 자연스러운 표현이 있어요. 왜 그런지 같이 살펴봐요.';
  if (!feedbackEn) feedbackEn = isOptimal ? 'Great choice! Thinking about why builds your judgment.' : 'Close! There is a more natural option — let’s see why.';
  if (wantZh && !feedbackZh) feedbackZh = isOptimal ? '选得好！一起思考理由，判断力会不断成长。' : '很接近了！还有更自然的表达，我们一起看看为什么。';
  if (reasoningScore == null) reasoningScore = reasoning.length >= 5 ? 55 : 10;
  // 어투 민감도 폴백 — LLM 이 값을 못 주면 '고른 표현이 얼마나 적절했나'로 대신합니다.
  //   (이유를 짧게 쓴 아이가 표현은 정확히 골랐는데도 이 축이 계속 비어 낮게 굳던 문제)
  if (registerAwareness == null) registerAwareness = choiceScore;

  // 판단 이벤트 기록(이유 포함 → axis_reasoning·register 채워짐)
  await recordJudgmentEvents(env, {
    studentUid: input.studentUid, studentName: input.studentName || null, source: 'practice', refId: Date.now(), lang,
    judgments: [{
      situation: input.situation, skill_tag: input.skillTag || 'practice', chosen, better: correct,
      is_optimal: isOptimal, choice_score: choiceScore, reasoning, reasoning_score: reasoningScore,
      register_awareness: registerAwareness, misconception, feedback_ko: feedbackKo, feedback_en: feedbackEn,
      difficulty,
    }],
  });
  await logPerf(env, 'judgment_answer', input.studentUid, Date.now() - t0, 0, 'ok', { optimal: isOptimal, difficulty, choice: choiceScore });
  return {
    ok: true, correct: !!isOptimal, choice_score: choiceScore, reasoning_score: reasoningScore,
    register_awareness: registerAwareness, misconception, best_option: correct || null, difficulty,
    feedback_ko: feedbackKo, feedback_en: feedbackEn, ...(wantZh ? { feedback_zh: feedbackZh } : {}),
  };
}

/** 한국어 출력 정제 — LLM이 가끔 섞는 한자·데바나가리·키릴 문자 제거(한글·ASCII·이모지·문장부호 유지). */
export function cleanKo(s: string): string {
  return String(s || '').replace(/[ऀ-ॿ㐀-䶿一-鿿Ѐ-ӿ؀-ۿ]/g, '').replace(/\s{2,}/g, ' ').trim();
}

/** 자유 텍스트 사유(한국어)를 오답 유형 코드로 경량 매핑 — 매칭 없으면 null. */
export function guessMisconception(reason: string): string | null {
  const s = String(reason || '').toLowerCase();
  if (/시제|tense|과거|현재|미래/.test(s)) return 'TENSE_CONFUSION';
  if (/어순|word order|순서|배열/.test(s)) return 'GRAMMAR_FORM';
  if (/격식|공손|정중|반말|formal|polite|register/.test(s)) return 'REGISTER_MISMATCH';
  if (/직역|literal|콩글리시|konglish/.test(s)) return 'DIRECT_TRANSLATION';
  if (/맥락|context|상황/.test(s)) return 'NO_CONTEXT';
  if (/단어|어휘|word choice|표현|vocabular/.test(s)) return 'WORD_CHOICE';
  if (/문법|형태|일치|관사|전치사|grammar|article|preposition/.test(s)) return 'GRAMMAR_FORM';
  return null;
}

/** analysis_perf_log 기록 (실패해도 본 흐름에 무영향). */
async function logPerf(env: MangoEnv, task: string, refId: string, durationMs: number, cacheHit: number, statusStr: string, detail?: any): Promise<void> {
  try {
    await env.DB.prepare(`INSERT INTO analysis_perf_log (task, ref_id, duration_ms, cache_hit, status, detail, created_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(task, refId || null, Math.max(0, Math.round(durationMs)), cacheHit ? 1 : 0, statusStr, detail ? JSON.stringify(detail).slice(0, 900) : null, Date.now()).run();
  } catch { /* 계측 실패는 무시 */ }
  // 콘솔에도 구조화 로깅(Cloudflare 로그 스트림에서 병목 즉시 감지)
  console.log(`[perf] task=${task} ref=${refId} dur_ms=${Math.round(durationMs)} cache=${cacheHit} status=${statusStr}`);
}
