---
name: design-system
description: Compozor's design system and frontend conventions — the "silent luxury" visual language (color tokens, typography, spacing/radius, motion, breakpoints, componentization rules). Load this before writing or editing ANY UI code in the Compozor Next.js app — new pages, components, styling changes, layout work, or anything touching app/ or components/ — even if not explicitly asked to "follow the design system."
---

Read `/Users/faizaanqureshi/Documents/Compozor/Compozor/DESIGN_SYSTEM.md` in
full before making the change. It is the source of truth for:

- the brand posture (restrained, purposeful, "old-money" — not decorative)
- semantic color tokens (never raw hex/arbitrary Tailwind colors)
- typography (PP Neue Montreal for UI, Denton reserved for hero-scale display)
- spacing/radius/surface conventions
- motion conventions (`animate-blur-in` / `animate-blur-in-sm`, no bouncy easing)
- how urgency/status should be expressed (copy/structure → weight → accent → destructive)
- breakpoints (mobile-first, `sm`/`md`/`xl` are primary; verify every layout
  at mobile, `md`, and `xl`+)
- componentization rules: check `components/ui/` (shadcn primitives), then
  `components/` (feature layer), then compose, then only build new as a last
  resort, matching the existing `cva` + `data-slot` + `cn()` shape

`DESIGN_SYSTEM.md` §0 also links annotated screenshots in
`docs/design-reference/` — check those when judging whether something
"feels right," not just whether it technically follows a rule.

After reading it, apply its checklist (§9) to the change before considering
the work done — including actually running the app and looking at the
result, since the written rules can't catch a layout that's compliant but
still looks flat or cluttered. If a request conflicts with a rule in that
doc, say so rather than silently picking one or the other.
