/* ═══════════════════════════════════════════════════════════════════════
   🎁 보상 안내 문구 = 서버가 실제로 주는 것 (2026-11-09 신설)

   [왜] 화면이 서버가 «안 주는» 보상을 약속하고 있었다(아이·학부모 신뢰 문제).
     · 스트릭 화면  보너스를 «한 번» 받는 마일스톤처럼 그렸지만 서버는 그 단계부터 «매일» 준다(+10 기본은 안 보였다)
     · 스트릭 순위  «이번 주» 라 적었지만 전체 기간 정렬이다
     · FAQ          보석이 무엇인지·포인트 상한·교환 최소액이 없었다
   [남은 것] 홈(js/idx-daily-checkin.js)의 «+100P 보너스»·«자동 적립» 약속은 그 파일을 부르는 index.html(공동 금지구역)의
     ?v= 를 함께 올려야 해서 A 담당 승인 뒤 별도 PR — 그때 여기 B절을 더할 것.
   [무엇을 보나] 화면 숫자를 서버 정본(api-games-streak.ts 보너스 단계, point-policy.ts)에서 «읽어서» 대조한다.
     ⇒ 서버 숫자가 바뀌면 화면 문구도 함께 고치라고 여기서 빨간불이 난다.
   ═══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const rd = (p) => readFileSync(p, 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, why) => {
  if (cond) { console.log('  ✅ ' + name); pass++; }
  else { console.log('  ❌ ' + name + (why ? '\n       ' + why : '')); fail++; }
};

const streakSrc = rd(join(SRC, 'api-games-streak.ts'));
const policy = rd(join(SRC, 'point-policy.ts'));
const streakHtml = rd(join(PUB, 'streak.html'));
const faq = rd(join(PUB, 'faq.html'));

console.log('\n[ A. 스트릭 화면의 보석 숫자 = 서버 지급 단계 ]');
{
  const base = Number((streakSrc.match(/기본 보상[^\n]*\n\s*earned = (\d+);/) || [])[1]);   // 앞쪽 `let earned = 0` 선언이 아니라 지급 줄
  const tiers = [...streakSrc.matchAll(/new_streak >= (\d+)\) \{ earned \+= (\d+);/g)].map((m) => [Number(m[1]), Number(m[2])]);
  check('서버에서 기본 보석과 보너스 단계 4개를 읽었다', base > 0 && tiers.length === 4, `base=${base} tiers=${tiers.length}`);
  check(`화면에 «출석할 때마다 +${base}💎» 가 있다`, streakHtml.includes(`+${base}💎`), '기본 보석이 화면에 없으면 아이가 받는 양을 모른다');
  for (const [day, gem] of tiers) {
    check(`${day}일째 «매일» 보너스 +${gem}💎`,
      streakHtml.includes(`${day}일째부터 매일 보너스`) && streakHtml.includes(`+${gem}💎`),
      '서버는 그 단계부터 매일 준다 — «한 번» 처럼 적으면 안 된다');
  }
  check('보석이 포인트상점에서 쓰이지 않는다고 알린다', /포인트상점에서는 쓰지 않아요/.test(streakHtml));
  check('순위 제목이 «이번 주» 라고 말하지 않는다(전체 기간 정렬)', !/이번 주 리더보드/.test(streakHtml));
}

console.log('\n[ C. FAQ 숫자 = point-policy.ts ]');
{
  const num = (k) => Number((policy.match(new RegExp(k + ':\\s*(\\d+)')) || [])[1]);
  const cap = num('DAILY_TOTAL_CAP'), game = num('game_quiz_daily'), min = num('MIN_REDEEM'), exp = num('EXPIRY_MONTHS');
  check('정책 숫자 4개를 읽었다', cap && game && min && exp, `${cap}/${game}/${min}/${exp}`);
  check(`FAQ: 하루 최대 ${cap}P(게임·퀴즈 ${game}P)`, faq.includes(`하루 최대 ${cap}P(게임·퀴즈는 ${game}P)`));
  check(`FAQ: ${min.toLocaleString('en-US')}P부터 교환`, faq.includes(`${min.toLocaleString('en-US')}P부터 교환`));
  check(`FAQ: ${exp}개월 소멸`, faq.includes(`${exp}개월이 지나면 소멸`));
  check('FAQ: 보석 항목이 있다(한·영)', /보석\(💎\)은 포인트와/.test(faq) && /gems \(💎\) different/.test(faq));
}

console.log('\n────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n🚨 reward_copy_honesty_harness 실패'); process.exit(1); }
console.log('🎉 reward_copy_honesty_harness — 전부 통과');
