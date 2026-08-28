// 🎥 녹화 목록이 «사실» 을 말하는지 감시 — 2026-08-28
//
// [무엇이 문제였나]
//   관리자 › 녹화 목록의 재생 칸이 «재생할 파일이 없다 + 녹화중이 아니다» 단 하나로 판정해
//   성격이 전혀 다른 것들에 전부 「업로드 대기」를 붙였다. 그런데 그중 어느 것도 기다리면
//   올라오는 것이 아니다 — 실패분을 다시 올리는 코드가 저장소에 0곳이고, 보관만료분은
//   올라올 파일 자체가 없다.
//   2026-08-28 운영 D1 실측(2,022행): 목록 1,862건 중 **1,236건(66%)이 보관만료 삭제분**이라
//   정작 손봐야 할 「저장 실패 76건」이 그 안에 파묻혀 보이지 않았다.
//   사장님 질문 「이거 영상 없는 이유가 뭐야?」가 나온 화면이 정확히 이 상태였다.
//
// [왜 문자열 검사만으로는 모자란가]
//   함수도 값도 다 «있고» 틀린 것은 «무슨 글자가 나오는가» 뿐이라, 수리 전에도 회귀 하니스가
//   전부 초록이었다. 그래서 여기서는 **판정부를 소스에서 오려 내 실제로 돌리고**,
//   서버 WHERE 절도 **진짜 SQLite 에 돌려서** 판정한다.
//
// 실행: node test-harness/recording_status_label_harness.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => readFileSync(resolve(__dir, p), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};
// ⚠️ 부정 검사는 주석을 벗긴 사본으로 — 「왜 고쳤나」 설명 주석이 그 낱말을 그대로 담는다(CLAUDE.md 2장)
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const CORE  = rd('../cloudflare-deploy/public/js/adm-core.js');
const MANGO = rd('../cloudflare-deploy/src/api-mango.ts');
const ADMIN = rd('../cloudflare-deploy/public/admin.html');
const APIADM = rd('../cloudflare-deploy/src/api-admin.ts');

/* ══ ① 재생 칸 문구 — 소스에서 오려 내 «실제로 돌린다» ══════════════════════ */
console.log('\n① 재생 칸 문구 — 상태마다 사실을 말하는가 (판정부를 실행)');

const mBlock = CORE.match(/var _pL = \(adminLang === 'en'\);[\s\S]*?playBtn = '<span title="' \+ pend\.h[^\n]*\n/);
check('재생 칸 판정부를 소스에서 찾았다', !!mBlock,
  '이 하니스가 판정부를 못 찾으면 아래 검사는 전부 무의미하다 — 모양이 바뀌었으면 여기부터 고칠 것');

if (mBlock) {
  const body = mBlock[0];
  // eslint 없이 그대로 실행 — adminLang·r·playBtn 만 있으면 도는 조각이다
  const runLabel = (status, lang) => {
    const fn = new Function('adminLang', 'r', 'var playBtn;' + body + 'return playBtn;');
    return fn(lang, { status });
  };

  const KO = {
    recording: '녹화중', upload_failed: '저장 실패', deleted: '보관기간 만료',
    aborted: '녹화 없음', completed: '처리 중',
  };
  for (const [st, want] of Object.entries(KO)) {
    let out = '';
    try { out = runLabel(st, 'ko'); } catch (e) { out = 'ERR:' + e.message; }
    check(`'${st}' → 「${want}」`, out.includes('>' + want + '<'), out);
  }

  // 🔴 핵심 — 어떤 상태에서도 「업로드 대기」가 다시 나오면 안 된다(그 글자가 거짓말이었다)
  const allKo = Object.keys(KO).concat(['weird_new_status']).map((s) => { try { return runLabel(s, 'ko'); } catch { return ''; } }).join('|');
  check('어떤 상태에서도 「업로드 대기」로 되돌아가지 않는다', !allKo.includes('업로드 대기'), allKo.slice(0, 200));
  check('모르는 상태는 「처리 중」으로 떨어진다(조용히 비지 않는다)',
    (() => { try { return runLabel('weird_new_status', 'ko').includes('>처리 중<'); } catch { return false; } })());

  // 다섯 갈래가 실제로 «서로 다른 말» 인가 — 한 줄로 도로 합치면 여기서 걸린다
  const uniq = new Set(Object.keys(KO).map((s) => { try { return runLabel(s, 'ko'); } catch { return s; } }));
  check('상태별 문구가 서로 다르다(다시 하나로 합치지 않았다)', uniq.size === Object.keys(KO).length, uniq.size);

  // 영어도 같은 갈래가 나와야 한다(EN 스태프 Maimai·Melca 가 본다)
  const en = runLabel('upload_failed', 'en');
  check('EN 에서도 실패는 Save failed 로 나온다', en.includes('>Save failed<'), en);

  // 설명(title)이 «기다릴 것이 없다» 는 사실을 담는가
  const failKo = runLabel('upload_failed', 'ko');
  check('저장 실패 설명이 «나중에도 올라오지 않는다» 를 명시한다', /올라오지 않습니다/.test(failKo), failKo.slice(0, 160));
}

