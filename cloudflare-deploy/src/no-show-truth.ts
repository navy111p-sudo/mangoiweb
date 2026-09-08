/* ══════════════════════════════════════════════════════════════════════════
   🔎 「강사 미입장」이 정말 미입장이었나 — 출석 기록과 대조하는 판정 (2026-08-19)

   [왜 필요한가] `class_no_show` 의 «강사 미입장» 행은 **학생 브라우저가** 만든다.
     5분을 기다려도 상대가 화면에 안 보이면 신고하는 구조라, «상대가 안 왔다» 가 아니라
     «내 화면에 안 보였다» 가 기록된다. 두 사람이 서로 다른 워커의 방에 있던 동안
     (test.mangoi.co.kr = 기본 워커 / mangoi.ai = -prod, CLAUDE.md 0장·2장 참고
      — ✅ 2026-08-27 이전 완료로 **이제 같은 워커다**(사장님이 demo-1 로 확인). 8/19 에도
        「합쳤다」고 적혔지만 확인을 안 해 사실이 아니었고, 그 사이 8/25·8/27 에 재발했다.
        ⚠️ 그 전에 쌓인 오판 기록은 그대로 남아 있으므로 아래 대조는 계속 필요하다)
     강사는 매번 들어와 13분씩 수업 화면을 지키고 있었는데도 알림이 떴다.
     실측(2026-08-19): 강사 미입장 13건 중 **11건이 오판**. 강사 잘못이 아닌데
     그 숫자가 강사 90일 평가 지표에 그대로 들어가고 있었다.

   [고치는 방향] ⛔ 기록을 지우거나 고쳐 쓰지 않는다. 그때 학생이 못 본 것은 사실이고,
     지우면 «왜 수업이 성립하지 않았나» 라는 더 중요한 사실까지 사라진다.
     대신 **읽을 때 출석 기록과 대조해서 «오판» 이라고 함께 알려 준다.**

   [판정 규칙 — 안전한 방향으로만 틀리게]
     · 오판(=강사 있었음)으로 «올리는» 근거는 **이름 일치뿐**이다.
       ⛔ `attendance.role='teacher'` 만으로는 판정하지 않는다 — role 은 클라이언트가
          보내는 값이고, 「먼저 들어온 학생이 강사 역할을 받는다」 사고 전례가 있다
          (api-mango.ts verify-room 주석). 그걸 믿으면 **진짜 노쇼가 오판으로 감춰진다.**
     · 이름은 **낱말 경계**로 맞춘다. api-teacher.ts 의 계정↔원부 규칙과 같은 판정이다:
         살릴 것 : '교사 강선생님' → '강선생님' ⊂ '중국어 강선생님' (낱말 하나가 통째로)
         막을 것 : 'Anna' ⊂ 'H·ANNA·H'                            (낱말 속 우연)
     · 이름을 알 수 없으면(teacher_name 이 비었거나 출석행 username 이 전부 null)
       **'모름'(null)** 을 돌려준다. 모르는 것을 «오판» 이라고 단정하지 않는다.
     · 🆕 (2026-08-26) 출석 이름이 «계정아이디» 로 찍히는 경우가 있어, 이름만 맞춰서는
       뚫린다. `teacher_account_links` 로 **계정 → 원부 이름** 을 한 번 풀어서도 맞춘다.
         실사고: 예약은 'HANNAH'(teachers.id=24) 인데 출석부에는 '교사 mangoi_167'
         (계정아이디)로 찍혀 낱말이 하나도 안 겹쳤다 → hit 이 비어 **present:false**
         (=「강사가 없었다」로 **확정**)가 됐고, 급여는 present===true 일 때만 되돌리므로
         (api-admin.ts) 들어와 수업한 강사에게 0원이 나갈 상태였다.
         강선생님 건 13건이 잘 걸러진 것은 우연히 예약명(중국어 강선생님)과
         출석명(교사 강선생님)의 표기가 맞았기 때문이다 — 규약은 사람마다 다르다.
       ⛔ 계정 해석은 **후보가 하나일 때만** 쓴다. 한 계정이 여러 강사로 풀리면
          이름을 잘못 붙여 «진짜 노쇼를 감추는» 쪽으로 틀리므로 그냥 버린다.
       ⛔ 계정 조회는 **대소문자 무시**여야 한다 — `mangoi_167` 과 `Mangoi_167` 이
          실제로 둘 다 있다(CLAUDE.md 2장 「같은 사람인데 계정이 두 개」).

   ⚠️ 판정을 두 벌 두지 않으려고 이 파일 하나로 모았다. 노쇼 리포트와 강사 90일 지표가
      같은 함수를 쓴다 — 한쪽만 고치면 화면마다 다른 답이 나온다(이 저장소의 단골 사고).
   ══════════════════════════════════════════════════════════════════════════ */
