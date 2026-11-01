// 지사 «엑셀 붙여넣어 일괄 등록» 매칭 하니스 (2026-10-29)
//
// 사장님 「활동 지사장들 아이디만이라도 복구해야 해」 — 표의 지사명이 시스템 이름과 다르거나
// 비어 있어 지사명 정확일치만으로는 거의 안 붙었다. 그래서 «연락처 → 대표명» 으로도 찾게 했다.
// 이 하니스는 adm-core.js 에서 파싱·매칭·실행 함수를 «오려 내» 실제로 돌린다(문자열 검사 아님).
//   ⓐ 붙는다: 지사명 / 연락처 / 대표명 각각
//   ⓑ 안 붙는다(짝): 후보가 둘 · 표 안에 같은 값이 둘 · 두 줄이 같은 지사 · 부분일치
//   ⓒ 비밀번호 칸이 있으면 PATCH 본문에 login_password 가 실린다 · 없으면 안 실린다(짝)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../cloudflare-deploy/public/js/adm-core.js', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; } else { fail++; console.log('❌ FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); } };

function cut(name) {
  const i = SRC.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const head = SRC.lastIndexOf('\n', i) + 1;
  let j = SRC.indexOf('{', i), d = 0;
  for (let k = j; k < SRC.length; k++) {
    const c = SRC[k];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return SRC.slice(head, k + 1); }
  }
  return '';
}
const names = ['_frBulkNorm', '_frBulkParseRows', '_frBulkDigits', '_frBulkOwnerKey', '_frBulkMatch',
  '_frBulkRowLabel', '_frBulkReason', '_frBulkByLabel', 'frBulkRun'];
const code = names.map(cut);
names.forEach((n, k) => ok('전제: ' + n + ' 를 오려 냈다', !!code[k]));

function makeCtx() {
  const calls = [];
  const els = {};
  const el = id => (els[id] = els[id] || { id, disabled: false, style: {}, textContent: '', innerHTML: '', classList: { add() {}, remove() {} } });
  const ctx = {
    adminLang: 'ko', console,
    _esc: s => String(s),
    document: { getElementById: el },
    loadFranchises: () => {},
    fetch: async (url, opt) => { calls.push({ url, opt, body: JSON.parse(opt.body) }); return { ok: true, status: 200, json: async () => ({ ok: true }) }; },
    _frBulkPlan: null,
  };
  vm.createContext(ctx);
  try { vm.runInContext(code.join('\n') + '\nthis.__fns={_frBulkParseRows,_frBulkMatch,frBulkRun};', ctx, { timeout: 2000 }); }
  catch (e) { ok('함수 실행 준비', false, String(e)); }
  return { ctx, calls, fns: ctx.__fns || {} };
}

const FR = [
  { id: 1, name: '테스트교육정보 (가지역)', owner_name: '가나다', phone: '' },
  { id: 2, name: '샘플지사 (전국)', owner_name: '라마바', phone: '' },
  { id: 3, name: '예시 송파', owner_name: '예시 송파', phone: '' },
  { id: 4, name: '예시교육', owner_name: '파하가', phone: '' },
  { id: 5, name: '예시신서', owner_name: '파하가', phone: '' },
  { id: 6, name: '예시남부지사', owner_name: '차카타', phone: '010-0000-0004' },
  { id: 7, name: '똑같은이름', owner_name: 'A', phone: '' },
  { id: 8, name: '똑같은이름', owner_name: 'B', phone: '' },
  { id: 9, name: '예시섬지사', owner_name: '나다라', phone: '' },
  { id: 10, name: '예시섬지사2', owner_name: '나다라 ', phone: '' },
  { id: 11, name: '예시서부', owner_name: '마바사', phone: '' },
];
const TSV = [
  '구분\t지역\t지사명\t주 소\t대표명\t연락처\t아이디\t비밀번호',
  '\t인천\t테스트교육\t주소\t가나다\t010-0000-0001\tdemo_a1\tTest-Pass-0',        // 지사명 다름 → 대표명으로
  '\t대구\t다른표기\t학원장\t라마바\t010-0000-0002\tdemo_a2\tTest-Pass-0',      // 지사명 다름 → 대표명으로
  '\t\t예시 송파\t예시 송파\t사아자\t010-0000-0003\tdemo_a3\tTest-Pass-0',    // 지사명 정확일치
  '\t남양주\t\t주소\t차카타\t010-0000-0004\tdemo_a4\tTest-Pass-0',            // 지사명 빈칸 → 연락처로
  '\t대전\t예시교육\t주소\t파하가\t010-0000-0005\tdemo_a5\tTest-Pass-0',        // 지사명 정확일치(같은 대표명이 있어도)
  '\t대구\t\t주소\t파하가\t010-0000-0006\tdemo_a6\tTest-Pass-0',              // 대표명 파하가 = 시스템 2곳·표 2줄 → 보류
  '\t\t똑같은이름\t\t누구\t\tdemo_a9\tTest-Pass-0',                              // 같은 이름 지사 2곳 → 보류
  '\t제주\t예시 섬\t\t나다라\t010-0000-0007\tdemo_a7\tTest-Pass-0',      // 대표명 후보 2곳(공백 정규화) → 보류
  '\t예시서부\t예시미래\t주소\t마바\t\tdemo_a8\tTest-Pass-0',                      // 대표명 부분일치 → 못 찾음
  '\t본사\t예시 본사\t\t아자차 이사\t010-0000-0008\t\t',                 // 아이디 없음 → 못 찾음
].join('\n');

