// 부분 체크아웃(sparse) 감시 — «받지 않은 폴더» 의 파일을 누가 찾으면 기록합니다 (2026-11-03).
//
// 왜: 브라우저 검사·PR 검사는 저장소 일부(무거운 미디어 폴더)를 안 받고 돕니다. 그런데 검사가 그 폴더의
//     파일을 찾으면 «없다» 가 되고, 화면은 404 를 조용히 넘기거나 검사가 엉뚱한 이유로 통과할 수 있습니다.
//     그러면 «실제 화면과 다른 것을 검사» 하게 됩니다. 그래서 찾는 순간을 기록하고, 워크플로 마지막 단계가
//     기록이 하나라도 있으면 빨간불을 냅니다 — «부분 체크아웃이 이 검사에 필요한 파일을 숨겼다».
//
// 쓰는 법(워크플로 «검사 단계» 의 env 에만 — 체크아웃 단계에 걸면 이 파일이 아직 없어 node 가 죽습니다):
//   NODE_OPTIONS:      --import=<저장소>/test-harness/helpers/sparse-guard.mjs
//   SPARSE_GUARD_DIRS: 쉼표로 이은 폴더(저장소 기준) — sparse-checkout 에서 «!» 로 뺀 것과 같아야 합니다
//   SPARSE_GUARD_LOG:  기록 파일(한 줄 = 한 번 찾음)
// ⚠️ 막지는 않습니다 — 원래대로 «없음» 이 돌아갑니다. 판정은 마지막 단계가 합니다(여러 프로세스를 한 곳에 모으려고).
// ⚠️ 폴더 «목록 보기»(readdir)로 상위 폴더를 훑다가 «그 폴더가 없어서 덜 세는» 것은 못 봅니다 —
//    그래서 뺄 폴더는 «검사가 훑지 않는» 미디어 폴더만 고르고, 하니스 대조로 확인했습니다(작업기록).
import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIRS = String(process.env.SPARSE_GUARD_DIRS || '').split(',').map(s => s.trim()).filter(Boolean)
  .map(d => path.resolve(ROOT, d) + path.sep);
const LOG = process.env.SPARSE_GUARD_LOG || '';

if (DIRS.length && LOG) {
  const append = fs.appendFileSync.bind(fs);
  const seen = new Set();
  const toPath = (p) => {
    try {
      if (p instanceof URL) return fileURLToPath(p);
      if (Buffer.isBuffer(p)) return p.toString();
      if (typeof p === 'string') return p.startsWith('file:') ? fileURLToPath(p) : p;
    } catch (_) {}
    return null;
  };
  const note = (name, p) => {
    const s = toPath(p);
    if (!s) return;
    const abs = path.resolve(s);
    const hit = DIRS.find(d => abs === d.slice(0, -1) || abs.startsWith(d));
    if (!hit) return;
    const rel = path.relative(ROOT, abs);
    if (seen.has(rel)) return;
    seen.add(rel);
    try { append(LOG, `${rel}\t${name}\t${path.relative(ROOT, process.argv[1] || '?')}\n`); } catch (_) {}
  };
  const wrap = (obj, names, label) => {
    for (const n of names) {
      const orig = obj[n];
      if (typeof orig !== 'function') continue;
      obj[n] = function (p, ...rest) { note(label + n, p); return orig.call(this, p, ...rest); };
    }
  };
  wrap(fs, ['existsSync', 'statSync', 'lstatSync', 'readFileSync', 'openSync', 'accessSync', 'readdirSync',
    'createReadStream', 'readFile', 'stat', 'lstat', 'open', 'access', 'readdir'], '');
  wrap(fs.promises, ['readFile', 'stat', 'lstat', 'open', 'access', 'readdir'], 'promises.');
  syncBuiltinESMExports();
}
