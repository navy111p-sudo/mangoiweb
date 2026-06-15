# 망고아이 ERP 관리자 대시보드 고도화 프롬프트

> 스택: HTML + Tailwind CSS(+ lucide 아이콘, Chart.js). 아래 **프롬프트**를 AI/개발자에게 그대로 전달하고,
> **참고 구현 코드**를 붙여넣으면 바로 동작합니다. 색상 토큰 `#EF4444`(red-500) 기준.

---

## 1) 그대로 복사해서 쓰는 프롬프트

```
역할: 너는 20년차 시니어 프론트엔드 개발자이자 UX 디자이너야.
맥락: 망고아이 ERP 관리자 대시보드(HTML/Tailwind CSS/lucide/Chart.js)를 고도화한다.
      세련되고 깔끔하며, 반응형·다크모드·접근성(aria)을 지킨다. 색상은 Tailwind 토큰을 쓰되
      경고색은 #EF4444(red-500)로 통일한다.

다음 4가지를 구현해줘:

1. [실시간 수업 카드]
   - 각 수업 카드는 데이터에 alert 상태(예: 'AI 이상감지 — 침묵 20초')를 가질 수 있다.
   - alert 카드는 테두리를 #EF4444 로 하고 Pulse(깜빡임) 애니메이션을 준다(box-shadow 확산).
   - alert 카드는 목록의 '가장 최상단'에 오도록 정렬한다(여러 개면 모두 위로).
   - 정상 카드는 일반 보더. prefers-reduced-motion 사용자는 애니메이션을 끈다.

2. [운영 자동화 영역]
   - 각 항목의 토글 스위치(Toggle) 바로 옆에 작은 '설정 바로가기' 아이콘 버튼(톱니바퀴/settings)을 둔다.
   - hover 시 배경 강조 + title/aria-label "설정 바로가기". 클릭 시 해당 설정 패널로 이동(또는 모달).

3. [우측 상단 GNB]
   - 프로필 이미지 '좌측'에 종(bell) 알림 아이콘을 둔다.
   - 종 우상단에 미확인 알림 개수를 빨간 원형 배지(#EF4444)로 표시한다(0이면 숨김, 99+ 처리).
   - 클릭 시 알림 드롭다운/패널을 연다. aria-label "알림 N건".

4. [매출 차트]
   - Chart.js 라인 차트의 각 데이터 포인트에 마우스를 올리면 상세 수치 툴팁을 띈다.
   - 단, 기본 canvas 툴팁이 아니라 'CSS로 스타일링한 커스텀 HTML 툴팁'으로 구현한다
     (Chart.js external tooltip 핸들러 + CSS). 어두운 배경·둥근 모서리·말풍선 꼬리·부드러운 페이드.

제약:
- Tailwind 유틸 우선, 커스텀은 <style>에 최소화. 외부 CDN은 jsDelivr 사용.
- 더미 데이터로 동작하는 자가완결 예시로 작성. 주석으로 핵심 의도 설명.
출력: 변경 부위별 코드 블록 + 적용 위치 설명.
```

---

## 2) 참고 구현 코드 (바로 붙여넣기)

### 2-1. 실시간 수업 카드 — 이상감지 Pulse + 최상단 정렬

