// 🛰 장애감시 2층(외부 감시) 하니스 — 2026-08-07
//   배경: 1층 감시견은 Cloudflare Worker 안의 cron 이라 **자기 자신의 죽음을 못 잡는다.**
//     워커가 죽으면 cron 도 안 돌고 문자도 못 나간다 — 가장 심각한 장애일수록 더 조용해졌다.
//     오래 «UptimeRobot 이 커버한다» 고 적혀 있었지만 웹훅은 유료 전용이라 **존재한 적이 없었다.**
//     그래서 카페24 서버에 2층(ops/mangoi-watchdog.sh)을 붙이고, 두 층이 서로를 보게 했다.
//
//   이 하니스가 못 박는 것 — 전부 «거짓 경보» 아니면 «침묵» 으로 이어지는 것들:
//     ① 순간 blip 으로 문자가 오면 안 된다 (연속 2회 실패해야 장애)
//     ② 죽어 있는 5분마다 문자가 오면 안 된다 (상태가 바뀔 때만 1회)
//     ③ 문자 발송이 실패했는데 «보냈다» 고 상태를 저장하면 그 장애는 영영 안 알려진다
//     ④ 키가 틀린 것(403)을 서비스 장애로 오인해 사람을 깨우면 안 된다
//     ⑤ 2층이 아직 설치 안 된 상태에서 1층이 «2층 죽었다» 고 울면 안 된다
//     ⑥ 심층 점검(run=probe)은 **문자를 보내면 안 된다** — 감시가 스스로 스팸이 된다
//     ⑦ 1층 하트비트는 상태변화가 없어도 **매번** 찍혀야 한다 (안 그러면 2층이 cron 을 죽은 걸로 본다)
//     ⑧ 감시 스크립트가 public/ 에 들어가면 안 된다 (웹으로 내려받히면 키 구조가 드러난다)
//     ⑨ 회전 끝난 옛 공유키가 다시 살아나면 안 된다 (실제로 브랜치 하나에서 되살아나 있었다)
//
//   실행: node test-harness/watchdog_layer2_harness.mjs
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, chmodSync, readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { createRequire } from 'module';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const require = createRequire(import.meta.url);

