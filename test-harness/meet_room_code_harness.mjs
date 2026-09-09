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

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
