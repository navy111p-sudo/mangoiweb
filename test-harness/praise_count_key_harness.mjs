/* ═══════════════════════════════════════════════════════════════════════════
   ⭐ 「수업 중 칭찬 횟수」가 늘 0이던 것 감시 (2026-09-01 신설)

   [무엇이 잘못돼 있었나] 쓰는 쪽과 읽는 쪽의 **키 이름이 어긋나** 있었다:
     · 쓰기(api-points.ts creditPraisePoint) : `{ room: …, awardId: … }`  → **room**
     · 읽기(api-admin.ts · api-points.ts 두 곳): `meta LIKE '%"room_id":"…"%'` → **room_id**
   에러가 안 나고 «0건» 이 정상값처럼 보여서 아무도 몰랐다.

   ⚠️ 통계가 비는 정도가 아니다 — 이 값이 0이면 학부모·강사용 AI 문구가
      「칭찬이 거의 없었는데…」("There was little praise —")로 **강사를 지적한다.**

   [잰 것 — 2026-09-01 D1]
     · `point_rule_log` 의 teacher_praise_point **76건 전부 `room`**, `room_id` 는 **0건**
     · 칭찬이 있는 방 3개, 그중 한 수업은 칭찬 **73회**
     · 🔴 그 문구가 저장되는 표는 `teacher_class_feedback` 이고 **32행 전부**에 적혀 있다
       (2026-07-27 ~ 08-28). 그중 실제로 칭찬이 있던 방은 **2건**(73회·1회) — **부당한 지적**이다.
       나머지 30건은 실제로 0이라 문구가 맞았다.
   ⚠️ 처음엔 `feedback_drafts`·`teacher_feedbacks` 를 세고 「발송 0건」이라 적었는데
      **그 문구가 없는 쪽 경로의 표**였다 — 세는 표를 틀리면 심각도가 통째로 뒤집힌다.

   [검사 방법] 문자열만 보지 않는다 — 정본 쿼리를 소스에서 오려 내 **진짜 SQLite** 에
   실제로 쌓여 있는 모양(`room`)과 앞으로 생길 수 있는 모양(`room_id`)을 함께 넣어 돌린다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
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

const policy = strip(readFileSync(join(SRC, 'point-policy.ts'), 'utf8'));
const points = strip(readFileSync(join(SRC, 'api-points.ts'), 'utf8'));
const admin = strip(readFileSync(join(SRC, 'api-admin.ts'), 'utf8'));

console.log('\n[ A. 세는 자리가 «한 곳» 이다 — 복사돼 있었기 때문에 둘 다 틀렸다 ]');
{
  check('정본 praiseCountForRoom 이 point-policy.ts 에 있다',
    /export async function praiseCountForRoom/.test(policy), '정본이 없다 — 구조가 바뀌었나?');
  /* ⚠️ 부정 검사는 주석 벗긴 사본으로 — 「예전엔 meta LIKE 였다」고 적은 설명 주석이 걸린다. */
  for (const [name, src] of [['api-points.ts', points], ['api-admin.ts', admin]]) {
    check(`${name} 에 그 쿼리를 다시 복사하지 않았다`,
      !/rule_code\s*=\s*'teacher_praise_point'[\s\S]{0,200}?meta LIKE/.test(src),
      '같은 쿼리가 또 생겼다 — 복사본은 반드시 어긋난다(이번 사고가 그것이었다)');
    check(`${name} 이 정본을 부른다`, /praiseCountForRoom\(/.test(src),
      '정본을 안 부르면 그 화면만 조용히 0으로 돌아간다');
  }
}

console.log('\n[ B. 쓰는 키와 읽는 키가 서로 같은 말을 하는가 ]');
{
  /* 🔑 이번 사고의 본질이다 — «글자가 있는가» 가 아니라 «두 곳이 같은 키를 말하는가». */
  /* ⛔ 앵커를 «point_rule_log» 로만 잡고 `[^}]*` 로 자르면 안 된다 — 실측(trap-check)으로
     세 가지가 나왔다: ① 근처에 무관한 JSON.stringify 가 생기면 그것을 «쓰는 쪽» 으로 잡아
     거짓 FAIL ② meta 에 중첩 객체가 들어오면 안쪽 중괄호에서 끊겨 **옆 규칙(class_rating)의
     쓰기로 미끄러져** 거짓 통과(진짜 칭찬 쓰기를 한 번도 안 본다).
     그래서 규칙 이름을 앵커로 쓰고 **중괄호 짝**으로 자른다. */
  const anchor = points.indexOf("'teacher_praise_point', amount, now");
  let writtenKeys = [], found = false;
  if (anchor >= 0) {
    // meta 는 그 bind 목록의 «마지막» 인자라 앵커 **뒤** 에 있다
    const seg = points.slice(anchor, anchor + 400);
    const js = seg.indexOf('JSON.stringify({');
    if (js >= 0) {
      let d = 0, end = -1;
      for (let i = seg.indexOf('{', js); i < seg.length; i++) {
        if (seg[i] === '{') d++; else if (seg[i] === '}') { d--; if (d === 0) { end = i; break; } }
      }
      if (end > 0) {
        found = true;
        /* 최상위 키만 센다 — 중첩 객체 안의 키를 «방 번호» 로 오인하지 않도록 깊이를 본다. */
        const body = seg.slice(seg.indexOf('{', js) + 1, end);
        let dep = 0;
        for (const m of body.matchAll(/([{}])|(\w+)\s*:/g)) {
          if (m[1] === '{') dep++;
          else if (m[1] === '}') dep--;
          else if (m[2] && dep === 0) writtenKeys.push(m[2]);
        }
      }
    }
  }
  check('쓰는 쪽의 meta 모양을 찾았다(칭찬 INSERT 를 앵커로)', found,
    'creditPraisePoint 의 point_rule_log INSERT 를 못 찾았다 — 구조가 바뀌었나?');
  check(`쓰는 키에 방 번호가 들어 있다(${writtenKeys.join(',')})`,
    writtenKeys.includes('room') || writtenKeys.includes('room_id'),
    '방 번호를 안 적으면 어떤 키로도 셀 수 없다');
  const readKeys = [...policy.matchAll(/json_extract\(meta,\s*'\$\.(\w+)'\)/g)].map((m) => m[1]);
  check(`읽는 키가 쓰는 키를 포함한다(읽기: ${readKeys.join(',')})`,
    writtenKeys.some((k) => readKeys.includes(k)),
    '쓰는 키를 안 읽으면 «에러 없이 늘 0» 이 된다 — 정확히 이번 사고다');
}

