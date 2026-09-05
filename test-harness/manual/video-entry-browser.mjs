/* ═══════════════════════════════════════════════════════════════════════
 * 🎬 video-entry-browser.mjs — 안내 영상 입구 두 곳을 «진짜 브라우저에» 그려서 잰다 (2026-09-05)
 *
 *   A안 홈 「망고아이란?」 맨 앞 영상 카드   B안 today.html 첫 방문자 한 줄
 *
 *   ⚠️ 자동으로 안 돕니다 — `*_harness.mjs` 가 아니라 게이트가 물어 가지 않습니다.
 *      영상 입구·promo 프리셋·about 카드를 건드리면 «사람이» 부르세요:
 *        cd cloudflare-deploy/public && python3 -m http.server 8899 &
 *        node test-harness/manual/video-entry-browser.mjs
 *
 *   왜 브라우저인가 — 문자열로는 「있다」까지만 보입니다. 여기서 재는 것은
 *   «보이는가 · 눌리는가 · 무엇이 덮는가 · 몇 줄로 쪼개지는가 · 영상을 정말 안 받는가» 입니다.
 *   ⛔ «뜬다» 만 넣지 말 것 — 「레벨이 있으면 안 뜬다」 같은 짝 검사가 없으면
 *      «항상 뜨게» 만드는 변이가 그대로 통과합니다.
 * ═══════════════════════════════════════════════════════════════════════ */
import { createRequire } from 'node:module';
const require = createRequire('/tmp/pw/node_modules/');
const { chromium } = require('playwright-core');
const BASE='http://127.0.0.1:8899';
const TOK = Buffer.from(JSON.stringify({uid:'jeong',exp:Date.now()+30*86400000})).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')+'.sig';
let PASS=0, FAIL=0;
const ok=(n,c,d='')=>{ c?PASS++:FAIL++; console.log((c?'  ✅ ':'  ❌ ')+n+(c?'':'  →  '+d)); };

const plan = (band) => ({ ok:true, uid:'jeong', name:'민서', today:'2026-09-05', points_today:20, ai_streak:3,
  plan:{ mode: band?'home':'unassigned', phase:null, cls:null, band, bandKo:band?'초급':null, bandEn:'x', cefr:band?'A2+':null,
    textbook:band?'BTS 3':null,
    steps:[{key:'friend',slot:'home',icon:'🤖',ko:'AI 친구 대화',en:'x',url:'/ai-friend.html',minutes:7,done:false,whyKo:'x',whyEn:'x'}],
    totalMinutes:7, doneCount:0, levelKeys:{warmup:null,aifriend:null},
    week:[0,1,2,3,4,5,6].map(d=>({dow:d,ko:'일월화수목금토'[d],en:'x',isClass:false,isToday:d===5,tools:['friend'],start:null,minutes:7})) } });

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
async function page(vp, {loggedIn=true, band=null}={}){
  const ctx=await b.newContext({viewport:vp,deviceScaleFactor:2,serviceWorkers:'block'});
  const pg=await ctx.newPage();
  await pg.route('**/api/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[]}'}));
  await pg.route('**/api/student/today**', r=>r.fulfill({status: loggedIn?200:401, contentType:'application/json',
    body: JSON.stringify(loggedIn?plan(band):{ok:false,error:'auth_required'})}));
  await pg.addInitScript(({TOK,loggedIn})=>{try{ localStorage.setItem('mangoi_lang','ko');
    if(loggedIn){ localStorage.setItem('mangoi_logged_user',JSON.stringify({uid:'jeong',name:'민서'})); localStorage.setItem('mango_token',TOK); }
    localStorage.setItem('mangoi_onboard_v1','seen');}catch(e){}},{TOK,loggedIn});
  return {ctx,pg};
}

