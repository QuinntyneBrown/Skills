# Feature 06: Search & Filtering — Detailed Design

| Field          | Value                                      |
| -------------- | ------------------------------------------ |
| Feature        | 06 — Search & Filtering                    |
| Requirements   | L1-012, L2-035, L2-036                     |
| Author         | Quinntyne Brown                            |
| Status         | Draft                                      |
| Last Updated   | 2026-04-01                                 |

---

## 1. Overview

This document describes the design for full-text search and filtering capabilities within the Skills management application. Users must be able to search across skill name, description, and body text by keyword, filter results by tags, author, creation date, and status, and sort by any field — all while respecting RBAC authorization and performing within P95 < 500 ms at 100K skills.

The design leverages PostgreSQL's built-in full-text search (`tsvector`/`tsquery`) with GIN indexes, a Redis query-result cache, and a layered component architecture that separates query parsing, filter construction, index maintenance, and caching concerns.

### Goals

- Full-text search ranked by relevance with highlighted snippets.
- Tag filtering with AND logic, date-range filtering, and arbitrary field sorting.
- URL query-string driven filtering in the web UI for bookmark-ability.
- P95 < 500 ms at 100K skills.
- RBAC-aware result sets — users only see skills they are authorized to view.

### Non-Goals

- Elasticsearch integration (evaluated as a future scale-out option; see Open Questions).
- Faceted search / aggregation counts in the initial release.
- Fuzzy / typo-tolerant search (may be added later with `pg_trgm`).

---

## 2. Architecture

Architecture diagrams follow the C4 model. PlantUML sources are in `./diagrams/`.

### 2.1 Context (C4 Level 1)

![C4 Context](diagrams/c4_context.puml)

The Skills System exposes a search API consumed by authenticated users through the Web UI or CLI. PostgreSQL provides storage and full-text search indexing. Redis caches frequently executed queries.

### 2.2 Container (C4 Level 2)

![C4 Container](diagrams/c4_container.puml)

| Container           | Technology              | Responsibility                                  |
| ------------------- | ----------------------- | ----------------------------------------------- |
| API Server          | Node.js / Express       | Hosts search endpoints, orchestrates components |
| PostgreSQL          | PostgreSQL 16+          | Stores skills, maintains tsvector index, executes FTS queries |
| Redis               | Redis 7+               | Caches serialized search results keyed by normalized query hash |

### 2.3 Component (C4 Level 3)

![C4 Component](diagrams/c4_component.puml)

| Component       | Responsibility                                                                 |
| --------------- | ------------------------------------------------------------------------------ |
| SearchController | Accepts HTTP requests, delegates to SearchService, returns JSON responses     |
| SearchService    | Orchestrates cache lookup, query parsing, filter building, DB execution        |
| QueryParser      | Validates, sanitizes, and transforms raw search input into a safe tsquery     |
| FilterBuilder    | Constructs SQL WHERE clauses from tag, date-range, status, and author filters |
| SearchIndexer    | Maintains the tsvector column via triggers and on-demand reindex              |
| SearchCache      | Read-through cache backed by Redis; handles serialization and TTL             |

---

## 3. Component Details

### 3.1 SearchController

**Location:** `src/controllers/SearchController`

Responsibilities:
- Binds to `GET /api/v1/skills` when search/filter query parameters are present.
- Extracts and validates query parameters (`q`, `tags`, `created_after`, `created_before`, `sort`, `order`, `page`, `page_size`, `author`, `status`).
- Returns 400 for malformed parameters.
- Delegates to `SearchService.search(criteria)`.
- Serializes `SearchResult[]` into the JSON response envelope.

### 3.2 SearchService

**Location:** `src/services/SearchService`

