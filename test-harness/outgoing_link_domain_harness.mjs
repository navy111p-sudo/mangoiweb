// -*- coding: utf-8 -*-
/*
 * 🔗 사람에게 나가는 링크의 도메인 감시 (2026-08-17)
 *   실행: node test-harness/outgoing_link_domain_harness.mjs
 *
 * [왜 만들었나]
 *   학부모 문자·알림톡·레벨테스트 티켓·재등록 안내가 **각자 주소를 손으로 적고 있었다.**
 *   그래서 두 가지가 실제로 일어났다:
 *     ① 2026-08-09 — CLAUDE.md 머리에 적힌 `mango-i.com` 을 그대로 베껴 학부모 문자에
 *        **등록조차 안 된 도메인**(NXDOMAIN)이 들어갈 뻔했다.
 *     ② 2026-08-17 — 사장님이 쓰는 주소는 `mangoi.ai` 인데 안내는 `test.mangoi.co.kr` 로
 *        나가, 「어디에도 안 보인다」는 지적이 나왔다.
 *   이제 주소는 `src/site-url.ts` 한 곳에서만 온다. 이 하네스는 **다시 흩어지는 것**을 막는다.
 *
 * [무엇을 보는가]
 *   · 정본 주소가 mangoi.ai 인가
 *   · 문자를 보내는 모듈들이 URL 을 손으로 적지 않고 siteUrl()/SITE_ORIGIN 을 쓰는가
 *   · 죽은 도메인(mango-i.com)·구 서버(www.mangoi.co.kr)가 링크로 들어가지 않았는가
 *   · AI 명령의 화이트리스트와 프롬프트 예시가 **서로 어긋나지 않는가**
 *     (어긋나면 링크가 조용히 버려져 «눌러도 아무 일 없음» 이 된다)
 *
 * [일부러 안 보는 것]
 *   주석 안의 도메인 이름, 그리고 앱 시작 URL·스모크 테스트·워치독처럼 `test.mangoi.co.kr`
 *   을 **의도적으로** 붙박이로 쓰는 자리. 그건 앱 서명·assetlinks 까지 걸리는 별건이다.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = (p) => {
  try { return readFileSync(resolve(__dir, '../cloudflare-deploy/src/' + p), 'utf8'); }
  catch { return ''; }
};

let PASS = 0, FAIL = 0;
const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ' — ' + extra : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond || !extra ? '' : ' — ' + extra}`);
}

/**
 * 주석을 걷어낸 «실제 코드» 만 남긴다 — 주석에 적힌 도메인 이름 때문에 멀쩡한 코드가 빨개지면 안 된다.
 * (deploy_live_drift_gate_harness 가 정확히 그 함정에 한 번 걸렸다)
 *
 * 🪤 정규식 `/\*[\s\S]*?\*\//g` 로 통째로 지우면 안 된다. 이 저장소의 헤더 주석은
 *    `/*` 다음 줄부터 `//` 로 이어지는 모양이라, 그 뒤에 나오는 줄끝 주석과 짝이 어긋나면
 *    **import 줄까지 통째로 먹어치운다**(실제로 api-approval.ts 가 그렇게 사라졌다).
 *    그래서 줄 단위로, 블록 주석 깊이를 세면서 지운다.
 */
function codeOnly(s) {
  let inBlock = false;
  return String(s).split('\n').map((line) => {
    let out = '', i = 0;
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf('*/', i);
        if (end < 0) { i = line.length; break; }
        inBlock = false; i = end + 2; continue;
      }
      const bs = line.indexOf('/*', i);
      // 줄끝 주석 — `https://` 의 `//` 는 앞 글자가 ':' 라 주석이 아니다
      let ls = -1;
      for (let k = i; k < line.length - 1; k++) {
        if (line[k] === '/' && line[k + 1] === '/' && line[k - 1] !== ':') { ls = k; break; }
      }
      if (ls >= 0 && (bs < 0 || ls < bs)) { out += line.slice(i, ls); i = line.length; break; }
      if (bs >= 0) { out += line.slice(i, bs); i = bs + 2; inBlock = true; continue; }
      out += line.slice(i); i = line.length;
    }
    return out;
  }).join('\n');
}

// ── ① 정본 ────────────────────────────────────────────────
console.log('\n[ ① 정본 주소는 한 곳에서만 정한다 ]');
const site = SRC('site-url.ts');
check('site-url.ts 가 있다', site.length > 0);
check('정본 주소가 mangoi.ai 다',
  /export const SITE_ORIGIN\s*=\s*'https:\/\/mangoi\.ai'/.test(site));
