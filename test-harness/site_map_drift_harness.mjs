/**
 * site_map_drift_harness.mjs
 * ── "사이트 지도가 실제 사이트와 어긋나지 않았다" 회귀 감시 ──
 *
 * 왜 필요한가:
 *   /admin/site-structure-map.html 은 손으로 적은 그림이다. 메뉴가 바뀌었는데 지도는
 *   안 바뀌면 아무도 모른 채 남는다. **틀린 지도는 없는 지도보다 나쁘다** — 없으면
 *   물어보기라도 하는데, 틀린 지도는 사람을 없는 화면으로 보낸다.
 *
 *   원래 계획은 «지도를 코드에서 자동 생성» 이었는데, 다섯 갈래로 나누고 «둘러보기 /
 *   시작하기 / 물어보기» 로 묶는 일은 기계가 못 하는 판단이다(그래서 이 지도가 값어치가
 *   있다). 자동 생성 대신 **틀어졌을 때 잡는 쪽**으로 갔다. 값의 대부분을 훨씬 싸게 얻는다.
 *
 * 무엇을 보는가:
 *   ① 지도가 링크한 /...html 이 실제로 있는가            (죽은 링크 = 사람을 404 로 보냄)
 *   ② 「주소 보기」에 적힌 파일 경로가 실제로 있는가       (설명이 거짓말이 됨)
 *   ③ 머리에 적힌 숫자가 실제 칸 수와 맞는가              (11 이라 써 놓고 9칸)
 *   ④ 묶음 숫자(.gn)가 그 묶음의 칸 수와 맞는가
 *   ⑤ adm-ia6.js 가 여는 관리자 페이지가 실제로 있는가    (사이드바 쪽 죽은 링크)
 *   ⑥ 목차(site-structure.html)가 지도로 넘기고, 지도에 표 3장 선반이 있는가
 *      — 목차를 문만 남기고 접었으므로, 두 짝이 어긋나면 표 3장이 «아무 데서도» 안 열린다
 *
 * 실행: node test-harness/site_map_drift_harness.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'cloudflare-deploy', 'public');
const MAP = join(PUBLIC, 'admin', 'site-structure-map.html');
const HUB = join(PUBLIC, 'admin', 'site-structure.html');
const IA6 = join(PUBLIC, 'js', 'adm-ia6.js');

let pass = 0;
const fails = [];
const ok = (m) => { pass++; console.log('  ✅ ' + m); };
const bad = (m) => { fails.push(m); console.log('  ❌ ' + m); };

console.log('\n════════ 사이트 지도 어긋남 감시 ════════');

if (!existsSync(MAP)) {
  console.log('  ❌ 지도 파일이 없다: ' + MAP);
  process.exit(1);
}
const map = readFileSync(MAP, 'utf8');

/* 실서비스에 파일이 없는 «가짜 경로» 는 여기 적어 둔다.
   앵커(#), 바깥 주소, 폴더, 여러 파일에 걸친 설명은 검사 대상이 아니다. */
