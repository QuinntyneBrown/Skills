# Feature 03: RESTful API & Security - Detailed Design

**Traces to:** L1-006 (API Layer), L1-008 (Security Hardening)
**Detailed Requirements:** L2-018, L2-019, L2-020, L2-024, L2-025, L2-026

---

## 1. Overview

This document describes the design of the RESTful API layer and security hardening for the Claude Skills management application. The API serves as the single integration point for the SPA frontend, CLI client, and any future third-party consumers. All endpoints are versioned under `/api/v1/`, secured with JWT-based authentication (Feature 01), and protected by a layered middleware pipeline that enforces rate limiting, CSRF protection, input validation, CORS policy, and secure HTTP headers.

The security design follows the OWASP Top 10 mitigation framework and implements defense-in-depth: every request passes through multiple independent security controls before reaching business logic.

### Goals

- Provide a consistent, versioned RESTful API with standardized error responses.
- Auto-generate OpenAPI 3.x documentation accessible at `/api/docs`.
- Enforce rate limits (100 req/min authenticated, 20 req/min unauthenticated) via Redis-backed sliding window counters.
- Protect against OWASP Top 10 vulnerabilities through middleware-based controls.
- Encrypt all data in transit (TLS 1.2+) and sensitive data at rest (Argon2id, hashed tokens).

### Non-Goals

- Authentication and authorization logic (covered by Feature 01).
- Business-domain endpoints for skills CRUD (covered by Feature 02).
- Observability and health checks (covered by Feature 08).

---

## 2. Architecture

### 2.1 C4 Context Diagram

Clients interact with the API system, which depends on PostgreSQL for persistence and Redis for rate limiting and caching.

![C4 Context](diagrams/c4_context.puml)

**Participants:**

| Actor | Description |
|---|---|
| SPA Frontend | Single-page application served from CDN, communicates via REST + CSRF tokens |
| CLI Client | Command-line tool authenticating via API key or OAuth token |
| Third-Party Client | External integrations using API keys |
| API System | Stateless API servers behind a load balancer |
| PostgreSQL | Primary data store for skills, users, API keys, audit logs |
| Redis | Rate limit counters, session cache, CSRF token store |
| CDN / WAF | TLS termination, static asset delivery, edge-level DDoS protection |

### 2.2 C4 Container Diagram

![C4 Container](diagrams/c4_container.puml)

The API Server container hosts the middleware pipeline, controllers, and the OpenAPI generator. Redis handles rate limit state with sub-millisecond lookups. PostgreSQL stores API key hashes and all persistent data. A CDN/WAF sits in front for TLS termination and coarse-grained traffic filtering.

### 2.3 C4 Component Diagram

![C4 Component](diagrams/c4_component.puml)

Inside the API Server, the request pipeline is composed of ordered middleware:

1. **CorsMiddleware** - Evaluates `Origin` header against the configured allowlist.
2. **SecurityHeadersMiddleware** - Injects HSTS, CSP, X-Frame-Options, and other headers.
3. **RateLimitMiddleware** - Checks Redis sliding window counters; returns 429 if exceeded.
4. **CsrfMiddleware** - Validates CSRF token on state-mutating requests from browser origins.
5. **AuthMiddleware** - Validates JWT or API key (delegates to Feature 01 services).
6. **ValidationMiddleware** - Strips unknown fields, sanitizes input, enforces size limits.
7. **Controller** - Business logic handler.
8. **ErrorHandler** - Catches exceptions and formats standard error envelope.
9. **OpenApiGenerator** - Produces `/api/v1/openapi.json` from route metadata at build/startup.

---

## 3. Component Details

### 3.1 Request Pipeline / Middleware Stack

The middleware stack executes in strict order. Each middleware either passes the request to the next layer or short-circuits with an error response. The order is security-critical: CORS and headers run first (cheapest, broadest), followed by rate limiting (protects downstream resources), then authentication and validation (most expensive).

#### 3.1.1 CorsMiddleware

**Responsibility:** Enforce the CORS allowlist for cross-origin requests.

