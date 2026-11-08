# A.i 말하기 격리 런타임·보상 우회 검토

PR #2178 / 이슈 #2179 후속. 로컬 기준 main `0a187d900`, PR head `80151a638`를 재조회했고 기존 브랜치에 모두 포함돼 있다. 작업 트리는 하나이며 이 스레드의 활성 에이전트도 하나다. 다른 Work 대화의 실행 상태를 전부 조회할 수 있다고 주장하지 않는다. 원격 변경을 덮어쓰거나 별도 PR을 만들지 않았다.

## 재현해 차단한 보상 우회

AI 친구의 원자적 지급 함수는 정상 대화 저장과 요청 UUID를 요구하지만, 공통 `/api/points/earn-by-rule`은 기존 규칙 테이블에 AI 친구 코드가 있으면 같은 포인트를 직접 지급할 수 있었다.

새 격리 workerd/D1 테스트에서 본인 서명 토큰과 `ai_friend_chat`만 제출해 실제 `ok:true, newBalance:2, signed:2` 응답을 재현했다. 정상 채팅은 한 번도 하지 않았다. 재현은 임시 로컬 D1에서만 했다. 운영 규칙 테이블에 해당 행이 있는지는 조회·실험하지 않았으므로 운영에서 악용됐다고 단정할 수 없다.

공통 API는 기존 소유자 인증을 먼저 거친 뒤 `FRIEND_AWARDS`의 네 코드(chat/word/voice/listen)를 403 `server_verified_award_required`로 거절한다. 지급은 기존 서버 대화 경로만 사용한다. 이미 있는 정책 상수를 재사용했고 다른 규칙과 관리자 수동 조정 경로는 변경하지 않았다.

## 운영과 분리한 실제 런타임 검사

명령: `node test-harness/speaking_runtime_harness.mjs`

설치된 Wrangler 의존성의 Miniflare/workerd를 사용한다. 새 패키지나 운영 Wrangler 설정 변경은 없다. 현재 설치 버전의 공개 `convertV4MiniflareOptions` 변환기를 사용하며, Worker rootPath를 임시 디렉터리로 지정한다.

- Wrangler 설정·`.dev.vars`·실제 Cloudflare 계정·비밀키를 읽지 않는다. 하드코딩된 로컬 fixture 서명키만 쓴다.
- D1과 KV의 이름과 저장소를 임시 디렉터리에 생성하고 종료 시 삭제한다. 서비스별 remote 바인딩과 Workers AI는 구성하지 않는다.
- 호스트 런타임의 cf 메타데이터 조회와 telemetry도 명시적으로 끈다. Worker의 전역 fetch/connect는 거부하는 outboundService로 보낸다. 검사 동안 외부 호출이 0회임을 확인하고 마지막에 차단 프로브를 한 번 실행해 실제 거부됨을 검증한다.
- 실제 보상 API 본인/타인 인증, 네 우회 코드 거부, 기존 다른 규칙 유지, 동일 요청 12개 동시 지급 1회, 서로 다른 요청 20개의 일일 한도, 원장 실패를 주입한 D1 batch 전체 롤백을 검사한다.
- 성장 기록에서 제출된 문법 100을 무시하고 미측정으로 보존하며 동일 이벤트 중복을 막는지 실제 D1에서 확인한다.
- `/__token`, `/__credit` 등 fixture 도우미는 테스트가 임시로 생성하는 Worker에만 존재한다. 제품 라우터에는 추가하지 않는다.

