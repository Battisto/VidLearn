import { useState, useEffect } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../services/api'

const GRADE_DATA = {
    A: { label: 'A', color: '#4ade80', emoji: '', msg: 'Excellent! Outstanding performance!' },
    B: { label: 'B', color: '#60a5fa', emoji: '', msg: 'Great job! Well above average.' },
    C: { label: 'C', color: '#fbbf24', emoji: '', msg: 'Good effort! Keep reviewing.' },
    D: { label: 'D', color: '#fb923c', emoji: '', msg: 'Needs improvement. Review the material.' },
    F: { label: 'F', color: '#f87171', emoji: '', msg: 'Don\'t give up! Study the transcript.' },
}

export default function QuizResultsPage() {
    const { quizId } = useParams()
    const navigate = useNavigate()
    const location = useLocation()

    const attemptFromState = location.state?.attempt
    const quizFromState = location.state?.quiz
    const videoIdFromState = location.state?.videoId

    const [attempt, setAttempt] = useState(attemptFromState)
    // eslint-disable-next-line no-unused-vars
    const [quiz, setQuiz] = useState(quizFromState)
    const [loading, setLoading] = useState(!attemptFromState)
    const [error, setError] = useState(null)
    const [showDetails, setShowDetails] = useState(false)
    const [filter, setFilter] = useState('all')   // 'all' | 'correct' | 'wrong'

    const query = new URLSearchParams(location.search)
    const attemptId = query.get('attempt')

    useEffect(() => {
        if (!attempt && attemptId) {
            const load = async () => {
                setLoading(true)
                try {
                    const data = await api.quizzes.getAttempt(attemptId)
                    setAttempt(data)
                } catch (e) {
                    setError(e.message)
                } finally {
                    setLoading(false)
                }
            }
            load()
        }
    }, [attempt, attemptId])

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ color: '#64748b' }}>Loading results...</p>
            </div>
        )
    }

    if (error || !attempt) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                <div style={{ textAlign: 'center' }}>
                    <p style={{ color: '#f87171', marginBottom: '1rem' }}>{error || 'No attempt data found.'}</p>
                    <button onClick={() => navigate('/videos')} style={ghostBtn}>← Videos</button>
                </div>
            </div>
        )
    }

    const { score, total, percentage, grade, results } = attempt
    const videoId = videoIdFromState || attempt.video_id
    const gd = GRADE_DATA[grade] || GRADE_DATA.F

    const filtered = results.filter(r =>
        filter === 'all' ? true :
            filter === 'correct' ? r.is_correct :
                !r.is_correct
    )

    const correctCount = results.filter(r => r.is_correct).length
    const wrongCount = total - correctCount

    return (
        <div style={pageStyle}>
            <div style={{ maxWidth: 760, width: '100%' }}>

                {/* Score card */}
                <div style={{
                    textAlign: 'center', marginBottom: '2.5rem',
                    padding: '2.5rem 2rem',
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${gd.color}33`,
                    borderRadius: 24,
                    boxShadow: `0 0 60px ${gd.color}0d`,
                }}>
                    <div style={{ fontSize: '4rem', marginBottom: '0.5rem' }}>{gd.emoji}</div>

                    {/* Grade circle */}
                    <div style={{
                        width: 90, height: 90, borderRadius: '50%', margin: '0 auto 1rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `radial-gradient(circle, ${gd.color}22, transparent)`,
                        border: `3px solid ${gd.color}`,
                    }}>
                        <span style={{ fontSize: '2.5rem', fontWeight: 900, color: gd.color }}>{grade}</span>
                    </div>

                    <h1 style={{
                        fontSize: '2rem', fontWeight: 900,
                        background: `linear-gradient(90deg, ${gd.color}, #e2e8f0)`,
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        marginBottom: '0.5rem',
                    }}>
                        {score} / {total} correct
                    </h1>
                    <p style={{ color: gd.color, fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                        {percentage}%
                    </p>
                    <p style={{ color: '#64748b', fontSize: '0.95rem' }}>{gd.msg}</p>

                    {/* Stat pills */}
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                        <StatPill label="✅ Correct" value={correctCount} color="#4ade80" />
                        <StatPill label="❌ Wrong" value={wrongCount} color="#f87171" />
                        <StatPill label="📋 Total" value={total} color="#94a3b8" />
                    </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
                    {videoId && (
                        <button onClick={() => navigate(`/videos/${videoId}/summary`)} style={primaryBtn}>
                            📋 Back to Summary
                        </button>
                    )}
                    <button onClick={() => navigate(`/quiz/${quizId}`)} style={outlineBtn}>
                        🔄 Retake Quiz
                    </button>
                    <button onClick={() => navigate('/videos')} style={ghostBtn}>
                        🎬 All Videos
                    </button>
                </div>

                {/* Detailed results */}
                <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                        onClick={() => setShowDetails(v => !v)}
                        style={ghostBtn}
                    >
                        {showDetails ? '▲ Hide' : '▼ Show'} detailed results
                    </button>

                    {showDetails && (
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                            {['all', 'correct', 'wrong'].map(f => (
                                <button key={f} onClick={() => setFilter(f)} style={{
                                    padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
                                    fontSize: '0.78rem', fontWeight: 700, textTransform: 'capitalize',
                                    background: filter === f ? 'rgba(108,99,255,0.2)' : 'rgba(255,255,255,0.04)',
                                    border: `1px solid ${filter === f ? 'rgba(108,99,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
                                    color: filter === f ? '#a78bfa' : '#64748b',
                                }}>
                                    {f === 'correct' ? `✅ ${correctCount}` : f === 'wrong' ? `❌ ${wrongCount}` : `All ${total}`}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {showDetails && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {filtered.map((r, i) => (
                            <ResultCard key={i} r={r} />
                        ))}
                        {filtered.length === 0 && (
                            <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
                                No {filter} answers to show.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({ r }) {
    const [showExp, setShowExp] = useState(false)
    const isRight = r.is_correct
    return (
        <div style={{
            padding: '1.25rem', borderRadius: 14,
            background: isRight ? 'rgba(74,222,128,0.04)' : 'rgba(248,113,113,0.04)',
            border: `1px solid ${isRight ? 'rgba(74,222,128,0.18)' : 'rgba(248,113,113,0.18)'}`,
        }}>
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6c63ff' }}>
                    Q{r.question_index + 1}
                </span>
                <span style={{
                    padding: '2px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
                    background: isRight ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
                    color: isRight ? '#4ade80' : '#f87171',
                }}>
                    {isRight ? '✓ Correct' : '✗ Incorrect'}
                </span>
            </div>

            <p style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
                {r.question}
            </p>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.75rem' }}>
                {r.options.map((opt, oi) => {
                    const isCorrect = oi === r.correct_answer
                    const isChosen = oi === r.chosen
                    let borderColor = 'rgba(255,255,255,0.07)'
                    let bgColor = 'transparent'
                    let textColor = '#64748b'
                    if (isCorrect) { borderColor = 'rgba(74,222,128,0.4)'; bgColor = 'rgba(74,222,128,0.08)'; textColor = '#4ade80' }
                    if (isChosen && !isCorrect) { borderColor = 'rgba(248,113,113,0.4)'; bgColor = 'rgba(248,113,113,0.08)'; textColor = '#f87171' }
                    return (
                        <div key={oi} style={{
                            padding: '7px 12px', borderRadius: 8, fontSize: '0.85rem',
                            border: `1px solid ${borderColor}`, background: bgColor, color: textColor,
                        }}>
                            <span style={{ fontWeight: 700, marginRight: 8 }}>{String.fromCharCode(65 + oi)}.</span>
                            {opt}
                            {isCorrect && <span style={{ marginLeft: 8, fontSize: '0.75rem' }}>✓</span>}
                            {isChosen && !isCorrect && <span style={{ marginLeft: 8, fontSize: '0.75rem' }}>← your answer</span>}
                        </div>
                    )
                })}
            </div>

            {/* Explanation toggle */}
            {r.explanation && (
                <div>
                    <button onClick={() => setShowExp(v => !v)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#6c63ff', fontSize: '0.78rem', fontWeight: 600, padding: 0,
                    }}>
                        {showExp ? '▲ Hide' : '▼ Show'} explanation
                    </button>
                    {showExp && (
                        <p style={{ color: '#64748b', fontSize: '0.8rem', lineHeight: 1.6, marginTop: '0.5rem', fontStyle: 'italic' }}>
                            {r.explanation}
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}

function StatPill({ label, value, color }) {
    return (
        <div style={{
            padding: '8px 18px', borderRadius: 999,
            background: `${color}15`, border: `1px solid ${color}30`,
            color, fontWeight: 700, fontSize: '0.85rem',
        }}>
            {label}: <span style={{ fontSize: '1rem' }}>{value}</span>
        </div>
    )
}

const pageStyle = { minHeight: '100vh', padding: '90px 1.5rem 60px', display: 'flex', justifyContent: 'center' }
const ghostBtn = { padding: '8px 16px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: '0.875rem', fontWeight: 600 }
const primaryBtn = { padding: '10px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #a855f7)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }
const outlineBtn = { padding: '10px 22px', borderRadius: 10, cursor: 'pointer', background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.3)', color: '#a78bfa', fontWeight: 700, fontSize: '0.9rem' }
