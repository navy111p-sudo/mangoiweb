/* 🖼 그림이 «그 낱말을 보여 주는가» 판정 — 빌드와 회귀 검사가 같은 정본을 쓴다.
 *
 * 2026-09-21 사장님 지적: 「nice(좋은·멋진)」 카드에 가방 사진이 붙었다.
 *   옛 기준은 «그 낱말이 들어 있는 문장의 그림» 을 «그림이 있는 것 먼저» 로 골랐다.
 *   그림은 문장 전체를 보고 만든 것이라 대개 그 문장의 «다른» 낱말을 그린다
 *   (「I'm fine too. Thanks! Your backpack looks nice.」 의 그림 = 가방).
 *   실측: 옛 기준이 그림을 붙인 낱말 줄 39,762개 중 38,475개(96.8%)가 그 낱말을 보여 주지 않았다.
 *
 * ⛔ 「문장에 낱말이 있다」는 근거가 아니다. 근거는 «그 그림을 만들 때 쓴 설명» 하나뿐이다.
 * 🔴 그런데 설명 1,511개 중 1,485개(98.3%)는 설명이 아니라 그 문장을 그대로 넣은 틀이다
 *    (「Natural candid photograph. A person'm fine too. Thanks! Your backpack looks nice. …」).
 *    그것을 근거로 쓰면 판정이 다시 «문장에 낱말이 있다» 로 되돌아간다 — 고치려던 그 버그다.
 *    그래서 설명이 자기 문장을 네 낱말 이상 그대로 담고 있으면 «근거 없음» 으로 버린다.
 * 🔁 2026-09-21 함정 대조: 그 틀은 문장을 넣으면서 «I → A person · my → their» 로 바꿔 놓기도 한다.
 *    그러면 낱말 창이 어긋나 메아리가 «진짜 설명» 으로 빠져나간다 — 실측 48개(그림 줄 909개)가
 *    그랬고 전부 「A person obey their parents.」(← 「I obey my parents.」) 꼴이었다.
 *    ⛔ 창을 세 낱말로 좁혀서 풀지 마세요 — 멀쩡한 설명까지 버립니다(실측 97 → 38).
 *    바꿔 놓은 것을 되돌려 놓고(«a person» → «I») 소유격은 한 자리로 묶어 견준다.
 * 🧱 그리고 «거의 모든 설명에 들어 있는 낱말» 은 이 그림에 대해 아무것도 말해 주지 않는다
 *    (틀의 껍데기 — natural·candid·photograph·clear·subjects·soft·text …).
 *    ⛔ 그것을 근거로 삼으면 「clear·natural·subjects」 같은 낱말이 «모든» 그림에 붙는다
 *    (2026-09-21 실측으로 실제로 세 낱말이 그렇게 붙어 있었다). 그래서 껍데기는 근거에서 뺀다.
 * 🔍 마지막으로, 자기 문장에 없는 낱말을 둘도 못 보태는 설명은 «설명» 이 아니라 그 문장이다
 *    (「corn is sweet.」 ← 「Yes, corn is sweet.」 · 「People have a rug.」 ← 「We have a rug.」).
 *    실측 분포가 0~1개 아니면 8개 이상으로 갈려서 둘을 경계로 삼았다.
 */
/* 🔤 교재 «낱말» 로 셀 것 — 빌드와 회귀 검사가 이 한 함수를 씁니다(⛔ 다시 적지 마세요).
   2026-09-23 사장님 「PE가 따로 글자가 나와」 — 「P.E.」·「J.R.R.」 같은 점 약어가 p·e·j·r 로 쪼개져
   「e」 가 낱말 카드가 됐습니다. 점 약어는 통째로 빼고, 남은 한 글자 조각(K-pop 의 k · X-rays 의 x ·
   Vitamin C 의 c)도 낱말로 세지 않습니다. 「a」·「i」 는 원래 stopwords 입니다. 두 글자(tv·dc·hr)는 둡니다. */
export const vocabWords=(text,stop)=>[...new Set((String(text||'').replace(/\b(?:[A-Za-z]\.){2,}/g,' ').toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g)||[]).filter(w=>w.length>1&&!(stop&&stop.has(w))))];
export const tokens=text=>(String(text||'').toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g)||[]);

/* 틀이 바꿔 치운 자리를 되돌린다 — «a person('m)» → «i('m)», 소유격은 전부 한 자리(_p)로.
   ⛔ 주격 대명사(he/she/we…)까지 묶지 마세요 — 멀쩡한 설명이 «메아리» 로 잡힙니다. */
