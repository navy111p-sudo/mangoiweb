/* 🎬 A.i영화더빙 — 판정 정본(순수 함수, 화면 없음)
 * ─────────────────────────────────────────────────────────────────────────────
 * 화면(js/ai-dubbing.js)과 하니스(test-harness/ai_dubbing_harness.mjs)가 «같은 것» 을 부른다.
 * ⛔ 여기 판정을 화면 쪽에 다시 적지 말 것 — 두 벌이 되면 한쪽만 고쳐진다.
 *
 * 받는 자료(에피소드 매니페스트)는 ChatGPT 가 만드는 episode.json 모양을 그대로 따른다
 *   (연동 약속: docs/A.i영화더빙_화면연동_설명서.md).
 *   - 영상·음성 경로가 상대경로면 baseUrl 기준, 절대 URL 이면 그대로 쓴다.
 *   - 대사 시각(start/end)은 «timing:'synced'» 일 때만 믿는다. 그 밖에는 차례 모드(turn)로 돈다.
 *     ⚠️ 2026-10-20 현재 대사 시각은 40초 장면 기준인데 실제 영상은 15초 클립이라 맞지 않는다
 *        (그래서 지금 자료는 'provisional'). 지어내 맞추지 않는다.
 *   - 원본 영상 소리는 기본으로 «끈다» — AI 영상 생성기가 넣은 의미 없는 목소리 조각이 섞여 있다
 *     (실측: clip1 4.1~6.1초 · clip13 한국어 대사). videoAudio:'clean' 이라고 밝힌 장면만 켠다.
 */
