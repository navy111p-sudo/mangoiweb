/*
 * forbidden_teacher_who_harness.mjs — 「강사 권한으로는 …」 거절이 «지금 로그인한 계정» 을 말하는가
 *   (2026-09-11 신설 — 사장님 지시 「강사 계정 문구에 계정 이름도 같이 넣어줘」)
 *
 * 왜 있나 — 2026-09-10 실사고
 *   사장님이 관리자 주소를 여셨는데 「강사 권한으로는 볼 수 없는 정보입니다」 한 줄만 나왔습니다.
 *   그 브라우저는 강선생님(hq_t_kang) 세션을 들고 있었는데(세션 쿠키는 브라우저당 한 개라
 *   뒤에 한 로그인이 앞을 덮습니다) 화면이 그 말을 안 해서, 사장님은 서버 설정을 의심하며
 *   반나절을 쓰셨습니다. 계정 한 줄이면 5초에 끝났을 일입니다.
 *
 * ⚠️ 문자열 하니스로는 원리상 못 잡는 종류입니다 — 함수도 값도 다 «있고» 틀린 것은
 *    «무슨 글자가 나오는가» 뿐입니다. 그래서 **정본을 실제로 돌려** 답을 봅니다.
 *
 * ⛔ 「막힌다」만 넣지 마세요 — «계정을 알면 붙는다» 와 «모르면 안 붙는다(지어내지 않는다)» 를
 *    **짝으로** 둡니다. 앞만 보면 «항상 붙이기» 도, 뒤만 보면 «전부 빈 값» 도 통과합니다.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CF = join(ROOT, 'cloudflare-deploy');
const SRC = join(CF, 'src');
const PUB = join(CF, 'public');

let PASS = 0, FAIL = 0;
const check = (name, cond, extra) => {
  if (cond) { PASS++; console.log('  OK   ' + name); }
  else { FAIL++; console.log('  ❌ FAIL ' + name + (extra ? ' — ' + extra : '')); }
};
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

/* 주석을 벗겨 낸 사본. 부정 검사(«이 문장이 없어야 한다»)는 **반드시** 이것으로 판정한다 —
   안 그러면 「왜 이렇게 했는지」 적은 내 주석이 걸려 자기 주석을 잡는다(이 저장소 상습 함정).
   ⚠️ 정규식 한 줄(`/\*[\s\S]*?\*\//g)로 지우지 말 것 — 문자열 속 짝 없는 «슬래시+별표» 하나에
      뒤가 통째로 사라진다(CLAUDE.md 2장, src/index.ts 에서 8만자가 증발한 전례). */
function stripComments(t) {
  let out = '', inBlock = false;
  for (const line of String(t).split('\n')) {
    let s = line;
    if (inBlock) {
      const e = s.indexOf('*/');
      if (e < 0) { out += '\n'; continue; }
      s = s.slice(e + 2); inBlock = false;
    }
    for (;;) {
      const b = s.indexOf('/*');
      const l = s.indexOf('//');
      if (b >= 0 && (l < 0 || b < l)) {
        const e = s.indexOf('*/', b + 2);
        if (e < 0) { s = s.slice(0, b); inBlock = true; break; }
        s = s.slice(0, b) + s.slice(e + 2);
        continue;
      }
      if (l >= 0) s = s.slice(0, l);
      break;
    }
    out += s + '\n';
  }
  return out.replace(/<!--[\s\S]*?-->/g, '');   // 화면 파일의 HTML 주석도 함께
}

// ══════════════════════════════════════════════════════════════════
console.log('\n① 정본을 «실제로 돌려» 본다 (src/forbidden-teacher.ts)');

const HELPER = join(SRC, 'forbidden-teacher.ts');
check('정본 파일이 있다', existsSync(HELPER));

let esbuildApi = null;
try { esbuildApi = createRequire(join(CF, 'package.json'))('esbuild'); } catch { /* 미설치 */ }

let M = null;
if (!esbuildApi) {
  console.log('  ⏭ esbuild 없음 — 실행 검증 건너뜀 (아래 배선 검사만 유효)');
} else {
  let ok = true, js = '';
  try { js = esbuildApi.transformSync(read(HELPER), { loader: 'ts', format: 'esm' }).code; }
  catch { ok = false; }
  check('정본을 컴파일해 실제로 돌릴 수 있다', ok);
  if (ok) M = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}

