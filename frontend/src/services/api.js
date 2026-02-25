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
        upload: (fd) => api.postForm('/videos/upload', fd),
        list: (p = 1, s = 20) => api.get(`/videos/?page=${p}&page_size=${s}`),
        get: (id) => api.get(`/videos/${id}`),
        delete: (id) => api.delete(`/videos/${id}`),
        // Phase 3
        extractAudio: (id) => api.post(`/videos/${id}/extract-audio`),
        audioStatus: (id) => api.get(`/videos/${id}/audio-status`),
        // Phase 4
        transcribe: (id, model) => api.post(`/videos/${id}/transcribe${model ? `?model=${model}` : ''}`),
        getTranscript: (id) => api.get(`/videos/${id}/transcript`),
        transcriptionStatus: (id) => api.get(`/videos/${id}/transcription-status`),
        // Phase 5
        preprocess: (id) => api.post(`/videos/${id}/preprocess`),
        getPreprocessing: (id) => api.get(`/videos/${id}/preprocessing`),
        preprocessingStatus: (id) => api.get(`/videos/${id}/preprocessing-status`),
        // Phase 6
        summarize: (id, prov) => api.post(`/videos/${id}/summarize${prov ? `?provider=${prov}` : ''}`),
        getSummary: (id) => api.get(`/videos/${id}/summary`),
        summarizationStatus: (id) => api.get(`/videos/${id}/summarization-status`),
    },
}
