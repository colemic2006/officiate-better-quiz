import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthProvider.jsx'
import { fetchApprovedComments, fetchOwnPendingComments, postComment } from '../lib/api'
import { RulingConfirmedBadge, PendingBadge } from './Badge.jsx'

export default function CommentThread({ questionId }) {
  const { user, isAdmin } = useAuth()
  const [comments, setComments] = useState([])
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [open, setOpen] = useState(false)

  async function load() {
    const [approved, ownPending] = await Promise.all([
      fetchApprovedComments(questionId),
      fetchOwnPendingComments(questionId, user.id),
    ])
    const merged = [...approved, ...ownPending.filter((p) => !approved.some((a) => a.id === p.id))]
    merged.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    setComments(merged)
  }

  useEffect(() => {
    if (open) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, questionId])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim()) return
    setSubmitting(true)
    try {
      await postComment({ questionId, userId: user.id, text: text.trim(), isAdmin })
      setText('')
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button className="btn btn--outline btn--sm" onClick={() => setOpen(true)}>
        Discussion
      </button>
    )
  }

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <div className="section-header" style={{ marginTop: '0.5rem' }}>
        <div className="section-header__bar" />
        <div className="section-header__label" style={{ fontSize: '0.9rem' }}>
          Discussion
        </div>
      </div>
      {comments.length === 0 && <p className="muted">No comments yet — be the first to ask a question.</p>}
      {comments.map((c) => (
        <div className="comment" key={c.id}>
          <div className="comment__meta">
            <strong>{c.profile?.display_name || 'Official'}</strong>
            {c.is_admin_reply && <RulingConfirmedBadge />}
            {c.status === 'pending' && <PendingBadge />}
            <span>{new Date(c.created_at).toLocaleDateString()}</span>
          </div>
          <div>{c.comment_text}</div>
        </div>
      ))}
      <form onSubmit={handleSubmit} style={{ marginTop: '0.75rem' }}>
        <div className="field">
          <label htmlFor={`comment-${questionId}`}>
            {isAdmin ? 'Post a ruling / reply' : 'Ask a question about this ruling'}
          </label>
          <textarea
            id={`comment-${questionId}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isAdmin ? 'This reply will be marked Ruling Confirmed…' : 'Comments are held for admin approval before other officials can see them.'}
          />
        </div>
        <button className="btn btn--sm" type="submit" disabled={submitting || !text.trim()}>
          {submitting ? 'Posting…' : 'Post'}
        </button>
      </form>
    </div>
  )
}