```html
<!-- 컨테이너는 flex-col 이어야 order 정렬이 먹는다 -->
<div id="liveWrap" class="flex flex-col gap-2"></div>

<style>
  /* #EF4444 테두리 + 깜빡이는 확산 그림자 */
  @keyframes ai-alert-pulse {
    0%   { box-shadow: 0 0 0 0 rgba(239,68,68,.55); }
    70%  { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
    100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
  }
  .live-card[data-alert="1"] {
    border: 2px solid #EF4444 !important;
    animation: ai-alert-pulse 1.3s cubic-bezier(.4,0,.6,1) infinite;
    order: -1;            /* flex 컨테이너에서 최상단으로 */
  }
  /* 접근성: 모션 최소화 사용자는 깜빡임 끄고 테두리만 */
  @media (prefers-reduced-motion: reduce) {
    .live-card[data-alert="1"] { animation: none; }
  }
</style>

<script>
  const ROOMS = [
    { name:'김민서 강사', sub:'초등 영어 · 302호', state:'수업중',   alert:0 },
    { name:'박지후 강사', sub:'중등 수학 · 105호', state:'침묵 20초', alert:1 }, // AI 이상감지
    { name:'이서연 강사', sub:'화상 1:1 · 205호', state:'정상',     alert:0 },
  ];
  function renderLive(){
    // alert=1 을 위로 (order:-1 이 시각 정렬을 보장하지만, 데이터도 정렬해두면 견고)
    const list = [...ROOMS].sort((a,b)=> b.alert - a.alert);
    document.getElementById('liveWrap').innerHTML = list.map(r => `
      <div class="live-card flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white"
           data-alert="${r.alert}">
        <span class="w-9 h-9 rounded-lg ${r.alert?'bg-red-50 text-red-500':'bg-slate-100 text-slate-500'} grid place-items-center">
          <i data-lucide="${r.alert?'shield-alert':'radio'}" class="w-4 h-4"></i>
        </span>
        <div class="min-w-0">
          <p class="text-sm font-semibold truncate">${r.name}</p>
          <p class="text-[11px] text-slate-400 truncate">${r.sub}</p>
        </div>
        <span class="ml-auto text-xs font-bold px-2 py-1 rounded-full
              ${r.alert?'bg-red-50 text-red-600':'bg-emerald-50 text-emerald-600'}">● ${r.state}</span>
      </div>`).join('');
    window.lucide && lucide.createIcons();
  }
  renderLive();
</script>
```

### 2-2. 운영 자동화 — 토글 옆 '설정 바로가기'(톱니) 아이콘

```html
<div class="flex items-center gap-2">
  <!-- 토글 스위치 -->
  <label class="switch">
    <input type="checkbox" checked aria-label="자동 알림톡 발송">
    <span class="slider"></span>
  </label>
  <!-- 설정 바로가기: 토글 '옆'에 작게 -->
  <button type="button"
          class="grid place-items-center w-7 h-7 rounded-lg text-slate-400
                 hover:text-indigo-600 hover:bg-slate-100 transition"
          title="설정 바로가기" aria-label="설정 바로가기"
          onclick="openSettings('autoNotify')">
    <i data-lucide="settings" class="w-4 h-4"></i>
  </button>
</div>

<style>
  /* 토글 스위치(참고) */
  .switch{position:relative;display:inline-block;width:44px;height:24px}
  .switch input{opacity:0;width:0;height:0}
  .slider{position:absolute;inset:0;cursor:pointer;background:#cbd5e1;border-radius:9999px;transition:.25s}
  .slider:before{content:"";position:absolute;height:18px;width:18px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.25s}
  .switch input:checked+.slider{background:#6366f1}
  .switch input:checked+.slider:before{transform:translateX(20px)}
</style>

<script>
  function openSettings(key){ /* 해당 설정 패널/모달 열기 */ console.log('설정 이동:', key); }
</script>
```

### 2-3. 우측 상단 GNB — 알림 개수 배지 종 아이콘 (프로필 좌측)

```html
<div class="flex items-center gap-2">
  <!-- 종 아이콘 + 빨간 개수 배지 (프로필 '좌측') -->
  <button id="bellBtn" class="relative p-2.5 rounded-xl hover:bg-slate-100 transition"
          aria-label="알림 5건" onclick="toggleNotif()">
    <i data-lucide="bell" class="w-5 h-5 text-slate-600"></i>
    <span id="bellCount"
          class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full
                 bg-[#EF4444] text-white text-[10px] font-bold grid place-items-center
                 ring-2 ring-white">5</span>
  </button>
  <!-- 프로필 -->
  <img src="https://i.pravatar.cc/64?img=12" class="w-9 h-9 rounded-full ring-2 ring-white" alt="프로필"/>
</div>

<script>
  // 개수 갱신: 0이면 배지 숨김, 99 초과는 99+
  function setNotifCount(n){
    const el = document.getElementById('bellCount');
    document.getElementById('bellBtn').setAttribute('aria-label', `알림 ${n}건`);
    if(!n){ el.style.display='none'; return; }
    el.style.display='grid';
    el.textContent = n > 99 ? '99+' : n;
  }
  function toggleNotif(){ /* 알림 드롭다운 열기 */ }
  setNotifCount(5);
</script>
```

