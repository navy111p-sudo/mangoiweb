// 2026-10-18 — 월간 성적표 «따라 읽기 말속도(분당 낱말)» (개선안 1순위 ③)
//   정본 src/speaking-pace.ts 를 타입만 벗겨 «진짜 SQLite» 로 돌리고, 성적표 화면의 paceLine 을 오려 내 실제로 그립니다.
//   짝: «말한다» 옆에 «표본이 모자라면 말하지 않는다» · «튀는 값은 버린다» · «남의 학생 값은 안 센다».
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = fs.readFileSync(process.env.SP_SRC || path.join(ROOT, 'cloudflare-deploy/src/speaking-pace.ts'), 'utf8');
const REP = fs.readFileSync(process.env.REP_SRC || path.join(ROOT, 'cloudflare-deploy/src/api-reports.ts'), 'utf8');
const HTML = fs.readFileSync(process.env.HTML_SRC || path.join(ROOT, 'cloudflare-deploy/public/monthly-report.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n + (x !== undefined ? ' ' + JSON.stringify(x) : '')); } };

let M = null;
try {
  M = new Function(stripTypeScriptTypes(SRC).replace(/^export\s+/gm, '') + '\nreturn { PACE_MIN_SAMPLES, PACE_RATE_MAX, speakingPaceFromRates, loadSpeakingPace };')();
} catch (e) { check('정본 로드', false, e.message); }
check('정본을 읽었다(전제)', !!M);

if (M) {
  const f = M.speakingPaceFromRates;
  check('가운뎃값 × 60 (홀수)', JSON.stringify(f([2, 2.5, 3, 3.5, 4])) === JSON.stringify({ wpm: 180, samples: 5 }), f([2, 2.5, 3, 3.5, 4]));
  check('가운뎃값 × 60 (짝수)', f([2, 2, 3, 3, 3, 3]).wpm === 180, f([2, 2, 3, 3, 3, 3]));
  check('표본이 모자라면 null', f([2, 3, 3, 4]) === null);
  check('짝: 딱 최소 표본이면 말한다', f([3, 3, 3, 3, 3]) && f([3, 3, 3, 3, 3]).wpm === 180);
  check('튀는 값(>최대)·0·음수·NaN 은 버린다', f([3, 3, 3, 3, 9, 0, -1, 'x', null]) === null);
  check('튀는 값 하나가 결과를 흔들지 않는다', f([3, 3, 3, 3, 3, 5.9]).wpm === 180);
  check('빈 입력·null 은 null', f([]) === null && f(null) === null);

  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE voice_coaching (id INTEGER PRIMARY KEY, student_uid TEXT, speech_rate REAL, created_at INTEGER)`);
  const ins = db.prepare(`INSERT INTO voice_coaching (student_uid, speech_rate, created_at) VALUES (?,?,?)`);
  for (const r of [2, 2.5, 3, 3.5, 4]) ins.run('kid1', r, 1000);
  for (const r of [9, 9, 9, 9, 9]) ins.run('kid2', r, 1000);   // 남의 학생
  ins.run('kid1', 5, 99999);                                  // 기간 밖
  const D = { prepare: (sql) => { const st = db.prepare(sql); let a = []; const api = { bind: (...x) => { a = x; return api; }, all: async () => ({ results: st.all(...a) }) }; return api; } };
  const got = await M.loadSpeakingPace(D, 'kid1', 0, 2000);
  check('진짜 SQLite: 그 학생·그 기간만 센다', got && got.wpm === 180 && got.samples === 5, got);
  check('짝: 기록 없는 학생은 null', (await M.loadSpeakingPace(D, 'kid3', 0, 2000)) === null);
  let threw = false, r0 = 'x';
  try { r0 = await M.loadSpeakingPace({ prepare: () => { throw new Error('no table'); } }, 'kid1', 0, 1); } catch { threw = true; }
  check('조회가 실패해도 던지지 않고 null', !threw && r0 === null);
}

// ── api-reports.ts 배선 ──
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const R = strip(REP);
check('이번 기간을 잰다', /const (\w+) = await loadSpeakingPace\(env\.DB, uid, start, end\)/.test(R));
check('바로 앞의 같은 길이 기간을 잰다', /loadSpeakingPace\(env\.DB, uid, start - \(end - start\), start\)/.test(R));
const nowVar = (R.match(/const (\w+) = await loadSpeakingPace\(env\.DB, uid, start, end\)/) || [])[1];
const prevVar = (R.match(/const (\w+) = await loadSpeakingPace\(env\.DB, uid, start - /) || [])[1];
check('응답 voice 에 pace_wpm 을 이번 기간 값으로 싣는다', !!nowVar && new RegExp('pace_wpm: ' + nowVar + ' \\? ' + nowVar + '\\.wpm : null').test(R));
check('응답 voice 에 prev_pace_wpm 을 앞 기간 값으로 싣는다', !!prevVar && new RegExp('prev_pace_wpm: ' + prevVar + ' \\? ' + prevVar + '\\.wpm : null').test(R));

// ── 화면 paceLine 을 오려 내 실제로 그린다 ──
const fStart = HTML.indexOf('function paceLine(vo)');
let fEnd = -1;
if (fStart > 0) { let d = 0; for (let i = HTML.indexOf('{', fStart); i < HTML.length; i++) { if (HTML[i] === '{') d++; else if (HTML[i] === '}') { d--; if (d === 0) { fEnd = i + 1; break; } } } }
check('paceLine 을 오려 냈다(전제)', fStart > 0 && fEnd > fStart);
let paceLine = null, langBox = { v: 'ko' };
try {
  paceLine = new Function('langBox', `function t(ko,en){ return langBox.v==='ko'?ko:(en||ko); }\n${HTML.slice(fStart, fEnd).replace(/\blang\b/g, 'langBox.v')}\nreturn paceLine;`)(langBox);
} catch (e) { check('paceLine 컴파일', false, e.message); }
const safe = (vo) => { try { return paceLine(vo); } catch (e) { return 'THREW:' + e.message; } };
if (paceLine) {
  const ko = safe({ pace_wpm: 180, pace_samples: 7, prev_pace_wpm: 150 });
  check('한국어: 분당 낱말 + 따라 읽기라고 말한다', /분당 <b>180<\/b>낱말/.test(ko) && /따라 읽기/.test(ko), ko);
  check('지난 기간과 비교를 말한다(+30)', /150 → 180, \+30/.test(ko), ko);
  check('대화 속도보다 빠르다는 단서를 함께 말한다', /대화 속도보다/.test(ko));
  check('값이 없으면 아무것도 안 그린다', safe({ pace_wpm: null }) === '' && safe({}) === '' && safe(null) === '');
  check('짝: 지난 기간이 없으면 비교 없이 그린다', !/→/.test(safe({ pace_wpm: 120, pace_samples: 5, prev_pace_wpm: null })) && /120/.test(safe({ pace_wpm: 120, pace_samples: 5 })));
  const down = safe({ pace_wpm: 120, pace_samples: 5, prev_pace_wpm: 150 });
  check('느려지면 −30 으로 말한다', /150 → 120, -30/.test(down), down);
  langBox.v = 'en';
  const en = safe({ pace_wpm: 180, pace_samples: 7, prev_pace_wpm: 150 });
  check('영어: words/min · read-aloud 로 말하고 한글이 없다', /<b>180<\/b> words\/min/.test(en) && /Read-aloud/.test(en) && !/[가-힣]/.test(en), en);
}
check('발음 카드가 paceLine(vo) 를 실제로 부른다', /pronRow\(t\('유창성','Fluency'\),vo\.avg_fluency\)\+paceLine\(vo\)/.test(HTML));
check('«WPM» 이라 부르지 않는다(화면 문구)', !/'[^']*WPM[^']*'/.test(HTML.slice(fStart, fEnd)));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
