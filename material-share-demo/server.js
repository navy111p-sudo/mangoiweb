// ============================================================
//  교재 실시간 공유 데모 — Node.js + Socket.io 중계 서버
//  실행:  npm install express socket.io   →   node server.js
//  접속:  교사 http://localhost:3000/teacher.html?room=class1
//        학생 http://localhost:3000/student.html?room=class1
// ============================================================

const express = require('express');          // 정적 파일 서빙용 웹서버
const http = require('http');                 // http 서버 (socket.io 가 얹힘)
const { Server } = require('socket.io');      // 실시간 양방향 통신 라이브러리

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 현재 폴더의 html 파일들을 그대로 제공 (teacher.html, student.html)
app.use(express.static(__dirname));

// ── 클라이언트가 접속할 때마다 실행 ───────────────────────────
io.on('connection', (socket) => {
  console.log('✅ 접속:', socket.id);

  // 1) 방 입장 — 교사/학생 모두 같은 방 코드로 들어와야 서로 보임
  socket.on('join_room', (room) => {
    socket.join(room);                        // 이 소켓을 해당 방에 등록
    socket.data.room = room;                  // 나중에 쓰려고 방 이름 저장
    console.log(`🚪 ${socket.id} → 방 [${room}] 입장`);
  });

  // 2) 교재 공유 — 교사가 교재(이미지)를 띄우면 받음 → 같은 방의 '다른 사람'에게 전달
  //    payload = { image: '이미지 URL 또는 base64', page: 1, name: '교재명' }
  socket.on('material_share', (payload) => {
    const room = socket.data.room;
    if (!room) return;
    // to(room): 그 방 전체. 단, socket.broadcast 라서 '보낸 본인(교사)'은 제외하고 나머지(학생)에게만 전송
    socket.to(room).emit('material_share', payload);
    console.log(`📚 [${room}] 교재 공유 →`, payload.name || payload.image);
  });

  // 3) 페이지 전환 — 교사가 이전/다음을 누르면 페이지 번호를 학생에게 전달
  //    payload = { page: 3 }  (또는 새 페이지의 image 까지 같이 보내도 됨)
  socket.on('material_page', (payload) => {
    const room = socket.data.room;
    if (!room) return;
    socket.to(room).emit('material_page', payload);
    console.log(`📄 [${room}] 페이지 →`, payload.page);
  });

  socket.on('disconnect', () => console.log('❌ 접속 종료:', socket.id));
});

server.listen(3000, () => console.log('🚀 서버 실행: http://localhost:3000'));
