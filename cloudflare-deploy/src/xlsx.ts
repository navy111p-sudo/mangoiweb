/* ═══════════════════════════════════════════════════════════════════════════
   📊 xlsx.ts — 진짜 엑셀 파일(.xlsx) 만들기 (2026-08-17 신설)

   [왜 만들었나] 지금까지 내보내기는 CSV 뿐이었다. CSV 는 세 가지가 아프다:
     ① 엑셀이 한글 CSV 를 자주 깨뜨린다(BOM 을 붙여도 지역설정에 따라 다르다)
     ② 숫자가 «글자» 로 들어가 합계·정렬이 안 된다
     ③ 시트가 하나뿐이라 상세 내역을 한 파일에 못 담는다
   .xlsx 는 셋 다 해결한다. 세무사·은행에 그대로 보낼 수 있다.

   [왜 라이브러리를 안 썼나] 이 Worker 는 **런타임 의존성이 하나도 없다**(package.json
   dependencies 없음). SheetJS 같은 것을 넣으면 번들이 수 MB 늘고 Worker 한도를 위협한다.
   xlsx 는 결국 **XML 몇 장을 담은 ZIP** 이라, 압축을 안 하는 STORE 방식으로 만들면
   외부 코드 없이 이 파일 하나로 끝난다(압축률은 포기하지만 리포트 크기는 수십 KB 다).

   [만드는 것]
     [Content_Types].xml · _rels/.rels · xl/workbook.xml · xl/_rels/workbook.xml.rels
     xl/styles.xml · xl/worksheets/sheetN.xml
   숫자는 진짜 숫자(<v>)로, 글자는 inlineStr 로 넣는다(공유문자열 표를 안 만들어도 되게).
   ═══════════════════════════════════════════════════════════════════════════ */

export type Cell = string | number | null | undefined;
export interface Sheet {
  /** 시트 이름. 엑셀 제한(31자, : \ / ? * [ ] 금지)은 여기서 알아서 다듬는다. */
  name: string;
  rows: Cell[][];
  /** 위에서부터 이 줄 수만큼은 제목줄로 굵게. 기본 0 */
  headerRows?: number;
}

/* ── ZIP ────────────────────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry { name: string; data: Uint8Array; crc: number; offset: number; }

/** MS-DOS 시각(2초 단위). 파일 속성일 뿐이라 정확할 필요는 없다. */
function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2)),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function zipStore(files: Array<{ name: string; text: string }>): Uint8Array {
  const enc = new TextEncoder();
  const now = new Date();
  const { time, date } = dosDateTime(now);
  const entries: ZipEntry[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;

  const push = (u: Uint8Array) => { chunks.push(u); offset += u.length; };

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = enc.encode(f.text);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);   // local file header signature
    dv.setUint16(4, 20, true);           // version needed
    dv.setUint16(6, 0x0800, true);       // flags: UTF-8 파일명
    dv.setUint16(8, 0, true);            // method 0 = STORE(무압축)
    dv.setUint16(10, time, true);
    dv.setUint16(12, date, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true); // 압축크기 = 원본크기 (STORE)
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);           // extra field 없음
    local.set(nameBytes, 30);
    entries.push({ name: f.name, data, crc, offset });
    push(local);
    push(data);
  }

  const cdStart = offset;
  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const cd = new Uint8Array(46 + nameBytes.length);
    const dv = new DataView(cd.buffer);
    dv.setUint32(0, 0x02014b50, true);   // central directory signature
    dv.setUint16(4, 20, true);           // version made by
    dv.setUint16(6, 20, true);           // version needed
    dv.setUint16(8, 0x0800, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, time, true);
    dv.setUint16(14, date, true);
    dv.setUint32(16, e.crc, true);
    dv.setUint32(20, e.data.length, true);
    dv.setUint32(24, e.data.length, true);
    dv.setUint16(28, nameBytes.length, true);
    dv.setUint16(30, 0, true);           // extra
    dv.setUint16(32, 0, true);           // comment
    dv.setUint16(34, 0, true);           // disk
    dv.setUint16(36, 0, true);           // internal attrs
    dv.setUint32(38, 0, true);           // external attrs
    dv.setUint32(42, e.offset, true);
    cd.set(nameBytes, 46);
    push(cd);
  }

  const eocd = new Uint8Array(22);
  const dv = new DataView(eocd.buffer);
  dv.setUint32(0, 0x06054b50, true);     // end of central directory
  dv.setUint16(8, entries.length, true);
  dv.setUint16(10, entries.length, true);
  dv.setUint32(12, offset - cdStart, true);
  dv.setUint32(16, cdStart, true);
  push(eocd);

  const out = new Uint8Array(offset);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

