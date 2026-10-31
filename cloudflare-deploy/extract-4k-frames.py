#!/usr/bin/env python3
"""
Higgsfield 4K MP4 → 프레임 추출 + 스프라이트 시트 생성
"""

import os
import subprocess
from PIL import Image
import shutil

VIDEO_DIR = './temp/videos'
OUTPUT_DIR = './public/img/space-monsters'
os.makedirs(OUTPUT_DIR, exist_ok=True)

creatures = ['tripod', 'blob', 'spider', 'cyclops']

print("=" * 60)
print("🎬 Higgsfield 4K MP4 → 스프라이트 프레임 추출")
print("=" * 60)

for creature in creatures:
    mp4_path = f'{VIDEO_DIR}/{creature}-4k.mp4'

    if not os.path.exists(mp4_path):
        print(f"\n❌ {creature}: {mp4_path} 없음")
        continue

    print(f"\n🎥 {creature.upper()} 처리 중...")

    # 임시 프레임 디렉토리
    temp_frames_dir = f'{VIDEO_DIR}/temp_frames_{creature}'
    os.makedirs(temp_frames_dir, exist_ok=True)

    # FFmpeg로 모든 프레임 추출 (30fps = 300프레임)
    try:
        cmd = [
            'ffmpeg', '-i', mp4_path,
            '-vf', 'fps=30',
            f'{temp_frames_dir}/frame_%04d.png',
            '-y'  # 덮어쓰기
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        print(f"  ✅ 프레임 추출 완료 (30fps)")
    except Exception as e:
        print(f"  ❌ FFmpeg 오류: {e}")
        continue

    # 10레벨 해상도별 4프레임 선택 (처음, 1/3, 2/3, 끝)
    frame_indices = [1, 100, 200, 299]  # 10초 × 30fps = 300프레임
    sizes = [
        (80, 100), (120, 150), (160, 200), (200, 250), (240, 300),
        (280, 350), (320, 400), (360, 450), (420, 525), (500, 625)
    ]

    for level, (width, height) in enumerate(sizes, 1):
        for frame_num, original_idx in enumerate(frame_indices):
            # 원본 프레임 로드
            frame_path = f'{temp_frames_dir}/frame_{original_idx:04d}.png'

            if not os.path.exists(frame_path):
                print(f"    ⚠️  프레임 {original_idx} 없음, 스킵")
                continue

            # 리사이즈
            img = Image.open(frame_path)
            img_resized = img.resize((width, height), Image.Resampling.LANCZOS)

            # 저장
            output_path = f'{OUTPUT_DIR}/{creature}-level-{level:02d}-frame-{frame_num:02d}.png'
            img_resized.save(output_path, 'PNG')

        if (level % 3 == 0):
            print(f"    ✅ 레벨 {level}/10 완료")

    # 임시 디렉토리 제거
    shutil.rmtree(temp_frames_dir, ignore_errors=True)

    print(f"  ✨ {creature}: 40개 스프라이트 생성 (10 레벨 × 4 프레임)")

print("\n" + "=" * 60)
print("✨ 완료! 4종 × 40개 = 160개 실사 스프라이트 생성됨")
print(f"   저장 위치: {OUTPUT_DIR}/")
print("=" * 60)
print("\n📝 다음: 나머지 4종(flyer/tentacle/armor/phantom) 완료 대기...")
