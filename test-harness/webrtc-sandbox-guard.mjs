// Impairment tests must be explicitly enabled and stay on a literal loopback
// origin. A hostname containing "test" is not proof of a sandbox deployment.
export function requireWebrtcSandbox(env = process.env) {
  if (env.MANGOI_WEBRTC_SANDBOX !== '1') throw new Error('Set MANGOI_WEBRTC_SANDBOX=1 for an explicitly isolated WebRTC fixture.');
  if (!env.BASE_URL) throw new Error('BASE_URL is required; no public or production target is assumed.');
  let url;
  try { url = new URL(env.BASE_URL); } catch { throw new Error('BASE_URL must be a valid loopback origin.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('WebRTC impairment is restricted to an uncredentialed literal loopback origin; production and remote targets are forbidden.');
  }
  if (!['HOME', 'OFFICE'].includes(env.TEACHER_PROFILE)) throw new Error('TEACHER_PROFILE must be HOME or OFFICE; keep their synthetic results separate.');
  return { origin: url.origin, teacherProfile: env.TEACHER_PROFILE };
}
