// 학생 상세 캘린더 — 보충수업(makeup)이 «정규수업» 으로 떨어지지 않는가 (2026-10-06 사장님 제보)
// 판정 함수를 admin/student.html 에서 오려 내 실제로 돌린다. 「보충은 보라」 옆에 「나머지는 예전 그대로」를 짝으로.
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../cloudflare-deploy/public/admin/student.html', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌ FAIL', n); } };
const a = src.indexOf('var MGS_AI_COLORS'), b = src.indexOf('function mgsAiColors');
ok('전제: 판정 블록을 오려 냈다', a > 0 && b > a);
let f = null;
try { f = new Function('function mgsSrcLabel(){return ""};' + src.slice(a, src.indexOf('\n', b)) + ';return {mgsSchCls,mgsSchInner,mgsAiColors};')(); } catch (e) { console.log('  오려 낸 블록 실행 실패:', e.message); }
ok('전제: 판정 함수를 실제로 돌릴 수 있다', !!f);
const run = (t) => { try { const c = f.mgsAiColors({ class_type: t }); return { cls: f.mgsSchCls({ class_type: t }), name: c.name, inner: f.mgsSchInner({ class_type: t }, c, '21:10') }; } catch (e) { return { cls: '', name: '', inner: '' }; } };
const m = run('makeup');
ok('보충 → mgs-makeup 클래스', m.cls === 'mgs-ev mgs-makeup');
ok('보충 → 「보충수업」 이름', m.name === '보충수업');
ok('보충 → 좁은 칸 짧은 이름 「보충」', /<span class="s">보충<\/span>/.test(m.inner));
ok('짝: 정규는 그대로 정규', run('regular').name === '정규수업' && run('regular').cls === 'mgs-ev mgs-regular');
ok('짝: 체험은 그대로 체험', run('trial').name === '체험수업');
ok('짝: 레벨테스트는 그대로', run('level_test').name === '레벨테스트');
ok('짝: 모르는 종류는 정규로 떨어진다(예전 동작)', run('weird').cls === 'mgs-ev mgs-regular' && run(undefined).name === '정규수업');
ok('CSS 에 보라 테두리 색이 있다', /\.mgs-ev\.mgs-makeup\{--mc:#6d28d9\}/.test(src));
ok('범례에 보충수업 칸이 있다', /class="mgs-ev mgs-makeup"[^>]*><\/span>\s*<span data-ko="보충수업" data-en="Make-up">/.test(src));
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