/* ══ ② 배지 — 보관만료를 «사고» 로 칠하지 않는가 ═══════════════════════════ */
console.log('\n② 배지 — 보관만료 / 저장실패 / 진짜 미상 을 가르는가');
const d1blk = CORE.match(/else if \(r\.source === 'd1only'\) \{[\s\S]*?\n    \}/);
check('d1only 배지가 상태별로 갈라져 있다', !!d1blk && /r\.status === 'deleted'/.test(d1blk[0]) && /r\.status === 'upload_failed'/.test(d1blk[0]),
  d1blk ? d1blk[0].slice(0, 120) : '(블록 없음)');
check('보관만료는 경고색(주황·빨강)이 아니다', !!d1blk && /'deleted'\)\s*\n?\s*storageBadge[^\n]*#98a2b3/.test(d1blk[0]));
// 「⚠ 영상 없음」(주황)은 «정말 모르는» 경우에만 남아야 한다 — 녹화중·0초중단은 사고가 아니다
check('녹화중·0초중단도 사고색으로 칠하지 않는다',
  !!d1blk && /r\.status === 'recording'/.test(d1blk[0]) && /r\.status === 'aborted'/.test(d1blk[0]),
  d1blk ? d1blk[0].slice(0, 160) : '(없음)');
check('상태 배지에 upload_failed 가 사람 말로 있다', /r\.status === 'upload_failed'\) statusBadge/.test(CORE));
check('상태 배지에 aborted 가 사람 말로 있다', /r\.status === 'aborted'\)\s+statusBadge/.test(CORE));

console.log('\n②-2 요약 줄 — 「영상 없음」에 보관만료를 섞어 세지 않는가');
check('cExpired / cFailed / cD1 세 갈래로 센다',
  /const cExpired = rows\.filter/.test(CORE) && /const cFailed\s+= rows\.filter/.test(CORE)
  && /cD1\s+= rows\.filter\(r => r\.source === 'd1only' && r\.status !== 'deleted' && r\.status !== 'upload_failed'\)/.test(CORE));
