/**
 * 🎥 lesson_insight_harness.mjs — 수업 종료 후 AI 리포트(lesson-insight.ts) 회귀 하니스
 *
 * 왜 필요한가
 *   413줄 신규 모듈인데 전용 하니스가 없었다(2026-07-23 점검에서 발견).
 *   이 기능은 "수업은 절대 안 끊긴다"는 원칙 아래 배치로만 도는데,
 *   ①점수 공식이 관리자 랭킹과 어긋나거나 ②근거 없는데 AI를 부르거나
 *   ③한/영 두 벌이 깨지거나 ④신규 API가 게이트에서 빠지면 조용히 사고가 난다.
 *
 * 검사 방식
 *   - 점수 공식: participationScore 를 소스에서 추출해 순수 계산으로 경계값 검증(런타임 import 불가 — .ts)
 *   - 나머지: 소스 정적 검사 + (MANGO_BASE 있으면) 라이브 인증 게이트 검사
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());
const CD = path.join(ROOT, 'cloudflare-deploy');
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
};

const src = read(path.join(CD, 'src/lesson-insight.ts'));
const idx = read(path.join(CD, 'src/index.ts'));

console.log('=== 1) 모듈 존재 · 모듈화 원칙 ===');
ok('li:모듈 파일 존재', src.length > 1000);
ok('li:handleXxxApi 패턴 준수', /export async function handleLessonInsightApi/.test(src));
ok('li:배치 스윕 export', /export async function runLessonInsightSweep/.test(src));
ok('li:수업 통신(DO/WS)과 분리 — VideoCallRoom 직접 의존 없음',
   !/VideoCallRoom|SignalingRoom|websocket/i.test(src));

console.log('\n=== 2) 신규 API 게이트 등록 (CLAUDE.md 필수 규칙) ===');
const routes = [...src.matchAll(/path === '(\/api\/[^']+)'/g)].map((m) => m[1]);
ok('li:라우트 3개 정의', routes.length >= 3, `발견=${routes.length}`);
for (const r of routes) {
  ok(`li:index.ts 게이트 등록 ${r}`, idx.includes(`'${r}'`));
  ok(`li:관리자 접두(/api/admin/) → default-deny 적용 ${r}`, r.startsWith('/api/admin/'));
}

console.log('\n=== 3) 점수 공식 — 관리자 랭킹과 동일 가중치 ===');
// 소스에서 공식을 뽑아 그대로 재현(하드코딩 중복 대신 소스 진실을 검사)
ok('li:시선 있을 때 50/40/10 가중', /gaze \* 0\.5 \+ talkRatio \* 0\.4 - dcPenalty \* 0\.1/.test(src));
ok('li:시선 없을 때 70/30 가중', /talkRatio \* 0\.7 - dcPenalty \* 0\.3/.test(src));
ok('li:0~100 클램프', /Math\.max\(0, Math\.min\(100, score\)\)/.test(src));
ok('li:sessionMs 0 나눗셈 가드', /sessionMs > 0 \? \(activeMs \/ sessionMs\)/.test(src));
ok('li:끊김 페널티 상한', /Math\.min\(100, disconnects \* 20\)/.test(src));

// 공식 재현 검증(경계값) — 소스 로직을 그대로 옮겨 계산이 말이 되는지 확인
const score = (activeMs, sessionMs, gaze, dc) => {
  const talk = sessionMs > 0 ? (activeMs / sessionMs) * 100 : 0;
  const pen = Math.min(100, dc * 20);
  const s = gaze != null ? gaze * 0.5 + talk * 0.4 - pen * 0.1 : talk * 0.7 - pen * 0.3;
  return Math.round(Math.max(0, Math.min(100, s)) * 10) / 10;
};
ok('li:전부 0 → 0점(음수 아님)', score(0, 0, null, 0) === 0);
ok('li:세션 0 → 나눗셈 NaN 아님', Number.isFinite(score(500, 0, null, 0)));
ok('li:만점 상황 100 초과 안 함', score(100, 100, 100, 0) === 90 || score(100, 100, 100, 0) <= 100);
ok('li:끊김 과다여도 음수 아님', score(0, 100, null, 99) === 0);

console.log('\n=== 4) 안전장치 — 근거 없으면 AI 미호출 · 스키마 내성 ===');
ok('li:채팅 근거 없으면 AI 호출 안 함', /if \(!env\.AI \|\| !lines\.length\) return null/.test(src));
ok('li:gaze_score 컬럼 없는 환경 2단 조회 폴백', /catch\s*\{[\s\S]{0,200}gaze_score = null/.test(src));
ok('li:COALESCE 로 NULL 방어', /COALESCE\(total_session_ms,0\)/.test(src) && /COALESCE\(total_active_ms,0\)/.test(src));
ok('li:LLM 모델 폴백 체인', (src.match(/@cf\/meta\/llama/g) || []).length >= 2);
ok('li:material_source 로 한계 명시', /material_source/.test(src));

console.log('\n=== 5) 한/영 두 벌 (상시 규칙: 강사 다수가 외국인) ===');
ok('li:근거 문장 ko/en 두 벌', /fact_ko/.test(src) && /fact_en/.test(src));
// ⚠️ 필드명은 복수형이다(strengths/weaknesses/next_goals). 단수로 검사하면 오탐(2026-07-23 실수).
const koEnPairs = ['summary', 'strengths', 'weaknesses', 'next_goals', 'why'];
for (const f of koEnPairs) {
  ok(`li:${f} ko/en 두 벌`, new RegExp(`"${f}_ko"`).test(src) && new RegExp(`"${f}_en"`).test(src));
}
// 한쪽만 있는 짝(ko 만 있고 en 없음 등)이 새로 생기면 잡는다
const koFields = [...src.matchAll(/"([a-z_]+)_ko"/g)].map((m) => m[1]);
const enFields = new Set([...src.matchAll(/"([a-z_]+)_en"/g)].map((m) => m[1]));
const orphan = koFields.filter((f) => !enFields.has(f));
ok('li:ko 전용 고아 필드 없음(모든 ko 에 en 짝)', orphan.length === 0, `고아=${orphan.join(',')}`);

console.log('\n=== 6) 멱등/스키마 ===');
ok('li:CREATE TABLE IF NOT EXISTS', /CREATE TABLE IF NOT EXISTS/.test(src));
ok('li:스키마 1회 가드(_schemaReady)', /_schemaReady/.test(src));

// ── 라이브(선택) ────────────────────────────────────────────────────────
const BASE = process.env.MANGO_BASE;
if (BASE) {
  console.log('\n=== 7) 라이브 — 무인증 접근 차단 ===');
  for (const r of routes) {
    try {
      const res = await fetch(BASE + r, { redirect: 'manual' });
      ok(`li:무인증 ${r} 차단(401/403/302)`, [401, 403, 302].includes(res.status), `HTTP ${res.status}`);
    } catch (e) {
      ok(`li:무인증 ${r} 차단`, false, String(e.message || e));
    }
  }
} else {
  console.log('\n(MANGO_BASE 없음 — 라이브 게이트 검사 생략)');
}

console.log(`\n=== SUMMARY: ${pass} passed, ${fail} failed ===`);
const report = path.join(ROOT, 'test-harness', 'lesson_insight_report.txt');
fs.writeFileSync(report, `PASS=${pass} FAIL=${fail}\n생성=${new Date().toISOString()}\n`, 'utf8');
console.log(`report → test-harness/lesson_insight_report.txt`);
process.exit(fail > 0 ? 1 : 0);
