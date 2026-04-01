# Feature 02: Skill CRUD & Data Model -- Detailed Design

| Field           | Value                                      |
| --------------- | ------------------------------------------ |
| **Feature**     | 02 -- Skill CRUD & Data Model              |
| **Status**      | Draft                                      |
| **Authors**     | Quinntyne Brown                            |
| **Created**     | 2026-04-01                                 |
| **Traceability**| L1-001, L1-002, L2-001 through L2-007      |

---

## 1. Overview

This document describes the design for creating, reading, updating, and deleting Claude skills (Feature 02). It covers the RESTful API endpoints, the service and repository layers, the PostgreSQL data model, and the database migration strategy.

### 1.1 Goals

- Provide a complete CRUD lifecycle for skill resources via a RESTful API.
- Define a normalized, extensible data model that supports tags, configuration parameters, soft delete, optimistic concurrency, and future versioning (Feature 07).
- Guarantee data integrity through constraints, indexes, and ACID-compliant transactions.
- Deliver sub-100ms tag-filtered queries at a scale of 1 million skills.

### 1.2 Non-Goals

- Full-text search ranking and relevance scoring (Feature 06).
- Version history browsing, diff, and restore workflows (Feature 07).
- UI or CLI implementation (Features 04 and 05).

### 1.3 Key Requirements Addressed

| Requirement | Summary |
| ----------- | ------- |
| L2-001 | Create a new skill with validation (name <= 200 chars, body <= 500K chars) |
| L2-002 | Read a single skill by ID with authorization |
| L2-003 | List skills with pagination, sorting, and authorization filtering |
| L2-004 | Update a skill with optimistic concurrency (409 on conflict) |
| L2-005 | Soft delete with admin recovery |
| L2-006 | Schema integrity: unique (owner_id, name), GIN index on tags, FK constraints |
| L2-007 | Versioned, reversible database migrations |

---

## 2. Architecture

### 2.1 System Context (C4 Level 1)

The Skills Management System is used by authenticated users who interact through a web UI, CLI, or direct API calls. The API server persists data in PostgreSQL and uses Redis for caching.

![C4 Context Diagram](diagrams/c4_context.puml)

### 2.2 Container View (C4 Level 2)

The system is composed of four containers:

| Container       | Technology       | Responsibility |
| --------------- | ---------------- | -------------- |
| SPA             | Angular / React  | User-facing web interface |
| API Server      | Node.js / .NET   | Business logic, validation, authorization |
| PostgreSQL      | PostgreSQL 16    | Primary data store |
| Redis Cache     | Redis 7          | Read-through cache for hot skill data |

![C4 Container Diagram](diagrams/c4_container.puml)

### 2.3 Component View (C4 Level 3)

Inside the API Server, the following components handle skill operations:

| Component                | Responsibility |
| ------------------------ | -------------- |
| AuthorizationMiddleware  | Extracts JWT, resolves user role, enforces RBAC policies |
| SkillController          | HTTP routing, request parsing, response serialization |
| SkillService             | Business rules, validation, orchestration |
| SkillRepository          | SQL query construction, database access |
| CacheService             | Read-through caching, cache invalidation on write |

![C4 Component Diagram](diagrams/c4_component.puml)

---

## 3. Component Details

### 3.1 SkillController

**Responsibility:** Accepts HTTP requests, delegates to SkillService, and returns HTTP responses.

**Endpoints handled:**

| Method | Path | Handler |
| ------ | ---- | ------- |
| POST   | `/api/v1/skills` | `create()` |
| GET    | `/api/v1/skills` | `list()` |
| GET    | `/api/v1/skills/{id}` | `getById()` |
| PATCH  | `/api/v1/skills/{id}` | `update()` |
| DELETE | `/api/v1/skills/{id}` | `delete()` |
| POST   | `/api/v1/skills/{id}/restore` | `restore()` |

**Behavior:**
- Validates the incoming request body against a JSON schema before invoking the service.
- Strips unknown fields from the request body (L2-024 AC-1).
- Returns the standard error envelope `{ "error": { "code", "message", "details" } }` on failure.

### 3.2 SkillService

