const BBOX = [-74.06, 40.66, -73.85, 40.92] // minLng, minLat, maxLng, maxLat (Manhattan)

/** Free geocoding via OSM Nominatim, restricted to the Manhattan area. */
export async function geocode(query) {
  const q = encodeURIComponent(query.trim())
  if (!q) return []
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=7&q=${q}` +
    `&viewbox=${BBOX.join(',')}&bounded=1&countrycodes=us&accept-language=en`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Search failed')
  const data = await res.json()
  return data.map((d) => ({
    name: d.display_name.split(',')[0],
    full: d.display_name,
    lat: Number(d.lat),
    lng: Number(d.lon),
  }))
}
