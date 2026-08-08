// ────────────────────────────────────────────────────────────────────────────
// 📏 메뉴 클릭 계측 — /api/admin/menu-hit
//
// 왜 만들었나 (2026-08-08):
//   관리자 메뉴가 87개인데 «무엇이 중요한가» 를 정할 근거가 회사에 하나도 없었다.
//   찾아보니 메뉴 클릭이 서버에 **한 번도 기록된 적이 없다.**
//   adm-quickmenu.js 의 «최근 사용 6개» 는 각자 브라우저 localStorage 에만 남아서
//   그 사람 화면 밖으로는 나오지 않는다. 즉 회사는 아무것도 모른다.
//
//   그래서 지금까지의 우선순위는 전부 인터뷰와 감이었다.
//   (adm-quick-access.js 의 «자주 쓰는 기능 5개» 도 매니저 인터뷰로 손으로 정한 것이다.)
//
//   메뉴를 87개에서 줄이려면 «안 눌리는 메뉴» 를 알아야 한다. 그 사실을 여기서 쌓는다.
//
// 설계 판단:
//   ① 누가 눌렀는지는 **저장하지 않는다.** 역할(role)만 남긴다.
//      알고 싶은 것은 «무엇이 안 눌리나» 이지 «누가 게으른가» 가 아니다.
//      직원 감시 도구가 되면 그 순간 이 기능은 켜 둘 수 없게 된다.
//      역할만으로도 「지사는 이 메뉴를 한 번도 안 쓴다」 같은 판단은 충분히 나온다.
//
//   ② 클릭마다 INSERT 하지 않는다. **(날짜 · 카드 · 역할) 카운터를 UPSERT** 한다.
//      클릭 로그를 그대로 쌓으면 하루 수천 행이 되지만, 우리가 볼 것은 «합계» 뿐이다.
//      이 방식이면 하루 최대 (메뉴 87 × 역할 6) = 522 행이 상한이다.
//
//   ③ 실패해도 화면이 절대 안 죽는다. 무슨 일이 있어도 200 을 돌려준다.
//      계측이 서비스를 방해하면 계측 쪽이 틀린 것이다.
//
//   ④ 화면은 navigator.sendBeacon 으로 보낸다(js/adm-menu-hit.js).
//      beacon 은 Content-Type 을 text/plain 으로 보내는 브라우저가 있어서
//      여기서는 **JSON 헤더를 믿지 않고 본문 텍스트를 직접 파싱**한다.
//
// 권한:
//   · 기록(POST) = 로그인한 관리자 계정 전부. 지사·대리점 포함(index.ts 허용목록에 등록).
//     그들이 무엇을 쓰는지가 오히려 가장 궁금한 부분이다. 응답·저장 어디에도 개인정보가 없다.
//   · 집계 조회(GET /stats) = 본사 계정만.
//
// ⚠️ 이 API 는 아무것도 바꾸지 않는다. 세는 것이 전부다.
// ────────────────────────────────────────────────────────────────────────────

import { getAdminActor } from './auth-admin';
import { oncePerIsolate } from './once-per-isolate';

interface MenuHitEnv {
  DB: D1Database;
  [k: string]: any;
}

const json = (data: any, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/** 한 번 눌렀을 때 서버가 받는 한 건. */
interface HitItem {
  card: string;    // 카드 id (card-students-mgmt …)
  ko?: string;     // 그때 화면에 보이던 라벨 — 나중에 이름을 바꿔도 «무엇이었는지» 알 수 있게
  via?: string;    // 'sidebar' | 'card' | 'search' | 'quick'  ← 어느 길로 갔는지
  n?: number;      // 화면에서 합쳐 보낸 횟수
}

const VIA = ['sidebar', 'card', 'search', 'quick'];

/** 카드 id 는 우리 화면이 만드는 값이다. 그래도 남이 아무 문자열이나 넣을 수 있으니 모양을 검사한다. */
function cleanCard(v: any): string {
  const s = String(v ?? '').trim();
  return /^card-[a-z0-9-]{1,60}$/.test(s) ? s : '';
}

/** 라벨은 표시용이라 길이만 자른다(이모지 포함 가능). */
function cleanLabel(v: any): string {
  return String(v ?? '').trim().slice(0, 60);
}

/** YYYY-MM-DD (KST). 집계 단위가 «하루» 라서 한국 날짜로 끊는다. */
function kstDay(ts: number): string {
  return new Date(ts + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

const ensureTable = oncePerIsolate(async (env: MenuHitEnv) => {
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS admin_menu_hits (` +
    `day TEXT NOT NULL, ` +
    `card TEXT NOT NULL, ` +
    `role TEXT NOT NULL, ` +
    `via TEXT NOT NULL DEFAULT 'sidebar', ` +
    `label_ko TEXT, ` +
    `hits INTEGER NOT NULL DEFAULT 0, ` +
    `updated_at INTEGER NOT NULL, ` +
    `PRIMARY KEY (day, card, role, via))`
  );
  // 「요즘 무엇이 많이 눌리나」가 유일한 조회 패턴이라 날짜가 인덱스의 앞이다.
  try {
    await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_menu_hits_day ON admin_menu_hits(day, hits)`);
  } catch { /* 있으면 그만 */ }
});

/**
 * 화면이 보낸 본문을 읽는다.
 * sendBeacon 은 Content-Type 을 우리 뜻대로 못 정할 때가 있어 헤더를 믿지 않는다.
 */
async function readItems(request: Request): Promise<HitItem[]> {
  let raw = '';
  try { raw = await request.text(); } catch { return []; }
  if (!raw) return [];
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { return []; }
  const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : [parsed]);
  return arr.slice(0, 60);   // 한 번에 받을 상한 — 화면이 고장나도 서버가 끌려가지 않게
}

