// Core quiz-engine logic: adaptive category weighting, recency soft-avoid,
// render-time answer scrambling, and content-based grading. Pure functions,
// no Supabase calls, so this is straightforwardly testable.

export const RECENCY_WINDOW_DAYS = 14

const BASE_WEIGHT = 1
const NEVER_ATTEMPTED_BOOST = 0.6
// A never-attempted category is treated as if it had a neutral (50%) prior
// accuracy, then gets the flat boost on top — see spec Section 6.
const NEUTRAL_PRIOR_ACCURACY = 0.5

/**
 * weight(category) = base_weight × (1 - accuracy(category)) + new_category_boost
 * Categories the user has never attempted get a flat boost instead of being
 * scored as "0% accuracy" (which would otherwise make them dominate) or
 * ignored entirely.
 */
export function computeCategoryWeights(categories, statsByCategoryId) {
  return categories.map((category) => {
    const stats = statsByCategoryId.get(category.id)
    const totalCount = stats?.total_count ?? 0
    const neverAttempted = totalCount === 0
    const accuracy = neverAttempted ? NEUTRAL_PRIOR_ACCURACY : stats.correct_count / totalCount
    const weight = BASE_WEIGHT * (1 - accuracy) + (neverAttempted ? NEVER_ATTEMPTED_BOOST : 0)
    return { category, weight: Math.max(weight, 0.01) }
  })
}

/** Weighted-random pick of one item from a list of { weight } entries. */
function weightedPick(weightedItems, rng = Math.random) {
  const total = weightedItems.reduce((sum, item) => sum + item.weight, 0)
  let r = rng() * total
  for (const item of weightedItems) {
    r -= item.weight
    if (r <= 0) return item
  }
  return weightedItems[weightedItems.length - 1]
}

/**
 * Build an adaptive quiz: sample categories by weakness-weighted probability,
 * then pick a question within that category, soft-avoiding ones the user
 * answered correctly within RECENCY_WINDOW_DAYS. Falls back to the
 * recently-correct pool rather than serving a short quiz.
 */
export function selectAdaptiveQuestions({
  categories,
  statsByCategoryId,
  questionsByCategoryId,
  recentlyCorrectQuestionIds,
  count,
  rng = Math.random,
}) {
  const weights = computeCategoryWeights(categories, statsByCategoryId).filter(
    (w) => (questionsByCategoryId.get(w.category.id)?.length ?? 0) > 0
  )
  const used = new Set()
  const selected = []
  let candidates = [...weights]

  while (selected.length < count && candidates.length > 0) {
    const pick = weightedPick(candidates, rng)
    const pool = (questionsByCategoryId.get(pick.category.id) ?? []).filter((q) => !used.has(q.id))

    const question = pickFromPoolWithRecencyFallback(pool, recentlyCorrectQuestionIds, rng)
    if (!question) {
      // This category is exhausted; drop it and keep sampling the rest.
      candidates = candidates.filter((c) => c.category.id !== pick.category.id)
      continue
    }
    used.add(question.id)
    selected.push(question)
  }

  return selected
}

/** Practice mode: single category (+ optional difficulty), same recency soft-avoid. */
export function selectPracticeQuestions({
  questions,
  recentlyCorrectQuestionIds,
  count,
  rng = Math.random,
}) {
  const pool = [...questions]
  const selected = []
  while (selected.length < count && pool.length > 0) {
    const question = pickFromPoolWithRecencyFallback(pool, recentlyCorrectQuestionIds, rng)
    if (!question) break
    const idx = pool.findIndex((q) => q.id === question.id)
    pool.splice(idx, 1)
    selected.push(question)
  }
  return selected
}

function pickFromPoolWithRecencyFallback(pool, recentlyCorrectQuestionIds, rng) {
  if (pool.length === 0) return null
  const preferred = pool.filter((q) => !recentlyCorrectQuestionIds.has(q.id))
  const source = preferred.length > 0 ? preferred : pool
  return source[Math.floor(rng() * source.length)]
}

/**
 * Render-time only: shuffle the question's choices (2–4 of them — True/False
 * questions only have A and B) into a random display order. Each option
 * keeps its original letter as an opaque identity key, so grading is always
 * by content/identity rather than position.
 */
export function shuffleChoices(question, rng = Math.random) {
  const options = ['A', 'B', 'C', 'D']
    .filter((key) => question[`choice_${key.toLowerCase()}`])
    .map((key) => ({
      key,
      text: question[`choice_${key.toLowerCase()}`],
    }))
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[options[i], options[j]] = [options[j], options[i]]
  }
  return options
}

export function isCorrectAnswer(question, selectedKey) {
  return selectedKey === question.correct_choice
}
