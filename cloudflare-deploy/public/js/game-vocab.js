/* ════════════════════════════════════════════════════════════════════════
 *  🎮 MangoiGameVocab — 학생게임 맞춤 출제 공용 로더
 *  로그인 학생의 교재/레벨에 맞는 문장·단어를 워커(/api/games/vocab)에서 받아
 *  게임들의 하드코딩 어휘(_GAME_VOCAB/_GAME_WORDS 등)를 대체한다.
 *  · 사용: MangoiGameVocab.load().then(function(d){ if(d){ ... } })
 *      d = { textbook, level, student, sentences:[{en,ko,words[]}], words:[{en,ko}] }
 *      (로그인 안 됨 / 서버 실패 / 데이터 없음 → null — 게임은 기본 어휘로 폴백)
 *  · sessionStorage 10분 캐시로 게임 재시작마다 재요청하지 않는다.
 * ════════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  var CACHE_KEY = 'mangoi_game_vocab_v1';
  var CACHE_MS = 10 * 60 * 1000;

  function getUserId(){
    try{ var u = JSON.parse(localStorage.getItem('mangoi_logged_user') || 'null');
      if(u && (u.uid || u.user_id)) return String(u.uid || u.user_id); }catch(_){}
    try{ var v = JSON.parse(localStorage.getItem('mango_user') || 'null');
      if(v && (v.user_id || v.uid)) return String(v.user_id || v.uid); }catch(_){}
    return '';
  }

  // 영어 문장 → 게임용 단어 배열 (구두점 제거, 어퍼스트로피 보존)
  function tokenize(en){
    return String(en || '').replace(/[^A-Za-z' ]/g, ' ').split(/\s+/).filter(Boolean);
  }

  function normalize(d){
    var sentences = [];
    (d.sentences || []).forEach(function(s){
      var en = String((s && s.en) || '').trim();
      var words = tokenize(en);
      if(words.length >= 3 && words.length <= 9){
        sentences.push({ en: en, ko: String((s && s.ko) || '').trim(), words: words });
      }
    });
    var words = [];
    (d.words || []).forEach(function(w){
      var en = String((w && w.en) || '').trim(), ko = String((w && w.ko) || '').trim();
      if(en && ko) words.push({ en: en, ko: ko });
    });
    if(!sentences.length && !words.length) return null;   // 쓸 데이터가 없으면 폴백
    return {
      textbook: String(d.textbook || ''), level: String(d.level || ''),
      student: String(d.student_name || ''), sentences: sentences, words: words
    };
  }

  var _inflight = null;
  function load(){
    var uid = getUserId();
    if(!uid) return Promise.resolve(null);
    try{
      var c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if(c && c.uid === uid && (Date.now() - c.at) < CACHE_MS) return Promise.resolve(c.data);
    }catch(_){}
    if(_inflight) return _inflight;
    _inflight = fetch('/api/games/vocab?user_id=' + encodeURIComponent(uid))
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){
        _inflight = null;
        if(!d || !d.ok) return null;
        var data = normalize(d);
        try{ sessionStorage.setItem(CACHE_KEY, JSON.stringify({ uid: uid, at: Date.now(), data: data })); }catch(_){}
        return data;
      })
      .catch(function(){ _inflight = null; return null; });
    return _inflight;
  }

  window.MangoiGameVocab = { load: load, getUserId: getUserId, tokenize: tokenize };
})();
