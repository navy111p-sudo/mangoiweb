/* 강사 명부(Teacher_Info_EN 시트) ↔ 운영 시스템 대조 — MS Word 2종
     ① 강사명부_시스템_대조_2026-08-14.docx   (한국어, 사장님용)
     ② Teacher_Info_Check_2026-08-14_EN.docx  (영문, 강사가 직접 확인하는 양식)
   ⚠️ 비밀번호는 어느 문서에도 적지 않는다. «약하다/바꿔라» 만 적는다. */
const {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
} = require('docx');
const fs = require('fs');

const INK = '16181D', INK2 = '454B55', INK3 = '6B7280';
const MANGO = 'C9660A', DONE = '17564A', WAIT = '8A6410', TODO = '1F4F8F', STOP = 'A32B2B';
const FONT_KO = '맑은 고딕', FONT_EN = 'Calibri';

function makeDoc(FONT) {
  const run = (text, o = {}) => new TextRun({ text, font: FONT, ...o });
  const body = (children, o = {}) => new Paragraph({ children, spacing: { after: 90, line: 300 }, ...o });

  const mix = (parts, base = INK2) => parts.map(p => typeof p === 'string'
    ? run(p, { size: 21, color: base })
    : run(p[0], { size: 21, color: INK, bold: true }));

  function h1(text, sub) {
    const out = [new Paragraph({
      children: [run(text, { bold: true, size: 38, color: INK })],
      spacing: { after: sub ? 60 : 200 },
    })];
    if (sub) out.push(new Paragraph({
      children: [run(sub, { size: 19, color: INK3 })],
      spacing: { after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: INK, space: 8 } },
    }));
    return out;
  }
  function h2(text, note) {
    const kids = [run(text, { bold: true, size: 27, color: INK })];
    if (note) kids.push(run('   ' + note, { size: 18, color: INK3 }));
    return new Paragraph({ children: kids, spacing: { before: 320, after: 140 } });
  }

  /* 한 항목 = 1×2 표 (표시칸 + 글칸) */
  function item(mark, markColor, title, lines, opts = {}) {
    const cellOpts = {
      margins: { top: 130, bottom: 130, left: 140, right: 140 },
      ...(opts.fill ? { shading: { type: ShadingType.CLEAR, fill: opts.fill, color: 'auto' } } : {}),
    };
    const kids = [new Paragraph({
      children: [run(title, { bold: true, size: 23, color: INK })],
      spacing: { after: lines.length ? 70 : 0, line: 290 },
    })];
    lines.forEach((ln, i) => kids.push(new Paragraph({
      children: typeof ln === 'string' ? [run(ln, { size: 21, color: INK2 })] : ln,
      spacing: { after: i === lines.length - 1 ? 0 : 60, line: 290 },
    })));
    const bd = (c) => ({ style: BorderStyle.SINGLE, size: 4, color: c });
    return new Table({
      columnWidths: [520, 8680],
      width: { size: 9200, type: WidthType.DXA },
      borders: {
        top: bd(opts.border || 'DFE3E8'), bottom: bd(opts.border || 'DFE3E8'),
        left: bd(opts.border || 'DFE3E8'), right: bd(opts.border || 'DFE3E8'),
        insideVertical: { style: BorderStyle.NIL }, insideHorizontal: { style: BorderStyle.NIL },
      },
      rows: [new TableRow({
        children: [
          new TableCell({ width: { size: 520, type: WidthType.DXA }, ...cellOpts,
            children: [new Paragraph({ children: [run(mark, { bold: true, size: 24, color: markColor })] })] }),
          new TableCell({ width: { size: 8680, type: WidthType.DXA }, ...cellOpts, children: kids }),
        ],
      })],
    });
  }

  /* 자유 폭 표 */
  function table(widths, head, rows, opts = {}) {
    const bd = (c) => ({ style: BorderStyle.SINGLE, size: 4, color: c });
    const cell = (text, w, o = {}) => new TableCell({
      width: { size: w, type: WidthType.DXA },
      margins: { top: 90, bottom: 90, left: 120, right: 120 },
      ...(o.fill ? { shading: { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } } : {}),
      children: [new Paragraph({
        alignment: o.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [run(text, { size: o.size || 19, bold: !!o.bold, color: o.color || (o.bold ? INK2 : INK) })],
      })],
    });
    return new Table({
      columnWidths: widths,
      width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
      borders: {
        top: bd('DFE3E8'), bottom: bd('DFE3E8'), left: bd('DFE3E8'), right: bd('DFE3E8'),
        insideVertical: bd('DFE3E8'), insideHorizontal: bd('DFE3E8'),
      },
      rows: [
        new TableRow({ tableHeader: true,
          children: head.map((h, i) => cell(h, widths[i], { bold: true, fill: 'F2F4F6', center: i > 0 && !!opts.centerHead })) }),
        ...rows.map(r => new TableRow({
          children: r.map((c, i) => cell(
            typeof c === 'object' ? c.t : c, widths[i],
            typeof c === 'object' ? c : {})) })),
      ],
    });
  }

  const gap = () => new Paragraph({ children: [run('')], spacing: { after: 90 } });
  return { run, body, mix, h1, h2, item, table, gap };
}

