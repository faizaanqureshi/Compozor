# Compozor design system — "silent luxury"

This is the source of truth for how Compozor's frontend looks, feels, and is
built. It applies to every screen in `Compozor/app/` and every component in
`Compozor/components/`. **Read this before writing or editing any UI code** —
tsx, css, or component structure. This holds regardless of which model or
tool is doing the editing (Claude, GPT, or otherwise); it is not
Claude-specific.

If a change would violate something below, stop and either find the
compliant way to do it or flag the conflict — don't silently improvise a
one-off pattern.

## 0. Visual reference

Rules in this doc describe the system; these are what it should actually
look like. When in doubt about "does this feel right," compare against these
rather than just checking the rules in isolation — proportion, whitespace,
and restraint are easier to see than to specify.

**`docs/design-reference/landing-hero.png`** — the marketing landing hero.
Reference for:
- Denton at true hero scale (`Stop chasing clients.`) against Neue Montreal
  everywhere else (nav, body copy, badge, button) — the contrast between the
  two faces is the whole effect; note how little else is competing with it.
- The "AUTOMATED INTAKE" eyebrow: small, uppercase, tracked-out, muted —
  informative, not decorative. This is the reusable "quiet label" pattern
  referenced in §3.
- A single dark, high-contrast surface (the product preview card) as the
  *only* strong visual element on an otherwise pale, quiet page — restraint
  makes that one element read as premium instead of just another block.
  Don't add a second competing high-contrast surface on the same view.
- Generous, uneven whitespace (the copy block doesn't fill its column,
  the page isn't packed edge-to-edge) — resist the urge to "use the space."
- The single primary CTA (`Join the Waitlist`) with no competing secondary
  button fighting for attention next to it.

If you add more reference screenshots later (a dashboard view, a mobile
view, an urgency/escalation state), drop them in `docs/design-reference/`
and add a bullet list here explaining what they demonstrate — a screenshot
with no annotation isn't a useful reference, since it doesn't say *why* it's
right.

## 1. The brand posture: restraint, not decoration

Compozor is a tool for accounting/legal/professional firms handling other
people's money and paperwork. The visual language is **old-money,
quietly confident** — evergreen/charcoal + brass-gold + warm ivory, thin
display type, generous whitespace, slow soft-focus motion. Think private
bank or a well-run law office, not a consumer SaaS dashboard.

Concretely, this means:

- **Purposeful over decorative.** Every element earns its place. No badges,
  icons, gradients, shadows, or animations added "because it looks nice" —
  only because they communicate something (status, hierarchy, urgency).
- **Restrained color.** The palette is deliberately narrow (see §2). Color is
  a signal, not a decoration — the brass accent and destructive/oxblood red
  are used sparingly, precisely because scarcity is what makes them mean
  something. Don't reach for a new color when an existing semantic token
  says what you need.
- **Quiet hierarchy over loud hierarchy.** Prefer weight, size, and spacing
  contrasts (thin display serif vs. regular UI sans) over color or borders to
  establish hierarchy. A page shouldn't need three different badge colors to
  be readable.
- **Confidence, not urgency-by-default.** Most UI should feel calm. Urgency
  (overdue reminders, escalations, needs-human-attention) should look
  distinctly different from the calm baseline — that contrast is what makes
  it effective. If everything is emphasized, nothing is.
- **No haphazard feature sprawl.** Don't add a new UI affordance (extra
  toggle, extra panel, extra menu item) as a side effect of a feature unless
  it was actually asked for. Prefer extending an existing pattern over
  inventing an adjacent one.

## 2. Color — semantic tokens only

All color lives in `app/globals.css` as CSS variables (oklch), mapped through
Tailwind's `@theme inline` block, with a light palette under `:root` and a
dark palette under `.dark`. **Never hardcode a hex/oklch value or an
arbitrary Tailwind color (`text-[#...]`, `bg-neutral-800`, etc.) in a
component.** Always use the semantic class: `bg-background`,
`text-foreground`, `bg-card`, `text-muted-foreground`, `bg-primary`,
`bg-secondary`, `bg-accent`, `text-destructive`, `border-border`, etc.

