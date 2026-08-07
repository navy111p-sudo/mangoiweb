#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
#  🔧 장애감시 2층 — SOLAPI 설정 도우미 / layer-2 alert setup helper
#
#  실행 / run:  ssh root@118.219.234.180 -t /bin/bash /root/mangoi-alert-setup.sh
#
#  왜 이게 있나 / why this exists
#    `cat >> file` 에 직접 붙여넣는 방식은 너무 잘 깨진다 —
#    SSH 세션이 끊겨 있으면 입력이 허공으로 사라지고, 그 사실이 화면에 안 보인다.
#    (2026-08-07 에 실제로 그렇게 한 번 날아갔다.)
#    그리고 값을 명령줄 인자로 주면 **서버 프로세스 목록과 셸 히스토리에 그대로 남는다.**
#    그래서 물어보고 받아서 파일에 직접 쓴다. 화면에도, 히스토리에도 안 남는다.
#
#  하는 일
#    · 4개 값을 하나씩 물어본다 (키·시크릿은 화면에 안 찍힘)
#    · 전화번호는 숫자만 남긴다 (010-1234-5678 → 01012345678)
#    · 형식을 검사하고, 기존 값이 있으면 갈아끼운다 (중복 줄이 안 생김)
#    · UPTIME_KEY 는 절대 건드리지 않는다
#    · 마지막에 시험 문자를 보낼지 물어본다
#
#  2026-08-07 신설
# ═══════════════════════════════════════════════════════════════════════════
set -u
CONF=${MANGOI_WD_CONF:-/root/.mangoi-alert.env}

echo
echo "════════════════════════════════════════════════════════"
echo "  망고아이 장애감시 2층 — SOLAPI 설정"
echo "  MANGOi outage watchdog layer 2 - SMS setup"
echo "════════════════════════════════════════════════════════"
echo
echo "  값은 화면에 찍히지 않고, 셸 히스토리에도 남지 않습니다."
echo "  중간에 그만두려면 Ctrl+C 를 누르십시오 (아무것도 안 바뀝니다)."
echo

if [ ! -f "$CONF" ]; then
  echo "  ❌ 설정 파일이 없습니다: $CONF"
  echo "     감시 스크립트가 설치되지 않은 것 같습니다."
  exit 1
fi

# ── 입력 받기 ─────────────────────────────────────────────────────────────
# ⚠️ read 가 EOF(입력 끊김)로 실패하면 «빈 값» 이 온다.
#    그걸 «다시 물어보자» 로 처리하면 **영원히 도는 무한 루프**가 된다 —
#    SSH 세션이 끊긴 채로 돌면 서버에 프로세스가 매달린다. 반드시 EOF 를 구분해서 빠져나온다.
#    (2026-08-07 로컬 시험에서 실제로 3분 동안 매달렸다.)
die_eof() { echo; echo "  ⚠️ 입력이 끊겼습니다. 아무것도 바꾸지 않고 종료합니다."; exit 1; }

ask_secret() {   # $1=표시이름  $2=변수명
  local _v="" _try=0
  while : ; do
    _try=$((_try + 1)); [ "$_try" -gt 5 ] && { echo "  ⚠️ 재시도 초과. 종료합니다."; exit 1; }
    printf '  %s: ' "$1"
    read -rs _v || die_eof
    echo
    _v=$(printf '%s' "$_v" | tr -d '[:space:]')
    [ -n "$_v" ] && break
    echo "     비어 있습니다. 다시 입력하십시오."
  done
  printf -v "$2" '%s' "$_v"
  echo "     → 받았습니다 (${#_v}자)"
}

ask_phone() {    # $1=표시이름  $2=변수명  $3=최소자리수
  local _v="" _d="" _try=0
  while : ; do
    _try=$((_try + 1)); [ "$_try" -gt 5 ] && { echo "  ⚠️ 재시도 초과. 종료합니다."; exit 1; }
    printf '  %s: ' "$1"
    read -r _v || die_eof
    _d=$(printf '%s' "$_v" | tr -cd '0-9')      # 숫자만 남긴다
    [ "${#_d}" -ge "$3" ] && break
    echo "     숫자가 $3자리 이상이어야 합니다. 다시 입력하십시오."
  done
  printf -v "$2" '%s' "$_d"
  echo "     → ${_d}"
}

echo "  ① SOLAPI API Key   (solapi.com → 개발/연동 → API Key 관리)"
ask_secret "붙여넣기" SK_KEY
echo
echo "  ② SOLAPI API Secret"
ask_secret "붙여넣기" SK_SECRET
echo
echo "  ③ 발신번호 — SOLAPI 에 등록·인증된 번호여야 합니다"
ask_phone "입력 (하이픈 있어도 됨)" SK_FROM 8
echo
echo "  ④ 문자 받으실 번호"
ask_phone "입력 (하이픈 있어도 됨)" SK_TO 10
echo

# ── 파일에 쓰기 (기존 값은 갈아끼우고, 없으면 추가) ────────────────────────
CONF_BAK="${CONF}.bak-$(date +%Y%m%d%H%M%S)"
cp -p "$CONF" "$CONF_BAK"

TMP=$(mktemp)
# 주석 처리돼 있던 안내줄과 옛 값은 걷어내고, UPTIME_KEY 등 나머지는 그대로 둔다.
grep -vE '^\s*#?\s*(SOLAPI_API_KEY|SOLAPI_API_SECRET|SOLAPI_FROM|ALERT_TO)=' "$CONF" > "$TMP"
grep -vqE '^\s*#\s*아래 4줄' "$TMP" 2>/dev/null || true
sed -i '/^\s*#\s*아래 4줄/d' "$TMP"

{
  printf 'SOLAPI_API_KEY=%s\n'    "$SK_KEY"
  printf 'SOLAPI_API_SECRET=%s\n' "$SK_SECRET"
  printf 'SOLAPI_FROM=%s\n'       "$SK_FROM"
  printf 'ALERT_TO=%s\n'          "$SK_TO"
} >> "$TMP"

umask 077
cat "$TMP" > "$CONF"
rm -f "$TMP"
chmod 600 "$CONF"

echo "  ✅ 저장했습니다.  (이전 파일 백업: $CONF_BAK)"
echo
echo "  === 확인 (값은 안 보입니다) ==="
for k in UPTIME_KEY SOLAPI_API_KEY SOLAPI_API_SECRET SOLAPI_FROM ALERT_TO; do
  v=$(grep -m1 "^$k=" "$CONF" | cut -d= -f2-)
  if [ -n "$v" ]; then echo "    $k : 설정됨 (${#v}자)"; else echo "    $k : ❌ 없음"; fi
done
echo

# ── 시험 문자 ─────────────────────────────────────────────────────────────
printf '  시험 문자를 1통 보낼까요? [y/N] '
read -r ANS || ANS=n
case "$ANS" in
  y|Y)
    /bin/bash /root/mangoi-watchdog.sh --sms-test
    echo
    echo "  문자가 오지 않았다면 아래 로그에 이유가 있습니다:"
    echo "    tail -5 /var/log/mangoi-watchdog.log"
    ;;
  *)
    echo "  건너뜁니다. 나중에 시험하려면:"
    echo "    /bin/bash /root/mangoi-watchdog.sh --sms-test"
    ;;
esac
echo
echo "  이제 감시 2층이 문자를 «워커를 거치지 않고» 직접 보냅니다."
echo "  → 워커·Cloudflare 가 통째로 죽어도 알림이 나갑니다."
echo
