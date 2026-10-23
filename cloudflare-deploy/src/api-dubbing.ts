/**
 * Private A.i dubbing library. Student tokens and staff sessions own separate
 * namespaces; a client uid, role or object key is never an authorization source.
 *
 * Uses the existing RECORDINGS binding, NOT the classroom recordings table.
 * Keep this prefix outside rec/ and recordings/: the classroom retention job and
 * default orphan sweep must not delete learner-created works. Generic legacy R2
 * readers/deleters also exclude this prefix (isPrivateDubbingKey).
 *
 * Each movie/audio is one immutable R2 object with its own metadata. Draft state
 * is small JSON with required HTTP preconditions. A bounded, conditional-write
 * quota ledger reserves capacity before uploads, including concurrent requests.
 * Failed/abandoned reservations recover after a lease; existing files are never
 * automatically deleted to make room. There is no new D1 schema or bucket rule.
 */
import { verifyUidToken } from './auth-token';
import { checkAdminSession } from './auth-admin';
import type { MangoEnv } from './api-mango';

export const DUBBING_PRIVATE_PREFIX = 'dubbing-private/';
export function isPrivateDubbingKey(key: unknown): boolean {
  // R2 keys are literal strings, not filesystem paths: do not normalize '..' and
  // accidentally classify a different object. Callers decode URL paths first.
  return typeof key === 'string' && key.startsWith(DUBBING_PRIVATE_PREFIX);
}

export const DUBBING_LIMITS = Object.freeze({
  movieBytes: 64 * 1024 * 1024,
  audioBytes: 8 * 1024 * 1024,
  draftBytes: 64 * 1024,
  movies: 20,
  drafts: 12,
  audioPerDraft: 100,
  totalAudioBytes: 128 * 1024 * 1024,
});
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const MOVIE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUOTA_BYTES = 512 * 1024;
const LEASE_MS = 10 * 60 * 1000;
const UPLOAD_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_OWNED_OBJECTS = DUBBING_LIMITS.movies + DUBBING_LIMITS.drafts * (DUBBING_LIMITS.audioPerDraft + 1) + 1;
const VIDEO_TYPES = new Set(['video/webm', 'video/mp4']);
const AUDIO_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/mpeg', 'audio/aac']);

type Engine = 'main' | 'studio';
interface WorkMeta { engine: Engine; episodeId: string; title: string }
interface MovieMeta extends WorkMeta {
  id: string; mime: string; size: number; createdAt: number;
  interrupted: boolean; durationMs: number;
}
interface Draft extends WorkMeta { id: string; state: Record<string, unknown>; updatedAt: number }
interface Lease { bytes: number; at: number; token: string }
interface Quota {
  version: 1;
  revision: string;
  items: Record<string, Lease>;
  deleting: Record<string, { at: number; token: string }>;
}
interface Owner { key: string; prefix: string }
class DubbingError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
function fail(status: number, code: string): never { throw new DubbingError(status, code); }

