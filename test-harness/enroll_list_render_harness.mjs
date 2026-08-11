// 📚 수강신청 «목록» 렌더러 하니스 — 2026-08-08
//
//   배경: 액션 열이 «✓ ▶ ✕» 아이콘 3개뿐이라 무슨 버튼인지 알 수 없었고,
//     이미 그 상태인 행에서도 다 눌려서 «눌러도 아무 일이 없다» 는 말이 나왔다.
//     서버가 status 한 칸만 바꾸는 구조라 화면이 유일한 피드백 경로다.
//
//   관리자 화면은 인증 게이트 때문에 익명 fetch 로 못 연다.
//   그래서 렌더러 블록을 오려내 document 스텁과 함께 **진짜로 실행**한다.
//   못 박는 것: 버튼 이름표 · 갈 수 없는 전이 잠금 · 되살리기 경로 ·
//               중복 판정(취소 건 제외) · 강사 미배정 경고 · XSS · 검색/필터.
//
//   실행: node test-harness/enroll_list_render_harness.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = join(ROOT, 'cloudflare-deploy', 'public', 'js', 'adm-core.js');
const src = readFileSync(CORE, 'utf8').split(/\r?\n/);
const start = src.findIndex(l => l.includes('const EN_STATUS_META'));
const end   = src.findIndex(l => l.startsWith('function enSearch(v)'));
const block = src.slice(start, end + 1).join('\n');

// 스텁 — 실제 파일의 것과 동작이 같아야 의미가 있으므로 원본에서 그대로 가져온다
const escLine  = src.find(l => l.startsWith('function _esc(s)'));
const dateLine = src.find(l => l.startsWith('function _fmtDate(ts)'));

const els = {};
function mkEl(id) { return { id, innerHTML: '', style: {}, value: '' }; }
['enrollments-table', 'en-summary', 'en-status-filter'].forEach(id => { els[id] = mkEl(id); });

const document = {
  getElementById: id => els[id] || null,
  createElement: () => ({ style: {}, id: '' }),
  body: { appendChild() {} }
};

const ITEMS = [
  { id: 1, student_name: '홍길동', student_user_id: 'hong01', package: '1:1 4회권',
    monthly_fee_krw: 60000, status: 'cancelled', created_at: 1752192000000 },
  { id: 2, student_name: '홍길동', student_user_id: 'hong01', package: '1:1 4회권',
    monthly_fee_krw: 60000, status: 'active', created_at: 1752192000000 },
  { id: 3, student_name: '홍길동', student_user_id: 'hong01', package: '1:1 4회권',
    monthly_fee_krw: 60000, status: 'pending', created_at: 1752192000000 },
  { id: 4, student_name: '김민준', student_user_id: 'kim01', package: '1:1 8회권',
    monthly_fee_krw: 280000, status: 'active', created_at: 1749000000000,
    days_of_week: '화목', time: '20:00', class_size: '1:1', teacher_name: 'Melca' },
  { id: 5, student_name: '이서연<script>', student_user_id: 'lee01', package: '그룹 12회권',
    monthly_fee_krw: 440000, status: 'confirmed', created_at: 1749000000000 }
];

const run = new Function('document', 'adminLang', 'setTimeout', 'clearTimeout', `
  ${escLine}
  ${dateLine}
  ${block}
  return { render: _renderEnrollments, setItems: v => { _enItems = v; },
           dupOnly: v => { _enDupOnly = v; }, query: v => { _enQuery = v; } };
`);

let fails = 0;
const ok = (cond, label) => { console.log((cond ? '  ✅ ' : '  ❌ ') + label); if (!cond) fails++; };

