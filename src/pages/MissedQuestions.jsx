import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthProvider.jsx'
import { fetchMissedQuestions, fetchCategories, createAttempt } from '../lib/api'
import SectionHeader from '../components/SectionHeader.jsx'
import QuestionReview from '../components/QuestionReview.jsx'

export default function MissedQuestions() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [missed, setMissed] = useState([])
  const [categoryNameById, setCategoryNameById] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [rows, categories] = await Promise.all([fetchMissedQuestions(user.id), fetchCategories()])
      if (cancelled) return
      setMissed(rows)
      setCategoryNameById(new Map(categories.map((c) => [c.id, c.name])))
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user.id])

  async function handleReattempt() {
    setStarting(true)
    try {
      const questions = missed.map((r) => ({ ...r.question, categoryName: categoryNameById.get(r.question.category_id) }))
      const attempt = await createAttempt({
        userId: user.id,
        mode: 'practice',
        categoryFilter: null,
        difficultyFilter: null,
        questionCount: questions.length,
      })
      navigate('/quiz/play', { state: { attemptId: attempt.id, mode: 'practice', questions } })
    } finally {
      setStarting(false)
    }
  }

  if (loading) return <div className="page">Loading…</div>

  return (
    <div className="page">
      <SectionHeader>Missed Questions</SectionHeader>
      {missed.length === 0 ? (
        <p className="muted">You haven&apos;t missed any questions yet — nice work.</p>
      ) : (
        <>
          <button className="btn" onClick={handleReattempt} disabled={starting} style={{ marginBottom: '1rem' }}>
            {starting ? 'Building quiz…' : `Re-attempt All (${missed.length})`}
          </button>
          {missed.map((r) => (
            <QuestionReview
              key={r.question_id}
              question={r.question}
              categoryName={categoryNameById.get(r.question.category_id)}
              selectedKey={r.selected_choice}
              isCorrect={false}
            />
          ))}
        </>
      )}
    </div>
  )
}
