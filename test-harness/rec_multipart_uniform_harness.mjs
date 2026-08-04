// 녹화 R2 멀티파트 — «비마지막 파트 크기가 모두 동일한가» 회귀 하니스 (2026-08-04)
//
// 왜 있나: R2 는 마지막 파트를 뺀 나머지 파트가 1바이트도 틀리지 않고 같은 크기가 아니면
//   completeMultipartUpload 를 통째로 거부한다(오류 10048 "All non-trailing parts must have
//   the same length" — 운영 워커에서 실측 확인). 예전 녹화기는 «5MB 넘으면 모아둔 조각을
//   통째로» 올려 파트가 5.0~5.6MB 로 제각각이었고, 그래서 비마지막 파트가 2개 이상 되는
//   순간(대략 1분 30초·10MB 이상) 업로드 마무리가 실패해 수업 녹화가 통으로 사라졌다.
//   2026-08-01~04 사이 6건(최대 201MB, 21분 수업) 복구 불가.
//
// 무엇을 검사하나: 알고리즘 복사본이 아니라 «배포되는 파일»에서 청크 누적 함수를 그대로
//   떼어내 실행한다. 상수나 로직이 옛 방식으로 되돌아가면 여기서 잡힌다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, '..', 'cloudflare-deploy', 'public');

let fail = 0;
const chk = (label, ok, extra) => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${extra ? '  — ' + extra : ''}`);
  if (!ok) fail++;
};

/** 소스에서 함수 하나를 통째로 떼어낸다 (중괄호 균형으로 끝을 찾음) */
function cutFunction(src, header) {
  const start = src.indexOf(header);
  if (start < 0) return null;
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(start, j + 1);
  }
  return null;
}

/** 실제 소스의 청크 누적 함수를 돌려 만들어진 파트 크기 목록을 반환 */
function runChunker({ file, header }) {
  const src = fs.readFileSync(path.join(PUBLIC, file), 'utf8');
  const body = cutFunction(src, header);
  if (!body) throw new Error(`'${header}' 를 못 찾음 (함수가 사라졌거나 이름이 바뀜)`);

  const m = /PART_SIZE\s*=\s*([0-9*\s]+);/.exec(src);
  if (!m) throw new Error('PART_SIZE 상수를 못 찾음');
  const PART = Function(`return (${m[1]})`)();

  const emitted = [];
  const scope = {
    Blob, PART_SIZE: PART,
    r2InitDone: true, _r2InitDone: true,
    chunkBuffer: [], chunkBufferSize: 0,
    _chunkBuffer: [], _chunkBufferSize: 0,
    enqueuePart: (b) => emitted.push(b.size),
    _enqueuePart: (b) => emitted.push(b.size),
    _partType: () => 'video/webm',
    // 옛 방식(«모아둔 걸 통째로» flush)으로 되돌아가도 «함수 없음» 이 아니라 «크기가 제각각»
    // 으로 잡히도록 flush 도 진짜처럼 흉내낸다 — 잡히는 이유가 정확해야 한다.
    flushBuffer: () => {
      if (!scope.chunkBuffer.length) return;
      emitted.push(new Blob(scope.chunkBuffer).size);
      scope.chunkBuffer = []; scope.chunkBufferSize = 0;
    },
    _flushBuffer: () => {
      if (!scope._chunkBuffer.length) return;
      emitted.push(new Blob(scope._chunkBuffer).size);
      scope._chunkBuffer = []; scope._chunkBufferSize = 0;
    },
  };
  const fn = Function('scope', `
    with (scope) {
      ${body}
      return typeof bufferChunk === 'function' ? bufferChunk : _bufferChunk;
    }
  `)(scope);

  // MediaRecorder 실제 동작 모사 — 5초 timeslice, 조각 크기는 화면 움직임에 따라 들쭉날쭉
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let total = 0;
  for (let i = 0; i < 120; i++) {
    const size = Math.round(260_000 + rnd() * 420_000);   // 260~680KB
    total += size;
    fn(new Blob([new Uint8Array(size)]));
  }
  return { emitted, PART, total };
}

const TARGETS = [
  { name: 'mango-rec.js (홈·화상수업)', file: 'js/mango-rec.js', header: 'function bufferChunk(blob)' },
  { name: 'recorder.js (video-call)', file: 'video-call/js/recorder.js', header: 'function _bufferChunk(blob)' },
];

console.log('🎬 녹화 멀티파트 파트 크기 균일성 (R2 오류 10048 방지)\n');

for (const t of TARGETS) {
  console.log('· ' + t.name);
  let r;
  try {
    r = runChunker(t);
  } catch (e) {
    chk(t.name + ': 소스에서 청크 누적 함수 추출', false, e.message);
    continue;
  }
  const { emitted, PART, total } = r;
  const uniq = [...new Set(emitted)];

  chk('  파트가 3개 이상 만들어짐(검사 성립)', emitted.length >= 3,
      `${(total / 1048576).toFixed(1)}MB → 파트 ${emitted.length}개`);
  chk('  PART_SIZE 가 R2 최소(5MiB) 이상', PART >= 5 * 1024 * 1024, `${PART} bytes`);
  // 여기서 나오는 건 전부 «비마지막» 파트다 (꼬리는 stop 시점 flushBuffer 가 따로 올림)
  chk('  비마지막 파트가 모두 정확히 같은 크기', uniq.length === 1 && uniq[0] === PART,
      `크기 종류: ${uniq.join(', ')}`);
}

console.log(fail === 0 ? '\n🎉 ALL PASS' : '\n💥 ' + fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);
