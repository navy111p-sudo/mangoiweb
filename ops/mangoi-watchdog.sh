#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
#  🛰  망고아이 장애감시 2층 (external watchdog) — 카페24 서버에서 5분마다 실행
#      MANGOi outage watchdog, layer 2 — runs on the Cafe24 box every 5 minutes
#
#  설치 위치 / install path : /root/mangoi-watchdog.sh
#  설정 파일 / config file  : /root/.mangoi-alert.env   (chmod 600, 이 파일에 키를 넣는다)
#  로그     / log           : /var/log/mangoi-watchdog.log
#  상태     / state         : /var/lib/mangoi-watchdog.state
#
#  ── 왜 2층이 필요한가 / why a second layer ─────────────────────────────────
#  1층은 Cloudflare Worker 안의 cron(*/15) 감시견이다. 그런데 그 감시견은
#  **자기 자신의 죽음을 못 잡는다.** 워커가 죽으면 cron 도 안 돌고 문자도 못 보낸다.
#  가장 심각한 장애일수록 더 조용해지는 구조였다.
#  (오랫동안 «UptimeRobot 이 그걸 커버한다» 고 적혀 있었지만, 2026-08-07 확인 결과
#   UptimeRobot 웹훅은 유료 전용이라 **애초에 만들어진 적이 없었다.** 감시는 한 겹뿐이었다.)
#
#  Layer 1 lives inside the Worker itself, so it cannot detect its own death.
#  This script watches from OUTSIDE Cloudflare and sends SMS WITHOUT touching the
#  Worker, so an alert still goes out when the Worker is completely gone.
#
#  ── 이 스크립트가 지키는 두 가지 원칙 ─────────────────────────────────────
#  ① 문자 경로가 워커를 거치지 않는다. 카페24 → SOLAPI 직접.
#     워커를 거치면 «워커가 죽었을 때 문자가 안 나가는» 원래 문제를 그대로 물려받는다.
#  ② 판정을 워커에 맡기지 않는다. 워커는 사실(db·cron 나이)만 돌려주고, 죽었는지는 여기서 정한다.
#
#  ── 오탐(거짓 경보) 방지 ──────────────────────────────────────────────────
#  · 연속 ${FAIL_THRESHOLD}회(=10분) 실패해야 «장애» 로 본다. 순간 blip 은 무시.
#  · 상태가 **바뀔 때만** 1회 발송. 죽어 있는 동안 5분마다 문자가 오지 않는다.
#  · 문자 발송에 실패하면 상태를 저장하지 않는다 → 다음 회차에 다시 시도.
#
#  2026-08-07 신설
# ═══════════════════════════════════════════════════════════════════════════
set -u

# 경로는 환경변수로 덮어쓸 수 있다 — 운영에서는 기본값을 쓰고,
# 회귀 테스트(test-harness/watchdog_layer2_harness.mjs)에서만 임시 경로로 바꿔 실제 실행한다.
CONF=${MANGOI_WD_CONF:-/root/.mangoi-alert.env}
LOG=${MANGOI_WD_LOG:-/var/log/mangoi-watchdog.log}
STATE=${MANGOI_WD_STATE:-/var/lib/mangoi-watchdog.state}

PRIMARY="https://test.mangoi.co.kr"
FALLBACK="https://webrtc-unified-platform.navy111p.workers.dev"

FAIL_THRESHOLD=2        # 연속 몇 회 실패해야 장애로 볼 것인가 (5분 간격 × 2 = 10분)
CURL_TIMEOUT=15

TEST_MODE=0
[ "${1:-}" = "--test" ] && TEST_MODE=1
[ "${1:-}" = "--sms-test" ] && TEST_MODE=2

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"; }

# 로그가 무한정 자라지 않게 (5000줄 유지)
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 8000 ]; then
  tail -n 5000 "$LOG" > "$LOG.tmp" && mv -f "$LOG.tmp" "$LOG"
fi

# ── 설정 읽기 ─────────────────────────────────────────────────────────────
if [ ! -f "$CONF" ]; then
  log "FATAL 설정 파일이 없습니다: $CONF  (config file missing)"
  exit 1
fi
# shellcheck disable=SC1090
. "$CONF"

: "${UPTIME_KEY:=}"
: "${SOLAPI_API_KEY:=}"
: "${SOLAPI_API_SECRET:=}"
: "${SOLAPI_FROM:=}"
: "${ALERT_TO:=}"
: "${ALERT_EMAIL:=}"

if [ -z "$UPTIME_KEY" ]; then
  log "FATAL UPTIME_KEY 미설정 — 심층 점검을 할 수 없습니다"
  exit 1
fi

