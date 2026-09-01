/* ═══════════════════════════════════════════════════════════════════════════
   🔐 「안 물어봤다」와 「거절했다」를 갈라 적는지 감시 (2026-09-01 신설)

   [무엇을 막나] 동의 화면(js/mango-consent.js)은 **녹화·출석만** 묻고
   voice_analysis·reward·kakao 는 **키 자체를 안 보낸다.** 그런데 서버가 `b.kakao ? 1 : 0`
   으로 적어서 그 셋이 **구조적으로 늘 0** 이었다. 그 0 을 읽는 쪽들이 「거절」로 읽었다:

     · `admin/student.html` 이 빨간 «아니오» 배지를 띄워 **묻지도 않은 것을
       「학부모가 거절했다」로** 직원에게 말했다.
     · `retention.ts` 가 그 값으로 `kakao_ids` 를 파기한다 — 카카오를 연결한 학생이
       수업에 한 번 들어가 동의를 남기는 순간(입장 때 자동으로 남는다) 그날 밤
       연결이 지워진다.

   [잰 것 — 2026-09-01 D1]
     · `consents` 11행 — 녹화 7 · 출석 7 · **음성분석 0 · 보상 0 · 카카오 0**
     · `kakao_ids` 50행 — 전부 2026-06-04 00:46:33 일괄 삽입(`*_mgo…`, 전화 `010-00****`),
       명부에 있는 계정 1명뿐, **동의 기록 0건** ⟹ 두 집합의 교집합이 **0**이다.
   [거기서 내린 판단 — 측정 아님] 그 50행은 시드로 보이고, 지금은 파기 대상이 없다.
     ⚠️ 「**지금까지** 지워진 적이 없다」는 **증명할 수 없다** — 지워지면 흔적이 안 남는다.
        (마지막 1회분만 `GET /api/retention/status` 의 retention:last_run 에서 볼 수 있다.)
     ⟹ 지금 터지고 있는 사고라기보다 **스스로 장전되는 함정**에 가깝다.

   [검사 방법] 문자열만 보지 않는다 — 서버의 «값 정하는 식» 과 파기 SQL 을
   소스에서 오려 내 **진짜 SQLite 에 돌려** 세 상태(물어서 예 / 물어서 아니오 / 안 물어봄)가
   서로 다르게 다뤄지는지 확인한다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
let pass = 0, fail = 0;
const ok = (n) => { console.log('  ✅ ' + n); pass++; };
const no = (n, w) => { console.log('  ❌ ' + n + (w ? '\n       ' + w : '')); fail++; };
const check = (n, c, w) => (c ? ok(n) : no(n, w));

/** 줄 단위 주석 제거 — 블록주석을 정규식 하나로 지우면 짝 없는 «별표+슬래시» 하나에
 *  코드가 통째로 함께 사라진다(이 저장소 index.ts 에서 실측 8만자). */
function strip(src) {
  let inBlk = false;
  return src.split(/\r?\n/).map((raw) => {
    const t = raw.trim();
    if (inBlk) { if (t.includes('*/')) inBlk = false; return ''; }
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlk = true; return ''; }
    if (t.startsWith('//')) return '';
    return raw;
  }).join('\n');
}

const mango = strip(readFileSync(join(SRC, 'api-mango.ts'), 'utf8'));
const retention = strip(readFileSync(join(SRC, 'retention.ts'), 'utf8'));

console.log('\n[ A. 전제 — 동의 화면이 그 세 항목을 «묻지 않는다» ]');
{
  /* 이 검사가 이 하니스 전체의 전제다. 화면이 묻기 시작하면 여기가 먼저 바뀌므로,
     그때는 아래 검사들의 «안 물어봄» 이야기를 다시 읽어야 한다. */
  const c = strip(readFileSync(join(PUB, 'js', 'mango-consent.js'), 'utf8'));
  /* ⛔ 검사 범위를 «길이» 로 자르지 않는다 — 본문에 필드가 늘어 창을 넘으면 뒤에 kakao 를
     넣어도 부정 검사가 «조용히 통과» 하고, 반대로 옆 함수의 글자가 창에 들어오면 거짓 FAIL 이
     난다(실측: 이 창은 이미 save() 를 305자 넘어 modal() 안까지 물고 있었다).
     JSON.stringify( 로 시작하는 **본문 객체를 중괄호 짝으로** 자른다. */
  const bodyStart = c.indexOf('JSON.stringify({', c.indexOf("fetch('/api/consents'"));
  let body = '';
  if (bodyStart >= 0) {
    let d = 0;
    for (let i = c.indexOf('{', bodyStart); i < c.length; i++) {
      if (c[i] === '{') d++; else if (c[i] === '}') { d--; if (d === 0) { body = c.slice(bodyStart, i + 1); break; } }
    }
  }
  check('동의 POST 의 본문 객체를 중괄호 짝으로 잘랐다', body.length > 100 && body.length < 1200,
    '길이 ' + body.length + ' — 구조가 바뀌었나?');
  check('화면은 recording·attendance 는 보낸다', /recording:/.test(body) && /attendance:/.test(body),
    '이 둘까지 안 보내면 동의가 통째로 안 남는다');
  check('화면은 voice_analysis·reward·kakao 를 «안» 보낸다',
    !/voice_analysis:/.test(body) && !/\breward:/.test(body) && !/\bkakao:/.test(body),
    '보내기 시작했다면 이 하니스의 전제가 바뀐 것이다 — 주석을 함께 고칠 것');
}

