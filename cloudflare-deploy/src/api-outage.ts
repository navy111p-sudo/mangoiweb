// ────────────────────────────────────────────────────────────────────────────
// ⚡ 정전 · 인터넷 장애 신고 — /api/outage/*
//
// 왜 만들었나 (2026-08-05):
//   매니저 멜카 요청: "Outage notifications (internet/power interruption alerts)".
//   코드 전체를 뒤졌지만 이 기능은 **정말로 없었다**(장애·정전·outage 검색 0건).
//
//   실제로 벌어지는 일: 필리핀 강사 집에 정전이 나거나 회선이 끊긴다.
//   그러면 지금까지는 —
//     · 강사는 카톡으로 매니저에게 개인 연락 (매니저가 자고 있으면 아무도 모른다)
//     · 사무실은 학생이 "선생님이 안 들어와요" 라고 전화할 때 처음 안다
//     · 그 사이 남은 수업은 아무 조치 없이 그대로 노쇼가 된다
//   즉 **가장 먼저 알아야 할 사람이 가장 늦게 아는** 구조였다.
//
// 설계 판단:
//   ① 신고는 «세 번 눌러서» 끝나야 한다.
//      정전 중인 사람은 폰 배터리로 모바일데이터를 쓰고 있다. 타이핑을 요구하면 신고를 안 한다.
//      → 종류(정전/인터넷/기타) + 예상시간 만 고르면 끝. 메모는 선택.
//   ② 영향받는 수업은 **서버가 다시 계산하지 않고 화면이 보내준 것을 그대로 저장**한다.
//      강사↔수업 매칭은 api-teacher.ts 기준으로도 (username OR 이름 부분일치) 로 까다롭다.
//      같은 로직을 여기서 또 쓰면 두 곳이 서로 어긋난다. 화면은 이미 «남은 수업» 을
//      그려 놓았으므로 그 순간의 스냅샷을 받는 편이 정확하고 싸다.
//   ③ 접수 사실은 기존 notification_queue 에 적재한다(enqueueNotification).
//      관리자 «📣 알림 큐» 카드에 그대로 뜬다 → admin.html(977KB) 을 1줄도 안 건드린다.
//   ④ 같은 사람의 «진행 중» 장애는 하나만. 급해서 두 번 눌러도 새 건이 생기지 않는다(멱등).
//
// 권한:
//   · 신고    = 로그인한 강사 본인, 또는 본사 계정(대신 신고).
//   · 전체 조회 = 본사 계정(hq/staff)만. 필리핀 매니저 포함 — 이 화면이 가장 필요한 사람들이다.
//   · 복구 처리 = 신고한 본인 또는 본사 계정.
//
// ⚠️ 이 API 는 «수업을 취소하지 않는다». 상태를 알릴 뿐이다.
//    자동 취소는 되돌리기 어렵고, 5분 만에 복구되는 정전이 대부분이라 사람이 판단해야 한다.
// ────────────────────────────────────────────────────────────────────────────

import { getAdminActor } from './auth-admin';
import { enqueueNotification } from './api-notify';

interface OutageEnv {
  DB: D1Database;
  [k: string]: any;
}