import { selectInChunks } from './d1-chunk';

/** 역할 접두사를 뗀다. 화상수업 입장 이름은 '교사 {이름}' 규약이다(teacher.html joinClass). */
const stripRolePrefix = (s: any): string =>
  String(s || '').replace(/^\s*(?:교사|강사|선생님|Teacher|Tutor)\s+/i, '').trim();

const nrm = (s: any): string => String(s || '').toUpperCase().trim();
/** 표기에서 실제로 쓰이는 구분자들 — '중국어 강선생님' · 'HT FARRAH' */
const words = (s: any): string[] => nrm(s).split(/[\s·・,/()[\]-]+/).filter(Boolean);

/* 🔗 같은 사람인데 표기가 다른 이름 — «완전일치 쌍» 만 손으로 적는다 (2026-09-08)

   [왜] 예약표(teachers.name)와 화상방 입장 표기가 서로 다른 강사가 실제로 있다.
     실사고(2026-09-08 class-1924): 원부는 'FAR'(teachers.id=22) 인데 그 강사는
     '교사 Teacher - Farrah' 로 들어온다. 낱말 경계로는 어긋나고('FARRAH' 는 'FAR' 이
     아니다), 'Teacher - Farrah' 는 계정이 아니라 계정 해석(accountToTeacherName)도
     못 푼다 → **이름을 붙이는 두 경로가 다 실패**했다. 그 결과
       (1) 강사가 1분 52초 «먼저» 들어와 있는데 「강사 미입장」 푸시가 나갔다
           (notified_push=1 — 같은 날 이름이 붙어 억제된 세 건과 대조된다)
       (2) present 가 **false**(=「없었다」로 확정)라 급여 되돌림도 안 걸렸다.
           실측 21분 05초 수업한 강사의 수업이 노쇼로 남는다.
   [잰 것 — 2026-09-08, 최근 30일 강사 접속 254회] 이름을 못 붙이는 표기는 2종 59회다.
     · '교사'(이름 없이 입장) 34회 — 정보 자체가 없어 **원리상 못 고친다**.
     · '교사 Teacher - Farrah' 25회 — 고칠 수 있는 것은 이것 하나뿐이다.
     나머지(Kaye·Kes·Krystel·Hannah·Shas·Cindy·Win·계정형 mangoi_xxx)는 전부 붙는다.

   ⛔ **부분일치를 여는 것이 아니다.** 'FAR' 이 'FARRAH' 안에 들어 있다고 붙이기 시작하면
      'ANNA' ⊂ 'HANNAH' 가 되살아나 **남의 이름이 붙는다.** 그 방향은 진짜 노쇼를 감추고
      수업료를 전액 내보내므로 이 파일에서 가장 나쁜 실수다.
      그래서 **여기 적힌 쌍만** 같은 사람으로 본다 — 'KRY' 는 'KRYSTEL' 에 안 붙는다.
   ⛔ 한 그룹에 서로 다른 두 사람을 넣지 말 것. 줄을 더할 때는 **`teachers` 전체**와
      대조해 «다른 강사의 이름·낱말과 겹치지 않는지» 먼저 확인할 것.
      ⚠️ **`active=1` 만 보면 못 잡는다** — 여기서 문제가 된 `HT FARRAH` 는 `active=0`
         (퇴사)인데도 이름이 남아 있어, 출석 표기에 그 이름이 찍히면 그대로 붙는다.
   ⚠️ 이 표는 «이름» 만 넓힌다 — 계정↔원부 해석(accountToTeacherName)은 그대로다.
   ⚠️ 근본 해결은 표기를 한쪽으로 맞추는 것이다(예약표를 고치거나 입장 이름을 계정으로
      통일). D1·화면이 걸린 별건이라 사람이 정한다 — 그때 이 표에서 그 줄을 지운다. */
