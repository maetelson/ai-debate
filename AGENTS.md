# Next.js Agent Rules

This project uses a modern Next.js version. Before making framework-level changes, check the relevant guide in `node_modules/next/dist/docs/` and avoid relying on stale conventions.

# Project Notes

## Product Shape
- This app is a multi-agent debate tool built with `Next.js App Router`.
- The main UI lives in `src/components/debate-app.tsx`.
- Server APIs live under `src/app/api`.
- Debate orchestration, parsing, persistence, and shared types live under `src/lib`.
- Supported document inputs are `pdf`, `docx`, `txt`, and `html`.

## Working Rules
- Keep the product goal-centered: consensus should count only when both `agreementScore` and `goalAlignmentScore` are strong enough.
- Preserve the current split between client UI and server orchestration. Do not move OpenAI calls into the browser.
- Treat agent persona fields as behavior-shaping inputs, not display-only metadata.
- Prefer small focused helpers in `src/lib` over bloating route handlers or page components.
- If storage changes later, keep the `DebateSession` shape stable when practical.
- When a patch is large, split it into small safe edits instead of retrying one oversized patch.

## Validation Checklist
- Run `npm run lint`
- Run `npm test`
- Run `npm run build`
- If parsing or consensus logic changes, update tests in `src/lib/*.test.ts`

## Commit Convention
- Use Conventional Commits.
- Format: `<type>(<scope>): <summary>`
- Allowed types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`
- Recommended scopes for this repo: `ui`, `api`, `debate`, `parser`, `storage`, `config`
- Examples:
  - `feat(ui): add live debate timeline and consensus panel`
  - `fix(parser): normalize html extraction output`
  - `refactor(debate): separate moderator scoring from turn generation`
