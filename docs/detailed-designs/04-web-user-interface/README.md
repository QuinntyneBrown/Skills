# Feature 04: Web User Interface - Detailed Design

**Traces to:** L1-004, L1-010, L1-011  
**Detailed Requirements:** L2-012, L2-013, L2-014, L2-030, L2-031, L2-033

---

## 1. Overview

The Web User Interface is a single-page application (SPA) built with React that serves as the primary entry point for the Claude Skills management system. It provides a dark-mode interface with a Monaco-based code editor for authoring skill content, a dashboard for browsing and managing skills, and responsive layouts spanning mobile through extra-large desktop viewports.

The SPA communicates exclusively with the backend RESTful API at `/api/v1/`. Authentication state is maintained via JWT access tokens held in memory and refresh tokens stored in httpOnly cookies. The application supports offline editing by queuing changes locally and synchronizing when connectivity is restored.

### Key Design Goals

- **Performance**: Sub-50ms input lag in the editor at 10K+ lines; skeleton loaders for all async data fetches.
- **Accessibility**: WCAG AA compliance with minimum 4.5:1 contrast ratios for text and 3:1 for interactive elements.
- **Resilience**: Offline-capable editor, automatic retry on transient failures, no data loss on network interruption.
- **Responsiveness**: Four breakpoint tiers from single-column mobile to split-pane desktop.

---

## 2. Architecture

### 2.1 C4 Context

The user interacts with the SPA in their browser. The SPA communicates with the API Server over HTTPS. No other external systems are accessed directly from the browser.

See: [`diagrams/c4_context.puml`](diagrams/c4_context.puml)

### 2.2 C4 Container

The deployment consists of three containers:

| Container | Technology | Purpose |
|-----------|-----------|---------|
| Browser (SPA) | React, Monaco Editor | Renders UI, manages client state, communicates with API |
| API Server | Node.js / Express | Serves REST endpoints, enforces auth and business logic |
| CDN | Static hosting | Serves built SPA assets (JS bundles, CSS, fonts) |

The CDN serves the initial HTML shell and static assets. Once loaded, the SPA hydrates and communicates directly with the API Server. The API Server returns JSON responses; it never serves HTML to the SPA.

See: [`diagrams/c4_container.puml`](diagrams/c4_container.puml)

### 2.3 C4 Component (SPA Internals)

The SPA is organized into the following major components:

| Component | Responsibility |
|-----------|---------------|
| **AppShell** | Root layout: sidebar/hamburger nav, main content area, global error boundary |
| **Router** | Client-side routing (React Router). Maps URL paths to views. |
| **AuthProvider** | Manages JWT access token in memory, handles refresh via httpOnly cookie, redirects on 401/403 |
| **SkillDashboard** | Lists skills with pagination, bulk actions, skeleton loaders, filter/search integration |
| **SkillEditor** | Monaco Editor wrapper for skill authoring. Status bar, keyboard shortcuts, Ctrl+S save. |
| **SkillDetailView** | Read-only view of a skill with metadata, tags, version info, and edit/delete actions |
| **VersionHistoryPanel** | Lists versions for a skill, supports diff view and restore action |
| **SearchBar** | Debounced full-text search input, updates URL query params |
| **FilterPanel** | Tag, author, visibility, and date-range filters; updates URL query params |
| **NavigationSidebar** | Desktop (>=992px) persistent sidebar with nav links |
| **MobileNav** | Hamburger menu for viewports <576px, slides in from left |
| **ErrorBoundary** | Catches render errors, displays fallback UI with correlation_id when available |
| **OfflineQueue** | Detects connectivity loss, queues pending mutations in IndexedDB, syncs on reconnect |
| **SkeletonLoader** | Reusable shimmer placeholder matching the shape of skill cards, editor chrome, etc. |

See: [`diagrams/c4_component.puml`](diagrams/c4_component.puml)

---

## 3. Component Details

### 3.1 AppShell

The root component that provides the persistent layout frame.

```
AppShell
├── NavigationSidebar (>=992px) | MobileNav (<576px)
├── ErrorBoundary
│   └── Router
│       ├── /dashboard → SkillDashboard
│       ├── /skills/new → SkillEditor (create mode)
│       ├── /skills/:id → SkillDetailView
│       ├── /skills/:id/edit → SkillEditor (edit mode)
│       └── /skills/:id/versions → VersionHistoryPanel
└── OfflineIndicator (banner shown when offline)
```

