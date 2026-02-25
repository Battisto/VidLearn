import { Link, useLocation } from 'react-router-dom'

const NAV_LINKS = [
    { to: '/', label: '🏠 Home' },
    { to: '/upload', label: '📤 Upload' },
    { to: '/videos', label: '🎬 Videos' },
]

export default function Navbar() {
    const location = useLocation()

    return (
        <nav style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 2rem', height: 60,
            background: 'rgba(15,15,26,0.85)',
            backdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
            {/* Logo */}
            <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.4rem' }}>🎓</span>
                <span style={{
                    fontWeight: 800, fontSize: '1.1rem',
                    background: 'linear-gradient(90deg, #6c63ff, #f59e0b)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>VidLearn</span>
            </Link>

            {/* Links */}
            <div style={{ display: 'flex', gap: '0.25rem' }}>
                {NAV_LINKS.map(({ to, label }) => {
                    const active = location.pathname === to
                    return (
                        <Link key={to} to={to} style={{
                            textDecoration: 'none',
                            padding: '6px 14px', borderRadius: 8,
                            fontSize: '0.875rem', fontWeight: 500,
                            color: active ? '#fff' : '#94a3b8',
                            background: active ? 'rgba(108,99,255,0.2)' : 'transparent',
                            border: active ? '1px solid rgba(108,99,255,0.35)' : '1px solid transparent',
                            transition: 'all 0.15s ease',
                        }}
                            onMouseEnter={e => { if (!active) e.target.style.color = '#e2e8f0' }}
                            onMouseLeave={e => { if (!active) e.target.style.color = '#94a3b8' }}
                        >
                            {label}
                        </Link>
                    )
                })}
            </div>
        </nav>
    )
}
