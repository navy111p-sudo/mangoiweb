/** Shared admin response cache. Cache failure remains a miss, never a request failure. */
// ═══ ⚡ 관리자 KV 캐시 공용 헬퍼 (2026-07-19 통합) ═══
//   graph-list·finance·selfscore·leveltest 등에서 반복되던
//   "get→hit면 Response 반환 / put 후 Response 반환" 보일러플레이트를 한 곳으로.
//   실패는 조용히 무시(캐시는 최적화일 뿐 정확성 아님). 본사 권한게이트 뒤라 조직공용.
export async function admCacheHit(env: any, key: string): Promise<Response | null> {
  try {
    const h = await env.SESSION_STATE.get(key);
    if (h) return new Response(h, { status: 200, headers: { 'Content-Type': 'application/json', 'X-Adm-Cache': 'hit' } });
  } catch { /* miss */ }
  return null;
}

export async function admCachePut(env: any, key: string, obj: any, ttl = 120): Promise<Response> {
  const body = JSON.stringify(obj);
  try { await env.SESSION_STATE.put(key, body, { expirationTtl: ttl }); } catch { /* 저장 실패 무시 */ }
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
}
