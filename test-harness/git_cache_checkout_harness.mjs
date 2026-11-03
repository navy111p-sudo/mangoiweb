// checkout 을 빠르게 하는 «.git 캐시» 가 지켜야 할 약속을 워크플로 파일에서 확인합니다 (2026-11-03).
//
// 왜: 모든 워크플로가 checkout 앞에서 지난번 .git 을 캐시로 되살리고(actions/cache/restore),
//     deploy.yml 만 한 주에 한 번 저장합니다(actions/cache). 이 약속이 깨지면 조용히 나빠집니다 —
//     ① PR 워크플로가 «저장» 하면 PR 마다 약 1.5GB 가 쌓여 저장소 캐시 한도(10GB)를 밀어내고
//        npm 캐시까지 지워집니다(에러 없음 — 다음 실행이 느려질 뿐)
//     ② 새 워크플로가 되살리기 단계를 빠뜨리면 그 워크플로만 예전처럼 느립니다(에러 없음)
//     ③ 저장하는 작업에 토큰이 .git/config 에 남으면 그 토큰이 캐시에 실립니다
//     ④ checkout 이 clean 을 끄거나 일부만 받으면(sparse) 되살린 .git 의 옛 파일이 섞이거나,
//        media 의 실제 크기를 재는 하니스가 «파일 없음» 으로 무너집니다
// 판정은 문자열이 아니라 «잡(job) 안의 단계 순서» 로 합니다 — 되살리기가 checkout «뒤» 에 있으면
// 아무 일도 안 합니다(checkout 이 먼저 전부 받아 버립니다).
import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✅ ' + msg); } else { fail++; console.log('  ❌ ' + msg); } }

const DIR = '.github/workflows';
const PREFIX = 'repo-git-v1-';
const SAVER = 'deploy.yml';
// android.yml 은 checkout 뒤에 main 으로 git push 를 합니다(APK 커밋). 드물게 돌아 얻는 것이 적고,
// 되살린 .git 의 옛 ref 가 그 push 경로에 끼어들 여지를 만들지 않으려고 뺐습니다.
const EXEMPT = { 'android.yml': 'checkout 뒤에 main 으로 push 하는 드문 작업 — 캐시를 쓰지 않음' };

// 주석을 벗긴 줄(값 판정용). 한 줄 전체 주석과 «공백 + #» 뒤 꼬리 주석을 지웁니다.
const uncomment = (ln) => /^\s*#/.test(ln) ? '' : ln.replace(/\s+#.*$/, '');

// 한 워크플로를 잡 → 단계 목록으로 자릅니다(들여쓰기 기준 — 이 저장소 워크플로의 모양에 맞춘 최소 파서).
function jobsOf(text) {
  const lines = text.split('\n');
  const jStart = lines.findIndex(l => /^jobs:\s*$/.test(l));
  if (jStart < 0) return [];
  const jobs = [];
  let cur = null;
  for (let i = jStart + 1; i < lines.length; i++) {
    const m = lines[i].match(/^  ([\w-]+):\s*$/);
    if (m) { cur = { name: m[1], lines: [] }; jobs.push(cur); continue; }
    if (/^\S/.test(lines[i])) break;
    if (cur) cur.lines.push(lines[i]);
  }
  for (const j of jobs) {
    const si = j.lines.findIndex(l => /^\s+steps:\s*$/.test(uncomment(l)));
    j.steps = [];
    if (si < 0) continue;
    let ind = null, step = null;
    for (let k = si + 1; k < j.lines.length; k++) {
      const raw = j.lines[k], ln = uncomment(raw);
      const m = ln.match(/^(\s*)- /);
      if (m && (ind === null || m[1].length === ind)) { ind = m[1].length; step = { raw: [raw], text: [ln] }; j.steps.push(step); continue; }
      if (ind !== null && ln.trim() && (ln.match(/^\s*/)[0].length < ind)) break;
      if (step) { step.raw.push(raw); step.text.push(ln); }
    }
    for (const s of j.steps) {
      const t = s.text.join('\n');
      s.t = t;
      s.uses = (t.match(/uses:\s*(\S+)/) || [])[1] || '';
      s.name = ((t.match(/- name:\s*(.+)/) || [])[1] || s.uses).trim();
      const w = (k) => { const mm = t.match(new RegExp('^\\s+' + k + ':\\s*(.+)$', 'm')); return mm ? mm[1].trim() : null; };
      s.path = w('path'); s.key = w('key'); s.restoreKeys = w('restore-keys');
      s.persist = w('persist-credentials'); s.clean = w('clean'); s.sparse = /sparse-checkout/.test(t);
      s.wd = w('working-directory'); s.id = w('id'); s.run = w('run');
    }
  }
  return jobs;
}

