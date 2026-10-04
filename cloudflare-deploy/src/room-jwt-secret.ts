/** Shared signing configuration for UID tokens, tickets and room access.
 * Missing, blank or non-string bindings must never become a signing key.
 * Preserve configured bytes exactly: trimming a real key would invalidate tokens.
 */
export function requireRoomJwtSecret(env: { ROOM_JWT_SECRET?: unknown } | null | undefined): string {
  const secret = env?.ROOM_JWT_SECRET;
  if (typeof secret !== 'string' || !secret.trim()) {
    throw new Error('room_jwt_secret_not_configured');
  }
  return secret;
}
