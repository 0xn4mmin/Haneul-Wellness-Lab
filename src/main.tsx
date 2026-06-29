import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import Intro from './pages/Intro'
import Portal from './pages/Portal'

// In the web/PWA build register the service worker; inside the Capacitor
// native shell the assets are already bundled locally, and the SW's
// navigateFallback would fight the SPA router — so skip it there.
const isNative = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
if (!isNative) registerSW({ immediate: true })

const router = createBrowserRouter([
  { path: '/', element: <Intro /> },
  { path: '/portal', element: <Portal /> },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