**Responsibility:** Encapsulates business rules and orchestrates repository and cache interactions.

**Key operations:**

| Method | Logic |
| ------ | ----- |
| `createSkill(dto, user)` | Validate required fields, enforce length limits, call repository.insert(), invalidate list cache. |
| `getSkill(id, user)` | Check cache; on miss call repository.findById(), verify authorization, populate cache. |
| `listSkills(query, user)` | Build authorization filter (owner OR shared OR public), delegate to repository.findAll() with pagination. |
| `updateSkill(id, dto, user)` | Verify authorization, verify `version` matches (optimistic lock), call repository.update(), invalidate cache. |
| `deleteSkill(id, user)` | Verify authorization (member-owner or admin), call repository.softDelete(), invalidate cache. |
| `restoreSkill(id, user)` | Verify admin role, call repository.restore(), invalidate cache. |

**Validation rules (L2-001):**
- `name`: required, string, 1-200 characters.
- `body`: required, string, 1-500,000 characters.
- `description`: optional, string, max 2,000 characters.
- `tags`: optional, array of strings, each tag max 50 characters, max 20 tags.
- `visibility`: optional, one of `private`, `shared`, `public`; default `private`.

### 3.3 SkillRepository

**Responsibility:** Executes parameterized SQL against PostgreSQL. Never constructs SQL via string concatenation.

**Key queries:**

- **Insert:** `INSERT INTO skills (...) VALUES ($1, $2, ...) RETURNING *`
- **Find by ID:** `SELECT ... FROM skills WHERE id = $1 AND deleted_at IS NULL`
- **Find all (paginated):** `SELECT ... FROM skills WHERE deleted_at IS NULL AND <auth_filter> ORDER BY updated_at DESC LIMIT $1 OFFSET $2`
- **Update with optimistic lock:** `UPDATE skills SET ... WHERE id = $1 AND version = $2 AND deleted_at IS NULL RETURNING *` -- returns zero rows on conflict, which the service interprets as 409.
- **Soft delete:** `UPDATE skills SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`
- **Restore:** `UPDATE skills SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL`
- **Count:** `SELECT COUNT(*) FROM skills WHERE deleted_at IS NULL AND <auth_filter>`

### 3.4 CacheService

**Responsibility:** Wraps Redis to provide read-through caching with TTL-based expiration and explicit invalidation.

**Cache keys:**
- Single skill: `skill:{id}` -- TTL 5 minutes.
- List queries: `skill:list:{hash(query)}` -- TTL 2 minutes.

**Invalidation strategy:**
- On any write (create, update, delete, restore): delete `skill:{id}` and flush all `skill:list:*` keys.

### 3.5 MigrationRunner

**Responsibility:** Applies and rolls back versioned database migrations.

**Design decisions:**
- Each migration is a pair of files: `YYYYMMDDHHMMSS_description.up.sql` and `YYYYMMDDHHMMSS_description.down.sql`.
- A `schema_migrations` table tracks applied versions.
- Migrations run inside a transaction; if any statement fails, the entire migration rolls back.
- The runner is invoked at application startup (with a `--migrate` flag) or as a standalone CLI command.

---

## 4. Data Model

### 4.1 Entity-Relationship Overview

![Class Diagram](diagrams/class_diagram.puml)

### 4.2 Skill Entity

The `skills` table is the core entity.

| Column        | Type                     | Constraints | Description |
| ------------- | ------------------------ | ----------- | ----------- |
| `id`          | `UUID`                   | PK, DEFAULT gen_random_uuid() | Unique skill identifier |
| `owner_id`    | `UUID`                   | FK -> users(id), NOT NULL | Skill owner |
| `name`        | `VARCHAR(200)`           | NOT NULL | Skill display name |
| `description` | `VARCHAR(2000)`          | NULL | Optional description |
| `body`        | `TEXT`                   | NOT NULL, CHECK(char_length(body) <= 500000) | Prompt/instruction content |
| `visibility`  | `VARCHAR(10)`            | NOT NULL, DEFAULT 'private', CHECK IN ('private','shared','public') | Access visibility |
| `tags`        | `TEXT[]`                 | DEFAULT '{}' | Array of tag strings |
| `version`     | `INTEGER`                | NOT NULL, DEFAULT 1 | Optimistic concurrency version counter |
| `created_at`  | `TIMESTAMPTZ`            | NOT NULL, DEFAULT NOW() | Creation timestamp (UTC) |
| `updated_at`  | `TIMESTAMPTZ`            | NOT NULL, DEFAULT NOW() | Last modification timestamp (UTC) |
| `deleted_at`  | `TIMESTAMPTZ`            | NULL | Soft delete timestamp; NULL means active |
| `created_by`  | `UUID`                   | FK -> users(id), NOT NULL | Author user ID |

