/* ════════════════════════════════════════════════════════════════
   통합 검색 API — 메뉴 / 학생 / 교사 자동 분류  (Cloudflare Workers + D1)
   ────────────────────────────────────────────────────────────────
   라우트:  GET /api/admin/search?q=<검색어>
   응답:    { query, results: [{ type, id, label, sub, url }], total?, message? }
            type ∈ 'menu' | 'student' | 'teacher'

   동작 순서
   1) 메뉴 카탈로그(서버 보관)에서 이름·키워드 매칭   → type:'menu'
   2) DB students 테이블에서 이름(한/영)·아이디 LIKE  → type:'student'
   3) DB teachers 테이블에서 이름 LIKE                → type:'teacher'
   4) 합쳐서 반환. 0건이면 안내 메시지(message) 포함.
   ════════════════════════════════════════════════════════════════ */

export interface Env { DB: D1Database; }

type Hit = { type: 'menu' | 'student' | 'teacher'; id: string; label: string; sub: string; url: string };

/* ── 1) 메뉴 카탈로그 — 라우팅 대상 + 검색 키워드(유사어) ── */
const MENU_CATALOG = [
  { id: 'eval',       label: '평가서',    url: '/admin/eval',       keywords: ['평가서', '평가', '성적', '리포트', 'report', 'evaluation'] },
  { id: 'settlement', label: '정산 통계', url: '/admin/settlement', keywords: ['정산', '정산통계', '지사', '대리점', '매출', 'settlement'] },
  { id: 'stats',      label: '통계',      url: '/admin/stats',      keywords: ['통계', '지표', '대시보드', 'kpi', 'statistics', 'dashboard'] },
  { id: 'points',     label: '포인트',    url: '/admin/points',     keywords: ['포인트', '기프트', '상점', '리워드', '적립', 'point'] },
  { id: 'parent',     label: '학부모',    url: '/admin/parents',    keywords: ['학부모', '부모', '보호자', 'parent'] },
  { id: 'content',    label: '콘텐츠',    url: '/admin/content',    keywords: ['콘텐츠', '교재', '자료', '영상', 'content'] },
  { id: 'system',     label: '시스템',    url: '/admin/system',     keywords: ['시스템', '설정', '권한', '진단', 'system', 'settings'] },
];

function searchMenus(q: string): Hit[] {
  const ql = q.toLowerCase();
  return MENU_CATALOG
    .filter(m => m.label.toLowerCase().includes(ql) || m.keywords.some(k => k.includes(ql) || ql.includes(k)))
    .map(m => ({ type: 'menu', id: m.id, label: m.label, sub: '메뉴', url: m.url }));
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/* ── 메인 핸들러 — index.ts 의 fetch() 라우터에서 호출 ── */
export async function handleUnifiedSearch(request: Request, env: Env): Promise<Response> {
  const q = (new URL(request.url).searchParams.get('q') || '').trim();
  if (!q) return json({ query: '', results: [], message: '검색어를 입력하세요.' });

  // 1) 메뉴 (동기, 빠름)
  const menuHits = searchMenus(q);

  // 2)·3) 학생/교사 (DB 병렬 조회)
  const like = `%${q}%`;
  let studentHits: Hit[] = [];
  let teacherHits: Hit[] = [];

  const [stu, tea] = await Promise.allSettled([
    env.DB.prepare(
      `SELECT user_id AS id, korean_name, english_name
         FROM students
        WHERE korean_name LIKE ?1 OR english_name LIKE ?1 OR user_id LIKE ?1
        LIMIT 8`
    ).bind(like).all(),
    env.DB.prepare(
      `SELECT id, name FROM teachers WHERE name LIKE ?1 LIMIT 8`
    ).bind(like).all(),
  ]);

  if (stu.status === 'fulfilled') {
    studentHits = (stu.value.results as any[] || []).map(r => ({
      type: 'student',
      id: String(r.id),
      label: r.korean_name || r.english_name || String(r.id),
      sub: [r.english_name, r.id].filter(Boolean).join(' · '),
      url: `/admin/student?uid=${encodeURIComponent(r.id)}`,   // 학생 정보 페이지
    }));
  }
  if (tea.status === 'fulfilled') {
    teacherHits = (tea.value.results as any[] || []).map(r => ({
      type: 'teacher',
      id: String(r.id),
      label: r.name,
      sub: '교사',
      url: `/admin/teacher?id=${encodeURIComponent(r.id)}`,    // 교사 정보 페이지
    }));
  }

  const results = [...menuHits, ...studentHits, ...teacherHits];

  // 4) 예외 처리 — 0건이면 친절한 안내
  if (results.length === 0) {
    return json({ query: q, results: [], message: '해당하는 메뉴/사용자를 찾을 수 없습니다.' });
  }
  return json({ query: q, results, total: results.length });
}

/* ── index.ts 연결 예시 ──────────────────────────────────────────
import { handleUnifiedSearch } from './unified-search';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/admin/search') {
      // (선택) 여기서 관리자 인증 검사 후
      return handleUnifiedSearch(request, env);
    }
    // ... 다른 라우트
    return env.ASSETS.fetch(request);
  },
};
──────────────────────────────────────────────────────────────── */
