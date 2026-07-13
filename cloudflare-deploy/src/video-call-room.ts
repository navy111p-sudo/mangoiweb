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

  constructor(state: DurableObjectState) {
    this.state = state;
    this.roomId = '';
    // 재기동 시 교재 공유 상태 복원
    this.state.blockConcurrencyWhile(async () => {
      this.pdfState = (await this.state.storage.get<PdfShareData>('pdfState')) || null;
      this.videoState = (await this.state.storage.get<{ url: string; type?: string }>('videoState')) || null;
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
        JSON.stringify({ roomId: this.roomId, userCount: users.length, users, pdfState: this.pdfState, videoState: this.videoState }),
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
        case 'pdf-page-change': await this.handlePdfPageChange(userId, msg.data as any); break;
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
          if (this.isJoined(userId)) this.broadcast(userId, { type: msg.type, data: msg.data });
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
    if (att && att.joined) this.handleLeaveRoom(att.userId, ws, att.username, code === 1000 ? 'left' : 'dropped');
    try { ws.close(code, reason); } catch {}
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    const att = this.attOf(ws);
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
    if (clientId) {
      for (const other of this.state.getWebSockets()) {
        if (other === ws) continue;
        const oa = this.attOf(other);
        if (oa && oa.clientId && oa.clientId === clientId) {
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

    // attachment 에 사용자명/joined 기록 (재기동에도 유지)
    const att = this.attOf(ws) || { userId, roomId: this.roomId };
    ws.serializeAttachment({ ...att, userId, roomId: this.roomId, username, role: role || 'student', joined: true, clientId: clientId || att.clientId } as VcAttachment);

    const userCount = this.joinedUsers().length;

    this.send(userId, {
      type: 'room-joined',
      data: { roomId: this.roomId, userId, userCount, pdfState: this.pdfState }
    });

    const existingUsers = this.joinedUsers().filter(u => u.userId !== userId);
    this.send(userId, { type: 'existing-users', data: { users: existingUsers, pdfState: this.pdfState } });

    this.broadcast(userId, { type: 'user-joined', data: { userId, username, role: role || 'student', userCount } });

    if (this.pdfState) this.send(userId, { type: 'pdf-sync', data: this.pdfState });
    // 🎬 공유 중인 동영상도 새 입장자에게 재전송 (예전엔 방송 1회뿐 → 늦게 온 학생은 영영 못 봄)
    if (this.videoState) this.send(userId, { type: 'video-share', data: this.videoState });

    this.broadcastAll({
      type: 'chat-message',
      data: { username: '시스템', message: `${username}님이 입장했습니다.`, timestamp: Date.now(), isSystem: true }
    });

    console.log(`[VideoChat] User ${username} (${userId}) joined room ${this.roomId}`);
  }

  private handleLeaveRoom(userId: string, exclude?: WebSocket, knownUsername?: string, reason: 'left' | 'dropped' = 'left'): void {
    // 닫히는 소켓이 목록에서 먼저 빠져도 username 을 잃지 않도록 attachment 값을 우선 사용
    const found = this.usernameOf(userId);
    const username = (knownUsername !== undefined) ? knownUsername : found;
    if (username === null || username === undefined) return; // 입장한 적 없음
    const userCount = this.joinedUsers(exclude).length;

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

  private async handlePdfPageChange(userId: string, data: any): Promise<void> {
    if (!this.isJoined(userId)) return;
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