console.log('\n[B안] today.html — 처음 온 사람에게만');
{ const {ctx,pg}=await page({width:390,height:844},{band:null});
  await pg.goto(BASE+'/today.html?_nc='+Date.now(),{waitUntil:'networkidle'}); await pg.waitForTimeout(400);
  const m = await pg.evaluate(()=>{ const e=document.getElementById('td-intro');
    const a=e&&e.querySelector('a'); const r=a?a.getBoundingClientRect():null;
    if(a) a.scrollIntoView({block:'center'});
    const r2=a?a.getBoundingClientRect():null;
    const top=r2?document.elementFromPoint(r2.left+r2.width/2,r2.top+12):null;
    return { hidden:!e||e.hidden, href:a?a.getAttribute('href'):null, w:r?Math.round(r.width):0, h:r?Math.round(r.height):0,
             txt:e?e.textContent.replace(/\s+/g,' ').trim():'', onTop: !!(top&&e&&e.contains(top)), hasX: !!(e&&e.querySelector('.x')) }; });
  ok('레벨이 없으면 안내 줄이 뜬다', !m.hidden, JSON.stringify(m));
  ok('주소가 /promo.html?v=ai-tools 다', m.href==='/promo.html?v=ai-tools', m.href);
  ok('상자가 아니라 «누를 수 있는» 크기다(44px↑)', m.h>=44, m.w+'x'+m.h);
  ok('맨 위에 있다(다른 것이 안 덮는다)', m.onTop, m.topTag||'');
  ok('«함께 보세요» 를 말한다', /함께/.test(m.txt), m.txt.slice(0,60));
  ok('닫기 버튼이 있다', m.hasX);
  // 줄바꿈 — 낱글자로 쪼개지지 않았나
  const lines = await pg.evaluate(()=>{ const t=document.querySelector('#td-intro .t');
    const cs=getComputedStyle(t); const lh=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.4;
    const r=document.createRange(); r.selectNodeContents(t);
    return { rects:r.getClientRects().length, h:t.getBoundingClientRect().height, lh:Math.round(lh) }; });
  ok('제목이 낱글자로 안 쪼개진다(3줄 미만)', lines.h/lines.lh < 3, JSON.stringify(lines));
  // 닫으면 사라지고 다시 안 뜬다
  await pg.click('#td-intro .x'); await pg.waitForTimeout(150);
  const after = await pg.evaluate(()=>document.getElementById('td-intro').hidden);
  ok('닫으면 그 자리에서 사라진다', after);
  await pg.reload({waitUntil:'networkidle'}); await pg.waitForTimeout(400);
  const again = await pg.evaluate(()=>document.getElementById('td-intro').hidden);
  ok('닫은 뒤에는 새로고침해도 다시 안 뜬다', again);
  await ctx.close(); }

/* 🔴 «처음» 을 무엇으로 가리나 — students_erp.level 은 29,481명 중 1명만 채워져 있어
   레벨로는 아무도 못 거른다(2026-09-05 D1 실측). 실제로 거르는 것은 «연 횟수» 다.
   ⛔ 그러니 「뜬다」만 재면 안 된다 — «몇 번 뒤에 그치는가» 를 재야 그 뜻이 지켜진다. */
{ const {ctx,pg}=await page({width:390,height:844},{band:null});
  const seen=[];
  for (let i=0;i<4;i++){
    await pg.goto(BASE+'/today.html?_nc='+Date.now()+'_'+i,{waitUntil:'networkidle'}); await pg.waitForTimeout(350);
    seen.push(await pg.evaluate(()=>!document.getElementById('td-intro').hidden));
  }
  ok('처음 세 번은 뜨고 네 번째에는 안 뜬다', seen[0]&&seen[1]&&seen[2]&&!seen[3], JSON.stringify(seen));
  await ctx.close(); }