[Cloudflare 로컬 개발 문서](https://developers.cloudflare.com/workers/local-development/)는 로컬 실행에서도 remote 바인딩이 실제 자원에 접근할 수 있고 Workers AI에는 원격 동작이 필요하다고 설명한다. 따라서 운영 wrangler.toml로 dev를 켜는 것을 격리 검증으로 간주하지 않고, 위 독립 옵션으로 구성했다. outboundService 계약은 설치된 Miniflare 타입/README와 실제 차단 프로브로 확인했다. 이 검사는 네트워크 접근 제어를 확인한 로컬 실행이며, 모든 신뢰할 수 없는 코드를 막는 보안 샌드박스 또는 원격 staging 검증이라고 주장하지 않는다.

## 자유 대화 평가 공급원 조사 결과

[Microsoft 공식 문서](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment)는 읽기와 자유 말하기 점수를 구분하며, 문법·어휘·주제 content assessment는 SDK 1.46 이상에서 폐기됐다고 명시한다. 현재 기준 문장 읽기의 발음·유창성 기록을 자유 대화 5영역으로 바꾸지 않는다.

[Speechace Score Speech 공식 계약](https://api-docs.speechace.com/api-reference/score-speech)은 기준 문장 없는 영어 자유 발화 평가 후보로서 발음·유창성·문법·어휘·coherence를 제공한다. Premium 구독이 필요하며, 여러 척도 중 speechace_score만 0~100이다. IELTS/PTE/CEFR/TOEIC 값을 기존 100점 척도로 곧바로 사용해서는 안 된다. 짧은 응답이나 언어 불일치 등의 품질 경고도 처리해야 한다.

| 제품 요구 항목 | 공급원 검토 | 현재 처리 |
| --- | --- | --- |
| 자유 대화 발음·유창성 | 전사 텍스트가 아닌 실제 음성 평가 필요 | 제품 자유 대화 수치는 미측정 |
| 문법·어휘 | Speechace 후보 있음; 현재 저장소에 연동 없음 | 미측정 |
| 문장 구성 | 후보의 coherence는 다른 평가 개념 | 대체·복사·평균하지 않고 미측정 |
| 종합 점수 | 동일 세션·척도·정의로 다섯 항목이 검증되어야 함 | 미측정 |

문서상 지원은 실제 학생 발화의 타당성 검증과 다르다. 후보의 실제 계정/계약·음성 샘플 성공·한국 학습자/아동 평가 신뢰도는 확인하지 않았다. 새 공급자 호출이나 음성 전송은 구현·실행하지 않았다. 임의 모델 수치, 문법→문장 점수 복사, coherence→sentence 이름 바꾸기는 채택하지 않았다.

다음 공급원 연결에는 서버가 소유권과 정상 종료를 확인한 세션 음성, 음성 해시와 provider/version/rubric/locale/품질 경고 보존, 항목별 평가 정의와 표본 타당성 검증이 필요하다. 이 계약이 정해지기 전에 켜지는 점수 API나 재사용되지 않는 공급자 추상화를 추가하지 않았다. 보상은 평가 수치와 분리한 기존 참여 정책으로 유지한다.

## 검증 및 출시 상태

동시 변경 통합 전 `npm_config_cache=/tmp/mangoi-npm-cache bash test-harness/ci-gates.sh` 4종 모두 통과. 회귀 PASS 722 / 실제 수업 E2E SKIP 20 / FAIL 0, 345초. TypeScript, JS 문법 1,586조각, 정적 자산 339건도 통과했다. 로그: `/tmp/speaking-isolated-final-gates.log`.

추가 하니스는 전체 게이트에서도 실행됐다. 개별 결과는 `/tmp/speaking-isolated-runtime.log`, 기존 인증·성장·실패 모델·보상 검사는 `/tmp/speaking-security-rewards.log`에 있다. 우회 수정 전 로컬 재현 출력은 `/tmp/speaking-award-bypass-before.log`에 있다. 제품 화면 변경은 없어 앞선 브라우저 검증을 재실행하지 않았다. 90초 검사 제한과 기존 검사 목록을 완화하지 않았다.

 로컬 검증은 원격 staging·실제 기기·실사용 완료를 뜻하지 않는다. 평가 정의와 공급자 실측, 격리 원격 환경, 리뷰 조건이 남아 있어 원격 push·병합·운영 배포를 하지 않았다.

## 추가 원격 변경 통합

최종 확인 중 PR head에 `dec3d7471`과 `80151a638`이 추가돼 다시 병합했다. 종료 후 검증 교정의 학부모 기록과 주간 활동 그래프를 보존했다. 겹친 index.ts에서는 기존 핵심 교정 3개 제한을 유지하고, 학부모 교정 기록 블록은 인증 게이트 뒤에서 한 번만 실행되게 통합했다.

주간 활동은 기존 first_reply_at의 일별 기록이며 실력·완료·고유 단어 수가 아니다. 새 인증 성장 기록과 같은 측정 근거라고 간주하거나 보상에 사용하지 않는다. 관련 25개 테스트와 교정 기록 게이트 13건이 통과했다. 실제 parent/monthly HTML 8개 크기 조합 검사에도 주간 활동 fixture와 7개 행·320px 넘침 검증을 추가해 통과했다 (`/tmp/speaking-latest-parent-browser.log`).

## 동시 변경 통합 후 최종 결과

`npm_config_cache=/tmp/mangoi-npm-cache bash test-harness/ci-gates.sh` 4종 전부 통과. PASS 723 / E2E SKIP 20 / FAIL 0, 334초. TypeScript, JS 문법 1,586조각, 자산 버전 339건 모두 통과. 로그 `/tmp/speaking-concurrent-final-gates.log`. 이 결과는 main `0a187d900` 및 PR `80151a638`까지 통합한 제품 코드 기준이다. 실제 기기·원격 staging·유료 평가 공급자 성공으로 해석하지 않는다. 원격 push·병합·운영 배포는 하지 않았다.
