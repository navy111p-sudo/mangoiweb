/* 마이마이에게 보낼 영문 체크리스트 — MS Word (.docx)
   HTML/PDF 판(docs/Maimai_Checklist_2026-08-14_EN.html)과 같은 내용·같은 순서.
   순서: ① 요청사항 → ② 된 것 → ③ 안 된 것 → ④ 사람이 할 일  */
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PositionalTab,
} = require('docx');
const fs = require('fs');

const INK = '16181D', INK2 = '454B55', INK3 = '6B7280';
const MANGO = 'C9660A', DONE = '17564A', WAIT = '8A6410', TODO = '1F4F8F';
const FONT = 'Calibri';

const P = (opts) => new Paragraph(opts);
const run = (text, o = {}) => new TextRun({ text, font: FONT, ...o });

/* 본문 한 줄 */
const body = (children, o = {}) => P({ children, spacing: { after: 90, line: 300 }, ...o });

/* 큰 제목 */
function h1(text, sub) {
  const out = [P({
    children: [run(text, { bold: true, size: 40, color: INK })],
    spacing: { after: sub ? 60 : 200 },
  })];
  if (sub) out.push(P({
    children: [run(sub, { size: 20, color: INK3 })],
    spacing: { after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: INK, space: 8 } },
  }));
  return out;
}

/* 장 제목 — 번호 + 옆에 작은 설명 */
function h2(text, note) {
  const kids = [run(text, { bold: true, size: 28, color: INK })];
  if (note) kids.push(run('   ' + note, { size: 18, color: INK3 }));
  return P({ children: kids, spacing: { before: 320, after: 140 } });
}

/* 체크리스트 한 칸 — 표 1×2 (표시칸 + 글칸). 배경색으로 종류를 구분한다. */
function item(mark, markColor, title, lines, opts = {}) {
  const fill = opts.fill;
  const textKids = [P({
    children: [run(title, { bold: true, size: 23, color: INK })],
    spacing: { after: lines.length ? 70 : 0, line: 290 },
  })];
  lines.forEach((ln, i) => {
    const isLast = i === lines.length - 1;
    textKids.push(P({
      children: typeof ln === 'string' ? [run(ln, { size: 21, color: INK2 })] : ln,
      spacing: { after: isLast ? 0 : 60, line: 290 },
    }));
  });
  const cellOpts = {
    margins: { top: 130, bottom: 130, left: 140, right: 140 },
    ...(fill ? { shading: { type: ShadingType.CLEAR, fill, color: 'auto' } } : {}),
  };
  return new Table({
    columnWidths: [520, 8680],
    width: { size: 9200, type: WidthType.DXA },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: opts.border || 'DFE3E8' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: opts.border || 'DFE3E8' },
      left:   { style: BorderStyle.SINGLE, size: 4, color: opts.border || 'DFE3E8' },
      right:  { style: BorderStyle.SINGLE, size: 4, color: opts.border || 'DFE3E8' },
      insideVertical:   { style: BorderStyle.NIL },
      insideHorizontal: { style: BorderStyle.NIL },
    },
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: 520, type: WidthType.DXA }, ...cellOpts,
          children: [P({ children: [run(mark, { bold: true, size: 24, color: markColor })] })],
        }),
        new TableCell({ width: { size: 8680, type: WidthType.DXA }, ...cellOpts, children: textKids }),
      ],
    })],
  });
}

const gap = () => P({ children: [run('')], spacing: { after: 90 } });
const ask   = (t, l) => item('☐', INK3,  t, l, { fill: 'FDF0E2', border: MANGO });
const done  = (t, l) => item('✔', DONE,  t, l);
const nope  = (t, l) => item('!', WAIT,  t, l, { fill: 'FAF0D8' });
const human = (t, l) => item('◆', TODO,  t, l, { fill: 'E4ECF8' });
const you   = (t) => [run(t, { size: 21, color: MANGO, bold: true })];
const note  = (t) => [run(t, { size: 20, color: INK3, italics: true })];

