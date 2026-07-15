---
name: opsfluency-bilingual-content
description: OpsFluency English/Spanish content rules. Use for any code rendering user strings or user-generated text, managing content_en / content_es columns, handling the language toggle, or gating by workers.preferred_language. Covers both system strings and user-generated content.
---

# OpsFluency Bilingual Content

This skill enforces how English and Spanish content works throughout OpsFluency. The product's core value is that a worker who speaks Spanish can do their job without embarrassment. Every bilingual decision must protect that experience.

For SOP-specific translation rules (the import, conversion, glossary flagging, publishing pipeline), use the `opsfluency-sop-pipeline` skill instead. This skill covers everything else.

## Two Kinds of Bilingual Content

OpsFluency has two categories of bilingual content. They are handled differently. Never mix the approaches.

**System strings** are the fixed text built into the app. Navigation labels, button text, error messages, form field labels, empty states. These are translated once by humans, stored in JSON translation files, and never auto-translated.

**User-generated content** is text created by managers inside a specific company. SOP titles, announcement bodies, HR contact role names, department names. These are auto-translated at the moment they are saved, stored in `content_en` and `content_es` columns, and reviewed by a manager before workers see them.

## Worker Preferred Language

Every worker's preferred language is stored in `workers.preferred_language` as either `en` or `es`.

Rules:

- Worker sets this on first login after tapping their magic link
- If not set, default to `en` and show a banner offering to switch to Spanish
- Worker can change their preference any time from their profile
- Workers never see a mixed-language screen (the only exception is the language toggle itself)
- Managers and admins are assumed to be English-speaking for MVP (bilingual manager dashboard is Phase 2)

On every page load for a worker, the app reads `preferred_language` from the database (not from Clerk, not from cookies) and uses it as the source of truth.

## System Strings (UI Localization)

MVP uses `next-intl` for the app's built-in text. Translation files live at `messages/en.json` and `messages/es.json`. Every user-facing string in the codebase must reference a translation key, never a hardcoded string.

Rules:

- Never write `<button>Submit</button>` in a component. Write `<button>{t('submit')}</button>` instead.
- Every new component added to `app/app/` (worker-facing) must have both English and Spanish translations before it is merged
- Translation keys follow this pattern: `{surface}.{screen}.{element}`. Example: `worker.home.announcementsHeading`
- Admin-only screens (`app/dashboard/`) may be English-only for MVP, but translation keys should still be used so Phase 2 can add Spanish without refactoring
- Never use Google Cloud Translation API for system strings. These are hand-curated for quality.

## User-Generated Content (Announcements, HR, Departments, SOPs)

Any text a manager creates inside the app must be stored in both English and Spanish. The database pattern is:

- `content_en` column: the original version as entered by the manager
- `content_es` column: the translated version (starts null, filled in after translation)
- Translation happens via Google Cloud Translation API with the company glossary applied
- Both versions are saved before workers see the content

Rules:

- Never show user-generated content to a worker unless both `content_en` and `content_es` are populated
- For announcements: auto-translate at post time, show to workers immediately (no approval gate, short-lived content)
- For SOPs: manager approval gate applies (see `opsfluency-sop-pipeline` skill)
- For HR contacts and department names: auto-translate at save time, allow manager to edit the Spanish version if desired
- Every translation call must pass the company glossary as overrides. The glossary is the source of truth for terminology consistency.

## Why the Glossary Always Applies

The company glossary is not just for SOPs. Every piece of user-generated content a company produces uses the same glossary. An announcement about the "floor huddle" must translate the same way it did in the SOP about the "floor huddle." This consistency is the product.

When calling Google Cloud Translation for any content, always include the full company glossary as translation overrides. This rule has no exceptions.

## Language Toggle Rules

Workers can switch between English and Spanish on any SOP view and any announcement view. The toggle does two things:

- Switches the rendered content for the current view
- Updates `workers.preferred_language` in the database (so next login reflects the choice)

The toggle must be:

- Visible on every worker-facing screen, not buried in a settings page
- Labeled clearly in both languages: `EN` and `ES`
- Touch-target-compliant (44px minimum)
- Accessible via keyboard with a focus ring
- Announced to screen readers with `aria-label` in the current language

The toggle is the ONE place where both languages appear on the same screen for a worker.

## Fallback Rules

If Spanish content is not yet available for an item (translation pending or failed), the app handles it as follows:

- For SOPs: do not show the SOP to Spanish-preferred workers at all (the approval gate should have caught this, but double-check)
- For announcements: show the English version with a small note in Spanish explaining that translation is in progress
- For UI strings: fall back to English key value (never show the translation key literally like `worker.home.heading`)

Never show the literal string "undefined" or "null" to a worker. If content is missing, show a friendly placeholder.

## Monitor Display Language

Monitors are shared displays seen by multiple workers at once. Language handling for monitors is deferred to when the monitor module is built.

For now, assume monitors show English content with Spanish below each item in a slightly smaller font. Detailed design to be decided when the monitor pairing and display work begins.

## Manager Dashboard Language (MVP Scope)

The manager dashboard is English-only for MVP. This is intentional, not an oversight.

- Use translation keys in manager dashboard code anyway, so Phase 2 can add Spanish without refactoring
- The language toggle does NOT appear in the manager dashboard (only in the worker PWA)
- Managers who need to preview how a worker will see content can use a "Preview as Spanish worker" button on the SOP review screen

## Things to Always Do

- Read `workers.preferred_language` as the source of truth for a worker's language
- Pass the company glossary as translation overrides on every Google Cloud Translation API call
- Use translation keys in every user-facing component, even English-only ones
- Show a loading state during translation (Google Translation typically takes 1 to 3 seconds)
- Store both `content_en` and `content_es` for every piece of user-generated content
- Default to English when a language preference is unset

## Things to Never Do

- Never hardcode English strings in JSX (use translation keys)
- Never auto-translate system strings (hand-curate them)
- Never skip the glossary on a translation call, even for short text like announcements
- Never show a worker mixed-language content on the same view (except the language toggle itself)
- Never show translation keys to users as a fallback (use the English value instead)
- Never use Clerk metadata to store language preference (use `workers.preferred_language` in Supabase)
- Never translate a manager's own name, company name, or proper nouns unless they explicitly appear in the glossary
- Never show Spanish content to a worker that has not been saved in `content_es` (no on-the-fly translation at render time)
