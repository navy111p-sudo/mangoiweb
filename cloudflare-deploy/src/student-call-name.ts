/* 🧑 AI 가 학생을 «부를» 이름 — 정본 (2026-11-01)
   EN: The name an AI speaks to a student with. Never the login ID.

   🔴 왜 생겼나 (2026-11-01 사장님 제보)
   AI 영어친구가 「Yay, ysyt01! Nice sentence!」 처럼 **로그인 아이디로** 학생을 불렀습니다.
   프롬프트에는 아이디를 넣지 않는데, `students_erp.english_name` 칸에 **아이디가 그대로**
   들어 있는 학생이 있어 그 값을 «이름» 으로 넘긴 것입니다(카페24 원본이 영어 이름 칸에
   아이디를 적어 둔 경우 — 로그인 정본도 `name: u.name || u.uid` 라 같은 모양이 화면에도 있습니다).

   규칙
   - 영어 이름 → 한글 이름 순서로 보되, **아이디와 같은 값은 버립니다**(대소문자·공백 무시 —
     「Ysyt01」 도 사람 이름이 아닙니다).
   - 영문자+숫자가 섞인 «아이디 모양» 값(`abc01`·`lt18`)도 버립니다 — 사람 이름에 숫자는 없습니다.
   - 아무것도 남지 않으면 **빈 값** — 부르는 쪽은 이름 없이 대화합니다.
     ⛔ 아이디로 폴백하지 마세요(이 사고 그 자체이고, 이 서비스에서 아이디는 곧 로그인입니다 — CLAUDE.md 2장).
*/

export interface StudentNameRow {
  english_name?: unknown;
  korean_name?: unknown;
}

const MAX_LEN = 40;

/** 아이디처럼 생긴 값인가 — 글자와 숫자가 «함께» 들어 있으면 사람 이름으로 보지 않는다. */
export function looksLikeLoginId(v: string): boolean {
  const s = v.trim();
  if (!s) return false;
  return /[0-9]/.test(s) && /[A-Za-z가-힣]/.test(s);
}

function clean(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

/** 로마자 이름인가(영어 답장에 그대로 넣어도 되는가). */
export function isLatinName(v: string): boolean {
  return /^[A-Za-z][A-Za-z .'-]*$/.test(v);
}

export interface CallNameOpts {
  /** 영어로만 말하는 화면 — 로마자 이름만 쓴다.
   *  🔴 AI 영어친구는 답장에서 한글을 지운다(src/reply-korean.ts stripAddedKorean) — 한글 이름을 넘기면
   *     「Yay, 김민서!」 가 「Yay, Nice sentence!」 처럼 이름만 잘려 나간다(2026-11-01 샌드박스 실측). */
  latinOnly?: boolean;
}

/** 학생을 부를 이름. 쓸 만한 이름이 없으면 ''(빈 값). */
export function studentCallName(row: StudentNameRow | null | undefined, uid: unknown, opts: CallNameOpts = {}): string {
  if (!row) return '';
  const id = clean(uid).toLowerCase();
  for (const raw of [row.english_name, row.korean_name]) {
    const name = clean(raw).slice(0, MAX_LEN).trim();
    if (!name) continue;
    if (id && name.toLowerCase() === id) continue;   // 아이디를 이름 칸에 적어 둔 경우
    if (looksLikeLoginId(name)) continue;            // 다른 아이디 모양 값
    if (opts.latinOnly && !isLatinName(name)) continue;
    return name;
  }
  return '';
}

/** 지난 대화 기록 속 아이디를 지운다 — 예전 답장에 남은 「Yay, ysyt01!」 를 모델이 따라 하지 않게.
 *  EN: Scrub the login ID out of past chat lines before they go back to the model.
 *  ⚠️ 저장된 기록(D1)은 건드리지 않는다 — 모델에게 «보여 줄» 사본만 바꾼다. */
export function scrubLoginId(text: unknown, uid: unknown, replacement: string): string {
  const t = String(text ?? '');
  const id = clean(uid);
  if (!id || id.length < 3) return t;
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(^|[^A-Za-z0-9_])' + esc + '(?![A-Za-z0-9_])', 'gi');
  return t.replace(re, (_m, pre) => pre + replacement);
}
