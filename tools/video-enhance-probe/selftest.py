#!/usr/bin/env python3
"""
selftest.py — 카메라·GPU 없이 도는 자체 점검 / self-check with no camera and no GPU.

  python selftest.py

무엇을 확인하나 / what it checks
  ① 화질 사다리가 idx-main.js 와 같은 답을 내는가
  ② 열화 시뮬레이터가 실제로 화질을 떨어뜨리는가 (재서 확인)
  ③ 정렬(align) → 되붙이기(paste) 기하가 «제자리로» 돌아오는가  ← 제일 중요
  ④ 되붙이기 마스크가 얼굴 «밖» 을 안 건드리는가
  ⑤ 파이프라인이 얼굴 0개에서도 안 죽는가
  ⑥ YuNet 가중치를 받을 수 있는가 (망이 되면)
  ⑦ cv-sharpen 기준선이 실제로 선명도를 올리는가

⚠️ ③이 이 도구에서 제일 조용히 틀릴 수 있는 자리입니다 — 어긋나도 «에러 없이»
   얼굴이 살짝 밀린 채 붙습니다. 그래서 화소로 재서 못 박습니다.
⚠️ #3 is where this tool can be silently wrong: a bad transform pastes the face
   slightly off with no error at all. So we measure it in pixels.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import cv2
import numpy as np

from config import (LADDER_BR_FLOOR, LADDER_FPS_FLOOR, LADDER_SCALE, LADDER_STEPS,
                    QUALITY_CAPS, ProbeConfig, resolve_device)
from faces import (FACE_SIZE, FFHQ_TEMPLATE, Face, _soft_mask, align_matrix,
                   crop_aligned, paste_back)
from sources import Degrader

_pass = 0
_fail = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global _pass, _fail
    if ok:
        _pass += 1
        print(f"  ✅ {name}" + (f"   {detail}" if detail else ""))
    else:
        _fail += 1
        print(f"  ❌ {name}   {detail}")


def sharpness(img: np.ndarray) -> float:
    """라플라시안 분산 = 선명도의 흔한 대리지표 / Laplacian variance, a common sharpness proxy.

    ⚠️ «열화가 심해질수록 낮아진다» 고 믿으면 안 됩니다 — 압축이 심해지면 블록 «경계» 가
       새 고주파를 만들어 값이 도로 올라갑니다(실측: step3 8 → step4 34).
       그래서 «얼마나 망가졌나» 의 판정에는 아래 mae() 를 씁니다.
    ⚠️ Do NOT read this as monotonically falling with degradation: heavy compression
       creates block EDGES, which are new high frequencies, so it rises again
       (measured: step3 8 → step4 34). Use mae() to judge "how degraded".
    """
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(g, cv2.CV_64F).var())


def mae(a: np.ndarray, b: np.ndarray) -> float:
    """원본에서 얼마나 멀어졌나 / distance from the truth. 열화가 심할수록 커집니다."""
    return float(np.abs(a.astype(np.float32) - b.astype(np.float32)).mean())


def synth_frame(w: int = 1280, h: int = 720) -> np.ndarray:
    """검출기가 아니라 «기하와 화질» 을 재려고 만든 합성 프레임.

    ⛔ 순수 난수로 채우지 마세요 — 축소하면 평균이 나서 «열화가 오히려 덜해» 보입니다.
    ⛔ Don't fill with pure noise: downscaling averages it away, so degradation looks
       smaller than it is. Use scene-like content — gradients, shapes, fine stripes.
    """
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    img = np.zeros((h, w, 3), np.uint8)
    img[..., 0] = (xx / w * 200 + 30).astype(np.uint8)          # 부드러운 기울기
    img[..., 1] = (yy / h * 200 + 30).astype(np.uint8)
    img[..., 2] = ((xx + yy) / (w + h) * 180 + 40).astype(np.uint8)

    cv2.circle(img, (w // 2, h // 2), 130, (210, 190, 175), -1)  # 얼굴 자리쯤의 넓은 면
    cv2.circle(img, (w // 2 - 45, h // 2 - 30), 14, (40, 35, 30), -1)
    cv2.circle(img, (w // 2 + 45, h // 2 - 30), 14, (40, 35, 30), -1)
    for i in range(0, w, 24):                                    # 가는 줄무늬 = 압축에 제일 먼저 죽음
        cv2.line(img, (i, 0), (i, 90), (255, 255, 255), 2)
    rng = np.random.default_rng(7)                               # 약한 센서 노이즈
    img = np.clip(img.astype(np.int16) + rng.integers(-6, 7, img.shape), 0, 255).astype(np.uint8)
    return img


def main() -> int:
    print("=" * 68)
    print("  자체 점검 / selftest — 카메라·GPU 없이")
    print("=" * 68)

    cfg = ProbeConfig()
    cfg.resolved_device = resolve_device("auto")

    # ⓪ 정본 대조 / cross-check against the source of truth
    #
    # 🔴 이 절이 없어서 결함이 조용히 통과했습니다.
    #    전에는 기대값을 «손으로 베껴» 두어, 제가 idx-main.js 의 «안 도는 폴백 분기» 를
    #    베낀 것을 검사가 원리상 못 잡았습니다(그래도 PASS 31 이 나왔습니다).
    #    CLAUDE.md 「하니스가 자기가 새로 만든 상수를 잡아 통과」 그대로입니다.
    # ✅ 그래서 이제 «내가 적은 값» 이 아니라 **정본 파일을 읽어** 대조합니다.
    # 🔴 Without this section the bug passed: expectations were hand-copied, so the rig
    #    could not detect that we had copied a never-executed fallback branch.
    print("\n[⓪] 정본(idx-main.js) 대조 / cross-check against source of truth")
    js_path = Path(__file__).resolve().parents[2] / "cloudflare-deploy/public/js/idx-main.js"
    if not js_path.exists():
        print(f"  ⏭  건너뜀 / skipped — 정본이 없습니다: {js_path}")
    else:
        js = js_path.read_text(encoding="utf-8", errors="replace")

        def nums(pattern: str) -> list[float] | None:
            m = re.search(pattern, js)
            return [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", m.group(1))] if m else None

        got = nums(r"const\s+STEPS\s*=\s*\[([^\]]*)\]")
        check("STEPS 가 사본과 같은가", got == list(LADDER_STEPS), f"js={got}")
        got = nums(r"const\s+SCALE\s*=\s*\[([^\]]*)\]")
        check("SCALE 가 사본과 같은가", got == list(LADDER_SCALE), f"js={got}")

        # 화면 «기본값» 이 low 인가 — 이것이 어느 행을 재현해야 하는지 정합니다.
        m = re.search(r"function\s+vcQualityMode\s*\([^)]*\)\s*\{(.*?)\n\}", js, re.S)
        check("화질 기본값이 'low' 인가", bool(m) and re.search(r"return\s*'low'", m.group(1)) is not None,
              "기본값이 바뀌면 QUALITY_CAPS 의 어느 행이 «대부분의 학생» 인지도 바뀝니다")

        # vcQualityCaps() 두 분기의 숫자
        m = re.search(r"function\s+vcQualityCaps\s*\([^)]*\)\s*\{(.*?)\n\}", js, re.S)
        if not m:
            check("vcQualityCaps 를 찾았는가", False)
        else:
            body = m.group(1)
            lo = re.search(r"'low'.*?return\s*\{([^}]*)\}", body, re.S)
            hi = re.search(r"\n\s*return\s*\{([^}]*)\}\s*;\s*$", body.rstrip(), re.S)
            lo_n = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", lo.group(1))] if lo else None
            hi_n = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", hi.group(1))] if hi else None
            # low : (mobile?250:400)*1000, fps 15, scale 2  → [250,400,1000,15,2]
            c = QUALITY_CAPS["low"]
            check("low 분기 숫자가 사본과 같은가",
                  lo_n == [c[1] / 1000, c[0] / 1000, 1000, c[2], c[4]], f"js={lo_n}")
            # auto: (mobile?500:1200)*1000, fps mobile?15:24, scale 1 → [500,1200,1000,15,24,1]
            c = QUALITY_CAPS["auto"]
            check("auto 분기 숫자가 사본과 같은가",
                  hi_n == [c[1] / 1000, c[0] / 1000, 1000, c[3], c[2], c[4]], f"js={hi_n}")

        # 🔴 이 한 줄이 제가 빠뜨렸던 곱셈입니다 — 없으면 low 의 ×2 가 통째로 사라집니다.
        check("applyStep 이 caps.scale 을 곱하는가",
              re.search(r"scaleResolutionDownBy\s*=\s*\(caps\.scale\s*\|\|\s*1\)\s*\*", js) is not None,
              "ladder() 의 base_scale 곱셈이 이것과 짝입니다")
        check("비트레이트 하한이 사본과 같은가",
              re.search(r"Math\.max\(lo\s*\?\s*60000\s*:\s*150000", js) is not None,
              f"사본={LADDER_BR_FLOOR}")
        check("fps 하한이 사본과 같은가",
              re.search(r"Math\.max\(lo\s*\?\s*5\s*:\s*10", js) is not None,
              f"사본={LADDER_FPS_FLOOR}")
        check("하한이 걸리는 단계(step>=4)가 사본과 같은가",
              re.search(r"const\s+lo\s*=\s*step\s*>=\s*4", js) is not None)

    # ① 사다리 / ladder
    print("\n[①] 화질 사다리 / quality ladder")
    # 기대값은 idx-main.js 의 식을 손으로 푼 것입니다:
    #   br  = max(BR_FLOOR[step],  round(caps.br  * STEPS[step]))
    #   fps = max(FPS_FLOOR[step], round(caps.fps * STEPS[step]))
    #   sc  = caps.scale * SCALE[step]
    # ⚠️ 'low' 가 **화면 기본값** 이라 이 행이 «대부분의 학생» 입니다.
    EXPECT = {
        "low":  [(400_000, 2.0, 15), (240_000, 3.0, 10), (150_000, 4.0, 10),
                 (150_000, 6.0, 10), (60_000, 8.0, 5)],
        "auto": [(1_200_000, 1.0, 24), (720_000, 1.5, 14), (420_000, 2.0, 10),
                 (240_000, 3.0, 10), (96_000, 4.0, 5)],
    }
    for mode, rows in EXPECT.items():
        cfg.quality_mode = mode
        for step, want in enumerate(rows):
            cfg.degrade_step = step
            got = cfg.ladder()
            ow = int(1280 / got[1])
            check(f"{mode:>4} step {step}", got == want,
                  f"{got[0] // 1000}kbps 1/{got[1]:g}={ow}x{int(720 / got[1])} {got[2]}fps"
                  + ("" if got == want else f"   기대 {want}"))

    # 🔴 이 두 줄이 «폴백 분기를 베낀» 결함을 콕 집어 잡습니다.
    #    고치기 전 코드로 되돌리면 둘 다 실제로 FAIL 합니다.
    cfg.quality_mode, cfg.degrade_step = "low", 0
    check("기본(low)이 1200kbps 가 아님 / not the never-run fallback",
          cfg.ladder()[0] == 400_000,
          "1200k 가 나오면 baseCaps() 의 «안 도는 return» 을 베낀 것입니다")
    check("기본(low)에 caps.scale ×2 가 반영됨 / caps.scale multiplied",
          cfg.ladder()[1] == 2.0,
          "1.0 이 나오면 ladder() 에서 base_scale 곱셈이 빠진 것입니다")

    # 하한이 실제로 물리는지 — low·모바일 step 4 는 250k*0.08=20k 라 60k 로 올라가야 합니다.
    cfg.degrade_mobile, cfg.degrade_step = True, 4
    br_m, _, _ = cfg.ladder()
    check("step 4 하한이 실제로 물림 / floor actually binds", br_m == 60_000, f"모바일 {br_m}")
    cfg.degrade_mobile, cfg.quality_mode = False, "low"

    # ② 열화 / degradation
    print("\n[②] 열화 시뮬레이터 / degradation simulator")
    frame = synth_frame()
    prev = 0.0
    monotonic = True
    for step in (1, 2, 3, 4):
        cfg.degrade_step = step
        d = Degrader(cfg).apply(frame)
        e = mae(frame, d)
        if e <= prev:
            monotonic = False
        check(f"step {step} 원본에서 멀어짐 / degrades", e > 0.5,
              f"평균오차 {e:5.2f}/255   (선명도 {sharpness(frame):.0f} → {sharpness(d):.0f})")
        prev = e
    check("단계가 올라갈수록 더 나빠짐 / monotonic", monotonic,
          "" if monotonic else "⚠️ QUALITY 표를 다시 보세요")
    cfg.degrade_step = 0
    check("step 0 은 원본 그대로 / step 0 is identity",
          np.array_equal(Degrader(cfg).apply(frame), frame))

    # ③ 기하 왕복 / geometry round-trip  ← 제일 중요
    print("\n[③] 정렬 → 되붙이기 기하 / align → paste geometry")
    # 템플릿을 «알고 있는» 변환으로 옮겨 가짜 랜드마크를 만듭니다.
    # Build fake landmarks by applying a KNOWN transform to the template.
    for angle, scale, tx, ty in [(0, 0.35, 500, 260), (17, 0.28, 300, 200), (-24, 0.45, 700, 300)]:
        rot = cv2.getRotationMatrix2D((FACE_SIZE / 2, FACE_SIZE / 2), angle, scale)
        rot[0, 2] += tx - FACE_SIZE / 2
        rot[1, 2] += ty - FACE_SIZE / 2
        lm = cv2.transform(FFHQ_TEMPLATE.reshape(-1, 1, 2), rot).reshape(-1, 2).astype(np.float32)

        aff = align_matrix(lm)
        ok_aff = aff is not None
        if not ok_aff:
            check(f"변환 산출 angle={angle}", False, "affine=None")
            continue

        # 랜드마크를 정렬 공간으로 보내면 템플릿 좌표와 같아야 합니다.
        back = cv2.transform(lm.reshape(-1, 1, 2), aff).reshape(-1, 2)
        err = float(np.abs(back - FFHQ_TEMPLATE).max())
        check(f"랜드마크 정렬 오차 angle={angle:>3}", err < 1.0, f"최대 {err:.3f}px")

        # 잘라내고 그대로 되붙이면 원본과 거의 같아야 합니다(보간 오차만).
        f = Face(box=(0, 0, 10, 10), landmarks=lm, affine=aff, score=1.0)
        crop = crop_aligned(frame, f)
        check(f"크롭 크기 angle={angle:>3}", crop.shape == (FACE_SIZE, FACE_SIZE, 3), str(crop.shape))

        pasted = frame.copy()
        ret = paste_back(pasted, f, crop)        # ⚠️ 제자리 수정 — 반환값은 None 이어야 합니다
        check(f"paste 는 제자리 수정 angle={angle:>3}", ret is None,
              "반환값이 생기면 pipeline 의 copy 횟수 전제가 깨집니다")
        # 마스크 중심부에서만 비교 — 가장자리는 일부러 부드럽게 섞습니다.
        cx, cy = int(tx), int(ty)
        r = 40
        a = frame[cy - r:cy + r, cx - r:cx + r].astype(np.float32)
        b = pasted[cy - r:cy + r, cx - r:cx + r].astype(np.float32)
        diff = float(np.abs(a - b).mean())
        # 합성 프레임이 «난수 격자» 라 재표본화 오차가 큽니다. 자리만 맞으면 됩니다.
        check(f"왕복 후 제자리 angle={angle:>3}", diff < 60.0, f"평균차 {diff:.1f}/255")

    # ④ 마스크가 얼굴 밖을 안 건드리나 / mask must not touch the background
    print("\n[④] 되붙이기 범위 / paste stays inside the face")
    rot = cv2.getRotationMatrix2D((FACE_SIZE / 2, FACE_SIZE / 2), 0, 0.35)
    rot[0, 2] += 400 - FACE_SIZE / 2
    rot[1, 2] += 300 - FACE_SIZE / 2
    lm = cv2.transform(FFHQ_TEMPLATE.reshape(-1, 1, 2), rot).reshape(-1, 2).astype(np.float32)
    f = Face(box=(0, 0, 10, 10), landmarks=lm, affine=align_matrix(lm), score=1.0)
    solid = np.full((FACE_SIZE, FACE_SIZE, 3), (0, 0, 255), np.uint8)
    out = frame.copy()
    paste_back(out, f, solid)
    touched = np.any(np.abs(out.astype(int) - frame.astype(int)) > 2, axis=2)
    ratio = touched.mean()
    check("바뀐 화소가 프레임의 일부뿐 / bounded", 0.0005 < ratio < 0.25, f"{ratio * 100:.2f}%")
    check("네 귀퉁이는 그대로 / corners untouched",
          not (touched[0, 0] or touched[0, -1] or touched[-1, 0] or touched[-1, -1]))

    # ROI 최적화가 «전체 프레임 계산» 과 화소 단위로 같은지 못 박습니다.
    # Lock the ROI optimization: it must be pixel-identical to the naive full-frame path.
    # ⚠️ 이 검사가 없으면 ROI 상자 계산이 1px 어긋나도 «약간 잘린 얼굴» 로 조용히 지나갑니다.
    inv = cv2.invertAffineTransform(f.affine)
    hh, ww = frame.shape[:2]
    naive_w = cv2.warpAffine(solid, inv, (ww, hh), flags=cv2.INTER_LINEAR)
    naive_m = cv2.warpAffine(_soft_mask(), inv, (ww, hh), flags=cv2.INTER_LINEAR)[:, :, None]
    naive = np.clip(naive_w.astype(np.float32) * naive_m
                    + frame.astype(np.float32) * (1.0 - naive_m), 0, 255).astype(np.uint8)
    worst = int(np.abs(out.astype(int) - naive.astype(int)).max())
    check("ROI 결과 == 전체계산 결과 / ROI matches naive", worst <= 1, f"최대차 {worst}")

    # 얼굴이 화면 밖이면 아무것도 안 해야 합니다 / off-screen face must be a no-op
    off = Face(box=(0, 0, 10, 10), landmarks=lm - 5000, affine=align_matrix(lm - 5000), score=1.0)
    untouched = frame.copy()
    paste_back(untouched, off, solid)
    check("화면 밖 얼굴은 무시 / off-screen is a no-op", np.array_equal(untouched, frame))

    # ⑤ 얼굴 0개 / no-face path
    print("\n[⑤] 얼굴 0개에서도 안 죽나 / no-face path")
    try:
        from pipeline import EnhancePipeline
        from restorers import build_restorer

        class _NoFaces:
            def detect(self, _):
                return []

        cfg.model = "none"
        pipe = EnhancePipeline(cfg, _NoFaces(), build_restorer(cfg))
        before, after, faces = pipe.process(frame)
        check("통과 / passthrough", faces == [] and after.shape == frame.shape)
        check("계측이 기록됨 / timings recorded", len(pipe.sw.avg) >= 3, pipe.sw.report())
    except Exception as e:  # noqa: BLE001
        check("얼굴 0개 경로", False, repr(e))

    # ⑥ 가중치 / weights
    print("\n[⑥] YuNet 가중치 / weight fetch")
    try:
        from config import fetch_weight
        p = fetch_weight("yunet")
        check("YuNet 내려받기", p.exists() and p.stat().st_size > 10_000,
              f"{p.name} {p.stat().st_size // 1024}KB")
        try:
            det = cv2.FaceDetectorYN.create(str(p), "", (320, 320), 0.7, 0.3, 50)
            det.setInputSize((320, 320))
            _n, res = det.detect(cv2.resize(frame, (320, 320)))
            check("검출기 실행 / detector runs", True,
                  f"합성 프레임에서 얼굴 {0 if res is None else len(res)}개 (0이 정상)")
        except Exception as e:  # noqa: BLE001
            check("검출기 실행", False, repr(e))
    except SystemExit as e:
        print(f"  ⏭  건너뜀 / skipped (망 차단으로 보입니다): {str(e).strip()[:90]}")

    # ⑦ 기준선 / non-AI baseline
    print("\n[⑦] cv-sharpen 기준선 / non-AI baseline")
    from restorers import SharpenRestorer
    cfg.degrade_step = 3
    blurred = Degrader(cfg).apply(frame)[100:612, 300:812]
    sharpened = SharpenRestorer().restore(cv2.resize(blurred, (FACE_SIZE, FACE_SIZE)))
    s_before = sharpness(cv2.resize(blurred, (FACE_SIZE, FACE_SIZE)))
    s_after = sharpness(sharpened)
    check("선명도가 올라감 / sharpness rises", s_after > s_before,
          f"{s_before:.0f} → {s_after:.0f}")

    print("\n" + "=" * 68)
    print(f"  통과 PASS {_pass}   실패 FAIL {_fail}")
    print("=" * 68)
    return 1 if _fail else 0


if __name__ == "__main__":
    sys.exit(main())
