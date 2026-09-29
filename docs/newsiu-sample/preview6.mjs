// 6판 미리보기 — 쉬운/어려운 판 · 나이·수준으로 자동 선택(시연) · 문장마다 mp3.
import fs from 'fs';
const VER = process.argv[2] === '7' ? '7' : '6', P = VER === '7' ? '7' : '';
const TXT = {
 '6':['New SIU 001 · <span>TALK!</span> 6판','6판 · 잡지 «TALK!» 형식. 원본 교재 질문 10개·낱말·문법이 뼈대이고, 인터뷰 쪽마다 «모범 대답 → 내 차례(빈칸 틀) → 이어 말하기 질문» 이 있습니다. 🔊 는 미리보기용 목소리입니다.'],
 '7':['New SIU 001 · A Talk with You <span>7판</span>','7판 · 국내외 출판사 교재(Cambridge Evolve·Interchange·Four Corners, Oxford Smart Choice·Speak Now, Compass Speaking Time, National Geographic Learning)의 말하기 장치를 1:1 화상수업에 맞춰 넣었습니다. 쪽마다 <b>I can 목표</b>와 <b>내가 말하는 횟수</b>(🗣 My turns)가 있고, 단원 합계는 쉬운 판 <b>168번</b> · 어려운 판 <b>211번</b>입니다. 🔊 는 미리보기용 목소리입니다.'] };
const map = JSON.parse(fs.readFileSync('audio-map.json','utf8'));
const D = {};
for (const m of ['easy','hard']) {
  const say = JSON.parse(fs.readFileSync(`say${P}-${m}.json`,'utf8'));
  D[m] = Object.values(say).map((v,i)=>({img:`jpg${P}-${m}/Slide${i+1}.JPG`, lines:v.map(x=>[x[0], map[x[0]]||''])}));
}
const html = fs.readFileSync('preview6.tpl.html','utf8').replace('/*DATA*/', 'var D='+JSON.stringify(D)+';').replace('%%H1%%',TXT[VER][0]).replace('%%META%%',TXT[VER][1]);
fs.writeFileSync(VER==='7'?'preview.html':'preview6.html', html);
console.log('preview.html', html.length);
