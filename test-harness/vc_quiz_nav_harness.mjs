/**
 * 🧠 수업 안 복습퀴즈 «넘기기» 가드 — 강사 LEN ① (Melca 테스트)
 *
 *   "The student cannot navigate the quiz." / "학생이 퀴즈를 넘길 수가 없습니다."
 *
 * 원인은 두 겹이었다.
 *   ① 「다음 →」 은 답을 고르기 전엔 disabled 인데, 화면에는 «흐린 버튼» 만 있고
 *      왜 안 눌리는지 한 글자도 없었다 → 학생 눈에는 고장난 버튼.
 *      특히 듣기 문항은 소리를 못 들으면(자동재생 차단) 답을 못 골라 영영 흐린 채로 남는다.
 *   ② 「다음 →」 은 보기 아래 «맨 끝» 에 그려지는데, 수업 중에는 하단 독이 position:fixed 로
 *      그 자리에 떠 있어 버튼을 덮는다 → 스크롤해도 «버튼이 없는» 것처럼 보인다.
 *
 * ⚠️ 고치는 방향을 틀리면 안 되는 지점: 버튼을 «항상 켜는» 것은 해결이 아니다.
 *    답 없이 넘어가면 빈칸이 채점에 제출된다. 켜는 게 아니라 «왜 꺼져 있는지» 를 말해 줘야 한다.
 *
 * 실행: node test-harness/vc_quiz_nav_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = process.env.MANGOI_PUB || join(ROOT, 'cloudflare-deploy', 'public');
const js = readFileSync(join(PUB, 'js', 'idx-x8.js'), 'utf8');
const html = readFileSync(join(PUB, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
const check = (n, c, d) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; failures.push(n + (d ? ' — ' + d : '')); console.log('  ❌ ' + n + (d ? '\n       ' + d : '')); }
};

console.log('\n════════ 학생이 퀴즈를 넘길 수 있는가 ════════\n');

/* ── ① 왜 안 눌리는지 말해 주는가 ───────────────────────── */
console.log('▶ ① 「다음」이 꺼져 있는 이유를 알려 주는가');

const s = js.indexOf('var _need = (st.answers[i]');
const e = js.indexOf('var nav =', s);
const block = s >= 0 && e > s ? js.slice(s, e) : '';
check('안내문 생성 코드를 찾았다', block.length > 200);

if (block.length > 200) {
  const run = (answer, typ, en) => {
    const sandbox = { st: { answers: { 0: answer } }, i: 0, typ, isEn: () => en };
    vm.createContext(sandbox);
    vm.runInContext(block + '\nthis.__out = _needMsg;', sandbox, { timeout: 2000 });
    return sandbox.__out;
  };
  const unanswered = run(null, 'mcq', false);
  const answered   = run('A',  'mcq', false);
  check('답을 고르기 «전» 에는 안내가 나온다', unanswered.includes('먼저 답을 고르세요'));
  check('답을 고른 «뒤» 에는 안내가 사라진다', answered === '',
        '고른 뒤에도 남으면 잔소리가 된다');
  check('빈 문자열 답도 «안 고른 것» 으로 본다', run('', 'mcq', false).includes('먼저 답을'));
  const en = run(null, 'mcq', true);
  check('영어 강사·학생에게도 나온다 (한/영)', en.includes('Pick an answer first'), en.slice(0, 60));
  const listen = run(null, 'listen', false);
  check('듣기 문항이면 «다시 듣기» 도 함께 안내한다', listen.includes('다시 듣기'),
        '소리를 못 들으면 답을 고를 수 없어 영영 못 넘어간다');
  check('듣기가 아닌 문항엔 그 안내를 붙이지 않는다', !unanswered.includes('다시 듣기'));
  const listenEn = run(null, 'listen', true);
  check('듣기 안내도 한/영 둘 다', listenEn.includes('Play again'));
}

check('⛔ 버튼을 «항상 켜는» 것으로 바꾸지 않았다 (빈칸 제출 방지)',
      /st\.answers\[i\]==null\|\|st\.answers\[i\]===''\?'disabled':''/.test(js.replace(/\s/g, '')),
      '답 없이 넘어가면 채점이 빈칸으로 들어간다');

