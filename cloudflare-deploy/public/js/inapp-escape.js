/**
 * inapp-escape.js — 카카오톡/인앱 브라우저 화상(WebRTC) 대응
 * ------------------------------------------------------------------
 * 문제: 카카오톡·네이버·인스타그램 등 "인앱 브라우저(WebView)"로 링크를 열면
 *       안드로이드에서 카메라/마이크(getUserMedia)가 막혀 화상 화면이 안 뜸.
 * 해결:
 *   1) 인앱 브라우저 + 안드로이드  → 기기 기본 브라우저(크롬)로 자동 전환
 *      - 카카오톡: kakaotalk://web/openExternal
 *      - 그 외   : intent:// (크롬)
 *   2) 인앱 브라우저 + iOS         → 자동 전환 불가 → 상단 안내 배너 표시
 *   3) 어떤 환경이든 카메라 권한 실패 시 → 외부 브라우저 안내 오버레이 표시
 *
 * 사용: 화상 페이지 <head> 최상단에서 가장 먼저 로드.
 *       (전역 함수 window.MangoEscape.openExternal() 도 노출)
 */
(function () {
  'use strict';

  var ua = (navigator.userAgent || '').toLowerCase();
  var isAndroid = /android/.test(ua);
  var isIOS = /iphone|ipad|ipod/.test(ua) || (/mac/.test(ua) && navigator.maxTouchPoints > 1);

  // 인앱 브라우저 감지
  var inApp = {
    kakao:     /kakaotalk/.test(ua),
    naver:     /naver/.test(ua),
    instagram: /instagram/.test(ua),
    facebook:  /fban|fbav|fb_iab/.test(ua),
    line:      /\bline\//.test(ua) || / line\//.test(ua),
    daum:      /daumapps/.test(ua),
    band:      /band\//.test(ua)
  };
  var isInApp = inApp.kakao || inApp.naver || inApp.instagram ||
                inApp.facebook || inApp.line || inApp.daum || inApp.band;

  var currentUrl = location.href;

  // ── 외부(기본) 브라우저로 열기 ───────────────────────────────
  function openExternal() {
    if (isAndroid) {
      if (inApp.kakao) {
        // 카카오톡 전용 스킴: 기기 기본 브라우저로 현재 URL 열기
        location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(currentUrl);
        return true;
      }
      // 그 외 인앱 → 크롬으로 intent 전환
      var noScheme = currentUrl.replace(/^https?:\/\//, '');
      location.href =
        'intent://' + noScheme +
        '#Intent;scheme=https;package=com.android.chrome;' +
        'S.browser_fallback_url=' + encodeURIComponent(currentUrl) + ';end';
      return true;
    }
    // iOS는 자동 전환 스킴이 없음 → 안내 배너로 유도
    return false;
  }
  window.MangoEscape = { openExternal: openExternal, isInApp: isInApp, inApp: inApp };

  // ── 안내 배너 / 오버레이 ────────────────────────────────────
  function buildBanner() {
    if (document.getElementById('mango-inapp-banner')) return;

    var wrap = document.createElement('div');
    wrap.id = 'mango-inapp-banner';
    wrap.setAttribute('role', 'alertdialog');
    wrap.style.cssText =
      'position:fixed;left:0;right:0;top:0;z-index:2147483647;' +
      'background:linear-gradient(135deg,#1f2433,#2b3146);color:#fff;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;' +
      'box-shadow:0 4px 18px rgba(0,0,0,.35);padding:14px 16px;' +
      'display:flex;flex-direction:column;gap:10px;';

    var title = isIOS
      ? '📷 카메라가 안 보이나요?'
      : '📷 화상 화면을 위해 브라우저로 이동합니다';
    var guide = isIOS
      ? '카카오톡 화면 <b>오른쪽 아래(또는 위쪽 ···) 메뉴</b>에서 ' +
        '<b>“다른 브라우저로 열기 / Safari로 열기”</b>를 눌러 주세요. ' +
        '그래야 카메라·마이크가 정상 작동합니다.'
      : '카카오톡 안에서는 카메라가 차단됩니다. 아래 버튼을 누르면 ' +
        '<b>크롬(기본 브라우저)</b>에서 화상 화면이 열립니다.';

    var html =
      '<div style="font-size:15px;font-weight:700;line-height:1.4">' + title + '</div>' +
      '<div style="font-size:13px;line-height:1.55;opacity:.92">' + guide + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">';

    if (!isIOS) {
      html +=
        '<button id="mango-inapp-go" style="flex:1;min-width:140px;border:0;border-radius:10px;' +
        'padding:11px 14px;font-size:14px;font-weight:700;cursor:pointer;' +
        'background:#ffd54a;color:#1f2433">브라우저에서 열기 ↗</button>';
    } else {
      html +=
        '<button id="mango-inapp-copy" style="flex:1;min-width:140px;border:0;border-radius:10px;' +
        'padding:11px 14px;font-size:14px;font-weight:700;cursor:pointer;' +
        'background:#ffd54a;color:#1f2433">링크 복사하기</button>';
    }
    html +=
      '<button id="mango-inapp-close" style="border:1px solid rgba(255,255,255,.35);' +
      'border-radius:10px;padding:11px 14px;font-size:14px;cursor:pointer;' +
      'background:transparent;color:#fff">닫기</button>' +
      '</div>';

    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    document.body.style.paddingTop =
      (wrap.getBoundingClientRect().height + 8) + 'px';

    var goBtn = document.getElementById('mango-inapp-go');
    if (goBtn) goBtn.addEventListener('click', openExternal);

    var copyBtn = document.getElementById('mango-inapp-copy');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var done = function () { copyBtn.textContent = '복사됨! 브라우저에 붙여넣기'; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(currentUrl).then(done, fallbackCopy);
      } else { fallbackCopy(); }
      function fallbackCopy() {
        var ta = document.createElement('textarea');
        ta.value = currentUrl; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
        document.body.removeChild(ta);
      }
    });

    document.getElementById('mango-inapp-close').addEventListener('click', function () {
      wrap.remove();
      document.body.style.paddingTop = '';
    });
  }

  function showBanner() {
    if (document.body) buildBanner();
    else document.addEventListener('DOMContentLoaded', buildBanner);
  }

  // ── getUserMedia 가드: 권한 실패(특히 인앱) 시 안내 ──────────
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    var orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function (constraints) {
      return orig(constraints).catch(function (err) {
        // 인앱 브라우저거나 권한/장치 오류면 안내 배너 노출
        var name = err && err.name;
        if (isInApp ||
            name === 'NotAllowedError' ||
            name === 'NotFoundError' ||
            name === 'NotReadableError' ||
            name === 'SecurityError') {
          showBanner();
        }
        throw err; // 기존 폴백 로직은 그대로 동작
      });
    };
  }

  // ── 진입 시 자동 처리 ───────────────────────────────────────
  // 화상 전용 페이지(또는 window.MANGO_VIDEO_PAGE=true)에서만 자동 전환.
  // 일반 홈페이지는 단순 열람이 많으므로, 카메라를 켤 때(getUserMedia 실패)만 안내.
  var isVideoPage = /\/video-call/.test(location.pathname) ||
                    window.MANGO_VIDEO_PAGE === true;

  if (isInApp && isVideoPage) {
    if (isAndroid) {
      // 안드로이드 인앱 → 즉시 외부 브라우저로 전환 시도.
      // 전환이 안 되는 기기를 위해 잠시 후 안내 배너도 표시(폴백).
      var redirected = openExternal();
      if (redirected) setTimeout(showBanner, 1500);
      else showBanner();
    } else {
      // iOS 인앱 → 자동 전환 불가, 안내 배너 표시
      showBanner();
    }
  }
})();
