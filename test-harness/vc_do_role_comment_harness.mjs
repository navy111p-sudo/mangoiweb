/* ═══════════════════════════════════════════════════════════════════════════
   📝 화상수업 DO 의 «역할 판정» 주석이 사실을 말하는지 감시 (2026-09-01 신설)

   [무엇을 막나] `video-call-room.ts` 의 강사 권한 판정은 소켓 attachment 의 `role` 을 보는데,
   **그 값은 클라이언트가 `join-room` 에 실어 보낸 것**입니다(`role: role || 'student'`).
   WebSocket 업그레이드 시점의 attachment 에는 role 이 없고, 서버가 그 값을 검증하지 않습니다.

   그런데 이 파일에는 오래도록 이렇게 적혀 있었습니다:
     · 「판정은 소켓 attachment 의 role 로 한다(**클라이언트가 보내는 값이 아니다**)」
     · 「**학생이 위조 전송해도 통하지 않는다**」
   둘 다 **사실이 아닙니다.** 그리고 그렇게 적혀 있었기 때문에 아무도 여기를 다시 안 봤습니다
   — 규칙서 2장 「문서에 «고쳤다» 고 적혀 있는데 같은 사고가 또 남」 그대로입니다.

   [이 파일은 공동 금지구역입니다] 그래서 2026-09-01 에는 **주석만** 고쳤습니다(코드 0줄).
   진짜 수리(입장 토큰 + 서버가 역할 결정)는 「수업이 절대 안 끊김」과 부딪히므로
   사람이 결정할 일입니다 — 📄 docs/화상수업DO_점검보고_2026-09-01.md

   [검사 방법] «거짓 단정이 되살아났는가» 를 봅니다. 주석은 코드가 아니라서 타입체크도
   테스트도 못 잡습니다 — 그래서 이 검사가 유일한 방어선입니다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'src', 'video-call-room.ts');
let pass = 0, fail = 0;
const ok = (n) => { console.log('  ✅ ' + n); pass++; };
const no = (n, w) => { console.log('  ❌ ' + n + (w ? '\n       ' + w : '')); fail++; };
const check = (n, c, w) => (c ? ok(n) : no(n, w));

const raw = readFileSync(SRC, 'utf8');

/** 주석만 남긴 사본 — «주석이 무엇을 주장하는가» 를 봐야 하므로 코드를 걷어낸다.
 *  (평소와 반대다: 보통은 주석을 걷어내지만, 여기서는 주석 자체가 검사 대상이다.) */
function commentsOnly(src) {
  let out = '', i = 0; const n = src.length;
  let inS = 0, q = '';
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (inS) {
      if (c === '\\') { i += 2; continue; }
      if ((inS === 1 && c === q) || (inS === 2 && c === '`')) inS = 0;
      i++; continue;
    }
    if (c === '"' || c === "'") { inS = 1; q = c; i++; continue; }
    if (c === '`') { inS = 2; i++; continue; }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') out += src[i++]; out += '\n'; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) out += src[i++]; out += '\n'; i += 2; continue; }
    i++;
  }
  return out;
}
const cmt = commentsOnly(raw);

/** 앵커로 자르되 «그 앵커가 유일한지» 를 함께 본다.
 *  ⚠️ 규칙서 2장 「앵커를 «본문 글자» 로 잡으면 그 위 주석 블록에 먼저 걸린다」 —
 *     실제로 밟았다: 「storage 에 넣지 않는다」 는 이 파일에 **두 곳**(필드 선언 89행 ·
 *     recordWb 942행)이라 indexOf 가 엉뚱한 쪽을 잘랐고, 정정문이 멀쩡히 들어가 있는데도
 *     C절 3건이 빨간불이었다. 유일하지 않으면 «못 찾음» 이 아니라 «검사가 고장» 이므로
 *     그 사실을 따로 알린다. */
function sliceAt(anchor, len) {
  const hits = cmt.split(anchor).length - 1;
  if (hits !== 1) return { seg: '', hits };
  return { seg: cmt.slice(cmt.indexOf(anchor), cmt.indexOf(anchor) + len), hits };
}