/* ── XLSX ───────────────────────────────────────────────────────────────── */

const xesc = (s: string) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  // 엑셀이 못 읽는 제어문자 제거 (탭·개행은 남긴다)
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

/** 0 → A, 25 → Z, 26 → AA */
function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0;) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** 엑셀 시트 이름 제한을 지킨다: 31자 · : \ / ? * [ ] 금지 · 중복 금지 */
function safeSheetName(name: string, used: Set<string>): string {
  let s = String(name || 'Sheet').replace(/[:\\\/\?\*\[\]]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let base = s, i = 2;
  while (used.has(s)) { const suffix = ` (${i++})`; s = base.slice(0, 31 - suffix.length) + suffix; }
  used.add(s);
  return s;
}

/** 한글은 폭이 넓어 2칸으로 세어 열 너비를 잡는다. */
function displayWidth(v: Cell): number {
  const s = v == null ? '' : String(v);
  let w = 0;
  for (const ch of s) w += /[ᄀ-ᇿ㄰-㆏가-힯一-鿿぀-ヿ]/.test(ch) ? 2 : 1;
  return w;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="#,##0.##"/></numFmts>
<fonts count="2">
<font><sz val="11"/><name val="맑은 고딕"/></font>
<font><b/><sz val="11"/><name val="맑은 고딕"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/* 스타일 번호: 0=기본 1=제목(굵게+회색) 2=숫자(#,##0) 3=제목숫자 */
function sheetXml(sheet: Sheet): string {
  const rows = sheet.rows || [];
  const headerRows = sheet.headerRows || 0;
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);

  // 열 너비 — 내용에서 계산(최대 60)
  const widths: number[] = [];
  for (let c = 0; c < maxCols; c++) {
    let w = 8;
    for (const r of rows) w = Math.max(w, displayWidth(r[c]) + 2);
    widths.push(Math.min(60, w));
  }
  const cols = maxCols
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';

  const body = rows.map((row, ri) => {
    /* 굵게 처리할 줄: ① 지정한 제목줄 ② 「[매출]」처럼 대괄호로 시작하는 구획 제목
       (기존 CSV 가 쓰던 표기를 그대로 살린다) */
    const first = row[0] == null ? '' : String(row[0]);
    const isHead = ri < headerRows || /^\s*\[.*\]\s*$/.test(first);
    const cells = row.map((v, ci) => {
      const ref = `${colName(ci)}${ri + 1}`;
      if (v == null || v === '') return '';
      if (typeof v === 'number' && Number.isFinite(v)) {
        /* 정수는 #,##0 · 소수는 #,##0.## — 이익률 −91.46 이 «−91» 로 보이면 안 된다.
           (2026-08-17: 정수 서식을 전부에 쓰다가 이익률·비율이 반올림돼 보였다) */
        const st = Number.isInteger(v) ? (isHead ? 3 : 2) : (isHead ? 5 : 4);
        return `<c r="${ref}" s="${st}"><v>${v}</v></c>`;
      }
      return `<c r="${ref}" s="${isHead ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${xesc(String(v))}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${body}</sheetData></worksheet>`;
}

/** 시트 목록 → .xlsx 바이트. 시트가 없으면 빈 시트 하나를 넣는다(엑셀이 거부하지 않게). */
export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const used = new Set<string>();
  const list = (sheets && sheets.length ? sheets : [{ name: 'Sheet1', rows: [] }])
    .map(s => ({ ...s, name: safeSheetName(s.name, used) }));

  const files: Array<{ name: string; text: string }> = [];

  files.push({
    name: '[Content_Types].xml',
    text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`,
  });

  files.push({
    name: '_rels/.rels',
    text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  });

  files.push({
    name: 'xl/workbook.xml',
    text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${list.map((s, i) => `<sheet name="${xesc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`,
  });

  files.push({
    name: 'xl/_rels/workbook.xml.rels',
    text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  });

  files.push({ name: 'xl/styles.xml', text: STYLES_XML });
  list.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s) }));

  return zipStore(files);
}

/** 다운로드 응답. 파일명에 한글이 있어도 깨지지 않게 RFC 5987 로 함께 보낸다. */
export function xlsxResponse(filename: string, sheets: Sheet[]): Response {
  const bytes = buildXlsx(sheets);
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_');
  // buildXlsx 의 Uint8Array 는 딱 맞게 할당돼 있어 .buffer 가 그대로 본문이다
  return new Response(bytes.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'no-store',
    },
  });
}
