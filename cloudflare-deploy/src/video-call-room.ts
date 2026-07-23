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

interface VcAttachment {
  userId: string;
  roomId: string;
  username?: string;
  role?: string;
  joined?: boolean;
  clientId?: string;   // 브라우저 탭 안정 식별자 — 재연결 좀비 소켓 dedup 키
}

export class VideoCallRoom {
  private state: DurableObjectState;
  private roomId: string;
  private pdfState: PdfShareData | null = null;
  // 🎬 동영상 공유 상태 — pdfState 와 동일하게 저장해야 늦게 입장한 학생도 영상을 받음
  private videoState: { url: string; type?: string } | null = null;
  // 🔒 강사의 수업 통제 잠금 3종(배경 변경/전체 음소거/집중 모드)
  //   — 저장해야 늦게 입장/재접속한 학생에게도 적용됨. 방이 비면 자동 해제.
  private lockState: { bgLock: boolean; micLock: boolean; focusLock: boolean } = { bgLock: false, micLock: false, focusLock: false };
  private static readonly LOCK_KEYS: Record<string, 'bgLock' | 'micLock' | 'focusLock'> =
    { 'bg-lock': 'bgLock', 'mic-lock': 'micLock', 'focus-lock': 'focusLock' };

  // 🔁 (2026-07-24) 무중단 재연결 스위치. wrangler.toml 의 VC_STICKY_UID='on' 일 때만 켜진다.
  //   기본값은 꺼짐 → 아래 인계 로직을 전부 건너뛰고 예전과 100% 동일하게 동작한다.
  //   서버 변수 하나로 클라 재배포 없이 즉시 원복 가능(문제 시 'off' 로 바꾸고 재배포).
  private stickyUid: boolean = false;