const files = fs.readdirSync(DIR).filter(f => /\.ya?ml$/.test(f)).sort();
ok(files.includes(SAVER) && files.includes('ci.yml'), '전제: deploy.yml·ci.yml 을 찾았다');

let checkoutJobs = 0, savers = [];
for (const f of files) {
  const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
  ok(!/TEMP-PROBE/.test(raw), f + ': 실측용 임시 저장(TEMP-PROBE) 이 남아 있지 않다');
  const jobs = jobsOf(raw);
  for (const j of jobs) {
    const coIdx = j.steps.findIndex(s => /^actions\/checkout@/.test(s.uses));
    const cacheSteps = j.steps.map((s, i) => ({ s, i })).filter(x => /^actions\/cache(\/restore|\/save)?@/.test(x.s.uses) && x.s.path === '.git');
    for (const x of cacheSteps) if (!/^actions\/cache\/restore@/.test(x.s.uses)) savers.push(f + ':' + j.name + ':' + x.s.uses);
    if (coIdx < 0) continue;
    const co = j.steps[coIdx];
    const label = f + ' › ' + j.name;
    ok(co.clean !== 'false', label + ': checkout 이 clean 을 끄지 않는다 — 되살린 .git 의 옛 파일이 섞이지 않게');
    if (f === SAVER || f === 'ci.yml') ok(!co.sparse, label + ': 전체를 받는다(sparse 금지 — 하니스가 media 실제 크기를 잰다)');
    if (EXEMPT[f]) { ok(cacheSteps.length === 0, label + ': (예외) ' + EXEMPT[f]); continue; }
    checkoutJobs++;
    ok(cacheSteps.length === 1, label + ': .git 캐시 단계가 정확히 하나 있다');
    if (cacheSteps.length !== 1) continue;
    const c = cacheSteps[0];
    ok(c.i < coIdx, label + ': 캐시 단계가 checkout «앞» 에 있다 — 뒤면 아무 일도 안 한다');
    ok(c.s.restoreKeys === PREFIX, label + ': restore-keys 가 «' + PREFIX + '» 하나다(모든 워크플로가 같은 캐시를 읽게)');
    ok(!!c.s.key && c.s.key.startsWith(PREFIX) || /steps\.gitkey\.outputs\.key/.test(c.s.key || ''), label + ': key 가 같은 접두사에서 나온다');
    if (f === SAVER) {
      ok(/^actions\/cache@/.test(c.s.uses), label + ': 저장은 여기서 한다(actions/cache — 저장은 checkout 정리 «뒤» 의 post 단계)');
      ok(/steps\.gitkey\.outputs\.key/.test(c.s.key || ''), label + ': 저장 열쇠는 gitkey 단계가 만든다');
      const g = j.steps.findIndex(s => s.id === 'gitkey');
      ok(g >= 0 && g < c.i, label + ': gitkey 단계가 캐시 단계 «앞» 에 있다');
      if (g >= 0) {
        const gs = j.steps[g];
        ok(/%G-W%V/.test(gs.t) && gs.t.includes(PREFIX), label + ': 열쇠가 «주 단위»(' + PREFIX + 'YYYY-Www) — 실행마다 1.5GB 를 올리지 않게');
        const hasDefaultWd = /^\s+working-directory:\s*cloudflare-deploy/m.test(j.lines.join('\n').split(/^\s+steps:/m)[0]);
        ok(!hasDefaultWd || gs.wd === '.', label + ': gitkey 단계는 working-directory 를 «.» 로 덮는다(checkout 전이라 cloudflare-deploy/ 가 없다)');
      }
      ok(co.persist === 'false', label + ': checkout persist-credentials: false — 토큰이 .git/config 에 남아 캐시에 실리지 않게');
    } else {
      ok(/^actions\/cache\/restore@/.test(c.s.uses), label + ': «읽기만» 한다(actions/cache/restore) — PR 마다 1.5GB 를 저장하지 않게');
    }
  }
}
ok(checkoutJobs >= 7, '전제: 캐시를 쓰는 checkout 잡을 ' + checkoutJobs + '개 찾았다(ci·deploy·브라우저 검사들)');
ok(savers.length === 1 && savers[0].startsWith(SAVER + ':'), '.git 을 «저장» 하는 곳은 ' + SAVER + ' 하나뿐이다 (찾은 곳: ' + (savers.join(', ') || '없음') + ')');

console.log('git_cache_checkout_harness: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