/* 굵게 섞인 줄 */
function mix(parts) {
  return parts.map(p => typeof p === 'string'
    ? run(p, { size: 21, color: INK2 })
    : run(p[0], { size: 21, color: INK, bold: true }));
}

/* 숫자 표 */
function numberTable(head, rows) {
  const cell = (text, o = {}) => new TableCell({
    width: { size: o.w, type: WidthType.DXA },
    margins: { top: 90, bottom: 90, left: 130, right: 130 },
    ...(o.fill ? { shading: { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } } : {}),
    children: [P({
      alignment: o.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [run(text, { size: 20, bold: !!o.bold, color: o.bold ? INK2 : INK })],
    })],
  });
  const w = [3900, 1750, 1750, 1800];
  return new Table({
    columnWidths: w,
    width: { size: 9200, type: WidthType.DXA },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: 'DFE3E8' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'DFE3E8' },
      left:   { style: BorderStyle.SINGLE, size: 4, color: 'DFE3E8' },
      right:  { style: BorderStyle.SINGLE, size: 4, color: 'DFE3E8' },
      insideVertical:   { style: BorderStyle.SINGLE, size: 4, color: 'DFE3E8' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'DFE3E8' },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: head.map((h, i) => cell(h, { w: w[i], bold: true, fill: 'F2F4F6', right: i > 0 })),
      }),
      ...rows.map(r => new TableRow({
        children: r.map((c, i) => cell(c, { w: w[i], right: i > 0 })),
      })),
    ],
  });
}

const children = [];

/* ── 머리말 ── */
children.push(P({
  children: [run('MANGOI  ·  TEACHER’S PAGE', { bold: true, size: 17, color: MANGO })],
  spacing: { after: 80 },
}));
children.push(...h1('Maimai’s August Checklist',
  'August 14, 2026  ·  from your reports of August 7–14  ·  34 items'));
children.push(body([run(
  'Hi Maimai! Thank you for all your reports. You found real problems, and your numbers were correct. '
  + 'Here is what we did, what we could not do, and what we need from you.',
  { size: 22, color: INK2 })]));

children.push(item('✔', DONE, 'Everything below is already live. Please refresh your page first.', [
  mix([['Press Ctrl + Shift + R'], ' (hold Ctrl and Shift, then press R) one time. This makes your computer '
    + 'throw away the old screen and get the new one. If you do not do this, you may still see the old page.']),
], { fill: 'E2EFEC', border: DONE }));

/* ── 1. 요청사항 ── */
children.push(h2('1.  Please help us with these', '7 things'));
children.push(body([run(
  'This is the most important part. We cannot finish without your answers. You can just reply Yes or No to each one.',
  { size: 21, color: INK2 })]));

