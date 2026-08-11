/**
 * 🎯🪞 「눌렀는데 아무 일도 안 일어난다」 — 강사 Shas 1·3·4번
 *
 *   4. Focus Mode: "버튼을 클릭해 보았으나 아무런 변화가 일어나지 않았습니다.
 *      기능이 활성화되었는지, 목적이 무엇인지 파악하기 어렵습니다."
 *   3. Lock Student Drawing: "기능 자체는 작동하지만 버튼을 찾기까지 여러 번 시도해야 했다.
 *      → 라벨을 명확히, 한데 모아, 툴팁을 달아 달라."
 *   1. AI Warm-up: "학생이 입력한 글이 강사 화면에 안 보이고, 강사가 Send 해도 학생에게 안 간다."
 *
 * [셋 다 «기능이 없다» 가 아니었다]
 *   · 집중 모드는 멀쩡히 학생의 탭 이탈을 막고 있었다. 다만 그 사실이 화면에 남지 않았다
 *     — 토스트는 몇 초 뒤 사라지고, 켠 «뒤» 들어온 학생은 그마저 못 본다.
 *   · 필기 잠금 버튼은 상단 툴바에 있었지만 옆 칩들과 생김새가 같아 «학생을 제어하는 것»
 *     이라는 신호가 없었고, 툴팁이 한 개도 없었다.
 *   · 웜업의 대화 상대는 **AI** 다. 서로에게 안 가는 것이 설계였는데, 화면이 그 말을
 *     하지 않아 강사가 «고장» 으로 읽었다. 진짜 빈 곳은 «학생이 뭘 하는지 볼 길이 없음» 이었다.
 *
 * ⚠️ 되돌리면 안 되는 것
 *   · 집중 모드 띠는 pointer-events:none — 수업 화면 위에 뜨므로 클릭을 가로채면
 *     «보이는데 눌리지 않는 유령 창» 사고가 난다(전례 있음).
 *   · 웜업은 양방향 채팅이 «아니다». 강사가 쓴 글이 학생에게 가게 만들면 안 된다.
 *
 * 실행: node test-harness/vc_teacher_controls_visible_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = process.env.MANGOI_PUB || join(ROOT, 'cloudflare-deploy', 'public');
const js   = readFileSync(join(PUB, 'js', 'idx-main.js'), 'utf8');
const html = readFileSync(join(PUB, 'index.html'), 'utf8');
const warm = readFileSync(join(PUB, 'warmup.html'), 'utf8');
let ts = '';
try { ts = readFileSync(join(ROOT, 'cloudflare-deploy', 'src', 'video-call-room.ts'), 'utf8'); } catch(_) {}

let pass = 0, fail = 0;
const failures = [];
const check = (n, c, d) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; failures.push(n + (d ? ' — ' + d : '')); console.log('  ❌ ' + n + (d ? '\n       ' + d : '')); }
};
const body = (src, start, end) => {
  const s = src.indexOf(start);
  if (s < 0) return '';
  const e = src.indexOf(end, s + start.length);
  return e > s ? src.slice(s, e) : src.slice(s, s + 4000);
};
/* 칩 하나의 여는 태그만 뽑는다 — 옆 칩의 title 을 자기 것으로 착각하지 않게. */
const tagOf = (id) => {
  const s = html.indexOf('id="' + id + '"');
  if (s < 0) return '';
  const open = html.lastIndexOf('<', s);
  const close = html.indexOf('>', s);
  return close > open ? html.slice(open, close + 1) : '';
};

console.log('\n════════ 강사가 «눌린 것을 알 수 있는가» (Shas 1·3·4) ════════\n');

/* ── ④ 집중 모드 ───────────────────────────────────────────────── */
console.log('▶ ④ 집중 모드 — 켜져 있는 «동안» 화면에 남는가');
check('띠를 그리는 함수가 있다', /window\.vcFocusBadge = function/.test(js));
const badge = body(js, 'window.vcFocusBadge = function', '\n};');
check('끌 때는 띠를 지운다', /if \(!on\) return;/.test(badge) && /old\.remove\(\)/.test(badge));
check('⚠️ 클릭을 가로채지 않는다 (pointer-events:none)', /pointer-events:none/.test(badge),
      '수업 화면 위에 뜨므로 «보이는데 눌리지 않는 유령 창» 이 된다');
