/* 👨‍🏫 teacher-gallery.js — 홈 «강사 소개» 창 (시안 A · 스플릿 뷰) / Teacher profiles modal (concept A · split view)
 *
 * 왜 (2026-11-04 사장님): 「PC 에서 글씨가 작아서 교사 프로필을 볼 수 없어」.
 *   옛 창은 폭 600px 고정에 본문 10.5px · 소개 문구가 작은 알약 안에 잘려 있었다.
 *   → PC(≥1024px): 왼쪽 카드 목록 + 오른쪽 프로필 패널 / 태블릿·모바일: 카드를 누르면 시트로 프로필.
 *   → 글자 크기는 화면 폭을 따라 15~19px(본문 기준)로 커진다 — 큰 모니터일수록 크게.
 *
 * 구조 (한 파일, 위에서 아래로):
 *   1. 상수·문구(KO/EN)   2. 순수 도우미(하니스가 node 로 직접 돌림 — DOM 안 씀)
 *   3. HTML 조각 만들기    4. 상태·그리기   5. 이벤트   6. 공개 API
 *
 * 부르는 곳: js/idx-grid-menu.js 의 gridActions.teachers — 이 파일을 «처음 열 때» 불러온다(홈 첫 화면 예산 0바이트).
 *   ⚠️ 이 파일을 고치면 idx-grid-menu.js 안의 '/js/teacher-gallery.js?v=N' 을 올리고
 *      test-harness/asset-versions.json 의 같은 키 해시를 갱신할 것(teacher_gallery_harness ①절이 감시).
 *
 * 지킨 것:
 *   · group_name(재택/사무실 등 내부 인사 분류)은 그리지 않는다(2026-07-30 제보 #5 — 학부모용 정보 아님).
 *   · 국기는 SVG 이미지(Windows 는 국기 이모지를 «PH» 글자로 보여 줌 — 2026-07-27 피드백 #11).
 *   · 제목 옆 마스코트는 Mr.mango(/img/mango-char.png) — CLAUDE.md 0장(2026-08-23 사장님 지시).
 *   · 사이트 번역기(i18n-sweep)는 translate="no" 로 건너뛰게 하고, KO/EN 은 여기서 직접 그린다.
 *   · 그림(/img/teachers/*.webp, 힉스필드 생성)이 없어도 그라데이션으로 그려진다 — 빈 칸이 안 생긴다.
 */
