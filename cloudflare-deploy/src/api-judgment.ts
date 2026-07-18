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

const JUDGE_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
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
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS judgment_analysis (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER UNIQUE, student_uid TEXT NOT NULL, choice_score INTEGER, best_option TEXT, is_optimal INTEGER, reasoning_score INTEGER, reasoning_features_json TEXT, misconception_tag TEXT, feedback_ko TEXT, feedback_en TEXT, model TEXT, cache_hit INTEGER DEFAULT 0, latency_ms INTEGER, created_at INTEGER NOT NULL);`);
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_ja_student ON judgment_analysis(student_uid, created_at);`);
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_ja_misc ON judgment_analysis(misconception_tag);`);
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
async function sha256hex(s: string): Promise<string> {
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
      const eventUid = `${roomId}:${i}`;                 // 방·순번 멱등키(재생성 시 중복 방지)
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
        // 2) 채점 결과 — event_id UNIQUE upsert
        await env.DB.prepare(`INSERT INTO judgment_analysis (event_id, student_uid, choice_score, best_option, is_optimal, reasoning_score, reasoning_features_json, misconception_tag, feedback_ko, feedback_en, model, cache_hit, latency_ms, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET choice_score=excluded.choice_score, best_option=excluded.best_option, is_optimal=excluded.is_optimal, reasoning_score=excluded.reasoning_score, reasoning_features_json=excluded.reasoning_features_json, misconception_tag=excluded.misconception_tag, feedback_ko=excluded.feedback_ko, feedback_en=excluded.feedback_en, model=excluded.model, cache_hit=excluded.cache_hit, latency_ms=excluded.latency_ms`)
          .bind(eventId, studentUid, choiceScore, better || null, isOptimal, reasoningScore, featuresJson, misc, String(ev.feedback_ko || '').slice(0, 400) || null, String(ev.feedback_en || '').slice(0, 400) || null, hasStructured ? 'structured' : JUDGE_MODEL, cacheHit, llmMs, now).run();
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

/** analysis_perf_log 기록 (실패해도 본 흐름에 무영향). */
async function logPerf(env: MangoEnv, task: string, refId: string, durationMs: number, cacheHit: number, statusStr: string, detail?: any): Promise<void> {
  try {
    await env.DB.prepare(`INSERT INTO analysis_perf_log (task, ref_id, duration_ms, cache_hit, status, detail, created_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(task, refId || null, Math.max(0, Math.round(durationMs)), cacheHit ? 1 : 0, statusStr, detail ? JSON.stringify(detail).slice(0, 900) : null, Date.now()).run();
  } catch { /* 계측 실패는 무시 */ }
  // 콘솔에도 구조화 로깅(Cloudflare 로그 스트림에서 병목 즉시 감지)
  console.log(`[perf] task=${task} ref=${refId} dur_ms=${Math.round(durationMs)} cache=${cacheHit} status=${statusStr}`);
}
