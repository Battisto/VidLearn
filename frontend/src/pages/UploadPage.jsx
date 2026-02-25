import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVideoUpload } from '../hooks/useVideoUpload'
import ProgressBar from '../components/ui/ProgressBar'
import { formatFileSize, ALLOWED_EXTENSIONS, MAX_FILE_SIZE_MB } from '../utils/helpers'

const ACCEPT = ALLOWED_EXTENSIONS.map(e => `video/${e}`).join(',')

export default function UploadPage() {
    const navigate = useNavigate()
    const { upload, progress, uploading, error, uploadedVideo, reset } = useVideoUpload()

    const [dragActive, setDragActive] = useState(false)
    const [selectedFile, setSelectedFile] = useState(null)
    const [fileError, setFileError] = useState(null)
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const inputRef = useRef(null)

    // ── File validation ───────────────────────────────────────────────────
    const validateFile = (file) => {
        const ext = file.name.split('.').pop().toLowerCase()
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            return `File type ".${ext}" is not allowed. Use: ${ALLOWED_EXTENSIONS.join(', ')}`
        }
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            return `File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`
        }
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

    // ── Drag & Drop ───────────────────────────────────────────────────────
    const onDragOver = useCallback((e) => { e.preventDefault(); setDragActive(true) }, [])
    const onDragLeave = useCallback((e) => { e.preventDefault(); setDragActive(false) }, [])
    const onDrop = useCallback((e) => {
        e.preventDefault()
        setDragActive(false)
        const file = e.dataTransfer.files?.[0]
        if (file) handleFileSelect(file)
    }, [title])

    // ── Submit ────────────────────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!selectedFile || !title.trim()) return
        try {
            await upload(selectedFile, title.trim(), description.trim())
        } catch { /* error shown via hook */ }
    }

    // ── Success state ──────────────────────────────────────────────────────
    if (uploadedVideo) {
        return (
            <div style={pageStyle}>
                <div style={cardStyle}>
                    <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
                        <h2 style={{ color: '#22c55e', fontWeight: 800, marginBottom: '0.5rem' }}>Upload Successful!</h2>
                        <p style={{ color: '#94a3b8', marginBottom: '0.25rem' }}>{uploadedVideo.title}</p>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '2rem' }}>
                            ID: {uploadedVideo.id}
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button onClick={() => navigate('/videos')} style={primaryBtn}>🎬 View All Videos</button>
                            <button onClick={() => { reset(); setSelectedFile(null); setTitle(''); setDescription('') }} style={secondaryBtn}>
                                📤 Upload Another
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div style={pageStyle}>
            <div style={{ maxWidth: 640, width: '100%' }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 style={{
                        fontSize: '2.25rem', fontWeight: 800, marginBottom: '0.5rem',
                        background: 'linear-gradient(90deg, #e2e8f0, #a78bfa)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>Upload Video</h1>
                    <p style={{ color: '#64748b' }}>Supports MP4, AVI, MOV, MKV, WebM — up to {MAX_FILE_SIZE_MB} MB</p>
                </div>

                <form onSubmit={handleSubmit} style={cardStyle}>
                    {/* ── Drop Zone ── */}
                    <div
                        onClick={() => inputRef.current?.click()}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                        style={{
                            border: `2px dashed ${dragActive ? '#6c63ff' : selectedFile ? '#22c55e' : 'rgba(255,255,255,0.12)'}`,
                            borderRadius: 14,
                            padding: '2.5rem 1.5rem',
                            textAlign: 'center',
                            cursor: 'pointer',
                            background: dragActive
                                ? 'rgba(108,99,255,0.08)'
                                : selectedFile ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.02)',
                            transition: 'all 0.2s ease',
                            marginBottom: '1.5rem',
                        }}
                    >
                        <input
                            ref={inputRef}
                            type="file"
                            accept={ACCEPT}
                            style={{ display: 'none' }}
                            onChange={(e) => handleFileSelect(e.target.files?.[0])}
                        />
                        {selectedFile ? (
                            <>
                                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>
                                <p style={{ color: '#22c55e', fontWeight: 600, marginBottom: '0.25rem' }}>
                                    {selectedFile.name}
                                </p>
                                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
                                    {formatFileSize(selectedFile.size)}
                                </p>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setTitle(''); setFileError(null) }}
                                    style={{
                                        marginTop: '0.75rem', background: 'rgba(239,68,68,0.1)',
                                        border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
                                        color: '#f87171', padding: '4px 12px', fontSize: '0.8rem',
                                        cursor: 'pointer',
                                    }}
                                >
                                    ✕ Remove
                                </button>
                            </>
                        ) : (
                            <>
                                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>
                                    {dragActive ? '📂' : '📤'}
                                </div>
                                <p style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '0.25rem' }}>
                                    {dragActive ? 'Drop your video here' : 'Drag & drop your video here'}
                                </p>
                                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>or click to browse files</p>
                            </>
                        )}
                    </div>

                    {/* File error */}
                    {fileError && <ErrorBox message={fileError} />}

                    {/* ── Title ── */}
                    <div style={fieldGroup}>
                        <label style={labelStyle}>Video Title *</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Introduction to Machine Learning"
                            maxLength={200}
                            required
                            style={inputStyle}
                            onFocus={e => { e.target.style.borderColor = '#6c63ff'; e.target.style.boxShadow = '0 0 0 3px rgba(108,99,255,0.15)' }}
                            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
                        />
                    </div>

                    {/* ── Description ── */}
                    <div style={fieldGroup}>
                        <label style={labelStyle}>Description <span style={{ color: '#64748b' }}>(optional)</span></label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description of what this video covers..."
                            maxLength={1000}
                            rows={3}
                            style={{ ...inputStyle, resize: 'vertical', minHeight: 90, fontFamily: 'inherit' }}
                            onFocus={e => { e.target.style.borderColor = '#6c63ff'; e.target.style.boxShadow = '0 0 0 3px rgba(108,99,255,0.15)' }}
                            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
                        />
                    </div>

                    {/* ── Upload progress ── */}
                    {uploading && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <ProgressBar progress={progress} label="Uploading..." />
                            <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: 6, textAlign: 'center' }}>
                                Please do not close this tab while uploading.
                            </p>
                        </div>
                    )}

                    {/* Server error */}
                    {error && <ErrorBox message={error} />}

                    {/* ── Submit ── */}
                    <button
                        type="submit"
                        disabled={uploading || !selectedFile || !title.trim()}
                        style={{
                            ...primaryBtn,
                            width: '100%',
                            opacity: (uploading || !selectedFile || !title.trim()) ? 0.5 : 1,
                            cursor: (uploading || !selectedFile || !title.trim()) ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {uploading ? `⏳ Uploading... ${progress}%` : '🚀 Upload Video'}
                    </button>
                </form>
            </div>
        </div>
    )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ErrorBox({ message }) {
    return (
        <div style={{
            marginBottom: '1rem', padding: '10px 14px', borderRadius: 8,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            color: '#f87171', fontSize: '0.875rem', display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
            <span>⚠️</span>
            <span>{message}</span>
        </div>
    )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle = {
    minHeight: '100vh', paddingTop: 90, paddingBottom: 60,
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: '90px 1.5rem 60px',
}
const cardStyle = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20, padding: '2rem',
}
const fieldGroup = { marginBottom: '1.25rem' }
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
const secondaryBtn = {
    padding: '12px 28px', borderRadius: 10, cursor: 'pointer',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#e2e8f0', fontSize: '0.95rem', fontWeight: 600,
}
