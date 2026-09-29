// NewSIU 전체 미리보기(BASIC 30권 + ADVANCE 20권) — 단원 고르기 · 판 자동 선택 · 쪽 넘기기 · 문장 듣기.
// 쪽 그림은 sp/NNN-easy.jpg 띠(sprite.mjs). 소리: mp3 가 있으면 mp3(001), 없으면 브라우저 목소리.
import fs from 'fs';
const map = JSON.parse(fs.readFileSync('audio-map.json','utf8'));
const D = [];
const order = d => (d[0]==='a' ? '1' : '0') + d.replace(/\D/g,'');   // BASIC 먼저, 그다음 ADVANCE
for (const no of fs.readdirSync('u').filter(d=>/^a?\d{3}$/.test(d)).sort((x,y)=>order(x)<order(y)?-1:1)) {
  if (!['easy','hard'].every(m=>fs.existsSync(`sp/${no}-${m}.jpg`)&&fs.existsSync(`u/${no}/say-${m}.json`))) { console.log('skip', no); continue; }
  const U = (await import(`./units/${no}.mjs`)).default, o = { no: no.replace(/^a/,''), series: no[0]==='a' ? 'ADVANCE' : 'BASIC', title: U.title };
  for (const m of ['easy','hard']) {
    const say = JSON.parse(fs.readFileSync(`u/${no}/say-${m}.json`,'utf8'));
    o[m] = { sp:`sp/${no}-${m}.jpg`, turns: JSON.parse(fs.readFileSync(`u/${no}/turns-${m}.json`,'utf8')).total,
      pages: Object.values(say).map(v=>({lines:v.map(x=>[x[0], map[x[0]]||''])})) };
  }
  D.push(o);
}
const nB = D.filter(u=>u.series==='BASIC').length, nA = D.length - nB;
const H1 = `NewSIU · <span>BASIC ${nB} + ADVANCE ${nA}</span>`;
const META = `SIU BASIC 30권·ADVANCE 20권을 출판사 교재 구조(I can 목표 · 모범 대화 → 바꿔 말하기 · 설문 · 정보차 · Time to speak · 발표 · 발음)로 다시 만들었습니다. 원본 질문 10개·낱말 10개·문법이 뼈대이고, 권마다 <b>쉬운 판·어려운 판</b> 20쪽씩입니다. ADVANCE 는 쉬운 판=중고등, 어려운 판=성인입니다. 단원 목록 괄호 안 숫자는 학생이 말하는 횟수(쉬운/어려운)입니다. 🔊 는 미리보기용 목소리입니다(001 은 녹음 파일, 나머지는 브라우저 목소리).`;
const html = fs.readFileSync('hub.tpl.html','utf8').replace('/*DATA*/','var D='+JSON.stringify(D)+';').replace('%%H1%%',H1).replace('%%META%%',META);
fs.writeFileSync('hub.html', html); console.log('hub.html units', D.length, 'bytes', html.length);
