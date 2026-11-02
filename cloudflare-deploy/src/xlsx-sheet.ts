/** Worksheet XML, style IDs and sheet naming. Independent of ZIP/HTTP. */
export type Cell = string | number | null | undefined;
export interface Sheet {
  /** 시트 이름. 엑셀 제한(31자, : \ / ? * [ ] 금지)은 여기서 알아서 다듬는다. */
  name: string;
  rows: Cell[][];
  /** 위에서부터 이 줄 수만큼은 제목줄로 굵게. 기본 0 */
  headerRows?: number;
}

/* ── XLSX ───────────────────────────────────────────────────────────────── */

export const xesc = (s: string) => String(s)
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
export function safeSheetName(name: string, used: Set<string>): string {
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

export const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
export function sheetXml(sheet: Sheet): string {
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
