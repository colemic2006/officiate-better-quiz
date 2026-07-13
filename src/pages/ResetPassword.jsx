import { useState } from 'react'
import { useAuth } from '../lib/AuthProvider.jsx'
import SectionHeader from '../components/SectionHeader.jsx'

export default function ResetPassword() {
  const { updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      const { error: err } = await updatePassword(password)
      if (err) setError(err.message)
      else setDone(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <SectionHeader>Set a New Password</SectionHeader>
      <div className="card" style={{ maxWidth: '28rem' }}>
        {done ? (
          <p>Your password has been updated. You're signed in — head to your dashboard to continue.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="new-password">New Password</label>
              <input
                id="new-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="confirm-password">Confirm New Password</label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="btn" type="submit" disabled={submitting} style={{ width: '100%' }}>
              {submitting ? 'Saving…' : 'Set New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
