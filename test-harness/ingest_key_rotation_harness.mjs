// 🔐 공유키 무중단 회전 하니스 — 2026-08-07
//   배경: 이 저장소는 **공개(public)** 인데 wrangler.toml [vars] 에 공유키가 그대로 커밋돼 있었다.
//     · PAYROLL_INGEST_KEY  → 급여 인제스트 + 리텐션 인제스트 + (원래는) 학부모 성향 링크 HMAC
//     · UPTIME_HOOK_KEY     → 장애 웹훅(UptimeRobot)
//   키를 보내는 쪽이 저장소 밖(카페24 스크립트 2개 · UptimeRobot)이라 한쪽만 바꾸면
//   급여 투입이 403 이 되고 장애 문자가 안 나간다 — 둘 다 «조용히» 끊기는 종류다.
//
//   그래서 회전을 4단계로 나눴다:
//     1) 새 키·옛 키 «둘 다» 인정하는 코드 배포 (새 키 미설정 → 동작 무변경)
//     2) 새 키를 wrangler secret 으로 등록 (신·구 모두 통함)
//     3) 외부 호출자를 새 키로 교체
//     4) wrangler.toml 에서 옛 키 삭제 → **이때 비로소 노출이 닫힌다**
//
//   이 하니스가 고정하는 것:
//     ① keyMatchesAny 가 «둘 다 인정» 하고, 후보가 없으면 fail closed
//     ② 세 검증부가 전부 그 함수를 쓰고 «옛 키 이름»도 후보에 넣는다(3단계 전까지 안 끊기게)
//     ③ traits 는 전용 secret 으로 분리됐고 **옛 키를 인정하지 않는다**(공개된 키로 위조 못 하게)
//     ④ 🔴 traits 의 fail-closed 가 «빈 토큰 우회» 를 만들지 않는다
//        (traitsToken 이 '' 를 돌려주는데 t 도 '' 면 `'' !== ''` 가 false → 그냥 통과해 버린다)
//     ⑤ 새 키를 실수로 [vars] 에 넣지 않았다(넣으면 공개 저장소에 다시 실린다)
//
//   실행: node test-harness/ingest_key_rotation_harness.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const require = createRequire(import.meta.url);
const S = (f) => readFileSync(join(ROOT, 'cloudflare-deploy', 'src', f), 'utf8');

