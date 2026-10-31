/* ══════════════════════════════════════════════════════════════════════════
   🔴 워커가 두 벌 = 화상수업 방(Durable Object)도 두 벌 — 그 사실을 지키는 감시

   [무슨 사고였나] 2026-08-19.
     중국인 강선생님과 사장님이 **같은 방 번호**(class-849-20260819)를 넣고도 서로를 못 봤다.
     양쪽 화면 모두 「참여자 1명」. 7/31 ~ 8/19 여덟 번의 수업에서 **한 번도 만나지 못했고**,
     매번 「강사 미입장」 알림이 떴는데 출석 기록(D1)에는 강사가 13분간 접속해 있었다.

   [원인] 이 저장소는 워커를 두 벌 배포한다(deploy.ps1 [6] · deploy.yml 1)2)):
     webrtc-unified-platform(기본) 과 webrtc-unified-platform-prod(운영).
     wrangler.toml 이 **환경마다 new_sqlite_classes 를 따로 선언**하므로
     Durable Object 네임스페이스가 갈린다 → idFromName("class-849-20260819") 이
     워커마다 **다른 방**을 만든다. 화상수업 WS 는 location.host 로 붙으므로
     (public/js/idx-main.js 의 createWebSocket) **어느 도메인이냐 = 어느 방이냐** 다.
     강선생님은 test.mangoi.co.kr(당시 기본 워커), 사장님은 mangoi.ai(-prod) 였다.

   [왜 오래 못 찾았나] D1·KV·R2 는 두 환경이 **같은 id** 를 쓴다. 그래서 attendance·
     room_tokens 에는 둘 다 «같은 방에 있었다» 고 남아, **DB 만 보면 정상으로 보인다.**
     갈리는 건 DO 하나뿐이다.

   [이 하니스가 지키는 것]
     ① 두 환경이 D1·KV·R2 를 정말 «같은 id» 로 공유한다 (한쪽만 바뀌면 데이터가 갈린다)
     ② 두 환경이 DO 를 **각자** 선언한다 = 갈린다는 사실이 코드에 남아 있다
     ③ ⛔ wrangler.toml 에 routes 가 없다 — 「도메인을 못 박자」며 넣으면 **적지 않은
        도메인이 다음 배포에서 지워지고**(=mangoi.ai 가 내려감), workers_dev 도 false 로
        추론돼 배포 확인 스크립트가 함께 깨진다. 정말 넣어야 한다면 전부 + workers_dev=true.
     ④ 방 이름 계산식이 서버 두 곳에서 같다 (강사·학생이 다른 방으로 가지 않게)
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => { try { return readFileSync(resolve(__dir, '../' + p), 'utf8'); } catch { return ''; } };

let pass = 0; const fails = [];
const check = (label, ok) => { if (ok) { pass++; console.log('  ✅ ' + label); } else { fails.push(label); console.log('  ❌ ' + label); } };

const toml = read('cloudflare-deploy/wrangler.toml');
// 부정 검사(③)는 주석을 벗겨 낸 사본으로 판정한다 — 위 머리주석의 'routes' 글자에 걸리면 안 된다.
const tomlCode = toml.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

console.log('\n[ ① D1·KV·R2 는 두 환경이 같은 것을 쓴다 ]');
check('wrangler.toml 을 읽을 수 있다', toml.length > 0);
const twice = (re) => (toml.match(re) || []).length === 2;
check('D1 database_id 가 두 환경에 같은 값으로 한 벌씩',
  twice(/database_id\s*=\s*"80a12a77-4d79-4abd-aa9e-f5e39a7b5cf5"/g));
check('KV SESSION_STATE id 가 두 환경에 같은 값으로 한 벌씩',
  twice(/id\s*=\s*"7fc5f228dbd4490eb775637a8f8ba219"/g));
check('R2 버킷이 두 환경에 같은 이름으로 한 벌씩',
  twice(/bucket_name\s*=\s*"webrtc-class-recordings"/g));

console.log('\n[ ② 그런데 Durable Object 는 «갈린다» — 이 사실이 코드에 남아 있는가 ]');
check('기본 환경이 VideoCallRoom 을 선언한다',
  /^\[\[migrations\]\][\s\S]{0,200}?new_sqlite_classes[^\n]*VideoCallRoom/m.test(toml));
check('production 환경이 VideoCallRoom 을 «따로» 선언한다 (= 네임스페이스가 갈리는 지점)',
  /^\[\[env\.production\.migrations\]\][\s\S]{0,200}?new_sqlite_classes[^\n]*VideoCallRoom/m.test(toml));
check('갈린다는 사실이 주석으로 적혀 있다 (다음 사람이 DB 만 보고 헤매지 않게)',
  /Durable Object[\s\S]{0,400}(갈린|다른 방)/.test(toml) || /(갈린|다른 방)[\s\S]{0,400}Durable Object/.test(toml));

console.log('\n[ ③ ⛔ wrangler.toml 에 routes 를 넣지 않는다 (도메인은 대시보드가 정본) ]');
check('routes / route 선언이 없다 — 넣으면 적지 않은 도메인이 지워진다',
  !/^\s*\[\[?(env\.[a-z]+\.)?routes?\]\]?/m.test(tomlCode));
check('왜 넣으면 안 되는지 파일 안에 적혀 있다',
  /routes[\s\S]{0,600}workers_dev/.test(toml));

console.log('\n[ ④ 방 이름 계산식은 강사·학생이 같아야 한다 ]');
const mango = read('cloudflare-deploy/src/api-mango.ts');
const teach = read('cloudflare-deploy/src/api-teacher.ts');
const ROOM = /`class-\$\{s\.id\}-\$\{ymd\}`/;
check('학생(api-mango.ts sessions/today) 이 class-{예약id}-{YYYYMMDD} 를 쓴다', ROOM.test(mango));
check('강사(api-teacher.ts portal) 이 «같은 식» 을 쓴다', ROOM.test(teach));

console.log('\n────────────────────────────────');
console.log(`총 ${pass + fails.length}건 중 ✅ ${pass} 통과 / ❌ ${fails.length} 실패`);
if (fails.length) { console.log('실패:'); for (const f of fails) console.log('  - ' + f); }
