import { createAdminAuditWriter } from './admin-audit';
/** library: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { json, parseJsonBody, invalidBody } from './api-util';
import { forbiddenTeacherBody } from './forbidden-teacher';
import { probeImage, ocrGate } from './textbook-ocr';
import { textbookPurgeGate } from './textbook-purge-gate';
import { getScope, canEditOrg } from './scope';
import { getAdminActor, isOrgScopedRole } from './auth-admin';


/* 🙈 (2026-08-13) MES 숨김 씨앗을 «이 아이솔레이트에서 이미 확인했는가».
   숨김 목록은 강사가 교재를 열 때마다(공개 라이브러리) 읽히는 뜨거운 길이다.
   플래그 확인 SELECT 를 매 요청 돌리지 않게 여기서 한 번만 본다.
   ⚠️ 이건 «했다» 의 정본이 아니다 — 정본은 DB 의 payroll_meta 플래그다.
      아이솔레이트가 새로 뜨면 한 번 더 확인하고, 이미 돼 있으면 그대로 지나간다. */
let _mesHiddenSeedChecked = false;
export async function handleAdminLibraryApi(request: Request, url: URL, env: MangoEnv, ctx?: ExecutionContext): Promise<Response | null> {
  const writeAudit = createAdminAuditWriter(env);
  const path = url.pathname;
  const method = request.method;


    // ═══════════════════════════════════════════════════════════════════════
    // 📚 Phase 39 — 교재 파일 라이브러리 (PDF / JPG / PNG)
    //   • 경쟁사 참고: ClassIn(PDF 칠판 공유), Tutoring(레벨별 자료), Khan Academy(코스 단위)
    //   • R2: RECORDINGS 버킷 재사용, key prefix "textbook-files/"
    //   • 강의실 교재 탭에서 라이브러리 → 선택 → 칠판/PDF 뷰어 동기화
    // ═══════════════════════════════════════════════════════════════════════
    /* 📚 «묶음(책) 이름» 판정 정본 — 파일명 앞 [대괄호] 하나가 묶음이다.
       ⛔ 이 식을 복제하지 말 것: 숨김 목록(GET)과 묶음 삭제(DELETE)가 서로 다른 식을 쓰면
          사람이 화면에서 고른 책과 **다른 책이 지워진다**(되돌릴 수 없다).
       ⛔ LIKE 로 바꾸지 말 것: D1 은 LIKE 패턴이 50자를 넘으면 조회 자체가 실패한다
          (실측 — 교재 이름은 「BTS 17 Korea (Hobbies And Activities,…)」처럼 쉽게 넘는다). */
    const BOOK_EXPR = `(CASE WHEN substr(name,1,1)='[' THEN substr(name,2,instr(name,']')-2) ELSE '(기타)' END)`;


    const ensureTextbookFilesTable = async () => {
      await env.DB.exec(
        `CREATE TABLE IF NOT EXISTS textbook_files (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kind TEXT NOT NULL, mime TEXT, ext TEXT, size_bytes INTEGER, r2_key TEXT NOT NULL, textbook_id INTEGER, level TEXT, unit_no INTEGER, description TEXT, uploaded_by TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`
      );
    };


    /* 🙈 (2026-08-13 마이마이 8/13 ①) 「라이브러리에 MES 교재가 아직 보입니다 — server textbooks」
       ═══════════════════════════════════════════════════════════════════════════════
       [왜 8/11 의 숨김이 안 통했나] 그때 넣은 필터(idx-x3.js __libIsRetiredCourse)는
          교재 **이름에 'MES' 라는 글자가 들어 있는지**만 본다. 그런데 서버 교재의 묶음 이름은
          파일명 앞의 [대괄호]에서 나온다(_serverFilesToBooks) — 실제 이름은
          「LEVEL 1」~「LEVEL 7」 · 「Mangoi Books」 · 「004. I visited my grandparents」 처럼
          **어디에도 MES 가 없다.** 그래서 필터를 그대로 통과했다.
          (참고: 8/11 주석의 «MES 파일 325개» 도 오탐이었다 — 'Computer GAMES' 안의 'MES' 였다.
           낱말경계 정규식이 그걸 걸러 주므로 실제로 숨겨진 서버 교재는 **0개**였다.)
       [그래서 이름으로 맞히지 않는다] 어느 묶음이 MES 인지는 **사람이 안다.**
          코드가 「LEVEL 1~7 이 MES 겠지」 하고 찍으면, 틀렸을 때 강사가 쓰는 교재가 사라진다.
          → 숨길 묶음을 **관리자가 목록에서 골라** 저장한다. 배포 없이 즉시 켜고 끌 수 있다.
       [지우지 않는다] 파일·수업기록은 그대로다. 목록에서 안 보이게만 한다(8/11 결정과 동일). */
    const ensureTextbookHiddenTable = async () => {
      await env.DB.exec(
        `CREATE TABLE IF NOT EXISTS textbook_hidden_books (book TEXT PRIMARY KEY, hidden_by TEXT, created_at INTEGER NOT NULL);`
      );
      /* ✅ (2026-08-13) 마이마이 답변: **"Yes, Level 1 to 7 are MES"**
         ─────────────────────────────────────────────────────────────────
         위에서 «코드가 찍지 않는다» 고 한 그 답을 사람에게 받았다 → 이제 넣어도 된다.
         ⚠️ 1회만 넣는다. 관리자가 나중에 «역시 보이게» 체크를 풀면 그 뜻을 지켜야 하는데,
            매 요청마다 넣으면 푼 것이 되살아난다(플래그로 딱 한 번).
         ⚠️ LEVEL 2 는 지금 운영 DB 에 없다 — 넣어도 해가 없고, 나중에 올라오면 자동으로 숨겨진다. */
      if (_mesHiddenSeedChecked) return;
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS payroll_meta (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)`);
        const seeded: any = await env.DB.prepare(`SELECT value FROM payroll_meta WHERE key = 'mes_hidden_seed_260813'`).first().catch(() => null);
        _mesHiddenSeedChecked = true;
        if (!seeded) {
          const now2 = Date.now();
          for (let lv = 1; lv <= 7; lv++) {
            await env.DB.prepare(
              `INSERT OR IGNORE INTO textbook_hidden_books (book, hidden_by, created_at) VALUES (?,?,?)`
            ).bind(`LEVEL ${lv}`, 'maimai-260813', now2).run().catch(() => {});
          }
          await env.DB.prepare(`INSERT OR REPLACE INTO payroll_meta (key,value,updated_at) VALUES ('mes_hidden_seed_260813','1',?)`).bind(now2).run().catch(() => {});
        }
      } catch { /* 씨앗이 안 들어가도 화면에서 직접 체크하면 된다 */ }
    };

    const loadHiddenBooks = async (): Promise<Set<string>> => {
      try {
        await ensureTextbookHiddenTable();
        const rs: any = await env.DB.prepare(`SELECT book FROM textbook_hidden_books`).all();
        return new Set((rs.results || []).map((r: any) => String(r.book || '')));
      } catch { return new Set<string>(); }
    };


    // GET /api/admin/textbook-hidden-books — 묶음 전체 + 숨김 여부(관리자 화면의 체크박스 목록)
    if (method === 'GET' && path === '/api/admin/textbook-hidden-books') {
      await ensureTextbookFilesTable();
      const hidden = await loadHiddenBooks();
      const rs: any = await env.DB.prepare(
        `SELECT ${BOOK_EXPR} AS book,
                COUNT(*) AS files
         FROM textbook_files WHERE active = 1 GROUP BY book ORDER BY book ASC`
      ).all().catch(() => ({ results: [] }));
      const books = (rs.results || []).map((g: any) => ({
        book: g.book, files: g.files, hidden: hidden.has(String(g.book)),
      }));
      return json({ ok: true, books, hidden_count: hidden.size });
    }


    // POST /api/admin/textbook-hidden-books — { book, hidden } 한 묶음을 숨기거나 되살린다
    if (method === 'POST' && path === '/api/admin/textbook-hidden-books') {
      await ensureTextbookHiddenTable();
      const b: any = await request.json().catch(() => ({}));
      const book = String(b?.book || '').trim();
      if (!book) return json({ ok: false, error: 'book_required' }, 400);
      const who = String(b?.by || 'admin').slice(0, 80);
      if (b?.hidden === false) {
        await env.DB.prepare(`DELETE FROM textbook_hidden_books WHERE book = ?`).bind(book).run();
        return json({ ok: true, book, hidden: false });
      }
      await env.DB.prepare(
        `INSERT OR REPLACE INTO textbook_hidden_books (book, hidden_by, created_at) VALUES (?,?,?)`
      ).bind(book, who, Date.now()).run();
      return json({ ok: true, book, hidden: true });
    }


    /* 🗑️ DELETE /api/admin/textbook-files — 교재 «묶음 통째» 영구 삭제 (2026-09-07 사장님 결정 B안)
       ═══════════════════════════════════════════════════════════════════════════
       [왜] 지금까지 서버 교재를 지우는 길은 `/:id` **한 장씩** 뿐이었다.
          `[BTS 2 001 (Shapes and colors)]` = 19번, `[BTS Books]` = **6,680번** 확인창이라
          사실상 «삭제가 없는» 상태였다(2026-09-07 필리핀 매니저 Mai 제보 — D1 실측).
       [관문] `src/index.ts`(공동 금지구역)를 한 줄도 안 건드린다 —
          `path === '/api/admin/textbook-files'` 는 ②라우팅 허용목록에 **이미** 있고
          그 등록은 메서드를 안 가린다. 이 경로의 DELETE 는 비어 있었다(실측).
          ⚠️ 그래서 본문에 `action` 을 두고 **모르는 값은 거절**한다 — 안 그러면 나중에
             이 경로에 다른 뜻을 넣을 때 «모르는 요청» 이 조용히 흘러 들어온다.
       [2단계 안전장치]
          1단계 `dry_run`(기본값) — 아무것도 안 지우고 «몇 장 · 몇 MB» 만 세어 돌려준다.
          2단계 `dry_run:false` + `confirm_name` 이 책 이름과 **정확일치**해야 실제로 지운다.
       ⛔ 되돌릴 수 없다. 그래서 «숨기기»(textbook_hidden_books)를 없애지 않았다 —
          파일을 남기고 목록에서만 빼는 쪽이 대부분의 경우 맞는 답이다. */
    if (method === 'DELETE' && path === '/api/admin/textbook-files') {
      const b: any = await request.json().catch(() => ({}));
      const book = String(b?.book || '').trim();
      const dryRun = b?.dry_run !== false;
      const _pgActor = await getAdminActor(request, env as any);

      /* 파일 수를 먼저 센다 — ⚠️ 조회가 실패하면 **0 이 아니라 null**(모름)로 넘긴다.
         0 으로 떨어뜨리면 «없는 책» 과 «못 센 책» 이 같은 말이 되어 가드가 fail-open 이 된다. */
      let totalFiles: number | null = null;
      let cnt: any = null;
      if (book) {
        try {
          await ensureTextbookFilesTable();
          cnt = await env.DB.prepare(
            `SELECT COUNT(*) AS files, SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS active_files,
                    COALESCE(SUM(size_bytes),0) AS bytes
               FROM textbook_files WHERE ${BOOK_EXPR} = ?`
          ).bind(book).first();
          totalFiles = Number(cnt?.files ?? 0);
        } catch { totalFiles = null; }   // 모름 — 게이트가 lookup_failed 로 막는다
      }

      /* 🔒 허용 판정은 **정본 함수 한 곳**이 한다(src/textbook-purge-gate.ts).
         ⛔ 여기에 조건을 다시 적지 말 것 — 라우트 안 조건은 하니스가 문자열로만 보게 되고,
            그러면 부등호를 뒤집어도 초록불이 난다. */
      const gate = textbookPurgeGate({
        action: b?.action, actorOk: !!_pgActor.ok, isTeacher: !!_pgActor.isTeacher,
        role: _pgActor.role, book, dryRun, confirmName: b?.confirm_name, totalFiles,
      });
      if (!gate.ok) return json(
        gate.error === 'forbidden_teacher' ? forbiddenTeacherBody(_pgActor) : { ok: false, error: gate.error },
        gate.status as any);

      if (gate.mode === 'count') {
        const sample: any = await env.DB.prepare(
          `SELECT name FROM textbook_files WHERE ${BOOK_EXPR} = ? ORDER BY id LIMIT 5`
        ).bind(book).all().catch(() => ({ results: [] }));
        return json({
          ok: true, dry_run: true, book,
          files: Number(totalFiles || 0),
          active_files: Number(cnt?.active_files || 0),
          bytes: Number(cnt?.bytes || 0),
          sample: (sample.results || []).map((r: any) => r.name),
        });
      }

      /* 한 번에 다 지우지 않는다 — 6,680장짜리 묶음이 실재해 요청 하나가 시간 초과로 죽으면
         «어디까지 지워졌는지» 를 아무도 모른다. 화면이 남은 수를 보고 반복해서 부른다. */
      const PURGE_BATCH_MAX = 300;
      /* ⚠️ 여기서 «못 읽음» 을 «지울 게 없음»(빈 배열)으로 떨어뜨리면 안 된다 —
         아래 remaining 과 겹치면 「삭제 완료 · 0장」이라는 **거짓 완료**가 된다. */
      let rows: any = null;
      try {
        rows = await env.DB.prepare(
          `SELECT id, r2_key FROM textbook_files WHERE ${BOOK_EXPR} = ? ORDER BY id LIMIT ${PURGE_BATCH_MAX}`
        ).bind(book).all();
      } catch { rows = null; }
      if (!rows) return json({ ok: false, error: 'lookup_failed' }, 503);

      const r2 = (env as any).RECORDINGS;
      let deleted = 0, r2Deleted = 0, r2Failed = 0;
      for (const row of (rows.results || [])) {
        const key = String(row?.r2_key || '');
        /* ⛔ 접두사가 맞는 키만 지운다 — 이 칸에 다른 값이 섞여 들어온 전례가 있다(녹화 file_url).
           R2 delete 는 «없는 키» 에도 예외를 안 내므로, 접두사 검사 없이 넘기면
           엉뚱한 오브젝트를 지우고도 «성공» 으로 센다. */
        if (r2 && key.startsWith('textbook-files/')) {
          try { await r2.delete(key); r2Deleted++; }
          catch { r2Failed++; continue; }   // ⚠️ D1 행을 남긴다 — 지우면 그 키를 영영 못 찾아 고아가 된다
        }
        await env.DB.prepare(`DELETE FROM textbook_files WHERE id = ?`).bind(row.id).run();
        deleted++;
      }

      /* 🔴 «남은 수» 를 못 읽었을 때 0 으로 떨어뜨리면 세 가지가 한꺼번에 거짓이 된다:
         ① 응답 done:true → 화면이 «삭제 완료» 라고 말한다(파일은 남아 있는데)
         ② 아래 숨김 표식이 지워져 **숨겨 뒀던 교재가 전 강사·학생에게 되살아난다**
         ③ 감사로그에 remaining:0 이라는 틀린 사실이 박힌다(되돌릴 수 없는 조작의 유일한 흔적)
         → **null(모름)로 두고, 모르면 아무것도 «완료» 로 만들지 않는다.**
         (게이트가 이미 같은 원칙이다 — CLAUDE.md 「«모른다» 를 별도 사유로 거절」) */
      let remaining: number | null = null;
      try {
        const left: any = await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM textbook_files WHERE ${BOOK_EXPR} = ?`
        ).bind(book).first();
        remaining = Number(left?.n ?? 0);
      } catch { remaining = null; }

      // 다 지운 것을 «확인했을 때만» 숨김 표식을 정리한다(모르면 안 건드린다).
      if (remaining === 0) {
        try {
          await ensureTextbookHiddenTable();
          await env.DB.prepare(`DELETE FROM textbook_hidden_books WHERE book = ?`).bind(book).run();
        } catch { /* 숨김 정리는 실패해도 삭제 자체를 되돌리지 않는다 */ }
      }

      // 누가 무엇을 지웠는지 남긴다 — 되돌릴 수 없는 조작이라 기록이 유일한 흔적이다.
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS admin_audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_uid TEXT NOT NULL, action TEXT NOT NULL, target_room TEXT, target_user TEXT, meta TEXT, ip TEXT, created_at INTEGER NOT NULL);`);
        await env.DB.prepare(
          `INSERT INTO admin_audit_logs (admin_uid, action, target_user, meta, created_at) VALUES (?,?,?,?,?)`
        ).bind(_pgActor.username || 'unknown', 'textbook_purge_book', book,
               JSON.stringify({ deleted, r2_deleted: r2Deleted, r2_failed: r2Failed, remaining }), Date.now()).run();
      } catch { /* 기록 실패가 삭제를 막지는 않는다 */ }

      return json({
        ok: true, dry_run: false, book,
        deleted, r2_deleted: r2Deleted, r2_failed: r2Failed,
        remaining,                       // null = 모름 (조회 실패)
        done: remaining === 0,           // ⚠️ 모르면 false — «완료» 라고 말하지 않는다
      });
    }


    // POST /api/admin/textbook-files — 파일 업로드 (multipart/form-data)
    if (method === 'POST' && path === '/api/admin/textbook-files') {
      try {
        await ensureTextbookFilesTable();
        const form = await request.formData();
        const file = form.get('file') as File | null;
        if (!file) return json({ ok: false, error: 'file_required' }, 400);

        const MAX_SIZE = 80 * 1024 * 1024;
        if (file.size > MAX_SIZE) return json({ ok: false, error: 'file_too_large', max: MAX_SIZE }, 413);

        const rawName = (form.get('name') as string | null) || file.name || 'untitled';
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
        const allowedExt = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
        if (!allowedExt.includes(ext)) return json({ ok: false, error: 'invalid_type', allowed: allowedExt }, 400);
        const kind = ext === 'pdf' ? 'pdf' : 'image';

        const r2 = (env as any).RECORDINGS;
        if (!r2) return json({ ok: false, error: 'r2_not_configured' }, 500);

        /* 🔁 (2026-08-14 마이마이) 「같은 책이 여러 번 올라가 페이지가 2~3배가 됐다」
           ═══════════════════════════════════════════════════════════════════════
           [실측] 운영 DB 38,922행 중 고유 페이지는 17,170개 — **평균 2.3배**,
              BTS 1 은 5배였다(115장짜리 책의 실제 내용은 23장). R2 오브젝트도 38,922개라
              약 3.3GB 가 같은 그림의 사본이었다.
           [원인] 이 API 는 **같은 파일을 또 올려도 그냥 새 행 + 새 R2 오브젝트를 만들었다.**
              업로드를 두 번 하면 책이 두 배가 된다 — 사람이 조심하는 것으로 막을 수 없다.
           [고침] 이름과 크기가 똑같은 파일이 이미 있으면 **올리지 않고 건너뛴다.**
              R2 에도 쓰지 않으므로 저장공간도 안 늘어난다.
           ⚠️ 실패가 아니라 «건너뜀» 이다 — 화면이 오류로 오해하지 않게 ok:true 로 답하고
              skipped 를 함께 준다(업로더가 이 값을 세어 «N개는 이미 있어 건너뜀» 이라고 알린다).
           ⚠️ 이름+크기가 같아도 내용이 다를 가능성은 남는다. 그래도 «같은 책을 두 번 올리는»
              실제 사고를 막는 편이 이득이 훨씬 크다(교재는 덮어쓸 일이 거의 없다). */
        const dupRow: any = await env.DB.prepare(
          `SELECT id FROM textbook_files WHERE active = 1 AND name = ? AND size_bytes = ? LIMIT 1`
        ).bind(rawName, file.size).first().catch(() => null);
        if (dupRow && dupRow.id) {
          /* 🙈 (2026-09-10 필리핀 매니저) 「이미 있다는데 라이브러리 어디에도 안 보인다」
             ═══════════════════════════════════════════════════════════════════════
             [실측] 그 파일은 정말 있었다(9/1 업로드). 안 보인 이유는 그 파일이 들어간 묶음
                「BTS」가 9/8 에 **숨김** 이라 `/api/textbook-files?group=1` 이 목록에서 빼기
                때문이었다. 그런데 이 응답은 «건너뛰었다» 만 말해서, 화면은 「없는데 있다고
                한다」로 읽혔다 — 사람이 다시 올리고 또 올린다.
             [고침] «어느 묶음인가»(book)와 «지금 숨김인가»(hidden)를 함께 준다.
             ⚠️ 숨김 조회가 실패하면 **false 가 아니라 null(모름)** 이다 — 「숨김이 아니다」로
                단정하면 화면이 엉뚱한 곳을 찾게 한다(CLAUDE.md 「모름을 아니오로 채우지 말 것」).
             ⛔ 여기서 숨김을 «풀어» 주지 말 것 — 조회가 상태를 바꾸면 아무도 이유를 모른다.
                푸는 것은 사람이 화면에서 [보이게 하기] 를 누를 때뿐이다. */
          const dupBook = rawName.startsWith('[') && rawName.indexOf(']') > 1
            ? rawName.slice(1, rawName.indexOf(']')) : '(기타)';
          /* 🔴 `loadHiddenBooks()` 로 묻지 말 것 — 그 함수는 **몸통 전체가 try** 라
             절대 던지지 않고 실패하면 «빈 Set» 을 준다(fail-open). 그러면 `.has()` 가
             **false** 가 되어 「숨김 아님」이 **확정**되고, 여기 catch 는 도달 불가능한
             죽은 코드가 된다(2026-09-10 함정 대조가 잡음 — 주석은 null 이라 적혀 있었다).
             ⟹ 「모름」을 만들려면 **여기서 직접** 묻고 예외를 받아야 한다. */
          let dupHidden: boolean | null = null;
          let dupHiddenBy: string | null = null;
          try {
            await ensureTextbookHiddenTable();
            const hrow: any = await env.DB.prepare(
              `SELECT hidden_by FROM textbook_hidden_books WHERE book = ? LIMIT 1`
            ).bind(dupBook).first();
            dupHidden = !!hrow;
            /* «왜 숨겼는지» 는 이 칸뿐이다 — 화면이 안 보여 주면 사람이 근거 없이 되돌린다
               (LEVEL 1~7 은 마이마이 확인으로 숨긴 것이다). */
            dupHiddenBy = hrow ? String(hrow.hidden_by || '') || null : null;
          } catch { dupHidden = null; dupHiddenBy = null; }
          return json({
            ok: true, skipped: true, reason: 'duplicate', id: dupRow.id, name: rawName,
            book: dupBook, hidden: dupHidden, hidden_by: dupHiddenBy,
          });
        }

        const key = `textbook-files/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const buf = await file.arrayBuffer();
        await r2.put(key, buf, {
          httpMetadata: { contentType: file.type || (kind === 'pdf' ? 'application/pdf' : 'image/jpeg') },
        });

        const now = Date.now();
        const level    = (form.get('level') as string | null) || null;
        const unitNo   = form.get('unit_no') ? Number(form.get('unit_no')) : null;
        const textbookId = form.get('textbook_id') ? Number(form.get('textbook_id')) : null;
        const description = (form.get('description') as string | null) || null;
        const uploadedBy = (form.get('uploaded_by') as string | null) || null;

        const ins = await env.DB.prepare(
          `INSERT INTO textbook_files (name, kind, mime, ext, size_bytes, r2_key, textbook_id, level, unit_no, description, uploaded_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(rawName, kind, file.type || null, ext, file.size, key, textbookId, level, unitNo, description, uploadedBy, now, now).run();

        return json({
          ok: true,
          id: ins.meta.last_row_id,
          name: rawName,
          kind,
          ext,
          size: file.size,
          url: `/api/textbook-files/${ins.meta.last_row_id}/raw`,
        });
      } catch (e: any) {
        return json({ ok: false, error: 'upload_failed', detail: String(e?.message || e) }, 500);
      }
    }


    /* 🔍 GET /api/admin/textbook-files/dup-report   (2026-08-19 Melca 8/19 제보 ⑥)
       ═══════════════════════════════════════════════════════════════════════════
       「교재가 200페이지가 넘는다 / BTS 1 은 115쪽인데 실제 내용은 23쪽」의 정체는
       **같은 파일이 여러 번 올라간 것**이다. 새 중복은 2026-08-14 에 막혔지만
       (아래 POST 의 dupRow 검사) 그 전에 쌓인 것은 그대로 남아 있다.

       ⛔ 이 API 는 **SELECT 만** 한다. 지우지도 고치지도 않는다.
          D1 은 개발·운영이 같은 DB 이고 실제 학생 29,000명이 쓴다 —
          «무엇을 지울지» 는 숫자를 눈으로 본 사람이 정한다(CLAUDE.md 1-1).

       판정 기준은 업로드 차단과 **같은 기준**(name + size_bytes)이다.
       두 기준이 어긋나면 「진단은 중복이라는데 업로드는 통과」 같은 모순이 생긴다. */
    if (method === 'GET' && path === '/api/admin/textbook-files/dup-report') {
      await ensureTextbookFilesTable();
      try {
        const rs: any = await env.DB.prepare(
          `WITH f AS (
             SELECT (CASE WHEN substr(name,1,1)='[' THEN substr(name,2,instr(name,']')-2) ELSE '(기타)' END) AS book,
                    name AS nm, COALESCE(size_bytes,0) AS sz
               FROM textbook_files WHERE active = 1
           ), u AS (
             SELECT book, nm, sz, COUNT(*) AS n FROM f GROUP BY book, nm, sz
           )
           SELECT book,
                  SUM(n)            AS files,
                  COUNT(*)          AS uniq_files,
                  SUM(n) - COUNT(*) AS dup_files,
                  SUM(n * sz)       AS bytes,
                  SUM((n - 1) * sz) AS dup_bytes
             FROM u GROUP BY book ORDER BY dup_files DESC, files DESC`
        ).all();
        const books = (rs.results || []).map((r: any) => ({
          book: r.book,
          files: Number(r.files) || 0,
          uniq_files: Number(r.uniq_files) || 0,
          dup_files: Number(r.dup_files) || 0,
          bytes: Number(r.bytes) || 0,
          dup_bytes: Number(r.dup_bytes) || 0,
          // 몇 배로 부풀었는지 — 「115쪽인데 실제는 23쪽」을 한 숫자로 보여 준다
          ratio: Number(r.uniq_files) > 0 ? Math.round((Number(r.files) / Number(r.uniq_files)) * 100) / 100 : 1,
        }));
        const sum = (k: string) => books.reduce((a: number, b: any) => a + (b[k] || 0), 0);
        return json({
          ok: true,
          books,
          total: {
            books: books.length,
            files: sum('files'), uniq_files: sum('uniq_files'), dup_files: sum('dup_files'),
            bytes: sum('bytes'), dup_bytes: sum('dup_bytes'),
          },
          note: '판정 기준은 업로드 중복차단과 같다(name + size_bytes). 이 API 는 읽기 전용이다.',
        });
      } catch (e: any) {
        return json({ ok: false, error: 'dup_report_failed', detail: String(e?.message || e) }, 500);
      }
    }


    /* ✏️ POST /api/admin/textbook-files/rebook   (2026-08-19 Melca 8/19 제보 ④⑦)
       ═══════════════════════════════════════════════════════════════════════════
       「파닉스 A~Z 를 따로 나눠 달라 / BTS 2 는 762쪽이니 유닛별로 나눠 달라」

       [왜 이름만 바꾸면 되나] 라이브러리의 «묶음» 은 파일 이름 앞의 [대괄호] 로만
          정해진다(public/js/idx-x3.js _serverFilesToBooks). 즉 R2 파일을 다시 올릴
          필요가 전혀 없다 — textbook_files.name 만 바꾸면 그 자리에서 갈라진다.
       [왜 API 가 필요한가] 지금은 파일 하나씩 고치는 PATCH 뿐이다. 파닉스는 26묶음이고
          BTS 2 는 762개 파일이다. 손으로 할 수 있는 일이 아니다.

       모드 두 가지 — 둘 다 이름만 바꾼다. R2 오브젝트는 건드리지 않는다.
         · rename       : [A] … → [B] …            (묶음 이름만 갈아 끼움)
         · split-lesson : [A] X/f.jpg → [A X] f.jpg (레슨 칸을 묶음 이름으로 올림)
                          파닉스(`[Mangoi Phonics] A/1.jpg`)·BTS 유닛이 정확히 이 모양이다.

       ⛔ dry_run 이 **기본값**이다. 무엇이 어떻게 바뀌는지 먼저 보여 주고,
          사람이 확인한 뒤에만 진짜로 바꾼다. dry_run 없이 바로 바꾸는 경로는 만들지 않았다.
       ⛔ 본사(hq)만. 핸들러에서 canEditOrg() 로 막는다(화면만 감추면 URL 로 뚫린다).
       ⚠️ 한 번에 5,000행까지. 넘으면 거절하고 몇 건인지 알려 준다 —
          말없이 일부만 바꾸면 «반만 갈라진» 라이브러리가 남는다. */
    if (method === 'POST' && path === '/api/admin/textbook-files/rebook') {
      /* 🔒 강사 차단 — canEditOrg() 만으로는 **못 막는다.**
         canEditOrg 는 type==='hq' 와 type==='none' 에 true 를 주는데,
         그 'none' 이 «내부직원·교사» 다(src/scope.ts 주석). 즉 강사가 그대로 통과한다.
         admin_write_guard_harness 가 이 구멍을 잡아 줬다 — 가드를 한 줄 더 둔다. */
      const _rbActor = await getAdminActor(request, env as any);
      if (_rbActor.isTeacher) return json(forbiddenTeacherBody(_rbActor), 403);
      const _rbScope = await getScope(env as any, request);
      if (!canEditOrg(_rbScope)) return json({ ok: false, error: 'forbidden' }, 403);
      await ensureTextbookFilesTable();
      const b: any = await request.json().catch(() => ({}));
      const match = String(b?.match || '').trim();
      const mode = String(b?.mode || 'rename').trim();
      const replace = String(b?.replace ?? '').trim();
      const dryRun = b?.dry_run !== false;      // 기본 true — 명시적으로 false 를 줘야 바꾼다
      if (!match) return json({ ok: false, error: 'match_required' }, 400);
      if (mode !== 'rename' && mode !== 'split-lesson') return json({ ok: false, error: 'invalid_mode', allowed: ['rename', 'split-lesson'] }, 400);
      if (mode === 'rename' && !replace) return json({ ok: false, error: 'replace_required' }, 400);

      const MAX_ROWS = 5000;
      const rs: any = await env.DB.prepare(
        `SELECT id, name FROM textbook_files WHERE active = 1 AND name LIKE ? ORDER BY id LIMIT ?`
      ).bind(`[${match}]%`, MAX_ROWS + 1).all().catch(() => ({ results: [] }));
      const rows: any[] = rs.results || [];
      if (rows.length > MAX_ROWS) {
        return json({ ok: false, error: 'too_many_rows', max: MAX_ROWS,
          hint: `[${match}] 로 시작하는 파일이 ${MAX_ROWS}개를 넘습니다. 더 좁은 묶음 이름으로 나눠서 실행하세요.` }, 400);
      }

      /* 새 이름 계산 — 규칙이 한 곳에만 있어야 미리보기와 실제 적용이 어긋나지 않는다. */
      const newNameOf = (nm: string): string | null => {
        const m = nm.match(/^\[([^\]]+)\]\s*(.*)$/);
        if (!m || m[1].trim() !== match) return null;      // 정확히 그 묶음만 — 부분일치 금지
        const rest = m[2] || '';
        if (mode === 'rename') return `[${replace}] ${rest}`.trim();
        // split-lesson — 레슨 칸(첫 '/' 앞)을 묶음 이름 뒤에 붙인다
        const slash = rest.indexOf('/');
        if (slash < 0) return null;                        // 레슨 칸이 없으면 건드리지 않는다
        const lesson = rest.slice(0, slash).trim();
        const file = rest.slice(slash + 1).trim();
        if (!lesson || !file) return null;
        const head = replace ? `${replace} ${lesson}` : `${match} ${lesson}`;
        return `[${head}] ${file}`;
      };

      const plan: { id: number; from: string; to: string }[] = [];
      let skipped = 0;
      for (const r of rows) {
        const to = newNameOf(String(r.name || ''));
        if (to == null || to === r.name) { skipped++; continue; }
        plan.push({ id: Number(r.id), from: String(r.name), to });
      }

      // 바뀐 뒤 묶음이 몇 개로 갈라지는지 — 미리보기에서 이것부터 본다
      const booksAfter: Record<string, number> = {};
      for (const p2 of plan) {
        const mm = p2.to.match(/^\[([^\]]+)\]/);
        const k = mm ? mm[1] : '(기타)';
        booksAfter[k] = (booksAfter[k] || 0) + 1;
      }

      if (dryRun) {
        return json({
          ok: true, dry_run: true, matched: rows.length, will_change: plan.length, skipped,
          books_after: booksAfter,
          sample: plan.slice(0, 20),
          note: '아무것도 바꾸지 않았습니다. 적용하려면 dry_run:false 로 다시 호출하세요.',
        });
      }

      if (!plan.length) return json({ ok: true, dry_run: false, changed: 0, note: '바꿀 파일이 없습니다.' });

      /* D1 배치 — 한 문장에 바인드 2개(name, id)라 100개 한도에는 여유가 있지만,
         배치 자체를 크게 만들면 한 건 실패에 전부 말린다. 200개씩 끊는다. */
      const now = Date.now();
      let changed = 0;
      for (let i = 0; i < plan.length; i += 200) {
        const chunk = plan.slice(i, i + 200);
        const stmts = chunk.map((c) =>
          env.DB.prepare(`UPDATE textbook_files SET name = ?, updated_at = ? WHERE id = ?`).bind(c.to, now, c.id)
        );
        try { await env.DB.batch(stmts); changed += chunk.length; }
        catch (e: any) {
          return json({ ok: false, error: 'partial_failure', changed, failed_at: i,
            detail: String(e?.message || e) }, 500);
        }
      }
      await writeAudit(String(b?.by || 'admin'), 'textbook_rebook',
        { meta: { match, mode, replace, changed } });
      return json({ ok: true, dry_run: false, changed, books_after: booksAfter });
    }


    // GET /api/admin/textbook-files — 라이브러리 목록
    if (method === 'GET' && path === '/api/admin/textbook-files') {
      await ensureTextbookFilesTable();
      const lv = url.searchParams.get('level');
      const tb = url.searchParams.get('textbook_id');
      const kd = url.searchParams.get('kind');
      const q  = url.searchParams.get('q');
      const book = url.searchParams.get('book');
      const where: string[] = ['active = 1'];
      const binds: any[] = [];
      if (lv) { where.push('level = ?');       binds.push(lv); }
      if (tb) { where.push('textbook_id = ?'); binds.push(Number(tb)); }
      if (kd) { where.push('kind = ?');        binds.push(kd); }
      if (q)  { where.push('name LIKE ?');     binds.push(`%${q}%`); }
      /* 🔴 LIKE 를 쓰지 않는다 — **D1 의 LIKE 패턴 한도는 50자**다(2026-09-02 실측:
       *    50자 통과·51자에서 `LIKE or GLOB pattern too complex`). 교재 이름이 긴 13개
       *    (BTS 33·17·30·34·32·20·5·24·22 …)는 `[이름]%` 가 50자를 넘어 **조회 자체가
       *    통째로 실패**했다. 화면에는 「D1_ERROR」가 그대로 떠서 교재가 없는 것처럼 보인다.
       *    ⚠️ 덤으로 LIKE 는 이름 속 `%`·`_` 를 와일드카드로 읽는다 — instr 는 그것도 없다. */
      if (book) { where.push('instr(name, ?) = 1'); binds.push(`[${book}]`); }   // 특정 교재의 파일만

      // fix (2026-06-02) — 그룹 집계 모드(?group=1): 교재명([book])별 파일 수를 한 번에.
      //   38,000+ 파일이 있어도 모든 교재가 항상 표에 보이게 (limit 500 에 가려지던 문제 해결).
      if (url.searchParams.get('group') === '1') {
        const gsql = `SELECT (CASE WHEN substr(name,1,1)='[' THEN substr(name,2,instr(name,']')-2) ELSE '(기타)' END) AS book,
                             COUNT(*) AS files, MIN(level) AS level, MAX(kind) AS kind
                      FROM textbook_files WHERE ${where.join(' AND ')}
                      GROUP BY book ORDER BY book ASC`;
        const grs: any = await env.DB.prepare(gsql).bind(...binds).all();
        const groups = grs.results || [];
        const total = groups.reduce((a: number, g: any) => a + (g.files || 0), 0);
        return json({ ok: true, groups, total });
      }

      const limit = Math.min(20000, Math.max(1, parseInt(url.searchParams.get('limit') || '500', 10)));
      const sql = `SELECT id, name, kind, mime, ext, size_bytes, r2_key, textbook_id, level, unit_no, description, uploaded_by, created_at, updated_at FROM textbook_files WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ${limit}`;
      const rs: any = await env.DB.prepare(sql).bind(...binds).all();
      const items = (rs.results || []).map((it: any) => ({
        ...it,
        url: `/api/textbook-files/${it.id}/raw`,
      }));
      return json({ ok: true, items });
    }


    /* 🔬 POST /api/admin/textbook-files/:id — 교재 한 장을 OCR 해 본다 (시험)
     * ═══════════════════════════════════════════════════════════════════════
     * [왜] 복습퀴즈·웜업이 쓸 «교재 본문» 이 이 저장소에 한 글자도 없다. `textbook_files` 는
     *      활성 17,246행 중 이미지가 17,199장이고 description 이 채워진 행은 0건이다
     *      (2026-09-02 D1 실측) ⟹ AI 가 만드는 문항이 교재와 무관하다.
     *      OCR 로 본문을 뽑을 수 있는지 **먼저 재 보는 것** 이 이 경로다.
     *
     * ⚠️ 시험이다 — 결과를 **D1 에 쓰지 않는다.** 되는 것이 확인된 뒤에 저장을 설계한다.
     *    (기능만 만들어 두고 실사용 0으로 방치되는 것이 이 저장소의 반복 사고다.)
     *
     * ⚠️ 왜 하필 POST /:id 인가 — 새 하위 경로(`.../ocr-probe`)를 만들면 라우팅
     *    허용목록(src/index.ts 1239행대)에 한 줄을 넣어야 하는데 그 파일은 «공동 금지구역»
     *    이다. 이 경로는 이미 정규식 `/\d+$/` 로 ②에, `startsWith` 로 ③(api-mango 위임
     *    가드)에 등록돼 있고 **POST 만 비어 있었다.** 그래서 금지구역을 한 줄도 안 건드린다.
     *    ⛔ 그래서 본문의 `action` 을 반드시 확인한다 — 나중에 이 경로에 다른 뜻을 넣을
     *       때 «모르는 요청» 이 조용히 OCR 로 흘러 비용이 나가면 안 된다.
     *
     * 🔐 본사만. 비용이 나가는 호출이라 강사·조직계정을 각각 따로 막는다
     *    (⛔ canEditOrg() 로 막지 말 것 — 그 함수는 'none'=내부직원·교사에 true 다).
     *
     * 💰 비용 통제: 한 요청 = 한 장. 화면이 장마다 따로 부르므로 중간에 멈출 수 있고
     *    「몇 장 돌렸나」가 화면에 그대로 보인다. 엔진 수만큼 호출되므로 그것도 응답에 싣는다.
     */
    if (method === 'POST' && /^\/api\/admin\/textbook-files\/\d+$/.test(path)) {
      const _ocrActor = await getAdminActor(request, env as any);
      if (_ocrActor.isTeacher) return json(forbiddenTeacherBody(_ocrActor, '강사는 이 시험을 실행할 수 없습니다.'), 403);
      if (isOrgScopedRole((_ocrActor as any).role)) return json({ ok: false, error: 'forbidden_scope', message: '본사 계정만 실행할 수 있습니다.' }, 403);

      const b = await parseJsonBody(request) || {};

      const AI = (env as any).AI;
      if (!AI) return json({ ok: false, error: 'ai_binding_missing', message: 'Workers AI 바인딩이 없습니다.' }, 503);

      await ensureTextbookFilesTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const row: any = await env.DB.prepare(`SELECT id, name, mime, ext, size_bytes, r2_key FROM textbook_files WHERE id = ? AND active = 1`).bind(id).first();
      if (!row) return json({ ok: false, error: 'not_found' }, 404);

      /* 🔬 입구 게이트 — 판정 정본은 `ocrGate()` 하나다(라우트에 조건을 다시 적지 말 것).
       *    라우트 안에만 두면 하니스가 문자열로 검사하게 되고, 조건을 뒤집어도 그 글자가
       *    남아 통과한다 — 하필 «비용을 지키는» 자리다. */
      const ext = String(row.ext || '').toLowerCase();
      const mime = String(row.mime || '');
      const gate1 = ocrGate({ action: b.action, mime, ext, sizeBytes: row.size_bytes });
      if (gate1) return json({ ok: false, error: gate1.error, message: gate1.message }, gate1.status as any);

      const obj = await (env as any).RECORDINGS.get(row.r2_key);
      if (!obj) return json({ ok: false, error: 'r2_missing', message: '이미지 실물을 찾지 못했습니다.' }, 404);
      const bytes = new Uint8Array(await obj.arrayBuffer());
      /* ⚠️ `size_bytes` 는 NULL 일 수 있어(스키마상 NOT NULL 아님) 위 검사를 그냥 통과한다.
       *    R2 에서 «실제로 받은» 길이로 한 번 더 본다 — 받는 것까지는 값이 싸다. */
      const gate2 = ocrGate({ action: b.action, mime, ext, sizeBytes: row.size_bytes, actualBytes: bytes.length });
      if (gate2) return json({ ok: false, error: gate2.error, message: gate2.message }, gate2.status as any);

      const engines = Array.isArray(b.engines) ? b.engines.map((x: any) => String(x)) : undefined;
      /* 🔴 `mime` 을 그대로 믿으면 안 된다 — 업로더가 `application/octet-stream` 으로 저장한
       *    파일이 실제로 대부분이다(2026-09-02 D1 실측: BTS 2 의 246장 전부). 그것을 그대로
       *    data: URI 에 넣으면 신형 모델이 «expected image/* MIME type» 으로 전부 거절한다
       *    (실측: Llama 4 Scout 6장 6실패). 이미지 mime 이 아니면 **확장자로 만들어** 넘긴다. */
      const EXT2MIME: Record<string, string> = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp', gif: 'gif' };
      const safeMime = /^image\//.test(mime) ? mime : `image/${EXT2MIME[ext] || 'jpeg'}`;
      const results = await probeImage(AI, (env as any).SESSION_STATE, bytes, safeMime, engines);

      return json({
        ok: true,
        id: row.id,
        name: row.name,
        size_bytes: Number(row.size_bytes || 0),
        url: `/api/textbook-files/${row.id}/raw`,
        calls: results.length,       // 이번 요청이 모델을 몇 번 불렀는가 (비용)
        results,
        saved: false,                // ⚠️ 시험이라 저장하지 않는다 — 화면이 그렇게 말해야 한다
      });
    }


    // PATCH /api/admin/textbook-files/:id
    if (method === 'PATCH' && /^\/api\/admin\/textbook-files\/\d+$/.test(path)) {
      await ensureTextbookFilesTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const b = await parseJsonBody(request);
      if (!b) return invalidBody(['body']);
      const sets: string[] = [];
      const binds: any[] = [];
      if (b.name !== undefined)        { sets.push('name = ?');        binds.push(String(b.name)); }
      if (b.level !== undefined)       { sets.push('level = ?');       binds.push(b.level || null); }
      if (b.unit_no !== undefined)     { sets.push('unit_no = ?');     binds.push(b.unit_no != null ? Number(b.unit_no) : null); }
      if (b.textbook_id !== undefined) { sets.push('textbook_id = ?'); binds.push(b.textbook_id != null ? Number(b.textbook_id) : null); }
      if (b.description !== undefined) { sets.push('description = ?'); binds.push(b.description || null); }
      if (b.active !== undefined)      { sets.push('active = ?');      binds.push(b.active ? 1 : 0); }
      if (sets.length === 0) return json({ ok: false, error: 'nothing_to_update' }, 400);
      sets.push('updated_at = ?'); binds.push(Date.now());
      binds.push(id);
      await env.DB.prepare(`UPDATE textbook_files SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
      return json({ ok: true, id });
    }


    // DELETE /api/admin/textbook-files/:id
    if (method === 'DELETE' && /^\/api\/admin\/textbook-files\/\d+$/.test(path)) {
      await ensureTextbookFilesTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const row: any = await env.DB.prepare(`SELECT r2_key FROM textbook_files WHERE id = ?`).bind(id).first();
      if (row?.r2_key) {
        try { await (env as any).RECORDINGS.delete(row.r2_key); } catch (e) { /* ignore */ }
      }
      await env.DB.prepare(`DELETE FROM textbook_files WHERE id = ?`).bind(id).run();
      return json({ ok: true, id });
    }


    // GET /api/textbook-files/:id/raw — R2 프록시 (강의실 PDF 뷰어용, 인증 불필요)
    if (method === 'GET' && /^\/api\/textbook-files\/\d+\/raw$/.test(path)) {
      await ensureTextbookFilesTable();
      const id = parseInt(path.split('/')[3] || '0', 10);
      const row: any = await env.DB.prepare(`SELECT r2_key, mime, kind, name, ext FROM textbook_files WHERE id = ? AND active = 1`).bind(id).first();
      if (!row) return new Response('Not Found', { status: 404 });
      const r2 = (env as any).RECORDINGS;
      /* 📕 (2026-08-10 마이마이 「시스템 PDF 가 안 넘어간다 / 내 컴퓨터 jpg 가 훨씬 빠르다」)
         [원인] 여기서 Range 헤더를 통째로 무시하고 R2 객체 «전부» 를 돌려주고 있었다.
                Accept-Ranges 도 없으니 pdf.js 는 부분 요청을 포기하고 파일 전체를 받는다.
                교재 PDF 평균 6.3MB(최대 9.3MB) → 필리핀 회선에서 1페이지가 뜨기까지 수십 초.
                강사에게는 「안 넘어간다」로 보인다(실은 아직 받는 중).
         [수정] R2 바인딩에 Range 헤더를 그대로 넘겨 206 부분응답을 지원한다.
                pdf.js 가 필요한 페이지 조각만 받아 첫 페이지가 즉시 뜬다.
         ⚠️ r2_key 는 업로드마다 새로 만들어지므로 내용이 바뀌지 않는다 → immutable 캐시 가능.
            (기존 max-age=3600 은 매 수업마다 6MB 를 다시 받게 하고 있었다) */
      /* ⚡ (2026-08-13 마이마이 「No, still lag, they are slow」 — 5번째 반복 신고)
         ═══════════════════════════════════════════════════════════════════════
         [측정] 교재 이미지 38,860장 평균 143.8KB(최대 1.7MB). 파일이 작다 —
                «파일이 커서» 느린 게 아니다.
         [남은 원인] 이 응답에 Cache-Control: immutable 을 달아도 그건 **브라우저 캐시**다.
                Worker 가 만든 응답은 클라우드플레어 엣지에 자동으로 담기지 않는다.
                그래서 «처음 보는 장» 은 강사마다·기기마다 매번
                   마닐라 → (D1 조회) → R2(서울 ICN) → 마닐라
                를 왕복했다. 한 반이 같은 교재를 봐도 캐시를 나눠 쓰지 못했다.
         [수정] Cache API 로 엣지에 담는다. 마닐라 엣지가 한 번 데워지면 그 다음부터는
                같은 도시의 모든 강사가 R2 왕복 없이 받는다 — 필리핀에서 체감이 가장 크다.
         ⚠️ Range(206) 요청은 담지 않는다 — Cache API 는 206 을 못 담고, 조각마다 키가
            달라 캐시를 오염시킨다. PDF(62개)만 Range 를 쓰므로 이미지 99.8% 는 그대로 이득.
         ⚠️ r2_key 는 업로드마다 새로 만들어져 내용이 안 바뀐다 → 엣지에 오래 둬도 안전하다.
            교재를 지우면 id 가 404 가 되므로 «지운 교재가 계속 보이는» 일도 없다. */
      const rangeHeader = request.headers.get('range');
      const edgeCache: any = (globalThis as any).caches?.default;
      if (!rangeHeader && edgeCache) {
        try {
          const hit = await edgeCache.match(request);
          if (hit) return hit;
        } catch { /* 캐시가 막혀 있어도 원본 경로로 계속 간다 */ }
      }
      const obj = rangeHeader
        ? await r2.get(row.r2_key, { range: request.headers })
        : await r2.get(row.r2_key);
      if (!obj) return new Response('Not Found in R2', { status: 404 });
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      if (!headers.get('content-type')) {
        headers.set('content-type', row.mime || (row.kind === 'pdf' ? 'application/pdf' : 'image/jpeg'));
      }
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
      headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(row.name || 'file')}"`);
      const rng: any = (obj as any).range;
      if (rangeHeader && rng && typeof rng.offset === 'number') {
        const start = rng.offset;
        const end = start + (rng.length ?? ((obj as any).size - start)) - 1;
        headers.set('Content-Range', `bytes ${start}-${end}/${(obj as any).size}`);
        headers.set('Content-Length', String(end - start + 1));
        return new Response(obj.body, { status: 206, headers });
      }
      headers.set('Content-Length', String((obj as any).size));
      const full = new Response(obj.body, { headers });
      /* 엣지에 담는다. 응답 본문은 한 번만 읽을 수 있으므로 clone() 을 넣고 원본을 돌려준다.
         waitUntil 이 있으면 담기를 기다리지 않고 강사에게 먼저 보낸다(첫 요청도 안 느려진다). */
      if (!rangeHeader && edgeCache) {
        try {
          const put = edgeCache.put(request, full.clone());
          if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(put);
          else await put;
        } catch { /* 못 담아도 응답은 정상이다 */ }
      }
      return full;
    }


    // GET /api/textbook-files/:id — 메타데이터 (공개)
    if (method === 'GET' && /^\/api\/textbook-files\/\d+$/.test(path)) {
      await ensureTextbookFilesTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const row: any = await env.DB.prepare(
        `SELECT id, name, kind, mime, ext, size_bytes, level, unit_no, description, created_at FROM textbook_files WHERE id = ? AND active = 1`
      ).bind(id).first();
      if (!row) return json({ ok: false, error: 'not_found' }, 404);
      return json({ ok: true, item: { ...row, url: `/api/textbook-files/${row.id}/raw` } });
    }


    // GET /api/textbook-files — 공개 라이브러리 목록
    if (method === 'GET' && path === '/api/textbook-files') {
      await ensureTextbookFilesTable();
      const lv = url.searchParams.get('level');
      const book = url.searchParams.get('book');
      const where: string[] = ['active = 1'];
      const binds: any[] = [];
      if (lv) { where.push('level = ?'); binds.push(lv); }
      // ⚠️ LIKE 금지 — D1 패턴 한도 50자(위 목록 조회의 주석 참고). 긴 교재 이름이 통째로 실패한다.
      if (book) { where.push('instr(name, ?) = 1'); binds.push(`[${book}]`); }   // 특정 교재의 파일만(시퀀스 로딩용)

      // fix (2026-06-02) — 그룹 집계 모드(?group=1): 라이브러리 트리/칩이 모든 교재를 한눈에 (limit 무관)
      if (url.searchParams.get('group') === '1') {
        const gsql = `SELECT (CASE WHEN substr(name,1,1)='[' THEN substr(name,2,instr(name,']')-2) ELSE '(기타)' END) AS book,
                             COUNT(*) AS files, MIN(level) AS level, MAX(kind) AS kind
                      FROM textbook_files WHERE ${where.join(' AND ')}
                      GROUP BY book ORDER BY book ASC`;
        const grs: any = await env.DB.prepare(gsql).bind(...binds).all();
        /* 🙈 (2026-08-13 마이마이 8/13 ①) 관리자가 숨긴 묶음은 강사·학생 라이브러리에서 뺀다.
           여기 한 곳에서 거르면 트리·카드·검색이 저절로 일치한다(화면이 이 응답 하나를 본다).
           ⚠️ 파일 자체는 그대로다 — 이미 열려 있는 수업(?book= 로드)은 계속 동작한다. */
        const hidden = await loadHiddenBooks();
        const groups = (grs.results || []).filter((g: any) => !hidden.has(String(g.book || '')));
        const total = groups.reduce((a: number, g: any) => a + (g.files || 0), 0);
        return json({ ok: true, groups, total, hidden_count: hidden.size });
      }

      // fix (2026-06-02) — limit 파라미터 허용(기본 500, 최대 20000). 교재 전체를 불러올 수 있게.
      const limit = Math.min(20000, Math.max(1, parseInt(url.searchParams.get('limit') || '500', 10)));
      const rs: any = await env.DB.prepare(
        `SELECT id, name, kind, ext, size_bytes, level, unit_no, description, created_at FROM textbook_files WHERE ${where.join(' AND ')} ORDER BY level ASC, unit_no ASC, created_at DESC LIMIT ${limit}`
      ).bind(...binds).all();
      const items = (rs.results || []).map((it: any) => ({
        ...it,
        url: `/api/textbook-files/${it.id}/raw`,
      }));
      return json({ ok: true, items });
    }
  return null;
}
