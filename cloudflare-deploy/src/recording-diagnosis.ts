/* 🩺 녹화 진단 — «이 수업이 잘 진행됐는가, 안 됐으면 언제 무엇이» (2026-09-29 사장님)
 *
 * [무엇을 하나] 녹화 한 건의 시간창 안에서 이미 쌓여 있는 두 기록을 읽어
 *   ✅ 정상 / ⚠️ 주의 / ❌ 문제 한 줄과 «녹화 몇 분째에 무엇이» 목록을 만든다.
 *     ① attendance — /api/attendance/join 이 «들어올 때마다» 한 행을 만든다(재입장 = 새 행).
 *        joined_at·left_at 은 서버 시각(ms)이라 «초 단위» 로 말할 수 있다.
 *     ② vc_quality — 각 브라우저가 1분마다 보내는 회선 요약(idx-vc-qlog.js).
 *        그래서 멈춤·소리끊김·음성만은 «분 단위» 다. ts 는 그 1분의 «끝» 시각.
 *
 * ⛔ AI 로 판정하지 않는다 — 같은 녹화에 날마다 다른 답을 하면 안 되고 비용도 0 이어야 한다.
 *    판정은 이 파일의 규칙이 정본이고 화면은 서버가 만든 문장을 «그리기만» 한다.
 * ⛔ 기록이 없으면 «문제없음» 이 아니라 «기록 없음» 이다(vc_quality 는 30일만 보관된다).
 *    모르는 것을 정상으로 말하면 이 저장소가 가장 오래 속은 방식이 된다(CLAUDE.md 2장).
 * ⚠️ rx_* 의 «모름» 은 -1 이다 — `|| 0` 으로 읽으면 모름이 «완벽» 으로 뒤집힌다.
 * ⚠️ 원인(회선·배포·탭 닫기)은 여기서 가릴 수 없다 — 「끊김」은 «다시 들어왔다» 는 사실까지만 말한다.
 *
 * 감시: test-harness/recording_diagnosis_harness.mjs (이 모듈을 실제로 돌린다)
 */

export interface DiagRec {
  room_id?: string | null;
  started_at?: number | null;
  ended_at?: number | null;
  duration_ms?: number | null;
  status?: string | null;
  storage?: string | null;
  participant_names?: string | null;
}
export interface DiagJoin {
  username?: string | null;
  account_uid?: string | null;
  user_id?: string | null;
  role?: string | null;
  joined_at?: number | null;
  left_at?: number | null;
  total_active_ms?: number | null;
  total_session_ms?: number | null;
}
export interface DiagQuality {
  ts?: number | null;
  uid?: string | null;
  name?: string | null;
  role?: string | null;
  avg_rtt?: number | null;
  aao?: number | null;
  rx_conceal?: number | null;
  rx_freeze?: number | null;
  rx_loss?: number | null;
}
export interface DiagEvent {
  at_ms: number;          // 녹화 시작부터 몇 ms (음수 = 녹화 전)
  label: string;          // 「08:11」 또는 「08분대」·「09~11분대」
  kind: 'join_late' | 'rejoin' | 'freeze' | 'conceal' | 'aao' | 'lag';
  sev: 'warn' | 'bad';
  text_ko: string;
  text_en: string;
}
export interface DiagResult {
  verdict: 'ok' | 'warn' | 'bad' | 'unknown';
  /* 한눈 등급(2026-09-29 사장님 «좋음·보통·나쁨 으로 처음에 미리») — verdict 에서만 나온다(GRADE 표). */
  grade: 'good' | 'fair' | 'poor' | 'unknown';
  grade_ko: string;
  grade_en: string;
  headline_ko: string;
  headline_en: string;
  events: DiagEvent[];
  notes_ko: string[];
  notes_en: string[];
  coverage: { quality_rows: number; join_rows: number };
}

/* 한눈 등급 — verdict 를 사람이 읽는 세 칸으로. ⛔ 새 판정을 만들지 않는다(verdict 가 정본).
   ⛔ «확인 불가» 를 «좋음» 으로 떨어뜨리지 않는다 — 기록이 없는 것은 잘 된 것이 아니다. */
export const GRADE = {
  ok:      { grade: 'good',    ko: '🟢 좋음',      en: '🟢 Good' },
  warn:    { grade: 'fair',    ko: '🟡 보통',      en: '🟡 Fair' },
  bad:     { grade: 'poor',    ko: '🔴 나쁨',      en: '🔴 Poor' },
  unknown: { grade: 'unknown', ko: '❔ 판정 불가', en: '❔ Unknown' },
} as const;
function withGrade(r: Omit<DiagResult, 'grade' | 'grade_ko' | 'grade_en'>): DiagResult {
  const g = GRADE[r.verdict] || GRADE.unknown;
  return { ...r, grade: g.grade, grade_ko: g.ko, grade_en: g.en };
}

