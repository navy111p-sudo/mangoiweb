// 🐢🐇 화면 쪽 «말 빠르기» 판정 하니스 (2026-10-28 사장님 「화면 쪽 말 빠르기도 고쳐줘」)
//
// 무엇을 지키나
//   AI 영어친구(ai-friend.html)·A.i 말하기 웜업(warmup.html)은 학생이 «천천히 말해 줘» 라고 하면 음성 속도를 한 칸 낮춘다.
//   예전에는 두 화면이 각자 «낱말 하나»(slow·천천히·빠르게·faster)로 판정해서 학생의 «대답» 에도 속도가 바뀌었다 —
//   「A snail is slow.」·「천천히 걸어요」 → 느려지고, 「빠르게 달려요」·「Cheetahs run faster.」 → 빨라졌다.
//   지금은 공용 판정 한 곳(public/js/speech-rate-request.js)을 두 화면이 «부르기만» 한다.
//
// 이 하니스가 보는 것(전부 «실제로 돌려서» 본다 — 글자로만 보면 `if (false)` 한 글자에 뚫린다)
//   ① 공용 파일을 실제로 실행해 판정 함수를 얻는다(전제)
//   ② 느리게 쪽의 세 줄이 서버 정본(src/question-memory.ts 의 QM_REASK_KO·EN·ECHO)과 «원문이 같다» · 길이 상한도 같다
//   ③ 부탁은 바뀌고 · 대답은 안 바뀐다(짝) — 느리게·빠르게 양쪽
//   ④ 서버 정본이 «빠르기 부탁» 이라 하면 화면도 느려진다 · 정본 밖에서 느려지는 것은 화면 전용 보강 줄(SLOW_EXTRA)에서만 온다
//   ⑤ 정규식이 긴 입력에서도 빠르다(키워드 × 공백 10만 자)
//   ⑥ 두 화면의 maybeAdjustRate 를 오려 내 «가짜 속도 조절기» 로 실제로 돌린다 — 부탁이면 한 칸, 대답이면 그대로,
//      공용 파일이 없으면 그대로(짝) · 첫 칸·끝 칸 경계 · 두 화면이 그 파일을 싣는다 ·
//      보내기(sendMsg)를 «그 호출까지» 오려 가짜 화면으로 실제로 돌려 학생 말이 그 함수에 «정말» 닿는지(`if (false)` 로 막아도 잡힌다)
//   ⑦ 대조 — 예전 판정이었다면 이 대답들에 반응했다(이 목록이 헛돌지 않는다는 증거)
//
// 변이시험: RATE_PUB_DIR / RATE_SRC_DIR 로 고친 사본을 가리키면 그 사본을 잰다(저장소 파일을 고쳤다 되돌리지 말 것).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { deadAt } from './helpers/live-code.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PUB = process.env.RATE_PUB_DIR ? path.resolve(process.env.RATE_PUB_DIR) : path.join(root, 'cloudflare-deploy', 'public');
const SRC = process.env.RATE_SRC_DIR ? path.resolve(process.env.RATE_SRC_DIR) : path.join(root, 'cloudflare-deploy', 'src');
const QUIET = !!process.env.RATE_QUIET;

