# 🥚 아바타 키우기 학습게임 — 기획안 (Avatar Growth Learning Game — Plan)

작성일 2026-08-03 · 대상: 학생 게임 허브(`student-games.html`) 신규 1종
파일(예정): `cloudflare-deploy/public/student-game-avatar.html`

---

## 0. 한 줄 정의

> **말할수록 아바타가 자란다.** 영어·중국어 미션을 하면 EXP가 오르고,
> 일정 EXP마다 아바타가 **영화 같은 진화 컷신**과 함께 다음 단계로 변신하는 육성형 학습게임.

기존 게임 12종은 전부 **세션형**(들어가서 이기고 나온다). 이 게임만 **연속형**(어제의 결과가 오늘 화면에 남아 있다)입니다.
→ 재방문 동기(리텐션)를 만드는 것이 이 게임의 유일한 존재 이유입니다.

---

## 1. ⛔ 먼저 확정한 기술 제약 (계획의 뼈대를 결정함)

조사 결과, **서버 API를 새로 만들 수 없습니다.**

| 사실 | 근거 |
|---|---|
| 새 API 경로는 `src/index.ts` 인증 게이트(L887~1365)에 **반드시 등록**해야 동작 | 미등록 시 `index.html` 로 fallthrough → CF Assets가 POST에 **405** |
| `src/index.ts` 는 **공동 금지구역(A 담당)** | CLAUDE.md §4-2 |
| `/api/vocab/*` 는 prefix 위임이지만 게이트는 **exact path 나열** | `index.ts:1107~1175` — `/api/vocab/avatar` 같은 신규 경로는 통과 못 함 |

**결론 — Phase 1은 서버 코드 0줄 변경.** 기존에 이미 게이트에 등록된 API만 재사용합니다.
(신규 테이블·전용 API는 Phase 3에서 A와 협의)

### 재사용 가능한 기존 API (전부 게이트 등록 확인됨)

| 용도 | 엔드포인트 | 비고 |
|---|---|---|
| 맞춤 출제(문장·단어) | `GET /api/games/vocab?user_id=` | 배정 교재 기반. `?textbook=` 강제 가능 |
| 학습기록 누적 | `POST /api/games/progress` | 오답/정답 → `game_progress` |
| 코인 적립·조회 | `POST /api/games/coins` / `GET /api/games/leaderboard` | 서버측 누적 카운터 |
| 포인트 잔액 | `GET /api/points/balance` | 실제 포인트 |
| 단어 SRS | `/api/vocab/list·due·review·stats` | 간격반복 그대로 활용 |
| 출석 스트릭 | `GET /api/streak/status` | 연속 학습일 |
| 배지 | `GET /api/badges/list` | 진화 조건에 활용 |
| 말하기 채점 | `POST /api/voice/transcribe` · `/api/voice/coach` | 마이크 미션의 핵심 |
| 영어 TTS | `POST /api/voice/tts` | ⚠️ **영어만**. ko·zh는 깨진 음성(기존 확인 사항) |

공용 프론트 헬퍼도 그대로 씁니다: `js/game-vocab.js`, `js/game-tts.js`, `js/mangoi-voice-input.js`
→ **이 3개 파일은 수정하지 않습니다.** (수정 시 `?v=` 버전 가드 하니스가 참조 HTML 전부에서 FAIL)

---

## 2. EXP는 "지어내지 않는다" — 데이터 출처 설계

과거 사고 사례(학생홈 평가표가 미구현 API를 조용히 샘플로 폴백해 **가짜 수치를 본인 기록처럼** 표시)를 반복하지 않기 위해,
아바타의 성장 수치는 **전부 서버에 실재하는 값에서 유도**합니다.

```
EXP_total = (누적 코인 × 1) + (단어 복습 정답수 × 3) + (말하기 통과 미션 × 10) + (연속출석일 × 20)
            └ /api/games/leaderboard   └ /api/vocab/stats   └ 세션 내 판정→coins  └ /api/streak/status
```

