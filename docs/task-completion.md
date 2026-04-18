# Task Completion Checklist

Run these checks before wrapping up a task:

1. `npm run lint`
2. `npm test`
3. `npm run build`

If the task is ready to ship:

4. Review `git status`
5. Commit with the convention in `docs/commit-convention.md`
6. `git push origin main`
7. `vercel deploy --prod --force --yes`

If parsing or debate logic changed, update or add tests in `src/lib/*.test.ts`.
