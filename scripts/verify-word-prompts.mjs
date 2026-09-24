/* 🖼 낱말 사진 — «만들기 전에» 프롬프트가 근거 게이트를 통과하는지 봅니다.
   크레딧을 쓰기 전에 돌리세요. 탈락한 프롬프트로 사진을 만들면 그 사진은
   표에만 남고 화면에는 한 번도 안 붙습니다(2026-09-22 에 한 장을 그렇게 버렸습니다).

   ⛔ 판정을 여기에 다시 적지 마세요 — 정본은 scripts/scene-picture-evidence.mjs 한 곳이고
      빌드·회귀 검사·이 스크립트가 «같은 모듈» 을 돌립니다.
   ⚠️ 후보를 기존 표에 «이어 붙여» 판정합니다 — 껍데기(80% 규칙)는 전체 설명을 모아
      한 번 세므로 후보만 따로 재면 답이 달라집니다.

   쓰기: node scripts/verify-word-prompts.mjs <후보.json>
        후보 = [{word, index, prompt}, ...]
*/
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pictureEvidence,wordPlanFiles} from './scene-picture-evidence.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const inputs=path.join(root,'docs/scene-curriculum-media');
const read=n=>JSON.parse(fs.readFileSync(path.join(inputs,n),'utf8'));
const assets=read('asset-plan.json'),clips=read('clip-plan.json'),selected=read('scene-plan.json');
const stop=new Set(read('stopwords.json').concat(['ken','karen','tom','nelly','poko','leon',"leon's"]));
const sceneText=new Map(selected.map(r=>[r.id,r.text]));

const cand=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const planned=wordPlanFiles(fs.readdirSync(inputs)).flatMap(read);
const asWordAsset=it=>({id:'word-image:'+it.index,index:it.index,word:it.word,prompt:it.prompt,scenes:[]});

/* 지금 껍데기(후보 없이) — 뒤에서 «줄어들지 않았나» 를 대조합니다. */
const before=pictureEvidence({assets:assets.concat(planned.map(asWordAsset)),clips,sceneText,stopWords:stop});
const after=pictureEvidence({assets:assets.concat(planned.concat(cand).map(asWordAsset)),clips,sceneText,stopWords:stop});

const lost=[...before.shell].filter(w=>!after.shell.has(w));
const gained=[...after.shell].filter(w=>!before.shell.has(w));

let ok=0;const bad=[];
for(const it of cand){
  if(after.depicts(it.word,'word-image:'+it.index)) ok++;
  else bad.push(it);
}
console.log('후보',cand.length,'· 통과',ok,'· 탈락',bad.length);
for(const b of bad) console.log('  ❌',b.index,b.word,'—',b.prompt.replace(/^Natural candid photograph\. /,'').slice(0,90));
console.log('껍데기: 전',before.shell.size,'→ 후',after.shell.size, gained.length?('늘어남 '+gained.join(',')):'', lost.length?('🔴 줄어듦 '+lost.join(',')):'');
if(lost.length) console.log('🔴 껍데기가 줄면 그 낱말이 «이미 만든 사진 전부» 의 근거로 되살아납니다 — 프롬프트 틀을 다시 보세요.');
process.exit(bad.length||lost.length?1:0);
