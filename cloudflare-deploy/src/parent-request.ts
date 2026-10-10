// ═══════════════════════════════════════════════════════════════════════
// 👪 parent-request.ts — 학부모 요청 → 선생님 반영 확인 (2026-10-10, 경쟁사 분석 적용 ⑤)
//
//   무엇을 하나
//     학부모가 대시보드(parent.html)에서 «말하기를 더 많이 시켜 주세요» 같은 요청 하나를 고른다.
//       → 강사 포털 오늘 수업 줄에 그 요청이 뜨고(영어로도), 강사가 «반영함 ✔» 을 누른다.
//       → 학부모 화면의 같은 카드가 «✔ 선생님이 반영했어요 (이름·날짜)» 로 바뀐다.
//
//   규칙
//     ⛔ 보기 밖의 요청을 받지 않는다(모르는 key 는 거절). 자유 입력을 받으면 필리핀·중국 강사가
//        못 읽고, 검토 안 된 글이 강사 화면에 그대로 나간다. 보기는 한/영 두 벌이다.
//     ⚠️ 학생 하나에 «열린» 요청은 하나. 새로 보내면 앞 것은 'replaced', 학부모가 지우면 'cleared'
//        (지우지 않는다 — 이력). 반영된 것은 'done' 으로 남는다.
//     ⚠️ 강사가 «반영함» 을 누를 수 있는 것은 «오늘 그 강사 수업의 학생» 의 «열린» 요청뿐(부르는 쪽이 확인).
//     ⚠️ 읽기 조회는 던지지 않는다(표가 없거나 실패하면 «요청 없음»).
//     ⚠️ 쌍둥이 계정(X ↔ mangoai_X, 이름까지 같을 때만 — student-alias.ts resolveStudentTwins):
//        학부모는 «로그인 계정» 에 적고 강사의 수업 줄은 다른 쪽일 수 있다 → 양쪽 다 함께 읽고 함께 끝낸다.
//     ⚠️ 보여 주는 기간: 열린 요청은 계속, 반영된 요청은 SHOW_DONE_DAYS 일까지(그 뒤엔 카드가 «요청 고르기» 로 돌아간다).
// ═══════════════════════════════════════════════════════════════════════
import { selectInChunks } from './d1-chunk';
import { resolveStudentTwins } from './student-alias';

const DAY_MS = 86400000;
export const SHOW_DONE_DAYS = 14;

export type ParentReqDef = { key: string; ko: string; en: string };

/** 보기 6개 — 학부모가 이 중 하나를 고른다. 강사 화면은 en 을 쓴다. */
export const PARENT_REQUESTS: ParentReqDef[] = [
  { key: 'more_speaking',  ko: '말하기를 더 많이 시켜 주세요',     en: 'Please give more speaking time' },
  { key: 'pronunciation',  ko: '발음을 더 꼼꼼히 고쳐 주세요',     en: 'Please correct pronunciation more' },
  { key: 'grammar',        ko: '문법을 더 짚어 주세요',             en: 'Please point out grammar more' },
  { key: 'review',         ko: '지난 수업 내용을 복습해 주세요',   en: 'Please review the last lesson' },
  { key: 'slower',         ko: '천천히, 쉬운 말로 해 주세요',       en: 'Please speak slower and simpler' },
  { key: 'praise',         ko: '칭찬과 격려를 많이 해 주세요',     en: 'Please give more praise and encouragement' },
];

export function parentReqByKey(k: unknown): ParentReqDef | null {
  const s = String(k == null ? '' : k).trim();
  return PARENT_REQUESTS.find((r) => r.key === s) || null;
}

export type ParentReqView = {
  id: number; key: string; ko: string; en: string;
  created_at: number;
  status: 'open' | 'done';
  done_at: number | null;
  done_by_name: string;
};

/** 행 → 화면용(순수 함수). 모르는 key·끝난(replaced/cleared) 요청·오래된 반영 요청이면 null. */
export function parentReqView(row: any, nowMs: number): ParentReqView | null {
  if (!row) return null;
  const d = parentReqByKey(row.req_key);
  if (!d) return null;
  const st = String(row.status || '');
  const id = Number(row.id) || 0, createdAt = Number(row.created_at) || 0;
  if (!id || !createdAt) return null;
  if (st === 'open') {
    return { id, key: d.key, ko: d.ko, en: d.en, created_at: createdAt, status: 'open', done_at: null, done_by_name: '' };
  }
  if (st === 'done') {
    const doneAt = Number(row.done_at) || 0;
    if (!doneAt || nowMs - doneAt > SHOW_DONE_DAYS * DAY_MS) return null;
    return { id, key: d.key, ko: d.ko, en: d.en, created_at: createdAt, status: 'done', done_at: doneAt,
             done_by_name: String(row.done_by_name || '').slice(0, 60) };
  }
  return null;
}

/** 저장 결과 — 한 가지 모양(이 저장소 tsconfig 는 strict 가 꺼져 판별 유니온 좁히기가 안 된다). */
export type ParentReqResult = { ok: boolean; request?: ParentReqView | null; error?: string };

const CREATE_SQL = `CREATE TABLE IF NOT EXISTS parent_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, req_key TEXT NOT NULL,
  created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  done_by TEXT, done_by_name TEXT, done_at INTEGER)`;

