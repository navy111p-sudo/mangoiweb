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
