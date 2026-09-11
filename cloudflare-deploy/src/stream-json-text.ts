/**
 * 스트리밍 JSON 에서 «본문 글자만» 꺼내기 — 생 JSON 이 학생 화면으로 새지 않게.
 *
 * [왜 있나 — 2026-09-11 · A-1]
 * 답변을 토큰이 나오는 대로 흘리려면(스트리밍) 모델이 JSON 모드로 주는 조각
 * (`{"reply":"Hi th` …)을 그대로 내보내면 안 됩니다. 이 저장소는 그 사고를 «두 번»
 * 냈습니다 — 잘린 JSON 이 말풍선에 그대로 나갔고(2026-09-08), 파싱된 객체가
 * "[object Object]" 로 나갔습니다(같은 날 저녁, 사장님 「이렇게 잘 못나와object 이 뭐야??」).
 *
 * ✅ 그래서 **서버가 방패** 입니다. 이 모듈은 «값 문자열 «안»에 들어간 뒤에만» 글자를
 *    내보냅니다 — 구조적으로 중괄호·따옴표·키 이름이 나갈 수 없습니다.
 * ✅ 모델이 JSON 을 안 지키고 평문을 주면 **아무것도 안 내보냅니다**(키를 못 찾음).
 *    그때는 부르는 쪽이 «지금 동작»(전체를 받아 한 번에)으로 떨어지면 되고,
 *    그러면 최악이어도 고치기 «전» 과 같아집니다.
 *
 * ⚠️ 조각 경계에서 잘린 이스케이프(`\u00`)를 그대로 내보내면 깨진 글자가 됩니다 —
 *    다 모일 때까지 버퍼에 둡니다.
 * ⛔ 정규식으로 풀지 마세요. 부분 JSON 은 «아직 안 끝난» 문자열이라 정규식이 닫는
 *    따옴표를 못 찾거나 값 «안» 의 따옴표를 끝으로 오인합니다.
 */

export type JsonTextTap = {
  /** 새 조각을 넣고, 그 조각으로 «확정된» 본문 글자만 돌려받습니다(없으면 빈 문자열). */
  push(chunk: string): string;
  /** 지금까지 확정된 본문 전체. */
  text(): string;
  /** 값 문자열 안으로 들어갔는가 (= 모델이 그 키를 실제로 주었는가). */
  found(): boolean;
  /** 값 문자열이 닫혔는가. */
  ended(): boolean;
};

const ESC: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };

export function createJsonTextTap(key: string): JsonTextTap {
  const needle = '"' + key + '"';
  let buf = '';
  let state: 'seek' | 'in' | 'end' = 'seek';
  let out = '';

  function push(chunk: string): string {
    if (state === 'end') return '';
    buf += String(chunk == null ? '' : chunk);
    let emitted = '';

    /* ⚠️ «한 번만» 훑으면 안 됩니다 — 한 조각 안에 같은 이름이 여러 번 올 수 있고
       (배열 `"tags":["reply","fix"]`), 첫 후보에서 포기하면 그 뒤의 «진짜» 키를 그 조각에서
       영영 못 찾습니다. 변이시험에서 드러났습니다(2026-09-11). */
    while (state === 'seek') {
      const k = buf.indexOf(needle);
      if (k < 0) {
        /* 키가 조각 경계에 걸쳐 있을 수 있으니 꼬리를 남깁니다.
           ⛔ 통째로 버리면 `"rep` + `ly":"…` 로 쪼개져 온 키를 영영 못 찾습니다. */
        if (buf.length > needle.length) buf = buf.slice(buf.length - needle.length);
        return '';
      }
      let i = k + needle.length;
      while (i < buf.length && /\s/.test(buf[i])) i++;
      if (i >= buf.length) { buf = buf.slice(k); return ''; }   // 더 기다립니다
      if (buf[i] !== ':') { buf = buf.slice(k + needle.length); continue; }  // 값·배열 안의 같은 글자였음
      i++;
      while (i < buf.length && /\s/.test(buf[i])) i++;
      if (i >= buf.length) { buf = buf.slice(k); return ''; }
      if (buf[i] !== '"') { buf = buf.slice(i); continue; }     // 문자열이 아닌 값(숫자·객체)
      buf = buf.slice(i + 1);
      state = 'in';
    }

    if (state === 'in') {
      let i = 0;
      while (i < buf.length) {
        const c = buf[i];
        if (c === '\\') {
          if (i + 1 >= buf.length) break;                        // 이스케이프가 덜 왔습니다
          const n = buf[i + 1];
          if (n === 'u') {
            if (i + 6 > buf.length) break;                       // \uXXXX 가 덜 왔습니다
            const code = parseInt(buf.slice(i + 2, i + 6), 16);
            emitted += Number.isFinite(code) ? String.fromCharCode(code) : '';
            i += 6; continue;
          }
          emitted += ESC[n] !== undefined ? ESC[n] : n;
          i += 2; continue;
        }
        if (c === '"') { state = 'end'; i++; break; }
        emitted += c; i++;
      }
      buf = buf.slice(i);
    }

    out += emitted;
    return emitted;
  }

  return { push, text: () => out, found: () => state !== 'seek', ended: () => state === 'end' };
}

