import { haversineKm } from './streets.js'

/** Extract [lat, lng] points from GPX XML text. */
export function parseGpxText(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid GPX file')
  }
  const points = []
  for (const trkpt of doc.querySelectorAll('trkpt')) {
    const lat = parseFloat(trkpt.getAttribute('lat'))
    const lon = parseFloat(trkpt.getAttribute('lon'))
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) points.push([lat, lon])
  }
  if (!points.length) throw new Error('No track points found in GPX file')
  return points
}

export function gpxWalkedKm(points) {
  let km = 0
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i])
  return km
}

export async function importGpxFile(file) {
  const text = await file.text()
  const points = parseGpxText(text)
  const km = gpxWalkedKm(points)
  return { points, walked_km: km }
}
