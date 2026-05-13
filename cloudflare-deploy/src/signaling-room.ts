/**
 * signaling-room.ts - Durable Object for 1:1 WebRTC signaling
 * Handles: join, offer, answer, ice-candidate, leave
 * Max 2 peers per room
 */

import { WebSocketMessage, ConnectionInfo } from './types';

const MAX_PEERS = 2;

interface RoomState {
  connections: Map<string, ConnectionInfo>;
  roomId: string;
}

export class SignalingRoom {
  private state: DurableObjectState;
  private roomId: string;
  private connections: Map<string, ConnectionInfo> = new Map();

  constructor(state: DurableObjectState) {
    this.state = state;
    this.roomId = '';
  }

  async fetch(request: Request): Promise<Response> {
    // Durable Object ID는 hex 문자열이므로 URL로 파싱할 수 없습니다.
    // roomId는 요청 URL의 쿼리 파라미터에서 가져옵니다.
    const url = new URL(request.url);
    const roomIdParam = url.searchParams.get('roomId');
    if (roomIdParam) this.roomId = roomIdParam;

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }
    return new Response('Invalid request', { status: 400 });
  }

  private handleWebSocket(request: Request): Response {
    const socketId = this.generateSocketId();
    const { 0: client, 1: server } = new WebSocketPair();

    server.accept();
    server.addEventListener('message', (event: MessageEvent) => {
      this.onMessage(socketId, event.data);
    });
    server.addEventListener('close', () => {
      this.onClose(socketId);
    });
    server.addEventListener('error', () => {
      this.onClose(socketId);
    });

    this.connections.set(socketId, { socketId, roomId: this.roomId, ws: server });

    return new Response(null, { status: 101, webSocket: client });
  }

  private onMessage(socketId: string, rawData: string): void {
    try {
      const msg: WebSocketMessage = JSON.parse(rawData);
      const conn = this.connections.get(socketId);
      if (!conn) return;

      switch (msg.type) {
        case 'join':
          this.handleJoin(socketId);
          break;
        case 'offer':
          this.handleOffer(socketId, msg.data as any);
          break;
        case 'answer':
          this.handleAnswer(socketId, msg.data as any);
          break;
        case 'ice-candidate':
          this.handleIceCandidate(socketId, msg.data as any);
          break;
        case 'leave':
          this.handleLeave(socketId);
          break;
        default:
          console.warn(`Unknown message type: ${msg.type}`);
      }
    } catch (err) {
      console.error('Message parse error:', err);
    }
  }

  private handleJoin(socketId: string): void {
    // 주의: handleWebSocket에서 이미 connections.set()이 호출되어 자신도 포함되어 있음
    // 따라서 size > MAX_PEERS 일 때만 room-full 처리 (>= 아님)
    if (this.connections.size > MAX_PEERS) {
      this.send(socketId, { type: 'room-full', data: { roomId: this.roomId } });
      this.connections.delete(socketId);
      return;
    }

    // Get existing peers
    const existingPeers = Array.from(this.connections.keys()).filter(id => id !== socketId);
    const isInitiator = existingPeers.length > 0;

    this.send(socketId, {
      type: 'room-joined',
      data: { roomId: this.roomId, peers: existingPeers, isInitiator }
    });

    // Notify others
    this.broadcast(socketId, { type: 'peer-joined', data: { peerId: socketId } });

    console.log(`[Signaling] Peer ${socketId} joined room ${this.roomId} (total: ${this.connections.size})`);
  }

  private handleOffer(socketId: string, data: any): void {
    const { targetId, sdp } = data;
    if (!targetId || !sdp) {
      this.send(socketId, { type: 'error-msg', data: { message: 'offer requires targetId and sdp' } });
      return;
    }

    this.sendTo(targetId, {
      type: 'offer',
      data: { senderId: socketId, sdp }
    });

    console.log(`[Signaling] Offer from ${socketId} to ${targetId}`);
  }

  private handleAnswer(socketId: string, data: any): void {
    const { targetId, sdp } = data;
    if (!targetId || !sdp) {
      this.send(socketId, { type: 'error-msg', data: { message: 'answer requires targetId and sdp' } });
      return;
    }

    this.sendTo(targetId, {
      type: 'answer',
      data: { senderId: socketId, sdp }
    });

    console.log(`[Signaling] Answer from ${socketId} to ${targetId}`);
  }

  private handleIceCandidate(socketId: string, data: any): void {
    const { targetId, candidate } = data;
    if (!targetId || !candidate) {
      this.send(socketId, { type: 'error-msg', data: { message: 'ice-candidate requires targetId and candidate' } });
      return;
    }

    this.sendTo(targetId, {
      type: 'ice-candidate',
      data: { senderId: socketId, candidate }
    });
  }

  private handleLeave(socketId: string): void {
    this.connections.delete(socketId);
    this.broadcast('', { type: 'peer-left', data: { peerId: socketId } });
    console.log(`[Signaling] Peer ${socketId} left room ${this.roomId}`);
  }

  private onClose(socketId: string): void {
    this.handleLeave(socketId);
  }

  private send(socketId: string, msg: WebSocketMessage): void {
    const conn = this.connections.get(socketId);
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

  private generateSocketId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
