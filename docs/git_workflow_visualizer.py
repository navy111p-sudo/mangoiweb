"""Git 워크플로 시각화 프로그램 (Tkinter GUI)

워킹 디렉토리(책상) → 스테이징 에어리어(봉투) → 로컬 레포지토리(책장) → 원격 레포지토리(인터넷)
이 4단계를 버튼으로 직접 눌러보며 눈으로 확인할 수 있는 학습용 프로그램입니다.

실행 방법:
    1. 파이썬 3.x가 설치되어 있어야 합니다. (Tkinter는 기본 내장)
    2. 터미널을 열고 이 폴더로 이동합니다.
    3. `python git_workflow_visualizer.py` 명령으로 실행합니다.
    4. 화면에 뜬 버튼을 위에서 아래로 차례차례 눌러보세요.
"""

import tkinter as tk
from tkinter import messagebox


# 4단계의 상태를 표현하기 위한 색상 팔레트입니다.
# INACTIVE: 아직 파일이 도착하지 않은 상태 (회색)
# ACTIVE  : 현재 파일이 머물고 있는 단계 (밝은 초록)
COLOR_INACTIVE_BG = "#E5E7EB"
COLOR_INACTIVE_FG = "#6B7280"
COLOR_ACTIVE_BG = "#34D399"
COLOR_ACTIVE_FG = "#064E3B"
COLOR_HEADER_BG = "#1F2937"
COLOR_HEADER_FG = "#F9FAFB"


