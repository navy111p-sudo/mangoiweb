/* 📚 영어 독서 사다리 전편(2026-10-18 48편 → 2026-10-19 176편) → 그림 동화책 페이지 생성기 (2026-10-18 사장님 «이런 방식으로 모두 만들어줘»)
   틀: cloudflare-deploy/public/story-birthday-cake.html (2권 — WRITE_PAT 로 일반화된 판). 그 파일은 손대지 않습니다.
   글: public/js/reading-ladder-data.js 의 sentences[].en «그대로» (단계별 수준 유지) · 활동 재료: scripts/ladder-storybooks/data/<id>.json
   결과: public/story-<id>.html (예: story-s1-01.html)
   ⛔ 결과 파일을 손으로 고치지 마세요 — 데이터나 이 스크립트를 고치고 다시 돌리세요: node scripts/ladder-storybooks/build.mjs
   ⛔ 틀의 «바꿀 자리» 가 정확히 한 번씩 있어야 합니다 — 2권 파일이 바뀌어 자리가 사라지면 여기서 멈춥니다(조용히 옛 글이 남지 않게).
   배경음악은 편마다 다르게(id 로 씨앗을 정해 조성·박자·화성·선율·음색을 고름 — 같은 id 는 언제나 같은 곡). */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLadder, validate, DATA_DIR } from './validate.mjs';
import { STYLES } from './styles.mjs';
import { buildGallery } from './gallery.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const TEMPLATE = join(PUB, 'story-birthday-cake.html');

const STAGE = {
  1: { color: '#2f9e44', dark: '#69db7c', ko: '1단계 쉬운 이야기', en: 'Step 1 Easy stories', grade: ['초1~3', 'Grades 1-3'], cefr: 'A1', min: ['5~10분', '5–10 min'], photo: false },
  2: { color: '#1971c2', dark: '#74c0fc', ko: '2단계 조금 긴 이야기', en: 'Step 2 Longer stories', grade: ['초4~6', 'Grades 4-6'], cefr: 'A2', min: ['10~15분', '10–15 min'], photo: false },
  3: { color: '#e8590c', dark: '#ffa94d', ko: '3단계 쉬운 지식 글', en: 'Step 3 Easy non-fiction', grade: ['초6~중2', 'Grades 6-8'], cefr: 'A2+/B1', min: ['15~20분', '15–20 min'], photo: true },
  4: { color: '#862e9c', dark: '#da77f2', ko: '4단계 고1 지식 글', en: 'Step 4 Non-fiction', grade: ['중3~고1', 'Grades 9-10'], cefr: 'B1+/B2', min: ['20~25분', '20–25 min'], photo: true },
};

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const J = (v) => JSON.stringify(v);

