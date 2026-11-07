// Serialized, acknowledged share/stop intents. Never replay this queue across
// room/account/socket changes, and never rebase annotation/page packets.
(function (root) {
  'use strict';
  class PdfEpochOutbox {
    constructor(options) {
      this.o = options; this.queue = []; this.pending = null;
      this.record = null; this.owner = null;
    }
    same(a, b) { return !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]); }
    reset(explain) {
      const occupied = !!this.pending || this.queue.length > 0;
      if (this.pending) this.o.clearTimeout(this.pending.timer);
      this.pending = null; this.queue = []; this.record = null; this.owner = null;
      this.o.busy(false);
      if (occupied && explain) this.o.notice(explain);
    }
    observe(meta) {
      const scope = this.o.scope();
      if (this.owner && !this.same(this.owner, scope)) this.reset('교재 공유 연결이 바뀌어 대기 요청을 취소했습니다.');
      if (meta?.epochReady === false) { this.reset('교재 공유 상태를 확인하지 못했습니다. 다시 시도해 주세요.'); return false; }
      if (typeof meta?.shareEpoch !== 'string' || !meta.shareEpoch || !Number.isSafeInteger(meta.shareRevision) || meta.shareRevision < 1) return false;
      if (this.record && (meta.shareRevision < this.record.shareRevision
        || (meta.shareRevision === this.record.shareRevision && meta.shareEpoch !== this.record.shareEpoch))) return false;
      this.owner = scope; this.record = { shareEpoch: meta.shareEpoch, shareRevision: meta.shareRevision };
      this.o.record(meta);
      return true;
    }
    submit(frame) {
      const scope = this.o.scope(), record = this.record;
      if (!record || !this.same(this.owner, scope)) {
        this.reset('교재 연결을 확인한 뒤 다시 시도해 주세요.'); return false;
      }
      const data = frame.data || {};
      if ((data.shareEpoch != null && data.shareEpoch !== record.shareEpoch)
        || (data.shareRevision != null && data.shareRevision !== record.shareRevision)
        || data.epochRequestId != null) {
        this.o.notice('이전 교재 요청은 전송하지 않았습니다.'); return false;
      }
      const page = frame.type === 'pdf-page-change';
      const control = page || frame.type === 'pdf-share' || frame.type === 'pdf-stop-share';
      if (page && (this.pending || this.queue.length)) { this.o.notice('공유 확인 후 페이지 이동을 다시 시도해 주세요.'); return false; }
      if (!control) {
        if (this.pending || this.queue.length) { this.o.notice('교재 공유 확인 후 필기와 페이지 이동을 다시 시도해 주세요.'); return false; }
        const sent = this.send(frame, record, scope);
        if (!sent) this.o.notice('필기를 전송하지 못했습니다. 연결을 확인해 주세요.');
        return sent;
      }
      if (this.queue.length >= 16) { this.o.notice('교재 대기 요청이 많습니다. 확인 후 다시 시도해 주세요.'); return false; }
      this.queue.push({ frame: { type: frame.type, data: { ...data } }, owner: scope });
      this.o.busy(true); this.pump(); return true;
    }
    send(frame, record, owner, id) {
      if (!this.same(owner, this.o.scope())) return false;
      const data = { ...frame.data, ...record };
      if (id) data.epochRequestId = id;
      try { return this.o.send({ type: frame.type, data }) === true; } catch (_) { return false; }
    }
    pump() {
      if (this.pending || !this.queue.length) return;
      const item = this.queue.shift();
      if (!this.same(item.owner, this.o.scope()) || !this.record) { this.reset('이전 연결의 교재 요청을 취소했습니다.'); return; }
      let id;
      try { id = this.o.id(); } catch (_) { this.reset('교재 요청을 만들지 못했습니다. 다시 시도해 주세요.'); return; }
      this.pending = { id, owner: item.owner, timer: null };
      this.pending.timer = this.o.setTimeout(() => {
        if (this.pending?.id === id) this.reset('교재 공유 확인이 지연되었습니다. 현재 상태를 확인한 뒤 다시 시도해 주세요.');
      }, 15000);
      if (!this.send(item.frame, this.record, item.owner, id)) this.reset('교재 요청을 보내지 못했습니다. 다시 시도해 주세요.');
    }
    ack(meta) {
      const pending = this.pending;
      if (!pending || meta?.epochRequestId !== pending.id) return false;
      if (!this.same(pending.owner, this.o.scope())) { this.reset('이전 연결의 교재 확인 응답을 무시했습니다.'); return false; }
      const accepted = this.observe(meta);
      if (this.pending !== pending) return false;
      const older = this.record && typeof meta.shareEpoch === 'string' && Number.isSafeInteger(meta.shareRevision)
        && meta.shareRevision < this.record.shareRevision;
      if (meta.epochReady !== true || (!accepted && !older)) {
        this.reset('교재 확인 응답을 해석하지 못했습니다. 현재 상태를 확인해 주세요.'); return false;
      }
      this.o.clearTimeout(pending.timer); this.pending = null;
      if (meta.ok !== true) {
        this.queue = []; this.o.busy(false);
        this.o.notice('교재 요청이 반영되지 않았습니다. 현재 상태를 확인한 뒤 다시 시도해 주세요.');
        return accepted;
      }
      if (!this.queue.length) this.o.busy(false);
      this.pump();
      return accepted;
    }
  }
  root.PdfEpochOutbox = PdfEpochOutbox;
})(window);

