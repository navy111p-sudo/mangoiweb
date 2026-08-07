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

/* ═══════════════════════════════════════════════════════════════════
   🔐 공유키 «무중단 회전» — 2026-08-07

   왜: 이 저장소는 **공개(public)** 인데 wrangler.toml 의 [vars] 가 그대로 커밋돼 있어
   PAYROLL_INGEST_KEY · UPTIME_HOOK_KEY 가 누구나 읽을 수 있었다. 값을 바꿔야 하는데,
   이 키를 보내는 쪽이 저장소 밖에 있다:
     · PAYROLL_INGEST_KEY  → 카페24 서버 /root/teacher-payroll-sync.sh (매달) + 리텐션 집계 스크립트
     · UPTIME_HOOK_KEY     → UptimeRobot (사이트 다운 감지 → 문자 발송)
   한쪽만 바꾸면 그 순간부터 급여 투입이 403 이 되고 장애 문자가 안 나간다.
   둘 다 «조용히» 끊기는 종류라 한참 뒤에야 안다.

   그래서 «둘 다 인정» 하는 기간을 둔다:
     1) 이 코드 배포 (새 키 미설정 → 옛 키만 인정 = 동작 무변경)
     2) 새 키를 wrangler secret 으로 등록 (신·구 둘 다 통함)
     3) 외부 호출자를 새 키로 교체
     4) wrangler.toml 에서 옛 키 삭제 → 그때 노출이 실제로 닫힌다

   ⚠️ 4단계까지 가야 «닫힌» 것이다. 2단계에서 멈추면 옛 키가 여전히 통한다.
   ⚠️ 새 키는 반드시 secret 으로. [vars] 에 넣으면 공개 저장소에 그대로 다시 실린다.
   ═══════════════════════════════════════════════════════════════════ */
/**
 * 들어온 키가 후보(새 키·옛 키) 중 하나와 같은가.
 * 후보가 하나도 없으면(둘 다 미설정) **항상 false** — 열어두지 않는다(fail closed).
 */
export function keyMatchesAny(given: unknown, ...candidates: (string | undefined | null)[]): boolean {
  const g = String(given ?? '').trim();
  if (!g) return false;
  return candidates.some((c) => {
    const v = String(c ?? '').trim();
    return v.length > 0 && v === g;
  });
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

/** KST 기준 YYYY-MM-DD (api-mango.ts 에서 이동, 11차) */
export const today = (ts: number = Date.now()) => {
  const d = new Date(ts);
  // KST 기준 날짜
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
};
