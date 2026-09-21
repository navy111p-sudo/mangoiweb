/* 임시 — CI 러너에서만 돕니다. 낱말 그림을 받아 640x480 webp 로 줄여 저장소에 담습니다.
   ⚠️ 이 컨테이너의 프록시가 그 CDN 을 403 으로 막아(정책 거부) 여기서는 받을 수 없습니다. */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const plan=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const outDir=process.argv[3];
fs.mkdirSync(outDir,{recursive:true});
const tmp='/tmp/wfetch';fs.mkdirSync(tmp,{recursive:true});
const done=[],failed=[];
for(const it of plan){
 const dest=path.join(outDir,it.index+'.webp');
 if(fs.existsSync(dest)){done.push({index:it.index,bytes:fs.statSync(dest).size,skipped:true});continue;}
 const raw=path.join(tmp,it.index+'.src');
 let ok=false;
 for(let try_=0;try_<3&&!ok;try_++){
  try{execFileSync('curl',['-sSfL','--max-time','90','-o',raw,it.url],{stdio:'pipe'});ok=fs.statSync(raw).size>1000;}catch(e){ok=false;}
 }
 if(!ok){failed.push({index:it.index,url:it.url});continue;}
 try{
  execFileSync('convert',[raw,'-resize','640x480^','-gravity','center','-extent','640x480','-quality','82','-strip',dest],{stdio:'pipe'});
  done.push({index:it.index,bytes:fs.statSync(dest).size});
 }catch(e){failed.push({index:it.index,url:it.url,convert:String(e.message).slice(0,120)});}
 fs.rmSync(raw,{force:true});
}
fs.writeFileSync(process.argv[4],JSON.stringify({done,failed},null,0)+'\n');
console.log('받음',done.length,'· 실패',failed.length,'· 합계바이트',done.reduce((n,d)=>n+d.bytes,0));
if(failed.length)console.log(JSON.stringify(failed.slice(0,20)));
