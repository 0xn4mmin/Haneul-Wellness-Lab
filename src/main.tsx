import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import Intro from './pages/Intro'
import Portal from './pages/Portal'

const router = createBrowserRouter([
  { path: '/', element: <Intro /> },
  { path: '/portal', element: <Portal /> },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
