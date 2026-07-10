import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthProvider.jsx'

export default function Home() {
  const { user, signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setSubmitting(true)
    try {
      if (mode === 'signin') {
        const { error: err } = await signIn(email, password)
        if (err) setError(err.message)
      } else {
        const { error: err } = await signUp(email, password, displayName)
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
          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div className="field">
                <label htmlFor="displayName">Display Name</label>
                <input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
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
            {error && <p className="error-text">{error}</p>}
            {info && <p className="help-text">{info}</p>}
            <button className="btn" type="submit" disabled={submitting} style={{ width: '100%' }}>
              {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
