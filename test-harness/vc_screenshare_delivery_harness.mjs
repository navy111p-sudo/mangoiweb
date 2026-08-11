/**
 * 🖥 화면 공유가 «학생에게» 닿는가 — 강사 Shas 2번
 *
 *   "Share my screen 을 누르면 선택창은 정상적으로 열린다. 그런데 공유를 시작하면
 *    공유된 화면이 강사 자신에게만 보이고, 학생 화면에는 나타나지 않는다."
 *
 * 원인 두 겹
 *   ① 카메라가 꺼져 있거나 없는 강사에게는 보낼 video sender 가 없다. 그때 예전 코드는
 *      `pc.addTrack(...)` 만 하고 끝냈는데, 이 앱에는 onnegotiationneeded 핸들러가 없다
 *      = 재협상을 아무도 안 한다 → 트랙이 있다는 사실조차 상대에게 안 간다.
 *      내 미리보기는 로컬 스트림을 직접 붙이므로 «나만 보이는» 증상이 정확히 만들어진다.
 *   ② replaceTrack 실패를 빈 catch 로 삼켜, 못 갔는지 갔는지 강사가 알 수 없었다.
 *
 * ⚠️ 되돌리면 안 되는 것: replaceTrack 경로는 재협상하지 «않는다». 그게 이 방식의 장점이고
 *    (끊김 없이 즉시 교체), 거기에 재협상을 붙이면 수업이 잠깐 끊긴다.
 *
 * 실행: node test-harness/vc_screenshare_delivery_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = process.env.MANGOI_PUB || join(ROOT, 'cloudflare-deploy', 'public');
const js = readFileSync(join(PUB, 'js', 'idx-main.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
const check = (n, c, d) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; failures.push(n + (d ? ' — ' + d : '')); console.log('  ❌ ' + n + (d ? '\n       ' + d : '')); }
};

const share = js.slice(js.indexOf('window.vcShareMyScreen = async function'),
                       js.indexOf('window.vcStopMyScreen = async function'));
const stop  = js.slice(js.indexOf('window.vcStopMyScreen = async function'),
                       js.indexOf('window.vcStopMyScreen = async function') + 3000);

console.log('\n════════ 화면 공유가 학생에게 닿는가 ════════\n');

console.log('▶ ① 트랙을 «새로» 붙였으면 재협상한다');
check('공유 함수를 찾았다', share.length > 500);
check('sender 가 없으면 addTrack 한다', /pc\.addTrack\(st, ds\)/.test(share));
check('addTrack 한 연결을 따로 모은다', /_nego\.push\(\[uid, pc\]\)/.test(share),
      '모아 두지 않으면 어디를 재협상해야 하는지 알 수 없다');
check('그 연결에 offer 를 다시 만들어 보낸다',
      /_nego\.forEach[\s\S]{0,600}createOffer\(\)[\s\S]{0,400}setLocalDescription[\s\S]{0,300}type: 'offer'/.test(share),
      '재협상이 없으면 상대는 트랙이 생긴 줄도 모른다');
check('재협상 offer 도 Opus 튜닝을 거친다', /off\.sdp = vcTuneAudioSdp\(off\.sdp\)/.test(share));

console.log('\n▶ ② 실패를 삼키지 않는다');
check('replaceTrack 실패를 빈 catch 로 버리지 않는다',
      !/sender\.replaceTrack\(st\)\.catch\(function\(\)\{\}\)/.test(share),
      '삼키면 «공유 중» 이라고 뜨는데 학생은 못 보는 상태가 된다');
check('성공·실패를 센다', /_ok\+\+/.test(share) && /_fail\+\+/.test(share));
check('아무에게도 못 갔으면 강사에게 알린다',
      /_ok === 0[\s\S]{0,400}showToast/.test(share));
check('알림이 한/영 둘 다',
      /학생에게 화면이 전달되지 않았어요/.test(share) && /could not be sent to the student/.test(share));
check('방에 아무도 없는 경우와 구분한다',
      /_peers\.length === 0/.test(share) && /아직 수업에 아무도 없어요/.test(share),
      '«아직 아무도 없음» 을 «전달 실패» 로 알리면 강사가 헛수고한다');

console.log('\n▶ ③ 되돌리기(공유 중지)');
check('카메라가 있으면 카메라로 되돌린다', /sender\.replaceTrack\(cam\)/.test(stop));
check('되돌릴 카메라가 없으면 트랙을 비운다(얼어붙은 마지막 장면 방지)',
      /else if \(sender && !cam\) sender\.replaceTrack\(null\)/.test(stop));

console.log('\n▶ ④ 지키던 것을 깨지 않았다');
check('replaceTrack 경로는 여전히 재협상하지 않는다 (끊김 없는 교체)',
      !/sender\.replaceTrack\(st\)[\s\S]{0,200}createOffer/.test(share),
      '여기에 재협상을 붙이면 수업이 잠깐 끊긴다');
check('화면 공유 트랙은 detail 힌트를 유지한다', /st\.contentHint = 'detail'/.test(share));
check('강사·관리자만 공유할 수 있다', /vcIsStaffNow/.test(share));

console.log('\n──────────────────────────────────────────');
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('──────────────────────────────────────────\n');
process.exit(fail ? 1 : 0);
