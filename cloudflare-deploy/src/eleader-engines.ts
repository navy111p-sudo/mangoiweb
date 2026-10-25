/** Internal adapters only: no public URL proxy and no configurable client endpoint. */
export interface EleaderEngines {
  chat(request: Request): Promise<Response | null>;
  voice(request: Request): Promise<Response | null>;
}
/** Existing engines are reused without their D1/KV/history/R2 persistence or personalization. */
export function ephemeralEleaderEnv<T>(env: T): T {
  return { ...env, DB: undefined, SESSION_STATE: undefined, RECORDINGS: undefined,
    NEO4J_QUERY_URL: undefined, NEO4J_USER: undefined, NEO4J_PASSWORD: undefined,
    AZURE_SPEECH_KEY: undefined, AZURE_SPEECH_REGION: undefined };
}
