# 4편 「뜻밖의 반전!」 — 최신 main 통합 / 미디어 담당 인계 v2

최신 음원 인계: 60개 음성·6장면 stem의 Library ID를 받았으나 로컬 전송은 HTTP403으로 차단. `AUDIO-HANDOFF-RECEIPT.json` 참조. **새 오디오 기준은 `voices/draft-scene-mix/timing-proposal-v1.json`이며 이전 가안 시각으로 연결하면 안 된다.** 부모가 전달한 60줄 메타데이터 추출본을 검증·반영했다. 원본 전체 매니페스트와 음성 바이너리를 가져온 것은 아니다.

**2026-10-20 재개 상태: 대본·샷·음향 설계 및 실제 엔진/화면 검증 완료. 이 환경에서 영상·음성·음악·효과음은 생성하지 않았다.** 사용자가 충전 후 진행 승인. 부모 지시에 따라 미디어 담당이 생성하며, 이 통합 담당은 비용 지출·업로드를 실행하지 않는다. 공개 카드 활성화·푸시·병합·배포 승인 없음.

최신 사용자 기준 그림: Library `libfile_b6494c0eacb48191bc6cc32ff6033cf3`. 부모와 미디어 담당이 픽셀 확인. Maya는 노란 후드, Pip은 보라색 촉수 안테나이며 이전 우주 재킷 텍스트보다 새 그림이 우선한다. 외부 업로드 동의는 마지막 전달 기준 대기 중.

## 최종 내용

**Kai(동양인/한국 남아)·Emma(백인 여아)·Maya(흑인 여아)·Pip(외계인)·Momo(로봇)** 총 5명, 동물/원숭이 없음. 화면에 추가 인물도 등장시키지 않는다. 구조받는 선원은 대사와 먼 배로만 표현한다.

2편에서 다시 방문하겠다고 약속한 Pip이 친구들을 찾아온다. 바다의 신호를 따라간 다섯 친구는 해적선처럼 보이는 배의 로봇 Momo를 보물 도둑으로 오해한다. 상자에는 등대를 고칠 별 수정이 들어 있었고, Momo는 길 잃은 배들을 구조하고 있었다. 함께 등대를 밝히고 ‘겉모습보다 먼저 이야기를 듣자’는 반전을 완성한다. 2편 마지막 알의 정체를 임의로 정의하거나 새 여섯 번째 인물을 만들지 않는다. 3편의 끝에서 바로 이어진다고 주장하지 않는다.

6장면 × 40초 = 240초 가안. **60문장**, 각 역할 매 장면 2줄/전체 12줄. 기존 1편의 ‘역할마다 장면당 두 줄’을 5역으로 확장했다. 24개 10초 샷, 각 샷에 발화 ID 지정. 실제 오디오 타이밍 추출본 반영 후 **10개 대사가 기존 10초 컷 경계를 지나므로 컷 재설계/연속 음향 편집이 필요**하다. 음성을 잘라 맞추지 않는다. 영상 타이밍은 **provisional**이다. 학생 반복 연습은 4분보다 길어질 수 있다.

## 최신 확인 결과

