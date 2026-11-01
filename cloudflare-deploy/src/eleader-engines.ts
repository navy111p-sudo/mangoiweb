/** Internal adapters only: no public URL proxy and no configurable client endpoint. */
export interface EleaderEngines {
  chat(request: Request): Promise<Response | null>;
  voice(request: Request): Promise<Response | null>;
  /** Level 1 기본과정 — 기록·히스토리가 있는 평소 웜업 엔진(eleader-l1.ts 가 주제·난이도를 서버에서 정한다). */
  warm?(request: Request): Promise<Response>;
}
/** Existing engines are reused without their D1/KV/history/R2 persistence or personalization. */
export function ephemeralEleaderEnv<T>(env: T): T {
  return { ...env, DB: undefined, SESSION_STATE: undefined, RECORDINGS: undefined,
    NEO4J_QUERY_URL: undefined, NEO4J_USER: undefined, NEO4J_PASSWORD: undefined,
    AZURE_SPEECH_KEY: undefined, AZURE_SPEECH_REGION: undefined };
}
