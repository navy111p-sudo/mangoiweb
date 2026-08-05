# 🛸 Space Monster Hunter — 실사 제작 기획안

> **목표**: 오락실 라이트건 게임 수준의 고퀄리티 우주 괴물 슈팅 게임  
> **핵심**: 모든 크리처·배경·VFX를 **실사 영상** 기반으로 제작  
> **기술 스택**: Higgsfield AI + FFmpeg + Python 자동화 + HTML5 게임

---

## 📊 제작 파이프라인 (전체 흐름)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1️⃣  콘셉트 & 프롬프트 (House of the Dead 원근감 방식)         │
│    • 우주 괴물 8종 (각 정면 영상 필요)                         │
│    • 원근감: 멀리서 작게 시작 → 점점 커지며 다가옴          │
│    • 각 괴물마다 여러 크기/깊이의 프레임 필요                 │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2️⃣  Higgsfield AI 동영상 생성 (MCP)                           │
│    • 각 괴물: "정면 카메라, 움직이는 자세 (걷기/공격)"       │
│    • 배경: 단색(초록/파랑) - 나중에 제거 용이                │
│    • 해상도: 1080p 이상 (깊이감 표현을 위해 고해상도)       │
│    • 각 괴물당 30초 영상 × 8종                                │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3️⃣  비디오 → 멀티-레벨 프레임 추출 (FFmpeg + Python)          │
│    • 1개 영상에서 여러 크기의 이미지 추출:                     │
│      Level 1 (멀음): 80x100px → Level 10 (가까움): 500x600px │
│    • 각 레벨마다 4프레임 (애니메이션 루프)                     │
│    • 배경 제거 (초록 스크린 키잉)                              │
│    • 산출물: alien-tripod-level-01.png ~ level-10.png        │
│    • 총 8종 × 10레벨 × 4프레임 = 320개 PNG                   │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4️⃣  HTML5 게임 (원근감 애니메이션)                             │
│    • CSS keyframes: scale (80% → 500%) + translateY (위로)    │
│    • 지속시간: 4~6초 (멀리서 다가오는 시간)                   │
│    • 경로: 좌측/중앙/우측 3가지                                │
│    • 클릭 감지 → 히트 이펙트 (폭발, 점수)                     │
│    • 최종 파일: `student-game-space-monster.html`             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎬 Higgsfield AI — 프롬프트 & 기획

### **우주 괴물 8종 (각 30~60초 영상)**

| 번호 | 괴물명 | 영어 단어 | AI 프롬프트 | 스타일 | 용량 추정 |
|---|---|---|---|---|---|
| 1 | 트리포드 | TRIPOD | "Three-legged alien creature with long tentacles, bioluminescent green, walking across metal spaceship floor. Cinematic, photorealistic." | 곤충형 | 8MB |
| 2 | 스라임 | BLOB | "Gelatinous pink alien blob, amorphous form, pulsating with internal organs visible, crawling on spaceship wall. Photoreal, 4K quality." | 수중형 | 7MB |
| 3 | 스파이더 | SPIDER | "Metallic purple alien spider with 8 legs, chrome exoskeleton, climbing spaceship ceiling, threatening stance. Cinematic, highly detailed." | 거미형 | 9MB |
| 4 | 사이클롭스 | CYCLOPS | "One-eyed alien giant with muscular red body, single large eye glowing bright, aggressive attack pose. Photorealistic, epic scale." | 인형형 | 10MB |
| 5 | 박쥐형 | FLYER | "Bat-like creature with blue wings, alien head, hovering in zero gravity. Smooth motion, bioluminescent trails. Cinematic." | 비행형 | 8MB |
| 6 | 촉수괴물 | TENTACLE | "Floating octopus-like entity, translucent tentacles with suckers, glowing orange, moving mysteriously. Deep space environment." | 촉수형 | 8MB |
| 7 | 갑옷괴물 | ARMOR | "Armored crystalline alien, geometric faceted body, blue/silver, walking with heavy steps. Photorealistic, intimidating." | 갑옷형 | 9MB |
| 8 | 유령형 | PHANTOM | "Ethereal ghostly alien, semi-transparent, energy-based form, floating through spaceship wall. Glowing aura, eerie atmosphere." | 에너지형 | 7MB |

**배경 2종**

| 배경 | 프롬프트 | 용량 |
|---|---|---|
| **우주선 내부** | "Inside a futuristic alien spaceship, metal walls with glowing panels, neon lights, zero gravity atmosphere. Cinematic, 4K." | 5MB |
| **우주 배경** | "Deep space with distant stars and nebula, cosmic atmosphere, photorealistic. Perfect for alien creature encounters." | 4MB |

