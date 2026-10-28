// 📚 자료실 원본 공용 도우미 (2026-10-28) — 관리자용 사용설명서·A.i 컨텐츠 결제 안내서가 함께 쓴다.
//   ⛔ 같은 코드를 빌드마다 다시 적지 말 것(한쪽만 고쳐져 서로 다른 글꼴·브라우저로 찍히게 된다).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const req = createRequire('/opt/node22/lib/node_modules/playwright/package.json');

/** 컨테이너에 깔린 Playwright 크로미움을 띄운다.
 *  ⚠️ 경로를 손으로 박지 말 것 — 컨테이너마다 판이 달라(chromium-1194 → 1243) 옛 경로는 그대로 죽는다.
 *  다른 크롬을 써야 하면 CHROME=<실행 파일> 로 넘긴다. */
export async function launchChromium() {
  const { chromium } = req('playwright');
  return chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
}

/** Noto Sans KR 을 «쓰인 글자만» 받아 data: 로 심은 @font-face CSS.
 *  굵기마다 따로 받는다 — text= 와 여러 굵기를 한 번에 주면 400 이 난다(CLAUDE.md 2장). */
export function fontCss(text, weights = [400, 700, 800]) {
  let css = '';
  for (const w of weights) {
    const url = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent('Noto Sans KR') + ':wght@' + w + '&text=' + encodeURIComponent(text);
    const c = execFileSync('curl', ['-sS', '-A', 'Mozilla/5.0 Chrome/120', url]).toString();
    if (!/@font-face/.test(c)) throw new Error('글꼴을 못 받았습니다(' + w + '): ' + c.slice(0, 200));
    let out = c;
    for (const m of c.matchAll(/url\((https:[^)]+)\)/g)) {
      const b = execFileSync('curl', ['-sS', m[1]]);
      out = out.replace(m[1], 'data:font/woff2;base64,' + b.toString('base64'));
    }
    css += out + '\n';
  }
  return css;
}
