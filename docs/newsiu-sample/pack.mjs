// 사이트 교재 업로더에 그대로 끌어다 놓을 폴더 만들기.
// pack/NewSIU교재/<D1 교재 이름>/New Easy|New Hard/SlideN.JPG → 업로더가 「[교재 이름] New Easy / SlideN.JPG」 로 올린다
// (새 BTS 「[BTS 1 001 (…)] New / Slide4.JPG」 와 같은 모양 · 수업 화면 🔊 문장 파일의 키와 같다).
import fs from 'fs';
const OUT = 'pack/NewSIU교재'; fs.rmSync('pack', {recursive:true, force:true});
let n = 0;
for (const no of fs.readdirSync('u').filter(d=>/^a?\d{3}$/.test(d)).sort()) {
  const U = (await import(`./units/${no}.mjs`)).default;
  for (const [m, folder] of [['easy','New Easy'],['hard','New Hard']]) {
    const src = `u/${no}/jpg-${m}`, dst = `${OUT}/${U.book}/${folder}`;
    if (!fs.existsSync(src)) throw new Error('missing '+src);
    fs.mkdirSync(dst, {recursive:true});
    for (const f of fs.readdirSync(src).filter(f=>/^Slide\d+\.JPG$/.test(f))) { fs.copyFileSync(`${src}/${f}`, `${dst}/${f}`); n++; }
  }
}
console.log('pack files', n);
