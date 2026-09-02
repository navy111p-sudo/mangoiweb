/* ═══════════════════════════════════════════════════════════════════════════
   📡 Cloudflare Realtime SFU — «자격증명 경계» 전용 모듈  (2026-09-02, C안 1단계)

   [무엇을 하는 것인가]
   참관자가 늘어도 강사 업로드가 안 늘어나게 하려면 팬아웃을 서버가 해야 한다(SFU).
   Cloudflare 문서가 그 역할 분담을 못 박고 있다 —
     「Your backend stores the application secret and uses the Realtime SFU API
       to create the corresponding session. It also authenticates users,
       authorizes publish and subscribe operations…」
   즉 **브라우저는 앱 시크릿을 절대 보면 안 되고**, 우리 워커가 «누구인지·어느 방인지» 를
   확인한 뒤 대신 불러 줘야 한다. 이 파일이 그 경계선 하나만 담당한다.

   [⛔ 지금은 꺼져 있다 — 그리고 그게 의도다]
   REALTIME_APP_ID · REALTIME_APP_TOKEN 시크릿이 «둘 다» 없으면 이 모듈은
   { ok:true, enabled:false } 만 돌려주고 **fetch 를 한 번도 하지 않는다.**
   시크릿을 넣기 전까지 서비스 동작은 1바이트도 바뀌지 않는다.
   ⚠️ 이 컨테이너에서는 rtc.live.cloudflare.com 을 부를 수 없고(프록시 차단) 시크릿도 없어서
      **실제 SFU 와 맞춰 본 적이 없다.** 그래서 브라우저 쪽은 아직 쓰지 않았다 —
      검증 못 한 WebRTC 코드를 수업 경로에 올리는 것이 이 저장소의 최악 사고 유형이다.

   [왜 «본문을 그대로 넘기는» 프록시인가]
   tracks/new 의 요청·응답 본문 모양을 이 환경에서 문서로 확정하지 못했다
   (developers.cloudflare.com 이 프록시에 막힘). 그래서 **모양을 외워서 박아 넣지 않는다.**
   본문은 브라우저와 SFU 가 주고받게 두고, 우리는 ① 시크릿 ② 신원 ③ 방 ④ 세션 소유권
   네 가지만 지킨다. 나중에 브라우저 쪽을 쓸 때 이 파일을 고칠 필요가 없다.
   ⛔ 그렇다고 «아무 경로나» 넘기지 않는다 — 아래 SFU_OPS 에 적힌 네 가지뿐이다.

   [확인된 것만 적는다 — 2026-09-02 Cloudflare 문서 조회]
     · 베이스 URL   https://rtc.live.cloudflare.com/v1/apps/{APP_ID}/…
     · 인증        Authorization: Bearer {APP_TOKEN}
     · 엔드포인트   POST sessions/new · POST sessions/{id}/tracks/new
                   PUT  sessions/{id}/tracks/close · PUT sessions/{id}/renegotiate
     · 요금        egress $0.05/GB · 월 1,000GB 무료(TURN 과 합산 한 줄) · 인그레스 무료

   [🔴 켜기 «전에» 사람이 정해야 할 것 — 지금은 꺼져 있어 위험이 아니지만, 켜면 바로 걸린다]
     ① **«그 방의 사람인가» 는 아직 안 봅니다.** ④는 room_id 가 비어 있지 않은지만 보고,
        세션 소유권(⑤)은 «내가 만든 세션인가» 만 지킵니다 — 로그인한 학생이 남의 수업 방
        문자열로 자기 세션을 만드는 것은 막지 않습니다. 같은 저장소에 이미
        `/api/class/verify-room`(예약 대조)이 있으니 켤 때 그것을 태울지 정하세요.
     ② **속도 제한이 없습니다.** session-new 는 유료 egress 를 여는 자리라 계정 하나로
        반복 호출이 가능합니다(KV 카운터가 이 저장소에 이미 쓰이는 방식입니다).
     ⛔ 둘 다 «켤 때» 함께 해야 합니다 — 켜 놓고 나중에 하면 그 사이가 그대로 구멍입니다.
   ═══════════════════════════════════════════════════════════════════════════ */

