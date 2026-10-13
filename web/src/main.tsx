import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startThemeSync } from './hooks/useTheme'
import './ui.css'
startThemeSync()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