---

## 🖥️ 프로그램 스택 & 연결 방식

### **1단계: AI 동영상 생성 (Higgsfield MCP)**

```javascript
// Node.js 스크립트: cloudflare-deploy/build-space-monster-videos.mjs
import { generateVideo } from '@higgsfield/mcp-client'

const creatures = [
  { name: 'tripod', prompt: '...', duration: 30 },
  { name: 'blob', prompt: '...', duration: 30 },
  // ... 8종 전부
]

for (const creature of creatures) {
  console.log(`🎬 Generating ${creature.name}...`)
  const videoPath = await generateVideo({
    prompt: creature.prompt,
    duration: creature.duration,
    quality: '4k',
    outputFormat: 'mp4'
  })
  console.log(`✅ Saved to: ${videoPath}`)
}
```

**MCP 연결**:
- Higgsfield MCP는 이미 망고아이에 연결됨
- 함수: `generate_video(prompt, duration, quality)`
- 출력: `creature-001.mp4`, `creature-002.mp4` 등

---

### **2단계: 영상 → 멀티-레벨 프레임 (House of the Dead 원근감)**

```bash
# cloudflare-deploy/build-space-monster-levels.py
#!/usr/bin/env python3
# House of the Dead 방식: 1개 영상 → 10개 깊이 레벨 (80px → 500px)

import subprocess
import os
from PIL import Image
import numpy as np
from pathlib import Path

VIDEO_DIR = './temp/videos'
OUTPUT_DIR = './public/img/space-monsters'
FRAME_COUNT = 4  # 각 레벨당 4프레임 (애니메이션)
FPS = 4  # 4fps = 자연스러운 루프

# 레벨 정의: 멀리서(80px) → 가까이(500px)
LEVELS = [
    (80, 100),      # Level 1: 멀림 (화면 하단에 작게)
    (120, 150),     # Level 2
    (160, 200),     # Level 3
    (200, 250),     # Level 4
    (240, 300),     # Level 5: 중간
    (280, 350),     # Level 6
    (320, 400),     # Level 7
    (360, 450),     # Level 8
    (420, 525),     # Level 9
    (500, 600),     # Level 10: 가까움 (화면 상단, 큼)
]

def extract_frames(video_path):
    """영상에서 프레임 추출 (고해상도 1080p)"""
    frames_dir = f'{VIDEO_DIR}/temp_frames'
    os.makedirs(frames_dir, exist_ok=True)
    
    # FFmpeg: 1080p 유지하며 프레임 추출
    cmd = f'''ffmpeg -i {video_path} \
        -vf "fps={FPS}" \
        -vframes {FRAME_COUNT} \
        {frames_dir}/frame_%02d.png'''
    
    subprocess.run(cmd, shell=True, capture_output=True)
    return sorted(Path(frames_dir).glob('frame_*.png'))

def remove_background(frame_path):
    """초록 스크린 제거 (투명화)"""
    img = Image.open(frame_path).convert('RGBA')
    data = np.array(img)
    
    # RGB 채널에서 초록색 감지 (G > R, G > B)
    green_mask = (data[:,:,1] > 120) & (data[:,:,0] < 100) & (data[:,:,2] < 100)
    data[green_mask, 3] = 0  # 투명화
    
    return Image.fromarray(data)

def create_level_frames(frames, creature_name, width, height):
    """특정 크기로 리사이즈한 프레임 생성"""
    resized = []
    for frame_path in frames:
        img = remove_background(frame_path)
        # 비율 유지하며 리사이즈
        img.thumbnail((width, height), Image.Resampling.LANCZOS)
        resized.append(img)
    return resized

def save_level_images(frames, creature_name, level_num, width, height):
    """각 레벨의 프레임들을 개별 파일로 저장"""
    for idx, frame in enumerate(frames):
        output_path = f'{OUTPUT_DIR}/{creature_name}-level-{level_num:02d}-frame-{idx:02d}.png'
        frame.save(output_path, 'PNG')
    
    print(f"  ✅ Level {level_num}: {width}x{height}px × {len(frames)}frames")

# 실행
creatures = ['tripod', 'blob', 'spider', 'cyclops', 'flyer', 'tentacle', 'armor', 'phantom']
os.makedirs(OUTPUT_DIR, exist_ok=True)

for creature in creatures:
    video_path = f'{VIDEO_DIR}/{creature}.mp4'
    if not os.path.exists(video_path):
        print(f"⚠️  {video_path} 없음, 스킵")
        continue
    
    print(f"\n🎬 {creature}:")
    frames = extract_frames(video_path)
    
    # 10개 레벨 생성 (멀리서 → 가까이)
    for level_num, (width, height) in enumerate(LEVELS, 1):
        resized_frames = create_level_frames(frames, creature, width, height)
        save_level_images(resized_frames, creature, level_num, width, height)

print("\n✨ 모든 레벨 프레임 생성 완료! (총 8종 × 10레벨 × 4프레임 = 320개)")
```

