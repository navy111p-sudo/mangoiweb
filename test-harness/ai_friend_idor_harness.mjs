/**
 * ai_friend_idor_harness.mjs
 * ── "AI 친구 대화는 본인(서명 토큰) 것만 읽고/지울 수 있다" IDOR 회귀 가드 ──
 *
 * 취약점(수정 전): /api/ai/chat-friend, /api/ai/chat-history, /api/ai/chat-clear 가
 * 클라이언트가 보낸 uid 만 믿고 D1 ai_friend_chats 를 읽고/지움 → 누구나 임의 uid 로
 * 타 학생 대화 열람·삭제 가능.
 *
 * 불변식(수정 후):
 *  1) 세 엔드포인트 모두 서명 토큰 검증(authUidFromRequest) + uid 일치 확인 후에만 DB 접근
 *  2) 토큰은 HMAC-SHA256 서명 + 만료(exp) 검증 (verifyUidToken)
 *  3) 로그인(/api/student/login) 성공 응답에 서명 토큰 포함
 *  4) 게스트 uid 는 클라이언트 생성 금지 → 서버 발급(crypto.getRandomValues) + 단기 토큰
 *  5) index.ts 라우트 게이트에 /api/ai/chat-guest-token 등록
 *  6) 프론트(ai-friend.html)는 Authorization: Bearer 로 토큰 동봉, 게스트는 sessionStorage 스코프
 *  7) 로그아웃 시 mango_token 폐기 (index.html setUser(null))
 *
 * 실행: node test-harness/ai_friend_idor_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { allSrc } from './_srcbundle.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CF = join(__dirname, '..', 'cloudflare-deploy');
const read = (p) => readFileSync(join(CF, p), 'utf8');

let pass = 0, fail = 0; const out = [];
const ok = (c, l) => { c ? (pass++, out.push('  ✅ ' + l)) : (fail++, out.push('  ❌ ' + l)); };

const apiMango = allSrc();
const indexTs = read('src/index.ts');
const aiFriend = read('public/ai-friend.html');
const indexHtml = read('public/index.html');
const reportHtml = read('public/report.html');

// ── 헬퍼: path 핸들러 블록 추출 (다음 "if (method ===" 전까지) ──
function handlerBlock(src, pathLit) {
  const start = src.indexOf(pathLit);
  if (start < 0) return '';
  const rest = src.slice(start);
  const next = rest.indexOf("if (method ===", 10);
  return next > 0 ? rest.slice(0, next) : rest.slice(0, 4000);
}

// 1) 세 엔드포인트 모두 토큰 검증 + uid 일치 확인이 DB 접근보다 먼저
for (const p of ['/api/ai/chat-friend', '/api/ai/chat-history', '/api/ai/chat-clear']) {
  const blk = handlerBlock(apiMango, `path === '${p}'`);
  ok(blk.includes('authUidFromRequest'), `${p} — 서명 토큰 검증(authUidFromRequest) 수행`);
  ok(/authUid\s*!==\s*uid/.test(blk), `${p} — 토큰 uid 와 요청 uid 일치 강제 (불일치 403)`);
  const authIdx = blk.indexOf('authUidFromRequest');
  const dbIdx = blk.indexOf('env.DB.prepare');
  ok(authIdx > 0 && (dbIdx < 0 || authIdx < dbIdx), `${p} — 인증이 DB 접근보다 먼저 수행됨`);
  ok(/auth_required/.test(blk), `${p} — 토큰 없으면 401 auth_required`);
}

// 2) 토큰 유틸: HMAC-SHA256 서명 + 만료 검증
ok(/const\s+signUidToken\s*=/.test(apiMango) && /const\s+verifyUidToken\s*=/.test(apiMango),
  'signUidToken / verifyUidToken 유틸 존재');
const verifyBlk = handlerBlock(apiMango, 'const verifyUidToken');
ok(/crypto\.subtle\.verify\('HMAC'/.test(verifyBlk), 'verifyUidToken — HMAC-SHA256 서명 검증');
ok(/p\.exp\s*&&\s*p\.exp\s*<\s*Date\.now\(\)/.test(verifyBlk), 'verifyUidToken — 만료(exp) 검증');

// 3) 로그인 응답에 토큰 포함
const loginBlk = handlerBlock(apiMango, "path === '/api/student/login'");
ok(/token:\s*await\s+signUidToken\(uid\)/.test(loginBlk), '/api/student/login — 성공 시 서명 토큰 발급');

// 4) 게스트 토큰: 서버 발급 랜덤 uid (클라이언트 Math.random uid 금지)
const guestBlk = handlerBlock(apiMango, "path === '/api/ai/chat-guest-token'");
ok(/crypto\.getRandomValues/.test(guestBlk), '/api/ai/chat-guest-token — 서버가 crypto 랜덤 uid 발급');
ok(/signUidToken\(guestUid/.test(guestBlk), '/api/ai/chat-guest-token — 게스트 uid 에도 서명 토큰');
ok(!/['"]guest_['"]\s*\+\s*\(?Math\.random/.test(aiFriend), 'ai-friend.html — 클라이언트 Math.random 게스트 uid 제거됨');

// 5) index.ts 라우트 게이트 등록
ok(indexTs.includes("path === '/api/ai/chat-guest-token'"), 'index.ts — /api/ai/chat-guest-token 게이트 등록');

// 6) 프론트: Bearer 토큰 동봉 + 게스트 sessionStorage 스코프
ok((aiFriend.match(/'Authorization':\s*'Bearer '\s*\+\s*auth\.token/g) || []).length >= 3,
  'ai-friend.html — 대화/기록/삭제 모두 Authorization: Bearer 동봉');
ok(/sessionStorage\.setItem\('mango_guest_chat'/.test(aiFriend),
  'ai-friend.html — 게스트 자격은 sessionStorage(세션 스코프)에만 보관');
ok(/localStorage\.setItem\('mango_token'/.test(indexHtml) && /localStorage\.setItem\('mango_token'/.test(reportHtml),
  'index.html + report.html — 로그인 성공 시 mango_token 저장');

// 7) 로그아웃 시 토큰 폐기
ok(/removeItem\('mango_token'\)/.test(indexHtml), 'index.html — 로그아웃(setUser(null)) 시 mango_token 폐기');

// ── (옵션) 라이브 검증: MANGO_BASE 설정 시 배포 워커 상대로 실제 차단 확인 ──
const BASE = process.env.MANGO_BASE || '';
async function live() {
  if (!BASE) { out.push('  ⏭ 라이브 검증 생략 (MANGO_BASE 미설정 — 예: https://<worker>.workers.dev)'); return; }
  const j = async (r) => { try { return await r.json(); } catch { return {}; } };
  // 토큰 없이 타인 uid 열람 → 401 이어야 함
  const r1 = await fetch(`${BASE}/api/ai/chat-history?uid=student`);
  ok(r1.status === 401, `LIVE — 토큰 없는 chat-history 는 401 (실제 ${r1.status})`);
  // 토큰 없이 삭제 → 401
  const r2 = await fetch(`${BASE}/api/ai/chat-clear`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: 'student' }) });
  ok(r2.status === 401, `LIVE — 토큰 없는 chat-clear 는 401 (실제 ${r2.status})`);
  // 게스트 토큰 발급 → 본인 uid 로는 정상 동작
  const g = await j(await fetch(`${BASE}/api/ai/chat-guest-token`, { method: 'POST' }));
  ok(g.ok && g.uid && g.token, 'LIVE — 게스트 토큰 발급 정상');
  if (g.ok) {
    const r3 = await fetch(`${BASE}/api/ai/chat-history?uid=${encodeURIComponent(g.uid)}`, { headers: { Authorization: `Bearer ${g.token}` } });
    ok(r3.status === 200, `LIVE — 본인 토큰 + 본인 uid 는 200 (실제 ${r3.status})`);
    // 게스트 토큰으로 타인 uid 열람 → 403
    const r4 = await fetch(`${BASE}/api/ai/chat-history?uid=student`, { headers: { Authorization: `Bearer ${g.token}` } });
    ok(r4.status === 403, `LIVE — 남의 uid 는 403 uid_mismatch (실제 ${r4.status})`);
  }
}

await live();

console.log('\n🔐 AI 친구 대화 IDOR 회귀 하니스');
console.log(out.join('\n'));
console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
