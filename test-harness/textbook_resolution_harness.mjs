/**
 * 📐 교재 원본 해상도 점검 하니스 (2026-10-02, 파일럿 후속 P6)
 *
 * 정본 src/textbook-resolution.ts 를 타입만 벗겨(node:module stripTypeScriptTypes) **실제로 돌린다**.
 *   ① 머리 바이트 파서 — JPEG(SOF0·SOF2·EXIF 앞에 있는 경우)·PNG·WebP(VP8·VP8L·VP8X) 를 합성해 크기를 맞히는가
 *      짝: 모르는 형식·잘린 머리·SOF 가 범위 밖이면 null («지어내지 않는다»)
 *   ② 리포트 — 가짜 D1·R2 로 돌려 «구본·숨김 제외», «낮음/괜찮음/모름» 판정, 페이지 넘김(next_offset)
 *   ③ 배선 — 라우터가 본사만 통과시키는가(강사·조직계정 403 이 리포트 호출보다 앞인가)
 *
 * 변이시험 (전부 실제 FAIL 확인 — 2026-10-02):
 *   Ⓐ SOF 판정에서 C2(progressive) 제외          → ①-2 FAIL
 *   Ⓑ 판정 조건 뒤집기 (minW < minWidth → >=)     → ②-3·②-4 FAIL
 *   Ⓒ 구본 필터 제거                               → ②-1 FAIL
 *   Ⓓ «모름» 을 ok 로 떨어뜨리기                    → ②-5 FAIL
 *   Ⓔ 라우터의 isOrgScopedRole 403 제거            → ③-2 FAIL
 *   Ⓕ clampInt 의 «값 없음» 가드 제거(Number(null)=0) → ②-3·②-6 FAIL — 처음 판이 실제로 이 결함이었다
 */
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_PATH = process.env.TBRES_SRC || join(ROOT, 'cloudflare-deploy/src/textbook-resolution.ts');
const ROUTER = readFileSync(join(ROOT, 'cloudflare-deploy/src/accounting-reports.ts'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name); } };

