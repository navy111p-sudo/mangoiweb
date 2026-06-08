// ============================================================
// CloudPlayer TURN 중계 서버 - 타입 정의
// ============================================================

/** RTCIceCandidateInit (Workers 환경에는 WebRTC 타입이 없으므로 직접 정의) */
export interface RTCIceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

/** Cloudflare Worker 환경 바인딩 */
export interface Env {
  RELAY_ROOM: DurableObjectNamespace;
  MAX_ROOM_SIZE: string;
  RELAY_MODE: "auto" | "always" | "signaling-only";
}

// ------------------------------------------------------------
// WebSocket 메시지 프로토콜
// ------------------------------------------------------------

/** 클라이언트 → 서버 메시지 */
export type ClientMessage =
  | JoinMessage
  | LeaveMessage
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage
  | RelayDataMessage
  | PingMessage;

/** 서버 → 클라이언트 메시지 */
export type ServerMessage =
  | WelcomeMessage
  | PeerJoinedMessage
  | PeerLeftMessage
  | OfferForwardMessage
  | AnswerForwardMessage
  | IceCandidateForwardMessage
  | RelayDataForwardMessage
  | ErrorMessage
  | RoomInfoMessage
  | PongMessage;

// ---- 클라이언트 → 서버 ----

export interface JoinMessage {
  type: "join";
  peerId: string;
  metadata?: Record<string, unknown>;
}

export interface LeaveMessage {
  type: "leave";
}

export interface OfferMessage {
  type: "offer";
  targetPeerId: string;
  sdp: string;
}

export interface AnswerMessage {
  type: "answer";
  targetPeerId: string;
  sdp: string;
}

export interface IceCandidateMessage {
  type: "ice-candidate";
  targetPeerId: string;
  candidate: RTCIceCandidateInit;
}

/** P2P 실패 시 WebSocket을 통한 데이터 중계 요청 */
export interface RelayDataMessage {
  type: "relay-data";
  targetPeerId: string;
  channel: string;
  payload: string;
  binary?: boolean;
}

export interface PingMessage {
  type: "ping";
  timestamp: number;
}

// ---- 서버 → 클라이언트 ----

export interface WelcomeMessage {
  type: "welcome";
  peerId: string;
  roomId: string;
  peers: PeerInfo[];
  relayMode: string;
}

export interface PeerJoinedMessage {
  type: "peer-joined";
  peerId: string;
  metadata?: Record<string, unknown>;
}

export interface PeerLeftMessage {
  type: "peer-left";
  peerId: string;
  reason: string;
}

export interface OfferForwardMessage {
  type: "offer";
  fromPeerId: string;
  sdp: string;
}

export interface AnswerForwardMessage {
  type: "answer";
  fromPeerId: string;
  sdp: string;
}

export interface IceCandidateForwardMessage {
  type: "ice-candidate";
  fromPeerId: string;
  candidate: RTCIceCandidateInit;
}

export interface RelayDataForwardMessage {
  type: "relay-data";
  fromPeerId: string;
  channel: string;
  payload: string;
  binary?: boolean;
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
}

export interface RoomInfoMessage {
  type: "room-info";
  roomId: string;
  peerCount: number;
  peers: PeerInfo[];
}

export interface PongMessage {
  type: "pong";
  timestamp: number;
  serverTime: number;
}

// ---- 공통 ----

export interface PeerInfo {
  peerId: string;
  joinedAt: number;
  metadata?: Record<string, unknown>;
}

/** WebSocket에 직렬화하여 저장할 세션 정보 */
export interface SessionAttachment {
  peerId: string;
  roomId: string;
  joinedAt: number;
  metadata?: Record<string, unknown>;
}

// ---- 통계 ----

export interface RoomStats {
  roomId: string;
  peerCount: number;
  createdAt: number;
  totalRelayedMessages: number;
  totalRelayedBytes: number;
}
