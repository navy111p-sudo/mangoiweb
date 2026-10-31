// ═══════════════════════════════════════════════════════════════
// gen.js — builds the English admin guide deck (HTML → JPEG → PDF).
//
//   node gen.js            build everything
//   node gen.js --html     write slide HTML only (fast, for design tweaks)
//
// Output: cloudflare-deploy/public/guide/admin-easy-en/01..NN.jpg + admin-easy-en.pdf
// Screenshots are picked up from ../capture_en/ ; any that are missing render as
// a labelled placeholder so the deck still builds. Re-run once they land.
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HERE = __dirname;
const SHOTS = path.join(HERE, '..', 'capture_en');
const WORK = path.join(HERE, 'work');
const DIST = path.join(HERE, '..', '..', 'cloudflare-deploy', 'public', 'guide', 'admin-easy-en');
const MENU = JSON.parse(fs.readFileSync(path.join(HERE, 'menu_en.json'), 'utf8'));
const { SUB_DESC, SUB_DESC_BY_NAME, GROUP_INFO } = require('./content.js');

const htmlOnly = process.argv.includes('--html');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Strip emoji AND their invisible companions: zero-width joiner (200D), variation
// selector (FE0F), keycap (20E3). Missing the ZWJ leaves it at the front of the
// string and silently breaks alphabetical sorting.
const deEmoji = s => String(s)
  .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
  .replace(/\s+/g, ' ').trim();
const sortKey = s => deEmoji(s).toLowerCase();

// ─── fail loudly if the menu data and the copy have drifted apart ───
(function assertCoverage() {
  const subs = MENU.flatMap(g => g.subs);
  const missing = subs.filter(s => !(SUB_DESC[s.card] || SUB_DESC_BY_NAME[s.en]));
  const bogus = Object.keys(SUB_DESC).filter(c => !subs.some(s => s.card === c));
  if (missing.length) throw new Error('No description for: ' + missing.map(s => s.en).join(', '));
  if (bogus.length) throw new Error('Description for unknown card: ' + bogus.join(', '));
  const groups = MENU.filter(g => !GROUP_INFO[g.en]);
  if (groups.length) throw new Error('No GROUP_INFO for: ' + groups.map(g => g.en).join(', '));
})();

const descOf = s => SUB_DESC[s.card] || SUB_DESC_BY_NAME[s.en] || '';

// ─── screenshot resolution ───
function shot(name) {
  if (!name) return null;
  for (const ext of ['.png', '.jpg', '.jpeg', '.PNG', '.JPG']) {
    const p = path.join(SHOTS, name + ext);
    if (fs.existsSync(p)) return 'file:///' + p.replace(/\\/g, '/');
  }
  return null;
}
const missingShots = [];
function shotBox(name, label) {
  const src = shot(name);
  if (src) return `<div class="shot"><img src="${src}" alt=""></div>`;
  if (name) missingShots.push(name);
  return `<div class="shot ph"><div><b>Screenshot</b><span>${esc(label || name || '')}</span></div></div>`;
}

