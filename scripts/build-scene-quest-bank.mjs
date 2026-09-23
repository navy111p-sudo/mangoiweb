// 🖼 Scene Quest 사진 문제 은행 빌드 — docs/scene-curriculum-media/scene-quest-bank.json → public/js/scene-quest-bank.js
// 정답은 사람이(에이전트가) 사진을 직접 보고 쓴 것이다. 여기서는 모양만 검사하고, 틀리면 빌드를 멈춘다.
import fs from 'node:fs';
const ROOT = new URL('../', import.meta.url);
const src = JSON.parse(fs.readFileSync(new URL('docs/scene-curriculum-media/scene-quest-bank.json', ROOT), 'utf8'));
const BANDS = ['bts', 'siu-basic', 'siu-advance'];
const errs = [];
const clean = s => typeof s === 'string' && s.trim() === s && s.length > 0 && !/[<>"`\\]/.test(s);
const out = [];
for (const b of src) {
  if (b.skip) continue;
  const where = 'item ' + b.i;
  const img = new URL('cloudflare-deploy/public/img/scene-clips/' + b.i + '.webp', ROOT);
  if (!fs.existsSync(img)) errs.push(where + ': 사진 파일 없음');
  if (!BANDS.includes(b.band)) errs.push(where + ': band');
  for (const k of ['ko', 'en', 'clueKo', 'clueEn', 'actionKo', 'actionEn']) if (!clean(b[k])) errs.push(where + ': ' + k);
  if (!['is', 'are'].includes(b.aux)) errs.push(where + ': aux');
  for (const k of ['word', 'subj', 'phrase']) {
    if (!Array.isArray(b[k]) || !b[k].length) { errs.push(where + ': ' + k + ' 비어 있음'); continue; }
    for (const v of b[k]) if (!clean(v) || /[.,!?;:]/.test(v) || /\b(not|never|no)\b/i.test(v)) errs.push(where + ': ' + k + ' «' + v + '»');
  }
  for (const v of b.simple || []) if (!clean(v) || /[.,!?;:]/.test(v)) errs.push(where + ': simple «' + v + '»');
  // 단서가 정답을 흘리지 않는가 (첫 정답 낱말의 머리 4글자)
  const head = String(b.word?.[0] || '').replace(/^(a|an|the) /, '').slice(0, 4).toLowerCase();
  if (head.length >= 4 && String(b.clueEn).toLowerCase().includes(head)) errs.push(where + ': clueEn 이 정답을 흘림');
  out.push({ i: b.i, band: b.band, ko: b.ko, en: b.en, clueKo: b.clueKo, clueEn: b.clueEn, actionKo: b.actionKo, actionEn: b.actionEn,
    word: b.word, aux: b.aux, subj: b.subj, phrase: b.phrase, simple: b.simple || [] });
}
if (errs.length) { console.error(errs.slice(0, 80).join('\n')); console.error('❌ ' + errs.length + '건'); process.exit(1); }
const js = '/* 자동 생성 — scripts/build-scene-quest-bank.mjs 로 만듭니다. 손으로 고치지 마세요. */\n(function(root){var B=' +
  JSON.stringify(out) + ';if(typeof module!==\'undefined\'&&module.exports)module.exports=B;else root.MangoiSceneQuestBank=B;})(typeof window!==\'undefined\'?window:this);\n';
fs.writeFileSync(new URL('cloudflare-deploy/public/js/scene-quest-bank.js', ROOT), js);
const by = {}; for (const b of out) by[b.band] = (by[b.band] || 0) + 1;
console.log('✅ ' + out.length + '문제 (건너뜀 ' + (src.length - out.length) + ')', by, (js.length / 1024).toFixed(0) + 'KB');
