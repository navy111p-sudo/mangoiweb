// 로컬 검증 전용 정적 서버 — public/ 를 그대로 내보낸다.
// 워커(인증 게이트) 없이 admin.html 의 «DOM 구조와 사이드바 동작» 만 확인하기 위한 것.
// API 호출은 전부 실패하지만, 이 검증의 대상은 화면 구조라 문제가 없다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'public');
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png',
  '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.webp':'image/webp', '.mp4':'video/mp4', '.ico':'image/x-icon' };

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let p = path.join(ROOT, url === '/' ? '/index.html' : url);
  if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(p, (err, buf) => {
    if (err) {
      // API 는 빈 JSON 으로 — 스크립트가 죽지 않고 계속 돌게
      if (url.startsWith('/api/')) { res.writeHead(200, {'Content-Type':'application/json'}).end('{"ok":false,"local":true}'); return; }
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(buf);
  });
}).listen(4599, () => console.log('static harness on http://localhost:4599'));
