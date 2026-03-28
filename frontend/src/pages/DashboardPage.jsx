import { useState, useEffect, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { AuthContext } from '../context/AuthContext';
import StatusBadge from '../components/ui/StatusBadge';

export default function DashboardPage() {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    
    const [stats, setStats] = useState({ videos: 0, quizzes: 0, avgScore: 0 });
    const [videos, setVideos] = useState([]);
    const [attempts, setAttempts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadDashboard = async () => {
            try {
                const [vData, aData] = await Promise.all([
                    api.videos.list(1, 10),
                    api.quizzes.getMyAttempts()
                ]);
                
                setVideos(vData.videos || []);
                setAttempts(aData || []);
                
                // Calculate stats
                const totalVideos = vData.total || 0;
                const totalQuizzes = aData.length || 0;
                const avg = aData.length > 0 
                    ? aData.reduce((acc, curr) => acc + curr.percentage, 0) / aData.length 
                    : 0;
                
                setStats({ 
                    videos: totalVideos, 
                    quizzes: totalQuizzes, 
                    avgScore: Math.round(avg) 
                });
            } catch (err) {
                console.error("Dashboard load failed:", err);
            } finally {
                setLoading(false);
            }
        };

        if (user) loadDashboard();
    }, [user]);

    if (loading) return (
        <div style={{ paddingTop: 100, textAlign: 'center', color: '#64748b' }}>
            <p>Loading your dashboard...</p>
        </div>
    );

    return (
        <div style={containerStyle}>
            <header style={headerStyle}>
                <div>
                    <h1 style={titleStyle}>Welcome back, {user?.full_name?.split(' ')[0] || 'Learner'}! </h1>
                    <p style={subtitleStyle}>Here's what's happening with your learning journey.</p>
                </div>
                <button onClick={() => navigate('/upload')} style={primaryBtn}>
                    + New Video
                </button>
            </header>

            {/* Stats Grid */}
            <div style={statsGrid}>
                <StatCard icon="🎬" label="Videos Analyzed" value={stats.videos} color="#6366f1" />
                <StatCard icon="🎓" label="Quizzes Taken" value={stats.quizzes} color="#a855f7" />
                <StatCard icon="📈" label="Avg. Accuracy" value={`${stats.avgScore}%`} color="#ec4899" />
            </div>

            <div style={contentLayout}>
                {/* Recent Videos */}
                <section style={sectionStyle}>
                    <div style={sectionHeader}>
                        <h2 style={sectionTitle}>Recent Videos</h2>
                        <Link to="/videos" style={viewAllLink}>View All</Link>
                    </div>
                    <div style={videoList}>
                        {videos.length > 0 ? videos.slice(0, 4).map(v => (
                            <div key={v.id || v._id} onClick={() => navigate(`/videos/${v.id || v._id}/summary`)} style={videoCard}>
                                <div style={videoInfo}>
                                    <h4 style={videoTitle}>{v.title || 'Untitled Video'}</h4>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '5px' }}>
                                        <StatusBadge status={v.status} />
                                        <span style={dateText}>{new Date(v.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                                <div style={chevronStyle}>→</div>
                            </div>
                        )) : (
                            <p style={emptyText}>No videos uploaded yet. <Link to="/upload" style={{ color: '#a855f7' }}>Start now!</Link></p>
                        )}
                    </div>
                </section>

                {/* Recent Quiz Results */}
                <section style={sectionStyle}>
                    <div style={sectionHeader}>
                        <h2 style={sectionTitle}>Quiz Performance</h2>
                    </div>
                    <div style={quizList}>
                        {attempts.length > 0 ? attempts.slice(0, 4).map(a => (
                            <div key={a.id || a._id} onClick={() => navigate(`/quiz/${a.quiz_id}/results?attempt=${a.id || a._id}`)} style={quizCard}>
                                <div style={{...gradeCircle, background: getGradeColor(a.grade)}}>
                                    {a.grade}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h4 style={quizTitle}>Quiz Result</h4>
                                    <p style={quizMeta}>{a.score}/{a.total} questions • {a.percentage}%</p>
                                </div>
                                <div style={chevronStyle}>→</div>
                            </div>
                        )) : (
                            <p style={emptyText}>Take a quiz to see your performance here!</p>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}

function StatCard({ icon, label, value, color }) {
    return (
        <div style={statCardStyle}>
            <div style={{...iconBox, background: `${color}15`, color: color}}>{icon}</div>
            <div>
                <div style={statLabel}>{label}</div>
                <div style={statValue}>{value}</div>
            </div>
        </div>
    );
}

const getGradeColor = (grade) => {
    switch(grade) {
        case 'A': return 'linear-gradient(135deg, #22c55e, #16a34a)';
        case 'B': return 'linear-gradient(135deg, #84cc16, #65a30d)';
        case 'C': return 'linear-gradient(135deg, #eab308, #ca8a04)';
        case 'D': return 'linear-gradient(135deg, #f97316, #ea580c)';
        default: return 'linear-gradient(135deg, #ef4444, #dc2626)';
    }
};

const containerStyle = {
    padding: '100px 2rem 4rem',
    maxWidth: '1200px',
    margin: '0 auto',
};

const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '40px',
};

const titleStyle = {
    fontSize: '2rem',
    fontWeight: '800',
    color: '#fff',
    marginBottom: '8px',
};

const subtitleStyle = {
    color: '#94a3b8',
    fontSize: '1rem',
};

const primaryBtn = {
    padding: '12px 24px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
    color: '#fff',
    fontWeight: '700',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)',
};

const statsGrid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '20px',
    marginBottom: '40px',
};

const statCardStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    padding: '24px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '20px',
};

const iconBox = {
    width: '56px',
    height: '56px',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.5rem',
};

const statLabel = {
    color: '#94a3b8',
    fontSize: '0.875rem',
    fontWeight: '600',
    marginBottom: '4px',
};

const statValue = {
    color: '#fff',
    fontSize: '1.5rem',
    fontWeight: '800',
};

const contentLayout = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
    gap: '40px',
};

const sectionStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
};

const sectionHeader = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
};

const sectionTitle = {
    fontSize: '1.25rem',
    fontWeight: '700',
    color: '#f1f5f9',
};

const viewAllLink = {
    color: '#6366f1',
    fontSize: '0.875rem',
    fontWeight: '600',
    textDecoration: 'none',
};

const videoList = {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
};

const videoCard = {
    padding: '16px 20px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    transition: 'transform 0.2s, background 0.2s',
};

const videoTitle = {
    color: '#e2e8f0',
    fontWeight: '600',
    fontSize: '1rem',
    margin: 0,
};

const dateText = {
    color: '#64748b',
    fontSize: '0.75rem',
};

const quizList = {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
};

const quizCard = {
    padding: '16px 20px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    cursor: 'pointer',
    transition: 'transform 0.2s, background 0.2s',
};

const gradeCircle = {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: '800',
    fontSize: '1.2rem',
};

const quizTitle = {
    color: '#e2e8f0',
    fontWeight: '600',
    margin: 0,
};

const quizMeta = {
    color: '#64748b',
    fontSize: '0.8125rem',
    margin: 0,
};

const chevronStyle = {
    color: '#475569',
    fontSize: '1.2rem',
};

const emptyText = {
    color: '#64748b',
    textAlign: 'center',
    padding: '40px 0',
    border: '1px dashed rgba(255, 255, 255, 0.1)',
    borderRadius: '16px',
};

const videoInfo = {
    display: 'flex',
    flexDirection: 'column',
};