- Renders a top bar on tablet viewports (>=768px, <992px) with breadcrumbs.
- Provides a `useAppShell()` context for child components to control the sidebar open/close state and page title.

### 3.2 Router

Uses React Router v6 with lazy-loaded route components via `React.lazy()` and `Suspense` with skeleton fallbacks.

**Route Table:**

| Path | Component | Auth Required |
|------|-----------|:---:|
| `/` | Redirect to `/dashboard` | Yes |
| `/login` | LoginPage | No |
| `/dashboard` | SkillDashboard | Yes |
| `/skills/new` | SkillEditor | Yes |
| `/skills/:id` | SkillDetailView | Yes |
| `/skills/:id/edit` | SkillEditor | Yes |
| `/skills/:id/versions` | VersionHistoryPanel | Yes |

Protected routes are wrapped in an `<AuthGuard>` component that checks `AuthProvider` state and redirects to `/login` if unauthenticated.

### 3.3 AuthProvider

Implements a React context that manages authentication state.

**Token Strategy:**
- **Access token**: Stored in an in-memory variable (a module-scoped `let` in the AuthProvider module). Never written to localStorage or sessionStorage.
- **Refresh token**: Managed entirely by the server via an httpOnly, Secure, SameSite=Strict cookie. The SPA never reads or writes this cookie directly.

**Refresh Flow:**
1. On app load, the AuthProvider calls `POST /api/v1/auth/refresh` (the browser sends the cookie automatically).
2. If successful, the access token is stored in memory and the user is considered authenticated.
3. If it fails (no cookie, expired), the user is redirected to `/login`.

**Interceptor Behavior:**
- The HTTP client (Axios) attaches the access token via an `Authorization: Bearer` header on every API request.
- A response interceptor catches 401 responses, attempts a single token refresh, and retries the original request. If refresh fails, the user is redirected to `/login`.
- 403 responses redirect to `/login` with a "session expired" message.

### 3.4 SkillDashboard

Displays a paginated list of skills accessible to the current user.

**Features:**
- Fetches skills via `GET /api/v1/skills?page=1&page_size=25` on mount.
- Renders `SkeletonLoader` cards while data is loading (never a blank screen or spinner alone, per L2-014 AC5).
- Each skill card shows: name, description (truncated to 120 characters), tags (as chips), last updated (relative time), visibility badge.
- Clicking a card navigates to `/skills/:id`.
- A "New Skill" floating action button navigates to `/skills/new`.
- Bulk selection via checkboxes enables a "Delete Selected" action that triggers a confirmation dialog before calling `DELETE /api/v1/skills/:id` for each selected skill.

**Responsive Behavior:**
| Viewport | Layout |
|----------|--------|
| <576px | Single-column card stack (L2-030 AC1) |
| >=768px, <992px | Two-column grid (L2-031 AC1) |
| >=992px | Sidebar + main area with two-column grid (L2-031 AC2) |

### 3.5 SkillEditor

A wrapper around the Monaco Editor providing skill authoring capabilities.

**Monaco Configuration:**
- Language: `markdown` (syntax highlighting for Markdown, per L2-013 AC1).
- Theme: Custom dark theme registered via `monaco.editor.defineTheme()` with token colors that meet 4.5:1 contrast against editor background `#1a1a2e` (per L2-012 AC3).
- Options: `automaticLayout: true`, `wordWrap: 'on'`, `minimap: { enabled: true }` (disabled on <768px), `bracketPairColorization: { enabled: true }`.

**Keyboard Shortcuts:**
| Shortcut | Action |
|----------|--------|
| Ctrl+S / Cmd+S | Save skill (calls `PUT /api/v1/skills/:id` or `POST /api/v1/skills` for new) |
| Ctrl+Z / Cmd+Z | Undo (built-in) |
| Ctrl+Shift+Z / Cmd+Shift+Z | Redo (built-in) |
| Ctrl+F / Cmd+F | Find/Replace panel (built-in) |

**Status Bar:**
Rendered below the editor as a fixed bar showing:
- Line count (total lines in the document)
- Cursor position (`Ln <line>, Col <column>`)
- Character count (total characters)
- Save status indicator (Saved / Unsaved changes / Saving...)