**실행**:
```bash
cd cloudflare-deploy
python3 build-space-monster-sprites.py
```

**산출물**:
- `public/img/space-monsters/sprite-tripod.png` (256x1536, 6프레임)
- `public/img/space-monsters/sprite-blob.png`
- ... (8종 전부)

---

### **3단계: HTML5 게임 (House of the Dead 원근감 방식)**

```html
<!-- cloudflare-deploy/public/student-game-space-monster.html -->
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Space Monster Hunter — 우주 괴물 퇴치</title>
  <style>
    :root {
      --game-width: 800px;
      --game-height: 600px;
    }
    
    body {
      margin: 0;
      overflow: hidden;
      background: linear-gradient(135deg, #0a0e27 0%, #1a1a3e 50%, #0f1b4d 100%);
      font-family: 'Noto Sans KR', sans-serif;
    }
    
    #game {
      display: flex;
      flex-direction: column;
      height: 100vh;
      max-width: var(--game-width);
      margin: 0 auto;
    }
    
    #hud {
      padding: 12px 16px;
      background: rgba(8,16,34,.8);
      border-bottom: 1px solid rgba(59,130,246,.3);
      color: #e8f0ff;
      display: flex;
      justify-content: space-between;
      gap: 20px;
      font-size: 14px;
      font-weight: 600;
    }
    
    #gameField {
      position: relative;
      flex: 1;
      background: radial-gradient(ellipse at center bottom, rgba(59,130,246,.2), transparent 70%),
                  linear-gradient(180deg, #0a1628 0%, #1a1a3e 100%);
      overflow: hidden;
      cursor: crosshair;
    }
    
    /* 괴물 컨테이너 — 각 레벨의 프레임을 순서대로 표시 */
    .monster {
      position: absolute;
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      will-change: transform, opacity;
      cursor: pointer;
    }
    
    /* House of the Dead 방식: 멀리서 작게 시작 → 다가오면서 커짐 */
    @keyframes approachLeft {
      0% {
        left: -100px;
        opacity: 0;
      }
      5% {
        opacity: 1;
      }
      95% {
        opacity: 1;
      }
      100% {
        left: -50px;
        opacity: 0;
      }
    }
    
    @keyframes approachCenter {
      0% {
        left: 50%;
        transform: translateX(-50%) scale(0.16);
        opacity: 0;
      }
      5% {
        opacity: 1;
      }
      95% {
        opacity: 1;
      }
      100% {
        left: 50%;
        transform: translateX(-50%) scale(1.0);
        opacity: 0;
      }
    }
    
    @keyframes approachRight {
      0% {
        right: -100px;
        opacity: 0;
      }
      5% {
        opacity: 1;
      }
      95% {
        opacity: 1;
      }
      100% {
        right: -50px;
        opacity: 0;
      }
    }
    
    .monster.approach-left {
      animation: approachLeft 5s linear forwards;
      bottom: 120px;
    }
    
    .monster.approach-center {
      animation: approachCenter 5s linear forwards;
      bottom: 140px;
    }
    
    .monster.approach-right {
      animation: approachRight 5s linear forwards;
      bottom: 120px;
    }
    
    /* 프레임 애니메이션 (걷기) */
    @keyframes walkCycle {
      0% { background-image: url('var(--frame-0)'); }
      33% { background-image: url('var(--frame-1)'); }
      66% { background-image: url('var(--frame-2)'); }
      100% { background-image: url('var(--frame-3)'); }
    }
    
    .monster.walking {
      animation: walkCycle 0.8s steps(4) infinite, approachCenter 5s linear forwards;
    }
    
    /* 맞았을 때 이펙트 */
    .monster.hit {
      animation: none !important;
      opacity: 0.3;
      filter: grayscale(100%);
    }
    
    /* 크로스헤어 */
    #crosshair {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 40px;
      height: 40px;
      border: 2px solid rgba(251,191,36,.7);
      border-radius: 50%;
      pointer-events: none;
      box-shadow: 0 0 8px rgba(251,191,36,.4);
      z-index: 100;
    }
    
    #crosshair::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 2px;
      height: 18px;
      background: rgba(251,191,36,.6);
    }
    
    #crosshair::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 18px;
      height: 2px;
      background: rgba(251,191,36,.6);
    }
    
    /* 히트 이펙트 (클릭 위치에서 폭발) */
    .hit-fx {
      position: absolute;
      width: 60px;
      height: 60px;
      background: radial-gradient(circle, rgba(251,191,36,.8), transparent);
      border-radius: 50%;
      pointer-events: none;
      animation: hitPop 0.6s ease-out forwards;
    }
    
    @keyframes hitPop {
      0% {
        transform: scale(0.5);
        opacity: 1;
      }
      100% {
        transform: scale(2);
        opacity: 0;
      }
    }
  </style>
</head>
<body>
  <div id="game">
    <div id="hud">
      <div>Score: <span id="score">0</span></div>
      <div>Stage: <span id="stage">1/3</span></div>
      <div>Time: <span id="timer">60</span>s</div>
      <div>Lives: <span id="lives">❤️ ❤️ ❤️</span></div>
    </div>
    <div id="gameField"></div>
  </div>
  
  <div id="crosshair"></div>

  <script>
    const gameField = document.getElementById('gameField')
    const scoreEl = document.getElementById('score')
    const timerEl = document.getElementById('timer')
    
    let score = 0
    let timeLeft = 60
    let level = 1
    let monstersSpawned = 0
    
    const creatures = ['tripod', 'blob', 'spider', 'cyclops', 'flyer', 'tentacle', 'armor', 'phantom']
    const approaches = ['approach-left', 'approach-center', 'approach-right']
    
    // 각 괴물의 프레임 경로
    const frameMap = {
      tripod: {
        frames: ['/img/space-monsters/tripod-level-{LEVEL}-frame-00.png', 
                 '/img/space-monsters/tripod-level-{LEVEL}-frame-01.png',
                 '/img/space-monsters/tripod-level-{LEVEL}-frame-02.png',
                 '/img/space-monsters/tripod-level-{LEVEL}-frame-03.png']
      },
      // ... 다른 괴물들도 동일한 구조
    }
    
    function spawnMonster() {
      if (timeLeft <= 0) return
      
      const creature = creatures[Math.floor(Math.random() * creatures.length)]
      const approach = approaches[Math.floor(Math.random() * approaches.length)]
      
      const monster = document.createElement('div')
      monster.className = `monster ${approach} walking`
      monster.dataset.creature = creature
      monster.dataset.hitbox = Math.random() // 충돌 판정용
      
      // 프레임 CSS 변수 설정 (레벨 5 = 중간 크기로 시작, 애니메이션)
      const frameLevel = 5
      const frames = frameMap[creature].frames.map(f => f.replace('{LEVEL}', String(frameLevel).padStart(2, '0')))
      monster.style.setProperty('--frame-0', `url('${frames[0]}')`)
      monster.style.setProperty('--frame-1', `url('${frames[1]}')`)
      monster.style.setProperty('--frame-2', `url('${frames[2]}')`)
      monster.style.setProperty('--frame-3', `url('${frames[3]}')`)
      
      // 초기 크기 (멀리)
      const initialSize = 80
      monster.style.width = initialSize + 'px'
      monster.style.height = initialSize + 'px'
      
      // 클릭 이벤트
      monster.onclick = (e) => {
        e.stopPropagation()
        if (monster.classList.contains('hit')) return
        
        monster.classList.add('hit')
        score += 100
        scoreEl.textContent = score
        
        // 히트 이펙트
        const hitFx = document.createElement('div')
        hitFx.className = 'hit-fx'
        hitFx.style.left = e.clientX - 30 + 'px'
        hitFx.style.top = e.clientY - 30 + 'px'
        document.body.appendChild(hitFx)
        setTimeout(() => hitFx.remove(), 600)
        
        // API 저장
        fetch('/api/games/space-monster/hit', {
          method: 'POST',
          body: JSON.stringify({ score, creature, approach })
        }).catch(console.error)
        
        setTimeout(() => monster.remove(), 500)
      }
      
      gameField.appendChild(monster)
      monstersSpawned++
      
      // 5초 후 자동 제거 (클릭 못함)
      setTimeout(() => {
        if (monster.parentElement) {
          monster.remove()
        }
      }, 5000)
    }
    
    // 타이머
    const timerInterval = setInterval(() => {
      timeLeft--
      timerEl.textContent = timeLeft
      if (timeLeft <= 0) {
        clearInterval(timerInterval)
        endStage()
      }
    }, 1000)
    
    function endStage() {
      document.querySelectorAll('.monster').forEach(m => m.remove())
      alert(`Stage ${level} 완료! Score: ${score}`)
      
      if (level < 3) {
        level++
        document.getElementById('stage').textContent = `${level}/3`
        timeLeft = 90 + (level - 1) * 30
        score = 0
        monstersSpawned = 0
      } else {
        alert(`게임 끝! 최종 점수: ${score}`)
      }
    }
    
    // 난이도별 스폰 간격
    const spawnIntervals = {
      1: 2000,  // 2초마다
      2: 1500,  // 1.5초마다
      3: 1000,  // 1초마다
    }
    
    let spawnInterval = setInterval(() => {
      spawnMonster()
    }, spawnIntervals[level])
    
    // 스테이지 변경 시 간격 조정
    const originalAlert = alert
    window.alert = function(msg) {
      if (msg.includes('완료')) {
        clearInterval(spawnInterval)
        spawnInterval = setInterval(spawnMonster, spawnIntervals[level])
      }
      originalAlert(msg)
    }
  </script>
</body>
</html>
```

