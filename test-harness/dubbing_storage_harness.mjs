// Private dubbing storage regression: execute the REAL handler in local workerd
// with a real local R2 binding. No production API, bucket or D1 calls are made.
// Student HMAC verification is real. The existing staff-session primitive is
// replaced at the module boundary by a tiny fixture (not a second auth policy).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomUUID } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CD = join(ROOT, 'cloudflare-deploy');
const require = createRequire(join(CD, 'package.json'));
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const ts = require('typescript');
const secret = 'local-dubbing-harness-secret-never-used-in-production';
const source = readFileSync(join(CD, 'src/index.ts'), 'utf8');
const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const legacyNames = ['handleRecordingList', 'handleRecordingDownload', 'handleRecordingDelete'];
const legacyFunctions = legacyNames.map(name => {
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(fn, `${name} exists`);
  return fn.getText(ast);
}).join('\n');
let checkBlock;
function findCheck(node) {
  if (ts.isIfStatement(node) && node.expression.getText(ast) === "path === '/api/recordings/check' && request.method === 'GET'") checkBlock = node.getText(ast);
  ts.forEachChild(node, findCheck);
}
findCheck(ast);
assert.ok(checkBlock, 'legacy metadata route exists');

const compiled = await build({
  stdin: {
    resolveDir: join(CD, 'src'), loader: 'ts',
    contents: `
      import { handleDubbingApi, isPrivateDubbingKey } from './api-dubbing';
      const recordingJson = (value, status=200) => new Response(JSON.stringify(value), {status,headers:{'Content-Type':'application/json'}});
      const REC_LIST_PREFIXES = ['rec/','recordings/'];
      const REC_LIST_MAX_PAGES = 8;
      ${legacyFunctions}
      async function legacyCheck(request, env) { const url=new URL(request.url), path='/api/recordings/check'; ${checkBlock} }
      export default { async fetch(request,env) {
        const u=new URL(request.url);
        if(u.searchParams.has('__late_upload_fixture')) {
          const real=env.RECORDINGS;
          env={...env,RECORDINGS:{
            get:real.get.bind(real),head:real.head.bind(real),list:real.list.bind(real),delete:real.delete.bind(real),
            put:async(key,value,options)=>{
              const stored=await real.put(key,value,options);
              if(stored && key.includes('/movies/')) {
                // Model an R2 completion arriving after its reservation expired
                // and other requests filled all freed slots. No real time wait.
                const quotaKey=key.slice(0,key.indexOf('/movies/'))+'/_quota.json';
                const q=await (await real.get(quotaKey)).json(); q.items={};
                for(let i=0;i<20;i++)q.items['movies/'+crypto.randomUUID()]={bytes:16,at:Date.now(),token:''};
                await real.put(quotaKey,JSON.stringify(q));
              }
              return stored;
            }
          }};
        }
        if(u.pathname==='/__legacy/list') return handleRecordingList(request,env);
        if(u.pathname==='/__legacy/check') return legacyCheck(request,env);
        if(u.pathname.startsWith('/__legacy/blob/')) {
          const path=u.pathname.replace('/__legacy/blob/','/api/recordings/blob/');
          return request.method==='DELETE' ? handleRecordingDelete(path,env) : handleRecordingDownload(path,request,env);
        }
        if(u.pathname==='/__harness/stream') {
          const target=u.searchParams.get('target');
          const count=Number(u.searchParams.get('bytes'));
          const chunk=Number(u.searchParams.get('chunk')||65536);
          let sent=0;
          const body=new ReadableStream({pull(c) { if(sent===count) return c.close(); const len=Math.min(chunk,count-sent); sent+=len; c.enqueue(new Uint8Array(len)); }});
          const headers=new Headers(request.headers); headers.delete('Content-Length');
          return handleDubbingApi(new Request('https://mangoi.ai'+target,{method:'PUT',headers,body}),env);
        }
        return handleDubbingApi(request,env);
      }};
    `,
  },
  bundle: true, write: false, format: 'esm', target: 'es2022', platform: 'browser',
  plugins: [{
    name: 'staff-session-fixture',
    setup(b) {
      b.onResolve({ filter: /^\.\/auth-admin$/ }, () => ({ path: 'staff-session-fixture', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export async function checkAdminSession(request) {
        const match=/(?:^|;\\s*)test_staff=([a-z0-9_-]+)/i.exec(request.headers.get('Cookie')||'');
        return match ? {ok:true,username:match[1]} : {ok:false};
      }`, loader: 'js' }));
    },
  }],
});
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, script: compiled.outputFiles[0].text,
  compatibilityDate: '2026-10-01',
  bindings: { ROOM_JWT_SECRET: secret, SINGLE_SESSION: 'off' },
  r2Buckets: ['RECORDINGS'], kvNamespaces: ['SESSION_STATE'],
}));
let passed = 0;
const ck = (label, actual, expected = true) => { assert.deepEqual(actual, expected, label); passed++; console.log('  ✓ ' + label); };
const uidToken = (uid, expiration = Date.now() + 3600000) => {
  const payload = Buffer.from(JSON.stringify({ uid, exp: expiration })).toString('base64url');
  return payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
};
function student(uid) { return { Authorization: 'Bearer ' + uidToken(uid), 'X-Dubbing-Actor': encodeURIComponent('student:' + uid) }; }
function staff(uid) { return { Cookie: 'test_staff=' + uid, 'X-Dubbing-Actor': encodeURIComponent('staff:' + uid) }; }
const A = student('learner-a'), B = student('learner-b');
const bytes = new Uint8Array(Array.from({ length: 16 }, (_, i) => i));
const metadata = { engine: 'main', episodeId: 'film1', title: '우리 첫 더빙', durationMs: 60000 };
function call(path, options = {}, who = A) {
  return mf.dispatchFetch('https://mangoi.ai' + path, { ...options, headers: { ...who, ...options.headers } });
}
function movieOptions(clientId = randomUUID(), body = bytes, extra = {}) {
  return { method: 'POST', body, headers: { 'Content-Type': 'video/webm;codecs=vp8,opus', 'X-Dubbing-Size': String(body.byteLength), 'X-Dubbing-Meta': encodeURIComponent(JSON.stringify({ ...metadata, clientId, ...extra })) } };
}
function audioOptions(body = bytes) { return { method: 'PUT', body, headers: { 'Content-Type': 'audio/webm;codecs=opus', 'X-Dubbing-Size': String(body.byteLength) } }; }
function draftOptions(state, etag = '*') {
  return { method: 'PUT', body: JSON.stringify({ ...metadata, state }), headers: { 'Content-Type': 'application/json', [etag === '*' ? 'If-None-Match' : 'If-Match']: etag } };
}
async function json(response) { return { status: response.status, body: await response.json() }; }
async function expectError(label, response, status, error) {
  const result = await json(response);
  ck(label, [result.status, result.body.ok, result.body.error], [status, false, error]);
}

try {
  console.log('🎬 Private dubbing storage: local workerd + local R2');
  const bucket = await mf.getR2Bucket('RECORDINGS');
  const downloadId = Date.now().toString(36) + '-checkpoint';
  const checkpoint = {
    version: 1, owner: 'student:learner-a', id: downloadId, limit: 512 * 1024 * 1024,
    title: '무지개 모둠', filename: 'mangoi-무지개_모둠.zip', updatedAt: Date.now(), requested: [],
    parts: [0, 1, 2].map(i => [{ id: 'video-' + i, title: '무지개 모둠 · 에피소드 1', size: 300 * 1024 * 1024, mime: 'video/mp4', createdAt: '', name: '무지개 모둠', path: '001_무지개_모둠/00' + (i + 1) + '_mangoi-video.mp4' }]),
  };
  const downloadPath = '/api/dubbing/downloads/' + downloadId;
  const downloadPut = value => ({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  await expectError('anonymous progress is denied', await call('/api/dubbing/downloads', {}, {}), 401, 'auth_required');
  await expectError('progress actor cannot override authenticated owner', await call(downloadPath, downloadPut({ ...checkpoint, owner: 'student:learner-b' })), 400, 'invalid_download');
  await expectError('cross-origin progress mutation is denied', await call(downloadPath, { ...downloadPut(checkpoint), headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' } }), 403, 'origin_forbidden');
  ck('checkpoint create succeeds', (await call(downloadPath, downloadPut(checkpoint))).status, 200);
  let history = (await json(await call('/api/dubbing/downloads'))).body;
  ck('fresh device sees authenticated account history', history.downloads.length, 1);
  ck('checkpoint response is private and uncached', (await call('/api/dubbing/downloads')).headers.get('Cache-Control'), 'private, no-store');
  ck('another student cannot list account history', (await json(await call('/api/dubbing/downloads', {}, B))).body.downloads, []);
  ck('staff history stays separate from student history', (await json(await call('/api/dubbing/downloads', {}, staff('learner-a')))).body.downloads, []);
  const updates = await Promise.all([0, 1, 2].map(i => call(downloadPath, downloadPut({ ...checkpoint, requested: [i] }))));
  ck('concurrent devices save all updates', updates.map(r => r.status), [200, 200, 200]);
  history = (await json(await call('/api/dubbing/downloads'))).body;
  ck('concurrent device progress is a monotonic union', history.downloads[0].requested, [0, 1, 2]);
  await call(downloadPath, downloadPut(checkpoint));
  ck('stale offline progress cannot reset newer requests', (await json(await call('/api/dubbing/downloads'))).body.downloads[0].requested, [0, 1, 2]);
  await expectError('manifest cannot be silently replaced', await call(downloadPath, downloadPut({ ...checkpoint, filename: 'mangoi-changed.zip' })), 409, 'download_changed');
  for (const patch of [
    { requested: [0, 0] }, { requested: [3] },
    { parts: [[{ ...checkpoint.parts[0][0], path: '../escape.mp4' }]] },
    { parts: [[{ ...checkpoint.parts[0][0], size: 512 * 1024 * 1024 }]] },
    { parts: [[checkpoint.parts[0][0], checkpoint.parts[0][0]]] },
  ]) await expectError('invalid or unsafe checkpoint is rejected', await call(downloadPath, downloadPut({ ...checkpoint, ...patch })), 400, 'invalid_download');
  ck('progress storage is outside media quota prefix', (await bucket.list({ prefix: 'dubbing-private/download-progress/v1/' })).objects.length, 1);
  ck('progress delete succeeds', (await call(downloadPath, { method: 'DELETE' })).status, 200);
  history = (await json(await call('/api/dubbing/downloads'))).body;
  ck('deletion propagates to other devices', [history.downloads.length, history.removed.includes(downloadId)], [0, true]);
  await expectError('late device cannot resurrect deleted history', await call(downloadPath, downloadPut(checkpoint)), 410, 'download_deleted');
  const staleId = (Date.now() - 31 * 86400000).toString(36) + '-old';
  await expectError('expired offline creates cannot resurrect pruned tombstones', await call('/api/dubbing/downloads/' + staleId, downloadPut({ ...checkpoint, id: staleId })), 409, 'download_expired');
  for (let i = 0; i < 10; i++) {
    const job = { ...checkpoint, id: Date.now().toString(36) + '-limit-' + i };
    ck('bounded history slot ' + i, (await call('/api/dubbing/downloads/' + job.id, downloadPut(job))).status, 200);
  }
  const excess = { ...checkpoint, id: Date.now().toString(36) + '-excess' };
  await expectError('history limit preserves all unfinished jobs', await call('/api/dubbing/downloads/' + excess.id, downloadPut(excess)), 409, 'download_count_limit');



  const uploadId = Date.now().toString(36) + '-upload', uploadPath = '/api/dubbing/uploads/' + uploadId;
  const uploadJob = {version:1,owner:'student:learner-a',id:uploadId,updatedAt:Date.now(),entries:[0,1].map(i=>({id:'original-'+i,title:'모둠 '+i,size:16,mime:'video/webm',engine:'main',episodeId:'film1',state:'pending',error:'',sha256:String(i).repeat(64),durationMs:2000,interrupted:false}))};
  await expectError('anonymous upload progress is denied',await call('/api/dubbing/uploads',{},{}),401,'auth_required');
  await expectError('upload actor cannot override authenticated owner',await call(uploadPath,downloadPut({...uploadJob,owner:'student:learner-b'})),400,'invalid_upload');
  ck('upload checkpoint creation succeeds',(await call(uploadPath,downloadPut(uploadJob))).status,200);
  ck('independent browser sees account upload queue',(await json(await call('/api/dubbing/uploads'))).body.uploads[0].entries.length,2);
  ck('another student cannot see upload queue',(await json(await call('/api/dubbing/uploads',{},B))).body.uploads,[]);
  ck('upload queue is private and uncached',(await call('/api/dubbing/uploads')).headers.get('Cache-Control'),'private, no-store');
  const progressUpdates=await Promise.all([0,1].map(i=>call(uploadPath,downloadPut({...uploadJob,entries:uploadJob.entries.map((e,n)=>({...e,state:n===i?'saved':'missing',error:'device-specific error'}))}))));
  ck('concurrent upload progress commits safely',progressUpdates.map(r=>r.status),[200,200]);
  await call(uploadPath,downloadPut(uploadJob));
  let uploads=(await json(await call('/api/dubbing/uploads'))).body.uploads;
  ck('stale device cannot rewind completed uploads',uploads[0].entries.map(e=>e.state),['saved','saved']);
  ck('device-specific errors never leak into other browsers',uploads[0].entries.map(e=>e.error),['','']);
  for(const patch of [{size:17},{sha256:'f'.repeat(64)},{title:'different'}])await expectError('immutable upload original cannot be replaced',await call(uploadPath,downloadPut({...uploadJob,entries:[{...uploadJob.entries[0],...patch}]})),409,'upload_changed');
  for(const patch of [{id:'../escape'},{sha256:'not-a-hash'},{size:-1},{durationMs:Infinity}])await expectError('unsafe upload metadata is refused',await call(uploadPath,downloadPut({...uploadJob,entries:[{...uploadJob.entries[0],...patch}]})),400,'invalid_upload');
  ck('upload progress does not consume media quota prefix',(await bucket.list({prefix:'dubbing-private/upload-progress/v1/'})).objects.length,1);
  const resultRow=(key,code='content',seq=1)=>({key,seq,name:key+'.webm',code,movieIds:[],sha256:'a'.repeat(64)});
  const fileHistory=(rows,removed=[])=>({version:1,rows,removed});
  ck('file results save alongside the authenticated upload job',(await call(uploadPath,downloadPut({...uploadJob,connections:fileHistory([resultRow('file-a')])}))).status,200);
  ck('another account cannot read private filenames',(await json(await call('/api/dubbing/uploads',{},B))).body.uploads,[]);
  ck('fresh device restores file name and reason',(await json(await call('/api/dubbing/uploads'))).body.uploads[0].connections.rows[0].name,'file-a.webm');
  const resultUpdates=await Promise.all(['file-b','file-c'].map(key=>call(uploadPath,downloadPut({...uploadJob,connections:fileHistory([resultRow(key)])}))));
  ck('independent device results merge atomically',resultUpdates.map(r=>r.status),[200,200]);
  ck('concurrent file results are all retained',(await json(await call('/api/dubbing/uploads'))).body.uploads[0].connections.rows.length,3);
  await call(uploadPath,downloadPut({...uploadJob,connections:fileHistory([resultRow('file-a','connected',2)])}));
  await call(uploadPath,downloadPut({...uploadJob,connections:fileHistory([resultRow('file-a')])}));
  ck('stale attempt snapshots cannot rewind newer results',(await json(await call('/api/dubbing/uploads'))).body.uploads[0].connections.rows.find(r=>r.key==='file-a').code,'connected');
  await call(uploadPath,downloadPut({...uploadJob,connections:fileHistory([resultRow('replacement')],['file-a'])}));
  await call(uploadPath,downloadPut({...uploadJob,connections:fileHistory([resultRow('file-a','connected',100)])}));
  ck('replacement tombstone prevents old device resurrection',(await json(await call('/api/dubbing/uploads'))).body.uploads[0].connections.rows.some(r=>r.key==='file-a'),false);
  await expectError('same revision with conflicting data is refused',await call(uploadPath,downloadPut({...uploadJob,connections:fileHistory([resultRow('file-b','read')])})),409,'connections_changed');
  for(const row of [{...resultRow('bad'),key:'../escape'},{...resultRow('bad'),seq:0},{...resultRow('bad'),code:'unknown'},{...resultRow('bad'),movieIds:['foreign-movie']},{...resultRow('bad'),sha256:'bad'}])await expectError('unsafe file-result metadata is rejected',await call(uploadPath,downloadPut({...uploadJob,connections:fileHistory([row])})),400,'invalid_connections');
  await call(uploadPath,downloadPut(uploadJob));
  ck('older clients cannot erase account file results',(await json(await call('/api/dubbing/uploads'))).body.uploads[0].connections.rows.length,3);
  ck('upload checkpoint delete succeeds',(await call(uploadPath,{method:'DELETE'})).status,200);
  ck('deletion is visible across devices',(await json(await call('/api/dubbing/uploads'))).body.removed.includes(uploadId),true);
  await expectError('offline device cannot resurrect removed upload queue',await call(uploadPath,downloadPut(uploadJob)),410,'upload_deleted');
  const oldUploadId=(Date.now()-31*86400000).toString(36)+'-upload-old';
  await expectError('expired upload queue cannot evade tombstones',await call('/api/dubbing/uploads/'+oldUploadId,downloadPut({...uploadJob,id:oldUploadId})),409,'upload_expired');

  await expectError('anonymous request is denied', await call('/api/dubbing/movies', {}, {}), 401, 'auth_required');
  await expectError('uid and query token are not authentication', await call('/api/dubbing/movies?uid=learner-a&token=' + uidToken('learner-a'), {}, {}), 401, 'auth_required');
  await expectError('signed guest cannot store account works', await call('/api/dubbing/movies', {}, student('guest-123')), 401, 'auth_required');
  await expectError('expired bearer never falls through to valid staff cookie', await call('/api/dubbing/movies', { headers: { ...staff('teacher-a'), Authorization: 'Bearer ' + uidToken('learner-a', Date.now() - 10000) } }), 401, 'auth_required');
  await expectError('malformed bearer never falls through to staff', await call('/api/dubbing/movies', { headers: { ...staff('teacher-a'), Authorization: 'Basic invalid' } }), 401, 'auth_required');
  await expectError('actor does not match valid student token', await call('/api/dubbing/movies', { headers: { 'X-Dubbing-Actor': 'student:learner-b' } }), 409, 'account_changed');
  await expectError('actor header is required for reads too', await call('/api/dubbing/movies', { headers: { 'X-Dubbing-Actor': '' } }), 409, 'account_changed');
  await expectError('actor does not match staff cookie', await call('/api/dubbing/movies', { headers: { 'X-Dubbing-Actor': 'staff:teacher-b' } }, staff('teacher-a')), 409, 'account_changed');
  const emptyA = (await json(await call('/api/dubbing/movies'))).body;
  ck('new account library is empty', emptyA.movies, []);
  ck('owner is opaque and fixed length', /^[0-9a-f]{64}$/.test(emptyA.owner));
  ck('uid case uses one canonical owner', (await json(await call('/api/dubbing/movies', {}, student('LEARNER-A')))).body.owner, emptyA.owner);
  const staffA = (await json(await call('/api/dubbing/movies', {}, staff('learner-a')))).body;
  ck('staff/student with the same text id have separate owners', staffA.owner !== emptyA.owner);
  await expectError('cross-site staff mutation is denied', await call('/api/dubbing/movies', { ...movieOptions(), headers: { ...movieOptions().headers, Origin: 'https://other.example' } }, staff('teacher-a')), 403, 'origin_forbidden');
  ck('valid staff cookie can save its own movie without a student token', (await call('/api/dubbing/movies', movieOptions(), staff('teacher-a'))).status, 201);

  const movieId = randomUUID();
  const created = await json(await call('/api/dubbing/movies', movieOptions(movieId)));
  ck('movie is stored successfully', created.status, 201);
  ck('movie metadata preserves title and actual declared size', [created.body.movie.title, created.body.movie.size], [metadata.title, bytes.length]);
  ck('successful retry is idempotent', (await json(await call('/api/dubbing/movies', movieOptions(movieId)))).status, 200);
  ck('retry does not add a second movie', (await json(await call('/api/dubbing/movies'))).body.movies.length, 1);
  await expectError('same id with different metadata is a conflict', await call('/api/dubbing/movies', movieOptions(movieId, bytes, { episodeId: 'film2' })), 409, 'idempotency_conflict');
  const full = await call('/api/dubbing/movies/' + movieId);
  ck('own movie bytes round trip', new Uint8Array(await full.arrayBuffer()), bytes);
  ck('media is private and not sniffed', [full.headers.get('Cache-Control'), full.headers.get('X-Content-Type-Options')], ['private, no-store', 'nosniff']);
  await expectError('other student cannot read a known movie id', await call('/api/dubbing/movies/' + movieId + '?uid=learner-a', {}, B), 404, 'not_found');
  await expectError('staff has no implicit access to student movies', await call('/api/dubbing/movies/' + movieId, {}, staff('teacher-a')), 404, 'not_found');
  await call('/api/dubbing/movies/' + movieId, { method: 'DELETE' }, B);
  ck('deleting own missing key cannot delete another account movie', (await call('/api/dubbing/movies/' + movieId)).status, 200);
  for (const [range, start, end] of [['bytes=0-3', 0, 4], ['bytes=8-', 8, 16], ['bytes=-4', 12, 16], ['bytes=12-999', 12, 16]]) {
    const response = await call('/api/dubbing/movies/' + movieId, { headers: { Range: range } });
    ck(range + ' status', response.status, 206);
    ck(range + ' bytes', new Uint8Array(await response.arrayBuffer()), bytes.slice(start, end));
    ck(range + ' content range', response.headers.get('Content-Range'), `bytes ${start}-${end - 1}/16`);
  }
  for (const range of ['bytes=16-', 'bytes=4-2', 'bytes=-0', 'bytes=1-2,4-5', 'garbage']) {
    const response = await call('/api/dubbing/movies/' + movieId, { headers: { Range: range } });
    ck(range + ' invalid range rejected', [response.status, response.headers.get('Content-Range')], [416, 'bytes */16']);
  }
  const ifRange = await call('/api/dubbing/movies/' + movieId, { headers: { Range: 'bytes=0-3', 'If-Range': '"old-version"' } });
  ck('stale If-Range returns full representation', [ifRange.status, (await ifRange.arrayBuffer()).byteLength], [200, 16]);
  const head = await call('/api/dubbing/movies/' + movieId, { method: 'HEAD' });
  ck('HEAD returns exact metadata without a body', [head.status, head.headers.get('Content-Length'), (await head.arrayBuffer()).byteLength], [200, '16', 0]);

  const draftId = 'studio-film1';
  const audioPath = '/api/dubbing/drafts/' + draftId + '/audio/line-0-v1';
  ck('audio may be saved before first draft JSON', (await call(audioPath, audioOptions())).status, 201);
  ck('audio-only upload is not falsely listed as a resumable draft', (await json(await call('/api/dubbing/drafts'))).body.drafts.length, 0);
  const altered = new Uint8Array(16).fill(7);
  ck('same audio id is an idempotent retry', (await call(audioPath, audioOptions(altered))).status, 200);
  ck('an existing audio id is never overwritten', new Uint8Array(await (await call(audioPath)).arrayBuffer()), bytes);
  await expectError('audio scope is private', await call(audioPath, {}, B), 404, 'not_found');
  const firstDraft = (await json(await call('/api/dubbing/drafts/' + draftId, draftOptions({ idx: 2, recordings: { 0: 'line-0-v1' } })))).body;
  ck('draft create exposes a usable ETag', /^".+"$/.test(firstDraft.etag));
  const nextDraft = (await json(await call('/api/dubbing/drafts/' + draftId, draftOptions({ idx: 3, recordings: { 0: 'line-0-v1' } }, firstDraft.etag)))).body;
  ck('saved checkpoint restores actual state', (await json(await call('/api/dubbing/drafts/' + draftId))).body.draft.state.idx, 3);
  ck('draft update changes ETag', firstDraft.etag !== nextDraft.etag);
  await expectError('stale draft save is rejected', await call('/api/dubbing/drafts/' + draftId, draftOptions({ idx: 0 }, firstDraft.etag)), 412, 'draft_changed');
  await expectError('create cannot replace an existing draft', await call('/api/dubbing/drafts/' + draftId, draftOptions({ idx: 0 })), 412, 'draft_changed');
  await expectError('draft mutation without precondition is rejected', await call('/api/dubbing/drafts/new-no-condition', { method: 'PUT', body: '{}', headers: { 'Content-Type': 'application/json' } }), 428, 'precondition_required');
  ck('stale save preserves latest checkpoint and old audio', [(await json(await call('/api/dubbing/drafts/' + draftId))).body.draft.state.idx, (await call(audioPath)).status], [3, 200]);
  await expectError('other account cannot read draft JSON', await call('/api/dubbing/drafts/' + draftId, {}, B), 404, 'not_found');
  const listedDrafts = (await json(await call('/api/dubbing/drafts'))).body.drafts;
  ck('draft list contains metadata but no state/audio', listedDrafts.length === 1 && !('state' in listedDrafts[0]) && listedDrafts[0].etag === nextDraft.etag);
  await expectError('large JSON is bounded before parsing', await call('/api/dubbing/drafts/huge', draftOptions({ text: 'x'.repeat(65536) })), 413, 'draft_too_large');
  await expectError('encoded slash cannot escape audio namespace', await call('/api/dubbing/drafts/x/audio/a%2Fb', audioOptions()), 400, 'invalid_id');
  const badType = audioOptions(); badType.headers['Content-Type'] = 'text/html';
  await expectError('active content MIME is refused', await call('/api/dubbing/drafts/x/audio/bad-type', badType), 415, 'unsupported_media_type');

  for (const [mode, declared, actual, expectedCode, expectedStatus] of [
    ['long', 3, 4, 'size_mismatch', 400],
    ['short', 4, 3, 'size_mismatch', 400],
    ['over-limit', 8388608, 8388609, 'file_too_large', 413],
  ]) {
    const target = '/api/dubbing/drafts/stream-test/audio/' + mode;
    const response = await call('/__harness/stream?target=' + encodeURIComponent(target) + '&bytes=' + actual,
      { headers: { 'Content-Type': 'audio/webm', 'X-Dubbing-Size': String(declared) } });
    await expectError(mode + ' validates actual streamed bytes', response, expectedStatus, expectedCode);
    await expectError(mode + ' never publishes a partial file', await call(target), 404, 'not_found');
  }
  const quotaKey = 'dubbing-private/v1/' + emptyA.owner + '/_quota.json';
  let quota = await (await bucket.get(quotaKey)).json();
  ck('failed stream reservations are freed', !Object.keys(quota.items).some(key => key.includes('stream-test/')));

  // Real conditional-write quota contention: 19 existing works, two simultaneous
  // candidates. Only one slot remains, even when both read the same initial index.
  const quotaUser = student('quota-user');
  for (let n = 0; n < 19; n++) assert.equal((await call('/api/dubbing/movies', movieOptions(), quotaUser)).status, 201);
  const competing = await Promise.all([call('/api/dubbing/movies', movieOptions(), quotaUser), call('/api/dubbing/movies', movieOptions(), quotaUser)]);
  ck('two concurrent uploads cannot exceed the account movie cap', competing.map(r => r.status).sort(), [201, 409]);
  ck('account cap counts all engines together', (await json(await call('/api/dubbing/movies', {}, quotaUser))).body.movies.length, 20);
  await expectError('full gallery requires explicit deletion', await call('/api/dubbing/movies', movieOptions(randomUUID(), bytes, { engine: 'studio' }), quotaUser), 409, 'movie_count_limit');

  // Crash recovery fixtures use the real R2 index/CAS. Twenty expired leases:
  // retain the actual completed movie, release only reservations with no object.
  quota = await (await bucket.get(quotaKey)).json();
  const old = Date.now() - 11 * 60 * 1000;
  for (const key of Object.keys(quota.items)) if (key.startsWith('movies/')) quota.items[key] = { ...quota.items[key], at: old, token: randomUUID() };
  for (let n = 1; n < 20; n++) quota.items['movies/' + randomUUID()] = { bytes: 16, at: old, token: randomUUID() };
  await bucket.put(quotaKey, JSON.stringify(quota));
  ck('abandoned leases do not permanently fill the gallery', (await call('/api/dubbing/movies', movieOptions())).status, 201);
  ck('recovery preserves a successfully stored movie', (await call('/api/dubbing/movies/' + movieId)).status, 200);
  quota = await (await bucket.get(quotaKey)).json();
  ck('recovery only leaves actual movie slots', Object.keys(quota.items).filter(key => key.startsWith('movies/')).length, 2);
  const lateUser=student('late-upload');
  const lateId=randomUUID();
  await expectError('late completion cannot publish outside recovered quota', await call('/api/dubbing/movies?__late_upload_fixture=1',movieOptions(lateId),lateUser),409,'movie_count_limit');
  await expectError('uncounted late upload is removed',await call('/api/dubbing/movies/'+lateId,{},lateUser),404,'not_found');

  // Count/byte quota fixtures represent previously completed uploads. Tiny local
  // bodies avoid writing hundreds of MiB just to exercise accounting branches.
  const caps = student('audio-caps');
  const capOwner = (await json(await call('/api/dubbing/movies', {}, caps))).body.owner;
  const capKey = 'dubbing-private/v1/' + capOwner + '/_quota.json';
  const capQuota = { version: 1, revision: '', items: {}, deleting: {} };
  for (let n = 0; n < 100; n++) capQuota.items['drafts/film1/audio/take-' + n] = { bytes: 16, at: Date.now(), token: '' };
  await bucket.put(capKey, JSON.stringify(capQuota));
  await expectError('per-draft audio count cap is enforced', await call('/api/dubbing/drafts/film1/audio/new-take', audioOptions(), caps), 409, 'audio_count_limit');
  capQuota.items = {};
  for (let n = 0; n < 16; n++) capQuota.items['drafts/film1/audio/take-' + n] = { bytes: 8 * 1024 * 1024, at: Date.now(), token: '' };
  await bucket.put(capKey, JSON.stringify(capQuota));
  await expectError('account audio bytes cap is enforced', await call('/api/dubbing/drafts/film1/audio/new-take', audioOptions(), caps), 409, 'audio_storage_limit');
  capQuota.items = {};
  for (let n = 0; n < 12; n++) capQuota.items['drafts/film-' + n + '/state.json'] = { bytes: 16, at: Date.now(), token: '' };
  await bucket.put(capKey, JSON.stringify(capQuota));
  await expectError('audio-first uploads still consume a draft slot', await call('/api/dubbing/drafts/extra/audio/new-take', audioOptions(), caps), 409, 'draft_count_limit');
  await bucket.put(capKey, '{corrupt');
  await expectError('corrupt quota fails closed instead of resetting limits', await call('/api/dubbing/movies', movieOptions(), caps), 503, 'storage_index_invalid');
  ck('safe ids matching Object prototype names are usable', (await call('/api/dubbing/drafts/constructor',draftOptions({idx:1}))).status,200);

  // The shared bucket's old admin endpoints used to accept arbitrary keys. Run
  // the actual extracted handlers, pairing a classroom object with a private one.
  const privateKey = 'dubbing-private/v1/' + emptyA.owner + '/movies/' + movieId;
  const classKey = 'rec/harness-room/classroom.webm';
  await bucket.put(classKey, bytes, { httpMetadata: { contentType: 'video/webm' } });
  ck('legacy classroom download remains available', (await call('/__legacy/blob/' + encodeURIComponent(classKey))).status, 200);
  ck('legacy generic download cannot expose private dubbing', (await call('/__legacy/blob/' + encodeURIComponent(privateKey))).status, 404);
  ck('legacy generic delete cannot remove private dubbing', (await call('/__legacy/blob/' + encodeURIComponent(privateKey), { method: 'DELETE' })).status, 404);
  ck('legacy metadata check cannot inspect private dubbing', (await call('/__legacy/check?key=' + encodeURIComponent(privateKey))).status, 404);
  ck('legacy metadata check still sees classroom object', (await json(await call('/__legacy/check?key=' + encodeURIComponent(classKey)))).body.exists, true);
  const genericList = (await json(await call('/__legacy/list?prefix=d'))).body;
  ck('broad legacy prefix cannot enumerate private works', genericList.items, []);
  ck('normal classroom list is preserved', (await json(await call('/__legacy/list'))).body.items.some(item => item.key === classKey));
  ck('legacy classroom delete still works', (await call('/__legacy/blob/' + encodeURIComponent(classKey), { method: 'DELETE' })).status, 200);
  ck('private media survives all legacy bypass attempts', (await call('/api/dubbing/movies/' + movieId)).status, 200);

  // Neither transcript fallback may read a private dubbing key through the
  // classroom recording_id parameter. Its existing class-recording branch stays.
  for (const file of ['api-points.ts', 'api-lessons.ts']) {
    const text = readFileSync(join(CD, 'src', file), 'utf8');
    ck(file + ' excludes only new private namespace from raw R2 transcription', /b\.recording_id && !isPrivateDubbingKey\(String\(b\.recording_id\)\) && \(env as any\)\.RECORDINGS/.test(text));
  }
  ck('private route is explicitly dispatched', source.includes("if (path === '/api/dubbing' || path.startsWith('/api/dubbing/')) return handleDubbingApi(request, env);"));
  const cleanup = readFileSync(join(CD, 'src/recordings-cleanup.ts'), 'utf8');
  ck('classroom orphan sweep remains confined to rec/', cleanup.includes("(options.prefix === undefined) ? 'rec/' : options.prefix"));

  ck('explicit draft delete succeeds', (await call('/api/dubbing/drafts/' + draftId, { method: 'DELETE' })).status, 200);
  await expectError('draft delete removes associated private audio', await call(audioPath), 404, 'not_found');
  await expectError('draft delete removes JSON checkpoint', await call('/api/dubbing/drafts/' + draftId), 404, 'not_found');
  ck('deleting draft does not delete unrelated completed movie', (await call('/api/dubbing/movies/' + movieId)).status, 200);
  ck('explicit movie delete succeeds', (await call('/api/dubbing/movies/' + movieId, { method: 'DELETE' })).status, 200);
  await expectError('deleted movie is no longer readable', await call('/api/dubbing/movies/' + movieId), 404, 'not_found');
  console.log(`\n${passed} checks passed; all storage was local and ephemeral.`);
} finally {
  await mf.dispose();
}
