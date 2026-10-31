// -*- coding: utf-8 -*-
// 🗺 「관리자 메뉴 구성표」가 실제 사이드바와 어긋나지 않는지 감시 (2026-08-18)
//   실행: node test-harness/admin_site_structure_sync_harness.mjs
//
//   배경 —
//     public/admin/site-structure-admin.html 은 사이드바를 표로 펼쳐 놓은 문서다.
//     스스로 「메뉴 코드에서 자동으로 뽑습니다」라고 적어 두었지만 **실제로는 손으로 옮겨 적은
//     스냅샷**이라, 메뉴가 바뀌어도 따라가지 않는다.
//     2026-08-18 에 실제로 이렇게 어긋나 있었다 —
//       · 「6묶음 40메뉴」로 적혀 있었는데 실제는 7묶음 43메뉴
//       · 없어진 「조직 (지사·대리점)」이 남아 있고, 새로 난 「본사 관리」가 없었다
//       · card-teacher-contact 처럼 «카드 id 가 그대로 이름 자리에» 노출된 줄이 있었다
//     문서가 틀리면 사람이 그 문서를 믿고 엉뚱한 메뉴를 찾아다닌다. 그래서 감시한다.
//
//   무엇을 지키나 —
//     ① 구성표의 «묶음 이름»이 adm-ia6.js 의 GROUPS 와 같은가 (개수·이름·순서)
//     ② 구성표의 «메뉴 이름»이 GROUPS 의 items 와 같은가 (묶음별로)
//     ③ 화면에 적힌 개수(대분류/중분류)가 실제와 맞는가
//     ④ 이름 자리에 카드 id 가 그대로 새어 나오지 않았는가 (card-… 로 시작하는 이름 금지)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const doc = rd('../cloudflare-deploy/public/admin/site-structure-admin.html');
const ia6 = rd('../cloudflare-deploy/public/js/adm-ia6.js');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, cond) => {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
};

console.log('\n════════ 관리자 메뉴 구성표 ↔ 사이드바 대조 ════════');

check('site-structure-admin.html 을 읽었다', doc.length > 0);
check('adm-ia6.js 를 읽었다', ia6.length > 0);

/* ── 실제 메뉴(정본) — adm-ia6.js 의 GROUPS ───────────────────────────── */
function readGroups(src) {
  const i = src.indexOf('var GROUPS = [');
  const j = src.indexOf('\n  ];', i);
  if (i < 0 || j < 0) return null;
  let body = src.slice(i + 'var GROUPS = '.length, j + 4);
  body = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  try { return eval(body); } catch { return null; }
}
/* ── 문서 — DATA 배열 ─────────────────────────────────────────────────── */
function readData(src) {
  const i = src.indexOf('var DATA = [');
  const j = src.indexOf('\n];', i);
  if (i < 0 || j < 0) return null;
  try { return eval(src.slice(i + 'var DATA = '.length, j + 2)); } catch { return null; }
}

const G = readGroups(ia6);
const D = readData(doc);
check('adm-ia6.js 의 GROUPS 를 파싱했다', Array.isArray(G) && G.length > 0);
check('구성표의 DATA 를 파싱했다', Array.isArray(D) && D.length > 0);