Palette meaning (light mode; dark mode inverts brand/ivory but keeps the same
semantics):

| Token | Role |
|---|---|
| `background` / `foreground` | White page bg / brand #122023 text |
| `card` / `card-foreground` | White surface, separated by hairlines rather than tint |
| `primary` | Brand deep teal-charcoal (dark mode: brass gold) — the main call-to-action color |
| `secondary` | Pale sage-grey — low-emphasis surfaces/buttons |
| `muted` / `muted-foreground` | Faint sage background / cool grey text — de-emphasized content |
| `accent` | Brand teal — highlights and selection (selected cards, positive statuses, links). Not a warning colour |
| `warning` / `warning-foreground` | Yellow fill (dots, pill backgrounds, rings) / deep amber text — warnings only |
| `destructive` | Red — issues: errors, failures, deletions, escalations |
| `success` | Muted evergreen — completed/on track |
| `border` / `input` | Cool grey hairlines |
| `sidebar*` | The nav rail always uses the dark brand palette regardless of light/dark mode — it's a fixed "always dark" surface, by design |

If a new token is genuinely needed (e.g. a new chart series), add it beside
the existing `--chart-*` variables in both `:root` and `.dark`, following the
existing oklch + hex-comment convention — don't invent an inline color.

**Needs a new color for urgency/severity?** See §6 before adding anything —
reuse `destructive` for "broken/failing", `accent` for "needs attention but
not broken", and plain weight/size/copy changes before reaching for another
color at all.

## 3. Typography

Two type families, each with a specific job — never use one for the other's
job:

- **`font-sans` (PP Neue Montreal, via `--font-sans`)** — the default
  UI/body font (`html` sets `font-sans` globally). Use for all body copy,
  labels, buttons, form fields, table content, nav. This is also aliased as
  `font-heading` in the theme, so `CardTitle`/section headings default to it
  too unless a page explicitly wants the display face.
- **`[font-family:var(--font-denton)]` (Denton, condensed/thin display
  serif)** — reserved for large marketing/hero headlines only (see
  `landing-hero.tsx`: `font-thin tracking-tight` at `text-5xl`+). Do not use
  Denton for in-app dashboard UI, table headers, or anything below hero
  scale — it reads as decorative at small sizes, which breaks the restraint
  principle in §1.

Weight and tracking conventions worth following:
- Thin/light weights (`font-thin`, `font-light`) at large display sizes read
  as "quiet luxury"; avoid bold display type outside of real emphasis needs.
- `uppercase tracking-wide text-muted-foreground` on a `Badge`/eyebrow label
  is the established "quiet label" pattern (see the "Automated intake" badge
  in `landing-hero.tsx`) — reuse it instead of inventing a new eyebrow style.
- Use `text-balance` on headlines and `text-pretty` on body paragraphs
  wrapping to multiple lines (already the convention in the hero).

## 4. Spacing, radius, surfaces

- Radius is driven entirely by the `--radius` variable and its derived scale
  (`--radius-sm` … `--radius-4xl` in `globals.css`) — use Tailwind's
  `rounded-lg` / `rounded-xl` / etc., never a raw `rounded-[Npx]`.
  Cards/panels are `rounded-xl`; small controls (`Button`, `Input`) are
  `rounded-lg`; pill-shaped elements (`Badge`) use `rounded-4xl`.
- `Card` exposes its internal padding as a CSS variable (`--card-spacing`,
  default `--spacing(4)`, `sm` size variant `--spacing(3)`) so header/content/
  footer stay in sync — if a card needs different density, set the `size`
  prop rather than overriding padding by hand on individual card parts.
