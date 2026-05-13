/**
 * ai-command.ts — 🥭 Phase 21 망고아이 AI 명령 오케스트레이터
 *
 * 사용자가 admin 통합검색창에 자연어로 입력하면 4단계 의도로 분류:
 *   1) answer    — 단순 Q&A (지식 기반 답변)
 *   2) navigate  — 페이지 이동 / 메뉴 라우팅
 *   3) query     — 백엔드 데이터 조회 (서버에서 자동 실행 → 결과 반환)
 *   4) action    — 실제 작업 (확인 다이얼로그 후 별도 엔드포인트로 실행)
 *
 * 모델: Cloudflare Workers AI — Llama 3.3 70B Instruct fp8-fast
 *   - 무료 일일 한도 (10k Neurons) 안에서 동작
 *   - JSON 모드로 구조화 응답 강제
 *   - 추후 Anthropic Claude 등으로 교체 시 callLLM() 함수 한 곳만 수정
 */

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// ──────────────────────────────────────────────────────────
// 시스템 프롬프트 — Few-shot 예시 중심으로 재작성 (Phase 21e)
// 핵심: 추상 규칙보다 구체 예시가 Llama 의 instruction following 에 훨씬 강력
// ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are 망고아이(Mangoi) admin AI router.
Classify Korean admin commands into one of 4 intents and output ONE JSON object only. No prose, no markdown, no code blocks.

Schema (one of these exactly):
{"intent":"answer","answer":"<Korean text>"}
{"intent":"navigate","url":"<path>","answer":"<Korean confirmation>"}
{"intent":"navigate","external_url":"<https://...>","answer":"<Korean confirmation>"}
{"intent":"navigate","menu_id":"<card-id>","answer":"<Korean confirmation>"}
{"intent":"query","tool":"<tool>","args":{...},"answer":"<Korean confirmation>"}
{"intent":"action","name":"<action>","args":{...},"confirm_text":"<Korean confirm question>","answer":"<Korean text>"}

Allowed navigate URLs (same-tab): /admin.html, /admin/students.html, /admin/student.html?uid=ID, /admin/health.html, /admin/mypage.html

Allowed external_url (new tab): https://mangoi-speech.pages.dev/practice (발음교정·발음 연습)

Allowed menu_id (scroll to card on /admin.html):
- card-daily-charts    (일자별 차트·매출·학생수·탈락·증가)
- card-rankings        (학생 랭킹·발화·시선·집중도)
- card-payroll         (강사 급여·평가 대시보드)
- card-franchises      (가맹점 관리)
- card-centers         (교육센터)
- card-level-tests     (레벨 테스트·레벨테스트)
- card-enrollments     (수강신청 관리)
- card-community       (커뮤니티·공지·게시판)
- card-textbooks       (교재 콘텐츠)
- card-pronunciation   (발음교정 메뉴 카드 — 발음교정 도구는 external_url 우선 사용)

Allowed query tools:
- today_stats        (오늘 매출·학생수·결석률·신규)
- weekly_dashboard   (최근 7일 출석·발화·재연결)
- find_student       args:{q:"이름"}  (학생 검색)
- revenue            args:{period:"day"|"month"|"year"}
- active_rooms       (현재 활성 화상수업)
- recent_recordings  args:{limit:10}

Allowed actions:
- send_kakao_self    args:{text:"메시지"}
- issue_sticker      args:{user_id:"ID",reason:"사유"}
- mark_intervention  args:{user_id:"ID",note:"메모"}

Hard rules:
- If the user wants to OPEN/GO TO a page (열어줘, 가줘, 이동, 페이지) → navigate
- If the user asks for DATA/NUMBERS (매출, 출석, 학생수, 결석률, 방, 녹화, 통계, 어때, 보여줘 + data noun) → query
- If the user wants to DO/SEND/ISSUE something (보내줘, 발급해줘, 기록해줘) → action
- Otherwise (definition, explanation, what is) → answer

Examples (study these carefully):

User: "학생관리 열어 줘"
Output: {"intent":"navigate","url":"/admin/students.html","answer":"학생관리 페이지로 이동합니다."}

