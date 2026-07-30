"""
🏫 잠긴 학교 탈출(student-game-escape-school.html) 배경 이미지 빌더

Higgsfield soul_location 으로 생성한 5장을 다운로드해 1280x714 JPEG(q82)로
경량화하여 public/img/ 에 escape-school- 접두사로 저장한다.
기존 escape-room*.jpg(다른 게임용)는 건드리지 않는다.

  python build-escape-school-atlas.py

산출(public/img/):
  escape-school-classroom.jpg   방과후 빈 교실 — 창문으로 들어오는 노을빛(와이드, 도입부)
  escape-school-door.jpg        잠긴 현관 유리문 클로즈업
  escape-school-computer.jpg    교탁 컴퓨터 화면(비밀번호 입력창) 클로즈업
  escape-school-note.jpg        키보드 옆 포스트잇 클로즈업
  escape-school-hallway.jpg     문이 열린 밝은 복도 — 탈출/엔딩 장면(와이드)
"""
import os
import urllib.request
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(D, '..', 'game_image')
OUT = os.path.join(D, 'public', 'img')

OUT_W, OUT_H = 1280, 714
JPEG_Q = 82

ITEMS = {
    # classroom/computer 1차본은 화면 전체가 어둡게 나와 공포물 느낌이었다(피드백: 밝고 일상적이어야 함)
    # → "bright/high-key/no shadows" 프롬프트로 재생성(2차본)한 것으로 교체
    'escape-school-classroom': 'https://d8j0ntlcm91z4.cloudfront.net/user_3GD1yS6zlj6afu2oFQqivYqvn7k/hf_20260730_185814_9395dc5d-0c93-4b46-9c94-0d62d6e50991.png',
    'escape-school-door':      'https://d8j0ntlcm91z4.cloudfront.net/user_3GD1yS6zlj6afu2oFQqivYqvn7k/hf_20260730_185553_6f4cf6f6-9722-4e83-a411-c736014a48c7.png',
    'escape-school-computer':  'https://d8j0ntlcm91z4.cloudfront.net/user_3GD1yS6zlj6afu2oFQqivYqvn7k/hf_20260730_185817_18ef5dd9-5809-4b58-ba12-cd415a2250ba.png',
    'escape-school-note':      'https://d8j0ntlcm91z4.cloudfront.net/user_3GD1yS6zlj6afu2oFQqivYqvn7k/hf_20260730_185600_95a24418-f870-4db5-a734-d4df3eb226a1.png',
    'escape-school-hallway':   'https://d8j0ntlcm91z4.cloudfront.net/user_3GD1yS6zlj6afu2oFQqivYqvn7k/hf_20260730_185603_75247f8d-d224-4778-b6dd-df9360511342.png',
}


def download():
    os.makedirs(SRC, exist_ok=True)
    for slug, url in ITEMS.items():
        dst = os.path.join(SRC, slug + '.png')
        if os.path.exists(dst):
            print('  skip (있음)', slug)
            continue
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=90) as r:
            data = r.read()
        with open(dst, 'wb') as f:
            f.write(data)
        print('  받음', slug, len(data) // 1024, 'KB')


def process(slug):
    im = Image.open(os.path.join(SRC, slug + '.png')).convert('RGB')
    # 2048x1152(16:9) 원본을 1280x714(동일 16:9)로 축소만 한다 — 크롭 불필요
    im = im.resize((OUT_W, OUT_H), Image.LANCZOS)
    os.makedirs(OUT, exist_ok=True)
    dst = os.path.join(OUT, slug + '.jpg')
    im.save(dst, 'JPEG', quality=JPEG_Q, optimize=True)
    print('  저장', slug + '.jpg', os.path.getsize(dst) // 1024, 'KB')


if __name__ == '__main__':
    download()
    for slug in ITEMS:
        process(slug)
    print('완료')
