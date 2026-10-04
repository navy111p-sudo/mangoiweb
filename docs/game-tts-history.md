# Shared TTS maintenance history

The following historical comments were moved out of the browser-delivered module to reduce its blocking source payload. They are retained verbatim for maintenance context, not as newly verified provider behavior. Current code and focused tests remain authoritative. The module keeps concise safety comments beside the corresponding code. No executable statements or script-loading order changed.

## Source note 1

```text
/* ════════════════════════════════════════════════════════════════════════
 *  🔊 MangoiTTS — 게임 공용 원어민 발음 모듈 (영어/중국어 지원)
 *  1순위: 사이트 클라우드 TTS(POST /api/voice/tts)
 *         · 영어(en) → Deepgram Aura-1 → MeloTTS(en)
 *         · 중국어(zh) → MeloTTS(zh) 원어민 만다린
 *  2순위(폴백): 브라우저 speechSynthesis — 언어별 자연스러운 보이스 점수화 선택.
 *  사용: MangoiTTS.setLang('zh'|'en');  MangoiTTS.speak('你好');  MangoiTTS.prefetch(text)
 *        rate(재생 속도, 1=보통)는 클라우드 재생엔 playbackRate 로 적용.
 * ════════════════════════════════════════════════════════════════════════ */
```

## Source note 2

```text
/* 🔢 «지금 몇 번째 발화인가» — stop()·setSpeaker()·setLang()·새 speak() 가 올린다.
     아래 speak() 은 서버가 한 번 실패하면 400ms 뒤 다시 물어보는데, 그 사이에
     화면이 stop() 을 부르거나(마이크를 켜기 직전!) 다음 문장을 시작하면
     늦게 도착한 소리가 그 위로 재생된다. 그러면 «AI 목소리가 나오는 채로 마이크가
     열려 음성인식이 AI 말을 받아 적던» 2026-07-23 사고가 그대로 되살아난다.
     그래서 늦게 온 응답은 이 번호를 보고 스스로 물러난다. */
```

## Source note 3

```text
// 현재 발음 언어: 'en'(기본) | 'zh'(중국어). localStorage 로 페이지 간 공유.
```

## Source note 4

```text
// 🎙 서버 화자(Aura-2 speaker) — setSpeaker('orion'|'asteria'|null). null=서버 기본(여성 asteria).
```

## Source note 5

```text
// 🙊 이모지 제거 — TTS 가 이모지를 "orange" "smiling face" 처럼 읽어버리는 문제 방지 (26-07-21)
```

## Source note 6

```text
//   일반 문장부호(따옴표·물음표 등)는 건드리지 않도록 픽토그램 영역만 제거한다.
```

## Source note 7

```text
/* ── 폴백용 브라우저 보이스 선택 (자연스러운 음성 우선, 로봇 음성 회피) ── */
```

## Source note 8

```text
// 중국어(만다린) 보이스 점수화
```

## Source note 9

```text
// 영어 보이스 점수화
```

## Source note 10

```text
// 🎙 성별 힌트(브라우저 폴백에서도 남/여 선택 반영 — 확실할 때만 가감)
```

## Source note 11

```text
// A watchdog must never open the microphone over a still-speaking voice.
```

## Source note 12

```text
/* ── 클라우드 원어민 TTS ── */
```

## Source note 13

```text
// 언어·화자별 캐시 키
```

## Source note 14

```text
// 키·요청 화자는 «지금» 값으로 고정
```

## Source note 15

```text
// A never-settling request must not hold an automatic turn forever.
```

## Source note 16

```text
// 뉴런 소진(429·503)은 다시 물어도 같은 답이다 — 재시도하지 않는다
```

## Source note 17

