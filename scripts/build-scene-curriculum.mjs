/* Build book-sized, deduplicated browser payloads from the existing course sources. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
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
function imageMeta(s,m){if(m){s.image=m.url;s.imageBytes=m.bytes;}}
const scenes=new Map();
for(const row of selected){const source=all.get(row.id);if(!source||source.text!==row.text)throw Error('Source drift '+row.id);const s={id:row.id,text:source.text,source:labels[source.refs[0][0]]+' · #'+source.refs[0][1],refs:source.refs};const index=assetIndex.get(row.asset);const fallback=contextImages[index];if(fallback&&!lookup.has(fallback))throw Error('Unverified context image '+fallback);imageMeta(s,lookup.get(fallback||('word-image:'+index)));scenes.set(s.id,s);}
const clipRows=[];
for(const clip of clips){const source=all.get(clip.id);if(!source||source.text!==clip.text)throw Error('Clip source drift '+clip.id);const target=clip.reuseClip||clip.index;const movie=lookup.get('video:'+target);if(!movie)continue;let s=scenes.get(clip.id)||{id:clip.id,text:clip.text,source:labels[clip.refs[0][0]]+' · #'+clip.refs[0][1],refs:source.refs};imageMeta(s,lookup.get('clip-image:'+target));s.video=movie.url;s.videoBytes=movie.bytes;s.duration=movie.duration;scenes.set(s.id,s);clipRows.push({...clip,scene:s.id});}
const candidates=new Map();
for(const s of scenes.values())for(const w of words(s.text)){if(!candidates.has(w))candidates.set(w,[]);candidates.get(w).push(s);}
const dir=path.join(root,'cloudflare-deploy/public/data/scene-curriculum/v1');fs.mkdirSync(dir,{recursive:true});
const manifest={version:1,source:'Mangoi book practice sentences',books:[],wordForms:0,imageWordForms:0,sourceEntries:books.reduce((n,b)=>n+b.sentences.length,0),uniqueSourceSentences:all.size,clips:new Set(clipRows.map(c=>scenes.get(c.scene).video)).size};
const unique=new Set(),pictured=new Set(),usedImages=new Set();let maxBook=0,maxGzip=0;
for(const book of books){
 const vocab=new Map();book.sentences.forEach((text,i)=>words(text).forEach(w=>{if(!vocab.has(w))vocab.set(w,{word:w,sourceIndex:i+1,bookExample:text});}));
 const data={id:book.id,label:book.label,title:book.title,topic:book.topic,words:[],clips:[],scenes:{}};
 for(const [word,row] of vocab){
  unique.add(word);const pool=(candidates.get(word)||[]).slice();
  pool.sort((a,b)=>Number(!a.image)-Number(!b.image)||Number(!a.refs.some(r=>r[0]===book.id))-Number(!b.refs.some(r=>r[0]===book.id))||a.text.length-b.text.length);
  let chosen=pool[0];if(!chosen){const source=all.get(id(row.bookExample));chosen={id:source.id,text:source.text,source:book.label+' · #'+row.sourceIndex,refs:source.refs};}
  if(chosen.image)pictured.add(word);data.words.push({...row,scene:chosen.id});data.scenes[chosen.id]=chosen;
 }
 for(const clip of clipRows){if(clip.refs.some(r=>r[0]===book.id)){data.clips.push({scene:clip.scene,sourceIndex:clip.refs.find(r=>r[0]===book.id)[1]});data.scenes[clip.scene]=scenes.get(clip.scene);}}
 // References used to choose examples are build-time metadata, not browser payload.
 data.scenes=Object.fromEntries(Object.entries(data.scenes).map(([sid,{refs,...s}])=>[sid,s]));
 Object.values(data.scenes).forEach(s=>{if(s.image)usedImages.add(s.image);});
 const body=JSON.stringify(data);const bytes=Buffer.byteLength(body),gzip=zlib.gzipSync(body).length;maxBook=Math.max(maxBook,bytes);maxGzip=Math.max(maxGzip,gzip);
 if(bytes>350000||gzip>80000)throw Error('Book payload exceeds budget: '+book.id);
 fs.writeFileSync(path.join(dir,book.id+'.json'),body+'\n');
 manifest.books.push({id:book.id,series:book.series,number:book.number,label:book.label,title:book.title,words:data.words.length,imageWords:data.words.filter(w=>data.scenes[w.scene].image).length,clips:data.clips.length,bytes,gzip});
}
manifest.wordForms=unique.size;manifest.imageWordForms=pictured.size;manifest.maxBookBytes=maxBook;manifest.maxBookGzipBytes=maxGzip;manifest.imageAssets=usedImages.size;
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest)+'\n');
console.log(JSON.stringify({books:books.length,wordForms:unique.size,imageWordForms:pictured.size,clips:manifest.clips,maxBookBytes:maxBook,maxBookGzipBytes:maxGzip,booksWithoutClips:manifest.books.filter(b=>!b.clips).map(b=>b.id)}));
