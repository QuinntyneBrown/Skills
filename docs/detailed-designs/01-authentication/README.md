# Feature 01: Authentication & Authorization

## 1. Overview

This feature provides identity management, session handling, and access control for the Claude Skills management application. Every request to the system must pass through authentication and authorization before accessing any resource.

### Actors

| Actor | Description |
|-------|-------------|
| **Anonymous User** | Unauthenticated visitor. Can only access registration, login, and public skill listings. |
| **Viewer** | Authenticated user with read-only access to public and explicitly shared skills. |
| **Member** | Authenticated user who can create, read, update, and delete their own skills. |
| **Admin** | Full access to all skills, users, and system configuration. |
| **CLI Client** | Authenticates via API key or browser-based OAuth flow; same RBAC rules apply. |

### Capabilities Summary

- Email/password registration with email verification
- OAuth registration/login via GitHub and Google
- Short-lived JWT access tokens (15 min) with rotating refresh tokens (7 days)
- Account lockout after 5 failed login attempts within 10 minutes
- Role-based access control (admin, member, viewer)
- Skill sharing with per-user visibility and permission grants

---

## 2. Architecture

### 2.1 System Context

The Claude Skills system interacts with external OAuth providers (GitHub, Google) and an email delivery service for verification emails.

![C4 Context Diagram](diagrams/c4_context.puml)

> Render `diagrams/c4_context.puml` with any PlantUML renderer.

### 2.2 Container View

The application consists of a Single-Page Application (SPA), a stateless REST API server, a PostgreSQL database, and a Redis instance for token/session storage.

![C4 Container Diagram](diagrams/c4_container.puml)

### 2.3 Component View (API Server)

Inside the API server, authentication and authorization are handled by the following components:

![C4 Component Diagram](diagrams/c4_component.puml)

| Component | Responsibility |
|-----------|---------------|
| `AuthController` | HTTP layer: receives auth requests, validates input, delegates to services. |
| `AuthService` | Orchestrates registration, login, OAuth flows, password changes. |
| `TokenService` | Issues, validates, rotates, and revokes JWT access tokens and refresh tokens. |
| `UserRepository` | Data access for the `users`, `oauth_accounts`, and `user_roles` tables. |
| `RoleService` | Evaluates RBAC permissions given a user, a resource, and an action. |
| `ShareService` | Manages skill sharing records: create, revoke, and query shares. |

---

## 3. Component Details

### 3.1 AuthController

**Location:** `src/controllers/auth.controller.ts`

**Endpoints handled:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Register with email/password |
| POST | `/api/v1/auth/login` | Login with email/password |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Logout (revoke tokens) |
| DELETE | `/api/v1/auth/sessions` | Revoke all sessions for the current user |
| POST | `/api/v1/auth/oauth/{provider}` | Initiate OAuth flow |
| GET | `/api/v1/auth/oauth/{provider}/callback` | OAuth callback |

**Dependencies:** `AuthService`, `TokenService`

### 3.2 AuthService

**Location:** `src/services/auth.service.ts`

**Responsibilities:**
- Validate registration input (password complexity: min 12 chars, at least one uppercase, one lowercase, one digit, one special character)
- Hash passwords with Argon2id
- Send verification emails via the email service
- Verify email tokens
- Authenticate credentials, enforcing lockout policy
- Orchestrate OAuth account linking

**Dependencies:** `UserRepository`, `TokenService`, `EmailService` (external), `Redis`

**Lockout state key in Redis:** `lockout:{userId}` storing `{ attempts: number, firstAttemptAt: ISO8601 }`

### 3.3 TokenService

**Location:** `src/services/token.service.ts`

**Responsibilities:**
- Issue JWT access tokens (signed with RS256, 15-min expiry)
- Issue opaque refresh tokens (stored in Redis/DB, 7-day expiry)
- Rotate refresh tokens: issuing a new refresh token invalidates the previous one
- Detect refresh token reuse (potential theft) and revoke the entire token family
- Revoke all tokens for a user (on password change or explicit logout-all)

**Token storage:**
- Access tokens are stateless JWTs; validation uses the public key only.
- Refresh tokens are stored in the `refresh_tokens` table and cached in Redis with key `rt:{tokenHash}`.

**JWT claims:**

