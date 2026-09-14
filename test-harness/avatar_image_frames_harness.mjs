/* avatar_image_frames_harness.mjs — 아바타 «입모양 이미지 캐릭터» 감시 (2026-08-31)
 *
 * 왜 필요한가
 *   사장님 지시 「아바타를 지금보다 어린 얼굴·목소리로」 로 웜업·AI영어친구의 아바타를
 *   19세 안팎 Emma·Jake 로 바꾸면서, 캐릭터가 «초록 배경 영상» 말고 «입모양 정지 이미지
 *   3장(투명 WebP)» 도 될 수 있게 mango-avatar.js 를 넓혔다(v6).
 *   영상을 버린 이유는 취향이 아니라 사고 이력이다 —
 *     · v5(2026-07-29) 「남자 아바타가 한 번 움직이고 멈춘다」의 뿌리가 «영상 seek» 이었다.
 *       이미지는 seek 이 없어 그 사고 유형이 구조적으로 사라진다.
 *     · 8초 영상 1.3MB 대신 장당 33~46KB(WebP) — 필리핀 회선에서 가볍다.
 *
 * 이 검사가 지키는 것 (문자열 훑기가 아니라 «표를 실제로 읽어» 판정한다)
 *   ① 이미지 캐릭터에는 반드시 «살아 있는» fallback 이 있어야 한다.
 *      그림이 아직 안 올라왔을 때 얼굴 자리가 «빈 카드» 로 남는 것이 제일 나쁘다.
 *      그래서 로드 실패 시 옛 영상 캐릭터로 되돌아간다 — 그 되돌아갈 곳이 실재해야 한다.
 *   ② 투명 그림은 «겹쳐 그리면» 앞 입모양이 유령처럼 남는다 → keyFrame 이 clearRect 로 지워야 한다.
 *   ③ 옛 영상 캐릭터(*_classic)를 지우면 안 된다 — 폴백이자 playClip 클립의 짝이다.
 *   ④ 화면 HTML 의 <video> 안에 <source> 를 되살리면, JS 가 돌기 전에 브라우저가
 *      teacher-avatar.webm 942KB 를 먼저 받기 시작한다(실측 206 요청). 첫 화면 낭비다.
 *   ⑤ mango-avatar.js 를 고쳤으면 그것을 부르는 HTML 의 ?v= 도 같이 올라가야 한다
 *      (immutable 캐시에 옛 파일이 남는 사고 방지 — asset_version_harness 와 같은 취지).
 *
 * ⚠️ 이 검사로는 «그려졌는가» 를 볼 수 없다. 좌표·픽셀은 진짜 브라우저가 필요하다 →
 *    test-harness/manual/avatar-image-frames-browser.mjs (사람이 직접 부른다)
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
let pass = 0, fail = 0;
const statSafe = p => { try { return statSync(p); } catch { return null; } };
const ok = (c, m, extra) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : ''))); };

console.log('■ 아바타 입모양 이미지 캐릭터 (js/mango-avatar.js v6)');

const AV = readFileSync(join(PUB, 'js', 'mango-avatar.js'), 'utf8');

/* ── ① 캐릭터 «표» 를 문자열이 아니라 실제 객체로 읽어 판정한다 ─────────────────
   눈으로 훑으면 「fallback 이 있다」까지만 보이고 «그 이름이 실재하는가» 는 안 보인다.
   실제로 평가해서 표를 손에 쥔 다음 묻는다. */
const src = AV.match(/var CHARACTERS = \{[\s\S]*?\n  \};/);
ok(!!src, 'CHARACTERS 표를 찾았다');
let CH = null;
if (src) {
  try { CH = new Function(src[0].replace(/^var /, 'const ') + ' return CHARACTERS;')(); }
  catch (e) { ok(false, 'CHARACTERS 표를 평가할 수 있다', e.message); }
}

