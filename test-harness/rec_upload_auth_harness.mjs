// 녹화 업로드 경로 권한 가드 회귀 하니스 (2026-08-05)
//
// 배경: /api/recordings/upload/* 는 index.ts 의 인증 게이트보다 **앞에서** 처리된다.
//   진단 중 아무 자격증명 없이 create → 5MiB 파트 반복 → complete 까지 전부 성공했다.
//   즉 주소만 알면 누구나 우리 R2 에 무제한으로 파일을 쌓을 수 있었고(저장 비용),
//   recording_id 를 바꿔가며 남의 녹화 상태도 건드릴 수 있었다.
//
// 토큰 필수화는 교사 브라우저가 토큰을 안 보내면 녹화를 통째로 멈추게 하므로 2단계로 미뤘다.
// 1단계로 «실재하고 지금 녹화 중인 행에만 쓸 수 있게» 묶었고, 이 하니스는 그 가드가
// 사라지지 않았는지 소스에서 확인한다. (가드가 빠지면 조용히 다시 열린다)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CD = path.join(HERE, '..', 'cloudflare-deploy');
const read = (p) => fs.readFileSync(path.join(CD, p), 'utf8');

let fail = 0;
const chk = (l, ok, x) => { console.log(`  ${ok ? '✅' : '❌'} ${l}${x ? '  — ' + x : ''}`); if (!ok) fail++; };

console.log('🔐 녹화 업로드 권한 가드\n');

const r2 = read('src/recordings-r2.ts');

console.log('· 업로드 통로를 «실재하는 녹화» 에 묶었는가 (recordings-r2.ts)');
chk('create: 행이 없거나 recording 이 아니면 거부',
    /!own \|\| own\.status !== 'recording'/.test(r2) && /"not recording" \}, 404\)/.test(r2));
chk('create: 오래된 녹화 차단(UPLOAD_WINDOW_MS)', /UPLOAD_WINDOW_MS/.test(r2));
chk('part: 키가 «지금 녹화 중» 행의 것인지 확인(assertUploadable)',
    /async function assertUploadable/.test(r2) && /const owner = await assertUploadable\(env, key\)/.test(r2));
chk('part: 주인 확인 실패 시 거부', /if \(!owner\)[\s\S]{0,200}?return J\(/.test(r2));
chk('part: 파트 번호 범위 검사', /partNumber < 1 \|\| partNumber > MAX_PART_NUMBER/.test(r2));
chk('장부는 클라이언트가 준 rid 말고 DB 가 인정한 주인으로 기록',
    /const rid = owner\.id/.test(r2) && !/searchParams\.get\("rid"\)/.test(r2));
chk('complete: 키가 그 녹화의 것인지 확인', /existing\.file_url !== b\.key/.test(r2));
chk('abort: 키가 그 녹화의 것인지 확인', /abRow\.file_url !== b\.key/.test(r2));
chk('abort: 완료·삭제된 행은 되돌리지 않음',
    /SET status = 'aborted' WHERE id = \? AND status NOT IN \('completed','deleted'\)/.test(r2));

console.log('\n· 녹화 행 생성 남용 방지 (api-mango.ts)');
const mango = read('src/api-mango.ts');
chk('/api/recordings/start 에 IP 당 속도 제한', /recstart:\$\{ip\}/.test(mango));
chk('제한 초과 시 429 반환', /rate_limited/.test(mango) && /,\s*429\)/.test(mango));
chk('KV 장애가 정상 수업을 막지 않게 catch 로 통과',
    /recstart[\s\S]{0,600}?catch \{[^}]*\}/.test(mango));

console.log(fail === 0 ? '\n🎉 ALL PASS' : '\n💥 ' + fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);
