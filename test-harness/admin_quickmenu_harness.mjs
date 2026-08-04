// -*- coding: utf-8 -*-
// 📌 자주 쓰는 메뉴 / 🕘 최근 사용 하네스 (2026-08-04)
//   실행: node test-harness/admin_quickmenu_harness.mjs
//
//   배경 —
//     본사 계정 기준 최상위 메뉴가 88개라 «있는 기능을 못 찾는» 문제가 있었다.
//     처음엔 «겉보기 중복 카드를 합치자» 는 안을 세웠지만, 실제로 확인해 보니
//     자료실 5개·리포트·공지 카드들은 adm-core.js 의 PERMS/CARD_POLICY 에서
//     **역할별 접근권한을 각각 따로 들고 있었다.** (강사는 관리자 자료실 ❌ 등)
//     즉 이 시스템에서 «카드 하나 = 권한 단위» 이고, 합치면 권한 경계가 무너진다.
//     → 카드는 그대로 두고 «찾는 길» 만 짧게 만드는 방향으로 바꿨다.
//   이 하네스는 그 판단이 나중에 조용히 뒤집히지 않도록 지킨다.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const html = rd('../cloudflare-deploy/public/admin.html');
const qm   = rd('../cloudflare-deploy/public/js/adm-quickmenu.js');
const core = rd('../cloudflare-deploy/public/js/adm-core.js');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

console.log('\n[ 배선 ]');
check('admin.html 에 표시 자리(#quick-menu-bar)가 있다', /id="quick-menu-bar"/.test(html));
check('첫 카드보다 «위» 에 있다 (맨 처음 눈에 들어와야 함)',
  html.indexOf('id="quick-menu-bar"') > 0 &&
  html.indexOf('id="quick-menu-bar"') < html.indexOf('id="card-ai-insights"'));
check('스크립트가 ?v= 와 함께 등록돼 있다', /adm-quickmenu\.js\?v=\d+/.test(html));
check('내용이 없으면 접혀 있다 (빈 바가 자리 차지하지 않음)',
  /id="quick-menu-bar"[^>]*style="display:none"/.test(html));

console.log('\n[ 권한 누수 방지 — 가장 중요 ]');
check('보이는 카드만 대상으로 삼는다 (visible 판정 존재)',
  /function visible\(/.test(qm) && /getComputedStyle\(el\)\.display === 'none'/.test(qm));
check('고정·최근 목록을 그릴 때 숨겨진 카드를 걸러낸다',
  /load\(PIN_KEY\)\.filter\(byId\)/.test(qm) && /load\(REC_KEY\)\.filter\(/.test(qm));
check('역할별 숨김(_applyMenuVisibility)이 끝난 뒤에 그린다',
  /setTimeout\(render, 500\)/.test(qm));

console.log('\n[ 다른 것을 망가뜨리지 않는다 ]');
check('<summary> 를 수정하지 않는다 (사이드바 인덱스·i18n 오염 방지)',
  !/summary[^\n]*\.(innerHTML|appendChild|insertAdjacent)/.test(qm));
check('서버를 부르지 않는다 (localStorage 만 사용)', !/fetch\s*\(/.test(qm));
check('CSS 를 자기 네임스페이스(#quick-menu-bar) 안에서만 쓴다',
  (qm.match(/#quick-menu-bar/g) || []).length >= 6);
check('Win10 에서 깨지는 최신 이모지를 쓰지 않는다',
  !/[\u{1FA70}-\u{1FAFF}]/u.test(qm));
check('XSS 이스케이프를 쓴다', /function esc\(/.test(qm) && /&amp;/.test(qm));
check('한/영 라벨을 모두 낸다', /isEn\s*\(/.test(qm) && /en \?/.test(qm));

console.log('\n[ 🚫 카드 병합 금지 — 카드 하나 = 권한 단위 ]');
const LIB = ['card-lib-admin', 'card-lib-teacher', 'card-lib-branch', 'card-lib-agency', 'card-lib-student'];
for (const id of LIB) {
  check(`자료실 카드가 따로 남아 있다 — ${id}`, html.includes(`id="${id}"`));
  check(`권한표에 그 카드의 역할별 설정이 살아 있다 — ${id}`,
    new RegExp(`id:\\s*'${id}'`).test(core));
}
check('자료실 권한이 카드마다 «다르게» 설정돼 있다 (합치면 안 되는 근거)',
  /id: 'card-lib-admin'[\s\S]{0,220}hq_teacher:'❌'/.test(core) &&
  /id: 'card-lib-teacher'[\s\S]{0,220}hq_teacher:'✅'/.test(core));

console.log(`\n─────────────────────────────────────────────`);
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