```text
/* 🎙️ 서버가 «다른 화자» 로 대체한 음성은 캐시하지 않는다.
           Aura-2 가 한 번 흔들리면 서버는 Aura-1 로 떨어지는데 화자가 바뀐다
           (Noah aries → orion). 그것을 요청 화자 키로 캐시하면 그 문장은
           세션 내내 남의 목소리로 굳는다 — 서버 R2 캐시가 «실제로 쓴 화자» 키만
           쓰는 것과 같은 이유다(2026-08-31). 헤더가 없으면(옛 배포·중국어 경로)
           판정하지 않고 예전처럼 캐시한다 — 모르는 것을 단정하지 않는다. */
```

## Source note 18

```text
// Long audio is allowed to finish. Stalled playback is stopped before settling.
```

## Source note 19

```text
// speak(text, rate?, onend?) — onend 는 재생이 끝나면 1회 호출 (말하기 미션 등 흐름 연결용)
```

## Source note 20

```text
//   클라우드 우선(en=Deepgram Aura-1, zh=서버가 진짜 만다린 반환) → 실패 시 브라우저 폴백
```

## Source note 21

```text
/* 🎙️ 한 번 실패했다고 곧바로 «기기 목소리» 로 가지 않는다 — 원어민 음성과 전혀 달라
       「목소리가 계속 변해」로 제일 크게 들린다(2026-08-31 사장님 제보). 400ms 뒤 한 번 더
       물어보면 일시적 흔들림은 여기서 끝난다.
       ⛔ 기기 목소리 폴백 자체는 없애지 마세요 — 소리가 아예 안 나는 것이 더 나쁩니다
          (앱 WebView·뉴런 소진 때는 그것뿐입니다). 「한 번 더」 뒤에만 갑니다. */
```

## Source note 22

```text
// 멈췄거나 다음 발화가 시작됐다 — 물러난다
```

## Source note 23

```text
// 발음 언어 전환 — 'zh' 중국어 / 'en' 영어. 보이스 재선택 + localStorage 저장.
```

## Source note 24

```text
// 진행 중인 요청이 옛 언어로 재생되지 않게
```

## Source note 25

```text
// 🎙 화자 전환 — setSpeaker('orion'|'asteria'|…|null). 브라우저 폴백에도 성별 힌트 반영.
```

## Source note 26

```text
// 진행 중인 요청이 옛 화자로 재생되지 않게
```

## Source note 27

```text
/* 🔇 낭독 즉시 중단 — 마이크를 켜기 전에 반드시 호출할 것.
     (2026-07-23) 그동안 화면들은 speechSynthesis.cancel() 만 불렀는데, 영어는 **클라우드 TTS라
     <audio> 로 재생**된다. 그래서 AI 목소리가 스피커로 계속 나오는 채로 마이크가 열렸고,
     음성인식이 AI 목소리를 학생 말로 받아 적어 엉뚱한 문장이 전송됐다. */
```

## Source note 28

```text
// ⚠️ 재시도가 «멈춘 뒤» 도착해 마이크 옆에서 재생되지 않게(위 seq 주석)
```

## Source note 29

```text
// 👩‍🏫 아바타 음량 립싱크용 — 재생에 쓰는 <audio> 를 노출(없으면 생성). 다른 페이지엔 영향 없음.
```

## Source note 30

```text
// 🙊 (2026-08-03) stripEmoji 공개 — 이모지 정제 규칙의 **단일 출처**.
```

## Source note 31

```text
//   게임 4종(language-ace·tank-battle·tetris·p38-3d)은 TTS 스택을 각자 인라인으로
```

## Source note 32

```text
//   복사해 갖고 있어서 이 규칙만 빠져 있었다(공용 모듈은 2026-07-21 에 고쳤다).
```

## Source note 33

```text
//   파이프라인 전체 통합은 반복횟수·Android 브리지·시퀀스 토큰 등 구조가 달라 별건이고,
```

## Source note 34

```text
//   오디오 검증(Whisper 전사)이 필요하다. 우선 갈라진 규칙만 여기로 모은다.
```
