/* 🐢🐇 화면 쪽 «말 빠르기» 판정 — ai-friend.html·warmup.html 이 함께 쓴다.
   (2026-10-28 사장님 「화면 쪽 말 빠르기도 고쳐줘」)
   예전에는 두 화면이 각자 «낱말 하나»(slow·천천히·빠르게·faster)로 판정해서 학생의 «대답» 에도 음성 속도가 바뀌었다 —
   「A snail is slow.」·「천천히 걸어요」 → 느려지고, 「빠르게 달려요」·「Cheetahs run faster.」 → 빨라졌다.
   · 느리게: 서버 정본 되묻기 판정(src/question-memory.ts 의 isReaskRequest)이 «부탁» 이라 하고 + 그 말에 «빠르기» 낱말이 있을 때만.
     아래 REASK_KO·EN·ECHO 세 줄은 정본과 «글자 그대로» 같다(브라우저라 import 를 못 쓴다) — 한쪽만 고치지 말 것.
     speech_rate_request_harness 가 원문을 대조한다. 그래서 「다시 말해 줘」·「쉽게 말해 줘」·「모르겠어요」 는 속도를 안 바꾼다(예전과 같다).
     ⚠️ 정본이 «답» 으로 두는 것(「Talk slowly.」·「Slowly.」·「말이 너무 빨라요」(동물 말))은 여기서도 안 느려진다 — 일부러 그렇게 정한 것이다.
   · 빠르게: 정본에 짝이 없다(되묻기가 아니라서). 같은 원칙으로 따로 둔다 — 그리고 «느리게» 보다 일부러 좁다
     (잘못 빨라지면 아이가 못 알아듣고, 잘못 느려지는 것보다 대가가 크다).
     한국어는 «부탁 어미»(더 빨리 말해 줘·빠르게 읽어 주세요)·그 말만(「더 빨리요」·「너무 느려요」·「선생님 너무 느려요」),
     영어는 «부탁 자리»(you/please 뒤의 speak faster·speed up)·그 말만(「Faster, please」·「Too slow」), 그리고 「You talk too slowly」.
     ⛔ 「빨리 말해 줘」·「빨리 말해 봐」(«더» 없는 빨리)는 안 받는다 — «재촉»(답을 빨리 대 줘)이지 «말 빠르기» 가 아니다.
        「정답 빨리 말해 줘」·「선생님 빨리 말씀해 주세요」 가 그것이다(2026-10-28 함정 대조). «더 빨리» 만 «빠르기» 다.
     ⛔ 말하는 동사(말·말씀·얘기·읽어)가 없으면 안 받는다 — 「숙제를 빨리 해 주세요」·「빨리 와 주세요」·「빨리 해 줘」 는 말 빠르기가 아니다.
        예외는 «그 말만» 한 경우 하나 — 「더 빨리요」·「좀 빨리」·「빠르게요」(앞말 없는 「빨리」·「빨리요」 는 대답일 수 있어 안 받는다).
     ⛔ 「It's too slow」 는 안 받는다 — «그것(이야기 속 물건)이 느리다» 는 대답과 글자가 같다(「It's too fast」 는 느리게 쪽에서 받는다 —
        잘못 받아도 한 칸 느려질 뿐이라서).
   · 화면 전용 보강(SLOW_EXTRA) — 정본은 «다시 말해 달라» 를 재는 것이라 일부러 좁다(오판 = 같은 질문 반복). 화면의 오판은 «한 칸 느려짐 +
     버튼으로 되돌림» 이라 대가가 작아서, 정본이 안 받는 «빠르기 부탁» 몇 모양을 여기서만 더 받는다(2026-10-28 함정 대조 반영):
     「It's too fast」·「Okay, too fast」·「Hey, slow down!」·「Don't talk so fast」·「A little bit slower」·「I don't understand, slow down.」·
     「Can you read slowly?」·「Say it slowly」·「천천히 말하세요」·「천천히 부탁해요」·「선생님 천천히요」·「좀 더 천천히요」·「저기요, 천천히 말해 주세요」·
     「선생님 너무 빨라요」·「선생님 말이 너무 빨라요」·「잘 안 들려요, 천천히요」·「천천히 말해 주면 좋겠어요」·「속도 좀 줄여 주세요」.
     「pls/plz」 는 please 로, 「youre」 는 you're 로, 「좀만·살짝」 은 조금(만)으로 읽는다(그 읽기는 normalize 하나 — 하니스도 같은 것을 쓴다).
     ⛔ 「말이 너무 빨라요」 의 «말» 은 «선생님(쌤)» 뒤에서만 받는다 — 앞말 없이 「말이 너무 빨라요」 면 동물 말(馬)일 수 있다.
     ⛔ 그래도 정본이 «대답» 으로 둔 것(「Talk slowly.」·「Speak slowly」·「말이 너무 빨라요」)은 받지 않는다 — 앞에 이유·부름말·please 가 있을 때만.
     ⚠️ 알고 둔 한계(정본에서 물려받은 것): 「엄마가 너무 빨리 말해요」·「Good, you speak slowly now」 는 정본 줄이 «부탁» 으로 받아
        느려진다(서버도 «다시 말해 달라» 로 본다). 정본을 고치는 것은 서버 대화가 함께 걸린 별건이라 여기서는 안 건드린다.
   ⛔ 「speed up」 은 뒤에 목적어가 오면 안 받는다 — 「Please speed up the car? No.」 는 이야기 속 대답이다.
   ⚠️ 1,000자가 넘는 말은 안 본다(정본 QM_REASK_MAX_LEN 과 같은 값 — 하니스가 대조).
   ⚠️ 정규식 속도 — 같은 글자를 먹는 두 덩어리(`\s*` 와 `[^\p{L}\p{N}]*`, `\s*해?\s*`)를 나란히 두면 긴 공백에서 제곱 시간이 된다.
      그래서 「천천히 천천히」 줄은 `천천히(?:\s*천천히){1,2}` 꼴이다. 하니스 ⑤가 10만 자 × 1.5초 제한으로 잰다.
   ⚠️ \p{L} 을 쓰므로 /u 가 필요하다 — 그 문법을 모르는 아주 옛 브라우저(크롬 64·사파리 11.1 이전)는 이 파일만 못 읽고
      (판정 없음 = 속도 그대로, 버튼은 그대로) 화면은 그대로 돈다. 두 HTML 이 «그 파일이 없으면 손대지 않는다» 로 짝을 맞춰 두었다.
   ⚠️ 이 파일을 고치면 부르는 두 HTML 의 ?v= 를 함께 올릴 것. */
