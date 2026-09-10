/* meet_room_code_harness.mjs — 회의방 번호 해석이 «두 곳에서 같은 말» 을 하는가 (2026-09-09)
 * ─────────────────────────────────────────────────────────────────────────────
 * [왜 있나 — 2026-09-09 사장님 제보]
 *   교사가 회의방 모달에 「1234」를 넣으면 실제 방 id 는 `meet-1234` 인데,
 *   학생이 로비 «⚙️ 방 코드 직접 입력» 에 같은 「1234」를 넣으면 방 id 가 `1234` 였다.
 *   → 두 사람이 서로 다른 방에서 각자 「참여자 1명」. **에러가 안 난다.**
 *   코드를 아예 안 넣으면 공용방(mangoi-class)으로 갔다.
 *
 * [무엇을 재나] «그 함수가 있는가» 가 아니라 **두 규칙을 실제로 돌려 답을 대조**한다.
 *   ① 모달(idx-vc-room.js)의 normalize()+PREFIX 를 소스에서 오려 내 실행
 *   ② 로비(idx-vc-roomcode.js)의 resolveRoomCode() 를 소스에서 오려 내 실행
 *   ③ 같은 입력에 같은 방 id 를 내는가 — 어느 쪽을 고쳐도 어긋나면 FAIL
 *   ④ 접두사가 있는 방(class-·demo-·room-·c24-·meet-·mangoi-class)은 손대지 않는가
 *   ⑤ 빈칸은 빈칸 그대로인가 (공용방 폴백은 예전 동작 그대로여야 한다)
 *   ⑥ 입장 직전 배선 — vcJoinRoom 래퍼가 실제로 그 해석을 쓰는가
 */
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const P_MODAL = ROOT + 'cloudflare-deploy/public/js/idx-vc-room.js';
const P_LOBBY = ROOT + 'cloudflare-deploy/public/js/idx-vc-roomcode.js';
const P_INDEX = ROOT + 'cloudflare-deploy/public/index.html';

const modalSrc = fs.readFileSync(P_MODAL, 'utf8');
const lobbySrc = fs.readFileSync(P_LOBBY, 'utf8');
const indexSrc = fs.readFileSync(P_INDEX, 'utf8');

let pass = 0, fail = 0;
const ok  = (t) => { pass++; console.log('  PASS ' + t); };
const bad = (t, why) => { fail++; console.log('  FAIL ' + t + (why ? ' — ' + why : '')); };
const is  = (t, got, want) => (String(got) === String(want) ? ok(t + ' = ' + JSON.stringify(got))
                                                           : bad(t, '기대 ' + JSON.stringify(want) + ' · 실제 ' + JSON.stringify(got)));

/* ── 정본을 «오려 내» 실제로 돌린다 ─────────────────────────────────────── */
function cut(src, head) {
  // 함수 머리부터 중괄호 짝이 맞는 곳까지 (여는 중괄호는 «괄호 깊이 0» 인 것만 몸통으로 본다)
  const i = src.indexOf(head);
  if (i < 0) return null;
  let par = 0, depth = 0, start = -1;
  for (let k = i; k < src.length; k++) {
    const ch = src[k];
    if (ch === '(') par++;
    else if (ch === ')') par--;
    else if (ch === '{' && par === 0) { if (start < 0) start = k; depth++; }
    else if (ch === '}' && par === 0) { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}

console.log('① 모달(idx-vc-room.js) 규칙을 오려 낸다');
const modalNorm = cut(modalSrc, 'function normalize(');
const prefixM = /var\s+PREFIX\s*=\s*'([^']*)'/.exec(modalSrc);
if (!modalNorm) bad('modal normalize() 오려내기'); else ok('modal normalize() 오려내기');
if (!prefixM)   bad('modal PREFIX 읽기');          else ok('modal PREFIX = ' + JSON.stringify(prefixM[1]));

