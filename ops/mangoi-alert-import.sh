#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
#  📥 장애감시 2층 — SOLAPI 설정 «파일로 한 번에» 넣기
#      import layer-2 SMS settings from stdin (no interactive prompts)
#
#  쓰는 법 / usage  — 사장님 PC 의 PowerShell 에서:
#      type C:\경로\solapi.txt | ssh root@<서버> "/bin/bash /root/mangoi-alert-import.sh"
#
#  받는 형식 (순서는 상관없음, 없는 줄은 무시)
#      SOLAPI_API_KEY=...
#      SOLAPI_API_SECRET=...
#      SOLAPI_FROM=0233677788
#      ALERT_TO=01012345678
#
#  ── 왜 이게 있나 / why ─────────────────────────────────────────────────────
#  대화형(`read` 로 하나씩 묻기)은 이 경로에서 계속 깨졌다:
#    · SSH 세션이 끊긴 채 붙여넣으면 입력이 통째로 사라지는데 화면엔 되는 것처럼 보인다
#    · 여러 줄을 한꺼번에 붙여넣으면 뒤 줄들이 «다음 질문의 답» 으로 먹혀 버린다
#      (2026-08-07: 발신번호 질문이 빈 줄에 세 번 튕기고 저장 없이 종료)
#  파일을 통째로 보내면 그런 타이밍 문제가 아예 없다. 다 받은 뒤에 한 번에 판정한다.
#
#  ── 안전 규칙 ─────────────────────────────────────────────────────────────
#  · 값은 화면에 절대 안 찍는다. 자릿수만 알려준다.
#  · 하나라도 못 쓸 값이면 **아무것도 저장하지 않는다** (반쯤 들어가는 게 제일 위험하다)
#  · UPTIME_KEY 등 기존 줄은 그대로 둔다. 저장 전 자동 백업.
#  · 값이 명령줄 인자로 가지 않으므로 서버 프로세스 목록·셸 히스토리에 남지 않는다.
#
#  2026-08-07 신설
# ═══════════════════════════════════════════════════════════════════════════
set -u
CONF=${MANGOI_WD_CONF:-/root/.mangoi-alert.env}

if [ ! -f "$CONF" ]; then
  echo "❌ 설정 파일이 없습니다: $CONF (감시 스크립트가 설치되지 않았습니다)"
  exit 1
fi

# stdin 전체를 읽고 CR(윈도우 줄바꿈) 을 걷어낸다 — 윈도우에서 만든 파일이 그대로 온다.
IN=$(cat | tr -d '\r')

pick() {   # $1=키이름 → 그 키의 값(앞뒤 공백 제거)
  printf '%s\n' "$IN" | sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" | head -1 \
    | sed 's/[[:space:]]*$//'
}

cur() {    # 지금 설정 파일에 들어있는 값
  grep -m1 "^$1=" "$CONF" 2>/dev/null | cut -d= -f2-
}

# 🔴 안 보낸 항목은 «지우라» 는 뜻이 아니라 «그대로 두라» 는 뜻이다.
#    2026-08-07: 키 2줄만 보냈더니 이미 넣어 둔 발신·수신번호까지 «없음» 으로 판정돼 통째로 거부됐다.
#    부분 갱신이 안 되면 매번 4줄을 다 적어야 하고, 그러다 한 줄 틀리면 또 처음부터다.
K=$(pick SOLAPI_API_KEY);    [ -n "$K" ] || K=$(cur SOLAPI_API_KEY)
S=$(pick SOLAPI_API_SECRET); [ -n "$S" ] || S=$(cur SOLAPI_API_SECRET)
F=$(pick SOLAPI_FROM);       [ -n "$F" ] || F=$(cur SOLAPI_FROM)
T=$(pick ALERT_TO);          [ -n "$T" ] || T=$(cur ALERT_TO)
F=$(printf '%s' "$F" | tr -cd '0-9')   # 하이픈·괄호 알아서 제거
T=$(printf '%s' "$T" | tr -cd '0-9')

