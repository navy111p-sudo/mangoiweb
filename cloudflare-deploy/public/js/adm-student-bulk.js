/* 📥 학생 단체 등록 (2026-10-28 사장님 요청 「여러 명의 학생들을 단체로 등록할 수 있는 기능」)
 *
 * 흐름: 양식(CSV) 받기 → 엑셀에서 채우기 → 파일 올리기(.csv / .xlsx) 또는 표를 복사해 붙여넣기
 *       → 미리보기(줄마다 문제를 먼저 보여 줌) → [N명 등록] → 결과(임시 비밀번호 포함) CSV 받기.
 *
 * ✅ 서버는 «한 명 등록» 과 같은 POST /api/admin/students/create 를 한 줄씩 부른다.
 *    그래서 아이디 규칙·대소문자 중복·«같은 이름+같은 번호» 중복(duplicateGate)·비밀번호 해시·
 *    본사 전용 권한이 한 명 등록과 «정확히 같다». ⛔ 판정을 여기 복제해 서버를 건너뛰지 말 것 —
 *    아래 미리보기 검사는 «미리 알려 주기» 일 뿐이고 최종 판정은 서버다.
 * ⛔ 새 서버 경로를 만들지 않았다 — src/index.ts(공동 금지구역) 라우팅 허용목록을 안 건드리려고.
 * ⚠️ 서버가 «같은 이름·같은 연락처가 이미 있다»(409 possible_duplicate)고 하면 그 줄은 건너뛰고
 *    «확인 필요» 로 남긴다 — 사람이 보고 「그래도 등록」을 눌러야만 force:true 로 다시 보낸다
 *    (한 명 등록과 같은 규칙 · 정예희 yahee·yahee1·yahee2 사고).
 * ⚠️ 임시 비밀번호는 이 화면에서만 보인다(서버는 해시만 저장) — 그래서 결과를 CSV 로 받게 한다.
 * ⚠️ .xlsx 는 브라우저 기본 DecompressionStream 으로 직접 푼다(외부 라이브러리 없음). 못 푸는
 *    브라우저·파일이면 «CSV 로 저장해 올리거나 표를 복사해 붙여넣어 달라» 고 말한다.
 */
