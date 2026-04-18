# Always Check First

- This project uses a modern `Next.js App Router` setup. Before changing framework-level behavior, verify current conventions against `node_modules/next/dist/docs/`.
- Keep the current split between client UI and server orchestration. Do not move OpenAI calls into the browser.
- Keep consensus goal-centered: changes must preserve both `agreementScore` and `goalAlignmentScore` behavior.
- Use the shared `shadcn/ui`-style tokens and primitives already defined in `src/app/globals.css` and `src/components/ui`.
- When a patch is large, split it into small safe edits instead of retrying one oversized patch.

# Read When Needed

- Commit message rules: `docs/commit-convention.md`
- End-of-task workflow: `docs/task-completion.md`
