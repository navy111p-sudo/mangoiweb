/**
 * marketing-studio.ts — 차별화 홍보 콘텐츠 생성 & 광고 타겟팅 정교화 (2026-06-03 추가)
 *
 * 기존 기능과 중복 회피:
 *   - 기존: 월간 AI 레포트·알림톡 발송(solapi)·푸시(web-push)·팝업·ai-command 는 그대로 둔다.
 *   - 본 모듈은 "캠페인 카피 생성 + 세그먼트 타겟 오디언스 산출"만 담당하며 실제 발송은 하지 않는다
 *     (발송은 기존 인프라가 담당). 즉 콘텐츠 제작 + 타겟팅 정교화 계층만 추가한다.
 *
 *   GET  /api/admin/marketing/segments     세그먼트별 타겟 인원 + 도달가능(동의/채널) 수
 *   GET  /api/admin/marketing/channels     현재 운영 채널 준비 상태(카톡·푸시·팝업)
 *   POST /api/admin/marketing/generate     AI 차별화 캠페인 카피 생성 {campaign_type,segment,tone,channel,...}
 *   GET  /api/admin/marketing/campaigns     저장된 캠페인 목록
 *   DELETE /api/admin/marketing/campaigns/:id  캠페인 삭제
 *
 * 타겟팅 정교화: consents.kakao_consent(동의) + withdrawn_at(철회) 를 반드시 반영해
 *   "동의한 학생에게만" 도달 가능 수를 계산한다(개인정보·마케팅 동의 준수).
 * 사용 테이블: students_erp · attendance · student_evaluations · consents · kakao_ids ·
 *   push_subscriptions · popup_announcements(읽기). 신규 marketing_campaigns 만 추가.
 * 모든 핸들러 try/catch + safe() 격리(독립 오류 처리). AI 미설정/실패 시에도 throw 없이 graceful.
 */

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const DAY_MS = 86400000;

interface Env {
  DB: D1Database;
  AI?: any;
  [k: string]: any;
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const err = (msg: string, status = 400) => json({ ok: false, error: msg }, status);

const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try { return await fn(); } catch { return fallback; }
};

// ── 세그먼트 정의 (한국어 라벨 + 설명) ────────────────────────────────────
const SEGMENTS: Record<string, { label: string; desc: string }> = {
  all: { label: '전체 활성 학생', desc: '재원 중인 모든 학생' },
  new: { label: '신규(최근 30일)', desc: '최근 30일 내 등록' },
  active: { label: '활성(최근 30일 출석)', desc: '최근 30일 수업 참여' },
  dormant: { label: '휴면(30일 미출석)', desc: '재원이나 최근 출석 없음 — 재참여 유도' },
  high: { label: '우수(평가 4점+)', desc: '평가 평균 우수 — 후기·추천 유도' },
};

