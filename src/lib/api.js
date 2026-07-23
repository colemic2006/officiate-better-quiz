import { supabase } from './supabaseClient'
import { RECENCY_WINDOW_DAYS, isCorrectAnswer } from './quizEngine'

// PostgREST caps a single response at the project's max-rows (1000 by default),
// so an unbounded `select('*')` silently drops everything past the first page —
// and with no explicit order those are the lowest-id rows, so newer questions
// never surface in a quiz. Page through with a stable order to fetch them all.
const PAGE_SIZE = 1000

async function fetchAllRows(buildQuery) {
  const all = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    all.push(...data)
    if (data.length < PAGE_SIZE) return all
  }
}

// Signed-out visitors: a handful of random questions via the security-definer
// RPC (the `questions` table itself is authenticated-only). Shape is already
// flat (category_name instead of a nested category object) since it's not
// reused by the logged-in quiz flow.
export async function fetchGuestQuizQuestions(count = 5) {
  const { data, error } = await supabase.rpc('random_questions', { p_count: count })
  if (error) throw error
  return data
}

export async function fetchCategories() {
  const { data, error } = await supabase.from('categories').select('*').order('sort_order')
  if (error) throw error
  return data
}

export async function fetchQuestionCount() {
  const { count, error } = await supabase
    .from('questions')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
  if (error) throw error
  return count
}