export async function ensureParentReqTable(db: any): Promise<void> {
  await db.prepare(CREATE_SQL).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_parent_requests_uid ON parent_requests(student_uid, status)`).run();
}

/** 확인된 쌍둥이까지 더한 계정 목록(내 계정이 먼저). 던지지 않는다. */
async function withTwin(db: any, uid: string): Promise<string[]> {
  const u = String(uid || '').trim();
  if (!u) return [];
  let tw: string[] = [];
  try { tw = await resolveStudentTwins(db, u); } catch { tw = []; }
  const t = tw.find((x) => x && x !== u);
  return t ? [u, t] : [u];
}

/** 여러 학생(강사 화면) — uid → 가장 최근 «보여 줄» 요청. 각 uid 는 확인된 쌍둥이 계정 것도 함께 본다. 던지지 않는다. */
export async function loadParentRequests(db: any, uids: string[], nowMs: number): Promise<Map<string, ParentReqView>> {
  const out = new Map<string, ParentReqView>();
  const list = Array.from(new Set((uids || []).map((u) => String(u || '').trim()).filter(Boolean)));
  if (!list.length) return out;
  try {
    // 쌍둥이 확인은 학생마다 한 번(강사 하루 수업 수만큼 — 수십 건). 실패하면 내 계정만.
    const groups = await Promise.all(list.map((u) => withTwin(db, u)));
    const owner = new Map<string, string[]>();   // 행의 uid → 그것을 보는 수업 uid 들
    for (let i = 0; i < list.length; i++) {
      for (const a of groups[i]) { const arr = owner.get(a) || []; arr.push(list[i]); owner.set(a, arr); }
    }
    const all = Array.from(owner.keys());
    const rows = await selectInChunks<any>(db, all,
      (ph) => `SELECT id, student_uid, req_key, created_at, status, done_by_name, done_at FROM parent_requests
                WHERE student_uid IN (${ph}) AND status IN ('open', 'done')
                ORDER BY created_at DESC, id DESC`);
    for (const r of rows) {
      const v = parentReqView(r, nowMs);
      if (!v) continue;
      for (const u of owner.get(String(r.student_uid || '')) || []) {
        if (!out.has(u)) out.set(u, v);       // 가장 최근 것 하나
      }
    }
  } catch { /* 표가 아직 없거나 조회 실패 — 요청 없음 */ }
  return out;
}

/** 한 학생(학부모 화면) — 가장 최근 «보여 줄» 요청. 던지지 않는다. */
export async function loadParentRequest(db: any, uid: string, nowMs: number): Promise<ParentReqView | null> {
  const u = String(uid || '').trim();
  if (!u) return null;
  const m = await loadParentRequests(db, [u], nowMs);
  return m.get(u) || null;
}

/**
 * 학부모가 요청 보내기·지우기. key 가 '' 이면 열린 요청을 'cleared'.
 * 부르는 쪽이 «이 사람이 이 학생의 학부모인가»(자녀 계정 토큰 + 비밀번호)를 먼저 확인해야 한다.
 * ⚠️ 끝내기와 새로 넣기를 한 batch 로. 쌍둥이 계정의 열린 요청도 함께 끝낸다.
 */
export async function setParentRequest(db: any, a: { uid: string; key: string; nowMs: number }):
  Promise<ParentReqResult> {
  const uid = String(a.uid || '').trim();
  if (!uid) return { ok: false, error: 'child_uid_required' };
  const key = String(a.key || '').trim();
  const d = key ? parentReqByKey(key) : null;
  if (key && !d) return { ok: false, error: 'unknown_request' };
  await ensureParentReqTable(db);
  const ids = await withTwin(db, uid);
  const endOld = db.prepare(`UPDATE parent_requests SET status = ? WHERE student_uid IN ${ids.length === 2 ? '(?, ?)' : '(?)'} AND status = 'open'`)
    .bind(d ? 'replaced' : 'cleared', ...ids);
  if (!d) { await endOld.run(); return { ok: true, request: await loadParentRequest(db, uid, a.nowMs) }; }
  const ins = db.prepare(`INSERT INTO parent_requests (student_uid, req_key, created_at, status) VALUES (?, ?, ?, 'open')`)
    .bind(uid, d.key, a.nowMs);
  await db.batch([endOld, ins]);
  return { ok: true, request: await loadParentRequest(db, uid, a.nowMs) };
}

/**
 * 강사가 «반영함 ✔». 그 학생(쌍둥이 포함)의 «열린» 요청 id 만 바꾼다 — 남의 학생·이미 끝난 요청은 0행.
 * 부르는 쪽이 «오늘 이 강사 수업의 학생인가» 를 먼저 확인해야 한다.
 */
export async function markParentRequestDone(db: any, a: { uid: string; id: number; by: string; byName: string; nowMs: number }):
  Promise<ParentReqResult> {
  const uid = String(a.uid || '').trim();
  const id = Number(a.id);
  if (!uid) return { ok: false, error: 'student_uid_required' };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'request_id_required' };
  await ensureParentReqTable(db);
  const ids = await withTwin(db, uid);
  const r: any = await db.prepare(
    `UPDATE parent_requests SET status = 'done', done_by = ?, done_by_name = ?, done_at = ?
      WHERE id = ? AND status = 'open' AND student_uid IN ${ids.length === 2 ? '(?, ?)' : '(?)'}`
  ).bind(String(a.by || '').slice(0, 80), String(a.byName || '').slice(0, 80), a.nowMs, id, ...ids).run();
  const changed = Number(r && r.meta && r.meta.changes) || 0;
  if (!changed) return { ok: false, error: 'not_open' };
  return { ok: true, request: await loadParentRequest(db, uid, a.nowMs) };
}