- Surfaces are layered subtly: `background` → `card` → `muted`/`secondary`
  for nested emphasis, with `ring-1 ring-foreground/10` (not a heavy border)
  as the default card edge. Prefer a soft ring/hairline border over a drop
  shadow for separating surfaces — shadows are essentially unused in this
  system on purpose.

## 5. Motion

Motion is slow, soft-focus, and used only at moments that deserve it (page
entrance, not every interaction):

- `animate-blur-in` (2.4s, `cubic-bezier(0.16,1,0.3,1)`, blur+translateY+fade)
  for large hero/page-level reveals.
- `animate-blur-in-sm` (700ms, same easing) for smaller in-page elements.
- Everyday interactive states (hover, focus, active) use short `transition-all`
  / `transition-colors` already baked into the `ui/` primitives — don't add
  bespoke transition timing to one-off components; match what `Button`/
  `Input`/`Badge` already do.
- No bouncy/elastic easing, no spring physics, no attention-grabbing loops.
  If motion calls attention to itself, it's wrong for this brand.

## 6. Urgency & status — the one place color is expressive

Compozor dashboards surface real urgency (overdue documents, escalations,
needs-human-attention, reauth-needed connections). This is the one area
where visual emphasis is not just allowed but expected — the backend
(`FRONTEND_CONTEXT.md`) explicitly calls out deadline/urgency surfacing as a
current gap worth designing well. Do it with restraint, in this order of
preference:

1. **Copy and structure first** — sort/group by urgency, use a clear status
   word, before reaching for color.
2. **Weight/size** — a slightly heavier label or a small dot indicator beats
   a colored pill for low-stakes emphasis.
3. **`warning` (yellow)** — "needs attention, not broken" (e.g. due soon,
   drafts pending review, missing documents, a disagreeing fact). Use
   `bg-warning` for dots/fills and `text-warning-foreground` for text; the
   pill pattern is `bg-warning/20 text-warning-foreground` (Badge
   `variant="warning"`).
4. **`destructive` (red)** — issues: "broken / failed / needs immediate human
   action" (e.g. `needs_human_attention`, `needs_reauth`, escalations). This
   is the strongest visual signal in the system — use it only for genuine
   escalation states, never for routine information, or it stops meaning
   anything.

Never invent a new ad-hoc severity color (a raw `amber-500`/`red-600`) outside
`warning`/`destructive`, and don't use `accent` to signal a warning. If two distinct severities are genuinely needed
beyond these two, that's a design decision to raise explicitly, not a
default `bg-orange-500` to reach for silently.

## 7. Breakpoints — design for every size, mobile first

Tailwind v4 defaults, unmodified: `sm` 640px, `md` 768px, `lg` 1024px, `xl`
1280px, `2xl` 1536px. Write mobile-first (base styles = smallest screen, add
`sm:`/`md:`/`xl:` overrides upward) — this is the existing convention
throughout `app/` and `components/` (`sm`, `md`, and `xl` are the
heavily-used breakpoints in this codebase; `lg` is used sparingly as a
fine-tuning step, not a primary layout break).

Every new page or component must be checked at, at minimum: mobile (<640px),
tablet (`md`, ~768–1024px), and desktop (`xl`+, ~1280px+). Two concrete
patterns already established — follow them rather than reinventing
responsive behavior:

- **Nav rail (`components/nav.tsx`)** — three distinct layouts at three
  breakpoints, documented inline in that file:
  - `< md`: off-canvas drawer opened from the mobile top bar.
  - `md`–`xl`: docked but permanently collapsed to an icon rail (no room for
    an expand toggle).
  - `xl+`: docked, user-expandable/collapsible.
  This is the reference example for "don't just hide/show — redesign the
  interaction per breakpoint when the available width genuinely changes what
  makes sense."
- **Hero layout (`components/landing-hero.tsx`)** — stacked column on
  mobile, switching to a side-by-side row only at `xl` (`flex-col
  xl:flex-row`), with spacing/gap scaling up through `sm`/`md`/`lg`/`xl`
  rather than jumping straight to the desktop gap.

