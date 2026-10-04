// Teacher week selection: execute source functions and UI listeners, with in-memory DOM/fetch only.
// node test-harness/teacher_week_navigation_harness.mjs
// TEACHER_HTML=/tmp/mutant.html ... allows mutation checks without editing the working tree.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const source = readFileSync(process.env.TEACHER_HTML || new URL('../cloudflare-deploy/public/teacher.html', import.meta.url), 'utf8');
let pass = 0, fail = 0;
function check(name, result) { console.log(`  ${result ? '✅' : '❌ FAIL'} ${name}`); result ? pass++ : fail++; }
function between(start, end, after = 0) {
  const a = source.indexOf(start, after), b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error('Missing source boundary: ' + start);
  return source.slice(a, b);
}
function fn(name) {
  const start = '  function ' + name + '(';
  const a = source.indexOf(start), b = source.indexOf('\n  function ', a + start.length);
  if (a < 0 || b < 0) throw new Error('Missing function: ' + name);
  return source.slice(a, b);
}
const weekCode = between('  var WK_OFFSET = 0;', '\n  /* 📅 다가오는 수업');
const languageCode = between("  document.getElementById('lang').onclick =", '\n  // 새로고침을 직접');
const visibilityCode = between("  document.addEventListener('visibilitychange'", "\n  window.addEventListener('online'", source.indexOf("  function scheduleAutoRefresh("));
function environment(instant = '2026-10-04T15:05:00Z', cache = null) {
  let clock = Date.parse(instant);
  const elements = new Map(), listeners = {}, requests = [], cacheStore = new Map();
  if (cache) cacheStore.set('portal', JSON.stringify(cache));
  const element = id => {
    if (!id) return null;
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, { hidden: false, value: '', textContent: '', innerHTML: '', firstChild: { nodeValue: '' }, attrs: {}, listeners: {},
        classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
        setAttribute(k,v) { this.attrs[k] = v; },
        addEventListener(k,cb) { (this.listeners[k] ||= []).push(cb); },
        dispatch(k) { for (const cb of this.listeners[k] || []) cb.call(this); }
      });
    }
    return elements.get(id);
  };
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const ui = { Date: FixedDate, console: { warn() {} }, DATA: null, SKEW: 0, CK: 'portal', LANG: 'en', langPickedByUser: false,
    IS_MGR: false, lastSig: null, AR_MIN: 45000, AR_MAX: 300000, arDelay: 45000, arTimer: null, knownRooms: null, newCount: 0,
    localStorage: { getItem: k => cacheStore.get(k) || null, setItem: (k,v) => cacheStore.set(k,v) },
    document: { hidden: false, getElementById: element, addEventListener: (k,cb) => listeners[k] = cb },
    navigator: { onLine: true }, location: {},
    fetch: url => new Promise((resolve,reject) => requests.push({ url, resolve, reject })),
    modalOpen: () => false, stopSec() {}, setLangFrom() {}, applyLang() {}, translateContent() {}, loadMonthStats() {}, loadApprovals() {}, loadOutage() {},
    renderAlsoAccount() {}, renderClasses() {}, renderUpcoming() {}, renderNotices() {}, renderResources() {}, renderManager() {}, paintClassCount() {}, paintNewBadge() {},
    scheduleAutoRefresh(ms) { ui.nextRefresh = ms; },
    EN: () => ui.LANG !== 'ko', T: (en,ko) => ui.LANG === 'ko' ? ko : en, esc: x => String(x ?? ''),
    stuLabelHtml: it => it.student_name, kindPill: () => ''
  };
  vm.createContext(ui);
  vm.runInContext([fn('now'), fn('todayKST'), fn('paintCached'), fn('saveCache'), fn('load'), fn('setStale'), fn('render'),
    weekCode, fn('classKeys'), fn('autoRefreshTick'), languageCode, visibilityCode].join('\n'), ui);
  return { ui, element, requests, cacheStore, listeners, setClock: iso => clock = Date.parse(iso) };
}
function week(start, label = start) {
  const ms = Date.parse(start + 'T00:00:00Z');
  const days = Array.from({ length: 7 }, (_,i) => {
    const date = new Date(ms + i * 86400000);
    return { date: date.toISOString().slice(0,10), dow: date.getUTCDay(), is_today: false,
      items: i === 0 ? [{ kind: 'class', student_name: label, start_time: '18:00', duration_min: 20, schedule_id: 8, room_id: 'class-8-' + start.replaceAll('-','') }] : [] };
  });
  return { start, end: days[6].date, days };
}
function payload(start, label = start) { return { ok: true, today: '2026-10-05', me: { name: 'Teacher' }, week: week(start,label), classes: [], upcoming: [], notices: [], resources: [], rating: {} }; }
const flush = () => new Promise(resolve => setImmediate(resolve));
async function respond(env, index, start, label) { const d = payload(start,label); d.today = env.ui.todayKST(); env.requests[index].resolve({ status: 200, json: async () => d }); await flush(); }
async function seeded(instant) { const e = environment(instant); e.ui.load(); await respond(e, 0, e.ui.wkMonday(0), 'initial'); return e; }
function shown(e, start, label) {
  return e.ui.DATA?.week?.start === start && e.ui.WK_DATA?.start === start
    && e.element('wk-date').value === start && e.element('wk-range').textContent.startsWith('(' + start + ' ~ ')
    && (label === undefined || e.element('week').innerHTML.includes(label));
}
function selectedRequest(e, index, start) { return new URL(e.requests[index].url, 'https://local.invalid').searchParams.get('week') === start; }
async function timezones() {
  for (const [instant, expected] of [
    ['2026-10-04T14:59:59Z', '2026-09-28'], ['2026-10-04T15:00:00Z', '2026-10-05'],
    ['2026-03-08T15:05:00Z', '2026-03-09'], ['2026-11-01T15:05:00Z', '2026-11-02'], ['2027-01-03T15:05:00Z', '2027-01-04']
  ]) {
    const e = environment(instant);
    check(`${process.env.TZ}: KST Monday at ${instant}`, e.ui.wkMonday(0) === expected);
  }
  const e = environment(); e.ui.WK_CLOCK_READY = true;
  e.ui.loadWeekOf('2026-10-04'); check(`${process.env.TZ}: Sunday picker uses previous Monday`, selectedRequest(e,0,'2026-09-28'));
  e.ui.loadWeekOf('2026-10-05'); check(`${process.env.TZ}: Monday picker uses same Monday`, selectedRequest(e,1,'2026-10-05'));
  e.ui.loadWeekOf('2026-03-08'); check(`${process.env.TZ}: DST picker has exact calendar week`, selectedRequest(e,2,'2026-03-02'));
  e.ui.SKEW = 7 * 86400000;
  check(`${process.env.TZ}: uses server clock skew`, e.ui.wkMonday(0) === '2026-10-12');
}
try {
  if (process.argv.includes('--timezone-only')) await timezones();
  else {
    for (const tz of ['UTC','America/Los_Angeles','Asia/Seoul','Asia/Manila']) {
      const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--timezone-only'], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
      process.stdout.write(result.stdout); if (result.stderr) process.stderr.write(result.stderr);
      check('timezone child ' + tz, result.status === 0);
    }
    for (const [first, second] of [[0,1],[1,-1],[-1,2],[1,1]]) {
      const e = await seeded(); e.ui.loadWeek(first); e.ui.loadWeek(second);
      await respond(e, 2, e.ui.wkMonday(second), 'newer');
      await respond(e, 1, e.ui.wkMonday(first), 'older');
      check(`navigation ${first} → ${second}: newer response wins`, shown(e,e.ui.wkMonday(second),'newer') && !e.element('week').innerHTML.includes('older'));
      check(`navigation ${first} → ${second}: all requests carry selected week`, selectedRequest(e,2,e.ui.wkMonday(second)));
    }
    {
      const e = await seeded();
      e.element('wk-next').dispatch('click'); await respond(e,1,'2026-10-12','selected');
      check('real Next click renders next week', shown(e,'2026-10-12','selected') && e.element('wk-next').classList.contains('on'));
      e.element('lang').onclick();
      check('language redraw keeps selected week', shown(e,'2026-10-12','selected') && e.element('week').innerHTML.includes('월'));
      e.listeners.visibilitychange(); check('visibility redraw keeps selected week', shown(e,'2026-10-12','selected'));
      e.ui.autoRefreshTick(); check('poll requests selected week', selectedRequest(e,2,'2026-10-12'));
      await respond(e,2,'2026-10-12','polled'); check('poll updates chosen week and DATA', shown(e,'2026-10-12','polled'));
      e.ui.load(true); check('Refresh keeps selected view while waiting', shown(e,'2026-10-12','polled'));
      check('Refresh requests selected week', selectedRequest(e,3,'2026-10-12'));
      await respond(e,3,'2026-10-12','reloaded'); check('Refresh updates chosen week', shown(e,'2026-10-12','reloaded'));
      check('repaints bind each button once', e.element('wk-next').listeners.click.length === 1 && e.element('wk-date').listeners.change.length === 1);
      e.element('wk-date').value = '2026-11-18'; e.element('wk-date').dispatch('change');
      check('date change requests corresponding Monday', selectedRequest(e,4,'2026-11-16'));
      await respond(e,4,'2026-11-16','far');
      check('far week leaves three shortcut buttons unselected', shown(e,'2026-11-16','far') && ['wk-prev','wk-this','wk-next'].every(id => !e.element(id).classList.contains('on')));
      e.element('wk-date').value = '2026-10-01'; e.element('wk-go').dispatch('click');
      check('Go button uses picked date', selectedRequest(e,5,'2026-09-28'));
    }
    for (const writer of ['load','autoRefreshTick']) {
      const e = await seeded(); e.ui[writer](); e.ui.loadWeek(1);
      await respond(e,2,'2026-10-12','new-choice'); await respond(e,1,'2026-10-05','stale-portal');
      check(`${writer}: old portal response cannot replace chosen week`, shown(e,'2026-10-12','new-choice'));
      e.element('lang').onclick(); check(`${writer}: stale response cannot poison DATA for later redraw`, shown(e,'2026-10-12','new-choice'));
      const f = await seeded(); f.ui.loadWeek(1); f.ui[writer]();
      await respond(f,2,'2026-10-12','new-portal'); await respond(f,1,'2026-10-12','stale-navigation');
      check(`${writer}: newer portal response wins over same-week navigation`, shown(f,'2026-10-12','new-portal'));
    }
    for (const writer of ['load','autoRefreshTick','loadWeek']) {
      const e = await seeded(); e.ui.loadWeek(1); await respond(e,1,'2026-10-12','keep');
      e.ui[writer](writer === 'loadWeek' ? -1 : undefined);
      e.requests[2].reject(new Error('offline')); await flush();
      check(`${writer}: failed request retains last valid range, data and content`, shown(e,'2026-10-12','keep'));
      check(`${writer}: failure retains visible-week button`, e.element('wk-next').classList.contains('on') && !e.element('wk-prev').classList.contains('on'));
      check(`${writer}: failure has visible retry guidance`, e.element('wk-error').hidden === false);
      check(`${writer}: failure clears busy state`, e.element('c-week').attrs['aria-busy'] === 'false');
      e.ui.autoRefreshTick(); const expected = writer === 'loadWeek' ? '2026-09-28' : '2026-10-12';
      check(`${writer}: later poll retries selected destination`, selectedRequest(e,3,expected));
      await respond(e,3,expected,'recovered'); check(`${writer}: later valid response recovers`, shown(e,expected,'recovered') && e.element('wk-error').hidden === true);
    }
    for (const bad of [null, { ok:false }, { ok:true, week:week('2026-09-28') }, { ok:true, week:{ start:'2026-10-12', days:[] } }]) {
      const e = await seeded(); e.ui.loadWeek(1); e.requests[1].resolve({json:async()=>bad}); await flush();
      check('invalid/error/wrong-week response retains displayed week', shown(e,'2026-10-05','initial'));
    }
    {
      const e = await seeded(); const n = e.requests.length;
      for (const value of ['','invalid','2026-02-31','2026-13-01','2026-10-05T00:00:00Z']) e.ui.loadWeekOf(value);
      check('invalid calendar dates do not request or corrupt selection', e.requests.length === n && shown(e,'2026-10-05','initial'));
      e.ui.loadWeek(1); e.ui.loadWeek(-1); await respond(e,2,'2026-09-28','valid');
      e.requests[1].reject(new Error('old failure')); await flush();
      check('old failed navigation cannot undo newer success', shown(e,'2026-09-28','valid'));
    }
    {
      const e = environment(undefined,payload('2026-10-12','cached-other-week')); e.ui.load();
      check('new visit ignores cached noncurrent week', e.ui.DATA.week === null && !e.element('week').innerHTML.includes('cached-other-week'));
      check('cold visit uses server default week before learning clock skew', e.requests[0].url === '/api/teacher/portal');
      await respond(e,0,'2026-10-05','fresh'); check('new visit replaces old cached week with current', shown(e,'2026-10-05','fresh'));
      const f = environment(undefined,payload('2026-10-05','cached-current')); f.ui.load();
      check('same-day current-week cache still paints immediately', shown(f,'2026-10-05','cached-current'));
      f.requests[0].reject(new Error('offline')); await flush();
      check('cache survives initial network failure and gets stale warning', shown(f,'2026-10-05','cached-current') && f.element('stale').hidden === false);
    }

    {
      const e = await seeded(); e.ui.load(); e.ui.loadWeek(1);
      await respond(e,2,'2026-10-12','new-valid');
      e.requests[1].resolve({ status:401, json:async()=>({ok:false}) }); await flush();
      check('stale 401 response cannot redirect after newer success', !e.ui.location.href && shown(e,'2026-10-12','new-valid'));
      const f = environment(); f.ui.load(); f.requests[0].resolve({ status:401 }); await flush();
      check('current 401 still redirects to login', f.ui.location.href === '/admin/login?next=%2Fteacher');
    }

    {
      const e = environment(); e.ui.load(); e.ui.autoRefreshTick();
      check('slow cold load is not superseded by partial auto-refresh', e.requests.length === 1 && e.ui.nextRefresh === e.ui.AR_MIN);
      await respond(e,0,'2026-10-05','slow-first');
      check('slow first response completes full initialization', shown(e,'2026-10-05','slow-first') && e.element('boot').hidden === true);
    }
    for (const badClock of ['2026-09-01T01:00:00Z','2026-12-21T01:00:00Z']) {
      const e = environment(badClock); e.ui.load();
      check('cold skewed clock asks server default week: ' + badClock, e.requests[0].url === '/api/teacher/portal');
      const d = payload('2026-10-05','server-current'); d.now = Date.parse('2026-10-04T15:05:00Z');
      e.requests[0].resolve({status:200,json:async()=>d}); await flush();
      check('cold skewed clock renders server-authoritative week: ' + badClock, shown(e,'2026-10-05','server-current') && e.ui.wkMonday(0) === '2026-10-05');
      e.ui.loadWeek(1); check('after clock correction Next uses KST server week: ' + badClock, selectedRequest(e,1,'2026-10-12'));
    }
    {
      const e = environment(undefined,payload('2026-10-05','cache')); e.ui.load();
      e.element('wk-this').dispatch('click'); await respond(e,1,'2026-10-05','cold-this');
      check('This week works while cold cached portal request is pending', shown(e,'2026-10-05','cold-this'));
      await respond(e,0,'2026-10-05','stale-initial');
      check('late initial payload cannot overwrite early cached navigation', shown(e,'2026-10-05','cold-this'));
    }
    {
      const e = await seeded('2026-10-04T14:59:00Z'); e.setClock('2026-10-04T15:05:00Z'); e.ui.autoRefreshTick();
      check('unselected current week advances at KST Monday', selectedRequest(e,1,'2026-10-05'));
      await respond(e,1,'2026-10-05','monday'); check('Monday refresh redraws new current week', shown(e,'2026-10-05','monday'));
      const f = await seeded('2026-10-04T14:59:00Z'); f.ui.loadWeek(2); await respond(f,1,'2026-10-12','pinned');
      f.setClock('2026-10-04T15:05:00Z'); f.ui.autoRefreshTick();
      check('explicit week stays pinned over KST Monday', selectedRequest(f,2,'2026-10-12'));
      await respond(f,2,'2026-10-12','pinned-monday'); check('shortcut highlight recalculates after Monday', shown(f,'2026-10-12','pinned-monday') && f.element('wk-next').classList.contains('on'));
    }
  }
} catch (error) { check('harness executes source without exception: ' + error.stack, false); }
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exitCode = fail ? 1 : 0;
