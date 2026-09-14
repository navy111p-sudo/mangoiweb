#!/usr/bin/env node
/**
 * parent_mypage_neutral_harness — 「마이 페이지」(parent.html) 문구 중립화 감시 (2026-09-14)
 *
 * 왜: parent.html 은 «학부모가 자녀를 본다» 전제로 쓰였는데 홈 메뉴가 같은 주소를 「마이페이지」로도
 *     불러, 학생(고학년·성인 포함)이 들어와도 「학부모 전용 화면 · 자녀의 학습 한눈에 보기」가 떴다.
 *     사장님 결정(2026-09-14): 학생·학부모 공용 「마이 페이지」로 — 배지·제목·입력 라벨·공유 문구에서 «자녀» 를 뺀다.
 *
 * 검사 원칙(CLAUDE.md 2장):
 *  · 부정 검사(«자녀» 가 없다)는 주석을 벗겨 낸 사본으로 — 「왜 지웠는지」 적은 주석이 자기를 잡는다.
 *  · «없다» 옆에 «새 문구가 있다» 를 짝으로 — 앞만 보면 화면을 비워도 통과한다.
 *  · pd-meta 줄은 오려 내 실제로 돌린다 — 학부모 이름이 없을 때 「- 학부모」가 안 찍히는가.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = path.join(ROOT, 'cloudflare-deploy/public/parent.html');
const src = fs.readFileSync(P, 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌', name, extra ? '— ' + extra : ''); } };

// 주석 벗기기: HTML 주석 · 줄 단위 // 주석 · /* */ 는 «줄 단위로 안인가» 추적(정규식 한 줄로 지우면 코드가 딸려 나간다)
function strip(t) {
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  const out = []; let inBlock = false;
  for (const line of t.split('\n')) {
    let l = line;
    if (inBlock) { const e = l.indexOf('*/'); if (e < 0) continue; l = l.slice(e + 2); inBlock = false; }
    const b = l.indexOf('/*');
    if (b >= 0) { const e = l.indexOf('*/', b + 2); if (e < 0) { l = l.slice(0, b); inBlock = true; } else { l = l.slice(0, b) + l.slice(e + 2); } }
    l = l.replace(/^\s*\/\/.*$/, '');
    out.push(l);
  }
  return out.join('\n');
}
const clean = strip(src);

// ① 입장(entry) 블록만 잘라 낸다 — «사람이 처음 보는 자리»
const eStart = clean.indexOf('<div id="entry">');
const eEnd = clean.indexOf('<div id="dashboard"');
ok('전제: #entry 블록을 잘라 냈다', eStart > 0 && eEnd > eStart);
const entry = clean.slice(eStart, eEnd);

console.log('\n■ 입장 화면 — «자녀» 전제가 없다 (주석 벗긴 사본)');
ok('배지에 「학부모 전용」이 없다', !/학부모 전용/.test(entry));
ok('배지 EN 에 PARENT DASHBOARD 가 없다', !/PARENT DASHBOARD/.test(entry));
ok('제목·안내에 「자녀의 학습」「자녀의 학생 ID」가 없다', !/자녀의 학습|자녀의 학생/.test(entry));
ok('EN 문구에 child 가 없다(FAQ Q2 의 «several children» 예시는 허용)', !/child(?!ren)/i.test(entry.replace(/several children/g, '')));
ok('로그인 라벨이 「자녀의」로 시작하지 않는다', !/data-ko="👤 자녀/.test(entry));

console.log('\n■ 짝 — 새 문구가 «실제로» 있다 (전부 비우기 변이를 막는다)');
ok('배지 = 「👤 학생·학부모 마이 페이지」(KO/EN 짝)', /data-ko="👤 학생·학부모 마이 페이지" data-en="👤 STUDENT · PARENT MY PAGE"/.test(entry));
ok('제목 = 「내 학습 한눈에 보기」(KO/EN 짝)', /data-ko="내 학습 한눈에 보기" data-en="My Learning at a Glance"/.test(entry));
ok('입력 라벨 = 「👤 학생 ID」', /data-ko="👤 학생 ID" data-en="👤 Student ID"/.test(entry));
ok('브랜드 줄은 그대로 「마이 페이지 (My Page)」', /class="brand-sub" data-ko="마이 페이지 \(My Page\)"/.test(clean));
ok('<title> 이 「마이 페이지 — 망고아이」', /<title>마이 페이지 — 망고아이<\/title>/.test(src));

console.log('\n■ 공유·대시보드 쪽도 같은 말을 한다');
ok('카카오 공유 제목이 «학부모 대시보드» 가 아니다', !/const title = '망고아이 학부모 대시보드'/.test(clean) && /const title = '망고아이 마이 페이지'/.test(clean));
ok('카카오 공유 본문에 「자녀의」가 없다', !/const text = '자녀의/.test(clean));
ok('배지 카드 제목이 「획득한 배지」', /data-ko="획득한 배지" data-en="Badges Earned"/.test(clean));
ok('전환 버튼이 「다른 ID 로 조회」(«다른 자녀» 아님)', /data-ko="다른 ID 로 조회"/.test(clean) && !/다른 자녀 조회/.test(clean));
ok('alert·재로그인 안내가 «학생 ID» 로 말한다', !/자녀의 학생 ID를 입력/.test(clean) && !/자녀 ID 입력 후/.test(clean));
ok('가정 안내 TIP 에 「자녀에게」「응원해주세요」가 없다', !/자녀에게|응원해주세요/.test(clean));

console.log('\n■ pd-meta 줄을 오려 내 실제로 돌린다');
const m = /document\.getElementById\('pd-meta'\)\.textContent = (.+);/.exec(clean);
ok('전제: pd-meta 대입식을 오려 냈다', !!m);
if (m) {
  const f = new Function('c', '_currentUid', 'return ' + m[1] + ';');
  ok('학부모 이름이 없으면 「학부모」라는 말이 안 찍힌다', !/학부모/.test(f({ program: 'BTS 2' }, 'jeong')), f({ program: 'BTS 2' }, 'jeong'));
  ok('학부모 이름이 있으면 그대로 찍힌다(잃는 정보 없음)', /학부모 홍길동/.test(f({ program: 'BTS 2', parent_name: '홍길동' }, 'jeong')));
  ok('ID 는 언제나 찍힌다', /ID: jeong/.test(f({}, 'jeong')));
}

console.log('\n■ 음성 파일은 아직 옛 녹음 — «글자와 소리가 다르다» 를 코드가 알고 있는가');
ok('안내 음성 파일 옆에 재녹음 필요 메모가 있다', /다시 녹음해 갈아 끼우기 전까지는 글자와 소리가 다릅니다/.test(src));
ok('토스트 라벨은 「마이 페이지 안내」', /<b>마이 페이지 안내<\/b>/.test(clean));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