let mod = null;
try {
  const js = stripTypeScriptTypes(readFileSync(SRC_PATH, 'utf8'), { mode: 'strip' });
  mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
} catch (e) { console.log('  (모듈 로드 실패: ' + e.message + ')'); }
ok('전제: 정본 모듈을 실제로 불러왔다', !!mod && typeof mod.imageSizeFromHeader === 'function');
if (!mod) { console.log(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }
const { imageSizeFromHeader, textbookResolutionReport } = mod;

/* ── 합성 이미지 머리 ── */
const u8 = (...a) => new Uint8Array(a.flat());
const be16 = n => [(n >> 8) & 255, n & 255];
const be32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = n => [n & 255, (n >> 8) & 255];
const le24 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
const pad = n => new Array(n).fill(0);
function jpeg(w, h, sof = 0xc0, app1Len = 0) {
  const app0 = [0xff, 0xe0, ...be16(16), ...pad(14)];
  const app1 = app1Len ? [0xff, 0xe1, ...be16(app1Len), ...pad(app1Len - 2)] : [];
  const dqt = [0xff, 0xdb, ...be16(67), ...pad(65)];
  const sofSeg = [0xff, sof, ...be16(17), 8, ...be16(h), ...be16(w), 3, ...pad(9)];
  return u8([0xff, 0xd8], app0, app1, dqt, sofSeg, pad(10));
}
const png = (w, h) => u8([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], be32(13), [0x49, 0x48, 0x44, 0x52], be32(w), be32(h), pad(8));
const riff = (chunk, body) => u8([0x52, 0x49, 0x46, 0x46], pad(4), [0x57, 0x45, 0x42, 0x50], [...chunk].map(c => c.charCodeAt(0)), pad(4), body, pad(8));
const webpVP8 = (w, h) => riff('VP8 ', [...pad(3), 0x9d, 0x01, 0x2a, ...le16(w), ...le16(h)]);
const webpVP8X = (w, h) => riff('VP8X', [...pad(4), ...le24(w - 1), ...le24(h - 1)]);
function webpVP8L(w, h) {
  const v = (w - 1) | ((h - 1) << 14);
  return riff('VP8L', [0x2f, v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]);
}

console.log('\n── ① 머리 바이트 파서 ──');
const eq = (r, w, h, f) => !!r && r.width === w && r.height === h && r.format === f;
ok('①-1 JPEG baseline(SOF0) 1920×1080', eq(imageSizeFromHeader(jpeg(1920, 1080)), 1920, 1080, 'jpeg'));
ok('①-2 JPEG progressive(SOF2) 1280×720', eq(imageSizeFromHeader(jpeg(1280, 720, 0xc2)), 1280, 720, 'jpeg'));
ok('①-3 JPEG — 큰 EXIF(APP1 20KB) 뒤의 SOF 도 찾는다', eq(imageSizeFromHeader(jpeg(1024, 768, 0xc0, 20000)), 1024, 768, 'jpeg'));
ok('①-4 PNG 2480×3508', eq(imageSizeFromHeader(png(2480, 3508)), 2480, 3508, 'png'));
ok('①-5 WebP VP8 960×540', eq(imageSizeFromHeader(webpVP8(960, 540)), 960, 540, 'webp'));
ok('①-6 WebP VP8L 800×600', eq(imageSizeFromHeader(webpVP8L(800, 600)), 800, 600, 'webp'));
ok('①-7 WebP VP8X 4000×3000', eq(imageSizeFromHeader(webpVP8X(4000, 3000)), 4000, 3000, 'webp'));
ok('①-8 짝: 모르는 형식(PDF) → null', imageSizeFromHeader(u8([0x25, 0x50, 0x44, 0x46], pad(40))) === null);
ok('①-9 짝: 너무 짧은 머리 → null', imageSizeFromHeader(u8([0xff, 0xd8, 0xff])) === null);
const cut = jpeg(1920, 1080, 0xc0, 20000).slice(0, 4000);
ok('①-10 짝: SOF 가 읽은 범위 밖 → null (지어내지 않는다)', imageSizeFromHeader(cut) === null);
ok('①-11 짝: DHT(C4) 를 SOF 로 오인하지 않는다', (() => {
  const dht = [0xff, 0xc4, ...be16(20), ...pad(18)];
  const b = u8([0xff, 0xd8], dht, [0xff, 0xc0, ...be16(17), 8, ...be16(300), ...be16(400), 3, ...pad(9)], pad(10));
  return eq(imageSizeFromHeader(b), 400, 300, 'jpeg');
})());

console.log('\n── ② 리포트 (가짜 D1·R2 로 실제 실행) ──');
const FILES = [
  { id: 1, name: '[BTS 1 001 (Hello)] Slide1.JPG', ext: 'JPG', size_bytes: 90000, r2_key: 'k1', bytes: jpeg(960, 540) },
  { id: 2, name: '[BTS 1 001 (Hello)] Slide2.JPG', ext: 'JPG', size_bytes: 90000, r2_key: 'k2', bytes: jpeg(1920, 1080) },
  { id: 3, name: '[BTS 2 Korea] Slide1.png', ext: 'png', size_bytes: 400000, r2_key: 'k3', bytes: png(2480, 3508) },
  { id: 4, name: '[BTS 3 001 (구본)] Slide1.JPG', ext: 'JPG', size_bytes: 50000, r2_key: 'k4', bytes: jpeg(640, 360) },
  { id: 5, name: '[숨긴책] a.jpg', ext: 'jpg', size_bytes: 50000, r2_key: 'k5', bytes: jpeg(640, 360) },
  { id: 6, name: '[모르는책] a.jpg', ext: 'jpg', size_bytes: 50000, r2_key: 'k6', bytes: u8(pad(64)) },
];
const bookOf = n => n.slice(1, n.indexOf(']'));
const env = {
  DB: {
    prepare(sql) {
      const run = (args) => ({
        async all() {
          if (/FROM textbook_hidden_books/.test(sql)) return { results: [{ book: '숨긴책' }] };
          if (/GROUP BY book/.test(sql)) {
            const m = new Map();
            for (const f of FILES) m.set(bookOf(f.name), (m.get(bookOf(f.name)) || 0) + 1);
            return { results: [...m].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([book, pages]) => ({ book, pages })) };
          }
          if (/ORDER BY id LIMIT \?/.test(sql)) return { results: FILES.filter(f => bookOf(f.name) === args[0]).slice(0, args[1]) };
          return { results: [] };
        },
      });
      return { bind: (...a) => run(a), ...run([]) };
    },
  },
  RECORDINGS: {
    async get(key, opt) {
      const f = FILES.find(x => x.r2_key === key);
      if (!f) return null;
      const n = opt?.range?.length ?? f.bytes.length;
      const b = f.bytes.slice(0, n);
      return { async arrayBuffer() { return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } };
    },
  },
};
const call = async (q) => (await textbookResolutionReport(env, new URL('https://x/api/admin/reports/textbook-resolution' + q))).json();
let r = null;
try { r = await call('?limit=10&per_book=2'); } catch (e) { console.log('  (실행 실패: ' + e.message + ')'); }
const byBook = b => (r?.books || []).find(x => x.book === b);
ok('②-0 전제: 리포트가 실제로 돌았다', !!r && r.ok === true);
ok('②-1 구본·숨긴 묶음은 기본으로 뺀다', !!r && !byBook('BTS 3 001 (구본)') && !byBook('숨긴책'));
ok('②-2 include_old=1 이면 구본도 본다', (await call('?include_old=1')).books.some(x => /구본/.test(x.book)));
ok('②-3 가장 작은 장이 1600 미만이면 low (960)', byBook('BTS 1 001 (Hello)')?.verdict === 'low' && byBook('BTS 1 001 (Hello)')?.min_width === 960);
ok('②-4 짝: 충분히 크면 ok (2480)', byBook('BTS 2 Korea')?.verdict === 'ok');
ok('②-5 머리를 못 읽으면 unknown (ok 로 떨어뜨리지 않는다)', byBook('모르는책')?.verdict === 'unknown');
ok('②-6 요약 숫자가 묶음 판정과 같다', !!r && r.summary.low === 1 && r.summary.ok === 1 && r.summary.unknown === 1);
const p1 = await call('?limit=1');
ok('②-7 페이지 넘김: limit=1 이면 next_offset=1', p1.books.length === 1 && p1.next_offset === 1);
ok('②-8 min_width 로 기준을 바꿀 수 있다 (900 이면 960 은 ok)', (await call('?min_width=900')).books.find(x => x.book === 'BTS 1 001 (Hello)')?.verdict === 'ok');

console.log('\n── ③ 배선 (라우터) ──');
const at = ROUTER.indexOf("if (p === 'textbook-resolution')");
const blk = at >= 0 ? ROUTER.slice(at, ROUTER.indexOf('\n    }', at)) : '';
ok('③-0 전제: 라우터 갈래를 찾았다', blk.length > 0);
const iT = blk.indexOf('isTeacher'), iO = blk.indexOf('isOrgScopedRole'), iR = blk.indexOf('textbookResolutionReport(');
ok('③-1 강사 403 이 리포트 호출보다 앞', iT > 0 && iR > iT);
ok('③-2 조직계정 403 이 리포트 호출보다 앞', iO > 0 && iR > iO);

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
