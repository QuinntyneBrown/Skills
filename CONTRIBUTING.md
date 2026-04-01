# Contributing to SkillForge

Thank you for your interest in contributing. This document explains how to get started, the standards we follow, and how to submit changes.

## Getting Started

1. Fork the repository and clone your fork
2. Install dependencies: `npm install && cd web && npm install && cd ../cli && npm install && cd ..`
3. Copy `.env.example` to `.env` and configure your local PostgreSQL and Redis
4. Run migrations: `npm run migrate`
5. Start development servers: `npm run dev` (API) and `cd web && npm run dev` (UI)

## Development Workflow

1. Create a branch from `main` for your work
2. Make your changes with clear, focused commits
3. Run tests before submitting: `npm test`
4. Open a pull request against `main`

## Code Standards

### TypeScript

- Strict mode is enabled (`tsconfig.json`). Do not use `any` unless absolutely necessary.
- Use Zod for all request validation in controllers.
- Follow the existing layered architecture: controllers -> services -> repositories.

### API

- All endpoints live under `/api/v1/`.
- Return consistent error envelopes: `{ "error": { "code": "...", "message": "...", "details": [...] } }`.
- Include `correlation_id` in error responses.
- New endpoints need corresponding Zod validation schemas in `controllers/validation-schemas.ts`.

### Web UI

- Components go in `web/src/components/`, page-level routes in `web/src/pages/`.
- Use the existing dark theme variables. Do not introduce new color values outside the design system.
- All new UI must work at three breakpoints: mobile (375px), tablet (768px), desktop (1440px).

### CLI

- Commands are defined in `cli/src/cli.ts` using Commander.js.
- Support both human-readable (table) and machine-readable (`--json`) output for all read commands.
- Print errors to stderr, data to stdout.

### Testing

- **E2E tests** use Playwright with the Page Object Model pattern.
  - Page objects live in `tests/e2e/pages/`. Add locators and actions there, not in spec files.
  - New specs go in `tests/e2e/` and should cover desktop, tablet, and mobile viewports where relevant.
- **CLI tests** use Vitest and live in `tests/cli/`.
- Run the full suite with `npm test` before opening a PR.

### Database

- Schema changes must go through the migration system (`src/migrations/sql/`).
- Migration files are numbered sequentially: `002_description.up.sql`, `002_description.down.sql`.
- Migrations must be reversible for non-destructive changes.

## Commit Messages

Write short, descriptive commit messages in the imperative mood:

```
Add skill sharing endpoint
Fix pagination off-by-one in skill list
Update dashboard skeleton loader for tablet viewport
```

## Pull Requests

- Keep PRs focused on a single concern.
- Include a summary of what changed and why.
- Link related issues or requirements (e.g., "Implements L2-011").
- Ensure all tests pass and no new lint warnings are introduced.
- Add screenshots for UI changes.

## Reporting Issues

Open an issue with:

- A clear title and description
- Steps to reproduce (if it's a bug)
- Expected vs actual behavior
- Browser/OS/Node version if relevant

## Design Documents

If your change affects architecture or introduces a new feature area, update or create the relevant design document in `docs/detailed-designs/`. Follow the existing format with PlantUML diagrams for C4, class, and sequence views.

## Code of Conduct

Be respectful and constructive. We are all here to build something useful.
