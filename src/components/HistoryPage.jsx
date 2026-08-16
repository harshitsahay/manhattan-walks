import { useState } from 'react'
import { ArrowLeft, Trash2 } from 'lucide-react'

function fmtDate(iso) {
  if (!iso) return 'date unknown'
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

const WALKER_COLORS = { Harshit: '#ff9f1c', Jay: '#8ad6bf', Both: '#a195ff' }

function WalkerChip({ walker }) {
  return (
    <span className="walker-chip" style={{ color: WALKER_COLORS[walker] || '#cfd6e4' }}>
      {walker}
    </span>
  )
}

export default function HistoryPage({ walks, onDelete, onBack }) {
  const [confirmId, setConfirmId] = useState(null)

  const walkers = ['Harshit', 'Jay', 'Both']
  const perWalker = walkers.map((w) => {
    const list = walks.filter((x) => x.walker === w)
    const blocks = new Set(list.flatMap((x) => x.covered_edges || []))
    const km = list.reduce((s, x) => s + (x.walked_km || 0), 0)
    return { walker: w, count: list.length, blocks: blocks.size, km }
  })

  const sorted = [...walks].sort((a, b) => (b.walked_on || '').localeCompare(a.walked_on || ''))

  const doDelete = (w) => {
    if (confirmId === w.id) {
      onDelete(w.id)
      setConfirmId(null)
    } else {
      setConfirmId(w.id)
      setTimeout(() => setConfirmId((c) => (c === w.id ? null : c)), 3500)
    }
  }

  return (
    <div className="history">
      <div className="history-head">
        <button className="icon-btn" onClick={onBack} title="Back to map"><ArrowLeft size={18} /></button>
        <div>
          <h2>Walk history</h2>
          <p className="history-sub">{walks.length} walks logged</p>
        </div>
      </div>

      <div className="history-summary">
        {perWalker.map((s) => (
          <div className="history-card" key={s.walker}>
            <div className="history-card-top">
              <WalkerChip walker={s.walker} />
              <span className="history-card-count">{s.count} walk{s.count === 1 ? '' : 's'}</span>
            </div>
            <div className="history-card-stats">
              <div><strong>{s.km.toFixed(1)}</strong><span>km walked</span></div>
              <div><strong>{s.blocks}</strong><span>blocks covered</span></div>
            </div>
          </div>
        ))}
      </div>

      <ul className="history-list">
        {sorted.map((w) => (
          <li className="history-row" key={w.id}>
            <div className="history-row-date">{fmtDate(w.walked_on)}</div>
            <div className="history-row-main">
              <div className="history-row-top">
                <WalkerChip walker={w.walker || '—'} />
                <span className="history-row-meta">
                  {w.walked_km != null ? `${w.walked_km.toFixed(2)} km` : ''}
                  {w.walked_km != null ? ' · ' : ''}
                  {(w.covered_edges || []).length} blocks
                </span>
              </div>
              {w.note && <div className="history-row-note">{w.note}</div>}
            </div>
            <button
              className={`icon-btn danger${confirmId === w.id ? ' confirming' : ''}`}
              onClick={() => doDelete(w)}
              title="Delete walk"
            >
              <Trash2 size={15} />
              {confirmId === w.id && <span className="confirm-label">Sure?</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
