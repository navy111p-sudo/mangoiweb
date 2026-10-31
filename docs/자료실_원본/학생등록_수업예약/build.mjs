// 📗 관리자 자료실 «학생 등록 → 수업 예약 단계별 안내» PDF 만들기 (2026-10-08)
//
//   왜 — 필리핀 매니저 문의: "there is no content explaining how to register and schedule a
//   student". 관리자 자료실의 기존 자료(동영상·사용설명서·쉬운 사용법)는 «결제하면 수업이 자동
//   생성» 같은 개요만 있고, 직원이 «한 학생을 손으로 등록하고 수업을 잡는» 순서가 없었다.
//
//   만드는 법 (리포 루트에서)
//     1) cd cloudflare-deploy/public && python3 -m http.server 8977   (다른 창)
//     2) node "docs/자료실_원본/학생등록_수업예약/capture.mjs" <캡처폴더>
//          → 실제 화면 파일(admin.html · admin/student.html)을 그대로 띄우고 API 만 «시험용 가짜
//            데이터»(Emma Kim · Teacher Anna …)로 대신해 KO/EN 각 8장을 찍는다.
//            ⚠️ mangoi.ai 는 작업 컨테이너 프록시가 막아 직접 못 연다 — 배포된 것과 같은 파일이다.
//            ⚠️ 실제 학생 정보를 쓰지 말 것 — 이 PDF 는 /library/ 밑이라 누구나 받을 수 있다.
//     3) node "docs/자료실_원본/학생등록_수업예약/build.mjs" <캡처폴더> <출력폴더>
//          → student-schedule-kr.pdf · student-schedule-en.pdf (A4)
//          글꼴: 이 컨테이너엔 한글 글꼴이 없어 Noto Sans KR 을 구글 폰트에서 받아(쓰는 글자만)
//          base64 로 심는다(CLAUDE.md 「한글이 든 화면을 PDF 로 뽑아야 할 때」).
//
//   ⛔ 화면 이름·순서를 바꾸면 이 문구도 함께 고칠 것 — 사실과 다른 안내서는 없는 것보다 나쁘다.
//      문구의 근거: admin.html #sm-add-student · #sm-register-modal / adm-core.js smSubmitRegisterStudent
//                   admin/student.html ns-* 폼(nsClassPick) / 학생 목록 행의 «📅 스케줄» 링크
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const CAP = resolve(process.argv[2] || 'cap');
const OUT = resolve(process.argv[3] || 'out');
mkdirSync(OUT, { recursive: true });

