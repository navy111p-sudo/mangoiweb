const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../public/js/speaking-growth-view.js'),'utf8');
function el(){return{children:[],style:{},appendChild(n){this.children.push(n);},replaceChildren(){this.children=[];}};}
function view(){const w={};vm.runInNewContext(src,{window:w,document:{createElement:el}});return w.SpeakingGrowthView;}
test('missing report stays hidden instead of showing zero activity',()=>{const c=el();view().render(c,null,false);assert.equal(c.hidden,true);assert.equal(c.children.length,0);});
test('actual zero remains measured while missing scores do not become zero',()=>{const c=el();view().render(c,{sessions:1,turns:1,grades:{},reading:{samples:1,pronunciation:0,fluency:null},corrections:[]},false);const s=JSON.stringify(c);assert.match(s,/0\/100/);assert.match(s,/미측정/);assert.doesNotMatch(s,/null\/100/);});
test('corrections render as literal text and no conversation score is inferred',()=>{const c=el();view().render(c,{sessions:1,turns:1,grades:{},reading:{samples:0},skills:{grammar:100},corrections:[{was:'<img onerror=alert(1)>',now:'safe'}]},true);const s=JSON.stringify(c);assert.match(s,/<img onerror/);assert.doesNotMatch(s,/100\/100/);assert.match(s,/not measured/);});

test('period vocabulary reports measured zero, unknown and partial capture separately',()=>{
 const c=el();view().render(c,{sessions:0,turns:0,vocabulary:{sessions:2,uniqueWords:0,limited:true}},true);
 assert.match(JSON.stringify(c),/words used in this period: 0/);assert.match(JSON.stringify(c),/partial text/);
 view().render(c,{sessions:0,turns:0,vocabulary:null},false);
 assert.match(JSON.stringify(c),/확인할 수 없습니다/);assert.doesNotMatch(JSON.stringify(c),/고유 단어: 0/);
});
