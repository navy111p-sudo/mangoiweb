// checkout 을 빠르게 하는 «.git 캐시» 가 지켜야 할 약속을 워크플로 파일에서 확인합니다 (2026-11-03).
//
// 왜: 모든 워크플로가 checkout 앞에서 지난번 .git 을 캐시로 되살리고(actions/cache/restore),
//     deploy.yml 의 git-cache 잡 «하나» 만 한 주에 한 번 «새로 받은» .git 을 저장합니다.
//     이 약속이 깨지면 조용히 나빠집니다 —
//     ① PR·다른 잡이 «저장» 하면 PR 마다 약 1.5GB 가 쌓여 저장소 캐시 한도(10GB)를 밀어내고
//        npm 캐시까지 지워집니다(에러 없음 — 다음 실행이 느려질 뿐)
//     ② 저장하는 잡이 npm·wrangler 같은 남의 코드를 돌리면, 그 코드가 저장 전에 .git(hooks·config·객체)을
//        건드릴 수 있고 그것이 캐시를 타고 모든 PR·다음 배포의 checkout 에 실립니다
//     ③ 지난 캐시를 되살려 «이어» 저장하면 옛 객체가 영영 안 지워져 캐시가 계속 커집니다
//     ④ 새 워크플로가 되살리기 단계를 빠뜨리면 그 워크플로만 예전처럼 느립니다(에러 없음)
//     ⑤ checkout 이 clean 을 끄거나 일부만 받으면(sparse) media 의 실제 크기를 재는 하니스가 무너집니다
// 판정은 문자열 «있음» 이 아니라 «잡(job) 안의 단계 순서·값» 으로 합니다.
// 🪤 2026-11-03 함정 대조가 첫 판의 구멍을 실제로 뚫었습니다 — path 를 «.git» 정확일치로만 셌더니
//    `path: |` 블록·`./.git`·`${{ github.workspace }}/.git` 로 저장하는 단계가 «캐시 단계 아님» 으로 빠졌고,
//    열쇠 검사는 «%G-W%V 라는 글자가 있는가» 라 뒤에 run_id 를 붙여도 통과했습니다. 아래는 그 둘을 막습니다.
import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✅ ' + msg); } else { fail++; console.log('  ❌ ' + msg); } }

const DIR = process.env.GIT_CACHE_WF_DIR || '.github/workflows';
const PREFIX = 'repo-git-v1-';
const WRITER = { file: 'deploy.yml', job: 'git-cache' };
const KEY_RUN = 'echo "key=' + PREFIX + '$(date -u +%G-W%V)" >> "$GITHUB_OUTPUT"';
const KEY_REF = '${{ steps.gitkey.outputs.key }}';
const MISS_IF = "steps.lookup.outputs.cache-hit != 'true'";
// android.yml 은 checkout 뒤에 main 으로 git push 를 합니다(APK 커밋). 드물게 돌아 얻는 것이 적고,
// 되살린 .git 의 옛 ref 가 그 push 경로에 끼어들 여지를 만들지 않으려고 뺐습니다.
const EXEMPT = { 'android.yml': 'checkout 뒤에 main 으로 push 하는 드문 작업 — 캐시를 쓰지 않음' };

const uncomment = (ln) => /^\s*#/.test(ln) ? '' : ln.replace(/\s+#.*$/, '');

// with: 아래 값 하나. 블록 스칼라(| >)면 더 깊이 들여쓴 줄들을 이어 붙입니다.
function withValue(lines, key) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(new RegExp('^(\\s+)' + key + ':\\s*(.*)$'));
    if (!m) continue;
    const ind = m[1].length, v = m[2].trim();
    if (!/^[|>][-+]?$/.test(v)) return v;
    const out = [];
    for (let k = i + 1; k < lines.length; k++) {
      if (lines[k].trim() === '') continue;
      if (lines[k].match(/^\s*/)[0].length <= ind) break;
      out.push(lines[k].trim());
    }
    return out.join('\n');
  }
  return null;
}

