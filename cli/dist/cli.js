#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const readline_1 = __importDefault(require("readline"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const api_client_1 = require("./api-client");
const output_1 = require("./output");
const VERSION = '1.0.0';
function prompt(question, hidden = false) {
    return new Promise((resolve) => {
        const rl = readline_1.default.createInterface({
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
            const onData = (ch) => {
                const c = ch.toString();
                if (c === '\n' || c === '\r' || c === '\u0004') {
                    stdin.setRawMode?.(false);
                    stdin.pause();
                    stdin.removeListener('data', onData);
                    stdout.write('\n');
                    resolve(answer);
                }
                else if (c === '\u0003') {
                    process.exit(130);
                }
                else if (c === '\u007F' || c === '\b') {
                    if (answer.length > 0) {
                        answer = answer.slice(0, -1);
                    }
                }
                else {
                    answer += c;
                }
            };
            stdin.on('data', onData);
        }
        else {
            rl.question(question, (ans) => {
                rl.close();
                resolve(ans);
            });
        }
    });
}
function confirm(question) {
    return new Promise((resolve) => {
        const rl = readline_1.default.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question(`${question} [y/N] `, (ans) => {
            rl.close();
            resolve(ans.toLowerCase() === 'y' || ans.toLowerCase() === 'yes');
        });
    });
}
async function handleApiError(status, data) {
    if (status === 401) {
        (0, output_1.printError)("Authentication required. Run 'skills login' to re-authenticate");
        process.exit(2);
    }
    const message = data?.message || data?.error || `API returned status ${status}`;
    (0, output_1.printError)(`${message} (status ${status})`);
    process.exit(1);
}
async function handleNetworkError(err) {
    (0, output_1.printError)(`Network error: ${err.message}. Please check connectivity and that the API is running at ${(0, api_client_1.getApiUrl)()}`);
    process.exit(1);
}
const program = new commander_1.Command();
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
        const { status, data } = await (0, api_client_1.request)('POST', '/auth/login', { email, password });
        if (status >= 200 && status < 300) {
            (0, api_client_1.saveToken)({ accessToken: data.accessToken, refreshToken: data.refreshToken });
            (0, output_1.printSuccess)(`Logged in as ${email}`);
        }
        else {
            await handleApiError(status, data);
        }
    }
    catch (err) {
        await handleNetworkError(err);
    }
});
// ── logout ─────────────────────────────────────────────────────────
program
    .command('logout')
    .description('Clear stored authentication tokens')
    .action(() => {
    (0, api_client_1.clearToken)();
    (0, output_1.printSuccess)('Logged out successfully');
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
            body = fs_1.default.readFileSync(opts.bodyFile, 'utf-8');
        }
        catch (err) {
            (0, output_1.printError)(`Cannot read file: ${opts.bodyFile}`);
            process.exit(64);
        }
    }
    if (!body && !opts.bodyFile) {
        (0, output_1.printError)('Either --body or --body-file is required');
        process.exit(64);
    }
    const payload = { name: opts.name, body };
    if (opts.tags)
        payload.tags = opts.tags.split(',').map((t) => t.trim());
    if (opts.description)
        payload.description = opts.description;
    try {
        const { status, data } = await (0, api_client_1.request)('POST', '/skills', payload);
        if (status >= 200 && status < 300) {
            if (opts.quiet) {
                console.log(data.id || data._id);
            }
            else if (opts.json) {
                (0, output_1.printJSON)(data);
            }
            else {
                (0, output_1.printSuccess)(`Created skill "${data.name}" (${data.id || data._id})`);
            }
        }
        else {
            await handleApiError(status, data);
        }
    }
    catch (err) {
        await handleNetworkError(err);
    }
});
// ── get ────────────────────────────────────────────────────────────
program
    .command('get <id>')
    .description('Get a skill by ID')
    .option('--json', 'Output as JSON')
    .action(async (id, opts) => {
    try {
        const { status, data } = await (0, api_client_1.request)('GET', `/skills/${id}`);
        if (status >= 200 && status < 300) {
            if (opts.json) {
                (0, output_1.printJSON)(data);
            }
            else {
                const skill = data;
                console.log();
                console.log(`  Name:        ${skill.name}`);
                console.log(`  ID:          ${skill.id || skill._id}`);
                if (skill.description)
                    console.log(`  Description: ${skill.description}`);
                if (skill.tags?.length)
                    console.log(`  Tags:        ${skill.tags.join(', ')}`);
                console.log(`  Created:     ${skill.createdAt || 'N/A'}`);
                console.log(`  Updated:     ${skill.updatedAt || 'N/A'}`);
                console.log();
                console.log('  Body:');
                console.log('  ' + '─'.repeat(60));
                const lines = (skill.body || '').split('\n');
                lines.forEach((line) => console.log(`  ${line}`));
                console.log();
            }
        }
        else {
            await handleApiError(status, data);
        }
    }
    catch (err) {
        await handleNetworkError(err);
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
        const { status, data } = await (0, api_client_1.request)('GET', `/skills?page=${page}&pageSize=${pageSize}`);
        if (status >= 200 && status < 300) {
            const skills = data.items || data.skills || data.data || (Array.isArray(data) ? data : []);
            const total = data.total ?? data.totalCount ?? skills.length;
            const totalPages = data.totalPages ?? Math.ceil(total / pageSize);
            const startIndex = (page - 1) * pageSize + 1;
            const endIndex = Math.min(page * pageSize, total);
            if (opts.json) {
                (0, output_1.printJSON)(data);
            }
            else if (opts.quiet) {
                skills.forEach((s) => console.log(s.id || s._id));
            }
            else {
                if (skills.length === 0) {
                    console.log('\n  No skills found.\n');
                    return;
                }
                console.log();
                const rows = skills.map((s) => [
                    s.id || s._id || '',
                    s.name || '',
                    (s.tags || []).join(', '),
                    s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : 'N/A',
                ]);
                (0, output_1.printTable)(['ID', 'NAME', 'TAGS', 'UPDATED'], rows);
                console.log();
                console.log(`  Showing ${startIndex}-${endIndex} of ${total} skills (page ${page}/${totalPages})`);
                console.log();
            }
        }
        else {
            await handleApiError(status, data);
        }
    }
    catch (err) {
        await handleNetworkError(err);
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
    .action(async (id, opts) => {
    const payload = {};
    if (opts.name)
        payload.name = opts.name;
    if (opts.description)
        payload.description = opts.description;
    if (opts.tags)
        payload.tags = opts.tags.split(',').map((t) => t.trim());
    if (opts.bodyFile) {
        try {
            payload.body = fs_1.default.readFileSync(opts.bodyFile, 'utf-8');
        }
        catch (err) {
            (0, output_1.printError)(`Cannot read file: ${opts.bodyFile}`);
            process.exit(64);
        }
    }
    else if (opts.body) {
        payload.body = opts.body;
    }
    if (Object.keys(payload).length === 0) {
        (0, output_1.printError)('No update fields provided. Use --name, --description, --tags, --body, or --body-file');
        process.exit(64);
    }
    try {
        const { status, data } = await (0, api_client_1.request)('PATCH', `/skills/${id}`, payload);
        if (status >= 200 && status < 300) {
            if (opts.json) {
                (0, output_1.printJSON)(data);
            }
            else {
                (0, output_1.printSuccess)(`Updated skill ${id}`);
            }
        }
        else {
            await handleApiError(status, data);
        }
    }
    catch (err) {
        await handleNetworkError(err);
    }
});
// ── delete ─────────────────────────────────────────────────────────
program
    .command('delete <id>')
    .description('Delete a skill')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (id, opts) => {
    if (!opts.yes) {
        const ok = await confirm(`Delete skill ${id}?`);
        if (!ok) {
            console.log('Cancelled.');
            return;
        }
    }
    try {
        const { status, data } = await (0, api_client_1.request)('DELETE', `/skills/${id}`);
        if (status >= 200 && status < 300) {
            (0, output_1.printSuccess)(`Deleted skill ${id}`);
        }
        else {
            await handleApiError(status, data);
        }
    }
    catch (err) {
        await handleNetworkError(err);
    }
});
// ── edit ───────────────────────────────────────────────────────────
program
    .command('edit <id>')
    .description('Open a skill in $EDITOR for editing')
    .action(async (id) => {
    const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
    try {
        // Fetch current skill
        const { status, data } = await (0, api_client_1.request)('GET', `/skills/${id}`);
        if (status < 200 || status >= 300) {
            await handleApiError(status, data);
        }
        // Write body to temp file
        const tmpDir = os_1.default.tmpdir();
        const tmpFile = path_1.default.join(tmpDir, `skills-${id}-${Date.now()}.txt`);
        fs_1.default.writeFileSync(tmpFile, data.body || '', 'utf-8');
        // Get mtime before editing
        const mtimeBefore = fs_1.default.statSync(tmpFile).mtimeMs;
        // Open editor
        try {
            (0, child_process_1.execSync)(`${editor} "${tmpFile}"`, { stdio: 'inherit' });
        }
        catch {
            (0, output_1.printError)(`Editor "${editor}" exited with an error. Set $EDITOR to your preferred editor.`);
            fs_1.default.unlinkSync(tmpFile);
            process.exit(1);
        }
        // Check if file was modified
        const mtimeAfter = fs_1.default.statSync(tmpFile).mtimeMs;
        if (mtimeAfter === mtimeBefore) {
            console.log('No changes detected. Skipping update.');
            fs_1.default.unlinkSync(tmpFile);
            return;
        }
        // Read updated content and push
        const newBody = fs_1.default.readFileSync(tmpFile, 'utf-8');
        fs_1.default.unlinkSync(tmpFile);
        const updateRes = await (0, api_client_1.request)('PATCH', `/skills/${id}`, { body: newBody });
        if (updateRes.status >= 200 && updateRes.status < 300) {
            (0, output_1.printSuccess)(`Updated skill ${id}`);
        }
        else {
            await handleApiError(updateRes.status, updateRes.data);
        }
    }
    catch (err) {
        await handleNetworkError(err);
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
    (0, output_1.printError)(`Unknown command: ${program.args.join(' ')}`);
    program.outputHelp();
    process.exit(64);
});
program.parse(process.argv);
//# sourceMappingURL=cli.js.map