/**
 * 문장 경계로 자르기 — «완성된 문장» 만 읽기 시작해야 소리가 안 끊깁니다.
 *
 * ⛔ 토큰 단위로 합성하지 마세요. 운율은 문장 단위로 정해져서 "The" / "cat" 을 따로
 *    읽으면 낱말이 뚝뚝 끊깁니다(보내주신 예시 코드의 3단계가 그 모양이었습니다).
 * ⚠️ 소수점(3.14)·약어(Mr.)에서 자르면 한 문장이 둘로 쪼개져 그 자리에서 숨을 쉽니다.
 * ⚠️ 문장부호가 영영 안 오는 답(목록·이모지로 끝나는 말)도 있습니다 — 그때 한 문장도
 *    못 내보내면 스트리밍이 통째로 헛돌아서, 길어지면 공백에서 끊어 내보냅니다.
 */
/** 흔한 호칭·줄임말 — 이 뒤의 마침표는 문장 끝이 아닙니다. */
const ABBREV = /(^|\s)(Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|etc)$/;

export function takeSentences(buf: string, maxRun = 160): { out: string[]; rest: string } {
  const out: string[] = [];
  let rest = String(buf == null ? '' : buf);

  for (;;) {
    let cut = -1;
    for (let i = 0; i < rest.length; i++) {
      const c = rest[i];
      if (c !== '.' && c !== '!' && c !== '?') continue;
      /* ℹ️ 소수점(3.14)은 «다음 글자가 공백이어야 한다» 규칙이 이미 막습니다 —
         따로 검사하던 줄이 있었지만 변이시험에서 **한 번도 일하지 않는 죽은 코드**로
         드러나 뺐습니다(2026-09-11). 남겨 두면 다음 사람이 그 줄을 믿고 고칩니다. */
      /* 약어: 대문자 한 글자 뒤의 마침표(U.S.) 또는 흔한 호칭·줄임말(Mr. Dr. …).
         ⛔ 목록을 길게 늘리지 마세요 — 길수록 «문장이 영영 안 잘리는» 반대 사고가 커집니다.
         ⚠️ 잘못 자르면 소리가 한 번 더 끊길 뿐이지만, Mr. Kim 이 쪼개지면
            「미스터」 하고 쉬었다가 「킴」 이라 읽어 사람이 바로 알아챕니다. */
      if (c === '.' && /[A-Z]/.test(rest[i - 1] || '') && !/[a-z]/.test(rest[i - 2] || '')) continue;
      if (c === '.' && ABBREV.test(rest.slice(Math.max(0, i - 5), i))) continue;
      /* 문장 끝은 «다음 글자가 공백이거나 끝» 이어야 합니다 */
      let j = i + 1;
      while (j < rest.length && (rest[j] === '"' || rest[j] === "'" || rest[j] === ')')) j++;
      if (j < rest.length && !/\s/.test(rest[j])) continue;
      cut = j; break;
    }
    if (cut < 0) break;
    const s = rest.slice(0, cut).trim();
    if (s) out.push(s);
    rest = rest.slice(cut);
  }

  /* 문장부호 없이 길어지면 공백에서 끊습니다 — ⛔ 낱말 «가운데» 를 자르지 않습니다. */
  const head = rest.replace(/^\s+/, '');
  if (head.length > maxRun) {
    const sp = head.lastIndexOf(' ', maxRun);
    if (sp > 20) { out.push(head.slice(0, sp).trim()); rest = head.slice(sp); }
  }
  return { out, rest };
}
