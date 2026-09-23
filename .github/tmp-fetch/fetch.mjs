// 임시(러너 전용) — 힉스필드 CDN 사진을 저장소로 받아 sha256 대조. main 에 올리지 않습니다.
import fs from 'node:fs'; import crypto from 'node:crypto';
const list = JSON.parse(fs.readFileSync('.github/tmp-fetch/list.json','utf8'));
let ok=0, bad=[];
for (const it of list) {
  try {
    const r = await fetch(it.url); if (!r.ok) throw new Error('http '+r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (sha !== it.sha256 || buf.length !== it.bytes) throw new Error('mismatch '+buf.length+' '+sha.slice(0,8));
    fs.writeFileSync(it.dest, buf); ok++;
  } catch (e) { bad.push(it.kind+':'+it.index+' '+e.message); }
}
console.log('ok', ok, '/', list.length); if (bad.length) { console.log(bad.join('\n')); }
fs.writeFileSync('.github/tmp-fetch/result.txt', 'ok '+ok+'/'+list.length+'\n'+bad.join('\n')+'\n');