for (const lang of ['ko', 'en']) {
  console.log(`\n──── adminLang = ${lang} ────`);
  els['enrollments-table'].innerHTML = '';
  els['en-summary'].innerHTML = '';
  const api = run(document, lang, setTimeout, clearTimeout);
  api.setItems(ITEMS);
  api.render();

  const html = els['enrollments-table'].innerHTML;
  const sum = els['en-summary'].innerHTML;
  // 각 행 뒤에 「처리」 패널용 숨은 행(<tr id="en-panel-N">)이 하나씩 붙는다.
  // '<tr>' 로 자르면 패널 행은 앞 조각에 붙어 온다 — 의도한 것이므로 개수로 못 박는다.
  const rows = html.split('<tr>').slice(1);
  const panels = (html.match(/<tr id="en-panel-\d+" style="display:none">/g) || []).length;

  ok(rows.length === 5, `행 5개 렌더 (실제 ${rows.length})`);
  ok(panels === 5, `행마다 처리 패널 자리 1개 (실제 ${panels})`);
  ok(!/<tr id="en-panel-1"[\s\S]*?enOpenPanel\(1\)/.test(html), 'cancelled 행에는 패널 버튼이 없다');
  ok(/onclick="enOpenPanel\(3\)"/.test(html) && /onclick="enOpenPanel\(5\)"/.test(html),
     'pending·confirmed 행에는 패널 버튼이 있다');

  /* ✅ (2026-08-12) 등록 = 확정으로 합치면서 버튼 구성이 바뀌었다.
     「✓ 확정」은 없앴다 — 등록하는 순간 자동으로 확정 파이프라인이 돈다.
     pending 은 «확정이 막힌 건» 이므로 「▸ 확정 안 됨」, confirmed 는 「⚙ 후속」. */
  const wantStart   = lang === 'en' ? '▶ Start'   : '▶ 수강시작';
  const wantCancel  = lang === 'en' ? '✕ Cancel'  : '✕ 취소';
  const goneConfirm = lang === 'en' ? '✓ Confirm' : '✓ 확정';
  ok(html.includes(wantStart) && html.includes(wantCancel),
     `버튼 이름표 2종 (${wantStart} / ${wantCancel})`);
  ok(!html.includes(goneConfirm), `⛔ 「${goneConfirm}」 버튼은 없어야 한다 (등록 즉시 확정)`);
  ok(html.includes(lang === 'en' ? '▸ Not confirmed' : '▸ 확정 안 됨'),
     'pending 행 = 「▸ 확정 안 됨」');
  ok(html.includes(lang === 'en' ? '⚙ Follow-up' : '⚙ 후속'),
     'confirmed 행 = 「⚙ 후속」 (문자·결제만 남는다)');

  // 2) 이미 그 상태인 버튼만 비활성 — id=4 는 active 이므로 '수강시작'만 잠겨야 한다
  const row4 = rows.find(r => r.includes('setEnrollmentStatus(4,') || r.includes('김민준'));
  const btns4 = [...row4.matchAll(/<button type="button" (disabled )?onclick="setEnrollmentStatus\(4,'(\w+)'\)/g)]
                  .map(m => ({ target: m[2], disabled: !!m[1] }));
  ok(btns4.length === 2, `active 행 버튼 2개 (확정 없음·되살리기 없음) — 실제 ${btns4.length}`);
  ok(btns4.every(b => b.disabled === (b.target === 'active')),
     'active 행: «수강시작»만 잠김 ' + JSON.stringify(btns4.map(b => b.target + (b.disabled ? '(잠김)' : ''))));

  // 3) 취소된 행에는 «되살리기» 경로가 나와야 한다
  const row1 = rows.find(r => r.includes("setEnrollmentStatus(1,"));
  ok(row1.includes("setEnrollmentStatus(1,'pending')"), 'cancelled 행에 대기로 되살리기 버튼 있음');
  ok(row1.includes("disabled onclick=\"setEnrollmentStatus(1,'cancelled')"), 'cancelled 행: «취소» 버튼 잠김');

  // 4) 중복 의심 — 살아 있는 건(active+pending)만 2건이므로 id 2,3 만 표시. 취소된 1 은 제외
  const dupLabel = lang === 'en' ? '>DUP?<' : '>중복?<';
  const dupRows = rows.filter(r => r.includes(dupLabel)).length;
  ok(dupRows === 2, `중복 뱃지 2건만 (취소된 1건 제외) — 실제 ${dupRows}`);

  // 5) DB 에 있는데 버려지던 요일·시간·인원·강사가 보이는가
  ok(row4.includes('화목 · 20:00 · 1:1') && row4.includes('Melca'), '요일·시간·인원방식·강사 표시');

  // 6) 강사 미배정 경고 — id=5 는 confirmed 인데 강사 없음
  const row5 = rows.find(r => r.includes('lee01'));
  ok(row5.includes(lang === 'en' ? 'no teacher yet' : '강사 미배정'), 'confirmed 인데 강사 없음 → 경고');

  // 7) 상태가 원문 영어가 아니라 사람 말로 나오는가
  ok(!/>active</.test(html) && !/>cancelled</.test(html), '상태 원문(active/cancelled) 노출 없음');
  ok(html.includes(lang === 'en' ? '>Active<' : '>수강중<'), '상태 라벨 표시');

  // 8) XSS — 학생 이름의 <script> 가 이스케이프되는가
  ok(html.includes('&lt;script&gt;') && !html.includes('이서연<script>'), '학생 이름 이스케이프');

  // 9) 상태 칩 건수 — pending1 confirmed1 active2 cancelled1
  ok(sum.includes(lang === 'en' ? 'Active 2' : '수강중 2'), '칩: 수강중 2 ' );
  ok(sum.includes(lang === 'en' ? 'Possible duplicates 2' : '중복 의심 2'), '칩: 중복 의심 2');

  // 10) 검색이 재요청 없이 걸러지는가
  api.query('melca');
  api.render();
  const searched = els['enrollments-table'].innerHTML.split('<tr>').slice(1);
  ok(searched.length === 1 && searched[0].includes('김민준'), `검색 «melca» → 1행 (실제 ${searched.length})`);
  api.query('');

  // 11) 중복만 보기
  api.dupOnly(true); api.render();
  const dupOnly = els['enrollments-table'].innerHTML.split('<tr>').slice(1);
  ok(dupOnly.length === 2, `중복만 보기 → 2행 (실제 ${dupOnly.length})`);
  api.dupOnly(false);
}

console.log(fails === 0 ? '\n🎉 전부 통과' : `\n❌ 실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
