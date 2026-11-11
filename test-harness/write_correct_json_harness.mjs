/**
 * write_correct_json_harness.mjs — AI 영작 첨삭 «모델 답 읽기» 감시 (2026-11-11)
 * ════════════════════════════════════════════════════════════════════════
 *  왜: 엘리더잼 원장님 피드백 — «수정된 문장이 원문과 똑같은데 75점, 빨간 줄도 없어요.»
 *      운영 D1 45건 중 8건: 모델은 제대로 고쳤는데(#87 은 85점·오류 목록까지) 줄바꿈 있는 글에
 *      파이썬식 """…""" 를 써서 JSON.parse 가 실패 → 서버가 «원문 = 수정본 · 75점» 을 지어내 내보냈다.
 *  정본: cloudflare-deploy/src/llm-json.ts  ·  배선: cloudflare-deploy/src/api-ai-writing.ts
 *
 *  A. 운영 실패 모양 그대로(""" · 문자열 안 날 줄바꿈 · 코드펜스 · 뒤에 붙은 설명의 } · 꼬리 쉼표) → 읽힌다
 *  B. 퍼즈 — 멀쩡한 JSON 은 «한 글자도» 안 바뀐다(문자열 안 """ · } · 따옴표 · 역슬래시 포함)
 *  C. 못 읽는 답(잘림·배열·쓰레기)은 null, 무작위 입력에 던지지 않는다
 *  D. 샌드박스 — api-ai-writing.ts 를 esbuild 로 실번들, 가짜 AI·D1 로 handleWritingApi 를 직접 부른다
 *     (""" 답 → 빨간 줄(issues) 그대로 · 못 읽으면 다음 모델 · 전부 못 읽으면 ok:false, 기록·포인트 없음)
 *  E. 변이시험 — 정본의 """ 처리를 일부러 지우면 A 가 실제로 FAIL 나는가
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CF = join(ROOT, 'cloudflare-deploy');
const SRC_PATH = join(CF, 'src/llm-json.ts');
const LJ_SRC = readFileSync(SRC_PATH, 'utf8');
const SEED = Number(process.env.LLMJSON_SEED || 20261111) >>> 0;

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ' — ' + extra : '')}`);
}
const TMP = mkdtempSync(join(tmpdir(), 'llmjson-'));
let seq = 0;
async function load(src) {
  const p = join(TMP, `llm-json-${++seq}.mjs`);
  writeFileSync(p, stripTypeScriptTypes(src));
  return import(pathToFileURL(p).href);
}

// #87 운영 답의 앞부분(발췌 그대로) + 나머지는 같은 모양으로 채움
const STUDENT_87 = "Today is my birthday.\nThe friends are in my house, and this place is my house.\nThey give me birthday present.\nI can see my friends, foods, and birthday present.\n\n\nThe friends sing a birthday song.\nThen I blow the candles.\nI think it is because congrats my birthday.\nAnd we ate cake, play game, sing a song, and have great time.\n\nThey look happy. and I'm happy too.\nIt is a great birthday party!\nI like my friends very much.";
const CORR_87 = "Today is my birthday.\nMy friends are in my house, and this place is my home.\nThey give me a birthday present.\nI can see my friends, food, and birthday presents.\n\n\nMy friends sing a birthday song.\nThen I blow out the candles.\nI think it is because they are congratulating me on my birthday.\nAnd we eat cake, play games, sing songs, and have a great time.\n\nThey look happy, and I'm happy too.\nIt is a great birthday party!\nI like my friends very much.";
const RAW_87 = `{\n  "corrected": """${CORR_87}""",\n  "score": 85,\n  "issues": [\n    {"original": "I blow the candles", "suggested": "I blow out the candles", "category": "error", "reason": "촛불을 끌 때는 blow out 을 써요."},\n    {"original": "play game", "suggested": "play games", "category": "error", "reason": "여러 게임이면 복수형을 써요."}\n  ],\n  "tip": "동사 시제를 하나로 맞춰 보세요.",\n  "reply": "Happy birthday! What was your favorite present?",\n  "upgrades": []\n}`;

async function sectionA(M, label = '') {
  const bad = [];
  const t = (name, cond) => { if (!cond) bad.push(name); if (!label) check(name, cond); };
  const p87 = M.parseLlmJson(RAW_87);
  t('A1 #87 """…""" 답이 읽힌다', !!p87);
  t('A2 #87 corrected 가 모델 문장 그대로(줄바꿈 포함)', p87 && p87.corrected === CORR_87);
  t('A3 #87 점수 85 · 오류 2개(빨간 줄 근거)가 살아 있다', p87 && p87.score === 85 && Array.isArray(p87.issues) && p87.issues.length === 2);
  const p58 = M.parseLlmJson('{\n  "corrected": "A boy is blowing out the candles.\nThis place is my house.",\n  "score": 80, "issues": []\n}');
  t('A4 문자열 안 날 줄바꿈 → 읽힌다', p58 && p58.corrected === 'A boy is blowing out the candles.\nThis place is my house.');
  const pf = M.parseLlmJson('Here is the JSON:\n```json\n{"corrected":"Hi.","score":90}\n```\nHope this helps {smile}!');
  t('A5 코드펜스 + 앞뒤 설명(뒤에 } 있음) → 첫 객체만', pf && pf.corrected === 'Hi.' && pf.score === 90);
  const pc = M.parseLlmJson('{"corrected":"Hi.","issues":[{"original":"a","suggested":"b",},],}');
  t('A6 꼬리 쉼표 → 읽힌다', pc && pc.issues.length === 1 && pc.issues[0].suggested === 'b');
  const pt = M.parseLlmJson('{"corrected":"Col1\tCol2"}');
  t('A7 문자열 안 날 탭 → \\t', pt && pt.corrected === 'Col1\tCol2');
  const pq = M.parseLlmJson('{"corrected": """She said "hi" and left.\nThe end.""", "score": 70}');
  t('A8 """ 안의 따옴표·줄바꿈도 그대로', pq && pq.corrected === 'She said "hi" and left.\nThe end.' && pq.score === 70);
  t('A9 이미 객체면 그대로 · 배열 객체는 null', M.parseLlmJson({ a: 1 }).a === 1 && M.parseLlmJson([1]) === null);
  // 2026-11-11 스트레스가 찾은 것: 고친 문장이 따옴표로 끝나면 닫는 """ 앞에 " 가 하나 더 붙는다
  const pe = M.parseLlmJson('{"corrected": """They said "Happy birthday!"""", "score": 90}');
  t('A10 """ 내용이 " 로 끝나도(…!"""") 그대로', pe && pe.corrected === 'They said "Happy birthday!"' && pe.score === 90);
  const pb = M.parseLlmJson('Format {corrected, score}:\n{"corrected":"Hi.","score":80}');
  t('A11 앞 설명에 {…} 가 있어도 진짜 답을 고른다', pb && pb.corrected === 'Hi.' && pb.score === 80);
  const pv = M.parseLlmJson('Example: {"score": 0}\n{"corrected":"Hi.","score":80,"issues":[]}');
  t('A12 앞 설명의 {…} 가 그 자체로 JSON 이어도 더 긴 진짜 답을 고른다', pv && pv.corrected === 'Hi.' && pv.score === 80);
  // 운영 #57·#58 발췌 그대로: 빈 reason 을 "" 대신 """ 로 씀
  const p57 = M.parseLlmJson('{\n  "corrected": "It\'s my birthday and I blew out the candles.",\n  "score": 80,\n  "issues": [\n    {"original": "I blow out the Kindle Fire", "suggested": "I blew out the candles", "reason": """},\n    {"original": "some color gift", "suggested": "some colorful gifts", "reason": ""}\n  ]\n}');
  t('A13 #57 «"reason": """}» → 빈 이유로 읽힌다', p57 && p57.score === 80 && p57.issues.length === 2 && p57.issues[0].reason === '' && p57.issues[1].suggested === 'some colorful gifts');
  return bad;
}

console.log('\nA. 운영 실패 모양 → 읽힌다');
const M = await load(LJ_SRC);
await sectionA(M);

console.log('\nB. 퍼즈 — 멀쩡한 JSON 은 안 바뀐다');
let s = SEED;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const PIECES = ['a', 'Hello', ' ', '"', '\\', '\n', '\t', '}', '{', ']', '[', ',', '"""', "I'm", '한글', '→', '✅', ':', ' ', '\r\n', '""'];
const rstr = () => Array.from({ length: Math.floor(rnd() * 8) }, () => pick(PIECES)).join('');
function robj(d) {
  const o = {};
  const n = 1 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const k = rstr() || 'k' + i;
    const r = rnd();
    o[k] = d > 2 || r < 0.4 ? rstr() : r < 0.55 ? Math.floor(rnd() * 100) : r < 0.65 ? null : r < 0.75 ? rnd() < 0.5
      : r < 0.88 ? Array.from({ length: Math.floor(rnd() * 3) }, () => (rnd() < 0.5 ? rstr() : robj(d + 1))) : robj(d + 1);
  }
  return o;
}
let fuzzBad = 0, fuzzFirst = '';
const N = 3000;
for (let i = 0; i < N; i++) {
  const o = robj(0);
  const body = rnd() < 0.5 ? JSON.stringify(o) : JSON.stringify(o, null, 2);
  const wrap = pick([(b) => b, (b) => 'Sure!\n' + b, (b) => '```json\n' + b + '\n```', (b) => b + '\nNote: {done}']);
  const got = M.parseLlmJson(wrap(body));
  if (!isDeepStrictEqual(got, o)) { fuzzBad++; if (!fuzzFirst) fuzzFirst = body.slice(0, 160); }
}
check(`B1 무작위 객체 ${N}건 — 읽은 값 = 원래 값 (씨앗 ${SEED})`, fuzzBad === 0, `${fuzzBad}건 다름 · 예: ${fuzzFirst}`);

console.log('\nC. 못 읽는 답은 null, 던지지 않는다');
check('C1 잘린 답(닫는 } 없음) → null', M.parseLlmJson(RAW_87.slice(0, RAW_87.length - 40)) === null);
check('C2 닫히지 않은 """ → null', M.parseLlmJson('{"corrected": """Today is my birthday.\nMy friends') === null);
check('C3 평문·빈 값·null·숫자 → null', [ 'I cannot help with that.', '', null, undefined, 42 ].every((x) => M.parseLlmJson(x) === null));
check('C4 최상위 배열 문자열 → 그 안 첫 객체만', isDeepStrictEqual(M.parseLlmJson('[{"a":1},{"b":2}]'), { a: 1 }));
let threw = 0;
for (let i = 0; i < 3000; i++) { try { M.parseLlmJson(Array.from({ length: Math.floor(rnd() * 30) }, () => pick(PIECES)).join('')); } catch { threw++; } }
check('C5 무작위 쓰레기 3000건 — 한 번도 던지지 않는다', threw === 0, `${threw}번 던짐`);

console.log('\nD. 샌드박스 — handleWritingApi 실번들 + 가짜 AI·D1');
const outFile = join(TMP, 'api-ai-writing.bundle.mjs');
const RUN_ESBUILD = (p, args) => (process.platform === 'win32'
  ? execFileSync(process.execPath, [p, ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
  : execFileSync(p, args, { stdio: ['ignore', 'ignore', 'pipe'] }));
let handleWritingApi = null;
try {
  RUN_ESBUILD(join(CF, 'node_modules', 'esbuild', 'bin', 'esbuild'), [join(CF, 'src', 'api-ai-writing.ts'),
    '--bundle', '--format=esm', '--platform=neutral', '--target=es2022', `--outfile=${outFile}`]);
  ({ handleWritingApi } = await import(pathToFileURL(outFile).href));
} catch (e) {
  console.log('     ' + String((e && e.stderr) || (e && e.message) || e).split('\n')[0]);
}
check('D0 api-ai-writing.ts 번들·로드', typeof handleWritingApi === 'function');

function fakeEnv(replies) {
  const sql = [];
  const calls = [];
  const stmt = (q) => {
    const st = { bind: () => st, run: async () => { sql.push(q); return { meta: { last_row_id: 1 } }; }, first: async () => null, all: async () => ({ results: [] }) };
    return st;
  };
  return {
    sql, calls,
    env: {
      DB: { exec: async (q) => { sql.push(q); }, prepare: (q) => stmt(q) },
      // replies[i]: 문자열 = { response: 문자열 } · Error = 던짐 · 함수 = (모델, 옵션) → 응답 그대로(던져도 됨)
      AI: { run: async (m, opts) => { calls.push({ m, opts: JSON.parse(JSON.stringify(opts)) }); const r = replies[calls.length - 1]; if (typeof r === 'function') return r(m, opts); if (r instanceof Error) throw r; return { response: r }; } },
    },
  };
}
async function callCorrect(replies, text = STUDENT_87) {
  const f = fakeEnv(replies);
  const url = new URL('https://mangoi.ai/api/ai/write-correct');
  const req = new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, level: 'B1', uid: '' }) });
  const res = await handleWritingApi(req, url, f.env);
  return { status: res.status, d: await res.json(), ...f };
}
if (handleWritingApi) {
  const r1 = await callCorrect([RAW_87]);
  check('D1 """ 답 → ok · 모델 1번만 부름', r1.d.ok === true && r1.calls.length === 1);
  check('D2 수정본 = 모델 문장(원문 그대로가 아님)', r1.d.corrected === CORR_87 && r1.d.corrected !== STUDENT_87);
  check('D3 점수 = 모델 점수 85(기본값 75 아님)', r1.d.score === 85);
  check('D4 빨간 줄(issues) 2개가 화면으로 나간다', Array.isArray(r1.d.issues) && r1.d.issues.length === 2 && r1.d.issues[0].suggested === 'I blow out the candles');
  check('D5 답장·팁도 모델 것', r1.d.reply.startsWith('Happy birthday') && r1.d.tip.includes('시제'));
  check('D6 기록 1건 저장', r1.sql.filter((q) => /INSERT INTO ai_writing_corrections/.test(q)).length === 1);

  const r2 = await callCorrect(['Sorry, here you go: {"corrected": "oops"', RAW_87]);
  check('D7 1번 모델 답이 잘림 → 2번 모델로 넘어가 ok', r2.d.ok === true && r2.calls.length === 2 && r2.d.score === 85);
  const r2b = await callCorrect([new Error('model down'), '', RAW_87]);
  check('D8 1번 예외 · 2번 빈 답 → 3번 모델로 ok', r2b.d.ok === true && r2b.calls.length === 3);

  const r3 = await callCorrect(['not json at all', '{"score": 90}', '{"corrected": """cut']);
  check('D9 전부 못 읽음 → ok:false · 502 · ai_unreadable', r3.d.ok === false && r3.status === 502 && r3.d.error === 'ai_unreadable');
  check('D10 그때 «원문=수정본·75점» 을 지어내지 않는다', r3.d.corrected === undefined && r3.d.score === undefined);
  check('D11 그때 첨삭 기록·포인트를 남기지 않는다', !r3.sql.some((q) => /INSERT INTO (ai_writing_corrections|point_)/.test(q)));
  check('D12 그때 실패 사유는 ai_failure_log 에 남긴다', r3.sql.some((q) => /INSERT INTO ai_failure_log/.test(q)));
  check('D13 오류 안내는 한국어·영어 둘 다', /[가-힣]/.test(r3.d.detail || '') && /[A-Za-z]{4}/.test(r3.d.detail || ''));

  const r4 = await callCorrect([JSON.stringify({ corrected: 'I like cats.', score: 95, issues: [], tip: '잘 썼어요.', reply: 'Me too!', upgrades: [] })], 'I like cats.');
  check('D14 멀쩡한 JSON(고칠 곳 없음) → 그대로 ok · 95점', r4.d.ok === true && r4.d.score === 95 && r4.d.issues.length === 0);
  const sc = async (v) => (await callCorrect([JSON.stringify({ corrected: 'I like dogs.', score: v })], 'I like cats.')).d.score;
  check('D15 점수가 "high"·85.5·"88"·120·-5 여도 0~100 정수', (await sc('high')) === 75 && (await sc(85.5)) === 86 && (await sc('88')) === 88 && (await sc(120)) === 100 && (await sc(-5)) === 0);

  console.log('\nF. 원인 차단 — JSON 모드 · 프롬프트 · 답 길이 (호출 옵션을 «실제로» 본다)');
  const OBJ87 = { corrected: CORR_87, score: 85, issues: [{ original: 'I blow the candles', suggested: 'I blow out the candles', category: 'error', reason: '촛불을 끌 때는 blow out 을 써요.' }], tip: '잘했어요.', reply: 'Happy birthday!', upgrades: [] };
  const f1 = await callCorrect([JSON.stringify(OBJ87)]);
  const o1 = f1.calls[0].opts;
  check('F1 AI 호출에 JSON 모드(response_format json_object)가 실린다', o1.response_format && o1.response_format.type === 'json_object');
  check('F2 답 길이 상한이 2000자 글을 담을 만큼(≥2500) — 선언이 아니라 호출 옵션', o1.max_tokens >= 2500);
  const pr = o1.messages[0].content;
  check('F3 프롬프트가 학생 글을 """ 로 감싸지 않고 JSON 문자열로 보낸다', !pr.includes('"""' + STUDENT_87) && pr.includes(JSON.stringify(STUDENT_87)));
  check('F4 프롬프트에 소스 주석(한국어 메모)이 새지 않는다', !/운영 6\/8건|⚠️/.test(pr));
  check('F5 프롬프트가 «줄바꿈은 \\n · """ 금지» 를 말한다', pr.includes('\\n') && /never use triple quotes/i.test(pr));
  const rfReject = (m, o) => { if (o.response_format) throw new Error('400 Bad Request: response_format is not supported by this model'); return { response: JSON.stringify(OBJ87) }; };
  const f6 = await callCorrect([rfReject, rfReject]);
  check('F6 모델이 JSON 모드를 거부하면 같은 모델을 JSON 모드 없이 한 번 더 → ok', f6.d.ok === true && f6.calls.length === 2 && f6.calls[0].m === f6.calls[1].m && !f6.calls[1].opts.response_format);
  const f7 = await callCorrect([new Error('429 Too Many Requests'), new Error('400 Bad Request — rate limit exceeded'), JSON.stringify(OBJ87)]);
  check('F7 429·«400+rate limit» 은 JSON 모드를 끄지 않고 다음 모델로(모두 JSON 모드 유지)', f7.d.ok === true && f7.calls.length === 3 && new Set(f7.calls.map((c) => c.m)).size === 3 && f7.calls.every((c) => c.opts.response_format));
  const f8 = await callCorrect([() => ({ response: OBJ87 })]);
  check('F8 JSON 모드가 «이미 객체» 로 줘도 읽는다([object Object] 아님)', f8.d.ok === true && f8.d.corrected === CORR_87 && f8.d.issues.length === 1);
  const f9 = await callCorrect([() => ({ result: { response: OBJ87 } })]);
  check('F9 result.response 모양도 읽는다', f9.d.ok === true && f9.d.corrected === CORR_87);
  const f10 = await callCorrect([() => ({ response: { score: 90 } }), () => ({ response: [OBJ87] }), () => ({ response: OBJ87 })]);
  check('F10 corrected 없는 객체·배열 객체는 못 읽음으로 보고 다음 모델', f10.d.ok === true && f10.calls.length === 3);
  const f11 = await callCorrect([() => ({ response: '' }), () => ({}), () => null]);
  check('F11 빈 답·빈 객체·null 만 오면 솔직한 실패', f11.d.ok === false && f11.status === 502 && f11.calls.length === 3);
}

console.log('\nE. 변이시험 — 정본을 고장 내면 잡히는가');
const mutants = [
  ['""" 처리 제거', LJ_SRC.replace("if (s.startsWith('\"\"\"', i)) {", "if (false) {")],
  ['문자열 안 줄바꿈 이스케이프 제거', LJ_SRC.replace("out += c === '\\n' ? '\\\\n'", "out += c === '\\u0000' ? '\\\\n'")],
  ['꼬리 쉼표 제거 끔', LJ_SRC.replace("out = out.replace(/,\\s*$/, '');", "out = out;")],
  ['«"""} = 빈 값» 처리 제거', LJ_SRC.replace("if (/^\\s*[,}\\]]/.test(s.slice(i + 3, i + 40))) { out += '\"\"'; i += 2; continue; }", '')],
  ['닫는 따옴표 묶음 처리 제거',LJ_SRC.replace("while (s[end + 3] === '\"') end++;", '')],
  ['«가장 긴 덩어리» 대신 첫 덩어리만', LJ_SRC.replace('if (body.length <= bestLen) continue;', 'if (bestLen >= 0) break;')],
];
for (const [name, src] of mutants) {
  if (src === LJ_SRC) { check(`E 변이 «${name}» 적용됨`, false, '치환 대상 문자열을 못 찾음 — 정본이 바뀌었으면 하니스도 맞출 것'); continue; }
  const bad = await sectionA(await load(src), name);
  check(`E 변이 «${name}» → A 가 FAIL 로 잡는다`, bad.length > 0);
}

console.log(`\n${FAIL ? '❌' : '✅'} ${PASS} PASS · ${FAIL} FAIL`);
if (FAIL) { console.log('   ' + FAILS.join('\n   ')); process.exit(1); }
