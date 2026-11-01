/* 수동 브라우저 검사 — 강사 «오늘의 수업» 에 섞여 오는 «지난 14일 카페24 수업» 의 순서·날짜 구분줄 (2026-10-28)
   제보(강사 제안): «Today's Classes 표의 시간이 빠른 순으로 안 나온다». 실측 원인 — 서버가 지난 줄의 class_date 를
   오늘로 덮어 «10-14 18:30» 이 «2026-10-28 6:30pm» 으로 찍혔고, 실제 날짜(start_ts) 순이라 시각이 뒤죽박죽으로 보였다.
   teacher.html 의 «실제» 표 CSS 와 «실제» sortClassesByTime·clsDaySepHtml·classTableHtml 을 그대로 띄워 잰다 —
   «오늘 줄이 먼저·시간순», «지난 날마다 구분줄 하나», «구분줄 색이 줄무늬에 안 덮인다(폰 포함)», «페이지가 옆으로 안 밀린다».
   실행:  node test-harness/manual/teacher-today-past-days-browser.mjs        (폭 4종 × 테마 2 × 언어 2 × 정렬 2)
   변이시험: TEACHER_SRC=<고친 사본> 으로 사본을 잰다(저장소 파일을 안 건드림). */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); }
catch { try { ({ chromium } = await import('playwright')); } catch { console.log('⏭  건너뜀 — playwright 가 없습니다'); process.exit(0); } }

const html = readFileSync(process.env.TEACHER_SRC || join(ROOT, 'cloudflare-deploy/public/teacher.html'), 'utf8').replace(/\r\n/g, '\n');
const style = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).find(t => t.includes('.cls-tbl{')) || '';
function fn(name) {
  const a = html.indexOf('  function ' + name + '(');
  if (a < 0) return '';
  let i = html.indexOf('{', a), d = 0;
  for (; i < html.length; i++) { if (html[i] === '{') d++; else if (html[i] === '}') { d--; if (!d) break; } }
  return html.slice(a, i + 1);
}
const names = ['clsDayLabel', 'clsPastDate', 'clsDaySepHtml', 'sortClassesByTime', 'classTableHtml', 'extrasHtml', 'portalContact'];
const code = names.map(fn).join('\n');
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; if (!c) console.log('  ❌ FAIL ' + n + (d === undefined ? '' : '  — ' + JSON.stringify(d).slice(0, 300))); };
ok('전제: 표 CSS 와 함수 ' + names.length + '개를 찾았다', style.length > 500 && names.every(n => fn(n).length > 20), names.filter(n => !fn(n)));