const json = (data: any, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const KINDS = ['power', 'internet', 'other'];

/** 예상 복구 시간 — 고를 수 있는 값만 받는다. 자유 입력은 «3시간쯤?» 같은 문자열이 들어와 집계가 깨진다. */
const EXPECT_MIN = [30, 60, 120, 240];

/** 한/영 두 벌 — 강사 다수가 필리핀이라 한쪽만 있으면 절반이 못 읽는다(CLAUDE.md 상시 규칙). */
function kindLabel(k: string): { ko: string; en: string } {
  if (k === 'power')    return { ko: '정전',        en: 'Power outage' };
  if (k === 'internet') return { ko: '인터넷 끊김', en: 'Internet down' };
  return { ko: '기타 장애', en: 'Other problem' };
}

let tableReady = false;
async function ensureTable(env: OutageEnv) {
  if (tableReady) return;
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS teacher_outages (` +
    `id INTEGER PRIMARY KEY AUTOINCREMENT, ` +
    `reporter_username TEXT NOT NULL, reporter_name TEXT, ` +
    `teacher_name TEXT, ` +
    `kind TEXT NOT NULL DEFAULT 'power', ` +
    `expected_min INTEGER, memo TEXT, ` +
    `affected_count INTEGER DEFAULT 0, affected_text TEXT, ` +
    `status TEXT NOT NULL DEFAULT 'active', ` +
    `started_at INTEGER NOT NULL, ` +
    `resolved_at INTEGER, resolved_by TEXT)`
  );
  // 목록 조회는 항상 «진행 중 먼저, 최신 먼저» 라서 이 두 컬럼이 인덱스가 된다.
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_outage_status ON teacher_outages(status, started_at)`); } catch { /* 있으면 그만 */ }
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_outage_user ON teacher_outages(reporter_username, status)`); } catch { /* 있으면 그만 */ }
  tableReady = true;
}

/** 본사 계정인가 — 전체 현황을 볼 수 있는 조건. 필리핀 매니저(scope_type='hq')도 여기 포함된다. */
function isHqStaff(actor: any): boolean {
  return !!actor?.ok && !actor.isTeacher && (actor.role === 'hq' || actor.role === 'staff');
}

function row(r: any) {
  const kl = kindLabel(r.kind);
  return {
    id: r.id,
    kind: r.kind, kind_ko: kl.ko, kind_en: kl.en,
    expected_min: r.expected_min,
    memo: r.memo,
    reporter_username: r.reporter_username,
    reporter_name: r.reporter_name,
    teacher_name: r.teacher_name || r.reporter_name || r.reporter_username,
    affected_count: Number(r.affected_count || 0),
    affected_text: r.affected_text,
    status: r.status,
    started_at: r.started_at,
    resolved_at: r.resolved_at,
    resolved_by: r.resolved_by,
  };
}

export async function handleOutageApi(
  request: Request, url: URL, env: OutageEnv
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith('/api/outage/')) return null;
  const method = request.method;

  const actor: any = await getAdminActor(request, env as any);
  if (!actor.ok) return json({ ok: false, error: 'auth_required' }, 401);
  await ensureTable(env);

  const hq = isHqStaff(actor);

  // ── 신고하기 ──────────────────────────────────────────────────────────────
  if (method === 'POST' && path === '/api/outage/report') {
    let p: any = {};
    try { p = await request.json(); } catch { /* 빈 본문이면 기본값으로 */ }

    const kind = String(p?.kind || 'power');
    if (KINDS.indexOf(kind) < 0) return json({ ok: false, error: 'bad_kind', allowed: KINDS }, 400);

    // 예상 복구 시간은 «모름» 이 정상적인 답이다. 정전은 원래 언제 들어올지 모른다.
    let expectedMin: number | null = null;
    if (p?.expected_min != null && p.expected_min !== '') {
      const n = Number(p.expected_min);
      if (EXPECT_MIN.indexOf(n) < 0) return json({ ok: false, error: 'bad_expected_min', allowed: EXPECT_MIN }, 400);
      expectedMin = n;
    }

    const memo = String(p?.memo || '').trim().slice(0, 500) || null;

    // 영향받는 수업 — 화면이 보내준 스냅샷. 없으면 0건으로 둔다(신고 자체를 막지 않는다).
    const affectedCount = Math.max(0, Math.min(50, Number(p?.affected_count) || 0));
    const affectedText = String(p?.affected_text || '').trim().slice(0, 500) || null;

    // 이미 «진행 중» 인 건이 있으면 새로 만들지 않고 그것을 돌려준다.
    //   급하면 버튼을 두 번 세 번 누른다. 그때마다 새 건이 쌓이면 현황판이 못 쓰게 된다.
    const dup: any = await env.DB.prepare(
      `SELECT * FROM teacher_outages WHERE reporter_username = ? AND status = 'active'
        ORDER BY started_at DESC LIMIT 1`
    ).bind(actor.username).first().catch(() => null);
    if (dup) return json({ ok: true, duplicated: true, item: row(dup) });

    const now = Date.now();
    const teacherName = String(p?.teacher_name || actor.name || actor.username || '').slice(0, 100);
    const ins = await env.DB.prepare(
      `INSERT INTO teacher_outages
         (reporter_username, reporter_name, teacher_name, kind, expected_min, memo,
          affected_count, affected_text, status, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
    ).bind(actor.username, actor.name || null, teacherName, kind, expectedMin, memo,
           affectedCount, affectedText, now).run();

    // 관리자 «📣 알림 큐» 로 — admin.html 무변경으로 사무실에 즉시 보이게 하는 가장 싼 길.
    //   ⚠️ 알림 적재가 실패해도 신고는 이미 저장됐다. enqueueNotification 은 내부에서
    //      스스로 catch 하므로 여기서 await 해도 신고 응답을 막지 않는다.
    const kl = kindLabel(kind);
    await enqueueNotification(env, {
      type: 'teacher_outage',
      title: `⚡ ${kl.ko} / ${kl.en} — ${teacherName}`,
      body:
        `${teacherName} 강사가 «${kl.ko}» 을 신고했습니다.` +
        (expectedMin ? ` 예상 복구 ${expectedMin}분.` : ' 예상 복구 시간 모름.') +
        (affectedCount ? ` 남은 수업 ${affectedCount}건.` : '') +
        (affectedText ? ` (${affectedText})` : '') +
        (memo ? ` 메모: ${memo}` : '') +
        `\n[EN] ${teacherName} reported ${kl.en}.` +
        (expectedMin ? ` Expected back in ${expectedMin} min.` : ' Recovery time unknown.') +
        (affectedCount ? ` ${affectedCount} class(es) remaining today.` : ''),
      meta: { outage_id: ins.meta.last_row_id, kind, teacher_name: teacherName, affected_count: affectedCount },
    });

    const cur: any = await env.DB.prepare(`SELECT * FROM teacher_outages WHERE id = ?`)
      .bind(ins.meta.last_row_id).first().catch(() => null);
    return json({ ok: true, item: cur ? row(cur) : null });
  }

  // ── 내 진행 중 장애 ───────────────────────────────────────────────────────
  //   화면 상단 배너용. 없으면 item:null — 이건 오류가 아니라 «정상» 이다.
  if (method === 'GET' && path === '/api/outage/mine') {
    const r: any = await env.DB.prepare(
      `SELECT * FROM teacher_outages WHERE reporter_username = ? AND status = 'active'
        ORDER BY started_at DESC LIMIT 1`
    ).bind(actor.username).first().catch(() => null);
    return json({ ok: true, item: r ? row(r) : null });
  }

  // ── 전체 현황 (본사·매니저) ───────────────────────────────────────────────
  if (method === 'GET' && path === '/api/outage/active') {
    if (!hq) return json({ ok: false, error: 'forbidden' }, 403);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    // 진행 중 전부 + 오늘 복구된 것. 복구된 것도 보여야 «아까 그 건 어떻게 됐지» 에 답이 된다.
    const since = Date.now() - 12 * 3600 * 1000;
    const rs = await env.DB.prepare(
      `SELECT * FROM teacher_outages
        WHERE status = 'active' OR (status = 'resolved' AND resolved_at >= ?)
        ORDER BY (status = 'active') DESC, started_at DESC LIMIT ?`
    ).bind(since, limit).all<any>().catch(() => ({ results: [] as any[] }));
    const items = (rs.results || []).map(row);
    return json({
      ok: true,
      active: items.filter((x: any) => x.status === 'active').length,
      items,
    });
  }

  // ── 복구 처리 ─────────────────────────────────────────────────────────────
  const mRes = path.match(/^\/api\/outage\/(\d+)\/resolve$/);
  if (method === 'POST' && mRes) {
    const id = Number(mRes[1]);
    const cur: any = await env.DB.prepare(`SELECT * FROM teacher_outages WHERE id = ? LIMIT 1`)
      .bind(id).first().catch(() => null);
    if (!cur) return json({ ok: false, error: 'not_found' }, 404);

    const mine = String(cur.reporter_username) === String(actor.username);
    if (!mine && !hq) {
      return json({
        ok: false, error: 'forbidden',
        message: '본인이 신고한 건이거나 본사 계정만 복구 처리할 수 있습니다.',
        message_en: 'Only the reporter or a head-office account can close this.',
      }, 403);
    }
    // 이미 닫힌 건을 다시 닫아 시각을 덮어쓰지 않는다.
    if (cur.status !== 'active') {
      return json({ ok: false, error: 'already_resolved', resolved_at: cur.resolved_at }, 409);
    }
    const up = await env.DB.prepare(
      `UPDATE teacher_outages SET status = 'resolved', resolved_at = ?, resolved_by = ?
        WHERE id = ? AND status = 'active'`
    ).bind(Date.now(), actor.username, id).run();
    if (!up.meta.changes) return json({ ok: false, error: 'already_resolved' }, 409);

    return json({ ok: true, id, status: 'resolved' });
  }

  return json({ ok: false, error: 'not_found' }, 404);
}