console.log('\n[ A. 「위조를 막는다」는 거짓 단정이 되살아나지 않았다 ]');
{
  /* ⚠️ 낱말만 찾으면 안 된다 — 정정 주석 자체가 그 문구를 «인용» 하고 있어서 걸린다.
     (규칙서 2장 「부정 검사가 자기 주석을 잡는다」의 사촌이고, 여기서는 인용까지 있다.)
     그래서 «인용 표시(「」) 안에 있지 않은» 단정만 센다. */
  const claims = [
    ['클라이언트가 보내는 값이 아니다', '그 role 이 곧 클라이언트가 보낸 값이다'],
    ['위조 전송해도 통하지 않는다', '학생이 role:teacher 로 접속하면 통과한다'],
    ['위조 전송해도 무시', '무시되지 않는다 — 그 값이 곧 판정 근거다'],
  ];
  const bare = [];
  for (const [claim, why] of claims) {
    for (const m of cmt.matchAll(new RegExp(claim, 'g'))) {
      // 그 문장이 「…」 인용 안에 있으면 «정정하면서 인용한 것» 이므로 봐준다
      const around = cmt.slice(Math.max(0, m.index - 60), m.index + claim.length + 10);
      const quoted = /「[^」]*$/.test(cmt.slice(Math.max(0, m.index - 60), m.index));
      if (!quoted) bare.push(`"${claim}" — ${why}\n         …${around.replace(/\s+/g, ' ').slice(0, 90)}…`);
    }
  }
  check('인용이 아닌 «거짓 단정» 이 없다', bare.length === 0,
    bare.join('\n       ')
    + '\n       → 이렇게 적혀 있으면 다음 사람이 「여긴 이미 막혀 있다」고 읽고 지나간다.');
}

console.log('\n[ B. 정본 자리(isStaffAtt)가 «어디서 오는 값인지» 를 설명한다 ]');
{
  const { seg, hits } = sliceAt('소켓 attachment 기준 강사·관리자 판정', 1600);
  check('isStaffAtt 주석을 «한 곳에서» 찾았다', seg.length > 200,
    hits === 0 ? '그 문구가 없다 — 구조가 바뀌었나?'
      : hits > 1 ? `그 문구가 ${hits}곳이라 어느 쪽인지 못 가린다 — 앵커를 더 좁힐 것`
        : '주석이 너무 짧다');
  check('role 이 join-room 에서 온다는 것을 적었다',
    /join-room/.test(seg) && /검증하는 곳이 없/.test(seg),
    '어디서 오는 값인지 안 적으면 「왜 못 믿는지」를 다음 사람이 다시 추적해야 한다');
  check('이 값으로 무엇이 열리는지 적었다',
    /교재/.test(seg) && /잠금/.test(seg),
    '반경을 안 적으면 «사소한 것» 으로 읽힌다');
  check('제대로 막는 방법과 그 위험을 함께 적었다',
    /서버가 붙여야|서버가 결정/.test(seg) && /끊김|로그로/.test(seg),
    '고치는 방법만 적고 위험을 안 적으면, 다음 사람이 수업을 못 열게 만든다');
  check('보고서를 가리킨다', /docs\/화상수업DO_점검보고/.test(seg),
    '근거 문서를 안 가리키면 이 주석만 남고 맥락이 사라진다');
}

console.log('\n[ C. hibernation 전제(«그때는 방도 비어 있다»)가 정정돼 있다 ]');
{
  /* ⚠️ 「storage 에 넣지 않는다」로 자르면 안 된다 — 89행 필드 선언에도 같은 말이 있다.
        ⚠️ 표시가 붙은 recordWb 쪽만 유일하게 걸린다. */
  const { seg, hits } = sliceAt('⚠️ storage 에 넣지 않는다', 1400);
  check('칠판 버퍼 주석을 «한 곳에서» 찾았다', seg.length > 100,
    hits === 0 ? '그 문구가 없다 — 구조가 바뀌었나?'
      : hits > 1 ? `그 문구가 ${hits}곳이라 어느 쪽인지 못 가린다` : '주석이 너무 짧다');
  check('«방도 비어 있다» 가 사실이 아니라고 적었다',
    /사실이 아닙니다|틀렸/.test(seg) && /Hibernation|hibernation/.test(seg),
    '소켓이 붙은 채로 잠드는 것이 hibernation 이다 — 방이 비지 않아도 버퍼가 사라진다');
  check('무엇이 복원되는지 적었다', /pdfState/.test(seg) && /잠금/.test(seg),
    '복원되는 것과 안 되는 것을 갈라 적어야 다음 사람이 헷갈리지 않는다');
  check('«얼마나 자주인지는 모른다» 고 적었다', /측정하지 못|모른다/.test(seg),
    '재 보지 않은 것을 단정하면 그것도 같은 종류의 거짓 주석이 된다');
}

console.log('\n────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n🚨 vc_do_role_comment_harness 실패'); process.exit(1); }
console.log('🎉 vc_do_role_comment_harness — 전부 통과');