**Save Flow:**
1. User presses Ctrl+S or clicks "Save".
2. If creating: `POST /api/v1/skills` with `{ name, description, body, tags }`.
3. If editing: `PUT /api/v1/skills/:id` with `{ name, description, body, tags }` and `If-Match: <etag>` header for optimistic concurrency.
4. On 409 Conflict: Display a conflict resolution dialog showing the server version vs. local version.
5. On success: Update local state with the new etag, show "Saved" in status bar.

**Performance (L2-013 AC4):**
- Monaco Editor is inherently capable of handling 10K+ lines with <50ms input lag.
- The editor component uses `React.memo` and avoids re-renders from parent state changes.
- The skill body is loaded once and managed entirely within the Monaco model.

**Split-Pane (>=1200px, L2-031 AC3):**
At extra-large viewports, the editor view renders a split pane with the Monaco editor on the left and a live Markdown preview on the right. The preview is rendered using `react-markdown` and updated on a 300ms debounce from editor content changes.

### 3.6 SkillDetailView

A read-only view of a skill showing all metadata and the rendered body.

- Fetches the skill via `GET /api/v1/skills/:id`.
- Renders: name, description, rendered body (Markdown to HTML), tags, visibility, author, created_at, updated_at, version number.
- Action buttons: "Edit" (navigates to `/skills/:id/edit`), "Delete" (confirmation dialog), "Version History" (navigates to `/skills/:id/versions`).

### 3.7 VersionHistoryPanel

Displays the version history for a skill.

- Fetches versions via `GET /api/v1/skills/:id/versions`.
- Lists each version with: version number, author, timestamp, summary of changes.
- Selecting two versions triggers a diff view via `GET /api/v1/skills/:id/versions/:v1/diff/:v2`.
- The diff is rendered using a side-by-side or unified view with color-coded additions (green) and deletions (red), meeting dark-mode contrast requirements (L2-038 AC2).
- A "Restore" button on any version calls `POST /api/v1/skills/:id/versions/:version/restore`.

### 3.8 SearchBar

A controlled input component with:
- 300ms debounce before dispatching search queries.
- Updates the URL query parameter `?q=<query>` for bookmarkability (L2-036 AC4).
- Triggers re-fetch of the skill list via the shared `SkillListState`.
- Displays a clear button when query is non-empty.

### 3.9 FilterPanel

A collapsible panel (default expanded on desktop, collapsed on mobile) with:
- **Tags**: Multi-select dropdown. AND logic across selected tags.
- **Visibility**: Dropdown (All, Private, Shared, Public).
- **Date Range**: Two date pickers for `created_after` and `created_before`.
- **Sort**: Dropdown (Name, Updated, Created) with ascending/descending toggle.
- All filter state is reflected in URL query parameters for bookmarkability.

### 3.10 NavigationSidebar

Visible at >=992px. Contains:
- Application logo/name at the top.
- Nav links: Dashboard, New Skill, Settings (future).
- User avatar and username at the bottom with a logout action.

### 3.11 MobileNav

A hamburger-triggered slide-in overlay for <576px viewports.
- Contains the same links as NavigationSidebar.
- Closes on route change or overlay click.
- Uses `aria-hidden` and focus trapping for accessibility.

### 3.12 ErrorBoundary

A React error boundary component wrapping the main content area.

**Behavior by Error Type:**
| Scenario | User Experience |
|----------|----------------|
| Render crash | Fallback UI: "Something went wrong" with a "Reload" button |
| Network failure on save | Inline toast with "Retry" button; unsaved changes preserved (L2-033 AC1) |
| 401/403 response | Redirect to `/login` with "Session expired" message (L2-033 AC2) |
| 500 response | Friendly error page showing correlation_id and "Contact support" (L2-033 AC3) |
| Offline detection | Banner at top: "You are offline. Changes will be saved when you reconnect." (L2-033 AC4) |

### 3.13 OfflineQueue

Manages offline resilience for the editor.

**Detection**: Listens to `window.addEventListener('online'/'offline')` and periodically pings `/health` as a fallback.

**Queue Storage**: Uses IndexedDB (via `idb` library) to persist queued operations. Each entry contains:
- `id`: UUID
- `skillId`: Target skill ID (null for creates)
- `operation`: `CREATE` | `UPDATE`
- `payload`: The full request body
- `timestamp`: When the operation was queued
- `status`: `PENDING` | `SYNCING` | `FAILED`

