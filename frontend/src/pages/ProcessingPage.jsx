import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../services/api'

const STAGES = [
    { label: 'Extracting Audio', icon: '🎵', desc: 'Separating audio from video with FFmpeg' },
    { label: 'Transcribing', icon: '🎙️', desc: 'Converting speech to text with Whisper AI' },
    { label: 'Preprocessing', icon: '🔧', desc: 'Cleaning and chunking transcript for AI' },
]

function statusToCompletedIdx(status) {
    const map = {
        uploaded: -1,
        extracting_audio: 0,
        audio_ready: 0,
        transcribing: 1,
        transcript_ready: 1,
        preprocessing: 2,
        preprocessed: 3,  // all 3 done
        summarizing: 3,
        summarized: 3,
        failed: -2,
    }
    return map[status?.toLowerCase()] ?? -1
}

function statusToActiveIdx(status) {
    const map = {
        extracting_audio: 0,
        transcribing: 1,
        preprocessing: 2,
        summarizing: -1,  // summarization shown separately
    }
    return map[status?.toLowerCase()] ?? -1
}

export default function ProcessingPage() {
    const { id } = useParams()
    const navigate = useNavigate()

    const [status, setStatus] = useState(null)
    const [transcript, setTranscript] = useState(null)
    const [error, setError] = useState(null)
    const [summarizing, setSummarizing] = useState(false)
    const [summError, setSummError] = useState(null)
    const [dots, setDots] = useState('')
    const [expanded, setExpanded] = useState(false)
    const [selectedLevel, setSelectedLevel] = useState('standard')

    const LEVELS = [
        { id: 'brief', icon: '📌', label: 'Brief', desc: '3–5 sentence overview' },
        { id: 'standard', icon: '📝', label: 'Standard', desc: 'Balanced key points' },
        { id: 'detailed', icon: '📖', label: 'Detailed', desc: 'Examples & explanations' },
        { id: 'comprehensive', icon: '🌟', label: 'Comprehensive', desc: 'Structured full report' },
    ]

    const pollRef = useRef(null)
    const dotRef = useRef(null)

    // Animated dots
    useEffect(() => {
        dotRef.current = setInterval(() =>
            setDots(d => d.length >= 3 ? '' : d + '.'), 500)
        return () => clearInterval(dotRef.current)
    }, [])

    // Poll process-status every 3 s
    useEffect(() => {
        const poll = async () => {
            try {
                const data = await api.videos.processStatus(id)
                setStatus(data)

                // Preprocessing finished → fetch transcript
                if (['preprocessed', 'summarizing', 'summarized'].includes(data.status?.toLowerCase())) {
                    if (!transcript) {
                        try {
                            const t = await api.videos.getTranscript(id)
                            setTranscript(t?.transcript || null)
                        } catch { /* non-fatal */ }
                    }
                }

                // If summarization was already done (re-visit), jump to summary
                if (data.status?.toLowerCase() === 'summarized') {
                    clearInterval(pollRef.current)
                    navigate(`/videos/${id}/summary`, { replace: true })
                }

                if (data.failed && !data.status?.toLowerCase().includes('summariz')) {
                    clearInterval(pollRef.current)
                    setError(data.error_message || 'Processing failed.')
                }
            } catch (err) {
                setError(err.message)
                clearInterval(pollRef.current)
            }
        }

        poll()
        pollRef.current = setInterval(poll, 3000)
        return () => clearInterval(pollRef.current)
    }, [id, navigate, transcript])

    const preprocessingDone = ['preprocessed', 'summarizing', 'summarized']
        .includes(status?.status?.toLowerCase())

    const handleSummarize = async () => {
        setSummarizing(true)
        setSummError(null)
        try {
            await api.videos.summarize(id, 'bart', selectedLevel)
            navigate(`/videos/${id}/summary`, { replace: true })
        } catch (err) {
            setSummError(err.message)
            setSummarizing(false)
        }
    }

    const completedIdx = status ? statusToCompletedIdx(status.status) : -1
    const activeIdx = status ? statusToActiveIdx(status.status) : -1
    const isFailed = (status?.failed && !preprocessingDone) || !!error
    const progressPct = preprocessingDone ? 100 : Math.round(((completedIdx + 1) / 3) * 100)

    return (
        <div style={pageStyle}>
            <div style={containerStyle}>

                {/* ── Header ── */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{ fontSize: '3.5rem', marginBottom: '0.75rem' }}>
                        {isFailed ? '❌' : preprocessingDone ? '📄' : '⚙️'}
                    </div>
                    <h1 style={headingStyle}>
                        {isFailed
                            ? 'Processing Failed'
                            : preprocessingDone
                                ? 'Transcript Ready!'
                                : `Preparing Your Video${dots}`}
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '0.9rem', maxWidth: 380, margin: '0 auto' }}>
                        {isFailed
                            ? 'Something went wrong.'
                            : preprocessingDone
                                ? 'Review the transcript below, then click Summarize.'
                                : 'Extracting, transcribing, and cleaning your video…'}
                    </p>
                </div>

                {/* ── Overall progress bar ── */}
                {!isFailed && (
                    <div style={{ marginBottom: '1.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ color: '#94a3b8', fontSize: '0.78rem', fontWeight: 600 }}>
                                {preprocessingDone ? 'Ready for summarization' : (status?.current_stage || 'Queued…')}
                            </span>
                            <span style={{ color: '#a78bfa', fontSize: '0.78rem', fontWeight: 700 }}>
                                {progressPct}%
                            </span>
                        </div>
                        <div style={trackStyle}>
                            <div style={{ ...fillStyle, width: `${progressPct}%` }} />
                        </div>
                    </div>
                )}

                {/* ── Stage cards ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.75rem' }}>
                    {STAGES.map((stage, idx) => {
                        const done = completedIdx > idx
                        const active = activeIdx === idx && !preprocessingDone
                        return (
                            <div key={idx} style={{
                                display: 'flex', alignItems: 'center', gap: '0.9rem',
                                padding: '0.85rem 1.1rem', borderRadius: 12,
                                background: done
                                    ? 'rgba(34,197,94,0.06)'
                                    : active ? 'rgba(108,99,255,0.1)' : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${done
                                    ? 'rgba(34,197,94,0.2)'
                                    : active ? 'rgba(108,99,255,0.35)' : 'rgba(255,255,255,0.06)'}`,
                                transition: 'all 0.4s ease',
                            }}>
                                <div style={{
                                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '1rem',
                                    background: done
                                        ? 'rgba(34,197,94,0.15)'
                                        : active ? 'rgba(108,99,255,0.2)' : 'rgba(255,255,255,0.04)',
                                    border: `2px solid ${done
                                        ? 'rgba(34,197,94,0.4)'
                                        : active ? 'rgba(108,99,255,0.6)' : 'rgba(255,255,255,0.08)'}`,
                                    animation: active ? 'pulse 1.5s ease-in-out infinite' : 'none',
                                }}>
                                    {done ? '✓' : stage.icon}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{
                                        fontWeight: 700, fontSize: '0.9rem',
                                        color: done ? '#4ade80' : active ? '#e2e8f0' : '#475569',
                                    }}>
                                        {stage.label}
                                        {active && <span style={{ color: '#a78bfa', marginLeft: 6, fontSize: '0.75rem' }}>{dots}</span>}
                                    </div>
                                    <div style={{ color: '#475569', fontSize: '0.75rem', marginTop: 1 }}>{stage.desc}</div>
                                </div>
                                <span style={{
                                    fontSize: '0.72rem', fontWeight: 700, padding: '2px 9px',
                                    borderRadius: 999,
                                    background: done
                                        ? 'rgba(34,197,94,0.12)' : active ? 'rgba(168,85,247,0.15)' : 'transparent',
                                    color: done ? '#4ade80' : active ? '#a855f7' : '#334155',
                                    border: done
                                        ? '1px solid rgba(34,197,94,0.25)' : active
                                            ? '1px solid rgba(168,85,247,0.3)' : '1px solid transparent',
                                }}>
                                    {done ? 'Done' : active ? 'Running' : 'Waiting'}
                                </span>
                            </div>
                        )
                    })}
                </div>

                {/* ── Error (pipeline stage fails) ── */}
                {isFailed && (
                    <div style={errorBoxStyle}>
                        <p style={{ color: '#f87171', fontWeight: 600, marginBottom: '0.4rem' }}>⚠️ {error || status?.error_message}</p>
                        <button onClick={() => navigate('/upload')} style={btnPrimary}>📤 Upload Again</button>
                    </div>
                )}

                {/* ── Transcript panel (shown after preprocessing) ── */}
                {preprocessingDone && transcript && (
                    <div style={transcriptCardStyle}>
                        {/* Accent bar */}
                        <div style={{
                            height: 3, borderRadius: 999, marginBottom: '1.25rem',
                            background: 'linear-gradient(90deg, #6c63ff, #a855f7)'
                        }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
                                📄 Transcript
                            </h2>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    {transcript.split(' ').length.toLocaleString()} words
                                </span>
                                <button
                                    onClick={() => setExpanded(v => !v)}
                                    style={ghostBtn}
                                >
                                    {expanded ? '▲ Collapse' : '▼ Expand'}
                                </button>
                            </div>
                        </div>

                        <div style={{
                            maxHeight: expanded ? 'none' : 200,
                            overflow: 'hidden',
                            position: 'relative',
                        }}>
                            <p style={{
                                color: '#94a3b8', lineHeight: 1.8, fontSize: '0.875rem',
                                whiteSpace: 'pre-wrap', margin: 0,
                            }}>
                                {transcript}
                            </p>
                            {!expanded && (
                                <div style={{
                                    position: 'absolute', bottom: 0, left: 0, right: 0, height: 60,
                                    background: 'linear-gradient(transparent, rgba(10,10,15,0.95))',
                                }} />
                            )}
                        </div>
                    </div>
                )}

                {/* ── Summarize section ── */}
                {preprocessingDone && !isFailed && (
                    <div style={{ marginTop: '1.5rem' }}>

                        {/* Level picker */}
                        <div style={{ marginBottom: '1.25rem' }}>
                            <p style={{
                                color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700,
                                letterSpacing: '0.06em', textTransform: 'uppercase',
                                marginBottom: '0.65rem'
                            }}>
                                Choose summarization depth
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                {LEVELS.map(lv => (
                                    <button
                                        key={lv.id}
                                        onClick={() => setSelectedLevel(lv.id)}
                                        style={{
                                            padding: '10px 12px', borderRadius: 10,
                                            border: selectedLevel === lv.id
                                                ? '1.5px solid #a78bfa'
                                                : '1px solid rgba(255,255,255,0.08)',
                                            background: selectedLevel === lv.id
                                                ? 'rgba(167,139,250,0.12)'
                                                : 'rgba(255,255,255,0.02)',
                                            cursor: 'pointer', textAlign: 'left',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        <div style={{ fontSize: '1.1rem', marginBottom: 2 }}>{lv.icon}</div>
                                        <div style={{
                                            fontWeight: 700, fontSize: '0.85rem',
                                            color: selectedLevel === lv.id ? '#c4b5fd' : '#94a3b8',
                                        }}>{lv.label}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: 1 }}>
                                            {lv.desc}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {summError && (
                            <div style={{ ...errorBoxStyle, marginBottom: '1rem' }}>
                                <p style={{ color: '#f87171', fontSize: '0.875rem', margin: 0 }}>⚠️ {summError}</p>
                            </div>
                        )}
                        <button
                            onClick={handleSummarize}
                            disabled={summarizing}
                            style={{
                                ...btnPrimary, width: '100%', padding: '14px',
                                fontSize: '1rem',
                                opacity: summarizing ? 0.7 : 1,
                                cursor: summarizing ? 'wait' : 'pointer',
                            }}
                        >
                            {summarizing
                                ? `🤗 Summarizing (${LEVELS.find(l => l.id === selectedLevel)?.label})${dots}`
                                : `🤗 Summarize • ${LEVELS.find(l => l.id === selectedLevel)?.label} →`}
                        </button>
                        <p style={{ color: '#475569', fontSize: '0.72rem', textAlign: 'center', marginTop: '0.5rem' }}>
                            facebook/bart-large-cnn • running locally
                        </p>
                    </div>
                )}

                {/* ── Metadata chips ── */}
                {status && !isFailed && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '1.25rem', justifyContent: 'center' }}>
                        {status.audio_metadata?.duration_seconds && (
                            <Chip>🎵 {Math.round(status.audio_metadata.duration_seconds)}s audio</Chip>
                        )}
                        {status.transcript_metadata?.word_count && (
                            <Chip>📝 {status.transcript_metadata.word_count.toLocaleString()} words</Chip>
                        )}
                        {status.preprocessing_metadata?.chunk_count && (
                            <Chip>🧩 {status.preprocessing_metadata.chunk_count} chunks</Chip>
                        )}
                    </div>
                )}
            </div>

            <style>{`
                @keyframes pulse {
                    0%,100% { box-shadow: 0 0 0 0 rgba(108,99,255,0.4); }
                    50% { box-shadow: 0 0 0 8px rgba(108,99,255,0); }
                }
            `}</style>
        </div>
    )
}

function Chip({ children }) {
    return (
        <span style={{
            padding: '3px 10px', borderRadius: 999, fontSize: '0.72rem',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
            color: '#475569', fontWeight: 600,
        }}>{children}</span>
    )
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const pageStyle = {
    minHeight: '100vh',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: '90px 1.5rem 60px',
}
const containerStyle = {
    width: '100%', maxWidth: 600,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 24, padding: '2.25rem',
}
const headingStyle = {
    fontSize: '1.65rem', fontWeight: 800, marginBottom: '0.4rem',
    background: 'linear-gradient(90deg, #e2e8f0, #a78bfa)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
}
const trackStyle = { height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }
const fillStyle = {
    height: '100%', borderRadius: 999,
    background: 'linear-gradient(90deg, #6c63ff, #a855f7)',
    transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
}
const transcriptCardStyle = {
    background: 'rgba(108,99,255,0.04)',
    border: '1px solid rgba(108,99,255,0.18)',
    borderRadius: 14, padding: '1.25rem',
    marginTop: '0.5rem',
}
const errorBoxStyle = {
    textAlign: 'center', padding: '1.25rem',
    background: 'rgba(239,68,68,0.06)',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: 12,
}
const btnPrimary = {
    padding: '11px 22px', borderRadius: 10, border: 'none',
    background: 'linear-gradient(135deg, #6c63ff, #a855f7)',
    color: '#fff', fontWeight: 700, cursor: 'pointer',
    transition: 'opacity 0.2s',
}
const ghostBtn = {
    padding: '4px 10px', borderRadius: 7,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#64748b', fontSize: '0.75rem',
    cursor: 'pointer', fontWeight: 600,
}