// ── 신규 테이블 ───────────────────────────────────────────────────────────
async function ensureTables(env: Env): Promise<void> {
  await safe(async () => {
    await env.DB.exec(
      `CREATE TABLE IF NOT EXISTS marketing_campaigns (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_type TEXT, segment TEXT, tone TEXT, channel TEXT, headline TEXT, body TEXT, cta TEXT, variants_json TEXT, hashtags TEXT, audience_total INTEGER DEFAULT 0, audience_reachable INTEGER DEFAULT 0, model TEXT, created_at INTEGER NOT NULL);`
    );
    return true;
  }, false);
  await safe(async () => { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_mkt_created ON marketing_campaigns(created_at DESC);`); return true; }, false);
}

// ── 세그먼트별 WHERE 조건(서브쿼리 문자열) ────────────────────────────────
function segmentWhere(segKey: string): { cond: string; binds: number[] } {
  const now = Date.now();
  const cut30 = now - 30 * DAY_MS;
  switch (segKey) {
    case 'new':
      return { cond: `s.created_at >= ?`, binds: [cut30] };
    case 'active':
      return { cond: `s.user_id IN (SELECT DISTINCT user_id FROM attendance WHERE joined_at >= ?)`, binds: [cut30] };
    case 'dormant':
      return { cond: `s.user_id NOT IN (SELECT DISTINCT user_id FROM attendance WHERE joined_at >= ?)`, binds: [cut30] };
    case 'high':
      return { cond: `s.user_id IN (SELECT student_uid FROM student_evaluations GROUP BY student_uid HAVING AVG(score_overall) >= 4)`, binds: [] };
    case 'all':
    default:
      return { cond: `1=1`, binds: [] };
  }
}

// ── 세그먼트 인원/도달가능 수 계산 (동의·채널 반영) ───────────────────────
async function segmentCounts(env: Env, segKey: string): Promise<{ total: number; kakao: number; push: number }> {
  const { cond, binds } = segmentWhere(segKey);
  return safe(async () => {
    const r = await env.DB.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN consent_ok=1 AND ch_ok=1 THEN 1 ELSE 0 END) AS kakao,
         SUM(CASE WHEN push_ok=1 THEN 1 ELSE 0 END) AS push
       FROM (
         SELECT s.user_id,
           (SELECT 1 FROM consents c WHERE c.user_id=s.user_id AND c.kakao_consent=1 AND c.withdrawn_at IS NULL LIMIT 1) AS consent_ok,
           (SELECT 1 FROM kakao_ids k WHERE k.user_id=s.user_id AND (k.kakao_id IS NOT NULL OR k.phone IS NOT NULL) LIMIT 1) AS ch_ok,
           (SELECT 1 FROM push_subscriptions p WHERE p.user_id=s.user_id LIMIT 1) AS push_ok
         FROM students_erp s
         WHERE (s.status='정상' OR s.status IS NULL OR s.status='') AND (${cond})
       )`
    ).bind(...binds).first<{ total: number; kakao: number; push: number }>();
    return { total: r?.total || 0, kakao: r?.kakao || 0, push: r?.push || 0 };
  }, { total: 0, kakao: 0, push: 0 });
}

// ════════════════════════════════════════════════════════════════════════
// 라우터
// ════════════════════════════════════════════════════════════════════════
export async function marketingRouter(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const p = url.pathname.replace(/^\/api\/admin\/marketing\/?/, '');
  const method = request.method.toUpperCase();

  try {
    await ensureTables(env);

    if (p === 'segments' && method === 'GET') return await listSegments(env);
    if (p === 'channels' && method === 'GET') return await channels(env);
    if (p === 'generate' && method === 'POST') return await generate(env, request);
    if (p === 'recommend' && method === 'GET') return await recommend(env, url);
    if (p === 'campaigns' && method === 'GET') return await listCampaigns(env, url);
    const del = p.match(/^campaigns\/(\d+)$/);
    if (del && method === 'DELETE') return await deleteCampaign(env, Number(del[1]));

    return err('not found: ' + p, 404);
  } catch (e: any) {
    return err(e?.message || 'marketing internal error', 500);
  }
}

// ── 1) 세그먼트 목록 + 도달가능 ──────────────────────────────────────────
async function listSegments(env: Env): Promise<Response> {
  const keys = Object.keys(SEGMENTS);
  const out = [];
  for (const k of keys) {
    const c = await segmentCounts(env, k);
    out.push({ key: k, label: SEGMENTS[k].label, desc: SEGMENTS[k].desc, total: c.total, kakao_reachable: c.kakao, push_reachable: c.push });
  }
  return json({ ok: true, segments: out });
}