  constructor(state: DurableObjectState, env?: any) {
    this.state = state;
    this.roomId = '';
    try { this.stickyUid = !!(env && env.VC_STICKY_UID === 'on'); } catch { this.stickyUid = false; }
    // 재기동 시 교재 공유 상태 복원
    this.state.blockConcurrencyWhile(async () => {
      this.pdfState = (await this.state.storage.get<PdfShareData>('pdfState')) || null;
      this.videoState = (await this.state.storage.get<{ url: string; type?: string }>('videoState')) || null;
      for (const k of ['bgLock', 'micLock', 'focusLock'] as const) {
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
      server.serializeAttachment({ userId, roomId: this.roomId, joined: false } as VcAttachment);
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    // 관리자/active-rooms 용 상태 조회
    if (url.pathname === '/status') {
      const users = this.joinedUsers();
      return new Response(
        JSON.stringify({ roomId: this.roomId, userCount: users.length, users, pdfState: this.pdfState, videoState: this.videoState, bgLock: this.lockState.bgLock, locks: this.lockState }),
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

    return new Response('Invalid request', { status: 400 });
  }

  // ── Hibernation 핸들러 ──
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const att = this.attOf(ws);
      if (!att) return;
      if (att.roomId) this.roomId = att.roomId;
      const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
      const msg: WebSocketMessage = JSON.parse(text);
      const userId = att.userId;

      switch (msg.type) {
        case 'join-room':       this.handleJoinRoom(ws, userId, msg.data as any); break;
        case 'leave-room':
          this.handleLeaveRoom(userId, ws, att.username, 'left');
          // 뒤따르는 소켓 close 가 같은 사용자를 또 'user-left' 로 방송하지 않도록 선반영
          try { ws.serializeAttachment({ ...att, joined: false } as VcAttachment); } catch {}
          break;
        case 'chat-message':    this.handleChatMessage(userId, msg.data as any); break;
        case 'whiteboard-draw': this.handleWhiteboardDraw(userId, msg.data as any); break;
        case 'whiteboard-clear':this.handleWhiteboardClear(userId); break;
        case 'pdf-share':       await this.handlePdfShare(userId, msg.data as any); break;
        case 'pdf-page-change': await this.handlePdfPageChange(userId, att, msg.data as any); break;
        case 'pdf-stop-share':  await this.handlePdfStopShare(userId); break;
        case 'video-share':
        case 'video-sync':      await this.handleVideoShare(userId, msg.data as any); break;
        case 'video-stop-share':await this.handleVideoStopShare(userId); break;
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
        case 'cam-state':            // 📷 (2026-07-24) 카메라 on/off 를 상대에게 알림.
                                     //   이게 없으면 수신측은 '상대가 껐다' 와 '회선이 나빠 영상만 죽었다' 를
                                     //   구분할 수 없어, 자가복구 워치독이 정상 상태를 장애로 오인해
                                     //   6초마다 연결을 다시 맺으며 화면을 깜빡이게 만든다.
          if (this.isJoined(userId)) this.broadcast(userId, { type: msg.type, data: msg.data });
          break;
        case 'bg-lock':              // 🔒 강사 → 학생 수업 통제 잠금 3종 (공통 처리)
        case 'mic-lock':             //    🎤 전체 음소거
        case 'focus-lock':           //    🎯 집중 모드(학생 탭 이탈 금지)
          this.handleClassLock(userId, att, msg.type, msg.data as any);
          break;
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

    if (this.joinedUsers().length >= MAX_USERS) {
      this.send(userId, { type: 'room-full', data: { roomId: this.roomId } });
      try { ws.close(1000, 'room-full'); } catch {}
      return;
    }

    // attachment 에 사용자명/joined 기록 (재기동에도 유지) — 인계 시엔 물려받은 userId 사용
    const att = this.attOf(ws) || { userId: effectiveUserId, roomId: this.roomId };
    ws.serializeAttachment({ ...att, userId: effectiveUserId, roomId: this.roomId, username, role: role || 'student', joined: true, clientId: clientId || att.clientId } as VcAttachment);

    const userCount = this.joinedUsers().length;

    // 🧹 (2026-07-20) 첫 입장자(방에 나 혼자)에게 지난 수업의 잔존 공유 상태를 재전송하지 않는다.
    //   방이 빈 뒤에도 pdfState/videoState 가 storage 에 남아, 다음 수업 입장 첫 화면을 며칠 전
    //   교재/유튜브가 차지하고 '학생 배정 교재 자동 로드'(_vcShownVideoUrl 존중 로직)까지 막았음.
    //   사장님 지시: 수업 입장 첫 화면 = 해당 학생의 배정 교재. 진행 중 수업에 늦게 합류한
    //   참가자(기존 참가자 존재)에게는 지금처럼 현재 공유 상태를 그대로 재전송한다.
    if (userCount <= 1 && (this.pdfState || this.videoState)) {
      this.pdfState = null;
      this.videoState = null;
      void this.state.storage.delete('pdfState');
      void this.state.storage.delete('videoState');
      console.log(`[VideoChat] Stale shared media cleared on first join in room ${this.roomId}`);
    }
    // 🔒 지난 수업의 통제 잠금(배경/음소거/집중)도 새 수업 첫 입장 시엔 해제 상태로 시작
    if (userCount <= 1) this.clearAllLocks();

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
    }

    if (this.pdfState) this.send(effectiveUserId, { type: 'pdf-sync', data: this.pdfState });
    // 🎬 공유 중인 동영상도 새 입장자에게 재전송 (예전엔 방송 1회뿐 → 늦게 온 학생은 영영 못 봄)
    if (this.videoState) this.send(effectiveUserId, { type: 'video-share', data: this.videoState });
    // 🔒 통제 잠금(배경/음소거/집중) 중이면 늦게 입장한 학생에게도 즉시 적용
    for (const [msgType, key] of Object.entries(VideoCallRoom.LOCK_KEYS)) {
      if (this.lockState[key]) this.send(effectiveUserId, { type: msgType, data: { locked: true } });
    }

    if (!inherited) {
      this.broadcastAll({
        type: 'chat-message',
        data: { username: '시스템', message: `${username}님이 입장했습니다.`, timestamp: Date.now(), isSystem: true }
      });
    }

    console.log(`[VideoChat] User ${username} (${effectiveUserId}) joined room ${this.roomId}${inherited ? ' (sticky-reconnect)' : ''}`);
  }

  private handleLeaveRoom(userId: string, exclude?: WebSocket, knownUsername?: string, reason: 'left' | 'dropped' = 'left'): void {
    // 닫히는 소켓이 목록에서 먼저 빠져도 username 을 잃지 않도록 attachment 값을 우선 사용
    const found = this.usernameOf(userId);
    const username = (knownUsername !== undefined) ? knownUsername : found;
    if (username === null || username === undefined) return; // 입장한 적 없음
    const userCount = this.joinedUsers(exclude).length;

    // 🧹 (2026-07-20) 마지막 참가자까지 나가 방이 비면 공유 상태(pdfState/videoState)도 함께 정리.
    //   다음 수업이 지난 수업의 교재/동영상으로 시작하지 않게 함(첫 화면 = 배정 교재 보장의 짝 수정).
    //   'dropped'(순단)로 비어도 지우지만, 재입장 시 클라이언트가 배정 교재를 자동 로드하므로 무해.
    if (userCount === 0 && (this.pdfState || this.videoState)) {
      this.pdfState = null;
      this.videoState = null;
      void this.state.storage.delete('pdfState');
      void this.state.storage.delete('videoState');
      console.log(`[VideoChat] Shared media cleared — room ${this.roomId} is now empty`);
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
  //   학생이 위조 전송해도 무시: 소켓 attachment 의 role 로만 판정한다.
  private handleClassLock(userId: string, att: VcAttachment, type: string, data: any): void {
    const key = VideoCallRoom.LOCK_KEYS[type];
    if (!key) return;
    const senderRole = (att.role || '').toLowerCase();
    if (!this.isJoined(userId) || (senderRole !== 'teacher' && senderRole !== 'admin')) return;
    const locked = !!(data && data.locked);
    this.lockState[key] = locked;
    // 저장 — 잠금 중 재접속/늦은 입장에도 유지 (handleJoinRoom 에서 재전송)
    if (locked) void this.state.storage.put(key, true);
    else void this.state.storage.delete(key);
    this.broadcast(userId, { type, data: { locked } });
  }

  private clearAllLocks(): void {
    for (const k of ['bgLock', 'micLock', 'focusLock'] as const) {
      if (this.lockState[k]) {
        this.lockState[k] = false;
        void this.state.storage.delete(k);
      }
    }
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
    this.broadcast(userId, { type: 'whiteboard-draw', data });
  }

  private handleWhiteboardClear(userId: string): void {
    if (!this.isJoined(userId)) return;
    this.broadcast(userId, { type: 'whiteboard-clear' });
  }

  private async handlePdfShare(userId: string, data: any): Promise<void> {
    if (!this.isJoined(userId)) return;
    const { url, currentPage, kind, name } = data || {};
    if (!url) return;
    this.pdfState = { url, currentPage: currentPage || 1, kind: kind || '', name: name || '' };
    await this.state.storage.put('pdfState', this.pdfState);
    this.broadcast(userId, { type: 'pdf-sync', data: this.pdfState });
    console.log(`[VideoChat] PDF shared in room ${this.roomId}: ${url}`);
  }

  // 📖 교재 페이지 이동 — 수업 전체에 방송되고 DO 에 저장되므로 '강사/관리자만'.
  //   클라이언트 가드(화살표 키)는 우회 가능하므로 권한 판정은 소켓 attachment 의 role 로만 한다.
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
      await this.state.storage.put('pdfState', this.pdfState);
    }
    this.broadcast(userId, { type: 'pdf-page-change', data: { pageNum, currentPage: pageNum } });
  }

  private async handlePdfStopShare(userId: string): Promise<void> {
    if (!this.isJoined(userId)) return;
    this.pdfState = null;
    await this.state.storage.delete('pdfState');
    this.broadcast(userId, { type: 'pdf-stop-share' });
    console.log(`[VideoChat] PDF sharing stopped in room ${this.roomId}`);
  }

  private async handleVideoShare(userId: string, data: any): Promise<void> {
    if (!this.isJoined(userId)) return;
    const { url, type } = data || {};
    if (!url) return;
    // blob: URL 은 공유한 기기에서만 열 수 있으므로 상태로 저장하지 않음 (중계만)
    if (!/^blob:/i.test(url)) {
      this.videoState = { url, type: type || '' };
      await this.state.storage.put('videoState', this.videoState);
    }
    this.broadcast(userId, { type: 'video-share', data });
    console.log(`[VideoChat] Video shared in room ${this.roomId}: ${url}`);
  }

  private async handleVideoStopShare(userId: string): Promise<void> {
    if (!this.isJoined(userId)) return;
    this.videoState = null;
    await this.state.storage.delete('videoState');
    this.broadcast(userId, { type: 'video-stop-share', data: {} });
  }

  private handleOffer(userId: string, data: any): void {
    const target = data?.targetUserId || data?.to;
    const sdp = data?.sdp || data?.offer;
    if (!target || !sdp) return;
    this.sendTo(target, { type: 'offer', data: { fromUserId: userId, fromUsername: this.usernameOf(userId) || '참가자', sdp } });
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
