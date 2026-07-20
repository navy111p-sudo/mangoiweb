// ═══════════════════════════════════════════════════════════════════════
// 🎁 api-points.ts — 포인트·기프티콘·별점평가 도메인 (api-mango.ts 에서 분리)
//   REFACTOR_PLAN 1단계 · 11차(2026-07-14) · 로직 무변경(클로저 2종만 env 승격)
//   포함: Phase P1(포인트+기프티콘)+P4(기프티쇼 비즈) + 별점평가·AI피드백 — 29매처
//   ensurePointTables·applyPointTransaction 은 export — api-mango 게임보상 2곳 사용.
// ═══════════════════════════════════════════════════════════════════════
import { json, today } from './api-util';
import { authUidFromRequest as authUidGlobal } from './auth-token';
import { checkAdminSession, getAdminActor } from './auth-admin';
import { sendCoupon, checkBalance, getGiftishowMode, parseWebhook } from './giftishow-client';
import type { MangoEnv } from './api-mango';
import { runJudgmentAnalysis, exportJudgmentEnvelopes, markJudgmentMigrated, getGrowthReport, runGrowthSnapshot, generatePersonalizedScenario, evaluateJudgmentAnswer, sha256hex } from './api-judgment';  // 🧠 판단력 엔진(2단계 Mode A) + Mode B 이관 + 3단계(성장·시나리오·훈련채점)

/**
 * 🎁 기프트 카탈로그 기본 상품 시드 (멱등 — 이미 있으면 건너뜀).
 *   공개 읽기(/api/gifts/catalog)에서 비어있을 때 자동 호출 + 관리자 시드 API 에서도 재사용.
 *   반환: 새로 넣은 상품 수.
 */
export async function seedGiftCatalog(env: { DB: D1Database }): Promise<number> {
  const now = Date.now();
  const seeds: Array<[string, string, string, number, number, number, string, string]> = [
    ['🥭 망고아이','수업료 전환 (5,000원)','tuition',5000,5000,5,'모은 포인트로 다음 수업료 즉시 차감','/img/Mangoi_Character.png'],
    ['메가커피','아메리카노 (ICE)','cafe',1500,1500,10,'가성비 1위, 시원한 한 잔','/img/gifts/megacoffee.svg'],
    ['배스킨라빈스','파인트 (1개)','cafe',9800,9800,20,'취향대로 골라먹는 31','/img/gifts/baskinrobbins.svg'],
    ['배달의민족','e쿠폰 5,000원','food',5000,5000,25,'배달 음식 주문 시 즉시 차감','/img/gifts/baemin.svg'],
    ['CGV','영화 1매 (전 지점)','movie',14000,14000,40,'평일 일반관 1회 사용','/img/gifts/cgv.svg'],
    ['교보문고','도서상품권 5,000원','book',5000,5000,50,'온/오프라인 사용 가능','/img/gifts/kyobo.svg'],
    ['컬쳐랜드','문화상품권 5,000원','voucher',5000,5000,55,'쿠팡·게임·도서·OTT 등 어디든','/img/gifts/cultureland.svg'],
    ['GS25','편의점 금액권 5,000원','voucher',5000,5000,60,'전국 GS25에서 사용','/img/gifts/gs25.svg'],
  ];
  let n = 0;
  for (const [brand, name, cat, fv, pp, sort, desc, thumb] of seeds) {
    const exists = await env.DB.prepare(`SELECT id FROM gift_catalog WHERE brand=? AND name=?`).bind(brand, name).first();
    if (exists) continue;
    await env.DB.prepare(`INSERT INTO gift_catalog (brand,name,category,face_value,point_price,enabled,sort_order,description,thumbnail_url,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?,?,?,?)`)
      .bind(brand, name, cat, fv, pp, sort, desc, thumb, now, now).run();
    n++;
  }
  return n;
}

// DDL 1회 실행 플래그 (D1 락 폭주 방지 — api-mango 에서 이동)
let __pointTablesReady = false;
let __classRatingsReady = false;
let __teacherFeedbackReady = false;

export const ensurePointTables = async (env: MangoEnv) => {
      if (__pointTablesReady) return;   // isolate 당 1회만 DDL 실행 (503 폭주 방지)
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_points (user_id TEXT PRIMARY KEY, student_name TEXT, balance INTEGER NOT NULL DEFAULT 0, lifetime_earned INTEGER NOT NULL DEFAULT 0, lifetime_spent INTEGER NOT NULL DEFAULT 0, last_earned_at INTEGER, last_spent_at INTEGER, updated_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS point_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, type TEXT NOT NULL, amount INTEGER NOT NULL, balance_after INTEGER NOT NULL, reason TEXT, rule_code TEXT, redemption_id INTEGER, actor_id TEXT, actor_name TEXT, created_at INTEGER NOT NULL, meta TEXT);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS point_rules (code TEXT PRIMARY KEY, label TEXT NOT NULL, amount INTEGER NOT NULL, cooldown_sec INTEGER DEFAULT 0, daily_cap INTEGER, enabled INTEGER DEFAULT 1, description TEXT, updated_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS gift_catalog (id INTEGER PRIMARY KEY AUTOINCREMENT, external_id TEXT, brand TEXT, name TEXT NOT NULL, category TEXT, face_value INTEGER NOT NULL, point_price INTEGER NOT NULL, thumbnail_url TEXT, stock INTEGER, enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, description TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS gift_redemptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, catalog_id INTEGER NOT NULL, gift_name TEXT, gift_brand TEXT, face_value INTEGER NOT NULL, point_price INTEGER NOT NULL, recipient_phone TEXT, recipient_name TEXT, status TEXT NOT NULL DEFAULT 'pending', external_order_id TEXT, external_coupon_code TEXT, error_message TEXT, requested_at INTEGER NOT NULL, sent_at INTEGER, delivered_at INTEGER, failed_at INTEGER, refunded_at INTEGER, txn_spend_id INTEGER, txn_refund_id INTEGER, meta TEXT);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS point_rule_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, rule_code TEXT NOT NULL, amount INTEGER NOT NULL, triggered_at INTEGER NOT NULL, txn_id INTEGER, meta TEXT);`);
      // 🌟 (2026-07-05) 화상수업 실시간 칭찬 포인트를 "가장 확실하게" 학생 전체 포인트로 적립하기 위한 두 테이블.
      //   vc_roster       : 학생이 수업 입장 시 (방·피어ID → 자기 계정 uid) 를 등록 → 선생님이 별을 누르면
      //                     서버가 대상 학생의 진짜 계정을 찾아 직접 적립(학생 브라우저 상태와 무관).
      //   point_awards    : awardId 멱등키 — 학생-자기적립 경로와 서버-선생님적립 경로가 동시에 돌아도
      //                     한 번의 별 = 정확히 1점만 적립되게 보장(중복 방지).
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS vc_roster (room_id TEXT NOT NULL, peer_id TEXT NOT NULL, account_uid TEXT NOT NULL, name TEXT, role TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (room_id, peer_id));`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS point_awards (award_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, room_id TEXT, credited_at INTEGER NOT NULL);`);
      __pointTablesReady = true;
    };

export const applyPointTransaction = async (env: MangoEnv, params: {
      userId: string, studentName?: string,
      type: 'earn' | 'spend' | 'refund' | 'admin_grant' | 'admin_deduct' | 'expire',
      amount: number, reason?: string,
      ruleCode?: string, redemptionId?: number,
      actorId?: string, actorName?: string, meta?: any,
    }) => {
      const now = Date.now();
      const { userId, studentName, type, amount, reason, ruleCode, redemptionId, actorId, actorName, meta } = params;
      // 현재 잔액 조회 + 행 생성
      let row: any = await env.DB.prepare(`SELECT balance, lifetime_earned, lifetime_spent FROM student_points WHERE user_id=?`).bind(userId).first();
      if (!row) {
        await env.DB.prepare(`INSERT INTO student_points (user_id, student_name, balance, lifetime_earned, lifetime_spent, updated_at) VALUES (?,?,0,0,0,?)`)
          .bind(userId, studentName || null, now).run();
        row = { balance: 0, lifetime_earned: 0, lifetime_spent: 0 };
      }
      const isCredit = (type === 'earn' || type === 'refund' || type === 'admin_grant');
      const signed = isCredit ? Math.abs(amount) : -Math.abs(amount);
      // ⚛ 원자적 잔액 변경: 상대적(+signed) 갱신 + 차감이 잔액을 음수로 만들면 거부(WHERE balance+signed>=0).
      //   기존엔 SELECT 후 절대값을 덮어써서, 동시 차감 시 둘 다 통과해 초과사용(음수 잔액)이 가능했음.
      //   D1(SQLite) 은 쓰기를 직렬화하므로 이 조건부 UPDATE 는 동시성에서 정확히 한 쪽만 성공한다.
      const upd = await env.DB.prepare(
        `UPDATE student_points SET balance = balance + ?, lifetime_earned = lifetime_earned + ?, lifetime_spent = lifetime_spent + ?, last_earned_at = CASE WHEN ?>0 THEN ? ELSE last_earned_at END, last_spent_at = CASE WHEN ?<0 THEN ? ELSE last_spent_at END, student_name = COALESCE(?, student_name), updated_at = ? WHERE user_id = ? AND balance + ? >= 0`
      ).bind(signed, signed > 0 ? signed : 0, signed < 0 ? -signed : 0, signed, now, signed, now, studentName || null, now, userId, signed).run();
      if (!upd?.meta?.changes) {   // 조건 실패 = 잔액 부족(동시 차감 포함)
        const cur: any = await env.DB.prepare(`SELECT balance FROM student_points WHERE user_id=?`).bind(userId).first();
        throw new Error(`잔액 부족: 현재 ${cur?.balance ?? (row.balance || 0)}P, 차감 ${Math.abs(signed)}P`);
      }
      const afterRow: any = await env.DB.prepare(`SELECT balance FROM student_points WHERE user_id=?`).bind(userId).first();
      const newBalance = afterRow?.balance ?? ((row.balance || 0) + signed);
      // INSERT 거래내역
      const ins = await env.DB.prepare(`INSERT INTO point_transactions (user_id, student_name, type, amount, balance_after, reason, rule_code, redemption_id, actor_id, actor_name, created_at, meta) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(userId, studentName || null, type, signed, newBalance, reason || null, ruleCode || null, redemptionId || null, actorId || null, actorName || null, now, meta ? JSON.stringify(meta) : null).run();
      return { txnId: ins?.meta?.last_row_id, newBalance, signed };
    };

