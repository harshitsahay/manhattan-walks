import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { Tag } from 'lucide-react'
import ErrorBoundary from './ErrorBoundary'
import SearchBox from './SearchBox'
import { getSegment, getStreetFeatures } from '../lib/streets'
import { loadPlaces, PLACE_COLORS } from '../lib/places'

const MANHATTAN_BOUNDS = [[-74.06, 40.68], [-73.88, 40.88]]
const MAP_STYLE = {
  version: 8,
  glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
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

const POI_COLOR = ['match', ['get', 'type'],
  'park', PLACE_COLORS.park,
  'food', PLACE_COLORS.food,
  'museum', PLACE_COLORS.museum,
  'culture', PLACE_COLORS.culture,
  'education', PLACE_COLORS.education,
  'landmark', PLACE_COLORS.landmark,
  'transport', PLACE_COLORS.transport,
  '#b8beca']

/* MTA subway palette */
const MTA = {
  red: '#EE352E',
  green: '#00933C',
  yellow: '#FCCC0A',
  orange: '#FF6319',
  blue: '#0039A6',
  purple: '#B933AD',
  gray: '#6E6E6E',
  casing: '#0D0F14',
}
const WALKER_LINE_COLOR = ['match', ['get', 'walker'],
  'Jay', MTA.green,
  MTA.red]

function MapCanvas({ streetsReady, coveredIds, draftIds, draftFullIds, draftPolyline, routePoints, walks, mode, onMapClick, drawStart }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const searchMarkerRef = useRef(null)
  const pointMarkersRef = useRef([])
  const callbacksRef = useRef({ onMapClick, mode })
  callbacksRef.current = { onMapClick, mode }
  const [placesOn, setPlacesOn] = useState(false)
  const placesOnRef = useRef(false)

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
      onMapClick(e.lngLat.lng, e.lngLat.lat)
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
    if (!map) return
    if (drawStart) {
      if (markerRef.current) markerRef.current.remove()
      const el = document.createElement('div')
      el.className = 'draw-start-marker'
      markerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([drawStart.lng, drawStart.lat])
        .addTo(map)
    } else if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }
    if (mode === 'draw' && searchMarkerRef.current) {
      searchMarkerRef.current.remove()
      searchMarkerRef.current = null
    }
  }, [drawStart, mode])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for (const m of pointMarkersRef.current) m.remove()
    pointMarkersRef.current = []
    if (mode === 'draw') {
      for (const p of routePoints || []) {
        const el = document.createElement('div')
        el.className = p.kind === 'end' ? 'route-point end' : 'route-point'
        pointMarkersRef.current.push(
          new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([p.lng, p.lat])
            .addTo(map),
        )
      }
    }
  }, [routePoints, mode])

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
    map.setPaintProperty('streets-remaining', 'line-color', '#6E6E6E')
    map.setPaintProperty('streets-remaining', 'line-opacity', 0.35)
    map.setPaintProperty('streets-remaining', 'line-width', 1.4)
    map.setLayoutProperty('streets-remaining', 'line-cap', 'round')

    map.addLayer({ id: 'streets-covered-casing', type: 'line', source: 'streets', filter: noMatchFilter })
    map.setPaintProperty('streets-covered-casing', 'line-color', '#14161B')
    map.setPaintProperty('streets-covered-casing', 'line-opacity', 0.9)
    map.setPaintProperty('streets-covered-casing', 'line-width', 6.5)
    map.setLayoutProperty('streets-covered-casing', 'line-cap', 'round')

    map.addLayer({ id: 'streets-covered', type: 'line', source: 'streets', filter: noMatchFilter })
    map.setPaintProperty('streets-covered', 'line-color', MTA.yellow)
    map.setPaintProperty('streets-covered', 'line-opacity', 0.95)
    map.setPaintProperty('streets-covered', 'line-width', 2.8)
    map.setLayoutProperty('streets-covered', 'line-cap', 'round')

    map.addLayer({ id: 'routes', type: 'line', source: 'routes' })
    map.setPaintProperty('routes', 'line-color', WALKER_LINE_COLOR)
    map.setPaintProperty('routes', 'line-opacity', 0.45)
    map.setPaintProperty('routes', 'line-width', 2)

    map.addLayer({ id: 'draft-route', type: 'line', source: 'draft-route' })
    map.setPaintProperty('draft-route', 'line-color', MTA.orange)
    map.setPaintProperty('draft-route', 'line-opacity', 0.9)
    map.setPaintProperty('draft-route', 'line-width', 4)
    map.setLayoutProperty('draft-route', 'line-cap', 'round')

    map.addLayer({ id: 'draft-casing', type: 'line', source: 'streets', filter: noMatchFilter })
    map.setPaintProperty('draft-casing', 'line-color', '#14161B')
    map.setPaintProperty('draft-casing', 'line-opacity', 0.9)
    map.setPaintProperty('draft-casing', 'line-width', 6.5)
    map.setLayoutProperty('draft-casing', 'line-cap', 'round')

    map.addLayer({ id: 'draft', type: 'line', source: 'streets', filter: noMatchFilter })
    map.setPaintProperty('draft', 'line-color', '#FFB300')
    map.setPaintProperty('draft', 'line-opacity', 1)
    map.setPaintProperty('draft', 'line-width', 3.2)
    map.setLayoutProperty('draft', 'line-cap', 'round')
  }, [streetsReady])

  const ensurePlaces = useRef(async (map) => {
    if (map.getSource('places')) return
    const data = await loadPlaces()
    const nhoodFeatures = data.neighborhoods.map((n) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
      properties: { name: n.name },
    }))
    const poiFeatures = data.landmarks.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { name: p.name, type: p.type },
    }))
    map.addSource('places-nhood', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: nhoodFeatures },
    })
    map.addSource('places-poi', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: poiFeatures },
    })
    map.addLayer({
      id: 'places-nhood-label', type: 'symbol', source: 'places-nhood',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 10.5,
        'text-font': ['Open Sans Semibold'],
        'text-letter-spacing': 0.03,
      },
      paint: {
        'text-color': '#a7afc2',
        'text-halo-color': 'rgba(17,20,28,0.9)',
        'text-halo-width': 1.6,
      },
    })
    map.addLayer({
      id: 'places-poi-dot', type: 'circle', source: 'places-poi',
      paint: {
        'circle-color': POI_COLOR,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 14, 4],
        'circle-stroke-color': '#14181f',
        'circle-stroke-width': 1.2,
      },
    })
    map.addLayer({
      id: 'places-poi-label', type: 'symbol', source: 'places-poi',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 10.5,
        'text-font': ['Open Sans Regular'],
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
      },
      paint: {
        'text-color': PLACE_COLORS.landmark,
        'text-halo-color': 'rgba(17,20,28,0.9)',
        'text-halo-width': 1.4,
      },
    })
  })

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (placesOn && !placesOnRef.current) {
      placesOnRef.current = true
      ensurePlaces.current(map).catch(() => {})
    } else if (!placesOn && placesOnRef.current) {
      placesOnRef.current = false
      for (const l of ['places-nhood-label', 'places-poi-dot', 'places-poi-label']) {
        if (map.getLayer(l)) map.removeLayer(l)
      }
      for (const s of ['places-nhood', 'places-poi']) {
        if (map.getSource(s)) map.removeSource(s)
      }
    }
  }, [placesOn])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('streets-covered')) return
    const ids = [...coveredIds]
    const filter = ids.length
      ? ['in', ['get', 'id'], ['literal', ids]]
      : noMatchFilter
    map.setFilter('streets-covered', filter)
    map.setFilter('streets-covered-casing', filter)
  }, [coveredIds])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('draft')) return
    const fullIds = [...draftFullIds]
    const filter = fullIds.length
      ? ['in', ['get', 'id'], ['literal', fullIds]]
      : noMatchFilter
    map.setFilter('draft', filter)
    map.setFilter('draft-casing', filter)
    map.getSource('draft-route').setData({
      type: 'FeatureCollection',
      features: draftPolyline.length
        ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: draftPolyline } }]
        : [],
    })
  }, [draftIds, draftFullIds, draftPolyline])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('routes')) return
    const features = walks.map((w) => {
      const coords = Array.isArray(w.polyline) && w.polyline[0] && Array.isArray(w.polyline[0])
        ? toLngLat(w.polyline)
        : []
      return coords.length
        ? {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
            properties: { walker: w.walker || 'Harshit' },
          }
        : null
    }).filter(Boolean)
    map.getSource('routes').setData({ type: 'FeatureCollection', features })
  }, [walks])

  const flyTo = (lng, lat) => {
    const map = mapRef.current
    if (!map) return
    map.flyTo({ center: [lng, lat], zoom: 15, duration: 900 })
    if (searchMarkerRef.current) searchMarkerRef.current.remove()
    const el = document.createElement('div')
    el.className = 'search-marker'
    searchMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([lng, lat])
      .addTo(map)
    setTimeout(() => { searchMarkerRef.current?.remove(); searchMarkerRef.current = null }, 8000)
  }

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map-canvas" />
      <SearchBox onSelect={flyTo} />
      <button
        className={`places-toggle${placesOn ? ' active' : ''}`}
        onClick={() => setPlacesOn((v) => !v)}
        title="Show places & neighborhoods"
      >
        <Tag size={15} /> Places
      </button>
    </div>
  )
}

export default function MapView(props) {
  return (
    <ErrorBoundary>
      <MapCanvas {...props} />
    </ErrorBoundary>
  )
}
