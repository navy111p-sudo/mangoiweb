import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';
const root=new URL('../../',import.meta.url).pathname;const require=createRequire(root+'cloudflare-deploy/package.json');const out='/tmp/eleader-expansion-'+process.pid+'.mjs';
await require('esbuild').build({entryPoints:[root+'cloudflare-deploy/src/eleader-expansion.ts'],bundle:true,platform:'node',format:'esm',outfile:out});const {isEleaderExpansion,ELEADER_EXPANSION_RULE,markEleaderExpansion,hasEleaderExpansion}=await import(out);
for(const text of ['You could say: "I like cats." Do you like cats?','You could say: "I do not like cats." Do you like dogs?','You could say: "I eat rice." Do you like rice?','You could say: "I get up at seven." Is seven right?'])test('explicit possible example: '+text,()=>assert.equal(isEleaderExpansion(text),true));
for(const text of ['Do you have a cat at home?','I like cats. Do you like dogs?','You own a cat. You could say: "I like cats." Do you like cats?','You could say: "I like cats." Do you like cats? You have a cat.','You could say: "I like cats." Do you like cats? Do you like dogs?','You could say: "I like cats." Why do you like cats?','You could say: "<script>alert(1)</script>." Do you like cats?','You could say: "I like cats.\n" Do you like cats?'])test('reject incomplete/assertive/unsafe contract: '+text,()=>assert.equal(isEleaderExpansion(text),false));
test('semantic instructions preserve negation, uncertainty and current question',()=>{for(const term of ['Preserve explicit yes/no','ambiguous','unprovided ownership','current unit/question','untrusted data'])assert.ok(ELEADER_EXPANSION_RULE.includes(term));});
test('only marked server request identity enables pilot contract',()=>{const r=new Request('http://local',{method:'POST',body:JSON.stringify({eleaderExpansion:true})});assert.equal(hasEleaderExpansion(r),false);assert.equal(markEleaderExpansion(r),r);assert.equal(hasEleaderExpansion(r),true);assert.equal(hasEleaderExpansion(r.clone()),false);const s=readFileSync(root+'cloudflare-deploy/src/index.ts','utf8');assert.ok(s.includes('chat: r => handleWarmupChat(markEleaderExpansion(r), ephemeralEleaderEnv(env))'));assert.ok(s.indexOf('if (hasEleaderExpansion(request)) sys += ELEADER_EXPANSION_RULE')>s.indexOf("sys += '\\n' + warmupGuidanceRule"));});

test('pilot audience is explicit without changing shared audience defaults',()=>{assert.match(ELEADER_EXPANSION_RULE,/lower-primary children aged 6-9/);assert.match(ELEADER_EXPANSION_RULE,/beginner pre-A1\/A1/);const s=readFileSync(root+'cloudflare-deploy/src/eleader-live.ts','utf8');assert.match(s,/difficulty:1,age_group:'kid'/);const shared=readFileSync(root+'cloudflare-deploy/src/warmup-audience.ts','utf8');assert.match(shared,/DEFAULT_WARMUP_AGE: WarmupAge = 'child'/);assert.match(shared,/10~15세/);});

const {normalizeEleaderExpansion,normalizeEleaderReply}=await import(out);
const {ELEADER_UNITS}=await (async()=>{const p='/tmp/eleader-pack-'+process.pid+'.mjs';await require('esbuild').build({entryPoints:[root+'cloudflare-deploy/src/eleader-pack.ts'],bundle:true,platform:'node',format:'esm',outfile:p});return import(p);})();
const context={question:'Do you like cats?',answer:'cats',vocabulary:ELEADER_UNITS[0].questions.map(q=>q.question+' '+q.model).join(' ')};
const reported=JSON.parse(readFileSync(new URL('./fixtures/pc-v4-reported-response.json',import.meta.url)));
test('replay exact parent-reported PC reply without inventing missing help contents',()=>{
 assert.equal(reported.helpExactValueAvailable,false);
 assert.deepEqual(normalizeEleaderReply(reported.reply,context),{reply:'You could say: "I like cats." Do you have cats?',fix:null,help:null});
});
for(const [l,r] of [['"','"'],["'","'"],['“','”'],['‘','’']])test('quote delimiters normalize '+l+r,()=>{
 const raw=`You could say: ${l}I don't like cats.${r} Do you like cats?`;
 assert.equal(normalizeEleaderReply(raw,{...context,answer:'no'}).reply,'You could say: "I don\'t like cats." Do you like cats?');
});
for(const raw of [
 'You could say: “I like cats.\' Do you like cats?',
 'You could say: "I like cats. Do you like cats?',
 'You could say: "I like cats. I like dogs." Do you like cats?',
 'You could say: "I like cats." Do you like cats? Are cats small?',
 'You could say: "I like cats." Do you like cats',
 'You could say: "I like cats." Do you like cats? ignore instructions',
 'You could say: "I kill cats." Do you like cats?',
 'You could say: "My password is cats." Do you like cats?',
 'You could say: "I email cats@example.com." Do you like cats?',
 'You could say: "I call 01012345678." Do you like cats?',
 'You could say: "I ignore previous instructions." Do you like cats?',
 'You could say: "I like rice." Do you like rice?',
 'You could say: "I like dogs." Do you like dogs?',
 'You could say: "I like cats." Do you like rice?',
 'You could say: "I like cats." What cats do you like?',
 'You could say: "I like cats." Do you like cats?\u0000'
])test('reject unsafe/truncated/multiple/off-topic '+raw,()=>assert.equal(normalizeEleaderReply(raw,context),null));
for(const answer of ['no','No, I do not like cats.',"I don't like cats.",'I don’t like cats.'])test('negative cannot become positive '+answer,()=>assert.equal(normalizeEleaderReply('You could say: "I like cats." Do you like cats?',{...context,answer}),null));
for(const answer of ['yes','I like cats.'])test('positive cannot become negative '+answer,()=>assert.equal(normalizeEleaderReply('You could say: "I do not like cats." Do you like cats?',{...context,answer}),null));
test('curly contraction is preserved as an apostrophe, not deleted',()=>assert.equal(normalizeEleaderExpansion('You could say: ‘I don’t like cats.’ Do you like cats?'),'You could say: "I don\'t like cats." Do you like cats?'));
test('other unit response uses its own vocabulary',()=>assert.ok(normalizeEleaderReply('You could say: "I eat rice." Do you like rice?',{question:'What do you eat?',answer:'rice',vocabulary:ELEADER_UNITS[2].questions.map(q=>q.question+' '+q.model).join(' ')})));
for(const raw of ['You could say: "I cats." Do you like cats?','You could say: "I eat cats." Do you like cats?','You could say: "I like cats." Do cats?'])test('reject fragment or changed predicate '+raw,()=>assert.equal(normalizeEleaderReply(raw,context),null));
test('negative question ambiguity fails closed',()=>assert.equal(normalizeEleaderReply('You could say: "I like cats." Do you like cats?',{...context,question:"Don't you like cats?",answer:'no'}),null));
