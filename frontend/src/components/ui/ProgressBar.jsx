/**
 * ProgressBar — animated upload progress indicator
 */
export default function ProgressBar({ progress, label }) {
    return (
        <div style={{ width: '100%' }}>
            {label && (
                <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    marginBottom: '6px', fontSize: '0.8rem', color: '#94a3b8',
                }}>
                    <span>{label}</span>
                    <span style={{ color: '#6c63ff', fontWeight: 600 }}>{progress}%</span>
                </div>
            )}
            <div style={{
                width: '100%', height: 8,
                background: 'rgba(255,255,255,0.08)',
                borderRadius: 999, overflow: 'hidden',
            }}>
                <div style={{
                    height: '100%',
                    width: `${progress}%`,
                    borderRadius: 999,
                    background: 'linear-gradient(90deg, #6c63ff, #a855f7)',
                    transition: 'width 0.3s ease',
                    boxShadow: progress > 0 ? '0 0 10px rgba(108,99,255,0.5)' : 'none',
                }} />
            </div>
        </div>
    )
}