check('siteUrl() 을 내보낸다', /export function siteUrl\s*\(/.test(site));
check('siteBase() 는 PUBLIC_BASE_URL 로 덮어쓸 수 있다',
  /PUBLIC_BASE_URL/.test(site) && /export function siteBase\s*\(/.test(site));
check('SITE_HOSTS 에 정본 + 아직 살아 있는 옛 주소가 함께 들어간다 (화이트리스트용)',
  /export const SITE_HOSTS/.test(site) && /LEGACY_ORIGINS/.test(site));
check('⛔ 정본에 죽은 도메인(mango-i.com)을 쓰지 않는다',
  !/SITE_ORIGIN[^\n]*mango-i\.com/.test(site));

// ── ② 문자를 보내는 모듈들 ────────────────────────────────
console.log('\n[ ② 문자·알림톡을 보내는 모듈은 주소를 손으로 적지 않는다 ]');
/* 각 항목: [파일, 사람이 읽는 이름, 이 모듈이 반드시 참조해야 하는 심볼] */
const SENDERS = [
  ['api-lessons.ts',     '수업 평가서 → 학부모',      /siteUrl\s*\(/],
  ['lesson-reminder.ts', '수업 시작 알림 → 학부모',   /siteUrl\s*\(/],
  ['absent-sweep.ts',    '미입장 알림 → 학부모',      /siteUrl\s*\(/],
  ['enroll-ops.ts',      '재등록 안내 → 학부모',      /siteUrl\s*\(/],
  ['api-retention.ts',   '이탈 방지 안내 → 학부모',   /SITE_ORIGIN/],
  ['leveltest-ticket.ts','레벨테스트 티켓 → 신청자',  /siteBase\s*\(/],
  ['api-approval.ts',    '결재 알림 → 직원',          /siteUrl\s*\(/],
  ['ai-command.ts',      'AI 명령 새 탭 링크',        /siteUrl\s*\(/],
  ['api-uptime.ts',      '장애 알림 → 관리자',        /SITE_HOSTS/],
  /* (2026-08-18) 미연장 안내 문자에 연장·결제 링크가 들어가면서 이 파일도 «학부모에게
     주소를 내보내는 모듈» 이 됐다. 감시 목록에 없으면 여기만 workers.dev 로 되돌아가도
     아무도 못 잡는다 — 실제로 B2B 독촉의 #{결제URL} 이 그 상태였다. */
  ['solapi-client.ts',   '미연장·미납 안내 → 학부모', /siteUrl\s*\(/],
];

for (const [file, label, needs] of SENDERS) {
  const raw = SRC(file);
  const code = codeOnly(raw);
  check(`${label} (${file}) — site-url 을 가져온다`,
    /from '\.\/site-url'/.test(code), '가져오는 줄이 없다');
  check(`${label} — 주소를 손으로 적지 않는다`,
    needs.test(code), '기대: ' + needs);
  check(`${label} — 코드에 test.mangoi.co.kr 이 남아 있지 않다`,
    !/test\.mangoi\.co\.kr/.test(code));
  check(`${label} — ⛔ 죽은 도메인 mango-i.com 이 없다`,
    !/mango-i\.com/.test(code));
  check(`${label} — ⛔ 구 서버 www.mangoi.co.kr 로 보내지 않는다`,
    !/(https:\/\/)?(www\.)?mangoi\.co\.kr(?!\w)/.test(code.replace(/test\.mangoi\.co\.kr/g, '')));
}

// ── ③ AI 명령 — 프롬프트와 화이트리스트가 어긋나면 링크가 조용히 죽는다 ──
console.log('\n[ ③ AI 명령: 프롬프트 예시와 화이트리스트가 같은 곳을 본다 ]');
const ai = SRC('ai-command.ts');
const aiCode = codeOnly(ai);
check('external_url 이 상수(SPEECH_COACH_URL)로 한 번만 정해진다',
  /const SPEECH_COACH_URL\s*=\s*siteUrl\('\/speech-coach\.html'\)/.test(aiCode));
check('프롬프트 예시가 그 상수를 그대로 쓴다 (손으로 적은 주소가 없다)',
  /"external_url":"\$\{SPEECH_COACH_URL\}"/.test(aiCode) &&
  !/"external_url":"https:\/\//.test(aiCode));
check('규칙표(fallback)도 같은 상수를 쓴다',
  /external_url:\s*SPEECH_COACH_URL/.test(aiCode));
check('🔑 화이트리스트가 SITE_HOSTS 다 (프롬프트가 내놓은 주소를 막아버리면 안 된다)',
  /const allowedHosts\s*=\s*SITE_HOSTS/.test(aiCode));
check('화이트리스트에 정본 호스트가 실제로 들어간다',
  /'https:\/\/mangoi\.ai'/.test(site) && /SITE_HOSTS[^\n]*SITE_ORIGIN/.test(site));

// ── ④ 규칙서·설정이 «같은 말» 을 하고 있는가 ──────────────────────
/* 규칙서가 **두 벌**이다 — CLAUDE.md(Claude 가 매번 읽는 것)와 MAINTENANCE.md(사람이 읽는 것).
   한쪽만 고치면 다음 사람이 옛 주소를 그대로 베낀다. 실제로 그렇게 밟았다(2026-08-17).

   🔴 (2026-08-26) 이 절을 다시 썼다. 예전 검사는
        /test\.mangoi\.co\.kr[\s\S]{0,300}-prod/
     즉 «도메인 이름 근처에 -prod 라는 글자가 있는가» 만 봤다. 그래서 2026-08-19 에 적힌
     **「test.mangoi.co.kr 도 -prod 워커입니다」라는 거짓 문장이 이 검사를 통과**했다.
     이전은 실제로 일어나지 않았고(8/19 작업기록에도 「직접 확인하지 못했다」고 적혀 있다),
     6일 뒤 class-895 수업에서 같은 사고가 재발했다.
     → «적어 두었는가» 는 «사실인가» 가 아니다. 이 하니스는 대시보드를 볼 수 없으므로
       «사실» 은 판정할 수 없다. 대신 **판정할 수 있는 것 두 가지**로 바꾼다:
         ⓐ 코드 밖 상태를 적을 때 «언제·어떻게 확인했는지» 를 문장에 박게 한다
            (「도메인–워커 배치 (YYYY-MM-DD 대시보드 실측)」 줄)
         ⓑ 그 배치를 적은 **세 곳이 서로 어긋나지 않는지** 대조한다
            (CLAUDE.md · MAINTENANCE.md · wrangler.toml)
       어긋나면 «둘 중 하나는 틀렸다» 가 확정되므로, 사실을 몰라도 사고는 잡힌다. */
console.log('\n[ ④ 규칙서 두 벌 + wrangler.toml 이 같은 도메인–워커 배치를 적고 있다 ]');

/** 「도메인–워커 배치」를 적어 둔 줄 하나를 꺼낸다(없으면 null). */
const placementLine = (text) =>
  text.split('\n').find((l) => /도메인[–\-]워커 배치/.test(l)) || null;

/** 그 줄에서 «이 도메인 뒤에 처음 나오는 워커 이름» 을 읽는다. */
const workerOf = (line, domain) => {
  if (!line) return null;
  const i = line.indexOf(domain);
  if (i < 0) return null;
  const m = line.slice(i).match(/webrtc-unified-platform(?:-prod)?/);
  return m ? m[0] : null;
};

const PLACEMENT_SOURCES = [
  ['CLAUDE.md', 'Claude 가 매번 읽는 규칙서'],
  ['MAINTENANCE.md', '사람이 읽는 유지보수 매뉴얼'],
  ['cloudflare-deploy/wrangler.toml', '워커 설정'],
];

const claimed = {};   // 파일 → { test, prod }
for (const [file, label] of PLACEMENT_SOURCES) {
  let md = '';
  try { md = readFileSync(resolve(__dir, '../' + file), 'utf8'); } catch {}
  check(`${file} (${label}) — 읽을 수 있다`, md.length > 0);

  const line = placementLine(md);
  check(`${file} — 「도메인–워커 배치」 줄이 있다`, !!line,
    '「도메인–워커 배치 (YYYY-MM-DD 대시보드 실측)」 형식으로 한 줄 적을 것');
  /* 코드 밖 상태(대시보드)는 이 하니스가 볼 수 없다. 그러니 최소한 «언제·어떻게 확인했는지» 는
     문장에 남아 있어야 한다 — 8/19 사고의 정확한 형태가 «확인 안 하고 완료형으로 적기» 였다. */
  check(`${file} — 그 줄에 확인 날짜와 «대시보드 실측» 근거가 붙어 있다`,
    !!line && /\(\s*\d{4}-\d{2}-\d{2}\s*대시보드 실측\s*\)/.test(line),
    line ? '실제: ' + line.trim().slice(0, 80) : '줄 자체가 없다');

  const t = workerOf(line, 'test.mangoi.co.kr');
  const pr = workerOf(line, 'mangoi.ai');
  claimed[file] = { test: t, prod: pr };
  check(`${file} — test.mangoi.co.kr 이 «어느 워커» 인지 워커 이름으로 적혀 있다`, !!t,
    'webrtc-unified-platform 또는 webrtc-unified-platform-prod 를 명시할 것');
  check(`${file} — mangoi.ai 가 «어느 워커» 인지 워커 이름으로 적혀 있다`, !!pr);
}

/* 🔑 여기가 이 절의 핵심이다 — 세 곳이 같은 워커를 지목하는가.
   사실을 몰라도 «서로 어긋난다» 는 것만으로 하나는 틀렸음이 확정된다. */
const testClaims = PLACEMENT_SOURCES.map(([f]) => claimed[f]?.test).filter(Boolean);
const prodClaims = PLACEMENT_SOURCES.map(([f]) => claimed[f]?.prod).filter(Boolean);
check('🔑 세 곳이 test.mangoi.co.kr 에 대해 **같은 워커**를 지목한다',
  testClaims.length === PLACEMENT_SOURCES.length && new Set(testClaims).size === 1,
  '지목: ' + JSON.stringify(claimed));
check('🔑 세 곳이 mangoi.ai 에 대해 **같은 워커**를 지목한다',
  prodClaims.length === PLACEMENT_SOURCES.length && new Set(prodClaims).size === 1,
  '지목: ' + JSON.stringify(claimed));
/* 두 도메인이 같은 워커라고 적혀 있으면 DO 가 안 갈린다는 뜻이다 — 그건 사고가 끝났다는
   중대한 주장이라, 적을 때는 반드시 대시보드로 확인한 뒤여야 한다. 어긋남 검사는 아니고
   «지금은 갈려 있다» 를 사람이 읽고 넘어가지 않도록 값을 찍어 두는 자리다. */
console.log(`     ↳ 현재 배치: test.mangoi.co.kr → ${testClaims[0] || '?'} · mangoi.ai → ${prodClaims[0] || '?'}`);

/* 📌 배치 줄과 «본문 서술» 이 어긋나는 것도 막는다.
   실제 사고가 이 형태였다 — 표·문단은 「-prod 워커입니다」라고 단정하는데 사실은 기본 워커였다. */
for (const [file, label] of PLACEMENT_SOURCES.slice(0, 2)) {
  let md = '';
  try { md = readFileSync(resolve(__dir, '../' + file), 'utf8'); } catch {}
  const onBase = claimed[file]?.test === 'webrtc-unified-platform';
  check(`${file} — 배치 줄이 «기본 워커» 인데 본문이 「-prod 워커입니다」라고 단정하지 않는다`,
    !onBase || !/`?test\.mangoi\.co\.kr`?\s*(도|은|는)?\s*`?-prod`?\s*워커입니다/.test(md),
    '배치 줄과 본문이 어긋난다');
}

// ── ⑤ 규칙서가 지켜야 할 나머지 ──────────────────────
console.log('\n[ ⑤ 규칙서가 주소를 옳게 적고 있다 ]');
const DOCS = [['CLAUDE.md', 'Claude 가 매번 읽는 규칙서'], ['MAINTENANCE.md', '사람이 읽는 유지보수 매뉴얼']];
for (const [file, label] of DOCS) {
  let md = '';
  try { md = readFileSync(resolve(__dir, '../' + file), 'utf8'); } catch {}
  check(`${file} — 운영 주소가 mangoi.ai 다`,
    /운영 주소:\s*\*\*https:\/\/mangoi\.ai\*\*/.test(md));
  /* ⚠️ (2026-08-27) 이 검사는 오래도록 «우연히» 통과하고 있었다. 실제로 매칭되던 문장은
     「즉 이 함정은 지금도 살아 있습니다」 — 도메인이 아니라 «함정» 이 살아 있다는 뜻이라
     이 검사가 지키려던 것과 무관했다. 8/27 도메인 이전으로 그 함정이 해결돼 문장이 사라지자
     FAIL 이 났는데, 정작 의도한 문장(「죽은 주소가 아닙니다」·「반드시 살려 둬야 합니다」)은
     «아니»/«살려 둬» 라 패턴에 안 걸렸다. 뜻에 맞게 넓힌다 — 어미가 아니라 «그렇게 적어
     두었는가» 를 본다. (CLAUDE.md 2장 「부정 검사를 그 이름이 파일에 없다로 썼는데…」의 형제) */
  check(`${file} — test.mangoi.co.kr 이 아직 살아 있다고 적어 둔다 (죽이면 앱이 멈춘다)`,
    /test\.mangoi\.co\.kr[\s\S]{0,300}(살아 있|살려 둬|살려 두|죽은 주소가 아|죽이지도 말)/.test(md));
  check(`${file} — mango-i.com 을 운영 주소로 적고 있지 않다`,
    !/운영 주소[^\n]*mango-i\.com/.test(md));
}

console.log('\n────────────────────────────────');
console.log(`총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('실패:'); FAILS.forEach((f) => console.log('  - ' + f)); }
process.exit(FAIL === 0 ? 0 : 1);
