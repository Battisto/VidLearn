import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import StatusBadge from '../components/ui/StatusBadge'
import { formatFileSize, formatDate } from '../utils/helpers'

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

    const totalPages = data ? Math.ceil(data.total / 12) : 1

    return (
        <div style={{ paddingTop: 80, minHeight: '100vh', padding: '80px 2rem 60px', maxWidth: 1200, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#e2e8f0', marginBottom: 4 }}>🎬 My Videos</h1>
                    {data && <p style={{ color: '#64748b', fontSize: '0.9rem' }}>{data.total} video{data.total !== 1 ? 's' : ''} uploaded</p>}
                </div>
                <button onClick={() => navigate('/upload')} style={primaryBtn}>📤 Upload New Video</button>
            </div>

            {/* Loading */}
            {loading && (
                <div style={{ textAlign: 'center', padding: '4rem', color: '#64748b' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '1rem', animation: 'spin 1s linear infinite' }}>⏳</div>
                    Loading videos...
                </div>
            )}

            {/* Error */}
            {error && (
                <div style={{ textAlign: 'center', padding: '4rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
                    <p style={{ color: '#f87171', marginBottom: '0.5rem' }}>{error}</p>
                    <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Is the backend running at port 8000?</p>
                    <button onClick={fetchVideos} style={{ ...primaryBtn, marginTop: '1rem' }}>🔄 Retry</button>
                </div>
            )}

            {/* Empty state */}
            {!loading && !error && data?.videos.length === 0 && (
                <div style={{ textAlign: 'center', padding: '5rem 2rem' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📭</div>
                    <h2 style={{ color: '#e2e8f0', marginBottom: '0.5rem' }}>No videos yet</h2>
                    <p style={{ color: '#64748b', marginBottom: '2rem' }}>Upload your first educational video to get started.</p>
                    <button onClick={() => navigate('/upload')} style={primaryBtn}>📤 Upload Now</button>
                </div>
            )}

            {/* Videos grid */}
            {!loading && !error && data?.videos.length > 0 && (
                <>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                        gap: '1.25rem',
                        marginBottom: '2rem',
                    }}>
                        {data.videos.map((video) => (
                            <VideoCard
                                key={video.id}
                                video={video}
                                onDelete={() => setConfirmDelete(video)}
                                deleting={deleting === video.id}
                            />
                        ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                style={{ ...pageBtn, opacity: page === 1 ? 0.4 : 1 }}
                            >
                                ← Prev
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                <button
                                    key={p}
                                    onClick={() => setPage(p)}
                                    style={{
                                        ...pageBtn,
                                        background: p === page ? 'rgba(108,99,255,0.3)' : 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${p === page ? 'rgba(108,99,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                        color: p === page ? '#a78bfa' : '#94a3b8',
                                    }}
                                >
                                    {p}
                                </button>
                            ))}
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                style={{ ...pageBtn, opacity: page === totalPages ? 0.4 : 1 }}
                            >
                                Next →
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Delete confirmation modal */}
            {confirmDelete && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 200,
                    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
                }}>
                    <div style={{
                        background: '#1a1a2e', border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 16, padding: '2rem', maxWidth: 420, width: '100%',
                        textAlign: 'center',
                    }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🗑️</div>
                        <h3 style={{ color: '#e2e8f0', marginBottom: '0.5rem' }}>Delete Video?</h3>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                            "{confirmDelete.title}" will be permanently deleted from storage and database.
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                            <button
                                onClick={() => setConfirmDelete(null)}
                                style={secondaryBtn}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDelete(confirmDelete.id)}
                                disabled={!!deleting}
                                style={{
                                    padding: '10px 24px', borderRadius: 8, border: 'none',
                                    background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                                    color: '#fff', fontWeight: 700, cursor: 'pointer',
                                    opacity: deleting ? 0.6 : 1,
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

function VideoCard({ video, onDelete, deleting }) {
    const ext = video.metadata?.file_extension?.toUpperCase() || 'VIDEO'
    const size = video.metadata?.file_size_bytes ? formatFileSize(video.metadata.file_size_bytes) : '—'

    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 16, padding: '1.5rem',
            display: 'flex', flexDirection: 'column', gap: '0.75rem',
            transition: 'border-color 0.2s, transform 0.2s',
        }}
            onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(108,99,255,0.3)'
                e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
                e.currentTarget.style.transform = 'translateY(0)'
            }}
        >
            {/* Video thumb placeholder */}
            <div style={{
                width: '100%', aspectRatio: '16/9', borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(168,85,247,0.1))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '3rem', border: '1px solid rgba(255,255,255,0.06)',
            }}>
                🎬
            </div>

            {/* Info */}
            <div>
                <h3 style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '1rem', marginBottom: 4, lineClamp: 2 }}>
                    {video.title}
                </h3>
                {video.description && (
                    <p style={{
                        color: '#64748b', fontSize: '0.8rem', lineHeight: 1.5, overflow: 'hidden',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
                    }}>
                        {video.description}
                    </p>
                )}
            </div>

            {/* Meta row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                <StatusBadge status={video.status} />
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Chip>{ext}</Chip>
                    <Chip>{size}</Chip>
                </div>
            </div>

            <p style={{ color: '#475569', fontSize: '0.75rem' }}>
                📅 {formatDate(video.created_at)}
            </p>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button
                    onClick={onDelete}
                    disabled={deleting}
                    style={{
                        flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                        color: '#f87171', fontSize: '0.8rem', fontWeight: 600,
                        opacity: deleting ? 0.5 : 1,
                    }}
                >
                    {deleting ? '...' : '🗑️ Delete'}
                </button>
            </div>
        </div>
    )
}

function Chip({ children }) {
    return (
        <span style={{
            padding: '2px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#64748b',
        }}>{children}</span>
    )
}

// ── Styles ─────────────────────────────────────────────────────────────────────
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
const pageBtn = {
    padding: '8px 14px', borderRadius: 8, cursor: 'pointer', border: 'none',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#94a3b8', fontSize: '0.875rem',
}