# ── 문자 발송 (SOLAPI 직접 호출 — 워커를 거치지 않는다) ────────────────────
#    인증: HMAC-SHA256(secret, date+salt) — 워커 solapi-client.ts 와 같은 방식.
send_sms() {
  _text="$1"
  _sent=0

  if [ -n "$SOLAPI_API_KEY" ] && [ -n "$SOLAPI_API_SECRET" ] && [ -n "$SOLAPI_FROM" ] && [ -n "$ALERT_TO" ]; then
    _date=$(date -u '+%Y-%m-%dT%H:%M:%S.000Z')
    _salt=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
    _sig=$(printf '%s' "${_date}${_salt}" | openssl dgst -sha256 -hmac "$SOLAPI_API_SECRET" -hex 2>/dev/null | sed 's/^.*[ =]//')

    _body=$(mktemp)
    # 한글이 깨지지 않게 파일로 만들어 --data-binary 로 보낸다(인라인 인용은 로케일 영향을 받는다).
    cat > "$_body" <<EOF
{"message":{"to":"${ALERT_TO}","from":"${SOLAPI_FROM}","type":"LMS","subject":"망고아이 장애알림","text":"${_text}"}}
EOF
    _resp=$(curl -s -m "$CURL_TIMEOUT" -X POST 'https://api.solapi.com/messages/v4/send' \
      -H "Authorization: HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${_date}, salt=${_salt}, signature=${_sig}" \
      -H 'Content-Type: application/json' \
      --data-binary "@$_body" 2>&1)
    rm -f "$_body"

    case "$_resp" in
      *'"statusCode":"2000"'*) _sent=1; log "SMS 발송 성공 (sent)" ;;
      *) log "SMS 발송 실패 (failed): $(printf '%s' "$_resp" | head -c 300)" ;;
    esac
  else
    # ── 보조 경로 : SOLAPI 키가 아직 없을 때 «워커를 통해» 문자를 부탁한다 ──────
    #  ⚠️ 이건 완전한 2층이 아니다. 워커가 통째로 죽은 경우(reason=http)에는 이 경로도 죽는다.
    #     그래도 나머지 세 경우(도메인만 죽음·D1 죽음·cron 정지)는 워커가 살아 있으므로 문자가 나간다.
    #     즉 «키를 넣기 전까지는 4개 중 3개를 커버» 한다. 아무것도 못 하는 것보다 낫다.
    #  키를 $CONF 에 넣는 순간 위쪽 직접 경로로 자동 전환된다(코드 수정 불필요).
    log "WARN SOLAPI 키 미설정 → 워커 경유 보조 경로로 발송 시도 (worker-relay fallback; not full layer 2)"
    _base="$PRIMARY"; [ "${PRIMARY_OK:-1}" = "1" ] || _base="$FALLBACK"
    _at=1; [ "${CUR_STATE:-down}" = "up" ] && _at=2
    _resp=$(curl -s -m "$CURL_TIMEOUT" \
      "${_base}/api/uptime-hook?key=${UPTIME_KEY}&alertType=${_at}&monitorFriendlyName=$(printf '%s' "외부감시/${REASON:-recovered}" | sed 's/ /%20/g')" 2>&1)
    case "$_resp" in
      *'"sent":true'*|*'"skipped"'*) _sent=1; log "워커 경유 발송 성공 (relay ok)" ;;
      *) log "워커 경유 발송 실패 (relay failed): $(printf '%s' "$_resp" | head -c 200)" ;;
    esac
  fi

  # 보조 경로: 메일. 문자가 실패해도 흔적은 남는다.
  if [ -n "$ALERT_EMAIL" ] && command -v mail >/dev/null 2>&1; then
    printf '%s\n' "$_text" | mail -s "[MANGOi] outage watchdog" "$ALERT_EMAIL" 2>/dev/null \
      && log "메일 발송 시도 (mail sent to $ALERT_EMAIL)"
  fi

  return $((1 - _sent))
}

if [ "$TEST_MODE" = "2" ]; then
  log "--sms-test 실행 — 시험 문자를 1통 보냅니다"
  send_sms "[망고아이] 감시 2층 설치 시험 문자입니다. 실제 장애가 아닙니다."
  echo "sms-test done (rc=$?) — 로그: $LOG"
  exit 0
fi

# ── 1) 얕은 점검 : 바깥에서 HTTP 로 사이트가 응답하나 ──────────────────────
http_ok() {
  _code=$(curl -s -o /dev/null -m "$CURL_TIMEOUT" -w '%{http_code}' "$1/api/health" 2>/dev/null)
  [ "$_code" = "200" ]
}

REASON=""
PRIMARY_OK=0; FALLBACK_OK=0
http_ok "$PRIMARY"  && PRIMARY_OK=1
http_ok "$FALLBACK" && FALLBACK_OK=1

