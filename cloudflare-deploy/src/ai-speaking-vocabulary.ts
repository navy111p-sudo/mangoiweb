const DAY = 86400000;
const KST = 9 * 3600000;
export type VocabularyDay = { date: string; words: number; limited: boolean };

/** Observed words in completed practice, not an estimate of vocabulary ability. */
export async function readSpeakingVocabularyWeek(db: any, uid: string, now = Date.now()): Promise<VocabularyDay[] | null> {
  if (!uid || !Number.isSafeInteger(now) || !Number.isFinite(new Date(now + KST).getTime())) return null;
  const today = Math.floor((now + KST) / DAY) * DAY - KST;
  const start = today - 6 * DAY;
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: new Date(start + i * DAY + KST).toISOString().slice(0, 10), words: new Set<string>(), limited: false,
  }));
  try {
    const rows = await db.prepare(`SELECT finished_at,result_json,capture_limited FROM ai_speaking_sessions
      WHERE student_uid=? AND status='complete' AND finished_at>=? AND finished_at<=?`)
      .bind(uid, start, now).all();
    if (rows.success === false || !Array.isArray(rows.results)) return null;
    for (const row of rows.results) {
      const result = JSON.parse(row.result_json);
      if (!Array.isArray(result?.uniqueWords) || !Number.isSafeInteger(row.finished_at)) return null;
      const day = days[Math.floor((row.finished_at - start) / DAY)];
      if (!day) return null;
      for (const word of result.uniqueWords) {
        if (typeof word !== 'string' || !/^[a-z]+(?:['’-][a-z]+)*$/i.test(word)) return null;
        day.words.add(word.toLowerCase());
      }
      day.limited ||= !!row.capture_limited;
    }
    return days.map(day => ({ date: day.date, words: day.words.size, limited: day.limited }));
  } catch { return null; }
}
