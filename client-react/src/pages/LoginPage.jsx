import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoginBackdrop } from '../components/HeroBanner';

export default function LoginPage() {
  const { signIn, signUp, demoLogin, authError, setAuthError } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('signin'); // 'signin' | 'signup' | 'demo'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [demoId, setDemoId] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setAuthError('Email and password are required.');
      return;
    }

    if (tab === 'signup' && password !== confirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }

    if (tab === 'signup' && password.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (tab === 'signin') {
        const success = await signIn(email, password);
        if (success) navigate('/');
      } else {
        const result = await signUp(email, password);
        if (result === 'confirm') {
          setConfirmSent(true);
        } else if (result) {
          navigate('/');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = () => {
    const id = parseInt(demoId, 10);
    if (isNaN(id) || id < 1 || id > 330975) {
      setAuthError('Enter a valid ID between 1 and 330,975.');
      return;
    }
    demoLogin(id);
    navigate('/');
  };

  const handleRandomDemo = () => {
    const id = Math.floor(Math.random() * 330975) + 1;
    setDemoId(String(id));
    demoLogin(id);
    navigate('/');
  };

  return (
    <div className="login-overlay">
      <LoginBackdrop />
      <div className="login-modal">
        <div className="login-logo">Movie<span>AI</span></div>
        <p className="login-tagline">Unlimited Movies, TV Shows, and More</p>

        {/* Auth Tabs */}
        <div className="auth-tabs">
          <button
            className={`auth-tab${tab === 'signin' ? ' active' : ''}`}
            onClick={() => { setTab('signin'); setAuthError(''); setConfirmSent(false); }}
          >
            Sign In
          </button>
          <button
            className={`auth-tab${tab === 'signup' ? ' active' : ''}`}
            onClick={() => { setTab('signup'); setAuthError(''); setConfirmSent(false); }}
          >
            Sign Up
          </button>
          <button
            className={`auth-tab${tab === 'demo' ? ' active' : ''}`}
            onClick={() => { setTab('demo'); setAuthError(''); setConfirmSent(false); }}
          >
            Demo
          </button>
          <button
            className={`auth-tab${tab === 'admin' ? ' active' : ''}`}
            onClick={() => { setTab('admin'); setAuthError(''); setConfirmSent(false); }}
          >
            Admin
          </button>
        </div>

        {/* ── Sign In / Sign Up Form ── */}
        {(tab === 'signin' || tab === 'signup') && (
          <form onSubmit={handleAuth} className="auth-section active">
            <div className="login-input-group auth-col">
              <input
                type="email"
                placeholder="Email Address"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                type="password"
                placeholder="Password"
                autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {tab === 'signup' && (
                <input
                  type="password"
                  placeholder="Confirm Password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              )}
              <button type="submit" id="authSubmitBtn" disabled={loading}>
                {loading ? (
                  <span className="btn-spinner"></span>
                ) : (
                  tab === 'signin' ? 'Sign In' : 'Create Account'
                )}
              </button>
            </div>

            {/* Confirmation message */}
            {confirmSent && (
              <div className="confirm-msg">
                <span>📧</span>
                <p>Check your email for a confirmation link! Once confirmed, switch to <strong>Sign In</strong>.</p>
              </div>
            )}

            {/* Toggle link */}
            <div style={{ marginTop: 10, fontSize: '0.85rem', color: 'var(--text-2)' }}>
              {tab === 'signin' ? (
                <>New here? <a href="#" onClick={(e) => { e.preventDefault(); setTab('signup'); setAuthError(''); }} style={{ color: 'var(--text)', fontWeight: 'bold' }}>Sign up now.</a></>
              ) : (
                <>Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); setTab('signin'); setAuthError(''); }} style={{ color: 'var(--text)', fontWeight: 'bold' }}>Sign in.</a></>
              )}
            </div>
          </form>
        )}

        {/* ── Demo Mode ── */}
        {tab === 'demo' && (
          <div className="auth-section active">
            <p className="login-sub">Enter a User ID or let us pick one randomly to preview the engine.</p>
            <div className="login-input-group auth-col">
              <input
                type="number"
                placeholder="User ID (1 – 330,975)"
                min="1"
                max="330975"
                autoComplete="off"
                value={demoId}
                onChange={(e) => setDemoId(e.target.value)}
              />
              <div className="demo-buttons">
                <button className="btn-primary" type="button" onClick={handleDemo}>Load Profile</button>
                <button className="btn-secondary" type="button" onClick={handleRandomDemo}>Random</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Admin Mode ── */}
        {tab === 'admin' && (
          <div className="auth-section active">
            <p className="login-sub">Access the real-time analytics dashboard to monitor system health, caching, and live rating activity.</p>
            <div className="login-input-group auth-col">
              <button 
                className="btn-primary" 
                type="button" 
                onClick={() => demoLogin(1)}
              >
                <span style={{ fontSize: '1.2rem' }}>📊</span>
                Login as Administrator
              </button>
            </div>
          </div>
        )}

        {/* Error display */}
        {authError && <div className="login-error">{authError}</div>}
      </div>
    </div>
  );
}
