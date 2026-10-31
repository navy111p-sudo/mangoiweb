"""
report.py — 「왜 끊기나」를 운영 데이터로 다시 뽑습니다 / re-run the freeze/drop analysis.

이 저장소는 이미 **끊김을 재고 있습니다** — `js/idx-vc-qlog.js` 가 60초마다 D1
`vc_quality` 에 남깁니다. 이 파일은 그것을 읽어 표로 만들 뿐입니다.
아무것도 새로 재지 않고, 아무것도 바꾸지 않습니다.

    python cli.py report                 # 기본 = 최근 14일
    python cli.py report --days 30
    python cli.py report --who           # 사람별


⛔ 읽기 전용을 «코드로» 막습니다 / read-only is ENFORCED, not just intended
   `CLAUDE.md` 1-1: 「D1 `mango-db` 는 개발/운영이 같은 DB입니다. 테스트용 DB가
   따로 없습니다. DELETE / UPDATE / DROP 를 테스트 목적으로 실행하지 마세요.」
   그래서 `_run()` 이 SELECT 로 시작하지 않는 질의를 **거절**합니다. 주석으로
   「SELECT 만 쓸 것」이라고 적어 두는 것과 다릅니다 — 적어 두는 것은 안 지켜집니다.

⚠️ 인증은 **wrangler 것을 그대로** 씁니다(`npx wrangler d1 execute`).
   새 API 토큰을 만들거나 이 폴더에 자격증명을 두지 않습니다.
"""

from __future__ import annotations

import json
import shutil
import subprocess

DB = "mango-db"

#: 이 칸들은 2026-09-01 에 생겼습니다 — 그 전 행에는 값이 없습니다(NULL/0).
#: 「8월에는 안 끊겼다」로 읽으면 안 됩니다. 그냥 «안 재고 있었다» 입니다.
COLS_ADDED_KST = "2026-09-01"


def _run(sql: str) -> list[dict]:
    q = sql.strip().lstrip("(").lstrip()
    if not q[:6].upper() == "SELECT":
        raise SystemExit(
            "\n⛔ SELECT 가 아닌 질의는 거절합니다 / refusing a non-SELECT statement.\n"
            "   운영 DB 입니다(개발용이 따로 없습니다).\n")
    if not shutil.which("npx"):
        raise SystemExit("\n[없음] npx 가 필요합니다 / need npx (Node.js).\n")

    cp = subprocess.run(
        ["npx", "--yes", "wrangler", "d1", "execute", DB, "--remote", "--json",
         "--command", sql],
        capture_output=True, text=True, cwd="cloudflare-deploy")
    if cp.returncode != 0:
        raise SystemExit(
            f"\n[조회 실패] wrangler 가 거절했습니다:\n{cp.stderr.strip()[:900]}\n"
            "  · 로그인이 안 돼 있으면: npx wrangler login\n"
            "  · cloudflare-deploy/ 안에서 도는지 확인하세요(wrangler.toml 이 거기 있습니다).\n")
    try:
        data = json.loads(cp.stdout)
    except json.JSONDecodeError:
        raise SystemExit(f"\n[응답 해석 실패]\n{cp.stdout[:600]}\n") from None
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return data[0].get("results", [])
    return []


def _fmt(rows: list[dict], headers: list[tuple[str, str]]) -> str:
    """(칸이름, 보일이름) 목록으로 표를 그립니다. 값이 없으면 «—»."""
    if not rows:
        return "  (자료 없음)"
    w = [max(len(lbl), *(len(str(r.get(k) if r.get(k) is not None else "—")) for r in rows))
         for k, lbl in headers]
    out = ["  " + "  ".join(lbl.rjust(w[i]) for i, (_, lbl) in enumerate(headers)),
           "  " + "  ".join("-" * x for x in w)]
    for r in rows:
        out.append("  " + "  ".join(
            str(r.get(k) if r.get(k) is not None else "—").rjust(w[i])
            for i, (k, _) in enumerate(headers)))
    return "\n".join(out)


def _since(days: int) -> str:
    """창의 시작 — 칸이 생긴 날보다 앞으로는 못 갑니다 / clamp to when the columns appeared."""
    return (f"MAX((strftime('%s','now')-{days}*86400)*1000, "
            f"(strftime('%s','{COLS_ADDED_KST}')-9*3600)*1000)")


