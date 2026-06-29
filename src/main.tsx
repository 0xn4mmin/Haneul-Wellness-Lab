import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import Intro from './pages/Intro'
import Portal from './pages/Portal'

registerSW({ immediate: true })

const router = createBrowserRouter([
  { path: '/', element: <Intro /> },
  { path: '/portal', element: <Portal /> },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
    <Analytics />
  </React.StrictMode>,
)
