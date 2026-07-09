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
