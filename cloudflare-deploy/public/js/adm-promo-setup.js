// ═══════════════════════════════════════════════════════════════
// adm-promo-setup.js — 「🎬 홍보영상 팝업 한 번에 만들기」 (2026-08-25)
//   팝업 관리 카드(card-popups-mgmt) 안의 작은 상자 하나를 담당한다.
//
//   왜 만들었나
//     홍보영상을 홈에 띄우려면 ① 영상 업로드 ② 포스터 준비 ③ 팝업 등록(제목·이미지·
//     링크·위치·기간) 세 가지를 손으로 해야 했다. 그 셋을 «파일 고르기 → 버튼 한 번» 으로 줄인다.
//
//   설계에서 일부러 이렇게 한 것
//     · 팝업의 video_url 은 «비워 둔다». 거기에 영상을 넣으면 홈 팝업이 <video preload="metadata">
//       를 그려서, 영상을 볼 생각이 없는 학생에게도 앞부분이 내려간다(첫 화면 무게).
//       대신 포스터 그림만 보여 주고 링크로 /promo.html 을 연다 = 누른 사람만 영상을 받는다.
//     · 만들어지는 팝업은 «꺼진 상태»(enabled=false)다. 실서비스 홈에 곧바로 뜨면
//       확인 없이 학생 29,000명에게 노출된다. 목록에서 미리보기 후 사람이 켠다.
//     · 서버 API 는 새로 만들지 않았다. 기존 /api/admin/popups(+/upload-media)만 쓴다
//       — 새 경로는 src/index.ts(공동 금지구역) 세 곳 등록이 필요하다.
// ═══════════════════════════════════════════════════════════════
(function () {
  if (window.__promoSetupInit) return; window.__promoSetupInit = true;

  var POSTER = '/img/promo/mangoi-promo-poster.png';
  var PAGE = '/promo.html';
  var MAX = 30 * 1024 * 1024;           // 서버(api-admin.ts)와 같은 한도

  function $(id) { return document.getElementById(id); }
  function say(msg, kind) {
    var el = $('promo-setup-status'); if (!el) return;
    // 뜻이 «색» 에만 걸리지 않게 기호를 앞에 둔다 — 관리자 화면은 카드 안 글자를
    // #101828 !important 로 덮는 전역 규칙이 있어서, 평범한 인라인 color 는 진다(실측 확인).
    el.textContent = (kind === 'bad' ? '⚠️ ' : kind === 'good' ? '✅ ' : '') + msg;
    var c = kind === 'bad' ? '#b91c1c' : (kind === 'good' ? '#047857' : '#4b5563');
    try { el.style.setProperty('color', c, 'important'); } catch (e) { el.style.color = c; }
  }
  function videoUrl() { return (($('promo-setup-url') || {}).value || '').trim(); }

  function boot() {
    var pick = $('promo-setup-file');
    var make = $('promo-setup-make');
    var open = $('promo-setup-open');
    if (!pick || !make) return;              // 카드가 없는 화면(권한별 숨김)에서는 조용히 끝낸다

    pick.addEventListener('change', function () {
      var f = pick.files && pick.files[0];
      if (!f) return;
      if (f.size > MAX) {
        say('파일이 너무 큽니다 (' + (f.size / 1048576).toFixed(1) + 'MB). 30MB 이하로 줄여 주세요.', 'bad');
        pick.value = ''; return;
      }
      upload(f);
    });

    make.addEventListener('click', function () { createPopup(); });

    if (open) open.addEventListener('click', function () {
      var u = videoUrl();
      var url = PAGE + (u ? '?src=' + encodeURIComponent(u) : '');
      // ⚠️ 카톡·문자앱 인앱 브라우저는 새 창을 못 연다. 예외를 던지지 않고 null 만 돌려주므로
      //    try/catch 로는 못 잡는다(CLAUDE.md 2장). 반환값이 비면 같은 창에서 연다.
      /* 🔴 (2026-09-02) 'noopener' 를 «기능 문자열» 로 주면 표준상 **탭은 열리는데 반환값이 null** 이다.
         그래서 반환값으로 «막혔나» 를 판정하면 **언제나 «막혔다»** 가 된다 — 실측(크로미움):
           window.open(u,'_blank','noopener') → null · 탭 1→2 (열림)
           window.open(u,'_blank')            → object · 탭 2→3 (열림)
         → 반환값이 필요하면 기능 문자열에서 빼고 **w.opener = null** 로 같은 보호를 건다.
         ⚠️ 반환값을 안 쓰는 자리는 'noopener' 를 그대로 둬도 무해하다. */
      var w = null;
      try { w = window.open(url, '_blank'); } catch (e) { w = null; }
      if (w) { try { w.opener = null; } catch (e) {} } else location.href = url;
    });
  }

  async function upload(f) {
    say('올리는 중입니다… (' + (f.size / 1048576).toFixed(1) + 'MB)');
    try {
      var form = new FormData(); form.append('file', f);
      var r = await fetch('/api/admin/popups/upload-media', { method: 'POST', credentials: 'include', body: form });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok || !d.ok || !d.url) throw new Error(d.error || ('HTTP ' + r.status));
      $('promo-setup-url').value = d.url;
      say('업로드 완료. 「미리보기」로 확인한 뒤 「팝업 만들기」를 누르세요.', 'good');
    } catch (e) {
      say('업로드에 실패했습니다: ' + (e && e.message || e), 'bad');
    }
  }

  async function createPopup() {
    var u = videoUrl();
    if (!u) { say('먼저 영상 파일을 올리거나 영상 주소를 넣어 주세요.', 'bad'); return; }
    if (u.charAt(0) !== '/' || u.charAt(1) === '/') {
      // promo.html 이 같은 출처 주소만 재생한다 — 여기서 미리 막아 «만들었는데 안 나오는» 상태를 없앤다.
      say('같은 사이트 주소(/ 로 시작)만 넣을 수 있습니다.', 'bad'); return;
    }
    // 멱등성이 없다 — 두 번 누르면 팝업이 두 벌 생긴다. 이미 있으면 사람에게 묻는다.
    try {
      var lr = await fetch('/api/admin/popups', { credentials: 'include' });
      var ld = await lr.json().catch(function () { return {}; });
      var dup = ((ld && ld.rows) || []).filter(function (p) {
        return String(p.link_url || '').indexOf(PAGE) === 0;
      });
      if (dup.length && !confirm('홍보영상 팝업이 이미 ' + dup.length + '개 있습니다. 하나 더 만들까요?\n\n(아니오를 누르면 만들지 않습니다. 기존 팝업은 아래 목록에서 고칠 수 있습니다.)')) {
        say('만들지 않았습니다. 아래 목록에서 기존 팝업을 고쳐 쓰세요.');
        return;
      }
    } catch (e) { /* 목록을 못 읽어도 만들기는 계속한다 */ }

    say('팝업을 만드는 중입니다…');
    try {
      var body = {
        title: '망고아이 소개영상',
        content_type: 'mixed',
        image_url: POSTER,
        video_url: null,                       // ⛔ 비워 둔다 — 위 머리말 참고
        link_url: PAGE + '?src=' + encodeURIComponent(u),
        link_text: '▶ 영상 보기 (1:35)',
        width: 420, height: 420, width_mobile: 320, height_mobile: 380,
        position: 'center', priority: 10,
        dismiss_options: 'today,7days',
        enabled: false
      };
      var r = await fetch('/api/admin/popups', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok || !d.ok) throw new Error(d.error || ('HTTP ' + r.status));
      say('만들었습니다 (아직 꺼져 있습니다). 아래 목록에서 「미리보기」로 확인한 뒤 「켜기」를 누르세요.', 'good');
      if (typeof window.popLoadList === 'function') window.popLoadList();
    } catch (e) {
      say('팝업을 만들지 못했습니다: ' + (e && e.message || e), 'bad');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