/* ══════════════════ ① 한국어 대조 보고서 ══════════════════ */
function buildKorean() {
  const K = makeDoc(FONT_KO);
  const { run, body, mix, h1, h2, item, table, gap } = K;
  const stop  = (t, l) => item('!', STOP,  t, l, { fill: 'FBE6E6', border: STOP });
  const warn  = (t, l) => item('?', WAIT,  t, l, { fill: 'FAF0D8' });
  const info  = (t, l) => item('·', TODO,  t, l);
  const ok    = (t, l) => item('✔', DONE,  t, l);
  const c = [];

  c.push(new Paragraph({ children: [run('MANGOI · 강사 명부 반영', { bold: true, size: 17, color: MANGO })], spacing: { after: 80 } }));
  c.push(...h1('강사 명부를 관리자 페이지에 넣었습니다',
    '2026-08-14 · 원본: Teacher_Info_EN 시트(25행) · 관리자 → 강사 자료에 반영 완료'));
  c.push(body(mix(['시트에 적힌 ', ['25명 전원'], ' 의 연락처·근무시간·MBTI 를 관리자 페이지 강사 자료에 넣었습니다. '
    + '넣기 전 값은 ', ['docs/backup/teacher_profiles_변경전_2026-08-14.md'],
    ' 에 저장해 두었습니다 — 언제든 되돌릴 수 있습니다. ⚠️ ',
    ['비밀번호는 넣지도, 이 문서에 적지도 않았습니다.']])));

  c.push(table([2300, 2300, 2300, 2300],
    ['항목', '넣기 전', '넣은 뒤', ''],
    [
      ['이메일',   { t: '21명', center: true }, { t: '25명', center: true, color: DONE, bold: true }, { t: '완료', center: true, color: DONE }],
      ['전화번호', { t: '21명', center: true }, { t: '25명', center: true, color: DONE, bold: true }, { t: '완료', center: true, color: DONE }],
      ['근무시간', { t: '21명', center: true }, { t: '25명', center: true, color: DONE, bold: true }, { t: '완료', center: true, color: DONE }],
      ['MBTI',     { t: '18명', center: true }, { t: '25명', center: true, color: DONE, bold: true }, { t: '완료', center: true, color: DONE }],
      ['카카오ID', { t: '20명', center: true }, { t: '24명', center: true, color: WAIT, bold: true }, { t: 'JP 1명 남음', center: true, color: WAIT }],
    ], { centerHead: true }));

  /* ── 무엇을 넣었나 ── */
  c.push(h2('1.  무엇을 넣었나', '10명 · 나머지 15명은 이미 같아서 안 건드렸습니다'));
  c.push(table([1900, 3600, 3700],
    ['이름', '넣기 전', '넣은 뒤'],
    [
      ['Manager Maimai', '전화·이메일·카카오·근무시간 전부 비어 있음', '시트 값 전부 채움'],
      ['Manager Melca', '전화·이메일·카카오·근무시간 전부 비어 있음', '시트 값 전부 채움'],
      ['IT Karl', '전화·이메일·카카오·근무시간 전부 비어 있음', '시트 값 전부 채움'],
      ['Teacher Cindy', '카카오ID 없음', 'TeacherCindy'],
      ['Teacher Wan', { t: '전화 9675794577 (앞의 0 빠짐)', color: STOP }, { t: '0967-579-4577 로 바로잡음', color: DONE }],
      ['Teacher Farrah', '이름이 «Teacher Far» · 근무 14:00-23:00', '«Teacher Farrah» · 14:00-22:00'],
      ['Teacher Krystel', '근무 14:00-23:00', '14:00-21:20'],
      ['Teacher Win', '근무 14:00-22:00 (수 18시까지)', { t: '18:20-22:00 (수 18시까지) — 3번 확인 요망', color: WAIT }],
      ['Teacher Janice', 'MBTI 없음', 'ENTJ'],
      ['Teacher JP', 'MBTI 없음', 'ENTP'],
    ]));
  c.push(gap());
  c.push(info('일부러 «안» 넣은 것 하나 — Teacher JP 의 카카오ID', [
    mix(['시트의 카카오 칸에 ', ['jpsimbajon86@gmail.com'], ' 이라고 적혀 있습니다. '
      + '이메일 주소지 카카오ID 가 아닙니다. 그대로 넣으면 카카오로 연락할 때 실패합니다. '
      + '진짜 카카오ID 를 받으면 그때 넣겠습니다.']),
  ]));
  c.push(gap());
  c.push(info('시트 쪽을 고쳐야 하는 것 — Teacher Krystel 의 이메일', [
    mix(['시트에는 ', ['«alesha mayer@yahoo.com»'], ' 처럼 가운데 빈칸이 있습니다. 이 주소로는 메일이 안 갑니다. '
      + '시스템에는 빈칸 없이 ', ['aleshamayer@yahoo.com'], ' 으로 들어 있어 ', ['시스템 쪽이 맞습니다.'],
      ' 시트를 고쳐 주세요.']),
  ]));

  /* ── 급한 것 ── */
  c.push(h2('2.  자료를 넣어도 해결되지 않는 것', '이 4명은 시트의 아이디로 로그인할 수 없습니다'));
  c.push(body(mix(['강사 ', ['자료'], ' 와 ', ['로그인 계정'], ' 은 서로 다른 것입니다. '
    + '시트의 MANGOI USER 칸에 적힌 아이디가 ', ['시스템에 아예 없습니다.'],
    ' 로그인 시도 기록조차 한 번도 없습니다 — 다른 아이디를 쓰고 계실 가능성이 큽니다.'])));
  c.push(table([1900, 1800, 2400, 3100],
    ['이름', '시트의 아이디', '로그인 계정', '수업 기록은 있음'],
    [
      ['Teacher Janice', 'mangoi_026', { t: '없음', color: STOP }, 'lms_janice (활동중)'],
      ['Teacher JP', 'mangoi_029', { t: '없음', color: STOP }, 'lms_jp (활동중)'],
      ['Teacher Jenny', 'mangoi_148', { t: '없음', color: STOP }, '정규수업 전용'],
      ['Teacher Jinette', 'mangoi_157', { t: '없음', color: STOP }, '정규수업 전용'],
    ]));
  c.push(gap());
  c.push(stop('IT 칼 — 시트의 아이디가 실제와 다릅니다', [
    mix(['시트에는 ', ['mangoi_045'], ' 라고 적혀 있는데, 실제로 쓰는 계정은 ', ['mgr_karl'],
      ' 입니다(로그인 기록도 이 아이디로 남아 있습니다). ', ['시트를 고쳐 주세요.']]),
  ]));
  c.push(gap());
  c.push(stop('계정이 두 개입니다 — 대문자 M 하나 차이', [
    mix([['Mangoi_168'], ' 과 ', ['mangoi_168'], ' 이 둘 다 있습니다. 비밀번호도 서로 다릅니다. '
      + '어느 것이 진짜 Teacher Len 인지 확인한 뒤 나머지는 지우는 편이 안전합니다 — ',
      ['남겨 두면 나중에 «로그인이 안 된다» 는 신고로 돌아옵니다.']]),
  ]));

  /* ── 확인 필요 ── */
  c.push(h2('3.  딱 하나, 답을 주셔야 하는 것', 'Teacher Win 의 근무시간'));
  c.push(warn('시트의 두 칸이 서로 어긋납니다', [
    mix(['시트의 «근무 요일» 칸: ', ['«Mon, Tue, Until 6pm only for Wednesday, Thu, Fri»']]),
    mix(['시트의 «근무 시간» 칸: ', ['«18:20-22:00»']]),
    mix(['수요일은 ', ['18시까지'], ' 인데 근무 시작이 ', ['18시 20분'], ' 입니다. '
      + '그대로 읽으면 ', ['수요일은 일할 수 있는 시간이 0분'], ' 입니다.']),
    mix(['일단 시트에 적힌 두 가지를 모두 남겨 «18:20-22:00 (Wed until 18:00 only)» 로 넣었습니다. ',
      ['어느 쪽이 맞는지 마이마이에게 물어봐 주세요.'], ' 답을 주시면 1분이면 고칩니다.']),
  ]));

  /* ── 시트에 없는 사람 ── */
  c.push(h2('4.  시스템에는 «활동중» 인데 시트에 없는 8명', '정리가 필요합니다'));
  c.push(body(mix(['이미 그만두신 분이라면 ', ['«활동중» 을 꺼야'], ' 자동배정 후보에서 빠집니다. ',
    ['제 판단으로 끄지 않았습니다'], ' — 누가 재직 중인지는 사람이 압니다.'])));
  c.push(table([4600, 4600],
    ['시스템에만 있는 이름', '상태'],
    [
      ['FAYE · HT FARRAH · JED · Mo', '연락처 전부 비어 있음'],
      ['Teacher Rica', '근무시간만 있음 (월~금 14:00-22:00)'],
      ['강선생님 · 중국어 강선생님 · 중국어 손선생님', '한국어·중국어 강사 — 이 시트의 대상이 아닐 수 있음'],
    ]));

  /* ── 비밀번호 ── */
  c.push(h2('5.  비밀번호 점검', '따로 봐 주십시오'));
  c.push(ok('좋은 소식 — 시스템의 비밀번호는 «암호화» 되어 저장되고 있습니다', [
    '누가 데이터베이스를 통째로 본다 해도 비밀번호 자체는 읽을 수 없습니다. 이 부분은 안전합니다.',
  ]));
  c.push(gap());
  c.push(stop('위험한 것 — 시트에 비밀번호가 «그대로» 적혀 있습니다', [
    mix(['이 구글 시트는 링크가 있으면 열립니다. 시트에는 ', ['아이디와 비밀번호가 나란히'],
      ' 적혀 있어서, 링크가 한 번 새어 나가면 ', ['25개 계정이 전부'], ' 열립니다. '
      + '시스템을 아무리 잘 지켜도 이 시트 하나로 무너집니다.']),
    mix([['그리고 3개 계정의 비밀번호가 네 자리 숫자 하나로 똑같습니다.'],
      ' 그중 실제로 쓰이는 계정이 하나 있습니다(Manager Melca). '
      + '어느 것인지는 이 문서에 적지 않겠습니다 — 시트를 보시면 바로 아십니다.']),
  ]));
  c.push(gap());
  c.push(info('제안 — 셋 중 하나만 하셔도 크게 좋아집니다', [
    mix([['①'], ' 시트에서 ', ['PASSWORD 칸을 통째로 지웁니다.'],
      ' 비밀번호는 각자 알고 있으면 됩니다. 잊으면 새로 정해 주면 됩니다.']),
    mix([['②'], ' 시트 공유를 ', ['«링크 아는 사람»'], ' 에서 ', ['«지정한 사람»'], ' 으로 바꿉니다.']),
    mix([['③'], ' 네 자리 숫자 비밀번호 3개를 바꿉니다. 특히 지금 실제로 쓰이는 하나는 꼭 바꿔 주세요.']),
  ]));

  /* ── 할 일 ── */
  c.push(h2('6.  정리 — 하실 일', '순서대로'));
  c.push(table([700, 5100, 3400],
    ['#', '할 일', '누가'],
    [
      ['1', 'Teacher Win 의 근무시간 — 어느 쪽이 맞는지 확인 (3번)', '마이마이'],
      ['2', '로그인 안 되는 4명 — 실제로 어떤 아이디를 쓰는지 확인', '마이마이'],
      ['3', 'Teacher JP 의 진짜 카카오ID 받기', '마이마이'],
      ['4', '시트의 칼 아이디를 mgr_karl 로 수정', '본사'],
      ['5', '시트의 크리스텔 이메일에서 빈칸 지우기 (시스템은 이미 정상)', '본사'],
      ['6', 'Mangoi_168 / mangoi_168 중 안 쓰는 것 정리', '본사'],
      ['7', '시트에서 PASSWORD 칸 삭제 + 공유 범위 축소', '사장님'],
      ['8', '시스템에만 있는 8명 — 그만둔 분은 «활동중» 끄기', '본사'],
    ]));
  c.push(gap());
  c.push(body(mix([['1·2·3번은 답을 받아야 손댈 수 있습니다.'],
    ' 나머지는 확인만 주시면 바로 반영하겠습니다.'])));

  return new Document({
    creator: 'Mangoi', title: '강사 명부 ↔ 시스템 대조 (2026-08-14)',
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1100, right: 1100, bottom: 1100, left: 1100 } } },
      children: c,
    }],
  });
}

