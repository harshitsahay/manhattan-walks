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

/* ---------- street-network routing (point to point) ---------- */

let routeGraph = null

const nodeKey = ([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`

function ensureRouteGraph() {
  if (routeGraph || !streets) return routeGraph
  const ids = new Map()
  const coords = []
  const nodesAt = (p) => {
    const k = nodeKey(p)
    let i = ids.get(k)
    if (i === undefined) {
      i = coords.length
      ids.set(k, i)
      coords.push([p[1], p[0]])
    }
    return i
  }
  const adj = []
  const segNode = []
  for (const s of streets) {
    const a = nodesAt(s.coords[0])
    const b = nodesAt(s.coords[s.coords.length - 1])
    if (!adj[a]) adj[a] = []
    if (!adj[b]) adj[b] = []
    adj[a].push({ to: b, seg: s.id, len: s.len_m || 0 })
    adj[b].push({ to: a, seg: s.id, len: s.len_m || 0 })
    segNode[s.id] = { a, b }
  }
  routeGraph = { adj, coords, segNode, nodesAt }
  return routeGraph
}

function nearestNode(graph, hit) {
  const [pLng, pLat] = hit.point
  const s = hit.segment
  const d0 = (pLng - s.coords[0][1]) ** 2 + (pLat - s.coords[0][0]) ** 2
  const d1 = (pLng - s.coords[s.coords.length - 1][1]) ** 2 + (pLat - s.coords[s.coords.length - 1][0]) ** 2
  return d0 <= d1 ? graph.segNode[s.id].a : graph.segNode[s.id].b
}

/** True if the click is within `junctionM` meters of a segment endpoint (an intersection). */
function isAtJunction(hit, junctionM = 25) {
  const [pLng, pLat] = hit.point
  const s = hit.segment
  const d0 = turf.distance(
    turf.point([s.coords[0][1], s.coords[0][0]]),
    turf.point([pLng, pLat]),
    { units: 'meters' },
  )
  const d1 = turf.distance(
    turf.point([s.coords[s.coords.length - 1][1], s.coords[s.coords.length - 1][0]]),
    turf.point([pLng, pLat]),
    { units: 'meters' },
  )
  return d0 <= junctionM || d1 <= junctionM
}

function dijkstra(graph, start, goal) {
  const { adj, coords } = graph
  const n = coords.length
  const dist = new Float64Array(n).fill(Infinity)
  const prevSeg = new Array(n).fill(null)
  const prevNode = new Array(n).fill(-1)
  const visited = new Uint8Array(n)
  dist[start] = 0
  const heap = [[0, start]]
  while (heap.length) {
    let bi = 0
    for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[bi][0]) bi = i
    const [d, u] = heap.splice(bi, 1)[0]
    if (visited[u]) continue
    visited[u] = 1
    if (u === goal) break
    for (const e of adj[u] || []) {
      const v = e.to
      const nd = d + e.len
      if (nd < dist[v]) {
        dist[v] = nd
        prevSeg[v] = e.seg
        prevNode[v] = u
        heap.push([nd, v])
      }
    }
  }
  if (!visited[goal]) return null
  const ids = []
  let cur = goal
  while (cur !== start && prevSeg[cur] != null) {
    ids.push(prevSeg[cur])
    cur = prevNode[cur]
  }
  return ids.reverse()
}

function pathCoords(ids) {
  const out = []
  const prev = new Map()
  for (const id of ids) {
    const seg = getSegment(id)
    if (!seg) continue
    for (const [lat, lng] of seg.coords) {
      const k = `${lng.toFixed(5)},${lat.toFixed(5)}`
      if (prev.get(k)) continue
      prev.set(k, true)
      out.push([lng, lat])
    }
  }
  return out
}

/** Route along the street network between two clicked points.
 *  Returns: ids (route segments), fullIds (fully-covered segments), polyline (click-to-click coords). */
export function routeBetween(lngA, latA, lngB, latB, radiusM = 60) {
  const graph = ensureRouteGraph()
  if (!graph) return null
  const a = nearestSegment(lngA, latA, radiusM)
  const b = nearestSegment(lngB, latB, radiusM)
  if (!a || !b) return null
  if (a.segment.id === b.segment.id) {
    const full = isAtJunction(a) && isAtJunction(b)
    const id = a.segment.id
    return { ids: [id], fullIds: full ? [id] : [], polyline: pathCoords([id]) }
  }
  const start = nearestNode(graph, a)
  const goal = nearestNode(graph, b)
  if (start === goal) {
    const seen = new Set()
    const ids = []
    const fullIds = []
    for (const [hit, id] of [[a, a.segment.id], [b, b.segment.id]]) {
      if (seen.has(id)) continue
      seen.add(id)
      ids.push(id)
      if (isAtJunction(hit)) fullIds.push(id)
    }
    return { ids, fullIds, polyline: pathCoords(ids) }
  }
  const ids = dijkstra(graph, start, goal)
  if (!ids || !ids.length) return null
  const routeCoords = pathCoords(ids)
  const polyline = [[lngA, latA], ...routeCoords, [lngB, latB]]
  const fullIds = [...ids]
  return { ids, fullIds, polyline }
}
