import { type Locator, type Page, expect } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly subtitle: Locator;

  // Sidebar
  readonly sidebarMySkills: Locator;
  readonly sidebarShared: Locator;
  readonly sidebarVersions: Locator;
  readonly sidebarSearch: Locator;
  readonly sidebarSettings: Locator;
  readonly sidebarProfile: Locator;

  // Table columns
  readonly columnName: Locator;
  readonly columnTags: Locator;
  readonly columnVisibility: Locator;
  readonly columnUpdated: Locator;
  readonly columnActions: Locator;

  // Actions
  readonly newSkillButton: Locator;
  readonly searchInput: Locator;
  readonly filterButton: Locator;
  readonly sortButton: Locator;

  // Stats
  readonly totalSkillsStat: Locator;
  readonly sharedStat: Locator;
  readonly recentEditsStat: Locator;

  // Pagination
  readonly paginationInfo: Locator;

  // Skeleton
  readonly skeletonLoader: Locator;

  // Responsive
  readonly menuToggle: Locator;

  // Rows
  readonly skillRows: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByText('Dashboard');
    this.subtitle = page.getByText(/manage and organize/i);

    this.sidebarMySkills = page.getByText('My Skills');
    this.sidebarShared = page.getByText('Shared with me');
    this.sidebarVersions = page.getByText('Versions');
    this.sidebarSearch = page.getByText('Search');
    this.sidebarSettings = page.getByText('Settings');
    this.sidebarProfile = page.locator('[data-testid="sidebar-profile"], .sidebar-profile');

    this.columnName = page.getByText('Name');
    this.columnTags = page.getByText('Tags');
    this.columnVisibility = page.getByText('Visibility');
    this.columnUpdated = page.getByText('Updated');
    this.columnActions = page.getByText('Actions');

    this.newSkillButton = page.getByRole('button', { name: /new skill/i });
    this.searchInput = page.getByPlaceholder(/search.*skill|name.*tag.*keyword/i);
    this.filterButton = page.getByRole('button', { name: /filter/i });
    this.sortButton = page.getByRole('button', { name: /sort/i });

    this.totalSkillsStat = page.getByText('Total Skills');
    this.sharedStat = page.getByText('Shared');
    this.recentEditsStat = page.getByText('Recent Edits');

    this.paginationInfo = page.getByText(/showing|page/i);

    this.skeletonLoader = page.locator('[data-testid="skeleton-loader"], .skeleton, [class*="skeleton"]');

    this.menuToggle = page.locator('[data-testid="menu-toggle"], button[aria-label*="menu"]');

    this.skillRows = page.locator('table tbody tr, [data-testid="skill-row"]');
  }

  async goto() {
    await this.page.goto('/dashboard');
  }

  async clickFirstSkill() {
    await this.skillRows.first().click();
  }

  async clickNewSkill() {
    await this.newSkillButton.click();
  }

  async searchSkills(query: string) {
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
  }

  async clickDeleteOnFirstSkill() {
    const deleteBtn = this.page.locator('[data-testid="delete-action"], button[aria-label*="delete"]').first();
    await deleteBtn.click();
  }

  async openHamburgerMenu() {
    await this.menuToggle.click();
  }

  async interceptSkillsApiWithDelay(delayMs: number) {
    await this.page.route('**/api/v1/skills*', async (route) => {
      await new Promise((r) => setTimeout(r, delayMs));
      await route.continue();
    });
  }
}
