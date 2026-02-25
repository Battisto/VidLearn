import { useState, useCallback } from 'react'
import { api } from '../services/api'

/**
 * useVideoUpload — manages the full upload lifecycle:
 * progress, error, success, and cancellation.
 */
export function useVideoUpload() {
    const [progress, setProgress] = useState(0)       // 0–100
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState(null)
    const [uploadedVideo, setUploadedVideo] = useState(null)

    const upload = useCallback(async (file, title, description = '') => {
        setUploading(true)
        setError(null)
        setProgress(0)
        setUploadedVideo(null)

        try {
            // Use XMLHttpRequest for real upload progress tracking
            const result = await uploadWithProgress(file, title, description, setProgress)
            setUploadedVideo(result)
            setProgress(100)
            return result
        } catch (err) {
            setError(err.message || 'Upload failed. Please try again.')
            throw err
        } finally {
            setUploading(false)
        }
    }, [])

    const reset = useCallback(() => {
        setProgress(0)
        setUploading(false)
        setError(null)
        setUploadedVideo(null)
    }, [])

    return { upload, progress, uploading, error, uploadedVideo, reset }
}

function uploadWithProgress(file, title, description, onProgress) {
    return new Promise((resolve, reject) => {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'
        const xhr = new XMLHttpRequest()
        const formData = new FormData()
        formData.append('file', file)
        formData.append('title', title)
        if (description) formData.append('description', description)

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                onProgress(Math.round((e.loaded / e.total) * 95)) // cap at 95 during upload
            }
        })

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    resolve(JSON.parse(xhr.responseText))
                } catch {
                    reject(new Error('Invalid server response'))
                }
            } else {
                try {
                    const err = JSON.parse(xhr.responseText)
                    reject(new Error(err.detail || `Upload failed with status ${xhr.status}`))
                } catch {
                    reject(new Error(`Upload failed with status ${xhr.status}`))
                }
            }
        })

        xhr.addEventListener('error', () => reject(new Error('Network error. Check your connection.')))
        xhr.addEventListener('abort', () => reject(new Error('Upload was cancelled.')))

        xhr.open('POST', `${API_BASE}/videos/upload`)
        xhr.send(formData)
    })
}
