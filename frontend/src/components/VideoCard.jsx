import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import StatusBadge from './ui/StatusBadge'
import ProgressBar from './ui/ProgressBar'
import { formatFileSize, formatDate } from '../utils/helpers'

const WHISPER_MODELS = ['tiny', 'base', 'small', 'medium', 'large']

// Which statuses allow which actions
const can = {
    extract: (s) => ['uploaded', 'failed', 'audio_ready'].includes(s),
    transcribe: (s) => ['audio_ready', 'transcript_ready', 'failed'].includes(s),
    preprocess: (s) => ['transcript_ready', 'preprocessed', 'failed'].includes(s),
}

export default function VideoCard({ video: initialVideo, onDelete, onUpdate }) {
    const navigate = useNavigate()
    const [video, setVideo] = useState(initialVideo)
    const [busy, setBusy] = useState(null)   // null | 'extract' | 'transcribe' | 'preprocess'
    const [error, setError] = useState(null)
    const [selectedModel, setSelectedModel] = useState('base')
    const [polling, setPolling] = useState(false)
    const [pollTarget, setPollTarget] = useState(null)

    const S = video.status
    const ext = video.metadata?.file_extension?.toUpperCase() || 'VIDEO'
    const size = video.metadata?.file_size_bytes ? formatFileSize(video.metadata.file_size_bytes) : '—'
    const isProcessing = ['extracting_audio', 'transcribing', 'preprocessing'].includes(S)

    const updateVideo = (updated) => {
        setVideo(updated)
        onUpdate?.(updated)
    }

    // ── Generic polling ────────────────────────────────────────────────────────
    const startPolling = (target, statusFn, doneStatuses) => {
        setPolling(true)
        setPollTarget(target)
        let n = 0
        const iv = setInterval(async () => {
            n++
            try {
                const st = await statusFn()
                if (doneStatuses.includes(st.status)) {
                    clearInterval(iv)
                    setPolling(false)
                    setPollTarget(null)
                    const updated = await api.videos.get(video.id)
                    updateVideo(updated)
                }
            } catch { clearInterval(iv); setPolling(false); setPollTarget(null) }
            if (n >= 120) { clearInterval(iv); setPolling(false); setPollTarget(null) }
        }, 5000)
    }

    // ── Action handlers ────────────────────────────────────────────────────────
    const handleAction = async (action, apiFn, pollFn, doneStatuses) => {
        setBusy(action)
        setError(null)
        try {
            const updated = await apiFn()
            updateVideo(updated)
            if (['extracting_audio', 'transcribing', 'preprocessing'].includes(updated.status)) {
                startPolling(action, pollFn, doneStatuses)
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setBusy(null)
        }
    }

    const handleExtract = () => handleAction('extract',
        () => api.videos.extractAudio(video.id),
        () => api.videos.audioStatus(video.id),
        ['audio_ready', 'transcript_ready', 'preprocessed', 'completed', 'failed'],
    )
    const handleTranscribe = () => handleAction('transcribe',
        () => api.videos.transcribe(video.id, selectedModel),
        () => api.videos.transcriptionStatus(video.id),
        ['transcript_ready', 'preprocessed', 'completed', 'failed'],
    )
    const handlePreprocess = () => handleAction('preprocess',
        () => api.videos.preprocess(video.id),
        () => api.videos.preprocessingStatus(video.id),
        ['preprocessed', 'completed', 'failed'],
    )

    // ── Card border color by status ────────────────────────────────────────────
    const borderColor =
        S === 'preprocessed' ? 'rgba(6,182,212,0.25)' :
            S === 'transcript_ready' ? 'rgba(168,85,247,0.25)' :
                S === 'audio_ready' ? 'rgba(34,197,94,0.2)' :
                    'rgba(255,255,255,0.07)'

    const thumbEmoji =
        S === 'preprocessed' ? '🧩' :
            S.includes('transcript') ? '📄' :
                S.includes('audio') ? '🎵' : '🎬'

    const thumbBg =
        S === 'preprocessed' ? 'linear-gradient(135deg,rgba(6,182,212,0.12),rgba(34,211,238,0.06))' :
            S === 'transcript_ready' ? 'linear-gradient(135deg,rgba(168,85,247,0.12),rgba(139,92,246,0.06))' :
                S === 'audio_ready' ? 'linear-gradient(135deg,rgba(34,197,94,0.1),rgba(16,185,129,0.06))' :
                    'linear-gradient(135deg,rgba(108,99,255,0.15),rgba(168,85,247,0.1))'

    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${borderColor}`,
            borderRadius: 16, padding: '1.5rem',
            display: 'flex', flexDirection: 'column', gap: '0.75rem',
            transition: 'transform 0.2s, border-color 0.2s',
        }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
        >
            {/* Thumbnail */}
            <div style={{
                width: '100%', aspectRatio: '16/9', borderRadius: 10, position: 'relative',
                background: thumbBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '3rem', border: '1px solid rgba(255,255,255,0.06)',
            }}>
                {thumbEmoji}
                {(isProcessing || polling) && (
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
                <StatusBadge status={S} />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Chip>{ext}</Chip><Chip>{size}</Chip>
                </div>
            </div>

            {/* Audio metadata */}
            {S === 'audio_ready' && video.audio_metadata && (
                <InfoBox color="green">
                    <Stat icon="⏱️" label="Duration" v={formatDuration(video.audio_metadata.duration_seconds)} />
                    <Stat icon="🎚️" label="Rate" v={video.audio_metadata.sample_rate ? `${video.audio_metadata.sample_rate / 1000}kHz` : '—'} />
                    <Stat icon="💾" label="Size" v={video.audio_metadata.audio_size_bytes ? formatFileSize(video.audio_metadata.audio_size_bytes) : '—'} />
                </InfoBox>
            )}

            {/* Transcript metadata */}
            {['transcript_ready', 'preprocessing', 'preprocessed'].includes(S) && video.transcript_metadata && (
                <InfoBox color="purple">
                    <Stat icon="🌐" label="Lang" v={video.transcript_metadata.language?.toUpperCase() || '?'} />
                    <Stat icon="📝" label="Words" v={video.transcript_metadata.word_count?.toLocaleString() || '—'} />
                    <Stat icon="🤖" label="Model" v={`Whisper ${video.transcript_metadata.whisper_model}`} />
                </InfoBox>
            )}

            {/* Preprocessing metadata */}
            {S === 'preprocessed' && video.preprocessing_metadata && (
                <InfoBox color="cyan">
                    <Stat icon="🧩" label="Chunks" v={video.preprocessing_metadata.chunk_count} />
                    <Stat icon="✨" label="Clean words" v={video.preprocessing_metadata.cleaned_word_count?.toLocaleString() || '—'} />
                    <Stat icon="✂️" label="Noise rm" v={video.preprocessing_metadata.noise_removed_count} />
                </InfoBox>
            )}

            {/* Error */}
            {video.error_message && <ErrBox msg={video.error_message} />}
            {error && <ErrBox msg={error} />}

            <p style={{ color: '#475569', fontSize: '0.75rem' }}>📅 {formatDate(video.created_at)}</p>

            {/* Whisper model selector */}
            {can.transcribe(S) && S !== 'transcript_ready' && !['transcript_ready', 'preprocessed'].includes(S) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>Model:</label>
                    <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} style={selectStyle}>
                        {WHISPER_MODELS.map(m => <option key={m} value={m} style={{ background: '#1a1a2e' }}>{m}</option>)}
                    </select>
                </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                {can.extract(S) && (
                    <ActionBtn onClick={handleExtract} disabled={!!busy || polling} color="green">
                        {busy === 'extract' || (polling && pollTarget === 'extract') ? '⏳ Extracting...' : S === 'audio_ready' ? '🔄 Re-extract' : '🎵 Extract Audio'}
                    </ActionBtn>
                )}
                {can.transcribe(S) && (
                    <ActionBtn onClick={handleTranscribe} disabled={!!busy || polling} color="blue">
                        {busy === 'transcribe' || (polling && pollTarget === 'transcribe') ? '⏳ Transcribing...' : S === 'transcript_ready' ? '🔄 Re-transcribe' : '📄 Transcribe'}
                    </ActionBtn>
                )}
                {can.preprocess(S) && (
                    <ActionBtn onClick={handlePreprocess} disabled={!!busy || polling} color="cyan">
                        {busy === 'preprocess' || (polling && pollTarget === 'preprocess') ? '⏳ Preprocessing...' : S === 'preprocessed' ? '🔄 Re-process' : '🔧 Preprocess'}
                    </ActionBtn>
                )}
                {S === 'transcript_ready' && (
                    <ActionBtn onClick={() => navigate(`/videos/${video.id}/transcript`)} color="purple">👁️ Transcript</ActionBtn>
                )}
                {S === 'preprocessed' && (
                    <ActionBtn onClick={() => navigate(`/videos/${video.id}/preprocessing`)} color="cyan">🧩 View Chunks</ActionBtn>
                )}
                <button onClick={() => onDelete(video)} style={deleteBtn}>🗑️</button>
            </div>
        </div>
    )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(s) {
    if (!s) return '—'
    return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`
}

const colorMap = {
    green: { bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.15)', text: '#22c55e' },
    purple: { bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.2)', text: '#a855f7' },
    cyan: { bg: 'rgba(6,182,212,0.08)', border: 'rgba(6,182,212,0.2)', text: '#22d3ee' },
    blue: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', text: '#60a5fa' },
    amber: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', text: '#fbbf24' },
}

function InfoBox({ color, children }) {
    const c = colorMap[color] || colorMap.green
    return (
        <div style={{
            padding: '10px 12px', borderRadius: 10,
            background: c.bg, border: `1px solid ${c.border}`,
            display: 'flex', flexWrap: 'wrap', gap: '0.75rem',
        }}>{children}</div>
    )
}

function Stat({ icon, label, v }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ color: '#64748b', fontSize: '0.7rem' }}>{icon} {label}</span>
            <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '0.8rem' }}>{v || '—'}</span>
        </div>
    )
}

function ErrBox({ msg }) {
    return (
        <div style={{
            padding: '8px 12px', borderRadius: 8, fontSize: '0.78rem',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171',
        }}>⚠️ {msg}</div>
    )
}

function ActionBtn({ children, onClick, disabled, color = 'purple' }) {
    const c = colorMap[color] || colorMap.purple
    return (
        <button onClick={onClick} disabled={disabled} style={{
            flex: 1, minWidth: 0, padding: '7px 6px', borderRadius: 8, border: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            background: c.bg, border: `1px solid ${c.border}`,
            color: c.text, fontSize: '0.78rem', fontWeight: 600,
            opacity: disabled ? 0.55 : 1, transition: 'opacity 0.2s',
            whiteSpace: 'nowrap',
        }}>{children}</button>
    )
}

function Chip({ children }) {
    return (
        <span style={{
            padding: '2px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b',
        }}>{children}</span>
    )
}

const selectStyle = {
    flex: 1, background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
    color: '#e2e8f0', padding: '4px 8px', fontSize: '0.8rem', cursor: 'pointer',
}

const deleteBtn = {
    padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
    color: '#f87171', fontSize: '0.8rem', fontWeight: 600,
}