const NAME_ALIASES: readonly (readonly string[])[] = [
  // 원부 'FAR'(teachers.id=22) ↔ 입장 표기 '교사 Teacher - Farrah'(실측 25회).
  //   동일인 근거: teacher_profiles.id=27 이 korean_name='Teacher Far' · english_name='Teacher Farrah'.
  //   ⚠️ 왜 여러 값을 적는가 — 역할 접두사가 벗겨지는 «횟수» 가 부르는 자리마다 다르다(아래 주석).
  //   'HT FARRAH' 는 teachers.id=3(퇴사) 의 표기다 — **같은 사람**임을 2026-09-08 에 사장님이
  //     확인해 주셔서 그룹에 넣는다. 그 전에는 «다른 사람» 으로 보고 일부러 뺐었다.
  //     ⚠️ 그렇다고 부분일치를 여는 것이 아니다 — 'HT NESS' 는 낱말 'HT' 를 나눠 갖지만
  //        그룹에 없으므로 안 붙는다(하니스 D-15 가 잰다).
  ['FAR', 'FARRAH', 'TEACHER FARRAH', 'HT FARRAH'],
];

/** 표기 차이를 흡수한 별칭 조회용 열쇠 — 구분자를 낱말 사이 한 칸으로 고른다.
 *  'Teacher - Farrah' 와 'Teacher Farrah' 가 같은 열쇠가 된다(둘 다 'TEACHER FARRAH'). */
const aliasKey = (s: any): string => words(s).join(' ');

/** 두 이름이 «같은 별칭 그룹» 에 **둘 다** 들어 있는가. */
function sameByAlias(x: string, y: string): boolean {
  const kx = aliasKey(x), ky = aliasKey(y);
  if (!kx || !ky) return false;
  for (const g of NAME_ALIASES) if (g.indexOf(kx) >= 0 && g.indexOf(ky) >= 0) return true;
  return false;
}

/** 낱말 경계로 같은 사람인가. api-teacher.ts 의 wordMatch 와 같은 규칙 + 위 별칭표. */
export function sameTeacherByWord(a: any, b: any): boolean {
  const x = nrm(stripRolePrefix(a)), y = nrm(stripRolePrefix(b));
  if (!x || !y) return false;
  // ① 옛 규칙 그대로 — 여기까지는 별칭이 없던 때와 한 글자도 다르지 않다.
  if (x === y) return true;
  if (words(x).indexOf(y) >= 0 || words(y).indexOf(x) >= 0) return true;
  /* ② 별칭 — «이름 전체» 끼리만 본다.
     🔴 ⛔ **별칭을 상대의 «낱말» 에까지 넓히면 안 된다.** 넓히면 별칭이 상대 이름의
        «낱말» 에 걸려, 표에 없는 사람까지 같은 사람으로 붙는다. 부분일치를 연 것이 아닌데도
        결과가 같아지는 자리다 — 실제로 한 번 그렇게 짰다가 함정 대조가 잡았다.
        (그때 걸린 것은 'FARRAH' ⊂ 'HT FARRAH' 였는데, 그 둘은 2026-09-08 에 «같은 사람» 으로
         확인되어 지금은 그룹에 함께 있다. 그래도 **이 금지는 그대로다** — 낱말까지 넓히면
         'HT NESS' 처럼 낱말 'HT' 만 겹치는 남까지 딸려 온다.)
        그 방향은 **진짜 노쇼를 감추고 수업료를 전액 내보낸다.**
     ⟹ 그 오염이 여기서 안 나는 이유는 **양쪽이 «둘 다» 그룹에 있어야** 붙기 때문이다.
        'HT FARRAH' 는 그룹에 없으므로 'FAR' 방의 접속으로 인정되지 않는다(하니스 D-15 가 잰다).
        ℹ️ 'FARRAH' 대 'HT FARRAH' 가 붙는 것은 **별칭과 무관한 옛 낱말 규칙**이다(①) —
           별칭표를 비워도 똑같이 true 다. 예약 이름은 실측상 'FAR' 이라 이 경로는 안 닿는다.

     ⚠️ [표에 적을 값을 고를 때] **역할 접두사가 두 번 벗겨진다.**
        `teacherPresenceByRoom` 의 `namesOf()` 가 한 번 벗기고(`'교사 Teacher - Farrah'`
        → `'Teacher - Farrah'`), 그 값을 받은 이 함수가 **또 한 번** 벗긴다(→ `'- Farrah'`).
        그래서 **실제 경로**(출석 대조)에 닿는 열쇠는 `'FARRAH'` 이고,
        `sameTeacherByWord` 를 **직접** 부르면(한 번만 벗김) `'TEACHER FARRAH'` 다.
        ⛔ 둘 중 하나만 적으면 다른 쪽에서 **조용히 안 걸린다** — 실제로 각각 한 번씩
           그렇게 적었다가 하니스 D-4(실제 경로)와 D-14(그룹 전수)가 잡았다.
           새 줄을 더할 때는 **반드시 하니스로 확인**할 것. 눈으로는 안 보인다. */
  return sameByAlias(x, y);
}

