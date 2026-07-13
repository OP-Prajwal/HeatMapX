import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Leaf, UserPlus, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setSubmitting(true);
    try {
      await register(form.name, form.email, form.password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to create your account. Please try again.');
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

        <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Create your account</h2>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '2rem' }}>
          Sign up to start running heat-risk analyses.
        </p>

        {error && (
          <div className="auth-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="auth-label">
            Full name
            <input
              className="auth-input"
              type="text"
              name="name"
              autoComplete="name"
              required
              value={form.name}
              onChange={handleChange}
              placeholder="Jane Doe"
            />
          </label>

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
              autoComplete="new-password"
              required
              value={form.password}
              onChange={handleChange}
              placeholder="At least 6 characters"
            />
          </label>

          <label className="auth-label">
            Confirm password
            <input
              className="auth-input"
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              required
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder="Re-enter your password"
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
                <Loader2 className="spin" size={18} /> Creating account...
              </>
            ) : (
              <>
                <UserPlus size={18} /> Sign Up
              </>
            )}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" className="text-gradient" style={{ fontWeight: 700 }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