/* 👆 닫기도 «손가락으로 누르는» 것이다 — 보이는 크기가 아니라 «누르는 자리» 를 잰다 */
{ const {ctx,pg}=await page({width:390,height:844},{band:null});
  await pg.goto(BASE+'/today.html?_nc='+Date.now(),{waitUntil:'networkidle'}); await pg.waitForTimeout(350);
  const x = await pg.evaluate(()=>{ const b=document.querySelector('#td-intro .x'); if(!b) return null;
    b.scrollIntoView({block:'center'}); const r=b.getBoundingClientRect();
    const top=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
    return { w:Math.round(r.width), h:Math.round(r.height), onTop: top===b };
  });
  ok('닫기 버튼이 44×44 이상이고 맨 위다', !!x && x.w>=44 && x.h>=44 && x.onTop, JSON.stringify(x));

  /* 🎨 «무슨 색인가» 와 «읽히는가» 는 다른 검사다(CLAUDE.md 2장).
     반투명 층은 아래에서 위로 합성해야 한다 — 안 그러면 멀쩡한 대비가 거짓 실패로 나온다. */
  const con = await pg.evaluate(()=>{
    const px=(c)=>{ const m=String(c).match(/[\d.]+/g)||[]; return [ +m[0]||0, +m[1]||0, +m[2]||0, m[3]===undefined?1:+m[3] ]; };
    const lum=(r,g,b)=>{ const f=v=>{ v/=255; return v<=.03928 ? v/12.92 : Math.pow((v+.055)/1.055,2.4); };
      return .2126*f(r)+.7152*f(g)+.0722*f(b); };
    function bgOf(el){
      const layers=[];
      for (let e=el; e; e=e.parentElement){
        const cs=getComputedStyle(e); let c=px(cs.backgroundColor);
        if (c[3]===0 && cs.backgroundImage && cs.backgroundImage!=='none'){
          const m=cs.backgroundImage.match(/rgba?\([^)]+\)/); if(m) c=px(m[0]);
        }
        if (c[3]>0) { layers.push(c); if (c[3]>=1) break; }
      }
      layers.push([255,255,255,1]);
      let out=layers[layers.length-1];
      for (let i=layers.length-2;i>=0;i--){ const t=layers[i], a=t[3];
        out=[ t[0]*a+out[0]*(1-a), t[1]*a+out[1]*(1-a), t[2]*a+out[2]*(1-a), 1 ]; }
      return out;
    }
    const out={};
    for (const [k,sel] of [['제목','#td-intro .t'],['설명','#td-intro .s'],['닫기','#td-intro .x']]){
      const el=document.querySelector(sel); if(!el){ out[k]=0; continue; }
      const fg=px(getComputedStyle(el).color), bg=bgOf(el);
      const l1=lum(fg[0],fg[1],fg[2]), l2=lum(bg[0],bg[1],bg[2]);
      out[k]=+(((Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05)).toFixed(2));
    }
    return out;
  });
  ok('글자가 읽힌다 (WCAG 4.5 이상)', con['제목']>=4.5 && con['설명']>=4.5 && con['닫기']>=4.5, JSON.stringify(con));
  await ctx.close(); }

{ const {ctx,pg}=await page({width:390,height:844},{band:3});
  await pg.goto(BASE+'/today.html?_nc='+Date.now(),{waitUntil:'networkidle'}); await pg.waitForTimeout(400);
  const hid = await pg.evaluate(()=>document.getElementById('td-intro').hidden);
  ok('레벨이 있으면 «안» 뜬다 (짝 검사)', hid);
  await ctx.close(); }

{ const {ctx,pg}=await page({width:390,height:844},{loggedIn:false});
  await pg.goto(BASE+'/today.html?_nc='+Date.now(),{waitUntil:'networkidle'}); await pg.waitForTimeout(400);
  const m = await pg.evaluate(()=>{ const a=document.querySelector('#td-login .intro a');
    if(!a) return {none:true}; a.scrollIntoView({block:'center'}); const r=a.getBoundingClientRect();
    const top=document.elementFromPoint(r.left+r.width/2, r.top+12);
    return { href:a.getAttribute('href'), h:Math.round(r.height), onTop:!!(top&&a.contains(top)) }; });
  ok('로그인 전 화면에도 있다', !m.none && m.href==='/promo.html?v=ai-tools', JSON.stringify(m));
  ok('그것도 누를 수 있는 크기·맨 위', !m.none && m.h>=44 && m.onTop, JSON.stringify(m));
  await ctx.close(); }

