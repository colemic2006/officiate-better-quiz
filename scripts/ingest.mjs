#!/usr/bin/env node
// Parses the question bank spreadsheet (CSV or XLSX), validates every row,
// and upserts into Supabase. Fails loudly with row numbers + reasons rather
// than silently skipping bad data — see spec Section 5.
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional env: SHEET_PATH (default: data/questions.csv)

import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

const SHEET_PATH = process.env.SHEET_PATH || 'data/questions.csv'
const DIFFICULTIES = new Set(['Basic', 'Intermediate', 'Advanced'])
const CHOICES = ['A', 'B', 'C', 'D']
const REQUIRED_COLUMNS = [
  'question_id',
  'category',
  'difficulty',
  'question_text',
  'choice_a',
  'choice_b',
  'choice_c',
  'choice_d',
  'correct_choice',
  'explanation',
  'rule_year',
]

function fail(message) {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

function loadRows(path) {
  if (!existsSync(path)) fail(`Spreadsheet not found at "${path}"`)
  // codepage 65001 = UTF-8. Without it, SheetJS mis-decodes non-ASCII
  // characters in CSVs (e.g. em-dashes in category names like
  // "Personal Fouls — Contact" come out as "Personal Fouls â Contact").
  const workbook = XLSX.readFile(path, { raw: false, codepage: 65001 })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (repo secrets in CI).')
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  console.log(`Reading ${SHEET_PATH} ...`)
  const rows = loadRows(SHEET_PATH)
  if (rows.length === 0) fail('Spreadsheet has no data rows.')

  const headerCols = Object.keys(rows[0])
  const missingCols = REQUIRED_COLUMNS.filter((c) => !headerCols.includes(c))
  if (missingCols.length > 0) {
    fail(`Missing required column(s): ${missingCols.join(', ')}`)
  }

  const { data: categories, error: catErr } = await supabase.from('categories').select('id, name')
  if (catErr) fail(`Could not load categories from Supabase: ${catErr.message}`)
  const categoryByName = new Map(categories.map((c) => [c.name, c.id]))

  const { data: existingTags, error: tagErr } = await supabase.from('tags').select('id, name')
  if (tagErr) fail(`Could not load tags from Supabase: ${tagErr.message}`)
  const tagIdByLowerName = new Map(existingTags.map((t) => [t.name.toLowerCase(), t.id]))

  const errors = []
  const warnings = []
  const seenIds = new Set()
  const validRows = []

  rows.forEach((raw, idx) => {
    const rowNum = idx + 2 // header is row 1
    const row = {}
    for (const key of Object.keys(raw)) row[key] = String(raw[key] ?? '').trim()

    const rowErrors = []

    if (!row.question_id) {
      rowErrors.push('missing question_id')
    } else if (seenIds.has(row.question_id)) {
      rowErrors.push(`duplicate question_id "${row.question_id}"`)
    } else {
      seenIds.add(row.question_id)
    }

    if (!categoryByName.has(row.category)) {
      rowErrors.push(`category "${row.category}" does not match a locked category name exactly`)
    }

    if (!DIFFICULTIES.has(row.difficulty)) {
      rowErrors.push(`difficulty "${row.difficulty}" must be one of Basic/Intermediate/Advanced`)
    }

    if (!row.question_text) rowErrors.push('missing question_text')

    // Only A and B are mandatory (e.g. True/False questions). C and D are
    // optional but must be filled in order — no skipping B then D.
    if (!row.choice_a) rowErrors.push('missing choice_a')
    if (!row.choice_b) rowErrors.push('missing choice_b')
    if (!row.choice_c && row.choice_d) {
      rowErrors.push('choice_d is filled but choice_c is empty — choices must be contiguous starting from A')
    }

    const correctChoice = row.correct_choice.toUpperCase()
    if (!CHOICES.includes(correctChoice)) {
      rowErrors.push(`correct_choice "${row.correct_choice}" must be A, B, C, or D`)
    } else {
      const matchingCol = `choice_${correctChoice.toLowerCase()}`
      if (!row[matchingCol]) {
        rowErrors.push(`correct_choice is "${correctChoice}" but ${matchingCol} is empty`)
      }
    }

    const ruleYear = Number.parseInt(row.rule_year, 10)
    if (!row.rule_year || Number.isNaN(ruleYear)) {
      rowErrors.push(`rule_year "${row.rule_year}" must be a number`)
    }

    if (!row.rule_refs) warnings.push(`row ${rowNum}: missing rule_refs`)
    if (!row.explanation) warnings.push(`row ${rowNum}: missing explanation`)

    if (rowErrors.length > 0) {
      errors.push(`row ${rowNum} (question_id "${row.question_id || '?'}"): ${rowErrors.join('; ')}`)
      return
    }

    validRows.push({
      rowNum,
      external_id: row.question_id,
      category_id: categoryByName.get(row.category),
      tags: row.tags
        ? row.tags.split(';').map((t) => t.trim()).filter(Boolean)
        : [],
      difficulty: row.difficulty,
      question_text: row.question_text,
      choice_a: row.choice_a,
      choice_b: row.choice_b,
      choice_c: row.choice_c || null,
      choice_d: row.choice_d || null,
      correct_choice: correctChoice,
      rule_refs: row.rule_refs || null,
      ar_refs: row.ar_refs || null,
      explanation: row.explanation || null,
      rule_year: ruleYear,
    })
  })

  if (errors.length > 0) {
    console.error(`\n${errors.length} row(s) failed validation. No data was written.\n`)
    for (const e of errors) console.error(`  ✖ ${e}`)
    process.exit(1)
  }

  if (warnings.length > 0) {
    console.warn(`${warnings.length} warning(s):`)
    for (const w of warnings) console.warn(`  ⚠ ${w}`)
  }

  // Auto-append any brand-new tags (case-insensitive dedupe).
  const newTagNames = new Set()
  for (const r of validRows) {
    for (const t of r.tags) {
      if (!tagIdByLowerName.has(t.toLowerCase())) newTagNames.add(t)
    }
  }
  if (newTagNames.size > 0) {
    const { data: inserted, error } = await supabase
      .from('tags')
      .insert([...newTagNames].map((name) => ({ name })))
      .select('id, name')
    if (error) fail(`Failed to insert new tags: ${error.message}`)
    for (const t of inserted) tagIdByLowerName.set(t.name.toLowerCase(), t.id)
    console.log(`Added ${inserted.length} new tag(s): ${inserted.map((t) => t.name).join(', ')}`)
  }

  console.log(`Upserting ${validRows.length} question(s) ...`)
  const questionPayload = validRows.map(({ rowNum, tags, ...q }) => q)
  const { data: upserted, error: upsertErr } = await supabase
    .from('questions')
    .upsert(questionPayload, { onConflict: 'external_id' })
    .select('id, external_id')
  if (upsertErr) fail(`Failed to upsert questions: ${upsertErr.message}`)

  const questionIdByExternal = new Map(upserted.map((q) => [q.external_id, q.id]))

  // Replace tag links for every ingested question. Chunked because a single
  // .in() filter with hundreds of UUIDs can exceed the request URL length
  // limit and get rejected with a Bad Request.
  const questionIds = validRows.map((r) => questionIdByExternal.get(r.external_id))
  const DELETE_CHUNK_SIZE = 150
  for (let i = 0; i < questionIds.length; i += DELETE_CHUNK_SIZE) {
    const chunk = questionIds.slice(i, i + DELETE_CHUNK_SIZE)
    const { error: deleteErr } = await supabase.from('question_tags').delete().in('question_id', chunk)
    if (deleteErr) fail(`Failed to clear old tag links: ${deleteErr.message}`)
  }

  const links = []
  for (const r of validRows) {
    const qId = questionIdByExternal.get(r.external_id)
    for (const t of r.tags) {
      links.push({ question_id: qId, tag_id: tagIdByLowerName.get(t.toLowerCase()) })
    }
  }
  if (links.length > 0) {
    const { error: linkErr } = await supabase.from('question_tags').insert(links)
    if (linkErr) fail(`Failed to insert tag links: ${linkErr.message}`)
  }

  console.log(`\n✔ Ingested ${validRows.length} question(s), ${links.length} tag link(s).`)
}

main().catch((err) => fail(err.stack || String(err)))
