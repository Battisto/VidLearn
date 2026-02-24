import { useState } from 'react'
import './index.css'

const APP_NAME = import.meta.env.VITE_APP_NAME || 'VidLearn'

function App() {
  const [apiStatus, setApiStatus] = useState(null)

  const checkHealth = async () => {
    try {
      const res = await fetch('/api/health')
      const data = await res.json()
      setApiStatus({ ok: true, data })
    } catch {
      setApiStatus({ ok: false, data: null })
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '2rem',
      padding: '2rem',
      background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: '4rem',
          marginBottom: '0.5rem',
          filter: 'drop-shadow(0 0 20px rgba(108,99,255,0.6))',
        }}>🎓</div>
        <h1 style={{
          fontSize: '3rem',
          fontWeight: 800,
          background: 'linear-gradient(90deg, #6c63ff, #f59e0b)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: '-0.02em',
        }}>{APP_NAME}</h1>
        <p style={{ color: '#94a3b8', fontSize: '1.1rem', marginTop: '0.5rem' }}>
          AI-powered video learning platform
        </p>
      </div>

      {/* Status badge */}
      <div style={{
        background: 'rgba(108,99,255,0.1)',
        border: '1px solid rgba(108,99,255,0.3)',
        borderRadius: '12px',
        padding: '1.5rem 2.5rem',
        textAlign: 'center',
        backdropFilter: 'blur(10px)',
      }}>
        <p style={{ color: '#94a3b8', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Phase 1 — Project Setup Complete ✅
        </p>
        <button
          onClick={checkHealth}
          style={{
            background: 'linear-gradient(90deg, #6c63ff, #574fd6)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '0.75rem 2rem',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={e => {
            e.target.style.transform = 'translateY(-2px)'
            e.target.style.boxShadow = '0 8px 20px rgba(108,99,255,0.4)'
          }}
          onMouseLeave={e => {
            e.target.style.transform = 'translateY(0)'
            e.target.style.boxShadow = 'none'
          }}
        >
          🔗 Ping Backend API
        </button>

        {apiStatus && (
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            background: apiStatus.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${apiStatus.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: apiStatus.ok ? '#4ade80' : '#f87171',
            fontSize: '0.875rem',
          }}>
            {apiStatus.ok
              ? `✅ Backend online — ${apiStatus.data?.app} [${apiStatus.data?.env}]`
              : '❌ Backend offline — start the FastAPI server'}
          </div>
        )}
      </div>

      {/* Tech stack chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
        {['React + Vite', 'Tailwind CSS', 'FastAPI', 'MongoDB', 'Whisper', 'BART', 'Gemini API'].map(tech => (
          <span key={tech} style={{
            padding: '0.35rem 0.9rem',
            borderRadius: '999px',
            fontSize: '0.8rem',
            fontWeight: 500,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#cbd5e1',
          }}>{tech}</span>
        ))}
      </div>
    </div>
  )
}

export default App
