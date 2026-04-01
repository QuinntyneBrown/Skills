import { type Locator, type Page, expect } from '@playwright/test';

export class SkillEditorPage {
  readonly page: Page;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly editor: Locator;
  readonly saveButton: Locator;
  readonly statusBar: Locator;
  readonly lineColInfo: Locator;
  readonly charCount: Locator;
  readonly previewPane: Locator;
  readonly editorTab: Locator;
  readonly previewTab: Locator;
  readonly backButton: Locator;
  readonly shareButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nameInput = page.getByLabel(/name/i);
    this.descriptionInput = page.getByLabel(/description/i);
    this.editor = page.locator('.monaco-editor, [data-testid="skill-editor"], textarea[name="body"]');
    this.saveButton = page.getByRole('button', { name: /save|create/i });
    this.statusBar = page.locator('[data-testid="editor-status"], .editor-status, .status-bar');
    this.lineColInfo = page.getByText(/ln.*col|line.*column/i);
    this.charCount = page.getByText(/chars|characters/i);
    this.previewPane = page.locator('[data-testid="preview-pane"], .preview-pane');
    this.editorTab = page.getByRole('tab', { name: /editor/i });
    this.previewTab = page.getByRole('tab', { name: /preview/i });
    this.backButton = page.locator('[data-testid="back-button"], button[aria-label*="back"]');
    this.shareButton = page.getByRole('button', { name: /share/i });
  }

  async gotoNew() {
    await this.page.goto('/skills/new');
  }

  async fillSkillForm(name: string, description?: string) {
    await this.nameInput.fill(name);
    if (description) {
      await this.descriptionInput.fill(description);
    }
  }

  async save() {
    await this.saveButton.click();
  }

  async saveWithKeyboard() {
    await this.page.keyboard.press('Control+s');
  }

  async expectCreatedSuccessfully() {
    await expect(this.page.getByText(/created|saved/i)).toBeVisible();
  }

  async expectNameRequiredError() {
    await expect(this.page.getByText(/name.*required|required.*name/i)).toBeVisible();
  }

  async expectNameTooLongError() {
    await expect(this.page.getByText(/200 characters|too long/i)).toBeVisible();
  }

  async expectVisibilityBadge() {
    await expect(this.page.getByText(/public|private|shared/i).first()).toBeVisible();
  }
}
