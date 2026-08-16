export function computeStats(streets, coveredIds, walks) {
  const covered = coveredIds instanceof Set ? coveredIds : new Set(coveredIds)
  const totalBlocks = streets.length
  const blocks = covered.size
  const pct = totalBlocks ? (blocks / totalBlocks) * 100 : 0

  let streetKm = 0
  let totalStreetKm = 0
  for (const s of streets) {
    totalStreetKm += s.len_m
    if (covered.has(s.id)) streetKm += s.len_m
  }
  streetKm /= 1000
  totalStreetKm /= 1000

  let walkedKm = 0
  for (const w of walks) walkedKm += w.walked_km || 0

  const byName = {}
  for (const s of streets) {
    if (!s.name) continue
    ;(byName[s.name] ||= []).push(s.id)
  }
  const namedStreets = Object.keys(byName)
  const completeStreets = []
  let closest = null
  let closestFrac = -1
  for (const name of namedStreets) {
    const ids = byName[name]
    let done = 0
    for (const id of ids) if (covered.has(id)) done++
    const frac = done / ids.length
    if (frac >= 1) completeStreets.push(name)
    else if (frac > closestFrac && done > 0) {
      closestFrac = frac
      closest = { name, done, total: ids.length }
    }
  }

  return {
    totalBlocks,
    blocks,
    pct,
    streetKm,
    totalStreetKm,
    streetPct: totalStreetKm ? (streetKm / totalStreetKm) * 100 : 0,
    walkedKm,
    walkCount: walks.length,
    namedStreets: namedStreets.length,
    completeStreets,
    completeStreetsPct: namedStreets.length ? (completeStreets.length / namedStreets.length) * 100 : 0,
    closest,
  }
}
