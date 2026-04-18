# Design System Source

This project should follow the `shadcn/ui` design-system style and token model.

## Source of Truth

- Global tokens: `src/app/globals.css`
- Shared UI primitives: `src/components/ui/*`

## Core Tokens

- Color tokens: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`
- Radius tokens: `--radius`, `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`
- Typography source: `Pretendard`

## Spacing and Sizing

- Use the spacing patterns already embedded in the primitives.
- Prefer `CardHeader p-6`, `CardContent p-6 pt-0`, `Button h-9 px-4 py-2`, `Input h-9`, `Textarea px-3 py-2`.

## Component Rule

- If a new UI element is needed, extend an existing primitive in `src/components/ui` first.
- Avoid hardcoding one-off visual rules when the same behavior belongs in the shared primitives or global tokens.
