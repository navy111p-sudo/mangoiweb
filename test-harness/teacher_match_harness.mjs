// -*- coding: utf-8 -*-
// 🧪 강사 매칭(teacher-match.ts) 추천 엔진 테스트 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/teacher-match_harness.mjs  (또는 teacher_match_harness.mjs)
//   대상:  cloudflare-deploy/src/teacher-match.ts + index.ts 배선 + teacher-match.html
//
//   검증 전략:
//     ① 순수 로직 미러(splitInterests · isValidMbti · toNumber · 추천 행매핑)
//     ② Cypher 사양 정합성: 점수 공식(관심사×10 + MBTI궁합20), MBTI궁합 무방향
//     ③ 보안/배선 드리프트 가드:
//        - /api/admin/teacher-match/* 가 isAdminPath 에 등록(인증 보호)되어 있는가  ← 보안
//        - ETL 이 MBTI 없는 학생의 '관심사'도 적재하는가(관심사가 mbti 필터에 막히면 안 됨)
//        - /admin/teacher-match.html 관리자 페이지가 존재하는가(404 방지)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const CF = resolve(__dir, '../cloudflare-deploy');
const read = p => existsSync(p) ? readFileSync(p, 'utf8') : '';
const exists = p => existsSync(p);

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) { if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`); }
const eq = (name, a, b) => check(`${name} (=${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b));

// ═══════════════════ 미러링된 순수 로직 (teacher-match.ts 와 동일 사양) ═══════════════════
function splitInterests(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const parts = raw.split(/[\/,，、;·|]+/).map(s => s.trim()).filter(Boolean);
  return Array.from(new Set(parts));
}
const isValidMbti = s => /^[IE][NS][TF][JP]$/.test(s);
function toNumber(v) {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'low' in v) return v.low;
  return Number(v) || 0;
}
// 추천 점수 공식(Cypher RECOMMEND_QUERY 와 동일): 관심사 공통수×10 + (MBTI궁합?20:0)
const score = (shared, compat) => shared * 10 + (compat ? 20 : 0);

// ═══════════════════ [1] 관심사 파싱 ═══════════════════
console.log('\n[1] splitInterests — 자유텍스트 → 관심사 배열');
eq('슬래시 구분', splitInterests('드라마/요리/여행'), ['드라마', '요리', '여행']);
eq('콤마+공백', splitInterests('독서, 체스 , 등산'), ['독서', '체스', '등산']);
eq('중복 제거', splitInterests('게임/게임/코딩'), ['게임', '코딩']);
eq('중점·전각콤마·이데오그래픽콤마·세미콜론 혼합', splitInterests('A·B，C、D;E'), ['A', 'B', 'C', 'D', 'E']);
eq('빈/널 → 빈배열', splitInterests(''), []);
eq('비문자열 → 빈배열', splitInterests(null), []);

// ═══════════════════ [2] MBTI 검증 ═══════════════════
console.log('\n[2] isValidMbti — 16유형 형식 검증');
check('INTJ 유효', isValidMbti('INTJ'));
check('ENFP 유효', isValidMbti('ENFP'));
check('소문자 무효(대문자화는 호출부 책임)', !isValidMbti('intj'));
check('XXXX 무효', !isValidMbti('XXXX'));
check('5글자 무효', !isValidMbti('INTJP'));
check('빈문자 무효', !isValidMbti(''));

// ═══════════════════ [3] toNumber 정규화 ═══════════════════
console.log('\n[3] toNumber — Query API 정수 정규화');
eq('number 그대로', toNumber(30), 30);
eq('{low,high} → low', toNumber({ low: 7, high: 0 }), 7);
eq('문자열 숫자', toNumber('12'), 12);
eq('null → 0', toNumber(null), 0);

