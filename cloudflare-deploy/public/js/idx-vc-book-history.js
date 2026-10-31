/* Session book switcher. No storage/upload: notes and book positions stay in this tab.
   Load with defer, after idx-x3 defines the library selection entry point. */
(function () {
  'use strict';
  var books = new Map(), active = null, room = '';
  function resetForRoom() {
    var next = typeof vcRoomId === 'undefined' ? '' : vcRoomId || '';
    if (next !== room) { books.clear(); active = null; room = next; }
  }
  var original = window.selectFromTextbookLibrary;
  if (typeof original !== 'function') return;
  function en() { return typeof miIsEn === 'function' && miIsEn(); }
  function same(a, b) {
    try { return new URL(a, location.origin).href === new URL(b, location.origin).href; }
    catch (_) { return a === b; }
  }
  function rememberPage() {
    if (active && typeof pdfPageNum !== 'undefined') active.page = pdfPageNum;
  }
  function render() {
    var info = document.getElementById('pdf-page-info');
    if (!info) return;
    var select = document.getElementById('vc-book-history');
    if (!select) {
      select = document.createElement('select'); select.id = 'vc-book-history';
      select.style.cssText = 'max-width:220px;min-width:0;padding:4px;border-radius:6px;color:#0f172a;background:#fff';
      info.parentElement.appendChild(select);
      select.addEventListener('change', async function () {
        resetForRoom();
        if (typeof window.vcCanControlTextbook === 'function' && !window.vcCanControlTextbook()) { render(); return; }
        var entry = books.get(select.value);
        if (!entry) { render(); return; }
        rememberPage();
        var page = entry.page;
        window._libSequence = entry.sequence;
        window._libSeqIdx = entry.index;
        select.disabled = true;
        try {
          await window.selectFromTextbookLibrary(entry.id, entry.url, entry.kind, entry.name);
          if (same(window._vcCurrentPdfUrl, entry.url) && typeof pdfGoToPage === 'function') {
            pdfGoToPage(page); _pdfBroadcastPage(); entry.page = page;
          }
        } finally { select.disabled = false; render(); }
      });
    }
    select.setAttribute('aria-label', en() ? 'Books opened in this session' : '이번 수업에서 연 교재');
    select.title = select.getAttribute('aria-label');
    select.replaceChildren();
    books.forEach(function (entry, key) {
      var option = document.createElement('option'); option.value = key;
      option.textContent = entry.label; option.selected = entry === active;
      select.appendChild(option);
    });
    select.hidden = books.size < 2 || (typeof window.vcCanControlTextbook === 'function' && !window.vcCanControlTextbook());
  }
  window.selectFromTextbookLibrary = async function (id, url, kind, name) {
    resetForRoom();
    var selectionRoom = room;
    rememberPage();
    var sequence = window._libSequence || [], index = window._libSeqIdx || 0;
    var result = await original.apply(this, arguments);
    resetForRoom();
    if (room !== selectionRoom) { render(); return result; }
    if (!same(window._vcCurrentPdfUrl, url)) return result;
    var match = String(name || '').match(/^\[([^\]]+)\]/);
    var key = match ? match[1] : String(url);
    active = { id: id, url: url, kind: kind, name: name, label: match ? match[1] : (name || url),
      sequence: sequence, index: index, page: 1 };
    books.set(key, active); render();
    return result;
  };
  // The assigned book at entry is shared without going through the library picker.
  var share = window.vcShareTextbook;
  if (typeof share === 'function') window.vcShareTextbook = function (id, url, kind, name) {
    resetForRoom();
    if (!active && window._vcCurrentPdfUrl) {
      var match = String(name || '').match(/^\[([^\]]+)\]/);
      var key = match ? match[1] : String(url);
      active = { id: String(id || '').replace(/^lib_/, ''), url: window._vcCurrentPdfUrl,
        kind: kind, name: name, label: match ? match[1] : (name || url),
        sequence: window._libSequence || [], index: window._libSeqIdx || 0, page: 1 };
      books.set(key, active); render();
    }
    return share.apply(this, arguments);
  };
})();
