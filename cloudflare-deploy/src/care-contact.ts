/* ═══════════════════════════════════════════════════════════════════════════
   📞 이탈 케어 «연락 기록» — 정본 한 곳 (2026-10-13 케어 보드 2단계)
   ───────────────────────────────────────────────────────────────────────────
   [무엇이 문제였나] 같은 학생에게 연락한 기록이 다섯 군데에 따로 남았습니다.
     · forecast_care.contacted_at      — AI 매출·이탈 요약(B) «연락 기록» 버튼
     · student_retention.contacted_at  — 수강권 만료·재활성(E) «연락함» 토글·자동 문자
     · retention_messages (sent)       — E 의 자동/수동 문자 발송 이력
     · retention_care_log              — 학생 이탈 위험(A) 카드의 카톡·문자·전화
     · counseling_sms_log (accepted)   — B 의 «상담 문구» 문자 발송
   그래서 A 에서 문자를 보내도 B·E 에는 «아직 연락 안 함» 으로 남아, 두 사람이 같은
   학부모에게 또 연락할 수 있었습니다.

   [이 파일이 하는 일 — 둘]
   ① recordCareContact — 연락이 «실제로» 일어난 순간 그 학생의 지금 사례(forecast_care)와
      student_retention 에 함께 적습니다. 옛 표는 지우지 않고, 옛 기록도 그대로 둡니다.
      · 이미 «처리 완료(done)» 인 사례는 되돌리지 않습니다(연락이 «다시 열기» 가 아닙니다).
      · «미확인» 이면 «상담 중» 으로 올립니다.
      · student_retention 에 그 학생이 없으면(A 에만 있는 학생) 사례가 없으니 forecast_care
        에는 안 적습니다 — 그 연락은 ② 가 retention_care_log 에서 읽습니다.
      ⛔ 던지지 않습니다 — 연락 자체는 이미 끝났으므로 기록이 실패해도 그 응답을 500 으로
         바꾸면 안 됩니다(사람이 «실패했나» 하고 다시 보냅니다 = 중복 연락).
   ② lastContacts — 위 다섯 곳을 «한 번에» 읽어 학생별 가장 최근 연락(시각·경로)을 줍니다.
      A(이탈 위험)·B(AI 매출·이탈 요약) 두 화면이 이 함수를 씁니다. E(수강권 만료)는 함께 켜지는
      student_retention.contacted 로 따라옵니다(E 목록은 이 함수를 부르지 않습니다).
      표가 하나 없거나 읽기가 실패해도 나머지로 계속하되, **실패한 원천 수(failed)** 를 함께 돌려줍니다 —
      부르는 쪽은 failed>0 이면 «연락 기록 없음» 이라고 말하면 안 됩니다(없음 ≠ 못 물어봄).
      ⚖️ 시각이 같으면 «원래 기록» 이 이깁니다 — ① 이 같은 now 로 메아리를 남기므로, 메아리
         (forecast_care·student_retention)를 원천 목록 «뒤» 에 두고 더 «늦을 때만» 덮습니다.
      ⚠️ «실제로 일어난» 것만 셉니다 — 테스트 모드(mock)·실패·이벤트 큐(queued)·포인트 지급은
         «연락» 이 아닙니다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { caseKey } from './forecast-dashboard';

export type CareVia = 'care' | 'retention' | 'auto_sms' | 'sms' | 'kakao' | 'call' | 'counsel_sms';
export interface LastContact { at: number; via: CareVia; }

/** A 화면 액션 중 «연락» 으로 셀 것 — 포인트·이벤트 초대·수업 안내는 아닙니다. */
export const CARE_CONTACT_ACTIONS = ['kakao', 'sms', 'call'] as const;
/** retention_care_log.status 중 «실제로 일어난» 것 — mock·failed·queued 는 아닙니다. */
export const CARE_CONTACT_STATUSES = ['sent', 'logged'] as const;

/** opts.auto — 사람이 아닌 자동 발송(cron). 연락 시각만 남기고 상태·담당은 안 바꿉니다
 *  (사람이 맡은 적 없는 사례가 «상담 중 · 담당 auto-cron» 으로 보이면 «누가 맡았나» 의 뜻이 바뀝니다). */
