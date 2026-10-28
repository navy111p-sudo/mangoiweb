// 강사 «학생 이름 / ID» 검색칸에 강사 자기 로그인 아이디가 들어가 수업이 전부 숨던 사고(2026-10-28 강선생님 hq_t_kang)
// 실제 teacher.html 코드를 오려 내 돌린다 — «그 글자가 있는가» 가 아니라 «무슨 답이 나오는가» 를 본다.
//  ① 자기 아이디(대소문자·공백 무관 정확일치)는 검색어로 안 쓰고 칸을 비운다
//  ② 짝: 다른 검색어·자기 아이디의 «일부» 는 그대로 걸러진다(«항상 비우기» 엉터리 수리 차단)
//  ③ 필터가 다 숨기면 «수업 없음» 이 아니라 «필터로 숨겨짐» — 진짜 빈 날은 «수업 없음» 그대로(짝)
//  ④ «필터 지우기» 버튼이 실제로 두 필터를 비우고 다시 그린다
//  ⑤ 비밀번호 칸에 아이디 짝(autocomplete=username)이 있고 render() 가 채운다
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(process.env.TEACHER_HTML || new URL('../cloudflare-deploy/public/teacher.html', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name); } };
function fn(name){ const a = html.indexOf('  function ' + name + '('); const b = html.indexOf('\n  function ', a + 10); return a < 0 ? '' : html.slice(a, b < 0 ? undefined : b); }

const el = { 'portal-search': { value: '' }, 'portal-academy': { value: '' }, 'class-time-sort': { value: 'asc' } };
const ctx = { document: { getElementById: id => el[id] }, stuName: c => c.student_name, stuUid: c => c.student_uid,
  T: (en, ko) => ko, esc: x => String(x ?? '').replace(/</g, '&lt;') };
vm.createContext(ctx);
const code = [fn('portalRows'), fn('portalFilteredHtml'), fn('weekDayBodyHtml')].join('\n');
ok('portalRows·portalFilteredHtml·weekDayBodyHtml 를 오려 냈다(전제)', fn('portalRows').length > 200 && fn('portalFilteredHtml').length > 100 && fn('weekDayBodyHtml').length > 100);
vm.runInContext(code + '\nfunction weekItemHtml(it){ return "<i>" + it.student_uid + "</i>"; }', ctx);

const rows = [{ student_name: '김민서', student_uid: 'kms01', start_time: '19:00' }, { student_name: 'Lee', student_uid: 'lee77', start_time: '20:00' }];

console.log('① 자기 아이디는 검색어로 안 쓴다');
ctx.DATA = { me: { username: 'hq_t_kang' } };
el['portal-search'].value = 'hq_t_kang';
ok('자기 아이디면 수업 2건이 그대로 보인다', ctx.portalRows(rows).length === 2);
ok('그리고 칸을 비운다', el['portal-search'].value === '');
el['portal-search'].value = '  HQ_T_KANG ';
ok('대소문자·앞뒤 공백이 달라도 같은 아이디로 본다', ctx.portalRows(rows).length === 2 && el['portal-search'].value === '');

console.log('② 짝: 다른 검색어는 그대로 거른다');
el['portal-search'].value = 'lee';
ok('학생 검색은 그대로 걸린다(1건)', ctx.portalRows(rows).length === 1 && el['portal-search'].value === 'lee');
el['portal-search'].value = 'hq_t';
ok('자기 아이디의 «일부» 는 비우지 않는다(정확일치만)', ctx.portalRows(rows).length === 0 && el['portal-search'].value === 'hq_t');
el['portal-search'].value = 'hq_t_kang';
ctx.DATA = { me: { username: 'mangoi_018' } };
ok('남의 아이디는 비우지 않는다', ctx.portalRows(rows).length === 0 && el['portal-search'].value === 'hq_t_kang');
ctx.DATA = null;
ok('신원을 모르면(DATA 없음) 비우지 않는다', ctx.portalRows(rows).length === 0 && el['portal-search'].value === 'hq_t_kang');