- On preflight (`OPTIONS`): respond with `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, `Access-Control-Max-Age: 86400`. No further middleware executes.
- On actual request: validate `Origin` against the allowlist. If not allowed, respond 403.
- The allowlist is loaded from environment configuration (`CORS_ALLOWED_ORIGINS`), defaulting to the SPA domain only.
- Credentials are allowed (`Access-Control-Allow-Credentials: true`) for cookie-based CSRF flow.

#### 3.1.2 SecurityHeadersMiddleware

**Responsibility:** Attach security-related HTTP headers to every response.

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Content-Security-Policy` | See Section 7.3 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-XSS-Protection` | `0` (disabled in favor of CSP) |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

#### 3.1.3 RateLimitMiddleware

**Responsibility:** Enforce per-identity request rate limits using Redis sliding window counters.

- **Authenticated requests:** keyed by `user:<user_id>`, limit 100 req/min.
- **Unauthenticated requests:** keyed by `ip:<client_ip>`, limit 20 req/min.
- Uses a sliding window log algorithm in Redis (sorted set with timestamp scores).
- Adds response headers on every request: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (Unix epoch seconds).
- When limit exceeded: returns `429 Too Many Requests` with `Retry-After` header (seconds until window reset).
- If Redis is unavailable, the middleware fails open (allows the request) and logs a warning. This prevents Redis outages from causing total API downtime.

#### 3.1.4 CsrfMiddleware

**Responsibility:** Protect state-mutating requests from CSRF attacks when originated by the web UI.

- Applies to `POST`, `PATCH`, `PUT`, `DELETE` methods only.
- Skipped for requests authenticated via API key or Bearer token in the `Authorization` header (non-browser clients).
- For browser-originated requests (identified by `Origin` header matching the SPA domain):
  - A CSRF token is issued via a `GET /api/v1/csrf-token` endpoint and stored in Redis with a TTL of 1 hour.
  - The client sends the token in the `X-CSRF-Token` header.
  - The middleware validates the token against Redis. Invalid or missing tokens result in `403 Forbidden`.
- Tokens are single-use: consumed on successful validation and a new one must be obtained.

#### 3.1.5 AuthMiddleware

**Responsibility:** Authenticate the request by validating JWT access tokens or API keys. This middleware delegates to the authentication services designed in Feature 01. It populates the request context with user identity and roles.

- Unauthenticated routes (e.g., `/api/docs`, `/api/v1/openapi.json`, `/health`) are exempted via a route allowlist.
- Returns `401 Unauthorized` for missing or invalid credentials.

#### 3.1.6 ValidationMiddleware

**Responsibility:** Validate and sanitize all incoming request data.

- **Schema validation:** Each endpoint declares its request schema (body, query params, path params). The middleware validates against the schema and returns `400` with field-level errors for violations.
- **Unknown field stripping:** Fields not declared in the schema are silently removed from the request body.
- **HTML/script sanitization:** Text fields are run through a sanitizer that strips `<script>`, `<iframe>`, `on*` attributes, and other dangerous HTML. Stored content is sanitized on input; output encoding is applied at render time.
- **Size limits:** Request body max 1MB by default. File uploads max 5MB, returning `413 Payload Too Large` if exceeded.
- **Parameterized queries:** All database interactions use parameterized queries (enforced at the ORM/query-builder layer, not this middleware). This middleware prevents SQL injection patterns as an additional defense layer.

#### 3.1.7 ErrorHandler

**Responsibility:** Catch all unhandled exceptions and format them into the standard error envelope.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields failed validation.",
    "details": [
      {
        "field": "name",
        "reason": "Must not exceed 200 characters."
      }
    ]
  }
}
```

Error code mapping:

| HTTP Status | Error Code | Scenario |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid input |
| 401 | `UNAUTHORIZED` | Missing or invalid credentials |
| 403 | `FORBIDDEN` | Insufficient permissions, invalid CSRF |
| 404 | `NOT_FOUND` | Resource or endpoint not found |
| 409 | `CONFLICT` | Optimistic concurrency violation |
| 413 | `PAYLOAD_TOO_LARGE` | File exceeds 5MB limit |
| 429 | `RATE_LIMITED` | Rate limit exceeded |
| 500 | `INTERNAL_ERROR` | Unhandled server error (no stack trace in response) |

A `correlation_id` is included in every error response and in logs for cross-referencing.

#### 3.1.8 OpenApiGenerator

**Responsibility:** Generate the OpenAPI 3.x specification from route metadata.

- Decorators/attributes on controller methods declare path, method, request/response schemas, tags, and descriptions.
- At application startup, the generator collects all route metadata and produces the OpenAPI JSON document.
- `GET /api/v1/openapi.json` serves the generated spec.
- `GET /api/docs` serves Swagger UI configured to load the spec from `/api/v1/openapi.json`.
- The spec includes security scheme definitions (Bearer JWT, API Key), rate limit header descriptions, and the standard error envelope schema.

