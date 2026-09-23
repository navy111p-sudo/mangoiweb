/* ═══════════════════════════════════════════════════════════════════════════
   🧹 학생 AI 학습 분석 — «한국어가 아닌 글자» 거르기 + «다음 액션» 되살리기
   ───────────────────────────────────────────────────────────────────────────
   정본 한 곳. 쓰는 곳: src/api-admin.ts 의 POST /api/admin/ai-analyze/student
   (화면: public/parent.html 「AI 추천 학습 경로」).

   🔴 2026-09-23 사장님 제보 두 건:
     ① 「다음 액션」에 「면談을진행」·「khuyến유」 — 한자·베트남어가 섞여 나옴.
        원인: Llama 3.3 에게 「한국어로 작성」이라고 «지시» 만 하고 결과를 안 봤다.
        이 저장소의 반복 실측이 「지시만으로는 안 지켜진다」(CLAUDE.md 2장).
        ✅ 만든 뒤 확인한다 → 섞였으면 한 번 다시 만든다 → 그래도 섞이면 그 항목을 뺀다.
     ② 다시 들어가면 「다음 액션」이 사라짐.
        원인: 12시간 캐시로 저장할 때 INSERT 칸 목록에 next_action 이 없었다.
        ✅ 칸을 더하고, 칸이 없던 «옛 저장본» 은 raw_response 에서 되살린다.

   ⛔ 섞인 글자만 «잘라 내서» 남기지 마세요 — 「면談을진행」 → 「면을진행」 처럼
      말이 안 되는 문장이 됩니다. 그 항목을 «통째로» 뺍니다.
   ⛔ 영어(ASCII)는 막지 않습니다 — 추천에 「apple」 같은 교재 낱말이 실제로 들어갑니다.
   ⚠️ 판정 범위: 한자·가나·«베트남어 전용» 라틴 문자(ă đ ơ ư + 성조 문자 U+1EA0~1EF9)·키릴·태국 문자.
      é·è·ï 처럼 영어 차용어(café·résumé·naïve)에도 쓰는 글자는 일부러 뺐습니다.
      「khuyến」의 ế 는 U+1EBF 라 걸립니다.

   감시: test-harness/ai_analysis_clean_harness.mjs
   ═══════════════════════════════════════════════════════════════════════════ */

const FOREIGN_RE =
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u0102\u0103\u0110\u0111\u01a0\u01a1\u01af\u01b0\u1ea0-\u1ef9\u0400-\u04ff\u0e00-\u0e7f]/;

/** 한국어·영어가 아닌 글자가 한 자라도 있으면 true */
export function hasForeignScript(s: unknown): boolean {
  return FOREIGN_RE.test(String(s ?? ''));
}

/** 목록 칸은 배열로 오거나(모델 응답), ' | ' 로 이어진 문자열로 옵니다(저장본). */
function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(x => String(x ?? '').trim()).filter(Boolean);
  return String(v ?? '').split(' | ').map(x => x.trim()).filter(Boolean);
}

export const CLEAN_FIELDS = ['summary', 'strengths', 'weaknesses', 'recommendations', 'next_action'] as const;
const LIST_FIELDS = new Set(['strengths', 'weaknesses', 'recommendations']);

/** 섞인 글자가 있는 칸 이름들 (목록 칸은 항목 하나라도 섞이면 포함) */
export function foreignFields(a: any): string[] {
  if (!a || typeof a !== 'object') return [];
  const out: string[] = [];
  for (const f of CLEAN_FIELDS) {
    const v = a[f];
    if (LIST_FIELDS.has(f) ? toList(v).some(hasForeignScript) : hasForeignScript(v)) out.push(f);
  }
  return out;
}

/** 섞인 항목을 통째로 뺀 사본. 목록 칸은 ' | ' 로 이어 돌려줍니다(저장 모양).
 *  summary 가 빠지면 summary_dropped=true — 부르는 쪽이 캐시에 안 남기고 안내 문구를 씁니다. */
export function cleanAnalysis(a: any): {
  summary: string; strengths: string; weaknesses: string; recommendations: string;
  next_action: string; dropped: string[]; summary_dropped: boolean;
} {
  const src = a && typeof a === 'object' ? a : {};
  const dropped: string[] = [];
  const list = (f: string) => {
    const items = toList(src[f]);
    const keep = items.filter(x => !hasForeignScript(x));
    if (keep.length < items.length) dropped.push(f);
    return keep.join(' | ');
  };
  const text = (f: string) => {
    const s = String(src[f] ?? '').trim();
    if (hasForeignScript(s)) { dropped.push(f); return ''; }
    return s;
  };
  const summary = text('summary');
  const summaryDropped = dropped.includes('summary');
  return {
    summary,
    strengths: list('strengths'),
    weaknesses: list('weaknesses'),
    recommendations: list('recommendations'),
    next_action: text('next_action'),
    dropped,
    summary_dropped: summaryDropped,
  };
}

/** «깨끗하면서 값이 있는» 정도 — 재시도 답을 고를 때 씁니다.
 *  ⛔ «섞인 칸 수» 로만 견주면 칸이 아예 빠진 답이 «덜 섞였다» 로 이겨 멀쩡한 요약을 잃습니다.
 *  요약을 가장 무겁게 셉니다(없으면 화면이 통째로 빕니다). 파싱 실패는 -1. */
export function cleanScore(a: any): number {
  if (!a || typeof a !== 'object') return -1;
  const c = cleanAnalysis(a);
  const items = (s: string) => (s ? s.split(' | ').length : 0);
  return (c.summary ? 10 : 0) + (c.next_action ? 3 : 0)
    + items(c.recommendations) + items(c.strengths) + items(c.weaknesses);
}

/** 모델 응답 글자에서 JSON 을 꺼냅니다. 못 꺼내면 null. */
export function parseAnalysisJson(raw: unknown): any | null {
  if (raw && typeof raw === 'object') return raw;
  const m = String(raw ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { const p = JSON.parse(m[0]); return p && typeof p === 'object' ? p : null; } catch { return null; }
}

/** next_action 칸이 없던 옛 저장본 — raw_response 에서 되살립니다(모르면 ''). */
export function recoverNextAction(row: any): string {
  const own = String(row?.next_action ?? '').trim();
  if (own) return own;
  const p = parseAnalysisJson(row?.raw_response);
  return String(p?.next_action ?? '').trim();
}

/** 다시 만들 때 모델에게 덧붙이는 말 */
export const KOREAN_ONLY_RETRY_NOTE =
  '⚠️ 직전 답에 한자·베트남어 등 한국어가 아닌 글자가 섞였습니다. 모든 값을 순수 한국어(한글)로만 쓰세요. 한자(예: 談, 進行)·베트남어(예: khuyến)·일본어를 절대 쓰지 마세요. 영어 교재 낱말만 영어로 써도 됩니다.';

/** summary 를 못 살렸을 때 화면에 보일 안내 (지어내지 않음) */
export const SUMMARY_UNAVAILABLE = '(AI 요약을 만들지 못했습니다 — 잠시 뒤 다시 눌러 주세요)';
