import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';
const ts=createRequire(new URL('../cloudflare-deploy/package.json',import.meta.url))('typescript');
const source=readFileSync(new URL('../cloudflare-deploy/src/index.ts',import.meta.url),'utf8');const ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='handleRoomMedia');assert.ok(fn);
const c={Response,URL};vm.createContext(c);vm.runInContext(ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,c);
let pass=0,fail=0;async function test(n,f){try{await f();pass++;console.log('PASS '+n)}catch(e){fail++;console.log('FAIL '+n+' '+e.message)}}
function env(full,status=200){return{VIDEO_CALL_ROOM:{idFromName:id=>id,get:()=>({fetch:async()=>Response.json(full,{status})})}}}
await test('legacy DTO remains exactly room/media fields',async()=>{const dto=await(await c.handleRoomMedia('fixture',env({pdfState:null,videoState:null,users:[{private:'fixture'}]}))).json();assert.deepEqual(dto,{roomId:'fixture',pdfState:null,videoState:null})});
await test('ready epoch DTO contains only public media identity metadata',async()=>{const dto=await(await c.handleRoomMedia('fixture',env({epochReady:true,shareEpoch:'e1',shareRevision:4,pdfState:{url:'/same.pdf'},videoState:null,users:['private'],role:'admin'}))).json();assert.equal(dto.epochReady,true);assert.equal(dto.shareEpoch,'e1');assert.equal(dto.shareRevision,4);assert.equal(dto.users,undefined);assert.equal(dto.role,undefined)});
for(const full of [{epochReady:false},{epochReady:true,shareEpoch:'',shareRevision:1},{epochReady:true,shareEpoch:'e1',shareRevision:'bad'}])await test('unavailable/malformed epoch DTO fails closed '+JSON.stringify(full),async()=>{const dto=await(await c.handleRoomMedia('fixture',env(full))).json();assert.equal(dto.epochReady,false)});
await test('non-success DO response cannot claim a ready epoch',async()=>{const dto=await(await c.handleRoomMedia('fixture',env({epochReady:true,shareEpoch:'e1',shareRevision:1},503))).json();assert.equal(dto.epochReady,false)});
await test('bad room ID is rejected before consulting the DO',async()=>{const r=await c.handleRoomMedia('',{VIDEO_CALL_ROOM:{idFromName(){throw Error('should not execute')}}});assert.equal(r.status,400)});
console.log(`${pass} PASS / ${fail} FAIL (actual media DTO; synthetic DO binding)`);process.exitCode=fail?1:0;
