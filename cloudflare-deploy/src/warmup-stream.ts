/**
 * 📡 웜업 «첫 소리 2초 안에» (P2 · 2026-10-02) — 문장이 끝날 때마다 먼저 흘려보내기.
 *
 * [왜 있나]
 * 웜업(`/api/warmup/chat`)은 지금까지 «답이 다 만들어지고, 검사·재시도가 다 끝난 뒤» 에야
 * 한 번에 돌려줬고, 화면은 그 다음에야 목소리를 받으러 갔습니다. A.i 친구하기(A-1, 2026-09-11)는
 * 이미 문장 단위로 흘려보냅니다 — 이 모듈은 «그 설계를 그대로» 웜업에 옮긴 것입니다.
 * 정본 부품은 그쪽 것을 씁니다(`createJsonTextTap`·`takeSentences` — src/stream-json-text.ts).
 *
 * [옵트인]
 * ⛔ 화면이 `stream: 1` 을 보내지 않으면 지금과 «한 바이트도» 다르지 않습니다 —
 *    `warmupChatEntry` 가 그때 핸들러의 응답을 «그대로» 돌려줍니다.
 *
 * [정본은 done 이벤트]
 * 흘려보낸 문장은 «미리보기» 입니다. 서버는 그 뒤에도 지금 하던 일(무너진 출력 차단·이름 재시도·
 * 반복 재시도·공감 가드·교정 검증·KV 저장)을 «최종본에 그대로» 돌리고, done 이벤트에 그 결과를
 * 통째로 싣습니다. 최종본이 흘려보낸 것과 다르면 `replaced: 1` — 화면은 읽던 것을 멈추고
 * 정본을 처음부터 읽습니다.
 *
 * [먼저 막는 문(gate)]
 * 🔴 「Do you like blue balls?」(2026-10-02 실사고) 같은 문장은 최종 검사에서 버려지지만,
 *    스트리밍은 그 «전에» 소리를 냅니다. 그래서 «내보내기 직전» 에 같은 정본 판정
 *    (replyRejectReason · wrongSelfName)을 «지금까지 보낸 것 + 이 문장» 에 걸고, 걸리면
 *    그 자리에서 미리보기를 멈춥니다(halt). 멈춘 뒤로는 한 문장도 안 나갑니다 —
 *    최종본은 done 으로 갑니다(대개 재시도된 답이라 replaced:1).
 * 💛 학생이 «싫다·힘들다» 한 턴은 처음부터 흘려보내지 않습니다 — 최종본은 앞머리 칭찬을
 *    떼는데(applyEmpathyGuard), 흘려보낸 «Great job!» 은 이미 소리가 났기 때문입니다.
 *
 * ⛔ 학생 발화·AI 답변을 로그에 남기지 않습니다(이유 코드만).
 * ⚠️ 이 모듈의 함수는 전부 «던지지 않는» 쪽으로 실패합니다 — 감시·미리보기가 던지면
 *    대화가 그 자리에서 죽습니다.
 */
import { createJsonTextTap, takeSentences } from './stream-json-text';
import { replyRejectReason } from './reply-sanity';
import { wrongSelfName, askedOwnName } from './ai-friends';
import { studentSoundsNegative } from './warmup-empathy';

/** 화면이 스트리밍을 원하는가 — A.i 친구하기(api-ai.ts)와 «같은 값» 만 받습니다. */
export function wantsWarmupStream(body: any): boolean {
  const v = body && body.stream;
  return v === 1 || v === true || v === '1';
}

/** 중국어 문장 끝 — 。！？ 는 뒤에 공백이 오지 않습니다(영어 takeSentences 는 «공백» 을 요구해
 *  중국어에서는 한 문장도 못 자릅니다 — 그러면 스트리밍이 통째로 헛돕니다). */
const ZH_END = /[。！？!?；]/;
const ZH_CLOSE = /[”’」』）)"'\s]/;

export function takeWarmupSentences(buf: string, lang: string): { out: string[]; rest: string } {
  if (lang !== 'zh') return takeSentences(buf);
  const out: string[] = [];
  let rest = String(buf == null ? '' : buf);
  for (;;) {
    let cut = -1;
    for (let i = 0; i < rest.length; i++) {
      if (!ZH_END.test(rest[i])) continue;
      let j = i + 1;
      while (j < rest.length && ZH_CLOSE.test(rest[j])) j++;
      /* ⚠️ 조각 경계 — 마침표 바로 뒤가 아직 안 왔으면 닫는 따옴표가 올 수 있어 기다립니다. */
      if (j >= rest.length && i === rest.length - 1) { cut = -1; break; }
      cut = j; break;
    }
    if (cut < 0) break;
    const s = rest.slice(0, cut).trim();
    if (s) out.push(s);
    rest = rest.slice(cut);
  }
  return { out, rest };
}

/**
 * Workers AI 의 스트림(SSE: `data: {"response":"…"}`)을 읽어, JSON 의 `reply` 값 «안» 글자만
 * 문장 단위로 `onSentence` 에 넘기고, 모델이 준 «날것 전체» 를 돌려줍니다.
 * ⚠️ 돌려주는 날것은 부르는 쪽이 지금처럼 parseWarmupOutput 으로 다시 읽습니다 —
 *    교정(fix)·도움말(speaking_help)은 그 날것에서 나옵니다.
 * ⛔ 모델 조각을 그대로 내보내지 않습니다 — `{"reply":"Hi th` 같은 부분 JSON 이 옵니다.
 */
