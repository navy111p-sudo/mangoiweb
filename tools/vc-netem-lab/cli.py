#!/usr/bin/env python3
"""
cli.py — 필리핀 회선 재현 시험대 / Philippine-link reproduction lab.

  python cli.py check                              # 이 기계에서 쓸 수 있나
  python cli.py profiles                           # 회선 프로파일 목록(실측 근거 포함)
  python cli.py report --who                       # 「왜 끊기나」를 운영 데이터로
  sudo python cli.py shape --dev eth0 --profile cliff --hold
  sudo python cli.py clear --dev eth0

쓰는 순서 / how to use
──────────────────────
  ① `report` 로 지금 무엇이 문제인지 봅니다(추측 금지)
  ② `shape` 로 그 회선을 **강사·학생 기기에서** 재현합니다
  ③ 그 상태로 **진짜 수업에 들어가** 봅니다 — 적응 사다리·AAO 가 실제로 도는지
  ④ 끝나면 `clear`

⚠️ 이 시험대는 **아무것도 고치지 않습니다.** 「고치기 전에 재현할 수 있어야 한다」를
   위한 것입니다. 재현이 안 되면 고쳤는지도 알 수 없습니다.
"""

from __future__ import annotations

import argparse
import sys

import profiles as P
import shaper


def cmd_check(_: argparse.Namespace) -> int:
    import os
    print("=" * 72)
    print("  환경 점검 / environment check")
    print("=" * 72)
    root = os.geteuid() == 0
    print(f"  root 권한        : {'✅ 있음' if root else '❌ 없음 — sudo 로 실행하세요'}")

    import shutil
    has_tc = bool(shutil.which("tc"))
    print(f"  tc (iproute2)    : {'✅ 있음' if has_tc else '❌ 없음 — sudo apt-get install -y iproute2'}")

    ok, why = shaper.netem_available()
    if ok:
        print("  netem 커널 모듈  : ✅ 사용 가능")
    else:
        print(f"  netem 커널 모듈  : ❌ 못 씁니다 — {why}")
        print()
        print("  🔴 이 기계에서는 «지연·손실» 재현을 할 수 없습니다.")
        print("     그렇다고 그냥 돌리면 «열화 없이» 시험이 돌아 «정상» 이라는")
        print("     거짓 결과가 나오므로, shape 명령이 아예 멈춥니다.")
        print("     → 진짜 리눅스 VM 이나 베어메탈(강사·학생 실제 PC)에서 돌리세요.")

    if has_tc:
        devs = shaper.interfaces()
        print(f"  네트워크 장치    : {', '.join(devs) if devs else '(못 찾음)'}")
        print("                     ⚠️ SSH 로 접속 중이라면 그 장치에 걸지 마세요 — 접속이 끊깁니다")
    print("=" * 72)
    return 0 if (root and ok) else 1


def cmd_profiles(_: argparse.Namespace) -> int:
    print("=" * 110)
    print("  회선 프로파일 — 전부 운영 D1 vc_quality 실측입니다 (2026-09-01~04, 725분)")
    print("=" * 110)
    print(P.table())
    print("=" * 110)
    print("  ⚠️ 대역폭(kbps)은 재지 않았습니다 — 필요하면 --rate 로 직접 주세요.")
    print("     「필리핀은 이 정도일 것」이라고 지어내지 마세요.")
    return 0


def cmd_shape(a: argparse.Namespace) -> int:
    prof = P.get(a.profile)
    try:
        shaper.apply(a.dev, prof, a.rate)
    except shaper.ShaperError as e:
        print(f"\n❌ {e}\n", file=sys.stderr)
        return 1

    if not a.hold:
        print("\n  ℹ️ 걸어 두었습니다. 끝나면 반드시 걷어내세요:")
        print(f"       sudo python cli.py clear --dev {a.dev}")
        # atexit 자동 해제를 건너뜁니다 — 걸어 둔 채로 나가는 것이 이 모드의 목적입니다.
        shaper._applied.discard(a.dev)
        return 0

    print("\n  ⏳ 걸어 둔 채로 기다립니다. 지금 수업에 들어가 보세요.")
    print("     Ctrl+C 를 누르면 자동으로 걷어냅니다.\n")
    try:
        import time
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print("\n  · 중단 — 걷어냅니다 / interrupted, clearing")
    return 0


def cmd_clear(a: argparse.Namespace) -> int:
    try:
        shaper.require_root()
        shaper.clear(a.dev)
    except shaper.ShaperError as e:
        print(f"\n❌ {e}\n", file=sys.stderr)
        return 1
    return 0


def cmd_report(a: argparse.Namespace) -> int:
    import report
    print(report.render(a.days, a.who))
    return 0


def main() -> int:
    p = argparse.ArgumentParser(
        description="필리핀 회선 재현 시험대 / Philippine-link reproduction lab",
        formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("check", help="이 기계에서 쓸 수 있는지 점검").set_defaults(fn=cmd_check)
    sub.add_parser("profiles", help="회선 프로파일 목록").set_defaults(fn=cmd_profiles)

    s = sub.add_parser("shape", help="회선을 나쁘게 만듭니다 (root 필요)")
    s.add_argument("--dev", required=True,
                   help="네트워크 장치 이름 (예: eth0, wlan0). ⚠️ 기본값을 두지 않았습니다 "
                        "— SSH 장치에 실수로 거는 것을 막기 위해서입니다")
    s.add_argument("--profile", required=True,
                   choices=[P.BASELINE.key, *P.PROFILES.keys()])
    s.add_argument("--rate", type=int, default=None, metavar="KBIT",
                   help="대역폭 상한(kbit). ⚠️ 실측값이 없으니 근거가 있을 때만 주세요")
    s.add_argument("--hold", action="store_true",
                   help="Ctrl+C 까지 걸어 둔 채 기다립니다(끝나면 자동 해제)")
    s.set_defaults(fn=cmd_shape)

    c = sub.add_parser("clear", help="걸어 둔 것을 걷어냅니다")
    c.add_argument("--dev", required=True)
    c.set_defaults(fn=cmd_clear)

    r = sub.add_parser("report", help="「왜 끊기나」를 운영 데이터로 (읽기 전용)")
    r.add_argument("--days", type=int, default=14)
    r.add_argument("--who", action="store_true", help="사람별 표도 함께")
    r.set_defaults(fn=cmd_report)

    a = p.parse_args()
    return a.fn(a)


if __name__ == "__main__":
    raise SystemExit(main())