/* ══════════════════ ② 영문 — 강사가 직접 확인하는 양식 ══════════════════ */
function buildEnglish() {
  const K = makeDoc(FONT_EN);
  const { run, body, mix, h1, h2, item, table, gap } = K;
  const ask = (t, l) => item('☐', INK3, t, l, { fill: 'FDF0E2', border: MANGO });
  const c = [];

  c.push(new Paragraph({ children: [run('MANGOI · TEACHER INFORMATION', { bold: true, size: 17, color: MANGO })], spacing: { after: 80 } }));
  c.push(...h1('Please Check Your Own Information',
    'August 14, 2026 · 5 minutes · please return this to Manager Maimai'));
  c.push(body([run(
    'Hello! We keep your phone number, email and working hours in our system. '
    + 'We use them to send you class alerts and to give you the right classes. '
    + 'Some of them do not match our list, so please check your own line and fix anything that is wrong.',
    { size: 22, color: INK2 })]));

  c.push(item('!', WAIT, 'Why this matters', [
    mix(['If your phone number or email is wrong, ', ['you will not get the alert'],
      ' when a class is given to you. If your working hours are wrong, you may get classes ',
      ['at the wrong time'], ' — or no classes at all.']),
  ], { fill: 'FAF0D8' }));

  c.push(h2('1.  Write your information here', 'please use a pen and write clearly'));
  const line = (label, hint) => [label, { t: hint || '', color: INK3, size: 18 }];
  c.push(table([3000, 6200],
    ['What', 'Please write it here'],
    [
      line('Your name', ''),
      line('Your Mangoi login ID', 'example: mangoi_000'),
      line('Mobile number', 'please start with 0  ·  example: 0917-123-4567'),
      line('Email', 'no spaces inside the address'),
      line('KakaoTalk ID', 'the Kakao ID — not your email'),
      line('Days you work', 'Mon Tue Wed Thu Fri Sat Sun'),
      line('Hours you work', 'example: 14:00-22:00'),
      line('Is that Korea time or Philippine time?', 'KST (Korea)  /  PHT (Philippines)'),
    ]));

  c.push(h2('2.  Please answer these', '6 questions'));
  c.push(ask('Can you log in with the ID above?', [
    'Please try one time today. Some IDs on our list do not work.',
    mix([['If you cannot log in'], ', write down what the screen says and tell Maimai.']),
  ]));
  c.push(gap());
  c.push(ask('Is your mobile number the same one you use now?', [
    'If you changed your number, please write the new one. We send class alerts by SMS.',
  ]));
  c.push(gap());
  c.push(ask('Is your email correct?', [
    mix(['Please read it letter by letter. One person had ', ['a space inside the address'],
      ', so no email could arrive.']),
  ]));
  c.push(gap());
  c.push(ask('Are your working hours correct?', [
    mix(['Three teachers have ', ['different hours'], ' on our two lists. Please write the hours you ',
      ['really'], ' work.']),
  ]));
  c.push(gap());
  c.push(ask('Do you have any day that is different?', [
    'For example: “Wednesday only until 6 pm”, or “Saturday from 10:00”. Please write it.',
  ]));
  c.push(gap());
  c.push(ask('Is your password still 4 numbers?', [
    mix(['If yes, please change it to something longer. ', ['Do not write your password on this paper.'],
      ' Just tick this box after you change it.']),
  ]));

  c.push(h2('3.  When you are done', ''));
  c.push(body(mix(['Give this paper back to ', ['Manager Maimai'],
    '. She will send it to the office and we will fix the system.'])));
  c.push(body(mix([['Thank you!'], ' This takes you five minutes, and it stops the '
    + '“I did not get the message” problem for the whole year.'])));

  c.push(new Paragraph({ children: [run('')], spacing: { before: 260, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'DFE3E8', space: 6 } } }));
  c.push(body([run('Office use only — checked by: ______________    date: ______________',
    { size: 19, color: INK3 })]));

  return new Document({
    creator: 'Mangoi', title: 'Please Check Your Own Information',
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1100, right: 1100, bottom: 1100, left: 1100 } } },
      children: c,
    }],
  });
}

const out = process.argv[2] || '.';
Packer.toBuffer(buildKorean()).then(b => {
  fs.writeFileSync(out + '/강사명부_시스템_대조_2026-08-14.docx', b);
  console.log('① 한국어 대조 보고서', b.length, 'bytes');
  return Packer.toBuffer(buildEnglish());
}).then(b => {
  fs.writeFileSync(out + '/Teacher_Info_Check_2026-08-14_EN.docx', b);
  console.log('② 영문 확인 양식', b.length, 'bytes');
});
