// BTS 1 새 교재 렌더러 — course.mjs(설계 데이터) → bts1-full.html
import fs from 'node:fs';
// 사용: node render.mjs <course.mjs> <out.html> "<권 이름>"   (인자 없으면 BTS 1)
const [,, CF = './course.mjs', OUT = 'bts1-full.html', BOOK = 'BTS 1'] = process.argv;
const { COURSE } = await import(new URL(CF.startsWith('/') ? 'file://' + CF : CF, import.meta.url).href);
const D = process.env.TB_DIR || '/tmp/claude-0/-home-user-mangoiweb/85480cb3-ca51-5e34-999e-e4b609c3658d/scratchpad/tb/';
const P = process.env.IMG_DIR || '/home/user/mangoiweb/cloudflare-deploy/public/img/';
const css = fs.readFileSync(D + 'base.css', 'utf8');
const used = new Set();
const GENREQ = fs.existsSync(D + 'gen/requests.json') ? Object.fromEntries(JSON.parse(fs.readFileSync(D + 'gen/requests.json', 'utf8')).map(r => [r.key, r.prompt])) : {};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// 문장 안의 ___ 를 빈칸으로, **x** 를 강조로
const fmt = s => esc(s).replace(/_{3,}/g, '<span class="bl"></span>').replace(/\*\*(.+?)\*\*/g, '<b class="hl">$1</b>');
const img = (id, style = '', cls = 'ph') => {
  if (!id) return '';
  if (String(id).startsWith('need:')) { const [e, t] = id.slice(5).split('|'); return `<div class="${cls} need" style="${style}"><span class="e">${e}</span>${t || '새 사진 필요'}</div>`; }
  if (String(id).startsWith('gen:') && !fs.existsSync((process.env.GEN_DIR || D + 'gen/') + id.slice(4) + '.webp')) { const g = GENREQ[id.slice(4)]; return `<div class="${cls} need" style="${style}"><span class="e">🎨</span>새 사진 생성 중${g ? '<br>' + esc(g).slice(0, 60) : ''}</div>`; }
  used.add(String(id)); return `<div class="${cls}" style="${style}"><img data-p="${id}" alt=""></div>`;
};
const MANGO = (style) => `<img class="mango" data-p="mango" style="${style}" alt="">`;
const WHO = { Yoona: '#e07a00', Jay: '#2a9d8f', Jane: '#7b5ea7', Bob: '#1d70b8', John: '#2a9d8f', Anne: '#7b5ea7', Jude: '#1d70b8', Teacher: '#b4417d', Mango: '#e0a100', 'Miss Maria': '#b4417d', A: '#2a9d8f', B: '#7b5ea7' };
const av = w => `<div class="av" style="background:${WHO[w] || '#5b6477'}">${w === 'Mango' ? '<img data-p="mango" alt="">' : esc(w.replace('Miss ', '')[0])}</div>`;

// 🔊 누르면 소리 — 서버 음성(누를 때만 받음). 빈칸(___)이 든 문장은 답이 새므로 버튼을 안 붙인다.
const MALE = new Set(['Jay', 'Bob', 'John', 'Jude', 'Ken', 'Mike', 'Max', 'Mister Jackson', 'Mister Jay', 'B', 'Mango']);
const clean = t => String(t).replace(/\*\*(.+?)\*\*/g, '$1').replace(/\([^)]*\)/g, ' ').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, ' ').replace(/\s{2,}/g, ' ').trim();
let sayN = 0;
const say = (t, who, cls = '') => {
  if (t == null || /_{3,}|…|\.\.\./.test(String(t))) return '';
  const c = clean(t); if (!c || !/[A-Za-z]/.test(c)) return '';
  sayN++;
  return `<button type="button" class="snd ${cls}" data-say="${esc(c).replace(/"/g, '&quot;')}" data-v="${MALE.has(who) ? 'orion' : 'asteria'}" aria-label="듣기: ${esc(c).replace(/"/g, '&quot;')}">🔊</button>`;
};