// ═══════════════════ [4] 추천 점수 공식 + 행 매핑 ═══════════════════
console.log('\n[4] 점수 공식 + 결과 행 매핑');
eq('관심사3 + 궁합 = 50', score(3, true), 50);
eq('관심사2 + 비궁합 = 20', score(2, false), 20);
eq('관심사0 + 궁합 = 20', score(0, true), 20);
eq('접점 전무 = 0(추천 제외 대상)', score(0, false), 0);
{
  // values/fields → TeacherRecommendation 매핑 미러
  const fields = ['teacherId', 'teacherName', 'teachingStyle', 'sharedInterests', 'interestScore', 'mbtiScore', 'totalScore'];
  const idx = n => fields.indexOf(n);
  const row = ['T01', '김쌤', '활발', { low: 3, high: 0 }, 30, 20, 50];
  const rec = {
    teacherId: row[idx('teacherId')], teacherName: row[idx('teacherName')],
    teachingStyle: row[idx('teachingStyle')] ?? null,
    sharedInterests: toNumber(row[idx('sharedInterests')]),
    totalScore: toNumber(row[idx('totalScore')]),
  };
  eq('행 매핑(공유관심사 정수화)', [rec.teacherId, rec.sharedInterests, rec.totalScore], ['T01', 3, 50]);
}

// ═══════════════════ [5] Cypher 사양 정합성 (소스 문자열 검증) ═══════════════════
console.log('\n[5] teacher-match.ts Cypher 사양');
const tm = read(resolve(CF, 'src/teacher-match.ts'));
check('추천 점수: 관심사 ×10', tm.includes('sharedInterests * 10'));
check('추천 점수: MBTI 궁합 20', /THEN 20 ELSE 0/.test(tm));
check('MBTI 궁합 무방향 매칭', tm.includes('(sm)-[:COMPATIBLE_WITH]-(tm)'));
check('totalScore>0 만 추천', tm.includes('totalScore > 0'));
check('limit 1~50 클램프', tm.includes('Math.min(Math.max(limit, 1), 50)'));
check('Neo4j 미설정 → 503 매핑', tm.includes('Neo4jNotConfiguredError') && tm.includes('503'));

// ═══════════════════ [6] 🔴 보안/배선 드리프트 가드 ═══════════════════
console.log('\n[6] 보안·배선 가드 (버그 탐지)');
const index = read(resolve(CF, 'src/index.ts'));
// (보안) 라우트가 라우팅에는 연결됐는데 인증(isAdminPath)에는 빠지면 공개 노출
check('라우터 연결됨', index.includes("path.startsWith('/api/admin/teacher-match/')") && index.includes('teacherMatchRouter'));
// isAdminPath 함수 본문에 teacher-match 보호가 있는지(라우터 연결과 별개로 2개 이상 등장해야)
{
  const adminIdx = index.indexOf('function isAdminPath');
  const inAdmin = adminIdx >= 0 && index.indexOf("'/api/admin/teacher-match/'", adminIdx) >= 0;
  check('🔴 isAdminPath 에 /api/admin/teacher-match/ 인증 보호 등록', inAdmin);
}
// (기능) ETL 이 MBTI 없는 학생의 관심사도 적재 — 관심사 UNWIND/FOREACH 가 mbti 필터에 막히면 버그
{
  // 학생 적재 쿼리에서 'WHERE s.mbti' 가 관심사 적재(INTERESTED_IN) 보다 앞서면 누락 버그
  const q = (tm.match(/LOAD_STUDENTS_QUERY = `([\s\S]*?)`/) || [])[1] || '';
  const mbtiGate = q.search(/WHERE\s+s\.mbti/);
  const interestLoad = q.indexOf('INTERESTED_IN');
  const ok = interestLoad >= 0 && (mbtiGate === -1 || mbtiGate > interestLoad ||
             /FOREACH[\s\S]*s\.interests/.test(q)); // FOREACH 로 mbti 무관 적재면 OK
  check('🟠 ETL: MBTI 없는 학생도 관심사 적재(관심사가 mbti 필터에 막히지 않음)', ok);
}
// (404) 관리자 페이지 실재
check('🟠 /admin/teacher-match.html 페이지 존재(404 방지)', exists(resolve(CF, 'public/admin/teacher-match.html')));

// ═══════════════════ 결과 ═══════════════════
console.log('\n====================================================');
console.log(`🎯 총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('❌ 실패 항목(버그):'); for (const f of FAILS) console.log('   - ' + f); }
else console.log('🎉 강사매칭 — 점수공식·파싱·보안배선·ETL·페이지 모두 정상');
console.log('====================================================');
process.exit(FAIL ? 1 : 0);