const NOT_A_FILE = /^(https?:|mailto:|#|pf\.kakao\.com)/;

function fileFor(p) {
  let path = p.split('#')[0].split('?')[0].trim();
  if (!path.startsWith('/')) return null;
  if (path.endsWith('/')) path += 'index.html';
  return join(PUBLIC, path.replace(/^\//, ''));
}

/* ── ① 지도의 링크 ─────────────────────────────────────────────────────── */
{
  const hrefs = [...map.matchAll(/<a\s[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  const checked = hrefs.filter((h) => !NOT_A_FILE.test(h) && h.startsWith('/'));
  const dead = [];
  for (const h of checked) {
    const f = fileFor(h);
    if (f && !existsSync(f)) dead.push(h);
  }
  if (dead.length) bad(`지도의 링크 ${dead.length}개가 없는 파일을 가리킨다 — ${dead.join(', ')}`);
  else ok(`지도의 링크 ${checked.length}개 모두 실제 파일 (죽은 링크 0)`);
}

/* ── ② 「주소 보기」에 적힌 경로 ────────────────────────────────────────── */
{
  const paths = [...map.matchAll(/<span class="p">([^<]+)<\/span>/g)].map((m) => m[1].trim());
  const dead = [];
  let checked = 0;
  for (const raw of paths) {
    // «/index.html #teachers», «/index.html + /video-call/» 같은 설명형은 건너뛴다
    if (/[ +]/.test(raw) || NOT_A_FILE.test(raw) || !raw.startsWith('/')) continue;
    checked++;
    const f = fileFor(raw);
    if (f && !existsSync(f)) dead.push(raw);
  }
  if (dead.length) bad(`「주소 보기」의 경로 ${dead.length}개가 없는 파일 — ${dead.join(', ')}`);
  else ok(`「주소 보기」의 단일 경로 ${checked}개 모두 실제 파일`);
}

/* ── ③④ 머리 숫자 · 묶음 숫자 ──────────────────────────────────────────── */
{
  // 갈래 하나씩 잘라 센다. 정규식 하나로 중첩 div 를 세려 들면 반드시 틀린다.
  const laneStarts = [...map.matchAll(/<div class="lane" data-lane="(\d+)"/g)];
  const wrongLane = [];
  const wrongGroup = [];
  let laneCount = 0;
  let groupCount = 0;

  for (let i = 0; i < laneStarts.length; i++) {
    const from = laneStarts[i].index;
    const to = i + 1 < laneStarts.length ? laneStarts[i + 1].index : map.indexOf('</div><!-- /lanes -->');
    const blk = map.slice(from, to);
    laneCount++;

    const name = (/<span class="t">([^<]*)/.exec(blk) || [, '?'])[1].trim();
    const declared = Number((/<span class="n">(\d+)<\/span>/.exec(blk) || [, NaN])[1]);
    const actual = (blk.match(/<li class="leaf">/g) || []).length;
    if (declared !== actual) wrongLane.push(`${name}: ${declared} 이라 적혀 있지만 실제 ${actual}칸`);

    // 묶음: group-t 마다 다음 </ul> 까지가 그 묶음이다
    const gs = [...blk.matchAll(/<div class="group-t">([^<]*)<span class="gn">(\d+)<\/span>/g)];
    for (let k = 0; k < gs.length; k++) {
      groupCount++;
      const gFrom = gs[k].index;
      const gTo = blk.indexOf('</ul>', gFrom);
      const seg = blk.slice(gFrom, gTo < 0 ? blk.length : gTo);
      const n = (seg.match(/<li class="leaf">/g) || []).length;
      if (Number(gs[k][2]) !== n) {
        wrongGroup.push(`${name} ▸ ${gs[k][1].trim()}: ${gs[k][2]} 이라 적혀 있지만 실제 ${n}칸`);
      }
    }
  }

  if (laneCount !== 5) bad(`갈래가 5개가 아니다 (${laneCount}개)`);
  else ok('갈래 5개 (손님 · 학생 · 부모님 · 선생님 · 운영자)');

  if (wrongLane.length) bad('갈래 머리 숫자가 안 맞는다 — ' + wrongLane.join(' / '));
  else ok(`갈래 머리 숫자 ${laneCount}개 모두 실제 칸 수와 일치`);

  if (wrongGroup.length) bad('묶음 숫자가 안 맞는다 — ' + wrongGroup.join(' / '));
  else ok(`묶음 숫자 ${groupCount}개 모두 실제 칸 수와 일치`);
}

/* ── ⑤ adm-ia6.js 가 여는 관리자 페이지 ─────────────────────────────────── */
if (existsSync(IA6)) {
  const ia6 = readFileSync(IA6, 'utf8');
  /* 항목의 href/capiHref + 「메뉴 지도」가 여는 MAP_HREF.
     ⚠️ MAP_HREF 를 꼭 넣어야 한다 — 2026-08-16 에 「시스템 ▸ 사이트 구조도」를 빼면서
        지도를 가리키는 «항목» 이 없어졌다. 이제 지도로 가는 유일한 길이 MAP_HREF 이므로,
        이것이 죽으면 지도를 여는 방법이 아예 사라진다. */
  const targets = [...ia6.matchAll(/(?:href|capiHref):\s*'(\/[^']+)'/g)].map((m) => m[1]);
  const mapHref = (/var MAP_HREF = '([^']+)'/.exec(ia6) || [])[1];
  if (!mapHref) bad('adm-ia6.js 에서 MAP_HREF 를 못 찾았다 — 「메뉴 지도」가 무엇을 여는지 확인 불가');
  else targets.push(mapHref);
  const uniq = [...new Set(targets)];
  const dead = uniq.filter((p) => {
    const f = fileFor(p);
    return f && !existsSync(f);
  });
  if (dead.length) bad(`사이드바가 없는 페이지로 보낸다 — ${dead.join(', ')}`);
  else ok(`사이드바가 여는 페이지 ${uniq.length}개 모두 실제 파일`);
} else {
  bad('adm-ia6.js 가 없다 — 사이드바 링크를 검사하지 못했다');
}

/* ── ⑥ 목차 접기와 지도 선반이 짝이 맞는가 ──────────────────────────────── */
{
  const shelf = ['site-structure-admin.html', 'site-structure-student.html', 'site-structure-more.html'];
  const missing = shelf.filter((f) => !map.includes(f));
  if (missing.length) {
    bad(`지도에 «더 자세히» 선반이 없다 — 표가 아무 데서도 안 열린다: ${missing.join(', ')}`);
  } else {
    const deadDocs = shelf.filter((f) => !existsSync(join(PUBLIC, 'admin', f)));
    if (deadDocs.length) bad(`선반이 없는 문서를 가리킨다 — ${deadDocs.join(', ')}`);
    else ok('지도 아래 «더 자세히» 선반에 표 3장이 모두 걸려 있고 파일도 있다');
  }

  if (!existsSync(HUB)) {
    bad('목차 파일(site-structure.html)이 없다 — 옛 링크가 404 가 된다');
  } else {
    const hub = readFileSync(HUB, 'utf8');
    if (!hub.includes("location.replace('/admin/site-structure-map.html')")) {
      bad('목차가 지도로 넘기지 않는다 — 접은 화면이 그대로 보인다');
    } else if (!hub.includes('hub=1')) {
      bad('목차에 ?hub=1 되돌림 장치가 없다 — 옛 화면을 확인할 방법이 사라진다');
    } else {
      ok('목차는 지도로 넘긴다 (?hub=1 로 옛 화면 확인 가능)');
    }
  }
}

/* ── 마무리 ────────────────────────────────────────────────────────────── */
console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${pass} · 실패 ${fails.length}`);
console.log('─────────────────────────────────────────────\n');
if (fails.length) {
  console.log('지도가 실제 사이트와 어긋났습니다. 위 항목을 고치거나 지도를 갱신하세요.');
  process.exit(1);
}