### 4.3 SkillVersion Entity

The `skill_versions` table stores historical snapshots. Each update to a skill inserts a row here before modifying the skill. This table is the foundation for Feature 07 (Skill Versioning).

| Column        | Type            | Constraints | Description |
| ------------- | --------------- | ----------- | ----------- |
| `id`          | `UUID`          | PK | Version record identifier |
| `skill_id`    | `UUID`          | FK -> skills(id) ON DELETE CASCADE, NOT NULL | Parent skill |
| `version`     | `INTEGER`       | NOT NULL | Version number at time of snapshot |
| `name`        | `VARCHAR(200)`  | NOT NULL | Skill name at this version |
| `description` | `VARCHAR(2000)` | NULL | Description at this version |
| `body`        | `TEXT`          | NOT NULL | Body content at this version |
| `tags`        | `TEXT[]`        | DEFAULT '{}' | Tags at this version |
| `changed_by`  | `UUID`          | FK -> users(id), NOT NULL | User who made the change |
| `created_at`  | `TIMESTAMPTZ`   | NOT NULL, DEFAULT NOW() | When this version was recorded |

### 4.4 SkillTag Entity (Denormalized View)

Tags are stored as a PostgreSQL `TEXT[]` array on the `skills` table rather than in a separate join table. This design choice optimizes read performance for tag filtering at the cost of some write complexity.

A GIN index on the `tags` column enables sub-100ms queries at 1M rows:

```sql
CREATE INDEX idx_skills_tags ON skills USING GIN (tags);
```

### 4.5 SkillConfig Entity

The `skill_configs` table stores key-value configuration parameters for a skill.

| Column      | Type           | Constraints | Description |
| ----------- | -------------- | ----------- | ----------- |
| `id`        | `UUID`         | PK | Config entry identifier |
| `skill_id`  | `UUID`         | FK -> skills(id) ON DELETE CASCADE, NOT NULL | Parent skill |
| `key`       | `VARCHAR(100)` | NOT NULL | Configuration key |
| `value`     | `TEXT`         | NOT NULL | Configuration value |
| `created_at`| `TIMESTAMPTZ`  | NOT NULL, DEFAULT NOW() | Creation timestamp |
| `updated_at`| `TIMESTAMPTZ`  | NOT NULL, DEFAULT NOW() | Last modification timestamp |

**Unique constraint:** `UNIQUE(skill_id, key)` prevents duplicate config keys per skill.

### 4.6 Constraints and Indexes

| Constraint / Index | Type | Purpose |
| ------------------ | ---- | ------- |
| `uq_skills_owner_name` | UNIQUE (owner_id, name) WHERE deleted_at IS NULL | Prevents duplicate skill names per user (partial unique index excludes soft-deleted rows) |
| `idx_skills_tags` | GIN index on `tags` | Sub-100ms tag filtering at 1M rows (L2-006 AC-2) |
| `idx_skills_owner_id` | B-tree on `owner_id` | Fast lookup of skills by owner |
| `idx_skills_updated_at` | B-tree on `updated_at DESC` | Default sort order optimization |
| `idx_skills_deleted_at` | B-tree on `deleted_at` | Fast filtering of active vs. deleted skills |
| `idx_skill_versions_skill_id` | B-tree on `skill_id, version DESC` | Fast version history lookups |
| `fk_skill_versions_skill_id` | FK -> skills(id) ON DELETE CASCADE | Prevents orphaned version records (L2-006 AC-3) |
| `fk_skills_owner_id` | FK -> users(id) | Referential integrity to users |

