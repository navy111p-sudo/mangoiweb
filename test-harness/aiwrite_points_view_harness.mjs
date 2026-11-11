// 🪙 A.i 영작 결과 화면 «받은 포인트» 줄 하니스 (2026-11-02)
//   서버가 실제로 적립한 것만 더해 그리는가 — 한도·로그인 안 함·확인 실패를 «지어내지 않고» 말하는가.
//   판정 함수 awPointsView 를 ai-write.html 에서 오려 내 실제로 돌린다(짝 검사 포함).
import { readFileSync } from 'node:fs';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n); } };
const ROOT = new URL('../cloudflare-deploy/', import.meta.url);
const H = readFileSync(new URL('public/ai-write.html', ROOT), 'utf8');
const A = readFileSync(new URL('src/api-ai-writing.ts', ROOT), 'utf8');

console.log('[ ① 판정 함수를 실제로 돌림 ]');
const m = H.match(/function awPointsView\(d\)\{([\s\S]*?)\n    \}\n    function awPointsHtml/);
ok('①-0 awPointsView 를 찾았다', !!m);
let view = () => null;
try { const f = new Function('d', m[1]); view = (d) => { try { return f(d); } catch (e) { return { cls: 'err', ko: e.message, en: '' }; } }; } catch (e) { console.log('   ', e.message); }
const got = view({ points: { amount: 10, label: 'AI 영작 첨삭 완료', newBalance: 120 } });
ok('①-1 첨삭 포인트 +10P 와 잔액', got.cls === 'got' && /\+10P/.test(got.ko) && /잔액 120P/.test(got.ko));
const multi = view({ points: { amount: 10, newBalance: 100 }, mission_bonus: { amount: 15, newBalance: 115 }, streak_bonus: { amount: 50, newBalance: 165 } });
ok('①-2 보너스가 있으면 합계와 내역', /\+75P/.test(multi.ko) && /첨삭 \+10/.test(multi.ko) && /미션 단어 \+15/.test(multi.ko) && /연속 영작 \+50/.test(multi.ko));
const rcap = view({ points: { capped: true, cap: 5 } });
ok('①-3 하루 5번 횟수 한도 → +0P 와 이유', rcap.cls === 'none' && /\+0P/.test(rcap.ko) && /하루 5번/.test(rcap.ko));
const tcap = view({ points: { capped: true, cap: 100, used: 100 } });
ok('①-4 하루 전체 한도 → +0P 와 «포인트 한도»', /\+0P/.test(tcap.ko) && /포인트 한도/.test(tcap.ko) && !/하루 100번/.test(tcap.ko));
const guest = view({ points: null, points_guest: true });
ok('①-5 로그인 안 함 → 로그인 안내(0P 라고 하지 않음)', guest.cls === 'guest' && /로그인/.test(guest.ko) && !/\+0P/.test(guest.ko));
const unk = view({ points: null });
ok('①-6 확인 못 하면 지어내지 않음', unk.cls === 'unknown' && !/\+\d+P/.test(unk.ko));
ok('①-7 영어 문구도 같은 숫자', /\+75P/.test(multi.en) && /Points earned/.test(multi.en) && /Log in/.test(guest.en));
ok('①-8 응답이 없으면 줄을 안 그림', view(null) === null);

console.log('[ ② 배선 ]');
ok('②-1 결과 화면이 그 줄을 그린다', /\$\{awPointsHtml\(d\)\}\s*\n?\s*\$\{awRoundHtml\(_awRoundNow\)\}/.test(H));
ok('②-2 줄은 data-ko/data-en 을 «글자 span» 에(EN 전환)', /<span data-ko="\$\{escapeHtml\(v\.ko\)\}" data-en="\$\{escapeHtml\(v\.en\)\}">/.test(H));
ok('②-3 서버가 로그인 여부를 알려 준다', /const pointsGuest = !\(awAuthUid && awAuthUid === uid && !uid\.startsWith\('guest_'\)\);/.test(A) && /points_guest: pointsGuest/.test(A));
ok('②-4 적립 조건과 같은 판정(복제가 어긋나지 않게)', /if \(awAuthUid && awAuthUid === uid && !uid\.startsWith\('guest_'\)\) \{/.test(A));
ok('②-5 CSS', /\.aw-points \{/.test(H));

console.log(`\n${fail ? '⚠' : '🎉'} aiwrite_points_view_harness — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
