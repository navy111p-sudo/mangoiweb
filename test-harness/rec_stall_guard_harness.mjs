// 녹화 «조용히 빈 껍데기가 되는» 사고 방지 가드 회귀 하니스 (2026-08-05)
//
// 배경 — 실장애 id=2022:
//   93.7분 수업이 R2 에 15,728,640 바이트(5MiB×3조각)만 남았다. 초당 2.8KB — 오디오만
//   담겨도 초당 16KB 는 나오므로 «사실상 아무것도 안 찍힌» 것. 그런데 화면에는 REC 타이머가
//   멀쩡히 돌고 있어 수업이 끝날 때까지 아무도 몰랐다.
//   ① 탭이 백그라운드로 내려가면 requestAnimationFrame 이 멈춰 합성 캔버스가 얼어붙는다.
//   ② 그 상태를 알려주는 신호가 어디에도 없었다.
//   ③ 크론 안전망의 «15분간 새 파트 없음 = 버려짐» 기준은, 파트가 5MiB 마다 생기므로
//      움직임 적은 수업을 죽은 것으로 오인해 **진행 중인 수업을 봉인**할 수 있었다.
//
// 이 하니스는 그 세 가지 가드가 사라지지 않았는지 소스에서 직접 확인한다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CD = path.join(HERE, '..', 'cloudflare-deploy');
const read = (p) => fs.readFileSync(path.join(CD, p), 'utf8');

let fail = 0;
const chk = (label, ok, extra) => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${extra ? '  — ' + extra : ''}`);
  if (!ok) fail++;
};

console.log('🎬 녹화 «빈 껍데기» 방지 가드\n');

// ── ① 탭이 숨겨져도 합성 캔버스가 계속 그려지는가 ──
console.log('· 합성 캔버스 정지 방지 (mango-rec.js)');
{
  const s = read('public/js/mango-rec.js');
  chk('rAF 가 멎으면 대신 그리는 타이머(composeKeepAlive) 존재',
      /composeKeepAlive\s*=\s*setInterval/.test(s));
  chk('마지막으로 그린 시각(composeTickAt)을 기록',
      /composeTickAt\s*=\s*Date\.now\(\)/.test(s));
  chk('타이머가 composeTickAt 을 보고 draw() 를 호출',
      /Date\.now\(\)\s*-\s*composeTickAt\s*>[\s\S]{0,80}draw\(\)/.test(s));
  // 타이머로도 draw 를 부르므로, 이전 rAF 를 취소하지 않으면 예약이 겹쳐 배로 늘어난다
  chk('draw() 가 이전 rAF 를 취소한 뒤 재예약(중복 예약 폭주 방지)',
      /cancelAnimationFrame\(composeRafId\);\s*\n\s*composeRafId\s*=\s*requestAnimationFrame\(draw\)/.test(s));
  chk('정지 시 타이머 해제', /clearInterval\(composeKeepAlive\)/.test(s));
}

// ── ② 기록이 사실상 멎으면 알리는가 ──
console.log('\n· 녹화 정체 감시 (mango-rec.js)');
{
  const s = read('public/js/mango-rec.js');
  chk('MediaRecorder 산출 바이트를 누적(recTotalBytes)', /recTotalBytes\s*\+=\s*e\.data\.size/.test(s));
  chk('감시 타이머 startStallWatch() 존재 + 녹화 시작 시 기동',
      /function startStallWatch\(/.test(s) && /^\s*startStallWatch\(\);/m.test(s));
  chk('정지 시 감시 해제', /stopStallWatch\(\)/.test(s));
  const m = /STALL_MIN_BYTES\s*=\s*([0-9*\s]+)/.exec(s);
  const win = /STALL_WINDOW_MS\s*=\s*([0-9*\s]+)/.exec(s);
  const bytes = m ? Function(`return (${m[1]})`)() : 0;
  const winMs = win ? Function(`return (${win[1]})`)() : 0;
  // 정상 녹화는 초당 100KB 안팎. 임계가 그보다 높으면 정상 녹화를 «정체» 로 오인한다.
  const perSec = winMs ? bytes / (winMs / 1000) : Infinity;
  chk('정체 임계가 정상 녹화 속도보다 충분히 낮음(오탐 방지)', perSec > 0 && perSec <= 30 * 1024,
      `${Math.round(perSec / 1024)}KB/s 미만이면 정체로 판정`);
  chk('선생님에게 보이는 경고(배지 상태 변경)', /mango-rec-stalled/.test(s));
}

// ── ③ 크론 안전망이 «진행 중인 수업» 을 못 건드리는가 ──
console.log('\n· 크론 안전망 보호선 (recordings-r2.ts)');
{
  const s = read('src/recordings-r2.ts');
  const ageM = /MIN_AGE_MS\s*=\s*([0-9*\s]+);/.exec(s);
  const age = ageM ? Function(`return (${ageM[1]})`)() : 0;
  chk('시작 후 최소 경과시간(MIN_AGE_MS)으로 진행 중 수업을 배제', age >= 3 * 3600 * 1000,
      `${(age / 3600000).toFixed(1)}시간 (최장 수업 2시간 남짓보다 커야 함)`);
  chk('선별 SQL 이 started_at 조건을 실제로 사용', /r\.started_at\s+IS NOT NULL AND r\.started_at\s*<\s*\?/.test(s));
  const quietM = /QUIET_MS\s*=\s*([0-9*\s]+);/.exec(s);
  const quiet = quietM ? Function(`return (${quietM[1]})`)() : 0;
  chk('마지막 파트 후 조용한 시간(QUIET_MS)도 함께 요구', quiet >= 15 * 60 * 1000,
      `${quiet / 60000}분`);
  chk("status='recording' 인 행만 대상", /WHERE r\.status = 'recording'/.test(s));
  chk('완료/삭제된 행은 어떤 경우에도 강등 불가',
      /status NOT IN \('completed','deleted'\)/.test(s));
  chk('킬스위치 존재', /recording_finalize/.test(s));
}

// ── 빈 껍데기가 학생 목록에 남지 않는가 ──
console.log('\n· 빈 껍데기 정리');
{
  const r2 = read('src/recordings-r2.ts');
  chk('조각 0개로 오래 남은 recording 을 aborted 로 정리',
      /const nextStatus[\s\S]*?'aborted'/.test(r2) && /AND id NOT IN \(SELECT DISTINCT recording_id FROM recording_parts\)/.test(r2));
  const mango = read('src/api-mango.ts');
  chk("학생 목록이 'aborted' 를 제외", /AND status != 'aborted'/.test(mango));
}

console.log(fail === 0 ? '\n🎉 ALL PASS' : '\n💥 ' + fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);
