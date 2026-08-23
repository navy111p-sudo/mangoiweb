/**
 * vc-split-boot-browser.mjs — 「idx-main.js 를 홈/수업으로 가른 것」이 안 깨졌는지 실제 브라우저로 확인
 *   (2026-08-23) ⚠️ manual/ 이라 게이트가 «자동으로 안 물어 갑니다». 사람이 불러야 합니다:
 *       node test-harness/manual/vc-split-boot-browser.mjs
 *
 * 왜 필요한가
 *   수업 부분(js/idx-main-vc.js)은 defer 로 받습니다 = HTML 파싱이 끝난 뒤에 실행됩니다.
 *   그래서 «파싱 중에» vc* 이름을 가리키는 코드가 새로 생기면 그 순간엔 아직 없어서
 *   ReferenceError 가 납니다. 실제로 밟았습니다 — window.vcManualReconnect = vcManualReconnect;
 *   ⚠️ 문자열 하니스로는 못 잡습니다. 이름도 함수도 «있습니다». 없는 건 «그 시점» 뿐입니다.
 *
 * 무엇을 재나 — 가른 지금(HEAD)과 «합쳐진 원본»(git HEAD~ 의 idx-main.js)을 «같은 실행 안에서» 비교합니다.
 *   ① 부팅 중 에러 0건인가
 *   ② window 전역 목록이 같은가 (하나라도 사라지면 어딘가가 죽은 것)
 *   ③ vc* 함수 개수가 같은가
 *   ④ 홈이 실제로 그려졌는가
 *
 * ⚠️ 여기서 확인 «못 하는» 것 — 진짜 수업입니다. 시그널링(Durable Object)·카메라·상대방이
 *    필요하고 이 컨테이너에는 없습니다. 배포 전에 사람이 실제 수업 1회를 반드시 확인해야 합니다.
 */
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = process.env.PORT || 8898;
const tmp = [];
const put = (name, body) => { const p = join(PUB, name); writeFileSync(p, body); tmp.push(p); return name; };

if (!existsSync(CHROME)) { console.log(`🚨 크로미움을 못 찾음: ${CHROME}\n   CHROME=... 로 지정하세요`); process.exit(1); }

/* ── 합쳐진 원본을 git 에서 꺼낸다 (비교 기준) ────────────────────────── */
const prev = spawnSync('git', ['show', 'HEAD~1:cloudflare-deploy/public/js/idx-main.js'], { cwd: ROOT, maxBuffer: 1 << 28 });
if (prev.status !== 0) { console.log('🚨 HEAD~1 의 idx-main.js 를 못 꺼냈습니다 — 이 검사는 «가르기» 커밋 직후에 씁니다.'); process.exit(1); }
put('_vcsplit-base-main.js', prev.stdout.toString('utf8'));

const idx = spawnSync('cat', [join(PUB, 'index.html')], { maxBuffer: 1 << 28 }).stdout.toString('utf8');
const CAP = '<script>window.__errs=[];window.addEventListener("error",function(e){window.__errs.push(String(e.message)+" @"+String(e.filename||"").replace(/^.*\\//,"")+":"+e.lineno);});</script>';
const withCap = idx.replace('<head>', '<head>' + CAP);
const TWO = /<script src="\/js\/idx-main\.js\?v=\d+"><\/script>\s*\n\s*<script defer src="\/js\/idx-main-vc\.js\?v=\d+"><\/script>/;
if (!TWO.test(withCap)) { console.log('🚨 index.html 에서 «가른 두 줄» 을 못 찾았습니다 — 태그가 바뀌었나요?'); process.exit(1); }
put('_vcsplit-split.html', withCap);
/* ⚠️ 임시 파일은 public «루트» 에 쓰므로 주소도 /js/ 없이 루트다.
      (2026-08-23 실제로 /js/ 를 붙였다가 404 → 기준 쪽이 통째로 안 실행돼 «vc 함수 22개» 로 나왔다) */
