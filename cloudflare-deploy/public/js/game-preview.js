/* ══════════════════════════════════════════════════════════════════════════
   game-preview.js — 잠긴 게임의 «미리보기» 창            (2026-08-22 사장님 지시)
   ─────────────────────────────────────────────────────────────────────────
   [무엇] student-games.html 의 잠긴 카드를 누르면 여기 hubPreviewGame() 이 열린다.
          실제 플레이 대신 «무슨 게임인지» 를 보여 주고, 여는 방법 두 가지를 안내한다.
            ① 게임 N개 클리어         ② 레벨테스트로 바로 열기
   [왜 별도 파일인가]
          student-games.html 의 **첫 화면 무게 예산**(first_paint_budget_harness)에
          여유가 1KB 도 남아 있지 않다. 이 기능은 «잠긴 카드를 누른 뒤» 에만 필요하니
          defer 로 빼서 첫 화면에서 비켜 준다. 스타일도 처음 열 때 이 파일이 주입한다.
   ⛔ 이 파일을 student-games.html 안으로 되돌리지 말 것 — 예산이 즉시 넘친다.
   ⚠️ 내용을 고치면 student-games.html 의 <script> 태그 ?v= 를 함께 올린다
      (asset_version_harness 가 안 올리면 FAIL 낸다).

   [화면 규칙 — 사장님 지시의 핵심]
     자물쇠 UI 가 제목·설명을 **가리지 않는다.** 층을 셋으로 나눠 겹칠 자리를 없앴다:
       .pv-media(사진·클립 + 자물쇠) / .pv-body(제목·설명) / .pv-gate(해금 안내)
     ⛔ 예전처럼 카드·사진 한가운데를 덮는 방식(.lockveil)으로 되돌리지 말 것.

   [허브에서 빌려 쓰는 것] — 전부 student-games.html 인라인 스크립트의 전역이다.
     HUB_GAMES(⚠️ const 라 window 에 안 올라간다 → 허브가 window.HUB_GAMES 로 내보낸다),
     _hubGame · _gameTitle · _clears · _unlockedCount · _needToUnlock ·
     _openModal · closeModal · hubOpenGame  (모두 최상위 function 선언이라 window 에 있다)
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* 🎨 스타일은 처음 열 때 한 번만 주입한다 — 첫 화면 CSS 를 늘리지 않으려는 것이 이 파일의 목적이다.
     ⚠️ <body> 끝에 붙인다. 이 화면의 규칙 중에는 문서 뒤쪽에서 오는 것이 있어
        head 에 넣으면 같은 특정성에서 진다(CLAUDE.md 2장 «JS 로 스타일을 얹었는데 짐»). */
  var PV_CSS = [
    '.modal.mwide{max-width:620px;padding:0;overflow:hidden}',
    '.pv-media{position:relative;background:#081227;aspect-ratio:16/10;overflow:hidden;display:flex;align-items:center;justify-content:center}',
    '.pv-media img,.pv-media video{width:100%;height:100%;object-fit:cover;display:block}',
    '.pv-media .pv-lock{position:absolute;right:12px;top:12px;z-index:3;padding:6px 13px;border-radius:999px;background:rgba(8,20,44,.88);border:1px solid rgba(251,191,36,.65);color:#fde68a;font-size:13px;font-weight:900;box-shadow:0 2px 10px rgba(0,0,0,.45)}',
    /* 슬라이드 점 — 사진이 여러 장일 때만 나온다.
       ⚠️ 사진 아래쪽이 밝은 게임(피자·낚시)에서는 흰 점이 묻힌다 → 옅은 그림자막을 함께 깐다.
          막은 pointer-events:none 이라 사진 클릭을 막지 않는다. */
    '.pv-dots{position:absolute;left:0;right:0;bottom:10px;z-index:3;display:flex;justify-content:center;gap:7px}',
    '.pv-dots::before{content:"";position:absolute;left:0;right:0;bottom:-10px;height:46px;z-index:-1;pointer-events:none;background:linear-gradient(to top,rgba(4,10,26,.62),rgba(4,10,26,0))}',
    '.pv-dots i{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.42);box-shadow:0 1px 4px rgba(0,0,0,.6);transition:background .2s,transform .2s}',
    '.pv-dots i.on{background:#fbbf24;transform:scale(1.25)}',
    /* 제목·설명 칸 — 자물쇠와 «다른 층» 이라 겹칠 자리가 없다 */
    '.pv-body{padding:18px 20px 20px}',
    '.pv-body h2{margin:0 0 6px;font-size:21px;font-weight:900;text-align:left;line-height:1.3}',
    '.pv-body .pv-dsc{color:var(--sub);font-size:15px;line-height:1.6;margin:0 0 16px}',
    /* 해금 안내 칸 */
    '.pv-gate{background:rgba(251,191,36,.13);border:1px solid rgba(251,191,36,.4);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:11px}',
    '.pv-gate .pv-need{font-size:15.5px;font-weight:800;color:#fde68a;line-height:1.5;margin:0}',
    '.pv-gate .pv-need b{color:#fff}',
    '.pv-ways{display:flex;flex-direction:column;gap:8px}',
    '.pv-way{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.06);border:1px solid var(--line);border-radius:11px;padding:11px 13px;color:#e2e8f0;font-size:14.5px;font-weight:700;line-height:1.45;text-align:left;font-family:inherit;cursor:pointer;text-decoration:none}',
    '.pv-way:hover{background:rgba(255,255,255,.12);border-color:rgba(251,191,36,.5)}',
    '.pv-way .pv-ic{font-size:19px;line-height:1;flex:0 0 auto}',
    '.pv-way.primary{background:linear-gradient(135deg,#fbbf24,#d97706);border-color:rgba(251,191,36,.8);color:#1b1206}',
    '.pv-way.primary:hover{background:linear-gradient(135deg,#fcd34d,#ea8a08)}',
    '@media(max-width:640px){',
    '.pv-body{padding:15px 15px 17px}',
    '.pv-body h2{font-size:18px}',
    '.pv-body .pv-dsc{font-size:13.5px;margin-bottom:13px}',
    '.pv-gate .pv-need{font-size:14px}',
    '.pv-way{font-size:13.5px;padding:10px 11px}',
    '}'
  ].join('\n');

  var _cssDone = false;
  function _pvCss() {
    if (_cssDone || document.getElementById('game-preview-css')) return;
    _cssDone = true;
    var st = document.createElement('style');
    st.id = 'game-preview-css';
    st.textContent = PV_CSS;
    document.body.appendChild(st);
  }

  /* 🎞 미리보기 미디어 표 — 게임별 클립 / 스크린샷 슬라이드.
     ⚠️ 없는 파일을 여기 적으면 **미리보기를 열 때마다 404** 가 난다. 같은 함정을
        전체메뉴 아이콘에서 이미 밟았다(js/idx-allmenu.js 32행 주석). 그래서 이 표에는
        **실제로 올라온 파일만** 적는다.
     📌 이 사진들은 **손으로 찍은 것이 아니라** test-harness/manual/game-preview-capture.mjs 가
        게임을 헤드리스 브라우저로 실제로 띄우고 시작 화면을 눌러 넘긴 뒤 찍은 «진짜 플레이
        화면» 이다(게임당 2장, 720x450 WebP, 7~41KB). 게임 화면을 크게 바꿨으면 사람이
        그 스크립트를 다시 돌리면 된다 — 21판을 손으로 다시 돌 필요가 없다.
     📌 표에 없는 게임(battle3d·tank)은 **일부러 비웠다.** 그 자리는 카드 사진 한 장으로
        그려진다 — 잘못 찍힌 사진보다 그쪽이 낫다.
     회귀 감시: test-harness/game_quest_unlock_harness.mjs 가 «여기 적힌 파일이
        실재하는가» 를 검사한다. */
  var GAME_PREVIEW = {
    spacemonster: { shots: ['/img/games/preview/spacemonster-1.webp', '/img/games/preview/spacemonster-2.webp'] },
    avatar: { shots: ['/img/games/preview/avatar-1.webp', '/img/games/preview/avatar-2.webp'] },
    pizza: { shots: ['/img/games/preview/pizza-1.webp', '/img/games/preview/pizza-2.webp'] },
    escape: { shots: ['/img/games/preview/escape-1.webp', '/img/games/preview/escape-2.webp'] },
    escapezombie: { shots: ['/img/games/preview/escapezombie-1.webp', '/img/games/preview/escapezombie-2.webp'] },
    escapeschool: { shots: ['/img/games/preview/escapeschool-1.webp', '/img/games/preview/escapeschool-2.webp'] },
    langace: { shots: ['/img/games/preview/langace-1.webp', '/img/games/preview/langace-2.webp'] },
    p383d: { shots: ['/img/games/preview/p383d-1.webp', '/img/games/preview/p383d-2.webp'] },
    fish: { shots: ['/img/games/preview/fish-1.webp', '/img/games/preview/fish-2.webp'] },
    shooter: { shots: ['/img/games/preview/shooter-1.webp', '/img/games/preview/shooter-2.webp'] },
    suspect: { shots: ['/img/games/preview/suspect-1.webp', '/img/games/preview/suspect-2.webp'] },
    speaking: { shots: ['/img/games/preview/speaking-1.webp', '/img/games/preview/speaking-2.webp'] },
    wordfighter: { shots: ['/img/games/preview/wordfighter-1.webp', '/img/games/preview/wordfighter-2.webp'] },
    tetris: { shots: ['/img/games/preview/tetris-1.webp', '/img/games/preview/tetris-2.webp'] },
    rescue: { shots: ['/img/games/preview/rescue-1.webp', '/img/games/preview/rescue-2.webp'] },
    brick: { shots: ['/img/games/preview/brick-1.webp', '/img/games/preview/brick-2.webp'] },
    match: { shots: ['/img/games/preview/match-1.webp', '/img/games/preview/match-2.webp'] },
    fill: { shots: ['/img/games/preview/fill-1.webp', '/img/games/preview/fill-2.webp'] },
    balloon: { shots: ['/img/games/preview/balloon-1.webp', '/img/games/preview/balloon-2.webp'] },
    /* 클립을 올리면 shots 대신 clip 을 쓴다 (30~60초):
       spacemonster: { clip: '/video/games/spacemonster.mp4' },
       ⛔ battle3d · tank 는 일부러 비워 뒀다 — 자동 캡처가 «설정 화면» 까지밖에 못 갔고
          (battle3d), tank 는 지형 텍스처가 안 실려 실제 화면과 다르게 찍혔다.
          잘못 찍힌 사진보다 카드 사진 폴백이 낫다. 사람이 찍어 올리면 여기 두 줄만 더한다. */
  };

  var _pvTimer = null;

  /* 🎫 레벨테스트로 바로 열기 — 신청 화면(홈 모달)으로 보낸다.
     ⚠️ 주소 정본은 js/mg-sidebar.js 의 URLS['leveltest'] 와 같아야 한다.
        옛 /level-test.html 은 2026-08-07 에 폐지됐다. */
  function hubGoLeveltest() {
    try { closeModal(); } catch (_) {}
    location.href = '/?menu=leveltest';
  }

  /* 지금 «해야 할» 게임 — 열려 있고 아직 한 번도 안 깬 것. 없으면 열린 것 중 첫 번째.
     미리보기에서 「지금 열린 게임부터 하기」가 가리키는 곳이다. */
  function _nextPlayable() {
    var list = window.HUB_GAMES || [];
    var c = _clears(), open = _unlockedCount(), i;
    for (i = 0; i < open && i < list.length; i++) {
      if (!(parseInt(c[list[i].mode], 10) || 0)) return list[i];
    }
    return list[0] || null;
  }

  function hubPreviewGame(mode) {
    var g = (typeof _hubGame === 'function') ? _hubGame(mode) : null;
    if (!g) return;
    _pvCss();

    var pv = GAME_PREVIEW[mode] || {};
    /* 🖼 기본 그림은 «허브 카드와 같은 규칙»으로 — 카드는 g.imageSrc 를 먼저 본다(student-games.html).
       ⚠️ 여기서 그걸 안 보면 imageSrc 를 쓰는 게임만 미리보기 그림이 깨진다
          (2026-09-21 장면 탐험대가 그랬습니다 — 카드는 나오는데 미리보기만 이모지 폴백). */
    var shots = (pv.shots && pv.shots.length) ? pv.shots.slice(0)
      : [g.imageSrc || ('/img/games/' + mode + '.webp')];
    var need = _needToUnlock(mode);
    var nx = _nextPlayable();
    var ttl = (typeof _gameTitle === 'function') ? _gameTitle(g) : g.ttl;

    var media = pv.clip
      ? '<video id="pv-clip" src="' + pv.clip + '" muted autoplay loop playsinline preload="metadata"></video>'
      // 사진을 못 받아도 칸이 텅 비지 않게, 카드와 같은 이모지 폴백으로 되돌린다
      : '<img id="pv-shot" src="' + shots[0] + '" alt=""'
        + ' onerror="this.style.display=\'none\';this.parentNode.insertAdjacentHTML(\'afterbegin\',\'<span style=&quot;font-size:72px&quot;>' + g.ico + '</span>\')">'
        + (shots.length > 1
            ? '<div class="pv-dots" id="pv-dots">'
              + shots.map(function (_, i) { return '<i class="' + (i ? '' : 'on') + '"></i>'; }).join('')
              + '</div>'
            : '');

    _openModal(
        '<div class="pv-media">' + media + '<span class="pv-lock">🔒 잠김</span></div>'
      + '<div class="pv-body">'
      +   '<h2>' + g.ico + ' ' + ttl + '</h2>'
      +   '<p class="pv-dsc">' + g.dsc + '</p>'
      +   '<div class="pv-gate">'
      +     '<p class="pv-need">🗝️ 게임 <b>' + need + '개</b>를 클리어하면 열려요!</p>'
      +     '<div class="pv-ways">'
      +       (nx ? '<button type="button" class="pv-way primary" onclick="closeModal();hubOpenGame(\'' + nx.mode + '\')">'
                    + '<span class="pv-ic">' + nx.ico + '</span>'
                    + '<span>지금 열린 게임부터 하기 · ' + nx.ttl.split(' (')[0] + '</span></button>' : '')
      +       '<button type="button" class="pv-way" onclick="hubGoLeveltest()">'
      +         '<span class="pv-ic">🎫</span>'
      +         '<span>레벨테스트로 바로 열기 — 실력이 확인되면 전부 열려요</span></button>'
      +     '</div>'
      +   '</div>'
      +   '<button type="button" class="mclose" onclick="closeModal()">닫기</button>'
      + '</div>'
    );
    try { document.getElementById('modal-body').classList.add('mwide'); } catch (_) {}

    /* 🖼 스크린샷이 여러 장이면 천천히 넘긴다. 모달이 닫히면 «스스로» 멈춘다.
       ⛔ 상주 타이머를 남기지 말 것 — 게임 허브를 켜 둔 학생 폰을 계속 깨운다
          (CLAUDE.md 2장 «상주 setInterval 도 두지 마세요»). */
    if (_pvTimer) { clearInterval(_pvTimer); _pvTimer = null; }
    if (!pv.clip && shots.length > 1) {
      var idx = 0;
      _pvTimer = setInterval(function () {
        var im = document.getElementById('pv-shot');
        var back = document.getElementById('modal-back');
        if (!im || !back || !back.classList.contains('on')) {
          clearInterval(_pvTimer); _pvTimer = null; return;
        }
        idx = (idx + 1) % shots.length;
        im.src = shots[idx];
        var dots = document.getElementById('pv-dots');
        if (dots) Array.prototype.forEach.call(dots.children, function (d, i) { d.className = (i === idx) ? 'on' : ''; });
      }, 2600);
    }
    /* 🎬 클립은 «짧은 미리보기» 다 — 60초가 지나면 멈춘다.
       무한 반복으로 두면 필리핀·중국 회선에서 데이터만 먹는다. */
    if (pv.clip) {
      setTimeout(function () {
        var v = document.getElementById('pv-clip');
        if (v) { try { v.loop = false; v.pause(); } catch (_) {} }
      }, 60000);
    }
  }

  // 허브(인라인 스크립트)가 부른다 — 이름을 바꾸면 student-games.html 도 함께 고칠 것
  window.hubPreviewGame = hubPreviewGame;
  window.hubGoLeveltest = hubGoLeveltest;
  window.GAME_PREVIEW = GAME_PREVIEW;
})();
