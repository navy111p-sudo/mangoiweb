# 망고아이 홍보영상 (2026-08-17)

유튜브용 브랜드 필름. 원본은 `docs/MANGO_AI_안내_통합본_2026-08-17.pptx` 29장이고,
화면은 전부 **실제 서비스 캡처**입니다. 별도 촬영이나 일러스트는 쓰지 않았습니다.

## 결과물 4종

| 파일 | 사양 | 내레이션 | 비고 |
|---|---|---|---|
| `mangoi_main_여성.mp4` | 1920×1080 / 30fps / **1:34.2** | 여성 | **바로 사용 가능** |
| `mangoi_shorts_여성.mp4` | 1080×1920 / 30fps / **0:42.6** | 여성 | 바로 사용 가능 |
| `mangoi_shorts_남성.mp4` | 1080×1920 / 30fps / **0:44.4** | 남성 | 바로 사용 가능 |
| `mangoi_main_남성.mp4` | 1920×1080 / 30fps / **1:37.2** | 남성 | ⚠️ 아래 참고 |

**제목**: 재미가 의지를 이깁니다 | 망고아이 A.I 화상영어
**썸네일**: `썸네일_본편_가로.png`(1280×720) · `썸네일_쇼츠_세로.png`(1080×1920)

> ⚠️ **`mangoi_main_남성.mp4` 는 컷2 오디오가 옛 숫자입니다.**
> 화면은 «160분 / 0.5%» 인데 목소리가 «스물다섯 분 … 이백 분» 이라고 말합니다.
> 컷2 한 문장(약 11초)만 다시 녹음해 `cut2.wav` 로 주면 그 자리만 교체하면 됩니다.
> 대사는 `망고아이_2분_성우녹음_대본.txt` 의 [컷 2] 항목입니다.
> 숏폼은 본편의 1·3·5·8컷만 쓰기 때문에 남성 숏폼에는 이 문제가 없습니다.

> ⚠️ 업로드할 때 썸네일은 반드시 «맞춤 미리보기»로 PNG 를 직접 올리세요.
> 영상이 검은 화면에서 시작해서 자동 추출 썸네일은 비어 보입니다.
> 쇼츠는 제목이나 설명에 `#shorts` 가 있어야 쇼츠 피드로 갑니다.

## 수업시간 표기

주 2회 × 20분 = **월 160분**. 한 달 43,200분 가운데 실제로는 0.37% 이지만,
성우가 «영 점 오 퍼센트» 로 읽어서 **화면은 0.5% 로 맞췄습니다**.
정확히 가려면 «영 점 사 퍼센트» 한 마디를 다시 녹음하거나, 퍼센트 표기를 빼면 됩니다.
화면 숫자는 `render2.py` 의 환경변수로 바꿉니다 — `PCT=0.4 MIN_TXT=160분`.

## 구성 (본편 8컷)

| 컷 | 내용 |
|---|---|
| 1 | 훅 — 「재능이 없어서가 아닙니다」 |
| 2 | 문제 — 한 달 43,200분 중 160분 |
| 3 | 답 — A.I 학습 콘텐츠 14가지 |
| 4 | 음성코치 · 친구 대화 · 영작 첨삭 · 단어장 |
| 5 | 학습 게임 21종 (BPM 100, 한 박 0.6초마다 컷) |
| 6 | 근거 — 비고츠키 근접발달영역 · 간격 반복 |
| 7 | 사용방법 3단계 |
| 8 | 마무리 — www.mangoi.ai |

숏폼은 이 중 1·3·5·8번만 골라 재구성한 것입니다.

## 음악

**직접 합성했습니다. 상용 음원이 아니라 저작권 문제가 없습니다.**
미니멀 신스 팝 / BPM 100 / C 장조 / Cmaj9–Am7–Fmaj7–G6.
되풀이되는 벨 멜로디를 후크로 두고, 컷 구조에 맞춰 악기를 넣고 뺍니다 —
컷 5(게임) 직전에 라이저와 임팩트, 컷 6(근거)에서 드럼 전면 아웃.

덕킹(말할 때 음악을 낮추는 처리)은 ffmpeg 사이드체인 대신
`mixsmooth.py` 가 numpy 로 포락선을 직접 계산합니다 —
내릴 때 0.12초, 올릴 때 1.1초, 최대 −6dB. 음악이 튀지 않고 스르르 돌아옵니다.

## 다시 만들려면

```bash
cd src
python3 align2.py vo_f.wav align_f.json            # 내레이션을 8구간으로 분할
python3 music3.py bgm_f.wav timing_f quiet,empty,enter,build,peak,break,return,finale
python3 mixsmooth.py timing_f bgm_f.wav audio_f.wav
PCT=0.5 MIN_TXT=160분 TIMING=timing_f python3 render2.py v_main_f.mp4
ffmpeg -i v_main_f.mp4 -i audio_f.wav -i cover.jpg \
  -map 0:v:0 -map 1:a:0 -map 2:v:0 -c:v:0 copy -c:a aac -b:a 192k \
  -c:v:1 mjpeg -disposition:v:1 attached_pic -movflags +faststart out.mp4
```

숏폼은 `timing_vf` / `vert.py` 로 같은 순서 (`TIMING_V=timing_vf`).
썸네일은 `thumb.py`(가로) · `thumb_v.py`(세로).

### 컷 길이 조정

`timing_*.py` 의 `BEATS`(한 박 0.6초)만 고치면 화면 쪽 타이밍이 자동으로 따라옵니다.
목소리 뒤 빈 시간은 컷당 1~1.5초가 적당합니다 — 그보다 길면 «소리가 끊긴다»고 느낍니다.

### 필요한 것

- **화면 캡처 47장** — 용량이 커서 깃에 올리지 않았습니다.
  `games21.mjs`(게임 21종) · `inline4.mjs`(허브 인라인 게임 4종) · `assets2.mjs`(배경·다이어그램)로
  다시 뽑습니다. 스크립트는 `cloudflare-deploy/public` 을 로컬 정적 서버로 띄운 주소를 봅니다
  (`python3 -m http.server 8899 --directory cloudflare-deploy/public`).
  결과를 폭 1100px JPEG 로 줄여 `deck_img/` 에 두면 렌더러가 `../deck_img` 로 읽습니다.
- 한글 폰트 — NanumGothic (`/usr/share/fonts/truetype/nanum/`)
- ffmpeg, Python(numpy · Pillow)

`src/내레이션_원본_여성.mp3` · `src/내레이션_원본_남성.mp3` 가 이번에 쓴 녹음본입니다.
