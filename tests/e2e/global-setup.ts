import { request } from '@playwright/test';

/**
 * Global setup: ensure the test user exists and has at least 2 skills
 * so that dashboard, sharing, search, version-history tests have data to work with.
 */
export default async function globalSetup() {
  const baseURL = 'http://localhost:3000/api/v1';

  const ctx = await request.newContext({ baseURL });

  // Register test user (ignore if already exists)
  try {
    await ctx.post('/auth/register', {
      data: { email: 'testuser@example.com', password: 'TestPassword123!' },
    });
  } catch {
    // user may already exist
  }

  // Login
  const loginRes = await ctx.post('/auth/login', {
    data: { email: 'testuser@example.com', password: 'TestPassword123!' },
  });
  const loginBody = await loginRes.json();
  const token = loginBody.accessToken || loginBody.data?.accessToken || loginBody.token;

  if (!token) {
    console.warn('[global-setup] Could not obtain auth token – skipping seed');
    await ctx.dispose();
    return;
  }

  const headers = { Authorization: `Bearer ${token}` };

  // Fetch existing skills
  const listRes = await ctx.get('/skills?page_size=100', { headers });
  const listBody = await listRes.json();
  const existingSkills: { id: string; name: string }[] = listBody.data || [];

  // Seed skill 1: "Error Handler"  (used by search tests)
  const skill1Exists = existingSkills.some((s) => s.name === 'Error Handler');
  let skill1Id: string | null = null;
  if (!skill1Exists) {
    const res = await ctx.post('/skills', {
      headers,
      data: {
        name: 'Error Handler',
        description: 'A skill for handling errors gracefully',
        body: '# Error Handler\n\nThis skill covers error handling patterns.\n\n## Patterns\n- Try/catch\n- Error boundaries\n- Global handlers',
        tags: ['error-handling', 'typescript', 'patterns'],
        visibility: 'private',
      },
    });
    const body = await res.json();
    skill1Id = body.data?.id;
  } else {
    skill1Id = existingSkills.find((s) => s.name === 'Error Handler')!.id;
  }

  // Seed skill 2: "API Design Guide"
  const skill2Exists = existingSkills.some((s) => s.name === 'API Design Guide');
  let skill2Id: string | null = null;
  if (!skill2Exists) {
    const res = await ctx.post('/skills', {
      headers,
      data: {
        name: 'API Design Guide',
        description: 'Best practices for REST API design',
        body: '# API Design Guide\n\nRESTful API best practices.\n\n## Endpoints\n- Use nouns\n- Version your API',
        tags: ['api', 'rest', 'design'],
        visibility: 'shared',
      },
    });
    const body = await res.json();
    skill2Id = body.data?.id;
  } else {
    skill2Id = existingSkills.find((s) => s.name === 'API Design Guide')!.id;
  }

  // Create a second version for the first skill (needed for version-history diff tests)
  if (skill1Id) {
    try {
      // Get current skill to know its version
      const skillRes = await ctx.get(`/skills/${skill1Id}`, { headers });
      const skillBody = await skillRes.json();
      const currentVersion = skillBody.data?.version || 1;

      await ctx.patch(`/skills/${skill1Id}`, {
        headers,
        data: {
          name: 'Error Handler',
          description: 'A skill for handling errors gracefully - updated',
          body: '# Error Handler\n\nThis skill covers error handling patterns.\n\n## Patterns\n- Try/catch\n- Error boundaries\n- Global handlers\n- Retry logic\n\n## Best Practices\n- Always log errors\n- Use typed errors',
          tags: ['error-handling', 'typescript', 'patterns', 'best-practices'],
          visibility: 'private',
          version: currentVersion,
        },
      });
    } catch {
      // version conflict or other issue - skip
    }
  }

  await ctx.dispose();
}
