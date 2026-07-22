// ═══════════════════════════════════════════════════════════════
// adm-guide-decks.js — 관리자 사용법 가이드 '덱 정의' 단일 출처 (ph166, 2026-07-23)
//
// 왜 이 파일이 생겼나:
//   덱 정보(폴더·PDF·슬라이드 제목 순서)를 adm-s18.js(전체 뷰어)와
//   adm-welcome.js(환영 모달)가 '각자' 들고 있었다. 그래서 실제로 어긋났다 —
//   환영 모달이 한국어 덱의 슬라이드 번호를 영어 덱에도 그대로 써서
//   캡션 "Left sidebar = every menu" 에 그림은 "The screen, explained" 가 나왔다.
//   두 덱은 번역본이 아니라 서로 다른 구성이다(한국어 18장 / 영어 24장, 순서도 다름).
//
// 규칙:
//   · 덱을 바꾸면 이 파일만 고친다. 다른 파일에 번호를 적어두지 말 것.
//   · 슬라이드는 '번호'가 아니라 '제목'으로 가리킨다. 번호는 여기서 찾아 쓴다.
//   · titles 순서 = 파일 번호 순서 (titles[0] = 01.jpg).
// ═══════════════════════════════════════════════════════════════
(function (g) {
  'use strict';

  var DECKS = {
    "ko": {
      "dir": "/guide/admin-easy/",
      "pdf": "/guide/admin-easy/admin-easy.pdf",
      "pdfName": "망고아이_관리자페이지_쉬운사용법.pdf",
      "titles": [
        "시작하기",
        "관리자 페이지란?",
        "화면은 이렇게 생겼어요",
        "① 로그인 (입장)",
        "사이드바 한눈에 (9개 메뉴)",
        "메뉴1 · 평가서 통합",
        "메뉴2 · 알림 센터",
        "메뉴3 · 강사 통합",
        "메뉴4 · 통계·KPI",
        "메뉴5 · 회계·포인트",
        "메뉴6 · 학생·학부모",
        "메뉴7 · 교육·콘텐츠",
        "메뉴8 · 자료실",
        "메뉴9 · 시스템",
        "자주 쓰는 기능 3가지",
        "공지 보내보기 (따라하기)",
        "안전하게 나가기 + 꿀팁",
        "이제 준비 끝!"
      ]
    },
    "en": {
      "dir": "/guide/admin-easy-en/",
      "pdf": "/guide/admin-easy-en/admin-easy-en.pdf",
      "pdfName": "Mangoi_Admin_Page_Guide_EN.pdf",
      "titles": [
        "Cover",
        "Contents",
        "What is the Admin Page?",
        "Signing in",
        "The screen, explained",
        "The menu at a glance",
        "How to find anything",
        "Menu 1 · Evaluations",
        "Menu 2 · Notification Center",
        "Menu 3 · Teachers",
        "Menu 4 · Stats / KPI",
        "Menu 5 · Accounting / Points",
        "Menu 6 · Students / Parents",
        "Menu 7 · Education / Content",
        "Menu 8 · Library",
        "Menu 9 · System",
        "The 3 things you’ll do most",
        "Walkthrough: send a notice",
        "Who sees what",
        "Staying safe + tips",
        "A–Z index (1/3)",
        "A–Z index (2/3)",
        "A–Z index (3/3)",
        "You’re ready"
      ]
    }
  };

  // 제목으로 슬라이드 번호(1-base)를 찾는다. 못 찾으면 null — 부르는 쪽에서 폴백 처리.
  function slideNo(lang, title) {
    var d = DECKS[lang] || DECKS.ko;
    var i = d.titles.indexOf(title);
    return i < 0 ? null : (i + 1);
  }

  g.MANGOI_GUIDE_DECKS = DECKS;
  g.mangoiGuideSlideNo = slideNo;
})(window);
