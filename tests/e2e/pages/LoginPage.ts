import { type Locator, type Page, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly brandName: Locator;
  readonly heading: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly githubButton: Locator;
  readonly googleButton: Locator;
  readonly rememberMeCheckbox: Locator;
  readonly forgotPasswordLink: Locator;
  readonly signUpLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.brandName = page.getByText('SkillForge', { exact: true });
    this.heading = page.getByText('Welcome back');
    this.emailInput = page.getByLabel(/email/i);
    this.passwordInput = page.getByLabel(/password/i);
    this.signInButton = page.getByRole('button', { name: /sign in/i });
    this.githubButton = page.getByRole('button', { name: /github/i });
    this.googleButton = page.getByRole('button', { name: /google/i });
    this.rememberMeCheckbox = page.getByLabel(/remember me/i);
    this.forgotPasswordLink = page.getByText(/forgot password/i);
    this.signUpLink = page.getByText(/sign up/i);
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  async navigateToSignUp() {
    await this.signUpLink.click();
  }

  async expectValidationError() {
    await expect(this.page.getByText(/email.*required|invalid email/i)).toBeVisible();
  }

  async expectInvalidCredentialsError() {
    await expect(this.page.getByText(/invalid credentials|unauthorized/i)).toBeVisible();
  }

  async expectRedirectToDashboard() {
    await expect(this.page).toHaveURL(/dashboard/);
    await expect(this.page.getByText('Dashboard')).toBeVisible();
  }
}
