import { useState } from 'react'
import { useAuth } from '../lib/AuthProvider.jsx'
import { submitFlag } from '../lib/api'

export default function FlagButton({ questionId }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!reason.trim()) return
    setSubmitting(true)
    try {
      await submitFlag({ questionId, userId: user.id, reason: reason.trim() })
      setSubmitted(true)
      setOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return <span className="help-text">Reported — thanks, an admin will review it.</span>
  }

  if (!open) {
    return (
      <button className="btn btn--outline btn--sm" onClick={() => setOpen(true)}>
        Report an Issue
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: '0.5rem' }}>
      <div className="field">
        <label htmlFor={`flag-${questionId}`}>What&apos;s wrong with this question?</label>
        <textarea
          id={`flag-${questionId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. wrong answer, unclear wording, outdated reference"
        />
      </div>
      <button className="btn btn--sm btn--danger" type="submit" disabled={submitting || !reason.trim()}>
        {submitting ? 'Sending…' : 'Submit Report'}
      </button>{' '}
      <button className="btn btn--sm btn--outline" type="button" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  )
}
