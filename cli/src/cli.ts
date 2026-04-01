#!/usr/bin/env node

import { Command } from 'commander';
import readline from 'readline';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { request, saveToken, clearToken, getApiUrl } from './api-client';
import { printTable, printJSON, printSuccess, printError } from './output';

const VERSION = '1.0.0';

function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (hidden) {
      // For password input, mute output
      const stdout = process.stdout;
      let answer = '';
      stdout.write(question);
      const stdin = process.stdin;
      stdin.setRawMode?.(true);
      stdin.resume();
      stdin.setEncoding('utf-8');
      rl.close();

      const onData = (ch: string) => {
        const c = ch.toString();
        if (c === '\n' || c === '\r' || c === '\u0004') {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          stdout.write('\n');
          resolve(answer);
        } else if (c === '\u0003') {
          process.exit(130);
        } else if (c === '\u007F' || c === '\b') {
          if (answer.length > 0) {
            answer = answer.slice(0, -1);
          }
        } else {
          answer += c;
        }
      };
      stdin.on('data', onData);
    } else {
      rl.question(question, (ans) => {
        rl.close();
        resolve(ans);
      });
    }
  });
}

function confirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(`${question} [y/N] `, (ans) => {
      rl.close();
      resolve(ans.toLowerCase() === 'y' || ans.toLowerCase() === 'yes');
    });
  });
}

async function handleApiError(status: number, data: any): Promise<never> {
  if (status === 401) {
    printError("Authentication required. Run 'skills login' to re-authenticate");
    process.exit(2);
  }
  const message = data?.message || data?.error || `API returned status ${status}`;
  printError(`${message} (status ${status})`);
  process.exit(1);
}

async function handleNetworkError(err: Error): Promise<never> {
  printError(`Network error: ${err.message}. Please check connectivity and that the API is running at ${getApiUrl()}`);
  process.exit(1);
}

const program = new Command();

program
  .name('skills')
  .description('CLI for Skills platform')
  .version(VERSION, '-v, --version', 'Show version');

// ── login ──────────────────────────────────────────────────────────
program
  .command('login')
  .description('Authenticate with the Skills API')
  .action(async () => {
    try {
      const email = await prompt('Email: ');
      const password = await prompt('Password: ', true);

      const { status, data } = await request('POST', '/auth/login', { email, password });

      if (status >= 200 && status < 300) {
        saveToken({ accessToken: data.accessToken, refreshToken: data.refreshToken });
        printSuccess(`Logged in as ${email}`);
      } else {
        await handleApiError(status, data);
      }
    } catch (err) {
      await handleNetworkError(err as Error);
    }
  });

// ── logout ─────────────────────────────────────────────────────────
program
  .command('logout')
  .description('Clear stored authentication tokens')
  .action(() => {
    clearToken();
    printSuccess('Logged out successfully');
  });

// ── create ─────────────────────────────────────────────────────────
program
  .command('create')
  .description('Create a new skill')
  .requiredOption('--name <name>', 'Skill name')
  .option('--body <body>', 'Skill body content')
  .option('--body-file <path>', 'Read body from file')
  .option('--tags <csv>', 'Comma-separated tags')
  .option('--description <text>', 'Skill description')
  .option('--json', 'Output as JSON')
  .option('--quiet', 'Only output the skill ID')
  .action(async (opts) => {
    let body = opts.body || '';
    if (opts.bodyFile) {
      try {
        body = fs.readFileSync(opts.bodyFile, 'utf-8');
      } catch (err) {
        printError(`Cannot read file: ${opts.bodyFile}`);
        process.exit(64);
      }
    }
    if (!body && !opts.bodyFile) {
      printError('Either --body or --body-file is required');
      process.exit(64);
    }

    const payload: any = { name: opts.name, body };
    if (opts.tags) payload.tags = opts.tags.split(',').map((t: string) => t.trim());
    if (opts.description) payload.description = opts.description;

    try {
      const { status, data } = await request('POST', '/skills', payload);

      if (status >= 200 && status < 300) {
        if (opts.quiet) {
          console.log(data.id || data._id);
        } else if (opts.json) {
          printJSON(data);
        } else {
          printSuccess(`Created skill "${data.name}" (${data.id || data._id})`);
        }
      } else {
        await handleApiError(status, data);
      }
    } catch (err) {
      await handleNetworkError(err as Error);
    }
  });

