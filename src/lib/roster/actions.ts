'use server'

import { revalidatePath } from 'next/cache'

import type { ActionResult } from '@/lib/action-result'
import { requireUserId } from '@/lib/studies/data'
import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * Mutations for the employee roster. Shared operational data — any signed-in
 * leadership user can manage the roster (the floor builder's own createWorker
 * keeps its supervisor gate; this module is the roster tab + timer picker
 * path). Every action validates the Clerk session before writing through the
 * service-role client.
 */

// --- name normalization + duplicate detection (shared by add + CSV import) --

/** Collapse internal whitespace and trim: "  Maria   Gonzalez " => "Maria Gonzalez". */
function collapse(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

/** Case-insensitive exact-dupe key. */
function dupeKey(name: string): string {
  return collapse(name).toLowerCase()
}

/** Aggressive key for near-matches: accent- and punctuation-insensitive. */
function compactKey(name: string): string {
  return dupeKey(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function tokenSet(name: string): Set<string> {
  return new Set(dupeKey(name).split(' ').filter(Boolean))
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  for (const t of a) if (!b.has(t)) return false
  return true
}

/**
 * Is `existing` a likely "same person, spelled differently" match for `name`
 * (but not an exact duplicate)? Catches accent/punctuation differences and
 * first-name-only vs full-name (token subset either direction).
 */
function isSimilar(name: string, existing: string): boolean {
  if (dupeKey(name) === dupeKey(existing)) return false // exact — handled separately
  if (compactKey(name) && compactKey(name) === compactKey(existing)) return true
  const a = tokenSet(name)
  const b = tokenSet(existing)
  return a.size > 0 && b.size > 0 && (isSubset(a, b) || isSubset(b, a))
}

export type AddWorkerResult =
  | { ok: true; id: string; fullName: string; similarNames: string[] }
  // exact duplicate — `existing` lets the caller select the person instead
  | { ok: false; error: string; existing?: { id: string; fullName: string } }

/**
 * Add one worker to the roster, guarding against duplicates. An exact
 * (case-insensitive) name match is blocked and the existing person returned so
 * the caller can select them. Near-matches (accents/punctuation, or a
 * first-name-only entry) don't block but are surfaced as `similarNames` so the
 * user can catch a likely re-spelling.
 */
export async function createRosterWorker(fullName: string): Promise<AddWorkerResult> {
  await requireUserId()
  const clean = collapse(fullName)
  if (!clean) return { ok: false, error: 'Please enter a name.' }

  const supabase = createServiceRoleClient()
  const { data: workers, error: readError } = await supabase.from('workers').select('id, full_name')
  if (readError) return { ok: false, error: readError.message }

  const exact = (workers ?? []).find((w) => dupeKey(w.full_name) === dupeKey(clean))
  if (exact) {
    return {
      ok: false,
      error: `“${exact.full_name}” is already on the roster.`,
      existing: { id: exact.id, fullName: exact.full_name },
    }
  }

  const similarNames = (workers ?? []).filter((w) => isSimilar(clean, w.full_name)).map((w) => w.full_name)

  const { data, error } = await supabase.from('workers').insert({ full_name: clean }).select('id').single()
  if (error) return { ok: false, error: error.message }

  revalidatePath('/roster')
  return { ok: true, id: data.id, fullName: clean, similarNames }
}

export async function renameWorker(workerId: string, fullName: string): Promise<ActionResult> {
  await requireUserId()
  const clean = fullName.trim()
  if (!clean) return { ok: false, error: 'Please enter a name.' }

  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('workers').update({ full_name: clean }).eq('id', workerId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/roster')
  revalidatePath(`/roster/${workerId}`)
  return { ok: true }
}

/**
 * Deactivate keeps the row (and every attributed timing) but hides the worker
 * from pickers; reactivate brings them back. Deactivating also clears any
 * station assignment so displays stop showing them.
 */
export async function setWorkerActive(workerId: string, active: boolean): Promise<ActionResult> {
  await requireUserId()
  const supabase = createServiceRoleClient()

  if (!active) {
    const { error: clearError } = await supabase.from('station_assignments').delete().eq('worker_id', workerId)
    if (clearError) return { ok: false, error: clearError.message }
  }
  const { error } = await supabase.from('workers').update({ active }).eq('id', workerId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/roster')
  revalidatePath(`/roster/${workerId}`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------
const MAX_CSV_BYTES = 2 * 1024 * 1024

export type RosterImportSummary = {
  /** New names inserted into the roster. */
  added: string[]
  /** Names skipped because someone with that name is already on the roster. */
  duplicates: string[]
  /** Rows whose Employee cell was blank. */
  blankRows: number
}

/**
 * Minimal RFC 4180 CSV parser: handles quoted fields (with embedded commas and
 * "" escapes), CRLF/LF/CR line endings, and a leading BOM. Returns rows of
 * string fields.
 */
function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      endField()
    } else if (c === '\n') {
      endRow()
    } else if (c === '\r') {
      if (text[i + 1] === '\n') i++
      endRow()
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) endRow()
  return rows
}

/**
 * Import employees from a CSV that has a column titled "Employee". Names are
 * checked (case-insensitively) against everyone already on the roster —
 * active or inactive — and only genuinely new names are inserted. Repeats
 * within the file are collapsed. Returns a summary of what happened.
 */
export async function importRosterCsv(formData: FormData): Promise<ActionResult<RosterImportSummary>> {
  await requireUserId()

  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'No file provided.' }
  if (file.size === 0) return { ok: false, error: 'That file is empty.' }
  if (file.size > MAX_CSV_BYTES) return { ok: false, error: 'File is too large (max 2 MB).' }

  const rows = parseCsv(await file.text())
  if (rows.length === 0) return { ok: false, error: 'That file is empty.' }

  const header = rows[0].map((h) => dupeKey(h))
  const col = header.indexOf('employee')
  if (col === -1) {
    return { ok: false, error: 'No “Employee” column found. The CSV needs a header column titled Employee.' }
  }

  // Collect unique, non-blank names from the file (first spelling wins).
  let blankRows = 0
  const seen = new Set<string>()
  const fileNames: string[] = []
  for (const r of rows.slice(1)) {
    if (r.every((cell) => collapse(cell) === '')) continue // skip wholly empty lines
    const name = collapse(r[col] ?? '')
    if (!name) {
      blankRows++
      continue
    }
    const key = dupeKey(name)
    if (!seen.has(key)) {
      seen.add(key)
      fileNames.push(name)
    }
  }

  if (fileNames.length === 0) {
    return { ok: false, error: 'No employee names found in the “Employee” column.' }
  }

  const supabase = createServiceRoleClient()
  const { data: existing, error: readError } = await supabase.from('workers').select('full_name')
  if (readError) return { ok: false, error: readError.message }

  const existingKeys = new Set((existing ?? []).map((w) => dupeKey(w.full_name)))

  const added: string[] = []
  const duplicates: string[] = []
  for (const name of fileNames) {
    if (existingKeys.has(dupeKey(name))) duplicates.push(name)
    else added.push(name)
  }

  if (added.length > 0) {
    const { error: insertError } = await supabase.from('workers').insert(added.map((full_name) => ({ full_name })))
    if (insertError) return { ok: false, error: insertError.message }
  }

  revalidatePath('/roster')
  return { ok: true, data: { added, duplicates, blankRows } }
}