put('_vcsplit-base.html', withCap.replace(TWO, '<script src="/_vcsplit-base-main.js"></script>'));
put('_vcsplit-run.html', `<!doctype html><meta charset="utf-8"><body><div id="out">RUNNING</div><script>
var res={};function load(k,u,n){var f=document.createElement('iframe');f.style.cssText='width:900px;height:600px';f.src=u;
document.body.appendChild(f);f.onload=function(){setTimeout(function(){var w=f.contentWindow,d=f.contentDocument;
var g={};for(var x in w){try{g[x]=typeof w[x];}catch(e){g[x]='?';}}
var home=d.getElementById('view-home');
res[k]={g:g,errs:(w.__errs||[]).slice(0,5),home:!!(home&&home.classList.contains('active')),title:!!d.querySelector('.home-title')};
f.remove();n();},5000);};}
load('base','/_vcsplit-base.html?lite=0&hh=21',function(){load('split','/_vcsplit-split.html?lite=0&hh=21',function(){
var A=res.base.g,B=res.split.g,ka=Object.keys(A),kb=Object.keys(B);
var miss=ka.filter(function(x){return !(x in B);}),ext=kb.filter(function(x){return !(x in A);});
var vcA=ka.filter(function(x){return /^vc/i.test(x)&&A[x]==='function';});
var vcB=kb.filter(function(x){return /^vc/i.test(x)&&B[x]==='function';});
document.getElementById('out').textContent=JSON.stringify({baseGlobals:ka.length,splitGlobals:kb.length,
missing:miss,extra:ext,vcBase:vcA.length,vcSplit:vcB.length,
baseErrs:res.base.errs,splitErrs:res.split.errs,splitHome:res.split.home,splitTitle:res.split.title});});});
</script></body>`);

const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUB, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2000));
const dom = spawnSync(CHROME, ['--headless', '--disable-gpu', '--no-sandbox',
  '--virtual-time-budget=40000', '--dump-dom', `http://127.0.0.1:${PORT}/_vcsplit-run.html`],
  { maxBuffer: 1 << 28 }).stdout.toString('utf8');
srv.kill();
for (const p of tmp) { try { unlinkSync(p); } catch {} }

const m = dom.match(/<div id="out">([\s\S]*?)<\/div>/);
let r; try { r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')); }
catch { console.log('🚨 결과를 못 읽었습니다 (브라우저가 끝까지 못 돈 듯).'); process.exit(1); }

let fail = 0;
const ok = s => console.log(`  ✅ ${s}`);
const no = s => { fail++; console.log(`  ❌ ${s}`); };
console.log('vc-split-boot-browser — 홈/수업 가르기가 부팅을 깨지 않았는가');
r.splitErrs.length === 0 ? ok('① 가른 쪽 부팅 에러 0건') : no(`① 가른 쪽 부팅 에러 ${r.splitErrs.length}건: ${r.splitErrs.join(' | ')}`);
r.missing.length === 0 ? ok(`② 전역이 하나도 안 사라졌다 (${r.baseGlobals}개)`) : no(`② 전역 ${r.missing.length}개가 사라졌다: ${r.missing.slice(0, 15).join(',')}`);
r.vcBase === r.vcSplit ? ok(`③ vc* 함수 개수 같음 (${r.vcBase}개)`) : no(`③ vc* 함수 ${r.vcBase} → ${r.vcSplit} 로 달라졌다`);
(r.splitHome && r.splitTitle) ? ok('④ 홈이 실제로 그려졌다') : no(`④ 홈이 안 그려졌다 (active=${r.splitHome}, 제목=${r.splitTitle})`);
console.log(`\n${fail === 0 ? '✅' : '🚨'} vc-split-boot-browser — FAIL ${fail}`);
console.log('⚠️ 이 검사는 «홈 부팅» 까지만 봅니다. 진짜 수업(시그널링·카메라·상대방)은 사람이 확인해야 합니다.');
process.exit(fail === 0 ? 0 : 1);
