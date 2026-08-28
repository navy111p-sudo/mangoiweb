// ═══════════════════════════════════════════════════════════════════════
// 📝 api-lessons.ts — 수업 산출물 도메인: 평가서·숙제 (api-mango.ts 에서 분리)
//   REFACTOR_PLAN 1단계 · 12차(2026-07-14) · 로직 무변경
//   포함: Phase HW(숙제) + E1~E4(평가서) + BE(일괄평가) + CAL(캘린더·공휴일, 13차)
// ═══════════════════════════════════════════════════════════════════════
import { json } from './api-util';
import { siteUrl } from './site-url';           // 🔗 사람에게 나가는 링크는 한 곳에서
import { authUidFromRequest as authUidGlobal } from './auth-token';
import { checkAdminSession, resolveOwnerScope } from './auth-admin';  // 🔐 공용 소유자 판정
import { sendPushToUser } from './api-notify';
import type { MangoEnv } from './api-mango';

export async function handleLessonsApi(
  request: Request,
  url: URL,
  env: MangoEnv
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

    // ═══════════════════════════════════════════════════════════════
    // 📚 Phase HW — 숙제 관리 (출제 → 제출 → 채점 → 피드백)
    //   대상 지정: 전체(all) / 특정 학원(academy) / 특정 학생들(students)
    //   학원 선택 후 그 학원 소속 학생을 다중 선택해 출제할 수 있음.
    // ═══════════════════════════════════════════════════════════════
    const ensureHomeworkTables = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS homework (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        answer_type TEXT DEFAULT 'text',
        due_date TEXT,
        target_type TEXT NOT NULL DEFAULT 'all',
        target_academy TEXT,
        target_student_ids TEXT,
        target_student_names TEXT,
        target_count INTEGER DEFAULT 0,
        created_by TEXT,
        active INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_homework_created ON homework(created_at DESC);`); } catch {}
    };

    // ── POST /api/admin/homework/save — 관리자: 숙제 출제(생성/수정) ──
    if (method === 'POST' && path === '/api/admin/homework/save') {
      await ensureHomeworkTables();
      const b: any = await request.json().catch(() => ({}));
      const title = String(b.title || '').trim();
      if (!title) return json({ ok: false, error: 'title_required' }, 400);
      const description = String(b.description || '').trim() || null;
      const answerType = ['text', 'choice', 'voice', 'video'].includes(String(b.answer_type)) ? String(b.answer_type) : 'text';
      const dueDate = String(b.due_date || '').trim() || null;
      // 대상 타입: all(전체) | academy(특정 학원) | students(특정 학생들)
      let targetType = String(b.target_type || 'all');
      if (!['all', 'academy', 'students'].includes(targetType)) targetType = 'all';
      const targetAcademy = String(b.target_academy || '').trim() || null;
      let ids: string[] = [];
      let names: string[] = [];
      if (Array.isArray(b.target_student_ids)) ids = b.target_student_ids.map((x: any) => String(x)).filter(Boolean);
      if (Array.isArray(b.target_student_names)) names = b.target_student_names.map((x: any) => String(x)).filter(Boolean);
      // 유효성: academy 면 학원명 필수, students 면 학생 1명 이상 필수
      if (targetType === 'academy' && !targetAcademy) return json({ ok: false, error: 'academy_required' }, 400);
      if (targetType === 'students' && ids.length === 0) return json({ ok: false, error: 'students_required' }, 400);
      const targetCount = targetType === 'students' ? ids.length : (b.target_count != null ? Number(b.target_count) : 0);
      const now = Date.now();
      const id = Number(b.id) || 0;
      if (id) {
        const r = await env.DB.prepare(`UPDATE homework SET title=?, description=?, answer_type=?, due_date=?, target_type=?, target_academy=?, target_student_ids=?, target_student_names=?, target_count=?, updated_at=? WHERE id=?`)
          .bind(title, description, answerType, dueDate, targetType, targetAcademy, JSON.stringify(ids), JSON.stringify(names), targetCount, now, id).run();
        if (!((r as any).meta && (r as any).meta.changes)) return json({ ok: false, error: 'homework_not_found' }, 404);
        return json({ ok: true, id });
      }
      const ins = await env.DB.prepare(`INSERT INTO homework (title, description, answer_type, due_date, target_type, target_academy, target_student_ids, target_student_names, target_count, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`)
        .bind(title, description, answerType, dueDate, targetType, targetAcademy, JSON.stringify(ids), JSON.stringify(names), targetCount, now, now).run();
      return json({ ok: true, id: (ins as any).meta?.last_row_id });
    }

    // ── GET /api/admin/homework/list — 관리자: 숙제 목록 ──
    if (method === 'GET' && path === '/api/admin/homework/list') {
      await ensureHomeworkTables();
      const lim = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '100', 10)));
      try {
        const rs = await env.DB.prepare(`SELECT * FROM homework WHERE active=1 ORDER BY created_at DESC LIMIT ?`).bind(lim).all<any>();
        const items = (rs.results || []).map((r: any) => {
          try { r.target_student_ids = JSON.parse(r.target_student_ids || '[]'); } catch { r.target_student_ids = []; }
          try { r.target_student_names = JSON.parse(r.target_student_names || '[]'); } catch { r.target_student_names = []; }
          return r;
        });
        return json({ ok: true, items });
      } catch (e: any) {
        return json({ ok: true, items: [], warning: String(e?.message || e) });
      }
    }

    // ── DELETE /api/admin/homework/:id — 관리자: 숙제 삭제(소프트) ──
    if (method === 'DELETE' && /^\/api\/admin\/homework\/\d+$/.test(path)) {
      await ensureHomeworkTables();
      const id = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.prepare(`UPDATE homework SET active=0, updated_at=? WHERE id=?`).bind(Date.now(), id).run();
      return json({ ok: true, id });
    }


    // ═══════════════════════════════════════════════════════════════
    // 📝 Phase E1~E4 — 학생 평가서
    // ═══════════════════════════════════════════════════════════════

    const ensureEvalTable = async () => {
      // 신규 DB: user_id/eval_at 도 함께 생성(레거시 호환). 기존 DB 에는 아래 가산 마이그레이션이 적용됨.
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, eval_at INTEGER, student_uid TEXT, student_name TEXT, teacher_uid TEXT, teacher_name TEXT, room_id TEXT, lesson_title TEXT, lesson_date TEXT, score_participation INTEGER, score_comprehension INTEGER, score_homework INTEGER, score_attitude INTEGER, score_speaking INTEGER, score_overall REAL, strengths TEXT, improvements TEXT, next_goals TEXT, teacher_comment TEXT, parent_notified INTEGER DEFAULT 0, parent_notified_at INTEGER, viewed_by_parent INTEGER DEFAULT 0, viewed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER);`);
      // 🔧 fix (2026-06-13) — 스키마 드리프트 통합. 운영 DB 의 student_evaluations 는 레거시
      //   스키마(user_id/eval_at/score_total/next_goal …)로 만들어져 있어, 코드가 기대하는
      //   E1~E4 컬럼(student_uid/score_homework/next_goals/viewed_by_parent …)이 없어서
      //   평가서 작성·목록·열람·카톡발송이 전부 D1 에러로 실패했음. 누락 컬럼만 가산(ADD COLUMN)해 통합.
      try {
        const info: any = await env.DB.prepare(`PRAGMA table_info(student_evaluations)`).all();
        const have = new Set(((info && info.results) || []).map((r: any) => String(r.name)));
        const want: Array<[string, string]> = [
          ['student_uid','TEXT'],['student_name','TEXT'],['teacher_uid','TEXT'],['teacher_name','TEXT'],
          ['room_id','TEXT'],['lesson_title','TEXT'],['lesson_date','TEXT'],
          ['score_participation','INTEGER'],['score_comprehension','INTEGER'],['score_homework','INTEGER'],
          ['score_attitude','INTEGER'],['score_speaking','INTEGER'],['score_overall','REAL'],
          ['score_grammar','REAL'],['score_vocab','REAL'],
          ['strengths','TEXT'],['improvements','TEXT'],['weaknesses','TEXT'],['next_goals','TEXT'],['teacher_comment','TEXT'],
          ['parent_notified','INTEGER'],['parent_notified_at','INTEGER'],['viewed_by_parent','INTEGER'],['viewed_at','INTEGER'],
          ['updated_at','INTEGER'],
          // 🌙 (2026-08-09) 야간 발송 보류용 — 22~08시(KST)에 쓴 평가는 아침에 내보낸다.
          //    운영 시간표 실측: 21:30 이후 시작 수업이 65건 있다. 그대로 보내면
          //    학부모 집에 자정 넘어 문자가 간다.
          ['notify_pending','INTEGER'],['notify_phone','TEXT'],
          // 📝 (2026-08-10 Phase 1) 수업 일지 본문 — 강사가 쓴 영어 / 학부모에게 나간 한국어 / 원탭 칩
          ['note_en','TEXT'],['note_ko','TEXT'],['note_chips','TEXT'],
        ];
        for (const [col, typ] of want) {
          if (!have.has(col)) { try { await env.DB.exec(`ALTER TABLE student_evaluations ADD COLUMN ${col} ${typ}`); } catch {} }
        }
      } catch {}
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_eval_student ON student_evaluations(student_uid, created_at DESC);`); } catch {}
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_eval_teacher ON student_evaluations(teacher_uid, created_at DESC);`); } catch {}
      // 🌱 (2026-08-24) 수업평가 밴드(새싹/자람/열매) — students_erp 는 다른 테이블이지만
      //   /api/eval/create 가 유일한 기록 경로라 같은 게이트에서 함께 보장한다.
      //   학년(grade) 자동 배정이 불가능해서(CLAUDE.md 2장 실측) 강사가 수동으로 태그한다.
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN eval_band TEXT`); } catch {}
    };

    /* ═══════════════════════════════════════════════════════════════════════
       📲 학부모 발송 공통부 (2026-08-09)

       왜 생겼나: 평가서 104행 중 학부모가 열어본 것이 **0건**이었다.
       서버는 body 에 전화번호가 함께 올 때만 보내게 돼 있었는데(아래 sendEvalToParent),
       정작 강사 화면(teacher.html)은 그 값을 보내지 않는다 —
       **번호는 클라이언트가 다룰 값이 아니다.** 그래서 서버가 직접 찾아 쓰기로 한다.

       🌙 야간 규칙: 한국 시각 22:00~07:59 에는 보내지 않고 `notify_pending=1` 로 미뤘다가,
          다음에 평가가 하나라도 작성될 때(=아침 첫 수업 이후) 함께 내보낸다.
          cron 에 붙이지 않은 이유는 index.ts(공동 금지구역)를 건드리지 않기 위해서다.
       ═══════════════════════════════════════════════════════════════════════ */
    const kstHour = () => new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
    const isQuietHour = () => { const h = kstHour(); return h >= 22 || h < 8; };

    // 학생 uid 로 학부모(없으면 학생) 번호를 찾는다. feedback-drafts 승인 경로와 같은 소스.
    const lookupParentPhone = async (studentUid: string): Promise<string> => {
      if (!studentUid) return '';
      try {
        const stu: any = await env.DB.prepare(
          `SELECT * FROM students_erp WHERE user_id = ? OR login_id = ? LIMIT 1`
        ).bind(studentUid, studentUid).first();
        return stu ? String(stu.parent_phone || stu.student_phone || stu.phone || '').trim() : '';
      } catch { return ''; }
    };

    // 실제 발송 1건. 알림톡 실패 시 문자로 떨어진다(solapi-client 가 처리).
    //   ⚠️ 문자 본문은 **한국어 고정 템플릿 + 링크** 다. 강사가 쓴 영어 원문을 그대로 보내지 않는다
    //      (필리핀 강사가 영어로 쓰므로, 본문을 그대로 보내면 학부모가 영어를 받는다).
    //      영어→한국어 다듬기는 다음 단계에서 붙는다.
    const sendEvalSms = async (phone: string, studentName: string, evalId: any, noteKo?: string | null): Promise<boolean> => {
      try {
        /* 📝 (2026-08-10) 일지 본문이 있으면 **한국어 본문을 그대로** 보낸다.
           학부모가 링크를 눌러야만 내용을 볼 수 있으면 대부분 안 본다(열람 0/104 가 그 증거).
           본문은 이미 학부모용 한국어로 다듬어진 글이다(mode='note'). 길면 잘라서 링크로 잇는다. */
        const bodyKo = String(noteKo || '').trim();
        if (bodyKo) {
          const { sendPlainSms } = await import('./solapi-client');
          const url = siteUrl('/eval.html?id=' + evalId);
          const msg = `[망고아이] ${studentName || ''} 학생의 오늘 수업 일지가 도착했어요\n`
            + `"${bodyKo.slice(0, 300)}"\n${url}`;
          const r = await sendPlainSms(env as any, phone, msg);
          return !!(r && r.ok);
        }
        /* 🔴 주소를 손으로 쓰지 말 것 — `mango-i.com` 은 **등록조차 안 된 도메인**이다(NXDOMAIN 실측).
              CLAUDE.md 머리에 운영 주소로 적혀 있어서 그대로 썼다가 «죽은 링크가 학부모에게 나가는» 사고가 될 뻔했다.
              이 저장소에서 학부모에게 실제로 나가는 문자들(absent-sweep.ts:189, enroll-ops.ts:516,
              api-retention.ts:61)이 모두 쓰는 주소가 정본이다. */
        const evalUrl = siteUrl('/eval.html?id=' + evalId);
        const { sendKakaoAlimtalk } = await import('./solapi-client');
        const r = await sendKakaoAlimtalk(env as any, {
          templateCode: (env as any).SOLAPI_TEMPLATE_CHAT_SUMMARY || '',
          recipientPhone: phone,
          variables: {
            '#{학생명}': studentName || '학생',
            '#{수업명}': '오늘 수업',
            '#{메시지수}': '평가서',
            '#{요약URL}': evalUrl,
          },
          fallbackSmsText: `[망고아이] ${studentName || ''} 학생의 오늘 수업 평가서가 도착했어요. ${evalUrl}`,
        });
        return !!(r && r.ok);
      } catch (e: any) { console.warn('[eval] sms err:', e?.message); return false; }
    };

    /* 밤에 밀어 둔 발송을 내보낸다. 조용한 시간이면 아무것도 안 한다.
       한 번에 20건까지만 — 이 경로는 평가 작성 요청에 얹혀 도는 곁다리라 길어지면 안 된다. */
    const flushPendingEvalNotifies = async () => {
      if (isQuietHour()) return;
      try {
        const rs: any = await env.DB.prepare(
          `SELECT id, student_name, notify_phone, note_ko FROM student_evaluations
            WHERE notify_pending = 1 AND notify_phone IS NOT NULL AND notify_phone <> ''
            ORDER BY id LIMIT 20`
        ).all().catch(() => ({ results: [] }));
        for (const row of (rs.results || [])) {
          const sent = await sendEvalSms(String(row.notify_phone), String(row.student_name || ''), row.id, row.note_ko);
          await env.DB.prepare(
            `UPDATE student_evaluations SET notify_pending = 0, parent_notified = ?, parent_notified_at = ? WHERE id = ?`
          ).bind(sent ? 1 : 0, sent ? Date.now() : null, row.id).run().catch(() => {});
        }
      } catch (e: any) { console.warn('[eval] flush err:', e?.message); }
    };

    // ── POST /api/eval/create — 강사가 평가서 작성 ──
    if (method === 'POST' && path === '/api/eval/create') {
      /* 🔐 (2026-08-28) 강사·관리자 세션 필수.
         [무엇이 뚫려 있었나] 이 경로에는 인증이 **한 줄도 없었다** — `isAdminPath` 는
         `/api/eval/…` 를 안 잡고(이 파일의 DELETE 만 2026-07-19 자가점검으로 막혔다),
         라우팅 허용목록은 «인증» 이 아니다. 무인증 POST 가 핸들러 본문까지 닿는 것을
         라이브에서 확인했다(401 이 아니라 이 아래 400 이 돌아왔다).
         그래서 아이디만 알면 서버가 **학부모 번호를 직접 찾아** 공격자가 쓴 문구로
         문자를 보냈다(발송 비용·망고아이 이름으로 나가는 메시지·가짜 평가 기록).
         [왜 이 게이트가 안전한가] 실제 호출자 셋이 전부 같은 출처 + 관리자 쿠키다 —
         teacher.html(credentials:'same-origin')·adm-q1.js·adm-r6.js(fetch 기본값 same-origin).
         ⚠️ teacher.html 의 오프라인 큐는 ok 가 아니면 큐에 남긴다 — 세션이 끊긴 동안
            일지가 사라지지 않고, 다시 로그인하면 그대로 올라간다. */
      const _ev = await checkAdminSession(request, env as any);
      if (!_ev.ok) return json({ ok: false, error: 'auth_required' }, 401);
      await ensureEvalTable();
      const body: any = await request.json().catch(() => ({}));
      if (!body.student_uid) return json({ ok: false, error: 'student_uid_required' }, 400);
      const now = Date.now();
      // 평가 점수 평균으로 종합 점수 자동 계산
      const scores = [body.score_participation, body.score_comprehension, body.score_homework, body.score_attitude, body.score_speaking]
        .filter(v => v != null && !isNaN(v))
        .map(v => Number(v));
      const overall = scores.length > 0
        ? Math.round((scores.reduce((a,b)=>a+b,0) / scores.length) * 10) / 10
        : null;
      /* 📝 수업 일지 본문 (Phase 1, 2026-08-10)
         강사는 영어로 쓰고, 학부모에게는 한국어가 나간다. 둘 다 보관한다
         (강사는 자기가 무엇을 승인했는지 영어로 되볼 수 있어야 한다).
         ⚠️ 새 테이블을 만들지 않았다 — 「수업 후에 쓰는 곳」이 이미 6군데다.
            student_evaluations 는 이미 공제 판정·학부모 발송·eval.html 열람에 배선돼 있어,
            여기에 칸을 더하는 쪽이 7번째 테이블을 만드는 것보다 훨씬 적게 부순다. */
      const noteEn = String(body.note_en || '').trim().slice(0, 2000) || null;
      const noteKo = String(body.note_ko || '').trim().slice(0, 2000) || null;
      const noteChips = Array.isArray(body.chips) ? body.chips.slice(0, 8).map((c: any) => String(c).slice(0, 40)).join('|') : null;

      /* 🔴 발송 전 자동 점검 — 매니저 승인 단계를 두지 않기로 했으므로(사장님 결정)
            사고는 규칙이 막는다. 화면에서도 같은 검사를 하지만 **서버가 정본**이다.
            차단은 «학부모에게 나가면 사고인 것» 만 — 어투 지적은 화면에서 권고로 끝낸다. */
      if (body.notify_parent === true && noteKo) {
        const hangul = (noteKo.match(/[가-힣]/g) || []).length;
        if (hangul < noteKo.length * 0.3) {
          return json({
            ok: false, error: 'note_not_korean',
            message: '학부모에게 나가는 칸이 한국어가 아닙니다. 「다듬어서 한국어로」를 먼저 눌러 주세요.',
            message_en: 'The parent-facing text is not Korean. Tap “Polish & translate” first.',
          }, 400);
        }
      }

      const ins = await env.DB.prepare(
        `INSERT INTO student_evaluations (user_id, eval_at, student_uid, student_name, teacher_uid, teacher_name, room_id, lesson_title, lesson_date,
          score_participation, score_comprehension, score_homework, score_attitude, score_speaking, score_overall,
          strengths, improvements, next_goals, teacher_comment, note_en, note_ko, note_chips, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        body.student_uid, now,
        body.student_uid, body.student_name || null,
        body.teacher_uid || null, body.teacher_name || null,
        body.room_id || null, body.lesson_title || null,
        body.lesson_date || new Date().toISOString().slice(0,10),
        body.score_participation || null, body.score_comprehension || null,
        body.score_homework || null, body.score_attitude || null,
        body.score_speaking || null, overall,
        body.strengths || null, body.improvements || null,
        body.next_goals || null, body.teacher_comment || null,
        noteEn, noteKo, noteChips,
        now, now
      ).run();
      const evalId = ins?.meta?.last_row_id;

      /* 🌱 (2026-08-24) 밴드 태그 — 강사가 이번 일지에서 새싹/자람/열매를 골랐으면
         그 학생의 students_erp 행에 저장해 다음 수업부터 이어진다. 화이트리스트만
         받는다(모르는 값은 조용히 버림 — CLAUDE.md 「서버가 아는 값 목록」 함정과 같은 방어).
         평가 저장 자체를 막을 이유는 아니라 실패해도 무시한다. */
      if (body.student_uid && ['sprout', 'grow', 'fruit'].includes(String(body.band || ''))) {
        await env.DB.prepare(
          `UPDATE students_erp SET eval_band = ? WHERE user_id = ? OR login_id = ?`
        ).bind(String(body.band), body.student_uid, body.student_uid).run().catch(() => {});
      }

      /* 📲 학부모 발송 (2026-08-09 개편)
         · 번호가 body 에 실려 오면 그대로 쓰고(기존 호출부 호환),
           없으면 `notify_parent: true` 일 때만 서버가 students_erp 에서 찾는다.
           ⚠️ 기본값을 «찾아서 보냄» 으로 두지 않는 이유: 이 엔드포인트는 관리자 화면
              (adm-q1.js·adm-r6.js)에서도 불린다. 기본 발송으로 바꾸면 관리자가 평가를
              저장할 때마다 학부모에게 문자가 나간다. 강사 화면만 명시적으로 켠다.
         · 밤이면 보내지 않고 미뤄 둔다(위 야간 규칙). */
      let notifyResult: any = null;
      let phones: string[] = [body.parent_phone, body.student_phone].filter(Boolean).map((p: any) => String(p));
      if (!phones.length && body.notify_parent === true) {
        const found = await lookupParentPhone(String(body.student_uid || ''));
        if (found) phones = [found];
      }
      if (phones.length) {
        if (isQuietHour()) {
          // 🌙 저장만 하고 아침에 보낸다 — 화면에는 «예약» 으로 표시된다.
          await env.DB.prepare(
            `UPDATE student_evaluations SET notify_pending = 1, notify_phone = ? WHERE id = ?`
          ).bind(phones[0], evalId).run().catch(() => {});
          notifyResult = { deferred: true, reason: 'quiet_hours', sent: [], failed: [] };
        } else {
          notifyResult = { sent: [] as string[], failed: [] as any[] };
          for (const phone of phones) {
            const okSent = await sendEvalSms(phone, String(body.student_name || ''), evalId, noteKo);
            if (okSent) notifyResult.sent.push(phone); else notifyResult.failed.push({ phone });
          }
          if (notifyResult.sent.length > 0) {
            await env.DB.prepare(`UPDATE student_evaluations SET parent_notified=1, parent_notified_at=? WHERE id=?`).bind(now, evalId).run().catch(() => {});
          }
        }
      }
      // 밤에 밀어 둔 것이 있으면 이 참에 함께 내보낸다(조용한 시간이면 아무것도 안 함).
      await flushPendingEvalNotifies();
      // 🆕 Web Push 도 함께 (학생/학부모 user_id 가 있으면)
      const pushTitle = `📝 ${body.student_name || '학생'}님의 평가서 도착!`;
      // 별점 기본값이 없어져(2026-08-24 1단계) 아무것도 안 고르면 overall 이 null 이다 —
      // 그때는 점수 문구를 아예 빼고, 만점 표기도 실제 척도(5점)로 맞춘다(예전 «/10» 은 오기).
      const pushBody = overall != null ? `종합 점수 ${overall}/5. 자세히 보기 클릭` : '자세히 보기 클릭';
      const pushUrl = `/eval.html?id=${evalId}`;
      const pushTag = `eval-${evalId}`;
      const pushResults: any[] = [];
      if (body.student_uid) pushResults.push({ role: 'student', ...(await sendPushToUser(env, body.student_uid, pushTitle, pushBody, pushUrl, pushTag)) });
      if (body.parent_uid) pushResults.push({ role: 'parent', ...(await sendPushToUser(env, body.parent_uid, pushTitle, pushBody, pushUrl, pushTag)) });
      // 🎮 배지는 parent.html / mypage 에서 페이지 로드 시 /api/badges/check 호출로 자동 갱신
      return json({ ok: true, id: evalId, overall, notify: notifyResult, push: pushResults });
    }

    // ── GET /api/eval/list?uid=X&role=student|parent|teacher — 평가서 목록 ──
    if (method === 'GET' && path === '/api/eval/list') {
      await ensureEvalTable();
      const uid = (url.searchParams.get('uid') || '').trim();
      const role = (url.searchParams.get('role') || 'student').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 [PII] 본인 평가만 — 토큰 uid 일치 요구(남의 평가서 목록 열람 차단, IDOR).
      //   학부모는 password 보호된 /api/parent/dashboard 로 평가를 봄(이 경로는 본인 토큰 필요).
      const evAuthUid = await authUidGlobal(request, url, env);
      if (!evAuthUid || evAuthUid !== uid) {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 본인 평가만 조회할 수 있습니다.' }, 401);
      }
      const col = role === 'teacher' ? 'teacher_uid' : 'student_uid';
      const rs = await env.DB.prepare(
        `SELECT id, student_name, teacher_name, lesson_title, lesson_date, score_overall, created_at, parent_notified, viewed_by_parent
           FROM student_evaluations
          WHERE ${col} = ?
          ORDER BY created_at DESC
          LIMIT 50`
      ).bind(uid).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ── GET /api/eval/:id — 평가서 단건 조회 (학부모/학생 페이지에서 사용) ──
    if (method === 'GET' && /^\/api\/eval\/\d+$/.test(path)) {
      await ensureEvalTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const row: any = await env.DB.prepare(`SELECT * FROM student_evaluations WHERE id=?`).bind(id).first();
      if (!row) return json({ ok: false, error: 'not_found' }, 404);
      // 🔐 [PII] 본인 평가 또는 관리자만 — 평가서(교사코멘트·신원) 정수 id 열거 IDOR 차단. [공용 헬퍼, strict=게스트 미허용]
      const evScope = await resolveOwnerScope(request, url, env as any, String(row.student_uid || ''));
      if (!['admin', 'self'].includes(evScope)) {
        return json({ ok: false, error: 'auth_required' }, 401);
      }
      // 학부모(서명토큰 = self)가 본 적 없으면 view 기록.
      // ⚠️ 강사·관리자 세션(admin)의 확인 열람까지 찍으면 «학부모 열람함» 신호가
      //    거짓이 된다 — 강사 포털 «내가 쓴 일지» 카드가 이 칸을 그대로 보여준다.
      if (evScope === 'self' && !row.viewed_by_parent) {
        await env.DB.prepare(`UPDATE student_evaluations SET viewed_by_parent=1, viewed_at=? WHERE id=?`).bind(Date.now(), id).run();
      }
      return json({ ok: true, eval: row });
    }

    // ── DELETE /api/eval/:id — 평가서 삭제 (강사/관리자) ──
    if (method === 'DELETE' && /^\/api\/eval\/\d+$/.test(path)) {
      await ensureEvalTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      // 🔐 [무결성/파괴] 관리자·강사(관리자 세션 쿠키)만 삭제 — 무인증 임의 삭제(정수 id 열거로 전체 평가서 삭제) 차단.
      //   (2026-07-19 self-pentest 발견: 바로 위 GET 은 인증됐으나 DELETE 는 게이트 누락돼 있었음)
      //   호출부 adm-r6.js 는 관리자 콘솔(same-origin)이라 세션 쿠키가 자동 전송됨.
      const edAdmin = await checkAdminSession(request, env as any);
      if (!edAdmin.ok) return json({ ok: false, error: 'auth_required', message: '관리자만 삭제할 수 있습니다.' }, 401);
      await env.DB.prepare(`DELETE FROM student_evaluations WHERE id=?`).bind(id).run();
      return json({ ok: true, id, deleted: true });
    }

    // ── GET /api/admin/eval/list — 관리자: 전체 평가서 목록 + 통계 ──
    if (method === 'GET' && path === '/api/admin/eval/list') {
      await ensureEvalTable();
      const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10)));
      const rs = await env.DB.prepare(
        `SELECT * FROM student_evaluations ORDER BY created_at DESC LIMIT ?`
      ).bind(limit).all();
      // 통계 계산
      const month_start = new Date(); month_start.setDate(1); month_start.setHours(0,0,0,0);
      const stats: any = await env.DB.prepare(
        `SELECT COUNT(*) AS total, AVG(score_overall) AS avg_score,
                SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS this_month,
                SUM(parent_notified) AS notified,
                SUM(viewed_by_parent) AS viewed
           FROM student_evaluations`
      ).bind(month_start.getTime()).first();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [], stats });
    }

    // ═══════════════════════════════════════════════════════════════
    // 📝 Phase E1 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 📚 Phase BE — 강사 일괄 평가서 작성
    // ═══════════════════════════════════════════════════════════════

    // ── POST /api/eval/bulk-create — N명에게 한꺼번에 평가서 작성 ──
    //   body: { teacher_uid, teacher_name, lesson_date, lesson_title, common: {...공통항목}, students: [{ student_uid, student_name, scores: {...}, comments }] }
    if (method === 'POST' && path === '/api/eval/bulk-create') {
      const ensureEval = async () => {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, teacher_uid TEXT, teacher_name TEXT, room_id TEXT, lesson_title TEXT, lesson_date TEXT, score_participation INTEGER, score_comprehension INTEGER, score_homework INTEGER, score_attitude INTEGER, score_speaking INTEGER, score_overall INTEGER, strengths TEXT, improvements TEXT, next_goals TEXT, teacher_comment TEXT, parent_notified INTEGER DEFAULT 0, parent_notified_at INTEGER, viewed_by_parent INTEGER DEFAULT 0, viewed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      };
      // 🔐 (2026-08-28) /api/eval/create 와 같은 구멍 — 호출자는 관리자 콘솔(adm-r3.js) 하나뿐이다.
      const _bk = await checkAdminSession(request, env as any);
      if (!_bk.ok) return json({ ok: false, error: 'auth_required' }, 401);
      await ensureEval();
      const body: any = await request.json().catch(() => ({}));
      const students = Array.isArray(body.students) ? body.students : [];
      if (!students.length) return json({ ok: false, error: 'no_students' }, 400);
      /* ⚠️ 건수 상한 — 아래 루프가 학생 1명당 INSERT 를 하나씩 «순차로» await 한다.
         상한이 없으면 큰 배열 하나로 Worker 의 subrequest·CPU 한도를 넘겨 중간에 죽고,
         그때까지 들어간 행만 남는다(실패는 failed[] 로 삼켜져 응답은 ok:true 였다).
         한 반 인원을 훨씬 넘는 값으로 잡는다 — 정상 사용을 막지 않는 선. */
      if (students.length > 60) {
        return json({ ok: false, error: 'too_many_students',
          message: '한 번에 60명까지만 작성할 수 있습니다. 나눠서 저장해 주세요.' }, 400);
      }
      const common = body.common || {};
      const now = Date.now();
      const created: any[] = [];
      const failed: any[] = [];
      for (const s of students) {
        try {
          const sc = s.scores || {};
          const scores = [sc.participation, sc.comprehension, sc.homework, sc.attitude, sc.speaking]
            .filter(v => v != null && !isNaN(v)).map(Number);
          const overall = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
          const ins = await env.DB.prepare(
            `INSERT INTO student_evaluations (student_uid, student_name, teacher_uid, teacher_name, lesson_title, lesson_date, score_participation, score_comprehension, score_homework, score_attitude, score_speaking, score_overall, strengths, improvements, next_goals, teacher_comment, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
          ).bind(
            s.student_uid, s.student_name || null,
            body.teacher_uid || null, body.teacher_name || null,
            body.lesson_title || null, body.lesson_date || null,
            sc.participation ?? null, sc.comprehension ?? null, sc.homework ?? null, sc.attitude ?? null, sc.speaking ?? null,
            overall,
            s.strengths || common.strengths || null,
            s.improvements || common.improvements || null,
            s.next_goals || common.next_goals || null,
            s.teacher_comment || common.teacher_comment || null,
            now, now
          ).run();
          created.push({ student_uid: s.student_uid, id: ins?.meta?.last_row_id, overall });
        } catch (e: any) {
          failed.push({ student_uid: s.student_uid, error: e?.message });
        }
      }
      return json({ ok: true, total: students.length, created: created.length, failed: failed.length, items: { created, failed } });
    }

    // ═══════════════════════════════════════════════════════════════
    // 📚 Phase BE 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 📅 Phase CAL — 캘린더 (교사 휴가 + 한국/필리핀 공휴일)
    //   · 추가/시드 시 community_posts(공지사항 + 최신 알림 피드)에 자동 등록
    //   · 자동 색상: 휴가=주황, 한국 공휴일=빨강, 필리핀 공휴일=파랑
    // ═══════════════════════════════════════════════════════════════
    const ensureCalendarTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS calendar_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, title TEXT NOT NULL, date TEXT NOT NULL, end_date TEXT, country TEXT, teacher_id TEXT, teacher_name TEXT, color TEXT, note TEXT, source TEXT DEFAULT 'manual', created_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_cal_date ON calendar_events(date);`); } catch {}
    };
    const calColor = (type: string, country?: string | null): string => {
      if (type === 'vacation') return '#f59e0b';
      if (country === 'PH') return '#3b82f6';
      return '#ef4444';
    };
    const calPost = async (title: string, body: string) => {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS community_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, author TEXT, pinned INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
        const now = Date.now();
        await env.DB.prepare(`INSERT INTO community_posts (title, body, author, pinned, created_at, updated_at) VALUES (?,?,?,?,?,?)`)
          .bind(title, body, '📅 캘린더', 0, now, now).run();
      } catch {}
    };
    // 2026 공휴일 내장 (출처: 대한민국 관공서 공휴일 / 필리핀 Proclamation No. 1006)
    const HOLIDAYS_2026: Record<string, Array<[string, string]>> = {
      KR: [
        ['2026-01-01', '신정'],
        ['2026-02-16', '설날 연휴'], ['2026-02-17', '설날'], ['2026-02-18', '설날 연휴'],
        ['2026-03-01', '삼일절'], ['2026-03-02', '대체공휴일(삼일절)'],
        ['2026-05-05', '어린이날'],
        ['2026-05-24', '부처님오신날'], ['2026-05-25', '대체공휴일(부처님오신날)'],
        ['2026-06-06', '현충일'],
        ['2026-08-15', '광복절'], ['2026-08-17', '대체공휴일(광복절)'],
        ['2026-09-24', '추석 연휴'], ['2026-09-25', '추석'], ['2026-09-26', '추석 연휴'],
        ['2026-10-03', '개천절'], ['2026-10-05', '대체공휴일(개천절)'],
        ['2026-10-09', '한글날'],
        ['2026-12-25', '크리스마스'],
      ],
      PH: [
        ['2026-01-01', "New Year's Day"],
        ['2026-02-17', 'Chinese New Year'],
        ['2026-04-02', 'Maundy Thursday'], ['2026-04-03', 'Good Friday'], ['2026-04-04', 'Black Saturday'],
        ['2026-04-09', 'Araw ng Kagitingan'],
        ['2026-05-01', 'Labor Day'],
        ['2026-06-12', 'Independence Day'],
        ['2026-08-21', 'Ninoy Aquino Day'], ['2026-08-31', 'National Heroes Day'],
        ['2026-11-01', "All Saints' Day"], ['2026-11-02', "All Souls' Day"], ['2026-11-30', 'Bonifacio Day'],
        ['2026-12-08', 'Immaculate Conception'], ['2026-12-24', 'Christmas Eve'],
        ['2026-12-25', 'Christmas Day'], ['2026-12-30', 'Rizal Day'], ['2026-12-31', 'Last Day of the Year'],
      ],
    };

    // ── GET /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD (공개: 캘린더/학생 표시용) ──
    if (method === 'GET' && path === '/api/calendar/events') {
      await ensureCalendarTable();
      const from = (url.searchParams.get('from') || '').trim();
      const to = (url.searchParams.get('to') || '').trim();
      let q = `SELECT * FROM calendar_events`; const binds: any[] = [];
      if (from && to) { q += ` WHERE date <= ? AND COALESCE(end_date, date) >= ?`; binds.push(to, from); }
      q += ` ORDER BY date ASC, id ASC`;
      const rs = await env.DB.prepare(q).bind(...binds).all();
      return json({ ok: true, events: rs.results || [] });
    }

    // ── POST /api/admin/calendar/events (모든 관리자) — 단건 추가 (휴가/공휴일) ──
    if (method === 'POST' && path === '/api/admin/calendar/events') {
      await ensureCalendarTable();
      const b: any = await request.json().catch(() => ({}));
      const type = (b.event_type === 'holiday') ? 'holiday' : 'vacation';
      const title = (b.title || '').toString().trim();
      const date = (b.date || '').toString().trim();
      if (!title || !date) return json({ ok: false, error: 'title_and_date_required' }, 400);
      const end_date = (b.end_date || '').toString().trim() || null;
      const country = (b.country || '').toString().trim() || null;
      const teacher_name = (b.teacher_name || '').toString().trim() || null;
      const note = (b.note || '').toString().trim() || null;
      const color = (b.color || '').toString().trim() || calColor(type, country);
      const now = Date.now();
      const ins = await env.DB.prepare(`INSERT INTO calendar_events (event_type,title,date,end_date,country,teacher_id,teacher_name,color,note,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(type, title, date, end_date, country, null, teacher_name, color, note, 'manual', now).run();
      const span = (end_date && end_date !== date) ? `${date} ~ ${end_date}` : date;
      const label = (type === 'vacation')
        ? `🏖 교사 휴가 — ${teacher_name ? teacher_name + ' ' : ''}${title}`
        : `📅 공휴일 — ${title}${country ? ' (' + country + ')' : ''}`;
      await calPost(label, `${span}${note ? '\n' + note : ''}`);
      return json({ ok: true, id: (ins as any).meta?.last_row_id, color });
    }

    // ── DELETE /api/admin/calendar/events/:id ──
    if (method === 'DELETE' && /^\/api\/admin\/calendar\/events\/\d+$/.test(path)) {
      await ensureCalendarTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.prepare(`DELETE FROM calendar_events WHERE id=?`).bind(id).run();
      return json({ ok: true });
    }

    // ── POST /api/admin/calendar/seed-holidays — 2026 한국/필리핀 공휴일 일괄 등록(중복 자동 skip) ──
    if (method === 'POST' && path === '/api/admin/calendar/seed-holidays') {
      await ensureCalendarTable();
      const b: any = await request.json().catch(() => ({}));
      const countries: string[] = (Array.isArray(b.countries) && b.countries.length) ? b.countries : ['KR', 'PH'];
      const now = Date.now();
      let added = 0;
      for (const c of countries) {
        const list = HOLIDAYS_2026[c]; if (!list) continue;
        for (const [date, name] of list) {
          const exists: any = await env.DB.prepare(`SELECT id FROM calendar_events WHERE event_type='holiday' AND date=? AND country=? AND title=?`).bind(date, c, name).first();
          if (exists) continue;
          await env.DB.prepare(`INSERT INTO calendar_events (event_type,title,date,end_date,country,teacher_id,teacher_name,color,note,source,created_at) VALUES ('holiday',?,?,?,?,?,?,?,?,'seed',?)`)
            .bind(name, date, null, c, null, null, calColor('holiday', c), null, now).run();
          added++;
        }
      }
      if (added > 0) await calPost(`📅 2026 공휴일 ${added}건 자동 등록`, `${countries.join('/')} 공휴일이 캘린더에 추가되었습니다.`);
      return json({ ok: true, added });
    }


    // ═══════════════════════════════════════════════════════════════
    // 🎙 Phase ALR — AI 학습 리포트 (수업 녹음 STT + LLM 분석)
    //   기존 Phase E1~E4 (수동 평가서) + Phase AEd (키워드 기반 AI 초안) 통합 업그레이드
    //   - 수업 녹음(R2) → Whisper STT → Llama 분석
    //   - 문법 오류 / Alternative 표현 / 다빈도 단어 / 강점·약점
    //   - student_evaluations 테이블과 자동 연동 (강사가 검토 후 발송)
    // ═══════════════════════════════════════════════════════════════
    const ensureAiLessonReportSchema = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS ai_lesson_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, evaluation_id INTEGER, student_uid TEXT, student_name TEXT, teacher_uid TEXT, teacher_name TEXT, recording_id TEXT, recording_url TEXT, lesson_title TEXT, lesson_date TEXT, transcript TEXT, transcript_excerpt TEXT, grammar_errors TEXT, alternatives TEXT, word_freq TEXT, summary_ko TEXT, strengths TEXT, weaknesses TEXT, next_goals TEXT, overall_score INTEGER, speaking_seconds INTEGER, total_words INTEGER, status TEXT DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER);`);
    };

    // ── POST /api/eval/ai-lesson-report — 녹음 파일에서 AI 학습 리포트 자동 생성 ──
    //   body: { recording_id?, recording_url?, audio_base64?, student_uid, student_name?,
    //           teacher_uid?, teacher_name?, lesson_title?, lesson_date?, auto_save?=true }
    if (method === 'POST' && path === '/api/eval/ai-lesson-report') {
      /* 🔐 (2026-08-28) 조회 두 경로(/list, /:id)는 2026-07-10 PII 감사로 잠갔는데
         **정작 일을 하는 POST 는 빠져 있었다.** 무인증으로 Whisper 전사 + 70B 모델 호출을
         무제한 돌릴 수 있었고(호출마다 비용), 아무 학생 아이디로 «AI 가 쓴 평가» 행을
         그 학생 기록에 남길 수 있었다. 호출자는 관리자 콘솔·참관 화면뿐이라 세션이 있다. */
      const _ai = await checkAdminSession(request, env as any);
      if (!_ai.ok) return json({ ok: false, error: 'auth_required' }, 401);
      await ensureAiLessonReportSchema();
      const b: any = await request.json().catch(() => ({}));
      const studentUid = String(b.student_uid || '').trim();
      if (!studentUid) return json({ ok: false, error: 'student_uid_required' }, 400);
      if (!env.AI) return json({ ok: false, error: 'AI_binding_missing' }, 503);

      // 1) 녹음 → STT
      //   ⭐ 정상 경로는 «클라이언트가 미리 잘라 전사해서 transcript 로 보내는» 쪽이다.
      //      (adm-r4.js 머리 주석 참고 — 브라우저에서 16kHz 모노 60초 조각으로 나눠 전사한다)
      //      아래 서버 STT 는 짧은 클립용 보조 경로로만 남긴다.
      let transcript = String(b.transcript || '').trim();  // 클라이언트가 미리 STT 했으면 사용
      //   ⏱ 발화 길이는 클라이언트가 실제 오디오 길이를 알고 있다. 주면 그걸 쓴다
      //      (서버 STT 는 word_count 로 «추정» 할 수밖에 없어 늘 부정확했다)
      let speakingSeconds = Math.max(0, Math.round(Number(b.speaking_seconds) || 0));
      if (!transcript) {
        // R2 에서 녹음 파일 가져오기
        let audioBuf: ArrayBuffer | null = null;
        try {
          if (b.recording_id && (env as any).RECORDINGS) {
            const obj: any = await (env as any).RECORDINGS.get(b.recording_id);
            if (obj) audioBuf = await obj.arrayBuffer();
          } else if (b.recording_url) {
            const r = await fetch(b.recording_url);
            if (r.ok) audioBuf = await r.arrayBuffer();
          } else if (b.audio_base64) {
            const raw = atob(b.audio_base64.replace(/^data:[^,]+,/, ''));
            const arr = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
            audioBuf = arr.buffer;
          }
        } catch (e: any) { console.error('[ai-lesson-report] fetch audio:', e?.message); }

        if (!audioBuf || audioBuf.byteLength < 1000) {
          return json({ ok: false, error: 'audio_not_found_or_too_small', message: '녹음 파일을 가져올 수 없어요. recording_id, recording_url, audio_base64, transcript 중 하나가 필요합니다.' }, 400);
        }
        /* 📏 (2026-08-08 라이브 실측) 서버 직접 전사의 실제 한계.
              🪤 사인파로 재면 3.66MB 부터 «3006: Request is too large» 가 떠서 천장이
                 3MB 인 것처럼 보인다. 아니다 — 같은 크기의 **실제 말소리는 통과한다**
                 (톤 9.16MB ❌ 3회 / 말소리 9.83MB ✅ 3회, 번갈아 재현).
                 톤은 Whisper 가 무한 반복하다 안에서 터지는 것이고 문구만 크기 얘기처럼 생겼다.
              실제 말소리 실측: 14.18MB(7.7분) 21.6초 ✅ · 19.5MB(10.7분) 46초 ✅ · 23.05MB(12.6분) 45초 ✅
              → 25MB 는 근거 있는 선이다(api-games 의 /api/voice/transcribe 와 같은 값).
              단, 이 경로는 **짧은 클립용 보조**다. 45분 수업은 base64 가 ×1.37 로 부풀어
              Cloudflare 본문 상한 100MB 에 먼저 걸린다 → 브라우저 분할 전사(adm-r4.js)가 정본. */
        const STT_MAX = 25 * 1024 * 1024;
        if (audioBuf.byteLength > STT_MAX) {
          return json({
            ok: false, error: 'audio_too_large',
            message: `오디오 ${(audioBuf.byteLength / 1048576).toFixed(1)}MB — 서버 직접 전사는 25MB(약 13분)까지입니다. 관리자 화면의 [🚀 AI 리포트 자동 생성] 을 쓰면 긴 수업도 브라우저에서 60초 조각으로 나눠 전사합니다.`,
            message_en: `Audio is ${(audioBuf.byteLength / 1048576).toFixed(1)}MB — direct server transcription caps at 25MB (~13 min). Use [🚀 Generate AI Report] in the admin UI; it splits long lessons into 60s chunks in the browser.`,
            max_bytes: STT_MAX,
          }, 400);
        }

        try {
          // whisper-large-v3-turbo 는 base64 문자열을 받고 언어 힌트를 지원한다.
          // 구 whisper 는 오디오를 «숫자 배열» 로 보내야 해서 JSON 이 4배로 부푼다 = 천장이 더 낮다.
          // → turbo 를 먼저 쓰고, 실패할 때만 구 whisper 로 내려간다.
          const langMap: Record<string, string> = { en: 'en', ko: 'ko', zh: 'zh', 'zh-cn': 'zh' };
          const sttLang = langMap[String(b.lang || 'en').trim().toLowerCase()] || 'en';
          const bytes = new Uint8Array(audioBuf);
          let binary = '';
          const CHUNK = 0x8000;
          for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
          }
          let sttResp: any = null;
          try {
            sttResp = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
              audio: btoa(binary), language: sttLang, task: 'transcribe', vad_filter: true,
              condition_on_previous_text: false,
            });
          } catch (turboErr: any) {
            console.warn('[ai-lesson-report] turbo failed, fallback base whisper:', turboErr?.message);
            sttResp = await env.AI.run('@cf/openai/whisper', { audio: [...bytes] });
          }
          transcript = String(sttResp?.text || '').trim();
          if (!speakingSeconds) speakingSeconds = Math.round((sttResp?.word_count || 0) * 0.4);  // 대략 추정 (분당 150단어 기준)
        } catch (e: any) {
          console.error('[ai-lesson-report] whisper:', e?.message);
          return json({ ok: false, error: 'stt_failed', detail: String(e?.message || e) }, 500);
        }
      }
      if (!transcript) return json({ ok: false, error: 'empty_transcript' }, 400);

      // 2) LLM 분석
      const studentName = String(b.student_name || studentUid).trim();
      const lessonTitle = String(b.lesson_title || '').trim();

      /* 📏 (2026-08-08) 예전엔 transcript.slice(0, 6000) 하나였다.
            45분 수업 전사는 3만 자가 넘는다 → LLM 이 «앞 6분» 만 보고 리포트를 썼고,
            수업 후반부의 문법 오류·성장은 통째로 사라졌다(아무도 눈치 못 챈 조용한 손실).
            그렇다고 전부 넣으면 문맥창을 넘긴다. → 넘칠 때만 앞·중간·뒤를 고르게 뜬다. */
      const LLM_BUDGET = 18000;
      let promptBody = transcript;
      if (transcript.length > LLM_BUDGET) {
        const part = Math.floor(LLM_BUDGET / 3);
        const mid = Math.floor(transcript.length / 2 - part / 2);
        promptBody = transcript.slice(0, part)
          + '\n…(중략)…\n' + transcript.slice(mid, mid + part)
          + '\n…(중략)…\n' + transcript.slice(transcript.length - part);
      }

      const prompt = `You are an expert English coach. Analyze this Korean student's spoken English transcript from a 1:1 lesson.

Student: ${studentName}${lessonTitle ? ` · Lesson: ${lessonTitle}` : ''}

Transcript:
"""
${promptBody}
"""

Produce a comprehensive learning report. Respond in STRICT JSON only, no markdown:
{
  "overall_score": 0-100 (overall English proficiency in this session),
  "summary_ko": "이번 수업에서 ${studentName} 학생이 영어로 무엇을 해냈는지 2-3문장 (사실 + 격려)",
  "grammar_errors": [
    { "original": "<wrong sentence student said>", "corrected": "<correct version>", "reason": "한국어 설명 (1줄)" }
  ],
  "alternatives": [
    { "learned": "<phrase student used>", "better": "<more natural/advanced phrasing>", "when_to_use": "한국어 설명 (1줄)" }
  ],
  "word_freq": [{ "word": "<word>", "count": <int> }],
  "strengths": ["한국어 강점 1줄 ×3"],
  "weaknesses": ["다음에 더 잘할 수 있는 것 1줄 ×3"],
  "next_goals": ["다음 수업에서 시도할 한국어 목표 ×2-3"]
}

Limit: max 5 grammar_errors, max 5 alternatives, max 10 word_freq. Be specific and helpful.

⚠️ TWO HARD RULES — the report is sent to the student's parents in Korea.

(1) LANGUAGE — every Korean field must be **pure Korean (Hangul) only**.
    Never use Chinese characters, Kanji, or Hanja anywhere in Korean text.
    Write 과거 not 过去 · 시제 not 时制 · 관사 not 冠词 · 문법 not 语法 · 동사 not 动词.
    English words are allowed only inside "original", "corrected", "learned", "better", "word".

(2) TONE — "weaknesses" is printed to the child and the parents under the heading
    「보완할 점」. Write each line as **what the student can do better next time**,
    never as a verdict on the student. Be concrete and honest — do not inflate — but
    do not write sentences that only state a deficiency.
      ✗ 학생은 문법 오류와 어휘의 한계가 있습니다
      ✓ 과거형을 쓸 때 동사를 바꾸는 연습을 더 하면 문장이 한결 또렷해집니다
      ✗ 발음과 억양이 아직 자연스럽지 않습니다
      ✓ 문장 끝을 조금 길게 늘여 읽으면 훨씬 자연스럽게 들립니다
    Apply the same warmth to "summary_ko" and "next_goals". Name a real behaviour,
    not a label. Never compare this student to other students.`;

      let raw = '';
      const models = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast','@cf/meta/llama-3.1-8b-instruct','@cf/meta/llama-3-8b-instruct'];
      for (const m of models) {
        try {
          const resp: any = await env.AI.run(m, { messages: [{ role: 'user', content: prompt }], max_tokens: 2200, temperature: 0.3 });
          if (typeof resp === 'string') raw = resp;
          else if (resp?.response) raw = typeof resp.response === 'string' ? resp.response : JSON.stringify(resp.response);
          if (raw) break;
        } catch (e: any) { console.error('[ai-lesson-report] llm:', m, e?.message); }
      }
      const mm = raw.match(/\{[\s\S]*\}/);
      let parsed: any = {};
      try { parsed = JSON.parse(mm ? mm[0] : raw); } catch {}

      /* 🈲 (2026-08-09) 한국어 설명에 한자가 섞여 나온다 — 실측으로 잡힌 것.
            첫 샘플의 문법 사유가 «과거의 완료된 행동을 나타내는 过去형을 사용해야 합니다» 였다.
            Llama 가 한국어를 쓰다 중국어 글자를 흘린다. 이 글이 **그대로 학부모에게 간다.**
            프롬프트에 «한글만» 을 못 박았지만 LLM 지시는 확률이지 보장이 아니다 → 저장 전에 한 번 더 거른다.
            ⚠️ 영어 칸(original·corrected·learned·better·word)은 건드리지 말 것 — 교정 원문이 망가진다. */
      const HANJA_KO: Record<string, string> = {
        '过去':'과거','過去':'과거','现在':'현재','現在':'현재','未来':'미래','未來':'미래',
        '时制':'시제','時制':'시제','时态':'시제','時態':'시제','语法':'문법','語法':'문법',
        '文法':'문법','冠词':'관사','冠詞':'관사','动词':'동사','動詞':'동사','名词':'명사','名詞':'명사',
        '形容词':'형용사','形容詞':'형용사','副词':'부사','副詞':'부사','主语':'주어','主語':'주어',
        '目的语':'목적어','目的語':'목적어','单数':'단수','單數':'단수','复数':'복수','複數':'복수',
        '单词':'단어','單語':'단어','单语':'단어','句子':'문장','发音':'발음','發音':'발음',
        '表现':'표현','表現':'표현','语调':'억양','語調':'억양','英语':'영어','英語':'영어',
        '学生':'학생','學生':'학생','使用':'사용','完了':'완료','否定':'부정','疑问':'의문','疑問':'의문',
      };
      /* ⚠️ 이 정규식은 «match» 로만 쓴다. /g 정규식 하나를 만들어 test() 로 돌려 쓰면
            lastIndex 가 밀려 **두 번째 호출부터 조용히 false** 가 된다.
            그러면 한자가 든 문장이 검사만 통과해 그대로 학부모에게 간다. */
      const ideographs = (s: string) => s.match(/[㐀-䶿一-鿿豈-﫿]/g) || [];
      const deHanja = (v: any): string => {
        let s = String(v == null ? '' : v);
        if (!ideographs(s).length) return s;
        for (const [cn, ko] of Object.entries(HANJA_KO)) if (s.includes(cn)) s = s.split(cn).join(ko);
        const left = ideographs(s);
        if (left.length) {
          // 표에 없는 글자 — 지우고 띄어쓰기만 정리한다. 남겨 두는 것보다 낫다.
          console.warn('[ai-lesson-report] 표에 없는 한자:', left.join(''));
          s = s.replace(/[㐀-䶿一-鿿豈-﫿]/g, '')
               .replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
        }
        return s;
      };
      const deHanjaList = (a: any, keys: string[]): any[] =>
        (Array.isArray(a) ? a : []).map((it: any) => {
          if (typeof it === 'string') return deHanja(it);
          const o = { ...it };
          for (const k of keys) if (o[k] != null) o[k] = deHanja(o[k]);
          return o;
        });

      parsed.summary_ko = deHanja(parsed.summary_ko);
      parsed.grammar_errors = deHanjaList(parsed.grammar_errors, ['reason']);       // original·corrected 는 영어라 그대로
      parsed.alternatives   = deHanjaList(parsed.alternatives,   ['when_to_use']);  // learned·better 도 그대로
      parsed.strengths      = deHanjaList(parsed.strengths, []);
      parsed.weaknesses     = deHanjaList(parsed.weaknesses, []);
      parsed.next_goals     = deHanjaList(parsed.next_goals, []);

      // 3) 결과 정규화 + DB 저장
      const overallScore = Math.max(0, Math.min(100, Number(parsed.overall_score || 75)));
      const summaryKo = String(parsed.summary_ko || '학생의 영어 발화를 분석했습니다.');
      const grammarErrors = Array.isArray(parsed.grammar_errors) ? parsed.grammar_errors.slice(0, 8) : [];
      const alternatives = Array.isArray(parsed.alternatives) ? parsed.alternatives.slice(0, 8) : [];
      const wordFreq = Array.isArray(parsed.word_freq) ? parsed.word_freq.slice(0, 15) : [];
      const strengthsArr = Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5) : [];
      const weaknessesArr = Array.isArray(parsed.weaknesses) ? parsed.weaknesses.slice(0, 5) : [];
      const nextGoalsArr = Array.isArray(parsed.next_goals) ? parsed.next_goals.slice(0, 5) : [];

      const transcriptWords = transcript.split(/\s+/).filter(Boolean).length;
      const excerpt = transcript.slice(0, 800);
      const now = Date.now();

      // student_evaluations 자동 저장 (기존 평가서 시스템과 연동)
      let evaluationId: number | null = null;
      if (b.auto_save !== false) {
        try {
          await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, teacher_uid TEXT, teacher_name TEXT, room_id TEXT, lesson_title TEXT, lesson_date TEXT, score_participation INTEGER, score_comprehension INTEGER, score_homework INTEGER, score_attitude INTEGER, score_speaking INTEGER, score_overall INTEGER, strengths TEXT, improvements TEXT, next_goals TEXT, teacher_comment TEXT, parent_notified INTEGER DEFAULT 0, parent_notified_at INTEGER, viewed_by_parent INTEGER DEFAULT 0, viewed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
          const r: any = await env.DB.prepare(
            `INSERT INTO student_evaluations (student_uid, student_name, teacher_uid, teacher_name, lesson_title, lesson_date, score_overall, score_speaking, strengths, improvements, next_goals, teacher_comment, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
          ).bind(
            studentUid, studentName, String(b.teacher_uid || '').trim() || null, String(b.teacher_name || '').trim() || null,
            lessonTitle || null, String(b.lesson_date || '').trim() || new Date(now).toISOString().slice(0,10),
            overallScore, overallScore,
            strengthsArr.join('\n'), weaknessesArr.join('\n'), nextGoalsArr.join('\n'),
            summaryKo + (grammarErrors.length ? '\n\n[🤖 AI 자동 분석] 문법교정 ' + grammarErrors.length + '건, 대안표현 ' + alternatives.length + '건 발견. 상세 리포트는 AI 학습 리포트 메뉴에서 확인하세요.' : ''),
            now, now
          ).run();
          evaluationId = r.meta?.last_row_id || null;
        } catch (e: any) { console.error('[ai-lesson-report] save eval:', e?.message); }
      }

      let reportId: number | null = null;
      try {
        const r: any = await env.DB.prepare(
          `INSERT INTO ai_lesson_reports (evaluation_id, student_uid, student_name, teacher_uid, teacher_name, recording_id, recording_url, lesson_title, lesson_date, transcript, transcript_excerpt, grammar_errors, alternatives, word_freq, summary_ko, strengths, weaknesses, next_goals, overall_score, speaking_seconds, total_words, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          evaluationId, studentUid, studentName,
          String(b.teacher_uid || '').trim() || null, String(b.teacher_name || '').trim() || null,
          String(b.recording_id || '').trim() || null, String(b.recording_url || '').trim() || null,
          lessonTitle || null, String(b.lesson_date || '').trim() || new Date(now).toISOString().slice(0,10),
          transcript, excerpt,
          JSON.stringify(grammarErrors), JSON.stringify(alternatives), JSON.stringify(wordFreq),
          summaryKo, JSON.stringify(strengthsArr), JSON.stringify(weaknessesArr), JSON.stringify(nextGoalsArr),
          overallScore, speakingSeconds, transcriptWords, 'draft', now, now
        ).run();
        reportId = r.meta?.last_row_id || null;
      } catch (e: any) { console.error('[ai-lesson-report] save report:', e?.message); }

      return json({
        ok: true, report_id: reportId, evaluation_id: evaluationId,
        overall_score: overallScore, summary_ko: summaryKo,
        grammar_errors: grammarErrors, alternatives, word_freq: wordFreq,
        strengths: strengthsArr, weaknesses: weaknessesArr, next_goals: nextGoalsArr,
        transcript_excerpt: excerpt, total_words: transcriptWords, speaking_seconds: speakingSeconds,
      });
    }

    // ── GET /api/eval/ai-lesson-report/list?student_uid=... ──
    if (method === 'GET' && path === '/api/eval/ai-lesson-report/list') {
      await ensureAiLessonReportSchema();
      const sid = String(url.searchParams.get('student_uid') || '').trim();
      let q = `SELECT id, student_uid, student_name, teacher_name, lesson_title, lesson_date, overall_score, total_words, speaking_seconds, status, created_at FROM ai_lesson_reports`;
      const binds: any[] = [];
      if (sid) { q += ` WHERE student_uid = ?`; binds.push(sid); }
      q += ` ORDER BY created_at DESC LIMIT 100`;
      const rs: any = await env.DB.prepare(q).bind(...binds).all();
      return json({ ok: true, items: rs.results || [] });
    }

    // ── GET /api/eval/ai-lesson-report/:id ──
    const reportIdMatch = path.match(/^\/api\/eval\/ai-lesson-report\/(\d+)$/);
    if (method === 'GET' && reportIdMatch) {
      await ensureAiLessonReportSchema();
      const id = parseInt(reportIdMatch[1], 10);
      const row: any = await env.DB.prepare(`SELECT * FROM ai_lesson_reports WHERE id = ?`).bind(id).first();
      if (!row) return json({ ok: false, error: 'not_found' }, 404);
      // JSON 필드 파싱
      ['grammar_errors','alternatives','word_freq','strengths','weaknesses','next_goals'].forEach(k => {
        try { row[k] = JSON.parse(row[k] || '[]'); } catch { row[k] = []; }
      });
      return json({ ok: true, item: row });
    }
    // ═══════════════════════════════════════════════════════════════
    // 🎙 Phase ALR 끝
    // ═══════════════════════════════════════════════════════════════

  return null;  // 이 도메인 라우트가 아님 → 호출측이 기존 라우팅 계속
}
