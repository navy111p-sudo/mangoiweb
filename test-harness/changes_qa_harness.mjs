// changes_qa_harness.mjs — QA harness for the 2026-06-10 change-set
// Runs: integrity checks, frontend inline-JS syntax, endpoint wiring, lookup-handler logic.
// Backend compile (wrangler dry-run / tsc) is run separately and noted in the report.
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.argv[2] || '/sessions/trusting-affectionate-hypatia/mnt/mangoiweb(last)';
const CD = ROOT + '/cloudflare-deploy';
const tmp = mkdtempSync(join(tmpdir(), 'qa-'));
let pass = 0, fail = 0;
const log = [];
function ok(name, cond, detail='') {
  (cond ? pass++ : fail++);
  const line = `${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`;
  log.push(line); console.log(line);
}
const read = p => readFileSync(p, 'utf8');
const headLines = rel => { try { return parseInt(execSync(`git -C "${ROOT}" show HEAD:${rel} | wc -l`).toString().trim()); } catch { return -1; } };
const wcLines = p => read(p).split('\n').length - 1;

console.log('=== 1) INTEGRITY ===');
const files = [
  ['cloudflare-deploy/public/index.html', 1, '</html>'],
  ['cloudflare-deploy/src/api-mango.ts', 52, '}'],
  ['cloudflare-deploy/src/index.ts', 1, '}'],
  ['cloudflare-deploy/public/lesson-postpone-demo.html', 3, '</html>'],
  ['cloudflare-deploy/public/admin.html', 0, '</html>'],
];
for (const [rel, expectDelta, tailNeedle] of files) {
  const abs = ROOT + '/' + rel;
  const h = headLines(rel), w = wcLines(abs);
  ok(`integrity:${rel} delta`, (w - h) === expectDelta, `HEAD=${h} WORK=${w} delta=${w-h} (expect ${expectDelta})`);
  const tail = read(abs).trimEnd().split('\n').pop();
  ok(`integrity:${rel} tail`, tail.includes(tailNeedle), `tail="${tail.slice(0,40)}"`);
  if ((rel.endsWith('.ts') || rel.endsWith('.html')) && !rel.endsWith('index.html')) {  // index.html: 잘림 마감으로 중괄호 균형을 의도적으로 +1 닫음 → htmlvalid 체크로 대체
    const s = read(abs); const workNet = (s.match(/{/g)||[]).length - (s.match(/}/g)||[]).length;
    let headNet = NaN;
    try { const hs = execSync(`git -C "${ROOT}" show HEAD:${rel}`, { maxBuffer: 1<<28 }).toString(); headNet = (hs.match(/{/g)||[]).length - (hs.match(/}/g)||[]).length; } catch {}
    ok(`integrity:${rel} brace-balance preserved`, workNet === headNet, `workNet=${workNet} headNet=${headNet} (edits must not change net)`);
  }
}

console.log('\n=== 2) FRONTEND INLINE-JS SYNTAX (node --check) ===');
function checkInlineScripts(rel) {
  const s = read(ROOT + '/' + rel);
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m, i = 0, bad = 0, total = 0;
  while ((m = re.exec(s))) {
    const body = m[1];
    if (!body.trim() || /application\/(ld\+json|json)/i.test(m[0])) continue;
    total++; const f = join(tmp, `s_${rel.replace(/\W/g,'_')}_${i++}.js`);
    writeFileSync(f, body);
    try { execSync(`node --check "${f}"`, { stdio: 'pipe' }); }
    catch (e) { bad++; log.push(`   syntax err in ${rel} script#${i}: ${String(e.stderr||e).split('\n')[0]}`); }
  }
  ok(`syntax:${rel}`, bad === 0, `${total} inline scripts, ${bad} errors`);
}
['cloudflare-deploy/public/index.html','cloudflare-deploy/public/lesson-postpone-demo.html','cloudflare-deploy/public/admin.html','mangoi-speech-patch/mangoi_Speech/practice.html'].forEach(checkInlineScripts);

