/** teacher-feedback: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { json } from './api-util';

export async function handleAdminTeacherFeedbackApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;


    // ═══════════════════════════════════════════════════════════════
    // 🤖 Phase A1 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 🧠 Phase MBTI — 학생-강사 MBTI 매칭
    // ═══════════════════════════════════════════════════════════════
    const ensureMbtiTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_mbti (teacher_uid TEXT PRIMARY KEY, teacher_name TEXT, mbti TEXT, hobby TEXT, teaching_style TEXT, intro TEXT, updated_at INTEGER);`);
      try { await env.DB.exec(`ALTER TABLE teacher_mbti ADD COLUMN photo_url TEXT`); } catch {}
      /* 🙂 (2026-08-18 사장님 수정요청 #02 후속) 강사 «성향».
         신규 학생 등록 마법사가 «원하는 선생님 성향»(상냥한·재미있는·교육적인·진지한·웃음많은)을
         물어보게 됐는데, 정작 **강사 쪽에 성향 자료가 없어서** 추천에 못 쓰고 메모로만 남았다.
         그 반쪽을 여기에 채운다 — 이미 매칭용으로 쓰는 표(teacher_mbti)에 칸 하나를 더 단다.
         ⚠️ CREATE 문에 넣지 않고 멱등 ALTER 로 붙인다 — schema_drift 하니스가
            «운영 실제에 없는 CREATE 컬럼» 을 막는다(payment_type 과 같은 방식). */
      try { await env.DB.exec(`ALTER TABLE teacher_mbti ADD COLUMN personality TEXT`); } catch {}
    };

    /* 🙂 성향 값 정본 — 화면(마법사·MBTI 카드)과 서버가 같은 다섯 개를 쓴다.
       모르는 값이 들어오면 조용히 버린다(오타로 «kindd» 가 저장되면 매칭에서 영영 안 걸린다). */
    const PERSONALITY_IDS = ['kind', 'fun', 'edu', 'serious', 'laugh'];
    const normPersonality = (v: any): string | null => {
      const raw = Array.isArray(v) ? v : String(v ?? '').split(/[,\s]+/);
      const out: string[] = [];
      for (const x of raw) {
        const k = String(x || '').trim().toLowerCase();
        if (PERSONALITY_IDS.includes(k) && !out.includes(k)) out.push(k);
      }
      return out.length ? out.join(',') : null;
    };

    // ── GET /api/teachers/mbti-list — 강사 MBTI 목록 (공개) ──
    if (method === 'GET' && path === '/api/teachers/mbti-list') {
      await ensureMbtiTable();
      const rs = await env.DB.prepare(`SELECT teacher_uid, teacher_name, mbti, hobby, teaching_style, intro, photo_url, personality FROM teacher_mbti ORDER BY teacher_name`).all();
      return json({ ok: true, count: rs.results?.length || 0, teachers: rs.results || [] });
    }

    // ── POST /api/admin/teacher/mbti — 강사 MBTI 등록/수정 (관리자) ──
    if (method === 'POST' && path === '/api/admin/teacher/mbti') {
      await ensureMbtiTable();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.teacher_uid || '').trim();
      if (!uid) return json({ ok: false, error: 'teacher_uid_required' }, 400);
      const now = Date.now();
      // photo_url 미입력 시 DiceBear 자동 생성
      const photoUrl = (b.photo_url || '').trim() || `https://api.dicebear.com/7.x/lorelei/svg?seed=${encodeURIComponent(b.teacher_name || uid)}&backgroundColor=fbbf24,ffd5dc,b6e3f4,c0aede,fcd0a1`;
      const pers = normPersonality(b.personality);
      await env.DB.prepare(
        `INSERT INTO teacher_mbti (teacher_uid, teacher_name, mbti, hobby, teaching_style, intro, photo_url, personality, updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(teacher_uid) DO UPDATE SET teacher_name = excluded.teacher_name, mbti = excluded.mbti, hobby = excluded.hobby, teaching_style = excluded.teaching_style, intro = excluded.intro, photo_url = excluded.photo_url, personality = excluded.personality, updated_at = excluded.updated_at`
      ).bind(uid, b.teacher_name || null, String(b.mbti || '').toUpperCase().slice(0,4), b.hobby || null, b.teaching_style || null, b.intro || null, photoUrl, pers, now).run();
      return json({ ok: true, teacher_uid: uid, personality: pers });
    }

    // ── POST /api/admin/teacher/mbti/seed-demo — 테스트용 강사 10명 일괄 등록 ──
    if (method === 'POST' && path === '/api/admin/teacher/mbti/seed-demo') {
      await ensureMbtiTable();
      const dicebear = (style: string, seed: string, bg: string) => `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${bg}`;
      const DEMO_TEACHERS = [
        { uid: 'demo_karen',   name: 'Karen',   mbti: 'ENFJ', hobby: '드라마/요리/여행',          style: '친절하고 활기차게 — 일상 회화 위주, 격려 많음',         intro: '안녕하세요! Karen 입니다. 학생들과 즐겁게 대화하며 영어를 배우는 게 제 목표예요. 🌟', photo: dicebear('lorelei','Karen','ffd5dc,fcd0a1') },
        { uid: 'demo_james',   name: 'James',   mbti: 'INTJ', hobby: '독서/체스/논리퍼즐',        style: '체계적·논리적 — 문법·구조 분석, 발음 정확도 중심',       intro: 'Hi, I am James. 분석적인 접근으로 영어의 구조를 명확하게 알려드립니다.',                       photo: dicebear('avataaars','James','b6e3f4') },
        { uid: 'demo_sophie',  name: 'Sophie',  mbti: 'ENTP', hobby: '토론/팟캐스트/스타트업',     style: '활발한 토론 — 비즈니스/시사 영어, 도전적 질문',          intro: '비즈니스 영어와 토론을 좋아하시는 분 환영! 영어로 다른 시각도 열어드려요.',                    photo: dicebear('lorelei','Sophie','c0aede') },
        { uid: 'demo_maria',   name: 'Maria',   mbti: 'ISFJ', hobby: '베이킹/식물 가꾸기/봉사',     style: '조용하고 인내심 — 초보 / 아동 케어, 반복학습',           intro: '아이들과 초보 학생을 정성스럽게 가르치는 Maria 입니다. 천천히 함께 가요. 🌱',                  photo: dicebear('lorelei','Maria','d1d4f9') },
        { uid: 'demo_alex',    name: 'Alex',    mbti: 'ENFP', hobby: 'K-POP/뮤지컬/즉흥 게임',    style: '에너지 폭발 — 게임·노래·역할극 활용 자유 회화',          intro: 'Energy! Alex 와 함께라면 영어가 놀이가 됩니다. Let\'s have fun! 🎮',                          photo: dicebear('avataaars','Alex','fcd0a1') },
        { uid: 'demo_emily',   name: 'Emily',   mbti: 'ISTJ', hobby: '독서/달리기/계획표 짜기',     style: '꼼꼼하고 체계적 — 시험 영어 (수능·토익·토플) 전문',      intro: '시험 영어는 전략입니다. Emily 와 함께 목표 점수 달성하세요.',                                photo: dicebear('lorelei','Emily','b6e3f4') },
        { uid: 'demo_david',   name: 'David',   mbti: 'INFJ', hobby: '글쓰기/명상/시 감상',         style: '깊이 있는 대화 — 문학·문법·작문 중심',                  intro: '영어로 자신을 표현하는 즐거움을 가르쳐드립니다. 마음 깊은 영어로! 📖',                       photo: dicebear('avataaars','David','d1d4f9') },
        { uid: 'demo_anna',    name: 'Anna',    mbti: 'ESFP', hobby: '댄스/파티/SNS',              style: '재미 최우선 — 게임·이벤트·실생활 대화 위주',             intro: '영어가 재미있어야 늘어요! Anna 와 함께 신나는 수업 하실 분 🎉',                              photo: dicebear('lorelei','Anna','ffdfbf') },
        { uid: 'demo_daniel',  name: 'Daniel',  mbti: 'ISTP', hobby: '자전거/만들기/기계 분해',     style: '실용적·짧은 설명 — 여행 영어·실생활 표현',               intro: '실용 영어의 달인 Daniel 입니다. 짧고 굵게, 바로 쓰는 영어!',                                  photo: dicebear('avataaars','Daniel','b6e3f4') },
        { uid: 'demo_lisa',    name: 'Lisa',    mbti: 'INFP', hobby: '그림/일러스트/카페투어',      style: '창의적 — 감정 표현·자기 소개·자유 글쓰기',               intro: '여러분의 영어 안에 자신만의 색깔을 담는 법, Lisa 가 알려드려요. 🎨',                          photo: dicebear('lorelei','Lisa','ffd5dc') },
      ];

      let inserted = 0, updated = 0;
      const now = Date.now();
      for (const t of DEMO_TEACHERS) {
        try {
          const existed: any = await env.DB.prepare(`SELECT teacher_uid FROM teacher_mbti WHERE teacher_uid = ?`).bind(t.uid).first();
          await env.DB.prepare(
            `INSERT INTO teacher_mbti (teacher_uid, teacher_name, mbti, hobby, teaching_style, intro, photo_url, updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(teacher_uid) DO UPDATE SET teacher_name = excluded.teacher_name, mbti = excluded.mbti, hobby = excluded.hobby, teaching_style = excluded.teaching_style, intro = excluded.intro, photo_url = excluded.photo_url, updated_at = excluded.updated_at`
          ).bind(t.uid, t.name, t.mbti, t.hobby, t.style, t.intro, t.photo, now).run();
          if (existed) updated++; else inserted++;
        } catch {}
      }

      return json({ ok: true, total: DEMO_TEACHERS.length, inserted, updated, teachers: DEMO_TEACHERS.map(t => ({ uid: t.uid, name: t.name, mbti: t.mbti })) });
    }

    // ── POST /api/mbti/match — 학생 MBTI 로 강사 매칭 ──
    if (method === 'POST' && path === '/api/mbti/match') {
      await ensureMbtiTable();
      const b: any = await request.json().catch(() => ({}));
      const studentMbti = String(b.mbti || '').toUpperCase().trim().slice(0, 4);
      if (!/^[IE][NS][TF][JP]$/.test(studentMbti)) return json({ ok: false, error: 'invalid_mbti', hint: 'INTJ, ENFP 같은 4자 형식' }, 400);

      // 🆕 자동 시드 — 등록된 강사가 없으면 5명 자동 등록 (DiceBear 아바타 포함)
      const countRs: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM teacher_mbti WHERE mbti IS NOT NULL AND mbti != ''`).first();
      if ((countRs?.n || 0) === 0) {
        const TEST_TEACHERS = [
          { uid: 'test_karen',  name: 'Karen',  mbti: 'ENFJ', hobby: '드라마/요리/여행',     style: '친절하고 활기차게 — 일상 회화 + 격려',     intro: '안녕하세요! Karen 입니다. 즐거운 대화로 영어를 배워요 🌟',
            photo: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Karen&backgroundColor=ffd5dc,fcd0a1&hair=variant40,variant41&earrings=variant01' },
          { uid: 'test_james',  name: 'James',  mbti: 'INTJ', hobby: '독서/체스/논리퍼즐',    style: '체계적·논리적 — 문법·구조·발음 정확도',   intro: '분석적으로 영어의 구조를 명확히 알려드립니다.',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=James&backgroundColor=b6e3f4&top=shortHairShortFlat&accessories=prescription02&clotheColor=3c4858' },
          { uid: 'test_sophie', name: 'Sophie', mbti: 'ENTP', hobby: '토론/팟캐스트',         style: '활발한 토론 — 비즈니스·시사 영어',        intro: '토론과 비즈니스 영어 환영! 시각을 열어드려요.',
            photo: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Sophie&backgroundColor=c0aede&hair=variant23' },
          { uid: 'test_maria',  name: 'Maria',  mbti: 'ISFJ', hobby: '베이킹/봉사',           style: '인내심 — 초보·아동 케어, 반복학습',       intro: '천천히 함께 가요. 초보도 환영합니다 🌱',
            photo: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Maria&backgroundColor=d1d4f9&hair=variant33' },
          { uid: 'test_alex',   name: 'Alex',   mbti: 'ENFP', hobby: 'K-POP/뮤지컬/게임',     style: '에너지 폭발 — 게임·노래·역할극',         intro: 'Energy! Alex 와 함께라면 영어가 놀이 🎮',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex&backgroundColor=fcd0a1&top=shortHairShaggyMullet&accessoriesColor=fbbf24' },
        ];
        const now = Date.now();
        for (const t of TEST_TEACHERS) {
          try {
            await env.DB.prepare(
              `INSERT OR IGNORE INTO teacher_mbti (teacher_uid, teacher_name, mbti, hobby, teaching_style, intro, photo_url, updated_at) VALUES (?,?,?,?,?,?,?,?)`
            ).bind(t.uid, t.name, t.mbti, t.hobby, t.style, t.intro, t.photo, now).run();
          } catch {}
        }
      }

      // 매칭 점수 (간단한 호환성 매트릭스)
      const compatibilityScore = (a: string, b: string): number => {
        if (!a || !b || a.length !== 4 || b.length !== 4) return 50;
        // 같은 글자 수 (4개 중 일치)
        let same = 0;
        for (let i = 0; i < 4; i++) if (a[i] === b[i]) same++;
        // 학습 추천 매트릭스: 일부 보색 조합이 잘 맞음
        // 일반적으로 같은 N/S (정보 인식 방식) + 비슷한 J/P 가 좋음
        let bonus = 0;
        if (a[1] === b[1]) bonus += 15; // 같은 N/S
        if (a[2] !== b[2]) bonus += 8;  // 다른 T/F (균형)
        if (a[3] === b[3]) bonus += 7;  // 같은 J/P
        // 같은 글자가 4개면 100점, 0개 + bonus 까지 계산
        const score = Math.min(100, same * 18 + bonus + 15);
        return score;
      };

      const rs = await env.DB.prepare(`SELECT teacher_uid, teacher_name, mbti, hobby, teaching_style, intro, photo_url FROM teacher_mbti WHERE mbti IS NOT NULL AND mbti != ''`).all();
      const teachers = ((rs.results || []) as any[]).map(t => ({
        ...t,
        match_score: compatibilityScore(studentMbti, t.mbti || ''),
      })).sort((a, b) => b.match_score - a.match_score);

      return json({
        ok: true,
        student_mbti: studentMbti,
        total_teachers: teachers.length,
        top_matches: teachers.slice(0, 5),
        all_matches: teachers,
      });
    }
    // ═══════════════════════════════════════════════════════════════
    // 🧠 Phase MBTI 끝
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 🌟 Phase PR — 교사 칭찬하기 (익명, 7점 별점)
    // ═══════════════════════════════════════════════════════════════
    const ensurePraiseTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_praises (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_uid TEXT NOT NULL, teacher_name TEXT, star_rating INTEGER NOT NULL, praise_text TEXT, category TEXT, ip_hash TEXT, created_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_praise_teacher ON teacher_praises(teacher_uid, created_at DESC)`); } catch {}
    };

    // ── GET /api/teachers/list-public — 강사 목록 (이름만, 칭찬용) ──
    if (method === 'GET' && path === '/api/teachers/list-public') {
      // 라이브 teacher_profiles 는 관리자 강사프로필 스키마(id/korean_name/english_name/status='활동중')이며
      // teacher_uid 컬럼이 없다 — 과거 이 핸들러가 teacher_uid 를 SELECT 해 D1_ERROR 500 이 났음.
      let teachers: any[] = [];
      // 1) teacher_profiles 우선 (uid 는 'tp-<id>' 로 합성 — 칭찬 저장 시 teacher_name 도 함께 저장되므로 표시엔 지장 없음)
      try {
        const rs: any = await env.DB.prepare(`SELECT id, korean_name, english_name FROM teacher_profiles WHERE status IS NULL OR status = '' OR status IN ('활동중','재직') ORDER BY korean_name LIMIT 100`).all();
        teachers = ((rs.results || []) as any[]).map(t => ({ teacher_uid: 'tp-' + t.id, name: t.korean_name || t.english_name || ('강사 ' + t.id), english_name: t.english_name || null }));
      } catch {}
      // 2) teacher_mbti 폴백
      if (!teachers.length) {
        try {
          await ensureMbtiTable();
          const rs: any = await env.DB.prepare(`SELECT teacher_uid, teacher_name AS name FROM teacher_mbti LIMIT 100`).all();
          teachers = ((rs.results || []) as any[]).map(t => ({ teacher_uid: t.teacher_uid, name: t.name || t.teacher_uid, english_name: null }));
        } catch {}
      }
      return json({ ok: true, count: teachers.length, teachers });
    }

    // ── POST /api/teacher/praise — 익명 칭찬 제출 ──
    if (method === 'POST' && path === '/api/teacher/praise') {
      await ensurePraiseTable();
      const b: any = await request.json().catch(() => ({}));
      const teacherUid = String(b.teacher_uid || '').trim();
      const star = parseInt(b.star_rating, 10);
      const praiseText = String(b.praise_text || '').slice(0, 1000);
      if (!teacherUid) return json({ ok: false, error: 'teacher_uid_required' }, 400);
      if (!star || star < 1 || star > 7) return json({ ok: false, error: 'star_must_be_1_to_7' }, 400);

      // 스팸 방지: IP 해시 (학생/학부모 ID 는 절대 저장 안 함)
      const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '';
      // 간단 해시 (개인정보 X — 단지 스팸 방지용)
      const enc = new TextEncoder().encode(ip + '|salt-praise');
      const hashBuf = await crypto.subtle.digest('SHA-256', enc);
      const ipHash = Array.from(new Uint8Array(hashBuf)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');

      // 같은 IP 가 5분 안에 같은 강사에게 다시 칭찬하면 차단 (스팸 방지)
      const since = Date.now() - 5 * 60 * 1000;
      const dup: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM teacher_praises WHERE teacher_uid = ? AND ip_hash = ? AND created_at >= ?`).bind(teacherUid, ipHash, since).first();
      if ((dup?.n || 0) > 0) return json({ ok: false, error: 'duplicate_too_soon', message: '5분 안에 같은 강사에게 다시 칭찬할 수 없어요' }, 429);

      await env.DB.prepare(
        `INSERT INTO teacher_praises (teacher_uid, teacher_name, star_rating, praise_text, category, ip_hash, created_at) VALUES (?,?,?,?,?,?,?)`
      ).bind(teacherUid, b.teacher_name || null, star, praiseText, b.category || null, ipHash, Date.now()).run();

      return json({ ok: true, message: '칭찬이 등록됐어요! 강사님께 익명으로 전달됩니다.' });
    }

    // ── GET /api/admin/teacher/praise/list?teacher_uid=X — 강사별 받은 칭찬 (관리자) ──
    if (method === 'GET' && path === '/api/admin/teacher/praise/list') {
      await ensurePraiseTable();
      const uid = (url.searchParams.get('teacher_uid') || '').trim();
      let q = `SELECT id, teacher_uid, teacher_name, star_rating, praise_text, category, created_at FROM teacher_praises`;
      const binds: any[] = [];
      if (uid) { q += ` WHERE teacher_uid = ?`; binds.push(uid); }
      q += ` ORDER BY created_at DESC LIMIT 100`;
      const rs = await env.DB.prepare(q).bind(...binds).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ── GET /api/admin/teacher/praise/stats — 전체 강사 칭찬 통계 ──
    if (method === 'GET' && path === '/api/admin/teacher/praise/stats') {
      await ensurePraiseTable();
      const rs = await env.DB.prepare(
        `SELECT teacher_uid, teacher_name, COUNT(*) AS count, AVG(star_rating) AS avg_star, MAX(created_at) AS last_at FROM teacher_praises GROUP BY teacher_uid ORDER BY avg_star DESC, count DESC LIMIT 100`
      ).all();
      const rows = ((rs.results || []) as any[]).map(r => ({
        teacher_uid: r.teacher_uid,
        teacher_name: r.teacher_name,
        count: r.count,
        avg_star: Math.round((r.avg_star || 0) * 10) / 10,
        last_at: r.last_at,
      }));
      return json({ ok: true, count: rows.length, rows });
    }
  return null;
}
