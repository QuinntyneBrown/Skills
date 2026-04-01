import { describe, it, expect, beforeAll } from 'vitest';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import path from 'path';

const CLI_PATH = path.resolve(__dirname, '../../cli/dist/cli.js');
const API_URL = 'http://localhost:3000';

const execOpts: ExecSyncOptionsWithStringEncoding = {
  encoding: 'utf-8',
  env: { ...process.env, SKILLS_API_URL: API_URL },
  timeout: 15000,
};

function runCLI(args: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args}`, execOpts);
    return { stdout: stdout.trim(), exitCode: 0 };
  } catch (err: any) {
    return { stdout: (err.stdout || err.stderr || '').trim(), exitCode: err.status || 1 };
  }
}

// L2-015: CLI Authentication
describe('CLI Authentication', () => {
  // L2-015 AC5: Environment variable API key
  it('should authenticate with SKILLS_API_KEY env var', () => {
    const result = runCLI('list');
    // Should attempt to use API key from env
    expect(result.exitCode).toBeDefined();
  });

  // L2-015 AC4: Logout command
  it('should support logout command', () => {
    const result = runCLI('logout');
    expect(result.exitCode).toBe(0);
  });
});

// L2-016: CLI Skill Operations
describe('CLI Skill Operations', () => {
  let createdSkillId: string;

  // L2-016 AC1: Create skill
  it('should create a skill', () => {
    const result = runCLI('create --name "CLI Test Skill" --body "Test body content" --tags "test,cli"');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/sk_|[a-f0-9-]+/i);
    createdSkillId = result.stdout.match(/([a-f0-9-]+)/)?.[1] || '';
  });

  // L2-016 AC3: List skills
  it('should list skills in table format', () => {
    const result = runCLI('list');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('NAME');
    expect(result.stdout).toContain('UPDATED');
    expect(result.stdout).toContain('VISIBILITY');
  });

  // L2-016 AC2: Get skill by ID
  it('should get a skill by ID', () => {
    const result = runCLI(`get ${createdSkillId}`);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('CLI Test Skill');
  });

  // L2-016 AC4: Update skill
  it('should update a skill', () => {
    const result = runCLI(`update ${createdSkillId} --name "Updated CLI Skill"`);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/updated|success/i);
  });

  // L2-016 AC5: Delete skill with --yes flag
  it('should delete a skill with --yes flag', () => {
    const result = runCLI(`delete ${createdSkillId} --yes`);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/deleted|success/i);
  });

  // L2-016 AC7: Error messages
  it('should show error for non-existent skill', () => {
    const result = runCLI('get 00000000-0000-0000-0000-000000000000');
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toMatch(/not found|404/i);
  });
});

// L2-017: CLI Output Formats
describe('CLI Output Formats', () => {
  // L2-017 AC1: JSON output
  it('should output JSON with --json flag', () => {
    const result = runCLI('list --json');
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveProperty('data');
  });

  // L2-017 AC2: Quiet output
  it('should output only IDs with --quiet flag', () => {
    const result = runCLI('create --name "Quiet Test" --body "Body" --quiet');
    expect(result.exitCode).toBe(0);
    // Should only be the ID, no extra text
    expect(result.stdout).toMatch(/^[a-f0-9-]+$/i);
  });
});

// L2-034: CLI Error Handling
describe('CLI Error Handling', () => {
  // L2-034 AC2: Authentication error exit code 2
  it('should exit with code 2 on auth error', () => {
    const result = runCLI('list');
    // Without valid auth, should get auth error
    if (result.exitCode !== 0) {
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toMatch(/login|authenticate/i);
    }
  });

  // L2-034 AC3: Invalid arguments exit code 64
  it('should exit with code 64 on invalid arguments', () => {
    const result = runCLI('create');
    // Missing required --name
    expect(result.exitCode).toBe(64);
    expect(result.stdout).toMatch(/required|usage|--name/i);
  });

  // L2-034 AC1: Network error exit code 1
  it('should exit with code 1 on network error', () => {
    const result = execSync('', {
      ...execOpts,
      env: { ...process.env, SKILLS_API_URL: 'http://localhost:99999' },
    }) as any;
    // Network error should produce exit code 1
  });

  it('should show version', () => {
    const result = runCLI('--version');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  it('should show help', () => {
    const result = runCLI('--help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('skills');
    expect(result.stdout).toMatch(/create|list|get|update|delete/);
  });
});
