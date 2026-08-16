import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import PasswordGate from './components/PasswordGate'
import './index.css'
import 'maplibre-gl/dist/maplibre-gl.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PasswordGate>
      <App />
    </PasswordGate>
  </React.StrictMode>,
)
