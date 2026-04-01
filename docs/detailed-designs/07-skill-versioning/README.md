# Feature 07: Skill Versioning

## 1. Overview

This feature provides complete revision history for skills. Every update to a skill automatically creates a version record capturing the full state of the skill at that point in time. Users can browse version history, view the content of any past version, compare two versions with a structured diff, and restore a previous version.

### Actors

| Actor | Description |
|-------|-------------|
| **Member** | Authenticated user who owns the skill or has write-share access. Can update skills (triggering version creation) and restore previous versions. |
| **Viewer** | Authenticated user with read access (owner, shared, or public). Can view version history and diffs but cannot restore. |
| **Admin** | Full access to all skill version history, diffs, and restore operations. |

### Capabilities Summary

- Automatic version record creation on every skill update
- Paginated version history in reverse chronological order
- Full content retrieval for any historical version
- Structured line-level diff computation between any two versions
- Restore a previous version (creates a new version, never overwrites history)
- Restore actions recorded in the audit log (Feature 08)

---

## 2. Architecture

### 2.1 System Context

Users interact with the Claude Skills System to manage skills and their version history. The system stores all version data in PostgreSQL.

![C4 Context Diagram](diagrams/c4_context.puml)

> Render `diagrams/c4_context.puml` with any PlantUML renderer.

### 2.2 Container View

The API Server handles version-related requests, reads and writes version records in PostgreSQL, and uses Redis to cache frequently accessed version metadata.

![C4 Container Diagram](diagrams/c4_container.puml)

### 2.3 Component View (API Server)

Inside the API server, versioning is handled by four components working together:

![C4 Component Diagram](diagrams/c4_component.puml)

| Component | Responsibility |
|-----------|---------------|
| `VersionController` | HTTP layer: receives version-related requests, validates input, delegates to services. |
| `VersionService` | Orchestrates version creation, retrieval, diff computation, and restore workflows. |
| `VersionRepository` | Data access for the `skill_versions` table. Handles pagination and ordering. |
| `DiffEngine` | Computes structured line-level diffs between two version snapshots. Returns added, removed, and changed lines. |

---

## 3. Component Details

### 3.1 VersionController

**Location:** `src/controllers/version.controller.ts`

