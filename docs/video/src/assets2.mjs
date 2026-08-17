import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'deck_img');
fs.mkdirSync(OUT, { recursive: true });

/* palette lifted from the two reference decks */
const BG = '#0B1020', CARD = '#161C33', LINE = '#2A3557';
const WHITE = '#FFFFFF', TXT = '#CBD5E1', MUT = '#94A3B8';
const GOLD = '#FBBF24', SKY = '#38BDF8', PUR = '#C084FC', GRN = '#34D399';
const KF = "NanumGothic, 'Malgun Gothic', sans-serif";

/* ── 1. ZPD ───────────────────────────────────────────────── */
const zpd = `
<svg xmlns="http://www.w3.org/2000/svg" width="1180" height="900" viewBox="0 0 1180 900">
  <rect width="1180" height="900" fill="${BG}"/>
  <circle cx="590" cy="424" r="358" fill="#141A30" stroke="${LINE}" stroke-width="2"/>
  <circle cx="590" cy="424" r="250" fill="#241F12" stroke="${GOLD}" stroke-width="3"/>
  <circle cx="590" cy="424" r="130" fill="#16233C" stroke="${SKY}" stroke-width="2.5"/>

  <text x="590" y="410" text-anchor="middle" font-family="${KF}" font-size="30" font-weight="700" fill="${SKY}">혼자 할 수 있는 것</text>
  <text x="590" y="450" text-anchor="middle" font-family="${KF}" font-size="23" fill="${MUT}">현재 발달 수준</text>
  <text x="590" y="232" text-anchor="middle" font-family="${KF}" font-size="33" font-weight="700" fill="${GOLD}">도움을 받으면 할 수 있는 것</text>
  <text x="590" y="272" text-anchor="middle" font-family="${KF}" font-size="24" font-weight="700" fill="#E0A93A">근접발달영역 · ZPD</text>
  <text x="590" y="736" text-anchor="middle" font-family="${KF}" font-size="27" font-weight="700" fill="${MUT}">아직 할 수 없는 것</text>

  <rect x="176" y="462" width="242" height="88" rx="16" fill="${SKY}"/>
  <text x="297" y="498" text-anchor="middle" font-family="${KF}" font-size="24" font-weight="700" fill="#06263B">원어민 전담 교사</text>
  <text x="297" y="530" text-anchor="middle" font-family="${KF}" font-size="20" fill="#0B3A57">주 2~5회 · 사람</text>
  <rect x="762" y="462" width="242" height="88" rx="16" fill="${GOLD}"/>
  <text x="883" y="498" text-anchor="middle" font-family="${KF}" font-size="24" font-weight="700" fill="#3A2A00">망고아이 A.I</text>
  <text x="883" y="530" text-anchor="middle" font-family="${KF}" font-size="20" fill="#5C4300">나머지 시간 · 상시</text>
  <line x1="418" y1="506" x2="472" y2="506" stroke="${SKY}" stroke-width="3"/>
  <line x1="708" y1="506" x2="762" y2="506" stroke="${GOLD}" stroke-width="3"/>

  <text x="590" y="838" text-anchor="middle" font-family="${KF}" font-size="21" fill="${MUT}">Vygotsky (1978) · Wood, Bruner &amp; Ross (1976)</text>
</svg>`;

