import { test, expect } from '@playwright/test';
import { LoginPage, DashboardPage, SkillEditorPage } from './pages';

// L2-001: Create a New Skill
// L2-002: Read a Single Skill
// L2-004: Update an Existing Skill
// L2-013: Code/Text Editor for Skill Authoring

test.describe('Skill Editor', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;
  let editorPage: SkillEditorPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    editorPage = new SkillEditorPage(page);
    await loginPage.goto();
    await loginPage.login('testuser@example.com', 'TestPassword123!');
    await expect(page).toHaveURL(/dashboard/);
  });

  test.describe('Create New Skill', () => {
    // L2-001 AC1: Create skill with name, description, body, tags
    test('should create a new skill', async ({ page }) => {
      await dashboardPage.clickNewSkill();
      await expect(page).toHaveURL(/skills\/new/);

      await editorPage.fillSkillForm('Test Skill', 'A test skill description');
      await expect(editorPage.editor).toBeVisible();

      await editorPage.save();
      await editorPage.expectCreatedSuccessfully();
    });

    // L2-001 AC2: Missing required field
    test('should reject creation with missing name', async () => {
      await dashboardPage.clickNewSkill();
      await editorPage.save();
      await editorPage.expectNameRequiredError();
    });

    // L2-001 AC4: Name exceeding 200 characters
    test('should reject name exceeding 200 characters', async () => {
      await dashboardPage.clickNewSkill();
      await editorPage.fillSkillForm('A'.repeat(201));
      await editorPage.save();
      await editorPage.expectNameTooLongError();
    });
  });

  test.describe('Editor Features', () => {
    // L2-013 AC1: Syntax highlighting
    test('should render editor with syntax highlighting', async () => {
      await dashboardPage.clickNewSkill();
      await expect(editorPage.editor).toBeVisible();
    });

    // L2-013 AC3: Ctrl+S save
    test('should save on Ctrl+S', async () => {
      await dashboardPage.clickNewSkill();
      await editorPage.fillSkillForm('Keyboard Save Test');
      await editorPage.saveWithKeyboard();
    });

    // L2-013 AC6: Status bar with line count, cursor position, char count
    test('should show status bar with editor info', async () => {
      await dashboardPage.clickNewSkill();
      await expect(editorPage.statusBar).toBeVisible();
      await expect(editorPage.lineColInfo).toBeVisible();
      await expect(editorPage.charCount).toBeVisible();
    });
  });

  test.describe('Edit Existing Skill', () => {
    // L2-004 AC1: Update skill fields
    test('should load skill data into editor', async () => {
      await dashboardPage.clickFirstSkill();
      await expect(editorPage.nameInput).not.toBeEmpty();
    });

    // Metadata bar with tags and visibility
    test('should show metadata bar with tags and visibility', async () => {
      await dashboardPage.clickFirstSkill();
      await editorPage.expectVisibilityBadge();
    });
  });

  test.describe('Desktop Split-Pane', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    // L2-031 AC3: Split-pane editor/preview for >=1200px
    test('should show split-pane with editor and preview', async ({ page }) => {
      editorPage = new SkillEditorPage(page);
      dashboardPage = new DashboardPage(page);
      await dashboardPage.clickNewSkill();

      await expect(editorPage.editor).toBeVisible();
      await expect(editorPage.previewPane).toBeVisible();
    });
  });

  test.describe('Responsive - Tablet Editor', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('should show editor with tabs (Editor/Preview)', async ({ page }) => {
      editorPage = new SkillEditorPage(page);
      await page.goto('/dashboard');
      await page.getByRole('button', { name: /new skill/i }).click();

      await expect(editorPage.editorTab).toBeVisible();
      await expect(editorPage.previewTab).toBeVisible();
    });
  });

  test.describe('Responsive - Mobile Editor', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('should show compact editor with tabs', async ({ page }) => {
      editorPage = new SkillEditorPage(page);
      await page.goto('/dashboard');
      await page.getByRole('button', { name: /new skill/i }).click();

      await expect(editorPage.backButton).toBeVisible();
    });
  });
});
