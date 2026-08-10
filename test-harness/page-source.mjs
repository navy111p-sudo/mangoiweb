// page-source.mjs — 「그 페이지의 코드 전체」를 한 덩어리로 준다 (2026-08-09)
//
// 왜 필요한가
//   하니스 50개가 index.html 을 **파일 하나**로 읽어 소스 문자열을 확인한다.
//   그런데 index.html 을 파일로 쪼개는 순간(분해) 그 코드가 /js/*.js 로 옮겨가고,
//   하니스는 «기능이 사라졌다» 고 오판한다 — 실제로는 한 글자도 안 바뀌었는데.
//   실제로 밟았다: 762KB 블록 하나를 idx-main.js 로 옮겼더니 하니스 17개가 동시에 깨졌다.
//
//   원인은 하니스가 틀린 것을 보고 있었기 때문이다.
//   페이지의 «행동» 은 index.html 한 파일이 아니라 **그 페이지가 로드하는 스크립트 전부**에서 나온다.
//   그래서 처음부터 그 전부를 봤어야 한다.
//
// 쓰는 법
//     import { readPageSource } from './page-source.mjs';
//     const html = readPageSource('index.html');     // HTML + 그 페이지가 로드하는 모든 로컬 js
//
//   구조(마크업)만 봐야 하는 검사는 htmlOnly() 를 쓴다.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../cloudflare-deploy/public');

/** 마크업만 (스크립트 파일은 안 붙인다) */
export function htmlOnly(page) {
  return readFileSync(join(PUB, page), 'utf8').split('\r\n').join('\n');
}

/** HTML + 그 페이지가 로드하는 «로컬» 스크립트 본문 전부.
 *  줄바꿈은 \n 으로 통일한다(하니스들이 .split('\r\n').join('\n') 을 각자 하던 것을 여기서 한 번에). */
export function readPageSource(page) {
  const html = htmlOnly(page);
  const parts = [html];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)) {
    const src = m[1].split('?')[0];
    if (/^https?:/.test(src)) continue;               // CDN 은 우리 코드가 아니다
    const p = join(PUB, src.replace(/^\//, ''));
    if (!existsSync(p)) continue;
    parts.push(`\n/*── ${src} (분해로 옮겨온 코드 — page-source.mjs 가 이어붙임) ──*/\n`);
    parts.push(readFileSync(p, 'utf8').split('\r\n').join('\n'));
  }
  return parts.join('');
}