// ── 2) 채널 준비 상태 ─────────────────────────────────────────────────────
async function channels(env: Env): Promise<Response> {
  const kakaoConfigured = !!(env.SOLAPI_API_KEY && env.SOLAPI_API_SECRET && env.SOLAPI_PFID);
  const consentedKakao = await safe(async () => {
    const r = await env.DB.prepare(`SELECT COUNT(DISTINCT c.user_id) AS n FROM consents c WHERE c.kakao_consent=1 AND c.withdrawn_at IS NULL`).first<{ n: number }>();
    return r?.n || 0;
  }, 0);
  const pushSubs = await safe(async () => {
    const r = await env.DB.prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM push_subscriptions`).first<{ n: number }>();
    return r?.n || 0;
  }, 0);
  const popups = await safe(async () => {
    const r = await env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(view_count),0) AS v, COALESCE(SUM(click_count),0) AS cl FROM popup_announcements WHERE enabled=1`).first<{ n: number; v: number; cl: number }>();
    return { count: r?.n || 0, views: r?.v || 0, clicks: r?.cl || 0 };
  }, { count: 0, views: 0, clicks: 0 });
  const ctr = popups.views ? Math.round((popups.clicks / popups.views) * 1000) / 10 : null;
  return json({
    ok: true,
    channels: {
      kakao: { configured: kakaoConfigured, consented_recipients: consentedKakao },
      web_push: { subscribers: pushSubs },
      popup: { active: popups.count, views: popups.views, clicks: popups.clicks, ctr_pct: ctr },
    },
    ai_ready: !!env.AI,
  });
}

