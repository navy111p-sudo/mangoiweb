// Execute the studio's real persistence/retake code with private, synthetic blobs.
// No microphones, live accounts, remote APIs, or production data are used.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../cloudflare-deploy/public/ai-dubbing-studio.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline, 'The studio inline program exists');
const end = inline.indexOf('/* =========================================================\n   11. EVENTS');
assert.ok(end > 0);
const tick = () => new Promise((resolve) => setImmediate(resolve));
const clip = (text) => new Blob([text], { type: 'audio/webm' });

function world(owner = 'student:alpha', search = '') {
  let account = owner, serial = 0;
  const local = new Map(), disk = new Map(), remote = new Map(), audio = new Map();
  const events = [], browserEvents = new Map(), elements = new Map(), uploads = [], saves = [], removals = [], gets = [], movies = [], conversations = [];
  const timers = new Map();
  const el = (id) => {
    if (!elements.has(id)) elements.set(id, { textContent: '', hidden: false, disabled: false, dataset: {}, style: {},
      classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, addEventListener() {},
      querySelectorAll() { return []; }, querySelector() { return null; }, children: [],
    });
    return elements.get(id);
  };
  const db = { transaction(_, mode) {
    const tx = { objectStore: () => ({
      getAllKeys: () => ({ result: [...disk.keys()] }), getAll: () => ({ result: [...disk.values()] }),
      put(value, key) { disk.set(key, value); }, delete(key) { disk.delete(key); },
    }) };
    queueMicrotask(async () => { if (mode === 'readonly' && lib.dbReadWait) await lib.dbReadWait; tx.oncomplete?.(); });
    return tx;
  } };
  const lib = {
    identity: () => account, hasAccount: () => account !== 'guest', newId: () => `take-${++serial}`,
    onAccountChange(fn) { events.push(fn); }, errorText: (e) => `error:${e.code || e.status || e.message}`,
    async listDrafts() { if (lib.listError) throw lib.listError; return { drafts: [...remote.values()] }; },
    async getDraft(id) { if (lib.draftError) throw lib.draftError; if (!remote.has(id)) throw Object.assign(new Error('not_found'), { status: 404 }); return { draft: structuredClone(remote.get(id)) }; },
    async uploadAudio(id, audioId, blob) { uploads.push({ id, audioId, blob }); audio.set(`${id}/${audioId}`, blob); if (lib.uploadWait) await lib.uploadWait; return { audio: { id: audioId } }; },
    async saveDraft(id, draft) {
      if (lib.saveError) throw lib.saveError;
      saves.push({ id, draft: structuredClone(draft) });
      const saved = { ...structuredClone(draft), id, updatedAt: Date.now() };
      remote.set(id, saved); return { draft: saved };
    },
    async removeAudio(id, audioId) { removals.push(audioId); audio.delete(`${id}/${audioId}`); },
    async getAudio(id, audioId) { gets.push(audioId); if (!audio.has(`${id}/${audioId}`)) throw new Error('missing'); return audio.get(`${id}/${audioId}`); },
    async saveMovie(blob, meta) { movies.push({ blob, meta: { ...meta } }); if (lib.movieError) throw lib.movieError; return { movie: { id: meta.clientId } }; },
  };
  class FakeAudio { constructor(url) { this.src = url; } pause() {} play() { return Promise.resolve(); } }
  const context = {
    console, Blob, URL: { createObjectURL: () => `blob:fixture-${++serial}`, revokeObjectURL() {} }, Audio: FakeAudio,
    location: { search }, document: { getElementById: el, querySelectorAll: () => [], addEventListener() {}, body: el('body'), documentElement: {} },
    localStorage: { getItem: (key) => local.get(key) || null, removeItem: (key) => local.delete(key), setItem(key, value) { if (lib.localError) throw lib.localError; local.set(key, value); } },
    indexedDB: { open() { const req = { result: db }; queueMicrotask(() => req.onsuccess?.()); return req; } },
    setTimeout(fn) { const id = ++serial; timers.set(id, fn); return id; }, clearTimeout: (id) => timers.delete(id),
    clearInterval() {}, cancelAnimationFrame() {}, addEventListener(name, fn) { if (!browserEvents.has(name)) browserEvents.set(name, []); browserEvents.get(name).push(fn); },
    MangoiDubLibrary: lib, MangoiDubPractice: { open(value) { conversations.push(value); return { ok: true }; } },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(inline.slice(0, end) + `
    renderCues = function () {};
    renderRecUI = renderStudioStorage;
    renderAll = function () { renderStudioStorage(); };
    renderTransport = function () {};
    stopAll = function () {};
    stopMusic = function () {};
    window.studioTest = { state, recs, pendingStudioEdits, studioBases, episode, setRec,
      localRecKey, localRecValue, loadRecs, initStudioStorage, checkpointStudio, persistStudio,
      resumeStudio, studioResumeFromQuery, openStudioConversation, saveStudioMovie, deleteRec,
      status: () => studioStatus, retry: () => movieRetry };
  `, context);
  return { api: context.studioTest, lib, disk, local, remote, audio, uploads, saves, removals, gets, movies, conversations,
    async changeOwner(next) { const old = account; account = next; events.forEach((fn) => fn(next, old)); await tick(); },
    deleteNotice(detail, crossTab = false) {
      const event = crossTab ? { key: 'mangoi:dubbing-draft-deleted', newValue: JSON.stringify(detail) } : { detail };
      (browserEvents.get(crossTab ? 'storage' : 'mangoi:dubbing-draft-deleted') || []).forEach((fn) => fn(event));
    },
  };
}

// The gallery's resume link restores local work even when the account session has expired.
{
  const w = world('student:alpha', '?ep=picnic&resume=studio-picnic');
  const key = w.api.localRecKey('picnic:1');
  w.disk.set(key, { blob: clip('local pending'), pending: true, audioId: null });
  w.local.set('dubstudio.checkpoint.v2:student%3Aalpha:picnic', JSON.stringify({
    version: 1, idx: 4, roles: ['kiki'], mode: 'review', speed: 0.85, updatedAt: Date.now(), deletedLines: [],
  }));
  w.lib.draftError = w.lib.listError = Object.assign(new Error('sign_in'), { status: 401 });
  await w.api.initStudioStorage();
  assert.equal(w.api.state.idx, 4);
  assert.equal(w.api.state.mode, 'review');
  assert.equal(await w.api.recs.get('picnic:1').blob.text(), 'local pending');
  assert.equal(w.api.pendingStudioEdits.get('picnic:1').localSaved, true);
  assert.equal(w.api.status().error.status, 401);
  assert.equal(w.api.studioResumeFromQuery('?resume=studio-teddy', 'picnic'), false);
  await w.changeOwner('student:beta');
  assert.equal(w.api.state.idx, 0, 'A URL from a previous account is not reused after an account change');
  assert.equal(w.api.pendingStudioEdits.size, 0);
}

// A blocked browser preferences store does not block the account upload of a new recording.
{
  const w = world(); await w.api.initStudioStorage();
  const ep = w.api.episode(), blob = clip('storage blocked');
  w.api.setRec(`${ep.id}:1`, blob, { pending: true });
  w.api.pendingStudioEdits.set(`${ep.id}:1`, { blob, localSaved: false });
  w.lib.localError = new Error('blocked');
  assert.equal(w.api.checkpointStudio(false), false);
  await w.api.persistStudio(ep.id, 'student:alpha');
  assert.equal(w.saves.length, 1);
  assert.equal(w.remote.get(`studio-${ep.id}`).state.recordings.length, 1);
}

// An old, unowned recording stays a guest recording. Student A never loads B's audio.
{
  const w = world();
  w.disk.set('picnic:0', clip('legacy guest'));
  w.disk.set(w.api.localRecKey('picnic:1', 'student:alpha'), clip('alpha'));
  w.disk.set(w.api.localRecKey('picnic:1', 'student:beta'), clip('beta'));
  await w.api.initStudioStorage();
  assert.equal(w.api.recs.size, 1);
  assert.equal(await w.api.recs.get('picnic:1').blob.text(), 'alpha');
  await w.changeOwner('student:beta');
  assert.equal(w.api.recs.size, 1);
  assert.equal(await w.api.recs.get('picnic:1').blob.text(), 'beta');
  await w.changeOwner('guest');
  assert.equal(w.api.recs.size, 1);
  assert.equal(await w.api.recs.get('picnic:0').blob.text(), 'legacy guest');
  assert.equal(w.uploads.length, 0, 'Opening local recordings never uploads unowned legacy audio');
}

// Retake one line: the other line's immutable take survives, and cleanup follows commit.
{
  const w = world(); await w.api.initStudioStorage();
  const ep = w.api.episode(), selected = ep.lines.map((l, i) => l.who === 'kiki' ? i : -1).filter((i) => i >= 0);
  const [first, second] = selected;
  function edit(i, text) {
    const key = `${ep.id}:${i}`, blob = clip(text);
    w.api.setRec(key, blob, { pending: true });
    w.api.pendingStudioEdits.set(key, { blob, localSaved: true });
    return blob;
  }
  edit(first, 'first take'); edit(second, 'other line');
  w.api.state.idx = second; w.api.checkpointStudio(false);
  await w.api.persistStudio(ep.id, 'student:alpha');
  const oldRefs = w.remote.get(`studio-${ep.id}`).state.recordings;
  const oldFirst = oldRefs.find((r) => r.line === first).audioId;
  const oldSecond = oldRefs.find((r) => r.line === second).audioId;
  const replacement = edit(first, 'retake');
  await w.api.persistStudio(ep.id, 'student:alpha');
  const savedRefs = w.remote.get(`studio-${ep.id}`).state.recordings;
  assert.equal(savedRefs.find((r) => r.line === second).audioId, oldSecond);
  assert.notEqual(savedRefs.find((r) => r.line === first).audioId, oldFirst);
  assert.ok(w.removals.includes(oldFirst));
  assert.ok(!w.removals.includes(oldSecond));
  assert.equal(w.api.recs.get(`${ep.id}:${first}`).blob, replacement);

  const failed = edit(first, 'offline retake');
  const removeCount = w.removals.length;
  w.lib.saveError = Object.assign(new Error('conflict'), { status: 412, localSaved: true });
  await w.api.persistStudio(ep.id, 'student:alpha');
  assert.equal(w.api.recs.get(`${ep.id}:${first}`).blob, failed, 'A failed remote commit keeps the new local take');
  assert.equal(w.removals.length, removeCount, 'A failed manifest cannot delete a previously committed take');
  assert.equal(w.api.status().error.status, 412);

  // Explicit resume merges missing remote lines but does not replace an unsaved local retake.
  w.api.recs.delete(`${ep.id}:${second}`);
  w.lib.saveError = null;
  await w.api.resumeStudio();
  assert.equal(w.api.recs.get(`${ep.id}:${first}`).blob, failed);
  assert.equal(await w.api.recs.get(`${ep.id}:${second}`).blob.text(), 'other line');
  assert.equal(w.api.state.idx, second);
  w.api.setRec(`${ep.id}:0`, clip('not my role'));
  w.api.openStudioConversation();
  const practice = w.conversations.at(-1);
  assert.ok(practice.lines.every((l) => l.speaker === 'kiki'));
  assert.ok(practice.lines.every((l) => ep.lines.some((source) => source.en === l.en && source.who === l.speaker)));
  assert.ok(!('blob' in practice) && !('score' in practice));

  // A take deleted on another device disappears from the synced cache on resume.
  const latest = w.remote.get(`studio-${ep.id}`);
  latest.state.recordings = latest.state.recordings.filter((r) => r.line !== second);
  await w.api.resumeStudio();
  assert.ok(!w.api.recs.has(`${ep.id}:${second}`));
  assert.equal(w.api.recs.get(`${ep.id}:${first}`).blob, failed, 'The unsaved retake still survives');
}

// A late old-account draft fetch must not repopulate the new account's metadata cache.
{
  const w = world(); await w.api.initStudioStorage();
  w.api.checkpointStudio(false);
  let release;
  w.lib.getDraft = () => new Promise((resolve) => { release = resolve; });
  const saving = w.api.persistStudio(w.api.episode().id, 'student:alpha');
  await tick();
  await w.changeOwner('student:beta');
  release({ draft: { engine: 'studio', episodeId: 'picnic', state: { recordings: [] } } });
  await saving;
  assert.equal(w.api.studioBases.size, 0);
  assert.equal(w.saves.length, 0);
}

// Account changes during an upload cannot commit the old student's manifest as the new student.
{
  const w = world(); await w.api.initStudioStorage();
  const ep = w.api.episode(), blob = clip('pending alpha');
  w.api.setRec(`${ep.id}:1`, blob, { pending: true });
  w.api.pendingStudioEdits.set(`${ep.id}:1`, { blob, localSaved: true });
  w.api.checkpointStudio(false);
  let release;
  w.lib.uploadWait = new Promise((resolve) => { release = resolve; });
  const saving = w.api.persistStudio(ep.id, 'student:alpha');
  await tick(); assert.equal(w.uploads.length, 1);
  await w.changeOwner('student:beta'); release(); await saving;
  assert.equal(w.saves.length, 0);
  assert.equal(w.api.recs.size, 0);
  await w.api.saveStudioMovie(clip('old movie'), { clientId: 'old-movie' }, 'student:alpha');
  assert.equal(w.movies.length, 0, 'Export completion is bound to its starting account');
}

// An older successful video upload must not erase the retry for a newer failed video.
{
  const w = world(); await w.api.initStudioStorage();
  let firstResolve, secondReject;
  const firstWait = new Promise((resolve) => { firstResolve = resolve; });
  const secondWait = new Promise((_, reject) => { secondReject = reject; });
  let calls = 0;
  w.lib.saveMovie = () => ++calls === 1 ? firstWait : secondWait;
  const a = w.api.saveStudioMovie(clip('movie a'), { clientId: 'a' });
  const b = w.api.saveStudioMovie(clip('movie b'), { clientId: 'b' });
  secondReject(Object.assign(new Error('network'), { localSaved: true })); await b;
  firstResolve({ movie: { id: 'a' } }); await a;
  assert.equal(w.api.retry().meta.clientId, 'b');
}

// Gallery deletion clears the active episode only; its pending upload cannot recreate it.
{
  const w = world(); await w.api.initStudioStorage();
  const ep = w.api.episode(), blob = clip('take waiting for upload');
  w.api.setRec(`${ep.id}:1`, blob, { pending: true });
  w.api.setRec('teddy:1', clip('another episode'));
  w.api.pendingStudioEdits.set(`${ep.id}:1`, { blob, localSaved: true });
  w.api.checkpointStudio(false);
  let release;
  w.lib.uploadWait = new Promise((resolve) => { release = resolve; });
  const saving = w.api.persistStudio(ep.id, 'student:alpha'); await tick();
  w.deleteNotice({ owner: 'student:beta', draftId: `studio-${ep.id}` });
  assert.ok(w.api.recs.has(`${ep.id}:1`), 'A different account cannot clear this page');
  w.deleteNotice({ owner: 'student:alpha', draftId: `studio-${ep.id}`, phase: 'deleting', nonce: 'delete-a' }, true);
  assert.equal(w.api.checkpointStudio(false), false, 'No new draft may start before device cleanup finishes');
  release(); await saving;
  assert.equal(w.saves.length, 0, 'The late upload cannot commit a deleted practice');
  assert.ok(!w.api.recs.has(`${ep.id}:1`)); assert.ok(w.api.recs.has('teddy:1'));
  assert.equal(w.api.pendingStudioEdits.size, 0);
  assert.equal(w.local.get(`dubstudio.checkpoint.v2:student%3Aalpha:${ep.id}`), undefined);
  assert.equal(w.api.status().key, 'deletingPractice');
  w.deleteNotice({ owner: 'student:alpha', draftId: `studio-${ep.id}`, phase: 'deleted', nonce: 'delete-a' }, true);
  assert.equal(w.api.status().key, 'practiceDeleted');
  assert.equal(w.api.checkpointStudio(false), true, 'A new practice is allowed after cleanup');
}

// Deletion while a restored audio body arrives cannot write the old recording back to disk.
{
  const w = world(); await w.api.initStudioStorage();
  const ep = w.api.episode(), line = ep.lines[1];
  w.remote.set(`studio-${ep.id}`, { engine: 'studio', episodeId: ep.id, state: {
    idx: 3, recordings: [{ line: 1, audioId: 'take-old', en: line.en, speaker: line.who }],
  } });
  let release;
  w.lib.getAudio = () => new Promise((resolve) => { release = resolve; });
  const restoring = w.api.resumeStudio(); await tick();
  w.deleteNotice({ owner: 'student:alpha', draftId: `studio-${ep.id}` });
  release(clip('old remote recording')); await restoring;
  assert.equal(w.api.recs.size, 0);
  assert.ok(!w.disk.has(w.api.localRecKey(`${ep.id}:1`)));
  assert.equal(w.api.state.idx, 0);
  assert.equal(w.api.status().key, 'practiceDeleted');
}

// Even an IndexedDB read started before deletion cannot refill the cleared studio.
{
  const w = world();
  w.disk.set(w.api.localRecKey('picnic:1'), { blob: clip('old device copy'), pending: true });
  let release;
  w.lib.dbReadWait = new Promise((resolve) => { release = resolve; });
  const opening = w.api.initStudioStorage(); await tick();
  w.deleteNotice({ owner: 'student:alpha', draftId: 'studio-picnic' });
  w.disk.clear(); release(); await opening;
  assert.equal(w.api.recs.size, 0); assert.equal(w.api.pendingStudioEdits.size, 0);
}

console.log('PASS: studio account isolation, durable drafts, one-line retakes, resume merging, failed-save preservation, conversation grounding, export guards, deletion and late-result guards');