### 2-4. 매출 차트 — CSS 커스텀 툴팁 (Chart.js external tooltip)

```html
<!-- 차트 래퍼는 position:relative + 고정 높이 (툴팁 좌표 기준) -->
<div class="relative h-[260px]"><canvas id="revChart"></canvas></div>

<style>
  /* CSS로 스타일링한 커스텀 툴팁 (canvas 기본 툴팁 대체) */
  .chart-tip{
    position:absolute; transform:translate(-50%,-115%);
    pointer-events:none; white-space:nowrap; z-index:20; opacity:0;
    background:#0f172a; color:#fff; padding:8px 11px; border-radius:10px;
    box-shadow:0 8px 24px -8px rgba(15,23,42,.5);
    transition:opacity .15s ease, left .08s ease, top .08s ease;
  }
  .chart-tip::after{ /* 말풍선 꼬리 */
    content:""; position:absolute; left:50%; top:100%; transform:translateX(-50%);
    border:6px solid transparent; border-top-color:#0f172a;
  }
  .chart-tip .t-label{ font-size:11px; color:#94a3b8; }
  .chart-tip .t-value{ font-size:14px; font-weight:800; }
</style>

<script>
  // 점에 hover 시 HTML 툴팁을 띄우는 external 핸들러
  function externalTooltip(ctx){
    const { chart, tooltip } = ctx;
    const wrap = chart.canvas.parentNode;
    let tip = wrap.querySelector('.chart-tip');
    if(!tip){ tip = document.createElement('div'); tip.className='chart-tip'; wrap.appendChild(tip); }
    if(tooltip.opacity === 0){ tip.style.opacity = 0; return; }   // 벗어나면 페이드아웃
    const dp = tooltip.dataPoints[0];
    tip.innerHTML = `<div class="t-label">${dp.label}</div><div class="t-value">₩${dp.formattedValue}M</div>`;
    tip.style.opacity = 1;
    tip.style.left = chart.canvas.offsetLeft + tooltip.caretX + 'px';
    tip.style.top  = chart.canvas.offsetTop  + tooltip.caretY + 'px';
  }

  new Chart(document.getElementById('revChart'), {
    type:'line',
    data:{ labels:['12월','1월','2월','3월','4월','5월','6월'],
      datasets:[{ data:[28,31,30,36,38,40,42.6], borderColor:'#6366f1', borderWidth:3,
        tension:.4, pointRadius:4, pointHoverRadius:6,
        pointBackgroundColor:'#fff', pointBorderColor:'#6366f1', pointBorderWidth:2 }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'index', intersect:false },   // 점 근처에서도 반응
      plugins:{
        legend:{ display:false },
        tooltip:{ enabled:false, external:externalTooltip }  // 기본 끄고 커스텀 사용
      },
      scales:{ y:{ ticks:{ callback:v=>'₩'+v+'M' } } }
    }
  });
</script>
```

---

## 적용 메모
- 1번의 `order:-1`은 컨테이너가 `display:flex; flex-direction:column`일 때만 동작합니다(그래서 `flex flex-col`).
- 4번 툴팁은 차트 래퍼에 `position:relative`가 있어야 좌표가 맞습니다.
- 모든 경고/알림 빨강은 `#EF4444`(Tailwind `red-500`)로 통일했습니다.
- 다크모드를 쓰면 `.chart-tip`, `.live-card` 배경/보더에 `dark:` 대응만 추가하면 됩니다.
