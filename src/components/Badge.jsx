export function DifficultyBadge({ difficulty }) {
  return <span className="badge badge--difficulty">{difficulty}</span>
}

export function CategoryBadge({ name }) {
  return <span className="badge badge--category">{name}</span>
}

export function RulingConfirmedBadge() {
  return <span className="badge badge--ruling">Ruling Confirmed</span>
}

export function PendingBadge() {
  return <span className="badge badge--pending">Pending Review</span>
}

// Shows the stable question_id (e.g. "Q-0053") plus, when known, the
// question's number within its original source document (e.g. "Source Q9")
// so users can reference a specific question when reporting a bug or
// content issue.
export function QuestionIdBadge({ id, sourceNumber }) {
  if (!id) return null
  return (
    <span className="badge badge--id">
      {id}
      {sourceNumber ? ` · Source Q${sourceNumber}` : ''}
    </span>
  )
}
