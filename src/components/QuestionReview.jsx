import { CategoryBadge, DifficultyBadge, QuestionIdBadge } from './Badge.jsx'
import CommentThread from './CommentThread.jsx'
import FlagButton from './FlagButton.jsx'

export default function QuestionReview({ question, categoryName, selectedKey, isCorrect }) {
  const choices = ['A', 'B', 'C', 'D']
    .filter((key) => question[`choice_${key.toLowerCase()}`])
    .map((key) => ({ key, text: question[`choice_${key.toLowerCase()}`] }))

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        {categoryName && <CategoryBadge name={categoryName} />}
        <DifficultyBadge difficulty={question.difficulty} />
        <QuestionIdBadge id={question.external_id} sourceNumber={question.source_question_number} />
        <span className={`badge ${isCorrect ? 'badge--ruling' : ''}`} style={!isCorrect ? { background: '#c0392b', color: '#fff' } : undefined}>
          {isCorrect ? 'Correct' : 'Incorrect'}
        </span>
      </div>
      <p style={{ fontWeight: 600 }}>{question.question_text}</p>
      <div className="choice-list">
        {choices.map((c) => {
          let cls = 'choice-btn'
          if (c.key === question.correct_choice) cls += ' choice-btn--correct'
          else if (c.key === selectedKey) cls += ' choice-btn--incorrect'
          return (
            <div key={c.key} className={cls}>
              {c.text}
            </div>
          )
        })}
      </div>
      {question.explanation && (
        <p>
          <strong>Explanation: </strong>
          {question.explanation}
        </p>
      )}
      {(question.rule_refs || question.ar_refs) && (
        <p className="help-text">
          {question.rule_refs && <>Rule: {question.rule_refs} </>}
          {question.ar_refs && <>· {question.ar_refs}</>}
        </p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <CommentThread questionId={question.id} />
        <FlagButton questionId={question.id} />
      </div>
    </div>
  )
}
