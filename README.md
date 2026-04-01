# SkillForge

A full-stack platform for creating, managing, versioning, and sharing Claude skills. Includes a dark-mode React web UI with a Monaco code editor, a RESTful API, a cross-platform CLI, and a comprehensive design and specification library.

## System Overview

| Layer | Stack |
|-------|-------|
| **Web UI** | React 19, Vite 8, React Router 7, Monaco Editor, dark theme, responsive (mobile/tablet/desktop) |
| **API** | Express 4, TypeScript 5, Zod validation, JWT auth, RBAC, rate limiting, Helmet, CORS |
| **Database** | PostgreSQL with migrations, connection pooling, full-text search |
| **Cache** | Redis via ioredis for skill caching and rate-limit counters |
| **CLI** | Commander.js with login, CRUD operations, `$EDITOR` integration, JSON/table output |
| **Observability** | Structured JSON logging, audit trail, Prometheus metrics (`/metrics`), health checks (`/health`) |
| **Testing** | Playwright E2E (desktop/tablet/mobile viewports), Vitest unit tests, Page Object Model |

## Prerequisites

- **Node.js** >= 18
- **PostgreSQL** >= 14
- **Redis** >= 7
- **npm** >= 9

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/user/Skills.git
cd Skills
npm install
cd web && npm install && cd ..
cd cli && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your database credentials, Redis connection, and JWT key paths. See [`.env.example`](.env.example) for all available options.

### 3. Generate JWT keys

```bash
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

### 4. Run database migrations

```bash
npm run migrate
```

### 5. Start development servers

```bash
# Terminal 1 - API (port 3000)
npm run dev

# Terminal 2 - Web UI (port 5173)
cd web && npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 6. CLI (optional)

```bash
cd cli
npm run dev -- login
npm run dev -- list
```

## Scripts

### Root (API)

| Script | Description |
|--------|-------------|
| `npm run dev` | Start API with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production server |
| `npm run migrate` | Run pending database migrations |
| `npm run migrate:rollback` | Roll back the last migration |
| `npm test` | Run all tests (CLI unit + E2E) |
| `npm run test:cli` | Run CLI unit tests (Vitest) |
| `npm run test:e2e` | Run E2E tests (Playwright) |

### Web (`cd web`)

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite dev server on port 5173 |
| `npm run build` | Production build |
| `npm run lint` | ESLint |

### CLI (`cd cli`)

| Script | Description |
|--------|-------------|
| `npm run dev` | Run CLI via ts-node |
| `npm run build` | Compile to `dist/` |

## Project Structure

```
.
├── src/                          # API server
│   ├── controllers/              #   Request handlers + Zod schemas
│   ├── services/                 #   Business logic
│   ├── repositories/             #   Data access (PostgreSQL, Redis)
│   ├── middleware/                #   Auth, rate-limit, CORS, logging, security headers
│   ├── models/                   #   TypeScript types and DTOs
│   ├── migrations/sql/           #   Versioned SQL migrations
│   ├── config/                   #   Database and Redis config
│   └── server.ts                 #   Entry point
├── web/                          # React SPA
│   └── src/
│       ├── pages/                #   Route-level page components
│       ├── components/           #   Shared UI components
│       └── lib/                  #   API client, auth context
├── cli/                          # Command-line interface
│   └── src/
│       ├── cli.ts                #   Command definitions (Commander.js)
│       ├── api-client.ts         #   HTTP client
│       └── output.ts             #   Table/JSON formatters
├── tests/
│   ├── e2e/                      # Playwright E2E tests
│   │   ├── pages/                #   Page Object Model classes
│   │   └── *.spec.ts             #   Test specs
│   └── cli/                      # CLI unit tests (Vitest)
├── docs/
│   ├── specs/                    # L1 and L2 requirements
│   ├── detailed-designs/         # 8 feature design documents with PlantUML diagrams
│   └── ui-design.pen             # Pencil design file
├── designs/exports/              # Exported screen PNGs (2x)
├── eng/scripts/                  # Engineering helper scripts
├── playwright.config.ts          # E2E test config (3 viewport sizes)
├── vitest.config.ts              # CLI test config
├── tsconfig.json                 # TypeScript config
└── .env.example                  # Environment variable template
```