### 4.7 Soft Delete Pattern

Soft delete is implemented via the `deleted_at` column:

- **Active records:** `deleted_at IS NULL`.
- **Deleted records:** `deleted_at` is set to the current UTC timestamp.
- All read queries include `WHERE deleted_at IS NULL` by default.
- The unique constraint on `(owner_id, name)` is a partial index (`WHERE deleted_at IS NULL`) so that a user can re-create a skill with the same name after deleting the original.
- Only admins can invoke the restore endpoint, which sets `deleted_at = NULL`.

### 4.8 Optimistic Concurrency

The `version` column on the `skills` table implements optimistic concurrency control:

1. The client reads a skill and receives the current `version` number.
2. When submitting an update, the client includes the `version` in the request body (or `If-Match` header).
3. The repository executes: `UPDATE skills SET ..., version = version + 1 WHERE id = $1 AND version = $2`.
4. If zero rows are updated, another client has modified the skill since it was read. The service returns HTTP 409 Conflict.

This approach avoids pessimistic locks and is well-suited to the expected low-contention workload.

---

## 5. Key Workflows

### 5.1 Create Skill

![Create Skill Sequence](diagrams/sequence_create.puml)

1. Client sends `POST /api/v1/skills` with JWT and request body.
2. AuthorizationMiddleware validates the JWT, extracts user ID and role.
3. SkillController parses and schema-validates the request body.
4. SkillService validates business rules (field lengths, required fields).
5. SkillService calls SkillRepository.insert() inside a transaction.
6. SkillRepository inserts the skill row and an initial SkillVersion row (version 1).
7. SkillService invalidates relevant cache entries.
8. SkillController returns 201 with the created skill resource.

**Error paths:**
- Missing or invalid fields: 400 with field-level error details.
- Duplicate (owner_id, name): 409 with message "A skill with this name already exists."
- Unauthorized: 403 (viewer role cannot create).

### 5.2 Update Skill

![Update Skill Sequence](diagrams/sequence_update.puml)

1. Client sends `PATCH /api/v1/skills/{id}` with JWT, request body, and `version` field.
2. AuthorizationMiddleware validates JWT.
3. SkillController parses request; only mutable fields are accepted.
4. SkillService loads the current skill, checks authorization (owner or admin).
5. SkillService checks that the supplied `version` matches the current `version`.
6. SkillRepository snapshots the current state into `skill_versions`.
7. SkillRepository updates the skill row with `version = version + 1` using `WHERE version = $supplied_version`.
8. If zero rows affected: SkillService returns 409 Conflict.
9. On success: cache invalidation, return 200 with updated skill.

### 5.3 Delete Skill (Soft Delete)

![Delete Skill Sequence](diagrams/sequence_delete.puml)

1. Client sends `DELETE /api/v1/skills/{id}` with JWT.
2. AuthorizationMiddleware validates JWT.
3. SkillService checks authorization (owner or admin).
4. SkillRepository sets `deleted_at = NOW()` on the skill row.
5. Cache invalidation.
6. SkillController returns 204 No Content.

**Restore flow (admin only):**
1. Admin sends `POST /api/v1/skills/{id}/restore`.
2. SkillService verifies admin role.
3. SkillRepository sets `deleted_at = NULL`.
4. Returns 200 with the restored skill.

### 5.4 List Skills (Paginated with Authorization)

![List Skills Sequence](diagrams/sequence_list.puml)

1. Client sends `GET /api/v1/skills?page=1&page_size=25` with JWT.
2. AuthorizationMiddleware validates JWT, resolves user role.
3. SkillService builds the authorization filter:
   - **Admin:** no ownership filter (sees all non-deleted skills).
   - **Member:** `owner_id = $user_id OR visibility = 'public' OR (visibility = 'shared' AND skill is shared with user)`.
   - **Viewer:** `visibility = 'public' OR (visibility = 'shared' AND skill is shared with user)`.
4. SkillRepository executes a COUNT query and a paginated SELECT with the filter.
5. SkillController returns 200 with the result envelope:
   ```json
   {
     "data": [...],
     "pagination": {
       "page": 1,
       "page_size": 25,
       "total_count": 142,
       "total_pages": 6
     }
   }
   ```