export async function handleMenuHitApi(
  request: Request,
  url: URL,
  env: MenuHitEnv
): Promise<Response | null> {
  const path = url.pathname;

  // ── 기록 ────────────────────────────────────────────────────────────────
  if (path === '/api/admin/menu-hit' && request.method === 'POST') {
    // 무슨 일이 있어도 화면을 방해하지 않는다. 여기서부터 끝까지 200 이다.
    try {
      const actor = await getAdminActor(request, env as any);
      if (!actor.ok) return json({ ok: true, skipped: 'no_session' });

      const items = await readItems(request);
      if (!items.length) return json({ ok: true, saved: 0 });

      const now = Date.now();
      const day = kstDay(now);
      const role = String(actor.role || 'none').slice(0, 20);

      // 같은 본문 안의 같은 (카드·경로) 는 미리 합쳐 D1 왕복을 줄인다.
      const merged = new Map<string, { card: string; via: string; ko: string; n: number }>();
      for (const it of items) {
        const card = cleanCard(it?.card);
        if (!card) continue;
        const via = VIA.includes(String(it?.via)) ? String(it!.via) : 'sidebar';
        const n = Math.max(1, Math.min(50, Number(it?.n) || 1));
        const key = card + '|' + via;
        const prev = merged.get(key);
        if (prev) prev.n += n;
        else merged.set(key, { card, via, ko: cleanLabel(it?.ko), n });
      }
      if (!merged.size) return json({ ok: true, saved: 0 });

      const stmts = [...merged.values()].map(m =>
        env.DB.prepare(
          `INSERT INTO admin_menu_hits (day, card, role, via, label_ko, hits, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(day, card, role, via) DO UPDATE SET
             hits = hits + excluded.hits,
             label_ko = COALESCE(excluded.label_ko, label_ko),
             updated_at = excluded.updated_at`
        ).bind(day, m.card, role, m.via, m.ko || null, m.n, now)
      );

      await ensureTable(env);
      await env.DB.batch(stmts);
      return json({ ok: true, saved: stmts.length });
    } catch (e) {
      console.warn('[menu-hit] save:', (e as any)?.message);
      return json({ ok: true, saved: 0 });   // 계측 실패는 사용자에게 알릴 일이 아니다
    }
  }

  // ── 집계 조회 (본사 전용) ────────────────────────────────────────────────
  if (path === '/api/admin/menu-hit/stats' && request.method === 'GET') {
    const actor = await getAdminActor(request, env as any);
    if (!actor.ok) return json({ ok: false, error: 'unauthorized' }, 401);

    const days = Math.max(1, Math.min(180, Number(url.searchParams.get('days')) || 30));
    const since = kstDay(Date.now() - days * 86400000);

    try {
      await ensureTable(env);

      // 카드별 합계 — 「무엇이 안 눌리나」를 보려면 0 도 알아야 하지만,
      // 여기서는 «눌린 것» 만 돌려준다. 화면이 가진 메뉴 목록과 빼기하면 0 이 나온다.
      const byCard = await env.DB.prepare(
        `SELECT card, MAX(label_ko) AS label_ko, SUM(hits) AS hits, COUNT(DISTINCT day) AS days
           FROM admin_menu_hits WHERE day >= ?
          GROUP BY card ORDER BY hits DESC`
      ).bind(since).all();

      const byRole = await env.DB.prepare(
        `SELECT role, card, SUM(hits) AS hits
           FROM admin_menu_hits WHERE day >= ?
          GROUP BY role, card ORDER BY role, hits DESC`
      ).bind(since).all();

      const byVia = await env.DB.prepare(
        `SELECT via, SUM(hits) AS hits FROM admin_menu_hits WHERE day >= ? GROUP BY via`
      ).bind(since).all();

      return json({
        ok: true,
        since,
        days,
        cards: byCard.results || [],
        roles: byRole.results || [],
        via: byVia.results || [],
      });
    } catch (e) {
      return json({ ok: false, error: String((e as any)?.message || e) }, 500);
    }
  }

  return null;
}
