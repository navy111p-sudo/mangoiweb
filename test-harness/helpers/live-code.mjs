// 🔎 오려 낸 코드 자리가 «살아 있는가» — 주석 안에 갇힌 줄을 실행해 놓고 «통과» 로 읽지 않게 (2026-10-28)
// 하니스가 소스에서 한 자리(줄·블록)를 오려 내 실행하면, 그 자리가 /* … */ 안으로 들어가 실제로는 죽어 있어도
// 오려 낸 조각 자체는 멀쩡해서 검사가 초록이 됩니다(함정 대조 실측 — 웜업 같은 질문 금지 배선).
// 그래서 «오려 낸 시작 자리가 주석 밖인가» 와 «조각 안의 블록주석 기호 짝이 맞는가» 를 함께 봅니다.
//
// ⚠️ 글자로만 봅니다 — 문자열 안의 주석 기호(정규식·주소)는 구별하지 못합니다. 그래서 «함수 몸통 시작» 처럼
//    좁은 범위(from)부터만 보세요. 그 범위에 그런 문자열이 생기면 «살아 있는 코드» 가 죽었다고 나와(거짓 FAIL)
//    바로 드러납니다 — 반대(죽은 코드를 살았다고 보는 것)로는 틀리지 않습니다.

// pos 자리가 죽어 있으면 그 이유('block-comment' · 'line-comment' · 'missing'), 살아 있으면 ''. from 은 함수 몸통 시작.
export function deadAt(text, pos, from = 0) {
  if (typeof text !== 'string' || pos < 0 || pos < from) return 'missing';
  const seg = text.slice(from, pos);
  if (seg.lastIndexOf('/*') > seg.lastIndexOf('*/')) return 'block-comment';
  const ls = text.lastIndexOf('\n', pos - 1) + 1;
  if (text.slice(ls, pos).includes('//')) return 'line-comment';
  return '';
}

// 오려 낸 조각 안의 «블록주석 여는 기호» 와 «닫는 기호» 개수가 같은가 — 다르면 조각의 일부가 주석으로 막혔거나
// 주석이 조각 밖으로 이어진다. ⚠️ 이 설명을 블록주석으로 쓰지 마세요 — 그 기호를 적는 순간 거기서 닫힙니다(실제로 밟음).
export function commentsBalanced(cut) {
  if (typeof cut !== 'string') return false;
  const n = (s) => cut.split(s).length - 1;
  return n('/*') === n('*/');
}

// 조각 안에 «줄 머리가 // 인» 코드 줄이 있는가 — 한 줄만 막아 두는 변이(예: 거르는 조건 한 줄).
export function hasLineCommentedCode(cut) {
  return typeof cut === 'string' && /^[ \t]*\/\/[ \t]*[A-Za-z_$][\w$.]*\s*[(=]/m.test(cut);
}
