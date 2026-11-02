import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Disable automatic browser scroll restoration and lock window scroll to (0, 0)
// This prevents mobile browsers (Chrome Android, Mobile Safari) from scrolling the window
// and pushing fixed/flex headers out of the viewport when address bars collapse or content shifts.
if (typeof window !== 'undefined') {
  if ('scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'manual';
  }
  const resetScroll = () => {
    if (window.scrollY !== 0 || window.scrollX !== 0) {
      window.scrollTo(0, 0);
    }
  };
  resetScroll();
  window.addEventListener('scroll', resetScroll, { passive: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