check('강사와 학생에게 다른 말을 한다', /forStaff\s*\?/.test(badge));
check('강사: 무엇이 일어났는지 (한/영)',
      /집중 모드 켜짐/.test(badge) && /students cannot switch tabs/.test(badge));
check('학생: 무엇을 해야 하는지 (한/영)',
      /선생님 화면을 따라가요/.test(badge) && /follow your teacher/.test(badge));

const apply = body(js, 'window.vcFocusLockApply = function', '\n};');
check('학생 쪽: 상태가 바뀔 때마다 띠를 맞춘다', /vcFocusBadge\(locked, false\)/.test(apply));
check('«바뀌었을 때만» 이 아니라 항상 맞춘다 (늦게 들어온 학생·새로고침)',
      apply.indexOf('vcFocusBadge') < apply.indexOf('if (changed)'),
      'changed 안에 넣으면 값이 같은 채 다시 들어온 학생에게 띠가 안 뜬다');
const toggle = body(js, 'window.vcFocusLockToggle = function', '\n};');
check('강사 쪽: 자기가 눌렀을 때도 띠가 뜬다', /vcFocusBadge\(window\.__vcFocusLockOn, true\)/.test(toggle),
      '칩 색만으로는 «아무 변화가 없다» 로 읽힌다 — 이 제보의 핵심');
check('강사 쪽: 다른 강사가 걸어도 띠가 맞춰진다',
      /vcClassLockChipsRender\(\);[\s\S]{0,200}vcFocusBadge\(_fcLk, true\)/.test(js));
check('🌐 언어를 바꾸면 띠 글자도 바뀐다',
      /mangoi:langchange[\s\S]{0,600}vc-focus-badge/.test(js),
      'textContent 로 그린 글자는 data-ko/data-en 루프가 못 고친다');
check('⛔ 기능 자체를 건드리지 않았다 (탭 이탈 차단은 그대로)',
      /__vcFocusLockedByTeacher && window\.vcMyRole !== 'teacher'/.test(js),
      '보이게 만드는 작업이지 동작을 바꾸는 작업이 아니다');

/* ── ③ 학생 제어 발견성 ─────────────────────────────────────────── */
console.log('\n▶ ③ 「학생 필기 잠금」을 찾을 수 있는가');
check('「학생 제어」 이름표가 있다', /id="vc-studentctl-label"/.test(html));
check('이름표가 한/영 둘 다', /data-ko="👥 학생 제어"/.test(html) && /data-en="👥 Student controls"/.test(html));
check('이름표는 강사에게만 보인다 (칩과 같은 조건)',
      /vc-studentctl-label[\s\S]{0,200}staff \? 'inline-flex' : 'none'/.test(js),
      '따로 두면 학생 화면에 이름표만 덩그러니 남는다');
['vc-miclock-btn', 'vc-drawlock-btn', 'vc-focuslock-btn'].forEach(id => {
  const t = tagOf(id);
  check('툴팁이 있다: ' + id, /title="/.test(t) && /data-en-title="/.test(t),
        'Shas 선생님이 직접 요청한 항목 — 마우스를 올리면 설명이 뜨게');
});
check('필기 잠금 툴팁이 «무엇을 막는지» 를 말한다',
      /전체 지우기.{0,20}막습니다|막습니다/.test(tagOf('vc-drawlock-btn')) &&
      /선생님은 그대로/.test(tagOf('vc-drawlock-btn')),
      '「학생이 못 쓴다」 만으로는 강사 자신도 못 쓰는지 알 수 없다');
check('집중 모드 툴팁이 «목적» 을 말한다',
      /다른 탭.{0,40}옮기지 못하게/.test(tagOf('vc-focuslock-btn')),
      'Shas 4번의 「목적이 무엇인지 파악하기 어렵다」에 대한 답');
