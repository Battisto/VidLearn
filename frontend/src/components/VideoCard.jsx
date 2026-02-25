import { useState } from 'react'
import { api } from '../services/api'
import StatusBadge from './ui/StatusBadge'
import ProgressBar from './ui/ProgressBar'
import { formatFileSize, formatDate } from '../utils/helpers'

/**
 * VideoCard — shows video info + triggers audio extraction inline.
 */
export default function VideoCard({ video: initialVideo, onDelete, onUpdate }) {
    const [video, setVideo] = useState(initialVideo)
    const [extracting, setExtracting] = useState(false)
    const [extractError, setExtractError] = useState(null)
    const [polling, setPolling] = useState(false)

    const ext = video.metadata?.file_extension?.toUpperCase() || 'VIDEO'
    const size = video.metadata?.file_size_bytes ? formatFileSize(video.metadata.file_size_bytes) : '—'
    const canExtract = ['uploaded', 'failed', 'audio_ready'].includes(video.status)
    const audioReady = video.status === 'audio_ready'
    const isExtracting = video.status === 'extracting_audio'

    const formatDuration = (secs) => {
        if (!secs) return null
        const m = Math.floor(secs / 60)
        const s = Math.floor(secs % 60)
        return `${m}m ${s}s`
    }

    const handleExtract = async () => {
        setExtracting(true)
        setExtractError(null)
        try {
            const updated = await api.videos.extractAudio(video.id)
            setVideo(updated)
            onUpdate?.(updated)

            // Poll for completion if still extracting
            if (updated.status === 'extracting_audio') {
                setPolling(true)
                pollStatus()
            }
        } catch (err) {
            setExtractError(err.message)
        } finally {
            setExtracting(false)
        }
    }

    const pollStatus = async () => {
        const maxAttempts = 60  // poll up to 5 minutes (5s intervals)
        let attempts = 0
        const interval = setInterval(async () => {
            attempts++
            try {
                const status = await api.videos.audioStatus(video.id)
                if (status.status !== 'extracting_audio') {
                    clearInterval(interval)
                    setPolling(false)
                    // Refresh full video
                    const updated = await api.videos.get(video.id)
                    setVideo(updated)
                    onUpdate?.(updated)
                }
            } catch {
                clearInterval(interval)
                setPolling(false)
            }
            if (attempts >= maxAttempts) {
                clearInterval(interval)
                setPolling(false)
            }
        }, 5000) // every 5 seconds
    }

    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${audioReady ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: 16, padding: '1.5rem',
            display: 'flex', flexDirection: 'column', gap: '0.75rem',
            transition: 'border-color 0.2s, transform 0.2s',
        }}
            onMouseEnter={e => {
                e.currentTarget.style.borderColor = audioReady ? 'rgba(34,197,94,0.4)' : 'rgba(108,99,255,0.3)'
                e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={e => {
                e.currentTarget.style.borderColor = audioReady ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.07)'
                e.currentTarget.style.transform = 'translateY(0)'
            }}
        >
            {/* Thumbnail placeholder */}
            <div style={{
                width: '100%', aspectRatio: '16/9', borderRadius: 10,
                background: audioReady
                    ? 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(16,185,129,0.08))'
                    : 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(168,85,247,0.1))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '3rem', border: '1px solid rgba(255,255,255,0.06)',
                position: 'relative',
            }}>
                {audioReady ? '🎵' : '🎬'}
                {(isExtracting || polling) && (
                    <div style={{
                        position: 'absolute', bottom: 8, left: 8, right: 8,
                    }}>
                        <ProgressBar progress={70} />
                    </div>
                )}
            </div>

            {/* Title & description */}
            <div>
                <h3 style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>
                    {video.title}
                </h3>
                {video.description && (
                    <p style={{
                        color: '#64748b', fontSize: '0.8rem', lineHeight: 1.5,
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                        {video.description}
                    </p>
                )}
            </div>

            {/* Status + meta */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                <StatusBadge status={video.status} />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Chip>{ext}</Chip>
                    <Chip>{size}</Chip>
                </div>
            </div>

            {/* Audio metadata (if extracted) */}
            {audioReady && video.audio_metadata && (
                <div style={{
                    padding: '10px 12px', borderRadius: 10,
                    background: 'rgba(34,197,94,0.06)',
                    border: '1px solid rgba(34,197,94,0.15)',
                    display: 'flex', flexWrap: 'wrap', gap: '0.75rem',
                }}>
                    <AudioStat icon="⏱️" label="Duration" value={formatDuration(video.audio_metadata.duration_seconds) || '—'} />
                    <AudioStat icon="🎚️" label="Sample Rate" value={video.audio_metadata.sample_rate ? `${video.audio_metadata.sample_rate / 1000} kHz` : '—'} />
                    <AudioStat icon="📢" label="Channels" value={video.audio_metadata.channels === 1 ? 'Mono' : 'Stereo'} />
                    <AudioStat icon="💾" label="Audio Size" value={video.audio_metadata.audio_size_bytes ? formatFileSize(video.audio_metadata.audio_size_bytes) : '—'} />
                </div>
            )}

            {/* Error message */}
            {video.status === 'failed' && video.error_message && (
                <div style={{
                    padding: '8px 12px', borderRadius: 8, fontSize: '0.78rem',
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                    color: '#f87171',
                }}>
                    ⚠️ {video.error_message}
                </div>
            )}

            {/* Extract error */}
            {extractError && (
                <div style={{
                    padding: '8px 12px', borderRadius: 8, fontSize: '0.78rem',
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                    color: '#f87171',
                }}>
                    ⚠️ {extractError}
                </div>
            )}

            <p style={{ color: '#475569', fontSize: '0.75rem' }}>
                📅 {formatDate(video.created_at)}
            </p>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                {canExtract && (
                    <button
                        onClick={handleExtract}
                        disabled={extracting || polling}
                        style={{
                            flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: audioReady
                                ? 'rgba(34,197,94,0.1)' : 'rgba(108,99,255,0.15)',
                            border: `1px solid ${audioReady ? 'rgba(34,197,94,0.3)' : 'rgba(108,99,255,0.35)'}`,
                            color: audioReady ? '#4ade80' : '#a78bfa',
                            fontSize: '0.8rem', fontWeight: 600,
                            opacity: (extracting || polling) ? 0.6 : 1,
                            transition: 'opacity 0.2s',
                        }}
                    >
                        {extracting || polling
                            ? '⏳ Extracting...'
                            : audioReady ? '🔄 Re-extract Audio' : '🎵 Extract Audio'}
                    </button>
                )}
                {(isExtracting || polling) && (
                    <div style={{
                        flex: 1, padding: '7px 0', borderRadius: 8, textAlign: 'center',
                        background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                        color: '#fbbf24', fontSize: '0.8rem', fontWeight: 600,
                    }}>
                        ⏳ Processing...
                    </div>
                )}
                <button
                    onClick={() => onDelete(video)}
                    style={{
                        padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                        color: '#f87171', fontSize: '0.8rem', fontWeight: 600,
                    }}
                >
                    🗑️
                </button>
            </div>
        </div>
    )
}

function AudioStat({ icon, label, value }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ color: '#64748b', fontSize: '0.7rem' }}>{icon} {label}</span>
            <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '0.8rem' }}>{value}</span>
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
