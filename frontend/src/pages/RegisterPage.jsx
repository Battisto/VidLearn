import { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { register } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(email, password, fullName);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2 style={titleStyle}>Create Account</h2>
        <p style={subtitleStyle}>Join VidLearn and start your 10x learning journey</p>
        
        {error && <div style={errorStyle}>{error}</div>}
        
        <form onSubmit={handleSubmit} style={formStyle}>
          <div style={inputGroupStyle}>
            <label style={labelStyle}>Full Name</label>
            <input 
              type="text" 
              value={fullName} 
              onChange={(e) => setFullName(e.target.value)} 
              required 
              placeholder="John Doe"
              style={inputStyle}
            />
          </div>

          <div style={inputGroupStyle}>
            <label style={labelStyle}>Email Address</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              placeholder="you@example.com"
              style={inputStyle}
            />
          </div>
          
          <div style={inputGroupStyle}>
            <label style={labelStyle}>Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading} 
            style={buttonStyle}
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
        
        <p style={footerStyle}>
          Already have an account? <Link to="/login" style={linkStyle}>Sign In</Link>
        </p>
      </div>
    </div>
  );
}

const containerStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '100vh',
  padding: '80px 20px 40px',
};

const cardStyle = {
  width: '100%',
  maxWidth: '400px',
  background: 'rgba(255, 255, 255, 0.05)',
  backdropFilter: 'blur(10px)',
  borderRadius: '24px',
  padding: '40px',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
};

const titleStyle = {
  fontSize: '2rem',
  fontWeight: '800',
  color: '#fff',
  textAlign: 'center',
  marginBottom: '8px',
};

const subtitleStyle = {
  color: '#94a3b8',
  textAlign: 'center',
  marginBottom: '32px',
};

const formStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
};

const inputGroupStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const labelStyle = {
  fontSize: '0.875rem',
  fontWeight: '600',
  color: '#cbd5e1',
};

const inputStyle = {
  padding: '12px 16px',
  borderRadius: '12px',
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  color: '#fff',
  fontSize: '1rem',
  outline: 'none',
  transition: 'border-color 0.2s',
};

const buttonStyle = {
  padding: '14px',
  borderRadius: '12px',
  background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
  color: '#fff',
  fontSize: '1rem',
  fontWeight: '700',
  border: 'none',
  cursor: 'pointer',
  marginTop: '10px',
};

const errorStyle = {
  padding: '12px',
  borderRadius: '8px',
  background: 'rgba(239, 68, 68, 0.1)',
  border: '1px solid rgba(239, 68, 68, 0.2)',
  color: '#f87171',
  fontSize: '0.875rem',
  marginBottom: '20px',
  textAlign: 'center',
};

const footerStyle = {
  marginTop: '24px',
  textAlign: 'center',
  color: '#94a3b8',
  fontSize: '0.875rem',
};

const linkStyle = {
  color: '#a855f7',
  textDecoration: 'none',
  fontWeight: '600',
};
