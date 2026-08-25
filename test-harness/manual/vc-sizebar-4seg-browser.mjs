/*
 * 🖥 얼굴 크기 컨트롤 «레이아웃 그림 4칸»(2안) — 브라우저 실측 검사   2026-08-25
 * ─────────────────────────────────────────────────────────────────────────────
 * 무엇을 지키나
 *   버튼 7개가 두 줄로 접히던 것을 그림 4칸 + «⋯» 한 줄로 바꾼 뒤,
 *   PC · 폰 가로 · 폰 세로 세 폭에서 **정말 한 줄인지, 정말 눌리는지, 정말 읽히는지** 를 잰다.
 *
 * ⚠️ 자동으로 안 돈다 — manual/ 규약상 `*_harness.mjs` 가 아니라 게이트가 물어 가지 않는다.
 *    크기바(.video-size-bar)·#vc-portrait-split-modes·mango-theme-light.css 를 건드리면 사람이 부른다:
 *      cd cloudflare-deploy/public && python3 -m http.server 8899 &
 *      node test-harness/manual/vc-sizebar-4seg-browser.mjs
 *
 * 🪤 문자열 하니스로는 못 잡고 이 검사가 실제로 잡은 것 (2026-08-25)
 *   ① 옛 규칙 `.video-size-bar button:nth-child(1),(3){display:none!important}`(폰 세로)이
 *      «바의» 1·3번째가 아니라 **자기 부모의 1·3번째 버튼 아무거나**를 잡아, «⋯» 와
 *      메뉴의 PIP·자유가 폰 세로에서 조용히 사라졌다.
 *   ② `.video-size-bar.vsb2` 는 클래스가 «2개» 라 (2,2,0) — 옛 규칙 (2,2,1) 에
 *      **element 하나 차이로 져서** flex-wrap:nowrap 이 안 먹었다(두 줄 접힘이 그대로 남을 뻔).
 *   ③ 색을 !important 로 잡았더니 특이도가 css/mango-theme-light.css 를 이겨
 *      **라이트 테마에서 흰 배경에 흰빛 글자**가 됐다. → 색은 테마에 맡긴다.
 *   ④ 라이트 강조색(#0ea5e9)+흰 글자는 **2.77:1** 이라 «선택됨» 이 안 읽혔다.
 *   ⑤ vcScreenSet 은 «수업에 들어갈 때» 만들어져서, 부팅 때 감싸면 조용히 실패한다.
 *
 * ⚠️ 실제 수업 입장은 헤드리스에서 못 한다(WebRTC·촬영동의 모달). 그래서 화면 상태만
 *    강제로 만들고 잰다. 입장 경로 자체는 manual/vc-entry-speed-browser.mjs 가 본다.
 */
import { spawn } from 'child_process';
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL=process.env.BASE_URL||'http://127.0.0.1:8899/index.html';
let PORT=9600, pass=0, fail=0;
const ok=(n,c,d='')=>{ (c?pass++:fail++); console.log((c?'  ✅ ':'  ❌ ')+n+(d?'  — '+d:'')); };

async function open(w,h,label){
  const port=PORT++;
  const p=spawn(CHROME,['--headless=new','--no-sandbox','--disable-gpu','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--remote-debugging-port='+port,'about:blank'],{stdio:'ignore'});
  await new Promise(r=>setTimeout(r,2200));
  const list=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const sock=new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl);
  let id=0; const waits=new Map(); const errs=[];
  sock.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&waits.has(m.id)){waits.get(m.id)(m);waits.delete(m.id)}
    if(m.method==='Runtime.exceptionThrown')errs.push(m.params.exceptionDetails.text+' '+(m.params.exceptionDetails.exception?.description||'').slice(0,120));};
  await new Promise(r=>sock.onopen=r);
  const send=(me,pa={})=>{const i=++id;sock.send(JSON.stringify({id:i,method:me,params:pa}));return new Promise(r=>waits.set(i,r))};
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*','*googletagmanager*']});
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false,screenOrientation:{type:w>h?'landscapePrimary':'portraitPrimary',angle:w>h?90:0}});
  await send('Page.navigate',{url:URL});
  await new Promise(r=>setTimeout(r,3500));
  const ev=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});
    if(r.result?.exceptionDetails) return {__err:r.result.exceptionDetails.text+' '+(r.result.exceptionDetails.exception?.description||'').slice(0,200)};
    return r.result?.result?.value;};
  return {ev,errs,kill:()=>p.kill(),label,w,h};
}

