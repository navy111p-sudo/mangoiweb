/* ════════════════════════════════════════════════════════════════
   통합 검색 API — 간단한 Node.js / Express 백엔드 예시
   ────────────────────────────────────────────────────────────────
   GET /api/admin/search?q=<검색어>
   → { query, results: [{ type, id, label, sub, url }], total?, message? }

   실행:  npm i express  →  node backend-express.js  →  http://localhost:3000
   실제 DB(MySQL/Postgres/SQLite 등) 연결 시 searchStudents/searchTeachers
   함수 안의 mock 배열을 실제 쿼리로만 교체하면 됩니다.
   ════════════════════════════════════════════════════════════════ */
const express = require('express');
const app = express();

/* ── 1) 메뉴 카탈로그 (이름 + 키워드/유사어 + 이동 URL) ── */
const MENU_CATALOG = [
  { id: 'eval',       label: '평가서',    url: '/admin/eval',       keywords: ['평가서', '평가', '성적', '리포트', 'report'] },
  { id: 'settlement', label: '정산 통계', url: '/admin/settlement', keywords: ['정산', '지사', '대리점', '매출', '정산통계'] },
  { id: 'stats',      label: '통계',      url: '/admin/stats',      keywords: ['통계', '지표', '대시보드', 'kpi'] },
  { id: 'points',     label: '포인트',    url: '/admin/points',     keywords: ['포인트', '기프트', '상점', '리워드', '적립'] },
  { id: 'parent',     label: '학부모',    url: '/admin/parents',    keywords: ['학부모', '부모', '보호자'] },
  { id: 'content',    label: '콘텐츠',    url: '/admin/content',    keywords: ['콘텐츠', '교재', '자료', '영상'] },
  { id: 'system',     label: '시스템',    url: '/admin/system',     keywords: ['시스템', '설정', '권한', '진단'] },
];

function searchMenus(q) {
  const ql = q.toLowerCase();
  return MENU_CATALOG
    .filter(m => m.label.toLowerCase().includes(ql) || m.keywords.some(k => k.includes(ql) || ql.includes(k)))
    .map(m => ({ type: 'menu', id: m.id, label: m.label, sub: '메뉴', url: m.url }));
}

/* ── 2)·3) DB 조회 (여기선 mock — 실제론 SQL 로 교체) ── */
const STUDENTS = [
  { id: 'stu001', name: '김민준', en: 'Minjun Kim' },
  { id: 'stu002', name: '이서윤', en: 'Seoyoon Lee' },
  { id: 'stu003', name: '정우영', en: 'Wooyoung Jung' },
];
const TEACHERS = [
  { id: 't01', name: '박지윤' },
  { id: 't02', name: 'Maria Santos' },
];

async function searchStudents(q) {
  const ql = q.toLowerCase();
  // 실제: SELECT user_id,korean_name,english_name FROM students
  //       WHERE korean_name LIKE ? OR english_name LIKE ? OR user_id LIKE ? LIMIT 8
  return STUDENTS
    .filter(s => s.name.includes(q) || s.en.toLowerCase().includes(ql) || s.id.includes(ql))
    .map(s => ({ type: 'student', id: s.id, label: s.name, sub: `${s.en} · ${s.id}`, url: `/admin/student?uid=${s.id}` }));
}
async function searchTeachers(q) {
  const ql = q.toLowerCase();
  // 실제: SELECT id,name FROM teachers WHERE name LIKE ? LIMIT 8
  return TEACHERS
    .filter(t => t.name.toLowerCase().includes(ql))
    .map(t => ({ type: 'teacher', id: t.id, label: t.name, sub: '교사', url: `/admin/teacher?id=${t.id}` }));
}

/* ── 메인 라우트 ── */
app.get('/api/admin/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ query: '', results: [], message: '검색어를 입력하세요.' });

  const [menu, students, teachers] = await Promise.all([
    Promise.resolve(searchMenus(q)),
    searchStudents(q),
    searchTeachers(q),
  ]);

  const results = [...menu, ...students, ...teachers];
  if (results.length === 0) {
    return res.json({ query: q, results: [], message: '해당하는 메뉴/사용자를 찾을 수 없습니다.' });
  }
  res.json({ query: q, results, total: results.length });
});

app.use(express.static('.')); // 데모 HTML 서빙용(선택)
app.listen(3000, () => console.log('🔎 통합 검색 API → http://localhost:3000/api/admin/search?q=정산'));
