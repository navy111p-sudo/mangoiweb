/* 👩‍🏫 MangoAvatar — 공용 강사 아바타(캔버스 실시간 크로마키) v4 (2026-07-26)
   초록 배경 영상을 <canvas>에 그리며 초록을 픽셀 단위로 제거 → '진짜 투명'.
   v2: 음량 기반 입 움직임 추가 — attach(audioEl) 로 TTS 오디오를 물리면, 실제 음성의
       크기(RMS)에 맞춰 입을 여닫는다(소리↑=입 벌림, 공백=닫힘, 세기=벌어짐). 발음 모양
       까지는 아니지만 말하는 리듬에 입이 맞는다. 오디오를 못 물리는 경우(브라우저 음성합성)
       는 연속 재생으로 폴백. 키잉은 말하는 동안만 rAF(정지 시 1프레임).
   v3: 캐릭터 전환 — setCharacter('female'|'male') 로 강사(여) ↔ 히어로(남) 얼굴 영상을
       바꿔 끼운다(남자 목소리 선택 시 히어로 아바타).
   v4: 얼굴만이 아니라 어깨·옷깃까지 보이는 "상반신" 프레임. cropTop(위만 자르기) 대신
       캐릭터별 crop 사각형(left,top,right,bottom, 0~1 비율)을 쓴다 — 캐릭터마다 원본
       프레임 속 인물 위치·구도가 달라 화면비도 다를 수 있어, setCharacter() 가 캔버스
       해상도와 카드 화면비(CSS aspect-ratio)를 캐릭터에 맞게 함께 바꾼다(왜곡 없이).
       강사(female)는 alpha 채널 실측(teacher-avatar.png)으로 계산한 4:5 상반신 크롭.
       히어로(male)는 기존 cropTop=16/512 그대로 유지(원본 이미지가 이미 어깨까지 나옴).
   v5: (2026-07-29) "남자 아바타가 한 번 움직이다가 이후 계속 멈춘다" 재현 — 원본 mp4/webm이
       8초 전체에 키프레임이 딱 1개뿐이었다(ffprobe 확인: I프레임 1개 + P/B프레임 199개).
       입모양 단계 전환마다 하는 seek(showTier)이 그 하나뿐인 키프레임부터 매번 수백 프레임을
       순차 디코드해야 했고, 자연스러운 말소리는 단계가 수시로 바뀌므로 seek 요청이 서로
       겹쳐 끝나지 않았다 — 결국 캔버스가 seek 시작 시점 프레임에 멈춰버렸다(정지 화면처럼
       보임). 여자 쪽 포즈 타임스탬프(0.2~4.0초)는 우연히 파일 앞쪽이라 잘 견뎠고, 남자
       쪽 'medium'(7.1초, 8초짜리 파일의 거의 끝)이 특히 취약했다. 근본 수정 = 세 영상을
       짧은 GOP(키프레임 8프레임=0.32초 간격)로 재인코딩 — 어느 타임스탬프로 seek 해도
       디코드가 즉시 끝나 더 이상 밀리지 않는다(화질 동일, 파일 용량만 2~3배 커짐, 8초
       클립이라 여전히 1.3MB 이하).

   마크업: <div id="tavatar-wrap"><div id="tavatar-ring">
             <canvas id="tavatar-canvas" width="320" height="400"></canvas>
             <video id="tavatar-video" muted loop playsinline preload="auto"
                    crossorigin="anonymous">
               <source src="/img/teacher-avatar.webm" type="video/webm">
               <source src="/img/teacher-avatar.mp4"  type="video/mp4"></video>
           </div></div>
   API: plainStart()/plainStop()  — 말하기 시작/끝(음성합성 등 분석 불가 음성)
        attach(audioEl)           — TTS 오디오를 물려 음량 립싱크(요소당 1회 바인딩)
        playClip(id)              — 미리 만든 클립 재생(음성코치 전용)
        setCharacter(name)        — 표시 캐릭터 전환('female' 기본 / 'male')

   v6: (2026-08-31) 「아바타를 더 어리게」 지시로 19세 안팎 Emma·Jake 로 교체하면서,
       캐릭터가 «영상» 말고 «입모양 정지 이미지 3장» 도 될 수 있게 넓혔다(frames).
       왜 영상이 아닌가 — ① v5 사고(입이 멈춤)의 뿌리가 «영상 seek» 이었는데 이미지는
       seek 이 아예 없어 그 사고 유형이 구조적으로 사라진다. ② 8초 영상(1.3MB) 대신
       장당 수백 KB 라 필리핀 회선에서 가볍다. ③ 배경이 이미 투명(alpha)이라 크로마키
       픽셀 루프를 통째로 건너뛴다(keyed:false).
       ⚠️ 투명 PNG 는 «겹쳐 그리면» 앞 입모양이 유령처럼 남는다 — keyFrame() 이 매번
          clearRect 로 지우고 그린다. 초록 영상(불투명)일 때는 원래 동작과 같다.
       ⚠️ 이미지 파일이 없으면(아직 안 올렸거나 깨졌으면) fallback 캐릭터(옛 영상)로
          조용히 되돌아간다 — 얼굴 자리가 «빈 카드» 로 남는 것이 제일 나쁘기 때문.

   v7: (2026-08-31) 고를 수 있는 친구가 «둘»(여자·남자)에서 «넷» 이 되면서 캐릭터를
       성별이 아니라 이름으로 부른다 — emma·jake(성인, 기존) / lily·noah(19세, 새 얼굴).
       옛 이름('female'|'male')은 CHAR_ALIAS 로 계속 받는다.

   v8: (2026-09-09) 사장님 「Emma 의 입이 너무 빨리 움직여 — Lily·Noah 처럼 천천히」.
       🔴 «바꾸는 횟수» 는 원래 넷이 똑같았습니다(showTier 의 MIN_SWITCH_MS=90 하나).
          다른 것은 «한 번 바뀔 때 화면이 얼마나 달라지는가» 였습니다 —
          [잰 것 — 2026-09-09, 크로미움에서 세 장을 실제로 그려 픽셀 비교]
            Emma  : 평균 차 10.8~15.3 · 눈에 띄게 바뀐 픽셀 11.4~18.3% · 바뀐 범위 = 화면 전체
                    (세로 10칸 전부 — 머리 꼭대기까지 움직입니다)
            Lily  : 평균 차  3.4~ 4.1 · 바뀐 픽셀 2.4~3.4% · 맨 윗칸 0.0(머리는 그대로) · 입 부근에 몰림
            Noah  : 평균 차  2.8~ 4.4 · 바뀐 픽셀 1.9~3.2% · 마찬가지
          Emma 의 세 입모양은 «8초 영상의 서로 다른 순간»(0.2·3.3·4.0초)이라 입만이 아니라
          고개 각도·눈·어깨가 함께 바뀝니다. hold 가 90ms 였으니 초당 최대 11번까지 바뀝니다 —
          그래서 «입이 빠르다» 가 아니라 «얼굴이 덜덜거린다» 로 보입니다. Lily·Noah 는 같은
          좌표계에서 입만 오려 낸 세 장이라 같은 횟수여도 조용합니다.
       ⚠️ [잰 것 / 판단 구분] Jake 는 «재지 못했습니다» — hero-avatar.mp4 가 H.264 라 이
          컨테이너의 크로미움이 디코드하지 못합니다(그 함정은 2장에 이미 있습니다).
          Jake 를 함께 늦춘 것은 «구조가 같다» 는 판단입니다 — 같은 8초 영상의 서로 다른
          순간(3.2·7.1·3.5초)을 seek 해서 보여 주는 똑같은 경로입니다. 사장님이 지적하신
          것은 Emma 뿐이니, 원치 않으시면 jake 줄의 `hold:200, fade:160` 만 지우면 됩니다.
       ✅ 그래서 «횟수»(hold)와 «섞는 시간»(fade)을 캐릭터별로 둡니다 — 영상 캐릭터만
          느리게(200ms·160ms), 이미지 캐릭터는 지금 값 그대로(90ms·130ms).
       ⚠️ 200ms 는 «사람 말의 음절 속도(초당 4~6)» 에 맞춘 값이지 사장님이 들어 보고 정한
          값이 아닙니다. 더 느리게·빠르게는 이 두 숫자만 고치면 됩니다.
       ⛔ Lily·Noah 를 함께 늦추지 마세요 — 그쪽은 사장님이 «이렇게 해 달라» 고 하신 기준입니다.
       ⛔ 입모양 «장 자체» 를 바꿔서 풀 수는 없습니다(원본 영상의 그 순간들입니다).
          근본 해결은 Emma 도 Lily 처럼 «같은 얼굴에서 입만 다른 3장» 으로 만드는 것이고,
          그건 얼굴을 새로 만드는 별건입니다(사람이 정할 일).

   v9: (2026-09-14) 사장님 「중국어 교사는 중국인 얼굴로 하나 만들어 입모양 자연스럽게」 →
       mei(메이 선생님) 추가. 웜업에서 «중국어» 를 고른 학생에게만 보입니다.
       🔴 만드는 방법이 중요합니다 — 생성 모델은 «입만» 바꿔 주지 않습니다. 같은 프롬프트로
          입모양만 다르게 세 장을 뽑으면 얼굴 크기·위치·눈썹이 함께 달라지고, 그러면 v8 이
          적어 둔 Emma 사고(「입이 빠르다」가 아니라 «얼굴이 덜덜거린다»)가 그대로 재현됩니다.
       ✅ 그래서 한 장(closed)을 기준으로 나머지를 정렬한 뒤 «입 부위만 오려 얹었습니다» —
          입 밖은 세 장이 픽셀 단위로 같습니다.
          [잰 것 — 2026-09-14, 만든 세 장을 그대로 픽셀 비교]
            closed↔mid  평균 차 0.43 · 바뀐 픽셀 0.33% · 세로 10칸 중 4·5칸만(입 부근)
            closed↔wide 평균 차 1.01 · 바뀐 픽셀 1.32% · 4·5·6칸만
          견줄 값(v8 실측): Lily 3.4~4.1 / 2.4~3.4% · Emma(사고) 10.8~15.3 / 11.4~18.3% 전 칸.
       ⛔ 입모양 세 장을 «각각 따로» 다시 뽑아 넣지 마세요 — 그 순간 위 숫자가 무너집니다.

   v10: (2026-10-17) 사장님 「왜 눈과 다른 얼굴 표정은 아직도 그대로야」 — 입만 움직이고
       눈·눈썹·고개는 처음부터 한 번도 안 움직였습니다(이 파일이 그리는 것은 «원본 초상화 +
       입 패치» 뿐이었습니다). Lily·Noah 에 «살아 있는 얼굴» 셋을 더합니다:
         ① 눈 깜빡임 — 2.2~6초마다 반감음→감음→반감음(가끔 두 번). 말하지 않을 때도.
         ② 눈썹 올림 — 말하는 중 «크게 벌린 입»(D) 순간에 가끔 0.4~0.7초.
         ③ 숨쉬기 — 캔버스에 CSS 애니메이션(아주 작은 확대·기울기, 어깨 기준). JS 비용 0.
       눈 그림은 /img/visemes/<이름>-eyes.webp(반감음·감음·눈썹 3칸)이고 tools/build-eye-patches.py
       가 만듭니다 — 입 패치와 같은 방식(정렬 뒤 «눈+눈썹 타원» 만 오려 얹기, 타원 밖은 원본 그대로).
       ⚠️ 눈 그림을 못 받으면 깜빡임만 없고 얼굴은 예전 그대로입니다(실패해도 빈 얼굴이 되지 않게).
       ⚠️ 깜빡임 타이머는 탭이 숨겨지면 멈추고(visibilitychange 로 다시 켬), 눈 그림이 없는
          캐릭터(영상 캐릭터 jake 등)에는 아예 걸지 않습니다. ⛔ setInterval 로 바꾸지 마세요.
       ⚠️ EYES 의 사각형은 build-eye-patches.py 가 찍어 주는 rect 와 «같아야» 합니다.
   v11: (2026-10-18) 사장님 「Emma·Mei·Long 도 눈 깜빡이게 해줘」 — 같은 방식으로 눈 그림 3장을
       만들어 EYES 에 더했습니다. 이제 눈 그림이 없는 것은 영상 캐릭터(jake·emma_classic)뿐입니다.
       ⚠️ 사각형은 «그 캐릭터 초상화의 원본 px» 기준입니다 — emma 는 512x640(emma-v2-rest.webp),
          나머지는 640x800. 눈 그림은 «다문 입» 장에서 만들었습니다(입 3장의 눈 부위 차이 실측:
          emma 0 · mei 최대 9 · long 평균 6 — 그 위에 얹어도 이음매가 안 보이는 수준). */
