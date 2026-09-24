#!/usr/bin/env node
/**
 * 📷 결재 자동화 7단계 (2026-09-24) — 영수증 사진 흐림·어두움 검사
 *
 * 무엇을 지키나
 *   ① photoQ(화면 순수 함수)를 실제로 돌린다 — 선명한 글자 무늬 = ok · 어두움 = dark · 흐림 = blurry.
 *      선명한 사진을 흐리게 만들면 blurry 로 바뀐다(짝).
 *   ② normPhotoQuality — 아는 값만('blurry'·'dark'), 나머지는 null.
 *   ③ runChecks — 파일이 있고 흐림/어두움이면 photo_unclear(🟡). 없거나 ok 면 없음(짝). 🔴 로는 안 올림.
 *   ④ 배선 — 올리기·점검이 photo_quality 를 넘기고 서버가 normPhotoQuality 로 받는다 · 화면 경고 · 늦은 결과 버림.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', 'cloudflare-deploy', 'src');
const PUB = join(__dir, '..', 'cloudflare-deploy', 'public');
const P = await import(pathToFileURL(process.env.POLICY_SRC || join(SRC, 'approval-policy.ts')).href);
const API = readFileSync(process.env.API_SRC || join(SRC, 'api-approval.ts'), 'utf8');
const WORK = readFileSync(process.env.WORK_SRC || join(PUB, 'work.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, why) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (why ? ' — ' + why : '')); }
}
function bodyAt(src, i) {
  const s = src.indexOf('{', i); if (s < 0 || i < 0) return '';
  let d = 0;
  for (let k = s; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(s, k + 1); }
  }
  return '';
}
function grab(src, name) { const i = src.indexOf(name); return i < 0 ? '' : src.slice(i, src.indexOf('{', i)) + bodyAt(src, i); }

console.log('\n① photoQ — 실제로 돌린다');
const W = 320, H = 240;
function receipt(bg = 235, ink = 30) {           // 흰 종이에 검은 글자 줄
  const g = new Uint8Array(W * H).fill(bg);
  for (let y = 20; y < H - 20; y++) for (let x = 20; x < W - 20; x++) if ((x >> 2) % 3 !== 0 && ((y - 20) % 12) < 5) g[y * W + x] = ink;
  return g;
}
function blur(g, r) {                             // 상자 흐림 r 번
  let a = g;
  for (let t = 0; t < r; t++) {
    const b = new Uint8Array(a.length);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx; if (yy < 0 || xx < 0 || yy >= H || xx >= W) continue; s += a[yy * W + xx]; c++;
      }
      b[y * W + x] = s / c;
    }
    a = b;
  }
  return a;
}
let photoQ = null;
try { photoQ = new Function(grab(WORK, 'function photoQ(') + '\nreturn photoQ;')(); } catch (e) { ok('photoQ 를 오려 냈다', false, e.message); }
ok('photoQ 를 찾았다(전제)', typeof photoQ === 'function');
ok('시험 영수증에 글자 픽셀이 있다(전제)', receipt().some(v => v < 100));
if (photoQ) {
  const sharp = receipt();
  ok('선명한 영수증 → ok', photoQ(sharp, W, H) === 'ok', photoQ(sharp, W, H));
  ok('(짝) 같은 영수증을 흐리게 → blurry', photoQ(blur(sharp, 4), W, H) === 'blurry', photoQ(blur(sharp, 4), W, H));
  const sparse = new Uint8Array(W * H).fill(235);
  for (let y = 100; y < 105; y++) for (let x = 40; x < 120; x++) if ((x >> 2) % 3 !== 0) sparse[y * W + x] = 30;
  ok('여백이 넓어도 선명하면 ok (글자 한 줄뿐)', photoQ(sparse, W, H) === 'ok', photoQ(sparse, W, H));
  const faint = receipt(235, 150);
  ok('연한 글씨라도 선명하면 ok', photoQ(faint, W, H) === 'ok');
  ok('어두운 사진 → dark', photoQ(receipt(30, 5), W, H) === 'dark');
  ok('아무것도 없는 흰 종이 → blurry(읽을 글자 없음)', photoQ(new Uint8Array(W * H).fill(230), W, H) === 'blurry');
  ok('너무 작으면 모름(빈 값)', photoQ(new Uint8Array(16), 4, 4) === '' && photoQ(null, 0, 0) === '');
  ok('살짝 흐린 것은 ok(과잉 경고 안 함)', photoQ(blur(sharp, 1), W, H) === 'ok', photoQ(blur(sharp, 1), W, H));
}

console.log('\n② normPhotoQuality');
ok('blurry·dark 만', P.normPhotoQuality('blurry') === 'blurry' && P.normPhotoQuality(' DARK ') === 'dark');
ok('나머지는 null', P.normPhotoQuality('ok') === null && P.normPhotoQuality('') === null && P.normPhotoQuality(null) === null && P.normPhotoQuality('<x>') === null);

console.log('\n③ runChecks · signalOf');
{
  const base = { reqType: 'purchase', amount: 1000, currency: 'PHP', hasFile: true, ocrAmount: 1000,
    body: 'Printer ink for the office printer', spentAt: '2026-09-20', now: Date.UTC(2026, 8, 24) };
  const fb = P.runChecks({ ...base, photoQuality: 'blurry' });
  const fd = P.runChecks({ ...base, photoQuality: 'dark' });
  ok('흐림 → photo_unclear', fb.some(f => f.code === 'photo_unclear' && /흐립니다/.test(f.ko)));
  ok('어두움 → photo_unclear(어둡다 문구)', fd.some(f => f.code === 'photo_unclear' && /어둡습니다/.test(f.ko)));
  ok('(짝) ok 면 표시 없음', !P.runChecks({ ...base, photoQuality: 'ok' }).some(f => f.code === 'photo_unclear'));
  ok('(짝) 값이 없으면 표시 없음', !P.runChecks({ ...base }).some(f => f.code === 'photo_unclear'));
  ok('(짝) 파일이 없으면 표시 없음', !P.runChecks({ ...base, hasFile: false, photoQuality: 'blurry' }).some(f => f.code === 'photo_unclear'));
  const sg = P.signalOf({ reqType: 'purchase', amount: 1000, ocrAmount: 1000, hasFile: true, flags: fb });
  ok('신호는 🟡(🔴 아님)', sg.signal === 'yellow', sg.signal);
}

console.log('\n④ 배선');
{
  ok('올리기: form 의 photo_quality 를 normPhotoQuality 로', /photoQuality: normPhotoQuality\(form\.get\('photo_quality'\)\)/.test(API));
  ok('점검: 본문의 photo_quality 를 normPhotoQuality 로', /photoQuality: normPhotoQuality\(b\?\.photo_quality\)/.test(API));
  ok('화면: 점검 요청에 photo_quality', /photo_quality: PHOTO_Q \|\| ''/.test(WORK));
  ok('화면: 올리기 기록에 pq, FormData 에 photo_quality', /pq: PHOTO_Q \|\| ''/.test(WORK) && /if \(rec\.pq\) fd\.append\('photo_quality', rec\.pq\)/.test(WORK));
  ok('화면: 사진을 줄인 뒤 잰다', /photoQualityOf\(FILE\)\.then\(function\(q\)\{ if \(pqSeq !== PHOTO_SEQ\) return; PHOTO_Q = q/.test(WORK));
  ok('화면: 경고 칸이 있고 [hidden] 이 먹는다', /id="photoWarn" hidden/.test(WORK) && /\.photowarn\[hidden\]\{display:none!important\}/.test(WORK));
  ok('화면: 새 결재를 고르면 초기화', (WORK.match(/PHOTO_Q = '';/g) || []).length >= 3);
  try {
    const f = new Function('T', 'document', 'PHOTO_Q', grab(WORK, 'function photoWarn(') + '\nreturn photoWarn;');
    const el = { hidden: true, textContent: '' };
    f((en, ko) => ko, { getElementById: () => el }, 'blurry')();
    ok('photoWarn: 흐림이면 보이고 다시 찍으라고 한다', el.hidden === false && /다시 찍어/.test(el.textContent));
    const el2 = { hidden: false, textContent: 'x' };
    f((en, ko) => ko, { getElementById: () => el2 }, 'ok')();
    ok('(짝) photoWarn: ok 면 숨긴다', el2.hidden === true && el2.textContent === '');
  } catch (e) { ok('photoWarn 을 돌렸다', false, e.message); }
}

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
