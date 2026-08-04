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

    // (a) 이미 처리된 recording_id면 R2를 다시 건드리지 않고 그대로 확인 응답
    const existing = await env.DB.prepare(
      `SELECT status FROM recordings WHERE id = ?`
    ).bind(b.recording_id).first<{ status: string | null }>();
    if (existing && (existing.status === "completed" || existing.status === "upload_failed")) {
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

    // (c) complete()가 성공했다고 보고해도 실제로 R2에 안착했는지 재확인
    if (obj && !failReason) {
      try {
        const head = await env.RECORDINGS.head(b.key);
        if (!head) failReason = "head() 재확인 실패 — 완료 응답은 왔지만 객체가 없음";
      } catch (e: any) {
        failReason = "head() 에러: " + (e?.message || e);
      }
    }

    if (failReason) {
      console.error(`[recordings-r2] upload/complete 실패 recording_id=${b.recording_id} key=${b.key}: ${failReason}`);
      await env.DB.prepare(
        `UPDATE recordings SET status = 'upload_failed', storage = 'r2_failed' WHERE id = ?`
      ).bind(b.recording_id).run();
      return J({ ok: false, error: failReason }, 500);
    }

    await env.DB.prepare(
      `UPDATE recordings
       SET ended_at = ?, duration_ms = ?, size_bytes = ?, status = 'completed', file_url = ?
       WHERE id = ?`
    )
      .bind(now, b.duration_ms || 0, b.size_bytes || obj!.size || 0, b.key, b.recording_id)
      .run();
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
