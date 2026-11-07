// Actual drawing callbacks with synthetic DOM/socket; no browser or transport.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts=createRequire(new URL('../cloudflare-deploy/package.json',import.meta.url))('typescript');
const source=readFileSync(process.env.KAYE_INPUT_SOURCE||new URL('../cloudflare-deploy/public/js/idx-main.js',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.js',source,ts.ScriptTarget.Latest,true);
function world(tool='pen') {
    const events={},inputs=[],sent=[],notices=[],redraw=[];
    const anno={_bound:false,isConnected:true,dataset:{page:'1'},style:{},width:100,height:100,
        addEventListener:(type,fn)=>events[type]=fn,setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})};
    const c={console,URL,Date,Math,location:{origin:'https://fixture.invalid'},vcRoomId:'A',vcUserId:'self',vcUsername:'fixture',vcConn:{send:m=>sent.push(m)},
        account:'one',vcAccountSnapshot:()=>c.account,pdfDoc:{id:'A'},_vcCurrentPdfUrl:'https://fixture.invalid/A.png',__vcPdfAnnotationSource:'/A.png',
        pdfAnnotations:{},pdfDrawTool:tool,wbAiMode:true,pdfApplyIdentity(){},pdfMyIdentity:()=>({name:'fixture',color:'red'}),pdfBindLaser(){},pdfRedrawAnno:()=>redraw.push(1),
        wbDetectShape:()=>({t:'line'}),showToast:msg=>notices.push(msg),pdfReceivePointer(){},
        document:{getElementById(id){if(id==='anno')return anno;if(id==='pdf-anno-color')return{value:'red'};if(id==='pdf-anno-size')return{value:'3'};return null},
            body:{appendChild(){}},createElement(){const handlers={};const input={style:{},value:'',focus(){},remove(){},addEventListener:(t,f)=>handlers[t]=f,handlers};inputs.push(input);return input;}}};
    c.window=c;vm.createContext(c);
    for(const name of ['pdfAnnotationScope','pdfAnnoSend','pdfNewStrokeId','pdfTryBeautify','pdfBindAnnoEvents','pdfSyncAnnoCanvas']) {
        const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
        if(fn)vm.runInContext(fn.getText(ast),c);
    }
    c.pdfBindAnnoEvents('anno');
    const event=()=>({clientX:10,clientY:20,pointerId:1,preventDefault(){}});
    return{c,anno,events,inputs,sent,notices,redraw,down(){events.pointerdown(event())},move(){events.pointermove(event())},up(){events.pointerup(event())}};
}
function change(h,boundary) {
    const c=h.c;
    if(boundary==='book'){c.pdfDoc={id:'B'};c._vcCurrentPdfUrl='https://fixture.invalid/B.png';c.__vcPdfAnnotationSource='/B.png';c.pdfAnnotations={};}
    if(boundary==='connection')c.vcConn={send:m=>h.sent.push(m)};
    if(boundary==='account')c.account='two';
    if(boundary==='room')c.vcRoomId='B';
    if(boundary==='self')c.vcUserId='other';
    if(boundary==='session')c.__vcPdfAnnotationSession=2;
    if(boundary==='stop')c.pdfDoc=null;
    if(boundary==='detached')h.anno.isConnected=false;
    if(boundary==='pending-book'){c.__vcPdfAnnoContext={pending:true,url:'https://fixture.invalid/B.png'};c.__vcPdfAnnotationSource='/B.png';}
}
let pass=0,fail=0;
async function test(name,fn){try{await fn();pass++;console.log('PASS '+name)}catch(error){fail++;console.log('FAIL '+name+' '+error.message)}}
for(const boundary of ['book','connection','account','room','self','session','stop','detached','pending-book']) {
    await test('late pen point/end rejected after '+boundary,()=>{
        const h=world();h.down();const stroke=h.c.pdfAnnotations[1][0];for(let i=0;i<4;i++)h.move();
        const count=h.sent.length,points=stroke.points.length;
        change(h,boundary);h.move();h.up();
        assert.equal(h.sent.length,count);assert.equal(stroke.points.length,points);
    });
    await test('late text commit rejected after '+boundary,()=>{
        const h=world('text');h.down();const input=h.inputs[0];input.value='old A note';change(h,boundary);
        input.handlers.blur();assert.equal(h.sent.length,0);assert.equal(h.c.pdfAnnotations[1]?.length||0,0);
    });
}
await test('normal pen and beautify retain original document proof',()=>{const h=world();h.down();for(let i=0;i<4;i++)h.move();h.up();assert.equal(h.sent.length,6);assert.ok(h.sent.every(m=>m.data.documentUrl==='/A.png'));assert.equal(h.sent.at(-1).type,'pdf-anno-shape')});
await test('normal text commits once on enter then blur',()=>{const h=world('text');h.down();const input=h.inputs[0];input.value='valid';input.handlers.keydown({key:'Enter',preventDefault(){}});input.handlers.blur();assert.equal(h.sent.length,1);assert.equal(h.c.pdfAnnotations[1][0].text,'valid')});
await test('old detached canvas cannot begin a fresh stroke in B',()=>{const h=world();change(h,'book');h.anno.isConnected=false;h.down();assert.equal(h.sent.length,0);assert.equal(Object.keys(h.c.pdfAnnotations).length,0)});
await test('manual B load uses committed B rather than stale A shared source',()=>{const h=world();h.c.pdfDoc={id:'B'};h.c._vcCurrentPdfUrl='/B.png';h.anno._bound=false;h.c.pdfBindAnnoEvents('anno');h.down();assert.equal(h.sent[0].data.documentUrl,'/B.png')});

await test('explicit old proof cannot be silently restamped by the sender',()=>{const h=world();h.c.pdfAnnoSend('pdf-anno-point',{documentUrl:'/older.png',page:1,point:[0,0]});assert.equal(h.sent.length,0)});
await test('same URL reopened document still cancels the old text callback',()=>{const h=world('text');h.down();h.inputs[0].value='old';h.c.pdfDoc={id:'new-instance-A'};h.inputs[0].handlers.blur();assert.equal(h.sent.length,0)});
await test('matching absolute shared source retains the exact server proof',()=>{const h=world();h.c.__vcPdfAnnotationSource='https://fixture.invalid/A.png';h.anno._bound=false;h.c.pdfBindAnnoEvents('anno');h.down();assert.equal(h.sent[0].data.documentUrl,'https://fixture.invalid/A.png')});

await test('reused canvas receives a new scope while its old text callback stays cancelled',()=>{
    const h=world('text');h.down();const old=h.inputs[0];old.value='old page';
    h.c.pdfSyncAnnoCanvas('anno',{width:100,height:100,style:{}},2);
    old.handlers.blur();assert.equal(h.sent.length,0);
    h.down();h.inputs[1].value='new page';h.inputs[1].handlers.blur();
    assert.equal(h.sent.length,1);assert.equal(h.sent[0].data.page,2);
});

for(const boundary of ['connection','self'])await test('fresh gesture remains usable after '+boundary,()=>{
    const h=world('text');h.down();const old=h.inputs[0];old.value='before reconnect';change(h,boundary);
    old.handlers.blur();assert.equal(h.sent.length,0);h.down();h.inputs[1].value='after reconnect';h.inputs[1].handlers.blur();
    assert.equal(h.sent.length,1);assert.equal(h.sent[0].data.stroke.text,'after reconnect');
});
console.log(`${pass} PASS / ${fail} FAIL (synthetic DOM/socket only)`);process.exitCode=fail?1:0;
