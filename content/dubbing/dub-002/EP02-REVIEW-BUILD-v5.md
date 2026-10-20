# EP02 실물 영상·음성 편집 패키지 — 2026-10-20

**브랜드:** mangoi.ai · **편:** 2편 「예상치 못한 위기!」

## 실제 생성·편집 결과 (REVIEW ONLY)

- 실제 MPEG-4 시사회 영상 **240.022초 / 1280×720 / 30fps / H.264 + 48kHz AAC**:
  https://d2ol7oe51mr4n9.cloudfront.net/user_3GD1yS6zlj6afu2oFQqivYqvn7k/279aaf80-4b88-4670-8b11-741dc6c3e9eb.mp4
- 장면 1~3 영상·48kHz 음향·배역별 음성·대본·썸네일 ZIP:
  https://d2ol7oe51mr4n9.cloudfront.net/user_3GD1yS6zlj6afu2oFQqivYqvn7k/391bcc0d-82bf-4511-b234-0410c1349cc7.zip
- 장면 4~6 영상·48kHz 음향·배역별 음성·대본·썸네일 ZIP:
  https://d2ol7oe51mr4n9.cloudfront.net/user_3GD1yS6zlj6afu2oFQqivYqvn7k/691dd2ac-e021-40e7-9355-dd32247aaea9.zip

두 ZIP에는 동일한 `episode.json`, `characters.json`, `credits.txt`, `QA.json`, `README.txt`, `poster.webp`가 있고, 6개 장면 각각에 `video.mp4`(무음), `preview.mp4`(믹스), `bgm.wav`, `music.wav`, `sfx.wav`, `voice-maya.wav`, `voice-kai.wav`, `voice-emma.wav`, `voice-pip.wav`, `thumb.webp`를 포함합니다.

- 장면 순서/길이: 45초,45초,45초,30초,45초,30초 — 총 240초
- 각 무음 영상 1280×720, H.264, 30fps
- 각 장면별 음성·BGM 모두 48kHz WAV이고 영상과 같은 길이, 타임라인 0초 시작
- 힉스필드로 독창적 배경음악 6곡 및 효과음 6종 생성 후 대사 구간 음악 감쇠(ducking)를 적용
- Kai / Emma / Maya / Pip 중 세 명은 원어민 유사 영어 TTS 개별 음성 스템 분리, Pip도 개별 스템 보유
- 영어 문장 48개와 한국어 대조, 역할, 감정, 임시 시작/끝 시간 JSON 수록

## 생산 배포 차단 사유 (반드시 읽기)

1. **일부 기존 Kling 원본 클립이 Sofia(이전 구성)를 포함**하며, 새로운 승인 인물 Emma와 외형이 일치하지 않습니다. **이 시사회본은 공식 캐릭터 외형 기준을 충족하지 않습니다.**
2. **6장면 Pip 목소리 원본은 아직 생성되지 않아 `voice-pip.wav`가 무음**입니다. `s6-l4`, `s6-l8` 두 문장은 다시 음성을 만들어야 합니다.
3. 영어 음성은 대본 시작·끝에 맞춰 배치했으나 **원본 영상 입 모양과 프레임 단위 동기화 검사는 아직 완료되지 않았습니다**.
4. 생성 툴 및 음원 라이선스의 최종 상업적 이용 검증, 영구 저장소 이전, 학습 UI 통합과 학생 녹음 회귀 테스트 미완료.

**1편 및 사이트 운영 코드 변경 없음.** 이 PR은 Claude용 콘텐츠 검수·이관용이며 리뷰 완료 전 2번 카드 공개 배포 금지.

## Claude 통합용 확인 순서

1. 압축을 풀어 장면별 MP4·WAV의 정확한 길이와 48kHz/mono·stereo를 검사합니다.
2. 캐릭터 불일치 장면만 교체하고, 새로 생성한 장면의 영상 길이는 유지합니다.
3. Pip 6장면 음성 2줄 및 입모양 검수 완료 후 `preview.mp4`를 다시 생성합니다.
4. 영상·오디오 파일은 운영 Git이 아닌 R2로 복사하고, 텍스트 JSON은 콘텐츠 폴더에 배치합니다.
5. 기존 1편 UI의 '듣기 → 역할별 음소거/녹음 → 발표' 동일 동작으로 테스트합니다.
6. 승인 후에만 mangoi.ai A.i영화더빙 2번 카드에 노출합니다.
