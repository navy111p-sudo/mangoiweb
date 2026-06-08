// ============================================================
// CloudPlayer TURN 중계 서버 - Worker 진입점
// ============================================================

import type { Env } from "./types";

export { RelayRoom } from "./room";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return corsResponse(new Response(null, { status: 204 }));
    }

    try {
      if (url.pathname === "/ws") {
        return handleWebSocket(request, env, url);
      }
      if (url.pathname.startsWith("/api/")) {
        const res = await handleApi(request, env, url);
        return corsResponse(res);
      }
      return new Response("Not Found", { status: 404 });
    } catch (err) {
      console.error("요청 처리 오류:", err);
      return corsResponse(
        Response.json(
          { error: "INTERNAL_ERROR", message: String(err) },
          { status: 500 }
        )
      );
    }
  },
};

function handleWebSocket(request: Request, env: Env, url: URL): Promise<Response> {
  const roomId = url.searchParams.get("roomId") || "default";
  const doId = env.RELAY_ROOM.idFromName(roomId);
  const stub = env.RELAY_ROOM.get(doId);
  const doUrl = new URL(request.url);
  doUrl.searchParams.set("roomId", roomId);
  const doRequest = new Request(doUrl.toString(), request);
  return stub.fetch(doRequest);
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === "/api/health") {
    return Response.json({
      status: "ok",
      timestamp: Date.now(),
      version: "1.0.0",
    });
  }

  const roomInfoMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/info$/);
  if (roomInfoMatch && request.method === "GET") {
    const roomId = decodeURIComponent(roomInfoMatch[1]);
    const doId = env.RELAY_ROOM.idFromName(roomId);
    const stub = env.RELAY_ROOM.get(doId);
    return stub.fetch(new Request(`${url.origin}/info`));
  }

  const roomCloseMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/close$/);
  if (roomCloseMatch && request.method === "POST") {
    const roomId = decodeURIComponent(roomCloseMatch[1]);
    const doId = env.RELAY_ROOM.idFromName(roomId);
    const stub = env.RELAY_ROOM.get(doId);
    return stub.fetch(new Request(`${url.origin}/close`, { method: "POST" }));
  }

  return Response.json({ error: "NOT_FOUND" }, { status: 404 });
}

function corsResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
