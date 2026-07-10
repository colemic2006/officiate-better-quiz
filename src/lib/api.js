import { supabase } from './supabaseClient'
import { RECENCY_WINDOW_DAYS, isCorrectAnswer } from './quizEngine'

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
  let query = supabase.from('questions').select('*').in('category_id', categoryIds).eq('is_active', true)
  if (difficulty) query = query.eq('difficulty', difficulty)
  const { data, error } = await query
  if (error) throw error
  const byCategory = new Map()
  for (const q of data) {
    if (!byCategory.has(q.category_id)) byCategory.set(q.category_id, [])
    byCategory.get(q.category_id).push(q)
  }
  return byCategory
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

export async function createAttempt({ userId, mode, categoryFilter, difficultyFilter, questionCount }) {
  const { data, error } = await supabase
    .from('attempts')
    .insert({
      user_id: userId,
      mode,
      category_filter: categoryFilter ?? null,
      difficulty_filter: difficultyFilter ?? null,
      question_count: questionCount,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function recordAnswer({ attemptId, question, selectedKey }) {
  const correct = isCorrectAnswer(question, selectedKey)
  const { error: answerErr } = await supabase.from('attempt_answers').insert({
    attempt_id: attemptId,
    question_id: question.id,
    selected_choice: selectedKey,
    is_correct: correct,
  })
  if (answerErr) throw answerErr

  const { data: attempt } = await supabase.from('attempts').select('user_id').eq('id', attemptId).single()
  const { error: statErr } = await supabase.rpc('increment_category_stat', {
    p_user_id: attempt.user_id,
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
