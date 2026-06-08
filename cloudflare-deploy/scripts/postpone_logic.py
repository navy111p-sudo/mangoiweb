"""
mangoi - 수업 연기 / 뒤로 밀기 백엔드 로직
============================================

데이터 모델 가정 (D1 / SQL):
    lessons(
        id INTEGER PRIMARY KEY,
        student_uid TEXT,
        teacher_id TEXT,
        lesson_date TEXT,          -- ISO 'YYYY-MM-DD'
        lesson_hour INTEGER,       -- 0~23
        duration_min INTEGER,      -- 20 / 40 / 60
        status TEXT,               -- 'scheduled' | 'completed' | 'postponed' | 'cancelled'
        type TEXT,                 -- '1on1' | 'group' | 'temp' | 'blocked'
        notes TEXT,
        updated_at TEXT
    )

사용 예 (Cloudflare Workers 에서 호출하기 위한 동등 TypeScript 로직과 같음):

    from postpone_logic import (
        shift_future_lessons,
        can_postpone_now,
        can_change_now,
        find_available_teachers,
        list_open_slots_for_teacher,
    )

핵심 안전 장치
--------------
1. lesson_date 기준 ASC 정렬 후 *뒤에서 앞으로* (역순) 업데이트
   → 중복 키 충돌 방지 (UNIQUE(student_uid, lesson_date, lesson_hour) 가정).
2. 트랜잭션 사용 (sqlite3 BEGIN/COMMIT). 실패 시 ROLLBACK.
3. lesson_date 와 lesson_hour 둘 다 검증 (포맷 + 범위).
4. shift_days <= 0 이면 즉시 거부.
"""

from __future__ import annotations
import sqlite3
import re
from datetime import datetime, timedelta
from typing import Iterable

ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


# ─── 시간 제한 (수업 시작 기준) ─────────────────────────────────────
POSTPONE_MIN_AHEAD = 30          # 분 — 연기 가능 최소 여유
CHANGE_MIN_AHEAD   = 24 * 60     # 분 — 변경 가능 최소 여유 (24시간)


def _to_dt(date_str: str, hour: int) -> datetime:
    if not ISO_DATE_RE.match(date_str):
        raise ValueError(f"Invalid date format: {date_str!r}")
    if not (0 <= hour <= 23):
        raise ValueError(f"Invalid hour: {hour!r}")
    return datetime.strptime(date_str, "%Y-%m-%d").replace(hour=hour)