// ── get ────────────────────────────────────────────────────────────
program
  .command('get <id>')
  .description('Get a skill by ID')
  .option('--json', 'Output as JSON')
  .action(async (id: string, opts) => {
    try {
      const { status, data } = await request('GET', `/skills/${id}`);

      if (status >= 200 && status < 300) {
        if (opts.json) {
          printJSON(data);
        } else {
          const skill = data;
          console.log();
          console.log(`  Name:        ${skill.name}`);
          console.log(`  ID:          ${skill.id || skill._id}`);
          if (skill.description) console.log(`  Description: ${skill.description}`);
          if (skill.tags?.length) console.log(`  Tags:        ${skill.tags.join(', ')}`);
          console.log(`  Created:     ${skill.createdAt || 'N/A'}`);
          console.log(`  Updated:     ${skill.updatedAt || 'N/A'}`);
          console.log();
          console.log('  Body:');
          console.log('  ' + '─'.repeat(60));
          const lines = (skill.body || '').split('\n');
          lines.forEach((line: string) => console.log(`  ${line}`));
          console.log();
        }
      } else {
        await handleApiError(status, data);
      }
    } catch (err) {
      await handleNetworkError(err as Error);
    }
  });

// ── list ───────────────────────────────────────────────────────────
program
  .command('list')
  .description('List skills')
  .option('--page <n>', 'Page number', '1')
  .option('--page-size <n>', 'Items per page', '10')
  .option('--json', 'Output as JSON')
  .option('--quiet', 'Only output skill IDs')
  .action(async (opts) => {
    const page = parseInt(opts.page, 10);
    const pageSize = parseInt(opts.pageSize, 10);

    try {
      const { status, data } = await request('GET', `/skills?page=${page}&pageSize=${pageSize}`);

      if (status >= 200 && status < 300) {
        const skills = data.items || data.skills || data.data || (Array.isArray(data) ? data : []);
        const total = data.total ?? data.totalCount ?? skills.length;
        const totalPages = data.totalPages ?? Math.ceil(total / pageSize);
        const startIndex = (page - 1) * pageSize + 1;
        const endIndex = Math.min(page * pageSize, total);

        if (opts.json) {
          printJSON(data);
        } else if (opts.quiet) {
          skills.forEach((s: any) => console.log(s.id || s._id));
        } else {
          if (skills.length === 0) {
            console.log('\n  No skills found.\n');
            return;
          }

          console.log();
          const rows = skills.map((s: any) => [
            s.id || s._id || '',
            s.name || '',
            (s.tags || []).join(', '),
            s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : 'N/A',
          ]);
          printTable(['ID', 'NAME', 'TAGS', 'UPDATED'], rows);
          console.log();
          console.log(`  Showing ${startIndex}-${endIndex} of ${total} skills (page ${page}/${totalPages})`);
          console.log();
        }
      } else {
        await handleApiError(status, data);
      }
    } catch (err) {
      await handleNetworkError(err as Error);
    }
  });