---

## 📋 작업 일정 & 비용 추정

| 단계 | 작업 | 소요 시간 | 리소스 | 산출물 |
|---|---|---|---|---|
| **1️⃣** | Higgsfield AI (8종 + 배경) | 45분 | Higgsfield MCP | 8개 MP4 (총 ~70MB) |
| **2️⃣** | Python 자동화 스크립트 작성 | 2시간 | Python, FFmpeg | build-space-monster-sprites.py |
| **3️⃣** | 영상 → 스프라이트 변환 | 15분 | 자동화 | 8개 PNG 스프라이트 시트 |
| **4️⃣** | HTML5 게임 개발 | 4시간 | Node.js, CSS | student-game-space-monster.html |
| **5️⃣** | API 연결 (점수/배지) | 2시간 | `src/api-games.ts` | DB 저장 로직 |
| **6️⃣** | 테스트 & 배포 | 2시간 | tsc, 하니스, deploy.ps1 | 라이브 게임 |
| **총합** | | **13.5시간** | | ✅ 완성 게임 |

**Higgsfield 비용** (예상):
- 각 동영상: ~$2~5 (생성 복잡도에 따라)
- 총 8종: ~$30~40
- **총 프로젝트 비용: $50~60**

---

## 🔧 자동화: MCP + Python 통합