**Endpoints handled:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/skills/{id}/versions` | List version history (paginated, reverse chronological) |
| GET | `/api/v1/skills/{id}/versions/{version}` | Get full content of a specific version |
| GET | `/api/v1/skills/{id}/versions/{v1}/diff/{v2}` | Compute structured diff between two versions |
| POST | `/api/v1/skills/{id}/versions/{version}/restore` | Restore a previous version |

**Dependencies:** `VersionService`, `RoleService` (from Feature 01)

### 3.2 VersionService

**Location:** `src/services/version.service.ts`

**Responsibilities:**
- Create a new version record when a skill is updated (called by `SkillService` during update)
- Retrieve paginated version history for a skill
- Retrieve full content of a specific version
- Delegate diff computation to `DiffEngine`
- Orchestrate restore: load target version content, create a new skill update (which triggers a new version), record restore action in the audit log

**Dependencies:** `VersionRepository`, `DiffEngine`, `SkillRepository` (from Feature 02), `AuditService` (from Feature 08)

### 3.3 VersionRepository

**Location:** `src/repositories/version.repository.ts`

**Responsibilities:**
- Insert new version records
- Query versions by `skill_id` with cursor-based or offset pagination, ordered by `version_number DESC`
- Fetch a single version by `skill_id` and `version_number`
- Fetch two versions in a single query for diff operations

**Dependencies:** PostgreSQL (via query builder / ORM)

### 3.4 DiffEngine

**Location:** `src/services/diff-engine.ts`

**Responsibilities:**
- Accept two version snapshots (primarily the `body` field, but also supports diffing `name`, `description`, `tags`, and `config`)
- Compute a structured line-level diff using the Myers diff algorithm
- Return a `DiffResult` containing an array of `DiffLine` objects, each marked as `added`, `removed`, or `unchanged`
- Support both unified and side-by-side output formats for the web UI

**Dependencies:** None (pure computation, no I/O). May use a library such as `diff` (npm) internally.

---

## 4. Data Model

![Class Diagram](diagrams/class_diagram.puml)

### 4.1 Tables

#### `skill_versions`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK, default `gen_random_uuid()` |
| `skill_id` | UUID | FK -> `skills.id`, NOT NULL |
| `version_number` | INTEGER | NOT NULL. Auto-incrementing per skill (1, 2, 3, ...) |
| `name` | VARCHAR(255) | NOT NULL |
| `description` | TEXT | NULL |
| `body` | TEXT | NOT NULL. The full skill content at this version. |
| `tags` | JSONB | DEFAULT `'[]'::jsonb` |
| `config` | JSONB | DEFAULT `'{}'::jsonb` |
| `created_by` | UUID | FK -> `users.id`, NOT NULL. The user who made this change. |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |
| | | UNIQUE(`skill_id`, `version_number`) |

#### Relationship to `skills`

The `skills` table (defined in Feature 02) has a `version` column used for optimistic concurrency control. This `version` column is incremented on every update and corresponds to the `version_number` in `skill_versions`. When a skill is updated:

1. The `skills.version` is incremented.
2. A new row is inserted into `skill_versions` with `version_number` equal to the new `skills.version` value.

This means the current state of a skill is always in the `skills` table, while `skill_versions` contains the complete history including the current state.

### 4.2 Indexes

- `skill_versions(skill_id, version_number DESC)` -- primary query path for version history listing
- `skill_versions(skill_id, created_at DESC)` -- supports time-based queries
- `skill_versions(created_by)` -- supports querying versions by author

---

## 5. Key Workflows

### 5.1 Version Creation on Skill Update

![Version Create Sequence](diagrams/sequence_version_create.puml)

1. User sends `PUT /api/v1/skills/{id}` with updated skill content and the current `version` for optimistic concurrency.
2. `SkillController` delegates to `SkillService.update()`.
3. `SkillService` verifies the `version` matches the current `skills.version` (optimistic lock check). If mismatched, returns `409 Conflict`.
4. `SkillService` increments `skills.version` and updates the skill row.
5. `SkillService` calls `VersionService.createVersion()` with the new skill state.
6. `VersionService` calls `VersionRepository.insert()` to create a `skill_versions` row with `version_number = new version`, the full skill content, the acting user, and the current timestamp.
7. Both the skill update and version insert occur within the same database transaction.
8. API returns `200 OK` with the updated skill including the new `version`.

### 5.2 List Version History

1. User sends `GET /api/v1/skills/{id}/versions?page=1&limit=20`.
2. `VersionController` validates the skill exists and the user has read access.
3. `VersionController` delegates to `VersionService.listVersions()`.
4. `VersionService` calls `VersionRepository.findBySkillId()` with pagination parameters.
5. `VersionRepository` queries `skill_versions` ordered by `version_number DESC` with `LIMIT` and `OFFSET`.
6. API returns `200 OK` with a paginated list of version summaries (version_number, created_by, created_at) and pagination metadata.

### 5.3 View Specific Version

1. User sends `GET /api/v1/skills/{id}/versions/{version}`.
2. `VersionController` validates the skill exists and the user has read access.
3. `VersionController` delegates to `VersionService.getVersion()`.
4. `VersionService` calls `VersionRepository.findBySkillIdAndVersion()`.
5. API returns `200 OK` with the full version content (name, description, body, tags, config, created_by, created_at).

### 5.4 Compute Diff Between Versions

![Diff Sequence](diagrams/sequence_diff.puml)

1. User sends `GET /api/v1/skills/{id}/versions/{v1}/diff/{v2}`.
2. `VersionController` validates both version numbers and that the user has read access.
3. `VersionController` delegates to `VersionService.diffVersions()`.
4. `VersionService` calls `VersionRepository.findBySkillIdAndVersions(skillId, v1, v2)` to load both versions in a single query.
5. If either version is not found, returns `404 Not Found`.
6. `VersionService` passes the two version snapshots to `DiffEngine.compute()`.
7. `DiffEngine` splits the `body` field of each version into lines and runs the Myers diff algorithm.
8. `DiffEngine` returns a `DiffResult` containing metadata (version numbers, timestamps) and an array of `DiffLine` objects.
9. API returns `200 OK` with the structured diff.

### 5.5 Restore a Previous Version

![Restore Sequence](diagrams/sequence_restore.puml)

1. User sends `POST /api/v1/skills/{id}/versions/{version}/restore`.
2. `VersionController` validates the user has write access to the skill.
3. `VersionController` delegates to `VersionService.restoreVersion()`.
4. `VersionService` loads the target version from `VersionRepository`.
5. If the version is not found, returns `404 Not Found`.
6. `VersionService` calls `SkillService.update()` with the content from the target version (name, description, body, tags, config). This triggers the standard update flow including optimistic concurrency, skill row update, and new version creation (see 5.1).
7. The newly created version record captures the restored content. The version number advances forward (restore never overwrites).
8. `VersionService` calls `AuditService.log()` with action `skill.version.restored`, the skill ID, the source version number, the new version number, and the acting user.
9. API returns `200 OK` with the updated skill including the new version number.

---

## 6. API Contracts

All endpoints are prefixed with `/api/v1`. All require `Authorization: Bearer {accessToken}`.

### 6.1 GET `/skills/{id}/versions`

List version history for a skill (paginated, reverse chronological).

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-based) |
| `limit` | integer | 20 | Items per page (max 100) |

**Responses:**

| Status | Body | Notes |
|--------|------|-------|
| 200 | See below | Paginated version list |
| 401 | `{ "error": "UNAUTHORIZED" }` | Missing or invalid token |
| 403 | `{ "error": "FORBIDDEN" }` | No read access to this skill |
| 404 | `{ "error": "SKILL_NOT_FOUND" }` | Skill does not exist |

**200 Response body:**
```json
{
  "data": [
    {
      "versionNumber": 5,
      "createdBy": {
        "id": "uuid",
        "email": "user@example.com"
      },
      "createdAt": "2026-03-15T10:30:00Z"
    },
    {
      "versionNumber": 4,
      "createdBy": {
        "id": "uuid",
        "email": "user@example.com"
      },
      "createdAt": "2026-03-14T08:15:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 5,
    "totalPages": 1
  }
}
```

### 6.2 GET `/skills/{id}/versions/{version}`

Get full content of a specific version.

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Skill ID |
| `version` | integer | Version number |

**Responses:**

| Status | Body | Notes |
|--------|------|-------|
| 200 | See below | Full version content |
| 401 | `{ "error": "UNAUTHORIZED" }` | |
| 403 | `{ "error": "FORBIDDEN" }` | |
| 404 | `{ "error": "VERSION_NOT_FOUND" }` | Skill or version does not exist |

**200 Response body:**
```json
{
  "id": "uuid",
  "skillId": "uuid",
  "versionNumber": 3,
  "name": "My Skill",
  "description": "A skill that does something useful.",
  "body": "Full skill content at this version...",
  "tags": ["typescript", "testing"],
  "config": { "model": "claude-3", "temperature": 0.7 },
  "createdBy": {
    "id": "uuid",
    "email": "user@example.com"
  },
  "createdAt": "2026-03-10T14:20:00Z"
}
```

### 6.3 GET `/skills/{id}/versions/{v1}/diff/{v2}`

Compute a structured diff between two versions.

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Skill ID |
| `v1` | integer | First version number (typically the older version) |
| `v2` | integer | Second version number (typically the newer version) |

**Responses:**

| Status | Body | Notes |
|--------|------|-------|
| 200 | See below | Structured diff |
| 401 | `{ "error": "UNAUTHORIZED" }` | |
| 403 | `{ "error": "FORBIDDEN" }` | |
| 404 | `{ "error": "VERSION_NOT_FOUND" }` | One or both versions do not exist |

**200 Response body:**
```json
{
  "skillId": "uuid",
  "fromVersion": 2,
  "toVersion": 4,
  "fromCreatedAt": "2026-03-08T09:00:00Z",
  "toCreatedAt": "2026-03-14T08:15:00Z",
  "diffs": {
    "name": {
      "changed": false
    },
    "description": {
      "changed": true,
      "lines": [
        { "type": "unchanged", "lineNumber": 1, "content": "A skill that does" },
        { "type": "removed", "lineNumber": 2, "content": "something basic." },
        { "type": "added", "lineNumber": 2, "content": "something useful and advanced." }
      ]
    },
    "body": {
      "changed": true,
      "lines": [
        { "type": "unchanged", "lineNumber": 1, "content": "function execute() {" },
        { "type": "removed", "lineNumber": 2, "content": "  return 'hello';" },
        { "type": "added", "lineNumber": 2, "content": "  const result = compute();" },
        { "type": "added", "lineNumber": 3, "content": "  return result;" },
        { "type": "unchanged", "lineNumber": 4, "content": "}" }
      ]
    },
    "tags": {
      "changed": true,
      "from": ["typescript"],
      "to": ["typescript", "testing"]
    },
    "config": {
      "changed": false
    }
  },
  "stats": {
    "additions": 3,
    "deletions": 1,
    "totalChangedLines": 4
  }
}
```

### 6.4 POST `/skills/{id}/versions/{version}/restore`

Restore a previous version. Creates a new version with the content from the specified version.

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Skill ID |
| `version` | integer | Version number to restore |

**Responses:**

| Status | Body | Notes |
|--------|------|-------|
| 200 | See below | Skill restored; new version created |
| 401 | `{ "error": "UNAUTHORIZED" }` | |
| 403 | `{ "error": "FORBIDDEN" }` | Caller lacks write access |
| 404 | `{ "error": "VERSION_NOT_FOUND" }` | Skill or version does not exist |
| 409 | `{ "error": "CONFLICT" }` | Optimistic lock conflict during restore |

**200 Response body:**
```json
{
  "id": "uuid",
  "name": "My Skill",
  "description": "A skill that does something basic.",
  "body": "Restored skill content...",
  "tags": ["typescript"],
  "config": { "model": "claude-3", "temperature": 0.7 },
  "version": 6,
  "restoredFromVersion": 2,
  "updatedAt": "2026-03-20T16:00:00Z"
}
```

---

## 7. Security Considerations

### 7.1 Authorization

Version history endpoints follow the same access control as the parent skill:

- **Read operations** (list versions, view version, compute diff): require read access to the skill (owner, admin, or user with a read/write share).
- **Write operations** (restore): require write access to the skill (owner, admin, or user with a write share).

The `RoleService` and `RbacMiddleware` from Feature 01 are reused for all authorization checks.

### 7.2 Storage Growth Management

Full snapshots are stored for every version, which means storage grows linearly with the number of updates. Mitigation strategies:

- **Pagination:** Version list endpoints are paginated (default 20, max 100) to prevent large payloads.
- **Monitoring:** Track total `skill_versions` row count and storage size per skill via the observability stack (Feature 08). Alert when a single skill exceeds a configurable threshold (e.g., 500 versions).
- **Future retention policy:** An optional background job could archive or purge versions older than a configurable threshold (e.g., keep all versions for 1 year, then keep only every 10th version). This is not in scope for the initial implementation but the schema supports it.
- **Database-level compression:** PostgreSQL TOAST compression handles large `body` and `config` values transparently.

### 7.3 Data Integrity

- Version creation and skill update occur in the same database transaction. If either fails, both are rolled back.
- The `UNIQUE(skill_id, version_number)` constraint prevents duplicate version numbers.
- Restore operations go through the standard skill update path, preserving optimistic concurrency guarantees.

### 7.4 Diff Computation Safety

- `DiffEngine` operates on in-memory strings. For extremely large skill bodies, a configurable size limit (e.g., 1 MB per version body) prevents excessive memory use during diff computation.
- Diff endpoints are read-only and do not modify any data.

---

## 8. Open Questions

| # | Question | Context |
|---|----------|---------|
| 1 | **Full snapshot vs. delta storage?** | The current design stores full snapshots of every version for simplicity and fast retrieval. Delta storage (storing only diffs from the previous version) would reduce storage but adds complexity to reconstruction and makes direct version retrieval slower. Recommendation: start with full snapshots and revisit if storage becomes a concern. |
| 2 | **Maximum versions to retain per skill?** | Should there be a hard cap on the number of versions retained (e.g., 1000)? Or should retention be time-based (e.g., keep all for 1 year)? The current design has no cap. |
| 3 | **Should version list include a summary of changes?** | The version list currently returns only metadata (version number, author, timestamp). Adding a short change summary (e.g., "3 lines added, 1 removed") would require computing diffs at list time or storing pre-computed stats. |
| 4 | **Should diff support cross-skill comparison?** | The current design only supports diffing two versions of the same skill. Cross-skill diff (e.g., comparing a forked skill to its origin) may be valuable but is out of scope. |
| 5 | **Should restore require a confirmation step?** | The API currently restores immediately on `POST`. A two-step flow (preview then confirm) could prevent accidental restores but adds complexity. |
| 6 | **Cursor-based vs. offset pagination?** | The current design uses offset pagination for simplicity. Cursor-based pagination (keyset on `version_number`) would be more performant for skills with thousands of versions. |