---

## 4. Data Model

### 4.1 RateLimitEntry (Redis)

Rate limit state is stored entirely in Redis. No PostgreSQL table is needed.

| Field | Type | Description |
|---|---|---|
| Key | `string` | `ratelimit:user:{user_id}` or `ratelimit:ip:{ip_address}` |
| Value | `sorted set` | Members are request timestamps (ms); scores are the same timestamps |
| TTL | `60s` | The sorted set expires 60 seconds after last write |

**Operations:**

- `ZADD key timestamp timestamp` - Record a request.
- `ZREMRANGEBYSCORE key 0 (now - 60s)` - Evict entries outside the window.
- `ZCARD key` - Count requests in the current window.

### 4.2 ApiKey (PostgreSQL)

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Internal identifier |
| `user_id` | `uuid` | FK -> users.id, NOT NULL | Owning user |
| `name` | `varchar(100)` | NOT NULL | Human-readable label (e.g., "CI/CD key") |
| `key_prefix` | `varchar(8)` | NOT NULL | First 8 characters of the key for identification (e.g., `sk_live_a`) |
| `key_hash` | `varchar(128)` | NOT NULL, UNIQUE | SHA-256 hash of the full API key |
| `scopes` | `text[]` | NOT NULL, default `{read}` | Permitted scopes: `read`, `write`, `admin` |
| `expires_at` | `timestamptz` | NULL | Optional expiration; NULL means no expiry |
| `last_used_at` | `timestamptz` | NULL | Updated on each use |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | Creation timestamp |
| `revoked_at` | `timestamptz` | NULL | Set when the key is revoked; non-null means inactive |

**Indexes:**

- `idx_api_keys_key_hash` on `key_hash` (unique, used for lookup during authentication).
- `idx_api_keys_user_id` on `user_id` (list keys for a user).

**Notes:**

- The full API key is shown to the user exactly once at creation time and is never stored.
- Authentication lookups hash the incoming key with SHA-256 and query by `key_hash`.
- Revocation is a soft operation: the `revoked_at` timestamp is set rather than deleting the row, preserving audit history.

### 4.3 CsrfToken (Redis)

| Field | Type | Description |
|---|---|---|
| Key | `string` | `csrf:{token_value}` |
| Value | `string` | `user_id` or `session_id` that owns the token |
| TTL | `3600s` | Token expires after 1 hour |

### 4.4 Class Diagram

![Class Diagram](diagrams/class_diagram.puml)

---

## 5. Key Workflows

### 5.1 Request Pipeline (Full Middleware Chain)

![Sequence: Request Pipeline](diagrams/sequence_request_pipeline.puml)

1. Client sends `PATCH /api/v1/skills/{id}` with `Authorization: Bearer <jwt>` and `X-CSRF-Token: <token>`.
2. **CorsMiddleware**: Checks `Origin` against allowlist. Passes.
3. **SecurityHeadersMiddleware**: Queues security headers for response. Passes.
4. **RateLimitMiddleware**: Queries Redis for user's request count. Under limit. Adds rate limit headers. Passes.
5. **CsrfMiddleware**: Detects browser origin. Validates CSRF token against Redis. Token valid, consumed. Passes.
6. **AuthMiddleware**: Validates JWT signature and expiration. Extracts user identity. Passes.
7. **ValidationMiddleware**: Validates request body against PATCH schema. Strips unknown fields. Sanitizes text. Passes.
8. **Controller**: Executes business logic. Returns 200 with updated resource.
9. **SecurityHeadersMiddleware**: Attaches queued headers to response.
10. Response returned to client with security headers and rate limit headers.

### 5.2 Rate Limit Check

![Sequence: Rate Limit](diagrams/sequence_rate_limit.puml)

1. RateLimitMiddleware receives the request.
2. Determines the rate limit key (`user:<id>` if authenticated, `ip:<addr>` if not).
3. Executes a Redis pipeline:
   a. `ZREMRANGEBYSCORE key 0 (now_ms - 60000)` - Remove expired entries.
   b. `ZCARD key` - Get current count.
   c. `ZADD key now_ms now_ms` - Add current request.
   d. `EXPIRE key 60` - Reset TTL.
4. If count >= limit: remove the just-added entry (`ZREM`), set `Retry-After` header, return 429.
5. If count < limit: set `X-RateLimit-Remaining` = limit - count - 1, pass to next middleware.

### 5.3 CSRF Validation

