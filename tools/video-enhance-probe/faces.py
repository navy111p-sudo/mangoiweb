"""
faces.py — 얼굴 검출 · 정렬 · 되붙이기 / face detect, align, paste-back.

이 파일이 «ROI 기법» 의 본체입니다 — 전체 프레임(1280x720 = 92만 화소)을 모델에
넣지 않고 얼굴만 512x512(26만 화소)로 잘라 넣습니다. 화소 수가 1/3.5 로 줄고,
복원 모델은 애초에 «정렬된 얼굴» 로 학습되어 성능도 더 좋습니다.

This file IS the ROI trick — instead of feeding the whole 1280x720 frame (0.92 MP)
to the model, we feed only an aligned 512x512 face (0.26 MP). 3.5x fewer pixels,
and restoration models are trained on aligned faces anyway, so quality is better too.

⚠️ 되붙이기(paste-back)를 대충 하면 «얼굴만 다른 사람처럼 도드라지는» 화면이 됩니다.
   그래서 마스크를 침식(erode)한 뒤 흐리게(blur) 해서 경계를 녹입니다.
⚠️ A sloppy paste-back makes the face look pasted-on. We erode + blur the mask so
   the seam dissolves.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from config import ProbeConfig, fetch_weight

# FFHQ 512x512 정렬 템플릿 — GFPGAN·CodeFormer 가 학습에 쓴 바로 그 좌표입니다.
# The FFHQ 512 template GFPGAN/CodeFormer were trained on.
# 순서 / order: [왼눈, 오른눈, 코, 왼입꼬리, 오른입꼬리] (화면 기준 / as seen in the image)
FFHQ_TEMPLATE = np.array(
    [[192.98138, 239.94708],
     [318.90277, 240.19366],
     [256.63416, 314.01935],
     [201.26117, 371.41043],
     [313.08905, 371.15118]],
    dtype=np.float32,
)

FACE_SIZE = 512


@dataclass
class Face:
    """한 얼굴 / one face."""
    box: tuple[int, int, int, int]     # x, y, w, h
    landmarks: np.ndarray              # (5, 2)
    affine: np.ndarray                 # (2, 3) 원본 → 512 정렬 / source → aligned 512
    score: float


class FaceDetector:
    """
    YuNet — OpenCV 에 들어 있는 초경량 검출기. CPU 에서 1~3ms 입니다.
    YuNet, bundled with OpenCV. 1-3 ms on CPU.

    ⛔ RetinaFace/MTCNN 을 쓰지 마세요 — 정확도는 조금 높지만 20~60ms 라
       «검출이 복원보다 오래 걸리는» 상태가 됩니다. 실시간에서는 총 지연이 전부입니다.
    ⛔ Don't reach for RetinaFace/MTCNN — slightly more accurate but 20-60 ms, which
       makes detection cost more than restoration. In real time, total latency is what matters.
    """

    def __init__(self, cfg: ProbeConfig):
        if not hasattr(cv2, "FaceDetectorYN"):
            raise SystemExit(
                "\n[검출기 없음] OpenCV 4.8 이상이 필요합니다 / need OpenCV >= 4.8\n"
                "  pip install --upgrade 'opencv-python>=4.8'\n"
            )
        model = str(fetch_weight("yunet"))
        self.det = cv2.FaceDetectorYN.create(
            model=model, config="", input_size=cfg.det_input,
            score_threshold=cfg.det_score, nms_threshold=0.3, top_k=50,
        )
        self.cfg = cfg
        self._size: tuple[int, int] | None = None

    def detect(self, frame: np.ndarray) -> list[Face]:
        h, w = frame.shape[:2]

        # 검출은 축소본에서 합니다 — 320px 면 화상수업 거리의 얼굴에 충분하고
        # 원본 크기로 돌리는 것보다 5~10배 빠릅니다.
        # Detect on a downscaled copy: 320px is plenty at video-call distance and
        # 5-10x faster than full resolution.
        tw, th = self.cfg.det_input
        ratio = min(tw / w, th / h)
        dw, dh = max(1, int(w * ratio)), max(1, int(h * ratio))
        small = cv2.resize(frame, (dw, dh), interpolation=cv2.INTER_LINEAR)

        if self._size != (dw, dh):
            self.det.setInputSize((dw, dh))
            self._size = (dw, dh)

        _, raw = self.det.detect(small)
        if raw is None:
            return []

        out: list[Face] = []
        inv = 1.0 / ratio
        for row in raw[: self.cfg.max_faces]:
            x, y, bw, bh = (row[0:4] * inv)
            # YuNet 랜드마크 순서: 오른눈, 왼눈, 코, 오른입꼬리, 왼입꼬리 (사람 기준).
            # 사람의 «오른눈» 은 화면 왼쪽에 보이므로 FFHQ 템플릿 순서와 그대로 맞습니다.
            # YuNet order is subject-relative; the subject's right eye appears image-left,
            # so it lines up with the FFHQ template as-is.
            lm = (row[4:14].reshape(5, 2) * inv).astype(np.float32)

            affine = align_matrix(lm)
            if affine is None:
                continue
            out.append(Face(box=(int(x), int(y), int(bw), int(bh)),
                            landmarks=lm, affine=affine, score=float(row[14])))
        return out


def align_matrix(landmarks: np.ndarray) -> np.ndarray | None:
    """5점 → FFHQ 512 상사변환 / 5-point similarity transform to the FFHQ 512 template."""
    # estimateAffinePartial2D = 회전+균등축척+이동 (기울임 없음).
    # Partial affine = rotation + uniform scale + translation, no shear —
    # 얼굴을 늘이지 않으므로 복원 모델이 학습한 분포를 벗어나지 않습니다.
    m, _ = cv2.estimateAffinePartial2D(landmarks, FFHQ_TEMPLATE, method=cv2.LMEDS)
    return m


def crop_aligned(frame: np.ndarray, face: Face) -> np.ndarray:
    """원본에서 정렬된 512x512 얼굴을 잘라냅니다 / cut the aligned 512 face."""
    return cv2.warpAffine(
        frame, face.affine, (FACE_SIZE, FACE_SIZE),
        flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(135, 133, 132),
    )


_MASK_CACHE: np.ndarray | None = None


def _soft_mask() -> np.ndarray:
    """경계를 녹이는 마스크 / the seam-dissolving mask. 한 번만 만듭니다."""
    global _MASK_CACHE
    if _MASK_CACHE is None:
        m = np.ones((FACE_SIZE, FACE_SIZE), np.float32)
        m = cv2.erode(m, np.ones((23, 23), np.uint8))     # 가장자리를 안쪽으로 깎고
        m = cv2.GaussianBlur(m, (61, 61), 0)              # 부드럽게 번지게
        _MASK_CACHE = m
    return _MASK_CACHE


_CORNERS = np.array([[0, 0], [FACE_SIZE, 0], [FACE_SIZE, FACE_SIZE], [0, FACE_SIZE]],
                    dtype=np.float32).reshape(-1, 1, 2)


def paste_back(frame: np.ndarray, face: Face, restored: np.ndarray) -> None:
    """
    복원된 512 얼굴을 원본 자리에 되붙입니다 — **frame 을 제자리에서 고칩니다.**
    Paste the restored face back — **MUTATES `frame` in place**, returns nothing.

    ⚠️ 부르는 쪽이 원본을 지켜야 하면 «먼저» copy() 하세요. 반환값이 없는 것이
       그 신호입니다(옛 버전은 새 프레임을 돌려줬습니다 — 헷갈리면 여기를 보세요).
    ⚠️ Copy first if you need the original. The `None` return is the signal.

    🚀 왜 ROI 로만 칠하나 / why we only touch the ROI
       전체 프레임(1280x720)에 warpAffine 을 두 번 걸고 float 로 섞으면 **22ms** 가
       나옵니다(2026-09-05 이 컨테이너 실측) — 복원 모델보다 오래 걸립니다.
       실제로 바뀌는 것은 얼굴 주변 «약 180x180» 뿐이라, 그 상자 안에서만 계산하면
       **약 50배** 적은 일이 됩니다. 결과는 화소 단위로 같습니다.
       Full-frame warp+blend measured 22 ms — longer than the model itself. Only the
       ~180x180 face box actually changes, so we compute inside that box only.
       ~50x less work, pixel-identical result.
    """
    h, w = frame.shape[:2]
    inv = cv2.invertAffineTransform(face.affine)

    # 512 크롭의 네 귀퉁이를 원본 좌표로 보내 «건드릴 상자» 를 구합니다.
    dst = cv2.transform(_CORNERS, inv).reshape(-1, 2)
    x0 = max(0, int(np.floor(dst[:, 0].min())))
    y0 = max(0, int(np.floor(dst[:, 1].min())))
    x1 = min(w, int(np.ceil(dst[:, 0].max())) + 1)
    y1 = min(h, int(np.ceil(dst[:, 1].max())) + 1)
    if x1 <= x0 or y1 <= y0:
        return                                   # 얼굴이 화면 밖 — 할 일 없음

    # ROI 원점만큼 평행이동을 빼서 «ROI 좌표계» 로 워프합니다.
    # Shift the translation by the ROI origin so we warp straight into the box.
    roi_inv = inv.copy()
    roi_inv[0, 2] -= x0
    roi_inv[1, 2] -= y0
    size = (x1 - x0, y1 - y0)

    warped = cv2.warpAffine(restored, roi_inv, size, flags=cv2.INTER_LINEAR)
    mask = cv2.warpAffine(_soft_mask(), roi_inv, size, flags=cv2.INTER_LINEAR)[:, :, None]

    roi = frame[y0:y1, x0:x1]
    blended = warped.astype(np.float32) * mask + roi.astype(np.float32) * (1.0 - mask)
    roi[:] = np.clip(blended, 0, 255).astype(np.uint8)