**Sync Flow**:
1. On connectivity restore, the queue processes entries in FIFO order.
2. Each entry is sent to the API. On success, the entry is removed from IndexedDB.
3. On 409 Conflict, the entry is marked `FAILED` and the user is prompted to resolve.
4. On transient failure (network, 5xx), the entry is retried with exponential backoff (max 3 retries).

### 3.14 SkeletonLoader

A reusable component that accepts a `variant` prop:

| Variant | Shape |
|---------|-------|
| `card` | Rectangular block matching skill card dimensions (title line, two description lines, tag chips) |
| `editor` | Full-height block matching the editor chrome |
| `detail` | Heading line, paragraph lines, metadata lines |

Uses CSS `@keyframes` shimmer animation. Rendered during `loading` states to avoid layout shift (L2-014 AC5).

---

## 4. Data Model (Client-Side State)

The application uses React Context for global state (auth, offline) and a combination of React Query (TanStack Query) for server state and local component state for UI state.

See: [`diagrams/class_diagram.puml`](diagrams/class_diagram.puml)

### 4.1 AuthState

```typescript
interface AuthState {
  isAuthenticated: boolean;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: 'admin' | 'member' | 'viewer';
  } | null;
  accessToken: string | null;  // in-memory only
  isRefreshing: boolean;
}
```

### 4.2 SkillListState

Managed by TanStack Query. The query key encodes the current filters and pagination.

```typescript
interface SkillSummary {
  id: string;
  name: string;
  description: string;      // full from API, truncated in UI
  tags: string[];
  visibility: 'private' | 'shared' | 'public';
  updatedAt: string;         // ISO 8601
  authorName: string;
}

interface SkillListResponse {
  data: SkillSummary[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}
```

### 4.3 EditorState

Local state within the SkillEditor component.

```typescript
interface EditorState {
  skillId: string | null;          // null for new skill
  name: string;
  description: string;
  body: string;                    // the Monaco editor content
  tags: string[];
  etag: string | null;            // for optimistic concurrency
  isDirty: boolean;               // unsaved changes exist
  isSaving: boolean;
  lastSavedAt: string | null;     // ISO 8601
  cursorPosition: { line: number; column: number };
  lineCount: number;
  characterCount: number;
}
```

### 4.4 FilterState

Stored in URL search params and synced to component state.

```typescript
interface FilterState {
  query: string;                   // full-text search
  tags: string[];                  // AND logic
  visibility: 'all' | 'private' | 'shared' | 'public';
  createdAfter: string | null;     // ISO 8601 date
  createdBefore: string | null;    // ISO 8601 date
  sortField: 'name' | 'updatedAt' | 'createdAt';
  sortOrder: 'asc' | 'desc';
  page: number;
  pageSize: number;
}
```

### 4.5 OfflineQueueEntry

Persisted in IndexedDB.

```typescript
interface OfflineQueueEntry {
  id: string;                      // UUID
  skillId: string | null;          // null for CREATE
  operation: 'CREATE' | 'UPDATE';
  payload: Record<string, unknown>;
  timestamp: string;               // ISO 8601
  status: 'PENDING' | 'SYNCING' | 'FAILED';
  retryCount: number;
  lastError: string | null;
}
```

---

## 5. Key Workflows

### 5.1 Page Load and Auth Check

See: [`diagrams/sequence_dashboard_load.puml`](diagrams/sequence_dashboard_load.puml)

1. Browser requests the SPA from CDN.
2. CDN returns the HTML shell and JS bundles.
3. React app mounts. `AuthProvider` calls `POST /api/v1/auth/refresh` (browser sends httpOnly cookie).
4. If refresh succeeds: access token stored in memory, user set as authenticated, app renders the requested route.
5. If refresh fails: user redirected to `/login`.

### 5.2 Dashboard Load with Skeleton States

1. `SkillDashboard` mounts and renders skeleton loader cards immediately.
2. TanStack Query triggers `GET /api/v1/skills?page=1&page_size=25` (plus any filter params from URL).
3. Axios interceptor attaches the `Authorization: Bearer <token>` header.
4. On success: skeleton cards are replaced with real skill cards. Pagination controls rendered.
5. On failure: ErrorBoundary displays appropriate error (network error with retry, 500 with correlation_id).

