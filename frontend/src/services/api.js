const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

async function request(method, path, body = null, isFormData = false) {
    const options = { method }
    const headers = {}
    
    // Auth token
    const token = localStorage.getItem('token')
    if (token) {
        headers['Authorization'] = `Bearer ${token}`
    }

    if (isFormData) {
        options.body = body
        // Browser sets multipart boundary automatically
    } else if (body) {
        headers['Content-Type'] = 'application/json'
        options.body = JSON.stringify(body)
    }
    
    options.headers = headers
    
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
        uploadText: (title, text, description) => api.post('/videos/upload-text', { title, text, description }),
        list: (p = 1, s = 20) => api.get(`/videos/?page=${p}&page_size=${s}`),
        get: (id) => api.get(`/videos/${id}`),
        delete: (id) => api.delete(`/videos/${id}`),
        // YouTube import
        importYouTube: (url, titleOverride, descOverride) => api.post('/videos/import-youtube', {
            url,
            title_override: titleOverride || null,
            description_override: descOverride || null,
        }),
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
        summarize: (id, prov, level) => {
            const params = new URLSearchParams()
            if (prov) params.append('provider', prov)
            if (level) params.append('level', level)
            const qs = params.toString()
            return api.post(`/videos/${id}/summarize${qs ? `?${qs}` : ''}`)
        },
        getSummary: (id) => api.get(`/videos/${id}/summary`),
        getSummaryLevels: () => api.get('/videos/summarize-levels'),
        // Pipeline (auto)
        startPipeline: (id, model, provider) => {
            const params = new URLSearchParams()
            if (model) params.append('model', model)
            if (provider) params.append('provider', provider)
            const qs = params.toString()
            return api.post(`/videos/${id}/process${qs ? `?${qs}` : ''}`)
        },
        processStatus: (id) => api.get(`/videos/${id}/process-status`),
    },
    quizzes: {
        generate: (videoId, numQuestions = 10, difficulty = null) =>
            api.post('/quizzes/generate', { video_id: videoId, num_questions: numQuestions, difficulty }),
        getQuiz: (quizId) => api.get(`/quizzes/${quizId}`),
        getQuizForVideo: (videoId) => api.get(`/quizzes/video/${videoId}`),
        submit: (quizId, answers, userId = null) =>
            api.post(`/quizzes/${quizId}/submit`, { answers, user_id: userId }),
        getAttempt: (attemptId) => api.get(`/quizzes/attempt/${attemptId}`),
        getMyAttempts: () => api.get('/quizzes/attempts/me'),
    },
    translations: {
        translateText: (text, source = 'auto', target = 'ta', videoId = null) =>
            api.post('/translate/translate-text', { text, source, target, video_id: videoId }),
        detectLanguage: (text) =>
            api.post('/translate/detect', { text })
    },
    users: {
        register: (email, password, fullName) => 
            api.post('/users/register', { email, password, full_name: fullName }),
        login: (email, password) => 
            api.post('/users/login', { email, password }),
        getMe: () => 
            api.get('/users/me'),
    }
}
