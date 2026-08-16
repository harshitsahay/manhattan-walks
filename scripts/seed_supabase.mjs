import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env vars first.')
  process.exit(1)
}

const supabase = createClient(url, key)
const walks = JSON.parse(readFileSync('data/historic_walks.json', 'utf8'))

console.log('Clearing existing walks...')
const { error: delErr } = await supabase.from('walks').delete().neq('id', '00000000-0000-0000-0000-000000000000')
if (delErr) {
  console.error('Delete failed (expected if table empty):', delErr.message)
}

const rows = walks.map((w) => ({
  walked_on: w.date || null,
  walker: w.walker || null,
  note: w.note || null,
  covered_edges: w.covered_edges,
  polyline: w.polyline,
  walked_km: w.walked_km,
}))

console.log(`Seeding ${rows.length} historic walks...`)
const { error } = await supabase.from('walks').insert(rows)
if (error) {
  console.error('Seed failed:', error.message)
  process.exit(1)
}
console.log('Seeded. Coverage:',
  new Set(walks.flatMap((w) => w.covered_edges)).size, 'blocks')