- **로그인 학생**: 위 서버값으로 계산. 기기를 바꿔도 같은 단계에서 이어짐.
- **비로그인(게스트)**: 화면에 **"체험 모드 — 기록이 저장되지 않아요 / Guest mode — progress is not saved"** 를 상시 표기.
  샘플 수치를 본인 기록인 것처럼 보여주지 않습니다.
- **서버 조회 실패 시**: 숫자를 0으로 위조하지 않고 `—` 로 표시 + "지금은 기록을 불러오지 못했어요" 안내.

**아바타 외형 선택(종족·이름·복장)만** localStorage에 저장합니다.
→ 기기를 바꾸면 외형이 초기화되는 한계는 **화면에 명시**하고, Phase 3에서 서버 저장으로 승격합니다.

---

## 3. 게임 구조

### 3-1. 아바타 종족 (3종 × 5단계 = 15 폼)

| 종족 | 콘셉트 | 5단계 |
|---|---|---|
| 🐼 **사이버 셰프 판다** | 요리 = 문장 조립 | 알 → 견습 → 셰프 → 마스터셰프 → 전설 |
| 🚀 **탐험가 여우** | 우주 탐사 = 단어 발견 | 알 → 훈련생 → 파일럿 → 캡틴 → 사령관 |
| 🐉 **수호 드래곤** | 마법 = 발음 주문 | 알 → 새끼 → 비행 → 수호자 → 고룡 |

- 학생이 최초 1회 선택. 종족 변경은 언제든 가능하되 **EXP는 유지**(선택을 후회하게 만들지 않음).
- 단계당 필요 EXP: `0 / 150 / 500 / 1200 / 2500` (하루 성실히 = 약 80~150 EXP → 첫 진화를 **2일 안에** 체감)

### 3-2. 진화 컷신 (Evolution Cutscene)

단계 도달 시 전체화면 컷신 재생 → 진화 후 폼으로 복귀.

**2단 재생 전략**
1. `/video/avatar/{species}-{tier}.mp4` 가 있으면 **재생** (Higgsfield 생성물)
2. 없으면 **canvas + rAF 시네마틱**으로 폴백 (파티클 폭발 + 줌 + 실루엣 전환)

> ⚠️ 컷신은 **반드시 rAF**로 구동합니다. CSS transition/keyframes는 백그라운드 탭·저전력에서 멈춰
> `opacity:0` 요소가 영영 안 보이는 사고가 이 저장소에서 이미 발생했습니다.

**Higgsfield 프롬프트 생성 파이프라인**
- 오프라인 빌드 스크립트(`build-avatar-cutscenes.mjs`)가 15개 폼의 프롬프트를 **템플릿에서 생성** → 영상 생성 → `public/video/avatar/` 에 저장.
- 런타임에 프롬프트를 만들지 않습니다(비용·지연). 기존 space-monster 에셋 파이프라인과 동일한 방식.
- 프롬프트 템플릿 예:
  ```
  Cinematic 3D animation, dramatic rim lighting, a {species_desc} {action} with
  {color} energy particles swirling, high-speed camera push-in, Unreal Engine 5
  render style, 4k, hyper-realistic texture, transparent-friendly dark background,
  3 seconds, no text, no logo
  ```
- **비용 발생 작업**이므로 사장님 승인 후 실행. 승인 전에는 canvas 폴백만으로 완전히 동작합니다.

### 3-3. 에너지 게이지 — "손실 회피"를 쓰되, 아이에게 벌을 주지 않는다

원 요청의 Hunger/Energy는 리텐션 장치로 유효하지만, **초등~중등 학습 제품**이라 그대로 넣으면
"안 하면 내 캐릭터가 죽는다"는 압박이 됩니다. 다음과 같이 **수위를 조절**해 넣습니다.

| 넣는 것 | 빼는 것 |
|---|---|
| 24시간마다 에너지 감소 → 아바타가 **졸린 표정**(zzz) | 죽음·소멸·강등 **없음** |
| 미션 1개만 하면 **즉시 100% 회복** | 며칠 방치해도 EXP·단계 **차감 없음** |
| "너를 기다리고 있었어! / I've been waiting for you!" 재회 대사 | 죄책감 유발 문구 없음 |

