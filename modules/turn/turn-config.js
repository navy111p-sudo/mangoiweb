/**
 * turn-config.js — 서버측 ICE/TURN 설정 빌더
 * ------------------------------------------------------------------
 * 브라우저에 TURN 비밀키를 노출하지 않기 위해, 서버가 Cloudflare TURN API 를
 * 호출해 "단기(임시) 자격증명"을 발급받아 클라이언트에 내려준다.
 *
 *   - 환경변수 TURN_KEY_ID / TURN_KEY_API_TOKEN 이 있으면 → Cloudflare 동적 발급
 *   - 없거나 호출 실패 → 정적 폴백(STUN + 공개 TURN)으로 안전하게 동작(개발용)
 *
 * 순수 로직(fetch 주입 가능)이라 테스트 하네스에서 검증 가능.
 * ------------------------------------------------------------------
 */
'use strict';

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

// 개발/테스트용 공개 TURN (운영에서는 Cloudflare 동적 발급으로 대체)
const PUBLIC_TURN = [
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

function fallbackConfig(reason) {
  return { source: 'fallback', reason: reason || null, iceServers: STUN_SERVERS.concat(PUBLIC_TURN) };
}

// Cloudflare 응답의 iceServers 를 항상 "배열"로 정규화한다.
// (문서상 단일 객체 {urls,username,credential} 또는 배열로 올 수 있음)
function normalizeCfIceServers(json) {
  if (!json) return [];
  const ice = json.iceServers;
  if (Array.isArray(ice)) return ice;
  if (ice && typeof ice === 'object') return [ice];
  return [];
}

// env: process.env 형태, fetchImpl: 주입형 fetch(테스트용)
async function buildTurnConfig(env, fetchImpl) {
  env = env || {};
  const keyId = env.TURN_KEY_ID;
  const apiToken = env.TURN_KEY_API_TOKEN;
  const ttl = Number(env.TURN_TTL || 86400);

  // 자격증명 미설정 → 폴백 (개발 환경)
  if (!keyId || !apiToken) return fallbackConfig('TURN_KEY_ID/API_TOKEN 미설정');

  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!f) return fallbackConfig('fetch 사용 불가');

  try {
    const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`;
    const res = await f(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl }),
    });
    if (!res || !res.ok) throw new Error('Cloudflare TURN 응답 오류: ' + (res && res.status));
    const json = await res.json();
    const turn = normalizeCfIceServers(json);
    if (!turn.length) throw new Error('Cloudflare 응답에 iceServers 없음');
    // STUN(직접 연결 우선) + Cloudflare TURN(릴레이 폴백)
    return { source: 'cloudflare', iceServers: STUN_SERVERS.concat(turn) };
  } catch (err) {
    // 운영 중 일시 장애가 나도 통화가 죽지 않도록 폴백
    return fallbackConfig('Cloudflare 호출 실패: ' + String(err && err.message || err));
  }
}

module.exports = { buildTurnConfig, normalizeCfIceServers, fallbackConfig, STUN_SERVERS };
