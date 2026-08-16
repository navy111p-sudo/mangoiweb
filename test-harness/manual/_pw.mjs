// -*- coding: utf-8 -*-
// 브라우저 검사 공용 준비물 — playwright 를 찾고, Chromium 실행 파일 위치를 알아낸다.
//
// ⚠️ playwright 는 이 저장소의 의존성이 **아니다**(게이트에서 브라우저를 요구하지 않으려고).
//    그래서 밖에서 받아 쓰고, 없으면 조용히 건너뛴다.
//      mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//      PW_DIR=/tmp/pw node test-harness/manual/<파일>.mjs
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

/** playwright-core 를 찾는다. 없으면 null(호출한 쪽이 «건너뜀» 으로 끝낸다). */
export function loadPlaywright() {
  const tries = [];
  if (process.env.PW_DIR) tries.push(join(process.env.PW_DIR, 'node_modules', 'playwright-core'));
  tries.push('playwright-core', 'playwright');
  for (const t of tries) {
    try { return require(t); } catch { /* 다음 후보 */ }
  }
  return null;
}

/** 미리 깔려 있는 Chromium 실행 파일. 웹 세션 환경은 /opt/pw-browsers 를 쓴다. */
export function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base)) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const p = join(base, d, rel);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/** 준비가 안 됐으면 «건너뜀» 으로 끝낸다 — 실패로 세지 않는다. */
export function requireBrowser() {
  const pw = loadPlaywright();
  if (!pw) {
    console.log('⏭  건너뜀 — playwright-core 가 없습니다. test-harness/manual/README.md 참고');
    process.exit(0);
  }
  const exe = findChromium();
  if (!exe) {
    console.log('⏭  건너뜀 — Chromium 을 찾지 못했습니다(PLAYWRIGHT_BROWSERS_PATH 확인)');
    process.exit(0);
  }
  return { chromium: pw.chromium, exe };
}
