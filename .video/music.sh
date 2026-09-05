#!/usr/bin/env bash
# 시그널·엔딩 음악 — ffmpeg 만으로 만든다(저작권 걱정이 없다).
#   ⚠️ 순수 사인파 하나는 «삐-» 소리로 들린다. 그래서
#      ① 같은 음을 ±1.5Hz 디튠해 둘씩 겹치고(따뜻하게 흔들린다)
#      ② 리버브를 충분히 주고 ③ 로우패스로 높은 배음을 깎는다.
#   음정: C major add9  (C·G·C·E·D) — 밝고 편안한 화음.
set -euo pipefail

pad () {   # pad <길이> <출력> <페이드인> <페이드아웃시작> <페이드아웃길이> <볼륨>
  local D=$1 OUT=$2 FI=$3 FOS=$4 FOD=$5 VOL=$6
  ffmpeg -v error -y \
    -f lavfi -i "sine=f=130.81:d=$D" -f lavfi -i "sine=f=132.31:d=$D" \
    -f lavfi -i "sine=f=196.00:d=$D" -f lavfi -i "sine=f=197.30:d=$D" \
    -f lavfi -i "sine=f=261.63:d=$D" -f lavfi -i "sine=f=263.13:d=$D" \
    -f lavfi -i "sine=f=329.63:d=$D" -f lavfi -i "sine=f=331.13:d=$D" \
    -f lavfi -i "sine=f=587.33:d=$D" \
    -filter_complex "\
      [0]volume=0.50[a1];[1]volume=0.50[a2];\
      [2]volume=0.30[b1];[3]volume=0.30[b2];\
      [4]volume=0.34[c1];[5]volume=0.34[c2];\
      [6]volume=0.24[d1];[7]volume=0.24[d2];\
      [8]volume=0.10[e];\
      [a1][a2][b1][b2][c1][c2][d1][d2][e]amix=inputs=9:normalize=0,\
      aecho=0.82:0.88:170|360|540:0.34|0.22|0.12,\
      lowpass=f=2100,\
      volume=$VOL,\
      afade=t=in:st=0:d=$FI,afade=t=out:st=$FOS:d=$FOD,\
      aformat=sample_rates=48000:channel_layouts=stereo" "$OUT"
}

# 시그널(인트로) 5.5초 — 서서히 차오르고 나레이션 직전에 사라진다
pad 5.5 intro.wav 2.0 3.2 2.3 0.34
# 엔딩 6.5초 — 마지막 문장 뒤의 여운. 조금 더 길게 사라진다
pad 6.5 outro.wav 1.4 2.6 3.9 0.30

for f in intro.wav outro.wav; do
  python3 -c "
import wave,sys
w=wave.open('$f'); print('  $f  %.2f초  %dHz  %d채널'%(w.getnframes()/w.getframerate(), w.getframerate(), w.getnchannels()))
"
done