---

## 6. API Contracts

### 6.1 POST /api/v1/skills

**Description:** Create a new skill.

**Request:**
```http
POST /api/v1/skills
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "name": "Code Review Helper",
  "description": "Assists with code review by identifying common issues.",
  "body": "You are a code review assistant. When given a code snippet...",
  "tags": ["code-review", "productivity"],
  "visibility": "private",
  "config": {
    "temperature": "0.7",
    "max_tokens": "4096"
  }
}
```

**Required fields:** `name`, `body`

**Response (201 Created):**
```json
{
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "owner_id": "u9876543-21ab-cdef-0123-456789abcdef",
    "name": "Code Review Helper",
    "description": "Assists with code review by identifying common issues.",
    "body": "You are a code review assistant. When given a code snippet...",
    "tags": ["code-review", "productivity"],
    "visibility": "private",
    "version": 1,
    "config": {
      "temperature": "0.7",
      "max_tokens": "4096"
    },
    "created_at": "2026-04-01T12:00:00Z",
    "updated_at": "2026-04-01T12:00:00Z",
    "created_by": "u9876543-21ab-cdef-0123-456789abcdef"
  }
}
```

**Error responses:**
| Status | Code | Condition |
| ------ | ---- | --------- |
| 400 | VALIDATION_ERROR | Missing required field or field exceeds length limit |
| 403 | FORBIDDEN | User role does not permit skill creation (viewer) |
| 409 | CONFLICT | Skill with same name already exists for this owner |

### 6.2 GET /api/v1/skills

**Description:** List skills the authenticated user is authorized to view.

**Query parameters:**

