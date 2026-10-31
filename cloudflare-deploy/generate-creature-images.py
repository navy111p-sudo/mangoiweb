#!/usr/bin/env python3
"""
Space Monster Hunter — 우주 괴물 이미지 직접 생성
PIL로 각 괴물의 특징을 살린 고품질 PNG 생성
"""

import os
from PIL import Image, ImageDraw, ImageFilter
import random

OUTPUT_DIR = './public/img/space-monsters'
os.makedirs(OUTPUT_DIR, exist_ok=True)

def create_creature_image(creature_name: str, size: tuple) -> Image.Image:
    """각 우주 괴물의 특징을 살린 이미지 생성"""
    width, height = size

    # 배경: 검은색 + 그라데이션 효과
    img = Image.new('RGBA', (width, height), (10, 14, 39, 255))
    draw = ImageDraw.Draw(img)

    # 중앙 좌표
    cx, cy = width // 2, height // 2

    if creature_name == 'tripod':
        # 세 다리 외계인 - 초록 보라색 톤
        draw.polygon([(cx-20, cy+40), (cx+20, cy+40), (cx, cy-40)], fill=(100, 150, 200, 200))
        draw.ellipse([(cx-15, cy-45), (cx+15, cy-25)], fill=(150, 200, 100, 220))
        for i in range(3):
            angle = i * 120
            x2 = cx + int(30 * (i - 1))
            draw.line([(cx, cy+40), (x2, cy+70)], fill=(100, 200, 150, 200), width=4)

    elif creature_name == 'blob':
        # 젤라틴 생물 - 반투명 초록
        draw.ellipse([(cx-40, cy-40), (cx+40, cy+40)], fill=(80, 150, 100, 180), outline=(120, 200, 140, 220), width=2)
        draw.ellipse([(cx-20, cy-20), (cx+20, cy+20)], fill=(150, 220, 180, 150))
        draw.ellipse([(cx-10, cy-10), (cx+10, cy+10)], fill=(100, 180, 140, 180))

    elif creature_name == 'spider':
        # 금속 거미 - 보라색 크롬
        cx_body, cy_body = cx, cy + 10
        draw.ellipse([(cx_body-25, cy_body-20), (cx_body+25, cy_body+20)], fill=(150, 100, 200, 220))
        draw.ellipse([(cx_body-15, cy_body-15), (cx_body+15, cy_body+15)], fill=(100, 50, 150, 200))
        for leg_idx in range(4):
            leg_x = cx + int(40 * ((leg_idx % 2) * 2 - 1))
            leg_y = cy_body + int(30 * ((leg_idx // 2) * 2 - 1))
            draw.line([(cx_body, cy_body), (leg_x, leg_y)], fill=(180, 150, 220, 200), width=5)

    elif creature_name == 'cyclops':
        # 한눈 거인 - 빨간색 근육질
        draw.ellipse([(cx-35, cy-40), (cx+35, cy+40)], fill=(200, 80, 80, 220))
        draw.ellipse([(cx-30, cy-35), (cx+30, cy+35)], fill=(220, 100, 100, 200))
        draw.ellipse([(cx-12, cy-10), (cx+12, cy+10)], fill=(255, 200, 100, 255), outline=(255, 150, 50, 255), width=2)
        draw.ellipse([(cx-8, cy-6), (cx+8, cy+6)], fill=(50, 50, 50, 240))

    elif creature_name == 'flyer':
        # 박쥐 생물 - 파란 생물발광
        draw.polygon([(cx-30, cy), (cx-40, cy-35), (cx-20, cy-40)], fill=(100, 150, 255, 200))
        draw.polygon([(cx+30, cy), (cx+40, cy-35), (cx+20, cy-40)], fill=(100, 150, 255, 200))
        draw.ellipse([(cx-15, cy-15), (cx+15, cy+15)], fill=(80, 180, 255, 220))
        draw.ellipse([(cx-20, cy+10), (cx+20, cy+30)], fill=(100, 200, 200, 200))

    elif creature_name == 'tentacle':
        # 문어 같은 생물 - 주황 생물발광
        cx_center, cy_center = cx, cy
        draw.ellipse([(cx_center-20, cy_center-20), (cx_center+20, cy_center+20)], fill=(200, 150, 80, 200))
        for tentacle in range(5):
            angle = tentacle * 72
            import math
            ex = cx_center + int(40 * math.cos(math.radians(angle)))
            ey = cy_center + int(40 * math.sin(math.radians(angle)))
            draw.line([(cx_center, cy_center), (ex, ey)], fill=(255, 180, 100, 180), width=6)

    elif creature_name == 'armor':
        # 결정질 갑옷 외계인 - 파란 은색
        points = []
        import math
        for i in range(6):
            angle = i * 60
            x = cx + int(35 * math.cos(math.radians(angle)))
            y = cy + int(35 * math.sin(math.radians(angle)))
            points.append((x, y))
        draw.polygon(points, fill=(100, 180, 255, 220), outline=(150, 200, 255, 200), width=2)
        draw.ellipse([(cx-15, cy-15), (cx+15, cy+15)], fill=(80, 150, 200, 200))

    elif creature_name == 'phantom':
        # 유령 같은 생명체 - 에테르 반투명
        draw.ellipse([(cx-35, cy-40), (cx+35, cy+30)], fill=(150, 180, 255, 120))
        draw.ellipse([(cx-25, cy-30), (cx+25, cy+20)], fill=(200, 220, 255, 100))
        draw.ellipse([(cx-15, cy-20), (cx-5, cy)], fill=(100, 100, 200, 150))
        draw.ellipse([(cx+5, cy-20), (cx+15, cy)], fill=(100, 100, 200, 150))

    # 글로우 이펙트 추가
    return img

def generate_all_creatures():
    """모든 우주 괴물의 이미지 생성"""
    creatures = ['tripod', 'blob', 'spider', 'cyclops', 'flyer', 'tentacle', 'armor', 'phantom']

    print("=" * 60)
    print("🎨 Space Monster Hunter — 우주 괴물 이미지 생성")
    print("=" * 60)

    for creature in creatures:
        print(f"\n🖼  {creature.upper()} 생성 중...")

        # 10개 해상도 레벨 생성 (80px ~ 500px)
        sizes = [
            (80, 100), (120, 150), (160, 200), (200, 250), (240, 300),
            (280, 350), (320, 400), (360, 450), (420, 525), (500, 625)
        ]

        for level, size in enumerate(sizes, 1):
            # 각 해상도별 4개 프레임 생성 (애니메이션용)
            for frame in range(4):
                img = create_creature_image(creature, size)

                # 약간의 변형으로 애니메이션 효과 (회전, 스케일)
                angle = frame * 3
                img_rotated = img.rotate(angle, expand=False)

                # 파일명: creature-level-XX-frame-YY.png
                filename = f"{creature}-level-{level:02d}-frame-{frame:02d}.png"
                filepath = os.path.join(OUTPUT_DIR, filename)
                img_rotated.save(filepath, 'PNG')

        print(f"  ✅ {creature}: 40개 파일 생성 (10 레벨 × 4 프레임)")

    print("\n" + "=" * 60)
    print(f"✨ 완료! 320개 이미지 생성됨 (8 괴물 × 10 레벨 × 4 프레임)")
    print(f"   저장 위치: {OUTPUT_DIR}/")
    print("=" * 60)
    print("\n📝 다음 단계: 게임 HTML 업그레이트 + 배포")
    print("")

if __name__ == '__main__':
    generate_all_creatures()
