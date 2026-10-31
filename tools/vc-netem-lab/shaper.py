"""
shaper.py — 리눅스 커널로 회선을 «진짜로» 나쁘게 만듭니다 / really degrade the link.

왜 이것이 필요한가 / why this exists
────────────────────────────────────
기존 시험 하니스(`test-harness/vc_netem_multiclient_harness.mjs`)가 자기 한계를
머리말에 적어 두었습니다:

    ⚠️ CDP Network.emulateNetworkConditions 는 WebRTC UDP 미디어는 조이지 못함.

즉 그 하니스는 HTTP·WebSocket 만 조일 수 있고, **영상·음성이 실제로 흐르는 UDP 길은
한 번도 건드려 본 적이 없습니다.** 그래서 적응 사다리·AAO·Opus FEC 가 «진짜 손실» 에서
어떻게 도는지 아무도 확인하지 못했습니다. 이 파일이 그 자리를 메웁니다.

`tc netem` 은 커널 큐에 직접 지연·손실·지터를 넣으므로 **UDP 든 TCP 든 가리지 않습니다.**


⛔ 절대 규칙 — 조용히 안 걸리면 «실패» 입니다
──────────────────────────────────────────
netem 이 없는 환경에서 그냥 넘어가면, 시험은 «열화를 걸었다» 고 믿으면서 실제로는
깨끗한 회선에서 돌고 «적응 로직 정상» 이라는 **거짓 초록불**을 냅니다.
그건 검사가 없는 것보다 나쁩니다 — 아무도 다시 안 보게 되니까요.
그래서 이 파일은 ① 걸기 전에 netem 가용성을 확인하고 ② 건 뒤에 **실제로 걸렸는지
커널에 되물어** 확인합니다. 둘 중 하나라도 아니면 예외를 던집니다.

⛔ If netem silently does nothing, the test reports a FALSE GREEN. We check availability
   BEFORE and read the qdisc back AFTER; either failing raises.


⚠️ 이 프로그램은 «나가는 쪽»(egress)만 조입니다 / EGRESS ONLY
   내 기기에서 «나가는» 패킷에 지연·손실을 겁니다. 상대는 그것을 «받는 손실» 로 겪습니다.
   ⟹ 「상대 회선이 나쁘다」를 재현하려면 **상대 기기에서** 이 프로그램을 돌리세요.
   ⟹ 양쪽에서 돌리면 «양방향으로 나쁜 회선» 이 됩니다(실제 필리핀 상황에 가장 가깝습니다).
   ℹ️ 들어오는 쪽(ingress)까지 조이려면 ifb 가상장치가 필요한데, 커널 모듈이 없는
      환경이 많아 일부러 안 넣었습니다. 양쪽 egress 로 같은 효과를 냅니다.


⛔ 안전 / safety
   · root 가 필요합니다.
   · **원격 접속(SSH)에 쓰는 장치에 걸면 그 접속이 느려지거나 끊깁니다.** 그래서
     장치 이름을 반드시 손으로 주게 했고(`--dev`), 기본값을 두지 않았습니다.
   · 프로그램이 끝날 때(예외·Ctrl+C 포함) 자동으로 걷어냅니다.
   · 그래도 남았으면: `sudo tc qdisc del dev <장치> root`
"""

from __future__ import annotations

import atexit
import shutil
import subprocess
import sys

from profiles import Profile

_ROOT_HANDLE = "1:"
_applied: set[str] = set()          # 걷어낼 장치 / devices to clean up


class ShaperError(RuntimeError):
    """열화를 «걸었다고 믿을 수 없을 때» 던집니다 / raised when we cannot trust the shaping."""


