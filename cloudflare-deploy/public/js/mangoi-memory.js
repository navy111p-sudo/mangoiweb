/*!
 * 🧠 mangoi-memory.js — 「게임 공통 기억 큐」 (Cross-Game Memory Queue)
 *
 * 왜 만들었나 (2026-08-03)
 * ─────────────────────────────────────────────────────────────
 * 게임이 21종인데 **학습 기록이 게임마다 고아(orphan)** 였다.
 * 어제 우주 괴물 사냥에서 세 번 틀린 단어가, 오늘 탱크대전에 나올 이유가 전혀 없었다.
 * 그래서 "게임 많이 했는데 늘었는지 모르겠다"가 생긴다. 원인은 재미가 아니라 **배선**이다.
 *
 * 서버에 이미 SRS 가 있긴 하다 (api-games.ts):
 *     const intervals = [1, 2, 4, 7, 14, 30, 60, 120];
 * 그런데 이건 `vocabulary` 테이블(=단어장) 전용이고, ① 게임들은 여기에 아무것도 안 쌓으며
 * ② **모든 학생·모든 단어에 같은 간격**을 쓴다. 쉬운 단어와 어려운 단어가 같은 대접을 받는다.
 *
 * 근거 — Bjork 「바람직한 어려움」: 인출연습 > 재학습, 분산 > 집중 (어휘 난이도와 무관하게 일관)
 * 근거 — Duolingo HLR(Settles & Meeder, 2016): 고정 간격 대신 **항목별 기억 반감기**를 추정
 *        우리는 회귀모델을 배포할 수 없으므로, 같은 아이디어를 **산술 몇 줄**로 근사한다.
 *
 * 설계 원칙
 *   · **비용 0원 · 서버 신규 API 0개.** 전부 localStorage. (새 API 는 index.ts 금지구역을 건드려야 함)
 *   · 기기가 바뀌면 기록이 안 따라온다 — 이건 **알려진 한계**다. 서버 동기화는 다음 단계.
 *   · 저장 실패(사파리 프라이빗 등)해도 **게임은 절대 안 멈춘다.** 전부 try/catch.
 *   · 어린이·어르신용 문구는 숫자 자랑이 아니라 **"내가 늘고 있다"는 증거**로 쓴다 (SDT 유능감).
 *
 * 사용법:
 *   MangoiMemory.log({en:'apple', ko:'사과'}, true);          // 맞음
 *   MangoiMemory.log({en:'apple'}, false, {tags:['R_L']});    // 틀림 + 발음 오류 태그
 *   MangoiMemory.note({en:'apple'});     // → "4번 연속 맞혔어요" (없으면 '')
 *   MangoiMemory.pickDue(pool, 0.6);     // 복습할 때가 된 항목을 우선해서 하나 뽑기
 *   MangoiMemory.weakTags(3);            // → [{tag:'R_L', label:'R / L 발음', rate:0.42}, ...]
 */
