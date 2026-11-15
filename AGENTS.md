<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project rules (written by the owner, for every change)

- **Fast by design.** Speed here comes from few database round trips, not clever algorithms:
  one query instead of many (no query inside a loop), an index for every column used in a
  WHERE / JOIN / ORDER BY, no slow work on pages that many people open. The public menu (opened
  from a QR code on a phone) is the page that must be fastest: one query for the whole menu,
  cached, refreshed when the owner edits it. Slow on purpose is allowed only where it protects
  something (password hashing).
- **Explain before editing** when the owner asks to decide first; he reviews and merges every PR.
- **Security checks live next to the data**, not only in the proxy or a layout.
- **Tests must be able to fail**: break the code on purpose and confirm a test catches it.
