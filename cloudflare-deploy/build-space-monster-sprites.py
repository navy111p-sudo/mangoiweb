#!/usr/bin/env python3
"""
Space Monster Hunter — 영상 → 멀티레벨 프레임 변환
House of the Dead 스타일: 멀리서(80px) → 가까이(500px)
"""

import subprocess
import os
from PIL import Image
import numpy as np
from pathlib import Path
import sys

VIDEO_DIR = './temp/videos'
OUTPUT_DIR = './public/img/space-monsters'
FRAME_COUNT = 4  # 각 레벨당 4프레임 (애니메이션)
FPS = 4

# 레벨: (너비, 높이) - 멀리서 → 가까이
LEVELS = [
    (80, 100),      # Level 1: 매우 멀음
    (120, 150),     # Level 2
    (160, 200),     # Level 3
    (200, 250),     # Level 4
    (240, 300),     # Level 5: 중간
    (280, 350),     # Level 6
    (320, 400),     # Level 7
    (360, 450),     # Level 8
    (420, 525),     # Level 9
    (500, 600),     # Level 10: 매우 가까움
]

def extract_frames(video_path):
    """영상에서 프레임 추출"""
    frames_dir = f'{VIDEO_DIR}/temp_frames'
    os.makedirs(frames_dir, exist_ok=True)

    cmd = [
        'ffmpeg', '-i', video_path,
        '-vf', f'fps={FPS}',
        '-vframes', str(FRAME_COUNT),
        f'{frames_dir}/frame_%02d.png'
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ FFmpeg 오류: {result.stderr}")
        return []

    return sorted(Path(frames_dir).glob('frame_*.png'))

def remove_background(frame_path):
    """초록/파랑 스크린 제거 (투명화)"""
    try:
        img = Image.open(frame_path).convert('RGBA')
        data = np.array(img)

        # 초록색 범위 감지 (HSV: G > 120, R < 100, B < 100)
        green_mask = (data[:,:,1] > 120) & (data[:,:,0] < 100) & (data[:,:,2] < 100)
        data[green_mask, 3] = 0

        # 파랑색 범위 감지 (HSV: B > 120, G < 100, R < 80)
        blue_mask = (data[:,:,2] > 120) & (data[:,:,1] < 100) & (data[:,:,0] < 80)
        data[blue_mask, 3] = 0

        return Image.fromarray(data)
    except Exception as e:
        print(f"⚠️  배경 제거 오류: {e}")
        return Image.open(frame_path).convert('RGBA')

def resize_frames(frames, width, height):
    """프레임을 특정 크기로 리사이즈"""
    resized = []
    for frame_path in frames:
        img = remove_background(frame_path)

        # 비율 유지하며 리사이즈
        img.thumbnail((width, height), Image.Resampling.LANCZOS)

        # 배경 투명 캔버스에 중앙 정렬
        canvas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        offset_x = (width - img.width) // 2
        offset_y = (height - img.height) // 2
        canvas.paste(img, (offset_x, offset_y), img)

        resized.append(canvas)
    return resized

def save_level_frames(frames, creature_name, level_num, width, height):
    """각 레벨 프레임을 개별 파일로 저장"""
    for idx, frame in enumerate(frames):
        output_path = f'{OUTPUT_DIR}/{creature_name}-level-{level_num:02d}-frame-{idx:02d}.png'
        frame.save(output_path, 'PNG')

    print(f"  ✅ Level {level_num:2d}: {width:3d}×{height:3d}px × {len(frames)} frames")

def process_creature(video_path, creature_name):
    """전체 크리처 처리"""
    print(f"\n🎬 Processing: {creature_name}")

    if not os.path.exists(video_path):
        print(f"  ⚠️  {video_path} 없음")
        return False

    # 프레임 추출
    frames = extract_frames(video_path)
    if not frames:
        print(f"  ❌ 프레임 추출 실패")
        return False

    # 10개 레벨 생성
    for level_num, (width, height) in enumerate(LEVELS, 1):
        resized_frames = resize_frames(frames, width, height)
        save_level_frames(resized_frames, creature_name, level_num, width, height)

    # 임시 디렉토리 정리
    import shutil
    temp_dir = f'{VIDEO_DIR}/temp_frames'
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)

    return True

def main():
    creatures = ['tripod', 'blob', 'spider', 'cyclops', 'flyer', 'tentacle', 'armor', 'phantom']

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(VIDEO_DIR, exist_ok=True)

    print("=" * 60)
    print("🛸 Space Monster Hunter — 스프라이트 생성")
    print("=" * 60)

    success_count = 0
    for creature in creatures:
        video_path = f'{VIDEO_DIR}/{creature}.mp4'
        if process_creature(video_path, creature):
            success_count += 1

    print("\n" + "=" * 60)
    print(f"✨ 완료! {success_count}/{len(creatures)} 크리처 처리됨")
    print(f"   총 {success_count * 10 * 4}개 프레임 생성 (10 레벨 × 4 프레임)")
    print(f"   저장 위치: {OUTPUT_DIR}/")
    print("=" * 60)

if __name__ == '__main__':
    main()
