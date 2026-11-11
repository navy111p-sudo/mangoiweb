# A.i 말하기 독립 리뷰와 비개인 합성 음성 검증

기준: main `0a187d900`, PR #2178 `80151a638`와 로컬 보강을 대조했다. 변경 없는 원격 스냅샷을 확인했고 작업 트리는 하나다. 다른 Work 대화의 실행 상태 전체를 조회할 수 있다고 주장하지 않는다.

## 독립 리뷰에서 수정한 입력 검증

기존 `wavSeconds`는 44바이트 고정 헤더를 가정하고 `(전체 바이트 - 44) / 헤더 byteRate`로 계산했다. 실제 오디오 청크의 형식·길이와 byteRate 정합성을 확인하지 않았다. 따라서 메타데이터를 음성 길이로 더하거나, 허위 byteRate·잘린 데이터·다른 PCM 형식을 유효 입력처럼 처리할 수 있었다.

공유 Azure 평가 모듈에서 RIFF 전체 크기, fmt/data 청크 경계와 패딩, PCM 16kHz/16bit/mono 및 byteRate/blockAlign 정합성을 확인한다. 메타데이터 청크는 제외하며 빈 데이터·잘린 청크·중복 fmt/data·비지원 형식은 null로 거부한다. 기존 평가 요청은 이 결과를 확인하므로 부적합한 입력은 Azure 평가 호출 전 `not_wav`, 초과 길이는 기존 `too_long`으로 끝난다. AI 친구의 낱말 발음 교정도 같은 모듈을 재사용한다.

[Microsoft REST short-audio 공식 문서](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-speech-to-text-short)의 WAV 계약은 PCM 16kHz mono이며 현재 제품 요청 헤더와 일치한다. 입력 검증을 통과한 것이 발음이나 자유 대화 능력 평가를 통과했다는 뜻은 아니다. 음성 길이 제한과 기존 fallback 동작은 유지한다.

함께 발견한 초기 반환 경로의 타이머도 수정했다. 짧은 키를 거부하기 전에 8초 요청 타이머가 생기던 순서를 바꿔, 구성 오류일 때는 타이머를 만들지 않는다. 실제 키는 읽거나 출력하지 않았다.

## 실제 오디오 바이트로 수행한 로컬 검사

실인물·미성년자 음성을 사용하지 않았다. 로컬 ffmpeg의 libflite로 공개적으로 의미 없는 테스트 문장을 합성했다. 네트워크 TTS 서비스나 운영 음성 데이터는 사용하지 않았다.

```sh
ffmpeg -hide_banner -loglevel error -f lavfi -i "flite=text='This recording was generated locally for an isolated audio test.':voice=slt" -ar 16000 -ac 1 -c:a pcm_s16le -y /tmp/speaking-synthetic-adult.wav
ffprobe -v error -show_entries stream=sample_rate,channels,bits_per_sample -show_entries format=duration -of json /tmp/speaking-synthetic-adult.wav
node test-harness/speaking_audio_input_harness.mjs --audio /tmp/speaking-synthetic-adult.wav --expected-seconds 4
```

이 환경의 결과: 128,078바이트, 16kHz/mono/16bit, ffprobe 길이 4.000000초. 이전 고정 위치 계산은 4.0010625초였고 새 파서는 실제 data 청크 기준 4초로 외부 디코더와 일치했다. libflite/버전이 다르면 생성 길이가 다를 수 있으므로 `--expected-seconds`에는 해당 파일의 ffprobe 결과를 사용한다. 파일명은 합성 fixture 이름이며 실제 사람의 연령을 의미하지 않는다.

새 하니스는 임시 번들에서 실제 평가 모듈을 실행한다. 기본 실행은 패키지 추가 없이 PCM fixture를 사용하며, 손상·메타데이터·비지원 형식·초과 길이 검사를 공통 게이트에 포함한다. 수동 `--audio` 옵션으로 위 실제 합성 WAV도 검사했다. 외부 fetch는 실패하도록 가로채고 부적합 입력의 네트워크 호출이 0회임을 검증한다. 유효 합성 WAV의 라이브 평가 호출은 비어 있는 환경에서 `no_key`로 종료되는 것도 확인했다. 짧은 키에 대해 요청 타이머가 생성되지 않는지 실제 함수 호출로 검사한다.

기존 성장·보상 API의 음성 fixture는 실제 규격의 PCM 헤더를 갖도록 수정했다. 허술한 헤더를 허용하도록 제품 검증을 완화하지 않았다. Azure 회귀 85건과 기존 인증·보상·성장 기록 하니스도 통과했다.

## 완료 범위와 출시 차단

완료한 것은 실제 합성 오디오의 형식·길이 검증 및 잘못된 입력의 평가 호출 차단이다. 실제 Azure/Speechace의 발음·유창성·문법 평가 성공은 수행하지 않았다. 검증된 비운영 평가 계정·자격증명·엔드포인트가 준비돼 있다는 근거가 없고 운영 자원을 시험에 사용하지 말라는 지시가 있으므로 기존 운영 키를 가져오거나 운영 서비스에 샘플을 보내지 않았다.

자유 대화 5영역은 계속 미측정이다. 합성 음성의 길이를 실제 학습자 발음 점수나 모델 신뢰도 근거로 사용하지 않았다. 실제 음성 평가의 다음 단계에는 격리 공급자 계정, 정의된 평가 항목과 척도, 명시적으로 사용 가능한 비개인/동의된 평가 표본 및 타당성 검증이 필요하다. 원격 staging과 리뷰·실기기 확인도 남아 있다. 이 조건이 충족되지 않아 원격 push·병합·운영 배포는 하지 않았다.

## 최종 검증

`npm_config_cache=/tmp/mangoi-npm-cache bash test-harness/ci-gates.sh` 4종 전부 통과. 회귀 PASS 724 / 실제 수업 E2E SKIP 20 / FAIL 0, 353초. TypeScript, JS 문법 1,586조각, 자산 버전 339건 모두 통과했다. `/tmp/speaking-audio-final-gates.log`에 전체 결과가 있다. 합성 WAV 실측과 no-key 차단은 `/tmp/speaking-real-audio-input.log`, 기존 Azure 회귀는 `/tmp/speaking-audio-azure-regression.log`, 인증·보상·성장 기록 검사는 `/tmp/speaking-audio-growth-regression.log`에 있다.

제품 UI 변경은 없으므로 기존 브라우저 매트릭스를 다시 돌리지는 않았다. 실제 기기·실제 평가 공급자·원격 staging 검증은 완료 항목에 포함하지 않았다.

마지막 원격 확인에서 `42e936283`의 별도 결과/평가 구현이 추가됐다. 위 724건 결과에는 포함되지 않는다. [추가 원격 독립 리뷰](261108_speaking_remote_review.md)에 수치 측정 정책과 보상 귀속 계약의 재현된 차단 사유를 남겼으며, 이 원격 변경은 현재 브랜치에 합치지 않았다.
