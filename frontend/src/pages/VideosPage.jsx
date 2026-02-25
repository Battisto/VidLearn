import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import VideoCard from '../components/VideoCard'

export default function VideosPage() {
    const navigate = useNavigate()
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [page, setPage] = useState(1)
    const [deleting, setDeleting] = useState(null)
    const [confirmDelete, setConfirmDelete] = useState(null)

    const fetchVideos = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await api.videos.list(page, 12)
            setData(result)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }, [page])

    useEffect(() => { fetchVideos() }, [fetchVideos])

    const handleDelete = async (id) => {
        setDeleting(id)
        try {
            await api.videos.delete(id)
            setConfirmDelete(null)
            fetchVideos()
        } catch (err) {
            alert(`Delete failed: ${err.message}`)
        } finally {
            setDeleting(null)
        }
    }

    // Inline update from VideoCard (after audio extraction)
    const handleVideoUpdate = (updatedVideo) => {
        setData(prev => prev ? {
            ...prev,
            videos: prev.videos.map(v => v.id === updatedVideo.id ? updatedVideo : v),
        } : prev)
    }

    const totalPages = data ? Math.ceil(data.total / 12) : 1

    return (
        <div style={{ minHeight: '100vh', padding: '80px 2rem 60px', maxWidth: 1200, margin: '0 auto' }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem',
            }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#e2e8f0', marginBottom: 4 }}>
                        🎬 My Videos
                    </h1>
                    {data && (
                        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
                            {data.total} video{data.total !== 1 ? 's' : ''} — click{' '}
                            <span style={{ color: '#a78bfa' }}>🎵 Extract Audio</span> to begin processing
                        </p>
                    )}
                </div>
                <button onClick={() => navigate('/upload')} style={primaryBtn}>📤 Upload New</button>
            </div>

            {/* Loading */}
            {loading && (
                <div style={{ textAlign: 'center', padding: '5rem', color: '#64748b' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏳</div>
                    Loading videos...
                </div>
            )}

            {/* Error */}
            {error && (
                <div style={{ textAlign: 'center', padding: '4rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
                    <p style={{ color: '#f87171', marginBottom: '0.5rem' }}>{error}</p>
                    <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Is the backend running at port 8000?</p>
                    <button onClick={fetchVideos} style={{ ...primaryBtn, marginTop: '1.25rem' }}>🔄 Retry</button>
                </div>
            )}

            {/* Empty */}
            {!loading && !error && data?.videos.length === 0 && (
                <div style={{ textAlign: 'center', padding: '5rem 2rem' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📭</div>
                    <h2 style={{ color: '#e2e8f0', marginBottom: '0.5rem' }}>No videos yet</h2>
                    <p style={{ color: '#64748b', marginBottom: '2rem' }}>Upload your first educational video to get started.</p>
                    <button onClick={() => navigate('/upload')} style={primaryBtn}>📤 Upload Now</button>
                </div>
            )}

            {/* Grid */}
            {!loading && !error && data?.videos.length > 0 && (
                <>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                        gap: '1.25rem', marginBottom: '2rem',
                    }}>
                        {data.videos.map((video) => (
                            <VideoCard
                                key={video.id}
                                video={video}
                                onDelete={(v) => setConfirmDelete(v)}
                                onUpdate={handleVideoUpdate}
                            />
                        ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <PagBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</PagBtn>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                <PagBtn key={p} onClick={() => setPage(p)} active={p === page}>{p}</PagBtn>
                            ))}
                            <PagBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</PagBtn>
                        </div>
                    )}
                </>
            )}

            {/* Delete confirmation */}
            {confirmDelete && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 200,
                    background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
                }}>
                    <div style={{
                        background: '#1a1a2e', border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 16, padding: '2rem', maxWidth: 400, width: '100%', textAlign: 'center',
                    }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🗑️</div>
                        <h3 style={{ color: '#e2e8f0', marginBottom: '0.5rem' }}>Delete Video?</h3>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                            "{confirmDelete.title}" and its audio file will be permanently deleted.
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                            <button onClick={() => setConfirmDelete(null)} style={secondaryBtn}>Cancel</button>
                            <button
                                onClick={() => handleDelete(confirmDelete.id)}
                                disabled={!!deleting}
                                style={{
                                    padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                    background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                                    color: '#fff', fontWeight: 700, opacity: deleting ? 0.5 : 1,
                                }}
                            >
                                {deleting ? '...' : '🗑️ Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function PagBtn({ children, onClick, disabled, active }) {
    return (
        <button onClick={onClick} disabled={disabled} style={{
            padding: '8px 14px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
            background: active ? 'rgba(108,99,255,0.25)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${active ? 'rgba(108,99,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
            color: active ? '#a78bfa' : '#94a3b8', fontSize: '0.875rem',
            opacity: disabled ? 0.4 : 1, transition: 'all 0.15s',
        }}>{children}</button>
    )
}

const primaryBtn = {
    padding: '10px 22px', borderRadius: 10, border: 'none',
    background: 'linear-gradient(135deg, #6c63ff, #a855f7)',
    color: '#fff', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
}
const secondaryBtn = {
    padding: '10px 22px', borderRadius: 8, cursor: 'pointer',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600,
}
