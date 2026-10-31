/* face_model_local_harness.mjs — 가면(얼굴 꾸미기) 파일을 «우리 서버» 에서 쓰는지 지킨다 (2026-08-25)
 *
 * 왜 필요한가
 *   얼굴 꾸미기는 실행 파일(jsdelivr)과 모델(구글 스토리지)을 «클릭한 그 순간에» 바깥에서
 *   받아 왔다. 둘 다 중국 본토에서 닿지 않아, 강선생님 화면에서는 가면을 눌러도
 *   「로딩 중…」에서 영영 멈췄다(2026-08-25 제보 问题二).
 *   그래서 그 파일들을 cloudflare-deploy/public/vendor/mediapipe-face/ 에 15MB 올렸다.
 *
 * 무엇을 지키나 — 이 셋 중 하나만 어긋나도 조용히 CDN 으로 되돌아간다(= 중국에서 다시 막힌다)
 *   ① 올린 파일이 실제로 그 자리에 그 모양으로 있는가
 *   ② idx-x6.js 가 여전히 «이미 받아 둔 것» 을 vcFx._vision · vcFx._fileset 에 담아 두는가
 *      — idx-vc-mobilefix.js 가 그 두 칸에 우리 것을 미리 넣어 CDN 호출을 건너뛴다.
 *        (idx-x6.js 는 blocking 이라 직접 못 고친다 — 첫 화면 예산 여유가 73바이트뿐)
 *   ③ 미리넣기 쪽이 그 경로·SIMD 조건을 그대로 들고 있는가
 *
 * ⚠️ «실제로 CDN 을 안 부르는가» 는 문자열로 확인할 수 없다 — 그건 브라우저 검사가 한다:
 *      node test-harness/manual/vc-textbook-mobile-browser.mjs  (⑦절)
 */
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../cloudflare-deploy/public');
let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, cond, detail = '') => {
  if (cond) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '\n       · ' + detail : '')); }
};
const read = (rel) => { try { return readFileSync(join(PUB, rel), 'utf8'); } catch { return ''; } };
const size = (rel) => { try { return statSync(join(PUB, rel)).size; } catch { return 0; } };

console.log('\n════════ 가면 얼굴인식 파일 자체 서빙 ════════\n');

/* ── ① 올린 파일이 그 자리에 그 모양으로 있는가 ───────────────── */
const V = 'vendor/mediapipe-face';
const files = [
  [`${V}/vision_bundle.mjs`, 100 * 1024],
  [`${V}/face_landmarker.task`, 3 * 1024 * 1024],
  [`${V}/wasm/vision_wasm_internal.js`, 200 * 1024],
  [`${V}/wasm/vision_wasm_internal.wasm`, 8 * 1024 * 1024],
];
for (const [f, min] of files) {
  check(`① ${f} 가 있다 (${(size(f) / 1024 / 1024).toFixed(2)}MB)`, size(f) >= min,
    size(f) === 0 ? '파일이 없다' : `너무 작다 — ${size(f)}B < ${min}B`);
}
/* 내용이 진짜인지도 본다 — 받다 만 파일이 0바이트가 아니라 «HTML 오류 페이지» 로 들어오는 사고가 흔하다 */
try {
  const wasm = readFileSync(join(PUB, `${V}/wasm/vision_wasm_internal.wasm`));
  check('① wasm 이 진짜 WebAssembly 다 (\\0asm 머리)',
    wasm[0] === 0x00 && wasm[1] === 0x61 && wasm[2] === 0x73 && wasm[3] === 0x6d);
  /* .task 는 zip 묶음인데 머리에 0바이트 두 개가 붙어 있다(구글이 배포하는 그대로다 —
     실제로 이 파일로 FaceLandmarker 가 만들어지는 것까지 브라우저로 확인했다).
     그래서 «맨 앞이 PK» 가 아니라 «앞쪽 4바이트 안에 PK» 로 본다.
     ⚠️ 이 검사의 목적은 형식 감별이 아니라, 받다 만 파일이나 오류 HTML 이
        들어온 것을 잡는 것이다(그런 사고가 흔하다). */
  const task = readFileSync(join(PUB, `${V}/face_landmarker.task`));
  check('① 모델이 진짜 .task 다 (앞쪽에 zip 머리 PK)', task.slice(0, 4).indexOf(0x50) >= 0 &&
    task.slice(0, 5).includes(Buffer.from([0x50, 0x4b])[0]) && task.indexOf(Buffer.from('PK')) < 4);
} catch (e) { check('① 올린 파일을 읽을 수 있다', false, e.message); }

