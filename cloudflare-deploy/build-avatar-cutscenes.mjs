/**
 * 🥚 아바타 진화 컷신 — Higgsfield 프롬프트 파이프라인
 *
 * 왜 스크립트인가:
 *   프롬프트를 런타임에 만들면 학생이 진화할 때마다 영상 생성 비용과 수십 초 지연이 생긴다.
 *   그래서 15개 폼의 프롬프트를 여기서 "미리" 만들어 두고, 오프라인에서 생성해
 *   public/video/avatar/{species}-{tier}.mp4 로 넣는다. 게임은 파일이 있으면 재생하고
 *   없으면 캔버스 컷신으로 폴백하므로, 일부만 만들어도 전혀 문제가 없다.
 *   (기존 space-monster 에셋 파이프라인과 같은 방식)
 *
 * 사용:
 *   node cloudflare-deploy/build-avatar-cutscenes.mjs            # 전체 프롬프트 출력
 *   node cloudflare-deploy/build-avatar-cutscenes.mjs panda 1    # 특정 폼만
 *   node cloudflare-deploy/build-avatar-cutscenes.mjs --missing  # 아직 영상이 없는 폼만
 *
 * 생성 방법(2026-08-03 실제로 쓴 경로):
 *   1) STILL 프롬프트로 nano_banana_pro 이미지 생성 (9:16, 약 2크레딧)
 *      → 룩을 먼저 고정한다. 바로 text-to-video 로 만들면 종족 생김새가 매번 달라진다.
 *   2) 그 이미지를 start_image 로 kling3_0_turbo 영상 생성 (3초, 720p, 약 4.5크레딧)
 *   3) 받은 mp4 를 **반드시 압축한 뒤** public/video/avatar/{species}-{tier}.mp4 로 저장
 *      ffmpeg -i in.mp4 -c:v libx264 -crf 30 -preset slow -pix_fmt yuv420p -movflags +faststart -an out.mp4
 *      원본 3~4MB → 0.3~0.45MB (약 8배). 폰 화면에서 화질 차이가 보이지 않는다.
 *      · -an : 소리 제거(컷신에 소리가 없고, 무음이라야 모바일 자동재생이 막히지 않는다)
 *      · +faststart : moov 를 앞으로 — 안 하면 저속 회선에서 첫 프레임까지 한참 걸린다
 *      ⚠️ 원본을 public/ 안에 백업하지 말 것. deploy.ps1 이 public/ 을 통째로 올려서
 *         쓰지도 않는 원본이 실서비스로 나간다.
 *
 * ⚠️ 게임 속 아바타는 캔버스로 그린 카툰이다. 사실적 3D 로 만들면 "내 캐릭터가 아닌데?" 가 된다.
 *    STYLE 상수를 바꾸지 말 것 — 캔버스 아바타의 둥글둥글한 톤에 맞춘 값이다.
 *
 * 🪤 안전필터(nsfw) 오탐 — 2026-08-03 에 두 번 밟았다.
 *    아기동물을 뜻하는 단어가 들어가면 이미지 생성이 status:'nsfw' 로 통째로 거부된다.
 *      ❌ 'fox cub', 'puppy dog'   →  ✅ 'young fox character', 'small dog character'
 *    거부는 조용하다(에러가 아니라 status 만 nsfw). 결과를 반드시 status 로 확인할 것.
 *    아래 tiers 문구에서 cub/puppy 계열 단어를 다시 넣지 말 것.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'public', 'video', 'avatar');

// 캔버스 아바타와 톤을 맞추기 위한 공통 스타일. 종족별 프롬프트에 그대로 이어 붙는다.
const STYLE =
  'Soft rounded toy-like shapes, clean thick forms, smooth matte surfaces, Pixar-like appeal, ' +
  'deep purple-navy cosmic background with soft nebula glow, dramatic warm rim lighting, ' +
  'centered full body, plenty of empty space around the character. ' +
  'No text, no logo, no watermark, no UI.';

// 영상 단계에서 공통으로 요구하는 카메라·연출. 3초 안에 끝나야 한다.
const MOTION =
  'Camera pushes in slowly. Energy particles swirl upward around the character and burst outward once. ' +
  'The character raises its head and cheers proudly, then holds the pose. ' +
  'Smooth cinematic motion, no cuts, no camera shake, character stays centered and fully in frame.';

/** 종족별 5단계 외형 — student-game-avatar.html 의 SPECIES.tiers 와 이름이 1:1 대응한다. */
const FORMS = {
  panda: {
    label: '사이버 셰프 판다 · Cyber-Chef Panda',
    base: 'A chubby panda',
    tiers: [
      null, // tier 0 = 알. 컷신은 "알 → 1단계" 이므로 tier 0 영상은 없다.
      'cub chef standing heroically, wearing a tall white chef hat, holding a tiny frying pan, confident happy expression, big friendly eyes',
      'chef standing confidently, taller white chef hat with a golden band, twin frying pans, apron, determined cheerful expression',
      'master chef in a decorated white coat with golden trim, very tall chef hat, glowing knife and pan, heroic stance, radiant confidence',
      'legendary chef glowing with golden aura, crown-like chef hat with a shining star on top, cape, epic heroic pose, majestic and warm'
    ],
    fx: 'warm orange and blue energy particles'
  },
  fox: {
    label: '탐험가 여우 · Explorer Fox',
    base: 'An orange fox',
    tiers: [
      null,
      'cub space cadet standing heroically, wearing a light blue explorer scarf and a tiny transparent space helmet, fluffy white-tipped tail, confident happy expression, big friendly eyes',
      'pilot in a fitted space suit with a clear bubble helmet, glowing cyan visor trim, jetpack on the back, confident stance',
      'captain in a decorated space suit with shoulder insignia, larger helmet, jetpack firing soft flames, heroic stance',
      'commander in a glowing golden-trimmed space suit, star emblem above the helmet, cape of light, epic heroic pose, majestic and warm'
    ],
    fx: 'warm orange and cyan energy particles'
  },
  dragon: {
    label: '수호 드래곤 · Guardian Dragon',
    base: 'A round mint-green dragon',
    tiers: [
      null,
      'hatchling standing heroically, tiny golden horns, small purple wings just unfolding, cream belly, confident happy expression, big friendly eyes',
      'young sky dragon with wide open purple wings, longer golden horns, glowing magic sparks at its mouth, confident flying-ready stance',
      'guardian dragon with large glowing wings, ornate golden horns, protective magic runes floating around it, heroic stance',
      'elder dragon glowing with radiant magic, huge luminous wings, crown of golden horns, a shining star above its head, epic majestic pose'
    ],
    fx: 'warm orange and emerald magic energy particles'
  },
  dog: {
    label: '용감한 히어로 강아지 · Hero Pup',
    base: 'A golden-cream puppy dog',
    tiers: [
      null,
      'hero standing proudly, wearing a small red superhero cape and a tiny blue collar with a star badge, floppy ears, wagging fluffy tail, cheerful confident smile, big friendly eyes',
      'brave hero wearing a red cape and a red hero eye mask, blue collar with star badge, confident determined stance, floppy ears',
      'hero dog in a red cape and mask holding a shiny round shield, blue collar with glowing star badge, heroic protective stance',
      'legendary guardian dog glowing with golden aura, long flowing red cape, ornate shield, a shining star above its head, epic majestic heroic pose'
    ],
    fx: 'warm orange and golden energy sparkles'
  }
};

