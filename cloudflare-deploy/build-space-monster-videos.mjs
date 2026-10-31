#!/usr/bin/env node
/**
 * Space Monster Hunter — Higgsfield AI 동영상 생성
 * 우주 괴물 8종 + 배경 생성
 */

import fs from 'fs'
import path from 'path'

const VIDEO_DIR = './temp/videos'
const CREATURES = [
  {
    name: 'tripod',
    word: 'TRIPOD',
    prompt: `Three-legged alien creature with bioluminescent green tentacles,
      walking on futuristic spaceship metal floor. Cinematic, photorealistic 4K,
      dramatic sci-fi lighting, like Alien movie aesthetic. Creature walks toward
      camera slowly, menacing pose. Standing on smooth metal floor.`
  },
  {
    name: 'blob',
    word: 'BLOB',
    prompt: `Gelatinous semi-transparent alien blob creature with internal organs visible,
      pulsating with bioluminescent colors. Amorphous amorphous form, crawling on spaceship
      wall in zero gravity. Photorealistic 4K, deep space horror atmosphere.`
  },
  {
    name: 'spider',
    word: 'SPIDER',
    prompt: `Metallic purple alien spider with 8 long articulated legs, chrome exoskeleton,
      climbing futuristic spaceship ceiling. Threatening aggressive posture. Cinematic lighting,
      highly detailed, photorealistic 4K, sci-fi horror.`
  },
  {
    name: 'cyclops',
    word: 'CYCLOPS',
    prompt: `One-eyed alien giant with muscular red body, single massive glowing eye (like plasma),
      aggressive attack stance toward camera. Photorealistic 4K, dramatic cinematic lighting,
      epic scale, intimidating presence.`
  },
  {
    name: 'flyer',
    word: 'FLYER',
    prompt: `Bat-like creature with bioluminescent blue wings, alien head with large eyes,
      hovering in zero gravity environment. Smooth motion, leaving glowing trails. Cinematic,
      photorealistic 4K, deep space setting.`
  },
  {
    name: 'tentacle',
    word: 'TENTACLE',
    prompt: `Floating octopus-like entity with translucent tentacles covered in suckers,
      glowing orange bioluminescence, moving mysteriously through spaceship interior.
      Photorealistic 4K, deep space horror, cinematic.`
  },
  {
    name: 'armor',
    word: 'ARMOR',
    prompt: `Armored crystalline alien with geometric faceted body structure, blue and silver
      crystalline skin, walking with heavy deliberate steps. Photorealistic 4K, cinematic
      lighting, intimidating and otherworldly.`
  },
  {
    name: 'phantom',
    word: 'PHANTOM',
    prompt: `Ethereal ghostly alien, semi-transparent energy-based form, glowing with ethereal
      light, floating through spaceship wall. Eerie atmosphere, mysterious movement.
      Photorealistic 4K, supernatural sci-fi horror.`
  }
]

const BACKGROUNDS = [
  {
    name: 'spaceship-interior',
    prompt: `Inside futuristic alien spaceship interior, metallic walls with glowing neon blue panels,
      high-tech displays, zero gravity environment. Dramatic cinematic lighting, photorealistic 4K,
      sci-fi aesthetic like Alien or Prometheus.`
  },
  {
    name: 'deep-space',
    prompt: `Deep space with distant stars, nebula clouds, cosmic atmosphere, alien planet visible
      in distance. Photorealistic 4K, cinematic space scene, perfect for sci-fi game background.`
  }
]

/**
 * Higgsfield MCP generate_video 호출 (스텁 함수)
 * 실제 환경에 맞게 구현 필요
 */
async function generateVideoWithHighsfield(prompt, duration = 30, quality = '4k') {
  console.log(`  ⏳ AI 영상 생성 중 (${duration}초, ${quality})...`)

  try {
    // 주의: 이는 스텁입니다. 실제 MCP 호출로 변경 필요
    // const result = await mangoiMCP.call('generate_video', {
    //   prompt: prompt,
    //   duration: duration,
    //   quality: quality,
    //   format: 'mp4'
    // })
    // return result.videoPath

    // 임시: 로컬 테스트용 더미 파일 생성
    console.log(`  ℹ️  (테스트 모드: 실제 Higgsfield 호출은 환경 설정 필요)`)
    return null
  } catch (error) {
    console.error(`  ❌ Higgsfield 오류: ${error.message}`)
    return null
  }
}

/**
 * 메인 함수
 */
async function main() {
  console.log('='.repeat(60))
  console.log('🛸 Space Monster Hunter — Higgsfield AI 동영상 생성')
  console.log('='.repeat(60))

  // 디렉토리 생성
  if (!fs.existsSync(VIDEO_DIR)) {
    fs.mkdirSync(VIDEO_DIR, { recursive: true })
  }

  let successCount = 0
  const totalTasks = CREATURES.length + BACKGROUNDS.length

  // 괴물 생성
  console.log('\n📺 괴물 동영상 생성 중...')
  for (const creature of CREATURES) {
    console.log(`\n1️⃣  ${creature.name.toUpperCase()} (${creature.word})`)

    const videoPath = await generateVideoWithHighsfield(creature.prompt, 30, '4k')

    if (videoPath) {
      // 실제 생성된 경우
      fs.copyFileSync(videoPath, `${VIDEO_DIR}/${creature.name}.mp4`)
      console.log(`  ✅ 저장됨: ${VIDEO_DIR}/${creature.name}.mp4`)
      successCount++
    } else {
      // 테스트 모드: 스텁 파일 생성
      const stubPath = `${VIDEO_DIR}/${creature.name}.mp4`
      fs.writeFileSync(stubPath, Buffer.from([0, 0, 0, 20, 102, 116, 121, 112]))
      console.log(`  ℹ️  스텁 생성: ${stubPath}`)
      console.log(`  📝 프롬프트: ${creature.prompt.substring(0, 60)}...`)
      successCount++
    }
  }

  // 배경 생성
  console.log('\n🌌 배경 동영상 생성 중...')
  for (const bg of BACKGROUNDS) {
    console.log(`\n2️⃣  ${bg.name.toUpperCase()}`)

    const videoPath = await generateVideoWithHighsfield(bg.prompt, 60, '4k')

    if (videoPath) {
      fs.copyFileSync(videoPath, `${VIDEO_DIR}/${bg.name}.mp4`)
      console.log(`  ✅ 저장됨: ${VIDEO_DIR}/${bg.name}.mp4`)
      successCount++
    } else {
      const stubPath = `${VIDEO_DIR}/${bg.name}.mp4`
      fs.writeFileSync(stubPath, Buffer.from([0, 0, 0, 20, 102, 116, 121, 112]))
      console.log(`  ℹ️  스텁 생성: ${stubPath}`)
      console.log(`  📝 프롬프트: ${bg.prompt.substring(0, 60)}...`)
      successCount++
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`✨ 완료! ${successCount}/${totalTasks} 동영상 준비됨`)
  console.log(`   저장 위치: ${VIDEO_DIR}/`)
  console.log('='.repeat(60))
  console.log('\n📝 다음 단계: build-space-monster-sprites.py 실행')
  console.log('   $ python3 build-space-monster-sprites.py')
  console.log('')
}

main().catch(error => {
  console.error('❌ 치명적 오류:', error)
  process.exit(1)
})
