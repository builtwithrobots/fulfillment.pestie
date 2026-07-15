---
name: opsfluency-sop-pipeline
description: OpsFluency SOP pipeline — upload, Sonnet conversion, glossary flagging, Google translation, publish, QR. Use for code touching sops, sop_versions, glossary_terms, qr_codes, or the status lifecycle (draft, pending_terms, pending_translation, pending_approval, published, archived).
---

# OpsFluency SOP Pipeline

This skill enforces the rules for OpsFluency's core product capability: taking an existing SOP document in any format, converting it with AI, flagging site-specific terms for manager review, translating it to Spanish using company glossary context, and publishing a bilingual version with a QR code.

The pipeline is the heart of OpsFluency. Every rule below exists to protect translation quality and worker dignity. Shortcuts here break the product's core value promise.

## The Non-Negotiable Pipeline Order

SOPs move through these stages in this exact order, mirrored by the `sops.status` lifecycle documented in `CLAUDE.md`. No stage can start until the previous stage is complete. This is a state machine, not a suggestion.

| # | Stage | `sops.status` after this stage |
|---|---|---|
| 1 | Upload (PDF, DOCX, or TXT saved to the private `sop-uploads` bucket) | `draft` |
| 2 | Sonnet converts to structured Markdown with full company glossary as context | `draft` |
| 3 | Sonnet flags site-specific terms with suggested EN definition + ES translation | `pending_terms` |
| 4 | Manager accepts, edits, or overrides every flagged term (HARD GATE) | `pending_terms` → `pending_translation` once all terms resolved |
| 5 | Manager reviews and optionally edits the Markdown | `pending_translation` |
| 6 | Manager selects the content template (step-by-step, reference, safety-checklist, onboarding) | `pending_translation` |
| 7 | Google Cloud Translation runs EN → ES with glossary injection | `pending_translation` → `pending_approval` |
| 8 | Manager approves the Spanish draft | `pending_approval` → `published` |
| 9 | Publish creates the `qr_codes` row (once per SOP, permanent URL) | `published` |

If code is being written that lets a user skip a stage, that code is wrong. Ask the user before proceeding.

## Content Template vs Brand Template

OpsFluency has two separate template concepts. Do not confuse them.

**Content template** is chosen per SOP at step 6 of the pipeline. It controls the structural layout of that specific document. The four options are:

- Step-by-Step Procedure (equipment operation, numbered tasks)
- Reference Document (policies, multi-section guides)
- Safety Checklist (lockout/tagout, PPE, hazard procedures)
- Onboarding Document (new hire welcome, orientation)

Workers see a different layout per SOP based on the content template. A safety checklist must render with checkboxes and hazard callouts. A reference document must render with a table of contents and collapsible sections. Never force content into the wrong template type.

**Brand template** is set once per organization and applies to every SOP that company publishes. It controls visual branding (logo, primary color, footer text). The detailed design of brand template fields and the signup flow are deferred until those screens are built. Use whatever brand columns exist on `companies` when the time comes (per `CLAUDE.md`: `name`, `phone`, `logo_url` today; more may be added).

## The Glossary Hard Gate

This is the most important rule in this skill.

Translation cannot begin until every flagged glossary term has been accepted, edited, or overridden by the manager. The lifecycle enforces this: `sops.status` stays at `pending_terms` until every flagged term in the SOP has a corresponding row in `glossary_terms` with non-null `definition_en` and non-null `term_es`. The transition `pending_terms → pending_translation` happens inside a single Server Action transaction that checks the glossary-completeness condition and updates `sops.status` atomically.

When implementing the UI for this:

- Show the list of flagged terms with Sonnet's suggested English definition and Spanish translation visible for each
- Provide three actions per term: accept (use Sonnet's suggestion as-is), edit (modify before saving), override (replace with manager's own text)
- Visually flag any term that has not yet been acted on by the manager
- Disable the "Translate to Spanish" button until every flagged term has been acted on
- The disabled state must include hover text explaining why, not just appear broken
- When a term is accepted or edited, save it immediately to the `glossary_terms` table with `company_id` scoping
- Never fall back to generic translation if the glossary gate is not passed

## Why the Glossary Matters

The product is called OpsFluency because operations speak the same language. Every SOP, announcement, and HR doc at a given company uses the same internal terminology, consistently, across English and Spanish. The glossary is what makes that true. Once a term is defined at a company, it stays defined forever, and every future translation uses it.

This is the single feature that separates OpsFluency from generic translation tools. Protect it.

## Supported Upload Formats

MVP supports exactly three formats: PDF, DOCX, and TXT. Do not add support for other formats without explicit user approval. Reject all other uploads with a clear error message that lists the supported formats.

File size limit: 10MB. Files larger than this should be rejected with a friendly error suggesting the user compress or split the file. Revisit this limit after the first 10 customers.

Centralize the supported formats and size limit in `lib/types/sop.ts` as exported constants — never hardcode them at call sites.

## Claude Sonnet Conversion Rules

The conversion from uploaded file to structured Markdown uses Claude Sonnet, not Haiku. Quality matters more than cost here because this step runs once per SOP.

The conversion prompt must:

