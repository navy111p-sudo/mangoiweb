/** Read finalized monthly bonuses without allocating KRW amounts to PHP lessons.
 * Teacher access uses the authenticated account's explicit roster link, never a
 * client-supplied teacher id or a coincidentally equal profile id. No DDL/writes.
 */
export async function loadTeacherMonthlyIncentive(db: any, year: number, month: number,
  identity: { username?: string; rosterId?: string }): Promise<any> {
  const result = { period: `${year}-${String(month).padStart(2, '0')}`, currency: 'KRW', amount: null, status: 'unlinked' };
  try {
    let id = identity.rosterId || '';
    if (identity.username) {
      const links = await db.prepare('SELECT DISTINCT teacher_id FROM teacher_account_links WHERE username = ? LIMIT 2')
        .bind(identity.username).all();
      if (!links || !Array.isArray(links.results)) return { ...result, status: 'unavailable' };
      if (links.results.length !== 1) return result;
      id = String(links.results[0].teacher_id || '');
    }
    if (!/^\d+$/.test(id) || Number(id) <= 0) return result;
    const rows = await db.prepare('SELECT bonus_krw, finalized_at FROM payslips WHERE teacher_id = ? AND year = ? AND month = ? LIMIT 2')
      .bind(Number(id), year, month).all();
    if (!rows || !Array.isArray(rows.results)) return { ...result, status: 'unavailable' };
    if (!rows.results.length) return { ...result, status: 'not_finalized' };
    if (rows.results.length !== 1) return { ...result, status: 'unavailable' };
    const row = rows.results[0];
    if (!(Number(row.finalized_at) > 0)) return { ...result, status: 'not_finalized' };
    if (row.bonus_krw == null || row.bonus_krw === '' || !Number.isFinite(Number(row.bonus_krw)) || Number(row.bonus_krw) < 0)
      return { ...result, status: 'unavailable' };
    return { ...result, status: 'finalized', amount: Number(row.bonus_krw) };
  } catch {
    return { ...result, status: 'unavailable' };
  }
}
