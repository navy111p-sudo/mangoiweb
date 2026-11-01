import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../cloudflare-deploy/public/js/mango-avatar.js',import.meta.url),'utf8');
const begin=source.indexOf('function mountImages(name, c)');
const end=source.indexOf('// ── 음량 분석',begin);
assert.ok(begin>=0&&end>begin);
const body=source.slice(begin,end);
function sandbox(code=body){
  return new Function(`
    var images=[],imgFrames=null,imgCur=null,imgAspectDone=false,curChar='emma',drawing=true,curTier='',IDLE=null;
    var CHARACTERS={adult:{}},cropRect={l:0,r:1,t:0,b:1};
    var video={pause(){},load(){},removeAttribute(){}};
    function Image(){images.push(this);this.naturalWidth=320;this.naturalHeight=400;}
    function setAspect(){} function drawStill(){} function applyFrame(){}
    function mountCharacter(){imgFrames=null;imgCur=null;}
    ${code}
    return {mount(){mountImages('emma',{frames:{closed:'a',medium:'b',wide:'c'},fallback:'adult'});return images.slice(-3);},
      reset(){curChar='emma';},state(){return {frames:imgFrames,current:imgCur,char:curChar};}};
  `)();
}
const orders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
let cases=0;
for(const order of orders)for(const event of ['onload','onerror']){
  const s=sandbox(),old=s.mount(); old[0].onerror();
  for(const index of order) old[index][event]();
  assert.equal(s.state().frames,null,'late callbacks preserve fallback');cases++;
  s.reset();const newer=s.mount();
  for(const index of order) old[index][event]();
  assert.equal(s.state().char,'emma','same-name remount survives old callbacks');
  assert.equal(s.state().frames.closed,newer[0]);
  assert.equal(s.state().frames.medium,newer[1]);
  assert.equal(s.state().current,null);cases++;
}
// Current callbacks still work; rejecting every image would hide the bug, not repair it.
const current=sandbox(),frames=current.mount();frames[0].onload();frames[1].onerror();
assert.equal(current.state().current,frames[0]);assert.equal(current.state().frames.medium,null);cases++;
// The old defect must be caught by this test setup.
const broken=sandbox(body.replace(/if\(name !== curChar \|\| imgFrames !== mountedFrames\) return;/g,''));
const stale=broken.mount();stale[0].onerror();assert.throws(()=>stale[1].onerror(),TypeError);cases++;
console.log(`PASS ${cases} / FAIL 0 — image callback ordering, fallback, remount, mutation`);
