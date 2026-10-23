/** Display-only deduplication. Keep the Mangoi schedule and all stored LMS records. */
export function dropCafe24SlotDuplicates<T extends { user_id?: unknown; joined_at?: unknown }>(
  cafe24: T[],
  mangoi: { source?: unknown; student_uid?: unknown; start_ts?: unknown; postponed?: unknown; status?: unknown }[],
): { kept: T[]; hidden: number } {
  const key = (uid: unknown, start: unknown): string | null => {
    if (typeof uid !== 'string' || !uid.trim()) return null;
    const ms = Number(start);
    // Absolute timestamps include the date. Never match names or approximate times.
    return Number.isSafeInteger(ms) && ms > 0 ? JSON.stringify([uid, ms]) : null;
  };
  const slots = new Set<string>();
  for (const row of mangoi) {
    if (row.source !== 'mangoi' || row.postponed || row.status === 'postponed' || row.status === 'cancelled') continue;
    const slot = key(row.student_uid, row.start_ts);
    if (slot) slots.add(slot);
  }
  const kept = cafe24.filter(row => {
    const slot = key(row.user_id, row.joined_at);
    return !slot || !slots.has(slot);
  });
  return { kept, hidden: cafe24.length - kept.length };
}
