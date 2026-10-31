/* 수업화면 «한 장 안내» 그림 생성기 (2026-09-24)
 * ─────────────────────────────────────────────────────────────────────────────
 * 실제 수업 화면(public/index.html, PC 1280×800)을 크로미움으로 띄워 찍고,
 * 버튼마다 번호를 달고, 오른쪽에 번호 설명을 붙여 한 장짜리 그림을 만든다.
 *   선생님용 = 영어(기본) + 한국어 / 학생용 = 한국어(기본) + 영어
 *   얼굴: 선생님 = /img/lily-wide.webp(서양인), 학생 = /img/mei-closed.webp(동양인)
 *
 * 쓰는 법:
 *   cd cloudflare-deploy/public && python3 -m http.server 8947 &
 *   NODE_PATH=$(npm root -g) node docs/수업화면_사용법그림_소스/build.mjs
 *   → cloudflare-deploy/public/img/vc-guide/{teacher,student}-{en,ko}.webp
 *
 * ⚠️ 버튼 위치는 «그 순간의 실제 화면» 에서 잰다(좌표를 손으로 적지 않는다) —
 *    화면이 바뀌면 이 스크립트를 다시 돌리면 번호가 따라간다.
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const pw = require(process.env.NODE_PATH ? process.env.NODE_PATH + '/playwright' : 'playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8947';
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../cloudflare-deploy/public/img/vc-guide');
fs.mkdirSync(OUT, { recursive: true });

/* ── 항목 정의: 선택자 · 구역 · 아이콘 · 제목/설명(ko/en) · 역할 ──
   role: 'both' | 'teacher' | 'student'. 화면에 실제로 없으면 저절로 빠진다. */
