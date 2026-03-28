import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import StatusBadge from '../components/ui/StatusBadge'

export default function TranscriptPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [activeTab, setActiveTab] = useState('text')  // 'text' | 'segments'
    const [copied, setCopied] = useState(false)
    const [lang, setLang] = useState('en')
    const [translating, setTranslating] = useState(false)
    const [translatedText, setTranslatedText] = useState(null)
    const [transError, setTransError] = useState(null)

    useEffect(() => {
        const fetchTranscript = async () => {
            setLoading(true)
            setError(null)
            try {
                const result = await api.videos.getTranscript(id)
                setData(result)
            } catch (err) {
                setError(err.message)
            } finally {
                setLoading(false)
            }
        }
        fetchTranscript()
    }, [id])

    const handleCopy = () => {
        const textToCopy = lang === 'ta' && translatedText ? translatedText : data?.transcript
        if (!textToCopy) return
        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    const toggleLanguage = async () => {
        if (lang === 'en') {
            if (translatedText) {
                setLang('ta')
                return
            }
            // Fetch translation
            setTranslating(true)
            setTransError(null)
            try {
                // Pre-pend 'TRANSCRIPT' prefix to videoId so summary and transcript translations don't collide
                const res = await api.translations.translateText(data.transcript, 'en', 'ta', `trans_${id}`)
                setTranslatedText(res.translated_text)
                setLang('ta')
                setActiveTab('text') // Force text tab since segments won't be translated perfectly
            } catch (err) {
                setTransError('Failed to translate: ' + err.message)
            } finally {
                setTranslating(false)
            }
        } else {
            setLang('en')
        }
    }

    const formatTime = (secs) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0')
        const s = Math.floor(secs % 60).toString().padStart(2, '0')
        return `${m}:${s}`
    }

    if (loading) return (
        <div style={pageStyle}>
            <div style={{ textAlign: 'center', color: '#64748b' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                Loading transcript...
            </div>
        </div>
    )

    if (error) return (
        <div style={pageStyle}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
                <p style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</p>
                <button onClick={() => navigate('/videos')} style={backBtn}>← Back to Videos</button>
            </div>
        </div>
    )

    if (!data?.transcript) return (
        <div style={pageStyle}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
                <h2 style={{ color: '#e2e8f0', marginBottom: '0.5rem' }}>No Transcript Yet</h2>
                <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
                    Run transcription on this video first.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                    <button onClick={() => navigate('/videos')} style={backBtn}>← Back to Videos</button>
                </div>
            </div>
        </div>
    )

    const meta = data.transcript_metadata

    return (
        <div style={{ ...pageStyle, alignItems: 'flex-start' }}>
            <div style={{ maxWidth: 900, width: '100%' }}>
                {/* Header */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <button onClick={() => navigate('/videos')} style={backBtn}>← Videos</button>
                    <h1 style={{
                        fontSize: '1.8rem', fontWeight: 800, color: '#e2e8f0',
                        margin: '0.75rem 0 0.25rem',
                    }}>{data.title}</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <StatusBadge status={data.status} />
                        {meta && (
                            <>
                                <Chip>🌐 {meta.language?.toUpperCase() || '?'}</Chip>
                                <Chip>🤖 Whisper {meta.whisper_model}</Chip>
                                <Chip>📝 {meta.word_count?.toLocaleString()} words</Chip>
                                {meta.duration_seconds && (
                                    <Chip>⏱️ {Math.floor(meta.duration_seconds / 60)}m {Math.floor(meta.duration_seconds % 60)}s</Chip>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Tab switcher */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    {['text', 'segments'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
                                background: activeTab === tab ? 'rgba(108,99,255,0.2)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${activeTab === tab ? 'rgba(108,99,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                color: activeTab === tab ? '#a78bfa' : '#94a3b8',
                                fontWeight: 600, fontSize: '0.875rem', textTransform: 'capitalize',
                            }}
                        >
                            {tab === 'text' ? '📄 Full Text' : '🕐 Timed Segments'}
                        </button>
                    ))}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {transError && <span style={{ color: '#f87171', fontSize: '0.8rem' }}>{transError}</span>}
                        <button
                            onClick={toggleLanguage}
                            disabled={translating}
                            style={{
                                padding: '8px 16px', borderRadius: 8, cursor: translating ? 'wait' : 'pointer',
                                background: lang === 'ta' ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${lang === 'ta' ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.1)'}`,
                                color: lang === 'ta' ? '#c4b5fd' : '#94a3b8', fontSize: '0.875rem', fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                            }}
                        >
                            {translating ? '⏳ Translating...' : lang === 'ta' ? '🌐 View original (EN)' : '🌐 Translate to Tamil'}
                        </button>
                        <button onClick={handleCopy} style={{
                            ...backBtn,
                            background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`,
                            color: copied ? '#4ade80' : '#94a3b8',
                        }}>
                            {copied ? '✅ Copied!' : '📋 Copy'}
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 16, padding: '1.5rem',
                    minHeight: 400,
                }}>
                    {activeTab === 'text' && (
                        <p style={{
                            color: '#cbd5e1', lineHeight: 1.85, fontSize: '0.95rem',
                            whiteSpace: 'pre-wrap', fontFamily: 'inherit',
                        }}>
                            {lang === 'ta' ? translatedText : data.transcript}
                        </p>
                    )}

                    {activeTab === 'segments' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {data.segments?.length ? data.segments.map((seg) => (
                                <div key={seg.id} style={{
                                    display: 'flex', gap: '1rem', alignItems: 'flex-start',
                                    padding: '0.6rem 0.75rem', borderRadius: 8,
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    transition: 'background 0.15s',
                                }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(108,99,255,0.08)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                >
                                    <span style={{
                                        fontFamily: 'monospace', fontSize: '0.75rem',
                                        color: '#6c63ff', fontWeight: 700, whiteSpace: 'nowrap',
                                        paddingTop: 2,
                                    }}>
                                        {formatTime(seg.start)} → {formatTime(seg.end)}
                                    </span>
                                    <span style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.6 }}>
                                        {seg.text}
                                    </span>
                                </div>
                            )) : (
                                <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
                                    No timed segments available.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function Chip({ children }) {
    return (
        <span style={{
            padding: '3px 10px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#94a3b8',
        }}>{children}</span>
    )
}

const pageStyle = {
    minHeight: '100vh', padding: '90px 2rem 60px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const backBtn = {
    padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#94a3b8', fontSize: '0.875rem', fontWeight: 600,
}
