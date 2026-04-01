import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(12, 'Password must be at least 12 characters'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export const createSkillSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').max(200, 'Name must not exceed 200 characters'),
    description: z.string().max(2000).optional(),
    body: z.string().min(1, 'Body is required').max(500000, 'Body must not exceed 500,000 characters'),
    tags: z.array(z.string().max(50)).max(20).optional(),
    visibility: z.enum(['private', 'shared', 'public']).optional(),
  }),
});

export const updateSkillSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid skill ID'),
  }),
  body: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    body: z.string().min(1).max(500000).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    visibility: z.enum(['private', 'shared', 'public']).optional(),
    version: z.number().int().positive('Version is required for optimistic concurrency'),
  }),
});

export const skillIdParam = z.object({
  params: z.object({
    id: z.string().uuid('Invalid skill ID'),
  }),
});

export const listSkillsSchema = z.object({
  query: z.object({
    q: z.string().max(256).optional(),
    tags: z.string().optional(),
    author: z.string().uuid().optional(),
    visibility: z.enum(['private', 'shared', 'public']).optional(),
    created_after: z.string().optional(),
    created_before: z.string().optional(),
    sort: z.enum(['name', 'created_at', 'updated_at', 'relevance']).optional(),
    order: z.enum(['asc', 'desc']).optional(),
    page: z.coerce.number().int().positive().optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const shareSkillSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid skill ID'),
  }),
  body: z.object({
    user_id: z.string().uuid().optional(),
    email: z.string().email().optional(),
    permission: z.enum(['read', 'write']),
  }).refine((data) => data.user_id || data.email, {
    message: 'Either user_id or email must be provided',
  }),
});

export const revokeShareSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid skill ID'),
    userId: z.string().uuid('Invalid user ID'),
  }),
});

export const versionListSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid skill ID'),
  }),
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const versionGetSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid skill ID'),
    version: z.coerce.number().int().positive('Invalid version number'),
  }),
});

export const versionDiffSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid skill ID'),
    v1: z.coerce.number().int().positive('Invalid version number'),
    v2: z.coerce.number().int().positive('Invalid version number'),
  }),
});

export const versionRestoreSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid skill ID'),
    version: z.coerce.number().int().positive('Invalid version number'),
  }),
});

export const auditQuerySchema = z.object({
  query: z.object({
    user_id: z.string().uuid().optional(),
    resource_type: z.string().optional(),
    action: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    page: z.coerce.number().int().positive().optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
  }),
});
