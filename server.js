/**
 * ============================================================
 * WebRTC 통합 플랫폼 - 메인 서버
 * ============================================================
 * 모듈 구성:
 *   /signaling    → 1:1 시그널링 서버 (webrtc-signaling-server)
 *   /video-call   → 화상통화+ (video-call-plus: 칠판, 채팅, PDF)
 *   /turn-relay   → TURN 중계 (cloudplare Workers, 별도 배포)
 * ============================================================
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// ── 모듈 임포트 ──
const { registerSignaling, registerHealthRoute } = require('./modules/signaling/signaling');
const { registerRoutes: registerVideoCallRoutes, registerVideoCall } = require('./modules/video-call/video-call');

// ── 서버 초기화 ──
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 10e6, // 10MB (PDF 업로드용)
});

// ── 미들웨어 ──
app.use(cors());
app.use(express.json());

// ── 정적 파일 서빙 ──
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 각 모듈 클라이언트 정적 파일
app.use('/video-call', express.static(path.join(__dirname, 'public/video-call')));
app.use('/signaling', express.static(path.join(__dirname, 'public/signaling')));
app.use('/turn-relay', express.static(path.join(__dirname, 'public/turn-relay')));

// ── 모듈 등록 ──

// 1) 시그널링 모듈 (네임스페이스: /signaling)
const signalingModule = registerSignaling(io, {
  maxPeers: parseInt(process.env.SIGNALING_MAX_PEERS || '2'),
});
registerHealthRoute(app, io);

// 2) 화상통화+ 모듈 (네임스페이스: /video-call)
registerVideoCallRoutes(app);
const videoCallModule = registerVideoCall(io);

// ── 통합 API ──

// 전체 헬스 체크
app.get('/api/health', (_req, res) => {
  const signalingNsp = io.of('/signaling');
  const videoCallNsp = io.of('/video-call');

  res.json({
    platform: 'WebRTC 통합 플랫폼',
    status: 'ok',
    version: '1.0.0',
    uptime: process.uptime(),
    modules: {
      signaling: {
        status: 'active',
        rooms: signalingModule.rooms.size,
        connections: signalingNsp.sockets ? signalingNsp.sockets.size : 0,
      },
      videoCall: {
        status: 'active',
        rooms: videoCallModule.rooms.size,
        connections: videoCallNsp.sockets ? videoCallNsp.sockets.size : 0,
      },
      turnRelay: {
        status: process.env.TURN_RELAY_URL ? 'configured' : 'not-configured',
        url: process.env.TURN_RELAY_URL || '(Cloudflare Workers 별도 배포 필요)',
      },
    },
    timestamp: new Date().toISOString(),
  });
});

// ICE/TURN 설정 발급 (Cloudflare 동적 자격증명 → 폴백)
// 비밀키(TURN_KEY_API_TOKEN)는 서버에만 두고, 클라이언트엔 단기 자격증명만 내려준다.
app.get('/api/turn-config', async (_req, res) => {
  try {
    const cfg = await buildTurnConfig(process.env, fetch);
    // 브라우저가 매 통화마다 갱신할 수 있도록 캐시 금지
    res.set('Cache-Control', 'no-store');
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ source: 'error', error: String(err && err.message || err) });
  }
});

// ── 클라이언트 페이지 라우팅 ──
app.get('/video-call', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public/video-call/index.html'));
});
app.get('/signaling', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public/signaling/index.html'));
});
app.get('/turn-relay', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public/turn-relay/index.html'));
});

// ── 서버 시작 ──
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   WebRTC 통합 플랫폼 서버 실행 중             ║
╠══════════════════════════════════════════════╣
║                                              ║
║   메인 대시보드:  http://localhost:${PORT}        ║
║   화상통화+:     http://localhost:${PORT}/video-call  ║
║   시그널링 테스트: http://localhost:${PORT}/signaling  ║
║   TURN 테스트:   http://localhost:${PORT}/turn-relay  ║
║                                              ║
║   API 헬스체크:  http://localhost:${PORT}/api/health  ║
║                                              ║
╚══════════════════════════════════════════════╝
  `);
});
