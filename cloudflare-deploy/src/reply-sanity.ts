/**
 * 🧯 «학생에게 내보내도 되는 문장인가» — 무너진 AI 출력 차단 (2026-08-31)
 *
 * 발단 — 사장님 화면 실사고. 웜업 1단계(첫걸음·3~5단어)인데 이런 것이 그대로 나갔습니다:
 *   "ile And a oneeringty " of a \ering cost of normt ofering a plantricum of just of a
 *    the of the a coating of of a plenty of minimal for of a place of a put of more the
 *    other a good of a of other type of a only epic of conjunctions of any more place of …
 * 200 토큰을 꽉 채운 낱말 죽입니다. 학생 화면에는 그 한국어 번역까지 나란히 떴습니다.
 *
 * 🔴 왜 막히지 않았나 — 웜업에는 «출력을 보는 단계» 가 한 곳도 없었습니다.
 *    handleWarmupChat 의 재시도 조건은 ① 빈 문자열 ② 직전과 같은 문장, 둘뿐입니다.
 *    프롬프트에 「3~5단어」라고 적기만 하고, 모델이 안 지켰을 때 막을 방법이 없었습니다.
 *    (AI 영어친구에는 있습니다 — ai-friend-level.ts 의 «재 보고·다시 뽑고·줄이기»)
 *
 * ⛔ 문장을 «고쳐 쓰지» 않습니다. 아이가 그대로 따라 읽을 문장을 코드가 지어내는 것이 됩니다
 *    (이 저장소의 반복 규칙: 모르면 만들지 않는다). 여기서 하는 일은 «버릴지 말지» 판정뿐입니다.
 *
 * ⚠️ 느슨한 쪽으로 실패합니다 — 멀쩡한 문장을 버리면 대화가 끊기고, 그건 학생에게
 *    깨진 문장 하나보다 나쁩니다. 그래서 임계값은 «누가 봐도 무너진» 자리에만 걸립니다.
 *
 * 이 파일은 import 가 하나도 없습니다 — 하니스가 그대로 불러 «실제로 돌려서» 검증합니다.
 */

