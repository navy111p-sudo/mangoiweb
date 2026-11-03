/* ⚙️ A.i 말하기 › 공통 설정 (2026-11-03)
   ─────────────────────────────────────────────────────────────
   수준·교정은 지금 «화면마다 따로» 저장돼 있습니다. 눈금은 같습니다.
     수준  웜업 mangoi_warmup_level = '1'~'8'   ·  AI 친구 mangoi_aifriend_level = 'S1'~'S8'
     교정  웜업 mangoi_warmup_correction        ·  AI 친구 mangoi_aifriend_correction
           (둘 다 free_talk · balanced · focused)
     언어  대화 언어 영어/중국어(2026-11-03 사장님) — 웜업 mangoi_warmup_lang = 'en'|'zh'
           ⚠️ AI 친구는 아직 영어만 됩니다(중국어 엔진 없음) — 화면이 그 사실을 말합니다.
           ⛔ 화면 글자 언어(mangoi_lang)는 여기서 바꾸지 않습니다.
   그래서 여기서 «사람이 고를 때만» 두 화면 키를 «함께» 씁니다.
   ⛔ 화면을 열거나 그리기만 할 때는 한 글자도 쓰지 않습니다 — 기본값을 미리 써 두면
      «학생이 고른 것» 으로 굳어 나중에 기본값을 못 바꿉니다(CLAUDE.md 2장).
   ⛔ 저장이 막힌 기기(시크릿 창·용량 초과)에서도 던지지 않습니다 — 그때는 사실대로 말합니다.
   이 파일은 상황별 말하기(웜업 엔진)도 웜업 키를 그대로 쓰므로 따로 키가 없습니다. */
(function (root) {
  'use strict';
  var K = {
    wl: 'mangoi_warmup_level', al: 'mangoi_aifriend_level',
    wc: 'mangoi_warmup_correction', ac: 'mangoi_aifriend_correction',
    lang: 'mangoi_warmup_lang'
  };
  var CORR = ['free_talk', 'balanced', 'focused'];
  /* AI 친구의 옛 저장값(ai-friend.html AIF_LEGACY 와 같은 표) */
  var AIF_LEGACY = { A1: 'S1', A2: 'S2', B1: 'S4', B2: 'S6', C1: 'S8' };
  var LEVELS = [
    { n: 1, ko: '첫걸음', en: 'First steps' }, { n: 2, ko: '기초', en: 'Basic' },
    { n: 3, ko: '초급', en: 'Beginner' }, { n: 4, ko: '초중급', en: 'Pre-intermediate' },
    { n: 5, ko: '중급', en: 'Intermediate' }, { n: 6, ko: '중고급', en: 'Upper-intermediate' },
    { n: 7, ko: '고급', en: 'Advanced' }, { n: 8, ko: '최상급', en: 'Expert' }
  ];
  function get(ls, k) { try { var v = ls.getItem(k); return v == null ? '' : String(v); } catch (e) { return ''; } }
  function set(ls, k, v) {
    try { ls.setItem(k, v); return ls.getItem(k) === v; }   // 쓴 뒤 다시 읽어 확인(조용히 무시하는 기기)
    catch (e) { return false; }
  }
  function wLevel(v) { var n = /^[1-8]$/.test(v) ? Number(v) : 0; return n; }
  function aLevel(v) {
    if (Object.prototype.hasOwnProperty.call(AIF_LEGACY, v)) v = AIF_LEGACY[v];
    var m = /^S([1-8])$/.exec(v); return m ? Number(m[1]) : 0;
  }
  /* 지금 저장된 값 읽기 — 0/'' = 아직 안 정함, 'mixed' = 두 화면이 다름 */
  function read(ls) {
    var w = wLevel(get(ls, K.wl)), a = aLevel(get(ls, K.al));
    var level = (!w && !a) ? 0 : (w && a && w !== a) ? 'mixed' : (w || a);
    var wc = CORR.indexOf(get(ls, K.wc)) >= 0 ? get(ls, K.wc) : '';
    var ac = CORR.indexOf(get(ls, K.ac)) >= 0 ? get(ls, K.ac) : '';
    var corr = (!wc && !ac) ? '' : (wc && ac && wc !== ac) ? 'mixed' : (wc || ac);
    var l = get(ls, K.lang).toLowerCase();
    return { level: level, corr: corr, lang: (l === 'zh' || l === 'en') ? l : '' };   // '' = 아직 안 정함(영어로 시작)
  }
  function chooseLevel(ls, n) {
    n = Number(n); if (!(n >= 1 && n <= 8 && Math.floor(n) === n)) return false;
    var a = set(ls, K.wl, String(n)), b = set(ls, K.al, 'S' + n);
    return a && b;
  }
  function chooseCorr(ls, id) {
    if (CORR.indexOf(id) < 0) return false;
    var a = set(ls, K.wc, id), b = set(ls, K.ac, id);
    return a && b;
  }
  function chooseLang(ls, l) {
    if (l !== 'en' && l !== 'zh') return false;
    return set(ls, K.lang, l);
  }
  root.AiSpeakSettings = { KEYS: K, LEVELS: LEVELS, CORR: CORR, read: read,
    chooseLevel: chooseLevel, chooseCorr: chooseCorr, chooseLang: chooseLang };
})(typeof window !== 'undefined' ? window : globalThis);
