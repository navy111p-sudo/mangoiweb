/**
 * signaling-room.ts - Durable Object for 1:1 WebRTC signaling
 * Handles: join, offer, answer, ice-candidate, leave
 * Max 2 peers per room
 *
 * 🛡️ Hibernation API 사용 (2026-06 전환)
 *   - state.acceptWebSocket() + webSocketMessage/Close/Error 핸들러 사용.
 *   - 소켓 식별/룸 정보는 ws.serializeAttachment() 에 저장 → DO 가
 *     재기동(배포·유휴 종료)되어도 진행 중 연결이 끊기지 않는다.
 *   - 활성 소켓 열거는 항상 state.getWebSockets() 로 (메모리 Map 비의존).
 */

import { WebSocketMessage } from './types';

const MAX_PEERS = 2;

interface SigAttachment {
  socketId: string;
  roomId: string;
}

export class SignalingRoom {
  private state: DurableObjectState;
  private env: any;
  private roomId: string;

  constructor(state: DurableObjectState, env?: any) {
    this.state = state;
    this.env = env || null;
    this.roomId = '';
  }

  // 🔐 Phase RT-4 — 토큰 검증 헬퍼 (옵셔널, REQUIRE_ROOM_TOKEN==='true' 일 때만)
  private async verifyTokenIfRequired(request: Request): Promise<{ ok: boolean; role?: string; userId?: string; error?: string }> {
    const requireToken = this.env && this.env.REQUIRE_ROOM_TOKEN === 'true';
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    if (!requireToken) return { ok: true };
    if (!token) return { ok: false, error: 'token_required' };
    try {
      // 🔐 폴백은 강한 상수(공개 BUILD_STAMP 금지, 2026-07-12 보안). auth-token.ts / api-mango 와 동일해야 함.
      const secret = this.env.ROOM_JWT_SECRET || 'mgi-fb-d0895a3a232c5ef0f0950c6128a04a5311ec69ba142cb4a86a8d334e33c56f30';
      const parts = token.split('.');
      if (parts.length !== 3) return { ok: false, error: 'malformed' };
      const [h, p, s] = parts;
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
      const sigBytes = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      const ok = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(`${h}.${p}`));
      if (!ok) return { ok: false, error: 'invalid_signature' };
      const payload = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return { ok: false, error: 'expired' };
      if (payload.aud && payload.aud !== `room:${this.roomId}`) return { ok: false, error: 'wrong_room' };
      return { ok: true, role: payload.role, userId: payload.sub };
    } catch (e: any) {
      return { ok: false, error: 'verify_failed' };
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const roomIdParam = url.searchParams.get('roomId');
    if (roomIdParam) this.roomId = roomIdParam;

    if (request.headers.get('Upgrade') === 'websocket') {
      const verify = await this.verifyTokenIfRequired(request);
      if (!verify.ok) {
        console.warn('[SignalingRoom] token verification failed:', verify.error);
        return new Response(JSON.stringify({ error: 'unauthorized', reason: verify.error }), {
          status: 401, headers: { 'Content-Type': 'application/json' }
        });
      }

      const socketId = this.generateSocketId();
      const { 0: client, 1: server } = new WebSocketPair();

      // 🛡️ Hibernation: accept + 식별정보를 attachment 에 저장
      server.serializeAttachment({ socketId, roomId: this.roomId } as SigAttachment);
      this.state.acceptWebSocket(server);

      return new Response(null, { status: 101, webSocket: client });
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

      switch (msg.type) {
        case 'join':
          this.handleJoin(ws, att.socketId);
          break;
        case 'offer':
          this.handleOffer(ws, att.socketId, msg.data as any);
          break;
        case 'answer':
          this.handleAnswer(ws, att.socketId, msg.data as any);
          break;
        case 'ice-candidate':
          this.handleIceCandidate(ws, att.socketId, msg.data as any);
          break;
        case 'leave':
          this.handleLeave(att.socketId, ws);
          break;
        default:
          console.warn(`Unknown message type: ${msg.type}`);
      }
    } catch (err) {
      console.error('Message parse error:', err);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const att = this.attOf(ws);
    if (att) this.handleLeave(att.socketId, ws);
    try { ws.close(code, reason); } catch {}
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    const att = this.attOf(ws);
    if (att) this.handleLeave(att.socketId, ws);
  }

  // ── 비즈니스 로직 (기존과 동일, 열거만 getWebSockets 기반) ──
  private handleJoin(ws: WebSocket, socketId: string): void {
    const sockets = this.state.getWebSockets();
    // 자신 포함 정원 초과면 거부 (기존 size > MAX_PEERS 와 동일 의미)
    if (sockets.length > MAX_PEERS) {
      this.sendWs(ws, { type: 'room-full', data: { roomId: this.roomId } });
      try { ws.close(1000, 'room-full'); } catch {}
      return;
    }

    const existingPeers = sockets
      .map(s => this.attOf(s)?.socketId)
      .filter((id): id is string => !!id && id !== socketId);
    const isInitiator = existingPeers.length > 0;

    this.sendWs(ws, { type: 'room-joined', data: { roomId: this.roomId, peers: existingPeers, isInitiator } });
    this.broadcast(socketId, { type: 'peer-joined', data: { peerId: socketId } });
    console.log(`[Signaling] Peer ${socketId} joined room ${this.roomId} (total: ${sockets.length})`);
  }

  private handleOffer(ws: WebSocket, socketId: string, data: any): void {
    const { targetId, sdp } = data || {};
    if (!targetId || !sdp) {
      this.sendWs(ws, { type: 'error-msg', data: { message: 'offer requires targetId and sdp' } });
      return;
    }
    this.sendTo(targetId, { type: 'offer', data: { senderId: socketId, sdp } });
  }

  private handleAnswer(ws: WebSocket, socketId: string, data: any): void {
    const { targetId, sdp } = data || {};
    if (!targetId || !sdp) {
      this.sendWs(ws, { type: 'error-msg', data: { message: 'answer requires targetId and sdp' } });
      return;
    }
    this.sendTo(targetId, { type: 'answer', data: { senderId: socketId, sdp } });
  }

  private handleIceCandidate(ws: WebSocket, socketId: string, data: any): void {
    const { targetId, candidate } = data || {};
    if (!targetId || !candidate) {
      this.sendWs(ws, { type: 'error-msg', data: { message: 'ice-candidate requires targetId and candidate' } });
      return;
    }
    this.sendTo(targetId, { type: 'ice-candidate', data: { senderId: socketId, candidate } });
  }

  private handleLeave(socketId: string, exclude?: WebSocket): void {
    this.broadcast(socketId, { type: 'peer-left', data: { peerId: socketId } }, exclude);
    console.log(`[Signaling] Peer ${socketId} left room ${this.roomId}`);
  }

  // ── 전송 헬퍼 ──
  private attOf(ws: WebSocket): SigAttachment | null {
    try { return ws.deserializeAttachment() as SigAttachment; } catch { return null; }
  }

  private sendWs(ws: WebSocket, msg: WebSocketMessage): void {
    try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); } catch {}
  }

  private sendTo(targetId: string, msg: WebSocketMessage): void {
    for (const s of this.state.getWebSockets()) {
      if (this.attOf(s)?.socketId === targetId) { this.sendWs(s, msg); return; }
    }
  }

  private broadcast(excludeId: string, msg: WebSocketMessage, excludeWs?: WebSocket): void {
    const jsonMsg = JSON.stringify(msg);
    for (const s of this.state.getWebSockets()) {
      if (s === excludeWs) continue;
      const att = this.attOf(s);
      if (att && att.socketId !== excludeId) {
        try { if (s.readyState === WebSocket.OPEN) s.send(jsonMsg); } catch {}
      }
    }
  }

  private generateSocketId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