const util = S('api-util.ts');
const traits = S('api-traits.ts');
const payroll = S('api-payroll-auto.ts');
const retention = S('api-retention.ts');
const uptime = S('api-uptime.ts');
const toml = readFileSync(join(ROOT, 'cloudflare-deploy', 'wrangler.toml'), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/* ── 준비: 실제 함수를 떼어내 돌린다 (grep 만으로는 «진짜 막히는지» 를 못 본다) ── */
console.log('\n[ 준비: keyMatchesAny · traitsTokenValid 를 실제로 실행 ]');
const esbuild = require(join(ROOT, 'cloudflare-deploy', 'node_modules', 'esbuild'));
const dir = mkdtempSync(join(tmpdir(), 'mangoi-keyrot-'));

function loadTs(code, exportsLine) {
  const js = esbuild.transformSync(code + '\n' + exportsLine, { loader: 'ts', format: 'esm' }).code;
  const f = join(dir, 'm' + Math.abs(hash(code)) + '.mjs');
  writeFileSync(f, js, 'utf8');
  return import(pathToFileURL(f).href);
}
function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

const kmSrc = util.slice(util.indexOf('export function keyMatchesAny'));
const km = (await loadTs(kmSrc.slice(0, kmSrc.indexOf('\n}') + 2), '')).keyMatchesAny;
check('keyMatchesAny 를 떼어내 로드', typeof km === 'function');

/* ── ① 둘 다 인정 + fail closed ── */
console.log('\n[ ① 새 키·옛 키 둘 다 인정하되, 후보가 없으면 막는다 ]');
check('새 키로 통과', km('NEW123', 'NEW123', 'OLD999') === true);
check('옛 키로도 통과 (3단계 전까지 안 끊긴다)', km('OLD999', 'NEW123', 'OLD999') === true);
check('엉뚱한 키는 거부', km('WRONG', 'NEW123', 'OLD999') === false);
check('빈 키는 거부', km('', 'NEW123', 'OLD999') === false && km('   ', 'NEW123', 'OLD999') === false);
check('🔴 후보가 둘 다 없으면 «누구도» 통과 못 한다(fail closed)',
  km('anything', undefined, undefined) === false && km('', undefined, undefined) === false);
check('🔴 후보가 빈 문자열이어도 통과 못 한다', km('', '', '') === false && km(' ', '  ', '') === false);
check('앞뒤 공백은 무시하고 비교', km(' NEW123 ', 'NEW123', undefined) === true);
check('null/undefined 입력에도 안 터진다', km(null, 'K') === false && km(undefined, 'K') === false);

/* ── ② 4단계 완료 — 이제 «새 키 하나만» 인정해야 한다 ── */
console.log('\n[ ② 급여·리텐션·장애웹훅 세 곳이 «새 키만» 인정하는가 (4단계 완료 상태) ]');
for (const [name, src, nw, old] of [
  ['급여 인제스트', payroll, 'PAYROLL_INGEST_KEY_NEW', 'PAYROLL_INGEST_KEY'],
  ['리텐션 인제스트', retention, 'PAYROLL_INGEST_KEY_NEW', 'PAYROLL_INGEST_KEY'],
  ['장애 웹훅', uptime, 'UPTIME_HOOK_KEY_NEW', 'UPTIME_HOOK_KEY'],
]) {
  /* ⚠️ `(env as any)` 안의 ')' 때문에 [^)]* 로는 인자 목록을 못 짚는다(uptime 이 그 형태다).
     캐스트와 공백을 먼저 걷어낸 뒤 «순서» 만 본다 — 새 키가 앞, 옛 키가 뒤. */
  const flat = src.replace(/\(env as any\)/g, 'env').replace(/\s+/g, '');
  /* ⚠️ 예전에는 `keyMatchesAny(given,env.<새키>)` 를 **글자 그대로** 못 박았습니다. 그래서
     2026-09-09 에 장애 웹훅에 시험용 칸(`UPTIME_HOOK_KEY_TEST`)을 «더하는» 변경에서
     보장은 그대로인데 검사만 빨간불이 났습니다(같은 이유로 `watchdog_layer2_harness` 도 깨짐).
     ✅ 물어야 할 것은 «후보가 하나뿐인가» 가 아니라 다음 둘입니다 —
        ㉠ 새 키가 **첫 후보**인가 ㉡ 후보가 전부 **그 이름 계열의 환경변수**인가
        (옛 키 불인정은 바로 아래 검사가 짝으로 봅니다). */
  const base = nw.replace(/_NEW$/, '');
  const args = (flat.match(/keyMatchesAny\(given,([^;]*?)\)\)/) || [])[1];
  const cands = args ? args.split(',').map((s) => s.trim()).filter(Boolean) : [];
  check(`${name}: 새 키(${nw})가 «첫» 후보다`, cands[0] === `env.${nw}`, args);
  check(`${name}: 후보가 전부 «${base}_*» 환경변수다 (항상 통과하는 값이 안 섞였다)`,
    cands.length >= 1 && cands.every((c) => new RegExp(`^env\\.${base}_[A-Z_]+$`).test(c)), args);
  /* 🔒 옛 키를 다시 후보에 넣으면 공개돼 있던 값이 되살아난다. 되돌아가지 않게 못 박는다. */
  check(`${name}: 🔴 옛 키(${old})를 더 이상 후보로 넣지 않는다`,
    !new RegExp('keyMatchesAny\\([^)]*env\\.' + old + '[,)]').test(flat),
    (flat.match(/keyMatchesAny\([^;]{0,90}/) || [])[0]);
  check(`${name}: 옛 방식(단일 비교)이 남아 있지 않다`,
    !/const expected = String\([^)]*(PAYROLL_INGEST_KEY|UPTIME_HOOK_KEY)[^)]*\)\.trim\(\);/.test(src));
}

/* ── ③ traits 는 분리 + 옛 키 불인정 ── */
console.log('\n[ ③ traits — 전용 secret 으로 분리하고 옛 키는 인정하지 않는다 ]');
check('TRAITS_LINK_SECRET 를 쓴다', /env\.TRAITS_LINK_SECRET/.test(traits));
/* ⚠️ 주석에 «예전 폴백 'mangoi-traits' 를 없앴다», «PAYROLL_INGEST_KEY 에서 떼어냈다» 라고
   적어 뒀기 때문에 원문 그대로 검사하면 내 설명글을 잡는다 → 주석을 걷어낸 «코드»만 본다. */