// path 값에 «.git» 폴더(또는 그 안)가 들어 있는가 — ./.git · ${{ github.workspace }}/.git · 여러 줄 · **/.git 모두.
function mentionsGitDir(v) {
  if (!v) return false;
  return v.split(/\n|,/).map(e => e.trim().replace(/^['"]|['"]$/g, '').replace(/\$\{\{[^}]*\}\}/g, '').replace(/^!/, ''))
    .some(e => /(^|\/)\.git(\/|$)/.test(e));
}

// 한 워크플로를 잡 → 단계 목록으로 자릅니다(들여쓰기 기준 — 이 저장소 워크플로 모양에 맞춘 최소 파서).
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
    if (cur) cur.lines.push(uncomment(lines[i]));
  }
  for (const j of jobs) {
    const si = j.lines.findIndex(l => /^\s+steps:\s*$/.test(l));
    j.head = (si < 0 ? j.lines : j.lines.slice(0, si)).join('\n');
    j.steps = [];
    if (si < 0) continue;
    let ind = null, step = null;
    for (let k = si + 1; k < j.lines.length; k++) {
      const ln = j.lines[k];
      const m = ln.match(/^(\s*)- /);
      if (m && (ind === null || m[1].length === ind)) { ind = m[1].length; step = [ln.replace(/^(\s*)- /, '$1  ')]; j.steps.push(step); continue; }
      if (ind !== null && ln.trim() && ln.match(/^\s*/)[0].length < ind) break;
      if (step) step.push(ln);
    }
    j.steps = j.steps.map(sl => {
      const t = sl.join('\n');
      const v = (k) => withValue(sl, k);
      const uses = v('uses') || '';
      return { t, uses, name: v('name') || uses, id: v('id'), if: v('if'), run: v('run'), wd: v('working-directory'),
        path: v('path'), key: v('key'), restoreKeys: v('restore-keys'), lookupOnly: v('lookup-only'),
        saveAlways: v('save-always'), persist: v('persist-credentials'), clean: v('clean'),
        sparse: /^\s+sparse-checkout(-cone-mode)?:/m.test(t) };
    });
  }
  return jobs;
}

const isCacheAction = (u) => /cache/i.test(u);              // actions/cache·/restore·/save · 남의 캐시 액션까지
const isRestoreOnly = (u) => /^actions\/cache\/restore@/.test(u);

const files = fs.readdirSync(DIR).filter(f => /\.ya?ml$/.test(f)).sort();
ok(files.includes(WRITER.file) && files.includes('ci.yml'), '전제: deploy.yml·ci.yml 을 찾았다');

let consumerJobs = 0;
const savers = [];
let writerSeen = false;
for (const f of files) {
  const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
  ok(!/TEMP-PROBE/.test(raw), f + ': 실측용 임시 저장(TEMP-PROBE) 이 남아 있지 않다');
  for (const j of jobsOf(raw)) {
    const label = f + ' › ' + j.name;
    const gitCache = j.steps.map((s, i) => ({ s, i })).filter(x => isCacheAction(x.s.uses) && mentionsGitDir(x.s.path));
    for (const x of gitCache) {
      const saves = !isRestoreOnly(x.s.uses);
      if (saves) savers.push(f + ':' + j.name + ':' + x.s.uses);
      ok(x.s.saveAlways === null, label + ': .git 캐시 단계에 save-always 가 없다');
    }
    const coIdx = j.steps.findIndex(s => /^actions\/checkout@/.test(s.uses));
    for (const s of j.steps.filter(s => /^actions\/checkout@/.test(s.uses))) {
      ok(s.clean === null || s.clean === 'true', label + ': checkout 이 clean 을 끄지 않는다(값: ' + (s.clean === null ? '기본' : s.clean) + ')');
      if (f === WRITER.file || f === 'ci.yml') ok(!s.sparse, label + ': 전체를 받는다(sparse 금지 — 하니스가 media 실제 크기를 잰다)');
    }
    if (f === WRITER.file && j.name === WRITER.job) {
      writerSeen = true;
      // 저장 잡: gitkey → lookup(lookup-only) → checkout(새로) → save. 그 밖의 코드는 한 줄도 없다.
      const names = j.steps.map(s => s.uses || (s.run ? 'run' : '?'));
      ok(JSON.stringify(names) === JSON.stringify(['run', 'actions/cache/restore@v4', 'actions/checkout@v4', 'actions/cache/save@v4']),
        label + ': 단계가 정확히 «열쇠 → 있나 보기 → 새로 checkout → 저장» 뿐이다(남의 코드가 .git 을 건드릴 틈 없음) — ' + names.join(' → '));
      const [k, look, co, save] = j.steps;
      ok(k && k.id === 'gitkey' && k.run === KEY_RUN, label + ': 열쇠가 정확히 «' + PREFIX + 'YYYY-Www»(주 단위 — 실행마다 1.5GB 를 올리지 않게)');
      ok(!/working-directory:/.test(j.head) || (k && k.wd === '.'), label + ': 열쇠 단계가 없는 폴더에서 돌지 않는다');
      ok(look && look.id === 'lookup' && look.key === KEY_REF && look.lookupOnly === 'true' && look.restoreKeys === null && look.if === null,
        label + ': 그 주 캐시가 «있나» 만 본다(lookup-only · 정확한 열쇠 · restore-keys 없음 — 지난 것을 이어 붙이지 않게)');
      ok(co && co.if === MISS_IF && co.persist === 'false', label + ': 없을 때만 «새로» checkout · persist-credentials: false(토큰이 캐시에 안 실리게)');
      ok(save && save.if === MISS_IF && save.key === KEY_REF && save.path === '.git', label + ': 없을 때만 그 열쇠로 .git 을 저장한다');
      ok(!/^\s+(env|defaults|services|container):/m.test(j.head) && /^\s+contents:\s*read\s*$/m.test(j.head),
        label + ': 비밀·서비스 없이 contents: read 로만 돈다');
      continue;
    }
    if (coIdx < 0) continue;
    if (EXEMPT[f]) { ok(gitCache.length === 0, label + ': (예외) ' + EXEMPT[f]); continue; }
    consumerJobs++;
    ok(gitCache.length === 1, label + ': .git 캐시 단계가 정확히 하나 있다(' + gitCache.length + '개)');
    if (gitCache.length !== 1) continue;
    const c = gitCache[0];
    ok(c.i < coIdx, label + ': 캐시 단계가 checkout «앞» 에 있다 — 뒤면 아무 일도 안 한다');
    ok(isRestoreOnly(c.s.uses), label + ': «읽기만» 한다(actions/cache/restore) — 저장은 ' + WRITER.file + ' › ' + WRITER.job + ' 하나');
    ok(c.s.path === '.git' && c.s.restoreKeys === PREFIX && c.s.lookupOnly === null && c.s.if === null,
      label + ': path .git · restore-keys «' + PREFIX + '» · 조건 없음(모든 워크플로가 같은 캐시를 늘 읽게)');
  }
}
ok(writerSeen, '전제: 저장 잡(' + WRITER.file + ' › ' + WRITER.job + ')을 찾았다');
ok(consumerJobs >= 7, '전제: 캐시를 읽는 checkout 잡을 ' + consumerJobs + '개 찾았다(ci·deploy·브라우저 검사들)');
ok(savers.length === 1 && savers[0] === WRITER.file + ':' + WRITER.job + ':actions/cache/save@v4',
  '.git 을 «저장» 하는 곳은 ' + WRITER.file + ' › ' + WRITER.job + ' 하나뿐이다 (찾은 곳: ' + (savers.join(', ') || '없음') + ')');

console.log('git_cache_checkout_harness: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
