/* Build book-sized, deduplicated browser payloads from the existing course sources. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {pictureEvidence} from './scene-picture-evidence.mjs';
/* 🎨 낱말 그림카드의 그림문자 정본은 화면 파일 한 곳(cloudflare-deploy/public/js/scene-curriculum.js).
   ⛔ 여기에 표를 복제하지 마세요 — 한쪽만 고쳐지는 사고가 이 저장소에 반복해 있었습니다. */
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const inputs=path.join(root,process.argv[2]||'docs/scene-curriculum-media');
const read=name=>JSON.parse(fs.readFileSync(path.join(inputs,name),'utf8'));
const selected=read('scene-plan.json'),assets=read('asset-plan.json'),clips=read('clip-plan.json'),media=read('optimized-media.json');
const excluded=new Set(read('excluded-media.json'));
const contextImages=read('context-images.json').images;
const stop=new Set(read('stopwords.json').concat(['ken','karen','tom','nelly','poko','leon',"leon's"]));
const words=text=>[...new Set((text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g)||[]).filter(w=>!stop.has(w)))];
const id=text=>crypto.createHash('sha256').update(text).digest('hex').slice(0,12);
const courses=[['bts','speech-data-bts.js','BTS_SENTENCES'],['siu-basic','speech-data-siu-basic.js','SIU_BASIC_SENTENCES'],['siu-advance','speech-data-siu-advance.js','SIU_ADVANCE_SENTENCES']];
const books=[],all=new Map();
for(const [series,file,name] of courses){
 const code=fs.readFileSync(path.join(root,'cloudflare-deploy/public/js',file),'utf8');
 const source=JSON.parse(vm.runInNewContext(code+'\nJSON.stringify('+name+')',{}, {timeout:5000}));
 Object.entries(source).forEach(([label,b],n)=>{
  const book={id:series+'-'+String(n+1).padStart(2,'0'),series,number:n+1,label,title:b.title,topic:b.topic,sentences:b.sentences};books.push(book);
  b.sentences.forEach((text,i)=>{const sid=id(text);if(!all.has(sid))all.set(sid,{id:sid,text,refs:[],words:words(text)});all.get(sid).refs.push([book.id,i+1]);});
 });
}
const labels=Object.fromEntries(books.map(b=>[b.id,b.label]));
const assetIndex=new Map(assets.map(a=>[a.id,a.index]));
const lookup=new Map();
for(const m of media){const key=(m.kind||'word-image')+':'+m.index;if(m.url&&m.uploaded&&!excluded.has(key))lookup.set(key,m);}
function imageMeta(s,m,key){if(m){s.image=m.url;s.imageBytes=m.bytes;s.key=key;}}
/* 🖼 그림 설명 — 그 그림을 만들 때 쓴 지시문. «이 그림에 무엇이 그려져 있는가» 의 유일한 근거다.
   ⛔ 문장에 낱말이 들어 있다는 사실은 근거가 아니다(그림은 문장 «전체» 를 보고 만들었고,
      대개 그 문장의 다른 낱말을 그린다 — 「Your backpack looks nice.」 의 그림은 가방이다). */
/* 🖼 2026-09-21 사장님 지시(그림문자 카드를 실사 사진으로) — 낱말마다 «그 낱말을 그린» 사진 한 장.
   ⛔ 「사진이 있으니 붙인다」가 아닙니다 — 아래 depicts() 가 «그 사진의 설명이 이 낱말을 가리키는가» 를
      다시 확인할 때만 붙습니다(판정 정본은 scripts/scene-picture-evidence.mjs 한 곳).
   ⛔ 이 설명들을 assets 에 «섞지» 마세요 — assetIndex·contextImages·manifest.assets 가 그 배열을 씁니다.
      껍데기 낱말만 함께 세도록 pictureEvidence 에만 이어 붙입니다.
   ⚠️ 파일이 없으면 표에 있어도 안 붙입니다 — 표만 늘리고 그림을 커밋에 안 담으면 조용히 빈 그림이 됩니다
      (2026-08-31 Lily 얼굴이 그렇게 며칠 동안 옛 얼굴로 돌았습니다). */
