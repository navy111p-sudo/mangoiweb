// 가사 파일 검사 / Validate lyric files against BRIEF rules
import fs from 'node:fs';
const TUNES = ['Twinkle Twinkle Little Star','Row, Row, Row Your Boat','London Bridge Is Falling Down','Mary Had a Little Lamb','The Farmer in the Dell','Here We Go Round the Mulberry Bush','Frère Jacques (Are You Sleeping?)','Old MacDonald Had a Farm','This Old Man','Skip to My Lou','Oh My Darling, Clementine','Yankee Doodle','Pop Goes the Weasel','The Muffin Man','Baa, Baa, Black Sheep','Oh! Susanna','Bingo','Clap chant (4 beats)','Rap chant (4 beats)'];
let total = 0, errs = []; const keys = new Set();
for (const f of fs.readdirSync('scope')) {
  const scope = JSON.parse(fs.readFileSync('scope/' + f));
  const want = scope.units.filter(u => !u.songs.length).map(u => u.unit);
  if (!want.length) continue;
  if (!fs.existsSync('lyrics/' + f)) { errs.push(`${f}: missing`); continue; }
  const { songs } = JSON.parse(fs.readFileSync('lyrics/' + f));
  const got = songs.map(s => s.unit);
  for (const u of want) if (!got.includes(u)) errs.push(`${f}: no song for ${u}`);
  for (const s of songs) {
    total++;
    const id = `${f} ${s.unit}`;
    if (!want.includes(s.unit)) errs.push(`${id}: unit not needed`);
    if (!TUNES.includes(s.tune)) errs.push(`${id}: tune "${s.tune}"`);
    if (!/^bts-\d\d-song-[a-z0-9-]+$/.test(s.key) || keys.has(s.key)) errs.push(`${id}: key ${s.key}`); keys.add(s.key);
    if (s.lines.length < 6 || s.lines.length > 8) errs.push(`${id}: ${s.lines.length} lines`);
    s.lines.forEach(l => { if (l.length > 48) errs.push(`${id}: long "${l}"`); if (l.includes('___')) errs.push(`${id}: blank`); });
    if (!s.nt || s.n?.length !== 2 || !s.imgPrompt || !s.title) errs.push(`${id}: fields`);
  }
}
console.log('songs:', total); console.log(errs.length ? errs.join('\n') : 'ALL OK');
