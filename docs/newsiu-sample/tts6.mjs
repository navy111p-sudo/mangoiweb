// 소리 — say*.json(인자로 여러 개) 의 문장마다 mp3 한 개(미리보기 전용). 이름 = 문장 해시.
import fs from 'fs'; import crypto from 'crypto';
const lines = new Set();
const FILES = process.argv.slice(2).length ? process.argv.slice(2) : ['say-easy.json','say-hard.json'];
for (const f of FILES) for (const v of Object.values(JSON.parse(fs.readFileSync(f,'utf8')))) v.forEach(x=>lines.add(x[0]));
const map = fs.existsSync('audio-map.json') ? JSON.parse(fs.readFileSync('audio-map.json','utf8')) : {}; let got = 0, fail = [];
for (const t of lines) {
  const h = crypto.createHash('sha1').update(t).digest('hex').slice(0,10); map[t] = `audio/${h}.mp3`;
  if (fs.existsSync(map[t])) continue;
  const q = t.replace(/[“”]/g,'"').slice(0,199);
  const r = await fetch('https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=en&ttsspeed=0.9&q='+encodeURIComponent(q));
  const b = Buffer.from(await r.arrayBuffer());
  if (!r.ok || b.length < 500) { fail.push(t); delete map[t]; continue; }
  fs.writeFileSync(map[t], b); got++;
}
fs.writeFileSync('audio-map.json', JSON.stringify(map));
console.log('lines', lines.size, 'new', got, 'fail', fail.length, fail.slice(0,3));
