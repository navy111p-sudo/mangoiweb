/** Synthetic headers only: no real books, storage or external requests. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const js = stripTypeScriptTypes(readFileSync(process.env.IMAGE_HEADER_SRC || new URL('../cloudflare-deploy/src/textbook-resolution.ts', import.meta.url), 'utf8'));
const { imageSizeFromHeader: size, textbookResolutionReport } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const bytes = (...a) => new Uint8Array(a.flatMap(v => typeof v === 'number' ? [v] : Array.from(v)));
const be16 = n => [n >> 8 & 255, n & 255];
const be32 = n => [n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255];
const png = () => bytes([137,80,78,71,13,10,26,10], be32(13), [73,72,68,82], be32(1600), be32(900));
const jpeg = () => bytes([255,216,255,192], be16(17), [8], be16(900), be16(1600), [3], Array(9).fill(0));
function webp(kind, body) {
  return bytes([82,73,70,70], [4 + 8 + body.length,0,0,0], [87,69,66,80], [...kind].map(x => x.charCodeAt(0)), [body.length,0,0,0], body);
}
const vp8 = () => webp('VP8 ', [0,0,0,157,1,42,64,6,132,3]);
const vp8l = () => webp('VP8L', [47,63,2,149,0]);
let pass = 0, fail = 0;
function check(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL:', name, e.message); } }
check('PNG dimensions at range boundary', () => assert.deepEqual(size(png()), { width:1600,height:900,format:'png' }));
check('wrong PNG signature', () => { const b = png(); b[7] = 0; assert.equal(size(b), null); });
check('PNG must begin with IHDR', () => { const b = png(); b[12] = 0; assert.equal(size(b), null); });
check('PNG IHDR length', () => { const b = png(); b[11] = 1; assert.equal(size(b), null); });
check('JPEG minimal full SOF', () => assert.deepEqual(size(jpeg()), { width:1600,height:900,format:'jpeg' }));
check('JPEG dimensions at exact range boundary', () => assert.deepEqual(size(jpeg().slice(0,12)), { width:1600,height:900,format:'jpeg' }));
check('JPEG declared segment too short', () => { const b = bytes(jpeg(), Array(10).fill(0)); b[5] = 2; assert.equal(size(b), null); });
check('JPEG SOF component count matches segment length', () => { const b = jpeg(); b[11] = 1; assert.equal(size(b), null); });
check('JPEG stops at end of image', () => assert.equal(size(bytes([255,216,255,217], jpeg().slice(2), Array(10).fill(0))), null));
check('JPEG does not scan compressed data after SOS', () => assert.equal(size(bytes([255,216,255,218,0,2], jpeg().slice(2), Array(10).fill(0))), null));
check('VP8 dimensions', () => assert.deepEqual(size(vp8()), { width:1600,height:900,format:'webp' }));
check('VP8 keyframe signature', () => { const b = vp8(); b[23] = 0; assert.equal(size(b), null); });
check('VP8 interframe has no dimensions', () => { const b = vp8(); b[20] = 1; assert.equal(size(b), null); });
check('VP8L dimensions without unrelated trailing padding', () => assert.deepEqual(size(vp8l()), { width:576,height:597,format:'webp' }));
check('VP8L signature', () => { const b = bytes(vp8l(), Array(8).fill(0)); b[20] = 0; assert.equal(size(b), null); });
check('VP8L version must be zero', () => { const b = bytes(vp8l(), Array(8).fill(0)); b[24] |= 224; assert.equal(size(b), null); });
check('truncated dimensions never fabricated', () => { for (const [make, minimum] of [[png,24], [jpeg,12], [vp8,30], [vp8l,25]]) { const b=make(); for(let n=0;n<minimum;n++) assert.equal(size(b.slice(0,n)), null, `${make.name}:${n}`); } });
const broken = png(); broken[12] = 0;
try {
  const env = { DB: { prepare(sql) { return { bind() { return this; }, async all() {
    if (sql.includes('textbook_hidden_books')) return { results: [] };
    if (sql.includes('GROUP BY book')) return { results: [{ book:'fixture', pages:1 }] };
    return { results: [{ id:1, name:'[fixture] page.png', r2_key:'fixture', size_bytes:24 }] };
  } }; } }, RECORDINGS: { async get() { return { async arrayBuffer() { return broken.buffer; } }; } } };
  const report = await (await textbookResolutionReport(env, new URL('https://example.invalid/'))).json();
  assert.equal(report.books[0].verdict, 'unknown');
  assert.equal(report.books[0].samples[0].error, 'unreadable_header');
  pass++;
} catch (e) { fail++; console.error('FAIL: malformed source report', e.message); }
console.log(`PASS ${pass} / FAIL ${fail}`);
process.exitCode = fail ? 1 : 0;
