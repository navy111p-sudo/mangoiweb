// Guidance shares the existing chat inference; it never starts a second AI request.
const SCENES: Record<string, string> = {
  cooking: 'A family is making pancakes together in a kitchen.',
  soccer: 'Children are playing soccer outside.',
  train: 'An empty train carriage has seats beside a window with countryside outside.',
  cycling: 'A child wearing a helmet is riding a bicycle on a park path.',
  pets: 'A child is gently brushing a dog in a garden.',
  painting: 'A child is painting a sun and sky with a brush at an art table.',
  music: 'A child is sitting at a piano and playing the keys.',
  gardening: 'A child is watering flowers with a watering can in a garden.',
  shopping: 'A parent and child are choosing fruit at a market stall with a shopping basket.',
  beach: 'Children are building a sandcastle on dry sand with the sea in the background.',
};

export function warmupGuidanceRule(body: any, lang: string): string {
  if (body?.guided !== 1) return '';
  const id = String(body.scene_id || '');
  const scene = Object.prototype.hasOwnProperty.call(SCENES, id) ? SCENES[id] : '';
  return [
    '[자연스러운 웜업] 학생이 방금 말한 구체적인 내용에 먼저 짧게 반응하고, 그 내용에 연결되는 질문을 하나만 해. 질문 목록을 차례대로 읽지 마. 학생이 말하지 않은 취향·경험은 지어내지 마.',
    '막히면 같은 주제를 더 구체적인 선택이나 쉬운 질문으로 풀어 줘. 수준 1은 Yes/No, 수준 2는 Yes/No 또는 양자택일로 유지해. 성인 초보자에게 유아 말투를 쓰지 마. 매번 이유를 요구하지 마.',
    '칭찬은 실제 답변에서 확인되는 노력이나 내용을 짚을 때만 짧게 해. 감정을 먼저 이해하고, 형식적인 Perfect!를 반복하지 마. 교정은 기존 규칙대로 한 가지만 해.',
    scene ? '[학생이 선택한 그림] ' + scene + ' 그림에 대해 말하거나 오늘 교재 주제와 연결해. 그림에 없는 사건은 사실로 단정하지 말고 상상임을 분명히 해.' : '',
    '[말하기 도움] 기존 JSON의 reply와 fix는 유지하고 help 필드 하나를 추가해: {"words":["단어1","단어2"],"frame":"빈칸 ____이 있는 답변 시작 부분","example":"가능한 답변 예시 한 문장"}.',
    'help는 반드시 이번 reply의 마지막 질문에 답할 때 쓸 수 있어야 해. 예시는 학생이 실제로 한 말이 아니야. Yes/No 질문이면 frame은 "Yes, ____."처럼 짧게 해. 도움을 만들 수 없으면 help:null. words는 3개 이하, example은 12단어 이내. 도움은 reply에 넣거나 소리 내어 읽지 마.',
    lang === 'zh' ? 'help의 words·frame·example은 중국어 간체자로만 작성해(빈칸 ____ 허용).' : 'help의 words·frame·example은 영어로만 작성해.',
  ].filter(Boolean).join('\n');
}

export type SpeakingHelp = { words: string[]; frame: string; example: string };

// Reject malformed, oversized or wrong-language help. Missing help leaves chat usable.
export function parseSpeakingHelp(raw: unknown, lang: string): SpeakingHelp | null {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()) : raw as any;
    const h = (obj as any)?.help;
    if (!h || !Array.isArray(h.words) || !h.words.length || h.words.length > 3) return null;
    const valid = (s: unknown, max: number) => typeof s === 'string' && s.trim().length > 0 && s.length <= max
      && !/[<>\u0000-\u001f]/.test(s)
      && (lang === 'zh' ? /[\u3400-\u9fff]/.test(s) && !/[가-힣A-Za-z\u3040-\u30ff]/.test(s) : /^[\x20-\x7e’“”]+$/.test(s));
    if (!h.words.every((s: unknown) => valid(s, 32)) || !valid(h.frame, 100) || !h.frame.includes('____') || !valid(h.example, 160)) return null;
    return { words: h.words.map((s: string) => s.trim()), frame: h.frame.trim(), example: h.example.trim() };
  } catch { return null; }
}
