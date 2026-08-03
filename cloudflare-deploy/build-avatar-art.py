# -*- coding: utf-8 -*-
"""
🎨 아바타 원화 만들기 — 컷신 스틸(배경 제거본) → 게임용 webp

왜 필요한가:
  홈 화면 아바타를 캔버스로만 그리면 진화 컷신에 나오는 캐릭터와 생김새가 달라서
  학생 눈에는 "내 캐릭터가 아닌데?" 가 된다. 컷신을 만든 그 원화를 그대로 아바타로 쓴다.

입력 : 배경 제거된 PNG (Higgsfield remove_background 결과)
출력 : cloudflare-deploy/public/img/avatar/{species}-{tier}.webp

⚠️ 알파 여백을 반드시 잘라낼 것.
   9:16 원본은 캐릭터 주위가 거의 다 투명이라, 그냥 줄이면 화면에서 캐릭터가 작게 보인다.
   ffmpeg 의 crop 은 알파 경계를 못 찾는다 → PIL 의 getbbox() 로 잘라야 한다.

사용: python build-avatar-art.py <입력폴더>
"""
import sys
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE / "public" / "img" / "avatar"
TARGET_H = 420          # 폰 화면에서 아바타가 차지하는 최대 높이의 약 2배
PAD_RATIO = 0.04        # 잘라낸 뒤 사방에 조금 여백 — 딱 붙으면 답답해 보인다
ALPHA_FLOOR = 8         # 이보다 옅은 픽셀은 배경으로 본다(글로우 잔재 제거)


def trim_alpha(im: Image.Image) -> Image.Image:
    """투명 여백을 잘라낸다. 옅은 글로우 잔재는 배경으로 취급."""
    im = im.convert("RGBA")
    a = im.split()[3].point(lambda v: 255 if v > ALPHA_FLOOR else 0)
    box = a.getbbox()
    if not box:
        return im                      # 전부 투명 — 자르지 않는다
    im = im.crop(box)
    w, h = im.size
    pad = int(max(w, h) * PAD_RATIO)
    if pad <= 0:
        return im
    out = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    out.paste(im, (pad, pad))
    return out


def main() -> int:
    src_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if not src_dir or not src_dir.is_dir():
        print("사용: python build-avatar-art.py <배경제거된 png 폴더>")
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(src_dir.glob("*.png"))
    if not files:
        print(f"png 가 없습니다: {src_dir}")
        return 1

    total = 0
    for f in files:
        im = trim_alpha(Image.open(f))
        w, h = im.size
        if h > TARGET_H:
            im = im.resize((max(1, round(w * TARGET_H / h)), TARGET_H), Image.LANCZOS)
        dst = OUT_DIR / (f.stem + ".webp")
        im.save(dst, "WEBP", quality=82, method=6)
        kb = dst.stat().st_size / 1024
        total += kb
        print(f"  {f.stem:<10} {w}x{h} -> {im.size[0]}x{im.size[1]}  {kb:5.1f} KB")

    print(f"\n{len(files)}개 / 합계 {total:.0f} KB → {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
