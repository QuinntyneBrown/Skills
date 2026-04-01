import { type Locator, type Page, expect } from '@playwright/test';

export class DeleteDialog {
  readonly page: Page;
  readonly heading: Locator;
  readonly recoveryInfo: Locator;
  readonly cancelButton: Locator;
  readonly deleteButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByText(/delete skill/i);
    this.recoveryInfo = page.getByText(/soft.delete|recover/i);
    this.cancelButton = page.getByRole('button', { name: /cancel/i });
    this.deleteButton = page.getByRole('button', { name: 'Delete', exact: true });
  }

  async cancel() {
    await this.cancelButton.click();
  }

  async expectClosed() {
    await expect(this.page.getByText(/delete skill\?/i)).not.toBeVisible();
  }
}