```json
{
  "sub": "user-uuid",
  "roles": ["member"],
  "iat": 1710000000,
  "exp": 1710000900
}
```

### 3.4 UserRepository

**Location:** `src/repositories/user.repository.ts`

**Responsibilities:**
- CRUD operations on `users` table
- Query `oauth_accounts` by provider + provider user ID
- Manage `user_roles` join records

**Dependencies:** PostgreSQL (via query builder / ORM)

### 3.5 RoleService

**Location:** `src/services/role.service.ts`

**Responsibilities:**
- Given a user ID, action, and resource, return allow/deny
- Check role hierarchy: admin > member > viewer
- For skill operations, also check ownership and share records

**Permission matrix:**

| Action | Admin | Member (own skill) | Member (other's skill) | Viewer |
|--------|-------|-------------------|----------------------|--------|
| Create skill | Yes | Yes | No | No |
| Read private skill | Yes | Yes (own) | No | No |
| Read shared skill | Yes | Yes | Yes (if shared) | Yes (if shared) |
| Read public skill | Yes | Yes | Yes | Yes |
| Update skill | Yes | Yes (own) | Only if write-shared | No |
| Delete skill | Yes | Yes (own) | No | No |
| Manage shares | Yes | Yes (own) | No | No |

**Dependencies:** `UserRepository`, `ShareService`

### 3.6 ShareService

**Location:** `src/services/share.service.ts`

**Responsibilities:**
- Create a share record (by target user email or user ID)
- Revoke a share
- Query shares for a skill
- Query skills shared with a user

**Dependencies:** `UserRepository`, PostgreSQL

---

## 4. Data Model

![Class Diagram](diagrams/class_diagram.puml)

### 4.1 Tables

#### `users`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK, default `gen_random_uuid()` |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL |
| `password_hash` | VARCHAR(255) | NULL (null for OAuth-only users) |
| `email_verified` | BOOLEAN | DEFAULT false |
| `email_verification_token` | VARCHAR(255) | NULL |
| `email_verification_expires_at` | TIMESTAMPTZ | NULL |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() |

#### `roles`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `name` | VARCHAR(50) | UNIQUE, NOT NULL. Values: `admin`, `member`, `viewer` |

#### `user_roles`

| Column | Type | Constraints |
|--------|------|-------------|
| `user_id` | UUID | FK -> `users.id`, PK |
| `role_id` | UUID | FK -> `roles.id`, PK |
| `assigned_at` | TIMESTAMPTZ | DEFAULT now() |

#### `refresh_tokens`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK -> `users.id`, NOT NULL |
| `token_hash` | VARCHAR(255) | UNIQUE, NOT NULL |
| `family_id` | UUID | NOT NULL (groups tokens in a rotation chain) |
| `expires_at` | TIMESTAMPTZ | NOT NULL |
| `revoked_at` | TIMESTAMPTZ | NULL |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |

#### `oauth_accounts`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK -> `users.id`, NOT NULL |
| `provider` | VARCHAR(50) | NOT NULL (`github`, `google`) |
| `provider_user_id` | VARCHAR(255) | NOT NULL |
| `access_token` | VARCHAR(512) | Encrypted at rest |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| | | UNIQUE(`provider`, `provider_user_id`) |

#### `skill_shares`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `skill_id` | UUID | FK -> `skills.id`, NOT NULL |
| `shared_with_user_id` | UUID | FK -> `users.id`, NOT NULL |
| `permission` | VARCHAR(20) | NOT NULL, `read` or `write`. DEFAULT `read` |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| | | UNIQUE(`skill_id`, `shared_with_user_id`) |

### 4.2 Indexes

- `users(email)` -- unique index, used for login lookups
- `refresh_tokens(token_hash)` -- unique index, used for refresh validation
- `refresh_tokens(user_id, revoked_at)` -- find active tokens for a user
- `refresh_tokens(family_id)` -- revoke entire family on reuse detection
- `oauth_accounts(provider, provider_user_id)` -- unique index
- `skill_shares(skill_id)` -- list shares for a skill
- `skill_shares(shared_with_user_id)` -- list skills shared with a user

---

## 5. Key Workflows

### 5.1 Registration (Email/Password)

![Registration Sequence](diagrams/sequence_registration.puml)

1. User submits email and password to `POST /api/v1/auth/register`.
2. `AuthController` validates input format.
3. `AuthService` checks password complexity (min 12 chars, uppercase, lowercase, digit, special char).
4. `AuthService` checks if email already exists. If yes, returns a **generic success response** (to prevent enumeration) but does not create a duplicate.
5. `AuthService` hashes password with Argon2id (memory: 64 MB, iterations: 3, parallelism: 4).
6. `UserRepository` inserts user with `email_verified = false` and a random verification token.
7. Default `member` role is assigned via `user_roles`.
8. `EmailService` sends a verification link: `https://{domain}/verify-email?token={token}`.
9. API returns `201 Created` with `{ message: "Check your email to verify your account." }`.
10. User clicks the link; `GET /api/v1/auth/verify-email?token={token}` sets `email_verified = true`.

### 5.2 Login (Email/Password)

![Login Sequence](diagrams/sequence_login.puml)

1. User submits email and password to `POST /api/v1/auth/login`.
2. `AuthService` loads user by email. If not found, returns generic `401 Invalid credentials`.
3. `AuthService` checks lockout state in Redis (`lockout:{userId}`):
   - If 5+ attempts in the last 10 minutes, return `429 Too Many Requests` with `Retry-After` header (15-min lockout).
4. `AuthService` verifies password against stored Argon2id hash.
5. On failure: increment attempt counter in Redis; return generic `401 Invalid credentials`.
6. On success: clear lockout counter, check `email_verified`. If not verified, return `403 Email not verified`.
7. `TokenService` creates a JWT access token (15-min expiry) and a refresh token (7-day expiry, stored in DB + Redis).
8. API returns `200 OK` with `{ accessToken, refreshToken, expiresIn: 900 }`.

### 5.3 Token Refresh

1. Client sends `POST /api/v1/auth/refresh` with `{ refreshToken }`.
2. `TokenService` hashes the token and looks it up in Redis (fallback to DB).
3. If not found or revoked: return `401`.
4. If found but the token has already been rotated (reuse detection): revoke the entire token family, return `401`. This forces re-login on all devices sharing that family.
5. If valid: mark old refresh token as revoked, issue a new access token + new refresh token (same `family_id`), store in DB + Redis.
6. Return `200 OK` with new tokens.

### 5.4 OAuth Login

![OAuth Sequence](diagrams/sequence_oauth.puml)

1. Client calls `POST /api/v1/auth/oauth/{provider}` (provider: `github` or `google`).
2. API returns `{ authorizationUrl }` with a CSRF `state` parameter stored in Redis (5-min TTL).
3. User is redirected to the provider's consent screen.
4. Provider redirects to `GET /api/v1/auth/oauth/{provider}/callback?code={code}&state={state}`.
5. `AuthService` validates `state` against Redis.
6. `AuthService` exchanges `code` for provider access token.
7. `AuthService` fetches user profile (email, provider user ID) from the provider.
8. If an `oauth_accounts` record exists for this provider + provider user ID: load the linked user.
9. If no record exists but a user with that email exists: link the OAuth account to the existing user.
10. If no user exists: create a new user with `email_verified = true` (provider already verified), assign `member` role, create `oauth_accounts` record.
11. `TokenService` issues access + refresh tokens.
12. API redirects to `{frontendUrl}/oauth/callback?accessToken={token}&refreshToken={token}` (tokens passed via URL fragment or secure cookie depending on client type).

### 5.5 Logout

1. Client sends `POST /api/v1/auth/logout` with the refresh token in the body and the access token in the `Authorization` header.
2. `TokenService` revokes the specific refresh token (set `revoked_at` in DB, delete from Redis).
3. Access token continues to work until its 15-min expiry (stateless). For immediate revocation, the access token's `jti` can be added to a short-lived Redis blocklist.
4. Return `204 No Content`.

### 5.6 Revoke All Sessions

1. Client sends `DELETE /api/v1/auth/sessions` (triggered by password change or explicit request).
2. `TokenService` revokes all refresh tokens for the user in DB (bulk update `revoked_at`).
3. `TokenService` clears all Redis entries for this user's refresh tokens.
4. Optionally adds user ID to a Redis "force re-auth" set with a 15-min TTL so that middleware rejects existing access tokens.
5. Return `204 No Content`.

### 5.7 RBAC Check

![RBAC Sequence](diagrams/sequence_rbac_check.puml)

1. A request arrives at any protected endpoint (e.g., `PUT /api/v1/skills/{id}`).
2. `AuthMiddleware` extracts the JWT from the `Authorization: Bearer {token}` header, validates signature and expiry.
3. `AuthMiddleware` attaches `req.user = { id, roles }` to the request context.
4. `RbacMiddleware` (or a decorator/guard) is configured with the required permission (e.g., `skill:update`).
5. `RoleService.authorize(userId, action, resourceId)` is called:
   - Load user roles from the JWT claims.
   - If `admin`: allow.
   - If the action requires ownership (e.g., update): query the skill's `owner_id`. If `owner_id === userId`: allow.
   - If the action is read: check if the skill is public, or if a `skill_shares` record exists for this user.
   - If the action is write and a share exists with `permission = 'write'`: allow.
   - Otherwise: deny.
6. On deny: return `403 Forbidden`.

### 5.8 Share a Skill

1. Skill owner sends `POST /api/v1/skills/{id}/shares` with `{ email: "user@example.com", permission: "read" }`.
2. `RbacMiddleware` confirms the caller is the skill owner or an admin.
3. `ShareService` resolves the email to a user ID. If the user does not exist, returns `404 User not found`.
4. `ShareService` inserts a `skill_shares` record.
5. Return `201 Created` with the share details.

---

## 6. API Contracts

All endpoints are prefixed with `/api/v1`.

### 6.1 POST `/auth/register`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "S3cure!Pass123"
}
```

**Responses:**
| Status | Body | Notes |
|--------|------|-------|
| 201 | `{ "message": "Check your email to verify your account." }` | Always returned for valid input, even if email is taken (prevents enumeration) |
| 400 | `{ "error": "VALIDATION_ERROR", "details": [...] }` | Password too short, invalid email format, etc. |

### 6.2 POST `/auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "S3cure!Pass123"
}
```

**Responses:**
| Status | Body | Notes |
|--------|------|-------|
| 200 | `{ "accessToken": "eyJ...", "refreshToken": "dGhpcyBpcy4uLg==", "expiresIn": 900 }` | |
| 401 | `{ "error": "INVALID_CREDENTIALS" }` | Generic message for wrong email or wrong password |
| 403 | `{ "error": "EMAIL_NOT_VERIFIED" }` | |
| 429 | `{ "error": "ACCOUNT_LOCKED", "retryAfter": 900 }` | Account locked after 5 failed attempts |

### 6.3 POST `/auth/refresh`

**Request:**
```json
{
  "refreshToken": "dGhpcyBpcy4uLg=="
}
```

**Responses:**
| Status | Body | Notes |
|--------|------|-------|
| 200 | `{ "accessToken": "eyJ...", "refreshToken": "bmV3IHRva2Vu", "expiresIn": 900 }` | New rotated tokens |
| 401 | `{ "error": "INVALID_TOKEN" }` | Token expired, revoked, or reuse detected |

### 6.4 POST `/auth/logout`

**Headers:** `Authorization: Bearer {accessToken}`

**Request:**
```json
{
  "refreshToken": "dGhpcyBpcy4uLg=="
}
```

**Responses:**
| Status | Body |
|--------|------|
| 204 | (empty) |
| 401 | `{ "error": "UNAUTHORIZED" }` |

### 6.5 DELETE `/auth/sessions`

Revokes all sessions for the authenticated user. Used after password change.

**Headers:** `Authorization: Bearer {accessToken}`

**Responses:**
| Status | Body |
|--------|------|
| 204 | (empty) |
| 401 | `{ "error": "UNAUTHORIZED" }` |

### 6.6 POST `/auth/oauth/{provider}`

**Path params:** `provider` = `github` | `google`

**Responses:**
| Status | Body |
|--------|------|
| 200 | `{ "authorizationUrl": "https://github.com/login/oauth/authorize?..." }` |
| 400 | `{ "error": "UNSUPPORTED_PROVIDER" }` |

### 6.7 GET `/auth/oauth/{provider}/callback`

**Query params:** `code`, `state`

**Responses:**
| Status | Body | Notes |
|--------|------|-------|
| 302 | Redirect to `{frontendUrl}/oauth/callback#accessToken=...&refreshToken=...` | On success |
| 302 | Redirect to `{frontendUrl}/oauth/error?error=...` | On failure |

