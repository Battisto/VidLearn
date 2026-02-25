import { useNavigate } from 'react-router-dom'

const FEATURES = [
    { icon: '🎙️', title: 'AI Transcription', desc: 'OpenAI Whisper converts your video audio to accurate text automatically.' },
    { icon: '📝', title: 'Smart Summaries', desc: 'BART-large-cnn compresses long lectures into concise, readable summaries.' },
    { icon: '🧠', title: 'Quiz Generation', desc: 'Google Gemini creates MCQs from summaries to test your understanding.' },
    { icon: '🌐', title: 'Tamil ↔ English', desc: 'Full bidirectional translation support for Tamil and English content.' },
    { icon: '📊', title: 'Progress Tracking', desc: 'Track quiz scores and learning streaks on your personal dashboard.' },
    { icon: '⚡', title: 'Fast & Scalable', desc: 'FastAPI async backend with MongoDB handles high-volume processing.' },
]

export default function HomePage() {
    const navigate = useNavigate()

    return (
        <div style={{ paddingTop: 80 }}>
            {/* Hero */}
            <section style={{
                textAlign: 'center', padding: '5rem 2rem 4rem',
                maxWidth: 800, margin: '0 auto',
            }}>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '6px 16px', borderRadius: 999,
                    background: 'rgba(108,99,255,0.12)',
                    border: '1px solid rgba(108,99,255,0.3)',
                    fontSize: '0.8rem', color: '#a78bfa', fontWeight: 600,
                    marginBottom: '1.5rem', letterSpacing: '0.04em',
                }}>
                    🚀 AI-POWERED LEARNING
                </div>

                <h1 style={{
                    fontSize: 'clamp(2.5rem, 6vw, 4rem)', fontWeight: 800,
                    lineHeight: 1.1, marginBottom: '1.5rem',
                    background: 'linear-gradient(135deg, #e2e8f0 0%, #a78bfa 50%, #f59e0b 100%)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                    Turn Videos into<br />Learning Experiences
                </h1>

                <p style={{
                    color: '#94a3b8', fontSize: '1.15rem',
                    lineHeight: 1.7, maxWidth: 580, margin: '0 auto 2.5rem',
                }}>
                    Upload any educational video and VidLearn automatically generates
                    transcripts, summaries, quizzes, and translations — all powered by AI.
                </p>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => navigate('/upload')}
                        style={{
                            padding: '14px 32px', borderRadius: 10, border: 'none',
                            background: 'linear-gradient(135deg, #6c63ff, #a855f7)',
                            color: '#fff', fontSize: '1rem', fontWeight: 700,
                            cursor: 'pointer', letterSpacing: '0.02em',
                            boxShadow: '0 4px 20px rgba(108,99,255,0.4)',
                            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        }}
                        onMouseEnter={e => {
                            e.target.style.transform = 'translateY(-2px)'
                            e.target.style.boxShadow = '0 8px 30px rgba(108,99,255,0.5)'
                        }}
                        onMouseLeave={e => {
                            e.target.style.transform = 'translateY(0)'
                            e.target.style.boxShadow = '0 4px 20px rgba(108,99,255,0.4)'
                        }}
                    >
                        📤 Upload a Video
                    </button>
                    <button
                        onClick={() => navigate('/videos')}
                        style={{
                            padding: '14px 32px', borderRadius: 10, cursor: 'pointer',
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                            color: '#e2e8f0', fontSize: '1rem', fontWeight: 600,
                            transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={e => { e.target.style.background = 'rgba(255,255,255,0.1)' }}
                        onMouseLeave={e => { e.target.style.background = 'rgba(255,255,255,0.05)' }}
                    >
                        🎬 Browse Videos
                    </button>
                </div>
            </section>

            {/* Features Grid */}
            <section style={{
                maxWidth: 1100, margin: '0 auto',
                padding: '2rem 2rem 6rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '1.25rem',
            }}>
                {FEATURES.map((f) => (
                    <div key={f.title} style={{
                        padding: '1.75rem',
                        borderRadius: 16,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        transition: 'border-color 0.2s ease, transform 0.2s ease',
                        cursor: 'default',
                    }}
                        onMouseEnter={e => {
                            e.currentTarget.style.borderColor = 'rgba(108,99,255,0.4)'
                            e.currentTarget.style.transform = 'translateY(-3px)'
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
                            e.currentTarget.style.transform = 'translateY(0)'
                        }}
                    >
                        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{f.icon}</div>
                        <h3 style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#e2e8f0' }}>{f.title}</h3>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6 }}>{f.desc}</p>
                    </div>
                ))}
            </section>
        </div>
    )
}
