// ═══════════════════════════════════════════════════════════════
//  email.ts — Cloudflare Worker 이메일 발송 (Resend HTTP API)
//
//  ▶ 환경변수 (wrangler secret / vars):
//     RESEND_API_KEY   : Resend(https://resend.com) 발급 API 키 (secret)
//     RESEND_FROM      : 발신 주소. 예) "망고아이 <noreply@mangoi.co.kr>"
//                        (Resend 대시보드에서 도메인 인증 완료된 주소여야 실제 발송됨)
//     LEVELTEST_ADMIN_EMAIL : 레벨테스트 신규신청 알림을 받을 관리자(필리핀) 이메일
//
//  ▶ 미설정(disabled) 시: 콘솔 로그만 남기고 조용히 skip — 호출부는 절대 실패하지 않음.
//     (SOLAPI 어댑터와 동일한 best-effort 정책)
//
//  ▶ 활성화 절차(사용자 직접):
//     1) resend.com 가입 → 도메인(mangoi.co.kr) 추가 → DNS(SPF/DKIM) 인증
//     2) API 키 발급 → `wrangler secret put RESEND_API_KEY`
//     3) wrangler.toml [vars] 에 RESEND_FROM / LEVELTEST_ADMIN_EMAIL 지정(또는 secret)
// ═══════════════════════════════════════════════════════════════

export interface EmailEnv {
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  LEVELTEST_ADMIN_EMAIL?: string;
}

export type EmailMode = 'real' | 'disabled';

export function getEmailMode(env: EmailEnv): EmailMode {
  return env.RESEND_API_KEY && env.RESEND_FROM ? 'real' : 'disabled';
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;         // 미지정 시 html 태그 제거본으로 자동 생성
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  mode: EmailMode;
  id?: string;
  error?: string;
  message?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function stripHtml(html: string): string {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resend 로 이메일 1건 발송. 키 미설정이면 mode:'disabled' 로 조용히 skip.
 * 호출부는 반환값을 무시해도 되며(best-effort), 예외를 던지지 않는다.
 */
export async function sendEmail(env: EmailEnv, params: SendEmailParams): Promise<SendEmailResult> {
  const mode = getEmailMode(env);
  const toList = (Array.isArray(params.to) ? params.to : [params.to])
    .map(s => String(s || '').trim())
    .filter(s => EMAIL_RE.test(s));

  if (!toList.length) return { ok: false, mode, error: 'invalid_to' };
  if (!params.subject || !params.html) return { ok: false, mode, error: 'empty_content' };

  if (mode === 'disabled') {
    console.log('[email DISABLED]', { toCount: toList.length, subject: params.subject });
    return { ok: false, mode, message: 'RESEND_API_KEY/RESEND_FROM 미설정 — 발송 skip' };
  }

  const body: any = {
    from: env.RESEND_FROM,
    to: toList,
    subject: String(params.subject).slice(0, 200),
    html: params.html,
    text: params.text || stripHtml(params.html),
  };
  if (params.replyTo) body.reply_to = params.replyTo;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const raw = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }
    if (resp.status >= 200 && resp.status < 300 && parsed?.id) {
      return { ok: true, mode: 'real', id: parsed.id, message: 'OK' };
    }
    return { ok: false, mode: 'real', error: parsed?.name || ('http_' + resp.status), message: parsed?.message || raw.slice(0, 200) };
  } catch (e: any) {
    return { ok: false, mode: 'real', error: 'network_error', message: String(e?.message || e) };
  }
}

// ─────────────────────────────────────────────────────────────
//  간단한 이메일 레이아웃(인라인 스타일 — 메일 클라이언트 호환)
// ─────────────────────────────────────────────────────────────
export function emailLayout(opts: { title: string; bodyHtml: string; footer?: string }): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans KR',sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,0.06)">
        <tr><td style="background:linear-gradient(135deg,#fbbf24,#f59e0b);padding:18px 24px;color:#1a0f08;font-size:16px;font-weight:800">🥭 망고아이 MANGOi</td></tr>
        <tr><td style="padding:24px">
          <h1 style="margin:0 0 14px;font-size:19px;color:#1e293b;font-weight:800">${opts.title}</h1>
          <div style="font-size:14px;color:#334155;line-height:1.7">${opts.bodyHtml}</div>
        </td></tr>
        <tr><td style="padding:14px 24px;border-top:1px solid #eef0f3;color:#94a3b8;font-size:11.5px;line-height:1.6">${opts.footer || '본 메일은 망고아이 시스템에서 자동 발송되었습니다. · This is an automated message from MANGOi.'}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
