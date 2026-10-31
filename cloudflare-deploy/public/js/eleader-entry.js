/* Server-authorized navigation only. No auto-enrollment, audio or AI calls. */
(() => {
  'use strict';
  const box=document.getElementById('eleaderEntry');
  if(!box)return;
  let epoch=0,controller,lastToken='';
  const token=()=>localStorage.getItem('mango_token')||'';
  // EN/KO follows the site-wide key `mangoi_lang`, same as warmup.html wuEn().
  const en=()=>{try{return localStorage.getItem('mangoi_lang')==='en';}catch{return false;}};
  const T={chip:{ko:' · 맞춤 문항 연습',en:' · custom question practice'},
    note:{ko:'학원에서 배정한 3유닛·60문항 · 한글 힌트와 문장 예시. 실제 AI 음성 사용 여부는 전용관 안내를 확인해 주세요.',
      en:'3 units · 60 questions assigned by your academy, with Korean hints and example sentences. Check the practice room notice for whether real AI voice is available.'}};
  const L=k=>T[k][en()?'en':'ko'];
  function clear(){epoch++;controller?.abort();controller=null;box.hidden=true;box.replaceChildren();}
  async function entries(t,signal){
    const r=await fetch('/api/ai/eleader/entry',{headers:{Authorization:'Bearer '+t},credentials:'omit',cache:'no-store',signal});
    if(!r.ok)throw Error('unavailable');
    const data=await r.json();
    if(!Array.isArray(data.entries))throw Error('invalid');
    return data.entries.filter(e=>e.role==='student'&&/^[a-z0-9-]{1,64}$/.test(e.academy)&&e.href==='/eleader-pilot.html?academy='+encodeURIComponent(e.academy)&&typeof e.name==='string');
  }
  async function refresh(){
    clear();const t=token(),version=epoch;lastToken=t;if(!t)return;
    controller=new AbortController();
    try{
      const list=await entries(t,controller.signal);
      if(version!==epoch||token()!==t)return;
      for(const e of list){
        const b=document.createElement('button');b.type='button';b.className='howto-chip';b.textContent=e.name+L('chip');
        b.onclick=async()=>{
          if(token()!==t){clear();return;}b.disabled=true;
          try{const current=await entries(t,controller.signal);if(version!==epoch||token()!==t)return;
            if(current.some(x=>x.academy===e.academy&&x.href===e.href))location.assign(e.href);else clear();
          }catch{clear();}
        };
        box.append(b);
      }
      if(list.length){const note=document.createElement('p');note.textContent=L('note');box.append(note);box.hidden=false;}
    }catch{/* Other academies and disabled releases retain their existing flow. */}
  }
  window.addEventListener('storage',e=>{if(e.key==='mango_token'||e.key===null){clear();refresh();}});
  window.addEventListener('pageshow',refresh);
  window.addEventListener('pagehide',clear);
  const checkIdentity=()=>{if(token()!==lastToken)refresh();};
  window.addEventListener('mangoi:lang-changed',()=>{if(!box.hidden)refresh();});
  window.addEventListener('focus',checkIdentity);
  window.addEventListener('mangoi:auth-changed',checkIdentity);
  window.setInterval(checkIdentity,1000);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();else refresh();});
  refresh();
})();
