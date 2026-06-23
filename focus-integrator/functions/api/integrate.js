/**
 * Cloudflare Pages Function — 메인 통합 시스템 API
 * ------------------------------------------------
 * POST /api/integrate
 *   Body : { "agent1": {...}, "agent2": {...} }
 *   Res  : { agent, status, final_focus_score, github_push_ready, meta }
 *
 * 규칙: 시선 60%, 발화 40% 가중치로 최종 집중도 계산
 */

const WEIGHT_GAZE = 0.60;
const WEIGHT_SPEECH = 0.40;

function clip(v, lo = 0, hi = 100) {
  const n = Number(v);
  if (Number.isNaN(n)) return 0;
  return Math.max(lo, Math.min(hi, n));
}

// 유효한 숫자만 인정한다. null / "" / boolean / object / NaN → null(무효).
// (문자열 숫자 "90" 은 허용)
function toValidNumber(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function extractScore(obj, keys) {
  if (!obj || typeof obj !== "object") {
    throw new Error("입력 데이터는 JSON(object) 이어야 합니다.");
  }
  // [버그 D] 예전엔 값이 null/""/객체여도 clip() 이 조용히 0 점으로 만들었다.
  // 이제는 "필드는 있는데 값이 비정상"이면 건너뛰고, 끝까지 없으면 에러를 던진다.
  for (const k of keys) {
    if (k in obj) {
      const n = toValidNumber(obj[k]);
      if (n !== null) return clip(n);
    }
  }
  // 중첩 한 단계
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const k of keys) {
        if (k in v) {
          const n = toValidNumber(v[k]);
          if (n !== null) return clip(n);
        }
      }
    }
  }
  throw new Error(`점수 필드(${keys.join(", ")}) 에서 유효한 숫자를 찾지 못했습니다.`);
}

function integrate(agent1, agent2) {
  const gaze = extractScore(agent1, ["gaze_score", "focus_score", "score", "value"]);
  const speech = extractScore(agent2, ["speech_score", "focus_score", "score", "value"]);
  const final = Math.round((gaze * WEIGHT_GAZE + speech * WEIGHT_SPEECH) * 100) / 100;

  return {
    agent: "main_system",
    status: "success",
    final_focus_score: final,
    github_push_ready: true,
    meta: {
      weights: { gaze: WEIGHT_GAZE, speech: WEIGHT_SPEECH },
      inputs: { agent1_gaze_score: gaze, agent2_speech_score: speech },
      generated_at: new Date().toISOString(),
    },
  };
}

export async function onRequestPost({ request }) {
  try {
    const body = await request.json();
    const agent1 = body.agent1 ?? body[0];
    const agent2 = body.agent2 ?? body[1];
    if (!agent1 || !agent2) {
      throw new Error("agent1 과 agent2 JSON 이 모두 필요합니다.");
    }
    const result = integrate(agent1, agent2);
    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    const errorPayload = {
      agent: "main_system",
      status: "error",
      error: String(err?.message ?? err),
      github_push_ready: false,
    };
    return new Response(JSON.stringify(errorPayload, null, 2), {
      status: 400,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

// CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export { clip, toValidNumber, extractScore, integrate };