## Architecture

```
Browser ──► React SPA ──► Express API ──► PostgreSQL
                              │
CLI ────────────────────────►─┤
                              │
                          Redis Cache
```

The API follows a layered architecture:

- **Controllers** parse and validate requests (Zod), delegate to services
- **Services** contain business logic, enforce authorization rules
- **Repositories** handle data access and caching

### Authentication Flow

1. Register with email/password or OAuth (GitHub, Google)
2. Login returns a short-lived access token (15 min) and refresh token (7 days)
3. Refresh tokens rotate on use; all sessions invalidated on password change
4. RBAC roles: `admin`, `member`, `viewer`

### API Endpoints

All endpoints are under `/api/v1/`:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Sign in |
| POST | `/auth/refresh` | Rotate tokens |
| POST | `/auth/logout` | Invalidate session |
| GET | `/skills` | List skills (paginated, filterable) |
| POST | `/skills` | Create skill |
| GET | `/skills/:id` | Get skill by ID |
| PATCH | `/skills/:id` | Update skill |
| DELETE | `/skills/:id` | Soft-delete skill |
| GET | `/skills/:id/versions` | Version history |
| POST | `/skills/:id/versions/:v/restore` | Restore a version |
| GET | `/health` | Dependency health check |
| GET | `/metrics` | Prometheus metrics |

## Testing

E2E tests run against all three viewport sizes defined in `playwright.config.ts`:

| Project | Viewport |
|---------|----------|
| Desktop | 1440 x 900 |
| Tablet | 768 x 1024 |
| Mobile | 375 x 812 |

```bash
# Run all E2E tests (starts API + web servers automatically)
npm run test:e2e

# Run with UI mode
npx playwright test --ui

# Run a single spec
npx playwright test tests/e2e/dashboard.spec.ts
```

Tests use the **Page Object Model** pattern. Page objects live in `tests/e2e/pages/` and encapsulate locators and common actions for each screen.

## Design Documents

Detailed designs exist for eight platform features, each with PlantUML diagrams (C4, class, and sequence views):

| # | Feature | Key Topics |
|---|---------|------------|
| 01 | [Authentication](docs/detailed-designs/01-authentication/README.md) | Registration, login, OAuth, sessions, RBAC, sharing |
| 02 | [Skill CRUD](docs/detailed-designs/02-skill-crud-data-model/README.md) | Skill lifecycle, schema, migrations, soft delete, optimistic concurrency |
| 03 | [API & Security](docs/detailed-designs/03-restful-api-security/README.md) | Middleware pipeline, OpenAPI, rate limiting, OWASP hardening |
| 04 | [Web UI](docs/detailed-designs/04-web-user-interface/README.md) | SPA architecture, dashboard, editor, responsive UX, offline queue |
| 05 | [CLI](docs/detailed-designs/05-command-line-interface/README.md) | Auth flow, command model, output formats, `$EDITOR` workflow |
| 06 | [Search](docs/detailed-designs/06-search-filtering/README.md) | Full-text search, filters, sorting, cache strategy |
| 07 | [Versioning](docs/detailed-designs/07-skill-versioning/README.md) | Version history, diffs, restore semantics |
| 08 | [Observability](docs/detailed-designs/08-observability-resilience/README.md) | Logging, audit trail, metrics, health checks, resilience |

Requirements: [L1 High-Level](docs/specs/L1.md) | [L2 Detailed](docs/specs/L2.md)

## UI Designs

Screen designs for all major views are in the `designs/exports/` directory as 2x PNGs. The source Pencil file is at `docs/ui-design.pen`.

Screens include: Login (3 breakpoints), Dashboard (3 breakpoints), Skill Editor with split-pane preview (3 breakpoints), Version History with diff view (3 breakpoints), Error States (500, network, session expired), CLI output, Sharing dialog, Delete confirmation, and Skeleton loaders.

## License

This project is licensed under the [MIT License](LICENSE).
