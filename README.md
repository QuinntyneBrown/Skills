# Skills

`Skills` is a documentation-first repository for a proposed Claude Skills management platform. It captures product requirements, feature-level architecture, UI design, and supporting diagrams for a system that includes a web application, REST API, CLI, persistence layer, search, versioning, and observability.

## Status

This repository is currently in the requirements and design phase.

- Core requirements are defined in L1 and L2 specification documents.
- Detailed designs exist for eight major platform features.
- Most design packages include PlantUML diagrams for C4, class, and sequence views.
- A Pencil design file is included for the UI.
- There is no implementation source tree in this repository yet.

## Proposed System At A Glance

| Area | Planned Design |
|------|----------------|
| Web UI | React SPA with dark mode, Monaco editor, responsive layouts, and offline-safe editing flows |
| API | Versioned REST API under `/api/v1` with OpenAPI documentation |
| Auth | Email/password, OAuth, JWT access tokens, refresh tokens, and RBAC |
| Data | PostgreSQL for skills, versions, users, shares, and audit records |
| Performance | Redis-backed caching, rate limiting, and connection-pooling support |
| CLI | Cross-platform `skills` CLI with login, CRUD operations, and `$EDITOR` integration |
| Search | PostgreSQL full-text search with tag/date/author filtering |
| Reliability | Structured logs, audit logs, metrics, health checks, and resilience patterns |

## Start Here

- [L1 High-Level Requirements](docs/specs/L1.md)
- [L2 Detailed Requirements](docs/specs/L2.md)
- [Detailed Design Index](docs/detailed-designs/00-index.md)
- [UI Design](docs/ui-design.pen) for the visual direction of the application UI

## Feature Documents

| # | Feature | Focus |
|---|---------|-------|
| 01 | [Authentication](docs/detailed-designs/01-authentication/README.md) | Registration, login, OAuth, sessions, RBAC, sharing |
| 02 | [Skill CRUD and Data Model](docs/detailed-designs/02-skill-crud-data-model/README.md) | Skill lifecycle, schema, migrations, soft delete, optimistic concurrency |
| 03 | [RESTful API and Security](docs/detailed-designs/03-restful-api-security/README.md) | API shape, middleware pipeline, OpenAPI, rate limiting, hardening |
| 04 | [Web User Interface](docs/detailed-designs/04-web-user-interface/README.md) | SPA architecture, dashboard, editor, responsive UX, offline queue |
| 05 | [Command-Line Interface](docs/detailed-designs/05-command-line-interface/README.md) | CLI auth, command model, output formats, editor workflow |
| 06 | [Search and Filtering](docs/detailed-designs/06-search-filtering/README.md) | Full-text search, filters, sorting, cache strategy |
| 07 | [Skill Versioning](docs/detailed-designs/07-skill-versioning/README.md) | Version history, diffs, restore semantics |
| 08 | [Observability and Resilience](docs/detailed-designs/08-observability-resilience/README.md) | Logging, audit trail, metrics, health, caching, error handling |

Each feature folder also contains related `.puml` diagrams under its local `diagrams/` directory.

## Recommended Reading Paths

### Full System

1. Read [L1](docs/specs/L1.md) and [L2](docs/specs/L2.md)
2. Review the [Detailed Design Index](docs/detailed-designs/00-index.md)
3. Read features `01` through `08` in order

### Backend And API

1. [Authentication](docs/detailed-designs/01-authentication/README.md)
2. [Skill CRUD and Data Model](docs/detailed-designs/02-skill-crud-data-model/README.md)
3. [RESTful API and Security](docs/detailed-designs/03-restful-api-security/README.md)
4. [Search and Filtering](docs/detailed-designs/06-search-filtering/README.md)
5. [Skill Versioning](docs/detailed-designs/07-skill-versioning/README.md)
6. [Observability and Resilience](docs/detailed-designs/08-observability-resilience/README.md)

### Product And Client Experience

1. [UI Design](docs/ui-design.pen)
2. [Web User Interface](docs/detailed-designs/04-web-user-interface/README.md)
3. [Command-Line Interface](docs/detailed-designs/05-command-line-interface/README.md)

## Repository Layout

```text
.
|-- README.md
|-- docs/
|   |-- specs/
|   |   |-- L1.md
|   |   `-- L2.md
|   |-- ui-design.pen
|   `-- detailed-designs/
|       |-- 00-index.md
|       |-- 01-authentication/
|       |-- 02-skill-crud-data-model/
|       |-- 03-restful-api-security/
|       |-- 04-web-user-interface/
|       |-- 05-command-line-interface/
|       |-- 06-search-filtering/
|       |-- 07-skill-versioning/
|       `-- 08-observability-resilience/
`-- eng/
    `-- scripts/
```

## Working With The Artifacts

- Read the spec documents first before drilling into feature-level designs.
- Open `docs/ui-design.pen` with Pencil if you want the source design file.
- Render `.puml` files with PlantUML to view architecture and workflow diagrams.
- Use `eng/scripts/yolo.bat` to launch the local Claude workflow from the repository root if that is part of your authoring process.

## Notes

- The design documents are written as implementation-ready specifications, but they are still drafts.
- Some feature documents include open questions and alternative design options that remain unresolved.
- If this repository later grows an implementation, this README should be updated to separate design artifacts from runnable code and setup instructions.
