// 단어장 파일 일괄 추가 하니스 — vocab.html의 vocabParsePairs 파서를 그대로 실행해 검증
// 실행: node test-harness/vocab_bulk_add_harness.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'cloudflare-deploy', 'public', 'vocab.html'), 'utf8');

// vocabParsePairs 함수 본문 추출
const m = html.match(/function vocabParsePairs\(text\)\{[\s\S]*?\n\}/);
if (!m) { console.error('FAIL: vocabParsePairs not found in vocab.html'); process.exit(1); }
const vocabParsePairs = new Function('text', m[0].replace(/^function vocabParsePairs\(text\)\{/, '').replace(/\}$/, ''));

let pass = 0, fail = 0;
function check(name, cond, extra){
  if (cond){ pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  →  ' + JSON.stringify(extra) : '')); }
}

// 1) CSV (양식 그대로)
let r = vocabParsePairs('영어단어,한국어 뜻\ngorgeous,아주 멋진\nbrave,용감한\ncurious,\nadventure,');
check('CSV: 4단어 추출', r.length === 4, r);
check('CSV: 뜻 매칭', r[0].word === 'gorgeous' && r[0].korean === '아주 멋진', r[0]);
check('CSV: 빈 뜻 유지', r[2].word === 'curious' && r[2].korean === '', r[2]);
check('CSV: 헤더 행 제외', !r.some(x => /단어/.test(x.korean) && /영어/.test(x.word)), r);

// 2) 탭 구분 (TSV / 엑셀 복붙)
r = vocabParsePairs('apple\t사과\nbanana\t바나나');
check('TSV: 2단어', r.length === 2 && r[1].korean === '바나나', r);

// 3) 마크다운 표 (toMarkdown 이 엑셀/워드를 표로 변환)
r = vocabParsePairs('| word | meaning |\n| --- | --- |\n| happy | 행복한 |\n| sunny | 화창한 |');
check('MD표: 2단어 + 구분선 제외', r.length === 2 && r[0].word === 'happy' && r[0].korean === '행복한', r);

// 4) "word - 뜻" / "word(뜻)" / 번호 목록
r = vocabParsePairs('1. gorgeous - 아주 멋진\n2) brave(용감한)\n3. curious 궁금한');
check('목록: 3단어', r.length === 3, r);
check('목록: 괄호 뜻', r.some(x => x.word === 'brave' && x.korean === '용감한'), r);
check('목록: 공백 구분 뜻', r.some(x => x.word === 'curious' && x.korean === '궁금한'), r);

// 5) 영어 단어만 나열
r = vocabParsePairs('gorgeous\nbrave\ncurious');
check('단어만: 3개, 뜻 빈칸', r.length === 3 && r.every(x => x.korean === ''), r);

// 6) 중복 제거 (대소문자 무시)
r = vocabParsePairs('apple,사과\nApple,사과2\nAPPLE');
check('중복: 1개만', r.length === 1, r);

// 7) 문장/잡음 제외
r = vocabParsePairs('This is a very long sentence that should not become a vocabulary word at all here.\npage 3\nUnit 5\nhello, 안녕');
check('잡음: hello 만 추출', r.length >= 1 && r.some(x => x.word === 'hello' && x.korean === '안녕'), r);
check('잡음: 긴 문장 제외', !r.some(x => x.word.split(' ').length > 4), r);

// 8) 상한 200
r = vocabParsePairs(Array.from({length: 300}, (_, i) => 'word' + i + ',뜻' + i).join('\n'));
check('상한: 200개 캡', r.length === 200, r.length);

// 9) 아포스트로피/하이픈 단어
r = vocabParsePairs("mother-in-law,시어머니\ndon't,하지마");
check('특수: 하이픈/아포스트로피', r.length === 2, r);

// ── 백엔드 코드 존재/게이트 등록 확인 ──
const api = readFileSync(join(__dirname, '..', 'cloudflare-deploy', 'src', 'api-mango.ts'), 'utf8');
const idx = readFileSync(join(__dirname, '..', 'cloudflare-deploy', 'src', 'index.ts'), 'utf8');
check('api: /api/vocab/extract 핸들러', api.includes("path === '/api/vocab/extract'"));
check('api: /api/vocab/bulk-add 핸들러', api.includes("path === '/api/vocab/bulk-add'"));
check('api: toMarkdown 사용', api.includes('AI.toMarkdown'));
check('api: bulk 중복 스킵', api.includes('skipped_dup'));
check('index.ts 게이트: extract', idx.includes("path === '/api/vocab/extract'"));
check('index.ts 게이트: bulk-add', idx.includes("path === '/api/vocab/bulk-add'"));

// ── 프론트 필수 요소 확인 ──
check('html: drop-zone', html.includes('id="drop-zone"'));
check('html: 파일 input accept', /id="bulk-file"[^>]*accept="[^"]*\.xlsx/.test(html));
check('html: 양식 다운로드', html.includes('downloadVocabTemplate'));
check('html: 진행바', html.includes('bp-bar'));
check('html: hwp 안내', html.includes('HWP'));
check('html: 드롭 기본동작 차단', html.includes("document.addEventListener('drop'"));

console.log('\n' + (fail === 0 ? '✅ ALL PASS' : '❌ FAILURES') + `  (pass ${pass} / fail ${fail})`);
process.exit(fail === 0 ? 0 : 1);
