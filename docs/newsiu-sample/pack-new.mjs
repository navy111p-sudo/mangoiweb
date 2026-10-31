// 새 이름으로 올릴 폴더 만들기 (2026-09-29 사장님 결정: 「새 이름으로 따로, 옛것 숨김」).
// 옛 SIU 와 묶음 이름이 같으면 숨김(textbook_hidden_books, 이름 단위)이 새것까지 숨기므로 앞에 «NEW » 를 붙인다.
//   pack/<NEW SIU … 이름>/<Easy|Hard>/SlideN.JPG → 파일 이름 「[NEW SIU BASIC 001 - …] Easy / SlideN.JPG」
// manifest.json 에 {name, file} 목록을 남긴다(올리기 단계가 그것을 읽는다).
import fs from 'fs';
const OUT = 'pack'; fs.rmSync(OUT, {recursive:true, force:true});
const list = []; const books = [];
for (const no of fs.readdirSync('u').filter(d=>/^a?\d{3}$/.test(d)).sort()) {
  const U = (await import(`./units/${no}.mjs`)).default;
  const book = 'NEW ' + U.book; books.push({no, old: U.book, book});
  for (const [m, lesson] of [['easy','Easy'],['hard','Hard']]) {
    const src = `u/${no}/jpg-${m}`, dst = `${OUT}/${book}/${lesson}`;
    const fl = fs.readdirSync(src).filter(f=>/^Slide\d+\.JPG$/.test(f));
    if (fl.length !== 20) throw new Error(`${src}: ${fl.length}쪽 (20쪽이어야 함)`);
    fs.mkdirSync(dst, {recursive:true});
    for (const f of fl) { fs.copyFileSync(`${src}/${f}`, `${dst}/${f}`); list.push({name:`[${book}] ${lesson} / ${f}`, file:`${dst}/${f}`}); }
  }
}
if (list.length !== 2000) throw new Error('pack files '+list.length+' (2000 이어야 함)');
fs.writeFileSync(`${OUT}/manifest.json`, JSON.stringify({books, files:list}, null, 1));
console.log('pack files', list.length, 'books', books.length);
