/* 더빙에서 실제 말한 대사를 AI 친구의 새 대화로 넘긴다.
 * 영상·점수·학생 이름은 넘기지 않는다. 공개 대본만 같은 탭에 20분/한 번 보관한다.
 * 로그인 표식은 브라우저 사이의 혼선을 막는 용도이며 서버 인증을 대신하지 않는다.
 * 원문을 자르거나 대신 보내지 않는다: 학생이 시작 문장을 확인하고 기존 전송 버튼을 누른다.
 */
(function (w) {
  'use strict';
  var KEY = 'mangoi_dub_practice_v1', GUEST_KEY = 'mangoi_dub_practice_guest_v1';
  var TTL = 20 * 60 * 1000, LIMIT = 500;
  var DEST = '/ai-friend.html?practice=dubbing';
  var END = '\nUse these expressions in a new everyday role-play. Give me one short situation and ask one easy question at a time.';

  function text(v, max) {
    return typeof v === 'string' && v.length <= max ? v.trim() : '';
  }
  function pair(v) {
    return { ko: text(v && v.ko, 160), en: text(v && v.en, 160) };
  }
  function readUser(key) {
    try { return JSON.parse(w.localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  }
  function owner(createGuest) {
    var u = readUser('mangoi_logged_user'), id = u && (u.uid || u.user_id || u.id);
    if (!id) { u = readUser('mango_user'); id = u && (u.uid || u.user_id || u.id); }
    if (id) return 'student:' + String(id);
    u = readUser('mangoi_admin_session'); id = u && (u.uid || u.username);
    if (id) return 'staff:' + String(id);
    try {
      id = w.sessionStorage.getItem(GUEST_KEY);
      if (!id && createGuest) {
        id = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
        w.sessionStorage.setItem(GUEST_KEY, id);
      }
      return id ? 'guest:' + id : '';
    } catch (_) { return ''; }
  }

  // Keep whole sentences. If three do not fit the existing chat API's 500-character
  // limit, carry fewer lines; never make a clipped sentence look like the script.
  function normalize(raw) {
    if (!raw || !/^[a-z0-9-]{1,40}$/.test(raw.episodeId || '') || !Array.isArray(raw.lines)) return null;
    var out = { episodeId: raw.episodeId, title: pair(raw.title), sceneTitle: pair(raw.sceneTitle), lines: [] };
    var title = out.title.en || out.title.ko;
    var prefix = title ? 'I practiced these lines while dubbing "' + title + '":\n' : 'I practiced these lines while dubbing:\n';
    var used = Object.create(null);
    raw.lines.slice(0, 40).forEach(function (line) {
      if (out.lines.length >= 3) return;
      var en = text(line && line.en, 300);
      if (!en || used[en]) return;
      var candidate = out.lines.map(function (l) { return l.en; }).concat(en);
      if ((prefix + candidate.join('\n') + END).length > LIMIT) return;
      used[en] = true;
      out.lines.push({ en: en, ko: text(line.ko, 300), speaker: text(line.speaker, 40) });
    });
    if (!out.lines.length) return null;
    out.starter = prefix + out.lines.map(function (line) { return line.en; }).join('\n') + END;
    return out;
  }
  function stage(raw) {
    var data = normalize(raw);
    if (!data) return { ok: false, reason: 'no_lines' };
    try {
      var who = owner(true);
      if (!who) throw new Error('identity_unavailable');
      w.sessionStorage.setItem(KEY, JSON.stringify({ version: 1, at: Date.now(), owner: who, data: data }));
      return { ok: true, href: DEST };
    } catch (_) { return { ok: false, reason: 'storage_unavailable' }; }
  }
  function open(raw) {
    var result = stage(raw);
    if (result.ok) w.location.href = result.href;
    return result;
  }
  function take() {
    try {
      var raw = w.sessionStorage.getItem(KEY);
      w.sessionStorage.removeItem(KEY);             // One use, including malformed/expired entries.
      if (!raw || raw.length > 8192) return null;
      var entry = JSON.parse(raw), age = Date.now() - entry.at;
      if (entry.version !== 1 || !Number.isFinite(entry.at) || age < 0 || age > TTL || entry.owner !== owner(false)) return null;
      var data = normalize(entry.data);
      if (!data) return null;
      return { owner: entry.owner, data: data };
    } catch (_) { return null; }
  }

  function mountFriend(opts) {
    if (!opts || !opts.host || !opts.input || typeof opts.prepare !== 'function') return false;
    if (new URLSearchParams(w.location.search).get('practice') !== 'dubbing') return false;
    var entry = take();
    if (!entry) return false;
    var data = entry.data, doc = w.document, card = doc.createElement('section');
    var prepared = false, message = '';
    card.id = 'dub-practice-card';
    card.setAttribute('aria-labelledby', 'dub-practice-heading');
    card.style.cssText = 'margin:12px auto;padding:16px;width:100%;max-width:720px;border:1px solid #60a5fa;border-radius:16px;background:var(--card,#14213b);color:var(--text,#e6ecff);text-align:left;overflow-wrap:anywhere';
    var heading = doc.createElement('h3');
    heading.id = 'dub-practice-heading';
    heading.style.cssText = 'font-size:17px;margin:0 0 6px;line-height:1.4';
    var title = doc.createElement('p');
    title.style.cssText = 'font-size:13px;color:var(--text2,#a3b3d1);margin:0 0 10px';
    var list = doc.createElement('ol');
    list.style.cssText = 'padding-left:22px;margin:8px 0 12px;font-size:15px;line-height:1.5';
    var glosses = [];
    data.lines.forEach(function (line) {
      var li = doc.createElement('li');
      li.style.margin = '6px 0';
      var en = doc.createElement('span');
      en.textContent = line.en; li.appendChild(en);
      if (line.ko) {
        var ko = doc.createElement('small');
        ko.textContent = line.ko; ko.style.cssText = 'display:block;color:var(--text2,#a3b3d1);font-size:13px';
        li.appendChild(ko); glosses.push(ko);
      }
      list.appendChild(li);
    });
    var note = doc.createElement('p');
    note.style.cssText = 'font-size:13px;line-height:1.5;margin:8px 0';
    note.setAttribute('role', 'status');
    var actions = doc.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    var start = doc.createElement('button'), dismiss = doc.createElement('button');
    start.type = dismiss.type = 'button';
    start.style.cssText = 'min-height:44px;padding:10px 14px;border:0;border-radius:10px;background:#fbbf24;color:#172033;font:inherit;font-weight:700;cursor:pointer';
    dismiss.style.cssText = 'min-height:44px;padding:10px 14px;border:1px solid #64748b;border-radius:10px;background:transparent;color:inherit;font:inherit;cursor:pointer';
    function isEn() { return !!(w.getLang && w.getLang() === 'en'); }
    function paint() {
      var en = isEn();
      heading.textContent = en ? 'Use your dubbing lines in a new conversation' : '더빙 표현으로 새 대화를 해 봐요';
      title.textContent = (en ? data.title.en || data.title.ko : data.title.ko || data.title.en)
        + ((data.sceneTitle.ko || data.sceneTitle.en) ? ' · ' + (en ? data.sceneTitle.en || data.sceneTitle.ko : data.sceneTitle.ko || data.sceneTitle.en) : '');
      glosses.forEach(function (ko) { ko.hidden = en; ko.style.display = en ? 'none' : 'block'; });
      start.textContent = en ? 'Prepare a conversation with these lines' : '이 표현으로 대화 시작';
      dismiss.textContent = en ? 'Not now' : '나중에 할게요';
      note.textContent = message === 'draft'
        ? (en ? 'Send or clear your current message first. Your draft has been kept.' : '입력 중인 메시지를 먼저 보내거나 지워 주세요. 쓰던 내용은 그대로 두었어요.')
        : prepared
          ? (en ? 'Check the message in the input box, then press Send. You can edit it first.' : '입력창의 문장을 확인하고 전송을 눌러 주세요. 내용을 고쳐도 좋아요.')
          : (en ? 'Prepare a short role-play using these lines. Nothing is sent until you press Send.' : '새 일상 상황에서 이 표현을 써 볼까요? 시작 문장을 확인한 뒤 직접 전송해요.');
    }
    function close() {
      card.remove();
      w.removeEventListener('mangoi:lang-changed', paint);
      w.removeEventListener('storage', changedOwner);
      opts.input.removeEventListener('mangoi:turn-sent', close);
    }
    function changedOwner() {
      if (owner(false) === entry.owner) return;
      if (prepared && opts.input.value === data.starter) opts.input.value = '';
      close();
    }
    start.addEventListener('click', function () {
      if (owner(false) !== entry.owner) { changedOwner(); return; }
      if (opts.input.value && opts.input.value.trim()) { message = 'draft'; paint(); return; }
      opts.prepare(data.starter);                 // The existing chat input path; no request or auto-send.
      prepared = true; message = ''; paint();
    });
    dismiss.addEventListener('click', close);
    actions.appendChild(start); actions.appendChild(dismiss);
    [heading, title, list, note, actions].forEach(function (el) { card.appendChild(el); });
    opts.host.appendChild(card); paint();
    opts.host.scrollTop = opts.host.scrollHeight;
    w.addEventListener('mangoi:lang-changed', paint);
    w.addEventListener('storage', changedOwner);
    opts.input.addEventListener('mangoi:turn-sent', close);
    return true;
  }
  w.MangoiDubPractice = { open: open, stage: stage, take: take, mountFriend: mountFriend };
})(window);
