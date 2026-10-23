/* 🎬 A.i영화더빙 — 화면·재생·녹음·채점·완성영상
 * ─────────────────────────────────────────────────────────────────────────────
 * 판정(대사 배정·음소거·시각 검사·녹음 길이)은 js/ai-dubbing-core.js(MangoiDubCore) 한 곳. 여기는 «부르기만».
 * 연동 규격: docs/A.i영화더빙_화면연동_설명서.md
 *
 * 두 가지 재생 방식(장면마다 core 가 정한다):
 *   · turn(차례) — 대사 시각을 아직 믿을 수 없을 때. 영상은 소리 없이 배경으로 돌고 대사가 차례로 나온다.
 *                  원어민 차례 = 음성 파일 또는 TTS, 학생 차례 = 마이크가 열리고 말이 끝나면 다음.
 *   · synced(동기) — ChatGPT 가 영상에 맞춘 시각 + 캐릭터별 음성 파일을 주면. 영상·BGM·캐릭터 음성이
 *                  함께 흐르고, 학생이 고른 캐릭터의 음성만 0 으로 끈다(그 구간에 마이크를 연다).
 *
 * ⚠️ 원본 영상 소리는 기본으로 끈다 — AI 영상 생성기가 넣은 의미 없는 목소리 조각이 섞여 있다.
 * ⚠️ 채점 순서는 speech-coach.html 과 같다: 전사(Whisper) → Azure 음소평가(브라우저 SDK) → /api/voice/coach.
 *    ⛔ /api/voice/transcribe 에 prompt(정답 문장)를 보내지 말 것 — 2026-07-29 «전부 100점» 사고.
 * 완성 영상은 브라우저에서 만든 뒤 인증된 /api/dubbing 보관함으로 저장한다.
 * 저장·이어하기 UI는 ai-dubbing-home.js, 인증/기기 임시보관은 ai-dubbing-library.js.
 * 🎵 배경음악·효과음은 js/ai-dubbing-sound.js(브라우저 합성)가, 👀 «먼저 보기»(감상) 순서는 js/ai-dubbing-watch.js 가 맡는다.
 *    여기는 재료(섞개·영상·자막·TTS)를 넘기고 그리기만 한다 — 감상 순서를 여기에 다시 적지 말 것.
 */
