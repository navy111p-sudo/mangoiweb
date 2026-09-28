// Insert new unit songs into course files, right after the Hello Song (…open(…)) of every lesson in the unit.
// 단원 노래를 그 단원 모든 과의 Hello Song 바로 뒤에 넣습니다. 다시 돌려도 안전합니다(이미 있으면 건너뜀).
//   node songs/insert.mjs            → 실제로 고침
//   node songs/insert.mjs --dry      → 무엇을 넣을지만 출력
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const COURSES = path.join(ROOT, 'src/courses');
const LYRICS = path.join(ROOT, 'songs/lyrics');
const DRY = process.argv.includes('--dry');

const js = v => JSON.stringify(v);

// 곡조 이름을 짧게 — 제목 줄(small)에 들어가므로
const shortTune = t => t.replace(/\s*\(.*?\)\s*/g, ' ').replace(/^The /, '').replace(/ Is Falling Down$/, '').trim();

function songConst(name, s) {
  return `const ${name} = { t: 'song', k: 'new', small: ${js("Let's sing! ♪ " + shortTune(s.tune))}, title: ${js(s.title)}, img: ${js('gen:' + s.key)}, ` +
    `nt: ${js(s.nt)}, n: ${js(s.n)}, src: '새로 지음', lines: ${js(s.lines)} };`;
}

// 괄호 짝으로 …open( … ) 의 끝을 찾습니다(문자열 안의 괄호는 건너뜀)
function endOfCall(src, start) {
  let depth = 0, q = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i + 1; }
  }
  throw new Error('open( 짝을 못 찾음');
}

let total = 0;
for (const f of fs.readdirSync(LYRICS).filter(x => x.endsWith('.json')).sort()) {
  const { book, songs } = JSON.parse(fs.readFileSync(path.join(LYRICS, f), 'utf8'));
  const nn = String(book).padStart(2, '0');
  const file = path.join(COURSES, `bts-${nn}.mjs`);
  let src = fs.readFileSync(file, 'utf8');
  const { COURSE } = await import(pathToFileURL(file).href + '?t=' + Date.now());

  const todo = songs.filter(s => !src.includes(`gen:${s.key}'`) && !src.includes(`"gen:${s.key}"`));
  if (!todo.length) { console.log(`bts-${nn}: 이미 들어 있음`); continue; }

  // 1) 상수 정의 — import 줄 바로 아래
  const names = todo.map((s, i) => `USONG_${String(s.unit).match(/\d+/)[0]}`);
  const consts = todo.map((s, i) => songConst(names[i], s)).join('\n');
  const imp = src.indexOf('\n', src.indexOf("from '../common.mjs'")) + 1;
  src = src.slice(0, imp) + consts + '\n' + src.slice(imp);

  // 2) 각 과 — lessons 순서대로 code 위치를 찾고 그 과 안의 …open( 뒤에 끼움
  const lessons = COURSE.lessons;
  const pos = []; let from = 0;
  for (const l of lessons) {
    const p = src.indexOf(`code: '${l.code}'`, from);
    if (p < 0) throw new Error(`bts-${nn}: code ${l.code} 못 찾음`);
    pos.push(p); from = p + 1;
  }
  // 뒤에서부터 고쳐야 앞의 위치가 안 밀립니다
  const edits = [];
  lessons.forEach((l, i) => {
    const k = todo.findIndex(s => s.unit === l.unit);
    if (k < 0) return;
    const end = i + 1 < pos.length ? pos[i + 1] : src.length;
    const o = src.indexOf('...open(', pos[i]);
    if (o < 0 || o > end) throw new Error(`bts-${nn} ${l.code}: …open( 없음`);
    let e = endOfCall(src, o + 7);
    if (src[e] === ',') e++;
    edits.push([e, `\n      ${names[k]},`, l.code, todo[k].title]);
  });
  for (const s of todo) if (!edits.some(x => x[3] === s.title)) throw new Error(`bts-${nn}: ${s.unit} 과를 못 찾음`);
  for (const [e, ins] of edits.sort((a, b) => b[0] - a[0])) src = src.slice(0, e) + ins + src.slice(e);

  total += edits.length;
  console.log(`bts-${nn}: 노래 ${todo.length}곡 · 과 ${edits.length}곳 (${edits.map(x => x[2]).reverse().join(',')})`);
  if (!DRY) fs.writeFileSync(file, src);
}
console.log(`합계 슬라이드 ${total}장${DRY ? ' (dry)' : ''}`);