### 5.3 Create/Edit Skill in Editor

See: [`diagrams/sequence_edit_skill.puml`](diagrams/sequence_edit_skill.puml)

**Edit Flow:**
1. User navigates to `/skills/:id/edit`.
2. `SkillEditor` fetches `GET /api/v1/skills/:id`. Stores the etag from the `ETag` response header.
3. Monaco editor initializes with the skill body. Status bar shows line count, cursor position, character count.
4. User edits content. `isDirty` flag set to `true`.
5. User presses Ctrl+S. Editor sends `PUT /api/v1/skills/:id` with `If-Match: <etag>`.
6. On 200: New etag stored, `isDirty` reset, "Saved" shown in status bar.
7. On 409: Conflict dialog shown. User chooses to overwrite, merge, or discard local changes.

**Create Flow:**
1. User navigates to `/skills/new`.
2. Monaco editor initializes empty. User fills in name, description, tags in a side panel or top form.
3. User presses Ctrl+S. Editor sends `POST /api/v1/skills`.
4. On 201: Returned skill ID stored, URL updated to `/skills/:id/edit`, etag stored.

### 5.4 Offline Editing and Sync

See: [`diagrams/sequence_offline_sync.puml`](diagrams/sequence_offline_sync.puml)

1. User is editing a skill. Browser loses network connectivity.
2. `OfflineQueue` detects `offline` event. Banner displayed: "You are offline."
3. User continues editing. On save (Ctrl+S), the mutation is written to IndexedDB instead of sent to the API.
4. Browser regains connectivity. `OfflineQueue` detects `online` event.
5. Queue processes entries in order. Each entry is sent to the API.
6. On success: entry removed from IndexedDB, local state updated.
7. On conflict (409): entry marked `FAILED`, user prompted to resolve.
8. Banner dismissed after all entries processed successfully.

### 5.5 Responsive Layout Switching

CSS media queries and a `useBreakpoint()` hook drive layout changes:

| Breakpoint | CSS Class | Layout Effect |
|------------|-----------|---------------|
| <576px | `.layout-xs` | Single column, hamburger nav, full-width editor, collapsible toolbar |
| >=576px, <768px | `.layout-sm` | Single column, top nav bar |
| >=768px, <992px | `.layout-md` | Two-column grid, top nav bar |
| >=992px, <1200px | `.layout-lg` | Sidebar nav + two-column grid |
| >=1200px | `.layout-xl` | Sidebar nav + split-pane editor with live preview |

The `useBreakpoint()` hook uses `window.matchMedia` listeners (not `resize` events) for efficient detection. Components conditionally render based on the current breakpoint value.

---

## 6. API Contracts

### 6.1 HTTP Client

All API communication goes through a centralized Axios instance configured as follows:

```typescript
const apiClient = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  withCredentials: true,  // sends httpOnly cookie for refresh
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});
```

### 6.2 Request Interceptor

Attaches the in-memory access token to every request:

```typescript
apiClient.interceptors.request.use((config) => {
  const token = authStore.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### 6.3 Response Interceptor

Handles token refresh and error routing:

```typescript
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      const refreshed = await authStore.refresh();
      if (refreshed) {
        error.config.headers.Authorization =
          `Bearer ${authStore.getAccessToken()}`;
        return apiClient(error.config);
      }
      redirectToLogin('Session expired');
    }
    if (error.response?.status === 403) {
      redirectToLogin('Insufficient permissions');
    }
    return Promise.reject(error);
  }
);
```

### 6.4 Key API Endpoints Used

| Action | Method | Endpoint | Request | Response |
|--------|--------|----------|---------|----------|
| Refresh token | POST | `/auth/refresh` | (cookie) | `{ accessToken }` |
| List skills | GET | `/skills?page=&page_size=&q=&tags=&sort=&order=` | - | `SkillListResponse` |
| Get skill | GET | `/skills/:id` | - | `Skill` + `ETag` header |
| Create skill | POST | `/skills` | `{ name, description, body, tags }` | `Skill` (201) |
| Update skill | PUT | `/skills/:id` | `{ name, description, body, tags }` + `If-Match` header | `Skill` (200) or 409 |
| Delete skill | DELETE | `/skills/:id` | - | 204 |
| List versions | GET | `/skills/:id/versions` | - | `Version[]` |
| Diff versions | GET | `/skills/:id/versions/:v1/diff/:v2` | - | `Diff` |
| Restore version | POST | `/skills/:id/versions/:v/restore` | - | `Skill` (201) |
| Health check | GET | `/health` | - | `{ status, dependencies }` |

### 6.5 Error Response Handling

All API errors follow the standard envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Name is required",
    "details": [{ "field": "name", "reason": "required" }],
    "correlationId": "abc-123-def"
  }
}
```