// ── 🎵 편마다 다른 배경음악 ─────────────────────────────────────────────
function rngFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
}
const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
const PROGS = [
  [0, 4, 5, 3, 0, 4, 3, 0], [0, 5, 3, 4, 0, 5, 1, 4], [0, 3, 4, 0, 5, 3, 4, 0], [0, 3, 0, 4, 5, 3, 1, 4],
  [0, 5, 1, 4, 0, 3, 4, 0], [0, 2, 3, 4, 0, 2, 3, 4], [5, 3, 0, 4, 5, 3, 0, 4], [0, 4, 5, 2, 3, 0, 3, 4],
];
const RHYTHMS = [[1, 1, 1, 1], [0.5, 0.5, 1, 1, 1], [1, 0.5, 0.5, 2], [2, 1, 1], [1, 1, 2], [0.5, 0.5, 0.5, 0.5, 1, 1], [1.5, 0.5, 1, 1], [1, 1, 0.5, 0.5, 1]];
const NAMES = ['Morning', 'Garden', 'River', 'Window', 'Meadow', 'Harbor', 'Lantern', 'Breeze', 'Pebble', 'Maple', 'Cloud', 'Orchard'];
export function makeTune(id, stage) {
  const r = rngFrom('tune:' + id);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const minor = stage >= 3 ? r() < 0.45 : r() < 0.2;
  const scale = minor ? MINOR : MAJOR;
  const root = pick([45, 47, 48, 50, 52, 53, 55]);          // 반주 바닥음(옥타브 3 근처)
  const prog = pick(PROGS);
  const bpmBase = { 1: [100, 120], 2: [92, 112], 3: [82, 100], 4: [72, 92] }[stage];
  const bpm = Math.round(bpmBase[0] + r() * (bpmBase[1] - bpmBase[0]));
  const deg = (d, oct) => root + 12 * oct + scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  const chords = prog.map((d) => [deg(d, 0), deg(d + 2, 1), deg(d + 4, 1)]);
  const melody = [];
  let prev = deg(prog[0], 2);
  prog.forEach((d, bi) => {
    const last = bi === prog.length - 1;
    const rh = last ? pick([[2, 2], [1, 1, 2], [3, 1]]) : pick(RHYTHMS);
    const tones = [deg(d, 2), deg(d + 2, 2), deg(d + 4, 2), deg(d + 7, 2)];
    rh.forEach((len, ni) => {
      let n;
      if (last && ni === rh.length - 1) n = deg(0, 2) + (r() < 0.5 ? 12 : 0);   // 마지막은 으뜸음으로 끝
      else if (ni === 0 || r() < 0.65) {                          // 강박·대부분은 화음음 — 직전 음과 가까운 것
        n = tones.slice().sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev))[Math.floor(r() * 2)];
      } else {                                                     // 지나가는 음(음계 한 칸)
        const pool = []; for (let dd = -7; dd < 21; dd++) pool.push(deg(dd, 2));
        const at = pool.indexOf(prev);
        n = at > 0 && at < pool.length - 1 ? pool[at + (r() < 0.5 ? 1 : -1)] : prev;
      }
      if (n < 69) n += 12; if (n > 88) n -= 12;
      melody.push([n, len]); prev = n;
    });
  });
  return { name: pick(NAMES) + ' ' + (minor ? 'Song' : 'Tune') + ' ' + id, bpm, beats: 4, wave: r() < 0.5 ? 'marimba' : 'musicbox', chords, melody };
}

// ── 🔀 보기 섞기 ─────────────────────────────────────────────────────────
function permute(n, r) { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function mixChoices(id, d) {
  for (let t = 0; t < 50; t++) {
    const r = rngFrom('mix:' + id + ':' + t);
    const sumOpts = d.sum.map((x) => (x.ans == null ? null : permute(x.opts.length, r).map((i) => x.opts[i])));
    const qsMixed = d.qs.map((q) => {
      const po = permute(q.opts.length, r), pe = permute(q.evs.length, r);
      return { ...q, opts: po.map((i) => q.opts[i]), ans: po.indexOf(q.ans), evs: pe.map((i) => q.evs[i]), ev: q.ev.map((e) => pe.indexOf(e)).sort((a, b) => a - b) };
    });
    const sumPos = new Set(d.sum.map((x, i) => (x.ans == null ? -1 : sumOpts[i].indexOf(x.ans))).filter((v) => v >= 0));
    const qPos = new Set(qsMixed.map((q) => q.ans));
    const firstEv = qsMixed.every((q) => q.ev.includes(0));
    if (sumPos.size >= 2 && qPos.size >= 2 && !firstEv) return { sumOpts, qsMixed };
  }
  throw new Error(id + ': 보기 섞기가 50번 안에 고르게 안 됨');
}

// ── ⑥ 바꿔 쓰기 틀 정규식 ───────────────────────────────────────────────
function wordsRe(phrase) {
  return phrase.toLowerCase().split(/\s+/).map((w) => {
    if (w === 'can’t') return 'can(?:[’\']?t|not)';
    return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/’/g, "[’']");
  }).join('\\s+');
}

function once(src, from, to, what) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`틀에서 «${what}» 자리를 정확히 1번 못 찾음(${n}번)`);
  return src.replace(from, () => to);
}
function all(src, from, to, what, expect) {
  const n = src.split(from).length - 1;
  if (n !== expect) throw new Error(`틀에서 «${what}» 자리가 ${expect}번이어야 함(${n}번)`);
  return src.split(from).join(to);
}
function between(src, start, endMarker, to, what) {
  const a = src.indexOf(start); if (a < 0 || src.indexOf(start, a + 1) >= 0) throw new Error('틀에서 «' + what + '» 시작 자리 문제');
  const b = src.indexOf(endMarker, a); if (b < 0) throw new Error('틀에서 «' + what + '» 끝 자리 문제');
  return src.slice(0, a) + to + src.slice(b + endMarker.length);
}

