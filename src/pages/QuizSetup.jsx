import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthProvider.jsx'
import {
  fetchCategories,
  fetchQuestionsByCategory,
  fetchUserCategoryStats,
  fetchRecentlyCorrectQuestionIds,
  fetchNationalTestYears,
  fetchQuestionsByTagName,
  createAttempt,
} from '../lib/api'
import { selectAdaptiveQuestions, selectPracticeQuestions } from '../lib/quizEngine'
import SectionHeader from '../components/SectionHeader.jsx'

const DIFFICULTIES = ['Basic', 'Intermediate', 'Advanced']
const COUNT_OPTIONS = [5, 10, 15, 20, 25]
const NATIONAL_TEST_COUNT_OPTIONS = ['all', 10, 25, 50]

export default function QuizSetup() {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [mode, setMode] = useState(location.state?.mode || 'adaptive')
  const [categories, setCategories] = useState([])
  const [categoryId, setCategoryId] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [count, setCount] = useState(10)
  const [testYears, setTestYears] = useState([])
  const [testYear, setTestYear] = useState('')
  const [testCount, setTestCount] = useState('all')
  const [showRuleRefs, setShowRuleRefs] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchCategories().then((cats) => {
      setCategories(cats)
      if (cats.length > 0) setCategoryId(String(cats[0].id))
    })
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    fetchNationalTestYears().then((years) => {
      setTestYears(years)
      if (years.length > 0) setTestYear(String(years[0]))
    })
  }, [isAdmin])

  // National Test mode is admin-only; if a non-admin somehow lands on this
  // page with that mode pre-selected (e.g. stale nav state), fall back.
  useEffect(() => {
    if (mode === 'national-test' && !isAdmin) setMode('adaptive')
  }, [mode, isAdmin])

  async function handleStart() {
    setError('')
    if (mode === 'practice' && (!categoryId || !difficulty)) {
      setError('Practice mode requires a category and a difficulty.')
      return
    }
    if (mode === 'national-test' && !testYear) {
      setError('Pick a year for the National Test.')
      return
    }
    setStarting(true)
    try {
      const recentlyCorrect = await fetchRecentlyCorrectQuestionIds(user.id)

      let questions = []
      let categoryFilter = null
      let difficultyFilter = difficulty || null
      let tagFilter = null

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
      } else if (mode === 'national-test') {
        difficultyFilter = null
        tagFilter = `${testYear}-cfo-rules-test`
        const pool = await fetchQuestionsByTagName(tagFilter)
        const desiredCount = testCount === 'all' ? pool.length : Number(testCount)
        questions = selectPracticeQuestions({
          questions: pool,
          recentlyCorrectQuestionIds: recentlyCorrect,
          count: desiredCount,
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
        setError(
          mode === 'national-test'
            ? 'No questions are available for that test year yet.'
            : 'No questions are available for that selection yet. Try a different category or difficulty.'
        )
        setStarting(false)
        return
      }

      const categoryNameById = new Map(categories.map((c) => [c.id, c.name]))
      questions = questions.map((q) => ({ ...q, categoryName: categoryNameById.get(q.category_id) }))

      const attempt = await createAttempt({
        userId: user.id,
        mode: mode === 'national-test' ? 'national_test' : mode,
        categoryFilter,
        difficultyFilter,
        tagFilter,
        questionCount: questions.length,
      })

      navigate('/quiz/play', { state: { attemptId: attempt.id, mode, questions, showRuleRefs } })
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
            {isAdmin && (
              <button
                type="button"
                className={mode === 'national-test' ? 'btn' : 'btn btn--outline'}
                onClick={() => setMode('national-test')}
              >
                CFO National Test
              </button>
            )}
          </div>
          <p className="help-text">
            {mode === 'adaptive' && 'Mixes categories, weighted toward your weak areas. You still pick the difficulty.'}
            {mode === 'practice' && 'You pick a single category and difficulty.'}
            {mode === 'national-test' &&
              'Draws only from a specific year\'s CFO National Test question set, independent of category or difficulty.'}
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

        {mode === 'national-test' && (
          <div className="field">
            <label htmlFor="test-year">Test Year</label>
            {testYears.length === 0 ? (
              <p className="help-text">No CFO National Test questions have been ingested yet.</p>
            ) : (
              <select id="test-year" value={testYear} onChange={(e) => setTestYear(e.target.value)}>
                {testYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {mode !== 'national-test' && (
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
        )}

        <div className="field">
          <label htmlFor="count">Number of Questions</label>
          {mode === 'national-test' ? (
            <select id="count" value={testCount} onChange={(e) => setTestCount(e.target.value)}>
              {NATIONAL_TEST_COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n === 'all' ? 'All (full test)' : n}
                </option>
              ))}
            </select>
          ) : (
            <select id="count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 400 }}>
            <input type="checkbox" checked={showRuleRefs} onChange={(e) => setShowRuleRefs(e.target.checked)} />
            Show rule references while answering
          </label>
          <p className="help-text">
            Study mode — displays the rule citation for each question up front (when available) so you know
            where to look it up, instead of only revealing it after you answer.
          </p>
        </div>

        {error && <p className="error-text">{error}</p>}

        <button
          className="btn"
          onClick={handleStart}
          disabled={starting || (mode === 'national-test' && testYears.length === 0)}
        >
          {starting ? 'Building your quiz…' : 'Start Quiz'}
        </button>
      </div>
    </div>
  )
}
