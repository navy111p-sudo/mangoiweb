/** Stable-ID parser/SQLite guard equivalence and conservative planner boundaries.
 * Synthetic data only; no external calls or persistent database.
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(join(ROOT, 'cloudflare-deploy/package.json'));
const { buildSync } = require('esbuild');
const temp = mkdtempSync(join(tmpdir(), 'c24-identity-'));
const db = new DatabaseSync(':memory:');
globalThis.fetch = async () => { throw new Error('No network in identity QA'); };
let passed = 0;
const check = (name, value) => { assert(value, name); passed++; };
try {
  const load = async name => {
    const file = join(temp, name + '.mjs');
    writeFileSync(file, buildSync({ entryPoints: [join(ROOT, 'cloudflare-deploy/src', name + '.ts')],
      bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' }).outputFiles[0].text);
    return import(pathToFileURL(file).href);
  };
  const I = await load('c24-identity'), M = await load('c24-mirror');
  const glob = db.prepare("SELECT (' ' || COALESCE(?, '') || ' ') GLOB ? AS matched");
  const spaces = [' ', '\t', '\n', '\v', '\f', '\r', '\u00a0', '\u1680', '\u2000', '\u2001', '\u2002',
    '\u2003', '\u2004', '\u2005', '\u2006', '\u2007', '\u2008', '\u2009', '\u200a', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff'];
  const ids = ['1', '12', '123', 'qa_original', 'other-id', 'Ab_9'];
  for (const id of ids) {
    for (const before of ['', ...spaces.map(s => 'memo' + s), 'prefix', '/', '\u200b', '\u0085']) {
      for (const after of ['', ' · end-makeup', '\nnext', '/tail', 'x', '_', '-', '9', ' c24:other']) {
        const notes = before + 'c24:' + id + after;
        check('native parser and SQL guard agree: ' + JSON.stringify(notes),
          !!glob.get(notes, I.c24IdentityGlob(id)).matched === I.c24NoteIds(notes).includes(id));
        check('legacy token-presence guard agrees: ' + JSON.stringify(notes),
          !!glob.get(notes, I.c24AnyIdentityGlob()).matched === (I.c24NoteIds(notes).length > 0));
      }
    }
  }
  for (const invalid of ['', 'a*', 'a?', '[a]', 'a b', 'a/b', '한글', null, 12])
    check('invalid upstream ID rejected: ' + invalid, !I.validC24ClassId(invalid));
  check('ID prefix is not same origin', !glob.get('c24:123', I.c24IdentityGlob('12')).matched);
  const manual = (extra = {}) => ({ id: 11, user_id: 'stu', teacher_id: '1', scheduled_date: '2026-10-06',
    start_time: '10:00', duration_min: 20, source: M.MIRROR_SOURCE_MANUAL, status: 'active', notes: 'c24:origin · 보강', ...extra });
  check('annotated token remains trustworthy', I.trustworthyC24Identity(manual()));
  for (const extra of [{ notes: null }, { notes: 'c24:' }, { notes: 'c24:origin c24:other' },
    { notes: 'c24:origin\0bad' }, { notes: 'c24:! c24:origin' }, { scheduled_date: null },
    { scheduled_date: '2026-02-30' }, { user_id: '' }])
    check('ambiguous/malformed identity not trusted: ' + JSON.stringify(extra), !I.trustworthyC24Identity(manual(extra)));
  const source = { class_id: 'origin', user_id: 'stu', date: '2026-10-05', teacher_id: '37', class_state: 1,
    start_ms: Date.parse('2026-10-05T10:00:00+09:00'), end_ms: Date.parse('2026-10-05T10:20:00+09:00') };
  const links = new Map([['37', { name: 'ALPHA', teacherId: '1' }]]), students = new Map([['stu', 'Fixture']]);
  const plan = (c = [source], window = [], global = []) => M.planMirror(c, links, students, window,
    'all', new Set(), new Set(), new Map(), global);
  check('outside-window manual date change is diverged', plan([source], [], [manual()])[0].verdict === 'diverged');
  check('same date/time is manual locked', plan([source], [], [manual({ scheduled_date: source.date })])[0].verdict === 'manual_locked');
  for (const status of ['cancelled', 'postponed', 'completed', 'ended'])
    check('manual status remains protected: ' + status, plan([source], [], [manual({ status })])[0].verdict === 'diverged');
  for (const rows of [[manual({ user_id: 'other' })], [manual(), manual({ id: 12 })],
    [manual(), manual()], [manual({ scheduled_date: null })], [manual({ notes: 'c24:origin c24:other' })]])
    check('identity collision withheld', plan([source], [], rows)[0].verdict === 'conflict');
  check('nonmirror notes are not ownership', plan([source], [], [manual({ source: 'adm-enroll:1' })])[0].verdict === 'ok');
  const different = manual({ notes: 'c24:another', scheduled_date: source.date, start_time: '11:00' });
  check('different same-student/day origin remains eligible', plan([source], [different], [different])[0].verdict === 'ok');
  const legacy = manual({ notes: null, scheduled_date: source.date });
  check('legacy note-less same-day protection retained', plan([source], [legacy], [legacy])[0].verdict === 'manual_locked');
  for (const class_id of ['', 'bad*']) check('invalid origin cannot create', plan([{ ...source, class_id }])[0].verdict === 'conflict');
  check('duplicate upstream ID is not chosen arbitrarily', plan([source, { ...source }]).every(r => r.verdict === 'conflict'));
  console.log(`c24_mirror_identity_harness: PASS ${passed} / FAIL 0`);
} finally { db.close(); rmSync(temp, { recursive: true, force: true }); }
