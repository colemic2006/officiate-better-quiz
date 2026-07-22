import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthProvider.jsx'
import {
  fetchCategories,
  fetchUserCategoryStats,
  fetchAttemptHistory,
  fetchAccuracyTrend,
  computeStreakDays,
  completeAttempt,
  cancelAttempt,
  cancelAllInProgressAttempts,
  fetchAnsweredQuestionIds,
  fetchRecentlyCorrectQuestionIds,
  fetchQuestionsByCategory,
  fetchQuestionsByTagName,
} from '../lib/api'
import { selectAdaptiveQuestions, selectPracticeQuestions } from '../lib/quizEngine'
import SectionHeader from '../components/SectionHeader.jsx'

const WEAK_THRESHOLD = 60

const MODE_LABELS = {
  adaptive: 'Adaptive',
  practice: 'Practice',
  national_test: 'National Test',
}

function formatAttemptSource(attempt) {
  if (attempt.category?.name) return attempt.category.name
  if (attempt.tag_filter) {
    const year = attempt.tag_filter.match(/^(\d{4})-cfo-rules-test$/)?.[1]
    return year ? `${year} National Test` : attempt.tag_filter
  }
  return 'Mixed'
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [categories, setCategories] = useState([])
  const [statsByCategoryId, setStatsByCategoryId] = useState(new Map())
  const [attempts, setAttempts] = useState([])
  const [trend, setTrend] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [cats, stats, history, trendData] = await Promise.all([
        fetchCategories(),
        fetchUserCategoryStats(user.id),
        fetchAttemptHistory(user.id),
        fetchAccuracyTrend(user.id),
      ])
      if (cancelled) return
      setCategories(cats)
      setStatsByCategoryId(stats)
      setAttempts(history)
      setTrend(trendData)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user.id])

  const [actionError, setActionError] = useState('')
  const [busyAttemptId, setBusyAttemptId] = useState(null)

  async function handleComplete(id) {
    setActionError('')
    setBusyAttemptId(id)
    try {
      await completeAttempt(id)
      setAttempts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, completed_at: new Date().toISOString() } : a))
      )
    } catch (err) {
      setActionError(err.message || 'Failed to complete the quiz.')
    } finally {
      setBusyAttemptId(null)
    }
  }

  async function handleCancel(id) {
    if (!window.confirm('Cancel this in-progress quiz? It will be permanently removed from your history.')) return
    setActionError('')
    setBusyAttemptId(id)
    try {
      await cancelAttempt(id)
      setAttempts((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      setActionError(err.message || 'Failed to cancel the quiz.')
    } finally {
      setBusyAttemptId(null)
    }
  }

  async function handleCancelAll() {
    const count = attempts.filter((a) => !a.completed_at).length
    if (count === 0) return
    if (!window.confirm(`Cancel all ${count} in-progress quizzes? They will be permanently removed.`)) return
    setActionError('')
    setBusyAttemptId('all')
    try {
      await cancelAllInProgressAttempts(user.id)
      setAttempts((prev) => prev.filter((a) => a.completed_at))
    } catch (err) {
      setActionError(err.message || 'Failed to cancel the in-progress quizzes.')
    } finally {
      setBusyAttemptId(null)
    }
  }

  // Continue an abandoned attempt: the original question set isn't stored, so
  // we re-draw the remaining questions from the attempt's own settings
  // (mode/category/difficulty/tag), excluding any already answered, and hand
  // them to the play screen bound to the same attempt id.
  async function handleResume(attempt) {
    setActionError('')
    setBusyAttemptId(attempt.id)
    try {
      const [answeredIds, recentlyCorrect] = await Promise.all([
        fetchAnsweredQuestionIds(attempt.id),
        fetchRecentlyCorrectQuestionIds(user.id),
      ])
      const remaining = attempt.question_count - answeredIds.size
      if (remaining <= 0) {
        await completeAttempt(attempt.id)
        setAttempts((prev) =>
          prev.map((a) => (a.id === attempt.id ? { ...a, completed_at: new Date().toISOString() } : a))
        )
        return
      }

      const categoryNameById = new Map(categories.map((c) => [c.id, c.name]))
      const notAnswered = (q) => !answeredIds.has(q.id)
      let questions = []

      if (attempt.mode === 'national_test' && attempt.tag_filter) {
        const pool = (await fetchQuestionsByTagName(attempt.tag_filter)).filter(notAnswered)
        questions = selectPracticeQuestions({
          questions: pool,
          recentlyCorrectQuestionIds: recentlyCorrect,
          count: remaining,
        })
      } else if (attempt.mode === 'practice' && attempt.category_filter) {
        const byCat = await fetchQuestionsByCategory([attempt.category_filter], attempt.difficulty_filter || undefined)
        const pool = (byCat.get(attempt.category_filter) ?? []).filter(notAnswered)
        questions = selectPracticeQuestions({
          questions: pool,
          recentlyCorrectQuestionIds: recentlyCorrect,
          count: remaining,
        })
      } else {
        // adaptive (default)
        const [stats, byCat] = await Promise.all([
          fetchUserCategoryStats(user.id),
          fetchQuestionsByCategory(categories.map((c) => c.id), attempt.difficulty_filter || undefined),
        ])
        const filtered = new Map()
        for (const [catId, qs] of byCat) filtered.set(catId, qs.filter(notAnswered))
        questions = selectAdaptiveQuestions({
          categories,
          statsByCategoryId: stats,
          questionsByCategoryId: filtered,
          recentlyCorrectQuestionIds: recentlyCorrect,
          count: remaining,
        })
      }

      if (questions.length === 0) {
        // Nothing left to draw (pool exhausted) — just close it out.
        await completeAttempt(attempt.id)
        setAttempts((prev) =>
          prev.map((a) => (a.id === attempt.id ? { ...a, completed_at: new Date().toISOString() } : a))
        )
        return
      }

      questions = questions.map((q) => ({ ...q, categoryName: categoryNameById.get(q.category_id) }))
      navigate('/quiz/play', {
        state: { attemptId: attempt.id, mode: attempt.mode, questions, showRuleRefs: false },
      })
    } catch (err) {
      setActionError(err.message || 'Failed to resume the quiz.')
    } finally {
      setBusyAttemptId(null)
    }
  }

  if (loading) return <div className="page">Loading…</div>

  const categoryRows = categories
    .map((c) => {
      const s = statsByCategoryId.get(c.id)
      const total = s?.total_count ?? 0
      const accuracy = total > 0 ? Math.round((s.correct_count / total) * 100) : null
      return { ...c, total, accuracy }
    })
    .sort((a, b) => (a.accuracy ?? -1) - (b.accuracy ?? -1))

  const streak = computeStreakDays(attempts)

  return (
    <div className="page">
      <SectionHeader>Your Progress</SectionHeader>
      <div className="grid grid--3">
        <div className="card">
          <div className="eyebrow">All-Time Accuracy</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem' }}>{trend.overall ?? '—'}{trend.overall !== null && '%'}</div>
        </div>
        <div className="card">
          <div className="eyebrow">Last {14} Days</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem' }}>{trend.recent ?? '—'}{trend.recent !== null && '%'}</div>
          {trend.recent !== null && trend.older !== null && (
            <div className="help-text">
              {trend.recent >= trend.older ? '▲' : '▼'} vs {trend.older}% before that
            </div>
          )}
        </div>
        <div className="card">
          <div className="eyebrow">Current Streak</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem' }}>{streak} day{streak === 1 ? '' : 's'}</div>
        </div>
      </div>

      <div className={isAdmin ? 'grid grid--3' : 'grid grid--2'} style={{ marginTop: '1.25rem' }}>
        <button className="btn" onClick={() => navigate('/quiz', { state: { mode: 'adaptive' } })}>
          Start Adaptive Quiz
        </button>
        <button className="btn btn--outline" onClick={() => navigate('/quiz', { state: { mode: 'practice' } })}>
          Start Practice Mode
        </button>
        {isAdmin && (
          <button className="btn btn--outline" onClick={() => navigate('/quiz', { state: { mode: 'national-test' } })}>
            Run CFO National Test
          </button>
        )}
      </div>

      <SectionHeader>Accuracy by Category</SectionHeader>
      <div className="card">
        {categoryRows.map((c) => (
          <div className="accuracy-bar-row" key={c.id}>
            <span className="accuracy-bar-row__label">{c.name}</span>
            <div className="accuracy-bar-track">
              <div
                className="accuracy-bar-fill"
                style={{
                  width: `${c.accuracy ?? 0}%`,
                  background: c.accuracy === null ? 'var(--border)' : c.accuracy < WEAK_THRESHOLD ? '#c0392b' : 'var(--accent)',
                }}
              />
            </div>
            <span className="accuracy-bar-row__value">{c.accuracy === null ? 'Unattempted' : `${c.accuracy}%`}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <SectionHeader>Attempt History</SectionHeader>
        {attempts.some((a) => !a.completed_at) && (
          <button
            className="btn btn--sm btn--danger"
            onClick={handleCancelAll}
            disabled={busyAttemptId === 'all'}
          >
            {busyAttemptId === 'all' ? 'Cancelling…' : 'Cancel all in progress'}
          </button>
        )}
      </div>
      {actionError && <p className="error-text">{actionError}</p>}
      {attempts.length === 0 ? (
        <p className="muted">No quizzes yet — start one above.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Mode</th>
              <th>Category</th>
              <th>Questions</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {attempts.slice(0, 20).map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.started_at).toLocaleDateString()}</td>
                <td>{MODE_LABELS[a.mode] || a.mode}</td>
                <td>{formatAttemptSource(a)}</td>
                <td>{a.question_count}</td>
                <td>{a.completed_at ? 'Completed' : 'In Progress'}</td>
                <td>
                  {!a.completed_at && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn--sm"
                        onClick={() => handleResume(a)}
                        disabled={busyAttemptId === a.id || busyAttemptId === 'all'}
                      >
                        Resume
                      </button>
                      <button
                        className="btn btn--sm btn--outline"
                        onClick={() => handleComplete(a.id)}
                        disabled={busyAttemptId === a.id || busyAttemptId === 'all'}
                      >
                        Complete
                      </button>
                      <button
                        className="btn btn--sm btn--danger"
                        onClick={() => handleCancel(a.id)}
                        disabled={busyAttemptId === a.id || busyAttemptId === 'all'}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <SectionHeader>Missed Questions</SectionHeader>
      <button className="btn btn--outline" onClick={() => navigate('/missed')}>
        Review Missed Questions
      </button>
    </div>
  )
}