function privateHeaders(): Headers {
  return new Headers({
    'Cache-Control': 'private, no-store',
    'Vary': 'Authorization, Cookie, X-Dubbing-Actor',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
}
function reply(data: Record<string, unknown>, owner?: Owner, status = 200, etag?: string): Response {
  const headers = privateHeaders();
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (etag) headers.set('ETag', etag);
  return new Response(JSON.stringify({ ok: true, ...(owner ? { owner: owner.key } : {}), ...data }), { status, headers });
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function id(value: string): string {
  if (!SAFE_ID.test(value)) fail(400, 'invalid_id');
  return value;
}
function workMeta(value: unknown): WorkMeta {
  if (!record(value) || (value.engine !== 'main' && value.engine !== 'studio')) fail(400, 'invalid_metadata');
  const episodeId = String(value.episodeId || '');
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  if (!SAFE_ID.test(episodeId) || !title || title.length > 120 || /[\u0000-\u001f\u007f]/.test(title)) fail(400, 'invalid_metadata');
  return { engine: value.engine, episodeId, title };
}
function mimeType(request: Request, allowed: Set<string>): string {
  const raw = (request.headers.get('Content-Type') || '').trim().toLowerCase();
  const base = raw.split(';')[0].trim();
  if (!allowed.has(base) || raw.length > 160 || /[\r\n]/.test(raw)) fail(415, 'unsupported_media_type');
  return raw;
}
function declaredSize(request: Request, maximum: number): number {
  // Blob fetch supplies Content-Length. X-Dubbing-Size supports a proxy that
  // removes it; FixedLengthStream still verifies the ACTUAL bytes in both cases.
  const length = request.headers.get('Content-Length');
  const hint = request.headers.get('X-Dubbing-Size');
  if (length !== null && hint !== null && length !== hint) fail(400, 'size_mismatch');
  const raw = length ?? hint;
  if (raw === null) fail(411, 'length_required');
  if (!/^\d{1,12}$/.test(raw)) fail(400, 'invalid_length');
  const size = Number(raw);
  if (size > maximum) fail(413, 'file_too_large');
  if (!size || !request.body) fail(400, 'empty_file');
  return size;
}
async function readJson(request: Request): Promise<unknown> {
  if ((request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') fail(415, 'json_required');
  const length = request.headers.get('Content-Length');
  if (length && Number(length) > DUBBING_LIMITS.draftBytes) fail(413, 'draft_too_large');
  if (!request.body) fail(400, 'invalid_json');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > DUBBING_LIMITS.draftBytes) { await reader.cancel(); fail(413, 'draft_too_large'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { return fail(400, 'invalid_json'); }
}

async function resolveOwner(request: Request, env: MangoEnv): Promise<Owner> {
  let subject = '';
  const authorization = request.headers.get('Authorization');
  if (authorization !== null) {
    // An expired/malformed student token must NEVER fall through to a staff
    // cookie left on the same computer and save into somebody else's library.
    const match = /^Bearer (\S+)$/.exec(authorization);
    if (!match) fail(401, 'auth_required');
    const uid = await verifyUidToken(match[1], env);
    if (!uid || /^guest/i.test(uid)) fail(401, 'auth_required');
    subject = 'student:' + uid.trim().toLowerCase();
  } else {
    const staff = await checkAdminSession(request, env);
    if (!staff.ok || !staff.username) fail(401, 'auth_required');
    subject = 'staff:' + staff.username.trim().toLowerCase();
  }
  let claimed = '';
  try { claimed = decodeURIComponent(request.headers.get('X-Dubbing-Actor') || '').trim().toLowerCase(); }
  catch { fail(409, 'account_changed'); }
  // This header is a mismatch guard, not authentication. Only the verified
  // subject above determines storage. It also protects cookie-based account switches.
  if (!claimed || claimed !== subject) fail(409, 'account_changed');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('dubbing:v1:' + subject));
  const key = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  return { key, prefix: DUBBING_PRIVATE_PREFIX + 'v1/' + key + '/' };
}
function sameOriginMutation(request: Request, url: URL): void {
  if (request.method === 'GET' || request.method === 'HEAD') return;
  const origin = request.headers.get('Origin');
  const site = request.headers.get('Sec-Fetch-Site');
  if ((origin && origin !== url.origin) || (site && site !== 'same-origin' && site !== 'none')) fail(403, 'origin_forbidden');
}

async function ownedObjects(bucket: R2Bucket, prefix: string, metadata = false): Promise<R2Object[]> {
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 24; page++) {
    const result = await bucket.list({ prefix, cursor, limit: 1000, ...(metadata ? { include: ['customMetadata', 'httpMetadata'] as ('customMetadata' | 'httpMetadata')[] } : {}) });
    objects.push(...result.objects);
    if (objects.length > MAX_OWNED_OBJECTS) fail(503, 'storage_index_invalid');
    if (!result.truncated) return objects;
    cursor = (result as R2Objects & { cursor: string }).cursor;
    if (!cursor) fail(503, 'storage_index_invalid');
  }
  return fail(503, 'storage_index_invalid');
}
function relativeKind(key: string): 'movie' | 'draft' | 'audio' {
  if (/^movies\/[0-9a-f-]{36}$/.test(key)) return 'movie';
  if (/^drafts\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}\/state.json$/.test(key)) return 'draft';
  if (/^drafts\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}\/audio\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(key)) return 'audio';
  return fail(503, 'storage_index_invalid');
}
function draftGroup(key: string): string { return key.startsWith('drafts/') ? key.split('/')[1] : ''; }
function checkQuota(quota: Quota): void {
  let movies = 0, audioBytes = 0;
  const drafts = new Set<string>();
  const audioCounts: Record<string, number> = Object.create(null);
  for (const [key, entry] of Object.entries(quota.items)) {
    const kind = relativeKind(key);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) fail(503, 'storage_index_invalid');
    if (kind === 'movie') movies++;
    else {
      const group = draftGroup(key);
      drafts.add(group);
      if (kind === 'audio') {
        audioBytes += entry.bytes;
        audioCounts[group] = (audioCounts[group] || 0) + 1;
        if (audioCounts[group] > DUBBING_LIMITS.audioPerDraft) fail(409, 'audio_count_limit');
      }
    }
  }
  if (movies > DUBBING_LIMITS.movies) fail(409, 'movie_count_limit');
  if (drafts.size > DUBBING_LIMITS.drafts) fail(409, 'draft_count_limit');
  if (audioBytes > DUBBING_LIMITS.totalAudioBytes) fail(409, 'audio_storage_limit');
}
async function mutateQuota<T>(bucket: R2Bucket, owner: Owner, edit: (quota: Quota) => T, recover = false): Promise<T> {
  const key = owner.prefix + '_quota.json';
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await bucket.get(key);
    if (current && current.size > QUOTA_BYTES) fail(503, 'storage_index_invalid');
    let quota: Quota;
    try {
      quota = current ? await current.json<Quota>() : { version: 1, revision: '', items: {}, deleting: {} };
      if (quota.version !== 1 || !record(quota.items) || !record(quota.deleting)) fail(503, 'storage_index_invalid');
      quota.items = Object.assign(Object.create(null), quota.items);
      quota.deleting = Object.assign(Object.create(null), quota.deleting);
    } catch { return fail(503, 'storage_index_invalid'); }
    const now = Date.now();
    if (recover) {
      const expired = Object.entries(quota.items).filter(([, entry]) => entry.token && now - entry.at >= LEASE_MS);
      if (expired.length) {
        // Strongly-consistent listing recovers an isolate that died after put,
        // without deleting successful files or permanently leaking quota slots.
        const objects = new Map((await ownedObjects(bucket, owner.prefix)).map(object => [object.key, object]));
        for (const [relative, entry] of expired) {
          relativeKind(relative);
          const object = objects.get(owner.prefix + relative);
          if (object) quota.items[relative] = { bytes: object.size, at: now, token: '' };
          else delete quota.items[relative];
        }
      }
      for (const [group, lease] of Object.entries(quota.deleting)) {
        if (now - lease.at >= LEASE_MS) delete quota.deleting[group];
      }
    }
    const result = edit(quota);
    checkQuota(quota);
    quota.revision = crypto.randomUUID();
    const text = JSON.stringify(quota);
    if (new TextEncoder().encode(text).byteLength > QUOTA_BYTES) fail(503, 'storage_index_invalid');
    const conditions = new Headers(current ? { 'If-Match': current.httpEtag } : { 'If-None-Match': '*' });
    const stored = await bucket.put(key, text, { onlyIf: conditions, httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' } });
    if (stored) return result;
  }
  return fail(409, 'storage_busy');
}
async function reserve(bucket: R2Bucket, owner: Owner, key: string, bytes: number): Promise<string> {
  const token = crypto.randomUUID();
  return mutateQuota(bucket, owner, quota => {
    const group = draftGroup(key);
    if (group && quota.deleting[group]) fail(409, 'draft_busy');
    if (quota.items[key]?.token) fail(409, 'upload_in_progress');
    quota.items[key] = { bytes, at: Date.now(), token };
    return token;
  }, true);
}
async function finishLease(bucket: R2Bucket, owner: Owner, key: string, token: string, object: R2Object | null): Promise<void> {
  await mutateQuota(bucket, owner, quota => {
    if (quota.items[key]?.token !== token) {
      // A very late completion must acquire a real slot again; never silently
      // bypass a quota that recovered the abandoned reservation.
      if (object) {
        const group = draftGroup(key);
        if (group && quota.deleting[group]) fail(409, 'draft_busy');
        quota.items[key] = { bytes: object.size, at: Date.now(), token: '' };
      }
      return;
    }
    if (object) quota.items[key] = { bytes: object.size, at: Date.now(), token: '' };
    else delete quota.items[key];
  });
}
async function settleFailedLease(bucket: R2Bucket, owner: Owner, key: string, token: string): Promise<void> {
  // A failed conditional draft PUT can leave the previous valid object intact.
  // Keep its quota; a failed upload with no object should immediately free it.
  try { await finishLease(bucket, owner, key, token, await bucket.head(owner.prefix + key)); }
  catch { console.warn('[dubbing] reservation recovery deferred'); }
}
async function finishUpload(bucket: R2Bucket, owner: Owner, key: string, token: string, object: R2Object): Promise<void> {
  try { await finishLease(bucket, owner, key, token, object); }
  catch (error) {
    if (error instanceof DubbingError && ['movie_count_limit', 'draft_count_limit', 'audio_count_limit', 'audio_storage_limit', 'draft_busy'].includes(error.code)) {
      // An R2 write completing exceptionally late (after its lease was reclaimed)
      // cannot publish an uncounted file. Delete only THIS immutable upload, not
      // an old draft, another request's object, or any successfully saved work.
      const current = await bucket.head(owner.prefix + key);
      if (current?.customMetadata?.uploadToken === token && current.etag === object.etag) await bucket.delete(owner.prefix + key);
    }
    throw error;
  }
}

async function streamPut(bucket: R2Bucket, key: string, request: Request, size: number, maximum: number, options: R2PutOptions): Promise<R2Object | null> {
  const fixed = new FixedLengthStream(size);
  const writer = fixed.writable.getWriter();
  const reader = request.body!.getReader();
  let error: Error | null = null;
  let readBytes = 0;
  const abort = async (reason: Error) => {
    await Promise.allSettled([reader.cancel(reason), writer.abort(reason)]);
  };
  const timer = setTimeout(() => {
    error = new DubbingError(408, 'upload_timeout');
    void abort(error).catch(() => {});
  }, UPLOAD_TIMEOUT_MS);
  // Both promises are observed. Only one chunk is held at a time; never formData,
  // arrayBuffer, Blob reassembly, or tee a 64 MiB movie in Worker memory.
  const pumping = (async () => {
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        readBytes += part.value.byteLength;
        if (readBytes > maximum) fail(413, 'file_too_large');
        if (readBytes > size) fail(400, 'size_mismatch');
        await writer.write(part.value);
      }
      if (readBytes !== size) fail(400, 'size_mismatch');
      await writer.close();
    } catch (caught) {
      error = error || (caught instanceof Error ? caught : new Error('upload_failed'));
      await abort(error);
    }
  })();
  try {
    const stored = await bucket.put(key, fixed.readable, options);
    if (!stored) { await abort(new Error('precondition_failed')); await pumping; return null; }
    await pumping;
    if (error) throw error;
    return stored;
  } catch (caught) {
    await abort(error || new Error('upload_failed'));
    await pumping;
    if (error instanceof DubbingError) throw error;
    throw caught;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
    writer.releaseLock();
  }
}
function objectMeta<T>(object: R2Object): T {
  const meta = object.customMetadata?.meta;
  if (!meta || meta.length > 2048) fail(503, 'storage_metadata_invalid');
  try { return JSON.parse(meta) as T; }
  catch { return fail(503, 'storage_metadata_invalid'); }
}
function draftConditions(request: Request): Headers {
  const match = request.headers.get('If-Match');
  const absent = request.headers.get('If-None-Match');
  if (match && absent) fail(400, 'invalid_precondition');
  if (absent === '*') return new Headers({ 'If-None-Match': '*' });
  if (match && /^"[^"\r\n,]{1,128}"$/.test(match)) return new Headers({ 'If-Match': match });
  return fail(428, 'precondition_required');
}
async function mediaResponse(request: Request, bucket: R2Bucket, key: string): Promise<Response> {
  const head = await bucket.head(key);
  if (!head) fail(404, 'not_found');
  const headers = privateHeaders();
  headers.set('Content-Type', head.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('ETag', head.httpEtag);
  let offset = 0, length = head.size, partial = false;
  const range = request.headers.get('Range');
  const ifRange = request.headers.get('If-Range');
  if (request.method !== 'HEAD' && range && (!ifRange || ifRange === head.httpEtag)) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    let valid = !!match && (!!match[1] || !!match[2]);
    if (valid && match) {
      if (!match[1]) {
        const suffix = Number(match[2]);
        valid = Number.isSafeInteger(suffix) && suffix > 0;
        offset = Math.max(0, head.size - suffix);
        length = head.size - offset;
      } else {
        offset = Number(match[1]);
        const end = match[2] ? Number(match[2]) : head.size - 1;
        valid = Number.isSafeInteger(offset) && Number.isSafeInteger(end) && offset < head.size && end >= offset;
        length = Math.min(end, head.size - 1) - offset + 1;
      }
    }
    if (!valid || length <= 0) {
      headers.set('Content-Range', 'bytes */' + head.size);
      return new Response(null, { status: 416, headers });
    }
    partial = true;
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${head.size}`);
  }
  headers.set('Content-Length', String(length));
  if (request.method === 'HEAD') return new Response(null, { headers });
  const object = await bucket.get(key, { ...(partial ? { range: { offset, length } } : {}), onlyIf: { etagMatches: head.etag } });
  if (!object) fail(404, 'not_found');
  if (!('body' in object)) fail(409, 'media_changed');
  return new Response(object.body, { status: partial ? 206 : 200, headers });
}

async function deleteOne(bucket: R2Bucket, owner: Owner, key: string): Promise<void> {
  const existing = await bucket.head(owner.prefix + key);
  const token = await reserve(bucket, owner, key, existing?.size || 0);
  try {
    await bucket.delete(owner.prefix + key);
    await finishLease(bucket, owner, key, token, null);
  } catch (error) { await settleFailedLease(bucket, owner, key, token); throw error; }
}
async function deleteDraft(bucket: R2Bucket, owner: Owner, draftId: string): Promise<void> {
  const groupPrefix = 'drafts/' + draftId + '/';
  const token = crypto.randomUUID();
  await mutateQuota(bucket, owner, quota => {
    if (quota.deleting[draftId] || Object.entries(quota.items).some(([key, entry]) => key.startsWith(groupPrefix) && entry.token)) fail(409, 'draft_busy');
    quota.deleting[draftId] = { at: Date.now(), token };
  }, true);
  try {
    const objects = await ownedObjects(bucket, owner.prefix + groupPrefix);
    if (objects.length) await bucket.delete(objects.map(object => object.key));
    await mutateQuota(bucket, owner, quota => {
      if (quota.deleting[draftId]?.token !== token) fail(409, 'draft_busy');
      for (const key of Object.keys(quota.items)) if (key.startsWith(groupPrefix)) delete quota.items[key];
      delete quota.deleting[draftId];
    });
  } catch (error) {
    try { await mutateQuota(bucket, owner, quota => { if (quota.deleting[draftId]?.token === token) delete quota.deleting[draftId]; }); }
    catch { console.warn('[dubbing] delete lease recovery deferred'); }
    throw error;
  }
}

export async function handleDubbingApi(request: Request, env: MangoEnv): Promise<Response> {
  let owner: Owner | undefined;
  try {
    const url = new URL(request.url);
    sameOriginMutation(request, url);
    owner = await resolveOwner(request, env);
    if (!env.RECORDINGS) fail(503, 'storage_unavailable');
    const bucket = env.RECORDINGS;
    const method = request.method;
    const path = url.pathname.slice('/api/dubbing'.length);

    if (path === '/movies' && method === 'GET') {
      const objects = await ownedObjects(bucket, owner.prefix + 'movies/', true);
      const movies = objects.map(object => objectMeta<MovieMeta>(object)).sort((a, b) => b.createdAt - a.createdAt);
      return reply({ movies, limits: DUBBING_LIMITS }, owner);
    }
    if (path === '/movies' && method === 'POST') {
      const header = request.headers.get('X-Dubbing-Meta') || '';
      if (!header || header.length > 4096) fail(400, 'invalid_metadata');
      let input: Record<string, unknown>;
      try { input = JSON.parse(decodeURIComponent(header)); } catch { return fail(400, 'invalid_metadata'); }
      const meta = workMeta(input);
      const mime = mimeType(request, VIDEO_TYPES);
      const size = declaredSize(request, DUBBING_LIMITS.movieBytes);
      const clientId = input.clientId === undefined ? crypto.randomUUID() : String(input.clientId).toLowerCase();
      if (!MOVIE_ID.test(clientId)) fail(400, 'invalid_id');
      const duration = input.durationMs === undefined ? 0 : Number(input.durationMs);
      if (!Number.isFinite(duration) || duration < 0 || duration > 2 * 3600 * 1000) fail(400, 'invalid_metadata');
      const key = 'movies/' + clientId;
      const previous = await bucket.head(owner.prefix + key);
      if (previous) {
        const movie = objectMeta<MovieMeta>(previous);
        if (movie.size !== size || movie.mime !== mime || movie.engine !== meta.engine || movie.episodeId !== meta.episodeId) fail(409, 'idempotency_conflict');
        return reply({ movie }, owner);
      }
      const movie: MovieMeta = { ...meta, id: clientId, mime, size, createdAt: Date.now(), interrupted: input.interrupted === true, durationMs: Math.round(duration) };
      const token = await reserve(bucket, owner, key, size);
      try {
        const stored = await streamPut(bucket, owner.prefix + key, request, size, DUBBING_LIMITS.movieBytes, {
          onlyIf: new Headers({ 'If-None-Match': '*' }),
          httpMetadata: { contentType: mime, cacheControl: 'private, no-store' },
          customMetadata: { meta: JSON.stringify(movie), uploadToken: token },
        });
        if (!stored) fail(409, 'upload_in_progress');
        await finishUpload(bucket, owner, key, token, stored);
        return reply({ movie }, owner, 201);
      } catch (error) { await settleFailedLease(bucket, owner, key, token); throw error; }
    }
    const movieMatch = /^\/movies\/([^/]+)$/.exec(path);
    if (movieMatch) {
      const movieId = movieMatch[1].toLowerCase();
      if (!MOVIE_ID.test(movieId)) fail(400, 'invalid_id');
      const key = 'movies/' + movieId;
      if (method === 'GET' || method === 'HEAD') return await mediaResponse(request, bucket, owner.prefix + key);
      if (method === 'DELETE') { await deleteOne(bucket, owner, key); return reply({}, owner); }
    }

    if (path === '/drafts' && method === 'GET') {
      // Metadata alone keeps the list small; audio payloads and draft state never
      // enter this response. list() pagination follows truncated, not item count.
      const objects = await ownedObjects(bucket, owner.prefix + 'drafts/', true);
      const drafts = objects.filter(object => object.key.endsWith('/state.json')).map(object => ({ ...objectMeta<Omit<Draft, 'state'>>(object), etag: object.httpEtag })).sort((a, b) => b.updatedAt - a.updatedAt);
      return reply({ drafts, limits: DUBBING_LIMITS }, owner);
    }
    const audioMatch = /^\/drafts\/([^/]+)\/audio\/([^/]+)$/.exec(path);
    if (audioMatch) {
      const draftId = id(audioMatch[1]), audioId = id(audioMatch[2]);
      const key = 'drafts/' + draftId + '/audio/' + audioId;
      if (method === 'GET' || method === 'HEAD') return await mediaResponse(request, bucket, owner.prefix + key);
      if (method === 'DELETE') { await deleteOne(bucket, owner, key); return reply({}, owner); }
      if (method === 'PUT') {
        const mime = mimeType(request, AUDIO_TYPES);
        const size = declaredSize(request, DUBBING_LIMITS.audioBytes);
        const previous = await bucket.head(owner.prefix + key);
        if (previous) {
          if (previous.size !== size || previous.httpMetadata?.contentType !== mime) fail(409, 'idempotency_conflict');
          return reply({ audio: objectMeta(previous) }, owner);
        }
        // Audio may precede the first draft JSON. It still consumes both a draft
        // slot and bounded audio quota, and is removable through DELETE /drafts/id.
        const audio = { id: audioId, mime, size, updatedAt: Date.now() };
        const token = await reserve(bucket, owner, key, size);
        try {
          const stored = await streamPut(bucket, owner.prefix + key, request, size, DUBBING_LIMITS.audioBytes, {
            onlyIf: new Headers({ 'If-None-Match': '*' }),
            httpMetadata: { contentType: mime, cacheControl: 'private, no-store' },
            customMetadata: { meta: JSON.stringify(audio), uploadToken: token },
          });
          if (!stored) fail(409, 'upload_in_progress');
          await finishUpload(bucket, owner, key, token, stored);
          return reply({ audio }, owner, 201);
        } catch (error) { await settleFailedLease(bucket, owner, key, token); throw error; }
      }
    }
    const draftMatch = /^\/drafts\/([^/]+)$/.exec(path);
    if (draftMatch) {
      const draftId = id(draftMatch[1]);
      const key = 'drafts/' + draftId + '/state.json';
      if (method === 'GET') {
        const object = await bucket.get(owner.prefix + key);
        if (!object) fail(404, 'not_found');
        if (object.size > DUBBING_LIMITS.draftBytes) fail(503, 'storage_metadata_invalid');
        return reply({ draft: await object.json<Draft>(), etag: object.httpEtag }, owner, 200, object.httpEtag);
      }
      if (method === 'PUT') {
        const conditions = draftConditions(request);
        const input = await readJson(request);
        const meta = workMeta(input);
        if (!record(input) || !record(input.state)) fail(400, 'invalid_state');
        const draft: Draft = { ...meta, id: draftId, state: input.state, updatedAt: Date.now() };
        const text = JSON.stringify(draft);
        const size = new TextEncoder().encode(text).byteLength;
        if (size > DUBBING_LIMITS.draftBytes) fail(413, 'draft_too_large');
        const token = await reserve(bucket, owner, key, size);
        try {
          const { state, ...summary } = draft;
          const stored = await bucket.put(owner.prefix + key, text, {
            onlyIf: conditions,
            httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
            customMetadata: { meta: JSON.stringify(summary) },
          });
          if (!stored) fail(412, 'draft_changed');
          await finishLease(bucket, owner, key, token, stored);
          return reply({ draft, etag: stored.httpEtag }, owner, 200, stored.httpEtag);
        } catch (error) { await settleFailedLease(bucket, owner, key, token); throw error; }
      }
      if (method === 'DELETE') { await deleteDraft(bucket, owner, draftId); return reply({}, owner); }
    }
    return reply({ ok: false, error: 'not_found' }, owner, 404);
  } catch (error) {
    if (error instanceof DubbingError) return reply({ ok: false, error: error.code }, owner, error.status);
    console.warn('[dubbing] storage request failed');
    return reply({ ok: false, error: 'storage_unavailable' }, owner, 503);
  }
}
