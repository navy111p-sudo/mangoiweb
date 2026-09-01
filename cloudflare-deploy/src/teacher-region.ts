/* 🌏 강사 «구분»(국가권) 판정 — 정본 한 곳
 *
 * 왜 있나 (2026-09-01 사장님 「국가 추가해서 필리핀, 북미, 중국, 이렇게도 나눠줘 / 구분칸 추가해줘」)
 *   강사 명부를 나라별로 훑을 길이 없었다. 필터는 상태·그룹 둘뿐이었다.
 *
 * ⚠️ 먼저 «있는 데이터» 를 셌다(추측이 아니라 실측 2026-09-01, 운영 D1 33행):
 *     teacher_profiles.nationality  … 채워진 행 **1개**(테스트강사 PH). 나머지 32행 전부 NULL
 *     teacher_profiles.origin_region / active_region … 한글로 거의 다 차 있음
 *         필리핀 24 · 미국캐나다 2 · 중국 2 · (빈칸) 4~5
 *   ⟹ nationality «만» 보면 강사 32명이 전부 「미지정」으로 뜬다. 그래서 판정은
 *      ① nationality(ISO 2글자) → ② origin_region → ③ active_region → ④ group_name 순이다.
 *   ⛔ 그렇다고 없는 값을 지어내지 않는다 — 아무 단서도 없으면 '' (미지정) 이다.
 *      (CLAUDE.md 2장 「측정할 수 없는 값을 그럴듯하게 채우고 싶을 때」)
 *
 * ⚠️ 한 필드 안에서 «두 구분» 이 잡히면 그 필드는 못 쓰는 것으로 보고 다음 필드로 넘어간다.
 *    아무 쪽에 몰아주면 그게 곧 오답이다(가맹점 정산의 「같은 이름 지사」와 같은 규칙).
 *    ℹ️ 실측값 「미국캐나다」는 둘 다 북미라 충돌이 아니다.
 *
 * ⛔ 이 판정을 화면(js)이나 SQL 에 복제하지 말 것. 서버가 목록에 `region` 을 실어 주고
 *    화면은 그것을 그리기만 한다. 두 벌이 되면 반드시 어긋난다(이 저장소의 반복 사고).
 * 감시: test-harness/teacher_region_harness.mjs — 이 파일을 컴파일해 실제로 돌린다.
 */

export const TEACHER_REGION_PH  = 'PH';    // 필리핀
export const TEACHER_REGION_NA  = 'NA';    // 북미(미국·캐나다)
export const TEACHER_REGION_CN  = 'CN';    // 중국
export const TEACHER_REGION_ETC = 'ETC';   // 그 밖의 «아는» 나라 (한국·영국·호주·베트남…)

/** 화면 필터가 쓰는 값 목록. '' 는 «미지정» 이라 여기 없다(따로 `__none__` 으로 보낸다). */
export const TEACHER_REGIONS: string[] = [
  TEACHER_REGION_PH, TEACHER_REGION_NA, TEACHER_REGION_CN, TEACHER_REGION_ETC,
];

/** 「미지정」 필터가 쓰는 값. 구분값이 아니라 «비어 있는 것을 고른다» 는 뜻이다. */
export const TEACHER_REGION_NONE = '__none__';

export const TEACHER_REGION_LABEL_KO: Record<string, string> = {
  PH: '필리핀', NA: '북미', CN: '중국', ETC: '기타 국가',
};
export const TEACHER_REGION_LABEL_EN: Record<string, string> = {
  PH: 'Philippines', NA: 'North America', CN: 'China', ETC: 'Other',
};

/* 나라 코드 → 구분. 목록은 admin.html 의 `#tp-nationality` 선택지와 짝이다
   (하니스가 두 목록을 대조한다 — 화면에만 나라를 늘리면 여기서 조용히 «기타» 가 된다). */