/* ── 2. Forgetting curve ──────────────────────────────────── */
function forgetting() {
  const W = 1400, H = 780, L = 118, R = 60, T = 96, B = 130;
  const pw = W - L - R, ph = H - T - B;
  const x = t => L + t * pw, y = v => T + (1 - v) * ph;
  const decay = (t0, v0, t, k) => v0 * Math.exp(-k * (t - t0));
  let noRev = `M ${x(0)} ${y(1)}`;
  for (let i = 1; i <= 200; i++) { const t = i / 200; noRev += ` L ${x(t)} ${y(decay(0, 1, t, 5.2))}`; }
  const revs = [0.16, 0.36, 0.60, 0.84];
  let withRev = `M ${x(0)} ${y(1)}`, cur = 1, t0 = 0, k = 5.2;
  const marks = [];
  revs.forEach((rt, idx) => {
    for (let t = t0; t <= rt; t += 0.005) withRev += ` L ${x(t)} ${y(decay(t0, cur, t, k))}`;
    marks.push({ t: rt, from: decay(t0, cur, rt, k) });
    withRev += ` L ${x(rt)} ${y(1)}`;
    cur = 1; t0 = rt; k = 5.2 / (1.9 + idx * 1.05);
  });
  for (let t = t0; t <= 1.0; t += 0.005) withRev += ` L ${x(t)} ${y(decay(t0, cur, t, k))}`;
  const markSvg = marks.map(m => `
    <line x1="${x(m.t)}" y1="${y(m.from)}" x2="${x(m.t)}" y2="${y(1)}" stroke="${GOLD}" stroke-width="4"/>
    <circle cx="${x(m.t)}" cy="${y(1)}" r="9" fill="${GOLD}"/>`).join('');
  const grid = [0, 0.25, 0.5, 0.75, 1].map(v =>
    `<line x1="${L}" y1="${y(v)}" x2="${L + pw}" y2="${y(v)}" stroke="#1E2740" stroke-width="1.5"/>`).join('');
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${grid}
  <line x1="${L}" y1="${T}" x2="${L}" y2="${T + ph}" stroke="${LINE}" stroke-width="2"/>
  <line x1="${L}" y1="${T + ph}" x2="${L + pw}" y2="${T + ph}" stroke="${LINE}" stroke-width="2"/>
  <path d="${noRev}" fill="none" stroke="${MUT}" stroke-width="4" stroke-dasharray="10 8"/>
  <path d="${withRev}" fill="none" stroke="${SKY}" stroke-width="5" stroke-linejoin="round"/>
  ${markSvg}
  <text x="${x(0.50)}" y="${T + ph - 14}" font-family="${KF}" font-size="24" fill="${MUT}">복습하지 않으면 이렇게 사라집니다</text>
  <text x="${x(0.30)}" y="${T - 22}" font-family="${KF}" font-size="25" font-weight="700" fill="${SKY}">간격을 두고 인출하면 남습니다</text>
  <text x="${x(0.16)}" y="${T - 22}" text-anchor="middle" font-family="${KF}" font-size="22" font-weight="700" fill="${GOLD}">복습</text>
  <text x="46" y="${T + ph / 2}" text-anchor="middle" font-family="${KF}" font-size="24" fill="${TXT}" transform="rotate(-90 46 ${T + ph / 2})">기억 보존량</text>
  <text x="${L + pw / 2}" y="${H - 62}" text-anchor="middle" font-family="${KF}" font-size="24" fill="${TXT}">시간 경과</text>
  <text x="${L + pw / 2}" y="${H - 22}" text-anchor="middle" font-family="${KF}" font-size="21" fill="${MUT}">Ebbinghaus (1885) · Cepeda et al. (2006) · Roediger &amp; Karpicke (2006) 개념도</text>
</svg>`;
}

/* ── 3. Flow channel ──────────────────────────────────────── */
const flow = `
<svg xmlns="http://www.w3.org/2000/svg" width="1180" height="880" viewBox="0 0 1180 880">
  <rect width="1180" height="880" fill="${BG}"/>
  <defs><linearGradient id="fg" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0%" stop-color="${GOLD}" stop-opacity="0.20"/>
    <stop offset="100%" stop-color="${GOLD}" stop-opacity="0.62"/>
  </linearGradient></defs>
  <rect x="120" y="70" width="940" height="640" fill="#0E1428"/>
  <polygon points="120,710 1060,70 1060,240 120,710" fill="#141A30"/>
  <polygon points="120,710 120,510 1060,70" fill="#141A30"/>
  <polygon points="120,710 1060,70 1060,150 190,710" fill="url(#fg)"/>
  <text x="320" y="212" font-family="${KF}" font-size="30" font-weight="700" fill="${MUT}">불안</text>
  <text x="320" y="249" font-family="${KF}" font-size="22" fill="${MUT}">너무 어렵다 → 포기</text>
  <text x="700" y="618" font-family="${KF}" font-size="30" font-weight="700" fill="${MUT}">지루함</text>
  <text x="700" y="655" font-family="${KF}" font-size="22" fill="${MUT}">너무 쉽다 → 이탈</text>
  <text x="558" y="392" font-family="${KF}" font-size="34" font-weight="700" fill="${GOLD}" transform="rotate(-34 558 392)">몰입 채널 · Flow</text>
  <path d="M 300 600 Q 400 500 520 452 Q 650 400 760 290" fill="none" stroke="${SKY}" stroke-width="4" stroke-dasharray="9 7"/>
  ${[[300,600],[520,452],[760,290]].map(([cx,cy])=>`<circle cx="${cx}" cy="${cy}" r="13" fill="${SKY}"/>`).join('')}
  <line x1="120" y1="70" x2="120" y2="710" stroke="${LINE}" stroke-width="2.5"/>
  <line x1="120" y1="710" x2="1060" y2="710" stroke="${LINE}" stroke-width="2.5"/>
  <text x="52" y="390" text-anchor="middle" font-family="${KF}" font-size="26" font-weight="700" fill="${TXT}" transform="rotate(-90 52 390)">과제 난이도</text>
  <text x="590" y="768" text-anchor="middle" font-family="${KF}" font-size="26" font-weight="700" fill="${TXT}">학습자 실력</text>
  <text x="590" y="826" text-anchor="middle" font-family="${KF}" font-size="21" fill="${MUT}">Csikszentmihalyi (1990) 개념도 — 실력이 늘면 난이도도 함께 올라가야 몰입이 유지됩니다</text>
</svg>`;

/* ── 4. Input → Output loop ───────────────────────────────── */
const io = `
<svg xmlns="http://www.w3.org/2000/svg" width="3400" height="760" viewBox="0 0 3400 760">
  <rect width="3400" height="760" fill="${BG}"/>
  ${[
    ['이해 가능한 입력', 'i + 1', '수준보다 살짝 위의 말을 듣는다', 'AI 웜업 · 원어민 발음 듣기', GOLD, 60],
    ['정서 필터', 'Affective Filter', '불안이 낮아야 입력이 통과한다', 'AI 친구 대화 — 틀려도 안전한 상대', SKY, 900],
    ['이해 가능한 출력', 'Output', '직접 말해 봐야 규칙이 굳는다', 'AI 음성코치 · 수업 발화', GOLD, 1740],
    ['즉시 피드백', 'Feedback', '틀린 지점을 바로 되짚는다', 'AI 영작 첨삭 · 자동 평가서', SKY, 2580],
  ].map(([t, en, d, impl, fg, x]) => `
    <rect x="${x}" y="70" width="760" height="300" rx="26" fill="${CARD}" stroke="${LINE}" stroke-width="2"/>
    <text x="${x + 380}" y="140" text-anchor="middle" font-family="${KF}" font-size="30" font-weight="700" fill="${fg}">${en}</text>
    <text x="${x + 380}" y="208" text-anchor="middle" font-family="${KF}" font-size="42" font-weight="700" fill="${WHITE}">${t}</text>
    <text x="${x + 380}" y="272" text-anchor="middle" font-family="${KF}" font-size="28" fill="${TXT}">${d}</text>
    <rect x="${x}" y="418" width="760" height="92" rx="20" fill="${fg}"/>
    <text x="${x + 380}" y="475" text-anchor="middle" font-family="${KF}" font-size="27" font-weight="700" fill="#12182B">${impl}</text>`).join('')}
  ${[820, 1660, 2500].map(x => `<path d="M ${x} 220 L ${x + 58} 220" stroke="${GOLD}" stroke-width="8"/><polygon points="${x + 74},220 ${x + 50},206 ${x + 50},234" fill="${GOLD}"/>`).join('')}
  <path d="M 2960 560 L 2960 620 L 440 620 L 440 562" fill="none" stroke="${GOLD}" stroke-width="6" stroke-dasharray="16 12"/>
  <polygon points="440,546 426,572 454,572" fill="${GOLD}"/>
  <text x="1700" y="676" text-anchor="middle" font-family="${KF}" font-size="30" font-weight="700" fill="${GOLD}">피드백이 다음 입력의 난이도를 조정한다</text>
  <text x="1700" y="734" text-anchor="middle" font-family="${KF}" font-size="26" fill="${MUT}">Krashen (1982) 입력가설 · Swain (1985) 출력가설 — 색 칸은 망고아이의 대응 기능</text>
</svg>`;

/* ── 5. Backgrounds: navy → violet, per chapter ───────────── */
const bgHtml = (seed, motif) => `
<html><body style="margin:0"><canvas id="c" width="2560" height="1440"></canvas><script>
const c=document.getElementById('c'),x=c.getContext('2d'),W=c.width,H=c.height;
let s=${seed}>>>0; const R=()=>((s=(s*1664525+1013904223)>>>0)/4294967296);
const motif='${motif}';
x.fillStyle='#0B1020'; x.fillRect(0,0,W,H);
function bloom(cx,cy,r,rgb,a){const g=x.createRadialGradient(cx,cy,0,cx,cy,r);
 g.addColorStop(0,'rgba('+rgb+','+a+')');g.addColorStop(0.45,'rgba('+rgb+','+(a*0.26).toFixed(3)+')');
 g.addColorStop(1,'rgba(11,16,32,0)');x.fillStyle=g;x.fillRect(0,0,W,H);}
/* violet + indigo depth — matches the reference decks */
bloom(W*0.20,H*0.08,W*0.78,'88,60,220',0.30);
bloom(W*0.86,H*0.92,W*0.70,'70,50,190',0.24);
if(motif==='cover')  bloom(W*0.88,H*0.40,W*0.62,'251,191,36',0.16);
if(motif==='theory') bloom(W*0.66,H*0.90,W*0.70,'56,189,248',0.14);
if(motif==='feature')bloom(W*0.84,H*0.32,W*0.62,'251,191,36',0.16);
if(motif==='usage')  bloom(W*0.46,H*0.10,W*0.72,'56,189,248',0.14);
if(motif==='road')   bloom(W*0.50,H*1.02,W*0.90,'251,191,36',0.20);
if(motif==='close')  bloom(W*0.50,H*1.04,W*0.95,'251,191,36',0.18);
x.save(); x.globalCompositeOperation='lighter';
x.strokeStyle='rgba(160,170,240,0.035)'; x.lineWidth=1.4;
for(let i=0;i<=48;i++){x.beginPath();x.moveTo(i*W/48,0);x.lineTo(i*W/48,H);x.stroke();}
for(let i=0;i<=27;i++){x.beginPath();x.moveTo(0,i*H/27);x.lineTo(W,i*H/27);x.stroke();}
if(motif==='theory'||motif==='cover'){
  const pts=[];const n=motif==='theory'?66:44;
  for(let i=0;i<n;i++){const t=Math.pow(R(),0.75);
    pts.push(motif==='theory'?{x:W*0.58+(R()-0.5)*W*0.86*(0.3+t*0.95),y:H-(t*H*0.95)-16}
                             :{x:W*0.50+R()*W*0.48,y:R()*H});}
  x.lineWidth=1.6;
  for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
    const d=Math.hypot(pts[i].x-pts[j].x,pts[i].y-pts[j].y);
    if(d<250){x.strokeStyle='rgba(150,190,255,'+(0.16*(1-d/250)).toFixed(3)+')';
      x.beginPath();x.moveTo(pts[i].x,pts[i].y);x.lineTo(pts[j].x,pts[j].y);x.stroke();}}
  pts.forEach(p=>{x.beginPath();x.arc(p.x,p.y,3,0,7);x.fillStyle='rgba(190,215,255,0.75)';x.fill();});
}
if(motif==='feature'){for(let i=0;i<9;i++){const r=W*0.16+i*W*0.062;
  x.beginPath();x.arc(W*0.86,H*0.34,r,Math.PI*0.52,Math.PI*1.52);
  x.strokeStyle='rgba(251,191,36,'+(0.14-i*0.012).toFixed(3)+')';x.lineWidth=2.2;x.stroke();}}
