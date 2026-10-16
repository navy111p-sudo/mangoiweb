// 🚪 옛 주소 test.mangoi.co.kr 비활성화 감시 (2026-10-16)
//   정본 src/legacy-host-retire.ts 를 타입만 벗겨 «실제로 돌려» 봅니다.
//   「막는다」 옆에 「다른 주소는 안 막는다」·「옛 앱 업데이트 경로는 연다」를 짝으로 둡니다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.RETIRE_SRC || join(ROOT, 'cloudflare-deploy/src/legacy-host-retire.ts');
const IDX = join(ROOT, 'cloudflare-deploy/src/index.ts');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  ❌ FAIL', name); } };

let mod = null;
try {
  const ts = readFileSync(SRC, 'utf8')
    .replace(/export const RETIRED_HOSTS: readonly string\[\] =/, 'const RETIRED_HOSTS =')
    .replace(/export const /g, 'const ')
    .replace(/export function /g, 'function ')
    .replace(/\(path: string\): boolean/, '(path)')
    .replace(/\(url: URL, request: Request\): Response \| null/, '(url, request)');
  mod = new Function(ts + '\nreturn { RETIRED_HOSTS, retiredHostPassThrough, retiredHostResponse };')();
} catch (e) { console.log('  ❌ 정본을 실행하지 못함:', e.message); }
ok('정본을 오려 내 실행했다', !!mod);

const req = (u, h = {}, method = 'GET') => new Request(u, { method, headers: h });
const run = (u, h, m) => { try { return mod.retiredHostResponse(new URL(u), req(u, h, m)); } catch (e) { return 'CRASH:' + e.message; } };

if (mod) {
  const home = run('https://test.mangoi.co.kr/');
  ok('옛 주소 첫 화면은 막는다(410)', home instanceof Response && home.status === 410);
  ok('안내 페이지에 새 주소 링크가 있다', home instanceof Response && (await home.text()).includes('https://mangoi.ai/'));
  const api = run('https://test.mangoi.co.kr/api/class/sessions/today');
  ok('옛 주소 API 는 JSON 410', api instanceof Response && api.status === 410 && (await api.json()).error === 'host_retired');
  const ws = run('https://test.mangoi.co.kr/ws/room?room=x', { Upgrade: 'websocket' });
  ok('옛 주소 화상수업(WebSocket)도 막는다', ws instanceof Response && ws.status === 410);
  ok('리다이렉트하지 않는다', home instanceof Response && !home.headers.get('Location'));
  // 짝: 열어 두는 것
  ok('app-version.json 은 통과(옛 앱 업데이트)', run('https://test.mangoi.co.kr/app-version.json') === null);
  ok('downloads/ 는 통과(APK)', run('https://test.mangoi.co.kr/downloads/mangoi.apk') === null);
  ok('mangoi.ai 는 안 막는다', run('https://mangoi.ai/') === null);
  ok('mangoi.ai API 는 안 막는다', run('https://mangoi.ai/api/class/sessions/today') === null);
  ok('workers.dev 는 안 막는다', run('https://webrtc-unified-platform-prod.navy111p.workers.dev/') === null);
  ok('www.mangoi.co.kr(구 서버 주소)은 해당 없음', run('https://www.mangoi.co.kr/') === null);
  ok('/downloads 비슷한 경로는 막는다', run('https://test.mangoi.co.kr/downloadsX') instanceof Response);
}

// 배선: index.ts 의 handle() 이 실제로 부르고, 그 결과로 돌아가는가
const idx = readFileSync(IDX, 'utf8');
const hStart = idx.indexOf('async handle(request: Request');
const body = hStart >= 0 ? idx.slice(hStart, hStart + 6000) : '';
const callAt = body.search(/const (\w+) = retiredHostResponse\(url, request\);\s*if \(\1\) return \1;/);
ok('handle() 이 retiredHostResponse 결과로 돌아간다', callAt > 0);
ok('라우팅(첫 path 분기)보다 앞에서 부른다', callAt > 0 && callAt < body.indexOf("if (path === '/api/student/speech-preferences')"));
ok('import 가 있다', /import \{ retiredHostResponse \} from '\.\/legacy-host-retire'/.test(idx));

console.log(`legacy_host_retire_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
