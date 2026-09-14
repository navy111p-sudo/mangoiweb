#!/usr/bin/env node
/**
 * 🀄 중국어 대화(웜업) 하니스 — 2026-09-13
 *
 * [무엇을 지키려는가]
 *   ① 언어 축이 «서버와 화면에서 같은 말» 을 한다 (id·레벨 글자 수·기본값)
 *   ② 중국어를 골랐을 때 «영어 재료» 가 새지 않는다 (칩·안전망 질문·교정 규칙)
 *   ③ 그러면서 «영어는 예전과 똑같이» 동작한다 ← 이 짝이 없으면 "전부 중국어로 만들기" 도 통과한다
 *
 * ⚠️ 문자열로 「그 글자가 있는가」만 묻지 않습니다 — 판정 함수를 소스에서 오려 내 «실제로 돌려»
 *    답을 대조합니다(CLAUDE.md 2장의 반복 규칙).
 * ⛔ 기대값을 손으로 베껴 적지 마세요 — 숫자·목록은 전부 정본 소스에서 «읽어» 옵니다.
 */
import { readFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const ZH   = read('cloudflare-deploy/src/warmup-zh.ts');
const IDX  = read('cloudflare-deploy/src/index.ts');
const CORR = read('cloudflare-deploy/src/warmup-correction.ts');
const LOG  = read('cloudflare-deploy/src/warmup-log.ts');
const SAN  = read('cloudflare-deploy/src/reply-sanity.ts');
const HTML = read('cloudflare-deploy/public/warmup.html');

/** 주석을 벗겨 낸 사본 — «없어야 한다» 류 검사는 반드시 이것으로 판정한다. */
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const ZHC = strip(ZH), IDXC = strip(IDX), HTMLC = strip(HTML);

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}

/* TS 는 «손으로 지우지» 않는다 — 시그니처가 조금만 바뀌어도 치환이 어긋나 «검사가 못 봤다» 가
   된다(2026-09-13 에 실제로 그렇게 죽었다). 저장소가 이미 쓰는 방식대로 esbuild 로 번들한다.
   ⚠️ esbuild 가 없는 환경에서는 «실행 검증» 만 건너뛴다 — 그 사실을 화면에 적는다. */
const CF = join(ROOT, 'cloudflare-deploy');
let esb = null;
try { esb = createRequire(join(CF, 'package.json'))('esbuild'); } catch { /* 미설치 */ }
const TMP = mkdtempSync(join(tmpdir(), 'wzh-'));
async function loadTs(rel, name) {
  if (!esb) return null;
  const out = join(TMP, name + '.mjs');
  try {
    esb.buildSync({ entryPoints: [join(CF, rel)], bundle: true, format: 'esm',
      platform: 'neutral', outfile: out, logLevel: 'silent' });
  } catch (e) { console.log('     (번들 실패: ' + e.message + ')'); return null; }
  return await import('file://' + out.replace(/\\/g, '/'));
}

console.log('\n[ ① 언어 축 — 서버와 화면이 같은 말을 한다 ]');
const ZHMOD = await loadTs('src/warmup-zh.ts', 'zh');
if (!esb) console.log('  ⏭ esbuild 없음 — 실행 검증은 건너뜁니다(정적 검사만 유효)');
else check('전제: 정본(warmup-zh.ts)을 번들해 실제로 돌렸다', !!ZHMOD);

if (ZHMOD) {
  const n = ZHMOD.normalizeWarmupLang;
  check('zh 표기 네 가지를 모두 중국어로 받는다',
    ['zh', 'zh-CN', 'cn', 'Chinese'].every((v) => n(v) === 'zh'));
  /* ⚠️ «모르면 영어» 는 이 기능 전체의 실패 방향이다 — 중국어로 밀어붙이면 영어 학생이 다친다.
     ⛔ 「zh 를 알아듣는가」만 두지 마세요: 그러면 «전부 zh 로 만들기» 도 통과합니다. */
  check('모르는 값·빈 값·null 은 영어 (짝)',
    [undefined, null, '', 'ko', 'jp', 'zz', 0, {}].every((v) => n(v) === 'en'));
}

{
  // 화면 목록과 서버가 아는 값이 «같은 집합» 인가 — 화면에만 늘리면 조용히 영어로 떨어진다
  const m = HTML.match(/var LANG_CATALOG = \[([\s\S]*?)\];/);
  check('전제: 화면 LANG_CATALOG 를 읽었다', !!m);
  if (m && ZHMOD) {
    const ids = [...m[1].matchAll(/id:'([a-z-]+)'/g)].map((x) => x[1]);
    check('화면이 고르게 하는 언어를 서버가 전부 알아듣는다',
      ids.length >= 2 && ids.every((id) => ZHMOD.normalizeWarmupLang(id) === id),
      JSON.stringify(ids));
  }
}

