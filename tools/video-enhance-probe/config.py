"""
config.py — 설정과 가중치 내려받기 / Config + weight download.

이 폴더의 모든 모듈이 여기 있는 ProbeConfig 하나만 봅니다.
Every module in this folder reads exactly one object: ProbeConfig.

⛔ 여기에 판정 로직을 넣지 마세요. 값과 경로만 둡니다.
⛔ Keep this file values-and-paths only. No decisions here.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

# 가중치 캐시 위치 / where downloaded weights live
CACHE_DIR = Path(os.environ.get("MANGOI_PROBE_CACHE", Path.home() / ".cache" / "mangoi-probe"))


# ---------------------------------------------------------------------------
# 망고아이 실제 적응 화질 사다리 / mangoi's real adaptive-quality ladder
#
# 정본은 cloudflare-deploy/public/js/idx-main.js 의 STEPS / SCALE / baseCaps().
# Source of truth: STEPS / SCALE / baseCaps() in idx-main.js.
#
# ⚠️ 여기 숫자는 그 파일에서 «베껴 온» 사본입니다. idx-main.js 를 고치면 여기도 고쳐야
#    이 계측기가 «지금 학생이 실제로 보는 화면» 을 재현합니다.
# ⚠️ These are a COPY. If idx-main.js changes, change here too — otherwise this rig
#    stops reproducing what a student actually sees.
# ---------------------------------------------------------------------------
LADDER_STEPS = (1.0, 0.6, 0.35, 0.2, 0.08)   # 비트레이트 배수 / bitrate multiplier
LADDER_SCALE = (1.0, 1.5, 2.0, 3.0, 4.0)     # 해상도 축소 / resolution divisor
LADDER_FPS_FLOOR = (10, 10, 10, 10, 5)       # 단계별 fps 하한 / per-step fps floor

# baseCaps() 기본값 / baseCaps() defaults
BASE_BITRATE_PC = 1_200_000
BASE_BITRATE_MOBILE = 500_000
BASE_FPS_PC = 24
BASE_FPS_MOBILE = 15


@dataclass
class ProbeConfig:
    # --- 입력 / input -------------------------------------------------------
    source: str = "0"                 # "0" = 웹캠 / webcam, 또는 rtsp:// · 파일경로
    width: int = 1280
    height: int = 720

    # --- 열화 시뮬레이터 / degradation simulator ---------------------------
    # 필리핀 회선에서 실제로 걸리는 단계를 로컬에서 재현합니다(0 = 열화 없음).
    # Reproduces the ladder step a Philippine link actually falls to (0 = none).
    degrade_step: int = 0
    degrade_mobile: bool = False      # baseCaps() 의 모바일 분기 / mobile branch

    # --- 모델 / model -------------------------------------------------------
    # gfpgan | codeformer | realesrgan | cv-sharpen | none
    model: str = "gfpgan"
    device: str = "auto"              # auto | cuda | cpu | mps
    fp16: bool = True                 # FP16(반정밀) — CUDA 에서만 의미 있음
    codeformer_fidelity: float = 0.7  # 0=화질 우선, 1=원본 충실 / 0=quality, 1=fidelity
    sr_input_size: int = 128          # Real-ESRGAN 입력 변 길이 (아래 주석 참고)

    # --- 지연 최소화 / latency knobs ---------------------------------------
    frame_skip: int = 1               # N=1 매 프레임 / every frame. N>1 이면 아래 reuse
    skip_mode: str = "reuse"          # reuse | passthrough
    temporal_ema: float = 0.0         # 0=끔. 0.3~0.6 이면 깜빡임(flicker) 감소
    max_faces: int = 2                # 얼굴 상한 / cap on faces per frame
    detect_every: int = 1             # 얼굴 «검출» 주기 (검출은 1~3ms 라 보통 1)

    # --- 얼굴 검출 / face detection ----------------------------------------
    det_score: float = 0.7
    det_input: tuple[int, int] = (320, 320)

    # --- 출력 / output ------------------------------------------------------
    show: bool = True                 # cv2.imshow (데스크톱 필요 / needs a display)
    out_path: str | None = None       # 비교 영상 저장 / write side-by-side video
    bench_frames: int = 0             # >0 이면 headless 벤치마크 / headless benchmark

    # 채워지는 값 / filled in at runtime
    resolved_device: str = field(default="cpu", init=False)

    # -- 파생 / derived -----------------------------------------------------
    @property
    def base_bitrate(self) -> int:
        return BASE_BITRATE_MOBILE if self.degrade_mobile else BASE_BITRATE_PC

    @property
    def base_fps(self) -> int:
        return BASE_FPS_MOBILE if self.degrade_mobile else BASE_FPS_PC

    def ladder(self) -> tuple[int, float, int]:
        """현재 단계의 (비트레이트, 해상도 축소, fps) / (bitrate, scale, fps) for the step."""
        s = max(0, min(self.degrade_step, len(LADDER_STEPS) - 1))
        br = max(60_000 if s >= 4 else 150_000, int(self.base_bitrate * LADDER_STEPS[s]))
        fps = max(LADDER_FPS_FLOOR[s], int(self.base_fps * LADDER_STEPS[s]))
        return br, LADDER_SCALE[s], fps


# ---------------------------------------------------------------------------
# 가중치 내려받기 / weight download
#
# 허깅페이스 Hub 를 먼저 시도하고, 실패하면 공식 릴리스 URL 로 떨어집니다.
# Tries Hugging Face Hub first, falls back to the official release URL.
#
# ⚠️ HF 미러 저장소는 언제든 사라질 수 있습니다. 그래서 «없으면 실패» 가 아니라
#    «다음 후보» 로 넘어가고, 전부 실패하면 사람이 읽을 수 있는 안내를 냅니다.
# ⚠️ HF mirrors come and go, so we fall through candidates and end with a
#    human-readable message rather than a stack trace.
# ---------------------------------------------------------------------------
_WEIGHTS: dict[str, dict] = {
    "yunet": {
        "hf": [("opencv/face_detection_yunet", "face_detection_yunet_2023mar.onnx")],
        "url": "https://github.com/opencv/opencv_zoo/raw/main/models/"
               "face_detection_yunet/face_detection_yunet_2023mar.onnx",
        "name": "face_detection_yunet_2023mar.onnx",
    },
    "gfpgan": {
        "hf": [("leonelhs/gfpgan", "GFPGANv1.4.pth"),
               ("gmk123/GFPGAN", "GFPGANv1.4.pth")],
        "url": "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth",
        "name": "GFPGANv1.4.pth",
    },
    "codeformer": {
        "hf": [("leonelhs/codeformer", "codeformer.pth")],
        "url": "https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth",
        "name": "codeformer.pth",
    },
    "realesrgan": {
        "hf": [("ai-forever/Real-ESRGAN", "realesr-general-x4v3.pth")],
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/"
               "v0.2.5.0/realesr-general-x4v3.pth",
        "name": "realesr-general-x4v3.pth",
    },
}


def fetch_weight(key: str) -> Path:
    """가중치 파일 경로를 돌려줍니다. 없으면 내려받습니다 / return local path, download if absent."""
    spec = _WEIGHTS[key]
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    dest = CACHE_DIR / spec["name"]
    if dest.exists() and dest.stat().st_size > 0:
        return dest

    # 1) 허깅페이스 Hub / Hugging Face Hub
    try:
        from huggingface_hub import hf_hub_download          # noqa: PLC0415
        for repo_id, filename in spec["hf"]:
            try:
                got = hf_hub_download(repo_id=repo_id, filename=filename,
                                      cache_dir=str(CACHE_DIR / "hf"))
                print(f"  ↓ HF  {repo_id}/{filename}")
                return Path(got)
            except Exception:
                continue
    except ImportError:
        pass

    # 2) 공식 릴리스 / official release
    try:
        from urllib.request import urlopen                   # noqa: PLC0415
        print(f"  ↓ URL {spec['url']}")
        tmp = dest.with_suffix(dest.suffix + ".part")
        with urlopen(spec["url"], timeout=120) as r, open(tmp, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
        tmp.replace(dest)                                    # 부분 파일을 «완성본» 으로 오인하지 않도록
        return dest
    except Exception as e:                                   # noqa: BLE001
        raise SystemExit(
            f"\n[가중치 실패] '{key}' 를 받지 못했습니다: {e}\n"
            f"  손으로 받아 이 자리에 두세요 / download manually to:\n"
            f"    {dest}\n"
            f"  주소 / from: {spec['url']}\n"
        ) from e


def resolve_device(want: str) -> str:
    """실제로 쓸 장치를 정합니다 / pick the device we can actually use."""
    if want != "auto":
        return want
    try:
        import torch                                          # noqa: PLC0415
        if torch.cuda.is_available():
            return "cuda"
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return "mps"
    except ImportError:
        pass
    return "cpu"


def banner(cfg: ProbeConfig) -> None:
    br, scale, fps = cfg.ladder()
    print("=" * 68)
    print("  망고아이 화상 프레임 화질 계측기 / mangoi video-frame enhancement probe")
    print("=" * 68)
    print(f"  입력 source      : {cfg.source}  ({cfg.width}x{cfg.height})")
    print(f"  열화 degrade     : step {cfg.degrade_step} "
          f"→ {br // 1000}kbps, 해상도 1/{scale:g}, {fps}fps"
          f"{'  (모바일 기준)' if cfg.degrade_mobile else ''}")
    print(f"  모델 model       : {cfg.model}")
    print(f"  장치 device      : {cfg.resolved_device}"
          f"{'  FP16' if cfg.fp16 and cfg.resolved_device == 'cuda' else ''}")
    print(f"  프레임스킵 skip  : {cfg.frame_skip} ({cfg.skip_mode})"
          f"   temporal-ema {cfg.temporal_ema}")
    print("=" * 68)
    if cfg.fp16 and cfg.resolved_device != "cuda":
        print("  ⚠️  FP16 은 CUDA 에서만 의미가 있습니다 — 무시합니다 / FP16 is CUDA-only; ignored.",
              file=sys.stderr)
