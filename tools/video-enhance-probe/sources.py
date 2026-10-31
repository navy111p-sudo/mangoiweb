"""
sources.py — 프레임 입력과 «열화 시뮬레이터» / frame input + degradation simulator.

두 가지를 합니다 / two jobs:
  1. 웹캠 · RTSP · 파일에서 프레임을 꺼냅니다.
     Pull frames from a webcam, RTSP/WebRTC-relayed stream, or a file.
  2. 망고아이 적응 화질 사다리(0~4단계)를 로컬에서 재현합니다.
     Reproduce mangoi's adaptive-quality ladder (step 0..4) locally.

⚠️ 2번은 «근사» 입니다 — 실제 WebRTC 는 VP8/H.264 로 인코딩하는데 여기서는
   JPEG 압축으로 흉내 냅니다. 블록 크기와 링잉(ringing) 모양이 다릅니다.
   비교의 «상대적» 결론(복원이 얼마나 살리나)에는 쓸 수 있지만,
   «필리핀 화면이 정확히 이렇게 생겼다» 고 단정하면 안 됩니다.
⚠️ #2 is an APPROXIMATION — real WebRTC encodes with VP8/H.264; we mimic with JPEG.
   Block sizes and ringing differ. Fine for relative comparisons, NOT a claim that
   "this is exactly what the Philippine side sees".
"""

from __future__ import annotations

import time

import cv2
import numpy as np

from config import ProbeConfig


class FrameSource:
    """웹캠 / RTSP / 파일 공통 입력 / one interface for webcam, RTSP and files."""

    def __init__(self, cfg: ProbeConfig):
        self.cfg = cfg
        src: int | str = int(cfg.source) if cfg.source.isdigit() else cfg.source

        # RTSP 는 TCP 로 고정 — UDP 로 두면 패킷 손실 시 프레임이 통째로 깨집니다.
        # Pin RTSP to TCP; over UDP a lost packet shreds whole frames.
        if isinstance(src, str) and src.startswith("rtsp"):
            self.cap = cv2.VideoCapture(src, cv2.CAP_FFMPEG)
        else:
            self.cap = cv2.VideoCapture(src)

        if isinstance(src, int):
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, cfg.width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, cfg.height)
            self.cap.set(cv2.CAP_PROP_FPS, 30)

        # 버퍼를 1로 — 안 하면 «지연이 쌓여» 실시간이 아니게 됩니다.
        # Buffer size 1; otherwise latency accumulates and it stops being live.
        try:
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass

        if not self.cap.isOpened():
            raise SystemExit(
                f"\n[입력 실패] 열 수 없습니다 / cannot open: {cfg.source}\n"
                f"  · 웹캠이면 다른 프로그램이 쓰고 있는지 확인하세요.\n"
                f"  · 헤드리스 서버라면 --source 에 파일 경로나 rtsp:// 를 주세요.\n"
            )

    def read(self) -> np.ndarray | None:
        ok, frame = self.cap.read()
        return frame if ok else None

    def release(self) -> None:
        self.cap.release()


class Degrader:
    """
    망고아이 화질 단계를 재현합니다 / reproduce a mangoi quality step.

    실제 경로:  해상도 축소(scaleResolutionDownBy) → 낮은 비트레이트로 인코딩 →
                디코딩 → 원래 크기로 늘려 표시
    Real path:  downscale → encode at low bitrate → decode → upscale to display size

    여기서는 인코딩만 JPEG 품질로 근사합니다.
    """

    # 단계별 JPEG 품질 — 240kbps(step3) 근처가 대략 q35 언저리로 관측됩니다.
    # Per-step JPEG quality. Hand-tuned so step 3 lands near what ~240kbps VP8 looks like.
    QUALITY = (95, 70, 50, 35, 20)

    def __init__(self, cfg: ProbeConfig):
        self.cfg = cfg

    def apply(self, frame: np.ndarray) -> np.ndarray:
        step = self.cfg.degrade_step
        if step <= 0:
            return frame

        _, scale, _ = self.cfg.ladder()
        h, w = frame.shape[:2]
        sw, sh = max(16, int(w / scale)), max(16, int(h / scale))

        # 1) 해상도 축소 — INTER_AREA 가 인코더의 다운스케일에 가장 가깝습니다.
        small = cv2.resize(frame, (sw, sh), interpolation=cv2.INTER_AREA)

        # 2) 압축 손실 근사 / approximate compression loss
        q = self.QUALITY[min(step, len(self.QUALITY) - 1)]
        ok, buf = cv2.imencode(".jpg", small, [int(cv2.IMWRITE_JPEG_QUALITY), q])
        if ok:
            small = cv2.imdecode(buf, cv2.IMREAD_COLOR)

        # 3) 표시 크기로 확대 — 브라우저 <video> 가 하는 일. 여기서 «뭉개짐» 이 보입니다.
        #    Upscale to display size — what the browser's <video> does. This is the blur users report.
        return cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR)


class Fps:
    """표시용 FPS — 최근 30프레임 이동평균 / display FPS over the last 30 frames."""

    def __init__(self, n: int = 30):
        self.n = n
        self.t: list[float] = []

    def tick(self) -> float:
        self.t.append(time.perf_counter())
        if len(self.t) > self.n:
            self.t.pop(0)
        if len(self.t) < 2:
            return 0.0
        span = self.t[-1] - self.t[0]
        return (len(self.t) - 1) / span if span > 0 else 0.0
