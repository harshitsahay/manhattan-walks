function Bar({ pct, color = '#e0b940' }) {
  return (
    <div className="bar">
      <div className="bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  )
}

function Card({ label, value, sub, pct, color, children }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      {pct !== undefined && <Bar pct={pct} color={color} />}
      {children}
    </div>
  )
}

const WALKER_COLORS = { Harshit: '#ff9f1c', Jay: '#8ad6bf', Both: '#a195ff' }

function walkerStats(walks, streets) {
  return ['Harshit', 'Jay'].map((w) => {
    const list = walks.filter((x) => x.walker === w)
    const blocks = new Set(list.flatMap((x) => x.covered_edges || []))
    const km = list.reduce((s, x) => s + (x.walked_km || 0), 0)
    return { walker: w, count: list.length, blocks: blocks.size, km, pct: streets.length ? (blocks.size / streets.length) * 100 : 0 }
  })
}

export default function StatsPanel({ stats, walks = [], streets = [], draftCount }) {
  const {
    totalBlocks, blocks, pct, streetKm, totalStreetKm,
    streetPct, walkedKm, walkCount, namedStreets,
    completeStreets, completeStreetsPct, closest,
  } = stats

  const perWalker = walkerStats(walks, streets)

  return (
    <div className="stats-panel">
      <Card
        label="Manhattan covered"
        value={`${pct.toFixed(1)}%`}
        sub={`${blocks} of ${totalBlocks} street blocks`}
        pct={pct}
        color="#e0b940"
      />
      {draftCount > 0 && (
        <Card
          label="New blocks this walk"
          value={`+${draftCount}`}
          pct={((blocks + draftCount) / totalBlocks) * 100}
          color="#ff9f1c"
        />
      )}
      <div className="stat-row">
        <Card
          label="Distance walked"
          value={`${walkedKm.toFixed(1)} km`}
          sub={`${walkCount} walks`}
          color="#8ad6bf"
        />
        <Card
          label="Unique street km"
          value={`${streetKm.toFixed(1)} km`}
          sub={`of ${totalStreetKm.toFixed(0)} km`}
          pct={streetPct}
          color="#8ad6bf"
        />
      </div>
      <div className="walker-split">
        {perWalker.map((p) => (
          <div className="walker-stat" key={p.walker}>
            <div className="walker-stat-head">
              <span style={{ color: WALKER_COLORS[p.walker] }}>{p.walker}</span>
              <span>{p.blocks} blocks · {p.km.toFixed(1)} km · {p.count} walks</span>
            </div>
            <Bar pct={p.pct} color={WALKER_COLORS[p.walker]} />
          </div>
        ))}
      </div>
      <Card
        label="Named streets completed"
        value={completeStreets.length > 0 ? completeStreets.length : 0}
        sub={`of ${namedStreets} named streets`}
        pct={completeStreetsPct}
        color="#7a6bd6"
      >
        {closest && (
          <div className="closest-street">
            Next up: <strong>{closest.name}</strong> · {closest.done}/{closest.total} blocks
          </div>
        )}
      </Card>
    </div>
  )
}
