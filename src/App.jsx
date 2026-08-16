import { useCallback, useEffect, useMemo, useState } from 'react'
import { Map as MapIcon, History, Footprints } from 'lucide-react'
import { fetchWalks, insertWalk, deleteWalk } from './lib/supabase'
import { SUPABASE_URL } from './config'
import { loadStreets, snapTrace, getStreets, getSegment, nearestSegment, routeBetween } from './lib/streets'
import { computeStats } from './lib/stats'
import { importGpxFile } from './lib/gpx'
import MapView from './components/MapView'
import StatsPanel from './components/StatsPanel'
import DrawPanel, { WalksList } from './components/DrawPanel'
import HistoryPage from './components/HistoryPage'

export default function App() {
  const [streetsReady, setStreetsReady] = useState(false)
  const [walks, setWalks] = useState([])
  const [draftRoutes, setDraftRoutes] = useState([])
  const [drawStart, setDrawStart] = useState(null)
  const [drawError, setDrawError] = useState(null)
  const [mode, setMode] = useState('view')
  const [page, setPage] = useState('map')
  const [importedKm, setImportedKm] = useState(0)
  const [importedPolyline, setImportedPolyline] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    (async () => {
      try {
        await loadStreets()
        setStreetsReady(true)
      } catch (e) {
        setError('Failed to load street data: ' + e.message)
      }
      try {
        const data = await fetchWalks()
        setWalks(data)
      } catch (e) {
        setError('Failed to load walks: ' + e.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const coveredIds = useMemo(() => {
    const set = new Set()
    for (const w of walks) for (const id of w.covered_edges || []) set.add(id)
    return set
  }, [walks])

  const draftIds = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const r of draftRoutes) for (const id of r.ids) if (!seen.has(id)) { seen.add(id); out.push(id) }
    return out
  }, [draftRoutes])

  const draftFullIds = useMemo(() => {
    const seen = new Set()
    for (const r of draftRoutes) for (const id of r.fullIds) seen.add(id)
    return [...seen]
  }, [draftRoutes])

  const streets = getStreets() || []
  const stats = useMemo(() => computeStats(streets, coveredIds, walks), [streets, coveredIds, walks])

  const handleMapClick = useCallback((lng, lat) => {
    if (!drawStart) {
      if (!nearestSegment(lng, lat, 60)) {
        setDrawError('No street nearby — tap closer to a street')
        return
      }
      setDrawStart({ lng, lat })
      setDrawError(null)
      return
    }
    const route = routeBetween(drawStart.lng, drawStart.lat, lng, lat)
    if (!route) {
      setDrawError('Could not route there — tap closer to a street')
      return
    }
    setDraftRoutes((prev) => [...prev, { ids: route.ids, fullIds: route.fullIds }])
    setDrawStart(null)
    setDrawError(null)
  }, [drawStart])

  const handleUndo = () => setDraftRoutes((prev) => prev.slice(0, -1))
  const handleClear = () => {
    setDraftRoutes([])
    setImportedKm(0)
    setImportedPolyline(null)
    setDrawStart(null)
    setDrawError(null)
  }
  const handleCancel = handleClear

  const startDraw = useCallback(() => {
    setMode('draw')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleSave = async ({ walked_on, note, walker }) => {
    const segKm = draftIds.reduce((acc, id) => acc + (getSegment(id)?.len_m || 0), 0) / 1000
    const walkedKm = importedKm + segKm
    let polyline
    if (importedPolyline) {
      polyline = importedPolyline
    } else {
      polyline = []
      for (const id of draftIds) {
        const seg = getSegment(id)
        if (seg) polyline.push(...seg.coords)
      }
    }
    const saved = await insertWalk({
      walked_on,
      note,
      walker: walker || 'Harshit',
      walked_km: Math.round(walkedKm * 100) / 100,
      covered_edges: draftFullIds,
      polyline,
    })
    setWalks((prev) => [saved, ...prev])
    setDraftRoutes([])
    setImportedKm(0)
    setImportedPolyline(null)
    setDrawStart(null)
    setDrawError(null)
    setMode('view')
  }

  const handleImportGpx = async (file) => {
    try {
      const { points, walked_km } = await importGpxFile(file)
      const { ids } = snapTrace(points, 15)
      setImportedKm(walked_km)
      setImportedPolyline(points)
      setDraftRoutes([{ ids, fullIds: ids }])
      setMode('draw')
      if (error) setError(null)
    } catch (e) {
      setError('GPX import failed: ' + e.message)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteWalk(id)
      setWalks((prev) => prev.filter((w) => w.id !== id))
    } catch (e) {
      setError('Delete failed: ' + e.message)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="masthead">
          <p className="masthead-kicker">Every street, one block at a time</p>
          <h1>Manhattan</h1>
        </div>
        <div className="segmented header-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={page === 'map'}
            className={`segmented-btn${page === 'map' ? ' active' : ''}`}
            onClick={() => setPage('map')}
          >
            <MapIcon size={14} /> Map
          </button>
          <button
            role="tab"
            aria-selected={page === 'history'}
            className={`segmented-btn${page === 'history' ? ' active' : ''}`}
            onClick={() => setPage('history')}
          >
            <History size={14} /> History
          </button>
        </div>
        <div className="header-stats">
          <div className="header-badge">{loading ? '…' : `${stats.pct.toFixed(1)}%`}</div>
          <span>covered</span>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {!SUPABASE_URL && (
        <div className="error-banner">Supabase not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</div>
      )}

      {page === 'history' && (
        <div className="history-overlay">
          <HistoryPage walks={walks} onDelete={handleDelete} onBack={() => setPage('map')} />
        </div>
      )}

      <div className="layout">
        <aside className="sidebar">
          {mode === 'draw' ? (
            <DrawPanel
              draftIds={draftIds}
              draftCount={draftFullIds.length}
              drawStart={drawStart}
              drawError={drawError}
              onUndo={handleUndo}
              onClear={handleClear}
              onCancel={handleCancel}
              onSave={handleSave}
              onImportGpx={handleImportGpx}
            />
          ) : (
            <StatsPanel stats={stats} draftCount={draftFullIds.length} />
          )}
          {mode === 'view' && (
            <WalksList walks={walks} onDelete={handleDelete} onStartDraw={startDraw} />
          )}
        </aside>
        <MapView
          streetsReady={streetsReady}
          coveredIds={coveredIds}
          draftIds={draftIds}
          walks={walks}
          mode={mode}
          drawStart={drawStart}
          onMapClick={handleMapClick}
        />
      </div>

      {page === 'map' && mode === 'view' && (
        <button className="fab" onClick={() => setMode('draw')}>
          <Footprints size={18} /> Log a walk
        </button>
      )}
    </div>
  )
}
