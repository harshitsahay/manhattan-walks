import { useState } from 'react'
import { Lock } from 'lucide-react'

/* Set VITE_APP_PASSWORD in .env (git-ignored) to show the gate.
   Left unset, the app opens straight away.
   NOTE: this is a speed bump, not security. Anything in the browser bundle is
   public. The real lock on the data is the API token in worker/index.js. */
const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD || ''
const STORAGE_KEY = 'manhattan_walks_unlocked'

export default function PasswordGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => {
    if (!APP_PASSWORD) return true
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  if (unlocked) return children

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
