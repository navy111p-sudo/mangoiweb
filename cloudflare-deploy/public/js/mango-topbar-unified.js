/**
 * mango-topbar-unified.js — 휴대폰(세로) 수업화면 상단 통합 바
 * -----------------------------------------------------------------------------
 * 왜 만들었나:
 *   휴대폰에서 "⏰ 수업 중·경과" 타이머(#mango-class-time)와 녹화 빨간점
 *   (#mango-rec-badge), 그리고 나가기(✕) 버튼이 같은 우측 상단에 몰려 서로
 *   겹치고, 레이어드 수정들 탓에 ✕ 가 2개로 보이는 문제가 있었음.
 *
 * 무엇을 하나:
 *   - 휴대폰(<=900px)에서 위 3가지 기존 요소를 '시각적으로만' 숨김
 *     (로직·타이머·녹화 기능은 그대로 백그라운드 유지).
 *   - 대신 한 줄짜리 통합 바(#mg-unibar)를 띄움:
 *        🏠 방이름 · 👤인원 · ⏱ 경과   [● 녹화점]
 *   - 경과시간·방이름·인원·녹화여부는 기존 요소에서 '실시간 미러링'.
 *   - 🥭 (2026-07-14) ✕ 나가기 버튼 삭제 — 하단 독(vc-dock)의 '나가기'와 중복이라 제거(사장님 지시).
 *   - 녹화점 탭 → 기존 녹화배지로 동작 전달(확인 후 정지).
 *
 * 안전성:
 *   - 기존 코드를 수정하지 않는 '추가형' 패치. 이 <script> 한 줄만 빼면 원복.
 *   - 데스크탑/태블릿(>900px)에서는 아무 것도 바꾸지 않음.
 */