### 6.8 POST `/skills/{id}/shares`

**Headers:** `Authorization: Bearer {accessToken}`

**Request:**
```json
{
  "email": "collaborator@example.com",
  "permission": "read"
}
```

**Responses:**
| Status | Body | Notes |
|--------|------|-------|
| 201 | `{ "id": "uuid", "skillId": "uuid", "sharedWithUserId": "uuid", "permission": "read", "createdAt": "..." }` | |
| 400 | `{ "error": "VALIDATION_ERROR", "details": [...] }` | Invalid permission value |
| 403 | `{ "error": "FORBIDDEN" }` | Caller is not the owner or admin |
| 404 | `{ "error": "USER_NOT_FOUND" }` | Target email not registered |
| 409 | `{ "error": "SHARE_ALREADY_EXISTS" }` | Duplicate share |

### 6.9 DELETE `/skills/{id}/shares/{userId}`

**Headers:** `Authorization: Bearer {accessToken}`

**Responses:**
| Status | Body |
|--------|------|
| 204 | (empty) |
| 403 | `{ "error": "FORBIDDEN" }` |
| 404 | `{ "error": "SHARE_NOT_FOUND" }` |

---

## 7. Security Considerations

### 7.1 Password Hashing

- Algorithm: **Argon2id** (resistant to both side-channel and GPU attacks)
- Parameters: memory 64 MB, iterations 3, parallelism 4
- Each password gets a unique random salt (handled by the Argon2 library)

