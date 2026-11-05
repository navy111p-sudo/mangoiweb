/** briefing: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { json } from './api-util';
import { activeBinds, activeCountSql, overdueSql, absentSql, ATTENDED_ON_DATE_SQL, briefingSanity, KPI_DEF_VERSION, OVERDUE_GRACE_DAYS, ABSENT_DAYS } from './kpi-active';

export async function handleAdminBriefingApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

    // ═══════════════════════════════════════════════════════════════
    // 👁 Phase GM 끝 (GM-1, GM-2 인프라 + API)
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 🌅 Phase DB — 매일 아침 자동 일일 브리핑 (Daily Briefing)
    // ═══════════════════════════════════════════════════════════════
    if ((method === 'POST' && path === '/api/admin/briefing/generate') || (method === 'GET' && path === '/api/admin/briefing/latest')) {
      try {
        // GET latest — 최근 N개 또는 단건
        //   ⚡ (2026-08-08) 조회 경로에서 CREATE TABLE 을 걷어냈다. 읽을 때마다 DDL 왕복을 한 번 더 하고 있었고,
        //      표가 없으면 아래 SELECT 가 알아서 실패하므로 빈 목록으로 돌려주면 된다.
        if (method === 'GET' && path === '/api/admin/briefing/latest') {
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '1'), 30);
          let rs: any = { results: [] };
          try {
            rs = await env.DB.prepare(`SELECT id, briefing_date, briefing_text, stats, created_at FROM daily_briefings ORDER BY created_at DESC LIMIT ?`).bind(limit).all();
          } catch { /* 표가 아직 없음 → 빈 목록 */ }
          const items = (rs.results || []).map((r: any) => { let st = null; try { st = r.stats ? JSON.parse(r.stats) : null; } catch {} return { ...r, stats: st }; });
          return json({ ok: true, items });
        }

        await env.DB.exec(`CREATE TABLE IF NOT EXISTS daily_briefings (id INTEGER PRIMARY KEY AUTOINCREMENT, briefing_date TEXT NOT NULL, briefing_text TEXT NOT NULL, stats TEXT, created_at INTEGER NOT NULL);`);

        // POST generate — 어제 데이터 집계 + AI 작문
        //
        // 🕒 (2026-08-08 수정) 날짜가 이틀 밀리던 것 —
        //   cron 은 "0 18 * * *"(UTC) = KST 03:00 에 돈다. 그런데 여기서 `now - 24h` 를 UTC 로 잘라 쓰니,
        //   KST 8일 새벽에 돌면 UTC 로는 아직 7일 18시 → 하루 빼면 6일 → "어제"가 그저께가 됐다.
        //   (화면에 오늘이 08-08 인데 브리핑 날짜가 08-06 으로 찍히던 원인)
        //   → KST(UTC+9) 로 옮겨 놓고 날짜를 자른 뒤, 집계 구간도 KST 하루로 잡는다.
        const KST = 9 * 3600000;
        const now = Date.now();
        const kstNow = now + KST;
        const kstTodayStr = new Date(kstNow).toISOString().slice(0, 10);
        const yesterdayStr = new Date(kstNow - 86400000).toISOString().slice(0, 10);
        // KST 하루의 시작/끝을 UTC 타임스탬프로 (KST 00:00 = 그 날짜의 UTC 00:00 − 9h)
        const todayStartTs = new Date(yesterdayStr + 'T00:00:00.000Z').getTime() - KST;
        const todayEndTs = todayStartTs + 86400000;

        // 🔁 같은 날짜 브리핑이 이미 있으면 그대로 돌려준다 (force=1 이면 새로 만든다).
        //   지금까지 「지금 생성」을 누를 때마다 Llama 70B 를 호출하고 D1 에 행을 새로 쌓았다.
        //   자동 cron 이 하루 두 번 불려도 중복 생성되지 않게 하는 안전장치이기도 하다.
        const force = url.searchParams.get('force') === '1';
        if (!force) {
          try {
            const dup: any = await env.DB.prepare(
              `SELECT briefing_date, briefing_text, stats FROM daily_briefings WHERE briefing_date = ? ORDER BY created_at DESC LIMIT 1`
            ).bind(yesterdayStr).first();
            let st: any = null; try { st = dup && dup.stats ? JSON.parse(dup.stats) : null; } catch {}
            // 📊 (2026-10-13) 옛 정의(명부 전체 분모)로 만든 브리핑은 다시 만든다 — 하루 한 번만 일어난다.
            if (dup && st && st.def === KPI_DEF_VERSION) {
              return json({ ok: true, cached: true, briefing_text: dup.briefing_text, stats: st, briefing_date: dup.briefing_date });
            }
          } catch {}
        }

        // 1) 신규 등록 (students_erp.created_at 가 있을 경우)
        let newEnroll = 0;
        try {
          const r: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM students_erp WHERE created_at >= ? AND created_at < ?`).bind(todayStartTs, todayEndTs).first();
          newEnroll = r?.n || 0;
        } catch {}

        // 2) 신규 상담
        let newInquiry = 0;
        try {
          const r: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM inquiries WHERE created_at >= ? AND created_at < ?`).bind(todayStartTs, todayEndTs).first();
          newInquiry = r?.n || 0;
        } catch {}

        // 3)~5) 📊 (2026-10-13) 분모를 «활동 학생»(최근 30일 수업이 있는 학생)으로 바꿨다.
        //   예전엔 students_erp 명부 전체(28,825명)라 미납 28,771명·출석률 0%(123/28825)가 나왔고,
        //   AI 가 그 숫자를 사실처럼 «123명 중 28825명이 출석» 으로 읽었다. 정의는 src/kpi-active.ts 하나.
        const _ab = activeBinds(now);
        let activeStudents = 0, overdueCount = 0, overduePaidEver = 0, atRiskCount = 0, attendedYesterday = 0;
        let attendanceRate: number | null = null;
        try { const r: any = await env.DB.prepare(activeCountSql()).bind(..._ab).first(); activeStudents = r?.n || 0; } catch (e: any) { console.warn('[briefing] active', e?.message); }
        try {
          const r: any = await env.DB.prepare(overdueSql()).bind(..._ab, now - OVERDUE_GRACE_DAYS * 86400000).first();
          overdueCount = r?.overdue || 0; overduePaidEver = r?.paid_ever || 0;
        } catch (e: any) { console.warn('[briefing] overdue', e?.message); }
        try { const r: any = await env.DB.prepare(absentSql()).bind(..._ab, now - ABSENT_DAYS * 86400000, now).first(); atRiskCount = r?.n || 0; } catch (e: any) { console.warn('[briefing] absent', e?.message); }
        try {
          const r: any = await env.DB.prepare(ATTENDED_ON_DATE_SQL).bind(..._ab, yesterdayStr).first();
          attendedYesterday = r?.n || 0;
          if (activeStudents > 0) attendanceRate = Math.round((attendedYesterday / activeStudents) * 100);
        } catch (e: any) { console.warn('[briefing] attended', e?.message); }

        // 6) 최근 7일 평가 평균
        //   🔴 (2026-08-08 수정) 평가가 한 건도 없으면 AVG 가 NULL 인데 `|| 0` 으로 0 을 넣고 있었다.
        //      «0점» 과 «자료 없음» 은 완전히 다른 말인데, AI 가 이걸 «평균 0점으로 낮다» 고 보고했다.
        //      → 자료가 없으면 null 로 둔다. 아래 프롬프트·화면은 null 을 «자료 없음» 으로 다룬다.
        let recentEvalAvg: number | null = null;
        let recentEvalCount = 0;
        try {
          const r: any = await env.DB.prepare(
            `SELECT AVG(score_overall) AS a, COUNT(*) AS n FROM student_evaluations WHERE created_at >= ?`
          ).bind(now - 7 * 86400000).first();
          recentEvalCount = r?.n || 0;
          if (recentEvalCount > 0 && r?.a != null) recentEvalAvg = Math.round(r.a * 10) / 10;
        } catch {}

        const stats = {
          date: yesterdayStr,
          generated_for_kst: kstTodayStr,
          new_enrollment: newEnroll,
          new_inquiry: newInquiry,
          def: KPI_DEF_VERSION,                 // 이 정의가 아니면 같은 날짜 브리핑도 다시 만든다
          overdue_count: overdueCount,          // 미납 «학생 수» (KPI 대시보드와 같은 정의)
          overdue_paid_ever: overduePaidEver,   // 그 분모 — 결제 기록이 있는 활동 학생
          at_risk_count: atRiskCount,           // 활동 학생 중 최근 14일 수업 기록 없음
          attendance_rate: attendanceRate,      // null = 산출 불가
          attended_yesterday: attendedYesterday,
          active_students: activeStudents,
          recent_eval_avg: recentEvalAvg,       // null = 최근 7일 평가 없음
          recent_eval_count: recentEvalCount,
        };

        // AI 작문 — 친근한 한국어 5-7문장 브리핑
        //
        // 🔴 (2026-08-08) 여기가 가장 위험한 자리였다.
        //   위 집계에 «자료 없음» 이 섞여도 프롬프트는 그걸 숫자 0 으로 넘겼고, 지시문이
        //   «우려되는 부분은 부드럽게 짚어주세요» 였다. 그래서 AI 는 «평가 평균 0점으로 낮습니다»,
        //   «출석률 1%로 낮게 유지되고 있습니다» 같은 문장을 아주 차분하게 써 냈다.
        //   숫자가 틀린 줄 모르는 사람이 읽으면 학원이 무너지는 줄 안다.
        //   → 자료가 없는 항목은 아예 «자료 없음» 이라고 적어 보내고, 그 항목은 평가하지 말라고 못 박는다.
        const evalLine = (recentEvalAvg == null)
          ? `- 최근 7일 평가 평균: 자료 없음 (7일 내 작성된 평가서 0건)`
          : `- 최근 7일 평가 평균: ${recentEvalAvg}점 (${recentEvalCount}건)`;
        const attLine = (attendanceRate == null)
          ? `- 어제 출석률: 자료 없음`
          : `- 어제 수업 기록이 있는 학생: ${attendedYesterday}명 (활동 학생 ${activeStudents}명 중 ${attendanceRate}%)`;
        const sanity = briefingSanity({ active_students: activeStudents, overdue_count: overdueCount, at_risk_count: atRiskCount, attended_yesterday: attendedYesterday });
        let briefingText = '';
        try {
          // 숫자가 상식에 안 맞으면 AI 에 넘기지 않는다 — 틀린 숫자를 AI 가 차분한 문장으로 바꿔 «사실» 로 만든다.
          if (env.AI && sanity.length === 0) {
            const prompt = `다음은 어제(${yesterdayStr}, 한국시간) 망고아이 학원의 운영 데이터입니다.\n\n`
              + `- 신규 등록: ${newEnroll}명\n`
              + `- 신규 상담: ${newInquiry}건\n`
              + `- 활동 학생(최근 30일 수업이 있는 학생): ${activeStudents}명\n`
              + `- 미납 학생: ${overdueCount}명 (결제 기록이 있는 활동 학생 ${overduePaidEver}명 중 35일 넘게 결제 없음)\n`
              + `- 최근 14일 수업 기록이 없는 활동 학생: ${atRiskCount}명\n`
              + `${attLine}\n`
              + `${evalLine}\n\n`
              + `원장님께 드리는 아침 브리핑을 5-7문장으로 따뜻하고 명료한 한국어 존댓말로 작성해 주세요.\n`
              + `좋은 점은 칭찬하고, 우려되는 부분은 부드럽게 짚어주며 오늘 우선 챙겨야 할 액션 1-2개를 제안하세요.\n\n`
              + `[반드시 지킬 것]\n`
              + `1. 위에 적힌 숫자만 사용하세요. 없는 숫자를 지어내지 마세요.\n`
              + `2. "자료 없음"이라고 적힌 항목은 0이나 낮은 값으로 해석하지 마세요. 그 항목은 평가하지 말고, 필요하면 "아직 집계된 자료가 없습니다"라고만 적으세요.\n`
              + `3. 추측한 원인·전망을 사실처럼 단정하지 마세요.`;
            const ai: any = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
              messages: [
                { role: 'system', content: 'You are Mangoi admin assistant. Respond in warm, professional Korean. Never invent numbers that were not given to you, and never treat "자료 없음" as zero.' },
                { role: 'user', content: prompt }
              ],
              max_tokens: 512,
            });
            briefingText = (ai?.response || '').trim();
          }
        } catch (aiErr: any) {
          console.warn('[briefing] AI failed', aiErr?.message);
        }
        if (!briefingText) {
          briefingText = (sanity.length ? `⚠️ 숫자 확인이 필요해 AI 요약을 만들지 않았습니다: ${sanity.join(', ')}\n` : '')
            + `🌅 어제(${yesterdayStr}) 망고아이 브리핑입니다.\n`
            + `신규 등록 ${newEnroll}명, 신규 상담 ${newInquiry}건이 접수되었습니다.\n`
            + (attendanceRate == null ? `어제 출석 자료는 아직 집계되지 않았습니다.\n`
                                      : `어제 수업 기록이 있는 학생은 ${attendedYesterday}명(활동 학생 ${activeStudents}명 중 ${attendanceRate}%)입니다.\n`)
            + (recentEvalAvg == null ? `최근 7일 안에 작성된 평가서는 없습니다.\n`
                                     : `최근 7일 평가 평균은 ${recentEvalAvg}점(${recentEvalCount}건)입니다.\n`)
            + `미납 학생 ${overdueCount}명(결제 기록 있는 ${overduePaidEver}명 중), 최근 14일 수업 기록 없는 학생 ${atRiskCount}명을 확인해 주세요.\n`
            + `오늘도 좋은 하루 되세요!`;
        }

        await env.DB.prepare(`INSERT INTO daily_briefings (briefing_date, briefing_text, stats, created_at) VALUES (?,?,?,?)`)
          .bind(yesterdayStr, briefingText, JSON.stringify(stats), now).run();

        return json({ ok: true, briefing_text: briefingText, stats, briefing_date: yesterdayStr });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'briefing_failed' }, 500);
      }
    }
  return null;
}
