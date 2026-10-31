"""
pipeline.py — 한 프레임을 처리하는 «순서» / the per-frame orchestration.

지연을 줄이는 장치가 전부 여기 모여 있습니다 / every latency knob lives here:

  ① ROI          — 전체 프레임이 아니라 정렬된 512 얼굴만 모델에 넣습니다 (faces.py)
                   Only the aligned 512 face goes to the model, not the whole frame.
  ② 검출 주기     — 얼굴 «검출» 과 «복원» 의 주기를 따로 둡니다.
                   Detection and restoration run on independent cadences.
  ③ 프레임 스킵   — 복원을 N 프레임에 한 번만 돌리고, 사이 프레임은 «직전 복원 텍스처» 를
                   «지금 프레임의 위치» 로 다시 붙입니다. 고개가 움직여도 따라옵니다.
                   Restore every Nth frame; in between, re-paste the LAST restored texture
                   at the CURRENT frame's position, so head motion still tracks.
  ④ temporal EMA — 프레임마다 결과가 미세하게 달라 얼굴이 «지글거리는» 것을 눌러 줍니다.
                   Damps the frame-to-frame shimmer of a GAN.
  ⑤ 계측         — 단계별 ms 를 재서 «무엇이 느린지» 를 추측하지 않게 합니다.
                   Per-stage timing so nobody has to guess what's slow.

⚠️ ③의 대가 / the cost of ③:
   말하는 얼굴에서 N 을 키우면 «입 모양이 소리보다 늦습니다». 복원 텍스처를 재사용하니
   입이 직전 것이기 때문입니다. GPU 가 버티면 N=1 이 정답이고, N 은 «과부하 밸브» 로만
   쓰세요. 실측 권장: N=1 (여유), N=2 (빠듯), N>=3 은 입 모양 어긋남이 눈에 보입니다.
   With a talking face, larger N desyncs the mouth from the audio, because the reused
   texture carries the previous mouth. Use N=1 when the GPU can; treat N as an
   overload valve only. N>=3 shows visible mouth lag.
"""

from __future__ import annotations

import time
from collections import OrderedDict

import cv2
import numpy as np

from config import ProbeConfig
from faces import Face, FaceDetector, crop_aligned, paste_back
from restorers import Restorer


class Stopwatch:
    """단계별 ms 를 지수이동평균으로 / per-stage milliseconds, EMA-smoothed.

    ⛔ 평균만 남기지 마세요 — 최댓값(p-max)이 «가끔 끊긴다» 의 정체입니다.
    ⛔ Don't keep only the mean; the max is what "it stutters sometimes" actually is.
    """

    def __init__(self, alpha: float = 0.12):
        self.alpha = alpha
        self.avg: OrderedDict[str, float] = OrderedDict()
        self.peak: OrderedDict[str, float] = OrderedDict()
        self.n = 0
        self._t0 = 0.0

    def start(self) -> None:
        self._t0 = time.perf_counter()

    def lap(self, key: str) -> None:
        ms = (time.perf_counter() - self._t0) * 1000.0
        self._t0 = time.perf_counter()
        prev = self.avg.get(key)
        self.avg[key] = ms if prev is None else prev + self.alpha * (ms - prev)
        self.peak[key] = max(self.peak.get(key, 0.0), ms)

    def total_avg(self) -> float:
        return sum(self.avg.values())

    def report(self) -> str:
        parts = [f"{k} {v:.1f}" for k, v in self.avg.items()]
        return " | ".join(parts) + f" | 합계 {self.total_avg():.1f}ms"

    def table(self) -> str:
        w = max((len(k) for k in self.avg), default=8)
        lines = [f"  {'단계 stage'.ljust(w)}   평균 avg     최대 max"]
        lines.append("  " + "-" * (w + 24))
        for k in self.avg:
            lines.append(f"  {k.ljust(w)}   {self.avg[k]:7.2f}ms  {self.peak[k]:7.2f}ms")
        lines.append("  " + "-" * (w + 24))
        lines.append(f"  {'합계 total'.ljust(w)}   {self.total_avg():7.2f}ms")
        return "\n".join(lines)