export async function handlePointsApi(
  request: Request,
  url: URL,
  env: MangoEnv,
  ctx?: ExecutionContext   // 🧠 판단력 비동기 분석(waitUntil)용 — 없으면 인라인 폴백
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

    // ═══════════════════════════════════════════════════════════════
    // 🎁 Phase P1 - 망고아이 포인트 시스템 + 기프티콘 교환
    // ═══════════════════════════════════════════════════════════════

    // 헬퍼: 포인트 테이블 자동 생성 (안전망)

    // 헬퍼: 학생 포인트 거래 (적립 또는 차감) - 트랜잭션 보장

    // 🌟 헬퍼: 실시간 수업 칭찬 포인트 적립(멱등) — 학생 전체 포인트(student_points.balance)에 1점 적립.
    //   awardId 를 주면 point_awards 로 "한 별 = 정확히 1점" 보장. 학생-자기적립/서버-선생님적립 두 경로가
    //   같은 awardId 로 동시에 들어와도 먼저 claim 한 쪽만 실제 적립하고, 다른 쪽은 already 로 무해하게 통과.
    const creditPraisePoint = async (opts: {
      accountUid: string; studentName?: string | null; awardId?: string | null;
      room?: string | null; fromName?: string | null;
    }) => {
      const accountUid = (opts.accountUid || '').trim();
      if (!accountUid) return { ok: false, error: 'no_account' };
      await ensurePointTables(env);
      const now = Date.now();
      // 규칙 자동 시드/갱신 (1점 · 학생당 1초 쿨다운 · 하루 100회)
      await env.DB.prepare(`INSERT INTO point_rules (code, label, amount, cooldown_sec, daily_cap, enabled, description, updated_at) VALUES ('teacher_praise_point','선생님 칭찬 포인트',1,1,100,1,'실시간 수업 중 선생님이 잘한 답변에 즉석 지급',?) ON CONFLICT(code) DO UPDATE SET cooldown_sec=1, daily_cap=100, enabled=1`).bind(now).run();
      const rule: any = await env.DB.prepare(`SELECT * FROM point_rules WHERE code='teacher_praise_point' AND enabled=1`).first();
      const amount = rule?.amount || 1;
      // ⚛ 멱등 claim — awardId 있을 때만. 이미 적립됐으면 그대로 성공 반환(중복 적립 안 함).
      if (opts.awardId) {
        const claim = await env.DB.prepare(`INSERT OR IGNORE INTO point_awards (award_id, user_id, room_id, credited_at) VALUES (?,?,?,?)`)
          .bind(opts.awardId, accountUid, opts.room || null, now).run();
        if (!claim?.meta?.changes) {
          const b: any = await env.DB.prepare(`SELECT balance FROM student_points WHERE user_id=?`).bind(accountUid).first();
          return { ok: true, already: true, amount, newBalance: b?.balance ?? null };
        }
      }
      // 일일 한도 (KST 자정 기준)
      if (rule?.daily_cap) {
        const KST_OFF = 9 * 3600 * 1000;
        const todayMs = Math.floor((now + KST_OFF) / 86400000) * 86400000 - KST_OFF;
        const cnt: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM point_rule_log WHERE user_id=? AND rule_code='teacher_praise_point' AND triggered_at>=?`).bind(accountUid, todayMs).first();
        if ((cnt?.c || 0) >= rule.daily_cap) return { ok: false, error: 'daily_cap_reached', cap: rule.daily_cap };
      }
      const r = await applyPointTransaction(env, {
        userId: accountUid, studentName: opts.studentName || undefined, type: 'earn',
        amount, reason: rule?.label || '선생님 칭찬 포인트', ruleCode: 'teacher_praise_point',
        meta: { room: opts.room, awardId: opts.awardId, from: opts.fromName },
      });
      await env.DB.prepare(`INSERT INTO point_rule_log (user_id, rule_code, amount, triggered_at, txn_id, meta) VALUES (?,?,?,?,?,?)`)
        .bind(accountUid, 'teacher_praise_point', amount, now, r.txnId, JSON.stringify({ room: opts.room, awardId: opts.awardId })).run();
      return { ok: true, ...r, amount, rule: { code: 'teacher_praise_point', label: rule?.label, amount } };
    };

    // ── GET /api/points/balance?uid=xxx — 학생 본인 포인트 잔액 + 최근 거래 ──
    if (method === 'GET' && path === '/api/points/balance') {
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 [PII/IDOR] 본인(토큰) 또는 관리자(쿠키세션)만 조회 — 남의 잔액·이름·거래내역 노출 차단 (2026-07-11)
      const pbAdmin = await checkAdminSession(request, env as any);
      const pbAuth = await authUidGlobal(request, url, env);
      if (!pbAdmin.ok && (!pbAuth || pbAuth !== uid)) {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 본인 포인트만 조회할 수 있습니다.' }, 401);
      }
      // fix (2026-06-01) — DB 에러가 나도 절대 503/500 던지지 않고 잔액 0 으로 graceful 응답.
      //   (DDL 폭주/락으로 인한 503 콘솔 도배 방지)
      try {
        await ensurePointTables(env);
        const row: any = await env.DB.prepare(`SELECT * FROM student_points WHERE user_id=?`).bind(uid).first();
        const txns = await env.DB.prepare(`SELECT id, type, amount, balance_after, reason, created_at FROM point_transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 30`).bind(uid).all();
        return json({
          ok: true,
          balance: row?.balance || 0,
          lifetime_earned: row?.lifetime_earned || 0,
          lifetime_spent: row?.lifetime_spent || 0,
          student_name: row?.student_name || null,
          recent: txns.results || [],
        });
      } catch (e: any) {
        return json({ ok: false, balance: 0, lifetime_earned: 0, lifetime_spent: 0, recent: [], error: 'points_unavailable', detail: String(e?.message || e) });
      }
    }

    // ── GET /api/admin/points/list — 전체 학생 포인트 잔액 (관리자) ──
    if (method === 'GET' && path === '/api/admin/points/list') {
      await ensurePointTables(env);
      const rs = await env.DB.prepare(`SELECT user_id, student_name, balance, lifetime_earned, lifetime_spent, last_earned_at, last_spent_at, updated_at FROM student_points ORDER BY balance DESC, updated_at DESC LIMIT 500`).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ── POST /api/admin/points/adjust — 관리자가 포인트 지급/차감 ──
    //   body: { user_id, student_name, amount, reason, type? ('admin_grant'|'admin_deduct') }
    if (method === 'POST' && path === '/api/admin/points/adjust') {
      await ensurePointTables(env);
      const body: any = await request.json().catch(() => ({}));
      const userId = (body.user_id || '').trim();
      const studentName = (body.student_name || '').trim();
      const amount = Math.abs(parseInt(body.amount, 10) || 0);
      const type = body.type === 'admin_deduct' ? 'admin_deduct' : 'admin_grant';
      const reason = (body.reason || (type === 'admin_grant' ? '관리자 지급' : '관리자 차감')).trim();
      const actorId = body.actor_id || 'admin';
      const actorName = body.actor_name || '관리자';
      if (!userId) return json({ ok: false, error: 'user_id_required' }, 400);
      if (!amount) return json({ ok: false, error: 'amount_required' }, 400);
      try {
        const r = await applyPointTransaction(env, { userId, studentName, type, amount, reason, actorId, actorName });
        return json({ ok: true, ...r });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 400);
      }
    }

    // ── POST /api/points/earn-by-rule — 자동 적립 (출석/숙제/제시간 등) ──
    //   body: { user_id, student_name?, rule_code, meta? }
    //   쿨다운/일일 한도 체크 후 적립
    if (method === 'POST' && path === '/api/points/earn-by-rule') {
      await ensurePointTables(env);
      const body: any = await request.json().catch(() => ({}));
      const userId = (body.user_id || '').trim();
      const ruleCode = (body.rule_code || '').trim();
      if (!userId || !ruleCode) return json({ ok: false, error: 'user_id_and_rule_required' }, 400);
      // 🔐 [무결성] 본인 계정에만 적립 — 게스트(guest*)는 통과(교환 불가), 실계정은 토큰 소유자 OR 관리자.
      //   남의 계정/무인증 셀프적립(→기프티콘) 통로 차단 (2026-07-11)
      if (!/^guest/i.test(userId)) {
        const ebAdmin = await checkAdminSession(request, env as any);
        const ebAuth = await authUidGlobal(request, url, env, body);
        if (!ebAdmin.ok && (!ebAuth || ebAuth !== userId)) {
          return json({ ok: false, error: 'auth_required', message: '로그인 후 본인만 적립됩니다.' }, 401);
        }
      }
      // 🌟 실시간 수업 칭찬 포인트 — 학생 본인 브라우저가 자기 계정으로 적립하는 경로.
      //   awardId(멱등키)를 함께 넘겨, 서버-선생님적립 경로(/api/points/award-praise)와 겹쳐도 1점만 적립.
      if (ruleCode === 'teacher_praise_point') {
        const res: any = await creditPraisePoint({
          accountUid: userId, studentName: body.student_name,
          awardId: body.meta?.awardId || null, room: body.meta?.room || null, fromName: body.meta?.from || null,
        });
        return json(res.ok ? { ...res, rule: res.rule || { code: 'teacher_praise_point', amount: res.amount || 1 } } : res, res.ok ? 200 : 200);
      }
      // 🎙 발음 코칭 세트 완주 — 규칙 자동 시드(없으면 생성). 20점 · 쿨다운 없음 · 하루 5회
      if (ruleCode === 'speech_master') {
        await env.DB.prepare(`INSERT INTO point_rules (code, label, amount, cooldown_sec, daily_cap, enabled, description, updated_at) VALUES ('speech_master','발음 세트 완주',20,0,5,1,'AI 음성 코칭 한 세트(레벨/단원)를 모두 완주 시 지급',?) ON CONFLICT(code) DO NOTHING`).bind(Date.now()).run();
      }
      // ✏️ 영작 고쳐쓰기 — 첨삭받은 문장을 직접 따라 써서 익히면 지급. 5점 · 하루 5회
      if (ruleCode === 'ai_writing_rewrite') {
        await env.DB.prepare(`INSERT INTO point_rules (code, label, amount, cooldown_sec, daily_cap, enabled, description, updated_at) VALUES ('ai_writing_rewrite','영작 고쳐쓰기 완료',5,0,5,1,'첨삭받은 문장을 직접 따라 써서 익히면 지급',?) ON CONFLICT(code) DO NOTHING`).bind(Date.now()).run();
      }
      const rule: any = await env.DB.prepare(`SELECT * FROM point_rules WHERE code=? AND enabled=1`).bind(ruleCode).first();
      if (!rule) return json({ ok: false, error: 'rule_not_found_or_disabled', code: ruleCode }, 404);
      // 쿨다운 검사
      const now = Date.now();
      if ((rule.cooldown_sec || 0) > 0) {
        const last: any = await env.DB.prepare(`SELECT triggered_at FROM point_rule_log WHERE user_id=? AND rule_code=? ORDER BY triggered_at DESC LIMIT 1`).bind(userId, ruleCode).first();
        if (last && (now - last.triggered_at) < rule.cooldown_sec * 1000) {
          return json({ ok: false, error: 'cooldown', remaining_sec: Math.ceil((rule.cooldown_sec*1000 - (now - last.triggered_at))/1000) });
        }
      }
      // 일일 한도 검사 — 하루 경계는 KST 자정(=UTC 15:00) 기준으로 통일(나머지 코드의 today() 와 일치)
      if (rule.daily_cap) {
        const KST_OFF = 9 * 3600 * 1000;
        const todayMs = Math.floor((Date.now() + KST_OFF) / 86400000) * 86400000 - KST_OFF;
        const cnt: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM point_rule_log WHERE user_id=? AND rule_code=? AND triggered_at>=?`).bind(userId, ruleCode, todayMs).first();
        if ((cnt?.c || 0) >= rule.daily_cap) {
          return json({ ok: false, error: 'daily_cap_reached', cap: rule.daily_cap });
        }
      }
      // 적립
      try {
        const r = await applyPointTransaction(env, {
          userId, studentName: body.student_name, type: 'earn',
          amount: rule.amount, reason: rule.label, ruleCode, meta: body.meta,
        });
        await env.DB.prepare(`INSERT INTO point_rule_log (user_id, rule_code, amount, triggered_at, txn_id, meta) VALUES (?,?,?,?,?,?)`)
          .bind(userId, ruleCode, rule.amount, now, r.txnId, body.meta ? JSON.stringify(body.meta) : null).run();
        return json({ ok: true, ...r, rule: { code: rule.code, label: rule.label, amount: rule.amount } });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 400);
      }
    }

    // ── POST /api/vc/roster — 학생이 수업 입장 시 (방·피어ID → 자기 계정 uid) 등록 ──
    //   body: { room, peer_id, account_uid, name?, role? }
    //   이 매핑이 있어야 선생님이 별을 눌렀을 때 서버가 대상 학생의 진짜 계정을 찾아 적립할 수 있다.
    if (method === 'POST' && path === '/api/vc/roster') {
      try {
        await ensurePointTables(env);
        const body: any = await request.json().catch(() => ({}));
        const room = (body.room || '').trim();
        const peerId = String(body.peer_id || '').trim();
        const accountUid = (body.account_uid || '').trim();
        const name = (body.name || '').trim();
        const role = (body.role || 'student').trim();
        if (!room || !peerId || !accountUid) return json({ ok: false, error: 'room_peer_account_required' }, 400);
        // 🔐 본인 계정만 로스터 등록 — 게스트(guest*) 통과, 실계정은 토큰 소유자 OR 관리자.
        //   (남의 account_uid 를 임의 방·피어에 매핑해 칭찬적립 가로채는 위조 차단, 2026-07-11)
        if (!/^guest/i.test(accountUid)) {
          const vrAdmin = await checkAdminSession(request, env as any);
          const vrAuth = await authUidGlobal(request, url, env, body);
          if (!vrAdmin.ok && (!vrAuth || vrAuth !== accountUid)) return json({ ok: false, error: 'auth_required' }, 401);
        }
        await env.DB.prepare(`INSERT INTO vc_roster (room_id, peer_id, account_uid, name, role, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(room_id, peer_id) DO UPDATE SET account_uid=excluded.account_uid, name=excluded.name, role=excluded.role, updated_at=excluded.updated_at`)
          .bind(room, peerId, accountUid, name || null, role, Date.now()).run();
        return json({ ok: true });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 200);
      }
    }

    // ── POST /api/points/award-praise — 선생님이 별을 누르면 서버가 대상 학생 계정에 직접 적립 ──
    //   body: { room, target_peer_id, award_id, from_name? }
    //   학생 브라우저의 로그인/신호수신/네트워크 상태와 무관하게, 입장 때 등록된 계정으로 적립(멱등).
    //   학생이 로그인 안 하고 게스트로 들어와 vc_roster 에 없으면 account_not_registered 반환(적립 불가).
    if (method === 'POST' && path === '/api/points/award-praise') {
      try {
        await ensurePointTables(env);
        const body: any = await request.json().catch(() => ({}));
        const room = (body.room || '').trim();
        const targetPeerId = String(body.target_peer_id || '').trim();
        const awardId = (body.award_id || '').trim() || null;
        const fromName = (body.from_name || '선생님').trim();
        if (!room || !targetPeerId) return json({ ok: false, error: 'room_and_target_required' }, 400);
        // 🔐 [무결성] 교사(관리자 쿠키세션)만 별점 지급 — 학생/공격자의 셀프 칭찬적립 차단 (2026-07-11).
        //   학생 자가적립은 /api/points/earn-by-rule(teacher_praise_point, 토큰인증)가 별도로 담당하므로,
        //   교사 세션이 없어 여기서 막혀도 칭찬 포인트는 그 경로로 정상 적립됨(이중경로·멱등).
        const apAdmin = await checkAdminSession(request, env as any);
        if (!apAdmin.ok) return json({ ok: false, error: 'auth_required', message: '교사만 별점을 줄 수 있습니다.' }, 401);
        const rr: any = await env.DB.prepare(`SELECT account_uid, name, role FROM vc_roster WHERE room_id=? AND peer_id=? LIMIT 1`).bind(room, targetPeerId).first();
        if (!rr?.account_uid) return json({ ok: false, error: 'account_not_registered' }, 200);
        if (rr.role && rr.role !== 'student') return json({ ok: false, error: 'target_not_student' }, 200);
        const res: any = await creditPraisePoint({ accountUid: rr.account_uid, studentName: rr.name, awardId, room, fromName });
        return json(res);
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 200);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // ⭐ 수업 강사 평가 — 학생이 수업 종료 직후 별 7개(1~7점) + 태그 + 건의사항 제출
    // ═══════════════════════════════════════════════════════════════

    const ensureClassRatingsTable = async () => {
      if (__classRatingsReady) return;
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_ratings (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, student_uid TEXT NOT NULL, student_name TEXT, teacher_name TEXT, score INTEGER NOT NULL, tags TEXT, feedback TEXT, rated_date TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(room_id, student_uid, rated_date));`);
      await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_class_ratings_teacher ON class_ratings(teacher_name, created_at);`);
      __classRatingsReady = true;
    };

    // 🤖 교사 수업 AI 피드백(teacher_class_feedback) DDL — isolate 당 1회
    const ensureTeacherFeedbackTable = async () => {
      if (__teacherFeedbackReady) return;
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_class_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, teacher_uid TEXT, teacher_name TEXT, student_name TEXT, duration_min INTEGER, metrics_json TEXT, feedback_ko TEXT, feedback_en TEXT, source TEXT, created_at INTEGER NOT NULL, UNIQUE(room_id));`);
      await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_tcf_teacher ON teacher_class_feedback(teacher_uid, created_at);`);
      __teacherFeedbackReady = true;
    };

    // ── POST /api/ratings — 평가 제출 (하루에 같은 방 1회, 제출 시 포인트 적립) ──
    //   body: { room_id, student_uid, student_name?, teacher_name?, score(1~7), tags?: string[], feedback? }
    if (method === 'POST' && path === '/api/ratings') {
      await ensureClassRatingsTable();
      const body: any = await request.json().catch(() => ({}));
      const roomId = (body.room_id || '').trim();
      const studentUid = (body.student_uid || '').trim();
      const score = parseInt(body.score, 10);
      if (!roomId || !studentUid) return json({ ok: false, error: 'room_id_and_student_uid_required' }, 400);
      if (!Number.isInteger(score) || score < 1 || score > 7) return json({ ok: false, error: 'score_must_be_1_to_7' }, 400);

      // 강사 이름: 클라이언트가 못 넘기면 attendance 에서 그 방의 강사 조회
      let teacherName = (body.teacher_name || '').trim();
      if (!teacherName) {
        try {
          const t: any = await env.DB.prepare(`SELECT username FROM attendance WHERE room_id=? AND role='teacher' AND username IS NOT NULL ORDER BY joined_at DESC LIMIT 1`).bind(roomId).first();
          if (t?.username) teacherName = String(t.username);
        } catch { /* attendance 없으면 빈 값 허용 */ }
      }

      const tags = Array.isArray(body.tags) ? body.tags.map((t: any) => String(t)).slice(0, 12) : [];
      const feedback = String(body.feedback || '').slice(0, 1000).trim();
      const ratedDate = today();
      const now = Date.now();
      try {
        await env.DB.prepare(`INSERT INTO class_ratings (room_id, student_uid, student_name, teacher_name, score, tags, feedback, rated_date, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
          .bind(roomId, studentUid, body.student_name || null, teacherName || null, score, tags.length ? JSON.stringify(tags) : null, feedback || null, ratedDate, now).run();
      } catch (e: any) {
        if (/UNIQUE/i.test(String(e?.message || e))) return json({ ok: true, already_rated: true, points_awarded: 0 });
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }

      // 포인트 적립 (규칙 자동 시드: 10P, 하루 5회 한도) — 실패해도 평가 저장은 유지
      let pointsAwarded = 0;
      try {
        await ensurePointTables(env);
        await env.DB.prepare(`INSERT INTO point_rules (code, label, amount, cooldown_sec, daily_cap, enabled, description, updated_at) VALUES ('class_rating','수업 평가 참여',10,0,5,1,'수업 종료 후 강사 평가 제출 시 자동 적립',?) ON CONFLICT(code) DO NOTHING`).bind(now).run();
        const rule: any = await env.DB.prepare(`SELECT * FROM point_rules WHERE code='class_rating' AND enabled=1`).first();
        if (rule) {
          const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
          const cnt: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM point_rule_log WHERE user_id=? AND rule_code='class_rating' AND triggered_at>=?`).bind(studentUid, startOfDay.getTime()).first();
          if (!rule.daily_cap || (cnt?.c || 0) < rule.daily_cap) {
            const r = await applyPointTransaction(env, { userId: studentUid, studentName: body.student_name, type: 'earn', amount: rule.amount, reason: rule.label, ruleCode: 'class_rating', meta: { room_id: roomId, score } });
            await env.DB.prepare(`INSERT INTO point_rule_log (user_id, rule_code, amount, triggered_at, txn_id, meta) VALUES (?,?,?,?,?,?)`)
              .bind(studentUid, 'class_rating', rule.amount, now, r.txnId, JSON.stringify({ room_id: roomId })).run();
            pointsAwarded = rule.amount;
          }
        }
      } catch { /* 포인트 실패 무시 */ }

      return json({ ok: true, teacher_name: teacherName || null, points_awarded: pointsAwarded });
    }

    // ══════════════════════════════════════════════════════════════
    // 🤖 교사 수업 AI 피드백 — 수업 종료 직후 강사에게 잘한점/개선점(한·영) 전달
    // ══════════════════════════════════════════════════════════════

    // ── POST /api/ai-feedback/generate — 한 수업의 코칭 피드백 생성(한/영 동시) ──
    //   body: { room_id(필수), teacher_uid?, teacher_name?, student_name?,
    //           transcript?(수업 전사 일부), signals?:{ talk_ratio, praise_count, engagement, duration_min } }
    if (method === 'POST' && path === '/api/ai-feedback/generate') {
      await ensureTeacherFeedbackTable();
      const b: any = await request.json().catch(() => ({}));
      const roomId = String(b.room_id || '').trim();
      if (!roomId) return json({ ok: false, error: 'room_id_required' }, 400);

      const sig = (b.signals && typeof b.signals === 'object') ? b.signals : {};
      let teacherUid = String(b.teacher_uid || '').trim();
      let teacherName = String(b.teacher_name || '').trim();
      let studentName = String(b.student_name || '').trim();
      let transcript = String(b.transcript || '').slice(0, 6000).trim();

      // ── DB 로 신호 보강(best-effort) — 값이 없을 때만 채움 ──
      let durationMin = Number(sig.duration_min) || 0;
      let praiseCount: number | null = Number.isFinite(+sig.praise_count) ? +sig.praise_count : null;
      let talkRatio: number | null = Number.isFinite(+sig.talk_ratio) ? Math.round(+sig.talk_ratio) : null;
      let engagement = String(sig.engagement || '').trim(); // good|fair|low
      let studentScore: number | null = null;
      let studentNote = '';
      try {
        const t: any = await env.DB.prepare(`SELECT username, user_id, total_session_ms, total_active_ms, joined_at, left_at FROM attendance WHERE room_id=? AND role='teacher' ORDER BY joined_at DESC LIMIT 1`).bind(roomId).first();
        if (t) {
          if (!teacherName && t.username) teacherName = String(t.username);
          if (!teacherUid && t.user_id) teacherUid = String(t.user_id);
          if (!durationMin) {
            const ms = Number(t.total_session_ms) || (t.left_at && t.joined_at ? (t.left_at - t.joined_at) : 0);
            if (ms > 0) durationMin = Math.max(1, Math.round(ms / 60000));
          }
        }
        const s: any = await env.DB.prepare(`SELECT username, total_active_ms FROM attendance WHERE room_id=? AND role='student' AND username IS NOT NULL ORDER BY joined_at DESC LIMIT 1`).bind(roomId).first();
        if (s?.username && !studentName) studentName = String(s.username);
        // 발화비율(교사) = 교사 말한시간 / (교사+학생 말한시간). speaking-time(=total_active_ms) 이 쌓였을 때만.
        if (talkRatio === null) {
          const tActive = Number(t?.total_active_ms) || 0;
          const sActive = Number(s?.total_active_ms) || 0;
          if (tActive + sActive > 0) talkRatio = Math.round((tActive / (tActive + sActive)) * 100);
        }
        if (praiseCount === null) {
          const p: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM point_rule_log WHERE rule_code='teacher_praise_point' AND meta LIKE ?`).bind('%"room_id":"' + roomId + '"%').first();
          praiseCount = Number(p?.c) || 0;
        }
        const r: any = await env.DB.prepare(`SELECT score, feedback FROM class_ratings WHERE room_id=? ORDER BY created_at DESC LIMIT 1`).bind(roomId).first();
        if (r) { studentScore = Number(r.score) || null; studentNote = String(r.feedback || '').slice(0, 400); }
      } catch { /* 신호 없으면 있는 것만으로 생성 */ }

      // ── 전사 확보(선택): 클라이언트가 안 넘겼고 녹화가 있으면 Whisper 로 STT(실패해도 지표로 진행) ──
      if (!transcript && (b.recording_id || b.recording_url)) {
        try {
          const ai0 = (env as any).AI;
          let audioBuf: ArrayBuffer | null = null;
          if (b.recording_id && (env as any).RECORDINGS) {
            const obj: any = await (env as any).RECORDINGS.get(String(b.recording_id));
            if (obj) audioBuf = await obj.arrayBuffer();
          } else if (b.recording_url) {
            const rr = await fetch(String(b.recording_url));
            if (rr.ok) audioBuf = await rr.arrayBuffer();
          }
          if (ai0 && audioBuf && audioBuf.byteLength >= 1000 && audioBuf.byteLength <= 25 * 1024 * 1024) {
            const stt: any = await ai0.run('@cf/openai/whisper', { audio: [...new Uint8Array(audioBuf)] });
            transcript = String(stt?.text || '').slice(0, 6000).trim();
          }
        } catch (e: any) { console.warn('[ai-feedback] STT skip:', e?.message); }
      }

      // ── 신호 요약(프롬프트 주입용) ──
      const signalLines = [
        `Class duration: ${durationMin || '?'} min`,
        talkRatio !== null ? `Teacher talk ratio: ${talkRatio}%` : `Teacher talk ratio: (not measured)`,
        praiseCount !== null ? `Praise given by teacher: ${praiseCount} times` : '',
        engagement ? `Observed student engagement: ${engagement}` : '',
        studentScore ? `Student's own rating: ${studentScore}/7` : '',
        studentNote ? `Student's note: "${studentNote}"` : '',
        transcript ? `Transcript excerpt (may include [mm:ss] marks):\n${transcript}` : 'Transcript: (not provided — base feedback on the metrics above, do NOT invent quotes)'
      ].filter(Boolean).join('\n');

      // ── 강사 코칭 루브릭(만고아이 강사 매뉴얼 요약) ──
      const rubric = [
        '1. Teacher talk ratio — the child should do most of the talking; teacher over ~60% is a flag.',
        '2. Student engagement — did the child stay active and respond?',
        '3. Praise & encouragement — timely, specific praise builds confidence.',
        '4. Question quality — open questions ("Why do you think so?") beat yes/no questions.',
        '5. Wait time — pausing 3-5s lets the child produce language themselves.'
      ].join('\n');

      // ── LLM: 한/영 동시 생성 (점수 + 상세 총평 포함) ──
      let ko: any = null, en: any = null, source = 'ai';
      let score: number | null = null;
      const ai = (env as any).AI;
      if (ai) {
        try {
          const prompt = `You are a warm but honest coaching assistant for an online English tutor who just finished a 1:1 lesson with a Korean child. Using the RUBRIC and SIGNALS, write a DETAILED, encouraging yet candid evaluation. Be concrete; cite [mm:ss] timestamps ONLY if they appear in the transcript. Never invent facts not supported by the signals.

RUBRIC:
${rubric}

SIGNALS:
${signalLines}

Grade the overall lesson quality honestly on 0-100 based on the RUBRIC (discriminate clearly — a lesson where the teacher talks almost the entire time, gives no praise, and shows low student engagement should score LOW, e.g. 30-45; a balanced, encouraging, interactive lesson scores 80+).

Return STRICT JSON only, in BOTH Korean and English:
- "score": integer 0-100 overall lesson quality.
- "good": 2-4 specific strengths.
- "improve": exactly 1 improvement (specific).
- "action": exactly 1 concrete thing to try next class.
- "summary": a DETAILED 3-4 sentence overview that explains WHY this score, referencing the actual metrics (talk ratio, praise count, engagement) and their impact on the child's speaking practice. Make it genuinely helpful, not generic.
{
  "score": <0-100>,
  "metrics": { "engagement": "good|fair|low", "talk_ratio": <number or null>, "praise_count": <number or null> },
  "ko": { "good": ["...", "..."], "improve": "...", "action": "...", "summary": "..." },
  "en": { "good": ["...", "..."], "improve": "...", "action": "...", "summary": "..." }
}`;
          const resp: any = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
            messages: [
              { role: 'system', content: 'You are a supportive but honest teacher-coaching assistant. Reply in strict JSON only, no prose outside JSON.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 1300,
          });
          let text = typeof resp === 'string' ? resp : (typeof resp?.response === 'string' ? resp.response : JSON.stringify(resp?.response || ''));
          const m = String(text || '').match(/\{[\s\S]*\}/);
          if (m) {
            const j = JSON.parse(m[0]);
            ko = j.ko || null; en = j.en || null;
            if (Number.isFinite(+j.score)) score = Math.max(0, Math.min(100, Math.round(+j.score)));
            if (j.metrics) {
              if (!engagement && j.metrics.engagement) engagement = String(j.metrics.engagement);
              if (talkRatio === null && Number.isFinite(+j.metrics.talk_ratio)) talkRatio = Math.round(+j.metrics.talk_ratio);
              if (praiseCount === null && Number.isFinite(+j.metrics.praise_count)) praiseCount = +j.metrics.praise_count;
            }
          }
        } catch (e: any) { console.warn('[ai-feedback] AI fail:', e?.message); }
      }

      // ── 상세 총평(폴백/보강용) — 지표를 실제로 반영한 3~4문장 ──
      const manyTalk = talkRatio !== null && talkRatio > 60;
      const sumKo = `이번 수업은${durationMin ? ` 약 ${durationMin}분 동안 진행됐고,` : ''} ${talkRatio !== null ? `교사 발화 비율이 ${talkRatio}%였어요.` : '전반적으로 무난하게 진행됐어요.'} ${manyTalk ? `교사 발화가 ${talkRatio}%로 높아, 아이가 스스로 영어 문장을 만들어 말할 기회가 많이 부족했습니다. 영어 회화 수업의 핵심은 아이의 발화량이라, 이 부분이 가장 큰 개선 포인트예요.` : '아이가 말할 기회가 비교적 잘 확보되어 회화 연습이 이뤄졌어요.'} ${praiseCount ? `수업 중 칭찬을 ${praiseCount}회 해 주신 점은 아이의 자신감과 흥미 유지에 도움이 됩니다.` : '칭찬이 거의 없었는데, 작은 칭찬만 자주 해줘도 아이가 훨씬 편하게 입을 엽니다.'} ${engagement === 'low' ? '아이의 참여도가 낮게 관찰된 만큼, 흥미를 끌 질문과 리액션을 늘려보세요.' : ''} 다음 수업엔 열린 질문(“Why do you think so?”)과 3~5초 기다리는 시간을 늘려 아이의 발화를 끌어내는 데 집중해 보세요.`;
      const sumEn = `This lesson${durationMin ? ` ran about ${durationMin} min, and` : ''} ${talkRatio !== null ? `your talk ratio was ${talkRatio}%.` : 'went smoothly overall.'} ${manyTalk ? `At ${talkRatio}%, the teacher spoke for most of the lesson, so the child had very few chances to produce English on their own. Since a speaking class lives or dies by how much the student talks, this is the single biggest area to improve.` : 'The child had good room to speak, so real conversation practice happened.'} ${praiseCount ? `Your ${praiseCount} moments of praise helped keep the child's confidence and interest up.` : 'There was little praise — even small, frequent praise gets a child talking far more comfortably.'} ${engagement === 'low' ? 'Engagement looked low, so add more interest-grabbing questions and reactions.' : ''} Next class, focus on open questions ("Why do you think so?") and a 3-5 second wait time to draw out the child's speaking.`;

      // ── 폴백(양쪽 언어) — AI 실패/미바인딩이어도 카드는 항상 채워짐 ──
      if (!ko || !Array.isArray(ko.good)) {
        source = ai ? 'fallback' : 'no_ai';
        ko = {
          good: ['아이가 끝까지 수업에 참여할 수 있도록 편안한 분위기를 만들어 주셨어요.', (praiseCount ? `수업 중 칭찬을 ${praiseCount}회 해 주신 점이 좋았어요.` : '차분한 진행으로 아이가 집중했어요.')],
          improve: manyTalk ? `교사 발화가 ${talkRatio}%로 다소 많았어요. 아이가 말할 틈을 조금 더 만들어 주세요.` : '아이가 스스로 문장을 만들 기회를 조금 더 주면 좋아요.',
          action: '질문 후 5초간 기다려 아이가 먼저 답하게 해보기',
          summary: sumKo
        };
        en = {
          good: ['You kept a comfortable atmosphere so the child stayed engaged the whole lesson.', (praiseCount ? `You praised the student ${praiseCount} times — great encouragement.` : 'Your calm pace helped the child focus.')],
          improve: manyTalk ? `Your talk time was a bit high at ${talkRatio}%. Give the child a little more room to speak.` : 'Give the child a few more chances to produce full sentences on their own.',
          action: 'After asking a question, wait 5 seconds so the child answers first.',
          summary: sumEn
        };
      }
      if (!en || !Array.isArray(en.good)) en = ko;

      // ── AI 총평이 부실(너무 짧음)하면 상세 폴백 총평으로 교체 → 항상 자세한 설명 보장 ──
      if (!ko.summary || String(ko.summary).replace(/[^가-힣A-Za-z]/g, '').length < 25) ko.summary = sumKo;
      if (!en.summary || String(en.summary).replace(/[^A-Za-z]/g, '').length < 40) en.summary = sumEn;

      // ── 점수 미제공 시 지표로 계산 (0~100) ──
      if (score === null) {
        let sc = 72;
        if (talkRatio !== null) { sc += (talkRatio > 60) ? -Math.min(30, Math.round((talkRatio - 60) * 0.6)) : 6; }
        if (praiseCount !== null) sc += Math.min(12, praiseCount * 2);
        if (engagement === 'good') sc += 8; else if (engagement === 'low') sc -= 18;
        score = Math.max(20, Math.min(98, sc));
      }

      const metrics = { engagement: engagement || 'good', talk_ratio: talkRatio, praise_count: praiseCount, score };
      const now = Date.now();
      try {
        await env.DB.prepare(`INSERT INTO teacher_class_feedback (room_id, teacher_uid, teacher_name, student_name, duration_min, metrics_json, feedback_ko, feedback_en, source, created_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(room_id) DO UPDATE SET teacher_uid=excluded.teacher_uid, teacher_name=excluded.teacher_name, student_name=excluded.student_name, duration_min=excluded.duration_min, metrics_json=excluded.metrics_json, feedback_ko=excluded.feedback_ko, feedback_en=excluded.feedback_en, source=excluded.source, created_at=excluded.created_at`)
          .bind(roomId, teacherUid || null, teacherName || null, studentName || null, durationMin || null, JSON.stringify(metrics), JSON.stringify(ko), JSON.stringify(en), source, now).run();
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }

      // 🧠 [판단력 엔진 2단계] 같은 전사·신호로 학생의 '판단 이벤트'를 추출·채점해
      //    judgment_events + judgment_analysis 에 적재(성능 로깅 포함). 교사 피드백 응답은
      //    절대 막지 않도록 ctx.waitUntil 로 백그라운드 실행(없으면 인라인 best-effort).
      //    학생 계정(vc_roster) 을 room 기준으로 해석 — 없으면 내부에서 조용히 스킵.
      try {
        let studentUidJ = '';
        try {
          const su: any = await env.DB.prepare(`SELECT account_uid FROM vc_roster WHERE room_id=? AND role='student' AND account_uid IS NOT NULL ORDER BY updated_at DESC LIMIT 1`).bind(roomId).first();
          studentUidJ = String(su?.account_uid || '').trim();
        } catch { /* roster 없으면 빈 값 → 내부 스킵 */ }
        const judgeInput = {
          roomId, studentUid: studentUidJ, studentName: studentName || undefined,
          scheduleId: (b.schedule_id != null ? Number(b.schedule_id) : null),
          lessonDate: (b.lesson_date || undefined), transcript, lang: 'en',
          judgments: Array.isArray(b.judgments) ? b.judgments : undefined,
        };
        const p = runJudgmentAnalysis(env, judgeInput).catch((e: any) => console.warn('[judgment] enqueue fail:', e?.message));
        if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p); else await p;
      } catch (e: any) { console.warn('[judgment] hook skip:', e?.message); }

      return json({ ok: true, room_id: roomId, teacher_uid: teacherUid || null, teacher_name: teacherName || null, student_name: studentName || null, duration_min: durationMin || null, metrics, feedback_ko: ko, feedback_en: en, source, generated_at: now });
    }

    // ══════════════════════════════════════════════════════════════
    // 🔀 판단력 데이터 Mode B(Celery/Redis) 이관 추출 — 관리자 전용
    //   정본 엔벨로프(raw_json)를 조인 없이 JSONL/JSON 으로 증분 추출.
    //   운영: since_id 커서로 반복 호출 → NCP FastAPI 로 POST → mark-migrated.
    // ══════════════════════════════════════════════════════════════

    // ── GET /api/admin/judgment/export?since_id=&limit=&format=jsonl|json&all=1 ──
    if (method === 'GET' && path === '/api/admin/judgment/export') {
      const adm = await checkAdminSession(request, env as any);
      if (!adm.ok) return json({ ok: false, error: 'admin_required' }, 401);
      const sinceId = parseInt(url.searchParams.get('since_id') || '0', 10) || 0;
      const limit = parseInt(url.searchParams.get('limit') || '200', 10) || 200;
      const includeMigrated = url.searchParams.get('all') === '1';
      const fmt = (url.searchParams.get('format') || 'jsonl').toLowerCase();
      const { rows, max_id } = await exportJudgmentEnvelopes(env, { sinceId, limit, includeMigrated });
      if (fmt === 'json') {
        return json({ ok: true, count: rows.length, max_id, next_cursor: max_id, envelopes: rows.map((r) => r.envelope) });
      }
      // JSONL — 한 줄 = 한 엔벨로프 (Mode B 스트리밍 인제스트에 최적)
      const body = rows.map((r) => JSON.stringify(r.envelope)).join('\n');
      return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Max-Id': String(max_id), 'X-Count': String(rows.length), 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } });
    }

    // ── POST /api/admin/judgment/mark-migrated  body:{ ids:[...] } ── (이관 완료 표시, 멱등) ──
    if (method === 'POST' && path === '/api/admin/judgment/mark-migrated') {
      const adm = await checkAdminSession(request, env as any);
      if (!adm.ok) return json({ ok: false, error: 'admin_required' }, 401);
      const body: any = await request.json().catch(() => ({}));
      const ids = Array.isArray(body.ids) ? body.ids : [];
      const marked = await markJudgmentMigrated(env, ids);
      return json({ ok: true, marked });
    }

    // ── POST /api/admin/judgment/snapshot  body:{ period?, uid? } ── (성장 스냅샷 배치, 관리자) ──
    if (method === 'POST' && path === '/api/admin/judgment/snapshot') {
      const adm = await checkAdminSession(request, env as any);
      if (!adm.ok) return json({ ok: false, error: 'admin_required' }, 401);
      const body: any = await request.json().catch(() => ({}));
      try {
        const r = await runGrowthSnapshot(env, { period: body.period || undefined, studentUid: (body.uid || '').trim() || undefined });
        return json({ ok: true, ...r });
      } catch (e: any) { return json({ ok: false, error: String(e?.message || e) }, 500); }
    }

    // ══════════════════════════════════════════════════════════════
    // 🧠 3단계 학생/학부모용 — 판단력 성장 리포트 + 맞춤 시나리오
    //   본인(토큰) 또는 관리자(세션)만. IDOR 차단.
    // ══════════════════════════════════════════════════════════════

    // ── GET /api/judgment/growth?uid= — 성장 추이(레이더 5축 + 추세선) — 학습 진척도(uid 기반) ──
    if (method === 'GET' && path === '/api/judgment/growth') {
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      try {
        const report = await getGrowthReport(env, uid);
        return json({ ok: true, ...report });
      } catch (e: any) { return json({ ok: false, error: String(e?.message || e) }, 500); }
    }

    // ── POST /api/judgment/scenario  body:{ uid } — 취약 패턴 맞춤 시나리오 1건 (학습 액션: uid 기반) ──
    if (method === 'POST' && path === '/api/judgment/scenario') {
      const body: any = await request.json().catch(() => ({}));
      const uid = (body.uid || url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      try {
        const sc = await generatePersonalizedScenario(env, uid, body.lang || 'en', (body.textbook || '').toString().trim() || undefined);
        return json(sc, 200);
      } catch (e: any) { return json({ ok: false, error: String(e?.message || e) }, 500); }
    }

    // ── POST /api/judgment/answer — 판단력 훈련 답안(선택+이유) 채점 + 기록 (학습 액션) ──
    //   body: { uid, student_name?, situation, skill_tag?, options[], chosen_index, correct_index?, reasoning, lang? }
    if (method === 'POST' && path === '/api/judgment/answer') {
      const body: any = await request.json().catch(() => ({}));
      const uid = (body.uid || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      if (!Array.isArray(body.options) || body.options.length < 2) return json({ ok: false, error: 'options_required' }, 400);
      if (!Number.isInteger(body.chosen_index)) return json({ ok: false, error: 'chosen_index_required' }, 400);
      try {
        const r = await evaluateJudgmentAnswer(env, {
          studentUid: uid, studentName: body.student_name || null,
          situation: String(body.situation || '').slice(0, 500), skillTag: body.skill_tag,
          options: body.options, chosenIndex: body.chosen_index,
          correctIndex: (body.correct_index == null ? null : Number(body.correct_index)),
          reasoning: String(body.reasoning || ''), lang: body.lang || 'en',
        });
        return json(r);
      } catch (e: any) { return json({ ok: false, error: String(e?.message || e) }, 500); }
    }

    // ── POST /api/judgment/inclass — 🎥 수업 중 실시간 판단 캡처(학습 액션, 사장님 승인 2026-07-21) ──
    //   body: { room_id, uid, name?, items:[{ text, ts? }] }  — 학생 본인 공개 채팅 발화 청크.
    //   설계 원칙(수업 절대 안 끊김): 즉시 202 응답 + ctx.waitUntil 백그라운드 분석.
    //   수업 통신 경로(WS/DO)와 완전 분리된 별도 HTTP 경로. 실패해도 수업엔 무영향.
    //   멱등: 청크 내용 해시를 event_uid 접두사로 사용 → 같은 청크 재전송돼도 중복 적재 없음.
    //   킬스위치: KV 'judg:inclass:off' 존재 시 수집 중단(클라도 disabled 응답 보고 스스로 꺼짐).
    if (method === 'POST' && path === '/api/judgment/inclass') {
      const b: any = await request.json().catch(() => ({}));
      const roomId = String(b.room_id || '').trim().slice(0, 120);
      const uid = String(b.uid || '').trim().slice(0, 80);
      const rawItems = Array.isArray(b.items) ? b.items.slice(0, 40) : [];
      if (!roomId || !uid || !rawItems.length) return json({ ok: false, error: 'bad_request' }, 400);
      const kvJ = (env as any).SESSION_STATE as KVNamespace | undefined;
      try { if (kvJ && await kvJ.get('judg:inclass:off')) return json({ ok: true, disabled: true }); } catch { /* KV 불가 시 계속 */ }
      // 발화 정제: 문자열만, 2~300자, 공백 정규화
      const lines: string[] = [];
      for (const it of rawItems) {
        const t = String((it && it.text) || '').replace(/\s+/g, ' ').trim().slice(0, 300);
        if (t.length >= 2) lines.push(t);
      }
      if (!lines.length) return json({ ok: false, error: 'no_material' }, 400);
      // 남용 가드: uid 당 시간당 40청크(레이스 허용 best-effort)
      try {
        if (kvJ) {
          const rlKey = `judg:ic:rl:${uid}:${Math.floor(Date.now() / 3600_000)}`;
          const n = parseInt((await kvJ.get(rlKey)) || '0', 10) || 0;
          if (n >= 40) return json({ ok: false, error: 'rate_limited' }, 429);
          await kvJ.put(rlKey, String(n + 1), { expirationTtl: 3700 });
        }
      } catch { /* 가드 실패는 무시(수집이 우선) */ }
      const transcript = lines.map((l) => `Student: ${l}`).join('\n').slice(0, 6000);
      const chunkHash = (await sha256hex(roomId + '|' + uid + '|' + transcript)).slice(0, 16);
      const p = runJudgmentAnalysis(env, {
        roomId, studentUid: uid, studentName: String(b.name || '').slice(0, 80) || undefined,
        transcript, lang: 'en', eventUidPrefix: `${roomId}#ic:${chunkHash}`,
      }).catch((e: any) => console.warn('[judgment] inclass enqueue fail:', e?.message));
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p); else await p;
      return json({ ok: true, queued: lines.length }, 202);
    }

    // ── GET /api/ai-feedback?room_id=  또는  ?teacher_uid=&limit= — 피드백 조회 ──
    if (method === 'GET' && path === '/api/ai-feedback') {
      await ensureTeacherFeedbackTable();
      const pj = (s: any, dflt: any) => { try { return s ? JSON.parse(s) : dflt; } catch { return dflt; } };
      const roomId = (url.searchParams.get('room_id') || '').trim();
      const teacherUid = (url.searchParams.get('teacher_uid') || '').trim();
      const teacherName = (url.searchParams.get('teacher_name') || '').trim();
      const parseRow = (r: any) => ({
        room_id: r.room_id, teacher_uid: r.teacher_uid, teacher_name: r.teacher_name, student_name: r.student_name,
        duration_min: r.duration_min, metrics: pj(r.metrics_json, {}),
        feedback_ko: pj(r.feedback_ko, null), feedback_en: pj(r.feedback_en, null),
        source: r.source, generated_at: r.created_at
      });
      try {
        // 관리자 검수용: 최근 N건(전체 강사) — ?recent=1&days=&limit=
        if (url.searchParams.get('recent')) {
          const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
          const days = Math.min(365, Math.max(0, parseInt(url.searchParams.get('days') || '30', 10) || 0));
          const since = days ? Date.now() - days * 86400 * 1000 : 0;
          const rs = await env.DB.prepare(`SELECT * FROM teacher_class_feedback WHERE created_at>=? ORDER BY created_at DESC LIMIT ?`).bind(since, limit).all();
          return json({ ok: true, count: rs.results?.length || 0, rows: (rs.results || []).map(parseRow) });
        }
        if (roomId) {
          const r: any = await env.DB.prepare(`SELECT * FROM teacher_class_feedback WHERE room_id=? LIMIT 1`).bind(roomId).first();
          return json({ ok: true, feedback: r ? parseRow(r) : null });
        }
        if (teacherUid || teacherName) {
          const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10) || 20));
          const rs = teacherUid
            ? await env.DB.prepare(`SELECT * FROM teacher_class_feedback WHERE teacher_uid=? ORDER BY created_at DESC LIMIT ?`).bind(teacherUid, limit).all()
            : await env.DB.prepare(`SELECT * FROM teacher_class_feedback WHERE teacher_name=? ORDER BY created_at DESC LIMIT ?`).bind(teacherName, limit).all();
          return json({ ok: true, count: rs.results?.length || 0, rows: (rs.results || []).map(parseRow) });
        }
        return json({ ok: false, error: 'room_id_or_teacher_required' }, 400);
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    // ── GET /api/ratings/check?room_id=&uid= — 오늘 이 방을 이미 평가했는지 ──
    if (method === 'GET' && path === '/api/ratings/check') {
      const roomId = (url.searchParams.get('room_id') || '').trim();
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!roomId || !uid) return json({ ok: false, error: 'room_id_and_uid_required' }, 400);
      try {
        await ensureClassRatingsTable();
        const row: any = await env.DB.prepare(`SELECT id FROM class_ratings WHERE room_id=? AND student_uid=? AND rated_date=?`).bind(roomId, uid, today()).first();
        return json({ ok: true, rated: !!row });
      } catch {
        return json({ ok: true, rated: false });
      }
    }

    // ── GET /api/admin/ratings/summary?days=30 — 강사별 평균/건수/태그 집계 ──
    if (method === 'GET' && path === '/api/admin/ratings/summary') {
      await ensureClassRatingsTable();
      const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10) || 30));
      const since = Date.now() - days * 86400 * 1000;
      // 🔐 강사(teacher) 로그인 시엔 본인 평가만 집계(타 강사 평점·건의사항 노출 방지)
      const _rsumActor = await getAdminActor(request, env as any);
      const _rsumOwn = _rsumActor.isTeacher ? _rsumActor.name : '';
      const rs = _rsumOwn
        ? await env.DB.prepare(`SELECT teacher_name, score, tags FROM class_ratings WHERE created_at>=? AND LOWER(TRIM(teacher_name))=LOWER(TRIM(?))`).bind(since, _rsumOwn).all()
        : await env.DB.prepare(`SELECT teacher_name, score, tags FROM class_ratings WHERE created_at>=?`).bind(since).all();
      const byTeacher: Record<string, { count: number; sum: number; low: number; tags: Record<string, number> }> = {};
      for (const row of (rs.results || []) as any[]) {
        const name = row.teacher_name || '(미확인)';
        const t = byTeacher[name] || (byTeacher[name] = { count: 0, sum: 0, low: 0, tags: {} });
        t.count++; t.sum += row.score;
        if (row.score <= 2) t.low++;
        if (row.tags) {
          try { for (const tag of JSON.parse(row.tags)) t.tags[tag] = (t.tags[tag] || 0) + 1; } catch {}
        }
      }
      const rows = Object.entries(byTeacher).map(([teacher_name, t]) => ({
        teacher_name,
        count: t.count,
        avg_score: Math.round((t.sum / t.count) * 100) / 100,
        low_count: t.low,
        top_tags: Object.entries(t.tags).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag, n]) => ({ tag, count: n })),
      })).sort((a, b) => b.count - a.count);
      return json({ ok: true, days, total: (rs.results || []).length, rows });
    }

    // ── GET /api/admin/ratings/list?teacher_name=&days=30&limit=50 — 개별 평가(건의사항 포함) ──
    if (method === 'GET' && path === '/api/admin/ratings/list') {
      await ensureClassRatingsTable();
      const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10) || 30));
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
      let teacher = (url.searchParams.get('teacher_name') || '').trim();
      // 🔐 강사(teacher) 로그인 시엔 항상 본인 평가만(요청한 teacher_name 무시)
      const _rlistActor = await getAdminActor(request, env as any);
      if (_rlistActor.isTeacher) {
        if (!_rlistActor.name) return json({ ok: false, error: 'teacher_identity_missing' }, 403);
        teacher = _rlistActor.name;
      }
      const since = Date.now() - days * 86400 * 1000;
      const rs = teacher
        ? await env.DB.prepare(`SELECT id, room_id, student_name, teacher_name, score, tags, feedback, rated_date, created_at FROM class_ratings WHERE created_at>=? AND teacher_name=? ORDER BY created_at DESC LIMIT ?`).bind(since, teacher, limit).all()
        : await env.DB.prepare(`SELECT id, room_id, student_name, teacher_name, score, tags, feedback, rated_date, created_at FROM class_ratings WHERE created_at>=? ORDER BY created_at DESC LIMIT ?`).bind(since, limit).all();
      return json({ ok: true, rows: rs.results || [] });
    }

    // ── GET /api/admin/ratings/analytics?teacher_name=&days= — 절사평균 분석 + 분포/추이 ──
    //   최고점·최저점 각 1개씩 제외한 절사평균(trimmed mean) + 점수 분포 + 일자별 추이 + 등급
    if (method === 'GET' && path === '/api/admin/ratings/analytics') {
      await ensureClassRatingsTable();
      const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '90', 10) || 90));
      let teacher = (url.searchParams.get('teacher_name') || '').trim();
      // 🔐 강사(teacher) 로그인 시엔 항상 본인 평가만(요청한 teacher_name 무시)
      const _ranActor = await getAdminActor(request, env as any);
      if (_ranActor.isTeacher) {
        if (!_ranActor.name) return json({ ok: false, error: 'teacher_identity_missing' }, 403);
        teacher = _ranActor.name;
      }
      const since = Date.now() - days * 86400 * 1000;
      const rs = teacher
        ? await env.DB.prepare(`SELECT score, tags, created_at FROM class_ratings WHERE created_at>=? AND teacher_name=? ORDER BY created_at ASC`).bind(since, teacher).all()
        : await env.DB.prepare(`SELECT score, tags, created_at FROM class_ratings WHERE created_at>=? ORDER BY created_at ASC`).bind(since).all();
      const rows = (rs.results || []) as any[];
      const scores = rows.map(r => r.score as number);
      const count = scores.length;
      const round2 = (n: number) => Math.round(n * 100) / 100;
      const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
      const rawAvg = count ? sum(scores) / count : 0;
      // 절사평균: 최저 1개 + 최고 1개 제외 (표본 3개 이상일 때만 의미)
      let trimmed = rawAvg;
      let trimmedDropped = 0;
      if (count >= 3) {
        const sorted = scores.slice().sort((a, b) => a - b);
        const inner = sorted.slice(1, sorted.length - 1);
        trimmed = inner.length ? sum(inner) / inner.length : rawAvg;
        trimmedDropped = 2;
      }
      const distribution = [1, 2, 3, 4, 5, 6, 7].map(s => ({ score: s, count: scores.filter(x => x === s).length }));
      // 일자별 추이 (KST)
      const byDay: Record<string, number[]> = {};
      for (const r of rows) { const d = today(r.created_at as number); (byDay[d] = byDay[d] || []).push(r.score as number); }
      const trend = Object.keys(byDay).sort().map(d => ({ date: d, avg: round2(sum(byDay[d]) / byDay[d].length), count: byDay[d].length }));
      // 태그 집계
      const tagCount: Record<string, number> = {};
      for (const r of rows) { if (r.tags) { try { for (const t of JSON.parse(r.tags)) tagCount[t] = (tagCount[t] || 0) + 1; } catch {} } }
      const top_tags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag, c]) => ({ tag, count: c }));
      const low_count = scores.filter(x => x <= 2).length;
      const high_count = scores.filter(x => x >= 6).length;
      const grade = trimmed >= 6 ? 'excellent' : trimmed >= 5 ? 'good' : trimmed >= 4 ? 'fair' : 'needs_improvement';
      // 추이 방향 (전반부 vs 후반부 절사평균 비교)
      let trendDir = 'flat';
      if (trend.length >= 4) {
        const half = Math.floor(trend.length / 2);
        const firstAvg = sum(trend.slice(0, half).map(t => t.avg)) / half;
        const secondAvg = sum(trend.slice(half).map(t => t.avg)) / (trend.length - half);
        if (secondAvg - firstAvg >= 0.4) trendDir = 'up';
        else if (firstAvg - secondAvg >= 0.4) trendDir = 'down';
      }
      return json({
        ok: true, teacher_name: teacher || null, days, count,
        raw_avg: round2(rawAvg), trimmed_avg: round2(trimmed), trimmed_dropped: trimmedDropped,
        min: count ? Math.min(...scores) : 0, max: count ? Math.max(...scores) : 0,
        low_count, high_count, distribution, trend, top_tags, grade, trend_dir: trendDir,
      });
    }

    // ── GET /api/teacher/my-ratings?teacher_name=&days=&limit= — 강사 본인용(무기명) ──
    //   강사에게는 학생 신원을 절대 노출하지 않음 → SELECT 에서 student_name 아예 제외.
    //   (솔직한 평가 유도: 강사가 누가 줬는지 알 수 없어야 함). 관리자는 /api/admin/ratings/list 사용(기명).
    if (method === 'GET' && path === '/api/teacher/my-ratings') {
      await ensureClassRatingsTable();
      const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '90', 10) || 90));
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
      const teacher = (url.searchParams.get('teacher_name') || '').trim();
      if (!teacher) return json({ ok: false, error: 'teacher_name_required' }, 400);
      const since = Date.now() - days * 86400 * 1000;
      const rs = await env.DB.prepare(`SELECT id, room_id, score, tags, feedback, rated_date, created_at FROM class_ratings WHERE created_at>=? AND teacher_name=? ORDER BY created_at DESC LIMIT ?`).bind(since, teacher, limit).all();
      return json({ ok: true, anonymous: true, rows: rs.results || [] });
    }

    // ── GET /api/admin/points/rules — 자동 적립 규칙 목록 ──
    if (method === 'GET' && path === '/api/admin/points/rules') {
      await ensurePointTables(env);
      const rs = await env.DB.prepare(`SELECT * FROM point_rules ORDER BY code`).all();
      return json({ ok: true, rows: rs.results || [] });
    }

    // ── PUT /api/admin/points/rules — 자동 적립 규칙 갱신/생성 ──
    if (method === 'PUT' && path === '/api/admin/points/rules') {
      await ensurePointTables(env);
      const body: any = await request.json().catch(() => ({}));
      const code = (body.code || '').trim();
      if (!code) return json({ ok: false, error: 'code_required' }, 400);
      const now = Date.now();
      await env.DB.prepare(`INSERT INTO point_rules (code, label, amount, cooldown_sec, daily_cap, enabled, description, updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET label=excluded.label, amount=excluded.amount, cooldown_sec=excluded.cooldown_sec, daily_cap=excluded.daily_cap, enabled=excluded.enabled, description=excluded.description, updated_at=excluded.updated_at`)
        .bind(code, body.label || code, parseInt(body.amount, 10) || 0, parseInt(body.cooldown_sec, 10) || 0, body.daily_cap ? parseInt(body.daily_cap, 10) : null, body.enabled === false ? 0 : 1, body.description || null, now).run();
      return json({ ok: true, code });
    }

    // ── GET /api/gifts/catalog — 학생용 기프티콘 카탈로그 (활성화된 것만) ──
    if (method === 'GET' && path === '/api/gifts/catalog') {
      await ensurePointTables(env);
      // 🎁 카탈로그가 비어있으면 서버가 최초 1회 자동 시드(멱등).
      //   예전엔 학생 화면(index.html)이 관리자 API /api/admin/gifts/seed-catalog 를
      //   직접 호출해서 채웠는데(그래서 그 admin API 를 공개로 열어둬야 했음),
      //   이제 공개 읽기 시 서버가 알아서 시드하므로 그 공개 예외가 필요 없어졌다.
      const cnt: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM gift_catalog WHERE enabled=1`).first();
      if (!cnt || (cnt.c || 0) === 0) { try { await seedGiftCatalog(env); } catch {} }
      const rs = await env.DB.prepare(`SELECT id, brand, name, category, face_value, point_price, thumbnail_url, stock, description FROM gift_catalog WHERE enabled=1 ORDER BY sort_order ASC, point_price ASC`).all();
      return json({ ok: true, rows: rs.results || [] });
    }

    // ── GET /api/points/leaderboard — 학원 랭킹(공개, 최소필드) ──
    //   예전엔 index.html 이 관리자 API /api/admin/points/list(전체 학생 balance 상세)를
    //   그대로 불러 리더보드를 그렸다 → 학생 전원의 상세 포인트가 무인증 노출.
    //   이제 top-N + (이름·포인트)만 주는 전용 공개 엔드포인트로 분리해 노출을 최소화한다.
    if (method === 'GET' && path === '/api/points/leaderboard') {
      await ensurePointTables(env);
      const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '10', 10) || 10, 1), 50);
      const rs = await env.DB.prepare(
        `SELECT user_id, student_name, lifetime_earned FROM student_points ORDER BY lifetime_earned DESC, updated_at DESC LIMIT ?`
      ).bind(limit).all();
      // user_id 는 본인 하이라이트용으로만 필요 → 그대로 두되 balance 등 민감 필드는 제외.
      return json({ ok: true, rows: rs.results || [] });
    }

    // ── GET /api/admin/gifts/catalog — 관리자 카탈로그 (전체) ──
    if (method === 'GET' && path === '/api/admin/gifts/catalog') {
      await ensurePointTables(env);
      const rs = await env.DB.prepare(`SELECT * FROM gift_catalog ORDER BY sort_order ASC, id ASC`).all();
      return json({ ok: true, rows: rs.results || [] });
    }

    // ── POST /api/admin/gifts/catalog — 카탈로그 추가/수정 ──
    //   body: { id?, brand, name, category, face_value, point_price, thumbnail_url?, stock?, enabled?, sort_order?, description?, external_id? }
    if (method === 'POST' && path === '/api/admin/gifts/catalog') {
      await ensurePointTables(env);
      const body: any = await request.json().catch(() => ({}));
      const now = Date.now();
      if (body.id) {
        await env.DB.prepare(`UPDATE gift_catalog SET external_id=?, brand=?, name=?, category=?, face_value=?, point_price=?, thumbnail_url=?, stock=?, enabled=?, sort_order=?, description=?, updated_at=? WHERE id=?`)
          .bind(body.external_id || null, body.brand || null, body.name, body.category || null, parseInt(body.face_value,10)||0, parseInt(body.point_price,10)||0, body.thumbnail_url || null, body.stock != null ? parseInt(body.stock,10) : null, body.enabled === false ? 0 : 1, parseInt(body.sort_order,10) || 0, body.description || null, now, body.id).run();
        return json({ ok: true, id: body.id, updated: true });
      } else {
        const ins = await env.DB.prepare(`INSERT INTO gift_catalog (external_id, brand, name, category, face_value, point_price, thumbnail_url, stock, enabled, sort_order, description, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(body.external_id || null, body.brand || null, body.name, body.category || null, parseInt(body.face_value,10)||0, parseInt(body.point_price,10)||0, body.thumbnail_url || null, body.stock != null ? parseInt(body.stock,10) : null, body.enabled === false ? 0 : 1, parseInt(body.sort_order,10) || 0, body.description || null, now, now).run();
        return json({ ok: true, id: ins?.meta?.last_row_id, created: true });
      }
    }

    // ── POST /api/gifts/redeem — 학생 기프티콘 교환 신청 (포인트 차감 + 발송 큐) ──
    //   body: { user_id, student_name?, catalog_id, recipient_phone, recipient_name? }
    //   기프티쇼 비즈 API 키 없으면 status='pending', 있으면 실제 발송 시도
    if (method === 'POST' && path === '/api/gifts/redeem') {
      await ensurePointTables(env);
      const body: any = await request.json().catch(() => ({}));
      const userId = (body.user_id || '').trim();
      const catalogId = parseInt(body.catalog_id, 10) || 0;
      const phone = (body.recipient_phone || '').replace(/[^0-9]/g, '');
      if (!userId || !catalogId || !phone) return json({ ok: false, error: 'missing_required', need: 'user_id, catalog_id, recipient_phone' }, 400);
      if (phone.length < 10) return json({ ok: false, error: 'invalid_phone' }, 400);
      // 🔐 [PII] 소유자 검증 — 남의 포인트로 기프티콘 탈취(IDOR) 차단.
      //   로그인 시 발급된 mango_token 의 uid 와 결제 대상 user_id 가 일치해야 함.
      const gAuthUid = await authUidGlobal(request, url, env, body);
      if (!gAuthUid || gAuthUid !== userId) {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 본인만 교환할 수 있습니다.' }, 401);
      }
      const item: any = await env.DB.prepare(`SELECT * FROM gift_catalog WHERE id=? AND enabled=1`).bind(catalogId).first();
      if (!item) return json({ ok: false, error: 'gift_not_found_or_disabled' }, 404);
      if (item.stock != null && item.stock <= 0) return json({ ok: false, error: 'out_of_stock' }, 409);
      const balanceRow: any = await env.DB.prepare(`SELECT balance FROM student_points WHERE user_id=?`).bind(userId).first();
      const currentBalance = balanceRow?.balance || 0;
      if (currentBalance < item.point_price) return json({ ok: false, error: 'insufficient_points', balance: currentBalance, need: item.point_price }, 402);
      const now = Date.now();
      // 1) gift_redemptions 행 INSERT (pending)
      const insR = await env.DB.prepare(`INSERT INTO gift_redemptions (user_id, student_name, catalog_id, gift_name, gift_brand, face_value, point_price, recipient_phone, recipient_name, status, requested_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(userId, body.student_name || null, catalogId, item.name, item.brand, item.face_value, item.point_price, phone, body.recipient_name || null, 'pending', now).run();
      const redemptionId = insR?.meta?.last_row_id as number;
      // 2) 포인트 차감
      let spendTxn: any = null;
      try {
        spendTxn = await applyPointTransaction(env, {
          userId, studentName: body.student_name, type: 'spend',
          amount: item.point_price, reason: `[교환] ${item.brand || ''} ${item.name}`, redemptionId,
        });
        await env.DB.prepare(`UPDATE gift_redemptions SET txn_spend_id=? WHERE id=?`).bind(spendTxn.txnId, redemptionId).run();
      } catch (e: any) {
        await env.DB.prepare(`UPDATE gift_redemptions SET status='failed', failed_at=?, error_message=? WHERE id=?`).bind(now, String(e?.message||e), redemptionId).run();
        return json({ ok: false, error: 'point_deduction_failed', detail: String(e?.message||e) }, 500);
      }
      // 3) 재고 차감
      if (item.stock != null) {
        await env.DB.prepare(`UPDATE gift_catalog SET stock=MAX(0,stock-1), updated_at=? WHERE id=?`).bind(now, catalogId).run();
      }
      // 4) 🎁 Phase P4: 기프티쇼 비즈 API 자동 발송
      //    API 키 + 상품에 external_id 모두 있으면 즉시 자동발송 시도
      //    실패 시 자동 환불 + status='failed' 기록 → 학생에게 즉시 안내
      const mode = getGiftishowMode(env);
      let sendResult: any = null;
      let finalStatus = 'pending';
      let responseMessage = '';

      if (mode === 'disabled') {
        // API 키 미설정 → pending 유지, 관리자 수동 발송 대기
        responseMessage = '신청 접수됨 - 관리자가 곧 발송해 드립니다 (API 키 미설정)';
      } else if (!item.external_id) {
        // 상품에 외부 코드 없음 → pending 유지
        responseMessage = '신청 접수됨 - 상품에 기프티쇼 코드가 없어 관리자 수동 발송 대기';
      } else {
        // 자동 발송 시도
        try {
          sendResult = await sendCoupon(env, {
            externalProductCode: item.external_id,
            recipientPhone: phone,
            recipientName: body.recipient_name || body.student_name,
            internalOrderId: redemptionId,
            msgTitle: `[망고아이] ${item.brand || ''} 선물이 도착했어요! 🎁`,
            msgBody: `망고아이 포인트로 교환한 ${item.name} 입니다. 카카오톡 선물함에서 확인해주세요.`,
          });
        } catch (e: any) {
          sendResult = { ok: false, status: 'failed', message: '발송 호출 오류: ' + String(e?.message||e) };
        }
        if (sendResult.ok && sendResult.status === 'sent') {
          finalStatus = 'sent';
          await env.DB.prepare(`UPDATE gift_redemptions SET status='sent', sent_at=?, external_order_id=?, external_coupon_code=?, meta=? WHERE id=?`)
            .bind(now, sendResult.externalOrderId || null, sendResult.externalCouponCode || null, sendResult.raw ? JSON.stringify({mode:sendResult.mode, raw:sendResult.raw}) : null, redemptionId).run();
          responseMessage = (mode === 'mock')
            ? `[TEST MODE] 발송 완료 (실제 카톡은 가지 않음 - 테스트 모드 OFF 후 재시도)`
            : `🎁 카카오톡으로 발송 완료! 잠시 후 선물함에 도착합니다.`;
        } else {
          // 발송 실패 → 자동 환불
          finalStatus = 'failed';
          const errMsg = sendResult.message || sendResult.error || '발송 실패';
          await env.DB.prepare(`UPDATE gift_redemptions SET status='failed', failed_at=?, error_message=?, meta=? WHERE id=?`)
            .bind(now, errMsg, sendResult.raw ? JSON.stringify(sendResult.raw) : null, redemptionId).run();
          // 포인트 자동 환불
          try {
            const refundTxn = await applyPointTransaction(env, {
              userId, studentName: body.student_name, type: 'refund',
              amount: item.point_price, reason: `[자동 환불] 발송 실패: ${errMsg.slice(0, 80)}`,
              redemptionId, actorId: 'system', actorName: '시스템',
            });
            await env.DB.prepare(`UPDATE gift_redemptions SET status='refunded', refunded_at=?, txn_refund_id=? WHERE id=?`)
              .bind(now, refundTxn.txnId, redemptionId).run();
            // 재고 복구
            if (item.stock != null) {
              await env.DB.prepare(`UPDATE gift_catalog SET stock=stock+1, updated_at=? WHERE id=?`).bind(now, catalogId).run();
            }
            finalStatus = 'refunded';
            responseMessage = `❌ 발송 실패 — 포인트 자동 환불 완료. 사유: ${errMsg}`;
            // 환불된 잔액으로 갱신
            spendTxn.newBalance = refundTxn.newBalance;
          } catch (refundErr: any) {
            responseMessage = `❌ 발송 실패: ${errMsg}. 환불도 실패 - 관리자에게 문의: ${String(refundErr?.message||refundErr)}`;
          }
        }
      }

      // finalStatus==='failed' 는 발송도 환불도 실패한 최악의 경우(포인트 소진 + 선물 미발송) — ok:false 로 명확히 알림
      return json({
        ok: finalStatus !== 'failed',
        redemption_id: redemptionId,
        status: finalStatus,
        balance_after: spendTxn.newBalance,
        message: responseMessage,
        send_mode: mode,
        gift: { brand: item.brand, name: item.name, face_value: item.face_value, point_price: item.point_price },
      }, finalStatus === 'failed' ? 502 : 200);
    }

    // ── GET /api/gifts/redemptions?uid=xxx — 학생 본인 교환 내역 ──
    if (method === 'GET' && path === '/api/gifts/redemptions') {
      await ensurePointTables(env);
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 [PII] 본인 또는 관리자만 — 남의 기프티콘 전화번호·쿠폰코드 열람 차단(IDOR)
      const grAuth = await authUidGlobal(request, url, env);
      if (grAuth !== uid) {
        const grAdmin = await checkAdminSession(request, env as any);
        if (!grAdmin.ok) return json({ ok: false, error: 'auth_required' }, 401);
      }
      const rs = await env.DB.prepare(`SELECT id, catalog_id, gift_name, gift_brand, face_value, point_price, recipient_phone, status, external_coupon_code, requested_at, sent_at, delivered_at, failed_at, error_message FROM gift_redemptions WHERE user_id=? ORDER BY requested_at DESC LIMIT 100`).bind(uid).all();
      return json({ ok: true, rows: rs.results || [] });
    }

    // ── GET /api/admin/gifts/redemptions — 관리자 전체 교환 내역 ──
    if (method === 'GET' && path === '/api/admin/gifts/redemptions') {
      await ensurePointTables(env);
      const status = url.searchParams.get('status') || '';
      let q = `SELECT * FROM gift_redemptions`;
      const binds: any[] = [];
      if (status) { q += ` WHERE status=?`; binds.push(status); }
      q += ` ORDER BY requested_at DESC LIMIT 500`;
      const rs = await env.DB.prepare(q).bind(...binds).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ── POST /api/admin/gifts/redemptions/:id/mark — 관리자 수동 상태 변경 ──
    //   body: { status: 'sent'|'delivered'|'failed'|'refunded', coupon_code?, error_message? }
    //   refunded 일 때는 포인트 환불도 자동 처리
    if (method === 'POST' && /^\/api\/admin\/gifts\/redemptions\/\d+\/mark$/.test(path)) {
      await ensurePointTables(env);
      const id = parseInt(path.split('/')[5] || '0', 10);
      if (!id) return json({ ok: false, error: 'invalid_id' }, 400);
      const body: any = await request.json().catch(() => ({}));
      const status = String(body.status || '').toLowerCase();
      if (!['sent','delivered','failed','refunded'].includes(status)) return json({ ok: false, error: 'invalid_status' }, 400);
      const red: any = await env.DB.prepare(`SELECT * FROM gift_redemptions WHERE id=?`).bind(id).first();
      if (!red) return json({ ok: false, error: 'not_found' }, 404);
      const now = Date.now();
      const updates: any = { status, error_message: body.error_message || null };
      if (status === 'sent') updates.sent_at = now;
      if (status === 'delivered') updates.delivered_at = now;
      if (status === 'failed') updates.failed_at = now;
      if (status === 'refunded') updates.refunded_at = now;
      if (body.coupon_code) updates.external_coupon_code = body.coupon_code;
      const setSql = Object.keys(updates).filter(k => updates[k] !== undefined).map(k => `${k}=?`).join(',');
      const values = Object.keys(updates).filter(k => updates[k] !== undefined).map(k => updates[k]);
      await env.DB.prepare(`UPDATE gift_redemptions SET ${setSql} WHERE id=?`).bind(...values, id).run();
      // 환불 처리
      let refundResult: any = null;
      if (status === 'refunded' && !red.txn_refund_id) {
        try {
          refundResult = await applyPointTransaction(env, {
            userId: red.user_id, studentName: red.student_name, type: 'refund',
            amount: red.point_price, reason: `[환불] ${red.gift_brand||''} ${red.gift_name||''}`, redemptionId: id,
            actorId: body.actor_id || 'admin', actorName: body.actor_name || '관리자',
          });
          await env.DB.prepare(`UPDATE gift_redemptions SET txn_refund_id=? WHERE id=?`).bind(refundResult.txnId, id).run();
        } catch (e: any) {
          return json({ ok: false, error: 'refund_failed', detail: String(e?.message||e) }, 500);
        }
      }
      return json({ ok: true, id, status, refund: refundResult });
    }

    // ── POST /api/admin/points/seed-rules — 기본 규칙 시드 (없을 때만) ──
    if (method === 'POST' && path === '/api/admin/points/seed-rules') {
      await ensurePointTables(env);
      const now = Date.now();
      const seeds = [
        ['attendance','출석',10,21600,1,1,'수업 1회 출석 시 자동 적립 (하루 1회)'],
        ['homework','숙제 완료',20,3600,3,1,'숙제 검수 완료 시 적립'],
        ['on_time','제시간 입장',5,3600,1,1,'수업 시작 5분 이내 입장'],
        ['level_up','레벨업',100,0,null,1,'레벨 시험 합격 시 자동 적립'],
        ['monthly_top','월간 우수학생',500,0,null,1,'월간 1위 학생 자동 지급'],
        ['birthday','생일 축하',200,0,1,1,'학생 생일 자동 지급'],
      ];
      const out: any[] = [];
      for (const [code,label,amt,cd,cap,en,desc] of seeds) {
        await env.DB.prepare(`INSERT OR IGNORE INTO point_rules (code,label,amount,cooldown_sec,daily_cap,enabled,description,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
          .bind(code,label,amt,cd,cap,en,desc,now).run();
        out.push({ code, label, amount: amt });
      }
      return json({ ok: true, seeded: out.length, items: out });
    }

    // ── POST /api/admin/gifts/seed-catalog — 데모 카탈로그 시드 ──
    if (method === 'POST' && path === '/api/admin/gifts/seed-catalog') {
      await ensurePointTables(env);
      const n = await seedGiftCatalog(env);   // 🎁 공용 시드 헬퍼 재사용(공개 읽기와 동일 로직)
      return json({ ok: true, seeded: n });
    }
    // ═══════════════════════════════════════════════════════════════
    // 🎁 Phase P4 - 기프티쇼 비즈 외부 API 연동
    // ═══════════════════════════════════════════════════════════════

    // ── GET /api/admin/gifts/status — API 키 설정 + 가맹점 잔액 조회 ──
    if (method === 'GET' && path === '/api/admin/gifts/status') {
      const mode = getGiftishowMode(env);
      const result: any = {
        ok: true,
        mode,                                                 // 'disabled' | 'mock' | 'real'
        api_key_set: !!(env as any).GIFTISHOW_API_KEY,
        user_id_set: !!(env as any).GIFTISHOW_USER_ID,
        api_base: (env as any).GIFTISHOW_API_BASE || 'https://bizapi.giftishow.com/bizApi (기본값)',
        callback_url_set: !!(env as any).GIFTISHOW_CALLBACK_URL,
        test_mode: (env as any).GIFTISHOW_TEST_MODE === 'true',
      };
      // 실제 모드면 가맹점 잔액 조회 시도
      if (mode === 'real' || mode === 'mock') {
        try {
          const bal = await checkBalance(env);
          result.balance = bal.ok ? bal.balance : null;
          result.balance_message = bal.message;
        } catch (e: any) {
          result.balance_error = String(e?.message || e);
        }
      }
      // 카탈로그 중 external_id 가 등록된 상품 수
      try {
        const catCount: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM gift_catalog WHERE external_id IS NOT NULL AND external_id <> '' AND enabled=1`).first();
        result.catalog_with_external_id = catCount?.c || 0;
        const totalCat: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM gift_catalog WHERE enabled=1`).first();
        result.catalog_total = totalCat?.c || 0;
      } catch {}
      return json(result);
    }

    // ── POST /api/gifts/webhook/giftishow — KT alpha 콜백 (발송 결과 알림) ──
    //   KT alpha 서버가 발송 → 수령 → 사용 단계마다 우리 콜백 URL 로 알림 보냄
    //   ▶ wrangler.toml [vars] GIFTISHOW_CALLBACK_URL 에 이 URL 을 등록해두면 자동 호출됨:
    //     "https://webrtc-unified-platform-prod.navy111p.workers.dev/api/gifts/webhook/giftishow"
    if (method === 'POST' && path === '/api/gifts/webhook/giftishow') {
      await ensurePointTables(env);
      const body: any = await request.json().catch(() => ({}));
      const ev = parseWebhook(body);
      const now = Date.now();
      // bizTrId 가 우리 gift_redemptions.id 임 (sendCoupon 시 보냈음)
      const redId = parseInt(String(ev.internalOrderId || ''), 10);
      if (!redId) {
        // 콜백은 받았지만 매칭 안 됨 → 로그만 남기고 200 응답 (KT alpha 재전송 방지)
        try {
          await env.DB.prepare(`INSERT INTO gift_redemptions (user_id, student_name, catalog_id, gift_name, face_value, point_price, status, requested_at, meta) VALUES ('webhook_orphan','-',0,'(매칭없음)',0,0,'failed',?,?)`)
            .bind(now, JSON.stringify(body)).run();
        } catch {}
        return json({ ok: false, error: 'no_matching_redemption', received: ev });
      }
      const red: any = await env.DB.prepare(`SELECT * FROM gift_redemptions WHERE id=?`).bind(redId).first();
      if (!red) return json({ ok: false, error: 'redemption_not_found', id: redId }, 404);

      // 상태 업데이트
      const updates: string[] = [];
      const binds: any[] = [];
      if (ev.status) {
        updates.push('status=?'); binds.push(ev.status);
        if (ev.status === 'sent' && !red.sent_at)         { updates.push('sent_at=?');      binds.push(now); }
        if (ev.status === 'delivered' && !red.delivered_at){ updates.push('delivered_at=?'); binds.push(now); }
        if (ev.status === 'failed' && !red.failed_at)     { updates.push('failed_at=?');    binds.push(now); }
      }
      if (ev.externalOrderId && !red.external_order_id) { updates.push('external_order_id=?'); binds.push(ev.externalOrderId); }
      if (ev.couponCode && !red.external_coupon_code)   { updates.push('external_coupon_code=?'); binds.push(ev.couponCode); }
      if (ev.message) { updates.push('error_message=?'); binds.push(ev.message); }
      // 항상 meta 에 raw 누적
      const prevMeta = red.meta ? (() => { try { return JSON.parse(red.meta); } catch { return {}; } })() : {};
      const newMeta = { ...prevMeta, last_webhook: ev.raw, last_webhook_at: now };
      updates.push('meta=?'); binds.push(JSON.stringify(newMeta));
      if (updates.length > 0) {
        await env.DB.prepare(`UPDATE gift_redemptions SET ${updates.join(',')} WHERE id=?`).bind(...binds, redId).run();
      }

      // 발송 실패 콜백이면 자동 환불.
      //  ⚠ 동시 webhook(KT alpha 재시도) 이중환불 방지: 먼저 CAS 로 '환불됨' 상태를 선점한 요청만 실제 환불.
      //  D1(SQLite) 은 쓰기를 직렬화하므로, 두 요청이 동시에 와도 UPDATE ... WHERE txn_refund_id IS NULL 은
      //  한 번만 changes=1 이 되어 정확히 한 번만 환불된다.
      if (ev.status === 'failed' && !red.txn_refund_id) {
        const claim = await env.DB.prepare(
          `UPDATE gift_redemptions SET status='refunded', refunded_at=? WHERE id=? AND txn_refund_id IS NULL AND status!='refunded'`
        ).bind(now, redId).run();
        if (claim?.meta?.changes) {   // 이 요청이 환불 슬롯을 차지했을 때만 실제 포인트 환불
          try {
            const refundTxn = await applyPointTransaction(env, {
              userId: red.user_id, studentName: red.student_name, type: 'refund',
              amount: red.point_price, reason: `[자동환불] 발송 실패 (webhook): ${(ev.message||'').slice(0,80)}`,
              redemptionId: redId, actorId: 'webhook', actorName: 'KT alpha webhook',
            });
            await env.DB.prepare(`UPDATE gift_redemptions SET txn_refund_id=? WHERE id=?`).bind(refundTxn.txnId, redId).run();
            if (red.catalog_id) {
              await env.DB.prepare(`UPDATE gift_catalog SET stock=stock+1, updated_at=? WHERE id=? AND stock IS NOT NULL`).bind(now, red.catalog_id).run();
            }
          } catch {}
        }
      }

      return json({ ok: true, processed: ev, redemption_id: redId });
    }

    // ── POST /api/admin/gifts/redemptions/:id/poll — 관리자 수동 상태 폴링 ──
    //   KT alpha 콜백이 안 왔거나 오래된 pending 건의 진행상황을 즉시 조회
    if (method === 'POST' && /^\/api\/admin\/gifts\/redemptions\/\d+\/poll$/.test(path)) {
      await ensurePointTables(env);
      const id = parseInt(path.split('/')[5] || '0', 10);
      const red: any = await env.DB.prepare(`SELECT * FROM gift_redemptions WHERE id=?`).bind(id).first();
      if (!red) return json({ ok: false, error: 'not_found' }, 404);
      if (!red.external_order_id) return json({ ok: false, error: 'no_external_order_id' });
      const { checkOrderStatus } = await import('./giftishow-client');
      const status = await checkOrderStatus(env, red.external_order_id);
      if (status.ok && status.status && status.status !== 'unknown') {
        const now = Date.now();
        const updates = ['status=?']; const binds: any[] = [status.status];
        if (status.status === 'sent' && !red.sent_at) { updates.push('sent_at=?'); binds.push(now); }
        if (status.status === 'delivered' && !red.delivered_at) { updates.push('delivered_at=?'); binds.push(now); }
        if (status.status === 'failed' && !red.failed_at) { updates.push('failed_at=?'); binds.push(now); }
        await env.DB.prepare(`UPDATE gift_redemptions SET ${updates.join(',')} WHERE id=?`).bind(...binds, id).run();
      }
      return json({ ok: true, id, status, prev_status: red.status });
    }

    // ═══════════════════════════════════════════════════════════════
    // 🎁 Phase P1+P4 끝
    // ═══════════════════════════════════════════════════════════════

  return null;  // 이 도메인 라우트가 아님 → 호출측이 기존 라우팅 계속
}
