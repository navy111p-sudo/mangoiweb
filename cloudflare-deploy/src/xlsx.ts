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
   외부 코드 없이 zip-store.ts에서 처리한다(압축률은 포기하지만 리포트 크기는 수십 KB 다).

   [만드는 것]
     [Content_Types].xml · _rels/.rels · xl/workbook.xml · xl/_rels/workbook.xml.rels
     xl/styles.xml · xl/worksheets/sheetN.xml
   숫자는 진짜 숫자(<v>)로, 글자는 inlineStr 로 넣는다(공유문자열 표를 안 만들어도 되게).
   ═══════════════════════════════════════════════════════════════════════════ */

import { zipStore } from './zip-store';
import { xesc, safeSheetName, sheetXml, STYLES_XML, type Sheet } from './xlsx-sheet';
export type { Cell, Sheet } from './xlsx-sheet';

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
