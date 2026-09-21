/* ⚠️ 임시 — 러너에서 영상을 받아 640 폭으로 다시 압축하고 첫 프레임을 포스터로 뽑습니다.
   작업 컨테이너의 프록시가 그 CDN 을 403 으로 막아 여기서만 받을 수 있습니다.
   ⛔ 받은 주소를 코드에 쓰지 않습니다 — 결과는 우리 경로로만 커밋합니다. */
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
const [,,listPath,vidDir,imgDir,outPath]=process.argv;
const plan=JSON.parse(fs.readFileSync(listPath,'utf8'));
fs.mkdirSync(vidDir,{recursive:true});fs.mkdirSync(imgDir,{recursive:true});
const run=(c,a)=>execFileSync(c,a,{stdio:['ignore','pipe','pipe']});
const out=[];
async function one(it){
 const raw='/tmp/'+it.index+'.src.mp4',mp4=path.join(vidDir,it.index+'.mp4'),png='/tmp/'+it.index+'.png',webp=path.join(imgDir,it.index+'.webp');
 try{
  run('curl',['-sSL','--retry','3','--max-time','180','-o',raw,it.url]);
  run('ffmpeg',['-v','error','-y','-i',raw,'-vf','scale=640:-2','-c:v','libx264','-crf','30','-preset','slow','-an','-movflags','+faststart',mp4]);
  run('ffmpeg',['-v','error','-y','-i',raw,'-vf','scale=640:480:force_original_aspect_ratio=increase,crop=640:480','-frames:v','1',png]);
  run('cwebp',['-quiet','-q','80',png,'-o',webp]);
  const info=run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-show_entries','format=duration','-of','csv=p=0',mp4]).toString().trim().split(/[\n,]/);
  out.push({index:it.index,videoBytes:fs.statSync(mp4).size,imageBytes:fs.statSync(webp).size,width:+info[0],height:+info[1],duration:+info[2]});
 }catch(e){out.push({index:it.index,error:String(e.message||e).slice(0,160)});}
 finally{for(const f of [raw,png])try{fs.unlinkSync(f);}catch{}}
}
const q=plan.slice();
await Promise.all(Array.from({length:6},async()=>{while(q.length)await one(q.shift());}));
out.sort((a,b)=>a.index-b.index);
fs.writeFileSync(outPath,JSON.stringify(out,null,1));
const bad=out.filter(o=>o.error);
console.log('done',out.length,'errors',bad.length,bad.slice(0,5).map(b=>b.index+':'+b.error).join(' | '));
