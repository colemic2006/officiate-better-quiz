import { useEffect, useState } from 'react'
import { fetchPendingComments, fetchOpenFlags, moderateComment, resolveFlag } from '../lib/api'
import SectionHeader from '../components/SectionHeader.jsx'

export default function Admin() {
  const [comments, setComments] = useState([])
  const [flags, setFlags] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const [c, f] = await Promise.all([fetchPendingComments(), fetchOpenFlags()])
    setComments(c)
    setFlags(f)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleModerate(id, status) {
    await moderateComment(id, status)
    setComments((prev) => prev.filter((c) => c.id !== id))
  }

  async function handleResolve(id, status) {
    await resolveFlag(id, status)
    setFlags((prev) => prev.filter((f) => f.id !== id))
  }

  if (loading) return <div className="page">Loading…</div>

  return (
    <div className="page">
      <SectionHeader>Pending Comments</SectionHeader>
      {comments.length === 0 ? (
        <p className="muted">No comments awaiting review.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Question</th>
              <th>Author</th>
              <th>Comment</th>
              <th>Submitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {comments.map((c) => (
              <tr key={c.id}>
                <td>{c.question?.external_id}</td>
                <td>{c.profile?.display_name}</td>
                <td>{c.comment_text}</td>
                <td>{new Date(c.created_at).toLocaleString()}</td>
                <td style={{ display: 'flex', gap: '0.4rem' }}>
                  <button className="btn btn--sm" onClick={() => handleModerate(c.id, 'approved')}>
                    Approve
                  </button>
                  <button className="btn btn--sm btn--danger" onClick={() => handleModerate(c.id, 'rejected')}>
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <SectionHeader>Open Flags</SectionHeader>
      {flags.length === 0 ? (
        <p className="muted">No open reports.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Question</th>
              <th>Reported By</th>
              <th>Reason</th>
              <th>Submitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {flags.map((f) => (
              <tr key={f.id}>
                <td>{f.question?.external_id}</td>
                <td>{f.profile?.display_name}</td>
                <td>{f.reason}</td>
                <td>{new Date(f.created_at).toLocaleString()}</td>
                <td style={{ display: 'flex', gap: '0.4rem' }}>
                  <button className="btn btn--sm" onClick={() => handleResolve(f.id, 'resolved')}>
                    Resolve
                  </button>
                  <button className="btn btn--sm btn--outline" onClick={() => handleResolve(f.id, 'dismissed')}>
                    Dismiss
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
