# 망고아이 홍보영상 (2026-08-17)

유튜브용 브랜드 필름. 원본은 `docs/MANGO_AI_안내_통합본_2026-08-17.pptx` 29장이고,
화면은 전부 **실제 서비스 캡처**입니다. 별도 촬영이나 일러스트는 쓰지 않았습니다.

## 결과물

| 파일 | 사양 | 용도 |
|---|---|---|
| `mangoi_2min_final.mp4` | 1920×1080 / 30fps / **1:43.8** | 유튜브 본편 |
| `mangoi_shorts_45s.mp4` | 1080×1920 / 30fps / **0:44.4** | 유튜브 쇼츠 |
| `썸네일_본편_가로.png` | 1280×720 | 본편 맞춤 미리보기 |
| `썸네일_쇼츠_세로.png` | 1080×1920 | 쇼츠 맞춤 미리보기 |
| `유튜브_업로드_정보.txt` | — | 제목·설명·태그 복사용 |
| `망고아이_2분_성우녹음_대본.txt` | — | 내레이션 대본(재녹음용) |

**제목**: 재미가 의지를 이깁니다 | 망고아이 A.I 화상영어

> ⚠️ 업로드할 때 썸네일은 반드시 «맞춤 미리보기»로 PNG 를 직접 올리세요.
> 영상이 검은 화면에서 시작해서 자동 추출 썸네일은 비어 보입니다.
> 쇼츠는 제목이나 설명에 `#shorts` 가 있어야 쇼츠 피드로 갑니다.

## 구성 (본편 8컷)

| 컷 | 시각 | 내용 |
|---|---|---|
| 1 | 0:00 | 훅 — 「재능이 없어서가 아닙니다」 |
| 2 | 0:08 | 문제 — 한 달 43,200분 중 200분 = 0.5% |
| 3 | 0:21 | 답 — A.I 학습 콘텐츠 14가지 |
| 4 | 0:32 | 음성코치 · 친구 대화 · 영작 첨삭 · 단어장 |
| 5 | 0:47 | 학습 게임 21종 (BPM 100, 한 박 0.6초마다 컷) |
| 6 | 1:05 | 근거 — 비고츠키 근접발달영역 · 간격 반복 |
| 7 | 1:19 | 사용방법 3단계 |
| 8 | 1:30 | 마무리 — www.mangoi.ai |

쇼츠는 이 중 1·3·5·8번만 골라 44초로 재구성한 것입니다.

## 음악

**직접 합성했습니다. 상용 음원이 아니라 저작권 문제가 없습니다.**
미니멀 신스 팝 / BPM 100 / C 장조. 한 곡을 깔지 않고 컷 구조에 맞춰 악기를 넣고 뺍니다 —
특히 컷 6(근거)에서 드럼을 완전히 빼서 톤을 낮춥니다.

## 다시 만들려면

```bash
cd src
python3 align.py          # 내레이션 한 파일을 8구간으로 나눔 → align.json
python3 timing.py         # 컷 길이 확인
python3 music2.py bgm2.wav        # 배경음악 합성 (본편)
python3 mixaudio.py               # 내레이션 + 덕킹 믹스
python3 render2.py video_only.mp4 # 영상 렌더 (약 5분)
ffmpeg -i video_only.mp4 -i audio_mix.wav -i cover.jpg \
  -map 0:v:0 -map 1:a:0 -map 2:v:0 -c:v:0 copy -c:a aac -b:a 192k \
  -c:v:1 mjpeg -disposition:v:1 attached_pic -movflags +faststart out.mp4
```

쇼츠는 `timing_v.py` / `music_v.py` / `mixaudio_v.py` / `vert.py` 로 같은 순서.
썸네일은 `thumb.py`(가로) · `thumb_v.py`(세로).

### 필요한 것

- **화면 캡처 47장** — 용량이 커서 깃에 올리지 않았습니다.
  `games21.mjs`(게임 21종) · `inline4.mjs`(허브 인라인 게임 4종) · `assets2.mjs`(배경·다이어그램)로
  다시 뽑습니다. 스크립트는 `cloudflare-deploy/public` 을 로컬 정적 서버로 띄운 주소를 봅니다
  (`python3 -m http.server 8899 --directory cloudflare-deploy/public`).
  결과를 폭 1100px JPEG 로 줄여 `deck_img/` 에 두면 렌더러가 `../deck_img` 로 읽습니다.
- 한글 폰트 — NanumGothic (`/usr/share/fonts/truetype/nanum/`)
- ffmpeg, Python(numpy · Pillow)

### 목소리를 새로 뜨면

`망고아이_2분_성우녹음_대본.txt` 그대로 읽어 **컷별 8개 파일**로 받으시고,
한 파일로 받았다면 `align.py` 가 쉬는 지점을 찾아 8구간으로 나눠 줍니다.
컷 길이는 `timing.py` 의 `BEATS`(한 박 0.6초 단위)만 고치면 영상 쪽이 자동으로 따라옵니다.

`src/내레이션_원본.mp3` 가 이번에 쓴 녹음본입니다.