User: "오늘 매출 어때?"
Output: {"intent":"query","tool":"today_stats","args":{},"answer":"오늘 지표를 조회합니다."}

User: "김민수 학생 정보"
Output: {"intent":"query","tool":"find_student","args":{"q":"김민수"},"answer":"김민수 학생을 검색합니다."}

User: "이번달 매출 보여줘"
Output: {"intent":"query","tool":"revenue","args":{"period":"month"},"answer":"이번달 매출을 조회합니다."}

User: "지금 수업 중인 방"
Output: {"intent":"query","tool":"active_rooms","args":{},"answer":"활성 수업방을 조회합니다."}

User: "최근 녹화 10개"
Output: {"intent":"query","tool":"recent_recordings","args":{"limit":10},"answer":"최근 녹화를 조회합니다."}

User: "내 카톡으로 안녕 보내줘"
Output: {"intent":"action","name":"send_kakao_self","args":{"text":"안녕"},"confirm_text":"내 카톡 메모챗으로 '안녕' 보낼까요?","answer":"확인을 눌러주세요."}

User: "발음연습이 뭐야?"
Output: {"intent":"answer","answer":"발음연습은 학생이 영어 단어를 말하면 AI가 정확도를 평가하는 학습 도구입니다."}

User: "관리자 마이페이지"
Output: {"intent":"navigate","url":"/admin/mypage.html","answer":"마이페이지로 이동합니다."}

User: "시스템 상태"
Output: {"intent":"navigate","url":"/admin/health.html","answer":"시스템 상태 페이지로 이동합니다."}

User: "발음 교정 열어줘"
Output: {"intent":"navigate","external_url":"https://mangoi-speech.pages.dev/practice","answer":"발음 교정 도구를 새 탭에서 엽니다."}

User: "발음 연습"
Output: {"intent":"navigate","external_url":"https://mangoi-speech.pages.dev/practice","answer":"발음 연습 도구를 새 탭에서 엽니다."}

User: "강사 급여 보여줘"
Output: {"intent":"navigate","menu_id":"card-payroll","answer":"강사 급여 카드로 이동합니다."}

User: "레벨테스트 열어줘"
Output: {"intent":"navigate","menu_id":"card-level-tests","answer":"레벨 테스트 카드로 이동합니다."}

User: "레벨 테스트"
Output: {"intent":"navigate","menu_id":"card-level-tests","answer":"레벨 테스트 카드로 이동합니다."}

User: "가맹점 관리 열어줘"
Output: {"intent":"navigate","menu_id":"card-franchises","answer":"가맹점 관리 카드로 이동합니다."}

User: "교육센터 보여줘"
Output: {"intent":"navigate","menu_id":"card-centers","answer":"교육센터 카드로 이동합니다."}

User: "수강신청 열어줘"
Output: {"intent":"navigate","menu_id":"card-enrollments","answer":"수강신청 관리 카드로 이동합니다."}

User: "커뮤니티"
Output: {"intent":"navigate","menu_id":"card-community","answer":"커뮤니티 카드로 이동합니다."}

User: "교재 콘텐츠"
Output: {"intent":"navigate","menu_id":"card-textbooks","answer":"교재 콘텐츠 카드로 이동합니다."}

User: "일자별 차트"
Output: {"intent":"navigate","menu_id":"card-daily-charts","answer":"일자별 차트 카드로 이동합니다."}

User: "학생 랭킹"
Output: {"intent":"navigate","menu_id":"card-rankings","answer":"학생 랭킹 카드로 이동합니다."}

