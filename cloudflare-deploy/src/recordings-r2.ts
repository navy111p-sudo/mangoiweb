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
    const mp = env.RECORDINGS.resumeMultipartUpload(b.key, b.upload_id);
    const obj = await mp.complete(b.parts);
    const now = Date.now();
    await env.DB.prepare(
      `UPDATE recordings
       SET ended_at = ?, duration_ms = ?, size_bytes = ?, status = 'completed', file_url = ?
       WHERE id = ?`
    )
      .bind(now, b.duration_ms || 0, b.size_bytes || obj.size || 0, b.key, b.recording_id)
      .run();
    return J({ ok: true, key: b.key, size: obj.size });
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
      `SELECT file_url, status, storage, filename, participant_ids, expires_at
         FROM recordings WHERE id = ?`
    ).bind(id).first<{
      file_url: string | null; status: string | null; storage: string | null;
      filename: string | null; participant_ids: string | null; expires_at: number | null;
    }>();
    if (!row || row.status === "deleted" || !row.file_url) return new Response("Not found", { status: 404 });
    if (row.expires_at && row.expires_at < Date.now()) return new Response("Not found", { status: 404 });

    // 학생은 본인이 참여한 녹화만 — 불일치도 404(존재 여부 오라클 방지)
    if (!sess.ok) {
      let participants: string[] = [];
      try { participants = JSON.parse(row.participant_ids || "[]"); } catch { participants = []; }
      if (!participants.map(String).includes(String(uid))) return new Response("Not found", { status: 404 });
    }

    const obj2 = await env.RECORDINGS.get(row.file_url, (() => {
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
