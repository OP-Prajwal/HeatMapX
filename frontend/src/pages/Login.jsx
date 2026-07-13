import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Leaf, LogIn, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = location.state?.from?.pathname || '/dashboard';

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(form.email, form.password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to log in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="full-screen-container">
      <div className="auth-card bento-card animate-fade-in">
        <div className="logo" style={{ justifyContent: 'center', marginBottom: '1.5rem' }}>
          <Leaf className="logo-icon" size={32} color="var(--accent-main)" />
          <span className="text-gradient">HeatMapX</span>
        </div>

        <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Welcome back</h2>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '2rem' }}>
          Log in to access your analysis dashboard.
        </p>

        {error && (
          <div className="auth-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="auth-label">
            Email
            <input
              className="auth-input"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
            />
          </label>

          <label className="auth-label">
            Password
            <input
              className="auth-input"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
            />
          </label>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={submitting}
            style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}
          >
            {submitting ? (
              <>
                <Loader2 className="spin" size={18} /> Logging in...
              </>
            ) : (
              <>
                <LogIn size={18} /> Log In
              </>
            )}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-muted)' }}>
          Don't have an account?{' '}
          <Link to="/register" className="text-gradient" style={{ fontWeight: 700 }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
