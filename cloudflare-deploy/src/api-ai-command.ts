import { json, parseJsonBody } from './api-util';
import { checkAdminSession } from './auth-admin';
import { processAiCommand, processStudentCommand, executeAction } from './ai-command';
import type { MangoEnv } from './api-mango';

export async function handleAiCommandApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const { pathname: path } = url;
  const { method } = request;
    // 🥭 Phase 21 — AI 명령 (Workers AI Llama 3.3 70B)
    //   POST /api/admin/ai-command  { command: string }
    //     · 자연어 명령을 의도 분류 (answer / navigate / query / action)
    //     · query intent 는 서버에서 자동 도구 실행 후 결과 반환
    //     · action intent 는 confirm_text 만 반환 (실행은 ai-action 엔드포인트)
    //   POST /api/admin/ai-action   { name: string, args: object }
    //     · 사용자가 confirm 다이얼로그 OK 한 후 호출
    //     · 화이트리스트 액션만 실행 (send_kakao_self/issue_sticker/mark_intervention)
    // ════════════════════════════════════════════════════════════
    if (method === 'POST' && path === '/api/admin/ai-command') {
      if (!env.AI) {
        return json({ ok: false, error: 'ai_binding_missing',
                      hint: 'wrangler.toml 에 [ai] binding=AI 설정 후 재배포 필요' }, 503);
      }
      const body = await parseJsonBody(request);
      const command = body?.command || '';
      if (!command) return json({ ok: false, error: 'command_required' }, 400);
      // 🌐 프런트에서 전달한 언어 힌트 (en/ko) — AI 답변 언어 결정
      const lang = (body?.lang === 'en') ? 'en' : 'ko';
      const result = await processAiCommand(env, command, lang);
      return json(result, result.ok === false ? 500 : 200);
    }

    // 🎒 학생 검색창 AI — 관리자 ai-command 와 동일 엔진, 학생 스코프 (공개)
    //   POST /api/student/ai-command  { command }
    if (method === 'POST' && path === '/api/student/ai-command') {
      const body = await parseJsonBody(request);
      const command = body?.command || '';
      if (!command) return json({ intent: 'answer', answer: '검색어를 입력해주세요.' }, 200);
      const result = await processStudentCommand(env, command);
      return json(result, 200);
    }

    if (method === 'POST' && path === '/api/admin/ai-action') {
      const body = await parseJsonBody(request);
      const name = body?.name || '';
      const args = body?.args || {};
      if (!name) return json({ ok: false, error: 'name_required' }, 400);
      // 🔒 adminUserId 는 감사로그(created_by/by) 귀속용 — 클라이언트가 임의로 보낼 수 있는
      //   x-admin-user-id 헤더 대신, 세션쿠키에서 검증된 실제 로그인 사용자로 고정한다.
      const _aiSess = await checkAdminSession(request, env as any);
      const adminUserId = _aiSess.ok ? (_aiSess.username || null) : null;
      const result = await executeAction(env, name, args, adminUserId);
      return json(result, result.ok === false ? 400 : 200);
    }

  return null;
}
