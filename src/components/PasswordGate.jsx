import { useState } from 'react'
import { Lock } from 'lucide-react'

// Change the password here. Rebuild + redeploy after changing.
const APP_PASSWORD = 'walknyc2026'
const STORAGE_KEY = 'manhattan_walks_unlocked'

export default function PasswordGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  const unlock = () => {
    if (value === APP_PASSWORD) {
      try {
        sessionStorage.setItem(STORAGE_KEY, '1')
      } catch {}
      setUnlocked(true)
    } else {
      setError(true)
      setValue('')
    }
  }

  if (unlocked) return children

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-icon"><Lock size={22} /></div>
        <h1>Manhattan</h1>
        <p className="gate-sub">Every street, one block at a time</p>
        <form
          className="gate-form"
          onSubmit={(e) => {
            e.preventDefault()
            unlock()
          }}
        >
          <input
            className="field gate-input"
            type="password"
            placeholder="Enter password"
            value={value}
            autoFocus
            onChange={(e) => {
              setValue(e.target.value)
              setError(false)
            }}
          />
          {error && <p className="gate-error">That&apos;s not it.</p>}
          <button className="btn primary gate-btn" type="submit">Unlock</button>
        </form>
      </div>
    </div>
  )
}