export const SFU_BASE = 'https://rtc.live.cloudflare.com/v1';

/* 넘겨도 되는 것 «만» — 키는 우리 API 의 op, 값은 SFU 쪽 (메서드, 경로 만들기).
   ⛔ 여기 없는 op 는 fetch 조차 하지 않는다. 임의 경로 전달(SSRF)의 문을 아예 안 만든다. */
export const SFU_OPS: Record<string, { method: 'POST' | 'PUT'; needsSession: boolean; suffix: (sid: string) => string }> = {
  'session-new':  { method: 'POST', needsSession: false, suffix: () => 'sessions/new' },
  'tracks-new':   { method: 'POST', needsSession: true,  suffix: (s) => `sessions/${s}/tracks/new` },
  'tracks-close': { method: 'PUT',  needsSession: true,  suffix: (s) => `sessions/${s}/tracks/close` },
  'renegotiate':  { method: 'PUT',  needsSession: true,  suffix: (s) => `sessions/${s}/renegotiate` },
};

/* 세션 id 는 우리가 만든 것을 그대로 URL 에 넣는다 — 경로를 벗어날 수 있는 글자는 거절한다. */
export const SFU_SESSION_RE = /^[A-Za-z0-9_-]{8,128}$/;

/* 세션 소유권 기록 TTL. 수업 하나보다 넉넉히(4시간). */
export const SFU_OWNER_TTL = 4 * 3600;

export interface SfuDeps {
  appId?: string | null;
  appToken?: string | null;
  /** KV: 세션 소유권 기록. 없으면 소유권을 확인할 수 없으므로 «끈다»(막는 쪽으로 실패). */
  kv?: { get(k: string): Promise<string | null>; put(k: string, v: string, o?: any): Promise<void> } | null;
  /** 실제 네트워크 호출. 하니스가 가짜를 넣어 «무엇을 어디로 보냈나» 를 잰다. */
  fetchImpl: (url: string, init: any) => Promise<{ status: number; text(): Promise<string> }>;
  /** 확인된 신원. 없으면 401. */
  identity: { uid: string; kind: 'admin' | 'student' } | null;
}

export function sfuConfigured(d: Pick<SfuDeps, 'appId' | 'appToken'>): boolean {
  return !!(d.appId && String(d.appId).trim() && d.appToken && String(d.appToken).trim());
}

export interface SfuResult { status: number; body: any }

const J = (status: number, body: any): SfuResult => ({ status, body });

/**
 * SFU 프록시 한 번. 순수 함수에 가깝게 두어 하니스가 «실제로 돌려» 볼 수 있게 한다.
 * @param op       SFU_OPS 의 키
 * @param roomId   어느 수업인지 (세션 소유권에 함께 묶는다)
 * @param sessionId session-new 이외에는 필수
 * @param payload  브라우저가 준 본문 — 그대로 넘긴다(모양을 우리가 정하지 않는다)
 */
