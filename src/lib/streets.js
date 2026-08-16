import * as turf from '@turf/turf'
import RBush from 'rbush'

let streets = null
let index = null
let idToSegment = null
let streetFeatures = null

export function buildStreetFeatures() {
  if (!streets) return []
  if (streetFeatures) return streetFeatures
  streetFeatures = streets.map((seg) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: seg.coords.map(([lat, lng]) => [lng, lat]) },
    properties: { id: seg.id, name: seg.name || null },
  }))
  return streetFeatures
}

export function getStreetFeatures() {
  return streetFeatures || buildStreetFeatures()
}

export function initStreets(data) {
  streets = data
  idToSegment = new Map(data.map((s) => [s.id, s]))
  const tree = new RBush()
  const items = data.map((s, i) => {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
    for (const [lat, lng] of s.coords) {
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
    return { minX: minLng, minY: minLat, maxX: maxLng, maxY: maxLat, index: i }
  })
  tree.load(items)
  index = tree
  streetFeatures = null
  return streets
}

export function loadStreets() {
  return fetch('/streets.json')
    .then((r) => {
      if (!r.ok) throw new Error('failed to load streets')
      return r.json()
    })
    .then(initStreets)
}

export function getStreets() {
  return streets
}

export function getSegment(id) {
  return idToSegment ? idToSegment.get(id) : null
}

const METERS_PER_DEG_LAT = 111320

function candidatesInCircle(lng, lat, radiusM) {
  const rLat = radiusM / METERS_PER_DEG_LAT
  const rLng = radiusM / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180))
  const hits = index.search({
    minX: lng - rLng, minY: lat - rLat, maxX: lng + rLng, maxY: lat + rLat,
  })
  return hits.map((h) => streets[h.index])
}

const turfLines = new Map()

function turfLine(segment) {
  let line = turfLines.get(segment.id)
  if (!line) {
    line = turf.lineString(segment.coords.map(([lat, lng]) => [lng, lat]))
    turfLines.set(segment.id, line)
  }
  return line
}

/** Nearest street segment to a point within radiusM, or null. */
export function nearestSegment(lng, lat, radiusM) {
  const cands = candidatesInCircle(lng, lat, radiusM)
  if (!cands.length) return null
  const pt = turf.point([lng, lat])
  let best = null
  for (const s of cands) {
    const hit = turf.nearestPointOnLine(turfLine(s), pt)
    const d = turf.distance(pt, hit, { units: 'meters' })
    if (d <= radiusM && (!best || d < best.dist)) {
      best = { segment: s, dist: d, point: hit.geometry.coordinates }
    }
  }
  return best
}

/** Snap a sequence of GPS points to street segments within radiusM. Returns covered ids (Set) in traversal order. */
export function snapTrace(points, radiusM = 15) {
  const ordered = []
  const seen = new Set()
  for (const [lat, lng] of points) {
    const hit = nearestSegment(lng, lat, radiusM)
    if (hit && !seen.has(hit.segment.id)) {
      seen.add(hit.segment.id)
      ordered.push(hit.segment.id)
    }
  }
  return { ids: ordered, covered: seen }
}

export function haversineKm([lat1, lng1], [lat2, lng2]) {
  return turf.distance(turf.point([lng1, lat1]), turf.point([lng2, lat2]), { units: 'kilometers' })
}
