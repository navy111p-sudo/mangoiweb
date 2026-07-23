/*!
 * 🗣 mangoi-speak-score.js — 따라 말하기 채점기 (기준 문장 정렬 방식)
 *
 * 왜 다시 만들었나 (2026-07-23):
 *   기존 채점은 "목표 단어가 몇 개나 들렸나"(단어 집합 포함 여부)였다. 순서도, 잘못 말한 것도
 *   보지 않아서 **"I have a dog" 목표에 "I have a cat" 이라고 해도 75점으로 통과**했다.
 *
 * 업계 표준(Azure Speech Pronunciation Assessment, Speechace)이 하는 방식을 참고했다:
 *   ① 기준 문장과 실제 발화를 **단어 단위로 정렬**한다.
 *   ② 오류를 종류별로 구분한다 — 누락(omission)·삽입(insertion)·치환(mispronunciation).
 *   ③ 문장 단위 점수를 **정확도(Accuracy)** 와 **완성도(Completeness)** 로 나눠서 본다.
 *   ④ 단어별 결과를 돌려줘서 "어느 단어가 어떻게 들렸는지" 보여준다.
 * 우리는 음소(phoneme) 정보를 받을 수 없으므로(브라우저 인식·Whisper 는 글자만 준다),
 * 음소 채점 대신 **철자 기반 발음 근사 비교**로 "비슷하게 말했지만 인식이 흔들린 경우"를 구제한다.
 *
 * 설계 원칙 (아이들이 쓰는 서비스라 둘 다 중요하다)
 *   - 뜻이 달라지는 실수(dog→cat)는 **반드시 잡는다**.
 *   - 억양·인식기 흔들림(dog→dawg, blue→blew)은 **틀렸다고 하지 않는다**.
 *   - 관사·전치사 같은 기능어는 인식기가 자주 흘리므로 **가중치를 낮춘다**.
 *
 * 사용:
 *   var r = MangoiScore.grade(said, target);
 *   r.pass          통과 여부 (문장 길이에 따라 기준이 다르다)
 *   r.score         0~100 종합 점수(= accuracy)
 *   r.accuracy      0~1 정확도 (치환·누락 반영, 기능어 가중치 낮음)
 *   r.completeness  0~1 완성도 (목표 단어 중 말한 비율)
 *   r.words         [{ w, status:'ok'|'close'|'wrong'|'missing', heard }]
 *   r.tip           한 줄 피드백 (없으면 '')
 */