export async function recordCareContact(env: any, uid: string, owner: string, now = Date.now(), opts: { auto?: boolean } = {}): Promise<boolean> {
  const db = env && env.DB;
  const u = String(uid || '').trim();
  if (!db || !u) return false;
  const who = String(owner || 'admin').slice(0, 100);
  try {
    const row: any = await db.prepare(`SELECT category,end_date,last_class FROM student_retention WHERE user_id=?`).bind(u).first();
    if (!row) return false;
    await db.prepare(`CREATE TABLE IF NOT EXISTS forecast_care (
      user_id TEXT NOT NULL, case_key TEXT NOT NULL, status TEXT NOT NULL,
      owner TEXT NOT NULL, updated_at INTEGER NOT NULL, contacted_at INTEGER,
      PRIMARY KEY(user_id, case_key))`).run();
    const auto = !!opts.auto;
    // 처리 완료(done) 사례는 상태도 «완료한 담당» 도 그대로 둡니다 — 연락 시각만 갱신.
    await db.prepare(`INSERT INTO forecast_care(user_id,case_key,status,owner,updated_at,contacted_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(user_id,case_key) DO UPDATE SET
        status=CASE WHEN forecast_care.status='done' OR ?=1 THEN forecast_care.status ELSE 'in_progress' END,
        owner=CASE WHEN forecast_care.status='done' OR ?=1 THEN forecast_care.owner ELSE excluded.owner END,
        updated_at=excluded.updated_at, contacted_at=excluded.contacted_at`)
      .bind(u, caseKey(row), auto ? 'unreviewed' : 'in_progress', who, now, now, auto ? 1 : 0, auto ? 1 : 0).run();
    await db.prepare(`UPDATE student_retention SET contacted=1, contacted_at=? WHERE user_id=?`).bind(now, u).run();
    return true;
  } catch (e: any) {
    console.warn('[care-contact] 연락 기록 실패(연락 자체는 끝남):', u, String(e?.message || e));
    return false;
  }
}

const J = `(SELECT value FROM json_each(?))`;
/* ⚖️ 순서가 곧 «비겼을 때 누가 이기나» 입니다 — 원래 기록 셋을 앞에, 메아리 둘을 뒤에.
   forecast_care 줄의 담당이 'retention_page' 면 그것은 E «연락함» 토글의 메아리라 경로를 retention 으로. */
const SOURCES: Array<{ via: CareVia | null; sql: string }> = [
  { via: null, sql: `SELECT user_id AS u, created_at AS t, action_type AS v FROM retention_care_log
      WHERE user_id IN ${J} AND action_type IN ('${CARE_CONTACT_ACTIONS.join("','")}') AND status IN ('${CARE_CONTACT_STATUSES.join("','")}')` },
  { via: 'counsel_sms', sql: `SELECT user_id AS u, MAX(created_at) AS t, NULL AS v FROM counseling_sms_log WHERE user_id IN ${J} AND status='accepted' GROUP BY user_id` },
  { via: 'auto_sms', sql: `SELECT user_id AS u, MAX(sent_at) AS t, NULL AS v FROM retention_messages WHERE user_id IN ${J} AND status='sent' GROUP BY user_id` },
  { via: null, sql: `SELECT user_id AS u, contacted_at AS t, CASE WHEN owner='retention_page' THEN 'retention' ELSE 'care' END AS v
      FROM forecast_care WHERE user_id IN ${J} AND contacted_at > 0` },
  { via: 'retention', sql: `SELECT user_id AS u, contacted_at AS t, NULL AS v FROM student_retention WHERE user_id IN ${J} AND contacted=1 AND contacted_at > 0` },
];

export async function lastContacts(db: any, uids: string[]): Promise<{ map: Map<string, LastContact>; failed: number }> {
  const map = new Map<string, LastContact>();
  let failed = 0;
  const ids = Array.from(new Set((uids || []).map(x => String(x ?? '')).filter(Boolean)));
  if (!db || !ids.length) return { map, failed };
  const j = JSON.stringify(ids);
  for (const s of SOURCES) {
    try {
      const r = await db.prepare(s.sql).bind(j).all();
      for (const row of ((r && r.results) || []) as any[]) {
        const t = Number(row.t);
        if (!(t > 0)) continue;
        const via = (s.via || row.v) as CareVia;
        const cur = map.get(String(row.u));
        if (!cur || t > cur.at) map.set(String(row.u), { at: t, via });
      }
    } catch (e: any) {
      const m = String(e?.message || e);
      // 표가 아직 없는 것(기능을 한 번도 안 쓴 환경)은 «기록 없음» 이 사실이라 실패로 안 셉니다.
      if (!/no such table/i.test(m)) { failed++; console.warn('[care-contact] 원천 읽기 실패:', m); }
    }
  }
  return { map, failed };
}
