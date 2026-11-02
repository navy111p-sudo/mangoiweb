/** Browser dependency syntax detection; all fixtures are text, no browser/network starts. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { usesPuppeteer } from './runner-source.mjs';
let pass=0,fail=0;
function check(name,text,wanted){try{assert.equal(usesPuppeteer(text),wanted);pass++;}catch(e){fail++;console.error('FAIL:',name,e.message);}}
for(const [name,text] of [
 ['default import',`import p from 'puppeteer';`],
 ['side effect import',`import 'puppeteer';`],
 ['named import multiline',`import { launch }\nfrom\n'puppeteer-core';`],
 ['require',`const p = require('puppeteer');`],
 ['require whitespace',`const p = require ( 'puppeteer-core' );`],
 ['dynamic import',`const p = await import('puppeteer');`],
 ['dynamic no substitution template','const p = await import(`puppeteer-core`);'],
 ['reexport',`export {launch} from 'puppeteer';`],
 ['subpath',`import p from 'puppeteer/lib/cjs/puppeteer.js';`],
 ['extra',`const p = require('puppeteer-extra');`],
 ['embedded runtime expression','const s = `${require("puppeteer")}`;'],
])check(name,text,true);
for(const [name,text] of [
 ['line comment',`// import p from 'puppeteer'`],
 ['block comment',`/* const p = require('puppeteer'); */`],
 ['quoted import',`const example = "import p from 'puppeteer'";`],
 ['quoted require',`console.log("require('puppeteer')");`],
 ['template prose',"const example = `import p from 'puppeteer'`;"],
 ['regex literal',`const re = /require\\('puppeteer'\\)/;`],
 ['different package',`import p from 'puppeteerish';`],
 ['prose only',`// puppeteer is unavailable`],
 ['member method',`object.require('puppeteer');`],
 ['nonliteral dependency',`require(packageName);`],
 ['ordinary imports',`import fs from 'node:fs'; const p = require('typescript');`],
])check(name,text,false);
check('this fixture itself remains in fast gate',readFileSync(new URL(import.meta.url),'utf8'),false);
console.log(`PASS ${pass} / FAIL ${fail}`);process.exitCode=fail?1:0;
