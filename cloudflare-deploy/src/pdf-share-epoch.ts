import type { PdfShareData } from './types';

export interface PdfEpochRecord {
  version: 1;
  mode: 'strict' | 'disabled';
  revision: number;
  epoch: string;
  state: PdfShareData | null;
  last: { id: string; fingerprint: string } | null;
}
export interface PdfEpochResult {
  ok: boolean;
  record: PdfEpochRecord;
  reason?: 'stale' | 'invalid' | 'duplicate-mismatch';
}

// This record contains identity/state only, never annotation payloads. Independent
// of the disabled experimental PDF/whiteboard replay journals.
export class PdfShareEpoch {
  static readonly KEY = 'pdfShareEpoch:v1';
  constructor(
    private storage: Pick<DurableObjectStorage, 'transaction'>,
    private token: () => string = () => crypto.randomUUID(),
  ) {}

  private check(value: any): PdfEpochRecord {
    if (!value || value.version !== 1 || !['strict', 'disabled'].includes(value.mode)
      || !Number.isSafeInteger(value.revision) || value.revision < 1
      || typeof value.epoch !== 'string' || !value.epoch || value.epoch.length > 128
      || (value.state !== null && (typeof value.state?.url !== 'string' || value.state.shareEpoch !== value.epoch || value.state.shareRevision !== value.revision))
      || (value.last !== null && (typeof value.last?.id !== 'string' || typeof value.last?.fingerprint !== 'string')))
      throw new Error('PDF share epoch record requires reconciliation');
    return value;
  }

  private next(previous?: string): string {
    const value = this.token();
    if (typeof value !== 'string' || !value || value.length > 128 || value === previous)
      throw new Error('PDF share epoch generator did not produce a fresh identity');
    return value;
  }

  private async checked(tx: DurableObjectTransaction): Promise<PdfEpochRecord> {
    const record = this.check(await tx.get(PdfShareEpoch.KEY));
    if (record.mode !== 'strict') throw new Error('PDF share epoch is disabled');
    const mirror = (await tx.get<PdfShareData>('pdfState')) || null;
    if (JSON.stringify(mirror) !== JSON.stringify(record.state))
      throw new Error('PDF share epoch mirror changed outside this protocol');
    return record;
  }

  async open(): Promise<PdfEpochRecord> {
    return this.storage.transaction(async tx => {
      const existing = await tx.get<PdfEpochRecord>(PdfShareEpoch.KEY);
      if (existing) {
        this.check(existing);
        if (existing.mode === 'strict') return this.checked(tx);
      }
      const legacy = (await tx.get<PdfShareData>('pdfState')) || null;
      if (legacy && typeof legacy.url !== 'string') throw new Error('Invalid legacy PDF state');
      if (existing?.revision === Number.MAX_SAFE_INTEGER) throw new Error('PDF share revision exhausted');
      const revision = (existing?.revision || 0) + 1;
      const epoch = this.next(existing?.epoch);
      const state = legacy ? { ...legacy, shareEpoch: epoch, shareRevision: revision } : null;
      if (state) delete state.annotationSession; // Never enable numeric authoritative replay by migration.
      const record: PdfEpochRecord = {
        version: 1, mode: 'strict', revision, epoch, state, last: null,
      };
      await tx.put({ [PdfShareEpoch.KEY]: record, pdfState: record.state });
      return record;
    });
  }

  // Fence before allowing this version's legacy mode to mutate the mirror. On
  // re-enable open() derives a fresh epoch from the latest legacy state.
  async disable(): Promise<void> {
    await this.storage.transaction(async tx => {
      const existing = await tx.get<PdfEpochRecord>(PdfShareEpoch.KEY);
      if (!existing) return;
      this.check(existing);
      if (existing.mode === 'disabled') return;
      if (existing.revision === Number.MAX_SAFE_INTEGER) throw new Error('PDF share revision exhausted');
      const disabled: PdfEpochRecord = { ...existing, mode: 'disabled',
        revision: existing.revision + 1, epoch: this.next(existing.epoch), state: null, last: null };
      const mirror = (await tx.get<PdfShareData>('pdfState')) || null;
      if (mirror) { delete mirror.shareEpoch; delete mirror.shareRevision; }
      await tx.put({ [PdfShareEpoch.KEY]: disabled, pdfState: mirror });
    });
  }

  async change(type: 'share' | 'page' | 'stop', data: any, now: number): Promise<PdfEpochResult> {
    return this.storage.transaction(async tx => {
      const current = await this.checked(tx);
      const id = data?.epochRequestId;
      if (typeof id !== 'string' || !id || id.length > 128) return { ok: false, reason: 'invalid', record: current };
      const payload = type === 'share' ? [data.url, data.currentPage || 1, data.kind || '', data.name || '']
        : type === 'page' ? [data.documentUrl, data.currentPage ?? data.pageNum] : [data.documentUrl];
      const fingerprint = JSON.stringify([type, data.shareEpoch, data.shareRevision, payload]);
      if (current.last?.id === id) return current.last.fingerprint === fingerprint
        ? { ok: true, record: current } : { ok: false, reason: 'duplicate-mismatch', record: current };
      if (data.shareEpoch !== current.epoch || data.shareRevision !== current.revision) return { ok: false, reason: 'stale', record: current };
      if (type !== 'share' && current.state && data.documentUrl !== current.state.url)
        return { ok: false, reason: 'stale', record: current };
      let state = current.state;
      let epoch = current.epoch;
      if (type === 'share') {
        if (typeof data.url !== 'string' || !data.url || data.url.length > 8192 || /^blob:/i.test(data.url))
          return { ok: false, reason: 'invalid', record: current };
        if (!state || state.url !== data.url) epoch = this.next(current.epoch);
        state = { url: data.url, currentPage: data.currentPage || 1, kind: data.kind || '', name: data.name || '', shareEpoch: epoch };
      } else if (type === 'page') {
        const page = data.currentPage ?? data.pageNum;
        if (!state || typeof page !== 'number' || !Number.isFinite(page))
          return { ok: false, reason: 'invalid', record: current };
        state = { ...state, currentPage: page };
      } else if (state) { state = null; epoch = this.next(current.epoch); }
      if (current.revision === Number.MAX_SAFE_INTEGER) throw new Error('PDF share revision exhausted');
      if (state) state = { ...state, shareRevision: current.revision + 1 };
      const record: PdfEpochRecord = { version: 1, mode: 'strict', revision: current.revision + 1,
        epoch, state, last: { id, fingerprint } };
      await tx.put({ [PdfShareEpoch.KEY]: record, pdfState: state, mediaAt: now });
      return { ok: true, record };
    });
  }
}
