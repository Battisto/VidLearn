import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import StatusBadge from '../components/ui/StatusBadge'

export default function SummaryPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [showChunks, setShowChunks] = useState(false)
    const [copied, setCopied] = useState(false)
    // Translation state
    const [lang, setLang] = useState('en')
    const [translating, setTranslating] = useState(false)
    const [translatedText, setTranslatedText] = useState(null)
    const [transError, setTransError] = useState(null)
    // Quiz generation state
    const [quizDiff, setQuizDiff] = useState('mixed')
    const [quizCount, setQuizCount] = useState(10)
    const [genQuiz, setGenQuiz] = useState(false)
    const [quizError, setQuizError] = useState(null)

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            setError(null)
            try {
                const result = await api.videos.getSummary(id)
                setData(result)
            } catch (err) {
                setError(err.message)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [id])

    const handleCopy = () => {
        const textToCopy = lang === 'ta' && translatedText ? translatedText : data?.summary
        if (!textToCopy) return
        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    const toggleLanguage = async () => {
        if (lang === 'en') {
            if (translatedText) {
                setLang('ta')
                return
            }
            // Fetch translation
            setTranslating(true)
            setTransError(null)
            try {
                const res = await api.translations.translateText(data.summary, 'en', 'ta', id)
                setTranslatedText(res.translated_text)
                setLang('ta')
            } catch (err) {
                setTransError('Failed to translate: ' + err.message)
            } finally {
                setTranslating(false)
            }
        } else {
            setLang('en')
        }
    }

    if (loading) return (
        <PageShell>
            <div style={{ textAlign: 'center', color: '#64748b' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                Loading summary...
            </div>
        </PageShell>
    )

    if (error) return (
        <PageShell>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
                <p style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</p>
                <button onClick={() => navigate('/videos')} style={backBtn}>← Back to Videos</button>
            </div>
        </PageShell>
    )

    if (!data?.summary) return (
        <PageShell>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
                <h2 style={{ color: '#e2e8f0', marginBottom: '0.5rem' }}>No Summary Yet</h2>
                <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>Run AI summarization on this video first.</p>
                <button onClick={() => navigate('/videos')} style={backBtn}>← Back to Videos</button>
            </div>
        </PageShell>
    )

    const meta = data.summary_metadata
    const level = meta?.summary_level || 'standard'
    const isComprehensive = level === 'comprehensive'

    // Try to parse comprehensive structured summary from the stored text
    const structured = _parseComprehensive(data.summary, isComprehensive)

    const levelColors = {
        brief: { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', icon: '📌' },
        standard: { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', icon: '📝' },
        detailed: { color: '#34d399', bg: 'rgba(52,211,153,0.1)', icon: '📖' },
        comprehensive: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', icon: '🌟' },
    }
    const lc = levelColors[level] || levelColors.standard

    const providerBadge = meta?.provider === 'gemini'
        ? { label: '✨ Gemini 1.5 Flash', color: '#4285f4', bg: 'rgba(66,133,244,0.12)' }
        : { label: '🤗 BART Large CNN', color: '#ff6b35', bg: 'rgba(255,107,53,0.12)' }

    return (
        <div style={{ minHeight: '100vh', padding: '90px 2rem 60px' }}>
            <div style={{ maxWidth: 900, margin: '0 auto' }}>

                {/* ── Header ── */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <button onClick={() => navigate('/videos')} style={backBtn}>← Videos</button>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#e2e8f0', margin: '0.75rem 0 0.5rem' }}>
                        📋 {data.title}
                    </h1>

                    {/* Badges row */}
                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <StatusBadge status={data.status} />

                        {/* Level badge */}
                        <span style={{
                            padding: '3px 12px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700,
                            background: lc.bg, color: lc.color, border: `1px solid ${lc.color}33`,
                        }}>
                            {lc.icon} {meta?.summary_level_label || level}
                        </span>

                        {/* Provider badge */}
                        <span style={{
                            padding: '3px 12px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700,
                            background: providerBadge.bg, color: providerBadge.color,
                            border: `1px solid ${providerBadge.color}33`,
                        }}>{providerBadge.label}</span>

                        {meta && (<>
                            <Chip>📝 {meta.summary_word_count} words</Chip>
                            <Chip>🧩 {meta.chunk_count} chunks</Chip>
                            <Chip>📖 {meta.input_word_count?.toLocaleString()} input words</Chip>
                        </>)}
                    </div>
                </div>

                {/* ── Compression bar ── */}
                {meta && meta.input_word_count > 0 && (
                    <div style={{
                        padding: '1rem 1.25rem', borderRadius: 12, marginBottom: '1.5rem',
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>🗜️ Compression</span>
                            <span style={{ color: '#ec4899', fontSize: '0.85rem', fontWeight: 700 }}>
                                {(meta.input_word_count / meta.summary_word_count).toFixed(1)}× · {((1 - meta.summary_word_count / meta.input_word_count) * 100).toFixed(0)}% reduced
                            </span>
                        </div>
                        <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                            <div style={{
                                height: '100%', borderRadius: 999,
                                background: 'linear-gradient(90deg, #ec4899, #a855f7)',
                                width: `${Math.min(100, (meta.summary_word_count / meta.input_word_count) * 100)}%`,
                                transition: 'width 0.8s ease',
                            }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                            <span style={{ color: '#64748b', fontSize: '0.7rem' }}>Summary ({meta.summary_word_count} words)</span>
                            <span style={{ color: '#64748b', fontSize: '0.7rem' }}>Original ({meta.input_word_count?.toLocaleString()} words)</span>
                        </div>
                    </div>
                )}

                {/* ── Toolbar: Translate & Copy ── */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
                    {transError && <span style={{ color: '#f87171', fontSize: '0.8rem' }}>{transError}</span>}
                    <button
                        onClick={toggleLanguage}
                        disabled={translating}
                        style={{
                            padding: '8px 16px', borderRadius: 8, cursor: translating ? 'wait' : 'pointer',
                            background: lang === 'ta' ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${lang === 'ta' ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.1)'}`,
                            color: lang === 'ta' ? '#c4b5fd' : '#94a3b8', fontSize: '0.875rem', fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                        }}
                    >
                        {translating ? '⏳ Translating...' : lang === 'ta' ? '🌐 View original (EN)' : '🌐 Translate to Tamil'}
                    </button>

                    <button onClick={handleCopy} style={{
                        padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                        background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`,
                        color: copied ? '#4ade80' : '#94a3b8', fontSize: '0.875rem', fontWeight: 600,
                    }}>{copied ? '✅ Copied!' : '📋 Copy Summary'}</button>
                </div>

                {/* ── COMPREHENSIVE: structured sections ── */}
                {lang === 'en' && isComprehensive && structured ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>

                        {/* Overview */}
                        <Section
                            title="📌 Overview"
                            accentColor="#fbbf24"
                            content={<p style={bodyText}>{structured.overview}</p>}
                        />

                        {/* Key Concepts */}
                        {structured.keyConcepts?.length > 0 && (
                            <Section title="🔑 Key Concepts" accentColor="#a78bfa">
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    {structured.keyConcepts.map((c, i) => (
                                        <span key={i} style={{
                                            padding: '4px 12px', borderRadius: 999,
                                            background: 'rgba(167,139,250,0.12)',
                                            border: '1px solid rgba(167,139,250,0.25)',
                                            color: '#c4b5fd', fontSize: '0.8rem', fontWeight: 600,
                                        }}>{c}</span>
                                    ))}
                                </div>
                            </Section>
                        )}

                        {/* Section summaries */}
                        {structured.sections?.length > 0 && (
                            <Section title="📂 Section Summaries" accentColor="#34d399">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                    {structured.sections.map((s, i) => (
                                        <div key={i} style={{
                                            padding: '0.8rem 1rem', borderRadius: 10,
                                            background: 'rgba(52,211,153,0.04)',
                                            border: '1px solid rgba(52,211,153,0.12)',
                                        }}>
                                            <span style={{
                                                color: '#34d399', fontWeight: 700, fontSize: '0.75rem',
                                                letterSpacing: '0.05em'
                                            }}>SECTION {s.section}</span>
                                            <p style={{ ...bodyText, marginTop: 4, color: '#94a3b8' }}>{s.summary}</p>
                                        </div>
                                    ))}
                                </div>
                            </Section>
                        )}

                        {/* Takeaways */}
                        {structured.takeaways?.length > 0 && (
                            <Section title="✅ Key Takeaways" accentColor="#60a5fa">
                                <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                                    {structured.takeaways.map((t, i) => (
                                        <li key={i} style={{ ...bodyText, color: '#94a3b8', marginBottom: 6 }}>{t}</li>
                                    ))}
                                </ul>
                            </Section>
                        )}
                    </div>
                ) : (
                    // ── Standard / Brief / Detailed: plain summary card ──
                    <div style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: `1px solid ${lc.color}22`,
                        borderRadius: 16, padding: '2rem', marginBottom: '1.5rem',
                        boxShadow: `0 0 40px ${lc.color}08`,
                    }}>
                        <div style={{
                            height: 3, borderRadius: 999, marginBottom: '1.5rem',
                            background: `linear-gradient(90deg, ${lc.color}, #ec4899)`,
                        }} />
                        <p style={{
                            color: '#e2e8f0', lineHeight: 1.9, fontSize: '1rem',
                            whiteSpace: 'pre-wrap', margin: 0
                        }}>
                            {lang === 'ta' ? translatedText : data.summary}
                        </p>
                    </div>
                )}

                {/* ── Generate Quiz panel ── */}
                <div style={{
                    marginTop: '2rem',
                    padding: '1.5rem', borderRadius: 16,
                    background: 'rgba(108,99,255,0.04)',
                    border: '1px solid rgba(108,99,255,0.18)',
                }}
                >
                    <h3 style={{ color: '#a78bfa', fontWeight: 700, fontSize: '1rem', marginBottom: '0.85rem' }}>
                        🎓 Generate Quiz from this content
                    </h3>

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                        {/* Difficulty */}
                        <div>
                            <p style={{
                                color: '#64748b', fontSize: '0.72rem', fontWeight: 700,
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                                marginBottom: '0.4rem'
                            }}>Difficulty</p>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                {['mixed', 'easy', 'medium', 'hard'].map(d => (
                                    <button key={d} onClick={() => setQuizDiff(d)}
                                        style={{
                                            padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                                            fontSize: '0.78rem', fontWeight: 700,
                                            textTransform: 'capitalize',
                                            background: quizDiff === d ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${quizDiff === d ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.08)'}`,
                                            color: quizDiff === d ? '#c4b5fd' : '#64748b',
                                        }}>{d}</button>
                                ))}
                            </div>
                        </div>

                        {/* Count */}
                        <div>
                            <p style={{
                                color: '#64748b', fontSize: '0.72rem', fontWeight: 700,
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                                marginBottom: '0.4rem'
                            }}>Questions</p>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                {[5, 10, 15, 20].map(n => (
                                    <button key={n} onClick={() => setQuizCount(n)}
                                        style={{
                                            padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                                            fontSize: '0.78rem', fontWeight: 700,
                                            background: quizCount === n ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${quizCount === n ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.08)'}`,
                                            color: quizCount === n ? '#c4b5fd' : '#64748b',
                                        }}>{n}</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {quizError && (
                        <p style={{ color: '#f87171', fontSize: '0.82rem', marginBottom: '0.75rem' }}>⚠️ {quizError}</p>
                    )}

                    <button
                        disabled={genQuiz}
                        onClick={async () => {
                            setGenQuiz(true); setQuizError(null)
                            try {
                                const quiz = await api.quizzes.generate(id, quizCount, quizDiff === 'mixed' ? null : quizDiff)
                                navigate(`/quiz/${quiz._id || quiz.quiz_id}`, { state: { videoId: id } })
                            } catch (e) {
                                setQuizError(e.message)
                                setGenQuiz(false)
                            }
                        }}
                        style={{
                            padding: '11px 24px', borderRadius: 10, border: 'none',
                            background: genQuiz ? 'rgba(167,139,250,0.25)' : 'linear-gradient(135deg, #6c63ff, #a855f7)',
                            color: '#fff', fontWeight: 700, cursor: genQuiz ? 'wait' : 'pointer',
                            fontSize: '0.95rem', opacity: genQuiz ? 0.7 : 1,
                        }}
                    >
                        {genQuiz ? '⏳ Generating Quiz…' : `🎓 Generate ${quizCount}-Question Quiz`}
                    </button>
                </div>
                {data.chunk_summaries?.length > 0 && (
                    <div>
                        <button
                            onClick={() => setShowChunks(v => !v)}
                            style={{
                                padding: '8px 18px', borderRadius: 8, cursor: 'pointer',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#94a3b8', fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem',
                            }}
                        >
                            {showChunks ? '▲' : '▼'} {showChunks ? 'Hide' : 'Show'} Chunk Summaries ({data.chunk_summaries.length})
                        </button>

                        {showChunks && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {data.chunk_summaries.map((s, i) => (
                                    <div key={i} style={{
                                        padding: '1rem 1.25rem', borderRadius: 12,
                                        background: 'rgba(255,255,255,0.02)',
                                        border: '1px solid rgba(255,255,255,0.07)',
                                    }}>
                                        <div style={{
                                            color: '#a855f7', fontWeight: 700,
                                            fontSize: '0.78rem', marginBottom: 6
                                        }}>
                                            CHUNK {i + 1}
                                        </div>
                                        <p style={{ color: '#94a3b8', lineHeight: 1.75, fontSize: '0.9rem', margin: 0 }}>{s}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Parse comprehensive summary text into structured sections ─────────────────
function _parseComprehensive(text, isComprehensive) {
    if (!isComprehensive || !text) return null
    try {
        const lines = text.split('\n')
        let section = null
        const sections = { overview: [], keyConcepts: [], sectionSummaries: [], takeaways: [] }

        for (const line of lines) {
            if (line.startsWith('OVERVIEW')) { section = 'overview'; continue }
            if (line.startsWith('KEY CONCEPTS')) { section = 'keyConcepts'; continue }
            if (line.startsWith('SECTION SUMMARIES')) { section = 'sectionSummaries'; continue }
            if (line.startsWith('TAKEAWAYS')) { section = 'takeaways'; continue }
            if (line.startsWith('─') || line.trim() === '') continue
            if (section) sections[section].push(line.trim())
        }

        const keyConcepts = sections.keyConcepts.join(' ').split(', ').filter(Boolean)
        const takeaways = sections.takeaways.map(t => t.replace(/^•\s*/, '').trim()).filter(Boolean)
        const sectionParsed = sections.sectionSummaries.map(l => {
            const m = l.match(/^\[(\d+)\]\s*(.+)$/)
            return m ? { section: parseInt(m[1]), summary: m[2] } : null
        }).filter(Boolean)

        return {
            overview: sections.overview.join(' ').trim() || text,
            keyConcepts: keyConcepts.length ? keyConcepts : [],
            sections: sectionParsed,
            takeaways: takeaways,
        }
    } catch { return null }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, accentColor = '#a78bfa', content, children }) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: `1px solid ${accentColor}22`,
            borderRadius: 16, padding: '1.5rem',
            boxShadow: `0 0 30px ${accentColor}06`,
        }}>
            <div style={{
                height: 2, borderRadius: 999, marginBottom: '1.25rem',
                background: `linear-gradient(90deg, ${accentColor}, transparent)`,
            }} />
            <h3 style={{
                color: accentColor, fontWeight: 700, fontSize: '1rem',
                marginBottom: '0.85rem', margin: '0 0 0.85rem'
            }}>
                {title}
            </h3>
            {content || children}
        </div>
    )
}

function PageShell({ children }) {
    return (
        <div style={{
            minHeight: '100vh', padding: '90px 2rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{children}</div>
    )
}

function Chip({ children }) {
    return (
        <span style={{
            padding: '3px 10px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#94a3b8',
        }}>{children}</span>
    )
}

const backBtn = {
    padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#94a3b8', fontSize: '0.875rem', fontWeight: 600,
}
const bodyText = { lineHeight: 1.75, fontSize: '0.9rem', margin: 0 }
