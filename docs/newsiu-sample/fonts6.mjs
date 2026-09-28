// 6판 글꼴 — 구글 폰트를 base64 로 심은 fonts6.css (깃에 안 올림: .gitignore)
import fs from 'fs';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const fams = ['Fraunces:ital,opsz,wght@0,9..144,700;1,9..144,800','Caveat:wght@700','Bungee','Bricolage Grotesque:wght@800','Lexend:wght@400;600;700'];
// 한글: build6 이 남긴 ko-chars-*.txt 의 글자만 받습니다(text= 부분집합).
const ko = [...new Set(['easy','hard'].map(m=>{try{return fs.readFileSync(new URL(`./ko-chars-${m}.txt`, import.meta.url),'utf8')}catch(e){return ''}}).join('')+'💡뜻확인정답')].join('');
let out = '';
for (const w of [400,700]) {
  const css = await (await fetch('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@'+w+'&text='+encodeURIComponent(ko),{headers:{'User-Agent':UA}})).text();
  const url = css.match(/url\((https:[^)]+)\)/)[1];
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  out += css.replace(url, 'data:font/woff2;base64,'+buf.toString('base64'));
}
for (const f of fams) {
  const css = await (await fetch('https://fonts.googleapis.com/css2?family='+encodeURIComponent(f).replace(/%20/g,'+')+'&display=swap',{headers:{'User-Agent':UA}})).text();
  const blocks = css.split('/* ').filter(b=>b.startsWith('latin */'));
  for (const b of blocks) {
    const url = b.match(/url\((https:[^)]+)\)/)[1];
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    out += b.replace('latin */','').replace(url, 'data:font/woff2;base64,'+buf.toString('base64'));
  }
  console.log(f, blocks.length);
}
fs.writeFileSync(new URL('./fonts6.css', import.meta.url), out);
console.log('bytes', out.length);