/** 낱말로 자른다(구두점·기호 제거). 한글은 남긴다 — 영어 말풍선에 한글이 섞이는 것도 신호다. */
function words(s: string): string[] {
  return String(s || '').toLowerCase().replace(/[^a-z가-힣0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
}

/** 무너진 출력인가. 이유를 돌려주고, 멀쩡하면 빈 문자열. */
export function replyBreakReason(text: string): string {
  const t = String(text || '').trim();
  if (!t) return 'empty';
  const w = words(t);

  /* ① 같은 낱말이 지나치게 반복 — degenerate 출력의 가장 뚜렷한 지문.
     🔴 임계값을 «비율» 로만 가르면 안 됩니다. 실사고는 of 59회/279낱말 = 21%,
        그런데 정상 열거형 답변("I like dogs. I like cats. …")도 i 6회/24낱말 = 25% 입니다.
        비율이 겹치므로 갈리는 것은 «개수» 뿐입니다(59 대 6) — 그래서 10회로 둡니다.
        ⛔ 불용어(of·the·i)를 빼는 방식으로 풀지 마세요 — 실사고에서 폭주한 낱말이 바로 'of' 입니다.
        ⚠️ 6회로 되돌리면 정상 답변이 버려집니다(하니스 ②절이 그 세 문장을 들고 있습니다). */
  if (w.length >= 12) {
    const cnt: Record<string, number> = Object.create(null);
    for (const x of w) cnt[x] = (cnt[x] || 0) + 1;
    let top = '', n = 0;
    for (const k of Object.keys(cnt)) if (cnt[k] > n) { n = cnt[k]; top = k; }
    if (n >= 10 && n / w.length >= 0.15) return 'repeat:' + top + 'x' + n;
  }

  /* ② 서로 다른 낱말이 너무 적다 — 길게 늘어놓았는데 어휘가 없으면 문장이 아니다. */
  if (w.length >= 25) {
    const uniq = new Set(w).size / w.length;
    if (uniq < 0.42) return 'lowvariety:' + uniq.toFixed(2);
  }

  /* ③ 길게 이어지는데 문장이 끝나지 않는다.
     · nostop — 40낱말인데 마침표가 하나도 없다. max_tokens 로 잘린 답의 지문이라 잡는 것이 맞다.
     · runon  — 한 문장이 지나치게 길다.
       ⚠️ 이 규칙은 «레벨을 모른 채» 돕니다. 45로 두었더니 최상급(상한 없음)의 46낱말 정상
          문장이 걸렸습니다 — WARMUP_WORD_CAP[8]=0 으로 「길이로 안 잡는다」고 해 둔 것을
          이 규칙이 우회한 것입니다. C1 한 문장 46낱말은 있을 수 있어 60으로 넓혔습니다. */
  if (w.length >= 40) {
    const enders = (t.match(/[.!?]/g) || []).length;
    if (enders === 0) return 'nostop';
    if (w.length / enders >= 60) return 'runon';
  }

  /* ⑤ 🀄 한자 문장 — 위 ①~③ 은 이 자리에서 **원리상 아무것도 못 봅니다.**
        `words()` 가 `[a-z가-힣0-9' ]` 밖을 전부 지워서 순수 중국어 문장은 `w` 가 «빈 배열» 이
        되고, 길이 조건(12·25·40)에 한 번도 안 걸려 무슨 죽이 와도 그대로 통과합니다
        (2026-09-13 중국어 대화를 붙이며 실측). 그래서 «글자» 로 같은 질문을 한 번 더 합니다.
        ⚠️ 임계값은 영어보다 훨씬 느슨하게 둡니다 — 중국어는 的·了 처럼 한 글자가 원래 자주
           나오고, 멀쩡한 문장을 버리면 대화가 끊겨서 깨진 문장 하나보다 나쁩니다(이 파일 머리말).
        ⛔ 성조·병음·번체자 검사는 하지 않습니다 — 그건 «무너졌는가» 가 아니라 «맞는가» 이고,
           맞는지는 여기서 알 수 없습니다. */
  const han = t.replace(/[^\u3400-\u9fff]/g, '');
  if (han.length >= 30) {
    const hc: Record<string, number> = Object.create(null);
    for (const ch of han) hc[ch] = (hc[ch] || 0) + 1;
    let htop = '', hn = 0;
    for (const k of Object.keys(hc)) if (hc[k] > hn) { hn = hc[k]; htop = k; }
    if (hn >= 12 && hn / han.length >= 0.2) return 'zhrepeat:' + htop + 'x' + hn;
    // 40자를 넘겼는데 문장이 한 번도 안 끝났다 — max_tokens 로 잘린 답의 지문
    if (han.length >= 40 && !/[。！？!?.]/.test(t)) return 'zhnostop';
  }

  /* ④ 제어문자·역슬래시가 섞임 — 실사고 문장에 «\ering» 이 있었다.
        ⛔ 철자 검사는 하지 않는다 — 고유명사·아이 이름이 걸린다. */
  if (/\\/.test(t)) return 'backslash';
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(t)) return 'control';

  return '';
}

/** 그 레벨에서 «너무 긴가» — 프롬프트가 안 지켜졌을 때의 안전망.
 *  ⚠️ 상한은 목표의 두 배 + 6낱말로 넉넉히 둔다. 문법을 지키다 조금 넘는 것을 버리면 안 된다
 *     (PR #626 「문법이 길이에 진다」와 같은 뿌리). 여기서 잡을 것은 «몇 배로 긴» 것뿐이다. */
export function replyTooLongFor(text: string, maxWordsPerSentence: number): boolean {
  if (!(maxWordsPerSentence > 0)) return false;
  const cap = maxWordsPerSentence * 2 + 6;
  return String(text || '').split(/(?<=[.!?])\s+/).some((s) => words(s).length > cap);
}

/** 🔴 «버릴 이유» 를 돌려줍니다 — 멀쩡하면 빈 문자열입니다.
 *  ⛔ 이름을 replyIsSane 같은 «참/거짓처럼 읽히는» 말로 바꾸지 마세요. 그러면 다음 사람이
 *     `if (replyIsSane(t)) send(t)` 로 쓰게 되고, 그건 «무너진 답만 내보내는» 코드입니다.
 *     타입체크도 하니스도 그것을 못 잡습니다(2026-08-31 trap-check 지적으로 이름을 바꿨습니다). */
export function replyRejectReason(text: string, maxWordsPerSentence = 0): string {
  const r = replyBreakReason(text);
  if (r) return r;
  return replyTooLongFor(text, maxWordsPerSentence) ? 'toolong' : '';
}
