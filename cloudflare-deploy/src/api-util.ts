// ═══════════════════════════════════════════════════════════════════════
// 🧰 API 공용 헬퍼 — api-mango.ts 에서 분리 (docs/REFACTOR_PLAN.md 1단계)
//    도메인별 api-*.ts 파일들이 공유하는 최소 유틸만 둔다. 로직 변경 금지.
// ═══════════════════════════════════════════════════════════════════════

export const json = (data: any, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });

/**
 * 빈/잘못된 JSON body 를 안전하게 파싱.
 * 🩺 셀프 진단 페이지가 빈 POST 로 self-ping 할 때 500 대신 400 이 나오도록 하는 공통 방어막.
 *   - body 없음 / 비어있음 / JSON 아님 → null 반환 (호출자가 400 응답)
 *   - 정상 JSON → 파싱된 객체
 */
export async function parseJsonBody(request: Request): Promise<any | null> {
  try {
    const text = await request.text();
    if (!text || !text.trim()) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ── CSV·검증 공용 (api-mango.ts 에서 이동, 2026-07-14 8차) ──
/** 필수 필드 누락 시 400 응답 생성 — 에러 메시지에 필드명 포함 (디버깅 편의) */
export const invalidBody = (required: string[]): Response =>
  json({ ok: false, error: 'invalid_body', required }, 400);

/**
 * 📥 CSV 직렬화 (Phase 6)
 *   - 행에 따옴표/콤마/개행 들어가면 RFC 4180 방식으로 escape
 *   - 맨 앞에 UTF-8 BOM 붙여 Excel 한글 깨짐 방지
 *   - columns 의 순서가 그대로 헤더·셀 매핑에 사용됨
 */
export function toCSV(rows: any[], columns: { key: string; label?: string }[]): string {
  const escape = (v: any): string => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = columns.map(c => escape(c.label || c.key)).join(',');
  const body = rows.map(r => columns.map(c => escape(r[c.key])).join(',')).join('\n');
  return '﻿' + header + '\n' + body + '\n';
}

/**
 * CSV 응답 헬퍼 — 다운로드 헤더 포함.
 */
export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