/* SIMD 판만 올렸다 — nosimd 를 찾는 옛 기기에는 «미리넣기를 하지 않는» 것이 짝이다.
   여기서 nosimd 파일이 생기면 그 조건도 함께 풀어야 한다(안 그러면 15MB 를 놀린다). */
check('① nosimd 판은 올리지 않았다 (미리넣기의 SIMD 조건과 짝)',
  size(`${V}/wasm/vision_wasm_nosimd_internal.wasm`) === 0,
  'nosimd 를 올렸다면 idx-vc-mobilefix.js 의 hasSimd() 조건도 함께 풀 것');

/* ── ② idx-x6.js 의 «받아 둔 것» 칸이 그대로인가 ─────────────── */
const x6 = read('js/idx-x6.js');
check('② idx-x6.js 를 읽을 수 있다', x6.length > 0);
check('② 실행 파일을 vcFx._vision 에 담아 두고 있으면 다시 안 받는다',
  /vcFx\._vision\s*\|\|\s*\(\s*vcFx\._vision\s*=/.test(x6),
  '이 모양이 바뀌면 미리넣기가 헛돌고 CDN 으로 되돌아간다 (중국에서 다시 막힌다)');
check('② wasm fileset 을 vcFx._fileset 에 담아 두고 있으면 다시 안 받는다',
  /vcFx\._fileset\s*\|\|\s*\(\s*vcFx\._fileset\s*=/.test(x6),
  '이 모양이 바뀌면 미리넣기가 헛돈다');
check('② 얼굴인식기를 vision.FaceLandmarker.createFromOptions 로 만든다 (모델 주소를 바꿔 끼우는 자리)',
  /vision\.FaceLandmarker\.createFromOptions\s*\(/.test(x6));
/* forVisionTasks 에 두 번째 인자를 주면 wasm 파일 이름이 …_module_internal 로 바뀐다.
   그 판은 안 올렸으므로, 인자가 늘면 우리가 올린 파일을 안 쓰게 된다. */
check('② forVisionTasks 를 인자 하나로 부른다 (_module 판이 아니라 우리가 올린 판을 쓴다)',
  /forVisionTasks\(\s*[^,)]+\)/.test(x6),
  '인자가 늘면 vision_wasm_module_internal.wasm 을 찾는다 — 그건 안 올렸다');

/* ── ③ 미리넣기 쪽이 짝을 유지하는가 ─────────────────────────── */
const mf = read('js/idx-vc-mobilefix.js');
check('③ idx-vc-mobilefix.js 를 읽을 수 있다', mf.length > 0);
check('③ 미리넣기가 우리가 올린 폴더를 가리킨다',
  /FACE_LOCAL\s*=\s*'\/vendor\/mediapipe-face'/.test(mf));
check('③ 모델 주소를 우리 것으로 바꿔 끼운다',
  /modelAssetPath\s*=\s*FACE_LOCAL\s*\+\s*'\/face_landmarker\.task'/.test(mf));
check('③ SIMD 를 못 쓰는 기기에서는 미리넣기를 하지 않는다 (nosimd 판을 안 올렸으므로)',
  /if\s*\(!hasSimd\(\)\)\s*return false/.test(mf));
check('③ 실패하면 손대지 않은 상태로 되돌린다 (최악이어도 오늘과 같아야 한다)',
  /_vision\s*=\s*null;\s*window\.vcFx\._fileset\s*=\s*null/.test(mf));
check('③ 이미 받아 둔 것이 있으면 건드리지 않는다',
  /if\s*\(fx\._vision\s*\|\|\s*fx\._fileset\)\s*return false/.test(mf));

/* ── ④ 화면이 그 파일을 실제로 부르는가 ──────────────────────── */
const idx = read('index.html');
check('④ index.html 이 idx-vc-mobilefix.js 를 defer 로 부른다',
  /<script\s+defer\s+src="\/js\/idx-vc-mobilefix\.js\?v=\d+"><\/script>/.test(idx),
  'defer 가 빠지면 첫 화면 예산(여유 73바이트)을 넘겨 배포가 막힌다');
check('④ 그 파일을 blocking 으로 부르지 않는다',
  !/<script\s+src="\/js\/idx-vc-mobilefix\.js/.test(idx));

console.log('\n' + '─'.repeat(56));
console.log(`  ${PASS} PASS · ${FAIL} FAIL`);
if (FAIL) { console.log('\n  실패:'); FAILS.forEach(x => console.log('   - ' + x)); }
process.exit(FAIL ? 1 : 0);
