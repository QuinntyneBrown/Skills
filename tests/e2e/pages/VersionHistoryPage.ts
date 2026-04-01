import { type Locator, type Page, expect } from '@playwright/test';

export class VersionHistoryPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly versionList: Locator;
  readonly diffViewer: Locator;
  readonly diffAdditions: Locator;
  readonly diffDeletions: Locator;
  readonly restoreButton: Locator;
  readonly diffStats: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByText(/version history/i);
    this.versionList = page.getByText(/v\d+|version \d+/i).first();
    this.diffViewer = page.locator('[data-testid="diff-viewer"], .diff-viewer');
    this.diffAdditions = page.locator('[data-testid="diff-addition"], .diff-add, .line-added');
    this.diffDeletions = page.locator('[data-testid="diff-deletion"], .diff-remove, .line-removed');
    this.restoreButton = page.getByRole('button', { name: /restore/i });
    this.diffStats = page.getByText(/addition|deletion/i).first();
  }

  async expectDiffVisible() {
    await expect(this.page.getByText(/comparing|diff|changes/i).first()).toBeVisible();
  }
}
