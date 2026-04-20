const { test, expect } = require('@playwright/test');

// ── Homepage ──────────────────────────────────────────────────────────────────

test.describe('Homepage', () => {
  test('loads with correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/BlogsPro/);
  });

  test('hero section is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero h1')).toBeVisible();
    await expect(page.locator('.hero .btn-primary')).toBeVisible();
  });

  test('navigation renders with brand and links', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav .nav-brand')).toHaveText('BlogsPro');
    await expect(page.locator('nav a[href="#briefings"]')).toBeVisible();
    await expect(page.locator('nav a[href="#about"]')).toBeVisible();
  });

  test('briefings section has filter chips and search input', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#briefings')).toBeVisible();
    await expect(page.locator('.filter-chip')).toHaveCount(6);
    await expect(page.locator('#postSearch')).toBeVisible();
  });

  test('newsletter section renders with email input', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#newsletter')).toBeVisible();
    await expect(page.locator('#emailInput')).toBeVisible();
  });
});

// ── Filter interaction ────────────────────────────────────────────────────────

test.describe('Filter chips', () => {
  test('no ReferenceError when clicking a filter after module loads', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.goto('/');
    // Wait for Firebase module to finish registering window.filterByCategory
    await page.waitForFunction(
      () => typeof window.filterByCategory === 'function',
      { timeout: 20_000 }
    );

    await page.locator('.filter-chip[data-cat="macro"]').click();

    const filterErrors = jsErrors.filter(msg =>
      msg.includes('filterByCategory') || msg.includes('handleSearch') || msg.includes('renderPosts')
    );
    expect(filterErrors).toHaveLength(0);
  });

  test('active chip updates after click', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => typeof window.filterByCategory === 'function',
      { timeout: 20_000 }
    );

    const macroChip = page.locator('.filter-chip[data-cat="macro"]');
    await macroChip.click();
    await expect(macroChip).toHaveClass(/active/);
  });
});

// ── Auth pages ────────────────────────────────────────────────────────────────

test.describe('Auth pages', () => {
  test('login page returns 200', async ({ page }) => {
    const response = await page.goto('/login.html');
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveTitle(/Login|BlogsPro/i);
  });

  test('register page returns 200', async ({ page }) => {
    const response = await page.goto('/register.html');
    expect(response?.status()).toBeLessThan(400);
  });
});

// ── Mobile viewport ───────────────────────────────────────────────────────────

test.describe('Mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('hamburger menu button is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#navHamburger')).toBeVisible();
  });

  test('nav links hidden before hamburger tap', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#navLinksMenu')).not.toHaveClass(/mobile-open/);
  });
});
