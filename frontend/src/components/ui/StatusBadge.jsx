import { STATUS_CONFIG } from '../../utils/helpers'

/**
 * StatusBadge — pill with color matching video status
 */
export default function StatusBadge({ status }) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.uploaded
    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 10px',
            borderRadius: '999px',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: cfg.color,
            background: cfg.bg,
            border: `1px solid ${cfg.color}40`,
            textTransform: 'capitalize',
            letterSpacing: '0.02em',
        }}>
            <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: cfg.color, flexShrink: 0,
            }} />
            {cfg.label}
        </span>
    )
}