console.log('③ «필터로 숨겨짐» 과 «수업 없음» 을 가른다');
el['portal-search'].value = 'zzz';
const hidden = ctx.weekDayBodyHtml({ items: rows });
ok('수업이 있는데 다 걸러지면 «필터로 숨겨짐»', hidden.includes('필터로 숨겨짐') && !hidden.includes('수업 없음'));
const none = ctx.weekDayBodyHtml({ items: [] });
ok('진짜 빈 날은 «수업 없음» 그대로(짝)', none.includes('수업 없음') && !none.includes('필터로 숨겨짐'));
el['portal-search'].value = '';
ok('필터가 없으면 수업을 그린다', ctx.weekDayBodyHtml({ items: rows }).includes('<i>kms01</i>'));
el['portal-search'].value = '<b>x';
const msg = ctx.portalFilteredHtml();
ok('안내문이 검색어를 보여 주고 «필터 지우기» 버튼을 단다', msg.includes('«&lt;b>x»') && msg.includes('data-portal-clear'));
ok('검색어는 이스케이프된다', !msg.includes('<b>x'));
ok('오늘 목록의 «다 걸러짐» 자리가 이 안내문을 쓴다', /if\(unfiltered\.length && !list\.length\)\{[^\n]*portalFilteredHtml\(\)/.test(html));

console.log('④ «필터 지우기» 배선을 실제로 실행');
const wireA = html.indexOf("  document.addEventListener('click', function(e){\n    var clearBtn = e.target.closest && e.target.closest('[data-portal-clear]');");
const wire = wireA < 0 ? '' : html.slice(wireA, html.indexOf('\n  });', wireA) + 6);
ok('배선 블록을 오려 냈다(전제)', wire.length > 100);
let refreshed = 0; const handlers = [];
const c2 = { document: { getElementById: id => el[id], addEventListener: (n, f) => handlers.push(f) }, portalRefresh: () => refreshed++ };
vm.createContext(c2); vm.runInContext(wire, c2);
el['portal-search'].value = 'hq_t_kang'; el['portal-academy'].value = 'A학원';
let blurredBeforeRefresh = null;
const btn = { blur: () => { blurredBeforeRefresh = refreshed === 0; } };
handlers.forEach(h => h({ target: { closest: s => s === '[data-portal-clear]' ? btn : null } }));
ok('누르면 검색어·학원을 비우고 다시 그린다', el['portal-search'].value === '' && el['portal-academy'].value === '' && refreshed === 1);
// 브라우저 실측(2026-10-28): 버튼이 #classes 안에서 포커스를 쥔 채면 renderClasses 가 다시 그리기를 미뤄 «눌러도 그대로» 였다
ok('다시 그리기 «전에» 버튼 포커스를 놓는다', blurredBeforeRefresh === true);
el['portal-search'].value = 'lee';
handlers.forEach(h => h({ target: { closest: () => null } }));
ok('다른 클릭에는 안 움직인다(짝)', el['portal-search'].value === 'lee' && refreshed === 1);

console.log('⑤ 비밀번호 칸의 아이디 짝');
const pw = html.slice(html.indexOf('<details class="card mycard" id="c-pw">'), html.indexOf('</details>', html.indexOf('id="c-pw"')));
ok('c-pw 안에 autocomplete=username 칸이 비밀번호 칸보다 앞에 있다', /id="pw-user"[^>]*autocomplete="username"/.test(pw) && pw.indexOf('pw-user') < pw.indexOf('pw-cur'));
ok('그 칸은 숨김·읽기전용', /id="pw-user"[^>]*\bhidden\b[^>]*readonly/.test(pw));
ok('render() 가 그 칸에 로그인 아이디를 채운다', /function render\(d\)\{[\s\S]{0,400}getElementById\('pw-user'\)[\s\S]{0,80}d\.me\.username/.test(html));
ok('검색칸은 여전히 autocomplete=off', /id="portal-search"[^>]*autocomplete="off"/.test(html));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
