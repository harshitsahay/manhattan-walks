const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
  'Cache-Control': 'no-store, max-age=0',
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders })
}

/* Optional shared secret. When API_TOKEN is unset the API stays open, which is
   how it worked before; setting it makes every request need a matching token. */
function isAuthorized(request, env) {
  const expected = env.API_TOKEN
  if (!expected) return true
  const provided = request.headers.get('X-Auth-Token') || ''
  if (provided.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

function mapRow(row) {
  return {
    id: row.id,
    walked_on: row.walked_on,
    note: row.note,
    walker: row.walker,
    covered_edges: JSON.parse(row.covered_edges || '[]'),
    polyline: JSON.parse(row.polyline || '[]'),
    walked_km: row.walked_km != null ? Number(row.walked_km) : null,
    created_at: row.created_at,
  }
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: jsonHeaders })
    }
    if (!isAuthorized(request, env)) {
      return json({ error: 'Unauthorized' }, 401)
    }
    if (url.pathname.endsWith('/walks')) {
      if (request.method === 'GET') {
        const { results } = await env.manhattan_walks_db
          .prepare('SELECT * FROM walks ORDER BY walked_on DESC, created_at DESC')
          .all()
        return json(results.map(mapRow))
      }
      if (request.method === 'POST') {
        let body
        try {
          body = await request.json()
        } catch {
          return json({ error: 'Invalid JSON body' }, 400)
        }
        const id = generateId()
        const created = new Date().toISOString()
        await env.manhattan_walks_db
          .prepare(
            `INSERT INTO walks (id, walked_on, note, walker, covered_edges, polyline, walked_km, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            id,
            body.walked_on || null,
            body.note || null,
            body.walker || 'Harshit',
            JSON.stringify(body.covered_edges || []),
            JSON.stringify(body.polyline || []),
            body.walked_km != null ? Number(body.walked_km) : null,
            created
          )
          .run()
        const row = await env.manhattan_walks_db
          .prepare('SELECT * FROM walks WHERE id = ?')
          .bind(id)
          .first()
        return json(mapRow(row), 201)
      }
      if (request.method === 'PATCH') {
        const id = url.searchParams.get('id') || ''
        let body
        try {
          body = await request.json()
        } catch {
          return json({ error: 'Invalid JSON body' }, 400)
        }
        const current = await env.manhattan_walks_db
          .prepare('SELECT * FROM walks WHERE id = ?')
          .bind(id)
          .first()
        if (!current) return json({ error: 'Walk not found' }, 404)
        const updated = {
          walked_on: body.walked_on !== undefined ? body.walked_on : current.walked_on,
          note: body.note !== undefined ? body.note : current.note,
          walker: body.walker !== undefined ? body.walker : current.walker,
          covered_edges: body.covered_edges !== undefined ? JSON.stringify(body.covered_edges) : current.covered_edges,
          polyline: body.polyline !== undefined ? JSON.stringify(body.polyline) : current.polyline,
          walked_km: body.walked_km !== undefined ? Number(body.walked_km) : current.walked_km,
        }
        await env.manhattan_walks_db
          .prepare(
            `UPDATE walks SET
               walked_on = ?, note = ?, walker = ?, covered_edges = ?, polyline = ?, walked_km = ?
             WHERE id = ?`
          )
          .bind(
            updated.walked_on,
            updated.note,
            updated.walker,
            updated.covered_edges,
            updated.polyline,
            updated.walked_km,
            id
          )
          .run()
        const row = await env.manhattan_walks_db
          .prepare('SELECT * FROM walks WHERE id = ?')
          .bind(id)
          .first()
        return json(mapRow(row))
      }
      if (request.method === 'DELETE') {
        const { success } = await env.manhattan_walks_db
          .prepare('DELETE FROM walks WHERE id = ?')
          .bind(url.searchParams.get('id') || '')
          .run()
        return json({ success })
      }
    }
    return json({ error: 'Not found' }, 404)
  },
}
