// 요청별 단어장 초기화·체험 제한·뜻 보정. 환경이나 학생 상태를 전역에 저장하지 않는다.
import { loadVocabTags } from './vocab-tags';
import { isKoreanGloss, readableKoreanVocabulary } from './korean-vocab';
import { resolveOwnerScope } from './auth-admin';
import type { MangoEnv } from './api-mango';
export function createVocabContext(request: Request, url: URL, env: MangoEnv) {
const ensureVocab = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS vocabulary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, word TEXT NOT NULL, korean TEXT, example TEXT, level INTEGER DEFAULT 0, next_review_at INTEGER NOT NULL, last_reviewed_at INTEGER, correct_count INTEGER DEFAULT 0, wrong_count INTEGER DEFAULT 0, created_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_vocab_user_review ON vocabulary(user_id, next_review_at ASC)`); } catch {}
      // 게이미피케이션: 복습 이력(스트릭/미션/랭킹 계산용) + 포인트 지급 멱등 기록
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS vocab_review_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, vocab_id INTEGER, correct INTEGER NOT NULL, reviewed_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_vocab_log_user ON vocab_review_log(user_id, reviewed_at DESC)`); } catch {}
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS vocab_rewards (award_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT, amount INTEGER NOT NULL, created_at INTEGER NOT NULL);`);
    };
    // KST 기준 일수 (스트릭/일일미션 경계)
    const vocabKstDay = (t: number) => Math.floor((t + 32400000) / 86400000);

    // 🎁 게스트 체험: 복습게임·단어도감을 비로그인으로도 맛보게 하되, 하루 10분·총 3일까지만.
    //   (2026-07-26) IDOR 강화 이후 게스트가 아예 못 쓰게 막혀있던 것을 시간제한 체험으로 완화.
    const GUEST_TRIAL_MS = 10 * 60 * 1000;
    const GUEST_TRIAL_DAYS = 3;
    const ensureGuestTrial = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS vocab_guest_trial (uid TEXT NOT NULL, trial_day INTEGER NOT NULL, started_at INTEGER NOT NULL, PRIMARY KEY (uid, trial_day));`);
    };
    const checkGuestTrial = async (uid: string) => {
      await ensureGuestTrial();
      const now = Date.now();
      const today = vocabKstDay(now);
      const rows = ((await env.DB.prepare(`SELECT trial_day, started_at FROM vocab_guest_trial WHERE uid = ? ORDER BY trial_day ASC`).bind(uid).all()).results || []) as any[];
      const todayRow = rows.find(r => r.trial_day === today);
      if (todayRow) {
        const elapsed = now - todayRow.started_at;
        if (elapsed > GUEST_TRIAL_MS) {
          return { ok: false, error: 'guest_trial_expired', message: '오늘 체험 시간(10분)이 끝났어요! 로그인하면 계속 복습할 수 있어요.' };
        }
        return { ok: true, remaining_ms: GUEST_TRIAL_MS - elapsed, day_index: rows.findIndex(r => r.trial_day === today) + 1, days_total: GUEST_TRIAL_DAYS };
      }
      if (rows.length >= GUEST_TRIAL_DAYS) {
        return { ok: false, error: 'guest_trial_used_up', message: `체험 ${GUEST_TRIAL_DAYS}일을 모두 사용했어요! 로그인하면 계속 복습할 수 있어요.` };
      }
      // due·list 가 Promise.all 로 동시에 들어오면 오늘 첫 방문 시 둘 다 이 지점에 동시 도달 →
      // 같은 (uid, trial_day) 를 동시에 INSERT 하려다 PK 충돌. OR IGNORE + 재조회로 경쟁을 흡수.
      await env.DB.prepare(`INSERT OR IGNORE INTO vocab_guest_trial (uid, trial_day, started_at) VALUES (?, ?, ?)`).bind(uid, today, now).run();
      const fresh: any = await env.DB.prepare(`SELECT started_at FROM vocab_guest_trial WHERE uid = ? AND trial_day = ?`).bind(uid, today).first();
      const startedAt = (fresh && fresh.started_at) || now;
      return { ok: true, remaining_ms: Math.max(0, GUEST_TRIAL_MS - (now - startedAt)), day_index: rows.length + 1, days_total: GUEST_TRIAL_DAYS };
    };
    // /api/vocab/due·list 공용 게이트: admin/self=무제한, guest=체험 게이트, 그 외=차단
    const gateVocabOwner = async (uid: string) => {
      const scope = await resolveOwnerScope(request, url, env as any, uid);
      if (['admin', 'self'].includes(scope)) return { allow: true as const };
      if (scope === 'guest') {
        const trial = await checkGuestTrial(uid);
        if (!trial.ok) return { allow: false as const, error: trial.error!, message: trial.message! };
        return { allow: true as const, trial };
      }
      return { allow: false as const, error: 'auth_required', message: '로그인 후 본인 단어장만 조회할 수 있습니다.' };
    };

    // Owner-gated legacy repair. Preserve original values and concurrent teacher edits.
    // 🏷️ 카드에 꼬리표(tag) 붙이기 — 단어장 목록·복습 퀴즈가 같은 것을 씀(2026-11-02). 못 읽으면 표시만 빠짐.
    const attachVocabTags = async (words: any[], uid: string) => {
      const tags = await loadVocabTags(env.DB, uid);
      if (tags.size) for (const w of words as any[]) { const t = tags.get(Number(w?.id)); if (t) w.tag = t; }
      return words;
    };
    const readableVocab = async (rows: any[], uid: string) => {
      const clean = await readableKoreanVocabulary(rows, env.AI);
      const changed = clean.map((row, i) => ({ row, before: rows[i].korean }))
        .filter(({ row, before }) => row.id && isKoreanGloss(row.korean) && row.korean !== before);
      if (changed.length) {
        try {
          await env.DB.prepare(`CREATE TABLE IF NOT EXISTS vocab_korean_repair_backup (vocab_id INTEGER NOT NULL, user_id TEXT NOT NULL, original_korean TEXT NOT NULL, repaired_korean TEXT NOT NULL, repaired_at INTEGER NOT NULL, UNIQUE(vocab_id, original_korean))`).run();
          for (let offset = 0; offset < changed.length; offset += 20) {
            const statements = changed.slice(offset, offset + 20).flatMap(({ row, before }) => [
              env.DB.prepare(`INSERT OR IGNORE INTO vocab_korean_repair_backup (vocab_id,user_id,original_korean,repaired_korean,repaired_at) SELECT id,user_id,korean,?,? FROM vocabulary WHERE id=? AND user_id=? AND korean=?`).bind(row.korean, Date.now(), row.id, uid, before),
              env.DB.prepare(`UPDATE vocabulary SET korean=? WHERE id=? AND user_id=? AND korean=?`).bind(row.korean, row.id, uid, before),
            ]);
            await env.DB.batch(statements);
          }
        } catch (error) { console.error('[vocab] Korean meaning repair persistence failed'); }
      }
      return clean;
    };
  return { ensureVocab, vocabKstDay, gateVocabOwner, attachVocabTags, readableVocab };
}
