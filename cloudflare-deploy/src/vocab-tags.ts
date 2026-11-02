/* 🏷️ 단어장 카드 꼬리표 — «어디서 온 카드인가» (2026-11-02)
   지금 쓰는 꼬리표는 하나: 'awkward' = AI 영작 첨삭에서 «🟡 어색한 표현» 을 원어민 표현으로 고친 것.
   단어장 화면(vocab.html)이 그 카드에 «어색한 표현 → 원어민 표현» 표시를 붙입니다.

   ⛔ vocabulary 표에 칸을 ALTER 로 붙이지 않았습니다 — 그 표를 읽는 SELECT 가 10곳 넘게 흩어져 있고,
      칸이 없는 DB 에서 그 칸을 SELECT 하면 단어장 목록이 통째로 죽습니다. 옆 표에 두면 실패해도 «꼬리표만» 빠집니다.
   ⛔ 이 모듈은 던지지 않습니다(fail-open) — 꼬리표가 없어도 단어장·첨삭은 예전 그대로 돌아야 합니다.
   ⚠️ CREATE 는 반드시 한 줄 prepare().run() — env.DB.exec 는 줄마다 실행해 여러 줄 CREATE 가 조용히 실패합니다(CLAUDE.md 2장). */

export const VOCAB_TAG_AWKWARD = 'awkward';

const CREATE_SQL = `CREATE TABLE IF NOT EXISTS vocab_tags (vocab_id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, tag TEXT NOT NULL, created_at INTEGER NOT NULL)`;

type DB = { prepare: (sql: string) => any };

export async function markVocabTag(db: DB, vocabId: number, userId: string, tag: string): Promise<boolean> {
  if (!db || !(Number(vocabId) > 0) || !userId || !tag) return false;
  try {
    await db.prepare(CREATE_SQL).run();
    await db.prepare(`INSERT OR REPLACE INTO vocab_tags (vocab_id, user_id, tag, created_at) VALUES (?,?,?,?)`)
      .bind(Number(vocabId), userId, tag, Date.now()).run();
    return true;
  } catch (e: any) {
    console.warn('[vocab-tags] mark failed:', e?.message || e);
    return false;
  }
}

/** 그 학생 카드들의 꼬리표 — Map<vocab_id, tag>. 표가 없거나 실패하면 빈 Map(카드는 그대로 그려짐). */
export async function loadVocabTags(db: DB, userId: string): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!db || !userId) return out;
  try {
    const rs = await db.prepare(`SELECT vocab_id, tag FROM vocab_tags WHERE user_id = ? LIMIT 2000`).bind(userId).all();
    for (const r of (rs?.results || []) as any[]) {
      const id = Number(r?.vocab_id);
      if (id > 0 && r?.tag) out.set(id, String(r.tag));
    }
  } catch { /* 표가 아직 없으면 꼬리표 없음 */ }
  return out;
}