/* v12: (2026-10-18) Jake — ① 영상 seek 대신 «같은 얼굴에서 입만 다른» 6가지 입모양(아래 jake 줄)
       ② 사장님 「Jake도 살아있는 것 처럼 눈을 깜박거리고 머리도 조금 움직이게」 — EYES.jake 를 더해
          다른 친구들과 같은 깜빡임·눈썹·숨쉬기(어깨 기준 아주 작은 기울기)를 켭니다.
       Jake 얼굴은 생성 서비스가 거절한 기록이 있어(visemes/README) 눈 그림도 원래 영상에서 만듭니다:
       반감음 = 영상 3프레임 · 감음 = 100프레임(실제 깜빡임)을 rest(80)에 정렬해 «눈+눈썹 타원» 만 얹고,
       영상에 눈썹을 올리는 순간이 없어(200프레임 실측 ±3px) 눈썹 칸만 rest 의 눈썹을 7px 끌어올렸습니다.
       만드는 도구: tools/build-jake-poses.py (입·눈 모두 — 타원 밖은 rest 와 같다는 assert).
       ⚠️ Jake 사각형은 512x496(jake-closed.webp) 기준입니다. 이제 눈 그림이 없는 것은 영상 폴백
          (jake_classic·emma_classic)뿐입니다. */
/* v13: (2026-10-18) 사장님 「머리도 살아있는 거처럼 조금 씩 움직이게 해줘」 — 그림 캐릭터 여섯
       (lily·noah·emma·mei·long·jake)의 «머리만» 아주 작게 기울고(최대 약 1°) 끄덕입니다(0.7%).
       어깨·몸은 한 픽셀도 안 움직입니다 — 목에서 머리와 몸을 부드럽게 나누는 경계(HEAD 표)를
       두고, 그 위만 목 가운데를 축으로 돌립니다. 말하는 동안은 조금 더 크게(×1.35).
       ⚙️ 얼굴은 먼저 화면 밖 캔버스(comp)에 그리고(입·눈은 예전과 똑같이), present() 가
          «몸 + 기운 머리» 를 화면 캔버스에 겹쳐 놓습니다. 겹치는 목 부분은 'lighter' 로 더해
          알파가 1 을 넘거나 비지 않습니다.
       ⚠️ 쉬는 동안의 움직임은 «초당 약 20번» 만 그리고, 그 사이는 타이머로 기다려 폰도 초당 약 20번만
          깨웁니다(rAF 를 매 프레임 다시 걸면 60번). 탭이 숨거나, 캔버스가 화면
          밖이거나, «움직임 줄이기» 설정이면 멈춥니다. ⛔ setInterval 로 바꾸지 마세요.
       ⚠️ 화면 밖 캔버스를 못 만드는 환경(옛 브라우저·하니스의 가짜 DOM)에서는 예전처럼 화면
          캔버스에 바로 그리고 머리는 안 움직입니다(실패해도 얼굴은 그대로).
       ⚠️ HEAD 의 숫자는 «그 초상화의 원본 px» 입니다 — y1(여기부터 위는 머리) · y2(여기부터
          아래는 몸) · nw(목 반폭 — 그 밖은 경계가 위로 올라가 어깨가 섞이지 않게) · x(축). */
