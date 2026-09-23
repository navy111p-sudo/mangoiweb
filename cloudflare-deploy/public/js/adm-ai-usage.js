// ═══════════════════════════════════════════════════════════════════════════
// adm-ai-usage.js — 🤖 AI 학습도구 활용 학생  · 2026-09-16 신설
//
//   GET /api/admin/ai-usage/students?tool=&days=&q=
//   판단력훈련·AI웜업·AI영어친구·AI글쓰기·발음코칭·복습퀴즈·단어장·AI단어퀴즈 8종 가운데
//   실제로 쓴 흔적이 있는 학생만 모아, 도구별 사용 횟수와 마지막 사용일을 보여준다.
//
//   ⚠️ 정본은 서버(src/api-admin.ts)에 있다 — 이 파일은 그 결과를 그대로 그리기만 한다.
//      도구 목록(TOOLS)의 key·라벨은 서버의 TOOL_DEFS 와 반드시 같은 말을 해야 한다.
//      한쪽만 고치면 「도구를 골랐는데 이름이 다르게 뜬다」가 조용히 재현된다.
//
//   전역 classic script (adm-longabsent.js 와 같은 방식 — 지연:카드 펼칠 때 로드).
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var _rows = [];       // 마지막 응답 (CSV 내보내기가 화면과 똑같은 것을 쓰도록)
  var _meta = null;
  var _seq = 0;         // 늦게 온 옛 응답이 최신 결과를 덮지 않게
  var _timer = null;

  // 서버 TOOL_DEFS 와 같은 key·순서(src/api-admin.ts 「AI 학습도구 사용 학생」 정본 참고)
  var TOOLS = [
    { key: 'judgment', ko: '판단력 훈련',  en: 'Judgment training' },
    { key: 'warmup',   ko: 'A.i 말하기 연습', en: 'A.i Speaking Practice' },
    { key: 'friend',   ko: 'AI 영어친구',  en: 'AI friend chat' },
    { key: 'write',    ko: 'AI 글쓰기',    en: 'AI writing' },
    { key: 'speech',   ko: '발음코칭',     en: 'Speech coaching' },
    { key: 'review',   ko: '복습퀴즈',     en: 'Review quiz' },
    { key: 'vocab',    ko: '단어장',       en: 'Vocabulary' },
    { key: 'micro',    ko: 'AI 단어 퀴즈', en: 'AI word quiz' }
  ];
  var TOOL_BY_KEY = {};
  TOOLS.forEach(function (t) { TOOL_BY_KEY[t.key] = t; });

  var _isEn = function () { return document.documentElement.lang === 'en' || window.adminLang === 'en'; };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var val = function (id, dflt) { var e = document.getElementById(id); return e ? e.value : dflt; };
  var dash = function (v) { var x = esc(v); return x || '—'; };

  function fmtDay(ts) {
    var n = Number(ts);
    if (!n) return null;
    var d = new Date(n);
    if (isNaN(d.getTime())) return null;
    var p2 = function (x) { return String(x).length < 2 ? '0' + x : String(x); };
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  function daysAgo(ts) {
    var n = Number(ts);
    if (!n) return null;
    return Math.max(0, Math.round((Date.now() - n) / 86400000));
  }

  window.aiuLoad = async function () {
    var box = document.getElementById('aiu-list');
    if (!box) return;
    var en = _isEn();
    var my = ++_seq;
    box.innerHTML = '<div style="padding:16px;color:#6b7280;text-align:center">' + (en ? 'Loading…' : '불러오는 중…') + '</div>';

    var qs = '?tool=' + encodeURIComponent(val('aiu-tool', 'all')) +
             '&days=' + encodeURIComponent(val('aiu-days', '30')) +
             (val('aiu-q', '').trim() ? '&q=' + encodeURIComponent(val('aiu-q', '').trim()) : '');

    var d;
    try {
      var r = await fetch('/api/admin/ai-usage/students' + qs, { cache: 'no-store', credentials: 'include' });
      d = await r.json();
    } catch (e) {
      if (my !== _seq) return;
      box.innerHTML = '<div style="padding:16px;color:#b91c1c">' + (en ? 'Failed to load.' : '불러오지 못했습니다.') + ' ' + esc(e && e.message) + '</div>';
      return;
    }
    if (my !== _seq) return;                       // 더 최신 요청이 이미 나갔다
    if (!d || !d.ok) {
      box.innerHTML = '<div style="padding:16px;color:#b91c1c">' + (en ? 'Failed to load.' : '불러오지 못했습니다.') + ' ' + esc(d && d.error) + '</div>';
      return;
    }
    _rows = d.students || [];
    _meta = d;
    renderSummary(d, en);
    renderTable(_rows, en);
  };

  function renderSummary(d, en) {
    var box = document.getElementById('aiu-summary');
    var cnt = document.getElementById('aiu-count');
    if (cnt) cnt.innerHTML = en ? ('<b>' + d.count + '</b> students · last ' + d.days + ' days')
                                 : ('<b>' + d.count + '</b>명 · 최근 ' + d.days + '일');
    if (!box) return;
    var summary = d.summary || [];
    if (!summary.length) { box.innerHTML = ''; return; }
    box.innerHTML = summary.map(function (s) {
      var t = TOOL_BY_KEY[s.key];
      var label = t ? (en ? t.en : t.ko) : s.key;
      return '<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:99px;' +
        'background:#eef2ff;border:1px solid #c7d2fe;font-size:11.5px;color:#3730a3">' +
        esc(label) + ' <b>' + s.students + '</b>' + (en ? '' : '명') + '</span>';
    }).join('');
  }

  function toolChips(tools, en) {
    return TOOLS.map(function (t) {
      var u = tools[t.key];
      if (!u) return '';
      var label = en ? t.en : t.ko;
      var title = (en ? (u.n + ' times, last ') : (u.n + '회, 마지막 ')) + (fmtDay(u.last_ts) || '—');
      return '<span title="' + esc(title) + '" style="display:inline-block;margin:1px 3px 1px 0;padding:2px 7px;' +
        'border-radius:99px;font-size:10.5px;font-weight:700;background:#ecfdf5;color:#047857;border:1px solid #a7f3d055">' +
        esc(label) + ' ' + u.n + '</span>';
    }).join('');
  }

  function renderTable(rows, en) {
    var box = document.getElementById('aiu-list');
    if (!box) return;
    if (!rows.length) {
      box.innerHTML = '<div style="padding:28px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:10px">' +
        (en ? 'No students match.' : '해당하는 학생이 없습니다.') + '</div>';
      return;
    }
    var H = function (ko, enTxt, extra) {
      return '<th style="text-align:left;padding:9px 10px;white-space:nowrap' + (extra || '') + '">' + (en ? enTxt : ko) + '</th>';
    };
    box.innerHTML =
      '<div style="overflow-x:auto">' +
      '<table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#fff;border-radius:8px;overflow:hidden">' +
        '<thead style="background:#f3f4f6"><tr>' +
          H('학생명', 'Student') + H('아이디', 'ID') +
          H('사용 도구', 'Tools used') +
          H('총 사용', 'Total', ';text-align:right') +
          H('마지막 사용', 'Last used') +
          H('대리점(학원)', 'Center') + H('지사', 'Branch') + H('레벨', 'Level') +
        '</tr></thead><tbody>' +
        rows.map(function (s) {
          var ago = daysAgo(s.last_ts);
          return '<tr style="border-bottom:1px solid #e5e7eb">' +
            '<td style="padding:9px 10px"><b>' + dash(s.name) + '</b></td>' +
            '<td style="padding:9px 10px"><code>' + dash(s.uid) + '</code></td>' +
            '<td style="padding:9px 10px;max-width:320px">' + toolChips(s.tools || {}, en) + '</td>' +
            '<td style="padding:9px 10px;text-align:right;white-space:nowrap"><b>' + (Number(s.total) || 0) + '</b></td>' +
            '<td style="padding:9px 10px;white-space:nowrap">' + dash(fmtDay(s.last_ts)) +
              (ago != null ? '<br><span style="font-size:11px;color:#6b7280">' + (en ? (ago + ' days ago') : (ago + '일 전')) + '</span>' : '') +
            '</td>' +
            '<td style="padding:9px 10px">' + dash(s.shop_name) + '</td>' +
            '<td style="padding:9px 10px">' + dash(s.franchise) + '</td>' +
            '<td style="padding:9px 10px">' + dash(s.level) + '</td>' +
          '</tr>';
        }).join('') +
      '</tbody></table></div>';
  }

  /* 📥 CSV — 화면에 보이는 것과 100% 같은 줄 (장기 결석생 카드와 같은 원칙) */
  window.aiuExportCsv = function () {
    var en = _isEn();
    if (!_rows.length) { alert(en ? 'Load the list first.' : '먼저 목록을 불러오세요.'); return; }
    var cols = [
      ['학생명', function (s) { return s.name; }],
      ['아이디', function (s) { return s.uid; }],
      ['총사용횟수', function (s) { return Number(s.total) || 0; }],
      ['마지막사용', function (s) { return fmtDay(s.last_ts) || ''; }],
      ['대리점(학원)', function (s) { return s.shop_name; }],
      ['지사', function (s) { return s.franchise; }],
      ['레벨', function (s) { return s.level; }]
    ];
    TOOLS.forEach(function (t) {
      cols.push([t.ko + '(횟수)', function (s) { var u = (s.tools || {})[t.key]; return u ? u.n : 0; }]);
    });
    var cell = function (v) {
      var x = (v == null ? '' : String(v));
      return /[",\r\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
    };
    var out = [cols.map(function (c) { return cell(c[0]); }).join(',')];
    _rows.forEach(function (s) { out.push(cols.map(function (c) { return cell(c[1](s)); }).join(',')); });
    var csv = '﻿' + out.join('\r\n');          // BOM — 엑셀에서 한글 안 깨짐
    var stamp = (_meta && _meta.days ? String(_meta.days) + 'd' : '');
    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    var a = document.createElement('a');
    a.href = url; a.download = 'mangoi_ai_usage_' + stamp + '_' + Date.now() + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  /* 조건이 바뀌면 다시 부른다. 검색만 디바운스(타자 중간에 요청이 줄줄이 나가지 않게). */
  function bind() {
    ['aiu-tool', 'aiu-days'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.__aiuBound) { el.__aiuBound = true; el.addEventListener('change', function () { window.aiuLoad(); }); }
    });
    var q = document.getElementById('aiu-q');
    if (q && !q.__aiuBound) {
      q.__aiuBound = true;
      q.addEventListener('input', function () {
        clearTimeout(_timer);
        _timer = setTimeout(function () { window.aiuLoad(); }, 400);
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