Output rule: Only one valid JSON object. No "Output:" prefix, no markdown fences, no commentary.`;

// ──────────────────────────────────────────────────────────
// LLM 호출 — Workers AI Llama 3.3 70B
// ──────────────────────────────────────────────────────────
async function callLLM(env: { AI?: any }, command: string): Promise<any> {
  if (!env.AI) {
    throw new Error('AI binding not configured (wrangler.toml [ai] missing)');
  }

  // Workers AI JSON 모드 — response_format 으로 JSON 강제
  // Phase 21e: temp 0.3→0.1 로 낮춰 결정성 강화
  const result = await env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: command }
    ],
    max_tokens: 400,
    temperature: 0.1,
    response_format: { type: 'json_object' }
  });

  // Workers AI 응답: { response: "..." } or { response: "..." } 형태
  const raw = (result?.response || result?.result?.response || '').trim();
  if (!raw) throw new Error('empty AI response');

  // JSON 파싱 — 코드블록이 섞여있을 수 있으니 안전하게
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 코드블록 ```json ... ``` 안에 들어있는 경우 추출 시도
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('AI response not JSON: ' + raw.slice(0, 200));
    parsed = JSON.parse(m[0]);
  }
  return parsed;
}

// ──────────────────────────────────────────────────────────
// 도구 디스패처 — query intent 의 tool 을 서버에서 실행
// ──────────────────────────────────────────────────────────
async function runTool(
  env: { DB: D1Database },
  tool: string,
  args: any
): Promise<any> {
  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  // 안전 헬퍼 — 개별 쿼리 실패가 전체 도구를 죽이지 않도록
  const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch { return fallback; }
  };

  switch (tool) {
    case 'today_stats': {
      const startMs = new Date(todayKst + 'T00:00:00+09:00').getTime();
      const endMs = startMs + 86400000;
      const [rev, att, act, sign] = await Promise.all([
        safe(() => env.DB.prepare(`SELECT COALESCE(SUM(amount_krw),0) AS revenue, COUNT(*) AS cnt
                        FROM student_payments
                        WHERE status='paid' AND paid_at IS NOT NULL AND paid_at >= ? AND paid_at < ?`)
          .bind(startMs, endMs).first<any>(), { revenue: 0, cnt: 0 } as any),
        safe(() => env.DB.prepare(`SELECT COUNT(DISTINCT user_id) AS attended
                        FROM attendance WHERE date = ?`).bind(todayKst).first<any>(),
          { attended: 0 } as any),
        safe(() => env.DB.prepare(`SELECT COUNT(*) AS active
                        FROM students_erp
                        WHERE end_date IS NULL OR end_date='' OR end_date >= ?`)
          .bind(todayKst).first<any>(), { active: 0 } as any),
        safe(() => env.DB.prepare(`SELECT COUNT(*) AS signups FROM students_erp WHERE signup_date = ?`)
          .bind(todayKst).first<any>(), { signups: 0 } as any)
      ]);
      const attended = att?.attended || 0;
      const active = act?.active || 0;
      const absent = Math.max(0, active - attended);
      const rate = active > 0 ? Math.round((absent * 1000) / active) / 10 : 0;
      return {
        date: todayKst,
        revenue_krw: rev?.revenue || 0,
        pay_count: rev?.cnt || 0,
        attended,
        active_students: active,
        absence_rate_pct: rate,
        new_signups: sign?.signups || 0
      };
    }

    case 'weekly_dashboard': {
      const since = Date.now() - 7 * 86400000;
      const total = await env.DB.prepare(
        `SELECT COUNT(*) AS sessions, SUM(disconnect_count) AS disconnects,
                AVG(CASE WHEN total_session_ms>0 THEN total_active_ms*100.0/total_session_ms ELSE 0 END) AS active_pct
         FROM attendance WHERE joined_at >= ?`
      ).bind(since).first<any>();
      return {
        period: 'last_7_days',
        total_sessions: total?.sessions || 0,
        total_disconnects: total?.disconnects || 0,
        avg_speaking_pct: Math.round((total?.active_pct || 0) * 10) / 10
      };
    }

    case 'find_student': {
      const q = (args?.q || '').toString().trim();
      if (!q) return { error: 'query required' };
      const rows = await env.DB.prepare(
        `SELECT user_id, korean_name, english_name, status, signup_date, end_date
         FROM students_erp
         WHERE korean_name LIKE ? OR english_name LIKE ? OR user_id LIKE ?
         ORDER BY signup_date DESC LIMIT 10`
      ).bind('%' + q + '%', '%' + q + '%', '%' + q + '%').all<any>();
      return { matches: rows.results || [], count: (rows.results || []).length };
    }

    case 'revenue': {
      const period = (args?.period || 'month').toString();
      const kstDate = `date((paid_at + 32400000)/1000, 'unixepoch')`;
      let groupExpr = `substr(${kstDate},1,7)`;
      if (period === 'day') groupExpr = kstDate;
      else if (period === 'year') groupExpr = `substr(${kstDate},1,4)`;
      const rows = await env.DB.prepare(
        `SELECT ${groupExpr} AS label, SUM(amount_krw) AS revenue
         FROM student_payments WHERE status='paid' AND paid_at IS NOT NULL
         GROUP BY ${groupExpr} ORDER BY label DESC LIMIT 12`
      ).all<any>();
      return { period, items: rows.results || [] };
    }

    case 'active_rooms': {
      const rows = await env.DB.prepare(
        `SELECT room_id, COUNT(DISTINCT user_id) AS users, MIN(joined_at) AS started_at
         FROM attendance WHERE left_at IS NULL OR left_at = 0
         GROUP BY room_id ORDER BY started_at DESC LIMIT 20`
      ).all<any>();
      return { rooms: rows.results || [], count: (rows.results || []).length };
    }

    case 'recent_recordings': {
      const limit = Math.min(parseInt(args?.limit, 10) || 10, 30);
      const rows = await env.DB.prepare(
        `SELECT id, room_id, user_id, started_at, duration_ms, size_bytes
         FROM recordings ORDER BY started_at DESC LIMIT ?`
      ).bind(limit).all<any>();
      return { recordings: rows.results || [], count: (rows.results || []).length };
    }

    default:
      return { error: 'unknown_tool', tool };
  }
}

// ──────────────────────────────────────────────────────────
// 외부 진입점 — POST /api/admin/ai-command 핸들러가 호출
// ──────────────────────────────────────────────────────────
export async function processAiCommand(
  env: { AI?: any; DB: D1Database },
  command: string
): Promise<any> {
  const cmd = (command || '').toString().trim();
  if (!cmd) return { ok: false, error: 'empty_command' };
  if (cmd.length > 500) return { ok: false, error: 'command_too_long' };

  let aiResponse: any;
  try {
    aiResponse = await callLLM(env, cmd);
  } catch (e: any) {
    return { ok: false, error: 'ai_call_failed', detail: String(e?.message || e) };
  }

  const intent = aiResponse?.intent;

  // Level 1 — answer
  if (intent === 'answer') {
    return {
      ok: true,
      intent: 'answer',
      answer: aiResponse.answer || '(빈 응답)'
    };
  }

  // Level 2 — navigate (Phase 21h: url / external_url / menu_id 모두 지원)
  if (intent === 'navigate') {
    const out: any = {
      ok: true,
      intent: 'navigate',
      answer: aiResponse.answer || '페이지로 이동합니다.'
    };
    // 외부 URL 새 탭 — 화이트리스트 검증 (https 만, 알려진 도메인만)
    if (aiResponse.external_url) {
      const eu = String(aiResponse.external_url);
      const allowedHosts = ['mangoi-speech.pages.dev'];
      try {
        const u = new URL(eu);
        if (u.protocol === 'https:' && allowedHosts.includes(u.hostname)) {
          out.external_url = eu;
        }
      } catch {}
    }
    // 같은 페이지 메뉴 카드 스크롤 — 알파벳·하이픈만 허용
    if (aiResponse.menu_id && /^[a-z0-9-]+$/i.test(String(aiResponse.menu_id))) {
      out.menu_id = String(aiResponse.menu_id);
    }
    // 같은 탭 URL 이동 — 안전 경로만
    if (aiResponse.url) {
      const url = String(aiResponse.url);
      if (url.startsWith('/admin') || url === '/' || url === '/admin.html') {
        out.url = url;
      }
    }
    // 셋 다 없으면 안전 fallback
    if (!out.external_url && !out.menu_id && !out.url) out.url = '/admin.html';
    return out;
  }

  // Level 3 — query (서버에서 도구 실행 후 결과 반환)
  if (intent === 'query') {
    const toolName = aiResponse.tool;
    const toolArgs = aiResponse.args || {};
    let toolResult: any = null;
    try {
      toolResult = await runTool(env, toolName, toolArgs);
    } catch (e: any) {
      return {
        ok: false,
        intent: 'query',
        error: 'tool_failed',
        tool: toolName,
        detail: String(e?.message || e)
      };
    }
    return {
      ok: true,
      intent: 'query',
      tool: toolName,
      args: toolArgs,
      result: toolResult,
      answer: aiResponse.answer || ''
    };
  }

  // Level 4 — action (실행은 별도 confirm 엔드포인트에서)
  if (intent === 'action') {
    const allowedActions = new Set(['send_kakao_self', 'issue_sticker', 'mark_intervention']);
    if (!allowedActions.has(aiResponse.name)) {
      return {
        ok: false,
        intent: 'action',
        error: 'action_not_allowed',
        name: aiResponse.name
      };
    }
    return {
      ok: true,
      intent: 'action',
      name: aiResponse.name,
      args: aiResponse.args || {},
      confirm_text: aiResponse.confirm_text || '실행할까요?',
      answer: aiResponse.answer || '확인이 필요합니다.'
    };
  }

  // unknown intent — fallback to answer
  return {
    ok: true,
    intent: 'answer',
    answer: aiResponse.answer || '명령을 이해하지 못했습니다. 다시 말씀해 주세요.'
  };
}

// ──────────────────────────────────────────────────────────
// Action 실행기 — POST /api/admin/ai-action 에서 호출
// (사용자가 confirm 한 후에만 들어옴)
// ──────────────────────────────────────────────────────────
export async function executeAction(
  env: { DB: D1Database; SESSION_STATE: KVNamespace },
  name: string,
  args: any,
  adminUserId: string | null
): Promise<any> {
  const allowed = new Set(['send_kakao_self', 'issue_sticker', 'mark_intervention']);
  if (!allowed.has(name)) {
    return { ok: false, error: 'action_not_allowed', name };
  }

  const auditId = 'aiact_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

  try {
    if (name === 'send_kakao_self') {
      // 카톡 메모챗 발송은 외부 PS1/MCP 영역이라 여기서는 KV 큐에 기록만
      // (실제 발송은 클라이언트 측 KakaoTalk MCP 또는 별도 워커가 픽업)
      const text = String(args?.text || '').slice(0, 1000);
      if (!text) return { ok: false, error: 'empty_text' };
      const queueKey = `kakao_queue:${auditId}`;
      await env.SESSION_STATE.put(
        queueKey,
        JSON.stringify({ text, queued_at: Date.now(), by: adminUserId || 'unknown' }),
        { expirationTtl: 86400 }
      );
      return { ok: true, action: name, queued_id: auditId, text };
    }

    if (name === 'issue_sticker') {
      const userId = String(args?.user_id || '').trim();
      const reason = String(args?.reason || 'AI 명령으로 발급').slice(0, 200);
      if (!userId) return { ok: false, error: 'user_id_required' };
      await env.DB.prepare(
        `INSERT INTO rewards (user_id, type, reason, issued_at) VALUES (?, 'sticker', ?, ?)`
      ).bind(userId, reason, Date.now()).run();
      return { ok: true, action: name, user_id: userId, reason };
    }

    if (name === 'mark_intervention') {
      const userId = String(args?.user_id || '').trim();
      const note = String(args?.note || '').slice(0, 500);
      if (!userId) return { ok: false, error: 'user_id_required' };
      // intervention_logs 테이블 자동 생성 (스키마 누락 환경 대비)
      await env.DB.exec(
        `CREATE TABLE IF NOT EXISTS intervention_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          note TEXT,
          source TEXT,
          created_by TEXT,
          created_at INTEGER NOT NULL
        )`
      );
      await env.DB.prepare(
        `INSERT INTO intervention_logs (user_id, note, source, created_by, created_at)
         VALUES (?, ?, 'ai-command', ?, ?)`
      ).bind(userId, note, adminUserId || 'unknown', Date.now()).run();
      return { ok: true, action: name, user_id: userId, note };
    }

    return { ok: false, error: 'unhandled_action', name };
  } catch (e: any) {
    return { ok: false, error: 'action_exec_failed', detail: String(e?.message || e) };
  }
}
