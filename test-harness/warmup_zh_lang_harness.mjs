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
/* ⚠️ 부정 검사는 «주석을 벗겨 낸 사본» 으로 — 원문으로 보면 CREATE 와 lang 사이에 설명
   주석 한 줄만 들어가도 자기 주석을 잡습니다(CLAUDE.md 2장). 창(400자)도 함께 넓힙니다. */
check('⛔ CREATE 를 고치지 않고 ALTER 로 붙였다 (이미 만들어진 표는 CREATE 를 다시 안 본다)',
  !/CREATE TABLE IF NOT EXISTS warmup_session_log[\s\S]*?\)`/.test(strip(LOG).replace(/[\s\S]*?(CREATE TABLE IF NOT EXISTS warmup_session_log)/, '$1').split('`,')[0] + '`') ||
  !/lang/.test((strip(LOG).match(/CREATE TABLE IF NOT EXISTS warmup_session_log[\s\S]*?\)`/) || [''])[0]));
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

console.log('\n[ ⑪ 🔴 중국어 교정이 «실제로 통과하는가» — 배선이 아니라 결과로 묻는다 ]');
{
  /* 📜 2026-09-13 함정 대조가 잡은 것: 새로 만든 중국어 교정 규칙·축·배선이 전부 있는데
     `verifyWarmupFix` 가 `isEnglishText` 로 재서 **중국어 교정이 한 건도 통과하지 못했습니다.**
     ⛔ 그래서 이 절은 「그 함수를 부르는가」로 묻지 않습니다 — **돌려서 답을 봅니다.** */
  const CORRMOD = await loadTs('src/warmup-correction.ts', 'corr');
  if (esb) check('전제: warmup-correction 을 번들해 실제로 돌렸다', !!CORRMOD);
  if (CORRMOD) {
    const V = CORRMOD.verifyWarmupFix;
    const zhOpts = { majorTags: CORRMOD.ZH_MEANING_CHANGING_TAGS, lang: 'zh' };
    const zhCases = [
      ['어순(时间词)', { was: '我去学校昨天', now: '我昨天去了学校', why_ko: '시간을 나타내는 말은 앞에 와요.', tag: 'word_order' }, '我去学校昨天。'],
      ['양사',         { was: '一个书',      now: '一本书',        why_ko: '책에는 本 을 써요.',              tag: 'word_choice' }, '我有一个书。'],
      ['了',           { was: '我吃饭',      now: '我吃了饭',      why_ko: '이미 한 일이니 了 를 붙여요.',    tag: 'verb_form' }, '昨天我吃饭。'],
    ];
    for (const [name, fix, said] of zhCases) {
      const got = V(fix, said, zhOpts);
      check('중국어 교정이 통과한다 — ' + name, !!got && got.now === fix.now,
        got ? JSON.stringify(got) : 'null (버려짐)');
    }
    /* 짝 ① — 뜻이 달라지는 축은 major 로 올라와야 한다(모델이 minor 라 해도) */
    const sev = V({ was: '我去学校昨天', now: '我昨天去了学校', why_ko: '시간 말이 앞이에요.', tag: 'word_order', severity: 'minor' }, '我去学校昨天。', zhOpts);
    check('중국어 «뜻이 달라지는» 축은 major 로 본다 (짝)', !!sev && sev.severity === 'major',
      sev ? sev.severity : 'null');
    /* 짝 ② — 지어낸 교정은 중국어에서도 버린다(학생이 말하지 않은 것) */
    check('학생이 말하지 않은 중국어 교정은 버린다 (짝)',
      V({ was: '一个书', now: '一本书', why_ko: '책에는 本 을 써요.', tag: 'word_choice' }, '你好吗？', zhOpts) === null);
    check('한국어가 섞인 중국어 교정은 버린다 (짝)',
      V({ was: '나는 학교', now: '我去学校', why_ko: '이렇게 써요.', tag: 'word_order' }, '나는 학교', zhOpts) === null);
    /* 🔴 짝 ③ — 영어 경로가 한 글자도 안 바뀌었는가. lang 을 안 넘기면 예전 그대로여야 한다. */
    check('영어 교정은 예전 그대로 통과한다 (짝)',
      !!V({ was: 'I go to school yesterday', now: 'I went to school yesterday', why_ko: '어제 일이니 과거형이에요.', tag: 'past_tense' },
           'I go to school yesterday.'),
      '영어가 깨지면 이 변경은 되돌려야 합니다');
    check('영어 경로에 중국어를 넣으면 여전히 버린다 (짝)',
      V({ was: '我去学校昨天', now: '我昨天去了学校', why_ko: '시간 말이 앞이에요.', tag: 'word_order' }, '我去学校昨天。') === null,
      'lang 을 안 넘겼는데 통과하면 영어 게이트가 풀린 것입니다');
  }
  /* 배선 — 서버가 그 언어를 «실제로 넘기는가» */
  check('서버가 검증기에 lang 을 넘긴다',
    /verifyWarmupFix\([\s\S]{0,300}lang: 'zh'/.test(IDXC),
    '안 넘기면 중국어 교정이 100% 버려집니다');
}

console.log('\n[ ⑫ 🀄 «영어 고정» 지시문이 중국어 프롬프트에 남지 않았는가 ]');
{
  /* 🔴 이 줄들은 warmupZhSystem() 의 「중국어로 말해」 **뒤에** 붙어서 더 뒤·더 구체적인
     지시가 이깁니다 — 영어 고정으로 두면 중국어 대화에 「아주 쉬운 영어 질문」이 들어갑니다. */
  check('교재 소재 안내가 언어를 탄다',
    /핵심 중국어 표현 예시/.test(IDXC) && /핵심 영어 문장 예시/.test(IDXC));
  check('웜업 방식 안내가 언어를 탄다',
    /아주 쉬운 중국어\(간체자\) 질문/.test(IDXC) && /아주 쉬운 영어 질문/.test(IDXC));
  check('「질문 골라 보기」도 교재 소재를 그 언어로 읽는다',
    /warmupLessonContextCached\(env, sessionId, \{[^}]*lang: qLang/.test(IDXC),
    '빠지면 캐시 키가 |en 이 되어 영어 문장이 중국어 질문 프롬프트로 들어갑니다');
}

console.log('\n[ ⑬ 🔴 «어느 쪽이 나오는가» — 삼항식을 실제로 평가한다 ]');
{
  /* 📜 2026-09-13 함정 대조: 「영어 정본이 있는가 + 중국어 정본이 있는가」 짝만으로는
     **영·중을 뒤바꾼 변이**(`ctxLang === 'zh' ? 영어 : 중국어`)가 둘 다 통과합니다.
     ⇒ 식을 오려 내 «zh 일 때 무엇이 나오는가» 를 **실제로 평가**합니다.
     ⚠️ 상수 이름을 그대로 평가하면 `… is not defined` 로 죽어 조용히 catch 로 빠집니다 —
        이름을 표식으로 바꿔 넣고, 「식을 찾아 평가했다」를 **전제 검사로** 둡니다
        (안 두면 식이 안 잡혔을 때 검사가 통째로 사라집니다). */
  const pick = (re, enName, zhName) => {
    const m = IDXC.match(re);
    if (!m) return { found: false };
    const src = m[1].split(zhName).join('"ZH"').split(enName).join('"EN"');
    try {
      const f = new Function('ctxLang', 'return (' + src + ');');
      return { found: true, zh: f('zh'), en: f('en') };
    } catch (e) { return { found: true, err: e.message }; }
  };
  const cases = [
    ['난이도 표', /\[난이도\] \$\{\((ctxLang === 'zh' \? \w+ : \w+)\)\[ctxDifficulty\]\}/,
      'WARMUP_LEVELS', 'WARMUP_ZH_LEVELS'],
    ['교정 규칙', /sys \+= '\\n' \+ \((ctxLang === 'zh' \? \w+ : \w+)\);/,
      'WARMUP_CORRECTION_RULE', 'WARMUP_ZH_CORRECTION_RULE'],
    /* ⚠️ 여기는 «함수 호출» 이라 인자까지 평가하면 `aiText is not defined` 로 죽습니다 —
       호출부를 통째로 표식으로 바꿔 «어느 함수를 고르는가» 만 봅니다. */
    ['대답 보기', /answer_chips: (ctxLang === 'zh' \? \w+\(aiText, ctxDifficulty\) : \w+\(aiText, ctxDifficulty\))/,
      'warmupAnswerChips(aiText, ctxDifficulty)', 'warmupZhAnswerChips(aiText, ctxDifficulty)'],
  ];
  for (const [name, re, en, zh] of cases) {
    const r = pick(re, en, zh);
    check(`전제: ${name} 식을 찾아 평가했다`, r.found && !r.err, r.err || (r.found ? '' : '식을 못 찾음'));
    if (r.found && !r.err) {
      check(`${name} — 중국어면 중국어를 고른다 (뒤바꿈 변이 차단)`, r.zh === 'ZH', 'zh→' + r.zh);
      check(`${name} — 영어면 영어를 고른다 (짝)`, r.en === 'EN', 'en→' + r.en);
    }
  }
}

console.log('\n[ ⑭ 🀄 언어를 바꾸면 폴백 목소리도 다시 고르는가 ]');
{
  /* 🔴 `pickVoice()` 는 로드 때와 voiceschanged 에만 돕니다 — 언어 전환을 안 따라옵니다.
     그러면 같은 페이지에서 중국어로 바꾼 학생이 서버 TTS 실패로 폴백할 때
     **한자를 영어 목소리로 읽습니다**(이 코드 자신의 주석이 금지한 상태). */
  const body = (() => {
    const i = HTMLC.indexOf('function setWarmLang(');
    if (i < 0) return '';
    const o = HTMLC.indexOf('{', i);
    let d = 0;
    for (let k = o; k < HTMLC.length; k++) {
      if (HTMLC[k] === '{') d++;
      else if (HTMLC[k] === '}') { d--; if (!d) return HTMLC.slice(o, k + 1); }
    }
    return '';
  })();
  check('전제: setWarmLang 몸통을 잘라 냈다', body.length > 60, 'len=' + body.length);
  check('언어가 바뀌면 _enVoice 를 비우고 다시 고른다',
    /_enVoice\s*=\s*null/.test(body) && /pickVoice\(\)/.test(body),
    '안 하면 이전 언어 목소리가 남아 한자를 영어 발음으로 읽습니다');
  /* 짝 — «바뀔 때만» 해야 한다(매번 비우면 고른 성별·화자 선택이 흔들린다) */
  check('바뀌지 않았으면 건드리지 않는다 (짝)', /if\(changed\)\{[^}]*_enVoice=null/.test(body));
}

console.log('\n[ ⑮ 기록 — 칸을 못 붙여도 세션 기록을 통째로 잃지 않는가 ]');
{
  /* 🔴 ALTER 가 한 번 실패하면 INSERT 가 `no such column` 으로 던지고 바깥 catch 가 삼켜
     **「몇 단계로 쓰는가」·「입을 뗐는가」 분모가 통째로** 사라집니다(화면은 아무 말도 안 함). */
  /* ⚠️ 「그 이름이 있는가」로 묻지 않습니다 — `if (true) {` 로 바꿔도 이름은 남습니다(실측).
     **그 lang INSERT 를 «감싸는 조건» 이 _hasLangCol 인가** 로 묻고, lang 없는 갈래도 짝으로 봅니다. */
  check('lang 을 적는 INSERT 가 «칸이 있을 때만» 돈다',
    /if \([^)]*_hasLangCol[^)]*\)\s*\{[\s\S]{0,500}?lang, Date\.now\(\)/.test(LOG),
    'if (true) 로 바꾸면 칸이 없는 환경에서 세션 기록이 통째로 사라집니다');
  check('칸이 없으면 lang 없이라도 적는다 (짝)',
    /\(session_id, user_id, difficulty, age_group, textbook, level, started_at\)/.test(LOG),
    '언어 한 칸 때문에 기록 전체를 잃지 않습니다');
  check('그 실패를 조용히 넘기지 않는다', /lang 칸 추가 실패[\s\S]{0,80}console\.error|console\.error[\s\S]{0,120}lang 칸 추가 실패/.test(LOG));
}

console.log('\n[ ⑯ 중국어 교사 «메이» — 중국어는 선택 없이 메이 한 사람 ]');
{
  /* 🔴 왜 이 검사가 필요한가
     중국어 TTS 는 화자를 안 가린다(구글 만다린 한 목소리). 그래서 중국어에서 친구를
     여럿 늘어놓으면 「골랐는데 목소리가 같다」는 «화면이 하는 거짓말» 이 된다.
     📜 2026-09-14 지시 변경 — 처음(같은 날 오전)에는 «중국어에서는 메이 버튼 하나만 보인다»
        였다. 사장님이 화면을 보고 「중국어는 목소리와 얼굴 선택없이 무조건 메이 한 교사만」
        으로 정하셔서, 경계를 «버튼 하나만 보인다» → «고르는 칸 자체가 없다» 로 옮겨 적는다.
        ⛔ 옛 경계(메이 버튼이 보인다)로 되돌리지 마세요 — 그건 검사를 느슨하게 푸는 것이
           아니라 사람이 바꾼 결정을 되돌리는 것입니다.
     ⚠️ 이런 것은 문자열로 못 본다 — 표도 함수도 다 «있고» 틀린 것은 «무슨 답이 나오는가»
        뿐이다. 그래서 오려 내 실제로 돌린다. */

  /** 중괄호 짝으로 함수 몸통을 자른다 — «앞 N자» 로 자르면 옆 함수가 딸려 든다. */
  const bodyOf = (src, sig) => {
    const i = src.indexOf(sig);
    if (i < 0) return '';
    const o = src.indexOf('{', i + sig.length - 1);
    if (o < 0) return '';
    let d = 0;
    for (let k = o; k < src.length; k++) {
      if (src[k] === '{') d++;
      else if (src[k] === '}') { d--; if (!d) return src.slice(o + 1, k); }
    }
    return '';
  };

  const modesSrc = HTML.match(/var VOICE_MODES = \{[\s\S]*?\n\};/);
  const fnSrc = HTML.match(/function voiceForLang\(lang, savedEn\)\{[\s\S]*?\n\}/);
  check('전제: VOICE_MODES 와 voiceForLang 을 오려 냈다', !!modesSrc && !!fnSrc,
    'modes=' + !!modesSrc + ' fn=' + !!fnSrc);
  let vf = null, MODES = null;
  if (modesSrc && fnSrc) {
    try {
      const f = new Function(modesSrc[0] + '\n' + fnSrc[0] + '\nreturn { voiceForLang, VOICE_MODES };')();
      vf = f.voiceForLang; MODES = f.VOICE_MODES;
    } catch (e) { check('voiceForLang 을 평가할 수 있다', false, e.message); }
  }
  if (vf && MODES) {
    check('중국어 친구(zh:true)가 표에 있다', Object.keys(MODES).some((k) => MODES[k] && MODES[k].zh),
      '없으면 아래 검사가 전부 뜻을 잃습니다');
    /* 짝 — 영어 친구에 zh 가 붙으면 영어 화면에서 그 사람이 사라진다 */
    check('영어 네 친구에는 zh 표시가 없다 (짝)',
      ['emma', 'jake', 'lily', 'noah'].every((k) => MODES[k] && !MODES[k].zh));
    check('중국어면 메이가 나온다', vf('zh', 'lily') === 'mei');
    check('중국어는 «저장값을 아예 안 본다» — 무엇이 들어와도 메이',
      ['emma', 'jake', 'lily', 'noah', 'mix', 'mei', undefined, null, '', 'zzz']
        .every((v) => vf('zh', v) === 'mei'),
      '하나라도 다른 답이 나오면 「선택 없이 메이」가 깨집니다');
    /* 🔴 짝이 없으면 «언제나 메이» 도 통과한다 — 영어가 그대로인지 반드시 함께 본다 */
    check('영어면 «영어에서 마지막에 고른 사람» 이 그대로다 (짝)', vf('en', 'lily') === 'lily');
    check('영어면 「번갈아」도 그대로다 (짝)', vf('en', 'mix') === 'mix');
    check('영어 자리에 중국어 사람이 저장돼 있으면 Emma 로 떨어진다', vf('en', 'mei') === 'emma');
  }

  /* «지금 누가 말하나» — 옛 저장값이 무엇이든 중국어면 메이여야 한다.
     ⚠️ 이 함수가 «중국어 = 메이» 의 정본이다. 언어를 어느 경로로 켜든(버튼·서버 힌트·옛 값)
        여기서 한 번에 막히므로, 여기가 뚫리면 나머지 검사는 전부 뜻을 잃는다. */
  const personSrc = HTML.match(/function _voicePerson\(\)\{[\s\S]*?\n\}/);
  check('전제: _voicePerson 을 오려 냈다', !!personSrc);
  if (personSrc) {
    const who = (zh, mode, idx) => {
      try {
        return new Function('isZh', '_voiceMode', 'VOICE_PEOPLE', '_mixIdx',
          personSrc[0] + '\nreturn _voicePerson();')(
          () => zh, mode, ['emma', 'jake', 'lily', 'noah'], idx || 0);
      } catch (e) { return 'ERR:' + e.message; }
    };
    check('중국어에서는 옛 저장값이 무엇이든 메이가 말한다',
      ['emma', 'jake', 'lily', 'noah', 'mix', 'mei'].every((m) => who(true, m) === 'mei'),
      '실제: ' + ['emma', 'jake', 'lily', 'noah', 'mix', 'mei'].map((m) => m + '→' + who(true, m)).join(' '));
    /* 🔴 짝 — 없으면 «언제나 메이» 도 통과한다 */
    check('영어에서는 고른 사람이 그대로 말한다 (짝)', who(false, 'lily') === 'lily');
    check('영어 「번갈아」는 순번이 가리키는 사람이다 (짝)',
      who(false, 'mix', 0) === 'emma' && who(false, 'mix', 2) === 'lily',
      '실제: ' + who(false, 'mix', 0) + ',' + who(false, 'mix', 2));
  }

  /* 화면에서 «감추는가» — 가짜 DOM 으로 실제로 돌린다 */
  const syncSrc = HTML.match(/function syncVoiceBtnsForLang\(\)\{[\s\S]*?\n\}/);
  check('전제: syncVoiceBtnsForLang 을 오려 냈다', !!syncSrc);
  if (syncSrc && MODES) {
    /* ⚠️ try/catch 로 감싼다 — 안 감싸면 «던지는» 변이(없는 DOM 메서드를 부르는 등)가
          깔끔한 FAIL 이 아니라 하니스 크래시가 되어 결과줄조차 안 나온다(실측). */
    const run = (zh) => {
      const box = { hidden: null }, note = { hidden: null };
      const doc = { getElementById: (id) => (id === 'voiceBtns' ? box : (id === 'voiceZhNote' ? note : null)) };
      let err = null;
      try {
        new Function('document', 'isZh', 'VOICE_MODES', syncSrc[0] + '\nsyncVoiceBtnsForLang();')
          (doc, () => zh, MODES);
      } catch (e2) { err = e2.message; }
      return { box, note, err };
    };
    const z = run(true), e = run(false);
    check('전제: syncVoiceBtnsForLang 이 «던지지 않고» 돌았다', !z.err && !e.err,
      'zh=' + (z.err || '-') + ' en=' + (e.err || '-'));
    check('중국어에서는 «고르는 칸» 이 통째로 감춰진다', z.box.hidden === true,
      '한 사람만 남겨 보여 주면 「고를 수 있는 것」처럼 보입니다');
    check('중국어에서는 «메이 한 분» 안내가 뜬다', z.note.hidden === false,
      '감추면 「왜 못 고르지?」를 학생이 혼자 추측하게 됩니다');
    /* 🔴 짝 — 없으면 «전부 감추기» 도 통과한다 */
    check('영어에서는 고르는 칸이 그대로 보인다 (짝)', e.box.hidden === false,
      '실제 hidden=' + e.box.hidden);
    check('영어에서는 그 안내가 안 뜬다 (짝)', e.note.hidden === true);
  }

  /* 마크업 — 중국어 버튼을 되살리면 «고를 수 있는 것» 으로 돌아간다 */
  check('친구 고르기 칸에 중국어 버튼이 없다',
    !/data-v="mei"/.test(HTMLC),
    '중국어는 칸 자체를 감추므로, 버튼을 두면 영어 화면에서 보이거나 죽은 코드가 됩니다');
  check('영어 다섯 버튼은 그대로다 (짝)',
    ['emma', 'jake', 'lily', 'noah', 'mix'].every((v) => HTMLC.includes('data-v="' + v + '"')));

  /* 배선 — «그 함수를 실제로 부르는가». 호출이 없으면 위 검사가 전부 헛돈다. */
  check('언어를 바꾸면 친구도 그 언어의 사람으로 바꾼다',
    /if\(changed\) setVoiceMode\(voiceForLang\(_warmLang, _savedVoiceEn\)\)/.test(HTMLC),
    '안 부르면 중국어를 골라도 Emma 얼굴이 그대로 남습니다');
  check('부팅도 «지금 언어» 의 사람으로 시작한다',
    /^setVoiceMode\(voiceForLang\(_warmLang, _savedVoiceEn\)\);/m.test(HTMLC));
  /* 🔴 «파일 어딘가에 그 글자가 있는가» 로 물으면 if(false){…} 로 감싸도 통과한다
        (2026-09-14 함정 대조 실측). 그 함수 «몸통 안» 에서 불리는지로 묻는다. */
  const svmBody = bodyOf(HTMLC, 'function setVoiceMode(m, announce){');
  check('전제: setVoiceMode 몸통을 잘라 냈다', svmBody.length > 100, 'len=' + svmBody.length);
  check('setVoiceMode 가 «자기 몸통 안에서» 버튼 감추기를 부른다',
    /(^|[^.\w])syncVoiceBtnsForLang\(\);/m.test(svmBody),
    '안 부르면 언어를 바꿔도 영어 버튼이 그대로 남습니다');
  check('setVoiceMode 가 «자기 몸통 안에서» 얼굴을 입힌다',
    /(^|[^.\w])applyVoiceFace\(\);/m.test(svmBody));

  /* 🔴 서버 힌트로 중국어가 켜지는 «주 경로» — 여기를 빼면 첫 화면이 영어 친구 그대로다
        (2026-09-14 함정 대조가 실측으로 잡은 자리). */
  const probeBody = bodyOf(HTMLC, 'function probeSuggestLang(){');
  check('전제: probeSuggestLang 몸통을 잘라 냈다', probeBody.length > 100, 'len=' + probeBody.length);
  check('서버가 «중국어 학생» 이라고 알려 줘도 화면·얼굴이 함께 맞춰진다',
    /(^|[^.\w])syncVoiceBtnsForLang\(\);/m.test(probeBody) && /(^|[^.\w])applyVoiceFace\(\);/m.test(probeBody),
    'renderSetup 은 친구 칸을 안 그립니다 — 그 칸은 정적 HTML 이라 영어 그대로 남습니다');
  check('그 경로는 «저장하지 않는다» (짝)',
    !/setVoiceMode\(/.test(probeBody) && !/localStorage\.setItem/.test(probeBody),
    '저장하면 서버 힌트가 「학생이 고른 것」으로 굳습니다');

  /* 저장 — 중국어는 «고른 것» 이 없으므로 적을 것도 없다 */
  check('중국어용 저장 칸을 두지 않는다',
    !/mangoi_warmup_voice_zh/.test(HTMLC) && !/_savedVoiceZh/.test(HTMLC),
    '적으면 「학생이 고른 것」으로 굳어 나중에 기본을 되돌릴 수 없습니다');
  check('영어에서 고른 사람은 그대로 기억한다 (짝)',
    /!VOICE_MODES\[m\]\.zh\)\{[\s\S]{0,160}mangoi_warmup_voice/.test(HTMLC),
    '안 적으면 다음에 들어올 때 Emma 로 초기화됩니다');

  /* 🀄 스크린샷 제보(2026-09-14) — 중국어 수업에 영어 단어(fast·moon·big)가 떴다 */
  check('게임 취약 단어를 «그 언어의 기록» 으로 묻는다',
    /games\/recommend[\s\S]{0,200}&lang=' \+ rlang/.test(HTMLC) && !/games\/recommend[^']*&lang=en/.test(HTMLC),
    'lang=en 하드코딩이면 중국어 수업에 영어 단어가 올라옵니다');
  check('기다리는 사이 언어가 바뀌면 그리지 않는다',
    /rlang !== \(isZh\(\) \? 'zh' : 'en'\)\) return;/.test(HTMLC));
  check('영어 전용 소재(연습 포인트)는 중국어에서 안 그린다',
    /if\(!isZh\(\) && WCTX\.weak && WCTX\.weak\.length\)/.test(HTMLC),
    'getWeakSentences 는 isEnglishText 로 걸러 영어 문장만 돌려줍니다');
}

console.log('\n════════════════════════════════════════════════════════════');
console.log(`  🀄 중국어 대화 하니스: ✅ ${pass} 통과 / ❌ ${fail} 실패`);
console.log('════════════════════════════════════════════════════════════');
if (fail) process.exit(1);
