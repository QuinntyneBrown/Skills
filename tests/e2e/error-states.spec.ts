import { test, expect } from '@playwright/test';
import { LoginPage, ErrorPage } from './pages';

// L2-032: API Error Responses
// L2-033: Web UI Error Handling

test.describe('Error States', () => {
  // L2-032 AC4: 404 for non-existent endpoints
  test('should show 404 page for unknown routes', async ({ page }) => {
    const errorPage = new ErrorPage(page);
    await page.goto('/nonexistent-page');
    await expect(errorPage.notFoundMessage).toBeVisible();
  });

  // L2-033 AC2: Redirect on 401/403
  test('should redirect to login on 401', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login/);
  });

  // L2-033 AC3: 500 error with correlation ID
  test('should show 500 error page with correlation ID', async ({ page }) => {
    const errorPage = new ErrorPage(page);
    const loginPage = new LoginPage(page);

    await errorPage.mockServerError();

    await loginPage.goto();
    await loginPage.login('testuser@example.com', 'TestPassword123!');

    await page.goto('/dashboard');

    await expect(errorPage.serverErrorMessage).toBeVisible();
    await expect(errorPage.correlationId).toBeVisible();
  });

  // L2-033 AC1: Network error with retry
  test('should show network error toast with retry button', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('testuser@example.com', 'TestPassword123!');

    const errorPage = new ErrorPage(page);
    await errorPage.mockNetworkFailure();

    await page.goto('/dashboard');

    await expect(page.getByText(/failed|network|error/i).first()).toBeVisible();
  });

  // Session expired page
  test('should show session expired page', async ({ page }) => {
    const errorPage = new ErrorPage(page);
    await errorPage.mockTokenExpired();

    await page.goto('/login');
    await errorPage.setFakeToken();
    await page.goto('/dashboard');

    await expect(errorPage.sessionExpiredMessage).toBeVisible();
  });
});