/* 문턱 — 숫자를 바꾸면 하니스의 기대값도 함께 본다(하니스는 이 상수를 «읽어» 쓴다). */
export const DIAG = {
  SHORT_MS: 5 * 60000,        // 녹화가 이보다 짧으면 «짧음»
  LATE_MS: 3 * 60000,         // 녹화 시작보다 이만큼 늦게 첫 입장 → «늦게 들어옴»
  CONCEAL_PCT: 5,             // 받는 소리가 이 % 이상 메워졌으면 «소리 끊김»
  FREEZE_MIN: 1,              // 1분에 이만큼 이상 멈추면 «화면 멈춤»
  LAG_RTT_MS: 800,            // 응답 시간이 이 이상이면 «지연»
  SPEAK_LOW_PCT: 40,          // 학생 발화 비율이 이 미만이면 «발화 적음»
  MERGE_GAP_MS: 90 * 1000,    // 같은 종류가 이 간격 안에서 이어지면 한 구간으로 합친다
} as const;

const num = (v: any): number | null => {
  const n = Number(v);
  return (v === null || v === undefined || v === '' || !Number.isFinite(n)) ? null : n;
};
const pad2 = (n: number) => String(n).padStart(2, '0');

/* 녹화 시작부터의 ms → 「MM:SS」(음수면 「녹화 전」) */
export function clockLabel(atMs: number): string {
  if (atMs < 0) return '녹화 전';
  const s = Math.floor(atMs / 1000);
  return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
}
/* 1분 요약 창의 «시작» 분 → 「08분대」 / 구간이면 「09~11분대」 */
function minuteLabel(fromMs: number, toMs: number): string {
  if (toMs < 0) return '녹화 전';                 // 녹화 «전» 1분을 「00분대」로 보이게 하지 않는다
  const a = Math.max(0, Math.floor(fromMs / 60000));
  const b = Math.max(0, Math.floor(toMs / 60000));
  return a === b ? pad2(a) + '분대' : pad2(a) + '~' + pad2(b) + '분대';
}

/* 사람 한 명을 가리키는 열쇠 — 계정, 없으면 이름. **대소문자 그대로**(Kim/kim 은 다른 계정).
   ⛔ 기기번호(user_id)만 있는 행은 쓰지 않는다 — 접속마다 새 번호라 매번 «새 사람» 이 되어
      재입장을 영영 못 잡고 인원만 부풀린다(/api/gaze-score 폴백이 그런 빈 행을 만든다).
   이름과 계정이 한 행에 같이 있으면 그 둘을 한 사람으로 잇는다(aliasOf). */
function buildPersonKey(J: DiagJoin[]): (j: DiagJoin) => string {
  const nameToAcct = new Map<string, string>();
  for (const j of J) {
    const a = String(j.account_uid || '').trim(), n = String(j.username || '').trim();
    if (a && n && !nameToAcct.has(n)) nameToAcct.set(n, a);
  }
  return (j: DiagJoin) => {
    const a = String(j.account_uid || '').trim();
    if (a) return 'a:' + a;
    const n = String(j.username || '').trim();
    if (!n) return '';
    return nameToAcct.has(n) ? 'a:' + nameToAcct.get(n) : 'n:' + n;
  };
}
/* 회의방·공용방은 «수업» 이 아니다 — 혼자 켜 둔 녹화가 흔하다(CLAUDE.md 「회의방은 수업 아님」). */
function isClassRoom(room: any): boolean { return /^class-/.test(String(room || '')); }
function roleOf(r: any): 'teacher' | 'student' | 'other' {
  const s = String(r || '').toLowerCase();
  if (s === 'teacher' || s === 'admin' || s === 'staff') return 'teacher';
  if (s === 'student') return 'student';
  return 'other';
}
function who(role: string, name: string, en: boolean): string {
  const r = roleOf(role);
  const base = en ? (r === 'teacher' ? 'Teacher' : r === 'student' ? 'Student' : 'Participant')
                  : (r === 'teacher' ? '교사' : r === 'student' ? '학생' : '참가자');
  return name ? base + '(' + name + ')' : base;
}