console.log('\n[ ② 레벨 — 여덟 칸 · 글자 수가 화면과 짝이다 ]');
if (ZHMOD) {
  const caps = ZHMOD.WARMUP_ZH_CHAR_CAP;
  check('중국어 레벨표가 여덟 칸이다 (영어와 같은 눈금)',
    [1, 2, 3, 4, 5, 6, 7, 8].every((i) => typeof ZHMOD.WARMUP_ZH_LEVELS[i] === 'string'));
  check('글자 수 상한이 단조 증가하고 8단계는 무제한(0)이다',
    [1, 2, 3, 4, 5, 6, 7].every((i) => caps[i] > 0 && (i === 1 || caps[i] > caps[i - 1])) && caps[8] === 0,
    JSON.stringify(caps));

  /* 화면 dz 의 괄호 숫자 = 서버 상한. ⛔ 하니스에 숫자를 베껴 적지 않는다 — 둘 다 소스에서 읽는다. */
  const dz = [...HTML.matchAll(/dz:'([^']*)'/g)].map((x) => x[1]);
  check('전제: 화면 레벨 설명(dz) 여덟 개를 읽었다', dz.length === 8, 'n=' + dz.length);
  if (dz.length === 8) {
    const bad = [];
    for (let i = 1; i <= 7; i++) {
      const nums = [...dz[i - 1].matchAll(/(\d+)/g)].map((x) => Number(x[1]));
      if (!nums.length || Math.max(...nums) !== caps[i]) bad.push(i + ':' + dz[i - 1]);
    }
    check('화면 설명의 글자 수가 서버 상한과 같다', !bad.length, bad.join(' / '));
    check('8단계 설명에는 글자 수를 적지 않는다(상한 없음)', !/\d+\s*자/.test(dz[7]), dz[7]);
  }
}

console.log('\n[ ③ 대답 보기 — 중국어에 영어 칩이 새지 않는다 ]');
if (ZHMOD) {
  const c = ZHMOD.warmupZhAnswerChips;
  check('1·2단계에는 «막혔을 때» 중국어 칩을 준다',
    [1, 2].every((lv) => c('你好吗？', lv).length === ZHMOD.WARMUP_ZH_STUCK_CHIPS.length));
  /* ⚠️ 짝 — 이것이 없으면 「모든 단계에 칩 주기」도 통과한다. */
  check('3단계 이상·모르는 값에는 아무것도 안 준다 (짝)',
    [0, 3, 4, 8, 99, null, undefined, 'x'].every((lv) => c('你好吗？', lv).length === 0));
  const bad = ZHMOD.WARMUP_ZH_STUCK_CHIPS.filter((s) => /[가-힣()（）]/.test(s));
  check('⛔ 칩에 한국어·괄호가 없다 (누르면 그대로 학생 발화로 전송된다)', !bad.length, JSON.stringify(bad));
  check('칩이 한자다', ZHMOD.WARMUP_ZH_STUCK_CHIPS.every((s) => /[㐀-鿿]/.test(s)));
}

console.log('\n[ ④ 배선 — 언어가 실제로 흐르는가 ]');
check('화면이 모든 요청에 lang 을 싣는다(withCtx 한 곳)',
  /function withCtx\(body\)\{?[\s\S]{0,900}?body\.lang = _warmLang;/.test(HTMLC));
check('교재 소재 조회에도 lang 을 싣는다', /qs\.set\('lang', _warmLang\)/.test(HTMLC));
check('서버가 대화 요청의 lang 을 정본으로 좁힌다',
  /const ctxLang = normalizeWarmupLang\(body && body\.lang\)/.test(IDXC));
check('「질문 골라 보기」도 같은 축을 쓴다',
  /const qLang = normalizeWarmupLang\(body\.lang\)/.test(IDXC));
check('안전망 질문도 «고른 말» 로 준다',
  /WARMUP_ZH_FALLBACK_QUESTIONS\s*:\s*WARMUP_FALLBACK_QUESTIONS/.test(IDXC));
check('교재 소재는 중국어 표(zh_vocab·zh_passage)에서 온다',
  /lang[\s\S]{0,80}'zh'[\s\S]{0,200}zhWarmupSentences/.test(IDXC));
/* 🔴 캐시 키에 언어가 없으면 «영어 교재 소재» 가 중국어 대화에 그대로 실린다 — 에러가 안 난다. */
check('교재 소재 캐시 키에 언어가 들어 있다',
  /const sig = \[[^\]]*o\.lang[^\]]*\]/.test(IDXC),
  '없으면 같은 세션에서 영어 소재가 중국어 대화로 샌다');