/** 한 폼의 (스틸 프롬프트, 영상 프롬프트) 를 만든다. */
export function buildPrompts(species, tier) {
  const f = FORMS[species];
  if (!f) throw new Error(`알 수 없는 종족: ${species}`);
  const desc = f.tiers[tier];
  if (!desc) throw new Error(`${species} tier ${tier} 은 컷신 대상이 아니다 (tier 0 = 알)`);

  const still =
    `Cute stylized 3D character render for a children's education game. ` +
    `${f.base} ${desc}. Glowing ${f.fx} swirling around it. ${STYLE}`;

  const video = `${MOTION} The character is ${f.base.toLowerCase().replace(/^an? /, '')} ${desc}.`;

  return { species, tier, file: `${species}-${tier}.mp4`, still, video };
}

export function allForms() {
  const out = [];
  for (const sp of Object.keys(FORMS)) {
    for (let t = 1; t < FORMS[sp].tiers.length; t++) out.push(buildPrompts(sp, t));
  }
  return out;
}

/* ── CLI ── */
if (process.argv[1] && process.argv[1].endsWith('build-avatar-cutscenes.mjs')) {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const args = process.argv.slice(2);
  const onlyMissing = args.includes('--missing');
  const [sp, tr] = args.filter(a => !a.startsWith('--'));

  let list = sp && tr ? [buildPrompts(sp, Number(tr))] : allForms();
  if (onlyMissing) list = list.filter(f => !existsSync(join(OUT_DIR, f.file)));

  console.log(`출력 폴더: ${OUT_DIR}`);
  console.log(`대상 ${list.length}개${onlyMissing ? ' (영상이 아직 없는 것만)' : ''}\n`);
  for (const f of list) {
    const have = existsSync(join(OUT_DIR, f.file));
    console.log('─'.repeat(78));
    console.log(`▶ ${f.file}   ${FORMS[f.species].label}  Tier ${f.tier + 1}   ${have ? '[영상 있음]' : '[없음 → 캔버스 폴백]'}`);
    console.log(`\n[1] STILL (nano_banana_pro, 9:16, ~2 credits)\n${f.still}`);
    console.log(`\n[2] VIDEO (kling3_0_turbo, start_image=위 이미지, 3s, 720p, ~4.5 credits)\n${f.video}\n`);
  }
  console.log('─'.repeat(78));
  console.log('영상이 없는 폼은 게임이 캔버스 컷신으로 자동 폴백한다. 전부 만들 필요 없다.');
}
