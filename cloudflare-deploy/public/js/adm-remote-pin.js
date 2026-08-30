/* ═══════════════════════════════════════════════════════════════════════════
   🛠 원격 수리·점검 센터 — 6자리 PIN 발급 (2026-08-30, v4 제안서 07)
   ───────────────────────────────────────────────────────────────────────────
   [왜 별도 파일인가] 처음엔 adm-longabsent.js 끝에 붙였는데, 그 파일은 «장기 결석생 카드를
     펼칠 때만» 지연 로드된다(adm-lazy.js). 그러면 학생관리 카드를 열어도 버튼이 죽어 있다 —
     에러도 안 나고 그냥 «눌러도 아무 일이 없는» 상태가 된다. 그래서 defer 로 항상 싣는다.
   ⛔ PIN 을 화면에서 만들지 않는다 — 서버가 만들고 서버가 기억해야 «학생이 허락했다» 를
      나중에 확인할 수 있다. 화면에서 난수를 그리면 그건 그냥 숫자다.
   ⚠️ 판정은 «성공이라고 말했는가» 로 한다(CLAUDE.md 2장 — 404 본문에는 ok 칸이 없다).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var timer = null;
  function en() { return document.documentElement.lang === 'en' || window.adminLang === 'en'; }

  function bind() {
    var btn = document.getElementById('rsc-issue');
    if (!btn || btn.__rscBound) return;
    btn.__rscBound = true;
    btn.addEventListener('click', async function () {
      var L = en();
      var out = document.getElementById('rsc-pin');
      var st = document.getElementById('rsc-status');
      var uid = (document.getElementById('rsc-uid') || {}).value || '';
      btn.disabled = true;
      if (st) st.textContent = L ? 'Creating…' : '만드는 중…';
      if (out) out.textContent = '';
      if (timer) { clearInterval(timer); timer = null; }
      try {
        var r = await fetch('/api/class/remote-support/issue', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_uid: uid.trim() })
        });
        var d = await r.json().catch(function () { return null; });
        if (!r.ok || !d || d.ok !== true || !d.pin) {
          if (st) st.textContent = L ? ('Failed (HTTP ' + r.status + '). Sign in again and retry.')
                                     : ('실패 (HTTP ' + r.status + '). 다시 로그인한 뒤 시도해 주세요.');
          return;
        }
        if (out) out.textContent = String(d.pin).replace(/(\d{3})(\d{3})/, '$1 $2');
        /* ⏳ 남은 시간을 «보여 준다» — 안 보여 주면 만료된 번호를 계속 읽어 주게 된다 */
        var until = Number(d.expires_at) || (Date.now() + 600000);
        timer = setInterval(function () {
          var left = Math.max(0, Math.round((until - Date.now()) / 1000));
          if (!st) return;
          if (left <= 0) {
            clearInterval(timer); timer = null;
            st.textContent = L ? 'Expired — create a new PIN.' : '만료됐습니다 — 새 PIN 을 만드세요.';
            if (out) out.style.opacity = '.35';
            return;
          }
          if (out) out.style.opacity = '1';
          st.textContent = (L ? 'Valid for ' : '남은 시간 ')
            + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0')
            + (L ? ' · read it out to the student' : ' · 학생에게 읽어 주세요');
        }, 1000);
      } catch (e) {
        if (st) st.textContent = L ? 'Network error.' : '네트워크 오류입니다.';
      } finally {
        btn.disabled = false;
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  /* 카드가 나중에 그려지는 경우가 있어 «끝이 있는» 재시도를 둔다.
     ⛔ 상주 setInterval·MutationObserver 금지(CLAUDE.md 2장). */
  [400, 1200, 3000].forEach(function (ms) { setTimeout(bind, ms); });
})();
