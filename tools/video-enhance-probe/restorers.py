"""
restorers.py — 복원 모델 어댑터 / restoration model adapters.

모두 같은 계약을 지킵니다 / all share one contract:
    restore(face_bgr_512: np.ndarray) -> np.ndarray   # 512x512 BGR in, 512x512 BGR out

⛔ 모델마다 화면 코드를 갈라 쓰지 마세요. 갈라 쓰면 «모델을 바꿨더니 되붙이기가
   깨지는» 상태가 됩니다. 기하(잘라내기·되붙이기)는 faces.py 한 곳뿐입니다.
⛔ Don't branch the caller per model. Geometry (crop/paste) lives in faces.py only.


어느 모델을 쓸 것인가 / which model
──────────────────────────────────
  gfpgan       ★ 권장 / recommended.  단일 forward 의 GAN. RTX 3060 · FP16 에서
                 512 얼굴 하나에 약 15~25ms. 얼굴 복원 성능 대비 가장 가볍습니다.
                 One forward pass. ~15-25 ms per 512 face on an RTX 3060 with FP16.
  codeformer     품질은 더 좋지만 Transformer+VQ 라 2~4배 느립니다(약 50~110ms).
                 1:1 수업 실시간에는 예산을 넘습니다. 녹화 후처리에는 좋습니다.
                 Better quality, 2-4x slower. Over budget for live 1:1; good for
                 post-processing recordings.
  realesrgan     얼굴이 아니라 «화면 전체» 가 목적일 때. realesr-general-x4v3 은
                 SRVGGNetCompact(작은 CNN)이라 초해상도치고는 가볍습니다.
                 For general (non-face) upscaling. The x4v3 general model is a small CNN.
  cv-sharpen     AI 아님. 디블록 + 언샤프 마스크, 약 1~2ms, CPU.
                 «AI 가 정말 값어치를 하는가» 를 재는 기준선입니다. 반드시 함께 재세요.
                 Not AI. Deblock + unsharp, ~1-2 ms on CPU. The baseline you MUST
                 measure against before concluding AI is worth it.
  none           통과. 검출·기하 비용만 잽니다 / passthrough; measures detect+geometry cost only.


⚠️ GFPGAN·CodeFormer 는 «없는 것을 그려 넣습니다»(hallucination).
   뭉개진 얼굴을 «그럴듯한» 얼굴로 만드는 것이지 잃어버린 정보를 되찾는 것이 아닙니다.
   ⛔ 교재(칠판·PDF) 화면에는 절대 쓰지 마세요 — 없는 글자를 지어냅니다.
⚠️ These models HALLUCINATE. They make a blurred face look plausible; they do not
   recover lost information. ⛔ Never apply to the textbook/whiteboard pane — it will
   invent characters that were never there.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

import cv2
import numpy as np

from config import ProbeConfig, fetch_weight

FACE_SIZE = 512


class Restorer(ABC):
    name = "base"

    @abstractmethod
    def restore(self, face: np.ndarray) -> np.ndarray:
        """512x512 BGR → 512x512 BGR."""

    def warmup(self) -> None:
        """첫 프레임이 유독 느린 것을 미리 털어냅니다 / burn off first-call cost.

        ⚠️ CUDA 는 첫 호출에 커널 컴파일·메모리 할당이 몰려 200~2000ms 가 나옵니다.
           워밍업 없이 재면 «지연이 2초» 라는 틀린 숫자를 보고하게 됩니다.
        ⚠️ The first CUDA call bundles kernel compilation and allocation (200-2000 ms).
           Benchmarking without a warmup reports a wrong number.
        """
        dummy = np.full((FACE_SIZE, FACE_SIZE, 3), 128, np.uint8)
        for _ in range(3):
            self.restore(dummy)


# ---------------------------------------------------------------------------
# 통과 / passthrough
# ---------------------------------------------------------------------------
class NoopRestorer(Restorer):
    name = "none"

    def restore(self, face: np.ndarray) -> np.ndarray:
        return face

    def warmup(self) -> None:
        pass


# ---------------------------------------------------------------------------
# 비-AI 기준선 / non-AI baseline
# ---------------------------------------------------------------------------
class SharpenRestorer(Restorer):
    """
    디블록 + 언샤프 마스크 / deblock + unsharp mask.

    bilateralFilter 로 «압축 블록 경계» 를 뭉개되 진짜 윤곽은 지키고,
    그 위에 언샤프를 얹습니다. 브라우저에서도 그대로 할 수 있는 연산이라
    «AI 없이 어디까지 되나» 의 상한선입니다.
    Bilateral removes block edges while keeping real ones; unsharp adds bite.
    This is doable in a browser too, so it's the ceiling of the no-AI option.
    """
    name = "cv-sharpen"

    def restore(self, face: np.ndarray) -> np.ndarray:
        base = cv2.bilateralFilter(face, d=5, sigmaColor=45, sigmaSpace=45)
        blur = cv2.GaussianBlur(base, (0, 0), 2.0)
        return cv2.addWeighted(base, 1.7, blur, -0.7, 0)

    def warmup(self) -> None:
        pass


# ---------------------------------------------------------------------------
# 토치 공통 / shared torch plumbing
# ---------------------------------------------------------------------------
class _TorchRestorer(Restorer):
    """텐서 변환·FP16·no_grad 를 한 곳에 모읍니다 / one place for tensor IO, FP16, no_grad."""

    #: 입력 정규화 범위 / input normalization
    #:   True  → [-1, 1]  (GFPGAN, CodeFormer)
    #:   False → [0, 1]   (Real-ESRGAN)
    signed = True

    def __init__(self, cfg: ProbeConfig):
        import torch                                          # noqa: PLC0415
        self.torch = torch
        self.device = torch.device(cfg.resolved_device)
        # FP16 은 CUDA 에서만. CPU/MPS 에서 half() 를 걸면 오히려 느리거나 터집니다.
        # FP16 on CUDA only — on CPU/MPS half() is slower or throws.
        self.half = bool(cfg.fp16 and cfg.resolved_device == "cuda")
        self.dtype = torch.float16 if self.half else torch.float32
        self.net = None                                       # 하위 클래스가 채웁니다

        if cfg.resolved_device == "cuda":
            # cuDNN 자동 튜너 — 입력 크기가 512 로 «고정» 이라 크게 이득입니다.
            # 크기가 매 프레임 바뀌면 오히려 매번 재탐색해 느려집니다(우리는 고정).
            # cuDNN autotuner: a big win because our input size is FIXED at 512.
            torch.backends.cudnn.benchmark = True
            # TF32 — Ampere 이상에서 float32 행렬곱을 빠르게. 화질 차이는 눈에 안 보입니다.
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True

    def _finish(self) -> None:
        """모델을 장치에 올리고 평가 모드로 / move to device, eval mode."""
        self.net.eval().to(self.device)
        if self.half:
            self.net.half()
        for p in self.net.parameters():
            p.requires_grad_(False)                           # 그래프를 아예 만들지 않게

    def _to_tensor(self, bgr: np.ndarray):
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        if self.signed:
            rgb = (rgb - 0.5) / 0.5
        t = self.torch.from_numpy(rgb).permute(2, 0, 1).unsqueeze(0)
        return t.to(self.device, dtype=self.dtype, non_blocking=True)

    def _to_image(self, t) -> np.ndarray:
        t = t.detach().float()[0]
        if self.signed:
            t = (t.clamp(-1, 1) + 1.0) / 2.0
        else:
            t = t.clamp(0, 1)
        arr = (t.permute(1, 2, 0).cpu().numpy() * 255.0).round().astype(np.uint8)
        return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)

    def restore(self, face: np.ndarray) -> np.ndarray:
        with self.torch.inference_mode():                     # no_grad 보다 한 겹 더 가볍습니다
            out = self._forward(self._to_tensor(face))
        img = self._to_image(out)
        if img.shape[:2] != (FACE_SIZE, FACE_SIZE):
            img = cv2.resize(img, (FACE_SIZE, FACE_SIZE), interpolation=cv2.INTER_LINEAR)
        return img

    @abstractmethod
    def _forward(self, x):
        ...


# ---------------------------------------------------------------------------
# GFPGAN v1.4  ★ 권장 / recommended
# ---------------------------------------------------------------------------
class GfpganRestorer(_TorchRestorer):
    """
    GFPGANer 래퍼를 «쓰지 않고» 네트워크를 직접 씁니다.
    We load the raw network instead of the GFPGANer wrapper. Why:

      · GFPGANer 는 내부에서 facexlib(RetinaFace)로 얼굴을 다시 찾습니다 — 20~60ms.
        우리는 이미 YuNet 으로 1~3ms 에 찾았으므로 그 일을 두 번 하지 않습니다.
        GFPGANer re-detects faces with facexlib (20-60 ms). We already have them.
      · GFPGANer 는 항상 float32 로 텐서를 만들어 FP16 을 걸 수가 없습니다.
        GFPGANer hardcodes float32, so FP16 is impossible through it.
    """
    name = "gfpgan"
    signed = True

    def __init__(self, cfg: ProbeConfig):
        super().__init__(cfg)
        try:
            from gfpgan.archs.gfpganv1_clean_arch import GFPGANv1Clean   # noqa: PLC0415
        except ImportError as e:
            raise SystemExit(
                "\n[모델 없음] gfpgan 이 설치되지 않았습니다 / gfpgan not installed\n"
                "  pip install gfpgan basicsr facexlib\n"
                "  ⚠️ basicsr 가 최신 torchvision 에서 import 에러를 내면 README 의\n"
                "     «basicsr 호환» 절을 보세요 / see the basicsr note in README.md\n"
            ) from e

        self.net = GFPGANv1Clean(
            out_size=512, num_style_feat=512, channel_multiplier=2,
            decoder_load_path=None, fix_decoder=False,
            num_mlp=8, input_is_latent=True, different_w=True,
            narrow=1, sft_half=True,
        )
        sd = self.torch.load(str(fetch_weight("gfpgan")), map_location="cpu")
        self.net.load_state_dict(sd.get("params_ema", sd.get("params", sd)), strict=True)
        self._finish()

    def _forward(self, x):
        # randomize_noise=False — 매 프레임 다른 노이즈를 쓰면 정지 화면에서도
        # 얼굴이 «지글거립니다». 실시간 영상에서 이 한 줄이 체감 차이가 큽니다.
        # Deterministic noise: random noise per frame makes a still face shimmer.
        return self.net(x, return_rgb=False, randomize_noise=False)[0]


# ---------------------------------------------------------------------------
# CodeFormer
# ---------------------------------------------------------------------------
class CodeformerRestorer(_TorchRestorer):
    name = "codeformer"
    signed = True

    def __init__(self, cfg: ProbeConfig):
        super().__init__(cfg)
        self.w = float(cfg.codeformer_fidelity)
        try:
            from basicsr.utils.registry import ARCH_REGISTRY                  # noqa: PLC0415
            arch = ARCH_REGISTRY.get("CodeFormer")
        except Exception as e:                                                # noqa: BLE001
            raise SystemExit(
                "\n[모델 없음] CodeFormer 아키텍처를 찾지 못했습니다 / CodeFormer arch not found\n"
                "  CodeFormer 는 «업스트림 basicsr 에 없습니다» — 저장소를 받아 경로에 넣어야 합니다:\n"
                "  CodeFormer is NOT in upstream basicsr; you must clone the repo:\n"
                "    git clone https://github.com/sczhou/CodeFormer\n"
                "    export PYTHONPATH=$PWD/CodeFormer:$PYTHONPATH\n"
                "  ℹ️ 실시간 목적이면 --model gfpgan 을 쓰세요(2~4배 빠릅니다).\n"
            ) from e

        self.net = arch(dim_embd=512, codebook_size=1024, n_head=8, n_layers=9,
                        connect_list=["32", "64", "128", "256"])
        sd = self.torch.load(str(fetch_weight("codeformer")), map_location="cpu")
        self.net.load_state_dict(sd.get("params_ema", sd), strict=True)
        self._finish()

    def _forward(self, x):
        return self.net(x, w=self.w, adain=True)[0]


# ---------------------------------------------------------------------------
# Real-ESRGAN (realesr-general-x4v3)
# ---------------------------------------------------------------------------
class RealesrganRestorer(_TorchRestorer):
    """
    얼굴 전용이 아닌 일반 초해상도 / general-purpose SR, not face-specific.

    입력을 sr_input_size(기본 128)로 줄여 넣고 x4 로 512 를 받습니다.
    We downscale the aligned crop to sr_input_size (128) and let x4 bring it back to 512.

    ⚠️ 이상해 보이지만 의도한 것입니다 — 열화된 스트림의 «진짜 정보» 는 이미
       128px 아래에 있고, 512 로 그대로 넣으면 연산이 16배인데 얻는 것이 없습니다.
    ⚠️ Looks odd but it's deliberate: on a degraded stream the real information is
       already below 128px. Feeding 512 costs 16x the compute for nothing.
    """
    name = "realesrgan"
    signed = False

    def __init__(self, cfg: ProbeConfig):
        super().__init__(cfg)
        self.in_size = max(32, int(cfg.sr_input_size))
        try:
            from basicsr.archs.srvgg_arch import SRVGGNetCompact              # noqa: PLC0415
        except ImportError as e:
            raise SystemExit(
                "\n[모델 없음] basicsr 이 설치되지 않았습니다 / basicsr not installed\n"
                "  pip install basicsr realesrgan\n"
            ) from e

        self.net = SRVGGNetCompact(num_in_ch=3, num_out_ch=3, num_feat=64,
                                   num_conv=32, upscale=4, act_type="prelu")
        sd = self.torch.load(str(fetch_weight("realesrgan")), map_location="cpu")
        self.net.load_state_dict(sd.get("params", sd), strict=True)
        self._finish()

    def restore(self, face: np.ndarray) -> np.ndarray:
        small = cv2.resize(face, (self.in_size, self.in_size), interpolation=cv2.INTER_AREA)
        return super().restore(small)

    def _forward(self, x):
        return self.net(x)


# ---------------------------------------------------------------------------
_REGISTRY = {
    "none": NoopRestorer,
    "cv-sharpen": SharpenRestorer,
    "gfpgan": GfpganRestorer,
    "codeformer": CodeformerRestorer,
    "realesrgan": RealesrganRestorer,
}


def build_restorer(cfg: ProbeConfig) -> Restorer:
    key = cfg.model.lower()
    if key not in _REGISTRY:
        raise SystemExit(f"\n[모델 이름 오류] '{cfg.model}' — 쓸 수 있는 값: {', '.join(_REGISTRY)}\n")
    cls = _REGISTRY[key]
    r = cls() if cls in (NoopRestorer, SharpenRestorer) else cls(cfg)
    print(f"  ✓ 모델 준비 / model ready: {r.name}")
    r.warmup()
    return r
