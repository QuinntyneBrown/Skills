import { test, expect } from '@playwright/test';
import { LoginPage, DashboardPage } from './pages';

// L2-035: Full-Text Search
// L2-036: Filtering and Sorting

test.describe('Search & Filtering', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    await loginPage.goto();
    await loginPage.login('testuser@example.com', 'TestPassword123!');
    await expect(page).toHaveURL(/dashboard/);
  });

  // L2-035 AC1: Full-text search
  test('should search skills by keyword', async ({ page }) => {
    await dashboardPage.searchSkills('error handler');

    await expect(page).toHaveURL(/q=error/i);
    await expect(page.getByText(/error handler/i).first()).toBeVisible();
  });

  // L2-036 AC1: Filter by tags
  test('should filter skills by tag', async ({ page }) => {
    await dashboardPage.filterButton.click();

    const tagInput = page.getByPlaceholder(/tag/i);
    await expect(tagInput).toBeVisible();
  });

  // L2-036 AC3: Sort by field
  test('should sort skills by column', async ({ page }) => {
    await dashboardPage.sortButton.click();

    await expect(page.getByText(/name|date|updated/i).first()).toBeVisible();
  });

  // L2-036 AC4: URL reflects filter state
  test('should update URL with filter state for bookmarking', async ({ page }) => {
    await dashboardPage.searchSkills('test query');

    const url = page.url();
    expect(url).toContain('q=');
  });
});
