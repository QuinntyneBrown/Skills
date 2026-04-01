# Skills

`Skills` is a documentation-first repository for a Claude Skills management platform. The repository currently captures product requirements, system design, feature-level architecture, and supporting PlantUML diagrams for a web UI, REST API, CLI, search, versioning, and observability stack.

## Current Status

This repository is in the specification and design phase.

- High-level and detailed requirements are defined.
- Feature-level design documents exist for the major platform areas.
- PlantUML diagrams are included alongside each feature design.
- There is not yet an application source tree in this repository.

## Planned Platform Scope

The documented system is intended to provide:

- A web UI for authoring and managing skills
- A REST API used by the web UI, CLI, and external integrations
- A cross-platform CLI with functional parity for skill operations
- PostgreSQL-backed persistence with Redis for caching and rate limiting
- Authentication, RBAC, search/filtering, version history, and observability

## Documentation Map

### Core Specifications

- [L1 High-Level Requirements](docs/specs/L1.md)
- [L2 Detailed Requirements](docs/specs/L2.md)

### Detailed Feature Designs

- [01 Authentication](docs/detailed-designs/01-authentication/README.md)
- [02 Skill CRUD and Data Model](docs/detailed-designs/02-skill-crud-data-model/README.md)
- [03 RESTful API and Security](docs/detailed-designs/03-restful-api-security/README.md)
- [04 Web User Interface](docs/detailed-designs/04-web-user-interface/README.md)
- [05 Command-Line Interface](docs/detailed-designs/05-command-line-interface/README.md)
- [06 Search and Filtering](docs/detailed-designs/06-search-filtering/README.md)
- [07 Skill Versioning](docs/detailed-designs/07-skill-versioning/README.md)
- [08 Observability and Resilience](docs/detailed-designs/08-observability-resilience/README.md)

Each feature directory also includes supporting `.puml` diagrams under its local `diagrams/` folder.

## Repository Layout

```text
.
|-- docs/
|   |-- specs/
|   |   |-- L1.md
|   |   `-- L2.md
|   `-- detailed-designs/
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

## Working With The Docs

- Start with `docs/specs/L1.md`, then `docs/specs/L2.md`.
- Read feature designs in numerical order if you want the full system narrative.
- Render `.puml` files with PlantUML to view the C4, class, and sequence diagrams.
- Use `eng/scripts/yolo.bat` if you want to launch the local Claude workflow from the repository root.

## Suggested Reading Order

1. Requirements: `L1` then `L2`
2. Identity and access: Feature `01`
3. Core domain model and CRUD: Feature `02`
4. API and security envelope: Feature `03`
5. User-facing clients: Features `04` and `05`
6. Advanced capabilities: Features `06`, `07`, and `08`
