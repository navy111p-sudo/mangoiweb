/* Start, resume and private work gallery. Playback/recording stays in the
 * existing player; this module never starts a microphone on page load. */
(function () {
  'use strict';
  var L = window.MangoiDubLibrary, adapter, view = 'movies', generation = 0, urls = [];
  if (!L) return;
  var $ = function (id) { return document.getElementById(id); };
  function en() { try { return window.getLang && window.getLang() === 'en'; } catch (_) { return false; } }
  function t(ko, english) { return en() ? english : ko; }
  function node(tag, cls, text) { var el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; }
  function pair(value) { return value && typeof value === 'object' ? (en() ? value.en || value.ko : value.ko || value.en) : String(value || ''); }
  function status(text) { if ($('dub-library-status')) $('dub-library-status').textContent = text; }
  function message(error) { return L.errorText(error, !!en()); }
  function releaseUrls() { urls.splice(0).forEach(function (url) { URL.revokeObjectURL(url); }); }
  function clearItems() { releaseUrls(); if ($('dub-library-items')) $('dub-library-items').replaceChildren(); }
  function owned(owner) { return owner === L.identity(); }
  function button(text, action, cls) { var b = node('button', 'btn ' + (cls || ''), text); b.type = 'button'; b.addEventListener('click', action); return b; }
  function date(value) { var d = new Date(value); return isNaN(d.getTime()) ? '' : d.toLocaleString(en() ? 'en-US' : 'ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

  function render() {
    var b = $('dub-quick-start'), note = $('dub-quick-detail'), ep = adapter && adapter.episode();
    if (!b) return;
    b.disabled = !ep || adapter.busy();
    if (note && ep) {
      var i = shortScene(ep), sc = ep.scenes[i];
      note.textContent = sc ? t('지금 작품의 EP ' + sc.no + ' · 전체 대사 ' + sc.lines.length + '줄', 'This film, EP ' + sc.no + ' · ' + sc.lines.length + ' script lines')
        + (sc.durationSec ? ' · ' + Math.round(sc.durationSec) + t('초 영상', ' sec video') : '') : t('작품을 준비하고 있어요', 'Loading the film');
    }
  }
  function shortScene(ep) {
    var choices = ep.scenes.map(function (sc, i) { return { sc: sc, i: i }; }).filter(function (x) { return x.sc.video && x.sc.lines.length; });
    choices.sort(function (a, b) {
      var da = a.sc.durationSec || 0, db = b.sc.durationSec || 0;
      return da && db ? da - db || a.i - b.i : a.sc.lines.length - b.sc.lines.length || a.i - b.i;
    });
    return choices.length ? choices[0].i : -1;
  }
  function openLibrary(nextView) {
    if (adapter && adapter.busy()) return;
    view = nextView === 'drafts' ? 'drafts' : 'movies';
    var panel = $('dub-library'); if (!panel) return;
    panel.hidden = false;
    Array.prototype.forEach.call(panel.querySelectorAll('[data-library-view]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-library-view') === view)); });
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return refresh();
  }
  async function refresh() {
    var owner = L.identity(), ticket = ++generation, kind = view;
    clearItems(); status(t('내 보관함을 불러오는 중…', 'Loading your library…'));
    var remote = kind === 'movies' ? L.listMovies() : L.listDrafts();
    var local = kind === 'movies' ? L.listLocalMovies() : L.listLocalDrafts();
    var results = await Promise.allSettled([remote, local]);
    if (ticket !== generation || !owned(owner)) return;
    var response = results[0].status === 'fulfilled' ? results[0].value : null;
    if (response && !Array.isArray(response[kind])) response = null;
    var locals = results[1].status === 'fulfilled' ? results[1].value : [];
    var items = response ? response[kind].slice() : [], byId = Object.create(null);
    items.forEach(function (item) { byId[item.id] = item; });
    locals.forEach(function (item) {
      if (kind === 'movies') {
        if (!byId[item.id]) items.push(Object.assign({}, item.meta, { id: item.id, local: true, blob: item.blob, createdAt: item.createdAt }));
      } else {
        var saved = byId[item.id];
        if (!saved || Number(item.updatedAt) > new Date(saved.updatedAt).getTime()) {
          if (saved) items.splice(items.indexOf(saved), 1);
          items.push(Object.assign({}, item.draft, { id: item.id, local: true, remote: !!saved, updatedAt: item.updatedAt }));
        }
      }
    });
    items.sort(function (a, b) { return new Date(b.createdAt || b.updatedAt).getTime() - new Date(a.createdAt || a.updatedAt).getTime(); });
    var box = $('dub-library-items');
    if (!box) return;
    items.forEach(function (item) { box.append(kind === 'movies' ? movieCard(item, owner) : draftCard(item, owner)); });
    if (!response) status(message(results[0].reason) + (items.length ? t(' 이 기기에 남은 항목을 보여드려요.', ' Showing items saved on this device.') : ''));
    else if (!items.length) status(kind === 'movies' ? t('아직 보관한 작품이 없어요. 한 장면을 더빙하면 이곳에 모여요.', 'No saved movies yet. Dub a scene to start your collection.') : t('이어할 연습이 없어요. 짧은 더빙부터 시작해 보세요.', 'No saved practice yet. Start with a short scene.'));
    else status(kind === 'movies' ? t('내 계정에 보관한 작품은 로그인한 기기에서 다시 볼 수 있어요.', 'Account-saved movies can be reopened on your signed-in devices.') : t('연습을 선택하면 저장한 역할과 진행 위치를 불러와요.', 'Choose a practice to restore its roles and progress.'));
  }
  function movieCard(movie, owner) {
    var card = node('article', 'dub-library-card');
    card.append(node('span', 'dub-library-badge' + (movie.local ? ' local' : ''), movie.local ? t('이 기기에 보관 · 계정 미저장', 'On this device · not synced') : t('내 계정에 보관됨', 'Saved to your account')));
    card.append(node('h3', '', movie.title));
    card.append(node('p', '', date(movie.createdAt) + ' · ' + (movie.engine === 'studio' ? t('키키와 토토', 'Kiki & Toto') : t('모험 3D 애니', '3D Adventure')) + (movie.interrupted ? t(' · 중간 녹음', ' · Partial recording') : '')));
    var player = node('video'); player.controls = true; player.playsInline = true; player.preload = 'metadata'; player.hidden = true; card.append(player);
    var actions = node('div', 'row'), download = node('a', 'btn', t('파일 내려받기', 'Download'));
    download.hidden = true; download.download = 'mangoi-dubbing.' + (/mp4/.test(movie.mime || movie.blob && movie.blob.type) ? 'mp4' : 'webm');
    var error = node('p', 'dub-save-note'); error.setAttribute('role', 'status');
    var play = button(t('작품 열기', 'Open movie'), async function () {
      play.disabled = true; error.textContent = t('영상을 불러오는 중…', 'Loading the movie…');
      try {
        var blob = movie.blob || await L.getMovie(movie.id);
        if (!owned(owner) || !card.isConnected) return;
        var url = URL.createObjectURL(blob); urls.push(url); player.src = url; player.hidden = false;
        download.href = url; download.hidden = false; play.hidden = true; error.textContent = '';
      } catch (e) { if (owned(owner)) error.textContent = message(e); }
      finally { play.disabled = false; }
    }, 'go');
    actions.append(play, download);
    if (movie.local && L.hasAccount()) actions.append(button(t('계정에 다시 저장', 'Retry account save'), async function (e) {
      if (!owned(owner)) return;
      var b = e.currentTarget; b.disabled = true;
      try { await L.saveMovie(movie.blob, { clientId: movie.id, engine: movie.engine, episodeId: movie.episodeId, title: movie.title, interrupted: !!movie.interrupted, durationMs: movie.durationMs || 0 }); if (owned(owner)) refresh(); }
      catch (err) { if (owned(owner)) error.textContent = message(err); }
      finally { b.disabled = false; }
    }));
    actions.append(button(t('삭제', 'Delete'), async function (e) {
      if (!owned(owner) || !confirm(t('「' + movie.title + '」을 보관함에서 삭제할까요? 필요한 영상은 먼저 내려받아 주세요.', 'Delete "' + movie.title + '" from your library? Download it first if you want to keep a copy.'))) return;
      var b = e.currentTarget; b.disabled = true;
      try { if (movie.local) await L.removeLocalMovie(movie.id); else await L.deleteMovie(movie.id); if (owned(owner)) refresh(); }
      catch (err) { if (owned(owner)) error.textContent = message(err); }
      finally { b.disabled = false; }
    }));
    card.append(actions, error); return card;
  }
  function draftCard(draft, owner) {
    var card = node('article', 'dub-library-card');
    card.append(node('span', 'dub-library-badge' + (draft.local ? ' local' : ''), draft.local ? t('이 기기의 연습', 'Practice on this device') : t('계정에 저장한 연습', 'Saved practice')));
    card.append(node('h3', '', draft.title));
    card.append(node('p', '', date(draft.updatedAt)));
    card.append(node('p', '', draft.engine === 'studio' ? t('녹음한 대사는 유지하고, 남은 대사를 이어서 연습해요.', 'Keep your recorded lines and continue the remaining ones.') : t('저장한 장면부터 새 영상으로 이어 녹음해요. 이전 영상은 별도로 보관돼요.', 'Resume from the saved scene in a new recording. Earlier videos are kept separately.')));
    var actions = node('div', 'row');
    actions.append(button(t('연습 불러오기', 'Resume practice'), function () { if (owned(owner)) resume(draft.id, draft); }, 'go'));
    actions.append(button(t('연습 기록 삭제', 'Delete practice'), async function () {
      if (!owned(owner) || !confirm(t('이 연습 기록과 연결된 대사 녹음을 삭제할까요? 완성 작품은 보관함에 남아요.', 'Delete this practice and its linked line recordings? Finished movies remain in your library.'))) return;
      try {
        if (!draft.local || draft.remote) await L.deleteDraft(draft.id);
        else await L.removeLocalDraft(draft.id);
        if (owned(owner)) refresh();
      }
      catch (e) { if (owned(owner)) status(message(e)); }
    }));
    card.append(actions); return card;
  }
  async function resume(draftId, known) {
    if (!adapter || adapter.busy()) return;
    var owner = L.identity();
    try {
      var draft;
      if (known && known.local && known.state) draft = known;
      else {
        try { draft = (await L.getDraft(draftId)).draft; }
        catch (e) { var local = await L.getLocalDraft(draftId).catch(function () { return null; }); if (!local) throw e; draft = Object.assign({ id: draftId, local: true }, local.draft); }
      }
      if (!owned(owner)) return;
      if (!draft || !/^[a-z0-9-]{1,40}$/.test(draft.episodeId || '')) throw new Error('invalid_draft');
      if (draft.engine === 'studio') { location.href = '/ai-dubbing-studio.html?ep=' + encodeURIComponent(draft.episodeId) + '&resume=' + encodeURIComponent(draft.id); return; }
      if (draft.engine !== 'main') throw new Error('invalid_draft');
      if (!adapter.episode() || adapter.episode().id !== draft.episodeId) { location.href = '/ai-dubbing.html?ep=' + encodeURIComponent(draft.episodeId) + '&resume=' + encodeURIComponent(draft.id); return; }
      if (!adapter.restore(draft.state)) throw new Error('invalid_draft');
      var note = $('dub-resume-note'); if (note) { note.hidden = false; note.textContent = t('저장한 역할과 장면을 불러왔어요. ‘이어 녹음 시작’을 누르면 이 장면부터 새 영상으로 녹음해요. 이전 영상은 내 작품 보관함에 남아요.', 'Your saved roles and scene are ready. Continue recording from this scene into a new video. Earlier videos remain in your library.'); }
      status(t('연습을 불러왔어요. 역할을 확인하고 시작해 주세요.', 'Practice restored. Check your roles, then start.'));
    } catch (e) { if (owned(owner)) { await openLibrary('drafts'); if (owned(owner)) status(t('연습을 불러오지 못했어요. ', 'Could not restore the practice. ') + message(e)); } }
  }
  function checkpoint(payload) {
    var owner = L.identity(), label = $('dub-draft-status');
    if (label) label.textContent = t('진행 위치 저장 중…', 'Saving your progress…');
    return L.saveDraft(payload.id, { engine: 'main', episodeId: payload.episodeId, title: payload.title, state: payload.state }).then(function () {
      if (owned(owner) && label) label.textContent = t('진행 위치가 계정에 저장됐어요.', 'Progress saved to your account.');
    }).catch(function (e) {
      if (owned(owner) && label) label.textContent = (e.localSaved ? t('진행 위치는 이 기기에 저장됐어요. ', 'Progress saved on this device. ') : '') + message(e);
    });
  }
  function saveMovie(movie, blob, episodeId) {
    var owner = movie.owner || L.identity();
    if (!owned(owner)) return Promise.resolve();
    movie.owner = owner; movie.blob = blob; movie.clientId = movie.clientId || L.newId(); movie.saveState = 'saving';
    if (adapter) adapter.moviesChanged();
    return L.saveMovie(blob, { clientId: movie.clientId, engine: 'main', episodeId: episodeId, title: movie.title, interrupted: !!movie.interrupted, durationMs: movie.durationMs || 0 }).then(function (result) {
      if (!owned(owner)) return;
      movie.saveState = 'saved'; movie.id = result.movie.id; movie.saveMessage = t('내 계정에 보관됐어요.', 'Saved to your account.');
    }).catch(function (e) {
      if (!owned(owner)) return;
      movie.saveState = 'error'; movie.saveMessage = (e.localSaved ? t('이 기기에 보관됐어요. ', 'Saved on this device. ') : t('파일을 내려받아 보관해 주세요. ', 'Download the file to keep it. ')) + message(e);
    }).then(function () { if (owned(owner) && adapter) adapter.moviesChanged(); });
  }
  function practice(results) {
    var panel = $('dub-next'), list = $('dub-next-lines');
    if (!panel || !list) return;
    var lines = [], seen = Object.create(null);
    (results || []).forEach(function (r) {
      if (!r.recorded || !r.line || !r.line.en || seen[r.line.en]) return;
      seen[r.line.en] = true; lines.push(r.line);
    });
    panel.hidden = !lines.length || !adapter || adapter.busy();
    list.replaceChildren(); lines.slice(0, 3).forEach(function (line) { list.append(node('li', '', line.en)); });
    var b = $('dub-practice-go'); if (b) b.onclick = function () {
      if (!adapter || adapter.busy() || !window.MangoiDubPractice) return;
      var ep = adapter.episode();
      var result = window.MangoiDubPractice.open({ episodeId: ep.id, title: ep.title, lines: lines });
      if (!result.ok) $('dub-practice-status').textContent = t('대화를 준비하지 못했어요. 대사를 복사해 AI 친구에게 말해 주세요.', 'Could not prepare the chat. Copy a line and try it with your AI friend.');
    };
  }
  function ready() {
    render();
    var q = new URLSearchParams(location.search), draftId = q.get('resume');
    if (draftId && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(draftId)) resume(draftId);
    else if (q.get('library') === 'movies' || q.get('library') === 'drafts') openLibrary(q.get('library'));
  }
  function init(value) {
    adapter = value;
    if ($('dub-quick-start')) $('dub-quick-start').addEventListener('click', function () { if (adapter.episode() && !adapter.busy()) adapter.shortStart(shortScene(adapter.episode())); });
    if ($('dub-quick-resume')) $('dub-quick-resume').addEventListener('click', function () { openLibrary('drafts'); });
    if ($('dub-quick-library')) $('dub-quick-library').addEventListener('click', function () { openLibrary('movies'); });
    if ($('dub-library-refresh')) $('dub-library-refresh').addEventListener('click', refresh);
    if ($('dub-library-close')) $('dub-library-close').addEventListener('click', function () { $('dub-library').hidden = true; ++generation; clearItems(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-library-view]'), function (b) { b.addEventListener('click', function () { openLibrary(b.getAttribute('data-library-view')); }); });
    L.onAccountChange(function () { ++generation; clearItems(); status(t('계정이 바뀌었어요. 내 보관함을 다시 열어 주세요.', 'Your account changed. Reopen your library.')); adapter.accountChanged(); });
    window.addEventListener('mangoi:lang-changed', function () { render(); if ($('dub-library') && !$('dub-library').hidden) refresh(); });
    window.addEventListener('pagehide', releaseUrls);
    render();
  }
  window.MangoiDubHome = { init: init, ready: ready, render: render, checkpoint: checkpoint, saveMovie: saveMovie, practice: practice, openLibrary: openLibrary };
})();