function slide(L, s, n) {
  const top = `<div class="s-bg"></div><div class="s-top"><img data-p="mango" alt="">${esc(BOOK)} · ${esc(L.unit)} · ${esc(L.code)}</div><div class="s-pn">${n}</div>`;
  const dock = `<div class="s-dock"><span>© 2026 Mangoi</span></div>`;
  const T = (small, big, sz) => `<div class="s-title"${sz ? ` style="font-size:${sz}cqw"` : ''}><small>${esc(small || L.title)}</small>${fmt(big)}</div>`;
  let b = '';
  switch (s.t) {
    case 'cover':
      b = `<div class="cov-l">${img(s.img, 'position:absolute;inset:0;border-radius:0')}</div>
        <div class="cov-r"><div class="cov-code">${esc(BOOK)} · ${esc(L.unit)} · ${esc(L.code)}</div><div class="cov-t">${esc(L.title)}</div>
        <div class="cov-q"><span>Big Question</span>${fmt(s.q)}</div>${s.story ? `<div class="cov-s">📖 ${fmt(s.story)}</div>` : ''}</div>
        ${MANGO('right:3cqw;bottom:12cqw;width:10cqw')}`;
      return `<div class="slide">${b}${dock}</div>`;
    case 'goals':
      b = T('Today', 'I can…') + `<div class="s-body" style="display:grid;gap:1.4cqw;top:14.5cqw">` +
        s.items.map((g, i) => `<div class="card goal"><div class="gn">${i + 1}</div><div><div class="ge">${fmt(g[0])}</div><div class="gk kk">${esc(g[1])}</div></div></div>`).join('') + `</div>` + MANGO('right:3cqw;top:12cqw;width:8cqw');
      break;
    case 'rules':
      b = T('Class Rules', "Let's do this!") + `<div class="s-body" style="display:grid;grid-template-columns:repeat(4,1fr);gap:1.4cqw">` +
        [['👂', 'Listen', '듣기', '18555'], ['👀', 'Focus', '집중하기', '18170'], ['🙋', 'Join in', '참여하기', '19364'], ['❓', 'Ask questions', '질문하기', '18593']].map(r =>
          `<div class="card" style="display:flex;flex-direction:column;overflow:hidden">${img(r[3], 'flex:1;min-height:0;border-radius:0')}<div style="padding:1cqw;text-align:center"><div style="font:700 3cqw/1.1 Andika">${r[0]} ${r[1]}</div><div class="kk" style="font-size:1.9cqw;color:#4b5565">${r[2]}</div></div></div>`).join('') + `</div>`;
      break;
    case 'song':
      { const long = s.lines.length > 5; // 6~8줄 새 단원 노래: 사진을 좁히고 글자를 줄여 한 화면에 / long lyrics fit on one slide
      const fs = Math.min(2.7, 96 / Math.max(...s.lines.map(l => l.length))).toFixed(2); // 가장 긴 줄이 한 줄에 들어가는 만큼만 줄임
      b = T(s.small || "Let's sing!", s.title) + `<div class="s-body" style="display:grid;grid-template-columns:${long ? '.8fr 1.7fr' : '1fr 1.25fr'};gap:${long ? '1.8cqw' : '2.5cqw'}">${img(s.img, 'height:100%')}<div class="card song${long ? ' long' : ''}"${long ? ` style="font-size:${fs}cqw"` : ''}>${s.lines.map(l => `<div>${fmt(l)} ${say(l)}</div>`).join('')}</div></div>`; }
      break;
    case 'vocab': {
      const cols = s.cols || (s.words.length > 8 ? 5 : s.words.length > 6 ? 4 : 3);
      b = T(s.small || 'Vocabulary', s.title || (s.hide ? 'Say it! 🔒' : 'Words')) + `<div class="s-body" style="display:grid;grid-template-columns:repeat(${cols},1fr);grid-auto-rows:minmax(0,1fr);gap:1.1cqw;top:14cqw">` +
        s.words.map(w => `<div class="card vw">${say(w[0], '', 'corner')}${img(w[2], 'flex:1;min-height:0;border-radius:1.2cqw')}<div class="vwe">${esc(w[0])}</div><div class="kk vwk${s.hide ? ' hide' : ''}">${esc(w[1])}</div></div>`).join('') + `</div>`;
      break; }
    case 'rule':
      b = T('Find the rule 🔍', s.title) + `<div class="s-body" style="display:grid;grid-template-columns:1fr 1fr;gap:2cqw">` +
        [s.left, s.right].map((g, i) => `<div class="card grp" style="border-top:.8cqw solid ${i ? '#7b5ea7' : '#2a9d8f'}"><div class="gh" style="color:${i ? '#6a4a9c' : '#1f7a6f'}">${i ? '▲' : '●'} ${esc(g.h)}</div>${g.ex.map(e => `<div class="ge2">${fmt(e)} ${say(e)}</div>`).join('')}</div>`).join('') +
        `</div><div class="q-strip">🤔 ${fmt(s.q)}</div>`;
      break;
    case 'table':
      b = T(s.small || 'Pattern', s.title) + `<div class="s-body"><table class="pt">${s.head ? `<tr>${s.head.map(h => `<th>${fmt(h)}</th>`).join('')}</tr>` : ''}${s.rows.map(r => `<tr>${r.map((c, i) => `<td${i === 0 ? ' class="c0"' : ''}>${fmt(c)}</td>`).join('')}</tr>`).join('')}</table>${s.tip ? `<div class="tip kk">💡 ${esc(s.tip)}</div>` : ''}</div>`;
      break;
    case 'qa': // 사진 + 질문 + 답(빈칸)
      b = T(s.small, s.title || 'Look and say', 4.2) + img(s.img, 'position:absolute;left:6cqw;top:14cqw;width:47cqw;height:31.5cqw;border-radius:2cqw') +
        (s.label ? `<div class="lbl">${esc(s.label)}</div>` : '') +
        `<div class="qbox"><div class="ask2">${fmt(s.q)} ${say(s.q)}</div><div class="ans2">${fmt(s.a)} ${say(s.a, 'B')}</div>${s.chips ? `<div class="chips2">${s.chips.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}</div>` + MANGO('left:53cqw;top:12.5cqw;width:6.5cqw');
      break;
    case 'story':
      b = T(s.small || 'Story', s.title, 4.2) + `<div class="s-body" style="display:grid;grid-template-columns:${s.img ? '.85fr 1.15fr' : '1fr'};gap:2cqw;top:14cqw">${s.img ? img(s.img, 'height:100%') : ''}<div class="talk" style="${(s.lines.length > 5 || s.lines.reduce((a, l) => a + l[1].length, 0) > 190) ? 'gap:.5cqw' : ''}">` +
        s.lines.map(([w, t]) => `<div class="tl">${av(w)}<div><div class="tn">${esc(w)}</div><div class="tb"${(s.lines.length > 5 || s.lines.reduce((a, l) => a + l[1].length, 0) > 190) ? ' style="font-size:1.85cqw;padding:.5cqw 1.2cqw"' : s.lines.length > 4 ? ' style="font-size:2.1cqw;padding:.6cqw 1.3cqw"' : ''}>${fmt(t)} ${say(t, w, 'in')}</div></div></div>`).join('') + `</div></div>`;
      break;
    case 'ox':
      b = T('True or False?', s.title || '⭕ or ❌ ?', 4.2) + img(s.img, 'position:absolute;left:6cqw;top:14cqw;width:47cqw;height:31.5cqw;border-radius:2cqw') +
        `<div class="qbox"><div class="ask2" style="font-size:3.2cqw">${fmt(s.s)} ${say(s.s)}</div><div class="oxb"><span class="o">⭕ True</span><span class="x">❌ False</span></div><div class="kk" style="font-size:1.8cqw;color:#4b5565;margin-top:1cqw">👍 맞으면 엄지 위 · 👎 틀리면 엄지 아래</div></div>`;
      break;
    case 'guess':
      b = T('Guess who!', s.title || 'Who is it?', 4.2) + `<div class="gw">${img(s.img, 'position:absolute;inset:0;border-radius:0')}<div class="tiles">${Array.from({ length: 9 }, (_, i) => `<div class="tile${(s.open || []).includes(i) ? ' op' : ''}">${i + 1}</div>`).join('')}</div></div>` +
        `<div class="qbox" style="left:60cqw"><div class="ask2">${fmt(s.q || 'Is it a boy?')} ${say(s.q || 'Is it a boy?')}</div>${s.chips ? `<div class="chips2">${s.chips.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}</div>`;
      break;
    case 'count':
      b = T('Count!', s.title || 'How many?', 4.2) + img(s.img, 'position:absolute;left:6cqw;top:14cqw;width:47cqw;height:31.5cqw;border-radius:2cqw') +
        `<div class="qbox"><div class="ask2">${fmt(s.q)} ${say(s.q)}</div><div class="ans2">${fmt(s.a)} ${say(s.a, 'B')}</div>${s.chips ? `<div class="chips2">${s.chips.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}</div>`;
      break;
    case 'numbers':
      b = T('Numbers', s.title) + `<div class="s-body" style="display:grid;grid-template-columns:repeat(5,1fr);grid-auto-rows:minmax(0,1fr);gap:1.1cqw;top:14cqw">` +
        s.nums.map(([d, w]) => `<div class="card num"><div class="nd">${d}</div><div class="nw">${esc(w)}</div>${say(w, '', 'corner')}</div>`).join('') + `</div>`;
      break;
    case 'memory':
      b = T('Memory game 🧠', s.title, 4.2) + `<div class="s-body" style="display:grid;grid-template-columns:repeat(${s.items.length > 4 ? 3 : 2},1fr);grid-auto-rows:minmax(0,1fr);gap:1.2cqw;right:30cqw;top:14cqw">` +
        s.items.map(i => `<div class="card" style="overflow:hidden">${s.hidden ? `<div class="mq">?</div>` : img(i, 'height:100%;border-radius:0')}</div>`).join('') +
        `</div><div class="qbox" style="left:72cqw;width:24cqw"><div class="ask2" style="font-size:2.5cqw">${fmt(s.q)}</div>${s.a ? `<div class="ans2" style="font-size:2.5cqw">${fmt(s.a)}</div>` : ''}</div>`;
      break;
    case 'search': {
      b = T("Let's play!", s.title || 'Find the words 🔎', 4.2) + `<div class="s-body" style="display:grid;grid-template-columns:auto 1fr;gap:3cqw;align-items:center">` +
        `<div class="ws">${s.grid.map(r => `<div>${r.split('').map(c => `<span>${c}</span>`).join('')}</div>`).join('')}</div><div class="wl">${s.words.map(w => `<div>☐ ${esc(w)}</div>`).join('')}</div></div>`;
      break; }
    case 'scramble':
      b = T('Word puzzle', s.title || 'Unscramble!', 4.2) + `<div class="s-body" style="display:grid;grid-template-columns:repeat(${s.items.length},1fr);gap:1.4cqw">` +
        s.items.map(([sc, id]) => `<div class="card" style="display:flex;flex-direction:column;overflow:hidden">${img(id, 'flex:1;min-height:0;border-radius:0')}<div class="scr">${esc(sc)}</div><div class="bl2"></div></div>`).join('') + `</div>`;
      break;
    case 'order':
      b = T('Make a sentence', s.title || 'Put in order!', 4.2) + img(s.img, 'position:absolute;left:6cqw;top:14cqw;width:40cqw;height:31.5cqw;border-radius:2cqw') +
        `<div class="qbox" style="left:50cqw;width:44cqw"><div class="wchips">${s.words.map(w => `<span>${esc(w)}</span>`).join('')}</div><div class="ans2" style="margin-top:2cqw">${fmt('___________________ .')}</div></div>`;
      break;
    case 'match':
      b = T(s.small || 'Match it!', s.title || 'Match it!', 4.2) + `<div class="s-body" style="display:grid;grid-template-columns:1fr auto 1fr;grid-template-rows:minmax(0,1fr);gap:3cqw;align-items:stretch">` +
        `<div style="display:grid;grid-template-rows:repeat(${s.left.length},minmax(0,1fr));gap:1cqw;min-height:0">${s.left.map((id, i) => `<div class="mrow"><b>${i + 1}</b>${img(id, 'flex:1;height:100%')}</div>`).join('')}</div><div class="mdots" style="grid-template-rows:repeat(${s.left.length},minmax(0,1fr));min-height:0">${s.left.map(() => '<span>•</span>').join('')}</div>` +
        `<div style="display:grid;grid-template-rows:repeat(${s.right.length},minmax(0,1fr));gap:1cqw;min-height:0">${s.right.map((w, i) => `<div class="card mw">${String.fromCharCode(65 + i)}. ${fmt(w)}</div>`).join('')}</div></div>`;
      break;
    case 'fill': // 문장 여러 개
      b = T(s.small || 'Practice', s.title, 4.2) + `<div class="s-body" style="display:grid;grid-template-columns:${s.img ? '.8fr 1.2fr' : '1fr'};gap:2cqw">${s.img ? img(s.img, 'height:100%') : ''}<div class="card fl">${s.lines.map((l, i) => `<div><b>${i + 1}.</b> ${fmt(l)}</div>`).join('')}${s.chips ? `<div class="chips2" style="margin-top:1.4cqw">${s.chips.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}</div></div>`;
      break;
    case 'yourturn':
      b = T('Your turn! 🎤', s.title, 4.2) + `<div class="s-body" style="display:grid;grid-template-columns:${s.img ? '.8fr 1.2fr' : '1fr'};gap:2cqw">${s.img ? img(s.img, 'height:100%') : ''}<div class="card yt">${s.lines.map(l => `<div>${fmt(l)} ${say(l)}</div>`).join('')}${s.chips ? `<div class="chips2">${s.chips.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}</div></div>` + MANGO('right:3cqw;top:11cqw;width:7cqw');
      break;
    case 'ican':
      b = T('I can ✅', 'What did we learn?') + `<div class="s-body${s.items.length > 4 ? ' ican-sm' : ''}" style="display:grid;gap:${s.items.length > 4 ? '.7cqw' : '1.3cqw'};grid-template-rows:repeat(${s.items.length},minmax(0,1fr))">${s.items.map(g => `<div class="card goal"><div class="gn ck">✓</div><div><div class="ge">${fmt(g[0])}</div><div class="gk kk">${esc(g[1])}</div></div><div class="stars">☆☆☆</div></div>`).join('')}</div>`;
      break;
    case 'next':
      b = `<div class="cov-l" style="width:55%">${img(s.img, 'position:absolute;inset:0;border-radius:0')}</div><div class="nx"><div class="nx-s">Next time… 👀</div><div class="nx-t">${fmt(s.q)}</div><div class="kk nx-k">${esc(s.ko)}</div></div>`;
      return `<div class="slide">${b}${dock}</div>`;
    case 'goodbye':
      b = T("Let's sing!", 'Goodbye Song') + `<div class="s-body" style="display:grid;grid-template-columns:1fr 1.25fr;gap:2.5cqw">${img('12996', 'height:100%')}<div class="card song">${["It's time to go home. (×3)", 'It\'s time to say "Goodbye."', 'I had so much fun,', 'and you had so much fun.', 'We all had so much fun,', 'and now we say "Goodbye!"', 'Goodbye, goodbye.', 'See you again!'].map(l => `<div>${fmt(l)} ${say(l)}</div>`).join('')}</div></div>`;
      break;
    case 'read': // 읽기 글(상위 권) — 문단마다 🔊
      b = T(s.small || "Let's read", s.title, 4.2) + `<div class="s-body" style="display:grid;grid-template-columns:${s.img ? '.75fr 1.25fr' : '1fr'};gap:2cqw">${s.img ? img(s.img, 'height:100%') : ''}<div class="card rd">${s.paras.map(p => `<p>${fmt(p)} ${say(p)}</p>`).join('')}${s.gloss ? `<div class="gl kk">${s.gloss.map(g => `<span><b>${esc(g[0])}</b> ${esc(g[1])}</span>`).join('')}</div>` : ''}</div></div>`;
      break;
    case 'discuss': // 생각 말하기 질문 목록
      b = T(s.small || "Let's talk 💬", s.title, 4.2) + `<div class="s-body" style="display:grid;grid-template-columns:${s.img ? '.8fr 1.2fr' : '1fr'};gap:2cqw">${s.img ? img(s.img, 'height:100%') : ''}<div class="card dq">${s.qs.map((q, i) => `<div><b>${i + 1}</b><span>${fmt(q)} ${say(q)}</span></div>`).join('')}${s.chips ? `<div class="chips2">${s.chips.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}</div></div>`;
      break;
    default: throw new Error('unknown slide type ' + s.t);
  }
  return `<div class="slide">${top}${b}${dock}</div>`;
}

const extraCss = `
.ph img{width:100%;height:100%;object-fit:cover;display:block}
.bl{display:inline-block;min-width:9cqw;border-bottom:.35cqw solid currentColor;margin:0 .3cqw;vertical-align:-.2cqw}
.hl{color:#e07a00}
.cov-l{position:absolute;left:0;top:0;bottom:10%;width:52%;overflow:hidden}
.cov-r{position:absolute;left:55%;right:4cqw;top:6cqw}
.cov-code{font:700 1.8cqw/1 Andika;color:#e07a00;letter-spacing:.1cqw}
.cov-t{font:700 6.2cqw/1.02 Andika;margin:1.2cqw 0 2.2cqw;color:#14213d}
.cov-q{background:#14213d;color:#fff;border-radius:1.6cqw;padding:1.4cqw 1.8cqw;font:700 2.9cqw/1.2 Andika}
.cov-q span{display:block;font:700 1.4cqw/1 Andika;color:#ffd07a;letter-spacing:.15cqw;text-transform:uppercase;margin-bottom:.7cqw}
.cov-s{margin-top:1.6cqw;font:700 2.1cqw/1.35 Andika;color:#4b5565;max-width:28cqw}
.goal{display:flex;align-items:center;gap:2cqw;padding:1.2cqw 2cqw}
.gn{flex:none;width:5cqw;height:5cqw;border-radius:50%;background:#e07a00;color:#fff;font:700 2.8cqw/5cqw Andika;text-align:center}
.gn.ck{background:#2a9d8f}
.ge{font:700 3.1cqw/1.15 Andika}.gk{font-size:1.9cqw;color:#4b5565;margin-top:.4cqw}
.stars{margin-left:auto;font-size:3.4cqw;color:#e0a100;letter-spacing:.3cqw}
.song{padding:2cqw 2.6cqw;display:flex;flex-direction:column;justify-content:center;gap:.5cqw;font:700 2.7cqw/1.25 Andika}
.song.long{padding:1.2cqw 1.8cqw;gap:.25cqw;line-height:1.2}
.vw{padding:.7cqw;display:flex;flex-direction:column;align-items:center;min-height:0}
.vwe{font:700 2.5cqw/1.1 Andika;margin-top:.5cqw}.vwk{font-size:1.75cqw;color:#4b5565;padding:.1cqw .6cqw;margin-top:.2cqw}
.grp{padding:1.6cqw 2cqw}.gh{font:700 3.2cqw/1 Andika;margin-bottom:1.2cqw}.ge2{font:700 2.9cqw/1.5 Andika}
.q-strip{position:absolute;left:7cqw;right:7cqw;bottom:11.5cqw;background:#fff4e0;border-radius:1.4cqw;padding:.9cqw 1.6cqw;font:700 2.4cqw/1.2 Andika;color:#8a4b00}
.pt{width:100%;border-collapse:separate;border-spacing:0 .9cqw;font:700 2.8cqw/1.2 Andika}
.pt th{font:700 1.9cqw/1 Andika;color:#5b6477;text-align:left;padding:0 1.6cqw}
.pt td{background:#fff;padding:1.3cqw 1.6cqw;border-top:.14cqw solid #efe6d3;border-bottom:.14cqw solid #efe6d3}
.pt td:first-child{border-left:.14cqw solid #efe6d3;border-radius:1.4cqw 0 0 1.4cqw}.pt td:last-child{border-right:.14cqw solid #efe6d3;border-radius:0 1.4cqw 1.4cqw 0}
.pt td.c0{color:#e07a00}
.tip{margin-top:1cqw;font-size:2cqw;color:#8a4b00;background:#fff4e0;border-radius:1cqw;padding:.8cqw 1.4cqw}
.lbl{position:absolute;left:7.5cqw;top:40.5cqw;background:#14213d;color:#fff;font:700 2.2cqw/1 Andika;padding:.7cqw 1.4cqw;border-radius:1cqw}
.qbox{position:absolute;left:58cqw;right:5cqw;top:17cqw}
.ask2{background:#fff;border:.3cqw solid #14213d;border-radius:2cqw;padding:1.2cqw 1.8cqw;font:700 3.2cqw/1.2 Andika}
.ans2{margin-top:1.6cqw;background:#7b5ea7;color:#fff;border-radius:1.6cqw;padding:1.3cqw 1.8cqw;font:700 3.2cqw/1.25 Andika}
.chips2{display:flex;flex-wrap:wrap;gap:.8cqw;margin-top:1.4cqw}
.chips2 span,.wchips span{background:#fff4e0;border:.2cqw solid #f0c98a;border-radius:9cqw;padding:.5cqw 1.4cqw;font:700 2.3cqw/1.2 Andika;color:#8a4b00}
.wchips{display:flex;flex-wrap:wrap;gap:1cqw}.wchips span{font-size:3cqw;background:#e7f5f2;border-color:#9fd6cd;color:#14544c}
.talk{display:flex;flex-direction:column;justify-content:center;gap:1.1cqw}
.tl{display:flex;gap:1.1cqw;align-items:flex-start}
.av{flex:none;width:4.8cqw;height:4.8cqw;border-radius:50%;color:#fff;font:700 2.2cqw/4.8cqw Andika;text-align:center;overflow:hidden;background:#fff}
.av img{width:100%;height:100%;object-fit:contain;background:#fff4e0}
.tn{font:700 1.5cqw/1 Andika;color:#5b6477;margin-bottom:.3cqw}
.tb{background:#fff;border:.14cqw solid #efe6d3;border-radius:0 1.6cqw 1.6cqw 1.6cqw;padding:.8cqw 1.5cqw;font:700 2.5cqw/1.25 Andika;box-shadow:0 .3cqw 1cqw rgba(20,33,61,.08)}
.oxb{display:flex;gap:1.2cqw;margin-top:1.6cqw}.oxb span{flex:1;text-align:center;border-radius:1.6cqw;padding:1.2cqw;font:700 3cqw/1 Andika;color:#fff}
.oxb .o{background:#2a9d8f}.oxb .x{background:#d1495b}
.gw{position:absolute;left:6cqw;top:13.5cqw;width:50cqw;height:33cqw;border-radius:2cqw;overflow:hidden}
.tiles{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:.4cqw;padding:.4cqw}
.tile{background:linear-gradient(135deg,#ffb347,#e07a00);border-radius:1cqw;color:#fff;font:700 4cqw/1 Andika;display:flex;align-items:center;justify-content:center}
.tile.op{background:transparent;color:transparent}
.num{display:flex;flex-direction:column;align-items:center;justify-content:center}.nd{font:700 4.6cqw/1 Andika;color:#e07a00}.nw{font:700 2.3cqw/1.2 Andika}
.mq{height:100%;display:flex;align-items:center;justify-content:center;font:700 8cqw/1 Andika;color:#fff;background:linear-gradient(135deg,#7b5ea7,#b08fdc)}
.ws{background:#fff;border-radius:1.6cqw;padding:1.4cqw;box-shadow:0 .5cqw 1.6cqw rgba(20,33,61,.1)}
.ws div{display:flex}.ws span{width:3.9cqw;height:3.9cqw;font:700 2.4cqw/3.9cqw Andika;text-align:center;text-transform:lowercase}
.wl{font:700 3.2cqw/1.7 Andika}
.scr{font:700 2.6cqw/1 Andika;text-align:center;letter-spacing:.3cqw;color:#7b5ea7;padding:1cqw 0 .6cqw}.bl2{border-bottom:.3cqw solid #14213d;margin:0 1.4cqw 1.4cqw}
.ican-sm .goal{padding:.4cqw 1.6cqw}.ican-sm .ge{font-size:2.3cqw}.ican-sm .gk{font-size:1.5cqw;margin-top:.1cqw}.ican-sm .gn{width:3.6cqw;height:3.6cqw;font-size:2cqw;line-height:3.6cqw}.ican-sm .stars{font-size:2.4cqw}
.mrow{display:flex;min-height:0;height:100%;gap:1cqw;align-items:center;font:700 2.6cqw/1 Andika;min-height:0}.mrow b{width:2.4cqw}
.mdots{display:grid;grid-auto-rows:minmax(0,1fr);gap:1cqw;font-size:4cqw;color:#e07a00;align-items:center}
.mw{display:flex;align-items:center;padding:0 2cqw;font:700 2.9cqw/1.1 Andika}
.fl{padding:1.8cqw 2.4cqw;display:flex;flex-direction:column;justify-content:center;gap:1.1cqw;font:700 2.7cqw/1.3 Andika}.fl b{color:#e07a00}
.yt{padding:2cqw 2.6cqw;display:flex;flex-direction:column;justify-content:center;gap:1cqw;font:700 3cqw/1.35 Andika}
.rd{padding:1.6cqw 2.2cqw;display:flex;flex-direction:column;justify-content:center;gap:1cqw;font:700 2.35cqw/1.4 Andika;overflow:hidden}.rd p{margin:0}
.gl{display:flex;flex-wrap:wrap;gap:.6cqw 1.4cqw;font-size:1.7cqw;color:#4b5565;border-top:.14cqw dashed #efe6d3;padding-top:.8cqw}.gl b{color:#e07a00}
.dq{padding:1.8cqw 2.4cqw;display:flex;flex-direction:column;justify-content:center;gap:1.1cqw;font:700 2.6cqw/1.3 Andika}.dq>div{display:flex;gap:1.2cqw;align-items:flex-start}.dq>div>b{flex:none;width:3.6cqw;height:3.6cqw;border-radius:50%;background:#2a9d8f;color:#fff;font-size:2cqw;line-height:3.6cqw;text-align:center}
.nx{position:absolute;left:58%;right:4cqw;top:10cqw}.nx-s{font:700 2.4cqw/1 Andika;color:#e07a00}.nx-t{font:700 4.6cqw/1.12 Andika;margin:1.4cqw 0}.nx-k{font-size:2.1cqw;color:#4b5565}
`;
const sayCss = `
.snd{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;width:1.9em;height:1.9em;padding:0;margin-left:.2em;border:.1em solid #f0c98a;border-radius:50%;background:#fff4e0;font-size:.62em;line-height:1;cursor:pointer;box-shadow:0 .1em .3em rgba(20,33,61,.12)}
.snd:hover{background:#ffe3b3}.snd:focus-visible{outline:.15em solid #e07a00;outline-offset:.1em}
.snd.on{background:#e07a00;border-color:#e07a00;animation:sayp .9s ease-in-out infinite}
@keyframes sayp{50%{transform:scale(1.12)}}
.snd.corner{position:absolute;top:.8cqw;right:.8cqw;z-index:2;font-size:2cqw;margin:0}
.vw,.num{position:relative}
.ans2 .snd,.ans2 .snd.in{background:#fff;border-color:#fff}
@media print{.snd{display:none!important}}
`;
const pageCss = `
.saybar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0 4px;font-size:14px}
.saybar button{font:600 13px "Noto Sans KR";border:1px solid var(--line);background:var(--paper);color:var(--ink);border-radius:99px;padding:5px 11px;cursor:pointer}
.saybar button[aria-pressed="true"]{background:#2a9d8f;color:#fff;border-color:#2a9d8f}
.saybar .st{color:var(--sub)}
.tabs{position:sticky;top:0;z-index:5;background:var(--bg);padding:10px 0;display:flex;flex-wrap:wrap;gap:6px;border-bottom:1px solid var(--line)}
.tabs button{font:600 14px "Noto Sans KR";border:1px solid var(--line);background:var(--paper);color:var(--ink);border-radius:99px;padding:6px 12px;cursor:pointer}
.tabs button[aria-pressed="true"]{background:#e07a00;color:#fff;border-color:#e07a00}
.lesson[hidden]{display:none}
.sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:10px;margin:10px 0 18px}
.sum div{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:10px 12px;font-size:14px}
.sum b{display:block;font-size:22px}
.pg .notes .kind{display:inline-block;font-size:12px;font-weight:700;border-radius:6px;padding:1px 7px;margin-bottom:6px}
.k-new{background:var(--okbg);color:var(--ok)}.k-keep{background:#e8eefb;color:#2c4a8a}.k-fix{background:var(--warnbg);color:var(--warn)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .k-keep{background:#1e2a44;color:#a9c1f2}}
`;

let tabs = '', lessons = '';
COURSE.lessons.forEach((L, li) => {
  const nNew = L.slides.filter(s => s.k === 'new').length;
  const needs = L.slides.flatMap(s => JSON.stringify(s).match(/need:[^|"]*/g) || []).length;
  tabs += `<button type="button" data-l="${li}" aria-pressed="${li === 0}">${esc(L.code)} ${esc(L.tab)}</button>`;
  let body = `<section class="lesson" data-l="${li}"${li ? ' hidden' : ''}><h2>${esc(L.code)} · ${esc(L.title)}</h2><p class="lead">${L.intro}</p>
   <div class="sum"><div>새 교재<b>${L.slides.length}쪽</b></div><div>원본<b>${L.orig}쪽</b></div><div>새로 넣은 활동<b>${nNew}쪽</b></div><div>고친 문제<b>${L.fixed.length}건+</b></div></div>
   <div class="box"><b>이 과에서 고친 것 (원본 문제)</b><ul>${L.fixed.map(f => `<li>${f}</li>`).join('')}</ul></div>`;
  L.slides.forEach((s, i) => {
    const kind = s.k === 'new' ? ['k-new', '🆕 새 활동'] : s.k === 'fix' ? ['k-fix', '✏️ 원본 수정'] : ['k-keep', '원본 내용'];
    body += `<div class="pg">${slide(L, s, i + 1)}<div class="notes"><span class="kind ${kind[0]}">${kind[1]}</span>${s.src ? `<div style="font-size:12px;color:var(--sub)">원본: ${esc(s.src)}</div>` : ''}<b class="t">${esc(s.nt || '')}</b>${s.n ? `<ul>${[].concat(s.n).map(x => `<li>${x}</li>`).join('')}</ul>` : ''}</div></div>`;
  });
  lessons += body + '</section>';
});

const imgs = {};
imgs.mango = 'data:image/png;base64,' + fs.readFileSync(P + 'mango-char.png').toString('base64');
const missing = [];
for (const id of used) {
  const f = id.startsWith('gen:') ? (process.env.GEN_DIR || D + 'gen/') + id.slice(4) + '.webp' : id.startsWith('c') ? P + 'scene-clips/' + id.slice(1) + '.webp' : P + 'scene-words/' + id + '.webp';
  if (!fs.existsSync(f)) { missing.push(id); continue; }
  imgs[id] = 'data:image/webp;base64,' + fs.readFileSync(f).toString('base64');
}
if (missing.length) throw new Error('없는 사진 번호: ' + missing.join(', '));

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(BOOK)} 새 교재</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Andika:wght@400;700&family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>${css}${extraCss}${sayCss}${pageCss}</style></head><body><div class="wrap">
${COURSE.head}
<nav class="tabs" aria-label="과 고르기">${tabs}</nav>
<div class="saybar">🔊 영어 문장·낱말 옆 동그라미를 누르면 원어민 음성이 나옵니다.
<span>속도</span><button type="button" data-r="1" aria-pressed="true">보통</button><button type="button" data-r="0.8" aria-pressed="false">🐢 천천히</button>
<span class="st" id="sayst" aria-live="polite">음성: 아직 안 들음</span></div>
${lessons}
${COURSE.foot}
</div>
<script>
const P=${JSON.stringify(imgs)};
document.querySelectorAll('img[data-p]').forEach(i=>{i.src=P[i.dataset.p]||''});
const bs=document.querySelectorAll('.tabs button'),ls=document.querySelectorAll('.lesson');
bs.forEach(b=>b.addEventListener('click',()=>{sayStop();bs.forEach(x=>x.setAttribute('aria-pressed',x===b));ls.forEach(l=>l.hidden=l.dataset.l!==b.dataset.l);window.scrollTo({top:0})}));
/* 🔊 누르면 소리 — 누를 때 그 문장만 받아 옵니다(교재 무게 0).
   1순위: 망고아이 서버 음성(POST /api/voice/tts — 웜업·AI 친구와 같은 목소리, 서버에 저장돼 두 번째부터 바로)
   2순위: 서버에 못 닿으면 기기에 내장된 목소리. 어느 쪽으로 났는지 위 줄에 적습니다. */
const TTS=/(^|\.)mangoi\.ai$/.test(location.hostname)?'/api/voice/tts':'https://mangoi.ai/api/voice/tts';
const aCache={};let aCur=null,aBtn=null,aSeq=0,aRate=1,serverDown=false;
const st=document.getElementById('sayst');
function sayStop(){aSeq++;try{aCur&&aCur.pause()}catch(e){}aCur=null;try{speechSynthesis.cancel()}catch(e){}if(aBtn)aBtn.classList.remove('on');aBtn=null}
function sayDone(my){if(my===aSeq&&aBtn){aBtn.classList.remove('on');aBtn=null}}
function device(t,v,my){
  try{const u=new SpeechSynthesisUtterance(t);u.lang='en-US';u.rate=aRate*0.95;
    const vs=speechSynthesis.getVoices().filter(x=>/^en/i.test(x.lang));
    const pick=vs.find(x=>/natural|neural|google/i.test(x.name)&&(v==='orion'?/male|guy|david|brian|christopher|alex|daniel/i:/female|aria|jenny|samantha|zira|ava|emma/i).test(x.name))||vs.find(x=>/natural|neural|google/i.test(x.name))||vs[0];
    if(pick)u.voice=pick;u.onend=u.onerror=()=>sayDone(my);speechSynthesis.speak(u);
    st.textContent='음성: 기기 목소리 (서버에 못 닿음 — 망고아이 사이트에서는 원어민 음성)';
  }catch(e){sayDone(my);st.textContent='음성: 이 기기에서는 소리를 낼 수 없어요'}
}
async function say(btn){
  if(aBtn===btn){sayStop();return}
  sayStop();const my=aSeq,t=btn.dataset.say,v=btn.dataset.v||'asteria';aBtn=btn;btn.classList.add('on');
  if(!serverDown){try{
    let u=aCache[v+'|'+t];
    if(!u){const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),6000);
      const r=await fetch(TTS,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:t,lang:'en',speaker:v}),signal:ctl.signal});clearTimeout(to);
      if(!r.ok||!/audio/.test(r.headers.get('content-type')||''))throw new Error('tts '+r.status);
      u=URL.createObjectURL(await r.blob());aCache[v+'|'+t]=u}
    if(my!==aSeq)return;
    aCur=new Audio(u);aCur.playbackRate=aRate;aCur.onended=aCur.onerror=()=>sayDone(my);await aCur.play();
    st.textContent='음성: 원어민 음성 (망고아이 서버)';return;
  }catch(e){if(my!==aSeq)return;if(!(e&&e.name==='NotAllowedError'))serverDown=true}}
  device(t,v,my);
}
document.addEventListener('click',e=>{const b=e.target.closest('.snd');if(b){e.preventDefault();say(b)}});
document.querySelectorAll('.saybar [data-r]').forEach(b=>b.addEventListener('click',()=>{aRate=+b.dataset.r;document.querySelectorAll('.saybar [data-r]').forEach(x=>x.setAttribute('aria-pressed',x===b));if(aCur)aCur.playbackRate=aRate}));

</script></body></html>`;
fs.writeFileSync(OUT.startsWith('/') ? OUT : D + OUT, html);
console.log('say', sayN, 'bytes', html.length, 'photos', used.size, 'slides', COURSE.lessons.reduce((a, l) => a + l.slides.length, 0));
