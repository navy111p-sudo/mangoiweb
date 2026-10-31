import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dropCafe24SlotDuplicates } from '../cloudflare-deploy/src/cafe24-slot-duplicates.ts';

const start = Date.parse('2026-10-23T20:00:00+09:00');
const mangoi = { source: 'mangoi', schedule_id: 6827, student_uid: 'student-a', start_ts: start, status: 'ended', room_id: 'class-6827-20261023' };
const lms = { room_id: 'c24-1', user_id: 'student-a', joined_at: start };

test('keep #6827 and hide its exact LMS duplicate without mutating records', () => {
  const local = Object.freeze({ ...mangoi });
  const remote = Object.freeze({ ...lms });
  const rows = Object.freeze([remote]);
  assert.deepEqual(dropCafe24SlotDuplicates(rows, [local]), { kept: [], hidden: 1 });
  assert.equal(local.schedule_id, 6827);
  assert.equal(local.room_id, 'class-6827-20261023');
  assert.equal(rows.length, 1);
});

test('retain other students, times, dates, case-distinct accounts and missing identities', () => {
  const rows = [
    { ...lms, user_id: 'student-b' },
    { ...lms, joined_at: start + 60000 },
    { ...lms, joined_at: start + 86400000 },
    { ...lms, user_id: 'STUDENT-A' },
    { ...lms, user_id: '' },
    { ...lms, joined_at: null },
  ];
  assert.deepEqual(dropCafe24SlotDuplicates(rows, [mangoi]), { kept: rows, hidden: 0 });
});

test('do not suppress LMS based on cancelled/postponed or non-Mangoi rows', () => {
  for (const patch of [{ postponed: true }, { status: 'postponed' }, { status: 'cancelled' }, { source: 'cafe24' }, { student_uid: '' }]) {
    assert.equal(dropCafe24SlotDuplicates([lms], [{ ...mangoi, ...patch }]).hidden, 0);
  }
  assert.equal(dropCafe24SlotDuplicates([lms], []).hidden, 0);
});

test('normalize numeric timestamp strings but never round approximate times', () => {
  assert.equal(dropCafe24SlotDuplicates([{ ...lms, joined_at: String(start) }], [mangoi]).hidden, 1);
  assert.equal(dropCafe24SlotDuplicates([{ ...lms, joined_at: start + 1 }], [mangoi]).hidden, 0);
});

test('admin handler filters before mapping, counts and enrichment', () => {
  const src = readFileSync(new URL('../cloudflare-deploy/src/api-admin.ts', import.meta.url), 'utf8');
  const filter = src.indexOf('const c24SlotDuplicates = dropCafe24SlotDuplicates(c24Rows, sessions)');
  const map = src.indexOf('const tmap = await loadCafe24TeacherMap', filter);
  const assign = src.indexOf('c24Rows = c24SlotDuplicates.kept', filter);
  assert.ok(filter > 0 && assign > filter && map > assign);
  assert.ok(src.includes('cafe24_slot_duplicates_hidden: c24SlotDuplicates.hidden'));
});
