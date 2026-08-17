/* Rebuild every walk's coverage in a single step from the drawn trace.

 * The historic map rendered raw GPX traces as polylines. Block coverage is
 * derived from that same geometry, one step: a street segment is covered when
 * the trace RUNS ALONG it — consecutive trace points within SNAP_M of the
 * segment whose walking direction is within ANG_DEG of the segment's
 * direction, for at least MIN_RUN_M total. Touching a corner at an
 * intersection does not count (the direction there is perpendicular);
 * walking along the street does. No routing, no clustering, no overrides.
 *
 * Polylines and walked_km are left untouched — they match the map as drawn.
 *
 * Usage (from repo root, with .env loaded):
 *   node scripts/rebuild_walks.mjs            # dry run: print report, write nothing
 *   node scripts/rebuild_walks.mjs --apply    # update Supabase rows + data files
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { initStreets, segmentsNearPoint } from '../src/lib/streets.js'
import { haversineKm } from '../src/lib/streets.js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env vars first.')
  process.exit(1)
}
const APPLY = process.argv.includes('--apply')

const streets = JSON.parse(readFileSync('data/streets.json', 'utf8'))
initStreets(streets)
const byId = new Map(streets.map((s) => [s.id, s]))

/** Max distance from the segment centerline for a trace sample to count (m). */
const SNAP_M = 15
/** Sampling interval for connector lines between sparse GPS points (m). */
const SAMPLE_M = 15
/** Max angle between walking direction and segment direction (deg). */
const ANG_DEG = 45
/** Total walked length along a segment required to call it covered (m). */
const MIN_RUN_M = 30
/** Max gap between consecutive aligned samples (m); larger = left the street. */
const MAX_GAP_M = 40

/** Points along the drawn trace: every recorded point plus samples along the
 *  connectors between them, so long straight gaps get snapped too. */
function sampleTrace(points) {
  const out = []
  for (let i = 0; i < points.length; i++) {
    const [lat, lng] = points[i]
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    out.push([lat, lng])
    if (i + 1 >= points.length) break
    const [lat2, lng2] = points[i + 1]
    if (!Number.isFinite(lat2) || !Number.isFinite(lng2)) continue
    const gapM = haversineKm([lat, lng], [lat2, lng2]) * 1000
    if (gapM <= SAMPLE_M) continue
    const n = Math.ceil(gapM / SAMPLE_M)
    for (let k = 1; k < n; k++) {
      out.push([lat + ((lat2 - lat) * k) / n, lng + ((lng2 - lng) * k) / n])
    }
  }
  return out
}

function segDir(s) {
  const [a, b] = [s.coords[0], s.coords[s.coords.length - 1]]
  const dx = b[1] - a[1], dy = b[0] - a[0]
  const m = Math.hypot(dx, dy) || 1
  return [dx / m, dy / m]
}

function tangentAt(samples, i) {
  const a = samples[Math.max(0, i - 1)]
  const b = samples[Math.min(samples.length - 1, i + 1)]
  const dx = b[1] - a[1], dy = b[0] - a[0]
  const m = Math.hypot(dx, dy)
  if (m < 1e-8) return [1, 0]
  return [dx / m, dy / m]
}

/** One step from the map: segments the trace runs along, in walk order. */
function coveredFor(points) {
  const samples = sampleTrace(points)
  const cosAng = Math.cos((ANG_DEG * Math.PI) / 180)
  const runs = new Map() // seg.id -> accumulated along-length (m)
  const lastIdx = new Map() // seg.id -> last aligned sample index
  const ordered = []
  for (let i = 0; i < samples.length; i++) {
    const [lat, lng] = samples[i]
    const t = tangentAt(samples, i)
    for (const s of segmentsNearPoint(lng, lat, SNAP_M)) {
      if (ordered.includes(s.id)) continue
      const [sx, sy] = segDir(s)
      if (Math.abs(t[0] * sx + t[1] * sy) < cosAng) continue
      const pIdx = lastIdx.get(s.id)
      let run = runs.get(s.id) || 0
      if (pIdx !== undefined && i - pIdx <= 3) {
        const gap = haversineKm(samples[pIdx], samples[i]) * 1000
        if (gap <= MAX_GAP_M) run += gap
      } else {
        run = 0
      }
      runs.set(s.id, run)
      lastIdx.set(s.id, i)
      if (run >= MIN_RUN_M) ordered.push(s.id)
    }
  }
  return ordered
}