const T = {
  en: {
    file: 'student-schedule-en.pdf', htmlLang: 'en',
    title: 'Register a student and schedule classes',
    sub: 'Step-by-step guide for HQ / office staff · Admin page (mangoi.ai)',
    before: 'Before you start',
    beforeList: [
      'Use an <b>HQ or office staff</b> account. Teacher, branch and agency accounts cannot register students (the server refuses).',
      'All class times are <b>Korea time (KST)</b> — Philippine time is 1 hour earlier. (KST 19:30 = PH 18:30)',
      'This guide is for <b>one student at a time</b>. For many students at once, use <b>Students › Enrollment</b> (download a form → fill it in → upload → «Register all»).',
      'The screenshots use <b>sample data</b> (student “Emma Kim”, “Teacher Anna”). Your screen shows real names.'
    ],
    steps: [
      { h: 'Open the student list and press «➕ Add Student»', img: '01-add-button',
        p: ['Left menu <b>Students</b> → <b>Student Management</b> → open <b>Student List</b>.',
            'Press <b>➕ Add Student</b> (red box).',
            'Tip: search the name first. If the student is already in the list, <b>do not create a second account</b> — skip to Step 4.'] },
      { h: 'Fill in the student’s information', img: '02-form',
        p: ['<b>User ID</b> (required) — 4–20 characters, letters / numbers / underscore only. Use small letters (phones add capital letters by themselves).',
            '<b>Name</b> (required).',
            '<b>Password</b> — leave blank and the system makes a temporary one for you.',
            '<b>Parent Phone</b> — please fill it in. Class reminder texts go to this number; with no number, no text is sent.',
            '<b>Agency/Academy</b> — type a few letters and pick from the list. <b>Notes</b> — e.g. “Trial class”.',
            'Press <b>✅ Register</b>. If you see “a student with the same name and phone already exists”, use that existing ID instead (only press “Register anyway” for a different child, e.g. a sibling).'] },
      { h: 'Copy the password — it is shown only once', img: '03-created',
        p: ['“✅ … account created.” appears with the <b>temporary password</b>.',
            'Copy the ID and password now and send them to the parent. It is <b>not shown again</b> after you close this window.',
            'Close the window with <b>×</b>. The new student now appears in the list.'] },
      { h: 'Open the student’s Schedule', img: '03b-list-row',
        p: ['In the student’s row, press <b>📅 Schedule</b> (red box). The student detail page opens in a new tab, directly on the Schedule tab.',
            'You can also press <b>🎓 Details</b> and then the <b>📅 Schedule</b> tab (next picture).'] },
      { h: '(Other way) Student detail → «📅 Schedule» tab', img: '04-schedule-tab',
        p: ['On the student detail page, the tab bar is at the top. Press <b>📅 Schedule</b>.'] },
      { h: 'Fill in «Register Class» and press «Register»', img: '05-add-class',
        p: ['Scroll down to <b>➕ Register Class</b>.',
            '<b>Category</b> — <b>Regular (weekly)</b> repeats every week. <b>Make-up / Trial / Level test</b> are for <b>one day only</b> (then you pick one <b>Date</b> instead of days).',
            '<b>Days of the week</b> (Regular only) — tick every class day, e.g. Mon + Wed.',
            '<b>Start date</b> — the first class day. <b>Start</b> — class time in <b>KST</b>. <b>Minutes</b> — usually 20.',
            '<b>Instructor</b> — pick from the list. <b>Place</b> filters the list (Home / Office). Teachers who left are hidden.',
            'Press <b>Register</b>. If it warns “there is already a class at the same time”, check that teacher’s schedule first — only choose “Register anyway” if you are sure.'] },
      { h: 'Check the result', img: '06-added',
        p: ['“✅ 2 class(es) created.” appears, plus the <b>Next class</b> card and the next class dates.',
            'Regular classes show as “2x a week · Mon·Wed 19:30”. To change <b>one day</b>, tap that date; to change <b>every week</b>, press <b>✏️ Change weekly</b>.'] },
      { h: 'Done — teacher and student meet in the same room', img: '07-list',
        p: ['The booking is now on the teacher’s page and the student’s home screen.',
            'At class time, both just press <b>Join class</b> — they enter the <b>same room automatically</b>, no room code needed.',
            'If a class is missing on the teacher’s screen, check the <b>Instructor</b> and the <b>KST time</b> of the booking first.'] }
    ],
    foot: 'Mangoi Admin Library · Student registration & class scheduling · 2026-10-08'
  },
  ko: {
    file: 'student-schedule-kr.pdf', htmlLang: 'ko',
    title: '학생 등록 → 수업 예약, 단계별 안내',
    sub: '본사·사무실 직원용 · 관리자 페이지 (mangoi.ai)',
    before: '시작하기 전에',
    beforeList: [
      '<b>본사·직원 계정</b>으로 하세요. 강사·지사·대리점 계정은 학생을 등록할 수 없습니다(서버가 거절).',
      '수업 시각은 모두 <b>한국 시간(KST)</b> 입니다 — 필리핀은 1시간 늦습니다. (KST 19:30 = PH 18:30)',
      '이 안내는 <b>한 명씩</b> 등록하는 방법입니다. 여러 명을 한 번에 할 때는 <b>학생 › 수강신청</b>(양식 받기 → 작성 → 올리기 → «일괄 등록»)을 쓰세요.',
      '캡처의 학생·강사(“Emma Kim”, “Teacher Anna”)는 <b>시험용 가짜 데이터</b>입니다. 실제 화면에는 실제 이름이 나옵니다.'
    ],
    steps: [
      { h: '학생 목록을 열고 «➕ 학생 등록» 누르기', img: '01-add-button',
        p: ['왼쪽 메뉴 <b>학생</b> → <b>학생관리</b> → <b>학생 목록</b>을 펼칩니다.',
            '<b>➕ 학생 등록</b>(빨간 상자)을 누릅니다.',
            '팁: 먼저 이름으로 검색해 보세요. 이미 목록에 있는 학생이면 <b>계정을 또 만들지 말고</b> 4단계로 가세요.'] },
      { h: '학생 정보 입력', img: '02-form',
        p: ['<b>아이디</b>(필수) — 4~20자, 영문·숫자·밑줄(_)만. 소문자로 쓰세요(휴대폰이 첫 글자를 대문자로 바꿉니다).',
            '<b>이름</b>(필수).',
            '<b>비밀번호</b> — 비워 두면 임시 비밀번호가 자동으로 만들어집니다.',
            '<b>부모님 연락처</b> — 꼭 넣어 주세요. 수업 안내 문자가 이 번호로 갑니다(번호가 없으면 문자가 안 갑니다).',
            '<b>소속 대리점·학원명</b> — 몇 글자 치고 목록에서 고릅니다. <b>메모</b> — 예: “체험 수업”.',
            '<b>✅ 학생 등록</b>을 누릅니다. “같은 이름·같은 연락처의 학생이 이미 있습니다”가 뜨면 그 아이디를 쓰세요(형제처럼 다른 학생일 때만 «그래도 등록»).'] },
      { h: '비밀번호 복사 — 한 번만 보입니다', img: '03-created',
        p: ['“✅ … 계정을 만들었습니다.” 와 <b>임시 비밀번호</b>가 뜹니다.',
            '아이디·비밀번호를 지금 복사해 학부모님께 보내세요. 창을 닫으면 <b>다시 볼 수 없습니다.</b>',
            '<b>×</b> 로 창을 닫으면 목록에 새 학생이 보입니다.'] },
      { h: '그 학생의 스케줄 열기', img: '03b-list-row',
        p: ['학생 줄의 <b>📅 스케줄</b>(빨간 상자)을 누르면 새 탭에서 학생 상세의 스케줄 탭이 바로 열립니다.',
            '<b>🎓 상세</b>를 누른 뒤 <b>📅 스케줄</b> 탭을 눌러도 됩니다(다음 그림).'] },
      { h: '(다른 길) 학생 상세 → «📅 스케줄» 탭', img: '04-schedule-tab',
        p: ['학생 상세 화면 위쪽 탭 줄에서 <b>📅 스케줄</b>을 누릅니다.'] },
      { h: '«수업 예약 등록» 채우고 «등록» 누르기', img: '05-add-class',
        p: ['아래로 내려 <b>➕ 수업 예약 등록</b>으로 갑니다.',
            '<b>종류</b> — <b>정규수업(매주)</b>은 매주 반복됩니다. <b>보강·체험·레벨테스트</b>는 <b>그 하루만</b>입니다(요일 대신 <b>날짜</b> 하나를 고릅니다).',
            '<b>요일</b>(정규만) — 수업하는 요일을 모두 체크합니다. 예: 월 + 수.',
            '<b>시작일</b> — 첫 수업 날. <b>시작</b> — 수업 시각(<b>KST</b>). <b>분</b> — 보통 20분.',
            '<b>담당 강사</b> — 목록에서 고릅니다. <b>근무지</b>(홈/사무실)로 목록을 좁힐 수 있고, 퇴사 강사는 감춰져 있습니다.',
            '<b>등록</b>을 누릅니다. “같은 시간에 이미 예약이 있습니다”가 뜨면 그 강사 일정을 먼저 확인하세요. 확실할 때만 «그래도 등록».'] },
      { h: '결과 확인', img: '06-added',
        p: ['“✅ 예약 2건이 등록됐습니다.” 와 <b>다음 수업</b> 카드, 앞으로의 수업 날짜가 보입니다.',
            '정규수업은 “주 2회 · 월·수 19:30” 처럼 보입니다. <b>하루만</b> 바꾸려면 그 날짜를 누르고, <b>매주</b> 바꾸려면 <b>✏️ 매주 변경</b>을 누릅니다.'] },
      { h: '끝 — 강사와 학생이 같은 방에서 만납니다', img: '07-list',
        p: ['이제 예약이 강사 화면과 학생 홈 화면에 보입니다.',
            '수업 시간에 둘 다 <b>수업 입장</b>만 누르면 <b>방 코드 없이 같은 방</b>으로 자동 입장합니다.',
            '강사 화면에 수업이 안 보이면 예약의 <b>담당 강사</b>와 <b>KST 시각</b>부터 확인하세요.'] }
    ],
    foot: '망고아이 관리자 자료실 · 학생 등록·수업 예약 안내 · 2026-10-08'
  }
};

