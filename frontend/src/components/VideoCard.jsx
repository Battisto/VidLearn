import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import StatusBadge from './ui/StatusBadge'
import ProgressBar from './ui/ProgressBar'
import { formatFileSize, formatDate } from '../utils/helpers'

const WHISPER_MODELS = ['tiny', 'base', 'small', 'medium', 'large']

export default function VideoCard({ video: initialVideo, onDelete, onUpdate }) {
    const navigate = useNavigate()
    const [video, setVideo] = useState(initialVideo)
    const [extracting, setExtracting] = useState(false)
    const [extractError, setExtractError] = useState(null)
    const [transcribing, setTranscribing] = useState(false)
    const [transcribeError, setTranscribeError] = useState(null)
    const [selectedModel, setSelectedModel] = useState('base')
    const [polling, setPolling] = useState(false)
    const [pollTarget, setPollTarget] = useState(null) // 'audio' | 'transcript'

    const ext = video.metadata?.file_extension?.toUpperCase() || 'VIDEO'
    const size = video.metadata?.file_size_bytes ? formatFileSize(video.metadata.file_size_bytes) : '—'
    const canExtract = ['uploaded', 'failed', 'audio_ready'].includes(video.status)
    const canTranscribe = ['audio_ready', 'transcript_ready', 'failed'].includes(video.status)
    const audioReady = video.status === 'audio_ready'
    const transcriptReady = video.status === 'transcript_ready'
    const isProcessing = ['extracting_audio', 'transcribing'].includes(video.status)

    const formatDuration = (secs) => {
        if (!secs) return null
        return `${Math.floor(secs / 60)}m ${Math.floor(secs % 60)}s`
    }

    // ── Polling helper ──────────────────────────────────────────────────────────
    const startPolling = (target, statusFn, completedStatuses) => {
        setPolling(true)
        setPollTarget(target)
        let attempts = 0
        const interval = setInterval(async () => {
            attempts++
            try {
                const status = await statusFn()
                if (completedStatuses.includes(status.status)) {
                    clearInterval(interval)
                    setPolling(false)
                    setPollTarget(null)
                    const updated = await api.videos.get(video.id)
                    setVideo(updated)
                    onUpdate?.(updated)
                }
            } catch {
                clearInterval(interval)
                setPolling(false)
                setPollTarget(null)
            }
            if (attempts >= 120) { clearInterval(interval); setPolling(false); setPollTarget(null) }
        }, 5000)
    }

    // ── Audio extraction ────────────────────────────────────────────────────────
    const handleExtract = async () => {
        setExtracting(true)
        setExtractError(null)
        try {
            const updated = await api.videos.extractAudio(video.id)
            setVideo(updated)
            onUpdate?.(updated)
            if (updated.status === 'extracting_audio') {
                startPolling('audio',
                    () => api.videos.audioStatus(video.id),
                    ['audio_ready', 'transcript_ready', 'completed', 'failed'],
                )
            }
        } catch (err) {
            setExtractError(err.message)
        } finally {
            setExtracting(false)
        }
    }

    // ── Transcription ───────────────────────────────────────────────────────────
    const handleTranscribe = async () => {
        setTranscribing(true)
        setTranscribeError(null)
        try {
            const updated = await api.videos.transcribe(video.id, selectedModel)
            setVideo(updated)
            onUpdate?.(updated)
            if (updated.status === 'transcribing') {
                startPolling('transcript',
                    () => api.videos.transcriptionStatus(video.id),
                    ['transcript_ready', 'completed', 'failed'],
                )
            }
        } catch (err) {
            setTranscribeError(err.message)
        } finally {
            setTranscribing(false)
        }
    }

    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${transcriptReady ? 'rgba(168,85,247,0.25)' :
                    audioReady ? 'rgba(34,197,94,0.2)' :
                        'rgba(255,255,255,0.07)'
                }`,
            borderRadius: 16, padding: '1.5rem',
            display: 'flex', flexDirection: 'column', gap: '0.75rem',
            transition: 'border-color 0.2s, transform 0.2s',
        }}
            onMouseEnter={e => {
                e.currentTarget.style.borderColor = transcriptReady ? 'rgba(168,85,247,0.5)' : audioReady ? 'rgba(34,197,94,0.4)' : 'rgba(108,99,255,0.3)'
                e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={e => {
                e.currentTarget.style.borderColor = transcriptReady ? 'rgba(168,85,247,0.25)' : audioReady ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.07)'
                e.currentTarget.style.transform = 'translateY(0)'
            }}
        >
            {/* Thumbnail */}
            <div style={{
                width: '100%', aspectRatio: '16/9', borderRadius: 10, position: 'relative',
                background: transcriptReady
                    ? 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(139,92,246,0.08))'
                    : audioReady
                        ? 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(16,185,129,0.08))'
                        : 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(168,85,247,0.1))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '3rem', border: '1px solid rgba(255,255,255,0.06)',
            }}>
                {transcriptReady ? '📄' : audioReady ? '🎵' : '🎬'}
                {(isProcessing || (polling)) && (
                    <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8 }}>
                        <ProgressBar progress={65} />
                    </div>
                )}
            </div>

            {/* Title */}
            <div>
                <h3 style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>
                    {video.title}
                </h3>
                {video.description && (
                    <p style={{
                        color: '#64748b', fontSize: '0.8rem', lineHeight: 1.5,
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>{video.description}</p>
                )}
            </div>

            {/* Status + chips */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                <StatusBadge status={video.status} />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Chip>{ext}</Chip>
                    <Chip>{size}</Chip>
                </div>
            </div>

            {/* Audio metadata */}
            {audioReady && video.audio_metadata && (
                <InfoBox color="green">
                    <StatRow icon="⏱️" label="Duration" value={formatDuration(video.audio_metadata.duration_seconds) || '—'} />
                    <StatRow icon="🎚️" label="Rate" value={video.audio_metadata.sample_rate ? `${video.audio_metadata.sample_rate / 1000}kHz` : '—'} />
                    <StatRow icon="💾" label="Size" value={video.audio_metadata.audio_size_bytes ? formatFileSize(video.audio_metadata.audio_size_bytes) : '—'} />
                </InfoBox>
            )}

            {/* Transcript metadata */}
            {transcriptReady && video.transcript_metadata && (
                <InfoBox color="purple">
                    <StatRow icon="🌐" label="Lang" value={video.transcript_metadata.language?.toUpperCase() || '?'} />
                    <StatRow icon="📝" label="Words" value={video.transcript_metadata.word_count?.toLocaleString() || '—'} />
                    <StatRow icon="🤖" label="Model" value={`Whisper ${video.transcript_metadata.whisper_model}`} />
                </InfoBox>
            )}

            {/* Error message */}
            {video.status === 'failed' && video.error_message && (
                <ErrBox msg={video.error_message} />
            )}
            {extractError && <ErrBox msg={extractError} />}
            {transcribeError && <ErrBox msg={transcribeError} />}

            <p style={{ color: '#475569', fontSize: '0.75rem' }}>📅 {formatDate(video.created_at)}</p>

            {/* Model selector (shown when audio ready and not yet transcribed) */}
            {canTranscribe && !transcriptReady && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>Model:</label>
                    <select
                        value={selectedModel}
                        onChange={e => setSelectedModel(e.target.value)}
                        style={{
                            flex: 1, background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
                            color: '#e2e8f0', padding: '4px 8px', fontSize: '0.8rem', cursor: 'pointer',
                        }}
                    >
                        {WHISPER_MODELS.map(m => (
                            <option key={m} value={m} style={{ background: '#1a1a2e' }}>{m}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                {/* Extract audio */}
                {canExtract && (
                    <ActionBtn
                        onClick={handleExtract}
                        disabled={extracting || polling}
                        color={audioReady ? 'green' : 'purple'}
                    >
                        {extracting || (polling && pollTarget === 'audio')
                            ? '⏳ Extracting...'
                            : audioReady ? '🔄 Re-extract' : '🎵 Extract Audio'}
                    </ActionBtn>
                )}

                {/* Transcribe */}
                {canTranscribe && (
                    <ActionBtn
                        onClick={handleTranscribe}
                        disabled={transcribing || polling}
                        color="blue"
                    >
                        {transcribing || (polling && pollTarget === 'transcript')
                            ? '⏳ Transcribing...'
                            : transcriptReady ? '🔄 Re-transcribe' : '📄 Transcribe'}
                    </ActionBtn>
                )}

                {/* View transcript */}
                {transcriptReady && (
                    <ActionBtn onClick={() => navigate(`/videos/${video.id}/transcript`)} color="amber">
                        👁️ View Transcript
                    </ActionBtn>
                )}

                {/* Delete */}
                <button
                    onClick={() => onDelete(video)}
                    style={{
                        padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                        color: '#f87171', fontSize: '0.8rem', fontWeight: 600,
                    }}
                >🗑️</button>
            </div>
        </div>
    )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function InfoBox({ color, children }) {
    const colors = {
        green: { bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.15)' },
        purple: { bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.2)' },
    }
    const c = colors[color] || colors.green
    return (
        <div style={{
            padding: '10px 12px', borderRadius: 10,
            background: c.bg, border: `1px solid ${c.border}`,
            display: 'flex', flexWrap: 'wrap', gap: '0.75rem',
        }}>
            {children}
        </div>
    )
}

function StatRow({ icon, label, value }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ color: '#64748b', fontSize: '0.7rem' }}>{icon} {label}</span>
            <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '0.8rem' }}>{value}</span>
        </div>
    )
}

function ErrBox({ msg }) {
    return (
        <div style={{
            padding: '8px 12px', borderRadius: 8, fontSize: '0.78rem',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            color: '#f87171',
        }}>⚠️ {msg}</div>
    )
}

function ActionBtn({ children, onClick, disabled, color = 'purple' }) {
    const colors = {
        purple: { bg: 'rgba(108,99,255,0.15)', border: 'rgba(108,99,255,0.35)', text: '#a78bfa' },
        green: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', text: '#4ade80' },
        blue: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', text: '#60a5fa' },
        amber: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', text: '#fbbf24' },
    }
    const c = colors[color]
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                flex: 1, minWidth: 0, padding: '7px 6px', borderRadius: 8, border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                background: c.bg, border: `1px solid ${c.border}`,
                color: c.text, fontSize: '0.78rem', fontWeight: 600,
                opacity: disabled ? 0.55 : 1, transition: 'opacity 0.2s',
                whiteSpace: 'nowrap',
            }}
        >{children}</button>
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
