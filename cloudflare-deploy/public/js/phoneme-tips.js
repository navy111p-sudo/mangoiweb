/* ═══════════════════════════════════════════════════════════════════════
   🔍 phoneme-tips.js — «어느 소리가 약했나» 한 줄 처방 (2026-10-18, 개선안 1순위 ①)
   Azure 발음평가는 음소(phoneme)까지 점수를 주는데, 지금까지는 «단어 점수» 까지만 썼다.
   그래서 화면이 «right 를 다시 해 봐요» 라고만 하고 «r 소리가 약했어요» 를 못 말했다.

   ⛔ 지어내지 않는다 — 표에 없는 소리, 영어가 아닌 단어, 점수가 충분한 소리는 null.
      (모르는 소리에 «천천히 해 보세요» 같은 빈말을 붙이면 처방처럼 보이지만 아무것도 안 알려 준다)
   ⛔ «가장 약한 한 곳» 만 — 여러 개를 늘어놓으면 의욕이 꺾인다(speech-coach 단어 지도와 같은 규칙).
   ⚠️ 음소 이름은 Azure 기본(SAPI: th·dh·r·ae …)과 IPA(θ·ð·ɹ·æ …) 둘 다 받는다 — 설정에 따라 갈린다.
   ⚠️ 팁은 한국어 화자에게 흔한 어려움 위주로 손으로 쓴 것이다(그대로 따라 할 수 있게 결정론).
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  if (window.MangoPhonemeTips) return;

  /** 이 점수 미만인 소리만 짚는다(단어 지도 «아쉬움» 경계와 같은 60) */
  var WEAK = 60;

  // [표시 이름, 한국어 팁, 영어 팁]
  var T = {
    r:  ['r',  '혀끝이 입천장에 닿지 않게, 혀를 뒤로 살짝 말아요 (우~r).', 'Curl your tongue back slightly — don\'t let the tip touch the roof of your mouth.'],
    l:  ['l',  '혀끝을 윗니 뒤 잇몸에 꼭 붙였다 떼요.', 'Press the tip of your tongue to the ridge behind your top teeth.'],
    th: ['th', '혀끝을 윗니와 아랫니 사이에 살짝 내밀고 바람을 내보내요 (ㅆ 아님).', 'Put your tongue tip between your teeth and blow air out softly.'],
    dh: ['th', '혀끝을 이 사이에 내밀고 목을 울리며 소리 내요 (this, the).', 'Tongue tip between your teeth, and use your voice (as in this, the).'],
    f:  ['f',  '윗니를 아랫입술에 살짝 대고 바람을 내보내요 (ㅍ 아님).', 'Rest your top teeth on your lower lip and blow air.'],
    v:  ['v',  '윗니를 아랫입술에 대고 목을 울려요 (ㅂ 아님).', 'Top teeth on your lower lip, and use your voice (not b).'],
    z:  ['z',  '«스»를 내면서 목을 울려 벌이 나는 소리처럼 «즈~».', 'Make an s sound but use your voice, like a buzzing bee.'],
    sh: ['sh', '입술을 앞으로 둥글게 내밀고 «쉬~».', 'Round your lips and push them forward: shhh.'],
    zh: ['zh', '입술을 둥글게 내밀고 목을 울려 «쥐~» (vision).', 'Round your lips and use your voice (as in vision).'],
    jh: ['j',  '«쥐»처럼 짧게 터뜨려요, 입술을 살짝 내밀고.', 'A short burst like "j" in jump, lips a little forward.'],
    ae: ['a',  '입을 위아래로 크게 벌리고 «애»와 «아» 사이로 (cat, apple).', 'Open your mouth wide — between "e" and "a" (as in cat).'],
    ih: ['i',  '짧고 힘을 뺀 «이» — «이~» 로 길게 끌지 않아요 (sit).', 'A short, relaxed "i" — don\'t stretch it (as in sit).'],
    iy: ['ee', '입꼬리를 옆으로 당기고 «이~» 길게 (see).', 'Smile and hold a long "ee" (as in see).'],
    uh: ['oo', '짧고 힘을 뺀 «우» (book, good).', 'A short, relaxed "oo" (as in book).'],
    uw: ['oo', '입술을 둥글게 모으고 «우~» 길게 (food).', 'Round your lips and hold a long "oo" (as in food).'],
    er: ['er', '혀를 뒤로 말고 «어r» — 끝에 r 소리를 남겨요 (bird).', 'Curl your tongue back and keep the r sound (as in bird).'],
    w:  ['w',  '입술을 작게 동그랗게 모았다가 펴요 (우-워).', 'Start with small round lips, then open (oo-wa).'],
    ng: ['ng', '«응» 받침처럼 혀 뒤쪽을 올려 코로 소리 내요 (sing).', 'Raise the back of your tongue and hum through your nose (as in sing).'],
    p:  ['p',  '입술을 닫았다 «프» 하고 바람이 나오게 터뜨려요.', 'Close your lips, then pop them open with a puff of air.'],
    b:  ['b',  '입술을 닫았다가 목을 울리며 열어요 (ㅃ 처럼 세게 말고).', 'Close your lips and open them using your voice.'],
  };
  // IPA 기호 → 위 이름
  var IPA = { 'ɹ':'r','r':'r','l':'l','θ':'th','ð':'dh','f':'f','v':'v','z':'z','ʃ':'sh','ʒ':'zh','dʒ':'jh','ʤ':'jh',
    'æ':'ae','ɪ':'ih','i':'iy','iː':'iy','ʊ':'uh','u':'uw','uː':'uw','ɝ':'er','ɚ':'er','w':'w','ŋ':'ng','p':'p','b':'b' };

  function key(ph){
    var s = String(ph == null ? '' : ph).trim();
    if (!s) return null;
    var low = s.toLowerCase();
    if (T[low]) return low;
    if (IPA[low]) return IPA[low];
    return null;
  }

  /* 🇰🇷 (2026-10-18 개선안 2순위 ⑦) 자음이 붙은 자리 — «스-트-리트» 처럼 사이에 «으» 를 끼워 넣는 것.
     Azure 는 «모음을 끼워 넣었다» 를 따로 알려 주지 않는다. 그래서 «끼워 넣었다» 고 단정하지 않고,
     «붙은 자음 자리가 약했다» 는 사실 + 한국어 화자에게 가장 흔한 원인에 대한 팁만 준다.
     ⛔ 음소만 보고 정하지 않는다 — 철자에도 자음이 붙어 있어야 한다(가짜 «자음 둘» 을 막는 두 번째 겹).
     ⚠️ 표(T)에 있는 소리(r·l·th …)가 가장 약하면 그 소리 팁이 이긴다 — 더 구체적이기 때문이다. */
  var CONS = { b:1,ch:1,d:1,dh:1,f:1,g:1,hh:1,jh:1,k:1,l:1,m:1,n:1,ng:1,p:1,r:1,s:1,sh:1,t:1,th:1,v:1,w:1,y:1,z:1,zh:1 };
  var IPA_CONS = { 'tʃ':'ch','ð':'dh','ɡ':'g','h':'hh','dʒ':'jh','ʤ':'jh','ŋ':'ng','ɹ':'r','ʃ':'sh','θ':'th','j':'y','ʒ':'zh' };
  var SPELL_CLUSTER = /(st|sp|sk|sc|sl|sm|sn|sw|pl|pr|bl|br|cl|cr|dr|fl|fr|gl|gr|tr|tw|nd|nt|nk|mp|lt|ld|lk|ft|pt|ct|ts|ps|ks|ds)/;
  var CLUSTER_TIP = ['자음이 붙은 곳은 사이에 «으» 를 넣지 말고 한 번에 이어요 (street 은 «스트리트» 가 아니라 한 덩어리).',
                     'Where consonants sit together, glide straight from one to the next — no extra "uh" in between (street, not "suh-tree-tuh").'];
  function consName(ph){
    var s = String(ph == null ? '' : ph).trim().toLowerCase();
    if (!s) return null;
    if (CONS[s]) return s;
    if (IPA_CONS[s]) return IPA_CONS[s];
    if (s.length === 1 && 'bdfgklmnprstvwz'.indexOf(s) >= 0) return s;
    return null;
  }

  /** 단어 목록에서 «가장 약한 소리 하나». 없으면 null. */
  function weakest(words){
    var best = null;
    (Array.isArray(words) ? words : []).forEach(function(w){
      if (!w || !w.word) return;
      var et = String(w.errorType || '');
      if (et === 'Omission' || et === 'Insertion') return;
      if (!/^[a-z][a-z']*$/i.test(String(w.word))) return;           // 영어 단어만
      (Array.isArray(w.phonemes) ? w.phonemes : []).forEach(function(p){
        if (!p) return;
        var acc = Number(p.acc);
        if (!isFinite(acc) || acc >= WEAK) return;
        var k = key(p.p);
        if (!k) return;
        if (!best || acc < best.acc) best = { word: String(w.word), phoneme: k, acc: Math.round(acc) };
      });
      // 붙은 자음 자리 — 표에 없는 자음(s·t·k …)도 여기서는 본다(팁이 «자리» 에 대한 것이라서)
      var ps = Array.isArray(w.phonemes) ? w.phonemes : [];
      if (!SPELL_CLUSTER.test(String(w.word).toLowerCase())) return;
      for (var i = 0; i < ps.length; i++) {
        var cur = ps[i]; if (!cur) continue;
        var acc2 = Number(cur.acc), c = consName(cur.p);
        if (!c || !isFinite(acc2) || acc2 >= WEAK) continue;
        if (key(cur.p)) continue;                                        // 표에 있는 소리는 위에서 그 팁으로
        var prev = i > 0 && ps[i-1] ? consName(ps[i-1].p) : null;
        var next = i + 1 < ps.length && ps[i+1] ? consName(ps[i+1].p) : null;
        if (!prev && !next) continue;                                    // 붙은 자리가 아니다
        if (!best || acc2 < best.acc) best = { word: String(w.word), phoneme: 'cluster', acc: Math.round(acc2),
          pair: (prev ? prev + '·' + c : c + '·' + next) };
      }
    });
    if (!best) return null;
    if (best.phoneme === 'cluster') return { word: best.word, phoneme: 'cluster', label: best.pair, acc: best.acc, tipKo: CLUSTER_TIP[0], tipEn: CLUSTER_TIP[1] };
    var t = T[best.phoneme];
    return { word: best.word, phoneme: best.phoneme, label: t[0], acc: best.acc, tipKo: t[1], tipEn: t[2] };
  }

  /** 화면 한 줄(HTML). esc 는 호출부의 이스케이프 함수를 받는다. 없으면 ''. */
  function line(words, en, esc){
    var r = weakest(words);
    if (!r) return '';
    var e = typeof esc === 'function' ? esc : function(s){ return String(s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); };
    return en
      ? '🔍 In <b>' + e(r.word) + '</b>, the <b>/' + e(r.label) + '/</b> sound was weak. ' + e(r.tipEn)
      : '🔍 <b>' + e(r.word) + '</b> 의 <b>/' + e(r.label) + '/</b> 소리가 약했어요. ' + e(r.tipKo);
  }

  window.MangoPhonemeTips = { WEAK: WEAK, key: key, weakest: weakest, line: line };
})();