function html(lang, fontCss) {
  const t = T[lang];
  const img = n => 'file://' + join(CAP, `${lang}-${n}.jpg`);
  return `<!doctype html><html lang="${t.htmlLang}"><head><meta charset="utf-8"><title>${t.title}</title>
<style>${fontCss}
@page{size:A4;margin:14mm 13mm 14mm}
*{box-sizing:border-box}
body{margin:0;font-family:'Noto Sans KR','Noto Color Emoji',sans-serif;color:#1f2937;font-size:11.5pt;line-height:1.55}
.cover{border-bottom:3px solid #f59e0b;padding-bottom:10px;margin-bottom:12px}
h1{font-size:21pt;margin:0;color:#111827;font-weight:800}
.sub{color:#6b7280;margin-top:4px;font-size:10.5pt}
.box{background:#fff7ed;border:1px solid #fdba74;border-radius:10px;padding:10px 14px;margin:10px 0 4px}
.box h2{margin:0 0 4px;font-size:12.5pt;color:#9a3412}
.box ul{margin:0;padding-left:18px}.box li{margin:2px 0}
.step{break-inside:avoid;page-break-inside:avoid;margin:16px 0 4px}
.step h3{display:flex;align-items:center;gap:10px;font-size:14pt;margin:0 0 6px;color:#111827;font-weight:800}
.num{flex:0 0 auto;width:30px;height:30px;border-radius:50%;background:#f59e0b;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13pt}
.step ul{margin:0 0 8px;padding-left:20px}.step li{margin:2px 0}
.shot{display:block;max-width:100%;max-height:86mm;margin:0 auto;border:1px solid #d1d5db;border-radius:8px}
.foot{margin-top:18px;color:#9ca3af;font-size:9pt;text-align:center}
</style></head><body>
<div class="cover"><h1>${t.title}</h1><div class="sub">${t.sub}</div></div>
<div class="box"><h2>${t.before}</h2><ul>${t.beforeList.map(x => `<li>${x}</li>`).join('')}</ul></div>
${t.steps.map((s, i) => `<div class="step"><h3><span class="num">${i + 1}</span>${s.h}</h3>
<ul>${s.p.map(x => `<li>${x}</li>`).join('')}</ul><img class="shot" src="${img(s.img)}"></div>`).join('\n')}
<div class="foot">${t.foot}</div>
</body></html>`;
}