(function (root) {
  'use strict';

  var MAX_STUDENTS = 5;

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function str(v) { return (v == null) ? '' : String(v); }
  function trim(v) { return str(v).trim(); }

  /* 상대경로 → 절대경로. 절대 URL(https:)·루트(/)는 그대로. 비면 '' */
  function resolveUrl(path, baseUrl) {
    var p = trim(path);
    if (!p) return '';
    if (/^(https?:)?\/\//i.test(p) || p.charAt(0) === '/' || /^(blob|data):/i.test(p)) return p;
    var b = trim(baseUrl);
    if (!b) return p;
    return b.replace(/\/+$/, '') + '/' + p.replace(/^\.?\/+/, '');
  }

  /* 글자 쌍 {ko,en} — 한쪽만 있으면 그쪽으로 채운다 */
  function pair(v, fallback) {
    if (v && typeof v === 'object') {
      var ko = trim(v.ko), en = trim(v.en);
      return { ko: ko || en || fallback || '', en: en || ko || fallback || '' };
    }
    var s = trim(v) || fallback || '';
    return { ko: s, en: s };
  }

  /* 에피소드 매니페스트를 검사·정리한다.
   * → { ok, episode, problems[] }  — problems 가 있어도 «재생할 수 있는 만큼» 은 돌려준다.
   *   ok=false 는 «한 장면도 재생할 수 없다» 는 뜻이다. */
  function normalizeEpisode(raw, opts) {
    var problems = [];
    var baseUrl = trim((opts && opts.baseUrl) || (raw && raw.baseUrl));
    if (!raw || typeof raw !== 'object') return { ok: false, episode: null, problems: ['manifest_not_object'] };

    var chars = {};
    var rawChars = raw.characters || {};
    Object.keys(rawChars).forEach(function (id) {
      var c = rawChars[id] || {};
      var cid = trim(c.id || id).toLowerCase();
      if (!/^[a-z0-9_-]{1,24}$/.test(cid)) { problems.push('bad_character_id:' + id); return; }
      chars[cid] = {
        id: cid,
        name: pair(c.name, cid),
        emoji: trim(c.emoji) || '🎭',
        ttsSpeaker: trim(c.ttsSpeaker) || '',
      };
    });

    var playable = (Array.isArray(raw.playable) ? raw.playable : Object.keys(chars))
      .map(function (x) { return trim(x).toLowerCase(); })
      .filter(function (x) { if (!chars[x]) { problems.push('playable_unknown:' + x); return false; } return true; });

    var timingDeclared = trim(raw.timing).toLowerCase() === 'synced' ? 'synced' : 'provisional';

    var scenes = [];
    (Array.isArray(raw.scenes) ? raw.scenes : []).forEach(function (s, si) {
      s = s || {};
      var no = isNum(s.no) ? s.no : si + 1;
      var video = resolveUrl(s.video, baseUrl);
      if (!video) { problems.push('scene' + no + ':no_video'); }
      var dur = isNum(s.durationSec) && s.durationSec > 0 ? s.durationSec : null;
      var lines = [];
      (Array.isArray(s.lines) ? s.lines : []).forEach(function (l, li) {
        l = l || {};
        var sp = trim(l.speaker).toLowerCase();
        var en = trim(l.en);
        if (!chars[sp]) { problems.push('scene' + no + ':line' + (li + 1) + ':unknown_speaker:' + sp); return; }
        if (!en) { problems.push('scene' + no + ':line' + (li + 1) + ':no_text'); return; }
        lines.push({
          id: trim(l.id) || ('s' + no + '-l' + (li + 1)),
          speaker: sp,
          en: en,
          ko: trim(l.ko),
          start: isNum(l.start) ? l.start : null,
          end: isNum(l.end) ? l.end : null,
          scored: l.scored !== false,
        });
      });
      var voices = {};
      var rv = s.voices || {};
      Object.keys(rv).forEach(function (k) {
        var cid = trim(k).toLowerCase();
        var u = resolveUrl(rv[k], baseUrl);
        if (chars[cid] && u) voices[cid] = u;
      });
      scenes.push({
        no: no,
        label: pair(s.label, 'Scene ' + no),
        video: video,
        poster: resolveUrl(s.poster, baseUrl),   // 장면 카드·영상 첫 화면(없으면 빈 값 — 화면이 이모지로 대신 그린다)
        durationSec: dur,
        bgm: resolveUrl(s.bgm, baseUrl),
        voices: voices,
        videoAudio: trim(s.videoAudio).toLowerCase() === 'clean' ? 'clean' : 'mute',
        lines: lines,
      });
    });
    if (!scenes.length) problems.push('no_scenes');

    // 장면마다 «시각을 믿어도 되는가» 와 «원어민 음성을 무엇으로 낼 것인가» 를 정한다.
    scenes.forEach(function (sc) {
      sc.timing = (timingDeclared === 'synced' && sceneTimingValid(sc)) ? 'synced' : 'turn';
      if (timingDeclared === 'synced' && sc.timing !== 'synced') problems.push('scene' + sc.no + ':timing_invalid_fallback_turn');
      sc.voiceMode = (sc.timing === 'synced' && sceneHasAllStems(sc)) ? 'stems' : 'tts';
    });

    var playableScenes = scenes.filter(function (s) { return s.video && s.lines.length; });
    var episode = {
      id: trim(raw.id) || 'episode',
      title: pair(raw.title, trim(raw.id) || 'Episode'),
      status: trim(raw.status) || 'preview',
      level: isNum(raw.level) ? raw.level : null,
      note: pair(raw.note, ''),
      characters: chars,
      playable: playable,
      timingDeclared: timingDeclared,
      scenes: scenes,
    };
    return { ok: playableScenes.length > 0 && playable.length > 0, episode: episode, problems: problems };
  }

  /* 시각이 쓸 만한가 — 모든 대사에 start<end, 0 이상, (길이를 알면) 장면 안, 겹침 없음 */
  function sceneTimingValid(sc) {
    if (!sc.lines.length) return false;
    var prevEnd = -1;
    for (var i = 0; i < sc.lines.length; i++) {
      var l = sc.lines[i];
      if (!isNum(l.start) || !isNum(l.end) || l.start < 0 || l.end <= l.start) return false;
      if (sc.durationSec != null && l.end > sc.durationSec + 0.05) return false;
      if (l.start < prevEnd - 0.05) return false;
      prevEnd = l.end;
    }
    return true;
  }

  /* 그 장면에서 말하는 캐릭터 «전원» 의 음성 파일이 있는가 — 하나라도 빠지면 TTS 로 간다 */
  function sceneHasAllStems(sc) {
    var need = {};
    sc.lines.forEach(function (l) { need[l.speaker] = true; });
    return Object.keys(need).every(function (k) { return !!sc.voices[k]; });
  }

  /* 학생 명단 검사 — cast = [{ name, character }] */
  function castProblems(cast, episode) {
    var out = [];
    if (!Array.isArray(cast) || cast.length < 1) out.push('no_students');
    else if (cast.length > MAX_STUDENTS) out.push('too_many_students');
    (cast || []).forEach(function (c, i) {
      if (!c || !episode || episode.playable.indexOf(c.character) < 0) out.push('student' + (i + 1) + ':no_character');
    });
    return out;
  }

  /* 학생이 맡은 캐릭터 = 원어민 목소리를 «끄는» 캐릭터 */
  function mutedCharacters(cast) {
    var m = {};
    (cast || []).forEach(function (c) { if (c && c.character) m[c.character] = true; });
    return m;
  }

  /* 대사마다 «누가 말하는가» 를 정한다.
   *  - 그 캐릭터를 고른 학생이 없으면 원어민(native).
   *  - 한 캐릭터를 여러 학생이 고르면 그 캐릭터 대사를 «차례대로 번갈아» 맡는다
   *    (캐릭터가 3명뿐인 에피소드에서도 1~5명이 함께 발표할 수 있게).
   *  counters 를 넘기면 장면을 넘어가도 차례가 이어진다(같은 학생만 계속 말하지 않게). */
  function assignLines(scene, cast, counters) {
    var byChar = {};
    (cast || []).forEach(function (c, idx) {
      if (!c || !c.character) return;
      (byChar[c.character] = byChar[c.character] || []).push(idx);
    });
    var ctr = counters || {};
    return scene.lines.map(function (l) {
      var who = byChar[l.speaker];
      if (!who || !who.length) return { line: l, performer: { type: 'native' } };
      var k = ctr[l.speaker] || 0;
      ctr[l.speaker] = k + 1;
      return { line: l, performer: { type: 'student', idx: who[k % who.length] } };
    });
  }

  /* 차례 모드에서 학생이 말할 시간(초) — 낱말 수로 잡고 위·아래를 묶는다.
   * 동기 모드는 대사 길이 + 여유. Azure 평가 상한(15초)을 넘지 않게. */
  function recordWindowSec(line, timing) {
    if (timing === 'synced' && isNum(line.start) && isNum(line.end)) {
      return Math.min(14, Math.max(1.5, (line.end - line.start) + 1.2));
    }
    var words = trim(line.en).split(/\s+/).filter(Boolean).length;
    return Math.min(12, Math.max(4, Math.round((words * 0.6 + 3) * 10) / 10));
  }

  /* 동기 모드: t 초에 «지금 화면에 띄울» 대사 번호(-1 = 없음) */
  function lineIndexAt(lines, t) {
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (isNum(l.start) && isNum(l.end) && t >= l.start - 0.15 && t < l.end + 0.35) return i;
    }
    return -1;
  }

  /* 학생별 점수 요약 — results = [{ studentIdx, score:{overall,...}|null, status }] */
  function summarize(results, cast) {
    var by = (cast || []).map(function (c, i) { return { idx: i, name: c.name, character: c.character, n: 0, scored: 0, sum: 0, skipped: 0 }; });
    (results || []).forEach(function (r) {
      var s = by[r.studentIdx];
      if (!s) return;
      s.n += 1;
      if (r.score && isNum(r.score.overall)) { s.scored += 1; s.sum += r.score.overall; }
      else if (r.status === 'no_speech' || r.status === 'skipped') s.skipped += 1;
    });
    return by.map(function (s) {
      return { idx: s.idx, name: s.name, character: s.character, lines: s.n, scored: s.scored, skipped: s.skipped,
        avg: s.scored ? Math.round(s.sum / s.scored) : null };
    });
  }

  /* 이야기 목록(data/dubbing/index.json) — 1·2·3편 고르기.
   * → [{ id, no, title{ko,en}, status: 'ready'|'coming', poster }]
   *   ⛔ 모르는 status 는 'coming'(못 여는 쪽)으로 — 준비 안 된 편이 «열리는» 쪽으로 새면 빈 화면이 뜬다. */
  function normalizeIndex(raw) {
    var list = (raw && Array.isArray(raw.episodes)) ? raw.episodes : [];
    var seen = {}, out = [];
    list.forEach(function (e, i) {
      e = e || {};
      var id = trim(e.id).toLowerCase();
      if (!/^[a-z0-9-]{1,40}$/.test(id) || seen[id]) return;
      seen[id] = true;
      out.push({
        id: id,
        no: isNum(e.no) ? e.no : i + 1,
        title: pair(e.title, id),
        status: trim(e.status).toLowerCase() === 'ready' ? 'ready' : 'coming',
        poster: resolveUrl(e.poster, ''),
      });
    });
    out.sort(function (a, b) { return a.no - b.no; });
    return out;
  }

  /* 원어민 대신 쓰는 TTS 화자 — 매니페스트에 없으면 성별 모름이라 무난한 기본값 */
  function ttsSpeakerFor(episode, charId) {
    var c = episode && episode.characters[charId];
    return (c && c.ttsSpeaker) || 'asteria';
  }

  var api = {
    MAX_STUDENTS: MAX_STUDENTS,
    resolveUrl: resolveUrl,
    normalizeEpisode: normalizeEpisode,
    normalizeIndex: normalizeIndex,
    sceneTimingValid: sceneTimingValid,
    sceneHasAllStems: sceneHasAllStems,
    castProblems: castProblems,
    mutedCharacters: mutedCharacters,
    assignLines: assignLines,
    recordWindowSec: recordWindowSec,
    lineIndexAt: lineIndexAt,
    summarize: summarize,
    ttsSpeakerFor: ttsSpeakerFor,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MangoiDubCore = api;
})(typeof window !== 'undefined' ? window : this);
