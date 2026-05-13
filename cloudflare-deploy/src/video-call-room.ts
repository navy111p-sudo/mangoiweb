/**
 * video-call-room.ts - Durable Object for multi-user video call
 * Handles: join-room, leave-room, chat-message, whiteboard-draw, whiteboard-clear, pdf-share, pdf-page-change
 * Max 10 users per room
 */

import { WebSocketMessage, ConnectionInfo, PdfShareData } from './types';

const MAX_USERS = 10;

interface RoomUser {
  userId: string;
  username: string;
}

interface VideoChatRoomState {
  connections: Map<string, ConnectionInfo>;
  users: Map<string, RoomUser>;
  pdfState: PdfShareData | null;
  roomId: string;
}

export class VideoCallRoom {
  private state: DurableObjectState;
  private roomId: string;
  private connections: Map<string, ConnectionInfo> = new Map();
  private users: Map<string, RoomUser> = new Map();
  private pdfState: PdfShareData | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.roomId = '';
  }

  async fetch(request: Request): Promise<Response> {
    // Durable Object ID는 hex 문자열이므로 URL로 파싱할 수 없습니다.
    const url = new URL(request.url);
    const roomIdParam = url.searchParams.get('roomId');
    if (roomIdParam) this.roomId = roomIdParam;

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    // 관리자/active-rooms 용 상태 조회 HTTP 핸들러
    // /status → { roomId, userCount, users: [{userId, username}] }
    if (url.pathname === '/status') {
      const users = Array.from(this.users.entries()).map(([userId, u]) => ({
        userId,
        username: u.username,
      }));
      return new Response(
        JSON.stringify({
          roomId: this.roomId,
          userCount: this.users.size,
          users,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 🛑 관리자 강제 종료 HTTP 핸들러 (Phase 4)
    //   - 모든 연결에 { type: 'force_end', reason, by: 'admin' } 브로드캐스트
    //   - 이후 우아하게 close(1000). 클라이언트는 이 메시지를 받고 방을 떠나면 됨.
    if (url.pathname === '/force-end' && request.method === 'POST') {
      const reason = url.searchParams.get('reason') || '관리자가 수업을 종료했습니다.';
      const msg = JSON.stringify({ type: 'force_end', reason, by: 'admin', at: Date.now() });
      let notified = 0;
      for (const conn of this.connections.values()) {
        try { conn.ws.send(msg); notified++; } catch {}
      }
      for (const conn of this.connections.values()) {
        try { conn.ws.close(1000, 'admin force end'); } catch {}
      }
      return new Response(
        JSON.stringify({ ok: true, roomId: this.roomId, notified, reason }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response('Invalid request', { status: 400 });
  }

  private handleWebSocket(request: Request): Response {
    const userId = this.generateUserId();
    const { 0: client, 1: server } = new WebSocketPair();

    server.accept();
    server.addEventListener('message', (event: MessageEvent) => {
      this.onMessage(userId, event.data);
    });
    server.addEventListener('close', () => {
      this.onClose(userId);
    });
    server.addEventListener('error', () => {
      this.onClose(userId);
    });

    this.connections.set(userId, { socketId: userId, roomId: this.roomId, ws: server });

    return new Response(null, { status: 101, webSocket: client });
  }

  private onMessage(userId: string, rawData: string): void {
    try {
      const msg: WebSocketMessage = JSON.parse(rawData);
      const conn = this.connections.get(userId);
      if (!conn) return;

      switch (msg.type) {
        case 'join-room':
          this.handleJoinRoom(userId, msg.data as any);
          break;
        case 'leave-room':
          this.handleLeaveRoom(userId);
          break;
        case 'chat-message':
          this.handleChatMessage(userId, msg.data as any);
          break;
        case 'whiteboard-draw':
          this.handleWhiteboardDraw(userId, msg.data as any);
          break;
        case 'whiteboard-clear':
          this.handleWhiteboardClear(userId);
          break;
        case 'pdf-share':
          this.handlePdfShare(userId, msg.data as any);
          break;
        case 'pdf-page-change':
          this.handlePdfPageChange(userId, msg.data as any);
          break;
        case 'pdf-stop-share':
          this.handlePdfStopShare(userId);
          break;
        // 📹 동영상 / 일반 웹사이트 URL 공유 (Phase 12 후속 핫픽스)
        //   클라이언트는 vcConn.send({type:'video-share', data:{url, type}}) 로 송신.
        //   여기서 다른 참가자에게 그대로 전달 — vpLoadUrlRemote 가 iframe 으로 표시.
        case 'video-share':
        case 'video-sync':
          this.broadcast(userId, { type: 'video-share', data: msg.data });
          break;
        case 'video-stop-share':
          this.broadcast(userId, { type: 'video-stop-share', data: {} });
          break;
        case 'offer':
          this.handleOffer(userId, msg.data as any);
          break;
        case 'answer':
          this.handleAnswer(userId, msg.data as any);
          break;
        case 'ice-candidate':
          this.handleIceCandidate(userId, msg.data as any);
          break;
        default:
          console.warn(`Unknown message type: ${msg.type}`);
      }
    } catch (err) {
      console.error('Message parse error:', err);
    }
  }

  private handleJoinRoom(userId: string, data: any): void {
    const { roomId, username } = data;
    if (!username) {
      this.send(userId, { type: 'error-msg', data: { message: 'username required' } });
      return;
    }

    if (this.users.size >= MAX_USERS) {
      this.send(userId, { type: 'room-full', data: { roomId: this.roomId } });
      return;
    }

    const user: RoomUser = { userId, username };
    this.users.set(userId, user);

    // Send room-joined to new user (include own userId + userCount + pdfState)
    this.send(userId, {
      type: 'room-joined',
      data: {
        roomId: this.roomId,
        userId,
        userCount: this.users.size,
        pdfState: this.pdfState
      }
    });

    // Send existing users to new user (wrapped as { users: [...] })
    const existingUsers = Array.from(this.users.values())
      .filter(u => u.userId !== userId)
      .map(u => ({ userId: u.userId, username: u.username }));

    this.send(userId, {
      type: 'existing-users',
      data: { users: existingUsers, pdfState: this.pdfState }
    });

    // Notify others of new user (include userCount)
    this.broadcast(userId, {
      type: 'user-joined',
      data: { userId, username, userCount: this.users.size }
    });

    // Sync current PDF state if sharing
    if (this.pdfState) {
      this.send(userId, {
        type: 'pdf-sync',
        data: this.pdfState
      });
    }

    // System message
    this.broadcastAll({
      type: 'chat-message',
      data: {
        username: '시스템',
        message: `${username}님이 입장했습니다.`,
        timestamp: Date.now(),
        isSystem: true
      }
    });

    console.log(`[VideoChat] User ${username} (${userId}) joined room ${this.roomId}`);
  }

  private handleLeaveRoom(userId: string): void {
    const user = this.users.get(userId);
    if (!user) return;

    this.users.delete(userId);
    this.connections.delete(userId);

    // Notify others (include userCount + username)
    this.broadcastAll({
      type: 'user-left',
      data: { userId, username: user.username, userCount: this.users.size }
    });

    // System message
    if (user.username) {
      this.broadcastAll({
        type: 'chat-message',
        data: {
          username: '시스템',
          message: `${user.username}님이 퇴장했습니다.`,
          timestamp: Date.now(),
          isSystem: true
        }
      });
    }

    console.log(`[VideoChat] User ${user.username} (${userId}) left room ${this.roomId}`);
  }

  private handleChatMessage(userId: string, data: any): void {
    const user = this.users.get(userId);
    if (!user) return;

    const { message } = data;
    if (!message) return;

    this.broadcastAll({
      type: 'chat-message',
      data: {
        username: user.username,
        message,
        timestamp: Date.now(),
        isSystem: false,
        userId
      }
    });
  }

  private handleWhiteboardDraw(userId: string, data: any): void {
    this.broadcast(userId, {
      type: 'whiteboard-draw',
      data
    });
  }

  private handleWhiteboardClear(userId: string): void {
    this.broadcast(userId, {
      type: 'whiteboard-clear'
    });
  }

  private handlePdfShare(userId: string, data: any): void {
    const { url, currentPage } = data;
    if (!url) return;

    this.pdfState = { url, currentPage: currentPage || 1 };

    this.broadcast(userId, {
      type: 'pdf-sync',
      data: this.pdfState
    });

    console.log(`[VideoChat] PDF shared in room ${this.roomId}: ${url}`);
  }

  private handlePdfPageChange(userId: string, data: any): void {
    const pageNum = data.pageNum || data;
    if (typeof pageNum !== 'number') return;

    if (this.pdfState) {
      this.pdfState.currentPage = pageNum;
    }

    this.broadcast(userId, {
      type: 'pdf-page-change',
      data: { pageNum }
    });
  }

  private handlePdfStopShare(userId: string): void {
    this.pdfState = null;

    this.broadcast(userId, {
      type: 'pdf-stop-share'
    });

    console.log(`[VideoChat] PDF sharing stopped in room ${this.roomId}`);
  }

  private handleOffer(userId: string, data: any): void {
    // Client sends { targetUserId, sdp }; some older code may send { to, offer }
    const target = data.targetUserId || data.to;
    const sdp = data.sdp || data.offer;
    if (!target || !sdp) return;
    const fromUser = this.users.get(userId);
    this.sendTo(target, {
      type: 'offer',
      data: { fromUserId: userId, fromUsername: fromUser?.username || '참가자', sdp }
    });
  }

  private handleAnswer(userId: string, data: any): void {
    const target = data.targetUserId || data.to;
    const sdp = data.sdp || data.answer;
    if (!target || !sdp) return;
    this.sendTo(target, {
      type: 'answer',
      data: { fromUserId: userId, sdp }
    });
  }

  private handleIceCandidate(userId: string, data: any): void {
    const target = data.targetUserId || data.to;
    const candidate = data.candidate;
    if (!target || !candidate) return;
    this.sendTo(target, {
      type: 'ice-candidate',
      data: { fromUserId: userId, candidate }
    });
  }

  private onClose(userId: string): void {
    const user = this.users.get(userId);
    if (user) {
      this.handleLeaveRoom(userId);
    } else {
      this.connections.delete(userId);
    }
  }

  private send(userId: string, msg: WebSocketMessage): void {
    const conn = this.connections.get(userId);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(msg));
    }
  }

  private sendTo(targetId: string, msg: WebSocketMessage): void {
    const conn = this.connections.get(targetId);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(msg));
    }
  }

  private broadcast(excludeId: string, msg: WebSocketMessage): void {
    const jsonMsg = JSON.stringify(msg);
    for (const [id, conn] of this.connections) {
      if (id !== excludeId && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(jsonMsg);
      }
    }
  }

  private broadcastAll(msg: WebSocketMessage): void {
    const jsonMsg = JSON.stringify(msg);
    for (const [, conn] of this.connections) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(jsonMsg);
      }
    }
  }

  private generateUserId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
