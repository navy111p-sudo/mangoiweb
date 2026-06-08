/* ════════════════════════════════════════════════════════════════
   통합 검색창 — React 컴포넌트
   ────────────────────────────────────────────────────────────────
   · 입력 → 디바운스 → GET /api/admin/search?q= 호출
   · type(menu/student/teacher)별 그룹 표시
   · 클릭/↑↓·Enter → 해당 url 로 이동
   · 결과 없으면 안내 메시지
   · 라우팅: 기본은 window.location. react-router 사용 시 onNavigate prop 으로 교체.
   사용:  <UnifiedSearch />  또는  <UnifiedSearch onNavigate={(url)=>navigate(url)} />
   ════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from 'react';

const KIND_LABEL = { menu: '📋 메뉴', student: '👨‍🎓 학생', teacher: '🧑‍🏫 교사' };
const GROUP_ORDER = ['menu', 'student', 'teacher'];

export default function UnifiedSearch({ onNavigate }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounceRef = useRef(null);
  const reqIdRef = useRef(0);

  // 디바운스 검색
  useEffect(() => {
    clearTimeout(debounceRef.current);
    const query = q.trim();
    if (!query) { setItems([]); setMessage(''); setOpen(false); return; }
    debounceRef.current = setTimeout(() => runSearch(query), 250);
    return () => clearTimeout(debounceRef.current);
  }, [q]);

  async function runSearch(query) {
    const myId = ++reqIdRef.current;
    setLoading(true); setOpen(true);
    try {
      const r = await fetch('/api/admin/search?q=' + encodeURIComponent(query), { credentials: 'include' });
      const data = await r.json();
      if (myId !== reqIdRef.current) return;     // 오래된 응답 무시
      setItems(data.results || []);
      setMessage(data.results?.length ? '' : (data.message || '검색 결과가 없습니다.'));
      setActive(data.results?.length ? 0 : -1);
    } catch {
      if (myId !== reqIdRef.current) return;
      setItems([]); setMessage('검색 중 오류가 발생했습니다.');
    } finally {
      if (myId === reqIdRef.current) setLoading(false);
    }
  }

  function route(it) {
    if (!it?.url) return;
    setOpen(false);
    if (onNavigate) onNavigate(it.url);     // react-router 등
    else window.location.href = it.url;     // 기본 이동
  }

  function onKeyDown(e) {
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + items.length) % items.length); }
    else if (e.key === 'Enter') { e.preventDefault(); route(items[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  return (
    <div className="us-box" style={{ position: 'relative', maxWidth: 560 }}>
      <input
        className="us-input"
        type="search"
        value={q}
        placeholder="평가서, 정산, 포인트… 또는 학생·교사 이름"
        autoComplete="off"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => { if (items.length || message) setOpen(true); }}
      />

      {open && (
        <div className="us-results" role="listbox">
          {loading && <div className="us-loading">🔎 검색 중…</div>}

          {!loading && !items.length && (
            <div className="us-empty">{message || '검색 결과가 없습니다.'}</div>
          )}

          {!loading && GROUP_ORDER.map((type) => {
            const group = items.filter((it) => it.type === type);
            if (!group.length) return null;
            return (
              <div key={type}>
                <div className="us-group-head">{KIND_LABEL[type]} ({group.length})</div>
                {group.map((it) => {
                  const i = items.indexOf(it);
                  return (
                    <button
                      key={it.type + it.id}
                      className={'us-item' + (i === active ? ' active' : '')}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => route(it)}
                      role="option"
                      aria-selected={i === active}
                    >
                      <span className="us-kind">{KIND_LABEL[it.type]}</span>
                      <span className="us-label">{it.label}</span>
                      {it.sub && <span className="us-sub">{it.sub}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
