// ═══════════════════════════════════════════════════════════════════
// 📊 adm-hr-analysis.js — 강사 인사평가 "왜 이 점수인가" 분석
//   · 강사관리 목록의 인사평가 셀을 서버 계산값으로 채운다 (hrFillTeacherScores)
//   · 셀을 누르면 근거 분석 모달을 연다 (openHrAnalysis)
//
//   ⚠ 점수는 전부 서버(/api/admin/teacher-hr-analysis)가 실제 수업기록으로 계산한다.
//     프런트는 표시만 한다. 데이터가 없는 항목은 '데이터 없음'으로 두고, 절대 추정치를
//     지어내지 않는다 (인사·급여에 쓰이는 숫자이기 때문).
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var _cache = null;           // { at: ms, byId: {id: item} }
  var _CACHE_MS = 60 * 1000;   // 목록을 다시 그려도 1분 안에는 재요청하지 않음

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function isEn() { return (typeof window.adminLang !== 'undefined' && window.adminLang === 'en'); }
  function T(ko, en) { return isEn() ? en : ko; }
  // 🌐 서버가 내려준 두 벌(fact/fact_en 등) 중 현재 언어 선택.
  //    영어판이 비어 있으면 한국어라도 보여준다(빈칸보다 낫다).
  function F(obj, field) {
    if (!obj) return '';
    return (isEn() && obj[field + '_en']) ? obj[field + '_en'] : (obj[field] || '');
  }

  // 점수대별 색 — 표 배지와 모달 막대에서 같은 색을 쓴다
  function tone(score) {
    if (score == null) return { fg: '#9ca3af', bg: '#f3f4f6', bar: '#d1d5db' };
    if (score >= 85) return { fg: '#15803d', bg: '#dcfce7', bar: '#22c55e' };
    if (score >= 75) return { fg: '#1d4ed8', bg: '#dbeafe', bar: '#3b82f6' };
    if (score >= 65) return { fg: '#b45309', bg: '#fef3c7', bar: '#f59e0b' };
    return { fg: '#b91c1c', bg: '#fee2e2', bar: '#ef4444' };
  }
  function gradeOf(total) {
    if (typeof window._hrGrade === 'function') return window._hrGrade(total);
    return { label: '', color: tone(total).fg, bg: tone(total).bg };
  }

  // 인사평가 구성 — 항목·비중·근거(서버 EVAL 가중치와 동일. 바뀌면 양쪽 같이 고칠 것)
  var CATS = [
    { key: 'cls',   color: '#7c3aed', w: 25, ko: '수업 우수성', en: 'Teaching',
      ko_desc: '학생이 수업 직후 매긴 별점(1~7점)', en_desc: 'Student star rating right after class (1-7)' },
    { key: 'ret',   color: '#2563eb', w: 30, ko: '재등록·유지', en: 'Retention',
      ko_desc: '한 달 전부터 다니던 학생이 지금도 남아있는 비율', en_desc: 'Share of month-old students still taking lessons' },
    { key: 'punct', color: '#059669', w: 20, ko: '근태·성실', en: 'Punctuality',
      ko_desc: '수업 대비 지각 횟수 + 강사 노쇼', en_desc: 'Late arrivals per lesson + teacher no-shows' },
    { key: 'admin', color: '#d97706', w: 15, ko: '행정·서류', en: 'Admin',
      ko_desc: '수업 대비 학생 평가서 작성률', en_desc: 'Student report completion rate per lesson' },
    { key: 'contr', color: '#db2777', w: 10, ko: '조직 기여', en: 'Contribution',
      ko_desc: '익명 칭찬 별점과 건수', en_desc: 'Anonymous praise rating and count' }
  ];
  function catColor(key) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].key === key) return CATS[i].color;
    return '#94a3b8';
  }

  // 배점 막대 — 5개 항목의 비중을 100% 한 줄로. cats 를 주면 미측정 항목을 회색 빗금으로 표시.
  function weightBar(cats) {
    var byKey = {};
    (cats || []).forEach(function (c) { byKey[c.key] = c; });
    return '<div style="display:flex;height:22px;border-radius:6px;overflow:hidden;border:1px solid #e5e7eb">'
      + CATS.map(function (d) {
          var c = byKey[d.key];
          var off = cats && (!c || c.score == null);
          return '<div title="' + esc(T(d.ko, d.en) + ' ' + d.w + '%') + '" style="width:' + d.w + '%;'
            + 'background:' + (off ? 'repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9 4px,#e2e8f0 4px,#e2e8f0 8px)' : d.color) + ';'
            + 'color:' + (off ? '#94a3b8' : '#fff') + ';font-size:10.5px;font-weight:800;'
            + 'display:flex;align-items:center;justify-content:center">' + d.w + '%</div>';
        }).join('')
      + '</div>';
  }

  function weightLegend(cats) {
    var byKey = {};
    (cats || []).forEach(function (c) { byKey[c.key] = c; });
    return '<div style="display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:7px">'
      + CATS.map(function (d) {
          var c = byKey[d.key];
          var off = cats && (!c || c.score == null);
          return '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:' + (off ? '#9ca3af' : '#374151') + '">'
            + '<i style="width:9px;height:9px;border-radius:2px;background:' + (off ? '#e2e8f0' : d.color) + ';display:inline-block"></i>'
            + esc(T(d.ko, d.en)) + ' <b>' + d.w + '%</b>'
            + (off ? ' <span style="font-size:10.5px">(' + T('미측정', 'n/a') + ')</span>' : '')
            + '</span>';
        }).join('')
      + '</div>';
  }

  // 실제 계산식 — 숫자를 그대로 보여준다 ("이 점수가 어떻게 나왔나"의 최종 답)
  function formulaLine(it) {
    var m = (it.categories || []).filter(function (c) { return c.score != null; });
    if (!m.length) return '';
    var wSum = m.reduce(function (s, c) { return s + c.weight; }, 0);
    var parts = m.map(function (c) {
      return '<span style="color:' + catColor(c.key) + ';font-weight:700">' + c.score.toFixed(1) + '</span>'
        + '<span style="color:#9ca3af">×' + Math.round(c.weight * 100) + '%</span>';
    }).join(' <span style="color:#9ca3af">+</span> ');
    return '<div style="margin-top:10px;padding:9px 11px;background:#f8fafc;border:1px solid #eef2f7;border-radius:8px;'
      + 'font-size:12px;color:#475569;line-height:1.8">'
      + '<span style="font-weight:800;color:#111827">' + T('계산식', 'Formula') + '</span><br>'
      + '( ' + parts + ' ) <span style="color:#9ca3af">÷ ' + Math.round(wSum * 100) + '%</span>'
      + ' <span style="color:#9ca3af">=</span> <b style="color:' + tone(it.total).fg + ';font-size:13.5px">' + it.total.toFixed(1) + '</b>'
      + (wSum < 0.999
        ? '<div style="font-size:11px;color:#9ca3af;margin-top:3px">'
          + T('※ 미측정 항목을 뺐기 때문에 ' + Math.round(wSum * 100) + '% 로 나눠 100점 만점으로 환산합니다.',
              '※ Missing criteria are excluded, so we divide by ' + Math.round(wSum * 100) + '% to rescale to 100.')
          + '</div>'
        : '')
      + '</div>';
  }

  // ── 데이터 로드 (목록 전체 1회) ───────────────────────────────────
  async function loadAll(force) {
    if (!force && _cache && (Date.now() - _cache.at) < _CACHE_MS) return _cache;
    var r = await fetch('/api/admin/teacher-hr-analysis', { credentials: 'include', cache: 'no-store' });
    var d = await r.json();
    if (!d || !d.ok) throw new Error((d && d.error) || 'load_failed');
    var byId = {};
    (d.items || []).forEach(function (it) { byId[it.id] = it; });
    _cache = { at: Date.now(), byId: byId, items: d.items || [] };
    return _cache;
  }

  // ── 목록 셀 채우기 ────────────────────────────────────────────────
  window.hrFillTeacherScores = async function (force) {
    var cells = document.querySelectorAll('[id^="hrv-"]');
    if (!cells.length) return;
    var data;
    try {
      data = await loadAll(force);
    } catch (e) {
      cells.forEach(function (td) {
        td.innerHTML = '<span style="color:#9ca3af;font-size:11px" title="' + esc(String(e && e.message || e)) + '">'
          + T('불러오기 실패', 'load failed') + '</span>';
      });
      return;
    }
    cells.forEach(function (td) {
      var id = parseInt(String(td.id).replace('hrv-', ''), 10);
      var it = data.byId[id];
      var rankTd = document.getElementById('hrr-' + id);
      if (!it || it.total == null) {
        // 근거가 하나도 없는 강사 — 가짜 점수를 만들지 않고 그대로 비워둔다
        td.innerHTML = '<span style="color:#9ca3af;font-size:11.5px;border-bottom:1px dashed #d1d5db">'
          + T('데이터 없음', 'no data') + '</span>';
        td.title = T('수업평가·수업기록이 아직 없어 점수를 계산할 수 없습니다. 눌러서 자세히 보기',
                     'Not enough class records to score yet. Click for details.');
        if (rankTd) rankTd.innerHTML = '<span style="color:#d1d5db">—</span>';
        return;
      }
      var g = gradeOf(it.total);
      var low = it.confidence < 60;   // 절반 넘게 미측정이면 눈에 띄게 표시
      td.innerHTML =
        '<div style="display:inline-flex;align-items:center;gap:5px">'
        + '<span style="font-size:13px;font-weight:800;color:' + g.color + ';font-variant-numeric:tabular-nums">' + it.total.toFixed(1) + '</span>'
        + '<span style="display:inline-block;padding:2px 8px;background:' + g.bg + ';color:' + g.color + ';border-radius:10px;font-size:10.5px;font-weight:800">' + g.label + '</span>'
        + (low ? '<span style="font-size:10px;color:#d97706;font-weight:700" title="'
            + esc(T('실제 기록으로 채워진 항목이 절반 미만입니다', 'less than half of the criteria have data'))
            + '">' + it.confidence + '%</span>' : '')
        + '</div>';
      td.title = T('클릭 — 이 점수가 나온 근거 보기', 'Click to see why this score');
      if (rankTd) {
        rankTd.innerHTML = (it.rank && typeof window._hrRankBadge === 'function')
          ? window._hrRankBadge(it.rank)
          : '<span style="color:#d1d5db">—</span>';
        if (it.rank) rankTd.title = it.rank + ' / ' + it.ranked_total + T('명 중', '');
      }
    });
  };

  // ── 근거 분석 모달 ────────────────────────────────────────────────
  function catRow(c, wSum) {
    var t = tone(c.score);
    var pct = c.score == null ? 0 : Math.max(0, Math.min(100, c.score));
    var name = isEn() ? (c.label_en || c.label) : c.label;
    var weight = Math.round(c.weight * 100);
    // 미측정 항목이 있으면 남은 항목의 '실제 적용 비중'이 올라간다 — 그 값을 같이 보여준다
    var applied = (c.score != null && wSum && wSum < 0.999) ? Math.round((c.weight / wSum) * 100) : null;
    return ''
      + '<div style="padding:11px 13px;border:1px solid ' + (c.score == null ? '#e5e7eb' : '#eef2f7') + ';'
      + 'border-left:4px solid ' + (c.score == null ? '#e5e7eb' : catColor(c.key)) + ';'
      + 'border-radius:10px;background:' + (c.score == null ? '#fafafa' : '#fff') + ';margin-bottom:8px">'
      +   '<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">'
      +     '<span style="font-weight:800;font-size:13.5px;color:#111827">' + esc(name) + '</span>'
      +     '<span style="padding:1px 7px;border-radius:8px;background:#eef2ff;color:#4338ca;font-size:10.5px;font-weight:800">'
      +       T('배점 ', 'weight ') + weight + '%'
      +       (applied ? ' <span style="color:#7c3aed">→ ' + T('실제 ', 'applied ') + applied + '%</span>' : '')
      +     '</span>'
      +     '<span style="margin-left:auto;font-size:15px;font-weight:800;color:' + t.fg + ';font-variant-numeric:tabular-nums">'
      +       (c.score == null ? T('미측정', 'n/a') : c.score.toFixed(1)) + '</span>'
      +   '</div>'
      +   '<div style="height:8px;border-radius:6px;background:#f1f5f9;overflow:hidden;margin-bottom:7px">'
      +     '<div style="height:100%;width:' + pct + '%;background:' + t.bar + ';border-radius:6px"></div>'
      +   '</div>'
      +   '<div style="font-size:12.5px;color:' + (c.score == null ? '#9ca3af' : '#374151') + ';line-height:1.5">'
      +     esc(F(c, 'fact')) + '</div>'
      +   '<div style="font-size:11px;color:#9ca3af;margin-top:3px">' + esc(F(c, 'source')) + '</div>'
      +   (c.score != null && c.contribution != null
          ? '<div style="font-size:11px;color:#6b7280;margin-top:4px">'
            + T('총점 기여 ', 'adds ') + '<b style="color:' + t.fg + '">' + c.contribution.toFixed(1) + T('점', ' pts') + '</b></div>'
          : '')
      + '</div>';
  }

  function summaryLine(it) {
    var measured = (it.categories || []).filter(function (c) { return c.score != null; });
    if (!measured.length) {
      return T('아직 이 선생님의 수업 기록이 없어 점수를 낼 수 없습니다. 학생 수업평가나 수업 예약이 쌓이면 자동으로 계산됩니다.',
               'No class records yet, so no score can be computed. It fills in automatically as ratings and lessons accumulate.');
    }
    var best = measured.slice().sort(function (a, b) { return b.score - a.score; })[0];
    var worst = measured.slice().sort(function (a, b) { return a.score - b.score; })[0];
    var bn = isEn() ? (best.label_en || best.label) : best.label;
    var wn = isEn() ? (worst.label_en || worst.label) : worst.label;
    if (best === worst) return T('측정된 항목이 하나뿐입니다: ', 'Only one measured item: ') + bn;
    return T('점수를 가장 많이 올린 건 「' + bn + '」(' + best.score.toFixed(1) + '점), '
           + '가장 많이 깎은 건 「' + wn + '」(' + worst.score.toFixed(1) + '점)입니다.',
             'Highest: "' + bn + '" (' + best.score.toFixed(1) + '), lowest: "' + wn + '" (' + worst.score.toFixed(1) + ').');
  }

  function feedbackBlock(list) {
    if (!list || !list.length) return '';
    return ''
      + '<div style="margin-top:14px">'
      +   '<div style="font-weight:800;font-size:13px;color:#111827;margin-bottom:7px">'
      +     T('학생이 남긴 최근 의견', 'Recent student comments')
      +     (isEn() ? ' <span style="font-weight:600;color:#9ca3af;font-size:11px">(auto-translated)</span>' : '') + '</div>'
      +   list.map(function (f) {
            // 학생 의견은 한국어로 쌓인다 — 영어 화면에서는 렌더 후 자동 번역해 채운다(data-tr)
            return '<div style="padding:8px 11px;border-left:3px solid #c7d2fe;background:#f8fafc;border-radius:0 8px 8px 0;margin-bottom:6px">'
              + '<div data-tr="' + esc(f.feedback) + '" style="font-size:12.5px;color:#374151;line-height:1.5">' + esc(f.feedback) + '</div>'
              + '<div style="font-size:11px;color:#9ca3af;margin-top:3px">'
              + esc(f.student_name || T('익명', 'anonymous')) + ' · ' + esc(f.rated_date || '')
              + ' · ' + T('별점 ', 'rating ') + esc(f.score) + '/7</div>'
              + '</div>';
          }).join('')
      + '</div>';
  }

  function manualBlock(m) {
    if (!m) return '';
    var rows = [
      ['수업 우수성', 'Teaching', m.score_instruction],
      ['재등록 유지', 'Retention', m.score_retention],
      ['근태·성실', 'Punctuality', m.score_punctuality],
      ['행정 성실도', 'Admin', m.score_admin],
      ['조직 기여도', 'Contribution', m.score_contribution]
    ].filter(function (r) { return r[2] != null; });
    return ''
      + '<div style="margin-top:14px;padding:12px 13px;border:1px dashed #cbd5e1;border-radius:10px;background:#f8fafc">'
      +   '<div style="font-weight:800;font-size:13px;color:#111827;margin-bottom:6px">'
      +     T('관리자가 직접 입력한 평가', 'Manual evaluation by admin')
      +     ' <span style="font-weight:600;color:#6b7280;font-size:11.5px">(' + esc(m.year) + '.' + esc(m.month) + ')</span></div>'
      +   '<div style="font-size:12.5px;color:#374151;line-height:1.7">'
      +     rows.map(function (r) { return esc(T(r[0], r[1])) + ' <b>' + esc(r[2]) + '</b>/5'; }).join(' · ')
      +     (m.weighted_total != null ? '<br>' + T('가중 합계 ', 'weighted ') + '<b>' + esc(m.weighted_total) + '</b>/5 · ' + esc(F(m, 'grade')) : '')
      +     (m.strengths ? '<br>' + T('강점: ', 'Strengths: ') + esc(m.strengths) : '')
      +     (m.improvements ? '<br>' + T('개선점: ', 'Improvements: ') + esc(m.improvements) : '')
      +   '</div>'
      +   '<div style="font-size:11px;color:#9ca3af;margin-top:5px">'
      +     T('입력자 ', 'by ') + esc(m.evaluator || '-')
      +     ' · ' + T('위 자동 점수와는 별개 기록입니다 (급여·평가 카드에서 입력)',
                      'separate from the automatic score above (entered in the payroll card)') + '</div>'
      + '</div>';
  }

  function render(ov, it) {
    var g = gradeOf(it.total);
    var name = it.korean_name || it.english_name || '';
    // 실제 적용된 가중치 합 — 미측정 항목을 뺀 나머지 (배점 재정규화의 분모)
    var wSum = (it.categories || [])
      .filter(function (c) { return c.score != null; })
      .reduce(function (s, c) { return s + c.weight; }, 0);
    var body = ''
      // 헤더 — 이름 · 총점 · 등급 · 순위
      + '<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #eef2f7">'
      +   '<div style="flex:1;min-width:0">'
      +     '<div style="font-size:15px;font-weight:800;color:#111827">' + esc(name)
      +       ' <span style="font-weight:600;color:#6b7280;font-size:12.5px">' + T('인사평가 근거', 'HR score breakdown') + '</span></div>'
      +     '<div style="font-size:11.5px;color:#9ca3af;margin-top:2px">'
      +       T('최근 90일 수업기록 · 별점은 180일 기준', 'Last 90 days of lessons · ratings over 180 days') + '</div>'
      +   '</div>'
      +   (it.total == null
          ? '<div style="font-size:13px;color:#9ca3af;font-weight:700">' + T('데이터 없음', 'no data') + '</div>'
          : '<div style="text-align:right">'
            + '<div style="font-size:30px;font-weight:800;color:' + g.color + ';line-height:1;font-variant-numeric:tabular-nums">' + it.total.toFixed(1) + '</div>'
            + '<div style="margin-top:4px">'
            +   '<span style="display:inline-block;padding:2px 9px;background:' + g.bg + ';color:' + g.color + ';border-radius:10px;font-size:11px;font-weight:800">' + g.label + '</span>'
            +   (it.rank ? '<span style="margin-left:5px;font-size:11.5px;color:#6b7280;font-weight:700">' + it.rank + '/' + it.ranked_total + T('위', '') + '</span>' : '')
            + '</div>'
            + '</div>')
      +   '<button data-close="1" style="background:none;border:0;color:#9ca3af;font-size:22px;cursor:pointer;line-height:1;padding:0 2px;align-self:flex-start">&times;</button>'
      + '</div>'

      // 한 줄 요약
      + '<div style="padding:11px 16px;background:#f8fafc;border-bottom:1px solid #eef2f7;font-size:13px;color:#334155;line-height:1.6">'
      +   esc(summaryLine(it)) + '</div>'

      // 신뢰도
      + '<div style="padding:9px 16px;font-size:11.5px;color:' + (it.confidence < 60 ? '#b45309' : '#6b7280') + ';'
      +   'background:' + (it.confidence < 60 ? '#fffbeb' : '#fff') + ';border-bottom:1px solid #eef2f7">'
      +   T('5개 항목 중 ' + it.measured_count + '개가 실제 기록으로 채워졌습니다 (비중 ' + it.confidence + '%). '
          + '데이터가 없는 항목은 계산에서 빼고, 나머지 항목의 비중을 다시 100%로 맞춰 평균냅니다.',
            it.measured_count + ' of 5 criteria have real records (' + it.confidence + '% of weight). '
          + 'Missing criteria are excluded and the remaining weights are renormalised.')
      + '</div>'

      // 평가 구성(배점) + 항목별 근거
      + '<div style="padding:13px 16px;max-height:52vh;overflow:auto">'
      +   '<div style="margin-bottom:13px">'
      +     '<div style="font-weight:800;font-size:13px;color:#111827;margin-bottom:7px">'
      +       T('인사평가 배점 구성', 'How the score is weighted')
      +       ' <span style="font-weight:600;color:#9ca3af;font-size:11.5px">'
      +       T('(빗금 = 기록이 없어 이번 계산에서 뺀 항목)', '(hatched = excluded, no records)') + '</span></div>'
      +     weightBar(it.categories)
      +     weightLegend(it.categories)
      +     formulaLine(it)
      +   '</div>'
      +   (it.categories || []).map(function (c) { return catRow(c, wSum); }).join('')
      +   feedbackBlock(it.recent_feedback)
      +   manualBlock(it.manual_evaluation)
      + '</div>';

    ov.querySelector('[data-hr-box]').innerHTML = body;
    translateComments(ov);
  }

  // 🌐 학생 의견(한국어)을 영어 화면에서 자동 번역 — 강사 다수가 외국인이라 원문만 두면 못 읽는다.
  //    서버 /api/translate 는 KV 캐시가 있어 같은 문장은 재요청 없이 즉시 온다. 실패하면 원문 유지.
  async function translateComments(ov) {
    if (!isEn()) return;
    var nodes = [].slice.call(ov.querySelectorAll('[data-tr]'));
    var texts = nodes.map(function (n) { return n.getAttribute('data-tr'); })
      .filter(function (t) { return t && /[가-힣]/.test(t); });
    if (!texts.length) return;
    try {
      var r = await fetch('/api/translate', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: texts, target: 'en' })
      });
      var d = await r.json();
      if (!d || !d.ok || !d.map) return;
      nodes.forEach(function (n) {
        var src = n.getAttribute('data-tr');
        var out = d.map[src];
        if (out && out !== src) {
          n.textContent = out;
          n.title = src;                       // 원문은 툴팁으로 남긴다
          n.style.fontStyle = 'normal';
        }
      });
    } catch (e) { /* 번역 실패 — 원문 그대로 둔다 */ }
  }

  // ── 모달 껍데기 (분석 모달 / 기준 안내 모달 공용) ─────────────────
  function shell(innerHtml) {
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(15,23,42,.55);'
      + 'display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = '<div data-hr-box style="background:#fff;border-radius:14px;max-width:560px;width:100%;'
      + 'box-shadow:0 24px 64px rgba(0,0,0,.28);overflow:hidden">' + innerHtml + '</div>';
    function close() {
      if (ov.parentNode) document.body.removeChild(ov);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    ov.addEventListener('click', function (e) {
      if (e.target === ov || (e.target.getAttribute && e.target.getAttribute('data-close'))) close();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    return ov;
  }

  // ── 평가 기준 안내 (강사 선택 없이) — 목록 위 "📋 평가 기준" 버튼 ──
  window.openHrCriteria = function () {
    shell(''
      + '<div style="display:flex;align-items:center;padding:14px 16px;border-bottom:1px solid #eef2f7">'
      +   '<div style="flex:1">'
      +     '<div style="font-size:15px;font-weight:800;color:#111827">' + T('인사평가 기준', 'HR evaluation criteria') + '</div>'
      +     '<div style="font-size:11.5px;color:#9ca3af;margin-top:2px">'
      +       T('5개 항목을 100점 만점으로 매기고, 아래 배점대로 가중평균합니다',
                 'Each of 5 criteria is scored out of 100 and weighted as below') + '</div>'
      +   '</div>'
      +   '<button data-close="1" style="background:none;border:0;color:#9ca3af;font-size:22px;cursor:pointer;line-height:1;padding:0 2px">&times;</button>'
      + '</div>'
      + '<div style="padding:14px 16px;max-height:60vh;overflow:auto">'
      +   weightBar(null) + weightLegend(null)
      +   '<div style="margin-top:14px">'
      +     CATS.map(function (d) {
            return '<div style="display:flex;gap:10px;padding:9px 0;border-top:1px solid #f1f5f9">'
              + '<span style="flex:0 0 4px;background:' + d.color + ';border-radius:2px"></span>'
              + '<div style="flex:1;min-width:0">'
              +   '<div style="font-size:13px;font-weight:800;color:#111827">' + esc(T(d.ko, d.en))
              +     ' <span style="color:' + d.color + ';font-size:12px">' + d.w + '%</span></div>'
              +   '<div style="font-size:12.5px;color:#475569;line-height:1.5;margin-top:2px">' + esc(T(d.ko_desc, d.en_desc)) + '</div>'
              + '</div></div>';
          }).join('')
      +   '</div>'
      +   '<div style="margin-top:13px;padding:10px 12px;background:#f8fafc;border:1px solid #eef2f7;border-radius:9px;'
      +     'font-size:12px;color:#475569;line-height:1.7">'
      +     '<b style="color:#111827">' + T('기록이 없는 항목은 어떻게 하나요?', 'What if a criterion has no records?') + '</b><br>'
      +     T('0점으로 깎지 않습니다. 그 항목을 계산에서 빼고, 남은 항목의 배점을 다시 100%로 맞춰 평균냅니다. '
              + '5개 다 기록이 없으면 점수를 만들지 않고 「데이터 없음」으로 둡니다.',
              'It is not counted as zero. The criterion is excluded and the remaining weights are rescaled to 100%. '
              + 'If none of the five have records, no score is produced — it shows "no data".')
      +     '<br><br><b style="color:#111827">' + T('기간', 'Window') + '</b> — '
      +     T('수업기록 최근 90일, 학생 별점·칭찬은 최근 180일', 'lessons over 90 days; ratings and praise over 180 days')
      +     '<br><b style="color:#111827">' + T('순위', 'Rank') + '</b> — '
      +     T('활동중이면서 점수가 계산된 강사끼리만 매깁니다', 'only among active teachers with a computed score')
      +   '</div>'
      + '</div>');
  };

  window.openHrAnalysis = async function (id) {
    if (!id) return;
    var ov = shell('<div style="padding:28px 16px;text-align:center;color:#6b7280;font-size:13px">'
      + T('근거를 불러오는 중…', 'Loading breakdown…') + '</div>');

    try {
      var r = await fetch('/api/admin/teacher-hr-analysis?id=' + encodeURIComponent(id),
        { credentials: 'include', cache: 'no-store' });
      var d = await r.json();
      if (!d || !d.ok) throw new Error((d && d.message) || (d && d.error) || 'load_failed');
      render(ov, d.item);
    } catch (e) {
      ov.querySelector('[data-hr-box]').innerHTML =
        '<div style="padding:22px 18px;color:#b91c1c;font-size:13px;line-height:1.6">'
        + T('근거를 불러오지 못했습니다.', 'Could not load the breakdown.')
        + '<div style="color:#9ca3af;font-size:11.5px;margin-top:6px">' + esc(String(e && e.message || e)) + '</div>'
        + '<div style="margin-top:12px;text-align:right"><button data-close="1" style="padding:6px 14px;border:1px solid #e5e7eb;'
        + 'background:#fff;border-radius:8px;cursor:pointer;font-size:12.5px">' + T('닫기', 'Close') + '</button></div></div>';
    }
  };
})();
