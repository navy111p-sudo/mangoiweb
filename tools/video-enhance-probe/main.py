#!/usr/bin/env python3
"""
main.py — 실행기 / runnable entry point.

  # 웹캠, 열화 3단계(=필리핀에서 실제로 자주 걸리는 단계), GFPGAN 으로 복원
  python main.py --source 0 --degrade 3 --model gfpgan

  # 화면 없는 서버에서 숫자만 재기 / headless numbers only
  python main.py --source sample.mp4 --degrade 3 --model gfpgan --bench 300 --no-show

  # AI 가 정말 값어치를 하는지 — 비-AI 기준선과 나란히 재기 (반드시 하세요)
  python main.py --source sample.mp4 --degrade 3 --model cv-sharpen --bench 300 --no-show

  # 비교 영상 파일로 저장 / write a side-by-side file
  python main.py --source sample.mp4 --degrade 3 --out compare.mp4 --no-show

조작 키 / keys (창이 있을 때 only when a window is shown)
  q / ESC  끝내기 quit        space  일시정지 pause
  0~4      열화 단계 바꾸기 change degradation step
  r        복원 켜기·끄기 toggle restoration
  s        지금 화면 저장 save the current pair as PNG
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import cv2
import numpy as np

# 🔴 결과물에는 사람 얼굴이 그대로 들어갑니다. 이 폴더에는 *.mp4 · *.png 를 막는
#    .gitignore 가 있지만 **그 폴더에만** 걸립니다 — 리포 루트에서 실행하면 루트에
#    떨어지고 루트 .gitignore 에는 그 통칙이 없습니다.
#    그래서 기본 저장 위치를 «이 파일 옆» 으로 못 박습니다.
# 🔴 Outputs contain faces. The .gitignore here only covers THIS folder, so we anchor
#    default output next to this file rather than to the current working directory.
_HERE = Path(__file__).resolve().parent

from config import ProbeConfig, banner, resolve_device
from faces import FaceDetector
from pipeline import EnhancePipeline
from restorers import build_restorer
from sources import Degrader, Fps, FrameSource

# ⚠️ cv2.putText 는 한글을 못 그립니다(폰트가 없어 □□□ 가 됩니다).
#    그래서 «화면 위» 글자만 영어로 둡니다. 터미널 출력·주석은 한국어입니다.
# ⚠️ cv2.putText cannot render Hangul (renders as boxes), so on-screen labels are
#    English only. Terminal output and comments stay Korean.
_FONT = cv2.FONT_HERSHEY_SIMPLEX


def _label(img: np.ndarray, text: str, y: int = 30, color=(60, 230, 90)) -> None:
    cv2.putText(img, text, (12, y), _FONT, 0.62, (0, 0, 0), 4, cv2.LINE_AA)
    cv2.putText(img, text, (12, y), _FONT, 0.62, color, 1, cv2.LINE_AA)


def _compose(left: np.ndarray, right: np.ndarray, cfg: ProbeConfig,
             sw_text: str, fps: float, on: bool, n_faces: int) -> np.ndarray:
    """원본|복원 나란히 / side-by-side with a divider."""
    br, scale, _ = cfg.ladder()
    a, b = left.copy(), right.copy()

    _label(a, f"BEFORE  step{cfg.degrade_step}  {br // 1000}kbps  1/{scale:g}", 30, (90, 180, 255))
    _label(b, f"AFTER   {cfg.model}{'' if on else '  [OFF]'}", 30,
           (60, 230, 90) if on else (100, 100, 100))
    # 얼굴 수를 반드시 보여 줍니다 — 0 이면 «모델이 나쁜» 것이 아니라 «검출이 안 된» 것이고,
    # 이 둘을 화면이 갈라 주지 않으면 엉뚱한 곳을 고치게 됩니다.
    # Always show the face count: 0 means detection failed, not that the model is bad.
    _label(b, f"{fps:5.1f} fps   faces {n_faces}", 58,
           (60, 230, 90) if n_faces else (80, 120, 255))
    _label(b, sw_text, 84, (200, 200, 60))

    canvas = np.hstack([a, b])
    cv2.line(canvas, (a.shape[1], 0), (a.shape[1], a.shape[0]), (40, 40, 40), 2)
    return canvas


def parse_args() -> ProbeConfig:
    p = argparse.ArgumentParser(
        description="망고아이 화상 프레임 화질 계측기 / mangoi video-frame enhancement probe",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--source", default="0", help="0=웹캠 / rtsp://... / 파일경로")
    p.add_argument("--width", type=int, default=1280)
    p.add_argument("--height", type=int, default=720)

    p.add_argument("--degrade", type=int, default=0, choices=range(5), metavar="0-4",
                   help="망고아이 적응 화질 단계 재현 (0=열화 없음). "
                        "⚠️ «필리핀에서 몇 단계까지 떨어지는지» 는 아직 아무도 못 쟀습니다 "
                        "— 단계 값이 vc_quality 에 안 남습니다(README §9)")
    p.add_argument("--quality", default="low", choices=["low", "auto", "high"],
                   help="설정의 화질 버튼. ⚠️ 화면 기본값이 'low' 입니다 — 대부분의 학생이 여기")
    p.add_argument("--mobile", action="store_true", help="vcQualityCaps() 모바일 기준으로 열화")

    p.add_argument("--model", default="gfpgan",
                   choices=["gfpgan", "codeformer", "realesrgan", "cv-sharpen", "none"])
    p.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu", "mps"])
    p.add_argument("--no-fp16", dest="fp16", action="store_false", help="FP16 끄기")
    p.add_argument("--fidelity", type=float, default=0.7, help="CodeFormer 충실도 0~1")
    p.add_argument("--sr-input", type=int, default=128, help="Real-ESRGAN 입력 변 길이")

    p.add_argument("--skip", type=int, default=1, help="복원 주기 N (1=매 프레임)")
    p.add_argument("--skip-mode", default="reuse", choices=["reuse", "passthrough"])
    p.add_argument("--temporal-ema", type=float, default=0.0, help="0~0.8, 깜빡임 억제")
    p.add_argument("--max-faces", type=int, default=2)
    p.add_argument("--detect-every", type=int, default=1)

    p.add_argument("--no-show", dest="show", action="store_false", help="창 없이 실행")
    p.add_argument("--out", default=None, help="비교 영상 저장 경로 (mp4)")
    p.add_argument("--bench", type=int, default=0, metavar="N",
                   help="N 프레임만 돌고 지연 표를 출력하고 끝냅니다")

    a = p.parse_args()
    cfg = ProbeConfig(
        source=a.source, width=a.width, height=a.height,
        degrade_step=a.degrade, degrade_mobile=a.mobile, quality_mode=a.quality,
        model=a.model, device=a.device, fp16=a.fp16,
        codeformer_fidelity=a.fidelity, sr_input_size=a.sr_input,
        frame_skip=a.skip, skip_mode=a.skip_mode, temporal_ema=a.temporal_ema,
        max_faces=a.max_faces, detect_every=a.detect_every,
        show=a.show, out_path=a.out, bench_frames=a.bench,
    )
    cfg.resolved_device = resolve_device(cfg.device)
    return cfg


def main() -> int:
    cfg = parse_args()
    banner(cfg)

    src = FrameSource(cfg)
    degrader = Degrader(cfg)
    detector = FaceDetector(cfg)
    restorer = build_restorer(cfg)
    pipe = EnhancePipeline(cfg, detector, restorer)
    fps = Fps()

    writer: cv2.VideoWriter | None = None
    restore_on = True
    paused = False
    n = 0
    t_start = time.perf_counter()

    # --out 이 이 폴더 «밖» 이면 .gitignore 가 안 걸립니다 — 조용히 넘어가지 않습니다.
    if cfg.out_path:
        dest = Path(cfg.out_path).expanduser()
        if not dest.is_absolute():
            dest = _HERE / dest                  # 상대경로는 이 폴더 기준(= 보호받는 자리)
            cfg.out_path = str(dest)
        if _HERE not in dest.parents:
            print(f"  ⚠️ 저장 위치가 이 폴더 밖입니다: {dest}\n"
                  f"     여기 .gitignore 는 «이 폴더에만» 걸립니다 — 사람 얼굴이 든 파일이면\n"
                  f"     깃에 올라가지 않는지 직접 확인하세요(README §7).", file=sys.stderr)

    # 창이 있는 모드인데 디스플레이가 없으면 조용히 끄는 대신 알려 줍니다.
    # If a window was asked for but there's no display, say so instead of crashing.
    show = cfg.show and not cfg.bench_frames
    if show:
        try:
            cv2.namedWindow("mangoi probe", cv2.WINDOW_NORMAL)
        except cv2.error:
            print("  ⚠️ 디스플레이가 없어 창을 끕니다 — --out 이나 --bench 를 쓰세요.\n"
                  "     No display; falling back to headless. Use --out or --bench.",
                  file=sys.stderr)
            show = False

    # 창도 없고 벤치도 없고 저장도 없으면 «아무 결과도 안 나오는 무한 루프» 입니다.
    # No window, no bench, no file = an infinite loop that produces nothing. Say so.
    if not show and not cfg.bench_frames and not cfg.out_path:
        print("  ⚠️ 창·벤치·저장이 모두 없어 결과가 나오지 않습니다.\n"
              "     --bench N 으로 숫자를 재거나 --out 으로 영상을 저장하세요.\n"
              "     Nothing will be produced. Add --bench N or --out FILE.", file=sys.stderr)

    print("\n  실행 중… / running…  (Ctrl+C 로 종료)\n")
    try:
        while True:
            if not paused:
                frame = src.read()
                if frame is None:
                    print("  · 입력 끝 / end of stream")
                    break

                # 열화는 «계측용» 입니다. 실제 배포에서는 이 줄이 없고, 네트워크가
                # 이미 이 일을 해서 프레임을 건네줍니다.
                # Degradation is for MEASUREMENT only. In production this line doesn't
                # exist — the network already did this to the frame before you got it.
                degraded = degrader.apply(frame)

                if restore_on:
                    before, after, faces = pipe.process(degraded)
                else:
                    before, after, faces = degraded, degraded, []

                n += 1
                f = fps.tick()

                if show or writer is not None or cfg.out_path:
                    canvas = _compose(before, after, cfg, pipe.sw.report(), f,
                                      restore_on, len(faces))

                    if cfg.out_path and writer is None:
                        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                        writer = cv2.VideoWriter(cfg.out_path, fourcc, 20.0,
                                                 (canvas.shape[1], canvas.shape[0]))
                        if not writer.isOpened():
                            print(f"  ⚠️ 영상 저장을 열 수 없습니다: {cfg.out_path}", file=sys.stderr)
                            writer = None
                            cfg.out_path = None
                    if writer is not None:
                        writer.write(canvas)
                    if show:
                        cv2.imshow("mangoi probe", canvas)

                if cfg.bench_frames and n >= cfg.bench_frames:
                    break
                if cfg.bench_frames and n % 50 == 0:
                    print(f"  … {n}/{cfg.bench_frames}  {f:.1f} fps")

            if show:
                k = cv2.waitKey(1) & 0xFF
                if k in (ord("q"), 27):
                    break
                if k == ord(" "):
                    paused = not paused
                elif k == ord("r"):
                    restore_on = not restore_on
                elif ord("0") <= k <= ord("4"):
                    cfg.degrade_step = k - ord("0")
                    br, sc, fp = cfg.ladder()
                    print(f"  · 열화 단계 {cfg.degrade_step} → {br // 1000}kbps, 1/{sc:g}, {fp}fps")
                elif k == ord("s"):
                    stamp = time.strftime("%H%M%S")
                    # CWD 가 아니라 «이 폴더» 에 씁니다 — 위 _HERE 주석 참고.
                    cv2.imwrite(str(_HERE / f"probe_{stamp}_before.png"), before)
                    cv2.imwrite(str(_HERE / f"probe_{stamp}_after.png"), after)
                    print(f"  · 저장 / saved {_HERE}/probe_{stamp}_*.png")
    except KeyboardInterrupt:
        print("\n  · 중단 / interrupted")
    finally:
        src.release()
        if writer is not None:
            writer.release()
            print(f"  · 영상 저장 / wrote {cfg.out_path}")
        if show:
            cv2.destroyAllWindows()

    # ---- 보고 / report ---------------------------------------------------
    elapsed = time.perf_counter() - t_start
    print("\n" + "=" * 68)
    print(f"  프레임 frames {n}   경과 elapsed {elapsed:.1f}s   "
          f"평균 avg {n / elapsed if elapsed else 0:.1f} fps")
    print(f"  모델 {cfg.model}  장치 {cfg.resolved_device}"
          f"{'  FP16' if cfg.fp16 and cfg.resolved_device == 'cuda' else ''}"
          f"  스킵 {cfg.frame_skip}")
    print("-" * 68)
    print(pipe.sw.table())
    print("=" * 68)

    # 예산 판정 — 30fps 실시간이면 한 프레임에 33ms, 15fps 면 66ms 가 전부입니다.
    # Budget: 33 ms/frame for 30 fps, 66 ms for 15 fps. Everything must fit.
    total = pipe.sw.total_avg()
    for target in (30, 15):
        budget = 1000.0 / target
        verdict = "✅ 여유 있음" if total <= budget * 0.7 else \
                  "🟡 빠듯함" if total <= budget else "❌ 예산 초과"
        print(f"  {target}fps 예산 {budget:.1f}ms  →  {total:.1f}ms  {verdict}")
    print("=" * 68)
    # ⛔ 여기서 「필리핀 노트북은 GPU 가 없다」고 단정하지 마세요 — 아무도 안 쟀습니다.
    #    README §0/§9 는 그것을 «추론» 이라고 적어 두었는데, 벤치 직후 사람이 실제로 읽는
    #    것은 이 터미널 출력이라 여기만 단정형이면 그 구분이 사라집니다.
    print("  ℹ️ 이 숫자는 «이 PC · 이 장치» 의 것입니다. GPU 가 없는 기기에서는 CPU 로\n"
          "     10~40배 느려집니다. ⚠️ 필리핀 강사 기기 사양은 이 저장소에서 잰 적이\n"
          "     없습니다 — 배포 판단 전에 실제 기기에서 다시 재세요(README §9).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
