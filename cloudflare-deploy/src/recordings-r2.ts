// src/recordings-r2.ts
// 서버 자동 녹화용 R2 multipart 업로드 핸들러
// 이유: MediaRecorder는 청크(Blob)를 계속 뱉어내는데, 한 번에 모아 올리면 브라우저 메모리 폭주 + 중간 끊김 시 전체 손실.
//       R2 multipart upload로 청크를 그대로 흘려보내면 긴 수업(1~2시간)도 안전하게 이어붙일 수 있음.

import { checkAdminSession } from './auth-admin';
import { authUidFromRequest, verifyRecDlSig } from './auth-token';

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

async function clearParts(env: Env, recordingId: number): Promise<void> {
  try {
    await env.DB.prepare(`DELETE FROM recording_parts WHERE recording_id = ?`).bind(recordingId).run();
  } catch { /* 장부 정리는 실패해도 본 흐름에 영향 없음 */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔐 업로드 권한 — «실재하는, 지금 녹화 중인 수업» 에만 쓸 수 있게 묶는다 (2026-08-05)
//
//   문제: /api/recordings/upload/* 는 index.ts 의 인증 게이트보다 **앞에서** 처리돼
//   아무 자격증명 없이 호출된다. 진단 중 토큰 없이 create → 5MiB 파트 반복 → complete 까지
//   전부 성공했다. 즉 주소만 알면 누구나 우리 R2 에 무제한으로 파일을 쌓을 수 있고(저장 비용),
//   recording_id 를 바꿔가며 남의 녹화도 건드릴 수 있었다.
//
//   토큰을 곧바로 «필수» 로 만들면 교사 브라우저가 토큰을 안 보내는 경우 녹화가 통째로 멈춘다
//   (M.api 는 쿠키만 보내고 Authorization 을 안 붙인다). 라이브 서비스라 그 위험은 못 진다.
//   → 1단계(지금): **클라이언트 변경 없이도 안전한 것**부터 강제한다.
//        · 쓰기 대상 키는 반드시 «실재하고 지금 녹화 중인» recordings 행의 file_url 이어야 한다
//        · 시작한 지 너무 오래된 녹화에는 더 못 쓴다
//      2단계(다음): 클라이언트가 토큰을 붙이는 것을 배포·확인한 뒤 토큰을 필수로 전환
// ─────────────────────────────────────────────────────────────────────────────
const UPLOAD_WINDOW_MS = 6 * 60 * 60 * 1000;   // 시작 후 6시간 넘은 녹화엔 더 못 쓴다
const MAX_PART_NUMBER = 10000;                 // R2 멀티파트 상한

// ─────────────────────────────────────────────────────────────────────────────
// 🛟 짧은 녹화 안전망 — «스냅샷» (2026-08-25)
//
//   [무엇이 문제였나] multipart 는 **비마지막 파트가 5MiB 이상**이어야 한다(R2 규칙).
//   그래서 녹화 첫 ~17초(2.5Mbps 기준) 동안은 조각이 **하나도** 서버에 없다. 그 사이에
//   탭이 닫히면 brower 는 abort 를 보내고 그걸로 끝 — 영상이 통째로 사라진다.
//   실측(2026-08-25 21:33~21:38): 13·17·3·1·2·27초짜리 녹화 6건이 전부 이 구간이었다.
//
//   [어떻게 막나] 조각이 아직 하나도 없는 동안, 브라우저가 들고 있는 버퍼 전체를
//   «통짜 파일»로 한 번씩 올려 둔다. MediaRecorder 의 첫 조각부터 이어붙인 바이트열이라
//   그 자체로 재생 가능한 webm 이다.
//
//   ⚠️ **진짜 키에 쓰지 않는다** — `<키>.snap` 이라는 옆자리에 쓴다.
//      진행 중인 multipart 와 같은 키에 put 하면 그 뒤 complete 가 어떻게 되는지가
//      R2 문서로 보장되지 않는다. 만약 complete 가 실패하면 upload/complete 의
//      «head() 로 실물이 있으면 성공» 자가복구가 **스냅샷(앞부분만)을 완성본으로 오인**해
//      모든 녹화가 조용히 잘린다. 그 위험을 아예 만들지 않는다.
//   ✅ 대신 «되살리기» 는 multipart 가 확실히 끝난 뒤에만 한다 — abort 순간(탭 닫힘)과
//      크론 스윕 두 곳에서 `<키>.snap` → `<키>` 로 옮긴다(promoteSnapshot).
//   ✅ 정상 마무리(complete 성공) 때는 쓸모없어졌으므로 지운다(dropSnapshot).
// ─────────────────────────────────────────────────────────────────────────────
const SNAPSHOT_SUFFIX = '.snap';
const SNAPSHOT_MAX_BYTES = 8 * 1024 * 1024;   // 버퍼는 5MiB + 조각 하나를 넘지 않는다

/** `<key>.snap` 이 있으면 진짜 키로 옮기고 그 크기를 돌려준다. 없으면 0. */
async function promoteSnapshot(env: Env, key: string): Promise<number> {
  try {
    const existing = await env.RECORDINGS.head(key);
    if (existing?.size) return existing.size;
    const snap = await env.RECORDINGS.get(key + SNAPSHOT_SUFFIX);
    if (!snap) return 0;
    const buf = await snap.arrayBuffer();
    if (!buf || buf.byteLength === 0) { await dropSnapshot(env, key); return 0; }
    // A normal completion wins; a short snapshot must never overwrite it.
    const put = await env.RECORDINGS.put(key, buf, {
      httpMetadata: { contentType: 'video/webm' },
      customMetadata: { recoveredFrom: 'snapshot' },
      onlyIf: new Headers({ 'If-None-Match': '*' }),
    });
    if (!put) {
      const winner = await env.RECORDINGS.head(key);
      if (!winner?.size) throw new Error('snapshot promotion not confirmed');
      return winner.size;
    }
    await dropSnapshot(env, key);
    console.log(`[recordings-r2] 스냅샷 되살림 key=${key} size=${buf.byteLength}`);
    return buf.byteLength;
  } catch (e: any) {
    console.error(`[recordings-r2] 스냅샷 되살리기 실패 key=${key}: ${e?.message || e}`);
    throw e; // a storage error must defer recovery, not classify the recording as empty
  }
}

/** 스냅샷 정리 — 실패해도 본 흐름에 영향 없음 */
async function dropSnapshot(env: Env, key: string): Promise<void> {
  try { await env.RECORDINGS.delete(key + SNAPSHOT_SUFFIX); } catch { /* best-effort */ }
}

/** 이 키가 «지금 녹화 중인» 행의 것인지 확인. 아니면 null */
async function assertUploadable(env: Env, key: string): Promise<{ id: number } | null> {
  if (!key || !key.startsWith('rec/')) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT id, started_at, status FROM recordings WHERE file_url = ? LIMIT 1`
    ).bind(key).first<{ id: number; started_at: number | null; status: string | null }>();
    if (!row || row.status !== 'recording') return null;
    if (!row.started_at || Date.now() - row.started_at > UPLOAD_WINDOW_MS) return null;
    return { id: row.id };
  } catch {
    return null;   // 조회 자체가 실패하면 열어주지 않는다
  }
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

    // 🔐 실재하고 «지금 녹화 중인» 행에만 업로드 통로를 연다.
    //   예전엔 존재하지 않는 recording_id 로도 multipart 가 생성돼, 아무나 R2 에 쌓을 수 있었다.
    const own = await env.DB.prepare(
      `SELECT id, started_at, status, file_url FROM recordings WHERE id = ?`
    ).bind(b.recording_id).first<{ id: number; started_at: number | null; status: string | null; file_url: string | null }>();
    if (!own || own.status !== 'recording' ||
        !own.started_at || Date.now() - own.started_at > UPLOAD_WINDOW_MS) {
      console.error(`[recordings-r2] create 거부 recording_id=${b.recording_id} status=${own?.status ?? '없음'}`);
      return J({ ok: false, error: "not recording" }, 404);
    }

    /* 🔐 2026-08-07 검토 추가 — create 는 recording_id 당 «한 번만».
       위 가드가 요구하는 «status='recording' + 6시간 이내» 는 **진행 중인 녹화가 정확히 만족하는 조건**이다.
       recording_id 는 순번이라 추측도 쉽다. 그래서 이 가드만으로는 아래 UPDATE 가 여전히
       «남이 지금 쓰고 있는 file_url» 을 덮어쓸 수 있다.

       그게 왜 치명적이냐 — 이 PR 이 part/complete 를 file_url 일치에 묶었기 때문이다.
       file_url 이 바뀌는 순간 강사가 올리던 파트는 assertUploadable() 을 통과하지 못해
       **그 시점부터 전부 404 → 그 수업 녹화가 통째로 사라진다.**
       (이 PR 이전에는 part/complete 가 file_url 을 안 봐서 같은 조작이 거의 무해했다.
        즉 이 한 줄이 없으면 이 PR 이 «남의 진행 중 녹화를 끄는 스위치» 를 새로 만드는 셈이다.)

       정상 흐름은 안 깨진다 — create 를 부르는 곳은 두 군데(mango-rec.js:893, video-call/js/recorder.js:114)
       뿐이고 둘 다 /start 직후 **한 번만** 부른다(재시도 루프 없음). 실패하면 로컬 녹화로 내려간다.
       새로고침하면 /start 부터 다시 하므로 새 id 가 나온다. */
    if (own.file_url) {
      console.error(`[recordings-r2] create 재요청 거부 recording_id=${b.recording_id} 기존키=${own.file_url}`);
      return J({ ok: false, error: "already opened" }, 409);
    }

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
    if (partNumber < 1 || partNumber > MAX_PART_NUMBER) return J({ error: "bad part number" }, 400);

    // 🔐 이 키가 «지금 녹화 중인» 수업의 것인지 확인 — 임의 경로에 쓰는 것을 막는다
    const owner = await assertUploadable(env, key);
    if (!owner) {
      console.error(`[recordings-r2] part 거부 key=${key} part=${partNumber}`);
      return J({ ok: false, error: "not recording" }, 404);
    }

    const mp = env.RECORDINGS.resumeMultipartUpload(key, uploadId);
    const part = await mp.uploadPart(partNumber, request.body as ReadableStream);

    // 📒 장부 적재 — 브라우저가 죽어도 서버가 마무리할 수 있게 (best-effort).
    //    장부 쓰기가 실패해도 파트 업로드 자체는 성공이므로 응답은 그대로 200.
    try {
      const rid = owner.id;   // 🔐 클라이언트가 준 rid 말고 «DB 가 인정한» 주인으로 적는다
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

  // 2-b) 스냅샷 — 아직 조각이 하나도 없는 «첫 5MiB» 구간의 안전망 (2026-08-25)
  //      브라우저가 들고 있는 버퍼 전체를 `<키>.snap` 에 통째로 덮어쓴다.
  //      ⛔ 진짜 키에는 절대 쓰지 않는다(위 SNAPSHOT_SUFFIX 주석 참고).
  if (path === "/api/recordings/upload/snapshot" && method === "PUT") {
    const key = url.searchParams.get("key") || "";
    // 🔐 part 와 «똑같은» 관문 — 실재하고 지금 녹화 중인 행의 키에만 쓸 수 있다
    const owner = await assertUploadable(env, key);
    if (!owner) {
      console.error(`[recordings-r2] snapshot 거부 key=${key}`);
      return J({ ok: false, error: "not recording" }, 404);
    }
    const len = parseInt(request.headers.get("content-length") || "", 10);
    if (Number.isFinite(len) && len > SNAPSHOT_MAX_BYTES) return J({ ok: false, error: "too large" }, 413);
    const buf = await request.arrayBuffer();
    if (!buf || buf.byteLength === 0) return J({ ok: false, error: "empty" }, 400);
    if (buf.byteLength > SNAPSHOT_MAX_BYTES) return J({ ok: false, error: "too large" }, 413);
    await env.RECORDINGS.put(key + SNAPSHOT_SUFFIX, buf, {
      httpMetadata: { contentType: "video/webm" },
      customMetadata: { recordingId: String(owner.id), snapshot: "1" },
    });
    // ⚠️ status 는 건드리지 않는다 — 마무리는 여전히 complete 의 몫이다.
    //   size_bytes 만 적어 두면 «빈 껍데기 정리»(size_bytes IS NULL) 가 이 행을 안 지운다.
    try {
      await env.DB.prepare(
        `UPDATE recordings SET size_bytes = ? WHERE id = ? AND status = 'recording'`
      ).bind(buf.byteLength, owner.id).run();
    } catch { /* 관측용이라 실패해도 업로드는 성공 */ }
    return J({ ok: true, size: buf.byteLength });
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
      `SELECT status, file_url FROM recordings WHERE id = ?`
    ).bind(b.recording_id).first<{ status: string | null; file_url: string | null }>();
    // 🔐 키가 그 녹화의 것인지 확인 — 남의 키를 마무리하거나 임의 경로를 조작하는 것을 막는다
    if (!existing || existing.file_url !== b.key) {
      console.error(`[recordings-r2] complete 거부 recording_id=${b.recording_id} key=${b.key}`);
      return J({ ok: false, error: "key mismatch" }, 404);
    }
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
    if (head && head.customMetadata?.recoveredFrom !== 'snapshot') {
      failReason = "";                                  // 실물이 있다 = 업로드는 성공한 것
      if (!obj) obj = { size: head.size };
    } else if (!failReason) {
      failReason = "head() 재확인 실패 — 완료 응답은 왔지만 객체가 없음";
    }

    if (failReason) {
      console.error(`[recordings-r2] upload/complete 실패 recording_id=${b.recording_id} key=${b.key}: ${failReason}`);
      /* 🔴 (2026-09-02) 예전엔 여기서 status·storage «만» 적었다. 그래서 실패한 녹화는
         ended_at 이 비고 duration_ms 가 0 으로 남았다 — D1 실측 73건 중 «전부» 가 그랬다.
         두 가지가 함께 망가진다:
         ① 관리자 화면이 «몇 분짜리 수업을 잃었는지» 를 말할 수 없다(잃은 크기를 모른다).
         ② duration_ms 가 0 이면 나중에 도착하는 /api/recordings/stop 의 nothingRecorded
            판정이 «없던 일(aborted)» 쪽으로 기울고, 목록은 «aborted + size 0» 을 통째로
            감추므로 **진짜 잃어버린 수업이 «정상 정리분» 에 파묻힌다.**
            (CLAUDE.md 2장 「정상 정리분 66% 에 진짜 저장 실패 76건이 파묻혔다」와 같은 뿌리)
         → 실패해도 «무엇을 얼마나 잃었는지» 는 남긴다. 상태만 실패로 둔다.
         ⚠️ 값을 «덮어쓰지» 않는다(COALESCE·MAX) — 이 경로는 beforeunload 비콘으로도 오고
            늦게 도착한 중복 요청이 이미 적힌 값을 0 으로 지우면 안 된다. */
      let recoverable = true;
      try {
        const part = await env.DB.prepare(`SELECT 1 AS n FROM recording_parts WHERE recording_id = ? LIMIT 1`)
          .bind(b.recording_id).first();
        recoverable = !!part || !!(await env.RECORDINGS.head(b.key + SNAPSHOT_SUFFIX));
      } catch { /* retain eligibility when evidence cannot be read */ }
      await env.DB.prepare(
        `UPDATE recordings
            SET status = ?, storage = ?,
                ended_at    = COALESCE(ended_at, ?),
                duration_ms = MAX(COALESCE(duration_ms, 0), ?),
                size_bytes  = MAX(COALESCE(size_bytes, 0), ?)
          WHERE id = ? AND status NOT IN ('completed','deleted')`
      ).bind(recoverable ? 'recording' : 'upload_failed', recoverable ? 'r2' : 'r2_failed',
             now, Math.max(0, Number(b.duration_ms) || 0), Math.max(0, Number(b.size_bytes) || 0), b.recording_id).run();
      // Keep the snapshot and multipart ledger for scheduled retry.
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
    await dropSnapshot(env, b.key);          // 완성본이 생겼으니 스냅샷은 쓸모없다
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
    // 🔐 키가 그 녹화의 것인지 확인 — 남의 녹화를 임의로 'aborted' 로 만드는 것을 막는다
    const abRow = await env.DB.prepare(
      `SELECT file_url, status FROM recordings WHERE id = ?`
    ).bind(b.recording_id).first<{ file_url: string | null; status: string | null }>();
    if (!abRow || abRow.file_url !== b.key) {
      console.error(`[recordings-r2] abort 거부 recording_id=${b.recording_id} key=${b.key}`);
      return J({ ok: false, error: "key mismatch" }, 404);
    }
    try {
      const mp = env.RECORDINGS.resumeMultipartUpload(b.key, b.upload_id);
      await mp.abort();
    } catch (_) {}

    // 🛟 스냅샷 되살리기 (2026-08-25) — abort 가 오는 대표적인 경우가 «조각이 하나도 없는데
    //   탭이 닫힘» 이다. 예전엔 여기서 녹화가 통째로 사라졌다. multipart 는 방금 확실히
    //   끝났으므로 이제 진짜 키에 써도 안전하다.
    const snapSize = await promoteSnapshot(env, b.key);
    if (snapSize > 0) {
      const nowMs = Date.now();
      const recoveredObject = await env.RECORDINGS.head(b.key);
      const partial = recoveredObject?.customMetadata?.recoveredFrom === 'snapshot';
      const st = await env.DB.prepare(`SELECT started_at FROM recordings WHERE id = ?`)
        .bind(b.recording_id).first<{ started_at: number | null }>();
      const startedAt = Number(st?.started_at) || nowMs;
      await env.DB.prepare(
        `UPDATE recordings
            SET ended_at = COALESCE(ended_at, ?), duration_ms = ?, size_bytes = ?,
                status = 'completed', storage = ?
          WHERE id = ? AND status NOT IN ('completed','deleted')`
      ).bind(nowMs, partial ? null : Math.max(0, nowMs - startedAt), snapSize,
             partial ? 'r2_snapshot' : 'r2', b.recording_id).run();
      await clearParts(env, b.recording_id);
      return J({ ok: true, recovered: 'snapshot', size: snapSize });
    }

    // 이미 완료·삭제된 행은 되돌리지 않는다
    await env.DB.prepare(
      `UPDATE recordings SET status = 'aborted' WHERE id = ? AND status NOT IN ('completed','deleted')`
    ).bind(b.recording_id)
      .run();
    await clearParts(env, b.recording_id);   // 중단됐으니 크론이 되살리지 않도록 장부를 비운다
    return J({ ok: true });
  }

  // 5) 재생용 서명된 URL — admin 대시보드에서 사용
  //    R2 퍼블릭 버킷이 아니므로 Worker가 프록시. Range 요청도 통과시켜야 seek 가능.
  if (path.startsWith("/api/recordings/stream/") && method === "GET") {
    const id = parseInt(path.replace("/api/recordings/stream/", ""), 10);
    const row = await env.DB.prepare(
      `SELECT file_url, status FROM recordings WHERE id = ? AND storage IN ('r2','r2_snapshot')`
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

  // 6) 🔐 통합 재생 — GET /api/recording/play?id={녹화 DB id}[&token=mango_token][&dl=1]
  //    관리자 세션(쿠키) 또는 본인 참여 녹화(mango_token uid ∈ participant_ids)만 재생.
  //    파일명·경로를 클라이언트가 지정하는 방식은 경로조작/IDOR 통로라 금지 — DB id 로만 조회.
  //
  //    ⬇ dl=1 (2026-08-07) — «내 PC·휴대폰에 저장». 재생만 되고 가져갈 수가 없었다.
  //      크롬 기본 ⋮ 메뉴에 기대고 있었는데 그건 (1) 모바일엔 아예 없고 (2) URL 에 파일명이
  //      없어 'play' 로 떨어진다. 녹화는 expires_at 이 지나면 크론이 지우므로, 보관기간 안에
  //      직접 받아둘 통로가 필요하다. **인증·소유권 판정은 재생과 100% 동일**하고
  //      Content-Disposition 과 파일명만 달라진다(권한이 느슨해지는 지점이 없음).
  if (path === "/api/recording/play" && method === "GET") {
    const id = parseInt(url.searchParams.get("id") || "", 10);
    if (!Number.isFinite(id) || id <= 0) return J({ ok: false, error: "id required" }, 400);

    // 인증을 먼저 통과해야 레코드 존재 여부조차 알 수 없게 한다(열거 차단)
    // 📼 &sig= (2026-08-13, «휴대폰 저장 안 됨») — 교사·관리자는 쿠키로만 인증되는데,
    //   카톡 인앱 브라우저·안드로이드 WebView 는 ⬇저장을 쿠키 없는 다운로드 관리자에
    //   위임한다 → 여기서 401 로 조용히 실패했다. 목록 API(/api/student/recordings)가
    //   자기 인증을 통과한 뒤 동봉해 주는 «이 녹화 id 1건 전용» 단기 서명을 제3의 인증
    //   경로로 인정한다. 범위가 id 하나뿐이라 소유권 재검증은 발급 시점에 끝난 셈이다.
    const sess = await checkAdminSession(request, env as any);
    let uid: string | null = null;
    let sigOk = false;
    if (!sess.ok) {
      uid = await authUidFromRequest(request, url, env);
      if (!uid) {
        sigOk = await verifyRecDlSig(id, url.searchParams.get("sig") || "", env);
        if (!sigOk) return J({ ok: false, error: "unauthorized" }, 401);
      }
    }

    const row = await env.DB.prepare(
      `SELECT file_url, status, storage, filename, participant_ids, participant_names,
              teacher_id, teacher_name, expires_at, room_id, started_at
         FROM recordings WHERE id = ?`
    ).bind(id).first<{
      file_url: string | null; status: string | null; storage: string | null;
      filename: string | null; participant_ids: string | null; participant_names: string | null;
      teacher_id: string | null; teacher_name: string | null; expires_at: number | null;
      room_id: string | null; started_at: number | null;
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
    // (sig 인증은 발급 자체가 녹화 1건에 못박혀 있어 이 소유권 대조를 거치지 않는다)
    if (!sess.ok && !sigOk) {
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

    // 📱 dl=1(저장)은 Range 를 **무시하고 항상 200 전체 본문**으로 준다 (2026-08-15).
    //   갤럭시 일부 기기(다운로드 가속 등)가 저장 요청에 Range: bytes=0- 를 끼워 넣는데,
    //   규칙대로 206 을 돌려주면 안드로이드 다운로드 클라이언트가 «비정상 응답»으로
    //   실패한다 — 시스템 DownloadManager 는 사유 없이 «다운로드에 실패했습니다»만
    //   반복했고, 앱 v2.2 의 자체 다운로드가 «서버 응답 206» 을 찍어 준 덕에 잡았다.
    //   저장은 이어받기(seek)가 필요 없으므로 전체 본문이 항상 옳다. 재생(dl 없음)은
    //   <video> seek 를 위해 지금처럼 Range 를 그대로 존중한다.
    const wantDl = url.searchParams.get("dl") === "1";
    const obj2 = await env.RECORDINGS.get(r2Key, (() => {
      const range = wantDl ? null : request.headers.get("Range");
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
    const isMp4 = /\.mp4(\?|$)/i.test(name);
    const ctype = isMp4 ? "video/mp4" : "video/webm";
    const headers = new Headers();
    headers.set("Content-Type", ctype);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, max-age=600");
    // ⬇ 저장 요청이면 첨부파일로 — 브라우저가 '재생' 대신 '다운로드'로 처리한다.
    //   파일명은 사람이 알아볼 수 있게 «mangoi-날짜-방번호.확장자» 로 만든다
    //   (URL 이 /play?id=.. 라 그냥 받으면 확장자 없는 'play' 로 저장됐다).
    //   한글·공백이 섞이면 헤더가 깨지므로 ASCII 로만 조립한다.
    if (wantDl) {
      const dt = row.started_at ? new Date(row.started_at) : null;
      const ymd = dt
        ? `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, "0")}${String(dt.getDate()).padStart(2, "0")}`
        : String(id);
      const roomSafe = String(row.room_id || "class").replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 40);
      const dlName = `mangoi-${ymd}-${roomSafe}.${isMp4 ? "mp4" : "webm"}`;
      headers.set("Content-Disposition", `attachment; filename="${dlName}"`);
    }
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
const STOP_QUIET_MS = 5 * 60 * 1000; // explicit end + five quiet minutes
const MAX_PER_RUN = 10;
// 조각이 하나도 없이 오래 남은 'recording' = 빈 껍데기(데이터가 어디에도 없음).
// 학생 목록에 ⏳준비중 으로 영원히 뜨므로 'aborted' 로 정리한다.
const EMPTY_AGE_MS = MIN_AGE_MS;

export async function runRecordingFinalizeSweep(
  env: Env,
  opts?: { minAgeMs?: number; quietMs?: number; limit?: number }
): Promise<{ ok: boolean; scanned: number; finalized: number; failed: number; emptied: number; details: any[] }> {
  // 🔎 2026-08-05: 이 스윕이 «돌긴 도는데 아무 일도 안 일어나는» 상태를 진단할 수단이 없었다.
  //   크론 로그는 조건부 출력이라 조용하면 «정상적으로 할 일이 없었다» 와 «조용히 죽었다» 가
  //   구분되지 않는다. → 매 실행 결과를 KV 에 한 줄 남긴다(기존 recordings-cleanup:last_run 과 같은 방식).
  const out = {
    ok: true, scanned: 0, finalized: 0, failed: 0, emptied: 0,
    stage: 'start' as string, error: null as string | null, details: [] as any[],
  };
  const beat = async () => {
    try {
      await env.SESSION_STATE?.put?.('recording_finalize:last_run',
        JSON.stringify({ at: new Date().toISOString(), ...out, details: undefined }));
    } catch { /* 관측용이라 실패해도 무시 */ }
  };

  try {
    const kill = await env.SESSION_STATE?.get?.("recording_finalize");
    if (kill === "off") { out.stage = 'killswitch-off'; await beat(); return { ...out, ok: true }; }
  } catch { /* KV 못 읽어도 계속 */ }

  const now = Date.now();
  const limit = opts?.limit ?? MAX_PER_RUN;
  const ageCut = now - (opts?.minAgeMs ?? MIN_AGE_MS);
  const quietCut = now - (opts?.quietMs ?? QUIET_MS);
  const stopCut = now - STOP_QUIET_MS;

  let cands: any[] = [];
  try {
    const rs = await env.DB.prepare(
      `SELECT p.recording_id AS rid, p.r2_key AS r2key, p.upload_id AS uid,
              COUNT(*) AS n, MAX(p.created_at) AS last_at, SUM(p.size_bytes) AS total,
              r.started_at AS started_at, r.ended_at AS ended_at
         FROM recording_parts p
         JOIN recordings r ON r.id = p.recording_id
        WHERE r.status = 'recording'
          AND r.started_at IS NOT NULL AND r.started_at < ?
          AND (r.started_at < ? OR (r.ended_at >= r.started_at AND r.ended_at < ?))
        GROUP BY p.recording_id, p.r2_key, p.upload_id
       HAVING MAX(p.created_at) < CASE WHEN r.ended_at >= r.started_at AND r.ended_at < ? THEN ? ELSE ? END
        ORDER BY MAX(p.created_at) ASC
        LIMIT ?`
    ).bind(now, ageCut, stopCut, stopCut, stopCut, quietCut, limit).all();
    cands = (rs.results || []) as any[];
  } catch (e: any) {
    // 🔴 2026-08-05: 여기서 조용히 return 하는 바람에 **아래 빈 껍데기 정리까지 통째로 건너뛰고**
    //   있었다. 게다가 원인도 안 남아 «크론은 Ok 인데 아무 일도 안 일어남» 을 며칠 헤맬 뻔했다.
    //   → 후보 조회 실패는 «마무리만» 포기하고, 정리는 그대로 진행한다. 원인도 반드시 남긴다.
    out.error = '후보 조회 실패: ' + String(e?.message || e);
    console.error('[rec-finalize]', out.error);
    cands = [];
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
        const latest = await env.DB.prepare(`SELECT MAX(created_at) AS at FROM recording_parts WHERE recording_id = ?`)
          .bind(rid).first<{ at: number }>();
        const cutoff = c.ended_at >= c.started_at && c.ended_at < stopCut ? stopCut : quietCut;
        if (!latest || Number(latest.at) >= cutoff) continue;
        const current = await env.DB.prepare(`SELECT status FROM recordings WHERE id = ?`)
          .bind(rid).first<{ status: string }>();
        if (current?.status !== 'recording') continue;
        const mp = env.RECORDINGS.resumeMultipartUpload(String(c.r2key), String(c.uid));
        const obj = await mp.complete(parts);
        size = obj.size;
      } catch (e: any) {
        failReason = String(e?.message || e);
      }
      // 실패했어도 실물이 있으면 성공 (누군가 이미 마무리했을 수 있다)
      let head: R2Object | null = null;
      try { head = await env.RECORDINGS.head(String(c.r2key)); } catch { head = null; }
      if (head && head.customMetadata?.recoveredFrom !== 'snapshot') { failReason = ""; size = size || head.size; }

      if (failReason) {
        out.failed++;
        out.details.push({ rid, ok: false, parts: parts.length, error: failReason });
        console.error(`[rec-finalize] 실패 id=${rid} key=${c.r2key} parts=${parts.length}: ${failReason}`);
        // Retain the ledger: a transient error is not proof of data loss.
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

  // No multipart ledger: repair a real object, recover a quiet snapshot, or settle an empty row.
  try {
    const rs = await env.DB.prepare(
      `SELECT id, file_url, started_at, ended_at, size_bytes, duration_ms FROM recordings
        WHERE status = 'recording' AND started_at IS NOT NULL AND started_at < ?
          AND (started_at < ? OR (ended_at >= started_at AND ended_at < ?))
          AND id NOT IN (SELECT DISTINCT recording_id FROM recording_parts)
        ORDER BY started_at ASC LIMIT ?`
    ).bind(now, now - EMPTY_AGE_MS, stopCut, limit).all();
    for (const r of ((rs.results || []) as any[])) {
      try {
        const key = String(r.file_url || '');
        if (key && !key.startsWith('rec/')) continue; // do not reinterpret legacy/debug keys
        const cutoff = r.ended_at >= r.started_at && r.ended_at < stopCut ? stopCut : quietCut;
        let size = 0;
        let fromSnapshot = false;
        if (key) {
          const real = await env.RECORDINGS.head(key);
          size = real?.size || 0;
          fromSnapshot = real?.customMetadata?.recoveredFrom === 'snapshot';
          if (!size) {
            const snap = await env.RECORDINGS.head(key + SNAPSHOT_SUFFIX);
            if (snap?.size) {
              const uploaded = new Date(snap.uploaded).getTime();
              if (!Number.isFinite(uploaded) || uploaded >= cutoff) continue;
              const part = await env.DB.prepare(`SELECT 1 AS n FROM recording_parts WHERE recording_id = ? LIMIT 1`)
                .bind(r.id).first();
              if (part) continue;
              size = await promoteSnapshot(env, key);
              const recovered = await env.RECORDINGS.head(key);
              fromSnapshot = recovered?.customMetadata?.recoveredFrom === 'snapshot';
            }
          }
        }
        const nextStatus = size > 0 ? 'completed'
          : (Number(r.size_bytes) > 0 || Number(r.duration_ms) > 0 ? 'upload_failed' : 'aborted');
        const update = await env.DB.prepare(
          `UPDATE recordings SET status = ?, ended_at = COALESCE(ended_at, ?),
              size_bytes = CASE WHEN ? > 0 THEN ? ELSE size_bytes END,
              duration_ms = CASE WHEN ? THEN NULL ELSE duration_ms END,
              storage = CASE WHEN ? > 0 THEN ? ELSE storage END
            WHERE id = ? AND status = 'recording' AND file_url IS ? AND ended_at IS ?
              AND id NOT IN (SELECT DISTINCT recording_id FROM recording_parts)`
        ).bind(nextStatus, now, size, size, fromSnapshot ? 1 : 0, size,
               fromSnapshot ? 'r2_snapshot' : 'r2', r.id, r.file_url, r.ended_at).run();
        if (!update.meta?.changes) continue;
        if (size > 0) out.finalized++;
        else if (nextStatus === 'aborted') out.emptied++;
        else out.failed++;
        out.details.push({ rid: Number(r.id), ok: size > 0, status: nextStatus, snapshot: fromSnapshot, size });
      } catch (e: any) {
        out.failed++;
        out.details.push({ rid: Number(r.id), ok: false, deferred: true, error: String(e?.message || e) });
      }
    }
  } catch (e: any) {
    out.error = (out.error ? out.error + ' / ' : '') + '미완료 녹화 복구 조회 실패: ' + String(e?.message || e);
    console.error('[rec-finalize]', out.error);
  }

  out.stage = 'done';
  await beat();
  return out;
}
