/* Export or restore every walk in the D1 database.
 *
 * The walks live only in Cloudflare D1, so this writes a plain JSON snapshot
 * that can be committed to git and re-imported later.
 *
 *   node scripts/backup_walks.mjs                  # write backups/walks-YYYY-MM-DD.json
 *   node scripts/backup_walks.mjs --out FILE       # write to an exact path
 *   node scripts/backup_walks.mjs --restore FILE   # merge a snapshot back in (skips ids present)
 *   node scripts/backup_walks.mjs --restore FILE --replace   # wipe and reload exactly
 *   node scripts/backup_walks.mjs --local          # target the local D1, not the deployed one
 *
 * Uses `wrangler d1 execute`, so it works with whatever wrangler is already
 * logged in. No extra tokens needed.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { spawnSync } from 'node:child_process'

const DB_NAME = process.env.D1_DATABASE_NAME || 'manhattan-walks-db'
const local = process.argv.includes('--local')
const remote = local ? [] : ['--remote']

function die(msg) {
  console.error(`error: ${msg}`)
  process.exit(1)
}

function d1(sql) {
  const res = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB_NAME, ...remote, '--command', sql, '--json'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  if (res.status !== 0) die(res.stderr || res.stdout || 'wrangler d1 execute failed')
  /* wrangler prints its --json payload on stderr, not stdout, as [{ results, success }] */
  const raw = (res.stdout || '').trim() || (res.stderr || '').trim()
  const start = raw.indexOf('[')
  if (start === -1) die(`unexpected wrangler output: ${raw.slice(0, 200)}`)
  const payload = JSON.parse(raw.slice(start))
  const result = Array.isArray(payload) ? payload[0] : payload.result?.[0]
  if (!result?.success) die(JSON.stringify(result?.errors || payload))
  return result.results || []
}

function sqlValue(v) {
  if (v == null) return 'NULL'
  if (typeof v === 'number') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

const COLUMNS = ['id', 'walked_on', 'note', 'walker', 'covered_edges', 'polyline', 'walked_km', 'created_at']

function readWalks() {
  return d1('SELECT * FROM walks ORDER BY walked_on DESC, created_at DESC').map((r) => ({
    ...r,
    covered_edges: JSON.parse(r.covered_edges || '[]'),
    polyline: JSON.parse(r.polyline || '[]'),
  }))
}

function flag(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? null : process.argv[i + 1]
}

function exportWalks(outPath) {
  const walks = readWalks()
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(
    outPath,
    JSON.stringify({ exported_at: new Date().toISOString(), count: walks.length, walks }, null, 2) + '\n',
  )
  console.log(`Exported ${walks.length} walks to ${outPath}`)
}

function restoreWalks(file, { replace }) {
  const snapshot = JSON.parse(readFileSync(file, 'utf8'))
  const incoming = snapshot.walks || snapshot
  if (!Array.isArray(incoming)) die(`${file} is not a walk snapshot`)

  if (replace) {
    d1('DELETE FROM walks')
    console.log('Cleared existing walks')
  }

  const existing = new Set(readWalks().map((w) => w.id))
  let added = 0
  let skipped = 0

  for (const w of incoming) {
    if (!w.id) die('snapshot row missing id')
    if (existing.has(w.id)) { skipped++; continue }
    const values = [
      w.id,
      w.walked_on ?? null,
      w.note ?? null,
      w.walker ?? 'Harshit',
      JSON.stringify(w.covered_edges || []),
      JSON.stringify(w.polyline || []),
      w.walked_km ?? null,
      w.created_at ?? new Date().toISOString(),
    ]
    d1(`INSERT INTO walks (${COLUMNS.join(', ')}) VALUES (${values.map(sqlValue).join(', ')})`)
    added++
  }
  console.log(`Restored ${added} walks, skipped ${skipped} already present`)
}

const restore = flag('--restore')
if (restore) {
  restoreWalks(restore, { replace: process.argv.includes('--replace') })
} else {
  const stamp = new Date().toISOString().slice(0, 10)
  exportWalks(flag('--out') || `backups/walks-${stamp}.json`)
}
