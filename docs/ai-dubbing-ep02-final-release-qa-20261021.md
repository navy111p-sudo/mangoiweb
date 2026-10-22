# mangoi.ai A.i영화더빙 2편 — 배포 전 실제 검수 기록 (2026-10-21)

**현재 결론: RELEASE BLOCKED — 2번 카드의 `coming` 상태 유지**.

기존 PR #1668은 `main`에 병합되었지만 운영 `https://mangoi.ai/data/dubbing/dub-002.json`은 404이고, `index.json`의 dub-002는 `coming` 상태입니다. **운영 배포가 완료된 것이 아닙니다.** 이 기록은 기존 1·3·5편과 운영 코드를 변경하지 않습니다.

## 제작 자료

- 2편 새 3D 시사회 (v3): https://d2ol7oe51mr4n9.cloudfront.net/user_3GD1yS6zlj6afu2oFQqivYqvn7k/94d19edb-3bba-4b61-9c49-d5f118b95680.mp4
- 장면 1~3 미디어 ZIP: https://d2ol7oe51mr4n9.cloudfront.net/user_3GD1yS6zlj6afu2oFQqivYqvn7k/2c90833d-b1c2-4830-948e-0227f27c2f0f.zip
- 장면 4~6 미디어 ZIP: https://d2ol7oe51mr4n9.cloudfront.net/user_3GD1yS6zlj6afu2oFQqivYqvn7k/f951aea1-746d-4a40-b963-8cde7a19c54d.zip
- Git `cloudflare-deploy/public/data/dubbing/dub-002.json`: 기존 3편처럼 `timing=provisional` 차례별 원어민 TTS → 학생 녹음 학습 구성, 역할 4개, 장면 6개, 영어/한국어 48문장, 현재 `status=preview`.

## 확인된 항목 (실제 테스트)

| 항목 | 결과 | 범위/한계 |
|---|---|---|
| 새 영상 파일 | PASS | 240.022초, 1280×720, 30fps H.264, 사운드 48kHz AAC |
| 장면별 파일 | PASS | 6장면 각각 길이 45·45·45·30·45·30초; 무음 MP4와 BGM WAV, 캐릭터별 음성 4개 WAV 일치 |
| 시각적 화풍 | SAMPLE PASS | 6장면에서 시작·중간·끝을 포함해 57개 프레임 검사. 이전 실사 풍 인물이 재등장하는 장면은 해당 표본에서 발견하지 못했음. 전체 프레임의 Identity/Viseme 보증은 아님 |
| 콘텐츠 구조 | PASS | 6장면, 48개 영어/한국어 대사, Maya/Kai/Emma/Pip 각 장면당 2줄 |
| 공통 학습 엔진 | PASS | `MangoiDubCore.normalizeEpisode` 오류 0. `turn`/TTS 모드 6장면 모두 일치 |
| PC·모바일 가상 브라우저 | PASS | 1280px / 390px: 6장면 표시, 3명 다른 배역 선택, 첫 영상 45초 메타데이터, 브라우저 오류 0 |
| 가상 마이크 녹음 | SIMULATED PASS | 실제 `getUserMedia` 경로를 Web Audio oscillator로 대체해 1장면 Maya 학생 대사 2개 녹음하고 학생 목소리 포함 WebM 영상(약 2MB) 생성 |
| 발음 평가 파이프라인 | MOCK PASS ONLY | 음성 전사·교정 응답은 로컬 모의 서버 응답. 점수 83은 테스트값일 뿐 실제 학생 발음 평가값이 아님 |
| 영어 음성 TTS | PASS | 운영 API `/api/voice/tts`에 4개 화자 `andromeda/apollo/thalia/aurora` 각각 요청, HTTP 200 + 정확히 같은 `X-TTS-Speaker` 응답 |
| 실제 학생 디바이스 녹음·발음 평가 | NOT TESTED | 실제 사용자 PC/태블릿/휴대폰 마이크, 악센트·발음 평가, 녹음 동의 흐름 필요 |
| 실제 입모양 phoneme/viseme 일치 | NOT VALIDATED | 기존 3편과 동일한 차례별 학습(`provisional`)이므로 타임코드 동기 더빙을 보장하지 않음 |
| CDN/저장소 | BLOCKED | Higgsfield 임시 URL은 영구 보관이 보장되지 않음; 운영 관리 R2 또는 정식 미디어 경로가 필요 |
| 학원·아동 정보 및 상업용 권리 검토 | PENDING | 학원용 이용권, 생성형 콘텐츠 상업적 라이선스, 어린이 녹음 보관/권한 설계 확인 필요 |

## 배포 전 해야 할 일

1. 담당자와 함께 4개 캐릭터의 전체 영상에서 얼굴·옷·목소리와 대사 일치 최종 검수, 문자·발음 오타 확인.
2. 실제 교사/학습자 계정으로 Chrome 데스크톱, Android/iPhone 지원 브라우저에서 마이크 권한, 1·3인 배역, 정상 채점(Whisper/Azure), 녹음/완성 영상 다운로드를 각각 확인. 가상 브라우저 Mock만으로 승인하지 않기.
3. 장면별 영상·BGM·스템을 **영구 운영 저장소(R2 등)** 에 올린 뒤 재생·CORS/모바일/비용/캐시 테스트. 현재 연결된 R2 계정에는 `mango-recordings`, `mangoi-db-backups`, `webrtc-class-recordings`만 보여 학습미디어용 버킷은 확정되지 않음. 녹음/백업 버킷에 임의로 업로드하지 말 것.
4. 영상·음원 라이선스/어린이 녹음 개인정보를 검토하고 최종 콘텐츠 승인 받기.
5. 위 항목 통과 후 `index.json`의 dub-002 **한 항목만** `coming` → `ready`로 바꾸고 정식 배포. 기존 1·3·5편은 유지.

## 작업 기준

- 새 3D v3를 기준으로 유지; 기존 실사풍 버전의 원본 16개는 재사용 금지.
- 브랜드 `mangoi.ai`, 1편·3편 공용 학습 엔진 재사용.
- 역할 선택한 학생의 원어민 음성만 음소거하고 그룹 영어 발표를 지원.
- 미완성 상태에서 운영 카드 활성화하지 않기.
