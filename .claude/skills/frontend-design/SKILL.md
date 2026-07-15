---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics.
license: Complete terms in LICENSE.txt
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.

## Vision Protocol  -  Screenshot Analysis

When a screenshot, mockup, or reference image is provided alongside a UI request:

1. **Analyze first, code second.** Before writing any code, describe what you see:
   - Layout structure and grid system in use
   - Color palette (dominant, accent, background, text)
   - Typography hierarchy and font character
   - Spacing rhythm and density
   - Component patterns (cards, nav, forms, CTAs)
   - What's working well vs. what looks generic or weak

2. **Identify improvement opportunities.** For redesigns specifically:
   - What is the single biggest visual problem?
   - Where does hierarchy break down?
   - What feels dated, generic, or off-brand?
   - What would a senior product designer fix first?

3. **Present your direction.** Before implementing, state:
   - What you're keeping from the original
   - What you're changing and why
   - The aesthetic direction you're committing to
   - WAIT for approval before proceeding

4. **Never pixel-copy a reference.** A screenshot is a starting point, not a spec. Elevate it.

---

## shadcn/ui Component Awareness

When the project uses shadcn/ui (check for `components/ui/` folder or `@/components/ui` imports):

- **Use shadcn primitives as the base** for interactive components  -  Button, Dialog, DropdownMenu, Select, Tabs, Sheet, Tooltip, etc.
- **Style via Tailwind utilities** on top of shadcn  -  never fight the base styles, extend them
- **Prefer shadcn for:** forms, modals, dropdowns, navigation menus, tooltips, alerts, toasts
- **Prefer custom for:** hero sections, marketing layouts, decorative elements, anything that needs to look distinctive and on-brand
- **Never import shadcn components that aren't already installed**  -  check `components/ui/` first
- **Respect the variant system**  -  use `variant="ghost"`, `variant="outline"` etc. rather than overriding from scratch
- When building a new UI-heavy feature, list which shadcn components you plan to use in your design system presentation before coding

---

## CSS Variables & Design Tokens

Every project must define its design system as CSS variables, not hardcoded Tailwind values.

### Token structure (define in `globals.css`):

```css
:root {
  /* Brand */
  --color-brand-primary: #YOUR_COLOR;
  --color-brand-accent: #YOUR_COLOR;

  /* Backgrounds */
  --color-bg-base: #YOUR_COLOR;
  --color-bg-elevated: #YOUR_COLOR;
  --color-bg-overlay: #YOUR_COLOR;

  /* Text */
  --color-text-primary: #YOUR_COLOR;
  --color-text-secondary: #YOUR_COLOR;
  --color-text-muted: #YOUR_COLOR;

  /* Borders */
  --color-border-default: #YOUR_COLOR;
  --color-border-subtle: #YOUR_COLOR;

  /* Spacing scale */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 40px;
  --space-2xl: 64px;

  /* Typography */
  --font-display: 'Your Display Font', serif;
  --font-body: 'Your Body Font', sans-serif;
  --font-mono: 'Your Mono Font', monospace;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --radius-full: 9999px;

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-base: 200ms ease;
  --transition-slow: 300ms ease;
}
```

### Rules:
- **All color values in UI components reference CSS variables**, not hardcoded hex or Tailwind color classes like `bg-blue-500`
- **Tailwind theme extensions** should map to CSS variables in `tailwind.config.js` so you get both
- **Dark mode** = swap CSS variable values under `[data-theme="dark"]` or `.dark`, never duplicate components
- **Never use magic numbers**  -  if you're setting padding to `17px`, it should be a variable or explained
- When generating a design system, output the full CSS variable block first, then build components that consume it
