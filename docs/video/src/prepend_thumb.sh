#!/bin/bash
# 영상 맨 앞에 썸네일을 1.2초 붙이고 0.4초에 걸쳐 본편으로 넘어간다.
# 오디오는 1.2초 뒤로 밀어 싱크 유지. 표지(cover)는 두 번째 단계에서 심는다.
set -e
VID=$1; AUD=$2; PNG=$3; COVER=$4; OUT=$5; W=$6; H=$7
TMP="${OUT%.mp4}_tmp.mp4"
ffmpeg -v error -y \
  -loop 1 -t 1.7 -i "$PNG" -i "$VID" -i "$AUD" \
  -filter_complex "\
[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0B1020,fps=30,settb=AVTB,format=yuv420p,setsar=1[a];\
[1:v]fps=30,settb=AVTB,format=yuv420p,setsar=1[b];\
[a][b]xfade=transition=fade:duration=0.4:offset=1.2,format=yuv420p[v];\
[2:a]adelay=1200|1200[aud]" \
  -map "[v]" -map "[aud]" \
  -c:v libx264 -preset fast -crf 19 -pix_fmt yuv420p -profile:v high \
  -c:a aac -b:a 192k "$TMP"
ffmpeg -v error -y -i "$TMP" -i "$COVER" -map 0:v:0 -map 0:a:0 -map 1:v:0 \
  -c copy -c:v:1 mjpeg -disposition:v:1 attached_pic -movflags +faststart "$OUT"
rm -f "$TMP"
