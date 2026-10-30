// 📥 학생 단체 등록(public/js/adm-student-bulk.js) — 파일을 «실제로 실행» 해 읽기·검사 함수를 돌린다.
//   화면(모달·업로드·등록 흐름)은 test-harness/manual 이 아니라 사람이 브라우저로 본다 — 여기서는
//   «표를 어떻게 읽고 무엇을 막는가» 와 «서버 경로·관리자 화면 배선» 만.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'cloudflare-deploy/public/js/adm-student-bulk.js');
const ADMIN = path.join(ROOT, 'cloudflare-deploy/public/admin.html');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; } else { fail++; console.log('❌ FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); } };

const code = fs.readFileSync(SRC, 'utf8');
const win = { adminLang: 'ko' };
const sandbox = { window: win, document: {}, console, Blob: function () {}, URL: {}, setTimeout, TextDecoder, DataView, Uint8Array };
try { vm.runInNewContext(code, sandbox); } catch (e) { ok('파일 실행', false, String(e)); }
const B = win.__smBulk;
ok('전제: 함수가 노출됨', !!(B && B.parseDelimited && B.rowsToRecords && B.checkRecords));
ok('전제: 열기 함수', typeof win.smOpenBulkRegister === 'function');

if (B) {
  // ① CSV — BOM·따옴표·쉼표·따옴표 이스케이프·CRLF
  const csv = '﻿아이디(필수),이름(필수),비밀번호,학생전화,학부모전화,소속학원,메모\r\nhong01,홍길동,,1012345678,010-9876-5432,"A, 학원","말 ""안녕"""\r\n';
  const recs = B.checkRecords(B.rowsToRecords(B.parseDelimited(csv)));
  ok('CSV 머리글 인식 → 1명', recs.length === 1, recs.length);
  ok('CSV 칸 매핑', recs[0] && recs[0].user_id === 'hong01' && recs[0].name === '홍길동', recs[0]);
  ok('따옴표 안 쉼표 보존', recs[0] && recs[0].shop_name === 'A, 학원', recs[0] && recs[0].shop_name);
  ok('"" 이스케이프', recs[0] && recs[0].notes === '말 "안녕"', recs[0] && recs[0].notes);
  ok('엑셀이 지운 앞자리 0 복원', recs[0] && recs[0].student_phone === '01012345678', recs[0] && recs[0].student_phone);
  ok('이미 있는 하이픈 번호는 그대로', recs[0] && recs[0].parent_phone === '010-9876-5432');
  ok('문제 없는 줄은 오류 0', recs[0] && recs[0]._err.length === 0, recs[0] && recs[0]._err);

  // ② 엑셀에서 복사한 TSV, 머리글 순서가 다름
  const tsv = '이름\t학부모전화\t아이디\n김하나\t01011112222\tkim02\n';
  const r2 = B.checkRecords(B.rowsToRecords(B.parseDelimited(tsv)));
  ok('TSV · 머리글 순서 무관', r2.length === 1 && r2[0].user_id === 'kim02' && r2[0].name === '김하나' && r2[0].parent_phone === '01011112222', r2[0]);

  // ③ 머리글이 없으면 양식 순서
  const r3 = B.rowsToRecords(B.parseDelimited('lee03,이삼\n'));
  ok('머리글 없음 → 양식 칸 순서', r3.length === 1 && r3[0].user_id === 'lee03' && r3[0].name === '이삼', r3[0]);

  // ④ 막는 것 — 서버 규칙과 같은 것(짝: 정상 줄은 통과)
  const bad = B.checkRecords(B.rowsToRecords([
    ['아이디', '이름', '비밀번호'],
    ['ab', '짧음', ''],
    ['bad id!', '특수', ''],
    ['noname1', '', ''],
    ['pwshort', '비번', '123'],
    ['Good01', '정상', ''],
    ['good01', '대소문자중복', ''],
    ['', '', ''],
  ]));
  const by = Object.fromEntries(bad.map(r => [r.name || r.user_id, r._err]));
  ok('빈 줄은 건너뜀', bad.length === 6, bad.length);
  ok('아이디 4자 미만 막음', by['짧음'] && by['짧음'].length > 0);
  ok('특수문자 아이디 막음', by['특수'] && by['특수'].length > 0);
  ok('이름 없음 막음', by['noname1'] && by['noname1'].length > 0);
  ok('비밀번호 4자 미만 막음', by['비번'] && by['비번'].length > 0);
  ok('정상 줄은 통과(짝)', by['정상'] && by['정상'].length === 0, by['정상']);
  ok('파일 안 대소문자만 다른 중복 막음', by['대소문자중복'] && by['대소문자중복'].length > 0);
}

// ④-2 2026-10-30 실사고: 엑셀이 «CSV(쉼표로 분리)» 로 저장하면 CP949 — UTF-8 로 읽어 한글이 전부 깨졌다
{
  ok('전제: decodeText 노출', B && typeof B.decodeText === 'function');
  // 「아이디(필수),이름(필수)\nysys02,박온유」 를 CP949 바이트로(파이썬 cp949 로 만든 값)
  const cp949 = Buffer.from('BEC6C0CCB5F028C7CABCF6292CC0CCB8A728C7CABCF6290A7973797330322CB9DABFC2C0AF', 'hex');
  const t = B && B.decodeText ? B.decodeText(cp949.buffer.slice(cp949.byteOffset, cp949.byteOffset + cp949.length)) : '';
  ok('CP949 CSV 를 한글로 읽음', t.indexOf('박온유') >= 0 && t.indexOf('아이디') === 0, t);
  const r = B && B.decodeText ? B.checkRecords(B.rowsToRecords(B.parseDelimited(t))) : [];
  ok('CP949 머리글 인식 → 1명·이름 정상', r.length === 1 && r[0].user_id === 'ysys02' && r[0].name === '박온유', r);
  const u8 = Buffer.from('\uFEFF아이디(필수),이름(필수)\nkim01,김하나', 'utf8');
  const tu = B && B.decodeText ? B.decodeText(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.length)) : '';
  ok('UTF-8(양식 그대로)은 예전처럼(짝)', tu.indexOf('김하나') >= 0, tu);
  const ex = B.rowsToRecords(B.parseDelimited('아이디(필수),이름(필수),비밀번호,학생전화,학부모전화,소속학원,메모\nysys02,박온유,1221,,,,예시 — 이 줄은 지우고 쓰세요\nysys03,김하나,,,,,진짜 메모'));
  ok('양식 예시 메모는 저장 안 함', ex[0] && ex[0].notes === '', ex[0] && ex[0].notes);
  ok('진짜 메모는 그대로(짝)', ex[1] && ex[1].notes === '진짜 메모', ex[1] && ex[1].notes);
  ok('파일 읽기가 decodeText 를 지남', /parseDelimited\(decodeText\(await f\.arrayBuffer\(\)\)\)/.test(code));
}

// ⑤ 서버는 «한 명 등록» 과 같은 경로 — 새 경로를 만들지 않는다(src/index.ts 공동 금지구역)
ok('한 명 등록 경로를 그대로 부름', /fetch\('\/api\/admin\/students\/create'/.test(code));
ok('possible_duplicate 는 force 없이 넘기지 않음', /error === 'possible_duplicate'/.test(code) && /if \(force\) body\.force = true/.test(code));

// ⑥ 관리자 화면 배선
const html = fs.readFileSync(ADMIN, 'utf8');
ok('「📥 단체 등록」 버튼', /id="sm-bulk-student"[^>]*smOpenBulkRegister/.test(html));
ok('스크립트 ?v= 로 실림', /<script src="\/js\/adm-student-bulk\.js\?v=\d+" defer><\/script>/.test(html));
ok('모달이 드로어(100001) 위', /z-index:100002/.test(code));

console.log(`student_bulk_register_harness — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