console.log('② 로비(idx-vc-roomcode.js) 규칙을 오려 낸다');
const lobbyFn = cut(lobbySrc, 'function resolveRoomCode(');
const lobbySlug = cut(lobbySrc, 'function meetSlug(');
const meetReM = /var\s+MEET_RE\s*=\s*(\/(?:\\.|\[[^\]]*\]|[^/])+\/[a-z]*)/.exec(lobbySrc);
const knownM  = /var\s+KNOWN_ROOM\s*=\s*(\/(?:\\.|\[[^\]]*\]|[^/])+\/[a-z]*)/.exec(lobbySrc);
const lobbyPrefixM = /var\s+MEET_PREFIX\s*=\s*'([^']*)'/.exec(lobbySrc);
if (!lobbyFn)      bad('로비 resolveRoomCode() 오려내기'); else ok('로비 resolveRoomCode() 오려내기');
if (!lobbySlug)    bad('로비 meetSlug() 오려내기');        else ok('로비 meetSlug() 오려내기');
if (!meetReM)      bad('로비 MEET_RE 읽기');               else ok('로비 MEET_RE 읽기');
if (!knownM)       bad('로비 KNOWN_ROOM 읽기');            else ok('로비 KNOWN_ROOM 읽기');
if (!lobbyPrefixM) bad('로비 MEET_PREFIX 읽기');           else ok('로비 MEET_PREFIX = ' + JSON.stringify(lobbyPrefixM[1]));

if (!modalNorm || !prefixM || !lobbyFn || !lobbySlug || !meetReM || !knownM || !lobbyPrefixM) {
  console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail + '  (전제가 깨져 아래 검사를 못 돌립니다)');
  process.exit(1);
}

const modalRoom = new Function(
  'code',
  modalNorm + "\nvar PREFIX = " + JSON.stringify(prefixM[1]) + ";\n" +
  "var c = normalize(code); return c ? (PREFIX + c) : '';"
);
const lobbyRoom = new Function(
  'raw',
  "var MEET_PREFIX = " + JSON.stringify(lobbyPrefixM[1]) + ";\n" +
  "var MEET_RE = " + meetReM[1] + ";\n" +
  "var KNOWN_ROOM = " + knownM[1] + ";\n" + lobbySlug + "\n" + lobbyFn +
  "\nreturn resolveRoomCode(raw);"
);

/* ③ 접두사 없는 값 — 두 규칙이 «같은 방» 을 내야 한다 */
console.log('③ 같은 번호를 넣으면 같은 방인가 (모달 ↔ 로비)');
const SAME = ['1234', '1', '99', 'melca', 'Melca', ' 1234 ', 'ROOM 7', '12-34', '회의', 'a b c', '1234!!'];
for (const v of SAME) {
  const m = modalRoom(v), l = lobbyRoom(v);
  if (m === l) ok('«' + v + '» → ' + JSON.stringify(m) + ' (양쪽 동일)');
  else bad('«' + v + '» 가 갈린다', '모달 ' + JSON.stringify(m) + ' · 로비 ' + JSON.stringify(l));
}

/* ④ 실제 사고 그대로 */
console.log('④ 실사고 재현 — 교사 회의방 1234 · 학생이 «1234» 를 침');
is('교사(모달)', modalRoom('1234'), 'meet-1234');
is('학생(로비)', lobbyRoom('1234'), 'meet-1234');
if (modalRoom('1234') === lobbyRoom('1234')) ok('두 사람이 같은 방에서 만난다');
else bad('두 사람이 다른 방에 있다');

/* ⑤ 접두사가 있는 방은 한 글자도 안 건드린다 */
console.log('⑤ 이미 접두사가 있는 방은 그대로 두는가');
/* ⛔ 여기에 «대문자 회의방» 을 넣지 마세요 — 2026-09-09 에 `MEET-1234 → MEET-1234` 를
   «정답» 으로 적어 두어, 그것을 바로잡는 올바른 수리가 오히려 FAIL 나게 만들었습니다
   (CLAUDE.md 「하니스가 버그를 글자 그대로 못 박아 올바르게 고치면 FAIL」). 회의방은 ⑤-2 에서 봅니다. */
for (const v of ['mangoi-class', 'demo-1', 'demo-6', 'class-849-20260909', 'room-ab12cd',
                 'c24-511741', 'meet-1234', 'Class-849-20260909']) {
  is('그대로 — ' + v, lobbyRoom(v), v);
}

/* ⑤-2 대소문자 — 폰 키보드가 첫 글자를 대문자로 만든다. 방 이름(idFromName)은 대소문자를
   구분하므로 `Meet-1234` 를 그대로 두면 고치려던 사고가 대문자로 그대로 재현된다. */
