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

// 방 관리: Map<roomId, { users: Map, pdfState }>
const rooms = new Map();

// ── PDF 업로드 설정 (multer) ──

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
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// ── REST 라우트 등록 ──

function registerRoutes(app) {
  // PDF 업로드
  app.post('/api/video-call/upload-pdf', upload.single('pdf'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '파일 없음' });
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      success: true,
      filename: req.file.originalname,
      url: fileUrl
    });
  });

  // PDF 목록
  app.get('/api/video-call/pdf-list', (req, res) => {
    const dir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.pdf'))
      .map(f => ({
        filename: f.replace(/^\d+-/, ''),
        url: `/uploads/${f}`
      }));
    res.json(files);
  });

  // 헬스 체크
  app.get('/api/video-call/health', (_req, res) => {
    res.json({
      module: 'video-call',
      status: 'ok',
      rooms: rooms.size,
      uptime: process.uptime(),
    });
  });
}

// ── Socket.IO 네임스페이스 등록 ──

function registerVideoCall(io) {
  const nsp = io.of('/video-call');

  nsp.on('connection', (socket) => {
    console.log(`[화상통화+·연결] ${socket.id}`);

    // ── 방 참가 ──
    socket.on('join-room', ({ roomId, username }) => {
      socket.join(roomId);
      socket.roomId = roomId;
      socket.username = username || `사용자${socket.id.slice(0, 4)}`;

      if (!rooms.has(roomId)) {
        rooms.set(roomId, { users: new Map(), pdfState: null });
      }
      const room = rooms.get(roomId);
      room.users.set(socket.id, socket.username);

      // 기존 참가자에게 새 참가자 알림
      socket.to(roomId).emit('user-joined', {
        userId: socket.id,
        username: socket.username
      });

      // 새 참가자에게 기존 참가자 목록 전송
      const existingUsers = [];
      room.users.forEach((name, id) => {
        if (id !== socket.id) existingUsers.push({ userId: id, username: name });
      });
      socket.emit('existing-users', existingUsers);

      // 현재 PDF 상태가 있으면 동기화
      if (room.pdfState) {
        socket.emit('pdf-sync', room.pdfState);
      }

      // 시스템 메시지
      nsp.to(roomId).emit('chat-message', {
        username: '시스템',
        message: `${socket.username}님이 입장했습니다.`,
        timestamp: Date.now(),
        isSystem: true
      });

      console.log(`[화상통화+·입장] ${socket.username} → 방 ${roomId}`);
    });

    // ── WebRTC 시그널링 ──
    socket.on('offer', ({ to, offer }) => {
      nsp.to(to).emit('offer', { from: socket.id, offer });
    });

    socket.on('answer', ({ to, answer }) => {
      nsp.to(to).emit('answer', { from: socket.id, answer });
    });

    socket.on('ice-candidate', ({ to, candidate }) => {
      nsp.to(to).emit('ice-candidate', { from: socket.id, candidate });
    });

    // ── 채팅 ──
    socket.on('chat-message', (message) => {
      nsp.to(socket.roomId).emit('chat-message', {
        username: socket.username,
        message,
        timestamp: Date.now(),
        isSystem: false
      });
    });

    // ── 칠판 (Whiteboard) ──
    socket.on('whiteboard-draw', (data) => {
      socket.to(socket.roomId).emit('whiteboard-draw', data);
    });

    socket.on('whiteboard-clear', () => {
      nsp.to(socket.roomId).emit('whiteboard-clear');
    });

    // ── PDF 공유 ──
    socket.on('pdf-share', (pdfState) => {
      const room = rooms.get(socket.roomId);
      if (room) room.pdfState = pdfState;
      socket.to(socket.roomId).emit('pdf-sync', pdfState);
    });

    socket.on('pdf-page-change', (pageNum) => {
      const room = rooms.get(socket.roomId);
      if (room && room.pdfState) {
        room.pdfState.currentPage = pageNum;
      }
      socket.to(socket.roomId).emit('pdf-page-change', pageNum);
    });

    socket.on('pdf-stop-share', () => {
      const room = rooms.get(socket.roomId);
      if (room) room.pdfState = null;
      socket.to(socket.roomId).emit('pdf-stop-share');
    });

    // ── 연결 해제 ──
    socket.on('disconnect', () => {
      const room = rooms.get(socket.roomId);
      if (room) {
        room.users.delete(socket.id);
        if (room.users.size === 0) {
          rooms.delete(socket.roomId);
        }
      }

      socket.to(socket.roomId).emit('user-left', { userId: socket.id });

      if (socket.username && socket.roomId) {
        nsp.to(socket.roomId).emit('chat-message', {
          username: '시스템',
          message: `${socket.username}님이 퇴장했습니다.`,
          timestamp: Date.now(),
          isSystem: true
        });
      }

      console.log(`[화상통화+·퇴장] ${socket.username || socket.id}`);
    });
  });

  return { rooms, nsp };
}

module.exports = { registerRoutes, registerVideoCall };
