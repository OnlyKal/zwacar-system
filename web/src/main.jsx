import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: { borderRadius: 6, background: '#16140f', color: '#fff', fontSize: 13.5, padding: '12px 16px' },
            success: { iconTheme: { primary: '#c9b26a', secondary: '#16140f' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
)
