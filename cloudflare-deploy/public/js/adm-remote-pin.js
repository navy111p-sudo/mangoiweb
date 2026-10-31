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
        openRelay(String(d.pin), Number(d.expires_at) || (Date.now() + 600000));
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

  /* ═══════════════════════════════════════════════════════════════════════
     📮 접속 코드 날라다 주기 (2026-09-01 사장님 지시 «직원이 원격으로 들어가서 수리»)
     ───────────────────────────────────────────────────────────────────────
     [무엇] Quick Assist 는 «도우미(직원)가 6자리 보안코드를 만들고 학생이 입력»하는 구조다.
       그 코드를 전화로 불러 주고 받아 적게 하는 자리가 이 흐름에서 제일 자주 깨졌다
       (아이 · 한국어를 못 읽는 필리핀 강사). 여기에 붙여넣으면 학생 화면에 크게 뜬다.
     ⛔ 우리 서버가 학생 화면을 조작하는 것이 아니다 — 코드를 나르기만 한다.
     ⚠️ 학생이 PIN 을 넣기 «전» 에는 보낼 곳이 없다. 그래서 학생이 넣었는지를 먼저 보여 주고,
        넣기 전에는 보내기 버튼을 잠근다(서버도 not_claimed 로 거절한다).
     ⛔ 상주 setInterval 금지 — 폴링은 PIN 이 만료되면 스스로 멈춘다.
     ═══════════════════════════════════════════════════════════════════════ */
  var relayTimer = null;

  function openRelay(pin, until) {
    var box = document.getElementById('rsc-relay');
    if (!box) return;
    var L = en();
    box.style.display = '';
    box.dataset.pin = pin;
    var send = document.getElementById('rsc-send');
    var codeIn = document.getElementById('rsc-code');
    var state = document.getElementById('rsc-relay-state');
    if (codeIn) { codeIn.value = ''; codeIn.disabled = false; }
    if (send) send.disabled = true;   // 학생이 넣기 전에는 잠금
    if (state) state.textContent = L ? 'Waiting for the student to enter the PIN…' : '학생이 번호를 넣기를 기다리는 중…';

    if (relayTimer) { clearInterval(relayTimer); relayTimer = null; }
    var claimed = false;
    relayTimer = setInterval(async function () {
      if (Date.now() > until) { clearInterval(relayTimer); relayTimer = null;
        if (state) state.textContent = L ? 'PIN expired.' : 'PIN 이 만료됐습니다.';
        if (send) send.disabled = true;
        return; }
      try {
        var r = await fetch('/api/class/remote-support/pin-status?pin=' + encodeURIComponent(pin), { credentials: 'include' });
        var d = await r.json().catch(function () { return null; });
        /* 판정은 «성공이라고 말했는가» 로 — 종단 404 본문에는 ok 칸이 없다(CLAUDE.md 2장). */
        if (!r.ok || !d || d.ok !== true) return;
        if (d.claimed && !claimed) {
          claimed = true;
          if (send) send.disabled = false;
          if (state) state.textContent = L ? '✅ Student is ready — paste your code below.'
                                           : '✅ 학생이 번호를 넣었습니다 — 아래에 코드를 붙여넣으세요.';
        }
        if (d.code_sent && state) {
          state.textContent = L ? '📮 Code delivered to the student screen.'
                                : '📮 학생 화면에 코드가 떴습니다.';
        }
        /* ⬅️ 반대 방향 — 휴대폰(AnyDesk 등)은 학생이 번호를 보내온다. 오면 크게 띄운다. */
        if (d.student_code) showStudentCode(String(d.student_code), String(d.student_tool || 'anydesk'));
      } catch (e) { /* 통신이 흔들려도 폴링은 계속 — 다음 회차에 다시 본다 */ }
    }, 3000);
  }

  /* ⬅️ 학생이 보낸 접속 번호(휴대폰 AnyDesk 등)를 직원 화면에 띄운다.
     ⚠️ 같은 번호가 또 와도 다시 그리지 않는다 — 45초마다 다시 그리면 직원이 복사하려는 순간
        글자가 마우스 아래에서 갈아치워진다(2026-08-12 방 목록 사고와 같은 뿌리). */
  function showStudentCode(code, tool) {
    var box = document.getElementById('rsc-student-code');
    if (!box || box.dataset.code === code) return;
    box.dataset.code = code;
    var L = en();
    var TOOL = { anydesk: 'AnyDesk', quickassist: 'Quick Assist', chromeremote: L ? 'Chrome Remote Desktop' : 'Chrome 원격 데스크톱' };
    box.style.display = '';
    box.innerHTML =
      '<div style="font-size:11.5px;color:#1d4ed8;font-weight:800;margin-bottom:5px">'
        + (L ? '📱 Student sent their ID — ' : '📱 학생이 보낸 접속 번호 — ') + (TOOL[tool] || TOOL.anydesk) + '</div>'
      + '<div style="font-family:MangoiHanSC,Consolas,monospace;font-size:26px;font-weight:800;letter-spacing:4px;color:#1e3a8a">'
        + code.replace(/(\d{3})(?=\d)/g, '$1 ') + '</div>'
      + '<div style="font-size:11.5px;color:#475467;margin-top:4px">'
        + (L ? 'Connect to this number from your tool.' : '이 번호로 접속하세요.') + '</div>';
  }

  function bindRelay() {
    var send = document.getElementById('rsc-send');
    if (!send || send.__rscBound) return;
    send.__rscBound = true;
    send.addEventListener('click', async function () {
      var L = en();
      var box = document.getElementById('rsc-relay');
      var codeIn = document.getElementById('rsc-code');
      var state = document.getElementById('rsc-relay-state');
      var toolSel = document.getElementById('rsc-tool');
      var pin = (box && box.dataset.pin) || '';
      var code = ((codeIn && codeIn.value) || '').replace(/\D/g, '');
      if (code.length < 4 || code.length > 12) {
        if (state) state.textContent = L ? 'Enter the code (digits only).' : '코드를 숫자로 넣어 주세요.';
        return;
      }
      send.disabled = true;
      if (state) state.textContent = L ? 'Sending…' : '보내는 중…';
      try {
        var r = await fetch('/api/class/remote-support/helper-code', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: pin, code: code, tool: (toolSel && toolSel.value) || 'quickassist' })
        });
        var d = await r.json().catch(function () { return null; });
        if (r.ok && d && d.ok === true) {
          if (state) state.textContent = L ? '📮 Code delivered to the student screen.'
                                           : '📮 학생 화면에 코드가 떴습니다.';
          return;
        }
        /* 실패 사유를 사실대로 — 다음에 할 일이 서로 다르다 */
        var why = (d && d.error) || 'failed';
        var koWhy = { not_claimed: '학생이 아직 번호를 넣지 않았습니다.', expired: 'PIN 이 만료됐습니다 — 새로 만드세요.',
                      not_found: 'PIN 을 찾지 못했습니다.', bad_code: '코드는 숫자 4~12자리입니다.',
                      admin_session_required: '다시 로그인한 뒤 시도해 주세요.' }[why] || ('보내지 못했습니다 (HTTP ' + r.status + ')');
        var enWhy = { not_claimed: 'The student has not entered the PIN yet.', expired: 'PIN expired — create a new one.',
                      not_found: 'PIN not found.', bad_code: 'Code must be 4-12 digits.',
                      admin_session_required: 'Sign in again and retry.' }[why] || ('Failed (HTTP ' + r.status + ')');
        if (state) state.textContent = L ? enWhy : koWhy;
      } catch (e) {
        if (state) state.textContent = L ? 'Network error.' : '네트워크 오류입니다.';
      } finally {
        send.disabled = false;
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { bind(); bindRelay(); });
  else { bind(); bindRelay(); }
  /* 카드가 나중에 그려지는 경우가 있어 «끝이 있는» 재시도를 둔다.
     ⛔ 상주 setInterval·MutationObserver 금지(CLAUDE.md 2장). */
  [400, 1200, 3000].forEach(function (ms) { setTimeout(function () { bind(); bindRelay(); }, ms); });
})();
