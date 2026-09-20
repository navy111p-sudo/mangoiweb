/**
 * ============================================================
 * 화상통화+ 모듈 (video-call-plus 통합)
 * - 다자간 영상통화 (WebRTC 시그널링)
 * - 실시간 채팅
 * - 협업 칠판 (Whiteboard)
 * - PDF 공유 & 동기화
 * ============================================================
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 방 관리: Map<roomId, { users: Map, pdfState, qualityEvents }>
const rooms = new Map();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('PDF 파일만 업로드 가능합니다.'), false);
  },
  limits: { fileSize: 50 * 1024 * 1024 }
});

function registerRoutes(app) {
  app.post('/api/video-call/upload-pdf', upload.single('pdf'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '파일 없음' });
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, filename: req.file.originalname, url: fileUrl });
  });

  app.get('/api/video-call/pdf-list', (req, res) => {
    const dir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.pdf')).map(f => ({ filename: f.replace(/^\d+-/, ''), url: `/uploads/${f}` }));
    res.json(files);
  });

  app.get('/api/video-call/health', (_req, res) => {
    res.json({ module: 'video-call', status: 'ok', rooms: rooms.size, uptime: process.uptime() });
  });
}

function registerVideoCall(io) {
  const nsp = io.of('/video-call');

  nsp.on('connection', (socket) => {
    console.log(`[화상통화+·연결] ${socket.id}`);

    socket.on('join-room', ({ roomId, username } = {}) => {
      if (!roomId || typeof roomId !== 'string') {
        socket.emit('error-msg', { message: 'roomId는 비어 있지 않은 문자열이어야 합니다.' });
        return;
      }
      socket.join(roomId);
      socket.roomId = roomId;
      socket.username = username || `사용자${socket.id.slice(0, 4)}`;

      if (!rooms.has(roomId)) rooms.set(roomId, { users: new Map(), pdfState: null, qualityEvents: [] });
      const room = rooms.get(roomId);
      if (!room.qualityEvents) room.qualityEvents = [];
      room.users.set(socket.id, socket.username);

      socket.to(roomId).emit('user-joined', { userId: socket.id, username: socket.username });
      const existingUsers = [];
      room.users.forEach((name, id) => { if (id !== socket.id) existingUsers.push({ userId: id, username: name }); });
      socket.emit('existing-users', existingUsers);
      if (room.pdfState) socket.emit('pdf-sync', room.pdfState);
      nsp.to(roomId).emit('chat-message', { username: '시스템', message: `${socket.username}님이 입장했습니다.`, timestamp: Date.now(), isSystem: true });
      console.log(`[화상통화+·입장] ${socket.username} → 방 ${roomId}`);
    });

    socket.on('offer', ({ to, offer }) => nsp.to(to).emit('offer', { from: socket.id, offer }));
    socket.on('answer', ({ to, answer }) => nsp.to(to).emit('answer', { from: socket.id, answer }));
    socket.on('ice-candidate', ({ to, candidate }) => nsp.to(to).emit('ice-candidate', { from: socket.id, candidate }));

    // 답변자 쪽에서 장애를 감지했을 때 offer 생성자에게 복구 요청만 전달한다.
    // 미디어 스트림 자체는 서버를 통과하지 않는다.
    socket.on('recovery-request', ({ to, reason } = {}) => {
      if (!socket.roomId || !to || typeof to !== 'string') return;
      nsp.to(to).emit('recovery-request', { from: socket.id, reason: String(reason || 'unknown').slice(0, 80) });
    });

    // 연결 품질 텔레메트리: 방별 최근 200개만 메모리에 보관.
    // SDP/미디어/음성 내용은 저장하지 않는다.
    socket.on('connection-quality-event', ({ peerId, type, detail, ts } = {}) => {
      if (!socket.roomId || !type || typeof type !== 'string') return;
      const room = rooms.get(socket.roomId); if (!room) return;
      if (!room.qualityEvents) room.qualityEvents = [];
      const safeType = type.slice(0, 60);
      const d = detail && typeof detail === 'object' ? detail : {};
      const event = {
        ts: Number(ts) || Date.now(),
        from: socket.id,
        peerId: typeof peerId === 'string' ? peerId.slice(0, 100) : null,
        type: safeType,
        detail: {
          state: typeof d.state === 'string' ? d.state.slice(0, 30) : undefined,
          ice: typeof d.ice === 'string' ? d.ice.slice(0, 30) : undefined,
          reason: typeof d.reason === 'string' ? d.reason.slice(0, 100) : undefined,
          attempt: Number.isFinite(d.attempt) ? d.attempt : undefined,
          relay: typeof d.relay === 'boolean' ? d.relay : undefined,
          relayOnly: typeof d.relayOnly === 'boolean' ? d.relayOnly : undefined,
          rtt: Number.isFinite(d.rtt) ? d.rtt : undefined,
          packetsLost: Number.isFinite(d.packetsLost) ? d.packetsLost : undefined,
          packetsReceived: Number.isFinite(d.packetsReceived) ? d.packetsReceived : undefined,
          stalledMs: Number.isFinite(d.stalledMs) ? d.stalledMs : undefined,
        },
      };
      room.qualityEvents.push(event);
      if (room.qualityEvents.length > 200) room.qualityEvents.shift();
      if (safeType !== 'quality') console.info('[화상통화+·품질]', socket.roomId, event);
    });

    socket.on('chat-message', (message) => {
      if (!socket.roomId) return;
      nsp.to(socket.roomId).emit('chat-message', { username: socket.username, message, timestamp: Date.now(), isSystem: false });
    });

    socket.on('whiteboard-draw', (data) => { if (socket.roomId) socket.to(socket.roomId).emit('whiteboard-draw', data); });
    socket.on('whiteboard-clear', () => { if (socket.roomId) nsp.to(socket.roomId).emit('whiteboard-clear'); });

    socket.on('pdf-share', (pdfState) => {
      if (!socket.roomId) return;
      const room = rooms.get(socket.roomId); if (room) room.pdfState = pdfState;
      socket.to(socket.roomId).emit('pdf-sync', pdfState);
    });
    socket.on('pdf-page-change', (pageNum) => {
      if (!socket.roomId) return;
      const room = rooms.get(socket.roomId); if (room && room.pdfState) room.pdfState.currentPage = pageNum;
      socket.to(socket.roomId).emit('pdf-page-change', pageNum);
    });
    socket.on('pdf-stop-share', () => {
      if (!socket.roomId) return;
      const room = rooms.get(socket.roomId); if (room) room.pdfState = null;
      socket.to(socket.roomId).emit('pdf-stop-share');
    });

    socket.on('disconnect', () => {
      const room = rooms.get(socket.roomId);
      if (room) {
        room.users.delete(socket.id);
        if (room.users.size === 0) rooms.delete(socket.roomId);
      }
      if (socket.roomId) socket.to(socket.roomId).emit('user-left', { userId: socket.id });
      if (socket.username && socket.roomId) {
        nsp.to(socket.roomId).emit('chat-message', { username: '시스템', message: `${socket.username}님이 퇴장했습니다.`, timestamp: Date.now(), isSystem: true });
      }
      console.log(`[화상통화+·퇴장] ${socket.username || socket.id}`);
    });
  });

  return { rooms, nsp };
}

module.exports = { registerRoutes, registerVideoCall, rooms };
