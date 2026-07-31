/**
 * api-space-monster.ts — Space Monster Hunter 게임 API
 * POST /api/games/space-monster/hit — 괴물 사격 기록
 */

import { json } from './api-util'

interface SpaceMonsterHit {
  score: number
  creature: string
  stage: number
  word: string
}

async function ensureSpaceMonsterSchema(env: { DB: D1Database }) {
  try {
    await env.DB.exec(`
      CREATE TABLE IF NOT EXISTS space_monster_hits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        creature TEXT NOT NULL,
        word TEXT NOT NULL,
        stage INTEGER NOT NULL,
        score INTEGER NOT NULL,
        hit_at INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await env.DB.exec(`
      CREATE TABLE IF NOT EXISTS space_monster_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        stage INTEGER NOT NULL,
        final_score INTEGER NOT NULL,
        creatures_hit INTEGER NOT NULL,
        words_learned TEXT,
        completed_at INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 인덱스
    try {
      await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_smh_user ON space_monster_hits(user_id, created_at DESC)`)
      await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_smr_user ON space_monster_results(user_id, stage DESC)`)
    } catch {}
  } catch (e: any) {
    console.error('Space Monster schema error:', e.message)
  }
}

export async function handleSpaceMonsterApi(
  method: string,
  path: string,
  url: URL,
  body: any,
  env: any,
  userId?: string
): Promise<Response | null> {
  // POST /api/games/space-monster/hit — 사격 기록
  if (method === 'POST' && path === '/api/games/space-monster/hit') {
    if (!userId) {
      return json({ ok: false, error: 'auth_required' }, 401)
    }

    try {
      await ensureSpaceMonsterSchema(env)

      const now = Date.now()
      const { score, creature, stage, word } = body as SpaceMonsterHit

      if (!creature || !word || !stage) {
        return json({ ok: false, error: 'missing_params' }, 400)
      }

      // 기록 저장
      await env.DB.prepare(`
        INSERT INTO space_monster_hits (user_id, creature, word, stage, score, hit_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
        .bind(userId, creature, word, stage, score || 100, now)
        .run()

      return json({ ok: true, score: score || 100 })
    } catch (error: any) {
      console.error('Space Monster hit error:', error.message)
      return json({ ok: false, error: 'server_error' }, 500)
    }
  }

  // POST /api/games/space-monster/stage-complete — 스테이지 완료
  if (method === 'POST' && path === '/api/games/space-monster/stage-complete') {
    if (!userId) {
      return json({ ok: false, error: 'auth_required' }, 401)
    }

    try {
      await ensureSpaceMonsterSchema(env)

      const { stage, score, words_learned } = body
      const now = Date.now()

      if (!stage || score === undefined) {
        return json({ ok: false, error: 'missing_params' }, 400)
      }

      // 스테이지 완료 기록
      const result = await env.DB.prepare(`
        INSERT INTO space_monster_results (
          user_id, stage, final_score, creatures_hit, words_learned, completed_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        RETURNING id
      `)
        .bind(userId, stage, score, 0, JSON.stringify(words_learned || []), now)
        .first()

      return json({
        ok: true,
        result_id: result?.id,
        stage,
        score
      })
    } catch (error: any) {
      console.error('Space Monster stage complete error:', error.message)
      return json({ ok: false, error: 'server_error' }, 500)
    }
  }

  // GET /api/games/space-monster/results — 게임 결과 조회
  if (method === 'GET' && path === '/api/games/space-monster/results') {
    if (!userId) {
      return json({ ok: false, error: 'auth_required' }, 401)
    }

    try {
      await ensureSpaceMonsterSchema(env)

      const limit = Number(url.searchParams.get('limit') || '10')

      const results: any = await env.DB.prepare(`
        SELECT id, stage, final_score, creatures_hit, words_learned, completed_at
        FROM space_monster_results
        WHERE user_id = ?
        ORDER BY completed_at DESC
        LIMIT ?
      `)
        .bind(userId, limit)
        .all()

      return json({
        ok: true,
        results: results.results || []
      })
    } catch (error: any) {
      console.error('Space Monster results error:', error.message)
      return json({ ok: false, error: 'server_error' }, 500)
    }
  }

  return null
}
