/*!
 * 🇰🇷 mangoi-pron-tags.js — 「한국인 발음 오류 진단」 (Pronunciation Error Tagging)
 *
 * 왜 만들었나 (2026-08-03)
 * ─────────────────────────────────────────────────────────────
 * 지금까지 우리 말하기 게임은 **"몇 점"만 주고 "왜"를 못 줬다.**
 * ELSA 같은 발음 앱의 핵심은 점수가 아니라 **부위별 처방**이다 — "오늘은 모음, 내일은 자음".
 *
 * 음소(phoneme) 정보를 못 받는 한계는 그대로다(브라우저 인식·Whisper 는 글자만 준다).
 * 그런데 **인식기가 잘못 적어준 결과 자체가 진단 신호**다.
 *   학생이 rice 를 말했는데 인식기가 lice 로 적었다면, 그건 인식기 탓이라기보다
 *   **학생이 실제로 L 처럼 발음했다는 증거**에 가깝다.
 *
 * ⚠️ 이 파일의 존재 이유 (왜 mangoi-speak-score.js 안에 안 넣었나)
 *   mangoi-speak-score.js 는 **index.html(공동 금지구역)도 참조**한다.
 *   그 파일을 고치면 index.html 의 ?v= 까지 올려야 하고(asset_version_harness 게이트),
 *   그건 담당 밖 파일을 건드리는 일이다. → 채점기는 **한 글자도 안 건드리고**,
 *   그 공개 결과(r.words)만 읽어서 진단하는 별도 파일로 분리했다.
 *
 * ⚠️ 설계상 가장 중요한 규칙 — **점수는 관대하게, 진단은 정확하게.**
 *   채점기의 soundsClose/phonKey 는 억양 흔들림을 "구제"하려고 차이를 뭉갠다.
 *   그 구제는 그대로 둔다(어린이가 자꾸 틀렸다고 하면 아예 말을 안 하게 된다).
 *   여기서는 **점수에 일절 손대지 않고**, 무슨 차이였는지만 조용히 기록한다.
 *
 * 🔴 개별 1회 판정에 쓰지 말 것. 1회 오인식은 잡음이고, 30회 누적이 신호다.
 *
 * 비용: 0원. 서버 호출 없음.
 *
 * 사용법:
 *   var r = MangoiScore.grade(said, target);
 *   var d = MangoiPron.analyze(r);        // → { tags:['R_L'], goodTags:['FINAL'] }
 *   MangoiMemory.log(item, r.pass, { tags:d.tags, goodTags:d.goodTags, score:r.score });
 */