(function () {
  'use strict';
  var MAX_LEN = 1000;
  // ── 정본 세 줄(src/question-memory.ts 의 QM_REASK_KO·EN·ECHO) — 글자 그대로 ──
  var REASK_KO = /(?:천천히|느리게|쉽게|짧게|간단히|또박또박|크게|다시)\s*(?:(?:다시|좀|한\s*번)\s*)?(?:말씀|말|얘기|읽어|설명)\s*(?:해\s*)?(?:줘(?![서야])|주세요|주실래|줄래|주시겠|주실\s*수|줄\s*수)|(?:천천히|느리게|쉽게|짧게|간단히|또박또박|크게|다시)\s*(?:좀\s*)?해\s*(?:줘(?![서야])|주세요|주실래|줄래|주시겠)|못\s*알아\s*(?:들었|듣겠)|알아\s*듣기\s*(?:힘들|어려)|쉬운\s*말로\s*(?:(?:말|얘기|설명)\s*)?(?:해\s*)?(?:줘(?![서야])|주세요|주실래|줄래|주시겠|주실\s*수|줄\s*수)|모르겠|너무\s*(?:빠르게|빨리)\s*말|한\s*번\s*(?:더|만)\s*(?:말씀|말|얘기)\s*(?:해\s*)?(?:줘(?![서야])|주세요|주실래|줄래|주시겠|주실\s*수|줄\s*수)/;
  var REASK_EN = /\b(?:you|please|um+|uh+|sorry|oh|ok|okay|teacher|what|huh|too fast|too hard|again)[,.!?]?\s+slow down\b|\bslow down,? please\b|\b(?:you|please|um+|uh+|sorry|oh|ok|okay|teacher|what|huh|too fast|too hard|again)[,.!?]?\s+(?:speak|talk|say (?:it|that)|read (?:it|that)|go)(?: english)?(?: a (?:little|bit))?(?: more)? (?:slowly|slower|slow)\b|\bplease(?: more)? (?:slowly|slower|slow)\b|\b(?:you|please|um+|uh+|sorry|oh|ok|okay|teacher|what|huh|too fast|too hard|again)[,.!?]?\s+(?:a (?:little|bit) )?(?:more )?(?:slowly|slower|slow|simpler|easier|shorter),? please\b|\byou(?:['’]re| are)?\s+(?:(?:talk|talking|speak|speaking)\s+(?:too|so|very|really)|too) fast\b|\byour (?:voice|talking|speaking) is (?:too|so) fast\b|\b(?:you|please|um+|uh+|sorry|oh|ok|okay|teacher|what|huh|too fast|too hard|again)[,.!?]?\s+(?:say|tell me) (?:it |that )?(?:again|one more time)\b|\b(?:you|please|um+|uh+|sorry|oh|ok|okay|teacher|what|huh|too fast|too hard|again)[,.!?]?\s+repeat(?: (?:it|that|please|again|the question|the sentence|one more time))?\b|\bi (?:don['’]?t|do not|can['’]?t|cannot|couldn['’]?t|didn['’]?t|not) (?:really )?understand(?: (?:you|that|it|this|anything|the question|your question|the word|the sentence|english|what you(?:['’]re| are) saying|what you (?:said|mean)|what (?:that|it) means))?(?=[^\p{L}\p{N}]*$|\s*[.!?](?:\s|$)|\s*,\s*(?:sorry|please|can you|could you|say|again|teacher)\b)|\b(?:you|please|um+|uh+|sorry|oh|ok|okay|teacher|what|huh|too fast|too hard|again)[,.!?]?\s+(?:say|speak|talk|explain)(?: it| that)? (?:more )?(?:simply|simpler|easier|more easily|shorter)\b|\b(?:you|please)\s+make it (?:simple|simpler|easy|easier|short|shorter)\b|\b(?:simple|simpler|easy|easier|short|shorter) (?:words|english|sentences?),? please\b|\b(?:can you|please) use (?:easy|easier|simple|simpler) words\b|\b(?:didn['’]?t|can['’]?t|couldn['’]?t|did not|cannot|could not|don['’]?t) hear you\b|\b(?:you|please|um+|uh+|sorry|oh|ok|okay|teacher|what|huh|too fast|too hard|again)[,.!?]?\s+speak (?:up|slower|louder|more slowly)\b|\bwhat (?:was|is) the question\b/iu;
  var REASK_ECHO = /^[^\p{L}\p{N}]*(?:(?:oh|um+|uh+|wait|아|음|(?:eh|네|응|예|에|엥|어|sorry|excuse me)\s*[?？]|wha+t?|huh|sorry|excuse me|뭐|뭐라고요?|too fast|너무\s*빨라요?)[^\p{L}\p{N}]+){0,2}(?:wha+t?|huh|pardon(?: me)?|i beg your pardon|come again|say what|what was that|what (?:did|do) you (?:say|said|mean|ask)|what did you just say|what you (?:say|said)|what does (?:it|that) mean|again\s*[?？]|(?:once )?again,? please|(?:one more time|once more)(?:\s*[?？]|,? please)|(?:please )?(?:say (?:it |that )?again|tell me again|slow down|repeat(?: (?:it|that|again|the question|the sentence|one more time))?|(?:speak|talk|say it|read it|go)(?: a (?:little|bit))?(?: more slowly| slower)|speak (?:up|louder)|explain (?:it |that )?(?:more )?simply|use (?:easy|easier|simple|simpler) words)(?:,? please)?|(?:speak|talk|say it|read it)(?: more)? slowly,? please|too fast(?: for me)?(?:,? (?:teacher|please))?|(?:you(?:['’]re| are) )?(?:talking|speaking) too fast|louder|slower|more slowly|don['’]?t understand(?:,? sorry)?|not understand|(?:a (?:little|bit) )?(?:more )?(?:slow|slower|louder|slowly|simpler|easier|shorter),? please|i (?:can['’]?t|cannot|couldn['’]?t) hear(?: you)?(?: well)?|sorry,? i (?:didn['’]?t|did not|couldn['’]?t) (?:hear|catch)(?: (?:that|it|you|what you said))?|뭐|머|뭐라고|뭐라구|뭐라고요|뭐라구요|뭐요|뭐라고\s*(?:하셨어요|하셨죠|하셨나요|했어요?|했니|했지)|다시요?|(?:다시\s*)?한\s*번\s*(?:만\s*)?(?:더\s*)?요|(?:잘\s*)?(?:안|못)\s*(?:들려요?|들렸어요?|들었어요?)|(?:잘\s*)?못\s*알아\s*들어요?|소리가?\s*(?:잘\s*)?(?:안\s*들려요?|작아요?)|무슨\s*(?:말|뜻|말씀)이(?:에요|야|예요|세요)?|이해(?:가|를)?\s*(?:안\s*(?:돼|되|가)|못\s*(?:했|해))[^\s\p{P}]*|(?:천천히|다시|느리게|쉽게|크게|또박또박)\s*(?:다시\s*)?(?:말|얘기)\s*해(?:\s*봐(?:요)?)?|(?:(?:좀|더|조금만?|다시)\s*)?(?:천천히|느리게|쉽게|짧게|간단히)(?:\s*(?:좀|다시))?(?:\s*해(?:\s*(?:줘|주세요))?|요)?|너무\s*(?:빨라요?|빠르다|빠르네요?)|(?:eh|네|응|예|에|엥|어|sorry|excuse me)\s*[?？])[^\p{L}\p{N}]*$/iu;
  // 되묻기 가운데 «빠르기» 이야기인 것만 속도를 낮춘다(「다시 말해 줘」 는 다시 듣기이지 느리게가 아니다)
  var SLOW_WORD = /천천히|느리게|너무\s*(?:빠르|빨라|빨리)|못\s*알아|알아\s*듣기|\bslow|\b(?:too|so|very|really) fast\b/i;
  // 화면 전용 보강 — 정본이 안 받는 «빠르기 부탁» 몇 모양(머리말 참고). 맨 앞·부름말·이유·please 가 있어야 받는다.
  var SLOW_EXTRA = /\bslow down,?\s+(?:teacher|please)\b|\bi (?:don['’]?t|didn['’]?t|do not|did not|can['’]?t|cannot|couldn['’]?t) (?:understand|hear)(?: you)?[,.!]?\s+(?:please\s+)?(?:slow down|too fast|slower|(?:speak|talk) (?:more )?slowly)\b|\b(?:can|could|would|will) you (?:please )?(?:speak|talk|say (?:it|that)|read(?: it| that)?|go)(?: a (?:little|bit))?(?: more)? (?:slowly|slower|slow)\b|\bplease,\s+(?:more )?(?:slowly|slower|slow)\b|^[^\p{L}\p{N}]*(?:(?:oh|um+|uh+|ah+|hmm+|hey|wait|hold on|sorry|ok|okay|teacher|again|what|huh)[^\p{L}\p{N}]+){0,2}(?:(?:(?:it|that)(?:['’]?s| is| was) )?(?:way |so |really )?too (?:fast|quick)(?: for me)?|(?:say|read) (?:it|that) (?:a (?:little|bit) )?(?:more )?(?:slowly|slower)|go (?:slow|slower|slowly)(?:,? please)?|(?:please )?don['’]?t (?:talk|speak|read|go|say it) (?:so |too )?fast|(?:please )?slow down(?: a (?:little|bit))?(?: more)?(?:,? please)?|(?:a (?:little|bit)(?: bit)? )?(?:more )?(?:slower|more slowly)(?:,? please)?)(?:[^\p{L}\p{N}]+(?:teacher|please))?[^\p{L}\p{N}]*$|^[^\p{L}\p{N}]*(?:(?:선생님|쌤|저기요?)[^\p{L}\p{N}]*)?(?:(?:좀|조금만?|더)\s*){0,2}(?:천천히|느리게)(?:\s*좀)?(?:\s*(?:(?:말씀|말|얘기)\s*(?:하세요|해\s*(?:주라|주세요|줘|줄래요?|주실래요?|달라고요?))|읽어(?:\s*(?:주세요|줘))?|해\s*(?:봐요?|주세요|줘)|부탁(?:해요?|드려요|드립니다|합니다))|요)?(?:[^\p{L}\p{N}]+(?:선생님|쌤))?[^\p{L}\p{N}]*$|^[^\p{L}\p{N}]*(?:(?:선생님|쌤)[^\p{L}\p{N}]*)?(?:(?:잘\s*)?(?:안|못)\s*들려요?|(?:잘\s*)?못\s*알아\s*들(?:어요?|었어요?))[^\p{L}\p{N}]+(?:(?:좀|조금만?|더)\s*){0,2}(?:천천히|느리게)(?:\s*좀)?(?:\s*(?:말해\s*(?:주세요|줘)|해\s*(?:주세요|줘))|요)?[^\p{L}\p{N}]*$|(?:천천히|느리게)\s*(?:좀\s*)?(?:말씀|말|얘기|읽어)\s*(?:해\s*)?주(?:시면|면)\s*(?:좋겠|감사)|^[^\p{L}\p{N}]*천천히(?:\s*천천히){1,2}요?[^\p{L}\p{N}]*$|^[^\p{L}\p{N}]*(?:(?:선생님|쌤)(?:이|가|은|는|의)?[^\p{L}\p{N}]*(?:(?:말씀|말|목소리|속도)(?:이|가|은|는)?[^\p{L}\p{N}]*)?|(?:목소리|속도|말씀)(?:이|가|은|는)?[^\p{L}\p{N}]*)?너무\s*(?:빨라요?|빠르다|빠르네요?)(?:[^\p{L}\p{N}]+(?:선생님|쌤))?[^\p{L}\p{N}]*$|속도\s*(?:를\s*)?(?:좀\s*)?(?:줄여|낮춰|늦춰)\s*(?:줘|주세요|줄래|주실래|주시겠)/iu;
  // 아이들이 흔히 쓰는 줄임 — 판정 «전» 에만 바꾼다(화면에 보이는 글자는 그대로)
  function normalize(t) {
    return t.replace(/\bpl[sz]\b/gi, 'please').replace(/\byoure\b/gi, "you're").replace(/좀만/g, '조금만').replace(/살짝/g, '조금');
  }
  // ── 빠르게 — 부탁 어미·부탁 자리·그 말만 ──
  // 「너무 느리게 말」 은 맨 앞(또는 «선생님» 다음)일 때만 — 「거북이는 너무 느리게 말해요」 는 이야기다
  var FAST_KO = /(?:빠르게|더\s*빨리)\s*(?:(?:좀|다시|한\s*번)\s*)?(?:말씀|말|얘기|읽어)\s*(?:해\s*)?(?:줘(?![서야])|주세요|주실래|줄래|주시겠|주실\s*수|줄\s*수)|^[^가-힣A-Za-z0-9]*(?:(?:선생님|쌤)[^가-힣A-Za-z0-9]*)?너무\s*느리게\s*말|속도\s*(?:를\s*)?(?:좀\s*)?(?:올려|높여)\s*(?:줘|주세요|줄래|주실래|주시겠)/;
  var FAST_EN = /\b(?:you|please|um+|uh+|sorry|oh|ok|okay|teacher|what|huh|too slow|too hard|again)[,.!?]?\s+(?:speak|talk|say (?:it|that)|read (?:it|that)|go)(?: english)?(?: a (?:little|bit))?(?: more)? (?:faster|quicker|quickly)\b|\bplease (?:faster|quicker)\b|\b(?:you|please|um+|uh+|sorry|oh|ok|okay|teacher|what|huh|too slow|too hard|again)[,.!?]?\s+(?:a (?:little|bit) )?(?:faster|quicker|more quickly),? please\b|\b(?:you|please|um+|uh+|sorry|oh|ok|okay|teacher|what|huh|too slow|too hard|again)[,.!?]?\s+speed up(?=\s*(?:[,.!?]|$|please\b|teacher\b|a (?:little|bit)\b|more\b))|\bspeed up,? please\b|\byou(?:['’]re| are)?\s+(?:talk|talking|speak|speaking)\s+(?:too|so|very|really) slow(?:ly)?\b|\byour (?:voice|talking|speaking) is (?:too|so) slow\b/iu;
  var FAST_ECHO = /^[^\p{L}\p{N}]*(?:(?:oh|um+|uh+|ah+|hmm+|hey|wait|hold on|sorry|ok|okay|teacher|again|what|huh|too slow|선생님|쌤|너무\s*느려요?)[^\p{L}\p{N}]+){0,2}(?:(?:a (?:little|bit) )?(?:faster|quicker|more quickly)(?:[^\p{L}\p{N}]+(?:faster|quicker)){0,3}(?:,? please)?|(?:please )?(?:speed up|(?:speak|talk|say it|read it|read|go)(?: a (?:little|bit))?(?: faster| quicker| more quickly))(?:,? please)?|(?:you(?:['’]re| are) )?too slow(?: for me)?(?:,? (?:teacher|please))?|(?:you(?:['’]re| are) )?(?:talking|speaking) too slow(?:ly)?|(?:(?:좀|더|조금만?)\s*){1,2}빨리(?:\s*좀)?요?|(?:(?:좀|조금만?)\s*)?더\s*빨리(?:\s*좀)?\s*(?:말|얘기)\s*해(?:\s*봐(?:요)?)?|(?:(?:좀|더|조금만?)\s*){0,2}빠르게(?:\s*좀)?(?:\s*(?:말|얘기)\s*해(?:\s*봐(?:요)?)?|요)?|너무\s*(?:느려요?|느리다|느리네요?))(?:[^\p{L}\p{N}]+(?:선생님|쌤|teacher))?[^\p{L}\p{N}]*$/iu;

  /** 'slower' · 'faster' · '' (속도를 바꿀 부탁이 아니다). 둘 다 있으면 느리게가 이긴다(예전과 같다). */
  function judge(text) {
    var t = typeof text === 'string' ? text : '';
    if (!t || t.length > MAX_LEN) return '';
    t = normalize(t);
    if (((REASK_KO.test(t) || REASK_EN.test(t) || REASK_ECHO.test(t)) && SLOW_WORD.test(t)) || SLOW_EXTRA.test(t)) return 'slower';
    if (FAST_KO.test(t) || FAST_EN.test(t) || FAST_ECHO.test(t)) return 'faster';
    return '';
  }
  window.MangoiRateRequest = { judge: judge, normalize: normalize };
})();
