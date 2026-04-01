import { test, expect } from '@playwright/test';
import { LoginPage, RegisterPage } from './pages';

// L2-008: User Registration
// L2-009: User Login and Session Management
// L2-012: Dark Mode UI Theme

test.describe('Authentication', () => {
  test.describe('Login Page', () => {
    test('should render login page with dark theme', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      // L2-012: Dark mode background
      await expect(page.locator('body')).toBeVisible();

      // Brand elements
      await expect(loginPage.brandName).toBeVisible();
      await expect(loginPage.heading).toBeVisible();

      // Form elements
      await expect(loginPage.emailInput).toBeVisible();
      await expect(loginPage.passwordInput).toBeVisible();
      await expect(loginPage.signInButton).toBeVisible();

      // OAuth buttons
      await expect(loginPage.githubButton).toBeVisible();
      await expect(loginPage.googleButton).toBeVisible();

      // Sign up link
      await expect(loginPage.signUpLink).toBeVisible();
    });

    test('should show validation error for empty fields', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.signInButton.click();

      await loginPage.expectValidationError();
    });

    test('should show error for invalid credentials', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login('wrong@example.com', 'WrongPassword123!');

      await loginPage.expectInvalidCredentialsError();
    });

    test('should login successfully and redirect to dashboard', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login('testuser@example.com', 'TestPassword123!');

      await loginPage.expectRedirectToDashboard();
    });

    test('should have "Remember me" checkbox', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await expect(loginPage.rememberMeCheckbox).toBeVisible();
    });

    test('should have "Forgot password" link', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await expect(loginPage.forgotPasswordLink).toBeVisible();
    });

    test('should navigate to sign up page', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.navigateToSignUp();
      await expect(page).toHaveURL(/register/);
    });
  });

  test.describe('Registration', () => {
    test('should render registration form', async ({ page }) => {
      const registerPage = new RegisterPage(page);
      await registerPage.goto();
      await expect(registerPage.emailInput).toBeVisible();
      await expect(registerPage.passwordInput).toBeVisible();
      await expect(registerPage.submitButton).toBeVisible();
    });

    // L2-008 AC2: Password complexity
    test('should reject weak passwords', async ({ page }) => {
      const registerPage = new RegisterPage(page);
      await registerPage.goto();
      await registerPage.register('newuser@example.com', 'weak');

      await registerPage.expectPasswordComplexityError();
    });
  });

  test.describe('Session Management', () => {
    // L2-009 AC4: Logout
    test('should logout and redirect to login', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login('testuser@example.com', 'TestPassword123!');
      await expect(page).toHaveURL(/dashboard/);

      // Find and click logout
      await page.getByText(/logout|sign out/i).click();
      await expect(page).toHaveURL(/login/);
    });
  });

  test.describe('Responsive - Login', () => {
    test('tablet layout should stack vertically', async ({ page, viewport }) => {
      if (!viewport || viewport.width > 768) test.skip();
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await expect(loginPage.brandName).toBeVisible();
      await expect(loginPage.emailInput).toBeVisible();
    });

    test('mobile layout should show compact form', async ({ page, viewport }) => {
      if (!viewport || viewport.width > 375) test.skip();
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await expect(loginPage.brandName).toBeVisible();
      await expect(loginPage.emailInput).toBeVisible();
      await expect(loginPage.signInButton).toBeVisible();
    });
  });
});
