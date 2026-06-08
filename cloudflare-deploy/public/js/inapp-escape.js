/**
 * inapp-escape.js - 카카오톡/인앱 브라우저 화상(WebRTC) 대응
 * 문제: 카카오톡 등 인앱 브라우저(WebView)는 안드로이드에서 카메라(getUserMedia)를
 *       막아 화상 화면이 검게 나옴.
 * 해결: 인앱+안드로이드 -> 기본 브라우저(크롬)로 자동 전환, iOS는 안내 배너.
 */
(function () {
  'use strict';

  var ua = (navigator.userAgent || '').toLowerCase();
  var isAndroid = ua.indexOf('android') !== -1;
  var isIOS = /iphone|ipad|ipod/.test(ua) || (ua.indexOf('mac') !== -1 && navigator.maxTouchPoints > 1);

  var inApp = {
    kakao:     ua.indexOf('kakaotalk') !== -1,
    naver:     ua.indexOf('naver') !== -1,
    instagram: ua.indexOf('instagram') !== -1,
    facebook:  ua.indexOf('fban') !== -1 || ua.indexOf('fbav') !== -1 || ua.indexOf('fb_iab') !== -1,
    line:      ua.indexOf('line/') !== -1,
    daum:      ua.indexOf('daumapps') !== -1,
    band:      ua.indexOf('band/') !== -1
  };
  var isInApp = inApp.kakao || inApp.naver || inApp.instagram ||
                inApp.facebook || inApp.line || inApp.daum || inApp.band;

  var currentUrl = location.href;

  function openExternal() {
    if (isAndroid) {
      if (inApp.kakao) {
        location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(currentUrl);
        return true;
      }
      var noScheme = currentUrl.replace(/^https?:\/\//, '');
      location.href = 'intent://' + noScheme +
        '#Intent;scheme=https;package=com.android.chrome;' +
        'S.browser_fallback_url=' + encodeURIComponent(currentUrl) + ';end';
      return true;
    }
    return false;
  }
  window.MangoEscape = { openExternal: openExternal, isInApp: isInApp, inApp: inApp };

  function buildBanner() {
    if (document.getElementById('mango-inapp-banner')) return;
    if (!document.body) return;

    var wrap = document.createElement('div');
    wrap.id = 'mango-inapp-banner';
    wrap.setAttribute('role', 'alertdialog');
    wrap.style.cssText =
      'position:fixed;left:0;right:0;top:0;z-index:2147483647;' +
      'background:linear-gradient(135deg,#1f2433,#2b3146);color:#fff;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
      'box-shadow:0 4px 18px rgba(0,0,0,.35);padding:14px 16px;' +
      'display:flex;flex-direction:column;gap:10px;';

    var title = isIOS ? '카메라가 안 보이나요?' : '화상 화면을 위해 브라우저로 이동합니다';
    var guide = isIOS
      ? '카카오톡 화면 오른쪽 아래(또는 위쪽) 메뉴에서 "다른 브라우저로 열기 / Safari로 열기"를 눌러 주세요. 그래야 카메라와 마이크가 정상 작동합니다.'
      : '카카오톡 안에서는 카메라가 차단됩니다. 아래 버튼을 누르면 크롬(기본 브라우저)에서 화상 화면이 열립니다.';

    var btnStyle = 'flex:1;min-width:140px;border:0;border-radius:10px;padding:12px 14px;font-size:15px;font-weight:700;cursor:pointer;background:#ffd54a;color:#1f2433';
    var actionBtn = isIOS
      ? '<button id="mango-inapp-copy" style="' + btnStyle + '">링크 복사하기</button>'
      : '<button id="mango-inapp-go" style="' + btnStyle + '">브라우저에서 열기</button>';

    wrap.innerHTML =
      '<div style="font-size:15px;font-weight:700;line-height:1.4">' + title + '</div>' +
      '<div style="font-size:13px;line-height:1.55;opacity:.92">' + guide + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' + actionBtn +
      '<button id="mango-inapp-close" style="border:1px solid rgba(255,255,255,.35);border-radius:10px;padding:12px 14px;font-size:14px;cursor:pointer;background:transparent;color:#fff">닫기</button>' +
      '</div>';

    document.body.appendChild(wrap);
    document.body.style.paddingTop = (wrap.getBoundingClientRect().height + 8) + 'px';

    var goBtn = document.getElementById('mango-inapp-go');
    if (goBtn) goBtn.addEventListener('click', openExternal);

    var copyBtn = document.getElementById('mango-inapp-copy');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var done = function () { copyBtn.textContent = '복사됨! 브라우저에 붙여넣기'; };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(currentUrl).then(done, function () {});
          done();
        } else {
          var ta = document.createElement('textarea');
          ta.value = currentUrl;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          done();
        }
      } catch (e) {}
    });

    var closeBtn = document.getElementById('mango-inapp-close');
    if (closeBtn) closeBtn.addEventListener('click', function () {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      document.body.style.paddingTop = '';
    });
  }

  function showBanner() {
    if (document.body) buildBanner();
    else document.addEventListener('DOMContentLoaded', buildBanner);
  }

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    var orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function (constraints) {
      return orig(constraints).catch(function (err) {
        var name = err && err.name;
        var permErr = name === 'NotAllowedError' || name === 'NotFoundError' ||
                      name === 'NotReadableError' || name === 'SecurityError';
        if (isInApp && isAndroid) {
          showBanner();
          openExternal();
        } else if (isInApp || permErr) {
          showBanner();
        }
        throw err;
      });
    };
  }

  var isVideoPage = location.pathname.indexOf('/video-call') !== -1 ||
                    window.MANGO_VIDEO_PAGE === true;

  if (isInApp && isVideoPage) {
    var autoEscape = function () {
      buildBanner();
      if (isAndroid) setTimeout(openExternal, 600);
    };
    if (document.body) autoEscape();
    else document.addEventListener('DOMContentLoaded', autoEscape);
  }
})();