const wordImageDir=path.join(root,'cloudflare-deploy/public/img/scene-words');
const wordImagePlan=fs.existsSync(path.join(inputs,'word-image-plan.json'))?read('word-image-plan.json'):[];
const wordImages=[],wordAssets=[];
for(const it of wordImagePlan){
 const file=path.join(wordImageDir,it.index+'.webp');
 if(!fs.existsSync(file))continue;
 wordImages.push({word:it.word,index:it.index,bytes:fs.statSync(file).size});
 wordAssets.push({id:'w'+it.index,index:it.index,prompt:it.prompt,scenes:[]});
}
const sceneText=new Map(selected.map(r=>[r.id,r.text]));
/* 🖼 판정 정본은 scripts/scene-picture-evidence.mjs 한 곳 — 회귀 검사도 같은 모듈을 돌린다.
   ⛔ 여기에 판정을 다시 적지 마세요(한쪽만 고쳐지는 사고가 이 저장소에 반복해 있었습니다). */
const {describe,depicts}=pictureEvidence({assets:assets.concat(wordAssets),clips,sceneText,stopWords:stop});
/* 🖼 낱말 사진 — «그 설명이 이 낱말을 가리킬 때만» 씁니다. 못 가리키면 목록에서 빠집니다. */
/* 🖼 2026-09-21 사장님 지시(「그림문자 없애고 힉스필드 실사 이미지들로만」) — 사진 한 장이 «실제로
   보여 주는» 모든 낱말에 붙인다. 옛 코드는 «만들 때 정한 낱말» 하나에만 붙였다 — 그래서 책상이
   버젓이 찍힌 사진을 가지고도 「desk」는 그림문자 카드였다(실측: 그렇게 되찾는 낱말 988개 · 5,267줄).
   ⛔ 근거 기준은 한 글자도 안 바뀝니다 — depicts() 가 «그 사진의 설명이 이 낱말을 가리키는가» 를 그대로 봅니다.
      「nice ← 가방」은 설명이 nice 를 가리키지 않아 여전히 안 붙습니다. 바뀐 것은 «한 사진이 몇 낱말에 닿는가» 뿐입니다.
   ✅ 고르는 순서는 «그 낱말을 그리려고 만든 사진»(0) › «다른 낱말 사진이 함께 보여 주는 것»(1).
   ⛔ 여기에 «장면 그림»(clip-image) 을 넣지 마세요 — 사람이 여럿 나오는 복잡한 장면이라 낱말 하나를
      가리키기엔 약하고, 그 그림은 이미 «그 문장» 의 포스터로 쓰입니다(실측으로 187개를 더 얻지만
      그만큼 «주인공이 아닌 그림» 이 낱말 자리에 섭니다 — 그 자리는 새 낱말 사진으로 채웁니다).
   ⚠️ 동점이면 index 가 작은 쪽 — 빌드가 돌 때마다 같은 답이 나와야 합니다(결정론). */
