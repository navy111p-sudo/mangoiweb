// frontend_api_scan_harness.mjs — 「화면이 부르는 /api 가 서버 어딘가에 실재하는가」 전수 스캔 (2026-08-11)
//
// frontend_api_exists_harness 와의 차이:
//   저쪽은 «라이브 404 로 실증한 죽은 경로 9개» 를 정본에 박아두고 «그걸 새로 더 부르나» 만 본다.
//   이쪽은 반대로 «화면의 모든 /api 리터럴» 을 뽑아 «서버 소스 어디에도 없는 것» 을 통째로 찾는다.
//   → 앞으론 존재하지 않는 새 라우트를 fetch 하는 코드가 들어오면 (스냅샷에 없던 죽은 경로) 여기서 막힌다.
//
// 판정을 오염시킨 두 함정(2026-08-11 실측)과 그 대책:
//   ① 주석 안의 '/api/login' 같은 «이미 지운 라우트를 설명하는 문자열» → 실제 호출로 오인.
//        대책: 화면·서버 양쪽 다 주석(//, /* */, <!-- -->)을 먼저 제거하고 스캔.
//   ② 서버가 정규식 라우트로 처리(`path.match(/^\/api\/rooms\/([^\/]+)\/kick$/)`) → 문자열 리터럴만
//      보면 «서버에 없다» 고 오판. 대책: 서버는 정규식의 이스케이프 슬래시(\/)를 풀어 /api 토큰을 함께 수집.
//   ③ index.ts 최상위 `path.startsWith('/api')` 같은 «세그먼트 1개» 광역 토큰은 /api 전체를 삼켜 무의미
//      → 제외.
//
// 서버 토큰은 «넉넉히» 모은다(문자열+정규식 어디든 /api/… 가 있으면 토큰). 과수집은 안전하다 —
// 게이트의 목적은 «서버 어디에도 흔적이 없는 새 죽은 호출» 을 잡는 것이므로 과소보고(가짜 실패)를 피하는 게 우선.
//
// 실행:            node test-harness/frontend_api_scan_harness.mjs
// 스냅샷 갱신:      node test-harness/frontend_api_scan_harness.mjs --update
//   (핸들러를 만들었거나 호출을 지워 죽은 목록이 바뀌면 갱신)

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../cloudflare-deploy/public');
const SRC = join(__dir, '../cloudflare-deploy/src');
const SNAP = join(__dir, 'frontend-api-scan-dead.json');
const UPDATE = process.argv.includes('--update');

// ── 주석 제거: 문자열/템플릿/정규식 리터럴은 보존하고 //, /* */, <!-- --> 만 지운다 ──
//   ⚠️ 정규식 리터럴(/…/)을 반드시 추적해야 한다. 안 그러면 `/['"]/` 같은 정규식 안 따옴표를
//      «문자열 시작» 으로 오인해 그 뒤 주석을 문자열로 취급 → 주석 속 '/api/…' 를 못 지운다(2026-08-11 실측).
//   줄 수를 보존하려고 주석은 내용만 지우고 개행은 남긴다(파일:줄 보고가 원문과 맞도록).
function stripComments(src, isHtml) {
  let out = '';
  const n = src.length;
  let i = 0;
  let mode = 'code'; // code | sq | dq | tpl | regex | line | block
  let prevSig = '';  // code 에서 마지막으로 낸 공백 아닌 문자 (정규식/나눗셈 판별용)
  const REGEX_PREV = "(,=:[!&|?{};+-*%<>~^"; // 이 뒤의 / 는 정규식 시작
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (mode === 'code') {
      if (isHtml && c === '<' && src.startsWith('<!--', i)) { const e = src.indexOf('-->', i + 4); i = e < 0 ? n : e + 3; continue; }
      if (c === '/' && c2 === '/') { mode = 'line'; i += 2; continue; }
      if (c === '/' && c2 === '*') { mode = 'block'; i += 2; continue; }
      if (c === '/') {
        const isRegex = prevSig === '' || REGEX_PREV.includes(prevSig) || /(?:^|[^a-z])(?:return|typeof|case|in|of|do|else)$/.test(out.replace(/\s+$/, ''));
        if (isRegex) { mode = 'regex'; out += c; i++; continue; }
        out += c; prevSig = c; i++; continue; // 나눗셈
      }
      if (c === "'") { mode = 'sq'; out += c; i++; continue; }
      if (c === '"') { mode = 'dq'; out += c; i++; continue; }
      if (c === '`') { mode = 'tpl'; out += c; i++; continue; }
      out += c; if (!/\s/.test(c)) prevSig = c; i++; continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += c; i++; } else i++; continue; }
    if (mode === 'block') { if (c === '*' && c2 === '/') { mode = 'code'; i += 2; } else { if (c === '\n') out += c; i++; } continue; }
    // 문자열/템플릿/정규식 리터럴
    const delim = mode === 'sq' ? "'" : mode === 'dq' ? '"' : mode === 'tpl' ? '`' : '/';
    if (c === '\\') { out += c + (c2 || ''); i += 2; continue; }
    if (mode === 'regex' && c === '\n') { mode = 'code'; out += c; i++; continue; } // 정규식은 한 줄 — 안전장치
    if (c === delim) { mode = 'code'; out += c; prevSig = delim; i++; continue; }
    out += c; i++;
  }
  return out;
}