const traitsCode = traits.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
check('🔴 traits 서명에 PAYROLL_INGEST_KEY 를 더 이상 쓰지 않는다(코드 기준)', !/PAYROLL_INGEST_KEY/.test(traitsCode));
check('🔴 추측 가능한 폴백 상수를 없앴다(코드 기준)', !/'mangoi-traits'/.test(traitsCode));
check('secret 없으면 토큰을 만들지 않는다(fail closed)', /if \(!keyStr\)[\s\S]{0,180}?return '';/.test(traits));
check('검증은 traitsTokenValid 로 통일 — 직접 비교가 없다',
  !/!==\s*await traitsToken\(/.test(traits.replace(/\/\*\*[\s\S]*?\*\//g, '')));
check('두 경로(get·save) 모두 traitsTokenValid 사용',
  (traits.match(/await traitsTokenValid\(/g) || []).length >= 2);

/* ── ④ 🔴 빈 토큰 우회가 없는가 — 실제로 돌려 확인 ── */
console.log('\n[ ④ 🔴 fail-closed 가 «빈 토큰 우회» 를 만들지 않는가 (실행 검증) ]');
{
  const from = traits.indexOf('export async function traitsToken');
  const to = traits.indexOf('async function saveTraits');
  const block = traits.slice(from, to);
  // traitsToken 은 원본에서 이미 export 라 다시 내보내면 중복이 된다 → 검증 헬퍼만 추가로 내보낸다
  const m = await loadTs(block, 'export { traitsTokenValid };');
  const withSecret = { TRAITS_LINK_SECRET: 'S3CRET-VALUE' };
  const noSecret = {};

  const good = await m.traitsToken(withSecret, 'stu1');
  check('secret 있으면 20자 토큰 생성', typeof good === 'string' && good.length === 20, good);
  check('secret 없으면 빈 토큰', (await m.traitsToken(noSecret, 'stu1')) === '');
  check('정상 토큰은 통과', (await m.traitsTokenValid(withSecret, 'stu1', good)) === true);
  check('다른 학생의 토큰은 거부(열거 방지)', (await m.traitsTokenValid(withSecret, 'stu2', good)) === false);
  check('빈 토큰은 거부', (await m.traitsTokenValid(withSecret, 'stu1', '')) === false);
  check('🔴 secret 미설정 + 빈 토큰 → 거부 (여기가 우회 지점이었다)',
    (await m.traitsTokenValid(noSecret, 'stu1', '')) === false);
  check('🔴 secret 미설정 + 아무 토큰 → 거부',
    (await m.traitsTokenValid(noSecret, 'stu1', 'whatever')) === false);
  check('🔴 옛 키(공개된 값)로 만든 토큰은 통하지 않는다',
    (await m.traitsTokenValid(withSecret, 'stu1',
      await m.traitsToken({ TRAITS_LINK_SECRET: '9c4f7a2e15b83d6079e1c4a8f2b5d3e6' }, 'stu1'))) === false);
}

/* ── ⑤ 새 키를 [vars] 에 넣지 않았는가 ── */
console.log('\n[ ⑤ 새 키가 공개 저장소에 다시 실리지 않았는가 ]');
for (const k of ['PAYROLL_INGEST_KEY_NEW', 'UPTIME_HOOK_KEY_NEW', 'TRAITS_LINK_SECRET']) {
  check(`${k} 가 wrangler.toml 에 값으로 들어있지 않다(주석은 허용)`,
    !new RegExp('^\\s*' + k + '\\s*=', 'm').test(toml));
}
/* 🔒 4단계 완료 — 옛 키는 파일에서 사라져야 한다.
   여기서 다시 [vars] 로 들어오면 «공개 저장소에 키를 커밋» 하던 상태로 되돌아간다.
   이 저장소는 지금 private 이지만, 그건 두 번째 방어선이지 첫 번째가 아니다. */
check('🔴 옛 키가 [vars] 에서 제거됐다',
  !/^UPTIME_HOOK_KEY\s*=/m.test(toml) && !/^PAYROLL_INGEST_KEY\s*=/m.test(toml));
check('🔴 옛 키 «값» 자체가 파일 어디에도 없다',
  !/9c4f7a2e15b83d6079e1c4a8f2b5d3e6/.test(toml) && !/74d3de23b5d488a03a6ea10c7bb48c4632e3/.test(toml));
/* 두 [vars] 블록 모두에 «다시 넣지 말 것» 경고가 남아 있어야 한다.
   ⚠️ 배너 문구를 글자 그대로 박지 않는다 — 문구를 다듬었다는 이유로 하니스가 깨지면
      사람이 «하니스가 또 틀렸네» 하고 무시하기 시작한다. 지키려는 건 문장이 아니라 **경고의 존재**다. */
check('두 [vars] 블록 모두에 «다시 넣지 말 것» 경고가 남아 있다',
  (toml.match(/(never|do not) put .*back/gi) || []).length === 2,
  (toml.match(/(never|do not) put .*back/gi) || []).length);

/* ── ⑥ 역검증: 되돌리면 실제로 실패하는가 ── */
console.log('\n[ ⑥ 역검증 — 되돌리면 검사가 실패하는가 ]');
{
  const strip = (t) => t.split('\n').filter((l) => !/keyMatchesAny|traitsTokenValid|TRAITS_LINK_SECRET|_NEW/.test(l)).join('\n');
  const core = (t) => [/keyMatchesAny\(/.test(t)];
  check('급여: 지금은 참', core(payroll).every(Boolean));
  check('급여: 걷어내면 거짓', core(strip(payroll)).every((v) => v === false));
  check('traits: 지금은 참', /traitsTokenValid/.test(traits) && /TRAITS_LINK_SECRET/.test(traits));
  check('traits: 걷어내면 거짓', !/traitsTokenValid/.test(strip(traits)) && !/TRAITS_LINK_SECRET/.test(strip(traits)));
}

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${pass} · 실패 ${fail}`);
console.log('─────────────────────────────────────────────');
process.exit(fail ? 1 : 0);
