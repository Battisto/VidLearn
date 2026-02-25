/**
 * Shared utility helpers for the frontend.
 */

export function formatFileSize(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}

export const STATUS_CONFIG = {
    uploaded: { label: 'Uploaded', color: '#6c63ff', bg: 'rgba(108,99,255,0.15)' },
    processing: { label: 'Processing', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
    transcribing: { label: 'Transcribing', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
    summarizing: { label: 'Summarizing', color: '#a855f7', bg: 'rgba(168,85,247,0.15)' },
    completed: { label: 'Completed', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
    failed: { label: 'Failed', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
}

export const ALLOWED_EXTENSIONS = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'mpeg', 'ogg']
export const MAX_FILE_SIZE_MB = 500
