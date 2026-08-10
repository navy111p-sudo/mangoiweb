#!/usr/bin/env node
/**
 * 📚 수업 첫 화면 = 강사가 올린 교재 (2026-08-06 사장님 지시)
 *
 * 사고 내용
 *   사장님: "나갔다 들어오니까 교재가 다른 게 보여. 처음 입장할 때 그대로 보이게 해줘."
 *           "수업 입장하면 교사가 올린 교재로 무조건 보이고, 교재가 없으면
 *            «Please, wait. 잠시 기다려 주세요» 만 미스터망고와 함께 나오게."
 *
 *   원인 두 겹.
 *   ① 서버(DO)가 «방이 0명이 되면» 공유 교재 상태(pdfState)를 지웠다.
 *      방이 비는 가장 흔한 이유는 수업 종료가 아니라 새로고침·순단이다.
 *      → 재입장하면 방에 교재가 없다.
 *   ② 그 빈자리를 클라이언트가 «학생 배정 교재»(없으면 'Mangoi Books')로 채우고
 *      방에 공유까지 했다. 강사 계정은 배정이 없으니 항상 'Mangoi Books' 를 띄워
 *      강사가 보던 교재를 덮어썼다. = 들어올 때마다 '다른 교재'.
 *
 * 이 하니스가 지키는 것
 *   - 방이 비어도 공유 교재를 지우지 않을 것 (재입장 = 그 교재 그 페이지)
 *   - 낡은 상태는 «시각(mediaAt)» 으로만 버릴 것 (며칠 전 교재 하이재킹 방지의 짝)
 *   - 입장 시 배정 교재를 «자동으로» 띄우거나 공유하지 말 것
 *   - 교재가 없으면 미스터망고 대기 카드가 뜨고, 한/영이 둘 다 있을 것
 *   - 교재가 도착하면 카드가 사라지는 경로가 살아 있을 것
 */
import { readFileSync, existsSync } from 'node:fs';
import { readPageSource } from './page-source.mjs';   // 분해 대응: 페이지 코드 전체를 읽는다
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const HTML = readPageSource('index.html');
const DO   = readFileSync(join(ROOT, 'cloudflare-deploy/src/video-call-room.ts'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok) => { if (ok) { PASS++; console.log('  ✅ ' + name); } else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name); } };

console.log('\n════════ 수업 첫 화면 · 강사 교재 유지 ════════\n');

