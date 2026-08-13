// build_stamp_harness.mjs — 「배포는 성공했는데 아무도 새 화면을 못 본다」 방지 (2026-08-13)
//
//   무슨 사고였나 (PR #102):
//     GitHub Actions 배포가 14단계 전부 초록불이고 헬스체크까지 통과했는데,
//     학생게임 화면이 그대로였다. 파일은 서버에 올라가 있었다.
//     원인은 캐시가 아니라 **서버가 「안 바뀌었다」고 답한 것**이었다.
//
//     src/index.ts 의 htmlEtag304() 는 HTML 의 ETag/Last-Modified 를 오직 BUILD_STAMP
//     하나로 만든다. 재방문 브라우저가 If-None-Match 로 그 값을 보내면 그대로 304 를 준다.
//     그 설계의 전제는 「배포마다 BUILD_STAMP 가 새로 찍힌다」인데, 그 일은 deploy.ps1 만
//     하고 있었다. CI 경로에는 그 단계가 없어 스탬프가 16시간 전 값에 멈춰 있었고,
//     결과적으로 CI 로 나간 배포는 **재방문 사용자에게 영영 안 보였다.**
//
//   이 하니스가 지키는 것 — 셋 중 하나만 무너져도 같은 사고가 조용히 재현된다:
//     ① 두 배포 경로(deploy.ps1 · GitHub Actions)가 **둘 다** BUILD_STAMP 를 갱신한다
//     ② wrangler.toml 의 BUILD_STAMP 는 두 벌([vars]/[env.production.vars])이고 값이 같다
//     ③ htmlEtag304 가 여전히 BUILD_STAMP 를 검증자로 쓴다(=이 하니스가 지킬 대상이 맞다)
//
//   ⚠️ 「조용히 아무 일도 안 일어나는」 종류의 사고라 사람 눈으로는 못 잡는다.
//      배포도 성공, 헬스체크도 성공, 파일도 올라가 있다. 그래서 게이트로 막는다.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
}
function read(p) { return existsSync(p) ? readFileSync(p, 'utf8') : ''; }

const wrangler = read(join(ROOT, 'cloudflare-deploy/wrangler.toml'));
const workflow = read(join(ROOT, '.github/workflows/deploy.yml'));
const ps1      = read(join(ROOT, 'deploy.ps1'));
const indexTs  = read(join(ROOT, 'cloudflare-deploy/src/index.ts'));

console.log('\n▶ wrangler.toml — BUILD_STAMP 는 두 벌이고 값이 같아야 한다');
/* 한 벌만 갈면 운영 워커([env.production.vars])는 옛 스탬프 그대로다.
   기본 환경만 새 값이 되어 «로컬에선 되는데 운영은 안 되는» 형태로 나타난다. */
const stamps = [...wrangler.matchAll(/^BUILD_STAMP\s*=\s*"([^"]*)"/gm)].map(m => m[1]);
check('BUILD_STAMP 이 정확히 2줄', stamps.length === 2, `${stamps.length}줄: ${JSON.stringify(stamps)}`);
check('두 값이 서로 같음', stamps.length === 2 && stamps[0] === stamps[1], JSON.stringify(stamps));
check('값이 비어 있지 않음', stamps.every(s => s && s.trim().length > 0), JSON.stringify(stamps));

console.log('\n▶ 두 배포 경로가 모두 BUILD_STAMP 를 갱신해야 한다');
/* 한쪽만 갱신하면 그쪽으로 배포할 때만 화면이 반영된다.
   실제로 CI 경로가 빠져 있었고, 그래서 CI 배포가 전부 보이지 않았다. */
check('deploy.ps1 이 BUILD_STAMP 를 갱신한다',
  /BUILD_STAMP\s*\\?s\*=|BUILD_STAMP/.test(ps1) && /-replace[\s\S]{0,80}BUILD_STAMP/.test(ps1),
  'deploy.ps1 에서 BUILD_STAMP 치환 부분을 찾지 못함');
check('GitHub Actions 워크플로가 BUILD_STAMP 를 갱신한다',
  /BUILD_STAMP/.test(workflow) && /sed[\s\S]{0,200}BUILD_STAMP/.test(workflow),
  '.github/workflows/deploy.yml 에 스탬프 갱신 단계가 없다 — CI 배포가 사용자에게 안 보이게 된다');
check('워크플로가 2줄 갱신됐는지 스스로 검증한다',
  /-ne 2|!= *2|-eq 2/.test(workflow),
  '갱신 줄 수를 세지 않으면 wrangler.toml 구조가 바뀔 때 조용히 한 줄만 갈린다');
check('스탬프 갱신이 배포 단계보다 먼저 온다',
  workflow.indexOf('BUILD_STAMP') > 0 &&
  workflow.indexOf('BUILD_STAMP') < workflow.indexOf('Deploy base Worker'),
  '배포 뒤에 찍으면 이번 배포에는 반영되지 않는다');

console.log('\n▶ 이 하니스가 지킬 대상이 여전히 맞는가');
/* htmlEtag304 가 BUILD_STAMP 를 안 쓰게 바뀌었다면 위 검사들은 의미가 없다.
   그때는 이 하니스를 지우거나 새 검증자에 맞게 고쳐야 한다 — 조용히 통과시키지 않는다. */
check('htmlEtag304 가 BUILD_STAMP 를 검증자로 쓴다',
  /function htmlEtag304[\s\S]{0,600}BUILD_STAMP/.test(indexTs),
  'HTML ETag 방식이 바뀌었다 — 이 하니스를 새 방식에 맞게 갱신할 것');
check('304 를 돌려주는 경로가 살아 있다',
  /function htmlEtag304[\s\S]{0,2000}status:\s*304/.test(indexTs));

console.log('\n' + '═'.repeat(60));
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
console.log('═'.repeat(60));
process.exit(fail ? 1 : 0);
