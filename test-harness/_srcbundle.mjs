// _srcbundle.mjs — 리팩토링 내성 소스 번들 헬퍼 (2026-07-19)
//   대분리로 api-mango.ts 가 도메인 모듈(api-lessons/games/admin/ai-command/…)로 쪼개진 뒤,
//   하니스가 단일 파일만 grep 하면 '이동한 코드'를 못 찾아 false-positive 실패가 남.
//   → 이 헬퍼로 src/*.ts 전체를 합쳐서 검사하면 코드가 어느 모듈에 있든 패턴을 찾는다(동작 회귀 가드 본래 의도).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../cloudflare-deploy/src');

export function allSrc() {
  try {
    return readdirSync(SRC_DIR)
      .filter(f => f.endsWith('.ts'))
      .map(f => readFileSync(join(SRC_DIR, f), 'utf8'))
      .join('\n/*───*/\n');
  } catch {
    return '';
  }
}

// admin.html + 추출된 /js/adm-*.js 전체 합본 — 관리자 인라인 로직이 adm-*.js 로 분리됐으므로
// (PERMS/CARD_POLICY→adm-core.js 등) 둘을 합쳐 검사해야 코드 위치와 무관하게 패턴을 찾는다.
const PUB_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../cloudflare-deploy/public');
export function allAdm() {
  let s = '';
  try { s = readFileSync(join(PUB_DIR, 'admin.html'), 'utf8'); } catch {}
  try {
    for (const f of readdirSync(join(PUB_DIR, 'js'))) {
      if (/^adm-.*\.js$/.test(f)) { try { s += '\n/*───*/\n' + readFileSync(join(PUB_DIR, 'js', f), 'utf8'); } catch {} }
    }
  } catch {}
  return s;
}
