/** Bounded replay journal in this room's existing SQLite-backed DO storage.
 * No shared DB, identifiers or network calls. Live PDF annotations remain separate. */
export class RoomWhiteboardHistory {
  static readonly MAX_BYTES = 4 * 1024 * 1024;
  private static readonly PART_CHARS = 200000; // UTF-8 <= 600 KB; below a SQL row limit.
  private ready: boolean;
  constructor(private sql: any, private maxOps: number, private transaction: <T>(body: () => T) => T) {
    // Passive room/status reads must not create a journal or prune stored data.
    this.ready = Number(sql.exec("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('vc_whiteboard_history','vc_whiteboard_parts')").one().n) === 2;
  }
  private ensure(): void {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS vc_whiteboard_history ( seq INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, bytes INTEGER NOT NULL, at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS vc_whiteboard_parts ( seq INTEGER NOT NULL, part INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(seq, part))`);
  }
  private prune(): void {
    this.sql.exec(`DELETE FROM vc_whiteboard_history WHERE seq NOT IN (SELECT seq FROM vc_whiteboard_history ORDER BY seq DESC LIMIT ?)`, this.maxOps);
    this.sql.exec(`DELETE FROM vc_whiteboard_history WHERE seq IN (SELECT seq FROM (SELECT seq, SUM(bytes) OVER (ORDER BY seq DESC) AS used FROM vc_whiteboard_history) WHERE used > ?)`, RoomWhiteboardHistory.MAX_BYTES);
    this.sql.exec('DELETE FROM vc_whiteboard_parts WHERE seq NOT IN (SELECT seq FROM vc_whiteboard_history)');
  }
  read(): { ops: { t: string; d: any }[]; at: number } {
    const ops: { t: string; d: any }[] = [];
    let at = 0;
    if (!this.ready) return { ops, at };
    for (const r of this.sql.exec('SELECT seq, payload, at FROM (SELECT seq, payload, at, SUM(bytes) OVER (ORDER BY seq DESC) AS used, ROW_NUMBER() OVER (ORDER BY seq DESC) AS n FROM vc_whiteboard_history) WHERE used<=? AND n<=? ORDER BY seq', RoomWhiteboardHistory.MAX_BYTES, this.maxOps)) {
      const payload = r.payload || [...this.sql.exec('SELECT payload FROM vc_whiteboard_parts WHERE seq=? ORDER BY part', r.seq)]
        .map((p: any) => p.payload).join('');
      const op = JSON.parse(payload);
      if (op && typeof op.t === 'string' && op.d) ops.push(op);
      at = Math.max(at, Number(r.at) || 0);
    }
    return { ops, at };
  }
  append(op: { t: string; d: any }, at: number): number {
    const payload = JSON.stringify(op);
    const bytes = new TextEncoder().encode(payload).byteLength;
    if (bytes > RoomWhiteboardHistory.MAX_BYTES) throw new Error('whiteboard operation exceeds replay budget');
    const count = this.transaction(() => {
      if (!this.ready) this.ensure();
      const split = payload.length > RoomWhiteboardHistory.PART_CHARS;
      const row = this.sql.exec('INSERT INTO vc_whiteboard_history(payload, bytes, at) VALUES(?,?,?) RETURNING seq', split ? '' : payload, bytes, at).one();
      if (split) for (let i = 0, part = 0; i < payload.length; part++) {
        let end = Math.min(i + RoomWhiteboardHistory.PART_CHARS, payload.length);
        if (end < payload.length && /[\uD800-\uDBFF]/.test(payload[end - 1]) && /[\uDC00-\uDFFF]/.test(payload[end])) end--;
        this.sql.exec('INSERT INTO vc_whiteboard_parts(seq, part, payload) VALUES(?,?,?)', row.seq, part, payload.slice(i, end));
        i = end;
      }
      this.prune();
      return Number(this.sql.exec('SELECT COUNT(*) AS n FROM vc_whiteboard_history').one().n);
    });
    this.ready = true;
    return count;
  }
  clear(): void { if (!this.ready) return; this.transaction(() => {
    this.sql.exec('DELETE FROM vc_whiteboard_history');
    this.sql.exec('DELETE FROM vc_whiteboard_parts');
  }); }
}