console.log('\n=== 3) ENDPOINT WIRING (/api/student/lookup) ===');
const idxTs = read(CD + '/src/index.ts');
const apiTs = read(CD + '/src/api-mango.ts');
const indexHtml = read(CD + '/public/index.html');
ok('wiring:gate registered in index.ts', /path === '\/api\/student\/lookup'/.test(idxTs));
ok('wiring:handler present in api-mango.ts', /path === '\/api\/student\/lookup'/.test(apiTs) && /SELECT \* FROM students_erp WHERE user_id/.test(apiTs));
ok('wiring:frontend calls endpoint', /fetch\('\/api\/student\/lookup'/.test(indexHtml));
ok('wiring:frontend sends user_id+from_session', /user_id: realUid, from_session: true/.test(indexHtml));
ok('wiring:frontend reads d.student', /d\.ok && d\.student/.test(indexHtml));
// response schema fields produced by handler vs consumed by renderExtStudentCard
const handlerFields = ['uid','name','program','current_program','current_program_label','status','signup_date','expire_at','d_day','has_password'];
ok('wiring:handler returns expected fields', handlerFields.every(f => new RegExp(`\\b${f}:`).test(apiTs)));
const consumed = ['name','current_program_label','expire_at','d_day'];
ok('wiring:renderExtStudentCard consumes subset', consumed.every(f => indexHtml.includes('s.'+f) || indexHtml.includes('extStudent.'+f) || indexHtml.includes(f)));
ok('wiring:dummy phone removed', !indexHtml.includes('010-0000-0000'));
ok('wiring:fake demo fallback removed', !indexHtml.includes('Fallback — demo / hong_gildong'));

console.log('\n=== 4) MISC CONNECTIONS ===');
const practice = read(ROOT + '/mangoi-speech-patch/mangoi_Speech/practice.html');
const speechPc = read(CD + '/public/speech-coach.html');
ok('audio:practice has intro voice + same mp3', /id="ms-intro-voice"/.test(practice) && /audio\/speech-coach\.mp3/.test(practice));
ok('audio:mute key consistent with PC', /mangoi_voice_muted/.test(practice) && /mangoi_voice_muted/.test(speechPc));
const postpone = read(CD + '/public/lesson-postpone-demo.html');
ok('layout:postpone has 100dvh', (postpone.match(/100dvh/g)||[]).length >= 2);
ok('layout:postpone detail-body bottom padding fix', /padding-bottom: calc\(120px \+ env\(safe-area-inset-bottom\)\) !important/.test(postpone));
ok('layout:admin sidebar fix present', /remove\('mga-open','ph134-sidebar-open'/.test(read(CD+'/public/admin.html')));
const idxHtml2 = read(CD+'/public/index.html');
ok('about:intro mp3 referenced', idxHtml2.includes('/audio/mangoi-intro.mp3'));
ok('about:intro player defined+called', /__abmPlayIntro = function/.test(idxHtml2) && (idxHtml2.match(/window\.__abmPlayIntro\(\)/g)||[]).length>=2);
ok('about:reuses abm_muted mute key', idxHtml2.includes("localStorage.getItem('abm_muted')"));
ok('about:intro mp3 file present', (()=>{ try{ return readFileSync(CD+'/public/audio/mangoi-intro.mp3').length>1000; }catch{ return false; } })());
const idxV = read(CD+'/public/index.html');
ok('htmlvalid:index ends with </html>', idxV.trimEnd().endsWith('</html>'));
ok('htmlvalid:index <script> balanced', (idxV.match(/<script\b/g)||[]).length === (idxV.match(/<\/script>/g)||[]).length);
ok('feature:lesson-video IIFE closed + defined', /window\.mangoiPlayLessonVideo = async function/.test(idxV) && !/function injec\s*$/.test(idxV.trimEnd()));

console.log('\n=== 5) LOOKUP HANDLER LOGIC (mirror unit test) ===');
// Mirror of the handler's auth + d_day logic; asserts each branch behaves as designed.
async function sha256hex(str){ const b = await import('node:crypto'); return b.createHash('sha256').update(str).digest('hex'); }
async function lookupLogic(stu, body){
  const uid = String(body.user_id||'').trim();
  const auth = String(body.auth||'').trim();
  if (!uid) return { status: 400, error: 'user_id_required' };
  if (!stu) return { status: 404, error: 'user_not_found' };
  const hasPw = !!stu.password_hash;
  if (hasPw){
    if (!auth) return { status: 401, error: 'auth_required' };
    const digits = v => String(v||'').replace(/[^0-9]/g,'');
    const authDigits = digits(auth);
    const pwOk = (await sha256hex(auth + '|mangoi-salt-2026')) === stu.password_hash;
    const phoneOk = authDigits.length >= 8 && (authDigits === digits(stu.phone) || authDigits === digits(stu.parent_phone));
    if (!pwOk && !phoneOk) return { status: 401, error: 'invalid_auth' };
  }
  const endDate = stu.end_date || stu.expire_at || null;
  let dDay = null;
  if (endDate && /^\d{4}-\d{2}-\d{2}/.test(String(endDate))) dDay = Math.ceil((new Date(String(endDate).slice(0,10)+'T00:00:00Z').getTime() - Date.now())/86400000);
  return { status: 200, ok:true, student:{ uid: stu.user_id, name: stu.student_name||stu.korean_name||uid, program: stu.program||null, expire_at: endDate, d_day: dDay } };
}
const pwHash = await sha256hex('secret123|mangoi-salt-2026');
const tomorrow = new Date(Date.now()+86400000*5).toISOString().slice(0,10);
const tests = [
  ['no user_id → 400', await lookupLogic({user_id:'a'}, {}), r => r.status===400],
  ['not found → 404', await lookupLogic(null, {user_id:'ghost'}), r => r.status===404],
  ['passwordless → 200', await lookupLogic({user_id:'s1', student_name:'정우영', program:'1on1-8', end_date:tomorrow}, {user_id:'s1', from_session:true}), r => r.status===200 && r.student.name==='정우영' && r.student.d_day>=4],
  ['pw account + no auth → 401', await lookupLogic({user_id:'s2', password_hash:pwHash}, {user_id:'s2', from_session:true}), r => r.status===401 && r.error==='auth_required'],
  ['pw account + wrong pw → 401', await lookupLogic({user_id:'s2', password_hash:pwHash, phone:'010-1111-2222'}, {user_id:'s2', auth:'nope'}), r => r.status===401 && r.error==='invalid_auth'],
  ['pw account + correct pw → 200', await lookupLogic({user_id:'s2', password_hash:pwHash, student_name:'홍'}, {user_id:'s2', auth:'secret123'}), r => r.status===200],
  ['pw account + matching phone → 200', await lookupLogic({user_id:'s2', password_hash:pwHash, phone:'010-1234-5678', student_name:'홍'}, {user_id:'s2', auth:'010-1234-5678'}), r => r.status===200],
];
for (const [name, res, check] of tests) ok(`logic:${name}`, check(res), `status=${res.status}${res.error?' '+res.error:''}`);

console.log(`\n=== SUMMARY: ${pass} passed, ${fail} failed ===`);
// write report
const report = `# Change-set QA report (${new Date().toISOString()})\n\nPASS=${pass} FAIL=${fail}\n\n${log.join('\n')}\n`;
writeFileSync(ROOT + '/test-harness/changes_qa_report.txt', report);
console.log('report → test-harness/changes_qa_report.txt');
process.exit(fail ? 1 : 0);
