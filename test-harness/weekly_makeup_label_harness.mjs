// 주간 전체 스케줄 — 보강수업(makeup)이 «보강» 칸(temp)으로 보이는가 (2026-10-06 사장님 · 2026-10-07 «보충»→«보강» 이름 통일)
// 서버 mapType 을 api-admin.ts 에서 오려 내 실제로 돌리고, 화면 문구를 대조한다.
// 짝: «보강은 temp» 옆에 «정규·그룹·휴무·레벨테스트는 그대로» 를 둔다. 체험은 2026-10-07 부터 자기 칸(trial).
import fs from 'node:fs';
const rd = (p) => fs.readFileSync(new URL('../cloudflare-deploy/' + p, import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌ FAIL', n); } };
const api = rd('src/api-admin.ts');
const a = api.indexOf('const mapType = (ct: string): string => {');
let e = -1, d = 0;
if (a >= 0) for (let i = api.indexOf('{', a); i < api.length; i++) { if (api[i] === '{') d++; else if (api[i] === '}' && --d === 0) { e = i; break; } }
ok('전제: 서버 mapType 을 오려 냈다', a >= 0 && e > a);
let mapType = null;
try { mapType = new Function('return (' + api.slice(api.indexOf('(ct', a), e + 1).replace('(ct: string): string', '(ct)') + ')')(); } catch (x) { console.log('  실행 실패:', x.message); }
ok('전제: mapType 을 실제로 돌릴 수 있다', typeof mapType === 'function');
const m = (v) => { try { return mapType(v); } catch { return '?'; } };
ok('makeup → temp(보강 칸)', m('makeup') === 'temp');
ok('MAKEUP(대문자) → temp', m('MAKEUP') === 'temp');
ok('짝: regular → 1on1 그대로', m('regular') === '1on1');
ok('짝: 빈 값 → 1on1 그대로', m('') === '1on1' && m(null) === '1on1');
ok('짝: group → group', m('group') === 'group');
ok('짝: level_test → leveltest', m('level_test') === 'leveltest');
ok('짝: blocked → blocked', m('blocked') === 'blocked');
ok('체험(trial) → trial 칸 (2026-10-07 «정규·보강·체험·레벨테스트» 통일 — 예전엔 1on1(정규)로 뭉개졌다)', m('trial') === 'trial');
ok('한글 별칭 보강·체험도 받는다', m('보강') === 'temp' && m('체험') === 'trial');
const W = rd('public/admin/weekly-schedule.html');
ok('저장 쪽: temp → makeup 으로 저장(왕복 짝)', /SLOT_TYPE_TO_CLASS_TYPE=\{[^}]*'temp':'makeup'/.test(W));
ok('범례 칸 이름이 «보강수업»', W.includes('<span data-ko="보강수업" data-en="Make-up">보강수업</span>'));
ok('화면에 «보충» 이 남지 않았다(주석 제외)', !/보충/.test(W.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')));
const strip = W.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok('화면에 «임시 수업»·«Temporary» 문구가 남지 않았다', !/임시 수업|'Temporary'|"🔵 Temporary"|data-ko="임시"/.test(strip));
ok('새 수업 고르기 카드 이름이 «보강수업»', W.includes("(L?'보강수업':'Make-up class')"));
const Q6 = rd('public/js/adm-q6.js');
ok('강사 캘린더(adm-q6) 라벨도 «보강»', /'temp':'보강'/.test(Q6) && !/'보충'/.test(Q6));
// 2026-10-10: 숫자를 못 박으면 다음 수정마다 거짓 FAIL — «16 이상» 으로
ok('adm-q6 ?v= 를 올렸다', +((rd('public/admin.html').match(/\/js\/adm-q6\.js\?v=(\d+)/) || [])[1] || 0) >= 16);
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