if(motif==='usage'){x.lineWidth=2.4;
  for(let k=0;k<4;k++){const yo=H*0.36+k*H*0.13,amp=H*0.055+k*10;x.beginPath();
    for(let px=0;px<=W;px+=8){const py=yo+Math.sin(px/W*Math.PI*2.1+k*0.8)*amp;px===0?x.moveTo(px,py):x.lineTo(px,py);}
    x.strokeStyle='rgba(56,189,248,'+(0.14-k*0.026).toFixed(3)+')';x.stroke();}}
if(motif==='road'||motif==='close'){const hy=H*0.76;
  const g=x.createLinearGradient(0,hy-H*0.3,0,hy);g.addColorStop(0,'rgba(251,191,36,0)');
  g.addColorStop(1,'rgba(251,191,36,0.13)');x.fillStyle=g;x.fillRect(0,hy-H*0.3,W,H*0.3);
  x.beginPath();x.moveTo(0,hy);x.lineTo(W,hy);x.strokeStyle='rgba(251,191,36,0.24)';x.lineWidth=2;x.stroke();}
x.restore();
for(let i=0;i<560;i++){const px=R()*W,py=R()*H,r=R()*2.2+0.4,a=(R()*0.42+0.05);
  x.beginPath();x.arc(px,py,r,0,7);
  x.fillStyle='rgba('+(200+Math.floor(R()*55))+','+(210+Math.floor(R()*45))+',255,'+a.toFixed(3)+')';x.fill();}
