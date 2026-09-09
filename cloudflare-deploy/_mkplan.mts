import { buildTodayPlan } from './src/today-plan.ts';
const plan = buildTodayPlan({
  band: 4, textbook: 'BTS 3', zh: false,
  dow: 2, nowMin: 16*60,
  classes: [{ start_min: 19*60, end_min: 19*60+20, teacher_name: 'Teacher Kaye' } as any],
  weekClassDows: [2,4], done: { warmup: 1 },
} as any);
console.log(JSON.stringify({ ok:true, uid:'minseo', name:'김민서',
  today:'2026-09-09', points_today: 35, ai_streak: 6, plan }, null, 0));
