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
import { runInChunks } from './d1-chunk';   // 🔢 IN(...) 목록을 D1 바인드 100개 한도에 맞춰 분할
// 🧮 지수·채점 계산은 순수 모듈로 분리(테스트 하니스가 직접 불러 검증) — judgment-scoring.ts
import {
  axesFromRows, normalizeOptionScores, normalizeDifficulty, scoreChoice, type GrowthAxes,
} from './judgment-scoring';
// 🎚️ 읽기 밴드(읽기 난이도) — 판단 난이도(difficulty)와 서로 독립인 별개 축입니다.
//    judgment-level.ts 도 import 가 없는 순수 모듈이라 하니스가 직접 불러 검증합니다.
import {
  DEFAULT_BAND, normalizeBand, bandFromTextbookLevel, bandLabel, bandPromptLine,
  bandCatalog, bandName, pushResult, nextBand, nudgeBand, type BandTransition,
  DEFAULT_BAND_MODE, normalizeBandMode, shouldAutoAdjust, type BandMode,
  situationFitsBand, countWords,
  // 🧑‍🎓 누구를 위한 문제인가 — 실력(밴드)과는 독립인 축(2026-08-24). judgment-level.ts 쪽 정의를 그대로 씁니다.
  DEFAULT_AGE_GROUP, normalizeAgeGroup, type AgeGroup,
} from './judgment-level';
// 🧐 영어 품질(문법) 규칙 — «Want play with me» 가 보기로 나가던 사고(2026-08-24)의 정본.
//    judgment-english.ts 도 import 없는 순수 모듈이라 하니스가 직접 불러 검증합니다.
import { englishQualityRules, grammarCheckPrompt, allowsBrokenDistractors } from './judgment-english';
// ✒️ 문장 종결부호 — 보기·상황문·해설이 «맨몸» 으로 끝나던 것을 코드에서 다듬습니다(2026-08-26).
//    정본은 sentence-punct.ts 한 곳이고, 이 파일도 import 없는 순수 모듈이라 하니스가 직접 돌립니다.
import { endSentence, endSentences, PUNCTUATION_PROMPT_RULE } from './sentence-punct';
export type { GrowthAxes };
export { normalizeOptionScores, normalizeDifficulty } from './judgment-scoring';
export { normalizeBand, bandLabel, bandName, bandCatalog } from './judgment-level';

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
  /* ⛔ 게스트(guest*)는 내보내지 않는다 — 이 엔벨로프는 상황문과 «학생이 쓴 이유 원문» 을 담아
     외부(NCP FastAPI)로 나간다. 맛보기 방문자의 글을 밖으로 보낼 이유가 없다.
     ⚠️ 조건을 변수로 빼지 말 것 — 질의문만 읽어서는 «걸렀는지» 가 안 보이고 감시도 못 한다. */
  const where = opts?.includeMigrated
    ? `WHERE id > ? AND LOWER(COALESCE(student_uid,'')) NOT LIKE 'guest%'`
    : `WHERE id > ? AND migrated_at IS NULL AND LOWER(COALESCE(student_uid,'')) NOT LIKE 'guest%'`;
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
  // 숫자 id 만 남긴 뒤, D1 바인드 100개 한도에 맞춰 분할 실행(공용 runInChunks).
  //   migrated_at 을 덮어쓰는 멱등한 UPDATE 라 청크로 나눠도 결과가 같습니다.
  const clean = ids.map((x) => Number(x)).filter(Number.isFinite);
  return runInChunks(env.DB, clean,
    (ph) => `UPDATE judgment_analysis SET migrated_at=? WHERE id IN (${ph})`,
    { lead: [now] });
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
    /* ⛔ 게스트(guest*)는 뺀다 — 맛보기 방문자마다 decision_growth_snapshots 행을 만들고
       (uid 당 D1 4회) 로그의 students 숫자를 부풀린다. 매일 밤 도는 배치다. */
    const rs = await env.DB.prepare(`SELECT DISTINCT student_uid FROM judgment_analysis WHERE created_at>=? AND created_at<? AND LOWER(COALESCE(student_uid,'')) NOT LIKE 'guest%'`).bind(start, end).all<any>();
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
// 🧑‍💼 성인 모드 전용 소재 풀 — 2026-08-24 제안서 §2. 실력(밴드)·판단 각도(SCENARIO_ANGLES)는
//    아이용과 그대로 공유합니다(둘 다 언어·나이 중립적인 축). 이 목록만 바뀌면 회사·일상 상황이 됩니다.
const ADULT_SCENARIO_THEMES = [
  'at the office with a coworker', 'a work meeting that is running late', 'ordering coffee at a busy café',
  'meeting a partner\'s parents for the first time', 'asking your boss for a day off', 'a neighbor\'s dog barking at night',
  'returning a faulty product at a store', 'catching up with an old friend over dinner', 'a job interview',
  'negotiating the price at a flea market', 'your flight has been delayed', 'a doctor\'s appointment',
  'moving into a new apartment', 'a coworker asks to borrow something', 'giving feedback to a teammate',
  'declining a dinner invitation politely', 'small talk while waiting for the elevator', 'asking a stranger for directions',
  'a landlord raised the rent unexpectedly', 'planning a trip with friends', 'a package delivered to the wrong address',
  'a video call with a client from another country', 'someone cut in line', 'apologizing for being late to a meeting',
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

// ═══════════════════════════════════════════════════════════════════════
// 🎚️ 읽기 밴드 상태 — KV 한 칸에만 둡니다.
//   새 D1 테이블도, 새 API 경로도 만들지 않습니다(src/index.ts 는 금지구역).
//   판단 이력으로 언제든 재계산 가능한 파생값이라 KV 로 충분하고,
//   전사 학생 마스터(students_erp, 29,377행)를 건드리지 않아 사고 반경이 이 기능 하나로 갇힙니다.
// ═══════════════════════════════════════════════════════════════════════
const bandKey = (uid: string) => `judglvl:${uid}`;
const BAND_KV_TTL = 400 * 24 * 3600;   // 400일 — 사실상 영속. 휴면 학생은 자연 만료 후 기본값 재시작

interface BandState {
  band: number;
  /** 최근 창의 정오(1/0). 밴드가 실제로 바뀌면 비웁니다(연속 등락 방지). */
  hist: number[];
  /** 사람이 준 레벨 원문(students_erp.level 또는 level_tests.level). 값이 바뀌면 재시드 판단에 씁니다. */
  base: string | null;
  src: 'teacher' | 'auto' | 'student' | 'default' | 'placement';
  /** 'auto' = AI 가 답을 보고 조절 / 'manual' = 학생이 고른 자리에 머묾 */
  mode: BandMode;
  /** 🧑‍🎓 누구를 위한 문제인가 — 밴드(실력)와 독립인 축. 기본은 'child'(지금까지의 전부). */
  ageGroup: AgeGroup;
  at: number;
}

function emptyBandState(band: any = DEFAULT_BAND, src: BandState['src'] = 'default', base: string | null = null): BandState {
  return { band: normalizeBand(band), hist: [], base, src, mode: DEFAULT_BAND_MODE, ageGroup: DEFAULT_AGE_GROUP, at: Date.now() };
}

async function readBandState(env: MangoEnv, uid: string): Promise<BandState | null> {
  const kv = (env as any).SESSION_STATE as KVNamespace | undefined;
  if (!kv || !uid) return null;
  try {
    const raw = await kv.get(bandKey(uid));
    if (!raw) return null;
    const j = JSON.parse(raw);
    return {
      band: normalizeBand(j?.band),
      hist: Array.isArray(j?.hist) ? j.hist.map((v: any) => (v ? 1 : 0)) : [],
      base: j?.base != null ? String(j.base) : null,
      src: (['teacher', 'auto', 'student', 'default', 'placement'] as const).includes(j?.src) ? j.src : 'auto',
      // 모드가 없던 옛 저장값은 기본(자동)으로 읽습니다 — 기존 학생의 동작이 바뀌지 않도록.
      mode: normalizeBandMode(j?.mode),
      // ageGroup 이 없던 옛 저장값은 기본('child')으로 읽습니다 — 기존 학생 29,000명의 동작이 그대로 유지됩니다.
      ageGroup: normalizeAgeGroup(j?.ageGroup),
      at: Number(j?.at) || 0,
    };
  } catch { return null; }   // 손상된 값은 없는 것으로 — 기본 밴드로 안전 폴백
}

async function writeBandState(env: MangoEnv, uid: string, st: BandState): Promise<void> {
  const kv = (env as any).SESSION_STATE as KVNamespace | undefined;
  if (!kv || !uid) return;
  try { await kv.put(bandKey(uid), JSON.stringify(st), { expirationTtl: BAND_KV_TTL }); } catch { /* 저장 실패가 문제 풀이를 막지 않습니다 */ }
}

/**
 * 🧑‍🏫 강사·관리자 화면용 — 학생의 현재 읽기 밴드 조회(KV 1회, 없으면 null).
 *   ⚠️ 여기서 밴드를 '만들지' 않습니다. 판단력 훈련을 한 번도 안 한 학생은 null 이 나오고,
 *      화면은 아무것도 표시하지 않습니다(없는 값을 기본값으로 채워 보여주면 강사가 오해합니다).
 */
export async function getReadingBandFor(env: MangoEnv, uid: string): Promise<
  { band: number; mode: BandMode; src: string; age_group: AgeGroup; name_ko: string; name_en: string; lv: string } | null
> {
  const st = await readBandState(env, String(uid || '').trim());
  if (!st) return null;
  return {
    band: st.band, mode: st.mode, src: st.src,
    // 🧑‍🎓 나이대도 함께 — 학생 화면의 첫 설정 카드가 «이미 정해 둔 값» 을 표시하는 데 씁니다.
    //    (강사 화면은 이 칸을 안 읽습니다 — 더하기만 했으므로 기존 호출부는 그대로입니다)
    age_group: st.ageGroup,
    // 강사 다수가 필리핀이라 한/영 둘 다 내려보냅니다(운영 원칙)
    name_ko: bandName(st.band, 'ko'), name_en: bandName(st.band, 'en'), lv: bandLabel(st.band),
  };
}

/** 사람이 정해 준 레벨(언제나 1순위) — students_erp.level → 최근 level_tests.level. 없으면 null. */
async function humanLevel(env: MangoEnv, uid: string, erpLevel?: string | null): Promise<string | null> {
  const s = String(erpLevel || '').trim();
  if (s) return s;
  try {
    const r: any = await env.DB.prepare(`SELECT level FROM level_tests WHERE student_user_id=? AND level IS NOT NULL AND TRIM(level)<>'' ORDER BY tested_at DESC LIMIT 1`).bind(uid).first();
    const t = String(r?.level || '').trim();
    return t || null;
  } catch { return null; }   // 테이블 없거나 스키마 상이 → 사람 레벨 없음으로 취급
}

/**
 * 읽기 밴드 확정 — 소스 우선순위: ① 사람이 준 레벨 ② 저장된 자동 밴드 ③ 기본값(3).
 *   ①이 새로 들어왔거나 값이 바뀌면 그 레벨로 재시드하고 자동 조절 이력을 비웁니다.
 *   (강사가 "이 아이 Lv 9예요" 하고 넣으면 그것이 자동 조절보다 우선한다는 뜻)
 */
async function resolveReadingBand(env: MangoEnv, uid: string, erpLevel?: string | null): Promise<{ state: BandState; existed: boolean; changedByHuman: boolean }> {
  const st = await readBandState(env, uid);
  const human = await humanLevel(env, uid, erpLevel);
  const humanBand = bandFromTextbookLevel(human);
  if (humanBand && (!st || st.base !== human)) {
    return { state: emptyBandState(humanBand, 'teacher', human), existed: !!st, changedByHuman: true };
  }
  if (st) return { state: st, existed: true, changedByHuman: false };
  return { state: emptyBandState(DEFAULT_BAND, 'default', human || null), existed: false, changedByHuman: false };
}

/**
 * 🧐 생성된 문항의 영어를 같은 모델로 한 번 더 읽혀 봅니다(교정자 역할, 짧은 응답).
 *   onlyIndex 가 있으면(문법 연습 문항) 상황문 + 그 선택지(정답)만 검사합니다 —
 *   오답은 일부러 틀리게 만든 것이라 전부 검사하면 정상 문항이 계속 걸러집니다.
 *   ⚠️ 검증기 실패(LLM 오류·깨진 JSON)는 통과로 취급 — 검증기가 죽어도 문제 제공은 막지 않습니다.
 */
async function englishLooksCorrect(ai: any, situation: string, options: string[], onlyIndex: number | null, ageGroup: AgeGroup = DEFAULT_AGE_GROUP): Promise<boolean> {
  const items = [String(situation || '')];
  if (onlyIndex == null) items.push(...(options || []).map((o) => String(o || '')));
  else if (options && options[onlyIndex] != null) items.push(String(options[onlyIndex]));
  const adult = ageGroup === 'adult';
  try {
    const resp: any = await ai.run(JUDGE_MODEL, {
      messages: [
        { role: 'system', content: `You proofread English for ${adult ? 'an adult' : 'a children\'s'} learning app. Reply in strict JSON only.` },
        { role: 'user', content: grammarCheckPrompt(items, ageGroup) },
      ],
      max_tokens: 120,
    });
    const j = parseFirstJson(resp);
    if (!j || !Array.isArray(j.bad)) return true;
    return j.bad.length === 0;
  } catch { return true; }
}

/**
 * 취약 패턴 기반 맞춤 판단 시나리오 1건 생성.
 *   반환: { situation, options[], correct_index, why, skill_tag, target_misconception, textbook, based_on }
 */
export async function generatePersonalizedScenario(
  env: MangoEnv, studentUid: string, lang = 'en', textbookHint?: string, focusMisconception?: string | null,
  /**
   * 읽기 밴드 조작
   *   nudge   : 학생이 누른 ±1
   *   setBand : 학생이 목록에서 직접 고른 범주(1~8) — 고르면 자동으로 '직접' 모드가 됩니다
   *   mode    : 'auto'(AI 가 조절) / 'manual'(내가 고른 자리 유지)
   *   probeBand : 레벨 찾기(배치테스트) 전용 — 그 밴드로 한 문제만 뽑고
   *               **학생의 저장된 밴드는 건드리지 않습니다**(찾는 중에 값이 흔들리면 안 되므로).
   *   src     : 밴드를 누가 정했는지 기록용('placement' 등)
   *   ageGroup : 누구를 위한 문제인가('child'/'adult') — 밴드(실력)와 독립인 축. 2026-08-24 신설.
   */
  bandOpts?: { nudge?: number | null; setBand?: number | null; mode?: string | null; probeBand?: number | null; src?: string | null; ageGroup?: string | null } | null,
): Promise<any> {
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
  // 🎯 학생이 직접 고른 연습 유형 — 사전에 있는 코드만 인정(임의 문자열이 프롬프트로 새는 것 차단)
  const wanted = String(focusMisconception || '').toUpperCase().trim();
  const pickedMisc = wanted && taxonomy.some((t) => t.code === wanted) ? wanted : null;
  const pickedLabel = pickedMisc ? (taxonomy.find((t) => t.code === pickedMisc)?.label_en || pickedMisc) : null;
  const tb = await getStudentTextbookContext(env, studentUid, textbookHint);   // D4: 교재 컨텍스트(클라 힌트 폴백)

  // 🎚️ 읽기 밴드 확정 — 사람이 준 레벨 > 저장된 자동 밴드 > 기본값 3
  const bandRes = await resolveReadingBand(env, studentUid, tb.level);
  let bandState = bandRes.state;
  let bandMove: BandTransition | null = null;
  // ① 학생이 목록에서 범주를 직접 골랐으면 그 값이 최우선 — 자동조절보다, ±1 보다 앞섭니다.
  //    사람이 스스로 고른 것을 기계가 뒤집지 않는다는 원칙(강사 입력이 1순위인 것과 같은 이유).
  const wantSet = Math.round(+(bandOpts?.setBand as any));
  const picked = Number.isFinite(wantSet) && wantSet >= 1 && wantSet <= 8 ? wantSet : 0;
  // ② 학생이 "너무 어려워요 / 너무 쉬워요"를 눌렀으면 6문항 창을 기다리지 않고 즉시 한 밴드 옮깁니다.
  //    ⚠️ 새 API 경로를 만들지 않으려고 기존 시나리오 요청 body 에 실어 받습니다(index.ts 는 금지구역).
  const nudge = picked ? 0 : Math.sign(Math.round(+(bandOpts?.nudge as any)) || 0);
  // ③ 모드 — 학생이 "AI가 맞춰줘요 / 내가 고를래요" 중 하나를 누른 경우.
  //    범주를 직접 고르면 모드를 묻지 않아도 '직접'이 됩니다(고른 자리를 AI가 뒤집으면 모순).
  const wantMode = bandOpts?.mode ? normalizeBandMode(bandOpts.mode) : null;
  const modeChanged = !!wantMode && wantMode !== bandState.mode;
  // 🧑‍🎓 누구를 위한 문제인가 — 학생이 설정 화면에서 토글을 눌렀을 때만 옵니다.
  //    실력(mode/nudge/setBand)과는 완전히 독립이라 같은 요청에 함께 실려 와도 서로 안 건드립니다.
  const wantAgeGroup = bandOpts?.ageGroup ? normalizeAgeGroup(bandOpts.ageGroup) : null;
  const ageGroupChanged = !!wantAgeGroup && wantAgeGroup !== bandState.ageGroup;
  // 🎯 레벨 찾기(배치테스트) 중인가 — 그렇다면 저장된 밴드를 전혀 건드리지 않고
  //    지정된 밴드로 한 문제만 만들어 줍니다. 찾는 도중에 값이 바뀌면 결과가 오염됩니다.
  const probeRaw = Math.round(+(bandOpts?.probeBand as any));
  const probing = Number.isFinite(probeRaw) && probeRaw >= 1 && probeRaw <= 8;

  // 🧑‍🎓 나이대는 밴드(실력)와 독립인 축이라 **배치테스트 중에도** 받아 저장합니다.
  //   ⚠️ 예전에는 이 줄이 아래 `if (!probing)` 안에 있었습니다. 그래서 첫 설정 카드에서
  //      「성인」 + 「레벨 찾기」를 한 번에 고르면, 배치 6문항이 전부 **아이 소재**로 나오고
  //      (probe 요청의 age_group 이 조용히 버려짐) 배치가 끝난 뒤에야 성인으로 바뀌었습니다.
  //      에러가 안 나서 «성인을 골랐는데 학교 이야기가 나온다» 로만 보입니다.
  //      밴드는 탐색 중 흔들리면 안 되지만 소재 축은 흔들릴 것이 없습니다 — 그래서 여기만 밖으로 뺍니다.
  if (wantAgeGroup) bandState = { ...bandState, ageGroup: wantAgeGroup, at: Date.now() };

  if (!probing) {
    if (picked) {
      const pickedSrc = (bandOpts?.src === 'placement') ? 'placement' : 'student';
      bandState = { ...bandState, band: picked, hist: [], src: pickedSrc, mode: wantMode || 'manual', at: Date.now() };
    } else {
      if (wantMode) bandState = { ...bandState, mode: wantMode, hist: [], at: Date.now() };
      if (nudge !== 0) {
        bandMove = nudgeBand(bandState.band, nudge);
        bandState = { ...bandState, band: bandMove.band, hist: [], src: 'student', at: Date.now() };
      }
    }
    if (!bandRes.existed || bandRes.changedByHuman || nudge !== 0 || picked || modeChanged || ageGroupChanged) await writeBandState(env, studentUid, bandState);
  } else if (ageGroupChanged) {
    // 배치 중에는 밴드를 저장하지 않습니다 — bandState.band 는 저장돼 있던 값 그대로라
    //   여기서 써도 탐색 밴드(probeRaw)가 새어 들어가지 않습니다. 바뀐 것은 나이대 하나뿐입니다.
    await writeBandState(env, studentUid, bandState);
  }
  // 이 요청의 문제를 만들 밴드 — 배치 중이면 탐색 밴드, 아니면 학생의 밴드
  const askBand = probing ? probeRaw : bandState.band;
  // 이 요청의 문제를 만들 나이대 — 배치 중에도 그대로 유지(탐색 밴드와 달리 소재는 안 바뀜)
  const ageGroup: AgeGroup = bandState.ageGroup;
  const isAdult = ageGroup === 'adult';

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
    // 학생이 "이 유형 더 연습하기"를 눌렀으면 그 유형을 최우선으로 — 자동 추정보다 본인 선택이 우선입니다.
    const focus = pickedMisc
      ? `The student CHOSE to practice this exact mistake type: "${pickedLabel}" (${pickedMisc}). Design the scenario so that the tempting wrong options are precisely this kind of mistake, and the best option avoids it.`
      : target
      ? `The student is WEAK at the skill "${target.skill}"${miscLabel ? ` and tends to make this mistake: "${miscLabel}" (${targetMisc})` : ''}. Design the scenario to target exactly this weakness.`
      : `This is a new student with no weakness data yet. Design a friendly beginner decision scenario.`;
    // 🧑‍🎓 아이용은 교재 소재, 성인용은 교재 개념 자체가 없으므로(성인 트랙에 배정된 교재가 없음)
    //    항상 일반 성인 학습자 문구로 — tb.textbook 이 우연히 채워져 있어도 "교재" 프레이밍을 안 씁니다.
    const tbLine = (!isAdult && tb.textbook)
      ? `The child is currently studying the textbook "${tb.textbook}". ${tb.samples.length ? `Sentences they are learning: ${tb.samples.slice(0, 6).map((s) => `"${s}"`).join(', ')}. ` : ''}Match the situation's VOCABULARY LEVEL to this textbook so it connects to their class.`
      : isAdult
      ? `Keep vocabulary natural and appropriate for an adult English learner — not childish, not textbook-formal.`
      : `Keep vocabulary simple and age-appropriate for a young learner.`;
    // 🎚️ 읽기 난이도는 밴드가 단독으로 결정합니다(문장 길이·문법 범위를 숫자로 못 박음).
    //    예전에는 students_erp.level 을 그대로 넘겼는데, 그 값이 전 학생 빈칸이라
    //    이 줄이 항상 빈 문자열이었고 → AI 가 매번 백지에서 문장 길이를 정했습니다(난이도 들쭉날쭉의 원인).
    const levelLine = bandPromptLine(askBand, ageGroup);
    // 🧐 오답에 «틀린 문법»이 허용되는 유일한 경우 — 학생이 문법 유형(형태/시제) 연습을 스스로 고른 문항.
    //    그 외에는 오답도 문법은 맞아야 합니다: 오답은 상황·말투가 어긋난 말이지 깨진 영어가 아닙니다.
    //    (깨진 오답은 문법만 보고 답이 나와 «판단» 훈련이 되지 않고, 화면에는 오탈자 사고로 보입니다)
    const allowBroken = allowsBrokenDistractors(pickedMisc);
    const qualityLine = englishQualityRules(allowBroken, ageGroup);
    // 🧑‍💼 성인 모드 — 소재 풀만 통째로 갈아 낍니다(판단 각도는 나이·언어 중립이라 그대로 공유).
    const themeSet = isAdult ? ADULT_SCENARIO_THEMES : SCENARIO_THEMES;
    // LLM 이 가끔 깨진 JSON/중복 시나리오를 반환 → 최대 4회 재시도, 시도마다 주제·각도를 새로 뽑아 변주
    for (let attempt = 0; attempt < 4 && !scenario; attempt++) {
      const themePool = themeSet.filter((t) => !recent.themes.includes(t));
      const theme = (themePool.length ? themePool : themeSet)[Math.floor(Math.random() * (themePool.length || themeSet.length))];
      const angle = SCENARIO_ANGLES[Math.floor(Math.random() * SCENARIO_ANGLES.length)];
      const who = isAdult ? 'a Korean adult English learner' : 'a Korean child';
      const whoShort = isAdult ? 'the learner' : 'the child';
      const prompt = `You design DECISION-MAKING English practice for ${who}. Create ONE short real-life situation and 3-4 candidate English expressions ${whoShort} could say. Exactly one is clearly the best/most natural for the situation.

${focus}
${tbLine}
${levelLine}
${qualityLine}
${PUNCTUATION_PROMPT_RULE}
Set the situation in this specific context: "${theme}". The decision ${whoShort} faces should involve: ${angle}.
${recent.sits.length ? `NEVER repeat or paraphrase any of these situations already used with this student: ${recent.sits.slice(-10).map((s) => `"${s.slice(0, 120)}"`).join(' / ')}. Your situation must be clearly different from all of them.` : ''}

Return STRICT JSON only:
{
  "situation": "<1-2 sentence real-life context, English, ${isAdult ? 'natural for an adult' : 'child-friendly'}>",
  "skill_tag": "<short kebab tag>",
  "options": ["<expression A>", "<expression B>", "<expression C>"],
  "correct_index": <0-based index of the best option>,
  "option_scores": [<one 0-100 score per option, SAME ORDER as options. The best option: 95-100. An option that is understandable and polite enough but slightly less natural: 60-80. An option that ${isAdult ? 'a learner' : 'a child'} could reasonably think is fine but is clearly off in tone or meaning: 35-55. A clearly rude or clearly wrong-for-the-situation option: 5-25. Spread the scores out — do NOT give every wrong option the same number>],
  "difficulty": <1-5 how hard this judgment is for ${isAdult ? 'this learner' : 'this child'}: 1=obvious, 3=needs thought, 5=subtle tone difference only a careful learner catches>,
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
          // ✒️ 종결부호 보장 — 단어 수 판정(countWords)·중복 판정(normSituation)은 구두점을 안 세므로 영향 없습니다.
          const situation = endSentence(String(j.situation || '').slice(0, 500));
          if (seenSits.has(normSituation(situation))) {
            console.warn('[judgment] scenario duplicate of recent, retrying (attempt ' + (attempt + 1) + ')');
            continue;
          }
          // 📏 읽기 밴드가 실제로 지켜졌는지 세어 봅니다 — LLM 은 단어 수 지시를 자주 어깁니다
          //    (라이브 실측: 고급 16~22단어 지정에 14단어). 앞 두 번은 다시 뽑고,
          //    그 뒤에는 받아들입니다 — 길이가 조금 어긋나는 것보다 문제를 못 주는 것이 더 나쁩니다.
          if (attempt < 3 && !situationFitsBand(situation, askBand)) {
            console.warn('[judgment] situation length off band ' + askBand + ' (' + countWords(situation) + ' words), retrying (attempt ' + (attempt + 1) + ')');
            continue;
          }
          // ✒️ 보기도 «학생이 입으로 할 완결된 문장» 이라 종결부호를 붙입니다 —
          //    물음표는 뺄 수 없는 부호라, 가지런하게 만드는 길은 마침표를 찍는 쪽뿐입니다(2026-08-26 사장님 지시).
          const opts4 = endSentences(j.options.map((o: any) => String(o).slice(0, 300)).slice(0, 4));
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
          // 🧐 영어 문법 검사 — «Want play with me» 같은 깨진 보기가 그대로 나가던 사고(2026-08-24 사장님 지적).
          //    지시(프롬프트)만으로는 안 지켜지는 것이 이 저장소의 반복 실측이라(단어 수와 같은 뿌리),
          //    받은 상황문·선택지를 같은 모델에 다시 읽혀 보고 어긋나면 다시 뽑습니다.
          //    문법 연습 문항(allowBroken)은 오답이 일부러 틀린 것이므로 상황문·정답만 검사합니다.
          //    마지막 시도는 그대로 받습니다 — 문제를 못 주는 것이 더 나쁩니다(길이 검사와 같은 원칙).
          if (attempt < 3 && !(await englishLooksCorrect(ai, situation, opts4, allowBroken ? ci : null, ageGroup))) {
            console.warn('[judgment] scenario failed grammar check, retrying (attempt ' + (attempt + 1) + ')');
            continue;
          }
          scenario = {
            situation,
            skill_tag: String(j.skill_tag || target?.skill || '').slice(0, 60) || null,
            options: opts4,
            correct_index: ci,
            option_scores: scores,
            difficulty: normalizeDifficulty(j.difficulty),
            why: endSentence(String(j.why || '').slice(0, 600)),
            why_ko: endSentence(cleanKo(String(j.why_ko || '')).slice(0, 600)),
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
  await logPerf(env, 'scenario_generate', studentUid, Date.now() - t0, 0, scenario ? 'ok' : 'llm_error', { source, target_skill: target?.skill || null, textbook: tb.textbook, focus: pickedMisc, band: askBand, band_src: probing ? 'probe' : bandState.src, age_group: ageGroup });
  // 문제 생성이 실패해도 레벨 목록은 함께 돌려줍니다 — 학생이 "레벨 고르기"로 빠져나갈 수 있어야 하므로.
  if (!scenario) return { ok: false, error: 'scenario_unavailable', reading_band: askBand, age_group: ageGroup, band_catalog: bandCatalog(), based_on: { source, weak, textbook: tb.textbook } };

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
        // 이 문항이 '어느 밴드에서 출제됐는지' — 채점 때 그 밴드로 기록해야
        //   밴드별 정답률(성공 지표)이 정확해집니다. 푸는 도중 밴드를 옮겨도 어긋나지 않습니다.
        band: askBand,
        // 🧑‍🎓 이 문항이 어느 나이대로 출제됐는지 — 채점 피드백 문장의 말투를 그 나이대에 맞추기 위해 함께 보관.
        age_group: ageGroup,
      }), { expirationTtl: SCENARIO_KEY_TTL });
    } catch { sid = null; }
  }
  return {
    ok: true, ...scenario, sid, target_misconception: pickedMisc || targetMisc, focus_misconception: pickedMisc, textbook: tb.textbook,
    // 🎚️ 읽기 밴드 — 학생 화면은 이 숫자를 보여주지 않습니다("너는 레벨 2"는 낙인).
    //    버튼을 눌러 옮겨졌을 때만 안내 한 줄을 띄우는 데 씁니다.
    reading_band: askBand, reading_band_label: bandLabel(askBand),
    // ⚠️ lang 은 '문제 지문의 언어'(항상 en)라 이름을 여기에 맞추면 한국어 화면에 'Elementary' 가 뜹니다.
    //    화면 언어는 클라이언트만 아니까, 이름은 band_catalog 에서 골라 쓰게 하고
    //    이 값은 하위호환·서버 로그용으로만 남깁니다.
    reading_band_name: bandName(askBand, lang),
    band_mode: bandState.mode,
    band_moved: bandMove ? bandMove.direction : 0,
    band_at_edge: bandMove ? (bandMove.reason === 'at_ceiling' || bandMove.reason === 'at_floor') : false,
    band_picked: picked ? 1 : 0,
    // 🧑‍🎓 누구를 위한 문제인가 — 학생이 방금 바꿨을 때만 화면이 안내 한 줄을 띄우는 데 씁니다.
    age_group: ageGroup,
    age_group_changed: ageGroupChanged ? 1 : 0,
    // 🏷️ 레벨 고르기 목록 — 서버가 단일 출처(화면에 이름을 하드코딩하지 않습니다).
    //    8개 × 짧은 문자열이라 페이로드는 1KB 수준. 별도 왕복을 만들지 않으려고 함께 내려보냅니다.
    band_catalog: bandCatalog(),
    based_on: { source, weak_skills: weak.map((w) => w.skill), textbook: tb.textbook, band_src: bandState.src },
  };
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
    /** 읽기 밴드 1~8 — 지수 계산에는 쓰지 않고, '밴드별 정답률'(성공 지표) 측정용으로만 보관. */
    reading_band?: number | null;
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
      // 읽기 밴드는 지수에 절대 들어가지 않습니다(판단 난이도만 가중치를 가짐).
      //   2주 뒤 '밴드별 정답률이 목표 85%에서 얼마나 벗어났나'를 재기 위한 기록입니다.
      if (ev.reading_band != null) features.reading_band = normalizeBand(ev.reading_band);
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
  optionScores?: any; difficulty?: any; sid?: string | null;
}): Promise<any> {
  const t0 = Date.now();
  await ensureJudgmentTables(env);
  const opts = (input.options || []).map((o) => String(o)).slice(0, 6);
  const ci = Number(input.chosenIndex);
  const chosen = (ci >= 0 && ci < opts.length) ? opts[ci] : '';

  // 🔒 정답지는 서버 KV 가 원본 — 클라이언트가 보낸 correct_index·option_scores·difficulty 는
  //    sid 로 찾은 서버 값이 있으면 전부 무시합니다(학생 화면 조작으로 통계가 왜곡되지 않도록).
  //    sid 가 없거나 만료됐으면 클라이언트 값으로 폴백 — 문제 풀이 자체는 막지 않습니다.
  let keyed: any = null;
  const kv = (env as any).SESSION_STATE;
  if (kv && input.sid) {
    try { const raw = await kv.get(scenKey(input.studentUid, String(input.sid))); if (raw) keyed = JSON.parse(raw); } catch { keyed = null; }
  }
  const trusted = !!(keyed && Number(keyed.n) === opts.length);      // 선택지 수가 다르면 다른 문항 → 신뢰 안 함
  const rawCorrect = trusted ? keyed.correct_index : input.correctIndex;
  const correctIdx = (rawCorrect == null) ? null : Number(rawCorrect);
  const correct = (correctIdx != null && correctIdx >= 0 && correctIdx < opts.length) ? opts[correctIdx] : '';
  const isOptimal = (correctIdx != null && ci === correctIdx) ? 1 : 0;
  const difficulty = normalizeDifficulty(trusted ? keyed.difficulty : input.difficulty);
  // 이 문항이 출제된 읽기 밴드 — 서버 KV 값만 믿습니다(클라이언트는 밴드를 보내지 않음).
  const askedBand: number | null = (trusted && keyed?.band != null) ? normalizeBand(keyed.band) : null;
  // 🧑‍🎓 이 문항이 출제된 나이대 — 피드백 말투를 같은 나이대로 맞추기 위해 마찬가지로 KV 값만 믿습니다.
  const askedAgeGroup: AgeGroup = (trusted && keyed?.age_group != null) ? normalizeAgeGroup(keyed.age_group) : DEFAULT_AGE_GROUP;
  const isAdultAnswer = askedAgeGroup === 'adult';
  // 선택 적절성 — 문제 생성 때 함께 받아둔 선택지별 점수를 사용(추가 LLM 호출 0).
  //   "아깝게 틀림"과 "완전히 엉뚱함"이 갈리므로 공정성·변별력이 함께 올라갑니다.
  //   점수가 없는 옛 문항/구버전 클라이언트는 기존 100·45 방식으로 폴백합니다.
  const optScores = normalizeOptionScores(trusted ? keyed.option_scores : input.optionScores, opts.length, correctIdx ?? -1);
  const choiceScore = scoreChoice(optScores, ci, correctIdx, !!isOptimal);
  const reasoning = String(input.reasoning || '').slice(0, 800).trim();
  const lang = input.lang || 'en';
  const taxonomy = await getMisconceptionTaxonomy(env);
  const taxonomyList = taxonomy.map((t) => `${t.code} (${t.label_en})`).join(', ');

  const wantZh = lang === 'zh';
  let reasoningScore: number | null = null, registerAwareness: number | null = null;
  let misconception: string | null = null, feedbackKo = '', feedbackEn = '', feedbackZh = '';
  // 🆕 "내가 고른 그 표현"이 왜 그렇게 들리는지 한 줄 — Duolingo Max 의 Explain My Answer 에 해당.
  //    기존엔 "가장 자연스러운 표현: X" 만 알려줘, 정작 자기가 고른 것이 왜 아쉬운지 알 수 없었습니다.
  let whyChosenKo = '', whyChosenEn = '', whyChosenZh = '';
  const ai = (env as any).AI;
  if (ai) {
    const learner = isAdultAnswer ? 'An adult learner' : 'A child';
    const learnerPoss = isAdultAnswer ? 'The learner\'s' : 'The child\'s';
    const learnerWho = isAdultAnswer ? 'the learner' : 'the child';
    const prompt = `${learner} practiced DECISION-MAKING English. Situation: "${input.situation}". Options: ${opts.map((o, i) => `[${i}] ${o}`).join(' ')}. ${isAdultAnswer ? 'They CHOSE' : 'The child CHOSE'} [${ci}] "${chosen}"${correct ? `; the best option was [${correctIdx}] "${correct}"` : ''}. ${learnerPoss} REASON (may be Korean, Chinese, or English): "${reasoning || '(none)'}".

Judge ${learnerPoss.toLowerCase()} REASONING (not just the choice). Return STRICT JSON only:
{
  "reasoning_score": <0-100 logic/depth of ${learnerPoss.toLowerCase()} reason; if no reason given, 0-20. A short reason written in Korean is FINE — judge the thinking, not the English>,
  "register_awareness": <0-100 how well ${learnerWho} matched formality/tone to the listener and situation. Judge the CHOICE FIRST — ${isAdultAnswer ? 'a learner' : 'a child'} who picked the right register deserves a high score even if their written reason is short. Use the reason only to adjust up or down>,
  "misconception": "<if the choice was wrong, ONE of: ${taxonomyList}; else null>",
  "why_chosen_ko": "<ONE short sentence in NATURAL KOREAN ONLY about the option ${learnerWho} ACTUALLY picked ("${chosen}") — say concretely what that exact wording sounds like to the listener in this situation (too blunt? too formal? changes the meaning? fine but less warm?). If ${learnerWho} picked the best one, say what makes that wording work. Never just repeat 'it is wrong'>",
  "why_chosen_en": "<same one sentence in simple English>",
  "feedback_ko": "<1-2 ${isAdultAnswer ? 'clear, respectful' : 'warm, simple'} sentences in NATURAL KOREAN ONLY (Hangul + basic punctuation; no Chinese/other scripts)${isAdultAnswer ? ', using 해요체 (polite, not childish)' : ''}: praise + one tip>",
  "feedback_en": "<same in simple English>"${wantZh ? `,
  "why_chosen_zh": "<same one sentence in simple Simplified Chinese>",
  "feedback_zh": "<same in simple Simplified Chinese>"` : ''}
}`;
    try {
      const resp: any = await ai.run(JUDGE_MODEL, {
        messages: [
          { role: 'system', content: `You coach English decision-making for ${isAdultAnswer ? 'adult learners' : 'children'}. Reply in strict JSON only.` },
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
        whyChosenKo = cleanKo(String(j.why_chosen_ko || '')).slice(0, 200);
        whyChosenEn = String(j.why_chosen_en || '').slice(0, 200);
        if (wantZh) { feedbackZh = String(j.feedback_zh || '').slice(0, 300); whyChosenZh = String(j.why_chosen_zh || '').slice(0, 200); }
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
      difficulty, reading_band: askedBand,
    }],
  });

  // 🎚️ 읽기 밴드 자동 조절 — 최근 6문항의 정답 수로 한 밴드씩만(85% 규칙).
  //    실패해도 채점 결과 반환을 막지 않습니다(학생 입장에선 채점이 최우선).
  let bandOut: any = {};
  try {
    const st = (await readBandState(env, input.studentUid)) || emptyBandState();
    // 🖐️ '직접' 모드면 AI 는 난이도를 건드리지 않습니다.
    //    학생이 고른 자리를 AI 가 옮겨 버리면 고르는 기능이 의미를 잃기 때문입니다.
    //    (정오 이력은 계속 쌓아 둡니다 — '자동'으로 되돌리면 바로 이어서 판단할 수 있게)
    const hist = pushResult(st.hist, !!isOptimal);
    if (!shouldAutoAdjust(st.mode)) {
      await writeBandState(env, input.studentUid, { ...st, hist, at: Date.now() });
      bandOut = { reading_band: st.band, reading_band_label: bandLabel(st.band), band_moved: 0, band_mode: st.mode };
    } else {
      const mv = nextBand(st.band, hist);
      await writeBandState(env, input.studentUid, {
        ...st, band: mv.band, hist: mv.reset ? [] : hist,
        src: mv.direction !== 0 ? 'auto' : st.src, at: Date.now(),
      });
      bandOut = { reading_band: mv.band, reading_band_label: bandLabel(mv.band), band_moved: mv.direction, band_mode: st.mode };
    }
  } catch (e: any) { console.warn('[judgment] band adjust fail:', e?.message); }

  await logPerf(env, 'judgment_answer', input.studentUid, Date.now() - t0, 0, 'ok', { optimal: isOptimal, difficulty, choice: choiceScore, band: askedBand, band_moved: bandOut.band_moved ?? 0 });
  return {
    ok: true, correct: !!isOptimal, choice_score: choiceScore, reasoning_score: reasoningScore,
    register_awareness: registerAwareness, misconception, best_option: correct || null, difficulty,
    ...bandOut,
    // 📊 선택지 채점표 — 답을 낸 뒤이므로 공개해도 정답 노출 문제가 없고,
    //    "왜 저건 낮은 점수인지"를 눈으로 비교하는 것이 학습 효과가 가장 큽니다(ELSA 의 대조 피드백).
    options: opts, option_scores: optScores, chosen_index: ci, correct_index: correctIdx,
    why_chosen_ko: whyChosenKo || null, why_chosen_en: whyChosenEn || null,
    feedback_ko: feedbackKo, feedback_en: feedbackEn,
    ...(wantZh ? { feedback_zh: feedbackZh, why_chosen_zh: whyChosenZh || null } : {}),
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