console.log('\n[ B. 서버가 «안 물어봄» 을 NULL 로 적는다 — 실제로 식을 돌려 본다 ]');
{
  /* 소스에서 «값 정하는 식» 을 오려 내 실제로 평가한다. 문자열로 「?? null 이 있는가」만
     보면 순서가 뒤집혀 있어도 통과한다(이 저장소가 여러 번 밟은 «어디에 있는가» 함정). */
  /* ⚠️ 한 칸만 돌려 보고 나머지는 정규식으로 보면, 뒤가 뒤집혀 있어도(0 과 1 을 바꿔 적어도)
     통과한다. 세 칸을 «전부» 실제로 평가한다. */
  for (const key of ['kakao', 'voice_analysis', 'reward']) {
    const line = mango.split('\n').find((l) => new RegExp('b\\.' + key + '\\b').test(l) && /\?\s*null\s*:/.test(l));
    if (!line) { no(key + ' 값 식을 소스에서 찾았다', '그 칸을 적는 자리를 못 찾았다 — 구조가 바뀌었나?'); continue; }
    ok(key + ' 값 식을 소스에서 찾았다');
    const expr = line.trim().replace(/,\s*$/, '');
    const ev = (b) => Function('b', 'return (' + expr + ');')(b);   // 식이 b 만 참조한다
    check(`  · ${key}: 안 물어봤으면 NULL`, ev({}) === null, '값: ' + JSON.stringify(ev({})));
    check(`  · ${key}: 명시적 null 도 NULL`, ev({ [key]: null }) === null, '값: ' + JSON.stringify(ev({ [key]: null })));
    check(`  · ${key}: 물어서 «아니오» 면 0`, ev({ [key]: false }) === 0, '값: ' + JSON.stringify(ev({ [key]: false })));
    check(`  · ${key}: 물어서 «예» 면 1`, ev({ [key]: true }) === 1, '값: ' + JSON.stringify(ev({ [key]: true })));
  }
  check('녹화·출석은 그대로 0/1 이다(실제로 묻는 항목)',
    /b\.recording \? 1 : 0/.test(mango) && /b\.attendance \? 1 : 0/.test(mango),
    '묻는 항목까지 NULL 이 되면 «동의했는지» 를 알 수 없게 된다');
}