(function () {
  'use strict';
  if (window.MangoiPron) return;

  var VOW = 'aeiou';
  function isVow(c) { return VOW.indexOf(c) >= 0; }
  function letters(w) { return String(w || '').toLowerCase().replace(/[^a-z]/g, ''); }

  /* 한국인이 자주 헷갈리는 소리 짝 */
  var PAIR = {
    'r|l': 'R_L', 'l|r': 'R_L',
    'f|p': 'F_P', 'p|f': 'F_P',
    'f|v': 'F_V', 'v|f': 'F_V',
    'b|v': 'B_V', 'v|b': 'B_V',
    'z|j': 'Z_J', 'j|z': 'Z_J'
  };

  function lev(a, b) {
    a = a || ''; b = b || '';
    var m = a.length, n = b.length, i, j;
    if (!m) return n; if (!n) return m;
    var prev = [], cur = [];
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur[0] = i;
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                          prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
      for (j = 0; j <= n; j++) prev[j] = cur[j];
    }
    return prev[n];
  }

  /* 글자 단위 정렬 — 어떤 소리가 어떤 소리로 바뀌었는지 보려고 */
  function charOps(a, b) {
    var m = a.length, n = b.length, i, j;
    var D = [], B = [];
    for (i = 0; i <= m; i++) { D[i] = [i]; B[i] = ['del']; }
    for (j = 0; j <= n; j++) { D[0][j] = j; B[0][j] = 'ins'; }
    B[0][0] = null;
    for (i = 1; i <= m; i++) {
      for (j = 1; j <= n; j++) {
        var same = a.charAt(i - 1) === b.charAt(j - 1);
        var cS = D[i - 1][j - 1] + (same ? 0 : 1);
        var cD = D[i - 1][j] + 1;
        var cI = D[i][j - 1] + 1;
        var best = Math.min(cS, cD, cI);
        D[i][j] = best;
        B[i][j] = (best === cS) ? (same ? 'ok' : 'sub') : (best === cD ? 'del' : 'ins');
      }
    }
    var ops = []; i = m; j = n;
    while (i > 0 || j > 0) {
      var op = (i > 0 && j > 0) ? B[i][j] : (i > 0 ? 'del' : 'ins');
      if (op === 'ok' || op === 'sub') { ops.push({ op: op, a: a.charAt(i - 1), b: b.charAt(j - 1), i: i - 1 }); i--; j--; }
      else if (op === 'del') { ops.push({ op: 'del', a: a.charAt(i - 1), b: null, i: i - 1 }); i--; }
      else { ops.push({ op: 'ins', a: null, b: b.charAt(j - 1), i: i }); j--; }
    }
    return ops.reverse();
  }

  /** 목표어 하나 vs 들린 것 하나 → 오류 태그 배열 (없으면 빈 배열) */
  function tagsFor(target, heard) {
    var out = [];
    var t = letters(target), s = letters(heard);
    if (!t || !s || t === s) return out;

    /* 🔴 여기서 안 걸러내면 진단이 통째로 거짓말이 된다.
       "I have a cat" 목표에 학생이 "dog" 라고 말한 건 **발음 문제가 아니라 딴 낱말**이다.
       그런데 글자만 보면 a→o 가 모음 치환으로 보여서 VOWEL 이 붙는다(실측으로 확인했다).
       → 같은 낱말을 잘못 발음한 수준(글자 차이가 길이의 40% 이내)일 때만 진단한다. */
    var far = Math.max(1, Math.ceil(Math.max(t.length, s.length) * 0.4));
    if (lev(t, s) > far) return out;

    /* 첫소리 규칙 — 채점기가 이미 한 번 배운 교훈이다(soundsClose 주석의 father↔mother).
       글자 차이가 적어도 **첫소리가 다르면 대개 딴 낱말**이다. 단, 첫소리 자체가
       한국인이 헷갈리는 짝(r/l, f/p, v/b, z/j)이거나 th 로 시작하면 진짜 발음 문제다. */
    var c0 = t.charAt(0), d0 = s.charAt(0);
    if (c0 !== d0 && !PAIR[c0 + '|' + d0] && t.indexOf('th') !== 0) return out;

    // TH — 한국어에 없는 소리. th 가 통째로 사라지면 s/d/t/z 로 갔다고 본다.
    if (t.indexOf('th') >= 0 && s.indexOf('th') < 0) out.push('TH');

    // 끝소리 탈락 — desk → des (빠진 게 전부 자음일 때만)
    if (t.length > s.length && t.indexOf(s) === 0) {
      var tail = t.slice(s.length);
      if (tail && !/[aeiou]/.test(tail)) out.push('FINAL');
    }
    // 없는 모음 덧붙임 — desk → desku ("데스크"처럼 끝에 '으'를 붙이는 습관)
    if (s.length > t.length && s.indexOf(t) === 0) {
      var add = s.slice(t.length);
      if (add && !/[^aeiou]/.test(add)) out.push('EXTRA');
    }

    var ops = charOps(t, s);
    for (var k = 0; k < ops.length; k++) {
      var o = ops[k];
      if (o.op === 'sub') {
        var p = PAIR[o.a + '|' + o.b];
        if (p) { if (out.indexOf(p) < 0) out.push(p); continue; }
        if (isVow(o.a) && isVow(o.b) && out.indexOf('VOWEL') < 0) out.push('VOWEL');
      } else if (o.op === 'del' && o.a && !isVow(o.a) && o.i === t.length - 1) {
        if (out.indexOf('FINAL') < 0) out.push('FINAL');
      }
    }
    return out;
  }

  /** 이 목표어가 어떤 소리를 "연습할 기회"였는가 — 개선율의 분모를 만들기 위해 */
  function chancesFor(target) {
    var t = letters(target), out = [];
    if (!t) return out;
    if (/[rl]/.test(t)) out.push('R_L');
    if (/th/.test(t)) out.push('TH');
    if (/f/.test(t)) { out.push('F_P'); out.push('F_V'); }
    if (/v/.test(t)) out.push('B_V');
    if (/z/.test(t)) out.push('Z_J');
    if (/[^aeiou]$/.test(t)) out.push('FINAL');
    return out;
  }

  /**
   * 채점 결과(MangoiScore.grade 반환값) 하나를 통째로 진단한다.
   * 채점기의 **공개 결과만** 읽는다 — 채점기 내부는 건드리지 않는다.
   */
  function analyze(r) {
    var out = { tags: [], goodTags: [] };
    try {
      var ws = (r && r.words) || [];
      var add = function (arr, t) { if (t && arr.indexOf(t) < 0) arr.push(t); };
      for (var i = 0; i < ws.length; i++) {
        var it = ws[i];
        if (!it || !it.w) continue;
        if (it.status === 'ok') {
          chancesFor(it.w).forEach(function (c) { add(out.goodTags, c); });
        } else if ((it.status === 'close' || it.status === 'wrong') && it.heard) {
          tagsFor(it.w, it.heard).forEach(function (c) { add(out.tags, c); });
        }
      }
      // 틀린 태그는 goodTags 에서 뺀다 (같은 소리를 맞기도 틀리기도 했으면 '틀림'으로 본다)
      out.goodTags = out.goodTags.filter(function (g) { return out.tags.indexOf(g) < 0; });
    } catch (_) {}
    return out;
  }

  /**
   * 학생에게 보여줄 한 줄 처방 — 점수가 아니라 **다음에 뭘 하면 되는지**.
   * 어린이·어르신이 같이 보므로 짧고 구체적으로. 없으면 빈 문자열(억지 지적 금지).
   */
  var TIP = {
    R_L:   '혀끝을 입천장에 안 대고 "r" — 다시 한 번! 🌱',
    F_P:   '윗니를 아랫입술에 살짝 대고 "f" 🌱',
    F_V:   '윗니를 아랫입술에 대고 떨면서 "v" 🌱',
    B_V:   '"v"는 입술을 붙이지 않아요 — 윗니로 살짝 🌱',
    TH:    '혀끝을 이 사이로 살짝 내밀고 "th" 🌱',
    Z_J:   '"z"는 벌이 나는 소리처럼 지이~ 🌱',
    FINAL: '끝소리까지 또렷하게! (desk 의 "k") 🌱',
    VOWEL: '가운데 모음 소리를 조금 더 길게 🌱',
    EXTRA: '끝에 "으"를 붙이지 않아도 돼요 🌱'
  };
  function tipFor(tags) {
    if (!tags || !tags.length) return '';
    return TIP[tags[0]] || '';
  }

  window.MangoiPron = {
    analyze: analyze, tagsFor: tagsFor, chancesFor: chancesFor, tipFor: tipFor
  };
})();
