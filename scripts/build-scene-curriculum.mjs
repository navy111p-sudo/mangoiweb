/* Build book-sized, deduplicated browser payloads from the existing course sources. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {pictureEvidence} from './scene-picture-evidence.mjs';
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
const sceneText=new Map(selected.map(r=>[r.id,r.text]));
/* 🖼 판정 정본은 scripts/scene-picture-evidence.mjs 한 곳 — 회귀 검사도 같은 모듈을 돌린다.
   ⛔ 여기에 판정을 다시 적지 마세요(한쪽만 고쳐지는 사고가 이 저장소에 반복해 있었습니다). */
const {describe,depicts}=pictureEvidence({assets,clips,sceneText});
const scenes=new Map();
for(const row of selected){const source=all.get(row.id);if(!source||source.text!==row.text)throw Error('Source drift '+row.id);const s={id:row.id,text:source.text,source:labels[source.refs[0][0]]+' · #'+source.refs[0][1],refs:source.refs};const index=assetIndex.get(row.asset);const fallback=contextImages[index];if(fallback&&!lookup.has(fallback))throw Error('Unverified context image '+fallback);const key=fallback||('word-image:'+index);imageMeta(s,lookup.get(key),key);scenes.set(s.id,s);}
const clipRows=[];
for(const clip of clips){const source=all.get(clip.id);if(!source||source.text!==clip.text)throw Error('Clip source drift '+clip.id);const target=clip.reuseClip||clip.index;const movie=lookup.get('video:'+target);if(!movie)continue;let s=scenes.get(clip.id)||{id:clip.id,text:clip.text,source:labels[clip.refs[0][0]]+' · #'+clip.refs[0][1],refs:source.refs};imageMeta(s,lookup.get('clip-image:'+target),'clip-image:'+target);s.video=movie.url;s.videoBytes=movie.bytes;s.duration=movie.duration;scenes.set(s.id,s);clipRows.push({...clip,scene:s.id});}
const candidates=new Map();
for(const s of scenes.values())for(const w of words(s.text)){if(!candidates.has(w))candidates.set(w,[]);candidates.get(w).push(s);}
const dir=path.join(root,'cloudflare-deploy/public/data/scene-curriculum/v1');fs.mkdirSync(dir,{recursive:true});
const manifest={version:1,source:'Mangoi book practice sentences',books:[],wordForms:0,wordPictureForms:0,contextOnlyForms:0,noPictureForms:0,sourceEntries:books.reduce((n,b)=>n+b.sentences.length,0),uniqueSourceSentences:all.size,clips:new Set(clipRows.map(c=>scenes.get(c.scene).video)).size};
const unique=new Set(),wordPictured=new Set(),contextPictured=new Set(),usedImages=new Set();let maxBook=0,maxGzip=0,rowWord=0,rowContext=0,rowNone=0,rowUndescribed=0;
for(const book of books){
 const vocab=new Map();book.sentences.forEach((text,i)=>words(text).forEach(w=>{if(!vocab.has(w))vocab.set(w,{word:w,sourceIndex:i+1,bookExample:text});}));
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
  if(!chosen){pictures=0;
   /* 근거가 없으면 «낱말 그림» 이라고 말하지 않는다. 대신 그림이 «실제로 그려 낸 그 문장» 과만 짝지어 보여 준다.
      곧 «이 낱말의 교재 예문» 자체의 그림만 쓰고, 그것이 없으면 그림을 붙이지 않는다.
      ⛔ 같은 교재라도 «다른 문장» 의 그림을 빌려 오지 마세요 — 「nice」 에 「Your backpack looks nice.」 의
         가방 사진이 붙던 길이 그것입니다(2026-09-21 사장님 지적). 억지로 붙인 그림은 없는 것보다 나쁩니다.
      ⛔ 남의 교재 문장도 쓰지 않는다 — BTS 1 학생에게 SIU ADVANCE 문장이 가던 길이다. */
   const source=all.get(id(row.bookExample));
   chosen=scenes.get(source.id)||{id:source.id,text:source.text,source:book.label+' · #'+row.sourceIndex,refs:source.refs};
  }
  if(pictures){wordPictured.add(word);rowWord++;}else if(chosen.image){contextPictured.add(word);rowContext++;}else rowNone++;
  if(chosen.image&&!(describe.get(chosen.key)||'').trim())rowUndescribed++;
  /* 교재 예문 = bookExample ?? scenes[scene].text. 그림이 바로 그 예문의 그림일 때는 같은 문장이 두 번 실리므로 한 번만 보낸다. */
  const entry={...row,scene:chosen.id};if(chosen.text===row.bookExample)delete entry.bookExample;if(pictures)entry.pic=1;
  data.words.push(entry);data.scenes[chosen.id]=chosen;
 }
 for(const clip of clipRows){if(clip.refs.some(r=>r[0]===book.id)){data.clips.push({scene:clip.scene,sourceIndex:clip.refs.find(r=>r[0]===book.id)[1]});data.scenes[clip.scene]=scenes.get(clip.scene);}}
 // References used to choose examples are build-time metadata, not browser payload.
 /* 다른 교재에서 온 그림은 «그림» 만 쓰고 그 문장은 안 보낸다 — 화면에 안 보여 주고(수준이 다르다) 용량만 먹는다.
    그래서 scene.text 가 있으면 «이 교재의 문장» 이라는 뜻이다. */
 data.scenes=Object.fromEntries(Object.entries(data.scenes).map(([sid,{refs,key,text,...s}])=>[sid,(refs||[]).some(r=>r[0]===book.id)?{text,...s}:s]));
 Object.values(data.scenes).forEach(s=>{if(s.image)usedImages.add(s.image);});
 const body=JSON.stringify(data);const bytes=Buffer.byteLength(body),gzip=zlib.gzipSync(body).length;maxBook=Math.max(maxBook,bytes);maxGzip=Math.max(maxGzip,gzip);
 if(bytes>350000||gzip>80000)throw Error('Book payload exceeds budget: '+book.id);
 fs.writeFileSync(path.join(dir,book.id+'.json'),body+'\n');
 manifest.books.push({id:book.id,series:book.series,number:book.number,label:book.label,title:book.title,words:data.words.length,wordPictures:data.words.filter(w=>w.pic).length,contextPictures:data.words.filter(w=>!w.pic&&data.scenes[w.scene].image).length,clips:data.clips.length,bytes,gzip});
}
manifest.wordForms=unique.size;manifest.wordPictureForms=wordPictured.size;
manifest.contextOnlyForms=[...contextPictured].filter(w=>!wordPictured.has(w)).length;
manifest.noPictureForms=unique.size-manifest.wordPictureForms-manifest.contextOnlyForms;
manifest.describedAssets=[...new Set(assets.map(a=>'word-image:'+a.index))].filter(k=>(describe.get(k)||'').trim()).length;
manifest.assets=assets.length;manifest.undescribedPictureRows=rowUndescribed;
manifest.wordRows=rowWord+rowContext+rowNone;manifest.wordPictureRows=rowWord;manifest.contextPictureRows=rowContext;manifest.noPictureRows=rowNone;
manifest.maxBookBytes=maxBook;manifest.maxBookGzipBytes=maxGzip;manifest.imageAssets=usedImages.size;
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest)+'\n');
console.log(JSON.stringify({books:books.length,wordForms:unique.size,wordPictureForms:manifest.wordPictureForms,contextOnlyForms:manifest.contextOnlyForms,noPictureForms:manifest.noPictureForms,wordPictureRows:rowWord,contextPictureRows:rowContext,noPictureRows:rowNone,describedAssets:manifest.describedAssets+'/'+assets.length,clips:manifest.clips,maxBookBytes:maxBook,maxBookGzipBytes:maxGzip,booksWithoutClips:manifest.books.filter(b=>!b.clips).map(b=>b.id)}));
