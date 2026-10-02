import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapIcon, History, Footprints } from 'lucide-react'
import { fetchWalks, insertWalk, updateWalk, deleteWalk } from './lib/supabase'
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
  const [editingWalk, setEditingWalk] = useState(null)
  const [mode, setMode] = useState('view')
  const [page, setPage] = useState('map')
  const [importedKm, setImportedKm] = useState(0)
  const [importedPolyline, setImportedPolyline] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [focusId, setFocusId] = useState(null)

  const refreshWalks = useCallback(async ({ silent = false } = {}) => {
    try {
      const data = await fetchWalks()
      setWalks(data)
      if (!silent) setError((e) => (e && e.startsWith('Failed to load walks') ? null : e))
    } catch (e) {
      if (!silent) setError('Failed to load walks: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    (async () => {
      try {
        await loadStreets()
        setStreetsReady(true)
      } catch (e) {
        setError('Failed to load street data: ' + e.message)
      }
      await refreshWalks()
    })()
  }, [refreshWalks])

  /* Pick up walks logged by other people: on tab focus, and on a slow poll. */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshWalks({ silent: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(() => refreshWalks({ silent: true }), 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [refreshWalks])

  const focusWalk = useMemo(
    () => (focusId ? walks.find((w) => w.id === focusId) || null : null),
    [focusId, walks],
  )

  /* Keep the isolated view valid if that walk gets deleted. */
  useEffect(() => {
    if (focusId && !focusWalk) setFocusId(null)
  }, [focusId, focusWalk])

  const handleInspect = useCallback((walk) => {
    setFocusId((prev) => (prev === walk.id ? null : walk.id))
    setPage('map')
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

  const draftPolyline = useMemo(() => {
    const out = []
    for (const r of draftRoutes) {
      for (const c of r.polyline) {
        if (out.length && out[out.length - 1][0] === c[0] && out[out.length - 1][1] === c[1]) continue
        out.push(c)
      }
    }
    return out
  }, [draftRoutes])

  const routePoints = useMemo(() => {
    const out = []
    for (const r of draftRoutes) {
      if (r.start) out.push({ lng: r.start.lng, lat: r.start.lat, kind: 'start' })
      if (r.end) out.push({ lng: r.end.lng, lat: r.end.lat, kind: 'end' })
    }
    return out
  }, [draftRoutes])

  const streets = getStreets() || []
  const stats = useMemo(() => computeStats(streets, coveredIds, walks), [streets, coveredIds, walks])

  const handleMapClick = useCallback((lng, lat) => {
    if (!drawStart) {
      const hit = nearestSegment(lng, lat, 60)
      if (!hit) {
        setDrawError('No street nearby — tap closer to a street')
        return
      }
      setDrawStart({ lng: hit.point[0], lat: hit.point[1] })
      setDrawError(null)
      return
    }
    const route = routeBetween(drawStart.lng, drawStart.lat, lng, lat)
    if (!route) {
      setDrawError('Could not route there — tap closer to a street')
      return
    }
    const endPoint = { lng: route.endPoint[0], lat: route.endPoint[1] }
    setDraftRoutes((prev) => [
      ...prev,
      { ids: route.ids, fullIds: route.fullIds, polyline: route.polyline, start: drawStart, end: endPoint },
    ])
    setDrawStart(endPoint)
    setDrawError(null)
  }, [drawStart])

  const handleClear = () => {
    setDraftRoutes([])
    setImportedKm(0)
    setImportedPolyline(null)
    setDrawStart(null)
    setDrawError(null)
  }
  const handleCancel = () => {
    handleClear()
    setEditingWalk(null)
  }
  const handleUndo = () => {
    const next = draftRoutes.slice(0, -1)
    setDraftRoutes(next)
    setDrawStart(next.length ? next[next.length - 1].end : null)
  }

  const handleEdit = (walk) => {
    const poly = Array.isArray(walk.polyline) && walk.polyline.length
      ? walk.polyline.map(([lat, lng]) => [lng, lat])
      : []
    setDraftRoutes([{ ids: walk.covered_edges || [], fullIds: walk.covered_edges || [], polyline: poly }])
    setImportedPolyline(null)
    setImportedKm(0)
    setEditingWalk(walk)
    setDrawStart(null)
    setDrawError(null)
    setPage('map')
    setMode('draw')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const startDraw = useCallback(() => {
    setMode('draw')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleSave = async ({ walked_on, note, walker }) => {
    const segKm = draftIds.reduce((acc, id) => acc + (getSegment(id)?.len_m || 0), 0) / 1000
    const walkedKm = importedKm + segKm
    const polyline = importedPolyline
      ? importedPolyline
      : draftPolyline.map(([lng, lat]) => [lat, lng])
    const record = {
      walked_on,
      note,
      walker: walker || 'Harshit',
      walked_km: Math.round(walkedKm * 100) / 100,
      covered_edges: draftFullIds,
      polyline,
    }
    if (editingWalk) {
      const updated = await updateWalk(editingWalk.id, record)
      setWalks((prev) => prev.map((w) => (w.id === updated.id ? updated : w)))
    } else {
      const saved = await insertWalk(record)
      setWalks((prev) => [saved, ...prev])
    }
    setDraftRoutes([])
    setImportedKm(0)
    setImportedPolyline(null)
    setDrawStart(null)
    setDrawError(null)
    setEditingWalk(null)
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
      if (editingWalk?.id === id) setEditingWalk(null)
    } catch (e) {
      setError('Delete failed: ' + e.message)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="masthead">
          <p className="masthead-kicker">Every street, one block at a time</p>
          <h1><span className="mta-bullet">M</span>Manhattan</h1>
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

      {page === 'history' && (
        <div className="history-overlay">
          <HistoryPage
            walks={walks}
            onDelete={handleDelete}
            onEdit={handleEdit}
            onInspect={handleInspect}
            focusId={focusId}
            onBack={() => setPage('map')}
          />
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
              editing={editingWalk}
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
            <WalksList
              walks={walks}
              onDelete={handleDelete}
              onEdit={handleEdit}
              onStartDraw={startDraw}
              onInspect={handleInspect}
              focusId={focusId}
            />
          )}
        </aside>
        <MapView
          streetsReady={streetsReady}
          coveredIds={coveredIds}
          draftIds={draftIds}
          draftFullIds={draftFullIds}
          draftPolyline={draftPolyline}
          routePoints={routePoints}
          walks={walks}
          mode={mode}
          drawStart={drawStart}
          onMapClick={handleMapClick}
          focusWalk={focusWalk}
          onExitFocus={() => setFocusId(null)}
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