console.log('⑤-2 대소문자만 다른 회의방은 «같은 방» 으로 모이는가');
for (const v of ['MEET-1234', 'Meet-1234', 'meet-1234', 'MEET-Melca', 'Meet Melca', '1234', 'MELCA']) {
  const m = modalRoom(v), l = lobbyRoom(v);
  if (m === l) ok('«' + v + '» → ' + JSON.stringify(l) + ' (모달과 동일)');
  else bad('«' + v + '» 가 갈린다', '모달 ' + JSON.stringify(m) + ' · 로비 ' + JSON.stringify(l));
}
is('Meet-1234 와 1234 가 같은 방', lobbyRoom('Meet-1234'), lobbyRoom('1234'));

/* ⑥ 빈칸은 빈칸 — 공용방 폴백(예전 동작)을 깨지 않는다 */
/* ⚠️ 이름을 좁혔다 — 예전엔 「공용방 폴백 보존」이라고 적어 두었는데, 배선(normalizeRoomInput)은
   `!fixed` 면 «칸을 안 건드린다». 그래서 '!!!' 는 공용방으로 가는 게 아니라 '!!!' 그대로 남는다
   (옛 동작 그대로라 회귀는 아니지만, 그 이름을 다음 사람이 근거로 삼는다). */
console.log('⑥ 방 이름을 만들 수 없는 값은 «만들지 않는가»');
for (const v of ['', '   ', null, undefined, '!!!', 'meet-']) {
  is('빈 결과 — ' + JSON.stringify(v), lobbyRoom(v), '');
}
console.log('⑥-2 그때 배선은 칸을 안 건드리는가 (빈칸 → 공용방 폴백이 살아 있다)');
{
  const n = cut(lobbySrc, 'function normalizeRoomInput(');
  if (n && /if\s*\(!fixed\s*\|\|\s*fixed === raw\)\s*return;/.test(n)) ok('빈 결과면 손대지 않는다');
  else bad('빈 결과에도 칸을 건드린다', '빈칸이 공용방으로 안 갈 수 있다');
}

