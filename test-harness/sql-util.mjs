// sql-util.mjs — 스키마 관련 하니스·도구가 공유하는 아주 작은 유틸 (2026-08-09)
// 한 벌만 둔다. 두 벌이 되면 또 갈라진다 — 이 저장소가 그걸로 여러 번 다쳤다.

/** SQL 주석(-- 줄, 블록)을 지운다.
 *  ⚠️ 컬럼 파싱 «전에» 반드시 부를 것. 안 그러면 `-- 설명` 의 `--` 가 컬럼명으로 잡혀
 *     「운영에 없는 컬럼」 가짜 경보가 무더기로 난다(실제로 밟았다: 29건 중 대부분이 그것이었다). */
export function stripSqlComments(s) {
  return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/** CREATE TABLE 본문(괄호 안)에서 컬럼명만 뽑는다. */
export function columnsFromCreateBody(body) {
  const parts = []; let d = 0, cur = '';
  for (const ch of stripSqlComments(body)) {
    if (ch === '(') d++;
    if (ch === ')') d--;
    if (ch === ',' && d === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  // ⚠️ 따옴표·백틱을 **먼저** 벗기고 그 다음에 거른다. 순서를 바꾸면 빈 문자열이 남는다.
  //    이 저장소엔 SQL 을 배열로 조립하는 곳이 있다:
  //        [`CREATE TABLE … (`, `  id INTEGER PRIMARY KEY,`, `  teacher_id INTEGER,` … ].join('')
  //    그러면 각 조각이 백틱으로 시작해, 거르기를 먼저 하면 백틱이 컬럼명으로 통과한 뒤
  //    벗겨져서 ''  가 된다 — 「운영에 없는 컬럼 33개」 같은 가짜 경보가 그렇게 났다.
  return parts.map(p => p.trim().replace(/^[`'"\s]+/, '').split(/\s+/)[0])
    .map(c => c.replace(/["'`]/g, ''))
    .filter(c => c && /^[A-Za-z_]\w*$/.test(c) && !/^(PRIMARY|UNIQUE|FOREIGN|CHECK|CONSTRAINT|NOT|NULL|DEFAULT)$/i.test(c));
}

/** 여는 괄호 위치에서 시작해 균형 잡힌 닫는 괄호 위치를 찾는다. 없으면 -1. */
export function matchParen(text, openIdx) {
  let d = 0;
  for (let j = openIdx; j < text.length; j++) {
    const c = text[j];
    if (c === '(') d++;
    else if (c === ')') { d--; if (!d) return j; }
  }
  return -1;
}