(function () {
  'use strict';

  /* ───────────────── 1. 상수·문구 ───────────────── */
  var IMG = '/img/teachers/';
  var COVER_FALLBACK = 'linear-gradient(135deg,#1F3A6B,#0F1A33)';   // 그림이 없거나 못 받아도 빈 칸이 안 되게
  var WIDE_MQ = '(min-width: 1024px)';          // 이 폭부터 오른쪽 프로필 패널(CSS 의 같은 값과 짝)
  var API_PUBLIC = '/api/teacher-profiles?limit=50';  // 서버 상한 50(api-mango.ts)
  var API_ADMIN = '/api/admin/teacher-profiles';      // 옛 코드와 같은 폴백(관리자 세션일 때)

  var REGIONS = [
    { id: 'all', flag: null, cover: null,                ko: '전체',       en: 'All',            dKo: '모든 강사',        dEn: 'Every teacher' },
    { id: 'ph',  flag: 'ph', cover: 'tg-region-ph.webp', ko: '필리핀',     en: 'Philippines',    dKo: '현지 원어민 강사', dEn: 'Local English teachers' },
    { id: 'us',  flag: 'us', cover: 'tg-region-na.webp', ko: '미국·캐나다', en: 'US · Canada',    dKo: '원어민',           dEn: 'Native speakers' },
    { id: 'gb',  flag: 'gb', cover: 'tg-region-uk.webp', ko: '영국·호주',   en: 'UK · Australia', dKo: '원어민',           dEn: 'Native speakers', soon: true },
    { id: 'cn',  flag: 'cn', cover: 'tg-region-cn.webp', ko: '중국어',     en: 'Chinese',        dKo: '이중언어',         dEn: 'Bilingual' }
  ];

  var TEXT = {
    ko: {
      title: '강사 소개', sub: '엄격하게 검증된 정규 강사진이 매일 수업을 진행합니다.',
      regionNav: '강사 국가', searchLabel: '강사 이름 검색', searchPh: '강사 이름으로 찾기',
      count: function (g, n) { return g + ' · 강사 <b>' + n + '</b>명'; },
      soon: '준비중', loading: '강사 목록을 불러오는 중…',
      error: '강사 목록을 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.', retry: '다시 시도',
      emptySearch: '찾는 이름의 강사가 없어요. 다른 이름으로 검색해 보세요.',
      emptyRegion: '이 지역 강사진은 아직 없어요.', emptySoon: '영국·호주 원어민 강사진을 준비하고 있어요.',
      pick: '강사를 고르면 프로필이 여기에 보여요.',
      video: '소개 영상 보기', join: '수업 입장', subjectDefault: '영어 회화',
      years: function (n) { return n + '년차'; },
      about: '선생님 한마디', education: '학력', experience: '경력',
      days: '가능 요일', hours: '가능 시간', subject: '담당',
      noIntro: '아직 등록된 소개 글이 없어요.',
      prev: '이전 강사', next: '다음 강사', of: function (i, n) { return i + ' / ' + n; },
      close: '닫기', closeProfile: '프로필 닫기', teacher: '강사', langLabel: 'Switch to English',
      badge: '망고아이 필리핀 본사 검증 강사 · TESOL/CELTA 자격 + 평균 5년+ 경력',
      recruitTitle: '✅ 채용 기준',
      recruit: ['대학 졸업 이상 (영어 관련 학과 우대)', 'TESOL/CELTA/TEFL 자격증 보유', '최소 2년 영어 교육 경험', '망고아이 자체 4단계 시범 수업 통과', '분기별 학생 평가 4.0/5.0 이상 유지'],
      evalTitle: '⭐ 강사 평가 시스템',
      evals: ['매 수업 후 학생 5단계 평가', '월별 동료/매니저 모니터링', 'S·A·B·C 등급 기반 인센티브']
    },
    en: {
      title: 'Meet Our Teachers', sub: 'Carefully vetted, full-time teachers lead classes every day.',
      regionNav: 'Teacher region', searchLabel: 'Search teachers', searchPh: 'Search by name',
      count: function (g, n) { return g + ' · <b>' + n + '</b> teachers'; },
      soon: 'Soon', loading: 'Loading teachers…',
      error: "We couldn't load the teacher list. Check your connection and try again.", retry: 'Try again',
      emptySearch: 'No teacher has that name. Try another search.',
      emptyRegion: 'No teachers in this region yet.', emptySoon: 'UK and Australian teachers are coming soon.',
      pick: 'Select a teacher to see their profile here.',
      video: 'Watch intro video', join: 'Join class', subjectDefault: 'English Conversation',
      years: function (n) { return n + (Number(n) === 1 ? ' yr' : ' yrs'); },
      about: 'In their words', education: 'Education', experience: 'Experience',
      days: 'Available days', hours: 'Available hours', subject: 'Subject',
      noIntro: 'No introduction yet.',
      prev: 'Previous teacher', next: 'Next teacher', of: function (i, n) { return i + ' / ' + n; },
      close: 'Close', closeProfile: 'Close profile', teacher: 'Teacher', langLabel: '한국어로 보기',
      badge: "Teachers verified by Mangoi's Philippine head office · TESOL/CELTA certified · 5+ years of experience on average",
      recruitTitle: '✅ Hiring standards',
      recruit: ['University degree or higher (English-related majors preferred)', 'TESOL/CELTA/TEFL certificate', 'At least 2 years of English teaching experience', "Passed Mangoi's own 4-step demo lesson", 'Keeps a quarterly student rating of 4.0/5.0 or higher'],
      evalTitle: '⭐ How we evaluate teachers',
      evals: ['Students rate every class on a 5-point scale', 'Monthly peer and manager monitoring', 'Incentives based on S·A·B·C grades']
    }
  };

  /* ───────────────── 2. 순수 도우미 (DOM 없음) ───────────────── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clean(v) { return v == null ? '' : String(v).trim(); }
  function curLang() {
    try { var l = window.getLang ? window.getLang() : 'ko'; return l === 'en' ? 'en' : 'ko'; } catch (e) { return 'ko'; }
  }
  function tr(key, lang) {
    var v = TEXT[lang || curLang()][key];
    if (typeof v === 'function') return v.apply(null, Array.prototype.slice.call(arguments, 2));
    return v;
  }
  function regionById(id) { for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i]; return REGIONS[1]; }
  function regionLabel(r, lang) { return (lang || curLang()) === 'en' ? r.en : r.ko; }
  function regionDesc(r, lang) { return (lang || curLang()) === 'en' ? r.dEn : r.dKo; }

  /* 옛 teacherCat 과 같은 규칙 — 출신지 글자로 국가 칸을 정한다(모르면 필리핀). */
  function regionOf(t) {
    var o = clean(t && (t.origin_region || t.active_region));
    if (/미국|캐나다|usa|canada/i.test(o)) return 'us';
    if (/영국|호주|영연방|uk|britain|australia/i.test(o)) return 'gb';
    if (/중국|중화|china|chin/i.test(o)) return 'cn';
    return 'ph';
  }
  function nameOf(t, lang) { return clean(t.english_name) || clean(t.korean_name) || tr('teacher', lang); }
  function initialOf(t) { var n = clean(t.english_name) || clean(t.korean_name); n = n.replace(/^teacher\s+/i, ''); return (n.charAt(0) || '?').toUpperCase(); }
  function subjectOf(t, lang) { return clean(t.certifications) || tr('subjectDefault', lang); }
  /* career 칸은 «숫자(년차)» 이거나 «자유 글(좌우명·경력 설명)» 이다 — 둘을 갈라 쓴다. */
  function yearsOf(t) { var c = clean(t.career); return /^\d{1,2}$/.test(c) ? Number(c) : null; }
  /* 강사가 입력칸에 라벨째 적은 경우가 있다 — 「Motto: …」·「Full Name: Janice … Motto: "…"」(실측 3명).
     라벨은 화면에 안 보이게 «Motto:» 뒤만 쓴다. */
  function aboutOf(t) {
    var c = clean(t.career);
    if (!c || yearsOf(t) !== null) return '';
    var m = c.match(/\bmotto\s*:\s*([\s\S]+)$/i);
    return m ? m[1].trim() : c;
  }

  /* 남이 넣은 주소는 http(s) 만 쓴다(javascript: 등 차단). 상대경로(/로 시작)는 우리 사이트라 허용. */
  function safeUrl(u) {
    var s = clean(u);
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (/^\/[^/\\]/.test(s)) return s;
    return '';
  }
  /* 유튜브 주소 → 퍼가기 주소. 아니면 '' (그때는 <video> 로 튼다). */
  function ytEmbed(u) {
    var s = safeUrl(u);
    if (!/youtube\.com|youtu\.be/i.test(s)) return '';
    var m = /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/.exec(s);
    return m ? 'https://www.youtube.com/embed/' + m[1] + '?autoplay=1&rel=0' : '';
  }
  function countIn(list, regionId) {
    if (regionId === 'all') return list.length;
    var n = 0; for (var i = 0; i < list.length; i++) if (regionOf(list[i]) === regionId) n++;
    return n;
  }
  /* 지역 + 검색어로 거른다. 검색은 영문·한글 이름·담당 과목에서 찾는다(대소문자 무시). */
  function filterList(list, regionId, query) {
    var q = clean(query).toLowerCase();
    return list.filter(function (t) {
      if (regionId !== 'all' && regionOf(t) !== regionId) return false;
      if (!q) return true;
      var hay = [t.english_name, t.korean_name, t.certifications].map(clean).join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }
  function idOf(t, i) { return clean(t.id) || 'i' + i; }

  /* ───────────────── 3. HTML 조각 ───────────────── */
  function flagImg(code, cls) {
    return code ? '<img class="' + (cls || 'tg-flag') + '" src="/img/flag-' + code + '.svg?v=1" alt="" width="24" height="16">' : '';
  }
  var GLOBE = '<svg class="tg-globe" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var ICON_SEARCH = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
  var ICON_PLAY = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
  var ICON_L = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  var ICON_R = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  /* 사진: 있으면 <img>(실패하면 숨겨져 아래 이니셜이 보임), 없으면 «사진 준비중» 그림. */
  function photoHTML(t, cls) {
    var url = safeUrl(t.image_url);
    var inner = url
      ? '<span class="tg-init" aria-hidden="true">' + esc(initialOf(t)) + '</span><img src="' + esc(url) + '" alt="" loading="lazy" decoding="async">'
      : '';
    return '<span class="' + cls + (url ? '' : ' tg-nophoto') + '">' + inner + '</span>';
  }
  /* 카드 아래 한 줄 — 년차가 있을 때만. ⛔ 평점을 지어내 넣지 말 것: 옛 창은 모든 강사에게 «⭐ 4.9» 를
     고정으로 박아 보여 줬다(근거 없는 숫자). 2026-11-04 사장님 결정으로 뺐다 — 실제 평점 집계가 생기면 그때. */
  function metaHTML(t, lang) {
    var y = yearsOf(t);
    return y !== null ? '<span class="tg-meta">' + esc(tr('years', lang, y)) + '</span>' : '';
  }

  function cardHTML(t, i, selected, lang) {
    var id = idOf(t, i), r = regionOf(t);
    return '<button type="button" class="tg-card" data-tg="pick" data-id="' + esc(id) + '" aria-pressed="' + (selected ? 'true' : 'false') + '">' +
      '<span class="tg-ph-wrap">' + photoHTML(t, 'tg-ph') + flagImg(r, 'tg-flag tg-flag-badge') + '</span>' +
      '<span class="tg-name">' + esc(nameOf(t, lang)) + '</span>' +
      '<span class="tg-subj">' + esc(subjectOf(t, lang)) + '</span>' +
      metaHTML(t, lang) +
      '</button>';
  }

  function chipsHTML(list, active, lang) {
    return REGIONS.map(function (r) {
      var on = r.id === active;
      var tail = r.soon ? '<span class="tg-soon">' + esc(tr('soon', lang)) + '</span>' : '<span class="tg-n">' + countIn(list, r.id) + '</span>';
      return '<button type="button" class="tg-chip" data-tg="filter" data-id="' + r.id + '" aria-pressed="' + on + '">' +
        (r.flag ? flagImg(r.flag) : GLOBE) + '<span>' + esc(regionLabel(r, lang)) + '</span>' + tail + '</button>';
    }).join('');
  }

  function factHTML(label, value) {
    return value ? '<div class="tg-fact"><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>' : '';
  }

  /* 프로필(패널·시트 공용). video=true 면 사진 자리에서 영상을 튼다. */
  function detailHTML(t, ctx, lang) {
    var r = regionById(regionOf(t));
    var video = safeUrl(t.intro_video_url);
    var cover = r.cover ? ' style="background-image:url(\'' + IMG + r.cover + '\'),' + COVER_FALLBACK + '"' : '';
    var media;
    if (ctx.playing && video) {
      var yt = ytEmbed(video);
      media = '<div class="tg-d-player">' + (yt
        ? '<iframe src="' + esc(yt) + '" title="' + esc(tr('video', lang)) + '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>'
        : '<video src="' + esc(video) + '" controls autoplay playsinline></video>') + '</div>';
    } else {
      media = '<div class="tg-d-cover"' + cover + '>' + photoHTML(t, 'tg-d-photo') + '</div>';
    }
    /* ⛔ t.notes 를 그리지 마세요 — «선생님 한마디» 가 아니라 내부 관리 메모(로그인 아이디·프랜차이즈·평점·
       작업 메모)입니다(2026-11-05 사장님 캡처). 강사가 직접 쓴 말은 career 칸뿐입니다. */
    var about = aboutOf(t), y = yearsOf(t);
    var intro = '';
    if (about) intro += '<figure class="tg-quote tg-quote-about"><figcaption>' + esc(tr('about', lang)) + '</figcaption><blockquote>' + esc(about) + '</blockquote></figure>';
    if (!intro) intro = '<p class="tg-empty-line">' + esc(tr('noIntro', lang)) + '</p>';
    var facts = factHTML(tr('subject', lang), subjectOf(t, lang)) +
      factHTML(tr('experience', lang), y !== null ? tr('years', lang, y) : '') +
      factHTML(tr('education', lang), clean(t.education)) +
      factHTML(tr('days', lang), clean(t.available_days)) +
      factHTML(tr('hours', lang), clean(t.available_hours));
    var nav = ctx.total > 1
      ? '<div class="tg-d-nav"><button type="button" class="tg-icon" data-tg="prev" aria-label="' + esc(tr('prev', lang)) + '">' + ICON_L + '</button>' +
        '<span>' + esc(tr('of', lang, ctx.index + 1, ctx.total)) + '</span>' +
        '<button type="button" class="tg-icon" data-tg="next" aria-label="' + esc(tr('next', lang)) + '">' + ICON_R + '</button></div>'
      : '';
    return '<article class="tg-d' + (ctx.playing && video ? ' is-playing' : '') + '" aria-labelledby="tg-d-name">' + media +
      '<div class="tg-d-body">' +
        '<p class="tg-d-kicker">' + flagImg(r.id) + '<span>' + esc(regionLabel(r, lang)) + ' · ' + esc(regionDesc(r, lang)) + '</span></p>' +
        '<h3 class="tg-d-name" id="tg-d-name">' + esc(nameOf(t, lang)) + '</h3>' +
        '<div class="tg-d-actions">' +
          (video && !ctx.playing ? '<button type="button" class="tg-btn tg-btn-primary" data-tg="video">' + ICON_PLAY + '<span>' + esc(tr('video', lang)) + '</span></button>' : '') +
          '<button type="button" class="tg-btn tg-btn-ghost" data-tg="join">🎥 <span>' + esc(tr('join', lang)) + '</span></button>' +
        '</div>' +
        intro +
        '<dl class="tg-facts">' + facts + '</dl>' +
        nav +
      '</div></article>';
  }

  function emptyHTML(kind, lang) {
    var msg = kind === 'soon' ? tr('emptySoon', lang) : kind === 'search' ? tr('emptySearch', lang) : tr('emptyRegion', lang);
    return '<div class="tg-empty">' + (kind === 'soon' ? '<span class="tg-empty-art" style="background-image:url(\'' + IMG + 'tg-region-uk.webp\'),' + COVER_FALLBACK + '"></span>' : '') +
      '<p>' + esc(msg) + '</p></div>';
  }

  /* 옛 창 아래쪽에 있던 «채용 기준 · 평가 시스템» — 목록 맨 아래에 그대로 둔다. */
  function infoHTML(lang) {
    var li = function (arr) { return arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join(''); };
    return '<p class="tg-badge">' + flagImg('ph') + '<span>' + esc(tr('badge', lang)) + '</span></p>' +
      '<div class="tg-info-cols">' +
        '<div class="tg-info-box"><h4>' + esc(tr('recruitTitle', lang)) + '</h4><ul>' + li(tr('recruit', lang)) + '</ul></div>' +
        '<div class="tg-info-box"><h4>' + esc(tr('evalTitle', lang)) + '</h4><ul>' + li(tr('evals', lang)) + '</ul></div>' +
      '</div>';
  }

  function shellHTML(lang) {
    return '<div class="tg" translate="no">' +
      '<header class="tg-head">' +
        '<img class="tg-mascot" src="/img/mango-char.png" alt="" width="56" height="56">' +
        '<div class="tg-head-text"><h2 class="tg-title" id="tg-title">' + esc(tr('title', lang)) + '</h2><p class="tg-sub">' + esc(tr('sub', lang)) + '</p></div>' +
        '<button type="button" class="tg-lang" data-tg="lang" title="' + esc(tr('langLabel', lang)) + '">' + (lang === 'en' ? 'KO' : 'EN') + '</button>' +
        '<button type="button" class="tg-icon tg-x" data-tg="close" aria-label="' + esc(tr('close', lang)) + '">' + ICON_X + '</button>' +
      '</header>' +
      '<div class="tg-tools">' +
        '<div class="tg-chips" data-slot="chips" role="group" aria-label="' + esc(tr('regionNav', lang)) + '"></div>' +
        '<label class="tg-search"><span class="tg-sr">' + esc(tr('searchLabel', lang)) + '</span>' + ICON_SEARCH +
          '<input type="search" id="tg-q" autocomplete="off" placeholder="' + esc(tr('searchPh', lang)) + '"></label>' +
      '</div>' +
      '<div class="tg-body">' +
        '<div class="tg-list" data-slot="list-wrap"><p class="tg-count" data-slot="count" aria-live="polite"></p><div class="tg-grid" data-slot="list"></div><section class="tg-info" data-slot="info"></section></div>' +
        '<aside class="tg-panel" data-slot="panel" aria-label="' + esc(tr('title', lang)) + '"></aside>' +
      '</div>' +
      '<div class="tg-sheet" data-slot="sheet" hidden></div>' +
    '</div>';
  }

  /* ───────────────── 4. 상태·그리기 ───────────────── */
  var S = { open: false, root: null, list: [], status: 'idle', filter: 'all', q: '', selId: null, sheet: false, playing: false, lastTrigger: null };
  var mq = null;

  function isWide() { try { return window.matchMedia(WIDE_MQ).matches; } catch (e) { return true; } }
  function $(sel) { return S.root ? S.root.querySelector(sel) : null; }
  function visible() { return filterList(S.list, S.filter, S.q); }
  function selected() {
    var v = visible();
    for (var i = 0; i < v.length; i++) if (idOf(v[i], S.list.indexOf(v[i])) === S.selId) return { t: v[i], index: i, total: v.length };
    return null;
  }
  function ensureSelection() {
    if (selected()) return;
    var v = visible();
    S.selId = v.length ? idOf(v[0], S.list.indexOf(v[0])) : null;
    S.playing = false;
  }

  function renderChips() { var el = $('[data-slot="chips"]'); if (el) el.innerHTML = chipsHTML(S.list, S.filter, curLang()); }
  function renderList() {
    var lang = curLang(), el = $('[data-slot="list"]'), cnt = $('[data-slot="count"]');
    if (!el) return;
    if (S.status === 'loading') {
      if (cnt) cnt.textContent = tr('loading', lang);
      el.innerHTML = new Array(9).join('<span class="tg-card tg-skel" aria-hidden="true"><span class="tg-ph"></span><span class="tg-line"></span><span class="tg-line tg-line-s"></span></span>');
      return;
    }
    if (S.status === 'error') {
      if (cnt) cnt.textContent = '';
      el.innerHTML = '<div class="tg-empty"><p>' + esc(tr('error', lang)) + '</p><button type="button" class="tg-btn tg-btn-primary" data-tg="retry">' + esc(tr('retry', lang)) + '</button></div>';
      return;
    }
    var v = visible();
    if (cnt) cnt.innerHTML = tr('count', lang, esc(regionLabel(regionById(S.filter), lang)), v.length);
    if (!v.length) {
      var r = regionById(S.filter);
      el.innerHTML = emptyHTML(clean(S.q) ? 'search' : (r.soon ? 'soon' : 'region'), lang);
      return;
    }
    el.innerHTML = v.map(function (t) { var i = S.list.indexOf(t); return cardHTML(t, i, idOf(t, i) === S.selId, lang); }).join('');
  }
  function renderPanel() {
    var el = $('[data-slot="panel"]');
    if (!el) return;
    var sel = S.status === 'ready' ? selected() : null;
    el.innerHTML = sel
      ? detailHTML(sel.t, { index: sel.index, total: sel.total, playing: S.playing && !S.sheet }, curLang())
      : '<p class="tg-panel-hint">' + esc(S.status === 'ready' ? tr('pick') : '') + '</p>';
  }
  function renderSheet(opts) {
    var el = $('[data-slot="sheet"]');
    if (!el) return;
    var sel = S.sheet ? selected() : null;
    if (!sel) { el.hidden = true; el.innerHTML = ''; return; }
    var lang = curLang();
    el.hidden = false;
    el.innerHTML = '<button type="button" class="tg-scrim" data-tg="sheet-close" tabindex="-1" aria-label="' + esc(tr('closeProfile', lang)) + '"></button>' +
      '<div class="tg-sheet-panel' + (opts && opts.animate ? ' tg-anim' : '') + '" role="dialog" aria-modal="true" aria-labelledby="tg-d-name">' +
        '<button type="button" class="tg-icon tg-sheet-x" data-tg="sheet-close" aria-label="' + esc(tr('closeProfile', lang)) + '">' + ICON_X + '</button>' +
        detailHTML(sel.t, { index: sel.index, total: sel.total, playing: S.playing }, lang) +
      '</div>';
    var f = el.querySelector((opts && opts.focus) || '.tg-sheet-x');
    if (f) try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); }
  }
  function syncPressed() {
    if (!S.root) return;
    var cards = S.root.querySelectorAll('.tg-card[data-id]');
    for (var i = 0; i < cards.length; i++) cards[i].setAttribute('aria-pressed', String(cards[i].getAttribute('data-id') === S.selId));
  }
  function renderInfo() { var el = $('[data-slot="info"]'); if (el) el.innerHTML = infoHTML(curLang()); }
  function renderAll() { renderChips(); renderList(); renderPanel(); renderSheet(); renderInfo(); }

  /* 바뀐 언어로 머리글·검색칸까지 다시 그린다(검색어는 유지). */
  function relabel() {
    if (!S.open || !S.root) return;
    var lang = curLang();
    var set = function (sel, txt) { var e = $(sel); if (e) e.textContent = txt; };
    set('.tg-title', tr('title', lang)); set('.tg-sub', tr('sub', lang)); set('.tg-search .tg-sr', tr('searchLabel', lang));
    var x = $('.tg-x'); if (x) x.setAttribute('aria-label', tr('close', lang));
    var q = $('#tg-q'); if (q) q.setAttribute('placeholder', tr('searchPh', lang));
    var c = $('[data-slot="chips"]'); if (c) c.setAttribute('aria-label', tr('regionNav', lang));
    var lb = $('.tg-lang'); if (lb) { lb.textContent = lang === 'en' ? 'KO' : 'EN'; lb.setAttribute('title', tr('langLabel', lang)); }
    renderAll();
  }

  function load() {
    S.status = 'loading'; renderAll();
    function get(url) {
      return fetch(url, { credentials: 'include' }).then(function (r) {
        var ct = (r.headers.get('content-type') || '').toLowerCase();
        if (!r.ok || ct.indexOf('json') === -1) return null;
        return r.json().then(function (d) { var it = d && (d.items || d.rows); return Array.isArray(it) ? it : null; }, function () { return null; });
      }, function () { return null; });
    }
    return get(API_PUBLIC).then(function (rows) {
      return rows && rows.length ? rows : get(API_ADMIN);
    }).then(function (rows) {
      if (!S.open) return;
      if (!rows) { S.status = 'error'; renderAll(); return; }
      S.list = rows; S.status = 'ready'; ensureSelection(); renderAll();
    });
  }

  /* ───────────────── 5. 이벤트 ───────────────── */
  function pick(id) {
    S.selId = id; S.playing = false; S.lastTrigger = id;
    if (S.root) S.root.classList.add('tg-picked');
    if (isWide()) {
      syncPressed(); renderPanel();
      var p = $('[data-slot="panel"]'); if (p) p.scrollTop = 0;
    } else {
      S.sheet = true; syncPressed(); renderSheet({ animate: true });
    }
  }
  function closeSheet() {
    S.sheet = false; S.playing = false; renderSheet();
    var c = S.lastTrigger && S.root && S.root.querySelector('.tg-card[data-id="' + String(S.lastTrigger).replace(/"/g, '') + '"]');
    if (c) try { c.focus({ preventScroll: true }); } catch (e) { c.focus(); }
  }
  function step(dir) {
    var v = visible(); if (!v.length) return;
    var sel = selected(); var i = sel ? sel.index : 0;
    var t = v[(i + dir + v.length) % v.length];
    S.selId = idOf(t, S.list.indexOf(t)); S.playing = false;
    var focus = '[data-tg="' + (dir > 0 ? 'next' : 'prev') + '"]';
    if (S.sheet) renderSheet({ focus: focus });
    else { renderPanel(); var f = $('[data-slot="panel"] ' + focus); if (f) f.focus(); }
    syncPressed(); revealCard(S.selId);
  }
  function revealCard(id) {
    var card = S.root && S.root.querySelector('.tg-card[data-id="' + String(id).replace(/"/g, '') + '"]');
    var box = $('[data-slot="list-wrap"]');
    if (!card || !box) return;
    var top = card.offsetTop, bottom = top + card.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top - 12;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight + 12;
  }
  function setFilter(id) {
    S.filter = id; S.playing = false; ensureSelection(); renderChips(); renderList(); renderPanel();
    var box = $('[data-slot="list-wrap"]'); if (box) box.scrollTop = 0;
  }

  var ACTIONS = {
    filter: setFilter,
    pick: pick,
    prev: function () { step(-1); },
    next: function () { step(1); },
    video: function () { S.playing = true; if (S.sheet) renderSheet({ focus: '.tg-d-player iframe, .tg-d-player video' }); else renderPanel(); },
    join: function () {
      // 옛 프로필 창의 «수업 입장» 과 같은 동작(공용 수업방) — 동작은 바꾸지 않고 자리만 옮겼다.
      try { window.closeInfoModal && window.closeInfoModal(); } catch (e) {}
      if (window.mangoiJoinClass) window.mangoiJoinClass('');
    },
    close: function () { if (window.closeInfoModal) window.closeInfoModal(); else close(); },
    'sheet-close': closeSheet,
    retry: load,
    lang: function () {
      var next = curLang() === 'en' ? 'ko' : 'en';
      if (typeof window.setLang === 'function') window.setLang(next, 'user');   // 사이트 전체 언어(두 엔진 모두) — 끝에 mangoi:lang-changed 를 쏜다 → relabel
    }
  };

  function onClick(e) {
    var el = e.target.closest ? e.target.closest('[data-tg]') : null;
    if (!el || !S.root || !S.root.contains(el)) return;
    var fn = ACTIONS[el.getAttribute('data-tg')];
    if (fn) fn(el.getAttribute('data-id'), el);
  }
  function onInput(e) {
    if (!e.target || e.target.id !== 'tg-q') return;
    S.q = e.target.value; ensureSelection(); renderList(); renderPanel();
  }
  /* 사진을 못 받으면 <img> 를 숨겨 아래 이니셜이 보이게 한다(깨진 그림 아이콘 대신). */
  function onImgError(e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && S.root && S.root.contains(t)) t.classList.add('tg-broken');
  }
  /* 시트가 열려 있으면 Esc 는 «시트만» 닫는다 — idx-grid-menu.js 의 Esc(창 전체 닫기)보다 먼저 받는다. */
  function onKey(e) {
    if (!S.open) return;
    if (e.target && e.target.id === 'tg-q' && e.key !== 'Escape') return;
    if (!S.sheet) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeSheet(); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { step(e.key === 'ArrowRight' ? 1 : -1); return; }
    if (e.key === 'Tab') {
      var panel = $('.tg-sheet-panel'); if (!panel) return;
      var f = panel.querySelectorAll('button, iframe, video, [href]');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  /* 창 폭이 PC ↔ 태블릿을 넘나들면: 넓어졌는데 시트가 열려 있으면 패널로 옮긴다. */
  function onMq() {
    if (!S.open) return;
    if (isWide() && S.sheet) { S.sheet = false; renderSheet(); renderPanel(); }
  }

  var globalsBound = false;
  function bindGlobals() {
    if (globalsBound) return;
    globalsBound = true;
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('mangoi:lang-changed', relabel);
    try { mq = window.matchMedia(WIDE_MQ); if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); } catch (e) {}
  }

  /* ───────────────── 6. 공개 API ───────────────── */
  function open() {
    var ov = document.getElementById('info-modal');
    var box = document.getElementById('info-modal-box');
    var content = document.getElementById('info-modal-content');
    if (!box || !content) return false;
    ensureStyle();
    box.classList.add('tg-wide');
    if (ov) ov.classList.add('tg-open');
    S.open = true; S.status = 'idle'; S.filter = 'all'; S.q = ''; S.sheet = false; S.playing = false; S.lastTrigger = null;
    if (!S.list.length) S.selId = null;
    content.innerHTML = shellHTML(curLang());
    S.root = content.querySelector('.tg');
    S.root.addEventListener('click', onClick);
    S.root.addEventListener('input', onInput);
    S.root.addEventListener('error', onImgError, true);
    bindGlobals();
    box.scrollTop = 0;
    // 한 번 받은 목록은 다시 쓰고(창을 여닫을 때마다 깜빡이지 않게), 뒤에서 새로 받아 바꾼다.
    if (S.list.length) { S.status = 'ready'; ensureSelection(); renderAll(); }
    else load();
    return true;
  }
  /* 창을 닫거나 다른 정보 창으로 바뀔 때 — 영상 소리가 숨은 창에서 계속 나지 않게 비운다. */
  function close() {
    if (!S.open) return;
    S.open = false; S.sheet = false; S.playing = false;
    var box = document.getElementById('info-modal-box');
    var ov = document.getElementById('info-modal');
    if (box) box.classList.remove('tg-wide');
    if (ov) ov.classList.remove('tg-open');
    if (S.root && S.root.parentNode) S.root.parentNode.innerHTML = '';
    S.root = null;
  }

  /* ───────────────── 스타일 (한 번만 넣음) ───────────────── */
  function ensureStyle() {
    if (document.getElementById('tg-style')) return;
    var st = document.createElement('style');
    st.id = 'tg-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  var CSS = [
    /* 바깥 창: 폭·높이·글자 크기를 화면 폭에 맞춘다. em 단위라 글자가 커지면 칸도 같이 커진다. */
    '#info-modal.tg-open{padding:0!important;z-index:2147483100!important}',   /* 메뉴(100000)·A.i 상담사(2147483000)·소리(2147482900) 위, 음성 끄기(2147483646) 아래 */
    '#info-modal-box.tg-wide{--tg-bg:#0F1A33;--tg-s1:#15223F;--tg-s2:#1B2A4C;--tg-hover:#1F3056;--tg-line:rgba(165,185,230,.16);--tg-text:#F1F4FB;--tg-text2:#B6C1D9;--tg-text3:#8E9BB9;--tg-mango:#FFC23D;--tg-ink:#231700;',
      'font-size:clamp(15px,7.4px + .5vw,19px);width:min(76em,calc(100vw - 40px))!important;max-width:none!important;height:min(54em,calc(100vh - 40px))!important;max-height:none!important;',
      'padding:0!important;overflow:hidden!important;display:flex!important;flex-direction:column;background:var(--tg-bg)!important;border:1px solid rgba(255,194,61,.32)!important;border-radius:22px!important;color:var(--tg-text)!important;line-height:1.55}',
    '@supports (height:100dvh){#info-modal-box.tg-wide{height:min(54em,calc(100dvh - 40px))!important}}',
    '@media (min-width:1024px){#info-modal-box.tg-wide{font-size:clamp(16px,7.4px + .5vw,19px)}}',
    '#info-modal-box.tg-wide>button{display:none!important}',
    '#info-modal-box.tg-wide>#info-modal-content{flex:1;min-height:0;display:flex;flex-direction:column}',
    '.tg{position:relative;display:flex;flex-direction:column;flex:1;min-height:0;font-family:inherit;text-align:left}',
    '.tg *{box-sizing:border-box}',
    ':where(.tg) button{font:inherit;color:inherit;cursor:pointer}',   /* :where = 특정성 0 → .tg-chip 등의 font-size 가 이긴다 */
    '.tg :focus-visible{outline:2px solid #9BBEFF;outline-offset:2px}',
    '.tg-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    /* 머리 — 힉스필드 배너(오른쪽) 위에 왼쪽부터 짙어지는 막을 깐다(글자 대비 확보). */
    '.tg-head{position:relative;display:flex;align-items:center;gap:.9em;padding:1.25em 1.5em 1.1em;flex:none;',
      'background:linear-gradient(90deg,var(--tg-bg) 30%,rgba(15,26,51,.62) 62%,rgba(15,26,51,.2)),url(/img/teachers/tg-hero.webp) right center/cover no-repeat,linear-gradient(135deg,#132449,#0F1A33)}',
    '.tg-mascot{width:3.2em;height:3.2em;object-fit:contain;flex:none;filter:drop-shadow(0 4px 10px rgba(0,0,0,.35))}',
    '.tg-head-text{flex:1;min-width:0}',
    '#info-modal-content .tg .tg-title{margin:0;color:#fff;font-size:1.75em;font-weight:800;line-height:1.2;letter-spacing:-.01em}',
    '#info-modal-content .tg .tg-sub{margin:.25em 0 0;color:var(--tg-text2);font-size:1em;line-height:1.5}',
    '.tg-icon{display:grid;place-items:center;width:2.75em;height:2.75em;flex:none;border-radius:12px;border:1px solid var(--tg-line);background:rgba(21,34,63,.85);color:var(--tg-text2);padding:0}',
    '.tg-icon:hover{background:var(--tg-hover);color:#fff}',
    '.tg-x{align-self:flex-start}',
    '.tg-lang{align-self:flex-start;min-width:3.24em;height:3.24em;padding:0 .7em;border-radius:12px;border:1px solid var(--tg-line);background:rgba(21,34,63,.85);color:var(--tg-text)!important;font-size:.85em;font-weight:700;letter-spacing:.04em}',
    '.tg-lang:hover{background:var(--tg-hover)}',
    /* 도구줄 — 국가 칩 + 검색 */
    '.tg-tools{display:flex;flex-wrap:wrap;align-items:center;gap:.6em 1em;padding:.9em 1.5em;border-bottom:1px solid var(--tg-line);border-top:1px solid var(--tg-line);flex:none;background:var(--tg-bg)}',
    '.tg-chips{display:flex;flex-wrap:wrap;gap:.5em;flex:1;min-width:0}',
    '.tg-chip{display:inline-flex;align-items:center;gap:.5em;min-height:2.75em;padding:0 1em;border-radius:999px;border:1px solid var(--tg-line);background:var(--tg-s1);font-size:.95em;font-weight:500;color:var(--tg-text2)!important;white-space:nowrap;flex:none}',
    '.tg-chip:hover{background:var(--tg-hover);color:#fff!important}',
    '.tg-chip[aria-pressed="true"]{background:var(--tg-mango);border-color:var(--tg-mango);color:var(--tg-ink)!important;font-weight:700}',
    '.tg-flag{display:block;width:1.4em;height:.95em;border-radius:3px;object-fit:cover;flex:none;box-shadow:0 0 0 1px rgba(0,0,0,.2)}',
    '.tg-globe{flex:none}',
    '.tg-n{font-size:.85em;opacity:.75;font-variant-numeric:tabular-nums}',
    '.tg-soon{font-size:.78em;font-weight:700;padding:.1em .6em;border-radius:999px;background:var(--tg-s2);color:var(--tg-text3)}',
    '.tg-chip[aria-pressed="true"] .tg-soon{background:rgba(0,0,0,.14);color:inherit}',
    '.tg-search{position:relative;display:block;flex:0 1 17em;min-width:12em}',
    '.tg-search svg{position:absolute;left:.85em;top:50%;transform:translateY(-50%);color:var(--tg-text3);pointer-events:none}',
    '.tg-search input{width:100%;height:2.75em;border-radius:12px;border:1px solid var(--tg-line);background:var(--tg-s1);color:var(--tg-text);padding:0 .9em 0 2.6em;font:inherit;font-size:.95em}',
    '.tg-search input::placeholder{color:var(--tg-text3)}',
    /* 본문 — 목록 | 프로필 패널 */
    '.tg-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr)}',
    '.tg-list{overflow-y:auto;overscroll-behavior:contain;padding:1.1em 1.5em 1.6em;position:relative}',
    '.tg-panel{display:none;overflow-y:auto;overscroll-behavior:contain;border-left:1px solid var(--tg-line);background:var(--tg-s1);--tg-dbg:var(--tg-s1)}',
    '@media (min-width:1024px){.tg-body{grid-template-columns:minmax(0,1fr) 25em}.tg-panel{display:block}}',
    '#info-modal-content .tg .tg-count{margin:0 0 .9em;font-size:.95em;color:var(--tg-text2)}',
    '#info-modal-content .tg .tg-count b{color:#fff;font-weight:700}',
    '.tg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(10.5em,1fr));gap:.85em}',
    /* 카드 */
    '.tg-card{position:relative;display:flex;flex-direction:column;align-items:center;gap:.2em;padding:1.3em .7em 1.1em;border-radius:16px;border:1px solid var(--tg-line);background:var(--tg-s1);text-align:center;transition:background .15s,border-color .15s}',
    '.tg-card:hover{background:var(--tg-hover)}',
    '.tg-card[aria-pressed="true"]{border-color:var(--tg-mango);box-shadow:inset 0 0 0 1px var(--tg-mango);background:var(--tg-s2)}',
    '@media (max-width:1023px){.tg:not(.tg-picked) .tg-card[aria-pressed="true"]{border-color:var(--tg-line);box-shadow:none;background:var(--tg-s1)}}',
    '.tg-ph-wrap{position:relative;margin-bottom:.6em}',
    '.tg-ph,.tg-d-photo{position:relative;display:grid;place-items:center;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,#FFC55C,#E3762B);color:#fff;font-weight:800}',
    '.tg-ph{width:5.6em;height:5.6em;font-size:1em;box-shadow:0 6px 16px -4px rgba(0,0,0,.5),inset 0 0 0 3px rgba(255,255,255,.18)}',
    '.tg-ph img,.tg-d-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
    '.tg-ph img.tg-broken,.tg-d-photo img.tg-broken{display:none}',
    '.tg-init{font-size:2em;text-shadow:0 1px 3px rgba(0,0,0,.25)}',
    '.tg-nophoto{background:url(/img/teachers/tg-no-photo.webp) center/cover no-repeat,linear-gradient(135deg,#3A4E86,#1B2A4C)}',
    '.tg-flag-badge{position:absolute;right:-.15em;bottom:.2em;width:1.55em;height:1.05em;box-shadow:0 0 0 2px var(--tg-bg)}',
    '.tg-name{font-size:1.12em;font-weight:700;color:#fff;line-height:1.3;word-break:keep-all;overflow-wrap:anywhere}',
    '.tg-subj{font-size:.95em;color:var(--tg-text2);line-height:1.35}',
    '.tg-meta{display:inline-flex;align-items:center;gap:.25em;margin-top:.35em;padding:.1em .6em;border-radius:999px;background:rgba(255,194,61,.12);font-size:.85em;font-weight:600;color:#FFD064;font-variant-numeric:tabular-nums}',
    /* 불러오는 중 뼈대 */
    '.tg-skel{pointer-events:none}',
    '.tg-skel .tg-ph{background:var(--tg-s2);box-shadow:none}',
    '.tg-line{display:block;width:70%;height:.8em;border-radius:6px;background:var(--tg-s2);margin-top:.5em}',
    '.tg-line-s{width:45%}',
    '@media (prefers-reduced-motion:no-preference){.tg-skel{animation:tgPulse 1.2s ease-in-out infinite alternate}}',
    '@keyframes tgPulse{from{opacity:.55}to{opacity:1}}',
    /* 빈 칸·오류 */
    '.tg-empty{grid-column:1/-1;display:grid;justify-items:center;gap:.9em;padding:2.4em 1em;text-align:center;border:1px dashed var(--tg-line);border-radius:16px}',
    '#info-modal-content .tg .tg-empty p{margin:0;color:var(--tg-text2);font-size:1em}',
    '.tg-empty-art{display:block;width:min(18em,100%);aspect-ratio:16/9;border-radius:14px;background-color:#15223F;background-position:center;background-size:cover;background-repeat:no-repeat}',
    '#info-modal-content .tg .tg-panel-hint{margin:0;padding:3em 1.5em;text-align:center;color:var(--tg-text3);font-size:.95em}',
    /* 프로필 */
    '.tg-d{display:grid}',
    '.tg-d-cover{position:relative;aspect-ratio:16/9;background-color:#15223F;background-image:linear-gradient(135deg,#1F3A6B,#0F1A33);background-position:center;background-size:cover;background-repeat:no-repeat}',
    '.tg-d-cover:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,26,51,0) 40%,rgba(15,26,51,.55))}',
    '.tg-d-photo{position:absolute;left:1.3em;bottom:-3em;z-index:1;width:7.4em;height:7.4em;border:4px solid var(--tg-dbg);box-shadow:0 10px 24px -6px rgba(0,0,0,.55)}',
    '.tg-d-photo .tg-init{font-size:2.6em}',
    '.tg-d-player{position:relative;aspect-ratio:16/9;background:#000}',
    '.tg-d-player iframe,.tg-d-player video{position:absolute;inset:0;width:100%;height:100%;border:0}',
    '.tg-d-body{display:grid;gap:.8em;padding:3.6em 1.4em 1.6em;align-content:start}',
    '.tg-d.is-playing .tg-d-body{padding-top:1.2em}',
    '#info-modal-content .tg .tg-d-kicker{display:flex;align-items:center;gap:.5em;margin:0;color:var(--tg-text2);font-size:.9em}',
    '#info-modal-content .tg .tg-d-name{margin:-.2em 0 0;color:#fff;font-size:1.75em;font-weight:800;line-height:1.2;word-break:keep-all;overflow-wrap:anywhere}',
    '.tg-d-actions{display:flex;flex-wrap:wrap;gap:.5em}',
    '.tg-btn{display:inline-flex;align-items:center;justify-content:center;gap:.5em;min-height:2.75em;padding:0 1.1em;border-radius:12px;font-size:.95em;font-weight:700;border:1px solid transparent}',
    '.tg-btn-primary{background:var(--tg-mango);color:var(--tg-ink)!important}',
    '.tg-btn-primary:hover{background:#FFD064}',
    '.tg-btn-ghost{background:transparent;border-color:var(--tg-line);color:var(--tg-text)!important}',
    '.tg-btn-ghost:hover{background:var(--tg-hover)}',
    '.tg-quote{position:relative;margin:.3em 0 0;padding:1em 1.1em 1em 1.1em;border-radius:14px;background:var(--tg-s2)}',
    '.tg-panel .tg-quote{background:var(--tg-bg)}',
    '.tg-quote figcaption{font-size:.8em;font-weight:700;letter-spacing:.04em;color:var(--tg-mango);margin-bottom:.35em}',
    '.tg-quote blockquote{margin:0;font-size:1.05em;line-height:1.7;color:var(--tg-text);white-space:pre-line;overflow-wrap:anywhere}',
    '.tg-quote:not(.tg-quote-about) blockquote:before{content:"\\201C"}',
    '.tg-quote:not(.tg-quote-about) blockquote:after{content:"\\201D"}',
    '#info-modal-content .tg .tg-empty-line{margin:0;padding:.9em 1em;border:1px dashed var(--tg-line);border-radius:12px;color:var(--tg-text3);font-size:.95em}',
    '.tg-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5em;margin:.2em 0 0}',
    '.tg-fact{padding:.6em .8em;border-radius:12px;border:1px solid var(--tg-line);min-width:0}',
    '.tg-fact dt{font-size:.78em;color:var(--tg-text3)}',
    '.tg-fact dd{margin:.1em 0 0;font-size:.95em;font-weight:600;color:var(--tg-text);overflow-wrap:anywhere}',
    '.tg-d-nav{display:flex;align-items:center;justify-content:space-between;gap:.6em;padding-top:.9em;border-top:1px solid var(--tg-line);color:var(--tg-text2);font-size:.9em;font-variant-numeric:tabular-nums}',
    /* 채용 기준 · 평가 시스템 */
    '.tg-info{margin-top:1.8em;padding-top:1.4em;border-top:1px solid var(--tg-line)}',
    '#info-modal-content .tg .tg-badge{display:flex;align-items:center;justify-content:center;gap:.5em;margin:0 0 1em;color:var(--tg-text3);font-size:.85em;text-align:center}',
    '.tg-info-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,16em),1fr));gap:.8em}',
    '.tg-info-box{padding:1em 1.1em;border-radius:14px;border:1px solid var(--tg-line);background:rgba(21,34,63,.6);min-width:0}',
    '#info-modal-content .tg .tg-info-box h4{margin:0 0 .5em;color:#FCD34D;font-size:1em;font-weight:700}',
    '#info-modal-content .tg .tg-info-box ul{margin:0;padding-left:1.2em}',
    '#info-modal-content .tg .tg-info-box li{margin:.25em 0;color:var(--tg-text2);font-size:.92em;line-height:1.55}',
    /* 시트 (태블릿·모바일) */
    '.tg-sheet{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:1.5em}',
    '.tg-sheet[hidden]{display:none!important}',
    '.tg-scrim{position:absolute;inset:0;border:0;padding:0;background:rgba(3,7,16,.62);cursor:default}',
    '.tg-sheet-panel{position:relative;width:min(34em,100%);max-height:100%;overflow-y:auto;overscroll-behavior:contain;background:var(--tg-bg);border:1px solid var(--tg-line);border-radius:20px;box-shadow:0 24px 60px rgba(0,0,0,.5);--tg-dbg:var(--tg-bg)}',
    '.tg-sheet-x{position:absolute;top:.75em;right:.75em;z-index:3;background:rgba(10,16,30,.6);border-color:rgba(255,255,255,.25);color:#fff}',
    '@media (prefers-reduced-motion:no-preference){.tg-anim{animation:tgRise .22s ease-out}}',
    '@keyframes tgRise{from{opacity:0;transform:translateY(14px)}}',
    /* 태블릿 이하: 칩은 한 줄 가로 스크롤 */
    '@media (max-width:1023px){.tg-chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;flex-basis:100%}.tg-chips::-webkit-scrollbar{display:none}.tg-search{flex:1 1 100%}}',
    /* 휴대폰: 아래에서 올라온 시트처럼 화면을 꽉 채운다 */
    '@media (max-width:599px){',
      '#info-modal.tg-open{align-items:flex-end!important}',
      '#info-modal-box.tg-wide{width:100vw!important;height:calc(100vh - 12px)!important;border-radius:22px 22px 0 0!important;border-bottom:0!important;font-size:15px}',
      '@supports (height:100dvh){#info-modal-box.tg-wide{height:calc(100dvh - 12px)!important}}',
      '.tg-head{padding:1.1em 1em .9em}.tg-mascot{width:2.6em;height:2.6em}',
      '#info-modal-content .tg .tg-title{font-size:1.45em}#info-modal-content .tg .tg-sub{font-size:.92em}',
      '.tg-tools{padding:.75em 1em}.tg-list{padding:.9em 1em 1.4em}',
      '.tg-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:.6em}',
      '.tg-ph{width:4.8em;height:4.8em}.tg-name{font-size:1.05em}',
      '.tg-sheet{padding:0;place-items:end stretch}',
      '.tg-sheet-panel{width:100%;max-height:94%;border-radius:22px 22px 0 0;border-bottom:0}',
    '}'
  ].join('\n');

  window.MangoiTeacherGallery = {
    open: open,
    close: close,
    isOpen: function () { return S.open; },
    /* 하니스가 node 로 직접 돌리는 순수 함수들 — 화면 동작에는 쓰지 않는다. */
    _t: { esc: esc, regionOf: regionOf, nameOf: nameOf, subjectOf: subjectOf, yearsOf: yearsOf, aboutOf: aboutOf,
          safeUrl: safeUrl, ytEmbed: ytEmbed, filterList: filterList, countIn: countIn,
          cardHTML: cardHTML, detailHTML: detailHTML, chipsHTML: chipsHTML, TEXT: TEXT, REGIONS: REGIONS, IMG: IMG }
  };
})();