/**
 * 접속 구간들을 합쳐 «실제로 붙어 있던 시간»(분)을 낸다.
 *
 * [왜 «간격» 이 아니라 «합» 인가 — 2026-08-26]
 *   예전엔 «맨 처음 입장 ~ 맨 마지막 퇴장» 의 간격을 그대로 분으로 냈다. 그런데 강사는
 *   수업 전에 시험 삼아 잠깐 들어와 보기도 하고, 안 보이면 나갔다 들어오기를 반복한다.
 *   그러면 사이의 **빈 시간까지 접속 시간에 들어간다.**
 *   실측(class-895-20260825): 16:27 시험 입장 ~ 21:41 마지막 퇴장 = **314분** 으로 떴다.
 *   20분짜리 수업인데 「5시간 14분 접속」 이라고 적히는 셈이다.
 *   이 숫자는 «오판입니다» 라는 판정 **바로 옆에** 붙고 그 판정은 수업료를 되돌린다 —
 *   말이 안 되는 숫자가 붙으면 맞는 판정까지 못 믿게 된다.
 *
 * ⚠️ 그냥 더하면 안 된다. 같은 사람이 **두 기기로 동시에** 들어와 있는 일이 실제로 있다
 *    (같은 사고에서 교사 기기가 2대였다). 겹치는 구간을 두 번 세면 이번엔 반대로 부풀어진다.
 *    → 겹치는 것을 하나로 **합집합** 한 뒤 더한다.
 */
function connectedMinutes(spans: Array<[number, number]>): number | null {
  const ok = spans
    .filter(([s, e]) => s > 0 && e > s)      // 시각이 없거나 뒤집힌 행은 셈에서 뺀다
    .sort((a, b) => a[0] - b[0]);
  if (!ok.length) return null;
  let total = 0;
  let curS = ok[0][0], curE = ok[0][1];
  for (let i = 1; i < ok.length; i++) {
    const [s, e] = ok[i];
    if (s <= curE) { if (e > curE) curE = e; }   // 겹치거나 맞닿음 → 하나로 잇는다
    else { total += curE - curS; curS = s; curE = e; }
  }
  total += curE - curS;
  return Math.round(total / 60000);
}

/**
 * 계정아이디 → 원부 강사 이름. 화상수업 입장 이름이 «교사 {계정아이디}» 로 찍히는 경우를 푼다.
 *
 * ⚠️ 실패해도 던지지 않는다 — 이 해석은 **덤**이다. 조회가 안 되면 빈 Map 을 돌려주고
 *    판정은 예전과 100% 동일하게(이름 문자열끼리만) 동작한다.
 * ⛔ 한 계정이 여러 강사로 풀리면 **버린다**. 틀린 이름을 붙이면 진짜 노쇼가 오판으로
 *    감춰지고 수업료가 전액 나간다 — 이 파일에서 가장 나쁜 방향의 실수다.
 */
async function accountToTeacherName(db: any, accounts: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  // 대소문자 무시로 맞춘다 — mangoi_167 / Mangoi_167 이 실제로 둘 다 있다.
  const keys = Array.from(new Set(accounts.map((a) => nrm(a)).filter(Boolean)));
  if (!keys.length) return out;

  let rows: any[] = [];
  try {
    // ⚠️ D1 바인드 100개 한도 — 손으로 자르지 말고 공용 selectInChunks 를 쓴다(CLAUDE.md 2장).
    rows = await selectInChunks<any>(db, keys, (ph) =>
      `SELECT l.username AS acct,
              COALESCE(NULLIF(TRIM(l.teacher_name), ''), t.name) AS tname
         FROM teacher_account_links l
         LEFT JOIN teachers t ON CAST(t.id AS TEXT) = CAST(l.teacher_id AS TEXT)
        WHERE UPPER(l.username) IN (${ph})`);
  } catch (e: any) {
    console.warn('[no-show-truth] 계정↔원부 조회 실패 — 계정 해석 생략:', e?.message);
    return out;
  }

  const cands = new Map<string, Set<string>>();
  for (const r of rows || []) {
    const k = nrm(r?.acct);
    const v = String(r?.tname || '').trim();
    if (!k || !v) continue;
    const set = cands.get(k) || new Set<string>();
    set.add(nrm(v));
    cands.set(k, set);
    out.set(k, v);
  }
  // 후보가 둘 이상인 계정은 «모르는 것» 으로 둔다(위 ⛔).
  for (const [k, set] of cands) if (set.size > 1) out.delete(k);
  return out;
}

