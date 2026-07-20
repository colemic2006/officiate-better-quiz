import { useEffect, useRef, useState } from 'react'
import {
  fetchPendingComments,
  fetchOpenFlags,
  moderateComment,
  resolveFlag,
  fetchCategories,
  adminSearchQuestions,
  fetchTagsForQuestions,
  adminUpdateQuestion,
  fetchAdminUserDirectory,
} from '../lib/api'
import SectionHeader from '../components/SectionHeader.jsx'
import { CategoryBadge, DifficultyBadge } from '../components/Badge.jsx'
import QuestionEditForm from '../components/QuestionEditForm.jsx'
import QuestionReviewQueue from '../components/QuestionReviewQueue.jsx'

export default function Admin() {
  const [comments, setComments] = useState([])
  const [flags, setFlags] = useState([])
  const [loading, setLoading] = useState(true)

  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [questions, setQuestions] = useState([])
  const [tagsByQuestionId, setTagsByQuestionId] = useState(new Map())
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [questionsError, setQuestionsError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const editFormRef = useRef(null)

  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError, setUsersError] = useState('')
  const [usersVisible, setUsersVisible] = useState(false)

  const [reviewOpen, setReviewOpen] = useState(false)

  async function load() {
    const [c, f] = await Promise.all([fetchPendingComments(), fetchOpenFlags()])
    setComments(c)
    setFlags(f)
    setLoading(false)
  }

  async function loadUsers() {
    setUsersLoading(true)
    setUsersError('')
    try {
      setUsers(await fetchAdminUserDirectory())
    } catch (err) {
      setUsersError(err.message || 'Failed to load registered users.')
    } finally {
      setUsersLoading(false)
    }
  }

  useEffect(() => {
    load()
    loadUsers()
    fetchCategories().then(setCategories)
    runQuestionSearch()
  }, [])

  async function handleModerate(id, status) {
    await moderateComment(id, status)
    setComments((prev) => prev.filter((c) => c.id !== id))
  }

  async function handleResolve(id, status) {
    await resolveFlag(id, status)
    setFlags((prev) => prev.filter((f) => f.id !== id))
  }

  async function runQuestionSearch(e) {
    e?.preventDefault()
    setQuestionsError('')
    setQuestionsLoading(true)
    try {
      const rows = await adminSearchQuestions({
        search,
        categoryId: categoryFilter ? Number(categoryFilter) : null,
        includeInactive,
      })
      const tagMap = await fetchTagsForQuestions(rows.map((r) => r.id))
      setQuestions(rows)
      setTagsByQuestionId(tagMap)
    } catch (err) {
      setQuestionsError(err.message || 'Failed to load questions.')
    } finally {
      setQuestionsLoading(false)
    }
  }

  async function handleToggleActive(question) {
    try {
      const updated = await adminUpdateQuestion(question.id, { is_active: !question.is_active })
      setQuestions((prev) => prev.map((q) => (q.id === updated.id ? updated : q)))
    } catch (err) {
      setQuestionsError(err.message || 'Failed to update question.')
    }
  }

  function handleSaved(updated, newTags) {
    setQuestions((prev) => prev.map((q) => (q.id === updated.id ? updated : q)))
    setTagsByQuestionId((prev) => new Map(prev).set(updated.id, newTags))
    setEditingId(null)
  }

  useEffect(() => {
    if (editingId && editFormRef.current) {
      editFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [editingId])

  if (loading) return <div className="page">Loading…</div>

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <SectionHeader>Editorial Review</SectionHeader>
        {!reviewOpen && (
          <button className="btn btn--sm" onClick={() => setReviewOpen(true)}>
            Start / Resume Review
          </button>
        )}
      </div>
      {reviewOpen ? (
        <QuestionReviewQueue categories={categories} onClose={() => setReviewOpen(false)} />
      ) : (
        <p className="muted">
          Walk through every question one at a time — edit as needed and mark each complete. Your progress is saved,
          so you can stop and pick up where you left off.
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <SectionHeader>Registered Users {!usersLoading && `(${users.length})`}</SectionHeader>
        <button className="btn btn--sm btn--outline" onClick={() => setUsersVisible((v) => !v)}>
          {usersVisible ? 'Hide' : 'Show'}
        </button>
      </div>
      {usersVisible && (
        <>
          {usersError && <p className="error-text">{usersError}</p>}
          {usersLoading ? (
            <p className="muted">Loading…</p>
          ) : users.length === 0 ? (
            <p className="muted">No registered users yet.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Conference</th>
                  <th>Signed Up</th>
                  <th>Last Login</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.display_name || '—'}
                      {u.is_admin && ' (admin)'}
                    </td>
                    <td>{u.email}</td>
                    <td>{u.conference || '—'}</td>
                    <td>{new Date(u.created_at).toLocaleDateString()}</td>
                    <td>{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : 'Never'}</td>
                    <td>{u.is_active ? 'Active' : 'Deactivated'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

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

      <SectionHeader>Question Bank</SectionHeader>
      <form className="filter-bar" onSubmit={runQuestionSearch}>
        <div className="field" style={{ flex: '2 1 240px', marginBottom: 0 }}>
          <label htmlFor="q-search">Search</label>
          <input
            id="q-search"
            type="text"
            placeholder="Question ID or text…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
          <label htmlFor="q-category">Category</label>
          <select id="q-category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 400 }}>
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Include inactive
          </label>
        </div>
        <button className="btn btn--sm" type="submit" disabled={questionsLoading}>
          {questionsLoading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {questionsError && <p className="error-text">{questionsError}</p>}

      {questions.length === 0 ? (
        <p className="muted">
          {questionsLoading ? 'Loading…' : 'No questions match — try a broader search.'}
        </p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Category</th>
                <th>Difficulty</th>
                <th>Question</th>
                <th>Tags</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q.id}>
                  <td>{q.external_id}</td>
                  <td>
                    <CategoryBadge name={q.category?.name} />
                  </td>
                  <td>
                    <DifficultyBadge difficulty={q.difficulty} />
                  </td>
                  <td style={{ maxWidth: '28rem' }}>{q.question_text}</td>
                  <td className="help-text">{(tagsByQuestionId.get(q.id) || []).join(', ')}</td>
                  <td>{q.is_active ? 'Active' : 'Inactive'}</td>
                  <td style={{ display: 'flex', gap: '0.4rem' }}>
                    <button className="btn btn--sm" onClick={() => setEditingId(q.id)}>
                      Edit
                    </button>
                    <button className="btn btn--sm btn--outline" onClick={() => handleToggleActive(q)}>
                      {q.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {questions.length >= 50 && (
            <p className="help-text">Showing the first 50 matches — narrow your search to see more.</p>
          )}
        </>
      )}

      {editingId && (
        <div ref={editFormRef}>
          <QuestionEditForm
            question={questions.find((q) => q.id === editingId)}
            tags={tagsByQuestionId.get(editingId) || []}
            categories={categories}
            onSaved={handleSaved}
            onCancel={() => setEditingId(null)}
          />
        </div>
      )}
    </div>
  )
}