→ 제품철학 7원칙(학생·학부모 사용성) 및 "학생향 문구=희망톤" 지시에 부합.

### 3-4. 학습 미션 4종 (여기가 '배우기'의 본체)

| 미션 | 입력 | 판정 | 보상 |
|---|---|---|---|
| 🎤 **주문 외치기** | 마이크(영어/중국어 문장) | `/api/voice/transcribe` + `/api/voice/coach` | +10 EXP, 아바타 액션 |
| 🍳 **재료 조립** | 단어를 어순대로 배치 | 클라이언트 정답 대조 | +6 EXP |
| 🧩 **뜻 맞히기** | 4지선다 (학생 단어장) | `/api/vocab/review` 로 SRS 반영 | +3 EXP |
| 👂 **듣고 고르기** | TTS 듣고 선택 (**영어만**) | 클라이언트 | +4 EXP |

성공 시 아바타가 **즉시 반응**(칼질·주문시전·환호 + 파티클), 실패 시 **격려 후 즉시 재시도**
— "아깝다! 한 번 더 외쳐보자 / So close! Cast it one more time" (희망톤, 실패를 조롱하지 않음)

### 3-5. 주간 보스 레이드 (경쟁 요소)

- 주 1회, 제한시간 90초 안에 문장 N개를 말하기/입력으로 처리해 보스 HP를 깎음.
- 보상 = **+30 EXP**(미션 하나의 3~10배) → 레이드를 하면 진화가 눈에 띄게 빨라진다.
  ⚠️ 기획 초안에는 "진화 재료" 아이템이었으나 **재료 인벤토리는 만들지 않았다.**
  없는 보상을 화면에서 약속하면 안 되므로 문구를 EXP 로 정정했다(2026-08-03).
- 주간 기회는 **서버 저장에 성공했을 때만** 소진시킨다. 먼저 소진 처리하면
  저장이 실패한 학생은 EXP 도 못 받고 주 1회뿐인 보스도 잃는다.
- 랭킹은 기존 `/api/games/leaderboard` 재사용 (신규 API 불필요).
- ⚠️ 반 단위/글로벌 리그는 **학생 실명 노출 위험** → 닉네임만, 기존 리더보드가 쓰는 마스킹 규칙 그대로 따름.

---

## 4. 단계별 실행 계획

### Phase 1 — 게임 본체 (서버 변경 0, 내가 단독 진행 가능) ⬅️ 먼저 여기까지
1. `public/student-game-avatar.html` 신규 (자체 완결 1파일, 목표 70~90KB — 기존 게임과 동급)
2. 종족 선택 + 5단계 성장 + 에너지 게이지 + 미션 4종
3. 진화 컷신 = **canvas rAF 폴백판**
4. EXP = 실제 서버값 유도 / 게스트는 체험 모드 명시
5. `student-games.html` 허브에 카드 1장 추가 (`HUB_GAMES` 배열 맨 앞 부근)
6. 한/영 병기 + 이모지 Unicode 13 이하만 사용(Win10 두부 방지)

### Phase 2 — Higgsfield 컷신 영상 (비용 승인 필요)
7. `build-avatar-cutscenes.mjs` — 15개 프롬프트 생성 → 영상 생성 → `public/video/avatar/`
8. 컷신 플레이어가 영상 우선 재생하도록 전환 (폴백 유지)
9. 용량 관리: 컷신당 3초·2~4MB 목표, 첫 진입 시 프리로드 금지(모바일 데이터)

### Phase 3 — 서버 영속화 (A와 협의 필요)
10. `student_avatar` 테이블 + `/api/avatar/state` → `src/index.ts` 게이트 등록이 필요하므로 **A 담당자 승인·작업 필수**
11. 이때 외형 선택이 기기 간 동기화됨 / 학부모 리포트·강사 화면에 아바타 노출 가능

