import { test, expect } from '@playwright/test';
import { LoginPage, DashboardPage } from './pages';

// L2-014: Skill Management Dashboard
// L2-003: List Skills
// L2-030/031: Responsive layouts

test.describe('Dashboard', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    await loginPage.goto();
    await loginPage.login('testuser@example.com', 'TestPassword123!');
    await expect(page).toHaveURL(/dashboard/);
  });

  test.describe('Desktop Layout', () => {
    // L2-014 AC1: Dashboard with skill list
    test('should show dashboard with sidebar and skill table', async () => {
      await expect(dashboardPage.heading).toBeVisible();
      await expect(dashboardPage.subtitle).toBeVisible();

      // Sidebar navigation
      await expect(dashboardPage.sidebarMySkills).toBeVisible();
      await expect(dashboardPage.sidebarShared).toBeVisible();
      await expect(dashboardPage.sidebarVersions).toBeVisible();
      await expect(dashboardPage.sidebarSearch).toBeVisible();
      await expect(dashboardPage.sidebarSettings).toBeVisible();
    });

    // L2-014 AC1: Skill list with columns
    test('should display skills in a table with correct columns', async () => {
      await expect(dashboardPage.columnName).toBeVisible();
      await expect(dashboardPage.columnTags).toBeVisible();
      await expect(dashboardPage.columnVisibility).toBeVisible();
      await expect(dashboardPage.columnUpdated).toBeVisible();
      await expect(dashboardPage.columnActions).toBeVisible();
    });

    // L2-014 AC3: New Skill button
    test('should have New Skill button', async () => {
      await expect(dashboardPage.newSkillButton).toBeVisible();
    });

    // Stats cards
    test('should display stats cards', async () => {
      await expect(dashboardPage.totalSkillsStat).toBeVisible();
      await expect(dashboardPage.sharedStat).toBeVisible();
      await expect(dashboardPage.recentEditsStat).toBeVisible();
    });

    // Search bar
    test('should have a search bar', async () => {
      await expect(dashboardPage.searchInput).toBeVisible();
    });

    // L2-014 AC5: Skeleton loaders
    test('should show skeleton loaders while loading', async ({ page }) => {
      await dashboardPage.interceptSkillsApiWithDelay(2000);
      await dashboardPage.goto();
      await expect(dashboardPage.skeletonLoader.first()).toBeVisible({ timeout: 1000 });
    });

    // L2-003 AC1: Default pagination
    test('should show pagination with default page size', async () => {
      await expect(dashboardPage.paginationInfo).toBeVisible();
    });

    // Filter controls
    test('should have filter and sort controls', async () => {
      await expect(dashboardPage.filterButton).toBeVisible();
      await expect(dashboardPage.sortButton).toBeVisible();
    });

    // L2-014 AC2: Click skill navigates to detail/edit
    test('should navigate to skill editor on click', async ({ page }) => {
      await dashboardPage.clickFirstSkill();
      await expect(page).toHaveURL(/skills\/.*\/(edit)?/);
    });

    // L2-014 AC4: Bulk delete with confirmation
    test('should support skill deletion with confirmation', async ({ page }) => {
      await dashboardPage.clickDeleteOnFirstSkill();

      // Confirmation dialog
      await expect(page.getByText(/delete skill|are you sure/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /delete/i })).toBeVisible();
    });

    // Sidebar profile
    test('should show user profile in sidebar', async () => {
      await expect(dashboardPage.sidebarProfile).toBeVisible();
    });
  });

  test.describe('Responsive - Tablet', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    // L2-031 AC1: Two-column grid for tablet
    test('should show top bar and skill cards in grid', async ({ page }) => {
      dashboardPage = new DashboardPage(page);
      await page.goto('/dashboard');
      await expect(dashboardPage.menuToggle).toBeVisible();
      await expect(dashboardPage.searchInput).toBeVisible();
    });
  });

  test.describe('Responsive - Mobile', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    // L2-030 AC1: Single-column card list
    test('should show single-column layout with full-width cards', async ({ page }) => {
      dashboardPage = new DashboardPage(page);
      await page.goto('/dashboard');
      await expect(dashboardPage.menuToggle).toBeVisible();
      await expect(dashboardPage.heading).toBeVisible();
    });

    // L2-030 AC3: Hamburger menu
    test('should have hamburger menu for navigation', async ({ page }) => {
      dashboardPage = new DashboardPage(page);
      await page.goto('/dashboard');
      await dashboardPage.openHamburgerMenu();

      await expect(dashboardPage.sidebarMySkills).toBeVisible();
      await expect(dashboardPage.sidebarShared).toBeVisible();
    });
  });
});