The HTTP client maps these to user-facing messages:
- **400**: Display field-level validation errors inline on the form.
- **401**: Trigger token refresh or redirect to login.
- **403**: Redirect to login with "Insufficient permissions" message.
- **404**: Display "Skill not found" with navigation back to dashboard.
- **409**: Display conflict resolution dialog in the editor.
- **429**: Display "Too many requests. Please wait." with countdown from `Retry-After`.
- **500**: Display "An unexpected error occurred. Reference: <correlationId>" (L2-033 AC3).

---

## 7. Security Considerations

### 7.1 XSS Prevention

- All user-generated content is rendered through React's JSX, which auto-escapes by default.
- The Markdown preview uses `react-markdown` with `rehype-sanitize` to strip dangerous HTML from rendered skill content.
- `dangerouslySetInnerHTML` is never used.

### 7.2 Token Storage

- Access tokens are stored in a JavaScript variable (module scope), never in localStorage, sessionStorage, or cookies accessible to JS.
- Refresh tokens are managed exclusively by the server via httpOnly cookies with `Secure` and `SameSite=Strict` flags.
- On logout, the SPA calls `POST /api/v1/auth/logout` (which invalidates server-side) and clears the in-memory access token.

### 7.3 Content Security Policy (CSP)

The SPA is served with a strict CSP header (set by the CDN or API server):

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  connect-src 'self' https://api.example.com;
  font-src 'self';
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
```

Note: `'unsafe-inline'` for `style-src` is required by Monaco Editor for its dynamic styling. This is an accepted trade-off documented here.

### 7.4 No Sensitive Data in localStorage

The application stores only non-sensitive UI preferences in localStorage:
- `filterState`: Last-used filter configuration (tags, sort order).
- `sidebarCollapsed`: Boolean for sidebar state.

No tokens, user data, or skill content is stored in localStorage. The offline queue uses IndexedDB, which stores skill content only when the user explicitly saves while offline; this data is cleared after successful sync.

### 7.5 CSRF Protection

State-mutating requests include a CSRF token obtained from a `GET /api/v1/auth/csrf` endpoint. The token is sent as an `X-CSRF-Token` header on POST, PUT, and DELETE requests. The Axios request interceptor handles this transparently.

### 7.6 Dependency Security

- Monaco Editor is loaded from the application bundle (not a third-party CDN) to prevent supply chain attacks.
- All npm dependencies are audited in CI via `npm audit` with a zero-critical-vulnerability policy.

---

## 8. Open Questions

| # | Question | Impact | Status |
|---|----------|--------|--------|
| 1 | Should the SPA support a light mode toggle in the future, or is dark mode permanently the only theme? | Affects CSS architecture (CSS variables vs. hardcoded values). Current design uses CSS variables for forward compatibility. | Open |
| 2 | What is the maximum number of skills a user can select for bulk delete? | Affects UI for selection and API batching strategy. Currently unlimited with client-side pagination. | Open |
| 3 | Should the offline queue support CREATE operations, or only UPDATE? | Creating a skill offline requires generating a temporary ID and reconciling on sync. Current design supports both. | Open |
| 4 | What is the CSRF token delivery mechanism: cookie-to-header or endpoint-based? | Current design assumes an endpoint (`/auth/csrf`). Needs alignment with the API team. | Open |
| 5 | Should the Markdown preview in split-pane mode support custom skill-specific syntax extensions? | Would require a custom `remark` plugin. Out of scope for initial release. | Open |
| 6 | What is the CDN strategy for cache invalidation on new deployments? | Affects asset filename hashing and service worker strategy. | Open |
| 7 | Should the editor auto-save on a timer (e.g., every 30 seconds), or only on explicit Ctrl+S? | Affects UX and API load. Current design is explicit save only. | Open |
