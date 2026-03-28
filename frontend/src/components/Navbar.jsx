import { useContext } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'

export default function Navbar() {
    const location = useLocation()
    const { user, logout } = useContext(AuthContext)

    // Dynamic Navigation Links
    const getNavLinks = () => {
        if (!user) return [] // Only sign up and login for navigation as requested
        
        return [
            { to: '/', label: '📊 Dashboard' },
            { to: '/upload', label: '📤 Upload' },
            { to: '/videos', label: '🎬 Videos' },
        ]
    }

    const navLinks = getNavLinks()

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

            {/* Links and Auth */}
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                {navLinks.map(({ to, label }) => {
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
                        >
                            {label}
                        </Link>
                    )
                })}

                {/* Vertical Divider - only show if there are nav links and auth buttons */}
                {navLinks.length > 0 && (
                    <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)', margin: '0 10px' }} />
                )}

                {user ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <span style={{ color: '#e2e8f0', fontSize: '0.875rem', fontWeight: 600 }}>
                            👋 {user.full_name?.split(' ')[0] || user.email?.split('@')[0]}
                        </span>
                        <button 
                            onClick={logout}
                            style={{
                                padding: '6px 14px', borderRadius: 8,
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                color: '#f87171', fontSize: '0.875rem', fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onMouseOver={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.2)'}
                            onMouseOut={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.1)'}
                        >
                            Logout
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <Link to="/login" style={{
                            textDecoration: 'none', color: '#94a3b8', fontSize: '0.875rem', fontWeight: 600,
                            padding: '6px 14px', transition: 'color 0.2s'
                        }}
                        onMouseOver={(e) => e.target.style.color = '#fff'}
                        onMouseOut={(e) => e.target.style.color = '#94a3b8'}
                        >
                            Login
                        </Link>
                        <Link to="/register" style={{
                            textDecoration: 'none', color: '#fff', fontSize: '0.875rem', fontWeight: 600,
                            padding: '6px 16px', borderRadius: 10, 
                            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                            transition: 'transform 0.2s, box-shadow 0.2s'
                        }}
                        onMouseOver={(e) => { e.target.style.transform = 'translateY(-1px)'; e.target.style.boxShadow = '0 6px 16px rgba(99, 102, 241, 0.4)' }}
                        onMouseOut={(e) => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.3)' }}
                        >
                            Sign Up
                        </Link>
                    </div>
                )}
            </div>
        </nav>
    )
}
