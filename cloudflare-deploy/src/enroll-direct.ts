/* 📅 «직접 배정» 수업 묶기 (2026-09-29)
 *
 * 주간 스케줄·학생 상세의 «수업 등록»(POST /api/admin/class-schedules → source='admin_ui')은
 * class_schedules 에만 쓰고 enrollments(수강신청) 에는 안 남긴다. 그래서 수강신청 목록에
 * 원리상 안 떴다(사장님 제보). 목록 API 가 그 행들을 이 함수로 묶어 «직접 배정» 줄로 싣는다.
 *
 * 묶는 기준: 같은 학생 · 같은 강사 · 같은 시각 · 같은 길이 · 같은 종류(날짜지정/매주).
 *   주간 스케줄은 «고른 날짜마다 1건» 을 만들므로, 안 묶으면 한 학생이 수십 줄이 된다.
 * ⛔ 판정·요금 계산을 하지 않는다 — 보여 주기만 한다(신청서가 아니다).
 */
const DOW_WORD: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6,
};

/** day_of_week 표기(숫자·영문·한글·쉼표 나열)를 0~6 목록으로. 모르는 것은 버린다(지어내지 않음). */
export function directDows(v: any): number[] {
  const out: number[] = [];
  for (const raw of String(v ?? '').split(/[,\s/·]+/)) {
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    let d: number | undefined;
    if (/^[0-6]$/.test(t)) d = Number(t);
    else d = DOW_WORD[t.slice(0, 3)] ?? DOW_WORD[t.slice(0, 1)];
    if (d !== undefined && out.indexOf(d) < 0) out.push(d);
  }
  return out;
}

export interface DirectGroup {
  key: string;
  user_id: string;
  student_name: string;
  teacher_id: string;
  teacher_name: string;
  start_time: string;
  duration_min: number;
  kind: 'dated' | 'recurring';
  dows: number[];
  first_date: string | null;
  last_date: string | null;
  count: number;
  created_at: number;
  class_type: string;
}

export function groupDirectClasses(rows: any[]): DirectGroup[] {
  const map = new Map<string, DirectGroup>();
  for (const r of rows || []) {
    const date = String(r.scheduled_date || '').trim();
    const dated = /^\d{4}-\d{2}-\d{2}$/.test(date);
    const kind: 'dated' | 'recurring' = dated ? 'dated' : 'recurring';
    const uid = String(r.user_id || '').trim();
    const tid = String(r.teacher_id ?? '').trim();
    const st = String(r.start_time || '').trim();
    const dur = Number(r.duration_min) || 0;
    const key = [uid.toLowerCase(), tid, st, dur, kind].join('|');
    let g = map.get(key);
    if (!g) {
      g = { key, user_id: uid, student_name: String(r.student_name || '').trim(), teacher_id: tid,
        teacher_name: String(r.teacher_name || '').trim(), start_time: st, duration_min: dur, kind,
        dows: [], first_date: null, last_date: null, count: 0, created_at: 0, class_type: String(r.class_type || '') };
      map.set(key, g);
    }
    g.count++;
    if (!g.student_name && r.student_name) g.student_name = String(r.student_name).trim();
    g.created_at = Math.max(g.created_at, Number(r.created_at) || 0);
    const ds = dated ? [new Date(date + 'T00:00:00Z').getUTCDay()] : directDows(r.day_of_week);
    for (const d of ds) if (g.dows.indexOf(d) < 0) g.dows.push(d);
    if (dated) {
      if (!g.first_date || date < g.first_date) g.first_date = date;
      if (!g.last_date || date > g.last_date) g.last_date = date;
    }
  }
  const out = Array.from(map.values());
  for (const g of out) g.dows.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));   // 월요일부터
  out.sort((a, b) => b.created_at - a.created_at);
  return out;
}
