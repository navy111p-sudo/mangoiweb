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

// ── ④ 규칙서가 같은 말을 하고 있는가 ──────────────────────
console.log('\n[ ④ CLAUDE.md 가 코드와 같은 주소를 적고 있다 ]');
let md = '';
try { md = readFileSync(resolve(__dir, '../CLAUDE.md'), 'utf8'); } catch {}
check('CLAUDE.md 운영 주소가 mangoi.ai 다',
  /운영 주소:\s*\*\*https:\/\/mangoi\.ai\*\*/.test(md));
check('CLAUDE.md 가 test.mangoi.co.kr 이 아직 살아 있다고 적어 둔다 (죽이면 앱이 멈춘다)',
  /test\.mangoi\.co\.kr[\s\S]{0,200}같은 Worker/.test(md));

console.log('\n────────────────────────────────');
console.log(`총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('실패:'); FAILS.forEach((f) => console.log('  - ' + f)); }
process.exit(FAIL === 0 ? 0 : 1);
