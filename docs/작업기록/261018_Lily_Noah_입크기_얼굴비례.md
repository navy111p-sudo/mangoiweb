# Lily·Noah 입이 얼굴에 비해 큼 → 얼굴 확대 + 입 0.9배 (2026-10-18)

**제보**: 웜업 카드 Lily 「입이 얼굴에 비해 좀 큰 것 같아. 얼굴을 조금 더 크게 해서 비례에 맞게 · 아주 자연스럽게」, 이어서 「lily와 noah가 문제야. 다른 사람들은 괜찮아.」

## 한 일
1. **입만 0.9배** — `tools/shrink-mouth.py`(설정 `tools/mouth-scale.json`, 보고서 `tools/mouth-scale-report.json`).
   입 중심 둘레 타원 안에서만 매끄러운 «오므리기» 변형(가운데 평탄 구간은 균일 0.9배, 가장자리는 0으로 섞임).
   - 같은 변형을 통짜 얼굴 3장(closed·mid·wide)과 입모양 9칸에 똑같이 적용 → 모든 입모양이 그대로 맞물림.
   - 타원이 입 칸(PRECISION rect) 안에 있어 **칸 테두리 0 변화**(이음매 없음) · 타원 밖은 인코딩 전 0 변화.
   - 입력은 주름 제거 도구 출력(사슬) — 다시 돌려도 두 번 줄지 않음(sourceRev 8e2321d 에서 시작).
   - **Noah 는 입꼬리가 칸 가장자리까지 닿아** 칸을 좌우로 넓힘: `x:244,w:154` → `x:214,w:214`. 넓힌 칸은 원래 칸 + 주변 바탕으로 다시 만듦. `build-viseme-transitions.py` 의 noah 크기도 함께.
   - 중간 입모양(transitions) 297장은 `build-viseme-transitions.py lily noah` 로 다시 만듦(opencv 필요).
2. **얼굴 1.11배** — `CHARACTERS.lily/noah.rect = {l:.05,t:.02,r:.95,b:.92}`(폭·높이 같은 비율이라 카드 비율 0.8 유지). 화면 속 입 크기는 그대로, 얼굴만 커짐.
3. 그림 주소 `?v=2 → ?v=3`(mango-avatar.js · warmup-photo-icons.js — ai-class.html 은 같은 날 #1602 로 Emma 가 되어 해당 없음), 스크립트 `?v=` 올림.

## 잰 것
- 입 폭(픽셀): Lily 기본 64→58, 크게 벌림 83→75 · Noah 기본 101→92, 크게 벌림 111→100 (약 −9~10%).
- 로컬 서버 + 크로미움으로 warmup.html 실제 캔버스 렌더 확인.
- 회귀(`--fast`) 새 실패 0건(실패 26건은 origin/main 에서도 동일한 환경 사유).

## 하니스
- 신설 `avatar_mouth_scale_harness.mjs` — sha 사슬·입 폭 비율·테두리 0 변화·PRECISION/transitions 일치·확대는 lily·noah 에만.
- `avatar_smile_folds`: 사슬(주름제거 → 입줄이기) 허용, PRECISION rect 는 넓힌 칸과 대조.
- `avatar_head_sway`·`avatar_living_face`: «크롭 없음» 가정을 지우고 CHARACTERS rect 를 읽어 좌표 계산.

## 남은 것(이번에 안 고침)
- Noah «오»(F) 입모양 칸 주변의 옅은 붉은 사각 얼룩은 **원래 그림부터** 있던 것(이번 변경과 무관).
- 소리·움직임은 사람이 실제 화면에서 한 번 봐야 확정.

## 후속 — «오» 입모양 정리 + Noah G·H (같은 날)
사장님: 「Noah 의 «오» 입모양 주변에 옅은 붉은 사각 얼룩 … 이것도 수정해줘」·「특히 Noah랑 Lily가 o 발음 할때 가장 어색해. 입가에 주름도 많아지고 이것을 최소화」.

- **얼룩의 정체(잰 것)**: 입모양은 원본 얼굴 위에 «생성한 입 타원» 을 붙여 만든 것인데(`build-viseme-poses.py`), 그 타원 안 피부색이 원본과 달랐다. 저주파 피부색 차 Noah E 21.2 · F 23.7(회색 단계).
- **`tools/clean-o-mouths.py`**(설정 `tools/o-mouth-clean.json`, 보고서 `tools/o-mouth-clean-report.json`): E·F 칸만 — ① 타원 안 피부색을 원본 얼굴의 저주파 색으로 맞춤(가장자리로 갈수록 0, 코·피부 결은 그대로) ② 입술 둘레 고리에서 중간 주파수(주름)만 부드럽게. 입술·칸 테두리는 0 변화. 결과: 피부색 차 Lily 20.5→9.4 · 17.7→7.5 / Noah 21.2→8.5 · 23.7→9.5, 주름 지표 Lily 3.59→3.28 · 3.72→3.13 / Noah 2.60→2.28 · 3.44→2.43.
- **새로 찾은 실서비스 결함**: Noah 의 G(F/V)·H(L) 칸이 **검은 타원**으로 들어가 있었다(README 는 «시각 검토 통과» 라 적혀 있었음 — 생성 결과의 정합이 실패한 것으로 추정). 그 소리를 낼 때와 그 칸으로 가는 중간 그림에서 입 자리가 검게 보였다. 새 그림을 만들기 전까지 B·C 로 대신(README 의 처음 방식).
- 버렸던 방법: ① 쉬는 입(X) 칸을 기준으로 메우기 — 쉬는 입의 입꼬리 그림자가 점으로 남음 ② 칸 전체 흐리기 — 코까지 흐려져 입모양이 바뀔 때마다 코가 번쩍임 ③ 원본 얼굴로 «통째로» 맞추기 — 원본의 웃는 입가 그림자가 오 입모양에 옮겨 붙음.
- 중간 그림 재생성(`build-viseme-transitions.py lily noah`) · 모든 lily/noah 주소 `?v=4` · `mango-avatar.js?v=34` · `warmup-photo-icons.js?v=5`.
- 감시: `avatar_mouth_scale_harness` ⑤절(사슬·칸별 결과) · `avatar_smile_folds_harness` 사슬 한 칸 추가. 묶음 그림을 되돌리면 실제로 FAIL.
- ⚠️ 움직이는 모습은 사람이 화면에서 한 번 봐야 확정.
