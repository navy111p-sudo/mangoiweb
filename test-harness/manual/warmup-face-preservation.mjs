// Explicit audit against the task baseline; not a permanent ban on approved future body layers.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const base=process.env.BASE_REF||'f393fc90a62af0c4a428a79344673fa6c814445a';
const prefix='cloudflare-deploy/public/',hash=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:20*1024*1024});
const paths=git('ls-tree','-r','--name-only',base,prefix+'img/visemes').toString().trim().split('\n').filter(p=>/\.(webp|png)$/.test(p));
for(const n of ['mango-avatar.js','avatar-visemes.js','avatar-viseme-worker.js'])paths.push(prefix+'js/'+n);
for(const actor of ['lily','noah','jake','mei','long'])for(const pose of ['closed','mid','wide'])paths.push(prefix+'img/'+actor+'-'+pose+'.webp');
const files=paths.map(path=>{const baseline_sha256=hash(git('show',base+':'+path)),candidate_sha256=hash(readFileSync(resolve(root,path)));if(baseline_sha256!==candidate_sha256)throw Error('Original face/atlas/engine changed: '+path);return{path,baseline_sha256,candidate_sha256,identical:true};});
const require=createRequire(import.meta.url),ts=require(resolve(root,'cloudflare-deploy/node_modules/typescript'));
function functions(html){const map={};for(const tag of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){const source=ts.createSourceFile('inline.js',tag[1],ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);function visit(n){if(ts.isFunctionDeclaration(n)&&n.name)map[n.name.text]=hash(n.getText(source));ts.forEachChild(n,visit);}visit(source);}return map;}
const before=functions(git('show',base+':'+prefix+'warmup.html').toString()),after=functions(readFileSync(resolve(root,prefix+'warmup.html'),'utf8'));
const names=['speak','_stopSpeak','_synthSpeak','_ttsSpeak','_stmSentence','_stmRead','_stmTurn','toggleMic','setMicState','_micAbortQuiet','_micHeard','_finishMic','micViaWhisper','withCtx'];
const events=names.map(name=>{if(!before[name]||before[name]!==after[name])throw Error('Existing speech/stream/mic/context function changed: '+name);return{function:name,sha256:before[name],identical:true};});
if(process.env.WARMUP_FACE_AUDIT_DIR){const out=resolve(process.env.WARMUP_FACE_AUDIT_DIR);mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'face-sha-manifest.json'),JSON.stringify({base,files},null,2)+'\n');writeFileSync(resolve(out,'voice-event-manifest.json'),JSON.stringify({base,functions:events},null,2)+'\n');}
console.log('PASS '+files.length+' original face/base/eye/mouth/viseme source files byte-identical');
console.log('PASS '+events.length+' existing speech/streaming/mic/context functions byte-identical');