(function () {
  'use strict';

  // 🔧 (2026-06-27 v2) 휴대폰 세로 + 휴대폰 가로 모두에서 통합 바를 띄운다.
  //   - 세로: (max-width:900px) and (portrait)
  //   - 가로(휴대폰): (landscape) and (max-height:600px)  ← 휴대폰만(태블릿/데스크탑 제외)
  //   가로 위치/겹침 정리는 mango-landscape-topbar.css 가 담당(좌상단 컴팩트 + 방정보 숨김).
  var MQ = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(max-width: 900px) and (orientation: portrait), (orientation: landscape) and (max-height: 600px)')
    : { matches: false, addEventListener: function () {}, addListener: function () {} };
  var bar, elInfo, elRoom, elCount, elElapsed, elRecDot, styleEl;
  var built = false;

  function injectStyle() {
    if (styleEl) return;
    styleEl = document.createElement('style');
    styleEl.id = 'mg-unibar-style';
    styleEl.textContent = [
      /* 통합 바 본체 */
      /* 🥭 (2026-07-13) width:100%→auto — 내용만큼만 차지하는 알약을 '정중앙'에.
         좌측 상단의 포인트 바구니(🧺)/칭찬 버튼과 가로로 안 겹치게 됨. */
      '#mg-unibar{position:fixed;top:calc(env(safe-area-inset-top,0) + 8px);left:50%;',
      '  transform:translateX(-50%);z-index:100000;display:none;align-items:center;gap:7px;',
      '  width:auto;max-width:min(430px, calc(100% - 16px));padding:6px 12px;',
      '  background:rgba(27,35,48,0.90);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);',
      '  border:1px solid #2c3644;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.35);',
      "  font-family:'Pretendard','Apple SD Gothic Neo',system-ui,sans-serif;}",
      '#mg-unibar.show{display:flex;}',
      '#mg-unibar .uni-live{flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:#37c97a;}',
      '#mg-unibar .uni-info{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:5px;',
      '  font-size:12px;color:#aab3c0;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '#mg-unibar .uni-room{color:#ffd24d;font-weight:600;overflow:hidden;text-overflow:ellipsis;max-width:42vw;}',
      '#mg-unibar .uni-sep{color:#4a5562;}',
      '#mg-unibar .uni-ico{font-style:normal;opacity:.9;}',
      '#mg-unibar .uni-clock{color:#ffd24d;}',
      '#mg-unibar .uni-elapsed{color:#ffe6a3;font-weight:700;font-variant-numeric:tabular-nums;}',
      /* 녹화 점 (점멸) */
      '@keyframes mg-uni-pulse{0%{box-shadow:0 0 0 0 rgba(255,77,77,.55)}70%{box-shadow:0 0 0 6px rgba(255,77,77,0)}100%{box-shadow:0 0 0 0 rgba(255,77,77,0)}}',
      '#mg-unibar .uni-rec{flex:0 0 auto;width:13px;height:13px;border-radius:50%;background:#ff4d4d;',
      '  cursor:pointer;animation:mg-uni-pulse 1.4s ease-out infinite;display:none;}',
      '#mg-unibar.recording .uni-rec{display:inline-block;}',
      /* 🥭 (2026-07-14) ✕ 나가기 버튼 스타일 삭제 — 하단 독 '나가기'와 중복이라 버튼 자체를 없앰 */
      '@media (max-width:340px){#mg-unibar .uni-narrow{display:none;}#mg-unibar .uni-info{font-size:11px;}}',
      /* ▼ 통합 바가 켜진 동안(body.mg-uni-on)만 기존 겹침/중복 요소 숨김 (휴대폰 한정) */
      'body.mg-uni-on #mango-class-time{display:none !important;}',
      'body.mg-uni-on #mango-rec-badge{display:none !important;}',
      /* 🥭 (2026-06-28) 통합 바와 중복되는 옛 네이티브 좌측부(상태점 + 방정보) 통째 숨김.
         - 방이름("mangoi-class")이 통합 바와 2번 겹쳐 보이던 문제,
         - 방이름만 숨기니 연결상태 점(#vc-status-dot)이 왼쪽에 외톨이 '불'로 남던 문제
         를 한 번에 해결. 통합 바의 초록 점(.uni-live)·이름만 남김. 세로/가로 공통. */
      'body.mg-uni-on .toolbar-left{display:none !important;}',
      'body.mg-uni-on .toolbar-right .ctrl-btn.danger,',
      'body.mg-uni-on a#vc-exit-btn-v34,body.mg-uni-on a#vc-exit-btn-v33,body.mg-uni-on #vc-exit-btn-v32,',
      'body.mg-uni-on #view-signaling-call .toolbar-right .ctrl-btn.danger{display:none !important;}'
    ].join('\n');
    document.head.appendChild(styleEl);
  }

  function build() {
    if (built) return;
    injectStyle();
    bar = document.createElement('div');
    bar.id = 'mg-unibar';
    bar.innerHTML =
      '<span class="uni-live"></span>' +
      '<div class="uni-info">' +
        '<span class="uni-ico">🏠</span>' +
        '<span class="uni-room">수업 중</span>' +
        '<span class="uni-sep uni-narrow">·</span>' +
        '<span class="uni-narrow"><span class="uni-ico">👤</span> <span class="uni-count">1</span></span>' +
        '<span class="uni-sep">·</span>' +
        '<span class="uni-ico uni-clock">⏱</span>' +
        '<span class="uni-elapsed"></span>' +
      '</div>' +
      '<span class="uni-rec" title="녹화 중 — 눌러서 정지"></span>';
    document.body.appendChild(bar);

    elInfo    = bar.querySelector('.uni-info');
    elRoom    = bar.querySelector('.uni-room');
    elCount   = bar.querySelector('.uni-count');
    elElapsed = bar.querySelector('.uni-elapsed');
    elRecDot  = bar.querySelector('.uni-rec');

    /* 녹화점 → 기존 녹화배지로 전달(모바일은 1탭=펼침이므로 펼친 뒤 정지 흐름으로) */
    elRecDot.addEventListener('click', function () {
      var rb = document.getElementById('mango-rec-badge');
      if (rb) { rb.classList.add('mango-rec-expanded'); rb.click(); }
    });

    /* 🥭 (2026-07-14) ✕ 나가기 버튼 제거 — 나가기는 하단 독(vc-dock)의 '나가기' 버튼만 사용 */

    built = true;
  }

  function txt(el) { return (el && el.textContent ? el.textContent : '').trim(); }

  function isInClass() {
    return !!(document.body && document.body.classList.contains('vc-in-call'));
  }

  /** 경과시간 문자열 추출: "· 경과 00:10" / "시작 전" 등 → "00:10" 또는 원문 */
  function readElapsed() {
    var raw = txt(document.getElementById('mango-class-elapsed'));
    var m = /(\d{1,2}:\d{2}(:\d{2})?)/.exec(raw);
    if (m) return m[1];
    if (/시작\s*전/.test(raw)) return '시작 전';
    return '';
  }

  function readRoom() {
    var r = txt(document.getElementById('vc-room-name')) ||
            txt(document.getElementById('sig-room-name'));
    return r || '수업 중';
  }

  function readCount() {
    var c = txt(document.getElementById('vc-user-count'));
    return c || '1';
  }

  function tick() {
    var on = isInClass() && MQ.matches;

    if (on && !built) build();
    if (!built) { return; }

    if (on) {
      document.body.classList.add('mg-uni-on');
      bar.classList.add('show');
      elRoom.textContent = readRoom();
      elCount.textContent = readCount();
      var el = readElapsed();
      elElapsed.textContent = el;
      elElapsed.style.display = el ? 'inline' : 'none';
      /* 녹화 여부: 녹화배지가 DOM에 존재하면 녹화 중으로 간주.
         (mg-uni-on 이 배지를 display:none 처리하므로 visible() 은 항상 false → 존재 여부로 판단해야 함.
          mango-rec.js 는 정지 시 recBadge.remove() 로 DOM 에서 제거하므로 존재=녹화중이 정확) */
      if (document.getElementById('mango-rec-badge')) bar.classList.add('recording');
      else bar.classList.remove('recording');
    } else {
      document.body.classList.remove('mg-uni-on');
      bar.classList.remove('show');
    }
  }

  function start() {
    /* 0.7초 주기로 상태 미러링 (mango-rec/attendance 폴링과 유사 주기) */
    tick();
    setInterval(tick, 700);
    if (MQ.addEventListener) MQ.addEventListener('change', tick);
    else if (MQ.addListener) MQ.addListener(tick);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  /* 테스트용 export */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parseElapsed: function (raw) {
        var m = /(\d{1,2}:\d{2}(:\d{2})?)/.exec(String(raw || ''));
        if (m) return m[1];
        if (/시작\s*전/.test(String(raw || ''))) return '시작 전';
        return '';
      }
    };
  }
})();
