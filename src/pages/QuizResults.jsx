import { useLocation, useNavigate } from 'react-router-dom'
import SectionHeader from '../components/SectionHeader.jsx'
import QuestionReview from '../components/QuestionReview.jsx'

export default function QuizResults() {
  const location = useLocation()
  const navigate = useNavigate()
  const { reviews, score, total } = location.state || {}

  if (!reviews) {
    navigate('/dashboard', { replace: true })
    return null
  }

  const pct = total > 0 ? Math.round((score / total) * 100) : 0

  return (
    <div className="page">
      <SectionHeader>Quiz Results</SectionHeader>
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="eyebrow">Your Score</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', color: 'var(--accent-dark)' }}>
          {score} / {total}
        </div>
        <div className="help-text">{pct}% correct</div>
      </div>

      <SectionHeader>Review</SectionHeader>
      {reviews.map((r, i) => (
        <QuestionReview
          key={`${r.question.id}-${i}`}
          question={r.question}
          categoryName={r.question.categoryName}
          selectedKey={r.selectedKey}
          isCorrect={r.isCorrect}
        />
      ))}

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
        <button className="btn" onClick={() => navigate('/quiz')}>
          Take Another Quiz
        </button>
        <button className="btn btn--outline" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </div>
    </div>
  )
}
