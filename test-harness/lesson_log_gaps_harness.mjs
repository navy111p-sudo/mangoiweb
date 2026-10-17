// 📒 일일 보고 누락 목록 (2026-10-14) — 판정을 «실제로 돌려» 확인합니다.
//   ① 화면 판정 classifyLogGap · summarize (public/js/lesson-log-gaps.js 를 node:vm 으로 그대로 실행)
//   ② 서버 briefEval 의 학부모 발송·열람 플래그 flagOf (class-today-extras.ts 에서 오려 내 실행)
//   ③ 배선 — 화면이 정본 API 를 부르고 «성공이라고 말했는가» 로 판정하는가 · 사이드바 · 구성표
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...a) => path.join(ROOT, ...a);
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('❌ FAIL', name); } };

/* ① 화면 판정 */
const JS_FILE = process.env.LLG_SRC || P('cloudflare-deploy/public/js/lesson-log-gaps.js');
const jsSrc = fs.readFileSync(JS_FILE, 'utf8');
let API = null;
try {
  const sb = { module: { exports: {} } };
  vm.runInNewContext(jsSrc, sb, { timeout: 2000 });
  API = sb.module.exports;
} catch (e) { console.log('   (실행 실패:', e.message, ')'); }
ok('전제: 화면 스크립트를 실행해 판정 함수를 얻었다', API && typeof API.classifyLogGap === 'function');
const C = (s) => { try { return API.classifyLogGap(s); } catch (e) { return 'THREW'; } };
const ev = (o) => Object.assign({ id: 1, date: '2026-10-13', viewed: false, notified: true }, o);

ok('끝난 수업 + 일지 없음 → 미작성', C({ status: 'ended', today_eval: null }) === 'missing');
ok('끝난 수업 + 일지 + 학부모 안 엶 → 미확인', C({ status: 'ended', today_eval: ev({ viewed: false }) }) === 'unread');
ok('끝난 수업 + 일지 + 학부모 엶 → 완료', C({ status: 'ended', today_eval: ev({ viewed: true }) }) === 'done');
ok('열람 칸이 없는 옛 일지 → «모름» (미확인으로 부풀리지 않음)', C({ status: 'ended', today_eval: ev({ viewed: null }) }) === 'unknown_view');
ok('짝: 아직 안 끝난 수업(live)은 미작성이 아니다', C({ status: 'live', today_eval: null }) === 'not_ended');
ok('짝: 시작 전(early·open)도 대상 아님', C({ status: 'early' }) === 'not_ended' && C({ status: 'open' }) === 'not_ended');
ok('휴강 수업은 대상 아님', C({ status: 'holiday', holiday: true, today_eval: null }) === 'holiday');
ok('연기 수업은 대상 아님', C({ status: 'postponed', postponed: true, today_eval: null }) === 'postponed');
ok('일지를 볼 수 없는 계정(eval_hidden)은 «미작성» 이라 지어내지 않는다', C({ status: 'ended', eval_hidden: true, today_eval: null }) === 'hidden');
ok('짝: 볼 수 있는 계정은 같은 줄이 미작성', C({ status: 'ended', eval_hidden: false, today_eval: null }) === 'missing');
ok('카페24 줄도 같은 규칙(끝났고 일지 없음 → 미작성)', C({ source: 'cafe24', status: 'ended', today_eval: null }) === 'missing');
ok('이상한 입력에 던지지 않는다', C(null) === 'not_ended' && C(undefined) === 'not_ended' && C('x') === 'not_ended');

const S = [
  { status: 'ended', today_eval: null },
  { status: 'ended', today_eval: null, attendance: { state: 'absent' } },
  { status: 'ended', today_eval: ev({ viewed: false, notified: false }) },
  { status: 'ended', today_eval: ev({ viewed: false, notified: true }) },
  { status: 'ended', today_eval: ev({ viewed: true }) },
  { status: 'ended', today_eval: ev({ viewed: null }) },
  { status: 'live', today_eval: null },
  { status: 'holiday', holiday: true },
  { status: 'postponed', postponed: true },
];
let c = null; try { c = API.summarize(S); } catch (e) {}
ok('요약: 미작성 2 · 미확인 2 · 완료 1 · 모름 1', c && c.missing === 2 && c.unread === 2 && c.done === 1 && c.unknown_view === 1);
ok('요약: 대상(끝난 수업) = 6 — 안 끝남·휴강·연기는 안 셈', c && c.target === 6 && c.not_ended === 1 && c.holiday === 1 && c.postponed === 1);
ok('요약: 미확인 중 «발송 안 됨» 1건을 따로 센다', c && c.unread_unsent === 1);
ok('요약: 빈 목록', (() => { try { const z = API.summarize([]); return z.total === 0 && z.target === 0; } catch (e) { return false; } })());