echo
echo "═══ 받은 값 (값은 안 보이고 자릿수만) ═══"
BAD=0
chk() {  # $1=이름 $2=값 $3=설명 $4=조건통과여부
  if [ "$4" = "1" ]; then echo "  ✅ $1 : ${#2}자"
  else echo "  ❌ $1 : $3"; BAD=1; fi
}
[ -n "$K" ] && chk SOLAPI_API_KEY    "$K" "" 1 || chk SOLAPI_API_KEY    "$K" "비어 있음 / 줄을 못 찾음" 0
[ -n "$S" ] && chk SOLAPI_API_SECRET "$S" "" 1 || chk SOLAPI_API_SECRET "$S" "비어 있음 / 줄을 못 찾음" 0
printf '%s' "$F" | grep -qE '^[0-9]{8,}$'  && chk SOLAPI_FROM "$F" "" 1 || chk SOLAPI_FROM "$F" "숫자 8자리 이상이 아님 (받은 숫자 ${#F}개)" 0
printf '%s' "$T" | grep -qE '^[0-9]{10,}$' && chk ALERT_TO    "$T" "" 1 || chk ALERT_TO    "$T" "숫자 10자리 이상이 아님 (받은 숫자 ${#T}개)" 0
echo

# ── 명백히 «다른 것» 인 경우만 짚어 준다 ─────────────────────────────────
#  🔑 «맞는 키인지» 를 모양으로 맞히려 들지 않는다 — 그러다 진짜 키를 막는다(결제 키에서 겪었다).
#     여기서 거르는 건 «SOLAPI 키가 아닌 것이 확실한» 두 가지뿐이다.
case "$K$S" in
  *SOLAPI_API_*) echo "  ⚠️ 값 안에 «SOLAPI_API_...» 가 들어 있습니다. '=' 뒤의 **값만** 넣으십시오."; BAD=1 ;;
esac
# 토스 결제 키(test_sk_ / live_sk_ / test_ck_ / live_ck_)를 SOLAPI 키로 착각한 경우.
#  2026-08-07 실제로 test_sk_ 키가 들어왔다. 그냥 «인증 실패» 로 두면 원인을 못 찾는다.
case "$K $S" in
  *test_sk_*|*live_sk_*|*test_ck_*|*live_ck_*)
    echo "  ⚠️ 이건 **토스페이먼츠 결제 키**입니다 (test_sk_/live_sk_… 로 시작). SOLAPI 키가 아닙니다."
    echo "     SOLAPI 키는 solapi.com → 개발/연동 → API Key 관리 에서 발급합니다."
    BAD=1 ;;
esac

if [ "$BAD" = "1" ]; then
  echo "  ⛔ 못 쓸 값이 있어 **아무것도 저장하지 않았습니다.** 파일은 그대로입니다."
  echo "     (반쯤 들어가면 «설정됐다» 고 믿게 되는데 알림은 안 나가는 상태가 됩니다)"
  exit 1
fi

BAK="${CONF}.bak-$(date +%Y%m%d%H%M%S)"
cp -p "$CONF" "$BAK"

TMP=$(mktemp)
# 기존 SOLAPI/ALERT 줄(주석 처리된 안내줄 포함)은 걷어내고, 나머지(UPTIME_KEY 등)는 보존한다.
grep -vE '^[[:space:]]*#?[[:space:]]*(SOLAPI_API_KEY|SOLAPI_API_SECRET|SOLAPI_FROM|ALERT_TO)=' "$CONF" \
  | sed '/^[[:space:]]*#.*4줄/d' > "$TMP"
{
  printf 'SOLAPI_API_KEY=%s\n'    "$K"
  printf 'SOLAPI_API_SECRET=%s\n' "$S"
  printf 'SOLAPI_FROM=%s\n'       "$F"
  printf 'ALERT_TO=%s\n'          "$T"
} >> "$TMP"

umask 077
cat "$TMP" > "$CONF"; rm -f "$TMP"; chmod 600 "$CONF"

echo "  ✅ 저장했습니다.  (이전 파일: $BAK)"
echo
echo "═══ 저장 후 확인 ═══"
for k in UPTIME_KEY SOLAPI_API_KEY SOLAPI_API_SECRET SOLAPI_FROM ALERT_TO; do
  v=$(grep -m1 "^$k=" "$CONF" | cut -d= -f2-)
  [ -n "$v" ] && echo "  $k : ${#v}자" || echo "  $k : ❌ 없음"
done
echo
echo "  이제 시험 문자를 보내려면:"
echo "    /bin/bash /root/mangoi-watchdog.sh --sms-test"
echo
