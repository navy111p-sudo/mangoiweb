// PW_DIR points to a playwright-core installation. CHROME_PATH can select a local Chrome.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadPlaywright, findChromium } from './_pw.mjs';

const pw = loadPlaywright();
const executablePath = process.env.CHROME_PATH || findChromium();
assert.ok(pw && executablePath, 'Set PW_DIR and CHROME_PATH to run the browser check');
const browser = await pw.chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ locale: 'ko-KR', viewport: { width: 390, height: 840 } });
  const site = 'https://handover.test';
  const day = '2026-11-07';
  const old = '2026-10-27';
  const pending = [41, 42].map(id => ({
    id, title: 'Old request ' + id, req_type: 'purchase', status: 'pending',
    requester_name: 'Karl', created_at: Date.parse(old + 'T08:00:00Z'),
    has_file: id === 41, file_kind: 'image', file_name: 'receipt.png',
  }));
  const decisions = [];
  let approvalFailed = false;
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhioAAAAASUVORK5CYII=', 'base64');
  await page.route(site + '/**', async route => {
    const { pathname, searchParams } = new URL(route.request().url());
    const json = (data, status = 200) => route.fulfill({ json: data, status });
    if (pathname === '/api/approval/home') {
      return json({ ok: true, inbox: pending, summary: { inbox_unavailable: approvalFailed } });
    }
    if (pathname === '/api/approval/requests/41/file') return route.fulfill({ body: pixel, contentType: 'image/png' });
    if (pathname === '/api/approval/requests/41') return json({ ok: true, item: { body: 'Full request text' } });
    const decide = pathname.match(/^\/api\/approval\/requests\/(\d+)\/decide$/);
    if (decide) {
      const id = Number(decide[1]);
      decisions.push({ id, ...route.request().postDataJSON() });
      pending.splice(pending.findIndex(row => row.id === id), 1);
      return json({ ok: true });
    }
    if (pathname === '/api/approval/handover/inbox') return json({
      ok: true, reader_mode: true, total: 1,
      reports: [{ id: 11, report_date: old, payload: { priority: 'normal' } }],
    });
    if (pathname === '/api/approval/handover/board') return json({
      ok: true, day: searchParams.get('date') || day, rows: [], totals: {},
    });
    if (pathname.startsWith('/api/')) return json({ ok: true, reports: [], feedback: [], members: [] });
    const file = pathname === '/work' ? '/work.html' : pathname;
    const contentType = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css' }[file.split('.').pop()];
    if (!contentType) return route.fulfill({ status: 404 });
    const body = await readFile(new URL('../../cloudflare-deploy/public' + file, import.meta.url));
    return route.fulfill({ body, contentType, headers: { 'content-security-policy': "frame-ancestors 'self'" } });
  });
  await page.goto(site + '/daily-handover.html?date=2026-11-05');
  await page.getByRole('heading', { name: '내가 처리할 일 / My tasks' }).waitFor();
  await page.getByText('매일보고 · 미응답 1건', { exact: true }).waitFor();
  const frame = page.frameLocator('.mh-work-frame');
  const count = frame.locator('#handover-approval-count');
  await count.filter({ hasText: '2건' }).waitFor();
  const first = frame.locator('#req-41');
  await frame.locator('.handover-request > summary').filter({ hasText: 'Old request 41' }).click();
  await first.getByText('신청 내용 보기').click();
  await first.getByText('Full request text').waitFor();
  await first.getByRole('link', { name: /첨부 보기/ }).click();
  await frame.locator('#attov.on .attbody img').waitFor();
  await frame.locator('#attX').click();
  await first.getByRole('button', { name: '승인', exact: true }).click();
  await count.filter({ hasText: '1건' }).waitFor();
  const second = frame.locator('#req-42');
  await frame.locator('.handover-request > summary').filter({ hasText: 'Old request 42' }).click();
  await second.getByRole('button', { name: '반려', exact: true }).click();
  await second.locator('.whybtns button').first().click();
  await count.filter({ hasText: '0건' }).waitFor();
  assert.deepEqual(decisions.map(({ id, decision }) => [id, decision]), [[41, 'approved'], [42, 'rejected']]);
  assert.ok(decisions[1].memo, 'Rejection reason reaches the existing endpoint');
  approvalFailed = true;
  await frame.getByRole('button', { name: '새로고침', exact: true }).click();
  await count.filter({ hasText: '상태 확인 실패' }).waitFor();
  approvalFailed = false;
  await frame.getByRole('button', { name: '새로고침', exact: true }).click();
  await count.filter({ hasText: '0건' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/daily-handover.html');
  console.log('PASS: report count, old approvals, full text, receipt, approve/reject, refresh failure and recovery');
} finally {
  await browser.close();
}