if (CH) {
  const imgChars = Object.keys(CH).filter(k => CH[k].frames);
  const vidChars = Object.keys(CH).filter(k => CH[k].sources);
  ok(imgChars.length >= 2, `이미지 캐릭터가 있다 (${imgChars.join(', ') || '없음'})`);
  ok(['emma', 'jake', 'lily', 'noah'].every(k => CH[k]),
    '네 친구(emma·jake·lily·noah)가 모두 표에 있다',
    '화면은 setCharacter(사람이름) 으로 부른다 — 하나라도 없으면 그 친구만 얼굴이 안 바뀐다');

  for (const k of imgChars) {
    const c = CH[k];
    ok(['closed', 'medium', 'wide'].every(t => typeof c.frames[t] === 'string' && c.frames[t]),
      `${k}: 입모양 3단계(closed·medium·wide)가 모두 있다`,
      '한 단계라도 비면 showTier 가 그 단계에서 조용히 멈춘다');
    ok(c.keyed === false, `${k}: keyed:false — 이미 투명한 그림이라 크로마키를 건너뛴다`,
      '초록 제거 루프를 그냥 돌리면 얼굴의 초록빛 픽셀이 지워진다');
    ok(!!c.fallback && !!CH[c.fallback] && !!(CH[c.fallback].sources),
      `${k}: fallback «${c.fallback}» 이 실재하는 영상 캐릭터다`,
      '그림이 아직 없을 때 되돌아갈 곳이 없으면 얼굴 자리가 빈 카드로 남는다');
    ok(c.fallback !== k, `${k}: fallback 이 자기 자신이 아니다 (무한 되돌기 방지)`);
    ok(c.still === c.frames.closed, `${k}: 정지 얼굴이 «입 다문 장» 과 같다`);

    /* ①-2 «그 파일이 저장소에 실제로 있는가»
       2026-08-31 실사고: 표는 새 얼굴을 가리키는데 그림 파일을 커밋에 안 담아,
       사장님 화면에서 며칠간 조용히 폴백(옛 얼굴)이 돌았다. 에러도 404 표시도 없어
       「목소리는 바뀌었는데 얼굴이 안 바뀌었어」로만 보였다.
       ⚠️ fallback 이 있다고 이 검사를 빼면 안 된다 — fallback 은 «런타임 사고» 대비이고
          이 검사는 «커밋에 파일을 빠뜨리는 것» 을 막는다. 둘은 다른 방어다. */
    for (const t of ['closed', 'medium', 'wide']) {
      const rel = String(c.frames[t] || '').replace(/^\//, '');
      const abs = join(PUB, rel);
      const st = statSafe(abs);
      ok(!!st, `${k}: ${t} 그림 파일이 저장소에 있다 (${rel})`,
        '표만 고치고 그림을 안 넣으면 폴백이 조용히 돌아 «얼굴이 안 바뀐다»');
      if (st) ok(st.size <= 300 * 1024,
        `${k}: ${t} 그림이 300KB 이하다 (${Math.round(st.size / 1024)}KB)`,
        '학생은 한 친구당 3장을 받는다 — 필리핀 회선을 생각해 크게 넣지 말 것');
    }
  }

  /* ③ 성인 얼굴 보존 — 폴백이자 playClip(teacher-say-*) 클립의 짝 */
  ok(vidChars.includes('emma') && vidChars.includes('jake'),
    '성인 얼굴(emma·jake)이 영상 캐릭터로 그대로 남아 있다',
    '⛔ 지우지 말 것 — Lily·Noah 의 폴백이고, playClip 의 립싱크 클립이 Emma 얼굴과 짝이다');
  ok(typeof (CH.emma || {}).poses?.closed === 'number',
    'Emma 의 입모양 타임스탬프(poses)가 남아 있다');
}

/* 옛 이름으로 부르는 코드가 남아 있어도 죽지 않게 */
{
  const al = AV.match(/var CHAR_ALIAS = \{[^}]*\}/);
  ok(!!al && /female\s*:\s*'emma'/.test(al[0]) && /male\s*:\s*'jake'/.test(al[0]),
    "옛 이름('female'|'male')을 풀어 주는 CHAR_ALIAS 가 있다",
    '지우면 옛 호출이 «아무 일도 안 일어남» 이 된다 — 에러도 안 난다');
  ok(/setCharacter: function\(name\)\{\s*\n?\s*name = CHAR_ALIAS\[name\] \|\| name;/.test(AV),
    'setCharacter 가 이름을 먼저 풀어 준다');
}

/* ② 투명 그림 유령 방지 + 키잉 건너뛰기 */
ok(/ctx\.clearRect\(0,0,canvas\.width,canvas\.height\);\s*\n?\s*ctx\.drawImage\(srcEl/.test(AV),
  'keyFrame 이 «지우고 그린다» (투명 그림이 겹쳐 유령으로 남지 않게)',
  '⛔ clearRect 를 빼면 입모양이 바뀔 때마다 앞 장이 뒤에 남는다');
ok(/if \(keyedNow\) for \(var i=0/.test(AV),
  '초록 제거 루프가 keyedNow 일 때만 돈다');
ok(/if \(!keyedNow && !fadeData\) return;/.test(AV),
  '만질 픽셀이 없으면 getImageData 자체를 건너뛴다 (폰에서 제일 비싼 구간)');

/* playClip 은 옛 얼굴 전용 — 이미지 캐릭터 위에 틀면 다른 사람이 나온다 */
ok(/if\(imgFrames\)\{ reject\(new Error\('clip_needs_video_character'\)\); return; \}/.test(AV),
  'playClip 이 이미지 캐릭터에서는 거절한다 (teacher-say-* 는 옛 얼굴과 짝)');

/* seek 이 아니라 «장 갈아 끼우기» 인가 — v5 사고가 되살아나지 않게 */
ok(/imgCur = imN;/.test(AV) && /if\(imgFrames\)\{[\s\S]{0,400}?video\.currentTime/.test(AV) === false,
  '이미지 캐릭터는 showTier 에서 video.currentTime(seek) 을 쓰지 않는다',
  'v5(2026-07-29) 「입이 멈춘다」 사고의 뿌리가 그 seek 이었다');

/* ④⑤ 화면 두 곳 */
const AVV = (AV.length, /mango-avatar\.js\?v=(\d+)/);
for (const f of ['warmup.html', 'ai-friend.html']) {
  const H = readFileSync(join(PUB, f), 'utf8');
  const vid = H.match(/<video id="tavatar-video"[\s\S]*?<\/video>/);
  ok(!!vid, `${f}: 아바타 <video> 요소가 있다`);
  if (vid) {
    ok(!/<source\s/i.test(vid[0]),
      `${f}: <video> 안에 <source> 가 없다 (JS 가 항상 장착하므로 미리 받으면 942KB 낭비)`,
      '⛔ 「비어 있으니 채우자」 하고 되살리지 말 것 — 실측으로 teacher-avatar 206 요청이 생긴다');
  }
  const m = H.match(AVV);
  ok(!!m && Number(m[1]) >= 14,
    `${f}: mango-avatar.js 의 ?v= 가 15 이상이다 (${m ? m[1] : '없음'})`,
    'v6 로 고쳤으므로 옛 파일이 immutable 캐시에 남으면 안 된다');
}

/* ⑥ 「여러 곳이 서로 같은 말을 하는가」 — 이름·얼굴·목소리가 세 파일에 흩어져 있다.
      한쪽만 고치면 «Lily 를 골랐는데 Emma 얼굴/목소리» 가 되고 에러는 안 난다. */
{
  const WU = readFileSync(join(PUB, 'warmup.html'), 'utf8');
  const AF = readFileSync(join(PUB, 'ai-friend.html'), 'utf8');

  // 웜업의 VOICE_MODES 를 실제로 평가해서 사람→(화자, 얼굴) 을 손에 쥔다
  const wuSrc = WU.match(/var VOICE_MODES = \{[\s\S]*?\n\};/);
  let WUV = null;
  if (wuSrc) { try { WUV = new Function(wuSrc[0].replace(/^var /, 'const ') + ' return VOICE_MODES;')(); } catch {} }
  ok(!!WUV, 'warmup.html 의 VOICE_MODES 를 읽을 수 있다');

  const afSrc = AF.match(/const PEOPLE = \{[\s\S]*?\n    \};/);
  let AFP = null;
  if (afSrc) { try { AFP = new Function(afSrc[0] + ' return PEOPLE;')(); } catch {} }
  ok(!!AFP, 'ai-friend.html 의 PEOPLE 을 읽을 수 있다');

  // 🎙 음성코치 — 2026-08-31 까지 아바타 코드를 «한 벌 더» 갖고 있던 화면.
  const SC = readFileSync(join(PUB, 'speech-coach.html'), 'utf8');
  const scSrc = SC.match(/const SC_PEOPLE = \{[\s\S]*?\n\};/);
  let SCP = null;
  if (scSrc) { try { SCP = new Function(scSrc[0] + ' return SC_PEOPLE;')(); } catch {} }
  ok(!!SCP, 'speech-coach.html 의 SC_PEOPLE 을 읽을 수 있다');
  ok(/<script src="\/js\/mango-avatar\.js\?v=\d+"/.test(SC),
    'speech-coach 가 공용 아바타 모듈을 쓴다',
    '자기 인라인 복제본으로 되돌아가면 «다른 화면은 바뀌는데 음성코치만 안 바뀜» 이 재현된다');
  ok(!/window\.MangoAvatar = \(function\(\)\{/.test(SC),
    'speech-coach 안에 아바타 복제본이 다시 생기지 않았다');
  ok(!/mango-avatar\.css/.test(SC.replace(/<!--[\s\S]*?-->/g, '')),
    'speech-coach 는 공용 아바타 CSS 를 싣지 않는다(카드 크기가 자기 CSS 대로여야 한다)');
  ok(/scFriend === 'emma'[\s\S]{0,80}SAY_CLIPS/.test(SC),
    '미리 만든 립싱크 클립(SAY_CLIPS)은 Emma 일 때만 쓴다',
    '다른 친구에게 틀면 「Jake 를 골랐는데 Emma 가 말한다」가 되고 에러는 안 난다');
  /* ⚠️ 이 검사는 «코드 모양» 이 아니라 «뜻» 으로 묻는다.
     2026-08-31 에 두 벌로 복사돼 있던 fetch 블록을 scFetchTtsUrl·scTtsKey 한 곳으로
     모으자, 옛 형태(한 줄짜리 키 조립)를 통째로 못 박아 둔 검사가 «보장은 그대로인데»
     FAIL 했다(CLAUDE.md 「객체 모양을 정규식으로 못 박아 두어 칸 하나 늘렸더니 FAIL」).
     물어야 할 것은 ① 키를 만드는 자리가 화자를 넣는가 ② 캐시를 그 키로만 읽고 쓰는가 다. */
  const scKeyFn = SC.match(/function scTtsKey\([^)]*\)\s*\{[^}]*\}/);
  const scKeyHasSpeaker = (!!scKeyFn && /scSpeaker\(\)/.test(scKeyFn[0]))
    || /ttsCache\[lang \+ '\|' \+ \(lang === 'en' \? scSpeaker\(\)/.test(SC);
  const scKeyUses = [...SC.matchAll(/ttsCache\[([^\]]*)\]/g)].map((m) => m[1].trim());
  // 지역 변수로 받아 쓰는 것도 «그 키에서 온 것» 이면 통과시킨다(const key = scTtsKey(…))
  const scFromKeyVar = (k) => /^[A-Za-z_$][\w$]*$/.test(k)
    && new RegExp('\\b(?:const|let|var)\\s+' + k + '\\s*=\\s*scTtsKey\\(').test(SC);
  const scAllViaKey = scKeyUses.length > 0 && scKeyUses.every((k) =>
    k.startsWith('scTtsKey(') || scFromKeyVar(k)
    || /^lang \+ '\|' \+ \(lang === 'en' \? scSpeaker\(\)/.test(k));
  ok(scKeyHasSpeaker && scAllViaKey,
    'TTS 캐시 키에 화자가 들어 있다',
    '안 넣으면 친구를 바꿔도 먼저 받아 둔 남의 목소리가 그대로 재생된다'
      + ` (키 사용 ${scKeyUses.length}곳: ${scKeyUses.join(' / ') || '없음'})`);

  if (WUV && AFP && CH) {
    const people = ['emma', 'jake', 'lily', 'noah'];
    for (const k of people) {
      ok(!!WUV[k] && !!AFP[k], `${k}: 두 화면 모두에 있다`);
      if (!WUV[k] || !AFP[k]) continue;
      ok(WUV[k].speaker === AFP[k].speaker,
        `${k}: 두 화면의 목소리가 같다 (${WUV[k].speaker} / ${AFP[k].speaker})`,
        '같은 이름이 화면마다 다른 목소리로 말하면 그때부터 «화면마다 답이 다른» 사고가 시작된다');
      ok(WUV[k].char === AFP[k].char && !!CH[WUV[k].char],
        `${k}: 두 화면이 같은 얼굴을 가리키고 그 얼굴이 실재한다 (${WUV[k].char})`,
        '한쪽만 고치면 「그 친구를 골랐는데 딴 얼굴」이 되고 에러는 안 난다');
      if (SCP) {
        ok(!!SCP[k] && SCP[k].speaker === WUV[k].speaker && SCP[k].char === WUV[k].char,
          `${k}: 음성코치도 같은 목소리·얼굴이다 (${SCP[k] && SCP[k].speaker} / ${SCP[k] && SCP[k].char})`,
          '세 화면 중 하나만 어긋나면 같은 이름이 화면마다 다른 사람이 된다');
      }
    }
    // 네 사람의 목소리가 서로 겹치면 «누가 말하는지» 를 귀로 구분할 수 없다
    const spk = people.map(k => WUV[k] && WUV[k].speaker);
    ok(new Set(spk).size === people.length, `네 친구의 목소리가 서로 다르다 (${spk.join(', ')})`);
    const faces = people.map(k => WUV[k] && WUV[k].char);
    ok(new Set(faces).size === people.length, `네 친구의 얼굴이 서로 다르다 (${faces.join(', ')})`);
    // 「번갈아」가 도는 순서에 네 사람이 다 들어 있는가
    const ord = WU.match(/var VOICE_PEOPLE = \[([^\]]+)\]/);
    const ordList = ord ? ord[1].split(',').map(x => x.trim().replace(/'/g, '')) : [];
    ok(people.every(k => ordList.includes(k)),
      `「번갈아」 순서에 네 명이 다 있다 (${ordList.join(', ') || '없음'})`);
    // 화면 버튼과 표가 어긋나지 않는가 — 버튼만 늘리면 조용히 기본값으로 떨어진다
    const btns = [...WU.matchAll(/data-v="(\w+)"/g)].map(m => m[1]);
    ok(people.concat('mix').every(k => btns.includes(k)),
      `웜업 버튼이 다섯 개다 (${btns.join(', ')})`);
    const afBtns = [...AF.matchAll(/data-voice="(\w+)"/g)].map(m => m[1]);
    ok(people.concat('mix').every(k => afBtns.includes(k)),
      `AI 영어친구 버튼이 다섯 개다 (${afBtns.join(', ')})`);
    const scBtns = [...SC.matchAll(/data-p="(\w+)"/g)].map(m => m[1]);
    ok(people.every(k => scBtns.includes(k)),
      `음성코치 햄버거에 네 친구가 다 있다 (${scBtns.join(', ')})`);

    /* 🀄 언어별 친구 (2026-09-14) — 웜업에 중국어가 붙으면서 «중국어 교사» 가 생겼다.
       중국어 TTS 는 화자를 안 가리므로(구글 만다린 한 목소리) 중국어에서는 한 사람만 둔다.
       ⚠️ 여기서는 «표가 서로 같은 말을 하는가» 만 본다 — «무슨 답이 나오는가» 는
          warmup_zh_lang_harness ⑯ 이 함수를 실제로 돌려서 본다. */
    const zhPeople = Object.keys(WUV).filter(k => WUV[k] && WUV[k].zh);
    ok(zhPeople.length >= 1, `웜업에 중국어 친구가 있다 (${zhPeople.join(', ') || '없음'})`);
    for (const k of zhPeople) {
      ok(!!CH[WUV[k].char] && !!CH[WUV[k].char].frames,
        `${k}: 그 얼굴(${WUV[k].char})이 실재하는 이미지 캐릭터다`,
        '표만 고치고 그림을 안 넣으면 폴백이 조용히 돌아 «얼굴이 안 바뀐다»');
      ok(!faces.includes(WUV[k].char),
        `${k}: 영어 네 친구와 얼굴이 겹치지 않는다 (${WUV[k].char})`,
        '겹치면 «중국어를 골랐는데 영어 친구 얼굴» 이 되고 에러는 안 난다');
      /* 🔴 그 화면이 «중국어를 아는가» 와 짝이어야 한다.
         ⛔ 「ai-friend 에는 없어야 한다」로 못 박지 마세요 — 나중에 그 화면에 중국어가
            붙으면 올바른 수리가 오히려 빨간불이 됩니다(CLAUDE.md 「본보기가 정책에 딸려 다님」).
         물어야 할 것은 «중국어 친구를 둔 화면은 중국어를 실제로 말할 수 있는가» 입니다. */
      for (const [fname, src] of [['ai-friend.html', AF], ['speech-coach.html', SC]]) {
        const listed = new RegExp(`\\b${k}\\s*:\\s*\\{[^}]*char\\s*:`).test(src);
        const knowsZh = /lang\s*:\s*['"]zh['"]|_aiLang|mangoi_aifriend_lang|mangoi_sc_lang/.test(src);
        ok(!listed || knowsZh,
          `${fname}: 중국어 친구를 뒀다면 그 화면이 중국어를 말할 수 있다 (있음=${listed} · 중국어축=${knowsZh})`,
          '중국어 얼굴이 영어로 말하면 「누구지?」가 됩니다 — 화면에 중국어를 먼저 붙이세요');
      }
    }
  }
}

/* ── 🐢 입 바꾸는 속도 (v8, 2026-09-09) ─────────────────────────────────────
   사장님 「Emma 의 입이 너무 빨리 움직여 — Lily·Noah 처럼」.
   원인은 «횟수» 가 아니라 «한 번 바꿀 때 화면이 얼마나 달라지는가» 였다(실측은 mango-avatar.js 머리말 v8).
   Emma 의 세 입모양은 8초 영상의 «서로 다른 순간» 이라 고개·눈·어깨가 함께 움직이고,
   Lily·Noah 는 같은 좌표계에서 «입만» 오려 낸 세 장이다.
   ⚠️ Jake 는 재지 못했다(hero-avatar.mp4 가 H.264 라 이 컨테이너가 디코드 못 함) — 같이
      늦춘 것은 «영상 seek 이라는 같은 경로» 라는 판단이고, 측정이 아니다.
   ⚠️ 문자열로 「hold 가 있는가」만 보면 못 잡는다 — 표를 읽어 «관계» 로 묻고, 배선은
      «식 모양» 이 아니라 «무엇과 견주는가» 로 묻는다(상수로 되돌리면 FAIL). */
if (CH) {
  const imgC = Object.keys(CH).filter(k => CH[k].frames);
  const vidC = Object.keys(CH).filter(k => CH[k].sources);

  /* ⚠️ 기본값을 «주석까지 포함한» 원본에서 찾으면 머리말의 「MIN_SWITCH_MS=90」에 걸린다.
     블록주석은 정규식 한 줄로 지우면 문자열 속 «별표+슬래시» 에 뒷부분이 통째로 날아가므로
     줄 단위로 «지금 블록주석 안인가» 를 추적해 벗긴다(CLAUDE.md 「블록주석을 정규식 한 줄로」). */
  const strip = t => {
    let inB = false;
    return t.split('\n').map(line => {
      let out = '', i = 0;
      while (i < line.length) {
        if (inB) { const e = line.indexOf('*/', i); if (e < 0) { i = line.length; } else { inB = false; i = e + 2; } continue; }
        const b = line.indexOf('/*', i), l = line.indexOf('//', i);
        if (b >= 0 && (l < 0 || b < l)) { out += line.slice(i, b); inB = true; i = b + 2; continue; }
        if (l >= 0) { out += line.slice(i, l); i = line.length; continue; }
        out += line.slice(i); i = line.length;
      }
      return out;
    }).join('\n');
  };
  const CODE = strip(AV);

  /* ① 기본값 — 🔴 못 찾으면 «숫자로 떨어지지» 않는다.
     떨어뜨리면 소스가 `var MIN_SWITCH_MS = 200;` 으로 바뀌어도(= ⛔ 로 못 박은 「이미지
     캐릭터도 함께 늦춤」이 전역 기본값으로 일어난 상태) 아래 검사가 «90ms 그대로다» 라는
     거짓 초록을 냅니다. 「잘못된 «정상» 판정이 잘못된 «고장» 판정보다 나쁩니다」. */
  const mHold = CODE.match(/\bMIN_SWITCH_MS\s*=\s*(\d+)/);
  const mFade = CODE.match(/\bFADE_MS\s*=\s*(\d+)/);
  ok(!!mHold && !!mFade, `기본 hold·fade 를 소스에서 읽었다 (${mHold && mHold[1]} · ${mFade && mFade[1]})`,
    '못 읽으면 아래 검사가 거짓 초록을 내므로, 여기서 멈추고 아래를 아예 재지 않습니다');

  if (mHold && mFade) {
    const defHold = Number(mHold[1]), defFade = Number(mFade[1]);
    const holdOf = k => (CH[k].hold > 0 ? CH[k].hold : defHold);
    const fadeOf = k => (CH[k].fade > 0 ? CH[k].fade : defFade);
    const tuned = Object.keys(CH).filter(k => CH[k].hold > 0);

    // ⚠️ 이미지 캐릭터가 하나도 없으면 Math.max() 가 -Infinity 라 아래가 «언제나 참» 이 된다.
    ok(imgC.length > 0 && vidC.length > 0,
      `견줄 두 종류가 다 있다 (영상 ${vidC.length} · 이미지 ${imgC.length})`);
    const slowestImg = Math.max(...imgC.map(holdOf));

    /* ② 사장님이 지목하신 것은 «Emma» 다 — 그 하나는 반드시 이미지 캐릭터보다 느려야 한다.
       ⛔ 「모든 영상 캐릭터」로 넓히지 마세요: Jake 는 사장님 지시 밖이라 «되돌릴 수 있어야»
          합니다(넓히면 이 하니스가 Jake 를 잠가 버립니다).
       ⛔ 숫자(200)를 못 박지 않는다 — 180·220 으로 다듬어도 뜻은 그대로여야 합니다. */
    ok(!!CH.emma && holdOf('emma') > slowestImg,
      `emma: 이미지 캐릭터보다 입을 천천히 바꾼다 (${CH.emma ? holdOf('emma') : '?'}ms > ${slowestImg}ms)`,
      'Emma 의 입모양 세 장은 «영상의 다른 순간» 이라 바뀔 때 얼굴째 움직입니다 — 같은 속도로 '
      + '바꾸면 «입이 빠르다» 가 아니라 «덜덜거린다» 로 보입니다(2026-09-09 사장님 제보)');

    // ③ 늦추기로 한 캐릭터는 «영상 캐릭터» 뿐이어야 한다 — 이미지 캐릭터를 늦추면 여기서 걸린다.
    ok(tuned.length > 0 && tuned.every(k => CH[k].sources),
      `속도를 따로 정한 캐릭터가 영상 캐릭터뿐이다 (${tuned.join(', ') || '없음'})`,
      '이 목록이 비면 아래 검사가 조용히 아무것도 안 재게 됩니다');
    /* ④ Lily·Noah 는 사장님이 «이렇게 해 달라» 고 하신 기준이다 — 함께 늦추면 안 된다.
       ⚠️ 여기서 재는 것은 «자기 속도를 따로 안 적었다» 까지다. 전역 기본값 자체를 올려
          늦추는 변이는 ②(emma 가 이미지보다 느린가)가 잡는다 — 그래서 여기 문구를
          「예전 속도 그대로다」로 적으면 그 변이에서 «거짓말하는 초록» 이 된다. */
    for (const k of imgC) {
      ok(!(CH[k].hold > 0) && !(CH[k].fade > 0),
        `${k}(이미지): 자기 속도를 따로 정하지 않았다 (기본값 ${holdOf(k)}ms · ${fadeOf(k)}ms 를 씁니다)`,
        'Lily·Noah 는 지금이 기준입니다 — 여기를 늦추면 비교 대상이 사라집니다');
    }
    /* ⑤ 섞는 시간이 바꾸는 간격보다 길면 앞 전환이 끝나기 전에 다음 전환이 와서 두 얼굴이
       계속 겹친다 — «얼굴째 움직이는» 영상 캐릭터에서만 눈에 띈다.
       ⚠️ 기본값은 fade 130 > hold 90 이고 Lily·Noah 가 그 상태인데 **그게 정상이다**:
          그쪽은 한 번에 바뀌는 픽셀이 2~3% 뿐이라 겹쳐도 안 보인다(사장님이 고른 기준).
       ⛔ 이 검사를 전체 캐릭터로 넓히지 마세요 — Lily·Noah 를 «고치러» 가게 됩니다. */
    for (const k of tuned) {
      ok(fadeOf(k) <= holdOf(k),
        `${k}: 섞는 시간이 바꾸는 간격을 넘지 않는다 (fade ${fadeOf(k)} ≤ hold ${holdOf(k)})`,
        '넘으면 앞 얼굴이 채 사라지기 전에 다음 얼굴이 겹칩니다');
    }

    /* ⑥ 배선 — «식 모양» 이 아니라 «무엇과 견주는가» 로 묻는다.
       ⛔ `if(now - lastSwitchAt < curHold) return;` 처럼 글자 그대로 못 박지 마세요:
          이 파일은 `if(` 와 `if (` 가 이미 섞여 있어 공백 하나에 거짓 FAIL 이 납니다
          (CLAUDE.md 「하니스가 «객체 모양» 을 정규식으로 못 박아 두어」). */
    const cmp = [...CODE.matchAll(/lastSwitchAt\s*<\s*([A-Za-z_$][\w$]*)/g)].map(m => m[1]);
    ok(cmp.length === 2 && cmp.every(v => v === 'curHold'),
      `showTier 의 두 갈래(이미지·영상)가 캐릭터 hold 를 본다 (${cmp.join(', ') || '없음'})`,
      '한쪽만 상수로 되돌리면 그 갈래만 조용히 옛 속도로 돕니다');
    const fadeDiv = CODE.match(/fadeT0\s*\)\s*\/\s*([A-Za-z_$][\w$]*)/);
    ok(!!fadeDiv && fadeDiv[1] === 'curFade',
      `keyFrame 의 섞기가 캐릭터 fade 를 본다 (${fadeDiv ? fadeDiv[1] : '없음'})`);
    ok(/curHold\s*=[^;]*\bc\.hold\b/.test(CODE) && /curFade\s*=[^;]*\bc\.fade\b/.test(CODE),
      'applyFrame 이 캐릭터마다 hold·fade 를 다시 정한다',
      '여기서 안 정하면 캐릭터를 바꿔도 앞 캐릭터의 속도가 그대로 남습니다');

    /* ⑦ 🔴 var 호이스팅 — 선언을 applyFrame 아래로 내리면 첫 applyFrame(curChar) 이
       undefined 를 읽어, hold 를 안 적은 캐릭터의 최소 유지시간이 «조용히 0» 이 된다
       (var 는 «선언» 만 끌어올려지고 값은 안 끌어올려집니다 — 에러가 안 납니다). */
    const iDecl = CODE.search(/\bvar\s+MIN_SWITCH_MS\s*=/);
    const iUse  = CODE.indexOf('applyFrame(curChar);');
    ok(iDecl >= 0 && iUse >= 0 && iDecl < iUse,
      '기본값 선언이 첫 applyFrame(curChar) 호출보다 «위» 에 있다',
      'var 는 값이 끌어올려지지 않습니다 — 아래에 두면 그 순간 undefined 를 읽습니다');

    /* ⑧ 음성합성 폴백의 장 넘기는 간격은 hold 보다 커야 한다(작으면 입이 한 장에 굳는다).
       숫자를 박지 말고 curHold 에서 끌어오는지 «뜻으로» 본다 — 인자 순서를 바꿔도 통과해야 한다. */
    const seq = CODE.match(/seqMs\s*=([^;]*);/);
    ok(!!seq && /\bcurHold\b/.test(seq[1]) && /\bMath\.max\b/.test(seq[1]),
      `음성합성 폴백의 장 넘기는 간격이 hold 를 따라간다 (${seq ? seq[1].trim() : '없음'})`,
      '150 처럼 숫자만 박아 두면 hold 를 늘렸을 때 입이 한 장에 굳습니다');
    ok(!!seq && /Date\.now\(\)\s*\/\s*seqMs/.test(CODE),
      '그 간격을 실제로 장 고르기에 쓴다',
      '계산해 두고 안 쓰면 아무것도 안 바뀝니다');
  }
}
console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
