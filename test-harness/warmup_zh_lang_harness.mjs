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

console.log('\n[ ⑯ 중국어 선생님 — 그 언어의 사람만 말한다 ]');
{
  /* 🔴 왜 이 검사가 필요한가
     중국어 TTS 는 화자를 안 가린다(구글 만다린 한 목소리). 그래서 중국어에서 친구를
     여럿 늘어놓으면 「골랐는데 목소리가 같다」는 «화면이 하는 거짓말» 이 된다.
     📜 2026-09-14 지시가 하루에 세 번 바뀐 자리다 — «메이 버튼 하나만 보인다»(오전) →
        「중국어는 목소리와 얼굴 선택없이 무조건 메이 한 교사만」(낮, 고르는 칸 삭제) →
        「**남자 교사도 한명더 추가해줘. 남자목소리로**」(오후, 룽 추가 + 고르는 칸 복원).
        그래서 경계를 «언제나 메이» → **«그 언어의 선생님만 말한다»** 로 옮겨 적는다.
        ⛔ 「언제나 메이」로 되돌리지 마세요 — 그건 검사를 조이는 것이 아니라 룽을 지우는 것입니다.
        ⛔ 반대로 «아무나 말해도 된다» 로 느슨하게 풀지도 마세요 — 중국어에서 영어 친구가
           나오면 서버가 영어 프롬프트를 돌려 「중국어 수업인데 영어로 답하는」 상태가 됩니다.
     🔴 목소리의 한계는 그대로다 — 서버 zh 갈래는 구글 만다린 «한 목소리»(여성)이고 speaker 를
        안 본다. 룽의 «남자 목소리» 는 기기 음성으로만 나오고, 없으면 서버로 떨어지며 화면이
        그 사실을 말한다. 아래 «목소리 갈래» 검사가 그 셋을 짝으로 못 박는다.
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
  const fnSrc = HTML.match(/function voiceForLang\(lang, savedEn, savedZh\)\{[\s\S]*?\n\}/);
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
    const zhKeys = Object.keys(MODES).filter((k) => MODES[k] && MODES[k].zh);
    check('중국어 선생님이 둘 이상이다 (고를 수 있다)', zhKeys.length >= 2,
      '실제: ' + zhKeys.join(', ') + ' — 한 명뿐이면 아래 «고르는 칸» 검사가 뜻을 잃습니다');
    check('중국어 저장값이 중국어 선생님이면 그대로다',
      zhKeys.every((k) => vf('zh', 'lily', k) === k),
      '실제: ' + zhKeys.map((k) => k + '→' + vf('zh', 'lily', k)).join(' '));
    check('중국어 저장값이 «중국어 사람이 아니면» 메이로 떨어진다',
      ['emma', 'jake', 'lily', 'noah', 'mix', undefined, null, '', 'zzz', '__proto__']
        .every((v) => vf('zh', 'lily', v) === 'mei'),
      '영어 친구가 새어 나오면 서버가 영어 프롬프트를 돌립니다');
    /* 🔴 짝이 없으면 «언제나 메이» 도 통과한다 — 영어가 그대로인지 반드시 함께 본다 */
    check('영어면 «영어에서 마지막에 고른 사람» 이 그대로다 (짝)', vf('en', 'lily', 'long') === 'lily');
    check('영어면 「번갈아」도 그대로다 (짝)', vf('en', 'mix', 'long') === 'mix');
    check('영어 자리에 중국어 사람이 저장돼 있으면 Emma 로 떨어진다', vf('en', 'mei', 'mei') === 'emma');
  }

  /* «지금 누가 말하나» — 중국어면 «중국어 선생님» 이어야 한다.
     ⚠️ 이 함수가 정본이다. 언어를 어느 경로로 켜든(버튼·서버 힌트·옛 값) 여기서 한 번에
        걸러지므로, 여기가 뚫리면 나머지 검사는 전부 뜻을 잃는다. */
  const personSrc = HTML.match(/function _voicePerson\(\)\{[\s\S]*?\n\}/);
  check('전제: _voicePerson 을 오려 냈다', !!personSrc);
  if (personSrc) {
    const who = (zh, mode, idx) => {
      try {
        return new Function('isZh', '_voiceMode', 'VOICE_PEOPLE', '_mixIdx', 'VOICE_MODES',
          personSrc[0] + '\nreturn _voicePerson();')(
          () => zh, mode, ['emma', 'jake', 'lily', 'noah'], idx || 0, MODES);
      } catch (e) { return 'ERR:' + e.message; }
    };
    check('중국어에서 «영어 친구·번갈아» 가 저장돼 있으면 메이가 말한다',
      ['emma', 'jake', 'lily', 'noah', 'mix'].every((m) => who(true, m) === 'mei'),
      '실제: ' + ['emma', 'jake', 'lily', 'noah', 'mix'].map((m) => m + '→' + who(true, m)).join(' '));
    /* 🔴 짝 — 없으면 «중국어는 언제나 메이»(룽을 지우는 것) 도 통과한다 */
    check('중국어에서 고른 중국어 선생님은 그대로 말한다 (짝)',
      Object.keys(MODES).filter((k) => MODES[k] && MODES[k].zh).every((k) => who(true, k) === k),
      '실제: ' + Object.keys(MODES).filter((k) => MODES[k] && MODES[k].zh).map((k) => k + '→' + who(true, k)).join(' '));
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
      const box = { hidden: null }, zbox = { hidden: null }, note = { hidden: null };
      const doc = { getElementById: (id) => (id === 'voiceBtns' ? box
        : (id === 'voiceBtnsZh' ? zbox : (id === 'voiceZhNote' ? note : null))) };
      let err = null;
      try {
        new Function('document', 'isZh', 'VOICE_MODES', syncSrc[0] + '\nsyncVoiceBtnsForLang();')
          (doc, () => zh, MODES);
      } catch (e2) { err = e2.message; }
      return { box, zbox, note, err };
    };
    const z = run(true), e = run(false);
    check('전제: syncVoiceBtnsForLang 이 «던지지 않고» 돌았다', !z.err && !e.err,
      'zh=' + (z.err || '-') + ' en=' + (e.err || '-'));
    check('중국어에서는 «영어 친구» 칸이 감춰진다', z.box.hidden === true,
      '보이면 중국어 수업에서 Emma 를 고를 수 있게 됩니다');
    check('중국어에서는 «중국어 선생님» 칸이 보인다', z.zbox.hidden === false,
      '감추면 룽을 고를 방법이 없습니다 — 2026-09-14 오후 지시가 그대로 무너집니다');
    check('중국어에서는 목소리 한계 안내가 뜬다', z.note.hidden === false,
      '감추면 「남자를 골랐는데 왜 여자 목소리지?」를 학생이 혼자 추측하게 됩니다');
    /* 🔴 짝 — 없으면 «전부 감추기»·«전부 보이기» 도 통과한다 */
    check('영어에서는 영어 친구 칸이 그대로 보인다 (짝)', e.box.hidden === false,
      '실제 hidden=' + e.box.hidden);
    check('영어에서는 중국어 선생님 칸이 안 보인다 (짝)', e.zbox.hidden === true,
      '실제 hidden=' + e.zbox.hidden);
    check('영어에서는 그 안내가 안 뜬다 (짝)', e.note.hidden === true);
  }

  /* 마크업 — 두 묶음이 «서로 다른 상자» 여야 한다.
     📜 2026-09-14 낮에는 「중국어 버튼이 없다」가 옳은 답이었습니다(고르는 칸 자체를 없앴을 때).
        같은 날 오후 「남자 교사도 한명더」로 다시 고르게 되어 경계를 뒤집어 옮겨 적습니다. */
  const zhBoxHtml = (HTMLC.match(/<div class="voice-btns" id="voiceBtnsZh"[\s\S]*?<\/div>/) || [''])[0];
  check('전제: 중국어 선생님 상자를 잘라 냈다', zhBoxHtml.length > 50, 'len=' + zhBoxHtml.length);
  if (MODES) {
    const zhKeys = Object.keys(MODES).filter((k) => MODES[k] && MODES[k].zh);
    check('중국어 상자에 «표의 중국어 선생님» 이 전부 있다',
      zhKeys.every((k) => zhBoxHtml.includes('data-v="' + k + '"')),
      '실제: ' + zhKeys.map((k) => k + (zhBoxHtml.includes('data-v="' + k + '"') ? '✓' : '✗')).join(' '));
    /* 🔴 짝 — 없으면 «한 상자에 다 넣기» 도 통과한다 */
    check('중국어 상자에 영어 친구가 섞여 있지 않다 (짝)',
      ['emma', 'jake', 'lily', 'noah', 'mix'].every((v) => !zhBoxHtml.includes('data-v="' + v + '"')),
      '섞이면 중국어 수업에서 Emma 를 고를 수 있게 됩니다');
    const enBoxHtml = (HTMLC.match(/<div class="voice-btns" id="voiceBtns"[\s\S]*?<\/div>/) || [''])[0];
    check('영어 상자에 중국어 선생님이 섞여 있지 않다 (짝)',
      zhKeys.every((k) => !enBoxHtml.includes('data-v="' + k + '"')));
  }
  check('영어 다섯 버튼은 그대로다 (짝)',
    ['emma', 'jake', 'lily', 'noah', 'mix'].every((v) => HTMLC.includes('data-v="' + v + '"')));

  /* 배선 — «그 함수를 실제로 부르는가». 호출이 없으면 위 검사가 전부 헛돈다. */
  check('언어를 바꾸면 친구도 그 언어의 사람으로 바꾼다',
    /if\(changed\) applyVoiceForLang\(\);/.test(HTMLC),
    '안 부르면 중국어를 골라도 Emma 얼굴이 그대로 남습니다');
  check('부팅도 «지금 언어» 의 사람으로 시작한다',
    /^applyVoiceForLang\(\);/m.test(HTMLC));
  /* 🔴 «저장하지 않고 맞추기만» — 부팅·언어변경·서버힌트 셋이 이 함수 하나를 쓴다.
     📜 2026-09-14 오후 함정 대조가 잡은 자리: 서버 힌트 경로가 _voiceMode 를 안 건드려
        저장해 둔 룽이 무시되고 늘 메이가 나왔고, 두 버튼 중 어느 쪽도 «고름» 표시가 없었다.
     ⛔ 이 셋을 setVoiceMode 로 되돌리지 마세요 — 아무도 안 골랐는데 기본값이 저장돼 굳습니다. */
  const avlSrc = HTML.match(/function applyVoiceForLang\(\)\{[\s\S]*?\n\}/);
  check('전제: applyVoiceForLang 을 오려 냈다', !!avlSrc);
  if (avlSrc && fnSrc && MODES) {
    const pick = (lang, en, zh) => {
      try {
        return new Function('_warmLang', '_savedVoiceEn', '_savedVoiceZh', '_voiceMode', '_mixIdx',
          'VOICE_MODES', 'document', 'isZh', 'applyVoiceFace', 'syncVoiceBtnsForLang', 'pickVoice', '_enVoice',
          fnSrc[0] + '\n' + avlSrc[0] + '\napplyVoiceForLang();\nreturn _voiceMode;')(
          lang, en, zh, 'zzz-시작값', 0, MODES, { querySelectorAll: () => [] },
          () => lang === 'zh', () => {}, () => {}, () => {}, null);
      } catch (e) { return 'ERR:' + e.message; }
    };
    check('서버 힌트로 중국어가 켜져도 «저장해 둔 중국어 선생님» 을 그대로 쓴다',
      Object.keys(MODES).filter((k) => MODES[k] && MODES[k].zh).every((k) => pick('zh', 'lily', k) === k),
      '실제: ' + Object.keys(MODES).filter((k) => MODES[k] && MODES[k].zh)
        .map((k) => k + '→' + pick('zh', 'lily', k)).join(' '));
    /* 🔴 짝 — 없으면 «언제나 저장값» 도 통과한다(영어에서 중국어 선생님이 나옵니다) */
    check('영어로 돌아오면 영어에서 고른 사람이다 (짝)', pick('en', 'lily', 'long') === 'lily',
      '실제: ' + pick('en', 'lily', 'long'));
    check('그 함수는 «저장하지 않는다» (짝)', !/localStorage\.setItem/.test(avlSrc[0]),
      '저장하면 「아직 안 정함」이 「학생이 고른 것」으로 굳습니다');
    check('그 함수가 화면·얼굴을 함께 맞춘다',
      /(^|[^.\w])syncVoiceBtnsForLang\(\);/m.test(avlSrc[0])
        && /(^|[^.\w])applyVoiceFace\(\);/m.test(avlSrc[0]));
    check('그 함수가 «고름» 표시(.on)도 갈아 끼운다', /classList\.toggle\('on'/.test(avlSrc[0]),
      '안 하면 두 버튼 중 어느 쪽도 고른 표시가 없어 「아무도 안 골랐다」로 보입니다');
  }
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
    /(^|[^.\w])applyVoiceForLang\(\);/m.test(probeBody),
    'renderSetup 은 친구 칸을 안 그립니다 — 그 칸은 정적 HTML 이라 영어 그대로 남습니다');
  check('그 경로는 «저장하지 않는다» (짝)',
    !/setVoiceMode\(/.test(probeBody) && !/localStorage\.setItem/.test(probeBody),
    '저장하면 서버 힌트가 「학생이 고른 것」으로 굳습니다');

  /* 저장 — «언어별로» 갈려 있어야 한다.
     📜 2026-09-14 낮에는 「중국어 저장 칸을 두지 않는다」가 옳았습니다(고를 수 없었으니까).
        오후에 고를 수 있게 되어 경계를 «두 칸이 서로를 안 지운다» 로 옮겨 적습니다.
     ⛔ 한 칸으로 합치지 마세요 — 중국어에서 룽을 고르면 영어의 Lily 선택이 사라집니다. */
  check('중국어 선택을 기억하는 칸이 있다', /mangoi_warmup_voice_zh/.test(HTMLC),
    '없으면 룽을 골라도 다음에 들어올 때 메이로 되돌아갑니다');
  check('영어 칸과 중국어 칸이 «다른 키» 다',
    /localStorage\.setItem\('mangoi_warmup_voice',/.test(HTMLC)
      && /localStorage\.setItem\('mangoi_warmup_voice_zh',/.test(HTMLC),
    '한 키로 합치면 언어를 오갈 때 서로를 지웁니다');
  check('중국어 사람은 중국어 칸에, 영어 사람은 영어 칸에 적는다',
    /if\(VOICE_MODES\[m\]\.zh\)\{[\s\S]{0,140}mangoi_warmup_voice_zh[\s\S]{0,160}mangoi_warmup_voice'/.test(HTMLC),
    '갈라 적지 않으면 한쪽이 다른 쪽을 덮어씁니다');

  /* ══ 🔊 목소리 갈래 — 중국어 «남자» 를 어떻게 내는가 (2026-09-14) ══
     [잰 것] src/api-games.ts 의 /api/voice/tts 는 zh 를 만나면 gtts(text,'zh-CN') 로만 간다.
             그 함수에 화자 인자가 없다 = 구글 만다린 «한 목소리»(여성)뿐이고 speaker 를 안 본다.
     📜 오후 판은 여기서 멈춰 「ⓑ 기기에 남자 음성이 없으면 그 사실을 말한다」를 못 박았다.
        그런데 사장님 PC 에 그 음성이 없어 실제로 안내만 뜨고 «여자 목소리» 가 났고,
        저녁에 「너가 알아서 중국어 말하는 남자목소리 넣어줘, 아무나」로 지시가 바뀌었다.
        ⟹ 그 검사는 «헛돈 것» 이 아니라 «지키던 전제를 사람이 바꾼 것» 이라, 느슨하게 푸는 대신
           새 경계로 옮겨 적는다(CLAUDE.md 「기본값을 바꾸면 그 값을 읽는 검사를 전부 다시」).
     ⟹ 지금 보장은 넷이고 짝으로 묻는다:
        ⓐ 기기에 진짜 남자 음성이 있으면 그것을 «먼저» 쓴다(가장 자연스러움)
        ⓑ 없으면 서버 목소리를 _zhDeepen 으로 «굵게» 만들어 읽는다 → 어느 기기에서나 남자
        ⓒ 굵게 만든 판은 길이가 1/P 로 늘어나므로 재생 배속을 P 로 나눠 되돌린다
        ⓓ 메이(여자)·영어는 예전 그대로 손대지 않는다
     ⛔ ⓓ 가 없으면 «중국어 전부» 로 넓힌 변이가 통과한다 — 메이 소리가 함께 굵어진다.
     ⛔ ⓒ 가 없으면 «느리고 낮은» 소리가 된다(고치려던 것의 절반). */
  {
    const vrSrc = HTML.match(/function _zhMaleVoiceReady\(\)\{[\s\S]*?\n\}/);
    const zmSrc = HTML.match(/var ZH_MALE_RE\s+=\s+\/.*?\/i;/);
    check('전제: _zhMaleVoiceReady 와 이름 목록을 오려 냈다', !!vrSrc && !!zmSrc,
      'fn=' + !!vrSrc + ' re=' + !!zmSrc);
    if (vrSrc && zmSrc) {
      const ready = (voice, speechOn) => {
        try {
          return new Function('window', '_speechOn', '_enVoice', 'pickVoice',
            zmSrc[0] + '\n' + vrSrc[0] + '\nreturn _zhMaleVoiceReady();')(
            { speechSynthesis: {} }, speechOn !== false, voice, () => {});
        } catch (e) { return 'ERR:' + e.message; }
      };
      check('중국어 «남자» 음성이 있으면 기기 목소리를 쓴다',
        ready({ lang: 'zh-CN', name: 'Microsoft Kangkang - Chinese (Simplified, PRC)' }) === true
          && ready({ lang: 'zh-CN', name: 'Microsoft Yunxi Online (Natural)' }) === true,
        '실제: ' + ready({ lang: 'zh-CN', name: 'Microsoft Kangkang - Chinese (Simplified, PRC)' }));
      /* 🔴 짝 — 없으면 «중국어면 무조건 기기 목소리» 도 통과한다 */
      check('중국어 «여자» 음성뿐이면 기기 목소리를 안 쓴다 (짝)',
        ready({ lang: 'zh-CN', name: 'Microsoft Huihui - Chinese (Simplified, PRC)' }) === false
          && ready({ lang: 'zh-CN', name: 'Tingting' }) === false);
      check('성별을 알 수 없는 이름이면 안 쓴다 (안드로이드 구글 음성)',
        ready({ lang: 'zh-CN', name: 'Chinese (China)' }) === false,
        '「중국어 음성이면 남자겠지」로 넓히면 얼굴과 목소리가 어긋납니다');
      check('영어 남자 음성은 이 갈래에 안 걸린다 (짝)',
        ready({ lang: 'en-US', name: 'Microsoft Guy Online (Natural)' }) === false);
      check('음성이 아예 없으면 안 쓴다', ready(null) === false);
      check('소리가 꺼져 있으면 안 쓴다', ready({ lang: 'zh-CN', name: 'Kangkang' }, false) === false);
    }

    /* 배선 — «그 갈래가 speak() 안에서 서버보다 «먼저» 오는가».
       ⛔ 식 모양을 글자 그대로 못 박지 마세요(무해한 정리에 빨간불) — 위치와 구조로 묻습니다. */
    const spBody = bodyOf(HTMLC, 'function speak(text, btn){');
    check('전제: speak 몸통을 잘라 냈다', spBody.length > 300, 'len=' + spBody.length);
    const iReady = spBody.indexOf('_zhMaleVoiceReady()');
    const iTts = spBody.indexOf('_ttsSpeak(');
    check('speak 이 그 판정을 실제로 부른다', iReady >= 0);
    check('그 갈래가 «서버 TTS 보다 앞» 이다', iReady >= 0 && iTts >= 0 && iReady < iTts,
      'ready=' + iReady + ' tts=' + iTts + ' — 뒤에 있으면 서버가 먼저 읽어 버립니다');
    /* 🔴 «캐시 단축» 보다도 앞이어야 한다 — 뒤로 옮기면 한 번 캐시된 문장은
       영영 기기 목소리를 안 씁니다(2026-09-14 함정 대조가 그 변이를 실제로 통과시켰습니다). */
    const iCache = spBody.indexOf('_ttsCache[key]');
    check('그 갈래가 «캐시 단축» 보다도 앞이다',
      iReady >= 0 && iCache >= 0 && iReady < iCache,
      'ready=' + iReady + ' cache=' + iCache);
    check('그 갈래가 기기 목소리로 읽고 «거기서 끝낸다»',
      /_zhMaleVoiceReady\(\)[\s\S]{0,120}_synthSpeak\([\s\S]{0,60}return;/.test(spBody),
      'return 이 없으면 기기 목소리와 서버 목소리가 «겹쳐» 재생됩니다');
    /* 📜 옛 검사: 「기기에 남자 음성이 없으면 그 사실을 한 번 말한다」(_zhMaleToldOnce).
       2026-09-14 저녁 지시로 «항상» 남자 목소리가 나므로 그 안내는 거짓말이 되었다 — 새 경계로 옮김. */
    /* 🚤 이 부정 검사를 «파일 전체» 에 돌리면 화면 카피(「메이는 여자 목소리…」)까지 잡아
       뜻이 같은 무해한 재배열에 거짓 FAIL 이 납니다(함정 대조 실측). 그래서 둘로 좁힙니다 —
       ⓐ 옛 플래그 이름이 사라졌는가(그 안내를 만들던 코드) ⓑ speak 안에서 안 말하는가. */
    check('「기기에 없어서 여자 목소리」 안내를 되살리지 않았다',
      !/_zhMaleToldOnce/.test(HTMLC) && !/기기에는 중국어 남자 목소리가 없어서/.test(HTMLC),
      '사유가 다릅니다 — 지금은 «굵게 만들지 못함» 이지 «기기에 음성이 없음» 이 아닙니다');
    /* 🔴 짝 — 없으면 «중국어 전체» 로 넓힌 변이가 통과한다 */
    check('그 갈래는 «남자일 때만» 탄다 (짝)',
      /isZh\(\)\s*&&\s*_voiceGender\(\)\s*===\s*'male'/.test(spBody),
      '중국어 전체로 넓히면 메이(여자)까지 기기 목소리가 되어 소리가 나빠집니다');

    /* 음높이 — «젊고 굵은» (2026-09-14 사장님). 기기 목소리에만 걸린다. */
    const pitSrc = HTMLC.match(/var _pit = ([^;]+);/);
    check('전제: 음높이 식을 오려 냈다', !!pitSrc);
    if (pitSrc) {
      const pit = (zh, g) => {
        try { return new Function('isZh', '_voiceGender', 'return ' + pitSrc[1])(() => zh, () => g); }
        catch (e) { return 'ERR:' + e.message; }
      };
      check('중국어 남자는 음높이를 낮춘다 (굵은 목소리)', pit(true, 'male') < 1,
        '실제: ' + pit(true, 'male'));
      check('너무 낮추지는 않는다', pit(true, 'male') >= 0.7, '실제: ' + pit(true, 'male'));
      /* 🔴 짝 — 없으면 «전부 낮추기» 도 통과한다(영어 폴백 목소리가 함께 바뀝니다) */
      check('영어와 중국어 여자는 예전 값 그대로다 (짝)',
        pit(false, 'male') === 1.02 && pit(true, 'female') === 1.02,
        '실제 en-male=' + pit(false, 'male') + ' zh-female=' + pit(true, 'female'));
    }

    /* ── 💪 서버 목소리를 «굵게» 만드는 길 (2026-09-14 저녁) ──
       기기에 중국어 남자 음성이 없는 사람(= 대부분)에게 실제로 닿는 경로다. */
    const pitchDecl = HTMLC.match(/var ZH_MALE_PITCH = ([0-9.]+);/);
    /* 🚤 이 함수는 «한 줄» 이라 정규식 `[\s\S]*?\}` 로 자르면 try 블록의 첫 `}` 에서
       끊겨 「Missing catch or finally」로 죽는다(실제로 밟았습니다 — CLAUDE.md 「중괄호 짝으로」). */
    const wantBody = bodyOf(HTMLC, 'function _zhMaleWanted(){');
    const wantSrc = wantBody ? ['function _zhMaleWanted(){' + wantBody + '}'] : null;
    const rateExpr = HTMLC.match(/_ttsAudio\.playbackRate=([^;]+);/);
    check('전제: 음높이 상수·판정·재생배속 식을 오려 냈다',
      !!pitchDecl && !!wantSrc && !!rateExpr,
      'P=' + !!pitchDecl + ' want=' + !!wantSrc + ' rate=' + !!rateExpr);

    if (pitchDecl) {
      const P = Number(pitchDecl[1]);
      check('음높이를 실제로 내린다 (P < 1)', P < 1, '실제 P=' + P);
      /* 🔴 짝 — 없으면 «0.2» 같은 괴물 목소리도 통과한다.
         그리고 P 가 작을수록 아래 S/P 보정 배속이 커져 time-stretch 왜곡이 함께 커진다. */
      check('너무 낮추지는 않는다 (P >= 0.7)', P >= 0.7, '실제 P=' + P);
    }

    /* 🀄 견본 화면(/zh-voice-sample.html)이 «지금 쓰는 값» 을 사실대로 말하는가.
       그 화면은 사장님이 A~D 를 직접 듣고 고르시라고 만든 것이라, 정본이 바뀌면
       ★ 표시가 «지금 수업에서 나는 소리» 가 아닌 것을 가리키게 된다 —
       CLAUDE.md 「문서에 «고쳤다» 고 적혀 있는데 같은 사고가 또 남」 그대로다.
       ⚠️ 그 화면은 고르신 값을 넣고 나면 지워도 되는 견본이다 — 없으면 건너뛴다
          (있는데 어긋난 것만 잡는다. «없다» 를 FAIL 로 만들면 지울 수가 없어진다). */
    let sample = null;
    try { sample = read('cloudflare-deploy/public/zh-voice-sample.html'); } catch { sample = null; }
    if (sample && pitchDecl) {
      const P = Number(pitchDecl[1]);
      const now = sample.match(/var NOW_PITCH = ([0-9.]+);/);
      check('견본 화면이 말하는 «지금 쓰는 값» 이 정본과 같다',
        !!now && Number(now[1]) === P,
        '견본=' + (now ? now[1] : '없음') + ' / 정본=' + P);
      /* 🔴 짝 — 없으면 «★ 만 맞고 그 굵기를 들어 볼 수는 없는» 화면도 통과한다 */
      const list = sample.match(/var LIST = \[([\s\S]*?)\n\];/);
      const pitches = list ? [...list[1].matchAll(/pitch:\s*([0-9.]+)/g)].map((m) => Number(m[1])) : [];
      check('견본 목록에 그 값을 실제로 들어 볼 수 있는 칸이 있다 (짝)',
        pitches.some((x) => x === P), '목록=' + JSON.stringify(pitches) + ' 정본=' + P);
    }

    if (wantSrc) {
      const wanted = (zh, g) => {
        try {
          return new Function('isZh', '_voiceGender',
            wantSrc[0] + '\nreturn _zhMaleWanted();')(() => zh, () => g);
        } catch (e) { return 'ERR:' + e.message; }
      };
      check('중국어 «남자» 를 골랐을 때만 굵게 만든다',
        wanted(true, 'male') === true, '실제: ' + wanted(true, 'male'));
      /* 🔴 짝 — 없으면 «중국어 전부» 나 «전부» 굵게 만드는 변이가 통과한다 */
      check('메이(중국어 여자)와 영어는 손대지 않는다 (짝)',
        wanted(true, 'female') === false && wanted(false, 'male') === false,
        '실제 zh-female=' + wanted(true, 'female') + ' en-male=' + wanted(false, 'male'));
    }

    if (rateExpr && pitchDecl) {
      const P = Number(pitchDecl[1]);
      const rate = (lv, deep) => {
        try {
          return new Function('AUDIO_RATE', '_rateLevel', 'ZH_MALE_PITCH', 'deep',
            'return ' + rateExpr[1])({ 2: 0.65, 4: 1.0 }, lv, P, deep);
        } catch (e) { return 'ERR:' + e.message; }
      };
      /* ⓒ 굵게 만든 판은 길이가 1/P 로 늘어나 있다 — 배속을 P 로 나눠야 «원래 길이» 가 된다.
         ⛔ 이 나눗셈을 빼면 사장님이 듣는 소리가 «느리고 낮은» 것이 된다(절반만 고친 상태). */
      check('굵게 만든 판은 배속을 P 로 나눠 길이를 되돌린다',
        Math.abs(rate(2, true) - 0.65 / P) < 1e-9,
        '실제: ' + rate(2, true) + ' / 기대: ' + (0.65 / P));
      /* 🔴 짝 — 없으면 «항상 나누기» 도 통과한다(영어·메이가 빨라진다) */
      check('굵게 만들지 않은 판은 예전 배속 그대로다 (짝)',
        rate(2, false) === 0.65 && rate(4, false) === 1.0,
        '실제 lv2=' + rate(2, false) + ' lv4=' + rate(4, false));
    }

    /* 🔴 이 화면은 들어올 때 항상 2단계(0.65)에서 시작한다 — preservesPitch 를 false 로
       되돌리면 0.65×P = 0.5 가 되어 «귀신 목소리» 가 된다(오후에 그렇게 짜려다 표를 보고 멈췄다). */
    check('재생은 «음높이 유지» 로 한다 (preservesPitch=true)',
      /preservesPitch=true/.test(HTMLC) && !/preservesPitch\s*=\s*false/.test(HTMLC),
      'false 로 두면 속도 슬라이더가 그대로 음높이 슬라이더가 됩니다');

    /* _zhDeepen 의 두 단계가 «같은 P» 를 써야 길이 계산이 맞는다 */
    const deepBody = bodyOf(HTMLC, 'function _zhDeepen(u){');
    check('전제: _zhDeepen 몸통을 잘라 냈다', deepBody.length > 200, 'len=' + deepBody.length);
    check('굽는 두 값이 같은 음높이를 쓴다',
      /playbackRate\.value = P/.test(deepBody) && /buf\.length \/ P/.test(deepBody),
      '한쪽만 P 면 길이가 어긋나 뒷부분이 잘리거나 무음이 붙습니다');
    check('굽기가 실패하면 원본 그대로 읽는다',
      /_zhDeepen\([\s\S]{0,200}play0\(u, false\)/.test(HTMLC),
      '소리가 아예 안 나는 것이 최악입니다');
    /* 🔴 ── 배선 — «그 판정을 실제로 부르고 그 결과로 굽는가» ──
       ⛔ 「판정 함수가 옳은가」만 보면 **아무것도 안 지켜집니다.**
          2026-09-14 함정 대조 실측: `if(!_zhMaleWanted())` 를 `if(true)` 로 한 글자 바꿔
          굽기를 통째로 끄자 이 하니스가 **126건 전부 초록**이었습니다(룽이 다시 여자 목소리).
          같은 이유로 «성공 분기의 seq 가드만» 지운 변이도 통과했습니다 — 아래 «글자가 있는가»
          검사가 실패 분기에 남은 글자를 보고 넘어갔기 때문입니다.
       ✅ 그래서 play 를 오려 내 **가짜 부품으로 실제로 돌려** «어디로 가는가» 를 답으로 봅니다.
          _speakSeq 를 SEQ() 로 바꿔 넣어 «굽는 사이 번호가 바뀌는» 상황까지 재현합니다. */
    const playBody = bodyOf(HTMLC, 'var play=function(u){');
    check('전제: play 몸통을 잘라 냈다', playBody.length > 50, 'len=' + playBody.length);
    if (playBody) {
      const playSrc = ('var play=function(u){' + playBody + '};').replace(/_speakSeq/g, 'SEQ()');
      const runPlay = async (wantMale, deepOk, bumpSeq) => {
        const log = []; let seq = 0;
        try {
          new Function('_zhMaleWanted', 'SEQ', '_zhDeepen', 'play0', '_zhDeepFailedOnce',
            playSrc + '\nplay("SRC");')(
            () => wantMale,
            () => seq,
            (u) => { if (bumpSeq) seq++; return deepOk ? Promise.resolve('DEEP:' + u) : Promise.reject(new Error('x')); },
            (u, deep) => log.push((deep ? 'deep:' : 'plain:') + u),
            () => log.push('told'));
        } catch (e) { return ['ERR:' + e.message]; }
        await new Promise((r) => setTimeout(r, 0));
        return log;
      };
      const rDeep = await runPlay(true, true, false);
      check('중국어 남자면 «굵게 구운» 소리를 재생한다 (배선)',
        rDeep.length === 1 && rDeep[0] === 'deep:DEEP:SRC', '실제: ' + JSON.stringify(rDeep));
      /* 🔴 짝 — 없으면 «전부 굽기» 도 통과한다(메이·영어 소리가 함께 바뀝니다) */
      const rPlain = await runPlay(false, true, false);
      check('그 밖은 굽지 않고 원본을 재생한다 (짝)',
        rPlain.length === 1 && rPlain[0] === 'plain:SRC', '실제: ' + JSON.stringify(rPlain));
      const rFail = await runPlay(true, false, false);
      check('굽기가 실패하면 원본을 재생하고 «그 사실을 말한다»',
        rFail.indexOf('plain:SRC') >= 0 && rFail.indexOf('told') >= 0,
        '화면은 「룽 선생님은 남자 목소리」라고 약속해 두었습니다: ' + JSON.stringify(rFail));
      /* 굽는 사이 다음 말이 오면 «양쪽 분기 모두» 물러나야 한다 —
         한쪽만 가드하면 그 경로로 옛 문장이 겹쳐 재생됩니다. */
      const rLateOk = await runPlay(true, true, true);
      check('굽는 사이 다음 말이 오면 물러난다 — 성공 분기',
        rLateOk.length === 0, '실제: ' + JSON.stringify(rLateOk));
      const rLateNg = await runPlay(true, false, true);
      check('굽는 사이 다음 말이 오면 물러난다 — 실패 분기 (짝)',
        rLateNg.length === 0, '실제: ' + JSON.stringify(rLateNg));
    }
    /* 🚤 「그 이름이 있는가」로 물으면 «저장하는 줄» 만 남겨도 통과한다(실측으로 밟음).
       물어야 할 것은 «읽어서 그 자리에서 돌아가는가» 다. */
    check('같은 문장을 다시 굽지 않는다 (캐시를 읽고 돌아간다)',
      /_zhDeepCache\[u\]\)\s*return/.test(deepBody) && /_zhDeepPut\(u,/.test(deepBody),
      '발화마다 다시 구우면 느리고 배터리를 씁니다');
    /* 🔴 짝 — 담기는 것이 «비압축 WAV blob» 이라 상한이 없으면 긴 수업에서 계속 쌓인다
       ([어림] 6초 발화 0.35MB × 60발화 = 21MB). 폰에서 위험합니다. */
    const putBody = bodyOf(HTMLC, 'function _zhDeepPut(u, bu){');
    check('굽기 캐시에 개수 상한이 있다 (짝)',
      /ZH_DEEP_MAX/.test(putBody) && /revokeObjectURL/.test(putBody)
        && /delete _zhDeepCache\[/.test(putBody),
      '상한이 없으면 수업이 길수록 메모리가 쌓입니다: len=' + putBody.length);
  }

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
