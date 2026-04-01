"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.request = request;
exports.getToken = getToken;
exports.saveToken = saveToken;
exports.clearToken = clearToken;
exports.getApiUrl = getApiUrl;
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const CONFIG_DIR = path_1.default.join(os_1.default.homedir(), '.skills');
const TOKEN_FILE = path_1.default.join(CONFIG_DIR, 'token.json');
function getApiUrl() {
    return process.env.SKILLS_API_URL || 'http://localhost:3000';
}
function getToken() {
    // Check env var first
    if (process.env.CLAUDE_SKILLS_API_KEY) {
        return null; // Will use API key header instead
    }
    try {
        if (fs_1.default.existsSync(TOKEN_FILE)) {
            return JSON.parse(fs_1.default.readFileSync(TOKEN_FILE, 'utf-8'));
        }
    }
    catch { }
    return null;
}
function saveToken(tokens) {
    if (!fs_1.default.existsSync(CONFIG_DIR)) {
        fs_1.default.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    fs_1.default.writeFileSync(TOKEN_FILE, JSON.stringify(tokens), { mode: 0o600 });
}
function clearToken() {
    try {
        fs_1.default.unlinkSync(TOKEN_FILE);
    }
    catch { }
}
async function request(method, urlPath, body) {
    const baseUrl = getApiUrl();
    const url = new URL(`/api/v1${urlPath}`, baseUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https_1.default : http_1.default;
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.CLAUDE_SKILLS_API_KEY) {
        headers['X-API-Key'] = process.env.CLAUDE_SKILLS_API_KEY;
    }
    else {
        const token = getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token.accessToken}`;
        }
    }
    const payload = body ? JSON.stringify(body) : undefined;
    if (payload)
        headers['Content-Length'] = Buffer.byteLength(payload).toString();
    return new Promise((resolve, reject) => {
        const req = lib.request(url, { method, headers }, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode || 0, data: data ? JSON.parse(data) : null });
                }
                catch {
                    resolve({ status: res.statusCode || 0, data: data });
                }
            });
        });
        req.on('error', reject);
        if (payload)
            req.write(payload);
        req.end();
    });
}
//# sourceMappingURL=api-client.js.map