const uptimeSrc = readFileSync(join(ROOT, 'cloudflare-deploy', 'src', 'api-uptime.ts'), 'utf8');
const shSrc = readFileSync(join(ROOT, 'ops', 'mangoi-watchdog.sh'), 'utf8');
const toml = readFileSync(join(ROOT, 'cloudflare-deploy', 'wrangler.toml'), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

const dir = mkdtempSync(join(tmpdir(), 'mangoi-wd2-'));

/* ═══════════════════════════════════════════════════════════════════════
   1부. 카페24 스크립트를 **진짜로 실행**한다.
     grep 으로 «FAIL_THRESHOLD=2 라고 적혀 있다» 를 확인해 봐야 소용없다.
     상태기계가 실제로 그렇게 도는지는 돌려 봐야만 안다.
     curl 을 가짜로 갈아끼워 장애 상황을 만든다.
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n[ 1부. 2층 스크립트 실제 실행 — 가짜 curl 로 장애 상황 재현 ]');

const binDir = join(dir, 'bin');
mkdirSync(binDir, { recursive: true });

// 가짜 curl — 인자를 보고 어떤 호출인지 판별해 정해진 답을 돌려준다.
writeFileSync(join(binDir, 'curl'), `#!/bin/bash
args="$*"
case "$args" in
  *--data-binary*)                      # SOLAPI 발송
     # 본문은 인자가 아니라 **파일**(@/tmp/xxx)로 온다 — 인자만 보면 발송을 못 센다.
     for a in "$@"; do
       case "$a" in @*) tr -d '\\n' < "\${a#@}" >> "$FAKE_SMSLOG"; echo "" >> "$FAKE_SMSLOG" ;; esac
     done
     echo "$FAKE_SOLAPI"
     exit 0 ;;
  *run=probe*)  echo "$FAKE_PROBE"; exit 0 ;;
  *uptime-hook*)                        # 워커 경유 보조 발송(SOLAPI 키 없을 때)
     # 워커가 죽었으면 이 호출도 당연히 죽는다 — 그 상황을 진짜로 재현해야 의미가 있다.
     if [ "\${FAKE_PRIMARY_CODE:-200}" != "200" ] && [ "\${FAKE_FALLBACK_CODE:-200}" != "200" ]; then
       exit 7
     fi
     echo "$args" >> "$FAKE_RELAYLOG" 2>/dev/null
     echo '{"ok":true,"sent":true}'
     exit 0 ;;
  *api/health*)
     case "$args" in
       *webrtc-unified-platform*) echo "\${FAKE_FALLBACK_CODE:-200}" ;;
       *)                         echo "\${FAKE_PRIMARY_CODE:-200}" ;;
     esac
     exit 0 ;;
esac
exit 1
`, 'utf8');
chmodSync(join(binDir, 'curl'), 0o755);

// openssl 이 없을 수 있으니(환경 차이) 서명은 흉내만 낸다 — 검증 대상이 아니다.
writeFileSync(join(binDir, 'openssl'), `#!/bin/bash
echo "(stdin)= deadbeef"
`, 'utf8');
chmodSync(join(binDir, 'openssl'), 0o755);

const conf = join(dir, 'alert.env');
writeFileSync(conf, [
  'UPTIME_KEY=testkey',
  'SOLAPI_API_KEY=ak',
  'SOLAPI_API_SECRET=sk',
  'SOLAPI_FROM=0212345678',
  'ALERT_TO=01000000000',
].join('\n') + '\n', 'utf8');

// SOLAPI 키가 아직 없는 상태 — 설치 직후 사장님 서버가 딱 이 모습이다.
const confNoSms = join(dir, 'alert-nosms.env');
writeFileSync(confNoSms, 'UPTIME_KEY=testkey\n', 'utf8');

const logF = join(dir, 'wd.log');
const stateF = join(dir, 'wd.state');
const smsLog = join(dir, 'sms.log');
const relayLog = join(dir, 'relay.log');

const OK_PROBE = '{"ok":true,"probe":{"db":true,"cron_age_sec":300,"cron_stale":false}}';

/* 🪟 윈도우에서도 돌아야 한다 — 배포(deploy.ps1)는 PowerShell 에서 이 하니스를 부른다.
   [실제 사고] 윈도우 경로를 bash 인자로 그대로 넘기면 역슬래시가 이스케이프로 먹혀
   'C:UsersAdmin...' 이 되어 «No such file or directory»(exit 127) 로 죽었다.
   Git Bash 에서 돌릴 땐 통과해서, 배포 게이트에서만 실패하는 «환경 따라 다른» 실패였다.
   → bash 에는 항상 슬래시 경로를, PATH 는 OS 구분자(win=';' posix=':')를 쓴다. */
// ⚠️ 역슬래시를 찾는 정규식은 `/\\/g` 다. `/\/g` 로 쓰면 슬래시가 이스케이프돼 **문법 오류**가 난다.
const toPosix = (p) => String(p).replace(/\\/g, '/');

/* 🔴 [실제 사고] 경로를 슬래시로 바꿔도 PowerShell 에서는 여전히 죽는다.
   PowerShell 이 잡는 `bash` 는 **WSL** 이라 리눅스 파일계를 보고, 'C:/Users/...' 를 못 찾아
   «No such file or directory» 로 죽는다(WSL 은 `/mnt/c/...`, Git Bash 는 `C:/...` 를 이해한다).
   Git Bash 에서 돌릴 땐 통과해서 **배포 게이트에서만** 실패하는 «환경 따라 다른» 실패였다.
   → 윈도우면 Git Bash 를 명시적으로 찾아 그 갈림 자체를 없앤다. 리눅스 CI 에서는 'bash'.
   ⚠️ 이 상수는 **한 곳에만** 두어야 한다 — 두 세션이 각자 추가해 중복 선언(SyntaxError)이 났었다. */
const BASH = (() => {
  if (process.env.MANGOI_BASH) return process.env.MANGOI_BASH;   // 필요하면 밖에서 덮어쓰기
  if (process.platform !== 'win32') return 'bash';
  for (const p of ['C:/Program Files/Git/bin/bash.exe',
                   'C:/Program Files/Git/usr/bin/bash.exe',
                   'C:/Program Files (x86)/Git/bin/bash.exe']) {
    if (existsSync(p)) return p;
  }
  return 'bash';
})();

function runScript(env = {}) {
  const out = execFileSync(BASH, [toPosix(join(ROOT, 'ops', 'mangoi-watchdog.sh'))], {
    env: {
      ...process.env,
      /* 🔴 [실제 사고] 가짜 curl 을 «PATH 앞에 끼워 넣는» 방식은 bash 종류마다 다르게 깨졌다.
         구분자(win ';' vs posix ':')도 문제였지만, Git Bash 는 윈도우 PATH 를 자기 방식으로
         다시 조립해 앞쪽 항목을 아예 무시했다. 그러면 **진짜 사이트로 요청이 나가는데
         진짜 사이트는 200 이라 «장애» 가 재현되지 않는다** — 20건이 조용히 실패했고,
         원인이 «코드가 틀렸다» 인지 «시험 장치가 안 붙었다» 인지 구분할 수 없었다.
         → PATH 를 아예 쓰지 않는다. 스크립트가 실행할 명령을 **환경변수로 직접 받는다**. */
      MANGOI_WD_CURL: toPosix(join(binDir, 'curl')),
      MANGOI_WD_OPENSSL: toPosix(join(binDir, 'openssl')),
      MANGOI_WD_CONF: conf, MANGOI_WD_LOG: logF, MANGOI_WD_STATE: stateF,
      FAKE_SMSLOG: smsLog, FAKE_RELAYLOG: relayLog,
      FAKE_PRIMARY_CODE: '200', FAKE_FALLBACK_CODE: '200',
      FAKE_PROBE: OK_PROBE,
      FAKE_SOLAPI: '{"statusCode":"2000"}',
      ...env,
    },
    encoding: 'utf8', timeout: 30000,
  });
  return out;
}
const state = () => (existsSync(stateF) ? readFileSync(stateF, 'utf8') : '');
const smsBodies = () => (existsSync(smsLog) ? readFileSync(smsLog, 'utf8').trim().split('\n').filter(Boolean) : []);
const smsCount = () => smsBodies().length;
const relayBodies = () => (existsSync(relayLog) ? readFileSync(relayLog, 'utf8').trim().split('\n').filter(Boolean) : []);
const resetAll = () => { for (const f of [stateF, smsLog, logF, relayLog]) { try { writeFileSync(f, ''); } catch {} } };

/* ═══ 🔒 스텁 점검 — 이 하니스의 전제가 살아 있는가 ═══
   [실제 사고] PATH 구분자 하나 때문에 가짜 curl 이 무시되고 **진짜 사이트**로 요청이 나갔다.
   진짜 사이트는 200 을 주니 «장애» 가 재현되지 않고, 20건이 «그냥 실패» 로만 보였다 —
   원인이 «코드가 틀렸다» 인지 «시험 장치가 안 붙었다» 인지 구분할 수 없었다.
   그래서 본 시험 전에 **가짜 curl 이 실제로 먹히는지부터** 확인하고, 아니면 즉시 멈춘다.
   시험 장치가 안 붙은 채 나오는 «통과» 도 «실패» 도 둘 다 거짓말이다. */
{
  resetAll();
  runScript({ FAKE_PRIMARY_CODE: '000', FAKE_FALLBACK_CODE: '000' });
  if (!/FAILS=1/.test(state())) {
    console.log('');
    console.log('  ⛔ 가짜 curl 이 먹히지 않습니다 — 진짜 네트워크로 나가고 있습니다.');
    console.log('     PATH 주입(구분자 ":")과 bash 선택(BASH)을 확인하십시오. 시험을 중단합니다.');
    console.log('');
    process.exit(1);
  }
  console.log('  🔒 스텁 점검 통과 — 가짜 curl 이 실제로 먹힙니다');
}

// ① 정상일 때는 아무 일도 없어야 한다
resetAll();
runScript();
check('정상 → 문자 0통, 상태 up', smsCount() === 0 && /PREV_STATE=up/.test(state()), { state: state() });

// ② 순간 blip 1회로는 문자가 오면 안 된다 — 이게 없으면 감시가 스스로 스팸이 된다
resetAll();
runScript({ FAKE_PRIMARY_CODE: '000', FAKE_FALLBACK_CODE: '000' });
check('1회 실패 → 아직 up, 문자 0통 (blip 무시)', smsCount() === 0 && /PREV_STATE=up/.test(state()) && /FAILS=1/.test(state()), { state: state() });

// ③ 연속 2회면 장애 — 문자 1통
runScript({ FAKE_PRIMARY_CODE: '000', FAKE_FALLBACK_CODE: '000' });
check('연속 2회 실패 → down, 문자 1통', smsCount() === 1 && /PREV_STATE=down/.test(state()), { sms: smsCount(), state: state() });

// ④ 죽어 있는 동안 5분마다 문자가 오면 안 된다
runScript({ FAKE_PRIMARY_CODE: '000', FAKE_FALLBACK_CODE: '000' });
runScript({ FAKE_PRIMARY_CODE: '000', FAKE_FALLBACK_CODE: '000' });
check('계속 죽어 있어도 문자는 여전히 1통 (상태변화 때만)', smsCount() === 1, { sms: smsCount() });

// ⑤ 복구되면 1통
runScript();
check('복구 → 문자 1통 추가(총 2통), 상태 up', smsCount() === 2 && /PREV_STATE=up/.test(state()), { sms: smsCount(), state: state() });
check('장애 문자와 복구 문자의 내용이 실제로 다르다', smsBodies()[0] !== smsBodies()[1] && /복구/.test(smsBodies()[1] || ''), smsBodies());
check('문자가 수신번호·발신번호를 제대로 싣는다', /"to":"01000000000"/.test(smsBodies()[0] || '') && /"from":"0212345678"/.test(smsBodies()[0] || ''), smsBodies()[0]);

// ⑥ 🔴 발송이 실패했는데 상태를 저장하면, 그 장애는 영영 안 알려진다
resetAll();
runScript({ FAKE_PRIMARY_CODE: '000', FAKE_FALLBACK_CODE: '000' });
runScript({ FAKE_PRIMARY_CODE: '000', FAKE_FALLBACK_CODE: '000', FAKE_SOLAPI: '{"errorCode":"ValidationError"}' });
check('발송 실패 → 상태를 down 으로 저장하지 않는다(다음 회차 재시도)', !/PREV_STATE=down/.test(state()), { state: state() });
runScript({ FAKE_PRIMARY_CODE: '000', FAKE_FALLBACK_CODE: '000' });
check('다음 회차에 다시 시도해서 결국 발송된다', smsCount() >= 1 && /PREV_STATE=down/.test(state()), { sms: smsCount(), state: state() });

// ⑦ 키가 틀린 것(403)은 서비스 장애가 아니다 — 사람을 깨우면 안 된다
resetAll();
runScript({ FAKE_PROBE: '{"ok":false,"error":"forbidden"}' });
runScript({ FAKE_PROBE: '{"ok":false,"error":"forbidden"}' });
check('심층점검 403(키 오류) → 장애로 치지 않고 문자 0통', smsCount() === 0 && !/PREV_STATE=down/.test(state()), { sms: smsCount(), state: state() });
check('403 은 로그에는 남는다(조용히 삼키지 않는다)', /403/.test(readFileSync(logF, 'utf8')));

// ⑧ 도메인만 죽은 경우와 전체가 죽은 경우를 구분해야 대응이 갈린다
resetAll();
runScript({ FAKE_PRIMARY_CODE: '000', FAKE_FALLBACK_CODE: '200' });
check("도메인만 실패 → reason='domain' 으로 구분", /reason='domain'/.test(readFileSync(logF, 'utf8')));

// ⑨ 사이트는 멀쩡한데 cron 만 죽은 «조용한 장애» 를 잡는다
resetAll();
const CRON_DEAD = '{"ok":true,"probe":{"db":true,"cron_age_sec":9999,"cron_stale":true}}';
runScript({ FAKE_PROBE: CRON_DEAD });
runScript({ FAKE_PROBE: CRON_DEAD });
check('cron 정지 → 사이트 200 이어도 장애로 잡고 문자 1통', smsCount() === 1 && /reason='cron'/.test(readFileSync(logF, 'utf8')), { sms: smsCount() });

// ⑩ DB만 죽은 경우
resetAll();
const DB_DEAD = '{"ok":true,"probe":{"db":false,"cron_age_sec":300,"cron_stale":false}}';
runScript({ FAKE_PROBE: DB_DEAD });
runScript({ FAKE_PROBE: DB_DEAD });
check('D1 정지 → 사이트 200 이어도 장애로 잡는다', smsCount() === 1 && /reason='db'/.test(readFileSync(logF, 'utf8')), { sms: smsCount() });

// ⑪ 배포 직후 cron 이 아직 한 번도 안 돈 상태(null)를 장애로 오인하면 안 된다
resetAll();
const CRON_NULL = '{"ok":true,"probe":{"db":true,"cron_age_sec":null,"cron_stale":null}}';
runScript({ FAKE_PROBE: CRON_NULL });
runScript({ FAKE_PROBE: CRON_NULL });
check('cron 기록 없음(배포 직후) → 장애 아님, 문자 0통', smsCount() === 0, { sms: smsCount() });

/* ⑫ SOLAPI 키를 아직 안 넣은 상태 — 설치 직후가 딱 이 모습이다.
     이때 «아무 일도 안 일어남» 이면 2층을 붙인 의미가 절반 사라진다.
     워커가 살아 있는 장애(D1·cron·도메인)는 워커를 통해서라도 알려야 한다. */
resetAll();
runScript({ MANGOI_WD_CONF: confNoSms, FAKE_PROBE: DB_DEAD });
runScript({ MANGOI_WD_CONF: confNoSms, FAKE_PROBE: DB_DEAD });
check('SOLAPI 키 없어도 → 워커 경유로 알림이 나간다', relayBodies().length === 1 && /PREV_STATE=down/.test(state()), { relay: relayBodies(), state: state() });
check('워커 경유 호출이 alertType=1(장애)로 나간다', /alertType=1/.test(relayBodies()[0] || ''), relayBodies()[0]);
check('워커 경유 호출이 원인(db)을 실어 보낸다', /db/.test(relayBodies()[0] || ''), relayBodies()[0]);
check('로그가 «완전한 2층이 아님» 을 분명히 남긴다', /relay|보조/.test(readFileSync(logF, 'utf8')));
// 복구도 alertType=2 로
runScript({ MANGOI_WD_CONF: confNoSms });
check('복구는 alertType=2 로 나간다', /alertType=2/.test(relayBodies()[1] || ''), relayBodies()[1]);
// 워커까지 죽으면 보조 경로도 죽는다 → 상태를 저장하지 않고 계속 재시도해야 한다
resetAll();
runScript({ MANGOI_WD_CONF: confNoSms, FAKE_PRIMARY_CODE: '000', FAKE_FALLBACK_CODE: '000' });
runScript({ MANGOI_WD_CONF: confNoSms, FAKE_PRIMARY_CODE: '000', FAKE_FALLBACK_CODE: '000' });
check('🔴 워커가 죽으면 보조 경로도 실패 → 상태 저장 보류(계속 재시도)', !/PREV_STATE=down/.test(state()), { state: state() });

/* ⑬ 🔴 실제로 난 사고 (26-08-07): 안내문의 예시 글자(«발신번호숫자만» 같은 한글)가 설정에 그대로 들어갔다.
     «비어 있지 않다» 만 보던 옛 판정은 그걸 «설정 완료» 로 읽고 직접 발송을 시도했고,
     SOLAPI 는 당연히 거절하는데 **보조 경로는 «키가 있으니 필요 없다» 며 건너뛰었다.**
     커버가 3/4 → **0/4**. 즉 채우기 전보다 나빠진다. 이게 제일 위험한 실패 모양이다. */
const confBad = join(dir, 'alert-bad.env');
writeFileSync(confBad, [
  'UPTIME_KEY=testkey',
  'SOLAPI_API_KEY=발급받은키',
  'SOLAPI_API_SECRET=발급받은시크릿',
  'SOLAPI_FROM=발신번호숫자만',
  'ALERT_TO=받으실번호숫자만',
].join('\n') + '\n', 'utf8');

resetAll();
runScript({ MANGOI_WD_CONF: confBad, FAKE_PROBE: DB_DEAD });
runScript({ MANGOI_WD_CONF: confBad, FAKE_PROBE: DB_DEAD });
check('🔴 설정값이 «한글 예시 글자» 여도 알림이 나간다(워커 경유로 대체)',
  relayBodies().length === 1 && /PREV_STATE=down/.test(state()), { relay: relayBodies().length, state: state() });
check('🔴 SOLAPI 직접 발송을 시도하지 않는다(못 쓸 값으로 쏘면 조용히 실패)', smsCount() === 0, smsCount());
check('로그가 «무엇이 잘못됐는지» 를 짚어 준다', /ALERT_TO=숫자10자리이상이_아님/.test(readFileSync(logF, 'utf8')));
check('로그가 «고치는 법» 까지 알려 준다', /mangoi-alert-setup\.sh/.test(readFileSync(logF, 'utf8')));

// 번호는 맞는데 키만 빠진 «반쯤» 설정도 같은 취급이어야 한다
const confHalf = join(dir, 'alert-half.env');
writeFileSync(confHalf, 'UPTIME_KEY=testkey\nSOLAPI_FROM=0212345678\nALERT_TO=01012345678\n', 'utf8');
resetAll();
runScript({ MANGOI_WD_CONF: confHalf, FAKE_PROBE: DB_DEAD });
runScript({ MANGOI_WD_CONF: confHalf, FAKE_PROBE: DB_DEAD });
check('키만 빠진 반쪽 설정도 워커 경유로 대체된다', relayBodies().length === 1 && smsCount() === 0, { relay: relayBodies().length, sms: smsCount() });

// 반대로, 제대로 채우면 직접 경로로 가야 한다(대체 경로로 새면 2층 의미가 없다)
resetAll();
runScript({ FAKE_PROBE: DB_DEAD });
runScript({ FAKE_PROBE: DB_DEAD });
check('제대로 채운 설정은 SOLAPI 직접 경로로 간다', smsCount() === 1 && relayBodies().length === 0, { sms: smsCount(), relay: relayBodies().length });

// ⑭ --test 는 아무것도 바꾸면 안 된다(사장님이 안심하고 눌러볼 수 있어야 함)
resetAll();
execFileSync(BASH, [toPosix(join(ROOT, 'ops', 'mangoi-watchdog.sh')), '--test'], {
  env: { ...process.env,
         MANGOI_WD_CONF: conf, MANGOI_WD_LOG: logF, MANGOI_WD_STATE: stateF, FAKE_SMSLOG: smsLog,
         MANGOI_WD_CURL: toPosix(join(binDir, 'curl')), MANGOI_WD_OPENSSL: toPosix(join(binDir, 'openssl')),
         FAKE_PRIMARY_CODE: '000', FAKE_FALLBACK_CODE: '000', FAKE_PROBE: OK_PROBE, FAKE_SOLAPI: '{"statusCode":"2000"}' },
  encoding: 'utf8', timeout: 30000,
});
check('--test 는 상태도 안 바꾸고 문자도 안 보낸다', smsCount() === 0 && state().trim() === '', { state: state() });

/* ═══════════════════════════════════════════════════════════════════════
   2부. 워커 쪽 역감시(checkLayer2)를 떼어내 실제로 돌린다.
     «2층이 조용해지면 1층이 알린다» 가 진짜 되는지, 그리고
     **설치 전부터 울지 않는지**(제일 흔한 사고)를 본다.
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n[ 2부. 워커 역감시(checkLayer2) 실제 실행 ]');

const esbuild = require(join(ROOT, 'cloudflare-deploy', 'node_modules', 'esbuild'));
const l2Start = uptimeSrc.indexOf('const LAYER2_STALE_MS');
const l2End = uptimeSrc.indexOf('/** D1(백엔드)이 살아있는지');
const l2Src = uptimeSrc.slice(l2Start, l2End);

const stub = `
let __sms = [];
async function sendPlainSms(env, phone, text) { __sms.push(text); return { ok: !env.__smsFail }; }
type MangoEnv = any;
`;
const js = esbuild.transformSync(stub + l2Src + `
export { checkLayer2, LAYER2_STALE_MS };
export function __smsLog() { return __sms; }
export function __smsReset() { __sms = []; }
`, { loader: 'ts', format: 'esm' }).code;
const mod = join(dir, 'l2.mjs');
writeFileSync(mod, js, 'utf8');
const L2 = await import(pathToFileURL(mod).href);

function fakeKv(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get: async (k) => (m.has(k) ? m.get(k) : null),
    put: async (k, v) => { m.set(k, v); },
    delete: async (k) => { m.delete(k); },
    _m: m,
  };
}
const envWith = (kv, extra = {}) => ({ SESSION_STATE: kv, OWNER_ALERT_PHONE: '01000000000', ...extra });

// ① 아직 설치 전 — 절대 울면 안 된다
L2.__smsReset();
let kv = fakeKv({});
let r = await L2.checkLayer2(envWith(kv));
check('2층 미설치(체크인 기록 없음) → unset, 문자 0통', r.state === 'unset' && L2.__smsLog().length === 0, r);

// ② 방금 체크인 → 정상
L2.__smsReset();
kv = fakeKv({ 'watchdog2:last': String(Date.now() - 60 * 1000) });
r = await L2.checkLayer2(envWith(kv));
check('2층 1분 전 체크인 → ok, 문자 0통', r.state === 'ok' && L2.__smsLog().length === 0, r);

// ③ 30분 넘게 조용 → 1통
L2.__smsReset();
kv = fakeKv({ 'watchdog2:last': String(Date.now() - 45 * 60 * 1000) });
r = await L2.checkLayer2(envWith(kv));
check('2층 45분 침묵 → stale + 문자 1통', r.state === 'stale' && L2.__smsLog().length === 1, { r, sms: L2.__smsLog() });
check('그 문자가 «사이트 장애» 로 읽히지 않는다(감시 얘기임이 드러난다)',
  /감시/.test(L2.__smsLog()[0] || ''), L2.__smsLog()[0]);

// ④ 계속 조용해도 15분마다 반복 발송하면 안 된다
L2.__smsReset();
r = await L2.checkLayer2(envWith(kv));
check('계속 침묵해도 반복 발송 없음', r.state === 'stale' && L2.__smsLog().length === 0, { r, sms: L2.__smsLog() });

// ⑤ 복구되면 1통
L2.__smsReset();
await kv.put('watchdog2:last', String(Date.now()));
r = await L2.checkLayer2(envWith(kv));
check('2층 복구 → 문자 1통 + alerted 해제', r.state === 'ok' && L2.__smsLog().length === 1 && !kv._m.has('watchdog2:alerted'), { r, sms: L2.__smsLog() });

// ⑥ 경계값 — 임계 직전에는 울지 않는다
L2.__smsReset();
kv = fakeKv({ 'watchdog2:last': String(Date.now() - (L2.LAYER2_STALE_MS - 60 * 1000)) });
r = await L2.checkLayer2(envWith(kv));
check('임계 1분 전 → 아직 ok (경계에서 깜빡이지 않게)', r.state === 'ok' && L2.__smsLog().length === 0, r);

// ⑦ KV 가 없으면 조용히 넘어간다(바인딩 사고로 문자 폭탄이 되면 안 됨)
L2.__smsReset();
r = await L2.checkLayer2({ OWNER_ALERT_PHONE: '01000000000' });
check('KV 미바인딩 → unset, 문자 0통', r.state === 'unset' && L2.__smsLog().length === 0, r);

/* ═══════════════════════════════════════════════════════════════════════
   3부. 구조 고정 — 되돌아가기 쉬운 것들
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n[ 3부. 구조 고정 ]');

// ⑥ 심층 점검은 문자를 보내면 안 된다
const probeBlock = uptimeSrc.slice(uptimeSrc.indexOf("=== 'probe'"), uptimeSrc.indexOf("=== 'watchdog'"));
check('run=probe 블록 안에서 문자를 보내지 않는다', !/sendPlainSms/.test(probeBlock));
check('run=probe 가 2층 체크인을 기록한다', /watchdog2:last/.test(probeBlock));
check('run=probe 가 1층 cron 나이를 돌려준다', /cron_age_sec/.test(probeBlock) && /cron_stale/.test(probeBlock));
check('run=probe 는 키 검증 뒤에 온다(무인증 노출 아님)',
  uptimeSrc.indexOf('keyMatchesAny(given') < uptimeSrc.indexOf("=== 'probe'"));

// ⑦ 하트비트는 «상태가 바뀔 때만» 이 아니라 매번 찍혀야 한다
const wdBody = uptimeSrc.slice(uptimeSrc.indexOf('export async function runSiteWatchdog'), uptimeSrc.indexOf('export async function handleUptimeApi'));
const changedBlock = wdBody.slice(wdBody.indexOf('if (cur !== prev)'), wdBody.indexOf("kv.put('watchdog:last'"));
check("watchdog:last 가 «상태변화 블록» 밖에 있다(매번 기록)",
  wdBody.includes("kv.put('watchdog:last'") && !changedBlock.includes("watchdog:last"));
check('runSiteWatchdog 가 역감시를 호출한다', /checkLayer2\(env\)/.test(wdBody));

// ⑧ 감시 스크립트가 웹으로 내려받히면 안 된다
const publicDir = join(ROOT, 'cloudflare-deploy', 'public');
const leaked = readdirSync(publicDir).filter((f) => /watchdog/i.test(f));
check('감시 스크립트가 public/ 에 없다(웹 노출 금지)', leaked.length === 0, leaked);
check('스크립트가 키를 자기 안에 담고 있지 않다(설정 파일에서 읽는다)',
  !/UPTIME_KEY=[0-9a-f]{8}/.test(shSrc) && /\. "\$CONF"/.test(shSrc));

// ⑨ 회전이 끝난 옛 키가 되살아나면 안 된다 (실제로 한 브랜치에서 되살아나 있었다)
check('wrangler.toml 에 옛 PAYROLL_INGEST_KEY 값이 없다', !toml.includes('9c4f7a2e15b83d6079e1c4a8f2b5d3e6'));
check('wrangler.toml 에 옛 UPTIME_HOOK_KEY 값이 없다', !toml.includes('74d3de23b5d488a03a6ea10c7bb48c4632e3'));
/* ⚠️ 이 검사는 «식 모양» 을 글자 그대로 못 박고 있었습니다 — 그래서 2026-09-09 에 시험용 칸
   (`UPTIME_HOOK_KEY_TEST`)을 «더하는» 변경에서, 보장은 그대로인데 검사만 빨간불이 났습니다.
   ✅ 물어야 할 것은 «후보가 몇 개인가» 가 아니라 **«회전이 끝난 옛 키가 되살아났는가»** 입니다.
      (칸을 더하는 것 자체가 안전한 이유는 `uptime_hook_key_harness` 가 따로 못 박습니다.) */
const upGate = (uptimeSrc.match(/keyMatchesAny\(given,[\s\S]*?\n/) || [''])[0];
check('uptime 검증부가 «회전 전» 옛 키 이름을 안 쓴다',
  !!upGate && /UPTIME_HOOK_KEY_/.test(upGate) && !/UPTIME_HOOK_KEY(?![_A-Z])/.test(upGate));
check('uptime 검증부에 열쇠 값을 «글자로» 박아 두지 않았다',
  !!upGate && !/['"][0-9a-zA-Z_-]{12,}['"]/.test(upGate));

// ⑩ 이모지 — Win10 두부 방지(Unicode 13+ 금지). 스크립트/코드에 쓴 것만 본다.
const newEmoji = /[\u{1FA70}-\u{1FAFF}\u{1FBA0}-\u{1FBFF}]/u;
check('Unicode 13+ 이모지를 쓰지 않았다(Win10 두부 방지)', !newEmoji.test(shSrc) && !newEmoji.test(uptimeSrc));

console.log(`\n${fail === 0 ? '✅' : '❌'}  PASS ${pass} / FAIL ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
