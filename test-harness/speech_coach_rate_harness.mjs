// 🐢🐇 발음 연습(speech-coach.html) 듣기 속도 — 2026-10-12 사장님 «발음연습도 말소리 속도 조절»
// 함수를 소스에서 오려 내 «실제로 돌려» 답을 본다(글자 검사만으로는 배선이 안 지켜진다).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SC = fs.readFileSync(process.env.SC_SRC || path.join(ROOT, 'cloudflare-deploy/public/speech-coach.html'), 'utf8');
const WU = fs.readFileSync(path.join(ROOT, 'cloudflare-deploy/public/warmup.html'), 'utf8');
const SRV = fs.readFileSync(path.join(ROOT, 'cloudflare-deploy/src/speech-preferences.ts'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌ FAIL', n, d === undefined ? '' : JSON.stringify(d)); } };
function bodyAt(src, head) { const i = src.indexOf(head); if (i < 0) return ''; let j = src.indexOf('{', i + head.length - 1), d = 0; for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } return ''; }
const stripC = t => t.replace(/<!--[\s\S]*?-->/g, '').split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');
const pick = re => { const m = SC.match(re); return m ? m[1] : null; };
const steps = pick(/var SC_RATE_STEPS = (\{[^}]*\});/), norm = pick(/var SC_RATE_NORMAL = ([\d.]+);/), minM = pick(/var SC_MALE_MIN_RATE = ([\d.]+);/);
const wuSteps = (WU.match(/var RATE_STEPS = (\{[^}]*\});/) || [])[1];
ok('① 다섯 칸 표가 있다', !!steps, steps);
ok('② 웜업 RATE_STEPS 와 같은 다섯 값', steps && wuSteps && JSON.stringify(eval('(' + steps + ')')) === JSON.stringify(eval('(' + wuSteps + ')')), [steps, wuSteps]);
ok('③ 3칸 = 보통(SC_RATE_NORMAL)', steps && Number(eval('(' + steps + ')')[3]) === Number(norm));
const fnSrc = bodyAt(SC, 'function scRateFor(lang) {');
function rate(lv, g, lang) { try { return new Function('lv', 'g', 'l', `var SC_RATE_STEPS=${steps}, SC_RATE_NORMAL=${norm}, SC_MALE_MIN_RATE=${minM}, scRateLevel=lv; function scGender(){return g;} ${fnSrc} return scRateFor(l);`)(lv, g, lang); } catch (e) { return 'ERR:' + e.message; } }
ok('④ 아주 느리게(1) 여자 영어 → 0.5', rate(1, 'female', 'en') === 0.5, rate(1, 'female', 'en'));
ok('⑤ 아주 빠르게(5) → 1.25', rate(5, 'female', 'en') === 1.25, rate(5, 'female', 'en'));
ok('⑥ (짝) 남자 영어 느리게는 0.9 밑으로 안 감', rate(1, 'male', 'en') === 0.9, rate(1, 'male', 'en'));
ok('⑦ (짝) 남자 영어 빠르게(5)는 그대로 1.25', rate(5, 'male', 'en') === 1.25, rate(5, 'male', 'en'));
ok('⑧ (짝) 중국어는 남자여도 고른 값 그대로', rate(1, 'male', 'zh') === 0.5, rate(1, 'male', 'zh'));
ok('⑨ 단계를 모르면 보통', rate(9, 'female', 'en') === Number(norm), rate(9, 'female', 'en'));
const S = stripC(SC);
ok('⑩ 슬라이더가 화면에 있고 scSetRate 를 부른다', /id="sc-rate-slider"[^>]*oninput="scSetRate\(this\.value\)"/.test(S));
ok('⑪ 서버 재생 두 자리가 scApplyNormalRate 를 지난다', (S.match(/scApplyNormalRate\(ttsAudio,\s*lang\)/g) || []).length === 2);
ok('⑫ 브라우저 음성도 고른 속도', /u\.rate = scLevelRate\(\)/.test(S));
ok('⑬ 립싱크 클립은 «보통» 일 때만(다른 속도는 TTS 로)', /scRateLevel === 3 && scFriend === 'emma'/.test(S));
ok('⑭ 계정별 저장 — coach 통로', /MangoiSpeechPreferences\.create\('coach'/.test(S) && /speech-preferences\.js\?v=\d+/.test(S));
ok('⑮ 서버가 coach 를 받는다', /app !== 'coach'/.test(SRV));
const wm = SC.indexOf('function renderWordMap'), sw = SC.indexOf('async function speakWord');
ok('⑯ 실행되는 시작 코드가 renderWordMap~speakWord 구간 밖', !/MangoiSpeechPreferences\.create|addEventListener\('mangoi:lang-changed'/.test(SC.slice(wm, sw)));
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
