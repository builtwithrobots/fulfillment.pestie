---
name: opsfluency-accessibility
description: OpsFluency accessibility on top of WCAG 2.1 AA. Use when building or reviewing any worker PWA, manager dashboard, or TV monitor UI — glove-friendly taps, warehouse lighting, TV distance, bilingual lang attributes, reduced motion.
---

# OpsFluency Accessibility

This skill enforces accessibility rules specific to OpsFluency. Standard WCAG 2.1 AA guidance is covered by other skills in this repo. This skill focuses on what is different because of the warehouse environment and the product's mission to restore dignity to frontline workers.

Accessibility is not a compliance checkbox for OpsFluency. It is the product. A worker who cannot read the screen in warehouse lighting, cannot tap a button while wearing work gloves, or cannot understand an icon without English is the exact person this product exists to serve. If the app fails them, the product has failed.

## The OpsFluency Accessibility Bar

OpsFluency meets WCAG 2.1 AA as a floor, not a ceiling. On top of WCAG, every screen must also pass these OpsFluency-specific tests:

- Can a worker wearing thick work gloves tap every interactive element without mis-tapping?
- Can the screen be read in direct overhead fluorescent lighting and in a dim corner near equipment?
- Can a Spanish-primary worker understand every screen without reading any English text?
- Can a worker with limited tech literacy reach any SOP in 3 taps or fewer from the home screen?
- Can a TV monitor display be read from 10 feet away in a busy warehouse?
- Does the app still work and still make sense with the phone offline?

If the answer to any of these is no, the screen is not done.

## Touch Targets (Hard Floor: 44px)

Every interactive element on the worker PWA must have a minimum 44px by 44px tappable area. This is the WCAG AAA standard, not AA, because our users wear gloves.

Rules:

- `<button>`, `<a>`, form inputs, and all tappable elements: minimum `min-h-[44px]` and `min-w-[44px]` in Tailwind, or equivalent in CSS
- Spacing between adjacent tappable elements: minimum 8px gap
- Icon-only buttons: the icon can be smaller, but the tappable area (via padding) must still be 44px
- Never use hover-only interactions on the worker PWA. Every hover action must have a tap equivalent.
- Swipe gestures are allowed but must always have a visible button alternative
- On the manager dashboard, 44px is the target but not a hard gate (desktop use, mouse precision available)

## Typography (Hard Floor: 16px)

Minimum body text size on mobile is 16px. This prevents iOS Safari from auto-zooming on input focus, and it matches what a worker can read in poor lighting.

Rules:

- Body text: 16px minimum on mobile, 14px minimum on desktop manager dashboard
- Headings: use a clear, consistent scale (H1 larger than H2, etc.)
- Line height: 1.5 for body text, 1.2 for headings
- Line length: 45 to 75 characters for prose content
- Never use condensed, cursive, or highly stylized fonts for body text
- Never use all-caps for long text (headings only, short labels only)
- System font stack is fine for MVP, respect the user's system font settings

## Color Contrast (Hard Floor: 4.5:1)

Minimum contrast ratio for body text is 4.5:1 against the background. Minimum for large text (18pt+ or 14pt+ bold) is 3:1. This is the WCAG AA standard, and it is a hard floor.

Rules for warehouse-specific conditions:

- Aim for 7:1 contrast on the worker PWA wherever feasible. The extra headroom covers glare and dim lighting.
- Never use color alone to communicate state. Always pair color with an icon, text, or pattern.
- Test every color token against both light and dark backgrounds. Steel & Signal design tokens have dark mode variants, use them.
- Error states (red) must also have an error icon and error text. A worker who is colorblind still sees the icon.
- Success states (green) must also have a checkmark icon and success text.

## Keyboard Navigation

Every interactive element in the app must be reachable and operable with a keyboard.

Rules:

- Every interactive element must have a visible focus ring (the Steel & Signal system provides an amber `:focus-visible` ring, use it)
- Tab order must match visual order (no tabindex hacks)
- Skip links are required on every page ("Skip to main content" as the first focusable element)
- `Escape` closes modals, drawers, and dropdowns
- `Enter` activates buttons and submits forms
- Arrow keys navigate within lists, menus, and tab groups
- Never remove focus rings with `outline: none` without replacing them with an equivalent visible indicator

## Screen Reader Support

Every screen must be fully usable with VoiceOver (iOS), TalkBack (Android), and NVDA or JAWS (desktop).

Rules:

- Use semantic HTML first, ARIA second. `<button>` before `<div role="button">`.
- Every icon-only button must have an `aria-label`. The label must be in the user's current language.
- Every image must have `alt` text, or `alt=""` if purely decorative. Never skip the attribute.
- Form inputs must have associated `<label>` elements, not just placeholders
- Error messages must be announced. Use `aria-live="polite"` for inline errors and `role="alert"` for urgent errors.
- Dynamic content updates (like "SOP updated" notifications) must be announced via `aria-live` regions
- Headings must follow a logical order (H1, then H2, then H3). Never skip levels.

## Language Attributes (Critical for Bilingual Content)