(function () {
  'use strict';

  /* 인식기가 자주 흘리는 기능어 — 빠뜨려도 크게 감점하지 않는다 */
  var FUNC = {
    a:1, an:1, the:1, is:1, are:1, am:1, was:1, were:1, be:1, been:1, do:1, does:1, did:1,
    to:1, of:1, in:1, on:1, at:1, for:1, with:1, and:1, or:1, but:1, so:1, it:1, its:1,
    my:1, your:1, his:1, her:1, our:1, their:1, this:1, that:1, these:1, those:1,
    i:1, you:1, he:1, she:1, we:1, they:1, not:1, very:1, some:1, any:1
  };
  function weightOf(w) { return FUNC[w] ? 0.4 : 1; }

  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/[^a-z0-9\s']/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function words(s) { var n = norm(s); return n ? n.split(' ') : []; }

  /* 🔊 발음 근사 키 — 모음 차이·중복 자음·흔한 철자 변형을 뭉갠다.
     억양 때문에 인식기가 dog 를 dawg 로 적어도 같은 소리로 보게 하려는 것. */
  function phonKey(w) {
    return String(w || '').toLowerCase().replace(/[^a-z]/g, '')
      .replace(/^(kn|gn|pn|wr)/, 'n')
      .replace(/(ough|augh)/g, 'o')
      .replace(/(tion|sion)/g, 'shn')
      .replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/gh/g, 'g')
      .replace(/c(?=[iey])/g, 's').replace(/c/g, 'k')
      .replace(/q/g, 'k').replace(/z/g, 's').replace(/x/g, 'ks')
      .replace(/[aeiou]+/g, 'a')
      .replace(/(.)\1+/g, '$1');
  }
  function lev(a, b) {
    a = a || ''; b = b || '';
    var m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur[0] = i;
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
      for (j = 0; j <= n; j++) prev[j] = cur[j];
    }
    return prev[n];
  }
  /** 같은 낱말로 볼 만큼 소리가 비슷한가 (억양·인식 흔들림 구제)
     🔴 여기서 너무 관대하면 뜻이 다른 낱말을 같은 말로 봐 버린다.
        실제로 father ↔ mother 가 "한 글자 차이"로 같은 소리 판정이 났었다(첫소리가 다른데도).
        → **첫소리가 같아야** 하고, 짧은 낱말은 한 글자 차이도 인정하지 않는다. */
  function soundsClose(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    var ka = phonKey(a), kb = phonKey(b);
    if (!ka || !kb) return false;
    if (ka === kb) return true;                      // 모음 차이만 다름 (dog ↔ dug)
    if (ka.charAt(0) !== kb.charAt(0)) return false;  // 첫소리가 다르면 다른 낱말 (father ↔ mother)
    var d = lev(ka, kb), longer = Math.max(ka.length, kb.length);
    return (longer >= 4 && d <= 1);                  // 네 소리 이상이면 한 소리 차이까지 인정
  }

  /* 기준 문장과 발화를 단어 단위로 정렬 (Levenshtein 역추적).
     결과 op: 'ok'(맞음) · 'sub'(다른 말) · 'del'(빠뜨림) · 'ins'(군더더기) */
  function align(tw, sw) {
    var m = tw.length, n = sw.length, i, j;
    var D = [], B = [];
    for (i = 0; i <= m; i++) { D[i] = [i]; B[i] = ['del']; }
    for (j = 0; j <= n; j++) { D[0][j] = j; B[0][j] = 'ins'; }
    B[0][0] = null;
    for (i = 1; i <= m; i++) {
      for (j = 1; j <= n; j++) {
        var same = (tw[i - 1] === sw[j - 1]) || soundsClose(tw[i - 1], sw[j - 1]);
        var cSub = D[i - 1][j - 1] + (same ? 0 : 1);
        var cDel = D[i - 1][j] + 1;
        var cIns = D[i][j - 1] + 1;
        var best = Math.min(cSub, cDel, cIns);
        D[i][j] = best;
        B[i][j] = (best === cSub) ? (same ? 'ok' : 'sub') : (best === cDel ? 'del' : 'ins');
      }
    }
    var ops = [];
    i = m; j = n;
    while (i > 0 || j > 0) {
      var op = (i > 0 && j > 0) ? B[i][j] : (i > 0 ? 'del' : 'ins');
      if (op === 'ok' || op === 'sub') { ops.push({ op: op, t: tw[i - 1], s: sw[j - 1] }); i--; j--; }
      else if (op === 'del') { ops.push({ op: 'del', t: tw[i - 1], s: null }); i--; }
      else { ops.push({ op: 'ins', t: null, s: sw[j - 1] }); j--; }
    }
    return ops.reverse();
  }

  /**
   * 채점. opts.strict 를 주면 통과 기준을 그 값(0~1)으로 고정한다.
   */
  function grade(said, target, opts) {
    opts = opts || {};
    var tw = words(target), sw = words(said);
    var out = { score: 0, accuracy: 0, completeness: 0, pass: false, words: [], tip: '', ops: [] };
    if (!tw.length) return out;

    var ops = align(tw, sw);
    out.ops = ops;

    var got = 0, total = 0, spoken = 0, wrong = 0, wrongContent = 0, missing = 0, extra = 0;
    for (var k = 0; k < ops.length; k++) {
      var o = ops[k];
      if (o.op === 'ins') { extra++; continue; }
      var w = weightOf(o.t);
      total += w;
      if (o.op === 'ok') {
        // 철자까지 같으면 만점, 소리만 비슷하면(인식 흔들림) 살짝 감점
        var exact = (o.t === o.s);
        got += exact ? w : w * 0.85;
        spoken++;
        out.words.push({ w: o.t, status: exact ? 'ok' : 'close', heard: o.s });
      } else if (o.op === 'sub') {
        wrong++;
        if (!FUNC[o.t]) wrongContent++;      // 뜻이 달라지는 실수는 따로 센다
        out.words.push({ w: o.t, status: 'wrong', heard: o.s });
      } else {
        missing++;
        out.words.push({ w: o.t, status: 'missing', heard: null });
      }
    }

    out.accuracy = total ? got / total : 0;
    out.completeness = tw.length ? spoken / tw.length : 0;
    // 목표보다 훨씬 길게 떠들면(딴 얘기) 약간 감점 — 인식기 잡음 수준은 봐준다
    if (extra > tw.length) out.accuracy *= 0.85;
    out.score = Math.round(out.accuracy * 100);

    /* 통과 기준 — 문장이 짧을수록 한 단어의 비중이 크므로 더 엄격해야 한다.
       (짧은 문장에서 뜻이 달라지는 단어를 틀려도 통과하던 것이 예전 문제였다)
       '뜻이 달라지는 실수'(wrongContent)만 세고, 관사·전치사 같은 기능어는 인식기가
       자주 흘리므로 통과를 막지 않는다. */
    var need, allowWrongContent;
    if (tw.length <= 2)      { need = 0.9;  allowWrongContent = 0; }
    else if (tw.length <= 5) { need = 0.75; allowWrongContent = 0; }
    else if (tw.length <= 9) { need = 0.72; allowWrongContent = 0; }
    else                     { need = 0.68; allowWrongContent = 1; }   // 긴 문장은 인식 오류가 잦아 하나까지 봐줌
    if (typeof opts.strict === 'number') { need = opts.strict; }
    out.pass = (out.accuracy >= need) && (wrongContent <= allowWrongContent);
    out.need = need;
    out.counts = { wrong: wrong, wrongContent: wrongContent, missing: missing, extra: extra };

    /* 한 줄 피드백 — 무엇을 고치면 되는지 딱 하나만 알려준다 */
    for (var z = 0; z < out.words.length; z++) {
      var it = out.words[z];
      if (it.status === 'wrong') { out.tip = '"' + it.w + '" 을(를) "' + it.heard + '" 로 말했어요'; break; }
    }
    if (!out.tip) {
      for (var y = 0; y < out.words.length; y++) {
        if (out.words[y].status === 'missing') { out.tip = '"' + out.words[y].w + '" 를 빠뜨렸어요'; break; }
      }
    }
    return out;
  }

  window.MangoiScore = { grade: grade, soundsClose: soundsClose, phonKey: phonKey };
})();
