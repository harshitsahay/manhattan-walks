import { readFileSync } from 'node:fs'
import { initStreets, snapTrace, nearestSegment } from '../src/lib/streets.js'
import { gpxWalkedKm } from '../src/lib/gpx.js'

const streets = JSON.parse(readFileSync('data/streets.json', 'utf8'))
initStreets(streets)
console.log('streets loaded:', streets.length)

const route = process.argv[2] || 'gpx_files/route6649674856.gpx'
const text = readFileSync(route, 'utf8')
const points = [...text.matchAll(/<trkpt lat="(-?[\d.]+)" lon="(-?[\d.]+)"/g)]
  .map((m) => [parseFloat(m[1]), parseFloat(m[2])])
console.log('gpx points:', points.length, 'walked km:', gpxWalkedKm(points).toFixed(2))

const { ids, covered } = snapTrace(points, 15)
console.log('blocks covered:', ids.length)

const totalKm = ids.reduce((a, id) => a + (streets.find((s) => s.id === id)?.len_m || 0), 0) / 1000
console.log('street km covered:', totalKm.toFixed(2))

// cross-check: every snapped segment should contain a point within 15m of the trace
let missed = 0
for (const id of ids) {
  const seg = streets.find((s) => s.id === id)
  let found = false
  for (const [lat, lng] of points) {
    const hit = nearestSegment(lng, lat, 15)
    if (hit && hit.segment.id === id) { found = true; break }
  }
  if (!found) missed++
}
console.log('ids not directly near any point:', missed)
console.log('walked km matches reference if within 0.1 of', '~2.66')
