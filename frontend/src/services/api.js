const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

/**
 * Generic API request helper.
 * Throws an error with the server message if the response is not OK.
 */
async function request(method, path, body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
    }
    if (body) options.body = JSON.stringify(body)

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
    put: (path, body) => request('PUT', path, body),
    delete: (path) => request('DELETE', path),

    // Health
    health: () => api.get('/health'),
}
