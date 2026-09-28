// 6판 미리보기 — 쉬운/어려운 판 · 나이·수준으로 자동 선택(시연) · 문장마다 mp3.
import fs from 'fs';
const map = JSON.parse(fs.readFileSync('audio-map.json','utf8'));
const D = {};
for (const m of ['easy','hard']) {
  const say = JSON.parse(fs.readFileSync(`say-${m}.json`,'utf8'));
  D[m] = Object.values(say).map((v,i)=>({img:`jpg-${m}/Slide${i+1}.JPG`, lines:v.map(x=>[x[0], map[x[0]]||''])}));
}
const html = fs.readFileSync('preview6.tpl.html','utf8').replace('/*DATA*/', 'var D='+JSON.stringify(D)+';');
fs.writeFileSync('preview.html', html);
console.log('preview.html', html.length);
