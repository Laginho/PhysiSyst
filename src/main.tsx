import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// A failed chunk fetch (network drop, deploy swapped the hash) stays in the
// module map, so re-importing rejects again without touching the network;
// only a reload recovers (CLEAN-01). At most one reload per 10 s: a chunk
// that keeps failing falls through to the error panel instead of looping.
window.addEventListener('vite:preloadError', () => {
  try {
    const last = Number(sessionStorage.getItem('preloadReloadAt'))
    if (Date.now() - last < 10_000) return
    sessionStorage.setItem('preloadReloadAt', String(Date.now()))
  } catch {
    return
  }
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