(function (root) {
  'use strict';
  let outbox = null, noticeAt = -Infinity, joinedOwner = null;
  const pdfFrame = type => /^pdf-(share|stop-share|page-change|anno-.+|pointer)$/.test(type || '');
  function scope() {
    return [typeof vcRoomId === 'undefined' ? '' : vcRoomId, typeof vcAccountSnapshot === 'function' ? vcAccountSnapshot() : '',
      typeof vcUserId === 'undefined' ? '' : vcUserId, typeof vcConn === 'undefined' ? null : vcConn,
      typeof vcConn === 'undefined' ? null : vcConn?.ws];
  }
  function notice(text) {
    if (Date.now() - noticeAt < 2000) return;
    noticeAt = Date.now();
    try { showToast(text); } catch (_) {}
  }
  function apply() {
    const state = root.__vcPdfEpochState;
    if (state?.url) {
      root.vcApplySharedPdf?.(state.url, state.kind, state.currentPage, state.pdfId, state.name, false,
        state.annotationSession, state.shareEpoch, state.shareRevision);
    } else if (state === null) {
      if (typeof pdfClearRemote === 'function') pdfClearRemote();
      root.__vcPdfShared = false; root._vcCurrentPdfUrl = ''; root._vcShownPdfKey = ''; root._vcShownPdfUrl = '';
      try { root.vcWaitCardSync?.(); root.__vcPheroReeval?.(); } catch (_) {}
    }
  }
  function box() {
    if (outbox) return outbox;
    outbox = new root.PdfEpochOutbox({
      scope, notice, busy: value => { root.__vcPdfEpochControlPending = value; },
      setTimeout, clearTimeout, id: () => crypto.randomUUID(),
      send(frame) {
        const current = scope(), conn = current[3], socket = current[4];
        if (!conn || !socket || socket.readyState !== 1) return false;
        socket.send(JSON.stringify(frame)); return true;
      },
      record(meta) {
        if (typeof vcAcceptPdfShareEpoch !== 'function' || !vcAcceptPdfShareEpoch(meta.shareEpoch, meta.shareRevision)) return;
        root.__vcPdfEpochUnavailable = false;
        if (Object.prototype.hasOwnProperty.call(meta, 'pdfState')) root.__vcPdfEpochState = meta.pdfState;
        else if (root.__vcPdfEpochState?.shareEpoch !== meta.shareEpoch) root.__vcPdfEpochState = undefined;
      }
    });
    return outbox;
  }
  function observe(meta) {
    if (meta?.epochReady === false) {
      root.__vcPdfEpochUnavailable = true; outbox?.reset('교재 공유 상태 확인 후 다시 시도해 주세요.');
      notice('교재 공유 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return false;
    }
    return box().observe(meta);
  }
  root.vcPdfEpochSend = function (frame, connection) {
    if (!pdfFrame(frame?.type)) return undefined;
    if (!root.__vcPdfShareEpoch && !root.__vcPdfEpochUnavailable) return undefined;
    const current = scope();
    const joined = joinedOwner && joinedOwner.every((value, i) => value === [current[0], current[1], current[3], current[4]][i]);
    if (!joined || root.__vcPdfEpochUnavailable || connection !== scope()[3] || !connection?.ws || connection.ws.readyState !== 1) {
      outbox?.reset('이전 연결의 교재 요청을 취소했습니다.'); notice('교재 연결 확인 후 다시 시도해 주세요.'); return false;
    }
    const b = box();
    if (!b.record) {
      b.observe({ epochReady: true, shareEpoch: root.__vcPdfShareEpoch, shareRevision: root.__vcPdfShareRevision });
    }
    if (/^pdf-(anno-|pointer)/.test(frame.type) && (!root.__vcPdfEpochState || root.__vcPdfEpochState.shareEpoch !== root.__vcPdfShareEpoch)) {
      notice('열린 공유 교재를 확인한 뒤 필기를 다시 시도해 주세요.'); return false;
    }
    return b.submit(frame);
  };
  root.vcPdfEpochSnapshot = function (snapshot) {
    if (typeof snapshot?.epochReady !== 'boolean') return !root.__vcPdfShareEpoch && !root.__vcPdfEpochUnavailable;
    if (!observe(snapshot)) return false;
    if (snapshot.pdfState === null) apply();
    return true;
  };
  root.vcPdfEpochReceive = function (msg) {
    const data = msg.data || {};
    if (msg.type === 'room-joined') {
      outbox?.reset('교재 연결이 갱신되어 이전 대기 요청을 취소했습니다.'); outbox = null; joinedOwner = null;
      root.__vcPdfShareEpoch = undefined; root.__vcPdfShareRevision = undefined;
      root.__vcPdfEpochUnavailable = data.epochReady === false;
      root.__vcPdfEpochState = undefined;
      if (typeof data.epochReady === 'boolean') {
        if (data.shareEpoch && typeof vcAcceptPdfShareEpoch === 'function') vcAcceptPdfShareEpoch(data.shareEpoch, data.shareRevision);
        const before = scope();
        queueMicrotask(() => {
          const after = scope();
          if (before[0] === after[0] && before[1] === after[1] && before[3] === after[3] && before[4] === after[4]) {
            joinedOwner = [after[0], after[1], after[3], after[4]];
            if (observe(data)) apply();
          }
        });
      }
      return false;
    }
    if (msg.type === 'pdf-share-epoch') {
      if (data.roomId && data.roomId !== scope()[0]) return true;
      if (outbox?.pending?.id === data.epochRequestId && outbox.same(outbox.pending.owner, scope()) && data.epochReady === false)
        root.__vcPdfEpochUnavailable = true;
      if (outbox?.ack(data)) apply();
      return true;
    }
    if (msg.type === 'existing-users') return false;
    if (msg.type === 'pdf-sync' || msg.type === 'pdf-share') {
      if (!data.shareEpoch) return !!root.__vcPdfShareEpoch || !!root.__vcPdfEpochUnavailable;
      return !observe({ ...data, pdfState: data });
    }
    if (msg.type === 'pdf-stop-share') {
      if (!data.shareEpoch) return !!root.__vcPdfShareEpoch || !!root.__vcPdfEpochUnavailable;
      return !observe({ ...data, pdfState: null });
    }
    if (msg.type === 'pdf-page-change') {
      if (!data.shareEpoch) return !!root.__vcPdfShareEpoch || !!root.__vcPdfEpochUnavailable;
      const state = { ...root.__vcPdfEpochState, url: data.documentUrl, currentPage: data.currentPage ?? data.pageNum,
        shareEpoch: data.shareEpoch, shareRevision: data.shareRevision };
      if (observe({ ...data, pdfState: state })) apply();
      return true;
    }
    if (msg.type === 'pdf-anno-status' && data.epochReady === false) { observe(data); return false; }
    if (/^pdf-anno-/.test(msg.type) && msg.type !== 'pdf-anno-status' && root.__vcPdfShareEpoch)
      return data.shareEpoch !== root.__vcPdfShareEpoch;
    return false;
  };
  const bootstrap = root.__vcPdfEpochBootstrap, join = root.__vcPdfEpochJoinBootstrap;
  root.__vcPdfEpochBootstrap = null; root.__vcPdfEpochJoinBootstrap = null;
  const current = scope(), owner = [current[0], current[1], current[3], current[4]];
  if (join && join.owner.every((value, i) => value === owner[i])) root.vcPdfEpochReceive(join.msg);
  if (bootstrap && bootstrap !== join?.msg && bootstrap.type !== 'room-joined') root.vcPdfEpochReceive(bootstrap);
})(window);
