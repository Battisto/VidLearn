const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

async function request(method, path, body = null, isFormData = false) {
    const options = { method }
    if (isFormData) {
        options.body = body
    } else if (body) {
        options.headers = { 'Content-Type': 'application/json' }
        options.body = JSON.stringify(body)
    }
    const res = await fetch(`${API_BASE}${path}`, options)
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail || `HTTP ${res.status}`)
    }
    return res.json()
}

export const api = {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    postForm: (path, formData) => request('POST', path, formData, true),
    put: (path, body) => request('PUT', path, body),
    delete: (path) => request('DELETE', path),

    health: () => api.get('/health'),

    videos: {
        upload: (formData) => api.postForm('/videos/upload', formData),
        list: (page = 1, size = 20) => api.get(`/videos/?page=${page}&page_size=${size}`),
        get: (id) => api.get(`/videos/${id}`),
        delete: (id) => api.delete(`/videos/${id}`),
        extractAudio: (id) => api.post(`/videos/${id}/extract-audio`),
        audioStatus: (id) => api.get(`/videos/${id}/audio-status`),
    },
}
