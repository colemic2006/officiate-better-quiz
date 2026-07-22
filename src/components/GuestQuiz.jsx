import { useEffect, useMemo, useState } from 'react'
import { shuffleChoices, isCorrectAnswer } from '../lib/quizEngine'
import { fetchGuestQuizQuestions } from '../lib/api'
import { CategoryBadge, DifficultyBadge, QuestionIdBadge } from './Badge.jsx'

const QUESTION_COUNT = 5

export default function GuestQuiz() {
  const [status, setStatus] = useState('loading')
  const [questions, setQuestions] = useState([])
  const [index, setIndex] = useState(0)
  const [selectedKey, setSelectedKey] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [score, setScore] = useState(0)

  useEffect(() => {
    loadQuestions()
  }, [])

  async function loadQuestions() {
    setStatus('loading')
    try {
      const data = await fetchGuestQuizQuestions(QUESTION_COUNT)
      setQuestions(data)
      setIndex(0)
      setSelectedKey(null)
      setSubmitted(false)
      setScore(0)
      setStatus(data.length > 0 ? 'playing' : 'error')
    } catch {
      setStatus('error')
    }
  }

  const question = questions[index]
  // Shuffle once per question, not on every re-render.
  const choices = useMemo(() => (question ? shuffleChoices(question) : []), [question?.id])

  function handleChoose(key) {
    if (submitted) return
    setSelectedKey(key)
  }

  function handleSubmit() {
    if (submitted || selectedKey === null) return
    setSubmitted(true)
    if (isCorrectAnswer(question, selectedKey)) setScore((s) => s + 1)
  }

  function handleNext() {
    setIndex((i) => i + 1)
    setSelectedKey(null)
    setSubmitted(false)
  }

  if (status === 'loading') {
    return (
      <div className="card">
        <p className="help-text">Loading a quick quiz…</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="card">
        <p className="error-text">Couldn't load a sample quiz right now.</p>
        <button className="btn btn--outline" onClick={loadQuestions}>
          Try Again
        </button>
      </div>
    )
  }

  if (index >= questions.length) {
    return (
      <div className="card">
        <p className="eyebrow">Sample Quiz Complete</p>
        <h3 style={{ margin: '0.3rem 0 0.75rem' }}>
          You scored {score} / {questions.length}
        </h3>
        <p className="muted" style={{ marginBottom: '1rem' }}>
          Create a free account to track your accuracy by category, get adaptive quizzes tuned to your
          weak spots, and unlock the full question bank.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn--outline" onClick={loadQuestions}>
            Try 5 More
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <p className="eyebrow">Try It — No Account Needed</p>
      <div className="progress-track" style={{ margin: '0.4rem 0 0.75rem' }}>
        <div className="progress-fill" style={{ width: `${((index + (submitted ? 1 : 0)) / questions.length) * 100}%` }} />
      </div>
      <p className="help-text">
        Question {index + 1} of {questions.length}
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <CategoryBadge name={question.category_name} />
        <DifficultyBadge difficulty={question.difficulty} />
        <QuestionIdBadge id={question.external_id} />
      </div>
      <p style={{ fontWeight: 600, fontSize: '1.05rem' }}>{question.question_text}</p>

      <div className="choice-list">
        {choices.map((c) => {
          let cls = 'choice-btn'
          if (submitted) {
            if (c.key === question.correct_choice) cls += ' choice-btn--correct'
            else if (c.key === selectedKey) cls += ' choice-btn--incorrect'
          } else if (c.key === selectedKey) {
            cls += ' choice-btn--selected'
          }
          return (
            <button key={c.key} className={cls} disabled={submitted} onClick={() => handleChoose(c.key)}>
              {c.text}
            </button>
          )
        })}
      </div>

      {!submitted && (
        <button className="btn" onClick={handleSubmit} disabled={selectedKey === null}>
          Submit Answer
        </button>
      )}

      {submitted && (
        <>
          <p>
            <strong>{selectedKey === question.correct_choice ? 'Correct! ' : 'Incorrect. '}</strong>
            {question.reviewed_at && question.explanation}
          </p>
          {(question.rule_refs || question.ar_refs) && (
            <p className="help-text">
              {question.rule_refs && <>Rule: {question.rule_refs} </>}
              {question.ar_refs && <>· {question.ar_refs}</>}
            </p>
          )}
          <button className="btn" onClick={handleNext}>
            {index + 1 === questions.length ? 'See Score' : 'Next Question'}
          </button>
        </>
      )}
    </div>
  )
}
