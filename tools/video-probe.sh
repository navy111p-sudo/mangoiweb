#!/bin/bash
# ⚠️ 임시 — 영상 한 편의 «실제» 용량·해상도와, 첫 프레임을 포스터로 뽑았을 때의 용량을 잽니다.
set -e
out=tools/video-probe-result.txt
: > $out
for k in mini full; do
  url=$(node -e "console.log(require('./tools/video-probe.json').$k)")
  curl -sSL -o /tmp/$k.mp4 "$url"
  bytes=$(stat -c%s /tmp/$k.mp4)
  info=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,nb_frames -show_entries format=duration -of csv=p=0 /tmp/$k.mp4 | tr '\n' ' ')
  # 첫 프레임 → 640x480 webp 포스터
  ffmpeg -v error -y -i /tmp/$k.mp4 -vf "scale=640:480:force_original_aspect_ratio=increase,crop=640:480" -frames:v 1 /tmp/$k.png
  cwebp -quiet -q 80 -resize 640 480 /tmp/$k.png -o /tmp/$k.webp
  pbytes=$(stat -c%s /tmp/$k.webp)
  # 480p 로 더 줄여 보기(용량이 크면 이 길로)
  ffmpeg -v error -y -i /tmp/$k.mp4 -vf scale=640:-2 -c:v libx264 -crf 30 -preset slow -an -movflags +faststart /tmp/$k-re.mp4
  rebytes=$(stat -c%s /tmp/$k-re.mp4)
  echo "$k bytes=$bytes info=$info poster=$pbytes recompressed=$rebytes" >> $out
done
cat $out