/* 세 칩이 이름표 «뒤» 에 연달아 오는가 — 사이에 남이 끼면 묶음으로 안 읽힌다 */
{
  const i0 = html.indexOf('id="vc-studentctl-label"');
  const idx = ['vc-miclock-btn', 'vc-drawlock-btn', 'vc-focuslock-btn'].map(id => html.indexOf('id="' + id + '"'));
  const share = html.indexOf('id="vc-screenshare-btn"');
  check('세 칩이 이름표 뒤에 모여 있다',
        i0 > 0 && idx.every(i => i > i0) && idx[0] < idx[1] && idx[1] < idx[2]);
  check('화면 공유는 묶음 «밖» 에 있다 (학생 제어가 아니다)', share > 0 && share < i0);
}

/* ── ① AI 웜업 ────────────────────────────────────────────────── */
console.log('\n▶ ① AI 웜업 — 강사가 학생의 대화를 볼 수 있는가');
check('웜업이 부모 창에 한 줄씩 알린다', /__mangoiWarmup: 1/.test(warm));
check('혼자 열었을 땐 아무 일도 없다 (부모 없음)',
      /window\.parent && window\.parent !== window/.test(warm),
      '학생이 사이드바에서 혼자 열었을 때 오류가 나면 웜업 자체가 멈춘다');
check('⚠️ targetOrigin 을 * 로 두지 않았다', /}, *\n? *location\.origin\)/.test(warm) || /location\.origin\)/.test(warm));
check('보내는 글 길이를 자른다', /slice\(0, 500\)/.test(warm), '긴 답변이 통째로 흐르면 회선을 먹는다');

check('부모가 그 메시지를 받는다', /d\.__mangoiWarmup !== 1/.test(js));
check('⚠️ 다른 오리진에서 온 메시지는 버린다', /ev\.origin !== location\.origin/.test(js),
      'postMessage 는 아무나 보낼 수 있다');
check('강사 자기 연습은 중계하지 않는다',
      /vcCanControlTextbook\(\)\) return;[\s\S]{0,200}warmup-echo/.test(js),
      '강사가 시범 삼아 쳐 본 글이 자기 화면에 되비치면 학생 것과 섞인다');
check('학생 → 강사 중계 메시지를 보낸다', /type: 'warmup-echo'/.test(js));
check('서버가 warmup-echo 를 릴레이한다', /case 'warmup-echo'/.test(ts),
      "switch 에 없으면 default 의 «Unknown message type» 으로 통째로 버려진다");

const recv = body(js, "case 'warmup-echo':", 'break;');
check('받은 쪽에서 강사만 그린다', /vcCanControlTextbook\(\)/.test(recv),
      '방 전체로 나가므로 다른 학생 화면에 뜨면 안 된다');
const mirror = body(js, 'window.vcWarmupMirror = function', '\n};');
check('미러 패널을 찾았다', mirror.length > 200);
check('⚠️ 글자를 HTML 로 넣지 않는다 (주입 차단)',
      /createTextNode/.test(mirror) && !/innerHTML/.test(mirror),
      '학생이 친 글이 그대로 강사 화면의 HTML 이 되면 안 된다');
check('오래된 줄은 버린다 (수업 내내 쌓이지 않게)', /childNodes\.length > \d+/.test(mirror));
check('학생·AI 를 구분해 표시한다', /Mango/.test(mirror) && /학생/.test(mirror));
check('미러는 기본 숨김 — 첫 줄이 와야 나타난다',
      /id="vc-warmup-mirror" style="display:none/.test(html));
check('읽기 전용임을 화면이 말한다 (한/영)',
      /읽기 전용 — 글로 답하려면 수업 채팅/.test(html) &&
      /read-only — use the class chat/.test(html));
check('안내 띠가 «강사 글은 학생에게 안 간다» 를 못박는다',
      /강사가 쓴 글은 학생에게 가지 않습니다/.test(html) &&
      /anything you type is not sent to the student/.test(html),
      'Shas 1번은 «고장» 이 아니라 «설명 없음» 이었다 — 화면이 직접 말해야 한다');

console.log('\n──────────────────────────────────────────');
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('──────────────────────────────────────────\n');
process.exit(fail ? 1 : 0);
