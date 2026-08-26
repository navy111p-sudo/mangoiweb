/**
 * 📢 관리자 「수업 관찰」 화면의 귓속말 — 진짜 브라우저로 확인 (2026-08-26)
 * ---------------------------------------------------------------------------
 * 왜 손으로 만들었나
 *   문자열 하니스(whisper_delivery_harness ⑪)는 «그 줄이 있는가» 만 본다. 이 화면에서
 *   실제로 틀릴 수 있는 것은 전부 «눌렀을 때 무엇이 나가고 무엇이 보이나» 다 —
 *     · 학생을 골랐는데 강사에게 가는가 (오배달 — 이 기능에서 제일 나쁜 실패)
 *     · 아무도 안 받았는데 화면이 「전송 완료」라고 하는가 («보낸 척»)
 *     · 라우팅 관문이 빠져 404 가 왔는데 «성공» 으로 그리는가
 *       (종단 404 본문에는 ok 칸이 없어 d.ok === false 검사를 그냥 통과한다)
 *     · 5초 새로고침이 «고른 대상» 을 강사 전원으로 되돌리는가
 *     · 어두운 상자 위의 결과 글자가 실제로 읽히는가 (WCAG 대비)
 *
 * ⚠️ file:// 로 열면 안 된다 — <script src="/js/…"> 가 전부 404 가 된다(CLAUDE.md 2장).
 * ⚠️ 서버에는 아무것도 묻지 않는다 — fetch 를 가짜로 물려 응답을 만든다.
 *    개발·운영이 같은 D1 이라 검사가 실제 귓속말을 보내면 안 된다.
 *
 * ⏳ manual/ 규약상 자동으로 안 돈다. ghost-view 의 귓속말·참가자 목록,
 *    /api/admin/whisper/send, DO 의 /whisper 를 건드리면 사람이 불러야 한다:
 *   PW_DIR=/tmp/pw node test-harness/manual/ghostview-whisper-browser.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8938;
const ROOM = 'class-939-20260826';

let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
  if (cond) { pass++; console.log('  ✅ ' + label + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  ❌ ' + label + (detail ? ' — ' + detail : '')); }
};

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
                  { cwd: PUB, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));

const { chromium, exe } = requireBrowser();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

try {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 950 });
  page.on('dialog', async d => { try { await d.dismiss(); } catch (_) {} });

  /* 서버를 통째로 가짜로 문다. whisper/send 응답은 검사마다 바꿔 끼운다. */
  await page.addInitScript(({ room }) => {
    window.__sent = [];
    window.__whisperReply = { ok: true, delivered: 1, note: 'delaware 님 화면에 전달했습니다.', directed: true };
    const real = window.fetch;
    window.fetch = async (u, o) => {
      const url = String(u);
      const J = (obj, status) => new Response(JSON.stringify(obj),
        { status: status || 200, headers: { 'Content-Type': 'application/json' } });
      if (url.indexOf('/api/admin/room-attendance') === 0) {
        return J({ ok: true, items: [
          { user_id: 'u_teach1', username: '교사 Teacher - Hannah', role: 'teacher', joined_at: Date.now() - 600000 },
          { user_id: 'u_stu9',   username: 'delaware',              role: 'student', joined_at: Date.now() - 300000 },
        ] });
      }
      if (url.indexOf('/api/admin/whisper/send') === 0) {
        try { window.__sent.push(JSON.parse(o.body)); } catch (e) { window.__sent.push({ parseError: true }); }
        const rep = window.__whisperReply;
        return J(rep.__body || rep, rep.__status || 200);
      }
      if (url.indexOf('/api/admin/') === 0 || url.indexOf('/api/') === 0) return J({ ok: true, items: [], rows: [] });
      return real(u, o);
    };
    try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) {}
  }, { room: ROOM });

  await page.goto(`http://127.0.0.1:${PORT}/admin/ghost-view.html?room_id=${encodeURIComponent(ROOM)}`,
                  { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#ghd-whisper-to', { state: 'attached', timeout: 30000 });
  await page.waitForFunction(
    () => document.querySelectorAll('#ghd-whisper-to option').length > 1, null, { timeout: 30000 });

  // ── ① 받는 사람 고르는 칸 ──
  console.log('\n① 받는 사람을 고를 수 있는가');
  const picker = await page.evaluate(() => ({
    opts: [...document.querySelectorAll('#ghd-whisper-to option')].map(o => ({ v: o.value, t: o.textContent.trim() })),
    cur: document.getElementById('ghd-whisper-to').value,
    memberBtns: [...document.querySelectorAll('#ghd-members .member-card')].map(c => ({
      name: (c.querySelector('.name') || {}).textContent || '',
      btns: [...c.querySelectorAll('.member-quick button')].map(b => b.textContent.trim()),
    })),
  }));
  ok('기본값이 «강사 전원» 이다', picker.cur === '' && /강사 전원/.test(picker.opts[0].t), picker.opts[0].t);
  ok('강사와 학생이 모두 목록에 있다',
     picker.opts.some(o => o.v === 'u_teach1') && picker.opts.some(o => o.v === 'u_stu9'),
     picker.opts.map(o => o.t).join(' | '));
  const stuCard = picker.memberBtns.find(c => /delaware/.test(c.name));
  ok('학생 카드에도 «📢 귓속말» 버튼이 생겼다',
     !!stuCard && stuCard.btns.some(b => /귓속말/.test(b)), stuCard ? stuCard.btns.join(' | ') : '(학생 카드 없음)');
  ok('학생 카드의 «🚫 퇴장» 은 그대로 남아 있다',
     !!stuCard && stuCard.btns.some(b => /퇴장/.test(b)), stuCard ? stuCard.btns.join(' | ') : '');

  // ── ② 학생을 골라 보내면 학생에게 간다 ──
  console.log('\n② 학생을 골라 보내면 «그 학생» 으로 나간다');
  const toStudent = await page.evaluate(async () => {
    window.__sent.length = 0;
    /* ⚠️ «첫 버튼» 을 누르면 안 된다 — 카드의 1번은 «📊 상세» 다.
       글자로 골라야 버튼 순서가 바뀌어도 이 검사가 계속 맞는 것을 잰다. */
    [...document.querySelectorAll('#ghd-members .member-card')]
      .find(c => /delaware/.test(c.textContent))
      .querySelector('.member-quick button:nth-child(2)').click();   // 📢 귓속말
    const picked = document.getElementById('ghd-whisper-to').value;
    document.getElementById('ghd-whisper-text').value = '소리가 안 들리면 마이크를 확인해 주세요';
    document.querySelector('.whisper-box .row button').click();
    await new Promise(r => setTimeout(r, 400));
    return {
      picked,
      sent: window.__sent[0] || null,
      note: (document.getElementById('ghd-whisper-note') || {}).textContent || '',
      left: document.getElementById('ghd-whisper-text').value,
    };
  });
  ok('버튼을 누르면 그 사람이 대상으로 잡힌다', toStudent.picked === 'u_stu9', toStudent.picked);
  ok('대상 번호를 실어 보낸다', toStudent.sent && toStudent.sent.target_uid === 'u_stu9', JSON.stringify(toStudent.sent));
  ok('대상 이름도 함께 보낸다 (번호는 재접속하면 죽는다)',
     toStudent.sent && toStudent.sent.target_name === 'delaware', toStudent.sent && toStudent.sent.target_name);
  ok('역할을 student 로 보낸다', toStudent.sent && toStudent.sent.target_role === 'student', toStudent.sent && toStudent.sent.target_role);
  ok('강사 전원용 teacher_uid 는 싣지 않는다', toStudent.sent && !toStudent.sent.teacher_uid,
     JSON.stringify(toStudent.sent && toStudent.sent.teacher_uid));
  ok('전달되면 입력칸을 비운다', toStudent.left === '', JSON.stringify(toStudent.left));
  ok('서버가 준 이유를 화면에 남긴다', /전달했습니다/.test(toStudent.note), toStudent.note);

  // ── ③ 아무도 못 받았을 때 «보낸 척» 하지 않는가 ──
  console.log('\n③ 아무도 못 받았으면 «보낸 척» 하지 않는가');
  const notDelivered = await page.evaluate(async () => {
    window.__sent.length = 0;
    window.__whisperReply = { ok: true, delivered: 0, directed: true, resolved_by: 'not_found',
      note: 'delaware 님이 지금 그 방에 접속해 있지 않아 전달되지 않았습니다(기록은 남았습니다).' };
    document.getElementById('ghd-whisper-text').value = '안 갈 메시지';
    document.querySelector('.whisper-box .row button').click();
    await new Promise(r => setTimeout(r, 400));
    const el = document.getElementById('ghd-whisper-note');
    return { note: el.textContent, cls: el.className, left: document.getElementById('ghd-whisper-text').value };
  });
  ok('«전달되지 않았다» 고 말한다', /전달되지 않았습니다/.test(notDelivered.note), notDelivered.note);
  ok('경고 색으로 그린다', /bad/.test(notDelivered.cls), notDelivered.cls);
  ok('입력칸을 비우지 않는다 (다시 보낼 수 있게)', notDelivered.left === '안 갈 메시지', notDelivered.left);

  // ── ④ 라우팅 관문이 빠져 404 가 왔을 때 ──
  console.log('\n④ 404 를 «성공» 으로 그리지 않는가');
  const notFound = await page.evaluate(async () => {
    /* 종단 404 본문은 {error:'Not Found', path} — ok 칸이 «아예 없다».
       d.ok === false 검사는 undefined 를 통과시켜 «보냈다» 로 그려진다(CLAUDE.md 2장). */
    window.__whisperReply = { __status: 404, __body: { error: 'Not Found', path: '/api/admin/whisper/send' } };
    document.getElementById('ghd-whisper-text').value = '관문이 빠졌을 때';
    document.querySelector('.whisper-box .row button').click();
    await new Promise(r => setTimeout(r, 400));
    const el = document.getElementById('ghd-whisper-note');
    return { note: el.textContent, cls: el.className };
  });
  ok('«전송 실패» 라고 말한다', /실패/.test(notFound.note), notFound.note);
  ok('경고 색으로 그린다', /bad/.test(notFound.cls), notFound.cls);

  // ── ⑤ 5초 새로고침이 고른 대상을 되돌리지 않는가 ──
  console.log('\n⑤ 목록이 갱신돼도 고른 대상을 잃지 않는가');
  const kept = await page.evaluate(async () => {
    document.getElementById('ghd-whisper-to').value = 'u_stu9';
    window.ghdFillWhisperTargets([                        // 새로고침 한 번(순서까지 바뀐 상태)
      { user_id: 'u_stu9',   username: 'delaware',              role: 'student' },
      { user_id: 'u_teach1', username: '교사 Teacher - Hannah', role: 'teacher' },
    ]);
    const still = document.getElementById('ghd-whisper-to').value;
    window.ghdFillWhisperTargets([                        // 그 학생이 방을 나간 뒤
      { user_id: 'u_teach1', username: '교사 Teacher - Hannah', role: 'teacher' },
    ]);
    return { still, afterLeave: document.getElementById('ghd-whisper-to').value };
  });
  ok('갱신 뒤에도 고른 학생이 그대로다', kept.still === 'u_stu9', kept.still);
  ok('그 사람이 나가면 «강사 전원» 으로 안전하게 돌아온다', kept.afterLeave === '', kept.afterLeave);

  // ── ⑥ 어두운 상자 위 글자가 실제로 읽히는가 (WCAG) ──
  console.log('\n⑥ 결과 글자가 실제로 읽히는가 (WCAG 대비)');
  const contrast = await page.evaluate(() => {
    const lum = (c) => {
      const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const rgb = (s) => (s.match(/\d+/g) || []).slice(0, 3).map(Number);
    /* 배경은 backgroundColor 하나로 알 수 없다 — 조상을 타고 올라가야 한다.
       ⚠️ 그런데 «불투명한 첫 조상» 을 답으로 쓰면 틀린다. 이 화면의 귓속말 상자는
          rgba(245,158,11,0.1) 이라 그대로 읽으면 «밝은 주황» 이 되어, 실제로는 어두운
          남색 위에 얹힌 글자가 «안 읽힌다» 는 거짓 실패를 낸다(2026-08-26 실제로 밟음).
          반투명 층을 만나면 «쌓아 두었다가» 아래에서 위로 합성해야 한다. */
    const bgOf = (el) => {
      const layers = [];
      let n = el;
      while (n) {
        const c = getComputedStyle(n).backgroundColor;
        const p = (c.match(/[\d.]+/g) || []).map(Number);
        if (p.length >= 3) {
          const a = p.length > 3 ? p[3] : 1;
          if (a > 0) { layers.push([p[0], p[1], p[2], a]); if (a >= 1) break; }
        }
        n = n.parentElement;
      }
      let base = [255, 255, 255];                 // 아무것도 못 찾으면 흰 종이
      for (let i = layers.length - 1; i >= 0; i--) {
        const [r, g, b, a] = layers[i];
        base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
      }
      return base;
    };
    const ratio = (el) => {
      const f = lum(rgb(getComputedStyle(el).color)), b = lum(bgOf(el));
      return Math.round(((Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05)) * 100) / 100;
    };
    const note = document.getElementById('ghd-whisper-note');
    const out = {};
    note.className = 'wb-note ok'; note.textContent = '전달했습니다';
    out.okRatio = ratio(note);
    note.className = 'wb-note bad'; note.textContent = '전달되지 않았습니다';
    out.badRatio = ratio(note);
    const sel = document.getElementById('ghd-whisper-to');
    out.selRatio = ratio(sel);
    const r = sel.getBoundingClientRect(), box = sel.parentElement.getBoundingClientRect();
    out.selOverflow = Math.round(r.right - box.right);
    out.docOverflow = document.documentElement.scrollWidth - window.innerWidth;
    return out;
  });
  ok('전달 성공 글자가 읽힌다 (≥4.5)', contrast.okRatio >= 4.5, contrast.okRatio + ':1');
  ok('전달 실패 글자가 읽힌다 (≥4.5)', contrast.badRatio >= 4.5, contrast.badRatio + ':1');
  ok('받는 사람 칸 글자가 읽힌다 (≥4.5)', contrast.selRatio >= 4.5, contrast.selRatio + ':1');
  ok('받는 사람 칸이 상자를 넘지 않는다', contrast.selOverflow <= 0, contrast.selOverflow + 'px');
  ok('문서가 가로로 밀리지 않는다', contrast.docOverflow <= 0, contrast.docOverflow + 'px');

  console.log(`\n───────────────────────────────\n  통과 ${pass} · 실패 ${fail}\n───────────────────────────────`);
} finally {
  await browser.close();
  try { srv.kill(); } catch (_) {}
}
process.exit(fail ? 1 : 0);
