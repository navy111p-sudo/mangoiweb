// ============================================================
// RelayRoom Durable Object
// - WebRTC 시그널링 (SDP Offer/Answer, ICE Candidate 교환)
// - P2P 실패 시 WebSocket 기반 데이터 중계 (TURN-like)
// - Hibernation API 사용으로 비용 절감
// ============================================================

import { DurableObject } from "cloudflare:workers";
import type {
  Env,
  ClientMessage,
  ServerMessage,
  SessionAttachment,
  PeerInfo,
  RoomStats,
} from "./types";

export class RelayRoom extends DurableObject<Env> {
  private totalRelayedMessages = 0;
  private totalRelayedBytes = 0;
  private createdAt = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("__ping__", "__pong__")
    );
    this.ctx.blockConcurrencyWhile(async () => {
      const stats = await this.ctx.storage.get<RoomStats>("stats");
      if (stats) {
        this.totalRelayedMessages = stats.totalRelayedMessages;
        this.totalRelayedBytes = stats.totalRelayedBytes;
        this.createdAt = stats.createdAt;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/info")) {
      return this.handleRoomInfo();
    }
    if (url.pathname.endsWith("/close") && request.method === "POST") {
      return this.handleRoomClose();
    }
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      return new Response("WebSocket 업그레이드가 필요합니다.", { status: 426 });
    }
    return this.handleWebSocketUpgrade(request);
  }

  private handleWebSocketUpgrade(request: Request): Response {
    const maxSize = parseInt(this.env.MAX_ROOM_SIZE || "10", 10);
    const currentPeers = this.getActivePeers();
    if (currentPeers.length >= maxSize) {
      return new Response(
        JSON.stringify({ error: "ROOM_FULL", message: `최대 인원(${maxSize}명) 초과` }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const url = new URL(request.url);
    const roomId = url.searchParams.get("roomId") || "default";
    server.serializeAttachment({
      peerId: "",
      roomId,
      joinedAt: 0,
    } satisfies SessionAttachment);
    if (this.createdAt === 0) {
      this.createdAt = Date.now();
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    try {
      const data: ClientMessage = JSON.parse(
        typeof message === "string" ? message : new TextDecoder().decode(message)
      );
      switch (data.type) {
        case "join":
          this.handleJoin(ws, data.peerId, data.metadata);
          break;
        case "leave":
          this.handleLeave(ws, "client-requested");
          break;
        case "offer":
          this.forwardToPeer(ws, data.targetPeerId, {
            type: "offer",
            fromPeerId: this.getPeerId(ws),
            sdp: data.sdp,
          });
          break;
        case "answer":
          this.forwardToPeer(ws, data.targetPeerId, {
            type: "answer",
            fromPeerId: this.getPeerId(ws),
            sdp: data.sdp,
          });
          break;
        case "ice-candidate":
          this.forwardToPeer(ws, data.targetPeerId, {
            type: "ice-candidate",
            fromPeerId: this.getPeerId(ws),
            candidate: data.candidate,
          });
          break;
        case "relay-data":
          this.handleRelayData(ws, data.targetPeerId, data.channel, data.payload, data.binary);
          break;
        case "ping":
          this.send(ws, {
            type: "pong",
            timestamp: data.timestamp,
            serverTime: Date.now(),
          });
          break;
        default:
          this.send(ws, {
            type: "error",
            code: "UNKNOWN_MESSAGE",
            message: `알 수 없는 메시지 타입: ${(data as any).type}`,
          });
      }
    } catch (err) {
      this.send(ws, {
        type: "error",
        code: "INVALID_MESSAGE",
        message: "메시지 파싱 실패",
      });
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    this.handleLeave(ws, `closed(${code})`);
    ws.close(code, reason);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error("WebSocket 에러:", error);
    this.handleLeave(ws, "error");
  }

  private handleJoin(ws: WebSocket, peerId: string, metadata?: Record<string, unknown>): void {
    const existing = this.findPeerSocket(peerId);
    if (existing && existing !== ws) {
      this.send(ws, {
        type: "error",
        code: "DUPLICATE_PEER_ID",
        message: `peerId "${peerId}"가 이미 사용 중입니다.`,
      });
      return;
    }
    const attachment: SessionAttachment = {
      peerId,
      roomId: this.getAttachment(ws)?.roomId || "default",
      joinedAt: Date.now(),
      metadata,
    };
    ws.serializeAttachment(attachment);
    const peers = this.getActivePeers();
    this.send(ws, {
      type: "welcome",
      peerId,
      roomId: attachment.roomId,
      peers: peers.filter((p) => p.peerId !== peerId),
      relayMode: this.env.RELAY_MODE || "auto",
    });
    this.broadcast(
      { type: "peer-joined", peerId, metadata },
      ws
    );
    console.log(`[Room] ${peerId} 입장 → 현재 ${peers.length}명`);
  }

  private handleLeave(ws: WebSocket, reason: string): void {
    const attachment = this.getAttachment(ws);
    if (!attachment || !attachment.peerId) return;
    this.broadcast(
      { type: "peer-left", peerId: attachment.peerId, reason },
      ws
    );
    console.log(`[Room] ${attachment.peerId} 퇴장 (${reason})`);
    this.saveStats();
  }

  private handleRelayData(
    ws: WebSocket, targetPeerId: string, channel: string, payload: string, binary?: boolean
  ): void {
    const fromPeerId = this.getPeerId(ws);
    this.totalRelayedMessages++;
    this.totalRelayedBytes += payload.length;
    this.forwardToPeer(ws, targetPeerId, {
      type: "relay-data", fromPeerId, channel, payload, binary,
    });
    if (this.totalRelayedMessages % 100 === 0) {
      this.saveStats();
    }
  }

  private forwardToPeer(senderWs: WebSocket, targetPeerId: string, msg: ServerMessage): void {
    const targetWs = this.findPeerSocket(targetPeerId);
    if (!targetWs) {
      this.send(senderWs, {
        type: "error",
        code: "PEER_NOT_FOUND",
        message: `피어 "${targetPeerId}"를 찾을 수 없습니다.`,
      });
      return;
    }
    this.send(targetWs, msg);
  }

  private broadcast(msg: ServerMessage, exclude?: WebSocket): void {
    const sockets = this.ctx.getWebSockets();
    const payload = JSON.stringify(msg);
    for (const ws of sockets) {
      if (ws === exclude) continue;
      const att = this.getAttachment(ws);
      if (att?.peerId) {
        try { ws.send(payload); } catch { /* 연결 끊긴 소켓 무시 */ }
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try { ws.send(JSON.stringify(msg)); } catch { /* 연결 끊김 */ }
  }

  private getPeerId(ws: WebSocket): string {
    return this.getAttachment(ws)?.peerId || "unknown";
  }

  private getAttachment(ws: WebSocket): SessionAttachment | null {
    try { return ws.deserializeAttachment() as SessionAttachment; } catch { return null; }
  }

  private findPeerSocket(peerId: string): WebSocket | null {
    for (const ws of this.ctx.getWebSockets()) {
      const att = this.getAttachment(ws);
      if (att?.peerId === peerId) return ws;
    }
    return null;
  }

  private getActivePeers(): PeerInfo[] {
    const peers: PeerInfo[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const att = this.getAttachment(ws);
      if (att?.peerId) {
        peers.push({ peerId: att.peerId, joinedAt: att.joinedAt, metadata: att.metadata });
      }
    }
    return peers;
  }

  private async saveStats(): Promise<void> {
    const peers = this.getActivePeers();
    await this.ctx.storage.put<RoomStats>("stats", {
      roomId: peers[0]?.peerId ? this.getAttachment(this.ctx.getWebSockets()[0])?.roomId || "default" : "default",
      peerCount: peers.length,
      createdAt: this.createdAt,
      totalRelayedMessages: this.totalRelayedMessages,
      totalRelayedBytes: this.totalRelayedBytes,
    });
  }

  private handleRoomInfo(): Response {
    const peers = this.getActivePeers();
    return Response.json({
      peerCount: peers.length,
      peers,
      stats: {
        createdAt: this.createdAt,
        totalRelayedMessages: this.totalRelayedMessages,
        totalRelayedBytes: this.totalRelayedBytes,
      },
    });
  }

  private handleRoomClose(): Response {
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      this.send(ws, {
        type: "error",
        code: "ROOM_CLOSED",
        message: "방이 관리자에 의해 닫혔습니다.",
      });
      ws.close(1000, "Room closed by admin");
    }
    return Response.json({ closed: true, disconnected: sockets.length });
  }
}
