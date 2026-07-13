import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { shuffleChoices, isCorrectAnswer } from '../lib/quizEngine'
import { recordAnswer, completeAttempt } from '../lib/api'
import { CategoryBadge, DifficultyBadge, QuestionIdBadge } from '../components/Badge.jsx'
import CommentThread from '../components/CommentThread.jsx'
import FlagButton from '../components/FlagButton.jsx'

export default function QuizPlay() {
  const location = useLocation()
  const navigate = useNavigate()
  const { attemptId, questions, showRuleRefs } = location.state || {}

  const [index, setIndex] = useState(0)
  const [selectedKey, setSelectedKey] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [reviews, setReviews] = useState([])
  const [saving, setSaving] = useState(false)

  const question = questions?.[index]
  // Shuffle once per question, not on every re-render.
  const choices = useMemo(() => (question ? shuffleChoices(question) : []), [question?.id])

  if (!attemptId || !questions || questions.length === 0) {
    navigate('/quiz', { replace: true })
    return null
  }

  async function handleSelect(key) {
    if (answered) return
    setSelectedKey(key)
    setAnswered(true)
    setSaving(true)
    const correct = isCorrectAnswer(question, key)
    try {
      await recordAnswer({ attemptId, question, selectedKey: key })
    } finally {
      setSaving(false)
    }
    setReviews((prev) => [...prev, { question, selectedKey: key, isCorrect: correct }])
  }

  async function handleNext() {
    if (index + 1 < questions.length) {
      setIndex(index + 1)
      setSelectedKey(null)
      setAnswered(false)
    } else {
      await completeAttempt(attemptId)
      const score = reviews.filter((r) => r.isCorrect).length
      navigate('/quiz/results', { replace: true, state: { reviews, score, total: questions.length } })
    }
  }

  const isLast = index + 1 === questions.length

  return (
    <div className="page">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${((index + (answered ? 1 : 0)) / questions.length) * 100}%` }} />
      </div>
      <p className="help-text">
        Question {index + 1} of {questions.length}
      </p>

      <div className="card">
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <CategoryBadge name={question.category?.name || question.categoryName || ''} />
          <DifficultyBadge difficulty={question.difficulty} />
          <QuestionIdBadge id={question.external_id} sourceNumber={question.source_question_number} />
        </div>
        <p style={{ fontWeight: 600, fontSize: '1.05rem' }}>{question.question_text}</p>

        {showRuleRefs && !answered && (question.rule_refs || question.ar_refs) && (
          <div className="rule-hint">
            <span className="eyebrow">Look it up</span>
            <div>
              {question.rule_refs && <>Rule: {question.rule_refs} </>}
              {question.ar_refs && <>· {question.ar_refs}</>}
            </div>
          </div>
        )}

        <div className="choice-list">
          {choices.map((c) => {
            let cls = 'choice-btn'
            if (answered) {
              if (c.key === question.correct_choice) cls += ' choice-btn--correct'
              else if (c.key === selectedKey) cls += ' choice-btn--incorrect'
            }
            return (
              <button key={c.key} className={cls} disabled={answered} onClick={() => handleSelect(c.key)}>
                {c.text}
              </button>
            )
          })}
        </div>

        {answered && (
          <>
            <p>
              <strong>{selectedKey === question.correct_choice ? 'Correct! ' : 'Incorrect. '}</strong>
              {question.explanation}
            </p>
            {(question.rule_refs || question.ar_refs) && (
              <p className="help-text">
                {question.rule_refs && <>Rule: {question.rule_refs} </>}
                {question.ar_refs && <>· {question.ar_refs}</>}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', margin: '0.75rem 0' }}>
              <CommentThread questionId={question.id} />
              <FlagButton questionId={question.id} />
            </div>
            <button className="btn" onClick={handleNext} disabled={saving}>
              {isLast ? 'Finish Quiz' : 'Next Question'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
