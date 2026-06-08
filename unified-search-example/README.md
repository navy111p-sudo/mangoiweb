# 🔎 통합 검색창 (메뉴 / 학생 / 교사 자동 분류)

관리자 대시보드용 통합 검색 기능 예시 코드입니다. 검색어를 입력하면 **메뉴·학생·교사 세 유형으로 자동 분류**해 해당 페이지로 이동시키고, 없으면 안내 메시지를 띄웁니다.

## 동작 흐름

```
[사용자 입력] ─디바운스(250ms)→ [프론트엔드]
      │  GET /api/admin/search?q=검색어
      ▼
[백엔드] ── ① 메뉴 카탈로그 키워드 매칭        → type: "menu"
        ├─ ② DB students 이름/아이디 LIKE 조회 → type: "student"
        └─ ③ DB teachers 이름 LIKE 조회        → type: "teacher"
      │  { results: [{ type, label, sub, url }], message? }
      ▼
[프론트엔드] 유형별 그룹 표시 → 클릭/Enter → it.url 로 라우팅
             결과 0건 → "해당하는 메뉴/사용자를 찾을 수 없습니다"
```

분류 원리(요구사항의 "입력값 자동 확인"):
- **메뉴**는 서버가 가진 **키워드 사전**으로 판별합니다(예: `정산·지사·대리점` → 정산 통계). AI 없이도 정확·즉시.
- **사람 이름**은 메뉴에 안 걸리면 **DB를 직접 조회**해 일치하는 학생/교사를 찾습니다.
- 한 검색어가 여러 유형에 걸리면 **모두** 반환하고 화면에서 그룹으로 보여줍니다.
- (선택) 메뉴·이름 어디에도 안 걸리는 모호한 문장은 마지막에 **AI 의도분석 API로 폴백**하도록 확장할 수 있습니다.

## 파일

| 파일 | 설명 |
|------|------|
| `unified-search-demo.html` | **바로 실행되는 데모.** 더블클릭으로 열면 mock 데이터로 동작합니다. (백엔드 불필요) |
| `backend-cloudflare-d1.ts` | 실제 스택(Cloudflare Workers + D1) 백엔드. `/api/admin/search` |
| `backend-express.js` | 일반 Node/Express 백엔드 예시. `npm i express && node backend-express.js` |
| `UnifiedSearch.jsx` | React 컴포넌트 버전 |

## API 규격

요청: `GET /api/admin/search?q=<검색어>`

응답:
```json
{
  "query": "정산",
  "results": [
    { "type": "menu",    "id": "settlement", "label": "정산 통계", "sub": "메뉴",        "url": "/admin/settlement" },
    { "type": "student", "id": "stu004",     "label": "정우영",   "sub": "Wooyoung · stu004", "url": "/admin/student?uid=stu004" },
    { "type": "teacher", "id": "t01",        "label": "박지윤",   "sub": "교사",        "url": "/admin/teacher?id=t01" }
  ],
  "total": 3
}
```

없을 때:
```json
{ "query": "없는단어", "results": [], "message": "해당하는 메뉴/사용자를 찾을 수 없습니다." }
```

## 프론트엔드 연결 (vanilla)

HTML에 검색창 + 결과 컨테이너를 두고 `unified-search-demo.html`의 `<script>` 로직을 붙이면 됩니다. 실제 적용 시에는 데모용 `mockSearch()` 폴백만 지우고 `fetch('/api/admin/search?q=...')`만 사용하세요.

```html
<input id="unified-search" type="search" placeholder="검색…">
<div id="unified-search-results" class="us-results"></div>
```

## 메뉴 추가/수정

`MENU_CATALOG` 배열에 `{ id, label, url, keywords }` 한 줄만 추가하면 새 메뉴가 검색됩니다. `keywords`에 유사어를 넉넉히 넣을수록 잘 잡힙니다.

## 보안 메모
- `/api/admin/search`는 **관리자 인증 후**에만 호출되게 하세요(학생/교사 개인정보 조회이므로).
- 응답 `url`은 서버가 정한 화이트리스트 경로만 쓰고, 프론트는 그 값으로만 이동합니다.
