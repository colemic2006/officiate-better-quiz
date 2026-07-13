import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthProvider.jsx'
import {
  fetchCategories,
  fetchUserCategoryStats,
  fetchAttemptHistory,
  fetchAccuracyTrend,
  computeStreakDays,
} from '../lib/api'
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

      <SectionHeader>Attempt History</SectionHeader>
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
