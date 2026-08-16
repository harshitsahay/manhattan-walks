import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { getSegment, getStreetFeatures } from '../lib/streets'

const MANHATTAN_BOUNDS = [[-74.06, 40.68], [-73.88, 40.88]]
const MAP_STYLE = {
  version: 8,
  sources: {
    basemap: {
      type: 'raster',
      tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
    },
  },
  layers: [
    { id: 'basemap', type: 'raster', source: 'basemap' },
  ],
}

const toLngLat = (coords) => coords.map(([lat, lng]) => [lng, lat])
const noMatchFilter = ['==', ['get', 'id'], '']

export default function MapView({ streetsReady, coveredIds, draftIds, walks, mode, onMapClick }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const callbacksRef = useRef({ onMapClick, mode })
  callbacksRef.current = { onMapClick, mode }

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      attributionControl: false,
      center: [-73.9725, 40.7718],
      zoom: 12.5,
      maxBounds: [[-74.1, 40.6], [-73.8, 40.95]],
      maxZoom: 17,
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.on('load', () => map.fitBounds(MANHATTAN_BOUNDS, { padding: 40, duration: 800 }))
    map.on('click', (e) => {
      const { onMapClick, mode } = callbacksRef.current
      if (mode !== 'draw') return
      const { lng, lat } = e.lngLat
      const mpp = 156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, map.getZoom())
      onMapClick(lng, lat, Math.max(8, Math.min(120, 28 * mpp)))
    })
    map.on('mousemove', () => {
      const { mode } = callbacksRef.current
      map.getCanvas().style.cursor = mode === 'draw' ? 'crosshair' : ''
    })
    mapRef.current = map
    return () => map.remove()
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !streetsReady) return
    if (map.getSource('streets')) return
    map.addSource('streets', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: getStreetFeatures(),
      },
    })
    map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addSource('draft-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

    map.addLayer({ id: 'streets-remaining', type: 'line', source: 'streets' })
    map.setPaintProperty('streets-remaining', 'line-color', '#4b5263')
    map.setPaintProperty('streets-remaining', 'line-opacity', 0.5)
    map.setPaintProperty('streets-remaining', 'line-width', 1.4)
    map.setPaintProperty('streets-remaining', 'line-cap', 'round')

    map.addLayer({ id: 'streets-covered-glow', type: 'line', source: 'streets', filter: noMatchFilter })
    map.setPaintProperty('streets-covered-glow', 'line-color', '#e0b940')
    map.setPaintProperty('streets-covered-glow', 'line-opacity', 0.16)
    map.setPaintProperty('streets-covered-glow', 'line-width', 10)
    map.setPaintProperty('streets-covered-glow', 'line-cap', 'round')

    map.addLayer({ id: 'streets-covered', type: 'line', source: 'streets', filter: noMatchFilter })
    map.setPaintProperty('streets-covered', 'line-color', '#e0b940')
    map.setPaintProperty('streets-covered', 'line-opacity', 0.95)
    map.setPaintProperty('streets-covered', 'line-width', 2.8)
    map.setPaintProperty('streets-covered', 'line-cap', 'round')

    map.addLayer({ id: 'routes', type: 'line', source: 'routes' })
    map.setPaintProperty('routes', 'line-color', '#8ad6bf')
    map.setPaintProperty('routes', 'line-opacity', 0.4)
    map.setPaintProperty('routes', 'line-width', 2)

    map.addLayer({ id: 'draft-route', type: 'line', source: 'draft-route' })
    map.setPaintProperty('draft-route', 'line-color', '#ff9f1c')
    map.setPaintProperty('draft-route', 'line-opacity', 0.9)
    map.setPaintProperty('draft-route', 'line-width', 4)
    map.setPaintProperty('draft-route', 'line-cap', 'round')

    map.addLayer({ id: 'draft', type: 'line', source: 'streets', filter: noMatchFilter })
    map.setPaintProperty('draft', 'line-color', '#ffd166')
    map.setPaintProperty('draft', 'line-opacity', 1)
    map.setPaintProperty('draft', 'line-width', 5)
    map.setPaintProperty('draft', 'line-cap', 'round')
  }, [streetsReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('streets-covered')) return
    const ids = [...coveredIds]
    map.setFilter('streets-covered', ids.length
      ? ['in', ['get', 'id'], ['literal', ids]]
      : noMatchFilter)
    map.setFilter('streets-covered-glow', ids.length
      ? ['in', ['get', 'id'], ['literal', ids]]
      : noMatchFilter)
  }, [coveredIds])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('draft')) return
    const ids = [...draftIds]
    map.setFilter('draft', ids.length
      ? ['in', ['get', 'id'], ['literal', ids]]
      : noMatchFilter)
    const coords = []
    for (const id of ids) {
      const seg = getSegment(id)
      if (seg) coords.push(...toLngLat(seg.coords))
    }
    map.getSource('draft-route').setData({
      type: 'FeatureCollection',
      features: coords.length
        ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }]
        : [],
    })
  }, [draftIds])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('routes')) return
    const features = walks.map((w) => {
      const coords = Array.isArray(w.polyline) && w.polyline[0] && Array.isArray(w.polyline[0])
        ? toLngLat(w.polyline)
        : []
      return coords.length
        ? { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
        : null
    }).filter(Boolean)
    map.getSource('routes').setData({ type: 'FeatureCollection', features })
  }, [walks])

  return <div ref={containerRef} className="map-canvas" />
}
