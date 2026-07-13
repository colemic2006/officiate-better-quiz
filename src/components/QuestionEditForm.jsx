import { useState } from 'react'
import { adminUpdateQuestion, adminSetQuestionTags } from '../lib/api'

const DIFFICULTIES = ['Basic', 'Intermediate', 'Advanced']
const CHOICE_KEYS = ['A', 'B', 'C', 'D']

function buildFormState(question, tags) {
  return {
    category_id: String(question.category_id),
    difficulty: question.difficulty,
    rule_year: String(question.rule_year),
    question_text: question.question_text,
    choice_a: question.choice_a || '',
    choice_b: question.choice_b || '',
    choice_c: question.choice_c || '',
    choice_d: question.choice_d || '',
    correct_choice: question.correct_choice,
    rule_refs: question.rule_refs || '',
    ar_refs: question.ar_refs || '',
    explanation: question.explanation || '',
    is_active: question.is_active,
    tags: tags.join(';'),
    source_question_number: question.source_question_number != null ? String(question.source_question_number) : '',
  }
}

function validate(form) {
  if (!form.question_text.trim()) return 'Question text is required.'
  if (!form.choice_a.trim() || !form.choice_b.trim()) return 'Choices A and B are required.'
  if (form.choice_d.trim() && !form.choice_c.trim()) {
    return 'Choice D is filled but Choice C is empty — choices must be contiguous starting from A.'
  }
  if (!CHOICE_KEYS.includes(form.correct_choice)) return 'Correct choice must be A, B, C, or D.'
  const matching = form[`choice_${form.correct_choice.toLowerCase()}`]
  if (!matching.trim()) return `Correct choice is "${form.correct_choice}" but that choice is empty.`
  if (!DIFFICULTIES.includes(form.difficulty)) return 'Difficulty must be Basic, Intermediate, or Advanced.'
  if (!form.rule_year.trim() || Number.isNaN(Number.parseInt(form.rule_year, 10))) {
    return 'Rule year must be a number.'
  }
  if (form.source_question_number.trim()) {
    const n = Number.parseInt(form.source_question_number, 10)
    if (Number.isNaN(n) || n < 1) return 'Source question number must be a positive whole number.'
  }
  return null
}

export default function QuestionEditForm({ question, tags, categories, onSaved, onCancel }) {
  const [form, setForm] = useState(() => buildFormState(question, tags))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const availableChoiceKeys = CHOICE_KEYS.filter((k) => form[`choice_${k.toLowerCase()}`].trim())

  async function handleSave() {
    const validationError = validate(form)
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setSaving(true)
    try {
      const updated = await adminUpdateQuestion(question.id, {
        category_id: Number(form.category_id),
        difficulty: form.difficulty,
        rule_year: Number.parseInt(form.rule_year, 10),
        question_text: form.question_text.trim(),
        choice_a: form.choice_a.trim(),
        choice_b: form.choice_b.trim(),
        choice_c: form.choice_c.trim() || null,
        choice_d: form.choice_d.trim() || null,
        correct_choice: form.correct_choice,
        rule_refs: form.rule_refs.trim() || null,
        ar_refs: form.ar_refs.trim() || null,
        explanation: form.explanation.trim() || null,
        is_active: form.is_active,
        source_question_number: form.source_question_number.trim()
          ? Number.parseInt(form.source_question_number, 10)
          : null,
      })
      const newTags = await adminSetQuestionTags(
        question.id,
        form.tags.split(';').map((t) => t.trim()).filter(Boolean)
      )
      onSaved(updated, newTags)
    } catch (err) {
      setError(err.message || 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" style={{ borderColor: 'var(--accent)' }}>
      <div className="eyebrow">Editing {question.external_id}</div>

      <div className="grid grid--2">
        <div className="field">
          <label htmlFor="edit-category">Category</label>
          <select id="edit-category" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="edit-difficulty">Difficulty</label>
          <select id="edit-difficulty" value={form.difficulty} onChange={(e) => set('difficulty', e.target.value)}>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="edit-question-text">Question Text</label>
        <textarea
          id="edit-question-text"
          value={form.question_text}
          onChange={(e) => set('question_text', e.target.value)}
        />
      </div>

      {CHOICE_KEYS.map((key) => (
        <div className="field" key={key}>
          <label htmlFor={`edit-choice-${key}`}>
            Choice {key} {key === 'A' || key === 'B' ? '' : '(optional)'}
          </label>
          <input
            id={`edit-choice-${key}`}
            type="text"
            value={form[`choice_${key.toLowerCase()}`]}
            onChange={(e) => set(`choice_${key.toLowerCase()}`, e.target.value)}
          />
        </div>
      ))}

      <div className="field">
        <label htmlFor="edit-correct-choice">Correct Choice</label>
        <select id="edit-correct-choice" value={form.correct_choice} onChange={(e) => set('correct_choice', e.target.value)}>
          {CHOICE_KEYS.filter((k) => availableChoiceKeys.includes(k) || k === form.correct_choice).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid--2">
        <div className="field">
          <label htmlFor="edit-rule-refs">Rule Refs</label>
          <input id="edit-rule-refs" type="text" value={form.rule_refs} onChange={(e) => set('rule_refs', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="edit-ar-refs">AR Refs</label>
          <input id="edit-ar-refs" type="text" value={form.ar_refs} onChange={(e) => set('ar_refs', e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="edit-explanation">Explanation</label>
        <textarea id="edit-explanation" value={form.explanation} onChange={(e) => set('explanation', e.target.value)} />
      </div>

      <div className="grid grid--2">
        <div className="field">
          <label htmlFor="edit-rule-year">Rule Year</label>
          <input id="edit-rule-year" type="number" value={form.rule_year} onChange={(e) => set('rule_year', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="edit-source-question-number">Source Question # (optional)</label>
          <input
            id="edit-source-question-number"
            type="number"
            min="1"
            value={form.source_question_number}
            onChange={(e) => set('source_question_number', e.target.value)}
          />
          <p className="help-text">Question number in the original source document, if known.</p>
        </div>
      </div>

      <div className="field">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 400 }}>
          <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
          Active (visible in quizzes)
        </label>
      </div>

      <div className="field">
        <label htmlFor="edit-tags">Tags (semicolon-separated)</label>
        <input id="edit-tags" type="text" value={form.tags} onChange={(e) => set('tags', e.target.value)} />
        <p className="help-text">e.g. targeting;replay;2025-cfo-rules-test;NCAA;UIL</p>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button className="btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button className="btn btn--outline" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  )
}