Never ship a component that only looks right at one width. If you can't
verify a breakpoint visually, say so explicitly rather than assuming it's
fine.

## 8. Componentization — reuse, compose, then create

Before writing new UI:

1. **Check `components/ui/` first.** This is the shadcn-based primitive
   layer (style: `base-nova`, base color `neutral`, built on `@base-ui/react`
   + `class-variance-authority` + `lucide-react` icons — see
   `components.json`). Current inventory: `accordion`, `avatar`, `badge`,
   `button`, `card`, `dialog`, `dropdown-menu`, `grid-pattern`, `input`,
   `label`, `navigation-menu`, `separator`, `sheet`, `skeleton`, `switch`,
   `tabs`, `textarea`, `tooltip`. If one of these does what you need, use it
   — don't hand-roll a competing button/card/badge.
2. **Check `components/` (feature layer) second** for existing
   product-specific pieces (e.g. `usage-dashboard.tsx`, `email-draft-editor.tsx`,
   `agent-activity-disclosure.tsx`) before building a near-duplicate.
3. **Compose before extending.** Prefer combining existing primitives
   (`Card` + `Badge` + `Button`) over adding new variants to a primitive.
   If a primitive genuinely needs a new variant (new `cva` branch), that's
   fine and is the established pattern (see `buttonVariants`,
   `badgeVariants`) — add a variant, don't fork the component.
4. **New primitive, only when genuinely missing.** If nothing in
   `components/ui/` covers it, build it in that same style: a typed,
   `data-slot`-tagged component using `cva` for variants, `cn()` from
   `lib/utils` for class merging, composed from `@base-ui/react` primitives
   where one exists for the pattern (menus, dialogs, tooltips, switches all
   go through `@base-ui/react`, not hand-rolled). Match the existing file's
   shape exactly (see `button.tsx`/`badge.tsx`) — variants object, sizes
   object, `defaultVariants`, exported alongside its `*Variants` cva
   function.
5. **New feature component** (a composed, page-specific piece, not a
   primitive) belongs in `components/`, named descriptively
   (`kebab-case.tsx`), and should itself be built from `components/ui/`
   primitives — not raw divs re-implementing card/button/badge styling.
6. **Keep components single-purpose and modular.** A component should do one
   legible thing. Prefer several small composed components over one large
   component with many conditional branches for unrelated states — this
   keeps reuse possible and keeps diffs small when one part changes.

## 8a. Dialogs and forms

Modals and forms get their look from the primitives; don't restyle them per
screen.

- `DialogContent`: white panel, `rounded-2xl`, generous padding, a
  #122023-tinted blurred backdrop (the `Sheet` uses the same backdrop). Width
  defaults to `sm:max-w-md`; widen with a `sm:max-w-*` class only when the
  content needs it.
- `DialogTitle` is light and large (`text-xl font-light`), echoing the
  homepage's section headings; don't override it. `DialogDescription` is one
  short, muted sentence.
- `DialogFooter` is right-aligned actions on white (no grey bar): a secondary
  (`outline`) action, then the primary action.
