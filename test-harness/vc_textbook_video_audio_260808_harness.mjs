// -*- coding: utf-8 -*-
// 🎬🔊 마이마이 ②(교재 열면 영상이 나옴) · ④(입장 직후 소리 안 들림) 하네스 (2026-08-08)
//   실행: node test-harness/vc_textbook_video_audio_260808_harness.mjs
//
//   ② "영상을 틀지 않았는데 교재를 열면 영상이 나오고 교재가 안 보인다"
//      [원인] 교재를 고르면 selectFromTextbookLibrary 가 mangoiPlayLessonVideo 를 같이 불렀고,
//             그 함수가 **무조건** vcSwitchTab('video') + 자동재생이었다.
//             교재 쪽은 vcSwitchTab('pdf') 를 먼저 하지만 영상 쪽은 fetch 라 **나중에 끝나** 항상 이겼다.
//   ④ "처음 입장하면 학생이 소리가 안 들린다 — 기다리니 들렸다"
//      [원인] ontrack 에서 오디오 트랙이 와도 vcEnsureRemoteAudio 를 부르지 않아,
//             3초 워치독이 뒤늦게 살릴 때까지 조용했다.
//
//   ⚠️ ② 는 함수를 떼어내 **가짜 브라우저에서 실제로 실행**한다(글자 매칭 아님).
//      🔴 ctx.window = ctx 를 안 걸면 맨 이름이 ReferenceError → catch 에 먹혀 헛통과한다.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dir, '../cloudflare-deploy/public/index.html'), 'utf8');
const x3   = readFileSync(resolve(__dir, '../cloudflare-deploy/public/js/idx-x3.js'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${!cond && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''}`);
}

// ── ② mangoiPlayLessonVideo 를 떼어내 실제 실행 ──────────────────────────
const S2 = 'window.mangoiPlayLessonVideo = async function(';
const a0 = html.indexOf(S2);
if (a0 < 0) { console.log('❌ mangoiPlayLessonVideo 를 찾지 못했습니다'); process.exit(1); }
const a1 = html.indexOf('\n  };', a0);
const SRC2 = html.slice(a0, a1 + 5);

function runVideo({ autoOpen, youtube = false }) {
  const tabs = [], toasts = [];
  const stage = { _html: '', set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; } };
  const ctx = {
    console, Promise, setTimeout,
    fetch: async () => ({ json: async () => ({
      success: true, has_video: true, video_type: 'preview', video_title: 'Unit 2',
      is_youtube: youtube, youtube_id: youtube ? 'abc123' : null,
      video_url: youtube ? null : 'https://x/v.mp4',
    }) }),
    /* innerHTML 을 넣은 뒤 코드가 getElementById('ml-vid'/'ml-un') 로 그 요소를 찾는다.
       진짜 브라우저에선 당연히 찾아지므로, 스텁도 «찍힌 HTML 안에 그 id 가 있으면» 돌려준다.
       (이걸 null 로 두면 v.src 에서 던지고 try/catch 에 먹혀 뒷부분이 통째로 안 돈다 — 실제로 겪음) */
    document: {
      getElementById: (id) => {
        if (id === 'vp-stage') return stage;
        if (stage.innerHTML.indexOf('id="' + id + '"') >= 0) {
          return { set src(v) { this._src = v; }, get src() { return this._src; },
                   style: {}, muted: true, play: () => Promise.resolve(), onclick: null };
        }
        return null;
      },
    },
    vcSwitchTab: (t) => tabs.push(t),
    showToast: (m) => toasts.push(m),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC2, ctx);
  return ctx.window.mangoiPlayLessonVideo('BTS 1 unit 2', autoOpen ? { autoOpen: true } : undefined)
    .then(() => ({ tabs, toasts, stageHtml: stage.innerHTML }));
}

console.log('\n[ ② 교재를 열면 «교재» 가 보여야 한다 — 영상이 화면을 뺏지 않는다 ]');
{
  const r = await runVideo({ autoOpen: false });
  check('🔴 영상 탭으로 전환하지 않는다 (교재가 화면을 지킨다)', !r.tabs.includes('video'), { tabs: r.tabs });
  check('🔴 자동재생하지 않는다 — mp4', !/autoplay/.test(r.stageHtml), r.stageHtml.slice(0, 120));
  check('⚡ 대기 상태에선 preload 도 안 한다 (필리핀 회선)', /preload="none"/.test(r.stageHtml));
  check('영상이 있다는 것은 알려준다', r.toasts.some((t) => /영상이 준비|video for this book is ready/.test(t)), r.toasts);
  check('영상 자체는 준비된다 (기능을 지우지 않았다)', /<video/.test(r.stageHtml));
}
{
  const r = await runVideo({ autoOpen: false, youtube: true });
  check('🔴 유튜브도 자동재생하지 않는다', /autoplay=0/.test(r.stageHtml), r.stageHtml.slice(0, 160));
  check('유튜브도 영상 탭으로 끌고 가지 않는다', !r.tabs.includes('video'), { tabs: r.tabs });
}
{
  // 일부러 «영상 보기» 를 누르는 경로는 예전처럼 동작해야 한다
  const r = await runVideo({ autoOpen: true });
  check('일부러 열 때(autoOpen)는 예전대로 영상 탭 + 자동재생', r.tabs.includes('video') && /autoplay/.test(r.stageHtml),
    { tabs: r.tabs });
  check('그때는 «소리 켜기» 버튼이 뜬다 (음소거 자동재생이라)', /ml-un/.test(r.stageHtml));
  check('그때는 안내 토스트를 띄우지 않는다 (이미 보고 있다)', !r.toasts.some((t) => /영상이 준비|video for this book is ready/.test(t)), r.toasts);
}

console.log('\n[ 🌐 강사가 보는 안내는 한/영 둘 다 (강사 다수 필리핀 — 상시 지시) ]');
/* 이 토스트를 보는 사람은 «교재를 고른 강사» 다. 한국어만 쓰면 못 읽는다.
   (학생용 「선생님이 교재를 열었어요」는 학생이 한국인이라 기존 관례대로 한국어) */
{
  const lv = html.slice(html.indexOf('window.mangoiPlayLessonVideo'));
  check('영어 문구가 실제로 들어 있다', /video for this book is ready/.test(lv));
  check('언어 판정을 실제로 한다 (문구만 넣고 안 쓰면 소용없다)',
    /getLang[\s\S]{0,160}mangoi_lang/.test(lv) && /_en\s*\?/.test(lv));
}

console.log('\n[ ② 교재 선택부가 화면을 뺏지 않게 부른다 ]');
check('교재를 고를 때 autoOpen 을 주지 않는다',
  /window\.mangoiPlayLessonVideo\(_bk\);/.test(x3) && !/mangoiPlayLessonVideo\(_bk,\s*\{/.test(x3));
check('교재 선택은 여전히 교재 탭으로 간다', /window\.vcSwitchTab\('pdf'\)/.test(x3));

console.log('\n[ ④ 소리는 «트랙이 오는 순간» 살린다 — 워치독을 기다리지 않는다 ]');
const ot = html.slice(html.indexOf('pc.ontrack = (event) => {'), html.indexOf('pc.ontrack = (event) => {') + 3000);
check('🔴 ontrack 에서 오디오 트랙이면 즉시 소리를 살린다',
  /event\.track\.kind === 'audio'[\s\S]{0,200}vcEnsureRemoteAudio\(\)/.test(ot));
check('타이밍 차를 대비해 한 번 더 시도한다', /setTimeout\(function\(\)\{ try \{ vcEnsureRemoteAudio\(\); \} catch\(_\)\{\} \}, 300\)/.test(ot));
check('상대가 마이크를 껐다 켠 경우(onunmute)도 살린다',
  /onunmute[\s\S]{0,300}kind === 'audio'[\s\S]{0,80}vcEnsureRemoteAudio/.test(ot));
check('⛔ 기존 워치독·배너는 그대로 둔다 (정책 차단 경로는 그쪽 담당)',
  /function vcAudioWatchdog/.test(html) && /vcToggleSoundBanner/.test(html));
check('⛔ 저대역 음성전용(AAO)도 그대로 (CLAUDE.md 제거 금지)', /function vcAAOApply/.test(html));

console.log('\n[ 🧪 하네스가 진짜로 돌고 있는가 — 헛통과 방지 ]');
{
  const r = await runVideo({ autoOpen: true });
  check('가짜 브라우저에서 함수가 실제로 실행된다 (stage 에 내용이 찍혔다)', r.stageHtml.length > 50, { len: r.stageHtml.length });
}

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────\n');
process.exit(FAIL ? 1 : 0);