(function () {
  'use strict';
  var C = window.MangoiDubCore;
  var LIB = window.MangoiDubLibrary, HOME = window.MangoiDubHome;
  if (!C) return;

  var $ = function (id) { return document.getElementById(id); };
  var EP_ID_RE = /^[a-z0-9-]{1,40}$/;
  var CAST_KEY = 'mangoi_dub_cast_v1';
  var SPEECH_RMS = 0.03;           // 이보다 크면 «말하고 있다»
  var SILENCE_STOP_MS = 1300;      // 말한 뒤 이만큼 조용하면 그 대사는 끝난 것으로 본다
  var GENRE_KEY = 'mangoi_dub_genre_v1';   // 마지막으로 본 장르(이 기기만 — 편의 기억)
  var KT_KEY = 'mangoi_dub_kt_v1';         // 마지막으로 고른 키키와 토토 에피소드 id
  var SEEN_KEY = 'mangoi_dub_seen_v1';     // 끝까지 본 에피소드 { 편id: [에피소드 번호…] } (이 기기만 — 편의 기억)
  var SND_KEY = 'mangoi_dub_snd_v1';       // 소리 설정 { music, sfx, ko } (이 기기만)
  var DUCK_NATIVE = 0.35, DUCK_STUDENT = 0.15;   // 대사 동안 합성 음악 크기 — 학생 차례는 마이크에 덜 들어가게 더 줄인다

  /* 🐱 키키와 토토 10편 — 더빙은 전용 스튜디오(/ai-dubbing-studio.html?ep=<id>)가 한다. 여기는 «고르기» 용 목록뿐.
   * ⚠️ 정본은 ai-dubbing-studio.html 의 EPISODES·CAST 다. 편·제목·레벨·출연을 바꾸면 «둘 다» 고칠 것 —
   *    test-harness/ai_dubbing_harness.mjs ⑩ 이 두 곳이 같은 말을 하는지 대조한다(한쪽만 고치면 FAIL). */
  var KT_CAST = { kiki: { ko: '키키', en: 'Kiki' }, toto: { ko: '토토', en: 'Toto' }, mom: { ko: '엄마', en: 'Mom' }, lulu: { ko: '룰루', en: 'Lulu' } };
  var KT_EPISODES = [
    { id: 'picnic', level: 1, title: { ko: '소풍 가는 날', en: 'Picnic Day' }, desc: { ko: '짧은 문장 · 부탁하고 고마워하기', en: 'Short sentences · asking and thanking' }, cast: ['kiki', 'toto', 'mom'] },
    { id: 'teddy', level: 1, title: { ko: '테디는 어디 있지?', en: 'Where Is Teddy?' }, desc: { ko: '짧은 문장 · 잃어버린 인형 찾기', en: 'Short sentences · finding a lost toy' }, cast: ['kiki', 'toto', 'mom'] },
    { id: 'bday', level: 2, title: { ko: '토토의 깜짝 생일 파티', en: "Toto's Birthday Surprise" }, desc: { ko: '감정 표현과 비밀 작전 · 셋이 5~6줄씩 발표', en: 'Feelings and secrets · 3 friends, 5–6 lines each' }, cast: ['kiki', 'toto', 'mom'] },
    { id: 'show', level: 3, title: { ko: '학교 장기자랑 대소동', en: 'The Big Talent Show Mix-Up' }, desc: { ko: '긴 문장 · 4명 발표 · 웃긴 반전과 용기 내기', en: 'Longer sentences · 4 friends · a funny twist and courage' }, cast: ['kiki', 'toto', 'mom', 'lulu'] },
    { id: 'treasure', level: 3, title: { ko: '비 오는 날의 보물지도', en: 'The Rainy Day Treasure Map' }, desc: { ko: '위치·방향 표현 · next to, behind, turn left · 아이 3명 4줄씩', en: 'Directions and places · next to, behind, turn left · 3 kids 4 lines each' }, cast: ['kiki', 'toto', 'mom', 'lulu'] },
    { id: 'xmas', level: 3, title: { ko: '크리스마스 발표회의 반짝이는 별', en: 'The Shining Christmas Star' }, desc: { ko: '크리스마스 특별편 · 협동과 용기 · 4명 발표', en: 'Christmas special · teamwork and courage · 4 friends' }, cast: ['kiki', 'toto', 'mom', 'lulu'] },
    { id: 'hallo', level: 3, title: { ko: '할로윈 밤의 수상한 그림자', en: 'The Spooky Halloween Shadow' }, desc: { ko: '할로윈 특별편 · 분장, 용기, 웃긴 반전 · 4명 발표', en: 'Halloween special · costumes, courage and a funny twist · 4 friends' }, cast: ['kiki', 'toto', 'mom', 'lulu'] },
    { id: 'seol', level: 3, title: { ko: '신나는 설날 대작전', en: 'Our Exciting Seollal' }, desc: { ko: '설날 특별편 · 한복·세배·떡국·윷놀이를 영어로 · 4명 발표', en: 'Korean New Year special · hanbok, sebae, tteokguk, yut-nori · 4 friends' }, cast: ['kiki', 'toto', 'mom', 'lulu'] },
    { id: 'chu', level: 3, title: { ko: '보름달 아래 추석 소원', en: 'A Full Moon Wish on Chuseok' }, desc: { ko: '추석 특별편 · 송편·보름달 소원·강강술래를 영어로 · 4명 발표', en: 'Chuseok special · songpyeon, full moon wishes, ganggangsullae · 4 friends' }, cast: ['kiki', 'toto', 'mom', 'lulu'] },
    { id: 'kids', level: 3, title: { ko: '어린이날의 특별한 선물', en: "A Special Gift on Children's Day" }, desc: { ko: '어린이날 특별편 · 나눔과 감사, 어버이날 카네이션 · 4명 발표', en: "Children's Day special · sharing, gratitude and Parents' Day · 4 friends" }, cast: ['kiki', 'toto', 'mom', 'lulu'] },
  ];

  var S = {
    ep: null, problems: [],
    cast: [],          // [{ name, character }] — 0번은 로그인 계정 주인(있으면)
    run: null,         // 지금 도는 더빙 한 판
    results: [],       // [{ key, sceneNo, line, studentIdx, status, spoken, score, tier, words, err }]
    movies: [],        // [{ title, url, mime, size }]
    resume: null,      // saved scene boundary; earlier videos stay in the library
    index: [],         // 이야기 목록(1·2·3편) — loadIndex
    genre: 'adv',      // 'adv'(모험 3D 애니) | 'kt'(키키와 토토)
    sel: -1,           // 고른 에피소드(= 매니페스트의 장면 순번)
    ktSel: 0,          // 고른 키키와 토토 에피소드(KT_EPISODES 순번)
    loadErr: false,
    watching: false,   // 👀 먼저 보기 중(더빙과 동시에 돌지 않는다)
    wNow: null,        // 지금 보는 항목 { i, n, it } — 진행 표시용
    wItems: null,      // 지금 보는 묶음(끝나면 «더빙하러 가기» 가 지금 편의 첫 장면을 고른다)
    epCache: {},       // «모든 작품 이어 보기» 로 읽은 다른 편 매니페스트(정본 normalizeEpisode 결과)
  };
  /* 브라우저 검사용(개인정보 없음) — 섞개·소리 엔진·먼저 보기 진행기를 «읽기만» 한다 */
  window.__dub = { S: S, mix: function () { return MIX; }, watch: function () { return WATCH; } };

  /* ── 글자 ─────────────────────────────────────────────────────────────── */
  function isEn() { try { return !!(window.getLang && window.getLang() === 'en'); } catch (e) { return false; } }
  function T(ko, en) { return isEn() ? en : ko; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* 🌐 를 눌러도 따라오게 data-ko/data-en 을 함께 단다(글자만 담은 span 에만 — 그릇에 달면 내용이 지워진다) */
  function L(ko, en) { return '<span data-ko="' + esc(ko) + '" data-en="' + esc(en) + '">' + esc(T(ko, en)) + '</span>'; }
  function charName(cid) { var c = S.ep && S.ep.characters[cid]; return c ? T(c.name.ko, c.name.en) : cid; }
  function charL(cid) { var c = S.ep && S.ep.characters[cid]; return c ? L(c.name.ko, c.name.en) : esc(cid); }
  function studentName(i) {
    var c = S.cast[i];
    return (c && c.name) ? c.name : T('학생 ' + (i + 1), 'Student ' + (i + 1));
  }

  /* ── 로그인 계정 (speech-coach.html mgAcctUid/mgAcctName 과 같은 규칙) ── */
  function acctUid() {
    try { var a = JSON.parse(localStorage.getItem('mangoi_logged_user') || 'null'); if (a && (a.uid || a.user_id || a.id)) return a.uid || a.user_id || a.id; } catch (e) {}
    try { var u = JSON.parse(localStorage.getItem('mango_user') || 'null'); if (u && (u.user_id || u.uid || u.id)) return u.user_id || u.uid || u.id; } catch (e) {}
    return null;
  }
  function acctName() {
    var nm = '';
    try { var a = JSON.parse(localStorage.getItem('mangoi_logged_user') || 'null'); if (a && (a.name || a.user_name)) nm = a.name || a.user_name; } catch (e) {}
    if (!nm) { try { var u = JSON.parse(localStorage.getItem('mango_user') || 'null'); if (u && (u.name || u.user_name)) nm = u.name || u.user_name; } catch (e) {} }
    return (nm && String(nm) !== String(acctUid() || '')) ? nm : '';   // ⛔ 이름 == 아이디면 안 보낸다(서버에서 진짜 이름을 덮는다)
  }
  function acctToken() { try { return localStorage.getItem('mango_token') || ''; } catch (e) { return ''; } }

  function sleep(ms, run) {
    return new Promise(function (res) {
      var t = setTimeout(res, ms);
      if (run) run.wakers.push(function () { clearTimeout(t); res(); });
    });
  }

  /* ── 매니페스트 ─────────────────────────────────────────────────────────── */
  function episodeId() {
    var m = /[?&]ep=([^&#]+)/.exec(location.search);
    var id = m ? decodeURIComponent(m[1]) : 'dub-001';
    return EP_ID_RE.test(id) ? id : 'dub-001';
  }
  function loadEpisode() {
    return fetch('/data/dubbing/' + episodeId() + '.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('http_' + r.status); return r.json(); })
      .then(function (raw) {
        var res = C.normalizeEpisode(raw);
        S.problems = res.problems;
        if (res.problems.length) console.warn('[ai-dubbing] 매니페스트 문제', res.problems);
        if (!res.ok) throw new Error('manifest_unplayable');
        S.ep = res.episode;
      });
  }

  /* ── 이야기 고르기(1·2·3편) ─────────────────────────────────────────────
   * 목록 = data/dubbing/index.json. 못 읽어도 지금 편은 그대로 돈다(목록 칸만 숨김).
   * 준비된 편은 ?ep= 주소로 연다(새로고침해도·링크로 보내도 같은 편). 준비 중인 편은 눌리지 않는다. */
  function loadIndex() {
    return fetch('/data/dubbing/index.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('http_' + r.status); return r.json(); })
      .then(function (raw) { return C.normalizeIndex(raw); })
      .catch(function () { return []; });
  }
  /* 작품 카드(B안 «1. 작품 고르기») — 세로 포스터 · «에피소드 6» · 상태. 대표 그림이 없는(준비 중) 편은 큰 번호로 채운다. */
  function renderEpisodes(list) {
    var box = $('dub-eps'), panel = $('dub-eps-panel');
    if (!box || !panel) return;
    if (!list || list.length < 2) { panel.hidden = true; return; }
    var cur = episodeId(), h = '';
    list.forEach(function (e) {
      var ready = e.status === 'ready', on = ready && e.id === cur;
      var pic = !!(e.poster && /^[A-Za-z0-9_\-.\/:]+$/.test(e.poster));
      var inner = (pic ? '' : '<span class="ep-big" aria-hidden="true">' + esc(e.no) + '</span>')
        + '<span class="ep-badge">' + L('에피소드 6', '6 episodes') + '</span>'
        + '<span class="ep-no">' + L(e.no + '편', 'Film ' + e.no) + '</span>'
        + '<span class="ep-t">' + L(e.title.ko, e.title.en) + '</span>'
        + '<span class="ep-s">' + (on ? L('✓ 지금 이 이야기', '✓ Now playing') : ready ? L('▶ 열기', '▶ Open') : L('준비 중', 'Coming soon')) + '</span>';
      var bg = pic ? ' style="background-image:linear-gradient(rgba(10,14,22,.1),rgba(10,14,22,.92) 68%),url(\'' + esc(e.poster) + '\')"' : '';
      if (ready && !on) h += '<a class="ep" href="?ep=' + encodeURIComponent(e.id) + '"' + bg + '>' + inner + '</a>';
      else h += '<div class="ep' + (on ? ' cur' : ' off') + '"' + (on ? ' aria-current="true"' : ' aria-disabled="true"') + bg + '>' + inner + '</div>';
    });
    box.innerHTML = h;
    panel.hidden = false;
  }

  /* ── 장르(B안) ──────────────────────────────────────────────────────────
   * 두 장르 카드는 언제나 함께 보이고, 고른 장르만 아래에 펼친다.
   * 고르는 순서: 주소 ?g=kt|adv > 주소 ?ep=(모험 편 링크) > 이 기기에 기억한 값 > 모험. */
  function pickGenre(search, saved) {
    var q = String(search || '');
    var m = /[?&]g=(adv|kt)(?:[&#]|$)/.exec(q);
    if (m) return m[1];
    if (/[?&]ep=/.test(q)) return 'adv';
    return saved === 'kt' ? 'kt' : 'adv';
  }
  function readPref(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function writePref(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function setGenre(g, save) {
    S.genre = g === 'kt' ? 'kt' : 'adv';
    Array.prototype.forEach.call(document.querySelectorAll('#dub-genres .genre'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-genre') === S.genre));
    });
    if ($('dub-adv')) $('dub-adv').hidden = S.genre !== 'adv';
    if ($('dub-kt')) $('dub-kt').hidden = S.genre !== 'kt';
    if (S.genre === 'kt') renderKT();
    closeSheet();
    renderMbar();
    if (save) writePref(GENRE_KEY, S.genre);
  }
  /* 장르 카드 아래 작은 번호 칸 — 모험은 목록(index.json)의 준비 상태, 키키와 토토는 10편 */
  function renderGenreMini() {
    var adv = $('dub-g-adv-mini'), kt = $('dub-g-kt-mini');
    if (adv && S.index && S.index.length) {
      var cur = episodeId();
      adv.innerHTML = S.index.map(function (e) {
        var ready = e.status === 'ready';
        return '<span class="mn' + (ready ? ' on' : '') + (ready && e.id === cur ? ' cur' : '') + '">' + esc(e.no) + '</span>';
      }).join('');
    }
    if (kt) {
      kt.innerHTML = KT_EPISODES.map(function (e, i) {
        return '<span class="mn on' + (i === S.ktSel ? ' cur' : '') + '">' + (i + 1) + '</span>';
      }).join('');
    }
  }

  /* ── 키키와 토토 10편 ─────────────────────────────────────────────────── */
  function ktIndexOf(id) {
    for (var i = 0; i < KT_EPISODES.length; i++) if (KT_EPISODES[i].id === id) return i;
    return 0;
  }
  function ktImg(e) { return '/media/dubbing/' + e.id + '-key.jpg'; }
  function ktHref(e) { return '/ai-dubbing-studio.html?ep=' + encodeURIComponent(e.id); }
  function ktCastL(e) {
    return e.cast.map(function (c) { var n = KT_CAST[c] || { ko: c, en: c }; return L(n.ko, n.en); }).join(' · ');
  }
  function renderKT() {
    var box = $('dub-kt-list');
    if (!box) return;
    box.innerHTML = KT_EPISODES.map(function (e, i) {
      var on = i === S.ktSel;
      return '<button type="button" class="ktep" data-kt="' + i + '" aria-pressed="' + on + '">'
        + '<span class="thumb"><img src="' + esc(ktImg(e)) + '" alt="" loading="lazy" decoding="async"><span class="epn">EP ' + (i + 1) + '</span></span>'
        + '<span class="kt-lv">Lv.' + e.level + '</span>'
        + '<span class="kt-t">' + L(e.title.ko, e.title.en) + '</span>'
        + '</button>';
    }).join('');
    renderKtSum();
  }
  function renderKtSum() {
    var e = KT_EPISODES[S.ktSel] || KT_EPISODES[0];
    var sum = $('dub-kt-sum'), go = $('dub-kt-go');
    if (sum) {
      sum.innerHTML = '<div class="kt-big" style="background-image:url(\'' + esc(ktImg(e)) + '\')"></div>'
        + '<p class="kt-cast"><b>EP ' + (S.ktSel + 1) + ' · Lv.' + e.level + '</b> ' + L(e.title.ko, e.title.en) + '</p>'
        + '<p class="kt-desc">' + L(e.desc.ko, e.desc.en) + '</p>'
        + '<p class="kt-desc">🎭 ' + ktCastL(e) + '</p>';
    }
    if (go) go.setAttribute('href', ktHref(e));
    renderGenreMini();
    renderMbar();
  }

  /* ── 고른 에피소드(모험) ────────────────────────────────────────────── */
  function playableIn(ep, i) { var sc = ep && ep.scenes[i]; return !!(sc && sc.video && sc.lines.length); }
  function scenePlayable(i) { return playableIn(S.ep, i); }
  function playableIdxs(ep) { var out = []; (ep ? ep.scenes : []).forEach(function (sc, i) { if (playableIn(ep, i)) out.push(i); }); return out; }
  function firstPlayable() {
    for (var i = 0; S.ep && i < S.ep.scenes.length; i++) if (scenePlayable(i)) return i;
    return -1;
  }
  function filmOf(ep) {   // 그 편의 짧은 이름 — 목록(index.json)에 있으면 그것, 없으면 매니페스트 제목
    var hit = null;
    (S.index || []).forEach(function (e) { if (e.id === ep.id) hit = e; });
    if (hit) return { no: hit.no, title: hit.title };
    return { no: null, title: ep.title || { ko: '', en: '' } };
  }
  function filmInfo() { return filmOf(S.ep || { id: episodeId(), title: { ko: '', en: '' } }); }
  function renderPickSum() {
    var box = $('dub-pick-sum'), start = $('dub-start');
    var sc = S.ep && S.sel >= 0 ? S.ep.scenes[S.sel] : null;
    if (start) start.disabled = !!S.run || S.watching || !scenePlayable(S.sel);
    if (!box) return;
    if (!sc) { box.hidden = true; return; }
    var f = filmInfo();
    box.hidden = false;
    box.innerHTML = '<span class="ps-img"' + (sc.poster ? ' style="background-image:url(\'' + esc(sc.poster) + '\')"' : '') + '></span>'
      + '<span class="ps-tx">' + (f.no ? L(f.no + '편 · ' + f.title.ko, 'Film ' + f.no + ' · ' + f.title.en) : L(f.title.ko, f.title.en))
      + '<b>EP ' + sc.no + ' · ' + L(sc.label.ko, sc.label.en) + '</b></span>';
    renderNudge();
  }

  /* ── 폰: 아래 고정 바 · 바텀시트 ──────────────────────────────────────── */
  function isNarrow() { try { return window.matchMedia('(max-width: 860px)').matches; } catch (e) { return false; } }
  function openSheet() {
    var side = $('dub-side');
    if (!side || S.genre !== 'adv') return;
    side.scrollTop = 0;
    side.classList.add('open');
    // 공용 «메뉴» 손잡이(왼쪽 가운데)가 시트 글자를 덮지 않게 — 바뀔 때만 쓴다(body class 관찰자 깨우지 않기)
    if (!document.body.classList.contains('dub-sheet-open')) document.body.classList.add('dub-sheet-open');
    if ($('dub-sheet-bg')) $('dub-sheet-bg').hidden = false;
    var c = $('dub-side-close'); if (c) { try { c.focus({ preventScroll: true }); } catch (e) {} }
  }
  function closeSheet() {
    var side = $('dub-side');
    if (!side || !side.classList.contains('open')) return;
    side.classList.remove('open');
    if (document.body.classList.contains('dub-sheet-open')) document.body.classList.remove('dub-sheet-open');
    if ($('dub-sheet-bg')) $('dub-sheet-bg').hidden = true;
    var b = $('dub-mbar-cast'); if (b && isNarrow()) { try { b.focus({ preventScroll: true }); } catch (e) {} }
  }
  function renderMbar() {
    var img = $('dub-mbar-img'), t1 = $('dub-mbar-t1'), t2 = $('dub-mbar-t2'), castBtn = $('dub-mbar-cast'), ktA = $('dub-mbar-kt');
    if (!img || !t1 || !t2 || !castBtn || !ktA) return;
    var pic = '', a = '', b = '';
    if (S.genre === 'kt') {
      var e = KT_EPISODES[S.ktSel] || KT_EPISODES[0];
      pic = ktImg(e);
      a = 'EP ' + (S.ktSel + 1) + ' · ' + T(e.title.ko, e.title.en);
      b = 'Lv.' + e.level + ' · ' + T('키키와 토토', 'Kiki & Toto');
      ktA.setAttribute('href', ktHref(e));
    } else {
      var sc = S.ep && S.sel >= 0 ? S.ep.scenes[S.sel] : null;
      if (sc) {
        var f = filmInfo();
        pic = sc.poster || '';
        a = 'EP ' + sc.no + ' · ' + T(sc.label.ko, sc.label.en);
        b = (f.no ? T(f.no + '편 · ', 'Film ' + f.no + ' · ') : '') + T('학생 ' + S.cast.length + '명', S.cast.length + (S.cast.length === 1 ? ' student' : ' students'));
      } else {
        a = S.loadErr ? T('더빙 이야기를 불러오지 못했어요', 'Could not load the story') : T('불러오는 중…', 'Loading…');
      }
    }
    img.style.backgroundImage = pic && /^[A-Za-z0-9_\-.\/:]+$/.test(pic) ? "url('" + pic + "')" : '';
    t1.textContent = a;
    t2.textContent = b;
    castBtn.hidden = S.genre === 'kt';
    castBtn.disabled = !S.ep || !!S.run || S.watching;
    ktA.hidden = S.genre !== 'kt';
  }

  /* ── 학생 명단 ─────────────────────────────────────────────────────────── */
  function defaultCast(n) {
    var p = S.ep.playable, out = [];
    for (var i = 0; i < n; i++) out.push({ name: '', character: p[i % p.length] });
    return out;
  }
  function loadCast() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(castKey()) || 'null'); } catch (e) {}
    var ok = Array.isArray(saved) && saved.length && !C.castProblems(saved, S.ep).length;
    S.cast = ok ? saved.map(function (c) { return { name: String(c.name || '').slice(0, 12), character: c.character }; }) : defaultCast(1);
    var me = acctName();
    if (me && !S.cast[0].name) S.cast[0].name = String(me).slice(0, 12);
  }
  function castKey() { return CAST_KEY + ':' + (LIB ? LIB.identity() : 'guest') + ':' + S.ep.id; }
  function saveCast() { try { localStorage.setItem(castKey(), JSON.stringify(S.cast)); } catch (e) {} }

  function renderCast() {
    var box = $('dub-cast');
    if (!box || !S.ep) return;
    var meIdx = acctUid() ? 0 : -1;
    var h = '<div class="cnts">' + L('몇 명이 하나요?', 'How many students?');
    for (var n = 1; n <= C.MAX_STUDENTS; n++) {
      h += ' <button type="button" class="cnt" data-n="' + n + '" aria-pressed="' + (S.cast.length === n) + '">' + n + '</button>';
    }
    h += '</div>';
    S.cast.forEach(function (c, i) {
      h += '<div class="stu"><span class="stu-no">' + (i + 1) + '</span>'
        + '<input class="stu-name" data-i="' + i + '" maxlength="12" value="' + esc(c.name) + '" placeholder="' + esc(T('학생 ' + (i + 1), 'Student ' + (i + 1))) + '" aria-label="' + esc(T('학생 ' + (i + 1) + ' 이름', 'Student ' + (i + 1) + ' name')) + '">'
        + (i === meIdx ? '<span class="stu-me">' + L('내 계정', 'my account') + '</span>' : '')
        + '<div class="chips">';
      S.ep.playable.forEach(function (cid) {
        var ch = S.ep.characters[cid];
        h += '<button type="button" class="chip" data-i="' + i + '" data-c="' + esc(cid) + '" aria-pressed="' + (c.character === cid) + '">'
          + esc(ch.emoji) + ' ' + charL(cid) + '</button>';
      });
      h += '</div></div>';
    });
    var muted = C.mutedCharacters(S.cast);
    var mutedL = [], nativeL = [];
    Object.keys(S.ep.characters).forEach(function (cid) {
      var speaks = S.ep.scenes.some(function (sc) { return sc.lines.some(function (l) { return l.speaker === cid; }); });
      if (!speaks) return;
      (muted[cid] ? mutedL : nativeL).push(esc(S.ep.characters[cid].emoji) + ' ' + charL(cid));
    });
    h += '<div class="mutesum">🔇 ' + L('학생이 말해요(원어민 목소리 끔):', 'Students speak (native voice off):') + ' <b>' + (mutedL.join(', ') || '—') + '</b>'
      + '<br>🔊 ' + L('원어민이 말해요:', 'Native voice:') + ' <b>' + (nativeL.join(', ') || '—') + '</b></div>';
    box.innerHTML = h;
  }

  function onCastClick(e) {
    if (S.run || S.watching) return;
    var b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('cnt')) {
      var n = Number(b.getAttribute('data-n'));
      var next = defaultCast(n);
      for (var i = 0; i < Math.min(n, S.cast.length); i++) next[i] = S.cast[i];
      S.cast = next;
    } else if (b.classList.contains('chip')) {
      var idx = Number(b.getAttribute('data-i')), cid = b.getAttribute('data-c');
      if (S.cast[idx] && S.ep.playable.indexOf(cid) >= 0) S.cast[idx].character = cid;
    } else return;
    S.resume = null;
    if ($('dub-resume-note')) $('dub-resume-note').hidden = true;
    saveCast(); renderCast(); renderMbar(); updateDubMode();
  }
  function onCastInput(e) {
    var el = e.target;
    if (!el.classList || !el.classList.contains('stu-name')) return;
    var i = Number(el.getAttribute('data-i'));
    if (S.cast[i]) { S.cast[i].name = String(el.value || '').slice(0, 12); saveCast(); }
  }

  /* ── 장면 목록 ─────────────────────────────────────────────────────────── */
  /* 에피소드 카드(B안 «2. 에피소드 고르기») — 카드를 누르면 «고르기»(오른쪽 칸에 반영),
   * 카드 아래 data-scene 버튼은 3번 역할 설정으로 이동한다. */
  function renderScenes() {
    var box = $('dub-scenes');
    if (!box || !S.ep) return;
    if (!scenePlayable(S.sel)) S.sel = firstPlayable();
    var busy = !!(S.run || S.watching);   // 더빙·먼저 보기 중에 다시 그려도(언어 바꿈·«봤어요») 잠금이 풀리지 않게
    var h = '';
    S.ep.scenes.forEach(function (sc, i) {
      var who = {};
      sc.lines.forEach(function (l) { who[l.speaker] = true; });
      var emo = Object.keys(who).map(function (cid) { return S.ep.characters[cid].emoji; }).join('');
      var playable = scenePlayable(i), sel = playable && i === S.sel;
      h += '<div class="scene' + (sel ? ' sel' : '') + '">'
        + '<button type="button" class="pick" data-pick="' + i + '" aria-pressed="' + sel + '"' + (playable && !busy ? '' : ' disabled') + '>'
        + '<span class="thumb' + (playable ? ' on' : '') + (playable && sc.poster ? ' pic' : '') + '"'
        + (playable && sc.poster ? ' style="background-image:url(\'' + esc(sc.poster) + '\')"' : '') + '>'
        + '<span class="epn">EP ' + esc(sc.no) + '</span>'
        + (playable ? '<span class="emo">' + esc(emo) + '</span>' : L('영상 준비 중', 'Video coming')) + '</span>'
        + '<span class="tag s' + ((i % 6) + 1) + '">' + L(sc.no + '. ' + sc.label.ko, sc.no + '. ' + sc.label.en) + '</span>'
        + '<span class="meta">' + L('대사 ' + sc.lines.length + '줄', sc.lines.length + ' lines') + ' · '
        + (sc.timing === 'synced' ? L('영상에 맞춰 진행', 'synced to video') : L('차례대로 진행', 'turn by turn'))
        + ' <span class="selmark">' + L('✓ 골랐어요', '✓ Picked') + '</span>'
        + (playable && isSeen(S.ep.id, sc.no) ? ' <span class="seenmark">' + L('👀 봤어요', '👀 Watched') + '</span>' : '') + '</span>'
        + '</button>'
        + '<div class="acts">'
        + '<button type="button" class="btn wbtn" data-watch="' + i + '"' + (playable && !busy ? '' : ' disabled') + '>' + L('👀 보기', '👀 Watch') + '</button>'
        + '<button type="button" class="btn go" data-scene="' + i + '" aria-controls="dub-side"' + (playable && !busy ? '' : ' disabled') + '>' + L('더빙', 'Dub') + '</button>'
        + '</div></div>';
    });
    box.innerHTML = h;
  }
  function pickScene(i) {
    if (S.run || S.watching || !scenePlayable(i)) return;
    S.sel = i;
    S.resume = null;
    if ($('dub-resume-note')) $('dub-resume-note').hidden = true;
    renderScenes(); renderPickSum(); renderMbar();
    updateDubMode();
  }

  function renderStatus() {
    var el = $('dub-status');
    if (!el || !S.ep) return;
    var ep = S.ep;
    var anyTts = ep.scenes.some(function (s) { return s.voiceMode === 'tts'; });
    var h = '<b>' + L(ep.title.ko, ep.title.en) + '</b>';
    if (ep.status !== 'final') {
      h += ' · ' + (ep.note.ko ? L(ep.note.ko, ep.note.en)
        : L('미리보기예요', 'Preview'));
    } else if (anyTts) {
      h += ' · ' + L('일부 장면은 임시 AI 음성으로 나와요.', 'Some scenes use temporary AI voices.');
    }
    el.className = 'notice';
    el.innerHTML = h;
  }
  function renderLoadError() {
    var el = $('dub-status');
    if (!el) return;
    el.className = 'notice err';
    el.innerHTML = '<b>' + L('더빙 이야기를 불러오지 못했어요', 'Could not load the dubbing story') + '</b> · '
      + L('잠시 뒤 새로고침해 주세요.', 'Please reload in a moment.');
  }

  /* ── 소리 엔진 ─────────────────────────────────────────────────────────────
   * 하나의 AudioContext 에 모은다: 원어민 음성·BGM → 스피커 + 완성영상, 마이크 → 완성영상(스피커 X — 되울림 방지) */
  var MIX = null;
  function ensureMix() {
    if (MIX) { try { MIX.ctx.resume(); } catch (e) {} return MIX; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      var ctx = new AC();
      var out = ctx.createGain(); out.connect(ctx.destination);
      var rec = ctx.createMediaStreamDestination ? ctx.createMediaStreamDestination() : null;
      MIX = { ctx: ctx, out: out, rec: rec, snd: null };
      /* 🎵 배경음악·효과음 — 스피커와 완성 영상 갈래 둘 다에 잇는다(완성 영상에도 음악이 들어간다) */
      if (window.MangoiDubSound) { try { MIX.snd = window.MangoiDubSound.create(ctx, [out, rec]); } catch (e) { MIX.snd = null; } }
      try { ctx.resume(); } catch (e) {}
      applySndPrefs();
      return MIX;
    } catch (e) { return null; }
  }
  /* 미디어 요소를 섞개에 잇는다. 끊으려면 돌려준 함수를 부른다.
   * noRec=true 면 스피커로만 보낸다 — «먼저 들어 보기» 소리가 완성 영상에 섞이지 않게. */
  function routeEl(el, gainVal, noRec) {
    if (!MIX) return { gain: null, cut: function () {} };
    try {
      /* ⚠️ 요소 하나는 섞개에 «한 번만» 이을 수 있다 — 돌려 쓰는 요소(아래 소리 요소 풀)는 처음 만든 소스를 다시 쓴다.
       * 다시 만들려 하면 예외가 나고, 앞서 끊어 둔 소스만 남아 그 요소가 영영 무음이 된다. */
      var src = el.__dubSrc || (el.__dubSrc = MIX.ctx.createMediaElementSource(el));
      var g = MIX.ctx.createGain(); g.gain.value = gainVal == null ? 1 : gainVal;
      src.connect(g); g.connect(MIX.out); if (MIX.rec && !noRec) g.connect(MIX.rec);
      return { gain: g, cut: function () { try { src.disconnect(); g.disconnect(); } catch (e) {} } };
    } catch (e) { return { gain: null, cut: function () {} }; }
  }

  /* ── 🎵 배경음악·효과음 — 더빙과 «먼저 보기» 가 같이 쓴다 ─────────────────
   * 판정(어느 장면에 어느 분위기·어느 대사 앞뒤에 무슨 효과음)은 정본 core(sceneCues·timedCues). 여기는 울리기만. */
  function snd() { return MIX && MIX.snd; }
  function sndDuck(v) { var e = snd(); if (e) e.duck(v); }
  function sndCues(sc, slot, k, when) { var e = snd(); if (!e) return; C.sceneCues(sc, slot, k, when).forEach(function (c) { e.cue(c); }); }
  function sndEnter(ep, sc) { var e = snd(); if (e) e.enterScene(ep.palette, sc.mood, !!sc.bgm); }
  function sndStop(sec) { var e = snd(); if (e) { e.stopMusic(sec); e.duck(1); } }
  /* 장면 배경음악 «파일»(sc.bgm) — «🎵 배경음악» 을 끄면 파일도 끈다(합성 음악만 끄면 6편은 그대로 들린다) */
  var BGM_ROUTES = [];
  function setBgmLevel(h) { var on = sndPrefs().music; if (h.r.gain) h.r.gain.gain.value = on ? 1 : 0; else h.el.muted = !on; }
  function routeBgm(el, noRec) {
    var r = routeEl(el, 1, noRec), h = { r: r, el: el };
    BGM_ROUTES.push(h);
    setBgmLevel(h);
    return { gain: r.gain, cut: function () { var i = BGM_ROUTES.indexOf(h); if (i >= 0) BGM_ROUTES.splice(i, 1); r.cut(); } };
  }
  function sndPrefs() {
    var p = null;
    try { p = JSON.parse(localStorage.getItem(SND_KEY) || 'null'); } catch (e) { p = null; }
    p = p && typeof p === 'object' ? p : {};
    return { music: p.music !== false, sfx: p.sfx !== false, ko: p.ko !== false };
  }
  function saveSndPrefs(p) { try { localStorage.setItem(SND_KEY, JSON.stringify(p)); } catch (e) {} }
  function applySndPrefs() {
    var p = sndPrefs(), e = snd();
    if (e) e.setEnabled(p.music, p.sfx);
    BGM_ROUTES.forEach(setBgmLevel);
    var st = $('dub-stage'); if (st) st.classList.toggle('noko', S.watching && !p.ko);
    ['music', 'sfx', 'ko'].forEach(function (k) { var b = $('dub-snd-' + k); if (b) b.checked = p[k]; });
  }

  /* 원어민 대사 TTS — 서버 /api/voice/tts(영어 화자 지정). 같은 문장은 다시 받지 않는다. */
  var TTS_CACHE = {}, TTS_WAIT = {};
  function fetchTtsOnce(text, speaker) {
    return fetch('/api/voice/tts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, lang: 'en', speaker: speaker }),
    }).then(function (r) {
      if (!r.ok) throw new Error('tts_http_' + r.status);
      var got = (r.headers.get('X-TTS-Speaker') || '').toLowerCase();
      return r.blob().then(function (b) {
        if (!b || b.size < 200) throw new Error('tts_empty');
        return { url: URL.createObjectURL(b), sameVoice: !got || got === speaker };
      });
    });
  }
  function getTts(text, speaker) {
    var key = speaker + '|' + text;
    if (TTS_CACHE[key]) return Promise.resolve(TTS_CACHE[key]);
    if (TTS_WAIT[key]) return TTS_WAIT[key];          // 받는 중이면 같이 기다린다(미리 받기와 겹쳐도 요청은 한 번)
    var p = fetchTtsOnce(text, speaker)
      .catch(function () { return new Promise(function (r) { setTimeout(r, 400); }).then(function () { return fetchTtsOnce(text, speaker); }); })
      .then(function (res) {
        if (res.sameVoice) TTS_CACHE[key] = res.url;   // ⛔ 다른 화자로 대체된 음성은 캐시하지 않는다(그 문장이 굳는다)
        return res.url;
      })
      .catch(function () { return null; })
      .then(function (url) { delete TTS_WAIT[key]; return url; });
    TTS_WAIT[key] = p;
    return p;
  }
  /* 미리 받아 두기 — 장면을 시작하면 그 장면 원어민 대사를 뒤에서 받아 둔다(차례 사이 멈춤을 줄인다).
   * «먼저 들어 보기» 가 켜져 있으면 학생 대사도 들려주므로 함께 받아 둔다. */
  function prefetchScene(sc, withStudents) {
    var muted = C.mutedCharacters(S.cast);
    sc.lines.forEach(function (l) { if (withStudents || !muted[l.speaker]) getTts(l.en, C.ttsSpeakerFor(S.ep, l.speaker)); });
  }

  function playUrl(run, url, maxMs, noRec) {
    return new Promise(function (resolve) {
      var a = new Audio();
      a.preload = 'auto';
      a.src = url;
      var route = routeEl(a, 1, noRec);
      var done = false;
      function fin() { if (done) return; done = true; clearTimeout(t); try { a.pause(); } catch (e) {} route.cut(); resolve(); }
      var t = setTimeout(fin, maxMs);
      a.onended = fin; a.onerror = fin;
      run.wakers.push(fin);
      var p = a.play(); if (p && p.catch) p.catch(fin);
    });
  }
  /* TTS 를 못 받았을 때 마지막 폴백 — 기기 목소리(완성 영상에는 안 담긴다).
   * noRec(«먼저 들어 보기») 이면 원래 영상에 안 넣는 소리라 «담기지 않았어요» 표시를 남기지 않는다. */
  function speakDevice(run, text, maxMs, noRec) {
    return new Promise(function (resolve) {
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { setTimeout(resolve, 600); return; }
      var done = false;
      function fin() { if (done) return; done = true; clearTimeout(t); try { speechSynthesis.cancel(); } catch (e) {} resolve(); }
      var t = setTimeout(fin, maxMs);
      run.wakers.push(fin);
      try {
        var u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 0.95;
        u.onend = fin; u.onerror = fin; speechSynthesis.speak(u);
        if (!noRec) run.deviceVoiceUsed = true;
      } catch (e) { fin(); }
    });
  }
  /* cancelled() 가 참이면(받는 사이에 «넘어가기») 받은 소리를 재생하지 않는다. */
  function speakNative(run, line, noRec, cancelled) {
    var words = line.en.split(/\s+/).length;
    var maxMs = Math.max(4000, words * 700 + 3000);
    return getTts(line.en, C.ttsSpeakerFor(S.ep, line.speaker)).then(function (url) {
      if (run.aborted || (cancelled && cancelled())) return;
      return url ? playUrl(run, url, maxMs, noRec) : speakDevice(run, line.en, maxMs, noRec);
    });
  }

  /* ── 마이크 ────────────────────────────────────────────────────────────── */
  function openMic(run) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('no_mic_api'));
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then(function (stream) {
        var mic = { stream: stream, analyser: null, gain: null, src: null, buf: null };
        if (MIX) {
          try {
            mic.src = MIX.ctx.createMediaStreamSource(stream);
            mic.analyser = MIX.ctx.createAnalyser(); mic.analyser.fftSize = 1024;
            mic.buf = new Float32Array(mic.analyser.fftSize);
            mic.src.connect(mic.analyser);
            mic.gain = MIX.ctx.createGain(); mic.gain.gain.value = 0;     // 학생 차례에만 완성영상으로 연다
            mic.src.connect(mic.gain); if (MIX.rec) mic.gain.connect(MIX.rec);  // ⛔ 스피커로는 안 보낸다(되울림)
          } catch (e) {}
        }
        run.mic = mic;
        return mic;
      });
  }
  function micLevel(mic) {
    if (!mic || !mic.analyser) return 0;
    try {
      if (mic.analyser.getFloatTimeDomainData) mic.analyser.getFloatTimeDomainData(mic.buf);
      var s = 0; for (var i = 0; i < mic.buf.length; i++) s += mic.buf[i] * mic.buf[i];
      return Math.sqrt(s / mic.buf.length);
    } catch (e) { return 0; }
  }
  function closeMic(mic) {
    if (!mic) return;
    try { mic.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    try { mic.src && mic.src.disconnect(); mic.gain && mic.gain.disconnect(); } catch (e) {}
  }

  /* 한 대사 녹음 — WAV(16k mono, Azure 용) 우선, 없으면 MediaRecorder(webm, 전사만).
   * 돌려주는 handle.stop() → Promise<{ blob, heard, sec }> */
  function startCapture(run) {
    var mic = run.mic;
    var wav = (window.SpeechAzure && window.SpeechAzure.createRecorder) ? window.SpeechAzure.createRecorder() : null;
    var wavOk = !!(wav && wav.start(mic.stream));
    var mr = null, chunks = [];
    if (!wavOk && window.MediaRecorder) {
      try { mr = new MediaRecorder(mic.stream); mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); }; mr.start(); } catch (e) { mr = null; }
    }
    if (mic.gain) mic.gain.gain.value = 1;
    var h = { t0: Date.now(), heard: false, lastLoud: 0, stopped: false, meterTimer: null };
    (function tick() {
      if (h.stopped) return;
      var lv = micLevel(mic);
      if (lv > SPEECH_RMS) { h.heard = true; h.lastLoud = Date.now(); }
      var m = $('dub-meter'); if (m) m.style.width = Math.min(100, Math.round(lv * 900)) + '%';
      h.meterTimer = setTimeout(tick, 50);
    })();
    h.stop = function () {
      if (h.stopped) return Promise.resolve({ blob: null, heard: h.heard, sec: 0 });
      h.stopped = true; clearTimeout(h.meterTimer);
      if (mic.gain) mic.gain.gain.value = 0;
      var m = $('dub-meter'); if (m) m.style.width = '0%';
      var sec = (Date.now() - h.t0) / 1000;
      if (wavOk) return Promise.resolve({ blob: wav.stopToWav(), heard: h.heard, sec: sec });
      if (!mr) return Promise.resolve({ blob: null, heard: h.heard, sec: sec });
      return new Promise(function (res) {
        mr.onstop = function () { res({ blob: chunks.length ? new Blob(chunks, { type: chunks[0].type || 'audio/webm' }) : null, heard: h.heard, sec: sec }); };
        try { mr.stop(); } catch (e) { res({ blob: null, heard: h.heard, sec: sec }); }
      });
    };
    return h;
  }

  /* ── 채점 (한 줄씩, 뒤에서 차례로 — Azure 를 동시에 여러 번 부르지 않는다) ── */
  var QUEUE = [], QBUSY = false;
  function enqueueScore(res, blob) { QUEUE.push({ res: res, blob: blob }); pump(); }
  function pump() {
    if (QBUSY) return;
    var job = QUEUE.shift();
    if (!job) return;
    QBUSY = true;
    Promise.resolve().then(function () { return scoreOne(job.res, job.blob); })
      .catch(function (e) { job.res.status = 'error'; job.res.err = String((e && e.message) || e).slice(0, 80); })
      .then(function () { QBUSY = false; renderResults(); pump(); });
  }
  function scoreOne(res, blob) {
    function checkOwner() { if (LIB && res.owner !== LIB.identity()) throw new Error('account_changed'); }
    checkOwner();
    res.status = 'scoring'; renderResults();
    var target = res.line.en;
    var isWav = String(blob.type || '').indexOf('wav') >= 0;
    var trimP = (isWav && window.SpeechAzure && SpeechAzure.trimWav) ? SpeechAzure.trimWav(blob).catch(function () { return { blob: blob }; }) : Promise.resolve({ blob: blob });
    return trimP.then(function (t) {
      checkOwner();
      var audio = t.blob || blob;
      var fd = new FormData();
      fd.append('audio', audio, isWav ? 'rec.wav' : 'rec.webm');
      fd.append('lang', 'en');                         // ⛔ prompt 는 보내지 않는다
      return fetch('/api/voice/transcribe', { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function (tr) {
          checkOwner();
          if (!tr || !tr.ok) throw new Error('transcribe_' + ((tr && tr.error) || 'fail'));
          var azP = (isWav && window.SpeechAzure && SpeechAzure.assess)
            ? SpeechAzure.assess({ wavBlob: audio, reference: target, locale: 'en-US', rawSeconds: t.rawSec })
            : Promise.resolve({ ok: false, reason: isWav ? 'svc_missing' : 'not_wav' });
          return azP.then(function (az) { return { tr: tr, az: (az && az.ok) ? az : null, azReason: az && az.reason }; });
        })
        .then(function (o) {
          checkOwner();
          var spoken = (o.az && String(o.az.text || '').trim()) || String(o.tr.text || '').trim();
          res.spoken = spoken;
          if (!spoken) { res.status = 'no_speech'; return; }
          var mine = (res.studentIdx === 0 && !!acctUid());
          var payload = {
            target: target, spoken: spoken,
            student_uid: mine ? acctUid() : 'guest',
            student_name: mine ? (acctName() || undefined) : undefined,
            token: mine ? acctToken() : undefined,
            acoustic: (o.tr.segments || o.tr.transcription_info) ? { segments: o.tr.segments, transcription_info: o.tr.transcription_info } : null,
            azure: o.az,
            azure_diag: o.az ? 'ok(sdk)' : ('sdk:' + String(o.azReason || 'none')),
          };
          var post = function (p) {
            checkOwner();
            return fetch('/api/voice/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
              .then(function (r) { return r.json(); });
          };
          return post(payload).then(function (cd) {
            if (cd && !cd.ok && cd.error === 'auth_required') { payload.student_uid = 'guest'; payload.token = undefined; payload.student_name = undefined; return post(payload); }
            return cd;
          }).then(function (cd) {
            if (!cd || !cd.ok || !cd.scores) throw new Error('coach_' + ((cd && cd.error) || 'fail'));
            res.score = cd.scores; res.tier = cd.tier || null; res.feedback = cd.feedback || '';
            res.words = (o.az && o.az.words) ? o.az.words : null;
            res.status = 'done';
          });
        });
    });
  }

  /* ── 결과 화면 ─────────────────────────────────────────────────────────── */
  var STATUS_TXT = {
    queued: ['⏳ 채점 대기', '⏳ Waiting'], scoring: ['⏳ 채점 중', '⏳ Checking'],
    no_speech: ['🤫 소리가 안 들렸어요', '🤫 No voice heard'], skipped: ['⏭ 넘어감', '⏭ Skipped'],
    no_audio: ['⚠ 녹음 실패', '⚠ Recording failed'], error: ['⚠ 채점 실패', '⚠ Check failed'],
  };
  function renderResults() {
    if (HOME) HOME.practice(S.results);
    var panel = $('dub-results');
    if (!panel) return;
    if (!S.results.length || (S.run && S.run.mode === 'presentation')) { panel.hidden = true; return; }
    panel.hidden = false;
    var sum = C.summarize(S.results.map(function (r) { return { studentIdx: r.studentIdx, score: r.score, status: r.status }; }), S.cast);
    $('dub-sum').innerHTML = sum.filter(function (s) { return s.lines; }).map(function (s) {
      return '<div class="sumc"><b>' + esc(studentName(s.idx)) + '</b> · ' + charL(s.character)
        + '<div class="big">' + (s.avg == null ? '—' : s.avg) + '</div>'
        + L('말한 대사 ' + s.lines + '줄 · 채점 ' + s.scored + '줄', s.lines + ' lines · ' + s.scored + ' checked') + '</div>';
    }).join('');
    $('dub-lines').innerHTML = S.results.map(function (r) {
      var right;
      if (r.status === 'done' && r.score) {
        right = '<span class="sc">' + esc((r.tier && r.tier.emoji) || '') + ' ' + r.score.overall + '</span>';
      } else {
        var st = STATUS_TXT[r.status] || STATUS_TXT.queued;
        right = '<span class="sc">' + L(st[0], st[1]) + '</span>';
      }
      return '<div class="ln"><span class="who">' + esc(studentName(r.studentIdx)) + ' · ' + charL(r.line.speaker) + '</span>'
        + '<span><b>' + esc(r.line.en) + '</b>' + (r.spoken ? '<br><span class="said">🎤 ' + esc(r.spoken) + '</span>' : '') + '</span>'
        + right + '</div>';
    }).join('');
  }

  function renderMovies() {
    var panel = $('dub-movies-panel'), box = $('dub-movies'), fin = $('dub-final');
    if (!panel || !box) return;
    panel.hidden = !S.movies.length;
    box.innerHTML = S.movies.map(function (m, i) {
      var ext = /mp4/.test(m.mime) ? 'mp4' : 'webm';
      return '<div class="mv"><b>' + esc(m.title) + '</b>'
        + '<video controls playsinline preload="metadata" src="' + esc(m.url) + '"></video>'
        + '<a href="' + esc(m.url) + '" download="mangoi-' + esc(S.ep.id) + '-' + (i + 1) + '.' + ext + '">' + L('⬇ 파일 내려받기', '⬇ Download a copy') + '</a>'
        + '<span class="dub-save-note ' + esc(m.saveState || '') + '" role="status">' + (m.saveState === 'saving' ? L('작품을 저장하고 있어요…', 'Saving your movie…') : esc(m.saveMessage || '')) + '</span>'
        + (m.saveState === 'error' && LIB && LIB.hasAccount() ? '<button type="button" class="btn" data-retry-movie="' + i + '">' + L('계정에 다시 저장', 'Retry account save') + '</button>' : '')
        + (m.deviceVoice ? '<span class="hint">' + L('※ 일부 원어민 대사는 기기 목소리로 나와서 영상에 담기지 않았어요.', '※ Some native lines used the device voice and are not in the movie.') + '</span>' : '')
        + '</div>';
    }).join('');
    if (fin) {
      fin.disabled = !S.movies.length;
      fin.innerHTML = S.movies.length ? L('▶ 완성 영상 보기', '▶ Watch my movie')
        : L('▶ 완성 영상 보기 (더빙을 마치면 열려요)', '▶ Watch the finished movie (opens after you dub)');
    }
    /* 브라우저가 구운 webm 에는 «전체 길이» 가 안 적혀 있어 0:00 으로 보이고 구간 이동이 안 된다.
     * 끝으로 한 번 보내 길이를 재게 한 뒤 처음으로 되돌린다(널리 쓰는 우회). */
    Array.prototype.forEach.call(box.querySelectorAll('video'), function (v) {
      v.addEventListener('loadedmetadata', function () {
        if (v.duration !== Infinity && !isNaN(v.duration)) return;
        var back = function () { if (v.duration !== Infinity && !isNaN(v.duration)) { v.removeEventListener('durationchange', back); v.currentTime = 0; } };
        v.addEventListener('durationchange', back);
        try { v.currentTime = 1e7; } catch (e) {}
      }, { once: true });
    });
  }

  /* ── 완성 영상(이 기기) ────────────────────────────────────────────────────
   * 화면의 영상 + 자막을 캔버스에 그리고, 섞개(원어민 음성·BGM·마이크)를 소리로 붙여 MediaRecorder 로 굽는다. */
  function pickMime() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    var list = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    return '';
  }
  function startMovie(run) {
    if (!MIX || !MIX.rec || !window.MediaRecorder) return null;
    var cv = document.createElement('canvas');
    cv.width = 960; cv.height = 540;
    if (!cv.captureStream) return null;
    var g = cv.getContext('2d');
    var probe = document.createElement('canvas'); probe.width = probe.height = 2;
    var pg = probe.getContext('2d');
    /* 영상 장면은 따로 붙잡아 둔다 — 장면을 넘어가며 영상을 새로 불러오는 동안 완성 영상이 «검은 화면» 이 되지 않게
     * (불러오는 사이에는 마지막 장면을 그대로 그린다) */
    var frame = document.createElement('canvas'); frame.width = cv.width; frame.height = cv.height;
    var fg = frame.getContext('2d');
    var mv = { cv: cv, chunks: [], tainted: false, checked: false, timer: null, rec: null, mime: pickMime(), hasFrame: false };
    function draw() {
      var v = $('dub-video');
      if (v && v.readyState >= 2 && v.videoWidth) {
        if (!mv.checked) {               // 다른 출처 영상이 캔버스를 «오염» 시키면 녹화가 죽는다 — 먼저 시험해 본다
          mv.checked = true;
          try { pg.drawImage(v, 0, 0, 2, 2); pg.getImageData(0, 0, 1, 1); } catch (e) { mv.tainted = true; }
        }
        if (!mv.tainted) {
          var r = Math.min(frame.width / v.videoWidth, frame.height / v.videoHeight);
          var w = v.videoWidth * r, hh = v.videoHeight * r;
          try {
            fg.fillStyle = '#000'; fg.fillRect(0, 0, frame.width, frame.height);
            fg.drawImage(v, (frame.width - w) / 2, (frame.height - hh) / 2, w, hh);
            mv.hasFrame = true;
          } catch (e) {}
        }
      }
      g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
      if (mv.hasFrame) g.drawImage(frame, 0, 0);
      var sub = run.sub;
      if (sub && (sub.en || sub.ko)) {
        g.fillStyle = 'rgba(5,8,14,.78)';
        g.fillRect(40, cv.height - 128, cv.width - 80, 104);
        g.textAlign = 'center';
        g.fillStyle = sub.student ? '#34d399' : '#f5b83d';
        g.font = 'bold 20px MangoiHanSC,"Noto Sans KR",sans-serif';
        g.fillText(sub.who || '', cv.width / 2, cv.height - 98);
        g.fillStyle = '#fff'; g.font = 'bold 30px MangoiHanSC,"Noto Sans KR",sans-serif';
        g.fillText(sub.en || sub.ko, cv.width / 2, cv.height - 62, cv.width - 110);
        if (sub.en && sub.ko) { g.fillStyle = '#cbd5e1'; g.font = '18px MangoiHanSC,"Noto Sans KR",sans-serif'; g.fillText(sub.ko, cv.width / 2, cv.height - 34, cv.width - 110); }
      }
      g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.65)'; g.font = 'bold 16px MangoiHanSC,"Noto Sans KR",sans-serif';
      g.fillText('mangoi.ai', cv.width - 18, 28);
    }
    try {
      var stream = cv.captureStream(24);
      MIX.rec.stream.getAudioTracks().forEach(function (t) { stream.addTrack(t); });
      mv.rec = mv.mime ? new MediaRecorder(stream, { mimeType: mv.mime, videoBitsPerSecond: 1500000 }) : new MediaRecorder(stream);
      mv.rec.ondataavailable = function (e) { if (e.data && e.data.size) mv.chunks.push(e.data); };
      draw();
      mv.timer = setInterval(draw, 1000 / 24);    // 녹화하는 동안만 돈다(stopMovie 가 끈다)
      /* 첫 장면이 그려진 뒤에 녹화를 시작한다 — 안 그러면 완성 영상의 첫 화면(미리보기)이 검정이다.
       * 영상을 끝내 못 불러와도(4초) 소리라도 담기게 그때는 그냥 시작한다. */
      var t0 = Date.now();
      (function go() {
        if (!mv.rec || mv.rec.state !== 'inactive' || mv.stopped) return;
        if (mv.hasFrame || mv.tainted || Date.now() - t0 > 4000) { try { mv.rec.start(1000); mv.startedAt = Date.now(); } catch (e) {} return; }
        mv.startTimer = setTimeout(go, 100);
      })();
      return mv;
    } catch (e) { clearInterval(mv.timer); return null; }
  }
  function stopMovie(mv) {
    if (!mv) return Promise.resolve(null);
    clearInterval(mv.timer); clearTimeout(mv.startTimer); mv.stopped = true;
    if (!mv.rec || mv.rec.state === 'inactive') return Promise.resolve(null);
    return new Promise(function (res) {
      mv.rec.onstop = function () {
        if (!mv.chunks.length) { res(null); return; }
        var type = mv.rec.mimeType || mv.mime || 'video/webm';
        res(new Blob(mv.chunks, { type: type }));
      };
      try { mv.rec.stop(); } catch (e) { res(null); }
    });
  }

  /* ── 무대(화면 위 자막·차례 안내) ──────────────────────────────────────── */
  // Practice is bilingual; presentation has no captions unless Korean is enabled.
  function scriptMode() {
    if (!$('dub-mode') || $('dub-mode').value !== 'presentation') return 'both';
    return $('dub-korean') && $('dub-korean').checked ? 'ko' : 'none';
  }
  function dubbingText(line, mode) {
    return { en: mode === 'en' || mode === 'both' ? line.en : '', ko: mode === 'ko' || mode === 'both' ? (line.ko || '') : '' };
  }
  function updateDubMode() {
    var practice = $('dub-mode').value !== 'presentation';
    $('dub-korean-option').hidden = practice;
    $('dub-start').innerHTML = S.resume ? L('▶ 이어 녹음 시작', '▶ Continue recording') : practice ? L('▶ 연습 시작', '▶ Start practice') : L('🎤 발표 더빙 시작', '🎤 Start presentation dubbing');
  }
  function showLine(run, line, performer) {
    var student = performer.type === 'student';
    var who = (S.ep.characters[line.speaker].emoji + ' ' + charName(line.speaker))
      + (student ? ' — 🎤 ' + studentName(performer.idx) : '');
    var text = dubbingText(line, run.scriptMode);
    run.currentLine = line; run.currentPerformer = performer;
    run.sub = { who: who, en: text.en, ko: text.ko, student: student };
    var box = $('dub-sub');
    box.hidden = !(text.en || text.ko);
    box.classList.toggle('me', student);
    $('dub-stage').classList.remove('noko');
    $('dub-sub-who').textContent = who;
    $('dub-sub-en').textContent = text.en;
    $('dub-sub-en').hidden = !text.en;
    $('dub-sub-ko').textContent = text.ko;
  }
  function clearLine(run) { run.sub = null; run.currentLine = null; run.currentPerformer = null; var b = $('dub-sub'); if (b) b.hidden = true; }
  function setTurn(text) { var t = $('dub-turn'); if (!t) return; t.hidden = !text; t.textContent = text || ''; }
  function setNote(text) { var n = $('dub-stage-note'); if (!n) return; n.hidden = !text; n.textContent = text || ''; }
  function setProg(text) { var p = $('dub-prog'); if (p) p.textContent = text || ''; }
  function setButtons(mode) {   // mode: 'student' | 'native' | 'idle'
    $('dub-done').disabled = mode !== 'student';
    $('dub-skip').disabled = mode === 'idle';
  }

  function waitVideo(v, ms) {
    return new Promise(function (resolve) {
      if (v.readyState >= 2) { resolve(true); return; }
      var done = false;
      function fin(ok) { if (done) return; done = true; clearTimeout(t); v.removeEventListener('loadeddata', on); v.removeEventListener('error', off); resolve(ok); }
      function on() { fin(true); } function off() { fin(false); }
      var t = setTimeout(function () { fin(v.readyState >= 2); }, ms);
      v.addEventListener('loadeddata', on); v.addEventListener('error', off);
    });
  }

  /* 학생 한 줄(차례 모드) — 준비 신호 → 마이크 → 말이 끝나면(조용 1.3초)·최대 시간·«다 말했어요» 중 먼저 오는 것에서 끝 */
  function studentTurn(run, sc, it) {
    var idx = it.performer.idx;
    var res = { key: sc.no + ':' + it.line.id + ':' + Date.now(), sceneNo: sc.no, line: it.line, studentIdx: idx, status: 'queued', owner: run.owner };
    return Promise.resolve().then(function () {
      if (run.aborted) return;
      setButtons('student');
      setTurn('🎤 ' + studentName(idx) + ' · ' + charName(it.line.speaker) + T(' 차례예요!', "'s turn!"));
      return sleep(700, run);
    }).then(function () {
      if (run.aborted) return;
      var cap = startCapture(run);
      var maxMs = C.recordWindowSec(it.line, 'turn') * 1000;
      var skipped = false;
      return new Promise(function (resolve) {
        var done = false;
        function fin() { if (done) return; done = true; clearTimeout(watch); resolve(); }
        var watch;
        (function check() {
          var now = Date.now();
          if (now - cap.t0 >= maxMs) { fin(); return; }
          if (cap.heard && now - cap.lastLoud >= SILENCE_STOP_MS) { fin(); return; }
          watch = setTimeout(check, 100);
        })();
        run.doneNow = fin;
        run.skipNow = function () { skipped = true; fin(); };
        run.wakers.push(fin);
      }).then(function () {
        run.doneNow = null; run.skipNow = null;
        return cap.stop();
      }).then(function (r) {
        setTurn('');
        if (run.aborted) return;
        S.results.push(res);
        if (skipped) { res.status = 'skipped'; }          // 넘어간 줄은 채점하지 않는다(녹음은 버림)
        else if (!r.blob) { res.status = 'no_audio'; }
        else if (!r.heard) { res.status = 'no_speech'; }
        else { res.recorded = true; res.status = 'queued'; enqueueScore(res, r.blob); }
        renderResults();
      });
    });
  }

  function playTurns(run, sc) {
    var items = C.assignLines(sc, S.cast, run.counters);   // 대사 순서 그대로 — k 가 곧 정본 효과음의 대사 번호
    var i = 0;
    sndCues(sc, 'start');
    function next() {
      if (run.aborted || i >= items.length) return Promise.resolve();
      var k = i++, it = items[k];
      setProg(T('에피소드 ' + sc.no + ' · ' + i + ' / ' + items.length + ' 줄', 'Episode ' + sc.no + ' · line ' + i + ' / ' + items.length));
      sndCues(sc, 'line', k, 'before');
      showLine(run, it.line, it.performer);
      var p;
      if (it.performer.type === 'student') { sndDuck(DUCK_STUDENT); p = studentTurn(run, sc, it); }
      else {
        setButtons('native');
        sndDuck(DUCK_NATIVE);
        run.skipNow = function () { run.wakers.splice(0).forEach(function (w) { try { w(); } catch (e) {} }); };
        p = speakNative(run, it.line).then(function () { run.skipNow = null; });
      }
      return p.then(function () {
        sndDuck(1);
        if (!run.aborted) sndCues(sc, 'line', k, 'after');
        return sleep(350, run);
      }).then(next);
    }
    return next().then(function () { if (!run.aborted) sndCues(sc, 'end'); });
  }

  /* 동기 모드 — 영상·BGM·캐릭터 음성이 함께 흐르고, 학생 캐릭터 음성만 0. 학생 대사 구간에 마이크를 연다. */
  function playSynced(run, sc) {
    var v = $('dub-video');
    var items = C.assignLines(sc, S.cast, run.counters);
    var muted = C.mutedCharacters(S.cast);
    var tracks = [];
    function addTrack(url, kind, cid, gain) {
      var a = new Audio(); a.crossOrigin = 'anonymous'; a.preload = 'auto'; a.src = url;
      var route = kind === 'bgm' ? routeBgm(a) : routeEl(a, gain);   // 배경음악 파일은 «🎵 배경음악» 설정을 따른다
      if (!route.gain && kind !== 'bgm') a.muted = gain === 0;   // 섞개가 없으면 요소 음소거로라도 끈다
      tracks.push({ el: a, kind: kind, cid: cid, route: route, gain: gain });
    }
    if (sc.bgm) addTrack(sc.bgm, 'bgm', null, 1);
    Object.keys(sc.voices).forEach(function (cid) { addTrack(sc.voices[cid], 'voice', cid, muted[cid] ? 0 : 1); });
    run.tracks = tracks;
    return Promise.all(tracks.map(function (t) {
      return new Promise(function (r) {
        if (t.el.readyState >= 3) { r(); return; }
        var to = setTimeout(r, 8000);
        t.el.addEventListener('canplaythrough', function () { clearTimeout(to); r(); }, { once: true });
        t.el.addEventListener('error', function () { clearTimeout(to); r(); }, { once: true });
      });
    })).then(function () {
      if (run.aborted) return;
      try { v.currentTime = 0; } catch (e) {}
      tracks.forEach(function (t) { try { t.el.currentTime = 0; } catch (e) {} });
      var pv = v.play(); if (pv && pv.catch) pv.catch(function () {});
      tracks.forEach(function (t) { var p = t.el.play(); if (p && p.catch) p.catch(function () {}); });
      setButtons('native');
      return new Promise(function (resolve) {
        var caps = {}, shown = -2, ended = false;
        var limit = sc.durationSec || 0;
        var cues = C.timedCues(sc), fired = {};     // 🎵 효과음 — 영상 시각(정본 timedCues)에 맞춰 한 번씩
        /* 목소리가 영상을 따라가게 — 영상이 받는 중(버퍼링)이면 같이 서고, 다시 움직이면 같은 시각에서 같이 출발(정본 core) */
        var follow = C.clockFollower(), els = tracks.map(function (tr) { return tr.el; });
        var tick = setInterval(function () {
          if (run.aborted) { finish(); return; }
          var t = v.currentTime || 0;
          follow.step(t, els, v);
          var li = C.lineIndexAt(sc.lines, t);
          if (li !== shown) {
            shown = li;
            if (li < 0) { clearLine(run); setTurn(''); sndDuck(1); }
            else {
              showLine(run, items[li].line, items[li].performer);
              setTurn(items[li].performer.type === 'student' ? '🎤 ' + studentName(items[li].performer.idx) + ' · ' + charName(items[li].line.speaker) : '');
              sndDuck(items[li].performer.type === 'student' ? DUCK_STUDENT : DUCK_NATIVE);
            }
          }
          cues.forEach(function (x, k) { if (!fired[k] && t >= x.at) { fired[k] = true; var e = snd(); if (e) e.cue(x.cue); } });
          items.forEach(function (it, k) {
            if (it.performer.type !== 'student') return;
            var l = it.line, cap = caps[k];
            if (!cap && t >= l.start - 0.25 && t < l.end) caps[k] = { h: startCapture(run), it: it };
            else if (cap && !cap.closed && t >= l.end + 0.9) closeCap(k);
          });
          if (v.ended || (limit && t >= limit - 0.05) || (!limit && v.duration && t >= v.duration - 0.05)) finish();
        }, 100);
        function closeCap(k) {
          var cap = caps[k]; cap.closed = true;
          var res = { key: sc.no + ':' + cap.it.line.id + ':' + Date.now(), sceneNo: sc.no, line: cap.it.line, studentIdx: cap.it.performer.idx, status: 'queued', owner: run.owner };
          cap.h.stop().then(function (r) {
            if (run.aborted) return;
            S.results.push(res);
            if (!r.blob) res.status = 'no_audio'; else if (!r.heard) res.status = 'no_speech'; else { res.recorded = true; enqueueScore(res, r.blob); }
            renderResults();
          });
        }
        function finish() {
          if (ended) return; ended = true;
          clearInterval(tick);
          Object.keys(caps).forEach(function (k) { if (!caps[k].closed) closeCap(k); });
          tracks.forEach(function (tr) { try { tr.el.pause(); } catch (e) {} tr.route.cut(); });
          run.tracks = [];
          clearLine(run); setTurn(''); sndDuck(1);
          resolve();
        }
        run.skipNow = function () { try { v.currentTime = Math.max(0, (v.duration || limit || 0) - 0.05); } catch (e) {} finish(); };
        run.wakers.push(finish);
      });
    });
  }

  /* 영상 자체 소리 — «clean»(대사 없는 깨끗한 소리)일 때만 켠다. 켤 때 섞개에 이어야 완성 영상에도 담긴다.
   * ⚠️ 미디어 요소는 섞개에 «한 번만» 이을 수 있어서, 이은 뒤에는 이득(gain)으로 켜고 끈다. */
  var VID_ROUTE = null;
  function setVideoAudio(v, clean) {
    v.muted = !clean;
    if (clean && !VID_ROUTE && MIX) VID_ROUTE = routeEl(v, 1);
    if (VID_ROUTE && VID_ROUTE.gain) VID_ROUTE.gain.gain.value = clean ? 1 : 0;
  }

  /* 장면 영상 불러오기 — 더빙과 «먼저 보기» 가 같이 쓴다(원본 소리는 정본 videoAudio 대로) */
  function loadSceneVideo(v, sc) {
    setVideoAudio(v, sc.videoAudio === 'clean');
    v.loop = sc.timing !== 'synced';
    if (sc.poster) v.poster = sc.poster; else v.removeAttribute('poster');
    v.src = sc.video;
    try { v.load(); } catch (e) {}
  }

  function playScene(run, sc) {
    var v = $('dub-video');
    setNote(''); clearLine(run); setTurn('');
    setProg(T('에피소드 ' + sc.no + ' 불러오는 중…', 'Loading episode ' + sc.no + '…'));
    if (sc.voiceMode === 'tts') prefetchScene(sc, false);
    loadSceneVideo(v, sc);
    sndEnter(S.ep, sc);                              // 🎵 작품 악기 색 + 장면 분위기(배경음악 파일이 있으면 그 파일이 이긴다)
    return waitVideo(v, 10000).then(function (ok) {
      if (run.aborted) return;
      if (!ok) setNote(T('영상을 불러오지 못했어요 — 대사만 진행해요', 'Could not load the video — lines only'));
      else if (S.ep.status !== 'final') setNote(S.ep.note.ko ? T(S.ep.note.ko, S.ep.note.en) : T('미리보기예요', 'Preview'));
      if (sc.timing === 'synced') return playSynced(run, sc);
      var p = v.play(); if (p && p.catch) p.catch(function () {});
      return playTurns(run, sc);
    }).then(function () {
      try { v.pause(); } catch (e) {}
      clearLine(run); setTurn('');
    });
  }

  /* 무대 아래 조작 줄 — 더빙(다 말했어요·넘어가기) / 먼저 보기(멈춤·이전·다음) / 닫힘 */
  function setPlayerMode(mode) {
    $('dub-player').hidden = mode === 'off';         // 결과·완성 영상은 따로 된 칸에 남는다
    if ($('dub-d-row')) $('dub-d-row').hidden = mode !== 'dub';
    if ($('dub-meter-wrap')) $('dub-meter-wrap').hidden = mode !== 'dub';
    if ($('dub-w-row')) $('dub-w-row').hidden = mode !== 'watch';
    if ($('dub-live-korean-option')) $('dub-live-korean-option').hidden = mode !== 'dub' || !S.run || S.run.mode !== 'presentation';
    if (mode !== 'watch' && $('dub-tcard')) $('dub-tcard').hidden = true;
  }
  /* 더빙·먼저 보기 중에는 고르기·출연 설정을 잠근다(둘이 동시에 돌지 않게) */
  var LOCK_SEL = '#dub-scenes button, #dub-all, #dub-start, #dub-genres button, #dub-cast button, #dub-cast input, #dub-make-movie, #dub-mode, #dub-korean, #dub-w-film, #dub-w-all, #dub-nudge button, #dub-quick-start, #dub-quick-resume, #dub-quick-library, #dub-library button, #dub-practice-go';
  function lockUi(on) { Array.prototype.forEach.call(document.querySelectorAll(LOCK_SEL), function (b) { b.disabled = on; }); }
  function setRunning(on) {
    setPlayerMode(on ? 'dub' : 'off');
    lockUi(on);
    $('dub-stop').disabled = !on;
    document.body.classList.toggle('dub-running', !!on);   // 폰 아래 바는 더빙 중엔 숨긴다(플레이어 버튼을 가리지 않게)
    if (HOME) { HOME.render(); HOME.practice(S.results); }
    if (!on) {
      setButtons('idle'); setProg('');
      if (S.ep && !S.run) { renderScenes(); renderPickSum(); }   // 위에서 «전부 켜기» 한 것을 «재생할 수 있는 것만» 으로 되돌린다
      renderWatchPanel();
      renderMbar();
      updateDubMode();
    }
  }

  function checkpoint(run, complete) {
    if (!HOME || !S.ep || (LIB && run.owner !== LIB.identity())) return;
    HOME.checkpoint({ id: 'main-' + S.ep.id, episodeId: S.ep.id, title: T(S.ep.title.ko, S.ep.title.en), state: {
      version: 1, cast: S.cast.map(function (c) { return { name: c.name, character: c.character }; }),
      sceneIdxs: run.sceneIdxs.slice(), nextIndex: run.nextIndex, counters: Object.assign({}, run.checkpointCounters),
      mode: run.mode, korean: run.scriptMode === 'ko', makeMovie: !!($('dub-make-movie') && $('dub-make-movie').checked),
      complete: !!complete,
    } });
  }
  function restorePractice(state) {
    if (!state || state.version !== 1 || !S.ep || !Array.isArray(state.cast) || C.castProblems(state.cast, S.ep).length) return false;
    if (!Array.isArray(state.sceneIdxs) || !state.sceneIdxs.length || state.sceneIdxs.length > S.ep.scenes.length) return false;
    if (!state.sceneIdxs.every(function (i) { return Number.isInteger(i) && scenePlayable(i); })) return false;
    var next = state.complete ? 0 : Number(state.nextIndex);
    if (!Number.isInteger(next) || next < 0 || next >= state.sceneIdxs.length) return false;
    var counters = {};
    S.ep.playable.forEach(function (cid) { var n = state.counters && state.counters[cid]; if (Number.isInteger(n) && n >= 0 && n <= 10000) counters[cid] = n; });
    S.cast = state.cast.map(function (c) { return { name: String(c.name || '').slice(0, 12), character: c.character }; });
    S.resume = { sceneIdxs: state.sceneIdxs.slice(next), counters: state.complete ? {} : counters };
    S.sel = S.resume.sceneIdxs[0];
    $('dub-mode').value = state.mode === 'presentation' ? 'presentation' : 'practice';
    $('dub-korean').checked = !!state.korean;
    $('dub-make-movie').checked = state.makeMovie !== false;
    setGenre('adv', true); saveCast(); renderCast(); renderScenes(); renderPickSum(); renderMbar(); updateDubMode(); openSheet();
    return true;
  }
  function startRun(sceneIdxs, resumeCounters) {
    if (S.run || S.watching || !S.ep) return;
    var probs = C.castProblems(S.cast, S.ep);
    if (probs.length) { alert(T('학생마다 캐릭터를 골라 주세요.', 'Please pick a character for each student.')); return; }
    ensureMix();                                     // ⚠️ 클릭 안에서 만들어야 소리가 난다(자동재생 정책)
    var run = { aborted: false, counters: Object.assign({}, resumeCounters), wakers: [], sub: null, mic: null, movie: null, tracks: [], deviceVoiceUsed: false,
      owner: LIB ? LIB.identity() : '', sceneIdxs: sceneIdxs.slice(), nextIndex: 0, checkpointCounters: Object.assign({}, resumeCounters),
      mode: $('dub-mode').value === 'presentation' ? 'presentation' : 'practice',
      scriptMode: scriptMode() };
    S.run = run;
    S.resume = null;
    // Results belong to this recording, including all scenes in a whole-story run.
    // An in-flight old score may finish, but its detached result cannot affect this take.
    S.results = [];
    QUEUE = [];
    $('dub-live-korean').checked = run.scriptMode === 'ko';
    applySndPrefs();
    renderResults();
    clearLine(run);
    closeSheet();
    setRunning(true);
    $('dub-player').scrollIntoView({ behavior: 'smooth', block: 'start' });
    var title = sceneIdxs.length > 1
      ? T('처음부터 끝까지', 'Whole story')
      : T('에피소드 ' + S.ep.scenes[sceneIdxs[0]].no + ' · ' + S.ep.scenes[sceneIdxs[0]].label.ko, 'Episode ' + S.ep.scenes[sceneIdxs[0]].no + ' · ' + S.ep.scenes[sceneIdxs[0]].label.en);
    checkpoint(run, false);
    openMic(run).catch(function () {
      throw new Error('mic');
    }).then(function () {
      if ($('dub-make-movie') && $('dub-make-movie').checked) run.movie = startMovie(run);
      var k = 0;
      function nextScene() {
        if (run.aborted || k >= sceneIdxs.length) return Promise.resolve();
        run.nextIndex = k;
        run.checkpointCounters = Object.assign({}, run.counters);
        checkpoint(run, false);
        var sc = S.ep.scenes[sceneIdxs[k++]];
        return playScene(run, sc).then(function () {
          if (!run.aborted) { run.nextIndex = k; run.checkpointCounters = Object.assign({}, run.counters); checkpoint(run, k >= sceneIdxs.length); }
          return sleep(500, run);
        }).then(nextScene);
      }
      return nextScene();
    }).catch(function (e) {
      run.failed = true;
      if (String(e && e.message) === 'mic') alert(T('마이크를 쓸 수 없어요. 브라우저에서 마이크를 허용해 주세요.', 'The microphone is not available. Please allow the microphone.'));
      else console.warn('[ai-dubbing] 재생 중 오류', e);
    }).then(function () {
      var mv = run.movie;
      closeMic(run.mic);
      return stopMovie(mv).then(function (blob) {
        if (blob && blob.size > 2000 && (!LIB || run.owner === LIB.identity())) {
          var movie = { title: title + (run.aborted || run.failed ? T(' · 중간 녹음', ' · Partial recording') : ''), url: URL.createObjectURL(blob), mime: blob.type, size: blob.size, deviceVoice: run.deviceVoiceUsed,
            owner: run.owner, interrupted: !!(run.aborted || run.failed), durationMs: mv && mv.startedAt ? Date.now() - mv.startedAt : 0 };
          S.movies.push(movie);
          renderMovies();
          if (HOME) HOME.saveMovie(movie, blob, S.ep.id);
        }
      });
    }).then(function () {
      S.run = null;
      sndStop(0.8);
      setRunning(false);
      renderResults();
    });
  }
  function stopRun() {
    var run = S.run;
    if (!run) return;
    run.aborted = true;
    run.wakers.splice(0).forEach(function (w) { try { w(); } catch (e) {} });
    try { $('dub-video').pause(); } catch (e) {}
    try { speechSynthesis.cancel(); } catch (e) {}
    sndStop(0.3);
  }

  /* ── 👀 먼저 보기(감상) ────────────────────────────────────────────────
   * 순서·멈춤·이전/다음·«봤어요» 판정은 정본 js/ai-dubbing-watch.js. 여기는 재료(kit)와 화면만 맡는다.
   * ⛔ 더빙과 동시에 돌지 않는다(S.run ↔ S.watching). 마이크·녹음·채점 없음.
   * ⚠️ 감상 소리는 «녹화 갈래 없이» 잇는다(noRec) — 다음에 만드는 완성 영상에 섞이지 않게.
   * ⚠️ «봤어요» 는 이 기기에만 남는다(localStorage — 편의 기억). 못 읽으면 «안 봄» 으로 본다. */
  function seenMap() {
    var m = null;
    try { m = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); } catch (e) { m = null; }
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  }
  function isSeen(epId, no) { var a = seenMap()[epId]; return Array.isArray(a) && a.indexOf(no) >= 0; }
  function markSeen(epId, no) {
    if (!EP_ID_RE.test(String(epId)) || typeof no !== 'number' || !isFinite(no)) return;
    var m = seenMap(), a = Array.isArray(m[epId]) ? m[epId].filter(function (x) { return typeof x === 'number'; }) : [];
    if (a.indexOf(no) >= 0) return;
    a.push(no); a.sort(function (x, y) { return x - y; });
    m[epId] = a;
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(m)); } catch (e) {}
  }
  function readyFilms() { return (S.index || []).filter(function (e) { return e.status === 'ready'; }); }

  var WATCH = null;       // 정본 진행기(처음 쓸 때 만든다)
  var W_DONE = null;      // 방금 «끝까지» 본 묶음 { items } — 「더빙하러 가기」 안내
  var W_LOADING = false;  // «모든 작품 이어 보기» 가 다른 편 매니페스트를 받는 중
  function renderWatchPanel() {
    var panel = $('dub-watch-panel');
    if (!panel) return;
    if (!S.ep) { panel.hidden = true; return; }
    panel.hidden = false;
    var busy = !!(S.run || S.watching), idxs = playableIdxs(S.ep), seenN = 0;
    var dots = idxs.map(function (i) {
      var sc = S.ep.scenes[i], on = isSeen(S.ep.id, sc.no);
      if (on) seenN++;
      return '<span class="wd' + (on ? ' on' : '') + '">' + (on ? '✓ ' : '') + 'EP ' + esc(sc.no) + '</span>';
    }).join('');
    var seen = $('dub-w-seen');
    if (seen) seen.innerHTML = idxs.length ? L('본 에피소드', 'Watched') + ' <b>' + seenN + ' / ' + idxs.length + '</b>' + dots : '';
    var film = $('dub-w-film');
    if (film) {
      film.disabled = busy || W_LOADING || !idxs.length;
      film.innerHTML = L('▶ 이 작품 에피소드 ' + idxs.length + '개 이어 보기', '▶ Watch all ' + idxs.length + ' episodes of this film');
    }
    var all = $('dub-w-all'), films = readyFilms();
    if (all) {
      all.hidden = films.length < 2;
      all.disabled = busy || W_LOADING;
      all.innerHTML = W_LOADING ? L('⏳ 불러오는 중…', '⏳ Loading…')
        : L('🎞 모든 작품 이어 보기 (' + films.length + '편)', '🎞 Watch every film (' + films.length + ')');
    }
    var done = $('dub-w-done');
    if (done) {
      done.hidden = !(W_DONE && !busy);
      done.innerHTML = done.hidden ? ''
        : '<span>' + L('👏 끝까지 다 봤어요! 이제 직접 더빙해 볼까요?', '👏 You watched it all! Ready to dub it yourself?') + '</span> '
          + '<button type="button" class="btn go" data-act="dub">' + L('🎤 더빙하러 가기', '🎤 Go dub') + '</button>';
    }
  }
  /* 고른 에피소드를 아직 안 봤으면 «먼저 보기» 를 권한다(막지는 않는다 — 바로 더빙해도 된다) */
  function renderNudge() {
    var box = $('dub-nudge');
    if (!box) return;
    var sc = S.ep && S.sel >= 0 ? S.ep.scenes[S.sel] : null;
    if (!sc || !scenePlayable(S.sel)) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    if (isSeen(S.ep.id, sc.no)) {
      box.className = 'nudge ok';
      box.innerHTML = '<span>' + L('👀 이 에피소드는 봤어요 — 이제 더빙해 봐요!', '👀 You watched this one — now try dubbing it!') + '</span>';
    } else {
      box.className = 'nudge';
      box.innerHTML = '<span>' + L('처음이라면 원어민 목소리로 먼저 한 번 보고 더빙하면 훨씬 쉬워요.', 'New to this one? Watch it once with native voices first — dubbing gets much easier.') + '</span>'
        + '<button type="button" class="btn wbtn" data-watch="' + S.sel + '"' + (S.run || S.watching ? ' disabled' : '') + '>' + L('👀 먼저 보기', '👀 Watch first') + '</button>';
    }
  }
  function renderWProg() {
    var p = $('dub-w-prog'), w = S.wNow;
    if (!p) return;
    if (!w) { p.textContent = ''; return; }
    var f = filmOf(w.it.ep), sc = w.it.ep.scenes[w.it.scIdx];
    p.textContent = (w.i + 1) + ' / ' + w.n + ' · ' + (f.no ? T(f.no + '편 · ', 'Film ' + f.no + ' · ') : '') + 'EP ' + sc.no;
  }
  /* 감상 자막 — 학생 차례가 없으니 «🎤 누구» 없이 캐릭터만. 편이 바뀌어도(모든 작품) 그 편의 캐릭터로 */
  function wShowLine(ep, line) {
    var box = $('dub-sub');
    if (!box) return;
    var c = ep.characters[line.speaker];
    box.hidden = false;
    box.classList.remove('me');
    $('dub-sub-who').textContent = c ? c.emoji + ' ' + T(c.name.ko, c.name.en) : line.speaker;
    $('dub-stage').classList.toggle('noko', !sndPrefs().ko);
    $('dub-sub-en').textContent = line.en;
    $('dub-sub-en').hidden = false;
    $('dub-sub-ko').textContent = line.ko || '';
  }
  function wClearLine() { var b = $('dub-sub'); if (b) b.hidden = true; }
  function wCard(item) {
    var box = $('dub-tcard');
    if (!box) return;
    if (!item) { box.hidden = true; return; }
    var k = $('dub-tc-k'), t = $('dub-tc-t'), s = $('dub-tc-s');
    if (item.end) {
      k.textContent = '🎬 ' + T('끝', 'The end');
      t.textContent = T('다 봤어요!', 'All done!');
      s.textContent = T('이제 더빙해 볼까요? 🎤', 'Ready to dub? 🎤');
    } else {
      var sc = item.ep.scenes[item.scIdx], f = filmOf(item.ep);
      k.textContent = (f.no ? T(f.no + '편 · ', 'Film ' + f.no + ' · ') : '') + T(f.title.ko, f.title.en);
      t.textContent = 'EP ' + sc.no;
      s.textContent = T(sc.label.ko, sc.label.en);
    }
    box.hidden = false;
  }
  function wOnPause(p) {
    var b = $('dub-w-pause');
    if (b) b.innerHTML = p ? L('▶ 이어 보기', '▶ Resume') : L('⏸ 멈춤', '⏸ Pause');
  }
  function wOnItem(i, n, it) {
    S.wNow = { i: i, n: n, it: it };
    renderWProg();
    if ($('dub-w-prev')) $('dub-w-prev').disabled = i === 0;
  }
  function wOnEnd(finished) {
    var items = S.wItems || [];
    S.watching = false; S.wNow = null; S.wItems = null;
    W_DONE = finished ? { items: items } : null;
    try { $('dub-video').pause(); } catch (e) {}
    setNote('');
    setPlayerMode('off');
    lockUi(false);
    document.body.classList.toggle('dub-running', false);
    wOnPause(false); renderWProg();
    if (S.ep) { renderScenes(); renderPickSum(); }
    renderWatchPanel();
    renderMbar();
    var d = $('dub-w-done');
    if (finished && d && !d.hidden) d.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  /* 📱 아이폰(사파리)은 소리 나는 미디어 요소를 «사람이 누른 그 순간» 에 한 번 깨워야 나중에 코드로 틀 수 있다.
   * «먼저 보기» 의 첫 목소리는 제목 카드(2.2초)·TTS 받기 «뒤» 라 그때 새로 만든 Audio 는 막혀 조용히 넘어간다
   * (음악·효과음만 나고 원어민 목소리가 빠짐 — 더빙에서 티가 안 난 것은 마이크가 켜져 있어서로 «추정», 재지 않았다).
   * 그래서 클릭 안에서 요소 몇 개를 미리 깨워 두고(W_POOL) 감상이 그것을 빌려 쓰고 돌려준다(kit.Audio / kit.release).
   * 한 번 깨운 요소는 src 를 바꿔도 계속 쓸 수 있다. 풀이 비면 예전처럼 새로 만든다(아이폰 밖에서는 그대로 된다).
   * ⚠️ 판단 근거는 사파리의 알려진 정책이고 이 환경에서는 아이폰으로 재 보지 못했다 — 진짜 아이폰에서 들어 봐야 확정. */
  var W_SILENT = 'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
  var W_POOL = [], W_POOL_MADE = 0, W_POOL_MAX = 8, W_SYNTH_WOKE = false;   // 동기 장면이 한 번에 쓰는 소리 최대 5개(배경음악+목소리)
  function wakeEl(el) {
    try { el.load(); } catch (e) {}
    try {
      var p = el.play();
      /* 무음을 틀었다 곧바로 멈춘다 — 그 사이 빌려 가서 진짜 소리를 틀었으면 건드리지 않는다 */
      if (p && p.then) p.then(function () { if (el.__dubIdle) { try { el.pause(); } catch (e) {} } }, function () {});
    } catch (e) {}
  }
  function primeWatchAudio() {
    while (W_POOL_MADE < W_POOL_MAX) {
      var a = new Audio(); W_POOL_MADE++;
      a.__dubPool = true; a.__dubIdle = true; a.preload = 'auto'; a.src = W_SILENT;
      wakeEl(a);
      W_POOL.push(a);
    }
    var v = $('dub-video');                          // 영상도 소리가 날 수 있다(videoAudio 'clean') — load() 만으로 풀리는지가 가장 불확실(아이폰 미확인)
    if (v && !v.__dubWoke) { v.__dubWoke = true; try { v.load(); } catch (e) {} }
    if (!W_SYNTH_WOKE && window.speechSynthesis && window.SpeechSynthesisUtterance) {   // 기기 목소리(서버 TTS 실패 때)도 첫 마디는 클릭 안이어야 한다
      W_SYNTH_WOKE = true;
      try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); } catch (e) {}
    }
  }
  function borrowAudio() {
    var a = W_POOL.pop();
    if (!a) return new Audio();
    a.__dubIdle = false; a.onended = null; a.onerror = null; a.crossOrigin = null;
    a.muted = false;                                 // 섞개가 없을 때 배경음악 끔(setBgmLevel)이 남긴 음소거가 다음 목소리로 넘어가지 않게
    try { a.pause(); } catch (e) {}
    return a;
  }
  function returnAudio(el) {
    if (!el || !el.__dubPool || el.__dubIdle) return;   // 영상·풀 밖 요소는 손대지 않는다 · 두 번 돌려받지 않는다
    el.__dubIdle = true; el.onended = null; el.onerror = null;
    try { el.pause(); } catch (e) {}
    W_POOL.push(el);
  }
  function watcher() {
    if (WATCH) return WATCH;
    if (!window.MangoiDubWatch) return null;
    WATCH = window.MangoiDubWatch.create({
      C: C,
      sound: snd,
      Audio: borrowAudio,                            // new kit.Audio() 로 불려도 빌려준 요소가 나간다(함수가 객체를 돌려주면 new 는 그것을 쓴다)
      release: returnAudio,
      /* ⚠️ noRec — 감상 소리는 완성 영상 갈래에 잇지 않는다. 배경음악 파일은 «🎵 배경음악» 설정을 따른다(routeBgm) */
      route: function (el, kind) { return kind === 'bgm' ? routeBgm(el, true) : routeEl(el, 1, true); },
      synth: window.speechSynthesis || null,
      Utter: window.SpeechSynthesisUtterance || null,
      tts: getTts,
      video: function () { return $('dub-video'); },
      prepVideo: loadSceneVideo,
      waitVideo: waitVideo,
      showLine: wShowLine,
      clearLine: wClearLine,
      card: wCard,
      note: function (k) { setNote(k === 'video' ? T('영상을 불러오지 못했어요 — 목소리만 들려줘요', 'Could not load the video — voices only') : ''); },
      onPause: wOnPause,
      onItem: wOnItem,
      onSeen: function (epId, no) { markSeen(epId, no); if (S.ep && epId === S.ep.id) { renderWatchPanel(); renderScenes(); renderNudge(); } },
      onEnd: wOnEnd,
    });
    return WATCH;
  }
  function sceneItems(ep, idxs) { return idxs.map(function (i, k) { return { ep: ep, scIdx: i, first: k === 0 }; }); }
  function startWatch(items) {
    if (S.run || S.watching || !items || !items.length) return;
    var w = watcher();
    if (!w) return;
    ensureMix();                                     // ⚠️ 클릭 안에서 깨워야 소리가 난다(자동재생 정책)
    primeWatchAudio();                               // 📱 같은 이유 — 목소리 요소도 클릭 안에서 깨워 둔다
    applySndPrefs();
    S.watching = true; S.wItems = items; W_DONE = null;
    closeSheet();
    setPlayerMode('watch');
    lockUi(true);
    document.body.classList.toggle('dub-running', true);
    setTurn(''); setNote(''); wOnPause(false);
    renderWatchPanel(); renderNudge(); renderMbar();
    $('dub-player').scrollIntoView({ behavior: 'smooth', block: 'start' });
    w.start(items);
  }
  function watchScene(i) { if (S.ep && scenePlayable(i)) startWatch(sceneItems(S.ep, [i])); }
  function watchFilm() { var idxs = S.ep ? playableIdxs(S.ep) : []; if (idxs.length) startWatch(sceneItems(S.ep, idxs)); }
  /* 다른 편 매니페스트 — 정본 normalizeEpisode 를 지나야 쓴다. 못 읽은 편은 건너뛴다(감상을 통째로 막지 않는다) */
  function loadEpFor(id) {
    if (S.ep && id === S.ep.id) return Promise.resolve(S.ep);
    if (S.epCache[id]) return Promise.resolve(S.epCache[id]);
    return fetch('/data/dubbing/' + id + '.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('http_' + r.status); return r.json(); })
      .then(function (raw) { var res = C.normalizeEpisode(raw); if (!res.ok) throw new Error('manifest_unplayable'); S.epCache[id] = res.episode; return res.episode; })
      .catch(function (e) { console.warn('[ai-dubbing] 감상용 편을 못 읽음', id, e); return null; });
  }
  function watchAll() {
    if (S.run || S.watching || W_LOADING) return;
    var films = readyFilms();
    if (films.length < 2) { watchFilm(); return; }
    ensureMix();                                     // ⚠️ 받기 «전» 에 — 클릭이 끝나기 전에 소리를 깨워 둔다
    primeWatchAudio();                               // 📱 startWatch 는 받은 «뒤» 라 클릭 밖이다 — 여기서 미리
    W_LOADING = true; renderWatchPanel();
    Promise.all(films.map(function (f) { return loadEpFor(f.id); })).then(function (eps) {
      W_LOADING = false;
      var items = [];
      eps.forEach(function (ep) { if (ep) items = items.concat(sceneItems(ep, playableIdxs(ep))); });
      renderWatchPanel();
      if (items.length) startWatch(items);
      else alert(T('영상을 불러오지 못했어요. 잠시 뒤 다시 해 주세요.', 'Could not load the videos. Please try again in a moment.'));
    });
  }
  /* 「🎤 더빙하러 가기」 — 방금 본 묶음에서 «지금 편» 의 첫 장면을 골라 출연 설정으로 */
  function goDub() {
    var items = (W_DONE && W_DONE.items) || [], hit = null;
    items.forEach(function (it) { if (!hit && S.ep && it.ep.id === S.ep.id) hit = it; });
    W_DONE = null;
    if (hit) pickScene(hit.scIdx);
    renderWatchPanel();
    openSheet();
  }

  /* ── 시작 ─────────────────────────────────────────────────────────────── */
  /* 장르·키키와 토토·폰 바텀시트 — 모험 편(매니페스트)을 못 읽어도 돌아야 하는 것들 */
  function wireStatic() {
    var g = $('dub-genres');
    if (g) g.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-genre]');
      if (b && !b.disabled && !S.run) setGenre(b.getAttribute('data-genre'), true);
    });
    var kt = $('dub-kt-list');
    if (kt) kt.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-kt]');
      if (!b) return;
      var i = Number(b.getAttribute('data-kt'));
      if (!KT_EPISODES[i]) return;
      S.ktSel = i; writePref(KT_KEY, KT_EPISODES[i].id);
      Array.prototype.forEach.call(kt.querySelectorAll('button[data-kt]'), function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      renderKtSum();
    });
    if ($('dub-mbar-cast')) $('dub-mbar-cast').addEventListener('click', openSheet);
    if ($('dub-sheet-bg')) $('dub-sheet-bg').addEventListener('click', closeSheet);
    if ($('dub-side-close')) $('dub-side-close').addEventListener('click', closeSheet);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
    try {
      var mq = window.matchMedia('(max-width: 860px)');
      var onMq = function () { if (!mq.matches) closeSheet(); };
      if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
    } catch (e) {}
    var redraw = function () {
      renderEpisodes(S.index); renderGenreMini();
      if (S.genre === 'kt') renderKT();
      if (S.ep) {
        renderStatus();
        if (!S.run) { if (!S.watching) renderCast(); renderScenes(); }
        renderPickSum(); renderResults(); renderMovies();
        renderWatchPanel(); renderWProg();
      } else if (S.loadErr) renderLoadError();
      renderMbar();
      updateDubMode();
      if (HOME) HOME.render();
    };
    window.addEventListener('mangoi:lang-changed', redraw);
    document.addEventListener('mangoi:lang-changed', redraw);
    /* 🎵 배경음악 · 💥 효과음 · 한글 자막 — 더빙과 먼저 보기가 같이 쓴다(이 기기에 기억) */
    ['music', 'sfx', 'ko'].forEach(function (k) {
      var b = $('dub-snd-' + k);
      if (b) b.addEventListener('change', function () { var p = sndPrefs(); p[k] = !!b.checked; saveSndPrefs(p); applySndPrefs(); });
    });
  }
  function wire() {
    var cast = $('dub-cast');
    cast.addEventListener('click', onCastClick);
    cast.addEventListener('input', onCastInput);
    $('dub-scenes').addEventListener('click', function (e) {
      var w = e.target.closest('button[data-watch]');
      if (w && !w.disabled) { var wi = Number(w.getAttribute('data-watch')); pickScene(wi); watchScene(wi); return; }
      var b = e.target.closest('button[data-scene]');
      if (b && !b.disabled) { pickScene(Number(b.getAttribute('data-scene'))); openSheet(); return; }
      var p = e.target.closest('button[data-pick]');
      if (p && !p.disabled) pickScene(Number(p.getAttribute('data-pick')));
    });
    $('dub-start').addEventListener('click', function () {
      if (!scenePlayable(S.sel)) return;
      var resume = S.resume;
      startRun(resume ? resume.sceneIdxs : [S.sel], resume ? resume.counters : null);
    });
    $('dub-mode').addEventListener('change', updateDubMode);
    $('dub-live-korean').addEventListener('change', function () {
      if (!S.run || S.run.mode !== 'presentation') return;
      S.run.scriptMode = this.checked ? 'ko' : 'none';
      $('dub-korean').checked = !!this.checked;
      if (S.run.currentLine) showLine(S.run, S.run.currentLine, S.run.currentPerformer);
    });
    updateDubMode();
    $('dub-all').addEventListener('click', function () {
      var all = [];
      S.ep.scenes.forEach(function (sc, i) { if (sc.video && sc.lines.length) all.push(i); });
      if (all.length) startRun(all);
    });
    $('dub-done').addEventListener('click', function () { if (S.run && S.run.doneNow) S.run.doneNow(); });
    $('dub-skip').addEventListener('click', function () { if (S.run && S.run.skipNow) S.run.skipNow(); });
    $('dub-stop').addEventListener('click', stopRun);
    $('dub-final').addEventListener('click', function () { var p = $('dub-movies-panel'); if (p && !p.hidden) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    if ($('dub-movies')) $('dub-movies').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-retry-movie]');
      if (!b || !HOME) return;
      var movie = S.movies[Number(b.getAttribute('data-retry-movie'))];
      if (movie && movie.blob && movie.saveState !== 'saving') HOME.saveMovie(movie, movie.blob, S.ep.id);
    });
    /* 👀 먼저 보기 */
    if ($('dub-nudge')) $('dub-nudge').addEventListener('click', function (e) {
      var w = e.target.closest('button[data-watch]');
      if (w && !w.disabled) watchScene(Number(w.getAttribute('data-watch')));
    });
    if ($('dub-w-film')) $('dub-w-film').addEventListener('click', function () { watchFilm(); });
    if ($('dub-w-all')) $('dub-w-all').addEventListener('click', function () { watchAll(); });
    if ($('dub-w-done')) $('dub-w-done').addEventListener('click', function (e) { if (e.target.closest('button[data-act="dub"]')) goDub(); });
    if ($('dub-w-prev')) $('dub-w-prev').addEventListener('click', function () { if (WATCH && S.watching) WATCH.prev(); });
    if ($('dub-w-next')) $('dub-w-next').addEventListener('click', function () { if (WATCH && S.watching) WATCH.next(); });
    if ($('dub-w-pause')) $('dub-w-pause').addEventListener('click', function () { if (WATCH && S.watching) WATCH.togglePause(); });
    if ($('dub-w-stop')) $('dub-w-stop').addEventListener('click', function () { if (WATCH && S.watching) WATCH.stop(); });
  }

  function boot() {
    if (HOME) HOME.init({
      episode: function () { return S.ep; }, busy: function () { return !!(S.run || S.watching); },
      shortStart: function (i) { setGenre('adv', true); pickScene(i); $('dub-mode').value = 'practice'; updateDubMode(); openSheet(); },
      restore: restorePractice, moviesChanged: renderMovies,
      accountChanged: function () {
        stopRun(); if (WATCH && S.watching) WATCH.stop(); QUEUE = []; S.results = []; S.resume = null;
        S.movies.forEach(function (m) { URL.revokeObjectURL(m.url); }); S.movies = [];
        if (S.ep) { loadCast(); renderCast(); renderResults(); renderMovies(); }
        if ($('dub-resume-note')) $('dub-resume-note').hidden = true;
        if ($('dub-draft-status')) $('dub-draft-status').textContent = '';
        if ($('dub-next')) $('dub-next').hidden = true;
      },
    });
    window.addEventListener('beforeunload', function (e) {
      if (S.run) { e.preventDefault(); e.returnValue = ''; }
    });
    S.ktSel = ktIndexOf(readPref(KT_KEY));
    wireStatic();
    applySndPrefs();                                 // 체크 칸·«한글 자막» 끔을 기억한 대로(소리 엔진은 첫 클릭에 만든다)
    setGenre(pickGenre(location.search, readPref(GENRE_KEY)), false);
    renderGenreMini();
    loadIndex().then(function (list) { S.index = list; renderEpisodes(list); renderGenreMini(); renderPickSum(); renderWatchPanel(); renderMbar(); });
    loadEpisode().then(function () {
      loadCast();
      S.sel = firstPlayable();
      renderStatus(); renderCast(); renderScenes(); renderPickSum(); renderWatchPanel();
      $('dub-cast-panel').hidden = false;
      $('dub-all-row').hidden = false;
      wire();
      renderMbar();
      if (HOME) HOME.ready();
    }).catch(function (e) {
      console.warn('[ai-dubbing] 불러오기 실패', e);
      S.loadErr = true;
      renderLoadError();
      renderMbar();
      if (HOME && /[?&]library=/.test(location.search)) HOME.ready();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
