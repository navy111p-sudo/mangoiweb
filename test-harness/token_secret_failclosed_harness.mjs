/** Offline executable coverage of all shared ROOM_JWT_SECRET consumers.
 * Production functions/routes, in-memory SQLite and synthetic keys only.
 * No credential values or tokens are printed; no external fetch is permitted.
 */
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy/src');
const require = createRequire(join(ROOT, 'cloudflare-deploy/package.json'));
const { buildSync } = require('esbuild');
const temp = mkdtempSync(join(tmpdir(), 'mangoi-token-secret-'));
const realFetch = globalThis.fetch;
const realNow = Date.now;
globalThis.fetch = async () => { throw new Error('External network forbidden in token-secret QA'); };
const NOW = 1791091200000;
Date.now = () => NOW;
let pass = 0;
async function test(name, run) { await run(); pass++; console.log('  ✅ ' + name); }
const key = '  synthetic-token-secret-fixture-20261004\n';
const env = { ROOM_JWT_SECRET: key };
const other = { ROOM_JWT_SECRET: 'synthetic-other-secret' };
const mac = text => createHmac('sha256', key).update(text).digest('base64url');
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const invalidBindings = [undefined, null, '', ' \t\n', 42, false, {}, ['synthetic-array'], new Uint8Array([1, 2])];
const missingError = { message: 'room_jwt_secret_not_configured' };

function fixture(secret = key) {
  const raw = new DatabaseSync(':memory:');
  const statement = (sql, args = []) => ({
    bind: (...bound) => statement(sql, bound),
    first: async () => raw.prepare(sql).get(...args) || null,
    all: async () => ({ results: raw.prepare(sql).all(...args) }),
    run: async () => ({ meta: raw.prepare(sql).run(...args) }),
  });
  return { raw, env: { ROOM_JWT_SECRET: secret, DB: { exec: async sql => raw.exec(sql), prepare: statement } } };
}

