/* 🔊 짧은 영어 낱말을 «한 문장» 모양으로 — 음성 서버(/api/voice/tts)의 입구 정본 (2026-09-24)
   왜: 게임·퀴즈가 낱말 하나(`study`)만 보내면 문장용 AI 음성(Deepgram Aura)이 첫소리를 자르거나
       억양을 어색하게 읽는다(사장님 제보 — AI 단어 퀴즈 「듣고 맞히기」). 화면이 20곳 넘게
       각자 이 API 를 부르므로, 화면마다 고치지 않고 **서버 입구 한 곳**에서 다듬는다.
   규칙: 영어(lang 이 en…) + 영문자·숫자·' , - 공백만 + 세 낱말 이하 + . ! ? 로 안 끝남
         → 첫 글자 대문자 + 마침표 (`study` → `Study.`, `go to school` → `Go to school.`).
   ⛔ 그 밖(긴 문장·중국어·한글 섞임·이미 끝맺은 것)은 한 글자도 안 바꾼다 — 캐시 키가 바뀌면
      모든 문장을 다시 만들어 뉴런을 태운다. 바뀌는 것은 짧은 낱말뿐이고 그것도 한 번씩만 다시 만든다.
   ⚠️ 이 값은 소리를 만들 때만 쓴다(화면 글자·채점과 무관). 캐시 키도 이 값으로 잡혀 옛 «낱말 그대로»
      캐시본을 비켜 간다. */
export const TTS_SHORT_MAX_WORDS = 3;

export function ttsShortText(text: string, lang: string): string {
  const t = String(text || '').trim();
  if (!t) return t;
  if (!/^en/i.test(String(lang || ''))) return t;
  if (/[.!?]$/.test(t)) return t;
  if (!/^[A-Za-z][A-Za-z0-9' ,\-]*$/.test(t)) return t;
  if (t.split(/\s+/).filter(Boolean).length > TTS_SHORT_MAX_WORDS) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/[\s,]+$/, '') + '.';
}
