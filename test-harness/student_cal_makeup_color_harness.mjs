// 학생 상세 캘린더 — 보강수업(makeup)이 «정규수업» 으로 떨어지지 않는가 (2026-10-06 사장님 제보)
// 판정 함수를 admin/student.html 에서 오려 내 실제로 돌린다. 「보강은 보라」 옆에 「나머지는 예전 그대로」를 짝으로.
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../cloudflare-deploy/public/admin/student.html', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌ FAIL', n); } };
const a = src.indexOf('var MGS_AI_COLORS'), b = src.indexOf('function mgsAiColors');
ok('전제: 판정 블록을 오려 냈다', a > 0 && b > a);
/* 👩‍🏫 (2026-10-08) 카드가 담당 강사를 그리면서 정본 teacherLabel() 을 부른다 — 소스에서 중괄호 짝으로 오려 낸다(⛔ 베껴 적지 말 것). */
function funcAt(text, name) {
  const i = text.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, j = text.indexOf('{', i);
  for (let k = j; k < text.length; k++) { const ch = text[k]; if (ch === '{') d++; else if (ch === '}') { d--; if (!d) return text.slice(i, k + 1); } }
  return '';
}
const tl = funcAt(src, 'teacherLabel');
ok('전제: 강사 이름 정본 teacherLabel 을 오려 냈다', tl.length > 200);
let f = null;
try { f = new Function('function mgsSrcLabel(){return ""};function esc(s){return String(s==null?"":s).replace(/[&<>"\']/g,function(c){return "&#"+c.charCodeAt(0)+";";});};' + tl + ';' + src.slice(a, src.indexOf('\n', b)) + ';return {mgsSchCls,mgsSchInner,mgsAiColors};')(); } catch (e) { console.log('  오려 낸 블록 실행 실패:', e.message); }
ok('전제: 판정 함수를 실제로 돌릴 수 있다', !!f);
const run = (t) => { try { const c = f.mgsAiColors({ class_type: t }); return { cls: f.mgsSchCls({ class_type: t }), name: c.name, inner: f.mgsSchInner({ class_type: t }, c, '21:10') }; } catch (e) { return { cls: '', name: '', inner: '' }; } };
const m = run('makeup');
ok('보강 → mgs-makeup 클래스', m.cls === 'mgs-ev mgs-makeup');
ok('보강 → 「보강수업」 이름', m.name === '보강수업');
ok('보강 → 좁은 칸 짧은 이름 「보강」', /<span class="s">보강<\/span>/.test(m.inner));
ok('짝: 정규는 그대로 정규', run('regular').name === '정규수업' && run('regular').cls === 'mgs-ev mgs-regular');
ok('짝: 체험은 그대로 체험', run('trial').name === '체험수업');
ok('짝: 레벨테스트는 그대로', run('level_test').name === '레벨테스트');
ok('짝: 모르는 종류는 정규로 떨어진다(예전 동작)', run('weird').cls === 'mgs-ev mgs-regular' && run(undefined).name === '정규수업');
/* 👩‍🏫 카드에 담당 강사 — «이름이 나온다» 옆에 «AI 배정 행은 남의 이름 대신 확인 필요»·«없으면 미배정» 을 짝으로. */
const inner = (sch) => { try { return f.mgsSchInner(sch, f.mgsAiColors(sch), '21:10'); } catch (e) { return 'ERR ' + e.message; } };
ok('강사: 카드에 담당 강사 이름이 나온다', /<span class="tc">FAR<\/span>/.test(inner({ class_type: 'regular', teacher_name: 'FAR', teacher_id: '22' })));
ok('강사: 이름은 이스케이프된다', !/<b>x<\/b>/.test(inner({ class_type: 'regular', teacher_name: '<b>x</b>' })));
ok('강사 짝: AI 배정 행은 이름 대신 «확인 필요»', /<span class="tc">확인 필요/.test(inner({ class_type: 'regular', teacher_name: 'FAR', source: 'ai_auto' })));
ok('강사 짝: 강사가 없으면 «미배정»', /<span class="tc">미배정<\/span>/.test(inner({ class_type: 'regular' })));
ok('CSS: 아주 좁은 칸(≤66px)에서는 강사를 감춘다', /@container \(max-width:66px\)\{ \.mgs-in \.tc\{display:none\}/.test(src));
/* 👤 (2026-10-08 «주간 캘린더 카드에도 교사 이름») 주간 카드는 .mgs-w 를 달고, 좁은 칸에서도 강사를 «다시» 보인다.
   (같은 날) 월간 카드도 같은 두 줄 배치(.mgs-w)를 단다 — 실측으로 월간도 강사가 «Te…»·숨김이었다. */
{
  const wk = funcAt(src, 'renderDSchedWeek'), mo = funcAt(src, 'renderDSchedMonth');
  ok('주간: 예약 카드에 mgs-w 를 단다', /mgsSchCls\(sch\) \+ ' mgs-w"/.test(wk));
  ok('월간: 예약 카드에도 mgs-w 를 단다', mo.length > 200 && /mgsSchCls\(sch\) \+ ' mgs-m mgs-w"/.test(mo));
  ok('CSS: 주간 카드는 좁은 칸(≤66px)에서도 강사를 보인다', /@container \(max-width:66px\)\{[^}]*\}\s*\.mgs-ev\.mgs-w \.mgs-in \.tc\{display:block/.test(src));
  ok('CSS: 주간 카드에서 강사는 두 번째 줄(폭 100%)', /\.mgs-ev\.mgs-w \.mgs-in \.tc\{flex:0 0 100%/.test(src));
  ok('CSS: 월간 카드는 강사 이름을 자르지 않고 줄을 바꾼다', /\.mgs-ev\.mgs-m\.mgs-w \.mgs-in \.tc\{white-space:normal/.test(src));
}
ok('CSS 에 보라 테두리 색이 있다', /\.mgs-ev\.mgs-makeup\{--mc:#6d28d9\}/.test(src));
ok('범례에 보강수업 칸이 있다', /class="mgs-ev mgs-makeup"[^>]*><\/span>\s*<span data-ko="보강수업" data-en="Make-up">/.test(src));
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
