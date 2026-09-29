// New SIU 샘플 — 내용(JSON) → 1280×720 쪽 HTML. 사진은 저장소의 힉스필드 실사(/img/scene-*)만 씀.
import fs from 'fs';
const C = JSON.parse(fs.readFileSync(new URL('./siu-basic-001.content.json', import.meta.url)));
const IMG = p => `file:///home/user/mangoiweb/cloudflare-deploy/public/img/${p}.webp`;
const LOGO = 'file:///home/user/mangoiweb/cloudflare-deploy/public/img/mango-char.png';
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const fonts = fs.readFileSync(new URL('./fonts.css', import.meta.url), 'utf8');
const spk = '<span class="spk" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></span>';
const head = (s,n) => `<header><span class="tag">${esc(s.tag)}</span><span class="bk">SIU BASIC 001 · ${esc(C.title)}</span><span class="pg">${n}</span></header><h2>${esc(s.h)}</h2>`;
const say = []; // 쪽마다 읽을 문장 (tb-say 형식)
function slide(s, n){
  const L = [];
  let body='';
  switch(s.t){
    case 'cover':
      L.push(...s.say);
      body=`<div class="cover"><img class="ph" src="${IMG(s.img)}"><div class="cv"><div class="kick">SIU BASIC · Lesson 001</div><h1>${esc(C.title)}</h1><div class="ko">${esc(C.ko)}</div><div class="goal">Today you will introduce yourself, ask about hobbies,<br>and keep a conversation going.</div><img class="logo" src="${LOGO}"></div></div>`; break;
    case 'warm': case 'dialog':
      s.lines.forEach(l=>L.push(l[1]));
      body=head(s,n)+`<div class="split ${s.t}"><img class="ph" src="${IMG(s.img)}"><ol class="lines">${s.lines.map((l,i)=>`<li class="${i%2?'b':'a'}"><b>${esc(l[0])}</b><span>${esc(l[1])}</span>${spk}</li>`).join('')}</ol></div>`; break;
    case 'think': case 'would':
      L.push(...s.qs);
      body=head(s,n)+`<div class="split q ${s.t}">${s.img?`<img class="ph" src="${IMG(s.img)}">`:''}<ol class="qs">${s.qs.map((q,i)=>`<li><i>${s.t==='would'?'?':i+1}</i><span>${esc(q)}</span>${spk}</li>`).join('')}</ol></div>`; break;
    case 'vocab':
      s.words.forEach(w=>L.push(w[0]));
      body=head(s,n)+`<div class="vocab">${s.words.map(w=>`<figure><img src="${IMG(w[2])}"><figcaption><b>${esc(w[0])}</b><span>${esc(w[1])}</span>${spk}</figcaption></figure>`).join('')}</div>`; break;
    case 'define':
      s.items.forEach(d=>{L.push(d[0]+'. '+d[1][0].toUpperCase()+d[1].slice(1)+'.');L.push(d[2]);});
      body=head(s,n)+`<dl class="def">${s.items.map(d=>`<div><dt>${esc(d[0])}</dt><dd>${esc(d[1])}<em>${esc(d[2])}</em></dd>${spk}</div>`).join('')}</dl>`; break;
    case 'expr':
      s.pairs.forEach(p=>{L.push(p[0]);L.push(p[1]);});
      body=head(s,n)+`<div class="expr">${s.pairs.map(p=>`<div class="pair"><p class="qq">${esc(p[0])}</p><p class="aa">${esc(p[1])}</p>${spk}</div>`).join('')}</div>`; break;
    case 'read':
      L.push(...s.paras);
      body=head(s,n)+`<div class="split read"><div class="txt">${s.paras.map(p=>`<p>${esc(p)}</p>`).join('')}${spk}</div><img class="ph" src="${IMG(s.img)}"></div>`; break;
    case 'check':
      s.items.forEach(c=>L.push(c[0]));
      body=head(s,n)+`<ol class="tf">${s.items.map((c,i)=>`<li><i>${i+1}</i><span>${esc(c[0])}</span><em>T&nbsp;&nbsp;/&nbsp;&nbsp;F</em></li>`).join('')}</ol><p class="note">Read Reading 1 and 2 again, then circle T or F.</p>`; break;
    case 'role':
      s.cards.forEach(c=>L.push(c[2]));
      body=head(s,n)+`<div class="role">${s.cards.map(c=>`<article><img src="${IMG(c[1])}"><h3>${esc(c[0])}</h3><p>${esc(c[2])}</p></article>`).join('')}</div>`; break;
    case 'review':
      L.push(...s.items);
      body=head(s,n)+`<ul class="rev">${s.items.map(x=>`<li><span class="box"></span>${esc(x)}${spk}</li>`).join('')}</ul><p class="note">Check each one you can say without looking.</p>`; break;
    case 'bye':
      L.push(...s.say);
      body=`<div class="cover bye"><img class="ph" src="${IMG(s.img)}"><div class="cv"><h1>${esc(s.say[0])}</h1><div class="ko">${esc(s.say[1])}</div><div class="goal">Next lesson · SIU BASIC 002 — About You</div><img class="logo" src="${LOGO}"></div></div>`; break;
  }
  say.push([`[${C.book}] New / Slide${n}.JPG`, L.map(x=>[x])]);
  return `<section class="s k-${s.t}" id="s${n}">${body}</section>`;
}
const html = `<!doctype html><meta charset="utf-8"><style>${fonts}
:root{--ink:#13303A;--sub:#4F6770;--paper:#F3F6F6;--card:#fff;--mango:#EF9A12;--mangoD:#B86E00;--leaf:#2F7D57;--line:#D6E0E2}
*{box-sizing:border-box;margin:0;padding:0}body{background:#888;font-family:Lexend,'Noto Sans KR',sans-serif;color:var(--ink)}
.s{width:1280px;height:720px;background:var(--paper);position:relative;overflow:hidden;padding:44px 64px 40px;display:flex;flex-direction:column;margin-bottom:20px}
header{display:flex;align-items:center;gap:16px;font-size:17px;color:var(--sub)}
.tag{background:var(--ink);color:#fff;font-weight:600;padding:6px 16px;border-radius:999px;letter-spacing:.04em;text-transform:uppercase;font-size:14px}
.bk{flex:1}.pg{font-variant-numeric:tabular-nums;font-weight:600}
h2{font-size:48px;font-weight:800;margin:14px 0 22px;letter-spacing:-.01em}
.spk{display:inline-flex;width:34px;height:34px;flex:none;border-radius:50%;background:var(--mango);color:#fff;align-items:center;justify-content:center}.spk svg{width:20px;height:20px}
.ph{object-fit:cover;border-radius:22px;display:block}
.split{flex:1;display:grid;grid-template-columns:520px 1fr;gap:40px;min-height:0}.split>.ph{width:100%;height:100%}
.lines{list-style:none;display:flex;flex-direction:column;justify-content:center;gap:14px}
.lines li{display:flex;align-items:center;gap:14px;background:var(--card);border-radius:18px;padding:14px 18px;font-size:25px;border:1px solid var(--line)}
.lines li b{min-width:74px;color:var(--mangoD);font-weight:700}.lines li span:not(.spk){flex:1}
.lines li.b{margin-left:44px;background:#E9F3EE;border-color:#CFE5D9}.lines li.b b{color:var(--leaf)}
.dialog .lines{gap:9px}.dialog .lines li{font-size:21px;padding:9px 16px}.dialog .lines li b{min-width:80px}
.qs{list-style:none;display:flex;flex-direction:column;justify-content:center;gap:22px}
.qs li{display:flex;align-items:center;gap:18px;font-size:29px;line-height:1.3}.qs li span:not(.spk){flex:1}
.qs i{font-style:normal;flex:none;width:52px;height:52px;border-radius:14px;background:var(--mango);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:26px}
.would .qs li{background:var(--card);border-radius:20px;padding:22px 26px;border:1px solid var(--line)}.split.q.would{grid-template-columns:1fr}
.vocab{flex:1;display:grid;grid-template-columns:repeat(4,1fr);gap:22px;min-height:0}
.vocab figure{background:var(--card);border-radius:22px;overflow:hidden;display:flex;flex-direction:column;border:1px solid var(--line)}
.vocab img{width:100%;flex:1;min-height:0;object-fit:cover}
.vocab figcaption{padding:16px 18px;display:grid;grid-template-columns:1fr auto;align-items:center;row-gap:2px}
.vocab b{font-size:30px;font-weight:800}.vocab figcaption span:not(.spk){grid-column:1;font-size:19px;color:var(--sub);font-family:'Noto Sans KR',sans-serif}.vocab .spk{grid-row:1/3;grid-column:2}
.def{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:20px}
.def div{background:var(--card);border-radius:20px;padding:22px 24px;border:1px solid var(--line);display:grid;grid-template-columns:1fr auto;gap:6px 12px;align-content:start}
.def dt{font-size:31px;font-weight:800;color:var(--mangoD)}.def dd{grid-column:1;font-size:21px;line-height:1.4}.def dd em{display:block;margin-top:10px;font-style:normal;color:var(--leaf);font-weight:600}.def .spk{grid-row:1;grid-column:2}
.expr{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:20px}
.pair{background:var(--card);border-radius:20px;padding:24px 26px;border:1px solid var(--line);position:relative}
.pair .qq{font-size:28px;font-weight:700;padding-right:44px}.pair .aa{margin-top:14px;font-size:24px;color:var(--leaf);padding-left:22px;border-left:4px solid #CFE5D9}.pair .spk{position:absolute;top:22px;right:22px}
.read{grid-template-columns:1fr 440px}.txt{font-size:27px;line-height:1.55;display:flex;flex-direction:column;gap:20px;position:relative}.txt .spk{position:absolute;right:0;bottom:0}
.tf{list-style:none;display:flex;flex-direction:column;gap:16px}
.tf li{display:flex;align-items:center;gap:18px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px 24px;font-size:27px}.tf li span:not(.spk){flex:1}
.tf i{font-style:normal;font-weight:800;color:var(--mangoD);width:30px}.tf em{font-style:normal;font-weight:700;color:var(--sub);border:2px dashed var(--line);border-radius:12px;padding:6px 16px}
.note{margin-top:auto;color:var(--sub);font-size:19px}
.role{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:28px;min-height:0}
.role article{background:var(--card);border-radius:22px;overflow:hidden;border:1px solid var(--line);display:flex;flex-direction:column}
.role img{width:100%;height:250px;object-fit:cover}.role h3{font-size:28px;padding:18px 24px 6px}.role p{font-size:22px;line-height:1.45;padding:0 24px 20px;color:var(--sub)}
.rev{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:16px 28px}
.rev li{display:flex;align-items:center;gap:16px;font-size:28px;font-weight:600;background:var(--card);border-radius:18px;padding:18px 22px;border:1px solid var(--line)}
.rev li .box{width:30px;height:30px;border:3px solid var(--mango);border-radius:8px;flex:none}.rev li .spk{margin-left:auto}
.cover{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr}.cover .ph{width:100%;height:100%;border-radius:0}
.cv{background:var(--ink);color:#fff;padding:70px 64px;display:flex;flex-direction:column;gap:18px;position:relative}
.kick{color:var(--mango);font-weight:600;letter-spacing:.08em;text-transform:uppercase;font-size:18px}
.cv h1{font-size:74px;font-weight:800;line-height:1.02;letter-spacing:-.02em}.cv .ko{font-family:'Noto Sans KR',sans-serif;font-size:30px;font-weight:700;color:#FFD89A}
.goal{margin-top:auto;font-size:21px;line-height:1.5;color:#C9D8DC}.logo{position:absolute;right:48px;bottom:44px;width:96px}
.bye .cv{justify-content:center}.bye .goal{margin-top:40px}.bye .cv .ko{font-family:Lexend,sans-serif}
</style>${C.slides.map((s,i)=>slide(s,i+1)).join('\n')}`;
fs.writeFileSync(new URL('./slides.html', import.meta.url), html);
fs.writeFileSync(new URL('./siu-basic-01.say.json', import.meta.url), JSON.stringify(Object.fromEntries(say)));
console.log('slides', C.slides.length, 'lines', say.reduce((a,b)=>a+b[1].length,0));