def rtt_bands(days: int) -> str:
    rows = _run(f"""
        SELECT CASE WHEN avg_rtt<120 THEN 'a. <120ms'
                    WHEN avg_rtt<200 THEN 'b. 120-200'
                    WHEN avg_rtt<300 THEN 'c. 200-300'
                    WHEN avg_rtt<450 THEN 'd. 300-450'
                    ELSE 'e. 450ms+' END AS band,
               COUNT(*) AS mins,
               ROUND(AVG(NULLIF(rx_conceal,-1)),2) AS snd_gap,
               ROUND(1.0*SUM(rx_freeze)/COUNT(*),1) AS freeze_min,
               ROUND(AVG(NULLIF(rx_loss,-1)),2)  AS rx_vloss,
               ROUND(AVG(NULLIF(avg_loss,-1)),2) AS tx_loss,
               SUM(CASE WHEN aao>0 THEN 1 ELSE 0 END) AS aao_min
        FROM vc_quality WHERE ts >= {_since(days)}
        GROUP BY 1 ORDER BY 1""")
    return _fmt(rows, [("band", "RTT 구간"), ("mins", "분"), ("snd_gap", "소리끊김%"),
                       ("freeze_min", "멈춤/분"), ("rx_vloss", "받는손실%"),
                       ("tx_loss", "보내는손실%"), ("aao_min", "음성전용분")])


def worst_people(days: int) -> str:
    rows = _run(f"""
        SELECT name, role, COUNT(*) AS mins,
               ROUND(AVG(avg_rtt),0) AS rtt, ROUND(MAX(avg_rtt),0) AS rtt_max,
               ROUND(AVG(NULLIF(rx_conceal,-1)),2) AS snd_gap,
               ROUND(1.0*SUM(rx_freeze)/COUNT(*),1) AS freeze_min,
               SUM(CASE WHEN aao>0 THEN 1 ELSE 0 END) AS aao_min,
               SUM(CASE WHEN path='relay' THEN 1 ELSE 0 END) AS relay_min
        FROM vc_quality WHERE ts >= {_since(days)}
        GROUP BY name, role HAVING mins >= 5
        ORDER BY snd_gap DESC NULLS LAST LIMIT 15""")
    return _fmt(rows, [("name", "사람"), ("role", "역할"), ("mins", "분"),
                       ("rtt", "RTT"), ("rtt_max", "RTT최대"), ("snd_gap", "소리끊김%"),
                       ("freeze_min", "멈춤/분"), ("aao_min", "음성전용분"),
                       ("relay_min", "중계분")])


def turn_paths(days: int) -> str:
    rows = _run(f"""
        SELECT COALESCE(NULLIF(turn,''),'(직접 또는 미기록)') AS turn_server,
               COUNT(*) AS mins, COUNT(DISTINCT name) AS ppl,
               ROUND(AVG(avg_rtt),0) AS rtt,
               ROUND(AVG(NULLIF(rx_conceal,-1)),2) AS snd_gap
        FROM vc_quality WHERE ts >= {_since(days)}
        GROUP BY 1 ORDER BY mins DESC""")
    return _fmt(rows, [("turn_server", "경로 / TURN 서버"), ("mins", "분"), ("ppl", "명"),
                       ("rtt", "RTT"), ("snd_gap", "소리끊김%")])


def render(days: int, who: bool) -> str:
    out = [
        "=" * 96,
        f"  📶 화상수업 끊김 실측 — 최근 {days}일 (운영 D1 vc_quality, 읽기 전용)",
        "=" * 96,
        f"\n⚠️ rx_freeze·rx_conceal 칸은 {COLS_ADDED_KST} 에 생겼습니다. 그 전 기간은",
        "   «안 끊겼다» 가 아니라 «안 재고 있었다» 입니다 — 창을 그날로 자릅니다.\n",
        "▸ RTT 구간별 — 지연이 늘면 무엇이 나빠지나",
        rtt_bands(days),
        "\n  · 소리끊김% = 브라우저가 «끊겨서 메꾼» 오디오 비율. 2~3% 넘으면 귀에 들립니다",
        "  · 멈춤/분   = 받는 영상이 얼어붙은 횟수",
        "\n▸ 경로 / TURN 서버",
        turn_paths(days),
        "\n  · 무료 공개 TURN(openrelay 등)이 보이면 🔴 — 유료 TURN 발급이 실패한 것입니다",
        "    확인: curl -sI https://mangoi.ai/api/turn-config | grep -i '^x-turn-'",
    ]
    if who:
        out += ["\n▸ 사람별 (5분 이상, 소리끊김 나쁜 순)", worst_people(days)]
    out += ["\n" + "=" * 96]
    return "\n".join(out)