children.push(ask('Are the books the right size now?', [
  mix(['Open ', ['BTS 1 001'], ' in the library. It should show ', ['23 pages'], ', not 115. '
    + 'Please check one or two other books too.']),
  you('→ Please tell us:  Yes / No'),
]));
children.push(gap());
children.push(ask('Does the page list show the page names now?', [
  mix(['Open a book, click ', ['Pages'], '. Before, every line looked the same '
    + '(“1. [BTS 6 Korea (Bedroom, li…”). Now each line should show the ', ['real page name'],
    ' (like “Slide12.JPG”), the same idea as BODA.']),
  you('→ Please tell us:  Is it easy to read now?'),
]));
children.push(gap());
children.push(ask('Please press the 🌐 button and look around.', [
  mix(['We found ', ['23 places'], ' that stayed in Korean even after you pressed the 🌐 button. '
    + 'We fixed all of them. Only teachers in the Philippines could see this problem, so we need your eyes.']),
  you('→ Please tell us if you still see any Korean word.'),
]));
children.push(gap());
children.push(ask('Are the 5 folders gone from Server Textbook?', [
  mix(['(Others)  ·  004. I visited my grandparents  ·  007. Commercials  ·  Mangoi Books  ·  Shake it up 2-18-25. '
    + 'They are ', ['hidden, not deleted'], '. We can bring any of them back in one second.']),
  you('→ If you need one of them back, just tell us the name.'),
]));
children.push(gap());
children.push(ask('Please send us the Google Drive links for Phonics and BTS 2–34.', [
  mix(['We must ', ['upload them one more time'], ' so they split into small books '
    + '(“Mangoi Phonics A”, “Mangoi Phonics B”… and “BTS 2 001”, “BTS 2 002”…). '
    + 'The head office will do the uploading — we only need the links.']),
  note('Don’t worry: the system now blocks the same file twice, so the pages will not double again.'),
  you('→ Please send the folder links.'),
]));
children.push(gap());
children.push(ask('Please tell the teachers about the postpone rule.', [
  mix(['If a class is postponed ', ['more than 30 minutes before'], ' the class, the pay is ', ['0 PHP'],
    '. If it is postponed ', ['within 30 minutes'], ', the pay is ', ['full (50 PHP)'],
    '. This starts with ', ['this month’s salary'], '.']),
  you('→ Please tell the teachers before payday.'),
]));
children.push(gap());
children.push(ask('Please use the computers for one more week before we buy RAM.', [
  mix(['You said the system is slow. We found the real reason: the books had ', ['2 to 3 times too many pages'],
    '. We removed them. The books are much smaller now, so the computers may be fine.']),
  you('→ After one week, please tell us: still slow? Then we buy the RAM.'),
]));

/* ── 2. 된 것 ── */
children.push(h2('2.  Done — please check these', '34 requests · 30 finished · 4 need one more step'));
children.push(body([run(
  'Here are the newest ones. The older ones (August 7–12) are already working on your screen.',
  { size: 21, color: INK2 })]));

children.push(done('The books had too many pages. Fixed.', [
  [run('"THE BOOK IS NOT SLOW ONLY THAT THE PAGES AT THE LIBRARY TRIPLED OR DOUBLED"',
    { size: 19, color: INK3, italics: true })],
  mix(['You were ', ['right'], ', and our first answer was ', ['wrong'],
    '. We thought the books were slow. The real problem was that the ', ['same page was saved many times'], '.']),
]));
children.push(gap());
children.push(numberTable(
  ['What we counted', 'Before', 'Now', 'Times'],
  [
    ['All textbook files', '38,922', '17,170', '2.3×'],
    ['BTS 1 001 (the book you found)', '115', '23', '5.0×'],
    ['BTS 2', '762', '246', '3.1×'],
  ]));
children.push(gap());

children.push(done('The same file cannot be uploaded twice any more.', [
  mix(['Before, if someone uploaded a book two times, the book became two times bigger. Now the system ',
    ['skips'], ' the file it already has, and says “', ['New: 20 · Already there, skipped: 5'],
    '”. Nothing is lost — nothing is doubled.']),
]));
children.push(gap());
children.push(done('The page list now shows page names.', [
  'Before, every line showed the long book name and the page number was cut off. '
  + 'Now the line shows the page name, and the number stays (1. 2. 3.). '
  + 'Put your mouse on a line to see the full name.',
]));
children.push(gap());
children.push(done('The page window stays open, and you can make it bigger.', [
  mix(['It closes only with the ', ['✕'], ' button. Pull the bottom-right corner to make it bigger. The system ',
    ['remembers your size'], ' for next time.']),
]));
children.push(gap());
children.push(done('The 🌐 button now works everywhere (23 places).', [
  mix(['The class page had ', ['two language helpers'],
    ' inside, and 23 places were listening to the wrong one. That one never changed to English. '
    + 'Now they all listen to the same one.']),
]));
children.push(gap());
children.push(done('The book card said “0 and · 781”. Fixed.', [
  mix(['That was a translation mistake. Now it says “', ['7 units · 246 pages'], '”.']),
]));
children.push(gap());
children.push(done('MES is hidden — and we found a second copy of it.', [
  mix(['LEVEL 1 to LEVEL 7 were hidden yesterday. Today we found that “', ['Mangoi Books'], '” was the ',
    ['same MES pages with a different name'], ' — all 797 pages matched, one by one. '
    + 'That is why you crossed it out. It is hidden now too.']),
  note('Nothing is deleted. Old class records still work.'),
]));
children.push(gap());
children.push(done('Phonics A–Z: the rule is fixed (but see part 3).', [
  mix(['The uploader only understood folders with ', ['numbers'], ' (001, 002). Your folders use ',
    ['letters'], ' (Mangoi Phonics A, B, C…), so it put all 26 folders into one book. '
    + 'Now it understands letters too.']),
]));