Responsibilities:
- Receives `FilterCriteria` from the controller.
- Computes a cache key by hashing the normalized criteria (including the requesting user's role/permissions for RBAC).
- Checks `SearchCache` first; on miss, builds and executes the query.
- Calls `QueryParser.parse(rawQuery)` to produce a sanitized `tsquery` string.
- Calls `FilterBuilder.build(criteria)` to produce parameterized WHERE clauses.
- Executes the combined SQL against PostgreSQL.
- Populates the cache on miss.
- Returns `SearchResult` including items, total count, pagination metadata, and highlights.

### 3.3 QueryParser

**Location:** `src/services/QueryParser`

Responsibilities:
- Strips dangerous characters and SQL injection vectors.
- Tokenizes multi-word input into individual lexemes.
- Converts tokens to a PostgreSQL `tsquery` using `plainto_tsquery('english', ...)` or `websearch_to_tsquery('english', ...)` for advanced syntax.
- Enforces a maximum query length (256 characters) and maximum token count (20 tokens) to prevent expensive queries.
- Returns `null` for empty or whitespace-only input (signals "no text search, filters only").

### 3.4 FilterBuilder

**Location:** `src/services/FilterBuilder`

Responsibilities:
- Accepts a `FilterCriteria` object.
- Produces parameterized SQL WHERE clause fragments and an accompanying parameter array.
- Tag filtering: `tags @> ARRAY[$1, $2]::text[]` (AND semantics via the PostgreSQL array contains operator, backed by the GIN index on `tags`).
- Date range: `created_at >= $3 AND created_at <= $4`.
- Author: `author_id = $5`.
- Status: `status = $6`.
- RBAC: appends authorization predicates based on the requesting user's permissions (e.g., `(visibility = 'public' OR author_id = $7 OR $8 = 'admin')`).
- Sort: validates the sort field against an allowlist (`name`, `created_at`, `updated_at`, `relevance`) and order (`asc`, `desc`). Defaults to `relevance DESC` when a search query is present, otherwise `created_at DESC`.

### 3.5 SearchIndexer

**Location:** `src/services/SearchIndexer`

Responsibilities:
- Maintains the `search_vector` tsvector column on the `skills` table.
- Registers a PostgreSQL trigger (`tsvector_update_trigger` or a custom trigger function) that recomputes `search_vector` on INSERT and UPDATE of `name`, `description`, or `body`.
- Provides a `reindexAll()` method for bulk reindexing during migrations or data repairs.
- Weights fields: `name` as weight A, `description` as weight B, `body` as weight C — giving title matches higher relevance.

### 3.6 SearchCache

**Location:** `src/services/SearchCache`

Responsibilities:
- Wraps Redis `GET`/`SET` with JSON serialization.
- Cache key: `search:<sha256(normalizedCriteria + userId)>`.
- TTL: 60 seconds (short-lived to balance freshness vs. performance).
- Invalidation: on any skill CREATE, UPDATE, or DELETE, publishes a Redis `PUBLISH search:invalidate` event. The cache listener either flushes all search keys (simple) or selectively invalidates keys matching affected tags/author (optimized).
- Graceful degradation: if Redis is unavailable, the service bypasses cache and queries PostgreSQL directly.

---

## 4. Data Model

### 4.1 SearchIndex (tsvector column on skills table)

```sql
-- Added to the existing skills table
ALTER TABLE skills
  ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(body, '')), 'C')
    ) STORED;

-- GIN index for full-text search
CREATE INDEX idx_skills_search_vector ON skills USING GIN (search_vector);

-- GIN index for tag array containment queries
CREATE INDEX idx_skills_tags ON skills USING GIN (tags);

-- B-tree indexes for date-range and sort queries
CREATE INDEX idx_skills_created_at ON skills (created_at);
CREATE INDEX idx_skills_updated_at ON skills (updated_at);
CREATE INDEX idx_skills_author_id ON skills (author_id);
CREATE INDEX idx_skills_status ON skills (status);
```

The `GENERATED ALWAYS AS ... STORED` approach keeps the tsvector column automatically synchronized with the source columns, eliminating the need for manual triggers.

### 4.2 SearchResult

```typescript
interface SearchResult {
  items: SearchResultItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  query?: string;
}

interface SearchResultItem {
  id: string;
  name: string;
  description: string;
  author: AuthorSummary;
  tags: string[];
  status: string;
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
  relevanceScore?: number; // ts_rank score, present when q is provided
  highlights?: HighlightSnippet[];
}

interface HighlightSnippet {
  field: 'name' | 'description' | 'body';
  fragment: string; // contains <mark>...</mark> tags around matched terms
}

interface AuthorSummary {
  id: string;
  username: string;
}
```

### 4.3 FilterCriteria

```typescript
interface FilterCriteria {
  query?: string;          // raw search text
  tags?: string[];         // AND logic
  author?: string;         // author user ID
  status?: string;         // e.g., 'published', 'draft', 'archived'
  createdAfter?: string;   // ISO 8601 date
  createdBefore?: string;  // ISO 8601 date
  sort?: 'name' | 'created_at' | 'updated_at' | 'relevance';
  order?: 'asc' | 'desc';
  page?: number;           // 1-based
  pageSize?: number;       // default 20, max 100
}
```

### 4.4 Class Diagram

See `diagrams/class_diagram.puml` for the full class diagram showing relationships between `SearchResult`, `FilterCriteria`, `SearchIndex`, and `HighlightSnippet`.

---

## 5. Key Workflows

### 5.1 Full-Text Search Execution

See `diagrams/sequence_search.puml`.

1. Client sends `GET /api/v1/skills?q=deployment+automation&page=1&page_size=20`.
2. **SearchController** extracts parameters and builds `FilterCriteria`.
3. **SearchService** computes the cache key and checks **SearchCache**.
4. **Cache hit:** return cached `SearchResult` immediately.
5. **Cache miss:**
   a. **QueryParser** sanitizes input and produces `plainto_tsquery('english', 'deployment automation')`.
   b. **FilterBuilder** builds the WHERE clause: `search_vector @@ $1` plus RBAC predicates.
   c. SQL executes with `ts_rank(search_vector, query)` for scoring and `ts_headline(...)` for highlights.
   d. Results are paginated with `LIMIT`/`OFFSET` (or keyset pagination if warranted).
   e. **SearchCache** stores the result with a 60-second TTL.
6. **SearchController** returns the JSON response.

**Example SQL (simplified):**

```sql
WITH query AS (
  SELECT plainto_tsquery('english', $1) AS q
)
SELECT
  s.id, s.name, s.description, s.tags, s.status,
  s.author_id, s.created_at, s.updated_at,
  ts_rank(s.search_vector, query.q) AS relevance_score,
  ts_headline('english', s.name, query.q,
    'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=10') AS name_highlight,
  ts_headline('english', s.description, query.q,
    'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=10') AS description_highlight,
  ts_headline('english', s.body, query.q,
    'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=10') AS body_highlight,
  COUNT(*) OVER() AS total_count
FROM skills s, query
WHERE s.search_vector @@ query.q
  AND (s.visibility = 'public' OR s.author_id = $2 OR $3 = 'admin')
ORDER BY relevance_score DESC
LIMIT $4 OFFSET $5;
```

### 5.2 Combined Search + Filter

See `diagrams/sequence_filter.puml`.

1. Client sends `GET /api/v1/skills?q=terraform&tags=devops,cloud&created_after=2026-01-01&sort=name&order=asc&page=1&page_size=20`.
2. **SearchController** parses all parameters into `FilterCriteria`.
3. **SearchService** checks cache (key includes all filter parameters).
4. On cache miss:
   a. **QueryParser** produces the tsquery for "terraform".
   b. **FilterBuilder** constructs compound WHERE:
      - `search_vector @@ $1`
      - `tags @> ARRAY['devops', 'cloud']::text[]`
      - `created_at >= '2026-01-01'`
      - RBAC predicates
   c. ORDER BY uses `name ASC` (explicit sort overrides default relevance).
   d. Query executes with pagination.
5. Result is cached and returned.

### 5.3 Index Update on Skill Create/Update/Delete

Because the `search_vector` column uses `GENERATED ALWAYS AS ... STORED`, PostgreSQL automatically recomputes it on every INSERT or UPDATE that touches `name`, `description`, or `body`. No application-level indexing step is required.

On DELETE, no index action is needed — the row and its tsvector are removed together.

### 5.4 Cache Invalidation

1. On any skill mutation (create, update, delete), the service layer publishes a message to the `search:invalidate` Redis channel.
2. The **SearchCache** listener receives the message and flushes all keys under the `search:*` prefix.
3. The next search request will execute against PostgreSQL and repopulate the cache.

**Why flush all?** Selective invalidation (determining which cached queries are affected by a given mutation) is complex and error-prone. Given the short 60-second TTL, a full flush is simple and the worst case is a brief spike in PostgreSQL load, which at 100K skills is well within capacity.

---

## 6. API Contracts

### 6.1 Search and Filter Skills

```
GET /api/v1/skills?q=<query>&tags=<tag1,tag2>&author=<userId>&status=<status>&created_after=<ISO8601>&created_before=<ISO8601>&sort=<field>&order=<asc|desc>&page=<n>&page_size=<n>
```

**Query Parameters:**

| Parameter        | Type     | Required | Default         | Description                                                |
| ---------------- | -------- | -------- | --------------- | ---------------------------------------------------------- |
| `q`              | string   | No       | —               | Full-text search query. Max 256 characters.                |
| `tags`           | string   | No       | —               | Comma-separated tag list. AND logic (all must match).      |
| `author`         | string   | No       | —               | Filter by author user ID.                                  |
| `status`         | string   | No       | —               | Filter by status (`published`, `draft`, `archived`).       |
| `created_after`  | string   | No       | —               | ISO 8601 date. Inclusive lower bound on `created_at`.      |
| `created_before` | string   | No       | —               | ISO 8601 date. Inclusive upper bound on `created_at`.      |
| `sort`           | string   | No       | `relevance` (if `q` present) / `created_at` (otherwise) | Sort field. Allowed: `name`, `created_at`, `updated_at`, `relevance`. |
| `order`          | string   | No       | `desc`          | Sort order. Allowed: `asc`, `desc`.                        |
| `page`           | integer  | No       | `1`             | 1-based page number.                                       |
| `page_size`      | integer  | No       | `20`            | Items per page. Min 1, max 100.                            |

**Response: 200 OK**

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Terraform Deployment",
      "description": "Automates cloud infrastructure deployment using Terraform.",
      "author": {
        "id": "user-123",
        "username": "jdoe"
      },
      "tags": ["devops", "cloud", "terraform"],
      "status": "published",
      "createdAt": "2026-02-15T10:30:00Z",
      "updatedAt": "2026-03-20T14:45:00Z",
      "relevanceScore": 0.89,
      "highlights": [
        {
          "field": "name",
          "fragment": "<mark>Terraform</mark> Deployment"
        },
        {
          "field": "description",
          "fragment": "Automates cloud infrastructure deployment using <mark>Terraform</mark>."
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 47,
    "totalPages": 3
  }
}
```

**Error Responses:**

| Status | Condition                                             |
| ------ | ----------------------------------------------------- |
| 400    | Invalid query parameter (bad date format, unknown sort field, page < 1, page_size out of range, query too long) |
| 401    | Missing or invalid authentication token               |
| 403    | Authenticated but insufficient permissions            |
| 500    | Internal server error                                 |

### 6.2 URL Query String in Web UI

The web UI reflects all active filters in the browser URL query string so that search states are bookmarkable and shareable:

```
https://skills.example.com/skills?q=terraform&tags=devops,cloud&sort=name&order=asc&page=2
```

On page load the UI reads query parameters from the URL, populates the search bar and filter controls, and fires the API request.

---

## 7. Security Considerations

### 7.1 Search Query Sanitization

- **QueryParser** rejects queries exceeding 256 characters or 20 tokens.
- All user input is passed through parameterized queries — never interpolated into SQL strings.
- PostgreSQL's `plainto_tsquery` inherently ignores special tsquery operators from user input, preventing query-syntax injection.

### 7.2 Denial-of-Service Prevention

- **Query complexity limits:** max 256 characters, max 20 tokens.
- **Rate limiting:** the search endpoint applies a per-user rate limit (e.g., 60 requests/minute) via the existing API rate-limiting middleware.
- **Statement timeout:** a PostgreSQL `statement_timeout` of 2 seconds is set on the connection pool used for search queries, preventing any single query from monopolizing resources.
- **Pagination enforcement:** `page_size` is capped at 100. Requests for `page_size > 100` are rejected with 400.
- **Cache as buffer:** the Redis cache absorbs repeated identical queries, reducing database pressure during traffic spikes.

### 7.3 Authorization Filtering

- Every search query includes RBAC predicates in the WHERE clause, evaluated at the database level.
- The cache key includes the user's role/permission hash so that cached results for an admin are never served to a regular user.
- Skills with `visibility = 'private'` are only returned to their author or to admin users.

---

## 8. Open Questions

| # | Question | Context | Resolution Path |
|---|----------|---------|-----------------|
| 1 | **PostgreSQL FTS vs. Elasticsearch** | PostgreSQL FTS with GIN indexes is sufficient for 100K skills and avoids operational complexity. Elasticsearch becomes advantageous at 1M+ skills or when faceted search, fuzzy matching, or "did you mean" suggestions are required. | Start with PostgreSQL FTS. Benchmark at 100K skills. If P95 exceeds targets, evaluate Elasticsearch as a read-side index. The `SearchService` abstraction makes the backend swappable. |
| 2 | **OFFSET vs. keyset pagination** | OFFSET-based pagination degrades on deep pages (e.g., page 500 of 100K results). Keyset pagination is more efficient but harder to implement for arbitrary sort fields. | Use OFFSET for the initial release since users rarely paginate beyond page 10–20. Monitor slow queries and switch to keyset pagination if deep-page performance becomes an issue. |
| 3 | **Cache granularity** | Full cache flush on every mutation is simple but aggressive. Selective invalidation (flushing only queries that match the mutated skill's tags/author) reduces unnecessary cache misses. | Start with full flush given the 60s TTL. Profile cache hit rates in production. Implement selective invalidation only if cache miss rate is problematically high. |
| 4 | **Multi-language search** | PostgreSQL text search configurations are language-specific (`english`). Skills written in other languages will have degraded stemming and stop-word handling. | Use `english` for the initial release. Evaluate `simple` configuration or language-detection-based dynamic configuration if the user base is multilingual. |
| 5 | **Highlight tag safety** | `ts_headline` produces raw HTML (`<mark>...</mark>`). If rendered without sanitization, this could be an XSS vector if skill content contains malicious markup. | The API returns highlight fragments as-is. The web UI must sanitize highlight HTML before rendering (allow only `<mark>` tags, strip all others). |
