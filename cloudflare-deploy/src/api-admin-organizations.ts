/** organizations: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { json, parseJsonBody, invalidBody } from './api-util';
import { agencyLoginGate } from './agency-login-gate';
import { forbiddenTeacherBody } from './forbidden-teacher';
import { ensureRateOverrideTable } from './org-settlement';
import { getScope, scopeFranchiseCond, scopeCenterCond, canEditOrg } from './scope';
import { runCypher, Neo4jNotConfiguredError } from './teacher-match';
import { ensureCenterOverrideTables, ensureFranchiseOverrideTable } from './cafe24-sync';
import { HQ_PROFILE } from './hq-profile';
import { getAdminActor, hashPassword, FULL_ACCESS_ACCOUNTS, recordLogin } from './auth-admin';

export async function handleAdminOrganizationsApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;


    // ========================================================================

    // 🏢 Phase 9 — 메뉴 6개 (지사·대리점학원·레벨테스트·수강신청·커뮤니티·교재)
    //   ⚠️ 테이블명 franchises=지사 / centers=대리점·학원 (이름이 한 칸 밀려 있음. 아래 주석 참고)
    //   각 테이블은 cold start 시 IF NOT EXISTS 자동 생성. 별도 마이그레이션 불필요.
    // ========================================================================
    // ─── 지사 (테이블명은 franchises 지만 실제 내용은 «지사» 241건) ──────────────
    //   ⚠️ 이름이 한 칸 밀려 있다. cafe24-sync 가 Neo4j (:Branch)=지사 → franchises,
    //      (:Center)=대리점·학원 → centers 로 넣는다. 테이블명을 지금 바꾸면 정산·회계까지
    //      번지므로 «화면 라벨만» 바로잡았다(2026-08-08). 테이블명 변경은 별도 작업.
    //   📦 fields=min → 드롭다운용 {id,name} 만(241건 25KB → 6KB)
    if ((method === 'GET' || method === 'POST' || method === 'PATCH') && path === '/api/admin/franchises') {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS franchises (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT, phone TEXT, owner_name TEXT, opened_at TEXT, active INTEGER DEFAULT 1, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      /* 🪪 (2026-09-15 신설 — 사장님 제보 「지사 아이디가 —로 비어 있다. 카페24에 데이터가
         있으니 가져와라」) 실측: 카페24 (:Branch) 노드에는 branch_id·name·address·phone·
         manager·active 만 있고 로그인 계정/아이디 개념 자체가 없다(cafe24-sync.ts 의
         importCafe24Org Cypher 가 그 다섯 칸만 읽는다) — 그래서 「가져올」 원본이 카페24에
         없다. 아래 admin_scope 접두어 매칭(login_id CASE)은 «추정» 일 뿐이고 계정이 아예
         없거나 접두어가 모호한 지사는 늘 —로 남는다. master_branches(대표지사)의
         login_username 과 같은 방식으로 **본사가 직접 입력해 저장하는 칸**을 새로 둔다
         — 카페24 야간 동기화(insF UPSERT)의 컬럼 목록에 없으므로 덮어써지지 않는다
         (franchise_manual_override 같은 별도 표가 필요 없다). 기존 DB 에는 없을 수 있어
         지연 ALTER(이미 있으면 SQLite 가 throw → 흡수, master_branches 와 같은 방식). */
      try { await env.DB.exec(`ALTER TABLE franchises ADD COLUMN login_username TEXT;`); } catch { /* duplicate column — 정상 */ }

      /* 🏛️ 대표지사 (2026-08-18 사장님 수정요청 #03) — 조직을 «대표지사 › 지사 › 대리점» 으로 세운다.
         화면(조직 관리 카드)에는 2026-07 부터 «🏛️ 대표지사» 칸이 있었지만 **배선이 하나도 없어서**
         열면 «데이터 없음» 만 뜨는 껍데기였고, 그래서 display:none 으로 감춰 둔 상태였다.

         ⚠️ 왜 franchises 에 컬럼을 안 붙이고 별도 표를 쓰나 —
            franchises·centers 는 **카페24가 정본**이라 매일 밤 03:45 KST 동기화가 UPSERT 로 덮는다
            (CLAUDE.md 「대리점의 지사 소속을 D1에서 고쳤는데 다음날 원복됨」). 대표지사는 카페24에
            없는 «우리만의 묶음» 이라, 같은 표에 넣으면 하룻밤 만에 사라진다.
            그래서 매핑을 franchise_master_map 에 따로 둔다 — center_franchise_override 와 같은 방식.

         ⚠️ 왜 새 경로(/api/admin/master-branches)를 안 만들었나 —
            새 /api 경로는 src/index.ts 의 라우팅 게이트·인증 게이트를 둘 다 통과해야 하는데
            index.ts 는 공동 금지구역이다. 이미 세 관문이 다 열려 있는 이 경로에 붙인다. */
      const ensureMaster = async () => {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS master_branches (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, region TEXT, tier TEXT, owner_name TEXT, phone TEXT, login_username TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
        /* 🪪 (2026-09-14 신설 — 사장님 제보 「대표지사는 아이디에 1,2,3 이런 숫자가 들어가 있다.
           실제 아이디가 들어가게 해달라」) 지사와 달리 master_branches 는 admin_scope 에 이어 줄
           «지사 이름 하나짜리 접두어 매칭» 이 안 통한다(대표지사는 지사 여러 개를 묶으므로).
           그래서 login_username 은 여전히 **직접 입력해 저장하는 칸**이다(기존 DB 에는 없을 수
           있어 지연 ALTER — 이미 있으면 SQLite 가 throw → 흡수).
           🔑 (2026-09-17 신설 — 사장님 제보 「대표지사도 비밀번호 넣는 곳이 없다」) 그 아이디는
           2026-09-14 까지는 라벨일 뿐이었다 — scope.ts 의 Scope 타입에 'master' 가 없어 admin_scope
           로 이을 길이 없다고 여기 적혀 있었는데, 그건 «지사(branch, 접두어 1개)» 를 기준으로
           본 것이고 실은 scope.ts 에 **'franchise'(지사본사) 타입이 이미 있다** — scope_value 에
           지사 «이름 여러 개를 콤마로» 담는, 대표지사가 하려는 일과 정확히 같은 모양이다.
           그래서 새 Scope 타입을 만들지 않고 이것을 재사용한다: 비밀번호를 설정하면
           scope_type='franchise' + scope_value=산하 지사 이름 목록(franchise_master_map 에서 계산)
           으로 계정을 만든다. ⚠️ scope_value 는 «그 시점의 스냅샷» 이라 지사 배정이 바뀌면 따라가지
           않는다 — master_assign 이 배정을 바꿀 때마다 이 계정의 scope_value 를 다시 계산해 준다
           (refreshMasterScopeValue). ⚠️ scope_value 만으로는 «이 admin_scope 행이 어느 대표지사
           것인지» 구분이 안 된다(이름 목록이라 master_id 가 안 남는다) — 그래서 admin_scope 에
           **master_id 칸을 새로 추가**한다(지연 ALTER). 이게 없으면 비밀번호 재설정 때 «이미 이
           대표지사 계정인지» 를 확인할 방법이 없어, 남의 계정(예: 강사)의 비밀번호를 그대로
           덮어쓰는 사고가 난다(CLAUDE.md 「이미 다른 계정이 쓰고 있는 아이디」 판정과 같은 이유).
           admin_scope 를 읽는 다른 모든 곳은 scope_type/scope_value 만 SELECT 해서(전체 SELECT * 는
           0곳 — grep 확인) 이 칸을 몰라도 그대로 동작한다. */
        try { await env.DB.exec(`ALTER TABLE master_branches ADD COLUMN login_username TEXT;`); } catch { /* duplicate column — 정상 */ }
        /* 🏢 (2026-09-17 신설 — 사장님 「영업본부는 engmaster, 이병엽 이사, 본사직영 이렇게
           3개」) 대표지사 «위» 계층. 옛 LMS 의 「본사명」 칸과는 다른 축이라(같은 대표지사명이
           하나도 안 겹쳤다) 자유 입력 칸으로 둔다 — <select> 로 만들면 값 없는 <option>+
           data-ko/data-en 조합이 i18n 언어 전환 때 .value 를 조용히 깨뜨리는 이 저장소의 문서화된
           함정(mbr-tier 주석 참고)을 다시 밟는다. 사람이 직접 세 값 중 하나를 그대로 타이핑한다. */
        try { await env.DB.exec(`ALTER TABLE master_branches ADD COLUMN division TEXT;`); } catch { /* duplicate column — 정상 */ }
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS franchise_master_map (franchise_id INTEGER PRIMARY KEY, master_id INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
        try { await env.DB.exec(`ALTER TABLE admin_scope ADD COLUMN master_id INTEGER;`); } catch { /* duplicate column — 정상 */ }
      };

      /* 🏛️ (2026-09-17) 대표지사 login_password 계정의 scope_value(콤마 지사 이름 목록)를
         「지금 franchise_master_map 이 말하는 산하 지사」로 다시 맞춘다 — master_assign 이 배정을
         바꿀 때마다 부른다. 링크된 계정이 없으면(비밀번호를 아직 안 만든 대표지사) 조용히
         아무 일도 안 한다. ⛔ 실패를 삼키지 않는다 — 삼키면 «지사를 뺐는데 그 계정이 계속 보는»
         (막았어야 할 접근이 조용히 남는) 쪽으로 실패하게 된다. 학생 데이터가 걸린 자리라
         «막는 쪽» 으로 실패해야 하므로, 여기서 던지면 master_assign 요청 전체가 실패로
         보고된다(사람이 다시 시도하게). */
      const refreshMasterScopeValue = async (masterId: number) => {
        if (!masterId) return;
        const linked = await env.DB.prepare(
          `SELECT username FROM admin_scope WHERE scope_type = 'franchise' AND master_id = ? LIMIT 1`
        ).bind(masterId).first<{ username: string }>();
        if (!linked) return;
        const rows = await env.DB.prepare(
          `SELECT f.name AS name FROM franchise_master_map mm JOIN franchises f ON f.id = mm.franchise_id WHERE mm.master_id = ?`
        ).bind(masterId).all();
        const names = ((rows.results || []) as any[]).map(r => r.name).filter(Boolean);
        await env.DB.prepare(`UPDATE admin_scope SET scope_value = ?, updated_at = ? WHERE username = ?`)
          .bind(names.join(',') || null, Date.now(), linked.username).run();
      };

      /* 🔒 (2026-08-18) 지사·대리점 계정에게 이 API 를 열면서 «자기 것만» 으로 자른다.
         index.ts 의 isAgencyAllowedApi 가 이 경로를 열어 주는 근거가 **바로 이 조건절**이다.
         이 줄을 지우면 전국 지사 241건이 모든 지사장·학원장에게 통째로 나간다. */
      const _fSc = await getScope(env as any, request);
      const _fCond = scopeFranchiseCond(_fSc, 'f');
      const _fWhere = _fCond.cond ? ` WHERE ${_fCond.cond}` : '';

      /* 🔑 (2026-09-17 신설 — 사장님 제보 「아이디 넣는 칸은 생겼는데 비밀번호 넣는 곳이
         없다」) `franchises.login_username` 은 2026-09-15 에 «본사가 직접 입력해 저장하는
         칸» 으로 생겼지만 그 칸은 라벨일 뿐 admin_account 를 전혀 안 건드린다 — 그 아이디로
         실제로 로그인할 수는 없었다. 대리점(centers) 등록이 2026-08-19 에 이미 이 문제를
         풀어 둔 방식(둘 다 채우면 admin_account+admin_scope 를 실제로 만든다)을 그대로
         옮긴다 — «지사» 판은 여기에 «비밀번호 재설정»(이미 계정이 있는 지사) 한 겹만 더한다.
         등록(POST)·수정(PATCH) 이 둘 다 이 도우미를 쓴다 — 검증·계정 생성 로직을 두 곳에
         복제하면 한쪽만 고쳐지는 이 표의 반복 사고가 그대로 재현된다.
         ⚠️ scope_value 는 franchises.name **그대로**(자르지 않음) — scopeFranchiseCond('branch')
         가 `name LIKE scope_value || '%'` 로 찾으므로 자기 이름 전체를 쓰면 최소한 자기
         자신은 항상 걸린다. PATCH 의 옛 계정 찾기(9822행 근처)도 이미 `scope_value = 옛이름`
         **정확일치**로 찾고 있어 같은 값 모양이다.
         ⛔ 지사명이 유일하지 않으면(franchises.name 에 UNIQUE 없음, CLAUDE.md 「centers.name
         이 유일하지 않습니다」와 같은 구조) 계정을 만들지 않는다 — scope_value 가 이름 하나뿐이라
         동명이인 지사 자료가 그대로 섞여 보인다(대리점 duplicate_center_name 검사와 같은 이유). */
      // ⚠️ 반환 모양은 한 가지로 고정한다(판별 유니온 금지) — 이 저장소의 tsconfig 는
      // strictNullChecks:false 라 `if (!pr.ok) return ...;` 뒤에서 판별 유니온이 좁혀지지
      // 않는다(CLAUDE.md 「게이트 헬퍼를 판별 유니온으로 만들었더니」). 실패 필드는 전부
      // optional 로 두고 호출부는 `pr.ok` 만 보고 나머지는 그대로 읽는다.
      const createOrResetBranchLogin = async (username: string, password: string, franchiseName: string):
        Promise<{ ok: boolean; result?: 'created' | 'reset'; error?: string; message?: string; status?: number }> => {
        const loginUsername = username.trim();
        const loginPassword = password;
        if (!/^[a-zA-Z0-9_]{3,32}$/.test(loginUsername)) {
          return { ok: false, error: 'bad_username', message: '아이디는 영문·숫자·밑줄(_)로 3~32자여야 합니다.', status: 400 };
        }
        if (loginPassword.length < 6) {
          return { ok: false, error: 'too_short', message: '비밀번호는 6자 이상이어야 합니다.', status: 400 };
        }
        if (FULL_ACCESS_ACCOUNTS.has(loginUsername.toLowerCase())) {
          return { ok: false, error: 'reserved_username', message: '이 아이디는 시스템 전체권한 계정이라 쓸 수 없습니다.', status: 403 };
        }
        const nameDup = await env.DB.prepare(`SELECT COUNT(*) AS n FROM franchises WHERE name = ?`)
          .bind(franchiseName).first<{ n: number }>();
        if (Number(nameDup?.n || 0) > 1) {
          return { ok: false, error: 'duplicate_franchise_name_for_login',
            message: `이미 같은 이름("${franchiseName}")의 지사가 ${nameDup?.n}곳 있어 로그인 계정을 만들 수 없습니다 — ` +
              `이름으로 접근 범위를 가르기 때문에 다른 지사 자료가 섞여 보일 수 있습니다. 지사 이름을 구분되게 바꾸거나, ` +
              `계정 없이 아이디만 기록해 두고 본사에 문의하세요.`, status: 409 };
        }
        const existing = await env.DB.prepare(`SELECT username FROM admin_account WHERE username = ? COLLATE NOCASE LIMIT 1`)
          .bind(loginUsername).first<{ username: string }>();
        const now = Date.now();
        if (existing) {
          const linkedScope = await env.DB.prepare(`SELECT scope_type, scope_value FROM admin_scope WHERE username = ? LIMIT 1`)
            .bind(existing.username).first<{ scope_type: string; scope_value: string | null }>();
          const isOwnBranch = !!linkedScope && linkedScope.scope_type === 'branch' && linkedScope.scope_value === franchiseName;
          if (!isOwnBranch) {
            return { ok: false, error: 'already_exists',
              message: '이미 다른 계정이 쓰고 있는 아이디입니다. 다른 아이디를 쓰세요.', status: 409 };
          }
          // 🔑 이미 이 지사에 연결된 계정 — 비밀번호만 재설정한다(계정을 새로 만들지 않음).
          await env.DB.prepare(`UPDATE admin_account SET password_hash = ?, updated_at = ? WHERE username = ?`)
            .bind(await hashPassword(loginPassword), now, existing.username).run();
          return { ok: true, result: 'reset' };
        }
        await env.DB.prepare(
          `INSERT INTO admin_account (username, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
        ).bind(loginUsername, await hashPassword(loginPassword), franchiseName, now, now).run();
        await env.DB.prepare(
          `INSERT INTO admin_scope (username, scope_type, scope_value, updated_at) VALUES (?, 'branch', ?, ?)
           ON CONFLICT(username) DO UPDATE SET scope_type = excluded.scope_type, scope_value = excluded.scope_value, updated_at = excluded.updated_at`
        ).bind(loginUsername, franchiseName, now).run();
        return { ok: true, result: 'created' };
      };

      /* 🏛️ (2026-09-17) 대표지사 판 — 위 createOrResetBranchLogin 과 같은 검증·모양이지만
         소속 지사가 «하나」가 아니라 «여러 개(콤마 목록)» 라 scope_type='franchise' 를 쓰고,
         «이미 이 대표지사 것인가» 를 이름 대신 admin_scope.master_id 로 확인한다(위 ensureMaster
         주석 참고 — scope_value 는 지사 배정이 바뀌면 달라지므로 신원 확인에 못 쓴다). */
      const createOrResetMasterLogin = async (username: string, password: string, masterId: number, masterName: string):
        Promise<{ ok: boolean; result?: 'created' | 'reset'; error?: string; message?: string; status?: number; branch_count?: number }> => {
        const loginUsername = username.trim();
        const loginPassword = password;
        if (!/^[a-zA-Z0-9_]{3,32}$/.test(loginUsername)) {
          return { ok: false, error: 'bad_username', message: '아이디는 영문·숫자·밑줄(_)로 3~32자여야 합니다.', status: 400 };
        }
        if (loginPassword.length < 6) {
          return { ok: false, error: 'too_short', message: '비밀번호는 6자 이상이어야 합니다.', status: 400 };
        }
        if (FULL_ACCESS_ACCOUNTS.has(loginUsername.toLowerCase())) {
          return { ok: false, error: 'reserved_username', message: '이 아이디는 시스템 전체권한 계정이라 쓸 수 없습니다.', status: 403 };
        }
        const branchRows = await env.DB.prepare(
          `SELECT f.name AS name FROM franchise_master_map mm JOIN franchises f ON f.id = mm.franchise_id WHERE mm.master_id = ?`
        ).bind(masterId).all();
        const branchNames = ((branchRows.results || []) as any[]).map(r => r.name).filter(Boolean);
        const scopeValue = branchNames.join(',') || null;
        const existing = await env.DB.prepare(`SELECT username FROM admin_account WHERE username = ? COLLATE NOCASE LIMIT 1`)
          .bind(loginUsername).first<{ username: string }>();
        const now = Date.now();
        if (existing) {
          const linkedScope = await env.DB.prepare(`SELECT scope_type, master_id FROM admin_scope WHERE username = ? LIMIT 1`)
            .bind(existing.username).first<{ scope_type: string; master_id: number | null }>();
          const isOwnMaster = !!linkedScope && linkedScope.scope_type === 'franchise' && Number(linkedScope.master_id) === masterId;
          if (!isOwnMaster) {
            return { ok: false, error: 'already_exists',
              message: '이미 다른 계정이 쓰고 있는 아이디입니다. 다른 아이디를 쓰세요.', status: 409 };
          }
          // 🔑 이미 이 대표지사에 연결된 계정 — 비밀번호를 재설정하면서 scope_value 도
          // 지금 배정 기준으로 다시 맞춘다(그동안 산하 지사가 바뀌었을 수 있으므로).
          await env.DB.prepare(`UPDATE admin_account SET password_hash = ?, updated_at = ? WHERE username = ?`)
            .bind(await hashPassword(loginPassword), now, existing.username).run();
          await env.DB.prepare(`UPDATE admin_scope SET scope_value = ?, updated_at = ? WHERE username = ?`)
            .bind(scopeValue, now, existing.username).run();
          return { ok: true, result: 'reset', branch_count: branchNames.length };
        }
        await env.DB.prepare(
          `INSERT INTO admin_account (username, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
        ).bind(loginUsername, await hashPassword(loginPassword), masterName || '대표지사', now, now).run();
        await env.DB.prepare(
          `INSERT INTO admin_scope (username, scope_type, scope_value, master_id, updated_at) VALUES (?, 'franchise', ?, ?, ?)
           ON CONFLICT(username) DO UPDATE SET scope_type = excluded.scope_type, scope_value = excluded.scope_value, master_id = excluded.master_id, updated_at = excluded.updated_at`
        ).bind(loginUsername, scopeValue, masterId, now).run();
        return { ok: true, result: 'created', branch_count: branchNames.length };
      };

      if (method === 'GET') {
        /* 🔍 (2026-09-15 신설 — 사장님이 mangoi.co.kr/lms/branch_list.php(구 LMS)에서 지사마다
           로그인 아이디(jinu007 등)를 직접 확인해 주셨다 — 「LOFTY(전국)」관리자 이태연이
           우리 D1 franchises.id=242 와 정확히 같은 지사·같은 대표자다. 그 아이디가 «어딘가»에는
           실재한다는 뜻인데, 지금 cafe24-sync.ts 가 읽는 Cypher(`b.branch_id·name·address·phone·
           manager·active` 여섯 칸)에는 그 필드가 없다 — 이름이 다른 칸(login_id·account·
           manager_id·username 등)에 들어 있거나, :Branch 가 아니라 이어진 다른 노드에 있을 수
           있다. 추측으로 필드명을 짚어 코드에 박기 전에, :Branch 노드에 **실제로 어떤 속성 이름이
           있는지** 를 먼저 읽어서 보여준다(c24_expense_filter 의 prop_keys 진단과 같은 방식).
           ⛔ 이 결과로 곧바로 franchises 를 UPDATE 하지 않는다 — 어떤 칸인지 사람이 보고
           확인한 뒤에 실제 동기화(cafe24-sync.ts importCafe24Org)에 그 칸을 추가해야
           «전체 241개 지사에 매일 자동으로» 채워진다(수동 입력 없이).
           본사만(canEditOrg) — 원본 그래프의 날 것 그대로의 칸 이름·값을 보여주므로. */
        if (url.searchParams.get('debug') === 'cafe24_props') {
          if (!canEditOrg(_fSc)) return json({ ok: false, error: 'forbidden_scope' }, 403);
          try {
            const idParam = url.searchParams.get('id');
            if (idParam) {
              // 한 지사만 콕 집어 — 자기 속성 + 바로 이어진 다른 노드(계정·직원 등)까지 함께.
              const rs = await runCypher(env, `
                MATCH (b:Branch {branch_id: $id})
                OPTIONAL MATCH (b)-[rel]-(x)
                RETURN properties(b) AS branch_props,
                       collect(DISTINCT {rel_type: type(rel), other_labels: labels(x), other_props: properties(x)}) AS linked`,
                { id: Number(idParam) }, 'READ');
              const row = rs.values[0] || [];
              const idx = (k: string) => rs.fields.indexOf(k);
              return json({
                ok: true, id: Number(idParam),
                branch_props: row[idx('branch_props')] || null,
                linked_nodes: (row[idx('linked')] || []).filter((l: any) => l && l.rel_type),
              });
            }
            // id 없이 부르면 전체 지사에서 «어떤 속성 이름이 실제로 쓰이는지» 만 모아 준다
            // (240여 개 값을 일일이 보는 대신, 이름 목록 + 예시 3건).
            const rs = await runCypher(env, `MATCH (b:Branch) RETURN properties(b) AS props`, {}, 'READ');
            const idx2 = rs.fields.indexOf('props');
            const keySet = new Set<string>();
            const sample: any[] = [];
            for (const row of rs.values) {
              const p = row[idx2] as Record<string, any> | null;
              if (p) Object.keys(p).forEach(k => keySet.add(k));
              if (p && sample.length < 3) sample.push(p);
            }
            return json({ ok: true, branch_count: rs.values.length, all_property_keys: Array.from(keySet).sort(), sample_rows: sample });
          } catch (e: any) {
            if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
            return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
          }
        }
        // 🏛️ view=master → 대표지사 목록 (+ 산하 지사 수)
        if (url.searchParams.get('view') === 'master') {
          await ensureMaster();
          /* 지사·대리점에게는 «자기가 속한» 대표지사만. 전국 권역표를 그대로 주면
             남의 권역·대표자·전화가 그대로 보인다. */
          const mWhere = _fCond.cond
            ? ` WHERE m.id IN (SELECT mm2.master_id FROM franchise_master_map mm2
                                 JOIN franchises f ON f.id = mm2.franchise_id WHERE ${_fCond.cond})`
            : '';
          const rs = await env.DB.prepare(
            `SELECT m.*, (SELECT COUNT(*) FROM franchise_master_map mm WHERE mm.master_id = m.id) AS branch_count
               FROM master_branches m${mWhere} ORDER BY m.active DESC, m.name ASC`
          ).bind(..._fCond.binds).all();
          const _mbrItems = rs.results || [];
          /* 🔒 (2026-09-14, 위 login_username 주석과 짝) 로그인 계정명은 지사 login_id 와 같은
             이유로 본사(hq/none)에게만 싣는다 — 지사·대리점 스코프 계정은 이 API 를 이미 스코프가
             잘린 채로 쓰지만, 남는 한 줄(자기 대표지사)에도 «다른 사람(대표지사 관리자)» 의 계정명이
             실려 있으니 굳이 넓힐 이유가 없다. */
          if (!canEditOrg(_fSc)) {
            for (const it of _mbrItems as any[]) delete it.login_username;
          }
          // ✏️ (2026-09-11) 지사·대리점(centers/franchises)과 같은 이유로 can_edit 을 함께 준다 —
          // 화면이 이걸 보고 «수정» 버튼을 그릴지 정한다(안 주면 지사장 화면에도 버튼이 그려졌다가
          // 눌렀을 때만 403 이 나는 어색한 경험이 된다).
          return json({ ok: true, items: _mbrItems, scoped: !!_fCond.cond, can_edit: canEditOrg(_fSc) });
        }
        const cols = url.searchParams.get('fields') === 'min' ? 'id, name' : '*';
        if (cols === 'id, name') {
          // 드롭다운용 짧은 목록도 같이 자른다 — 여기만 빼먹으면 «선택칸» 으로 전국이 샌다
          const rs = await env.DB.prepare(
            `SELECT f.id, f.name FROM franchises f${_fWhere} ORDER BY f.active DESC, f.name ASC`
          ).bind(..._fCond.binds).all();
          return json({ ok: true, items: rs.results || [] });
        }
        // 전체 목록에는 «어느 대표지사 소속인지» 를 함께 실어 준다(표에 컬럼 하나가 는다).
        await ensureMaster();
        /* 🪪 (2026-09-14 신설 — 사장님 제보 「지사 관리 페이지에 지사 아이디를 볼 수 있는
           화면이 없다. 지사장님들에게 각자 아이디를 공지해야 하는데 공지를 할 수가 없다」)
           지사에는 로그인 계정을 «새로 만드는» 등록칸이 없다(대리점 POST 의 login_username 과
           달리 이 표엔 그런 칸이 처음부터 없었다) — 계정은 admin_scope 에 이름으로 이어질 뿐이라,
           그 연결을 찾아 «읽기 전용 아이디 칸» 으로 보여 준다.

           ⚠️ (trap-check 지적 반영) 처음엔 바로 위 PATCH 의 linkedAccount 조회처럼 branch 쪽을
           «정확일치»(scope_value = f.name)로 썼는데, 그 값을 실제로 채우는 유일한 경로인
           scope.ts autoSeedOne() 은 계정 표시이름에서 「지사」를 뗀 «첫 낱말만»(예: "노원 지사"
           → "노원") scope_value 로 저장하고, 그 값을 실제로 소비하는 scopeFranchiseCond('branch')
           는 처음부터 **접두어(LIKE value||'%')** 로 지사를 찾는다(org_scope_harness.mjs 의
           전제도 그렇다). franchises.name 이 "노원지사"처럼 그 접두어보다 길면 정확일치는
           늘 거짓이라 자동시드된 지사 계정 대부분에서 아이디가 —로 떴을 것이다(PATCH 의 그
           정확일치는 «이름 바뀔 때 드물게만 도는 경고문» 이라 아무도 못 봤을 뿐, 매번 도는
           이 표시 칸에서는 기능 자체가 무너진다) — 그래서 여기는 scopeFranchiseCond 와
           **같은 접두어 매칭**을 쓴다. franchise(지사본사) 쪽은 원래도 접두어가 아니라
           콤마-경계 LIKE(부분일치 아님)라 그대로 둔다.
           ⚠️ 후보가 둘 이상이면(같은 접두어를 쓰는 계정이 여럿) 아무거나 하나를 고르지 않는다 —
           남의 지사 아이디가 뜨는 것보다 «—» 로 비워 두는 쪽이 안전하다(CLAUDE.md
           「강사 이름을 붙였는데 남의 이름이 뜸」과 같은 규칙: 부분일치·모호하면 안 붙임).
           ⚠️ (trap-check 지적 반영) franchises.name 은 유일하지 않다(UNIQUE 제약 없음,
           등록 API 도 중복을 막지 않는다 — CLAUDE.md 의 centers.name 미유일 사례와 같은 구조).
           같은 이름의 지사 행이 둘 이상이면 어느 쪽 것인지 알 수 없으니 둘 다 —로 비운다.

           🪪 (2026-09-15 추가) f.login_username(본사가 직접 입력한 값, 위 ALTER)이 있으면
           그것을 최우선으로 쓴다 — 사람이 «이 지사는 이 계정이다» 라고 확정한 값이라 접두어
           매칭보다 확실하다. 비어 있을 때만 아래 admin_scope 추정으로 떨어진다. */
        const rs = await env.DB.prepare(
          `SELECT f.*, mm.master_id AS master_branch_id, m.name AS master_branch_name,
             (CASE WHEN f.login_username IS NOT NULL AND f.login_username <> '' THEN f.login_username
                   WHEN (SELECT COUNT(*) FROM franchises WHERE name = f.name) > 1 THEN NULL
                   WHEN (SELECT COUNT(*) FROM admin_scope WHERE scope_type = 'branch' AND scope_value IS NOT NULL AND scope_value <> '' AND f.name LIKE scope_value || '%') = 1
                   THEN (SELECT username FROM admin_scope WHERE scope_type = 'branch' AND scope_value IS NOT NULL AND scope_value <> '' AND f.name LIKE scope_value || '%' LIMIT 1)
                   WHEN (SELECT COUNT(*) FROM admin_scope WHERE scope_type = 'franchise' AND (',' || scope_value || ',') LIKE ('%,' || f.name || ',%')) = 1
                   THEN (SELECT username FROM admin_scope WHERE scope_type = 'franchise' AND (',' || scope_value || ',') LIKE ('%,' || f.name || ',%') LIMIT 1)
                   ELSE NULL END) AS login_id
             FROM franchises f
             LEFT JOIN franchise_master_map mm ON mm.franchise_id = f.id
             LEFT JOIN master_branches m ON m.id = mm.master_id${_fWhere}
            ORDER BY f.active DESC, f.name ASC`
        ).bind(..._fCond.binds).all();
        const _frItems = rs.results || [];
        /* 🔒 (trap-check 지적 반영) 로그인 계정명은 «본사가 공지하려고» 보는 정보다.
           지사·대리점 스코프 계정은 이미 이 API 를 스코프가 잘린 채로 쓸 수 있는데(위 _fWhere),
           branch 계정은 접두어 매칭이라 «형제 지사」까지 함께 보일 수 있고, agency 계정은
           자기가 속한 지사의 로그인 아이디를 이 API 에서 «처음으로» 보게 된다 — 새로 넣는
           칸이니 굳이 넓힐 이유가 없다. 본사(hq/none)에게만 싣는다.
           ⚠️ (2026-09-15) f.login_username 은 f.* 로 딸려 나온 원본 칸이라 이것도 함께 지운다
           — 안 지우면 login_id 는 가려도 같은 값이 login_username 으로 그대로 샌다. */
        if (!canEditOrg(_fSc)) {
          for (const it of _frItems as any[]) { delete it.login_id; delete it.login_username; }
        }
        return json({ ok: true, items: _frItems, scope: { type: _fSc.type, label: _fSc.label }, can_edit: canEditOrg(_fSc) });
      }

      /* ✍️ 고치는 것은 본사만 — 등록·대표지사 지정·비활성·수정 전부. 화면에서 버튼을 감추는 것만으로는
         URL 로 그대로 뚫린다(지사장이 남의 지사를 자기 대표지사에 붙일 수 있게 된다). */
      if (!canEditOrg(_fSc)) {
        return json({ ok: false, error: 'forbidden_scope', scope: _fSc.type, message: '조직 정보 수정은 본사만 할 수 있습니다.' }, 403);
      }

      if (method === 'PATCH') {
        /* ✏️ (2026-09-11 신설 — 사장님 제보 「지사도 대리점과 마찬가지로 수정 메뉴가 없다」)
           지사 이름·대표자·전화·주소·개설일을 한 번에 고치는 «부분 수정» — 대리점(centers)
           PATCH 와 같은 방식·같은 위험을 그대로 옮긴 것이다. */
        const b = await parseJsonBody(request);
        const fid = parseInt(String(b?.id || ''), 10);
        if (!fid) return invalidBody(['id']);
        const has = (k: string) => !!b && Object.prototype.hasOwnProperty.call(b, k);

        /* 🔑 name·address·phone·owner_name 은 카페24가 매일 밤 덮어쓰는 칸이다(아래 참고,
           cafe24-sync.ts importCafe24Org 의 insF UPSERT — opened_at 만 제외). «실제로 바뀐
           칸만» 정정표에 남겨야 한다. 이 폼은 등록 폼을 그대로 재사용해 매번 다섯 칸을
           전부 보내므로, 안 그러면 개설일 하나만 고치려고 열었다가 이름·주소·전화·대표자가
           전부 «지금 값에 못 박히는» 사고가 난다. */
        const touchesCafe24Field = has('name') || has('address') || has('phone') || has('owner_name');
        let before: { name: string; address: string | null; phone: string | null; owner_name: string | null } | null = null;
        if (touchesCafe24Field) {
          before = await env.DB.prepare(`SELECT name, address, phone, owner_name FROM franchises WHERE id = ?`)
            .bind(fid).first<{ name: string; address: string | null; phone: string | null; owner_name: string | null }>() as any;
        }

        const sets: string[] = [];
        const binds: any[] = [];
        let newName: string | undefined;
        if (has('name')) {
          newName = String(b.name || '').trim();
          if (!newName) return invalidBody(['name']);
          sets.push('name = ?'); binds.push(newName);
        }
        let newOwner: string | null | undefined;
        if (has('owner_name')) { newOwner = String(b.owner_name || '').trim() || null; sets.push('owner_name = ?'); binds.push(newOwner); }
        let newPhone: string | null | undefined;
        if (has('phone')) { newPhone = String(b.phone || '').trim() || null; sets.push('phone = ?'); binds.push(newPhone); }
        let newAddress: string | null | undefined;
        if (has('address')) { newAddress = String(b.address || '').trim() || null; sets.push('address = ?'); binds.push(newAddress); }
        if (has('opened_at')) { sets.push('opened_at = ?'); binds.push(String(b.opened_at || '').trim() || null); }
        // 🪪 (2026-09-15) 로그인 아이디 — 카페24 필드가 아니라 touchesCafe24Field/override 대상이 아니다.
        if (has('login_username')) { sets.push('login_username = ?'); binds.push(String(b.login_username || '').trim() || null); }
        // 🔑 (2026-09-17) 비밀번호만 바꾸는 요청(다른 칸은 하나도 안 보냄)도 유효한 요청이다 —
        // sets 가 비어도 no_fields 로 막지 않는다(아래에서 처리).
        const wantsPasswordAction = has('login_password') && String(b.login_password || '').length > 0;
        if (!sets.length && !wantsPasswordAction) return json({ ok: false, error: 'no_fields', message: '수정할 값이 없습니다.' }, 400);

        /* 🔑 이 지사에 로그인 계정(scope_type='branch')이 있으면 admin_scope.scope_value 가
           «옛 이름» 을 그대로 들고 있다 — scope.ts scopeFranchiseCond(branch) 는 그 값을
           «접두어(LIKE)» 로 지사 이름과 맞춘다. centers 판(agency, 정확일치)과 같은 이유로
           scope_value 는 옮기지 않는다 — students_erp.franchise 도 카페24가 독립적으로
           채우는 값이라(shop_name 과 같은 사정) 옮겨도 안 따라오고, 옮기면 그 계정이
           «자기 학생이 0명» 으로 보이는 사고가 된다. 옛 이름이 이 지사 하나뿐일 때만
           «이 계정이 이 지사 것» 이라고 확신할 수 있다(여럿이면 모호하니 건너뛴다). */
        let oldNameUnique = false;
        if (has('name') && before && before.name && before.name !== newName) {
          const dup = await env.DB.prepare(`SELECT COUNT(*) AS n FROM franchises WHERE name = ?`)
            .bind(before.name).first<{ n: number }>();
          oldNameUnique = Number(dup?.n || 0) <= 1;
        }
        let linkedAccount: { username: string } | null = null;
        if (before && newName !== undefined && before.name && before.name !== newName && oldNameUnique) {
          linkedAccount = await env.DB.prepare(
            `SELECT username FROM admin_scope WHERE scope_type = 'branch' AND scope_value = ? LIMIT 1`
          ).bind(before.name).first<{ username: string }>();
          // 🏢 지사본사(scope_type='franchise') 계정은 scope_value 가 콤마로 여러 지사 이름을
          //   담은 목록이라 위 정확일치로는 안 잡힌다 — scope.ts scopeFranchiseCond('franchise')
          //   가 쓰는 것과 같은 콤마-경계 LIKE 로 「그 목록 안에 이 지사의 옛 이름이 있는가」를
          //   본다(부분일치 방지: 양쪽에 콤마를 붙여 «노원»이 «노원구지사»에 안 걸리게 한다).
          //   빠뜨리면 지사본사 계정이 경고 하나 없이 조용히 이 지사에 대한 가시성을 잃는다.
          if (!linkedAccount) {
            linkedAccount = await env.DB.prepare(
              `SELECT username FROM admin_scope WHERE scope_type = 'franchise' AND (',' || scope_value || ',') LIKE ('%,' || ? || ',%') LIMIT 1`
            ).bind(before.name).first<{ username: string }>();
          }
          if (linkedAccount) {
            const nameDup = await env.DB.prepare(`SELECT id FROM franchises WHERE name = ? AND id != ? LIMIT 1`)
              .bind(newName, fid).first<{ id: number }>();
            if (nameDup) {
              return json({ ok: false, error: 'duplicate_franchise_name',
                message: `이 지사에는 로그인 계정(${linkedAccount.username})이 연결돼 있는데, 새 이름 "${newName}"을(를) 쓰는 다른 지사가 이미 있습니다. 그대로 바꾸면 그 계정이 두 지사 자료를 함께 보게 됩니다 — 이름을 다르게 정하거나 계정을 먼저 정리하세요.` }, 409);
            }
          }
        }

        sets.push('updated_at = ?'); binds.push(Date.now());
        binds.push(fid);
        await env.DB.prepare(`UPDATE franchises SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();

        /* 🏢 카페24 야간 동기화(cafe24-sync.ts importCafe24Org)가 name·address·phone·owner_name 을
           «카페24가 정본» 이라 매일 밤 03:00 KST 에 덮어쓴다(UPSERT). 사람이 방금 고친 칸을
           정정표에도 함께 적어야 그날 밤 이후에도 지켜진다 — «값이 실제로 달라진 칸만» 적는다
           (매번 다 적으면 안 바뀐 칸까지 못 박혀서, 나중에 카페24 쪽 정당한 변경이 영영 안
           먹는 반대쪽 사고가 난다). opened_at 은 카페24가 안 건드리는 칸이라 대상이 아니다. */
        if (before) {
          const changedName = newName !== undefined && newName !== (before.name || '');
          const changedAddr = newAddress !== undefined && newAddress !== (before.address || null);
          const changedPhone = newPhone !== undefined && newPhone !== (before.phone || null);
          const changedOwner = newOwner !== undefined && newOwner !== (before.owner_name || null);
          if (changedName || changedAddr || changedPhone || changedOwner) {
            await ensureFranchiseOverrideTable(env);
            await env.DB.prepare(
              `INSERT INTO franchise_manual_override (franchise_id, name, address, phone, owner_name, updated_at) VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(franchise_id) DO UPDATE SET
                 name = CASE WHEN ? THEN excluded.name ELSE franchise_manual_override.name END,
                 address = CASE WHEN ? THEN excluded.address ELSE franchise_manual_override.address END,
                 phone = CASE WHEN ? THEN excluded.phone ELSE franchise_manual_override.phone END,
                 owner_name = CASE WHEN ? THEN excluded.owner_name ELSE franchise_manual_override.owner_name END,
                 updated_at = excluded.updated_at`
            ).bind(
              fid,
              changedName ? newName : null,
              changedAddr ? newAddress : null,
              changedPhone ? newPhone : null,
              changedOwner ? newOwner : null,
              Date.now(),
              changedName ? 1 : 0, changedAddr ? 1 : 0, changedPhone ? 1 : 0, changedOwner ? 1 : 0
            ).run();
          }
        }

        /* 🔑 (2026-09-17) 비밀번호 처리는 다른 칸을 전부 저장한 «뒤» 에 한다 — login_username
           을 이 요청에서 같이 바꿨으면 그 새 아이디로, 이름을 같이 바꿨으면 그 새 이름으로
           계정을 만들거나 비밀번호를 재설정한다. */
        let passwordResult: 'created' | 'reset' | undefined;
        if (wantsPasswordAction) {
          let effectiveUsername = has('login_username') ? String(b.login_username || '').trim() : '';
          let effectiveName = newName !== undefined ? newName : (before ? before.name : '');
          if (!effectiveUsername || !effectiveName) {
            const cur = await env.DB.prepare(`SELECT login_username, name FROM franchises WHERE id = ?`)
              .bind(fid).first<{ login_username: string | null; name: string }>();
            if (!effectiveUsername) effectiveUsername = String(cur?.login_username || '').trim();
            if (!effectiveName) effectiveName = cur?.name || '';
          }
          if (!effectiveUsername) {
            return json({ ok: false, error: 'login_username_required',
              message: '비밀번호를 설정하려면 로그인 아이디를 먼저 입력하세요.' }, 400);
          }
          const pr = await createOrResetBranchLogin(effectiveUsername, String(b.login_password), effectiveName);
          if (!pr.ok) return json({ ok: false, error: pr.error, message: pr.message }, pr.status as any);
          passwordResult = pr.result;
        }

        return json({
          ok: true, id: fid,
          // ⚠️ 화면이 이 값을 보고 「그 계정은 여전히 옛 이름 기준으로 학생을 찾습니다」를
          // 사람에게 알린다 — 서버가 자동으로 옮기지 않기로 한 것과 짝이다(centers 와 같은 이유).
          login_account_note: linkedAccount ? { username: linkedAccount.username, old_name: before?.name } : undefined,
          password_result: passwordResult,
        });
      }

      const b = await parseJsonBody(request);
      const now = Date.now();

      // 🏛️ 대표지사 등록
      if (b && b.kind === 'master') {
        if (!b.name) return invalidBody(['name']);
        await ensureMaster();
        const newMasterLoginUsername = String(b.login_username || '').trim();
        const newMasterLoginPassword = String(b.login_password || '');
        // 🔑 (2026-09-17) 지사·대리점 등록과 같은 규칙 — 아이디·비밀번호는 «둘 다» 채웠을 때만
        // 계정을 만든다. 하나만 채우면 등록 자체를 막는다(대표지사만 생기고 로그인은 안 되는
        // 반쪽 상태를 피한다).
        if ((newMasterLoginUsername && !newMasterLoginPassword) || (!newMasterLoginUsername && newMasterLoginPassword)) {
          return json({ ok: false, error: 'login_fields_incomplete',
            message: '로그인 아이디와 비밀번호를 함께 입력하세요.' }, 400);
        }
        const r = await env.DB.prepare(
          `INSERT INTO master_branches (name, region, tier, owner_name, phone, login_username, division, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(String(b.name).trim(), b.region || null, b.tier || null, b.owner_name || null, b.phone || null,
               newMasterLoginUsername || null, String(b.division || '').trim() || null, now, now).run();
        const newMasterId = Number(r.meta.last_row_id);
        let masterLoginResult: 'created' | 'reset' | undefined;
        if (newMasterLoginUsername && newMasterLoginPassword) {
          const pr = await createOrResetMasterLogin(newMasterLoginUsername, newMasterLoginPassword, newMasterId, String(b.name).trim());
          // ⚠️ 지사·대리점과 같은 판단 — 등록 자체는 막지 않는다(방금 만든 대표지사가 그대로
          // 사라지면 더 나쁘다). 계정만 못 만들었다고 사람에게 알린다.
          if (pr.ok) masterLoginResult = pr.result;
          else return json({ ok: true, id: newMasterId, login_error: pr.error, login_message: pr.message });
        }
        return json({ ok: true, id: newMasterId, password_result: masterLoginResult });
      }
      // 🏛️ 지사 → 대표지사 배정 (master_id 가 비면 배정 해제)
      if (b && b.kind === 'master_assign') {
        const fid = parseInt(String(b.franchise_id || ''), 10);
        if (!fid) return invalidBody(['franchise_id']);
        await ensureMaster();
        const mid = parseInt(String(b.master_id || ''), 10);
        // 🔑 (2026-09-17) 이 배정이 바뀌기 «전» 의 대표지사를 먼저 알아 둔다 — 배정을 바꾼 뒤에
        // 옛 대표지사·새 대표지사 양쪽에 로그인 계정이 있으면 scope_value(산하 지사 목록)를
        // 다시 계산해 준다. 빠뜨리면 지사를 빼도 그 대표지사 계정이 계속 그 지사 학생을 본다
        // (막았어야 할 접근이 조용히 남는 쪽 — CLAUDE.md 가 가장 나쁘다고 못 박은 방향).
        const oldRow = await env.DB.prepare(`SELECT master_id FROM franchise_master_map WHERE franchise_id = ?`)
          .bind(fid).first<{ master_id: number }>();
        const oldMasterId = Number(oldRow?.master_id || 0);
        if (mid) {
          await env.DB.prepare(
            `INSERT INTO franchise_master_map (franchise_id, master_id, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(franchise_id) DO UPDATE SET master_id = excluded.master_id, updated_at = excluded.updated_at`
          ).bind(fid, mid, now).run();
        } else {
          await env.DB.prepare(`DELETE FROM franchise_master_map WHERE franchise_id = ?`).bind(fid).run();
        }
        if (oldMasterId && oldMasterId !== mid) await refreshMasterScopeValue(oldMasterId);
        if (mid) await refreshMasterScopeValue(mid);
        return json({ ok: true, franchise_id: fid, master_id: mid || null });
      }
      // 🏛️ 대표지사 «비활성» — 지우지 않는다. 산하 지사 매핑이 통째로 끊기면 되돌릴 길이 없다.
      if (b && b.kind === 'master_active') {
        const mid = parseInt(String(b.id || ''), 10);
        if (!mid) return invalidBody(['id']);
        await ensureMaster();
        await env.DB.prepare(`UPDATE master_branches SET active = ?, updated_at = ? WHERE id = ?`)
          .bind(b.active ? 1 : 0, now, mid).run();
        return json({ ok: true, id: mid, active: b.active ? 1 : 0 });
      }
      /* ✏️ 대표지사 수정 (2026-09-11 신설 — 사장님 제보 「대표지사도 수정하는 버튼이 없다」)
         master_branches 는 카페24에 없는 «우리만의 표» 다(위 9325행 주석) — franchises·centers
         와 달리 매일 밤 동기화가 덮어쓰지 않으므로, 그 둘에 쓴 override 표(franchise_manual_override
         등) 짝이 여기엔 필요 없다. 그냥 UPDATE 하면 그대로 남는다.
         🔑 (2026-09-17 갱신) 위 «admin_scope 와 아무것도 안 엮인다」 는 더 이상 사실이 아니다 —
         비밀번호를 설정하면 admin_scope(scope_type='franchise', master_id=이 행) 로 실제로 엮인다
         (위 ensureMaster·createOrResetMasterLogin 주석 참고). 다만 이름이 바뀌어도 그 연결은 안
         끊긴다 — scope_value 는 지사 «이름 목록» 이 아니라 master_id 로 다시 찾으므로 지사·대리점
         PATCH 의 「이름 바뀌면 연결된 계정이 조용히 못 찾게 된다」 걱정은 여기 없다. */
      if (b && b.kind === 'master_edit') {
        const mid = parseInt(String(b.id || ''), 10);
        if (!mid) return invalidBody(['id']);
        await ensureMaster();
        const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
        const sets: string[] = [];
        const binds: any[] = [];
        let editedName: string | undefined;
        if (has('name')) {
          const nm = String(b.name || '').trim();
          if (!nm) return invalidBody(['name']);
          editedName = nm;
          sets.push('name = ?'); binds.push(nm);
        }
        if (has('region')) { sets.push('region = ?'); binds.push(String(b.region || '').trim() || null); }
        if (has('tier')) { sets.push('tier = ?'); binds.push(String(b.tier || '').trim() || null); }
        if (has('owner_name')) { sets.push('owner_name = ?'); binds.push(String(b.owner_name || '').trim() || null); }
        if (has('phone')) { sets.push('phone = ?'); binds.push(String(b.phone || '').trim() || null); }
        if (has('login_username')) { sets.push('login_username = ?'); binds.push(String(b.login_username || '').trim() || null); }
        if (has('division')) { sets.push('division = ?'); binds.push(String(b.division || '').trim() || null); }
        // 🔑 (2026-09-17) 비밀번호만 바꾸는 요청(다른 칸은 하나도 안 보냄)도 유효한 요청이다 —
        // sets 가 비어도 no_fields 로 막지 않는다(지사 PATCH 와 같은 규칙, 아래에서 처리).
        const wantsMasterPasswordAction = has('login_password') && String(b.login_password || '').length > 0;
        if (!sets.length && !wantsMasterPasswordAction) return json({ ok: false, error: 'no_fields', message: '수정할 값이 없습니다.' }, 400);
        if (sets.length) {
          sets.push('updated_at = ?'); binds.push(now);
          binds.push(mid);
          await env.DB.prepare(`UPDATE master_branches SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
        }

        let masterPasswordResult: 'created' | 'reset' | undefined;
        if (wantsMasterPasswordAction) {
          let effectiveMasterUsername = has('login_username') ? String(b.login_username || '').trim() : '';
          let effectiveMasterName = editedName;
          if (!effectiveMasterUsername || effectiveMasterName === undefined) {
            const cur = await env.DB.prepare(`SELECT login_username, name FROM master_branches WHERE id = ?`)
              .bind(mid).first<{ login_username: string | null; name: string }>();
            if (!effectiveMasterUsername) effectiveMasterUsername = String(cur?.login_username || '').trim();
            if (effectiveMasterName === undefined) effectiveMasterName = cur?.name || '';
          }
          if (!effectiveMasterUsername) {
            return json({ ok: false, error: 'login_username_required',
              message: '비밀번호를 설정하려면 로그인 아이디를 먼저 입력하세요.' }, 400);
          }
          const pr = await createOrResetMasterLogin(effectiveMasterUsername, String(b.login_password), mid, effectiveMasterName);
          if (!pr.ok) return json({ ok: false, error: pr.error, message: pr.message }, pr.status as any);
          masterPasswordResult = pr.result;
        }
        return json({ ok: true, id: mid, password_result: masterPasswordResult });
      }

      if (!b || !b.name) return invalidBody(['name']);
      const newLoginUsername = String(b.login_username || '').trim();
      const newLoginPassword = String(b.login_password || '');
      // 🔑 (2026-09-17) 신규 지사 등록과 함께 로그인 계정도 만든다 — 대리점(centers) POST 와
      // 같은 규칙: 아이디·비밀번호를 «둘 다» 채웠을 때만 만든다. 하나만 채우면 등록 자체를
      // 막는다(지사만 만들어지고 로그인은 없는 반쪽 상태를 피한다 — CLAUDE.md 「직원을
      // 등록했는데 로그인이 안 돼요」와 같은 뿌리).
      if ((newLoginUsername && !newLoginPassword) || (!newLoginUsername && newLoginPassword)) {
        return json({ ok: false, error: 'login_fields_incomplete',
          message: '로그인 아이디와 비밀번호를 함께 입력하세요.' }, 400);
      }
      const r = await env.DB.prepare(
        `INSERT INTO franchises (name, address, phone, owner_name, opened_at, notes, login_username, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(b.name, b.address || null, b.phone || null, b.owner_name || null, b.opened_at || null, b.notes || null,
             newLoginUsername || null, now, now).run();
      let loginResult: 'created' | 'reset' | undefined;
      if (newLoginUsername && newLoginPassword) {
        const pr = await createOrResetBranchLogin(newLoginUsername, newLoginPassword, String(b.name));
        // ⚠️ 대리점(centers)과 같은 판단 — 등록 자체는 막지 않는다(방금 만든 지사가 그대로
        // 사라지면 더 나쁘다). 계정만 못 만들었다고 사람에게 알린다.
        if (pr.ok) loginResult = pr.result;
        else return json({ ok: true, id: r.meta.last_row_id, login_error: pr.error, login_message: pr.message });
      }
      return json({ ok: true, id: r.meta.last_row_id, password_result: loginResult });
    }

    /* ─── 🏯 본사 관리 (2026-08-18 수정요청 #13) ─────────────────────────────────
       조직 순서는 🏯 본사 › 🏢 지사 › 🏪 대리점(학원) 인데, 맨 위 «본사» 한 칸만
       화면(껍데기)만 있고 표를 채우는 코드가 저장소에 0곳이라 늘 «데이터 없음» 이었다.
       → hq_orgs 표 + 목록·검색·등록·수정·삭제를 여기서 실제로 붙인다.

       ⚠️ 경로를 «/api/admin/org/hq» 로 잡은 것은 우연이 아니다.
          index.ts 의 TEACHER_BLOCKED_PREFIXES 에 이미 '/api/admin/org' 가 있어서
          **강사에게는 자동으로 닫힌다.** 사업자등록번호·대표이사 같은 법인정보라
          열려 있는 다른 접두사(예: /api/admin/stats/) 밑에 얹으면 강사에게 그대로 열린다.

       ℹ️ 첫 조회 때 표가 비어 있으면 운영 사이트 «회사 정보» 푸터의 값을 한 번만 심는다
          (src/hq-profile.ts). 그 뒤로는 D1 이 정본이라 화면에서 고친 값을 덮어쓰지 않는다. */
    if (path === '/api/admin/org/hq' &&
        (method === 'GET' || method === 'POST' || method === 'PATCH' || method === 'DELETE')) {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS hq_orgs (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ceo_name TEXT, business_no TEXT, address TEXT, phone TEXT, email TEXT, ecommerce_no TEXT, privacy_officer TEXT, memo TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);

      const HQ_FIELDS = ['name', 'ceo_name', 'business_no', 'address', 'phone', 'email', 'ecommerce_no', 'privacy_officer', 'memo'] as const;
      const _hqStr = (v: any): string | null => {
        const s = (v == null ? '' : String(v)).trim();
        return s ? s.slice(0, 200) : null;     // 화면 입력이 정본이라 길이만 자른다
      };

      if (method === 'GET') {
        /* 🌱 이관 — «비어 있을 때만» 한 번. COUNT 로 먼저 확인하므로 두 번 심지 않는다.
              (사장님 요청: 「기존 홈페이지에 등록된 것처럼 본사 정보를 등록해 줘」) */
        const n0: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM hq_orgs`).first();
        if (Number(n0?.n || 0) === 0) {
          const now0 = Date.now();
          await env.DB.prepare(
            `INSERT INTO hq_orgs (name, ceo_name, business_no, address, phone, email, ecommerce_no, privacy_officer, memo, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            HQ_PROFILE.name, HQ_PROFILE.ceo_name, HQ_PROFILE.business_no, HQ_PROFILE.address,
            HQ_PROFILE.phone, HQ_PROFILE.email, HQ_PROFILE.ecommerce_no, HQ_PROFILE.privacy_officer,
            HQ_PROFILE.memo, now0, now0
          ).run();
        }
        // 🔎 검색 — 이름·대표이사·전화·주소·사업자번호. 건수가 적어(본사) 페이징은 두지 않는다.
        const q = (url.searchParams.get('q') || '').trim();
        let rs;
        if (q) {
          const like = `%${q}%`;
          rs = await env.DB.prepare(
            `SELECT * FROM hq_orgs
              WHERE name LIKE ? OR ceo_name LIKE ? OR phone LIKE ? OR address LIKE ? OR business_no LIKE ?
              ORDER BY active DESC, id ASC`
          ).bind(like, like, like, like, like).all();
        } else {
          rs = await env.DB.prepare(`SELECT * FROM hq_orgs ORDER BY active DESC, id ASC`).all();
        }
        const items = rs.results || [];
        const tot: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM hq_orgs`).first();
        return json({ ok: true, items, count: items.length, total: Number(tot?.n || 0), q });
      }

      if (method === 'POST') {
        const b = await parseJsonBody(request);
        if (!b || !_hqStr(b.name)) return invalidBody(['name']);
        const now = Date.now();
        const vals = HQ_FIELDS.map(f => _hqStr((b as any)[f]));
        const r = await env.DB.prepare(
          `INSERT INTO hq_orgs (${HQ_FIELDS.join(', ')}, created_at, updated_at)
           VALUES (${HQ_FIELDS.map(() => '?').join(', ')}, ?, ?)`
        ).bind(...vals, now, now).run();
        return json({ ok: true, id: r.meta.last_row_id });
      }

      if (method === 'PATCH') {
        const b = await parseJsonBody(request);
        const hid = parseInt(String((b as any)?.id || ''), 10);
        if (!hid) return invalidBody(['id']);
        if (!_hqStr((b as any)?.name)) return invalidBody(['name']);
        const now = Date.now();
        const vals = HQ_FIELDS.map(f => _hqStr((b as any)[f]));
        await env.DB.prepare(
          `UPDATE hq_orgs SET ${HQ_FIELDS.map(f => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`
        ).bind(...vals, now, hid).run();
        return json({ ok: true, id: hid });
      }

      /* DELETE — ?id= . 실제 행을 지운다(본사는 몇 건 안 되고, 잘못 등록한 것을 못 지우면
         화면에 영원히 남는다). 화면 쪽에서 «두 번 눌러야 확인창» 으로 한 번 더 막는다. */
      const delId = parseInt(url.searchParams.get('id') || '', 10);
      if (!delId) return invalidBody(['id']);
      await env.DB.prepare(`DELETE FROM hq_orgs WHERE id = ?`).bind(delId).run();
      return json({ ok: true, id: delId, deleted: true });
    }

    // ─── 대리점·학원 (테이블명은 centers 지만 실제 내용은 «대리점/학원» 921건) ──────
    //   🔎 실측(2026-08-08): 921건 중 744건이 students_erp.shop_name 과 글자 그대로 일치.
    //      «교육센터»(=필리핀 직영 센터, 홈페이지 문구)와는 전혀 다른 것이다.
    //   🐢 예전엔 921건을 «한 번에 전부» 돌려줬고(약 130KB), 그걸 부팅 때 두 번 받았다.
    //      → 기본 50건 + 검색(q) + total. limit=0 이면 전체(하위호환·CSV 용).
    if ((method === 'GET' || method === 'POST' || method === 'PATCH') && path === '/api/admin/centers') {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS centers (id INTEGER PRIMARY KEY AUTOINCREMENT, franchise_id INTEGER, name TEXT NOT NULL, country TEXT, address TEXT, manager TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      // 💳 (2026-08-12 수정요청 #05) 대리점별 결제 유형(B2B/B2C) — 멱등 ALTER.
      //    CREATE 에 넣지 않는 이유: schema_drift 하니스가 «운영 실제에 없는 CREATE 컬럼» 을 막는다.
      //    NULL = 미지정. #03 의 B2B/B2C 결제 리스트 분리가 이 값을 필터 기준으로 쓴다.
      try { await env.DB.exec(`ALTER TABLE centers ADD COLUMN payment_type TEXT`); } catch {}
      // 📞 (2026-09-11) 대리점 연락처 — 카페24 :Center 에는 없는 칸이라(Cypher 에 phone 이 없다)
      //    매일 밤 UPSERT 가 이 값을 «안 건드린다». payment_type 과 같은 이유로 멱등 ALTER.
      try { await env.DB.exec(`ALTER TABLE centers ADD COLUMN phone TEXT`); } catch {}
      /* 💰 (2026-08-22) 아래 목록이 대리점별 수강료를 함께 내려준다. 그 표가 없는
         환경에서 조인이 실패하면 **대리점 목록이 통째로 안 뜬다** — 표를 먼저 보장한다.
         DDL 정본은 org-settlement.ts 한 곳이다(복사하지 말 것). */
      await ensureRateOverrideTable(env);
      const _normPayType = (v: any): string | null => {
        const s = String(v || '').trim().toUpperCase();
        return s === 'B2B' || s === 'B2C' ? s : null;
      };

      /* 🔒 (2026-08-18) 지사·대리점 계정에게 이 API 를 열면서 «자기 것만» 으로 자른다.
         지사 = 자기 지사 소속 대리점 전부, 대리점(학원) = 자기 한 칸.
         index.ts 의 isAgencyAllowedApi 가 이 경로를 열어 주는 근거가 **바로 이 조건절**이다.
         이 줄을 지우면 전국 대리점 921건이 모든 지사장·학원장에게 통째로 나간다. */
      const _cSc = await getScope(env as any, request);
      const _cCond = scopeCenterCond(_cSc, 'c');

      // ✍️ 등록(POST)·결제유형 수정(PATCH)은 본사만. 화면에서 폼을 감추는 것만으로는 URL 로 뚫린다.
      if ((method === 'POST' || method === 'PATCH') && !canEditOrg(_cSc)) {
        return json({ ok: false, error: 'forbidden_scope', scope: _cSc.type, message: '대리점 정보 수정은 본사만 할 수 있습니다.' }, 403);
      }

      /* 🔑 (2026-10-28 사장님 「대리점 아이디와 정보를 넣어 달라」) 대리점 로그인 계정 — 등록(POST)·
         ✏️ 수정(PATCH) 공용. 카페24에서 온 921곳은 등록 폼을 거치지 않아 계정을 붙일 자리가 없었다
         (목록이 전부 «계정 없음»). 지사 판 createOrResetBranchLogin 을 본뜬 «대리점 판» 이다.
         ⚠️ «검사(check)» 와 «쓰기(apply)» 를 나눈다 — 검사는 대리점 저장 «전» 에 해야
            계정이 거절됐는데 대리점만 저장되는 반쪽 상태가 안 생긴다.
         ⚠️ scope_value 는 centers.name 그대로(scopeCenterCond 가 이름 정확일치로 가른다).
         ⛔ 같은 이름 대리점이 또 있으면 «새로 만들기» 는 막는다 — 그 계정이 남의 자료까지 본다.
         🔑 «비밀번호 바꾸기(reset)» 는 그 아이디가 **이 대리점의 «저장 전» 이름(curName)** 에 붙어 있고
            그 이름을 쓰는 대리점이 **이것 하나뿐** 일 때만. ⛔ «바꾸려는 새 이름» 으로 주인을 판정하면
            A 를 B 의 이름으로 바꾸면서 B 의 아이디를 넣는 저장 한 번에 B 계정 비밀번호가 바뀐다
            (2026-10-28 함정 대조가 재현 — 그래서 새 이름은 주인 판정에 안 쓴다).
            이름이 겹치면 «어느 대리점 계정인지» 확정할 수 없어 바꾸지 않는다(지사 판과 같은 판단).
         ⚠️ 반환은 단순 객체(판별 유니온 금지 — strictNullChecks:false 라 좁혀지지 않는다). */
      type AgencyLoginCheck = { ok: boolean; mode?: 'create' | 'reset'; username?: string; error?: string; message?: string; status?: number };
      const checkAgencyLogin = async (username: string, password: string, centerName: string,
                                      selfId: number, curName: string): Promise<AgencyLoginCheck> => {
        const u = username.trim();
        if (!/^[a-zA-Z0-9_]{3,32}$/.test(u)) {
          return { ok: false, error: 'bad_username', message: '아이디는 영문·숫자·밑줄(_)로 3~32자여야 합니다.', status: 400 };
        }
        if (password.length < 6) {
          return { ok: false, error: 'too_short', message: '비밀번호는 6자 이상이어야 합니다.', status: 400 };
        }
        if (FULL_ACCESS_ACCOUNTS.has(u.toLowerCase())) {
          return { ok: false, error: 'reserved_username', message: '이 아이디는 시스템 전체권한 계정이라 쓸 수 없습니다.', status: 403 };
        }
        // NOCASE — 로그인이 대소문자를 무시하므로(staff-create 와 같은 규칙) 여기만 구분하면
        // Busan_Agency/busan_agency 두 벌이 생겨 «계정이 두 개» 사고가 재현된다.
        const existing = await env.DB.prepare(`SELECT username FROM admin_account WHERE username = ? COLLATE NOCASE LIMIT 1`)
          .bind(u).first<{ username: string }>();
        if (existing) {
          const sc = await env.DB.prepare(`SELECT scope_type, scope_value FROM admin_scope WHERE username = ? LIMIT 1`)
            .bind(existing.username).first<{ scope_type: string; scope_value: string | null }>();
          const isOwn = selfId > 0 && !!curName && !!sc && sc.scope_type === 'agency' && String(sc.scope_value || '') === curName;
          if (!isOwn) {
            return { ok: false, error: 'already_exists', message: '이미 있는 아이디입니다. 다른 아이디를 쓰세요.', status: 409 };
          }
          const shared = await env.DB.prepare(`SELECT COUNT(*) AS n FROM centers WHERE name = ?`).bind(curName).first<{ n: number }>();
          if (Number(shared?.n || 0) !== 1) {
            return { ok: false, error: 'shared_center_name',
              message: `같은 이름("${curName}")의 대리점이 여러 곳이라 이 계정이 어느 대리점 것인지 확정할 수 없어 비밀번호를 바꾸지 않았습니다. ` +
                       '대리점 이름을 구분되게 바꾼 뒤 다시 하거나 본사에 문의하세요.', status: 409 };
          }
          return { ok: true, mode: 'reset', username: existing.username };
        }
        // ⚠️ centers.name 은 유일하지 않다(CLAUDE.md 「가맹점 정산에서 특정 지사 매출이 통째로
        //    안 잡힘」과 같은 뿌리). 이름이 같은 다른 대리점이 있으면 이 로그인이 그 자료까지 본다.
        const nameDup = await env.DB.prepare(`SELECT id FROM centers WHERE name = ? AND id != ? LIMIT 1`)
          .bind(centerName, selfId).first<{ id: number }>();
        if (nameDup) {
          return { ok: false, error: 'duplicate_center_name',
            message: '이미 같은 이름의 대리점이 있어 로그인 계정을 만들 수 없습니다 — 이름으로 접근 범위를 가르기 때문에 ' +
                     '다른 대리점 자료가 섞여 보일 수 있습니다. 대리점 이름을 구분되게 바꾸거나, ' +
                     '로그인 계정 없이 먼저 등록한 뒤 본사에 문의하세요.', status: 409 };
        }
        return { ok: true, mode: 'create', username: u };
      };
      /* 쓰기. ⚠️ 만들기는 계정·범위 두 줄을 **batch(한 묶음)** 로 — 계정만 남고 범위가 빠지면 다음 요청에서
         autoSeedOne 이 이름으로 범위를 짐작해 «none»(=직원) 이 될 수 있다(CLAUDE.md 「관리자 계정을 지웠는데
         권한은 오히려 올라감」과 같은 모양). 바꾸기는 기존 «남의 비밀번호 재설정»(auth-admin.ts) 과 같이
         그 계정의 세션을 전부 끊고 «누가 바꿨는지» 를 로그인 이력에 남긴다. */
      const applyAgencyLogin = async (chk: AgencyLoginCheck, password: string, centerName: string,
                                      audit: { by: string; ip: string; ua: string }): Promise<'created' | 'reset'> => {
        const now = Date.now();
        const hash = await hashPassword(password);
        if (chk.mode === 'reset') {
          await env.DB.prepare(`UPDATE admin_account SET password_hash = ?, updated_at = ? WHERE username = ?`)
            .bind(hash, now, chk.username).run();
          await env.DB.prepare(`DELETE FROM admin_sessions WHERE username = ?`).bind(chk.username).run().catch(() => {});
          await recordLogin(env as any, chk.username, audit.ip, audit.ua, true, 'password_reset_by:' + audit.by).catch(() => {});
          return 'reset';
        }
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO admin_account (username, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
          ).bind(chk.username, hash, centerName, now, now),
          env.DB.prepare(
            `INSERT INTO admin_scope (username, scope_type, scope_value, updated_at) VALUES (?, 'agency', ?, ?)
             ON CONFLICT(username) DO UPDATE SET scope_type = excluded.scope_type, scope_value = excluded.scope_value, updated_at = excluded.updated_at`
          ).bind(chk.username, centerName, now),
        ]);
        return 'created';
      };
      /* 계정을 건드리는 요청이면 «누가» 를 먼저 확인한다 — 감사 기록에 쓰고, 강사는 여기서도 막는다
         (index.ts 의 강사 차단 목록 한 곳에만 기대지 않는다 — CLAUDE.md 2장 쓰기 경로 가드 권고).
         🔒 (2026-10-28 사장님 「본사 계정만 만들 수 있게 좁혀줘」) 판정 정본은 agency-login-gate.ts —
            admin_scope 를 «삼키지 않고» 한 번 더 읽어 'hq' 일 때만(못 읽으면 막는다). 거절 응답(deny)도 여기서 만든다. */
      type AgencyLoginActor = { ok: boolean; by: string; ip: string; ua: string; deny: Response | null };
      const agencyLoginActor = async (): Promise<AgencyLoginActor> => {
        const a = await getAdminActor(request, env as any);
        let row: { scope_type: string } | null | undefined = undefined;
        if (a.ok && !a.isTeacher && a.username) {
          try {
            row = (await env.DB.prepare(`SELECT scope_type FROM admin_scope WHERE username = ? LIMIT 1`)
              .bind(a.username).first<{ scope_type: string }>()) || null;
          } catch (e) {
            console.warn('[centers] agency login scope lookup failed', (e as any)?.message || e);
            row = undefined;
          }
        }
        const g = agencyLoginGate({ ok: !!a.ok, isTeacher: !!a.isTeacher, username: a.username || '' }, row, FULL_ACCESS_ACCOUNTS);
        const deny = g.ok ? null
          : g.error === 'forbidden_teacher' ? json(forbiddenTeacherBody(a, g.message), 403)
          : json({ ok: false, error: g.error, message: g.message }, g.status as any);
        return { ok: g.ok, by: a.username || '', ip: request.headers.get('cf-connecting-ip') || '',
                 ua: request.headers.get('user-agent') || '', deny };
      };

      if (method === 'PATCH') {
        /* ✏️ (2026-09-11 신설 — 사장님 제보 「대리점을 수정할 수 있는 메뉴가 없다」)
           대리점 이름·지사·국가·담당자·연락처·주소·결제유형을 한 번에 고치는 «부분 수정» —
           보낸 칸만 고치고 나머지는 그대로 둔다. 예전부터 있던 {id, payment_type} 만
           보내는 호출(표의 결제유형 드롭다운, ctSetPayType)도 그대로 동작해야 한다. */
        const b = await parseJsonBody(request);
        const cid = parseInt(String(b?.id || ''), 10);
        if (!cid) return invalidBody(['id']);
        const has = (k: string) => !!b && Object.prototype.hasOwnProperty.call(b, k);

        /* 🔑 name·address·manager·franchise_id 는 카페24가 매일 밤 덮어쓰는 칸이라(아래 참고),
           «실제로 바뀐 칸만» 정정표에 남겨야 한다. 그래서 UPDATE 전에 지금 값을 먼저 읽어 둔다.
           이 폼은 등록 폼을 그대로 재사용해 «매번 네 칸을 전부» 보내므로, 안 그러면 연락처
           하나만 고치려고 열었다가 이름·주소·담당자·지사가 전부 «지금 값에 못 박히는» 사고가 난다
           (되면 카페24가 나중에 정당하게 고쳐도 그 칸은 영영 안 먹는다). */
        const touchesCafe24Field = has('name') || has('address') || has('manager') || has('franchise_id');
        let before: { name: string; address: string | null; manager: string | null; franchise_id: number | null } | null = null;
        if (touchesCafe24Field) {
          before = await env.DB.prepare(`SELECT name, address, manager, franchise_id FROM centers WHERE id = ?`)
            .bind(cid).first<{ name: string; address: string | null; manager: string | null; franchise_id: number | null }>() as any;
        }

        const sets: string[] = [];
        const binds: any[] = [];
        let ptOut: string | null = null;
        if (has('payment_type')) { ptOut = _normPayType(b.payment_type); sets.push('payment_type = ?'); binds.push(ptOut); }

        let newName: string | undefined;
        if (has('name')) {
          newName = String(b.name || '').trim();
          if (!newName) return invalidBody(['name']);
          sets.push('name = ?'); binds.push(newName);
        }
        let newFid = 0;
        if (has('franchise_id')) {
          newFid = b.franchise_id ? parseInt(String(b.franchise_id), 10) : 0;
          sets.push('franchise_id = ?'); binds.push(newFid || null);
        }
        let newAddress: string | null | undefined;
        if (has('address')) { newAddress = String(b.address || '').trim() || null; sets.push('address = ?'); binds.push(newAddress); }
        let newManager: string | null | undefined;
        if (has('manager')) { newManager = String(b.manager || '').trim() || null; sets.push('manager = ?'); binds.push(newManager); }
        if (has('country')) { sets.push('country = ?'); binds.push(String(b.country || '').trim() || null); }
        if (has('phone'))   { sets.push('phone = ?');   binds.push(String(b.phone   || '').trim() || null); }

        /* 🔑 (2026-10-28) 로그인 계정 붙이기·비밀번호 바꾸기 — 비밀번호를 «넣었을 때만» 움직인다
           (지사 PATCH 와 같은 규칙: 비워 두면 «바꾸지 않음»). 수정 폼이 아이디 칸을 지금 계정으로
           미리 채우므로, 아이디만 있고 비밀번호가 비어 있으면 아무 일도 하지 않아야 한다.
           ⚠️ 검사는 UPDATE «전» — 거절되면 대리점 정보도 저장하지 않는다(반쪽 저장 금지). */
        const loginPw = String(b?.login_password || '');
        const loginId = String(b?.login_username || '').trim();
        let loginChk: AgencyLoginCheck | null = null;
        let loginName = '';
        let loginActor: AgencyLoginActor | null = null;
        if (loginPw) {
          if (!loginId) {
            return json({ ok: false, error: 'login_username_required',
              message: '비밀번호를 설정하려면 로그인 아이디를 먼저 입력하세요.' }, 400);
          }
          loginActor = await agencyLoginActor();
          if (!loginActor.ok) return loginActor.deny;
          const cur = before || await env.DB.prepare(`SELECT name FROM centers WHERE id = ?`).bind(cid).first<{ name: string }>();
          if (!cur) return json({ ok: false, error: 'not_found', message: '대리점을 찾을 수 없습니다.' }, 404);
          // 새 계정은 «저장 뒤» 이름으로 묶고(scope_value = centers.name), 비밀번호 바꾸기의 주인 판정은
          // «저장 전» 이름으로만 한다(checkAgencyLogin 주석 — 새 이름으로 판정하면 남의 계정이 걸린다).
          loginName = newName !== undefined ? newName : String(cur.name || '');
          loginChk = await checkAgencyLogin(loginId, loginPw, loginName, cid, String(cur.name || ''));
          if (!loginChk.ok) return json({ ok: false, error: loginChk.error, message: loginChk.message }, loginChk.status as any);
        }
        if (!sets.length && !loginChk) return json({ ok: false, error: 'no_fields', message: '수정할 값이 없습니다.' }, 400);

        /* 🔑 이 대리점에 로그인 계정이 있으면 admin_scope.scope_value 가 «옛 이름» 을 그대로
           들고 있다(scope.ts scopeCenterCond 는 id 가 아니라 이름으로 대리점을 가른다).
           ⚠️ centers.name 은 유일하지 않다(CLAUDE.md 「가맹점 정산에서 특정 지사 매출이
           통째로 안 잡힘」과 같은 뿌리) — 옛 이름을 가진 대리점이 이것 하나뿐일 때만
           «이 계정이 바로 이 대리점 것» 이라고 확신할 수 있다. 여럿이면 모호하니 아래
           검사·경고 둘 다 건너뛴다(모르면 손대지 않는 쪽이 안전하다). */
        let oldNameUnique = false;
        if (has('name') && before && before.name && before.name !== newName) {
          const dup = await env.DB.prepare(`SELECT COUNT(*) AS n FROM centers WHERE name = ?`)
            .bind(before.name).first<{ n: number }>();
          oldNameUnique = Number(dup?.n || 0) <= 1;
        }
        /* 🔑 scope_value 를 새 이름으로 «옮기지 않는다» — centers.name 은 이렇게 고칠 수 있지만
           students_erp.shop_name 은 카페24가 독립적으로 채우는 값이라(921건 중 744건만 이
           둘이 글자 그대로 일치 — 원래도 완전히 안 맞았다) 옮겨도 옛 이름 그대로 남는다.
           scopeStudentCond(agency) 는 «shop_name = scope_value» 로 그 계정의 학생을 찾으므로,
           옮기면 그 계정이 «자기 학생이 0명» 으로 보이는 확정적인 사고가 된다 — 안 옮기는
           쪽이 안전하다(옮겨도 어차피 카페24 쪽 학생 명부는 못 따라오니 «완전히 맞는» 선택은
           없고, 학생을 볼 수 없게 되는 쪽이 더 나쁘다). 대신 그런 계정이 있으면 ①같은 새
           이름을 쓰는 다른 대리점이 있을 때만 막고(POST 의 duplicate_center_name 방어와
           같은 이유 — 두 대리점이 같은 scope_value 를 공유하게 되는 것을 막는다)
           ②그 계정 아이디를 응답에 실어 화면이 사람에게 알리게 한다. */
        let linkedAccount: { username: string } | null = null;
        if (before && newName !== undefined && before.name && before.name !== newName && oldNameUnique) {
          linkedAccount = await env.DB.prepare(
            `SELECT username FROM admin_scope WHERE scope_type = 'agency' AND scope_value = ? LIMIT 1`
          ).bind(before.name).first<{ username: string }>();
          if (linkedAccount) {
            const nameDup = await env.DB.prepare(`SELECT id FROM centers WHERE name = ? AND id != ? LIMIT 1`)
              .bind(newName, cid).first<{ id: number }>();
            if (nameDup) {
              return json({ ok: false, error: 'duplicate_center_name',
                message: `이 대리점에는 로그인 계정(${linkedAccount.username})이 연결돼 있는데, 새 이름 "${newName}"을(를) 쓰는 다른 대리점이 이미 있습니다. 그대로 바꾸면 그 계정이 두 대리점 자료를 함께 보게 됩니다 — 이름을 다르게 정하거나 계정을 먼저 정리하세요.` }, 409);
            }
          }
        }

        sets.push('updated_at = ?'); binds.push(Date.now());
        binds.push(cid);
        await env.DB.prepare(`UPDATE centers SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();

        /* 🏢 카페24 야간 동기화(cafe24-sync.ts importCafe24Org)가 name·address·manager·
           franchise_id 를 «카페24가 정본» 이라 매일 밤 03:00 KST 에 덮어쓴다(UPSERT). 사람이
           방금 고친 칸을 정정표에도 함께 적어야 그날 밤 이후에도 지켜진다 — 안 적으면
           CLAUDE.md 「학생 이름을 D1 에서 고쳤는데 다음날 원복됨」과 같은 사고가 centers 판으로
           그대로 재현된다. payment_type·phone·country 는 카페24가 안 건드리는 칸이라 대상이 아니다.
           ⚠️ «값이 실제로 달라진 칸만» 적는다 — 매번 다 적으면 안 바뀐 칸까지 못 박혀서,
           나중에 카페24 쪽 정당한 변경이 영영 안 먹는 반대쪽 사고가 난다. */
        if (before) {
          const changedName = newName !== undefined && newName !== (before.name || '');
          const changedAddr = newAddress !== undefined && newAddress !== (before.address || null);
          const changedMgr  = newManager !== undefined && newManager !== (before.manager || null);
          if (changedName || changedAddr || changedMgr) {
            await ensureCenterOverrideTables(env);
            await env.DB.prepare(
              `INSERT INTO center_manual_override (center_id, name, address, manager, updated_at) VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(center_id) DO UPDATE SET
                 name = CASE WHEN ? THEN excluded.name ELSE center_manual_override.name END,
                 address = CASE WHEN ? THEN excluded.address ELSE center_manual_override.address END,
                 manager = CASE WHEN ? THEN excluded.manager ELSE center_manual_override.manager END,
                 updated_at = excluded.updated_at`
            ).bind(
              cid,
              changedName ? newName : null,
              changedAddr ? newAddress : null,
              changedMgr ? newManager : null,
              Date.now(),
              changedName ? 1 : 0, changedAddr ? 1 : 0, changedMgr ? 1 : 0
            ).run();
          }
          const oldFid = before.franchise_id || 0;
          if (has('franchise_id') && newFid !== oldFid) {
            await ensureCenterOverrideTables(env);
            if (newFid) {
              await env.DB.prepare(
                `INSERT INTO center_franchise_override (center_id, franchise_id, prev_franchise_id, reason, updated_at) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(center_id) DO UPDATE SET franchise_id = excluded.franchise_id, prev_franchise_id = excluded.prev_franchise_id, updated_at = excluded.updated_at`
              ).bind(cid, newFid, oldFid || null, '관리자 화면 수정', Date.now()).run();
            } else {
              // 지사를 «미지정» 으로 되돌리면 정정표에서도 지운다 — franchise_id 는 NOT NULL 이라
              // 0/NULL 을 못 박아 둘 수 없고, 남겨 두면 다음 카페24 동기화가 지운 지사를 다시 심는다.
              await env.DB.prepare(`DELETE FROM center_franchise_override WHERE center_id = ?`).bind(cid).run();
            }
          }
        }

        // 🔑 대리점 정보가 저장된 «뒤» 에 계정을 쓴다(검사는 위에서 이미 통과).
        const loginResult = loginChk ? await applyAgencyLogin(loginChk, loginPw, loginName, loginActor) : undefined;

        return json({
          ok: true, id: cid, payment_type: ptOut, login_result: loginResult,
          // ⚠️ 화면(saveCenter)이 이 값을 보고 「그 계정은 여전히 옛 이름 기준으로 학생을
          // 찾습니다」를 사람에게 알린다 — 서버가 자동으로 옮기지 않기로 한 것과 짝이다.
          login_account_note: linkedAccount ? { username: linkedAccount.username, old_name: before?.name } : undefined,
        });
      }
      /* 🔎 (2026-10-26 사장님 「카페24에서 학생 아이디 가져오듯 대리점 아이디도 가져와야」)
         옛 LMS 화면은 대리점마다 «아이디»(엘리더잼영어 = ysyt00)를 보여 주는데, 야간 동기화의
         :Center Cypher 는 id·branch_id·name·address·manager·active 여섯 칸뿐이다. 그 값이
         :Center 의 어느 속성에 있는지, 아니면 이어진 다른 노드에 있는지 **추측으로 박기 전에**
         실제 그래프를 읽어 보여 준다(지사 debug=cafe24_props 와 같은 방식).
           ?debug=cafe24_props            → :Center 전체 속성 이름 + 예시 3건
           ?debug=cafe24_props&name=엘리더잼 → 그 이름을 담은 :Center 의 속성 + 이어진 노드
           ?debug=cafe24_props&find=ysyt00  → 그래프 전체에서 그 값을 «그대로» 가진 노드·속성
         ⛔ 이 결과로 곧바로 centers 를 UPDATE 하지 않는다 — 칸을 확인한 뒤 동기화에 넣는다.
         본사만(원본 그래프의 날 것 그대로). */
      if (method === 'GET' && url.searchParams.get('debug') === 'cafe24_props') {
        if (!canEditOrg(_cSc)) return json({ ok: false, error: 'forbidden_scope' }, 403);
        // canEditOrg 는 'none'(교사)에도 true 다 — 원본 그래프(연락처 등)를 강사에게 열지 않는다.
        const _dbgActor = await getAdminActor(request, env as any);
        if (!_dbgActor.ok) return json({ ok: false, error: 'unauthorized' }, 401);
        if (_dbgActor.isTeacher) return json(forbiddenTeacherBody(_dbgActor), 403);
        try {
          const nm = (url.searchParams.get('name') || '').trim();
          const fv = (url.searchParams.get('find') || '').trim();
          const pick = (rs: any, k: string) => rs.fields.indexOf(k);
          const out: any = { ok: true };
          const all = await runCypher(env, `MATCH (c:Center) RETURN properties(c) AS props`, {}, 'READ');
          const ki = pick(all, 'props');
          const keySet = new Set<string>(); const sample: any[] = [];
          for (const row of all.values) {
            const pr = row[ki] as Record<string, any> | null;
            if (pr) Object.keys(pr).forEach(k => keySet.add(k));
            if (pr && sample.length < 3) sample.push(pr);
          }
          out.center_count = all.values.length;
          out.all_property_keys = Array.from(keySet).sort();
          out.sample_rows = sample;
          if (nm) {
            const rs = await runCypher(env, `
              MATCH (c:Center) WHERE c.name CONTAINS $nm
              OPTIONAL MATCH (c)-[rel]-(x)
              RETURN properties(c) AS center_props,
                     collect(DISTINCT {rel_type: type(rel), other_labels: labels(x), other_props: properties(x)})[0..20] AS linked
              LIMIT 5`, { nm }, 'READ');
            out.by_name = rs.values.map((row: any[]) => ({
              center_props: row[pick(rs, 'center_props')],
              linked_nodes: (row[pick(rs, 'linked')] || []).filter((l: any) => l && l.rel_type),
            }));
          }
          if (fv) {
            if (!/^[A-Za-z0-9_.@-]{3,64}$/.test(fv)) return json({ ok: false, error: 'bad_find' }, 400);
            const rs = await runCypher(env, `
              MATCH (n) WHERE any(k IN keys(n) WHERE toString(n[k]) = $v)
              RETURN labels(n) AS labels, [k IN keys(n) WHERE toString(n[k]) = $v] AS matched_keys, properties(n) AS props
              LIMIT 10`, { v: fv }, 'READ');
            out.find = rs.values.map((row: any[]) => ({
              labels: row[pick(rs, 'labels')], matched_keys: row[pick(rs, 'matched_keys')], props: row[pick(rs, 'props')],
            }));
          }
          return json(out);
        } catch (e: any) {
          if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
          return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
        }
      }
      if (method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim();
        // 💳 (2026-08-14) 결제유형 필터 — 'B2B' | 'B2C' | 'NONE'(미지정). 그 밖의 값은 «전체».
        //    921건을 50개씩 넘겨 보는 구조라, 이게 없으면 미지정 대리점을 눈으로 찾아야 했다.
        const _ptRaw = (url.searchParams.get('payment_type') || '').trim().toUpperCase();
        const pt = (_ptRaw === 'B2B' || _ptRaw === 'B2C' || _ptRaw === 'NONE') ? _ptRaw : '';
        const rawLimit = url.searchParams.get('limit');
        const limit = rawLimit === '0' ? 0 : Math.max(1, Math.min(500, parseInt(rawLimit || '50', 10) || 50));
        const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
        const min = url.searchParams.get('fields') === 'min';
        const where: string[] = [];
        const binds: any[] = [];
        // 🔒 스코프가 맨 앞 — 아래 검색어·결제유형·지사 필터가 무엇이든 이 울타리 안에서만 논다
        if (_cCond.cond) { where.push(_cCond.cond); binds.push(..._cCond.binds); }
        /* 🔎 (2026-11-02 사장님 「대리점 이름 검색이 있어야 하는데 지사 이름까지 걸려 필터링이 어렵다」)
           qf=name 이면 «대리점·학원명» 만 찾는다(「직영」 → 「본사직영지사」 소속 47곳이 다 걸리던 것).
           qf 가 없으면 예전 그대로(대리점·원장·주소·지사) — 다른 호출부의 뜻을 안 바꾼다. */
        const qf = url.searchParams.get('qf') === 'name' ? 'name' : 'all';
        if (q && qf === 'name') {
          where.push(`c.name LIKE ?`);
          binds.push(`%${q}%`);
        } else if (q) {
          where.push(`(c.name LIKE ? OR c.manager LIKE ? OR c.address LIKE ? OR f.name LIKE ?)`);
          const like = `%${q}%`;
          binds.push(like, like, like, like);
        }
        /* 🏢 (2026-08-18 사장님 수정요청 #05) 「지사에 소속된 대리점 찾기」 —
           지금까지는 q 로 지사 «이름» 을 흉내내 찾는 수밖에 없었는데, 이름이 유일하지 않아서
           (CLAUDE.md 「centers.name 이 유일하지 않습니다」) 엉뚱한 지사 것이 섞여 나왔다.
           id 로 거르면 그 사고가 없다. */
        const fidRaw = url.searchParams.get('franchise_id');
        const fid = fidRaw ? parseInt(fidRaw, 10) : 0;
        if (fid) { where.push(`c.franchise_id = ?`); binds.push(fid); }
        const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        // 미지정 = NULL 뿐 아니라 '' 같은 쓰레기값도 포함해야 «전체 = B2B+B2C+미지정» 이 맞는다.
        const IS_NONE = `(c.payment_type IS NULL OR c.payment_type NOT IN ('B2B','B2C'))`;
        // 유형별 건수 — 검색어(q)까지만 반영하고 «결제유형 필터는 일부러 빼서», 버튼마다 몇 건인지 보이게 한다.
        // COUNT 쿼리 하나로 전체·B2B·B2C·미지정을 다 구하므로 왕복이 늘지 않는다.
        const cnt: any = await env.DB.prepare(
          `SELECT COUNT(*) AS n,
                  SUM(CASE WHEN c.payment_type = 'B2B' THEN 1 ELSE 0 END) AS b2b,
                  SUM(CASE WHEN c.payment_type = 'B2C' THEN 1 ELSE 0 END) AS b2c,
                  SUM(CASE WHEN ${IS_NONE} THEN 1 ELSE 0 END) AS none_ct
             FROM centers c LEFT JOIN franchises f ON f.id = c.franchise_id${whereSql}`
        ).bind(...binds).first();
        const counts: Record<string, number> = {
          all: Number(cnt?.n || 0), B2B: Number(cnt?.b2b || 0),
          B2C: Number(cnt?.b2c || 0), NONE: Number(cnt?.none_ct || 0),
        };
        // 목록에만 결제유형 조건을 더한다(건수 요약은 위에서 이미 계산됨).
        const listWhere = [...where];
        const listBinds = [...binds];
        if (pt === 'NONE') listWhere.push(IS_NONE);
        else if (pt) { listWhere.push(`c.payment_type = ?`); listBinds.push(pt); }
        const listWhereSql = listWhere.length ? ` WHERE ${listWhere.join(' AND ')}` : '';
        /* 💰 (2026-08-22) 대리점별 «주 1회 수강료» 를 함께 내려준다.
           안 정한 곳은 NULL 로 오고 화면이 표준값(30,000원)을 보여 준다 — 여기서
           표준값을 채워 보내면 «사람이 정한 값» 과 «기본값» 을 구분할 수 없어진다.
           ⚠️ 정본은 settlement_rate_override 다(정산 계산이 보는 그 표). centers 에
              칸을 새로 만들지 않는다 — 두 벌이 되면 어느 쪽이 맞는지 알 수 없다. */
        const cols = min ? 'c.id, c.name'
          : `c.*, f.name AS franchise_name,
             (SELECT o.tuition_krw FROM settlement_rate_override o
               WHERE o.scope_type='agency' AND o.scope_key = c.name) AS tuition_krw`;
        /* ↕ (2026-10-28 사장님 「필터 올림·내림」) 머리글 정렬 — 50건씩 넘겨 보는 구조라 «이 페이지만»
           정렬하면 거짓말이 된다(921건 전체 순서가 아니다). 그래서 서버 ORDER BY 로 한다.
           ⛔ sort 값을 SQL 에 그대로 넣지 않는다 — 아래 표에 있는 열쇠만 받고 나머지는 «기본 순서».
           빈 값(NULL·'')은 방향과 무관하게 언제나 맨 아래(강사 명부 정렬과 같은 규칙), 같으면 id 순.
           🔒 로그인 아이디 정렬은 본사만 — 아이디 칸 자체가 본사에게만 실린다(아래 login_ids). */
        const _txt = (col: string) => `NULLIF(TRIM(${col}), '')`;
        const CT_SORT: Record<string, { expr: string; text: boolean; join?: string }> = {
          id:       { expr: 'c.id', text: false },
          franchise:{ expr: _txt('f.name'), text: true },
          name:     { expr: _txt('c.name'), text: true },
          payment:  { expr: `CASE WHEN c.payment_type IN ('B2B','B2C') THEN c.payment_type END`, text: false },
          tuition:  { expr: `(SELECT o.tuition_krw FROM settlement_rate_override o WHERE o.scope_type='agency' AND o.scope_key = c.name)`, text: false },
          country:  { expr: _txt('c.country'), text: true },
          manager:  { expr: _txt('c.manager'), text: true },
          phone:    { expr: _txt('c.phone'), text: true },
          address:  { expr: _txt('c.address'), text: true },
        };
        if (canEditOrg(_cSc)) {
          // ⚠️ 줄마다 도는 상관 서브쿼리로 쓰면 대리점 921줄 × admin_scope 전수 × 2번(IS NULL·값) 이라
          //    계정이 늘수록 느려진다(2026-10-28 함정 대조 실측: scope 3,000행에 약 0.57초). 이름별로 «한 번»
          //    묶은 표를 이 정렬일 때만 LEFT JOIN 한다(다른 정렬·건수 쿼리에는 안 붙는다).
          CT_SORT.login = { expr: 'ct_login.login_min', text: true,
            join: ` LEFT JOIN (SELECT s.scope_value AS shop, MIN(s.username) AS login_min FROM admin_scope s
                                 JOIN admin_account a ON a.username = s.username
                                WHERE s.scope_type = 'agency' GROUP BY s.scope_value) ct_login ON ct_login.shop = c.name` };
        }
        const _sortKey = String(url.searchParams.get('sort') || '');
        const sortDef = Object.prototype.hasOwnProperty.call(CT_SORT, _sortKey) ? CT_SORT[_sortKey] : null;
        const sortDir = String(url.searchParams.get('dir') || '').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
        const orderSql = sortDef
          ? `(${sortDef.expr}) IS NULL, ${sortDef.expr}${sortDef.text ? ' COLLATE NOCASE' : ''} ${sortDir}, c.id ASC`
          : `c.active DESC, c.name ASC`;
        const sortJoin = (sortDef && sortDef.join) || '';
        const pageSql = limit === 0 ? '' : ` LIMIT ? OFFSET ?`;
        const pageBinds = limit === 0 ? listBinds : [...listBinds, limit, offset];
        const rs = await env.DB.prepare(
          `SELECT ${cols} FROM centers c LEFT JOIN franchises f ON f.id = c.franchise_id${sortJoin}${listWhereSql} ORDER BY ${orderSql}${pageSql}`
        ).bind(...pageBinds).all();
        const _ctItems: any[] = (rs.results || []) as any[];
        /* 🪪 (2026-10-26 사장님 「대리점 아이디가 안 나온다」) 대리점 로그인 계정은 centers 에
           칸이 없고 admin_scope(scope_type='agency') 의 scope_value = 대리점 «이름» 으로만
           이어진다(scopeCenterCond 가 name = ? 로 가르는 것과 같은 규칙 — 정확일치만, 추측 없음).
           ⚠️ 이 줄이 그 이름을 쓰는 «모든» 대리점에 붙는 것은 사실 그대로다 — centers.name 이
              유일하지 않아 그 계정은 같은 이름 대리점 자료를 함께 본다(login_shared 로 알린다).
           ⚠️ 지워진 계정의 남은 scope 행은 admin_account 와 JOIN 해 뺀다.
           🔒 계정명은 본사만(지사 login_id 와 같은 이유). 실패해도 목록은 그대로 — 칸만 «모름». */
        if (!min && canEditOrg(_cSc) && _ctItems.length) {
          try {
            const names = Array.from(new Set(_ctItems.map((it: any) => String(it.name || '')).filter(Boolean)));
            const namesJson = JSON.stringify(names);
            const acc = await env.DB.prepare(
              `SELECT s.scope_value AS shop, s.username FROM admin_scope s
                 JOIN admin_account a ON a.username = s.username
                WHERE s.scope_type = 'agency' AND s.scope_value IN (SELECT value FROM json_each(?))
                ORDER BY s.username`
            ).bind(namesJson).all();
            const dup = await env.DB.prepare(
              `SELECT name FROM centers WHERE name IN (SELECT value FROM json_each(?)) GROUP BY name HAVING COUNT(*) > 1`
            ).bind(namesJson).all();
            const byName = new Map<string, string[]>();
            for (const r of (acc.results || []) as any[]) {
              const k = String(r.shop || '');
              if (!byName.has(k)) byName.set(k, []);
              byName.get(k)!.push(String(r.username));
            }
            const dupSet = new Set(((dup.results || []) as any[]).map((r: any) => String(r.name)));
            for (const it of _ctItems) {
              it.login_ids = byName.get(String(it.name || '')) || [];
              it.login_shared = dupSet.has(String(it.name || ''));
            }
          } catch (e: any) {
            console.warn('[centers] login_ids lookup failed', e?.message || e);
          }
        }
        return json({ ok: true, items: _ctItems, total: pt ? counts[pt] : counts.all, counts, limit, offset,
                      // ↕ 서버가 «실제로 적용한» 정렬 — 모르는 열쇠는 버렸으니 화면은 이 값으로 화살표를 그린다.
                      sort: sortDef ? { key: _sortKey, dir: sortDir === 'DESC' ? 'desc' : 'asc' } : null,
                      scope: { type: _cSc.type, label: _cSc.label }, can_edit: canEditOrg(_cSc),
                      // 🔒 로그인 계정 칸을 보여 줄지 — 저장 때와 «같은 판정»(본사만). 화면은 false 일 때만 감춘다.
                      can_login: canEditOrg(_cSc) ? (await agencyLoginActor()).ok : false });
      }
      const b = await parseJsonBody(request);
      if (!b || !b.name) return invalidBody(['name']);
      const now = Date.now();

      /* 🔑 (2026-08-19 사장님 요청) 대리점 등록과 함께 로그인 계정도 만든다.
         지금까지는 대리점(학원)을 등록해도 로그인 계정을 만드는 자리가 없어서, 필요하면
         admin_account 에 손으로 심어야 했다 — CLAUDE.md 「직원을 등록했는데 로그인이 안 돼요」와
         같은 뿌리(«등록» 화면이 실제 로그인 계정 생성과 분리돼 있던 문제).
         아이디·비번을 «둘 다» 채웠을 때만 계정을 만든다. 하나만 채우면 400 — 대리점만 만들어지고
         로그인은 없는 «반쪽» 상태를 피한다. scope_value 는 반드시 centers.name 과 똑같아야 한다
         (scope.ts scopeCenterCond 가 id 가 아니라 «이름» 으로 대리점 계정을 가른다). */
      const loginUsername = String(b.login_username || '').trim();
      const loginPassword = String(b.login_password || '');
      let loginChk: AgencyLoginCheck | null = null;
      let loginActor: AgencyLoginActor | null = null;
      if (loginUsername || loginPassword) {
        if (!loginUsername || !loginPassword) {
          return json({ ok: false, error: 'login_fields_incomplete',
            message: '대리점 로그인 아이디와 비밀번호를 함께 입력하세요.' }, 400);
        }
        // 🔑 검사 정본은 위 checkAgencyLogin(수정 화면과 공용). selfId=0 → 새 대리점이라
        //    «이미 있는 아이디» 는 비밀번호 바꾸기 없이 그대로 거절, 같은 이름 대리점이 하나라도 있으면 거절.
        //    거절되면 대리점도 만들지 않는다(예전과 같다 — 계정 없이 등록하려면 두 칸을 비우면 된다).
        loginActor = await agencyLoginActor();
        if (!loginActor.ok) return loginActor.deny;
        loginChk = await checkAgencyLogin(loginUsername, loginPassword, String(b.name), 0, '');
        if (!loginChk.ok) return json({ ok: false, error: loginChk.error, message: loginChk.message }, loginChk.status as any);
      }

      const r = await env.DB.prepare(
        `INSERT INTO centers (franchise_id, name, country, address, manager, payment_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(b.franchise_id || null, b.name, b.country || null, b.address || null, b.manager || null, _normPayType(b.payment_type), now, now).run();

      const loginCreated = loginChk ? (await applyAgencyLogin(loginChk, loginPassword, String(b.name), loginActor)) === 'created' : false;

      return json({ ok: true, id: r.meta.last_row_id, login_created: loginCreated });
    }
  return null;
}
