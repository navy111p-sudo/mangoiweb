# -*- coding: utf-8 -*-
"""
🎓 망고아이 온라인 화상영어 — 강의실 입장 & 장비(웹캠/마이크) 검증 테스트 하네스
================================================================================
목적 : 브라우저에 붙이기 전에, "강의실 입장 + 웹캠/마이크 연결 상태 확인" 기능이
       가짜 데이터에서 오차 없이 동작하는지 검증한다.
특징 : 함수 단위로 쪼개서, 결과(JSON/텍스트)를 나중에 웹(HTML)에 그대로 뿌릴 수 있게 했다.

실행 : python classroom_test_harness.py
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any


# ──────────────────────────────────────────────────────────────────────────
# 1) 가짜 데이터 모델 — 강의실 입장 시 보내는 "입장 요청" 한 건
# ──────────────────────────────────────────────────────────────────────────
@dataclass
class JoinRequest:
    role: str          # 'teacher'(강사) | 'student'(학생)
    name: str          # 이름
    room: str          # 방 코드
    mic_on: bool       # 마이크 켜짐 여부
    cam_on: bool       # 카메라(웹캠) 켜짐 여부


# ──────────────────────────────────────────────────────────────────────────
# 2) 핵심 검증 로직 — "이 입장 요청이 수업을 시작해도 되는 상태인가?"
#    → 실제 서비스의 '입장 + 장비 확인' 규칙을 그대로 흉내냄
# ──────────────────────────────────────────────────────────────────────────
def validate_join(req: JoinRequest) -> Dict[str, Any]:
    """
    입장 요청 1건을 검사해서 결과 dict 를 돌려준다.
    규칙:
      · 방 코드가 비어 있으면 실패
      · 마이크가 꺼져 있으면 실패 (수업은 말하기가 핵심)
      · 카메라가 꺼져 있으면 실패 (얼굴을 봐야 함)
    반환: { ok, role, name, reasons[] }
    """
    reasons: List[str] = []

    if not req.room:
        reasons.append("방 코드가 없습니다.")
    if not req.mic_on:
        reasons.append("마이크가 꺼져 있습니다.")
    if not req.cam_on:
        reasons.append("카메라(웹캠) 연결에 실패했습니다.")

    return {
        "ok": len(reasons) == 0,   # 문제가 하나도 없어야 입장 가능
        "role": req.role,
        "name": req.name,
        "reasons": reasons,
    }


# ──────────────────────────────────────────────────────────────────────────
# 3) 테스트 케이스 1건 실행 — '기대값(expected)' 과 '실제 결과' 를 비교
#    expect_pass=True  → 입장 성공이 정상인 케이스
#    expect_pass=False → 오류가 감지되어야 정상인 케이스
# ──────────────────────────────────────────────────────────────────────────
def run_case(title: str, req: JoinRequest, expect_pass: bool) -> Dict[str, Any]:
    result = validate_join(req)
    actual_pass = result["ok"]
    # 테스트 통과 = "기대한 대로 동작했는가"
    test_passed = (actual_pass == expect_pass)
    return {
        "title": title,
        "test_passed": test_passed,     # 이 테스트 자체의 성공/실패
        "join_ok": actual_pass,         # 실제 입장 가능했는지
        "expect_pass": expect_pass,     # 기대값
        "reasons": result["reasons"],   # 실패 사유(있으면)
        "role": result["role"],
        "name": result["name"],
    }


# ──────────────────────────────────────────────────────────────────────────
# 4) 전체 테스트 묶음 정의 + 실행 → 결과 리스트 반환 (웹 연동용 순수 데이터)
# ──────────────────────────────────────────────────────────────────────────
def run_all_tests() -> Dict[str, Any]:
    cases = [
        # ✅ 정상 케이스 — 강사 입장 성공, 장비 정상
        ("정상: 강사 입장 + 장비 정상",
         JoinRequest("teacher", "정우영", "mangoi-class", mic_on=True, cam_on=True),
         True),

        # ❌ 오류 케이스 1 — 학생 입장 시 마이크 꺼짐 (감지되어야 정상)
        ("오류1: 학생 입장 — 마이크 꺼짐",
         JoinRequest("student", "장지웅", "mangoi-class", mic_on=False, cam_on=True),
         False),

        # ❌ 오류 케이스 2 — 강사 입장 시 카메라 연결 실패 (감지되어야 정상)
        ("오류2: 강사 입장 — 카메라 연결 실패",
         JoinRequest("teacher", "정우영", "mangoi-class", mic_on=True, cam_on=False),
         False),
    ]

    results = [run_case(title, req, expect_pass) for (title, req, expect_pass) in cases]
    passed = sum(1 for r in results if r["test_passed"])
    total = len(results)

    return {
        "results": results,
        "passed": passed,
        "total": total,
        "all_passed": passed == total,
    }


# ──────────────────────────────────────────────────────────────────────────
# 5) 출력 포맷터 — 같은 결과를 (a) 콘솔 텍스트 (b) 웹(HTML) 두 형태로
#    → 웹 연동 시 build_html_report() 결과를 그대로 화면에 넣으면 됨
# ──────────────────────────────────────────────────────────────────────────
def build_text_report(summary: Dict[str, Any]) -> str:
    lines = []
    lines.append("=" * 50)
    lines.append("🎓 망고아이 강의실 입장·장비 점검 테스트")
    lines.append("=" * 50)
    for i, r in enumerate(summary["results"], 1):
        badge = "✅ 테스트 통과(성공)" if r["test_passed"] else "❌ 테스트 실패"
        lines.append(f"[{i}] {r['title']}")
        lines.append(f"    → {badge}")
        # 입장이 막힌 경우 사유 표시
        if not r["join_ok"] and r["reasons"]:
            lines.append(f"    🔎 감지된 문제: {', '.join(r['reasons'])}")
        lines.append("")
    lines.append("-" * 50)
    mark = "🎉" if summary["all_passed"] else "⚠️"
    lines.append(f"{mark} [총 {summary['total']}개 중 {summary['passed']}개 성공]")
    lines.append("=" * 50)
    return "\n".join(lines)


def build_html_report(summary: Dict[str, Any]) -> str:
    """클라우드 코워크 웹 화면에 그대로 넣을 수 있는 HTML 문자열."""
    rows = ""
    for i, r in enumerate(summary["results"], 1):
        ok = r["test_passed"]
        color = "#10b981" if ok else "#ef4444"
        badge = "✅ 통과" if ok else "❌ 실패"
        why = ("<div style='font-size:12px;color:#94a3b8'>🔎 "
               + ", ".join(r["reasons"]) + "</div>") if (not r["join_ok"] and r["reasons"]) else ""
        rows += (
            f"<div style='padding:10px 12px;border-left:4px solid {color};"
            f"background:#0f172a;border-radius:8px;margin:6px 0'>"
            f"<b style='color:#e2e8f0'>[{i}] {r['title']}</b>"
            f"<span style='float:right;color:{color};font-weight:800'>{badge}</span>{why}</div>"
        )
    tone = "#10b981" if summary["all_passed"] else "#f59e0b"
    return (
        "<div style='font-family:Noto Sans KR,sans-serif;max-width:640px;color:#e2e8f0'>"
        "<h3 style='color:#fbbf24'>🎓 강의실 입장·장비 점검 결과</h3>"
        f"{rows}"
        f"<div style='margin-top:10px;padding:10px;border-radius:8px;background:#1e293b;"
        f"font-weight:800;color:{tone};text-align:center'>"
        f"[총 {summary['total']}개 중 {summary['passed']}개 성공]</div></div>"
    )


# ──────────────────────────────────────────────────────────────────────────
# 6) 메인 실행
# ──────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    summary = run_all_tests()
    print(build_text_report(summary))

    # (선택) 웹 연동용 HTML 파일도 함께 저장 — 브라우저로 바로 열어볼 수 있음
    try:
        with open("test_report.html", "w", encoding="utf-8") as f:
            f.write(build_html_report(summary))
        print("\n📄 웹용 결과: test_report.html 저장 완료")
    except Exception as e:
        print("HTML 저장 건너뜀:", e)

    # 종료 코드 (CI 연동용: 전부 통과 0, 아니면 1)
    raise SystemExit(0 if summary["all_passed"] else 1)