console.log('\n[ C. 파기 SQL 을 진짜 SQLite 에 돌린다 — 세 상태가 다르게 다뤄지는가 ]');
{
  /* 소스의 DELETE 를 그대로 오려 낸다. 손으로 옮겨 적으면 «검사는 통과하는데 실물은 다른»
     상태가 된다(규칙서 2장 — 하니스가 옛 계약을 외우는 사고). */
  const i = retention.indexOf('DELETE FROM kakao_ids');
  const j = retention.indexOf('`', i);
  const sql = retention.slice(i, j);
  check('파기 SQL 을 소스에서 오려 냈다', /kakao_consent = 0/.test(sql) && sql.length > 200,
    '길이 ' + sql.length);

  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE consents (user_id TEXT, kakao_consent INTEGER, consented_at INTEGER, withdrawn_at INTEGER, raw_payload TEXT);
           CREATE TABLE kakao_ids (user_id TEXT, kakao_id TEXT);`);
  const P_ASKED = '{"user_id":"x","kakao":false}';    // 그때 화면이 카카오를 «실제로» 물었다
  const P_NOT = '{"user_id":"x","recording":1}';       // 물은 적이 없다(2026-09-01 이전 11행이 이 모양)
  const seed = [
    ['asked_no', 0, 1000, null, P_ASKED],      // 물어서 «아니오» → 지워야 한다
    ['asked_yes', 1, 1000, null, P_ASKED],     // 물어서 «예» → 남겨야 한다
    ['not_asked', null, 1000, null, P_NOT],    // 안 물어봄(NULL) → 남겨야 한다  ← 이번 수리 ①
    ['legacy_0', 0, 1000, null, P_NOT],        // 0 이지만 «물은 적이 없다» → 남겨야 한다 ← 수리 ②
    ['legacy_nullpay', 0, 1000, null, null],   // raw_payload 가 없다 → 모르면 안 지운다
    ['withdrew', 1, 1000, 2000, P_ASKED],      // 철회 → 지워야 한다
  ];
  for (const [u, k, c, w, pay] of seed) {
    db.prepare(`INSERT INTO consents VALUES (?,?,?,?,?)`).run(u, k, c, w, pay);
    db.prepare(`INSERT INTO kakao_ids VALUES (?,?)`).run(u, u + '_kakao');
  }
  db.prepare(sql).run();
  const left = db.prepare(`SELECT user_id FROM kakao_ids ORDER BY user_id`).all().map((r) => r.user_id);

  check('«안 물어봄»(NULL)은 지워지지 않는다', left.includes('not_asked'),
    '남은 것: ' + left.join(',') + '\n       → 이게 이번 수리의 핵심이다. 묻지도 않고 파기하면 안 된다');
  check('«물어서 아니오»(0)는 지워진다', !left.includes('asked_no'),
    '남은 것: ' + left.join(',') + ' — 진짜 거절은 파기해야 한다(개인정보)');
  check('«철회» 는 지워진다', !left.includes('withdrew'), '남은 것: ' + left.join(','));
  check('«물어서 예»(1)는 남는다', left.includes('asked_yes'), '남은 것: ' + left.join(','));
  check('옛 행(0 이지만 물은 적 없음)도 남는다 — raw_payload 로 가른다', left.includes('legacy_0'),
    '남은 것: ' + left.join(',') + '\n       → 2026-09-01 이전 11행이 이 모양이다. NULL 수리만으로는 못 지킨다');
  check('raw_payload 가 없으면 안 지운다(모르면 남긴다)', left.includes('legacy_nullpay'),
    '남은 것: ' + left.join(','));
}

console.log('\n[ D. 화면이 «모른다» 를 «아니오» 라고 말하지 않는다 ]');
{
  const html = readFileSync(join(PUB, 'admin', 'student.html'), 'utf8');
  const i = html.indexOf("$('overviewConsent')");
  const blk = html.slice(Math.max(0, i - 900), i + 900);
  check('안 물어본 항목은 «—» 로 그린다(ask 헬퍼)', /const ask = \(v\) =>/.test(blk),
    'NULL 을 falsy 로 흘리면 빨간 «아니오» 가 그대로 나온다');
  const three = ['voice_analysis_consent', 'reward_consent', 'kakao_consent'];
  const bad = three.filter((c) => new RegExp(`c\\.${c}\\?yes:no`).test(blk));
  check('세 항목 모두 ask() 를 거친다', bad.length === 0,
    '아직 직접 삼항인 칸: ' + bad.join(', ') + ' — 그 줄만 «거절» 로 남는다');
  /* ⚠️ 위는 부정 검사라, 그 줄들이 창 «밖» 으로 밀려나도 참이 된다. 긍정 검사를 함께 둔다. */
  const seen = three.filter((c) => blk.includes(`ask(c.${c})`));
  check('그 세 줄이 실제로 검사 범위 안에 있다', seen.length === 3,
    '찾은 것: ' + seen.join(', ') + ' — 범위를 놓쳤다면 위 부정 검사는 헛돈 것이다');
  check('«안 물어봄» 을 한/영 사전으로 적는다(강사 다수가 필리핀)',
    /consentUnknown/.test(blk) && /consentUnknown:\{ko:/.test(html),
    '«—» 만 두면 직원이 무엇으로 읽을지 모른다');
  check('녹화·출석은 그대로 예/아니오 다(실제로 묻는 항목)',
    /c\.recording_consent\?yes:no/.test(blk) && /c\.attendance_consent\?yes:no/.test(blk),
    '묻는 항목까지 «—» 가 되면 동의 여부를 화면에서 알 수 없다');
}

console.log('\n────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n🚨 consent_not_asked_harness 실패'); process.exit(1); }
console.log('🎉 consent_not_asked_harness — 전부 통과');