Screen readers use the `lang` attribute to choose the correct pronunciation and voice. Wrong attributes cause Spanish text to be read with an English voice, which is unintelligible.

Rules:

- Root HTML: `<html lang={locale}>` where locale is dynamically set based on the worker's preferred language
- Mixed-language content: wrap the non-default language segment in `<span lang="es">` or `<span lang="en">` as needed
- Company names, product names, and proper nouns that should NOT be translated: wrap in `<span lang="en">` even on Spanish screens
- SOP content: if the SOP is currently displayed in Spanish, the parent element should have `lang="es"`
- The language toggle button itself: include `aria-label` in BOTH languages so it reads correctly regardless of current language

## Navigation Depth (3-Tap Rule)

Maximum 3 taps from the worker home screen to any SOP. This is a hard rule from the PRD.

Rules:

- Home screen shows departments directly (tap 1)
- Department screen shows SOPs in that department (tap 2)
- SOP opens (tap 3)
- QR scan is always 1 tap from anywhere (including home) via a persistent scan button
- Search is always 1 tap from home
- Never add intermediate "category" or "filter" screens that push an SOP to tap 4 or beyond
- Breadcrumbs on every nested screen so workers can navigate back

## Monitor Display Requirements

TV monitors mounted on warehouse walls have different accessibility requirements because multiple people view them from a distance.

Rules:

- Minimum text size for monitors: 32px for body, larger for headings
- Readable from 10 feet at a minimum 1920x1080 display
- High contrast enforced: dark theme default (background `#0C0E14`, text `#F0F4FC`)
- No interaction required: monitors are read-only displays
- Content rotates on a timer so all items are eventually visible (no clipping)
- Never rely on hover or click for monitor content
- Do not scale text based on viewport size (fixed pixel values), otherwise large monitors show tiny text

## Reduced Motion

Some workers experience motion sickness or vertigo. The app must respect the operating system's reduced-motion preference.

Rules:

- Every animation must have a `@media (prefers-reduced-motion: reduce)` fallback
- The Steel & Signal globals.css already includes a global reduced-motion rule. Do not override it.
- Never auto-play videos. Always require user interaction to start video playback.
- Parallax effects, large scale transitions, and rotating elements must respect reduced motion
- Skeleton loaders and spinners are allowed (functional feedback, not decorative)

## Offline and PWA Accessibility

When the phone has no network, the app must still be accessible.

Rules:

- Cached SOPs must retain their full semantic HTML, alt text, and ARIA labels (these are baked into the HTML, so it works automatically if you do not strip them)
- Show a clear "You are offline" status indicator, not a broken or blank screen
- The offline indicator must be perceivable to screen reader users (not just a visual badge)
- Never remove the language toggle when offline. It must still work.
- Never require an online-only action without explaining what will happen when the user goes back online

## Forms

Every form field on the worker PWA and manager dashboard must meet these rules.

- Visible label above or beside every input (never placeholder-only)
- Required fields marked with an asterisk AND the word "required" in the label (asterisk alone fails color-blind users)
- Inline validation errors appear below the field with `role="alert"` or `aria-live="polite"`
- Errors describe how to fix the problem, not just "invalid input"
- Focus moves to the first invalid field on submit
- On the worker PWA, all inputs have `inputMode` set correctly (`numeric`, `tel`, `email`) to trigger the right mobile keyboard

## How to Verify

Before marking any component complete, run these checks:

- Keyboard only: can you reach and operate every interactive element with only Tab, Shift+Tab, Enter, Space, and Escape?
- Screen reader: using VoiceOver or NVDA, does every element read meaningfully?
- Zoom: does the layout still work at 200% browser zoom?
- Reduced motion: does the component still function (not just look pretty) with motion disabled?
- Contrast: use a contrast checker tool on every text and background pair
- Color-blind simulation: use browser DevTools or a plugin to simulate deuteranopia, protanopia, and tritanopia

If any check fails, the component is not done.

## Things to Always Do

- Use semantic HTML elements (`<button>`, `<nav>`, `<main>`, `<article>`)
- Set the `lang` attribute on `<html>` dynamically based on the worker's preferred language
- Add `aria-label` to every icon-only button, in the user's current language
- Wrap mixed-language content in `<span lang="...">`
- Test every new component with keyboard-only navigation before merging
- Respect `prefers-reduced-motion`
- Provide visible focus rings on every interactive element

## Things to Never Do

- Never use `outline: none` without a replacement focus indicator
- Never use `user-scalable=no` or `maximum-scale=1.0` in the viewport meta tag (disables pinch zoom)
- Never rely on color alone to communicate state, error, or success
- Never use hover-only interactions on the worker PWA
- Never skip heading levels (H1 to H3 without H2)
- Never use `div` or `span` as interactive elements without full ARIA role, tabindex, and keyboard handlers
- Never auto-play video or audio
- Never use placeholder text as the only label for an input
- Never hide content from screen readers with `display: none` unless it is truly visually hidden for all users
- Never use a text size below 16px on the worker PWA
- Never use a touch target below 44px on the worker PWA
- Never use a contrast ratio below 4.5:1 for body text
