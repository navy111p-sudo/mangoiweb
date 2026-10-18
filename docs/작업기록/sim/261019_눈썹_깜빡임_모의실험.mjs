// 30분 연속 말하기 모의실험 — 강세(onset)는 평균 0.6초 간격(지수분포).
function run(gapMin, gapRand, chance, retryFix, seed){
  let s=seed; const rnd=()=>{ s=(s*1103515245+12345)%2147483648; return s/2147483648; };
  const END=30*60*1000; let t=0, browNext=900, browHold=0, browUntil=0;
  const raises=[], blocks=[];
  let nextOnset=rnd()*600;
  while(t<END){ t=nextOnset; nextOnset=t-Math.log(1-rnd())*600;
    if(t>=browNext && t>=browHold){ browNext=t+gapMin+rnd()*gapRand;
      if(rnd()<chance){ const big=rnd()<0.3; rnd(); browHold=t+160+rnd()*(big?420:300); browUntil=browHold+450; blocks.push([t,browUntil]); raises.push(t);} } }
  const blocked=(x)=>blocks.some(([a,b])=>x>=a&&x<b), untilAt=(x)=>{const b=blocks.find(([a,b])=>x>=a&&x<b);return b?b[1]:0;};
  let bt=2200+rnd()*3800, blinks=[], tries=0;
  while(bt<END){ tries++; if(blocked(bt)){ bt = retryFix ? untilAt(bt)+120+rnd()*400 : bt+2200+rnd()*3800; continue; } blinks.push(bt); bt+=2200+rnd()*3800; }
  const gaps=blinks.slice(1).map((x,i)=>x-blinks[i]).sort((a,b)=>a-b);
  return {raisesPerMin:(raises.length/30).toFixed(1), blinkEvery:(END/blinks.length/1000).toFixed(1)+'s', p95gap:(gaps[Math.floor(gaps.length*0.95)]/1000).toFixed(1)+'s', maxGap:(gaps[gaps.length-1]/1000).toFixed(1)+'s'};
}
for (const [name,args] of [['옛(1.4~4초·80%)',[1400,2600,0.8,false]],['새(1~2초·매번)',[1000,1000,1,false]],['새+깜빡임 재시도 보정',[1000,1000,1,true]]]){
  const r=[1,2,3].map(sd=>run(...args,sd*7919)); console.log(name.padEnd(22), JSON.stringify(r[0]), '|', JSON.stringify(r[1]));
}