// ── 3) AI 차별화 카피 생성 ────────────────────────────────────────────────
async function generate(env: Env, request: Request): Promise<Response> {
  let body: any = {};
  try { body = await request.json(); } catch { return err('invalid json body'); }

  const campaign_type = String(body.campaign_type || 'promotion').slice(0, 40);
  const segment = SEGMENTS[body.segment] ? String(body.segment) : 'all';
  const tone = String(body.tone || 'friendly').slice(0, 30);
  const channel = String(body.channel || 'kakao').slice(0, 30);
  const product = body.product ? String(body.product).slice(0, 120) : '망고아이 화상영어';
  const offer = body.offer ? String(body.offer).slice(0, 200) : '';

  if (!env.AI) return err('AI 바인딩이 설정되지 않았습니다 (wrangler.toml [ai]).', 503);

  // 타겟 오디언스(동의 반영)
  const aud = await segmentCounts(env, segment);
  const segMeta = SEGMENTS[segment];

  const channelHint: Record<string, string> = {
    kakao: '카카오 알림톡/친구톡 — 짧고 명확, 이모지 1~2개, 존댓말, 80자 내외 본문',
    sms: '문자(SMS) — 매우 짧게(45자 내), 핵심 1개 + 링크 유도',
    push: '웹 푸시 — 제목 20자/본문 50자 내, 즉각 행동 유도',
    instagram: '인스타그램 — 감성적 후킹 + 해시태그, 줄바꿈 활용',
    blog: '블로그/홈페이지 — 신뢰감 있는 설명형, 2~3문단',
  };

  const sys = `너는 한국 영어교육 브랜드 "망고아이"(1:1 화상영어)의 전문 마케팅 카피라이터다.
타깃 세그먼트: ${segMeta.label} (${segMeta.desc}).
채널: ${channel} — ${channelHint[channel] || '채널 특성에 맞게'}.
캠페인 유형: ${campaign_type}. 톤: ${tone}. 상품/주제: ${product}.${offer ? ' 혜택/오퍼: ' + offer + '.' : ''}
요구사항:
- 세그먼트 특성에 "차별화"된 메시지를 써라(신규=환영/첫경험, 휴면=재참여 동기, 우수=후기·추천, 활성=다음단계 제안).
- 과장·허위 금지, 교육적 신뢰. 가격 단정 금지(오퍼가 주어진 경우만 명시).
- 반드시 아래 JSON 스키마로만 출력(설명·코드블록 금지):
{"headline":"핵심 제목","body":"본문","cta":"행동유도 문구","hashtags":["#태그"],"variants":[{"headline":"","body":"","cta":""},{"headline":"","body":"","cta":""}]}
variants 는 A/B 테스트용으로 어조가 다른 2개. 모든 텍스트는 한국어.`;

  const aiResult = await safe(async () => {
    const r = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: `위 조건으로 ${channel} 채널용 ${campaign_type} 홍보 카피를 생성해줘.` },
      ],
      max_tokens: 900,
      temperature: 0.6,
      response_format: { type: 'json_object' },
    });
    return (r?.response || r?.result?.response || '').trim();
  }, '');

  if (!aiResult) return err('AI 응답이 비었습니다. 잠시 후 다시 시도해주세요.', 502);

  let parsed: any;
  try { parsed = JSON.parse(aiResult); }
  catch {
    const m = aiResult.match(/\{[\s\S]*\}/);
    if (!m) return err('AI 응답을 해석하지 못했습니다.', 502);
    try { parsed = JSON.parse(m[0]); } catch { return err('AI 응답 JSON 파싱 실패.', 502); }
  }

  const headline = String(parsed.headline || '').slice(0, 200);
  const text = String(parsed.body || '').slice(0, 2000);
  const cta = String(parsed.cta || '').slice(0, 120);
  const hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 10).map((x: any) => String(x)) : [];
  const variants = Array.isArray(parsed.variants) ? parsed.variants.slice(0, 3) : [];

  const now = Date.now();
  const saved = await safe(async () => {
    const r = await env.DB.prepare(
      `INSERT INTO marketing_campaigns (campaign_type, segment, tone, channel, headline, body, cta, variants_json, hashtags, audience_total, audience_reachable, model, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(campaign_type, segment, tone, channel, headline, text, cta, JSON.stringify(variants), hashtags.join(' '), aud.total, channel === 'push' ? aud.push : aud.kakao, MODEL, now).run();
    return (r as any)?.meta?.last_row_id ?? null;
  }, null);

  return json({
    ok: true,
    id: saved,
    audience: { segment, label: segMeta.label, total: aud.total, kakao_reachable: aud.kakao, push_reachable: aud.push },
    copy: { headline, body: text, cta, hashtags, variants },
  });
}

// ── 세그먼트별 추천 캠페인(룰 기반, 무비용) ───────────────────────────────
async function recommend(env: Env, url: URL): Promise<Response> {
  const seg = SEGMENTS[url.searchParams.get('segment') || ''] ? String(url.searchParams.get('segment')) : 'all';
  const table: Record<string, { campaign_type: string; tone: string; channel: string; why: string }> = {
    new: { campaign_type: 'welcome', tone: 'warm', channel: 'kakao', why: '첫 경험 만족·온보딩 강화로 초기 이탈 방지' },
    active: { campaign_type: 'referral', tone: 'friendly', channel: 'push', why: '만족도 높은 활성 학생에게 추천 이벤트로 신규 유입' },
    dormant: { campaign_type: 'reengagement', tone: 'urgent', channel: 'kakao', why: '재참여 동기 + 한정 혜택으로 복귀 유도' },
    high: { campaign_type: 'review', tone: 'warm', channel: 'kakao', why: '우수 학생에게 후기·추천 요청으로 사회적 증거 확보' },
    all: { campaign_type: 'promotion', tone: 'friendly', channel: 'kakao', why: '전체 대상 시즌 프로모션' },
  };
  const c = await segmentCounts(env, seg);
  const rec = table[seg] || table.all;
  return json({ ok: true, segment: seg, label: SEGMENTS[seg].label, audience: { total: c.total, kakao_reachable: c.kakao, push_reachable: c.push }, recommendation: rec });
}

// ── 4) 캠페인 목록 ────────────────────────────────────────────────────────
async function listCampaigns(env: Env, url: URL): Promise<Response> {
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
  const rows = await safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT id, campaign_type, segment, tone, channel, headline, body, cta, variants_json, hashtags, audience_total, audience_reachable, created_at
       FROM marketing_campaigns ORDER BY created_at DESC LIMIT ?`
    ).bind(limit).all();
    return rs.results || [];
  }, [] as any[]);
  const out = rows.map((r: any) => ({
    ...r,
    variants: (() => { try { return JSON.parse(r.variants_json || '[]'); } catch { return []; } })(),
    segment_label: SEGMENTS[r.segment]?.label || r.segment,
  }));
  return json({ ok: true, count: out.length, campaigns: out });
}

// ── 5) 캠페인 삭제 ────────────────────────────────────────────────────────
async function deleteCampaign(env: Env, id: number): Promise<Response> {
  const ok = await safe(async () => { await env.DB.prepare(`DELETE FROM marketing_campaigns WHERE id=?`).bind(id).run(); return true; }, false);
  return ok ? json({ ok: true, id }) : err('delete failed', 500);
}