/* ── 3. 안 된 것 ── */
children.push(h2('3.  Not done yet — and why', '2 things'));
children.push(body([run('We want to be honest with you. These two are only half done.',
  { size: 21, color: INK2 })]));

children.push(nope('Old books are still in one big piece.', [
  mix(['You asked: “please separate the book per unit — BTS 1 001, BTS 1 002 and so on.” ',
    ['New uploads will do this'], '. But books that are ', ['already inside'],
    ' cannot be split, because the computer ', ['did not save which unit each page came from'],
    '. That information is gone.']),
  mix([['37 books · 15,580 pages'], ' are like this today. The only way is to ', ['upload them again'],
    ' from your Drive folders. That is why we asked you for the links.']),
]));
children.push(gap());
children.push(nope('The BTS placement test is not in the library yet.', [
  mix(['The teachers were not doing it wrong. The screen said “✅ Saved!” but the file ',
    ['only went to their own computer'], '. The screen was not telling the truth. ',
    ['That lie is fixed'], ' — now it says “⚠️ Saved on this computer only”.']),
  'The head office will upload the real file, so all teachers can see it.',
]));

/* ── 4. 사람이 할 일 ── */
children.push(h2('4.  Things a person must do', 'not the computer'));
children.push(human('Upload Phonics and BTS 2–34 one more time.', [
  'Head office. Just drag the Drive folders into the uploader. Then the books split by themselves.',
]));
children.push(gap());
children.push(human('Upload the BTS placement test.', [
  mix(['Head office. We do ', ['not'], ' give teachers permission to upload to the shared library — '
    + 'all teachers share it, so one mistake would hurt everybody.']),
]));
children.push(gap());
children.push(human('Tell the teachers about the postpone rule.', [
  'Manager (you). It changes their pay this month.',
]));
children.push(gap());
children.push(human('Decide about the RAM after one week.', [
  'Owner. Please try the lighter books first.',
]));

/* ── 맺음말 ── */
children.push(P({
  children: [run('')],
  spacing: { before: 300, after: 140 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'DFE3E8', space: 6 } },
}));
children.push(body(mix([['Thank you, Maimai.'],
  ' Your report from August 14 changed our whole plan. We thought the books were slow. '
  + 'You told us the pages were doubled — and you were right. Because of you we found and removed ',
  ['21,752 extra pages'], ', and we also found a second hidden copy of MES.'])));
children.push(body(mix(['If anything on this list is still not working, please write the ', ['number'],
  ' (for example “1-2 is still bad”) and send a picture. That helps us very much.'])));

const doc = new Document({
  creator: 'Mangoi',
  title: 'Maimai’s August Checklist',
  description: 'Teacher’s page — what is done, what is not, and what we need from Maimai.',
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },           // US Letter
        margin: { top: 1150, right: 1150, bottom: 1150, left: 1150 },
      },
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = process.argv[2] || 'Maimai_Checklist_2026-08-14_EN.docx';
  fs.writeFileSync(out, buf);
  console.log('wrote', out, buf.length, 'bytes');
});