if (Array.isArray(G) && Array.isArray(D)) {
  console.log('\n[ ① 묶음(그룹)이 같은가 ]');
  const gKo = G.map((g) => g.ko);
  const dKo = D.map((g) => g.t);
  check(`묶음 개수가 같다 (메뉴 ${gKo.length} · 구성표 ${dKo.length})`, gKo.length === dKo.length);
  const gone = gKo.filter((x) => !dKo.includes(x));
  const extra = dKo.filter((x) => !gKo.includes(x));
  check(`구성표에 빠진 묶음이 없다${gone.length ? ' — ' + gone.join(', ') : ''}`, gone.length === 0);
  check(`구성표에만 있는 묶음이 없다${extra.length ? ' — ' + extra.join(', ') : ''}`, extra.length === 0);
  check('묶음 순서가 같다', JSON.stringify(gKo) === JSON.stringify(dKo));

  console.log('\n[ ② 메뉴(항목)가 같은가 ]');
  let mismatch = [];
  for (const g of G) {
    const d = D.find((x) => x.t === g.ko);
    if (!d) continue;
    const a = g.items.map((it) => it.ko);
    const b = d.k.map((k) => k.t);
    const miss = a.filter((x) => !b.includes(x));
    const only = b.filter((x) => !a.includes(x));
    if (miss.length || only.length) {
      mismatch.push(`${g.ko}${miss.length ? ' 빠짐:' + miss.join('·') : ''}${only.length ? ' 남음:' + only.join('·') : ''}`);
    }
  }
  check(`묶음마다 메뉴 목록이 같다${mismatch.length ? ' — ' + mismatch.join(' / ') : ''}`, mismatch.length === 0);

  console.log('\n[ ③ 화면에 적힌 개수가 맞는가 ]');
  const itemCount = G.reduce((n, g) => n + g.items.length, 0);
  const numAt = (label) => {
    const m = new RegExp('<b class="num">(\\d+)</b><span>' + label).exec(doc);
    return m ? Number(m[1]) : -1;
  };
  check(`대분류 숫자 = ${G.length}`, numAt('대분류') === G.length);
  check(`중분류 숫자 = ${itemCount}`, numAt('중분류') === itemCount);

  console.log('\n[ ④ 카드 id 가 이름 자리에 새지 않았는가 ]');
  /* 「card-teacher-contact」처럼 카드 제목을 못 뽑아 id 를 그대로 적어 두면,
     읽는 사람은 그게 무슨 메뉴인지 알 수 없다. 그 줄은 화면에서도 이름이 없다는 뜻이다. */
  const leaked = [];
  D.forEach((g) => g.k.forEach((k) => (k.g || []).forEach((x) => {
    if (/^card-/.test(String(x.t || ''))) leaked.push(`${g.t} > ${k.t} > ${x.t}`);
  })));
  check(`이름 자리에 카드 id 가 없다${leaked.length ? ' — ' + leaked.join(', ') : ''}`, leaked.length === 0);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ⑤~⑦ 사이트 지도(site-structure-map.html) 도 같이 감시한다.
   구성표(위)는 «사이드바 안 메뉴», 지도는 «별도 페이지 URL» 로 서로 다른 문서인데,
   둘 다 손으로 옮겨 적은 것이라 똑같이 낡는다.
   2026-08-18 실측: 지도에 없는 페이지가 14개 있었다 — 그중 /admin/sales-hr(영업 실적·인사평가),
   /sales.html(영업 현장), /work.html(결재함)은 그 며칠 사이에 새로 만든 화면이었다.
   ═══════════════════════════════════════════════════════════════════════════ */
{
  const fs = await import('node:fs');
  const pub = resolve(__dir, '../cloudflare-deploy/public');
  const map = rd('../cloudflare-deploy/public/admin/site-structure-map.html');

  console.log('\n[ ⑤ 지도에 적힌 숫자가 실제 칸 수와 맞는가 ]');
  const lanes = [...map.matchAll(/<div class="lane" data-lane="(\d)"[\s\S]*?<span class="t">([\s\S]*?)<\/span>\s*<span class="n">(\d+)<\/span>([\s\S]*?)(?=<div class="lane" data-lane=|<\/div><!-- \/lanes -->)/g)];
  check(`갈래(lane) 5개를 찾았다 (${lanes.length})`, lanes.length === 5);
  const laneBad = [], groupBad = [];
  let leafTotal = 0;
  for (const m of lanes) {
    const name = m[2].replace(/<br>/g, ' ').replace(/\s+/g, ' ').trim();
    const claimed = Number(m[3]);
    const n = (m[4].match(/<li class="leaf"/g) || []).length;
    leafTotal += n;
    if (claimed !== n) laneBad.push(`${name} 적힌 ${claimed}/실제 ${n}`);
    for (const g of m[4].matchAll(/<div class="group-t">([^<]*)<span class="gn">(\d+)<\/span><\/div>([\s\S]*?)<\/ul>/g)) {
      const gc = Number(g[2]);
      const gk = (g[3].match(/<li class="leaf"/g) || []).length;
      if (gc !== gk) groupBad.push(`${name} ▸ ${g[1].trim()} 적힌 ${gc}/실제 ${gk}`);
    }
  }
  check(`갈래 숫자가 맞다${laneBad.length ? ' — ' + laneBad.join(', ') : ''}`, laneBad.length === 0);
  check(`묶음 숫자가 맞다${groupBad.length ? ' — ' + groupBad.join(', ') : ''}`, groupBad.length === 0);

  console.log('\n[ ⑥ 지도가 가리키는 페이지가 실제로 있는가 ]');
  const hrefs = [...new Set([...map.matchAll(/<li class="leaf"><a href="([^"]+)"/g)].map((m) => m[1]))]
    .filter((h) => h.startsWith('/'));
  const dead = hrefs.filter((h) => !fs.existsSync(pub + h.split('#')[0].split('?')[0]));
  check(`죽은 링크가 없다 (내부 링크 ${hrefs.length}개)${dead.length ? ' — ' + dead.join(', ') : ''}`, dead.length === 0);

  console.log('\n[ ⑦ 새로 만든 화면이 지도에서 빠지지 않았는가 ]');
  /* 화면을 새로 만들고 지도에 안 넣으면 «있는데 아무도 모르는 화면» 이 된다.
     ⛔ 여기 ALLOW 에 넣어 통과시키는 것은 «지도에 낼 화면이 아니다» 라고 판단했을 때만.
        판단 근거를 한 줄 적어 두세요 — 다음 사람이 다시 고민하지 않게. */
  const ALLOW = new Set([
    'admin/mobile-nav-v2-demo.html',   // 사이드바 시안(샘플) — 실서비스 화면이 아니다
    /* 로고 시안 미리보기 — 위 «사이드바 시안» 과 같은 부류다. /css/mango-logo.css 를 눈으로
       확인하려고 만든 견본 화면이라 사이트 지도에 낼 서비스 화면이 아니다 (2026-08-22) */
    'mango-logo-preview.html',
    /* 중국어 «남자 목소리 굵기» 견본 — 위 «로고 시안» 과 같은 부류다. 사장님이 A~D 를
       직접 들어 보고 고르시라고 만든 화면이라 사이트 지도에 낼 서비스 화면이 아니다.
       고르신 값을 warmup.html 의 ZH_MALE_PITCH 에 넣고 나면 지워도 된다 (2026-09-14) */
    'zh-voice-sample.html',
    /* 아래 셋은 «화상 연결 진단·시제품» 이다. 어디서도 링크되지 않고 API 호출이 하나도 없다
       (video-call 은 11KB 에 raw WebSocket 한 줄뿐). 실서비스 수업 입장은 index.html 안이다. */
    'signaling/index.html',
    'turn-relay/index.html',
    'video-call/index.html',
  ]);
  const docs = ['map', 'admin', 'student', 'more', ''].map((k) =>
    rd(`../cloudflare-deploy/public/admin/site-structure${k ? '-' + k : ''}.html`)).join('\n');
  const skip = /^(site-structure|_)/;
  const walk = (d, base = '', out = []) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'fonts' || e.name === 'img') continue;
      const rel = base ? base + '/' + e.name : e.name;
      if (e.isDirectory()) { if (base) continue; walk(d + '/' + e.name, e.name, out); }
      else if (e.name.endsWith('.html') && !skip.test(e.name)) out.push(rel);
    }
    return out;
  };
  const missing = walk(pub).filter((rel) => {
    if (ALLOW.has(rel)) return false;
    /* 같은 화면을 가리키는 주소가 세 가지다 — 셋 다 «적혀 있다» 로 친다.
       /docs/index.html · /docs/index · /docs/   (폴더 주소로 링크하는 것이 보통이다) */
    const forms = ['/' + rel, '/' + rel.replace(/\.html$/, '')];
    if (rel.endsWith('/index.html')) forms.push('/' + rel.replace(/index\.html$/, ''));
    return !forms.some((f) => docs.includes(f));
  });
  check(`구성표 어디에도 없는 화면이 없다${missing.length ? ` (${missing.length}개) — ` + missing.join(', ') : ''}`,
    missing.length === 0);
  console.log(`     (지도 칸 ${leafTotal}개 · 화면 ${walk(pub).length}개를 대조했습니다)`);
}

console.log(`\n─────────────────────────────────────────────`);
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) {
  console.log('  실패 항목:');
  FAILS.forEach((f) => console.log('   · ' + f));
  console.log('\n  👉 고치는 법 — 손으로 맞추지 말고 «메뉴에서 다시 뽑으세요».');
  console.log('     사이드바를 브라우저로 열어(로컬 서버 필수 — file:// 은 스크립트가 안 돕니다)');
  console.log('     .ph85-group[data-ia6] 를 훑어 DATA 를 새로 만든 뒤 그 자리에 넣습니다.');
}
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
