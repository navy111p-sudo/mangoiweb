/* 🔎 웜업 답장 «시작 말 종류» (2026-11-04 사장님 「웜업 쪽도 내일 같이 재봐줘」)

   왜 필요한가 — AI 영어친구는 대화가 D1(ai_friend_chats)에 남아 «첫마디가 실제로 나왔나» 를 셀 수 있지만,
   웜업(A.i 말하기)은 대화를 KV 에만 6시간 두고 D1 에는 일부러 안 남긴다(미성년자 대화 — warmup-fix-trace.ts 머리말).
   그래서 «첫마디 지시가 실린 턴에 모델이 정말 첫마디로 시작했나 · 틀린 문장에 칭찬이 남았나» 를 잴 길이 없었다.
   이 모듈은 «최종 답장의 맨 앞» 만 보고 종류를 정해, 판정 사유 한 줄(warmup_fix_trace)에 함께 싣게 한다.

   ⛔ 답장 본문은 돌려주지 않는다 — word 는 «우리가 정해 둔 목록의 말» 로 바꿔 돌려주고, 목록 밖이면 ''.
      (「Oh, Minsu!」 처럼 이름이 섞인 머리말은 'Oh' 로만 남긴다.)
   ⛔ 던지지 않는다 — 모르면 kind ''.
   ⚠️ 칭찬 판정은 칭찬 떼기 정본(warmup-empathy.ts stripCheerLead)과 «같은» 판정이다 — 따로 목록을 두지 않는다.
   ⚠️ 첫마디 판정도 정본(conversation-connectors.ts isTurnOpener)을 그대로 쓴다 — 서버가 «쉬는 턴» 을 정할 때와 같은 자. */
import { replyOpener, openerKey, isTurnOpener, turnOpenerLine, TURN_OPENERS } from './conversation-connectors';
import { stripCheerLead } from './warmup-empathy';

/** fix = 교정 앞머리(집중교정 «You can say…»·교정 카드 «Let's say it like this») · praise = 칭찬 상투구 · opener = 첫마디 · other = 그 밖 */
export type ReplyStartKind = 'fix' | 'praise' | 'opener' | 'other' | '';
/** on = 이번 턴 첫마디 줄이 실림 · rest = 앞 답이 첫마디라 쉬는 턴 · first = 세션 첫 답 · off = 연결 표현을 안 싣는 대화(중국어).
 *  ⚠️ 엘리더잼 예시형도 조건상 off 지만 그 경로는 DB 없는 환경(ephemeralEleaderEnv)으로 돌아 기록 자체가 안 남는다. */
export type OpenerTurnState = 'on' | 'rest' | 'first' | 'off' | '';

/** 앞에 낄 수 있는 것 — 공백·따옴표·이모지(글자는 안 된다). conversation-connectors.ts 의 LEAD_GAP 과 같은 모양. */
const GAP = /^[\s"'“”‘’‍️\u{1f3fb}-\u{1f3ff}\p{Extended_Pictographic}]*/u;
/** 교정 앞머리 — 정본 문구: warmup-honest.ts ensureFocusedFixSpoken(«You can say...») · warmup-correction.ts correctionLeadIn. */
const FIX_LEADS: ReadonlyArray<[RegExp, string]> = [
  [/^you can say/i, 'You can say'],
  [/^let['’]s say it like this/i, "Let's say it like this"],
  [/^我们可以这样说/, '我们可以这样说'],
];
/** 첫마디 후보(긴 것부터) — 답장이 «그 말 그대로» 시작하면 그 말을 남긴다. */
let OPENER_LIST: string[] | null = null;
/** 열쇠(앞 두 낱말) → 후보 — 모델이 부호만 바꿔 쓴 경우(「Oh no!」)용. ⚠️ 열쇠 'oh' 는 넣지 않는다:
 *  「Oh, fun!」 의 열쇠가 그냥 'oh' 라, 넣으면 「Oh, Minsu!」 가 「Oh, fun!」 으로 잘못 남는다(하니스가 잡음). */
let OPENER_BY_KEY: Map<string, string> | null = null;
const lowq = (x: string) => String(x || '').replace(/[’‘]/g, "'").toLowerCase();
function openerTables(): [string[], Map<string, string>] {
  if (!OPENER_LIST || !OPENER_BY_KEY) {
    const all = Object.values(TURN_OPENERS).flat();
    OPENER_LIST = all.slice().sort((a, b) => b.length - a.length);
    const m = new Map<string, string>();
    for (const o of all) {
      const k = openerKey(replyOpener(o + ' Do you like it?'));
      if (k && k !== 'oh' && !m.has(k)) m.set(k, o);
    }
    OPENER_BY_KEY = m;
  }
  return [OPENER_LIST, OPENER_BY_KEY];
}
/** 후보에 없는 같은 갈래 — 정해 둔 이름표만 남긴다(「Oh, …」 는 뒤에 무엇이 오든 'Oh'). */
function familyLabel(k: string, op: string): string {
  if (k === 'well') return 'Well,';
  if (k === 'by the') return /^by the way/i.test(op) ? 'By the way,' : '';   // 「By the river,」 를 By the way 로 세지 않게
  if (k === 'anyway') return 'Anyway,';
  return k === 'oh' || k.startsWith('oh ') ? 'Oh' : '';
}

/** 최종 답장의 «시작 말 종류» 와 «목록 안의 그 말». 본문은 담지 않는다. */
export function replyStartOf(reply: unknown): { kind: ReplyStartKind; word: string } {
  try {
    const raw = String(reply == null ? '' : reply);
    const s = raw.slice((raw.match(GAP) || [''])[0].length).trim();
    if (!s) return { kind: '', word: '' };
    for (const [re, word] of FIX_LEADS) if (re.test(s)) return { kind: 'fix', word };
    /* 칭찬 — 칭찬 떼기 정본에 «Ok» 를 붙여 넣어 보고, 앞이 떨어지면 칭찬으로 본다(통째로 칭찬뿐인 답장도 잡기 위해).
       남기는 글자는 떨어진 앞머리 — 정본의 정규식이 «목록의 말 + 문장부호» 만 무는 것이라 본문이 섞이지 않는다. */
    const probe = s + ' Ok';
    const rest = stripCheerLead(probe);
    if (rest !== probe && probe.length > rest.length) {
      const head = probe.slice(0, probe.length - rest.length)
        .replace(/[’‘]/g, "'").replace(/[^A-Za-z' ,!.?~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
      return { kind: 'praise', word: head };
    }
    const op = replyOpener(s);
    if (op && isTurnOpener(op)) {
      const [list, byKey] = openerTables();
      const low = lowq(s);
      for (const o of list) {
        const lo = lowq(o);
        if (low.startsWith(lo) && !/[a-z']/.test(low.charAt(lo.length))) return { kind: 'opener', word: o };
      }
      const k = openerKey(op);
      return { kind: 'opener', word: byKey.get(k) || familyLabel(k, op) };
    }
    return { kind: 'other', word: '' };
  } catch { return { kind: '', word: '' }; }
}

/** 이번 턴이 «첫마디 줄이 실린 턴» 인가 — 서버가 지시를 만들 때와 «같은» 판정(turnOpenerLine)을 다시 부른다(결정론이라 같은 답). */
export function openerTurnState(linkOn: boolean, history: unknown): OpenerTurnState {
  try {
    if (!linkOn) return 'off';
    if (turnOpenerLine(history)) return 'on';
    const rows: any[] = Array.isArray(history) ? history : [];
    return rows.some((h) => h && h.role === 'assistant') ? 'rest' : 'first';
  } catch { return ''; }
}
