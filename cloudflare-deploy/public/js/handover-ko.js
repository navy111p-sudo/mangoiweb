/* 🌐 매일보고 → 한국어 번역 (공용) / Daily handover → Korean translation (shared) — 2026-11-05
 * 처음에는 «받은 보고» 읽기 화면(daily-handover.js, 2026-10-08)에만 있었다.
 * 사장님이 «팀 보고판» 스크린샷과 함께 「한글번역 버튼을 적당한 곳에 설치해서 작동하게 해줘」라고 해서
 * 두 화면이 «같은 번역» 을 쓰도록 이 파일로 옮겼다. ⛔ 화면마다 번역 로직을 다시 만들지 말 것.
 *
 * 쓰는 쪽: daily-handover.js(읽기 화면) · daily-handover-board.js(팀 보고판)
 *   MangoiHandoverKo.needs(payload)     → 번역할 영어 줄이 있는가(버튼을 보일지)
 *   MangoiHandoverKo.translate(payload) → 번역한 «사본» (+ __failed: 번역 못 한 줄 수). 원본·저장된 보고는 안 바꾼다.
 *
 * 서버: POST /api/translate { target:'ko', mode:'chat' } — 존댓말·«직원과 강사의 수업 대화» 맥락의 언어모델 경로.
 *   ⚠️ 그 모드는 답의 «첫 줄만» 쓰므로 줄마다 따로 보낸다.
 *   ⚠️ 그 모드는 max_tokens 300 · 5초 상한이라, 한 줄이 길면 잘리거나 직역(m2m100)으로 떨어진다 → 긴 줄은 문장으로 나눠 보낸다.
 *   ℹ️ 한글이 섞인 줄은 서버가 «이미 한국어» 로 보고 그대로 돌려준다 — 그래서 여기서도 안 보낸다(같은 판정).
 */
(function () {
  'use strict';
  var FIELDS = ['work', 'issue', 'open', 'student', 'class_info'];
  var LONG = 220;   // 이보다 긴 줄은 문장으로 나눠 보낸다(위 «max_tokens 300» 참고)
  var BATCH = 40;   // 서버 상한 50
  var LATIN = /[A-Za-z]/, HANGUL = /[가-힣]/;
  var memo = {};    // 영어 문장 → 한국어. 두 화면이 함께 쓴다. ⛔ 실패는 담지 않는다(다시 누르면 다시 묻는다).

  function wants(text) { return LATIN.test(text) && !HANGUL.test(text); }
  function lineParts(line) { var m = /^([\s•\-*·]*)([\s\S]*)$/.exec(line); return { lead: m[1], text: m[2].trim() }; }
  // 문장 나누기 — 뒷말이 대문자·숫자·따옴표로 시작할 때만 끊는다(«e.g. this» 처럼 소문자가 이어지면 안 끊는다).
  // ⛔ 뒤돌아보기(?<=) 정규식을 쓰지 말 것 — 옛 Safari 에서 문법 오류로 이 파일 «전체» 가 안 돈다.
  function pieces(text) {
    if (text.length <= LONG) return [text];
    return text.replace(/([.!?])\s+(?=["'(\[]?[A-Z0-9])/g, '$1\u0000').split('\u0000').map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function okKo(ko) { return !!ko && HANGUL.test(ko) && !/불러오지 못했어요/.test(ko); }
  function linesOf(d, k) { return String((d && d[k]) || '').split(/\r?\n/); }

  function needs(d) {
    return FIELDS.some(function (k) { return linesOf(d, k).some(function (line) { return pieces(lineParts(line).text).some(wants); }); });
  }

  async function fetchKo(list) {
    for (var i = 0; i < list.length; i += BATCH) {
      var r = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: list.slice(i, i + BATCH), target: 'ko', mode: 'chat' }) });
      var j = await r.json().catch(function () { return null; });
      if (!r.ok || !j || j.ok !== true || !j.map) throw new Error('translate ' + r.status);
      Object.keys(j.map).forEach(function (t) { if (okKo(j.map[t])) memo[t] = j.map[t]; });
    }
  }

  async function translate(d) {
    var ask = [];
    FIELDS.forEach(function (k) {
      linesOf(d, k).forEach(function (line) {
        pieces(lineParts(line).text).forEach(function (p) { if (wants(p) && !memo[p] && ask.indexOf(p) < 0) ask.push(p); });
      });
    });
    if (ask.length) await fetchKo(ask);
    var failed = 0, copy = Object.assign({}, d);
    FIELDS.forEach(function (k) {
      if (!d[k]) return;
      copy[k] = linesOf(d, k).map(function (line) {
        var lp = lineParts(line), parts = pieces(lp.text), miss = false;
        if (!parts.some(wants)) return line;   // 한국어·빈 줄·숫자만 — 그대로
        var out = parts.map(function (p) { if (!wants(p)) return p; if (memo[p]) return memo[p]; miss = true; return p; }).join(' ');
        if (miss) failed++;                    // 못 옮긴 문장은 원문 그대로 둔다(지어내지 않는다)
        return lp.lead + out;
      }).join('\n');
    });
    copy.__failed = failed;
    return copy;
  }

  window.MangoiHandoverKo = { FIELDS: FIELDS, needs: needs, translate: translate };
})();
