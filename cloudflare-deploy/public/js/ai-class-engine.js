/* A.i 선생님 수업 — 결정론 수업 엔진 (/ai-class.html · 2026-10-07)
 * 교재 문장(tb-say)만 «따라 말할 문장» 으로 씁니다. 선생님 말은 고정 문구 표에서만 고릅니다.
 * 순수 함수: step(state, event) → { state, out[] }. 화면·소리·마이크는 바깥이 맡습니다. */
(function (root) {
  'use strict';
  var MAX_REPEAT = 30, MAX_TRIES = 3, PASS = 0.75, MAX_REVIEW = 3;

  var NUM = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
  var CONTR = { "i'm":'i am',"you're":'you are',"he's":'he is',"she's":'she is',"it's":'it is',"we're":'we are',"they're":'they are',"isn't":'is not',"aren't":'are not',"don't":'do not',"doesn't":'does not',"can't":'can not',"cannot":'can not',"won't":'will not',"let's":'let us',"that's":'that is',"what's":'what is',"i'll":'i will',"didn't":'did not',"wasn't":'was not',"there's":'there is',"i've":'i have' };

  // 「a.m.」「V.I.P.s」 → am · vips,  「20,000」 → 20000  (음성인식·타자는 점과 쉼표를 빼고 쓴다)
  function prep(s) { return String(s || '').replace(/\b[A-Za-z]\.(?:[A-Za-z]\.?)+/g, function (m) { return m.replace(/\./g, ''); }).replace(/(\d),(?=\d{3}\b)/g, '$1'); }
  function tokens(s) {
    s = prep(s).toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9' ]+/g, ' ');
    var out = [];
    s.split(/\s+/).forEach(function (w) {
      w = w.replace(/^'+|'+$/g, '');
      if (!w) return;
      if (CONTR[w]) { out.push.apply(out, CONTR[w].split(' ')); return; }
      if (/^\d+$/.test(w) && +w <= 20) { out.push(NUM[+w]); return; }
      out.push(w);
    });
    return out;
  }
  // 아이들은 타자로 «its time», 음성인식은 «wheres» 처럼 아포스트로피를 자주 빠뜨린다.
  // 그래서 «아포스트로피 없이» 한 번 더 비교해 더 좋은 쪽을 쓴다(«it is» 라고 말한 학생은 예전 비교로 그대로 통과).
  // its·well·were·ill·lets 처럼 그 자체로 낱말인 것은 풀어 쓰지 않는다(소유격 its 가 it is 가 되지 않게).
  var LOOSE = {}; Object.keys(CONTR).forEach(function (k) { var b = k.replace(/'/g, ''); if (!/^(its|well|were|ill|lets|cannot)$/.test(b)) LOOSE[b] = CONTR[k]; });
  function looseTokens(s) {
    var out = [];
    tokens(String(s || '').replace(/[’‘`']/g, '')).forEach(function (w) { if (LOOSE[w]) out.push.apply(out, LOOSE[w].split(' ')); else out.push(w); });
    return out;
  }
  function score(target, said) { var a = scoreTok(tokens(target), tokens(said)), b = scoreTok(looseTokens(target), looseTokens(said)); return Math.max(a, b); }
  function scoreTok(a, b) {
    if (!a.length) return 0;
    if (!b.length) return 0;
    var dp = []; for (var i = 0; i <= a.length; i++) { dp.push(new Array(b.length + 1).fill(0)); }
    for (i = 1; i <= a.length; i++) for (var j = 1; j <= b.length; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    var lcs = dp[a.length][b.length];
    var s = lcs / a.length;
    if (b.length > a.length * 2 + 2) s *= 0.8;          // 엉뚱한 말을 길게 하면 깎음
    return Math.round(s * 1000) / 1000;
  }

  // 교재 한 줄의 성격
  function speakable(t) { return String(t).replace(/\s*[—–]\s*/g, '. ').replace(/^\s*→\s*/, '').replace(/\s+/g, ' ').trim(); }
  function kindOf(t) {
    t = String(t || '').trim();
    if (!t) return 'skip';
    if (/^(stage|step|level|round)\s*\d+\b/i.test(t) || /\bboss!/i.test(t)) return 'skip';
    var s = speakable(t);
    if (/[^\x20-\x7e]/.test(s)) return 'skip';          // 한글·한자 등 — 영어 선생님이 읽지 않음
    if (!/[a-z]/i.test(s)) return 'skip';
    if (/\s\/\s/.test(s)) return 'read';                 // 「A / B」 보기 → 읽어만 줌
    var n = s.split(/\s+/).length;
    if (n > 14) return 'read';                           // 문법 설명 → 읽어만 줌
    if (n <= 3 && !/[.!?]$/.test(s)) return 'word';
    return 'sentence';
  }

  // 수업 5단계 — 실제 20분 수업과 같은 흐름
  //  1 시작: 인사 + 지난 레슨 문장 다시 말하기 · 2 도입: 그림 보고 말하기 · 3 본 수업: 읽기·함께·혼자
  //  4 연습: 묻고 답하기(교재에 질문-대답 짝이 있을 때) 또는 혼자 말하기 · 5 마무리: 어려웠던 문장 + 칭찬
  var STAGES = [
    { n: 1, ko: '시작', en: 'Warm-up' }, { n: 2, ko: '도입', en: 'Look' }, { n: 3, ko: '본 수업', en: 'Learn' },
    { n: 4, ko: '연습', en: 'Practice' }, { n: 5, ko: '마무리', en: 'Wrap-up' }
  ];
  var MAX_WARM = 2, MAX_PRACTICE = 3, MAX_FIND = 2, MAX_QUIZ = 3;
  // 🎵 Hello Song (2026-10-10 사장님): 각 권의 첫 레슨(001)은 지금처럼 «듣고 따라 말하기», 그다음 레슨부터는 «노래» 로 부른다.
  //  판정은 이 두 함수 하나뿐 — 페이지·하니스가 같은 것을 쓴다.
  function isFirstLesson(book) { return /^BTS\s+\d+\s+\(?\s*001\b/i.test(String(book || '')); }
  function isHelloSong(page) {
    var ls = ((page && page.lines) || []).map(function (l) { return String(Array.isArray(l) ? l[0] : l); });
    return ls.some(function (t) { return /\bhello,?\s+teacher\b/i.test(t); }) && ls.some(function (t) { return /\bhow are you\b/i.test(t); });
  }
  // ✏️ 빈칸 질문 — 방금 배운 문장에서 뜻 있는 낱말 하나를 가린다(지어내지 않는다: 문장·낱말 모두 교재 그대로)
  function blankOf(say) {
    var ws = String(say || '').split(/\s+/); if (tokens(say).length < 4) return null;
    for (var i = ws.length - 1; i >= 1; i--) {
      var core = ws[i].toLowerCase().replace(/[^a-z']/g, '');
      if (!/^[a-z]{3,}$/.test(core) || STOP[core]) continue;
      var pre = (ws[i].match(/^[^A-Za-z]*/) || [''])[0], post = (ws[i].match(/[^A-Za-z]*$/) || [''])[0];
      var sh = ws.slice(), sp = ws.slice(); sh[i] = pre + '____' + post; sp[i] = pre + 'blank' + post;
      return { word: core, shown: sh.join(' '), spoken: sp.join(' ') };
    }
    return null;
  }
  // 본 수업 질문으로 쓸 짝인가 — 교재에서 «질문 줄 바로 다음 줄» 이 늘 그 대답은 아니다(「What color is the car? → The rose is red.」).
  //  질문과 대답이 뜻 있는 낱말을 하나 이상 나눠 갖거나, 「What is it/this/that?」 처럼 가리키는 질문일 때만 쓴다
  function qaFits(q, a) {
    if (/\bwhat(\s+is|'s)\s+(it|this|that)\b/i.test(q)) return true;
    var aw = {}; tokens(a).forEach(function (w) { if (w.length >= 3 && !STOP[w]) aw[w] = 1; });
    return tokens(q).some(function (w) { return w.length >= 3 && !STOP[w] && aw[w]; });
  }
  function pickEven(list, n) { if (list.length <= n) return list.slice(); var out = []; for (var k = 0; k < n; k++) out.push(list[Math.floor((k + 0.5) * list.length / n)]); return out; }
  function isQ(t) { return /\?["')]*$/.test(String(t).trim()); }

  // ── 주고받기(상호작용) ── 학생의 대답을 듣고 «그 대답에 맞춰» 말한다. 지어내지 않는다:
  //  선생님이 되받아 말하는 낱말은 ① 미리 정해 둔 기분 낱말 ② 그 쪽 교재에 실제로 있는 낱말 ③ 교재 정답의 낱말뿐
  var STOP = {};
  ('the a an and or but you your are is am was were be been this that these those what who how why when where which '
   + 'hello hi yes no not do does did can will would have has had for with from into about here there they them their '
   + 'she her his him its our we us let lets see look like very too just some more then than also okay ok').split(' ').forEach(function (w) { STOP[w] = 1; });
  var FEEL = [
    [/\b(so so|not bad|soso|so-so)\b/, 'feelSoSo'],
    [/\b(not (good|fine|great|ok|okay|happy)|sad|bad|upset|angry|terrible|unhappy|lonely)\b/, 'feelSad'],
    [/\b(tired|sleepy|exhausted)\b/, 'feelTired'],
    [/\b(sick|hurt|ill|headache|cold)\b/, 'feelSick'],
    [/\b(hungry|thirsty)\b/, 'feelHungry'],
    [/\b(happy|great|good|fine|ok|okay|excited|wonderful|awesome|nice|well|alright)\b/, 'feelGood']
  ];
  function feelOf(said) {
    var t = tokens(said).join(' ');
    for (var i = 0; i < FEEL.length; i++) { var m = t.match(FEEL[i][0]); if (m) return { key: FEEL[i][1], word: m[0] }; }
    return null;
  }
  // 인사말 낱말은 «그림에 보이는 것» 이 아니다
  var NOT_SEEN = {}; 'fine thank thanks please sorry morning afternoon evening night bye goodbye nice meet name great welcome today everyone students class ready unit lesson page part review test song sing chant'.split(' ').forEach(function (w) { NOT_SEEN[w] = 1; });
  function pageWords(page) {
    var first = [], rest = [], seen = {};
    ((page && page.lines) || []).forEach(function (l) {
      var t = Array.isArray(l) ? l[0] : l, k = kindOf(t); if (k === 'skip') return;
      tokens(t).forEach(function (w) { if (w.length >= 3 && !STOP[w] && !NOT_SEEN[w] && /^[a-z]+$/.test(w) && !seen[w]) { seen[w] = 1; (k === 'word' ? first : rest).push(w); } });
    });
    // 낱말 카드(한 낱말짜리 줄)를 먼저, 흔한 동사는 뒤로 — 그림에 «보이는» 것이 앞에 오게
    var all = first.concat(rest), late = /^(want|wants|buy|drink|eat|give|put|get|make|need|go|come|take|use|visit|visits|design|designs|like|likes|know|think|say|tell|help|find|play|live|work|something|someone|things|everyday)$/;
    return all.filter(function (w) { return !late.test(w); }).concat(all.filter(function (w) { return late.test(w); }));
  }
  // 정답에서 빠진 낱말(순서대로, 많아야 3개)
  // 빠진 낱말 — 언제나 «책에 적힌 꼴» 로 알려 준다. 아포스트로피 없이 말한 것(its·wheres)도 «말한 것» 으로 친다.
  function missingWords(target, said) {
    var have = {}; tokens(said).concat(looseTokens(said)).forEach(function (w) { have[w] = 1; });
    var raw = {}; tokens(String(said || '').replace(/[’‘`']/g, '')).forEach(function (w) { raw[w] = 1; });
    var out = [];
    prep(target).toLowerCase().replace(/[’‘`]/g, "'").split(/\s+/).forEach(function (rw) {
      var key = rw.replace(/[^a-z0-9]/g, ''), pieces = tokens(rw);
      if (key && raw[key]) return;                    // 「its」 라고 말했으면 책의 「it's」 는 말한 것
      pieces.forEach(function (w) { if (!have[w] && out.indexOf(w) < 0 && out.length < 3) out.push(w); });
    });
    return out;
  }
  function isPersonalQ(q) { return /^(do|are|can|did|have|would|will|is)\s+you\b/i.test(String(q).trim()); }
  function yesNoOf(said) { var t = tokens(said); return t[0] === 'yes' || t[0] === 'yeah' || t[0] === 'yep' ? 'yes' : (t[0] === 'no' || t[0] === 'nope') ? 'no' : ''; }

  // 레슨(같은 [대괄호] 묶음) 슬라이드 → 수업 계획
  function buildPlan(unit, opts) {
    opts = opts || {};
    var pages = unit.pages || [];
    var seen = {}, perPage = [];
    var song = opts.song != null ? !!opts.song : !isFirstLesson(unit.book), songPage = -1;
    if (song) pages.forEach(function (p, pi) { if (songPage < 0 && isHelloSong(p)) songPage = pi; });
    pages.forEach(function (p, pi) {
      var items = [];
      if (pi === songPage) { perPage.push(items); return; }        // 노래로 부르므로 따라 말하기·찾기·질문에서 뺀다
      (p.lines || []).forEach(function (l, li) {
        var text = Array.isArray(l) ? l[0] : l, male = Array.isArray(l) && !!l[1];
        var k = kindOf(text); if (k === 'skip') return;
        var key = tokens(text).join(' ');
        var rep = (k === 'word' || k === 'sentence') && !seen[key];
        if (rep) seen[key] = 1;
        items.push({ page: pi, line: li, text: String(text), say: speakable(text), kind: k, male: male, rep: rep });
      });
      perPage.push(items);
    });
    var total = perPage.reduce(function (a, it) { return a + it.filter(function (x) { return x.rep; }).length; }, 0);
    var quota = perPage.map(function (it) {
      var n = it.filter(function (x) { return x.rep; }).length;
      if (!n) return 0;
      return Math.max(1, Math.min(n, Math.floor(MAX_REPEAT * n / Math.max(1, total))));
    });
    var sum = quota.reduce(function (a, b) { return a + b; }, 0);
    while (sum > MAX_REPEAT) { var mx = quota.indexOf(Math.max.apply(null, quota)); if (quota[mx] <= 1) break; quota[mx]--; sum--; }
    var plan = [{ t: 'greet', stage: 1, free: 'I am happy!', frees: ['I am happy!', 'I am tired.', 'I am fine, thank you.', 'Not good.'] }], lastSig = null;
    if (songPage >= 0) plan.push({ t: 'song', stage: 1, page: songPage, lines: pages[songPage].lines.map(function (l) { return String(Array.isArray(l) ? l[0] : l); }).filter(function (t) { return kindOf(t) !== 'skip'; }) });
    // 1 시작 — 지난 레슨의 문장(있을 때만). 지어내지 않는다: 지난 레슨이 없으면 건너뜀
    var prev = opts.prev, warmKeys = {};
    if (prev && prev.pages) {
      var warm = [];
      prev.pages.forEach(function (p, pi) { (p.lines || []).forEach(function (l, li) {
        var text = Array.isArray(l) ? l[0] : l;
        if (kindOf(text) !== 'sentence') return;
        var k = tokens(text).join(' '); if (warmKeys[k]) return; warmKeys[k] = 1;
        warm.push({ t: 'repeat', mode: 'warm', stage: 1, prev: 1, page: pi, line: li, text: String(text), say: speakable(text), kind: 'sentence', male: Array.isArray(l) && !!l[1] });
      }); });
      // 앞쪽(쉬운 것)에서 하나, 뒤쪽에서 하나
      var pick = warm.length <= MAX_WARM ? warm : [warm[0], warm[warm.length - 1]];
      plan = plan.concat(pick);
    }
    // 2 도입 — 첫 내용 쪽 그림을 보며 자유롭게 말하기
    var firstPage = perPage.findIndex(function (it) { return it.length; });
    if (firstPage >= 0) {
      // 앞쪽 5쪽 가운데 «그림에 보일 낱말» 이 가장 많은 쪽 (인사 노래 쪽보다 내용 쪽을 고르려고)
      var best = firstPage, bestN = -1, seenC = 0;
      for (var pi2 = firstPage; pi2 < pages.length && seenC < 5; pi2++) { if (!perPage[pi2].length) continue; seenC++; var n2 = pageWords(pages[pi2]).length; if (n2 > bestN) { bestN = n2; best = pi2; } }
      var pw = pageWords(pages[best]);
      plan.push({ t: 'stage', stage: 2 }, { t: 'intro', stage: 2, page: best, words: pw.slice(0, 40), free: pw.length ? pw[0].charAt(0).toUpperCase() + pw[0].slice(1) + '!' : 'I see a picture.' });
    }
    plan.push({ t: 'stage', stage: 3 });
    var main = [];
    perPage.forEach(function (it, pi) {
      if (!it.length) return;
      var sig = it.map(function (x) { return x.say; }).join('|');
      if (sig === lastSig) return;                      // 같은 쪽이 연달아 두 번(애니메이션 장) → 한 번만 가르침
      lastSig = sig;
      plan.push({ t: 'page', stage: 3, page: pi });
      var q = quota[pi];
      it.forEach(function (x) {
        if (x.rep && q > 0) { q--; var r = { t: 'repeat', mode: 'main', stage: 3, page: pi, line: x.line, text: x.text, say: x.say, kind: x.kind, male: x.male }; plan.push(r); main.push(r); }
        else plan.push({ t: 'read', stage: 3, page: pi, line: x.line, text: x.text, say: x.say, kind: x.kind, male: x.male });
      });
    });
    // 3-ㄱ «찾아 보기» 놀이 — 그 쪽에서 한 줄에만 나오는 낱말을 골라 «어느 문장에 있어요? 눌러 봐요»
    //  (보기가 둘 이상인 쪽만 · 수업에 많아야 MAX_FIND 번 · 고르는 낱말은 그 쪽 교재에 실제로 있는 낱말)
    var finds = [];
    perPage.forEach(function (it, pi) {
      var ls = []; (pages[pi].lines || []).forEach(function (l, li) { if (kindOf(l[0]) !== 'skip') ls.push({ li: li, tk: tokens(l[0]) }); });
      if (ls.length < 2 || !it.length) return;
      var w = pageWords(pages[pi]).filter(function (x) { return ls.filter(function (q) { return q.tk.indexOf(x) >= 0; }).length === 1; })[0];
      if (!w) return;
      var at = ls.filter(function (q) { return q.tk.indexOf(w) >= 0; })[0];
      finds.push({ t: 'find', stage: 3, page: pi, word: w, line: at.li, choices: ls.length });
    });
    if (finds.length) {
      var picks = finds.length <= MAX_FIND ? finds : [finds[Math.floor(finds.length / 3)], finds[Math.floor(finds.length * 2 / 3)]];
      picks.forEach(function (f) {          // 그 쪽 공부가 끝난 바로 뒤(다음 쪽 넘기기 전)에 넣는다
        var end = -1; for (var x = 0; x < plan.length; x++) if (plan[x].stage === 3 && plan[x].page === f.page && plan[x].t !== 'find') end = x;
        if (end >= 0) plan.splice(end + 1, 0, f);
      });
    }
    // 같은 쪽에서 «질문 → 바로 다음 줄 대답» 짝을 찾는다 — 본 수업 질문(3-ㄷ)과 연습(4)이 함께 쓴다
    var cand = [];
    perPage.forEach(function (it, pi) {
      for (var k = 0; k + 1 < it.length; k++) {
        var qx = it[k], ax = it[k + 1];
        if (qx.kind !== 'sentence' || !isQ(qx.say) || ax.kind !== 'sentence' || isQ(ax.say)) continue;
        if (!/^["'(]?[A-Z]/.test(ax.say)) continue;                 // 「in my backpack.」 같은 빈칸 조각은 대답이 아니다
        if (cand.some(function (p) { return p.say === ax.say; })) continue;
        cand.push({ t: 'repeat', mode: 'qa', stage: 4, page: pi, line: ax.line, text: ax.text, say: ax.say, kind: 'sentence', male: ax.male, ask: qx.say, askMale: qx.male, qline: qx.line, qtext: qx.text, personal: isPersonalQ(qx.say), greet: /\bhow are you\b/i.test(qx.say) });
      }
    });
    // 3-ㄷ 본 수업 «선생님 질문» (2026-10-10 사장님 «따라만 해서 재미없다 — 질문하면 대답하게»)
    //  그 쪽에 «질문 → 대답» 짝이 있으면 그 질문을 묻고(ask), 없으면 그 쪽에서 배운 문장의 낱말 하나를 가려 묻는다(blank).
    //  수업에 많아야 MAX_QUIZ 번, 그 쪽 공부가 끝난 바로 뒤. 질문·정답 모두 교재 그대로라 지어낼 자리가 없다.
    var asks = [], blanks = [], usedQ = {};
    perPage.forEach(function (it, pi) {
      if (!it.length) return;
      var pair = cand.filter(function (c) { return c.page === pi && !c.greet && qaFits(c.ask, c.say); })[0];
      if (pair) { asks.push({ kind: 'ask', page: pi, c: pair }); return; }
      var reps = main.filter(function (m) { return m.page === pi && m.kind === 'sentence'; });
      for (var r = reps.length - 1; r >= 0; r--) { var b = blankOf(reps[r].say); if (b) { blanks.push({ kind: 'blank', page: pi, m: reps[r], b: b }); break; } }
    });
    var qa1 = pickEven(asks, Math.min(2, asks.length)), qpick = qa1.concat(pickEven(blanks, Math.max(0, MAX_QUIZ - qa1.length)));
    qpick.sort(function (a, b) { return a.page - b.page; }).forEach(function (q) {
      var step;
      if (q.kind === 'ask') { usedQ[q.c.say] = 1; step = { t: 'repeat', mode: 'ask', quiz: 1, stage: 3, page: q.page, line: q.c.line, text: q.c.text, say: q.c.say, kind: 'sentence', male: q.c.male, ask: q.c.ask, askMale: q.c.askMale, qline: q.c.qline, personal: q.c.personal }; }
      else step = { t: 'repeat', mode: 'blank', quiz: 1, stage: 3, page: q.page, line: q.m.line, text: q.m.text, say: q.m.say, kind: 'sentence', male: q.m.male, blank: q.b.word, shown: q.b.shown, spoken: q.b.spoken };
      var end = -1; for (var x = 0; x < plan.length; x++) if (plan[x].stage === 3 && plan[x].page === q.page) end = x;
      if (end >= 0) plan.splice(end + 1, 0, step);
    });
    // 3-ㄴ 본 수업이 길면 절반쯤에서 한 번 응원
    if (main.length >= 10) { var mid = plan.indexOf(main[Math.floor(main.length / 2)]); if (mid > 0) plan.splice(mid, 0, { t: 'cheer', stage: 3 }); }
    // 4 연습 — 짝이 있으면 묻고 답하기, 없으면 배운 문장을 혼자 말하기
    // 거의 모든 레슨 첫 쪽에 있는 인사(How are you?)는 «시작» 에서 이미 한 셈이라 연습 짝으로 안 쓴다
    // 본 수업에서 이미 물은 질문은 뒤로 — 같은 질문이 연달아 두 번 나오지 않게
    var prac = cand.filter(function (c) { return !c.greet && !usedQ[c.say]; }).concat(cand.filter(function (c) { return !c.greet && usedQ[c.say]; })).slice(0, MAX_PRACTICE);
    prac.forEach(function (c) { delete c.greet; });
    if (!prac.length) {
      var pool = main.filter(function (m) { return m.kind === 'sentence'; });
      if (!pool.length) pool = main;
      var step = Math.max(1, Math.floor(pool.length / MAX_PRACTICE));
      for (var j = 0; j < pool.length && prac.length < MAX_PRACTICE; j += step) {
        var m = pool[j]; prac.push({ t: 'repeat', mode: 'solo', stage: 4, page: m.page, line: m.line, text: m.text, say: m.say, kind: m.kind, male: m.male });
      }
    }
    // 4-ㄱ 역할 바꾸기 — 첫 «묻고 답하기» 다음엔 학생이 같은 질문을 하고 선생님이 책의 대답을 한다
    if (prac.length && prac[0].mode === 'qa') { var q0 = prac[0]; prac.splice(1, 0, { t: 'repeat', mode: 'swap', stage: 4, page: q0.page, line: q0.qline, text: q0.qtext, say: q0.ask, kind: 'sentence', male: q0.askMale, answer: q0.say, answerMale: q0.male }); }
    if (prac.length) plan = plan.concat([{ t: 'stage', stage: 4, kind: prac[0].mode }], prac);
    plan.push({ t: 'stage', stage: 5 }, { t: 'wrap', stage: 5 });
    return plan;
  }

  // 선생님 말 — 고정 문구(영어 + 한국어 자막)
  var T = {
    greet: [['Hi {name}! Welcome to class. How are you today?', '안녕 {name}! 수업에 온 걸 환영해요. 오늘 기분 어때요?'],
      ['Hello, {name}! Nice to see you. How are you today?', '안녕하세요, {name}! 만나서 반가워요. 오늘 기분 어때요?'],
      ['Hi there, {name}! I am happy to see you. How are you feeling?', '{name}, 반가워요! 오늘 기분은 어때요?']],
    greetOk: [['Great! Let\'s start.', '좋아요! 시작해 볼까요?']],
    feelGood: [['You feel {w}? Great to hear!', '«{w}» 이군요? 좋아요!'], ['"{w}"! That\'s great. Let\'s have a fun class.', '«{w}»! 좋아요. 재미있게 수업해요.'],
      ['Oh, {w}! I love that. Let\'s keep that energy.', '«{w}»! 좋아요. 그 기분 그대로 가요.'], ['You are {w}? Wonderful! Happy students make a happy teacher.', '«{w}»? 멋져요! 학생이 즐거우면 선생님도 즐거워요.']],
    feelTired: [['Oh, you are {w}. Let\'s have fun and wake up!', '«{w}» 이군요. 재미있게 하면서 깨워 봐요!'], ['A little {w}? Let\'s stretch our arms up high!', '조금 «{w}»? 팔을 쭉 뻗어 봐요!'],
      ['I see, you are {w}. We will go step by step.', '«{w}» 이군요. 하나씩 천천히 해요.'], ['Oh, {w}? Take a deep breath with me.', '«{w}»? 같이 크게 숨 쉬어 봐요.']],
    feelSad: [['Oh no, "{w}"? I hope our class makes you happy.', '저런, «{w}»? 수업으로 기분이 좋아지면 좋겠어요.'], ['"{w}"? I am sorry to hear that. I am here with you.', '«{w}»? 속상하네요. 선생님이 함께 있어요.'],
      ['Oh, you feel "{w}". Let\'s smile together. You can do it.', '«{w}» 이군요. 같이 웃어 봐요. 할 수 있어요.']],
    feelSick: [['Oh no, "{w}"? Let\'s go slowly today.', '저런, «{w}»? 오늘은 천천히 해요.'], ['"{w}"? I am sorry. Please drink some water. We will take it easy.', '«{w}»? 걱정돼요. 물 한 잔 마셔요. 오늘은 편하게 해요.'],
      ['Oh no, "{w}"! Tell me if you need a break.', '저런, «{w}»! 쉬고 싶으면 말해요.']],
    feelHungry: [['You are {w}? Me too! Let\'s learn first, then have a snack.', '«{w}»? 저도요! 먼저 배우고 간식 먹어요.'], ['Oh, {w}! Let\'s finish class, then get something.', '«{w}»! 수업 끝나고 뭐 먹어요.'],
      ['Oh, you are {w}? Okay! After class, you can have something.', '«{w}»? 좋아요! 수업 끝나면 먹어요.']],
    feelSoSo: [['"{w}"? I see! Let\'s make it a better day together!', '«{w}»? 그렇군요! 같이 더 좋은 날로 만들어요!'], ['Oh, "{w}"! Let\'s have some fun in class.', '«{w}»! 수업에서 재미있게 해요.'],
      ['"{w}"? Okay! I hope you feel great by the end.', '«{w}»? 알겠어요! 끝날 땐 기분이 좋아지면 좋겠어요.']],
    feelOther: [['Thank you for telling me!', '말해 줘서 고마워요!'], ['I see! Thanks for sharing.', '그렇군요! 알려 줘서 고마워요.'], ['Okay! Good to know.', '알겠어요! 알려 줘서 좋아요.']],
    today: [['Today we learn "{title}". Let\'s start!', '오늘은 «{title}» 을 배워요. 시작해요!'], ['Our lesson today is "{title}". Here we go!', '오늘 수업은 «{title}» 이에요. 출발!'],
      ['Let\'s open the book. Today it\'s "{title}".', '책을 펴요. 오늘은 «{title}» 이에요.']],
    introSaw: [['Yes! I see "{w}" too. Good eyes!', '맞아요! «{w}» 이 보여요. 잘 찾았어요!'], ['"{w}"! You found it. Well spotted!', '«{w}»! 찾았네요. 잘 봤어요!'],
      ['That\'s right, "{w}"! You have sharp eyes.', '맞아요, «{w}»! 눈이 아주 좋네요.'], ['Wow, "{w}"! I see it right here.', '와, «{w}»! 여기 있어요.']],
    introOther: [['Nice try! Look, I see "{w}" here.', '좋은 시도예요! 여기 «{w}» 이 보이죠?'], ['Good idea! Can you also see "{w}"?', '좋은 생각이에요! «{w}» 도 보여요?'],
      ['Hmm, look closely. Here is "{w}".', '음, 자세히 봐요. 여기 «{w}» 이 있어요.']],
    introHint: [['Look! I see "{w}". Let\'s find out more.', '보세요! «{w}» 이 있어요. 더 알아봐요.'], ['It\'s okay. Look here, it\'s "{w}".', '괜찮아요. 여기 봐요, «{w}» 이에요.'],
      ['Let me help. I see "{w}" in the picture.', '도와줄게요. 그림에 «{w}» 이 보여요.']],
    missing: [['Good start! You missed "{w}". Listen once more.', '잘하고 있어요! «{w}» 이 빠졌어요. 한 번 더 들어 봐요.'], ['Almost there! Don\'t forget "{w}". Listen again.', '거의 다 왔어요! «{w}» 을 잊지 마요. 다시 들어 봐요.'],
      ['Nice! Just add "{w}". One more time.', '좋아요! «{w}» 만 넣으면 돼요. 한 번 더요.'], ['You are close! I heard most of it. Add "{w}".', '거의 맞았어요! «{w}» 을 넣어 봐요.']],
    passMissing: [['Good! Next time, say "{w}" too.', '좋아요! 다음엔 «{w}» 도 말해 봐요.'], ['Nice job! Try to add "{w}" next time.', '잘했어요! 다음엔 «{w}» 도 넣어 봐요.'],
      ['Great! Remember "{w}" for next time.', '훌륭해요! «{w}» 은 다음에 기억해요.']],
    personalYes: [['Oh, yes? Great! Thank you for telling me.', '오, 그렇군요! 말해 줘서 고마워요.'], ['Yes? Me too! That\'s nice.', '그래요? 저도요! 좋네요.'], ['Really? Cool! Thanks for telling me.', '정말요? 멋져요! 알려 줘서 고마워요.']],
    personalNo: [['Oh, no? That\'s okay! Thank you for telling me.', '아니군요? 괜찮아요! 말해 줘서 고마워요.'], ['No? That\'s fine. Everyone is different.', '아니에요? 괜찮아요. 사람마다 달라요.'], ['I see, no. Thanks for your honest answer.', '그렇군요. 솔직하게 말해 줘서 고마워요.']],
    bookSays: [['In our book, the answer is:', '책에서는 이렇게 대답해요:'], ['Now listen to the book\'s answer:', '이제 책의 대답을 들어 봐요:'], ['Here is how the book says it:', '책에서는 이렇게 말해요:']],
    warm: [['Do you remember this from last time? Say it with me.', '지난 시간에 배운 문장 기억나요? 같이 말해 봐요.'], ['One more from last time.', '지난 시간 문장 하나 더요.'], ['Let\'s check your memory. From our last class:', '기억력 확인! 지난 수업 문장이에요:']],
    stage2: [['Now look at the picture.', '이제 그림을 볼까요?'], ['Let\'s look at this picture together.', '이 그림을 같이 봐요.']],
    intro: [['What do you see? Tell me in English.', '무엇이 보여요? 영어로 말해 봐요.'], ['What can you find in the picture?', '그림에서 무엇을 찾을 수 있어요?'], ['Look carefully. What do you see?', '자세히 봐요. 무엇이 보여요?']],
    introOk: [['Nice! Let\'s find out more in the book.', '좋아요! 책에서 더 알아봐요.'], ['Good! Now let\'s read about it.', '좋아요! 이제 읽어 봐요.']],
    introQuiet: [['That\'s okay. Let\'s find out together!', '괜찮아요. 같이 알아봐요!'], ['No problem. We will see it in the book.', '괜찮아요. 책에서 같이 봐요.']],
    stage3: [['Let\'s read the book. Listen first, then say it with me.', '이제 책을 읽어요. 먼저 듣고, 저를 따라 말해요.'], ['Book time! I read, then you repeat.', '책 읽는 시간! 제가 읽고 {name}이(가) 따라 해요.']],
    stage4qa: [['Practice time! I ask, you answer.', '연습 시간! 제가 묻고 {name}이(가) 대답해요.'], ['Let\'s talk! I ask a question, you answer.', '대화해 봐요! 제가 질문하면 대답해요.']],
    stage4solo: [['Practice time! Now say it by yourself.', '연습 시간! 이번엔 혼자 말해 봐요.'], ['Your turn to shine! Say it on your own.', '{name} 차례예요! 혼자 말해 봐요.']],
    qa: [['Answer me:', '대답해 보세요:'], ['Here is my question:', '질문할게요:'], ['Can you answer this?', '이거 대답할 수 있어요?']],
    solo: [['Can you say this by yourself?', '이 문장을 혼자 말할 수 있어요?'], ['Try this one on your own.', '이건 혼자 해 봐요.'], ['Read this by yourself. You can do it!', '혼자 읽어 봐요. 할 수 있어요!']],
    stage5: [['Great work today! Let\'s wrap up.', '오늘 정말 잘했어요! 마무리해요.'], ['We are almost done. Let\'s finish strong!', '거의 끝났어요. 힘차게 마무리해요!']],
    greetQuiet: [['That\'s okay. Let\'s start!', '괜찮아요. 시작해 볼게요!'], ['No worries. Let\'s begin!', '걱정 마요. 시작해요!']],
    page: [['Look at this page.', '이 쪽을 보세요.'], ['Next page!', '다음 쪽이에요!'], ['Let\'s see what\'s here.', '여기에 뭐가 있는지 볼까요?'], ['Turn the page with me.', '같이 다음 쪽으로 가요.'], ['Here is a new page.', '새로운 쪽이에요.']],
    read: [['Listen.', '잘 들어 보세요.'], ['Read with your eyes.', '눈으로 따라 읽어 보세요.'], ['Follow along.', '따라가며 봐요.']],
    repeat: [['Listen and repeat.', '듣고 따라 말해 보세요.'], ['Your turn. Say it with me.', '이번엔 {name} 차례예요.'], ['Repeat after me.', '저를 따라 해 보세요.'], ['Say it like me.', '저처럼 말해 봐요.'], ['Now you try.', '이제 해 봐요.']],
    word: [['Say this word.', '이 낱말을 말해 보세요.'], ['What is this word? Say it.', '이 낱말 말해 봐요.'], ['One word. Say it with me.', '낱말 하나예요. 같이 말해요.']],
    praise: [['Excellent!', '아주 잘했어요!'], ['Great job, {name}!', '{name}, 잘했어요!'], ['Perfect!', '완벽해요!'], ['Wonderful pronunciation!', '발음이 아주 좋아요!'],
      ['Very good!', '아주 좋아요!'], ['Nice and clear!', '또박또박 잘했어요!'], ['You got it!', '맞았어요!'], ['Super!', '최고예요!']],
    praiseRetry: [['Much better! Great job.', '훨씬 좋아졌어요! 잘했어요.'], ['See? You can do it!', '봐요, 할 수 있잖아요!'], ['Yes! That\'s it this time.', '네! 이번엔 맞았어요.'], ['Good! Practice makes it better.', '좋아요! 연습하니까 늘었어요.']],
    praiseReview: [['You got it this time! Well done.', '이번엔 해냈어요! 잘했어요.'], ['Now you know it! Great.', '이제 알겠죠! 훌륭해요.'], ['Look at that! You remembered.', '와, 기억했네요!']],
    praiseLong: [['Wow, a long sentence! Great job.', '와, 긴 문장인데 잘했어요!'], ['That was a long one. Well done!', '긴 문장이었는데 잘했어요!'], ['Excellent! You said the whole sentence.', '훌륭해요! 문장을 다 말했어요.']],
    // 감탄사 — 맞힐 때마다 칭찬 앞에 붙인다(2026-10-07 사장님 «You are awesome! You are great! 같은 감탄사»)
    wow: [['You are awesome!', '정말 멋져요!'], ['You are great!', '정말 훌륭해요!'], ['Wow, you are amazing!', '와, 정말 대단해요!'], ['You are so smart!', '정말 똑똑해요!'],
      ['Fantastic job!', '환상적이에요!'], ['You are a superstar!', '슈퍼스타예요!'], ['Way to go!', '그렇게 하는 거예요!'], ['High five!', '하이파이브!']],
    praiseStreak: [['Yes! {n} in a row! You are on fire!', '네! 연속 {n}번! 불타오르네요!'], ['Wow, {n} in a row! Keep going!', '와, 연속 {n}번! 계속 가요!'], ['That\'s {n} in a row. Amazing!', '연속 {n}번이에요. 대단해요!']],
    praiseWord: [['Good word!', '낱말 잘 말했어요!'], ['Yes, that\'s the word!', '네, 바로 그 낱말이에요!'], ['Great, clear word!', '또렷하게 잘했어요!']],
    praiseQa: [['Good answer!', '좋은 대답이에요!'], ['That\'s the right answer!', '맞는 대답이에요!'], ['Great! You answered well.', '훌륭해요! 대답 잘했어요.']],
    praiseSolo: [['All by yourself! Amazing.', '혼자서 해냈어요! 대단해요.'], ['No help needed. Great!', '도움 없이 해냈어요. 훌륭해요!'], ['You did it alone. Super!', '혼자 했어요. 최고예요!']],
    praiseWarm: [['You remembered! Great.', '기억했네요! 훌륭해요.'], ['Yes! You still know it.', '네! 아직 기억하고 있네요.'], ['Great memory!', '기억력 최고예요!']],
    find: [['Can you find "{w}" on this page? Tap the sentence!', '이 쪽에서 «{w}» 을 찾을 수 있어요? 그 문장을 눌러 봐요!'], ['Treasure hunt! Where is "{w}"? Tap it!', '보물찾기! «{w}» 은 어디 있을까요? 눌러 봐요!'], ['Quick game! Find "{w}" and tap it.', '깜짝 놀이! «{w}» 을 찾아 눌러 봐요.']],
    findOk: [['You found "{w}"! Super eyes!', '«{w}» 찾았어요! 눈이 아주 좋아요!'], ['Yes! "{w}" is right there. Great!', '맞아요! «{w}» 이 거기 있어요. 잘했어요!'], ['Bingo! That\'s "{w}".', '빙고! 그게 «{w}» 이에요.']],
    findTry: [['Not that one. Look for "{w}" again!', '그건 아니에요. «{w}» 을 다시 찾아봐요!'], ['Hmm, close! Where else is "{w}"?', '음, 아까워요! «{w}» 은 또 어디 있을까요?']],
    findShow: [['Here it is! "{w}" is right here.', '여기 있어요! «{w}» 은 바로 여기예요.'], ['Look! I see "{w}" in this sentence.', '보세요! 이 문장에 «{w}» 이 있어요.']],
    swap: [['Now let\'s switch! You ask me. Say:', '이번엔 바꿔요! {name}이(가) 저에게 물어봐요. 이렇게요:'], ['Your turn to be the teacher! Ask me:', '이번엔 {name}이(가) 선생님! 저에게 물어봐요:']],
    praiseSwap: [['Great question! Let me answer.', '좋은 질문이에요! 대답해 볼게요.'], ['Nice asking! Here is my answer.', '잘 물어봤어요! 제 대답은요.'], ['Good question, {name}! I will answer.', '{name}, 좋은 질문! 대답할게요.']],
    checkIn: [['Are you there, {name}? Tap the mic and say:', '{name}, 거기 있어요? 마이크를 누르고 말해 봐요:'], ['I am waiting for you, {name}. Try to say:', '{name}, 기다리고 있어요. 이렇게 말해 봐요:']],
    cheer: [['Halfway there, {name}! You are doing great.', '{name}, 벌써 절반이에요! 아주 잘하고 있어요.'], ['We are halfway done. Keep it up, {name}!', '절반 왔어요. {name}, 계속 힘내요!'], ['Half of the book is done. Super job!', '책의 절반을 끝냈어요. 최고예요!']],
    retry: [['Almost! Listen once more.', '거의 다 왔어요! 한 번 더 들어 봐요.'], ['Close! Let\'s try again.', '아까워요! 다시 해 봐요.'], ['Good try! Listen one more time.', '좋은 시도예요! 한 번 더 들어 봐요.']],
    hint: [['Read with me, slowly.', '천천히 저와 같이 읽어요.'], ['Let\'s go slowly. Listen carefully.', '천천히 해요. 잘 들어 봐요.'], ['Slowly now. Say it with me.', '이번엔 천천히. 같이 말해요.']],
    quiet: [['Take your time. Say:', '천천히 해도 돼요. 이렇게 말해 봐요:'], ['It\'s okay. Try to say:', '괜찮아요. 이렇게 말해 봐요:'], ['Don\'t be shy. Say:', '부끄러워하지 마요. 이렇게 말해요:']],
    move: [['Good try! We will practice it again later.', '좋은 시도였어요! 이건 끝에서 다시 연습해요.'], ['That\'s okay. We will come back to it.', '괜찮아요. 이건 나중에 다시 해요.'], ['Nice effort! Let\'s try it again at the end.', '열심히 했어요! 끝에서 다시 해 봐요.']],
    skip: [['Okay, let\'s move on.', '좋아요, 넘어갈게요.'], ['Alright, next one.', '알겠어요, 다음이에요.'], ['No problem. Let\'s go on.', '괜찮아요. 계속 가요.']],
    review: [['Let\'s practice the hard ones again.', '어려웠던 문장을 다시 연습해요.'], ['Time to try the tricky ones again!', '어려웠던 것들 다시 해 볼 시간이에요!']],
    bye: [['You did it, {name}! You got {stars} stars today. See you next time. Goodbye!', '{name}, 해냈어요! 오늘 별을 {stars}개 받았어요. 다음에 또 만나요!'],
      ['Great class, {name}! {stars} stars today. See you soon. Bye!', '{name}, 멋진 수업이었어요! 오늘 별 {stars}개. 또 만나요!']],
    byePerfect: [['Wow, {name}! You got all {stars} stars! Perfect class. See you next time!', '와, {name}! 별 {stars}개를 다 받았어요! 완벽한 수업이에요. 다음에 또 만나요!']],
    quizAsk: [['Question time! Look at the page and answer me.', '질문 시간! 책을 보고 대답해 봐요.'], ['Now I ask you a question. Ready?', '이번엔 선생님이 질문할게요. 준비됐어요?'],
      ['Let\'s check! Can you answer this?', '확인해 볼까요? 이 질문에 대답할 수 있어요?'], ['Pop quiz! Listen to my question.', '깜짝 질문! 잘 들어 봐요.']],
    quizBlank: [['Quick quiz! What word is missing? Say the whole sentence.', '깜짝 퀴즈! 빠진 낱말은 뭘까요? 문장을 다 말해 봐요.'], ['Fill in the blank! Listen.', '빈칸을 채워 봐요! 잘 들어요.'],
      ['Memory game! One word is hiding. Can you find it?', '기억력 놀이! 낱말 하나가 숨었어요. 찾을 수 있어요?'], ['Let\'s see what you remember. Say the missing word!', '얼마나 기억하는지 볼까요? 빠진 낱말을 말해 봐요!']],
    blankHint: [['Hint! It starts with "{c}".', '힌트! «{c}» 로 시작해요.'], ['Here is a hint: the first letter is "{c}".', '힌트예요: 첫 글자는 «{c}» 예요.'],
      ['Think again! It begins with "{c}".', '다시 생각해 봐요! «{c}» 로 시작해요.']],
    praiseQuiz: [['Correct! You know it!', '정답! 잘 알고 있네요!'], ['Yes! That\'s the answer!', '네! 그게 정답이에요!'], ['Bingo! Great thinking!', '빙고! 생각을 잘했어요!'], ['Right answer! Smart!', '맞혔어요! 똑똑해요!']],
    ownAnswer: [['Great answer! Thank you for telling me about you.', '좋은 대답이에요! {name} 이야기를 해 줘서 고마워요.'], ['I love your answer!', '대답이 정말 마음에 들어요!'],
      ['Interesting! That\'s a good answer.', '재미있어요! 좋은 대답이에요.']],
    songIntro: [['Let\'s sing the Hello Song together! Listen and sing along.', '같이 Hello Song 을 불러요! 듣고 따라 불러 봐요.'], ['Song time! Sing the Hello Song with me.', '노래 시간! 저랑 Hello Song 을 불러요.'],
      ['Clap your hands! It\'s the Hello Song.', '손뼉을 쳐요! Hello Song 이에요.']],
    songOk: [['Great singing! Now let\'s start our lesson.', '노래 정말 잘했어요! 이제 수업을 시작해요.'], ['What a nice song! Let\'s begin.', '멋진 노래였어요! 시작해요.'], ['Lovely singing, {name}!', '{name}, 노래 최고예요!']],
    byeTry: [['Good work, {name}! You got {stars} stars. Let\'s practice more next time. Bye!', '{name}, 수고했어요! 별 {stars}개. 다음에 더 연습해요!']]
  };

  // 반응을 더 다양하게 — 모든 반응이 최소 네 가지(인사·작별 고정 문구는 세 가지) 말투를 갖는다
  var MORE = {
    greet: [['Hey {name}! Ready to learn? How do you feel today?', '{name}! 배울 준비 됐어요? 오늘 기분 어때요?']],
    greetOk: [['Okay! Here we go.', '좋아요! 출발해요.'], ['Wonderful! Let\'s begin.', '멋져요! 시작해 봐요.']],
    feelSad: [['"{w}"? Thank you for telling me. We will smile together.', '«{w}»? 말해 줘서 고마워요. 같이 웃어 봐요.']],
    feelSick: [['Oh, "{w}"? Let\'s keep it easy and short today.', '«{w}»? 오늘은 가볍게 해요.']],
    feelHungry: [['"{w}"? Ha ha! New words are snacks for your brain.', '«{w}»? 하하! 새 낱말은 머리의 간식이에요.']],
    feelSoSo: [['Just "{w}"? A fun class can change that!', '그냥 «{w}»? 재미있는 수업이 바꿔 줄 거예요!']],
    feelOther: [['Got it! Thanks, {name}.', '알겠어요! 고마워요, {name}.']],
    today: [['Ready? Today\'s lesson is "{title}".', '준비됐어요? 오늘 수업은 «{title}» 이에요.']],
    introOther: [['Good guess! And here I see "{w}".', '좋은 추측이에요! 그리고 여기 «{w}» 이 보여요.']],
    introHint: [['Let\'s look together. Do you see "{w}"?', '같이 봐요. «{w}» 이 보여요?']],
    passMissing: [['Well done! Add "{w}" next time.', '잘했어요! 다음엔 «{w}» 을 넣어요.']],
    personalYes: [['Yes? How fun! Thanks for sharing that.', '그래요? 재미있네요! 알려 줘서 고마워요.']],
    personalNo: [['No? Okay! I like your answer.', '아니에요? 좋아요! 대답 마음에 들어요.']],
    bookSays: [['And the book says:', '그리고 책에서는 이렇게 말해요:']],
    warm: [['Warm-up time! Say this one from last class.', '몸풀기 시간! 지난 수업 문장이에요.']],
    stage2: [['Picture time! Let\'s take a look.', '그림 시간! 같이 봐요.'], ['Let\'s look closely at the picture.', '그림을 자세히 봐요.']],
    intro: [['Tell me one thing you see.', '보이는 것 하나만 말해 봐요.']],
    introOk: [['Great! Let\'s read and learn more.', '좋아요! 읽으면서 더 배워요.'], ['Thanks! Let\'s see what the book says.', '고마워요! 책에 뭐라고 있는지 봐요.']],
    introQuiet: [['It\'s okay. The book will show us.', '괜찮아요. 책이 알려 줄 거예요.'], ['That\'s fine. Let\'s read and find out.', '괜찮아요. 읽으면서 알아봐요.']],
    stage3: [['Now let\'s read together. Listen and say it after me.', '이제 같이 읽어요. 듣고 따라 말해요.'], ['Reading time! Listen to me first.', '읽기 시간! 먼저 제 말을 들어요.']],
    stage4qa: [['Question time! Listen and answer me.', '질문 시간! 듣고 대답해요.'], ['Let\'s have a little talk. I ask, you answer.', '잠깐 대화해요. 제가 묻고 {name}이(가) 대답해요.']],
    stage4solo: [['Now it\'s all you, {name}! Say it alone.', '{name}, 이제 혼자예요! 혼자 말해 봐요.'], ['Solo time! No help this time.', '혼자 하는 시간! 이번엔 도움 없이요.']],
    qa: [['Let me ask you:', '물어볼게요:']],
    solo: [['Now say it alone.', '이제 혼자 말해 봐요.']],
    stage5: [['What a great class! Let\'s finish up.', '정말 좋은 수업이었어요! 마무리해요.'], ['Last part now. You did so well!', '이제 마지막이에요. 정말 잘했어요!']],
    greetQuiet: [['That\'s fine. Let\'s jump in!', '괜찮아요. 바로 시작해요!'], ['Okay! Let\'s have fun today.', '좋아요! 오늘 재미있게 해요.']],
    read: [['Look and listen.', '보면서 들어 봐요.']],
    word: [['Here is a word. Say it.', '낱말이에요. 말해 봐요.']],
    praiseReview: [['You remember it now! Excellent.', '이제 기억하네요! 훌륭해요.']],
    praiseLong: [['So many words, all correct! Great.', '낱말이 많았는데 다 맞았어요! 훌륭해요.']],
    praiseStreak: [['Look at you, {n} in a row! Unstoppable!', '연속 {n}번이에요! 못 말려요!']],
    praiseWord: [['Yes, "{w}"! Very clear.', '네, «{w}»! 아주 또렷해요.'], ['"{w}"! Perfect word.', '«{w}»! 완벽한 낱말이에요.']],
    praiseQa: [['Yes! You understood the question.', '네! 질문을 잘 알아들었어요.']],
    praiseSolo: [['On your own! Fantastic.', '혼자서! 환상적이에요.']],
    praiseWarm: [['You did not forget! Great.', '안 잊었네요! 훌륭해요.']],
    find: [['Let\'s play! Which sentence has "{w}"? Tap it!', '놀이해요! «{w}» 이 들어간 문장은? 눌러 봐요!']],
    findOk: [['Great finding! "{w}" is there.', '잘 찾았어요! «{w}» 이 거기 있어요.']],
    findTry: [['Oops, try again! Find "{w}".', '앗, 다시 해 봐요! «{w}» 을 찾아요.'], ['Not quite. Look for "{w}" one more time.', '조금 달라요. «{w}» 을 한 번 더 찾아봐요.']],
    findShow: [['That\'s okay! "{w}" is here.', '괜찮아요! «{w}» 은 여기 있어요.'], ['This sentence has "{w}". See?', '이 문장에 «{w}» 이 있어요. 보이죠?']],
    swap: [['Let\'s change roles! You ask the question:', '역할을 바꿔요! {name}이(가) 질문해요:'], ['Now you ask and I answer. Say:', '이번엔 {name}이(가) 묻고 제가 대답해요. 이렇게요:']],
    praiseSwap: [['What a nice question! My answer is:', '정말 좋은 질문이에요! 제 대답은요:']],
    checkIn: [['Hello? I can\'t hear you, {name}. Try to say:', '{name}, 안 들려요. 이렇게 말해 봐요:'], ['Still with me, {name}? Say:', '{name}, 같이 있어요? 이렇게 말해요:']],
    cheer: [['Half done already! You are a star, {name}.', '벌써 반이에요! {name}, 최고예요.']],
    retry: [['So close! One more time.', '정말 아까워요! 한 번 더요.']],
    hint: [['Listen to each word. Slowly.', '낱말 하나씩 들어 봐요. 천천히.']],
    quiet: [['Give it a try. Say:', '한번 해 봐요. 이렇게 말해요:']],
    move: [['Good effort! We will see this one again.', '열심히 했어요! 이건 다시 만나요.']],
    skip: [['Sure, let\'s go to the next one.', '그래요, 다음으로 가요.']],
    review: [['Let\'s try the hard sentences once more.', '어려운 문장을 한 번 더 해 봐요.'], ['Review time! These were tricky.', '복습 시간! 이건 어려웠어요.']],
    bye: [['Well done, {name}! {stars} stars today. Bye for now!', '{name}, 잘했어요! 오늘 별 {stars}개. 안녕!'], ['That was fun, {name}! You got {stars} stars. See you!', '{name}, 재미있었어요! 별 {stars}개 받았어요. 또 봐요!']],
    byePerfect: [['Amazing, {name}! All {stars} stars! You are a superstar. Bye!', '대단해요, {name}! 별 {stars}개 전부! 슈퍼스타예요. 안녕!'], ['Perfect, {name}! Every star, all {stars}! See you next class!', '완벽해요, {name}! 별 {stars}개 모두! 다음 수업에 만나요!']],
    byeTry: [['Nice work, {name}! {stars} stars today. We will practice more next time!', '{name}, 잘했어요! 오늘 별 {stars}개. 다음엔 더 연습해요!'], ['Thanks for trying hard, {name}! {stars} stars. See you soon!', '{name}, 열심히 해 줘서 고마워요! 별 {stars}개. 또 만나요!']],
    praiseFirst: [['Your first star! Great start, {name}!', '첫 번째 별이에요! {name}, 좋은 출발!'], ['First star of the day! Well done.', '오늘의 첫 별! 잘했어요.'], ['There\'s your first star! Nice!', '첫 별을 받았어요! 좋아요!'], ['Star number one! Let\'s get more.', '별 하나! 더 모아 봐요.']],
    praiseComeback: [['Great comeback, {name}! First try this time.', '{name}, 멋지게 다시 해냈어요! 이번엔 한 번에!'], ['Back on track! Nice one.', '다시 잘하고 있어요! 좋아요.'], ['Yes! You bounced right back.', '네! 바로 다시 해냈어요.'], ['That\'s the spirit! First try.', '바로 그거예요! 한 번에 했어요.']]
  };
  Object.keys(MORE).forEach(function (k) { T[k] = (T[k] || []).concat(MORE[k]); });
  // 같은 반응이라도 매번 같은 말은 하지 않는다: 반응마다 따로 차례대로 돌려 쓴다(레슨마다 시작점이 다름).
  // 표 안에 똑같은 문장이 두 번 없으므로(하니스가 확인) 같은 말이 연달아 나올 수 없다.
  // 문장은 전부 위 표의 고정 문구라 AI 가 지어낼 자리가 없다.
  function seedOf(t) { var h = 0; t = String(t || ''); for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 1000003; return h; }
  function line(key, st, vars) {
    var list = T[key];
    function fill(s, ko) { return s.replace(/\{(\w+)\}/g, function (_, k) { if (ko && k === 'name' && st.nameKo) return st.nameKo; return vars && vars[k] != null ? vars[k] : (st[k] != null ? st[k] : ''); }); }
    if (!st.used) st.used = {};
    var n = st.used[key] || 0, idx = (seedOf(st.title) + n) % list.length;
    st.used[key] = n + 1;
    return { en: fill(list[idx][0]), ko: fill(list[idx][1], true), key: key };
  }
  // 맞혔을 때 칭찬 앞에 감탄사를 붙인다 — 감탄사는 따로 돌려 쓰므로 같은 감탄사가 연달아 나오지 않는다
  function withWow(sp, s) { var w = line('wow', s); return { en: w.en + ' ' + sp.en, ko: sp.ko ? w.ko + ' ' + sp.ko : w.ko, key: sp.key, wow: w.en }; }
  // 맞혔을 때 — 무엇을 어떻게 맞혔는지에 따라 칭찬을 고른다
  function praiseKey(st, s, sc) {
    if (st.review) return 'praiseReview';
    if (s.tries > 1) return 'praiseRetry';
    if (s.streak >= 3 && s.streak % 3 === 0) return 'praiseStreak';
    if (s.comeback) return 'praiseComeback';            // 바로 앞 문장을 놓쳤는데 이번엔 한 번에
    if (s.stars === 1) return 'praiseFirst';            // 오늘의 첫 별
    if (st.quiz) return 'praiseQuiz';
    if (st.mode === 'swap') return 'praiseSwap';
    if (st.mode === 'warm') return 'praiseWarm';
    if (st.mode === 'qa') return 'praiseQa';
    if (st.mode === 'solo') return 'praiseSolo';
    if (st.kind === 'word') return 'praiseWord';
    if (tokens(st.say).length >= 7 && sc >= 1) return 'praiseLong';
    return 'praise';
  }

  function create(unit, opts) {
    opts = opts || {};
    var plan = buildPlan(unit, opts);
    return {
      plan: plan, i: 0, phase: 'teacher', tries: 0, stars: 0, missed: [], done: 0, turn: 0,
      name: opts.name || 'friend', nameKo: opts.nameKo || opts.name || '', title: unit.title || 'Today\'s lesson',
      pages: (unit.pages || []).length, page: 0, view: 0, inReview: false, reviewLeft: 0, stage: 1,
      targets: plan.filter(function (s) { return s.t === 'repeat'; }).length, attempts: 0, streak: 0, used: {}, quietRun: 0, fwrong: 0, comeback: false
    };
  }
  function clone(s) { var c = {}; for (var k in s) c[k] = s[k]; c.missed = s.missed.slice(); c.plan = s.plan; c.used = Object.assign({}, s.used); return c; }
  function cur(s) { return s.plan[s.i]; }

  // 지금 단계를 «시작» 할 때 낼 효과
  function enter(s, out) {
    var st = cur(s);
    if (!st) { s.phase = 'done'; return; }
    s.turn++;
    if (st.stage && st.stage !== s.stage) { s.stage = st.stage; out.push({ stage: st.stage }); }
    if (st.t === 'greet') { out.push({ stage: 1 }, { speak: line('greet', s) }); s.phase = 'teacher'; return; }
    if (st.t === 'stage') {
      var key = st.stage === 4 ? (st.kind === 'qa' ? 'stage4qa' : 'stage4solo') : 'stage' + st.stage;
      out.push({ speak: line(key, s) }); s.phase = 'teacher'; return;
    }
    if (st.t === 'intro') { s.page = st.page; s.view = st.page; out.push({ page: st.page }, { speak: line('intro', s) }); s.phase = 'teacher'; return; }
    if (st.t === 'page') { s.page = st.page; s.view = st.page; out.push({ page: st.page }, { speak: line('page', s) }); s.phase = 'teacher'; return; }
    if (st.t === 'cheer') { out.push({ speak: line('cheer', s) }); s.phase = 'teacher'; return; }
    if (st.t === 'song') { s.page = st.page; s.view = st.page; out.push({ page: st.page }, { speak: line('songIntro', s) }, { song: { lines: st.lines, page: st.page } }, { speak: line('songOk', s) }); s.phase = 'teacher'; return; }
    if (st.t === 'find') { s.fwrong = 0; s.page = st.page; s.view = st.page; out.push({ page: st.page }, { speak: line('find', s, { w: st.word }), find: st.word }); s.phase = 'teacher'; return; }
    if (st.t === 'read') { out.push({ highlight: { page: st.page, line: st.line } }, { speak: { en: st.say, ko: '' }, voice: st.male ? 'm' : 'f' }); s.phase = 'teacher'; return; }
    if (st.t === 'repeat') {
      s.tries = 0;
      if (!st.prev) {
        if (s.page !== st.page) { s.page = st.page; s.view = st.page; out.push({ page: st.page }); }
        if (!st.quiz) out.push({ highlight: { page: st.page, line: st.line } });   // 질문은 정답 줄을 미리 짚지 않는다
      }
      if (st.mode === 'warm') out.push({ speak: line('warm', s) }, { speak: { en: st.say, ko: '' }, voice: st.male ? 'm' : 'f', target: st.say, show: st.say });
      else if (st.mode === 'qa') out.push({ speak: line('qa', s) }, { speak: { en: st.ask, ko: '' }, voice: st.askMale ? 'm' : 'f', target: st.say });
      else if (st.mode === 'ask') out.push({ speak: line('quizAsk', s) }, { speak: { en: st.ask, ko: '' }, voice: st.askMale ? 'm' : 'f', target: st.say, show: st.ask });
      else if (st.mode === 'blank') out.push({ speak: line('quizBlank', s) }, { speak: { en: st.spoken, ko: '' }, voice: 'f', target: st.say, show: st.shown });
      else if (st.mode === 'swap') out.push({ speak: line('swap', s) }, { speak: { en: st.say, ko: '' }, voice: st.male ? 'm' : 'f', target: st.say });
      else if (st.mode === 'solo') out.push({ speak: line('solo', s), target: st.say });   // 선생님이 먼저 읽어 주지 않는다
      else out.push({ speak: line(st.kind === 'word' ? 'word' : 'repeat', s) }, { speak: { en: st.say, ko: '' }, voice: st.male ? 'm' : 'f', target: st.say });
      s.phase = 'teacher'; return;
    }
    if (st.t === 'wrap') {
      if (!s.inReview && s.missed.length) {
        s.inReview = true;
        var again = s.missed.slice(0, MAX_REVIEW);
        var extra = again.map(function (m) { return { t: 'repeat', mode: m.mode === 'qa' || m.mode === 'ask' ? 'qa' : 'main', stage: 5, prev: m.prev, ask: m.ask, askMale: m.askMale, page: m.page, line: m.line, text: m.text, say: m.say, kind: m.kind, male: m.male, review: 1 }; });
        s.plan = s.plan.slice(0, s.i).concat(extra, [{ t: 'wrap' }]);
        s.missed = s.missed.slice(again.length);
        out.push({ speak: line('review', s) });
        enter(s, out); return;
      }
      out.push({ speak: line(s.stars >= s.targets ? 'byePerfect' : s.stars * 2 < s.targets ? 'byeTry' : 'bye', s), end: { stars: s.stars, targets: s.targets, missed: s.missed.length } });
      s.phase = 'ending'; return;
    }
  }
  function advance(s, out) { s.i++; enter(s, out); }

  function step(state, ev) {
    var s = clone(state), out = [], st = cur(s);
    // 규칙: out 에 말(speak)이 하나라도 있으면 바깥은 그것을 «전부» 말한 뒤 'spoken' 을 한 번 보냅니다.
    ev = ev || {};
    if (s.phase === 'done') return { state: s, out: out };
    switch (ev.type) {
      case 'start':
        if (s.i === 0 && s.turn === 0) enter(s, out);
        break;
      case 'spoken':                                      // 선생님이 말을 마침
        if (s.phase === 'ending') { s.phase = 'done'; out.push({ finished: true }); break; }
        if (s.phase !== 'teacher') break;
        if (s.pend) { s.pend = 0; enter(s, out); break; }
        if (!st) break;
        if (st.t === 'greet' || st.t === 'intro' || st.t === 'repeat' || st.t === 'find') { s.phase = 'await'; out.push({ listen: st.t === 'repeat' ? st.say : '*', find: st.t === 'find' ? st.word : undefined }); }
        else advance(s, out);
        break;
      case 'say':
      case 'silence':
        if (s.phase !== 'await' || !st) break;
        s.attempts++;
        var said = ev.type === 'say' ? String(ev.text || '') : '';
        if (st.t === 'find') {                                  // 찾기 놀이는 «누르기» 로 한다 — 말이나 침묵이면 선생님이 짚어 준다
          out.push({ highlight: { page: st.page, line: st.line } }, { speak: line('findShow', s, { w: st.word }), reply: 'findShow' });
          s.phase = 'teacher'; s.i++; s.pend = 1; break;
        }
        if (st.t === 'greet' || st.t === 'intro') {             // 자유 대답 — 맞고 틀림이 없고, 대답에 맞춰 되받는다
          var said1 = tokens(said).length > 0;
          if (st.t === 'greet') {
            var f = said1 ? feelOf(said) : null;
            out.push({ speak: f ? line(f.key, s, { w: f.word }) : line(said1 ? 'feelOther' : 'greetQuiet', s) }, { speak: line('today', s), reply: f ? f.key : (said1 ? 'other' : 'quiet') });
          } else {
            var ws = st.words || [], hit = null, tk = tokens(said);
            for (var a = 0; a < tk.length && !hit; a++) if (ws.indexOf(tk[a]) >= 0) hit = tk[a];
            if (hit) out.push({ speak: line('introSaw', s, { w: hit }), reply: 'saw', word: hit });
            else if (ws.length) out.push({ speak: line(said1 ? 'introOther' : 'introHint', s, { w: ws[0] }), reply: said1 ? 'other' : 'quiet', word: ws[0] });
            else out.push({ speak: line(said1 ? 'introOk' : 'introQuiet', s), reply: said1 ? 'other' : 'quiet' });
          }
          s.phase = 'teacher'; s.i++; s.pend = 1; break;
        }
        s.quietRun = ev.type === 'silence' ? (s.quietRun || 0) + 1 : 0;
        var sc = score(st.say, said), yn = st.personal ? yesNoOf(said) : '', miss = missingWords(st.say, said);
        // 빈칸 질문은 «빠진 낱말» 하나만 말해도 정답이다
        if (st.mode === 'blank' && st.blank && tokens(said).concat(looseTokens(said)).indexOf(st.blank) >= 0) { sc = Math.max(sc, 1); miss = []; }
        s.tries++;
        // 나에 대한 질문(Do you ...?) 에 «Yes/No» 로 자기 대답을 하면 그것도 맞는 대답이다
        var own = !!yn && sc < PASS && tokens(said).length >= 1;
        // 나에 대한 질문(«your favorite …?»)에 자기 이야기로 대답하면(질문의 뜻 있는 낱말을 넣어 3낱말 이상) 그것도 맞는 대답이다
        var ownTalk = !own && sc < PASS && (st.mode === 'ask' || st.mode === 'qa') && /\byou(r)?\b/i.test(st.ask || '') && tokens(said).length >= 3 && qaFits(st.ask, said);
        out.push({ result: { score: own || ownTalk ? 1 : sc, pass: own || ownTalk || sc >= PASS, text: st.say, said: said, missing: own || ownTalk ? [] : miss, own: own || ownTalk } });
        if (ownTalk) {
          s.stars++; s.streak = s.tries === 1 ? s.streak + 1 : 0; s.comeback = false;
          out.push({ star: s.stars }, { speak: withWow(line('ownAnswer', s), s), reply: 'ownTalk', praise: 'praiseQuiz' }, { speak: line('bookSays', s) }, { speak: { en: st.say, ko: '' }, voice: st.male ? 'm' : 'f' });
          s.phase = 'teacher'; s.i++; s.pend = 1;
        } else if (own) {
          s.stars++; s.streak = s.tries === 1 ? s.streak + 1 : 0; s.comeback = false;
          out.push({ star: s.stars }, { speak: withWow(line(yn === 'yes' ? 'personalYes' : 'personalNo', s), s), reply: 'own' }, { speak: line('bookSays', s) }, { speak: { en: st.say, ko: '' }, voice: st.male ? 'm' : 'f' });
          s.phase = 'teacher'; s.i++; s.pend = 1;
        } else if (sc >= PASS) {
          s.stars++; s.streak = s.tries === 1 ? s.streak + 1 : 0;
          var pk = praiseKey(st, s, sc); s.comeback = false;
          out.push({ star: s.stars }, { speak: withWow(line(pk, s, { n: s.streak, w: String(st.say).replace(/[.!?,]+$/, '') }), s), praise: pk });
          if (st.mode === 'swap' && st.answer) out.push({ speak: { en: st.answer, ko: '' }, voice: st.answerMale ? 'm' : 'f' });
          if (st.mode === 'blank') out.push({ speak: { en: st.say, ko: '' }, voice: st.male ? 'm' : 'f', show: st.say });   // 맞힌 뒤 문장 전체를 한 번 들려준다
          if (miss.length && st.kind !== 'word') out.push({ speak: line('passMissing', s, { w: miss.join(' ') }), reply: 'passMissing' });
          s.phase = 'teacher'; s.i++; s.pend = 1;
        } else if (s.tries >= MAX_TRIES) {
          s.streak = 0; s.comeback = true;
          if (!st.review) s.missed.push(st);
          out.push({ speak: line('move', s) });
          s.phase = 'teacher'; s.i++; s.pend = 1;
        } else {
          var partial = ev.type !== 'silence' && miss.length && miss.length < tokens(st.say).length && st.kind !== 'word';
          var key = ev.type === 'silence' ? (s.quietRun >= 2 ? 'checkIn' : 'quiet') : partial && s.tries === 1 ? 'missing' : (s.tries === 1 ? 'retry' : 'hint');
          if (st.mode === 'blank' && s.tries === 1) {      // 빈칸: 첫 번째엔 정답을 말하지 않고 첫 글자만 알려 준다
            out.push({ speak: line('blankHint', s, { c: st.blank.charAt(0) }), reply: 'blankHint' }, { speak: { en: st.spoken, ko: '' }, voice: 'f', rate: 0.85, target: st.say, show: st.shown });
          } else if (st.mode === 'ask' && s.tries === 1) { // 질문: 한 번 더 묻는다(정답은 두 번째에 들려준다)
            out.push({ speak: line(key, s, { w: miss.join(' ') }), reply: key }, { speak: { en: st.ask, ko: '' }, voice: st.askMale ? 'm' : 'f', rate: 0.85, target: st.say, show: st.ask });
          } else
          out.push({ speak: line(key, s, { w: miss.join(' ') }), reply: key }, { speak: { en: st.say, ko: '' }, voice: st.male ? 'm' : 'f', rate: s.tries >= 2 ? 0.7 : 0.85, target: st.say, bigText: s.tries >= 2 });
          s.phase = 'teacher';
        }
        break;
      case 'tap':                                         // 찾기 놀이 — 교재 문장을 눌렀다
        if (s.phase !== 'await' || !st || st.t !== 'find') break;
        s.attempts++;
        if ((ev.page == null || ev.page === st.page) && ev.line === st.line) {
          out.push({ highlight: { page: st.page, line: st.line } }, { speak: line('findOk', s, { w: st.word }), reply: 'findOk', praise: 'findOk' });
          s.phase = 'teacher'; s.i++; s.pend = 1;
        } else if (++s.fwrong >= 2) {
          out.push({ highlight: { page: st.page, line: st.line } }, { speak: line('findShow', s, { w: st.word }), reply: 'findShow' });
          s.phase = 'teacher'; s.i++; s.pend = 1;
        } else { out.push({ speak: line('findTry', s, { w: st.word }), reply: 'findTry' }); s.phase = 'teacher'; }
        break;
      case 'skip':
        if (s.phase !== 'await' || !st) break;
        if (st.t === 'greet' || st.t === 'intro') { out.push({ speak: line(st.t === 'greet' ? 'greetQuiet' : 'introQuiet', s) }); s.phase = 'teacher'; s.i++; s.pend = 1; break; }
        if (st.t === 'find') { out.push({ highlight: { page: st.page, line: st.line } }, { speak: line('findShow', s, { w: st.word }), reply: 'findShow' }); s.phase = 'teacher'; s.i++; s.pend = 1; break; }
        if (st.t !== 'repeat') break;
        if (!st.review) s.missed.push(st);
        s.streak = 0; s.comeback = false;
        out.push({ speak: line('skip', s) });
        s.phase = 'teacher'; s.i++; s.pend = 1;
        break;
      case 'replay':
        if (s.phase === 'await' && st && st.t === 'repeat') out.push({ speak: { en: st.mode === 'qa' || st.mode === 'ask' ? st.ask : st.mode === 'blank' ? st.spoken : st.say, ko: '' }, voice: (st.mode === 'qa' || st.mode === 'ask' ? st.askMale : st.mode === 'blank' ? false : st.male) ? 'm' : 'f', rate: ev.slow ? 0.7 : 1, target: st.say, replay: true });
        break;
      case 'browse':
        var p = Math.max(0, Math.min(s.pages - 1, ev.page | 0)); s.view = p; out.push({ view: p });
        break;
      case 'follow':
        s.view = s.page; out.push({ view: s.page });
        break;
    }
    return { state: s, out: out };
  }

  // 바로 앞 레슨(같은 권·같은 시리즈일 때만) — «시작» 단계에서 지난 시간 문장을 다시 말하게 할 때 쓴다
  function seriesOf(u) { var b = String(u && u.book || ''); var m = b.match(/^(BTS \d+|NEW SIU (?:BASIC|ADVANCE))\b/i); return m ? m[1].toUpperCase() : ''; }
  function prevUnitOf(units, k) { var a = units[k], b = units[k - 1]; return a && b && seriesOf(a) && seriesOf(a) === seriesOf(b) ? b : null; }

  var api = { qaFits: qaFits, isFirstLesson: isFirstLesson, isHelloSong: isHelloSong, blankOf: blankOf, feelOf: feelOf, missingWords: missingWords, pageWords: pageWords, isPersonalQ: isPersonalQ, STAGES: STAGES, prevUnitOf: prevUnitOf, create: create, step: step, buildPlan: buildPlan, score: score, tokens: tokens, kindOf: kindOf, speakable: speakable, MAX_REPEAT: MAX_REPEAT, MAX_TRIES: MAX_TRIES, PASS: PASS, MAX_REVIEW: MAX_REVIEW, T: T, praiseKey: praiseKey, MAX_FIND: MAX_FIND };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AiClass = api;
})(this);