// ── update ─────────────────────────────────────────────────────────
program
  .command('update <id>')
  .description('Update a skill')
  .option('--name <name>', 'New name')
  .option('--description <text>', 'New description')
  .option('--tags <csv>', 'New comma-separated tags')
  .option('--body <body>', 'New body content')
  .option('--body-file <path>', 'Read new body from file')
  .option('--json', 'Output as JSON')
  .action(async (id: string, opts) => {
    const payload: any = {};
    if (opts.name) payload.name = opts.name;
    if (opts.description) payload.description = opts.description;
    if (opts.tags) payload.tags = opts.tags.split(',').map((t: string) => t.trim());
    if (opts.bodyFile) {
      try {
        payload.body = fs.readFileSync(opts.bodyFile, 'utf-8');
      } catch (err) {
        printError(`Cannot read file: ${opts.bodyFile}`);
        process.exit(64);
      }
    } else if (opts.body) {
      payload.body = opts.body;
    }

    if (Object.keys(payload).length === 0) {
      printError('No update fields provided. Use --name, --description, --tags, --body, or --body-file');
      process.exit(64);
    }

    try {
      const { status, data } = await request('PATCH', `/skills/${id}`, payload);

      if (status >= 200 && status < 300) {
        if (opts.json) {
          printJSON(data);
        } else {
          printSuccess(`Updated skill ${id}`);
        }
      } else {
        await handleApiError(status, data);
      }
    } catch (err) {
      await handleNetworkError(err as Error);
    }
  });

// ── delete ─────────────────────────────────────────────────────────
program
  .command('delete <id>')
  .description('Delete a skill')
  .option('--yes', 'Skip confirmation prompt')
  .action(async (id: string, opts) => {
    if (!opts.yes) {
      const ok = await confirm(`Delete skill ${id}?`);
      if (!ok) {
        console.log('Cancelled.');
        return;
      }
    }

    try {
      const { status, data } = await request('DELETE', `/skills/${id}`);

      if (status >= 200 && status < 300) {
        printSuccess(`Deleted skill ${id}`);
      } else {
        await handleApiError(status, data);
      }
    } catch (err) {
      await handleNetworkError(err as Error);
    }
  });

// ── edit ───────────────────────────────────────────────────────────
program
  .command('edit <id>')
  .description('Open a skill in $EDITOR for editing')
  .action(async (id: string) => {
    const editor = process.env.EDITOR || process.env.VISUAL || 'vi';

    try {
      // Fetch current skill
      const { status, data } = await request('GET', `/skills/${id}`);
      if (status < 200 || status >= 300) {
        await handleApiError(status, data);
      }

      // Write body to temp file
      const tmpDir = os.tmpdir();
      const tmpFile = path.join(tmpDir, `skills-${id}-${Date.now()}.txt`);
      fs.writeFileSync(tmpFile, data.body || '', 'utf-8');

      // Get mtime before editing
      const mtimeBefore = fs.statSync(tmpFile).mtimeMs;

      // Open editor
      try {
        execSync(`${editor} "${tmpFile}"`, { stdio: 'inherit' });
      } catch {
        printError(`Editor "${editor}" exited with an error. Set $EDITOR to your preferred editor.`);
        fs.unlinkSync(tmpFile);
        process.exit(1);
      }

      // Check if file was modified
      const mtimeAfter = fs.statSync(tmpFile).mtimeMs;
      if (mtimeAfter === mtimeBefore) {
        console.log('No changes detected. Skipping update.');
        fs.unlinkSync(tmpFile);
        return;
      }

      // Read updated content and push
      const newBody = fs.readFileSync(tmpFile, 'utf-8');
      fs.unlinkSync(tmpFile);

      const updateRes = await request('PATCH', `/skills/${id}`, { body: newBody });
      if (updateRes.status >= 200 && updateRes.status < 300) {
        printSuccess(`Updated skill ${id}`);
      } else {
        await handleApiError(updateRes.status, updateRes.data);
      }
    } catch (err) {
      await handleNetworkError(err as Error);
    }
  });

// ── version (explicit subcommand) ─────────────────────────────────
program
  .command('version')
  .description('Show CLI version')
  .action(() => {
    console.log(`skills-cli v${VERSION}`);
  });

// Handle unknown commands
program.on('command:*', () => {
  printError(`Unknown command: ${program.args.join(' ')}`);
  program.outputHelp();
  process.exit(64);
});

program.parse(process.argv);
