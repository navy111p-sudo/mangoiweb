// 사용법: cd cloudflare-deploy/public && python3 -m http.server 8977  (다른 터미널)
//        node docs/자료실_원본/학생등록_수업예약/capture.mjs <캡처폴더>   → build.mjs <캡처폴더> <출력폴더>
// 학생 등록·수업 예약 안내서 캡처 — 로컬 public/ 을 그대로 띄우고 API 는 가짜(시험용) 데이터로 대신한다.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const req = createRequire('/opt/node22/lib/node_modules/playwright/package.json');
const { chromium } = req('playwright');
const BASE = 'http://127.0.0.1:8977';
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });

const UID = 'emma2026', NAME = 'Emma Kim';
const TEACHERS = [
  { id: 901, name: 'Teacher Anna', active: 1, workplace: 'home' },
  { id: 902, name: 'Teacher Ben', active: 1, workplace: 'office' },
  { id: 903, name: 'Teacher Clara', active: 1, workplace: 'home' },
];
const LANGS = (process.env.LANGS || 'en,ko').split(',');

function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const today = new Date();
const startMon = new Date(today); startMon.setDate(today.getDate() + ((8 - today.getDay()) % 7 || 7)); // 다음 월요일

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

async function ctxFor(lang, state) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript((lang) => {
    try {
      localStorage.setItem('mangoi_admin_welcome_v1_done', '1');
      localStorage.setItem('mangoi_admin_session', JSON.stringify({ uid: 'admin', username: 'admin', role: 'admin', nationality: '' }));
      localStorage.setItem('mangoi_lang', lang); localStorage.setItem('mangoi_lang_by', 'user'); localStorage.setItem('mangoi_lang_uid', 'admin');
      localStorage.setItem('mangoi_admin_lang', lang); localStorage.setItem('mangoi_admin_manual_closed_v1:admin', new Date(Date.now()+9*3600000).toISOString().slice(0,10));
    } catch (e) {}
  }, lang);
  await ctx.route('**/api/**', async r => {
    const u = r.request().url(); const m = r.request().method();
    const J = (o, s) => r.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.includes('/api/admin/me')) return J({ ok: true, user: { username: 'admin', name: 'Admin' }, role: 'hq', roleLabel: 'HQ', scope: { type: 'hq', label: 'HQ' } });
    if (u.includes('/api/admin/students/create')) return J({ ok: true, user_id: UID, temp_password: 'mango4821' });
    if (u.includes('/api/admin/students/unified') || u.includes('/api/admin/students/erp-list')) {
      return J({ ok: true, students: state.created ? [{ user_id: UID, name: NAME, status: '정상', shop_name: 'Sample Academy', signup_date: ymd(today), created_at: Date.now(), sessions: 0, track: 'video_ai' }] : [] , items: [] });
    }
    if (u.includes('/api/admin/teachers')) return J({ ok: true, items: TEACHERS, teachers: TEACHERS });
    if (u.includes(`/api/admin/student/${UID}/full`)) {
      return J({ ok: true, erp: { user_id: UID, student_id: UID, login_id: UID, username: NAME, korean_name: NAME, status: '정상', shop_name: 'Sample Academy', created_at: Date.now(), signup_date: ymd(today) }, profile: {}, summary: {}, sessions: [], payments: [], enrollments: [], by_day: [], evaluations: [], feedbacks: [], consultations: [], textbooks: [], rewards: [], recordings: [], hidden_info: null });
    }
    if (u.includes('/api/admin/class-schedules') && m === 'POST') {
      state.booked = true;
      return J({ ok: true, created: [{ id: 5001 }, { id: 5002 }] });
    }
    if (u.includes('/api/admin/class-schedules')) {
      const base = { user_id: UID, student_name: NAME, class_type: 'regular', schedule_kind: 'recurring', duration_min: 20, start_time: '19:30', teacher_id: 901, teacher_name: 'Teacher Anna', status: 'active', scheduled_date: null, starts_on: ymd(startMon), source: 'admin_ui', created_at: Date.now() };
      const items = state.booked ? [Object.assign({}, base, { id: 5001, day_of_week: '1' }), Object.assign({}, base, { id: 5002, day_of_week: '3' })] : [];
      return J({ ok: true, count: items.length, items });
    }
    return J({ ok: true, items: [] });
  });
  return ctx;
}

async function hideNoise(page) {
  await page.addStyleTag({ content: '#adm-identity-status,.adm-identity-banner,[id*="identity-status"]{display:none!important} #mangoi-widget,#mangoi-toggle{display:none!important}' }).catch(() => {});
}
async function mark(page, sel, pad = 6) {
  await page.evaluate(([sel, pad]) => {
    const el = document.querySelector(sel); if (!el) return;
    const r = el.getBoundingClientRect();
    const b = document.createElement('div'); b.className = '__mark';
    b.style.cssText = `position:fixed;left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;border:4px solid #e11d48;border-radius:12px;z-index:2147483647;pointer-events:none;box-shadow:0 0 0 4px rgba(225,29,72,.18)`;
    document.documentElement.appendChild(b);
  }, [sel, pad]);
}
const unmark = page => page.evaluate(() => document.querySelectorAll('.__mark').forEach(e => e.remove()));
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82 });