export async function fetchAccuracyTrend(userId) {
  const since = new Date(Date.now() - RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('attempt_answers')
    .select('is_correct, answered_at, attempts!inner(user_id)')
    .eq('attempts.user_id', userId)
  if (error) throw error
  const recent = data.filter((r) => r.answered_at >= since)
  const older = data.filter((r) => r.answered_at < since)
  const pct = (rows) => (rows.length > 0 ? Math.round((rows.filter((r) => r.is_correct).length / rows.length) * 100) : null)
  return { recent: pct(recent), older: pct(older), overall: pct(data) }
}

export function computeStreakDays(attempts) {
  const days = new Set(
    attempts.filter((a) => a.completed_at).map((a) => new Date(a.completed_at).toDateString())
  )
  let streak = 0
  const cursor = new Date()
  // Today doesn't have to have an attempt yet for the streak to still count
  // as "alive" — but it must be unbroken back from the most recent day.
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1)
  while (days.has(cursor.toDateString())) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export async function fetchQuestionsByCategory(categoryIds, difficulty) {
  const data = await fetchAllRows(() => {
    let query = supabase
      .from('questions')
      .select('*')
      .in('category_id', categoryIds)
      .eq('is_active', true)
      .order('id', { ascending: true })
    if (difficulty) query = query.eq('difficulty', difficulty)
    return query
  })
  const byCategory = new Map()
  for (const q of data) {
    if (!byCategory.has(q.category_id)) byCategory.set(q.category_id, [])
    byCategory.get(q.category_id).push(q)
  }
  return byCategory
}

// "CFO National Test" questions are tagged by year at ingestion time as
// `<year>-cfo-rules-test` (e.g. "2025-cfo-rules-test"). This scans the tags
// table for that pattern instead of hardcoding a year list, so a newly
// ingested test year shows up automatically.
const NATIONAL_TEST_TAG_PATTERN = /^(\d{4})-cfo-rules-test$/

export async function fetchNationalTestYears() {
  const { data, error } = await supabase.from('tags').select('name').ilike('name', '%-cfo-rules-test')
  if (error) throw error
  const years = data
    .map((t) => t.name.match(NATIONAL_TEST_TAG_PATTERN))
    .filter(Boolean)
    .map((m) => Number(m[1]))
  return [...new Set(years)].sort((a, b) => b - a)
}

export async function fetchQuestionsByTagName(tagName) {
  const { data: tag, error: tagErr } = await supabase.from('tags').select('id').eq('name', tagName).maybeSingle()
  if (tagErr) throw tagErr
  if (!tag) return []

  const { data: links, error: linkErr } = await supabase
    .from('question_tags')
    .select('question_id')
    .eq('tag_id', tag.id)
  if (linkErr) throw linkErr
  if (links.length === 0) return []

  const questionIds = links.map((l) => l.question_id)
  return fetchAllRows(() =>
    supabase
      .from('questions')
      .select('*')
      .in('id', questionIds)
      .eq('is_active', true)
      .order('id', { ascending: true })
  )
}

export async function fetchUserCategoryStats(userId) {
  const { data, error } = await supabase.from('user_category_stats').select('*').eq('user_id', userId)
  if (error) throw error
  const byCategory = new Map(data.map((s) => [s.category_id, s]))
  return byCategory
}

export async function fetchRecentlyCorrectQuestionIds(userId) {
  const since = new Date(Date.now() - RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('attempt_answers')
    .select('question_id, is_correct, answered_at, attempts!inner(user_id)')
    .eq('attempts.user_id', userId)
    .eq('is_correct', true)
    .gte('answered_at', since)
  if (error) throw error
  return new Set(data.map((r) => r.question_id))
}

export async function createAttempt({ userId, mode, categoryFilter, difficultyFilter, tagFilter, questionCount }) {
  const { data, error } = await supabase
    .from('attempts')
    .insert({
      user_id: userId,
      mode,
      category_filter: categoryFilter ?? null,
      difficulty_filter: difficultyFilter ?? null,
      tag_filter: tagFilter ?? null,
      question_count: questionCount,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function recordAnswer({ attemptId, userId, question, selectedKey }) {
  const correct = isCorrectAnswer(question, selectedKey)
  const { error: answerErr } = await supabase.from('attempt_answers').insert({
    attempt_id: attemptId,
    question_id: question.id,
    selected_choice: selectedKey,
    is_correct: correct,
  })
  if (answerErr) throw answerErr

  const { error: statErr } = await supabase.rpc('increment_category_stat', {
    p_user_id: userId,
    p_category_id: question.category_id,
    p_correct: correct,
  })
  if (statErr) throw statErr

  return correct
}

export async function completeAttempt(attemptId) {
  const { error } = await supabase
    .from('attempts')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', attemptId)
  if (error) throw error
}

// Discard an attempt entirely. attempt_answers cascade-delete with it, so an
// abandoned in-progress quiz leaves no trace in history or stats.
export async function cancelAttempt(attemptId) {
  const { error } = await supabase.from('attempts').delete().eq('id', attemptId)
  if (error) throw error
}

// Discard every in-progress (not completed) attempt for a user in one shot.
export async function cancelAllInProgressAttempts(userId) {
  const { data, error } = await supabase
    .from('attempts')
    .delete()
    .eq('user_id', userId)
    .is('completed_at', null)
    .select('id')
  if (error) throw error
  return data?.length ?? 0
}

// Question ids already answered within an attempt, so a resume doesn't re-ask
// them (there's no unique constraint on attempt_answers, so we exclude by id).
export async function fetchAnsweredQuestionIds(attemptId) {
  const { data, error } = await supabase
    .from('attempt_answers')
    .select('question_id')
    .eq('attempt_id', attemptId)
  if (error) throw error
  return new Set(data.map((r) => r.question_id))
}

export async function fetchAttemptHistory(userId) {
  const { data, error } = await supabase
    .from('attempts')
    .select('*, category:category_filter(name)')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchAttemptAnswers(attemptId) {
  const { data, error } = await supabase
    .from('attempt_answers')
    .select('*, question:questions(*)')
    .eq('attempt_id', attemptId)
    .order('answered_at')
  if (error) throw error
  return data
}

export async function fetchMissedQuestions(userId) {
  const { data, error } = await supabase
    .from('attempt_answers')
    .select('question_id, is_correct, selected_choice, answered_at, question:questions(*), attempts!inner(user_id)')
    .eq('attempts.user_id', userId)
    .eq('is_correct', false)
    .order('answered_at', { ascending: false })
  if (error) throw error
  // De-dupe by question, keeping the most recent miss; a question later
  // answered correctly (within the recency window) still shows here since a
  // wrong answer happened at some point — that's the point of the review list.
  const byQuestion = new Map()
  for (const row of data) {
    if (!byQuestion.has(row.question_id)) byQuestion.set(row.question_id, row)
  }
  return [...byQuestion.values()]
}

export async function fetchApprovedComments(questionId) {
  const { data, error } = await supabase
    .from('question_comments')
    .select('*, profile:profiles(display_name)')
    .eq('question_id', questionId)
    .eq('status', 'approved')
    .order('created_at')
  if (error) throw error
  return data
}

export async function fetchOwnPendingComments(questionId, userId) {
  const { data, error } = await supabase
    .from('question_comments')
    .select('*')
    .eq('question_id', questionId)
    .eq('user_id', userId)
    .neq('status', 'approved')
  if (error) throw error
  return data
}

export async function postComment({ questionId, userId, text, isAdmin }) {
  const payload = {
    question_id: questionId,
    user_id: userId,
    comment_text: text,
    is_admin_reply: isAdmin,
    status: isAdmin ? 'approved' : 'pending',
  }
  const { error } = await supabase.from('question_comments').insert(payload)
  if (error) throw error
}

export async function submitFlag({ questionId, userId, reason }) {
  const { error } = await supabase.from('question_flags').insert({ question_id: questionId, user_id: userId, reason })
  if (error) throw error
}

export async function fetchPendingComments() {
  const { data, error } = await supabase
    .from('question_comments')
    .select('*, question:questions(question_text, external_id), profile:profiles(display_name)')
    .eq('status', 'pending')
    .order('created_at')
  if (error) throw error
  return data
}

export async function fetchOpenFlags() {
  const { data, error } = await supabase
    .from('question_flags')
    .select('*, question:questions(question_text, external_id), profile:profiles(display_name)')
    .eq('status', 'open')
    .order('created_at')
  if (error) throw error
  return data
}

export async function moderateComment(id, status) {
  const { error } = await supabase.from('question_comments').update({ status }).eq('id', id)
  if (error) throw error
}

export async function resolveFlag(id, status) {
  const { error } = await supabase.from('question_flags').update({ status }).eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Admin: question bank search + direct edit
// ---------------------------------------------------------------------------

const ADMIN_SEARCH_LIMIT = 50

export async function adminSearchQuestions({ search, categoryId, includeInactive, limit = ADMIN_SEARCH_LIMIT } = {}) {
  let query = supabase
    .from('questions')
    .select('*, category:categories(name)')
    .order('external_id')
    .limit(limit)
  if (!includeInactive) query = query.eq('is_active', true)
  if (categoryId) query = query.eq('category_id', categoryId)
  if (search) {
    const term = search.trim().replace(/[%,]/g, '')
    if (term) {
      const like = `%${term}%`
      query = query.or(`external_id.ilike.${like},question_text.ilike.${like}`)
    }
  }
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function fetchTagsForQuestions(questionIds) {
  if (questionIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('question_tags')
    .select('question_id, tag:tags(name)')
    .in('question_id', questionIds)
  if (error) throw error
  const byQuestion = new Map()
  for (const row of data) {
    if (!byQuestion.has(row.question_id)) byQuestion.set(row.question_id, [])
    byQuestion.get(row.question_id).push(row.tag.name)
  }
  return byQuestion
}

export async function adminUpdateQuestion(id, fields) {
  const { data, error } = await supabase
    .from('questions')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, category:categories(name)')
    .single()
  if (error) throw error
  return data
}

// Replaces a question's tag links with exactly `tagNames` — adding any
// missing tag rows first (mirrors the auto-create-on-ingest behavior in
// scripts/ingest.mjs) and removing links for tags no longer wanted.
export async function adminSetQuestionTags(questionId, tagNames) {
  const desired = [...new Set(tagNames.map((t) => t.trim()).filter(Boolean))]

  const { data: existingLinks, error: linkErr } = await supabase
    .from('question_tags')
    .select('tag_id, tag:tags(name)')
    .eq('question_id', questionId)
  if (linkErr) throw linkErr

  const currentNames = new Set(existingLinks.map((l) => l.tag.name))
  const toAdd = desired.filter((n) => !currentNames.has(n))
  const toRemoveTagIds = existingLinks.filter((l) => !desired.includes(l.tag.name)).map((l) => l.tag_id)

  if (toRemoveTagIds.length > 0) {
    const { error } = await supabase
      .from('question_tags')
      .delete()
      .eq('question_id', questionId)
      .in('tag_id', toRemoveTagIds)
    if (error) throw error
  }

  if (toAdd.length > 0) {
    const { data: existingTags, error: findErr } = await supabase.from('tags').select('id, name').in('name', toAdd)
    if (findErr) throw findErr
    const tagIdByName = new Map(existingTags.map((t) => [t.name, t.id]))
    const missing = toAdd.filter((n) => !tagIdByName.has(n))

    if (missing.length > 0) {
      const { data: inserted, error: insErr } = await supabase
        .from('tags')
        .insert(missing.map((name) => ({ name })))
        .select('id, name')
      if (insErr) throw insErr
      for (const t of inserted) tagIdByName.set(t.name, t.id)
    }

    const { error: relinkErr } = await supabase
      .from('question_tags')
      .insert(toAdd.map((name) => ({ question_id: questionId, tag_id: tagIdByName.get(name) })))
    if (relinkErr) throw relinkErr
  }

  return desired
}

// ---------------------------------------------------------------------------
// Admin: editorial review workflow
// ---------------------------------------------------------------------------

// Lightweight ordered list of every question (optionally within one category,
// and/or carrying a specific tag) used to drive the review queue: progress
// counts, position, and navigation. Only the columns the queue needs, paged
// past the 1000-row cap.
export async function fetchReviewQueue({ categoryId = null, tagName = null } = {}) {
  let questionIds = null
  if (tagName) {
    // Resolve the tag to the set of question ids that carry it, so the queue
    // can be scoped to (e.g.) just the machine-generated rule references.
    const { data: tag, error: tagErr } = await supabase
      .from('tags')
      .select('id')
      .eq('name', tagName)
      .maybeSingle()
    if (tagErr) throw tagErr
    if (!tag) return []
    const links = await fetchAllRows(() =>
      supabase.from('question_tags').select('question_id').eq('tag_id', tag.id)
    )
    questionIds = links.map((l) => l.question_id)
    if (questionIds.length === 0) return []
  }
  return fetchAllRows(() => {
    let q = supabase
      .from('questions')
      .select('id, external_id, reviewed_at, category_id')
      .order('external_id', { ascending: true })
    if (categoryId) q = q.eq('category_id', categoryId)
    if (questionIds) q = q.in('id', questionIds)
    return q
  })
}

// Full question row (with category name) for the one currently being edited.
export async function fetchQuestionById(id) {
  const { data, error } = await supabase
    .from('questions')
    .select('*, category:categories(name)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// Mark a question reviewed (or clear it). Stamps who/when so the admin view
// can show sign-off. Relies on the "questions: admin update" RLS policy.
export async function markQuestionReviewed(id, reviewed) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('questions')
    .update({
      reviewed_at: reviewed ? new Date().toISOString() : null,
      reviewed_by: reviewed ? user?.id ?? null : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*, category:categories(name)')
    .single()
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Admin: registered user directory
// ---------------------------------------------------------------------------

export async function fetchAdminUserDirectory() {
  const { data, error } = await supabase.rpc('admin_list_users')
  if (error) throw error
  return data
}
