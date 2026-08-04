// src/recordings-r2.ts
// 서버 자동 녹화용 R2 multipart 업로드 핸들러
// 이유: MediaRecorder는 청크(Blob)를 계속 뱉어내는데, 한 번에 모아 올리면 브라우저 메모리 폭주 + 중간 끊김 시 전체 손실.
//       R2 multipart upload로 청크를 그대로 흘려보내면 긴 수업(1~2시간)도 안전하게 이어붙일 수 있음.

import { checkAdminSession } from './auth-admin';
import { authUidFromRequest } from './auth-token';

export interface Env {
  DB: D1Database;
  RECORDINGS: R2Bucket;          // wrangler.toml에 새 R2 바인딩 추가 필요
  PDF_STORE: KVNamespace;
  SESSION_STATE: KVNamespace;
  SIGNALING_ROOM: DurableObjectNamespace;
  VIDEO_CALL_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
}

const J = (d: any, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

// ─────────────────────────────────────────────────────────────────────────────
// 📒 파트 접수장부 (recording_parts)
//
// 왜 필요한가 (2026-08-04):
//   multipart 는 «조각을 다 올린 뒤 complete 를 불러야» 파일이 생긴다. 그런데 그 complete 에
//   필요한 upload_id 와 파트별 etag 목록이 **선생님 브라우저 메모리에만** 있었다. 탭이 죽거나
//   PC 가 절전에 들어가면 아무도 마무리를 못 해 조각만 붕 뜬 채 녹화가 통째로 사라진다.
//   실측: status='recording' 으로 멈춘 행이 296건(완료 423건).
//   → 조각이 올라갈 때마다 서버가 장부에 적어두면, 브라우저가 죽어도 **크론이 대신 마무리**한다.
// ─────────────────────────────────────────────────────────────────────────────
const PARTS_DDL = `CREATE TABLE IF NOT EXISTS recording_parts (
  recording_id INTEGER NOT NULL,
  part_number  INTEGER NOT NULL,
  r2_key       TEXT    NOT NULL,
  upload_id    TEXT    NOT NULL,
  etag         TEXT    NOT NULL,
  size_bytes   INTEGER,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (recording_id, part_number)
)`;
let _partsTableReady = false;   // isolate 당 1회만 DDL (파트 업로드는 5MB 마다라 핫패스)
async function ensurePartsTable(env: Env): Promise<void> {
  if (_partsTableReady) return;
  await env.DB.exec(PARTS_DDL.replace(/\s+/g, " "));
  _partsTableReady = true;
}

/** 키에서 recording_id 추출 — create() 가 `rec/<room>/<id>_<ts>.webm` 로 만든다 */
function ridFromKey(key: string): number {
  const base = key.split("/").pop() || "";
  const n = parseInt(base.split("_")[0], 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function clearParts(env: Env, recordingId: number): Promise<void> {
  try {
    await env.DB.prepare(`DELETE FROM recording_parts WHERE recording_id = ?`).bind(recordingId).run();
  } catch { /* 장부 정리는 실패해도 본 흐름에 영향 없음 */ }
}

/**
 * 라우팅 진입점. index.ts의 fetch()에서 /api/recordings/upload 경로를 이쪽으로 분기시키세요.
 */
export async function handleRecordingUpload(
  request: Request,
  url: URL,
  env: Env
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  // 1) multipart 업로드 시작 — 방에 들어가자마자 호출
  if (path === "/api/recordings/upload/create" && method === "POST") {
    const b = (await request.json().catch(() => null)) as {
      recording_id: number;
      room_id: string;
      filename?: string;
    } | null;
    if (!b || !b.room_id || !b.recording_id) return J({ error: "invalid body" }, 400);
    const key = `rec/${b.room_id}/${b.recording_id}_${Date.now()}.webm`;
    const mp = await env.RECORDINGS.createMultipartUpload(key, {
      httpMetadata: { contentType: "video/webm" },
      customMetadata: {
        roomId: b.room_id,
        recordingId: String(b.recording_id),
      },
    });
    // D1에 R2 키 기록 (나중에 재생·삭제 시 필요)
    await env.DB.prepare(
      `UPDATE recordings SET storage = 'r2', file_url = ?, filename = ? WHERE id = ?`
    )
      .bind(key, b.filename || key.split("/").pop(), b.recording_id)
      .run();
    return J({ ok: true, key, upload_id: mp.uploadId });
  }

  // 2) 청크 업로드 — MediaRecorder ondataavailable 마다 호출
  //    왜 PUT raw body? FormData로 감싸면 Worker가 메모리에 전체 로드함. 스트림으로 바로 R2에 흘려야 함.
  if (path === "/api/recordings/upload/part" && method === "PUT") {
    const key = url.searchParams.get("key") || "";
    const uploadId = url.searchParams.get("upload_id") || "";
    const partNumber = parseInt(url.searchParams.get("part") || "0", 10);
    if (!key || !uploadId || !partNumber) return J({ error: "missing params" }, 400);

    const mp = env.RECORDINGS.resumeMultipartUpload(key, uploadId);
    const part = await mp.uploadPart(partNumber, request.body as ReadableStream);

    // 📒 장부 적재 — 브라우저가 죽어도 서버가 마무리할 수 있게 (best-effort).
    //    장부 쓰기가 실패해도 파트 업로드 자체는 성공이므로 응답은 그대로 200.
    try {
      const rid = parseInt(url.searchParams.get("rid") || "", 10) || ridFromKey(key);
      if (rid > 0) {
        await ensurePartsTable(env);
        const len = parseInt(request.headers.get("content-length") || "", 10);
        await env.DB.prepare(
          `INSERT OR REPLACE INTO recording_parts
             (recording_id, part_number, r2_key, upload_id, etag, size_bytes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(rid, partNumber, key, uploadId, part.etag,
               Number.isFinite(len) ? len : null, Date.now()).run();
      }
    } catch (e: any) {
      console.error(`[recordings-r2] 파트 장부 기록 실패 key=${key} part=${partNumber}: ${e?.message || e}`);
    }

    return J({ ok: true, part_number: partNumber, etag: part.etag });
  }

  // 3) 업로드 마무리 — 수업 종료 시 호출
  //    🔴 2026-07-31 실장애: R2 mp.complete()가 실패(또는 beforeunload sendBeacon과 중복 호출로
  //    이미 끝난 upload_id 재완료 시도)해도 예외를 못 잡아 DB가 'completed'로 잘못 남고, 정작
  //    R2엔 파일이 없어 학생이 재생 클릭 시 "재생할 수 없어요"만 뜸(보관기간 만료가 아님).
  //    → (a) 같은 recording_id가 이미 처리됐으면 재호출 없이 그대로 응답(중복 completion 방지)
  //      (b) complete() 예외를 잡아 'upload_failed'로 명시 기록
  //      (c) complete() 성공해도 head()로 실제 존재를 재확인 후에만 'completed' 확정
  if (path === "/api/recordings/upload/complete" && method === "POST") {
    const b = (await request.json().catch(() => null)) as {
      recording_id: number;
      key: string;
      upload_id: string;
      parts: Array<{ partNumber: number; etag: string }>;
      duration_ms?: number;
      size_bytes?: number;
    } | null;
    if (!b || !b.key || !b.upload_id || !Array.isArray(b.parts)) return J({ error: "invalid body" }, 400);

    // (a) 이미 '완료'로 확정된 recording_id면 R2를 다시 건드리지 않고 그대로 확인 응답.
    //   ('upload_failed' 는 여기서 걸러내지 않는다 — 아래 head() 재확인으로 자가복구시키기 위함)
    const existing = await env.DB.prepare(
      `SELECT status FROM recordings WHERE id = ?`
    ).bind(b.recording_id).first<{ status: string | null }>();
    if (existing && (existing.status === "completed" || existing.status === "deleted")) {
      return J({ ok: existing.status === "completed", key: b.key, already: true, status: existing.status });
    }

    const mp = env.RECORDINGS.resumeMultipartUpload(b.key, b.upload_id);
    const now = Date.now();
    let obj: { size: number } | null = null;
    let failReason = "";
    try {
      obj = await mp.complete(b.parts);
    } catch (e: any) {
      failReason = "mp.complete: " + (e?.message || e);
    }

    // 🔴 2026-08-04(2차 실장애): complete() 가 실패해도 «파일은 이미 R2 에 멀쩡히 있는» 경우가 있다.
    //   페이지를 떠날 때 정상 종료(fetch keepalive)와 beforeunload(sendBeacon)가 거의 동시에
    //   같은 upload_id 로 complete 를 보내면, 먼저 도착한 쪽이 성공시키고 뒤엣것은
    //   "The specified multipart upload does not exist. (10024)" 로 실패한다(운영 워커에서 재현 확인).
    //   위 (a) 가드는 «먼저 도착한 쪽의 DB 쓰기가 끝나기 전» 에 뒤엣것이 들어오면 못 막는다.
    //   그때 뒤엣것의 실패를 그대로 믿고 'upload_failed' 로 찍으면 «파일은 멀쩡한데 목록엔
    //   저장 실패» 가 된다 — 실제로 08-04 저녁 녹화 9건이 이 상태가 됐다.
    //   → 성공/실패와 무관하게 head() 로 실물을 먼저 확인하고, 있으면 무조건 성공으로 취급한다.
    //   (multipart 완료 직후 잠깐 안 보일 수 있어 1회 재시도)
    let head: R2Object | null = null;
    for (let i = 0; i < 2; i++) {
      try { head = await env.RECORDINGS.head(b.key); } catch { head = null; }
      if (head) break;
      if (i === 0) await new Promise((r) => setTimeout(r, 300));
    }
    if (head) {
      failReason = "";                                  // 실물이 있다 = 업로드는 성공한 것
      if (!obj) obj = { size: head.size };
    } else if (!failReason) {
      failReason = "head() 재확인 실패 — 완료 응답은 왔지만 객체가 없음";
    }

    if (failReason) {
      console.error(`[recordings-r2] upload/complete 실패 recording_id=${b.recording_id} key=${b.key}: ${failReason}`);
      // 이미 '완료'로 확정된 행은 절대 실패로 강등하지 않는다(늦게 도착한 중복 요청 방어)
      await env.DB.prepare(
        `UPDATE recordings SET status = 'upload_failed', storage = 'r2_failed'
          WHERE id = ? AND status NOT IN ('completed','deleted')`
      ).bind(b.recording_id).run();
      return J({ ok: false, error: failReason }, 500);
    }

    // storage 도 'r2' 로 되돌린다 — 앞선 시도가 'r2_failed' 로 찍어놨을 수 있다(자가복구)
    await env.DB.prepare(
      `UPDATE recordings
       SET ended_at = ?, duration_ms = ?, size_bytes = ?, status = 'completed', file_url = ?, storage = 'r2'
       WHERE id = ? AND status != 'deleted'`
    )
      .bind(now, b.duration_ms || 0, b.size_bytes || obj!.size || 0, b.key, b.recording_id)
      .run();
    await clearParts(env, b.recording_id);   // 마무리됐으니 장부는 비운다
    return J({ ok: true, key: b.key, size: obj!.size });
  }

  // 4) 중단 (네트워크 에러·탭 종료 시 정리)
  if (path === "/api/recordings/upload/abort" && method === "POST") {
    const b = (await request.json().catch(() => null)) as {
      recording_id: number;
      key: string;
      upload_id: string;
    } | null;
    if (!b || !b.recording_id) return J({ error: "invalid body" }, 400);
    try {
      const mp = env.RECORDINGS.resumeMultipartUpload(b.key, b.upload_id);
      await mp.abort();
    } catch (_) {}
    await env.DB.prepare(`UPDATE recordings SET status = 'aborted' WHERE id = ?`)
      .bind(b.recording_id)
      .run();
    await clearParts(env, b.recording_id);   // 중단됐으니 크론이 되살리지 않도록 장부를 비운다
    return J({ ok: true });
  }

  // 5) 재생용 서명된 URL — admin 대시보드에서 사용
  //    R2 퍼블릭 버킷이 아니므로 Worker가 프록시. Range 요청도 통과시켜야 seek 가능.
  if (path.startsWith("/api/recordings/stream/") && method === "GET") {
    const id = parseInt(path.replace("/api/recordings/stream/", ""), 10);
    const row = await env.DB.prepare(
      `SELECT file_url, status FROM recordings WHERE id = ? AND storage = 'r2'`
    )
      .bind(id)
      .first<{ file_url: string; status: string }>();
    if (!row || row.status === "deleted") return new Response("Not found", { status: 404 });

    const range = request.headers.get("Range");
    const opts: R2GetOptions = {};
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      if (m) {
        const start = parseInt(m[1], 10);
        const end = m[2] ? parseInt(m[2], 10) : undefined;
        opts.range = end !== undefined ? { offset: start, length: end - start + 1 } : { offset: start };
      }
    }
    const obj = await env.RECORDINGS.get(row.file_url, opts);
    if (!obj) return new Response("Not found", { status: 404 });

    const headers = new Headers();
    headers.set("Content-Type", "video/webm");
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, max-age=3600");
    if (obj.range) {
      headers.set(
        "Content-Range",
        `bytes ${(obj.range as any).offset}-${(obj.range as any).offset + (obj.range as any).length - 1}/${obj.size}`
      );
      headers.set("Content-Length", String((obj.range as any).length));
      return new Response(obj.body, { status: 206, headers });
    }
    headers.set("Content-Length", String(obj.size));
    return new Response(obj.body, { status: 200, headers });
  }

  // 6) 🔐 통합 재생 — GET /api/recording/play?id={녹화 DB id}[&token=mango_token]
  //    관리자 세션(쿠키) 또는 본인 참여 녹화(mango_token uid ∈ participant_ids)만 재생.
  //    파일명·경로를 클라이언트가 지정하는 방식은 경로조작/IDOR 통로라 금지 — DB id 로만 조회.
  if (path === "/api/recording/play" && method === "GET") {
    const id = parseInt(url.searchParams.get("id") || "", 10);
    if (!Number.isFinite(id) || id <= 0) return J({ ok: false, error: "id required" }, 400);

    // 인증을 먼저 통과해야 레코드 존재 여부조차 알 수 없게 한다(열거 차단)
    const sess = await checkAdminSession(request, env as any);
    let uid: string | null = null;
    if (!sess.ok) {
      uid = await authUidFromRequest(request, url, env);
      if (!uid) return J({ ok: false, error: "unauthorized" }, 401);
    }

    const row = await env.DB.prepare(
      `SELECT file_url, status, storage, filename, participant_ids, participant_names,
              teacher_id, teacher_name, expires_at
         FROM recordings WHERE id = ?`
    ).bind(id).first<{
      file_url: string | null; status: string | null; storage: string | null;
      filename: string | null; participant_ids: string | null; participant_names: string | null;
      teacher_id: string | null; teacher_name: string | null; expires_at: number | null;
    }>();
    if (!row || row.status === "deleted" || row.status === "upload_failed") return new Response("Not found", { status: 404 });
    // 업로드가 실패한 녹화는 status 가 'completed' 로 남아 있어도 R2 에 실물이 없다 —
    // storage 로만 구분되므로 여기서도 함께 본다 (2026-08-04).
    if (row.storage === "r2_failed" || row.storage === "error" || row.storage === "debug") {
      return new Response("Not found", { status: 404 });
    }
    if (row.expires_at && row.expires_at < Date.now()) return new Response("Not found", { status: 404 });

    // 학생은 본인이 참여한 녹화만 — 불일치도 404(존재 여부 오라클 방지).
    // 판정은 목록 API(/api/student/recordings)와 동일: 녹화가 학생 '이름'으로 저장되는
    // 관례가 있어 uid 외에 students_erp 등록 이름·데모 카드 이름·교사 본인까지 인정.
    if (!sess.ok) {
      const identities = new Set<string>([String(uid)]);
      try {
        const s: any = await env.DB.prepare(
          `SELECT student_name, korean_name, english_name, username FROM students_erp WHERE user_id = ?`
        ).bind(uid).first();
        for (const v of [s?.student_name, s?.korean_name, s?.english_name, s?.username]) {
          const t = String(v || "").trim();
          if (t) identities.add(t);
        }
      } catch {}
      // 데모 빠른 로그인 카드 표시이름 (api-mango.ts DEMO_CARD_NAMES 와 동일하게 유지)
      const DEMO_CARD_NAMES: Record<string, string> = {
        hong: "홍길동", kim: "김민수", lee: "이지민", park: "박서연", navy111p: "정우영", student: "데모학생",
      };
      if (DEMO_CARD_NAMES[String(uid)]) identities.add(DEMO_CARD_NAMES[String(uid)]);

      const rowSide = new Set<string>();
      for (const js of [row.participant_ids, row.participant_names]) {
        try { for (const p of JSON.parse(js || "[]")) rowSide.add(String(p)); } catch {}
      }
      if (row.teacher_id) rowSide.add(String(row.teacher_id));
      if (row.teacher_name) rowSide.add(String(row.teacher_name));

      let owned = false;
      for (const idn of identities) if (rowSide.has(idn)) { owned = true; break; }
      if (!owned) return new Response("Not found", { status: 404 });
    }

    // R2 키 해석 — file_url 우선, 없으면 레거시 filename 폴백(목록 API 의 옛 규칙과 동일)
    let r2Key = String(row.file_url || "");
    if (!r2Key && row.filename) {
      const fn = String(row.filename);
      r2Key = fn.startsWith("rec/") || fn.startsWith("recordings/") ? fn : "recordings/" + fn;
    }
    if (!r2Key || /^https?:\/\//.test(r2Key)) return new Response("Not found", { status: 404 });

    const obj2 = await env.RECORDINGS.get(r2Key, (() => {
      const range = request.headers.get("Range");
      const opts: R2GetOptions = {};
      if (range) {
        const m = /bytes=(\d+)-(\d*)/.exec(range);
        if (m) {
          const start = parseInt(m[1], 10);
          const end = m[2] ? parseInt(m[2], 10) : undefined;
          opts.range = end !== undefined ? { offset: start, length: end - start + 1 } : { offset: start };
        }
      }
      return opts;
    })());
    if (!obj2) return new Response("Not found", { status: 404 });

    const name = String(row.filename || row.file_url);
    const ctype = /\.mp4(\?|$)/i.test(name) ? "video/mp4" : "video/webm";
    const headers = new Headers();
    headers.set("Content-Type", ctype);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, max-age=600");
    if (obj2.range) {
      headers.set(
        "Content-Range",
        `bytes ${(obj2.range as any).offset}-${(obj2.range as any).offset + (obj2.range as any).length - 1}/${obj2.size}`
      );
      headers.set("Content-Length", String((obj2.range as any).length));
      return new Response(obj2.body, { status: 206, headers });
    }
    headers.set("Content-Length", String(obj2.size));
    return new Response(obj2.body, { status: 200, headers });
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🛟 버려진 녹화 자동 마무리 (크론) — 2026-08-04
//
//   브라우저가 complete 를 못 보내고 죽으면 조각은 R2 에 다 올라와 있는데도 파일이 안 생긴다.
//   장부(recording_parts)에 upload_id·etag 가 남아 있으므로 **서버가 대신 마무리**한다.
//
//   안전장치:
//     · status='recording' 인 행만 — completed/aborted/deleted 는 손대지 않는다
//     · complete 가 실패해도 head() 로 실물을 확인해 «이미 있으면 성공» 처리
//     · 한 번에 MAX_PER_RUN 건만 (크론 시간·D1 부하 제한)
//     · 킬스위치: KV 'recording_finalize' = 'off'
//
// 🔴 2026-08-05 실장애로 «버려짐» 판정 기준을 바꿨다.
//   처음엔 «15분간 새 파트 없음 = 버려진 것» 으로 봤는데, **파트는 5MiB 가 모여야 하나 올라간다.**
//   화면 움직임이 적은 수업(정지된 교재를 띄워두고 말하는 수업)은 15분 안에 5MiB 를 못 채우는 게
//   정상이다. 그 기준이면 **진행 중인 수업을 죽은 것으로 오인해 그 시점까지만 봉인**할 수 있다.
//   → 아래 두 조건을 «모두» 만족할 때만 건드린다:
//      ① 시작한 지 MIN_AGE_MS 이상 — 어떤 수업도 이만큼 길지 않으니 진행 중일 리 없다
//      ② 마지막 파트가 QUIET_MS 이상 조용
//   안전망은 «빨리» 보다 «절대 살아있는 걸 안 건드림» 이 우선이다. 복구가 몇 시간 늦어도 된다.
// ═══════════════════════════════════════════════════════════════════════════
const MIN_AGE_MS = 4 * 60 * 60 * 1000;    // 시작 후 4시간(최장 수업 2시간 남짓의 두 배)
const QUIET_MS = 30 * 60 * 1000;          // 마지막 파트 후 30분 조용
const MAX_PER_RUN = 10;
// 조각이 하나도 없이 오래 남은 'recording' = 빈 껍데기(데이터가 어디에도 없음).
// 학생 목록에 ⏳준비중 으로 영원히 뜨므로 'aborted' 로 정리한다.
const EMPTY_AGE_MS = 12 * 60 * 60 * 1000;

export async function runRecordingFinalizeSweep(
  env: Env,
  opts?: { minAgeMs?: number; quietMs?: number; limit?: number }
): Promise<{ ok: boolean; scanned: number; finalized: number; failed: number; emptied: number; details: any[] }> {
  const out = { ok: true, scanned: 0, finalized: 0, failed: 0, emptied: 0, details: [] as any[] };
  try {
    const kill = await env.SESSION_STATE?.get?.("recording_finalize");
    if (kill === "off") return { ...out, ok: true };
  } catch { /* KV 못 읽어도 계속 */ }

  const now = Date.now();
  const limit = opts?.limit ?? MAX_PER_RUN;
  const ageCut = now - (opts?.minAgeMs ?? MIN_AGE_MS);
  const quietCut = now - (opts?.quietMs ?? QUIET_MS);

  let cands: any[] = [];
  try {
    const rs = await env.DB.prepare(
      `SELECT p.recording_id AS rid, p.r2_key AS r2key, p.upload_id AS uid,
              COUNT(*) AS n, MAX(p.created_at) AS last_at, SUM(p.size_bytes) AS total,
              r.started_at AS started_at
         FROM recording_parts p
         JOIN recordings r ON r.id = p.recording_id
        WHERE r.status = 'recording'
          AND r.started_at IS NOT NULL AND r.started_at < ?
        GROUP BY p.recording_id, p.r2_key, p.upload_id
       HAVING MAX(p.created_at) < ?
        ORDER BY MAX(p.created_at) ASC
        LIMIT ?`
    ).bind(ageCut, quietCut, limit).all();
    cands = (rs.results || []) as any[];
  } catch (e: any) {
    // 장부 테이블이 아직 없으면(=배포 직후) 조용히 통과
    return { ...out, ok: true };
  }
  out.scanned = cands.length;

  for (const c of cands) {
    const rid = Number(c.rid);
    try {
      const pr = await env.DB.prepare(
        `SELECT part_number, etag FROM recording_parts
          WHERE recording_id = ? AND r2_key = ? AND upload_id = ?
          ORDER BY part_number ASC`
      ).bind(rid, c.r2key, c.uid).all();
      const parts = ((pr.results || []) as any[])
        .map((p) => ({ partNumber: Number(p.part_number), etag: String(p.etag) }));
      if (!parts.length) { await clearParts(env, rid); continue; }

      let failReason = "";
      let size = 0;
      try {
        const mp = env.RECORDINGS.resumeMultipartUpload(String(c.r2key), String(c.uid));
        const obj = await mp.complete(parts);
        size = obj.size;
      } catch (e: any) {
        failReason = String(e?.message || e);
      }
      // 실패했어도 실물이 있으면 성공 (누군가 이미 마무리했을 수 있다)
      let head: R2Object | null = null;
      try { head = await env.RECORDINGS.head(String(c.r2key)); } catch { head = null; }
      if (head) { failReason = ""; size = size || head.size; }

      if (failReason) {
        out.failed++;
        out.details.push({ rid, ok: false, parts: parts.length, error: failReason });
        console.error(`[rec-finalize] 실패 id=${rid} key=${c.r2key} parts=${parts.length}: ${failReason}`);
        await env.DB.prepare(
          `UPDATE recordings SET status = 'upload_failed', storage = 'r2_failed'
            WHERE id = ? AND status NOT IN ('completed','deleted')`
        ).bind(rid).run();
        await clearParts(env, rid);
        continue;
      }

      const lastAt = Number(c.last_at) || Date.now();
      const startedAt = Number(c.started_at) || lastAt;
      await env.DB.prepare(
        `UPDATE recordings
            SET ended_at = ?, duration_ms = ?, size_bytes = ?, status = 'completed',
                file_url = ?, storage = 'r2'
          WHERE id = ? AND status NOT IN ('completed','deleted')`
      ).bind(lastAt, Math.max(0, lastAt - startedAt), size || Number(c.total) || 0,
             String(c.r2key), rid).run();
      await clearParts(env, rid);
      out.finalized++;
      out.details.push({ rid, ok: true, parts: parts.length, size });
      console.log(`[rec-finalize] 되살림 id=${rid} parts=${parts.length} size=${size}`);
    } catch (e: any) {
      out.failed++;
      out.details.push({ rid, ok: false, error: String(e?.message || e) });
    }
  }

  // 🧹 빈 껍데기 정리 — 조각이 하나도 없이 EMPTY_AGE_MS 넘게 'recording' 으로 남은 행.
  //   R2 에 데이터가 아예 없으므로 복구 대상이 아니고, 그대로 두면 학생 목록에
  //   ⏳준비중 으로 영원히 남는다. 되살릴 게 있는 행(장부에 조각이 있는 행)은 건드리지 않는다.
  try {
    const r = await env.DB.prepare(
      `UPDATE recordings SET status = 'aborted'
        WHERE status = 'recording'
          AND started_at IS NOT NULL AND started_at < ?
          AND size_bytes IS NULL
          AND id NOT IN (SELECT DISTINCT recording_id FROM recording_parts)`
    ).bind(now - EMPTY_AGE_MS).run();
    out.emptied = r.meta?.changes || 0;
    if (out.emptied) console.log(`[rec-finalize] 빈 껍데기 ${out.emptied}건 정리(aborted)`);
  } catch (e: any) {
    console.error('[rec-finalize] 빈 껍데기 정리 실패:', e?.message || e);
  }

  return out;
}
