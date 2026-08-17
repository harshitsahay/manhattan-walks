function Bar({ pct, color = '#FCCC0A' }) {
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

export default function StatsPanel({ stats, draftCount }) {
  const {
    totalBlocks, blocks, pct, streetKm, totalStreetKm,
    streetPct, walkedKm, walkCount, namedStreets,
    completeStreets, completeStreetsPct, closest,
  } = stats

  return (
    <div className="stats-panel">
      <Card
        label="Manhattan covered"
        value={`${pct.toFixed(1)}%`}
        sub={`${blocks} of ${totalBlocks} street blocks`}
        pct={pct}
        color="#FCCC0A"
      />
      {draftCount > 0 && (
        <Card
          label="New blocks this walk"
          value={`+${draftCount}`}
          pct={((blocks + draftCount) / totalBlocks) * 100}
          color="#FF6319"
        />
      )}
      <div className="stat-row">
        <Card
          label="Distance walked"
          value={`${walkedKm.toFixed(1)} km`}
          sub={`${walkCount} walks`}
          color="#00933C"
        />
        <Card
          label="Unique street km"
          value={`${streetKm.toFixed(1)} km`}
          sub={`of ${totalStreetKm.toFixed(0)} km`}
          pct={streetPct}
          color="#00933C"
        />
      </div>
      <Card
        label="Named streets completed"
        value={completeStreets.length > 0 ? completeStreets.length : 0}
        sub={`of ${namedStreets} named streets`}
        pct={completeStreetsPct}
        color="#B933AD"
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