export async function sfuProxy(
  d: SfuDeps,
  op: string,
  roomId: string,
  sessionId: string | null,
  payload: unknown,
): Promise<SfuResult> {
  /* ① 신원 «먼저» 본다. 이 API 는 «내 대신 유료 서비스를 부르는» 자리다.
     ⚠️ 순서가 중요하다 — 시크릿 검사를 앞에 두면 로그인하지 않은 사람도
        { enabled:false } 를 받아 «이 계정에 SFU 가 켜졌나» 를 알아낼 수 있다(인프라 상태 노출).
        경미하지만 공짜로 막을 수 있는 것은 막는다. */
  if (!d.identity || !d.identity.uid) return J(401, { ok: false, error: 'unauthorized' });

  /* ② 시크릿이 없으면 «꺼짐» — 네트워크를 건드리지 않는다. 서비스 동작이 안 바뀐다. */
  if (!sfuConfigured(d)) return J(200, { ok: true, enabled: false, reason: 'no_secrets' });

  /* ③ 아는 op 만. */
  const spec = SFU_OPS[op];
  if (!spec) return J(400, { ok: false, enabled: true, error: 'unknown_op' });

  /* ④ 방 번호는 반드시 있어야 한다 — 세션 소유권을 «방» 에 묶어 둬야
        참관 하나가 남의 수업 세션을 이어받는 일이 없다. */
  const room = String(roomId || '').trim();
  if (!room) return J(400, { ok: false, enabled: true, error: 'room_required' });

  /* ⑤ 세션 소유권. KV 가 없으면 확인할 방법이 없으므로 «막는 쪽» 으로 실패한다.
        (수업을 막는 자리가 아니다 — 이 기능이 안 켜질 뿐이다) */
  let sid = '';
  if (spec.needsSession) {
    sid = String(sessionId || '').trim();
    if (!SFU_SESSION_RE.test(sid)) return J(400, { ok: false, enabled: true, error: 'bad_session_id' });
    if (!d.kv) return J(503, { ok: false, enabled: true, error: 'owner_store_unavailable' });
    let rec: any = null;
    try { rec = JSON.parse((await d.kv.get(`sfu:sess:${sid}`)) || 'null'); } catch { rec = null; }
    if (!rec || rec.uid !== d.identity.uid || rec.room !== room) {
      return J(403, { ok: false, enabled: true, error: 'not_your_session' });
    }
  }

  /* ⑥ 여기서만 시크릿을 쓴다. 응답 본문에는 절대 싣지 않는다. */
  const url = `${SFU_BASE}/apps/${d.appId}/${spec.suffix(sid)}`;
  let status = 0, text = '';
  try {
    const r = await d.fetchImpl(url, {
      method: spec.method,
      headers: { 'Authorization': `Bearer ${d.appToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });
    status = r.status;
    text = await r.text();
  } catch (e: any) {
    /* ⚠️ 실패 사유에 시크릿이 섞일 수 있는 값(예외 메시지)을 그대로 내보내지 않는다. */
    return J(502, { ok: false, enabled: true, error: 'sfu_unreachable' });
  }

  let body: any = null;
  try { body = JSON.parse(text); } catch { body = null; }
  if (status < 200 || status >= 300) {
    /* SFU 가 준 «상태 코드» 까지만 알려 준다 — 본문에 계정 정보가 섞일 수 있다.
       (같은 저장소의 TURN 진단이 X-Turn-Detail 을 상태코드까지만 적는 것과 같은 규칙) */
    return J(502, { ok: false, enabled: true, error: 'sfu_http_' + status });
  }

  /* ⑦ 새 세션이면 «누가 어느 방에서 만들었는지» 를 적어 둔다 — 다음 요청의 ⑤가 이걸 본다. */
  const newSid = body && typeof body.sessionId === 'string' ? body.sessionId : '';
  if (op === 'session-new' && newSid) {
    if (!d.kv) return J(503, { ok: false, enabled: true, error: 'owner_store_unavailable' });
    try {
      await d.kv.put(`sfu:sess:${newSid}`,
        JSON.stringify({ uid: d.identity.uid, kind: d.identity.kind, room, at: Date.now() }),
        { expirationTtl: SFU_OWNER_TTL });
    } catch {
      /* 못 적었으면 다음 요청이 «내 세션이 아니다» 로 막힌다 — 조용히 반쪽으로 두지 않는다. */
      return J(503, { ok: false, enabled: true, error: 'owner_store_write_failed' });
    }
  }

  return J(200, { ok: true, enabled: true, sfu: body });
}
