// -*- coding: utf-8 -*-
// 🧪 이탈 전염(churn-contagion.ts) 엔진 테스트 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/churn_contagion_harness.mjs
//   대상:  cloudflare-deploy/src/churn-contagion.ts + index.ts 배선 + admin.html 리텐션 센터 허브
//
//   검증 전략 (teacher_match_harness.mjs 와 동일 컨벤션):
//     ① 순수 로직 미러(mapStatus · chunk · band 판정)
//     ② Cypher 사양 정합성: 1~2홉 경로, 이탈→재원 방향, 관계 3종, 가중 파라미터
//     ③ 보안/배선 드리프트 가드:
//        - /api/admin/churn-contagion/* 가 isAdminPath 에 등록(인증 보호)되어 있는가  ← 보안
//          (teacher-match 에서 실제로 터졌던 회귀 — 라우터 연결≠인증보호)
//        - index.ts 라우트 디스패치 + KST 03:00 cron sync 배선
//     ④ admin.html 🧲 리텐션 센터 허브: 허브 카드·탭·멤버 통합·인덱스 필터·점프 래핑
//        - card-retention(보관기간 자동 파기)은 고객유지와 무관 — 멤버에 끼면 안 됨

import { readFileSync, existsSync } from 'node:fs';
import { allAdm } from './_srcbundle.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const CF = resolve(__dir, '../cloudflare-deploy');
const read = p => existsSync(p) ? readFileSync(p, 'utf8') : '';

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) { if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`); }
const eq = (name, a, b) => check(`${name} (=${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b));

// ═══════════════ 미러링된 순수 로직 (churn-contagion.ts 와 동일 사양) ═══════════════
const ACTIVE = ['정상', '활동'];
const CHURNED = ['이탈', '탈퇴', '퇴원'];
function mapStatus(raw) {
  const s = String(raw ?? '').trim();
  if (!s || ACTIVE.includes(s)) return 'active';
  if (CHURNED.includes(s)) return 'churned';
  return null;
}
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
const BAND = { high: 1.0, medium: 0.45 };
const band = s => s >= BAND.high ? 'high' : s >= BAND.medium ? 'medium' : 'low';

// ═══════════════ [1] 상태 매핑 ═══════════════
console.log('\n[1] mapStatus — students_erp.status → 그래프 status');
eq('정상 → active', mapStatus('정상'), 'active');
eq('활동 → active', mapStatus('활동'), 'active');
eq('NULL → active', mapStatus(null), 'active');
eq('빈문자 → active', mapStatus(''), 'active');
eq('퇴원 → churned', mapStatus('퇴원'), 'churned');
eq('이탈 → churned', mapStatus('이탈'), 'churned');
eq('탈퇴 → churned', mapStatus('탈퇴'), 'churned');
eq('휴면(애매) → 제외(null)', mapStatus('휴면'), null);
eq('공백 트림', mapStatus(' 정상 '), 'active');

// ═══════════════ [2] chunk / band ═══════════════
console.log('\n[2] chunk · band 판정');
eq('7개를 3씩 → [3,3,1]', chunk([1,2,3,4,5,6,7], 3).map(c => c.length), [3,3,1]);
eq('빈배열 → 0청크', chunk([], 800).length, 0);
eq('score 1.2 → high', band(1.2), 'high');
eq('score 1.0(경계) → high', band(1.0), 'high');
eq('score 0.5 → medium', band(0.5), 'medium');
eq('score 0.44 → low', band(0.44), 'low');

// ═══════════════ [3] Cypher 사양 정합성 ═══════════════
console.log('\n[3] churn-contagion.ts Cypher 사양');
const src = read(resolve(CF, 'src/churn-contagion.ts'));
check('소스 존재', src.length > 0);
check('RISK: 1~2홉 가변 경로(*1..2)', /FAMILY_OF\|REFERRED\|TOOK_CLASS_WITH\*1\.\.2/.test(src));
check("RISK: 이탈(churned) → 재원(active) 필터", src.includes("c.status = 'churned'") && src.includes("s.status = 'active'"));
check('RISK: 자기 자신 제외(c <> s)', src.includes('c <> s'));
check('RISK: 경로 가중 reduce', /reduce\(w = 1\.0, rel IN relationships\(path\)/.test(src));
check('RISK: 홉 감쇠 파라미터($hopDecay)', src.includes('$hopDecay'));
check('가중치: 가족(1.0) > 추천(0.85) > 동반수업(0.5)',
  src.includes('FAMILY_OF: 1.0') && src.includes('REFERRED: 0.85') && src.includes('TOOK_CLASS_WITH: 0.5'));
check('ETL: 멱등 MERGE 로 Student 적재', /MERGE \(n:Student \{student_id: s\.student_id\}\)/.test(src));
check('ETL: FAMILY_OF 무방향 MERGE', /MERGE \(a\)-\[:FAMILY_OF\]-\(b\)/.test(src));
check('ETL: TOOK_CLASS_WITH 에 classes 가중 저장', /SET r\.classes = p\.cnt/.test(src));
check('ETL: 가족쌍 a<b 중복 제거', src.includes('a.student_uid < b.student_uid'));
check('ETL: 동반수업 role=student 필터', src.includes("a.role = 'student'"));
check('ETL: students_erp 이름컬럼 PRAGMA 동적 탐지', src.includes('PRAGMA table_info(students_erp)'));
check('teacher-match 의 runCypher 재사용(중복 구현 금지)', src.includes("from './teacher-match'"));
check('Neo4j 미설정 → Neo4jNotConfiguredError 503 매핑', src.includes('Neo4jNotConfiguredError') && src.includes('503'));

// ═══════════════ [4] index.ts 배선 (보안 포함) ═══════════════
console.log('\n[4] index.ts 배선 — 라우트·인증·cron');
const idx = read(resolve(CF, 'src/index.ts'));
check('import 배선', idx.includes("from './churn-contagion'"));
check('라우트 디스패치', idx.includes("path.startsWith('/api/admin/churn-contagion/')") && idx.includes('churnContagionRouter(request, env)'));
// 🔴 보안 회귀 가드: isAdminPath 등록 누락 시 인증 없이 공개됨 (teacher-match 전례)
const adminFnBody = idx.slice(idx.indexOf('function isAdminPath'));
check('🔐 isAdminPath 에 /api/admin/churn-contagion/ 등록(인증 보호)',
  adminFnBody.includes("path.startsWith('/api/admin/churn-contagion/')"));
check('cron: runContagionGraphSync 호출', idx.includes('runContagionGraphSync(env as any)'));
check('cron: NEO4J_QUERY_URL 게이트(미설정 시 skip)',
  /if \(env\.NEO4J_QUERY_URL\) \{\s*\n\s*try \{\s*\n\s*const cs = await runContagionGraphSync/.test(idx));

// ═══════════════ [5] admin.html 🧲 리텐션 센터 허브 ═══════════════
console.log('\n[5] admin.html 리텐션 센터 허브');
const html = allAdm();
check('허브 스크립트 존재(initRetentionCenterHub)', html.includes('initRetentionCenterHub'));
check('허브 CSS 존재(rc-hub-css)', html.includes('id="rc-hub-css"'));
check('허브 카드 id = card-retention-center', html.includes("hub.id = 'card-retention-center'"));
const memberBlock = html.slice(html.indexOf('var MEMBERS = ['), html.indexOf('var MEMBER_CARD_IDS'));
check('멤버: 전염 위험 탭(__contagion)', memberBlock.includes("'__contagion'"));
check('멤버: card-retention-risk', memberBlock.includes("'card-retention-risk'"));
check('멤버: card-referral', memberBlock.includes("'card-referral'"));
check('멤버: card-nps-monthly', memberBlock.includes("'card-nps-monthly'"));
check('멤버: card-alumni', memberBlock.includes("'card-alumni'"));
check("⚠ card-retention(보관기간 파기)은 멤버가 아님 — 고객유지와 무관", !memberBlock.includes("'card-retention',") && !memberBlock.includes("'card-retention'\n"));
check('RBAC 유지: 멤버의 menu-card 클래스 제거 안 함(remove 호출 없음)',
  !/classList\.remove\('menu-card'\)/.test(html.slice(html.indexOf('initRetentionCenterHub'))));
check('사이드바 인덱스 필터: buildMenuIndex 래핑', html.includes('_origBMI') && html.includes('MEMBER_CARD_IDS.indexOf(m.id) === -1'));
check('검색/AI 호환: jumpToMenu 래핑(멤버 → 허브 탭 활성화)', html.includes('_origJump') && html.includes("_origJump.call(this, 'card-retention-center'"));
check('API 연동: /api/admin/churn-contagion/ fetch', html.includes("'/api/admin/churn-contagion/'"));
check('전염 탭 lazy 로드(허브 open 시에만)', html.includes('hub.open && !panels.__contagion.dataset.loaded'));
check('SB_ID_MAP 에 허브 분류(dash) 등록', html.includes("SB_ID_MAP['card-retention-center'] = 'dash'"));
check('전역 button CSS 대비 탭 !important 고정', /\.rc-tab\.active\{background:linear-gradient\(135deg,#ec4899,#8b5cf6\)!important/.test(html));

// ═══════════════ 결과 ═══════════════
console.log(`\n════════ 결과: ${PASS} 통과 / ${FAIL} 실패 ════════`);
if (FAILS.length) { console.log('실패 목록:'); FAILS.forEach(f => console.log('  ❌ ' + f)); process.exit(1); }
