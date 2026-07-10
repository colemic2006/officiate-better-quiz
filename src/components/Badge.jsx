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