// ═══════════════════ CSS ═══════════════════
const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1920px;height:1080px;overflow:hidden}
body{
  font-family:"Segoe UI","Malgun Gothic",system-ui,-apple-system,sans-serif;
  background:linear-gradient(135deg,#FFE788 0%,#FFD23F 55%,#FFC01A 100%);
  color:#2A1E00; position:relative;
}
/* soft mango blobs — decoration only */
body::before{content:'';position:absolute;top:-320px;right:-260px;width:900px;height:900px;
  border-radius:50%;background:rgba(255,255,255,.28)}
body::after{content:'';position:absolute;bottom:-420px;left:-300px;width:820px;height:820px;
  border-radius:50%;background:rgba(224,118,10,.10)}
.slide{position:relative;z-index:1;width:1920px;height:1080px;padding:70px 86px;display:flex;flex-direction:column}

/* header */
.hd{display:flex;align-items:center;gap:26px;margin-bottom:34px;flex:none}
.hd .num{width:82px;height:82px;border-radius:50%;background:#E8760A;color:#fff;
  display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:800;flex:none;
  box-shadow:0 8px 20px -6px rgba(180,90,0,.55)}
.hd .tx{flex:1;min-width:0}
.hd .kicker{font-size:23px;font-weight:800;color:#B3620A;letter-spacing:.14em;text-transform:uppercase}
.hd h1{font-size:62px;font-weight:800;line-height:1.1;letter-spacing:-.02em}
.hd .ko{font-size:26px;font-weight:700;color:#7A5E14;margin-top:8px}

/* generic card */
.card{background:#fff;border-radius:26px;padding:34px 38px;box-shadow:0 14px 34px -14px rgba(120,70,0,.34)}
.card h3{font-size:27px;font-weight:800;margin-bottom:14px;display:flex;align-items:center;gap:11px}
.card p{font-size:25px;line-height:1.52;color:#4A3A12}
.card.blue{background:#EAF2FF}
.card.blue h3{color:#1D4ED8}
.card.blue p{color:#28407A}

.body{flex:1;display:flex;gap:34px;min-height:0}
.col{display:flex;flex-direction:column;gap:26px;min-height:0}

/* screenshots */
.shot{background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 16px 40px -14px rgba(120,70,0,.45);
  border:5px solid #fff;flex:1;display:flex;min-height:0}
.shot img{width:100%;height:100%;object-fit:cover;object-position:top left;display:block}
.shot.ph{background:repeating-linear-gradient(45deg,#FFF6D8,#FFF6D8 18px,#FFEFC0 18px,#FFEFC0 36px);
  align-items:center;justify-content:center;border:5px dashed #E8B23A}
.shot.ph div{text-align:center;color:#A8791A}
.shot.ph b{display:block;font-size:34px;font-weight:800;margin-bottom:8px}
.shot.ph span{font-size:24px;font-family:monospace}

/* sub-menu list */
.subs{display:grid;grid-template-columns:1fr 1fr;gap:16px 34px;align-content:start}
.sub{display:flex;align-items:baseline;gap:13px}
.sub .dot{width:11px;height:11px;border-radius:50%;background:#E8760A;flex:none;transform:translateY(-3px)}
.sub .n{font-size:25px;font-weight:800;white-space:nowrap}
.sub .d{font-size:21px;color:#6B5518;line-height:1.34}

.secttl{font-size:29px;font-weight:800;color:#B3620A;margin-bottom:20px}
.tip{background:#2A1E00;color:#FFD23F;border-radius:20px;padding:22px 30px;font-size:24px;font-weight:600;
  display:flex;align-items:center;gap:14px;flex:none}
.tip b{color:#fff;font-weight:800}

/* footer */
.ft{position:absolute;bottom:36px;left:86px;right:86px;display:flex;justify-content:space-between;
  align-items:center;font-size:20px;color:#8A6A18;font-weight:700;z-index:2}

/* ── cover ── */
.cover{justify-content:center;align-items:flex-start;padding-left:130px}
.cover .key{width:120px;height:120px;border-radius:50%;background:#E8760A;color:#fff;font-size:58px;
  display:flex;align-items:center;justify-content:center;margin-bottom:40px;
  box-shadow:0 14px 34px -8px rgba(180,90,0,.6)}
.cover .brand{font-size:34px;font-weight:800;color:#B3620A;margin-bottom:16px;letter-spacing:.02em}
.cover h1{font-size:118px;font-weight:800;line-height:1.04;letter-spacing:-.03em;margin-bottom:34px}
.cover .sub{font-size:33px;color:#4A3A12;line-height:1.5;max-width:1080px}
.cover .mango{position:absolute;right:110px;bottom:90px;width:430px}

/* ── contents ──
   grid-auto-flow:column + a fixed row count so the list reads DOWN column 1 then
   down column 2. Row-wise flow (the grid default) would order it 3,4 / 5,6 across
   the page, which reads as nonsense. */
.toc{display:grid;grid-template-rows:repeat(13,auto);grid-auto-flow:column;
  grid-auto-columns:1fr;gap:5px 50px;align-content:start;flex:1}
.toc .row{display:flex;align-items:center;gap:16px;background:rgba(255,255,255,.72);
  border-radius:11px;padding:6px 20px}
.toc .row.hdr{background:none;padding:4px 0 0}
.toc .row.hdr .lbl{font-size:18px;font-weight:800;color:#B3620A;letter-spacing:.1em;text-transform:uppercase}
.toc .pg{width:38px;height:38px;border-radius:10px;background:#E8760A;color:#fff;font-size:19px;font-weight:800;
  display:flex;align-items:center;justify-content:center;flex:none}
.toc .lbl{font-size:22px;font-weight:700;flex:1}

/* ── index ── same column-flow reasoning: A–Z must read down each column */
.idx{display:grid;grid-template-rows:repeat(12,auto);grid-auto-flow:column;
  grid-auto-columns:1fr;gap:8px 28px;align-content:start;flex:1}
.idx .row{display:flex;align-items:center;gap:13px;background:rgba(255,255,255,.72);
  border-radius:11px;padding:10px 15px}
.idx .nm{font-size:21px;font-weight:700;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.idx .mn{width:32px;height:32px;border-radius:8px;background:#E8760A;color:#fff;font-size:17px;font-weight:800;
  display:flex;align-items:center;justify-content:center;flex:none}

/* ── steps ── */
.steps{display:flex;gap:22px;flex:1}
.step{flex:1;background:#fff;border-radius:24px;padding:32px;display:flex;flex-direction:column;gap:16px;
  box-shadow:0 14px 34px -14px rgba(120,70,0,.34)}
.step .sn{width:56px;height:56px;border-radius:50%;background:#FFD23F;color:#2A1E00;font-size:26px;font-weight:800;
  display:flex;align-items:center;justify-content:center}
.step h4{font-size:27px;font-weight:800;line-height:1.25}
.step p{font-size:21px;color:#5A4712;line-height:1.45}
`;

// ═══════════════════ slide builders ═══════════════════
// foot: pass false to omit the footer entirely (cover / final slide); any other
// value is ignored — the real page number is stamped from slide position after
// the deck is assembled, so footers can never drift out of sync with Contents.
const PGN = '%%PGN%%';
const page = (cls, inner, foot) => `<!doctype html><meta charset="utf-8"><style>${CSS}</style>
<div class="slide ${cls}">${inner}</div>${foot === false ? '' : `<div class="ft"><span>Mangoi — Admin Page Guide</span><span>${PGN}</span></div>`}`;

const header = (num, kicker, title, ko) => `<div class="hd">
  <div class="num">${num}</div>
  <div class="tx"><div class="kicker">${esc(kicker)}</div><h1>${esc(title)}</h1>
  ${ko ? `<div class="ko">${esc(ko)}</div>` : ''}</div></div>`;

const slides = [];
const push = (title, html) => slides.push({ title, html });

// ── 1 cover ──
const mango = 'file:///' + path.join(HERE, '..', 'assets', 'mango_char.png').replace(/\\/g, '/');
push('Cover', page('cover', `
  <div class="key">🔑</div>
  <div class="brand">Mangoi Academy Management System</div>
  <h1>Admin Page<br>Menu &amp; Feature Guide</h1>
  <div class="sub">What each menu is, what it does, and why it exists — one at a time.<br>
  New to computers? That's fine. Follow the pictures and take your time.</div>
  ${fs.existsSync(path.join(HERE, '..', 'assets', 'mango_char.png')) ? `<img class="mango" src="${mango}" alt="">` : ''}
`, false));

// ── 2 contents (filled in after all slides are known) ──
push('Contents', '__TOC__');

// ── 3 what is it ──
push('What is the Admin Page?', page('', header('1', 'Getting started', 'What is the Admin Page?') + `
  <div class="body">
    <div class="col" style="flex:0 0 660px">
      <div class="card" style="flex:1">
        <h3 style="color:#B3620A">In one sentence</h3>
        <p style="font-size:44px;font-weight:800;color:#2A1E00;line-height:1.25;margin:18px 0 26px">
          It is your academy’s<br><span style="color:#E8760A">driver’s seat.</span></p>
        <p>Like a car’s dashboard, every control you need is gathered on one screen.
        Pick what you want from the menu on the left, and it opens on the right.</p>
      </div>
    </div>
    <div class="col" style="flex:1">
      ${[['👥', 'Manage students, teachers & classes', 'See who studied, and when — all in one place.'],
       ['📊', 'Read stats, payroll & settlement', 'The numbers are calculated for you. Just press the button.'],
       ['📢', 'Send notices & alerts', 'Reach parents and students straight away.']]
    .map(([i, t, d]) => `<div class="card" style="flex:1"><h3><span style="font-size:34px">${i}</span> ${esc(t)}</h3><p>${esc(d)}</p></div>`).join('')}
    </div>
  </div>`, '3'));

// ── 4 login ──
push('Signing in', page('', header('2', 'Getting started', 'Signing in') + `
  <div class="body">
    <div class="col" style="flex:0 0 620px">
      <div class="card"><h3>🔑 How to get in</h3>
        <p>Go to <b>test.mangoi.co.kr/admin.html</b>, enter your ID and password, and press Login.</p></div>
      <div class="card blue"><h3>💡 Switch to English</h3>
        <p>Press the <b>EN</b> button at the top right. The whole page switches to English.
        Press it again for Korean.</p></div>
      <div class="card" style="flex:1"><h3>⚠️ If you can’t get in</h3>
        <p>After <b>8 wrong tries</b> the account locks for <b>15 minutes</b> — this stops strangers guessing.
        Wait, then try again.</p></div>
    </div>
    <div class="col" style="flex:1">${shotBox('01_login', '01_login')}</div>
  </div>`, '4'));

// ── 5 screen anatomy ──
push('The screen, explained', page('', header('3', 'Getting started', 'The screen, explained') + `
  <div class="body">
    <div class="col" style="flex:1">${shotBox('03_dashboard', '03_dashboard')}</div>
    <div class="col" style="flex:0 0 600px">
      ${[['Left — the menu', 'Nine groups. This is how you get anywhere.'],
      ['Right — the work area', 'Whatever you picked opens here.'],
      ['Top right — EN / theme / you', 'Language, colour, and your account.'],
      ['The mango — AI Ops Assistant', 'Ask it in plain words and it finds the menu for you.']]
    .map(([t, d], i) => `<div class="card" style="flex:1"><h3><span class="num" style="width:40px;height:40px;border-radius:50%;background:#FFD23F;color:#2A1E00;display:inline-flex;align-items:center;justify-content:center;font-size:20px;font-weight:800">${i + 1}</span> ${esc(t)}</h3><p>${esc(d)}</p></div>`).join('')}
    </div>
  </div>`, '5'));

// ── 6 sidebar at a glance ──
const totalSubs = MENU.reduce((a, g) => a + g.subs.length, 0);
push('The menu at a glance', page('', header('4', 'Getting started', 'The menu at a glance', `${MENU.length} groups · ${totalSubs} items`) + `
  <div class="body">
    <div class="col" style="flex:0 0 520px">${shotBox('02_sidebar', '02_sidebar')}</div>
    <div class="col" style="flex:1">
      <div class="card" style="flex:1">
        <div class="secttl">The nine groups — and which page explains each</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px 30px">
        ${MENU.map((g, i) => `<div class="sub">
          <span class="toc-n" style="width:44px;height:44px;border-radius:11px;background:#E8760A;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:21px;font-weight:800;flex:none">${i + 1}</span>
          <span><span class="n">${esc(g.en)}</span><br><span class="d">${g.subs.length} items · page ${i + 8}</span></span></div>`).join('')}
        </div>
      </div>
      <div class="tip">👉 <span><b>Can’t find something?</b> Use the search box at the very top of the menu, or jump to the A–Z index at the back of this guide.</span></div>
    </div>
  </div>`, '6'));

// ── 7 how to find anything ── (tall sidebar-open shot lives in a portrait column)
push('How to find anything', page('', header('5', 'Getting started', 'How to find anything') + `
  <div class="body">
    <div class="col" style="flex:1;gap:18px">
      ${[['Type it', 'Use <b>🔍 Search menu…</b> at the top of the sidebar. Type “payroll”, “student”, anything.'],
      ['Ask the mango', 'Open <b>AI Ops Assistant</b> and ask in plain words. It takes you to the right menu.'],
      ['Open a group', 'Click a group to expand it (right →). Click again to close. <b>Expand All</b> opens everything.'],
      ['Use the index', 'The last pages list all ' + totalSubs + ' items A–Z with the menu number they live in.']]
      .map(([t, d], i) => `<div class="card" style="flex:1;padding:24px 30px">
        <h3 style="margin-bottom:8px"><span style="width:44px;height:44px;border-radius:50%;background:#FFD23F;color:#2A1E00;display:inline-flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;flex:none">${i + 1}</span> ${esc(t)}</h3>
        <p style="font-size:23px">${d}</p></div>`).join('')}
    </div>
    <div class="col" style="flex:0 0 430px">
      <div class="secttl" style="text-align:center">A group, opened up ↓</div>
      ${shotBox('04_sidebar_open', '04_sidebar_open')}
    </div>
  </div>`, '7'));

// ── 8..16 one slide per menu group ──
MENU.forEach((g, i) => {
  const info = GROUP_INFO[g.en];
  const hasShot = !!shot(info.shot);
  push(`Menu ${i + 1} · ${g.en}`, page('', header(i + 1, `Menu ${i + 1} of ${MENU.length}`, g.en, `${g.ko} · ${g.subs.length} items`) + `
    <div class="body">
      <div class="col" style="flex:0 0 560px">
        <div class="card"><h3>❓ What does it do?</h3><p>${esc(info.what)}</p></div>
        <div class="card blue" style="flex:1"><h3>💡 Why was it built?</h3><p>${esc(info.why)}</p></div>
        ${hasShot ? `<div class="col" style="flex:1.1;min-height:0">${shotBox(info.shot)}</div>` : ''}
      </div>
      <div class="col" style="flex:1">
        <div class="card" style="flex:1">
          <div class="secttl">All ${g.subs.length} items — click any of these in the sidebar</div>
          <div class="subs">
            ${g.subs.map(s => `<div class="sub"><span class="dot"></span>
              <span><span class="n">${esc(s.en)}</span><br><span class="d">${esc(descOf(s))}</span></span></div>`).join('')}
          </div>
        </div>
        <div class="tip">💡 <span><b>Tip.</b> ${esc(info.tip)}</span></div>
      </div>
    </div>`, String(i + 8)));
});

// ── 17 everyday tasks ──
push('The 3 things you’ll do most', page('', header('6', 'Everyday use', 'The 3 things you’ll do most') + `
  <div class="steps">
    ${[['Send a notice', 'Notification Center → 📢 Notice Studio', 'Write it, design it, send it to every parent — in one screen.'],
    ['Check the numbers', 'Stats / KPI → KPI Dashboard', 'How many students, how many classes, how much income. Updated for you.'],
    ['Approve the payroll', 'Teachers → Auto Payroll → Payroll', 'The system works out the pay from real lessons. You check it and approve.']]
    .map(([t, where, d], i) => `<div class="step"><div class="sn">${i + 1}</div>
      <h4>${esc(t)}</h4>
      <p style="color:#B3620A;font-weight:800;font-size:20px">${esc(where)}</p>
      <p>${esc(d)}</p></div>`).join('')}
  </div>`, String(MENU.length + 8)));

// ── 18 walkthrough ──
push('Walkthrough: send a notice', page('', header('7', 'Everyday use', 'Walkthrough: send a notice', 'Follow along, step by step') + `
  <div class="steps">
    ${[['Open the group', 'In the left menu, click <b>Notification Center</b>. It expands.'],
    ['Pick Notice Studio', 'Click <b>📢 Notice Studio</b>. The work area opens on the right.'],
    ['Write it', 'Type the title and the message. Pick a poster design if you want one.'],
    ['Choose who', 'Select the parents, students or group who should receive it.'],
    ['Send', 'Press send. It goes out by KakaoTalk and push, and is saved to the notice board.']]
    .map(([t, d], i) => `<div class="step"><div class="sn">${i + 1}</div><h4>${esc(t)}</h4><p>${d}</p></div>`).join('')}
  </div>
  <div style="height:26px"></div>
  <div class="tip">⚠️ <span><b>It really sends.</b> Once you press send, parents receive it immediately — there is no undo. Read it once more first.</span></div>`, String(MENU.length + 9)));

// ── 19 roles ──
push('Who sees what', page('', header('8', 'Everyday use', 'Who sees what', 'Roles & permissions') + `
  <div class="body">
    <div class="col" style="flex:1">
      <div class="card" style="flex:1">
        <div class="secttl">Not everyone sees the same menu</div>
        <p style="font-size:24px;line-height:1.55;color:#4A3A12">
        Each person signs in with a role. The role decides which menus appear and
        whose data they can open. You set this in <b>System → Permissions</b>.</p>
      </div>
      <div class="tip">🔒 <span><b>Enforced by the server</b>, not just hidden on screen. A branch cannot reach another branch’s data even if they try.</span></div>
    </div>
    <div class="col" style="flex:0 0 800px">
      <div class="card" style="flex:1">
        <div class="secttl">Who sees how much</div>
        <div style="display:flex;flex-direction:column;gap:16px">
        ${[['Head office', 'admin', 'Everything — the full nine groups', '100%', '#E8760A'],
        ['Branch', '지사', 'Only their own branch’s students, teachers & settlement', '60%', '#2563EB'],
        ['Agency', '대리점', 'Only their own agency’s figures', '40%', '#059669'],
        ['Teacher', '강사', 'Their own lessons, students and pay — nobody else’s', '22%', '#8B5CF6']]
        .map(([r, ko, d, w, c]) => `<div style="background:#FFF6D8;border-radius:16px;padding:16px 20px">
          <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:9px">
            <span style="font-size:25px;font-weight:800;color:${c}">${esc(r)}</span>
            <span style="font-size:19px;color:#8A6A18">${esc(ko)}</span>
            <span style="margin-left:auto;font-size:20px;color:#6B5518">${esc(d)}</span></div>
          <div style="height:12px;border-radius:99px;background:#F0DCA8;overflow:hidden">
            <div style="height:100%;width:${w};background:${c};border-radius:99px"></div></div>
        </div>`).join('')}
        </div>
      </div>
    </div>
  </div>`, String(MENU.length + 10)));

// ── 20 safety ──
push('Staying safe + tips', page('', header('9', 'Everyday use', 'Staying safe, and a few tips') + `
  <div class="body">
    <div class="col" style="flex:1">
      <div class="card"><h3>🚪 Signing out</h3><p>Click your name at the top right → <b>Log out</b>. Always do this on a shared computer.</p></div>
      <div class="card"><h3>🔐 Two-factor (2FA)</h3><p>If it’s switched on, you also type a 6-digit code from your phone. It keeps the account safe even if the password leaks.</p></div>
      <div class="card blue" style="flex:1"><h3>💡 Good habits</h3><p>
        • Read twice before sending anything to parents.<br>
        • Nothing is deleted quietly — <b>Class Change History</b> records who changed what.<br>
        • Lost? Press the mango and just ask.</p></div>
    </div>
    <div class="col" style="flex:0 0 700px">
      <div class="card" style="flex:1">
        <div class="secttl">If something looks wrong</div>
        <p style="font-size:25px;line-height:1.55;color:#4A3A12">
        Don’t worry — you can’t break it by looking. Open
        <b>Teachers → 🐞 Bug &amp; Feedback Inbox</b> and write down what you saw,
        or tell the office. Nothing you click on this page is permanent except
        <b>sending</b> and <b>deleting</b>.</p>
      </div>
      <div class="tip">🆘 <span><b>Stuck?</b> The mango button answers in Korean or English.</span></div>
    </div>
  </div>`, String(MENU.length + 11)));

// ── 21+ A–Z index ──
const all = [];
MENU.forEach((g, gi) => g.subs.forEach(s => all.push({ name: deEmoji(s.en), menu: gi + 1 })));
all.sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name)));
const PER = 36;   // 12 rows x 3 columns — fits the slide with room to spare
const chunks = [];
for (let i = 0; i < all.length; i += PER) chunks.push(all.slice(i, i + PER));
chunks.forEach((ch, ci) => {
  push(`A–Z index (${ci + 1}/${chunks.length})`, page('', header('🔎', 'Find anything', `A–Z index of all ${all.length} items`,
    `${ci + 1} of ${chunks.length} · the number tells you which menu group it lives in`) + `
    <div class="idx">
      ${ch.map(r => `<div class="row"><span class="mn">${r.menu}</span><span class="nm">${esc(r.name)}</span></div>`).join('')}
    </div>`, String(MENU.length + 12 + ci)));
});

// ── last: done ──
push('You’re ready', page('cover', `
  <div class="key">🎉</div>
  <div class="brand">That’s the whole admin page</div>
  <h1>You’re ready.</h1>
  <div class="sub">You now know all ${MENU.length} groups and where the ${totalSubs} items live.<br>
  You don’t have to remember it — search, ask the mango, or come back to the A–Z index.</div>
  ${fs.existsSync(path.join(HERE, '..', 'assets', 'mango_char.png')) ? `<img class="mango" src="${mango}" alt="">` : ''}
`, false));

// ── build the contents slide now that we know every page ──
const SECTIONS = { 'Getting started': 3, 'Menus one by one': 8, 'Everyday use': MENU.length + 8, 'Find anything': MENU.length + 12 };
const tocRows = [];
slides.forEach((s, i) => {
  const pg = i + 1;
  if (pg === 1 || pg === 2) return;
  for (const [name, at] of Object.entries(SECTIONS)) {
    if (at === pg) tocRows.push(`<div class="row hdr"><span class="lbl">${esc(name)}</span></div>`);
  }
  tocRows.push(`<div class="row"><span class="pg">${pg}</span><span class="lbl">${esc(s.title)}</span></div>`);
});
slides[1].html = page('', header('📖', 'Start here', 'Contents', 'Every page has its number in the bottom-right corner') + `
  <div class="toc">${tocRows.join('')}</div>`, '2');

// stamp the real page number into every footer (see PGN note above)
slides.forEach((s, i) => { s.html = s.html.split(PGN).join(String(i + 1)); });

// ═══════════════════ render ═══════════════════
(async () => {
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(DIST, { recursive: true });
  const pad = n => String(n).padStart(2, '0');

  slides.forEach((s, i) => fs.writeFileSync(path.join(WORK, pad(i + 1) + '.html'), s.html, 'utf8'));
  fs.writeFileSync(path.join(HERE, 'titles.json'), JSON.stringify(slides.map(s => s.title), null, 2), 'utf8');
  console.log(`slides: ${slides.length}`);
  if (missingShots.length) console.log(`missing screenshots (placeholders drawn): ${[...new Set(missingShots)].join(', ')}`);
  if (htmlOnly) { console.log('--html: wrote ' + WORK); return; }

  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--force-device-scale-factor=1'] });
  const pg = await b.newPage();
  await pg.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  for (let i = 0; i < slides.length; i++) {
    const f = path.join(WORK, pad(i + 1) + '.html');
    await pg.goto('file:///' + f.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 180));
    await pg.screenshot({ path: path.join(DIST, pad(i + 1) + '.jpg'), type: 'jpeg', quality: 90,
      clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    process.stdout.write(`\r  rendered ${i + 1}/${slides.length}`);
  }
  console.log('');

  // combined PDF
  const imgs = slides.map((_, i) => 'file:///' + path.join(DIST, pad(i + 1) + '.jpg').replace(/\\/g, '/'));
  await pg.setContent(`<style>@page{size:1920px 1080px;margin:0}
    body{margin:0}img{width:1920px;height:1080px;display:block;page-break-after:always}</style>
    ${imgs.map(s => `<img src="${s}">`).join('')}`, { waitUntil: 'load', timeout: 120000 });
  // networkidle0 never settles with this many large local images — wait on decode instead
  await pg.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
  await pg.pdf({ path: path.join(DIST, 'admin-easy-en.pdf'), width: '1920px', height: '1080px', printBackground: true, pageRanges: `1-${slides.length}` });
  await b.close();

  // clean up stale jpgs from a previous, longer run
  fs.readdirSync(DIST).filter(f => /^\d+\.jpg$/.test(f))
    .filter(f => parseInt(f) > slides.length)
    .forEach(f => { fs.unlinkSync(path.join(DIST, f)); console.log('removed stale ' + f); });

  console.log('done → ' + DIST);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