1. Client calls `GET /api/v1/csrf-token`. Server generates a cryptographically random token, stores it in Redis with 1-hour TTL, and returns it in the response body.
2. Client includes the token in `X-CSRF-Token` header on the next mutating request.
3. CsrfMiddleware checks:
   - Is this a mutating method (`POST`, `PATCH`, `PUT`, `DELETE`)? If not, skip.
   - Is the `Origin` header from the SPA domain? If not (API key / CLI), skip.
   - Does the `X-CSRF-Token` header exist? If not, return 403.
   - Does the token exist in Redis? If not, return 403 (expired or already used).
   - Delete the token from Redis (single-use). Pass to next middleware.

### 5.4 Input Validation Pipeline

1. ValidationMiddleware receives the request.
2. Looks up the schema for the matched route + method.
3. **Phase 1 - Size check:** If `Content-Length` exceeds the route's max (default 1MB, file uploads 5MB), return 413.
4. **Phase 2 - Schema validation:** Validate JSON body against the declared schema. Collect all field errors. If any, return 400 with details array.
5. **Phase 3 - Unknown field stripping:** Remove any fields not in the schema from the parsed body.
6. **Phase 4 - Sanitization:** For each string field, strip dangerous HTML tags and attributes. Encode special characters.
7. Replace the request body with the sanitized version. Pass to next middleware.

---

## 6. API Contracts

### 6.1 API Documentation Endpoints

#### GET /api/docs

Serves Swagger UI for interactive API exploration.

- **Auth:** None (public)
- **Response:** `200 OK`, `text/html`

#### GET /api/v1/openapi.json

Returns the auto-generated OpenAPI 3.x specification.

- **Auth:** None (public)
- **Response:** `200 OK`, `application/json`

```json
{
  "openapi": "3.0.3",
  "info": {
    "title": "Claude Skills API",
    "version": "1.0.0",
    "description": "API for managing Claude skills."
  },
  "servers": [
    { "url": "/api/v1" }
  ],
  "paths": { "..." : "..." },
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT"
      },
      "apiKeyAuth": {
        "type": "apiKey",
        "in": "header",
        "name": "X-API-Key"
      }
    },
    "schemas": {
      "ErrorResponse": {
        "$ref": "#/components/schemas/ErrorEnvelope"
      }
    }
  }
}
```

### 6.2 CSRF Token Endpoint

#### GET /api/v1/csrf-token

Returns a fresh CSRF token for use in mutating requests from the web UI.

- **Auth:** Required (Bearer JWT)
- **Response:** `200 OK`

```json
{
  "csrf_token": "a1b2c3d4e5f6..."
}
```

### 6.3 Standard Error Response Envelope

All error responses use this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields failed validation.",
    "details": [
      {
        "field": "name",
        "reason": "Must not exceed 200 characters."
      }
    ],
    "correlation_id": "req_abc123def456"
  }
}
```

### 6.4 Rate Limit Headers

Present on every API response:

| Header | Example | Description |
|---|---|---|
| `X-RateLimit-Limit` | `100` | Maximum requests per window |
| `X-RateLimit-Remaining` | `87` | Requests remaining in current window |
| `X-RateLimit-Reset` | `1714003260` | Unix epoch when the window resets |

On 429 responses, additionally:

| Header | Example | Description |
|---|---|---|
| `Retry-After` | `23` | Seconds until the client may retry |

---

## 7. Security Considerations

### 7.1 OWASP Top 10 Mapping

| # | Vulnerability | Mitigation |
|---|---|---|
| A01 | Broken Access Control | AuthMiddleware + RBAC enforcement on every endpoint (Feature 01). CORS allowlist. CSRF tokens. |
| A02 | Cryptographic Failures | TLS 1.2+ enforced. Passwords hashed with Argon2id (>=250ms). API keys and refresh tokens stored as SHA-256 hashes. No secrets in logs. |
| A03 | Injection | Parameterized queries at ORM layer. ValidationMiddleware strips/sanitizes HTML and script content. Input schema validation. |
| A04 | Insecure Design | Defense-in-depth middleware chain. Least-privilege API key scopes. Rate limiting. Threat modeling during design. |
| A05 | Security Misconfiguration | SecurityHeadersMiddleware enforces all headers. CORS restricted to allowlist. Debug/stack traces disabled in production. |
| A06 | Vulnerable Components | Dependency scanning in CI/CD. Automated alerts for CVEs. Lock files for deterministic builds. |
| A07 | Identification & Auth Failures | Account lockout after 5 failed attempts (Feature 01). JWT short expiry (15 min). Refresh token rotation. |
| A08 | Software & Data Integrity Failures | Signed JWTs. API key hash verification. Immutable audit logs. |
| A09 | Security Logging & Monitoring Failures | Structured logging with correlation IDs (Feature 08). Audit log for all mutations. Failed auth attempts logged. |
| A10 | Server-Side Request Forgery | No user-controlled URL fetching in the API. If added, allowlist-based URL validation. |

### 7.2 TLS Configuration

- Minimum protocol: TLS 1.2. Preferred: TLS 1.3.
- Cipher suites restricted to AEAD ciphers (AES-256-GCM, ChaCha20-Poly1305).
- TLS termination at the load balancer / CDN edge. Internal traffic between load balancer and API servers uses TLS or runs on a private network.
- HSTS header with `max-age=31536000; includeSubDomains; preload` ensures browsers never downgrade to HTTP.

### 7.3 Content Security Policy

The CSP header for API responses (JSON endpoints):

```
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
```

The CSP header for the Swagger UI page (`/api/docs`):

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data:; font-src 'self' https://cdn.jsdelivr.net; connect-src 'self'; frame-ancestors 'none'
```