console.log('\n[ C. 정본 쿼리를 진짜 SQLite 에 돌린다 ]');
{
  /* 손으로 옮겨 적지 않고 소스에서 오려 낸다 — 옮겨 적으면 «검사는 통과하는데 실물은 다른»
     상태가 된다(규칙서 2장, 하니스가 옛 계약을 외우는 사고). */
  const m = policy.match(/`(SELECT COUNT\(\*\) AS c FROM point_rule_log[\s\S]*?)`/);
  check('정본 SQL 을 소스에서 오려 냈다', !!m && /json_extract/.test(m[1]), '정본 쿼리를 못 찾았다');
  const sql = m ? m[1] : '';

  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE point_rule_log (user_id TEXT, rule_code TEXT, amount INTEGER, triggered_at INTEGER, txn_id INTEGER, meta TEXT);`);
  const add = (rule, meta) => db.prepare(`INSERT INTO point_rule_log VALUES ('u',?,5,1,1,?)`).run(rule, meta);
  const R = 'class-895-20260825';
  // 실제로 쌓여 있는 모양(76건이 전부 이것)
  for (let i = 0; i < 3; i++) add('teacher_praise_point', JSON.stringify({ room: R, awardId: 'a' + i }));
  // 앞으로 누가 이렇게 적을 수도 있는 모양
  add('teacher_praise_point', JSON.stringify({ room_id: R }));
  // 세면 안 되는 것들
  add('teacher_praise_point', JSON.stringify({ room: 'class-999-20260101' }));  // 다른 방
  add('class_rating', JSON.stringify({ room: R }));                             // 다른 규칙
  add('teacher_praise_point', null);                                            // meta 없음
  add('teacher_praise_point', '{깨진 JSON');                                     // JSON 아님

  let ran = null, threw = null;
  try { ran = db.prepare(sql).get(R); } catch (e) { threw = e; }
  check('meta 가 깨진 행이 섞여도 죽지 않는다', threw === null, String(threw && threw.message));
  check('실제로 쌓인 모양(room)을 센다 — 이번 사고의 핵심', (ran?.c || 0) >= 3,
    '센 값: ' + JSON.stringify(ran) + '\n       → 3 미만이면 76건이 여전히 안 보이는 것이다');
  check('앞으로 생길 모양(room_id)도 함께 센다', (ran?.c || 0) === 4,
    '센 값: ' + JSON.stringify(ran) + ' — 한쪽만 세면 나중에 조용히 반쪽이 된다');

  const other = db.prepare(sql).get('class-999-20260101');
  check('다른 방의 칭찬을 세지 않는다', (other?.c || 0) === 1, JSON.stringify(other));
  const none = db.prepare(sql).get('class-000-19700101');
  check('칭찬이 없는 방은 0이다', (none?.c || 0) === 0, JSON.stringify(none));
  /* 부분일치 사고 방지 — LIKE 로 짜면 방 번호가 접두사인 다른 방까지 셌다. */
  add('teacher_praise_point', JSON.stringify({ room: R + '-extra' }));
  const again = db.prepare(sql).get(R);
  check('방 번호가 접두사인 다른 방을 끌어오지 않는다', (again?.c || 0) === 4,
    '센 값: ' + JSON.stringify(again) + ' — LIKE 로 짜면 여기서 5가 된다');
}

console.log('\n[ D. 0일 때 강사를 지적하는 문구가 있다 — 그래서 0이 «사실» 이어야 한다 ]');
{
  /* 이 검사는 «문구를 지워라» 가 아니다. 그 문구가 있다는 것을 기록해 두어,
     칭찬 세는 코드를 건드릴 때 «틀리면 강사가 부당하게 지적당한다» 는 것을 알게 한다. */
  check('칭찬 0일 때 강사에게 「칭찬이 거의 없었다」고 쓴다(그래서 0이 정확해야 한다)',
    /칭찬이 거의 없었/.test(points) && /little praise/.test(points),
    '문구가 바뀌었다면 이 주석과 머리말도 함께 고칠 것');
  check('칭찬이 있으면 그 횟수를 그대로 적는다',
    /칭찬을 \$\{praiseCount\}회/.test(points),
    '횟수를 안 쓰면 이 값을 고쳐도 화면이 안 달라진다');
}

console.log('\n────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n🚨 praise_count_key_harness 실패'); process.exit(1); }
console.log('🎉 praise_count_key_harness — 전부 통과');
