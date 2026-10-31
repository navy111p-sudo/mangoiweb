// 사진 찾기: node findimg.mjs <낱말...> — 저장소에 «실제로 있는» 사진 중 설명에 그 낱말이 든 것을 보여 줍니다.
// 결과 "scene-words/12001" 형식을 단원 파일의 IMG_E·IMG_H·PICS 에 그대로 씁니다.
import fs from 'fs';
const R = '/home/user/mangoiweb/';
const M = R + 'docs/scene-curriculum-media/';
const PUB = R + 'cloudflare-deploy/public/img/';
const rows = [];
for (const f of fs.readdirSync(M).filter(f => /^(word-image-plan.*|asset-plan|clip-plan)\.json$/.test(f))) {
  const dir = f === 'clip-plan.json' ? 'scene-clips' : 'scene-words';
  for (const r of JSON.parse(fs.readFileSync(M + f, 'utf8'))) {
    const id = `${dir}/${r.index}`;
    if (!fs.existsSync(PUB + id + '.webp')) continue;
    rows.push({ id, word: r.word || '', text: (r.visual || r.prompt || '').replace(/^(Natural candid|Uncaptioned) photograph\.\s*/, '').replace(/ Clear recognizable.*$| Natural light.*$/, '') });
  }
}
for (const q of process.argv.slice(2)) {
  const re = new RegExp('\\b' + q.replace(/[^a-z ]/gi, ''), 'i');
  const hit = rows.filter(r => re.test(r.word) || re.test(r.text));
  hit.sort((a, b) => (re.test(b.word) - re.test(a.word)));
  console.log(`## ${q} (${hit.length})`);
  for (const h of hit.slice(0, 8)) console.log(`${h.id}\t[${h.word}] ${h.text.slice(0, 110)}`);
}