export interface TeacherPresence {
  /** true=있었음(오판) · false=흔적 없음(진짜) · null=판정 불가 */
  present: boolean | null;
  from: number | null;
  to: number | null;
  minutes: number | null;
}

export interface NoShowRowLike {
  room_id?: string | null;
  missing_role?: string | null;
  /** ⚠️ **이 이름 그대로** 실어 보낼 것. `AS tn` 같은 별칭만 두면 이름이 빈 값이 되어
   *   전부 «모름» 이 되고 오판이 하나도 안 걸러진다 — 에러 없이 조용히 무효화된다
   *   (2026-08-19 강사 90일 지표에서 실제로 밟음). */
  teacher_name?: string | null;
  /** 있으면 «강사와 학생 이름이 둘 다 걸리는» 애매한 접속을 걸러내는 데 쓴다(없어도 동작). */
  student_name?: string | null;
}

/**
 * 「강사 미입장」 행들에 대해 방마다 «강사가 실제로 접속해 있었는가» 를 판정한다.
 * @returns room_id → TeacherPresence (강사 미입장 행이 있는 방만 담긴다)
 *
 * ⚠️ 실패해도 던지지 않는다 — 이 대조는 **덤**이고, 노쇼 리포트 자체가 안 뜨면 더 나쁘다.
 *    조회가 실패하면 빈 Map 을 돌려주고 화면은 예전과 100% 동일하게 동작한다.
 */