### 7.4 CORS Configuration

- **Allowed Origins:** Configured via `CORS_ALLOWED_ORIGINS` environment variable. Defaults to the SPA domain only (e.g., `https://skills.example.com`).
- **Allowed Methods:** `GET, POST, PATCH, DELETE, OPTIONS`.
- **Allowed Headers:** `Authorization, Content-Type, X-CSRF-Token, X-API-Key, X-Request-ID`.
- **Exposed Headers:** `X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Correlation-ID`.
- **Max Age:** `86400` (24 hours for preflight cache).
- **Credentials:** `true` (required for cookie/CSRF flow).

### 7.5 Password and Secret Storage

| Secret Type | Algorithm | Details |
|---|---|---|
| Passwords | Argon2id | Memory: 64MB, iterations: 3, parallelism: 4. Tuned to >=250ms per hash on target hardware. |
| API keys | SHA-256 | Key generated as 32 cryptographically random bytes, base62-encoded with `sk_live_` prefix. Hash stored; plaintext shown once. |
| Refresh tokens | SHA-256 | Token generated as 32 random bytes. Hash stored in DB. Plaintext in HTTP-only cookie or token response. |
| CSRF tokens | Raw | 32 random bytes, hex-encoded. Stored in Redis with TTL. No hashing needed (short-lived, single-use). |

### 7.6 Additional Hardening

- **Request ID propagation:** Every request is assigned a `X-Correlation-ID` (UUID v4) in the first middleware. This ID propagates through all logs and is returned in error responses.
- **Payload size limits:** 1MB default for JSON bodies, 5MB for file uploads. Enforced before JSON parsing to prevent DoS via large payloads.
- **Slowloris protection:** Configured at the load balancer with request timeouts (30s header, 60s body).
- **JSON-only API:** The API only accepts and returns `application/json` (except file uploads which accept `multipart/form-data`). Requests with other `Content-Type` values receive `415 Unsupported Media Type`.

---

## 8. Open Questions

| # | Question | Impact | Proposed Resolution |
|---|---|---|---|
| 1 | Should rate limits be configurable per API key scope (e.g., higher limits for admin keys)? | L2-020 | Start with flat limits; add tiered limits in a future iteration if needed. |
| 2 | Should CSRF tokens be session-bound or per-request single-use? | L2-025 | Design specifies single-use. If UX friction is too high (e.g., multi-tab usage), switch to session-bound with per-request nonce. |
| 3 | Should the OpenAPI spec be generated at build time (static file) or at startup (in-memory)? | L2-019 | Generate at startup for simplicity. If startup time is a concern, switch to build-time generation with CI validation. |
| 4 | What is the CORS allowlist for staging/development environments? | L2-025 | Use `localhost:*` in development. Staging uses the staging domain. Never wildcard `*` in production. |
| 5 | Should rate limiting use a sliding window log or a fixed window with sub-windows? | L2-020 | Sliding window log (sorted set) is more accurate. If Redis memory is a concern for high-traffic deployments, evaluate fixed window with two sub-windows as an alternative. |
| 6 | How should the API handle Redis unavailability for rate limiting? | L2-020 | Fail open (allow requests) with degraded-mode logging and alerting. Revisit if abuse patterns emerge during outages. |
