/**
 * ============================================================
 * 시그널링 모듈 (webrtc-signaling-server 통합)
 * - 기본 1:1 WebRTC 시그널링
 * - 방 관리 유틸리티 (join/leave/room tracking)
 * - 헬스 체크 API
 * ============================================================
 */

// 방 관리: Map<roomId, Set<socketId>>
const rooms = new Map();

// ── 유틸리티 ──

function getRoomInfo(roomId) {
  return rooms.get(roomId) || new Set();
}

function addToRoom(roomId, socketId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(socketId);
}

function removeFromRoom(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.delete(socketId);
  if (room.size === 0) rooms.delete(roomId);
}

function findRoomBySocket(socketId) {
  for (const [roomId, members] of rooms) {
    if (members.has(socketId)) return roomId;
  }
  return null;
}

function leaveRoom(socket, roomId, io) {
  socket.leave(roomId);
  removeFromRoom(roomId, socket.id);
  console.log(`[시그널링·퇴장] ${socket.id} ← ${roomId}`);
  io.to(roomId).emit('peer-left', { peerId: socket.id });
}

// ── Socket.IO 네임스페이스 등록 ──

function registerSignaling(io, opts = {}) {
  const MAX_PEERS = opts.maxPeers || 2;
  const nsp = io.of('/signaling');

  nsp.on('connection', (socket) => {
    console.log(`[시그널링·연결] ${socket.id}`);

    // 방 참가
    socket.on('join', (roomId) => {
      if (!roomId || typeof roomId !== 'string') {
        socket.emit('error-msg', { message: 'roomId는 비어 있지 않은 문자열이어야 합니다.' });
        return;
      }

      const currentRoom = findRoomBySocket(socket.id);
      if (currentRoom && currentRoom !== roomId) {
        leaveRoom(socket, currentRoom, nsp);
      }

      const room = getRoomInfo(roomId);
      if (room.size >= MAX_PEERS) {
        socket.emit('room-full', { roomId });
        console.log(`[시그널링·방 꽉참] ${roomId} — ${socket.id} 입장 거부`);
        return;
      }

      socket.join(roomId);
      addToRoom(roomId, socket.id);
      const memberCount = getRoomInfo(roomId).size;
      console.log(`[시그널링·입장] ${socket.id} → ${roomId} (현재 ${memberCount}명)`);

      const existingPeers = [...getRoomInfo(roomId)].filter((id) => id !== socket.id);
      socket.emit('room-joined', {
        roomId,
        peers: existingPeers,
        isInitiator: existingPeers.length > 0,
      });

      socket.to(roomId).emit('peer-joined', { peerId: socket.id });
    });

    // SDP Offer
    socket.on('offer', ({ targetId, sdp }) => {
      if (!targetId || !sdp) {
        socket.emit('error-msg', { message: 'offer에 targetId와 sdp가 필요합니다.' });
        return;
      }
      console.log(`[시그널링·Offer] ${socket.id} → ${targetId}`);
      nsp.to(targetId).emit('offer', { senderId: socket.id, sdp });
    });

    // SDP Answer
    socket.on('answer', ({ targetId, sdp }) => {
      if (!targetId || !sdp) {
        socket.emit('error-msg', { message: 'answer에 targetId와 sdp가 필요합니다.' });
        return;
      }
      console.log(`[시그널링·Answer] ${socket.id} → ${targetId}`);
      nsp.to(targetId).emit('answer', { senderId: socket.id, sdp });
    });

    // ICE Candidate
    socket.on('ice-candidate', ({ targetId, candidate }) => {
      if (!targetId || !candidate) {
        socket.emit('error-msg', { message: 'ice-candidate에 targetId와 candidate가 필요합니다.' });
        return;
      }
      nsp.to(targetId).emit('ice-candidate', { senderId: socket.id, candidate });
    });

    // 퇴장
    socket.on('leave', () => {
      const roomId = findRoomBySocket(socket.id);
      if (roomId) leaveRoom(socket, roomId, nsp);
    });

    // 연결 해제
    socket.on('disconnect', (reason) => {
      console.log(`[시그널링·연결해제] ${socket.id} — 사유: ${reason}`);
      const roomId = findRoomBySocket(socket.id);
      if (roomId) leaveRoom(socket, roomId, nsp);
    });
  });

  return { rooms, nsp };
}

// ── 헬스 체크 라우터 ──

function registerHealthRoute(app, io) {
  app.get('/api/signaling/health', (_req, res) => {
    const signalingNsp = io.of('/signaling');
    res.json({
      module: 'signaling',
      status: 'ok',
      rooms: rooms.size,
      connections: signalingNsp.sockets ? signalingNsp.sockets.size : 0,
      uptime: process.uptime(),
    });
  });
}

module.exports = { registerSignaling, registerHealthRoute };