# ---------------------------------------------------------------------------
def _tc(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    if not shutil.which("tc"):
        raise ShaperError(
            "tc 명령이 없습니다 / `tc` not found.\n"
            "  설치 / install:  sudo apt-get install -y iproute2")
    cp = subprocess.run(["tc", *args], capture_output=True, text=True)
    if check and cp.returncode != 0:
        raise ShaperError(f"tc {' '.join(args)}\n  → {cp.stderr.strip() or cp.stdout.strip()}")
    return cp


def require_root() -> None:
    import os
    if os.geteuid() != 0:
        raise ShaperError("root 권한이 필요합니다 / need root.  sudo 로 다시 실행하세요.")


def netem_available() -> tuple[bool, str]:
    """netem 을 «실제로 걸어 보고» 판정합니다 / probe by actually applying it.

    ⛔ `tc qdisc help` 같은 간접 확인으로 때우지 마세요 — 도움말은 있는데 커널 모듈은
       없는 환경이 실재합니다(Firecracker microVM 등에서 `sch_netem` 이 빠짐).
       그런 곳에서 «있다» 고 판정하면 정확히 이 파일이 막으려는 거짓 초록불이 납니다.
    ⛔ Don't probe with `tc qdisc help`; the help text exists where the kernel module
       does not. Probe by applying to loopback and rolling back.
    """
    if not shutil.which("tc"):
        return False, "tc 명령이 없습니다 (apt-get install iproute2)"
    try:
        cp = _tc("qdisc", "add", "dev", "lo", "root", "netem", "delay", "1ms", check=False)
        if cp.returncode != 0:
            return False, (cp.stderr.strip() or "netem qdisc 를 걸 수 없습니다")
        _tc("qdisc", "del", "dev", "lo", "root", check=False)
        return True, "ok"
    except ShaperError as e:
        return False, str(e)


def interfaces() -> list[str]:
    """이름 붙은 장치 목록 / named devices, for a helpful error message."""
    cp = _tc("-o", "qdisc", "show", check=False)
    out: list[str] = []
    for line in (cp.stdout or "").splitlines():
        parts = line.split()
        if "dev" in parts:
            name = parts[parts.index("dev") + 1]
            if name not in out:
                out.append(name)
    return out


# ---------------------------------------------------------------------------
def clear(dev: str, quiet: bool = False) -> None:
    """걸어 둔 것을 걷어냅니다 / remove shaping. 없어도 조용히 넘어갑니다."""
    _tc("qdisc", "del", "dev", dev, "root", check=False)
    _applied.discard(dev)
    if not quiet:
        print(f"  · 해제 / cleared: {dev}")


def _cleanup_all() -> None:
    for dev in list(_applied):
        try:
            clear(dev, quiet=True)
            print(f"  · 자동 해제 / auto-cleared: {dev}", file=sys.stderr)
        except Exception:                                   # noqa: BLE001
            print(f"  ⚠️ 자동 해제 실패 — 직접 걷어내세요: sudo tc qdisc del dev {dev} root",
                  file=sys.stderr)


atexit.register(_cleanup_all)


def apply(dev: str, prof: Profile, rate_kbit: int | None = None) -> str:
    """프로파일을 겁니다. 실제로 걸렸는지 커널에 되물어 확인합니다.

    Apply a profile, then READ IT BACK from the kernel to prove it took effect.
    """
    require_root()

    ok, why = netem_available()
    if not ok:
        raise ShaperError(
            f"netem 을 쓸 수 없습니다 / netem unavailable: {why}\n"
            "  ⛔ 이 상태로는 «열화 없이» 시험이 돌아 «정상» 이라는 거짓 결과가 나옵니다.\n"
            "     그래서 여기서 멈춥니다.\n"
            "  ℹ️ 흔한 원인 / common causes:\n"
            "     · 컨테이너 커널에 sch_netem 모듈이 없음 (Firecracker·일부 gVisor)\n"
            "       → 진짜 리눅스 VM 이나 베어메탈에서 돌리세요\n"
            "     · iproute2 미설치 → sudo apt-get install -y iproute2\n"
            "     · root 아님 → sudo")

    if dev not in interfaces():
        raise ShaperError(f"'{dev}' 라는 장치가 없습니다. 있는 것: {', '.join(interfaces()) or '(없음)'}")

    clear(dev, quiet=True)
    if prof.rtt_ms <= 0 and prof.loss_pct <= 0 and not rate_kbit:
        print(f"  · 기준선 — 아무것도 걸지 않았습니다 / baseline: nothing applied ({dev})")
        return "(없음)"

    # netem: delay <편도> <지터> distribution normal  loss <편도 손실>%
    args = ["qdisc", "add", "dev", dev, "root", "handle", _ROOT_HANDLE, "netem"]
    if prof.delay_ms > 0:
        args += ["delay", f"{prof.delay_ms}ms"]
        if prof.jitter_ms > 0:
            # distribution normal — 실제 회선의 지연 분포는 «균등» 이 아니라 종 모양입니다.
            # 빼면 지터가 균등분포가 되어 지터버퍼가 실제보다 잘 버팁니다(=낙관적 오판).
            args += [f"{prof.jitter_ms}ms", "distribution", "normal"]
    if prof.loss_pct > 0:
        args += ["loss", f"{prof.loss_pct}%"]
    _tc(*args)
    _applied.add(dev)

    if rate_kbit:
        # tbf 를 netem «자식» 으로 답니다 — 순서가 중요합니다.
        # 반대로 달면 지연이 대역 제한 «전» 에 걸려 큐가 실제와 다르게 찹니다.
        _tc("qdisc", "add", "dev", dev, "parent", _ROOT_HANDLE, "handle", "2:",
            "tbf", "rate", f"{rate_kbit}kbit", "burst", "32kbit", "latency", "400ms")

    # 🔴 되물어 확인 — 이 검사가 이 파일의 존재 이유입니다.
    shown = _tc("qdisc", "show", "dev", dev).stdout.strip()
    if "netem" not in shown:
        clear(dev, quiet=True)
        raise ShaperError(f"걸었는데 커널에 안 보입니다 / applied but not present:\n  {shown}")
    if prof.delay_ms > 0 and f"{prof.delay_ms}ms" not in shown:
        clear(dev, quiet=True)
        raise ShaperError(f"지연이 요청과 다릅니다 / delay mismatch:\n  {shown}")
    if rate_kbit and "tbf" not in shown:
        clear(dev, quiet=True)
        raise ShaperError(f"대역 제한이 안 걸렸습니다 / rate limit missing:\n  {shown}")

    print(f"  ✅ 적용 / applied on {dev}: {prof.label}")
    print(f"     편도 지연 {prof.delay_ms}ms ±{prof.jitter_ms}ms · 손실 {prof.loss_pct}%"
          + (f" · 대역 {rate_kbit}kbit" if rate_kbit else "")
          + f"   (= WebRTC RTT 약 {prof.rtt_ms}ms)")
    return shown


def build_command(dev: str, prof: Profile, rate_kbit: int | None = None) -> list[list[str]]:
    """실제로 걸지 않고 «어떤 명령이 나가는지» 만 돌려줍니다 — 자체 점검용.

    Return the tc commands WITHOUT running them, so selftest can check them offline.
    ⚠️ apply() 와 «같은 규칙» 이어야 합니다 — 갈리면 자체 점검이 헛돕니다.
    """
    cmds: list[list[str]] = []
    if prof.rtt_ms <= 0 and prof.loss_pct <= 0 and not rate_kbit:
        return cmds
    a = ["tc", "qdisc", "add", "dev", dev, "root", "handle", _ROOT_HANDLE, "netem"]
    if prof.delay_ms > 0:
        a += ["delay", f"{prof.delay_ms}ms"]
        if prof.jitter_ms > 0:
            a += [f"{prof.jitter_ms}ms", "distribution", "normal"]
    if prof.loss_pct > 0:
        a += ["loss", f"{prof.loss_pct}%"]
    cmds.append(a)
    if rate_kbit:
        cmds.append(["tc", "qdisc", "add", "dev", dev, "parent", _ROOT_HANDLE, "handle", "2:",
                     "tbf", "rate", f"{rate_kbit}kbit", "burst", "32kbit", "latency", "400ms"])
    return cmds
