// First, so the terrain starts building while everything else downloads.
import './world/terrainJob'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/big-shoulders-display'
import '@fontsource-variable/overpass'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(<App />)