(function () {
  'use strict';
  var MAX_ROWS = 300;
  function en() { return (window.adminLang || '') === 'en'; }
  function L(ko, e) { return en() ? e : ko; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 양식 칸 — 순서가 곧 «머리글이 없을 때» 의 칸 순서다.
  var FIELDS = [
    { key: 'user_id', ko: '아이디', en: 'ID', req: true,
      alias: ['아이디', '학생아이디', 'id', 'userid', 'user_id', 'loginid', '로그인아이디'] },
    { key: 'name', ko: '이름', en: 'Name', req: true,
      alias: ['이름', '학생이름', '학생명', '성명', 'name', 'studentname', 'koreanname'] },
    { key: 'password', ko: '비밀번호', en: 'Password',
      alias: ['비밀번호', '비번', 'password', 'pw', 'pwd'] },
    { key: 'student_phone', ko: '학생전화', en: 'StudentPhone',
      alias: ['학생전화', '학생연락처', '학생휴대폰', '학생번호', 'studentphone', 'phone'] },
    { key: 'parent_phone', ko: '학부모전화', en: 'ParentPhone',
      alias: ['학부모전화', '학부모연락처', '학부모휴대폰', '학부모번호', '부모전화', 'parentphone'] },
    { key: 'shop_name', ko: '소속학원', en: 'Academy',
      alias: ['소속학원', '소속', '학원', '학원명', '대리점', 'academy', 'shop', 'shopname', 'center'] },
    { key: 'notes', ko: '메모', en: 'Notes',
      alias: ['메모', '비고', 'notes', 'note', 'memo'] }
  ];
  function normHead(s) { return String(s || '').replace(/[\s()·\-_*]/g, '').toLowerCase(); }

  // ── 양식 받기 (UTF-8 BOM — 엑셀에서 한글이 안 깨진다) ─────────────────
  function downloadTemplate() {
    var head = FIELDS.map(function (f) { return f.ko + (f.req ? '(필수)' : ''); }).join(',');
    var ex1 = 'hong01,홍길동,,01012345678,01098765432,,예시 — 이 줄은 지우고 쓰세요';
    var ex2 = 'kim02,김하나,abcd1234,,01011112222,,';
    saveText('﻿' + head + '\r\n' + ex1 + '\r\n' + ex2 + '\r\n', '학생단체등록_양식.csv');
  }
  function saveText(text, filename) {
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ── 파일 글자 풀기: UTF-8 이 아니면 한국어 윈도우 기본(CP949/EUC-KR) ─────
  //   2026-10-30 실사고: 양식(UTF-8)을 엑셀에서 고쳐 «CSV(쉼표로 분리)» 로 저장하면 엑셀이
  //   CP949 로 바꿔 저장한다 → file.text()(UTF-8)로 읽어 이름·머리글이 전부 «���» 가 됐다.
  //   UTF-8 로 엄격하게(fatal) 풀어 보고 실패하면 euc-kr 로 푼다.
  function decodeText(buf) {
    var u8 = new Uint8Array(buf);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); }
    catch (e) {
      try { return new TextDecoder('euc-kr').decode(u8); }
      catch (e2) { return new TextDecoder('utf-8').decode(u8); }
    }
  }

  // ── 표 읽기: CSV / TSV(엑셀에서 복사) ─────────────────────────────────
  function parseDelimited(text) {
    text = String(text || '').replace(/^﻿/, '');
    var firstLine = text.split(/\r?\n/)[0] || '';
    var delim = (firstLine.split('\t').length > firstLine.split(',').length) ? '\t' : ',';
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell === '') { q = true; }
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  // ── .xlsx 읽기 (zip → sheet1.xml) ─────────────────────────────────────
  async function inflateRaw(bytes) {
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unzip(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(buf), out = {};
    var eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('zip');
    var n = dv.getUint16(eocd + 10, true), off = dv.getUint32(eocd + 16, true);
    var td = new TextDecoder();
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      var method = dv.getUint16(off + 10, true);
      var csize = dv.getUint32(off + 20, true);
      var nlen = dv.getUint16(off + 28, true), elen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
      var lho = dv.getUint32(off + 42, true);
      var name = td.decode(u8.subarray(off + 46, off + 46 + nlen));
      off += 46 + nlen + elen + clen;
      if (!/^xl\/(sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml)$/.test(name)) continue;
      var dstart = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      var data = u8.subarray(dstart, dstart + csize);
      out[name] = td.decode(method === 0 ? data : await inflateRaw(data));
    }
    return out;
  }
  function colIndex(ref) {
    var m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1;
    var n = 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
    return n - 1;
  }
  async function parseXlsx(buf) {
    var files = await unzip(buf);
    var dp = new DOMParser();
    var shared = [];
    if (files['xl/sharedStrings.xml']) {
      var sd = dp.parseFromString(files['xl/sharedStrings.xml'], 'application/xml');
      var sis = sd.getElementsByTagName('si');
      for (var i = 0; i < sis.length; i++) {
        var ts = sis[i].getElementsByTagName('t'), s = '';
        for (var j = 0; j < ts.length; j++) s += ts[j].textContent;
        shared.push(s);
      }
    }
    // 첫 번째 시트 — workbook.xml 의 첫 <sheet> 를 rels 로 찾고, 못 찾으면 sheet1.xml
    var sheetPath = 'xl/worksheets/sheet1.xml';
    try {
      var wb = dp.parseFromString(files['xl/workbook.xml'] || '', 'application/xml');
      var first = wb.getElementsByTagName('sheet')[0];
      var rid = first && (first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
      var rels = dp.parseFromString(files['xl/_rels/workbook.xml.rels'] || '', 'application/xml').getElementsByTagName('Relationship');
      for (var r = 0; r < rels.length; r++) {
        if (rels[r].getAttribute('Id') === rid) {
          var t = rels[r].getAttribute('Target').replace(/^\/?(xl\/)?/, '');
          sheetPath = 'xl/' + t;
        }
      }
    } catch (e) { /* sheet1.xml 로 */ }
    if (!files[sheetPath]) {
      var any = Object.keys(files).filter(function (k) { return /^xl\/worksheets\//.test(k); }).sort()[0];
      if (!any) throw new Error('sheet');
      sheetPath = any;
    }
    var sh = dp.parseFromString(files[sheetPath], 'application/xml');
    var rowsEl = sh.getElementsByTagName('row'), rows = [];
    for (var a = 0; a < rowsEl.length; a++) {
      var cells = rowsEl[a].getElementsByTagName('c'), row = [];
      for (var b = 0; b < cells.length; b++) {
        var c = cells[b], tt = c.getAttribute('t'), val = '';
        if (tt === 'inlineStr') {
          var its = c.getElementsByTagName('t'); for (var q = 0; q < its.length; q++) val += its[q].textContent;
        } else {
          var v = c.getElementsByTagName('v')[0]; val = v ? v.textContent : '';
          if (tt === 's') val = shared[Number(val)] || '';
        }
        var ci = colIndex(c.getAttribute('r')); if (ci < 0) ci = row.length;
        row[ci] = val;
      }
      for (var z = 0; z < row.length; z++) if (row[z] == null) row[z] = '';
      rows.push(row);
    }
    return rows;
  }

  // ── 행 → 학생 레코드 ────────────────────────────────────────────────
  function fixPhone(s) {
    var t = String(s || '').trim();
    // 엑셀이 숫자로 바꿔 앞의 0 을 지운 번호(1012345678) 를 되살린다.
    if (/^1\d{8,9}$/.test(t)) t = '0' + t;
    return t;
  }
  function rowsToRecords(rows) {
    rows = (rows || []).filter(function (r) { return r && r.some(function (c) { return String(c || '').trim(); }); });
    if (!rows.length) return [];
    // 머리글 찾기 — 첫 줄 칸 중 2개 이상이 알려진 이름이면 머리글로 본다.
    var map = null, head = rows[0], hits = 0, m = {};
    head.forEach(function (h, i) {
      var nh = normHead(String(h).replace(/필수/g, ''));
      FIELDS.forEach(function (f) {
        if (m[f.key] == null && f.alias.some(function (a) { return normHead(a) === nh; })) { m[f.key] = i; hits++; }
      });
    });
    if (hits >= 2 && m.user_id != null && m.name != null) { map = m; rows = rows.slice(1); }
    else { map = {}; FIELDS.forEach(function (f, i) { map[f.key] = i; }); }
    return rows.map(function (r, idx) {
      var rec = { _line: idx + 1 };
      FIELDS.forEach(function (f) { rec[f.key] = map[f.key] == null ? '' : String(r[map[f.key]] == null ? '' : r[map[f.key]]).trim(); });
      rec.student_phone = fixPhone(rec.student_phone);
      rec.parent_phone = fixPhone(rec.parent_phone);
      // 양식 예시 줄을 고쳐 쓰고 메모만 남긴 경우 — 그 안내문이 학생 메모로 저장되지 않게(2026-10-30)
      if (/^예시\s*[—-]\s*이 줄은 지우고/.test(rec.notes)) rec.notes = '';
      return rec;
    });
  }

  // 미리보기용 검사 — 서버 규칙과 같은 것만(최종 판정은 서버).
  function checkRecords(recs) {
    var seen = {};
    recs.forEach(function (r) {
      var errs = [];
      if (!r.user_id) errs.push(L('아이디 없음', 'no ID'));
      else if (r.user_id.length < 4 || r.user_id.length > 20) errs.push(L('아이디 4~20자', 'ID 4–20 chars'));
      else if (!/^[a-zA-Z0-9_]+$/.test(r.user_id)) errs.push(L('아이디는 영문·숫자·_ 만', 'ID: letters/digits/_ only'));
      if (!r.name) errs.push(L('이름 없음', 'no name'));
      if (r.password && r.password.length < 4) errs.push(L('비밀번호 4자 이상', 'password ≥ 4'));
      var k = r.user_id.toLowerCase();
      if (k) {
        if (seen[k]) errs.push(L('파일 안에서 아이디 중복(' + seen[k] + '번째 줄)', 'duplicate ID in file (row ' + seen[k] + ')'));
        else seen[k] = r._line;
      }
      r._err = errs;
    });
    return recs;
  }

  // ── 화면 ───────────────────────────────────────────────────────────
  var STATE = { recs: [], results: [], running: false };
  function modal() {
    var m = document.getElementById('sm-bulk-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'sm-bulk-modal';
    m.style.cssText = 'display:none;position:fixed;inset:0;z-index:100002;background:rgba(15,23,42,.62);overflow-y:auto;padding:24px 12px;';
    m.innerHTML =
      '<div style="margin:auto;max-width:980px;background:#ffffff;color:#101828;border-radius:14px;padding:18px 20px;box-shadow:0 20px 50px rgba(0,0,0,.35);font-size:13px">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
          '<b id="smb-title" style="font-size:16px"></b>' +
          '<button type="button" id="smb-close" style="margin-left:auto;padding:4px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#ffffff;color:#344054;cursor:pointer">✕</button>' +
        '</div>' +
        '<div id="smb-help" style="background:#f1f5f9;color:#344054;border-radius:10px;padding:10px 12px;line-height:1.6;margin-bottom:10px"></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px">' +
          '<button type="button" id="smb-tpl" style="padding:6px 12px;border:1px solid #16a34a;border-radius:8px;background:#f0fdf4;color:#166534;font-weight:800;cursor:pointer"></button>' +
          '<input type="file" id="smb-file" accept=".csv,.xlsx,.txt,.tsv" style="font-size:12px;color:#101828">' +
        '</div>' +
        '<textarea id="smb-paste" rows="4" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font-size:12px;background:#ffffff;color:#101828"></textarea>' +
        '<div style="display:flex;gap:8px;margin:8px 0">' +
          '<button type="button" id="smb-preview" style="padding:6px 14px;border:1px solid #2563eb;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-weight:800;cursor:pointer"></button>' +
          '<button type="button" id="smb-run" disabled style="padding:6px 14px;border:1px solid #1d4ed8;border-radius:8px;background-color:#dbeafe;color:#1e3a8a;font-weight:800;cursor:pointer;opacity:.5"></button>' +
          '<button type="button" id="smb-result-csv" style="display:none;padding:6px 14px;border:1px solid #16a34a;border-radius:8px;background:#f0fdf4;color:#166534;font-weight:800;cursor:pointer"></button>' +
        '</div>' +
        '<div id="smb-status" style="font-weight:700;margin-bottom:6px"></div>' +
        '<div id="smb-table" style="max-height:52vh;overflow:auto;border:1px solid #e2e8f0;border-radius:8px"></div>' +
      '</div>';
    document.body.appendChild(m);
    m.querySelector('#smb-close').addEventListener('click', close);
    m.addEventListener('click', function (e) { if (e.target === m && !STATE.running) close(); });
    m.querySelector('#smb-tpl').addEventListener('click', downloadTemplate);
    m.querySelector('#smb-file').addEventListener('change', onFile);
    m.querySelector('#smb-preview').addEventListener('click', function () {
      var t = m.querySelector('#smb-paste').value;
      if (!t.trim()) { setStatus(L('붙여넣은 내용이 없습니다. 파일을 고르거나 엑셀 표를 복사해 붙여넣으세요.', 'Nothing pasted. Choose a file or paste rows from Excel.'), '#b45309'); return; }
      load(parseDelimited(t));
    });
    m.querySelector('#smb-run').addEventListener('click', runAll);
    m.querySelector('#smb-result-csv').addEventListener('click', downloadResults);
    m.querySelector('#smb-table').addEventListener('click', function (e) {
      var b = e.target.closest('[data-force]');
      if (b) forceOne(Number(b.getAttribute('data-force')));
    });
    return m;
  }
  function paintStatic() {
    var m = modal();
    m.querySelector('#smb-title').textContent = L('📥 학생 단체 등록', '📥 Bulk Student Registration');
    m.querySelector('#smb-help').innerHTML = L(
      '① <b>양식 받기</b> → 엑셀에서 한 줄에 한 명씩 채우기 (아이디·이름 필수, 비밀번호를 비우면 임시 비밀번호가 만들어집니다)<br>' +
      '② 저장한 파일(.csv / .xlsx)을 고르거나, 엑셀에서 표를 복사해 아래 칸에 붙여넣고 <b>미리보기</b><br>' +
      '③ 문제 없는 줄만 <b>등록</b>됩니다. 끝나면 <b>결과 받기</b>로 아이디·임시 비밀번호를 꼭 저장하세요(다시 볼 수 없습니다).',
      '① <b>Download template</b> → fill one student per row in Excel (ID and name required; leave password empty to auto-generate)<br>' +
      '② Choose the saved file (.csv / .xlsx) or paste rows from Excel below, then <b>Preview</b><br>' +
      '③ Only valid rows are registered. Afterwards use <b>Download results</b> to save IDs and temporary passwords (shown only once).');
    m.querySelector('#smb-tpl').textContent = L('📄 양식 받기(CSV)', '📄 Download template (CSV)');
    m.querySelector('#smb-paste').placeholder = L('엑셀에서 복사한 표를 여기에 붙여넣기 (머리글 줄 포함 가능)', 'Paste rows copied from Excel here (header row optional)');
    m.querySelector('#smb-preview').textContent = L('🔍 미리보기', '🔍 Preview');
    m.querySelector('#smb-result-csv').textContent = L('📥 결과 받기(CSV)', '📥 Download results (CSV)');
    paintRunBtn();
  }
  function setStatus(t, color) {
    var s = modal().querySelector('#smb-status');
    s.textContent = t || ''; s.style.color = color || '#101828';
  }
  function okRecs() { return STATE.recs.filter(function (r) { return !r._err.length && !r._done; }); }
  function paintRunBtn() {
    var b = modal().querySelector('#smb-run'), n = okRecs().filter(function (r) { return !r._dup; }).length;
    b.textContent = L('✅ ' + n + '명 등록', '✅ Register ' + n);
    b.disabled = !n || STATE.running;
    b.style.opacity = b.disabled ? '.5' : '1';
  }
  function open() {
    var m = modal();
    STATE = { recs: [], results: [], running: false };
    m.querySelector('#smb-paste').value = '';
    m.querySelector('#smb-file').value = '';
    m.querySelector('#smb-table').innerHTML = '';
    m.querySelector('#smb-result-csv').style.display = 'none';
    paintStatic(); setStatus('');
    m.style.display = 'block';
  }
  function close() {
    if (STATE.running) return;
    modal().style.display = 'none';
    if (STATE.results.some(function (r) { return r.ok; }) && typeof window.loadStudentList === 'function') {
      try { window.loadStudentList(); } catch (e) {}
    }
  }

  async function onFile(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var ext = (f.name.split('.').pop() || '').toLowerCase();
    try {
      if (ext === 'xlsx') {
        if (typeof DecompressionStream === 'undefined') throw new Error('nods');
        load(await parseXlsx(await f.arrayBuffer()));
      } else if (ext === 'xls') {
        setStatus(L('옛 .xls 형식은 못 읽습니다 — 엑셀에서 «다른 이름으로 저장 → CSV UTF-8» 로 저장해 올려 주세요.', 'Old .xls is not supported — save as "CSV UTF-8" in Excel and upload that.'), '#b91c1c');
      } else {
        load(parseDelimited(decodeText(await f.arrayBuffer())));
      }
    } catch (err) {
      console.warn('[student-bulk] file read failed', err);
      setStatus(L('파일을 읽지 못했습니다 — CSV 로 저장해 올리거나, 엑셀 표를 복사해 아래 칸에 붙여넣어 주세요.', 'Could not read the file — save it as CSV, or paste the rows below.'), '#b91c1c');
    }
  }

  function load(rows) {
    var recs = checkRecords(rowsToRecords(rows));
    if (recs.length > MAX_ROWS) {
      setStatus(L('한 번에 ' + MAX_ROWS + '명까지 등록할 수 있습니다(지금 ' + recs.length + '명). 나눠서 올려 주세요.',
        'Up to ' + MAX_ROWS + ' students at a time (got ' + recs.length + '). Please split the file.'), '#b91c1c');
      STATE.recs = []; renderTable(); paintRunBtn(); return;
    }
    STATE.recs = recs; STATE.results = [];
    modal().querySelector('#smb-result-csv').style.display = 'none';
    var bad = recs.filter(function (r) { return r._err.length; }).length;
    if (!recs.length) setStatus(L('읽은 학생이 없습니다.', 'No students found.'), '#b45309');
    else setStatus(L('읽은 학생 ' + recs.length + '명 · 등록 가능 ' + (recs.length - bad) + '명' + (bad ? ' · 고칠 줄 ' + bad + '개(빨간 줄은 등록하지 않습니다)' : ''),
      recs.length + ' rows · ' + (recs.length - bad) + ' ready' + (bad ? ' · ' + bad + ' need fixing (red rows are skipped)' : '')), bad ? '#b45309' : '#166534');
    renderTable(); paintRunBtn();
  }

  function renderTable() {
    var t = modal().querySelector('#smb-table');
    if (!STATE.recs.length) { t.innerHTML = ''; return; }
    var th = 'padding:6px 8px;background:#f8fafc;color:#344054;text-align:left;position:sticky;top:0;border-bottom:1px solid #e2e8f0;white-space:nowrap';
    var td = 'padding:5px 8px;border-bottom:1px solid #f1f5f9;white-space:nowrap';
    var h = '<table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr>' +
      '<th style="' + th + '">#</th>' +
      FIELDS.map(function (f) { return '<th style="' + th + '">' + esc(L(f.ko, f.en)) + '</th>'; }).join('') +
      '<th style="' + th + '">' + L('상태', 'Status') + '</th></tr></thead><tbody>';
    STATE.recs.forEach(function (r, i) {
      var st, bg = '';
      if (r._err.length) { st = '<span style="color:#b91c1c">❌ ' + esc(r._err.join(' · ')) + '</span>'; bg = '#fef2f2'; }
      else if (r._done) { st = '<span style="color:#166534">✅ ' + L('등록됨', 'Registered') + (r._tempPw ? ' · ' + L('임시 비번', 'temp pw') + ' <b>' + esc(r._tempPw) + '</b>' : '') + '</span>'; bg = '#f0fdf4'; }
      else if (r._dup) {
        st = '<span style="color:#b45309">⚠️ ' + esc(r._msg || '') + '</span> ' +
          '<button type="button" data-force="' + i + '" style="padding:2px 8px;border:1px solid #b45309;border-radius:6px;background:#fffbeb;color:#b45309;font-weight:700;cursor:pointer">' + L('그래도 등록', 'Register anyway') + '</button>';
        bg = '#fffbeb';
      }
      else if (r._fail) { st = '<span style="color:#b91c1c">❌ ' + esc(r._msg || '') + '</span>'; bg = '#fef2f2'; }
      else st = '<span style="color:#475467">' + L('등록 대기', 'Ready') + '</span>';
      h += '<tr style="background:' + (bg || '#ffffff') + '"><td style="' + td + ';color:#667085">' + r._line + '</td>' +
        FIELDS.map(function (f) {
          var v = r[f.key];
          if (f.key === 'password' && v) v = '••••';
          return '<td style="' + td + '">' + esc(v || '') + '</td>';
        }).join('') + '<td style="' + td + '">' + st + '</td></tr>';
    });
    t.innerHTML = h + '</tbody></table>';
  }

  async function postOne(r, force) {
    var body = { user_id: r.user_id, name: r.name };
    ['password', 'student_phone', 'parent_phone', 'shop_name', 'notes'].forEach(function (k) { if (r[k]) body[k] = r[k]; });
    if (force) body.force = true;
    var res, d;
    try {
      res = await fetch('/api/admin/students/create', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      d = await res.json().catch(function () { return {}; });
    } catch (e) {
      r._fail = true; r._msg = L('연결 실패 — 다시 시도해 주세요', 'Network error — please retry'); return false;
    }
    r._dup = false; r._fail = false;
    if (res.ok && d && d.ok === true) {
      r._done = true; r._tempPw = (r.password ? '' : (d.temp_password || ''));
      STATE.results.push({ ok: true, user_id: d.user_id || r.user_id, name: r.name, pw: r.password ? L('(직접 입력한 비밀번호)', '(password as entered)') : (d.temp_password || '') });
      return true;
    }
    if (d && d.error === 'possible_duplicate') { r._dup = true; r._msg = (en() && d.message_en) || d.message || ''; return false; }
    if (res.status === 401 || res.status === 403) { r._fail = true; r._msg = (en() && d.message_en) || d.message || ('HTTP ' + res.status); r._stop = true; return false; }
    r._fail = true; r._msg = (en() && d && d.message_en) || (d && d.message) || (d && d.error) || ('HTTP ' + res.status);
    return false;
  }

  async function runAll() {
    var list = okRecs().filter(function (r) { return !r._dup; });
    if (!list.length || STATE.running) return;
    if (!confirm(L(list.length + '명을 등록할까요?', 'Register ' + list.length + ' students?'))) return;
    STATE.running = true; paintRunBtn();
    var ok = 0, dup = 0, fail = 0;
    for (var i = 0; i < list.length; i++) {
      setStatus(L('등록 중… ' + (i + 1) + ' / ' + list.length, 'Registering… ' + (i + 1) + ' / ' + list.length), '#1d4ed8');
      var r = list[i];
      if (await postOne(r, false)) ok++;
      else if (r._dup) dup++;
      else { fail++; if (r._stop) { renderTable(); break; } }
      if (i % 5 === 4) renderTable();
    }
    STATE.running = false;
    renderTable(); paintRunBtn(); finishStatus(ok, dup, fail);
  }
  function finishStatus(ok, dup, fail) {
    var parts = [L('✅ 등록 ' + ok + '명', '✅ ' + ok + ' registered')];
    if (dup) parts.push(L('⚠️ 확인 필요 ' + dup + '명(같은 이름·번호가 이미 있음)', '⚠️ ' + dup + ' need review (same name & phone exists)'));
    if (fail) parts.push(L('❌ 실패 ' + fail + '명', '❌ ' + fail + ' failed'));
    setStatus(parts.join(' · ') + (STATE.results.length ? L(' — 결과 받기로 임시 비밀번호를 저장하세요.', ' — save temporary passwords via Download results.') : ''),
      fail ? '#b91c1c' : (dup ? '#b45309' : '#166534'));
    modal().querySelector('#smb-result-csv').style.display = STATE.results.length ? '' : 'none';
  }
  async function forceOne(i) {
    var r = STATE.recs[i];
    if (!r || STATE.running || !r._dup) return;
    if (!confirm(L('같은 이름·연락처의 학생이 이미 있습니다.\n다른 학생이 맞으면 «' + r.user_id + '» 로 등록합니다.', 'A student with the same name and phone exists.\nRegister "' + r.user_id + '" anyway?'))) return;
    STATE.running = true;
    await postOne(r, true);
    STATE.running = false;
    renderTable(); paintRunBtn();
    modal().querySelector('#smb-result-csv').style.display = STATE.results.length ? '' : 'none';
  }
  function downloadResults() {
    var q = function (s) { s = String(s == null ? '' : s); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var lines = [[L('아이디', 'ID'), L('이름', 'Name'), L('비밀번호', 'Password')].join(',')];
    STATE.results.forEach(function (r) { lines.push([q(r.user_id), q(r.name), q(r.pw)].join(',')); });
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    saveText('﻿' + lines.join('\r\n') + '\r\n', '학생단체등록_결과_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + '.csv');
  }

  window.smOpenBulkRegister = open;
  // 하니스용(순수 함수만)
  window.__smBulk = { parseDelimited: parseDelimited, rowsToRecords: rowsToRecords, checkRecords: checkRecords, fixPhone: fixPhone, parseXlsx: parseXlsx, decodeText: decodeText };
})();