check('요약 줄에 「저장 실패」가 별도 숫자로 뜬다', /🔴 저장 실패 ' \+ cFailed/.test(CORE));

/* ══ ③ 서버 WHERE — 소스에서 오려 내 «진짜 SQLite» 에 돌린다 ═══════════════ */
console.log('\n③ 서버 기본 목록 — 보관만료 삭제분을 감추는가 (실제 SQL 실행)');

let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { DatabaseSync = null; }

// 소스에서 «기본 목록일 때 더하는 조건» 을 그대로 오려 낸다
const defBlk = MANGO.match(/if \(!statusNorm \|\| statusNorm === 'all'\) \{([\s\S]*?)\n      \}/);
check('기본 목록 조건 블록을 소스에서 찾았다', !!defBlk);
const conds = defBlk ? [...defBlk[1].matchAll(/whereParts\.push\("([^"]+)"\)/g)].map((m) => m[1]) : [];
check('조건이 2개다(0초 부산물 + 보관만료 삭제분)', conds.length === 2, conds);

if (DatabaseSync && conds.length === 2) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE recordings (id INTEGER PRIMARY KEY, status TEXT, size_bytes INTEGER)`);
  // 2026-08-28 운영 D1 실측 분포를 축소해 그대로 넣는다
  db.exec(`INSERT INTO recordings (id,status,size_bytes) VALUES
    (1,'completed',1000),(2,'deleted',0),(3,'deleted',500),
    (4,'aborted',0),(5,'aborted',900),(6,'upload_failed',0),
    (7,'upload_failed',5000),(8,'recording',NULL)`);
  const where = conds.map((c) => '(' + c.replace(/\br\./g, '') + ')').join(' AND ');
  const got = db.prepare(`SELECT id FROM recordings WHERE ${where} ORDER BY id`).all().map((r) => r.id);
  check('기본 목록에서 삭제(보관만료) 2건이 빠진다', !got.includes(2) && !got.includes(3), got);
  check('기본 목록에서 0초 부산물이 빠진다', !got.includes(4), got);
  check('저장 실패는 «남는다» — 이게 진짜 봐야 할 것이다', got.includes(6) && got.includes(7), got);
  check('완료·녹화중·0초 아닌 중단은 남는다', got.includes(1) && got.includes(8) && got.includes(5), got);

  // 상태를 명시하면 그대로 다 보여야 한다(감추는 것이지 지우는 것이 아니다)
  const del = db.prepare(`SELECT id FROM recordings WHERE status = 'deleted' ORDER BY id`).all().map((r) => r.id);
  check('?status=deleted 로 부르면 그대로 다 보인다', del.length === 2, del);
} else if (!DatabaseSync) {
  console.log('  ⏭  node:sqlite 없음 — SQL 실행 검사 건너뜀(Node 22+ 필요)');
}

/* ══ ④ 「종료」 필터가 늘 0건이던 버그 ═════════════════════════════════════ */
console.log('\n④ 상태 필터 — 화면 option 과 D1 실제 값이 같은 말을 하는가');
check("서버가 'ended' 를 'completed' 로 받아 준다(옛 북마크 대비)",
  /const statusNorm = status === 'ended' \? 'completed' : status;/.test(MANGO));
check('서버 WHERE 가 정규화된 값을 쓴다', /whereBinds\.push\(statusNorm\)/.test(MANGO));
const sel = ADMIN.match(/<select id="rec-status-2"[\s\S]*?<\/select>/);
check('화면 필터를 찾았다', !!sel);
if (sel) {
  const vals = [...sel[0].matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  check('option value 에 D1 에 없는 ended 가 남아 있지 않다', !vals.includes('ended'), vals);
  check('option 에 completed 가 있다', vals.includes('completed'), vals);
  check('option 에 저장 실패(upload_failed)가 있다 — 76건을 찾아갈 길', vals.includes('upload_failed'), vals);
  check('option 에 deleted 가 남아 있다(감춘 것을 볼 길)', vals.includes('deleted'), vals);
}

/* ══ ⑤ 복원 — «완료인데 영상 없음» 을 다시 만들지 않는가 ═══════════════════ */
console.log('\n⑤ 복원 — 파일이 없는데 「완료」로 되돌리지 않는가');
const S_ADM = strip(APIADM);
check("복원이 'ended' 대신 'completed' 로 적힌다", /nextStatus = b\.status === 'ended' \? 'completed' : b\.status/.test(S_ADM));
check('완료로 올리기 전에 R2 실물을 head() 로 확인한다', /bucket\.head\(key\)/.test(S_ADM));
check('실물이 없으면 file_gone 으로 거절한다', /error: 'file_gone'/.test(S_ADM));
check('조회 자체가 실패하면 막지 않는다(통과시키는 쪽으로 실패)', /if \(checked && !proven\)/.test(S_ADM));
check('화면 복원 버튼이 completed 를 보낸다', /setRecordingStatus\(' \+ r\.id \+ ', \\'completed\\'\)/.test(CORE));
check('거절 사유를 사람 말(message)로 보여 준다', /body\.message_en \|\| body\.message/.test(CORE));

console.log(`\n${PASS} PASS / ${FAIL} 실패`);
if (FAIL) console.log('실패 목록:\n  · ' + FAILS.join('\n  · '));
process.exit(FAIL ? 1 : 0);