/* ── ② 하단 독이 덮지 않는가 ────────────────────────────── */
console.log('\n▶ ② 하단 독이 「다음」 버튼을 덮지 않는가');
check('안전지대 스타일이 있다', /id="rqv-dock-clearzone"/.test(html));
check('수업 중에는 독 높이만큼 아래 여백을 둔다',
      /body\.vc-in-call #rqv-body\s*\{\s*padding-bottom:\s*(\d+)px/.test(html) &&
      Number(/body\.vc-in-call #rqv-body\s*\{\s*padding-bottom:\s*(\d+)px/.exec(html)[1]) >= 90,
      '독 높이(약 90px+안전영역)보다 커야 한다');
check('독을 위로 올리거나 접으면 여백을 되돌린다 (빈 공간 낭비 방지)',
      /vc-dock-top #rqv-body[\s\S]{0,120}padding-bottom:\s*16px/.test(html) &&
      /vc-dock-collapsed #rqv-body/.test(html));
check('padding 을 인라인에 두지 않았다 (인라인이면 CSS 로 못 덮는다)',
      /id="rqv-body" style="flex:1;min-height:0;overflow-y:auto"/.test(html),
      '인라인 padding 이 남아 있으면 위 규칙이 전부 무시된다');
check('좌우·위 여백은 그대로다', /#rqv-body\s*\{\s*padding:\s*16px;\s*\}/.test(html));

/* ── ③ 듣기 소리가 학생에게 닿는가 ────────────────────────── */
console.log('\n▶ ③ 듣기 오디오 (Shas 5-a: "강사는 들리는데 학생은 안 들린다")');
/* 주석 안에는 «예전엔 이랬다» 는 설명으로 그 코드가 남아 있다 → 블록주석을 걷어내고 본다.
   (걷지 않으면 옳게 고쳐 놓고도 자기 설명 때문에 실패한다) */
const jsNoComment = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
check('재생 거부를 빈 catch 로 삼키지 않는다',
      !/a\.play\(\)\.catch\(function\(\)\{\}\)/.test(jsNoComment),
      '삼키면 «소리가 안 나는데 이유를 모르는» 상태가 된다 — 이게 학생이 퀴즈를 못 넘긴 뿌리');
check('재생 결과를 기다렸다가 «막힘» 으로 남긴다', /try \{ await a\.play\(\); \} catch\(err\)\{ blocked = true; \}/.test(js));
check('자동 재생은 «사람이 누른 게 아님» 을 표시한다', /rqvPlay\(i, true\)/.test(js),
      '막히는 게 정상이므로 실패로 취급하면 안 된다');
{
  const s2 = js.indexOf('function rqvSoundState(btn, s){');
  const e2 = js.indexOf('window.rqvPlay =', s2);
  const blk = s2 >= 0 && e2 > s2 ? js.slice(s2, e2) : '';
  check('소리 상태 표시 함수를 찾았다', blk.length > 200);
  if (blk.length > 200) {
    const run = (state, en) => {
      const seen = { hint: null, label: null, disabled: null };
      const btn = { style: {}, set textContent(v) { seen.label = v; }, get textContent() { return seen.label; },
                    set disabled(v) { seen.disabled = v; }, get disabled() { return seen.disabled; },
                    parentNode: { appendChild(n) { seen.hint = n.textContent; } } };
      const doc = { getElementById: () => null,
                    createElement: () => ({ style: {}, set textContent(v) { this._t = v; }, get textContent() { return this._t; } }) };
      Function('isEn', 'document', blk + '; return rqvSoundState;')(() => en, doc)(btn, state);
      return seen;
    };
    const blocked = run({ blocked: true, failed: false }, false);
    check('막히면 «눌러서 듣기» 로 바꾼다', /눌러서 문제 듣기/.test(blocked.label || ''), blocked.label);
    check('막히면 이유를 한 줄로 설명한다', /브라우저가 소리를 막았어요/.test(blocked.hint || ''), blocked.hint);
    check('막혀도 버튼은 눌 수 있어야 한다', blocked.disabled === false,
          'disabled 로 두면 학생이 소리를 켤 방법이 없다');
    const en = run({ blocked: true, failed: false }, true);
    check('영어도 함께', /Tap to hear the question/.test(en.label || '') && /blocked the sound/.test(en.hint || ''));
    const ok = run({ blocked: false, failed: false }, false);
    check('정상 재생이면 안내를 띄우지 않는다', ok.hint === null && /다시 듣기/.test(ok.label || ''));
    const fail = run({ blocked: false, failed: true }, false);
    check('TTS 자체가 실패한 경우와 구분한다', /음성 실패/.test(fail.label || '') && fail.hint === null);
  }
}

console.log('\n──────────────────────────────────────────');
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('──────────────────────────────────────────\n');
process.exit(fail ? 1 : 0);