export function diagnoseRecording(rec: DiagRec, joins: DiagJoin[] | null, quality: DiagQuality[] | null): DiagResult {
  const events: DiagEvent[] = [];
  const notes_ko: string[] = [];
  const notes_en: string[] = [];
  const startRaw = num(rec.started_at);
  if (!startRaw) {
    return withGrade({ verdict: 'unknown', headline_ko: '❔ 확인 불가 — 녹화 시작 시각이 없습니다.', headline_en: '❔ Unknown — the recording has no start time.',
             events, notes_ko, notes_en, coverage: { quality_rows: 0, join_rows: 0 } });
  }
  const start = startRaw;
  const durMs = num(rec.duration_ms);
  /* ⚠️ null = «못 읽음», [] = «읽었는데 없음». 둘을 같은 글자로 만들지 않는다. */
  const joinsKnown = Array.isArray(joins), qualityKnown = Array.isArray(quality);
  const J0 = (joinsKnown ? joins as DiagJoin[] : []).filter(j => num(j.joined_at) !== null);
  const Q = (qualityKnown ? quality as DiagQuality[] : []).filter(q => num(q.ts) !== null);
  const personKey = buildPersonKey(J0);
  const J = J0.filter(j => personKey(j));
  const anonRows = J0.length - J.length;
  let bad = false;
  let warn = false;

  /* ── ① 입장·재입장 (초 단위) ─────────────────────────── */
  const byPerson = new Map<string, DiagJoin[]>();
  for (const j of J) {
    const k = personKey(j);
    if (!k) continue;
    if (!byPerson.has(k)) byPerson.set(k, []);
    byPerson.get(k)!.push(j);
  }
  for (const list of byPerson.values()) {
    list.sort((a, b) => (num(a.joined_at) || 0) - (num(b.joined_at) || 0));
    const first = list[0];
    const role = String(first.role || '');
    const nm = String(first.username || first.account_uid || '').trim();
    const firstAt = (num(first.joined_at) as number) - start;
    if (firstAt > DIAG.LATE_MS) {
      warn = true;
      const m = Math.round(firstAt / 60000);
      events.push({ at_ms: firstAt, label: clockLabel(firstAt), kind: 'join_late', sev: 'warn',
        text_ko: '🕒 ' + who(role, nm, false) + ' 녹화 시작 ' + m + '분 뒤에 들어옴',
        text_en: '🕒 ' + who(role, nm, true) + ' joined ' + m + ' min after the recording started' });
    }
    for (let i = 1; i < list.length; i++) {
      const cur = list[i], prev = list[i - 1];
      const at = (num(cur.joined_at) as number) - start;
      const prevLeft = num(prev.left_at);
      const gapS = (prevLeft !== null && prevLeft <= (num(cur.joined_at) as number))
        ? Math.round(((num(cur.joined_at) as number) - prevLeft) / 1000) : null;
      warn = true;
      events.push({ at_ms: at, label: clockLabel(at), kind: 'rejoin', sev: 'warn',
        text_ko: '🔌 ' + who(role, nm, false) + ' 연결이 끊겼다가 다시 들어옴'
          + (gapS !== null ? ' (약 ' + gapS + '초 끊김)' : ''),
        text_en: '🔌 ' + who(role, nm, true) + ' dropped and rejoined'
          + (gapS !== null ? ' (~' + gapS + 's gap)' : '') });
    }
  }

  /* ── ② 회선 1분 요약 (분 단위) — 같은 사람·같은 종류가 이어지면 한 구간으로 ── */
  type Hit = { kind: DiagEvent['kind']; person: string; role: string; name: string; from: number; to: number; val: number };
  const hits: Hit[] = [];
  for (const q of Q) {
    const winEnd = (num(q.ts) as number) - start;
    const winStart = winEnd - 60000;
    const person = String(q.uid || q.name || '').toLowerCase();
    const base = { person, role: String(q.role || ''), name: String(q.name || q.uid || ''), from: winStart, to: winStart };
    const fr = num(q.rx_freeze);
    if (fr !== null && fr >= DIAG.FREEZE_MIN) hits.push({ ...base, kind: 'freeze', val: fr });
    const cc = num(q.rx_conceal);
    if (cc !== null && cc >= 0 && cc >= DIAG.CONCEAL_PCT) hits.push({ ...base, kind: 'conceal', val: cc });
    const aao = num(q.aao);
    if (aao !== null && aao > 0) hits.push({ ...base, kind: 'aao', val: 1 });
    const rtt = num(q.avg_rtt);
    if (rtt !== null && rtt >= DIAG.LAG_RTT_MS) hits.push({ ...base, kind: 'lag', val: rtt });
  }
  hits.sort((a, b) => a.from - b.from);
  const merged: Hit[] = [];
  for (const h of hits) {
    const last = [...merged].reverse().find(m => m.kind === h.kind && m.person === h.person);
    if (last && h.from - last.to <= DIAG.MERGE_GAP_MS) {
      last.to = h.from;
      last.val = (h.kind === 'freeze') ? last.val + h.val : Math.max(last.val, h.val);
    } else merged.push({ ...h });
  }
  for (const m of merged) {
    const w = who(m.role, m.name, false), we = who(m.role, m.name, true);
    const label = minuteLabel(m.from, m.to);
    let ko = '', en = '', sev: 'warn' | 'bad' = 'warn';
    if (m.kind === 'freeze') {
      ko = '🧊 ' + w + ' 화면에서 상대 영상이 멈춤 ' + m.val + '회';
      en = '🧊 Video froze ' + m.val + 'x on ' + we + "'s screen";
    } else if (m.kind === 'conceal') {
      ko = '🔇 ' + w + ' 쪽에서 상대 소리가 끊김 (최대 ' + Math.round(m.val) + '%)';
      en = '🔇 Audio breaking up for ' + we + ' (up to ' + Math.round(m.val) + '%)';
      if (m.val >= 15) sev = 'bad';
    } else if (m.kind === 'aao') {
      ko = '📵 ' + w + ' 회선이 나빠 영상을 끄고 음성만 보냄';
      en = '📵 ' + we + ' switched to audio-only (poor connection)';
    } else {
      ko = '🐢 ' + w + ' 지연이 큼 (응답 ' + Math.round(m.val) + 'ms)';
      en = '🐢 High latency for ' + we + ' (' + Math.round(m.val) + ' ms)';
    }
    if (sev === 'bad') bad = true; else warn = true;
    events.push({ at_ms: m.from, label, kind: m.kind, sev, text_ko: ko, text_en: en });
  }
  events.sort((a, b) => a.at_ms - b.at_ms);

  /* ── ③ 녹화 전체 ────────────────────────────────────── */
  let names: any[] = [];
  try { names = JSON.parse(String(rec.participant_names || '[]')); } catch { names = []; }
  const distinctPeople = byPerson.size;
  /* 혼자 판정은 «입장 기록을 실제로 읽었고 누군가는 있었다» 일 때만 — 못 읽었거나 0건이면
     «혼자» 가 아니라 «모름» 이다. 수업방(class-)이 아니면 ❌ 로 몰지 않는다. */
  const soloByLog = joinsKnown && distinctPeople === 1 && (Array.isArray(names) ? names.length : 0) <= 1;
  const alone = soloByLog && isClassRoom(rec.room_id);
  if (alone) {
    bad = true;
    notes_ko.push('❌ 참가자가 1명뿐입니다 — 상대가 들어오지 않은 것으로 보입니다.');
    notes_en.push('❌ Only one participant — the other side does not seem to have joined.');
  } else if (soloByLog) {
    notes_ko.push('ℹ️ 혼자 있던 녹화입니다(회의방·공용방이라 수업으로 판정하지 않습니다).');
    notes_en.push('ℹ️ Only one person (meeting/open room — not judged as a lesson).');
  }
  if (String(rec.status || '') === 'upload_failed') {
    bad = true;
    notes_ko.push('❌ 녹화 파일 저장이 실패했습니다(수업 자체의 문제와는 다를 수 있습니다).');
    notes_en.push('❌ The recording failed to save (this may differ from how the lesson itself went).');
  }
  if (String(rec.storage || '') === 'r2_snapshot') {
    warn = true;
    notes_ko.push('⚠️ 임시 저장본입니다 — 수업 전체가 담기지 않았을 수 있습니다.');
    notes_en.push('⚠️ Recovered snapshot — the whole lesson may not be in the file.');
  }
  if (durMs !== null && durMs > 0 && durMs < DIAG.SHORT_MS) {
    warn = true;
    const m = Math.max(1, Math.round(durMs / 60000));
    notes_ko.push('⚠️ 녹화가 ' + m + '분 이하로 짧습니다.');
    notes_en.push('⚠️ The recording is short (' + m + ' min or less).');
  }
  /* 학생 발화 — 학생 행만. 표본이 없으면 말하지 않는다(모름 ≠ 0%). */
  let act = 0, ses = 0;
  for (const j of J) {
    if (roleOf(j.role) !== 'student') continue;
    const a = num(j.total_active_ms), s = num(j.total_session_ms);
    if (a !== null && s !== null && s > 0) { act += a; ses += s; }
  }
  if (ses >= 60000) {
    const pct = act * 100 / ses;
    if (pct < DIAG.SPEAK_LOW_PCT) {
      warn = true;
      notes_ko.push('⚠️ 학생이 말한 시간이 적습니다 (' + pct.toFixed(0) + '%).');
      notes_en.push('⚠️ The student spoke little (' + pct.toFixed(0) + '%).');
    }
  }
  if (!qualityKnown) {
    notes_ko.push('❔ 회선 기록을 읽지 못했습니다 — 화면 멈춤·소리 끊김은 판정하지 못했습니다.');
    notes_en.push('❔ Could not read the connection log — freezes and audio drops not checked.');
  } else if (!Q.length) {
    notes_ko.push('ℹ️ 회선 기록이 없습니다 — 화면 멈춤·소리 끊김은 판정하지 못했습니다(기록은 30일만 보관).');
    notes_en.push('ℹ️ No connection log — freezes and audio drops could not be checked (kept 30 days).');
  }
  if (!joinsKnown) {
    notes_ko.push('❔ 입장 기록을 읽지 못했습니다 — 끊김·재입장은 판정하지 못했습니다.');
    notes_en.push('❔ Could not read the join log — drops and rejoins not checked.');
  } else if (!J.length) {
    notes_ko.push('ℹ️ 입장 기록이 없습니다 — 끊김·재입장은 판정하지 못했습니다.');
    notes_en.push('ℹ️ No join log — drops and rejoins could not be checked.');
  }
  if (anonRows > 0) {
    notes_ko.push('ℹ️ 이름·계정 없이 남은 입장 기록 ' + anonRows + '건은 누구인지 몰라 판정에서 뺐습니다.');
    notes_en.push('ℹ️ ' + anonRows + ' join row(s) had no name or account and were left out.');
  }

  /* ── ④ 한 줄 판정 ─────────────────────────────────── */
  let verdict: DiagResult['verdict'];
  if (bad) verdict = 'bad';
  else if (warn) verdict = 'warn';
  else if (!Q.length && !J.length) verdict = 'unknown';   // ⛔ 아무 기록도 없으면 «정상» 이라 하지 않는다
  else verdict = 'ok';
  /* 한쪽 기록만 있으면 «정상» 이 아니라 «확인된 범위에서는 문제 없음» 이다 — 재지 않은 것을 단정하지 않는다. */
  const partial = verdict === 'ok' && (!Q.length || !J.length);

  const cnt = (k: DiagEvent['kind']) => events.filter(e => e.kind === k).length;
  const parts_ko: string[] = [], parts_en: string[] = [];
  if (alone) { parts_ko.push('상대 미입장'); parts_en.push('other side never joined'); }
  if (cnt('rejoin')) { parts_ko.push('끊김 ' + cnt('rejoin') + '회'); parts_en.push(cnt('rejoin') + ' drop(s)'); }
  if (cnt('freeze')) { parts_ko.push('화면 멈춤'); parts_en.push('video freezes'); }
  if (cnt('conceal')) { parts_ko.push('소리 끊김'); parts_en.push('audio drops'); }
  if (cnt('aao')) { parts_ko.push('음성만 전송'); parts_en.push('audio-only'); }
  if (cnt('lag')) { parts_ko.push('지연'); parts_en.push('latency'); }
  if (cnt('join_late')) { parts_ko.push('늦은 입장'); parts_en.push('late join'); }

  const head = (verdict === 'ok' && partial)
      ? (!Q.length ? ['✅ 입장 기록상 끊김은 없었습니다 — 화면 멈춤·소리는 기록이 없어 확인 못 함.', '✅ No drops in the join log — freezes/audio not checked (no connection log).']
                   : ['✅ 회선 기록상 멈춤·소리 끊김은 없었습니다 — 재입장은 기록이 없어 확인 못 함.', '✅ No freezes/audio drops in the connection log — rejoins not checked (no join log).'])
    : verdict === 'ok' ? ['✅ 정상 — 기록상 끊김·멈춤이 없었습니다.', '✅ OK — no drops or freezes on record.']
    : verdict === 'unknown' ? ['❔ 확인 불가 — 판정할 기록이 없습니다.', '❔ Unknown — no logs to judge from.']
    : [(verdict === 'bad' ? '❌ 문제' : '⚠️ 주의') + (parts_ko.length ? ' — ' + parts_ko.join(' · ') : ''),
       (verdict === 'bad' ? '❌ Problem' : '⚠️ Check') + (parts_en.length ? ' — ' + parts_en.join(' · ') : '')];

  return withGrade({ verdict, headline_ko: head[0], headline_en: head[1], events, notes_ko, notes_en,
           coverage: { quality_rows: Q.length, join_rows: J.length } });
}
