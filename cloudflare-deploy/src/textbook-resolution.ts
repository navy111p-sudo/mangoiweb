/**
 * 📐 교재 원본 해상도 점검 — 「교재가 흐리다」가 렌더링 탓인지 원본 탓인지 가른다.
 *
 * [왜 있나 — 2026-10-02, 파일럿 보고서 후속 제안 P6]
 *   8/25 에 화면 쪽(devicePixelRatio 배율·단계적 축소)은 고쳤다. 그 뒤에도 흐리다면
 *   원인은 «업로드된 원본이 작다» 일 가능성이 크다. 그런데 D1 `textbook_files` 에는
 *   가로·세로 칸이 없다(size_bytes 뿐). 파일 크기는 압축률에 따라 갈려 해상도의 대리값이
 *   못 된다 — 그래서 R2 에서 «머리 64KB» 만 읽어 실제 픽셀 크기를 잰다.
 *
 * GET /api/admin/reports/textbook-resolution?offset=0&limit=40&per_book=2&min_width=1600
 *   · 읽기 전용. D1·R2 아무것도 쓰지 않는다.
 *   · 한 번에 «교재 묶음 limit 개 × 묶음당 per_book 장» 만 잰다(R2 범위읽기 최대 limit×per_book).
 *     교재 묶음이 800개 넘게 있어 한 번에 다 재면 무겁다 — offset 으로 넘겨 가며 본다.
 *   · 「(구본)」 묶음과 숨긴 묶음(textbook_hidden_books)은 기본으로 뺀다(include_old=1 로 포함).
 *
 * ⛔ 크기를 «지어내지» 않는다 — 머리에서 못 읽으면 width:null 로 두고 «모름» 으로 센다.
 * ⚠️ 이 판정은 «원본 픽셀» 이다. 수업 화면은 이를 화면 폭에 맞춰 줄이므로 1600px 은
 *    «PC 전체화면에서 글자가 또렷한» 대략의 기준이지 정답이 아니다(min_width 로 바꿀 수 있다).
 */

export type ImgSize = { width: number; height: number; format: 'jpeg' | 'png' | 'webp' };

/** 이미지 머리 바이트에서 가로·세로를 읽는다. 모르면 null. (순수 함수 — 하니스가 직접 돌린다) */
export function imageSizeFromHeader(b: Uint8Array): ImgSize | null {
  if (!b || b.length < 24) return null;
  // PNG: 89 50 4E 47 … IHDR 의 너비·높이(빅엔디언 4바이트씩, 오프셋 16·20)
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const w = (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0;
    const h = (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0;
    return (w > 0 && h > 0) ? { width: w, height: h, format: 'png' } : null;
  }
  // WebP: RIFF....WEBP + VP8 / VP8L / VP8X
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 && b.length >= 30) {
    const c = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (c === 'VP8 ') {
      const w = (b[26] | b[27] << 8) & 0x3fff, h = (b[28] | b[29] << 8) & 0x3fff;
      return (w > 0 && h > 0) ? { width: w, height: h, format: 'webp' } : null;
    }
    if (c === 'VP8L') {
      const w = 1 + (((b[22] & 0x3f) << 8) | b[21]);
      const h = 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6));
      return { width: w, height: h, format: 'webp' };
    }
    if (c === 'VP8X') {
      const w = 1 + (b[24] | b[25] << 8 | b[26] << 16), h = 1 + (b[27] | b[28] << 8 | b[29] << 16);
      return { width: w, height: h, format: 'webp' };
    }
    return null;
  }
  // JPEG: FF D8 … SOFn(C0~CF, 단 C4·C8·CC 제외) 의 높이·너비
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }                 // 채움 바이트
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; } // 길이 없는 표식
      const len = (b[i + 2] << 8) | b[i + 3];
      if (len < 2) return null;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        const h = (b[i + 5] << 8) | b[i + 6], w = (b[i + 7] << 8) | b[i + 8];
        return (w > 0 && h > 0) ? { width: w, height: h, format: 'jpeg' } : null;
      }
      i += 2 + len;
    }
    return null;   // SOF 가 머리 범위 밖(큰 EXIF 썸네일 등) — «모름»
  }
  return null;
}

/** 교재 이름 — 파일명 맨 앞 [대괄호] 안. api-admin.ts 의 BOOK_EXPR 과 같은 규칙. */
export const BOOK_EXPR = `substr(name, 2, instr(name, ']') - 2)`;

