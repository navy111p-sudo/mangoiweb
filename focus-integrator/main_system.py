"""
메인 통합 시스템 에이전트 (Main Integration System Agent)
========================================================
- 에이전트 1 (시선/Gaze) 과 에이전트 2 (발화/Speech) 의 JSON 데이터를 입력 받아
  가중치(시선 60%, 발화 40%)로 최종 집중도 점수를 계산합니다.
- 모든 입력과 출력은 JSON 형식입니다.
- Cloudflare Pages + GitHub 자동 배포를 위한 진입점으로 사용됩니다.

Author : 메인 시스템 통합 및 배포 프롬프트
Date   : 2026-04-22
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

# -----------------------------------------------------------------------------
# 가중치 정의 (규칙: 시선 60%, 발화 40%)
# -----------------------------------------------------------------------------
WEIGHT_GAZE: float = 0.60     # 에이전트 1: 시선
WEIGHT_SPEECH: float = 0.40   # 에이전트 2: 발화

# -----------------------------------------------------------------------------
# 유틸 함수
# -----------------------------------------------------------------------------
def _clip(value: float, low: float = 0.0, high: float = 100.0) -> float:
    """점수를 0~100 범위로 안전하게 제한."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        v = 0.0
    return max(low, min(high, v))


def _extract_score(payload: Dict[str, Any], keys: tuple[str, ...]) -> float:
    """
    에이전트 JSON에서 점수 필드를 유연하게 추출.
    허용 키 예) gaze_score, focus_score, score, value, speech_score ...
    """
    if not isinstance(payload, dict):
        raise ValueError("입력 데이터는 JSON(object) 이어야 합니다.")

    for k in keys:
        if k in payload:
            return _clip(payload[k])

    # 중첩된 구조도 한 단계 탐색 (예: {"data": {"score": 88}})
    for v in payload.values():
        if isinstance(v, dict):
            for k in keys:
                if k in v:
                    return _clip(v[k])

    raise KeyError(
        f"점수 필드({', '.join(keys)}) 를 JSON 에서 찾지 못했습니다."
    )


# -----------------------------------------------------------------------------
# 핵심 통합 로직
# -----------------------------------------------------------------------------
def integrate_focus(
    agent1_json: Dict[str, Any],
    agent2_json: Dict[str, Any],
) -> Dict[str, Any]:
    """
    두 에이전트의 JSON 을 받아 최종 집중도 점수를 계산하고
    통합 JSON 결과를 반환한다.

    Parameters
    ----------
    agent1_json : dict   # 시선 (gaze)  점수 포함
    agent2_json : dict   # 발화 (speech) 점수 포함

    Returns
    -------
    dict  # 명세에 맞는 JSON 결과
    """
    # 1) 각 에이전트 점수 추출 (필드명 호환성 확보)
    gaze_score = _extract_score(
        agent1_json,
        keys=("gaze_score", "focus_score", "score", "value"),
    )
    speech_score = _extract_score(
        agent2_json,
        keys=("speech_score", "focus_score", "score", "value"),
    )

    # 2) 가중 평균 계산 (시선 60% + 발화 40%)
    final_focus_score = round(
        gaze_score * WEIGHT_GAZE + speech_score * WEIGHT_SPEECH,
        2,
    )

    # 3) 결과 JSON 구성 (명세 + 부가 메타데이터)
    result: Dict[str, Any] = {
        "agent": "main_system",
        "status": "success",
        "final_focus_score": final_focus_score,
        "github_push_ready": True,
        "meta": {
            "weights": {
                "gaze": WEIGHT_GAZE,
                "speech": WEIGHT_SPEECH,
            },
            "inputs": {
                "agent1_gaze_score": gaze_score,
                "agent2_speech_score": speech_score,
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    }
    return result


# -----------------------------------------------------------------------------
# CLI 진입점 (파일 또는 stdin 에서 JSON 읽기)
# -----------------------------------------------------------------------------
def _load_json(path: str) -> Dict[str, Any]:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"JSON 파일을 찾을 수 없습니다: {path}")
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)


def main(argv: list[str]) -> int:
    """
    사용법
    ------
    1) 파일 입력
       python main_system.py agent1.json agent2.json
    2) stdin 입력 (JSON 배열 또는 객체 두 개 concat)
       cat combined.json | python main_system.py -
    """
    try:
        if len(argv) >= 3:
            agent1 = _load_json(argv[1])
            agent2 = _load_json(argv[2])
        elif len(argv) == 2 and argv[1] == "-":
            raw = sys.stdin.read()
            data = json.loads(raw)
            if isinstance(data, list) and len(data) == 2:
                agent1, agent2 = data[0], data[1]
            elif isinstance(data, dict) and "agent1" in data and "agent2" in data:
                agent1, agent2 = data["agent1"], data["agent2"]
            else:
                raise ValueError(
                    "stdin JSON 은 [agent1, agent2] 배열 또는 "
                    "{agent1:..., agent2:...} 객체여야 합니다."
                )
        else:
            # 기본: 샘플 파일을 사용하는 데모 모드
            base = Path(__file__).parent
            agent1 = _load_json(str(base / "sample_agent1.json"))
            agent2 = _load_json(str(base / "sample_agent2.json"))

        result = integrate_focus(agent1, agent2)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    except Exception as exc:  # noqa: BLE001
        error_payload = {
            "agent": "main_system",
            "status": "error",
            "error": str(exc),
            "github_push_ready": False,
        }
        print(json.dumps(error_payload, ensure_ascii=False, indent=2))
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