const ITEMS = [
  // ① 맨 위 줄
  { sec: 1, sel: '#vc-btn-resync', ic: '🔄', ko: ['영상 재연결', '화면·소리만 다시 연결해요'], en: ['Reconnect', 'Reconnects video & sound only'] },
  { sec: 1, sel: '#mango-rec-badge', ic: '⏺️', ko: ['녹화 상태', '수업 녹화 여부를 보여줘요'], en: ['Recording', 'Shows whether class is recorded'] },
  { sec: 1, find: 'timer', ic: '⏰', ko: ['수업 시간', '수업이 몇 분 지났는지'], en: ['Class timer', 'How long the class has run'] },
  { sec: 1, sel: '#vc-meet-btn', ic: '🚪', ko: ['회의방', '방 번호로 따로 만나는 회의방'], en: ['Meeting room', 'Meet in a separate room by number'] },
  { sec: 1, sel: '#vc-guide-btn', ic: '❓', ko: ['사용법', '이 안내를 다시 열어요'], en: ['How-to', 'Opens this guide again'] },
  { sec: 1, find: 'lang', ic: '🌐', ko: ['EN / 한', '화면 글자를 영어·한국어로'], en: ['EN / KO', 'Switch screen language'] },
  { sec: 1, sel: '#vc-btn-lite', ic: '🪶', ko: ['가벼운 모드', '화면 효과를 줄여 가볍게'], en: ['Lite mode', 'Fewer effects, lighter screen'] },
  { sec: 1, sel: '#mango-theme-toggle', ic: '☀️', ko: ['라이트 / 다크', '화면을 밝게 / 어둡게'], en: ['Light / Dark', 'Brighter or darker screen'] },
  // ② 수업 메뉴
  { sec: 2, tab: 0, ic: '📖', ko: ['교재', '교재 화면으로 돌아와요'], en: ['Textbook', 'Back to the textbook'] },
  { sec: 2, tab: 1, ic: '🖊️', ko: ['칠판', '빈 칠판에 함께 쓰고 그려요'], en: ['Whiteboard', 'Write and draw together'] },
  { sec: 2, tab: 2, ic: '📹', ko: ['동영상', '영상을 같이 봐요'], en: ['Video', 'Watch a video together'] },
  { sec: 2, tab: 3, ic: '🎮', ko: ['학생게임', '영어 게임을 해요'], en: ['Games', 'Play English games'] },
  { sec: 2, tab: 4, ic: '🎨', ko: ['배경화면', '내 뒤 배경을 바꿔요'], en: ['Background', 'Change your background'] },
  { sec: 2, tab: 5, ic: '🗣️', ko: ['A.i 말하기 연습', 'AI 친구와 영어로 말해요'], en: ['AI speaking', 'Talk with an AI friend'] },
  { sec: 2, tab: 6, ic: '🧠', ko: ['복습퀴즈', '오늘 배운 것을 퀴즈로'], en: ['Review quiz', 'Quiz on today’s lesson'] },
  { sec: 2, chip: 0, ic: '📚', ko: ['교재도구', '펜·포인터·페이지 넘기기'], en: ['Textbook tools', 'Pen, pointer, page turn'] },
  { sec: 2, chip: 1, role: 'teacher', ic: '✍️', ko: ['필기도구', '필기 잠금·지우개 등'], en: ['Writing tools', 'Lock pens, eraser, etc.'] },
  // ③ 얼굴 칸
  { sec: 3, sel: '#vc-size-bar', ic: '🔲', ko: ['화면 크기 4개', '교재 크게·기본·얼굴 크게·모두 보기'], en: ['4 layouts', 'Book · Default · Face · All'] },
  { sec: 3, sel: '#vc-size-more', ic: '⋯', ko: ['더 보기', '얼굴 띄우기·자유 크기'], en: ['More', 'Float face, free size'] },
  { sec: 3, sel: '#vc-praise-roster', role: 'teacher', ic: '⭐', ko: ['칭찬 주기', '고른 학생에게 별 포인트'], en: ['Give praise', 'Send star points to a student'] },
  { sec: 3, sel: '.vc-star-btn', role: 'teacher', ic: '🌟', ko: ['얼굴 위 칭찬', '학생 얼굴에서 바로 칭찬'], en: ['Praise on tile', 'Praise right on the tile'] },
  { sec: 3, sel: '.vc-dm-btn', role: 'teacher', ic: '🔒', ko: ['이 학생에게만', '1:1 비밀 채팅'], en: ['Private chat', '1:1 message to this student'] },
  { sec: 3, sel: '.vc-devhelp-btn', role: 'teacher', ic: '🎛️', ko: ['장치 도우미', '학생 마이크·카메라를 원격으로 고쳐요'], en: ['Device helper', 'Fix a student’s mic/cam remotely'] },
  { sec: 3, sel: '#vc-video-peer1', ic: '🙂', ko: { teacher: ['학생 얼굴', '학생이 여기에 보여요'], student: ['선생님 얼굴', '선생님이 크게 보여요'] }, en: { teacher: ['Student', 'Your student appears here'], student: ['Teacher', 'Your teacher, shown large'] } },
  { sec: 3, sel: '#vc-local-box', ic: '🪞', ko: ['내 얼굴 (나)', '내 모습이 보여요'], en: ['You (Me)', 'Your own camera'] },
  { sec: 3, sel: '#vc-basket-float', role: 'student', ic: '🧺', ko: ['포인트 바구니', '칭찬 받은 별이 쌓여요'], en: ['Point basket', 'Your praise stars pile up'] },
  // ④ 아래 버튼 줄
  { sec: 4, sel: '#vc-dock-mic', ic: '🎤', ko: ['마이크', '내 목소리 켜기 / 끄기'], en: ['Mic', 'Voice on / off'] },
  { sec: 4, sel: '#vc-dock-cam', ic: '📷', ko: ['카메라', '내 얼굴 켜기 / 끄기'], en: ['Camera', 'Video on / off'] },
  { sec: 4, sel: '#vc-dock-share', ic: '🖥️', ko: ['화면공유', '내 컴퓨터 화면을 보여줘요'], en: ['Share screen', 'Show your computer screen'] },
  { sec: 4, sel: '#vc-dock-chat', ic: '💬', ko: ['채팅', '글로 이야기해요'], en: ['Chat', 'Type messages'] },
  { sec: 4, sel: '#vc-dock-consult', ic: '🙋', ko: ['상담', '망고아이 상담 채널(카카오톡)'], en: ['Help desk', 'Mangoi support (KakaoTalk)'] },
  { sec: 4, sel: '#vc-dock-settings', ic: '⚙️', ko: ['설정', '마이크·카메라·화질 바꾸기'], en: ['Settings', 'Mic, camera, quality'] },
  { sec: 4, sel: '#vc-dock-leave', ic: '🚪', ko: { teacher: ['나가기', '수업을 끝내고 나가요'], student: ['나가기', '수업 끝! 별점 → 복습퀴즈'] }, en: { teacher: ['Leave', 'End the class and leave'], student: ['Leave', 'Class over! Rating → quiz'] } },
  { sec: 4, sel: '#vc-dock-handle', ic: '🔽', ko: ['메뉴 숨기기', '아래 버튼 줄을 접어요'], en: ['Hide menu', 'Fold the bottom bar'] },
  { sec: 4, sel: '#vc-dock-size', ic: '↕️', ko: ['아래 → 작게', '버튼 줄을 작게 만들어요'], en: ['Smaller bar', 'Make the bar smaller'] },
  { sec: 4, sel: '#mgWorldClock', ic: '🕘', ko: ['시계', '한국·필리핀 시간을 함께 봐요'], en: ['Clock', 'Korea & Philippines time'] },
  { sec: 4, sel: '#ph52-cache-fab', ic: '↻', ko: ['새로 불러오기', '화면을 깨끗이 다시 불러와요'], en: ['Reload', 'Reload the screen cleanly'] }
];