// 수업화면 상태로 강제 전환 (실제 입장은 WebRTC·동의모달이 필요해 헤드리스에서 불가)
const ENTER = `(()=>{ document.body.classList.add('vc-in-call');
  var v=document.getElementById('vc-call-view')||document.querySelector('.vc-main-row')?.closest('[id^="view"],section,div[id]');
  try{ if(typeof showView==='function') showView('call'); }catch(e){}
  document.body.classList.add('vc-orientation-dismissed');
  var ov=document.getElementById('vc-orientation-overlay'); if(ov) ov.style.setProperty('display','none','important');
  var row=document.getElementById('vc-main-row');
  var n=row; while(n&&n!==document.body){ var st=getComputedStyle(n); if(st.display==='none') n.style.setProperty('display','flex','important'); n=n.parentElement; }
  return { row: !!row, rowCls: row?row.className:null, barVisible: (()=>{var b=document.getElementById('vc-size-bar');return b?getComputedStyle(b).display:'no-el'})() };
})()`;

async function run(w,h,label,portrait){
  console.log('\n── '+label+' ('+w+'×'+h+') ──');
  const c=await open(w,h,label);
  const st=await c.ev(ENTER);
  await new Promise(r=>setTimeout(r,700));
  const R=await c.ev(`(()=>{
    const bar=document.getElementById('vc-size-bar'); if(!bar) return {no:1};
    const cs=getComputedStyle(bar), r=bar.getBoundingClientRect();
    const segs=[...bar.querySelectorAll('.vsb-seg')];
    const vis=segs.filter(s=>getComputedStyle(s).display!=='none');
    const rows=new Set(vis.map(s=>Math.round(s.getBoundingClientRect().top)));
    const lbl=getComputedStyle(bar.querySelector('.vsb-t')).display;
    const more=document.getElementById('vc-size-more');
    return { display:cs.display, wrap:cs.flexWrap, h:Math.round(r.height), top:Math.round(r.top),
      segTotal:segs.length, segVisible:vis.length, rowCount:rows.size, label:lbl,
      moreVisible:getComputedStyle(more).display!=='none',
      iconOk: segs.every(s=>s.querySelector('svg.vsb-i')),
      sizes: segs.map(s=>s.getAttribute('data-size')).join(','),
      pressed: segs.filter(s=>s.getAttribute('aria-pressed')==='true').map(s=>s.getAttribute('data-size')) };
  })()`);
  if(R&&R.no){ ok('바가 DOM 에 있다',false); c.kill(); return; }
  ok('바가 보인다 (display='+R.display+')', R.display!=='none');
  ok('한 줄이다 (줄 수 '+R.rowCount+', 높이 '+R.h+'px)', R.rowCount===1 && R.h<=(portrait?34:70), 'wrap='+R.wrap);
  ok('그림 4칸이 모두 보인다 ('+R.segVisible+'/'+R.segTotal+')', R.segVisible===4);
  ok('순서가 1/4·1/2·3/4·전체', R.sizes==='quarter,half,threequarter,full');
  ok('SVG 아이콘이 4칸 모두에 있다', R.iconOk===true);
  ok('«⋯» 이 보인다', R.moreVisible===true);
  const wantLabel = !portrait && w>920;
  ok(wantLabel?'PC 는 글자 라벨이 보인다':'폰은 라벨을 뺀다 (그림만)', wantLabel ? R.label!=='none' : R.label==='none', 'label display='+R.label);

  // 클릭 → 실제로 레이아웃이 바뀌는가
  const CLICK=`(()=>{ const b=document.querySelector('#vc-size-bar .vsb-seg[data-size="%S%"]');
    const pane=document.getElementById('vc-video-pane'); const before=pane.getBoundingClientRect();
    b.click(); const row=document.getElementById('vc-main-row');
    return { cls:[...row.classList].filter(x=>x.startsWith('video-')).join(','),
             pressed:[...document.querySelectorAll('#vc-size-bar .vsb-seg')].filter(s=>s.getAttribute('aria-pressed')==='true').map(s=>s.getAttribute('data-size')).join(','),
             active:[...document.querySelectorAll('#vc-size-bar .vsb-seg.active')].map(s=>s.getAttribute('data-size')).join(','),
             beforeW:Math.round(before.width), beforeH:Math.round(before.height) }; })()`;
  const dims=[];
  for(const sz of ['quarter','half','threequarter','full']){
    const r=await c.ev(CLICK.replace('%S%',sz));
    await new Promise(x=>setTimeout(x,420));
    const after=await c.ev(`(()=>{const p=document.getElementById('vc-video-pane').getBoundingClientRect();return {w:Math.round(p.width),h:Math.round(p.height)}})()`);
    dims.push([sz,after]);
    ok('«'+sz+'» 누르면 모드가 바뀌고 표시가 따라온다', r.cls==='video-'+sz && r.pressed===sz && r.active===sz, 'cls='+r.cls+' pressed='+r.pressed);
  }
  const key = portrait ? 'h' : 'w';
  const seq = dims.map(d=>d[1][key]);
  ok('네 크기가 실제로 «점점 커진다» ('+seq.join(' → ')+'px)', seq[0]<seq[1] && seq[1]<seq[2] && seq[2]<=seq[3]);

  // ⋯ 메뉴
  const M=await c.ev(`(()=>{ const more=document.getElementById('vc-size-more'); more.click();
    const m=document.getElementById('vc-size-menu'); const r=m.getBoundingClientRect();
    const cx=Math.round(r.left+r.width/2), cy=Math.round(r.top+8);
    const els=document.elementsFromPoint(cx,cy);
    const stack=els.slice(0,3).map(e=>e.id||e.className||e.tagName);
    const inMenu = !!(els[0] && els[0].closest && els[0].closest('#vc-size-menu'));
    return { hidden:m.hidden, disp:getComputedStyle(m).display, expanded:more.getAttribute('aria-expanded'),
             w:Math.round(r.width), inView:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,
             topEl:stack[0], inMenu, stack:stack.join(' | '),
             items:[...m.querySelectorAll('button')].map(b=>b.id).join(',') }; })()`);
  ok('«⋯» 을 누르면 메뉴가 열린다', M.hidden===false && M.disp!=='none', 'aria-expanded='+M.expanded);
  ok('메뉴에 PIP·솔로·자유가 있다', M.items==='vc-pip-btn,vc-solo-btn,vc-free-btn', M.items);
  ok('메뉴가 화면 안에 들어온다', M.inView===true, 'w='+M.w);
  ok('메뉴가 맨 위에 있다 (가려지지 않음)', M.inMenu===true, M.stack);
  const C=await c.ev(`(()=>{ document.getElementById('vc-pip-btn').click();
    const m=document.getElementById('vc-size-menu'); return new Promise(r=>setTimeout(()=>r({hidden:m.hidden}),60)); })()`);
  ok('메뉴 항목을 누르면 닫힌다', C.hidden===true);

  // 하단 독 시트(vcScreenSet)와 표시가 어긋나지 않는가
  //   ⚠️ vcScreenSet 은 «수업에 들어갈 때» window 에 대입된다(헤드리스에서는 그 지점까지 못 간다).
  //      그래서 그 «늦은 대입» 을 그대로 재현해, 접근자가 실제로 낚아채 감싸는지 본다.
  const S=await c.ev(`(()=>{
    const before = typeof window.vcScreenSet;
    window.vcScreenSet = function(mode){                 // ← idx-main.js 가 입장 때 하는 것과 같은 모양
      const row=document.getElementById('vc-main-row');
      row.classList.remove('video-quarter','video-half','video-threequarter','video-full','video-pip','video-solo','video-facepip');
      row.classList.add('video-'+mode);
    };
    const wrapped = !!window.vcScreenSet.__vsb2;
    window.vcScreenSet('quarter');
    return { before, wrapped,
      pressed:[...document.querySelectorAll('#vc-size-bar .vsb-seg')].filter(s=>s.getAttribute('aria-pressed')==='true').map(s=>s.getAttribute('data-size')).join(',') }; })()`);
  ok('vcScreenSet 은 부팅 시점에 아직 없다 (늦게 만들어진다)', S.before==='undefined', 'typeof='+S.before);
  ok('늦게 대입돼도 접근자가 낚아채 감싼다', S.wrapped===true);
  ok('하단 독 시트로 바꿔도 바 표시가 따라온다', S.pressed==='quarter', 'pressed='+S.pressed);

  // 기존 코드가 쓰는 셀렉터가 여전히 맞는가
  const L=await c.ev(`(()=>({ half:!!document.querySelector('.video-size-bar button[onclick*="half"]'),
     tq:!!document.querySelector('.video-size-bar button[onclick*="threequarter"]'),
     pip:!!document.getElementById('vc-pip-btn'), free:!!document.getElementById('vc-free-btn') }))()`);
  ok('옛 셀렉터 [onclick*="half"] 가 여전히 찾아진다', L.half===true);
  ok('옛 셀렉터 [onclick*="threequarter"] 가 여전히 찾아진다', L.tq===true);

  // 🎨 대비 — «무슨 색인가» 와 «읽히는가» 는 다른 검사다.
  //    라이트 테마(body.vc-theme-light)와 다크, 두 벌 다 잰다.
  const CONTRAST = `(theme)=>{
    document.body.classList.toggle('vc-theme-light', theme==='light');
    const rgb=s=>s.match(/[0-9.]+/g).map(Number);
    const lum=c=>{const a=c.slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*a[0]+.7152*a[1]+.0722*a[2]};
    const bgOf=el=>{let n=el;while(n&&n!==document.documentElement){const c=getComputedStyle(n).backgroundColor;
      if(c&&!/rgba\\(0, 0, 0, 0\\)|transparent/.test(c)){const p=rgb(c); if(p.length<4||p[3]>=0.85) return c;} n=n.parentElement}
      return getComputedStyle(document.body).backgroundColor;};
    const cr=el=>{const f=lum(rgb(getComputedStyle(el).color)),b=lum(rgb(bgOf(el)));
      return (Math.max(f,b)+.05)/(Math.min(f,b)+.05);};
    document.getElementById('vc-size-more').click();   // 메뉴도 함께 잰다
    const out=[];
    const add=(el,name)=>{ if(!el) return; const st=getComputedStyle(el); if(st.display==='none') return;
      const px=parseFloat(st.fontSize); const need=(px>=24||(px>=18.66&&parseInt(st.fontWeight)>=700))?3:4.5;
      const v=cr(el); out.push({name, px:+px.toFixed(1), cr:+v.toFixed(2), need, ok:v>=need, fg:st.color, bg:bgOf(el)}); };
    document.querySelectorAll('#vc-size-bar .vsb-seg').forEach(b=>add(b.querySelector('.vsb-t'), (b.dataset.size)+(b.classList.contains('active')?'(선택됨)':'')));
    add(document.getElementById('vc-size-more'),'⋯');
    ['vc-pip-btn','vc-solo-btn','vc-free-btn'].forEach(id=>add(document.getElementById(id),'메뉴:'+id));
    // 아이콘은 «글자» 가 아니라 UI 요소 → WCAG 비텍스트 기준 3:1
    document.querySelectorAll('#vc-size-bar .vsb-seg svg.vsb-i').forEach((svg,i)=>{
      const st=getComputedStyle(svg); const v=cr(svg);
      out.push({name:'아이콘'+(i+1), px:99, cr:+v.toFixed(2), need:3, ok:v>=3, fg:st.color, bg:bgOf(svg)});
    });
    document.getElementById('vc-size-more').click();
    return out; }`;
  for (const theme of ['dark','light']) {
    const arr = await c.ev(`(${CONTRAST})('${theme}')`);
    const bad = (arr||[]).filter(x=>!x.ok);
    ok('대비 '+(theme==='dark'?'다크':'라이트')+' — 잰 '+((arr||[]).length)+'곳 모두 읽힌다',
       Array.isArray(arr) && arr.length>=8 && bad.length===0,   // 글자4(PC만)+⋯+메뉴3+아이콘4
       bad.length? bad.map(b=>b.name+' '+b.cr+':1<'+b.need+' ('+b.fg+' on '+b.bg+')').join(' / ')
                 : '최저 '+Math.min(...arr.map(x=>x.cr)).toFixed(2)+':1');
  }
  await c.ev(`document.body.classList.remove('vc-theme-light')`);

  // 🌐 언어 전환 — 이 저장소에서 가장 자주 깨지는 자리
  //   ⛔ 아이콘 버튼에 data-ko/data-en 을 달면 엔진이 textContent 를 통째로 갈아치워
  //      아이콘 자리에 문장이 들어앉는다. 그래서 설명은 title/aria 로만 단다.
  const I=await c.ev(`(()=>{
    const seg=document.querySelector('#vc-size-bar .vsb-seg[data-size="threequarter"]');
    const koT=seg.querySelector('.vsb-t').textContent.trim(), koTitle=seg.getAttribute('title');
    try{ (window.setLang||function(){})('en'); }catch(e){}
    return new Promise(r=>setTimeout(()=>r({
      koT, koTitle,
      enT: seg.querySelector('.vsb-t').textContent.trim(),
      enTitle: seg.getAttribute('title'),
      svgAlive: !!seg.querySelector('svg.vsb-i'),
      btnText: seg.textContent.replace(/\\s+/g,' ').trim(),
      lines: Math.round(seg.getBoundingClientRect().height)
    }), 350)); })()`);
  ok('🌐 EN 으로 라벨이 바뀐다', I.koT!==I.enT && /Faces/i.test(I.enT), I.koT+' → '+I.enT);
  ok('🌐 EN 으로 툴팁도 바뀐다', I.koTitle!==I.enTitle && /Bigger faces/i.test(I.enTitle||''), String(I.enTitle));
  ok('언어를 바꿔도 SVG 아이콘이 살아 있다', I.svgAlive===true);
  ok('버튼 안에 «문장» 이 들어앉지 않았다', (I.btnText||'').length<=24, 'text="'+I.btnText+'" h='+I.lines+'px');

  // 문서 가로 넘침
  const O=await c.ev(`({sw:document.documentElement.scrollWidth, iw:innerWidth})`);
  ok('문서가 가로로 넘치지 않는다', O.sw<=O.iw+1, O.sw+' vs '+O.iw);
  const je=c.errs.filter(e=>!/favicon|net::|Failed to load/i.test(e));
  ok('JS 예외 없음', je.length===0, je.slice(0,2).join(' / '));
  c.kill();
}

await run(1440,900,'PC',false);
await run(844,390,'폰 가로',false);
await run(390,844,'폰 세로',true);
console.log('\n════════  PASS '+pass+'  FAIL '+fail+'  ════════');
process.exit(fail?1:0);