export function buildPage(tpl, p, d, no) {
  const st = STAGE[p.stage];
  const art = STYLES[d.img.style];
  const S = p.sentences.map((x) => x.en);
  const info = p.genre === 'info';
  const title = p.title.en;
  let h = tpl.replace(/\r\n/g, '\n');
  const nWords = S.join(' ').replace(/[^A-Za-z' ]/g, ' ').split(/\s+/).filter(Boolean).length;
  const what = info ? ['글', 'text'] : ['이야기', 'story'];

  h = once(h, '<title>The Missing Birthday Cake</title>', `<title>${esc(title)}</title>`, 'title');
  h = once(h, 'content="망고아이 A.i 동화책 심화1 · 사라진 생일 케이크 · 읽고 듣기 · 근거 찾기 · 바꿔 쓰기"',
    `content="망고아이 영어 독서 ${esc(st.ko)} · ${esc(p.title.ko)} · 읽고 듣기 · 근거 찾기 · 바꿔 쓰기"`, 'meta description');
  h = once(h, '--umbrella:#c2410c;', `--umbrella:${st.color};`, 'color');
  h = all(h, '--umbrella:#fb8a4a;', `--umbrella:${st.dark};`, 'dark color', 2);
  const tagKo = `망고아이 영어 독서 · <b>${st.ko}</b>`, tagEn = `Mangoi English Reading · <b>${st.en}</b>`;
  h = once(h, '<div class="tag" data-ko="망고아이 A.i 동화책 · <b>심화1</b>" data-en="Mangoi A.i Storybook · <b>Advanced 1</b>">망고아이 A.i 동화책 · <b>심화1</b></div>',
    `<div class="tag" data-ko="${esc(tagKo)}" data-en="${esc(tagEn)}">${tagKo}</div>`, 'tag');
  h = once(h, '<h1>The Missing Birthday Cake</h1>', `<h1>${esc(title)}</h1>`, 'h1');
  h = once(h, '<span>Story 2</span>', `<span>Step ${p.stage} · No. ${no}</span>`, 'story no');
  h = once(h, '<span data-ko="약 340단어" data-en="about 340 words">약 340단어</span>', `<span data-ko="약 ${nWords}단어" data-en="about ${nWords} words">약 ${nWords}단어</span>`, 'words');
  h = once(h, '<span data-ko="20~25분" data-en="20–25 min">20~25분</span>', `<span data-ko="${st.min[0]}" data-en="${st.min[1]}">${st.min[0]}</span>`, 'minutes');
  h = once(h, '<span data-ko="캐피 심화1 수준" data-en="Level: CAPPY Advanced 1">캐피 심화1 수준</span>',
    `<span data-ko="${st.grade[0]} · ${st.cefr}" data-en="${st.grade[1]} · ${st.cefr}">${st.grade[0]} · ${st.cefr}</span>`, 'level');
  h = once(h, '<figure class="pic cover"><img src="img/story/birthday-cake-cover.webp" alt="Mia and Ben give Grandma Rose a pancake tower while Biscuit the dog wags his tail" width="1024" height="688"></figure>',
    `<figure class="pic cover"><img src="img/story/${p.id}-cover.webp${d.img.ver?.cover ? '?v=' + d.img.ver.cover : ''}" alt="${esc(d.alt.cover)}" width="1024" height="688"></figure>`, 'cover');
  h = once(h, '    <div class="meta">', `    <div class="meta">\n      <span class="art-style" data-style="${esc(d.img.style)}" data-ko="${esc(art.emoji + ' ' + art.ko)}" data-en="${esc(art.emoji + ' ' + art.en)}">${esc(art.emoji + ' ' + art.ko)}</span>`, 'art style badge');

  const rP = d.roleNames.P, rS = d.roleNames.S;
  const keyKo = `이 ${what[0]}에서 가장 중요한 문장 2개를 위 본문에서 눌러 고르세요. 하나는 «${rP.ko}», 하나는 «${rS.ko}» 입니다.`;
  const keyEn = `Tap the 2 most important sentences in the ${what[1]} above: one shows the ${rP.en}, one shows the ${rS.en}.`;
  h = once(h, '<p class="howto" data-ko="이 이야기에서 가장 중요한 문장 2개를 위 본문에서 눌러 고르세요. 하나는 «문제», 하나는 «해결» 입니다." data-en="Tap the 2 most important sentences in the story above: one shows the problem, one shows the solution.">이 이야기에서 가장 중요한 문장 2개를 위 본문에서 눌러 고르세요. 하나는 «문제», 하나는 «해결» 입니다.</p>',
    `<p class="howto" data-ko="${esc(keyKo)}" data-en="${esc(keyEn)}">${esc(keyKo)}</p>`, 'key howto');
  h = once(h, '<p class="howto" data-ko="먼저 누가·무슨 문제·어떻게 해결했는지 보고, 빈칸에 알맞은 단어를 고르세요." data-en="Look at Who / Problem / Solution, then choose the right word for each blank.">먼저 누가·무슨 문제·어떻게 해결했는지 보고, 빈칸에 알맞은 단어를 고르세요.</p>',
    `<p class="howto" data-ko="${esc(d.sumHowto.ko)}" data-en="${esc(d.sumHowto.en)}">${esc(d.sumHowto.ko)}</p>`, 'sum howto');
  const boxes = d.boxes.map((b) => `      <div class="box"><div class="k">${esc(b.k)}</div><div class="q" data-ko="${esc(b.qko)}" data-en="${esc(b.qen)}">${esc(b.qko)}</div><div class="a">${esc(b.a)}</div></div>`).join('\n');
  h = between(h, '      <div class="box"><div class="k">Who</div>', 'They make a pancake tower instead.</div></div>', boxes, 'boxes');

  // ⑥
  const w = d.write;
  const srcPlain = w.src.replace(/^“|”$/g, '').replace(/<\/?u>/g, '').replace(/’/g, "'");
  const fromText = S.some((s) => s.replace(/[“”"]/g, '').replace(/’/g, "'").includes(srcPlain));
  h = once(h, '<p class="howto" data-ko="Mia 의 말을 틀로 삼아, 빈칸 두 곳을 «내 생각 + 그 이유» 로 바꿔 영어로 써 보세요." data-en="Use Mia’s sentence as a pattern. Write your own idea and your reason, in English.">Mia 의 말을 틀로 삼아, 빈칸 두 곳을 «내 생각 + 그 이유» 로 바꿔 영어로 써 보세요.</p>',
    `<p class="howto" data-ko="${esc(w.howtoKo)}" data-en="${esc(w.howtoEn)}">${esc(w.howtoKo)}</p>`, 'write howto');
  h = once(h, '<div class="pat-k" data-ko="본문 문장" data-en="From the story">본문 문장</div>',
    fromText ? `<div class="pat-k" data-ko="본문 문장" data-en="From the ${what[1]}">본문 문장</div>` : '<div class="pat-k" data-ko="예문" data-en="Example">예문</div>', 'pat-k');
  h = once(h, '<p class="pat-src">“I think <u>Biscuit ate the cake</u> because <u>there is pink cream on his nose</u>.”</p>', `<p class="pat-src">${w.src}</p>`, 'pat-src');
  const sep = w.sep === ' ' ? ' ' : w.sep;
  h = once(h, '<p class="pat-frame">I think <span class="slot" data-ko="내 생각" data-en="my idea">내 생각</span> because <span class="slot" data-ko="그렇게 생각한 이유" data-en="my reason">그렇게 생각한 이유</span>.</p>',
    `<p class="pat-frame">${esc(w.pre)} <span class="slot" data-ko="${esc(w.slotKo[0])}" data-en="${esc(w.slotEn[0])}">${esc(w.slotKo[0])}</span>${sep === ' ' ? ' ' : esc(sep)}${esc(w.mid)} <span class="slot" data-ko="${esc(w.slotKo[1])}" data-en="${esc(w.slotEn[1])}">${esc(w.slotKo[1])}</span>.</p>`, 'pat-frame');
  // 예시 문장 — 2026-10-20 사장님 «예시 넣어 보기» 버튼을 뺐습니다(눌러 넣고 그대로 «완성하기» 하면 스스로 생각해 쓰지 않음).
  //   화면에 버튼으로 그리지 않고, 철자 점검의 «아는 낱말» 목록(WRITE_EX)과 입력칸 회색 글씨(placeholder)에만 씁니다.
  h = once(h, 'var WRITE_EX = [["it will rain","the sky is dark"],["my brother is hungry","he is looking in the fridge"],["Mom is happy","she is singing"]];',
    `var WRITE_EX = ${J(w.chips.map((c) => [c.a, c.b]))};`, 'WRITE_EX');
  h = once(h, '<span class="wfix">I think</span>', `<span class="wfix">${esc(w.pre)}</span>`, 'wfix pre');
  h = once(h, 'placeholder="it will rain" aria-label="what you think"', `placeholder="${esc(w.chips[0].a)}" aria-label="${esc(w.aria[0])}"`, 'wa');
  h = once(h, '<span class="wfix">because</span>', `<span class="wfix">${sep === ' ' ? '' : esc(sep.trim())}${sep === ' ' ? '' : ' '}${esc(w.mid)}</span>`, 'wfix mid');
  h = once(h, 'placeholder="the sky is dark" aria-label="why"', `placeholder="${esc(w.chips[0].b)}" aria-label="${esc(w.aria[1])}"`, 'wb');

  if (info) {
    h = once(h, '<h2 data-ko="🗳️ 보너스 · 다음 이야기 투표" data-en="🗳️ Bonus · Vote for the next story">🗳️ 보너스 · 다음 이야기 투표</h2>',
      '<h2 data-ko="🗳️ 보너스 · 다음 글 투표" data-en="🗳️ Bonus · Vote for the next text">🗳️ 보너스 · 다음 글 투표</h2>', 'vote h2');
    h = once(h, '<p class="howto" data-ko="다음 이야기는 어떻게 시작하면 좋을까요? 재미로 하는 투표예요 (도장·포인트와는 상관없어요)." data-en="How should the next story begin? Just for fun (no stamps or points).">다음 이야기는 어떻게 시작하면 좋을까요? 재미로 하는 투표예요 (도장·포인트와는 상관없어요).</p>',
      '<p class="howto" data-ko="다음에는 어떤 내용을 더 읽고 싶나요? 재미로 하는 투표예요 (도장·포인트와는 상관없어요)." data-en="What would you like to read about next? Just for fun (no stamps or points).">다음에는 어떤 내용을 더 읽고 싶나요? 재미로 하는 투표예요 (도장·포인트와는 상관없어요).</p>', 'vote howto');
  }
  const noteKo = `이 ${what[0]}는 망고아이 «영어 독서» ${st.ko} 글입니다. 영어 독서 목록의 같은 글과 본문이 같고, 여기서는 그림책처럼 6가지 활동(읽고 듣기·핵심 문장·요점정리·낱말 게임·근거 찾기·바꿔 쓰기)으로 공부합니다.`;
  const noteEn = `This ${what[1]} is from Mangoi English Reading, ${st.en}. The text is the same as in the reading list; here you study it with 6 storybook activities.`;
  h = between(h, '  <p class="note rev" data-ko="원장님 의견 반영', '다음 편 투표는 보너스입니다.</p>', `  <p class="note rev" data-ko="${esc(noteKo)}" data-en="${esc(noteEn)}">${esc(noteKo)}</p>`, 'note rev');
  const picKo = art.photo ? '사진은 이 글을 위해 Higgsfield AI 로 새로 만든 실사 이미지입니다(실제 촬영 사진이 아닙니다).' : `삽화는 이 이야기를 위해 Higgsfield AI 로 새로 그린 ${art.ko} 화풍입니다.`;
  const picEn = art.photo ? 'The photo-style images were newly made for this text with Higgsfield AI (they are not real photographs).' : `The illustrations were newly made for this story with Higgsfield AI in the ${art.en} style.`;
  h = between(h, '  <p class="note" data-ko="이 이야기는 망고아이가 새로 쓴 오리지널입니다.', 'with Higgsfield AI.">이 이야기는 망고아이가 새로 쓴 오리지널입니다. 다른 교재·동화책의 문장, 캐릭터, 그림은 쓰지 않았습니다. 삽화는 Higgsfield AI 로 이 이야기를 위해 새로 그렸습니다.</p>',
    `  <p class="note" data-ko="${esc(picKo)}" data-en="${esc(picEn)}">${esc(picKo)}</p>`, 'note pic');

  // 정본(CORE)
  h = once(h, "STORY-CORE-START — 채점·판정 정본(DOM 없음). 하니스(story_books_harness)가", 'STORY-CORE-START — 채점·판정 정본(DOM 없음). 하니스(ladder_storybooks_harness)가', 'core harness');
  h = once(h, "var STORY_ID = 'birthday-cake';", `var STORY_ID = '${p.id}';`, 'STORY_ID');
  h = once(h, "var WRITE_SLOTS = ['cl','cl'];", `var WRITE_SLOTS = ${J(w.slots).replace(/"/g, "'")};`, 'slots');
  h = once(h, '// ⑥ 바꿔 쓰기 틀 — «I think ___ because ___.»', `// ⑥ 바꿔 쓰기 틀 — «${w.pre} ___${w.sep}${w.mid} ___.»`, 'pat comment');
  const preRe = '^' + wordsRe(w.pre) + '\\s+';
  const midRe = '^(?:,\\s*)?' + wordsRe(w.mid) + '\\s+';
  h = once(h, 'var WRITE_PAT = { pre: "I think", mid: "because", sep: " ", preRe: new RegExp("^i\\\\s+think\\\\s+", \'i\'), midRe: new RegExp("^because\\\\s+", \'i\') };',
    `var WRITE_PAT = { pre: ${J(w.pre)}, mid: ${J(w.mid)}, sep: ${J(w.sep)}, preRe: new RegExp(${J(preRe)}, 'i'), midRe: new RegExp(${J(midRe)}, 'i') };`, 'WRITE_PAT');

  // 데이터 블록
  const roleOf = (i) => (i === d.key.P ? 'P' : i === d.key.S ? 'S' : 'd');
  const paras = []; let k = 0;
  d.breaks.forEach((n) => { const par = []; for (let j = 0; j < n; j++, k++) par.push([S[k], roleOf(k)]); paras.push(par); });
  // 보기·근거 후보 순서를 글마다 정해진 씨앗으로 섞는다 — 데이터는 정답을 대개 첫 칸에 적어 두므로 그대로 내면 «A 만 찍어도» 맞습니다.
  // 한 권 안에서 정답 자리가 한 곳에 몰리면 씨앗을 바꿔 다시 섞습니다(같은 id 는 언제나 같은 순서).
  const { sumOpts, qsMixed } = mixChoices(p.id, d);
  const sumArr = d.sum.map((x, i) => (x.ans == null ? { pre: x.pre, ans: null } : { pre: x.pre, ans: x.ans, opts: sumOpts[i] }));
  const data = '  var STORY = [\n' + paras.map((par) => '    ' + J(par)).join(',\n') + '\n  ];\n' +
    '  var SUM = [\n' + sumArr.map((x) => '    ' + J(x)).join(',\n') + '\n  ];\n' +
    '  var WORDS = [\n' + d.words.map((x) => '    ' + J(x)).join(',\n') + '\n  ];\n' +
    '  // 근거 찾기: ans = 정답 보기 번호, ev = 근거 후보 중 정답 번호들\n' +
    '  var QS = [\n' + qsMixed.map((q) => '    ' + J({ type: q.type, q: q.q, qko: q.qko, opts: q.opts, ans: q.ans, evq: q.evq, evs: q.evs, ev: q.ev, why: q.why })).join(',\n') + '\n  ];\n\n' +
    '  var ENDS = [\n' + d.ends.map((x) => '    ' + J(x)).join(',\n') + '\n  ];';
  h = between(h, '  var STORY = [', "    [\"B\",\"Biscuit runs away with Grandma's new birthday hat.\",\"Biscuit 이 할머니의 새 생일 모자를 물고 도망가요.\",\"The Hat Thief\"]\n  ];", data, 'data block');
  const scenes = {};
  // 그림을 같은 이름으로 갈아 끼우면 브라우저가 옛 그림을 7일 들고 있다(미디어 Cache-Control) — 데이터의 img.ver[장면] 으로 ?v= 를 붙인다(2026-10-19 s4-37).
  const ver = d.img.ver || {};
  Object.keys(d.img.scenes).forEach((pi) => { scenes[pi] = [`img/story/${p.id}-s${pi}.webp` + (ver[pi] ? `?v=${ver[pi]}` : ''), esc(d.alt[pi])]; });
  h = between(h, '  var SCENES = {"4":["img/story/birthday-cake-s4.webp"', ']};', `  var SCENES = ${J(scenes)};`, 'SCENES');
  h = once(h, "이야기의 «문제» 와 «해결» 을 말하는 문장을 찾아 바꿔 고른 뒤", `${what[0]}의 «${rP.ko}» 와 «${rS.ko}» 을 말하는 문장을 찾아 바꿔 고른 뒤`, 'key retry ko');
  h = once(h, "Find the sentences that tell the problem and the solution, change your pick", `Find the sentences that tell the ${rP.en} and the ${rS.en}, change your pick`, 'key retry en');
  h = between(h, '    var why = t("핵심은 «생일 케이크가', 'The green sentences are the answers.");', `    var why = t(${J(d.keyWhy.ko)},\n                ${J(d.keyWhy.en)});`, 'keyWhy');
  h = once(h, `빨간 문장은 이야기의 «자세한 내용» 이에요. `, `빨간 문장은 ${what[0]}의 «자세한 내용» 이에요. `, 'red detail');
  h = between(h, '        (cw.more ? \'<p>\' + t("한 걸음 더:', '(e.g. because he is smiling)") + \'</p>\' : \'\')',
    `        (cw.more ? '<p>' + t(${J(w.moreKo)},${J(w.moreEn)}) + '</p>' : '')`, 'cw.more');
  h = between(h, '  var TUNE = {"name":"Party Kitchen"', '};', `  var TUNE = ${J(makeTune(p.id, p.stage))};`, 'TUNE');
  // 틀 흔적은 «틀 제목 전체» 로 본다 — 낱말 «Birthday» 하나로 보면 생일 이야기(s1-15·s3-17)를 틀 흔적으로 잘못 잡는다(2026-10-19).
  if (/Missing Birthday Cake|Biscuit|Grandma Rose|birthday-cake|Party Kitchen/.test(h)) throw new Error(p.id + ': 2권 흔적이 남음');
  return h;
}

if (process.argv[1] && process.argv[1].endsWith('build.mjs')) {
  const L = loadLadder();
  const tpl = readFileSync(TEMPLATE, 'utf8');
  const only = process.argv.slice(2);
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
  let n = 0, bad = 0;
  for (const id of files) {
    if (only.length && !only.includes(id)) continue;
    const p = L.passages.find((x) => x.id === id);
    const d = JSON.parse(readFileSync(join(DATA_DIR, id + '.json'), 'utf8'));
    const errs = validate(d, p);
    if (errs.length) { bad++; console.log('❌ ' + id + ' 데이터 오류 — 건너뜀\n   - ' + errs.join('\n   - ')); continue; }
    const no = L.passages.filter((x) => x.stage === p.stage).indexOf(p) + 1;
    writeFileSync(join(PUB, `story-${id}.html`), buildPage(tpl, p, d, no));
    n++;
  }
  console.log(`만든 페이지 ${n}개` + (bad ? ` · 데이터 오류 ${bad}개` : ''));
  if (bad) process.exit(1);
  const books = Object.fromEntries(files.map((id) => [id, JSON.parse(readFileSync(join(DATA_DIR, id + '.json'), 'utf8')).img.style]));
  const styles = Object.fromEntries(Object.entries(STYLES).map(([key, value]) => [key, {ko: value.ko, en: value.en, emoji: value.emoji}]));
  writeFileSync(join(PUB, 'js', 'reading-ladder-art.js'), '/* Generated from the picture-book style canon. */\nwindow.READING_LADDER_ART=' + J({books, styles}) + ';\n');
  const galleryData = Object.fromEntries(files.map(id => [id, JSON.parse(readFileSync(join(DATA_DIR, id + '.json'), 'utf8'))]));
  writeFileSync(join(PUB, 'story-cover-gallery.html'), buildGallery(L.passages, galleryData));
}