/* 큰 말풍선(화살표) — 가장 자주 묻는 것만. key = 위 항목의 selector/tab 표시 */
const CALLOUTS = {
  teacher: [
    { k: '#vc-btn-resync', x: 470, y: 150, ko: '화면이 멈추면 눌러요', en: 'Frozen screen? Tap here' },
    { k: 'tab:1', x: 70, y: 205, ko: '칠판에 쓰기', en: 'Write on the whiteboard' },
    { k: 'chip:0', x: 560, y: 205, ko: '펜 · 페이지 넘기기', en: 'Pen · turn pages' },
    { k: '.vc-star-btn', x: 560, y: 285, ko: '잘하면 칭찬!', en: 'Great answer? Praise!' },
    { k: '.vc-devhelp-btn', x: 470, y: 360, ko: '학생 마이크 원격 수리', en: 'Fix student mic remotely' },
    { k: '#vc-dock-share', x: 230, y: 470, ko: '내 화면 보여주기', en: 'Share your screen' },
    { k: '#vc-dock-mic', x: 60, y: 560, ko: '목소리 켜기 / 끄기', en: 'Mic on / off' },
    { k: '#vc-dock-settings', x: 470, y: 560, ko: '소리·영상이 안 될 때', en: 'No sound or video?' },
    { k: '#vc-dock-leave', x: 610, y: 470, ko: '수업 끝나면 여기!', en: 'Class over? Leave here!' }
  ],
  student: [
    { k: '#vc-btn-resync', x: 470, y: 150, ko: '선생님이 멈추면 눌러요', en: 'Teacher frozen? Tap here' },
    { k: 'tab:3', x: 70, y: 205, ko: '게임도 할 수 있어요', en: 'You can play games too' },
    { k: 'tab:5', x: 330, y: 255, ko: 'AI랑 영어로 말하기', en: 'Talk in English with AI' },
    { k: '#vc-basket-float', x: 560, y: 360, ko: '칭찬 별이 쌓여요', en: 'Your praise stars' },
    { k: '#vc-dock-chat', x: 230, y: 470, ko: '선생님께 글로 말하기', en: 'Type to your teacher' },
    { k: '#vc-dock-mic', x: 60, y: 560, ko: '내 목소리 켜기 / 끄기', en: 'Your mic on / off' },
    { k: '#vc-dock-consult', x: 420, y: 560, ko: '도움이 필요하면', en: 'Need help?' },
    { k: '#vc-dock-leave', x: 610, y: 470, ko: '수업 끝나면 눌러요', en: 'Tap when class is over' }
  ]
};

