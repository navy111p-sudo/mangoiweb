/** XLSX public API contract: frozen reference bytes + independent ZIP/XML checks.
 * No financial queries, credentials, network, or real student data. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { buildSync } = require('../cloudflare-deploy/node_modules/esbuild');
const entry = process.env.XLSX_SRC || fileURLToPath(new URL('../cloudflare-deploy/src/xlsx.ts', import.meta.url));
const code = buildSync({ entryPoints:[entry], bundle:true, write:false, format:'cjs', platform:'neutral', logLevel:'silent' }).outputFiles[0].text;
// ZIP stores local wall-clock fields. Pin those fields without changing production Date.
class FrozenDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-11-02T12:34:56.000Z'])); }
  getHours(){return this.getUTCHours();} getMinutes(){return this.getUTCMinutes();} getSeconds(){return this.getUTCSeconds();}
  getFullYear(){return this.getUTCFullYear();} getMonth(){return this.getUTCMonth();} getDate(){return this.getUTCDate();}
}
const module={exports:{}};
vm.runInNewContext(code,{module,exports:module.exports,TextEncoder,Response,Date:FrozenDate}, {timeout:5000});
const {buildXlsx,xlsxResponse}=module.exports;
const digest = b => createHash('sha256').update(b).digest('hex');
const baseline = JSON.parse(readFileSync(new URL('./fixtures/xlsx-reference.json', import.meta.url), 'utf8'));
let pass=0,fail=0;
function check(name,fn){try{fn();pass++;}catch(e){fail++;console.error('FAIL:',name,e.message);}}
check('runtime facade exports unchanged',()=>assert.deepEqual(Object.keys(module.exports).sort(),['buildXlsx','xlsxResponse']));
// Reference inputs intentionally include existing edge behavior; this change is not a format migration.
const cases = [
  ['empty',[]],
  ['defaults',null],
  ['types',[{name:'요약',headerRows:1,rows:[['이름','금액','비율'],['가상 A',1234,-91.46],[null,undefined,''],['[구획]',0,NaN],['<>&"\'\n한글',Infinity,-Infinity]]}]],
  ['names',[{name:'중복:/?*[]\\',rows:[]},{name:'중복:/?*[]\\',rows:[[1]]},{name:'A'.repeat(40),rows:[[2]]},{name:'A'.repeat(40),rows:[[3]]},{name:'',rows:[]}]],
  ['wide',[{name:'columns',rows:[Array.from({length:28},(_,i)=>'C'+i),['한글'.repeat(80),1.25,'A\0B\tC\r\nD']],headerRows:1}]],
];
function generatedCases(){
  let seed=20261102;const next=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
  const values=[null,undefined,'','text','한글','中文','日本語','😀','<>&"\'','a\0b\t\nc',0,-1,1.25,NaN,Infinity,-Infinity];
  return Array.from({length:160},(_,i)=>({name:'generated-'+i,sheets:Array.from({length:1+Math.floor(next()*4)},(_,j)=>({name:j%2?'duplicate':'시트:/'+i,headerRows:Math.floor(next()*3),rows:Array.from({length:Math.floor(next()*12)},()=>Array.from({length:Math.floor(next()*8)},()=>values[Math.floor(next()*values.length)]))}))}));
}
const inputs=[...cases.map(([name,sheets])=>({name,sheets})),...generatedCases()];
const hashes={};
for(const {name,sheets} of inputs){
  const frozen=structuredClone(sheets);
  const bytes=buildXlsx(sheets);hashes[name]=digest(bytes);
  check(name+' matches frozen pre-refactor bytes',()=>assert.equal(hashes[name],baseline.hashes[name]));
  check(name+' leaves input unchanged',()=>assert.deepEqual(sheets,frozen));
}
// Read STORE entries ourselves using central directory offsets, rather than the writer's helpers.
function unzip(bytes){
  const b=Buffer.from(bytes),end=b.length-22;
  assert.equal(b.readUInt32LE(end),0x06054b50);
  const n=b.readUInt16LE(end+10),start=b.readUInt32LE(end+16),files=new Map();let at=start;
  for(let i=0;i<n;i++){
    assert.equal(b.readUInt32LE(at),0x02014b50);assert.equal(b.readUInt16LE(at+10),0);
    const length=b.readUInt32LE(at+24),nameLen=b.readUInt16LE(at+28),extra=b.readUInt16LE(at+30),comment=b.readUInt16LE(at+32),local=b.readUInt32LE(at+42);
    const name=b.subarray(at+46,at+46+nameLen).toString('utf8');
    assert.equal(b.readUInt32LE(local),0x04034b50);assert.equal(b.readUInt32LE(local+22),length);
    const payload=local+30+b.readUInt16LE(local+26)+b.readUInt16LE(local+28);
    files.set(name,b.subarray(payload,payload+length).toString('utf8'));
    at+=46+nameLen+extra+comment;
  }
  assert.equal(at,start+b.readUInt32LE(end+12));return files;
}
const files=unzip(buildXlsx(cases[2][1])),sheet=files.get('xl/worksheets/sheet1.xml');
check('package has 6 expected entries',()=>assert.equal(files.size,6));
check('integers remain numbers',()=>assert.match(sheet,/<c r="B2" s="2"><v>1234<\/v>/));
check('fractional values retain decimal format',()=>assert.match(sheet,/<c r="C2" s="4"><v>-91.46<\/v>/));
check('nonfinite values retain existing inline strings',()=>assert.match(sheet,/>Infinity<\/t>/));
check('XML escapes content',()=>assert.match(sheet,/&lt;&gt;&amp;&quot;&apos;/));
check('empty cells retain coordinate gap',()=>assert.match(sheet,/<row r="3"><\/row>/));
check('section headers retain emphasis',()=>assert.match(sheet,/<c r="A4" s="1"/));
check('worksheet references extend beyond Z',()=>assert.match(unzip(buildXlsx(cases[4][1])).get('xl/worksheets/sheet1.xml'),/r="AB1"/));
check('column width capped at 60',()=>assert.match(unzip(buildXlsx(cases[4][1])).get('xl/worksheets/sheet1.xml'),/width="60"/));
const response=xlsxResponse('가상_요약.xlsx',cases[2][1]),responseBytes=new Uint8Array(await response.arrayBuffer());
check('download body equals workbook bytes',()=>assert.equal(digest(responseBytes),hashes.types));
check('download status',()=>assert.equal(response.status,200));
check('download header bytes unchanged',()=>assert.deepEqual(Object.fromEntries(response.headers),baseline.responseHeaders));
check('repeated frozen-clock builds are deterministic',()=>assert.equal(digest(buildXlsx(cases[2][1])),hashes.types));
if(process.env.XLSX_CAPTURE)console.log('REFERENCE_JSON='+JSON.stringify({source:'5d842357eb865475a2e60ed58f88cb3207f2df4c:cloudflare-deploy/src/xlsx.ts',clock:'2026-11-02T12:34:56 local fields',hashes,responseHeaders:Object.fromEntries(response.headers)}));
console.log(`PASS ${pass} / FAIL ${fail}`);process.exitCode=fail?1:0;