/* ⑦ 배선 — 입장 직전에 실제로 그 해석을 쓰는가 (부르기만 하면 아무것도 안 막는다) */
console.log('⑦ vcJoinRoom 래퍼가 그 해석을 실제로 쓰는가');
const wrap0 = cut(lobbySrc, 'window.vcJoinRoom = function ()');
const wrap = wrap0 ? wrap0.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '') : null;
if (!wrap) bad('vcJoinRoom 래퍼를 못 찾음');
else {
  if (/normalizeRoomInput\s*\(/.test(wrap)) ok('래퍼가 normalizeRoomInput() 을 부른다');
  else bad('래퍼가 normalizeRoomInput() 을 부르지 않는다', '해석이 입장에 안 닿는다');
  if (wrap.indexOf('normalizeRoomInput') < wrap.indexOf('origJoin.apply')) ok('원래 입장보다 «먼저» 부른다');
  else bad('원래 입장 뒤에 부른다', '이미 옛 방으로 들어간 뒤라 소용없다');
  if (wrap.indexOf('saveTypedRoom') < wrap.indexOf('normalizeRoomInput')) ok('기억은 «사람이 친 대로» 먼저 저장한다');
  else bad('해석한 값을 기억한다', '다음에 로비가 meet- 를 다시 보여 줘 사람이 헷갈린다');
}
const norm0 = cut(lobbySrc, 'function normalizeRoomInput(');
/* ⚠️ 주석을 벗겨 낸 사본으로 판정한다 — 안 벗기면 «// input.value = fixed;» 처럼
   주석 처리해 죽여 놓아도 검사가 자기 주석을 잡아 통과한다(변이시험 실측). */
const norm = norm0 ? norm0.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '') : null;
if (!norm) bad('normalizeRoomInput() 을 못 찾음');
else {
  if (/resolveRoomCode\s*\(/.test(norm)) ok('normalizeRoomInput 이 정본 resolveRoomCode 를 쓴다');
  else bad('normalizeRoomInput 이 정본을 안 쓴다', '규칙이 세 벌이 된다');
  if (/input\.value\s*=\s*fixed/.test(norm)) ok('해석 결과를 칸에 «보여 준다»(몰래 바꾸지 않는다)');
  else bad('해석 결과를 칸에 안 적는다', '「이 방 링크 복사」가 엉뚱한 링크를 만든다');
}

/* ⑧ 고친 파일의 ?v= 가 올라갔는가 (immutable 캐시에 옛 사본이 남으면 한쪽만 안 고쳐진다) */
console.log('⑧ index.html 의 ?v= 배선');
const vm = /idx-vc-roomcode\.js\?v=(\d+)/.exec(indexSrc);
if (!vm) bad('index.html 이 idx-vc-roomcode.js 를 ?v= 로 부르지 않는다');
else if (Number(vm[1]) >= 3) ok('?v=' + vm[1] + ' (≥2)');
else bad('?v=' + vm[1], '올리지 않으면 학생 브라우저에 옛 사본이 남는다');

/* ⑨ 폰 키보드가 첫 글자를 대문자로 만드는 것은 서버로 못 막는다 — 칸에 속성을 입히는가.
   index.html 은 공동 금지구역이라 defer 파일에서 밖에서 입힌다. */
console.log('⑨ 방 번호 칸에 대문자·자동고침 방어를 입히는가');
{
  const g = cut(lobbySrc, 'function armCaseGuards(');
  if (!g) bad('armCaseGuards() 를 못 찾음');
  else {
    for (const a of ['autocapitalize', 'autocorrect', 'spellcheck'])
      (new RegExp("setAttribute\\('" + a + "'").test(g)) ? ok(a + ' 를 입힌다') : bad(a + ' 를 안 입힌다');
    if (/vc-roomcode-input/.test(g)) ok('대상이 방 번호 칸이다'); else bad('대상이 방 번호 칸이 아니다');
  }
  const boot = cut(lobbySrc, 'function boot(');
  if (boot && /armCaseGuards\s*\(/.test(boot)) ok('로비를 열 때 실제로 부른다');
  else bad('armCaseGuards() 를 부르는 곳이 없다', '선언만 있고 안 돈다');
}

/* ⑩ 로비 안내가 «사실» 을 말하는가 (2026-09-09 사장님 지시로 고친 자리)
   옛 문구 「아이디·비밀번호만 입력하면 선생님과 같은 수업방에서 자동으로 만나요」는
   회의방에서 거짓이었다 — 회의방은 예약이 없어 «빈 방코드 → 오늘 예약방» 자동 교정을
   비켜 가고, 학생은 공용 연습방에 혼자 남는다(이 사고의 사람 쪽 절반).
   ⚠️ 부정 검사는 «주석을 벗겨 낸 사본» 으로 한다 — 왜 고쳤는지 적은 HTML 주석이
      바로 그 옛 문구를 담고 있어서, 안 벗기면 검사가 «자기 주석» 을 잡는다. */
console.log('⑩ 로비 안내가 «예약된 수업» 조건을 말하는가');
{
  const a = indexSrc.indexOf('id="vc-room-input"');
  const b = indexSrc.indexOf('⚙️ 방 코드 직접 입력 (선택)');
  if (a < 0 || b < 0 || b <= a) {
    bad('로비 안내 구간을 못 찾음', '앵커(비밀번호 칸 ~ 방 코드 직접 입력)가 바뀌었다');
  } else {
    const raw  = indexSrc.slice(a, b);
    const bare = raw.replace(/<!--[\s\S]*?-->/g, '');   // ← 주석 벗기기(자기 주석 방지)
    /* ⛔ «양쪽 다 ok()» 로 쓰지 말 것 — 어떤 경우에도 통과해 PASS 수만 부풀린다(함정 대조가 잡았습니다).
       여기서 물을 값어치가 있는 것은 **«주석 벗기기가 실제로 일하고 있는가»** 하나다.
       그것이 죽으면 아래 부정 검사가 «자기 주석» 을 잡아 거짓 FAIL 을 내기 시작한다. */
    if (/<!--/.test(raw)) {
      (!/<!--/.test(bare) && bare.length < raw.length)
        ? ok('전제: 주석 벗기기가 실제로 동작한다 (−' + (raw.length - bare.length) + '자)')
        : bad('주석이 안 벗겨졌다', '부정 검사가 «자기 주석» 을 잡게 된다');
    } else {
      ok('전제: 이 구간에 주석이 없다(벗길 것이 없음)');
    }

    if (/아이디·비밀번호만 입력하면 선생님과 같은 수업방에서 자동으로 만나요/.test(bare))
      bad('무조건 약속하는 옛 문구가 화면에 그대로 있다', '회의방에서 거짓이다');
    else ok('무조건 약속하는 옛 문구가 화면에 없다');

    // 조건을 말하는가 + 방 번호 칸으로 보내는가
    (/예약/.test(bare)) ? ok('«예약» 조건을 말한다') : bad('조건 없이 약속한다', '어떤 경우에 참인지 안 적혀 있다');
    (/방 번호/.test(bare) && /방 코드 직접 입력/.test(bare))
      ? ok('방 번호를 받았을 때 갈 곳(방 코드 직접 입력)을 알려 준다')
      : bad('방 번호를 넣으라는 안내가 없다', '회의방 학생이 갈 곳을 모른다');
    (/room number/i.test(bare) && /room code/i.test(bare))
      ? ok('영어 안내도 같은 말을 한다') : bad('영어 안내가 그 말을 안 한다', 'KO 만 고치면 EN 학생은 그대로다');

    // 구조 — 두 줄을 한 요소에 담지 않았는가 + 보이는 글자 == data-ko
    /* ⛔ data-ko 가 data-en «앞» 에 온다고 못 박지 말 것 — 속성 순서만 바꾸는 무해한 편집에
       거짓 FAIL 이 난다. 여는 태그를 통째로 잡고 속성은 «따로» 읽는다. */
    const divs = [...bare.matchAll(/<div\b([^>]*)>([\s\S]*?)<\/div>/g)]
      .map(m => {
        const ko = /\bdata-ko="([^"]*)"/.exec(m[1]), en = /\bdata-en="([^"]*)"/.exec(m[1]);
        return (ko && en) ? { ko: ko[1], en: en[1], body: m[2] } : null;
      })
      .filter(Boolean);
    if (divs.length >= 2) ok('안내가 «두 요소» 로 나뉘어 있다 (' + divs.length + '개)');
    else bad('안내 요소가 ' + divs.length + '개', 'i18n 이 textContent 를 갈아끼우므로 한 요소에 여러 줄을 담으면 안 된다');
    let bodyOk = true, koOk = true;
    for (const d of divs) {
      if (/</.test(d.body)) bodyOk = false;                  // 자식 요소가 있으면 🌐 에 날아간다
      if (d.body.trim() !== d.ko.trim()) koOk = false;       // 보이는 글자 != data-ko → 🌐 한 번에 뜻이 바뀐다
    }
    bodyOk ? ok('data-ko 요소 안에 자식 요소가 없다') : bad('data-ko 요소가 자식을 품고 있다', '🌐 를 누르면 그 자식이 사라진다');
    koOk ? ok('보이는 글자가 data-ko 와 같다') : bad('보이는 글자와 data-ko 가 다르다', '🌐 한 번에 뜻이 바뀐다');
  }
}

/* ── ⑪ 링크 도메인 — 두 «링크 복사» 가 같은 정본 도메인을 쓰는가 ────────────
   [왜] 2026-09-10 실측: 로비(idx-vc-roomcode.js)는 `https://mangoi.ai` 로 못 박는데
     회의방 모달(idx-vc-room.js)은 **location.origin** 이었다. 그래서 선생님이
     test.mangoi.co.kr 에서 복사한 링크가 그대로 퍼지고, 받는 학생은 오리진이 갈려
     localStorage 로그인이 없어 **「로그인했는데 또 로그인하래요」** 를 겪는다.
     (30일 실측: mangoi.ai 296회·46명 대 test.mangoi.co.kr 12회·3명)
   [무엇을 묻나] «그 글자가 있는가» 가 아니라 **링크 만드는 함수를 실제로 돌려** 답을 본다.
   ⚠️ 기대값을 하니스에 손으로 적지 않는다 — 서버 정본 src/site-url.ts 에서 읽어 온다.
      (경로 모양·쿼리 파라미터는 두 화면이 달라도 된다. 같아야 하는 것은 «오리진» 뿐이다.) */
{
  console.log('\n⑪ 링크 도메인 — 정본과 같은가');
  const canonSrc = fs.readFileSync(ROOT + 'cloudflare-deploy/src/site-url.ts', 'utf8');
  const canonM = /export\s+const\s+SITE_ORIGIN\s*=\s*'([^']+)'/.exec(canonSrc);
  if (!canonM) {
    bad('src/site-url.ts 에서 SITE_ORIGIN 을 못 읽었다', '정본이 바뀌었으면 이 검사를 함께 고칠 것');
  } else {
    const CANON = canonM[1];
    ok('정본을 읽었다 (src/site-url.ts SITE_ORIGIN = ' + CANON + ')');

    const builders = [
      { name: '회의방 모달 (idx-vc-room.js)',      src: modalSrc, fn: 'function meetUrl(', callee: 'meetUrl' },
      { name: '로비 링크 복사 (idx-vc-roomcode.js)', src: lobbySrc, fn: 'window.vcRoomLink = function (', callee: 'vcRoomLink' },
    ];
    for (const b of builders) {
      const body = cut(b.src, b.fn);
      if (!body) { bad(b.name + ' — 링크 만드는 함수를 못 오려 냈다', b.fn); continue; }
      const bare = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
      // ① location.origin 을 쓰지 않는가 (주석은 벗겨 낸 사본으로 판정)
      /\blocation\s*\.\s*origin\b/.test(bare)
        ? bad(b.name + ' — location.origin 을 쓴다', '만든 도메인이 그대로 퍼져 받는 사람이 다시 로그인한다')
        : ok(b.name + ' — location.origin 을 쓰지 않는다');
      // ② 실제로 돌려 본다
      const originM = /var\s+SITE_ORIGIN\s*=\s*'([^']*)'/.exec(b.src);
      if (!originM) { bad(b.name + ' — SITE_ORIGIN 상수가 없다', '도메인을 식 안에 흩어 적지 말 것'); continue; }
      let url = null;
      try {
        url = new Function('SITE_ORIGIN', 'code',
          bare.replace(/^[\s\S]*?function\s*\w*\s*\([^)]*\)\s*\{/, '').replace(/\}\s*;?\s*$/, '')
              .replace(/\bnormalize\s*\(/g, 'String(').replace(/\bnormalizeRoomInput\s*\(/g, 'String(')
        )(originM[1], '1234');
      } catch (e) { bad(b.name + ' — 링크를 만들다 던졌다', String(e && e.message)); continue; }
      (typeof url === 'string' && url.indexOf(CANON + '/') === 0)
        ? ok(b.name + ' → ' + url)
        : bad(b.name + ' — 정본 도메인으로 시작하지 않는다', '만든 주소: ' + JSON.stringify(url));

      /* 🔴 (2026-09-10 함정 대조) «빌더가 옳은가» 만 보면 **아무것도 안 지켜집니다** —
         `SITE_ORIGIN` 은 그대로 두고 **복사 핸들러가 그 빌더를 안 부르게** 바꾸면
         (`var url = location.origin + '/?meet=' + …`) 위 검사는 전부 통과합니다.
         실제로 그 변이를 돌려 PASS 68/FAIL 0 이 나오는 것을 확인했습니다.
         ⟹ CLAUDE.md 2장 「«불렀는가» 만 보지 말고 «그 결과를 쓰는가» 도 보세요」.
         ⛔ 선언(`function meetUrl(`·`= function (`)이 호출로 세이지 않게 «부르는 모양» 으로만 셉니다. */
      const bareAll = b.src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
      const calls = [...bareAll.matchAll(new RegExp('(?<!function\\s{0,4})\\b' + b.callee + '\\s*\\(', 'g'))]
        .filter(m => !/function\s*$/.test(bareAll.slice(Math.max(0, m.index - 12), m.index)));
      (calls.length >= 1)
        ? ok(b.name + ' — 복사 핸들러가 그 빌더를 실제로 부른다 (' + calls.length + '곳)')
        : bad(b.name + ' — 빌더를 부르는 곳이 없다', '빌더만 옳고 링크는 딴 데서 만들어집니다');
      /* 그리고 그 파일 안에서 링크를 «따로» 조립하지 않는가 — 빌더를 비켜 가는 두 번째 길 */
      (/location\s*\.\s*(origin|host|hostname)\s*\+/.test(bareAll))
        ? bad(b.name + ' — 파일 안에서 location 으로 주소를 따로 조립한다', '빌더를 비켜 갑니다')
        : ok(b.name + ' — 파일 어디에서도 location 으로 주소를 조립하지 않는다');
    }
  }
}

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
