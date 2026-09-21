/**
 * 🀄 Azure Speech — 진짜 «사람» 목소리 TTS (2026-09-14)
 *
 * 📜 왜 생겼나 — 사장님 「남자목소리를 가져올 방법??」
 *    서버 중국어 TTS 는 구글 번역 창구(gtts)뿐이라 목소리가 «한 사람»(여성) 입니다.
 *    그 함수에는 화자 인자가 아예 없습니다 — 그래서 그동안은 그 여성 목소리를
 *    브라우저에서 «굵게» 만들어 남자처럼 들리게 했습니다(warmup.html 의 _zhDeepen).
 *    Azure Speech 에는 중국어 «남성 성우» 가 여럿 있어 그 우회가 필요 없습니다.
 *
 * 🔑 키는 워커에 있습니다 — AZURE_SPEECH_KEY · AZURE_SPEECH_REGION.
 *    [근거의 사슬 — 「azure_used=1 이니까」로 건너뛰면 틀립니다]
 *      그 칸이 1 이어도 진단은 `ok(sdk)`, 즉 «브라우저» 가 Azure SDK 로 성공했다는 뜻이지
 *      워커에 키가 있다는 뜻이 아닙니다. 워커에 있다고 말할 수 있는 근거는 «그 SDK 가 쓰는
 *      임시 토큰을 워커가 AZURE_SPEECH_KEY 로 발급한다» 는 것입니다
 *      (GET /api/voice/azure-token — 키가 없으면 503 azure_not_configured).
 *      실측 2026-09-14: voice_coaching 최근 60일 410건 중 136건이 azure_used=1 · ok(sdk)
 *      ⟹ 그 횟수만큼 토큰 발급이 성공했다 ⟹ 워커에 키가 있다.
 *    ⚠️ 여기까지가 «잰 것» 입니다 — «그 키로 «합성(TTS)» 까지 되는가» 는 별개입니다.
 *    ⚠️ 그래도 «TTS 가 실제로 되는가» 는 요금제·지역에 달려 있어 사람이 한 번 확인해야 합니다.
 *       실패하면 이 함수는 null 을 돌려주고 부르는 쪽이 예전 경로로 갑니다(소리는 계속 납니다).
 *
 * ⛔ 이 파일에서 키를 브라우저로 내보내지 마세요 — 서버에서만 씁니다
 *    (브라우저가 Azure 를 직접 써야 하는 발음평가는 «10분 임시 토큰» 을 쓰는 별도 경로입니다).
 * ⛔ 화자를 요청 본문에서 «그대로» 받지 마세요 — 돈이 나가는 API 라 아는 값만 받습니다
 *    (CLAUDE.md 「비용이 나가는 API 를 만들 때 — 상한을 정본이 들어야 합니다」).
 */

/** 우리가 쓰는 이름 → Azure 보이스. ⛔ 목록에 없는 값은 받지 않습니다. */
export const AZURE_ZH_VOICES: Record<string, string> = {
  /* 젊고 밝은 남성 — 수업 톤에 가장 가깝습니다(Azure 설명: lively, sunshine) */
  yunxi: 'zh-CN-YunxiNeural',
  /* 힘있는 남성 — 스포츠 중계 톤이라 또렷합니다 */
  yunjian: 'zh-CN-YunjianNeural',
  /* 차분한 남성 — 뉴스 아나운서 톤 */
  yunyang: 'zh-CN-YunyangNeural',
  /* 담백한 남성 */
  yunfeng: 'zh-CN-YunfengNeural',
};

/** 그 이름이 우리가 아는 중국어 보이스인가. 모르면 null(= 예전 경로). */
export function azureZhVoice(name: any): string | null {
  const k = String(name || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(AZURE_ZH_VOICES, k) ? AZURE_ZH_VOICES[k] : null;
}

/* 🔴 SSML 은 XML 입니다 — 학생이 쓴 글자가 그대로 들어가므로 반드시 이스케이프합니다.
   안 하면 «&» 하나에 합성이 통째로 실패하고, 태그를 넣으면 SSML 을 주입할 수 있습니다. */
export function xmlEscape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** 한 번에 합성할 수 있는 글자 수 상한. ⛔ 늘리지 마세요 — 글자 수가 곧 요금입니다.
 *  웜업 한 마디는 보통 20~60자라 넉넉합니다. 넘으면 부르는 쪽이 예전 경로로 갑니다. */
export const AZURE_TTS_MAX_CHARS = 300;

/* ⛔ 판별 유니온(`{ok:true}|{ok:false}`)으로 두지 마세요 — 이 저장소의 tsconfig 는
   strict:false 라 좁히기가 동작하지 않아 `az.reason` 이 «없는 속성» 으로 컴파일에 실패합니다
   (CLAUDE.md 2장 「게이트 헬퍼를 판별 유니온으로 만들었더니」). 한 가지 모양으로 둡니다. */
export type AzureTtsResult = { ok: boolean; bytes: ArrayBuffer | null; voice: string; reason: string };

/**
 * Azure Speech 로 MP3 를 만든다. **실패는 전부 ok:false** — 부르는 쪽은 예전 경로로 간다.
 *
 * @param env    Worker env (AZURE_SPEECH_KEY · AZURE_SPEECH_REGION)
 * @param text   읽을 글자
 * @param voice  Azure 보이스 이름(azureZhVoice 가 돌려준 값)
 * @param locale 보이스의 언어. 보이스 이름과 어긋나면 Azure 가 400 을 준다.
 */
export async function azureTts(
  env: any, text: string, voice: string, locale = 'zh-CN',
): Promise<AzureTtsResult> {
  const key = String(env?.AZURE_SPEECH_KEY || '').trim();
  const region = String(env?.AZURE_SPEECH_REGION || '').trim().toLowerCase();
  const bad = (reason: string): AzureTtsResult => ({ ok: false, bytes: null, voice, reason });
  if (!key || !region) return bad(key ? 'no_region' : 'no_key');
  const t = String(text || '').trim();
  if (!t) return bad('no_text');
  if (t.length > AZURE_TTS_MAX_CHARS) return bad('too_long');
  if (!/^[a-z]{2}-[A-Z]{2}-[A-Za-z0-9]+Neural$/.test(voice)) return bad('bad_voice');

  /* ⚠️ 속도·음높이는 여기서 건드리지 않습니다 — 화면이 이미 재생 배속으로 속도를 정하고,
     진짜 남성 성우라 음높이를 내릴 이유가 없습니다(내리면 오히려 «눌린» 소리가 됩니다). */
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">` +
    `<voice name="${voice}">${xmlEscape(t)}</voice></speak>`;

  try {
    const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        // 24kHz MP3 — 말소리에 충분하고 필리핀·중국 회선에서 가볍습니다.
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'mangoi-warmup',
      },
      body: ssml,
    });
    if (!r.ok) return bad('http_' + r.status);
    const ab = await r.arrayBuffer();
    /* 빈 응답·에러 본문을 «소리» 로 내보내지 않는다(Workers AI 가 429 JSON 을 오디오로
       내보내 «소리가 안 나는» 원인이 됐던 그 사고와 같은 자리). */
    if (!ab || ab.byteLength < 800) return bad('empty_' + (ab ? ab.byteLength : 0));
    return { ok: true, bytes: ab, voice, reason: '' };
  } catch (e: any) {
    return bad('fetch_error');
  }
}
