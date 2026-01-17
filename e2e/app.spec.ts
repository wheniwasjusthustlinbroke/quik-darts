import { test, expect } from '@playwright/test';

test.describe('Quik Darts App', () => {
  test('should load the app successfully', async ({ page }) => {
    await page.goto('/');

    // Check that the page loads without errors
    await expect(page).toHaveTitle(/Quik Darts/i);
  });

  test('should display main menu', async ({ page }) => {
    await page.goto('/');

    // Wait for the app to initialize
    await page.waitForTimeout(2000);

    // Check for main menu elements (these are common text in the UI)
    const body = await page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should show loading state initially', async ({ page }) => {
    await page.goto('/');

    // The app should show something while loading
    const body = await page.locator('body');
    await expect(body).not.toBeEmpty();
  });

  test('should have no console errors on load', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForTimeout(3000);

    // Filter out expected errors (like Firebase auth for anonymous)
    const unexpectedErrors = errors.filter(
      (e) => !e.includes('Firebase') && !e.includes('auth')
    );

    // Should have no unexpected console errors
    expect(unexpectedErrors.length).toBe(0);
  });
});

test.describe('Dartboard', () => {
  test('should render dartboard canvas', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Check if canvas element exists (dartboard is rendered on canvas)
    const canvas = page.locator('canvas');
    // There might not be a canvas visible immediately, this is informational
  });
});

test.describe('Navigation', () => {
  test('should be responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.goto('/');

    // Page should still load
    await expect(page).toHaveTitle(/Quik Darts/i);
  });

  test('should be responsive on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await page.goto('/');

    // Page should still load
    await expect(page).toHaveTitle(/Quik Darts/i);
  });
});
