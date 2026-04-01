// Auth DTOs
export interface RegisterDto {
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface RefreshDto {
  refreshToken: string;
}

// Skill DTOs
export interface CreateSkillDto {
  name: string;
  description?: string;
  body: string;
  tags?: string[];
  visibility?: 'private' | 'shared' | 'public';
}

export interface UpdateSkillDto {
  name?: string;
  description?: string;
  body?: string;
  tags?: string[];
  visibility?: 'private' | 'shared' | 'public';
  version: number; // Required for optimistic concurrency
}

export interface ListSkillsQuery {
  q?: string;
  tags?: string[];
  author?: string;
  visibility?: string;
  created_after?: string;
  created_before?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}

export interface ShareSkillDto {
  user_id?: string;
  email?: string;
  permission: 'read' | 'write';
}

// Pagination
export interface PaginationMeta {
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

// Audit query
export interface AuditQueryDto {
  user_id?: string;
  resource_type?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  page_size?: number;
}

// Token response
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Diff types
export interface DiffLine {
  type: 'add' | 'remove' | 'unchanged';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffResult {
  field: string;
  changes: DiffLine[];
}

export interface VersionDiffResponse {
  diffs: DiffResult[];
  stats: {
    additions: number;
    deletions: number;
  };
}
