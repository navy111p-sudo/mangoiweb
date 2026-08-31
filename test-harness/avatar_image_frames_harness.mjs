/* avatar_image_frames_harness.mjs — 아바타 «입모양 이미지 캐릭터» 감시 (2026-08-31)
 *
 * 왜 필요한가
 *   사장님 지시 「아바타를 지금보다 어린 얼굴·목소리로」 로 웜업·AI영어친구의 아바타를
 *   19세 안팎 Emma·Jake 로 바꾸면서, 캐릭터가 «초록 배경 영상» 말고 «입모양 정지 이미지
 *   3장(투명 PNG)» 도 될 수 있게 mango-avatar.js 를 넓혔다(v6).
 *   영상을 버린 이유는 취향이 아니라 사고 이력이다 —
 *     · v5(2026-07-29) 「남자 아바타가 한 번 움직이고 멈춘다」의 뿌리가 «영상 seek» 이었다.
 *       이미지는 seek 이 없어 그 사고 유형이 구조적으로 사라진다.
 *     · 8초 영상 1.3MB 대신 장당 수백 KB — 필리핀 회선에서 가볍다.
 *
 * 이 검사가 지키는 것 (문자열 훑기가 아니라 «표를 실제로 읽어» 판정한다)
 *   ① 이미지 캐릭터에는 반드시 «살아 있는» fallback 이 있어야 한다.
 *      PNG 가 아직 안 올라왔을 때 얼굴 자리가 «빈 카드» 로 남는 것이 제일 나쁘다.
 *      그래서 로드 실패 시 옛 영상 캐릭터로 되돌아간다 — 그 되돌아갈 곳이 실재해야 한다.
 *   ② 투명 PNG 는 «겹쳐 그리면» 앞 입모양이 유령처럼 남는다 → keyFrame 이 clearRect 로 지워야 한다.
 *   ③ 옛 영상 캐릭터(*_classic)를 지우면 안 된다 — 폴백이자 playClip 클립의 짝이다.
 *   ④ 화면 HTML 의 <video> 안에 <source> 를 되살리면, JS 가 돌기 전에 브라우저가
 *      teacher-avatar.webm 942KB 를 먼저 받기 시작한다(실측 206 요청). 첫 화면 낭비다.
 *   ⑤ mango-avatar.js 를 고쳤으면 그것을 부르는 HTML 의 ?v= 도 같이 올라가야 한다
 *      (immutable 캐시에 옛 파일이 남는 사고 방지 — asset_version_harness 와 같은 취지).
 *
 * ⚠️ 이 검사로는 «그려졌는가» 를 볼 수 없다. 좌표·픽셀은 진짜 브라우저가 필요하다 →
 *    test-harness/manual/avatar-image-frames-browser.mjs (사람이 직접 부른다)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
let pass = 0, fail = 0;
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
  ok(CH.female && CH.male, '화면이 부르는 이름 female·male 이 표에 있다',
    'warmup.html·ai-friend.html 은 setCharacter(\'female\'|\'male\') 로만 부른다');

  for (const k of imgChars) {
    const c = CH[k];
    ok(['closed', 'medium', 'wide'].every(t => typeof c.frames[t] === 'string' && c.frames[t]),
      `${k}: 입모양 3단계(closed·medium·wide)가 모두 있다`,
      '한 단계라도 비면 showTier 가 그 단계에서 조용히 멈춘다');
    ok(c.keyed === false, `${k}: keyed:false — 이미 투명한 PNG 라 크로마키를 건너뛴다`,
      '초록 제거 루프를 그냥 돌리면 얼굴의 초록빛 픽셀이 지워진다');
    ok(!!c.fallback && !!CH[c.fallback] && !!(CH[c.fallback].sources),
      `${k}: fallback «${c.fallback}» 이 실재하는 영상 캐릭터다`,
      'PNG 가 아직 없을 때 되돌아갈 곳이 없으면 얼굴 자리가 빈 카드로 남는다');
    ok(c.fallback !== k, `${k}: fallback 이 자기 자신이 아니다 (무한 되돌기 방지)`);
    ok(c.still === c.frames.closed, `${k}: 정지 얼굴이 «입 다문 장» 과 같다`);
  }

  /* ③ 옛 영상 캐릭터 보존 — 폴백이자 playClip(teacher-say-*) 클립의 짝 */
  ok(vidChars.includes('female_classic') && vidChars.includes('male_classic'),
    '옛 영상 캐릭터(female_classic·male_classic)가 그대로 남아 있다',
    '⛔ 지우지 말 것 — 폴백이고, playClip 의 미리 만든 립싱크 클립이 옛 얼굴과 짝이다');
  ok(typeof (CH.female_classic || {}).poses?.closed === 'number',
    '옛 영상 캐릭터의 입모양 타임스탬프(poses)가 남아 있다');
}

/* ② 투명 PNG 유령 방지 + 키잉 건너뛰기 */
ok(/ctx\.clearRect\(0,0,canvas\.width,canvas\.height\);\s*\n?\s*ctx\.drawImage\(srcEl/.test(AV),
  'keyFrame 이 «지우고 그린다» (투명 PNG 가 겹쳐 유령으로 남지 않게)',
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
    `${f}: mango-avatar.js 의 ?v= 가 14 이상이다 (${m ? m[1] : '없음'})`,
    'v6 로 고쳤으므로 옛 파일이 immutable 캐시에 남으면 안 된다');
}

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
