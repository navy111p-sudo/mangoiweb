import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildGallery } from '../scripts/ladder-storybooks/gallery.mjs';
import { loadLadder, DATA_DIR } from '../scripts/ladder-storybooks/validate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'cloudflare-deploy/public');
const data = Object.fromEntries(readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).map(f => [f.slice(0,-5), JSON.parse(readFileSync(join(DATA_DIR,f),'utf8'))]));
const passages = loadLadder().passages;
const html = readFileSync(join(pub,'story-cover-gallery.html'),'utf8').replace(/\r\n/g,'\n');
assert.equal(html, buildGallery(passages,data), 'Gallery must be regenerated when books/styles change');
const ids = [...html.matchAll(/data-book-id="([^"]+)"/g)].map(m => m[1]);
assert.deepEqual(ids.slice().sort(), passages.filter(p => p.book !== false).map(p => p.id).sort());
assert.equal(new Set(ids).size, ids.length, 'One cover per book');
for (const id of ids) {
  assert.ok(html.includes(`/img/story/${id}-cover.webp?v=${data[id].img.ver.cover}`));
  assert.ok(existsSync(join(pub,`story-${id}.html`)));
  assert.ok(existsSync(join(pub,`img/story/${id}-cover.webp`)));
}
assert.ok(readFileSync(join(pub,'stories.html'),'utf8').includes('href="/story-cover-gallery.html"'));

const source = readFileSync(join(pub,'js/story-cover-gallery.js'),'utf8');
function element(extra = {}) { return Object.assign({textContent:'', events:{}, addEventListener(name,fn){this.events[name]=fn;}},extra); }
const definitions = [...html.matchAll(/class="style-group" data-style="([^"]+)" data-count="(\d+)"/g)].map(m => ({style:m[1],count:m[2]}));
for (const blockedStorage of [false,true]) {
  const groups = definitions.map(d => ({dataset:d,hidden:false}));
  const filter=element({value:'all'}), button=element(), result=element();
  const translated=element({getAttribute:k => k==='data-ko'?'표지':'Cover'});
  const document={documentElement:{lang:'ko'},getElementById:id => ({styleFilter:filter,galleryLang:button,galleryResult:result})[id],querySelectorAll:s => s==='.style-group'?groups:[translated]};
  const localStorage={getItem(){if(blockedStorage)throw Error('blocked');return 'en';},setItem(){if(blockedStorage)throw Error('blocked');}};
  vm.runInNewContext(source,{document,localStorage});
  for (const choice of ['all',...definitions.map(d=>d.style)]) {
    filter.value=choice;filter.events.change();
    const expected=definitions.filter(d=>choice==='all'||d.style===choice);
    assert.deepEqual(groups.filter(g=>!g.hidden).map(g=>g.dataset.style),expected.map(d=>d.style));
    const count=expected.reduce((n,d)=>n+Number(d.count),0);
    assert.equal(parseInt(result.textContent),count);
    button.events.click();
    assert.equal(parseInt(result.textContent),count,'Language toggle preserves selected count');
    assert.equal(translated.textContent,document.documentElement.lang==='en'?'Cover':'표지');
  }
}
console.log(`PASS: ${ids.length} covers, ${definitions.length} style filters, links, cache versions, bilingual selection and unavailable storage`);
