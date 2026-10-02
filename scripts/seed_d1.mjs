import { readFileSync } from 'node:fs'

const walks = JSON.parse(readFileSync('data/historic_walks.json', 'utf8'))
const lines = []
lines.push('-- Seeded from data/historic_walks.json')

for (const w of walks) {
  const id = `seed-${w.route_id}`
  const walkedOn = w.date || null
  const note = (w.note || '').replace(/'/g, "''")
  const walker = w.walker || 'Harshit'
  const covered = JSON.stringify(w.covered_edges || []).replace(/'/g, "''")
  const polyline = JSON.stringify(w.polyline || []).replace(/'/g, "''")
  const km = w.walked_km != null ? Number(w.walked_km) : 'NULL'
  lines.push(
    `INSERT INTO walks (id, walked_on, note, walker, covered_edges, polyline, walked_km) VALUES ('${id}', ${walkedOn ? `'${walkedOn}'` : 'NULL'}, ${note ? `'${note}'` : 'NULL'}, '${walker}', '${covered}', '${polyline}', ${km});`
  )
}

console.log(lines.join('\n'))
