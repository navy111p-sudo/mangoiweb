// Speech synthesis: cache identity, cost caps and provider fallbacks.
import { json } from './api-util';
import { azureZhVoice, azureTts } from './azure-tts';
import { azureTtsAllowed, azureTtsCapKey } from './voice-tts-cap';
import { ttsShortText } from './tts-short-text';
import type { MangoEnv } from './api-mango';

export async function handleVoiceTtsApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
    // ── POST /api/voice/tts — 모범 음성 (원어민 TTS: Deepgram Aura-1 / MeloTTS) ──
    if (method === 'POST' && path === '/api/voice/tts') {
      try {
        const b: any = await request.json().catch(() => ({}));
        // 400자 컷은 문장 중간에서 낭독이 뚝 끊기는 원인이었다 — Aura 한도(2000자) 안에서 여유있게.
        const lang = String(b.lang || 'en').toLowerCase();
        // 🔊 낱말 하나(`study`)는 `Study.` 로 — 모든 화면이 이 입구를 지나므로 여기 한 곳에서 다듬는다(2026-09-24)
        const text = ttsShortText(String(b.text || '').trim().slice(0, 1500), lang);
        if (!text) return json({ ok: false, error: 'text_required' }, 400);
        const ai = (env as any).AI;
        if (!ai) return json({ ok: false, error: 'workers_ai_not_bound' }, 503);

        const audioHeaders = {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=604800',
          'Access-Control-Allow-Origin': '*'
        };
        const b64ToBytes = (b64: string) => {
          const bin = atob(b64);
          const u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          return u8;
        };
        // 🔁 R2 캐시: 같은 단어/문장은 1회만 생성 → 이후엔 뉴런 소모 없이 즉시 제공.
        //   무료 뉴런 소진(429) 후에도 캐시본이 있으면 계속 소리가 난다.
        const r2: any = (env as any).RECORDINGS;
        /* 🀄 «진짜 남성 성우» 를 콕 집어 달라는 요청인가(Azure Speech).
           ⛔ 본문 값을 그대로 쓰지 마세요 — 돈이 나가는 API 라 아는 이름만 받습니다.
              모르는 값이면 null 이 되어 예전 경로(구글 만다린 여성)로 그대로 갑니다.
           ⚠️ 캐시 키를 «실제로 쓴 목소리» 로 갈라 둡니다 — 안 가르면 같은 문장의
              옛 여성 캐시본이 먼저 걸려 남자 목소리가 영영 안 나옵니다. */
        const azVoice = (lang.startsWith('zh') || lang === 'cn') ? azureZhVoice(b.azure_voice) : null;
        let cacheKey = '';
        try {
          // v2: 영어 TTS 를 Aura-2 로 올리면서 캐시 세대 교체 (v1 캐시본은 구형 Aura-1 음성)
          // v3: CF 발신 Google TTS 가 깨진 오디오를 반환하던 시기의 zh 캐시본 오염 제거(2026-07-18)
          //     ⚠️ zh 는 현재 서버 정상 경로 없음(Google=CF발 오염·MeloTTS zh=잡음) → 프론트가
          //     앱 네이티브 TTS/브라우저 음성을 우선하도록 정리됨. 서버 zh 는 최후 폴백일 뿐.
          // v4: Aura-1 폴백 음성이 «요청 화자» 키로 저장되던 오염 제거(2026-08-31).
          //     Lily(delia)가 한 번 폴백하면 그 문장은 영영 Emma 목소리(asteria)로 재생됐다.
          // v4a: gtts 폴백이 «azure:…» 키에 여성 음성을 써 넣던 오염을 버리려고
          //      azure 쪽 키 세대만 올립니다(영어·일반 중국어 캐시는 그대로 삽니다).
          const spk0 = azVoice ? 'azure2:' + azVoice : String(b.speaker || 'asteria');
          const enc = new TextEncoder().encode('v4|' + lang + '|' + spk0 + '|' + text);
          const dig = await crypto.subtle.digest('SHA-256', enc);
          cacheKey = 'tts/' + [...new Uint8Array(dig)].map((x) => x.toString(16).padStart(2, '0')).join('') + '.mp3';
        } catch {}
        if (cacheKey && r2) {
          /* 🔴 「요청이 azure 였나」로 판정하면 안 됩니다 — 그건 «무엇을 달라고 했나» 이지
             «무엇이 저장돼 있나» 가 아닙니다. 2026-09-14 실사고: 폴백이 여성 음성을
             azure 키에 써 넣자, 그다음부터 캐시 적중이 그 여성 음성을 «azure» 라고
             말하며 내보냈고 화면은 아무 경고도 못 했습니다(성우 4명이 전부 여자 목소리).
             ⟹ 저장할 때 붙여 둔 표시(customMetadata.eng)를 «읽어서» 말합니다.
             ⚠️ 표시가 없는 옛 캐시본은 «모름»(r2-cache)이라 화면이 정직하게 경고합니다. */
          try {
            const hit = await r2.get(cacheKey);
            if (hit) {
              const hitEng = String((hit as any)?.customMetadata?.eng || '').trim().toLowerCase();
              return new Response(hit.body, { headers: { ...audioHeaders,
                'X-TTS-Engine': hitEng ? 'r2-cache:' + hitEng : 'r2-cache',
                'X-TTS-Speaker': (azVoice || String(b.speaker || 'asteria')).toLowerCase() } });
            }
          } catch {}
        }
        /* 캐시 저장 — 키를 받는 형태로 둔다. Aura-1 폴백은 «요청 화자» 가 아니라
           «실제로 쓴 화자» 키로 저장해야 하기 때문이다(아래 폴백 블록 주석 참고). */
        const ttsKey = async (spk: string) => {
          const e = new TextEncoder().encode('v4|' + lang + '|' + spk + '|' + text);
          const d = await crypto.subtle.digest('SHA-256', e);
          return 'tts/' + [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('') + '.mp3';
        };
        const putCacheAs = async (key: string, bytes: ArrayBuffer | Uint8Array, eng?: string) => {
          if (!key || !r2) return;
          /* eng = «이 바이트를 무엇이 만들었나». 캐시 적중 때 그대로 되읽어 진단 헤더로
             말해 줍니다 — 안 적어 두면 「요청이 azure 였나」로 넘겨짚게 됩니다(위 블록). */
          const meta: any = { httpMetadata: { contentType: 'audio/mpeg' } };
          if (eng) meta.customMetadata = { eng };
          try { await r2.put(key, bytes, meta); } catch {}
        };
        const putCache = (bytes: ArrayBuffer | Uint8Array) => putCacheAs(cacheKey, bytes);
        const isQuota = (m: any) => /429|neuron|allocation|free allocation|capacity/i.test(String(m || ''));
        // MeloTTS — base64 MP3 반환 (en/zh 지원)
        //   ⚠️ 캐시 금지: Aura 일시 장애 때 만들어진 기계음이 Aura 화자 키에 저장되면
        //   장애가 끝나도 그 문장은 영원히 기계음으로 재생된다(캐시 오염). 폴백은 그때그때만.
        const melo = async (meloLang: string) => {
          const r: any = await ai.run('@cf/myshell-ai/melotts', { prompt: text, lang: meloLang });
          const b64 = typeof r === 'string' ? r : (r?.audio || '');
          if (!b64) throw new Error('melotts_empty');
          const bytes = b64ToBytes(b64);
          return new Response(bytes, { headers: audioHeaders });
        };
        // MeloTTS 원본 바이트 (크기 검증용 — Workers AI 가 빈 WAV(44B) 반환하는 케이스 감지)
        const meloBytes = async (meloLang: string) => {
          const r: any = await ai.run('@cf/myshell-ai/melotts', { prompt: text, lang: meloLang });
          const b64 = typeof r === 'string' ? r : (r?.audio || '');
          return b64 ? b64ToBytes(b64) : new Uint8Array(0);
        };
        // Google 번역 TTS — 원어민 만다린 폴백 (MeloTTS zh 가 빈 오디오일 때).
        //   client=tw-ob 엔드포인트는 MP3 스트림 반환. 요청당 ~200자 제한이라 잘라서 전송.
        const gtts = async (txt: string, tl: string) => {
          const q = encodeURIComponent(String(txt).slice(0, 190));
          const gurl = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' + tl + '&q=' + q;
          const gr = await fetch(gurl, { headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://translate.google.com/'
          } });
          if (!gr.ok) throw new Error('gtts_' + gr.status);
          const gb = await gr.arrayBuffer();
          if (!gb || gb.byteLength < 300) throw new Error('gtts_empty');
          /* 🔴 여기서 putCache(=«요청» 키) 를 쓰면 안 됩니다 — Azure 성우를 콕 집은 요청이
             실패해 이 폴백으로 내려오면 «여성 구글 만다린» 이 «azure:윈시» 키에 저장되고,
             그다음부터 그 문장은 영영 여자 목소리로 재생됩니다(2026-09-14 실사고).
             이 저장소가 2026-08-31 Lily→Emma 건에서 이미 밟은 바로 그 함정입니다.
             ⟹ 언제나 «실제로 쓴 화자»(구글 만다린) 키로만 저장합니다.
             ℹ️ azVoice 가 없을 때는 이 키가 cacheKey 와 글자까지 같습니다(동작 변화 없음). */
          await putCacheAs(await ttsKey(String(b.speaker || 'asteria')), gb, 'gtts');
          return new Response(gb, { headers: audioHeaders });
        };

        // 중국어 → 진짜 원어민 만다린. ⚠️ Cloudflare @cf/myshell-ai/melotts(zh) 는 비어있지 않은
        //   불량 WAV(51KB짜리 "앙캉캉캉" 잡음)를 반환해 크기검사로도 못 거른다. 그래서 zh 는
        //   Google 번역 TTS(원어민 만다린 MP3)를 1순위로 쓰고, 실패 시에만 MeloTTS 로 폴백한다.
        if (lang.startsWith('zh') || lang === 'cn') {
          /* 🀄 중국어 «진짜 남성 성우» — 2026-09-14 사장님 「남자목소리를 가져올 방법??」
             그전에는 이 갈래가 구글 만다린 «한 목소리»(여성)뿐이라, 화면이 그 소리를
             브라우저에서 굵게 만들어 남자처럼 들리게 했습니다(warmup.html 의 _zhDeepen).
             ⛔ 이 갈래를 «중국어 전부» 로 넓히지 마세요 — 메이(여자)는 지금 소리가 맞고,
                지금 잘 나는 것을 바꾸는 변경이 됩니다. 이름을 콕 집었을 때만 탑니다.
             ⚠️ 실패하면 «아래 예전 경로» 로 그대로 내려갑니다 — 소리가 아예 안 나는 것이 최악입니다.
                왜 실패했는지는 응답 헤더(X-TTS-Fallback)로 말해 줍니다(추측하지 않게). */
          let azFail = '';
          /* 💸 (2026-09-15 사장님 지시) 이 API 는 **무인증**입니다 — 한 번에 나가는 돈은
             이미 막혀 있었지만(300자 · 아는 성우만 · 캐시) «몇 번 부를 수 있나» 가 안 막혀
             있었습니다. 판정 정본은 src/voice-tts-cap.ts 입니다.
             ⛔ 그 조건을 여기에 옮겨 적지 마세요 — 라우트 안에 두면 조건을 뒤집어도
                문자열 검사가 그대로 통과합니다(CLAUDE.md 「비용이 나가는 API」).
             ⚠️ 이 자리가 «캐시 적중 뒤» 인 것이 중요합니다 — 이미 만들어 둔 소리는
                Azure 를 안 부르므로 세지 않습니다. 세는 것은 진짜로 돈이 나가는 호출뿐입니다.
             ⚠️ 막혀도 **소리는 그대로 납니다** — 아래 «예전 경로»(구글 만다린)로 내려갑니다.
                429 로 끊지 않습니다(끊으면 학생 화면이 통째로 조용해집니다).
             ⚠️ 사유(X-TTS-Fallback)를 «읽는» 화면은 성우 견본(zh-voice-sample.html)뿐입니다 —
                학생이 쓰는 warmup.html 은 X-TTS-Engine 만 보고, 아무 말 없이 예전처럼
                «굵게 구운» 소리를 냅니다(= 2026-09-14 이전 동작).
                ⛔ 거기에 안내를 새로 띄우지 마세요 — CLAUDE.md 가 「그 안내를 되살리지 마세요,
                   이제 «항상» 남자 목소리라 거짓말이 됩니다」로 못 박아 둔 자리입니다. */
          if (azVoice) {
            const capKey = azureTtsCapKey(request.headers.get('cf-connecting-ip'), Date.now());
            let capUsed: any = null;
            try { capUsed = await (env as any).SESSION_STATE?.get?.(capKey); } catch {}
            if (!azureTtsAllowed(capUsed)) {
              azFail = 'ip_cap';
              console.warn('[voice/tts] azure ip cap:', capKey, capUsed);
            } else {
              /* 부르기 «전» 에 셉니다 — 실패도 세야 남용이 실패를 무한정 낼 수 없고,
                 실패 사유 중 empty_n 은 이미 과금됐을 수 있습니다. */
              try {
                await (env as any).SESSION_STATE?.put?.(capKey, String((Number(capUsed) || 0) + 1), { expirationTtl: 172800 });
              } catch { /* KV 장애로 정상 학생이 막히면 안 되므로 통과 */ }
            }
          }
          if (azVoice && !azFail) {
            const az = await azureTts(env as any, text, azVoice, 'zh-CN');
            if (az.ok) {
              await putCacheAs(cacheKey, az.bytes, 'azure');
              return new Response(az.bytes, { headers: { ...audioHeaders,
                'X-TTS-Engine': 'azure', 'X-TTS-Speaker': azVoice.toLowerCase() } });
            }
            azFail = az.reason;
            console.warn('[voice/tts] azure zh failed:', azFail);
          }
          const zhHeaders = azFail
            ? { 'X-TTS-Engine': 'gtts', 'X-TTS-Fallback': azFail }
            : { 'X-TTS-Engine': 'gtts' };
          try {
            const gr = await gtts(text, 'zh-CN');
            for (const [k, v] of Object.entries(zhHeaders)) gr.headers.set(k, v);
            return gr;
          } catch (gErr: any) {
            console.warn('[voice/tts] google zh failed, fallback melotts:', gErr?.message);
            try {
              const bytes = await meloBytes('zh');
              if (bytes.byteLength >= 1000) return new Response(bytes, { headers: audioHeaders });
            } catch {}
            return json({ ok: false, error: 'zh_tts_failed' }, 502);
          }
        }

        // 영어 → Deepgram Aura-2 (차세대, 훨씬 자연스러움) → Aura-1 → MeloTTS(en) 순 폴백
        //   ⚠️ 무료 뉴런 소진 시 Workers AI 는 200 이 아닌 429 에러 Response(JSON) 를 준다.
        //   예전 코드는 그 JSON 바디(~487B)를 audio/mpeg 로 그대로 브라우저에 내보내서
        //   "소리가 안 나는" 원인이 됐다. raw.ok + content-type=audio 로 진짜 음성만 통과시킨다.
        let quota = false;
        const auraRun = async (model: string, speaker: string): Promise<ArrayBuffer> => {
          const raw: any = await ai.run(model, { text, speaker }, { returnRawResponse: true });
          let buf: ArrayBuffer | null = null;
          if (raw instanceof Response) {
            const rct = raw.headers.get('content-type') || '';
            if (raw.ok && /audio/i.test(rct)) buf = await raw.arrayBuffer();
            else { if (raw.status === 429) quota = true; throw new Error('aura_http_' + raw.status); }
          }
          else if (raw instanceof ArrayBuffer) buf = raw;
          else if (raw && raw.body) buf = await new Response(raw.body).arrayBuffer();
          else if (raw && raw.audio) buf = b64ToBytes(String(raw.audio)).buffer as ArrayBuffer;
          if (!buf || buf.byteLength < 200) throw new Error('aura_empty');
          return buf;
        };
        const requested = String(b.speaker || 'asteria').toLowerCase();
        // Aura-2(en) 지원 화자 — 목록 밖 이름이 오면 여자 기본값으로 안전하게.
        const AURA2 = new Set(['amalthea','andromeda','apollo','arcas','aries','asteria','athena','atlas','aurora','callista','cora','cordelia','delia','draco','electra','harmonia','helena','hera','hermes','hyperion','iris','janus','juno','jupiter','luna','mars','minerva','neptune','odysseus','ophelia','orion','orpheus','pandora','phoebe','pluto','saturn','thalia','theia','vesta','zeus']);
        const AURA2_MALE = new Set(['apollo','arcas','aries','atlas','draco','hermes','hyperion','janus','jupiter','mars','neptune','odysseus','orion','orpheus','pluto','saturn','zeus']);
        const AURA1 = new Set(['angus','asteria','arcas','orion','orpheus','athena','luna','zeus','perseus','helios','hera','stella']);
        try {
          const spk2 = AURA2.has(requested) ? requested : 'asteria';
          /* 🔁 한 번 더 물어본다 — 「목소리가 계속 변해」(2026-08-31 사장님 제보)의 첫 겹.
             Aura-2 가 «한 번» 흔들리면 그 문장만 Aura-1 이 읽는데, 화자가 바뀌므로
             (Noah=aries → orion) 대화 중간에 다른 사람이 끼어든 것처럼 들린다.
             한 번 더 물어보면 일시적 흔들림은 여기서 끝나고 고른 목소리가 유지된다.
             ⛔ 뉴런 소진(429)에는 재시도하지 않는다 — 답이 같고 시간만 늘어난다.
             ⛔ 폴백 자체를 없애지는 않는다 — 소리가 아예 안 나는 것이 더 나쁘다. */
          let buf: ArrayBuffer;
          try {
            buf = await auraRun('@cf/deepgram/aura-2-en', spk2);
          } catch (firstErr: any) {
            if (quota || isQuota(firstErr?.message)) throw firstErr;
            console.warn('[voice/tts] aura-2 retry after:', firstErr?.message);
            await new Promise((r) => setTimeout(r, 150));
            buf = await auraRun('@cf/deepgram/aura-2-en', spk2);
          }
          await putCache(buf);
          // 진단 헤더 — 「고른 목소리가 아닌 소리가 난다」 제보를 코드가 아니라 응답으로 가른다
          return new Response(buf, { headers: { ...audioHeaders, 'X-TTS-Engine': 'aura-2', 'X-TTS-Speaker': spk2 } });
        } catch (a2Err: any) {
          if (isQuota(a2Err?.message)) quota = true;
          console.warn('[voice/tts] aura-2 failed, fallback aura-1:', a2Err?.message);
        }
        try {
          /* Aura-1 폴백 — 요청 화자가 Aura-1 목록에 없으면 성별을 맞춰 대체한다.
             ⛔ 여자 대체를 'asteria' 로 하면 안 된다 — 그것은 화면의 «Emma» 전용 목소리라,
                Lily(delia)가 한 번 폴백하는 순간 «Lily 를 골랐는데 Emma 목소리» 가 된다.
                2026-08-31 사장님 제보가 정확히 이것이었다(「번갈아를 안 눌렀는데 Emma 로 바뀜」).
             ✅ 그래서 사람마다 다른 목소리로 떨어지게 두고, 화면이 쓰는 네 친구의 기본 화자는
                폴백해도 서로 겹치지 않아야 한다(voice_fallback_harness 가 그것을 검사한다). */
          const AURA1_SUB: Record<string, string> = {
            // 여자 (Emma=asteria 는 대체값으로 쓰지 않는다)
            delia: 'luna', amalthea: 'athena', thalia: 'hera', aurora: 'luna',
            cora: 'athena', phoebe: 'hera', andromeda: 'stella',
            // 남자
            aries: 'orion', atlas: 'zeus', hermes: 'orpheus', apollo: 'perseus',
            odysseus: 'perseus',   // 2026-10-02 Jake 목소리 — 기본(orion)으로 떨어지면 Noah(aries→orion)와 같은 목소리가 된다
          };
          const spk1 = AURA1.has(requested)
            ? requested
            : (AURA1_SUB[requested] || (AURA2_MALE.has(requested) ? 'orion' : 'luna'));
          const buf = await auraRun('@cf/deepgram/aura-1', spk1);
          /* ⚠️ «요청 화자» 키로 저장하면 안 된다 — 일시 장애가 영구가 된다.
             바로 아래 melotts 주석이 같은 이유로 «캐시 금지» 를 못 박고 있었는데
             이 한 단계만 빠져 있었다. 실제로 쓴 화자(spk1) 키로 저장하면
             ① 요청 화자 키는 비어 있어 다음에 Aura-2 가 살아나면 제대로 만들고
             ② 그 화자를 진짜로 고른 사람은 이 캐시를 정상적으로 재사용한다. */
          await putCacheAs(await ttsKey(spk1), buf);
          return new Response(buf, { headers: { ...audioHeaders, 'X-TTS-Engine': 'aura-1', 'X-TTS-Speaker': spk1 } });
        } catch (auraErr: any) {
          if (isQuota(auraErr?.message)) quota = true;
          console.warn('[voice/tts] aura-1 failed, fallback melotts:', auraErr?.message);
          try {
            return await melo('en');
          } catch (meloErr: any) {
            if (isQuota(meloErr?.message)) quota = true;
            // 서버 TTS 전부 실패 → JSON 에러로 명확히 알린다(브라우저가 기기 음성으로 폴백하게).
            return json({ ok: false, error: quota ? 'ai_quota_exceeded' : 'tts_failed', quota }, quota ? 503 : 502);
          }
        }
      } catch (e: any) {
        console.warn('[voice/tts] error:', e?.message);
        return json({ ok: false, error: e?.message || 'tts_failed' }, 500);
      }
    }
  return null;
}
