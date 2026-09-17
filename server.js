/**
 * ============================================================
 * WebRTC 통합 플랫폼 - 메인 서버
 * ============================================================
 */
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { registerSignaling, registerHealthRoute } = require('./modules/signaling/signaling');
const { registerRoutes: registerVideoCallRoutes, registerVideoCall } = require('./modules/video-call/video-call');
const { registerLightweightAiRoutes } = require('./modules/ai-lightweight/ai-lightweight');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 10e6,
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/video-call', express.static(path.join(__dirname, 'public/video-call')));
app.use('/signaling', express.static(path.join(__dirname, 'public/signaling')));
app.use('/turn-relay', express.static(path.join(__dirname, 'public/turn-relay')));

const signalingModule = registerSignaling(io, {
  maxPeers: parseInt(process.env.SIGNALING_MAX_PEERS || '2'),
});
registerHealthRoute(app, io);

registerVideoCallRoutes(app);
const videoCallModule = registerVideoCall(io);

// Lightweight AI is deliberately isolated from the WebRTC media path.
registerLightweightAiRoutes(app);

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
      ai: {
        status: process.env.HF_API_TOKEN ? 'configured' : 'disabled',
        mode: 'lightweight',
      },
      turnRelay: {
        status: process.env.TURN_RELAY_URL ? 'configured' : 'not-configured',
        url: process.env.TURN_RELAY_URL || '(Cloudflare Workers 별도 배포 필요)',
      },
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/turn-config', async (_req, res) => {
  try {
    // Preserve the existing TURN endpoint contract; deployments that provide a
    // TURN relay URL can still use it while dynamic credentials remain handled
    // by the existing TURN module/deployment.
    if (typeof buildTurnConfig !== 'function') {
      return res.json({ source: 'env', urls: process.env.TURN_RELAY_URL || '' });
    }
    const cfg = await buildTurnConfig(process.env, fetch);
    res.set('Cache-Control', 'no-store');
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ source: 'error', error: String(err && err.message || err) });
  }
});

app.get('/video-call', (_req, res) => res.sendFile(path.join(__dirname, 'public/video-call/index.html')));
app.get('/signaling', (_req, res) => res.sendFile(path.join(__dirname, 'public/signaling/index.html')));
app.get('/turn-relay', (_req, res) => res.sendFile(path.join(__dirname, 'public/turn-relay/index.html')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`MangoAI WebRTC platform running on http://localhost:${PORT}`);
});