try {
  async function load(file) {
    const output = buildSync({ entryPoints: [join(SRC, file + '.ts')], bundle: true, write: false,
      format: 'esm', platform: 'node', logLevel: 'silent' }).outputFiles[0].text;
    const out = join(temp, file + '.mjs');
    writeFileSync(out, output);
    return import(pathToFileURL(out).href);
  }
  const S = await load('room-jwt-secret');
  const A = await load('auth-token');
  const T = await load('leveltest-ticket');
  const { SignalingRoom } = await load('signaling-room');
  const { handleMangoApi } = await load('api-mango');
  const call = async (environment, action, body, room = 'fixture-room') => {
    const url = new URL('https://example.invalid/api/rooms/' + room + '/' + action);
    const response = await handleMangoApi(new Request(url, { method: 'POST', body: JSON.stringify(body) }), url, environment);
    return { status: response.status, body: await response.json() };
  };
  const signaling = (environment, token, room = 'fixture-room') => {
    const instance = new SignalingRoom({}, environment);
    instance.roomId = room;
    return instance.verifyTokenIfRequired(new Request('https://example.invalid/?token=' + encodeURIComponent(token || '')));
  };

  await test('one getter rejects missing, empty, blank and malformed bindings without altering configured bytes', () => {
    assert.equal(S.requireRoomJwtSecret(env), key);
    for (const bad of [undefined, null, {}, ...invalidBindings.map(value => ({ ROOM_JWT_SECRET: value }))]) {
      assert.throws(() => S.requireRoomJwtSecret(bad), missingError);
    }
  });
  let uid, rec, ghost, ticket;
  await test('configured UID claims, optional sid, 30-day TTL and exact HMAC bytes are unchanged', async () => {
    uid = await A.signUidToken('fixture-student', env);
    const payload = b64({ uid: 'fixture-student', exp: NOW + 30 * 86400000 });
    assert.equal(uid, payload + '.' + mac(payload));
    assert.equal(await A.verifyUidToken(uid, env), 'fixture-student');
    const withSid = await A.signUidToken('fixture-student', env, 120000, 'synthetic-sid');
    const sidPayload = b64({ uid: 'fixture-student', exp: NOW + 120000, sid: 'synthetic-sid' });
    assert.equal(withSid, sidPayload + '.' + mac(sidPayload));
    assert.deepEqual(await A.inspectSession(uid, env), { state: 'legacy', uid: 'fixture-student' });
    assert.equal(await A.verifyUidToken(uid, { ROOM_JWT_SECRET: key.trim() }), null);
  });
  await test('recording-download and observer signatures retain resource binding and TTL', async () => {
    rec = await A.signRecDlSig(7, env);
    const recExp = NOW + 6 * 3600000;
    assert.equal(rec, recExp + '.' + mac('recdl:7:' + recExp));
    assert.equal(await A.verifyRecDlSig(7, rec, env), true);
    assert.equal(await A.verifyRecDlSig(8, rec, env), false);
    ghost = await A.signGhostObserveSig('fixture-room', env);
    const ghostExp = NOW + 30 * 60000;
    assert.equal(ghost, ghostExp + '.' + mac('ghostobs:fixture-room:' + ghostExp));
    assert.equal(await A.verifyGhostObserveSig('fixture-room', ghost, env), true);
    assert.equal(await A.verifyGhostObserveSig('other-room', ghost, env), false);
  });
  await test('level-test tickets retain 120-day TTL, truncated signature, URL and batch format', async () => {
    ticket = await T.signLtTicket(13, env);
    const payload = '13.' + Math.floor((NOW + 120 * 86400000) / 1000);
    assert.equal(ticket, payload + '.' + mac(payload).slice(0, 22));
    assert.equal(await T.verifyLtTicket(ticket, env), 13);
    assert.equal(new URL(await T.ltTicketUrl(13, env)).searchParams.get('k'), ticket);
    const map = await T.ltTicketUrlMap([13, 13, 14], env);
    assert.deepEqual(Object.keys(map), ['13', '14']);
    assert.equal(new URL(map[13]).searchParams.get('k'), ticket);
  });
  const f = fixture();
  let roomToken;
  try {
    await test('actual room join retains HS256 claims, five-minute TTL and open-join student role', async () => {
      const r = await call(f.env, 'join', { user_id: 'fixture-student', allow_open: true, role: 'teacher' });
      assert.equal(r.status, 200);
      assert.equal(r.body.expires_in, 300);
      assert.equal(r.body.role, 'student');
      roomToken = r.body.room_token;
      const [header, body, signature] = roomToken.split('.');
      assert.equal(header, b64({ alg: 'HS256', typ: 'JWT' }));
      assert.deepEqual(JSON.parse(Buffer.from(body, 'base64url')), { iss: 'mangoi', sub: 'fixture-student', aud: 'room:fixture-room', role: 'student', iat: NOW / 1000, exp: NOW / 1000 + 300, jti: r.body.jti });
      assert.equal(signature, mac(header + '.' + body));
      assert.equal((await call(f.env, 'verify-token', { token: roomToken })).status, 200);
      assert.equal((await call(f.env, 'verify-token', { token: roomToken })).body.error, 'already_used');
      assert.equal((await call(f.env, 'verify-token', { token: roomToken, allow_reuse: true })).status, 200);
      assert.equal((await call(f.env, 'verify-token', { token: roomToken }, 'other-room')).status, 403);
    });
    await test('invited teacher and observer roles, requested TTL and revocation checks are unchanged', async () => {
      for (const role of ['teacher', 'observer']) {
        f.raw.prepare('INSERT INTO room_members (room_id,user_id,role,invited_at) VALUES (?,?,?,?)').run('fixture-room', role, role, NOW);
        const r = await call(f.env, 'join', { user_id: role, ttl_sec: 600 });
        assert.equal(r.body.role, role); assert.equal(r.body.expires_in, 600);
        f.raw.prepare('UPDATE room_tokens SET revoked=1 WHERE jti=?').run(r.body.jti);
        assert.equal((await call(f.env, 'verify-token', { token: r.body.room_token })).body.error, 'revoked');
      }
    });
    await test('all issuing and verifying consumers fail closed for every invalid binding', async () => {
      for (const value of invalidBindings) {
        const bad = { ROOM_JWT_SECRET: value };
        await assert.rejects(() => A.signUidToken('fixture-student', bad), missingError);
        await assert.rejects(() => A.signRecDlSig(7, bad), missingError);
        await assert.rejects(() => A.signGhostObserveSig('fixture-room', bad), missingError);
        await assert.rejects(() => T.signLtTicket(13, bad), missingError);
        await assert.rejects(() => T.ltTicketUrl(13, bad), missingError);
        await assert.rejects(() => T.ltTicketUrlMap([13], bad), missingError);
        assert.equal(await A.verifyUidToken(uid, bad), null);
        assert.deepEqual(await A.inspectSession(uid, bad), { state: 'invalid', uid: null });
        assert.equal(await A.verifyRecDlSig(7, rec, bad), false);
        assert.equal(await A.verifyGhostObserveSig('fixture-room', ghost, bad), false);
        assert.equal(await T.verifyLtTicket(ticket, bad), null);
        const before = f.raw.prepare('SELECT COUNT(*) AS n FROM room_tokens').get().n;
        const roomEnv = { ...f.env, ...bad };
        const r = await call(roomEnv, 'join', { user_id: 'fixture-student', allow_open: true });
        assert.equal(r.status, 500); assert.equal(r.body.error, missingError.message);
        assert.equal(r.body.room_token, undefined);
        assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM room_tokens').get().n, before);
        assert.equal((await call(roomEnv, 'verify-token', { token: roomToken, allow_reuse: true })).status, 401);
        assert.equal((await signaling({ ...bad, REQUIRE_ROOM_TOKEN: 'true' }, roomToken)).ok, false);
      }
    });
    await test('SignalingRoom optional enforcement stays disabled unless the existing exact flag is true', async () => {
      for (const flag of [undefined, 'false', 'off', true, 'TRUE']) {
        assert.deepEqual(await signaling({ REQUIRE_ROOM_TOKEN: flag }, ''), { ok: true });
        assert.deepEqual(await signaling({ REQUIRE_ROOM_TOKEN: flag }, 'bad-token'), { ok: true });
      }
      assert.deepEqual(await signaling({ ...env, REQUIRE_ROOM_TOKEN: 'true' }, roomToken), { ok: true, role: 'student', userId: 'fixture-student' });
      assert.equal((await signaling({ ...env, REQUIRE_ROOM_TOKEN: 'true' }, '')).error, 'token_required');
      assert.equal((await signaling({ ...env, REQUIRE_ROOM_TOKEN: 'true' }, roomToken, 'other-room')).error, 'wrong_room');
      const room = new SignalingRoom({}, { REQUIRE_ROOM_TOKEN: 'true' });
      const denied = await room.fetch(new Request('https://example.invalid/?roomId=fixture-room&token=' + encodeURIComponent(roomToken), { headers: { Upgrade: 'websocket' } }));
      assert.equal(denied.status, 401);
    });
    await test('configured consumers still reject wrong keys, expired and malformed tokens', async () => {
      for (const token of ['', 'malformed', 'a.b.c']) {
        assert.equal(await A.verifyUidToken(token, env), null);
        assert.equal(await T.verifyLtTicket(token, env), null);
        assert.equal(await A.verifyRecDlSig(7, token, env), false);
        assert.equal(await A.verifyGhostObserveSig('fixture-room', token, env), false);
        assert.equal((await call(f.env, 'verify-token', { token })).status >= 400, true);
        assert.equal((await signaling({ ...env, REQUIRE_ROOM_TOKEN: 'true' }, token)).ok, false);
      }
      assert.equal(await A.verifyUidToken(uid, other), null);
      assert.equal(await T.verifyLtTicket(ticket, other), null);
      assert.equal(await A.verifyRecDlSig(7, rec, other), false);
      assert.equal(await A.verifyGhostObserveSig('fixture-room', ghost, other), false);
      assert.equal((await call({ ...f.env, ...other }, 'verify-token', { token: roomToken })).status, 401);
      assert.equal((await signaling({ ...other, REQUIRE_ROOM_TOKEN: 'true' }, roomToken)).ok, false);
      assert.equal(await A.verifyUidToken(await A.signUidToken('fixture-student', env, -1000), env), null);
      assert.equal(await T.verifyLtTicket(await T.signLtTicket(13, env, -1000), env), null);
      assert.equal(await A.verifyRecDlSig(7, await A.signRecDlSig(7, env, -1000), env), false);
      assert.equal(await A.verifyGhostObserveSig('fixture-room', await A.signGhostObserveSig('fixture-room', env, -1000), env), false);
      const expired = await call(f.env, 'join', { user_id: 'fixture-student', allow_open: true, ttl_sec: -1 });
      assert.equal((await call(f.env, 'verify-token', { token: expired.body.room_token })).status, 401);
      assert.equal((await signaling({ ...env, REQUIRE_ROOM_TOKEN: 'true' }, expired.body.room_token)).error, 'expired');
    });
  } finally { f.raw.close(); }
  await test('the old fallback fingerprint is absent from all four consumers', () => {
    const oldFingerprint = '2bd1c6ed2e5c5bddefa3aedca8657d588663bfb46253003af3185152f9d79053';
    for (const file of ['auth-token.ts', 'leveltest-ticket.ts', 'api-mango.ts', 'signaling-room.ts']) {
      const source = readFileSync(join(SRC, file), 'utf8');
      assert.match(source, /requireRoomJwtSecret/);
      for (const match of source.matchAll(/(['"])([^'"\n]{71})\1/g)) {
        assert.notEqual(createHash('sha256').update(match[2]).digest('hex'), oldFingerprint);
      }
    }
  });
  console.log(`token_secret_failclosed_harness — PASS ${pass} / FAIL 0`);
} finally {
  Date.now = realNow;
  globalThis.fetch = realFetch;
  rmSync(temp, { recursive: true, force: true });
}