const SEC = {
  ko: ['', '맨 위 줄', '수업 메뉴', '얼굴 칸', '아래 버튼 줄'],
  en: ['', 'Top bar', 'Class menu', 'Video tiles', 'Bottom bar']
};
const SEC_COLOR = ['', '#16a34a', '#2563eb', '#ea580c', '#7c3aed'];

function keyOf(it) {
  if (it.sel) return it.sel;
  if (it.tab != null) return 'tab:' + it.tab;
  if (it.chip != null) return 'chip:' + it.chip;
  return 'find:' + it.find;
}

async function capture(browser, role, lang) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.addInitScript((lang) => {
    try {
      localStorage.setItem('mangoi_onboard_v1', 'skip:0');
      localStorage.setItem('mangoi_vcguide_off_v1', '1');
      localStorage.setItem('mangoi_lang', lang);
    } catch (e) {}
  }, lang);
  await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
  await p.goto(BASE + '/index.html?_nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof window.showView === 'function' && typeof vcEnsureParticipantBox === 'function', null, { timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.evaluate(({ role, lang }) => {
    window.vcMyRole = role;
    document.body.classList.add('vc-in-call');
    window.showView('view-videocall-call');
    try { if (typeof window.setLang === 'function') window.setLang(lang); } catch (e) {}
  }, { role, lang });
  await p.waitForTimeout(2500);
  const remoteName = role === 'teacher' ? (lang === 'en' ? 'Mina (Student)' : '미나 (학생)') : 'Teacher Lily';
  await p.evaluate(({ role, remoteName }) => {
    try { window.vcPeerRoles = window.vcPeerRoles || {}; window.vcPeerRoles.peer1 = role === 'teacher' ? 'student' : 'teacher'; } catch (e) {}
    vcEnsureParticipantBox('peer1', remoteName);
    try { typeof vcRefreshPraiseUI === 'function' && vcRefreshPraiseUI(); } catch (e) {}
  }, { role, remoteName });
  await p.waitForTimeout(1200);
  await p.evaluate(({ role, lang }) => {
    // 어두운 테마(예시와 같은 화면)
    try {
      if (!document.documentElement.classList.contains('dark') && !document.body.classList.contains('mango-dark')) {
        const t = document.getElementById('mango-theme-toggle');
        if (t && /다크|Dark/i.test(t.textContent)) t.click();
      }
    } catch (e) {}
    // 얼굴 사진
    const face = (box, src, pos) => {
      if (!box) return;
      const hint = box.querySelector('.vc-connecting-hint'); if (hint) hint.style.display = 'none';
      const im = document.createElement('img');
      im.src = src;
      im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:' + pos + ';z-index:1;border-radius:inherit;';
      box.style.position = 'relative';
      box.insertBefore(im, box.firstChild);
    };
    const T = '/img/lily-wide.webp', S = '/img/mei-closed.webp';
    face(document.getElementById('vc-video-peer1'), role === 'teacher' ? S : T, '50% 22%');
    face(document.getElementById('vc-local-box'), role === 'teacher' ? T : S, '50% 22%');
    const lab = document.getElementById('vc-local-label'); if (lab) lab.style.zIndex = 3;
    document.querySelectorAll('#vc-video-peer1 .video-label').forEach(l => { l.style.zIndex = 3; });
    // 교재 칸은 검정으로 비워 둔다(2026-09-25 사장님 «교재는 없애고 그냥 교재화면을 검정색으로»)
    const wait = document.getElementById('vc-wait-card'); if (wait) wait.style.display = 'none';
    const tp = document.getElementById('tab-pdf');
    if (tp) {
      tp.style.setProperty('background', '#000', 'important');
      Array.from(tp.children).forEach(c => c.style.setProperty('visibility', 'hidden', 'important'));
    }
  }, { role, lang });
  await p.waitForTimeout(1500);

  // 위치 재기
  const specs = ITEMS.filter(it => !it.role || it.role === role).map(it => ({ key: keyOf(it), sel: it.sel, tab: it.tab, chip: it.chip, find: it.find }));
  const rects = await p.evaluate((specs) => {
    const vis = e => { if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      if (r.width < 6 || r.height < 6 || r.right < 0 || r.left > 1280 || r.top > 800 || cs.visibility === 'hidden' || cs.display === 'none') return null;
      return [r.left, r.top, r.width, r.height]; };
    const out = {};
    const all = Array.from(document.querySelectorAll('button,span,div'));
    for (const s of specs) {
      let el = null;
      if (s.sel) el = document.querySelector(s.sel);
      else if (s.tab != null) el = document.querySelectorAll('#vc-content-pane .tab-btn')[s.tab];
      else if (s.chip != null) el = document.querySelectorAll('.mango-tool-chip')[s.chip];
      else if (s.find === 'lang') el = Array.from(document.querySelectorAll('.lang-label-sync')).map(l => l.closest('button')).find(b => b && b.getBoundingClientRect().width > 6 && b.getBoundingClientRect().top < 60);
      else if (s.find === 'timer') el = all.filter(e => /^⏰?\s*\d\d:\d\d$/.test((e.textContent || '').trim()) && e.getBoundingClientRect().top < 60).pop();
      else if (s.find === 'rec') el = all.filter(e => /녹화|REC|record/i.test((e.textContent || '').trim()) && (e.textContent || '').trim().length < 30 && e.getBoundingClientRect().top < 60 && e.getBoundingClientRect().width > 60).pop();
      out[s.key] = vis(el);
    }
    return out;
  }, specs);
  const shot = await p.screenshot({ type: 'png' });
  await ctx.close();
  return { rects, shot };
}