- Fields: `Label` above `Input` / `Textarea` / `NativeSelect` (40px tall,
  white fill, soft #122023 focus ring). Stack fields with `gap-5`, label to
  field `gap-1.5`. Mark optional fields with a muted "Optional" span inside
  the label, not "(optional)".
- Use `NativeSelect` for dropdown fields instead of a hand-styled `<select>`.
- Menu items highlight with `muted`, never `accent`; accent is for signals.

## 9. Before you touch frontend code — checklist

- [ ] Have I looked at `docs/design-reference/` (§0) if I'm unsure whether
      something "feels right," not just whether it follows a rule?
- [ ] Am I using semantic color tokens only (no raw hex/arbitrary colors)?
- [ ] Am I using the right font for the context (sans for UI, Denton only
      for hero-scale display type)?
- [ ] Does this reuse an existing `components/ui/` primitive or feature
      component before adding a new one?
- [ ] If I added a new primitive/variant, does it follow the `cva` +
      `data-slot` + `cn()` shape of the existing ones?
- [ ] Have I checked the layout at mobile, `md`, and `xl`+ (and redesigned
      the interaction per breakpoint where needed, not just hidden/shown)?
- [ ] Is every new element earning its place — nothing decorative, no scope
      creep beyond what was asked?
- [ ] If this involves urgency/status, does it follow the §6 order
      (copy/structure → weight → accent → destructive) instead of an ad-hoc
      color?
- [ ] Have I actually run the app and looked at the result (not just
      trusted that following the rules produced something good)? Rules
      catch wrong tokens/fonts/spacing; they don't catch a layout that's
      technically compliant but still looks flat, cluttered, or awkward —
      that needs an eyes-on look, ideally at mobile, `md`, and `xl`+.

## Palette: #122023 on white (September 26, 2026)

The whole product (app and marketing) now uses #122023 on white; the
ivory/brass/camel palette is retired, and the §2 table reflects the current
tokens. Gold is no longer a brand colour; charts keep the `--chart-*` series
(brass and champagne included) so data reads in colour. The nav rail uses
`public/compozor-wordmark-light.png`; light surfaces use
`public/compozor-wordmark.png`.

### Marketing notes

Supersedes the ivory/brass/champagne references in the marketing notes below.
Marketing pages (home, its mobile menu, sign-in, sign-up, waitlist) wrap their
content in `.marketing-page`, which only adds marketing-specific tweaks:
#122023 for `marketing-forest`, a quieter slate-sage `accent` for hairlines,
and stronger body-copy contrast. Charts keep
the full `--chart-*` palette (brass and champagne included) so the data reads
in colour; outside charts there is no gold on marketing surfaces: the closing
CTA is white on #122023, the aurora's second glow uses `--aurora-glow` (sage), and the work-sample frame uses
`textures/work-sample-stone.webp`. Portalled marketing UI must carry the
`.marketing-page` class itself.

## Marketing contrast refinement (September 21, 2026)

The homepage uses the user-approved Harvey-inspired direction: a larger product
workspace illustration, dark evergreen feature sections, and higher-contrast body
copy. `marketing-forest`, `marketing-sage`, and `marketing-brass` are semantic
tokens for this marketing treatment. Keep these changes scoped to marketing; do
not recolor dashboard status semantics. Ivory text belongs on evergreen surfaces,
and the rich brass token is for accents on dark backgrounds. Preserve the hero's
fine grid and soft yellow aurora glow alongside the deeper evergreen surfaces.
Product previews
use fictional data and must be labeled as illustrations, never actual client
records. Retain the existing Denton / Neue Montreal pairing and quiet motion.

Homepage scroll motion uses a short upward reveal with a light blur, once per
content group. Keep surfaces stationary and stagger paired content by only 120ms.
The floating navigation contracts after scrolling and expands at the top, with
separate thresholds to prevent jitter. Respect reduced motion, reveal focused
controls immediately, and keep all content visible without JavaScript. Do not
add scroll hijacking or a general animation dependency for this treatment.

Marketing demonstrations should show a concrete action and its outcome: assigning
a package, correcting a document, or turning a sample into a client deliverable.
Keep them clearly labeled as fictional examples, run them locally in the browser,
and do not imply they send email or execute real workflows. Practice selectors
should change the sources and deliverable together, not just the industry label.
Lead the walkthrough with a complete client conversation, the agent's correction,
and the resulting deliverable. Keep firm setup as optional supporting detail.
Name the automation settings used in the example, and label controls as ways to
explore the preview rather than manual steps required to make the agent proceed.

Homepage interactions share a 300ms control transition and 400–550ms content
transition. Use `LandingTransition` for changing demo heights, with Base UI’s
panel lifecycle for enter/exit fades. Avoid instant scrolling, fixed tallest-panel
heights, and unmounting details before their closing animation. All interaction
motion must honor reduced motion; keep it scoped to the marketing experience.

Chart marks may reveal once on entering view: bars grow from a fixed baseline,
lines draw, and donut segments appear through a ring mask. Keep labels, exact
values, axes, and document surfaces crisp and stationary. Use the `focus` reveal
only for editorial introductions; its light blur resolves before the final
settling movement. No count-up numbers or continuous/reverse scroll animation.

The homepage uses a restrained glass material on floating navigation, its mobile
menu, the work-sample toolbar/selector, and the closing secondary action. Reuse
`landing-glass.module.css`: warm translucent fills, a fine inner highlight, and
very light depth only on floating surfaces. Keep reports, charts, and primary
CTAs solid. Never add lens distortion, moving shine, or pointer-following effects.
Provide an opaque fallback and respect reduced transparency/increased contrast.

Marketing depth follows three static planes: the ambient page, an inset workspace,
and solid paper-like output. Reuse `landing-depth.module.css` for faint directional
light and compact contact shadows. Keep the hero grid and aurora intact. Use depth
on the principal previews and CTA controls, not every card or paragraph; no tilt,
parallax, floating loops, or additional blur. Reduce shadows on small screens and
remove them for increased contrast and print.

The hero workspace showcase can extend beyond the editorial text column (up to
112rem) so product detail stays legible. Use `landing-workspace-preview.module.css`
for its mottled mineral-stone texture; keep the texture behind opaque UI surfaces,
never on text, charts, or controls. Keep the textured frame free of labels; use
the caption below for context. On desktop, leave roughly 8% side margins and
4.5% vertical margins around the workspace. Preserve the compact checklist-and-workflow
composition. Add familiar app controls as static illustration details, not new
panels or a redesigned dashboard; label the preview and its fictional data.
Stack panels at smaller sizes instead of shrinking a desktop screenshot. Remove
texture for increased contrast, reduced transparency, and print.

The work-sample section uses a warm neutral surround and an ivory toolbar/source
panel. Its report sits inside a muted champagne-gold mineral frame, a companion
to the green hero texture. Keep the material confined to the space around solid
paper; never behind text or charts. Use `landing-work-sample.module.css` with the
same increased-contrast, reduced-transparency, and print fallbacks as the hero.

On phones (<640px), the navigation is a flush full-width bar (logo + menu
only), clear over the hero and settling into glass with a hairline once
scrolled. The hero carries the single "Book a demo" action; don't repeat it in
the bar. The menu opens full-screen with large section links and the demo,
waitlist, and sign-in/dashboard actions at the bottom. The phone hero is
headline, one paragraph, one CTA, then the preview; the waitlist and secondary
links live in the menu and closing section. Keep phone sections to title,
short copy, and visual: supporting asides (side paragraphs, notes, "also
possible" lines, optional disclosures) are hidden below `sm`, but fictional-data
labels always stay visible. The phone hero preview keeps the header, checklist,
and workflow output; the reminder row and workflow steps are hidden. On phones
the "How it works" tabs unroll into a scrolling Collect → Check → Prepare
sequence, each step showing its outcome with the shared `*Example` card bodies
from `landing-story.tsx`. Wider screens keep the interactive tabs; edit the
shared bodies so both stay in sync. Phone section titles are all Denton.
Report/practice cards drop decorative micro-labels and footers on phones but
keep their fictional-data labels. The nav uses `public/compozor-wordmark.png`
(lowercase sans lockup, #122023, cropped from the brand export). Give mobile navigation and report tabs
44px tap targets. Shorten section spacing without shrinking body copy. Present
the sample report before its supporting material below the desktop breakpoint;
on phones, show the expense total above the secondary metrics rather than
squeezing three labels into one row. Retain the desktop compositions and texture
frames, and verify at 320px as well as typical phone, tablet, and desktop widths.
