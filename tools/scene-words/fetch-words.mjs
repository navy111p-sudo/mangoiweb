/* 임시 — CI 러너에서만 돕니다. 낱말 그림을 받아 640x480 webp 로 줄여 저장소에 담습니다.
   ⚠️ 이 컨테이너의 프록시가 그 CDN 을 403 으로 막아(정책 거부) 여기서는 받을 수 없습니다.
   ⚠️ 1,400장이라 8개씩 나눠 받습니다 — 순서대로 받으면 40분 넘게 걸립니다. */
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const plan=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const outDir=process.argv[3];
fs.mkdirSync(outDir,{recursive:true});
const tmp='/tmp/wfetch';fs.mkdirSync(tmp,{recursive:true});
const done=[],failed=[];
async function one(it){
 const dest=path.join(outDir,it.index+'.webp');
 if(fs.existsSync(dest)){done.push({index:it.index,bytes:fs.statSync(dest).size,skipped:true});return;}
 const raw=path.join(tmp,it.index+'.src');
 let ok=false;
 for(let t=0;t<3&&!ok;t++){
  try{await run('curl',['-sSfL','--max-time','90','-o',raw,it.url]);ok=fs.statSync(raw).size>1000;}catch{ok=false;}
 }
 if(!ok){failed.push({index:it.index,url:it.url});return;}
 try{
  await run('convert',[raw,'-resize','640x480^','-gravity','center','-extent','640x480','-quality','82','-strip',dest]);
  done.push({index:it.index,bytes:fs.statSync(dest).size});
 }catch(e){failed.push({index:it.index,url:it.url,convert:String(e.message).slice(0,120)});}
 fs.rmSync(raw,{force:true});
}
const queue=plan.slice();
await Promise.all(Array.from({length:8},async()=>{while(queue.length)await one(queue.shift());}));
done.sort((a,b)=>a.index-b.index);failed.sort((a,b)=>a.index-b.index);
fs.writeFileSync(process.argv[4],JSON.stringify({done,failed},null,0)+'\n');
console.log('받음',done.length,'· 실패',failed.length,'· 합계바이트',done.reduce((n,d)=>n+d.bytes,0));
if(failed.length)console.log(JSON.stringify(failed.slice(0,20)));
