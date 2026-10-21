/* 영어 독서 사다리 → 그림 동화책 데이터 검사. 사용: node scripts/ladder-storybooks/validate.mjs [id ...]
   인자가 없으면 data/ 안 전부. 실패가 하나라도 있으면 exit 1. 생성기(build.mjs)도 이 함수를 그대로 부릅니다. */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { styleFitsStage } from './styles.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
export const DATA_DIR = join(HERE, 'data');

export function loadLadder() {
  const src = readFileSync(join(ROOT, 'cloudflare-deploy', 'public', 'js', 'reading-ladder-data.js'), 'utf8');
  const win = {};
  new Function('window', src)(win);
  return win.READING_LADDER;
}

export const PATTERNS = [
  { pre: 'Let’s', mid: 'before', sep: ' ', slots: ['vp', 'cl'] },
  { pre: 'Let’s', mid: 'so that', sep: ' ', slots: ['vp', 'cl'] },
  { pre: 'I think', mid: 'because', sep: ' ', slots: ['cl', 'cl'] },
  { pre: 'I can’t', mid: 'but I can', sep: ', ', slots: ['vp', 'vp'] },
  { pre: 'I want to', mid: 'because', sep: ' ', slots: ['vp', 'cl'] },
  { pre: 'If', mid: 'we can', sep: ', ', slots: ['cl', 'vp'] },
  { pre: 'We should', mid: 'so that', sep: ' ', slots: ['vp', 'cl'] },
  { pre: 'It is important to', mid: 'because', sep: ' ', slots: ['vp', 'cl'] },
];

const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
const BAD = /[「」『』]/;
const isStr = (s) => typeof s === 'string' && s.trim().length > 0;
const en = (s) => isStr(s) && !HANGUL.test(s) && !BAD.test(s);
const ko = (s) => isStr(s) && HANGUL.test(s) && !BAD.test(s);

