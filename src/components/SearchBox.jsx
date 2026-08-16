import { useEffect, useRef, useState } from 'react'
import { Search, MapPin } from 'lucide-react'
import { geocode } from '../lib/geocode'

export default function SearchBox({ onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const timerRef = useRef(null)
  const seqRef = useRef(0)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const onChange = (value) => {
    setQuery(value)
    clearTimeout(timerRef.current)
    if (value.trim().length < 3) {
      setResults([])
      setOpen(false)
      return
    }
    timerRef.current = setTimeout(async () => {
      const seq = ++seqRef.current
      setBusy(true)
      try {
        const hits = await geocode(value)
        if (seq !== seqRef.current) return
        setResults(hits)
        setOpen(true)
      } catch {
        if (seq === seqRef.current) setResults([])
      } finally {
        if (seq === seqRef.current) setBusy(false)
      }
    }, 450)
  }

  const pick = (hit) => {
    setQuery(hit.name)
    setOpen(false)
    setResults([])
    onSelect(hit.lng, hit.lat, hit.name)
  }

  return (
    <div className="searchbox">
      <div className="searchbox-input-wrap">
        <Search size={15} className="searchbox-icon" />
        <input
          className="searchbox-input"
          placeholder="Search a place…"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {busy && <span className="searchbox-busy" />}
      </div>
      {open && results.length > 0 && (
        <ul className="searchbox-results">
          {results.map((r, i) => (
            <li key={i} onMouseDown={() => pick(r)}>
              <MapPin size={13} className="searchbox-pin" />
              <div>
                <div className="searchbox-name">{r.name}</div>
                <div className="searchbox-full">{r.full}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
