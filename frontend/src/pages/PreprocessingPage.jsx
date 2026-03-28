import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import StatusBadge from '../components/ui/StatusBadge'

export default function PreprocessingPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [activeTab, setActiveTab] = useState('cleaned')  // 'cleaned' | 'chunks'
    const [activeChunk, setActiveChunk] = useState(0)

    useEffect(() => {
        const fetch = async () => {
            setLoading(true)
            setError(null)
            try {
                const result = await api.videos.getPreprocessing(id)
                setData(result)
            } catch (err) {
                setError(err.message)
            } finally {
                setLoading(false)
            }
        }
        fetch()
    }, [id])

    if (loading) return (
        <PageShell>
            <div style={{ textAlign: 'center', color: '#64748b' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                Loading preprocessing result...
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

    if (!data?.cleaned_transcript) return (
        <PageShell>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔧</div>
                <h2 style={{ color: '#e2e8f0', marginBottom: '0.5rem' }}>Not Yet Preprocessed</h2>
                <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>Run preprocessing on this video first.</p>
                <button onClick={() => navigate('/videos')} style={backBtn}>← Back to Videos</button>
            </div>
        </PageShell>
    )

    const meta = data.preprocessing_metadata
    const chunks = data.chunks || []
    const chunk = chunks[activeChunk]

    return (
        <div style={{ minHeight: '100vh', padding: '90px 2rem 60px' }}>
            <div style={{ maxWidth: 1000, margin: '0 auto' }}>

                {/* Header */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <button onClick={() => navigate('/videos')} style={backBtn}>← Videos</button>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#e2e8f0', margin: '0.75rem 0 0.25rem' }}>
                        🔧 {data.title}
                    </h1>
                    <StatusBadge status={data.status} />
                </div>

                {/* Stats row */}
                {meta && (
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: '0.75rem', marginBottom: '1.5rem',
                    }}>
                        <StatCard icon="✂️" label="Noise Removed" value={meta.noise_removed_count} color="#ef4444" />
                        <StatCard icon="📝" label="Original Words" value={meta.original_word_count?.toLocaleString()} color="#64748b" />
                        <StatCard icon="✨" label="Cleaned Words" value={meta.cleaned_word_count?.toLocaleString()} color="#22c55e" />
                        <StatCard icon="🧩" label="Chunks" value={meta.chunk_count} color="#06b6d4" />
                        <StatCard icon="🎯" label="Chunk Size" value={`${meta.chunk_size_tokens} tokens`} color="#a855f7" />
                        <StatCard icon="🔗" label="Overlap" value={`${meta.chunk_overlap_tokens} tokens`} color="#f59e0b" />
                    </div>
                )}

                {/* Noise reduction bar */}
                {meta && (
                    <div style={{
                        padding: '1rem 1.25rem', borderRadius: 12, marginBottom: '1.5rem',
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>
                                📊 Text Reduction
                            </span>
                            <span style={{ color: '#22c55e', fontSize: '0.85rem', fontWeight: 700 }}>
                                {meta.original_word_count > 0
                                    ? `${(((meta.original_word_count - meta.cleaned_word_count) / meta.original_word_count) * 100).toFixed(1)}% noise reduced`
                                    : '—'}
                            </span>
                        </div>
                        <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                            <div style={{
                                height: '100%', borderRadius: 999,
                                background: 'linear-gradient(90deg, #22c55e, #06b6d4)',
                                width: meta.original_word_count > 0
                                    ? `${(meta.cleaned_word_count / meta.original_word_count) * 100}%`
                                    : '100%',
                                transition: 'width 0.8s ease',
                            }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                            <span style={{ color: '#64748b', fontSize: '0.7rem' }}>0</span>
                            <span style={{ color: '#64748b', fontSize: '0.7rem' }}>{meta.original_word_count?.toLocaleString()} words (original)</span>
                        </div>
                    </div>
                )}

                {/* Tab switcher */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                    {[['cleaned', '✨ Cleaned Text'], ['chunks', `🧩 Chunks (${chunks.length})`]].map(([tab, label]) => (
                        <button key={tab} onClick={() => setActiveTab(tab)} style={{
                            padding: '8px 18px', borderRadius: 8, cursor: 'pointer',
                            background: activeTab === tab ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${activeTab === tab ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.1)'}`,
                            color: activeTab === tab ? '#22d3ee' : '#94a3b8',
                            fontWeight: 600, fontSize: '0.875rem',
                        }}>{label}</button>
                    ))}
                </div>

                {/* Content */}
                {activeTab === 'cleaned' && (
                    <div style={{
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 16, padding: '1.5rem',
                    }}>
                        <p style={{
                            color: '#cbd5e1', lineHeight: 1.85, fontSize: '0.95rem',
                            whiteSpace: 'pre-wrap', fontFamily: 'inherit',
                        }}>
                            {data.cleaned_transcript}
                        </p>
                    </div>
                )}

                {activeTab === 'chunks' && chunks.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1rem' }}>
                        {/* Chunk list */}
                        <div style={{
                            display: 'flex', flexDirection: 'column', gap: '0.4rem',
                            maxHeight: '70vh', overflowY: 'auto',
                        }}>
                            {chunks.map((c, i) => (
                                <button
                                    key={i} onClick={() => setActiveChunk(i)}
                                    style={{
                                        padding: '10px 12px', textAlign: 'left', borderRadius: 8,
                                        background: activeChunk === i ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.04)',
                                        border: `1px solid ${activeChunk === i ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.06)'}`,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <div style={{ color: activeChunk === i ? '#22d3ee' : '#94a3b8', fontWeight: 700, fontSize: '0.8rem' }}>
                                        Chunk {i + 1}
                                    </div>
                                    <div style={{ color: '#475569', fontSize: '0.7rem', marginTop: 2 }}>
                                        {c.word_count} words
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* Active chunk content */}
                        {chunk && (
                            <div style={{
                                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(6,182,212,0.15)',
                                borderRadius: 16, padding: '1.5rem',
                            }}>
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                                    <Chip>{chunk.word_count} words</Chip>
                                    <Chip>{chunk.char_count} chars</Chip>
                                    <Chip>words {chunk.start_word}–{chunk.end_word}</Chip>
                                </div>
                                <p style={{
                                    color: '#cbd5e1', lineHeight: 1.85, fontSize: '0.93rem',
                                    whiteSpace: 'pre-wrap',
                                }}>
                                    {chunk.text}
                                </p>
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
        <div style={{ minHeight: '100vh', padding: '90px 2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {children}
        </div>
    )
}

function StatCard({ icon, label, value, color }) {
    return (
        <div style={{
            padding: '1rem', borderRadius: 12, textAlign: 'center',
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>{icon}</div>
            <div style={{ color, fontWeight: 800, fontSize: '1.15rem', marginBottom: 2 }}>{value ?? '—'}</div>
            <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600 }}>{label}</div>
        </div>
    )
}

function Chip({ children }) {
    return (
        <span style={{
            padding: '3px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600,
            background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', color: '#22d3ee',
        }}>{children}</span>
    )
}

const backBtn = {
    padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#94a3b8', fontSize: '0.875rem', fontWeight: 600,
}