const supabase = createClient(url, key)
const { data: dbWalks, error: fetchErr } = await supabase.from('walks').select('*')
if (fetchErr) {
  console.error('Fetch failed:', fetchErr.message)
  process.exit(1)
}
const dbByKey = new Map(dbWalks.map((w) => [JSON.stringify([w.walked_on, w.note]), w]))

const nameGroup = (ids) => {
  const byName = new Map()
  for (const id of ids) {
    const n = byId.get(id)?.name || '(unnamed)'
    byName.set(n, (byName.get(n) || 0) + 1)
  }
  return [...byName.entries()].map(([n, c]) => `${n} (${c})`).join(' · ')
}

let totalOld = 0
let totalNew = 0
const historic = JSON.parse(readFileSync('data/historic_walks.json', 'utf8'))
const report = []
for (const h of historic) {
  const key = JSON.stringify([h.date, h.note])
  const row = dbByKey.get(key)
  if (!row) {
    report.push(`=== ${h.date} | ${h.route_id} | SKIPPED (not in DB)`)
    continue
  }
  const oldIds = Array.isArray(row.covered_edges) ? row.covered_edges : []
  const ids = coveredFor(Array.isArray(row.polyline) ? row.polyline : [])
  const oldKm = row.walked_km || 0
  totalOld += oldKm
  totalNew += oldKm
  report.push(
    `=== ${h.date} | ${h.route_id} | ${ids.length} blocks (was ${oldIds.length}) | ${oldKm.toFixed(2)} km`,
    `    ${nameGroup(ids)}`,
  )
  if (APPLY) {
    // anon key has SELECT/INSERT/DELETE but no UPDATE (RLS), so rewrite rows
    const { error: delErr } = await supabase.from('walks').delete().eq('id', row.id)
    if (delErr) {
      console.error(`  DELETE FAILED ${h.date} ${h.route_id}:`, delErr.message)
      process.exit(1)
    }
    const { error: insErr } = await supabase.from('walks').insert({
      walked_on: row.walked_on,
      note: row.note,
      walker: row.walker,
      walked_km: row.walked_km,
      covered_edges: ids,
      polyline: row.polyline,
    })
    if (insErr) {
      console.error(`  INSERT FAILED ${h.date} ${h.route_id}:`, insErr.message)
      process.exit(1)
    }
  }
  h.covered_edges = ids
  h.covered_blocks = ids.length
}
console.log(report.join('\n'))
console.log(`\nTOTAL: ${totalNew.toFixed(2)} km (unchanged — traces match the map)`)

if (APPLY) {
  writeFileSync('data/historic_walks.json', JSON.stringify(historic, null, 2))
  const coveredTotal = new Set()
  for (const h of historic) for (const id of h.covered_edges || []) coveredTotal.add(id)
  const stats = {
    edge_count: streets.length,
    total_len_m: Math.round(streets.reduce((a, s) => a + (s.len_m || 0), 0)),
    covered_blocks: coveredTotal.size,
    coverage_pct: Math.round((100 * coveredTotal.size) / streets.length * 100) / 100,
    distinct_street_names: new Set(streets.map((s) => s.name).filter(Boolean)).size,
  }
  writeFileSync('data/stats.json', JSON.stringify(stats, null, 2))
  console.log('Applied. stats:', JSON.stringify(stats))
} else {
  console.log('(dry run — pass --apply to write to Supabase and data/)')
}
