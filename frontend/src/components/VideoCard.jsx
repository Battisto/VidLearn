import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import StatusBadge from './ui/StatusBadge'
import ProgressBar from './ui/ProgressBar'
import { formatFileSize, formatDate } from '../utils/helpers'

const WHISPER_MODELS = ['tiny', 'base', 'small', 'medium', 'large']
const SUMMARY_PROVIDERS = ['gemini', 'bart']

// Status → allowed actions
const can = {
    extract: (s) => ['uploaded', 'failed', 'audio_ready'].includes(s),
    transcribe: (s) => ['audio_ready', 'transcript_ready', 'failed'].includes(s),
    preprocess: (s) => ['transcript_ready', 'preprocessed', 'failed'].includes(s),
    summarize: (s) => ['preprocessed', 'summarized', 'failed'].includes(s),
}

const PROCESSING_STATES = ['extracting_audio', 'transcribing', 'preprocessing', 'summarizing']

export default function VideoCard({ video: initialVideo, onDelete, onUpdate }) {
    const navigate = useNavigate()
    const [video, setVideo] = useState(initialVideo)
    const [busy, setBusy] = useState(null)
    const [error, setError] = useState(null)
    const [whisperModel, setWhisperModel] = useState('base')
    const [summaryProvider, setSummaryProvider] = useState('gemini')
    const [polling, setPolling] = useState(false)
    const [pollTarget, setPollTarget] = useState(null)

    const S = video.status
    const ext = video.metadata?.file_extension?.toUpperCase() || 'VIDEO'
    const size = video.metadata?.file_size_bytes ? formatFileSize(video.metadata.file_size_bytes) : '—'
    const isProcessing = PROCESSING_STATES.includes(S)

    const updateVideo = (v) => { setVideo(v); onUpdate?.(v) }

    // ── Unified polling ────────────────────────────────────────────────────────
    const startPolling = (target, statusFn, doneStatuses) => {
        setPolling(true); setPollTarget(target)
        let n = 0
        const iv = setInterval(async () => {
            n++
            try {
                const st = await statusFn()
                if (doneStatuses.includes(st.status)) {
                    clearInterval(iv); setPolling(false); setPollTarget(null)
                    const updated = await api.videos.get(video.id)
                    updateVideo(updated)
                }
            } catch { clearInterval(iv); setPolling(false); setPollTarget(null) }
            if (n >= 120) { clearInterval(iv); setPolling(false); setPollTarget(null) }
        }, 5000)
    }

    // ── Action handler ─────────────────────────────────────────────────────────
    const handleAction = async (action, apiFn, pollFn, doneStatuses) => {
        setBusy(action); setError(null)
        try {
            const updated = await apiFn()
            updateVideo(updated)
            if (PROCESSING_STATES.includes(updated.status))
                startPolling(action, pollFn, doneStatuses)
        } catch (err) { setError(err.message) }
        finally { setBusy(null) }
    }

    const handleExtract = () => handleAction('extract',
        () => api.videos.extractAudio(video.id),
        () => api.videos.audioStatus(video.id),
        ['audio_ready', 'transcript_ready', 'preprocessed', 'summarized', 'failed'],
    )
    const handleTranscribe = () => handleAction('transcribe',
        () => api.videos.transcribe(video.id, whisperModel),
        () => api.videos.transcriptionStatus(video.id),
        ['transcript_ready', 'preprocessed', 'summarized', 'failed'],
    )
    const handlePreprocess = () => handleAction('preprocess',
        () => api.videos.preprocess(video.id),
        () => api.videos.preprocessingStatus(video.id),
        ['preprocessed', 'summarized', 'failed'],
    )
    const handleSummarize = () => handleAction('summarize',
        () => api.videos.summarize(video.id, summaryProvider),
        () => api.videos.summarizationStatus(video.id),
        ['summarized', 'completed', 'failed'],
    )

    // ── Theming by status ─────────────────────────────────────────────────────
    const borderColor =
        S === 'summarized' ? 'rgba(244,63,94,0.25)' :
            S === 'preprocessed' ? 'rgba(6,182,212,0.25)' :
                S === 'transcript_ready' ? 'rgba(168,85,247,0.25)' :
                    S === 'audio_ready' ? 'rgba(34,197,94,0.2)' :
                        'rgba(255,255,255,0.07)'

    const thumbEmoji =
        S === 'summarized' || S === 'summarizing' ? '📋' :
            S === 'preprocessed' || S === 'preprocessing' ? '🧩' :
                S.includes('transcript') ? '📄' :
                    S.includes('audio') ? '🎵' : '🎬'

    const thumbBg =
        S === 'summarized' ? 'linear-gradient(135deg,rgba(244,63,94,0.12),rgba(236,72,153,0.06))' :
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
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
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
                <h3 style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>{video.title}</h3>
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

            {/* Contextual metadata boxes */}
            {S === 'audio_ready' && video.audio_metadata && (
                <InfoBox color="green">
                    <Stat icon="⏱️" lbl="Duration" v={fmtDur(video.audio_metadata.duration_seconds)} />
                    <Stat icon="🎚️" lbl="Rate" v={video.audio_metadata.sample_rate ? `${video.audio_metadata.sample_rate / 1000}kHz` : '—'} />
                    <Stat icon="💾" lbl="Size" v={video.audio_metadata.audio_size_bytes ? formatFileSize(video.audio_metadata.audio_size_bytes) : '—'} />
                </InfoBox>
            )}
            {['transcript_ready', 'preprocessing', 'preprocessed', 'summarizing', 'summarized'].includes(S) && video.transcript_metadata && (
                <InfoBox color="purple">
                    <Stat icon="🌐" lbl="Lang" v={video.transcript_metadata.language?.toUpperCase() || '?'} />
                    <Stat icon="📝" lbl="Words" v={video.transcript_metadata.word_count?.toLocaleString() || '—'} />
                    <Stat icon="🤖" lbl="Model" v={`Whisper ${video.transcript_metadata.whisper_model}`} />
                </InfoBox>
            )}
            {['preprocessed', 'summarizing', 'summarized'].includes(S) && video.preprocessing_metadata && (
                <InfoBox color="cyan">
                    <Stat icon="🧩" lbl="Chunks" v={video.preprocessing_metadata.chunk_count} />
                    <Stat icon="✨" lbl="Clean" v={video.preprocessing_metadata.cleaned_word_count?.toLocaleString() || '—'} />
                </InfoBox>
            )}
            {S === 'summarized' && video.summary_metadata && (
                <InfoBox color="pink">
                    <Stat icon="✨" lbl="Provider" v={video.summary_metadata.provider} />
                    <Stat icon="📋" lbl="Words" v={video.summary_metadata.summary_word_count} />
                    <Stat icon="🗜️" lbl="Ratio" v={`${(video.summary_metadata.input_word_count / video.summary_metadata.summary_word_count).toFixed(1)}×`} />
                </InfoBox>
            )}

            {/* Error */}
            {video.error_message && <ErrBox msg={video.error_message} />}
            {error && <ErrBox msg={error} />}

            <p style={{ color: '#475569', fontSize: '0.75rem' }}>📅 {formatDate(video.created_at)}</p>

            {/* Selectors */}
            {can.transcribe(S) && !['transcript_ready', 'preprocessed', 'summarized'].includes(S) && (
                <SelectRow label="Whisper" value={whisperModel} onChange={setWhisperModel} options={WHISPER_MODELS} />
            )}
            {can.summarize(S) && S !== 'summarized' && (
                <SelectRow label="AI" value={summaryProvider} onChange={setSummaryProvider} options={SUMMARY_PROVIDERS} />
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                {can.extract(S) && <Btn onClick={handleExtract} disabled={!!busy || polling} color="green">{busy === 'extract' || (polling && pollTarget === 'extract') ? '⏳...' : S === 'audio_ready' ? '🔄 Re-extract' : '🎵 Extract'}</Btn>}
                {can.transcribe(S) && <Btn onClick={handleTranscribe} disabled={!!busy || polling} color="blue" >{busy === 'transcribe' || (polling && pollTarget === 'transcribe') ? '⏳...' : S === 'transcript_ready' ? '🔄 Re-transcribe' : '📄 Transcribe'}</Btn>}
                {can.preprocess(S) && <Btn onClick={handlePreprocess} disabled={!!busy || polling} color="cyan" >{busy === 'preprocess' || (polling && pollTarget === 'preprocess') ? '⏳...' : S === 'preprocessed' ? '🔄 Re-process' : '🔧 Preprocess'}</Btn>}
                {can.summarize(S) && <Btn onClick={handleSummarize} disabled={!!busy || polling} color="pink" >{busy === 'summarize' || (polling && pollTarget === 'summarize') ? '⏳...' : S === 'summarized' ? '🔄 Re-summarize' : '📋 Summarize'}</Btn>}

                {/* View shortcuts */}
                {['transcript_ready', 'preprocessed', 'summarized'].includes(S) && (
                    <Btn onClick={() => navigate(`/videos/${video.id}/transcript`)} color="purple">👁️ Transcript</Btn>
                )}
                {['preprocessed', 'summarized'].includes(S) && (
                    <Btn onClick={() => navigate(`/videos/${video.id}/preprocessing`)} color="cyan">🧩 Chunks</Btn>
                )}
                {S === 'summarized' && (
                    <Btn onClick={() => navigate(`/videos/${video.id}/summary`)} color="pink">📋 Summary</Btn>
                )}

                <button onClick={() => onDelete(video)} style={deleteBtn}>🗑️</button>
            </div>
        </div>
    )
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function fmtDur(s) { return s ? `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s` : '—' }

const CM = {
    green: { bg: 'rgba(34,197,94,0.06)', bor: 'rgba(34,197,94,0.15)', txt: '#22c55e' },
    purple: { bg: 'rgba(168,85,247,0.08)', bor: 'rgba(168,85,247,0.2)', txt: '#a855f7' },
    cyan: { bg: 'rgba(6,182,212,0.08)', bor: 'rgba(6,182,212,0.2)', txt: '#22d3ee' },
    blue: { bg: 'rgba(59,130,246,0.1)', bor: 'rgba(59,130,246,0.3)', txt: '#60a5fa' },
    pink: { bg: 'rgba(244,63,94,0.08)', bor: 'rgba(244,63,94,0.25)', txt: '#fb7185' },
    amber: { bg: 'rgba(245,158,11,0.1)', bor: 'rgba(245,158,11,0.3)', txt: '#fbbf24' },
}

function InfoBox({ color, children }) {
    const c = CM[color] || CM.green
    return <div style={{ padding: '10px 12px', borderRadius: 10, background: c.bg, border: `1px solid ${c.bor}`, display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>{children}</div>
}
function Stat({ icon, lbl, v }) {
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ color: '#64748b', fontSize: '0.7rem' }}>{icon} {lbl}</span><span style={{ color: '#22c55e', fontWeight: 700, fontSize: '0.8rem' }}>{v || '—'}</span></div>
}
function ErrBox({ msg }) {
    return <div style={{ padding: '8px 12px', borderRadius: 8, fontSize: '0.78rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>⚠️ {msg}</div>
}
function Btn({ children, onClick, disabled, color = 'purple' }) {
    const c = CM[color] || CM.purple
    return <button onClick={onClick} disabled={disabled} style={{ flex: '1 1 auto', padding: '7px 10px', borderRadius: 8, border: `1px solid ${c.bor}`, cursor: disabled ? 'not-allowed' : 'pointer', background: c.bg, color: c.txt, fontSize: '0.75rem', fontWeight: 600, opacity: disabled ? 0.55 : 1, whiteSpace: 'nowrap', transition: 'opacity 0.2s', textAlign: 'center' }}>{children}</button>
}
function Chip({ children }) {
    return <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }}>{children}</span>
}
function SelectRow({ label, value, onChange, options }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{label}:</label>
            <select value={value} onChange={e => onChange(e.target.value)} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '4px 8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                {options.map(o => <option key={o} value={o} style={{ background: '#1a1a2e' }}>{o}</option>)}
            </select>
        </div>
    )
}

const deleteBtn = { padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', background: 'rgba(239,68,68,0.08)', color: '#f87171', fontSize: '0.8rem', fontWeight: 600 }
