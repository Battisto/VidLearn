import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import StatusBadge from '../components/ui/StatusBadge'

export default function SummaryPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [showChunks, setShowChunks] = useState(false)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        const fetch = async () => {
            setLoading(true)
            setError(null)
            try {
                const result = await api.videos.getSummary(id)
                setData(result)
            } catch (err) {
                setError(err.message)
            } finally {
                setLoading(false)
            }
        }
        fetch()
    }, [id])

    const handleCopy = () => {
        if (!data?.summary) return
        navigator.clipboard.writeText(data.summary).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    if (loading) return (
        <PageShell>
            <div style={{ textAlign: 'center', color: '#64748b' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                Loading summary...
            </div>
        </PageShell>
    )

    if (error) return (
        <PageShell>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
                <p style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</p>
                <button onClick={() => navigate('/videos')} style={backBtn}>← Back to Videos</button>
            </div>
        </PageShell>
    )

    if (!data?.summary) return (
        <PageShell>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
                <h2 style={{ color: '#e2e8f0', marginBottom: '0.5rem' }}>No Summary Yet</h2>
                <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>Run AI summarization on this video first.</p>
                <button onClick={() => navigate('/videos')} style={backBtn}>← Back to Videos</button>
            </div>
        </PageShell>
    )

    const meta = data.summary_metadata

    const providerBadge = meta?.provider === 'gemini'
        ? { label: '✨ Gemini 1.5 Flash', color: '#4285f4', bg: 'rgba(66,133,244,0.12)' }
        : { label: '🤗 BART Large CNN', color: '#ff6b35', bg: 'rgba(255,107,53,0.12)' }

    return (
        <div style={{ minHeight: '100vh', padding: '90px 2rem 60px' }}>
            <div style={{ maxWidth: 860, margin: '0 auto' }}>

                {/* Header */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <button onClick={() => navigate('/videos')} style={backBtn}>← Videos</button>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#e2e8f0', margin: '0.75rem 0 0.25rem' }}>
                        📋 {data.title}
                    </h1>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <StatusBadge status={data.status} />
                        {meta && (
                            <>
                                <span style={{
                                    padding: '3px 12px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700,
                                    background: providerBadge.bg, color: providerBadge.color,
                                    border: `1px solid ${providerBadge.color}33`,
                                }}>{providerBadge.label}</span>
                                <Chip>📝 {meta.summary_word_count} words</Chip>
                                <Chip>🧩 {meta.chunk_count} chunks merged</Chip>
                                <Chip>📖 {meta.input_word_count?.toLocaleString()} input words</Chip>
                            </>
                        )}
                    </div>
                </div>

                {/* Compression ratio bar */}
                {meta && meta.input_word_count > 0 && (
                    <div style={{
                        padding: '1rem 1.25rem', borderRadius: 12, marginBottom: '1.5rem',
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>
                                🗜️ Compression Ratio
                            </span>
                            <span style={{ color: '#ec4899', fontSize: '0.85rem', fontWeight: 700 }}>
                                {(meta.input_word_count / meta.summary_word_count).toFixed(1)}× compression
                                {' '}({((1 - meta.summary_word_count / meta.input_word_count) * 100).toFixed(0)}% reduced)
                            </span>
                        </div>
                        <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                            <div style={{
                                height: '100%', borderRadius: 999,
                                background: 'linear-gradient(90deg, #ec4899, #a855f7)',
                                width: `${Math.min(100, (meta.summary_word_count / meta.input_word_count) * 100)}%`,
                                transition: 'width 0.8s ease',
                            }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                            <span style={{ color: '#64748b', fontSize: '0.7rem' }}>Summary ({meta.summary_word_count} words)</span>
                            <span style={{ color: '#64748b', fontSize: '0.7rem' }}>Original ({meta.input_word_count?.toLocaleString()} words)</span>
                        </div>
                    </div>
                )}

                {/* Copy button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                    <button onClick={handleCopy} style={{
                        padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                        background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`,
                        color: copied ? '#4ade80' : '#94a3b8', fontSize: '0.875rem', fontWeight: 600,
                    }}>{copied ? '✅ Copied!' : '📋 Copy Summary'}</button>
                </div>

                {/* Main summary */}
                <div style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(236,72,153,0.15)',
                    borderRadius: 16, padding: '2rem',
                    marginBottom: '1.5rem',
                    boxShadow: '0 0 40px rgba(236,72,153,0.04)',
                }}>
                    {/* Decorative top accent */}
                    <div style={{
                        height: 3, borderRadius: 999, marginBottom: '1.5rem',
                        background: 'linear-gradient(90deg, #ec4899, #a855f7, #6c63ff)',
                    }} />
                    <p style={{
                        color: '#e2e8f0', lineHeight: 1.9, fontSize: '1rem',
                        fontFamily: 'inherit', whiteSpace: 'pre-wrap',
                    }}>
                        {data.summary}
                    </p>
                </div>

                {/* Chunk summaries (collapsible) */}
                {data.chunk_summaries?.length > 0 && (
                    <div>
                        <button
                            onClick={() => setShowChunks(v => !v)}
                            style={{
                                padding: '8px 18px', borderRadius: 8, cursor: 'pointer', border: 'none',
                                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                color: '#94a3b8', fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem',
                            }}
                        >
                            {showChunks ? '▲' : '▼'} {showChunks ? 'Hide' : 'Show'} Chunk Summaries ({data.chunk_summaries.length})
                        </button>

                        {showChunks && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {data.chunk_summaries.map((s, i) => (
                                    <div key={i} style={{
                                        padding: '1rem 1.25rem', borderRadius: 12,
                                        background: 'rgba(255,255,255,0.02)',
                                        border: '1px solid rgba(255,255,255,0.07)',
                                    }}>
                                        <div style={{ color: '#a855f7', fontWeight: 700, fontSize: '0.78rem', marginBottom: 6 }}>
                                            CHUNK {i + 1}
                                        </div>
                                        <p style={{ color: '#94a3b8', lineHeight: 1.75, fontSize: '0.9rem' }}>{s}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

function PageShell({ children }) {
    return (
        <div style={{
            minHeight: '100vh', padding: '90px 2rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{children}</div>
    )
}

function Chip({ children }) {
    return (
        <span style={{
            padding: '3px 10px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8',
        }}>{children}</span>
    )
}

const backBtn = {
    padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#94a3b8', fontSize: '0.875rem', fontWeight: 600,
}
