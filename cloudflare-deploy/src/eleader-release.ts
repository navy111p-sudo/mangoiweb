/** Staged release: no environment variable, cookie or consent can activate this API.
 * Remove only in a separately reviewed activation release after acceptance/privacy checks.
 */
export function eleaderStagedResponse(request: Request): Response | null {
  const path = new URL(request.url).pathname;
  if (path !== '/api/ai/eleader' && !path.startsWith('/api/ai/eleader/')) return null;
  return Response.json({error:'pilot_disabled',release:'staged-v5',voice_enabled:false}, {
    status:404, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},
  });
}
