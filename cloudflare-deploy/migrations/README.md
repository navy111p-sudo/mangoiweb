# migrations/ — D1 스키마 변경 규율 (2026-08-11 신설)

> 진단서 **문제 E** 대응의 첫 단계. 코드가 요청 처리 도중 표를 만드는 방식(`CREATE TABLE IF NOT EXISTS` 321개·`ALTER TABLE ADD COLUMN` 96개, 178개 표)을 **점진적으로** 걷어내기 위한 토대입니다.
>
> ⚠️ **이 폴더는 배포 시 자동 적용되지 않습니다.** `wrangler.toml`의 `[[migrations]]`는 Durable Object 전용이고, D1 `migrations_dir` 설정도 deploy.ps1의 자동 실행도 없습니다(2026-08-11 확인). 아래 명령을 **사람이 직접** 실행해야 반영됩니다.

---

## 0. 지금 무엇이 문제인가

- **스키마 정본은 [`../schema-live.sql`](../schema-live.sql)** (운영 `mango-db`의 실제 모양, 549줄·186 테이블). 이게 "진짜"입니다.
- 그런데 표는 **코드가 실행 중에** 만듭니다. `IF NOT EXISTS`라 **먼저 실행된 CREATE가 이깁니다** → 같은 표를 여러 파일이 각자, **다른 컬럼 구성으로** 만듭니다. 이게 조용한 데이터 사고의 뿌리입니다.

### 드리프트 위험이 높은 표 (코드 내 CREATE 발생 횟수 상위)

| 횟수 | 테이블 | 비고 |
|---|---|---|
| 17 | `students_erp` | 운영 실제 43컬럼인데 코드엔 3~23컬럼짜리 변형들 |
| 12 | `class_schedules` | |
| **9** | **`student_payments`** | 💰 결제 — 우선 정리 대상 |
| 8 | `attendance` | |
| 7 | `student_points` | 💰 포인트 |
| 7 | `student_evaluations` | |
| 5 | `push_subscriptions`, `push_queue`, `community_posts`, `voice_diary` | |
| 4 | `class_no_show`, `teacher_profiles`, `enrollments`, `chat_messages`, `digest_logs` | |

→ **돈 관련 표(`student_payments`·`student_points`)부터** 하나로 통일하는 것을 권합니다.

---

## 1. 앞으로의 규칙 (go-forward)

새 표·컬럼 변경이 생기면 **코드에 `CREATE TABLE`을 넣지 말고** 여기에 번호로 남깁니다.

```
migrations/
  0001_<간단설명>.sql
  0002_<간단설명>.sql
  ...
```

- 파일명: **4자리 번호 + 짧은 설명** (예: `0001_student_payments_add_refund_at.sql`).
- 각 파일 맨 위에 **왜/언제/누가**를 주석으로 남깁니다(기존 `migration-*.sql` 스타일 유지).
- 번호는 **한 번 쓰면 재사용 금지**(순서가 곧 적용 이력).

### 적용 방법 (사람이 직접, 신중히)

```powershell
cd cloudflare-deploy
# 1) 먼저 개발/스테이징에서. mango-db는 개발·운영 공용이므로 되돌릴 수 없는 변경은 사전 공지.
npx wrangler d1 execute mango-db --file migrations/0001_xxx.sql --local   # 로컬 먼저
npx wrangler d1 execute mango-db --file migrations/0001_xxx.sql            # 운영 (신중!)
```

⚠️ **DELETE/UPDATE/DROP은 테스트 목적으로 실행 금지**(CLAUDE.md). 마이그레이션은 원칙적으로 **추가만**(ADD COLUMN, CREATE TABLE). 파괴적 변경이 필요하면 사람에게 먼저 알립니다.

---

## 2. 코드 안 `CREATE TABLE` 걷어내기 (점진)

**한 번에 다 지우지 않습니다.** 위험합니다. 파일을 만질 일이 생길 때마다 하나씩:

1. 그 표의 **최종 컬럼 구성을 `schema-live.sql`에서 확인**(정본).
2. 필요하면 `migrations/000N_*.sql`로 부족한 컬럼을 보강.
3. 해당 코드의 `CREATE TABLE IF NOT EXISTS ...` / `ALTER TABLE ADD COLUMN ...` 줄을 **삭제**.
4. `tsc --noEmit` + `node test-harness/run.mjs --fast`로 검증(특히 `schema_drift_harness`).

> 요청 처리 경로에서 매번 나가던 `CREATE TABLE` 명령이 사라지면 **응답이 빨라지고 D1 비용도 줍니다**(필리핀 저속 회선에서 체감).

---

## 3. 기존 흩어진 마이그레이션 (과거 이력 — 이동하지 않음)

아래는 이미 손으로 적용된 과거 마이그레이션입니다. `cloudflare-deploy/` 루트에 흩어져 있고 **일부는 deploy.ps1이 경로로 참조**하므로 **여기로 옮기지 않습니다**(참조 깨짐 방지). 기록용 색인:

| 파일 | 내용 |
|---|---|
| `migration-points-system.sql` | 포인트+기프티콘 교환 시스템 (Phase P1, 2026-05) |
| `migration-point-rules-cleanup-2026-07-30.sql` | 포인트 규칙 7종 정리 |
| `migration-attendance-checkin.sql` | attendance `attended_at`(실제 입장시각) |
| `migration-attendance-fields.sql` | attendance 대시보드 집계 컬럼 |
| `migration-gaze-score.sql` | attendance 시선 점수 컬럼 |
| `migration-churn-graph.sql` | 이탈위험 행동사슬 그래프 테이블 |
| `migration-org-graph.sql` | 조직 그래프(본사→지사→대리점) 정산 |
| `migration-teacher-unavailability.sql` | 강사 근무/휴식시간 관리 |
| `migration-teacher-kang.sql` | 중국어 강사 계정 생성 |

> 앞으로 새로 만드는 것만 이 `migrations/` 폴더에 번호로 넣으면, 시간이 지나며 자연히 정본 이력이 여기로 모입니다.

---

*작성 2026-08-11. 관련: [`../schema-live.sql`](../schema-live.sql)(정본), [`../../docs/`](../../docs/), 진단서 문제 E.*