### 검증 (CLAUDE.md §4-4)
- `cd cloudflare-deploy && npx tsc --noEmit` (Phase 1은 TS 무변경이지만 회귀 확인)
- `node test-harness/run.mjs --fast`
- 실제 브라우저: 데스크톱 + 모바일(390px) 확인, 마이크 권한 흐름 확인
- 배포 후 `BUILD_STAMP` 로 라이브 반영 확인

---

## 5. ⚠️ 리스크 및 사전 고지

| 리스크 | 대응 |
|---|---|
| **병행 세션 미커밋 작업이 같은 폴더에 있음** (`/teacher` 라우팅 등, 현재 `git status` 확인됨) | 배포 전 `git status` + mtime 재확인. deploy.ps1은 `public/`·`src/` 를 통째로 올림 |
| 외형이 기기 간 동기화 안 됨(Phase 1) | 화면에 명시. Phase 3에서 해소 |
| 마이크 권한 거부 학생 | 말하기 미션을 **선택**으로. 나머지 3종만으로도 진화 가능 |
| 중국어 TTS 깨짐 | 듣기 미션은 **영어만** 제공. 중국어는 텍스트 미션으로 |
| 컷신 영상 용량 → 필리핀·저사양 회선 | 영상은 지연 로드 + 폴백 우선. 저사양 감지 시 canvas 컷신 고정 |
| 게임이 13번째가 되어 허브가 복잡해짐 | 카드 위치·문구는 사장님 확인 후 확정 |

---

## 6. 확정된 결정 (2026-08-03, 사장님 확인)

1. **아바타 종족 = 판다·여우·드래곤 + 🐶강아지 4종** (각 5단계, 총 20폼). 종족 변경 시 EXP 유지.
   (강아지는 작업 중 추가 지시 — 용감한 히어로 강아지 / Hero Pup)
2. **Higgsfield 컷신 = 우선 4개 생성 완료.** 나머지 12개는 canvas 폴백.
3. **허브 노출 = '우주 괴물 사냥' 다음 2번째 자리.** (맨 앞 고정은 사장님 지시 사항이므로 유지)

---

## 7. 실행 결과 (2026-08-03)

### Phase 1 — 완료
`public/student-game-avatar.html` · 허브 카드 등록 · 서버 코드 0줄 변경.

### Phase 2 — 컷신 영상 4개 완료 (1단계 진화분)

| 파일 | 종족 | 용량 |
|---|---|---|
| `public/video/avatar/panda-1.mp4` | 사이버 셰프 판다 | 311KB |
| `public/video/avatar/fox-1.mp4` | 탐험가 여우 | 439KB |
| `public/video/avatar/dragon-1.mp4` | 수호 드래곤 | 336KB |
| `public/video/avatar/dog-1.mp4` | 히어로 강아지 | 443KB |

생성 경로: **스틸 먼저(nano_banana_pro) → 그 스틸을 start_image 로 영상(kling3_0_turbo, 3초, 720p)**.
바로 text-to-video 로 만들면 종족 생김새가 매번 달라져서 룩을 고정할 수 없다.
소요 크레딧 약 30 (이미지 6장 12 + 영상 4편 18). 프롬프트 전체는 `cloudflare-deploy/build-avatar-cutscenes.mjs`.

**압축 필수** — 원본 3~4MB → CRF30 재인코딩으로 0.3~0.45MB (총 13.8MB → 1.7MB, 8배).
폰 화면에서 화질 차이가 보이지 않는다. 원본은 `public/` 밖에 보관한다(안에 두면 배포에 실려 나감).

### 검증
- `npx tsc --noEmit` 0오류 · `test-harness/run.mjs --fast` **55 PASS / 0 FAIL**
- 아바타 그리기: **4종족 × 5단계 × 5기분 × 6시각 = 600조합** Node 단독 구동 — 예외·음수 반지름·NaN 좌표 없음
- 미션 4종 · 레이드 · 진화 컷신 실브라우저 클릭 검증 · 모바일 375px 가로 넘침 없음

### 남은 것
- 컷신 영상 12개 (2~4단계 진화분) — `node cloudflare-deploy/build-avatar-cutscenes.mjs --missing` 로 프롬프트 확인
- 아직 **커밋·배포 안 함**
