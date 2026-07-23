// -*- coding: utf-8 -*-
// 🔁 (2026-07-24) 무중단 재연결(sticky reconnect) 하네스 — 의존성 없음.
//   실행: node test-harness/vc_sticky_reconnect_harness.mjs
//   설계 정본: docs/계획_화상수업_무중단_재연결.md
//   목적: WS 블립 1회에 수업 전체가 리셋되던 것을, 정체성(userId) 유지로 연결을 보존.
//   ⚠️ 스위치 VC_STICKY_UID 기본값 = 'off'. 켜기 전까지 동작은 예전과 100% 동일해야 한다(dormant).
//      이 하네스는 "새 로직이 맞게 들어갔는가" + "OFF 경로가 보존되는가" 둘 다 검사한다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const R = (p) => readFileSync(resolve(__dir, p), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function ok(name, cond){ if (cond) PASS++; else { FAIL++; FAILS.push(name); } console.log(`  ${cond ? '✅' : '❌'} ${name}`); }

const DO  = R('../cloudflare-deploy/src/video-call-room.ts');
const IDX = R('../cloudflare-deploy/public/index.html');
const WT  = R('../cloudflare-deploy/wrangler.toml');

console.log('\n[ ① 스위치 — 기본 off, 두 벌, 즉시 원복 가능 ]');
ok('DO 가 env 를 받고 VC_STICKY_UID 로 stickyUid 를 정한다',
   /constructor\(state: DurableObjectState, env\?: any\)/.test(DO) && /this\.stickyUid = !!\(env && env\.VC_STICKY_UID === 'on'\)/.test(DO));
ok('stickyUid 기본값은 false(꺼짐)', /private stickyUid: boolean = false;/.test(DO));
{
  // 스위치는 두 벌(기본+운영)이 있어야 하고, 값이 on/off 로 유효하며, 두 벌이 서로 일치해야 한다.
  //   (한쪽만 on 이면 운영/기본이 엇갈려 재현 불가한 버그가 난다 — 이 저장소 상습 함정)
  const vars = [...WT.matchAll(/VC_STICKY_UID = "(\w+)"/g)].map(m => m[1]);
  ok(`wrangler 에 VC_STICKY_UID 두 벌·유효·일치 (현재 ${vars.join(',') || '없음'})`,
     vars.length >= 2 && vars.every(v => v === 'on' || v === 'off') && vars.every(v => v === vars[0]));
}

console.log('\n[ ② 서버 — 정체성 인계 (스위치 on 일 때만) ]');
ok('인계는 stickyUid 가 켜지고 옛 소켓이 joined 일 때만',
   /if \(this\.stickyUid && !inherited && oa\.joined && oa\.userId\)/.test(DO));
ok('🔴 옛 소켓을 닫기 전에 joined:false + stale- 로 먼저 갱신(user-left 오발사·오배송 방지)',
   /userId: 'stale-' \+ oa\.userId, joined: false[\s\S]{0,400}other\.close\(4001/.test(DO));
ok('물려받은 userId(effectiveUserId)로 room-joined 회신',
   /type: 'room-joined',\s*data: \{ roomId: this\.roomId, userId: effectiveUserId/.test(DO));
ok('인계면 user-joined 방송을 생략(상대 화면에 새 타일 안 생김)',
   /if \(!inherited\) \{\s*this\.broadcast\(effectiveUserId, \{ type: 'user-joined'/.test(DO));
ok("인계면 '입장했습니다' 안내도 생략(재연결마다 도배 방지)",
   /if \(!inherited\) \{\s*this\.broadcastAll\(\{\s*type: 'chat-message'/.test(DO));

console.log('\n[ ③ 서버 — OFF 경로가 예전과 동일한가(가장 중요) ]');
// stickyUid=false 면 inherited 는 절대 true 가 안 되고 effectiveUserId===userId → 모든 방송이 그대로 나간다.
ok('effectiveUserId 는 userId 로 시작(off 면 끝까지 동일)', /let effectiveUserId = userId;\s*\n\s*let inherited = false;/.test(DO));
ok('4001 close 는 sticky 여부와 무관하게 항상 실행(기존 유령타일 방어 유지)',
   /oa\.clientId === clientId\) \{[\s\S]{0,900}try \{ other\.close\(4001, 'superseded-by-reconnect'\); \} catch \{\}/.test(DO));

console.log('\n[ ④ 클라 — 재연결 정리를 정체성으로 판단 ]');
ok('onopen 이 즉시 vcCleanupAllPeers 하지 않고 플래그만 세운다',
   /window\.__vcWasReconnect = isReconnect;/.test(IDX)
   && !/isReconnect && typeof vcCleanupAllPeers === 'function'\) \{\s*\n\s*console\.log\('\[WebSocket\] 재연결 감지/.test(IDX));
ok('room-joined 에서 userId 가 바뀌었으면 정리(off/첫입장=기존 동작)',
   /_wasReconnect && typeof vcCleanupAllPeers[\s\S]{0,140}msg\.data\.userId !== _prevUserId\)[\s\S]{0,120}vcCleanupAllPeers\(\)/.test(IDX));
ok('room-joined 에서 userId 가 같으면 살아있는 연결 보존(무중단)',
   /정체성 유지 → 살아있는 연결 보존/.test(IDX));
ok('🛟 room-joined 미수신 경로(관찰자 등) 안전망 — 4초 후 폴백 정리',
   /__vcWasReconnect && typeof vcCleanupAllPeers[\s\S]{0,140}재연결 폴백 정리/.test(IDX));

console.log('\n[ ⑤ 클라 — 살려 둔 연결을 스스로 부수지 않는다 ]');
ok('existing-users 에서 이미 connected 인 상대에겐 offer 재발사 안 함',
   /var _epc = vcPeerConnections\[user\.userId\];[\s\S]{0,220}connectionState === 'connected'[\s\S]{0,120}return;/.test(IDX));

console.log('\n[ ⑥ 기존 안전장치가 살아 있는가(회귀 방지) ]');
ok('pong 워치독 유지', /PONG_MAX_MISS/.test(IDX) && /pong-timeout/.test(IDX));
ok('순단 유령타일 유지 로직 유지', /vcMarkPeerReconnecting/.test(IDX));
ok('dropped 자동종료 안 함 유지', /조용한 끊김은 종료 카운트를 쌓지 않음/.test(IDX));

console.log(`\n결과: ${PASS} 통과, ${FAIL} 실패`);
if (FAIL) { console.log('실패:', FAILS.join(', ')); process.exit(1); }
