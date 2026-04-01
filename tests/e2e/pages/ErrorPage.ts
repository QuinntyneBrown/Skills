import { type Locator, type Page, expect } from '@playwright/test';

export class ErrorPage {
  readonly page: Page;
  readonly notFoundMessage: Locator;
  readonly serverErrorMessage: Locator;
  readonly correlationId: Locator;
  readonly sessionExpiredMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.notFoundMessage = page.getByText(/not found|404/i);
    this.serverErrorMessage = page.getByText(/something went wrong|unexpected error/i);
    this.correlationId = page.getByText(/correlation.*id|test-corr-id/i);
    this.sessionExpiredMessage = page.getByText(/session expired|sign in again/i);
  }

  async mockServerError() {
    await this.page.route('**/api/v1/skills*', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
            correlation_id: 'test-corr-id-12345',
          },
        }),
      })
    );
  }

  async mockNetworkFailure() {
    await this.page.route('**/api/v1/skills*', (route) => route.abort('failed'));
  }

  async mockTokenExpired() {
    await this.page.route('**/api/v1/skills*', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'UNAUTHORIZED', message: 'Token expired' },
        }),
      })
    );
  }

  async setFakeToken() {
    await this.page.evaluate(() => {
      // Create a valid-looking JWT so AuthProvider can parse it
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify({ sub: 'fake-user-id', roles: ['user'], exp: Math.floor(Date.now() / 1000) - 3600 }));
      const signature = 'fake-signature';
      sessionStorage.setItem('accessToken', `${header}.${payload}.${signature}`);
    });
  }
}
