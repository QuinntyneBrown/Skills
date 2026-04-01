import { type Locator, type Page, expect } from '@playwright/test';

export class ShareDialog {
  readonly page: Page;
  readonly heading: Locator;
  readonly publicOption: Locator;
  readonly sharedOption: Locator;
  readonly privateOption: Locator;
  readonly emailInput: Locator;
  readonly shareWithPeopleSection: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByText(/share.*skill/i);
    this.publicOption = page.getByText('Public');
    this.sharedOption = page.getByText('Shared');
    this.privateOption = page.getByText('Private');
    this.emailInput = page.getByPlaceholder(/email/i);
    this.shareWithPeopleSection = page.getByText(/share with people/i);
    this.saveButton = page.getByRole('button', { name: /save|apply/i });
    this.cancelButton = page.getByRole('button', { name: /cancel/i });
  }
}