- main: `98beaf2ec`, PR1675(`4bf457cd7`) 작품→에피소드→배역 선택 화면 포함. 기존 로컬 브랜치를 fast-forward했다.
- [2편 PR1668](https://github.com/navy111p-sudo/mangoiweb/pull/1668) head: `5b5bd5f678f0216bbf1ec2b97797fa9a8c3d5dae`. 최신 `episode.json`, `characters.json`, 재제작 v2 설명/QA/소스 문서를 git으로 직접 읽었다.
- v2는 16개 3D 클립 재제작·24개 음성 stem의 파일 단위 비무음 검사가 기록된 **시사회본**이다. 이전 v5의 외형/무음 문제를 최신 상태로 단정하지 않는다. 사람의 전체 프레임/음소 단위 입모양 검수와 운영 승인은 여전히 미완료다. 실제 영상/음향을 이 환경에서 청취·시청 검증한 것은 아니다.
- 실제 2편 결말: Pip `s6-l4`: “I will visit again!” → 4편 첫 줄 “Pip, you came back again!”로 연결. 이어지는 2편의 움직이는 알은 4편에서 정의하지 않는다.
- 완료된 소유자 Higgsfield 참조 **EP02 Four Cast**: element `67713c4d-1dfd-4ce1-9433-88ccfd04096b`, image job `8d402ba3-d159-4f14-8f5b-2097b2757d3f`. 도구 metadata와 PR source register가 일치한다. 픽셀 검증은 미디어 담당이 해야 한다.
- 기존 목소리 이름: Kai=Evan, Emma=Abby, Maya=Amina, Pip=Pixie, Inworld 출처. 생성 이력과 현재 카탈로그의 inworld_text_to_speech voice 문자열(Evan (en), Abby (en), Amina (en), Pixie (en))까지 확인. Game pipeline only 제한과 정확한 지원 실행 경로는 미디어 담당이 확인해야 한다. 다른 모델의 UUID로 대체하지 말 것. VOICE-PATHS.md와 ep02-voice-provenance.json 참조. Momo는 새 기준/목소리 필요.
- 이전 사용자 Library 이미지와 v5 ZIP 다운로드 HTTP403은 우회/재시도하지 않았다. 새 원본 참조 ID를 정상 소유자 라이브러리 조회로 찾았다.

## 파일

- `episode.draft.json`: 기존 엔진 계약의 4편 매니페스트, `preview/provisional`. MP4는 예정 경로, voices/BGM은 비어 있음. **public 폴더에는 넣지 않음.**
- `dialogue.csv`: 60개 영한 대사/배역/감정/가안 타임코드.
- `production-plan.json`: 5인 외형 고정, 24개 동작·표정 샷과 발화 ID, 음악/SFX/ducking 지시.
- `audio-requests.json`: 대사별 clean WAV 요청 60개. 텍스트만이며 음성 생성 결과 아님. 슬롯을 넘으면 시간을 재조정하고 발화를 잘라내지 말 것.
- `media-handoff.json`: 정확한 참조 IDs, 기존 음악/SFX source IDs와 URL, 누락 자산, 역할 분담/예산 제한.
- `review-server.mjs`: 기존 HTML/JS/core 그대로 제공, 4편 JSON만 localhost에서 주입. API 503 차단으로 유료 TTS·평가 방지.
- `validate.mjs`, `browser-check.mjs`: 실제 core와 Chromium DOM 검사. 실제 미디어 시험 대체 아님.

## 화면 수정 (로컬만)

PR1675의 ‘바로 더빙’은 `S.sel`만 바꾸고 실행해 이전 카드/요약이 남을 수 있었다. 해당 클릭에서 기존 `pickScene()`을 먼저 호출하도록 한 줄 수정했다. 플레이어는 같은 엔진이다. JS 캐시 v4 및 자산 hash 갱신 포함. 공유 보안/결제/라우터, 다른 편 데이터는 수정하지 않았다.

```sh
node content/dubbing/dub-004/validate.mjs
node test-harness/ai_dubbing_harness.mjs
node test-harness/asset_version_harness.mjs
node content/dubbing/dub-004/review-server.mjs
# 별도 터미널
PW_MODULE=/tmp/dub004-tools/node_modules/playwright-core node content/dubbing/dub-004/browser-check.mjs
```

검토 주소: **http://127.0.0.1:8044/ai-dubbing.html?ep=dub-004** (이 환경 내 서버 실행 시). 공개 링크 아님. 제목·5역·장면 선택만 확인하며 미디어 재생 불가. 기존 전체 홍보 그림은 동물이 있는 이전 공통 그림 그대로이며 4편 실제 캐릭터 기준이 아니다.

## 미디어 납품/최종 통합

24×10초 실제 3D 컷 → 6×40초 H264/720p/24fps/faststart 무음 장면, 각 25MiB 미만. 실제 얼굴·표정·동작·입모양이 필요하며 정지 이미지 pan/zoom 대체 불가. 5인 기준 이미지 및 Momo 신규 기준을 고정하고 작은 시험으로 먼저 검사한다.

장면당 48kHz/40초/0초 기준 **역할 stem 5개 + music.wav + sfx.wav + bgm.wav**. bgm은 음악+SFX만이며 대사 없음. 기존 `scene.voices` 5역 전부와 `scene.bgm`을 연결하면 선택한 목소리만 제거되고 배경음향은 유지된다. music/sfx를 새로운 엔진 필드로 추가하지 않는다. 장면 썸네일 6개, 검수 믹스 6개, 전체 영상 1개도 필요하다.

박진감 있는 가족용 해양 모험 음악과 풍성한 동작 효과음을 사용하되 대사 명료도를 우선한다. 시작 기준: 대사 약 -16LUFS, 음악 10dB/SFX 6dB ducking, 80ms attack/350ms release, true peak ≤ -1dBTP. 최종값은 실제 청취 조정. 갑작스러운 강음량/공포 금지. 기존 음원의 상업 이용권도 최종 확인 필요.

실제 음성과 입모양으로 타임코드를 다시 맞춘 후만 synced 가능. 마지막 Pip을 포함해 60개 발화 각각 무음/누락/문장 일치 검사. 마이크 실권한·녹음·1/2/5인 역할 음소거·BGM 유지·실제 평가 응답·다운로드 WebM의 그림/학생·원어민 음성을 확인해야 한다. 아직 시행하지 않았다.

기존 ready 하니스는 3역/36문장을 고정하므로 향후 공개 때 기존 1/3편 검사를 유지하면서 4편의 5역/60문장 조건으로 확장해야 한다. 이번에는 ready로 바꾸지 않았다.

## 예산과 검증

사용자 승인 범위는 **영상 초벌 360크레딧**. 확인한 Kling3Turbo 720p 10초15×24 기준이며 전체 잔액3869.72 사용 승인이 아니다. 추가 참조/음성/음악/SFX/수정은 별도 비용을 먼저 보고하고 승인 필요. 미디어 담당이 생성하므로 여기서는 지출0/생성0/업로드0. 대안 모델 가격은 담당이 실제 샷 구성으로 재확인한다.

검증: 기존 회귀 **186/186**, 자산 버전 **282/282**, 4편 31개 역할 조합×60줄=**1,860 배정** 통과. Chromium에서 5역 선택·새로고침 보존·6장면·4편 coming 유지 확인. 4편/3편 모두 다른 장면 ‘바로 더빙’ 클릭 중 카드/요약 일치 확인(마이크는 pending→denied **모의 promise**, 실제 장치 녹음 아님). 실제 음향·영상·평가·내보내기 검증은 미완료.

`deploy.yml`의 main push는 자동배포를 일으킬 수 있다. 로컬 변경만 있으며 push/PR/merge/deploy 모두 실행 안 함.

## 실제 음성 타이밍 추출본 반영

`actual-voice-timing-projection.json`은 부모 제공 메타데이터의 정규화 추출본이며 원본 전체 복제본이 아니다. `python content/dubbing/dub-004/validate-audio-projection.py`로 60줄 ID/화자/영한 문장, 6×40초=240초, 구간 겹침/범위, 초↔48kHz 오디오 샘플 프레임 60쌍을 검사한다. end는 exclusive, 장면 상대값이고 전체 위치는 장면당40초를 더한다. 파일명은 다운로드 URL이 아니다. 결과 `AUDIO-METADATA-VALIDATION.json`. 음성 청취·파일 무결성·ASR 재검사·입모양·실재생 검증은 아니다. 생성/업로드/비용 지출/배포 없이 coming 유지.
