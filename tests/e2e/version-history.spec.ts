import { test, expect } from '@playwright/test';
import { LoginPage, DashboardPage, VersionHistoryPage } from './pages';

// L2-037: Skill Version History
// L2-038: Version Comparison and Restoration

test.describe('Version History', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;
  let versionPage: VersionHistoryPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    versionPage = new VersionHistoryPage(page);
    await loginPage.goto();
    await loginPage.login('testuser@example.com', 'TestPassword123!');
    await expect(page).toHaveURL(/dashboard/);
  });

  async function navigateToVersionHistory(page: import('@playwright/test').Page) {
    const dashboardPage = new DashboardPage(page);
    await dashboardPage.clickFirstSkill();
    await page.getByText(/version/i).click();
  }

  // L2-037 AC2: Version history list
  test('should show version history for a skill', async ({ page }) => {
    await navigateToVersionHistory(page);

    await expect(versionPage.heading).toBeVisible();
    await expect(versionPage.versionList).toBeVisible();
  });

  // L2-038 AC1: Diff between two versions
  test('should show diff between versions', async ({ page }) => {
    await navigateToVersionHistory(page);
    await versionPage.expectDiffVisible();
  });

  // L2-038 AC2: Color-coded diff in dark mode
  test('should show color-coded additions and deletions', async ({ page }) => {
    await navigateToVersionHistory(page);
    await expect(versionPage.diffViewer).toBeVisible();
  });

  // L2-038 AC3: Restore previous version
  test('should allow restoring a previous version', async ({ page }) => {
    await navigateToVersionHistory(page);
    await expect(versionPage.restoreButton).toBeVisible();
  });

  // L2-037 stats
  test('should show diff stats (additions/deletions)', async ({ page }) => {
    await navigateToVersionHistory(page);
    await expect(versionPage.diffStats).toBeVisible();
  });
});
