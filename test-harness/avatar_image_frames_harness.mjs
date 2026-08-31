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
  ok(/ttsCache\[lang \+ '\|' \+ \(lang === 'en' \? scSpeaker\(\)/.test(SC),
    'TTS 캐시 키에 화자가 들어 있다',
    '안 넣으면 친구를 바꿔도 먼저 받아 둔 남의 목소리가 그대로 재생된다');

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
  }
}

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