class GitWorkflowVisualizer:
    """Git의 4단계를 시각적으로 보여주는 간단한 데모 앱."""

    # 단계별 ID와 표시 문구를 한 곳에 모아둡니다.
    STAGES = [
        ("working", "1. 내 책상 위\n(Working Directory)\nmain.py 작성/수정"),
        ("staging", "2. 서류 봉투 안\n(Staging Area)\ngit add 로 후보 등록"),
        ("local", "3. 내 방 책장\n(Local Repository)\ngit commit 으로 버전 저장"),
        ("remote", "4. 인터넷 도서관\n(Remote / GitHub)\ngit push 로 업로드"),
    ]

    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Git 워크플로 시각화 — 망고이 학습용")
        self.root.geometry("720x560")
        self.root.configure(bg="#F3F4F6")

        # 현재 파일이 어느 단계에 있는지 추적합니다.
        # -1 = 아직 파일이 만들어지지 않음, 0~3 = STAGES 인덱스
        self.current_stage_index = -1

        # 각 단계의 라벨 위젯을 보관해 두었다가 색을 바꿀 때 재사용합니다.
        self.stage_labels: dict[str, tk.Label] = {}

        self._build_header()
        self._build_stage_panels()
        self._build_action_buttons()
        self._build_status_bar()

        # 처음에는 모든 단계를 회색(비활성) 상태로 표시합니다.
        self._refresh_stage_colors()

    # ------------------------------------------------------------------
    # UI 구성 메서드들
    # ------------------------------------------------------------------
    def _build_header(self) -> None:
        """화면 맨 위에 제목 영역을 그립니다."""
        header = tk.Label(
            self.root,
            text="📦 Git 4단계 따라가기 — main.py 파일의 여행",
            font=("Helvetica", 16, "bold"),
            bg=COLOR_HEADER_BG,
            fg=COLOR_HEADER_FG,
            pady=12,
        )
        header.pack(fill=tk.X)

    def _build_stage_panels(self) -> None:
        """4개의 단계를 가로로 나란히 배치합니다."""
        container = tk.Frame(self.root, bg="#F3F4F6")
        container.pack(fill=tk.X, padx=16, pady=16)

        for index, (stage_id, text) in enumerate(self.STAGES):
            label = tk.Label(
                container,
                text=text,
                width=18,
                height=6,
                font=("Helvetica", 10, "bold"),
                relief=tk.RIDGE,
                borderwidth=2,
                justify=tk.CENTER,
                wraplength=160,
            )
            label.grid(row=0, column=index * 2, padx=4, pady=4, sticky="nsew")
            self.stage_labels[stage_id] = label

            # 마지막 단계가 아니라면 다음 단계로 향하는 화살표를 그려줍니다.
            if index < len(self.STAGES) - 1:
                arrow = tk.Label(
                    container,
                    text="▶",
                    font=("Helvetica", 18, "bold"),
                    bg="#F3F4F6",
                    fg="#9CA3AF",
                )
                arrow.grid(row=0, column=index * 2 + 1, padx=2)

    def _build_action_buttons(self) -> None:
        """네 개의 동작 버튼(파일 수정/Add/Commit/Push)을 만듭니다."""
        button_frame = tk.Frame(self.root, bg="#F3F4F6")
        button_frame.pack(pady=12)

        actions = [
            ("📝 파일 수정", self.action_edit_file),
            ("📥 Add 하기", self.action_git_add),
            ("💾 Commit 하기", self.action_git_commit),
            ("🚀 Push 하기", self.action_git_push),
        ]

        for text, command in actions:
            btn = tk.Button(
                button_frame,
                text=text,
                command=command,
                width=14,
                height=2,
                font=("Helvetica", 11, "bold"),
                bg="#3B82F6",
                fg="white",
                activebackground="#2563EB",
                activeforeground="white",
                relief=tk.FLAT,
                cursor="hand2",
            )
            btn.pack(side=tk.LEFT, padx=6)

        # 초기화 버튼은 살짝 떨어진 곳에 별도로 두어 실수로 누르지 않도록 합니다.
        reset_btn = tk.Button(
            self.root,
            text="🔄 처음부터 다시 시작",
            command=self.reset,
            font=("Helvetica", 10),
            bg="#E5E7EB",
            fg="#374151",
            relief=tk.FLAT,
            cursor="hand2",
        )
        reset_btn.pack(pady=4)

    def _build_status_bar(self) -> None:
        """화면 하단에 현재 상태를 한 줄로 안내하는 영역을 만듭니다."""
        self.status_var = tk.StringVar(
            value="👉 먼저 '파일 수정' 버튼을 눌러 main.py 파일을 만들어 보세요."
        )
        status = tk.Label(
            self.root,
            textvariable=self.status_var,
            font=("Helvetica", 11),
            bg="#FEF3C7",
            fg="#92400E",
            anchor="w",
            padx=12,
            pady=10,
        )
        status.pack(fill=tk.X, side=tk.BOTTOM)

    # ------------------------------------------------------------------
    # 버튼 동작 메서드들
    # ------------------------------------------------------------------
    def action_edit_file(self) -> None:
        """1단계: 워킹 디렉토리에 파일을 만들거나 수정합니다."""
        self.current_stage_index = 0
        self.status_var.set(
            "✏️ main.py 파일을 작성했습니다. (Working Directory) — 다음은 'Add 하기'!"
        )
        self._refresh_stage_colors()

    def action_git_add(self) -> None:
        """2단계: 스테이징 에어리어(봉투)로 파일을 옮깁니다."""
        if self.current_stage_index < 0:
            self._warn("아직 파일이 없어요!", "먼저 '파일 수정' 버튼을 눌러 주세요.")
            return
        self.current_stage_index = 1
        self.status_var.set(
            "📥 git add main.py — 파일을 봉투(Staging Area)에 담았어요. 다음은 'Commit 하기'!"
        )
        self._refresh_stage_colors()

    def action_git_commit(self) -> None:
        """3단계: 로컬 레포지토리(책장)에 버전을 저장합니다."""
        if self.current_stage_index < 1:
            self._warn("순서가 달라요!", "Commit 전에 먼저 'Add 하기'를 눌러 주세요.")
            return
        self.current_stage_index = 2
        self.status_var.set(
            "💾 git commit -m \"첫 번째 메인 화면 코드 완성\" — 내 책장에 저장 완료! 다음은 'Push 하기'!"
        )
        self._refresh_stage_colors()

    def action_git_push(self) -> None:
        """4단계: 원격 레포지토리(인터넷)에 업로드합니다."""
        if self.current_stage_index < 2:
            self._warn("순서가 달라요!", "Push 전에 먼저 'Commit 하기'를 눌러 주세요.")
            return
        self.current_stage_index = 3
        self.status_var.set(
            "🚀 git push origin main — 인터넷 도서관(GitHub)까지 안전하게 도착했어요! 🎉"
        )
        self._refresh_stage_colors()

    def reset(self) -> None:
        """모든 단계를 초기화하여 처음 상태로 되돌립니다."""
        self.current_stage_index = -1
        self.status_var.set(
            "👉 먼저 '파일 수정' 버튼을 눌러 main.py 파일을 만들어 보세요."
        )
        self._refresh_stage_colors()

    # ------------------------------------------------------------------
    # 헬퍼 메서드
    # ------------------------------------------------------------------
    def _refresh_stage_colors(self) -> None:
        """현재 단계까지의 칸은 초록색, 그 뒤는 회색으로 칠합니다."""
        for index, (stage_id, _text) in enumerate(self.STAGES):
            label = self.stage_labels[stage_id]
            if index <= self.current_stage_index:
                label.configure(bg=COLOR_ACTIVE_BG, fg=COLOR_ACTIVE_FG)
            else:
                label.configure(bg=COLOR_INACTIVE_BG, fg=COLOR_INACTIVE_FG)

    def _warn(self, title: str, message: str) -> None:
        """순서를 어기고 버튼을 눌렀을 때 안내 메시지박스를 띄웁니다."""
        messagebox.showinfo(title, message)


def main() -> None:
    root = tk.Tk()
    GitWorkflowVisualizer(root)
    root.mainloop()


if __name__ == "__main__":
    main()