{
  const { fns } = makeCtx();
  const parsed = fns._frBulkParseRows ? fns._frBulkParseRows(TSV) : {};
  ok('파싱: 10줄 읽음(지사명이 빈 줄도 남김)', parsed.rows && parsed.rows.length === 10, parsed.rows && parsed.rows.length);
  const r0 = parsed.rows ? parsed.rows[0] : {};
  ok('파싱: 대표명·연락처·비밀번호 머리글을 읽음', r0.owner === '가나다' && r0.phone === '010-0000-0001' && r0.pw === 'Test-Pass-0', r0);
  let m = [];
  try { m = fns._frBulkMatch(parsed.rows || [], FR); } catch (e) { ok('매칭 실행', false, String(e)); }
  const at = i => m[i] || {};
  const fid = i => at(i).f ? at(i).f.id : null;
  ok('테스트교육 → 대표명으로 1번', fid(0) === 1 && at(0).by === 'owner', at(0));
  ok('다른표기 → 대표명으로 2번', fid(1) === 2 && at(1).by === 'owner', at(1));
  ok('예시 송파 → 지사명으로 3번', fid(2) === 3 && at(2).by === 'name', at(2));
  ok('지사명 빈 차카타 → 연락처로 6번', fid(3) === 6 && at(3).by === 'phone', at(3));
  ok('예시교육 → 지사명으로 4번(대표명이 겹쳐도)', fid(4) === 4 && at(4).by === 'name', at(4));
  ok('대구 파하가(대표명 겹침) → 보류', fid(5) === null && at(5).why === 'owner_dup', at(5));
  ok('같은 이름 지사 2곳 → 보류', fid(6) === null && /^name_dup/.test(at(6).why || ''), at(6));
  ok('대표명 후보 2곳(공백 정규화) → 보류', fid(7) === null && at(7).why === 'owner_dup', at(7));
  ok('대표명 부분일치는 안 붙임', fid(8) === null && at(8).why === 'not_found', at(8));
  ok('붙은 줄은 5줄뿐', m.filter(x => x.f).length === 5, m.filter(x => x.f).length);

  // 두 줄이 같은 지사로 가면 둘 다 보류
  const two = fns._frBulkMatch([{ name: '예시서부', owner: '', phone: '' }, { name: '', owner: '마바사', phone: '' }], FR);
  ok('두 줄이 같은 지사 → 둘 다 보류', !two[0].f && !two[1].f && two[0].why === 'same_branch' && two[1].why === 'same_branch', two);
  // 시스템엔 파하가가 한 곳뿐인데 표에 두 줄이면 → 보류(어느 줄의 아이디인지 모름)
  const one = fns._frBulkMatch([{ name: '', owner: '파하가', phone: '' }, { name: '', owner: '파하가', phone: '' }],
    FR.filter(f => f.id !== 5));
  ok('표 안에 같은 대표명 2줄 → 보류', !one[0].f && !one[1].f && one[0].why === 'owner_dup', one);
  // 시스템 연락처가 같은 값이 둘이면 보류
  const fr2 = FR.concat([{ id: 12, name: '다른데', owner_name: 'Z', phone: '01000000004' }]);
  const ph = fns._frBulkMatch([{ name: '', owner: '', phone: '010-0000-0004' }], fr2);
  ok('시스템에 같은 연락처 2곳 → 보류', !ph[0].f && ph[0].why === 'phone_dup', ph);
}

// 실행: 비밀번호가 있으면 login_password 가 실리고, 없으면 안 실린다
{
  const { ctx, calls, fns } = makeCtx();
  ctx._frBulkPlan = { updates: [
    { id: 2, name: '샘플지사 (전국)', login: 'demo_a2', pw: 'Test-Pass-0', by: 'owner' },
    { id: 11, name: '예시서부', login: 'demo_a8', by: 'name' },
  ] };
  let err = null;
  try { await fns.frBulkRun(); } catch (e) { err = String(e); }
  ok('실행이 던지지 않음', !err, err);
  const b1 = (calls[0] || {}).body || {};
  const b2 = (calls[1] || {}).body || {};
  ok('PATCH 2번 나감', calls.length === 2 && calls.every(c => c.opt.method === 'PATCH'), calls.length);
  ok('비밀번호 줄: login_username + login_password', b1.id === 2 && b1.login_username === 'demo_a2' && b1.login_password === 'Test-Pass-0', b1);
  ok('비밀번호 없는 줄: login_password 안 실림(짝)', b2.id === 11 && b2.login_username === 'demo_a8' && !('login_password' in b2), b2);
}

console.log(`결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
