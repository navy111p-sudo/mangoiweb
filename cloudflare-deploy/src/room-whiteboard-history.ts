/** Bounded replay journal in this room's existing SQLite-backed DO storage.
 * No shared DB or network calls. PDF snapshots reuse this bounded store through a fixed separate SQL namespace. */
export class RoomWhiteboardHistory {
  static readonly MAX_BYTES = 4 * 1024 * 1024;
  private static readonly PART_CHARS = 200000; // UTF-8 <= 600 KB; below a SQL row limit.
  private ready: boolean;
  private resetTableReady: boolean;
  constructor(private sql: any, private maxOps: number, private transaction: <T>(body: () => T) => T) {
    // Passive room/status reads must not create a journal or prune stored data.
    this.ready = Number(sql.exec("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('vc_whiteboard_history','vc_whiteboard_parts')").one().n) === 2;
    this.resetTableReady = Number(sql.exec("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='vc_whiteboard_reset'").one().n) === 1;
  }
  hasHistory(): boolean { return this.ready; }
  private ensure(): void {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS vc_whiteboard_history ( seq INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, bytes INTEGER NOT NULL, at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS vc_whiteboard_parts ( seq INTEGER NOT NULL, part INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(seq, part))`);
  }
  private prune(): void {
    this.sql.exec(`DELETE FROM vc_whiteboard_history WHERE seq NOT IN (SELECT seq FROM vc_whiteboard_history ORDER BY seq DESC LIMIT ?)`, this.maxOps);
    this.sql.exec(`DELETE FROM vc_whiteboard_history WHERE seq IN (SELECT seq FROM (SELECT seq, SUM(bytes) OVER (ORDER BY seq DESC) AS used FROM vc_whiteboard_history) WHERE used > ?)`, RoomWhiteboardHistory.MAX_BYTES);
    this.sql.exec('DELETE FROM vc_whiteboard_parts WHERE seq NOT IN (SELECT seq FROM vc_whiteboard_history)');
  }
  read(): { ops: { t: string; d: any }[]; at: number; blocked?: boolean; generation?: number } {
    const ops: { t: string; d: any }[] = [];
    let at = 0;
    const reset = this.resetTableReady ? [...this.sql.exec('SELECT pending,generation FROM vc_whiteboard_reset WHERE id=1')][0] : null;
    const generation = reset ? Number(reset.generation) : undefined;
    if (this.resetTableReady && (!reset || Number(reset.pending) !== 0 || !Number.isSafeInteger(generation) || generation! < 1)) return { ops, at, blocked: true, generation };
    if (!this.ready) return { ops, at, blocked: this.resetTableReady ? false : undefined, generation };
    for (const r of this.sql.exec('SELECT seq, payload, at FROM (SELECT seq, payload, at, SUM(bytes) OVER (ORDER BY seq DESC) AS used, ROW_NUMBER() OVER (ORDER BY seq DESC) AS n FROM vc_whiteboard_history) WHERE used<=? AND n<=? ORDER BY seq', RoomWhiteboardHistory.MAX_BYTES, this.maxOps)) {
      const payload = r.payload || [...this.sql.exec('SELECT payload FROM vc_whiteboard_parts WHERE seq=? ORDER BY part', r.seq)]
        .map((p: any) => p.payload).join('');
      const op = JSON.parse(payload);
      if (op && typeof op.t === 'string' && op.d) ops.push(op);
      at = Math.max(at, Number(r.at) || 0);
    }
    return { ops, at, blocked: this.resetTableReady ? false : undefined, generation };
  }
  private insert(op: { t: string; d: any }, at: number): void {
    const payload = JSON.stringify(op);
    const bytes = new TextEncoder().encode(payload).byteLength;
    if (bytes > RoomWhiteboardHistory.MAX_BYTES) throw new Error('whiteboard operation exceeds replay budget');
      const split = payload.length > RoomWhiteboardHistory.PART_CHARS;
      const row = this.sql.exec('INSERT INTO vc_whiteboard_history(payload, bytes, at) VALUES(?,?,?) RETURNING seq', split ? '' : payload, bytes, at).one();
      if (split) for (let i = 0, part = 0; i < payload.length; part++) {
        let end = Math.min(i + RoomWhiteboardHistory.PART_CHARS, payload.length);
        if (end < payload.length && /[\uD800-\uDBFF]/.test(payload[end - 1]) && /[\uDC00-\uDFFF]/.test(payload[end])) end--;
        this.sql.exec('INSERT INTO vc_whiteboard_parts(seq, part, payload) VALUES(?,?,?)', row.seq, part, payload.slice(i, end));
        i = end;
      }
  }
  append(op: { t: string; d: any }, at: number): number {
    const count = this.transaction(() => {
      if (!this.ready) this.ensure();
      this.insert(op, at);
      this.prune();
      return Number(this.sql.exec('SELECT COUNT(*) AS n FROM vc_whiteboard_history').one().n);
    });
    this.ready = true;
    return count;
  }
  replace(ops: { t: string; d: any }[], at: number): number {
    const count = this.transaction(() => {
      if (!this.ready) this.ensure();
      this.sql.exec('DELETE FROM vc_whiteboard_history');
      this.sql.exec('DELETE FROM vc_whiteboard_parts');
      for (const op of ops) this.insert(op, at);
      this.prune();
      return Number(this.sql.exec('SELECT COUNT(*) AS n FROM vc_whiteboard_history').one().n);
    });
    this.ready = true;
    return count;
  }
  markResetPending(): number {
    this.sql.exec('CREATE TABLE IF NOT EXISTS vc_whiteboard_reset (id INTEGER PRIMARY KEY CHECK(id=1), pending INTEGER NOT NULL CHECK(pending IN (0,1)), generation INTEGER NOT NULL)');
    this.resetTableReady = true;
    return Number(this.sql.exec('INSERT INTO vc_whiteboard_reset(id,pending,generation) VALUES(1,1,1) ON CONFLICT(id) DO UPDATE SET pending=1,generation=generation+1 RETURNING generation').one().generation);
  }
  clear(): void { this.transaction(() => {
    if (this.ready) {
      this.sql.exec('DELETE FROM vc_whiteboard_history');
      this.sql.exec('DELETE FROM vc_whiteboard_parts');
    }
    if (this.resetTableReady) this.sql.exec('UPDATE vc_whiteboard_reset SET pending=0 WHERE id=1');
  }); }
}