const page = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>
body{margin:0;font-family:sans-serif}.wrap{max-width:1180px;margin:0 auto;padding:12px}.card{padding:18px;background:#fff}
@media(min-width:900px){.wrap{padding:24px 28px}}${style}</style><div class=wrap><div class=card id=box></div><div id=cards></div></div><script>
var MangoiClassDisplay={range:function(c){return c.start_time}};
function esc(x){return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
var LANGX='en'; function T(en,ko){return LANGX==='ko'?ko:en} function EN(){return LANGX!=='ko'}
function clsToday(){return '2026-10-28'}
function stuLabelHtml(c){return esc(c.student_name)} function stuLabelText(c){return c.student_name}
function stuUid(c){return c.student_uid||''} function kindPill(){return ''} function goalHtml(){return ''} function preqHtml(){return ''} function handoverHtml(){return ''}
function todayKST(){return '2026-10-28'} function hhmm(){return '09:00'}
${code}
window.draw=function(lang,dir){ LANGX=lang;
  // 스크린샷(Teacher Kaye, 2026-10-28)의 실제 지난 줄 5개 + 오늘 줄 3개 — 섞어서 넣는다
  var src=[['2026-10-15','21:30'],['2026-10-28','20:00'],['2026-10-14','18:30'],['2026-10-28','09:30'],['2026-10-16','16:10'],['2026-10-15','14:00'],['2026-10-27','12:30'],['2026-10-28','16:00']];
  var rows=src.map(function(x,i){ return {kind:'class',schedule_id:x[0]==='2026-10-28'?i+1:null,source:x[0]==='2026-10-28'?'':'lms',room_id:'r'+i,
    class_date:x[0],start_time:x[1],start_ts:Date.parse(x[0]+'T'+x[1]+':00+09:00'),student_name:'S'+i,student_uid:'u'+i,
    teacher_entry:{state:'pending'},attendance:{state:'not_yet'}}; });
  var list=sortClassesByTime(rows,dir);
  document.getElementById('box').innerHTML=classTableHtml(list,{daySep:true,status:function(){return 'x'},act:function(){return ''}});
  var h=''; for(var i=0;i<list.length;i++){ h+=clsDaySepHtml(list,i,false)+'<div class="cls">'+list[i].class_date+' '+list[i].start_time+'</div>'; }
  document.getElementById('cards').innerHTML=h;
  return list.map(function(c){return c.class_date.slice(5)+' '+c.start_time});
};</script>`;
const dir = mkdtempSync(join(tmpdir(), 'ttpd-'));
writeFileSync(join(dir, 'p.html'), page);

const WANT = {
  asc: ['10-28 09:30', '10-28 16:00', '10-28 20:00', '10-14 18:30', '10-15 14:00', '10-15 21:30', '10-16 16:10', '10-27 12:30'],
  desc: ['10-28 20:00', '10-28 16:00', '10-28 09:30', '10-27 12:30', '10-16 16:10', '10-15 21:30', '10-15 14:00', '10-14 18:30'],
};
const b = await chromium.launch();
let scen = 0;
for (const w of [1440, 900, 899, 390]) for (const theme of ['light', 'dark']) for (const lang of ['en', 'ko']) for (const dirn of ['asc', 'desc']) {
  scen++;
  const tag = `${w}px·${theme}·${lang}·${dirn}`;
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + join(dir, 'p.html'));
  const order = await p.evaluate(([lang, theme, dirn]) => { if (theme === 'dark') document.documentElement.setAttribute('data-t', 'dark'); return window.draw(lang, dirn); }, [lang, theme, dirn]);
  const m = await p.evaluate(() => {
    const trs = [...document.querySelectorAll('.cls-tbl tbody tr')];
    const seps = trs.filter(tr => tr.classList.contains('cls-day-sep'));
    const cardSeps = [...document.querySelectorAll('#cards .cls-day-sep')];
    const bg = el => getComputedStyle(el).backgroundColor;
    return {
      seq: trs.map(tr => tr.classList.contains('cls-day-sep') ? 'SEP' : 'ROW'),
      sepText: seps.map(s => s.textContent),
      sepBg: seps.map(s => bg(s.firstElementChild)),
      sepVisible: seps.every(s => { const r = s.getBoundingClientRect(); return r.width > 100 && r.height > 10; }),
      sepDisplay: seps.map(s => getComputedStyle(s).display),
      cardSepBg: cardSeps.map(bg), cardSepCount: cardSeps.length,
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  ok(tag + ' 순서: 오늘 먼저 → 지난 날짜+시각', JSON.stringify(order) === JSON.stringify(WANT[dirn]), order);
  ok(tag + ' 구분줄은 지난 날짜마다 하나(4개), 오늘 줄 앞엔 없다', JSON.stringify(m.seq) === JSON.stringify(
    dirn === 'asc' ? ['ROW','ROW','ROW','SEP','ROW','SEP','ROW','ROW','SEP','ROW','SEP','ROW'] : ['ROW','ROW','ROW','SEP','ROW','SEP','ROW','SEP','ROW','ROW','SEP','ROW']), m.seq);
  ok(tag + ' 구분줄 글자에 날짜·요일', m.sepText.length === 4 && m.sepText.some(t => t.includes('10-14 (' + (lang === 'en' ? 'Wed' : '수') + ')'))
    && m.sepText.every(t => t.includes(lang === 'en' ? 'earlier class' : '지난 수업')), m.sepText);
  const want = theme === 'dark' ? 'rgb(30, 42, 68)' : 'rgb(224, 231, 255)';
  ok(tag + ' 구분줄 색이 줄무늬·폰 규칙에 안 덮인다', m.sepBg.length === 4 && m.sepBg.every(c => c === want), m.sepBg);
  ok(tag + ' 카드 구분줄도 같은 색·4개', m.cardSepCount === 4 && m.cardSepBg.every(c => c === want), m.cardSepBg);
  ok(tag + ' 구분줄이 보인다(폭·높이)', m.sepVisible);
  ok(tag + ' 폰(<900)에서 구분줄은 격자 상자가 아니다', w < 900 ? m.sepDisplay.every(d => d === 'block') : m.sepDisplay.every(d => d === 'table-row'), m.sepDisplay);
  ok(tag + ' 페이지가 옆으로 안 밀린다', m.pageOverflow <= 0, m.pageOverflow);
  ok(tag + ' 스크립트 오류 0', !errs.length, errs);
  await p.close();
}
await b.close();
console.log(`결과: 시나리오 ${scen} · PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
