// ═══════════════════════════════════════════════════════════════════════
// 🧩 llm-json.ts — 모델이 «거의 JSON» 으로 준 답을 읽는다 (2026-11-11)
//
//   [왜 — 엘리더잼 원장님 피드백]
//     「AI 가 수정한 문장이 원문과 똑같은데 75점이고, 빨간 줄도 안 나와요.」
//     운영 D1 실측(ai_writing_corrections 45건): 8건이 파싱 실패 → 원문 그대로 «수정본»·75점(기본값)으로 나갔다.
//       · 6건: 줄바꿈 있는 글에 모델이 파이썬식 """…""" 로 corrected 를 씀(프롬프트가 학생 글을 """ 로 감싸서)
//       · 1건: 문자열 안 날 줄바꿈  · 1건: 원인 미상(발췌 500자뿐)
//     모델은 제대로 고쳤는데(#87 은 85점·오류 목록까지 있었음) 서버가 못 읽은 것.
//
//   ⛔ 내용은 한 글자도 바꾸거나 지어내지 않는다 — «문법» 만 고쳐 읽고, 못 읽으면 null.
// ═══════════════════════════════════════════════════════════════════════

/** 문자열 «밖» 의 """…""" → JSON 문자열, 문자열 «안» 의 날 줄바꿈·탭 → \n \t, 닫는 괄호 앞 꼬리 쉼표 제거. */
export function repairJsonText(s: string): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') { out += c + (s[i + 1] ?? ''); i++; continue; }
      if (c === '"') inStr = false;
      out += c === '\n' ? '\\n' : c === '\r' ? '\\r' : c === '\t' ? '\\t' : c;
      continue;
    }
    if (s.startsWith('"""', i)) {
      // `"reason": """},` — 빈 문자열 "" 에 " 가 하나 더 붙은 것(운영 #57·#58). 바로 뒤가 , } ] 이면 "" 로 읽는다
      if (/^\s*[,}\]]/.test(s.slice(i + 3, i + 40))) { out += '""'; i += 2; continue; }
      let end = s.indexOf('"""', i + 3);
      if (end < 0) return out;   // 닫히지 않은 """ — 잘린 답이라 읽지 않는다
      while (s[end + 3] === '"') end++;   // 내용이 "로 끝나면(…said "hi"""") 따옴표 묶음의 마지막 """ 가 닫는 것
      out += JSON.stringify(s.slice(i + 3, end));
      i = end + 2;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '}' || c === ']') out = out.replace(/,\s*$/, '');
    out += c;
  }
  return out;
}

/** 문자열 밖의 짝 맞는 { … } 덩어리들(겹치지 않음, 최대 20) — 뒤 설명의 } 를 먹지 않는다(옛 /\{[\s\S]*\}/ 는 먹었다). */
function topObjects(s: string): string[] {
  const out: string[] = [];
  let depth = 0, start = -1, inStr = false;
  for (let i = 0; i < s.length && out.length < 20; i++) {
    const c = s[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') { if (depth++ === 0) start = i; }
    else if (c === '}' && depth > 0 && --depth === 0) out.push(s.slice(start, i + 1));
  }
  return out;
}

/** 모델 답 → 객체(배열·원시값은 null). 이미 객체면 그대로. 던지지 않는다.
 *  앞 설명에 {…} 가 있을 수 있어(「Format {corrected, score}:」) 읽히는 덩어리 중 «가장 긴 것» 을 고른다.
 *  shortcut: 앞 설명에 «닫히지 않은 {» 가 있으면 못 읽는다(null → 다음 모델), 운영 실패에 그 모양이 보이면 그때 손본다. */
export function parseLlmJson(raw: unknown): any | null {
  if (raw && typeof raw === 'object') return Array.isArray(raw) ? null : raw;
  const s = String(raw ?? '');
  const at = s.indexOf('{');
  if (at < 0) return null;
  let best: any = null, bestLen = -1;
  for (const body of topObjects(repairJsonText(s.slice(at)))) {
    if (body.length <= bestLen) continue;
    try {
      const p = JSON.parse(body);
      if (p && typeof p === 'object' && !Array.isArray(p)) { best = p; bestLen = body.length; }
    } catch { /* 다음 덩어리 */ }
  }
  return best;
}
