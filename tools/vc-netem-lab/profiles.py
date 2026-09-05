"""
profiles.py — 회선 프로파일 / link profiles.

⛔ 여기 숫자는 «지어낸 것이 아닙니다» — 운영 D1 `vc_quality` 실측입니다.
   2026-09-05 조회, 창은 2026-09-01 ~ 09-04 (그 칸들이 9/1 에 생겨서 그 전에는 없습니다).
   표본 725분 · 27명 · 35개 방.

⛔ These are NOT invented — measured from production D1 `vc_quality`
   (queried 2026-09-05; window 2026-09-01..09-04, since those columns were added 9/1).


📊 잰 것 — RTT 구간별 (725분)
────────────────────────────────────────────────────────────────────────
  WebRTC RTT     분    소리끊김%   영상멈춤/분   받는영상손실%  보내는손실%  음성전용분
  < 120 ms      157      2.37         1.8          0.17         0.40        0
  120–200       337      5.46         3.3          0.66         0.61        3
  200–300       117      9.55         5.0          1.02         1.04       13
  300–450        80      7.82         3.8          0.87         1.33        5
  450 ms +       34     33.01         7.9          7.57         3.26       12   ← 절벽

  · 「소리끊김%」 = `rx_conceal` = 브라우저가 «끊겨서 메꾼» 오디오 표본 비율.
    2~3% 를 넘으면 사람 귀에 들립니다. 33% 는 «말이 안 통하는» 수준입니다.
  · 「영상멈춤/분」 = `rx_freeze` = 받는 영상이 얼어붙은 횟수(60초 창의 증가분).

🔴 읽어야 할 것: **손실이 아니라 지연(RTT)이 지배합니다.**
   보내는 손실은 450ms 구간에서도 3.3% 뿐인데 소리끊김은 33% 입니다.
   즉 「회선이 지저분하다」가 아니라 **「경로가 멀어 제때 못 온다」** 가 원인입니다.
🔴 Read this as: LATENCY dominates, not loss. Even in the worst band, send-side loss is
   only 3.3% while audio conceal is 33% — packets arrive too late, not too broken.

⚠️ 대역폭(kbps)은 **재지 않았습니다** — `vc_quality` 에 그 칸이 없습니다.
   그래서 아래 프로파일에 대역폭 제한을 넣지 않았습니다. 넣고 싶으면 `--rate` 로
   직접 주되, «필리핀은 이 정도일 것» 이라고 지어내지 마세요.
⚠️ Bandwidth was NOT measured. Pass --rate explicitly; don't invent a number.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Profile:
    key: str
    label: str
    rtt_ms: int          # WebRTC 왕복 시간 / round-trip (what the app measures)
    jitter_ms: int       # 지연 흔들림 / delay variation
    loss_pct: float      # 편도 패킷 손실 / one-way packet loss
    note: str

    @property
    def delay_ms(self) -> int:
        """netem 은 «편도» 지연을 겁니다 — RTT 의 절반 / netem shapes ONE WAY: RTT/2.

        ⚠️ 이걸 헷갈리면 지연이 두 배가 됩니다. 이 프로그램은 한쪽 기기에만 걸므로
           걸린 지연이 왕복에 «한 번» 더해집니다 — 그래서 RTT/2 가 맞습니다.
        ⚠️ Get this wrong and you double the latency. We shape one machine, so the
           applied one-way delay adds once to the round trip: RTT/2 is correct.
        """
        return max(0, round(self.rtt_ms / 2))


#: 실측 구간을 그대로 옮긴 프로파일 / profiles mirroring the measured bands
PROFILES: dict[str, Profile] = {p.key: p for p in (
    Profile("clean", "깨끗함 (RTT<120)", 100, 10, 0.2,
            "157분. 소리끊김 2.4% · 멈춤 1.8회/분. 여기서는 수업이 잘 됩니다"),
    Profile("typical", "보통 (RTT 120–200)", 170, 25, 0.65,
            "337분 = 가장 흔한 상태. 소리끊김 5.5% · 멈춤 3.3회/분"),
    Profile("strained", "빠듯함 (RTT 200–300)", 250, 40, 1.0,
            "117분. 소리끊김 9.6% · 멈춤 5.0회/분. 음성전용(AAO)이 13분 켜졌습니다"),
    Profile("poor", "나쁨 (RTT 300–450)", 380, 60, 1.3,
            "80분. 소리끊김 7.8% · 멈춤 3.8회/분"),
    Profile("cliff", "절벽 (RTT 450+)", 500, 90, 7.6,
            "34분. 소리끊김 33% · 멈춤 7.9회/분. ⚠️ 여기가 «수업이 무너지는» 구간"),
    # 실제 사람 — 이름을 적는 이유: 재현 대상이 «가상의 나쁜 회선» 이 아니라
    # 지금 실제로 이 상태에서 수업하는 강사이기 때문입니다.
    Profile("farrah", "실제 최악 (Teacher - Farrah)", 494, 150, 3.3,
            "29분 · RTT 평균 494 최대 1091 · 소리끊김 27.8% · 멈춤 7.9회/분 · "
            "29분 중 8분이 음성전용. 이 강사의 수업은 사실상 성립하지 않습니다"),
)}

#: 아무것도 안 거는 기준선 / the control: shape nothing
BASELINE = Profile("none", "열화 없음 (기준선)", 0, 0, 0.0,
                   "비교 기준. 이걸 먼저 재지 않으면 «원래 그런 것» 과 구분할 수 없습니다")


def get(key: str) -> Profile:
    if key == BASELINE.key:
        return BASELINE
    if key not in PROFILES:
        raise SystemExit(
            f"\n[프로파일 이름 오류] '{key}'\n"
            f"  쓸 수 있는 값: {BASELINE.key}, {', '.join(PROFILES)}\n")
    return PROFILES[key]


def table() -> str:
    rows = [f"  {'이름':<10} {'라벨':<26} {'RTT':>6} {'지터':>6} {'손실':>7}   설명",
            "  " + "-" * 104]
    for p in (BASELINE, *PROFILES.values()):
        rows.append(f"  {p.key:<10} {p.label:<26} {p.rtt_ms:>4}ms {p.jitter_ms:>4}ms "
                    f"{p.loss_pct:>6.1f}%   {p.note}")
    return "\n".join(rows)
