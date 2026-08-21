# 📄 직원 배포용 안내문

직원·강사에게 **그대로 보내는** 한 장짜리 안내문입니다. 인쇄해서 붙여도 되고, 카톡으로 파일을 보내도 됩니다.

| 파일 | 누구에게 |
|---|---|
| [전자결재_사용법_한국어.pdf](전자결재_사용법_한국어.pdf) | 한국 본사 직원 · 한국어를 읽는 강사 |
| [전자결재_사용법_영어.pdf](전자결재_사용법_영어.pdf) | 필리핀 매니저 · 강사 |

두 장 모두 **A4 한 장**에 맞춰져 있습니다. 내용은 같고 언어만 다릅니다.

---

## 내용을 고치려면

`generate.py` 안의 `KO` · `EN` 두 덩어리만 고치면 됩니다(제목·표·요령·주의사항이 전부 거기 있습니다).
그 다음 아래처럼 다시 만듭니다.

```bash
# ① 한글 글꼴 — 저장소에 넣지 않습니다(10MB). npm 에서 받아 씁니다.
mkdir -p fonts && cd fonts && npm pack @fontsource/noto-sans-kr && tar xzf fontsource-noto-sans-kr-*.tgz && cd ..

# ② HTML 만들기 (fonts/ 가 있는 폴더에서 실행해야 합니다 — 글꼴 경로가 상대경로입니다)
python3 generate.py

# ③ PDF 로 인쇄
CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome   # 각자 크롬 경로
for l in ko en; do
  "$CHROME" --headless --no-sandbox --no-pdf-header-footer \
    --print-to-pdf=guide_$l.pdf "file://$PWD/guide_$l.html"
done
```

### ⚠️ 고칠 때 주의

- **A4 한 장을 넘기면 안 됩니다.** 넘친 부분은 경고 없이 다음 장으로 밀립니다 —
  만든 뒤 반드시 쪽수를 확인하세요(1쪽이어야 합니다).
- **한글 글꼴이 없으면 글자가 네모(두부)로 나옵니다.** 이 컨테이너에는 한글 글꼴이 없어서
  위 ① 단계가 필요합니다. 구글 폰트 주소는 프록시에 막혀 있으니 **npm 으로 받으세요.**
- 화면(`/work`·관리자 「보고서 양식」)이 바뀌면 **이 안내문도 함께 고쳐 주세요.**
  안 맞는 안내문은 없는 것보다 나쁩니다.

## 안내문에 적힌 내용의 정본

| 안내문의 내용 | 코드의 정본 |
|---|---|
| 분류 7종 · 답변 기한 · 강사가 올릴 수 있는 분류 | `cloudflare-deploy/src/approval-policy.ts` 의 `TYPES` |
| 2단계로 넘어가는 금액 (PHP 5,000 · KRW 120,000) | 같은 파일 `TWO_STEP_THRESHOLD` |
| 기한 초과 재알림 · 이틀 뒤 경영진 승격 | `cloudflare-deploy/src/index.ts` 의 결재 마감 관리(15분마다) |
| 「이 양식으로 결재 올리기」 딥링크 | `public/js/adm-r17.js` 의 `FORM_TO_TYPE` · `public/work.html` 의 `openWantedType()` |
