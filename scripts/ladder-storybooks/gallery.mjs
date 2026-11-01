import { STYLES } from './styles.mjs';

const ORDER = ['cg3d','fairytale','anime','brick','clay','felt','crayon','papercut','comic','webtoon','pixel','minhwa','editorial','vintage','flat','photo'];
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bilingual = (ko,en) => `data-ko="${esc(ko)}" data-en="${esc(en)}"`;

export function buildGallery(passages, data) {
  const books = passages.filter(p => p.book !== false && data[p.id]).sort((a,b) => a.id.localeCompare(b.id));
  const groups = ORDER.map(key => ({key, style:STYLES[key], books:books.filter(p => data[p.id].img.style === key)})).filter(g => g.books.length);
  if (groups.reduce((n,g) => n + g.books.length,0) !== books.length) throw new Error('Unknown gallery style');
  const options = groups.map(g => `<option value="${g.key}" ${bilingual(g.style.ko + ' · ' + g.books.length + '권',g.style.en + ' · ' + g.books.length + ' books')}>${esc(g.style.ko)} · ${g.books.length}권</option>`).join('\n');
  const sections = groups.map(g => `<section class="style-group" data-style="${g.key}" data-count="${g.books.length}" aria-labelledby="heading-${g.key}">
    <h2 id="heading-${g.key}" ${bilingual(g.style.emoji+' '+g.style.ko,g.style.emoji+' '+g.style.en)}>${esc(g.style.emoji+' '+g.style.ko)}</h2>
    <p class="group-count" ${bilingual(g.books.length+'권',g.books.length+' books')}>${g.books.length}권</p>
    <div class="cover-grid">${g.books.map(p => `<a class="book" href="/story-${p.id}.html" data-book-id="${p.id}">
      <img src="/img/story/${p.id}-cover.webp?v=${data[p.id].img.ver.cover}" width="1024" height="688" alt="${esc(p.title.en)}" loading="lazy" decoding="async">
      <div class="book-caption"><span class="book-id">${p.id} · <span ${bilingual(p.stage+'단계','Step '+p.stage)}>${p.stage}단계</span></span>
      <h3 ${bilingual(p.title.ko,p.title.en)}>${esc(p.title.ko)}</h3><p class="english-title" lang="en">${esc(p.title.en)}</p></div>
    </a>`).join('\n')}</div>
  </section>`).join('\n');
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>그림책 표지 갤러리 · 망고아이</title>
<meta name="description" content="${books.length}권의 영어 그림책 표지를 ${groups.length}가지 화풍별로 둘러보세요. 3D 애니메이션, 클레이, 브릭 블록, 고전 동화 애니메이션 등.">
<link rel="stylesheet" href="/css/mangoi-han.css">
<style>
:root{color-scheme:light;--paper:#fbf8f2;--page:#fff;--ink:#23262f;--soft:#5b6170;--line:#e4dccd;--accent:#26733d}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,'Noto Sans KR',sans-serif}
.wrap{max-width:1440px;margin:auto;padding:24px clamp(16px,3vw,40px) 64px}.top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.brand{display:flex;align-items:center;gap:12px;margin-right:auto}.brand img{width:48px;height:48px;object-fit:contain}h1{font-size:clamp(24px,3vw,36px);line-height:1.25;margin:0}.subtitle{margin:7px 0 0;color:var(--soft)}
.nav,.lang{display:inline-flex;align-items:center;min-height:44px;padding:8px 16px;border:1px solid var(--line);border-radius:99px;background:var(--page);color:var(--ink);font:inherit;text-decoration:none;cursor:pointer}.nav:hover,.lang:hover{border-color:var(--accent)}a:focus-visible,button:focus-visible,select:focus-visible{outline:3px solid var(--accent);outline-offset:4px}
.controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:28px 0 8px;padding:16px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.controls label{font-weight:600}.controls select{max-width:100%;min-height:44px;padding:8px 36px 8px 12px;border:1px solid var(--line);border-radius:10px;background:var(--page);color:var(--ink);font:inherit}.result{margin-left:auto;color:var(--soft)}
.style-group{margin-top:36px}.style-group h2{display:inline;margin:0;font-size:23px}.group-count{display:inline;margin-left:10px;color:var(--soft)}.cover-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:22px 18px;margin-top:16px}.book{display:block;min-width:0;color:inherit;text-decoration:none}.book img{display:block;width:100%;height:auto;aspect-ratio:1024/688;object-fit:cover;border-radius:12px;background:#eee8df;box-shadow:0 4px 12px #23262f0d}.book:hover h3{color:var(--accent);text-decoration:underline}.book-caption{padding:10px 2px}.book-id{font-size:12px;color:var(--soft)}.book h3{font-size:16px;margin:3px 0;overflow-wrap:anywhere}.english-title{font-size:13px;margin:0;color:var(--soft);overflow-wrap:anywhere}html[lang=en] .english-title{display:none}[hidden]{display:none!important}.foot{margin-top:48px;color:var(--soft);font-size:13px}
@media(max-width:480px){.cover-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 12px}.brand{width:100%}.result{width:100%;margin-left:0}.controls select{flex:1;min-width:0}.style-group h2{font-size:20px}}
</style><script defer src="/js/story-cover-gallery.js?v=1"></script>
</head><body><main class="wrap">
<header class="top"><div class="brand"><img src="/img/mango-char.png" width="48" height="48" alt="Mr. mango"><div><h1 ${bilingual('그림책 표지 갤러리','Picture-book cover gallery')}>그림책 표지 갤러리</h1><p class="subtitle" ${bilingual(books.length+'권 · '+groups.length+'가지 화풍',books.length+' books · '+groups.length+' art styles')}>${books.length}권 · ${groups.length}가지 화풍</p></div></div>
<a class="nav" href="/stories.html" ${bilingual('영어 독서','English Reading')}>영어 독서</a><a class="nav" href="/" ${bilingual('홈','Home')}>홈</a><button class="lang" id="galleryLang" type="button" aria-label="언어 전환 / Switch language">EN</button></header>
<div class="controls"><label for="styleFilter" ${bilingual('화풍','Art style')}>화풍</label><select id="styleFilter"><option value="all" ${bilingual('모든 화풍','All art styles')}>모든 화풍</option>${options}</select><span class="result" id="galleryResult" role="status" aria-live="polite">${books.length}권</span></div>
<div id="coverGroups">${sections}</div>
<p class="foot" ${bilingual('표지를 누르면 그림책을 읽을 수 있어요.','Select a cover to read the picture book.')}>표지를 누르면 그림책을 읽을 수 있어요.</p>
</main></body></html>\n`;
}
