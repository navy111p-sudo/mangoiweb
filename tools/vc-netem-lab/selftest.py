#!/usr/bin/env python3
"""
selftest.py — root·netem·인터넷 없이 도는 자체 점검 / offline self-check.

    python selftest.py

무엇을 확인하나
  ① 프로파일 값이 실측 표와 맞는가 (RTT/2 = 편도 지연)
  ② tc 명령이 정확히 만들어지는가 — 「걸었는데 실제로는 다른 값」을 막습니다
  ③ netem 이 없을 때 «조용히 넘어가지 않고» 멈추는가  ← 이 도구의 존재 이유
  ④ report 가 SELECT 아닌 질의를 실제로 거절하는가   ← 운영 DB 안전장치
  ⑤ 기준선(none)이 정말 아무것도 안 거는가

⚠️ ③과 ④는 «주석으로 적어 둔 약속» 이 아니라 «코드가 실제로 그렇게 하는가» 를 봅니다.
   적어 두는 것은 안 지켜집니다.
"""

from __future__ import annotations

import sys

import profiles as P
import shaper

_pass = _fail = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global _pass, _fail
    if ok:
        _pass += 1
        print(f"  ✅ {name}" + (f"   {detail}" if detail else ""))
    else:
        _fail += 1
        print(f"  ❌ {name}   {detail}")


def main() -> int:
    print("=" * 76)
    print("  자체 점검 / selftest — root·netem·인터넷 없이")
    print("=" * 76)

    # ① 프로파일 / profiles
    print("\n[①] 프로파일 값 / profile values")
    #     (이름, RTT, 편도지연) — 실측 표에서 손으로 푼 값
    want = {"clean": (100, 50), "typical": (170, 85), "strained": (250, 125),
            "poor": (380, 190), "cliff": (500, 250), "farrah": (494, 247)}
    for key, (rtt, oneway) in want.items():
        p = P.get(key)
        check(f"{key:<9} RTT {rtt} → 편도 {oneway}ms",
              p.rtt_ms == rtt and p.delay_ms == oneway,
              f"실제 RTT {p.rtt_ms} 편도 {p.delay_ms}")
    check("절벽 구간 손실이 실측값(7.6%)", P.get("cliff").loss_pct == 7.6)
    check("모든 프로파일에 근거 설명이 있다",
          all(len(p.note) > 10 for p in (P.BASELINE, *P.PROFILES.values())))
    # 🔴 RTT/2 를 빠뜨리면 지연이 두 배가 됩니다 — 그때 실제로 FAIL 나는지
    check("편도 = RTT/2 규칙이 전부에 걸린다",
          all(p.delay_ms == round(p.rtt_ms / 2) for p in P.PROFILES.values()))

    # ② tc 명령 / generated commands
    print("\n[②] tc 명령이 정확한가 / generated tc commands")
    cmds = shaper.build_command("eth0", P.get("cliff"))
    flat = " ".join(cmds[0]) if cmds else ""
    check("netem 이 root qdisc 로", "root handle 1: netem" in flat, flat[:70])
    check("편도 지연 250ms", " delay 250ms " in flat + " ")
    check("지터 90ms + 정규분포", "90ms distribution normal" in flat,
          "균등분포면 지터버퍼가 실제보다 잘 버팁니다(낙관적 오판)")
    check("손실 7.6%", "loss 7.6%" in flat)

    cmds = shaper.build_command("eth0", P.get("typical"), rate_kbit=400)
    check("대역 제한은 netem 의 «자식» 으로", len(cmds) == 2 and "parent" in " ".join(cmds[1]),
          "반대로 달면 큐가 실제와 다르게 찹니다")
    check("대역 400kbit", "rate 400kbit" in " ".join(cmds[1]))

    # ⑤ 기준선 / baseline
    print("\n[⑤] 기준선(none)은 아무것도 안 건다")
    check("명령이 0개", shaper.build_command("eth0", P.BASELINE) == [],
          "기준선이 뭔가를 걸면 «비교 대상» 이 사라집니다")
    check("기준선 편도 지연 0", P.BASELINE.delay_ms == 0)

    # ③ netem 없을 때 «멈추는가» / must FAIL LOUD, not pass quietly
    print("\n[③] netem 을 못 쓸 때 조용히 넘어가지 않는가  ← 이 도구의 존재 이유")
    ok, why = shaper.netem_available()
    print(f"      이 기계의 netem: {'사용 가능' if ok else '못 씀 — ' + why[:60]}")
    if ok:
        check("netem 이 있으므로 이 검사는 건너뜁니다", True,
              "netem 없는 기계에서 돌리면 «멈추는지» 를 실제로 확인합니다")
    else:
        # 실제로 apply 를 불러서 «예외를 던지는지» 봅니다 — 통과해 버리면 큰일입니다.
        raised = False
        try:
            shaper.apply("lo", P.get("cliff"))
        except SystemExit:
            raised = True                     # require_root 가 먼저 걸릴 수도 있습니다
        except shaper.ShaperError as e:
            raised = True
            check("멈춘 이유를 사람이 읽을 수 있게 말한다",
                  "netem" in str(e) and ("리눅스" in str(e) or "kernel" in str(e).lower()))
        except Exception as e:                # noqa: BLE001
            check("예상 못 한 예외", False, repr(e))
        check("netem 없이 apply 하면 «반드시» 실패한다", raised,
              "🔴 통과했다면 열화 없이 시험이 돌아 «정상» 이라는 거짓 결과가 납니다")

    # ④ report 의 읽기 전용 강제 / read-only must be enforced in code
    print("\n[④] report 가 SELECT 아닌 질의를 실제로 거절하는가")
    import report
    for bad in ("DELETE FROM vc_quality", "UPDATE vc_quality SET room=''",
                "DROP TABLE vc_quality", "  drop table x",
                "(DELETE FROM x)"):
        blocked = False
        try:
            report._run(bad)
        except SystemExit:
            blocked = True
        except Exception:                     # noqa: BLE001
            blocked = False                   # 다른 이유로 죽은 것은 «막았다» 가 아닙니다
        check(f"거절: {bad[:34]:<34}", blocked)
    # 반대 방향도 짝으로 — SELECT 는 «막히지 않아야» 합니다(막으면 리포트가 통째로 죽습니다).
    passed_gate = False
    try:
        report._run("SELECT 1")
    except SystemExit as e:
        # npx 없음·wrangler 실패는 게이트를 «지난 뒤» 나는 것이라 정상입니다.
        passed_gate = "SELECT 가 아닌" not in str(e)
    except Exception:                         # noqa: BLE001
        passed_gate = True
    check("SELECT 는 게이트를 통과한다", passed_gate,
          "«전부 거절» 이면 이 검사가 뜻을 잃습니다")

    print("\n" + "=" * 76)
    print(f"  통과 PASS {_pass}   실패 FAIL {_fail}")
    print("=" * 76)
    return 1 if _fail else 0


if __name__ == "__main__":
    sys.exit(main())
