/** Local SQLite transaction adapter. No D1 runtime or network adapters are wired. */
import { createHash } from 'node:crypto';
function orderedJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(orderedJson).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + orderedJson(value[k])).join(',') + '}';
}
export function canonical(value) {
  // Use the same JSON semantics as persisted commands and transport retries:
  // optional undefined object fields disappear rather than producing invalid JSON.
  const json = JSON.stringify(value);
  if (json === undefined) throw Error('non_json_value');
  return orderedJson(JSON.parse(json));
}
export function sha(value) { return createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex'); }
export function createSandboxStore(db, contract) {
  const marker = db.prepare('SELECT purpose FROM student_entitlement_schema WHERE version=1').get();
  if (marker?.purpose !== 'local-synthetic-sandbox') throw Error('sandbox_schema_required');
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  function readSnapshot(fn) {
    // Subject, derived rows and replay ledger must share one read snapshot when
    // another connection commits. Reuse apply()'s existing write transaction.
    const ownsTransaction = !db.isTransaction;
    if (ownsTransaction) db.exec('BEGIN');
    try {
      const result = fn();
      if (ownsTransaction) db.exec('COMMIT');
      return result;
    } catch (e) { if (ownsTransaction && db.isTransaction) db.exec('ROLLBACK'); throw e; }
  }
  function verifyDerivedProjection(uid, state) {
    const rows = db.prepare('SELECT * FROM student_entitlements WHERE student_uid=?').all(uid);
    const expected = [...state.paidAi.map(g => ['paid_ai', g]), ...state.video.map(g => ['video_bundle', g])];
    if (rows.length !== expected.length) throw Error('entitlement_projection_mismatch');
    const byId = new Map(rows.map(row => [row.grant_id, row]));
    for (const [kind, g] of expected) {
      const row = byId.get(g.id);
      const wanted = { grant_id: g.id, origin_id: g.originId, student_uid: uid, kind,
        revoked: Number(g.revoked), purchased_ms: g.purchasedMs ?? null, remaining_ms: g.remainingMs ?? null,
        grant_json: canonical(g) };
      if (!row || canonical(row) !== canonical(wanted)) throw Error('entitlement_projection_mismatch');
    }
  }
  function read(uid) {
    return readSnapshot(() => {
      const row = db.prepare('SELECT * FROM student_entitlement_subjects WHERE student_uid=?').get(uid);
      if (!row) return contract.newEntitlementState(uid);
      const state = JSON.parse(row.projection_json);
      if (sha(state) !== row.projection_hash || state.revision !== row.revision || state.clock !== row.clock_ms || state.studentUid !== uid) throw Error('projection_integrity_error');
      verifyDerivedProjection(uid, state);
      return state;
    });
  }
  function apply(command, options = {}) {
    // A durable same-subject transaction/CAS is required. An in-memory JS lock
    // or payment-order lock does not serialize different orders for one learner.
    db.exec('BEGIN IMMEDIATE');
    try {
      const fingerprint = sha(command);
      const existing = db.prepare('SELECT * FROM student_entitlement_events WHERE command_id=?').get(command.id);
      if (existing) {
        if (existing.command_fingerprint !== fingerprint || existing.student_uid !== command.studentUid) throw Error('idempotency_key_conflict');
        db.exec('COMMIT');
        return { duplicate: true, committedRevision: existing.sequence, state: read(command.studentUid), transitions: JSON.parse(existing.transitions_json) };
      }
      const before = read(command.studentUid);
      const result = contract.applyEntitlementCommand(before, command);
      let row = db.prepare('SELECT last_event_hash FROM student_entitlement_subjects WHERE student_uid=?').get(command.studentUid);
      if (!row) {
        db.prepare('INSERT INTO student_entitlement_subjects VALUES(?,?,?,?,?,?)')
          .run(before.studentUid, 0, before.clock, canonical(before), sha(before), '');
        row = { last_event_hash: '' };
      }
      for (const o of result.state.origins.filter(o => !before.origins.some(old => old.id === o.id))) {
        db.prepare('INSERT INTO student_entitlement_origins VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(o.id, o.studentUid, o.sourceSystem, o.sourceRef, o.lineRef, o.evidenceRef, o.product, o.currency, o.paidAmount, o.expectedAmount, o.settledAt, canonical(o));
      }
      const projectionHash = sha(result.state), previousHash = row.last_event_hash;
      const eventHash = sha({ commandFingerprint: fingerprint, projectionHash, previousHash, transitions: result.transitions });
      db.prepare('INSERT INTO student_entitlement_events VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(command.id, command.studentUid, result.state.revision, command.at, command.type, fingerprint, canonical(command), canonical(result.transitions), projectionHash, previousHash, eventHash);
      if (options.injectFailure === 'after_event') throw Error('synthetic_database_failure');
      const cas = db.prepare('UPDATE student_entitlement_subjects SET revision=?,clock_ms=?,projection_json=?,projection_hash=?,last_event_hash=? WHERE student_uid=? AND revision=?')
        .run(result.state.revision, result.state.clock, canonical(result.state), projectionHash, eventHash, command.studentUid, command.expectedRevision);
      if (Number(cas.changes) !== 1) throw Error('revision_conflict');
      for (const [kind, grants] of [['paid_ai', result.state.paidAi], ['video_bundle', result.state.video]]) {
        for (const g of grants) db.prepare(`INSERT INTO student_entitlements VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(grant_id) DO UPDATE SET
          revoked=excluded.revoked,purchased_ms=excluded.purchased_ms,remaining_ms=excluded.remaining_ms,grant_json=excluded.grant_json`)
          .run(g.id, g.originId, result.state.studentUid, kind, Number(g.revoked), g.purchasedMs ?? null, g.remainingMs ?? null, canonical(g));
      }
      if (options.injectFailure === 'before_commit') throw Error('synthetic_database_failure');
      db.exec('COMMIT');
      return { ...result, duplicate: false, committedRevision: result.state.revision };
    } catch (e) { if (db.isTransaction) db.exec('ROLLBACK'); throw e; }
  }
  function verifyReplay(uid) {
    return readSnapshot(() => {
      let state = contract.newEntitlementState(uid), previousHash = '';
      const events = db.prepare('SELECT * FROM student_entitlement_events WHERE student_uid=? ORDER BY sequence').all(uid);
      for (const event of events) {
        const command = JSON.parse(event.command_json);
        const next = contract.applyEntitlementCommand(state, command);
        const fp = sha(command), ph = sha(next.state);
        const eh = sha({ commandFingerprint: fp, projectionHash: ph, previousHash, transitions: next.transitions });
        if (event.sequence !== next.state.revision || event.command_fingerprint !== fp || event.projection_hash !== ph || event.previous_event_hash !== previousHash || event.event_hash !== eh || canonical(next.transitions) !== event.transitions_json) throw Error('ledger_integrity_error');
        state = next.state; previousHash = eh;
      }
      if (sha(state) !== sha(read(uid))) throw Error('projection_replay_mismatch');
      const row = db.prepare('SELECT last_event_hash FROM student_entitlement_subjects WHERE student_uid=?').get(uid);
      if (row && row.last_event_hash !== previousHash) throw Error('ledger_head_mismatch');
      return { events: events.length, state, hash: sha(state) };
    });
  }
  return { apply, read, verifyReplay };
}
