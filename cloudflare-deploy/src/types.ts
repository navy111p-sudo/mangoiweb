/**
 * types.ts - Shared type definitions for WebRTC Unified Platform
 */

export interface WebSocketMessage {
  type: string;
  data?: Record<string, unknown>;
}

// ===== Signaling Room Types =====
export interface SignalingJoinData {
  roomId: string;
}

export interface SignalingOfferData {
  targetId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface SignalingAnswerData {
  targetId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface SignalingIceCandidateData {
  targetId: string;
  candidate: RTCIceCandidate;
}

export interface RoomJoinedResponse {
  roomId: string;
  peers: string[];
  isInitiator: boolean;
}

export interface PeerJoinedResponse {
  peerId: string;
}

export interface PeerLeftResponse {
  peerId: string;
}

export interface RoomFullResponse {
  roomId: string;
}

export interface OfferResponse {
  senderId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface AnswerResponse {
  senderId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface IceCandidateResponse {
  senderId: string;
  candidate: RTCIceCandidate;
}

// ===== Video Call Room Types =====
export interface VideoChatUser {
  userId: string;
  username: string;
}

export interface VideoChatJoinData {
  roomId: string;
  username: string;
}

export interface ChatMessage {
  username: string;
  message: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface WhiteboardDrawData {
  type: 'pen' | 'eraser' | 'line' | 'rect' | 'circle';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  size: number;
}

export interface PdfShareData {
  url: string;
  currentPage?: number;
}

export interface VideoCallOfferData {
  to: string;
  offer: RTCSessionDescriptionInit;
}

export interface VideoCallAnswerData {
  to: string;
  answer: RTCSessionDescriptionInit;
}

export interface VideoCallIceCandidateData {
  to: string;
  candidate: RTCIceCandidate;
}

// ===== API Response Types =====
export interface HealthResponse {
  status: 'ok' | 'error';
  message: string;
  timestamp: number;
}

export interface TurnConfigResponse {
  iceServers: Array<{
    urls: string[];
    username?: string;
    credential?: string;
  }>;
}

export interface PdfUploadResponse {
  success: boolean;
  filename?: string;
  url?: string;
  error?: string;
}

export interface PdfListResponse {
  filename: string;
  url: string;
  uploadedAt?: number;
}

// ===== Internal Connection State =====
export interface ConnectionInfo {
  socketId: string;
  roomId: string;
  username?: string;
  ws: WebSocket;
}