(function(){
  function noop(){}
  if(!window.MangoAvatar){
    window.MangoAvatar = { plainStart:noop, plainStop:noop, attach:noop, prepare:function(){return Promise.resolve(null);}, setCharacter:noop,
      playClip:function(){ return Promise.reject(new Error('avatar_not_ready')); } };
  }

  // 캐릭터별 영상/스틸 소스 + crop 사각형(0~1 비율, 원본 프레임 기준).
  //   female: teacher-avatar.png 의 alpha 채널을 실측해 계산(머리 위 여백만 트림 + 어깨/옷깃까지 포함).
  //   male(히어로): 기존 동작 그대로 보존(원본 상단 ~3% 검정 띠만 제거, 좌우/아래는 풀프레임).
  // 🗣 (2026-07-27) 입모양 3단계(poses) — 소리 크기에 매번 새로 만든 영상이 아니라, 같은
  //   루프 영상 안에서 이미 자연스럽게 나오는 "다문/중간/크게 벌린" 순간을 골라 그 프레임에
  //   멈춰 보여준다(초 단위 타임스탬프). 같은 인물이라 어색한 합성 없이 정체성이 그대로 유지되고,
  //   소리 크기가 바뀔 때만 그 타임스탬프로 seek 하므로 추가 지연이 없다. 발음(비셈) 자체를
  //   맞추는 건 아니고 "조용함/보통/큼"에 맞는 입모양을 고르는 근사치다.
  // 🧑 (2026-08-31) 캐릭터를 «성별» 이 아니라 «사람 이름» 으로 부릅니다 — 사장님 지시로
  //   고를 수 있는 친구가 둘(여자·남자)에서 넷이 되었기 때문입니다. 이름과 얼굴이 어긋나면
  //   「Lily 를 골랐는데 Emma 가 나온다」가 되고, 그건 화면만 봐서는 원인이 안 보입니다.
  //     Emma·Jake = 지금까지 쓰던 성인 얼굴(초록 배경 영상 크로마키). 그대로 둡니다.
  //     Lily·Noah = 새로 만든 19세 얼굴(입모양 이미지 3장, 배경이 지워진 투명 PNG).
  //   ⛔ Emma·Jake 를 지우지 마세요: Lily·Noah 의 PNG 가 없을 때의 폴백이고,
  //      playClip() 의 미리 만든 립싱크 클립(teacher-say-*)이 Emma 얼굴과 짝입니다.
  // 🐢 hold / fade (2026-09-09, v8) — «입모양을 얼마나 자주 바꾸는가»(hold, ms)와
  //   «바뀔 때 앞 화면과 얼마나 오래 섞는가»(fade, ms). 안 적으면 아래 기본값(90·130).
  //   ⚠️ 영상 캐릭터(emma·jake)만 늦춥니다 — 세 입모양이 «같은 얼굴의 입만» 이 아니라
  //      «영상의 서로 다른 순간» 이라 한 번 바꿀 때마다 고개·눈·어깨까지 함께 움직이기
  //      때문입니다(머리말 v8 의 실측). 이미지 캐릭터는 입만 바뀌므로 지금 값이 맞습니다.
  //   ⛔ 영상 캐릭터는 fade 를 hold 보다 크게 두지 마세요 — 앞 전환이 채 끝나기 전에 다음
  //      전환이 와서 두 얼굴이 계속 겹쳐 보입니다(고치기 전 Emma 가 그 상태였습니다: 130 > 90).
  //   ℹ️ 기본값은 그 반대(fade 130 > hold 90)이고 Lily·Noah 가 그대로인데 «그게 정상» 입니다 —
  //      그쪽은 한 번에 바뀌는 픽셀이 2~3% 뿐이라 겹쳐도 안 보입니다. 고치지 마세요.
  var CHARACTERS = {
    // 2026-10-16: user authorized a new Emma identity with registered mouth-only poses.
    emma: { frames:{closed:'/img/visemes/emma-v2-rest.webp',medium:'/img/visemes/emma-v2-mid.webp',wide:'/img/visemes/emma-v2-wide.webp'},
            still:'/img/visemes/emma-v2-rest.webp',rect:{l:0,t:0,r:1,b:1},aspect:0.8,keyed:false,fallback:'emma_classic' },
    emma_classic: { sources:[['/img/teacher-avatar.webm','video/webm'],['/img/teacher-avatar.mp4','video/mp4']],
            still:'/img/teacher-avatar.png', rect:{ l:67/512, t:40/512, r:445/512, b:1 },
            poses:{ closed:3.3, medium:0.2, wide:4.0 }, hold:200, fade:160 },
    /* 🦸 jake (2026-10-17 v12) — 「Jake 입이 전혀 움직이지 않아 · 자연스럽게 · 말과 입이 일치 · 6가지」.
       영상 seek(v5 사고와 같은 경로)을 버리고 «같은 얼굴에서 입만 다른» 이미지로 바꿨습니다.
       원래 hero-avatar.mp4 의 프레임만 씁니다(새 얼굴 생성 아님 — 생성 서비스가 이 얼굴을 거절한 기록이 visemes/README).
       입모양 6가지: rest·spread(이)·teeth·open·wide(아)·round(오/우) → PRECISION.jake 아틀라스.
       만드는 도구: tools/build-jake-poses.py (입 밖 픽셀은 rest 와 바이트 단위로 같음 — assert).
       ⛔ 영상 줄로 되돌리지 마세요(jake_classic 은 폴백 전용). */
    jake: { frames:{ closed:'/img/jake-closed.webp', medium:'/img/jake-mid.webp', wide:'/img/jake-wide.webp' },
            still:'/img/jake-closed.webp', rect:{ l:0, t:0, r:1, b:1 },
            aspect:512/496, keyed:false, fallback:'jake_classic' },
    jake_classic: { sources:[['/img/hero-avatar.mp4','video/mp4']],
            still:'/img/hero-avatar.png', rect:{ l:0, t:16/512, r:1, b:1 },
            poses:{ closed:3.2, medium:7.1, wide:3.5 }, hold:200, fade:160 },
    // ?v=2 (2026-10-18): smile-line creases beside the mouth retouched (tools/remove-smile-folds.py).
    //   Media without ?v= is cached 7 days, so a retouched file needs a new address. Bump on every change.
    lily: { frames:{ closed:'/img/lily-closed.webp?v=2', medium:'/img/lily-mid.webp?v=2', wide:'/img/lily-wide.webp?v=2' },
            still:'/img/lily-closed.webp?v=2', rect:{ l:0, t:0, r:1, b:1 },
            aspect:0.8, keyed:false, fallback:'emma_classic' },
    noah: { frames:{ closed:'/img/noah-closed.webp?v=2', medium:'/img/noah-mid.webp?v=2', wide:'/img/noah-wide.webp?v=2' },
            still:'/img/noah-closed.webp?v=2', rect:{ l:0, t:0, r:1, b:1 },
            aspect:0.8, keyed:false, fallback:'jake_classic' },
    // 🀄 mei — 중국어 교사(2026-09-14). 웜업에서 «중국어» 를 고른 학생에게만 보입니다.
    //    ⛔ 영어 화면(ai-friend·speech-coach)의 표에는 넣지 마세요 — 그쪽은 아직 중국어가 없어서
    //       «중국인 얼굴이 영어로 말하는» 상태가 됩니다(웜업에 중국어가 붙은 것이 먼저입니다).
    mei:  { frames:{ closed:'/img/mei-closed.webp', medium:'/img/mei-mid.webp', wide:'/img/mei-wide.webp' },
            still:'/img/mei-closed.webp', rect:{ l:0, t:0, r:1, b:1 },
            aspect:0.8, keyed:false, fallback:'emma_classic' },
    /* 🀄 long(龙老师·룽 선생님) — 중국어 «남자» 교사(2026-09-14 사장님 「남자 교사도 한명더」).
       메이와 같은 규격입니다(입모양 3장·4:5·투명 WebP). fallback 이 jake 인 까닭은
       그림을 못 받았을 때 «남자» 얼굴로 떨어져야 목소리와 어긋나지 않기 때문입니다.
       [잰 것 — 2026-09-14 러너] 세 장의 «바뀐 픽셀»: closed-mid 0.5% · closed-wide 1.96% ·
       mid-wide 1.42%, 세로 10칸 중 입 부근 두 칸(10.6%·9.6%)에 몰림.
       (메이 0.33~1.32% · Lily 2.4~3.4% · Emma 사고 11.4~18.3%로 10칸 전부)
       ⛔ 세 장을 각각 따로 다시 뽑아 갈아 끼우지 마세요 — 그 순간 이 숫자가 무너집니다. */
    long: { frames:{ closed:'/img/long-closed.webp', medium:'/img/long-mid.webp', wide:'/img/long-wide.webp' },
            still:'/img/long-closed.webp', rect:{ l:0, t:0, r:1, b:1 },
            aspect:0.8, keyed:false, fallback:'jake_classic' }
  };
  // 옛 이름으로 부르는 코드가 남아 있어도 조용히 죽지 않게 — setCharacter 가 먼저 풀어 준다.
  // ⚠️ 화면이 새 이름으로만 부르도록 고쳤지만, 이 표를 지우면 옛 호출이 «아무 일도 안 일어남» 이 됩니다.
  var CHAR_ALIAS = { female:'emma', male:'jake', female_classic:'emma_classic', male_classic:'jake_classic' };
  var BASE_W = 320;   // 캔버스 내부 해상도 기준 폭(캐릭터별 비율에 맞춰 높이만 재계산)
  // 🎭 (v13) 머리 움직임 — 숫자는 그 초상화의 원본 px(emma 512x640 · jake 512x496 · 나머지 640x800).
  //   y1 위는 머리(전부 움직임) · y2 아래는 몸(그대로) · 그 사이는 부드럽게 섞는다.
  //   nw 는 목 반폭 — 그 밖에서는 경계를 (y2-y1) 만큼 위로 올려 어깨가 섞이지 않게 한다.
  //   ⚠️ y1 은 입 칸(PRECISION)·눈 칸(EYES)의 아래 끝보다 «아래» 여야 한다(하니스가 대조).
  var HEAD={lily:{x:327,y1:446,y2:488,nw:62,w:640,h:800},noah:{x:324,y1:500,y2:542,nw:118,w:640,h:800},
    emma:{x:257,y1:424,y2:464,nw:58,w:512,h:640},mei:{x:324,y1:468,y2:540,nw:62,w:640,h:800},
    long:{x:322,y1:412,y2:456,nw:100,w:640,h:800},
    // jake 는 만화 그림이라 목이 턱만큼 넓고 어깨가 턱 모서리 바로 밑에서 시작한다 — 경계를 턱 위(416)에
    // 두면 턱 모서리 굵은 선이 띠에 걸리지만, 실제 기울기(≤1.35°)에서는 1~2px 라 겹쳐 보이지 않는다(6배 과장에서만 보임).
    jake:{x:257,y1:416,y2:452,nw:100,w:512,h:496}};

  function build(){
    var video  = document.getElementById('tavatar-video');
    var canvas = document.getElementById('tavatar-canvas');
    var wrap   = document.getElementById('tavatar-wrap');
    var ring   = document.getElementById('tavatar-ring');
    if(!video || !canvas) return;
    // 🎭 (v13) 얼굴은 화면 밖 캔버스(comp)에 그리고 present() 가 화면 캔버스(vctx)로 옮긴다 —
    //    그 사이에서 머리만 기울인다. comp 를 못 만들면 예전처럼 화면 캔버스에 바로 그린다.
    var ctx = null, vctx = null, comp = null;
    try { comp = document.createElement('canvas'); ctx = comp.getContext('2d', { willReadFrequently:true }); } catch(e){ ctx = null; }
    if (ctx && typeof ctx.drawImage === 'function') {
      try { vctx = canvas.getContext('2d'); } catch(e){ vctx = null; }
    }
    if (!vctx) { comp = null; vctx = null; ctx = canvas.getContext('2d', { willReadFrequently:true }); }
    else { comp.width = canvas.width; comp.height = canvas.height; }
    var raf = 0, drawing = false, IDLE = null, clipActive = false;
    // ⚠️ 2배는 «머리 캐릭터 + 투명 그림(keyed:false)» 만 — 초록 지우기(getImageData 픽셀 루프)를
    //    쓰는 영상 캐릭터는 1배 그대로(2배면 픽셀 일이 4배가 됩니다).
    var COMP_S = 1;
    function compScaleFor(name){ var c = CHARACTERS[name]; return (comp && HEAD[name] && c && c.keyed === false) ? 2 : 1; }
    /* 🕐 «모듈이 오기 전에 화면이 고른 얼굴» 을 이어받는다 (2026-09-14).
       이 파일은 defer 라 화면의 인라인 스크립트가 «먼저» 돕니다. 그때 화면은
       `window.MangoAvatar && MangoAvatar.setCharacter(...)` 를 부르는데 아직 이 객체가
       없어서 그 요청이 통째로 버려졌습니다.
       [잰 것 — 2026-09-14, 저장된 친구를 lily 로 두고 웜업을 연 실측(origin/main 기준)]
         lily 그림 요청 0건 · teacher-avatar.png·webm(942KB) 요청 2건
       ⟹ Lily 를 고른 학생도 «첫 답변이 나올 때까지» Emma 얼굴이 보이고, 그 사이 안 쓸
          942KB 를 받습니다(필리핀 회선). 중국어에서는 «중국어를 골랐는데 서양 얼굴» 이 됩니다.
       ⚠️ 이 값이 없거나 모르는 이름이면 예전 그대로 emma 로 떨어집니다 — 이 줄을 안 세우는
          화면(ai-friend·speech-coach)의 동작은 한 글자도 바뀌지 않습니다. */
    var bootChar = null;
    try{ bootChar = CHAR_ALIAS[window.__mgAvatarWant] || window.__mgAvatarWant; }catch(e){}
    if(!CHARACTERS[bootChar]) bootChar = 'emma';
    var curChar = bootChar, cropRect = CHARACTERS[bootChar].rect;
    var curPoses = CHARACTERS[bootChar].poses || CHARACTERS[bootChar].frames, curTier = null;   // 🗣 현재 캐릭터의 입모양 타임스탬프(영상) 또는 장 목록(이미지) + 지금 보여주는 단계
    // 🎞 잡음성 순간 변동으로 너무 자주(덜덜) 바뀌는 것 방지 — 한 음절 정도의 최소 유지시간(ms).
    //   FADE_MS 는 전환할 때 앞 화면과 섞는 시간(keyFrame 이 씁니다).
    //   ⚠️ 이 둘은 «안 적은 캐릭터» 의 기본값입니다 — 캐릭터별 값은 CHARACTERS 의 hold/fade.
    //   ⛔ 여기(applyFrame 보다 «위») 에서 옮기지 마세요: var 는 «선언» 만 끌어올려지고 값은
    //      안 끌어올려져서, 아래에 두면 첫 applyFrame(curChar) 이 undefined 를 읽습니다
    //      (hold 를 안 적은 캐릭터의 최소 유지시간이 조용히 0 이 됩니다).
    var MIN_SWITCH_MS = 90, FADE_MS = 130;
    // 🐢 (v8) 지금 캐릭터의 «바꾸는 간격»·«섞는 시간». applyFrame() 이 캐릭터마다 다시 정한다.
    //    ⚠️ 이 둘을 다시 상수로 되돌리면 Emma 가 초당 11번 얼굴째 덜덜거리던 상태로 돌아갑니다.
    var curHold = MIN_SWITCH_MS, curFade = FADE_MS;
    // 🖼 v6 이미지 캐릭터 상태 — imgFrames 가 null 이 아니면 «영상이 아니라 그림» 을 그리는 중이다.
    var imgFrames = null, imgCur = null, imgAspectDone = false;
    var keyedNow = (CHARACTERS[bootChar].keyed !== false);   // 초록 제거가 필요한 캐릭터인가
    // 캐릭터의 crop 사각형에 맞춰 캔버스 해상도 + 카드 화면비를 함께 갱신(왜곡 방지).
    //   같은 <canvas> 를 여러 캐릭터가 공유하므로, 비율이 다른 캐릭터로 바뀌어도
    //   "캔버스 내부 해상도"와 "화면에 보이는 CSS 박스"가 항상 같은 비율을 유지해야 늘어나 보이지 않는다.
    function setAspect(aspect){
      if(!(aspect > 0)) return;
      canvas.width = BASE_W; canvas.height = Math.round(BASE_W / aspect);
      // 🎭 (v13) 머리 캐릭터는 comp 를 «2배» 로 짠다 — 원본(640x800)의 잔털·속눈썹을 그대로 들고 있다가
      //    기울일 때 한 번만 줄여야 흐려지지 않는다(1배로 짜고 기울이면 얼굴이 눈에 띄게 뿌예집니다).
      //    ⚠️ 이때 ctx 는 «320 기준 좌표» 그대로 쓰도록 배율을 걸어 둔다(그리는 코드는 그대로).
      if (comp) {
        COMP_S = compScaleFor(curChar);
        comp.width = canvas.width * COMP_S; comp.height = canvas.height * COMP_S;
        try { ctx.setTransform(COMP_S, 0, 0, COMP_S, 0, 0); } catch(e){}
      }
      maskFor = ''; layersDirty = true;      // 🎭 (v13) 크기가 바뀌면 머리 경계·층을 다시 만든다
      // CSS aspect-ratio 로 카드 높이를 자동 계산하려 했으나, 전환(transition) 시 실제
      // 레이아웃에 반영 안 되는 문제가 있어 폭(고정 CSS 값)을 읽어 높이를 직접 px 로 계산해 덮어쓴다.
      if (ring){
        var ringW = ring.getBoundingClientRect().width || parseFloat(getComputedStyle(ring).width) || BASE_W;
        ring.style.height = Math.round(ringW / aspect) + 'px';
      }
    }
    function applyFrame(name){
      var c = CHARACTERS[name]; if(!c) return;
      cropRect = c.rect;
      curPoses = c.poses || c.frames; curTier = null;   // 🗣 캐릭터가 바뀌면 타임스탬프도 바뀌므로 다음 프레임에 새로 seek
      fadeData = null;                      // 🎞 캔버스 크기가 바뀌므로 이전 스냅샷은 버린다
      // ⚠️ 영상 캐릭터의 rect 는 «정사각 원본» 기준이라 rect 만으로 화면비가 나온다.
      //    이미지 캐릭터는 원본이 정사각이 아니므로 c.aspect 로 시작해 두고, 'closed' 장이
      //    실제로 로드된 뒤 naturalWidth/Height 로 다시 정확히 맞춘다(mountImages) —
      //    파일을 다른 비율로 갈아 끼워도 저절로 따라오게 하려는 것.
      // 🐢 (v8) 캐릭터마다 입 바꾸는 속도가 다르다 — 안 적은 캐릭터는 기본값(빠름) 그대로.
      curHold = (c.hold > 0) ? c.hold : MIN_SWITCH_MS;
      curFade = (c.fade > 0) ? c.fade : FADE_MS;
      setAspect(c.aspect || ((cropRect.r - cropRect.l) / (cropRect.b - cropRect.t)));
    }
    applyFrame(curChar);

    // 캐릭터를 실제로 «장착» 한다 — 영상이면 <video> 소스 교체, 이미지면 입모양 3장 미리 받기.
    function mountCharacter(name){
      var c = CHARACTERS[name]; if(!c) return;
      keyedNow = (c.keyed !== false);
      mountEyes(name);   // 👁 (v10) 눈 그림이 있는 캐릭터만 깜빡임·숨쉬기를 켠다(없으면 끈다)
      maskFor = ''; layersDirty = true; swayKick();   // 🎭 (v13) 머리 움직임도 캐릭터를 따라간다
      if (c.frames){ mountImages(name, c); return; }
      imgFrames = null; imgCur = null;
      try{
        while(video.firstChild) video.removeChild(video.firstChild);
        for(var i=0;i<c.sources.length;i++){
          var so=document.createElement('source'); so.src=c.sources[i][0]; so.type=c.sources[i][1];
          video.appendChild(so);
        }
        video.loop=true; video.muted=true; video.load();
      }catch(e){}
      preloadStill(c.still);   // 새 영상 디코드 전에도 곧바로 정지 얼굴을 보여줌
    }
    // 🖼 이미지 캐릭터 장착 — 입모양 3장을 미리 받아 두고 showTier 가 갈아 끼운다.
    function mountImages(name, c){
      try{ video.pause();
           while(video.firstChild) video.removeChild(video.firstChild);
           video.removeAttribute('src'); video.load(); }catch(e){}   // 영상은 확실히 세워 둔다
      imgFrames = {}; imgCur = null; imgAspectDone = false;
      var failed = false;
      ['closed','medium','wide'].forEach(function(k){
        var im = new Image();
        im.onload = function(){
          if(name !== curChar) return;            // 그 사이 캐릭터가 또 바뀌었으면 버린다
          if(k === 'closed' && !imgAspectDone && im.naturalWidth && im.naturalHeight){
            imgAspectDone = true;                 // 실측 비율로 카드 높이를 정확히 다시 맞춘다
            setAspect((im.naturalWidth  * (cropRect.r - cropRect.l)) /
                      (im.naturalHeight * (cropRect.b - cropRect.t)));
          }
          // 쉬는 얼굴(다문 입)이 오면 그것을 우선한다 — 다른 장이 먼저 도착해도 첫 화면은 입을 다문 얼굴.
          if(k === 'closed' || !imgCur){ imgCur = im; curTier = k; }
          if(!drawing) drawStill();
        };
        im.onerror = function(){
          // 🔴 파일이 아직 안 올라왔거나 깨졌을 때 «빈 얼굴 카드» 로 남지 않게 성인 얼굴로 되돌린다.
          //    「얼굴이 옛날 것이다」 = 그 PNG 가 /img/ 에 없다는 뜻이다.
          // ⚠️ 되돌리는 것은 «쉬는 얼굴(closed)» 이 없을 때만이다 — medium·wide 는 말할 때만 쓰는
          //    보조 장이라, 그것 하나가 없다고 얼굴 전체를 옛것으로 되돌리면 잃는 것이 더 크다
          //    (그 단계만 안 쓰고 나머지로 말한다). 2026-08-31 실제로 한 장이 늦게 도착했다.
          if(k !== 'closed') { imgFrames[k] = null; return; }
          if(failed || name !== curChar) return;
          failed = true;
          var fb = c.fallback;
          if(!fb || !CHARACTERS[fb] || fb === name) return;
          curChar = fb; IDLE = null; applyFrame(fb); mountCharacter(fb);
        };
        im.src = c.frames[k];
        imgFrames[k] = im;
      });
    }

    // ── 음량 분석(Web Audio) — attach 로 오디오를 물릴 때 1회 그래프 생성 ──
    var actx=null, boundEl=null, analyser=null, lipData=null, audioFailed=false;
    var bindings = new WeakMap(), buffering = false, mouthCues=null, cueUrl='', preciseFaces={};
    // Reviewed nine-pose anchors plus 288 optical-flow inbetweens per actor.
    // The latter are transition shapes, not additional recognized phonemes.
    // base/atlas/trans must carry the same ?v= as the CHARACTERS frames above (one retouch, one version).
    var PRECISION={lily:{extra:true,base:'/img/lily-closed.webp?v=2',atlas:'/img/visemes/lily-mouths.webp?v=2',trans:'/img/visemes/lily-transitions.webp?v=2',x:250,y:294,w:144,h:122},
      noah:{extra:true,base:'/img/noah-closed.webp?v=2',atlas:'/img/visemes/noah-mouths.webp?v=2',trans:'/img/visemes/noah-transitions.webp?v=2',x:244,y:364,w:154,h:130},
      emma:{extra:true,base:'/img/visemes/emma-v2-rest.webp',atlas:'/img/visemes/emma-v2-mouths.webp',x:183,y:282,w:146,h:126},
      // 🦸 Jake 6가지 입모양(9칸 XABCDEFGH 에 배치) — x,y,w,h 는 build-jake-poses.py 출력과 짝.
      //    중간 모양 시트가 없어 transitions 는 못 받으면 그냥 9칸 앵커만 씁니다(keyFrame 이 확인).
      jake:{extra:true,base:'/img/jake-closed.webp',atlas:'/img/visemes/jake-mouths.webp',transitions:false,x:188,y:304,w:136,h:92}};
    function precisionFace(){
      if(!PRECISION[curChar])return null;
      if(!preciseFaces[curChar]){
        var p=PRECISION[curChar],base=new Image(),mouths=new Image(),transitions=new Image();
        var load=function(im,url){return new Promise(function(resolve){
          var timer=setTimeout(function(){resolve(false);},8000);
          im.onload=function(){clearTimeout(timer);resolve(true);};
          im.onerror=function(){clearTimeout(timer);resolve(false);};
          im.src=url;
          if(im.complete && im.naturalWidth){clearTimeout(timer);resolve(true);}
        });};
        var ready=Promise.all([load(base,p.base),load(mouths,p.atlas||('/img/visemes/'+curChar+'-mouths.webp')),
          p.transitions===false ? Promise.resolve(false) : load(transitions,p.trans||('/img/visemes/'+curChar+'-transitions.webp'))]);
        preciseFaces[curChar]={base:base,mouths:mouths,transitions:transitions,rect:p,ready:ready};
        // Bound decoded sprite memory when a student switches through all teachers.
        Object.keys(preciseFaces).forEach(function(name){if(name!==curChar)delete preciseFaces[name];});
      }
      return preciseFaces[curChar];
    }
    // 👁 (v10) 눈 깜빡임·눈썹 — 사각형은 그 초상화의 원본 px 기준(build-eye-patches.py 의 rect).
    //   emma 만 512x640(emma-v2-rest.webp), jake 는 512x496(jake-closed.webp — build-jake-poses.py 의 eyes.rect),
    //   나머지는 640x800.
    //   eyeState: 0 원본 · 1 반감음 · 2 감음 · 3 눈썹 올림 (= 눈 그림의 칸 번호 + 1)
    var EYES={lily:{x:226,y:204,w:202,h:84},noah:{x:192,y:238,w:260,h:92},
      emma:{x:151,y:174,w:213,h:80},mei:{x:206,y:220,w:236,h:84},long:{x:210,y:214,w:224,h:86},
      jake:{x:153,y:181,w:209,h:74}};
    var eyeImg=null, eyeOk=false, eyeFor='', eyeState=0, eyeTimer=0, browUntil=0, browNext=0, loudNow=false;
    function injectAliveCss(){
      try{
        if(document.getElementById('mg-alive-css')) return;
        var st=document.createElement('style'); st.id='mg-alive-css';
        st.textContent='#tavatar-canvas.mg-alive{transform-origin:50% 100%;animation:mgAliveBreath 5.2s ease-in-out infinite}'+
          '@keyframes mgAliveBreath{0%,100%{transform:none}35%{transform:scale(1.007) rotate(-.25deg)}70%{transform:scale(1.003) rotate(.2deg)}}'+
          '@media (prefers-reduced-motion:reduce){#tavatar-canvas.mg-alive{animation:none}}';
        document.head.appendChild(st);
      }catch(e){}
    }
    function mountEyes(name){
      if(eyeTimer){ clearTimeout(eyeTimer); eyeTimer=0; }
      eyeState=0; browUntil=0; eyeOk=false; eyeFor=name; eyeImg=null;
      var on=!!EYES[name];
      try{ canvas.classList.toggle('mg-alive', on); }catch(e){}
      if(!on) return;
      injectAliveCss();
      var im=new Image(); eyeImg=im;
      im.onload=function(){ if(eyeImg!==im) return; eyeOk=true; scheduleBlink(); };
      im.onerror=function(){ if(eyeImg===im) eyeOk=false; };
      im.src='/img/visemes/'+name+'-eyes.webp';
    }
    // 기본 얼굴을 그린 «바로 뒤» 에 부른다 — bx..sh 는 그 얼굴을 원본에서 잘라 온 사각형(원본 px).
    function drawEyes(bx,by,sw,sh){
      var e=EYES[curChar];
      if(!eyeState || !eyeOk || !e || eyeFor!==curChar) return;
      try{ ctx.drawImage(eyeImg,(eyeState-1)*e.w,0,e.w,e.h,
        (e.x-bx)/sw*canvas.width,(e.y-by)/sh*canvas.height,e.w/sw*canvas.width,e.h/sh*canvas.height); }catch(err){}
    }
    function setEye(s){ if(eyeState===s) return; eyeState=s; if(!drawing) drawStill(); }
    function scheduleBlink(){
      if(eyeTimer || !eyeOk || !EYES[curChar]) return;
      eyeTimer=setTimeout(blink, 2200+Math.random()*3800);
    }
    function blink(){
      eyeTimer=0;
      // 화면에서 빠졌거나 탭이 숨겨졌으면 여기서 멈춘다 — 다시 보이면 visibilitychange 가 켠다.
      if(!eyeOk || !EYES[curChar] || !canvas.isConnected || document.hidden) return;
      if(Date.now()<browUntil){ scheduleBlink(); return; }
      var seq=[[1,50],[2,85],[1,65],[0,0]];
      if(Math.random()<0.18) seq=[[1,50],[2,80],[1,60],[0,150],[1,50],[2,80],[1,60],[0,0]];
      (function step(i){
        setEye(seq[i][0]);
        if(i+1<seq.length) eyeTimer=setTimeout(function(){ eyeTimer=0; step(i+1); }, seq[i][1]);
        else scheduleBlink();
      })(0);
    }
    try{ document.addEventListener('visibilitychange', function(){ if(!document.hidden){ scheduleBlink(); swayKick(); } }); }catch(e){}

    var SWAY_ROT_DEG = 1.0, SWAY_NOD = 0.007, SWAY_TALK = 1.35, SWAY_IDLE_MS = 48;
    var swayPh = [Math.random()*6.283, Math.random()*6.283, Math.random()*6.283, Math.random()*6.283];
    var swayAmp = 1, swayAmpAt = 0, swayRaf = 0, swayTo = 0, swayLastAt = 0, swayVis = true, swayMq = null;
    var headCv = null, maskCv = null, maskFor = '', layersDirty = true;
    try{ swayMq = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)')) || null; }catch(e){ swayMq = null; }
    function swayReduced(){ return !!(swayMq && swayMq.matches); }
    function swayGeom(W, H){
      var h = HEAD[curChar], cr = cropRect; if(!h || !cr) return null;
      var kx = W / (h.w * (cr.r - cr.l)), ky = H / (h.h * (cr.b - cr.t));
      var y1 = (h.y1 - h.h*cr.t)*ky, y2 = (h.y2 - h.h*cr.t)*ky;
      return { px:(h.x - h.w*cr.l)*kx, y1:y1, y2:y2, py:(y1 + y2)/2, nw:h.nw*kx, nw2:h.w*0.094*kx };
    }
    // 지금 이 순간의 자세 — 두 사인을 섞어 «같은 동작의 되풀이» 로 안 보이게 한다(위상은 접속마다 무작위).
    function swayPose(W, H){
      if (!HEAD[curChar] || swayReduced()) return null;
      var g = swayGeom(W, H); if(!g) return null;
      var now = Date.now(), t = now / 1000, P = 6.283185307;
      var want = drawing ? SWAY_TALK : 1;
      swayAmp = swayAmpAt ? swayAmp + (want - swayAmp) * Math.min(1, Math.max(0, now - swayAmpAt) / 700) : want;
      swayAmpAt = now;
      var rot = SWAY_ROT_DEG * (0.62*Math.sin(P*t/7.3 + swayPh[0]) + 0.38*Math.sin(P*t/4.1 + swayPh[1]));
      var nod = SWAY_NOD * (0.6*Math.sin(P*t/5.6 + swayPh[2]) + 0.4*Math.sin(P*t/3.1 + swayPh[3]));
      return { px:g.px, py:g.py, rot:rot * swayAmp * Math.PI / 180, sy:1 + nod * swayAmp };
    }
    // 머리 경계 그림(알파=머리 몫) — 캐릭터·크기가 바뀔 때만 한 번 만든다.
    function swayMask(W, H){
      var key = curChar + ':' + W + 'x' + H;
      if (maskFor === key && maskCv) return true;
      var g = swayGeom(W, H); if(!g) return false;
      if (!maskCv) maskCv = document.createElement('canvas');
      maskCv.width = W; maskCv.height = H;
      var mx = maskCv.getContext('2d'), md = mx.createImageData(W, H), d = md.data, span = g.y2 - g.y1;
      for (var x = 0; x < W; x++){
        var s = (Math.abs(x + 0.5 - g.px) - g.nw) / g.nw2; s = s < 0 ? 0 : s > 1 ? 1 : s;
        var lift = s*s*(3 - 2*s) * span, a = g.y1 - lift, b = g.y2 - lift;
        for (var y = 0; y < H; y++){
          var yy = y + 0.5, w = yy <= a ? 1 : yy >= b ? 0 : 1 - ((yy - a)/span)*((yy - a)/span)*(3 - 2*(yy - a)/span);
          d[(y*W + x)*4 + 3] = Math.round(w * 255);
        }
      }
      mx.putImageData(md, 0, 0);
      maskFor = key; layersDirty = true;
      return true;
    }
    // comp 에서 «머리 몫»(경계 위)만 오려 둔다 — 얼굴이 바뀔 때만 다시 만든다.
    function swayLayers(W, H){
      if (!swayMask(W, H)) return false;
      if (!layersDirty && headCv) return true;
      if (!headCv) headCv = document.createElement('canvas');
      var cw = comp.width, ch = comp.height;          // comp 와 같은 «2배» 크기로 들고 있는다
      if (headCv.width !== cw || headCv.height !== ch){ headCv.width = cw; headCv.height = ch; }
      var x = headCv.getContext('2d');
      x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, cw, ch); x.drawImage(comp, 0, 0);
      x.globalCompositeOperation = 'destination-in'; x.drawImage(maskCv, 0, 0, cw, ch);
      x.globalCompositeOperation = 'source-over';
      layersDirty = false;
      return true;
    }
    // comp → 화면. 머리 캐릭터면 «몸 + 기운 머리», 아니면 그대로 옮긴다.
    //   ① 기운 경계(마스크)를 먼저 깔고 ② 'source-out' 으로 그 밖에만 comp(몸)를 두고
    //   ③ 'lighter' 로 기운 머리를 더한다 — 몸 몫이 «기운» 경계의 나머지라서 목에서 알파가 정확히 1.
    //   ⛔ 몸을 «기울기 전» 경계로 오려 두지 마세요: 머리가 옆으로 기울면 경계가 위아래로 어긋나
    //      목에 반투명한 띠(실측 알파 245/255)가 생깁니다.
    function present(){
      if (!vctx || !comp) return;
      var W = canvas.width, H = canvas.height, pose = null;
      var tilt = function(){ vctx.translate(pose.px, pose.py); vctx.rotate(pose.rot); vctx.scale(1, pose.sy); vctx.translate(-pose.px, -pose.py); };
      try {
        pose = swayPose(W, H);
        vctx.setTransform(1, 0, 0, 1, 0, 0); vctx.globalCompositeOperation = 'source-over';
        vctx.clearRect(0, 0, W, H);
        if (!pose || !swayLayers(W, H)) { vctx.drawImage(comp, 0, 0, W, H); return; }
        tilt(); vctx.drawImage(maskCv, 0, 0, W, H);
        vctx.setTransform(1, 0, 0, 1, 0, 0); vctx.globalCompositeOperation = 'source-out';
        vctx.drawImage(comp, 0, 0, W, H);
        vctx.globalCompositeOperation = 'lighter'; tilt();
        vctx.drawImage(headCv, 0, 0, W, H);
      } catch(e) {
        try { vctx.setTransform(1, 0, 0, 1, 0, 0); vctx.globalCompositeOperation = 'source-over'; vctx.clearRect(0, 0, W, H); vctx.drawImage(comp, 0, 0, W, H); } catch(_){}
      } finally {
        try { vctx.setTransform(1, 0, 0, 1, 0, 0); vctx.globalCompositeOperation = 'source-over'; } catch(_){}
      }
    }
    // 쉬는 동안의 움직임 — 말하는 중(drawing)에는 그리기 루프가 매 프레임 present() 를 부른다.
    function swayWanted(){
      return !!(vctx && comp && HEAD[curChar] && !swayReduced() && swayVis && !document.hidden && canvas.isConnected !== false);
    }
    //   ⚙️ 그린 뒤에는 다음 그림 때까지 «타이머» 로 기다렸다가 rAF 를 한 번 건다 — rAF 를 매 프레임 다시 걸면
    //      그리는 것은 초당 20번이어도 폰이 초당 60번 깨어납니다. 걸려 있는 것은 언제나 둘 중 «하나»(swayRaf 또는 swayTo).
    function swayTick(){
      swayRaf = 0;
      if (drawing || !swayWanted()) return;          // 멈춘다 — swayKick 이 다시 켠다
      var now = Date.now(), wait = SWAY_IDLE_MS - (now - swayLastAt);
      if (wait <= 4) { swayLastAt = now; present(); wait = SWAY_IDLE_MS; }
      swayTo = setTimeout(function(){ swayTo = 0; if (!swayRaf && !drawing && swayWanted()) swayRaf = requestAnimationFrame(swayTick); }, wait);
    }
    function swayKick(){ if (!swayRaf && !swayTo && !drawing && swayWanted()) swayRaf = requestAnimationFrame(swayTick); }
    try{
      if (swayMq){
        var onMq = function(){ present(); swayKick(); };
        if (swayMq.addEventListener) swayMq.addEventListener('change', onMq); else if (swayMq.addListener) swayMq.addListener(onMq);
      }
    }catch(e){}
    try{
      if (vctx && typeof IntersectionObserver === 'function'){
        new IntersectionObserver(function(es){
          var e = es && es[es.length - 1]; if (!e) return;
          swayVis = !!e.isIntersecting; if (swayVis) swayKick();
        }).observe(canvas);
      }
    }catch(e){}
    function prepareCues(el){
      var nextUrl=el.src||el.currentSrc||'';
      if(cueUrl!==nextUrl)mouthCues=null;cueUrl=nextUrl;
      var url=cueUrl;
      if(!window.AvatarVisemes || !url)return Promise.resolve(null);
      return window.AvatarVisemes.prepare(url).then(function(cues){
        if(boundEl===el && cueUrl===url && (el.src||el.currentSrc||'')===url)mouthCues=cues;
        return cues;
      }).catch(function(){});
    }
    function ensureCtx(){
      if(actx) return true; if(audioFailed) return false;
      try{ var AC=window.AudioContext||window.webkitAudioContext; if(!AC) throw 0;
        actx=new AC(); analyser=actx.createAnalyser(); analyser.fftSize=512;
        lipData=new Uint8Array(analyser.fftSize); return true;
      }catch(e){ audioFailed=true; return false; }
    }
    function rmsLevel(){
      if(!analyser) return 0;
      analyser.getByteTimeDomainData(lipData);
      var sum=0; for(var i=0;i<lipData.length;i++){ var v=(lipData[i]-128)/128; sum+=v*v; }
      return Math.sqrt(sum/lipData.length);
    }

    function setSpeaking(on){ if (wrap) wrap.classList.toggle('speaking', !!on); }
    // ⚠️ 이미지 캐릭터에는 sources 가 없다 — 예전처럼 sources[0][0] 을 바로 읽으면 여기서 죽는다.
    function ensureIdle(){ if(IDLE) return; var c = CHARACTERS[curChar] || {};
      IDLE = video.currentSrc || (c.sources && c.sources[0] && c.sources[0][0]) || ''; }
    function preloadStill(url){
      try{ var im=new Image(); im.onload=function(){ if(!drawing){ try{ ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(im,0,0,canvas.width,canvas.height); }catch(e){} layersDirty=true; present(); } }; im.src=url; }catch(e){}
    }

    // 초록 제거 크로마키: 초록 우세도(g - max(r,b)) 판정 + 가장자리 페더 + 스필 억제.
    // cropRect(l,t,r,b, 0~1 비율)만큼만 원본에서 잘라 캔버스 전체 크기로 확대해 그린다
    // (캔버스 해상도가 applyFrame() 에서 이미 이 crop 과 같은 비율로 맞춰져 있어 왜곡 없음).
    // 🎞 (2026-07-27 4차) 입모양 단계가 바뀔 때 프레임이 뚝 끊겨 보이던 것을 완화 —
    //   전환 직전 화면을 스냅샷(fadeData)해두고, 짧은 시간(FADE_MS) 동안 새 프레임과 섞어
    //   부드럽게 넘어가게 한다(showTier 에서 스냅샷을 남김).
    var fadeData = null, fadeT0 = 0, fadeCv = null;
    // 🎞 (v13) 전환 직전 화면 남기기 — 투명 그림 캐릭터는 «캔버스 사본» 으로 남겨 drawImage 로 섞는다
    //    (픽셀 루프보다 훨씬 가볍고, comp 가 2배여도 비용이 그대로다). 초록 지우기를 하는 영상
    //    캐릭터는 예전처럼 픽셀(getImageData)로 남긴다 — 그쪽은 섞기를 픽셀 루프 안에서 한다.
    function fadeSnap(now){
      fadeData = null;
      if (!keyedNow) {
        try {
          var src = ctx.canvas;
          if (!fadeCv) fadeCv = document.createElement('canvas');
          if (fadeCv.width !== src.width || fadeCv.height !== src.height) { fadeCv.width = src.width; fadeCv.height = src.height; }
          var fx = fadeCv.getContext('2d'); fx.clearRect(0, 0, fadeCv.width, fadeCv.height); fx.drawImage(src, 0, 0);
          fadeData = { cv: fadeCv, w: src.width, h: src.height }; fadeT0 = now; return;
        } catch(e) { fadeData = null; }
      }
      try { fadeData = ctx.getImageData(0,0,canvas.width,canvas.height); fadeT0 = now; } catch(e){ fadeData = null; }
    }
    // 🎭 (v13) 얼굴을 comp 에 짜 맞춘 뒤 화면으로 옮긴다(머리 캐릭터면 그때 머리를 기울인다).
    function keyFrame(){ composeFrame(); layersDirty = true; present(); }
    function composeFrame(){
      var srcEl, vw, vh;
      var pf=precisionFace(), precise=pf && mouthCues && !clipActive;
      if(precise && pf.base.complete && pf.base.naturalWidth && pf.mouths.complete && pf.mouths.naturalWidth){
        var stopped=!boundEl || boundEl.paused || boundEl.ended || buffering || !drawing;
        var sampled=(!stopped && window.AvatarVisemes.frame) ? window.AvatarVisemes.frame(mouthCues,boundEl.currentTime) : null;
        var pose=stopped ? 'X' : sampled ? sampled.pose : window.AvatarVisemes.at(mouthCues,boundEl.currentTime);
        if(!pf.rect.extra){if(pose==='G')pose='B';if(pose==='H')pose='C';}
        var ix='XABCDEFGH'.indexOf(pose), r=pf.rect;
        var bw=pf.base.naturalWidth,bh=pf.base.naturalHeight;
        var bx=bw*cropRect.l,by=bh*cropRect.t,sw=bw*(cropRect.r-cropRect.l),sh=bh*(cropRect.b-cropRect.t);
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(pf.base,bx,by,sw,sh,0,0,canvas.width,canvas.height);
        drawEyes(bx,by,sw,sh);
        var tile=sampled && sampled.tile,transition=sampled && tile>=0 && pf.transitions.complete && pf.transitions.naturalWidth;
        // Reviewed Noah wide-open/rest morphs double the teeth. Use the exact
        // phoneme anchor for these pairs until replacement artwork is available.
        if(transition && curChar==='noah' && ((sampled.from==='D' && (sampled.to==='X'||sampled.to==='A')) ||
          (sampled.to==='D' && (sampled.from==='X'||sampled.from==='A'))))transition=false;
        var sprite=transition?pf.transitions:pf.mouths,columns=transition?18:3;
        if(transition)ix=tile;
        ctx.drawImage(sprite,(ix%columns)*r.w,Math.floor(ix/columns)*r.h,r.w,r.h,
          (r.x-bx)/sw*canvas.width,(r.y-by)/sh*canvas.height,r.w/sw*canvas.width,r.h/sh*canvas.height);
        return;
      }
      if (imgFrames){
        srcEl = imgCur;
        if (!srcEl || !srcEl.complete || !srcEl.naturalWidth) return;   // 아직 안 받았으면 다음 프레임에
        vw = srcEl.naturalWidth; vh = srcEl.naturalHeight;
      } else {
        if (video.readyState < 2) return;
        srcEl = video; vw = video.videoWidth||canvas.width; vh = video.videoHeight||canvas.height;
      }
      var sx = Math.round(vw*cropRect.l), sy = Math.round(vh*cropRect.t);
      var sw = Math.round(vw*(cropRect.r-cropRect.l)), sh = Math.round(vh*(cropRect.b-cropRect.t));
      // 🖼 배경이 이미 투명한 PNG 는 «겹쳐 그리면» 앞 입모양이 유령처럼 남는다 — 항상 지우고 그린다.
      //    (초록 영상은 불투명이라 지우든 안 지우든 결과가 같다)
      try { ctx.clearRect(0,0,canvas.width,canvas.height);
            ctx.drawImage(srcEl, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            if (imgFrames) drawEyes(sx, sy, sw, sh); } catch(e){ return; }
      // 초록을 지울 필요도 없고(이미 투명) 섞을 것도 없으면 픽셀을 아예 만지지 않는다 —
      // getImageData/putImageData 가 폰에서 제일 비싼 구간이라 그만큼 가벼워진다.
      if (fadeData && fadeData.cv) {
        // 앞 화면을 새 화면 «위에» (1-a) 만큼 얹는다 — 둘 다 불투명한 곳은 정확히 섞이고,
        // 윤곽은 새 화면 것을 따른다(입 모양만 다른 세 장이라 윤곽이 같다).
        var fa = (Date.now() - fadeT0) / curFade;
        if (fa >= 1 || fadeData.w !== ctx.canvas.width || fadeData.h !== ctx.canvas.height) { fadeData = null; }
        else {
          try { ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = 1 - fa;
                ctx.drawImage(fadeData.cv, 0, 0, canvas.width, canvas.height); ctx.restore(); } catch(e){ fadeData = null; }
        }
        if (!keyedNow) return;
        fadeData = null;
      }
      if (!keyedNow && !fadeData) return;
      var im; try { im = ctx.getImageData(0,0,canvas.width,canvas.height); } catch(e){ return; }
      var d = im.data;
      // (2026-07-26) 상반신 크롭이 프레임 가장자리에 가까워지며, 머리카락 올올이
      // 초록 배경빛을 살짝 반사한 픽셀(diff 가 작아 기존엔 완전 불투명 그대로 통과)이
      // 드러나 초록 잔광으로 보였다 — diff>0 인 모든 픽셀은 알파는 그대로 두고
      // 초록만 mx 로 눌러 색만 지운다(디테일 보존 + 잔광 제거).
      if (keyedNow) for (var i=0;i<d.length;i+=4){
        var r=d[i], g=d[i+1], b=d[i+2];
        var mx = r>b?r:b;
        var diff = g - mx;
        if (diff > 38){ d[i+3]=0; }
        else if (diff > 10){ d[i+3] = ((38-diff)*255/28)|0; d[i+1] = mx; }
        else if (diff > 0){ d[i+1] = mx; }
      }
      if (fadeData && fadeData.data.length === d.length){
        var a = (Date.now() - fadeT0) / curFade;
        if (a >= 1) { fadeData = null; }
        else {
          var fd = fadeData.data;
          for (var j=0;j<d.length;j+=4){
            d[j]   = fd[j]   + (d[j]   - fd[j])   * a;
            d[j+1] = fd[j+1] + (d[j+1] - fd[j+1]) * a;
            d[j+2] = fd[j+2] + (d[j+2] - fd[j+2]) * a;
            d[j+3] = fd[j+3] + (d[j+3] - fd[j+3]) * a;
          }
        }
      } else if (fadeData) { fadeData = null; }   // 캔버스 크기가 바뀌었으면(캐릭터 전환) 안전하게 버림
      ctx.putImageData(im,0,0);
    }
    // 발화가 끝났는데도(onended 유실 등) 그리기가 안 멈춰 계속 움직이는 사고를 막는 안전망 —
    // "물린 오디오가 멈춰/끝나 있다"가 이 프레임 수만큼 연속되면 그리기 자체를 종료(자원 정리용).
    // (2026-07-26 2차) 예전엔 이 대기 구간(서버 TTS 네트워크 응답을 기다리는 동안 등)에도 입을
    // 계속 움직여서 "말은 안 하는데 입만 움직인다"로 보였다 — 실제로 소리가 안 나오는 동안은
    // (오디오가 멈춰/끝나 있으면) **바로** 입을 다물고, 안전망은 그리기를 끝내 rAF 자원만
    // 정리하는 역할로 좁힌다.
    var idleTicks = 0;
    // 🗣 (2026-07-27) 소리 크기 → 입모양 3단계. 임계값은 실제 목소리로 다시 들어보며 조정 가능.
    function tierFor(level){
      if(level <= 0.04) return 'closed';
      if(level <= 0.09) return 'medium';
      return 'wide';
    }
    var lastSwitchAt = 0;
    function showTier(tier, immediate){
      if(tier === curTier || !curPoses) return;
      // 🔴 (2026-07-27 3차) setCharacter() 직후(video.load() 로 리로드 중) 는 readyState 가
      //   낮아 seek 이 조용히 씹힌다. 그런데도 curTier 를 먼저 확정해버려서, 나중에 영상이
      //   다 준비돼도 "이미 그 단계다"라고 믿고 다시는 seek 을 시도하지 않았다 — 남자(히어로)
      //   아바타로 바꾼 뒤 첫 발화의 입이 영원히 멈춰 있던 원인. 여자는 페이지 로드시 이미
      //   기본 캐릭터라 이 리로드 경합이 없어서 안 걸렸다. → 준비 전이면 curTier 를 그대로 두고
      //   다음 프레임에 다시 시도한다(성공했을 때만 확정).
      var now = Date.now();
      if(imgFrames){
        // 🖼 이미지 캐릭터 — seek 이 없으므로 v5 사고(입이 멈춤)가 구조적으로 안 난다.
        //    아직 안 받은 장이면 curTier 를 «확정하지 않고» 다음 프레임에 다시 시도한다
        //    (v3 사고와 같은 자리 — 확정해버리면 다 받은 뒤에도 영영 안 바꾼다).
        var imN = imgFrames[tier];
        if(!imN || !imN.complete || !imN.naturalWidth) return;
        if(!immediate && now - lastSwitchAt < curHold) return;
        fadeSnap(now);
        curTier = tier; lastSwitchAt = now; imgCur = imN;
        return;
      }
      if(video.readyState < 2) return;
      if(!immediate && now - lastSwitchAt < curHold) return;
      var t = curPoses[tier];
      if(typeof t !== 'number') return;
      // 🎞 전환 직전 화면을 스냅샷해서 keyFrame() 이 새 프레임과 부드럽게 섞도록 넘겨준다.
      fadeSnap(now);
      curTier = tier; lastSwitchAt = now;
      try{ if(!video.paused) video.pause(); video.currentTime = t; }catch(e){}
    }
    function loop(){
      if(!drawing){ raf=0; return; }
      if(boundEl && analyser && !clipActive){
        if(boundEl.paused || boundEl.ended || buffering){
          showTier('closed', true);                        // 말 안 하는 중 → 다문 입 프레임에 고정
          loudNow = false;
          idleTicks++;
          if(idleTicks > 300){ doStop(); return; }         // 5초 넘게 안 멈춰지면 plainStop() 유실로 보고 안전 종료
        } else {
          idleTicks = 0;
          if(mouthCues && window.AvatarVisemes){
            // Existing three-pose characters still follow cue timing; no identity change.
            var cue=window.AvatarVisemes.at(mouthCues,boundEl.currentTime);
            var tier=(cue==='X'||cue==='A')?'closed':(cue==='D'?'wide':'medium');
            loudNow = (tier==='wide');
            showTier(tier,tier==='closed');
          }else{ var lt=tierFor(rmsLevel()); loudNow = (lt==='wide'); showTier(lt); }
        }
      } else {
        // 🔇 분석 불가능한 음성(브라우저 speechSynthesis) — 실제 음량을 모르니 poses 대신
        //    기존처럼 루프를 계속 재생해 "말하는 느낌"만 흉내낸다.
        idleTicks = 0; loudNow = false;
        if(imgFrames){
          // 🖼 이미지 캐릭터는 '재생' 이 없으므로 세 장을 일정 간격으로 번갈아 보여 준다.
          //    ⚠️ 간격은 그 캐릭터의 curHold 보다 «커야» 한다 — 작으면 showTier 가 매번
          //       되돌아가 입이 한 장에 굳는다. (v8) hold 가 캐릭터별로 달라졌으므로
          //       숫자를 박지 않고 curHold 에서 끌어온다 — 지금 이미지 캐릭터는 hold 를
          //       안 적어 90 이라 결과는 예전과 같은 150ms 다.
          var SEQ = ['closed','medium','wide','medium'];
          var seqMs = Math.max(150, curHold + 60);
          showTier(SEQ[Math.floor(Date.now() / seqMs) % SEQ.length]);
        } else {
          curTier = null;
          if(video.paused){ try{ video.playbackRate=1; video.play(); }catch(e){} }
        }
      }
      // 👁 (v10) 눈썹 — 크게 벌린 입(강세) 순간에 가끔, 짧게. 깜빡이는 중에는 걸지 않는다.
      var nowB = Date.now();
      if(eyeState===3 && nowB>=browUntil) eyeState=0;
      else if(loudNow && eyeOk && eyeState===0 && nowB>=browNext){
        browNext = nowB + 3500 + Math.random()*4500;
        if(Math.random() < 0.55){ browUntil = nowB + 420 + Math.random()*260; eyeState=3; }
      }
      keyFrame();
      raf=requestAnimationFrame(loop);
    }
    function startDraw(){ idleTicks=0; curTier=null; lastSwitchAt=0; fadeData=null; drawing=true;
      browNext=Date.now()+1200+Math.random()*1500;   // 말 첫마디부터 눈썹을 올리지 않는다
      if(!raf) raf=requestAnimationFrame(loop); }
    function stopDraw(){ drawing=false; if(raf){ try{cancelAnimationFrame(raf);}catch(e){} raf=0; } swayKick(); }
    function drawStill(){ keyFrame(); }
    function doStop(){
      setSpeaking(false); stopDraw();
      // Cancellation must end on the closed pose, even inside the minimum hold window.
      showTier('closed', true); fadeData=null;
      if(eyeState===3){ eyeState=0; browUntil=0; }       // 말이 끝나면 올린 눈썹도 내린다
      try{ video.pause(); }catch(e){} drawStill();
    }
    video.addEventListener('loadeddata', function(){ if(!drawing) drawStill(); });
    video.addEventListener('seeked',     function(){ if(!drawing) drawStill(); });
    mountCharacter(curChar);   // 🖼 이미지 캐릭터면 입모양 3장을 여기서 받기 시작한다(영상이면 옛 동작 그대로)

    window.MangoAvatar = {
      // TTS 오디오(HTMLAudioElement)를 물려 음량 립싱크. 요소당 MediaElementSource 1회.
      //   소리 경로(destination) 연결 필수 — 안 하면 음소거됨.
      attach: function(audioEl){
        if(!audioEl) return;
        if(!ensureCtx()) return;
        try{
          var binding = bindings.get(audioEl);
          if(!binding){
            var src=actx.createMediaElementSource(audioEl);
            var tap=actx.createAnalyser(); tap.fftSize=512;
            src.connect(actx.destination);
            src.connect(tap);
            binding={ source:src, analyser:tap };
            bindings.set(audioEl, binding);
            // Only the selected element may drive the face. Old audio events are ignored.
            audioEl.addEventListener('loadeddata', function(){if(boundEl===audioEl)prepareCues(audioEl);});
            audioEl.addEventListener('playing', function(){
              if(boundEl!==audioEl || clipActive) return;
              if((audioEl.currentSrc||audioEl.src||'')!==cueUrl || !mouthCues)prepareCues(audioEl);
              buffering=false; window.MangoAvatar.plainStart();
            });
            ['waiting','seeking'].forEach(function(event){
              audioEl.addEventListener(event, function(){
                if(boundEl!==audioEl || clipActive) return;
                buffering=true; showTier('closed', true); fadeData=null; drawStill();
              });
            });
            // A seek while already playing need not emit another 'playing' event.
            // Resume from the new audio position once that seek has usable data.
            audioEl.addEventListener('seeked', function(){
              if(boundEl!==audioEl || clipActive || audioEl.paused || audioEl.ended || audioEl.readyState<3)return;
              buffering=false;window.MangoAvatar.plainStart();
            });
            ['pause','ended','emptied','error'].forEach(function(event){
              audioEl.addEventListener(event, function(){
                if(boundEl!==audioEl || clipActive) return;
                buffering=false; doStop();
              });
            });
          }
          boundEl=audioEl; analyser=binding.analyser; buffering=false;
          prepareCues(audioEl);
          lipData=new Uint8Array(analyser.fftSize);
          if(actx.state==='suspended') actx.resume();
          if(!audioEl.paused && !audioEl.ended) window.MangoAvatar.plainStart();
        }catch(e){ /* Preserve audible playback if Web Audio is unavailable. */ }
      },
      prepare: function(audioEl){
        if(boundEl!==audioEl)window.MangoAvatar.attach(audioEl);
        var pf=precisionFace();
        return Promise.all([prepareCues(audioEl),pf ? pf.ready : Promise.resolve()]).then(function(results){return results[0];});
      },
      // 캐릭터 전환 — 'emma'|'jake'|'lily'|'noah' (옛 'female'|'male' 도 받습니다).
      setCharacter: function(name){
        name = CHAR_ALIAS[name] || name;
        var c = CHARACTERS[name]; if(!c || name===curChar) return;
        curChar = name; IDLE = null;
        applyFrame(name);
        mountCharacter(name);
      },
      // 말하기 시작: 그리기 루프 시작(오디오가 물려 재생 중이면 자동으로 음량 립싱크)
      plainStart: function(){ ensureIdle(); setSpeaking(true); try{ if(actx&&actx.state==='suspended') actx.resume(); }catch(e){} startDraw(); },
      plainStop:  function(){ doStop(); },
      // 미리 만든 립싱크 클립 재생(음성코치 전용) → 캔버스 키잉. 끝나면 idle 복귀.
      playClip: function(id){
        return new Promise(function(resolve, reject){
          // ⚠️ 미리 만든 립싱크 클립(teacher-say-*)은 «옛 강사 얼굴» 과 짝이다 —
          //    이미지 캐릭터 위에 틀면 다른 사람 얼굴이 튀어나온다. 쓰려면 female_classic 으로 바꿔서.
          if(imgFrames){ reject(new Error('clip_needs_video_character')); return; }
          ensureIdle();
          var useWebm = (video.currentSrc||'').indexOf('.webm')>=0 ||
                        (video.canPlayType && video.canPlayType('video/webm')!=='');
          var url = '/img/teacher-say-' + id + (useWebm ? '.webm' : '.mp4');
          var done=false;
          function end(ok, err){
            if(done) return; done=true;
            clipActive=false;
            video.removeEventListener('ended', onEnd);
            video.removeEventListener('error', onErr);
            stopDraw(); setSpeaking(false);
            try{ video.muted=true; video.loop=true; video.src=IDLE; video.load(); }catch(e){}
            ok ? resolve() : reject(err||new Error('clip_failed'));
          }
          var onEnd=function(){ end(true); };
          var onErr=function(){ end(false, new Error('clip_load_error')); };
          video.addEventListener('ended', onEnd);
          video.addEventListener('error', onErr);
          try{
            clipActive=true;                    // 클립 재생 중엔 TTS 무음 감시 타이머(idleTicks)가 끼어들지 않게
            setSpeaking(true);
            video.loop=false; video.muted=false; video.src=url; video.currentTime=0;
            var p=video.play(); startDraw();
            if(p&&p.catch) p.catch(function(e){ end(false, e); });
          }catch(e){ end(false, e); }
        });
      }
    };
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
