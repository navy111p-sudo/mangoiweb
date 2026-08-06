/**
 * ⚙️ 수업 설정 팝업 «배선» 하니스 — 2026-08-06
 *
 * 사건: 강사가 "USB 웹캠을 꽂고 설정에서 골라도 노트북 카메라 그대로다" 라고 신고.
 *   원인은 카메라가 아니라 **설정 팝업의 손잡이가 아무 데도 연결돼 있지 않았던 것**이다.
 *   vc-dock.js 의 call() 은 `typeof window[name]==='function'` 일 때만 부르고 아니면 조용히 넘어간다.
 *   그래서 vcSetCamDevice·vcSetMicDevice·vcSetNoiseSuppression·vcSetBackgroundBlur 가
 *   index.html 에 없는데도 **에러 한 줄 없이** 화면만 바뀌었다. (화질 버튼이 같은 이유로 한 번 죽었었다)
 *
 * 그래서 이 하니스는 개별 기능이 아니라 **"부르는 이름은 전부 존재해야 한다"** 는 규칙을 지킨다.
 *   → 앞으로 설정에 스위치를 새로 달면서 함수를 안 만들면 여기서 바로 걸린다.
 *
 * 추가로, 같은 뿌리(전역이 window 에 없음)에서 조용히 죽어 있던 것들도 함께 지킨다.
 *   `let vcLocalStream` / `let vcPeerConnections` 는 window 프로퍼티를 만들지 않는다 →
 *   `if (!window.vcLocalStream) return;` 로 시작하는 자가치유·전체음소거·화면공유가 전부 무동작이었다.
 *
 * 실행: node test-harness/vc_settings_wiring_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = process.env.MANGOI_PUB || join(ROOT, 'cloudflare-deploy', 'public');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); }
}

const html = readFileSync(join(PUB, 'index.html'), 'utf8');
const dock = readFileSync(join(PUB, 'js', 'vc-dock.js'), 'utf8');

console.log('\n⚙️  설정 팝업 배선 검사\n');

/* ── ① 핵심: 독이 부르는 이름이 전부 index.html 에 정의돼 있는가 ────────────────── */
const called = [...new Set([...dock.matchAll(/call\('([A-Za-z_$][\w$]*)'/g)].map(m => m[1]))];
check('독이 부르는 window 함수 목록을 찾았다 (' + called.length + '개)', called.length >= 5);

// 정의 위치는 index.html 또는 다른 js 어디여도 되지만, 지금은 전부 index.html 에 있다
const defRe = (n) => new RegExp('window\\.' + n + '\\s*=|function\\s+' + n + '\\s*\\(', '');
called.forEach(function (name) {
  check('부르는 ' + name + '() 이(가) 실제로 존재', defRe(name).test(html),
        'vc-dock 은 부르는데 정의가 없다 → 눌러도 아무 일이 안 일어난다(에러도 안 난다)');
});

/* ── ② 신고된 두 증상 ──────────────────────────────────────────────────────── */
check('카메라 드롭다운이 vcSetCamDevice 를 부른다', /call\('vcSetCamDevice'/.test(dock));
check('카메라 전환이 모든 피어의 sender 를 갈아끼운다',
      /vcSetCamDevice[\s\S]{0,3000}?replaceTrack/.test(html), '내 미리보기만 바뀌고 상대 화면은 그대로일 수 있다');
check('카메라 전환이 옛 트랙을 stop() 한다',
      /vcSetCamDevice[\s\S]{0,2500}?getVideoTracks\(\)\.forEach[\s\S]{0,120}?stop\(\)/.test(html), '옛 카메라 LED 가 계속 켜져 있게 된다');
check('고른 카메라를 기억한다(mangoi_vc_cam_id)', /mangoi_vc_cam_id/.test(html));
check('다음 입장 때도 그 카메라로 잡는다',
      /acquireLocalMedia[\s\S]{0,2000}?_savedCam[\s\S]{0,200}?deviceId/.test(html), '고른 카메라가 매 수업 초기화된다');
check('카메라 자가치유도 고른 카메라를 존중한다',
      /cam-heal[\s\S]{0,900}?_pickedCam/.test(html), '자가치유가 돌 때마다 내장 카메라로 되돌아간다');
check('화면공유 중에는 카메라를 갈아끼우지 않는다',
      /vcSetCamDevice[\s\S]{0,900}?__vcScreenSharing/.test(html), '공유 중 카메라를 바꾸면 학생 화면에서 공유가 끊긴다');
check('가상배경이 켜져 있으면 새 카메라로 다시 세운다',
      /vcSetCamDevice[\s\S]{0,3500}?vcSetBackground\('off'\)/.test(html), '합성 캔버스가 죽은 트랙을 그려 화면이 언다');

check('마이크 테스트 버튼이 있다', /data-act="mic"/.test(dock));
check('마이크 테스트가 수업에 나가는 실제 트랙을 검사한다',
      /function micTest\(\)[\s\S]{0,1200}?window\.vcLocalStream/.test(dock), '따로 잡으면 "테스트는 되는데 수업에선 안 들려요"를 못 잡는다');
check('마이크 테스트가 녹음해서 되들려준다', /function micTest\(\)[\s\S]{0,4000}?MediaRecorder/.test(dock));
check('마이크가 꺼져 있으면 그렇다고 알려준다', /function micTest\(\)[\s\S]{0,1500}?enabled === false/.test(dock));
check("스피커 확인음이 '띵' 한 번이 아니다(3음 차임)",
      /523\.25[\s\S]{0,40}659\.25[\s\S]{0,40}783\.99/.test(dock), '한 음 0.4초로는 스피커가 되는지 판단이 안 된다');
check('확인음 전에 AudioContext 를 resume 한다', /state === 'suspended'[\s\S]{0,60}resume/.test(dock), '자동재생 정책 때문에 아무 소리도 안 날 수 있다');

/* ── ③ 장치 목록 자체 ──────────────────────────────────────────────────────── */
check('설정을 열 때마다 장치 목록을 다시 채운다',
      /function openSettings\(\)[\s\S]{0,400}?fillDevices\(\)/.test(dock), '수업 중 꽂은 USB 장치가 목록에 안 뜬다');
check('장치가 바뀌면(devicechange) 목록을 다시 채운다', /'devicechange'[\s\S]{0,120}fillDevices/.test(dock));
check('지금 쓰는 장치를 선택 상태로 보여준다', /activeDeviceId\('video'\)/.test(dock) && /applySel\(camSel/.test(dock));
/* 🔴 이 항목이 이번 사고의 재발 방지선이다. 트랙의 deviceId 가 목록에 없으면(가상배경·화면공유의
   캔버스 트랙, 파이어폭스의 빈 값) 아무것도 선택되지 않아 브라우저가 첫 장치를 보여준다
   = "USB 캠을 골랐는데 노트북 캠으로 되돌아갔다" 로 보이는 그 화면. 저장된 선택으로 반드시 폴백해야 한다. */
check('트랙 id 가 목록에 없으면 저장된 선택으로 되돌아간다',
      /applySel\(camSel,\s*\[curCam,\s*savedDeviceId\('video'\)\]\)/.test(dock),
      '선택 표시가 첫 장치로 튀어 "설정이 안 먹는다"로 보인다');

/* ── ④ 같은 뿌리에서 죽어 있던 것들 ────────────────────────────────────────── */
check("window.vcLocalStream 이 실제 스트림을 가리킨다",
      /defineProperty\(window, 'vcLocalStream'/.test(html),
      "`let` 은 window 프로퍼티를 안 만든다 → 자가치유·전체음소거가 통째로 무동작");
check("window.vcPeerConnections 가 실제 연결 맵을 가리킨다",
      /defineProperty\(window, 'vcPeerConnections'/.test(html),
      '화면공유 replaceTrack 이 아무에게도 안 간다(내 화면에만 보임)');

/* ── ⑤ 가짜 스위치가 남아 있지 않은가 ──────────────────────────────────────── */
check('동작하지 않는 «마이크 음량» 슬라이더가 없다', !/id="sg-mic-vol"/.test(dock));
check('끌 수 없는 녹화를 «스위치»로 보여주지 않는다', !/data-act="autorec"/.test(dock),
      '녹화는 30일 복습 약속이라 끄면 되돌릴 수 없다 — 사실대로 «항상 켬» 으로 적는다');

console.log('\n' + '═'.repeat(64));
console.log(`  ✅ PASS ${pass}    ⚠ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('═'.repeat(64));
process.exit(fail ? 1 : 0);
