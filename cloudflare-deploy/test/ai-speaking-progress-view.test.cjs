const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../public/js/ai-speaking-progress-view.js'),'utf8');
function element(tag){return {tagName:tag,children:[],textContent:'',className:'',appendChild(x){this.children.push(x)},replaceChildren(){this.children=[]}}}
function view(){const root={};vm.runInNewContext(src,{window:root,document:{createElement:element}});return root.AiSpeakingProgressView}
test('does not display fabricated scores for missing result',()=>{const c=element('section');view().render(c,null,'ko');assert.match(c.children[0].textContent,/정상 종료/);});
test('shows unmeasured fields explicitly',()=>{const c=element('section');view().render(c,{finishedNormally:true,skills:{grammar:90},uniqueWords:[],reviewWords:[]},'ko');assert.match(JSON.stringify(c),/미측정/);});
test('ignores reward estimates',()=>{const c=element('section');view().render(c,{finishedNormally:true,stars:15,gems:10},'en');assert.doesNotMatch(JSON.stringify(c),/reward/i);});
test('renders untrusted word as text, never HTML',()=>{const c=element('section');view().render(c,{finishedNormally:true,skills:{},reviewWords:['<script>alert(1)</script>']},'en');assert.match(JSON.stringify(c),/<script>/);});