(function () {
  'use strict';
  if (window.MangoiMemory) return;

  var KEY = 'mangoi_mem_v1';
  var MAX_ITEMS = 800;          // localStorage 를 무한정 먹지 않게
  var HOUR = 3600 * 1000;

  /* 한국인 학습자 취약 발음 — 화면에 보여줄 이름 (한/영 둘 다: 강사 다수가 필리핀) */
  var TAG_LABEL = {
    R_L:   { ko: 'R / L 발음',        en: 'R vs L' },
    F_P:   { ko: 'F / P 발음',        en: 'F vs P' },
    F_V:   { ko: 'F / V 발음',        en: 'F vs V' },
    B_V:   { ko: 'B / V 발음',        en: 'B vs V' },
    TH:    { ko: 'TH 발음',           en: 'TH sound' },
    Z_J:   { ko: 'Z / J 발음',        en: 'Z vs J' },
    FINAL: { ko: '단어 끝소리',       en: 'Final consonant' },
    VOWEL: { ko: '모음 소리',         en: 'Vowel sound' },
    EXTRA: { ko: '없는 소리 덧붙임',  en: 'Added syllable' }
  };

  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!o || typeof o !== 'object') o = {};
      if (!o.items || typeof o.items !== 'object') o.items = {};
      if (!o.tags || typeof o.tags !== 'object') o.tags = {};
      return o;
    } catch (_) { return { items: {}, tags: {} }; }
  }
  function save(db) {
    try {
      // 넘치면 오래 안 본 것부터 버린다
      var ks = Object.keys(db.items);
      if (ks.length > MAX_ITEMS) {
        ks.sort(function (a, b) { return (db.items[a].t || 0) - (db.items[b].t || 0); });
        ks.slice(0, ks.length - MAX_ITEMS).forEach(function (k) { delete db.items[k]; });
      }
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (_) {}
  }
  function idOf(item) {
    if (!item) return '';
    var s = (typeof item === 'string') ? item : (item.en || item.word || item.text || '');
    s = String(s).toLowerCase().replace(/[^a-z0-9' ]/g, '').replace(/\s+/g, ' ').trim();
    return s;
  }

  /**
   * 결과 한 건 기록.
   * @param item  {en, ko} 또는 문자열
   * @param ok    맞았는가
   * @param ex    { tags:[...], score:0~100, ms:반응시간 }
   */
  function log(item, ok, ex) {
    try {
      var id = idOf(item); if (!id) return;
      ex = ex || {};
      var db = load(), now = Date.now();
      var r = db.items[id] || { n: 0, ok: 0, streak: 0, hl: 8, t: 0, ko: '' };

      r.n++;
      r.t = now;
      if (item && item.ko && !r.ko) r.ko = String(item.ko).slice(0, 40);

      if (ok) {
        r.ok++;
        r.streak = (r.streak > 0 ? r.streak : 0) + 1;
        /* 반감기 늘리기 — 연속 정답일수록 더 크게 (Duolingo HLR 아이디어의 산술 근사)
           빨리 답할수록(ms 작을수록) 더 확실히 안다고 보고 조금 더 늘린다. */
        var grow = 1.9 + 0.35 * Math.min(r.streak, 5);
        if (ex.ms && ex.ms < 2500) grow *= 1.15;
        if (typeof ex.score === 'number' && ex.score >= 85) grow *= 1.1;   // 발음까지 좋았다
        r.hl = Math.min(24 * 180, Math.max(8, r.hl * grow));               // 상한 180일
      } else {
        r.streak = 0;
        r.hl = Math.max(2, r.hl * 0.35);                                   // 틀리면 곧 다시 만난다
      }
      db.items[id] = r;

      // 발음 오류 태그 누적 — 개별 판정은 못 믿어도 30회 누적은 신호다
      var tg = ex.tags || [];
      for (var i = 0; i < tg.length; i++) {
        var t = tg[i]; if (!TAG_LABEL[t]) continue;
        var c = db.tags[t] || { n: 0, bad: 0 };
        c.n++; c.bad++;
        db.tags[t] = c;
      }
      if (ok && typeof ex.score === 'number') {
        // 잘한 것도 세야 '개선율'이 나온다 — 목표어에 들어있던 태그를 정답으로 기록
        var gt = ex.goodTags || [];
        for (var j = 0; j < gt.length; j++) {
          var g = gt[j]; if (!TAG_LABEL[g]) continue;
          var d = db.tags[g] || { n: 0, bad: 0 };
          d.n++;
          db.tags[g] = d;
        }
      }
      save(db);
    } catch (_) {}
  }

  /** 이 항목이 지금 복습할 때가 됐는가 (반감기 초과) */
  function isDue(item) {
    try {
      var r = load().items[idOf(item)];
      if (!r) return true;                        // 처음 보는 것 = 만날 때가 됐다
      return (Date.now() - r.t) >= r.hl * HOUR;
    } catch (_) { return true; }
  }

  /**
   * 문제 뽑기 — 복습할 때가 된 것을 우선한다.
   * @param pool  후보 배열
   * @param bias  0~1, 클수록 복습 항목을 더 강하게 우선 (기본 0.65)
   * 후보가 비었거나 저장소를 못 읽으면 그냥 무작위 → **게임은 절대 안 멈춘다.**
   */
  function pickDue(pool, bias) {
    try {
      if (!pool || !pool.length) return null;
      if (typeof bias !== 'number') bias = 0.65;
      if (Math.random() > bias) return pool[Math.floor(Math.random() * pool.length)];
      var db = load(), now = Date.now(), due = [], fresh = [];
      for (var i = 0; i < pool.length; i++) {
        var r = db.items[idOf(pool[i])];
        if (!r) { fresh.push(pool[i]); continue; }
        if ((now - r.t) >= r.hl * HOUR) due.push(pool[i]);
      }
      var cand = due.length ? due : (fresh.length ? fresh : pool);
      return cand[Math.floor(Math.random() * cand.length)];
    } catch (_) {
      return pool && pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    }
  }

  /**
   * 유능감 한 줄 — 코인 대신 이걸 보여준다 (SDT: 과잉정당화 회피)
   * 게임화 메타분석(2023)이 지적한 "게임화는 유능감엔 영향이 미미"를 뚫는 지점.
   * 자랑할 게 없으면 **빈 문자열**을 준다. 억지 칭찬은 안 한다.
   */
  function note(item) {
    try {
      var r = load().items[idOf(item)];
      if (!r) return '';
      if (r.streak >= 5) return '이 단어 ' + r.streak + '번 연속! 이제 진짜 내 거예요 🌟';
      if (r.streak >= 3) return r.streak + '번 연속 맞혔어요 — 기억에 자리 잡는 중 🌱';
      if (r.n >= 3 && r.streak >= 1 && r.ok < r.n) return '전에 틀렸던 걸 맞혔어요! 👏';
      return '';
    } catch (_) { return ''; }
  }

  /** 취약 발음 상위 n개 — 학생·학부모 리포트용 */
  function weakTags(n) {
    try {
      var db = load(), out = [];
      Object.keys(db.tags).forEach(function (t) {
        var c = db.tags[t];
        if (!TAG_LABEL[t] || !c || c.n < 5) return;      // 표본 5회 미만은 말하지 않는다
        out.push({
          tag: t,
          label: TAG_LABEL[t].ko,
          label_en: TAG_LABEL[t].en,
          n: c.n,
          rate: 1 - (c.bad / c.n)                         // 정확도 0~1
        });
      });
      out.sort(function (a, b) { return a.rate - b.rate; });
      return out.slice(0, n || 3);
    } catch (_) { return []; }
  }

  /** 전체 요약 — 리포트/설정 화면용 */
  function summary() {
    try {
      var db = load(), ks = Object.keys(db.items), now = Date.now();
      var mastered = 0, due = 0;
      ks.forEach(function (k) {
        var r = db.items[k];
        if (r.streak >= 3 && r.hl >= 24 * 3) mastered++;
        if ((now - r.t) >= r.hl * HOUR) due++;
      });
      return { total: ks.length, mastered: mastered, due: due, tags: weakTags(3) };
    } catch (_) { return { total: 0, mastered: 0, due: 0, tags: [] }; }
  }

  function reset() { try { localStorage.removeItem(KEY); } catch (_) {} }

  window.MangoiMemory = {
    log: log, isDue: isDue, pickDue: pickDue,
    note: note, weakTags: weakTags, summary: summary, reset: reset,
    TAG_LABEL: TAG_LABEL
  };
})();
