import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { TagDefinitionsProvider } from './context/TagDefinitionsContext.tsx'

// Disable automatic browser scroll restoration to ensure precise virtualizer positioning on refresh
if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TagDefinitionsProvider>
      <App />
    </TagDefinitionsProvider>
  </StrictMode>,
)