| Parameter   | Type    | Default | Description |
| ----------- | ------- | ------- | ----------- |
| `page`      | integer | 1       | Page number (1-based) |
| `page_size` | integer | 25      | Items per page (max 100) |
| `sort`      | string  | `updated_at` | Sort field |
| `order`     | string  | `desc`  | Sort direction (`asc` or `desc`) |
| `tags`      | string  | --      | Comma-separated tag filter (AND logic) |

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "owner_id": "u9876543-21ab-cdef-0123-456789abcdef",
      "name": "Code Review Helper",
      "description": "Assists with code review by identifying common issues.",
      "tags": ["code-review", "productivity"],
      "visibility": "private",
      "version": 3,
      "created_at": "2026-04-01T12:00:00Z",
      "updated_at": "2026-04-01T14:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 25,
    "total_count": 142,
    "total_pages": 6
  }
}
```

Note: The `body` field is excluded from list responses to reduce payload size. Clients must fetch individual skills via GET `/api/v1/skills/{id}` for the full body.

### 6.3 GET /api/v1/skills/{id}

**Description:** Retrieve a single skill by ID.

**Response (200 OK):**
```json
{
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "owner_id": "u9876543-21ab-cdef-0123-456789abcdef",
    "name": "Code Review Helper",
    "description": "Assists with code review by identifying common issues.",
    "body": "You are a code review assistant. When given a code snippet...",
    "tags": ["code-review", "productivity"],
    "visibility": "private",
    "version": 3,
    "config": {
      "temperature": "0.7",
      "max_tokens": "4096"
    },
    "created_at": "2026-04-01T12:00:00Z",
    "updated_at": "2026-04-01T14:30:00Z",
    "created_by": "u9876543-21ab-cdef-0123-456789abcdef"
  }
}
```

**Error responses:**
| Status | Code | Condition |
| ------ | ---- | --------- |
| 403 | FORBIDDEN | User not authorized to view this skill |
| 404 | NOT_FOUND | Skill ID does not exist or is soft-deleted |

### 6.4 PATCH /api/v1/skills/{id}

**Description:** Update mutable fields of a skill. Requires the current `version` for optimistic concurrency.

**Request:**
```http
PATCH /api/v1/skills/a1b2c3d4-e5f6-7890-abcd-ef1234567890
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "name": "Advanced Code Review Helper",
  "tags": ["code-review", "productivity", "advanced"],
  "version": 3
}
```

**Mutable fields:** `name`, `description`, `body`, `tags`, `visibility`, `config`

The `version` field is required. Only fields present in the request body are updated; omitted fields remain unchanged.

**Response (200 OK):**
```json
{
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Advanced Code Review Helper",
    "tags": ["code-review", "productivity", "advanced"],
    "version": 4,
    "updated_at": "2026-04-01T15:00:00Z"
  }
}
```

**Error responses:**
| Status | Code | Condition |
| ------ | ---- | --------- |
| 400 | VALIDATION_ERROR | Invalid field value (empty name, body exceeds limit) |
| 403 | FORBIDDEN | User not authorized to update this skill |
| 404 | NOT_FOUND | Skill ID does not exist or is soft-deleted |
| 409 | CONFLICT | Supplied `version` does not match current version |

### 6.5 DELETE /api/v1/skills/{id}

**Description:** Soft-delete a skill.

**Response (204 No Content):** Empty body.

**Error responses:**
| Status | Code | Condition |
| ------ | ---- | --------- |
| 403 | FORBIDDEN | User not authorized to delete this skill |
| 404 | NOT_FOUND | Skill ID does not exist or is already soft-deleted |

### 6.6 POST /api/v1/skills/{id}/restore

**Description:** Restore a soft-deleted skill. Admin only.

**Response (200 OK):**
```json
{
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Code Review Helper",
    "deleted_at": null,
    "version": 3
  }
}
```

**Error responses:**
| Status | Code | Condition |
| ------ | ---- | --------- |
| 403 | FORBIDDEN | User is not an admin |
| 404 | NOT_FOUND | Skill ID does not exist or is not currently deleted |

---

## 7. Security Considerations

### 7.1 Input Validation

- All input validation is performed server-side in the SkillService, regardless of any client-side validation.
- Field length limits are enforced both at the application layer (service validation) and the database layer (CHECK constraints).
- Unknown fields in the request body are stripped before processing (L2-024 AC-1).
- HTML and script tags in text fields are sanitized before storage (L2-024 AC-2).

### 7.2 Authorization Checks

Every operation performs authorization checks in the following order:

1. **Authentication:** JWT is validated by AuthorizationMiddleware. Invalid or expired tokens return 401.
2. **Role check:** The user's role is checked against the required role for the operation.
3. **Ownership check:** For member-role operations, the service verifies the user owns the resource or has been granted access via sharing.

The authorization filter on list queries ensures users never see skills they are not authorized to view -- the filter is applied at the SQL level, not as a post-query filter.

### 7.3 SQL Injection Prevention

- All database queries use parameterized statements (`$1`, `$2`, etc.).
- The SkillRepository never constructs SQL via string concatenation.
- Sort column and direction values are validated against an allowlist before being used in query construction.

### 7.4 Rate Limiting

Skill CRUD endpoints are subject to the global rate limits defined in L2-020:
- Authenticated users: 100 requests/minute.
- Unauthenticated requests: 20 requests/minute per IP.

### 7.5 Audit Trail

All mutating operations (create, update, delete, restore) generate audit log entries per L2-022, including the user ID, action, resource ID, timestamp, and a before/after change summary for updates.

---

## 8. Open Questions

| # | Question | Impact | Status |
| - | -------- | ------ | ------ |
| 1 | Should the `body` field be stored in a separate table to optimize list queries that do not need it? | Performance at scale. List queries already exclude `body`, but the column is still stored in the same page. | Open |
| 2 | Should tag values be normalized to lowercase on write, or preserved as-is? | Search consistency vs. user intent. | Open |
| 3 | What is the maximum number of skills a single user can create? Should there be a quota? | Resource management and abuse prevention. | Open |
| 4 | Should the `config` key-value pairs support typed values (integer, boolean, JSON) or remain text-only? | Feature richness vs. complexity. | Open |
| 5 | Should the restore endpoint be auditable by requiring a `reason` field in the request body? | Audit completeness. | Open |
| 6 | What is the retention policy for soft-deleted skills? Should they be hard-deleted after a configurable period? | Storage management. | Open |