export function validate(d, p) {
  const errs = [];
  const E = (c, m) => { if (!c) errs.push(m); };
  if (!p) return ['사다리에 없는 id: ' + (d && d.id)];
  const S = p.sentences.map((x) => x.en);
  const n = S.length;
  E(Array.isArray(d.breaks) && d.breaks.every((x) => Number.isInteger(x) && x >= 1) && d.breaks.reduce((a, b) => a + b, 0) === n,
    `breaks 합이 문장 수 ${n} 과 같아야 함`);
  const paras = Array.isArray(d.breaks) ? d.breaks.length : 0;
  E(paras >= 3 && paras <= 5, '문단 3~5개');
  const k = d.key || {};
  E(Number.isInteger(k.P) && Number.isInteger(k.S) && k.P !== k.S && k.P >= 0 && k.S >= 0 && k.P < n && k.S < n, 'key.P/S 문장 번호');
  const rn = d.roleNames || {};
  E(rn.P && ko(rn.P.ko) && en(rn.P.en) && rn.S && ko(rn.S.ko) && en(rn.S.en), 'roleNames P/S ko·en');
  E(d.keyWhy && ko(d.keyWhy.ko) && en(d.keyWhy.en), 'keyWhy ko·en');
  E(Array.isArray(d.boxes) && d.boxes.length === 3 && d.boxes.every((b) => en(b.k) && ko(b.qko) && en(b.qen) && en(b.a)), 'boxes 3개');
  E(d.sumHowto && ko(d.sumHowto.ko) && en(d.sumHowto.en), 'sumHowto');
  const sum = d.sum || [];
  const blanks = sum.filter((x) => x.ans != null);
  E(blanks.length === 5 && sum.length === 6 && sum[5].ans == null && isStr(sum[5].pre), 'sum = 빈칸 5 + 꼬리 1');
  sum.forEach((x, i) => {
    E(typeof x.pre === 'string' && !HANGUL.test(x.pre), `sum[${i}].pre 영어`);
    if (x.ans != null) E(en(x.ans) && Array.isArray(x.opts) && x.opts.length === 3 && x.opts.includes(x.ans) && new Set(x.opts).size === 3 && x.opts.every(en), `sum[${i}] opts 3개(정답 포함, 중복 없음)`);
  });
  const W = d.words || [];
  E(W.length === 6, 'words 6개');
  const seenW = new Set();
  W.forEach((w, i) => {
    E(Array.isArray(w) && w.length === 4 && en(w[0]) && ko(w[1]) && en(w[2]) && en(w[3]), `words[${i}] 모양`);
    if (Array.isArray(w)) { E(/<b>[^<]+<\/b>/.test(w[2] || ''), `words[${i}] 예문에 <b>`); E(!seenW.has(w[0]), `words[${i}] 중복`); seenW.add(w[0]); }
  });
  const Q = d.qs || [];
  const TYPES = ['원인·결과', '문맥상 의미', '단서 연결'];
  E(Q.length === 3, 'qs 3문항');
  Q.forEach((q, i) => {
    const tag = `qs[${i}]`;
    E(Array.isArray(q.type) && q.type[0] === TYPES[i], `${tag}.type 순서 ${TYPES[i]}`);
    E(en(q.q) && ko(q.qko), `${tag} q/qko`);
    E(Array.isArray(q.opts) && q.opts.length === 3 && q.opts.every(en) && new Set(q.opts).size === 3, `${tag}.opts 3개`);
    E(Number.isInteger(q.ans) && q.ans >= 0 && q.ans < 3, `${tag}.ans`);
    E(Array.isArray(q.evs) && q.evs.length === 4 && new Set(q.evs).size === 4, `${tag}.evs 4개`);
    (q.evs || []).forEach((s, j) => E(S.includes(s), `${tag}.evs[${j}] 본문에 글자 그대로 없음: ${s}`));
    E(Array.isArray(q.ev) && q.ev.length >= 1 && q.ev.length <= 2 && q.ev.every((x) => Number.isInteger(x) && x >= 0 && x < 4) && new Set(q.ev).size === q.ev.length, `${tag}.ev`);
    E(Array.isArray(q.evq) && q.evq.length === 2 && ko(q.evq[0]) && en(q.evq[1]) && q.evq[0].includes(String(q.ev ? q.ev.length : 0)), `${tag}.evq 개수 문구`);
    E(Array.isArray(q.why) && ko(q.why[0]) && en(q.why[1]), `${tag}.why`);
  });
  E(Q[2] && Q[2].ev && Q[2].ev.length === 2, 'qs[2](단서 연결)은 근거 2개');
  const ends = d.ends || [];
  E(ends.length === 2 && ends[0][0] === 'A' && ends[1][0] === 'B' && ends.every((e) => en(e[1]) && ko(e[2]) && en(e[3])), 'ends 2개');
  const w = d.write || {};
  const pat = PATTERNS.find((x) => x.pre === w.pre && x.mid === w.mid && x.sep === w.sep && JSON.stringify(x.slots) === JSON.stringify(w.slots));
  E(!!pat, 'write: 허용 틀이 아님');
  if (pat) {
    const src = String(w.src || '');
    const m = src.match(/^“(.*)”$/);
    E(!!m && (src.match(/<u>/g) || []).length === 2, 'write.src “…” 와 <u> 2개');
    if (m) {
      const plain = m[1].replace(/<\/?u>/g, '');
      E(plain.startsWith(w.pre + ' '), 'write.src 가 pre 로 시작');
      E(plain.includes(w.sep + w.mid + ' '), 'write.src 에 sep+mid');
    }
  }
  E(Array.isArray(w.slotKo) && w.slotKo.length === 2 && w.slotKo.every(ko) && Array.isArray(w.slotEn) && w.slotEn.length === 2 && w.slotEn.every(en), 'write.slotKo/En');
  E(ko(w.howtoKo) && en(w.howtoEn) && ko(w.moreKo) && en(w.moreEn), 'write howto/more');
  E(Array.isArray(w.chips) && w.chips.length === 3 && w.chips.every((c) => en(c.a) && en(c.b) && en(c.label) && !/[.!?]$/.test(c.a) && !/[.!?]$/.test(c.b)), 'write.chips 3개(끝 마침표 없이)');
  E(Array.isArray(w.aria) && w.aria.length === 2 && w.aria.every(en), 'write.aria');
  const img = d.img || {};
  E(styleFitsStage(img.style, p.stage), 'img.style 화풍이 연령 단계에 맞아야 함');
  const keys = Object.keys(img.scenes || {});
  E(en(img.cover) && keys.length === 2 && keys.every((x) => /^\d+$/.test(x) && +x >= 1 && +x < paras) && keys.every((x) => en(img.scenes[x])), 'img cover + 장면 2(문단 1..끝)');
  const alt = d.alt || {};
  E(en(alt.cover) && keys.every((x) => en(alt[x])), 'alt');
  return errs;
}

if (process.argv[1] && process.argv[1].endsWith('validate.mjs')) {
  const L = loadLadder();
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(DATA_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
  let bad = 0;
  for (const id of ids) {
    const f = join(DATA_DIR, id + '.json');
    if (!existsSync(f)) { console.log('❌ ' + id + ' 파일 없음'); bad++; continue; }
    let d; try { d = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { console.log('❌ ' + id + ' JSON 오류 ' + e.message); bad++; continue; }
    const errs = validate(d, L.passages.find((p) => p.id === id));
    if (d.id !== id) errs.push('id 칸이 파일 이름과 다름');
    if (errs.length) { bad++; console.log('❌ ' + id + '\n   - ' + errs.join('\n   - ')); } else console.log('✅ ' + id);
  }
  console.log(`결과: ${ids.length - bad} / ${ids.length} PASS`);
  process.exit(bad ? 1 : 0);
}
