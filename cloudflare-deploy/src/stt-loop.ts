// ═══════════════════════════════════════════════════════════════════════
// 🔁 Whisper 받아쓰기 «반복 환각» 판정 (2026-10-02 사장님 제보 — A.i 말하기 화면에
//    「oah, oah, oah, …」 가 수십 줄 학생 말풍선으로 올라가고 AI 에게 그대로 전송됨)
//
//   Whisper 는 잡음·숨소리·아주 작은 소리에서 «같은 낱말을 끝없이 되풀이» 하는 출력을
//   지어냅니다(알려진 환각 모양). 서버가 그것을 그대로 돌려주면 화면은 «학생이 한 말» 로
//   믿고 말풍선에 그리고 AI 에게 보냅니다 — 에러가 안 나서 아무도 못 막습니다.
//
//   ✅ 그래서 «받아쓴 글자» 를 돌려주기 전에 여기서 거릅니다. 걸리면 빈 문자열을 돌려주고,
//      화면은 이미 있는 «소리가 잘 안 들렸어요» 경로로 갑니다(새 화면 코드가 필요 없습니다).
//   ⛔ 기준을 좁게 두지 마세요 — 「no no no no」(4번) 같은 진짜 아이 말까지 버리면 대화가 끊깁니다.
//      «8낱말 이상인데 한 낱말이 절반 이상» 이거나 «같은 낱말이 6번 연달아» 일 때만 버립니다.
//   이 파일은 import 가 없습니다 — 하니스가 그대로 불러 실제로 돌립니다.
// ═══════════════════════════════════════════════════════════════════════

export function isSttRepeatLoop(text: unknown): boolean {
  const t = String(text == null ? '' : text).trim().toLowerCase();
  if (!t) return false;
  // 띄어쓰기 없는 글자(한자·가나)는 «글자» 하나를 낱말로 본다
  const cjk = t.match(/[぀-ヿ㐀-鿿]/g) || [];
  const words = cjk.length > t.length / 2
    ? cjk
    : t.split(/[^a-z0-9'À-ɏ가-힣]+/).filter(Boolean);
  if (words.length < 6) return false;
  // 같은 낱말이 6번 이상 «연달아»
  let run = 1;
  for (let i = 1; i < words.length; i++) {
    run = words[i] === words[i - 1] ? run + 1 : 1;
    if (run >= 6) return true;
  }
  if (words.length < 8) return false;
  const cnt: Record<string, number> = {};
  let top = 0;
  for (const w of words) { cnt[w] = (cnt[w] || 0) + 1; if (cnt[w] > top) top = cnt[w]; }
  if (top / words.length >= 0.5) return true;                       // 한 낱말이 절반 이상
  if (words.length >= 16 && Object.keys(cnt).length / words.length <= 0.2) return true;  // 「oh yeah oh yeah …」
  return false;
}
