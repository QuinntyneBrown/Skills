import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.skills');
const TOKEN_FILE = path.join(CONFIG_DIR, 'token.json');

function getApiUrl(): string {
  return process.env.SKILLS_API_URL || 'http://localhost:3000';
}

function getToken(): { accessToken: string; refreshToken: string } | null {
  // Check env var first
  if (process.env.CLAUDE_SKILLS_API_KEY) {
    return null; // Will use API key header instead
  }
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
    }
  } catch {}
  return null;
}

function saveToken(tokens: { accessToken: string; refreshToken: string }): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens), { mode: 0o600 });
}

function clearToken(): void {
  try { fs.unlinkSync(TOKEN_FILE); } catch {}
}

async function request(method: string, urlPath: string, body?: any): Promise<{ status: number; data: any }> {
  const baseUrl = getApiUrl();
  const url = new URL(`/api/v1${urlPath}`, baseUrl);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (process.env.CLAUDE_SKILLS_API_KEY) {
    headers['X-API-Key'] = process.env.CLAUDE_SKILLS_API_KEY;
  } else {
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token.accessToken}`;
    }
  }

  const payload = body ? JSON.stringify(body) : undefined;
  if (payload) headers['Content-Length'] = Buffer.byteLength(payload).toString();

  return new Promise((resolve, reject) => {
    const req = lib.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, data: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode || 0, data: data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export { request, getToken, saveToken, clearToken, getApiUrl };
