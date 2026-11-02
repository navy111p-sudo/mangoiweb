/**
 * b2b-student-pay-block.ts — 🏫 B2B 대리점 학생은 «직접 결제» 를 못 하게 막는다 (2026-11-02 사장님)
 * ════════════════════════════════════════════════════════════════════════
 * [왜] 「결제유형이 B2B 로 되어 있는 대리점은 학생이 AI 컨텐츠나 화상수업을 직접 결제할 수
 *   없도록 막아야 해.」 B2B 대리점은 학원이 우리에게 한꺼번에 낸다(통장 입금·학원 결제 링크·
 *   AI 사용료 청구서). 그 학원 학생이 홈에서 또 결제하면 «같은 수업을 두 번» 받게 된다.
 *
 * [판정] 정본은 «대리점 관리» 의 지정값 `centers.payment_type`(B2B/B2C/미지정).
 *   학생 → 대리점 연결은 회계와 같은 규칙: `students_erp.shop_name = centers.name`
 *   (accounting-reports.ts paymentsList 의 chExpr). 대리점에 지정이 없으면 학생의
 *   `payment_type`('B2B …' 류)를 본다.
 *   ⚠️ `centers.name` 은 유일하지 않다(CLAUDE.md «가맹점 정산에서 특정 지사 매출이 통째로 안 잡힘»).
 *      같은 이름이 둘 이상이면 학생의 지사 이름(`students_erp.franchise`)으로 한 번 더 좁히고,
 *      그래도 B2B 와 B2C 가 섞이면 «모름» 으로 둔다.
 *
 * [실패 방향] 모르면 막지 않는다(예전 동작 = 결제 가능). 막는 쪽으로 실패하면 B2C 학생이
 *   결제를 못 해 수업이 끊긴다 — 그쪽이 더 나쁘다. 조회 실패도 «모름».
 *
 * ⛔ 학원이 내는 길(/api/pay/b2b/* 학원 결제 링크 · MGB- AI 사용료 청구서)은 여기서 막지 않는다 —
 *    그 길은 학생이 아니라 학원이 결제한다.
 * ⛔ 이 파일은 import 가 없다 — enroll-ops.ts(다른 도메인 import 금지 원칙)에서도 부를 수 있게.
 */

export const B2B_PAY_BLOCK_ERROR = 'b2b_agency_pay_blocked';

/** 학생·학부모에게 보이는 문구(화면들이 서버 message 를 그대로 띄운다). */
export function b2bPayBlockMessage(shop: string): string {
  const where = shop ? `«${shop}»` : '다니시는 학원';
  return `${where} 은(는) 학원에서 수강료를 결제하는 곳이라 여기서 직접 결제할 수 없습니다. 수강료·A.i 이용은 다니시는 학원에 문의해 주세요.\n`
    + `This academy pays tuition on your behalf, so you cannot pay here directly. Please ask your academy.`;
}

export interface CenterRow { payment_type: string | null; franchise_name: string | null }

const norm = (v: unknown) => String(v ?? '').trim().toUpperCase();

/**
 * 순수 판정. rows = 이름이 학생 shop_name 과 같은 대리점들.
 * 반환: 'B2B' | 'B2C' | null(지정 없음) | 'unknown'(섞여서 모름)
 */
export function decideAgencyPayType(rows: CenterRow[], studentFranchise: string | null, studentPayType: string | null): 'B2B' | 'B2C' | null | 'unknown' {
  const typed = (rs: CenterRow[]) => rs.map(r => norm(r.payment_type)).filter(t => t === 'B2B' || t === 'B2C');
  let ts = typed(rows || []);
  if (new Set(ts).size > 1) {
    const f = String(studentFranchise ?? '').trim();
    if (f) ts = typed((rows || []).filter(r => String(r.franchise_name ?? '').trim() === f));
    if (new Set(ts).size > 1) return 'unknown';
  }
  if (ts.length) return ts[0] as 'B2B' | 'B2C';
  // 대리점에 지정이 없으면 학생 칸(회계 규칙과 같음)
  return /^B2B/.test(norm(studentPayType)) ? 'B2B' : null;
}

/** 이 학생이 B2B 대리점 소속이면 {blocked:true}. 모르거나 조회 실패면 막지 않는다. 던지지 않는다. */
export async function studentPayBlock(env: any, uid: string): Promise<{ blocked: boolean; shop: string; type: string | null }> {
  const id = String(uid || '').trim();
  if (!id || !env?.DB) return { blocked: false, shop: '', type: null };
  try {
    let s: any = await env.DB.prepare(
      `SELECT shop_name, franchise, payment_type FROM students_erp WHERE user_id = ? LIMIT 1`
    ).bind(id).first();
    if (!s) {
      // 대소문자만 다른 계정은 «하나뿐일 때만»(Kim/kim 처럼 둘이 실재하면 모름)
      const r: any = await env.DB.prepare(
        `SELECT shop_name, franchise, payment_type FROM students_erp WHERE user_id = ? COLLATE NOCASE LIMIT 2`
      ).bind(id).all();
      const rs = (r?.results || []) as any[];
      if (rs.length === 1) s = rs[0];
    }
    if (!s) return { blocked: false, shop: '', type: null };
    const shop = String(s.shop_name || '').trim();
    let rows: CenterRow[] = [];
    if (shop) {
      const r: any = await env.DB.prepare(
        `SELECT c.payment_type AS payment_type, (SELECT f.name FROM franchises f WHERE f.id = c.franchise_id) AS franchise_name
           FROM centers c WHERE c.name = ?`
      ).bind(shop).all();
      rows = (r?.results || []) as CenterRow[];
    }
    const t = decideAgencyPayType(rows, s.franchise ?? null, s.payment_type ?? null);
    return { blocked: t === 'B2B', shop, type: t };
  } catch (e: any) {
    console.warn('[b2b-pay-block] 조회 실패 — 막지 않음:', e?.message || e);
    return { blocked: false, shop: '', type: null };
  }
}

/** 막아야 하면 403 JSON 응답 본문, 아니면 null. */
export async function b2bPayBlockBody(env: any, uid: string): Promise<Record<string, unknown> | null> {
  const b = await studentPayBlock(env, uid);
  if (!b.blocked) return null;
  return { ok: false, error: B2B_PAY_BLOCK_ERROR, shop: b.shop, message: b2bPayBlockMessage(b.shop) };
}
