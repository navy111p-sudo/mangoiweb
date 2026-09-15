/**
 * video-call-room.ts - Durable Object for multi-user video call
 * Handles: join-room, leave-room, chat, whiteboard, pdf-share, WebRTC relay …
 * Max 10 users per room
 *
 * 🛡️ Hibernation API 사용 (2026-06 전환)
 *   - state.acceptWebSocket() + webSocketMessage/Close/Error 핸들러.
 *   - 사용자명/식별정보 → ws.serializeAttachment() (재기동에도 유지).
 *   - 교재 공유 상태(pdfState) → state.storage (재기동에도 유지).
 *   - 활성 사용자 열거는 state.getWebSockets() 기반.
 */

import { WebSocketMessage, PdfShareData } from './types';

const MAX_USERS = 10;

/** 🚪 (2026-08-06 동시접속 진단) 공용 연습방 `mangoi-class` 만 정원을 따로 낮춘다.
 *
 *  왜 필요한가 — 이 방은 «방 번호를 모르는 사람이 전부 모이는» 유일한 방이다.
 *  정원이 10이면 서로 모르는 사람 10명이 한 화면에서 만나고(2026-07-28 19:36 실제로 12명),
 *  11번째부터는 room-full 로 튕긴다. 학생 경로는 index.html 에서 이미 막았지만,
 *  옛 링크·저장된 방코드·직접 입력 등 남은 길이 있으므로 서버에서도 한 겹 더 막는다.
 *
 *  4명인 이유 — 교사 시연·연습(교사 2 + 참관 2)에는 충분하고,
 *  P2P 그물망 구조상 1인당 업로드가 N-1개라 실사용 한계도 이 부근이다.
 *  ⚠️ 예약 수업방(class-*)·회의방(meet-*)은 그대로 10명이다. 여기서 낮추면 단체수업이 막힌다.
 */
const SHARED_PRACTICE_ROOM = 'mangoi-class';
const SHARED_ROOM_MAX_USERS = 4;

interface VcAttachment {
  userId: string;
  roomId: string;
  username?: string;
  role?: string;
  joined?: boolean;
  clientId?: string;   // 브라우저 탭 안정 식별자 — 재연결 좀비 소켓 dedup 키
  /** 💓 (2026-08-20) 이 소켓이 «마지막으로 살아 있던» 시각(ms).
   *  hibernation 으로 DO 가 메모리에서 내려가도 attachment 는 살아남으므로,
   *  깨어난 알람이 «언제부터 조용한가» 를 판단할 바닥값으로 쓴다. */
  seenAt?: number;
}

export class VideoCallRoom {
  private state: DurableObjectState;
  private roomId: string;
  private pdfState: PdfShareData | null = null;
  // 🎬 동영상 공유 상태 — pdfState 와 동일하게 저장해야 늦게 입장한 학생도 영상을 받음
  private videoState: { url: string; type?: string } | null = null;
  /** 📚 (2026-08-06) 공유 교재/영상이 마지막으로 갱신된 시각(ms).
   *
   *  왜 필요한가 — 사장님 신고 "나갔다 들어오니 교재가 다른 게 보인다".
   *  원인은 캐시가 아니라 «방이 잠깐 비면 공유 상태를 지워버린 것»이었다.
   *  학생이 새로고침하거나 강사가 순단으로 빠지면 방이 0명이 되고, 그 순간
   *  pdfState 가 삭제된다 → 재입장한 화면엔 아무 것도 없고, 클라이언트가
   *  «학생 배정 교재»(강사가 보던 것과 다른 책)를 대신 띄웠다.
   *
   *  그렇다고 예전처럼 무기한 보존하면 며칠 전 교재가 다음 수업 첫 화면을
   *  차지하는 원래 문제로 되돌아간다. 그래서 «시각»을 함께 남기고,
   *  수업 한 타임(=SHARE_KEEP_MS)이 지난 상태만 낡은 것으로 보고 버린다.
   */
  private mediaAt: number = 0;
  /** 공유 상태 보존 한도 — 이 시간이 지난 뒤의 첫 입장은 «새 수업»으로 보고 화면을 비운다. */
  private static readonly SHARE_KEEP_MS = 3 * 60 * 60 * 1000;   // 3시간
  /* 🎬 (2026-08-11 강사 LEN ④) "수업에 들어갈 때마다 앞 수업에서 Karl 선생님이 틀었던 유튜브가 그대로 있다"
     [원인] 위 3시간 규칙은 «새로고침·순단으로 잠깐 나갔다 오는 것» 을 보호하려고 넣은 것인데,
            공용방(mangoi-class)처럼 방을 이어 쓰는 경우엔 «앞 수업» 도 3시간 안이라 함께 보호돼
            다음 수업 첫 입장자에게 앞 수업의 동영상·교재가 그대로 재전송됐다.
     [해결] 시간이 아니라 «방이 얼마나 비어 있었는가» 로 가른다.
            새로고침·순단은 몇 초 만에 돌아오고, 수업과 수업 사이는 그보다 훨씬 길다.
            빈 시간이 이 값을 넘으면 «다음 수업» 으로 보고 앞 수업의 화면을 버린다. */
  private static readonly NEW_CLASS_GAP_MS = 5 * 60 * 1000;     // 5분
  /** 방이 마지막으로 «빈» 시각. 0 = 빈 적 없음(첫 수업) */
  private emptyAt: number = 0;
  // 🔒 강사의 수업 통제 잠금 3종(배경 변경/전체 음소거/집중 모드)
  //   — 저장해야 늦게 입장/재접속한 학생에게도 적용됨. 방이 비면 자동 해제.
  /* ✋ (2026-08-07 Kaye 1번) drawLock 추가 — «학생 필기 잠금».
     [실제 사고] 클라이언트는 2026-07-28 부터 { type:'pdf-drawlock' } 를 보내고 있었는데,
     이 서버의 switch 에 그 타입이 없어 default 의 "Unknown message type" 으로 «버려졌다».
     그래서 강사가 버튼을 눌러도 학생에게는 아무 일도 일어나지 않았다(강사 화면의 버튼 색만 바뀜).
     Kaye 가 같은 지적을 두 번 한 이유가 이것이다. 나머지 잠금 3종과 완전히 같은 길에 태운다
     → 강사 role 검증·storage 저장·늦은 입장자 재전송·빈 방 자동 해제를 공짜로 얻는다. */
  private lockState: { bgLock: boolean; micLock: boolean; focusLock: boolean; drawLock: boolean } =
    { bgLock: false, micLock: false, focusLock: false, drawLock: false };
  private static readonly LOCK_KEYS: Record<string, 'bgLock' | 'micLock' | 'focusLock' | 'drawLock'> =
    { 'bg-lock': 'bgLock', 'mic-lock': 'micLock', 'focus-lock': 'focusLock', 'pdf-drawlock': 'drawLock' };

  /** 🖍 (2026-08-08) 칠판 획 — 늦게 들어온 사람에게 지금까지의 판서를 돌려주기 위한 메모리 버퍼.
   *  storage 에 넣지 않는다(수업이 끝나면 값어치 없음 · 수천 개까지 늘어남). 상한을 넘으면 오래된 것부터 버린다. */
  private wbOps: { t: string; d: any }[] = [];
  private static readonly WB_OPS_MAX = 4000;

  /** ✍️ (2026-08-12 Melca) 교재(PDF) 판서도 칠판과 같은 이유로 버퍼 —
   *  "학생 필기가 강사 화면에 안 보인다" 신고의 한 갈래가 «늦게 들어온·새로고침한 강사» 였다.
   *  칠판(wbOps)은 2026-08-08 에 replay 가 생겼는데 교재 판서만 빠져 있었다.
   *  점(point)은 획(stroke) 안에 압축해 쌓는다 — 점 하나가 op 하나면 상한이 획 몇 개로 끝난다.
   *  ✨ 사라지는 펜(vanish)은 기록하지 않는다(재입장 때 옛 획이 되살아나는 것 방지). */
  private pdfAnnoOps: { t: string; d: any }[] = [];
  private pdfAnnoStrokes: Record<string, any> = {};
  private static readonly PDF_ANNO_OPS_MAX = 2000;

  // 🔁 (2026-07-24) 무중단 재연결 스위치. wrangler.toml 의 VC_STICKY_UID='on' 일 때만 켜진다.
  //   기본값은 꺼짐 → 아래 인계 로직을 전부 건너뛰고 예전과 100% 동일하게 동작한다.
  //   서버 변수 하나로 클라 재배포 없이 즉시 원복 가능(문제 시 'off' 로 바꾸고 재배포).
  private stickyUid: boolean = false;

  /* 💓 (2026-08-20 사장님 제보 「왜 3명이 나와?」·「jeong 이 두 명이야」) 서버측 생존 판정.
     ─────────────────────────────────────────────────────────────────────────
     [사고] 2026-08-20 class-850 수업에서 학생이 25분간 7번 재입장했는데,
       나간 세션의 소켓이 방에 그대로 남아 «참여자 3명 · 검은 「연결 중…」 타일 두 개» 가 됐다.
       D1 출석표에는 «정상 퇴장» 으로 적혀 있어 기록만 봐서는 멀쩡해 보였다 —
       퇴장 시각(left_at)은 **HTTP** 로 기록되는데, 휴대폰은 **WebSocket 만 먼저 조용히 죽는다.**
     [원인] joinedUsers() 는 소켓의 readyState 만 본다. 반쯤 죽은 소켓은 한참 OPEN 으로 남는데,
       이 DO 에는 «N초 응답 없으면 내보낸다» 는 판정이 **아예 없었다.**
       브라우저는 25초마다 ping 을 보내고 2회 무응답이면 스스로 끊는데(createWebSocket),
       서버는 그 반대 방향 판정을 하지 않았다 = 한쪽만 있는 감시.
     [설계]
       · setWebSocketAutoResponse 로 ping 을 **DO 를 깨우지 않고** 자동 응답시킨다.
         그 시각(getAutoResponseTimestamp)은 hibernation 을 넘어 살아남으므로 생존 판단의 정본이 된다.
       · 알람으로 주기 점검 → STALE_MS 넘게 조용한 소켓만 닫는다.
       · 방에 아무도 없으면 알람을 다시 걸지 않는다(빈 방을 깨워 두지 않는다).
     ⚠️ 임계값을 25초 근처로 좁히지 말 것 — 필리핀·중국 회선에서 멀쩡한 수업을 끊는다.
        ping 4회분(120초)을 놓쳐야 죽은 것으로 본다. 게다가 닫을 때 1000 이 아닌 4003 을 쓰므로
        학생 화면은 이를 'dropped'(재연결 대기)로 받는다 — 오판이어도 수업이 끝나지 않는다. */
  private static readonly LIVENESS_ALARM_MS = 45 * 1000;    // 점검 주기
  private static readonly LIVENESS_STALE_MS = 120 * 1000;   // 이 시간 넘게 조용하면 죽은 소켓
  /* 🔴 (2026-09-15) ping 자동응답 근거를 «한 번도» 못 잡은 소켓에만 쓰는 넉넉한 상한.
     [사고] 9/15 수업 3건 전원이 20~30분에 8~9번씩 끊겼다(재접속 간격 123·135·137·137·137·160초
       = 아래 STALE+ALARM 구간과 정확히 겹침). 그때 회선은 멀쩡했다 — 학생 RTT 57ms·손실 0%.
       즉 «죽은 소켓 청소» 가 살아 있는 학생을 2분마다 끊어내고 있었다.
     [원인] 위 설계는 getAutoResponseTimestamp 를 «생존 판단의 정본» 으로 삼는데,
       ping 이 자동응답으로 처리되면 webSocketMessage 가 안 불려 나머지 두 근거
       (lastSeen·att.seenAt)가 갱신되지 않는다. 그래서 그 정본이 비면 남는 바닥값이
       «입장 시각» 뿐이라 **입장 120초 뒤 끊기고, 재접속 후 또 120초 뒤 끊긴다.**
     ⛔ 그러니 «조용하다» 를 그 정본 없이 단정하지 말 것 — 근거가 없으면 끊지 말고 더 기다린다.
        영원히 살려 두지는 않는다(유령이 남으면 2026-08-20 사고가 되살아난다). */
  private static readonly LIVENESS_NOPING_STALE_MS = 600 * 1000;
  /** 소켓별 마지막 수신 시각(메모리). hibernation 으로 비면 autoResponse 시각·attachment 로 대체한다. */
  private lastSeen: Map<WebSocket, number> = new Map();