### 7.2 Token Storage

- **Access tokens (JWT):** Stored in memory on the client (SPA) or in the CLI config file. Never stored in `localStorage` (XSS risk). The SPA should hold the token in a JavaScript variable or in-memory store only.
- **Refresh tokens:** Sent to the client as an opaque string. The SPA stores it in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie. The CLI stores it in its config file with restrictive file permissions.
- **Server-side:** Refresh tokens are stored as SHA-256 hashes in the `refresh_tokens` table and cached in Redis.

### 7.3 Enumeration Prevention

- `POST /auth/register` returns the same `201` response whether the email is new or already taken.
- `POST /auth/login` returns the same `401 INVALID_CREDENTIALS` whether the email does not exist or the password is wrong.
- Timing attacks: the server always runs the Argon2 hash comparison even when the user is not found (comparing against a dummy hash) to keep response time constant.

### 7.4 Brute Force Protection

- After 5 failed login attempts for a given user within a 10-minute window, the account is locked for 15 minutes.
- Lockout state is tracked in Redis (`lockout:{userId}`) with a 10-minute sliding window.
- Rate limiting at the API gateway level: 20 requests/minute per IP on auth endpoints.

### 7.5 CSRF Protection

- The SPA uses `Authorization: Bearer` headers (not cookies) for access tokens, which is inherently CSRF-safe.
- The refresh token cookie is `SameSite=Strict`, providing CSRF protection for the refresh endpoint.
- OAuth flows use a random `state` parameter stored in Redis with a 5-minute TTL.

