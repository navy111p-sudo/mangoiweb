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
Classify Korean admin commands into one of 5 intents and output ONE JSON object only. No prose, no markdown, no code blocks.

Schema (one of these exactly):
{"intent":"answer","answer":"<Korean text>"}
{"intent":"navigate","url":"<path>","answer":"<Korean confirmation>"}
{"intent":"navigate","external_url":"<https://...>","answer":"<Korean confirmation>"}
{"intent":"navigate","menu_id":"<card-id>","answer":"<Korean confirmation>"}
{"intent":"query","tool":"<tool>","args":{...},"answer":"<Korean confirmation>"}
{"intent":"action","name":"<action>","args":{...},"confirm_text":"<Korean confirm question>","answer":"<Korean text>"}
{"intent":"schedule_plan","items":[{"action":"register_recurring|schedule_one_off|change_schedule|postpone_class","student_name":"<name>","teacher_name":"<optional teacher>","days":["mon","tue",...],"date":"YYYY-MM-DD","time":"HH:MM","type":"regular|level_test|trial","label":"<short Korean>"},...],"answer":"<Korean confirmation>","confirm_text":"<Korean confirm>"}
{"intent":"bulk_modify","operation":"postpone|cancel|reschedule","criteria":{"student_name":"<optional>","days":["mon",...],"time":"HH:MM","date_from":"YYYY-MM-DD","date_to":"YYYY-MM-DD"},"new_time":"HH:MM","shift_minutes":60,"answer":"<Korean>","confirm_text":"<Korean>"}

Allowed navigate URLs (same-tab): /admin.html, /admin/students.html, /admin/student.html?uid=ID, /admin/health.html, /admin/mypage.html, /admin/all-schedules.html

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
- If the user wants to REGISTER/CHANGE/POSTPONE class schedules or LEVEL TEST (수업 등록, 수업 변경, 수업 연기, 수업 잡아, 레벨테스트, 등록해줘 + 학생/요일/시간) → schedule_plan
- If the user wants to BULK MODIFY existing schedules (~의 모든 수업, 다음주 수업 모두, 월요일 수업 전체 + 미뤄/취소/이동) → bulk_modify
- Otherwise (definition, explanation, what is) → answer

Schedule parsing rules (for schedule_plan intent):
- Days mapping: 월=mon 화=tue 수=wed 목=thu 금=fri 토=sat 일=sun
- Multi-day shorthand: 월수금=["mon","wed","fri"], 화목=["tue","thu"], 월화수목금=["mon","tue","wed","thu","fri"]
- Time: "3시40분"="15:40" (default PM 13-19 for student classes), "오후 5시"="17:00", "오전 10시"="10:00", "4시"="16:00" (default PM)
- "다음주 월요일" = use Next Monday date provided in system
- One command may contain MULTIPLE schedule items - put each as separate item in items array
- type: "level_test" for 레벨테스트/레벨 테스트, "trial" for 체험수업, "regular" for normal recurring class
- For recurring (요일 반복): action="register_recurring", fill days[] and time, leave date null
- For one-off (특정 날짜): action="schedule_one_off", fill date and time, leave days null
- "변경"=change_schedule, "연기"=postpone_class

Bulk modify rules (for bulk_modify intent):
- "정우영 학생 다음주 모든 수업 1시간 미뤄줘" → operation:"reschedule", criteria:{student_name:"정우영", date_from:"<TOMORROW>", date_to:"<TODAY+14d>"}, shift_minutes:60
- "월요일 4시 수업 모두 취소" → operation:"cancel", criteria:{days:["mon"], time:"16:00"}
- "정우영 다음주 모든 수업 연기" → operation:"postpone", criteria:{student_name:"정우영", date_from:"<TOMORROW>", date_to:"<TODAY+14d>"}
- shift_minutes can be negative for moving earlier (예: "30분 앞당겨" → -30)
- If teacher mentioned (예: "김선생님 수업"), also include teacher_name in criteria

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

User: "전체 스케줄 보여줘"
Output: {"intent":"navigate","url":"/admin/all-schedules.html","answer":"학원 전체 스케줄 페이지로 이동합니다."}

