/** payments: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { json } from './api-util';
import { sendPaymentOverdueAlert, sendClassRenewalAlert, buildClassRenewalText, CLASS_RENEWAL_FROM_PHONE } from './solapi-client';
import { issueRenewLink } from './renew-link';
import { sendPushToUser } from './api-notify';
import { studentScopeWhere } from './scope';
import { handlePaymentsBoardApi } from './payments-board';

export async function handleAdminPaymentsApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;



    // ═══════════════════════════════════════════════════════════════
    // 💰 Phase F1~F2 — 수강료 미납 자동 알림
    // ═══════════════════════════════════════════════════════════════

    const ensurePaymentTables = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER, period_start TEXT, period_end TEXT, amount_krw INTEGER NOT NULL, method TEXT, memo TEXT, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS payment_overdue_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, days_overdue INTEGER, amount_krw INTEGER, parent_phone TEXT, status TEXT, error_message TEXT, sent_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_overdue_user ON payment_overdue_log(user_id, sent_at DESC);`); } catch {}
      // 🔁 (2026-08-18) B2C «미연장» 분리 — 이력에서도 미납/미연장을 구분해 보여 준다.
      //    ALTER 는 이미 있으면 에러라 통째로 삼킨다(추가만 하므로 기존 행은 그대로).
      try { await env.DB.exec(`ALTER TABLE payment_overdue_log ADD COLUMN channel TEXT`); } catch {}
      try { await env.DB.exec(`ALTER TABLE payment_overdue_log ADD COLUMN last_class_at INTEGER`); } catch {}
    };

    /* ═══════════════════════════════════════════════════════════════
       🔁 B2C «미연장» 판정 도우미 (2026-08-18 사장님 지시)

       사장님 말씀: 「B2C(개인 결제) 회원은 결제한 만큼만 수업이 나가는 구조라
                    «미납» 이 아니라 «미연장» 이 맞는 표현이다.」

       그래서 이 아래 세 가지가 필요하다.
        ① 학생이 B2C 인지 아는 법
           결제 행에는 구분값이 없다. 정본은 «대리점 관리»의 지정값 centers.payment_type 이고,
           학생 → 대리점 연결은 students_erp.shop_name = centers.name 이다.
           (payments-board.ts·accounting-reports.ts 의 결제 목록이 쓰는 것과 같은 규칙.)
           ⚠️ students_erp.payment_type 은 2026-08-18 기준 29,398행 **전부 NULL** 이라
              혼자서는 못 쓴다. 그래도 나중에 채워질 수 있으니 보조 판정으로 남긴다.
           ⚠️ centers.name 은 유일하지 않다(2장 함정). 그래서 JOIN 대신 «B2C 대리점 이름 집합»
              을 한 번 받아 와 메모리에서 맞춘다 — 행 뻥튀기도 없고 D1 읽기도 싸다.
              (상관 서브쿼리로 하면 같은 판정에 1,900만 행을 읽는다. 실측함.)

        ② 마지막 수업일
           «결제한 만큼 수업이 나간다» 니까 마지막 결제일 + 한 달이 수업 종료일이다.
           원부의 end_date 가 그보다 뒤면 그쪽이 더 정확하므로 그걸 쓴다
           (실측: end_date 는 2020년에 멈춘 옛 값이 많아 그냥 믿으면 안 된다).

        ③ 「1개월 넘게 안 돌아온 사람은 빼기」
           수업이 끝난 지 RENEW_WINDOW_DAYS(기본 30일)를 넘으면 연장 가능성이 낮다고 보고
           명단에서 제외한다. 세어서 보여는 주되, 문자는 보내지 않는다.
       ═══════════════════════════════════════════════════════════════ */
    const CLASS_TERM_DAYS = 30;          // 1회 결제로 나가는 수업 기간(한 달)
    const DEFAULT_RENEW_WINDOW_DAYS = 30; // 수업 종료 후 이 기간 안쪽만 연장 안내 대상

    /** B2C 로 지정된 대리점 이름 집합. 실패하면 빈 집합(=아무도 B2C 로 안 봄 → 종전 동작). */
    const loadB2cCenterNames = async (): Promise<Set<string>> => {
      const set = new Set<string>();
      try {
        const rs = await env.DB.prepare(
          `SELECT name FROM centers WHERE UPPER(COALESCE(payment_type,'')) = 'B2C' AND name IS NOT NULL AND name <> ''`
        ).all<any>();
        for (const r of (rs.results || [])) set.add(String(r.name).trim());
      } catch {}
      return set;
    };

    /** 이 학생이 B2C(개인 결제)인가 — 대리점 지정이 정본, 없으면 학생 원부의 표기. */
    const isB2cStudent = (row: any, b2cNames: Set<string>): boolean => {
      const shop = String(row?.shop_name || '').trim();
      if (shop && b2cNames.has(shop)) return true;
      const pt = String(row?.payment_type || '').toUpperCase();
      if (pt.startsWith('B2B')) return false;
      return pt.startsWith('B2C');
    };

    /** 마지막 수업일(ms). end_date 가 마지막 결제일보다 뒤면 그쪽이 정확하다. */
    const resolveLastClassAt = (lastPaidAt: number, endDate: any): number => {
      const derived = Number(lastPaidAt) + CLASS_TERM_DAYS * 86400 * 1000;
      const ed = String(endDate || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(ed)) {
        const ms = Date.parse(ed + 'T23:59:59+09:00');
        if (Number.isFinite(ms) && ms > Number(lastPaidAt)) return ms;
      }
      return derived;
    };

    /* ── 💳 결제관리 화면(ph106) — /api/admin/payments/b2b · /b2c ──
       B2B 는 통장 직접입금, B2C 는 카드결제로 «보는 표가 서로 다르다». 왜 그런지는
       payments-board.ts 머리말에 적어 뒀다. 인증은 index.ts 의 default-deny 게이트가
       '/api/admin/payments' 접두사로 이미 덮고 있어 별도 등록이 필요 없다. */
    {
      const pb = await handlePaymentsBoardApi(request, url, env as any);
      if (pb) return pb;
    }

    /* ── GET /api/admin/payments/overdue?grace_days=35&monthly_fee=200000&renew_days=30 ──
         학생별 마지막 결제일 조회 → grace_days 초과면 «안 낸/안 늘린» 상태로 분류.

       🔁 (2026-08-18) B2C 는 «미납» 이 아니라 «미연장» 이다.
          행마다 channel(B2B/B2C)·term_label(미납/미연장)·last_class_at(마지막 수업일)·
          lapse_days(수업 종료 후 경과일)를 함께 준다. 화면은 이 값으로만 라벨을 쓴다 —
          화면이 자기 나름대로 다시 판정하면 두 화면 숫자가 갈린다.

       🚫 그리고 수업이 끝난 지 renew_days(기본 30일)를 넘긴 학생은 «연장 가능성 낮음»
          으로 보고 명단에서 뺀다(not_renewable 로 따로 세어서 보여만 준다).
          그래야 「이미 마음 떠난 사람에게 계속 결제 문자」가 안 나간다. */
    if (method === 'GET' && path === '/api/admin/payments/overdue') {
      await ensurePaymentTables();
      const graceDays = Math.max(1, parseInt(url.searchParams.get('grace_days') || '35', 10));
      const defaultMonthlyFee = Math.max(0, parseInt(url.searchParams.get('monthly_fee') || '200000', 10));
      const renewWindowDays = Math.max(1, parseInt(url.searchParams.get('renew_days') || String(DEFAULT_RENEW_WINDOW_DAYS), 10));
      const now = Date.now();
      const cutoff = now - graceDays * 86400 * 1000;

      // students_erp 테이블에서 활동중 학생만
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, username TEXT, name TEXT, phone TEXT, parent_phone TEXT, status TEXT);`); } catch {}

      // 각 학생의 마지막 paid 결제 + 미납일수 계산
      const _sw = await studentScopeWhere(env, request, 's');  // 🔒 지사/대리점 격리
      // 🥭 fix(2026-07): 스키마에 s.name 없어 항상 에러였던 것 + 2.9만 학생 규모 대응.
      //   기존: 학생당 상관 서브쿼리 → 수억 행 read 로 D1 한도 초과 실패.
      //   개선: student_payments 를 user_id 인덱스로 1회 GROUP BY 집계(결제자만) 후
      //         students_erp 와 매칭. 상세 리스트는 성능/응답크기 위해 카테고리별 500건 캡,
      //         summary 카운트는 정확값. (결제자 ~수천명이라 overdue/up_to_date 는 전량)
      const CAP = 500;
      const activeWhere = `(s.status IN ('정상','활동','active') OR s.status IS NULL OR s.status = '')${_sw.cond ? ' AND ' + _sw.cond : ''}`;
      // 활동 학생 총수
      const totalActiveRow = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM students_erp s WHERE ${activeWhere}`
      ).bind(..._sw.binds).first<any>().catch(() => ({ c: 0 }));
      const totalActive = totalActiveRow?.c || 0;
      // 결제 이력 있는 활동 학생(마지막 결제일 + 마지막 금액) — 인덱스 GROUP BY
      const paidRs = await env.DB.prepare(
        `SELECT s.user_id,
                COALESCE(s.korean_name, s.student_name, s.username, s.user_id) AS student_name,
                s.parent_phone, s.student_phone,
                s.shop_name, s.payment_type, s.end_date,
                MAX(p.paid_at) AS last_paid_at
           FROM students_erp s
           JOIN student_payments p ON p.user_id = s.user_id AND p.status = 'paid'
          WHERE ${activeWhere}
          GROUP BY s.user_id`
      ).bind(..._sw.binds).all<any>().catch(() => ({ results: [] } as any));
      const b2cNames = await loadB2cCenterNames();
      const overdue: any[] = [];        // 안내 대상
      const notRenewable: any[] = [];   // 수업 종료 후 renew_days 초과 → 안내 제외
      const upToDate: any[] = [];
      let paidCount = 0, overdueCount = 0, notRenewableCount = 0;
      let b2cCount = 0;
      for (const row of (paidRs.results || [])) {
        paidCount++;
        if (!(row.last_paid_at < cutoff)) {
          if (upToDate.length < CAP) upToDate.push({ ...row, days_overdue: 0 });
          continue;
        }
        const isB2c = isB2cStudent(row, b2cNames);
        const lastClassAt = resolveLastClassAt(row.last_paid_at, row.end_date);
        const lapseDays = Math.floor((now - lastClassAt) / (86400 * 1000));
        const daysOverdue = Math.floor((now - row.last_paid_at) / (86400 * 1000)) - graceDays;
        const enriched = {
          ...row,
          days_overdue: daysOverdue,
          amount_krw: defaultMonthlyFee,
          channel: isB2c ? 'B2C' : 'B2B',
          // 🏷 라벨의 정본은 여기다. 화면은 이 문자열을 그대로 쓴다.
          term_label: isB2c ? '미연장' : '미납',
          last_class_at: lastClassAt,
          lapse_days: lapseDays,
        };
        if (isB2c) b2cCount++;
        if (lapseDays > renewWindowDays) {
          notRenewableCount++;
          if (notRenewable.length < CAP) notRenewable.push({ ...enriched, excluded_reason: 'renew_window_passed' });
          continue;
        }
        overdueCount++;
        if (overdue.length < CAP) overdue.push(enriched);
      }
      // 미결제 = 활동학생 - 결제이력학생. 상세는 표시하지 않음(대규모라 카운트만).
      const neverPaidCount = Math.max(0, totalActive - paidCount);
      const upToDateCount = paidCount - overdueCount - notRenewableCount;
      return json({
        ok: true,
        grace_days: graceDays,
        default_fee: defaultMonthlyFee,
        renew_days: renewWindowDays,
        overdue, never_paid: [], up_to_date: upToDate,
        not_renewable: notRenewable,
        capped: CAP,
        summary: {
          total_active: totalActive,
          total_paid_students: paidCount,
          total_overdue: overdueCount,          // 안내 대상(미연장+미납)
          total_b2c: b2cCount,
          total_not_renewable: notRenewableCount, // 수업 종료 1개월 초과 → 제외
          total_never_paid: neverPaidCount,
          total_up_to_date: upToDateCount,
        }
      });
    }

    /* ── POST /api/admin/payments/notify-overdue — 1명 안내 발송 ──
         body: { user_id, student_name, parent_phone, days_overdue, amount_krw,
                 channel?, last_class_at? }

       🔁 (2026-08-18) B2C 는 «미연장» 문구로 나간다. 금액·미납일수를 말하지 않는다 —
          선불이라 받을 돈이 없는데 「N일 미납 20만원」 이라고 보내면 사실이 아니다.
          channel 은 화면이 스캔 결과에서 받은 값을 그대로 실어 준다. 안 실려 오면
          여기서 다시 원부를 보고 판정한다(화면 말만 믿지 않는다). */
    if (method === 'POST' && path === '/api/admin/payments/notify-overdue') {
      await ensurePaymentTables();
      const body: any = await request.json().catch(() => ({}));
      const phone = body.parent_phone || body.student_phone;
      if (!phone) return json({ ok: false, error: 'phone_required' }, 400);

      // 채널 확정 — 화면이 준 값이 없거나 이상하면 원부에서 다시 본다
      let channel = String(body.channel || '').toUpperCase();
      let lastClassAt = parseInt(body.last_class_at, 10) || 0;
      if (channel !== 'B2B' && channel !== 'B2C') {
        const b2cNames = await loadB2cCenterNames();
        const srow = body.user_id ? await env.DB.prepare(
          `SELECT shop_name, payment_type, end_date,
                  (SELECT MAX(paid_at) FROM student_payments WHERE user_id = ? AND status='paid') AS last_paid_at
             FROM students_erp WHERE user_id = ? LIMIT 1`
        ).bind(body.user_id, body.user_id).first<any>().catch(() => null) : null;
        channel = srow && isB2cStudent(srow, b2cNames) ? 'B2C' : 'B2B';
        if (!lastClassAt && srow?.last_paid_at) lastClassAt = resolveLastClassAt(srow.last_paid_at, srow.end_date);
      }
      if (!lastClassAt) {
        // 마지막 수업일을 못 구했으면 경과일수로 되짚는다(= 지금 - 미납일수)
        lastClassAt = Date.now() - (parseInt(body.days_overdue, 10) || 0) * 86400 * 1000;
      }

      const isB2c = channel === 'B2C';
      /* 🔗 이 학생 전용 링크를 새로 발급한다. 실패하면 null 이고, 그때는 문자에
            공용 /enroll.html 링크가 들어간다(문자를 아예 못 보내는 것보다 낫다). */
      const renewLink = isB2c && body.user_id ? await issueRenewLink(env, body.user_id) : null;
      const r = isB2c
        ? await sendClassRenewalAlert(env, phone, {
            studentName: body.student_name || '회원',
            lastClassAt,
            paymentUrl: body.payment_url || renewLink?.url,
          })
        : await sendPaymentOverdueAlert(env, phone, {
            studentName: body.student_name || '학생',
            daysOverdue: parseInt(body.days_overdue, 10) || 0,
            amountKrw: parseInt(body.amount_krw, 10) || 0,
            paymentUrl: body.payment_url,
          });
      // 발송 이력 기록
      await env.DB.prepare(
        `INSERT INTO payment_overdue_log (user_id, student_name, days_overdue, amount_krw, parent_phone, status, error_message, sent_at, channel, last_class_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        body.user_id || null,
        body.student_name || null,
        parseInt(body.days_overdue, 10) || 0,
        isB2c ? 0 : (parseInt(body.amount_krw, 10) || 0),   // 미연장은 청구액이 없다
        phone,
        r.ok ? 'sent' : 'failed',
        r.ok ? null : (r.message || r.error || '실패'),
        Date.now(),
        channel,
        lastClassAt
      ).run();
      // 🆕 Web Push 도 함께 — 문자와 같은 말을 해야 한다
      let pushResult: any = { skipped: true };
      if (body.user_id) {
        const fee = parseInt(body.amount_krw, 10) || 200000;
        pushResult = isB2c
          ? await sendPushToUser(env,
              body.user_id,
              `🔁 ${body.student_name || '회원'}님 수강 연장 안내`,
              buildClassRenewalText(body.student_name || '회원', lastClassAt, null).replace('[망고아이] ', ''),
              body.payment_url || '/?go=payment',
              `renewal-${body.user_id}`
            )
          : await sendPushToUser(env,
              body.user_id,
              `💸 ${body.student_name || '학생'}님 수강료 안내`,
              `미납 ${body.days_overdue}일 / ${fee.toLocaleString('ko-KR')}원. 결제 부탁드립니다.`,
              body.payment_url || '/?go=payment',
              `overdue-${body.user_id}`
            );
      }
      return json({ ...r, channel, term_label: isB2c ? '미연장' : '미납', last_class_at: lastClassAt,
                    renew_link: renewLink ? { expires_at: renewLink.expires_at } : null,  // 🔒 토큰 원문은 안 돌려준다
                    push: pushResult });
    }

    /* ── POST /api/admin/payments/notify-all-overdue — 미납 전체 일괄 ──
         body: { user_ids?: ["uid1",...], grace_days?, default_fee?, dry_run?, confirm_send_over? }

       🚨 (2026-08-17) 이 자리는 **눌리면 되돌릴 수 없는 버튼**이다. 실제 학부모에게 돈 얘기
          문자가 나간다. 확인해 보니 지금 조건이 위험해서 세 가지를 막았다.

       ① «결제 이력이 없음» 을 «미납» 으로 보지 않는다  ← 가장 중요
          원래는 last_paid_at 이 비면 미납으로 치고 daysOverdue=999 로 보냈다.
          그런데 운영 자료가 이렇다(2026-08-17 실측):
            활동 학생 28,672명 · student_payments 에 결제 이력이 있는 학생 1,345명
          나머지 약 27,300명은 «안 낸 사람» 이 아니라 **결제가 이 표에 안 들어오는 사람**
          이다(카페24·대리점 수납). 그들에게 「999일 미납」 문자를 보내면 안 된다.
          지금 사고가 안 난 유일한 이유는 전화번호가 비어 있어서다 —
          students_erp 29,398행 중 parent_phone 3개 · phone 9개.
          **누군가 카페24에서 번호를 채워 넣는 순간 이 버튼은 2만 7천 명짜리 오발송이 된다.**
          그래서 «이력이 없으면 보내지 않고 건너뛴다»(reason: no_payment_record).

       ② dry_run — 기본이 «미리보기» 다.
          실제로 보내려면 dry_run:false 를 **명시**해야 한다. 누가 실수로 눌러도
          누구에게 무슨 문구가 갈지 목록만 돌려주고 끝난다.

       ③ 인원 상한 — 한 번에 CAP 명을 넘으면 보내지 않고 막는다.
          정말 그만큼 보내려면 confirm_send_over 에 그 수를 적어야 한다.
          «전체 일괄» 이 조용히 수천 건이 되는 것을 막는 마지막 빗장이다.

       ④ (2026-08-18) B2C 는 «미납» 이 아니라 «미연장» 이다 — 문구가 갈린다.
          B2C 는 선불이라 받을 돈이 없다. sendClassRenewalAlert 로 「수업이 O월 O일자로
          종료되었습니다 / 연장을 원하시면 결제 부탁드립니다」만 보낸다(발신 1644-0561).
          B2B 만 종전의 미납 독촉(금액·미납일수)이 나간다.

       ⑤ (2026-08-18) 수업 종료 후 1개월(renew_days, 기본 30일)이 지난 학생은 대상에서 뺀다.
          연장 가능성이 낮은 사람에게 계속 결제 문자를 보내지 않기 위함이다.
          건너뛴 사유는 no_renewal_window 로 남는다.

       ⚠️ B2B 문구는 solapi 템플릿(SOLAPI_TEMPLATE_PAYMENT_OVERDUE)이 정본이다. 여기서 안 만든다.
       ⚠️ 이 경로는 지사·대리점에게 열려 있지 않다(index.ts isAgencyAllowedApi 에 없음).
          여는 것은 공동 금지구역 수정이라 사람이 결정할 일이다. */
    if (method === 'POST' && path === '/api/admin/payments/notify-all-overdue') {
      await ensurePaymentTables();
      const body: any = await request.json().catch(() => ({}));
      const graceDays = Math.max(1, parseInt(body.grace_days, 10) || 35);
      const defaultFee = Math.max(0, parseInt(body.default_fee, 10) || 200000);
      const renewWindowDays = Math.max(1, parseInt(body.renew_days, 10) || DEFAULT_RENEW_WINDOW_DAYS);
      // 기본이 미리보기 — «보낸다» 고 적어야만 보낸다
      const dryRun = body.dry_run !== false;
      const SEND_CAP = 50;
      const onlyUids: string[] | null = Array.isArray(body.user_ids) && body.user_ids.length > 0 ? body.user_ids : null;
      const now = Date.now();
      const cutoff = now - graceDays * 86400 * 1000;
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, username TEXT, name TEXT, phone TEXT, parent_phone TEXT, status TEXT);`); } catch {}
      const _sw = await studentScopeWhere(env, request, 's');  // 🔒 지사/대리점 격리 (본사 전체 발송 방지)
      /* 🪤 (2026-08-18) 여기 «s.name» 이라고 적혀 있었다. students_erp 에 name 칸은 없다.
            그래서 이 쿼리는 항상 예외 → .catch 가 빈 배열로 삼켜서, 「전체 일괄」이 조용히
            0명이었다. 스캔 화면(GET /overdue)이 쓰는 것과 같은 COALESCE 로 맞춘다.
            전화번호 칸도 마찬가지다 — 원부의 칸 이름은 student_phone·phone 둘 다 있다. */
      const rs = await env.DB.prepare(
        `SELECT s.user_id,
                COALESCE(s.korean_name, s.student_name, s.username, s.user_id) AS student_name,
                s.parent_phone, COALESCE(s.student_phone, s.phone) AS student_phone,
                s.shop_name, s.payment_type, s.end_date,
                (SELECT MAX(paid_at) FROM student_payments WHERE user_id = s.user_id AND status='paid') AS last_paid_at,
                (SELECT amount_krw FROM student_payments WHERE user_id = s.user_id AND status='paid' ORDER BY paid_at DESC LIMIT 1) AS last_amount
           FROM students_erp s
          WHERE (s.status IN ('정상','활동','active') OR s.status IS NULL OR s.status = '')${_sw.cond ? ' AND ' + _sw.cond : ''}`
      ).bind(..._sw.binds).all().catch(() => ({ results: [] } as any));
      const b2cNamesBulk = await loadB2cCenterNames();
      const results: any[] = [];
      let sent = 0, failed = 0, skipped = 0;
      // ① 먼저 «누구에게 갈지» 를 전부 확정한다. 세어 보기 전에는 한 통도 안 보낸다.
      const targets: any[] = [];
      for (const r of (rs.results || [])) {
        const row: any = r;
        if (onlyUids && !onlyUids.includes(row.user_id)) continue;
        /* ⛔ 결제 이력이 아예 없으면 «미납» 이 아니라 «모름» 이다 — 보내지 않는다.
              카페24·대리점 수납은 이 표에 안 들어온다. 여기를 !last_paid_at → 미납 으로
              되돌리면 2만 7천 명에게 「999일 미납」 문자가 나간다(위 주석 ① 참고). */
        if (!row.last_paid_at) {
          skipped++; results.push({ user_id: row.user_id, status: 'skipped', reason: 'no_payment_record' });
          continue;
        }
        if (row.last_paid_at >= cutoff) continue;   // 유예 안이면 미납·미연장 아님
        const phone = row.parent_phone || row.student_phone;
        if (!phone) { skipped++; results.push({ user_id: row.user_id, status: 'skipped', reason: 'no_phone' }); continue; }
        const daysOverdue = Math.floor((now - row.last_paid_at) / (86400 * 1000)) - graceDays;
        const isB2c = isB2cStudent(row, b2cNamesBulk);
        const lastClassAt = resolveLastClassAt(row.last_paid_at, row.end_date);
        const lapseDays = Math.floor((now - lastClassAt) / (86400 * 1000));
        /* ⛔ 수업 끝난 지 한 달이 넘었으면 보내지 않는다(위 주석 ⑤). 연장 가능성이 낮다. */
        if (lapseDays > renewWindowDays) {
          skipped++; results.push({ user_id: row.user_id, status: 'skipped', reason: 'no_renewal_window', lapse_days: lapseDays });
          continue;
        }
        targets.push({
          row, phone, daysOverdue,
          amount: isB2c ? 0 : (row.last_amount || defaultFee),   // 미연장은 청구액이 없다
          isB2c, channel: isB2c ? 'B2C' : 'B2B',
          termLabel: isB2c ? '미연장' : '미납',
          lastClassAt, lapseDays,
        });
      }

      // ③ 상한 — 정말 이만큼 보낼 것인지 사람이 그 수를 적어 확인해야 한다
      if (!dryRun && targets.length > SEND_CAP && Number(body.confirm_send_over) !== targets.length) {
        return json({
          ok: false, error: 'too_many_recipients',
          message: `${targets.length}명에게 발송하려고 합니다. 정말 보내려면 confirm_send_over 에 ${targets.length} 을 넣어 다시 요청하세요.`,
          message_en: `About to message ${targets.length} people. Pass confirm_send_over=${targets.length} to proceed.`,
          would_send: targets.length, cap: SEND_CAP,
          preview: targets.slice(0, 20).map(t => ({ user_id: t.row.user_id, student_name: t.row.student_name, channel: t.channel, term_label: t.termLabel, days_overdue: t.daysOverdue, amount_krw: t.amount })),
        }, 409);
      }

      // ② 미리보기가 기본 — 누구에게 무엇이 갈지만 돌려준다
      if (dryRun) {
        return json({
          ok: true, dry_run: true,
          summary: { would_send: targets.length, skipped, sent: 0, failed: 0 },
          skipped_reasons: results.reduce((m: any, x: any) => { m[x.reason] = (m[x.reason] || 0) + 1; return m; }, {}),
          note: '미리보기입니다. 실제로 보내려면 dry_run:false 를 넣어 다시 요청하세요.',
          note_en: 'Preview only. Pass dry_run:false to actually send.',
          by_channel: {
            B2C: targets.filter(t => t.isB2c).length,   // 미연장 안내
            B2B: targets.filter(t => !t.isB2c).length,  // 미납 독촉
          },
          would_send_to: targets.map(t => ({ user_id: t.row.user_id, student_name: t.row.student_name,
                                             channel: t.channel, term_label: t.termLabel,
                                             days_overdue: t.daysOverdue, amount_krw: t.amount,
                                             last_class_at: t.lastClassAt,
                                             // 실제로 나갈 문장 그대로(문구는 solapi-client 가 정본)
                                             /* 미리보기에서는 토큰을 발급하지 않는다 — 보내지도 않을 링크를
                                                미리 만들면 옛 링크가 그때마다 죽는다. 실제 발송 때
                                                학생마다 다른 1회용 주소가 들어간다. */
                                             text: t.isB2c ? buildClassRenewalText(t.row.student_name || '회원', t.lastClassAt) : null })),
        });
      }

      for (const t of targets) {
        const row = t.row, phone = t.phone, daysOverdue = t.daysOverdue, amount = t.amount;
        const link2 = t.isB2c ? await issueRenewLink(env, row.user_id) : null;
        const r2 = t.isB2c
          ? await sendClassRenewalAlert(env, phone, {
              studentName: row.student_name || '회원',
              lastClassAt: t.lastClassAt,
              paymentUrl: link2?.url,
            })
          : await sendPaymentOverdueAlert(env, phone, {
              studentName: row.student_name || '학생',
              daysOverdue, amountKrw: amount,
            });
        if (r2.ok) sent++; else failed++;
        await env.DB.prepare(
          `INSERT INTO payment_overdue_log (user_id, student_name, days_overdue, amount_krw, parent_phone, status, error_message, sent_at, channel, last_class_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          row.user_id, row.student_name, daysOverdue, amount, phone,
          r2.ok ? 'sent' : 'failed',
          r2.ok ? null : (r2.message || r2.error || '실패'),
          Date.now(), t.channel, t.lastClassAt
        ).run();
        results.push({ user_id: row.user_id, student_name: row.student_name, phone,
                       channel: t.channel, term_label: t.termLabel, days_overdue: daysOverdue, ...r2 });
      }
      return json({
        ok: true,
        summary: { sent, failed, skipped, total: results.length },
        skipped_reasons: results.filter((x: any) => x.status === 'skipped')
          .reduce((m: any, x: any) => { m[x.reason] = (m[x.reason] || 0) + 1; return m; }, {}),
        from_phone: CLASS_RENEWAL_FROM_PHONE,
        results,
      });
    }

    // ── GET /api/admin/payments/overdue-log — 최근 미납 알림 발송 이력 ──
    if (method === 'GET' && path === '/api/admin/payments/overdue-log') {
      await ensurePaymentTables();
      const rs = await env.DB.prepare(
        `SELECT * FROM payment_overdue_log ORDER BY sent_at DESC LIMIT 200`
      ).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ── POST /api/admin/payments/record — 수동으로 결제 기록 추가 (영수증 등) ──
    if (method === 'POST' && path === '/api/admin/payments/record') {
      await ensurePaymentTables();
      const body: any = await request.json().catch(() => ({}));
      if (!body.user_id || !body.amount_krw) return json({ ok: false, error: 'user_id_and_amount_required' }, 400);
      const now = Date.now();
      const paidAt = body.paid_at ? parseInt(body.paid_at, 10) : now;
      const ins = await env.DB.prepare(
        `INSERT INTO student_payments (user_id, paid_at, period_start, period_end, amount_krw, method, memo, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)`
      ).bind(
        body.user_id, paidAt,
        body.period_start || null, body.period_end || null,
        parseInt(body.amount_krw, 10), body.method || '카드',
        body.memo || null, body.status || 'paid', now
      ).run();
      return json({ ok: true, id: ins?.meta?.last_row_id, paid_at: paidAt });
    }
  return null;
}