function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function composeHtml(role, lang, rects) {
  const items = [];
  let n = 0;
  for (const it of ITEMS) {
    if (it.role && it.role !== role) continue;
    const r = rects[keyOf(it)];
    if (!r) continue;
    n++;
    const txt = (it[lang] && !Array.isArray(it[lang])) ? it[lang][role] : it[lang];
    items.push({ n, key: keyOf(it), sec: it.sec, ic: it.ic, title: txt[0], desc: txt[1], r });
  }
  const byKey = Object.fromEntries(items.map(i => [i.key, i]));
  const SC = 1416 / 1280, TOP = 85;
  const X = v => v * SC, Y = v => TOP + v * SC;
  const col = sec => SEC_COLOR[sec];

  // 번호 동그라미 + 노란 테두리
  let badges = '';
  for (const it of items) {
    const [x, y, w, h] = it.r;
    badges += `<div class="hl" style="left:${X(x) - 2}px;top:${Y(y) - 2}px;width:${w * SC + 4}px;height:${h * SC + 4}px"></div>`;
    const bx = Math.max(12, X(x) - 10), by = Math.max(TOP + 12, Y(y) - 10);
    badges += `<div class="bd" style="left:${bx}px;top:${by}px;background:${col(it.sec)}">${it.n}</div>`;
  }
  // 말풍선 + 화살표
  let pills = '', arrows = '';
  const palette = ['#e11d48', '#f97316', '#0ea5e9', '#16a34a', '#8b5cf6', '#db2777', '#0891b2', '#ca8a04', '#2563eb'];
  (CALLOUTS[role] || []).forEach((c, i) => {
    const it = byKey[c.k]; if (!it) return;
    const px = X(c.x) + 40, py = Y(c.y) + 40;
    const [x, y, w, h] = it.r;
    const tx = X(x + w / 2), ty = Y(y + h / 2);
    const colr = palette[i % palette.length];
    const sx = px + 150, sy = py + 22;
    const mx = (sx + tx) / 2 + (ty > sy ? 40 : -40), my = (sy + ty) / 2;
    arrows += `<path d="M${sx},${sy} Q${mx},${my} ${tx},${ty}" stroke="${colr}" stroke-width="4" fill="none" marker-end="url(#ah${i})"/>` +
      `<marker id="ah${i}" markerWidth="10" markerHeight="10" refX="6" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${colr}"/></marker>`;
    pills += `<div class="pill" style="left:${px}px;top:${py}px;border-color:${colr}"><span class="pn" style="background:${col(it.sec)}">${it.n}</span>${esc(it.ic)} ${esc(c[lang])}</div>`;
  });

  // 오른쪽 설명
  const secBox = sec => {
    const rows = items.filter(i => i.sec === sec).map(i =>
      `<div class="row"><span class="rn" style="background:${col(sec)}">${i.n}</span><span class="ri">${esc(i.ic)}</span><span class="rt"><b>${esc(i.title)}</b><i>${esc(i.desc)}</i></span></div>`).join('');
    return `<div class="sec"><div class="sh" style="background:${col(sec)}">${['', '①', '②', '③', '④'][sec]} ${esc(SEC[lang][sec])}</div>${rows}</div>`;
  };
  const title = role === 'teacher'
    ? (lang === 'en' ? ['Teacher Class Screen — One-page Guide', '선생님 수업화면 한 장 안내'] : ['선생님 수업화면 한 장 안내', 'Teacher Class Screen · One-page Guide'])
    : (lang === 'en' ? ['Student Class Screen — One-page Guide', '학생 수업화면 한 장 안내'] : ['학생 수업화면 한 장 안내', 'Student Class Screen · One-page Guide']);
  const legendT = lang === 'en' ? 'What the numbers mean' : '번호 설명';
  const tip = lang === 'en' ? 'Left: the real screen · Right: what each number does' : '왼쪽 화면 · 오른쪽 설명';
  const foot = lang === 'en'
    ? 'Captured from the real class screen (PC 1280×800). Faces are examples.'
    : '실제 수업 화면(PC 1280×800)을 그대로 찍은 그림입니다. 얼굴은 안내용 예시입니다.';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} body{margin:0;width:2000px;height:1006px;overflow:hidden;background:#fff7ed;
   font-family:'WenQuanYi Zen Hei','Noto Color Emoji',sans-serif;color:#101828;position:relative}
  .hd{position:absolute;left:0;top:0;width:2000px;height:85px;background:linear-gradient(90deg,#fde68a,#fb923c);display:flex;align-items:center;padding:0 24px;gap:16px}
  .hd img{height:78px} .hd h1{margin:0;font-size:34px;font-weight:900} .hd small{display:block;font-size:17px;font-weight:700;color:#7c2d12}
  .hd .tag{margin-left:auto;background:#1e293b;color:#fde68a;border-radius:999px;padding:10px 20px;font-weight:800;font-size:17px}
  .shot{position:absolute;left:0;top:85px;width:1416px;height:885px}
  .hl{position:absolute;border:3px solid #facc15;border-radius:8px;box-shadow:0 0 0 2px rgba(0,0,0,.35)}
  .bd{position:absolute;width:26px;height:26px;border-radius:999px;color:#fff;font-weight:900;font-size:14px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);z-index:3}
  svg{position:absolute;left:0;top:0;width:2000px;height:1006px;z-index:2}
  .pill{position:absolute;z-index:4;background:#fff;border:4px solid;border-radius:999px;padding:8px 18px 8px 8px;font-size:21px;font-weight:900;display:flex;align-items:center;gap:8px;box-shadow:0 4px 14px rgba(0,0,0,.35);white-space:nowrap}
  .pn{width:34px;height:34px;border-radius:999px;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:17px}
  .lg{position:absolute;left:1416px;top:85px;width:584px;height:885px;padding:14px 16px;background:#fffbeb}
  .lg h2{margin:0 0 4px;font-size:24px;color:#b45309} .lg .t{display:inline-block;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;font-size:12px;padding:2px 8px;margin-bottom:8px}
  .cols{column-count:2;column-gap:12px}
  .sec{break-inside:avoid;border:2px solid #e5e7eb;border-radius:10px;margin-bottom:10px;background:#fff;overflow:hidden}
  .sh{color:#fff;font-weight:900;font-size:15px;padding:5px 10px}
  .row{display:flex;align-items:center;gap:6px;padding:3px 8px;border-top:1px solid #f1f5f9}
  .rn{flex:0 0 22px;height:22px;border-radius:999px;color:#fff;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center}
  .ri{flex:0 0 20px;font-size:14px;text-align:center}
  .rt{display:block;line-height:1.2} .rt b{display:block;font-size:13px} .rt i{display:block;font-style:normal;font-size:11px;color:#475467}
  .ft{position:absolute;left:0;top:970px;width:2000px;height:36px;background:#fff;font-size:13px;color:#475467;padding:9px 20px}
  </style></head><body>
  <div class="hd"><img src="/img/mango-char.png" alt=""><div><h1>${esc(title[0])}</h1><small>${esc(title[1])}</small></div><div class="tag">${esc(tip)}</div></div>
  <img class="shot" src="/__guide_shot.png">
  ${badges}
  <svg viewBox="0 0 2000 1006">${arrows}</svg>
  ${pills}
  <div class="lg"><h2>🔢 ${esc(legendT)}</h2><div class="t">${lang === 'en' ? 'Yellow frame = important button' : '노란 줄 = 화면에 화살표로 표시한 중요 버튼'}</div>
   <div class="cols">${secBox(1)}${secBox(2)}${secBox(3)}${secBox(4)}</div></div>
  <div class="ft">${esc(foot)}</div>
  </body></html>`;
}

const browser = await pw.chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const [role, lang] of [['teacher', 'en'], ['teacher', 'ko'], ['student', 'ko'], ['student', 'en']]) {
  const { rects, shot } = await capture(browser, role, lang);
  const missing = Object.entries(rects).filter(([, v]) => !v).map(([k]) => k);
  const html = composeHtml(role, lang, rects);
  const ctx = await browser.newContext({ viewport: { width: 2000, height: 1006 } });
  const p = await ctx.newPage();
  await p.route(BASE + '/__guide.html', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
  await p.route(BASE + '/__guide_shot.png', r => r.fulfill({ status: 200, contentType: 'image/png', body: shot }));
  await p.goto(BASE + '/__guide.html', { waitUntil: 'load' });
  await p.waitForTimeout(600);
  const png = await p.screenshot({ type: 'png' });
  // webp 로 굽기(같은 오리진 캔버스)
  await p.route(BASE + '/__guide_final.png', r => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
  const dataUrl = await p.evaluate(async (u) => {
    const im = new Image(); im.src = u; await im.decode();
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    c.getContext('2d').drawImage(im, 0, 0);
    return c.toDataURL('image/webp', 0.86);
  }, BASE + '/__guide_final.png');
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  const out = path.join(OUT, `${role}-${lang}.webp`);
  fs.writeFileSync(out, buf);
  console.log(`${role}-${lang}: ${Math.round(buf.length / 1024)}KB · 번호 ${Object.values(rects).filter(Boolean).length}개` + (missing.length ? ` · 화면에 없음: ${missing.join(', ')}` : ''));
  await ctx.close();
}
await browser.close();
