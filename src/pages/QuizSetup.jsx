import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthProvider.jsx'
import { fetchCategories, fetchQuestionsByCategory, fetchUserCategoryStats, fetchRecentlyCorrectQuestionIds, createAttempt } from '../lib/api'
import { selectAdaptiveQuestions, selectPracticeQuestions } from '../lib/quizEngine'
import SectionHeader from '../components/SectionHeader.jsx'

const DIFFICULTIES = ['Basic', 'Intermediate', 'Advanced']
const COUNT_OPTIONS = [5, 10, 15, 20, 25]

export default function QuizSetup() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [mode, setMode] = useState(location.state?.mode || 'adaptive')
  const [categories, setCategories] = useState([])
  const [categoryId, setCategoryId] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [count, setCount] = useState(10)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchCategories().then((cats) => {
      setCategories(cats)
      if (cats.length > 0) setCategoryId(String(cats[0].id))
    })
  }, [])

  async function handleStart() {
    setError('')
    if (mode === 'practice' && (!categoryId || !difficulty)) {
      setError('Practice mode requires a category and a difficulty.')
      return
    }
    setStarting(true)
    try {
      const recentlyCorrect = await fetchRecentlyCorrectQuestionIds(user.id)

      let questions = []
      let categoryFilter = null
      let difficultyFilter = difficulty || null

      if (mode === 'adaptive') {
        const [statsByCategoryId, questionsByCategoryId] = await Promise.all([
          fetchUserCategoryStats(user.id),
          fetchQuestionsByCategory(categories.map((c) => c.id), difficulty || undefined),
        ])
        questions = selectAdaptiveQuestions({
          categories,
          statsByCategoryId,
          questionsByCategoryId,
          recentlyCorrectQuestionIds: recentlyCorrect,
          count: Number(count),
        })
      } else {
        categoryFilter = Number(categoryId)
        const questionsByCategoryId = await fetchQuestionsByCategory([categoryFilter], difficulty)
        questions = selectPracticeQuestions({
          questions: questionsByCategoryId.get(categoryFilter) ?? [],
          recentlyCorrectQuestionIds: recentlyCorrect,
          count: Number(count),
        })
      }

      if (questions.length === 0) {
        setError('No questions are available for that selection yet. Try a different category or difficulty.')
        setStarting(false)
        return
      }

      const categoryNameById = new Map(categories.map((c) => [c.id, c.name]))
      questions = questions.map((q) => ({ ...q, categoryName: categoryNameById.get(q.category_id) }))

      const attempt = await createAttempt({
        userId: user.id,
        mode,
        categoryFilter,
        difficultyFilter,
        questionCount: questions.length,
      })

      navigate('/quiz/play', { state: { attemptId: attempt.id, mode, questions } })
    } catch (err) {
      setError(err.message || 'Something went wrong starting the quiz.')
      setStarting(false)
    }
  }

  return (
    <div className="page">
      <SectionHeader>Set Up Your Quiz</SectionHeader>

      <div className="card">
        <div className="field">
          <label>Mode</label>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className={mode === 'adaptive' ? 'btn' : 'btn btn--outline'}
              onClick={() => setMode('adaptive')}
            >
              Adaptive (Smart Quiz)
            </button>
            <button
              type="button"
              className={mode === 'practice' ? 'btn' : 'btn btn--outline'}
              onClick={() => setMode('practice')}
            >
              Practice Mode
            </button>
          </div>
          <p className="help-text">
            {mode === 'adaptive'
              ? 'Mixes categories, weighted toward your weak areas. You still pick the difficulty.'
              : 'You pick a single category and difficulty.'}
          </p>
        </div>

        {mode === 'practice' && (
          <div className="field">
            <label htmlFor="category">Category</label>
            <select id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label htmlFor="difficulty">Difficulty {mode === 'adaptive' && '(optional)'}</label>
          <select id="difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            {mode === 'adaptive' && <option value="">Any</option>}
            {mode === 'practice' && <option value="" disabled>Select…</option>}
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="count">Number of Questions</label>
          <select id="count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="error-text">{error}</p>}

        <button className="btn" onClick={handleStart} disabled={starting}>
          {starting ? 'Building your quiz…' : 'Start Quiz'}
        </button>
      </div>
    </div>
  )
}