export async function readWarmupAiStream(st: any, lang: string, onSentence: (s: string) => void): Promise<string> {
  const tap = createJsonTextTap('reply');
  const rd = st.getReader();
  const dec = new TextDecoder();
  let line = '', raw = '', pend = '';
  const eat = (one: string) => {
    one = one.trim();
    if (!one.startsWith('data:')) return;
    const pay = one.slice(5).trim();
    if (!pay || pay === '[DONE]') return;
    let t = '';
    try { const ev: any = JSON.parse(pay); t = typeof ev?.response === 'string' ? ev.response : ''; } catch { return; }
    if (!t) return;
    raw += t;
    pend += tap.push(t);
    const cut = takeWarmupSentences(pend, lang);
    pend = cut.rest;
    for (const sen of cut.out) { try { onSentence(sen); } catch { /* 미리보기 실패가 대화를 죽이지 않게 */ } }
  };
  for (;;) {
    const { value, done } = await rd.read();
    if (done) break;
    line += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = line.indexOf('\n')) >= 0) {
      const one = line.slice(0, nl);
      line = line.slice(nl + 1);
      eat(one);
    }
  }
  line += dec.decode();
  if (line.trim()) eat(line);                // 줄바꿈 없이 끝난 마지막 줄
  const tail = String(pend || '').trim();
  if (tail) { try { onSentence(tail); } catch {} }
  return raw;
}

export type WarmupLive = {
  /** 문장 하나를 «먼저 막는 문» 에 걸고, 통과하면 내보냅니다. 내보냈으면 true. */
  push(sen: string): boolean;
  /** 지금까지 실제로 내보낸 글(공백으로 이음). */
  text(): string;
  /** 내보낸 문장 수. */
  sent(): number;
  /** 미리보기를 멈춘 이유('' = 안 멈춤). ⛔ 본문이 아니라 이유 코드입니다. */
  halted(): string;
  /** 최종본이 흘려보낸 것과 다른가 — 하나도 안 보냈으면 0(화면이 정본을 처음부터 읽습니다). */
  replacedBy(finalText: string): 0 | 1;
};

const squash = (s: string) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

export function createWarmupLive(
  send: (o: any) => void,
  o: { lang: string; cap: number; friend: string; studentInput: string },
): WarmupLive {
  let text = '';
  let n = 0;
  let halt = '';
  /* 판정이 던지면 «흘려보내지 않는» 쪽으로 — 최종본은 done 으로 그대로 갑니다. */
  let negative = true;
  try { negative = studentSoundsNegative(o.studentInput); } catch { negative = true; }
  let askedName = false;
  try { askedName = askedOwnName(o.studentInput); } catch { askedName = false; }
  return {
    push(sen: string): boolean {
      const s = String(sen == null ? '' : sen).trim();
      if (!s || halt) return false;
      if (negative) { halt = 'empathy'; return false; }
      const cand = text ? text + ' ' + s : s;
      let why = '';
      try { why = replyRejectReason(cand, o.cap); } catch { why = 'gate_error'; }
      if (!why) {
        try { if (wrongSelfName(cand, o.friend, { askedName })) why = 'name'; } catch { why = 'gate_error'; }
      }
      if (why) { halt = why; return false; }
      text = cand; n++;
      try { send({ t: s }); } catch {}
      return true;
    },
    text: () => text,
    sent: () => n,
    halted: () => halt,
    replacedBy(finalText: string): 0 | 1 {
      if (!n) return 0;
      return squash(text) === squash(finalText) ? 0 : 1;
    },
  };
}

const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'private, no-store',   // ⛔ 학생 대화가 실린 응답은 캐시 금지
  'X-Accel-Buffering': 'no',              // 중간 버퍼가 모아 두면 스트리밍이 헛돕니다
};

/**
 * `/api/warmup/chat` 의 입구. 스트리밍을 원하면 SSE 로, 아니면 핸들러 응답을 «그대로».
 * `core(req, send)` 는 지금까지의 핸들러이고, send 가 null 이면 예전과 똑같이 돕니다.
 * ⚠️ 본문은 «복제본» 으로만 엿봅니다 — 원본은 핸들러가 지금처럼 읽습니다.
 * ⚠️ SSE 에서는 HTTP 상태가 늘 200 이라, 핸들러가 준 상태를 done 에 `status` 로 싣습니다
 *    (422·502·500 을 화면이 «오류» 로 그리게).
 */
export async function warmupChatEntry(
  request: Request,
  core: (req: Request, send: ((o: any) => void) | null) => Promise<Response>,
): Promise<Response> {
  let want = false;
  try { want = wantsWarmupStream(await request.clone().json()); } catch { want = false; }
  if (!want) return core(request, null);
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    async start(c) {
      const send = (ev: any) => { try { c.enqueue(enc.encode('data: ' + JSON.stringify(ev) + '\n\n')); } catch {} };
      try {
        const resp = await core(request, send);
        let obj: any = {};
        try { obj = await resp.json(); } catch { obj = { detail: 'invalid_response' }; }
        send({ ...obj, done: 1, status: resp.status, ok: resp.status === 200 });
      } catch (e: any) {
        /* ⛔ 조용히 닫으면 화면이 «영영 기다립니다» — 무슨 일인지 말하고 닫습니다. */
        console.error('[warmup] stream turn failed:', e?.message || e);
        send({ done: 1, status: 500, ok: false, detail: 'stream_failed' });
      } finally {
        try { c.close(); } catch {}
      }
    },
  }), { headers: SSE_HEADERS });
}