```bash
# cloudflare-deploy/build-space-monster-complete.sh
#!/bin/bash

echo "🛸 Space Monster Hunter — 완전 자동 빌드"
echo ""

# Step 1: Higgsfield 동영상 생성
echo "1️⃣  AI 동영상 생성 중..."
node build-space-monster-videos.mjs

# Step 2: 스프라이트 시트 변환
echo "2️⃣  스프라이트 시트 생성 중..."
python3 build-space-monster-sprites.py

# Step 3: HTML 게임 생성
echo "3️⃣  게임 파일 생성..."
cp template-space-monster.html public/student-game-space-monster.html

# Step 4: TypeScript 컴파일
echo "4️⃣  TypeScript 컴파일 중..."
cd .. && npx tsc --noEmit

# Step 5: 하니스 실행
echo "5️⃣  회귀 테스트..."
node test-harness/run.mjs --fast

echo "✅ 완료! deploy.ps1 으로 배포하세요."
```

---

## 📊 기술 스택 요약

| 레이어 | 기술 | 역할 |
|---|---|---|
| **AI 영상** | Higgsfield MCP | 실사 우주 괴물 생성 |
| **영상 처리** | FFmpeg | 프레임 추출, 리사이즈 |
| **이미지 처리** | Python (PIL, NumPy) | 배경 제거, 스프라이트 합성 |
| **게임 런타임** | HTML5 + CSS | 브라우저 게임 |
| **백엔드** | Cloudflare Worker (Node.js) | 점수/배지 API |
| **배포** | `deploy.ps1` | 라이브 서버 배포 |

---

## ✅ 체크리스트

- [ ] Higgsfield MCP 사용 권한 확인
- [ ] Python 3.9+ 설치 (FFmpeg 포함)
- [ ] `build-space-monster-videos.mjs` 작성
- [ ] `build-space-monster-sprites.py` 작성 & 테스트
- [ ] HTML5 게임 작성
- [ ] `src/api-games.ts` API 추가
- [ ] tsc 컴파일 통과
- [ ] 하니스 55 PASS
- [ ] `deploy.ps1` 실행
- [ ] 라이브 테스트 (실제 학생)

---

**예상 완성일**: 2~3일  
**품질 목표**: 오락실 수준의 고퀄리티  
**학습 효과**: 8개 우주 생물 이름 + 포식·침입·방어 등 전술 단어 학습