class EnhancePipeline:
    """열화 → 검출 → 잘라내기 → 복원 → 되붙이기 / degrade → detect → crop → restore → paste."""

    def __init__(self, cfg: ProbeConfig, detector: FaceDetector, restorer: Restorer):
        self.cfg = cfg
        self.detector = detector
        self.restorer = restorer
        self.sw = Stopwatch()

        self.frame_no = 0
        self._faces: list[Face] = []                 # ② 검출 주기 사이에 재사용
        self._last_restored: dict[int, np.ndarray] = {}   # ③ 얼굴 슬롯별 직전 복원 텍스처
        self._ema: dict[int, np.ndarray] = {}             # ④ EMA 누적
        self.restored_this_frame = False

    # -- 내부 / internals ---------------------------------------------------
    def _blend(self, slot: int, fresh: np.ndarray) -> np.ndarray:
        """④ temporal EMA — 0 이면 그냥 통과 / passthrough when 0."""
        a = self.cfg.temporal_ema
        if a <= 0.0:
            return fresh
        prev = self._ema.get(slot)
        if prev is None or prev.shape != fresh.shape:
            self._ema[slot] = fresh
            return fresh
        # 새 프레임에 (1-a), 과거에 a. a 가 크면 안정적이지만 움직임이 흐려집니다.
        out = cv2.addWeighted(fresh, 1.0 - a, prev, a, 0.0)
        self._ema[slot] = out
        return out

    # -- 공개 / public ------------------------------------------------------
    def process(self, frame: np.ndarray) -> tuple[np.ndarray, np.ndarray, list[Face]]:
        """(열화된 원본, 복원 결과, 얼굴들) 을 돌려줍니다 / returns (degraded, restored, faces)."""
        self.frame_no += 1
        self.sw.start()

        # ② 얼굴 검출 — detect_every 프레임마다. 사이에는 직전 위치를 씁니다.
        #    ⚠️ 검출은 1~3ms 라 보통 매 프레임 도는 것이 맞습니다. 위치가 낡으면
        #       복원한 얼굴이 «엉뚱한 자리» 에 붙어 오히려 더 나빠집니다.
        #    ⚠️ Detection is 1-3 ms — usually run it every frame. Stale boxes paste the
        #       restored face in the WRONG place, which is worse than not restoring.
        if self.frame_no % max(1, self.cfg.detect_every) == 1 or not self._faces:
            self._faces = self.detector.detect(frame)
        self.sw.lap("검출 detect")

        if not self._faces:
            self.sw.lap("복원 restore")
            self.sw.lap("되붙이기 paste")
            self.restored_this_frame = False
            return frame, frame.copy(), []

        # ③ 이번 프레임에 «모델을 돌릴 것인가»
        do_restore = (self.frame_no % max(1, self.cfg.frame_skip)) == 0 \
            or self.cfg.frame_skip <= 1
        self.restored_this_frame = do_restore

        crops: list[np.ndarray | None] = []
        for slot, face in enumerate(self._faces):
            if do_restore:
                crops.append(crop_aligned(frame, face))
            else:
                crops.append(None)
        self.sw.lap("잘라내기 crop")

        restored_faces: list[np.ndarray | None] = []
        for slot, crop in enumerate(crops):
            if crop is not None:
                out = self.restorer.restore(crop)
                out = self._blend(slot, out)
                self._last_restored[slot] = out
                restored_faces.append(out)
            else:
                # 직전 복원 텍스처를 «지금 위치» 로 붙입니다(스킵 프레임).
                # Reuse the last texture at the CURRENT position on skipped frames.
                prev = self._last_restored.get(slot)
                if prev is None or self.cfg.skip_mode == "passthrough":
                    restored_faces.append(None)
                else:
                    restored_faces.append(prev)
        self.sw.lap("복원 restore")

        # paste_back 은 «제자리에서» 고칩니다 — 그래서 여기서 딱 한 번만 복사합니다.
        # paste_back mutates in place, so we copy exactly once here.
        out_frame = frame.copy()
        for face, rf in zip(self._faces, restored_faces):
            if rf is not None:
                paste_back(out_frame, face, rf)
        self.sw.lap("되붙이기 paste")

        return frame, out_frame, self._faces
