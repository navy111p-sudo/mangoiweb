// db-ddl-once.ts — 같은 DDL 을 이 격리(isolate) 안에서 «한 번만» D1 으로 보낸다. (2026-08-09)
//
// ── 무슨 문제였나 ──────────────────────────────────────────────────────────
// 이 저장소는 표를 «요청 처리 도중» 만든다:
//     await env.DB.exec(`CREATE TABLE IF NOT EXISTS xxx (...)`);
// 핸들러 첫 줄마다 있어서, 그 API 로 요청이 올 때마다 D1 으로 한 번 더 나간다.
// 표가 이미 있어도 왕복은 그대로 발생한다. 실측(2026-08-09):
//     DDL 411건 중 oncePerIsolate 로 감싼 것 19건 · **요청마다 나갈 수 있는 것 392건**
// D1 은 쿼리 단위로 과금되고 지연도 붙는다. 학생이 버튼을 누를 때마다
// 「표 있나? 없으면 만들어」가 같이 나가고 있었다.
//
// ── 왜 호출부를 안 고치나 ──────────────────────────────────────────────────
// 392곳을 손으로 감싸는 건 그 자체가 사고 위험이다. 대신 **DB 층에서** 막는다.
// 다행히 조건이 좋다(실측):
//     · CREATE 249건 · ALTER 51건 = **300건이 env.DB.exec() 로 나간다**
//     · 그리고 **exec() 의 반환값을 쓰는 곳이 한 군데도 없다**
// 그래서 exec 만 가로채면 호출부를 한 글자도 안 고치고 300건이 사라진다.
// (prepare 로 나가는 14건은 그대로 둔다 — 결과 모양을 흉내 내는 건 위험하다)
//
// ── 안전 규칙 ──────────────────────────────────────────────────────────────
// ① 성공한 DDL 만 기억한다. 일시적 D1 오류를 기억하면 그 격리가 영영 표 없이 돈다
//    (once-per-isolate.ts 가 세운 규칙과 같다).
// ② 예외: ALTER TABLE 의 «이미 있는 컬럼» 오류는 **원하는 상태에 도달했다는 뜻**이라
//    기억한다. 이걸 안 하면 ALTER 51건은 매 요청 계속 실패하며 왕복한다.
//    그 밖의 오류는 기억하지 않는다.
// ③ DDL 이 아닌 exec 은 손대지 않는다.

/** 이 격리에서 이미 끝난 DDL 문장들 */
const doneSql = new Set<string>();
/** 같은 DB 객체를 여러 번 감싸도 프록시는 하나 */
const wrapped = new WeakMap<object, any>();

const isDDL = (sql: string) =>
  /^\s*(CREATE\s+(TABLE|INDEX|UNIQUE\s+INDEX|TRIGGER|VIEW)|ALTER\s+TABLE)\b/i.test(sql);

/** SQLite/D1 이 「그 컬럼 이미 있음」을 알릴 때의 문구 */
const isAlreadyApplied = (sql: string, msg: string) =>
  /^\s*ALTER\s+TABLE/i.test(sql) && /duplicate column name|already exists/i.test(msg);

/** 테스트·진단용 — 지금까지 건너뛴 횟수 */
export const ddlOnceStats = { executed: 0, skipped: 0 };

/**
 * `db.exec` 을 감싸, **같은 DDL 문장**은 이 격리에서 한 번만 실제로 보낸다.
 * 그 외 메서드(prepare · batch · dump)는 원본 그대로 통과시킨다.
 */
export function wrapDbDdlOnce<T extends object>(db: T): T {
  if (!db || typeof db !== 'object') return db;
  const cached = wrapped.get(db);
  if (cached) return cached;

  const proxy = new Proxy(db, {
    get(target: any, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop !== 'exec' || typeof value !== 'function') {
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return async function (sql: string, ...rest: any[]) {
        const key = String(sql ?? '');
        if (!isDDL(key)) return value.apply(target, [sql, ...rest]);
        if (doneSql.has(key)) { ddlOnceStats.skipped++; return undefined; }
        try {
          const r = await value.apply(target, [sql, ...rest]);
          doneSql.add(key);
          ddlOnceStats.executed++;
          return r;
        } catch (e: any) {
          const msg = String(e?.message || e);
          // ② 「이미 있는 컬럼」은 원하는 상태다 — 기억하고 넘어간다.
          if (isAlreadyApplied(key, msg)) { doneSql.add(key); ddlOnceStats.executed++; }
          // 그 밖의 실패는 기억하지 않는다(다음 요청이 다시 시도).
          throw e;   // 호출자의 try/catch 계약을 바꾸지 않는다
        }
      };
    },
  });

  wrapped.set(db, proxy);
  return proxy as T;
}

/** 테스트용 — 격리 캐시를 비운다(운영 코드에서는 부르지 않는다) */
export function __resetDdlOnce() {
  doneSql.clear();
  ddlOnceStats.executed = 0;
  ddlOnceStats.skipped = 0;
}
