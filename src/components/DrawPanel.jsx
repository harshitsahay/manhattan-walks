import { useEffect, useRef, useState } from 'react'
import { Trash2, Undo2, X, Upload, MapPin, Check } from 'lucide-react'

function fmtDate(iso) {
  if (!iso) return 'date unknown'
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const WALKERS = ['Harshit', 'Jay']
const WALKER_COLORS = { Harshit: '#ff9f1c', Jay: '#8ad6bf' }

export default function DrawPanel({ draftIds, draftCount, drawStart, drawError, onUndo, onClear, onSave, onImportGpx, onCancel }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [walker, setWalker] = useState('Harshit')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  const save = async () => {
    if (!draftIds.length) return
    setSaving(true)
    try {
      await onSave({ walked_on: date, note: note.trim() || null, walker })
      setNote('')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => () => setSaving(false), [])

  return (
    <div className="draw-panel">
      <div className="draw-head">
        <div className="draw-title"><MapPin size={16} /> Logging a walk</div>
        <button className="icon-btn" onClick={onCancel} title="Cancel"><X size={16} /></button>
      </div>
      <p className="draw-hint">
        {drawStart
          ? 'Start point set — tap where you ended, we route the street path between them.'
          : 'Tap your start point, then your end point — the street path between them is added.'}
      </p>
      {drawStart && <div className="draw-start-status"><MapPin size={13} /> Start locked — tap the end point</div>}
      {drawError && <div className="draw-error">{drawError}</div>}
      <div className="draw-count">
        <span className="draw-count-num">{draftCount}</span> block{draftCount === 1 ? '' : 's'} fully covered
        {draftIds.length > draftCount && (
          <span className="draw-count-note"> · {draftIds.length - draftCount} partial block{draftIds.length - draftCount === 1 ? '' : 's'} skipped</span>
        )}
      </div>
      <p className="draw-hint">
        A block counts only when the whole block was walked — partial start/end blocks are skipped.
      </p>
      <div className="draw-controls">
        <button className="btn ghost" onClick={onUndo} disabled={!draftIds.length}><Undo2 size={15} /> Undo</button>
        <button className="btn ghost" onClick={onClear} disabled={!draftIds.length}><X size={15} /> Clear</button>
      </div>
      <div className="segmented" role="radiogroup" aria-label="Who is logging this walk">
        {WALKERS.map((w) => (
          <button
            key={w}
            role="radio"
            aria-checked={walker === w}
            className={`segmented-btn${walker === w ? ' active' : ''}`}
            style={walker === w ? { color: WALKER_COLORS[w] } : undefined}
            onClick={() => setWalker(w)}
          >
            {w}
          </button>
        ))}
      </div>
      <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <textarea
        className="field"
        placeholder="Note (optional) — where did you go?"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
      />
      <button className="btn primary" onClick={save} disabled={!draftIds.length || saving}>
        <Check size={16} /> {saving ? 'Saving…' : 'Save walk'}
      </button>
      <button className="btn ghost" onClick={() => fileRef.current?.click()}>
        <Upload size={15} /> Import GPX file instead
      </button>
      <input ref={fileRef} type="file" accept=".gpx,application/gpx+xml" hidden
        onChange={(e) => e.target.files[0] && onImportGpx(e.target.files[0])} />
    </div>
  )
}

export function WalksList({ walks, onDelete, onStartDraw }) {
  return (
    <div className="walks-list">
      <div className="walks-head">
        <span>Recent walks</span>
        <button className="btn primary small" onClick={onStartDraw}><MapPin size={14} /> Log a walk</button>
      </div>
      {walks.length === 0 && <p className="walks-empty">No walks logged yet.</p>}
      {walks.slice(0, 12).map((w) => (
        <div className="walk-row" key={w.id}>
          <div className="walk-row-main">
            <div className="walk-row-title">
              <span>{fmtDate(w.walked_on)}</span>
              {w.walker && (
                <span className="walker-chip" style={{ color: WALKER_COLORS[w.walker] || '#cfd6e4' }}>
                  {w.walker}
                </span>
              )}
              <span className="walk-row-km">{w.walked_km != null ? `${w.walked_km.toFixed(2)} km` : ''}</span>
            </div>
            {w.note && <div className="walk-row-note">{w.note}</div>}
            <div className="walk-row-blocks">{w.covered_edges?.length || 0} blocks</div>
          </div>
          <button className="icon-btn danger" onClick={() => onDelete(w.id)} title="Delete walk"><Trash2 size={15} /></button>
        </div>
      ))}
    </div>
  )
}