const HEAD_BYTES = 65536;

function clampInt(v: string | null, def: number, lo: number, hi: number): number {
  // ⚠️ Number(null) 은 0 이다 — 값이 «없을» 때를 먼저 걸러야 기본값이 산다(CLAUDE.md 「Number(null)」 함정).
  if (v == null || String(v).trim() === '') return def;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
}

export async function textbookResolutionReport(env: any, url: URL): Promise<Response> {
  const json = (o: any, s = 200) => new Response(JSON.stringify(o), {
    status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
  if (!env?.DB || !env?.RECORDINGS) return json({ ok: false, error: 'binding_missing' }, 500);

  const offset = clampInt(url.searchParams.get('offset'), 0, 0, 100000);
  const limit = clampInt(url.searchParams.get('limit'), 40, 1, 100);
  const perBook = clampInt(url.searchParams.get('per_book'), 2, 1, 5);
  const minWidth = clampInt(url.searchParams.get('min_width'), 1600, 200, 8000);
  const includeOld = url.searchParams.get('include_old') === '1';

  let hidden = new Set<string>();
  try {
    const r: any = await env.DB.prepare(`SELECT book FROM textbook_hidden_books`).all();
    hidden = new Set((r?.results || []).map((x: any) => String(x.book)));
  } catch { /* 표가 없으면 숨김 없음 — 읽기만 하는 리포트라 막지 않는다 */ }

  const books: any = await env.DB.prepare(
    `SELECT ${BOOK_EXPR} AS book, COUNT(*) AS pages FROM textbook_files
      WHERE active = 1 AND instr(name, ']') > 2 AND lower(ext) IN ('jpg','jpeg','png','webp')
      GROUP BY book ORDER BY book LIMIT 2000`
  ).all();
  let all: { book: string; pages: number }[] = (books?.results || []).map((r: any) => ({ book: String(r.book), pages: Number(r.pages) || 0 }));
  if (!includeOld) all = all.filter(b => !/\(구본\)/.test(b.book) && !hidden.has(b.book));
  const total = all.length;
  const slice = all.slice(offset, offset + limit);

  const out: any[] = [];
  for (const b of slice) {
    // 묶음 안에서 «앞쪽 페이지» 를 고른다(표지·본문 첫 장) — 무작위는 재현이 안 된다.
    const rows: any = await env.DB.prepare(
      `SELECT id, name, ext, size_bytes, r2_key FROM textbook_files
        WHERE active = 1 AND ${BOOK_EXPR} = ? AND lower(ext) IN ('jpg','jpeg','png','webp')
        ORDER BY id LIMIT ?`
    ).bind(b.book, perBook).all();
    const samples: any[] = [];
    for (const f of (rows?.results || [])) {
      let size: ImgSize | null = null, err = '';
      try {
        const obj: any = await env.RECORDINGS.get(String(f.r2_key), { range: { offset: 0, length: HEAD_BYTES } });
        if (!obj) err = 'r2_missing';
        else size = imageSizeFromHeader(new Uint8Array(await obj.arrayBuffer()));
        if (!size && !err) err = 'unreadable_header';
      } catch (e: any) { err = 'r2_error'; }
      samples.push({ id: f.id, name: f.name, size_kb: Math.round((Number(f.size_bytes) || 0) / 1024),
        width: size ? size.width : null, height: size ? size.height : null, format: size ? size.format : null, error: err || undefined });
    }
    const widths = samples.map(s => s.width).filter((w: any) => typeof w === 'number') as number[];
    const minW = widths.length ? Math.min(...widths) : null;
    out.push({
      book: b.book, pages: b.pages, sampled: samples.length, min_width: minW,
      // ⛔ 모르면 판정하지 않는다 — «낮다» 도 «괜찮다» 도 아니다.
      verdict: minW === null ? 'unknown' : (minW < minWidth ? 'low' : 'ok'),
      samples,
    });
  }
  const count = (v: string) => out.filter(x => x.verdict === v).length;
  return json({
    ok: true, type: 'textbook-resolution', min_width: minWidth, offset, limit, total_books: total,
    next_offset: offset + slice.length < total ? offset + slice.length : null,
    summary: { low: count('low'), ok: count('ok'), unknown: count('unknown') },
    books: out,
  });
}
