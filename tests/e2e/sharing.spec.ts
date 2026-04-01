import { test, expect } from '@playwright/test';
import { LoginPage, DashboardPage, SkillEditorPage, ShareDialog, DeleteDialog } from './pages';

// L2-011: Skill Sharing and Visibility
// L2-005: Delete a Skill

test.describe('Sharing & Dialogs', () => {
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

  test.describe('Share Dialog', () => {
    async function openShareDialog(page: import('@playwright/test').Page) {
      const dashboard = new DashboardPage(page);
      await dashboard.clickFirstSkill();
      const editor = new SkillEditorPage(page);
      await editor.shareButton.click();
    }

    // L2-011 AC1: Set visibility
    test('should open share dialog with visibility options', async ({ page }) => {
      await openShareDialog(page);
      const shareDialog = new ShareDialog(page);

      await expect(shareDialog.heading).toBeVisible();
      await expect(shareDialog.publicOption).toBeVisible();
      await expect(shareDialog.sharedOption).toBeVisible();
      await expect(shareDialog.privateOption).toBeVisible();
    });

    // L2-011 AC2: Share with specific users
    test('should allow sharing with users by email', async ({ page }) => {
      await openShareDialog(page);
      const shareDialog = new ShareDialog(page);

      await expect(shareDialog.emailInput).toBeVisible();
    });

    test('should show shared users list', async ({ page }) => {
      await openShareDialog(page);
      const shareDialog = new ShareDialog(page);

      await expect(shareDialog.shareWithPeopleSection).toBeVisible();
    });

    test('should have save and cancel buttons', async ({ page }) => {
      await openShareDialog(page);
      const shareDialog = new ShareDialog(page);

      await expect(shareDialog.saveButton).toBeVisible();
      await expect(shareDialog.cancelButton).toBeVisible();
    });
  });

  test.describe('Delete Confirmation Dialog', () => {
    // L2-005 AC1: Soft delete with confirmation
    test('should show delete confirmation dialog', async ({ page }) => {
      await dashboardPage.clickDeleteOnFirstSkill();
      const deleteDialog = new DeleteDialog(page);

      await expect(deleteDialog.heading).toBeVisible();
      await expect(deleteDialog.recoveryInfo).toBeVisible();
      await expect(deleteDialog.cancelButton).toBeVisible();
      await expect(deleteDialog.deleteButton).toBeVisible();
    });

    test('should cancel deletion when clicking cancel', async ({ page }) => {
      await dashboardPage.clickDeleteOnFirstSkill();
      const deleteDialog = new DeleteDialog(page);

      await deleteDialog.cancel();
      await deleteDialog.expectClosed();
    });
  });
});
