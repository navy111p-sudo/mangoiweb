// 브라우저 검사 — 수강신청 등록 후 엑셀·워드 다운로드 «선택» (자동으로 안 돕니다, 사람이 부릅니다)
//   PW=/opt/node-tools/node_modules/playwright-core node test-harness/manual/enroll-export-optional-browser.mjs [반복횟수]
// 진짜 Chromium 에서 실제 «다운로드 이벤트» 를 센다. 서버(/api/**)는 스텁.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const PW = process.env.PW || '/opt/node-tools/node_modules/playwright-core';
const { chromium } = await import(PW + '/index.mjs');
const ROOT = new URL('../../cloudflare-deploy/public/', import.meta.url).pathname;
const N = Number(process.argv[2] || 1);
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  const ext = path.extname(f); s.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(s);
}).listen(0);
const port = srv.address().port;
// ⚠️ 컨테이너는 LANG 이 비어 있어 크로미움이 한글 파일 이름을 «download» 로 바꿔 준다(샌드박스 사정 — 2026-10-07 실측).
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ❌ FAIL ' + m)); };

async function round(remember) {
  const ctx = await b.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const dls = []; p.on('download', d => dls.push(d.suggestedFilename()));
  await p.addInitScript(r => { try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); if (r !== null) localStorage.setItem('mangoi_en_export_files', r); } catch (e) {} }, remember);
  await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
  await p.goto(`http://127.0.0.1:${port}/admin.html?_nc=${Date.now()}`);
  await p.waitForFunction(() => typeof window._enDl === 'function' && document.getElementById('en-export-files'), null, { timeout: 20000 });
  const st = await p.evaluate(() => {
    const cb = document.getElementById('en-export-files');
    let n = cb; while (n) { if (n.tagName === 'DETAILS') n.open = true; n = n.parentElement; }
    try { jumpToMenu(cb.closest('[id^="card-"]').id); } catch (e) {}
    return { checked: cb.checked };
  });
  return { ctx, p, dls, errs, st };
}
async function doExport(p, kind) {
  await p.evaluate(k => {
    if (k === 'bulk') autoExportBulkEnrollment([{ student_name: '홍길동', student_user_id: 'u1', _types_ko: ['정규'], _days_ko: ['월'], package: 'P' }, { student_name: '김철수', student_user_id: 'u2' }]);
    else autoExportEnrollment({ id: 9, student_name: '홍길동', student_user_id: 'u1', types_ko: '정규', package: 'P', started_at: '2026-10-07', created_at: 'x' });
  }, kind);
  await p.waitForTimeout(900);
}

for (let i = 1; i <= N; i++) {
  for (const kind of ['bulk', 'single']) {
    // A. 기본(기억값 없음) = 꺼짐 → 다운로드 0, 버튼 노출, 버튼 클릭 → 2건
    let r = await round(null);
    ok(r.st.checked === false, `[${i}/${kind}] 기본 꺼짐`);
    await doExport(r.p, kind);
    ok(r.dls.length === 0, `[${i}/${kind}] 꺼짐 → 자동 다운로드 0 (실제 ${r.dls.length})`);
    const vis = await r.p.evaluate(() => { const b = document.getElementById('en-export-later'); return { d: getComputedStyle(b).display, t: b.textContent }; });
    ok(vis.d !== 'none' && /\(2\)/.test(vis.t), `[${i}/${kind}] 받기 버튼 보임 (${vis.d} ${vis.t})`);
    await r.p.click('#en-export-later'); await r.p.waitForTimeout(1500);
    ok(r.dls.length === 2 && r.dls.some(n => n.endsWith('.csv')) && r.dls.some(n => n.endsWith('.doc')), `[${i}/${kind}] 버튼 클릭 → CSV·Word 2건 (실제 ${r.dls.join(',')})`);
    // B. 체크 → 기억 → 새로고침해도 켜짐 → 바로 2건
    await r.p.check('#en-export-files');
    const saved = await r.p.evaluate(() => localStorage.getItem('mangoi_en_export_files'));
    ok(saved === '1', `[${i}/${kind}] 체크하면 기억됨`);
    ok(r.errs.length === 0, `[${i}/${kind}] 페이지 오류 없음 ${r.errs.join('|')}`);
    await r.ctx.close();
    r = await round('1');
    ok(r.st.checked === true, `[${i}/${kind}] 기억값 1 → 켜진 채 시작`);
    await doExport(r.p, kind);
    ok(r.dls.length === 2 && r.dls.some(n => n.endsWith('.csv')) && r.dls.some(n => n.endsWith('.doc')), `[${i}/${kind}] 켜짐 → 바로 CSV·Word 2건 (실제 ${r.dls.join(',')})`);
    const hid = await r.p.evaluate(() => getComputedStyle(document.getElementById('en-export-later')).display);
    ok(hid === 'none', `[${i}/${kind}] 켜짐 → 받기 버튼 숨김`);
    await r.ctx.close();
  }
}
await b.close(); srv.close();
console.log(`결과: PASS ${pass} / FAIL ${fail} (반복 ${N}회)`);
process.exit(fail ? 1 : 0);
