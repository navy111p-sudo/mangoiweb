// 수강신청 등록 후 엑셀·워드(CSV·Word) 다운로드를 «선택» 으로 (2026-10-07 사장님 지시)
// adm-core.js 의 _enDl 계열과 두 export 함수를 소스에서 오려 내 가짜 DOM 으로 «실제로» 돌린다.
// 짝: 「꺼져 있으면 안 받는다」 ↔ 「켜져 있으면 받는다」 ↔ 「나중 버튼으로 받을 수 있다」 ↔ 「카톡은 그대로」.
import fs from 'node:fs';
const ROOT = new URL('..', import.meta.url).pathname;
const core = fs.readFileSync(ROOT + 'cloudflare-deploy/public/js/adm-core.js', 'utf8');
const html = fs.readFileSync(ROOT + 'cloudflare-deploy/public/admin.html', 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ FAIL ' + m); } };

function bodyAt(src, sig) {
  const i = src.indexOf(sig); if (i < 0) return '';
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
  return '';
}
const strip = t => t.replace(/^[ \t]*\/\/.*$/gm, '');

// ⓪ 전제 — 오려 내기
const pieces = ['function _enWantFiles()', 'function _enDl(', 'function _enDownloadPending()', 'function _enResetPending()',
  'function autoExportBulkEnrollment(records)', 'async function autoExportEnrollment(enr)'].map(s => bodyAt(core, s));
pieces.forEach((p, i) => ok(p.length > 20, '⓪ 오려 냄 #' + i));
ok(/var _enPendingFiles\s*=\s*\[\]/.test(core), '⓪ _enPendingFiles 선언');

// ① 두 export 함수 안에 _downloadBlob 직접 호출이 없다 (= 무조건 다운로드 경로 없음)
ok(!/_downloadBlob\(/.test(strip(pieces[4])), '① 일괄 export 는 _downloadBlob 을 직접 안 부른다');
ok(!/_downloadBlob\(/.test(strip(pieces[5])), '① 단건 export 는 _downloadBlob 을 직접 안 부른다');
ok((pieces[4].match(/_enDl\(/g) || []).length === 2 && (pieces[5].match(/_enDl\(/g) || []).length === 2, '① 두 함수 각각 _enDl 2회(CSV·Word)');

// ② HTML 배선
ok(/id="en-export-files"/.test(html) && !/id="en-export-files"[^>]*checked/.test(html), '② 체크박스 있고 기본 꺼짐');
ok(/id="en-export-later"[^>]*display:none/.test(html), '② 나중 받기 버튼 기본 숨김');
ok(/addEventListener\('click', _enDownloadPending\)/.test(core), '② 받기 버튼이 _enDownloadPending 에 연결');
ok(/mangoi_en_export_files/.test(core), '② 선택값 기억');

// 실행 샌드박스
function run(checked, which) {
  const downloads = [], fetches = [];
  const els = {
    'en-export-files': { checked },
    'en-export-later': { style: { display: 'none' }, textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } },
  };
  const env = {
    document: { getElementById: id => els[id] || null },
    _downloadBlob: (b, n) => downloads.push(n),
    fetch: (u, o) => { fetches.push(JSON.parse(o.body)); return Promise.resolve({ json: () => Promise.resolve({ ok: true }) }); },
    Blob: class { constructor(p) { this.p = p; } },
    _aiEsc: s => String(s == null ? '' : s), adminLang: 'ko', console: { info() {}, warn() {} },
    setTimeout: f => f(), URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
  };
  const src = 'var _enPendingFiles = [];\n' + pieces.join('\n') +
    '\nreturn { _enDl, _enDownloadPending, autoExportBulkEnrollment, autoExportEnrollment, get pending(){ return _enPendingFiles; } };';
  let api;
  try { api = new Function(...Object.keys(env), src)(...Object.values(env)); }
  catch (e) { return { err: e.message, downloads, fetches, els }; }
  try {
    if (which === 'bulk') api.autoExportBulkEnrollment([{ student_name: '홍길동', student_user_id: 'u1', _types_ko: ['정규'], _days_ko: ['월'], package: 'P', monthly_fee_krw: 100000 }]);
    else api.autoExportEnrollment({ id: 1, student_name: '홍길동', student_user_id: 'u1', types_ko: '정규', package: 'P', started_at: '2026-10-07', created_at: 'x' });
  } catch (e) { return { err: e.message, downloads, fetches, els, api }; }
  return { downloads, fetches, els, api };
}

for (const which of ['bulk', 'single']) {
  const off = run(false, which);
  ok(!off.err, `③ ${which} 꺼짐 실행 오류 없음 ${off.err || ''}`);
  ok(off.downloads.length === 0, `③ ${which} 꺼짐 → 다운로드 0건 (실제 ${off.downloads.length})`);
  ok(off.els['en-export-later'].style.display === '' && /\(2\)/.test(off.els['en-export-later'].textContent), `③ ${which} 꺼짐 → 「받기 (2)」 버튼 보임`);
  ok(off.fetches.some(b => b.name === 'send_kakao_self'), `③ ${which} 꺼짐에도 카톡은 나감`);
  if (off.api) { off.api._enDownloadPending(); ok(off.downloads.length === 2 && off.downloads.some(n => /\.csv$/.test(n)) && off.downloads.some(n => /\.doc$/.test(n)), `③ ${which} 받기 버튼 → CSV·Word 2건`); }
  const on = run(true, which);
  ok(!on.err && on.downloads.length === 2, `④ ${which} 켜짐 → 바로 2건 다운로드 (실제 ${on.downloads.length})`);
  ok(on.els['en-export-later'].style.display === 'none', `④ ${which} 켜짐 → 받기 버튼 안 보임`);
}
// ⑤ 두 번 등록해도 대기 파일이 누적되지 않는다(새 등록이 앞 것을 비움)
{
  const r = run(false, 'bulk');
  r.api.autoExportBulkEnrollment([{ student_name: 'B', student_user_id: 'u2' }]);
  ok(r.api.pending.length === 2, `⑤ 두 번째 등록 뒤 대기 파일 2건 (실제 ${r.api.pending.length})`);
}
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