  constructor(state: DurableObjectState, env?: any) {
    this.state = state;
    this.roomId = '';
    try { this.stickyUid = !!(env && env.VC_STICKY_UID === 'on'); } catch { this.stickyUid = false; }
    /* 💓 클라이언트(createWebSocket)가 25초마다 보내는 정확히 이 문자열에 자동 응답한다.
       문자열이 **완전히 일치**해야 발동하므로 `JSON.stringify({type:'ping'})` 와 한 글자도 달라선 안 된다.
       일치하지 않으면 예전처럼 webSocketMessage 의 case 'ping' 이 답한다(이중 안전). */
    try {
      const RRP: any = (globalThis as any).WebSocketRequestResponsePair;
      if (RRP && typeof (state as any).setWebSocketAutoResponse === 'function') {
        (state as any).setWebSocketAutoResponse(new RRP('{"type":"ping"}', '{"type":"pong","data":{}}'));
      }
    } catch {}
    // 재기동 시 교재 공유 상태 복원
    this.state.blockConcurrencyWhile(async () => {
      this.pdfState = (await this.state.storage.get<PdfShareData>('pdfState')) || null;
      this.videoState = (await this.state.storage.get<{ url: string; type?: string }>('videoState')) || null;
      this.mediaAt = (await this.state.storage.get<number>('mediaAt')) || 0;
      this.emptyAt = (await this.state.storage.get<number>('emptyAt')) || 0;
      for (const k of ['bgLock', 'micLock', 'focusLock', 'drawLock'] as const) {
        this.lockState[k] = (await this.state.storage.get<boolean>(k)) || false;
      }
      const rid = await this.state.storage.get<string>('roomId');
      if (rid) this.roomId = rid;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const roomIdParam = url.searchParams.get('roomId');
    if (roomIdParam) {
      this.roomId = roomIdParam;
      await this.state.storage.put('roomId', roomIdParam);
    }

    if (request.headers.get('Upgrade') === 'websocket') {
      const userId = this.generateUserId();
      const { 0: client, 1: server } = new WebSocketPair();
      /* 💓 (2026-08-20) 붙은 시각을 반드시 남긴다 — 없으면 「붙기만 하고 join 도 ping 도 안 하는」
         소켓이 생존 판정의 바닥값을 못 구해 영원히 살아 있는 것으로 취급되고, 청소 알람도 안 멈춘다. */
      server.serializeAttachment({ userId, roomId: this.roomId, joined: false, seenAt: Date.now() } as VcAttachment);
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    // 관리자/active-rooms 용 상태 조회
    if (url.pathname === '/status') {
      const users = this.joinedUsers();
      return new Response(
        /* 👁 observerCount — 관리자 표(adm-core.js «실시간 수업 현황»)가 «(관찰 N)» 으로 그리는 값.
           그동안 서버가 이걸 한 번도 안 보내 undefined 였다 → 배지가 영영 안 떴고,
           관리자는 [Ghost] 를 눌러도 «붙었는지» 를 표에서 확인할 길이 없었다. */
        JSON.stringify({ roomId: this.roomId, userCount: users.length, observerCount: this.observerCount(), users, pdfState: this.pdfState, videoState: this.videoState, bgLock: this.lockState.bgLock, locks: this.lockState }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 🛑 관리자 강제 종료
    if (url.pathname === '/force-end' && request.method === 'POST') {
      const reason = url.searchParams.get('reason') || '관리자가 수업을 종료했습니다.';
      const msg = JSON.stringify({ type: 'force_end', reason, by: 'admin', at: Date.now() });
      let notified = 0;
      const sockets = this.state.getWebSockets();
      for (const ws of sockets) { try { ws.send(msg); notified++; } catch {} }
      for (const ws of sockets) { try { ws.close(1000, 'admin force end'); } catch {} }
      return new Response(
        JSON.stringify({ ok: true, roomId: this.roomId, notified, reason }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    /* 📢 관리자 귓속말 전달  (2026-08-19 Melca 8/19 제보 2-③)
       ═══════════════════════════════════════════════════════════════════════
       [무엇이 문제였나] /api/admin/whisper/send 는 D1 에 **기록만** 하고 있었다.
          그 자리에 `// GM-4 미구현: 실제 WebSocket push 는 추후` 라는 주석이 그대로 남아
          있었고 응답은 영원히 delivery_status:'queued' 였다. 화면에는 보내기 버튼이 있어
          «보냈다» 로 보이지만 **강사 화면에는 한 번도 도착하지 않았다.**

       [여기서 하는 일] 방에 붙어 있는 소켓 중 **staff(교사·관리자)에게만** 한 줄 보낸다.
       ⛔ 학생 소켓에는 절대 보내지 않는다 — 학생이 관리자 지시를 보면 안 된다.
          판정은 소켓 attachment 의 role 로 한다.
       🔴 (2026-09-01 정정) 그 role 은 **클라이언트가 join-room 에 실어 보낸 값**입니다 —
          여기 「클라이언트가 보내는 값이 아니다」라고 적혀 있던 것은 사실이 아니었습니다.
          학생이 role:'teacher' 로 접속하면 이 귓속말도 받습니다. 자세한 것은 isStaffAtt 주석.
       ⚠️ 방을 깨우거나 상태를 바꾸지 않는다. 지금 붙어 있는 사람에게 전달만 하고,
          아무도 없으면 delivered:0 으로 정직하게 답한다(«보낸 척» 하지 않는다). */
    if (url.pathname === '/whisper' && request.method === 'POST') {
      let body: any = {};
      try { body = await request.json(); } catch { /* 빈 본문 — 아래에서 걸러진다 */ }
      const text = String(body?.payload || '').trim();
      if (!text) {
        return new Response(JSON.stringify({ ok: false, error: 'payload_required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const wBody = text.slice(0, 500);
      const wType = String(body?.message_type || 'text');
      const wUrg  = String(body?.urgency || 'normal');
      const wFrom = String(body?.from || '관리자').slice(0, 40);
      const wAt   = Date.now();

      /* 🎯 «콕 집은 한 사람» 에게 보내기  (2026-08-26 사장님 지시 — 관리자 수업 관찰 화면)
         ═════════════════════════════════════════════════════════════════════════
         방 안 참관 화면(handleObserverWhisper)에는 이미 있던 길을, 방 밖에서 보는
         관리자 「수업 관찰」 화면(/admin/ghost-view.html)에도 낸다.

         ⚠️ **번호가 두 갈래다.** 이 DO 의 userId 는 generateUserId() 가 접속마다 새로
            발급하는 임시 번호이고, 계정 아이디(delaware 등)와 아무 상관이 없다.
            관리자 화면이 보는 attendance.user_id 가 «마침» 그 임시 번호라 이어지지만
            (mango-attendance.js 가 vcUserId 를 그대로 적는다), 재접속하면 새 번호가
            발급되어 옛 행의 번호는 죽는다. 그래서 이름(to_name)으로 한 번 더 찾는다.
         ⛔ 이름은 **완전일치**일 때만, 그리고 **후보가 정확히 하나일 때만** 쓴다.
            둘 이상이면 붙이지 않는다 — 모르는 것보다 «남에게 보내는 것» 이 나쁘다
            (CLAUDE.md 2장 「강사 이름을 붙였는데 남의 이름이 뜸」과 같은 규칙).
         ⛔ 못 찾으면 staff 전원으로 «폴백하지 않는다». 학생에게 보내려던 글이 강사에게
            가는 것은 오배달이다 — delivered:0 으로 정직하게 답한다. */
      const toUserId = String(body?.to || '').trim();
      const toName   = String(body?.to_name || '').trim();
      if (toUserId || toName) {
        let target: WebSocket | null = null;
        let resolvedBy = '';
        const live: WebSocket[] = [];
        for (const ws of this.state.getWebSockets()) {
          const a = this.attOf(ws);
          if (!a || !a.joined || ws.readyState !== WebSocket.OPEN) continue;
          live.push(ws);
        }
        if (toUserId) {
          for (const ws of live) {
            if (this.attOf(ws)?.userId === toUserId) { target = ws; resolvedBy = 'user_id'; break; }
          }
        }
        if (!target && toName) {
          const hits = live.filter(ws => (this.attOf(ws)?.username || '') === toName);
          if (hits.length === 1) { target = hits[0]; resolvedBy = 'username'; }
          else if (hits.length > 1) resolvedBy = 'ambiguous_name';   // 붙이지 않는다
        }
        let delivered = 0;
        let toStaff = false;
        if (target) {
          const ta = this.attOf(target)!;
          toStaff = this.isStaffAtt(ta);
          const one = JSON.stringify({
            type: 'admin-whisper',
            data: {
              message: wBody,
              message_type: wType,
              urgency: wUrg,
              /* 학생에게는 보낸 사람 이름을 넘기지 않는다 — 참관은 인원수·입퇴장 어디에도
                 안 나오는 «투명 유령» 설계라(handleJoinObserve), 낯선 이름이 학생 화면에
                 뜨면 그 설계가 화면에서만 깨진다. 받는 화면이 «사무실» 로 그린다. */
              from: toStaff ? wFrom : '',
              at: wAt,
              direct: true,          // 🔒 받는 쪽 이중 방어 ① — «콕 집어 보낸 것» 표시
              to: ta.userId,         // 🔒 이중 방어 ② — 내 id 가 아니면 화면이 그리지 않는다
              toStaff,
            },
          });
          try { target.send(one); delivered = 1; } catch { /* delivered:0 으로 정직하게 */ }
        }
        return new Response(JSON.stringify({
          ok: true, roomId: this.roomId, delivered, staff: 0,
          direct: true, resolved_by: resolvedBy || 'not_found', to_staff: toStaff,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // 대상을 안 고르면 지금까지처럼 «방에 있는 강사 전원» 에게 간다.
      const msg = JSON.stringify({
        type: 'admin-whisper',
        data: {
          message: wBody,
          message_type: wType,
          urgency: wUrg,
          from: wFrom,
          at: wAt,
        },
      });
      let delivered = 0, staff = 0;
      for (const ws of this.state.getWebSockets()) {
        const att = this.attOf(ws);
        if (!att || !this.isStaffAtt(att)) continue;   // 🔒 staff 아니면 건너뛴다(학생 차단)
        staff++;
        if (ws.readyState !== WebSocket.OPEN) continue;
        try { ws.send(msg); delivered++; } catch { /* 한 소켓 실패가 나머지를 막지 않는다 */ }
      }
      return new Response(JSON.stringify({ ok: true, roomId: this.roomId, delivered, staff }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response('Invalid request', { status: 400 });
  }

  /* 💓 (2026-08-20) 죽은 소켓 청소 알람 — 위 LIVENESS_* 주석 참고.
     알람은 «입장한 사람이 한 명이라도 있을 때만» 다시 걸린다. */
  private scheduleLivenessAlarm(): void {
    try {
      void this.state.storage.setAlarm(Date.now() + VideoCallRoom.LIVENESS_ALARM_MS);
    } catch {}
  }

  /** 이 소켓이 마지막으로 살아 있던 시각. 셋 중 가장 최근 값을 쓴다(어느 하나가 비어도 안전). */
  private lastSeenOf(ws: WebSocket, att: VcAttachment | null): number {
    let t = this.lastSeen.get(ws) || 0;
    try {
      const auto = (ws as any).getAutoResponseTimestamp?.();
      if (auto) t = Math.max(t, auto instanceof Date ? auto.getTime() : Number(auto) || 0);
    } catch {}
    if (att && att.seenAt) t = Math.max(t, att.seenAt);
    return t;
  }

  /** ping 자동응답이 «실제로 한 번이라도» 일어난 시각(0 = 근거 없음).
      ⚠️ 위 lastSeenOf 와 같은 값을 읽지만 묻는 것이 다르다 — 저기는 «가장 최근이 언제인가»,
         여기는 «ping 근거를 쓸 수 있는가» 다. 한쪽만 고치지 말 것. */
  private autoSeenOf(ws: WebSocket): number {
    try {
      const auto = (ws as any).getAutoResponseTimestamp?.();
      if (auto) return auto instanceof Date ? auto.getTime() : Number(auto) || 0;
    } catch {}
    return 0;
  }

  /** 「이 소켓을 끊어도 되는가」 판정. 'alive' = 살아 있음 · 'grace' = 근거가 없어 더 기다림 · 'kill' = 정리.
      ⛔ 이 조건을 alarm() 안에 되돌려 넣지 말 것 — 순수 함수라야 하니스가 «실제로 돌려»
         경계값과 «조건 뒤집기» 를 본다. 문자열 검사로는 `if (false && ...)` 한 글자를 못 잡는다. */
  static livenessVerdict(now: number, seen: number, autoAt: number,
                         staleMs: number, nopingMs: number): 'alive' | 'grace' | 'kill' {
    /* 시각을 하나도 못 구한 소켓(=붙자마자 알람이 돈 경우)은 건드리지 않는다. */
    if (!seen) return 'alive';
    const silent = now - seen;
    if (silent <= staleMs) return 'alive';
    /* ping 자동응답 근거가 없으면 «조용하다» 를 단정할 수 없다 → 넉넉한 상한까지 기다린다. */
    if (!autoAt && silent <= nopingMs) return 'grace';
    return 'kill';
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    let alive = 0, killed = 0;
    for (const ws of this.state.getWebSockets()) {
      const att = this.attOf(ws);
      if (!att) continue;
      /* hibernation 에서 알람으로 깨면 생성자가 roomId 를 비워 둔 채로 온다 → 로그가 room=- 로 남아
         「어느 방에서 청소했는지」를 사후에 못 찾는다. webSocketMessage 와 같은 방식으로 되살린다. */
      if (!this.roomId && att.roomId) this.roomId = att.roomId;
      if (ws.readyState !== WebSocket.OPEN) continue;
      const seen = this.lastSeenOf(ws, att);
      const autoAt = this.autoSeenOf(ws);
      /* 💓 (2026-09-15) 판정은 순수 함수 한 곳에서만 한다(위 livenessVerdict 주석 참고). */
      const verdict = VideoCallRoom.livenessVerdict(now, seen, autoAt,
        VideoCallRoom.LIVENESS_STALE_MS, VideoCallRoom.LIVENESS_NOPING_STALE_MS);
      if (verdict === 'alive') { alive++; continue; }
      if (verdict === 'grace') {
        alive++;
        try {
          console.log(`[VideoChat][liveness] room=${this.roomId || '-'} uid=${att.userId} `
            + `silent=${Math.round((now - seen) / 1000)}s auto=없음 → 유예(ping 근거 없음)`);
        } catch {}
        continue;
      }
      killed++;
      /* ⚠️ 세 근거를 각각 남긴다 — 「왜 끊었나」를 사후에 가르려면 합친 값(silent)만으로는 모자란다. */
      try {
        console.log(`[VideoChat][liveness] room=${this.roomId || '-'} uid=${att.userId} role=${att.role || '-'} `
          + `silent=${Math.round((now - seen) / 1000)}s `
          + `auto=${autoAt ? Math.round((now - autoAt) / 1000) + 's' : '없음'} `
          + `mem=${this.lastSeen.get(ws) ? Math.round((now - (this.lastSeen.get(ws) as number)) / 1000) + 's' : '없음'} `
          + `att=${att.seenAt ? Math.round((now - att.seenAt) / 1000) + 's' : '없음'} → 정리`);
      } catch {}
      /* ⚠️ 1000(정상 종료)이 아니라 4003 으로 닫는다 — 학생 화면이 'dropped'(재연결 대기)로 받아야
         오판이어도 수업이 즉시 끝나지 않는다. handleLeaveRoom 도 같은 이유로 'dropped'. */
      if (att.joined) this.handleLeaveRoom(att.userId, ws, att.username, 'dropped');
      try { ws.serializeAttachment({ ...att, joined: false } as VcAttachment); } catch {}
      this.lastSeen.delete(ws);
      /* 닫기가 실패해도 흐름은 계속한다(나머지 소켓 청소가 막히면 안 된다). 다만 조용히 넘기지는 않는다 —
         「청소했다고 로그엔 찍혔는데 방에는 그대로 남아 있는」 상태가 이 기능의 유일한 실패 모습이다. */
      try { ws.close(4003, 'liveness-timeout'); }
      catch (e) { console.warn('[VideoChat][liveness] close 실패', (e as any)?.message); }
    }
    if (alive > 0) this.scheduleLivenessAlarm();
    else if (killed > 0) console.log(`[VideoChat][liveness] room=${this.roomId || '-'} 빈 방 — 알람 중지`);
  }

  // ── Hibernation 핸들러 ──
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const att = this.attOf(ws);
      if (!att) return;
      /* 💓 무엇이든 도착했다 = 살아 있다.
         ⚠️ 메모리(lastSeen)에만 적으면 안 된다 — DO 가 hibernation 으로 내려가면 Map 이 통째로 비고,
            깨어난 알람에는 «입장 시각»(att.seenAt)밖에 안 남아 **멀쩡한 수업 전원이 120초에 끊긴다.**
            그래서 1분에 한 번은 attachment 에도 적는다(attachment 는 hibernation 을 넘어 살아남는다).
            매 메시지마다 쓰지 않는 이유는 칠판 획처럼 초당 수십 건 오는 타입이 있어서다. */
      const _now = Date.now();
      this.lastSeen.set(ws, _now);
      if (_now - (att.seenAt || 0) > 60000) {
        try { ws.serializeAttachment({ ...att, seenAt: _now } as VcAttachment); }
        catch (e) { console.warn('[VideoChat][liveness] seenAt 기록 실패', (e as any)?.message); }
      }
      if (att.roomId) this.roomId = att.roomId;
      const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
      const msg: WebSocketMessage = JSON.parse(text);
      const userId = att.userId;

      switch (msg.type) {
        case 'join-room':       this.handleJoinRoom(ws, userId, msg.data as any); break;
        case 'join-observe':    this.handleJoinObserve(ws, userId, msg.data as any); break;
        case 'leave-room':
          this.handleLeaveRoom(userId, ws, att.username, 'left');
          // 뒤따르는 소켓 close 가 같은 사용자를 또 'user-left' 로 방송하지 않도록 선반영
          try { ws.serializeAttachment({ ...att, joined: false } as VcAttachment); } catch {}
          break;
        /* 💬 참관자가 보낸 채팅은 **버려지고 있었다** (2026-08-19 제보 2-③)
           참관자는 «유령» 이라 joined:false 로 붙는데(handleJoinObserve),
           handleChatMessage 첫 줄이 `usernameOf()` 로 «입장한 사람» 만 통과시킨다.
           그래서 참관자가 무엇을 써도 에러도 응답도 없이 사라졌다.
           → 버리지 말고 staff 전용 귓속말로 돌린다. 학생 화면에는 아무 변화가 없고
             참관자는 계속 참가자 목록에 안 나온다(유령 설계 그대로). */
        case 'chat-message':
          if ((att.role || '').toLowerCase() === 'observer') {
            this.handleObserverWhisper(userId, att, msg.data as any);
            break;
          }
          this.handleChatMessage(userId, msg.data as any);
          break;
        case 'whiteboard-draw': this.handleWhiteboardDraw(userId, msg.data as any); break;
        case 'whiteboard-clear':this.handleWhiteboardClear(userId, att); break;
        case 'pdf-share':       await this.handlePdfShare(userId, att, msg.data as any); break;
        case 'pdf-page-change': await this.handlePdfPageChange(userId, att, msg.data as any); break;
        case 'pdf-stop-share':  await this.handlePdfStopShare(userId, att); break;
        case 'video-share':
        case 'video-sync':      await this.handleVideoShare(userId, att, msg.data as any); break;
        case 'video-stop-share':await this.handleVideoStopShare(userId, att); break;
        case 'pdf-anno-start':
        case 'pdf-anno-point':
        case 'pdf-anno-text':
        case 'pdf-anno-clear':
        case 'pdf-anno-undo':
        case 'pdf-anno-shape':
        case 'pdf-pointer':
        case 'whiteboard-text':
        case 'whiteboard-shape':
        case 'whiteboard-stroke':
        case 'point-award':          // 🌟 실시간 칭찬 포인트 — 강사→학생 전달
        case 'point-award-ack':      //    학생→강사 결과 확인 응답
        case 'tab-sync':             // 📡 교사 탭 전환 동기화 (칠판/동영상/교재 따라가기)
        case 'file-share':           // 📎 파일 공유 다운로드 카드 (워드/엑셀/PPT 등)
        case 'device-report':        // 🎧 (2026-08-07) 학생 → 강사: 마이크 재획득 결과. 대상 지정은 클라이언트가 id 로 거른다.
        case 'device-list':          // 🎛 (2026-08-10) 학생 → 강사: 장치 도우미 — 내 카메라·마이크·스피커 목록 회신.
        case 'device-set-result':    //    학생 → 강사: 장치 교체 결과(성공/실패/보류). 셋 다 수신측이 staff 여부로 거른다.
        case 'quiz-pick':            // 🙋 (2026-08-12 Shas 5-b) 학생 → 강사: 복습퀴즈에서 지금 고른 답.
        case 'quiz-done':            //    학생 → 강사: 제출 완료(점수) 또는 그만두기. 그리는 쪽에서 강사만 표시.
        case 'warmup-echo':          // 🪞 (2026-08-12 Shas 1번) 학생 → 강사: AI 웜업 대화 한 줄.
                                     //   강사가 «학생이 지금 뭘 하고 있는지» 볼 수 있게 하는 읽기 전용 중계.
                                     //   방 전체로 나가지만 그리는 쪽에서 강사만 표시한다(다른 릴레이와 같은 규칙).
        case 'cam-state':            // 📷 (2026-07-24) 카메라 on/off 를 상대에게 알림.
                                     //   이게 없으면 수신측은 '상대가 껐다' 와 '회선이 나빠 영상만 죽었다' 를
                                     //   구분할 수 없어, 자가복구 워치독이 정상 상태를 장애로 오인해
                                     //   6초마다 연결을 다시 맺으며 화면을 깜빡이게 만든다.
          if (!this.isJoined(userId)) break;
          /* ✋ (2026-08-10) 필기 잠금 중 학생의 «그리기» 는 서버에서 버린다.
             클라이언트 게이트(pointerdown/mousedown)는 콘솔로 우회할 수 있다.
             포인터(pdf-pointer)·탭동기화·칭찬 등은 그리기가 아니므로 통과시킨다. */
          if (this.lockState.drawLock && !this.isStaffAtt(att)
              && (msg.type.startsWith('pdf-anno-') || msg.type.startsWith('whiteboard-'))) break;
          /* 🖍 (2026-08-08) 칠판에 «남는» 3종만 기록한다 — 늦게 들어온 사람에게 되돌려주기 위함.
             포인터(whiteboard-pointer)·교재 판서(pdf-anno-*)는 여기 대상이 아니다:
             포인터는 1.6초 뒤 사라지고, 교재 판서는 클라이언트가 페이지별로 따로 들고 있다. */
          if (msg.type === 'whiteboard-text' || msg.type === 'whiteboard-shape' || msg.type === 'whiteboard-stroke') {
            this.recordWb(msg.type, msg.data);
          }
          /* ✍️ (2026-08-12 Melca) 교재 판서도 기록 — 늦게 들어온 강사에게 pdf-anno-replay 로 돌려준다 */
          if (msg.type.startsWith('pdf-anno-')) {
            this.recordPdfAnno(msg.type, msg.data);
          }
          this.broadcast(userId, { type: msg.type, data: msg.data });
          break;
        case 'bg-lock':              // 🔒 강사 → 학생 수업 통제 잠금 4종 (공통 처리)
        case 'mic-lock':             //    🎤 전체 음소거
        case 'focus-lock':           //    🎯 집중 모드(학생 탭 이탈 금지)
        case 'pdf-drawlock':         //    ✋ 학생 필기 잠금 (2026-08-07 — 이 줄이 없어 통째로 버려지고 있었다)
          this.handleClassLock(userId, att, msg.type, msg.data as any);
          break;
        /* 🎧 (2026-08-07) 강사 → 특정 학생: "마이크를 다시 잡아 주세요".
           🎛 (2026-08-10) 장치 도우미 확장 — 강사 → 특정 학생:
              device-list-req = "장치 목록 보내줘", device-set = "이 장치로 바꿔줘".
           ⚠️ 셋 다 반드시 강사만. 아무나 보낼 수 있게 두면 학생이 다른 학생의 카메라·마이크를
              원격으로 건드릴 수 있다(«잠금 3종»과 같은 이유로 role 을 소켓 attachment 에서 본다). */
        /* 🙋 (2026-08-12 Shas 5-b·5-c) 수업 안 복습퀴즈 잇기.
           quiz-pick / quiz-done (학생 → 강사) 은 위 일반 릴레이 묶음에 있다.
           quiz-share (강사 → 학생 «이 퀴즈를 같이 풀자») 만은 강사 전용 — 아무나 보낼 수 있으면
           학생이 반 전체의 퀴즈를 제멋대로 갈아치운다(교재 갈아치우기와 같은 구멍). */
        case 'quiz-share':
        case 'device-fix':
        case 'device-list-req':
        case 'device-set': {
          const dfRole = (att.role || '').toLowerCase();
          if (!this.isJoined(userId) || (dfRole !== 'teacher' && dfRole !== 'admin')) break;
          this.broadcast(userId, { type: msg.type, data: msg.data });
          break;
        }
        /* 🖥 (2026-08-12 Melca) 화면 공유 시작/종료 알림 — 강사 전용. 수신 학생은 토스트와
           강사 타일 «화면 공유 중» 배지를 그린다. fromUserId 를 실어 어느 타일인지 알려 준다. */
        case 'screen-share-state': {
          const ssRole = (att.role || '').toLowerCase();
          if (!this.isJoined(userId) || (ssRole !== 'teacher' && ssRole !== 'admin')) break;
          this.broadcast(userId, { type: 'screen-share-state', data: { ...(msg.data || {}), fromUserId: userId } });
          break;
        }
        case 'offer':           this.handleOffer(userId, msg.data as any); break;
        case 'answer':          this.handleAnswer(userId, msg.data as any); break;
        case 'ice-candidate':   this.handleIceCandidate(userId, msg.data as any); break;
        case 'ping':            this.send(userId, { type: 'pong', data: {} }); break;
        default:                console.warn(`Unknown message type: ${msg.type}`);
      }
    } catch (err) {
      console.error('Message parse error:', err);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const att = this.attOf(ws);
    // code 1000(정상 종료) = 사용자가 나가기 버튼 등으로 의도적으로 닫음 → 'left'
    // 그 외(1001/1005/1006/4001…) = 네트워크 끊김·탭 전환·재연결 교체 → 'dropped'
    //   클라이언트는 'dropped' 를 받으면 곧바로 수업 종료로 처리하지 않고 재연결을 기다린다.
    // 🇵🇭 (2026-07-24) close code 를 반드시 남긴다. 예전엔 이걸 안 찍어서
    //   "필리핀 강사가 왜 튕겼는가"를 사후에 구분할 방법이 전혀 없었다.
    //   1006=비정상 종료(회선), 1001=탭/앱 종료, 4001=재접속 교체, 4002=클라이언트 pong 무응답 판정.
    //   🔒 username 은 '로그인 아이디' 라서 로그에 남기지 않는다. observability 를 켠 순간부터
    //      이 로그는 Cloudflare 에 며칠간 보관되므로, 예전처럼 tail 로 스쳐 지나가는 것과 다르다.
    //      원인 분석에는 익명 userId(랜덤) + role + code 면 충분하다.
    try {
      console.log(`[VideoChat][close] room=${this.roomId || '-'} uid=${att?.userId || '-'} role=${att?.role || '-'} code=${code} reason=${reason || '-'}`);
    } catch {}
    if (att && att.joined) this.handleLeaveRoom(att.userId, ws, att.username, code === 1000 ? 'left' : 'dropped');
    try { ws.close(code, reason); } catch {}
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    const att = this.attOf(ws);
    try { console.log(`[VideoChat][error] room=${this.roomId || '-'} uid=${att?.userId || '-'} role=${att?.role || '-'}`); } catch {}
    if (att && att.joined) this.handleLeaveRoom(att.userId, ws, att.username, 'dropped');
  }

  // ── 비즈니스 로직 ──
  private handleJoinRoom(ws: WebSocket, userId: string, data: any): void {
    const { username, role, clientId } = data || {};
    if (!username) {
      this.send(userId, { type: 'error-msg', data: { message: 'username required' } });
      return;
    }

    // 🧹 유령 타일 방지 — 같은 브라우저(clientId)가 재연결/새로고침으로 새 소켓을 열면,
    //   서버는 접속마다 새 랜덤 userId 를 발급하므로 옛 소켓이 로스터에 좀비로 남아 중복 타일이 된다.
    //   → 같은 clientId 의 이전 소켓을 먼저 닫아준다. close() 는 webSocketClose 를 확실히 발화시켜
    //     handleLeaveRoom 이 user-left 를 브로드캐스트 → 모든 클라이언트에서 옛 타일 제거.
    //   (clientId 가 있을 때만 동작 = 진짜 다른 참가자/다른 기기/다른 탭은 절대 닫지 않음, fail-safe)
    // 🔁 (2026-07-24) 무중단 재연결: 스위치가 켜져 있고 같은 clientId 의 옛 소켓이 '입장 상태'면,
    //   새 랜덤 userId 를 발급하는 대신 옛 userId 를 물려받는다 → 상대 화면에서 타일·연결이 유지된다.
    //   스위치 OFF(기본)면 inherited 는 계속 false 라 아래 흐름이 예전과 100% 동일하다.
    let effectiveUserId = userId;
    let inherited = false;
    if (clientId) {
      for (const other of this.state.getWebSockets()) {
        if (other === ws) continue;
        const oa = this.attOf(other);
        if (oa && oa.clientId && oa.clientId === clientId) {
          if (this.stickyUid && !inherited && oa.joined && oa.userId) {
            effectiveUserId = oa.userId;
            inherited = true;
            // 🔴 순서 중요: 옛 소켓을 닫기 '전에' joined:false + stale- 로 갱신한다.
            //   ① joined:false → webSocketClose 가 handleLeaveRoom(user-left 방송)을 건너뛴다(상대 타일 유지)
            //   ② userId 를 stale- 로 바꿔 wsOf(userId) 가 '새 소켓'을 가리키게 한다(메시지 오배송 방지)
            try { other.serializeAttachment({ ...oa, userId: 'stale-' + oa.userId, joined: false } as VcAttachment); } catch {}
          }
          // ⚠️ 1000(정상 종료)이 아닌 4001 로 닫는다 — 같은 사람이 '재접속으로 교체'되는 중이므로
          //   학생 화면이 이를 '강사 퇴장(left)'으로 오인해 수업을 즉시 종료하면 안 된다('dropped' 유예 대상).
          try { other.close(4001, 'superseded-by-reconnect'); } catch {}
        }
      }
    }

    // 🚪 정원 판정 — 공용 연습방만 별도(작은) 정원. 그 외는 기존과 동일하게 10명.
    //    limit 을 응답에 실어 보낸다: 예전엔 클라이언트가 "정원(10명)" 을 하드코딩해 안내했다.
    const roomLimit = (this.roomId === SHARED_PRACTICE_ROOM) ? SHARED_ROOM_MAX_USERS : MAX_USERS;
    if (this.joinedUsers().length >= roomLimit) {
      this.send(userId, { type: 'room-full', data: { roomId: this.roomId, limit: roomLimit, shared: this.roomId === SHARED_PRACTICE_ROOM } });
      try { ws.close(1000, 'room-full'); } catch {}
      return;
    }

    // attachment 에 사용자명/joined 기록 (재기동에도 유지) — 인계 시엔 물려받은 userId 사용
    const att = this.attOf(ws) || { userId: effectiveUserId, roomId: this.roomId };
    ws.serializeAttachment({ ...att, userId: effectiveUserId, roomId: this.roomId, username, role: role || 'student', joined: true, clientId: clientId || att.clientId, seenAt: Date.now() } as VcAttachment);
    // 💓 (2026-08-20) 죽은 소켓 청소 알람 시작 — 사람이 있는 동안만 스스로 이어 건다.
    this.lastSeen.set(ws, Date.now());
    this.scheduleLivenessAlarm();

    const userCount = this.joinedUsers().length;

    // 🧹 (2026-07-20 → 2026-08-06 수정) 첫 입장자에게 «낡은» 공유 상태만 버린다.
    //   예전: 방에 나 혼자면(userCount<=1) 무조건 삭제 → 새로고침·순단 재입장에서도 교재가 사라져
    //         "나갔다 들어오니 교재가 다른 게 보인다"(사장님 신고)의 직접 원인이 됐다.
    //   지금: 마지막 공유로부터 SHARE_KEEP_MS(3시간)가 지난 것만 «지난 수업»으로 보고 버린다.
    //         그 안이면 그대로 두고 아래에서 pdf-sync 로 재전송 → 강사가 보던 그 교재·그 페이지 복원.
    /* 🎬 (2026-08-11 LEN ④) «방이 오래 비어 있었다» = 앞 수업이 끝났다 → 그 화면은 버린다.
       새로고침·순단은 몇 초 만에 돌아오므로 여기 걸리지 않는다(그 보호는 그대로 유지). */
    const _emptyGap = this.emptyAt ? (Date.now() - this.emptyAt) : 0;
    const _newClass = this.emptyAt > 0 && _emptyGap > VideoCallRoom.NEW_CLASS_GAP_MS;
    if (userCount <= 1 && (this.pdfState || this.videoState) &&
        (_newClass || !this.mediaAt || (Date.now() - this.mediaAt) > VideoCallRoom.SHARE_KEEP_MS)) {
      this.pdfState = null;
      this.videoState = null;
      this.mediaAt = 0;
      this.wbOps = [];   // 🖍 지난 수업 판서도 같은 기준으로 버린다(새로고침·순단은 여기 안 걸린다)
      this.pdfAnnoOps = []; this.pdfAnnoStrokes = {};   // ✍️ 교재 판서도 함께
      void this.state.storage.delete('pdfState');
      void this.state.storage.delete('videoState');
      void this.state.storage.delete('mediaAt');
      console.log(`[VideoChat] Stale shared media cleared on first join in room ${this.roomId}`
        + (_newClass ? ` (new class — room was empty for ${Math.round(_emptyGap / 1000)}s)` : ' (age)'));
    }
    // 🔒 지난 수업의 통제 잠금(배경/음소거/집중)도 새 수업 첫 입장 시엔 해제 상태로 시작
    if (userCount <= 1) this.clearAllLocks();
    /* 방에 사람이 있으니 «비어 있던 시각» 은 지운다 — 다음에 다시 비면 그때 새로 찍는다. */
    if (this.emptyAt) { this.emptyAt = 0; void this.state.storage.delete('emptyAt'); }

    // room-joined 는 반드시 물려받은 userId 로 회신한다 — 클라이언트가 이 값이 '직전 vcUserId 와 같은가'
    //   로 "정체성 유지됨 → 살아있는 연결 보존"을 판단한다.
    this.send(effectiveUserId, {
      type: 'room-joined',
      data: { roomId: this.roomId, userId: effectiveUserId, userCount, pdfState: this.pdfState }
    });

    const existingUsers = this.joinedUsers().filter(u => u.userId !== effectiveUserId);
    this.send(effectiveUserId, { type: 'existing-users', data: { users: existingUsers, pdfState: this.pdfState } });

    // 🔁 인계(재연결)면 상대 입장에서 '새 사람'이 아니다 → user-joined 방송과 '입장했습니다' 안내를 생략한다.
    //   (안 그러면 재연결마다 상대 화면에 새 타일이 생기고 "님이 입장했습니다"가 도배된다.)
    if (!inherited) {
      this.broadcast(effectiveUserId, { type: 'user-joined', data: { userId: effectiveUserId, username, role: role || 'student', userCount } });
      // 👁 참관자 전용 신호 — 참관자는 이걸 받고 곧바로 recvonly offer 를 보낸다.
      //    (일반 user-joined 만으로는 클라이언트 안전장치가 3초 기다린 뒤에야 offer 를 낸다)
      for (const other of this.state.getWebSockets()) {
        const oa = this.attOf(other);
        if (oa && oa.role === 'observer' && other.readyState === WebSocket.OPEN) {
          try { other.send(JSON.stringify({ type: 'observer-user-joined', data: { userId: effectiveUserId, username } })); } catch {}
        }
      }
    }

    /* 🖍 (2026-08-08) 지금까지의 칠판 판서를 새 입장자에게 한 번에 돌려준다.
       교재(pdf-sync)와 같은 자리·같은 이유다. 강사가 학생보다 늦게 들어오는 경우가 신고의 핵심. */
    if (this.wbOps.length) {
      this.send(effectiveUserId, { type: 'whiteboard-replay', data: { ops: this.wbOps } });
    }
    /* ✍️ (2026-08-12 Melca) 교재 판서도 돌려준다 — 칠판만 replay 되고 교재는 빠져 있던 구멍 */
    if (this.pdfAnnoOps.length) {
      this.send(effectiveUserId, { type: 'pdf-anno-replay', data: { ops: this.pdfAnnoOps } });
    }
    if (this.pdfState) this.send(effectiveUserId, { type: 'pdf-sync', data: this.pdfState });
    // 🎬 공유 중인 동영상도 새 입장자에게 재전송 (예전엔 방송 1회뿐 → 늦게 온 학생은 영영 못 봄)
    if (this.videoState) this.send(effectiveUserId, { type: 'video-share', data: this.videoState });
    // 🔒 통제 잠금(배경/음소거/집중/필기) 상태를 늦게 입장한 사람에게 즉시 적용.
    //   (2026-08-12 Melca) 켜짐만 보내던 것을 «꺼짐도» 보낸다 — 이전 수업에서 잠금을 겪은
    //   클라이언트는 localStorage/전역에 true 가 굳어 있는데, 「해제됨」 신호가 없으면
    //   교재를 올린 뒤에도 학생 펜이 영영 안 풀리는 것처럼 보였다(8/12 「잠금 해제해도 안 됨」 신고).
    for (const [msgType, key] of Object.entries(VideoCallRoom.LOCK_KEYS)) {
      const lk = !!this.lockState[key];
      this.send(effectiveUserId, { type: msgType, data: { locked: lk, on: lk } });
    }

    if (!inherited) {
      this.broadcastAll({
        type: 'chat-message',
        data: { username: '시스템', message: `${username}님이 입장했습니다.`, timestamp: Date.now(), isSystem: true }
      });
    }

    console.log(`[VideoChat] User ${username} (${effectiveUserId}) joined room ${this.roomId}${inherited ? ' (sticky-reconnect)' : ''}`);
  }

  /* 👁 (2026-08-10) 고스트 참관 — 관리자 「Ghost」 버튼(/?observe=방ID)의 서버 짝.
     [역사] join-observe 는 구 시그널링 DO 시절 프로토콜인데 이 DO 로 옮길 때 핸들러가
     누락돼 default(Unknown message type)로 버려지고 있었다 → 참관 화면이 '연결 중'에서
     영영 멈춤(2026-08-10 신고). 클라이언트(vcJoinAsObserver·vcCreatePeer 의 recvonly
     분기·observer-user-joined 처리)는 이미 완성돼 있어 서버만 채우면 된다.
     [설계 — 투명 유령]
     · 핵심은 joined:false 유지. joinedUsers()/usernameOf() 가 joined 만 세므로 정원·
       userCount·existing-users·퇴장 방송 어디에도 안 나타난다 = 학생·강사 화면 무변화.
       webSocketClose 도 joined 를 보고 건너뛰므로 나갈 때도 조용하다.
     · broadcast() 는 attachment 존재만 보므로 참관자도 방송(user-joined·채팅·잠금…)을
       그대로 받는다. 새 참가자가 참관 중에 들어와도 즉시 observer-user-joined 를 따로
       보내 참관자가 지체 없이 recvonly offer 를 낸다(클라이언트의 user-joined 3초
       안전장치도 이중 백업으로 남는다).
     · 미디어는 참관자→참가자 recvonly offer + 참가자 answer 의 기존 시그널링 그대로 —
       offer/answer/ice 릴레이는 joined 를 요구하지 않는다(실측). 참가자 화면에는 타일이
       생기지 않는다(참관자가 트랙을 안 보내 ontrack 이 안 불림).
     · 수신 전용이라도 mesh 라 참가자(특히 필리핀 강사)의 «업로드»가 참관자 수만큼 늘어난다
       → 동시 참관 인원에 상한을 둔다(초과는 room-full).
     📌 (2026-09-02) 2 → 4 로 올렸다 — 그날 사장님이 대화로 「A > B > C 순서대로 모두」를 지시.
        ⚠️ 그 승인은 «저장소 밖» 사실이라 여기서 확인할 방법이 없다. 근거는 그 대화와 제안서뿐이다.
        근거와 안전장치를 함께 적는다.
        [왜 2 가 모자랐나] 관제탑(수업 관제탑 · 순회 참관)이 생기면서 «사장님 + 한국 매니저 +
          필리핀 매니저» 가 동시에 보는 자리가 실제로 생겼고, 죽은 참관 소켓 하나가 2자리 중
          한 자리를 먹으면 그 순간 실질 1명이 된다(그래서 아래 liveness 청소가 붙어 있다).
        [왜 무한이 아닌가] 참관자 한 명 = 방 안 «각자»의 업로드 한 갈래다. PC 상한 1,200kbps
          기준으로 참관자 4명이면 강사 업로드가 최대 4.8Mbps 늘어난다 — 필리핀 회선에서는
          그 자체가 수업을 깬다. 무한 참관은 mesh 로 풀 수 없고 SFU 가 필요하다(C 안).
        [무엇으로 안전을 «실제로» 벌었나 — 과장하지 않는다]
          ① 관제탑이 «관찰 N/4» 를 본문 글자로 보여 주고, 정원이 차면 참관 버튼을 아예 못 누르게 한다.
          ② 이미 2명 이상이면 🎧 소리만 을 **권한다** — 버튼 강조가 바뀌는 것이지 누르는 동작이
             저절로 바뀌지는 않는다(사람이 여전히 «👁 참관» 을 고를 수 있다).
          ③ **순회 참관 창만은 자동으로** 소리만(`&audio=1`)으로 붙는다 — 그건 사람이 고르는
             자리가 아니라 창 하나가 계속 도는 것이라 우리가 정해도 된다.
          소리만 참관자는 video transceiver 가 inactive 라(영상이 «오지 않는다») 업로드를 거의 안 늘린다.
          ⚠️ 그 선택은 «입장할 때» 정해진다(재협상이 없다) — 그래서 관제탑에서 고른다.
     ⚠️ role 은 클라이언트 신고값이라 보안 경계가 아니다 — join-room 과 같은 전제.
        (감사 기록은 관리자 화면이 /api/admin/ghost/start 로 별도 남긴다.
         강화하려면 ghost/start 가 발급한 단기 토큰을 여기서 검증하는 구조가 필요) */
  private handleJoinObserve(ws: WebSocket, userId: string, data: any): void {
    const OBSERVER_MAX = 4;   // ⚠️ 올릴 때는 위 주석의 «업로드 한 갈래» 계산을 다시 하세요
    // 정원 판정과 관리자 표의 «(관찰 N)» 이 같은 셈법을 쓰도록 helper 하나로 모았다.
    const observers = this.observerCount(ws);
    if (observers >= OBSERVER_MAX) {
      this.send(userId, { type: 'room-full', data: { roomId: this.roomId, limit: OBSERVER_MAX, observe: true } });
      try { ws.close(1000, 'observe-full'); } catch {}
      return;
    }

    const att = this.attOf(ws) || { userId, roomId: this.roomId };
    ws.serializeAttachment({ ...att, userId, roomId: this.roomId, username: (data && data.username) || '관찰자', role: 'observer', joined: false, seenAt: Date.now() } as VcAttachment);
    // 💓 (2026-08-20) 참관자도 청소 대상 — 죽은 참관 소켓이 남으면 정원 2자리를 계속 먹는다.
    this.lastSeen.set(ws, Date.now());
    this.scheduleLivenessAlarm();

    // 참가자 입장(join-room)과 같은 회신 묶음 — 단, 방송은 하나도 하지 않는다(유령).
    const users = this.joinedUsers();
    /* 👁 observers / observerMax — 참관 화면이 «지금 몇 명이 보고 있나» 를 알 수 있게 함께 보낸다.
       (2026-09-02) 상한을 4 로 올리면서 붙였다. 화면은 이 값으로 «회선 부담» 을 안내할 수 있고,
       관제탑은 /api/active-rooms 의 observerCount 로 «들어가기 전에» 같은 것을 판단한다. */
    this.send(userId, { type: 'room-joined', data: { roomId: this.roomId, userId, userCount: users.length, pdfState: this.pdfState, observer: true, observers: observers + 1, observerMax: OBSERVER_MAX } });
    this.send(userId, { type: 'existing-users', data: { users, pdfState: this.pdfState } });
    if (this.wbOps.length) this.send(userId, { type: 'whiteboard-replay', data: { ops: this.wbOps } });
    if (this.pdfAnnoOps.length) this.send(userId, { type: 'pdf-anno-replay', data: { ops: this.pdfAnnoOps } });
    if (this.pdfState) this.send(userId, { type: 'pdf-sync', data: this.pdfState });
    if (this.videoState) this.send(userId, { type: 'video-share', data: this.videoState });
    console.log(`[VideoChat] 👁 Observer joined room ${this.roomId} (uid=${userId}, watching ${users.length})`);
  }

  private handleLeaveRoom(userId: string, exclude?: WebSocket, knownUsername?: string, reason: 'left' | 'dropped' = 'left'): void {
    // 닫히는 소켓이 목록에서 먼저 빠져도 username 을 잃지 않도록 attachment 값을 우선 사용
    const found = this.usernameOf(userId);
    const username = (knownUsername !== undefined) ? knownUsername : found;
    if (username === null || username === undefined) return; // 입장한 적 없음
    const userCount = this.joinedUsers(exclude).length;

    // 📚 (2026-08-06) 방이 비어도 공유 교재/영상은 «지우지 않는다».
    //   예전엔 여기서 지웠다. 그런데 방이 비는 가장 흔한 경우는 수업 종료가 아니라
    //   새로고침·순단(둘 다 잠깐 0명이 된다)이고, 그때마다 강사가 띄워둔 교재가 사라져
    //   재입장 화면이 «다른 교재»가 됐다.
    //   낡은 상태 정리는 다음 입장 시점에 시각(mediaAt)으로 판단한다 — handleJoinRoom 참조.
    if (userCount === 0 && (this.pdfState || this.videoState)) {
      console.log(`[VideoChat] Room ${this.roomId} empty — shared media kept for re-entry (at=${this.mediaAt})`);
    }
    /* 🎬 (2026-08-11 LEN ④) «비기 시작한 시각» 을 찍는다. 다음 첫 입장자가 이 값으로
       «잠깐 나갔다 온 것(초 단위)» 과 «다음 수업(분 단위)» 을 가른다.
       이미 찍혀 있으면 덮지 않는다 — 마지막 한 명이 나간 그 시각이 기준이어야 한다. */
    if (userCount === 0 && !this.emptyAt) {
      this.emptyAt = Date.now();
      void this.state.storage.put('emptyAt', this.emptyAt);
    }
    // 🔒 방이 비면 통제 잠금도 전부 해제 — 다음 수업이 잠긴 채로 시작하지 않게
    if (userCount === 0) this.clearAllLocks();

    this.broadcastAll({ type: 'user-left', data: { userId, username, userCount, reason } }, exclude);
    if (username) {
      this.broadcastAll({
        type: 'chat-message',
        data: {
          username: '시스템',
          message: reason === 'dropped'
            ? `${username}님의 연결이 잠시 끊겼습니다. 재연결을 기다립니다…`
            : `${username}님이 퇴장했습니다.`,
          timestamp: Date.now(), isSystem: true
        }
      }, exclude);
    }
    console.log(`[VideoChat] User ${username} (${userId}) left room ${this.roomId} (${reason})`);
  }

  // 🔒 수업 통제 잠금 공통 처리 — 배경 변경(bg-lock)/전체 음소거(mic-lock)/집중 모드(focus-lock)
  //   판정은 소켓 attachment 의 role 로 한다.
  //   🔴 (2026-09-01 정정) 「학생이 위조 전송해도 무시」라고 적혀 있었지만 **사실이 아닙니다** —
  //      그 role 자체가 클라이언트가 보낸 값입니다(정본 설명은 isStaffAtt 주석).
  private handleClassLock(userId: string, att: VcAttachment, type: string, data: any): void {
    const key = VideoCallRoom.LOCK_KEYS[type];
    if (!key) return;
    const senderRole = (att.role || '').toLowerCase();
    if (!this.isJoined(userId) || (senderRole !== 'teacher' && senderRole !== 'admin')) return;
    /* 잠금 3종은 { locked }, 필기 잠금(pdf-drawlock)은 { on } 을 쓴다(클라이언트가 먼저 그렇게 만들어졌다).
       한쪽 이름만 보면 조용히 «항상 해제»가 되므로 둘 다 받고, 내보낼 때도 둘 다 실어 보낸다. */
    const locked = !!(data && (data.locked ?? data.on));
    this.lockState[key] = locked;
    // 저장 — 잠금 중 재접속/늦은 입장에도 유지 (handleJoinRoom 에서 재전송)
    if (locked) void this.state.storage.put(key, true);
    else void this.state.storage.delete(key);
    this.broadcast(userId, { type, data: { locked, on: locked } });
  }

  private clearAllLocks(): void {
    for (const k of ['bgLock', 'micLock', 'focusLock', 'drawLock'] as const) {
      if (this.lockState[k]) {
        this.lockState[k] = false;
        void this.state.storage.delete(k);
        // (2026-08-12 Melca) 해제를 방송도 한다 — 방이 비며 풀릴 때 남아 있던(참관자 등)
        //   소켓과, 브로드캐스트 직후 재접속한 클라이언트의 stale 잠금 방지. 빈 방이면 no-op.
        for (const [msgType, key] of Object.entries(VideoCallRoom.LOCK_KEYS)) {
          if (key === k) this.broadcastAll({ type: msgType, data: { locked: false, on: false } });
        }
      }
    }
  }

  /* 👁 참관자 귓속말  (2026-08-19 제보 2-③ · 2026-08-26 «학생에게도» 확장)
     ⛔ 어느 쪽이든 «방에 뿌리지» 않는다. 받는 사람 소켓 하나(또는 staff 소켓들)에만 보낸다.
     ⚠️ 참관자 본인에게도 회신(ack)을 돌려준다. 안 그러면 «보냈는지 안 보냈는지» 를 알 수 없어
        같은 말을 여러 번 쓰게 된다(원래 제보가 「보내도 안 보인다」였다).
        ⚠️ ack 에 본문(message)도 실어 보낸다 — 참관자 채팅은 방에 안 뿌려져 «에코» 가 없다.
           그래서 2026-08-26 에 사장님이 「채팅창에 아무것도 안 나타난다」고 하셨다. 화면이
           이 값으로 자기 채팅창에 «보낸 기록» 을 남긴다(public/js/idx-whisper.js).
     ⚠️ 받는 사람이 방에 없으면 delivered:0 을 그대로 알려 준다 — «보낸 척» 하지 않는다. */
  private handleObserverWhisper(userId: string, att: VcAttachment, data: any): void {
    const text = String((data && data.message) || '').trim();
    if (!text) return;
    const body = text.slice(0, 500);
    const at = Date.now();
    const fromName = String(att.username || '관찰자').slice(0, 40);
    const toUserId = String((data && data.toUserId) || '').trim();

    /* 🎯 (2026-08-26 사장님 지시) 대상을 콕 집었으면 «그 한 사람» 에게만 간다 — 학생도 받는다.
       화면에서 채팅 대상 칩(🔒 이름)을 고르면 toUserId 가 실려 온다(idx-main.js vcSendChat).
       ⚠️ 여기서 «학생인가» 를 따로 따지지 않는다 — 강사를 콕 집어 보내는 것도 같은 길이다.
       ⚠️ 학생에게 갈 때는 보낸 사람 이름을 «넘기지 않는다»(from:''). 참관은 인원수·입퇴장
          어디에도 안 나오는 «투명 유령» 설계인데(handleJoinObserve), 낯선 «관찰자» 라는
          이름이 학생 화면에 뜨면 그 설계가 화면에서만 깨진다. 받는 화면이 «사무실» 로 그린다.
       ⛔ broadcast 로 바꾸지 말 것 — 그 순간 학생 전원이 남에게 간 지시를 본다. */
    if (toUserId) {
      const target = this.wsOf(toUserId);
      const ta = target ? this.attOf(target) : null;
      let delivered = 0;
      if (target && ta && ta.joined && target.readyState === WebSocket.OPEN) {
        const staff = this.isStaffAtt(ta);
        const payload = {
          message: body,
          message_type: 'text',
          urgency: 'normal',
          from: staff ? fromName : '',
          at,
          observer: true,
          direct: true,        // 🔒 받는 쪽 이중 방어 ① — «콕 집어 보낸 것» 표시
          to: toUserId,        // 🔒 이중 방어 ② — 내 id 가 아니면 화면이 그리지 않는다
          toStaff: staff,      //    학생용 문구·표시 시간을 가르는 데 쓴다
        };
        try { target.send(JSON.stringify({ type: 'admin-whisper', data: payload })); delivered = 1; }
        catch { /* 소켓 실패는 delivered:0 으로 정직하게 회신된다 */ }
      }
      this.send(userId, {
        type: 'admin-whisper-ack',
        data: { delivered, at, to: toUserId, toName: (ta && ta.username) || '', message: body },
      });
      return;
    }

    // 대상을 안 고르면 지금까지처럼 «방에 있는 강사 전원» 에게 간다.
    const payload = {
      message: body,
      message_type: 'text',
      urgency: 'normal',
      from: fromName,
      at,
      observer: true,
    };
    const jsonMsg = JSON.stringify({ type: 'admin-whisper', data: payload });
    let delivered = 0;
    for (const ws of this.state.getWebSockets()) {
      const a = this.attOf(ws);
      if (!a || !this.isStaffAtt(a)) continue;       // 🔒 학생 차단
      if (ws.readyState !== WebSocket.OPEN) continue;
      try { ws.send(jsonMsg); delivered++; } catch { /* 한 소켓 실패는 무시 */ }
    }
    // 참관자 본인에게 «몇 명에게 갔는지» 회신
    this.send(userId, { type: 'admin-whisper-ack', data: { delivered, at, message: body } });
  }

  private handleChatMessage(userId: string, data: any): void {
    const username = this.usernameOf(userId);
    if (!username) return;
    const { message, toUserId } = data || {};
    if (!message) return;
    // 🔒 개별(1:1) 채팅 — toUserId 가 있으면 대상과 보낸 사람에게만 전달 (다른 참가자는 못 봄)
    if (toUserId) {
      const toUsername = this.usernameOf(toUserId);
      if (toUsername === null) {
        // 대상이 방에 없음 → 보낸 사람에게만 안내
        this.send(userId, {
          type: 'chat-message',
          data: { username: '시스템', message: '상대방이 방에 없어 전달하지 못했어요.', timestamp: Date.now(), isSystem: true }
        });
        return;
      }
      const payload = { username, message, timestamp: Date.now(), isSystem: false, userId, dm: true, toUserId, toUsername: toUsername || '참가자' };
      this.sendTo(toUserId, { type: 'chat-message', data: payload });
      this.send(userId, { type: 'chat-message', data: payload });   // 보낸 사람 에코 (내 화면 표시)
      return;
    }
    this.broadcastAll({
      type: 'chat-message',
      data: { username, message, timestamp: Date.now(), isSystem: false, userId }
    });
  }

  private handleWhiteboardDraw(userId: string, data: any): void {
    if (!this.isJoined(userId)) return;
    this.recordWb('whiteboard-draw', data);
    this.broadcast(userId, { type: 'whiteboard-draw', data });
  }

  /* ✋ (2026-08-10) 필기 잠금 중에는 학생이 칠판을 «지우는» 것도 막는다.
     클라이언트 게이트만으로는 콘솔에서 wbClear() 를 부르면 그만이다 —
     잠금 3종과 같은 이유로 판정은 소켓 attachment 의 role 로 한다.
     🔴 (2026-09-01) 다만 그 role 은 클라이언트가 보낸 값이라 위조를 막지는 못합니다 —
        콘솔에서 wbClear() 를 부르는 것보다는 낫다는 정도입니다(isStaffAtt 주석 참고). */
  private handleWhiteboardClear(userId: string, att: VcAttachment): void {
    if (!this.isJoined(userId)) return;
    if (this.lockState.drawLock && !this.isStaffAtt(att)) return;
    this.wbOps = [];
    this.broadcast(userId, { type: 'whiteboard-clear' });
  }

  /**
   * 소켓 attachment 기준 강사·관리자 판정.
   *
   * 🔴 (2026-09-01 정정) **이 값은 위조를 막지 못합니다.**
   *    오래도록 이 자리에 「학생이 위조 전송해도 통하지 않는다」고 적혀 있었는데 **사실이 아닙니다.**
   *    `att.role` 은 클라이언트가 보낸 `join-room` 메시지의 `data.role` 을 그대로 넣은 값입니다
   *    (handleJoinRoom 의 `role: role || 'student'`). WebSocket 업그레이드 시점(fetch)의
   *    attachment 에는 role 이 아예 없고, 서버가 그 값을 **검증하는 곳이 없습니다.**
   *    즉 학생이 `role:'teacher'` 로 접속하면 이 함수는 true 를 돌려줍니다.
   *
   * ⚠️ 그래서 «클라이언트 가드보다는 낫다» 까지가 이 판정의 정확한 값어치입니다 —
   *    화면 버튼을 감추는 것보다는 낫지만, **권한 검사로 믿으면 안 됩니다.**
   *    이 값 하나로 열리는 것: 교재 공유·중단·페이지 넘김, 잠금 4종, 필기 잠금 중 칠판 지우기.
   *
   * ⛔ 이 주석을 «안전하다» 로 되돌리지 마세요. 거짓 주석이 남아 있던 동안 아무도 여기를
   *    다시 보지 않았습니다(규칙서 2장 「문서에 «고쳤다» 고 적혀 있는데 같은 사고가 또 남」).
   *
   * ✅ 제대로 막으려면 **WS 입장에서 신원을 확인하고 역할을 서버가 붙여야** 합니다
   *    (예약 class_schedules 의 강사·학생과 대조). 그건 「수업이 절대 안 끊김」과 정면으로
   *    부딪히는 변경이라, 막기 전에 «지금 누가 어떤 자격증명으로 들어오는지» 를 로그로
   *    먼저 세어 봐야 합니다. 📄 docs/화상수업DO_점검보고_2026-09-01.md
   */
  private isStaffAtt(att: VcAttachment): boolean {
    const r = (att?.role || '').toLowerCase();
    return r === 'teacher' || r === 'admin';
  }

  /* 🖍 (2026-08-08 Ana③ · Kes① 「학생 펜이 강사 화면에 안 보인다」)
   *  칠판은 «지금 연결된 사람에게만 중계» 였다 — 늦게 들어오거나 새로고침한 사람에게는
   *  그때까지 그려진 것이 하나도 가지 않는다. 교재(pdfState)는 이미 이렇게 재전송하고 있는데
   *  칠판만 빠져 있었다. 강사가 학생보다 늦게 들어오면(=신고 상황) 학생 판서가 통째로 안 보인다.
   *  ⚠️ storage 에 넣지 않는다 — 획은 수천 개까지 늘어나고, 수업이 끝나면 값어치가 없다.
   *  🔴 (2026-09-01 정정) 「DO 가 잠들면 사라지는 것이 맞다(그때는 방도 비어 있다)」고
   *     적혀 있었는데 **뒷말이 사실이 아닙니다.** 이 DO 는 WebSocket Hibernation 을 쓰고
   *     (생성자의 setWebSocketAutoResponse, webSocketMessage/Close 핸들러), Hibernation 의
   *     요점이 바로 **소켓이 붙어 있는 채로 인스턴스를 내리는 것**입니다.
   *     즉 방이 비지 않아도 잠들 수 있고, 깨어나면 이 버퍼는 빈 상태입니다
   *     (생성자가 복원하는 것은 pdfState·videoState·mediaAt·emptyAt·잠금 4종뿐).
   *     ⟹ 수업 중에 학생이 새로고침하거나 늦게 들어오면 그때까지 그려진 것이 안 갑니다 —
   *        2026-08-08 에 고치려던 그 증상이 «잠들었다 깨어난 뒤» 에는 다시 납니다.
   *     ⚠️ 얼마나 자주 잠드는지는 측정하지 못했습니다(Cloudflare 가 정하고 로그로만 보입니다).
   */
  private recordWb(type: string, data: any): void {
    try {
      if (!data) return;
      this.wbOps.push({ t: type, d: data });
      if (this.wbOps.length > VideoCallRoom.WB_OPS_MAX) {
        this.wbOps.splice(0, this.wbOps.length - VideoCallRoom.WB_OPS_MAX);
      }
    } catch {}
  }

  /* ✍️ (2026-08-12 Melca) 교재 판서 기록 — 점은 획 안에 압축, 사라지는 펜은 제외.
     clear/undo 는 순서대로 함께 기록해 재생 시 같은 결과가 나오게 한다. */
  private recordPdfAnno(type: string, data: any): void {
    try {
      if (!data) return;
      if (type === 'pdf-anno-start') {
        if (data.tool === 'vanish') return;
        const s = { page: data.page, tool: data.tool, color: data.color, size: data.size, id: data.id, points: [data.point] };
        this.pdfAnnoOps.push({ t: 'stroke', d: s });
        if (data.id != null) this.pdfAnnoStrokes[data.id] = s;
      } else if (type === 'pdf-anno-point') {
        const s = (data.id != null) ? this.pdfAnnoStrokes[data.id] : null;
        if (s) s.points.push(data.point);
      } else if (type === 'pdf-anno-text' || type === 'pdf-anno-shape'
              || type === 'pdf-anno-clear' || type === 'pdf-anno-undo') {
        this.pdfAnnoOps.push({ t: type, d: data });
      }
      if (this.pdfAnnoOps.length > VideoCallRoom.PDF_ANNO_OPS_MAX) {
        const dropped = this.pdfAnnoOps.splice(0, this.pdfAnnoOps.length - VideoCallRoom.PDF_ANNO_OPS_MAX);
        for (const o of dropped) { if (o.t === 'stroke' && o.d && o.d.id != null) delete this.pdfAnnoStrokes[o.d.id]; }
      }
    } catch {}
  }

  // 📎 (2026-08-12 Melca) 교재/영상 공유·중지는 반 전체를 움직인다 — pdf-page-change 와
  //   같은 이유로 '강사/관리자만'. 클라이언트는 버튼을 숨기지만(붙여넣기 게이트 포함)
  //   콘솔에서 vcConn.send 를 직접 쏘면 학생이 반 전체 교재·영상을 갈아치울 수 있었다.
  private staffOnly(userId: string, att: VcAttachment): boolean {
    const senderRole = (att?.role || '').toLowerCase();
    return this.isJoined(userId) && (senderRole === 'teacher' || senderRole === 'admin');
  }

  private async handlePdfShare(userId: string, att: VcAttachment, data: any): Promise<void> {
    if (!this.staffOnly(userId, att)) return;
    const { url, currentPage, kind, name } = data || {};
    if (!url) return;
    // ✍️ 교재가 «다른 것» 으로 바뀌면 이전 교재의 판서 버퍼는 버린다 (페이지 번호가 다른 책과 섞임)
    if (this.pdfState && this.pdfState.url !== url) { this.pdfAnnoOps = []; this.pdfAnnoStrokes = {}; }
    this.pdfState = { url, currentPage: currentPage || 1, kind: kind || '', name: name || '' };
    this.mediaAt = Date.now();
    await this.state.storage.put('pdfState', this.pdfState);
    await this.state.storage.put('mediaAt', this.mediaAt);
    this.broadcast(userId, { type: 'pdf-sync', data: this.pdfState });
    console.log(`[VideoChat] PDF shared in room ${this.roomId}: ${url}`);
  }

  // 📖 교재 페이지 이동 — 수업 전체에 방송되고 DO 에 저장되므로 '강사/관리자만'.
  //   클라이언트 가드(화살표 키)는 우회 가능하므로 권한 판정은 소켓 attachment 의 role 로 한다.
  //   🔴 (2026-09-01) 그 role 도 클라이언트가 보낸 값이라 위조는 못 막습니다(isStaffAtt 주석 참고).
  //   (handleClassLock 과 동일한 패턴)
  private async handlePdfPageChange(userId: string, att: VcAttachment, data: any): Promise<void> {
    const senderRole = (att.role || '').toLowerCase();
    if (!this.isJoined(userId) || (senderRole !== 'teacher' && senderRole !== 'admin')) return;
    const pageNum = (typeof data === 'number') ? data
      : (typeof data?.pageNum === 'number' ? data.pageNum
        : (typeof data?.currentPage === 'number' ? data.currentPage : NaN));
    if (typeof pageNum !== 'number' || isNaN(pageNum)) return;
    if (this.pdfState) {
      this.pdfState.currentPage = pageNum;
      // 페이지를 넘기는 것도 «수업이 진행 중»이라는 증거 → 보존 시계를 다시 감는다.
      this.mediaAt = Date.now();
      await this.state.storage.put('pdfState', this.pdfState);
      await this.state.storage.put('mediaAt', this.mediaAt);
    }
    this.broadcast(userId, { type: 'pdf-page-change', data: { pageNum, currentPage: pageNum } });
  }

  private async handlePdfStopShare(userId: string, att: VcAttachment): Promise<void> {
    if (!this.staffOnly(userId, att)) return;
    this.pdfState = null;
    await this.state.storage.delete('pdfState');
    this.broadcast(userId, { type: 'pdf-stop-share' });
    console.log(`[VideoChat] PDF sharing stopped in room ${this.roomId}`);
  }

  private async handleVideoShare(userId: string, att: VcAttachment, data: any): Promise<void> {
    if (!this.staffOnly(userId, att)) return;
    const { url, type } = data || {};
    if (!url) return;
    // blob: URL 은 공유한 기기에서만 열 수 있으므로 상태로 저장하지 않음 (중계만)
    if (!/^blob:/i.test(url)) {
      this.videoState = { url, type: type || '' };
      this.mediaAt = Date.now();
      await this.state.storage.put('videoState', this.videoState);
      await this.state.storage.put('mediaAt', this.mediaAt);
    }
    this.broadcast(userId, { type: 'video-share', data });
    console.log(`[VideoChat] Video shared in room ${this.roomId}: ${url}`);
  }

  private async handleVideoStopShare(userId: string, att: VcAttachment): Promise<void> {
    if (!this.staffOnly(userId, att)) return;
    this.videoState = null;
    await this.state.storage.delete('videoState');
    this.broadcast(userId, { type: 'video-stop-share', data: {} });
  }

  private handleOffer(userId: string, data: any): void {
    const target = data?.targetUserId || data?.to;
    const sdp = data?.sdp || data?.offer;
    if (!target || !sdp) return;
    /* 👁 (2026-09-01 사장님 「수업 관찰 할 때 참가자가 안 보이게」) 참관자의 offer 임을 표시한다.
       [무엇이 잘못돼 있었나] usernameOf() 는 «입장한(joined) 사람» 만 이름을 돌려주는데,
       참관자는 handleJoinObserve 가 **일부러** joined:false 로 붙인다(«투명 유령» 설계).
       그래서 참관자가 보내는 recvonly offer 가 여기서 이름이 «참가자» 로 **지어져** 나갔고,
       받는 화면(js/idx-main.js vcHandleOffer)이 그 이름 그대로 피어를 만들었다
       → 강사 화면에 이름표가 「참가자」인 검은 칸이 생겼다. 인원수·입퇴장에는 안 나오는데
         얼굴 칸에만 나오니, 유령 설계가 «화면에서만» 깨진 상태였다.
       ⛔ 다른 이름(«관찰자» 등)으로 바꿔서 풀지 말 것 — 참관자는 이름이 «있으면» 안 된다.
       ⚠️ 이 표시를 지우면 화면 쪽 가드(js/vc-observe-guard.js ⑩절)가 판정 근거를 잃는다.
          그 가드는 추측하지 않고 **서버가 참관자라고 말한 id 만** 거른다. */
    const ws = this.wsOf(userId);
    const att = ws ? this.attOf(ws) : null;
    const fromObserver = String((att && att.role) || '').toLowerCase() === 'observer';
    this.sendTo(target, {
      type: 'offer',
      data: {
        fromUserId: userId,
        fromUsername: fromObserver ? '' : (this.usernameOf(userId) || '참가자'),
        fromObserver,
        sdp,
      },
    });
  }

  private handleAnswer(userId: string, data: any): void {
    const target = data?.targetUserId || data?.to;
    const sdp = data?.sdp || data?.answer;
    if (!target || !sdp) return;
    this.sendTo(target, { type: 'answer', data: { fromUserId: userId, sdp } });
  }

  private handleIceCandidate(userId: string, data: any): void {
    const target = data?.targetUserId || data?.to;
    const candidate = data?.candidate;
    if (!target || !candidate) return;
    this.sendTo(target, { type: 'ice-candidate', data: { fromUserId: userId, candidate } });
  }

  // ── 헬퍼 ──
  private attOf(ws: WebSocket): VcAttachment | null {
    try { return ws.deserializeAttachment() as VcAttachment; } catch { return null; }
  }

  private joinedUsers(exclude?: WebSocket): { userId: string; username: string; role?: string }[] {
    const out: { userId: string; username: string; role?: string }[] = [];
    for (const ws of this.state.getWebSockets()) {
      if (ws === exclude) continue;
      if (ws.readyState !== WebSocket.OPEN) continue;   // 닫히는 중/닫힌 소켓(재연결 좀비 등)은 로스터에서 제외
      const att = this.attOf(ws);
      if (att && att.joined && att.username) out.push({ userId: att.userId, username: att.username, role: att.role });
    }
    return out;
  }

  /** 👁 붙어 있는 참관자 수. joinedUsers() 와 짝 — 저쪽은 joined 만, 이쪽은 role==='observer' 만 센다.
   *  참관자는 joined:false 라서 로스터 어디에도 안 나타나므로(투명 유령), 세는 길이 따로 필요하다. */
  private observerCount(exclude?: WebSocket): number {
    let n = 0;
    for (const ws of this.state.getWebSockets()) {
      if (ws === exclude) continue;
      if (ws.readyState !== WebSocket.OPEN) continue;
      const att = this.attOf(ws);
      if (att && att.role === 'observer') n++;
    }
    return n;
  }

  private isJoined(userId: string): boolean {
    return this.usernameOf(userId) !== null;
  }

  // 입장한 사용자면 username(빈문자 가능) 반환, 아니면 null
  private usernameOf(userId: string): string | null {
    for (const ws of this.state.getWebSockets()) {
      const att = this.attOf(ws);
      if (att && att.userId === userId && att.joined) return att.username || '';
    }
    return null;
  }

  private wsOf(userId: string): WebSocket | null {
    for (const ws of this.state.getWebSockets()) {
      if (this.attOf(ws)?.userId === userId) return ws;
    }
    return null;
  }

  private send(userId: string, msg: WebSocketMessage): void {
    const ws = this.wsOf(userId);
    if (ws && ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify(msg)); } catch {} }
  }

  private sendTo(targetId: string, msg: WebSocketMessage): void {
    this.send(targetId, msg);
  }

  private broadcast(excludeId: string, msg: WebSocketMessage): void {
    const jsonMsg = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      const att = this.attOf(ws);
      if (att && att.userId !== excludeId && ws.readyState === WebSocket.OPEN) {
        try { ws.send(jsonMsg); } catch {}
      }
    }
  }

  private broadcastAll(msg: WebSocketMessage, exclude?: WebSocket): void {
    const jsonMsg = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      if (ws === exclude) continue;
      if (ws.readyState === WebSocket.OPEN) { try { ws.send(jsonMsg); } catch {} }
    }
  }

  private generateUserId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
