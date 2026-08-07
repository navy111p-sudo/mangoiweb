// 개발일지에서 «맨 앞 두 날짜»만 뽑아 별도 발췌본 2벌(한/영)을 만든다.
//
// 왜 있나: 전체 일지는 40쪽이 넘어서 «어제·오늘 뭐 했나»만 보려는 사람에게는 과하다.
//          손으로 오려 붙이면 반드시 원본과 어긋나므로, 원본에서 잘라 낸다.
//
// 쓰는 법:  node 2일치_뽑기.mjs
//           그 뒤 PDF만들기.ps1 이 만든 PDF 옆에 두려면 크롬 headless 로 직접 구우면 된다
//           (같은 폴더 PDF만들기.ps1 의 Start-Process -Wait 방식을 그대로 쓸 것 —
//            호출 연산자 & 로 구우면 기다려 주지 않아 «파일 없음»으로 오판한다).
//
// 🪤 잘라낸 끝에 <div class="pg"></div> 가 남으면 «빈 쪽»이 한 장 더 생긴다. 그래서 뗀다.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const jobs = [
  {
    src: '개발일지_한국어.html',
    out: '개발일지_2일치_한국어.html',
    lang: 'ko',
    // 발췌 끝 지점 = «세 번째 날짜»가 시작되는 곳. 날짜가 바뀌면 여기만 고친다.
    stopH1: '<h1>8월 6일',
    monthMark: '<div class="month">2026년 8월</div>',
    title: '망고아이 개발일지 — 최근 2일',
    sub: '2026년 8월 7일(금) · 8월 8일(토) 만 뽑은 발췌본 · 맨 앞이 오늘',
  },
  {
    src: '개발일지_영어.html',
    out: '개발일지_2일치_영어.html',
    lang: 'en',
    stopH1: '<h1>Thursday, August 6',
    monthMark: '<div class="month">AUGUST 2026</div>',
    title: 'Mangoi Development Diary — Last Two Days',
    sub: 'Excerpt: Friday 7 and Saturday 8 August 2026 only · today at the front',
  },
];

for (const j of jobs) {
  const html = readFileSync(join(HERE, j.src), 'utf8');

  // <head> 를 통째로 재사용한다 — 스타일이 원본과 한 글자도 달라지지 않게
  const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>') + 7);

  const from = html.indexOf('<div class="howto">');
  const idx3 = html.indexOf(j.stopH1);
  if (from < 0 || idx3 < 0) throw new Error(`표시를 못 찾음(날짜가 바뀌었나?): ${j.src}`);
  const to = html.lastIndexOf(j.monthMark, idx3);
  if (to < 0) throw new Error(`월 표시를 못 찾음: ${j.src}`);

  const body = html.slice(from, to).trimEnd().replace(/(?:\s*<div class="pg"><\/div>)+$/, '');
  const titled = head.replace(/<title>[^<]*<\/title>/, `<title>${j.title}</title>`);

  const doc = `<!DOCTYPE html>
<html lang="${j.lang}">
${titled}
<body>

<div style="border-bottom:2.5px solid #f59e0b;padding-bottom:8px;margin-bottom:12px">
  <h1 style="margin:0;font-size:17pt;color:#78350f;font-weight:800">${j.title}</h1>
  <p style="margin:3px 0 0;font-size:9.5pt;color:#64748b">${j.sub}</p>
</div>

${j.monthMark}

${body}
</body>
</html>
`;
  writeFileSync(join(HERE, j.out), doc, 'utf8');

  const o = (doc.match(/<div/g) || []).length;
  const c = (doc.match(/<\/div>/g) || []).length;
  if (o !== c) throw new Error(`태그가 안 맞음: ${j.out} (${o}/${c})`);
  console.log(`${j.out}  div ${o}/${c}  OK`);
}