async function fontCss(text) {
  // 굵기마다 따로 받는다 — text= 와 여러 굵기를 한 번에 주면 400 이 난다(CLAUDE.md 2장).
  let css = '';
  for (const w of [400, 700, 800]) {
    const url = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent('Noto Sans KR') + ':wght@' + w + '&text=' + encodeURIComponent(text);
    const c = execFileSync('curl', ['-sS', '-A', 'Mozilla/5.0 Chrome/120', url]).toString();
    let out = c;
    for (const m of c.matchAll(/url\((https:[^)]+)\)/g)) {
      const b = execFileSync('curl', ['-sS', m[1]]);
      out = out.replace(m[1], 'data:font/woff2;base64,' + b.toString('base64'));
    }
    css += out + '\n';
  }
  return css;
}

const req = createRequire('/opt/node22/lib/node_modules/playwright/package.json');
const { chromium } = req('playwright');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const lang of ['ko', 'en']) {
  const plain = html(lang, '').replace(/<[^>]+>/g, '');
  const chars = [...new Set(plain + T.en.foot + '0123456789')].join('');
  const doc = html(lang, await fontCss(chars));
  const tmp = join(OUT, `_${lang}.html`);
  writeFileSync(tmp, doc);
  const page = await browser.newPage();
  await page.goto('file://' + tmp, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: join(OUT, T[lang].file), format: 'A4', printBackground: true, preferCSSPageSize: true });
  await page.close();
  console.log('PDF', T[lang].file);
}
await browser.close();