function walk(dir, acc, exts) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) { if (!/vendor|library|models|video|audio|img|node_modules|face-fx|fonts|lib/.test(e)) walk(p, acc, exts); }
    else if (exts.test(e)) acc.push(p);
  }
  return acc;
}

const seg = t => t.split('/').filter(Boolean).length; // '/api/rooms' → 2

// ── 1) 화면이 부르는 /api 문자열 리터럴 (주석 제거 후) ──
const feHits = new Map(); // path -> Set('파일:줄')
const pubNorm = PUB.replace(/\\/g, '/');
for (const f of walk(PUB, [], /\.(html|js)$/)) {
  const rel = f.replace(/\\/g, '/').replace(pubNorm + '/', '');
  const isHtml = /\.html$/.test(f);
  const clean = stripComments(readFileSync(f, 'utf8'), isHtml);
  const lines = clean.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(/['"`](\/api\/[a-z0-9/_-]+)/gi)) {
      const p = m[1].replace(/\/+$/, '').toLowerCase();
      if (seg(p) <= 1) continue;
      if (!feHits.has(p)) feHits.set(p, new Set());
      feHits.get(p).add(rel + ':' + (i + 1));
    }
  }
}

// ── 2) 서버가 아는 /api 토큰 (문자열+정규식, 주석 제거 후, 넉넉히) ──
const server = new Set();
for (const f of walk(SRC, [], /\.ts$/)) {
  // 정규식의 이스케이프 슬래시(\/)를 실제 /로 풀면 문자열·정규식을 한 방식으로 훑을 수 있다
  const clean = stripComments(readFileSync(f, 'utf8'), false).replace(/\\\//g, '/');
  for (const m of clean.matchAll(/\/api\/[a-z0-9/_$-]*/gi)) {
    const t = m[0].replace(/\$.*$/, '').replace(/\/+$/, '').toLowerCase(); // 템플릿 ${..} 앞에서 자름
    if (t && seg(t) >= 2) server.add(t);
  }
}

// ── 3) 대조 — 화면 경로 p 가 서버 토큰과 정확·접두·자식 어느 방향으로든 겹치면 살아있음 ──
function alive(p) {
  for (const t of server) {
    if (p === t) return true;
    if (p.startsWith(t + '/')) return true; // 서버 토큰이 접두 (예: /api/rooms → /api/rooms/x/kick)
    if (t.startsWith(p + '/')) return true; // 화면이 템플릿으로 잘려 짧아짐 (예: p=/api/rooms, t=/api/rooms/x)
  }
  return false;
}

const dead = [];
for (const [p, sites] of feHits) if (!alive(p)) dead.push({ path: p, sites: [...sites].sort() });
dead.sort((a, b) => a.path.localeCompare(b.path));
const deadPaths = dead.map(d => d.path);

console.log(`화면 고유 /api ${feHits.size}개 · 서버 토큰 ${server.size}개 · 서버에 없는 죽은 경로 ${dead.length}개`);

if (UPDATE) {
  writeFileSync(SNAP, JSON.stringify({ dead: deadPaths, sites: dead }, null, 2) + '\n');
  console.log(`📌 스냅샷 고정 — 죽은 경로 ${dead.length}개`);
  process.exit(0);
}

let snap;
try { snap = JSON.parse(readFileSync(SNAP, 'utf8').replace(/^﻿/, '')); }
catch (e) {
  console.log(`\n🚨 ${SNAP} 을 읽을 수 없습니다 — 검사가 꺼진 채 통과시키지 않습니다.\n   ${e.message}`);
  console.log(`   최초 생성:  node test-harness/frontend_api_scan_harness.mjs --update`);
  process.exit(1);
}

const known = new Set(snap.dead || []);
const fresh = deadPaths.filter(p => !known.has(p));

if (fresh.length) {
  console.log(`\n🚨 화면이 «서버에 없는» API 를 새로 부르기 시작했습니다 ${fresh.length}개 — 누르면 404 입니다:`);
  for (const p of fresh) for (const s of dead.find(d => d.path === p).sites) console.log(`    ${p}   ← ${s}`);
  console.log(`\n  서버에 핸들러를 만들거나(+ 게이트 등록), 화면에서 그 호출을 지우세요.`);
  console.log(`  의도적으로 죽은 채 두려면:  node test-harness/frontend_api_scan_harness.mjs --update`);
  console.log(`\n${fresh.length} FAIL`);
  process.exit(1);
}

console.log(`\n✅ 서버에 없는 새 호출 없음`);
if (deadPaths.length) {
  console.log(`  ⚠ 스냅샷에 등재된 죽은 경로 ${deadPaths.length}개 (기능 완성/삭제는 사람 판단 대기):`);
  for (const p of deadPaths) console.log(`     ${p}`);
}
process.exit(0);
