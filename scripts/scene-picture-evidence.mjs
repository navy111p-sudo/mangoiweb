/* 🖼 그림이 «그 낱말을 보여 주는가» 판정 — 빌드와 회귀 검사가 같은 정본을 쓴다.
 *
 * 2026-09-21 사장님 지적: 「nice(좋은·멋진)」 카드에 가방 사진이 붙었다.
 *   옛 기준은 «그 낱말이 들어 있는 문장의 그림» 을 «그림이 있는 것 먼저» 로 골랐다.
 *   그림은 문장 전체를 보고 만든 것이라 대개 그 문장의 «다른» 낱말을 그린다
 *   (「I'm fine too. Thanks! Your backpack looks nice.」 의 그림 = 가방).
 *   실측: 낱말 줄 39,910개 중 21,255개(53%)가 그 낱말을 보여 주지 않는 그림이었다.
 *
 * ⛔ 「문장에 낱말이 있다」는 근거가 아니다. 근거는 «그 그림을 만들 때 쓴 설명» 하나뿐이다.
 * 🔴 그런데 설명 1,511개 중 1,414개(83.6%)는 설명이 아니라 그 문장을 그대로 넣은 틀이다
 *    (「Natural candid photograph. A person'm fine too. Thanks! Your backpack looks nice. …」).
 *    그것을 근거로 쓰면 판정이 다시 «문장에 낱말이 있다» 로 되돌아간다 — 고치려던 그 버그다.
 *    그래서 설명이 자기 문장을 네 낱말 이상 그대로 담고 있으면 «근거 없음» 으로 버린다.
 */
export const tokens=text=>(String(text||'').toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g)||[]);

/* 설명이 그 문장을 그대로 옮겨 적었는가(= 무엇이 그려졌는지 한 글자도 안 알려 준다). */
export function echoesSentence(description,sentence){
 const haystack=' '+tokens(description).join(' ')+' ',words=tokens(sentence);
 if(!words.length)return false;
 if(words.length<4)return haystack.includes(' '+words.join(' ')+' ');
 for(let i=0;i+4<=words.length;i++)if(haystack.includes(' '+words.slice(i,i+4).join(' ')+' '))return true;
 return false;
}

/* 낱말의 있음직한 표기 — 설명은 자연스러운 영어라 변형형으로 들어 있다(scissors/looking/boxes). */
export function variants(word){
 const v=new Set([word]),add=x=>{if(x.length>1)v.add(x);};
 add(word+'s');add(word+'es');add(word+'ing');add(word+'ed');add(word+'d');
 if(word.endsWith('y'))add(word.slice(0,-1)+'ies'),add(word.slice(0,-1)+'ied');
 if(word.endsWith('e'))add(word.slice(0,-1)+'ing'),add(word.slice(0,-1)+'ed');
 if(/[^aeiou][aeiou][^aeiouwxy]$/.test(word))add(word+word.slice(-1)+'ing'),add(word+word.slice(-1)+'ed');
 if(word.endsWith('ies'))add(word.slice(0,-3)+'y');
 if(word.endsWith('es'))add(word.slice(0,-2));
 if(word.endsWith('s'))add(word.slice(0,-1));
 if(word.endsWith('ing'))add(word.slice(0,-3)),add(word.slice(0,-3)+'e');
 if(word.endsWith('ed'))add(word.slice(0,-2)),add(word.slice(0,-1));
 return v;
}

/* 매체 열쇠(word-image:N · clip-image:N · video:N) → 그 그림의 «진짜» 설명. 메아리는 빈 문자열. */
export function describeMedia({assets,clips,sceneText}){
 const describe=new Map();
 for(const a of assets){
  const own=(a.scenes||[]).map(id=>sceneText.get(id)).filter(Boolean);
  describe.set('word-image:'+a.index,own.some(t=>echoesSentence(a.prompt,t))?'':String(a.prompt||''));
 }
 for(const c of clips){
  const raw=[c.visual,c.action,c.prompt].filter(Boolean).join(' '),text=echoesSentence(raw,c.text)?'':raw;
  describe.set('clip-image:'+c.index,text);describe.set('video:'+c.index,text);
 }
 /* 다시 찍은 영상은 같은 장면을 다시 만든 것이라 그 클립의 설명이 곧 그 그림의 설명이다.
    ⛔ 이미 설명이 있는 번호는 덮지 않는다 — 다른 클립의 그림을 빌려 쓴 경우는 «빌려 온 그림» 쪽 설명이 맞다. */
 for(const c of clips){
  if(!c.reuseClip)continue;
  const raw=[c.visual,c.action,c.prompt].filter(Boolean).join(' '),text=echoesSentence(raw,c.text)?'':raw;
  for(const kind of ['clip-image','video'])if(!describe.has(kind+':'+c.reuseClip))describe.set(kind+':'+c.reuseClip,text);
 }
 return describe;
}

/* 열쇠가 가리키는 그림이 그 낱말을 보여 주는가. 설명이 없으면(메아리였으면) 언제나 false. */
export function makeDepicts(describe){
 const cache=new Map();
 const tokenSet=key=>{if(!cache.has(key))cache.set(key,new Set(tokens(describe.get(key))));return cache.get(key);};
 return function depicts(word,key){
  if(!key)return false;
  const set=tokenSet(key);
  for(const v of variants(word))if(set.has(v))return true;
  return false;
 };
}
