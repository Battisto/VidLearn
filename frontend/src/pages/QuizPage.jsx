import { useState, useEffect, useContext } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { api } from '../services/api'
import { AuthContext } from '../context/AuthContext'

const DIFF_COLORS = {
    easy: { color: '#4ade80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.25)' },
    medium: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.25)' },
    hard: { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)' },
    mixed: { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.25)' },
}

export default function QuizPage() {
    const { quizId } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const { user } = useContext(AuthContext)

    const [quiz, setQuiz] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [answers, setAnswers] = useState([])      // chosen option index per question
    const [current, setCurrent] = useState(0)       // current question index
    const [submitting, setSub] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [showAll, setShowAll] = useState(false)   // show all at once vs one at a time

    // Pre-fill from location state if navigated from generation
    const videoId = location.state?.videoId

    useEffect(() => {
        const load = async () => {
            try {
                const data = await api.quizzes.getQuiz(quizId)
                setQuiz(data)
                setAnswers(new Array(data.total_questions).fill(-1))
            } catch (e) {
                setError(e.message)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [quizId])

    const handleSelect = (qIdx, optIdx) => {
        if (submitted) return
        setAnswers(a => { const n = [...a]; n[qIdx] = optIdx; return n })
    }

    const handleSubmit = async () => {
        if (answers.some(a => a === -1)) {
            alert('Please answer all questions before submitting.')
            return
        }
        setSub(true)
        try {
            const result = await api.quizzes.submit(quizId, answers, user?.id || user?._id)
            navigate(`/quiz/${quizId}/results`, {
                state: { attempt: result, quiz, videoId }
            })
        } catch (e) {
            setError(e.message)
            setSub(false)
        }
    }

    if (loading) return <Shell><Spinner text="Loading quiz…" /></Shell>
    if (error) return <Shell><ErrorMsg msg={error} onBack={() => navigate(-1)} /></Shell>
    if (!quiz) return <Shell><ErrorMsg msg="Quiz not found." onBack={() => navigate('/videos')} /></Shell>

    const answered = answers.filter(a => a !== -1).length
    const total = quiz.total_questions
    const allDone = answered === total
    const dc = DIFF_COLORS[quiz.difficulty] || DIFF_COLORS.mixed

    return (
        <div style={pageStyle}>
            <div style={{ maxWidth: 740, width: '100%' }}>

                {/* Header */}
                <div style={{ marginBottom: '1.75rem' }}>
                    <button onClick={() => navigate(videoId ? `/videos/${videoId}/summary` : '/videos')} style={ghostBtn}>
                        ← Back to Summary
                    </button>
                    <h1 style={headingStyle}>{quiz.title}</h1>

                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.5rem' }}>
                        <Badge color={dc.color} bg={dc.bg} border={dc.border}>
                            {quiz.difficulty === 'mixed' ? '🎲 Mixed' :
                                quiz.difficulty === 'easy' ? '🟢 Easy' :
                                    quiz.difficulty === 'medium' ? '🟡 Medium' : '🔴 Hard'}
                        </Badge>
                        <Badge color="#94a3b8" bg="rgba(255,255,255,0.04)" border="rgba(255,255,255,0.1)">
                            📋 {total} questions
                        </Badge>
                        <Badge
                            color={allDone ? '#4ade80' : '#a78bfa'}
                            bg={allDone ? 'rgba(74,222,128,0.1)' : 'rgba(167,139,250,0.1)'}
                            border={allDone ? 'rgba(74,222,128,0.25)' : 'rgba(167,139,250,0.25)'}
                        >
                            {answered}/{total} answered
                        </Badge>
                    </div>
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <div style={trackStyle}>
                        <div style={{
                            ...fillStyle,
                            width: `${(answered / total) * 100}%`,
                            background: allDone ? 'linear-gradient(90deg, #4ade80, #22c55e)' : 'linear-gradient(90deg, #6c63ff, #a855f7)',
                        }} />
                    </div>
                </div>

                {/* View toggle */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <button onClick={() => setShowAll(false)}
                        style={{ ...modeBtn, ...(showAll ? {} : activeModeBtn) }}>
                        One at a time
                    </button>
                    <button onClick={() => setShowAll(true)}
                        style={{ ...modeBtn, ...(showAll ? activeModeBtn : {}) }}>
                        All questions
                    </button>
                </div>

                {/* Questions */}
                {showAll ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {quiz.questions.map((q, qi) => (
                            <QuestionCard
                                key={qi}
                                qi={qi}
                                q={q}
                                chosen={answers[qi]}
                                onSelect={(oi) => handleSelect(qi, oi)}
                                submitted={submitted}
                            />
                        ))}
                    </div>
                ) : (
                    <div>
                        <QuestionCard
                            qi={current}
                            q={quiz.questions[current]}
                            chosen={answers[current]}
                            onSelect={(oi) => { handleSelect(current, oi) }}
                            submitted={submitted}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
                            <button
                                disabled={current === 0}
                                onClick={() => setCurrent(c => c - 1)}
                                style={{ ...navBtn, opacity: current === 0 ? 0.4 : 1 }}
                            >← Previous</button>
                            <span style={{ color: '#64748b', fontSize: '0.85rem', alignSelf: 'center' }}>
                                {current + 1} / {total}
                            </span>
                            <button
                                disabled={current === total - 1}
                                onClick={() => setCurrent(c => c + 1)}
                                style={{ ...navBtn, opacity: current === total - 1 ? 0.4 : 1 }}
                            >Next →</button>
                        </div>
                    </div>
                )}

                {/* Submit */}
                {error && <p style={{ color: '#f87171', marginTop: '1rem', textAlign: 'center' }}>⚠️ {error}</p>}
                <button
                    onClick={handleSubmit}
                    disabled={!allDone || submitting}
                    style={{
                        ...submitBtn,
                        marginTop: '2rem',
                        opacity: (!allDone || submitting) ? 0.5 : 1,
                        cursor: (!allDone || submitting) ? 'not-allowed' : 'pointer',
                    }}
                >
                    {submitting ? '⏳ Submitting…' : `📊 Submit Quiz (${answered}/${total})`}
                </button>
                {!allDone && (
                    <p style={{ color: '#475569', fontSize: '0.78rem', textAlign: 'center', marginTop: '0.4rem' }}>
                        Answer all {total} questions to submit
                    </p>
                )}
            </div>
        </div>
    )
}

// ── Question card ─────────────────────────────────────────────────────────────

function QuestionCard({ qi, q, chosen, onSelect, submitted }) {
    const dc = DIFF_COLORS[q.difficulty] || DIFF_COLORS.medium
    return (
        <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 16, padding: '1.5rem',
        }}>
            {/* Question header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{ color: '#6c63ff', fontWeight: 700, fontSize: '0.82rem' }}>
                    Q{qi + 1}
                </span>
                <span style={{
                    fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                    background: dc.bg, color: dc.color, border: `1px solid ${dc.border}`,
                }}>
                    {q.difficulty}
                </span>
            </div>

            <p style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.95rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                {q.question}
            </p>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {q.options.map((opt, oi) => {
                    const isChosen = chosen === oi
                    return (
                        <button
                            key={oi}
                            onClick={() => onSelect(oi)}
                            style={{
                                padding: '10px 14px', borderRadius: 10, textAlign: 'left',
                                cursor: submitted ? 'default' : 'pointer',
                                fontSize: '0.9rem', fontWeight: isChosen ? 600 : 400,
                                transition: 'all 0.15s ease',
                                background: isChosen
                                    ? 'rgba(108,99,255,0.18)'
                                    : 'rgba(255,255,255,0.03)',
                                border: isChosen
                                    ? '1.5px solid rgba(108,99,255,0.6)'
                                    : '1px solid rgba(255,255,255,0.07)',
                                color: isChosen ? '#c4b5fd' : '#94a3b8',
                            }}
                        >
                            <span style={{ color: '#6c63ff', fontWeight: 700, marginRight: 8 }}>
                                {String.fromCharCode(65 + oi)}.
                            </span>
                            {opt}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Shell({ children }) {
    return (
        <div style={{ minHeight: '100vh', padding: '90px 2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {children}
        </div>
    )
}
function Spinner({ text }) {
    return <div style={{ textAlign: 'center', color: '#64748b' }}><div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⏳</div>{text}</div>
}
function ErrorMsg({ msg, onBack }) {
    return (
        <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>❌</div>
            <p style={{ color: '#f87171', marginBottom: '1rem' }}>{msg}</p>
            <button onClick={onBack} style={ghostBtn}>← Go Back</button>
        </div>
    )
}
function Badge({ color, bg, border, children }) {
    return (
        <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, color, background: bg, border: `1px solid ${border}` }}>
            {children}
        </span>
    )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const pageStyle = { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '90px 1.5rem 60px' }
const headingStyle = { fontSize: '1.7rem', fontWeight: 800, color: '#e2e8f0', margin: '0.75rem 0 0', background: 'linear-gradient(90deg, #e2e8f0, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }
const trackStyle = { height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }
const fillStyle = { height: '100%', borderRadius: 999, transition: 'width 0.5s ease' }
const ghostBtn = { padding: '8px 16px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: '0.875rem', fontWeight: 600 }
const navBtn = { padding: '8px 18px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontWeight: 600 }
const submitBtn = { width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #a855f7)', color: '#fff', fontWeight: 700, fontSize: '1rem' }
const modeBtn = { padding: '6px 14px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#475569', fontSize: '0.82rem', fontWeight: 600 }
const activeModeBtn = { background: 'rgba(108,99,255,0.15)', border: '1px solid rgba(108,99,255,0.4)', color: '#a78bfa' }