export async function teacherPresenceByRoom(
  db: any,
  rows: NoShowRowLike[],
): Promise<Map<string, TeacherPresence>> {
  const out = new Map<string, TeacherPresence>();
  const nameOf = new Map<string, string>();
  const stuOf = new Map<string, string>();
  for (const r of rows || []) {
    if (String(r?.missing_role || '') !== 'teacher') continue;
    const room = String(r?.room_id || '').trim();
    if (!room) continue;
    // 같은 방에 노쇼 행이 두 개인 경우가 실제로 있다(중복 신고) → 이름은 처음 것만 쓴다.
    if (!nameOf.has(room)) {
      nameOf.set(room, String(r?.teacher_name || '').trim());
      stuOf.set(room, String(r?.student_name || '').trim());
    }
  }
  if (!nameOf.size) return out;

  const rooms = Array.from(nameOf.keys());
  let att: any[] = [];
  try {
    // ⚠️ D1 바인드 100개 한도 — 손으로 자르지 말고 공용 selectInChunks 를 쓴다(CLAUDE.md 2장).
    att = await selectInChunks<any>(db, rooms, (ph) =>
      `SELECT room_id, role, username, joined_at, COALESCE(left_at, last_seen_at) AS out_at
         FROM attendance WHERE room_id IN (${ph})`);
  } catch (e: any) {
    console.warn('[no-show-truth] attendance 조회 실패 — 대조 생략:', e?.message);
    return out;
  }

  const byRoom = new Map<string, any[]>();
  for (const a of att) {
    const k = String(a?.room_id || '');
    if (!k) continue;
    const list = byRoom.get(k) || [];
    list.push(a);
    byRoom.set(k, list);
  }

  /* 🆕 계정아이디로 찍힌 출석 이름을 «원부 이름» 으로도 풀어 둔다(위 머리주석의 새 규칙).
     방을 다 모아 **한 번에** 조회한다 — 방마다 부르면 왕복이 방 수만큼 쌓인다. */
  const acctName = await accountToTeacherName(
    db, att.map((a) => stripRolePrefix(a?.username)).filter(Boolean));

  /** 이 출석행을 가리키는 이름 후보들 — 적힌 그대로 + 계정을 푼 원부 이름. */
  const namesOf = (username: any): string[] => {
    const raw = stripRolePrefix(username);
    const resolved = acctName.get(nrm(raw));
    return resolved ? [raw, resolved] : [raw];
  };
  /** 후보 중 하나라도 그 이름과 같은 사람이면 맞는 것으로 본다. */
  const isSamePerson = (username: any, target: any): boolean =>
    namesOf(username).some((n) => sameTeacherByWord(n, target));

  for (const room of rooms) {
    const tname = nameOf.get(room) || '';
    const list = byRoom.get(room) || [];
    if (!tname) { out.set(room, { present: null, from: null, to: null, minutes: null }); continue; }
    // 이름이 붙은 출석행이 하나도 없으면 «판정 불가» 다 — «없었다» 가 아니다.
    const named = list.filter((a) => String(a?.username || '').trim());
    if (!named.length) { out.set(room, { present: null, from: null, to: null, minutes: null }); continue; }

    /* ⚠️ 낱말 경계는 «낱말 속 우연»(Anna ⊂ HANNAH)은 막지만 «낱말 자체가 겹치는» 경우는 못 막는다 —
       강사명이 한 낱말이면(예: 'Len') 같은 방의 다른 사람 'Len Kim' 이 걸린다.
       그 방향의 오판정은 **진짜 노쇼를 감추고 수업료를 전액 내보내므로** 가장 나쁘다.
       → 그 방의 «학생 이름» 에도 똑같이 걸리는 접속은 강사로 세지 않는다. 그렇게 걸러 낸 뒤
         남는 것이 없으면 «없었다» 가 아니라 **«모름»** 이다(모르는 것을 단정하지 않는다). */
    const sname = stuOf.get(room) || '';
    /* ⚠️ 강사·학생 양쪽에 **같은 규칙**을 쓴다. 강사 쪽만 계정 해석을 넣으면
       «학생과 구분이 안 되는» 접속을 걸러 내던 아래 안전장치가 한쪽만 넓어져 헐거워진다. */
    const hit = named.filter((a) => isSamePerson(a.username, tname));
    const mine = sname ? hit.filter((a) => !isSamePerson(a.username, sname)) : hit;
    if (!mine.length) {
      const ambiguous = hit.length > 0;   // 걸리긴 했는데 학생과 구분이 안 된다
      out.set(room, { present: ambiguous ? null : false, from: null, to: null, minutes: null });
      continue;
    }

    /* from·to 는 «언제부터 언제까지 오갔나» 의 바깥 테두리다(그대로 둔다).
       minutes 는 그 테두리가 아니라 **실제로 붙어 있던 시간의 합**이다 — 위 connectedMinutes 참고. */
    let from = Infinity, to = -Infinity;
    const spans: Array<[number, number]> = [];
    for (const a of mine) {
      const j = Number(a.joined_at || 0);
      const o = Number(a.out_at || 0);
      if (j > 0 && j < from) from = j;
      if (o > 0 && o > to) to = o;
      spans.push([j, o]);
    }
    const f = Number.isFinite(from) ? from : null;
    const t = to > 0 ? to : null;
    out.set(room, { present: true, from: f, to: t, minutes: connectedMinutes(spans) });
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   🔔 «지금» 그 방에 강사가 붙어 있는가 — 「강사 미입장」 알림을 보내기 **전** 에 묻는다 (2026-09-04)

   [왜] `/api/notify/no-show` 는 학생 화면이 «내 화면에 강사가 안 보인다» 고 하면 그대로
     강사에게 「⏰ 학생이 기다리고 있어요」 푸시를 보냈다. 그런데 학생 화면은 입장 버튼을
     누른 «순간»(소켓·카메라가 열리기 전) 부터 세므로, 강사가 7분 전부터 앉아 있어도 알림이 갔다
     (2026-09-03 class-1079: Krystel 21:13 입장 · 알림 21:20:34). 위 판정과 **같은 규칙**
     (이름 일치 · role 안 믿음 · 모르면 false)으로 «최근 freshMs 안에 살아 있던 강사 접속» 이
     있으면 true 다. 기록(class_no_show 행)은 그대로 남기고 **알림만** 막는 데 쓴다.
   [안전한 방향] 판정 불가·조회 실패는 전부 false — 알림을 «안 보내는» 쪽으로 틀리지 않는다.

   ⛔ [미래 시각은 «살아 있음» 이 아니다 — 2026-09-04]
     `p.to` 는 `COALESCE(left_at, last_seen_at)` 인데, 그 둘은 «접속» 이 찍는 값일 때만
     서버 시각이다(api-mango.ts 의 leave·speaking-time — 전부 Date.now()). 그런데
     **카페24 동기화가 «예약» 으로 미리 만들어 두는 출석행은 `left_at` 이 «예약 종료 시각»**
     이라 미래다(`cafe24-sync.ts` 의 씨앗 INSERT — 저장소의 `INSERT INTO attendance` 8곳 중
     미래 시각을 쓰는 곳은 그 하나뿐이고 나머지 7곳은 서버 `Date.now()` 다).
     [잰 것 — 2026-09-04 운영 D1] 미래 시각 출석행 **387~397건**(예약 시각이라 시간이 흐르면
     과거가 되어 줄어든다. 가장 먼 것 2030-02-20).
     **오늘의 사고는 아니다** — 그 행은 **전부 `c24-*` 방**이라 `class-*` 방 번호로 묻는 이 함수와
     구조적으로 안 만나고, 이 함수가 보는 **`username`** 칸에 강사 이름이 붙은 것도 0건이다.
       ⚠️ **`teacher_name` 칸은 366건 채워져 있다** — 씨앗 INSERT 가 그 칸은 넣고 `username` 에는
          «학생» 이름을, `role` 에는 `student` 를 박기 때문이다. 그 숫자를 보고 «0건이 아닌데?» 로
          읽지 말 것. 위 `teacherPresenceByRoom` 은 `username` 만 본다(SELECT·hit 판정 둘 다).
       ⚠️ 지금 코드에 «미러가 `class-*` 에 씨앗을 만드는» 경로는 **없다** — `c24-mirror.ts` 는
          `attendance` 를 읽기만 하고 쓰는 것은 `class_schedules` 다.
     그래도 막아 두는 것은 그 전제가 깨지는 순간(카페24가 `username`·`role` 을 강사로 싣거나
     누가 `class-*` 에 씨앗을 만들면) «예약이 잡혀 있다» 가 «지금 강사가 있다» 로 읽히기 때문이다.
     그 방향은 이 파일이 가장 나쁘다고 못 박은 것이다 — **진짜 노쇼를 조용히 감춘다.**
     ⟹ 아래처럼 «지나간 신호» 만 인정한다. 서버 시각끼리는 음수가 나올 수 없으므로
        음수는 곧 «서버가 안 찍은 값» 이라는 신호다(작은 여유만 두고 나머지는 거부).
     ⚠️ `teacherPresenceByRoom`(사후 리포트) 쪽은 건드리지 않는다 — 거기서는 «수업이 끝난 뒤»
        를 읽으므로 미래 값이 정상이고, 같이 조이면 노쇼 리포트의 뜻이 바뀐다.
   ══════════════════════════════════════════════════════════════════════════ */
/** 서버 시각끼리의 오차만 봐준다. 이보다 먼 «미래» 는 접속이 아니라 예약으로 본다.
 *  ⚠️ 60초에 «잰» 근거는 없다(추론) — 두 값 다 같은 Worker 의 `Date.now()` 라 실제 오차는
 *     ms 수준일 것이고, 막으려는 예약 씨앗은 «분~년» 단위라 그 사이 어디를 골라도 갈린다.
 *     넉넉한 쪽(=알림을 보내는 쪽)으로 잡았다. 좁히려면 먼저 실제 분포를 재고 좁힐 것. */
const FUTURE_SLACK_MS = 60 * 1000;

export async function teacherLiveInRoom(
  db: any,
  roomId: string,
  teacherName: string,
  studentName?: string,
  nowMs: number = Date.now(),
  freshMs: number = 3 * 60 * 1000,
): Promise<boolean> {
  try {
    const room = String(roomId || '').trim();
    if (!room || !String(teacherName || '').trim()) return false;
    const m = await teacherPresenceByRoom(db, [{
      room_id: room, missing_role: 'teacher', teacher_name: teacherName, student_name: studentName || '',
    }]);
    const p = m.get(room);
    if (!p || p.present !== true || !p.to) return false;
    const gap = nowMs - Number(p.to);
    if (gap < -FUTURE_SLACK_MS) return false;   // 미래 = 예약 씨앗 → «살아 있음» 이 아니다(위 ⛔)
    return gap <= freshMs;
  } catch { return false; }
}