User: "학원 전체 일정"
Output: {"intent":"navigate","url":"/admin/all-schedules.html","answer":"학원 전체 스케줄 페이지로 이동합니다."}

User: "안민서 학생 월수금 3시40분 정우영 학생 화목 4시 등록하고 홍길동 학생 다음주 월요일 오후 5시에 레벨테스트 할 수 있게 해줘"
Output: {"intent":"schedule_plan","answer":"3개의 스케줄을 파싱했습니다. 확인 후 등록해 주세요.","confirm_text":"3건의 수업 스케줄을 모두 등록할까요?","items":[{"action":"register_recurring","student_name":"안민서","days":["mon","wed","fri"],"date":null,"time":"15:40","type":"regular","label":"안민서 - 월/수/금 15:40 정규수업"},{"action":"register_recurring","student_name":"정우영","days":["tue","thu"],"date":null,"time":"16:00","type":"regular","label":"정우영 - 화/목 16:00 정규수업"},{"action":"schedule_one_off","student_name":"홍길동","days":null,"date":"<NEXT_MONDAY>","time":"17:00","type":"level_test","label":"홍길동 - 다음주 월요일 17:00 레벨테스트"}]}

User: "김민수 학생 매주 화목 4시 등록"
Output: {"intent":"schedule_plan","answer":"1개의 스케줄을 파싱했습니다.","confirm_text":"김민수 화/목 16:00 등록할까요?","items":[{"action":"register_recurring","student_name":"김민수","days":["tue","thu"],"date":null,"time":"16:00","type":"regular","label":"김민수 - 화/목 16:00 정규수업"}]}

User: "이지원 학생 내일 오후 3시 수업 연기"
Output: {"intent":"schedule_plan","answer":"이지원 학생 연기 요청을 파싱했습니다.","confirm_text":"이지원 학생 내일 15:00 수업을 연기할까요?","items":[{"action":"postpone_class","student_name":"이지원","days":null,"date":"<TOMORROW>","time":"15:00","type":"regular","label":"이지원 - 내일 15:00 수업 연기"}]}

User: "박민수 학생을 김선생님에게 월수금 5시 정규수업 등록"
Output: {"intent":"schedule_plan","answer":"박민수 학생 김선생님 배정 스케줄을 파싱했습니다.","confirm_text":"박민수 - 김선생님 - 월/수/금 17:00 등록할까요?","items":[{"action":"register_recurring","student_name":"박민수","teacher_name":"김선생님","days":["mon","wed","fri"],"date":null,"time":"17:00","type":"regular","label":"박민수 - 김선생 - 월/수/금 17:00"}]}

User: "정우영 학생 다음주 모든 수업 1시간 미뤄줘"
Output: {"intent":"bulk_modify","operation":"reschedule","criteria":{"student_name":"정우영","date_from":"<TOMORROW>","date_to":"<TODAY+14d>"},"shift_minutes":60,"answer":"정우영 학생의 다음 2주 수업을 1시간 뒤로 미룹니다.","confirm_text":"정우영 학생 다음 2주 모든 수업을 1시간 미룰까요?"}

User: "월요일 4시 수업 모두 취소해줘"
Output: {"intent":"bulk_modify","operation":"cancel","criteria":{"days":["mon"],"time":"16:00"},"answer":"매주 월요일 16:00 모든 수업을 취소합니다.","confirm_text":"월요일 16:00 모든 수업을 취소할까요?"}