const POSSESSIVE=new Set(['my','your','his','her','its','our','their']);
export function normalizeTokens(text){
 const out=[];
 for(const t of tokens(text)){
  if(out[out.length-1]==='a'&&(t==='person'||t.startsWith("person'"))){out[out.length-1]='i'+t.slice(6);continue;}
  out.push(POSSESSIVE.has(t)?'_p':t);
 }
 return out;
}

/* 설명이 그 문장을 그대로 옮겨 적었는가(= 무엇이 그려졌는지 한 글자도 안 알려 준다). */
export function echoesSentence(description,sentence){
 const haystack=' '+normalizeTokens(description).join(' ')+' ',words=normalizeTokens(sentence);
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

/* 껍데기 낱말 — 설명의 80% 이상에 나오면 «이 그림» 에 대해 아무것도 말해 주지 않는다.
   ⛔ 목록을 손으로 적지 마세요 — 틀이 바뀌면 조용히 낡습니다. 있는 설명에서 세어 정합니다. */
export function shellTokens(texts){
 const seen=new Map();let n=0;
 for(const t of texts){const s=String(t||'');if(!s.trim())continue;n++;for(const w of new Set(tokens(s)))seen.set(w,(seen.get(w)||0)+1);}
 const shell=new Set();if(n<5)return shell;
 for(const [w,c] of seen)if(c>=n*0.8)shell.add(w);
 return shell;
}

/* 설명이 자기 문장에 없는 낱말을 둘 이상 보태는가(= 무엇이 그려졌는지 실제로 알려 주는가). */
export function addsDetail(description,sentences,shell){
 const own=new Set(sentences.flatMap(t=>tokens(t)));
 const novel=new Set();
 for(const w of tokens(description))if(!shell.has(w)&&!own.has(w))novel.add(w);
 return novel.size>=2;
}

/* 매체 열쇠(word-image:N · clip-image:N · video:N) → 그 그림의 «진짜» 설명. 메아리는 빈 문자열.
   ⛔ 이 함수를 «따로» 부르고 껍데기를 다시 세지 마세요 — 남은 설명만으로 세면 껍데기가 달라져
      (실측: clear·subjects 가 다시 근거가 됨) 판정이 조용히 헐거워집니다. pictureEvidence() 를 쓰세요. */
function describeMedia({assets,clips,sceneText}){
 const describe=new Map();
 /* 클립이 «설명»(visual·action)을 가지고 있으면 prompt 는 보지 않는다 — 그 안에 든 것은 같은 설명 + 틀뿐이다.
    🔴 2026-09-21 실측: 틀 낱말 중 light·setting·writing·subtitles 는 설명의 80% 에 못 미쳐 껍데기로 안 잡히는데,
       그 넷은 교재에 실제 낱말로 있다. prompt 를 근거에 넣으면 클립 549편 «전부» 가 그 넷을 보여 준다고 판정한다
       (= 「clear·natural·subjects 가 모든 그림에 붙는다」와 같은 사고). 좁히면 light 34 · setting 2 · writing 2 · subtitles 0.
    ⛔ 틀 낱말 목록을 손으로 적어 빼지 마세요 — 틀이 바뀌면 조용히 낡습니다. 설명이 없을 때만 prompt 로 떨어집니다.
    ✅ 「낱말 사진」 근거 판정(word-image 1,401건 중 1,398건 통과)과 껍데기 15개는 그대로입니다.
       ⚠️ 「한 건도 안 바뀐다」로 적지 마세요 — 클립 그림을 근거로 삼던 🖼 줄은 바뀝니다
          (빌드 A/B 실측: wordPictureRows 7,240 → 7,210 · 30줄. 그 30줄이 바로 「light·setting 을
          보여 준다」던 거짓 근거이므로, 줄어드는 것이 이 수리의 목적입니다). */
 const clipRaw=c=>((c.visual||c.action)?[c.visual,c.action]:[c.prompt]).filter(Boolean).join(' ');
 const shell=shellTokens([...assets.map(a=>a.prompt),...clips.map(clipRaw)]);
 for(const a of assets){
  const own=(a.scenes||[]).map(id=>sceneText.get(id)).filter(Boolean);
  const real=!own.some(t=>echoesSentence(a.prompt,t))&&addsDetail(a.prompt,own,shell);
  describe.set('word-image:'+a.index,real?String(a.prompt||''):'');
 }
 for(const c of clips){
  const raw=clipRaw(c),text=(!echoesSentence(raw,c.text)&&addsDetail(raw,[c.text],shell))?raw:'';
  describe.set('clip-image:'+c.index,text);describe.set('video:'+c.index,text);
 }
 /* 다시 찍은 영상은 같은 장면을 다시 만든 것이라 그 클립의 설명이 곧 그 그림의 설명이다.
    ⛔ 이미 설명이 있는 번호는 덮지 않는다 — 다른 클립의 그림을 빌려 쓴 경우는 «빌려 온 그림» 쪽 설명이 맞다. */
 for(const c of clips){
  if(!c.reuseClip)continue;
  const raw=clipRaw(c),text=(!echoesSentence(raw,c.text)&&addsDetail(raw,[c.text],shell))?raw:'';
  for(const kind of ['clip-image','video'])if(!describe.has(kind+':'+c.reuseClip))describe.set(kind+':'+c.reuseClip,text);
 }
 return {describe,shell};
}

/* 열쇠가 가리키는 그림이 그 낱말을 보여 주는가. 설명이 없으면(메아리였으면) 언제나 false.
   ⛔ 껍데기 낱말은 근거에서 뺀다 — 안 빼면 「clear·natural·subjects」가 모든 그림에 붙습니다.
   ⛔ 기능어(stopwords.json)도 뺀다 — 교재가 스스로 «뜻이 없다» 고 정해 둔 낱말이라
      그것이 설명에 있다고 무엇이 그려졌는지 한 글자도 알려 주지 않습니다.
   🔴 2026-09-21 실측: 이것을 안 빼면 variants() 의 어미 벗기기가 «있지도 않은 어미» 를 잘라
      기능어를 만들어 내고(thing→the · ones→on · toes→to · used→us) 그 기능어가 설명마다 있으니
      **「thing」이 클립 그림 549개 중 426개(77.6%) · 「ones」가 312개(56.8%) 에 붙습니다**
      (= 「clear 가 모든 그림에 붙는다」와 같은 사고). 빼면 그 둘이 0개 · 3개(0.5%)가 되고
      교재 낱말 중 최대 비율이 77.6%(thing) → 26.0%(hand 143개) 로 떨어집니다.
      「낱말 사진」 근거 판정은 1,398건 그대로이고, 🖼 줄은 7,211 → 7,210 한 줄 줄어듭니다(빌드 A/B 실측).
   ⛔ variants() 에서 그 넷을 손으로 빼지 마세요 — 어미 규칙이 바뀌면 조용히 낡습니다. */
function makeDepicts(describe,shell,stopWords){
 const cache=new Map();
 const tokenSet=key=>{if(!cache.has(key))cache.set(key,new Set(tokens(describe.get(key)).filter(t=>!shell.has(t)&&!stopWords.has(t))));return cache.get(key);};
 return function depicts(word,key){
  if(!key)return false;
  const set=tokenSet(key);
  for(const v of variants(word))if(set.has(v))return true;
  return false;
 };
}

/* 🖼 정본 입구 — 빌드도 회귀 검사도 이것 «하나» 만 부른다(설명·껍데기·판정이 짝을 잃지 않게). */
export function pictureEvidence({assets,clips,sceneText,stopWords}){
 const {describe,shell}=describeMedia({assets,clips,sceneText});
 return {describe,shell,depicts:makeDepicts(describe,shell,stopWords instanceof Set?stopWords:new Set(stopWords||[]))};
}

/* 🖼 낱말 사진 표는 «여러 파일» 로 나뉩니다 — `word-image-plan.json` · `word-image-plan-2.json` …
   (한 파일에 몰면 diff 가 통째로 커지고 병합 충돌이 잦아집니다).
   ⛔ 빌드와 회귀 검사가 «같은 집합» 을 봐야 합니다 — 한쪽에만 파일을 더하면
      「빌드는 사진을 붙이는데 검사는 그 사진을 모르는」 상태가 되고(그 반대면 거짓 FAIL),
      둘 다 조용합니다. 그래서 목록을 만드는 규칙을 여기 한 곳에 둡니다.
   ⛔ `word-image-pending.json` 처럼 «표가 아닌» 파일이 걸리지 않게 이름을 정확히 봅니다. */
export const WORD_PLAN_RE=/^word-image-plan(?:-\d+)?\.json$/;
export const wordPlanFiles=names=>names.filter(f=>WORD_PLAN_RE.test(f)).sort();
