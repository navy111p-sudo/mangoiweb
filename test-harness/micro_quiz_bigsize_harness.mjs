/**
 * 🔍 micro-quiz 큰 글씨 개편 실측 하니스 (2026-07-13)
 *  - PC(1280)/모바일(400) 인트로 + 퀴즈 화면(가짜 gen-quiz 주입) 렌더
 *  - 눈에 보이는 모든 텍스트의 computed font-size ≥ 16px(12pt) 검사
 * 실행: node test-harness/micro_quiz_bigsize_harness.mjs
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(__dirname, '..', 'cloudflare-deploy', 'public', 'micro-quiz.html');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let pass = 0, fail = 0;
function check(name, ok, detail){
  if (ok) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name + (detail ? ' — ' + detail : '')); }
}

const FAKE = {
  ok: true,
  quizzes: Array.from({length:5}, (_,i)=>({
    id: 9000+i, source_word: ['gorgeous','brave','curious','sunny','happy'][i],
    options: ['아주 멋진','용감한','궁금한','화창한'],
    correct_index: 0, hint: 'example sentence '+i
  }))
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

async function audit(width, height, label){
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0,150)));
  await page.setViewport({ width, height, isMobile: width < 500, hasTouch: width < 500 });
  await page.evaluateOnNewDocument((fake)=>{
    const orig = window.fetch;
    window.fetch = function(url, opts){
      const u = String(url);
      if (u.includes('/api/vocab/gen-quiz')) return Promise.resolve(new Response(JSON.stringify(fake), {headers:{'Content-Type':'application/json'}}));
      if (u.includes('/api/')) return Promise.resolve(new Response(JSON.stringify({ok:false}), {headers:{'Content-Type':'application/json'}}));
      return orig.apply(this, arguments);
    };
  }, FAKE);
  await page.goto('file:///' + PAGE.replace(/\\/g,'/'), { waitUntil: 'domcontentloaded' });
  await new Promise(r=>setTimeout(r,900));

  // 최소 폰트 검사 함수 (보이는 텍스트 노드만)
  const minFont = () => page.evaluate(()=>{
    let min = 999, minEl = '';
    document.querySelectorAll('body *').forEach(el=>{
      if (!el.offsetParent && getComputedStyle(el).position!=='fixed') return;
      const hasText = Array.from(el.childNodes).some(n=>n.nodeType===3 && n.textContent.trim().length>1);
      if (!hasText) return;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < min){ min = fs; minEl = (el.className||el.tagName)+':'+el.textContent.trim().slice(0,20); }
    });
    return { min, minEl };
  });

  // 1) 인트로
  const introTitle = await page.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.intro h2')).fontSize));
  const introP = await page.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.intro p')).fontSize));
  const startFs = await page.evaluate(()=>parseFloat(getComputedStyle(document.getElementById('startBtn')).fontSize));
  check(label+' 인트로 제목 크게('+introTitle+'px)', introTitle >= 24);
  check(label+' 인트로 본문 ≥16px('+introP+'px)', introP >= 16);
  check(label+' 시작 버튼 크게('+startFs+'px)', startFs >= 20);
  let mf = await minFont();
  check(label+' 인트로 최소 폰트 ≥16px', mf.min >= 16, mf.min+'px @ '+mf.minEl);

  // 2) 퀴즈 화면 (가짜 데이터)
  await page.evaluate(()=>startQuiz());
  await new Promise(r=>setTimeout(r,900));
  const quizOn = await page.evaluate(()=>document.getElementById('quizArea').style.display !== 'none' && !!document.querySelector('.quiz-card'));
  check(label+' 퀴즈 화면 렌더', quizOn);
  if (quizOn){
    const qText = await page.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.q-text')).fontSize));
    const optFs = await page.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.opt')).fontSize));
    check(label+' 문제 글자 크게('+qText+'px)', qText >= 22);
    check(label+' 보기 글자 크게('+optFs+'px)', optFs >= 18);
    mf = await minFont();
    check(label+' 퀴즈 최소 폰트 ≥16px', mf.min >= 16, mf.min+'px @ '+mf.minEl);
    // 가로 오버플로 없음
    const overflow = await page.evaluate(()=>document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    check(label+' 가로 스크롤 없음', !overflow);
  }
  check(label+' JS 에러 없음', errs.length===0, errs.join('|'));
  await page.screenshot({ path: path.join(__dirname, 'mq-'+label+'.png') });
  await page.close();
}

await audit(1280, 900, 'PC');
await audit(400, 850, 'MOBILE');

await browser.close();
console.log('\n' + (fail===0 ? '✅ ALL PASS' : '❌ FAILURES') + ` (pass ${pass} / fail ${fail})`);
process.exit(fail===0?0:1);