console.log('\n[프리셋] promo.html — 지금 트는 영상의 «사실» 을 말한다');
for (const [q, want] of [['', {len:'1:35', t:/1분 35초/, poster:/mangoi-promo-poster/}],
                          ['?v=ai-tools', {len:'3:35', t:/3분 35초/, poster:/ai-tools-poster/}]]) {
  const ctx=await b.newContext({viewport:{width:900,height:800},serviceWorkers:'block'});
  const pg=await ctx.newPage();
  const reqs=[]; pg.on('request', r=>reqs.push(r.url()));
  await pg.goto(BASE+'/promo.html'+q+'&_nc='.replace('&', q?'&':'?')+Date.now(),{waitUntil:'networkidle'});
  await pg.waitForTimeout(300);
  const m = await pg.evaluate(()=>({ len:document.getElementById('lenBadge').textContent.trim(),
    title:document.getElementById('t-title').textContent, poster:document.getElementById('poster').getAttribute('src'),
    cta1:document.getElementById('t-cta1').textContent.trim(), cta1h:document.getElementById('t-cta1').getAttribute('href') }));
  ok(`${q||'(기본)'} 길이 배지 ${want.len}`, m.len===want.len, m.len);
  ok(`${q||'(기본)'} 제목이 그 길이를 말한다`, want.t.test(m.title), m.title);
  ok(`${q||'(기본)'} 포스터가 그 영상 것이다`, want.poster.test(m.poster), m.poster);
  ok(`${q||'(기본)'} 누르기 전엔 영상 0바이트`, !reqs.some(u=>/\.mp4(\?|$)/.test(u)), reqs.filter(u=>/mp4/.test(u)).join(','));
  await ctx.close();
}

console.log('\n[A안] 홈 「망고아이란?」 맨 앞 영상 카드');
{ const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,serviceWorkers:'block'});
  const pg=await ctx.newPage();
  await pg.route('**/api/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[]}'}));
  await pg.addInitScript(()=>{try{localStorage.setItem('mangoi_lang','ko');localStorage.setItem('mangoi_onboard_v1','seen');}catch(e){}});
  const reqs=[]; pg.on('request', r=>reqs.push(r.url()));
  await pg.goto(BASE+'/index.html?_nc='+Date.now(),{waitUntil:'domcontentloaded'}); await pg.waitForTimeout(3000);
  await pg.evaluate(()=>{ for(const id of ['aw-overlay','mangoi-onboard','vc-orientation-overlay']){const e=document.getElementById(id); if(e)e.remove();} });
  const opened = await pg.evaluate(()=>{ if(typeof window.openAboutMangoi==='function'){ window.openAboutMangoi(); return true; } return false; });
  ok('「망고아이란?」 오버레이가 열린다', opened);
  await pg.waitForTimeout(500);
  const m = await pg.evaluate(()=>{ const items=[...document.querySelectorAll('#about-mangoi-ov .abm-item')];
    const first=items[0]; const r=first?first.getBoundingClientRect():null;
    if(first) first.scrollIntoView({block:'center'});
    const r2=first?first.getBoundingClientRect():null;
    const top=r2?document.elementFromPoint(r2.left+r2.width/2, r2.top+r2.height/2):null;
    return { n:items.length, firstTx:first?first.textContent.replace(/\s+/g,' ').trim():'',
             h:r?Math.round(r.height):0, onTop:!!(top&&first&&first.contains(top)) }; });
  ok('영상 카드가 «맨 앞» 이다', /안내 영상/.test(m.firstTx), m.firstTx.slice(0,40));
  ok('그 카드가 맨 위에 있고 누를 수 있다', m.onTop && m.h>=44, JSON.stringify(m));
  await pg.evaluate(()=>document.querySelector('#about-mangoi-ov .abm-item').click());
  await pg.waitForTimeout(400);
  const dm = await pg.evaluate(()=>{ const b=document.querySelector('#about-mangoi-ov .abm-detail-body');
    const img=b?b.querySelector('img'):null; const cta=b?b.querySelector('.abm-dcta'):null;
    return { poster: img?img.getAttribute('src'):null, imgOk: !!(img&&img.complete&&img.naturalWidth>0),
             cta: cta?cta.textContent.trim():null, body: b?b.textContent.replace(/\s+/g,' ').trim():'' }; });
  ok('상세에 포스터 그림이 실제로 그려진다', dm.imgOk && /ai-tools-poster/.test(dm.poster||''), JSON.stringify(dm).slice(0,120));
  ok('버튼이 «영상 보기(3분 35초)» 다', /3분 35초/.test(dm.cta||''), dm.cta);
  ok('«원장님·선생님» 대상임을 말한다', /선생님/.test(dm.body), dm.body.slice(0,80));
  ok('카드를 열어도 영상은 0바이트', !reqs.some(u=>/ai-tools-kr\.mp4/.test(u)));
  await ctx.close(); }

await b.close();
console.log(`\n🎬 video_entry_browser — PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL?1:0);
