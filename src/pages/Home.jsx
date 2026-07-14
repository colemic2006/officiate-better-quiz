import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthProvider.jsx'

export default function Home() {
  const { user, signIn, signUp, requestPasswordReset } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (mode === 'signup' && (!firstName.trim() || !lastName.trim())) {
      setError('Please enter your first and last name.')
      return
    }
    setSubmitting(true)
    try {
      if (mode === 'signin') {
        const { error: err } = await signIn(email, password)
        if (err) setError(err.message)
      } else if (mode === 'forgot') {
        const { error: err } = await requestPasswordReset(email)
        if (err) setError(err.message)
        else setInfo('If that email has an account, a password reset link is on its way — check your inbox.')
      } else {
        const { error: err } = await signUp(email, password, firstName.trim(), lastName.trim())
        if (err) setError(err.message)
        else setInfo('Check your email to confirm your account, then sign in.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <div className="grid grid--2" style={{ alignItems: 'center', gap: '2.5rem' }}>
        <div>
          <p className="eyebrow">Officiate Better Companion</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', letterSpacing: '0.01em', margin: '0.3rem 0 0.9rem' }}>
            Sharpen your NCAA football rules knowledge.
          </h1>
          <p className="muted" style={{ fontSize: '1.05rem', maxWidth: '32rem' }}>
            Adaptive, multiple-choice quizzes drawn from a growing question bank across all 20 rule
            categories. Track your accuracy by category and watch your weak spots turn green.
          </p>
        </div>

        <div className="card">
          {mode === 'forgot' ? (
            <div style={{ marginBottom: '1rem' }}>
              <strong>Reset Your Password</strong>
            </div>
          ) : (
            <div className="site-nav" style={{ marginBottom: '1rem', gap: '1.5rem' }}>
              <button
                className="linklike"
                style={{ color: mode === 'signin' ? 'var(--accent-dark)' : 'var(--text-mid)', fontWeight: 700 }}
                onClick={() => setMode('signin')}
              >
                Sign In
              </button>
              <button
                className="linklike"
                style={{ color: mode === 'signup' ? 'var(--accent-dark)' : 'var(--text-mid)', fontWeight: 700 }}
                onClick={() => setMode('signup')}
              >
                Sign Up
              </button>
            </div>
          )}
          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div className="grid grid--2">
                <div className="field">
                  <label htmlFor="firstName">First Name</label>
                  <input id="firstName" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="lastName">Last Name</label>
                  <input id="lastName" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {mode !== 'forgot' && (
              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            {mode === 'signin' && (
              <p className="help-text" style={{ marginTop: '-0.5rem' }}>
                <button
                  type="button"
                  className="linklike"
                  style={{ fontWeight: 400 }}
                  onClick={() => {
                    setError('')
                    setInfo('')
                    setMode('forgot')
                  }}
                >
                  Forgot password?
                </button>
              </p>
            )}
            {error && <p className="error-text">{error}</p>}
            {info && <p className="help-text">{info}</p>}
            <button className="btn" type="submit" disabled={submitting} style={{ width: '100%' }}>
              {submitting
                ? 'Please wait…'
                : mode === 'signin'
                  ? 'Sign In'
                  : mode === 'forgot'
                    ? 'Send Reset Link'
                    : 'Create Account'}
            </button>
            {mode === 'forgot' && (
              <button
                type="button"
                className="btn btn--outline"
                style={{ width: '100%', marginTop: '0.5rem' }}
                onClick={() => {
                  setError('')
                  setInfo('')
                  setMode('signin')
                }}
              >
                Back to Sign In
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
