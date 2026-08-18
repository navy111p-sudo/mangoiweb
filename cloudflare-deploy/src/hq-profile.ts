/* 🏯 본사(법인) 정보 정본 — cloudflare-deploy/src/hq-profile.ts
 *
 * 무엇인가
 *   운영 중인 망고아이 사이트(https://mangoi.ai)의 «🏢 회사 정보» 푸터에 이미 나가 있는
 *   법인 정보다. 화면 쪽 원본은 `public/js/idx-grid-menu.js` 의 `cs-legal` 블록이고,
 *   여기 값은 그것을 글자 그대로 옮긴 것이다.
 *
 * 어디에 쓰나
 *   관리자 «시스템 › 조직 관리 › 🏯 본사 관리» 표(D1 `hq_orgs`)가 **비어 있을 때 한 번만**
 *   심는다(이관). 그 뒤로는 D1 이 정본이다 — 화면에서 고친 값을 다음 배포가 조용히
 *   덮어쓰면 안 되기 때문이다. `seedHqOrgs()` 가 `COUNT(*) = 0` 일 때만 INSERT 한다.
 *
 * ⚠️ 두 곳이 갈라지면 학부모가 보는 사업자정보와 관리자 화면이 어긋난다.
 *    `test-harness/hq_org_profile_harness.mjs` 가 이 파일과 푸터의 값이 같은지 감시한다.
 *    값을 고칠 일이 생기면 **두 곳을 같이** 고칠 것.
 */
export interface HqProfile {
  name: string;              // 상호 (법인명)
  ceo_name: string;          // 대표
  business_no: string;       // 사업자등록번호
  address: string;           // 주소
  phone: string;             // 대표전화
  email: string;             // 대표 이메일 (개인정보 보호 책임자 연락처와 같다)
  ecommerce_no: string;      // 통신판매업신고번호
  privacy_officer: string;   // 개인정보 보호 책임자
  memo: string;
}

export const HQ_PROFILE: HqProfile = {
  name: '(주)에듀비전',
  ceo_name: '정우영',
  business_no: '134-86-30816',
  address: '경기도 안산시 상록구 이동 716-10번지 6층',
  phone: '1644-0561',
  email: 'jangjiwoong@mangoi.com',
  ecommerce_no: '제 2010-경기안산-0634호',
  privacy_officer: '정지웅',
  memo: '망고아이(mangoi.ai) 운영사 — 사이트 «회사 정보» 푸터에서 이관',
};