const vocabAll=new Set();for(const s of all.values())for(const w of s.words)vocabAll.add(w);
const wordScene=new Map();
{
 const best=new Map();
 const consider=(w,rank,index,make)=>{const cur=best.get(w);
  if(cur&&(cur.rank<rank||(cur.rank===rank&&cur.index<=index)))return;
  best.set(w,{rank,index,make});};
 for(const it of wordImages){const key='word-image:'+it.index;
  const make=()=>({id:'w'+it.index,refs:[],image:'/img/scene-words/'+it.index+'.webp',imageBytes:it.bytes,key});
  if(depicts(it.word,key))consider(it.word,0,it.index,make);
  for(const w of vocabAll)if(w!==it.word&&depicts(w,key))consider(w,1,it.index,make);
 }
 for(const [w,v] of best)wordScene.set(w,v.make());
}
const scenes=new Map();
for(const row of selected){const source=all.get(row.id);if(!source||source.text!==row.text)throw Error('Source drift '+row.id);const s={id:row.id,text:source.text,source:labels[source.refs[0][0]]+' · #'+source.refs[0][1],refs:source.refs};const index=assetIndex.get(row.asset);const fallback=contextImages[index];if(fallback&&!lookup.has(fallback))throw Error('Unverified context image '+fallback);const key=fallback||('word-image:'+index);imageMeta(s,lookup.get(key),key);scenes.set(s.id,s);}
const clipRows=[];
for(const clip of clips){const source=all.get(clip.id);if(!source||source.text!==clip.text)throw Error('Clip source drift '+clip.id);const target=clip.reuseClip||clip.index;const movie=lookup.get('video:'+target);if(!movie)continue;let s=scenes.get(clip.id)||{id:clip.id,text:clip.text,source:labels[clip.refs[0][0]]+' · #'+clip.refs[0][1],refs:source.refs};imageMeta(s,lookup.get('clip-image:'+target),'clip-image:'+target);s.video=movie.url;s.videoBytes=movie.bytes;s.duration=movie.duration;scenes.set(s.id,s);clipRows.push({...clip,scene:s.id});}
const candidates=new Map();
for(const s of scenes.values())for(const w of words(s.text)){if(!candidates.has(w))candidates.set(w,[]);candidates.get(w).push(s);}
const dir=path.join(root,'cloudflare-deploy/public/data/scene-curriculum/v1');fs.mkdirSync(dir,{recursive:true});
const manifest={version:1,source:'Mangoi book practice sentences',books:[],wordForms:0,wordPictureForms:0,cardOnlyForms:0,sourceEntries:books.reduce((n,b)=>n+b.sentences.length,0),uniqueSourceSentences:all.size,clips:new Set(clipRows.map(c=>scenes.get(c.scene).video)).size};
const unique=new Set(),wordPictured=new Set(),usedImages=new Set();
const {pictogram}=createRequire(import.meta.url)('../cloudflare-deploy/public/js/scene-curriculum.js');let maxBook=0,maxGzip=0,rowWord=0,rowCard=0,rowCardExact=0,rowUndescribed=0;
for(const book of books){
 /* 🖼 2026-09-21 사장님 지시(모든 낱말에 그림) — 그 교재 «안» 에서 그림이 있는 예문을 먼저 고른다.
    ⛔ 「다른 문장의 그림만 빌려 오기」가 아닙니다 — 예문 자체를 그 문장으로 바꿔 그림과 예문을 짝지웁니다.
    ⛔ 다른 교재 문장으로는 바꾸지 마세요(수준이 다릅니다 — BTS 1 학생에게 SIU ADVANCE 문장이 가던 길).
    ⚠️ 첫 문장이 아니게 되므로 sourceIndex 도 함께 옮겨야 합니다(연습 구간이 예문과 어긋나면 안 됩니다). */
 const occur=new Map();book.sentences.forEach((text,i)=>words(text).forEach(w=>{if(!occur.has(w))occur.set(w,[]);occur.get(w).push({sourceIndex:i+1,bookExample:text});}));
 const vocab=new Map();
 for(const [w,list] of occur){const shown=list.find(o=>(scenes.get(id(o.bookExample))||{}).image)||list[0];vocab.set(w,{word:w,sourceIndex:shown.sourceIndex,bookExample:shown.bookExample});}
 const data={id:book.id,label:book.label,title:book.title,topic:book.topic,words:[],clips:[],scenes:{}};
 for(const [word,row] of vocab){
  unique.add(word);
  /* 🖼 2026-09-21 — 그림은 «그 문장에 낱말이 들어 있다» 가 아니라 «그림 설명이 그 낱말을 보여 준다» 로만 붙인다.
     옛 기준은 그림이 있는 쪽을 먼저 골라서, 「nice」 에 「Your backpack looks nice.」 의 가방 사진을 붙였다.
     ⛔ 근거가 없으면 붙이지 않는다 — 억지로 붙인 그림은 없는 것보다 나쁘다(아이가 그 뜻으로 외운다). */
  const inBook=s=>s.refs.some(r=>r[0]===book.id);
  const pool=(candidates.get(word)||[]).filter(s=>s.image&&depicts(word,s.key));
  pool.sort((a,b)=>Number(!inBook(a))-Number(!inBook(b))||a.text.length-b.text.length||(a.id<b.id?-1:1));
  let chosen=pool[0],pictures=1;
  if(!chosen){
   /* 🖼 ② 그 낱말만 그린 사진 — 이것도 근거가 검증된 사진이다(wordScene 이 depicts() 를 이미 통과시킨다).
      🔴 2026-09-21 사장님 2차 지적(「아직도 nice 에 가방이 보여」) — 옛 코드는 이 갈래를 «예문 사진 뒤» 로
         미뤄 두었다. 그래서 그 낱말을 실제로 그린 사진이 있는데도 엉뚱한 예문 사진이 이겼다.
         실측: 순서를 바로잡는 것만으로 12,246줄이 «진짜 그 낱말 사진» 으로 살아난다.
      ⛔ 다시 뒤로 미루지 마세요 — 근거 있는 사진이 근거 없는 사진에 지는 순서가 됩니다. */
   const ws=wordScene.get(word);
   if(ws)chosen={...ws,source:book.label+' · #'+row.sourceIndex};
   else{pictures=0;
    /* 🔴 근거가 없으면 사진을 «아예 붙이지 않는다» — 예문만 싣고 화면이 낱말 그림카드를 그린다.
       옛 코드는 그 예문의 사진을 붙이고 「낱말 뜻 그림은 아니에요」라고 «말만» 했는데, 아이는 그 글자보다
       사진을 먼저 본다(2026-09-21 사장님: 「전혀 상관관계가 없는데 서로 다른 단어와 실사 이미지가
       이렇게 되면 문제야」). 억지로 붙인 그림은 없는 것보다 나쁘다.
       ⛔ 예문 사진을 되살리지 마세요. ⛔ 다른 문장·다른 교재의 사진을 빌려 오지도 마세요. */
    const source=all.get(id(row.bookExample));
    chosen=scenes.get(source.id)||{id:source.id,text:source.text,source:book.label+' · #'+row.sourceIndex,refs:source.refs};
   }
  }
  /* 🎨 사진이 하나도 없으면 «그림 없음» 이 아니라 화면이 그리는 낱말 그림카드가 붙는다(모든 낱말에 그림).
     여기서는 그 줄이 몇 개인지와, 그 가운데 «뜻에 맞는 그림문자» 를 받는 줄이 몇 개인지만 센다. */
  if(pictures){wordPictured.add(word);rowWord++;}
  else{rowCard++;if(pictogram(word).exact)rowCardExact++;}
  if(chosen.image&&!(describe.get(chosen.key)||'').trim())rowUndescribed++;
  /* 교재 예문 = bookExample ?? scenes[scene].text. 그림이 바로 그 예문의 그림일 때는 같은 문장이 두 번 실리므로 한 번만 보낸다. */
  const entry={...row,scene:chosen.id};if(chosen.text===row.bookExample)delete entry.bookExample;if(pictures)entry.pic=1;
  data.words.push(entry);data.scenes[chosen.id]=chosen;
 }
 for(const clip of clipRows){if(clip.refs.some(r=>r[0]===book.id)){data.clips.push({scene:clip.scene,sourceIndex:clip.refs.find(r=>r[0]===book.id)[1]});data.scenes[clip.scene]=scenes.get(clip.scene);}}
 /* 🔴 2026-09-21 — 근거 없는 줄이 가리키는 장면에서는 사진 주소를 «payload 에 아예 싣지 않는다».
    화면 판정만 고치면 주소가 남아 다음 사람이 「있으니 쓰자」로 되살립니다(그것이 「nice → 가방」의 길).
    ⚠️ scenes 는 여러 교재가 함께 쓰는 «원본» 이라 반드시 사본을 만들어 뺍니다 — 원본에서 지우면 남의 교재가 깨집니다.
    ✅ 사진이 남는 자리는 둘뿐입니다: 근거 있는 낱말 그림(w.pic)과 문장 영상의 포스터(clips). */
 {const keep=new Set();data.words.forEach(w=>{if(w.pic)keep.add(w.scene);});data.clips.forEach(c=>keep.add(c.scene));
  /* 사진이 필요 없는 장면은 그 자리에서 주소를 뗀다(사본으로 — scenes 는 여러 교재가 함께 쓰는 원본이다). */
  for(const [sid,sc] of Object.entries(data.scenes)){if(keep.has(sid)||!sc.image)continue;const {image,imageBytes,...rest}=sc;data.scenes[sid]=rest;}
  /* 🔴 한 장면을 «사진이 필요한 낱말» 과 «근거 없는 낱말» 이 함께 쓸 때(실측 6,116줄) 주소가 남습니다.
     그때는 근거 없는 줄만 «사진 없는 쌍둥이 장면» 으로 옮겨 둡니다 — 화면 판정에만 기대지 않습니다. */
  for(const w of data.words){if(w.pic||!keep.has(w.scene))continue;const base=data.scenes[w.scene];if(!base||!base.image)continue;
   const twin=w.scene+'~';if(!data.scenes[twin]){const {image,imageBytes,key,...rest}=base;data.scenes[twin]=rest;}
   w.scene=twin;}}
 // References used to choose examples are build-time metadata, not browser payload.
 /* 다른 교재에서 온 그림은 «그림» 만 쓰고 그 문장은 안 보낸다 — 화면에 안 보여 주고(수준이 다르다) 용량만 먹는다.
    그래서 scene.text 가 있으면 «이 교재의 문장» 이라는 뜻이다. */
 data.scenes=Object.fromEntries(Object.entries(data.scenes).map(([sid,{refs,key,text,...s}])=>[sid,(refs||[]).some(r=>r[0]===book.id)?{text,...s}:s]));
 Object.values(data.scenes).forEach(s=>{if(s.image)usedImages.add(s.image);});
 const body=JSON.stringify(data);const bytes=Buffer.byteLength(body),gzip=zlib.gzipSync(body).length;maxBook=Math.max(maxBook,bytes);maxGzip=Math.max(maxGzip,gzip);
 if(bytes>350000||gzip>80000)throw Error('Book payload exceeds budget: '+book.id);
 fs.writeFileSync(path.join(dir,book.id+'.json'),body+'\n');
 manifest.books.push({id:book.id,series:book.series,number:book.number,label:book.label,title:book.title,words:data.words.length,wordPictures:data.words.filter(w=>w.pic).length,clips:data.clips.length,bytes,gzip});
}
manifest.wordForms=unique.size;manifest.wordPictureForms=wordPictured.size;
manifest.cardOnlyForms=unique.size-manifest.wordPictureForms;
manifest.describedAssets=[...new Set(assets.map(a=>'word-image:'+a.index))].filter(k=>(describe.get(k)||'').trim()).length;
manifest.assets=assets.length;manifest.undescribedPictureRows=rowUndescribed;
manifest.wordRows=rowWord+rowCard;manifest.wordPictureRows=rowWord;manifest.cardRows=rowCard;manifest.cardPictogramRows=rowCardExact;
manifest.maxBookBytes=maxBook;manifest.maxBookGzipBytes=maxGzip;manifest.imageAssets=usedImages.size;
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest)+'\n');
console.log(JSON.stringify({books:books.length,wordForms:unique.size,wordPictureForms:manifest.wordPictureForms,cardOnlyForms:manifest.cardOnlyForms,wordPictureRows:rowWord,cardRows:rowCard,cardPictogramRows:rowCardExact,describedAssets:manifest.describedAssets+'/'+assets.length,clips:manifest.clips,maxBookBytes:maxBook,maxBookGzipBytes:maxGzip,booksWithoutClips:manifest.books.filter(b=>!b.clips).map(b=>b.id)}));