for (const lang of LANGS) {
  const state = { created: false, booked: false };
  const ctx = await ctxFor(lang, state);
  const page = await ctx.newPage();
  await page.goto(BASE + '/admin.html?_nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.jumpToMenu === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  await hideNoise(page);
  // ① 사이드바 «학생» → 학생관리 카드 → ➕ 학생 등록 버튼
  await page.evaluate(() => { window.jumpToMenu('card-students-mgmt'); const d = document.getElementById('card-students-mgmt'); if (d) d.open = true; });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const b = document.getElementById('sm-add-student'); let d=b; while(d){ if(d.tagName==='DETAILS') d.open=true; d=d.parentElement; } b && b.scrollIntoView({ block: 'center' }); });
  await page.waitForTimeout(500);
  await mark(page, '#sm-add-student');
  await shot(page, `${lang}-01-add-button`);
  await unmark(page);
  // ② 모달 열고 채우기
  await page.evaluate(() => window.smOpenRegisterModal());
  await page.waitForTimeout(400);
  await page.fill('#sm-reg-uid', UID);
  await page.fill('#sm-reg-name', NAME);
  await page.fill('#sm-reg-phone', '010-1234-5678');
  await page.fill('#sm-reg-parent-phone', '010-8765-4321');
  await page.fill('#sm-reg-shop', 'Sample Academy');
  await page.fill('#sm-reg-notes', lang === 'en' ? 'Trial class' : '체험 수업');
  await mark(page, '#sm-reg-submit', 4);
  await shot(page, `${lang}-02-form`);
  await unmark(page);
  // ③ 등록 → 완료 + 비밀번호 표시
  state.created = true;
  await page.click('#sm-reg-submit');
  await page.waitForTimeout(900);
  await mark(page, '#sm-reg-msg', 4);
  await shot(page, `${lang}-03-created`);
  await unmark(page);
  await page.evaluate(() => window.smCloseRegisterModal());
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const a = document.querySelector('a[href*="uid=emma2026&tab=schedule"]'); if (a) { const tr = a.closest('tr'); if (tr) tr.id='__row'; a.id='__detail'; tr ? tr.scrollIntoView({block:'center'}) : a.scrollIntoView({block:'center'}); } });
  await page.waitForTimeout(400);
  await mark(page, '#__detail', 5);
  await shot(page, `${lang}-03b-list-row`);
  await unmark(page);
  await ctx.close();

  // ④ 학생 상세 → 📅 스케줄 탭
  const ctx2 = await ctxFor(lang, state);
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + `/admin/student.html?uid=${UID}&lang=${lang}&_nc=` + Date.now(), { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(2500);
  await hideNoise(p2);
  await mark(p2, '.tab[data-tab="schedule"]', 4);
  await p2.screenshot({ path: `${OUT}/${lang}-04-schedule-tab.jpg`, type: 'jpeg', quality: 82 });
  await unmark(p2);
  await p2.click('.tab[data-tab="schedule"]');
  await p2.waitForTimeout(1500);
  // ⑤ 수업 예약 등록 폼 채우기
  await p2.evaluate(() => { const el = document.getElementById('ns-add'); el && el.scrollIntoView({ block: 'center' }); });
  await p2.selectOption('#ns-kind', 'regular');
  await p2.evaluate(() => { document.querySelectorAll('.ns-day').forEach(c => { c.checked = (c.value === '1' || c.value === '3'); c.dispatchEvent(new Event('change', { bubbles: true })); }); });
  await p2.fill('#ns-start', ymd(startMon));
  await p2.fill('#ns-time', '19:30');
  await p2.fill('#ns-dur', '20');
  await p2.waitForTimeout(500);
  try { await p2.selectOption('#ns-teacher-sel', '901'); } catch (e) { console.log('teacher select fail', e.message); }
  await p2.evaluate(() => { const el = document.getElementById('ns-kind'); const box = el && el.closest('div[style*="border-top"]'); if (box) box.id = '__nsbox'; });
  await mark(p2, '#__nsbox', 6);
  await p2.screenshot({ path: `${OUT}/${lang}-05-add-class.jpg`, type: 'jpeg', quality: 82 });
  await unmark(p2);
  // ⑥ 등록 → 성공 + 목록·캘린더
  await p2.click('#ns-add');
  await p2.waitForTimeout(1800);
  await mark(p2, '#ns-msg', 4);
  await p2.screenshot({ path: `${OUT}/${lang}-06-added.jpg`, type: 'jpeg', quality: 82 });
  await unmark(p2);
  await p2.evaluate(() => { const el = document.getElementById('aiSchedulesList'); el && el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -120); });
  await p2.waitForTimeout(800);
  await p2.screenshot({ path: `${OUT}/${lang}-07-list.jpg`, type: 'jpeg', quality: 82 });
  await ctx2.close();
  console.log('done', lang);
}
await browser.close();
