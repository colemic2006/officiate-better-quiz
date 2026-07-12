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

// Shows the stable question_id (e.g. "Q-0053") so users can reference a
// specific question when reporting a bug or content issue.
export function QuestionIdBadge({ id }) {
  if (!id) return null
  return <span className="badge badge--id">{id}</span>
}