const COUNTRY_REGION: Record<string, string> = {
  PH: TEACHER_REGION_PH,
  US: TEACHER_REGION_NA, CA: TEACHER_REGION_NA,
  CN: TEACHER_REGION_CN,
  KR: TEACHER_REGION_ETC, GB: TEACHER_REGION_ETC, AU: TEACHER_REGION_ETC,
  VN: TEACHER_REGION_ETC, ZZ: TEACHER_REGION_ETC,
};

/* 글자 단서. 한글은 그대로 찾고, 짧은 영문은 «낱말 경계» 로만 찾는다
   — `ph` 를 부분일치로 찾으면 'Alpha'·'Graph' 가 걸린다. */
const TEXT_RULES: Array<{ region: string; ko: string[]; en: RegExp[] }> = [
  { region: TEACHER_REGION_PH, ko: ['필리핀'],
    en: [/\bphilippin\w*\b/, /\bmanila\b/, /\bcebu\b/, /\bph\b/, /\bphl\b/] },
  { region: TEACHER_REGION_NA, ko: ['미국', '캐나다', '북미'],
    en: [/\bunited states\b/, /\busa?\b/, /\bamerica\w*\b/, /\bcanad\w*\b/, /\bnorth america\b/] },
  { region: TEACHER_REGION_CN, ko: ['중국'],
    en: [/\bchina\b/, /\bchinese\b/, /\bcn\b/, /\bbeijing\b/, /\bshanghai\b/] },
];

/** 글자 한 칸에서 구분을 읽는다. 못 읽거나 둘 이상이면 ''. */
export function teacherRegionFromText(raw: unknown): string {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (!s) return '';
  const hit: string[] = [];
  for (const rule of TEXT_RULES) {
    let ok = rule.ko.some(k => s.indexOf(k) >= 0);
    if (!ok) ok = rule.en.some(re => re.test(s));
    if (ok && hit.indexOf(rule.region) < 0) hit.push(rule.region);
  }
  return hit.length === 1 ? hit[0] : '';
}

/** 나라 코드(ISO 2글자)에서 구분을 읽는다. 모르는 «코드» 는 «기타 국가» 다(미지정이 아니다). */
export function teacherRegionFromCountry(raw: unknown): string {
  const c = String(raw == null ? '' : raw).trim().toUpperCase();
  if (!c) return '';
  if (COUNTRY_REGION[c]) return COUNTRY_REGION[c];
  return /^[A-Z]{2}$/.test(c) ? TEACHER_REGION_ETC : '';
}

export interface TeacherRegionSource {
  nationality?: unknown;
  origin_region?: unknown;
  active_region?: unknown;
  group_name?: unknown;
}

/** 강사 한 행의 구분. 아무 단서도 없으면 '' (미지정) — 지어내지 않는다. */
export function resolveTeacherRegion(row: TeacherRegionSource | null | undefined): string {
  if (!row) return '';
  const byCode = teacherRegionFromCountry(row.nationality);
  if (byCode) return byCode;
  // 순서가 곧 «믿는 순서» 다. 출신 지역이 활동 지역보다 국적에 가깝다.
  for (const v of [row.origin_region, row.active_region, row.group_name]) {
    const r = teacherRegionFromText(v);
    if (r) return r;
  }
  return '';
}

/** 화면 라벨. 미지정은 «모른다» 고 적는다(빈칸으로 두면 고장으로 읽힌다). */
export function teacherRegionLabel(region: string, en?: boolean): string {
  const r = String(region || '');
  if (!r) return en ? 'Unset' : '미지정';
  return (en ? TEACHER_REGION_LABEL_EN : TEACHER_REGION_LABEL_KO)[r] || r;
}

/** 필터 한 개가 이 행을 통과시키는가. `TEACHER_REGION_NONE` 은 «미지정만». */
export function teacherRegionMatches(filter: string, region: string): boolean {
  const f = String(filter || '');
  if (!f) return true;                                  // 「전체 구분」
  if (f === TEACHER_REGION_NONE) return !region;
  return f === String(region || '');
}