/* ── 1. 서버(DO): 방이 비어도 교재를 지우지 않는다 ───────────────── */
console.log('▶ 1. Durable Object — 공유 상태 보존');
{
  // handleLeaveRoom 안에서 pdfState 를 지우면 새로고침 한 번에 교재가 사라진다.
  const leave = DO.slice(DO.indexOf('private handleLeaveRoom'), DO.indexOf('private handleClassLock'));
  check('① 퇴장(방 0명)에서 pdfState 를 삭제하지 않는다',
    leave.length > 100 && !/storage\.delete\('pdfState'\)/.test(leave));
  check('② 퇴장에서 videoState 도 삭제하지 않는다',
    leave.length > 100 && !/storage\.delete\('videoState'\)/.test(leave));

  const join = DO.slice(DO.indexOf('private handleJoinRoom'), DO.indexOf('private handleLeaveRoom'));
  /* 🪤 (2026-08-11) 예전엔 «userCount<=1 로부터 200자 안에 mediaAt» 이라는 글자 거리로 봤다.
     그래서 조건을 하나 더 늘리는 «옳은» 수정(빈 시간 기준 추가)에 이 검사가 깨졌다.
     지켜야 할 규칙은 거리가 아니라 «무조건 지우지 않는다» 이다 —
     삭제를 감싼 if 조건에 사람 수 + 시간 판단이 둘 다 들어 있는지만 본다. */
  {
    const di = join.indexOf("storage.delete('pdfState')");
    const guard = di > 0 ? join.lastIndexOf('if (', di) : -1;
    const cond = guard > 0 ? join.slice(guard, di) : '';
    check('③ 첫 입장 정리는 조건부다 — 사람 수 + 시간 판단 (무조건 삭제 금지)',
      di > 0 && /userCount <= 1/.test(cond) && /(mediaAt|emptyAt)/.test(cond),
      '조건: ' + cond.replace(/\s+/g, ' ').slice(0, 160));
  }
  check('④ 보존 한도 상수(SHARE_KEEP_MS)가 있고 1시간 이상이다',
    /SHARE_KEEP_MS\s*=\s*(\d+)\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(DO) &&
    Number(DO.match(/SHARE_KEEP_MS\s*=\s*(\d+)\s*\*\s*60\s*\*\s*60\s*\*\s*1000/)[1]) >= 1);
  check('⑤ 입장 시 현재 교재를 재전송한다 (pdf-sync)',
    /if \(this\.pdfState\) this\.send\([^)]*\{ type: 'pdf-sync'/.test(DO));
}

/* ── 2. 공유·페이지 이동마다 보존 시계를 다시 감는다 ─────────────── */
console.log('\n▶ 2. mediaAt 스탬프');
{
  const share = DO.slice(DO.indexOf('private async handlePdfShare'), DO.indexOf('private async handlePdfStopShare'));
  check('⑥ 교재 공유 시 mediaAt 저장', /mediaAt = Date\.now\(\)[\s\S]{0,300}put\('mediaAt'/.test(share));
  check('⑦ 페이지 넘김도 mediaAt 갱신 (수업 진행 중 증거)',
    /pdfState\.currentPage = pageNum;[\s\S]{0,300}mediaAt = Date\.now\(\)/.test(DO));
  check('⑧ 재기동 복원 시 mediaAt 도 읽는다',
    /storage\.get<number>\('mediaAt'\)/.test(DO));
  check('⑨ 동영상 공유도 mediaAt 갱신', /videoState = \{ url, type[\s\S]{0,200}mediaAt = Date\.now\(\)/.test(DO));
}

/* ── 3. 클라이언트: 배정 교재를 «자동으로» 띄우지 않는다 ─────────── */
console.log('\n▶ 3. 입장 자동 로드 금지');
{
  // 정의는 남겨도 된다(수동 호출용). 금지되는 것은 «자동 호출».
  check('⑩ 입장 경로에서 vcAutoLoadStudentTextbook() 을 부르지 않는다',
    !/vcAutoLoadStudentTextbook\(\)\s*\.then/.test(HTML));
  check('⑪ 자동 공유(입장 직후 vcShareTextbook 재시도 루프)가 없다',
    !/_tryShare\(\s*8\s*\)/.test(HTML) || !/vcAutoLoadStudentTextbook\(\)\s*\.then/.test(HTML));
  check('⑫ 입장 첫 탭은 교재 탭이다', /onEnterCall[\s\S]{0,600}vcSwitchTab && window\.vcSwitchTab\('pdf'\)/.test(HTML));
}

/* ── 4. 대기 카드 — 미스터망고 + 한/영 ───────────────────────────── */
console.log('\n▶ 4. 「잠시만 기다려 주세요」 카드');
{
  check('⑬ #vc-wait-card 가 교재 영역(.pdf-main-row) 안에 있다',
    /class="pdf-main-row"[\s\S]{0,2000}id="vc-wait-card"[\s\S]{0,1200}<\/div>\s*<\/div>\s*<\/div>/.test(HTML));
  check('⑭ 미스터망고 이미지(/img/mango-char.png)를 쓴다',
    /id="vc-wait-mango"[^>]*src="\/img\/mango-char\.png"/.test(HTML));
  check('⑮ 그 이미지 파일이 실제로 있다',
    existsSync(join(ROOT, 'cloudflare-deploy/public/img/mango-char.png')));
  check('⑯ 한글 「잠시만 기다려 주세요」가 있다', /잠시만 기다려 주세요/.test(HTML));
  check('⑰ 영어 「Please wait」가 함께 있다 (강사 다수 필리핀)', /vwc-en">Please wait\./.test(HTML));
  check('⑱ 기본이 opacity:0 이 아니다 (백그라운드 탭에서 영영 안 보이는 사고 방지)',
    !/#vc-wait-card\s*\{[^}]*opacity\s*:\s*0/.test(HTML));
  check('⑲ 클릭을 막지 않는다 (pointer-events:none — 아래 버튼 그대로 눌림)',
    /#vc-wait-card\{[\s\S]{0,400}pointer-events:none/.test(HTML));
  check('⑳ 라이트 테마 대비 규칙이 있다', /body\.vc-theme-light #vc-wait-card/.test(HTML));
}

/* ── 5. 교재가 도착/중단되면 카드가 따라 사라지고 되돌아온다 ─────── */
console.log('\n▶ 5. 카드 표시 동기화');
{
  check('㉑ vcWaitCardSync 가 정의돼 있다', /window\.vcWaitCardSync\s*=\s*function/.test(HTML));
  check('㉒ 교재가 있으면(_vcCurrentPdfUrl) 카드를 숨긴다',
    /function hasContent\(\)[\s\S]{0,400}_vcCurrentPdfUrl/.test(HTML));
  check('㉓ 공유 수신 직후(로드 완료 전 _vcShownPdfKey)도 «있음»으로 본다',
    /function hasContent\(\)[\s\S]{0,400}_vcShownPdfKey/.test(HTML));
  check('㉔ 주기 감시(setInterval)로 어떤 경로로 열려도 사라진다',
    /setInterval\(function\(\)\{ window\.vcWaitCardSync\(\); \}/.test(HTML));
  check('㉕ 공유 중지(pdf-stop-share) 시 _vcCurrentPdfUrl 을 비워 카드가 다시 나온다',
    /case 'pdf-stop-share':[\s\S]{0,600}_vcCurrentPdfUrl = ''/.test(HTML));
  check('㉖ 관찰자(관리자 참관) 화면엔 카드를 띄우지 않는다',
    /show\s*=\s*inCall && onPdf && !hasContent\(\) && !window\._vcObserverMode/.test(HTML));
}

console.log(`\n─────────────────────────────────────────────`);
console.log(`  ✅ PASS ${PASS}    ⚠ FAIL ${FAIL}   (총 ${PASS + FAIL})`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
