<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Frontend design system — read before any UI change

Before writing or editing any frontend code (`app/`, `components/`, styling,
layout), read **`DESIGN_SYSTEM.md`** in this directory in full and follow it.
It's the source of truth for Compozor's visual language ("silent luxury" —
restrained, purposeful, old-money palette), color tokens, typography,
spacing/motion, breakpoints, and componentization rules (reuse
`components/ui/` and `components/` before building new). This applies to
every agent/model working in this repo, not just Claude — do not skip it
because the request seems small.

If you are Claude Code, load the `design-system` skill (or read
`DESIGN_SYSTEM.md` directly) at the start of any such task.
