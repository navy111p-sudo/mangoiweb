/* ═══════════════════════════════════════════════════════════════════════════
   📚 StoryKit — A.i 동화책 4편이 «함께» 쓰는 도구 (2026-10-13 원장님 의견 1·4번)
   ① review(a, b, slots, extraWords) — ⑥ 바꿔 쓰기 문장 «규칙 점검»
      · 'vp' 칸(Let’s ___ / I can’t ___): 동사 원래 모양이어야 함 — goes·going·went·to go → go
      · 'cl' 칸(before ___ / because ___ / so that ___): «주어 + 동사» — it rain → it rains,
        it raining → it is raining, they goes → they go, he are → he is
      · 철자: 사전(window.StoryDict — js/story-dict.js, defer)에 없는 낱말 중 «한 글자 차이 후보가 하나뿐» 일 때만 제안
      ⛔ 확신이 없으면 건드리지 않습니다(모르는 낱말·모르는 주어는 그대로). 틀린 «교정» 은 교정이 없는 것보다 나쁩니다.
      ⛔ 이 결과는 AI 가 아니라 규칙입니다 — 같은 입력이면 언제나 같은 답(하니스가 실제로 돌립니다).
   ② STORY_WORD_POOL — 4편 핵심단어의 한국어 뜻(뜻 맞히기 «다른 책 오답 보기» 용)
      ⚠️ 각 페이지 WORDS 와 «같은 글자» 여야 합니다(story_kit_harness 가 대조합니다).
   이 파일은 동화책 페이지가 «blocking» 으로 싣습니다(첫 화면 예산과 무관한 페이지).
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var BASE = ('go come do have be make take give get put eat drink sleep run walk play read write sing dance draw ' +
    'swim ride cook clean finish start stop help call ask tell say see look watch listen hear talk speak ' +
    'open close turn wash brush wait stay sit stand jump climb fly find lose win buy sell bring carry send ' +
    'try study learn teach work rain snow grow plant water feed visit meet leave arrive return use save share ' +
    'love like want need know think feel smile laugh cry shout move keep pick throw catch kick hit cut dig fix ' +
    'build paint bake fall spin bow blink practice borrow hide hope plan shop jog clap drop wear sweep ' +
    'turn hold push pull pack fill wake dress change check count follow hurry miss mix pour roll touch try').split(' ');
  var IRR_PAST = { go:'went', come:'came', do:'did', have:'had', make:'made', take:'took', give:'gave', get:'got',
    eat:'ate', drink:'drank', sleep:'slept', run:'ran', read:'read', write:'wrote', sing:'sang', draw:'drew', swim:'swam',
    ride:'rode', put:'put', see:'saw', hear:'heard', tell:'told', say:'said', speak:'spoke', sit:'sat', stand:'stood',
    find:'found', lose:'lost', win:'won', buy:'bought', sell:'sold', bring:'brought', send:'sent', teach:'taught',
    grow:'grew', feed:'fed', meet:'met', leave:'left', know:'knew', think:'thought', feel:'felt', keep:'kept',
    throw:'threw', catch:'caught', hit:'hit', cut:'cut', dig:'dug', build:'built', fall:'fell', spin:'spun', hide:'hid',
    fly:'flew', wear:'wore', sweep:'swept', hold:'held', wake:'woke' };
  var DOUBLE = { run:1, swim:1, sit:1, get:1, put:1, stop:1, shop:1, cut:1, hit:1, dig:1, win:1, plan:1, jog:1, clap:1, drop:1, spin:1 };
  var SUBJ = { i:'1', we:'p', you:'p', they:'p', he:'3', she:'3', it:'3' };
  var DET = { my:1, your:1, his:1, her:1, our:1, their:1, the:1, a:1, an:1, this:1, that:1 };
  var BE = { am:1, is:1, are:1, was:1, were:1 };
  var AUX = { am:1, is:1, are:1, was:1, were:1, do:1, does:1, did:1, can:1, could:1, will:1, would:1, should:1,
    must:1, may:1, might:1, "can't":1, "don't":1, "doesn't":1, "didn't":1, "won't":1, has:1, have:1, had:1 };

  function third(v){ if (v === 'have') return 'has'; if (v === 'be') return 'is'; if (/(s|sh|ch|x|z|o)$/.test(v)) return v + 'es'; if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ies'; return v + 's'; }
  function ing(v){ if (v === 'be') return 'being'; if (/ie$/.test(v)) return v.slice(0, -2) + 'ying'; if (DOUBLE[v]) return v + v.slice(-1) + 'ing'; if (/[^e]e$/.test(v)) return v.slice(0, -1) + 'ing'; return v + 'ing'; }
  function past(v){ if (IRR_PAST[v]) return IRR_PAST[v]; if (DOUBLE[v]) return v + v.slice(-1) + 'ed'; if (/e$/.test(v)) return v + 'd'; if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ied'; return v + 'ed'; }

  var BASESET = {}, F3 = {}, FING = {}, FPAST = {};
  BASE.forEach(function(v){ BASESET[v] = 1; });
  BASE.forEach(function(v){
    var t = third(v), g = ing(v), p = past(v);
    if (!BASESET[t]) F3[t] = v; if (!BASESET[g]) FING[g] = v; if (!BASESET[p] && p !== v) FPAST[p] = v;
  });
  F3.is = 'be'; F3.are = 'be'; F3.am = 'be'; FPAST.was = 'be'; FPAST.were = 'be';

  function words(s){ return String(s == null ? '' : s).replace(/[’]/g, "'").trim().split(/\s+/).filter(Boolean); }
  function low(w){ return String(w).toLowerCase().replace(/[.,!?;:"“”]+$/g, ''); }
  function beFor(p, pastForm){ return pastForm ? (p === 'p' ? 'were' : 'was') : (p === '1' ? 'am' : p === 'p' ? 'are' : 'is'); }

  // 'vp' — 첫 낱말은 동사 원래 모양
  function checkVP(w, slot, out){
    if (!w.length) return w;
    var l0 = low(w[0]);
    if (SUBJ[l0] && w.length > 1 && (BASESET[low(w[1])] || F3[low(w[1])] || FING[low(w[1])] || FPAST[low(w[1])])) {
      out.push({ slot: slot, kind: 'grammar', from: w[0], to: '', ko: '이 자리에는 «누가» 를 쓰지 않아요. 바로 «무엇을 할지» 동사로 시작해요.', en: 'No subject here. Start with the verb.' });
      w = w.slice(1); l0 = low(w[0]);
    }
    if (l0 === 'to' && w.length > 1 && BASESET[low(w[1])]) {
      out.push({ slot: slot, kind: 'grammar', from: 'to ' + w[1], to: w[1], ko: '«to» 없이 동사만 써요. (to go → go)', en: 'Drop “to”: to go → go.' });
      return w.slice(1);
    }
    var base = F3[l0] || FING[l0] || FPAST[l0];
    if (base) {
      out.push({ slot: slot, kind: 'grammar', from: w[0], to: base, ko: '«' + w[0] + '» 는 동사의 원래 모양 «' + base + '» 로 써요.', en: 'Use the base form: ' + w[0] + ' → ' + base + '.' });
      w = w.slice(); w[0] = base;
    }
    return w;
  }

  // 'cl' — 주어 + 동사
  function checkCL(w, slot, out){
    if (w.length < 2) return w;
    var l = w.map(low), sp = null, k = -1;
    if (SUBJ[l[0]]) { sp = SUBJ[l[0]]; k = 1; }
    else if (DET[l[0]] && w.length >= 3 && !AUX[l[1]] && !BE[l[1]] && !BASESET[l[1]] && !F3[l[1]] && !FING[l[1]] && !FPAST[l[1]]) { sp = plural(l[1]) ? 'p' : '3'; k = 2; }
    // 이름(사전에 없는 대문자 낱말)·가족 호칭(Mom 등)만 «주어» 로 봅니다 — 소문자 낱말을 주어로 짐작하면
    // «Hard work and …»·«Never give up» 같은 맞는 문장을 고칩니다(교재 2,887문장 실측으로 확인).
    else if (isName(w[0], l[0]) && l[1] && BASE_OR_FORM(l[1])) { sp = '3'; k = 1; }
    if (k < 0 || k >= w.length) return w;
    var v = l[k];
    w = w.slice();
    if (BE[v]) {
      var wantBe = beFor(sp, v === 'was' || v === 'were');
      if (v !== wantBe) { out.push({ slot: slot, kind: 'grammar', from: w[k], to: wantBe, ko: '«' + w[k - 1] + '» 에는 «' + wantBe + '» 를 써요.', en: 'Use “' + wantBe + '” with “' + w[k - 1] + '”.' }); w[k] = wantBe; }
      return w;
    }
    if (AUX[v]) return w;
    if (FING[v]) {
      var b = beFor(sp, false);
      out.push({ slot: slot, kind: 'grammar', from: w[k], to: b + ' ' + w[k], ko: '«-ing» 앞에는 «' + b + '» 가 있어야 해요. (' + w[k - 1] + ' ' + b + ' ' + w[k] + ')', en: 'Add “' + b + '” before the -ing word.' });
      w.splice(k, 0, b); return w;
    }
    // read·put·cut 처럼 과거형이 원형과 같은 동사는 «과거» 일 수 있어 s 를 붙이지 않습니다.
    if (sp === '3' && BASESET[v] && past(v) !== v) {
      var t = third(v);
      out.push({ slot: slot, kind: 'grammar', from: w[k], to: t, ko: '«' + w[k - 1] + '» 처럼 한 사람·한 개일 때는 동사에 s 를 붙여요. (' + v + ' → ' + t + ')', en: 'Add s for one person or thing: ' + v + ' → ' + t + '.' });
      w[k] = t; return w;
    }
    if ((sp === 'p' || sp === '1') && F3[v] && F3[v] !== 'be') {
      out.push({ slot: slot, kind: 'grammar', from: w[k], to: F3[v], ko: '«' + w[k - 1] + '» 뒤에는 s 없는 «' + F3[v] + '» 를 써요.', en: 'No s after “' + w[k - 1] + '”: ' + v + ' → ' + F3[v] + '.' });
      w[k] = F3[v]; return w;
    }
    return w;
  }
  var FAMILY = { mom:1, dad:1, mommy:1, daddy:1, grandma:1, grandpa:1, grandmother:1, grandfather:1 };
  var IRR_PL = { women:1, men:1, children:1, people:1, feet:1, teeth:1, mice:1, geese:1 };
  function plural(n){ return !!IRR_PL[n] || (/s$/.test(n) && !/(ss|us|is)$/.test(n)); }
  function isName(orig, l0){
    if (!/^[A-Z][a-z]+$/.test(String(orig))) return false;
    if (FAMILY[l0]) return true;
    var D = dict(); return !!D && !D[l0];
  }
  function BASE_OR_FORM(x){ return !!(BE[x] || BASESET[x] || F3[x] || FING[x] || FPAST[x]); }

  // 철자 — 사전 + 이 페이지 낱말 + 동사 변화형
  var DICT = null;
  function dict(){
    if (DICT) return DICT;
    if (!root.StoryDict) return null;
    DICT = {};
    String(root.StoryDict).split(' ').forEach(function(x){ DICT[x] = 1; });
    BASE.forEach(function(v){ DICT[v] = 1; DICT[third(v)] = 1; DICT[ing(v)] = 1; DICT[past(v)] = 1; });
    return DICT;
  }
  var ABC = 'abcdefghijklmnopqrstuvwxyz';
  // 한 글자 차이 후보를 «종류별» 로 — 아이들은 글자를 «빠뜨리는» 실수가 가장 많아 순서를 그렇게 둡니다.
  function edits1(w){
    var tr = {}, ins = {}, sub = {}, del = {}, i, c;
    for (i = 0; i < w.length - 1; i++) tr[w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2)] = 1;
    for (i = 0; i <= w.length; i++) for (c = 0; c < 26; c++) ins[w.slice(0, i) + ABC[c] + w.slice(i)] = 1;
    for (i = 0; i < w.length; i++) for (c = 0; c < 26; c++) sub[w.slice(0, i) + ABC[c] + w.slice(i + 1)] = 1;
    for (i = 0; i < w.length; i++) del[w.slice(0, i) + w.slice(i + 1)] = 1;
    return [tr, ins, sub, del].map(function(o){ delete o[w]; return Object.keys(o); });
  }
  function known(x, D, extra){ return !!(D[x] || extra[x] || (/s$/.test(x) && (D[x.slice(0, -1)] || extra[x.slice(0, -1)])) || (/es$/.test(x) && D[x.slice(0, -2)]) || (/ed$/.test(x) && (D[x.slice(0, -2)] || D[x.slice(0, -1)])) || (/ing$/.test(x) && (D[x.slice(0, -3)] || D[x.slice(0, -3) + 'e'])) || (/ly$/.test(x) && D[x.slice(0, -2)]) || (/'s$/.test(x) && D[x.slice(0, -2)])); }
  function spell(w, slot, extra, out){
    var D = dict(); if (!D) return w;
    return w.map(function(orig){
      var m = String(orig).match(/^([A-Za-z']+)([.,!?]*)$/); if (!m) return orig;
      if (/^[A-Z]/.test(m[1])) return orig;            // 이름·고유명사는 건드리지 않음
      var x = m[1].toLowerCase();
      if (x.length < 3 || known(x, D, extra)) return orig;
      // ⛔ 후보가 «딱 하나» 로 정해질 때만 고칩니다. 모르는 낱말(사전에 없을 뿐 맞는 낱말)일 수 있어 «확인해 보세요» 도 띄우지 않습니다.
      // ⚠️ «뒤바뀐 글자»(freinds)·«빠진 글자»(homwork) 만 고칩니다. 바꾼 글자·남는 글자 후보는 맞는 낱말을 엉뚱하게 바꿉니다
      //    (실측: 사전에 없는 tail → tall). 그리고 4글자 이상일 때만.
      var groups = x.length >= 4 ? edits1(x).slice(0, 2) : [], pick = null;
      for (var gi = 0; gi < groups.length && !pick; gi++) {
        var c = groups[gi].filter(function(y){ return D[y] || extra[y]; });
        if (c.length === 1) pick = c[0];
        else if (c.length > 1) break;
      }
      if (pick) {
        out.push({ slot: slot, kind: 'spell', from: m[1], to: pick, ko: '철자 확인: «' + m[1] + '» → «' + pick + '»', en: 'Spelling: ' + m[1] + ' → ' + pick });
        return pick + m[2];
      }
      return orig;
    });
  }

  function review(a, b, slots, extraWords){
    var extra = {};
    (extraWords || []).forEach(function(x){ String(x).toLowerCase().replace(/’/g, "'").split(/[^a-z']+/).forEach(function(y){ if (y) extra[y] = 1; }); });
    var issues = [], parts = [a, b];
    var fixed = parts.map(function(p, i){
      var w = words(p);
      w = spell(w, i, extra, issues);
      w = (slots && slots[i] === 'vp') ? checkVP(w, i, issues) : checkCL(w, i, issues);
      return w.join(' ');
    });
    var grammar = issues.filter(function(x){ return x.kind === 'grammar'; }).length;
    return { issues: issues, grammar: grammar, a: fixed[0], b: fixed[1], changed: fixed[0] !== words(a).join(' ') || fixed[1] !== words(b).join(' ') };
  }

  // 뜻 맞히기 «다른 책 오답 보기» — 4편 WORDS 의 한국어 뜻(같은 글자여야 함)
  var STORY_WORD_POOL = {
    'red-umbrella': ['우산', '벤치, 긴 의자', '손잡이', '제빵사, 빵 굽는 사람', '걱정하는', '(비가) 세찬, 무거운'],
    'birthday-cake': ['깜짝 놀랄 일, 깜짝 파티', '(빵·과자) 부스러기', '탐정', '단서, 실마리', '대신에', '손님들'],
    'robot-dance': ['포스터, 벽보', '연습하다', '(불빛이) 깜빡이다', '빙글빙글 돌다', '구석', '(고개 숙여) 인사하다'],
    'treasure-map': ['빌리다', '선반, 책꽂이 칸', '그림자', '삽', '정원사', '미래']
  };
  function poolFor(id){
    var out = [];
    Object.keys(STORY_WORD_POOL).forEach(function(k){ if (k !== id) out = out.concat(STORY_WORD_POOL[k]); });
    return out;
  }

  // ── 2단계(2026-10-13): AI 한 번 더 보기 · 강사용 기록 — 서버 정본 src/story-correct.ts ──
  //    POST /api/ai/write-history { action:'story_fix' | 'story_log' } (이미 등록된 경로의 비어 있는 POST)
  //    ⛔ AI 가 못 보면 «틀린 곳 없음» 이 아니라 'unavailable' — 화면이 «지금은 확인하지 못했어요» 라고 말합니다.
  //    ⛔ 학생 아이디는 «기록» 에만 실리고 그것도 토큰이 맞을 때만 서버가 저장합니다.
  var AI_URL = '/api/ai/write-history', AI_TIMEOUT = 8000;
  function ls(k){ try { return root.localStorage ? root.localStorage.getItem(k) : null; } catch(e){ return null; } }
  function device(){
    var d = ls('mangoi_story_dev');
    if (!d) { d = 'sd_' + Math.random().toString(36).slice(2, 12); try { root.localStorage.setItem('mangoi_story_dev', d); } catch(e){} }
    return d;
  }
  function who(){
    var keys = ['mangoi_logged_user', 'mango_user'];
    for (var i = 0; i < keys.length; i++) {
      try { var a = JSON.parse(ls(keys[i]) || 'null'); if (a && (a.uid || a.user_id || a.id)) return String(a.uid || a.user_id || a.id); } catch(e){}
    }
    return '';
  }
  function post(body, ms){
    if (!root.fetch) return Promise.resolve(null);
    var ctl = root.AbortController ? new root.AbortController() : null, to = setTimeout(function(){ if (ctl) ctl.abort(); }, ms || AI_TIMEOUT);
    var tok = ls('mango_token') || '', headers = { 'Content-Type': 'application/json' };
    if (tok) headers.Authorization = 'Bearer ' + tok;
    // ⏱ AbortController 가 없는 옛 WebView 에서도 «기다리는 중» 에 멈추지 않게 타이머가 직접 끝냅니다.
    var timer = new Promise(function(res){ setTimeout(function(){ res(null); }, (ms || AI_TIMEOUT) + 500); });
    var req = root.fetch(AI_URL, { method: 'POST', headers: headers, credentials: 'same-origin', signal: ctl ? ctl.signal : undefined, body: JSON.stringify(body) })
      .then(function(r){ return r.json().catch(function(){ return null; }); }, function(){ return null; });
    return Promise.race([req, timer]).then(function(d){ clearTimeout(to); return d; });
  }
  function lw(s){ return String(s || '').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean); }
  /** 서버 답 → 화면 상태(순수). state: 'ok'(고칠 곳 없음) · 'fixed' · 'cap' · 'unavailable'(못 봄·검사 탈락 포함) */
  function aiState(d, orig){
    if (!d || typeof d !== 'object') return { state: 'unavailable' };
    if (d.ok === true && d.changed === false) return { state: 'ok' };
    if (d.ok === true && d.changed === true && typeof d.a === 'string' && typeof d.b === 'string' && d.a && d.b) {
      var issues = [];
      [[orig.a, d.a], [orig.b, d.b]].forEach(function(pr, k){
        var o = lw(pr[0]), f = lw(pr[1]);
        if (o.join(' ') === f.join(' ')) return;
        var why = (d.reasons || []).filter(function(r){ return r && r.ko; })[issues.length] || {};
        issues.push({ slot: k, kind: 'ai',
          from: o.filter(function(w){ return f.indexOf(w) < 0; }).join(' '),
          to: f.filter(function(w){ return o.indexOf(w) < 0; }).join(' '),
          ko: why.ko || '더 자연스러운 표현으로 바꿨어요.', en: why.en || 'A more natural way to say it.' });
      });
      if (!issues.length) return { state: 'ok' };
      return { state: 'fixed', a: d.a, b: d.b, issues: issues, grammar: issues.length };
    }
    if (d.error === 'daily_cap') return { state: 'cap' };
    return { state: 'unavailable' };
  }
  function aiFix(o){
    var body = { action: 'story_fix', story: o.story, a: o.a, b: o.b, slots: o.slots, sentence: o.sentence, device: device() };
    return post(body).then(function(d){ return aiState(d, o); });
  }
  /** 도장을 받은 문장 기록 — 로그인 안 했으면 아예 안 보냅니다. 실패해도 화면은 그대로(기록은 덤). */
  function logWrite(o){
    var u = who();
    if (!u || /^guest/i.test(u) || !ls('mango_token')) return Promise.resolve({ saved: false });
    return post({ action: 'story_log', uid: u, token: ls('mango_token') || '', story: o.story, sentence: o.sentence, original: o.original || '', fixes: o.fixes || 0, ai: o.ai || 'none' }, 6000)
      .then(function(d){ return d || { saved: false }; });
  }
  /** AI 상태별 안내 한 줄(없으면 null) */
  function aiNote(state){
    if (state === 'unavailable') return { ko: '🤖 AI 확인은 지금 하지 못했어요. 규칙 점검은 통과했어요 — 선생님께도 보여 주세요.', en: '🤖 The AI check is not available right now. The rule check passed — show it to your teacher too.' };
    if (state === 'cap') return { ko: '🤖 오늘 AI 확인 횟수(' + 30 + '번)를 다 썼어요. 규칙 점검만 했어요.', en: '🤖 You used all of today’s AI checks (30). Only the rule check was done.' };
    if (state === 'ok') return { ko: '🤖 AI 선생님도 확인했어요.', en: '🤖 Checked by the AI teacher too.' };
    return null;
  }

  root.StoryKit = { review: review, poolFor: poolFor, STORY_WORD_POOL: STORY_WORD_POOL,
    aiFix: aiFix, aiState: aiState, logWrite: logWrite, aiNote: aiNote,
    _forms: { third: third, ing: ing, past: past, F3: F3, FING: FING, FPAST: FPAST, BASESET: BASESET } };
})(typeof window !== 'undefined' ? window : globalThis);