const im=x.getImageData(0,0,W,H),d=im.data;
for(let i=0;i<d.length;i+=4){const n=(R()-0.5)*6;d[i]+=n;d[i+1]+=n;d[i+2]+=n;}
x.putImageData(im,0,0);
const v=x.createRadialGradient(W/2,H/2,H*0.30,W/2,H/2,W*0.78);
v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,0.55)');
x.fillStyle=v;x.fillRect(0,0,W,H);
window.__png=c.toDataURL('image/png');
</script></body></html>`;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ deviceScaleFactor: 2 });

async function svgPng(svg, name, w, h) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: w, height: h });
  await p.setContent(`<html><body style="margin:0;background:${BG}">${svg}</body></html>`);
  await p.waitForTimeout(450);
  await p.screenshot({ path: path.join(OUT, name), clip: { x: 0, y: 0, width: w, height: h } });
  await p.close(); console.log('OK', name);
}
await svgPng(zpd, 'd_zpd.png', 1180, 900);
await svgPng(forgetting(), 'd_forget.png', 1400, 780);
await svgPng(flow, 'd_flow.png', 1180, 880);
await svgPng(io, 'd_io.png', 3400, 760);

for (const [name, seed, motif] of [
  ['d_bg_cover', 20260817, 'cover'], ['d_bg_theory', 7713, 'theory'],
  ['d_bg_feature', 55219, 'feature'], ['d_bg_usage', 90431, 'usage'],
  ['d_bg_road', 31877, 'road'], ['d_bg_close', 64108, 'close'],
]) {
  const p = await browser.newPage();
  await p.setContent(bgHtml(seed, motif));
  await p.waitForTimeout(2200);
  const data = await p.evaluate(() => window.__png);
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
  await p.close(); console.log('OK', name);
}
await browser.close();