let pass = 0, fail = 0;
const ok = (name, cond, info) => {
  if (cond) { pass++; if (!QUIET) console.log('  ✅', name); }
  else { fail++; console.log('  ❌ FAIL', name, info === undefined ? '' : '— ' + JSON.stringify(info).slice(0, 600)); }
};
const finish = () => {
  console.log(`speech_rate_request_harness — PASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
};
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const toRe = (lit) => { try { return new Function('return ' + lit)(); } catch { return null; } };

// ─── ① 공용 파일을 실제로 실행 ────────────────────────────────────────────────
const libPath = path.join(PUB, 'js', 'speech-rate-request.js');
const lib = read(libPath);
ok('① 공용 판정 파일이 있다(전제)', lib.length > 0, libPath);
const box = { window: {} };
try { vm.runInNewContext(lib, box, { timeout: 2000 }); } catch (e) { ok('① 공용 판정 파일이 오류 없이 돈다', false, String(e && e.message)); }
const api = box.window.MangoiRateRequest;
let judge = api && typeof api.judge === 'function' ? api.judge : null;
ok('① 판정 함수(window.MangoiRateRequest.judge)를 내보낸다(전제)', !!judge);
if (!judge) finish();
const J = (t) => { try { return judge(t); } catch (e) { return 'THREW:' + (e && e.message); } };

// 공용 파일 안의 정규식 리터럴 — 한 줄짜리 «var 이름 = /…/깃발;» 만 모은다
const libLits = {};
for (const m of lib.matchAll(/^\s*var (\w+) = (\/.+\/[a-z]*);\s*$/gm)) libLits[m[1]] = toRe(m[2]);

// ─── ② 서버 정본과 원문 대조 ──────────────────────────────────────────────────
const qm = read(path.join(SRC, 'question-memory.ts'));
const canonLit = (n) => { const m = qm.match(new RegExp('export const ' + n + ' = (/.+/[a-z]*);')); return m ? toRe(m[1]) : null; };
const C = { KO: canonLit('QM_REASK_KO'), EN: canonLit('QM_REASK_EN'), ECHO: canonLit('QM_REASK_ECHO') };
const canonMax = Number((qm.match(/export const QM_REASK_MAX_LEN = (\d+);/) || [])[1]);
ok('② 서버 정본 세 줄과 길이 상한을 읽었다(전제)', !!(C.KO && C.EN && C.ECHO) && canonMax > 0, { canonMax });
const same = (a, b) => !!a && !!b && a.source === b.source && a.flags === b.flags;
ok('② 느리게 쪽 세 줄이 서버 정본과 «원문이 같다»(한쪽만 고치면 화면과 서버가 서로 다른 말을 한다)',
  same(libLits.REASK_KO, C.KO) && same(libLits.REASK_EN, C.EN) && same(libLits.REASK_ECHO, C.ECHO),
  { ko: same(libLits.REASK_KO, C.KO), en: same(libLits.REASK_EN, C.EN), echo: same(libLits.REASK_ECHO, C.ECHO) });
const libMax = Number((lib.match(/var MAX_LEN = (\d+);/) || [])[1]);
ok('② 길이 상한이 서버 정본과 같다', libMax === canonMax, { libMax, canonMax });
const isReask = (t) => typeof t === 'string' && !!t && t.length <= canonMax && (C.KO.test(t) || C.EN.test(t) || C.ECHO.test(t));

// ─── ③ 부탁은 바뀌고 · 대답은 안 바뀐다 ──────────────────────────────────────────
const SLOWER = ['천천히 말해 줘', '천천히 말해 주세요', '천천히 말해줘요', '좀 천천히 말해 줄래?', '천천히요', '천천히', '느리게', '느리게 말해 주세요', '천천히 해 주세요',
  '천천히 읽어 주세요', '천천히 말씀해 주세요', '천천히 말해', '천천히 말해봐', '너무 빨라요', '너무 빨라', '너무 빠르다', '너무 빨리 말해요', '선생님 너무 빨리 말해요',
  '못 알아들었어요', '잘 못 알아듣겠어', '알아듣기 어려워요', '알아듣기 힘들어요', '조금만 천천히', '좀 더 천천히요', '조금만 더 천천히', '더 느리게', '빠르게 말해서 못 알아들었어요',
  'Slow down', 'Slow down please', 'Please slow down', 'Can you slow down?', 'Huh? Slow down.', 'Please speak slowly', 'Speak slowly please', 'Can you speak slowly?',
  'Could you speak more slowly?', 'Speak more slowly', 'Speak slower.', 'Talk slower', 'Slower please', 'Slower', 'More slowly please', 'A little slower please',
  'Can you say it a little slower?', 'Can you say that again slowly?', 'You speak too fast', 'You are too fast', "You're too fast", 'You talk so fast', 'Your voice is too fast',
  'Too fast', 'Too fast!', 'Too fast, teacher', 'Too fast for me!', 'What? Too fast!', 'Slow please', 'Slow, please.',
  // 화면 전용 보강(SLOW_EXTRA) — 2026-10-28 함정 대조가 «진짜 부탁인데 놓친다» 로 찾은 것들
  "It's too fast", "That's too fast", 'That was too fast', 'It is too fast for me', 'Way too fast', 'Teacher too fast', 'Okay, too fast', 'Hmm, too fast',
  'Hold on, too fast', 'Ah too fast', 'Too quick', 'Slow down teacher', "I don't understand, slow down.", "I didn't understand, too fast.", "I can't hear, slow down",
  'pls slow down', 'plz slow down', 'slow down pls', 'Speak slowly pls', 'Slowly pls', 'Say it slowly', 'Read that slowly', 'Go slowly', 'Go slow please', 'Please, slowly.',
  'Can you read slowly?', 'Could you talk slower?', '좀만 천천히', '살짝 천천히', '천천히 부탁해요', '천천히 부탁드려요', '천천히 말하세요', '천천히 말씀하세요',
  '천천히 말해주라', '천천히 천천히', '천천히 해 봐', '천천히 읽어', '천천히 말해 달라고요', '선생님 천천히 말하세요', '선생님 너무 빨라요', '너무 빨라요 선생님',
  '선생님, 너무 빨라요', '목소리가 너무 빨라요', '속도가 너무 빨라요', '말씀이 너무 빨라요', '속도 좀 줄여 주세요', '속도를 늦춰 주세요',
  // 2026-10-28 함정 대조 2회차가 «진짜 부탁인데 놓친다» 로 찾은 것들(부름말·앞말 둘·아포스트로피 빠짐·don't …)
  '선생님 천천히요', '쌤 천천히', '선생님, 천천히요!', '저기요 천천히 말해 주세요', '천천히 해 주세요 선생님', '선생님 말이 너무 빨라요', '선생님 말씀이 너무 빨라요',
  '좀 더 천천히요', '조금만 더 천천히', '더 더 천천히', '잘 안 들려요 천천히요', '천천히 말해 주면 좋겠어요',
  'Its too fast', 'its too fast', 'Thats too fast', 'youre too fast', "Don't talk so fast", "Don't speak too fast", 'Please don’t talk so fast',
  'Hey, slow down!', 'Hold on, slow down', 'Ah slow down', 'Slow down a little', 'Slow down a little please', 'A little bit slower', 'A little slower'];
const FASTER = ['빠르게 말해 줘', '좀 더 빨리 말해 주세요', '더 빨리 말해 줄래?', '더 빨리 말해 줘', '조금 더 빠르게 말해 주세요', '빠르게 읽어 주세요', '더 빨리 말씀해 주세요',
  '더 빨리요', '좀 빨리', '좀 더 빠르게', '빠르게요', '빠르게', '더 빨리 말해 봐', '선생님 너무 느려요', '너무 느려요 선생님', 'Hey, faster', '너무 느려요', '너무 느리다', '너무 느리게 말해요', '선생님 너무 느리게 말해요',
  'Faster', 'Faster please', 'Faster, please!', 'Speak faster', 'Can you speak faster?', 'Please speak faster', 'Could you talk a little faster?', 'A little faster please',
  'Speed up', 'Speed up please', 'Can you speed up?', 'Please speed up.', 'You speak too slowly', 'You are too slow', "You're too slow", 'Your voice is too slow', 'Too slow', 'Too slow!',
  'Go faster', 'Can you go faster?', 'Read it faster please', 'Please faster', 'More quickly please', 'Um, faster please',
  'Faster faster!', 'Again faster', 'What? faster', 'Read faster', 'Quicker, please', 'A bit quicker', '너무 느려요, 더 빨리요', 'Too slow, faster please',
  '속도 좀 올려 주세요', '속도를 높여 줘'];
// 대답 · 진술 · 다른 부탁 — 속도를 바꾸면 안 된다
const NONE = ['A snail is slow.', '천천히 걸어요', '빠르게 달려요', 'My turtle walks slowly.', "No, it's slow.", 'Cheetahs run faster.', 'My car is faster than yours.',
  'I can run faster now.', 'My dog runs faster than me.', 'Faster than a dog!', 'Run faster!', 'Swim faster!', 'I said it faster.', 'Yes, faster.', '네, 빨리요',
  '형은 빠르게 말해요', '아빠는 빠르게 말해요', '빠르게 말하면 재밌어요', '말이 빠르게 달려요', '말이 너무 빨라요', '얼룩말이 너무 빨라요', '토끼는 너무 빨라요', '거북이는 너무 느려요',
  'The turtle is too slow.', 'A rabbit is fast.', 'You are so fast!', 'Help me, fast!', 'The car speeds up.', 'Cars speed up on the highway.', 'I want to go faster on my bike.',
  '빨리 달리는 게 좋아요', '빨리 먹었어요', '빨리 와 주세요', '숙제를 빨리 해 주세요', '천천히 해요', '느려요', '네, 천천히요', '아빠는 천천히 말해요', '선생님이 천천히 말했어요',
  'Speak slowly to babies.', 'Talk slowly.', 'I speak slowly.', 'He reads slowly.', 'Slow.', 'Slowly.', 'Cars go slow in the snow.', 'My mom talks too fast.', 'My dog runs too fast.',
  'They slow down and look.', 'No, slow down.', 'Slow down and look.',
  // 2026-10-28 함정 대조 — 새 판정이 «다른 쪽으로» 틀리던 이야기·대답(이제 안 바뀐다)
  '거북이는 너무 느리게 말해요', "You're too slow at running.", 'You are too slow, I win!', '빨리', '빨리요', '빨리 해 주세요', '빨리 해', '빨라요',
  'Speak slowly', "No, it's too fast.", 'The train is too fast.', 'The car was too fast for me.', '할머니는 천천히 말하세요', '살짝 천천히 걸어요', '좀만 기다려 주세요',
  'Not so fast', 'Please speed up the car? No.', '속도가 빨라요', '그 차는 속도가 너무 빨라요',
  // 2026-10-28 함정 대조 2회차 — 「빨리 말해 줘/봐」 는 «얼른 말해» 재촉이다(예전 판정도 안 받았다). «빨리» 는 «더» 가 붙어야 속도 부탁
  '정답 빨리 말해 줘', '빨리 말해 봐', '빨리 말해봐요', '빨리 얘기해 줘', '답 빨리 말해 주세요', '뭔데? 빨리 말해 줘', '빨리 말해 줘!', '좀 빨리 말해 줄래?',
  '빨리 말해 주세요', '빨리 말씀해 주세요', '천천히 걸어 주세요', '선생님 말 들었어요', "Don't run so fast", 'Its tail is long',
  // 빠르게 쪽은 일부러 좁다 — 잘못 빨라지면 아이가 더 못 알아듣는다(잘못 느려지는 것보다 대가가 크다). 「It's too fast」 는 받지만 「It's too slow」 는 안 받는다
  "It's too slow", 'That is too slow',
  // 정본 ECHO 는 앞말 하나만 받는다(「좀 더 쉽게요」 는 서버에서도 되묻기가 아니다) — 화면 보강도 «천천히·느리게» 만 넓혔다
  '좀 더 쉽게요', '좀 더 짧게요',
  // 되묻기이지만 «빠르기» 이야기가 아닌 것 — 다시 듣기·쉽게·모름은 속도와 무관하다(예전과 같다)
  '다시 말해 줘', '다시 한 번 말해 주세요', '쉽게 말해 줘', '모르겠어요', 'What?', 'Huh?', '뭐라고요?', 'Say it again', 'Louder please', "I don't understand.", 'Repeat please.',
  'Use simple words.', '이해가 안 가요', "I don't know.", '', '   '];
const missS = SLOWER.filter((t) => J(t) !== 'slower').map((t) => [t, J(t)]);
const missF = FASTER.filter((t) => J(t) !== 'faster').map((t) => [t, J(t)]);
const wrong = NONE.filter((t) => J(t) !== '').map((t) => [t, J(t)]);
ok(`③ «천천히 말해 줘» 류 부탁 ${SLOWER.length}개는 느려진다`, missS.length === 0, missS);
ok(`③ «더 빨리 말해 줘» 류 부탁 ${FASTER.length}개는 빨라진다`, missF.length === 0, missF);
ok(`③ 대답·진술·다른 부탁 ${NONE.length}개는 속도를 안 바꾼다(짝 — 「A snail is slow.」·「빠르게 달려요」)`, wrong.length === 0, wrong);
{
  // 두 판정이 «둘 다» 걸리는 문장이어야 이 검사가 뜻이 있다 — 하나만 걸리면 순서를 뒤집어도 초록이다(변이 실측)
  const both = '아까 더 빨리 말해 줘 했는데 너무 빨라요. 천천히 말해 주세요';
  ok('③ 둘 다 있으면 느리게가 이긴다(예전과 같다)', J(both) === 'slower', J(both));
}
{
  // 배열·객체는 글자로 «바뀌어» 정규식에 들어가면 판정이 생긴다 — 글자만 본다(['천천히 말해 줘'] 가 그 반례)
  const odd = [null, undefined, 3, {}, [], ['천천히 말해 줘'], { toString: () => '더 빨리 말해 줘' }];
  ok('③ 글자가 아닌 값은 던지지 않고 «바꾸지 않음»', odd.every((v) => J(v) === ''), odd.map(J));
}
{
  // 경계 한 글자까지 — 정본은 «길이 <= 1000» 이면 본다(`>` 를 `>=` 로 바꾸면 정확히 1000자에서 갈린다)
  const pad = (b, n) => b + ' '.repeat(n - b.length);
  const S0 = '천천히 말해 줘', F0 = '더 빨리 말해 줘';
  const r = { s1000: J(pad(S0, 1000)), s1001: J(pad(S0, 1001)), f1000: J(pad(F0, 1000)), f1001: J(pad(F0, 1001)) };
  ok('③ 1,000자까지는 보고 1,001자부터 안 본다(짝 · 정본 «<= 1000» 과 같은 경계)',
    r.s1000 === 'slower' && r.s1001 === '' && r.f1000 === 'faster' && r.f1001 === '' && isReask(pad(S0, 1000)) && !isReask(pad(S0, 1001)), r);
}

// ─── ④ 서버 정본과의 관계 ─────────────────────────────────────────────────────
const ALL = [...SLOWER, ...FASTER, ...NONE];
const SW = libLits.SLOW_WORD, SX = libLits.SLOW_EXTRA;
ok('④ 화면 전용 보강 줄(SLOW_EXTRA)·빠르기 낱말(SLOW_WORD)을 읽었다(전제)', !!SW && !!SX);
// 정본이 «다시 말해 달라» 라 하고 그 말이 «빠르기» 이야기면 화면도 반드시 느려진다 — 정본이 받는 것은 놓치지 않는다
const canonMiss = ALL.filter((t) => isReask(t) && SW && SW.test(t) && J(t) !== 'slower');
ok('④ 정본이 «빠르기 부탁» 이라 하면 화면도 느려진다(놓치지 않는다)', canonMiss.length === 0, canonMiss);
// 정본 밖에서 느려지는 것은 화면 전용 보강 줄 하나에서만 온다(어디서 왔는지 모르는 «느리게» 가 없다)
// 줄임 바꾸기는 공용 파일의 것을 그대로 쓴다(손으로 베끼면 그쪽이 바뀔 때 어긋난다)
const norm = api && typeof api.normalize === 'function' ? api.normalize : null;
ok('④ 줄임 바꾸기(normalize)를 공용 파일에서 받았다(전제)', !!norm && norm('pls slow down') === 'please slow down');
const pre = (t) => (norm ? norm(t) : t);
const stray = ALL.filter((t) => J(t) === 'slower' && !(isReask(pre(t)) && SW.test(pre(t))) && !(SX && SX.test(pre(t))));
ok('④ 정본 밖에서 느려지는 말은 전부 화면 전용 보강 줄에서 온다', stray.length === 0, stray);
if (!QUIET) console.log(`  ℹ️ 정본 밖(화면 전용 보강)으로 느려지는 부탁: ${ALL.filter((t) => J(t) === 'slower' && !isReask(t)).length}개`);
if (!QUIET) {
  // 알고 둔 한계(정본에서 물려받음 — 못 박지 않고 보여만 준다): 정본은 「you speak slowly」 를 «부탁 자리» 로 보아 진술도 받는다
  const inherit = ['Good, you speak slowly', 'Okay now you speak slower'].map((t) => `${JSON.stringify(t)}→${J(t) || '그대로'}`);
  console.log('  ℹ️ 알고 둔 한계(정본 상속):', inherit.join(' · '));
}
const canonFast = FASTER.filter((t) => isReask(t) && J(t) !== 'faster');
ok('④ 빠르게 부탁이 «느리게» 로 뒤집히지 않는다', canonFast.length === 0, canonFast);

// ─── ⑤ 속도 ───────────────────────────────────────────────────────────────────
const RES = Object.values(libLits).filter(Boolean);
const litLines = (lib.match(/^\s*var \w+ = \//gm) || []).length;
ok('⑤ 공용 파일의 정규식을 모두 읽었다(전제 — 한 줄짜리 var 정규식 전부)', RES.length === litLines && litLines >= 8, { read: RES.length, lines: litLines });
const KEYS = ['천천히 말', '천천히 말해', '천천히', '빠르게 말', '빠르게 말해', '빨리', '빨리 말', '너무', '너무 느리게', '좀', '더', '못 알아', 'you', 'please', 'too slow', 'too fast',
  'speak', 'faster', 'a little', 'speed', 'go', 'oh', "i don't understand", '속도', '속도 좀', '선생님', '선생님 너무', '천천히 천천히', "it's too", 'hold on',
  'can you', 'say it', 'please,', '천천히 부탁', '너무 빨라요', 'hey', "don't talk", 'slow down a', 'a little bit', '선생님 말이', '선생님 말씀이',
  '잘 안 들려요', '천천히 말해 주면', 'its too', '저기요', '더 빨리', '좀 더 빨리', '선생님 너무 느려요', '너무 느려요', 'youre'];
let worst = 0, worstAt = '';
// 10만 자 — 5만 자에서는 «\s* 두 개 사이 선택 낱말» 꼴이 1초 언저리라 문턱에 걸렸다 말았다 한다(변이 실측 984ms). 10만 자면 4초 대 0ms 로 갈린다.
// ⏱ vm 시간 제한(1.5초)으로 돌린다 — 제곱 정규식은 10만 자에서 «몇 시간» 이라, 그냥 돌리면 이 하니스가 FAIL 이 아니라 «멈춤» 이 된다
//    (2026-10-28 실제로 밟음: `(?:천천히\s*){2,3}요?[^\p{L}\p{N}]*$` 한 줄에 2분 넘게 멈췄다). 끊기면 그 입력을 «가장 느림» 으로 적는다.
const speedBox = vm.createContext({ RES, t: '' });
for (const k of KEYS) for (const sep of [' ', ', ', '?', ' 좀 ', '\t']) {
  speedBox.t = k + sep.repeat(100000) + 'x';
  const t0 = performance.now();
  let d;
  try { vm.runInContext('for (const re of RES) re.test(t);', speedBox, { timeout: 1500 }); d = performance.now() - t0; }
  catch (e) { d = Infinity; }
  if (d > worst) { worst = d; worstAt = JSON.stringify(k) + ' + ' + JSON.stringify(sep) + ' × 100000' + (d === Infinity ? ' (1.5초에 끊음)' : ''); }
  if (worst === Infinity) break;
}
ok('⑤ 정규식이 긴 입력에서도 빠르다(키워드 × 공백 10만 자 — 1초 안)', worst < 1000, { ms: worst === Infinity ? 'over 1500' : Math.round(worst), at: worstAt });
if (!QUIET) console.log(`  ℹ️ 가장 느린 경우 ${worst === Infinity ? '1.5초 넘음' : Math.round(worst) + 'ms'} — ${worstAt}`);

// ─── ⑥ 두 화면의 배선 ──────────────────────────────────────────────────────────
const fnBody = (text, head) => {
  const at = text.indexOf(head);
  if (at < 0) return { at, code: '' };
  const open = text.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return { at, code: text.slice(at, i + 1) };
  }
  return { at, code: '' };
};
// sendMsg 를 «그 호출까지» 오려 낸 뒤 열린 괄호를 닫아 실제로 돌릴 수 있게 만든다.
//   글자·주석·문자열은 건너뛰고 { } 만 센다 — `try {` 가 열려 있으면 `} catch (__e) { throw __e; }` 로 닫는다.
const closeOpen = (src) => {
  const stack = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { const j = src.indexOf('\n', i); i = j < 0 ? src.length : j; continue; }
    if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? src.length : j + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
      continue;
    }
    if (c === '{') stack.push(/\btry\s*$/.test(src.slice(Math.max(0, i - 12), i)));
    else if (c === '}') stack.pop();
  }
  return '\n' + stack.reverse().map((isTry) => (isTry ? '} catch (__e) { throw __e; }' : '}')).join('\n');
};
// 진짜 전역(Date·Promise …)만 바깥 것을 쓰고, 나머지 이름은 전부 가짜 화면(scope)에서 찾는다 — 모르는 이름은 undefined.
const PASS_GLOBALS = new Set(['Date', 'Math', 'String', 'Number', 'Boolean', 'Object', 'Array', 'JSON', 'Promise', 'Error', 'TypeError',
  'parseInt', 'parseFloat', 'isNaN', 'Symbol', 'undefined', 'NaN', 'Infinity', 'console', 'setTimeout', 'clearTimeout']);
// ⏱ microtaskMode:'afterEvaluate' — await 뒤 실행까지 같은 시간 제한(2초) 안에서 끝낸다(앞부분에 무한루프가 생겨도 «멈춤» 이 아니라 FAIL).
//    그래서 await 할 약속도 그 안에서 만든다(__mkReady) — 바깥 약속을 기다리면 평가가 끝난 뒤에야 풀려 «끝나지 않음» 이 된다.
const runPrefix = (prefix, scope) => {
  const proxy = new Proxy(scope, {
    has: (t, k) => typeof k === 'string' && !PASS_GLOBALS.has(k),
    get: (t, k) => (k === Symbol.unscopables ? undefined : t[k]),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const res = {};
  const ctx = vm.createContext({ __scope: proxy, __res: res }, { microtaskMode: 'afterEvaluate' });
  vm.runInContext('if (__scope.__mkReady) __scope.__mkReady(Promise);\n(function(){ with (__scope) { return (' + prefix + closeOpen(prefix)
    + '\n); } })()(undefined).then(function () { __res.done = 1; }, function (e) { __res.err = String(e && e.message); });', ctx, { timeout: 2000 });
  if (res.err) throw new Error(res.err);
  if (!res.done) throw new Error('not-finished');
};
const stepsOf = (html, isAF) => {
  if (isAF) {
    const m = html.match(/const RATE_STEPS_AF = (\[[^\]]*\]);/), d = html.match(/const RATE_DEFAULT_AF = ([\d.]+);/);
    try { return { steps: JSON.parse(m[1]), def: Number(d[1]) }; } catch { return null; }
  }
  const m = html.match(/var RATE_STEPS = \{([^}]*)\};/);
  if (!m) return null;
  const keys = [...m[1].matchAll(/(\d+)\s*:/g)].map((x) => Number(x[1])).sort((x, y) => x - y);
  return keys.length ? { min: keys[0], max: keys[keys.length - 1] } : null;
};
const PAGES = [
  { file: 'ai-friend.html', head: 'function maybeAdjustRate(text) {', send: 'async function sendMsg(e) {', call: 'maybeAdjustRate(msg);' },
  { file: 'warmup.html', head: 'function maybeAdjustRate(text){', send: 'async function sendMsg(){', call: 'maybeAdjustRate(text);' },
];
for (const pg of PAGES) {
  const html = read(path.join(PUB, pg.file));
  const isAF = pg.file === 'ai-friend.html';
  const tags = [...html.matchAll(/<script\b[^>]*\bsrc="\/js\/speech-rate-request\.js\?v=\d+"[^>]*><\/script>/g)];
  // 글자로 «있다» 만 보면 `<!-- … -->` 로 막거나 type="text/plain" 으로 바꿔도 초록이다(함정 대조 2회차 실측) — 그 태그가 «실제로 돌아가는가» 를 본다
  const inHtmlComment = (i) => html.lastIndexOf('<!--', i) > html.lastIndexOf('-->', i);
  const runnableType = (tag) => { const m = tag.match(/\btype\s*=\s*["']?([^"'\s>]+)/i); return !m || /^(?:text\/javascript|application\/javascript|module)$/i.test(m[1]); };
  const live = tags.filter((m) => !inHtmlComment(m.index) && runnableType(m[0]));
  ok(`⑥ ${pg.file} 가 공용 판정 파일을 «한 번» 싣는다(?v= 포함 · 주석 밖 · 실행되는 type)`, tags.length === 1 && live.length === 1,
    { tags: tags.length, live: live.length });
  const tagAt = live.length ? live[0].index : -1;
  const { at, code } = fnBody(html, pg.head);
  ok(`⑥ ${pg.file} 의 maybeAdjustRate 를 오려 냈다(전제)`, at > 0 && code.length > 0, at);
  ok(`⑥ ${pg.file} 는 판정 파일을 그 함수보다 먼저 싣는다`, tagAt > 0 && tagAt < at, { tagAt, at });
  ok(`⑥ ${pg.file} 의 maybeAdjustRate 에 낱말 판정이 남아 있지 않다(공용 판정만 부른다)`,
    /MangoiRateRequest\.judge\(/.test(code) && !/\/\(천천히|slow\(ly|faster\|speed up|빠르게\|더/.test(code), code.slice(0, 300));
  const s0 = html.indexOf(pg.send), c0 = s0 < 0 ? -1 : html.indexOf(pg.call, s0);
  ok(`⑥ ${pg.file} 의 보내기(sendMsg)가 그 함수를 «주석 밖에서» 부른다`, s0 > 0 && c0 > s0 && deadAt(html, c0, s0) === '', { s0, c0, why: c0 > 0 ? deadAt(html, c0, s0) : 'missing' });

  // 보내기를 «그 호출까지» 실제로 돌린다 — 학생 말이 그대로 그 함수에 닿는가(`if (false)` 로 막으면 0번).
  //   🎤 음성으로 온 경우를 «짝으로» 돌린다 — 아이들은 대개 말로 한다. 음성 표시(_pendingVoice·_latSilence·_recognizing …)가
  //   늘 «없음» 인 채로만 돌리면 `if (!_pendingVoice)`·`if(!_micStopWanted)` 로 음성 경로만 막아도 초록이다(함정 대조 2회차 실측).
  const typed = '천천히 말해 줘';
  const mkScope = (said, voice) => (isAF
    ? { document: { getElementById: (id) => (id === 'msgInput' ? { value: '  ' + typed + ' ' } : { disabled: false }) }, window: {},
        _recognizing: false, _pendingVoice: voice, maybeAdjustRate: (t) => said.push(t) }
    : { __mkReady(P) { this.warmupRatePreference = { ready: P.resolve() }; }, _warmPaused: false, _warmEpoch: 0, sending: false,
        document: { getElementById: () => ({ value: '  ' + typed + ' ' }) },
        _latSilence: voice ? { at: Date.now() } : null, _whisperOn: voice, _recognizing: voice, _recog: { stop() {} }, _warmVoiceEpoch: 0,
        _stopSpeak() {}, MangoiVoice: { cancel() {} }, setMicState() {}, maybeAdjustRate: (t) => said.push(t) });
  for (const voice of [false, true]) {
    const said = [];
    let wireErr = '';
    if (c0 > s0 && s0 > 0) {
      try { runPrefix(html.slice(s0, c0 + pg.call.length), mkScope(said, voice)); } catch (e) { wireErr = String(e && e.message); }
    } else wireErr = 'cut-missing';
    ok(`⑥ ${pg.file}: 보내기를 실제로 돌리면 학생 말(앞뒤 공백 뺀 것)이 그 함수에 «정확히 한 번» 닿는다 — ${voice ? '🎤 음성으로 온 말' : '⌨️ 글로 친 말'}`,
      !wireErr && said.length === 1 && said[0] === typed, { said, wireErr });
  }

  // 가짜 속도 조절기로 실제로 돌린다 — 단계표는 화면에서 읽는다(손으로 베끼지 않는다)
  const st = stepsOf(html, isAF);
  ok(`⑥ ${pg.file}: 속도 단계표를 화면에서 읽었다(전제)`,
    !!st && (isAF ? Array.isArray(st.steps) && st.steps.length >= 3 && st.steps.includes(st.def) : st.max - st.min >= 2), st);
  if (!st) continue;
  const run = (text, withLib, start) => {
    const calls = [];
    const ctx = {
      window: withLib ? { MangoiRateRequest: { judge } } : {},
      RATE_STEPS_AF: isAF ? st.steps : [], RATE_DEFAULT_AF: isAF ? st.def : 0, currentRate: isAF ? (start === undefined ? st.def : start) : 0,
      applyRate(v) { calls.push(v); ctx.currentRate = v; },
      _rateLevel: isAF ? 0 : (start === undefined ? 3 : start), setRate(v) { calls.push(v); },
      Math, String,
    };
    try { vm.runInNewContext(code + '\nmaybeAdjustRate(__t);', Object.assign(ctx, { __t: text }), { timeout: 2000 }); }
    catch (e) { return 'THREW:' + (e && e.message); }
    return calls;
  };
  const same = (r, want) => Array.isArray(r) && r.length === want.length && r.every((v, i) => v === want[i]);
  const SLOW = '천천히 말해 줘', FAST = '더 빨리 말해 주세요';
  if (isAF) {
    const S = st.steps, di = S.indexOf(st.def), n = S.length;
    const rs = run(SLOW, true), rf = run(FAST, true);
    ok(`⑥ ${pg.file}: 「천천히 말해 줘」 → 한 칸 느리게 · 「더 빨리 말해 주세요」 → 한 칸 빠르게`, same(rs, [S[di - 1]]) && same(rf, [S[di + 1]]), { rs, rf });
    const edge = {
      second_slower: run(SLOW, true, S[1]), first_slower: run(SLOW, true, S[0]),
      penult_faster: run(FAST, true, S[n - 2]), last_faster: run(FAST, true, S[n - 1]),
      unknown_slower: run(SLOW, true, 0.9),
    };
    ok(`⑥ ${pg.file}: 경계 — 둘째 칸에서 느리게 → 첫 칸 · 첫 칸에서 더 느리게 → 그대로 · 끝 앞에서 빠르게 → 끝 칸 · 끝 칸에서 더 빠르게 → 그대로 · 모르는 값이면 «보통» 기준`,
      same(edge.second_slower, [S[0]]) && same(edge.first_slower, []) && same(edge.penult_faster, [S[n - 1]]) && same(edge.last_faster, []) && same(edge.unknown_slower, [S[di - 1]]), edge);
  } else {
    const rs = run(SLOW, true), rf = run(FAST, true);
    ok(`⑥ ${pg.file}: 「천천히 말해 줘」 → 한 칸 느리게 · 「더 빨리 말해 주세요」 → 한 칸 빠르게`, same(rs, [2]) && same(rf, [4]), { rs, rf });
    const edge = {
      second_slower: run(SLOW, true, st.min + 1), first_slower: run(SLOW, true, st.min),
      penult_faster: run(FAST, true, st.max - 1), last_faster: run(FAST, true, st.max),
    };
    const inRange = (r) => Array.isArray(r) && r.every((v) => v >= st.min && v <= st.max);
    ok(`⑥ ${pg.file}: 경계 — ${st.min + 1}단계에서 느리게 → ${st.min} · ${st.min}단계에서 더 느리게 → ${st.min} 아래로 안 감 · ${st.max - 1}단계에서 빠르게 → ${st.max} · ${st.max}단계에서 더 빠르게 → ${st.max} 위로 안 감`,
      same(edge.second_slower, [st.min]) && inRange(edge.first_slower) && same(edge.penult_faster, [st.max]) && inRange(edge.last_faster), edge);
  }
  const quiet = ['A snail is slow.', '빠르게 달려요', '천천히 걸어요', 'Cheetahs run faster.', '다시 말해 줘'].map((t) => [t, run(t, true)]).filter(([, r]) => !Array.isArray(r) || r.length);
  ok(`⑥ ${pg.file}: 대답(「A snail is slow.」·「빠르게 달려요」…)에는 속도를 안 건드린다(짝)`, quiet.length === 0, quiet);
  const noLib = run(SLOW, false);
  ok(`⑥ ${pg.file}: 판정 파일을 못 읽었으면 속도를 그대로 둔다(던지지 않는다)`, Array.isArray(noLib) && noLib.length === 0, noLib);
}

// ─── ⑦ 대조 — 예전 판정(2026-07-23 판, 두 화면 같은 식)은 이 대답들에 반응했다 ─────────────
const OLD = (t) => {
  const s = /(천천히|느리게|너무\s*빠르|못\s*알아|알아듣기)/.test(t) || /\b(slow(ly| down)?|too fast|more slowly|speak slower)\b/i.test(t);
  const f = /(빠르게|더\s*빨리)/.test(t) || /\b(faster|speed up)\b/i.test(t);
  return s ? 'slower' : f ? 'faster' : '';
};
const oldWrong = NONE.filter((t) => OLD(t) !== '');
ok('⑦ 대조: 예전 판정이었다면 위 대답 가운데 여럿에 속도가 바뀌었다(이 목록이 헛돌지 않는다)',
  oldWrong.length >= 20 && oldWrong.includes('A snail is slow.') && oldWrong.includes('빠르게 달려요'), { n: oldWrong.length });
if (!QUIET) console.log(`  ℹ️ 예전 판정이 잘못 반응하던 대답: ${oldWrong.length}개 / ${NONE.length}개`);

finish();