- Instruct Sonnet to preserve the original document's structure (headings, lists, warnings, numbered steps)
- Instruct Sonnet to use standard SOP formatting conventions (clear hierarchy, warnings visually prominent)
- Instruct Sonnet to output clean Markdown, no HTML
- Pass the full company glossary (all existing terms) as context so Sonnet recognizes previously-defined terms and does not re-flag them
- Instruct Sonnet to flag site-specific terms AND suggest an English definition and a Spanish translation for each
- Return flagged terms as a structured JSON block at the end of the Markdown output

## Glossary Flagging Rules

Sonnet must flag any term in the SOP that meets any of these criteria:

- Appears to be a company-specific nickname or abbreviation
- Has an industry-specific meaning that differs from common usage
- Is a proper noun for a location, tool, process, or system name
- Would translate incorrectly using generic AI translation

Never flag common English words or standard industry terminology that translates reliably. Never re-flag a term that already exists in the company glossary.

For every flagged term, Sonnet provides:

- The exact term as it appears in the SOP
- A suggested English definition (one sentence, plain language)
- A suggested Spanish translation
- Context (the sentence where the term appeared, so the manager can verify)

The manager's role is to accept, edit, or override each suggestion. Sonnet makes the manager's job fast. The manager stays in control.

## Translation Rules

Translation uses Google Cloud Translation API, not Claude. Google's translation API is purpose-built for this, cheaper, and supports glossary injection natively.

Every translation call must:

- Include the full company glossary as translation overrides
- Translate from English to Spanish (`es`) for MVP
- Preserve all Markdown formatting (headings, lists, bold, links)
- On success, transition `sops.status` from `pending_translation` to `pending_approval` — never directly to `published`

Manager approval is a separate step. Never auto-approve a translation.

## SOP Lifecycle State Rules

The `status` field on the `sops` table has exactly six values. This matches `CLAUDE.md` exactly — import the union type and enum from `lib/types/sop.ts`, never hardcode these strings.

| Status | Meaning | Worker Visible |
|---|---|---|
| `draft` | Created, not yet processed | No |
| `pending_terms` | Sonnet flagged terms, awaiting manager definitions | No |
| `pending_translation` | All terms defined, ready for Google Translate | No |
| `pending_approval` | Spanish draft ready for manager sign-off | No |
| `published` | Live, QR code serves this version | Yes |
| `archived` | Manager-initiated retirement | No (QR returns 410) |

Transitions allowed (one direction only, except the archive move):

- `draft → pending_terms` (Sonnet returns flagged terms)
- `pending_terms → pending_translation` (every flagged term resolved in `glossary_terms`)
- `pending_translation → pending_approval` (Google Translate returns)
- `pending_approval → published` (manager approves)
- `published → archived` (manager-initiated, terminal)

`archived` is terminal. Restoration requires creating a new SOP that references the old one; never flip the status back. Every transition happens inside a Server Action that reads the current status in the same transaction and rejects any move not listed above.

## Version Management Rules

Every publish creates a new row in `sop_versions`, never overwrites. The `version_number` increments by 1 per SOP.

When a manager updates the English master of a `published` SOP:

- Create a new `sop_versions` row with the updated `content_en`
- Flip `sop_versions.needs_retranslation = true` on the previous Spanish row
- `sops.status` stays `published` throughout — workers keep seeing the last approved Spanish until re-approval clears the flag
- Re-run the translation pipeline with the current glossary, then manager approves again
- Clear `needs_retranslation` only when the manager approves the re-translation

Workers always see the version with the most recent `published_at` where the row is approved (the approval state lives in `sop_versions` alongside `content_es`). Never hide a stale-flagged version while re-translation is pending — partial content is worse than slightly-stale content.

## QR Code Rules

QR codes are generated once per SOP at the `pending_approval → published` transition, never per version. The `qr_codes` table has one row per SOP, with `id` as the permanent public identifier.

QR URL shape (per `CLAUDE.md`): `${NEXT_PUBLIC_APP_URL}/s/<qr_codes.id>`. The `/s/[qr_code_id]` route looks up the QR row, resolves the current `published` SOP, and redirects to `/app/sop/[sop_id]`. Archived SOPs return HTTP 410 with a friendly "this procedure is no longer available" page (not a 404). QR codes survive version bumps — the worker always lands on the current approved content.

## Things to Always Do

- Scope every query by `company_id` resolved from `company_members` via `getCompanyContext()` — never from Clerk orgs
- Rely on RLS + `.eq('company_id', company_id)` as defense in depth (`CLAUDE.md` → "Row Level Security")
- Log every Sonnet call by writing an `ai_call_log` row (`model`, `input_tokens`, `output_tokens`, `sop_id`, `company_id`, `duration_ms`) via `lib/ai/sonnet.ts`
- Show loading states during AI conversion (10–30 seconds for typical SOPs)
- Save uploads to the private `sop-uploads` bucket at path `${company_id}/${sop_id}/${filename}` with 1-hour signed URLs for manager review

## Things to Never Do

- Never skip the glossary gate, even in dev or test
- Never use Haiku for the conversion step (quality matters more than cost)
- Never auto-approve a Spanish translation
- Never let a worker see an unapproved translation
- Never expose `sop_versions` rows directly to workers (filter through the `sops.status = 'published'` + approved-Spanish condition)
- Never hardcode the supported upload formats or file size limits at a call site — centralize in `lib/types/sop.ts`
- Never apply a content template to an SOP whose structure does not match it (do not force a safety checklist into a reference document layout)
- Never call the Anthropic SDK directly — all Sonnet calls go through `lib/ai/sonnet.ts`, which owns timeout / retry / parse / log
