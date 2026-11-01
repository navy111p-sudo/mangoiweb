/* Picture-book style canon recovered from the user's Claude session, 2026-10-22. */
export const STYLES = {
  brick: {ko:'브릭 블록',en:'Brick-built world',emoji:'🧱',photo:false,minStage:1,maxStage:4},
  cg3d: {ko:'3D 애니메이션',en:'3D animation',emoji:'🎬',photo:false,minStage:1,maxStage:4},
  anime: {ko:'일본 애니메이션',en:'Anime',emoji:'🌸',photo:false,minStage:1,maxStage:4},
  fairytale: {ko:'고전 동화 애니메이션',en:'Classic fairy-tale animation',emoji:'🏰',photo:false,minStage:1,maxStage:2},
  clay: {ko:'클레이 인형',en:'Claymation',emoji:'🧱',photo:false,minStage:1,maxStage:2},
  felt: {ko:'펠트 인형',en:'Felt dolls',emoji:'🧸',photo:false,minStage:1,maxStage:2},
  crayon: {ko:'크레용 그림',en:'Crayon drawing',emoji:'🖍️',photo:false,minStage:1,maxStage:2},
  comic: {ko:'만화책',en:'Comic book',emoji:'💥',photo:false,minStage:1,maxStage:4},
  vintage: {ko:'옛날 그림',en:'Vintage illustration',emoji:'📜',photo:false,minStage:1,maxStage:4},
  minhwa: {ko:'한국 민화',en:'Korean folk painting',emoji:'🐯',photo:false,minStage:1,maxStage:4},
  pixel: {ko:'픽셀 게임',en:'Pixel art',emoji:'👾',photo:false,minStage:1,maxStage:4},
  webtoon: {ko:'웹툰',en:'Webtoon',emoji:'📱',photo:false,minStage:1,maxStage:4},
  flat: {ko:'굵은 선 카툰',en:'Bold cartoon',emoji:'✏️',photo:false,minStage:1,maxStage:3},
  papercut: {ko:'종이 공예',en:'Paper cut',emoji:'✂️',photo:false,minStage:1,maxStage:4},
  photo: {ko:'실사',en:'Photo-real',emoji:'📷',photo:true,minStage:2,maxStage:4},
  editorial: {ko:'잡지 일러스트',en:'Editorial illustration',emoji:'📰',photo:false,minStage:3,maxStage:4},
};
const LOOK = {
  brick: ['A colorful interlocking toy-brick stop-motion movie still: every character, animal, object and piece of scenery is built from small studded plastic bricks, expressive toy minifigures, tactile brick seams, a cohesive miniature world, cinematic light, no logos.', 'A sophisticated interlocking toy-brick architectural diorama: precisely assembled studded bricks, detailed miniature engineering, carefully lit documentary composition, mature restrained colors, coherent brick-built characters and scenery, no logos.'],
  cg3d: ['A still from a high-end 3D animated feature film: polished CGI, soft global illumination, rich saturated colors, cinematic lighting and depth of field.', 'A high-end cinematic 3D render like a science documentary visualization: realistic materials, dramatic lighting, rich color, crisp detail.'],
  anime: ['A Japanese anime film illustration: clean line art, cel shading with crisp highlights, vivid colors, a beautifully painted anime background.'],
  fairytale: ['A classic hand-drawn fairy-tale feature-animation look: soft painted backgrounds, warm magical glow, graceful expressive characters, rich jewel-tone colors, sparkles of storybook magic.'],
  clay: ['A stop-motion claymation still: handmade plasticine characters and props with subtle fingerprint texture, a miniature handcrafted set, soft studio lighting, shallow depth of field.'],
  felt: ['A photo of a handmade felt-doll diorama: needle-felted wool characters with stitched seams and tiny button eyes, fabric and yarn textures, a cozy miniature set, soft warm light.'],
  crayon: ["Children's picture-book art drawn with crayons and oil pastels: bold waxy strokes with visible paper texture, bright colors, charming hand-drawn shapes, still neat and easy to read."],
  comic: ['A bright comic-book illustration: bold black ink outlines, halftone dot shading, punchy primary colors, a dynamic action angle.', 'A graphic-novel illustration: confident ink lines, halftone and cross-hatch shading, dramatic lighting, a limited bold palette.'],
  vintage: ['A retro 1950s printed cartoon illustration: limited palette of mustard, teal, brick red and cream, slight print-grain texture, simple bold shapes on old storybook paper.', 'A vintage hand-tinted engraving from an old history book: fine etched linework, muted sepia, ochre and faded blue tones, aged paper texture.'],
  minhwa: ['A traditional Korean minhwa folk painting: flat mineral-pigment colors on aged hanji paper, fine ink outlines, stylized clouds, pine trees and mountains, charming naive figures.'],
  pixel: ['True 16-bit retro video-game pixel art: low resolution with chunky, clearly visible square pixels and no smooth gradients, a limited vibrant palette, the look of a classic game world.'],
  webtoon: ['A Korean webtoon digital illustration: clean line art, soft cel shading with gentle gradients, vivid colors, expressive faces, one cinematic panel.'],
  flat: ['A bold-outline flat cartoon: thick clean black outlines, flat bright colors, a simple uncluttered background, big readable shapes.'],
  papercut: ['A layered paper-cut craft diorama: cut-paper layers with soft drop shadows, textured colored card stock, handmade 3D depth.'],
  photo: ['A cinematic photorealistic photograph: dramatic natural lighting, vivid but natural color, a sharp clear subject, shallow depth of field, documentary feel.'],
  editorial: ['A striking modern editorial magazine illustration: a clever, surprising visual idea, bold flat shapes with subtle grain texture, a vivid eye-catching color palette, clean composition.'],
};
export const AGE = {
  1:'Made for young children aged 6 to 9: very cute and friendly, rounded simple shapes, big expressive faces, bright cheerful colors, one clear action.',
  2:'Made for kids aged 10 to 12: exciting and cool rather than babyish, a dynamic pose and camera angle, more detail, vivid colors.',
  3:'Made for students aged 12 to 14: realistic proportions, intriguing and informative, not cute or babyish, one clear subject.',
  4:'Made for teenagers aged 15 to 16: sophisticated and mature, realistic proportions, stylish and thought-provoking like a quality magazine or documentary, not cute.',
};
const NO_TEXT = 'Landscape picture-book illustration. Keep the main characters and key objects large and easy to see, with an uncluttered background. No text, letters, numbers, captions, signs, logos or speech bubbles anywhere in the image.';
const REF = 'The reference image is a character sheet only: keep exactly the same characters (faces, hair, clothes, colors) and the same art style. Do not copy its picture: use a clearly different camera angle, distance and background layout, so this page is a brand-new illustration of the scene above.';
export function stylePrompt(style, stage, desc, ref) {
  const look=LOOK[style];
  if (!look || !STYLES[style]) throw new Error('모르는 화풍: '+style);
  const l=stage>=3 && look[1] ? look[1] : look[0];
  const scene=String(desc || '').trim();
  return [l,AGE[stage],'Scene: '+scene+(/[.!?]$/.test(scene)?'':'.'),ref?REF:'',NO_TEXT].filter(Boolean).join(' ');
}
export function styleFitsStage(style,stage) {
  const s=STYLES[style];
  return !!s && stage>=s.minStage && stage<=s.maxStage;
}