### 7.6 Additional Measures

- All auth endpoints are served over HTTPS only.
- JWT signing uses RS256 with a rotatable key pair. The public key is available at `GET /api/v1/.well-known/jwks.json`.
- Refresh token reuse detection: if a refresh token that has already been rotated is presented, the entire token family is revoked (assumes token theft).
- Password change triggers `DELETE /auth/sessions` to revoke all other sessions.

---

## 8. Open Questions

| # | Question | Context |
|---|----------|---------|
| 1 | Should we support magic-link (passwordless) login in addition to email/password? | Could simplify the UX and reduce password-related support load. |
| 2 | Should API keys for the CLI be scoped (read-only vs. full access)? | The requirements mention CLI auth via API key but do not specify scoping. |
| 3 | What is the email service provider? | The design assumes a generic `EmailService` interface; we need to pick an implementation (SendGrid, SES, etc.). |
| 4 | Should we support multi-factor authentication (MFA/2FA) in v1? | Not in the current requirements but may be expected for a security-conscious tool. |
| 5 | How should the SPA receive tokens from the OAuth callback? | URL fragment is simple but has security trade-offs. A server-side session cookie exchange might be safer. |
| 6 | Should `viewer` be the default role instead of `member`? | Current design defaults new registrations to `member`. A more conservative default would be `viewer`. |