let y = ''; try { y = API.kstYesterday(Date.parse('2026-10-14T00:30:00+09:00')); } catch (e) {}
ok('기본 날짜 = KST 어제 (KST 자정 직후에도 하루 밀리지 않음)', y === '2026-10-13');
try { y = API.kstYesterday(Date.parse('2026-10-14T23:50:00+09:00')); } catch (e) { y = ''; }
ok('기본 날짜 = KST 어제 (KST 밤에도)', y === '2026-10-13');

/* ② 서버 flagOf */
const ext = fs.readFileSync(P('cloudflare-deploy/src/class-today-extras.ts'), 'utf8');
const m = /function flagOf\(r: any, key: string\): boolean \| null \{([\s\S]*?)\n\}/.exec(ext);
ok('전제: class-today-extras.ts 에서 flagOf 를 오려 냈다', !!m);
let flagOf = null;
try { flagOf = new Function('r', 'key', m[1]); } catch (e) {}
const F = (r, k) => { try { return flagOf(r, k); } catch (e) { return 'THREW'; } };
ok('칸이 있고 1 → true', F({ viewed_by_parent: 1 }, 'viewed_by_parent') === true);
ok('칸이 있고 NULL → false (DEFAULT 없는 칸이라 «아직 안 엶» 이 NULL)', F({ viewed_by_parent: null }, 'viewed_by_parent') === false);
ok('칸이 있고 0 → false', F({ viewed_by_parent: 0 }, 'viewed_by_parent') === false);
ok('칸이 없는 옛 행 → null(모름)', F({ id: 3 }, 'viewed_by_parent') === null);
ok('행이 없으면 null', F(null, 'viewed_by_parent') === null);
ok('briefEval 이 두 플래그와 열람 시각을 싣는다',
  /notified:\s*flagOf\(r,\s*'parent_notified'\)/.test(ext) && /viewed:\s*flagOf\(r,\s*'viewed_by_parent'\)/.test(ext) && /viewed_at:/.test(ext));

/* ③ 배선 */
const html = fs.readFileSync(P('cloudflare-deploy/public/admin/lesson-log-gaps.html'), 'utf8');
ok('화면이 /js 루트의 스크립트를 ?v= 로 싣는다(/admin/ 밑에 자산 금지)', /<script src="\/js\/lesson-log-gaps\.js\?v=\d+"><\/script>/.test(html));
ok('/admin/ 밑에 js·css 를 새로 두지 않았다', !fs.existsSync(P('cloudflare-deploy/public/admin/lesson-log-gaps.js')));
ok('정본 API(classes/today?date=)를 부른다', /\/api\/admin\/classes\/today\?date=/.test(jsSrc));
ok('«성공이라고 말했는가» 로 판정한다(ok === true + 배열)', /x\.d\.ok !== true/.test(jsSrc) && /Array\.isArray\(x\.d\.sessions\)/.test(jsSrc));
ok('목록·일지 짝짓기를 화면에서 다시 계산하지 않는다', !/student_evaluations|pickEvals|admDowMatches/.test(jsSrc.replace(/\/\*[\s\S]*?\*\//g, '')));
const ia6 = fs.readFileSync(P('cloudflare-deploy/public/js/adm-ia6.js'), 'utf8');
const item = /\{ ko: '일일 보고 누락'[\s\S]*?\}/.exec(ia6);
ok('사이드바에 항목이 있다', !!item && /href: '\/admin\/lesson-log-gaps\.html'/.test(item[0]));
ok('사이드바: 강사·지사·대리점에게는 감춘다(서버와 짝)', !!item && /hideFrom: \['teacher', 'franchise', 'branch', 'agency'\]/.test(item[0]));
const map = fs.readFileSync(P('cloudflare-deploy/public/admin/site-structure-map.html'), 'utf8');
ok('사이트 구성표에 등록', map.includes('href="/admin/lesson-log-gaps.html"'));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
