/* 수동 브라우저 검사 — 강사 «오늘의 수업» 표 7칸 + 실선, PC=표(B안) · 폰=수업당 격자 상자(D안) (2026-10-27)
   teacher.html 의 «실제» 표 CSS(<style>) 와 «실제» classTableHtml·extrasHtml·portalContact 를 그대로 띄워 잰다.
   문자열 하니스(teacher_class_table_harness ⑨)는 CSS 글자만 보므로, «어느 규칙이 이기는가» 는 여기서만 잡힌다
   (실제로 «폰 마지막 상자의 안쪽 선이 PC 규칙에 지워지는» 사고를 함정 대조가 찾았다).
   실행:  node test-harness/manual/teacher-class-table-grid-browser.mjs        (폭 6종 × 줄 수 1~6 × 테마 2)
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
const code = ['classTableHtml', 'extrasHtml', 'portalContact'].map(fn).join('\n');
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; if (!c) console.log('  ❌ FAIL ' + n + (d === undefined ? '' : '  — ' + JSON.stringify(d).slice(0, 300))); };
ok('전제: 표 CSS 와 세 함수를 찾았다', style.length > 500 && code.length > 1000, [style.length, code.length]);

// 페이지 폭 규칙을 흉내: 900px 이상은 .wrap 1180 + 패딩 28, 카드 패딩 18 / 미만은 12 + 18
const page = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>
body{margin:0;font-family:sans-serif}.wrap{max-width:1180px;margin:0 auto;padding:12px}.card{padding:18px;background:#fff}
@media(min-width:900px){.wrap{padding:24px 28px}}${style}</style><div class=wrap><div class=card id=box></div></div><script>
var MangoiClassDisplay={range:function(c){return c.start_time+'–'+c.end_time}};
function esc(x){return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
var LANGX='en'; function T(en,ko){return LANGX==='ko'?ko:en}
function stuLabelHtml(c){return esc(c.student_name)+' <span>'+esc(c.student_uid)+'</span>'} function stuLabelText(c){return c.student_name}
function stuUid(c){return c.student_uid||''} function kindPill(){return ''} function goalHtml(){return '<p>goal</p>'} function preqHtml(){return ''} function handoverHtml(){return ''}
function todayKST(){return '2026-10-27'} function hhmm(){return '09:00'}
${code}
window.draw=function(n,lang){ LANGX=lang; var rows=[];
  for(var i=0;i<n;i++) rows.push({kind:'class',schedule_id:i+1,room_id:'class-'+(i+1)+'-20261027',start_time:'0'+(i%9)+':00',end_time:'0'+(i%9)+':20',
    student_name:'Student '+i+' Longname',student_uid:'stu'+i,student_phone:'010-1234-56'+(10+i),academy:i%2?'유앤아이 운남어학원 본점':'',class_date:'2026-10-27',
    sched_label_en:'37 one-off',teacher_entry:{state:'pending'},attendance:{state:'not_yet'},level:'L5',textbook:'Reading 4',absence_hold:i===0,
    class_state:i===2?'postponed':'',week_days:[0,1,1,1,1,0,0],week_dates:['2026-10-27'],previous_lesson_loaded:true,
    prev_lesson:{teacher_name:'Teacher Len',date:'2026-10-20'},last_eval:{id:9,date:'2026-10-20',score:4,max:5}});
  document.getElementById('box').innerHTML=classTableHtml(rows,{status:function(){return '<span>Scheduled</span>'},
    act:function(c,i){return '<button class=btn data-join='+i+'>Enter early · 14h 14m</button>'},wi:function(c,i){return i}});
};</script>`;
const dir = mkdtempSync(join(tmpdir(), 'tct-'));
writeFileSync(join(dir, 'p.html'), page);

const b = await chromium.launch();
const WIDTHS = [1440, 1180, 900, 899, 390, 320];
let scen = 0;
for (const w of WIDTHS) for (const theme of ['light', 'dark']) for (const n of [1, 2, 3, 6]) for (const lang of ['en', 'ko']) {
  scen++;
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + join(dir, 'p.html'));
  await p.evaluate(([n, lang, theme]) => { if (theme === 'dark') document.documentElement.setAttribute('data-t', 'dark'); window.draw(n, lang); }, [n, lang, theme]);
  const m = await p.evaluate(() => {
    const px = v => parseFloat(v) || 0;
    const wrap = document.querySelector('.cls-tbl-wrap'), rows = [...document.querySelectorAll('.cls-tbl tbody tr')];
    const last = rows[rows.length - 1], q = (tr, k) => tr.querySelector('td.c-' + k);
    const per = rows.map(tr => { const R = tr.getBoundingClientRect();
      return { inside: [...tr.children].every(c => { const r = c.getBoundingClientRect(); return r.width > 0 && r.left >= R.left - 1 && r.right <= R.right + 1; }),
        disp: getComputedStyle(tr).display }; });
    const cs = (el, pe) => getComputedStyle(el, pe);
    return {
      pageOverflow: document.documentElement.scrollWidth - innerWidth, wrapScroll: wrap.scrollWidth - wrap.clientWidth,
      theadShown: cs(document.querySelector('.cls-tbl thead')).display !== 'none', per,
      vline: px(cs(q(rows[0], 'cal')).borderRightWidth), hline: px(cs(q(rows[0], 'cal')).borderBottomWidth),
      lastStuLine: px(cs(q(last, 'stu')).borderBottomWidth), lastTimeLine: px(cs(q(last, 'time')).borderBottomWidth),
      lastConnLine: px(cs(q(last, 'conn')).borderBottomWidth), lastCalLabel: cs(q(last, 'cal'), '::before').content,
      actGap: px(cs(q(rows[0], 'act').querySelector('.cls-tbl-act')).marginTop),
      actBelowStu: q(rows[0], 'act').getBoundingClientRect().top >= q(rows[0], 'stu').getBoundingClientRect().bottom - 1,
      actLast: q(rows[0], 'act').getBoundingClientRect().left > q(rows[0], 'prev').getBoundingClientRect().left,
      postponedBg: rows[2] ? cs(q(rows[2], 'stu')).backgroundColor : null,
      evenBg: rows[1] ? cs(q(rows[1], 'stu')).backgroundColor : null, oddBg: cs(q(rows[0], 'stu')).backgroundColor,
    };
  });
  const tag = `${w}px·${theme}·${n}줄·${lang}`, phone = w < 900;
  ok(`[${tag}] JS 오류 0`, !errs.length, errs);
  ok(`[${tag}] 페이지 가로 넘침 0`, m.pageOverflow <= 0, m.pageOverflow);
  ok(`[${tag}] 표 상자 가로 넘침 0`, m.wrapScroll <= 1, m.wrapScroll);
  ok(`[${tag}] 칸이 줄(상자) 밖으로 안 샌다`, m.per.every(r => r.inside));
  if (!phone) {
    ok(`[${tag}] PC: 표 모양(머리줄·table-row)`, m.theadShown && m.per.every(r => r.disp === 'table-row'));
    // 가로선은 «줄 사이» 선이라 1줄뿐이면 없다(마지막 줄 아래선은 상자 테두리가 맡는다)
    ok(`[${tag}] PC: 세로선 1px${n > 1 ? '·줄 사이 가로선 1px' : ''}`, m.vline >= 1 && (n === 1 || m.hline >= 1), [m.vline, m.hline]);
    ok(`[${tag}] PC: 할 일 칸이 맨 오른쪽`, m.actLast);
    if (n > 1) ok(`[${tag}] PC: 줄무늬(짝수 줄 색이 다름)`, m.evenBg !== m.oddBg, [m.evenBg, m.oddBg]);
  } else {
    ok(`[${tag}] 폰: 머리줄 숨김 · 수업마다 grid 상자`, !m.theadShown && m.per.every(r => r.disp === 'grid'));
    ok(`[${tag}] 폰: 할 일이 학생 아래 줄`, m.actBelowStu);
    ok(`[${tag}] 폰: 칸 이름 표시(::before)`, m.lastCalLabel && m.lastCalLabel !== 'none' && m.lastCalLabel !== 'normal', m.lastCalLabel);
    ok(`[${tag}] 폰: 마지막 상자도 안쪽 선이 있다(학생 1px · 머리 2px)`, m.lastStuLine >= 1 && m.lastTimeLine >= 2, [m.lastStuLine, m.lastTimeLine]);
    ok(`[${tag}] 폰: 상자 맨 아래 칸은 선 없음(테두리와 겹치지 않음)`, m.lastConnLine === 0, m.lastConnLine);
    ok(`[${tag}] 폰: 버튼 위 여백 0`, m.actGap === 0, m.actGap);
    if (n > 1) ok(`[${tag}] 폰: 줄무늬 없음(상자마다 같은 바탕)`, m.evenBg === m.oddBg, [m.evenBg, m.oddBg]);
  }
  if (n >= 3) ok(`[${tag}] 연기된 줄 강조가 남는다`, /rgb\((255, 244, 224|58, 42, 16)\)/.test(m.postponedBg), m.postponedBg);
  await p.close();
}
await b.close();
console.log(`\n결과: 시나리오 ${scen} · PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