Output rule: Only one valid JSON object. No "Output:" prefix, no markdown fences, no commentary.`;

// ──────────────────────────────────────────────────────────
// LLM 호출 — Workers AI Llama 3.3 70B
// ──────────────────────────────────────────────────────────
async function callLLM(env: { AI?: any }, command: string): Promise<any> {
  if (!env.AI) {
    throw new Error('AI binding not configured (wrangler.toml [ai] missing)');
  }

  // 현재 KST 날짜 + 다음주 월요일/내일 계산해서 system prompt 의 placeholder 치환
  // → AI 가 "다음주 월요일", "내일" 같은 상대 날짜를 정확한 ISO 로 변환할 수 있도록
  const now = new Date(Date.now() + 9 * 3600 * 1000); // KST
  const todayIso = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86400000);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);
  const dow = now.getUTCDay(); // 0=일 1=월 ... 6=토
  const daysToNextMon = dow === 0 ? 1 : (8 - dow);
  const nextMon = new Date(now.getTime() + daysToNextMon * 86400000);
  const nextMonIso = nextMon.toISOString().slice(0, 10);
  const dateContext = `Today (KST): ${todayIso} (${['일','월','화','수','목','금','토'][dow]}요일). Tomorrow: ${tomorrowIso}. Next Monday: ${nextMonIso}. Use these exact dates when user says "오늘/내일/다음주 월요일" etc.`;

  // Workers AI JSON 모드 — response_format 으로 JSON 강제
  // Phase 21e: temp 0.3→0.1 로 낮춰 결정성 강화
  // Phase 22: max_tokens 400→900 (스케줄 multi-item 대응)
  const result = await env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT + '\n\n' + dateContext },
      { role: 'user', content: command }
    ],
    max_tokens: 900,
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

  // Level 5 — schedule_plan (수업 스케줄 다건 등록/변경/연기 미리보기)
  if (intent === 'schedule_plan') {
    const items = Array.isArray(aiResponse.items) ? aiResponse.items : [];
    const allowedActions = new Set(['register_recurring', 'schedule_one_off', 'change_schedule', 'postpone_class']);
    const allowedTypes = new Set(['regular', 'level_test', 'trial']);
    const validDays = new Set(['mon','tue','wed','thu','fri','sat','sun']);
    const cleanItems = items.slice(0, 20).map((it: any) => {
      const action = allowedActions.has(it?.action) ? it.action : 'register_recurring';
      const type = allowedTypes.has(it?.type) ? it.type : 'regular';
      const days = Array.isArray(it?.days) ? it.days.filter((d: any) => validDays.has(String(d))) : null;
      const date = (it?.date && /^\d{4}-\d{2}-\d{2}$/.test(String(it.date))) ? it.date : null;
      const time = (it?.time && /^\d{1,2}:\d{2}$/.test(String(it.time))) ? it.time : null;
      const studentName = String(it?.student_name || '').slice(0, 50).trim();
      const teacherName = it?.teacher_name ? String(it.teacher_name).slice(0, 50).trim() : null;
      const label = String(it?.label || `${studentName} ${action}`).slice(0, 200);
      return { action, type, days, date, time, student_name: studentName, teacher_name: teacherName, label };
    }).filter((it: any) => it.student_name && (it.time || it.date));
    return {
      ok: true,
      intent: 'schedule_plan',
      items: cleanItems,
      answer: aiResponse.answer || '스케줄을 파싱했습니다.',
      confirm_text: aiResponse.confirm_text || `${cleanItems.length}건을 등록할까요?`
    };
  }

  // Level 6 — bulk_modify (다건 일괄 연기/취소/시간이동)
  if (intent === 'bulk_modify') {
    const allowedOps = new Set(['postpone','cancel','reschedule']);
    const op = allowedOps.has(aiResponse.operation) ? aiResponse.operation : 'cancel';
    const c = aiResponse.criteria || {};
    const validDays = new Set(['mon','tue','wed','thu','fri','sat','sun']);
    const cleanDays = Array.isArray(c.days) ? c.days.filter((d:any)=>validDays.has(String(d))) : null;
    const criteria = {
      student_name: c.student_name ? String(c.student_name).slice(0,50).trim() : null,
      teacher_name: c.teacher_name ? String(c.teacher_name).slice(0,50).trim() : null,
      days: cleanDays,
      time: (c.time && /^\d{1,2}:\d{2}$/.test(String(c.time))) ? c.time : null,
      date_from: (c.date_from && /^\d{4}-\d{2}-\d{2}$/.test(String(c.date_from))) ? c.date_from : null,
      date_to: (c.date_to && /^\d{4}-\d{2}-\d{2}$/.test(String(c.date_to))) ? c.date_to : null,
    };
    const shiftMin = (typeof aiResponse.shift_minutes === 'number') ? Math.max(-720, Math.min(720, aiResponse.shift_minutes)) : 0;
    return {
      ok: true,
      intent: 'bulk_modify',
      operation: op,
      criteria,
      shift_minutes: shiftMin,
      new_time: (aiResponse.new_time && /^\d{1,2}:\d{2}$/.test(String(aiResponse.new_time))) ? aiResponse.new_time : null,
      answer: aiResponse.answer || '일괄 변경을 미리 확인해 주세요.',
      confirm_text: aiResponse.confirm_text || '일괄 변경을 실행할까요?'
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
  const allowed = new Set(['send_kakao_self', 'issue_sticker', 'mark_intervention', 'schedule_batch', 'bulk_apply']);
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

    if (name === 'schedule_batch') {
      // Phase 2: D1 class_schedules 영구 저장 + KV 백업 (24시간)
      // Phase 3: 시간 충돌 감지 + auto_create_students 옵션
      const items = Array.isArray(args?.items) ? args.items : [];
      const autoCreateStudents = args?.auto_create_students === true;
      if (items.length === 0) return { ok: false, error: 'no_items' };

      // 스키마 자동 생성 (없으면)
      await env.DB.exec(
        `CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 30, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`
      );
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_class_schedules_user ON class_schedules(user_id)`); } catch {}
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_class_schedules_date ON class_schedules(scheduled_date)`); } catch {}
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_class_schedules_status ON class_schedules(status)`); } catch {}

      const now = Date.now();
      const results: any[] = [];
      for (const it of items) {
        const studentName = String(it?.student_name || '').trim();
        let userId: string | null = null;
        let teacherId: string | null = null;
        let teacherName: string | null = null;
        let autoCreated = false;

        // Phase 4-1: 강사 자동 매칭
        if (it?.teacher_name) {
          const tName = String(it.teacher_name).trim().replace(/(선생님?|쌤)$/, '').trim();
          if (tName) {
            try {
              const t = await env.DB.prepare(
                `SELECT id, name FROM teachers WHERE name = ? OR name LIKE ? LIMIT 1`
              ).bind(tName, '%'+tName+'%').first<any>();
              if (t?.id) { teacherId = String(t.id); teacherName = t.name; }
            } catch {}
          }
        }

        try {
          const exact = await env.DB.prepare(
            `SELECT user_id, korean_name FROM students_erp WHERE korean_name = ? LIMIT 1`
          ).bind(studentName).first<any>();
          if (exact?.user_id) userId = exact.user_id;
          else {
            const like = await env.DB.prepare(
              `SELECT user_id, korean_name FROM students_erp WHERE korean_name LIKE ? LIMIT 1`
            ).bind('%' + studentName + '%').first<any>();
            if (like?.user_id) userId = like.user_id;
          }
        } catch {}

        // Phase 5: 학생이 없고 auto_create_students=true 면 students_erp 에 자동 등록
        // student_meta 가 있으면 그 정보를 사용 (영문명, 연락처, 학부모, 학년 등)
        if (!userId && autoCreateStudents && studentName) {
          try {
            // 확장 컬럼들 자동 추가 (ALTER TABLE - 이미 있으면 catch 해서 무시)
            const cols = ['english_name','phone','parent_phone','grade','center','notes'];
            for (const col of cols) {
              try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN ${col} TEXT`); } catch {}
            }
            const meta = (args?.student_meta && args.student_meta[studentName]) || {};
            const newId = 'stu_ai_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            const todayKst = new Date(now + 9*3600*1000).toISOString().slice(0,10);
            await env.DB.prepare(
              `INSERT INTO students_erp (user_id, korean_name, english_name, status, signup_date, phone, parent_phone, grade, center, notes) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`
            ).bind(
              newId,
              studentName,
              String(meta.english_name||''),
              todayKst,
              String(meta.phone||''),
              String(meta.parent_phone||''),
              String(meta.grade||''),
              String(meta.center||''),
              String(meta.notes||'AI 명령으로 자동 등록')
            ).run();
            userId = newId;
            autoCreated = true;
          } catch (e: any) {
            console.log('[schedule_batch] auto-create student failed:', e?.message);
          }
        }

        let insertedId: number | null = null;
        let insertError: string | null = null;
        let conflict: any = null;

        if (userId) {
          const action = String(it?.action || 'register_recurring');
          const scheduleKind = (action === 'schedule_one_off' || action === 'postpone_class') ? 'one_off' : 'recurring';
          const classType = String(it?.type || 'regular');
          const dayOfWeek = Array.isArray(it?.days) && it.days.length ? it.days.join(',') : null;
          const scheduledDate = it?.date || null;
          const startTime = it?.time || null;
          const status = action === 'postpone_class' ? 'postponed' : 'active';

          if (!startTime) {
            insertError = 'time_required';
          } else {
            // Phase 3-2: 충돌 감지 - 같은 user_id + 같은 시간 + 같은 요일/날짜 활성 스케줄
            try {
              let conflictRow: any = null;
              if (scheduleKind === 'recurring' && dayOfWeek) {
                // 같은 시간에 같은 요일 중 하나라도 겹치는 활성 스케줄
                const dows = dayOfWeek.split(',');
                for (const d of dows) {
                  const r = await env.DB.prepare(
                    `SELECT id, day_of_week, start_time, class_type FROM class_schedules WHERE user_id=? AND status='active' AND start_time=? AND schedule_kind='recurring' AND day_of_week LIKE ? LIMIT 1`
                  ).bind(userId, startTime, '%'+d+'%').first<any>();
                  if (r?.id) { conflictRow = r; break; }
                }
              } else if (scheduledDate) {
                conflictRow = await env.DB.prepare(
                  `SELECT id, scheduled_date, start_time, class_type FROM class_schedules WHERE user_id=? AND status='active' AND start_time=? AND scheduled_date=? LIMIT 1`
                ).bind(userId, startTime, scheduledDate).first<any>();
              }
              if (conflictRow?.id) conflict = conflictRow;
            } catch {}

            // INSERT (충돌 있어도 일단 등록 - 사용자가 결정)
            try {
              const ins = await env.DB.prepare(
                `INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, teacher_id, status, source, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai_command', ?, ?)`
              ).bind(userId, studentName, scheduleKind, classType, dayOfWeek, scheduledDate, startTime, teacherId, status, adminUserId || 'ai', now).run();
              insertedId = (ins?.meta?.last_row_id as number) || null;
            } catch (e: any) {
              insertError = String(e?.message || e).slice(0, 200);
            }
          }
        }

        let resultStatus: string;
        if (insertedId && conflict) resultStatus = 'inserted_with_conflict';
        else if (insertedId) resultStatus = autoCreated ? 'inserted_auto_created' : 'inserted';
        else if (userId) resultStatus = 'insert_failed';
        else resultStatus = 'student_not_found_in_db';

        results.push({
          ...it,
          resolved_user_id: userId,
          resolved_teacher_id: teacherId,
          resolved_teacher_name: teacherName,
          schedule_id: insertedId,
          auto_created: autoCreated,
          conflict_with: conflict ? { id: conflict.id, time: conflict.start_time, type: conflict.class_type } : null,
          status: resultStatus,
          error: insertError
        });
      }

      // KV 백업 (감사 로그)
      const planId = 'plan_' + now + '_' + Math.random().toString(36).slice(2, 8);
      try {
        await env.SESSION_STATE.put(
          `schedule_plan:${planId}`,
          JSON.stringify({ plan_id: planId, created_at: now, created_by: adminUserId || 'unknown', items: results }),
          { expirationTtl: 86400 * 7 }
        );
      } catch {}

      const inserted = results.filter(r => r.status === 'inserted' || r.status === 'inserted_auto_created' || r.status === 'inserted_with_conflict').length;
      const autoCreatedCount = results.filter(r => r.auto_created).length;
      const conflictCount = results.filter(r => r.conflict_with).length;
      const notFoundCount = results.filter(r => r.status === 'student_not_found_in_db').length;
      return {
        ok: true,
        action: name,
        plan_id: planId,
        inserted_count: inserted,
        auto_created_count: autoCreatedCount,
        conflict_count: conflictCount,
        not_found_count: notFoundCount,
        total_count: results.length,
        items: results
      };
    }

    if (name === 'bulk_apply') {
      // Phase 4-3: 일괄 적용 (postpone, cancel, reschedule)
      const op = String(args?.operation || '');
      const c = args?.criteria || {};
      const shiftMin = parseInt(args?.shift_minutes || 0, 10);
      const newTime = args?.new_time;
      if (!['postpone','cancel','reschedule'].includes(op)) return { ok: false, error: 'invalid_operation' };

      // Find matching schedules
      const where: string[] = [`status = 'active'`];
      const binds: any[] = [];
      if (c.student_name) {
        // student_name 으로 user_id 찾고 그것으로 필터
        const stu = await env.DB.prepare(
          `SELECT user_id FROM students_erp WHERE korean_name = ? OR korean_name LIKE ? LIMIT 1`
        ).bind(c.student_name, '%'+c.student_name+'%').first<any>();
        if (!stu?.user_id) return { ok: false, error: 'student_not_found', student_name: c.student_name };
        where.push('user_id = ?'); binds.push(stu.user_id);
      }
      if (Array.isArray(c.days) && c.days.length) {
        const dayConds = c.days.map(()=>'day_of_week LIKE ?').join(' OR ');
        where.push('(' + dayConds + ')');
        for (const d of c.days) binds.push('%'+d+'%');
      }
      if (c.time) { where.push('start_time = ?'); binds.push(c.time); }
      if (c.date_from) { where.push('(scheduled_date IS NULL OR scheduled_date >= ?)'); binds.push(c.date_from); }
      if (c.date_to) { where.push('(scheduled_date IS NULL OR scheduled_date <= ?)'); binds.push(c.date_to); }

      const sel = await env.DB.prepare(
        `SELECT id, user_id, student_name, day_of_week, scheduled_date, start_time, class_type FROM class_schedules WHERE ${where.join(' AND ')} LIMIT 200`
      ).bind(...binds).all<any>();
      const matches = sel.results || [];

      const updated: any[] = [];
      const nowTs = Date.now();
      for (const row of matches) {
        try {
          if (op === 'cancel') {
            await env.DB.prepare(`UPDATE class_schedules SET status='cancelled', updated_at=? WHERE id=?`).bind(nowTs, row.id).run();
            updated.push({ id: row.id, action: 'cancelled', old_time: row.start_time });
          } else if (op === 'postpone') {
            await env.DB.prepare(`UPDATE class_schedules SET status='postponed', updated_at=? WHERE id=?`).bind(nowTs, row.id).run();
            updated.push({ id: row.id, action: 'postponed', old_time: row.start_time });
          } else if (op === 'reschedule') {
            // shift_minutes 만큼 시간 이동 또는 new_time 으로 변경
            let target = newTime;
            if (!target && shiftMin) {
              const tm = String(row.start_time).match(/^(\d{1,2}):(\d{2})$/);
              if (tm) {
                let total = parseInt(tm[1],10)*60 + parseInt(tm[2],10) + shiftMin;
                total = Math.max(0, Math.min(24*60-1, total));
                target = String(Math.floor(total/60)).padStart(2,'0') + ':' + String(total%60).padStart(2,'0');
              }
            }
            if (target) {
              await env.DB.prepare(`UPDATE class_schedules SET start_time=?, updated_at=? WHERE id=?`).bind(target, nowTs, row.id).run();
              updated.push({ id: row.id, action: 'rescheduled', old_time: row.start_time, new_time: target });
            }
          }
        } catch {}
      }

      return { ok: true, action: name, operation: op, matched_count: matches.length, updated_count: updated.length, items: updated };
    }

    return { ok: false, error: 'unhandled_action', name };
  } catch (e: any) {
    return { ok: false, error: 'action_exec_failed', detail: String(e?.message || e) };
  }
}
