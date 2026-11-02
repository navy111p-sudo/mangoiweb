/* ═══════════════════════════════════════════════════════════════════════
 * 📡 class-ask 스트리밍 — 학생 질문의 «영어 답» 을 생성되는 즉시 흘려보냅니다.
 *
 * [왜] 기존 class-ask 는 답 전체(EN+KO)가 다 만들어진 뒤에야 응답했습니다.
 *      여기서는 `EN:` 줄의 글자가 나오는 대로 `{partial:true, en}` 을 보내고,
 *      끝에 `{done:true, ok, en, ko}` 를 보냅니다.
 *
 * [정본은 done] 흘려보낸 글은 «미리보기» 입니다. 최종 판정(parseClassAsk ·
 *      koOk)은 done 에서 한 번 더 돌고, 화면은 done 의 값으로 덮어씁니다.
 *
 * [옵트인] 요청 본문에 `stream: 1` 이 있을 때만 이 경로를 탑니다.
 *      없으면 기존 handleClassAsk 와 «한 바이트도» 다르지 않습니다.
 *
 * [상한·입력 검사] admitClassAsk 를 그대로 지납니다(상한을 두 벌로 두지 않음).
 *
 * ⛔ 학생 질문 원문·AI 답을 로그에 남기지 않습니다(실패 이유 코드만).
 * ⚠️ 스트림 도중 실패하면 done{ok:false, error:'ai_unavailable'} 로 끝냅니다.
 *    (비스트리밍 경로의 8B 폴백은 여기서 하지 않습니다 — 첫 모델만 씁니다.)
 * ═══════════════════════════════════════════════════════════════════════ */
import { admitClassAsk, buildClassAskMessages, parseClassAsk, CLASS_ASK_MODELS, type ClassAskDeps } from './class-ask';

/** 화면이 스트리밍을 원하는가 — `stream: 1` · `true` · `'1'` 만 받습니다. */
export function wantsClassAskStream(body: any): boolean {
  const v = body && body.stream;
  return v === 1 || v === true || v === '1';
}

/** 지금까지 받은 날것에서 `EN:` 줄의 앞부분을 꺼냅니다. 아직 없으면 ''.
 *  한글이 나오면 거기서 자릅니다(영어 칸에 한글이 섞이지 않게 — 최종 판정은 done 에서 다시 합니다). */
export function partialClassAskEn(raw: string): string {
  const m = String(raw == null ? '' : raw).replace(/\r/g, '').match(/(?:^|\n)\s*\**\s*EN\s*\**\s*[:：]\s*\**\s*([^\n]*)/i);
  if (!m) return '';
  let s = m[1].replace(/^["'“”]+/, '');
  const hangul = s.search(/[가-힣ㄱ-ㆎ]/);
  if (hangul >= 0) s = s.slice(0, hangul);
  return s.replace(/\s+/g, ' ').trim();
}

/** Workers AI 스트림 한 줄(`data: {"response":"…"}`)에서 조각을 꺼냅니다. 조각이 없으면 ''. */
function pieceOf(line: string): string {
  const one = line.trim();
  if (!one.startsWith('data:')) return '';
  const pay = one.slice(5).trim();
  if (!pay || pay === '[DONE]') return '';
  try {
    const ev: any = JSON.parse(pay);
    return typeof ev?.response === 'string' ? ev.response : '';
  } catch {
    return '';
  }
}

/** 라우트 본체(스트리밍). api-ai.ts 가 `wantsClassAskStream` 일 때만 부릅니다. */
export async function handleClassAskStream(request: Request, env: any, deps: ClassAskDeps): Promise<Response> {
  const adm = await admitClassAsk(request, env, deps);
  if ('res' in adm) return adm.res;
  const msgs = buildClassAskMessages(adm.a, deps.linkRule);

  let st: any;
  try {
    st = await env.AI.run(CLASS_ASK_MODELS[0], { messages: msgs, max_tokens: 220, temperature: 0.4, stream: true });
  } catch (e: any) {
    console.error('[class-ask] stream start failed:', e?.message || e);
    try { await deps.recordFailure?.({ feature: 'class-ask', models: CLASS_ASK_MODELS[0], err: String(e?.message || e || 'stream_start'), rf: 0, plain: 0, empty: 0, level: '' }); } catch {}
    return deps.json({ ok: false, error: 'ai_unavailable' }, 503);
  }

  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const w = writable.getWriter();
  const send = (o: any) => w.write(enc.encode('data: ' + JSON.stringify(o) + '\n\n')).catch(() => {});

  // 읽기·정리는 응답을 돌려준 뒤 백그라운드에서 — 클라이언트가 읽는 만큼 흘러갑니다.
  (async () => {
    const dec = new TextDecoder();
    const rd = st.getReader();
    let raw = '', line = '', last = '';
    const eat = async (one: string) => {
      const t = pieceOf(one);
      if (!t) return;
      raw += t;
      const en = partialClassAskEn(raw);
      if (en && en !== last) { last = en; await send({ partial: true, en }); }
    };
    try {
      for (;;) {
        const { value, done } = await rd.read();
        if (done) break;
        line += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = line.indexOf('\n')) >= 0) {
          const one = line.slice(0, nl);
          line = line.slice(nl + 1);
          await eat(one);
        }
      }
      line += dec.decode();
      if (line.trim()) await eat(line);

      const out = parseClassAsk(raw);
      if (out) {
        const ko = out.ko && deps.koOk && !deps.koOk(out.ko) ? '' : out.ko;
        await send({ done: true, ok: true, en: out.en, ko });
      } else {
        try { await deps.recordFailure?.({ feature: 'class-ask', models: CLASS_ASK_MODELS[0], err: 'unparsable', rf: 0, plain: 1, empty: 0, level: '' }); } catch {}
        await send({ done: true, ok: false, error: 'ai_unavailable' });
      }
    } catch (e: any) {
      console.error('[class-ask] stream read failed:', e?.message || e);
      await send({ done: true, ok: false, error: 'ai_unavailable' });
    } finally {
      await w.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