if [ "$PRIMARY_OK" = "0" ] && [ "$FALLBACK_OK" = "0" ]; then
  REASON="http"          # 둘 다 죽음 = 진짜 서비스 장애
elif [ "$PRIMARY_OK" = "0" ] && [ "$FALLBACK_OK" = "1" ]; then
  REASON="domain"        # 워커는 살아있는데 도메인만 안 됨 = DNS/라우팅 문제
fi

# ── 2) 심층 점검 : D1 생존 + 1층 cron 이 살아 있나 ────────────────────────
#    (얕은 점검이 통과했을 때만. 어차피 사이트가 죽었으면 이 호출도 안 된다.)
if [ -z "$REASON" ]; then
  BASE="$PRIMARY"; [ "$PRIMARY_OK" = "1" ] || BASE="$FALLBACK"
  PROBE=$(curl -s -m "$CURL_TIMEOUT" "$BASE/api/uptime-hook?run=probe&key=${UPTIME_KEY}" 2>/dev/null)

  case "$PROBE" in
    *'"ok":true'*)
      case "$PROBE" in
        *'"db":false'*)         REASON="db" ;;
        *'"cron_stale":true'*)  REASON="cron" ;;
      esac
      ;;
    *'"forbidden"'*)
      # 키가 틀린 것 — 서비스 장애가 아니다. 문자로 사람을 깨우지 말고 로그로만 알린다.
      log "ERROR 심층 점검 키 거부(403) — UPTIME_KEY 를 확인하세요. 장애로 치지 않습니다."
      ;;
    *)
      REASON="probe"   # 얕은 점검은 됐는데 API 가 이상 → 워커 예외 등
      ;;
  esac
fi

# ── 3) 판정 : 연속 실패 누적 ──────────────────────────────────────────────
PREV_STATE=up; FAILS=0
if [ -f "$STATE" ]; then
  # shellcheck disable=SC1090
  . "$STATE"
  PREV_STATE="${PREV_STATE:-up}"; FAILS="${FAILS:-0}"
fi

if [ -n "$REASON" ]; then
  FAILS=$((FAILS + 1))
else
  FAILS=0
fi

CUR_STATE=$PREV_STATE
if [ "$FAILS" -ge "$FAIL_THRESHOLD" ]; then
  CUR_STATE=down
elif [ "$FAILS" -eq 0 ]; then
  CUR_STATE=up
fi

log "probe reason='${REASON:-none}' primary=$PRIMARY_OK fallback=$FALLBACK_OK fails=$FAILS state=$PREV_STATE->$CUR_STATE"

if [ "$TEST_MODE" = "1" ]; then
  echo "reason=${REASON:-none} primary=$PRIMARY_OK fallback=$FALLBACK_OK fails=$FAILS state=$PREV_STATE->$CUR_STATE"
  echo "(--test 는 상태를 저장하지도, 문자를 보내지도 않습니다)"
  exit 0
fi

# ── 4) 상태가 바뀐 순간에만 1회 발송 ──────────────────────────────────────
SAVE=1
if [ "$CUR_STATE" != "$PREV_STATE" ]; then
  if [ "$CUR_STATE" = "down" ]; then
    case "$REASON" in
      http)   MSG="[망고아이] ⚠️ 사이트에 바깥에서 접속이 안 됩니다(10분 연속). 즉시 확인이 필요합니다." ;;
      domain) MSG="[망고아이] ⚠️ test.mangoi.co.kr 만 접속 불가입니다(워커는 정상). DNS·도메인 설정을 확인하세요." ;;
      db)     MSG="[망고아이] ⚠️ 사이트는 뜨는데 데이터베이스(D1)가 응답하지 않습니다. 로그인·수업이 막힐 수 있습니다." ;;
      cron)   MSG="[망고아이] ⚠️ 사이트는 정상인데 자동작업(cron)이 40분 넘게 멈췄습니다. 알림·정산이 조용히 안 돌고 있습니다." ;;
      *)      MSG="[망고아이] ⚠️ 사이트 점검 API 가 비정상 응답입니다(10분 연속). 확인이 필요합니다." ;;
    esac
  else
    MSG="[망고아이] ✅ 사이트가 정상 복구되었습니다."
  fi
  if send_sms "$MSG"; then :; else
    # 발송 실패 → 상태를 저장하지 않는다. 다음 회차(5분 뒤)에 다시 시도한다.
    log "WARN 발송 실패로 상태 저장을 보류합니다 (will retry next run)"
    SAVE=0
  fi
fi

if [ "$SAVE" = "1" ]; then
  mkdir -p "$(dirname "$STATE")"
  printf 'PREV_STATE=%s\nFAILS=%s\n' "$CUR_STATE" "$FAILS" > "$STATE"
fi
exit 0