def minutes_until(lesson_date: str, lesson_hour: int, now: datetime | None = None) -> int:
    """수업 시작까지 남은 분. 이미 시작/종료된 경우 음수."""
    now = now or datetime.now()
    return int((_to_dt(lesson_date, lesson_hour) - now).total_seconds() // 60)


def can_postpone_now(lesson_date: str, lesson_hour: int, now: datetime | None = None) -> bool:
    return minutes_until(lesson_date, lesson_hour, now) >= POSTPONE_MIN_AHEAD


def can_change_now(lesson_date: str, lesson_hour: int, now: datetime | None = None) -> bool:
    return minutes_until(lesson_date, lesson_hour, now) >= CHANGE_MIN_AHEAD


# ─── 뒤로 밀기 (핵심) ───────────────────────────────────────────────
def shift_future_lessons(
    conn: sqlite3.Connection,
    student_uid: str,
    from_lesson_id: int,
    shift_days: int = 7,
    *,
    dry_run: bool = False,
) -> list[dict]:
    """
    학생 `student_uid` 의 `from_lesson_id` 번 수업과 그 이후 *모든* 향후 수업의
    lesson_date 를 `shift_days` 일 만큼 뒤로 이동시킨다.

    안전 처리:
      1. lesson_date ASC 정렬 후 *역순*으로 UPDATE — UNIQUE 충돌 방지.
      2. 트랜잭션 (BEGIN/COMMIT). 예외 시 자동 ROLLBACK.
      3. shift_days <= 0 이면 ValueError.
      4. dry_run=True 면 SQL 실행 없이 영향 받을 행만 반환 (미리보기).

    Returns:
        [{ "id": .., "old_date": "YYYY-MM-DD", "new_date": "YYYY-MM-DD",
           "lesson_hour": int, "teacher_id": str }, ...]
    """
    if shift_days <= 0:
        raise ValueError("shift_days must be positive")

    cur = conn.cursor()

    # 기준 수업의 날짜를 잡기
    cur.execute(
        "SELECT lesson_date FROM lessons WHERE id = ? AND student_uid = ?",
        (from_lesson_id, student_uid),
    )
    row = cur.fetchone()
    if not row:
        raise LookupError(f"lesson id={from_lesson_id} not found for student {student_uid}")
    anchor_date = row[0]

    # 기준 수업을 포함, 그 이후의 모든 향후 수업 (날짜 ASC)
    cur.execute(
        """
        SELECT id, lesson_date, lesson_hour, teacher_id
          FROM lessons
         WHERE student_uid = ?
           AND status IN ('scheduled', 'postponed')
           AND lesson_date >= ?
         ORDER BY lesson_date ASC, lesson_hour ASC
        """,
        (student_uid, anchor_date),
    )
    rows = cur.fetchall()

    affected = []
    for r in rows:
        lid, old_date, hour, teacher = r
        new_date = (
            datetime.strptime(old_date, "%Y-%m-%d") + timedelta(days=shift_days)
        ).strftime("%Y-%m-%d")
        affected.append({
            "id": lid,
            "old_date": old_date,
            "new_date": new_date,
            "lesson_hour": hour,
            "teacher_id": teacher,
        })

    if dry_run:
        return affected

    # ⚠ 중요: 역순(가장 늦은 수업부터) 업데이트
    #         → 예) 5/15 → 5/22, 5/22 → 5/29 동시 발생 시 충돌 회피
    try:
        cur.execute("BEGIN")
        for item in reversed(affected):
            cur.execute(
                """
                UPDATE lessons
                   SET lesson_date = ?,
                       status      = 'postponed',
                       updated_at  = ?
                 WHERE id = ?
                """,
                (item["new_date"], datetime.now().isoformat(timespec="seconds"), item["id"]),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    return affected


# ─── 강사의 빈 시간 조회 ───────────────────────────────────────────
def list_open_slots_for_teacher(
    conn: sqlite3.Connection,
    teacher_id: str,
    date_from: str,
    date_to: str,
    *,
    hour_start: int = 9,
    hour_end: int = 22,
) -> list[dict]:
    """주어진 강사의 [date_from, date_to] 기간 가용 슬롯 (이미 점유된 시간 제외)."""
    if not (ISO_DATE_RE.match(date_from) and ISO_DATE_RE.match(date_to)):
        raise ValueError("date_from/date_to must be YYYY-MM-DD")

    cur = conn.cursor()
    cur.execute(
        """
        SELECT lesson_date, lesson_hour
          FROM lessons
         WHERE teacher_id = ?
           AND status IN ('scheduled', 'postponed')
           AND lesson_date BETWEEN ? AND ?
        """,
        (teacher_id, date_from, date_to),
    )
    busy = {(r[0], r[1]) for r in cur.fetchall()}

    out: list[dict] = []
    d0 = datetime.strptime(date_from, "%Y-%m-%d").date()
    d1 = datetime.strptime(date_to,   "%Y-%m-%d").date()
    day = d0
    while day <= d1:
        ds = day.strftime("%Y-%m-%d")
        for h in range(hour_start, hour_end + 1):
            if (ds, h) not in busy:
                out.append({"date": ds, "hour": h})
        day += timedelta(days=1)
    return out


# ─── 시간 매칭: 그 시간에 가능한 강사 찾기 ──────────────────────────
def find_available_teachers(
    conn: sqlite3.Connection,
    lesson_date: str,
    lesson_hour: int,
    exclude_teacher_id: str | None = None,
) -> list[dict]:
    """`lesson_date lesson_hour` 시간대에 비어있는 강사 목록 반환."""
    cur = conn.cursor()
    cur.execute("SELECT id, name, category FROM teachers WHERE active = 1")
    teachers = [{"id": r[0], "name": r[1], "category": r[2]} for r in cur.fetchall()]

    cur.execute(
        """
        SELECT teacher_id FROM lessons
         WHERE lesson_date = ? AND lesson_hour = ?
           AND status IN ('scheduled', 'postponed')
        """,
        (lesson_date, lesson_hour),
    )
    busy = {r[0] for r in cur.fetchall()}

    out = []
    for t in teachers:
        if t["id"] in busy:
            continue
        if exclude_teacher_id and t["id"] == exclude_teacher_id:
            continue
        out.append(t)
    return out


# ─── 데모 / 테스트 ────────────────────────────────────────────────
def _make_demo_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE teachers (id TEXT PRIMARY KEY, name TEXT, category TEXT, active INTEGER DEFAULT 1);
        CREATE TABLE lessons (
            id INTEGER PRIMARY KEY,
            student_uid TEXT,
            teacher_id TEXT,
            lesson_date TEXT,
            lesson_hour INTEGER,
            duration_min INTEGER DEFAULT 60,
            status TEXT DEFAULT 'scheduled',
            type TEXT DEFAULT '1on1',
            notes TEXT,
            updated_at TEXT,
            UNIQUE(student_uid, lesson_date, lesson_hour)
        );
        INSERT INTO teachers VALUES
            ('t01','박지윤','home', 1),
            ('t02','김민서','home', 1),
            ('t07','Maria Santos','native', 1);
        INSERT INTO lessons (id, student_uid, teacher_id, lesson_date, lesson_hour) VALUES
            (1, 'navy111p', 't01', '2026-05-14', 14),
            (2, 'navy111p', 't01', '2026-05-21', 14),
            (3, 'navy111p', 't01', '2026-05-28', 14),
            (4, 'navy111p', 't01', '2026-06-04', 14);
        """
    )
    conn.commit()
    return conn


if __name__ == "__main__":
    conn = _make_demo_db()

    print("=== 뒤로 밀기 미리보기 (dry_run) ===")
    preview = shift_future_lessons(conn, "navy111p", 1, shift_days=7, dry_run=True)
    for p in preview:
        print(f"  id={p['id']}: {p['old_date']} -> {p['new_date']}")

    print("\n=== 실제 적용 ===")
    applied = shift_future_lessons(conn, "navy111p", 1, shift_days=7)
    print(f"  {len(applied)} lessons shifted.")

    print("\n=== 결과 (lessons 테이블) ===")
    for r in conn.execute("SELECT id, lesson_date, lesson_hour, status FROM lessons ORDER BY lesson_date"):
        print("  ", r)

    print("\n=== 시간 제한 ===")
    print("  can_postpone (1분 후):", can_postpone_now(
        (datetime.now() + timedelta(minutes=1)).strftime("%Y-%m-%d"),
        (datetime.now() + timedelta(minutes=1)).hour,
    ))
    print("  can_change   (25h 후):", can_change_now(
        (datetime.now() + timedelta(hours=25)).strftime("%Y-%m-%d"),
        (datetime.now() + timedelta(hours=25)).hour,
    ))
