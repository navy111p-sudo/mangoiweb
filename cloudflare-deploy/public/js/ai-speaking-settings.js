/* ⚙️ A.i 말하기 › 공통 설정 (2026-11-03)
   ─────────────────────────────────────────────────────────────
   수준·교정은 지금 «화면마다 따로» 저장돼 있습니다. 눈금은 같습니다.
     수준  웜업 mangoi_warmup_level = '1'~'8'   ·  AI 친구 mangoi_aifriend_level = 'S1'~'S8'
     교정  웜업 mangoi_warmup_correction        ·  AI 친구 mangoi_aifriend_correction
           (둘 다 free_talk · balanced · focused)
     언어  화면 글자 한국어/English — mangoi_lang (mango-i18n.js setLang(l,'user') 과 같은 세 키)
           📜 대화 언어 영어/중국어 안은 사장님 2026-11-03 「중국어 빼기」로 취소. 대화는 영어입니다.
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
    lang: 'mangoi_lang', timing: 'mangoi_ai_correction_timing'
  };
  var CORR = ['free_talk', 'balanced', 'focused'];
  var TIMING = ['immediate', 'key-mistakes', 'after-lesson'];
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
    var l = get(ls, K.lang);
    var timing = get(ls, K.timing);
    return { level: level, corr: corr, timing: TIMING.indexOf(timing) >= 0 ? timing : '', lang: l.indexOf('en') === 0 ? 'en' : 'ko' };
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
  /* 교정 정도(free_talk/balanced/focused)와 교정 시점은 서로 다른 설정이다. */
  function chooseTiming(ls, timing) {
    if (timing !== '' && TIMING.indexOf(timing) < 0) return false;
    return set(ls, K.timing, timing);
  }
  function effectiveTiming(ls, level) {
    var saved = read(ls).timing;
    if (saved) return saved;
    var n = Number(level);
    return n >= 1 && n <= 2 ? 'immediate' : n >= 5 && n <= 8 ? 'after-lesson' : 'key-mistakes';
  }
  function chooseLang(ls, l) {
    if (l !== 'ko' && l !== 'en') return false;
    var ok = set(ls, K.lang, l);
    set(ls, 'mangoi_lang_by', 'user');   // «사람이 직접 고름» — 계정 자동판정보다 우선(mango-i18n.js 와 같음)
    try {
      var s = JSON.parse(get(ls, 'mangoi_admin_session') || '{}') || {};
      set(ls, 'mangoi_lang_uid', String(s.uid || ''));
    } catch (e) {}
    return ok;
  }
  root.AiSpeakSettings = { KEYS: K, LEVELS: LEVELS, CORR: CORR, TIMING: TIMING, read: read,
    chooseTiming: chooseTiming, effectiveTiming: effectiveTiming,
    chooseLevel: chooseLevel, chooseCorr: chooseCorr, chooseLang: chooseLang };
})(typeof window !== 'undefined' ? window : globalThis);
