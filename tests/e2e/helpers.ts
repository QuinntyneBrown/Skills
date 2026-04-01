import { Page, expect } from '@playwright/test';

export const API_URL = 'http://localhost:3000/api/v1';

export async function registerUser(page: Page, email: string, password: string) {
  const response = await page.request.post(`${API_URL}/auth/register`, {
    data: { email, password },
  });
  return response;
}

export async function loginUser(page: Page, email: string, password: string) {
  const response = await page.request.post(`${API_URL}/auth/login`, {
    data: { email, password },
  });
  return response;
}

export async function loginViaUI(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

export async function createSkillViaAPI(page: Page, token: string, skill: { name: string; body: string; tags?: string[]; description?: string; visibility?: string }) {
  const response = await page.request.post(`${API_URL}/skills`, {
    headers: { Authorization: `Bearer ${token}` },
    data: skill,
  });
  return response;
}

export function generateTestEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`;
}

export const TEST_PASSWORD = 'TestPassword123!';