if (M) {
  const F = M.forbiddenTeacherBody;

  // ⓐ 이름 + 아이디 — 사장님이 실제로 부딪힌 계정 그대로
  const a = F({ username: 'hq_t_kang', name: '강선생님' });
  check('이름과 아이디를 함께 보여 준다', a.who === '강선생님(hq_t_kang)', 'who=' + a.who);
  check('본문에 그 계정이 들어 있다', a.message.includes('강선생님(hq_t_kang)'), a.message);
  check('영문에도 그 계정이 들어 있다', a.message_en.includes('강선생님(hq_t_kang)'), a.message_en);
  check('사람이 할 일을 말한다(다시 로그인)', /로그아웃|로그인/.test(a.message));
  check('영문도 할 일을 말한다', /[Ss]ign (out|back)/.test(a.message_en));

  // ⓑ 이름이 아이디와 «같은» 계정이 실재한다(mangoi_170) — 두 번 보여 주면 안 된다
  const b = F({ username: 'mangoi_170', name: 'mangoi_170' });
  check('이름이 아이디와 같으면 한 번만 보여 준다', b.who === 'mangoi_170', 'who=' + b.who);

  // ⓒ 이름이 없는 계정
  const c = F({ username: 'mangoi_042', name: '' });
  check('이름이 없으면 아이디만 보여 준다', c.who === 'mangoi_042', 'who=' + c.who);

  // ⓓ 🔴 짝 — «모르면 지어내지 않는다». 이 줄이 없으면 «항상 뭔가 붙이기» 도 통과한다.
  const d = F({ username: '', name: '' });
  check('계정을 모르면 계정 줄이 비어 있다', d.who_line === '' && d.who_line_en === '', 'who_line=' + d.who_line);
  /* ⚠️ 기본값은 «보다/쓰다» 를 안 가리는 말이어야 한다 — detail 없이 부르는 자리에
     삭제·저장이 섞여 있어 「볼 수 없는 정보」로 두면 막은 것과 다른 말을 한다. */
  check('계정을 모르면 본문이 사유만 남는다',
    d.message === '강사 권한으로는 쓸 수 없는 기능입니다.', d.message);
  check('기본 문구가 «본다» 로 좁혀져 있지 않다', !/볼 수 없는/.test(d.message), d.message);
  check('계정을 모를 때 빈 괄호가 안 생긴다', !/\(\s*\)/.test(d.message + d.message_en), d.message);
  check('who 가 null 이어도 던지지 않는다', (() => {
    try { return F(null).error === 'forbidden_teacher'; } catch { return false; }
  })());

  // ⓔ 자리별 사유(detail)가 기본 문구를 이긴다
  const e = F({ username: 'hq_t_kang', name: '강선생님' }, '강사는 급여 환율을 변경할 수 없습니다.');
  check('그 자리의 사유를 그대로 쓴다', e.message.startsWith('강사는 급여 환율을 변경할 수 없습니다.'), e.message);
  check('사유 뒤에 계정 줄이 붙는다', e.message.endsWith(e.who_line), e.message);

  // ⓕ 화면 다섯이 «붙이기만» 할 수 있도록 한 문장으로 떼어 준다
  check('who_line 이 완성된 한 문장이다', /^지금 로그인한 계정: .+/.test(a.who_line), a.who_line);
  check('message = 사유 + 공백 + who_line', a.message === '강사 권한으로는 쓸 수 없는 기능입니다. ' + a.who_line);
  check('message_en = 사유 + 공백 + who_line_en',
    a.message_en === 'This is not available with a teacher account. ' + a.who_line_en);

  // ⓖ 오류 코드는 바뀌면 안 된다 — 화면 다섯이 이 코드로 가른다
  check("error 코드는 여전히 'forbidden_teacher'", a.error === 'forbidden_teacher' && a.ok === false);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n② 서버 — 계정 없는 옛 리터럴이 남아 있지 않은가');

/* ⛔ 순수 «게이트» 함수 둘은 Response 를 만들지 않는다 — 코드만 돌려주고, 계정은
   «응답을 만드는 자리»(호출부)가 붙인다. 게이트에 계정을 넘기면 그 함수들의 기존
   하니스가 잡고 있는 입력 모양이 깨진다. 그래서 예외로 두고, 대신 아래에서
   «그 호출부가 헬퍼를 쓰는가» 를 따로 본다. */
const GATE_ALLOW = new Set(['class-teacher-move.ts', 'textbook-purge-gate.ts', 'forbidden-teacher.ts']);

const tsFiles = readdirSync(SRC).filter((f) => f.endsWith('.ts'));
const leftovers = [];
for (const f of tsFiles) {
  if (GATE_ALLOW.has(f)) continue;
  const body = stripComments(read(join(SRC, f)));
  // «error: 'forbidden_teacher'» 를 손으로 적은 리터럴이 남아 있으면 그 자리는 계정을 못 말한다.
  // ⚠️ 작은따옴표 한 모양만 보면 나중에 "forbidden_teacher" 로 적을 때 조용히 빠진다
  const n = (body.match(/error:\s*['\"]forbidden_teacher['\"]/g) || []).length;
  if (n) leftovers.push(f + '×' + n);
}
check('응답을 만드는 자리에 옛 리터럴이 0건', leftovers.length === 0, leftovers.join(', '));

/* 🪤 위 검사만 두면 «전부 지우기» 로도 통과한다 — 짝으로 «헬퍼를 실제로 쓰는가» 를 센다. */
let useCount = 0, useFiles = [];
for (const f of tsFiles) {
  if (f === 'forbidden-teacher.ts') continue;
  const body = stripComments(read(join(SRC, f)));
  const n = (body.match(/forbiddenTeacherBody\s*\(/g) || []).length;
  if (n) { useCount += n; useFiles.push(f + '×' + n); }
}
/* 📊 [잰 것 — 2026-09-11] 지금 44곳(옛 리터럴에서 전환한 42 + 순수 게이트 호출부 2).
   ⛔ 정확한 수로 못 박지 말 것 — 새 API 가 생기면 정당하게 늘어난다. «확 줄지 않았나» 만 본다. */
check('헬퍼를 실제로 쓰는 자리가 넉넉히 있다 (≥ 40)', useCount >= 40, '지금 ' + useCount + '곳: ' + useFiles.join(', '));

/* 중앙 게이트 — 사장님이 실제로 부딪힌 그 자리. ⚠️ 여기가 빠지면 «URL 로 직접 연» 경우가
   전부 계정 없이 나간다(핸들러 가드는 그보다 뒤에서 돈다). */
const idx = stripComments(read(join(SRC, 'index.ts')));
check('중앙 강사 차단 게이트가 헬퍼를 쓴다',
  /_teacherBlocked[\s\S]{0,900}?forbiddenTeacherBody\(\s*_actor\s*,/.test(idx));
/* 그 자리는 «조회» 성격이라 고치기 전 문구를 그대로 넘긴다 — 기본값(중립)에 기대지 않는다 */
check('중앙 게이트가 고치기 전 문구를 그대로 넘긴다',
  /_teacherBlocked[\s\S]{0,900}?'강사 권한으로는 볼 수 없는 정보입니다\.'/.test(idx));

/* 순수 게이트 둘 — 그 «호출부» 가 forbidden_teacher 일 때 헬퍼로 바꿔 주는가 */
const adm = stripComments(read(join(SRC, 'api-admin.ts')));
check('textbookPurgeGate 호출부가 강사일 때 헬퍼로 답한다',
  /gate\.error === 'forbidden_teacher'\s*\?\s*forbiddenTeacherBody\(/.test(adm));
check('teacherMoveDenyReason 호출부가 강사일 때 헬퍼로 답한다',
  /_deny\.error === 'forbidden_teacher'[\s\S]{0,120}?forbiddenTeacherBody\(/.test(adm));

/* ⚠️ 액터를 «넘기지 않고» 부르면 계정 줄이 영영 비어 조용히 옛 동작으로 돌아간다.
   인자 없는 호출은 0건이어야 한다. */
const noArg = [];
for (const f of tsFiles) {
  const body = stripComments(read(join(SRC, f)));
  if (/forbiddenTeacherBody\(\s*\)/.test(body)) noArg.push(f);
}
check('계정을 안 넘기고 부르는 자리가 0건', noArg.length === 0, noArg.join(', '));

// ══════════════════════════════════════════════════════════════════
console.log('\n③ 화면 다섯 — 자기 문구를 쓰는 곳도 계정을 말하는가');

/* 이 다섯은 서버 message 를 «안 쓰고» 자기 문구를 그립니다. 서버만 고치면 여기서 그대로
   재발하므로(2026-09-11 실측) 각자 who_line 을 붙입니다. ⛔ 문장을 베껴 적지 않습니다. */
const SCREENS = [
  ['admin/refunds.html', 'who_line'],
  ['manager.html', 'who_line'],
  ['textbook-uploader.html', 'who_line'],
  ['js/adm-bulkbook.js', 'who_line'],
  ['js/monitor-wall.js', 'who_line'],
];
for (const [rel, key] of SCREENS) {
  const raw = read(join(PUB, rel));
  check(rel + ' 를 찾았다', raw.length > 100);
  const body = stripComments(raw);
  check(rel + ' 가 서버의 계정 줄을 읽는다', body.includes(key), '(' + key + ' 없음)');
}

/* 🔴 부정 검사 — 그 «문장» 을 화면이 베껴 적으면 정본이 여섯 벌이 되고, 문구를 고칠 때
   한쪽만 고쳐진다. 주석을 벗겨 낸 사본으로 판정한다(내 주석에 그 문장이 들어 있다). */
const copied = [];
for (const [rel] of SCREENS) {
  const body = stripComments(read(join(PUB, rel)));
  if (body.includes('지금 로그인한 계정')) copied.push(rel);
}
check('화면이 그 문장을 베껴 적지 않았다', copied.length === 0, copied.join(', '));

/* 🪤 EN/KO 를 가르는 화면은 영문 칸도 읽어야 한다 — 안 읽으면 영어 화면에서만 조용히 빠진다.
   ℹ️ `admin/refunds.html` 만 제외한다 — 그 alert 는 바탕 문장이 전부 한국어라 계정 줄만
      영어면 오히려 어긋난다(그 파일 주석에 같은 말을 적어 뒀다). 교재 업로더는 영어 한 줄을
      함께 그리므로 포함한다. */
for (const rel of ['manager.html', 'textbook-uploader.html', 'js/adm-bulkbook.js', 'js/monitor-wall.js']) {
  const body = stripComments(read(join(PUB, rel)));
  check(rel + ' 는 영문 계정 줄도 읽는다', body.includes('who_line_en'));
}

/* ══ ③-2 화면 함수를 «오려 내 실제로 돌린다» ══════════════════════════════════
   ⚠️ 「who_line 이라는 글자가 있다」는 «그 글자가 화면에 나온다» 가 아니다. 붙이는 자리를
      틀리거나 EN/KO 를 바꿔 달아도 문자열 검사는 초록이다. 그래서 두 화면의 문구 함수를
      실제로 돌려 **나온 글자**를 본다. ⛔ 짝으로 «계정을 안 주면 안 붙는다» 도 본다. */
console.log('\n③-2 화면 문구 함수를 실제로 돌린다');

/** 중괄호 짝으로 함수 하나를 오려 낸다 — ⛔ 길이로 자르지 말 것(옆 함수가 딸려 온다). */
function fnAt(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  const s0 = src.indexOf('{', i);
  if (s0 < 0) return '';
  let d = 0;
  for (let k = s0; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}

const SERVER_403 = M ? M.forbiddenTeacherBody({ username: 'hq_t_kang', name: '강선생님' }) : null;

if (SERVER_403) {
  // ⓐ 매니저 화면 — reqErrOf(st, j)
  const mgr = read(join(PUB, 'manager.html'));
  const reqErrOf = fnAt(mgr, 'function reqErrOf(');
  check('manager.html 의 reqErrOf 를 오려 냈다', reqErrOf.length > 80);
  if (reqErrOf) {
    const mk = (en) => {
      try {
        return new Function('T', 'EN', reqErrOf + '\nreturn reqErrOf;')((e, k) => (en ? e : k), () => en);
      } catch { return null; }
    };
    const koFn = mk(false), enFn = mk(true);
    check('reqErrOf 를 실제로 돌릴 수 있다', typeof koFn === 'function');
    if (koFn && enFn) {
      const got = koFn(403, SERVER_403);
      check('매니저 화면이 계정을 말한다', got.includes('강선생님(hq_t_kang)'), got);
      const gotEn = enFn(403, SERVER_403);
      check('매니저 화면 영문도 계정을 말한다', gotEn.includes('강선생님(hq_t_kang)'), gotEn);
      // 🔑 짝 — 서버가 계정을 안 주면 붙이지 않는다(지어내지 않는다)
      const bare = koFn(403, { ok: false, error: 'forbidden_teacher' });
      check('계정을 안 주면 매니저 화면도 안 붙인다', !/지금 로그인한 계정/.test(bare), bare);
      // 🔑 짝 — 다른 오류에는 계정 줄이 안 붙는다(엉뚱한 데로 새지 않는다)
      const other = koFn(409, { ok: false, error: 'already_decided' });
      check('다른 오류에는 계정 줄이 안 붙는다(매니저)', !/지금 로그인한 계정/.test(other), other);
    }
  }

  // ⓑ 교재 일괄배정 — failText(j, status)
  const bulk = read(join(PUB, 'js/adm-bulkbook.js'));
  const tbl = (bulk.match(/var FAIL_TEXT = \{[\s\S]*?\n  \};/) || [])[0] || '';
  const failText = fnAt(bulk, 'function failText(');
  check('adm-bulkbook 의 FAIL_TEXT·failText 를 오려 냈다', tbl.length > 100 && failText.length > 80);
  if (tbl && failText) {
    const mk = (en) => {
      try {
        return new Function('T', 'isEn', tbl + '\n' + failText + '\nreturn failText;')(
          (ko, en2) => (en ? en2 : ko), () => en);
      } catch { return null; }
    };
    const koFn = mk(false), enFn = mk(true);
    check('failText 를 실제로 돌릴 수 있다', typeof koFn === 'function');
    if (koFn && enFn) {
      const got = koFn(SERVER_403, 403);
      check('교재 일괄배정이 계정을 말한다', got.includes('강선생님(hq_t_kang)'), got);
      const gotEn = enFn(SERVER_403, 403);
      check('교재 일괄배정 영문도 계정을 말한다', gotEn.includes('강선생님(hq_t_kang)'), gotEn);
      const bare = koFn({ ok: false, error: 'forbidden_teacher' }, 403);
      check('계정을 안 주면 교재 일괄배정도 안 붙인다', !/지금 로그인한 계정/.test(bare), bare);
      /* ⚠️ 이 화면은 who_line 이 «실려 오면» 어느 코드에든 붙입니다 — 그게 무해한 이유는
         **서버가 forbidden_teacher 에만 싣기** 때문입니다. 그래서 여기서는 «안 실렸으면
         안 붙는다» 까지만 보장하고, 진짜 보장은 바로 아래 서버 쪽에서 봅니다.
         ⛔ 검사 이름을 «다른 오류에는 안 붙는다» 로 적지 말 것 — 보장보다 넓습니다. */
      const other = koFn({ ok: false, error: 'no_scope' }, 403);
      check('계정 줄이 안 실려 오면 다른 오류에도 안 붙는다(교재 일괄배정)',
        !/지금 로그인한 계정/.test(other), other);
      /* 🔑 진짜 보장 — 계정 줄을 «만드는» 곳이 정본 하나뿐이고, 그 함수는 언제나
         error:'forbidden_teacher' 를 함께 답니다(다른 코드에는 실릴 길이 없습니다). */
      check('계정 줄은 forbidden_teacher 응답에만 실린다(정본이 그 코드를 함께 단다)',
        M.forbiddenTeacherBody({ username: 'x' }).error === 'forbidden_teacher');
    }
  }
}

// ══════════════════════════════════════════════════════════════════
console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL);
/* ⛔ 실패해도 종료코드 0 으로 나가지 말 것 — 이 저장소에는 「FAIL 을 찍고도 exit 0」 이라
   --fast 합계가 한 자리도 안 움직인 전례가 있다(CLAUDE.md 2장). */
process.exit(FAIL ? 1 : 0);