console.log('\n[ ⑤ 교정 — 축이 언어마다 다르다 ]');
check('중국어 교정 축이 따로 있다', /export const ZH_MEANING_CHANGING_TAGS/.test(CORR));
check('영어 축과 «합치지» 않았다',
  /export const MEANING_CHANGING_TAGS/.test(CORR) &&
  !/MEANING_CHANGING_TAGS\s*=\s*\[[^\]]*ZH_MEANING/.test(strip(CORR)));
check('검증기가 축을 받아서 판정한다',
  /function verifyWarmupFix\([\s\S]{0,200}majorTags/.test(CORR));
check('서버가 중국어일 때 그 축을 넘긴다',
  /verifyWarmupFix\([\s\S]{0,120}ZH_MEANING_CHANGING_TAGS/.test(IDXC));
/* ⚠️ 중국어에는 «낱말 수» 상한이 성립하지 않는다(띄어쓰기가 없다) — 0 으로 꺼야 한다.
   안 끄면 한자 한 덩어리가 «1낱말» 로 세어져 상한이 아무 일도 안 하거나, 반대로 통째로 버린다. */
check('중국어에는 낱말 수 상한을 걸지 않는다',
  /const sanityCap = ctxLang === 'zh' \? 0 :/.test(IDXC));

console.log('\n[ ⑥ 무너진 출력 — 한자 문장도 본다 ]');
const SANMOD = await loadTs('src/reply-sanity.ts', 'san');
if (esb) check('전제: reply-sanity 를 번들해 실제로 돌렸다', !!SANMOD);
if (SANMOD) {
  const r = SANMOD.replyBreakReason;
  /* 짝 ①  — 멀쩡한 중국어를 버리지 않는다(버리면 대화가 끊긴다 = 깨진 문장보다 나쁘다) */
  check('멀쩡한 중국어 문장은 통과한다 (짝)',
    ['你今天好吗？', '你好！我是Lily。🥭 你喜欢猫还是狗？',
     '我昨天去了学校，跟朋友一起打篮球，然后回家做作业，晚上看了一部电影。'].every((t) => r(t) === ''),
    '거짓 실패는 거짓 통과만큼 나쁘다');
  /* 짝 ② — 한 글자 죽·끝나지 않는 문장은 잡는다 */
  check('되풀이 한자 죽을 잡는다', /^zhrepeat/.test(r('的'.repeat(36))));
  check('끝나지 않는 긴 한자 문장을 잡는다',
    r('我今天早上起床以后先刷牙洗脸然后吃早饭接着去学校上课中午跟同学一起吃饭下午继续上课晚上回家写作业') === 'zhnostop');
  check('영어 판정은 예전 그대로다 (짝)',
    r('Hi! I am Lily. Do you like cats or dogs?') === '' && /^repeat/.test(r(('of ').repeat(60))));
}

console.log('\n[ ⑦ 기록 — 「중국어로 몇 명이 쓰는가」를 셀 수 있다 ]');
check('세션 기록표에 lang 칸이 있다', /column: 'lang'/.test(LOG));
check('⛔ CREATE 를 고치지 않고 ALTER 로 붙였다 (이미 만들어진 표는 CREATE 를 다시 안 본다)',
  !/CREATE TABLE IF NOT EXISTS warmup_session_log[\s\S]{0,400}lang/.test(LOG));
check('이미 있는 칸은 다시 붙이지 않는다(PRAGMA 로 먼저 물어본다)',
  /PRAGMA table_info/.test(LOG) && !/ADD COLUMN[\s\S]{0,120}catch\s*\{\s*\}/.test(strip(LOG)));
check('서버가 그 값을 실제로 기록한다', /lang: ctxLang,/.test(IDXC));
check('모르는 값은 영어로 적는다', /=== 'zh'\) \? 'zh' : 'en'/.test(LOG));

console.log('\n[ ⑧ 화면 — 중국어를 영어 목소리로 읽지 않는다 ]');
check('TTS 요청에 고른 언어를 그대로 넘긴다', /lang:_warmLang/.test(HTMLC));
check('브라우저 폴백 보이스를 그 언어로 고른다',
  /var want = isZh\(\) \? 'zh' : 'en';/.test(HTMLC));
/* 🔴 중국어 보이스가 없을 때 «영어 목소리로 읽는» 것이 최악이다 — 아이가 그 발음을 따라 한다. */
check('중국어 보이스가 없으면 읽지 않는다',
  /if\(isZh\(\) && !_enVoice\)\{ if\(onDone\) onDone\(\); return; \}/.test(HTMLC));
check('마이크도 그 언어로 듣는다',
  /lang: _warmLang/.test(HTMLC) && /_recog\.lang=isZh\(\) \? 'zh-CN' : 'en-US'/.test(HTMLC));

console.log('\n[ ⑨ 고정 인사말 — 중국어를 골랐는데 영어로 인사하지 않는다 ]');
{
  const m = HTML.match(/var BEGINNER_GREETINGS_ZH = \{([\s\S]*?)\n\};/);
  check('전제: 중국어 인사말 표를 읽었다', !!m);
  if (m && ZHMOD) {
    const body = m[1];
    const zhs = [...body.matchAll(/(\d):\s*\{\s*zh:\s*'([^']*)'/g)];
    check('여덟 단계가 모두 있다', zhs.length === 8, 'n=' + zhs.length);
    check('모든 인사가 한자다', zhs.every((x) => /[㐀-鿿]/.test(x[2])));
    check('친구 이름 자리를 쓴다(고른 친구를 따라간다)', zhs.every((x) => x[2].includes('{name}')));
    /* 질문 길이가 서버 상한 안인가 — 괄호(병음·뜻)는 자막 전용이라 세지 않는다. */
    const over = [];
    for (const [, lv, txt] of zhs) {
      const q = txt.replace(/\([^)]*\)/g, '').split(/[。！？!?]/).filter((x) => /[㐀-鿿]/.test(x)).pop() || '';
      const cnt = (q.match(/[㐀-鿿]/g) || []).length;
      const cap = ZHMOD.WARMUP_ZH_CHAR_CAP[Number(lv)];
      if (cap > 0 && cnt > cap) over.push(lv + ':' + cnt + '>' + cap);
    }
    check('인사말 질문이 그 단계 글자 수 안이다', !over.length, over.join(' '));
    /* ⛔ 보기 칩은 그대로 학생 발화로 전송된다 — 한국어·괄호가 있으면 안 된다. */
    const chips = [...body.matchAll(/chips:\s*\[([^\]]*)\]/g)]
      .flatMap((x) => [...x[1].matchAll(/'([^']*)'/g)].map((y) => y[1]));
    check('⛔ 인사말 보기 칩에 한국어·괄호가 없다',
      chips.every((c) => !/[가-힣()（）]/.test(c)), JSON.stringify(chips.filter((c) => /[가-힣()（）]/.test(c))));
    check('4단계 이상은 보기를 주지 않는다(스스로 답하는 것이 훈련)',
      /4:\s*\{[\s\S]{0,260}?chips:\s*\[\s*\]/.test(body));
  }
  check('언어에 맞는 인사말 표를 고른다',
    /\(isZh\(\) \? BEGINNER_GREETINGS_ZH : BEGINNER_GREETINGS\)\[_warmLevel\]/.test(HTMLC));
  /* 짝 — 영어 표는 그대로 있어야 한다(중국어를 붙이며 지우지 않았는가) */
  check('영어 인사말 표는 그대로다 (짝)', /var BEGINNER_GREETINGS = \{/.test(HTML));
}

console.log('\n[ ⑩ 기본값 — 모르면 영어, 학생이 고른 것은 덮지 않는다 ]');
check('화면 기본 언어가 영어다', /var _warmLang = 'en';/.test(HTMLC));
check('힌트는 학생이 고른 적이 없을 때만 묻는다',
  /if\(_langProbed \|\| _warmLangChosen\) return;/.test(HTMLC));
/* 🔴 힌트로 바꿀 때 저장까지 하면 «학생이 고른 것» 이 되어, 나중에 기본값을 되돌릴 수 없다. */
check('힌트는 저장하지 않는다(setWarmLang 을 쓰지 않는다)',
  (() => {
    /* ⚠️ «줄이 나란한가» 로 묻지 않는다 — 줄 끝 주석 하나에 어긋난다(실제로 밟았다).
       물어야 할 것은 «그 함수 안에서 저장 함수를 부르지 않는가» 다. */
    const i = HTMLC.indexOf('function probeSuggestLang()');
    if (i < 0) return false;
    const o = HTMLC.indexOf('{', i);
    let d = 0, body = '';
    for (let k = o; k < HTMLC.length; k++) {
      if (HTMLC[k] === '{') d++;
      else if (HTMLC[k] === '}') { d--; if (!d) { body = HTMLC.slice(o, k + 1); break; } }
    }
    return body.includes("_warmLang = 'zh'") && !/\bsetWarmLang\s*\(/.test(body);
  })(),
  '저장하면 «학생이 고른 것» 이 되어 나중에 기본값을 되돌릴 수 없습니다');
check('힌트 요청은 세션 기록을 남기지 않는다(session_id 를 안 보낸다)',
  /context\?hint=1&user_id=/.test(HTMLC) && !/hint=1[^\n]*session_id/.test(HTMLC));

console.log('\n════════════════════════════════════════════════════════════');
console.log(`  🀄 중국어 대화 하니스: ✅ ${pass} 통과 / ❌ ${fail} 실패`);
console.log('════════════════════════════════════════════════════════════');
if (fail) process.exit(1);
