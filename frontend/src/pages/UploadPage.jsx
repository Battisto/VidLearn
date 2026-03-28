import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVideoUpload } from '../hooks/useVideoUpload'
import ProgressBar from '../components/ui/ProgressBar'
import { formatFileSize, ALLOWED_EXTENSIONS, MAX_FILE_SIZE_MB } from '../utils/helpers'
import { api } from '../services/api'

const ACCEPT = ALLOWED_EXTENSIONS.map(e => `video/${e}`).join(',')

const YT_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?.*v=|shorts\/|embed\/)|youtu\.be\/)[\w\-]+/i

export default function UploadPage() {
    const navigate = useNavigate()
    const { upload, progress, uploading, error, uploadedVideo, reset } = useVideoUpload()

    const [tab, setTab] = useState('file')  // 'file' | 'youtube' | 'text'

    // ── File upload state ─────────────────────────────────────────────────────
    const [dragActive, setDragActive] = useState(false)
    const [selectedFile, setSelectedFile] = useState(null)
    const [fileError, setFileError] = useState(null)
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const inputRef = useRef(null)

    // ── Text state ────────────────────────────────────────────────────────────
    const [pastedText, setPastedText] = useState('')
    const [textTitle, setTextTitle] = useState('')
    const [textDesc, setTextDesc] = useState('')
    const [textLoading, setTextLoading] = useState(false)
    const [textError, setTextError] = useState(null)

    // ── YouTube state ─────────────────────────────────────────────────────────
    const [ytUrl, setYtUrl] = useState('')
    const [ytTitle, setYtTitle] = useState('')
    const [ytLoading, setYtLoading] = useState(false)
    const [ytError, setYtError] = useState(null)
    const [ytPreview, setYtPreview] = useState(null)   // { thumbnail, title, duration, uploader }

    // ── File validation ───────────────────────────────────────────────────────
    const validateFile = (file) => {
        const ext = file.name.split('.').pop().toLowerCase()
        if (!ALLOWED_EXTENSIONS.includes(ext))
            return `File type ".${ext}" is not allowed. Use: ${ALLOWED_EXTENSIONS.join(', ')}`
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024)
            return `File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`
        return null
    }

    const handleFileSelect = (file) => {
        if (!file) return
        const err = validateFile(file)
        if (err) { setFileError(err); setSelectedFile(null); return }
        setFileError(null)
        setSelectedFile(file)
        if (!title) setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '))
    }

    const onDragOver = useCallback((e) => { e.preventDefault(); setDragActive(true) }, [])
    const onDragLeave = useCallback((e) => { e.preventDefault(); setDragActive(false) }, [])
    const onDrop = useCallback((e) => {
        e.preventDefault(); setDragActive(false)
        const file = e.dataTransfer.files?.[0]
        if (file) handleFileSelect(file)
    }, [title])

    const handleFileSubmit = async (e) => {
        e.preventDefault()
        if (!selectedFile || !title.trim()) return
        try { await upload(selectedFile, title.trim(), description.trim()) } catch { /* shown via hook */ }
    }

    // ── YouTube helpers ───────────────────────────────────────────────────────

    // Extract YouTube video ID for thumbnail preview
    const getYtId = (url) => {
        const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/)
        return m ? m[1] : null
    }

    const handleYtUrlChange = (val) => {
        setYtUrl(val)
        setYtError(null)
        const id = getYtId(val)
        if (id) {
            setYtPreview({ thumbnail: `https://img.youtube.com/vi/${id}/mqdefault.jpg`, id })
        } else {
            setYtPreview(null)
        }
    }

    const handleYtSubmit = async (e) => {
        e.preventDefault()
        if (!ytUrl.trim()) return
        if (!YT_REGEX.test(ytUrl.trim())) {
            setYtError('Please enter a valid YouTube URL (youtube.com or youtu.be)')
            return
        }
        setYtLoading(true)
        setYtError(null)
        try {
            const result = await api.videos.importYouTube(ytUrl.trim(), ytTitle.trim() || null)
            navigate(`/videos/${result.id}/processing`, { replace: true })
        } catch (err) {
            setYtError(err.message)
            setYtLoading(false)
        }
    }

    const handleTextSubmit = async (e) => {
        e.preventDefault()
        if (!pastedText.trim() || !textTitle.trim()) return
        setTextLoading(true)
        setTextError(null)
        try {
            const result = await api.videos.uploadText(textTitle.trim(), pastedText.trim(), textDesc.trim() || null)
            navigate(`/videos/${result.id}/processing`, { replace: true })
        } catch (err) {
            setTextError(err.message)
            setTextLoading(false)
        }
    }

    // Auto-redirect after file upload
    if (uploadedVideo) {
        navigate(`/videos/${uploadedVideo.id}/processing`, { replace: true })
        return null
    }

    return (
        <div style={pageStyle}>
            <div style={{ maxWidth: 640, width: '100%' }}>

                {/* ── Header ── */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 style={headingStyle}>Add a Video</h1>
                    <p style={{ color: '#64748b' }}>
                        Upload a file or paste a YouTube link — AI handles the rest
                    </p>
                </div>

                {/* ── Tab switcher ── */}
                <div style={tabBarStyle}>
                    <button
                        onClick={() => setTab('file')}
                        style={tab === 'file' ? activeTabStyle : inactiveTabStyle}
                    >
                        📤 Upload File
                    </button>
                    <button
                        onClick={() => setTab('youtube')}
                        style={tab === 'youtube' ? activeTabStyle : inactiveTabStyle}
                    >
                        ▶️ YouTube URL
                    </button>
                    <button
                        onClick={() => setTab('text')}
                        style={tab === 'text' ? activeTabStyle : inactiveTabStyle}
                    >
                        📝 Paste Text
                    </button>
                </div>

                {/* ══════════════════ FILE TAB ══════════════════ */}
                {tab === 'file' && (
                    <form onSubmit={handleFileSubmit} style={cardStyle}>

                        {/* Drop zone */}
                        <div
                            onClick={() => inputRef.current?.click()}
                            onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                            style={{
                                border: `2px dashed ${dragActive ? '#6c63ff' : selectedFile ? '#22c55e' : 'rgba(255,255,255,0.12)'}`,
                                borderRadius: 14, padding: '2.5rem 1.5rem',
                                textAlign: 'center', cursor: 'pointer',
                                background: dragActive ? 'rgba(108,99,255,0.08)'
                                    : selectedFile ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.02)',
                                transition: 'all 0.2s ease', marginBottom: '1.5rem',
                            }}
                        >
                            <input ref={inputRef} type="file" accept={ACCEPT}
                                style={{ display: 'none' }}
                                onChange={(e) => handleFileSelect(e.target.files?.[0])}
                            />
                            {selectedFile ? (
                                <>
                                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>
                                    <p style={{ color: '#22c55e', fontWeight: 600, marginBottom: '0.25rem' }}>{selectedFile.name}</p>
                                    <p style={{ color: '#64748b', fontSize: '0.85rem' }}>{formatFileSize(selectedFile.size)}</p>
                                    <button type="button"
                                        onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setTitle(''); setFileError(null) }}
                                        style={removeBtnStyle}
                                    >✕ Remove</button>
                                </>
                            ) : (
                                <>
                                    <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>{dragActive ? '📂' : '📤'}</div>
                                    <p style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '0.25rem' }}>
                                        {dragActive ? 'Drop your video here' : 'Drag & drop your video here'}
                                    </p>
                                    <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
                                        or click to browse · {ALLOWED_EXTENSIONS.join(', ')} · up to {MAX_FILE_SIZE_MB} MB
                                    </p>
                                </>
                            )}
                        </div>

                        {fileError && <ErrorBox message={fileError} />}

                        <Field label="Video Title *">
                            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                                placeholder="e.g. Introduction to Machine Learning"
                                maxLength={200} required style={inputStyle}
                                onFocus={e => { e.target.style.borderColor = '#6c63ff'; e.target.style.boxShadow = '0 0 0 3px rgba(108,99,255,0.15)' }}
                                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
                            />
                        </Field>

                        <Field label={<>Description <span style={{ color: '#64748b' }}>(optional)</span></>}>
                            <textarea value={description} onChange={e => setDescription(e.target.value)}
                                placeholder="Brief description of what this video covers..."
                                maxLength={1000} rows={3}
                                style={{ ...inputStyle, resize: 'vertical', minHeight: 90, fontFamily: 'inherit' }}
                                onFocus={e => { e.target.style.borderColor = '#6c63ff'; e.target.style.boxShadow = '0 0 0 3px rgba(108,99,255,0.15)' }}
                                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
                            />
                        </Field>

                        {uploading && (
                            <div style={{ marginBottom: '1.5rem' }}>
                                <ProgressBar progress={progress} label="Uploading..." />
                                <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: 6, textAlign: 'center' }}>
                                    Please do not close this tab while uploading.
                                </p>
                            </div>
                        )}

                        {error && <ErrorBox message={error} />}

                        <button type="submit"
                            disabled={uploading || !selectedFile || !title.trim()}
                            style={{
                                ...primaryBtn, width: '100%',
                                opacity: (uploading || !selectedFile || !title.trim()) ? 0.5 : 1,
                                cursor: (uploading || !selectedFile || !title.trim()) ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {uploading ? `⏳ Uploading... ${progress}%` : ' Upload & Summarize'}
                        </button>
                    </form>
                )}

                {/* ══════════════════ YOUTUBE TAB ════════════════ */}
                {tab === 'youtube' && (
                    <form onSubmit={handleYtSubmit} style={cardStyle}>

                        {/* URL input */}
                        <Field label="YouTube URL *">
                            <div style={{ position: 'relative' }}>
                                <span style={{
                                    position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                                    fontSize: '1.1rem', pointerEvents: 'none',
                                }}>▶️</span>
                                <input
                                    type="url"
                                    value={ytUrl}
                                    onChange={e => handleYtUrlChange(e.target.value)}
                                    placeholder="https://youtube.com/watch?v=... or https://youtu.be/..."
                                    required
                                    style={{ ...inputStyle, paddingLeft: 38 }}
                                    onFocus={e => { e.target.style.borderColor = '#ef4444'; e.target.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.15)' }}
                                    onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
                                />
                            </div>
                        </Field>

                        {/* Thumbnail preview */}
                        {ytPreview && (
                            <div style={{
                                marginBottom: '1.25rem', borderRadius: 12, overflow: 'hidden',
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: 'rgba(255,255,255,0.02)',
                            }}>
                                <img
                                    src={ytPreview.thumbnail}
                                    alt="YouTube thumbnail"
                                    style={{ width: '100%', display: 'block', maxHeight: 220, objectFit: 'cover' }}
                                    onError={e => { e.target.style.display = 'none' }}
                                />
                                <div style={{ padding: '0.75rem 1rem' }}>
                                    <p style={{ color: '#64748b', fontSize: '0.78rem', margin: 0 }}>
                                        Video ID: <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>{ytPreview.id}</span>
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Optional title override */}
                        <Field label={<>Custom Title <span style={{ color: '#64748b' }}>(optional — uses YouTube title if blank)</span></>}>
                            <input
                                type="text"
                                value={ytTitle}
                                onChange={e => setYtTitle(e.target.value)}
                                placeholder="Leave blank to use the original YouTube title"
                                maxLength={200}
                                style={inputStyle}
                                onFocus={e => { e.target.style.borderColor = '#6c63ff'; e.target.style.boxShadow = '0 0 0 3px rgba(108,99,255,0.15)' }}
                                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
                            />
                        </Field>

                        {ytError && <ErrorBox message={ytError} />}

                        {/* Info banner */}
                        <div style={{
                            padding: '0.75rem 1rem', borderRadius: 10, marginBottom: '1.25rem',
                            background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.18)',
                            fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.6,
                        }}>
                            <strong style={{ color: '#a78bfa' }}>How it works:</strong> We use yt-dlp to download the
                            audio track directly from YouTube and run it through Whisper transcription + BART summarization.
                            No video file is stored — only the audio and transcript.
                        </div>

                        <button type="submit"
                            disabled={ytLoading || !ytUrl.trim()}
                            style={{
                                ...ytBtn, width: '100%',
                                opacity: (ytLoading || !ytUrl.trim()) ? 0.55 : 1,
                                cursor: (ytLoading || !ytUrl.trim()) ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {ytLoading ? '⏳ Fetching metadata & starting pipeline…' : '▶️ Import from YouTube'}
                        </button>
                    </form>
                )}

                {/* ══════════════════ TEXT TAB ══════════════════ */}
                {tab === 'text' && (
                    <form onSubmit={handleTextSubmit} style={cardStyle}>
                        <Field label="Pasted Text (Transcript) *">
                            <textarea
                                value={pastedText}
                                onChange={e => setPastedText(e.target.value)}
                                placeholder="Paste the text or transcript you want to summarize..."
                                required
                                style={{ ...inputStyle, resize: 'vertical', minHeight: 180, fontFamily: 'inherit' }}
                                onFocus={e => { e.target.style.borderColor = '#6c63ff'; e.target.style.boxShadow = '0 0 0 3px rgba(108,99,255,0.15)' }}
                                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
                            />
                        </Field>

                        <Field label="Title *">
                            <input
                                type="text"
                                value={textTitle}
                                onChange={e => setTextTitle(e.target.value)}
                                placeholder="e.g. Chapter 4 Summary"
                                maxLength={200}
                                required
                                style={inputStyle}
                                onFocus={e => { e.target.style.borderColor = '#6c63ff'; e.target.style.boxShadow = '0 0 0 3px rgba(108,99,255,0.15)' }}
                                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
                            />
                        </Field>

                        <Field label={<>Description <span style={{ color: '#64748b' }}>(optional)</span></>}>
                            <input
                                type="text"
                                value={textDesc}
                                onChange={e => setTextDesc(e.target.value)}
                                placeholder="Brief context..."
                                maxLength={1000}
                                style={inputStyle}
                                onFocus={e => { e.target.style.borderColor = '#6c63ff'; e.target.style.boxShadow = '0 0 0 3px rgba(108,99,255,0.15)' }}
                                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
                            />
                        </Field>

                        {textError && <ErrorBox message={textError} />}

                        <button type="submit"
                            disabled={textLoading || !pastedText.trim() || !textTitle.trim()}
                            style={{
                                ...primaryBtn, width: '100%',
                                opacity: (textLoading || !pastedText.trim() || !textTitle.trim()) ? 0.5 : 1,
                                cursor: (textLoading || !pastedText.trim() || !textTitle.trim()) ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {textLoading ? '⏳ Saving text...' : '📝 Save & Summarize'}
                        </button>
                    </form>
                )}

            </div>
        </div>
    )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Field({ label, children }) {
    return (
        <div style={{ marginBottom: '1.25rem' }}>
            <label style={labelStyle}>{label}</label>
            {children}
        </div>
    )
}

function ErrorBox({ message }) {
    return (
        <div style={{
            marginBottom: '1rem', padding: '10px 14px', borderRadius: 8,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            color: '#f87171', fontSize: '0.875rem', display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
            <span>⚠️</span><span>{message}</span>
        </div>
    )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const pageStyle = {
    minHeight: '100vh',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: '90px 1.5rem 60px',
}
const headingStyle = {
    fontSize: '2.25rem', fontWeight: 800, marginBottom: '0.5rem',
    background: 'linear-gradient(90deg, #e2e8f0, #a78bfa)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
}
const tabBarStyle = {
    display: 'flex', borderRadius: 12, overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.08)',
    marginBottom: '1.25rem',
    background: 'rgba(255,255,255,0.02)',
}
const activeTabStyle = {
    flex: 1, padding: '11px', border: 'none', cursor: 'pointer',
    background: 'linear-gradient(135deg, #6c63ff22, #a855f722)',
    borderBottom: '2px solid #a78bfa',
    color: '#e2e8f0', fontWeight: 700, fontSize: '0.9rem',
    transition: 'all 0.2s',
}
const inactiveTabStyle = {
    flex: 1, padding: '11px', border: 'none', cursor: 'pointer',
    background: 'transparent', borderBottom: '2px solid transparent',
    color: '#475569', fontWeight: 600, fontSize: '0.9rem',
    transition: 'all 0.2s',
}
const cardStyle = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20, padding: '2rem',
}
const labelStyle = {
    display: 'block', marginBottom: 6,
    fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8',
}
const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#e2e8f0', fontSize: '0.95rem',
    outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box',
}
const primaryBtn = {
    padding: '12px 28px', borderRadius: 10, border: 'none',
    background: 'linear-gradient(135deg, #6c63ff, #a855f7)',
    color: '#fff', fontSize: '1rem', fontWeight: 700,
    cursor: 'pointer', letterSpacing: '0.02em',
    transition: 'opacity 0.2s ease',
}
const ytBtn = {
    padding: '12px 28px', borderRadius: 10, border: 'none',
    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
    color: '#fff', fontSize: '1rem', fontWeight: 700,
    cursor: 'pointer', letterSpacing: '0.02em',
    transition: 'opacity 0.2s ease',
}
const removeBtnStyle = {
    marginTop: '0.75rem', background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
    color: '#f87171', padding: '4px 12px', fontSize: '0.8rem', cursor: 'pointer',
}
