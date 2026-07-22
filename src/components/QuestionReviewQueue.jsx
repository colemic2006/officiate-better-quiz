import { useEffect, useState } from 'react'
import {
  fetchReviewQueue,
  fetchQuestionById,
  fetchTagsForQuestions,
  markQuestionReviewed,
} from '../lib/api'
import QuestionEditForm from './QuestionEditForm.jsx'

// Sequential editorial review: walk every question (optionally within one
// category), edit as needed, and mark each complete. Progress and completion
// persist in the DB (questions.reviewed_at), so the admin can stop and resume.
export default function QuestionReviewQueue({ categories, onClose }) {
  const [categoryFilter, setCategoryFilter] = useState('')
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false)

  const [queue, setQueue] = useState([])
  const [queueLoading, setQueueLoading] = useState(true)
  const [error, setError] = useState('')

  const [currentId, setCurrentId] = useState(null)
  const [current, setCurrent] = useState(null)
  const [currentTags, setCurrentTags] = useState([])
  const [questionLoading, setQuestionLoading] = useState(false)
  const [marking, setMarking] = useState(false)

  const total = queue.length
  const reviewedCount = queue.filter((q) => q.reviewed_at).length
  const pct = total ? Math.round((reviewedCount / total) * 100) : 0
  const index = queue.findIndex((q) => q.id === currentId)
  const currentEntry = index >= 0 ? queue[index] : null

  // Load (or reload) the queue whenever the category filter changes, then jump
  // to the first unreviewed question (resume point), falling back to the first.
  useEffect(() => {
    let cancelled = false
    setQueueLoading(true)
    setError('')
    fetchReviewQueue({ categoryId: categoryFilter ? Number(categoryFilter) : null })
      .then((rows) => {
        if (cancelled) return
        setQueue(rows)
        const firstUnreviewed = rows.find((q) => !q.reviewed_at)
        setCurrentId((firstUnreviewed || rows[0])?.id ?? null)
      })
      .catch((err) => !cancelled && setError(err.message || 'Failed to load the review queue.'))
      .finally(() => !cancelled && setQueueLoading(false))
    return () => {
      cancelled = true
    }
  }, [categoryFilter])

  // Load the full row + tags for whichever question is current.
  useEffect(() => {
    if (!currentId) {
      setCurrent(null)
      return
    }
    let cancelled = false
    setQuestionLoading(true)
    Promise.all([fetchQuestionById(currentId), fetchTagsForQuestions([currentId])])
      .then(([q, tagMap]) => {
        if (cancelled) return
        setCurrent(q)
        setCurrentTags(tagMap.get(currentId) || [])
      })
      .catch((err) => !cancelled && setError(err.message || 'Failed to load the question.'))
      .finally(() => !cancelled && setQuestionLoading(false))
    return () => {
      cancelled = true
    }
  }, [currentId])

  function goTo(i) {
    if (i >= 0 && i < queue.length) setCurrentId(queue[i].id)
  }

  // Step forward/backward, honoring the "only unreviewed" toggle.
  function step(dir) {
    let i = index
    while (true) {
      i += dir
      if (i < 0 || i >= queue.length) return
      if (!onlyUnreviewed || !queue[i].reviewed_at) return goTo(i)
    }
  }

  // Jump to the next unreviewed question at/after the current one, wrapping.
  function nextUnreviewed() {
    if (queue.length === 0) return
    for (let k = 1; k <= queue.length; k++) {
      const i = (index + k) % queue.length
      if (!queue[i].reviewed_at) return goTo(i)
    }
  }

  function markLocally(id, reviewedAt) {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, reviewed_at: reviewedAt } : q)))
    setCurrent((prev) => (prev && prev.id === id ? { ...prev, reviewed_at: reviewedAt } : prev))
  }

  const remaining = total - reviewedCount

  async function setReviewed(reviewed, advance) {
    if (!currentId) return
    setMarking(true)
    setError('')
    try {
      const updated = await markQuestionReviewed(currentId, reviewed)
      markLocally(currentId, updated.reviewed_at)
      if (advance && reviewed) advanceAfterComplete()
    } catch (err) {
      setError(err.message || 'Failed to update review status.')
    } finally {
      setMarking(false)
    }
  }

  // After completing the current one, move to the next still-unreviewed
  // question so the admin keeps flowing through the remaining work.
  function advanceAfterComplete() {
    for (let k = 1; k <= queue.length; k++) {
      const i = (index + k) % queue.length
      if (!queue[i].reviewed_at) return goTo(i)
    }
    // Nothing left unreviewed — just step to the next in order if there is one.
    if (index + 1 < queue.length) goTo(index + 1)
  }

  // The edit form's primary action saved changes — mark reviewed and advance.
  async function handleFormSaved(updated, newTags) {
    setCurrent(updated)
    setCurrentTags(newTags)
    setMarking(true)
    setError('')
    try {
      const marked = await markQuestionReviewed(updated.id, true)
      markLocally(updated.id, marked.reviewed_at)
      advanceAfterComplete()
    } catch (err) {
      setError(err.message || 'Saved, but failed to mark reviewed.')
    } finally {
      setMarking(false)
    }
  }

  return (
    <div className="card" style={{ borderColor: 'var(--accent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div className="eyebrow">Editorial Review</div>
        {onClose && (
          <button className="btn btn--sm btn--outline" onClick={onClose}>
            Close review
          </button>
        )}
      </div>

      {/* Progress */}
      <div style={{ margin: '0.5rem 0 0.75rem' }}>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="help-text" style={{ margin: 0 }}>
          Reviewed <strong>{reviewedCount}</strong> of <strong>{total}</strong> ({pct}%) · {remaining} remaining
        </p>
        <p className="help-text" style={{ margin: '0.25rem 0 0' }}>
          Explanations stay hidden from users until you mark a question reviewed — marking it complete publishes its
          explanation. Rule references are always visible.
        </p>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
          <label htmlFor="review-category">Scope</label>
          <select id="review-category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
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
            <input type="checkbox" checked={onlyUnreviewed} onChange={(e) => setOnlyUnreviewed(e.target.checked)} />
            Step through unreviewed only
          </label>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {queueLoading ? (
        <p className="muted">Loading review queue…</p>
      ) : total === 0 ? (
        <p className="muted">No questions in this scope.</p>
      ) : (
        <>
          {/* Position + navigation */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
              margin: '0.5rem 0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <strong>
                {index + 1} / {total}
              </strong>
              {currentEntry && <span className="badge">{current?.external_id || '…'}</span>}
              {currentEntry?.reviewed_at ? (
                <span className="badge badge--ruling">Reviewed</span>
              ) : (
                <span className="badge" style={{ background: '#c0392b', color: '#fff' }}>
                  Not reviewed
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button className="btn btn--sm btn--outline" onClick={() => step(-1)} disabled={index <= 0}>
                ◀ Prev
              </button>
              <button
                className="btn btn--sm btn--outline"
                onClick={() => step(1)}
                disabled={index < 0 || index >= total - 1}
              >
                Next ▶
              </button>
              <button className="btn btn--sm btn--outline" onClick={nextUnreviewed} disabled={remaining === 0}>
                Skip to next unreviewed
              </button>
            </div>
          </div>

          {/* Per-question mark controls (for when no edit is needed) */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            {currentEntry?.reviewed_at ? (
              <button className="btn btn--sm btn--outline" onClick={() => setReviewed(false, false)} disabled={marking}>
                {marking ? 'Working…' : 'Unmark reviewed'}
              </button>
            ) : (
              <button className="btn btn--sm" onClick={() => setReviewed(true, true)} disabled={marking}>
                {marking ? 'Working…' : 'Mark reviewed (no edits) →'}
              </button>
            )}
          </div>

          {/* The editable question */}
          {questionLoading || !current ? (
            <p className="muted">Loading question…</p>
          ) : (
            <QuestionEditForm
              key={current.id}
              question={current}
              tags={currentTags}
              categories={categories}
              onSaved={handleFormSaved}
              onCancel={() => step(1)}
              saveLabel="Save & Mark Reviewed →"
              savingLabel="Saving…"
              cancelLabel="Skip (no changes) →"
            />
          )}
        </>
      )}
    </div>
  )
}
